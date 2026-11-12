"""Bake local crevice occlusion into GLB vertex colors, using Blender's BVH."""
import bpy, json, struct, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def bake_view_ao(path):
 positions=[];triangles=[]
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH' or obj.name.startswith('DISPLAY_'):continue
  if obj.data.materials and 'glazing' in obj.data.materials[0].name.lower():continue
  obj.data.calc_loop_triangles();offset=len(positions)
  positions.extend([obj.matrix_world@v.co for v in obj.data.vertices])
  triangles.extend([tuple(offset+i for i in t.vertices)for t in obj.data.loop_triangles])
 bvh=BVHTree.FromPolygons(positions,triangles,all_triangles=True)
 raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
 g=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:])
 def array(index):
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
  return np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).copy()
 baked=0
 for node in g['nodes']:
  if 'mesh' not in node or node.get('name','').startswith('DISPLAY_'):continue
  obj=bpy.data.objects.get(node.get('name',''))
  if not obj or (obj.data.materials and 'glazing' in obj.data.materials[0].name.lower()):continue
  normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
  for primitive in g['meshes'][node['mesh']]['primitives']:
   pos=array(primitive['attributes']['POSITION']);normals=array(primitive['attributes']['NORMAL']);colors=[]
   for p,n in zip(pos,normals):
    point=obj.matrix_world@Vector((float(p[0]),-float(p[2]),float(p[1])))
    normal=(normal_matrix@Vector((float(n[0]),-float(n[2]),float(n[1])))).normalized()
    tangent=normal.cross(Vector((0,0,1)) if abs(normal.z)<.9 else Vector((0,1,0))).normalized()
    bitangent=normal.cross(tangent);hits=0
    for j in range(10):
     r=math.sqrt((j+.5)/10);a=j*2.3999632297
     direction=normal*math.sqrt(1-r*r)+tangent*(r*math.cos(a))+bitangent*(r*math.sin(a))
     hit,_,_,distance=bvh.ray_cast(point+normal*.0025,direction,.28)
     if hit is not None:hits+=max(0,1-distance/.28)
    shade=.43+.57*math.sqrt(max(0,1-hits/10))
    colors.append([shade,shade,shade,1])
   binary+=b'\0'*(-len(binary)%4);view=len(g['bufferViews'])
   data=np.asarray(colors,dtype='<f4').tobytes()
   g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data),'target':34962});binary+=data
   index=len(g['accessors']);g['accessors'].append({'bufferView':view,'componentType':5126,'count':len(colors),'type':'VEC4'})
   primitive['attributes']['COLOR_0']=index;baked+=len(colors)
 g['buffers'][0]['byteLength']=len(binary)
 j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
 print('BAKED_CREVICE_AO',path.name,baked,flush=True)
