"""Derive a compact tactical reload from the Blender-baked empty reload.
Shares the skeleton/mesh and keeps the first magazine exchange unchanged.
"""
import numpy as np

def finish_reload_clips(g,binary):
 if any(a.get('name')=='reload_empty' for a in g.get('animations',[])):return
 if not g.get('animations'):return
 full={'name':'reload_empty','channels':[],'samplers':[]}
 # Blender exports scene animation per object. Merge armature and magazine
 # channels into one action; playing only the arm clip leaves the mag frozen.
 for source in g['animations']:
  offset=len(full['samplers']);full['samplers'].extend(source['samplers'])
  for channel in source['channels']:
   full['channels'].append({'sampler':channel['sampler']+offset,'target':dict(channel['target'])})
 def read(index):
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
  width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
  return np.frombuffer(binary,dtype='<f4',count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width).copy()
 def append(values,kind):
  values=np.asarray(values,dtype='<f4');binary.extend(b'\0'*(-len(binary)%4))
  view=len(g['bufferViews']);data=values.tobytes()
  g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data)
  index=len(g['accessors']);a={'bufferView':view,'componentType':5126,'count':len(values),'type':kind}
  if kind=='SCALAR':a.update(min=[float(values.min())],max=[float(values.max())])
  g['accessors'].append(a);return index
 def mix(a,b,t,rotation):
  if rotation and np.dot(a,b)<0:b=-b
  v=a*(1-t)+b*t
  return v/max(1e-8,np.linalg.norm(v))if rotation else v
 # Blender starts scene samples on frame 1. Normalize to t=0 so clip length
 # and gameplay reload completion agree exactly, including the first frame.
 origin=min(float(read(s['input'])[0,0])for s in full['samplers']);normalized={}
 for sampler in full['samplers']:
  old=sampler['input']
  if old not in normalized:normalized[old]=append(read(old)-origin,'SCALAR')
  sampler['input']=normalized[old]
 times=np.linspace(0,2.2,67,dtype=np.float32);input_index=append(times.reshape(-1,1),'SCALAR')
 constant_input=append([[0],[2.2]],'SCALAR')
 tactical={'name':'reload','channels':[],'samplers':[]}
 for channel in full['channels']:
  sampler=full['samplers'][channel['sampler']]
  interpolation=sampler.get('interpolation','LINEAR')
  if interpolation not in ['LINEAR','STEP']:raise ValueError('Reload must be baked to linear samples')
  old_time=read(sampler['input']).reshape(-1);old_values=read(sampler['output'])
  rotation=channel['target']['path']=='rotation'
  def sample(t):
   if t<=old_time[0]:return old_values[0]
   if t>=old_time[-1]:return old_values[-1]
   i=int(np.searchsorted(old_time,t))-1
   if interpolation=='STEP':return old_values[i]
   return mix(old_values[i],old_values[i+1],float((t-old_time[i])/(old_time[i+1]-old_time[i])),rotation)
  start,end=sample(1.7),sample(2.7);values=[]
  for t in times:
   u=max(0,min(1,(float(t)-1.7)/.5));ease=u*u*(3-2*u)
   values.append(sample(float(t))if t<=1.7 else mix(start,end,ease,rotation))
  constant=np.allclose(old_values,old_values[0],atol=1e-6)
  if constant:values=[old_values[0],old_values[0]]
  output=append(values,'VEC4'if rotation else'VEC3')
  tactical['channels'].append({'sampler':len(tactical['samplers']),'target':dict(channel['target'])})
  tactical['samplers'].append({'input':constant_input if constant else input_index,'output':output,'interpolation':'LINEAR'})
 g['animations']=[tactical,full]
