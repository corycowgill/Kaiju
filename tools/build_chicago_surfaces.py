"""Blender material-authoring pipeline: derive tiled albedo/micro maps.
Run: blender -b --python tools/build_chicago_surfaces.py
"""
import bpy,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/textures'
source=bpy.data.images.load(str(ROOT/'art/chicago/surface_atlas.png'))
w,h=source.size;p=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(p);p=p.reshape(h,w,4)
def save(name,data,fmt='PNG'):
 h,w=data.shape[:2];im=bpy.data.images.new(name,width=w,height=h)
 if '_normal' in name or '_roughness' in name:im.colorspace_settings.name='Non-Color'
 im.pixels.foreach_set(np.ascontiguousarray(data).reshape(-1));im.filepath_raw=str(OUT/name);im.file_format=fmt;im.save();bpy.data.images.remove(im)
for name,(x,y),rough,strength in [('grass',(0,1),.93,2.0),('pavement',(1,1),.85,.65),('asphalt',(0,0),.94,.9),('canvas',(1,0),.88,.4)]:
 tile=p[y*(h//2):(y+1)*(h//2),x*(w//2):(x+1)*(w//2)].copy()
 # Material tiles use periodic edge blending; no visible hard border at repeats.
 for axis in [0,1]:
  tile=np.moveaxis(tile,axis,0);n=len(tile);edge=max(8,n//16)
  for k in range(edge):
   t=(1-k/edge)**2*.5;a=tile[k].copy();b=tile[-1-k].copy()
   tile[k]=a*(1-t)+b*t;tile[-1-k]=b*(1-t)+a*t
  tile=np.moveaxis(tile,0,axis)
 image=bpy.data.images.new('resample',width=tile.shape[1],height=tile.shape[0]);image.pixels.foreach_set(np.ascontiguousarray(tile).reshape(-1));image.scale(512,512)
 data=np.empty(512*512*4,dtype=np.float32);image.pixels.foreach_get(data);data=data.reshape(512,512,4);bpy.data.images.remove(image)
 save('chi_'+name+'_color.jpg',data,'JPEG')
 # Luminance supplies fine relief only, not large-scale geometry or lighting.
 lum=data[:,:,:3].mean(axis=2);small=lum.reshape(128,4,128,4).mean(axis=(1,3))
 dx=(np.roll(small,-1,1)-np.roll(small,1,1))*strength;dy=(np.roll(small,-1,0)-np.roll(small,1,0))*strength
 normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
 rgba=np.ones((128,128,4),dtype=np.float32);rgba[:,:,:3]=normal*.5+.5;save('chi_'+name+'_normal.png',rgba)
 rgba[:,:,:3]=np.clip(rough+(small-small.mean())*.12,.65,.99)[:,:,None];save('chi_'+name+'_roughness.png',rgba)
print('CHICAGO_SURFACES_EXPORTED',flush=True)
