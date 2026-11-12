"""Anatomy-constrained skin refinement for the shipped crowd LODs.
Keeps geometry, UVs, textures, canonical inverse binds and shared clips intact.
Run --person 1 first for review, then without --person for all nine variants.
"""
from pathlib import Path
import argparse,json,struct,shutil
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/enemies/festival'
BACKUP=ROOT.parent/'crowd_build/skin_before';BACKUP.mkdir(parents=True,exist_ok=True)
args=argparse.ArgumentParser();args.add_argument('--person',type=int,choices=range(1,10));opts=args.parse_args()
def read(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
 return raw,json.loads(raw[20:20+n]),bytearray(raw[28+n:]),n
def values(g,b,index,width):
 a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
 return np.frombuffer(b,dtype='<f4'if a['componentType']==5126 else'<u2',count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
reports=[]
for person in range(1,10):
 if opts.person and person!=opts.person:continue
 _,g,b,_=read(OUT/f'person_{person:02d}_near.glb');p=g['meshes'][0]['primitives'][0]['attributes'];points=values(g,b,p['POSITION'],3).copy()
 # Fit each body's chest width, not another model's nearest surface. Clothing
 # volume remains in the original mesh, while joint transitions stay smooth.
 torso=points[(points[:,1]>1.04)&(points[:,1]<1.23)]
 width=float(np.clip(np.quantile(np.abs(torso[:,0]),.92),.17,.27))
 profile={'id':f'person_{person:02d}','torsoHalfWidth':round(width,5),'pelvisFit':'broad shirt hem' if person==5 else 'standard','lods':[]}
 for lod in ['near','far','distant']:
  path=OUT/f'person_{person:02d}_{lod}.glb'
  if not (BACKUP/path.name).exists():shutil.copyfile(path,BACKUP/path.name)
  raw,g,b,n=read(path);p=g['meshes'][0]['primitives'][0]['attributes'];pos=values(g,b,p['POSITION'],3).copy()
  names=[g['nodes'][i]['name'].split(':')[-1]for i in g['skins'][0]['joints']];bone={name:i for i,name in enumerate(names)}
  w=np.zeros((len(pos),len(names)),dtype=np.float64);x=pos[:,0];y=pos[:,1];ax=np.abs(x)
  # Longitudinal torso weights. No finger/head-tip/end bones can leak into
  # clothing; these meshes don't have the topology to articulate fingers.
  anchors=[('Hips',.96),('Spine',1.07),('Spine1',1.19),('Spine2',1.32),('Neck',1.415),('Head',1.49)]
  index=np.clip(np.searchsorted([v for _,v in anchors],y)-1,0,len(anchors)-2)
  for j in range(len(anchors)-1):
   take=index==j;t=smooth(anchors[j][1],anchors[j+1][1],y[take])
   w[take,bone[anchors[j][0]]]=1-t;w[take,bone[anchors[j+1][0]]]=t
  # Shirt collars and shoulder caps can sit at neck height; their lateral
  # vertices must follow the chest rather than the turning head.
  collar=smooth(.085,.15,ax)*(1-smooth(1.44,1.49,y))
  for joint in ['Neck','Head']:
   amount=w[:,bone[joint]]*collar;w[:,bone[joint]]-=amount;w[:,bone['Spine2']]+=amount
  # Hip seat bridges remain attached to the pelvis while thighs separate.
  # This prevents the narrow crotch triangles produced by scan remeshing
  # from being pulled abruptly between opposite running legs.
  leg_total=(1-smooth(.67,.98,y))*(1-np.exp(-(x/.090)**2)*smooth(.35,.72,y)) if person==5 else (1-smooth(.78,.95,y))*(1-np.exp(-(x/.075)**2)*smooth(.50,.78,y))
  w*=1-leg_total[:,None]
  for side,mask,knee,wrist in [('Left',x>=0,.508,.642),('Right',x<0,.506,.639)]:
   take=np.where(mask)[0];t=smooth(knee-.075,knee+.075,y[take]);foot=1-smooth(.14,.23,y[take])
   w[take,bone[side+'UpLeg']]+=leg_total[take]*t
   w[take,bone[side+'Leg']]+=leg_total[take]*(1-t)*(1-foot)
   w[take,bone[side+'Foot']]+=leg_total[take]*(1-t)*foot
  # Smooth chest-to-sleeve attachment and elbow/wrist bands, calibrated from
  # this person's chest width. Mirrored sides retain the reference joints.
  arm=smooth(width-.045,width+.070,ax)*smooth(1.10,1.27,y)
  w*=1-arm[:,None]
  for side,mask,elbow,wrist in [('Left',x>=0,.415,.642),('Right',x<0,.393,.639)]:
   take=np.where(mask)[0];e=smooth(elbow-.060,elbow+.060,ax[take]);hand=smooth(wrist-.050,wrist+.050,ax[take])
   w[take,bone[side+'Arm']]+=arm[take]*(1-e)
   w[take,bone[side+'ForeArm']]+=arm[take]*e*(1-hand)
   w[take,bone[side+'Hand']]+=arm[take]*hand
  joints=np.argsort(-w,axis=1,kind='stable')[:,:4]
  weights=np.take_along_axis(w,joints,axis=1);weights/=np.maximum(weights.sum(axis=1,keepdims=True),1e-12)
  values(g,b,p['JOINTS_0'],4)[:]=joints.astype('<u2');values(g,b,p['WEIGHTS_0'],4)[:]=weights.astype('<f4')
  # The JSON layout and texture URLs remain byte-identical; only weights and
  # joint indices change, so no texture rebake or new animation data is needed.
  path.write_bytes(raw[:28+n]+b)
  profile['lods'].append({'lod':lod,'vertices':len(pos),'influences':int(np.sum(weights>1e-5))})
 reports.append(profile)
profile_file=OUT/'skin_profiles.json'
if opts.person and profile_file.exists():
 previous=json.loads(profile_file.read_text())['profiles']
 reports=sorted([p for p in previous if p['id']!=reports[0]['id']]+reports,key=lambda p:p['id'])
profile_file.write_text(json.dumps({'method':'anatomy-constrained smooth weights; rigid low-poly hands','profiles':reports},indent=2))
print(json.dumps(reports,indent=2))
