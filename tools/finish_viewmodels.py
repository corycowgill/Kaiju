"""Deduplicate exported GLB textures and repair degenerate normals.
The three view models share one generated instrument/wear atlas on disk.
Run after the Blender builders, then make_asset_manifest.mjs.
"""
from pathlib import Path
import json,struct,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/viewmodels'
report=[]
used_textures=set()
for role in ['infantry','tank','helicopter']:
 path=OUT/f'{role}_view.glb';raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
 g=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:])
 if role=='infantry':
  for animation in g.get('animations',[]):animation['name']='reload'
 # Material separation uses glTF factors so all roles still share albedo maps.
 # Values are linear RGB, deliberately avoiding an identical green metal/leather look.
 palette={
  'Parkerized graphite steel':(.16,.19,.23,.58,.40),
  'Machined worn rail edges':(.38,.42,.46,.82,.32),
  'Worn olive polymer':(.29,.25,.17,0,.78),
  'Rubber grips and gloves':(.12,.105,.085,0,.90),
  'Reinforced glove panels':(.27,.23,.18,0,.85),
  'Woven tactical sleeve':(.52,.43,.30,0,.94),
  'Weathered painted cockpit structure':(.29,.32,.33,.32,.56),
  'Worn satin alloy hardware':(.55,.57,.59,.78,.34),
  'Olive cabin interior panels':(.42,.43,.33,.08,.78),
  'Soft textured leather gloves':(.12,.105,.085,0,.90),
  'Reinforced leather glove stitching':(.28,.23,.18,0,.86),
  'Woven flight suit sleeve':(.48,.43,.31,0,.94),
 }
 for material in g.get('materials',[]):
  if material.get('name') in palette:
   r,gg,b,metal,rough=palette[material['name']];p=material['pbrMetallicRoughness']
   p['baseColorFactor']=[r,gg,b,1];p['metallicFactor']=metal;p['roughnessFactor']=1 if 'metallicRoughnessTexture' in p else rough
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   a=g['accessors'][p['attributes']['NORMAL']];view=g['bufferViews'][a['bufferView']]
   normals=np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
   lengths=np.linalg.norm(normals,axis=1);bad=(~np.isfinite(lengths))|(lengths<1e-6)
   normals[bad]=[0,1,0];normals[~bad]/=lengths[~bad,None]
   if 'min' in a:a['min']=normals.min(axis=0).tolist()
   if 'max' in a:a['max']=normals.max(axis=0).tolist()
 image_views=set()
 for image in g.get('images',[]):
  if 'bufferView' not in image:continue
  i=image.pop('bufferView');image_views.add(i);v=g['bufferViews'][i]
  data=bytes(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
  ext='jpg' if image['mimeType']=='image/jpeg' else 'png'
  name=f'viewtex_{hashlib.sha1(data).hexdigest()[:12]}.{ext}'
  (OUT/name).write_bytes(data);image['uri']=name
 views=[];packed=bytearray();mapping={}
 for i,view in enumerate(g['bufferViews']):
  if i in image_views:continue
  packed+=b'\0'*(-len(packed)%4);v=dict(view);mapping[i]=len(views)
  v['byteOffset']=len(packed);packed+=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];views.append(v)
 for a in g['accessors']:
  if 'bufferView' in a:a['bufferView']=mapping[a['bufferView']]
 g['bufferViews']=views;g['buffers']=[{'byteLength':len(packed)}]
 j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4);packed+=b'\0'*(-len(packed)%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(packed))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(packed),0x004e4942)+packed)
 triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes']for p in m['primitives'])
 report.append({'role':role,'bytes':path.stat().st_size,'triangles':triangles,'primitives':sum(len(m['primitives'])for m in g['meshes']),'textures':[i['uri']for i in g.get('images',[])]})
 used_textures.update(i['uri']for i in g.get('images',[]))
for texture in OUT.glob('viewtex_*'):
 if texture.is_file() and texture.name not in used_textures:texture.unlink()
(OUT/'lone_view_manifest.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
