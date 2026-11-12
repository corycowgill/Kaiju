"""Shared close-up PBR paint, leather and fabric materials for Blender."""
import bpy, math, random, numpy as np

def material_tile(atlas,tile):
 name='Material albedo '+atlas.name+' '+str(tuple(tile))
 cached=bpy.data.images.get(name)
 if cached:return cached
 width,height=atlas.size;pixels=np.empty(width*height*4,dtype=np.float32);atlas.pixels.foreach_get(pixels)
 pixels=pixels.reshape(height,width,4);tw=width//2;th=height//2;x,y=tile
 # The leather scan includes an edge seam: use its uninterrupted grain field.
 sw=int(tw*.76) if tile==[1,1] else tw
 cropped=np.ascontiguousarray(pixels[y*th:y*th+th,x*tw:x*tw+sw])
 image=bpy.data.images.new(name,width=sw,height=th)
 image.pixels.foreach_set(cropped.reshape(-1));image.pack()
 return image

def make_surface(name,atlas,tile,metal,rough,kind):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=material_tile(atlas,tile)
 m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 m['uv_metres']={'paint':.24,'leather':.16,'woven':.24}[kind]
 # True normal/roughness textures, not painted lighting. Fine material detail
 # remains inexpensive at close range; the albedo comes from generated scans.
 rng=random.Random({'woven':91,'leather':93,'paint':95}[kind])
 size=128;normal=bpy.data.images.new(kind+' micro normal',width=size,height=size)
 normal.colorspace_settings.name='Non-Color';roughness=bpy.data.images.new(kind+' roughness',width=size,height=size)
 roughness.colorspace_settings.name='Non-Color';normals=[];values=[]
 for yy in range(size):
  for xx in range(size):
   if kind=='woven':
    dx=.20*math.sin(xx*math.pi/3)*math.cos(yy*math.pi/3)
    dy=.20*math.cos(xx*math.pi/3)*math.sin(yy*math.pi/3)
   elif kind=='leather':
    dx=.11*math.sin(xx*1.91+math.sin(yy*.7)*2)
    dy=.11*math.cos(yy*1.87+math.sin(xx*.9)*2)
   else:
    dx=rng.uniform(-.04,.04);dy=rng.uniform(-.04,.04)
   z=math.sqrt(max(.01,1-dx*dx-dy*dy));normals.extend([dx*.5+.5,dy*.5+.5,z*.5+.5,1])
   r=max(.15,min(.98,rough+rng.uniform(-.05,.05)+.06*math.sin(xx*.09)*math.sin(yy*.08)))
   values.extend([r,r,r,1])
 normal.pixels=normals;normal.pack();roughness.pixels=values;roughness.pack()
 nt=m.node_tree.nodes.new('ShaderNodeTexImage');nt.image=normal
 rn=m.node_tree.nodes.new('ShaderNodeTexImage');rn.image=roughness
 bump=m.node_tree.nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.38
 m.node_tree.links.new(nt.outputs['Color'],bump.inputs['Color'])
 p=m.node_tree.nodes.get('Principled BSDF');m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
 m.node_tree.links.new(rn.outputs['Color'],p.inputs['Roughness'])
 return m
