"""Blender-authored, GPU-articulated festival crowd mesh and editable source."""
import bpy, math, json, os
from mathutils import Vector
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'assets','viewmodels')
os.makedirs(OUT,exist_ok=True)
def V(x,y,z):return (x,-z,y)
cloth=(.82,.85,.83);skin=(.69,.46,.31);denim=(.09,.13,.19);shoe=(.055,.06,.065);hair=(.075,.052,.035)
parts=[]
materials={}
def finish(o,name,color,limb=0,pivot=0,joint=0,jp=0,mask=0,sm=0):
 o.name=name
 if color not in materials:
  m=bpy.data.materials.new(name+' material');m.diffuse_color=(*color,1);materials[color]=m
 o.data.materials.append(materials[color])
 for p in o.data.polygons:p.use_smooth=True
 parts.append((o,color,limb,pivot,joint,jp,mask,sm))
 return o
def tube(name,rings,color,limb=0,pivot=0,joint=0,jp=0,mask=0,sm=0,n=8):
 vertices=[]
 for x,y,z,rx,rz in rings:
  for i in range(n):
   a=i/n*math.tau;vertices.append(V(x+math.cos(a)*rx,y,z+math.sin(a)*rz))
 faces=[]
 for j in range(len(rings)-1):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 faces.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+i for i in range(n))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],[tuple(reversed(f)) for f in faces]);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 return finish(o,name,color,limb,pivot,joint,jp,mask,sm)
def ell(name,p,scale,color,limb=0,pivot=0,joint=0,jp=0,mask=0,sm=0,seg=8,rings=5):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=V(*p));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,color,limb,pivot,joint,jp,mask,sm)
# Human proportions: shoulder line, tapered waist, separate limbs and shoes.
tube('Tailored shirt',[(0,.88,0,.14,.085),(0,1.12,0,.16,.095),(0,1.38,0,.215,.10),(0,1.43,0,.15,.085)],cloth,mask=1)
tube('Trouser hips',[(0,.79,0,.145,.085),(0,.94,0,.15,.085)],denim)
for side in [-1,1]:
 x=side*.087
 tube('Upper trouser leg',[(x,.45,0,.06,.065),(x,.82,0,.077,.083)],denim,side,.85,n=6)
 tube('Lower trouser leg',[(x,.09,.005,.049,.05),(x,.45,0,.06,.065)],denim,side,.85,side,.45,n=6)
 ell('Sneaker', (x,.065,.05),(.06,.055,.13),shoe,side,.85,side,.45,seg=8,rings=4)
 ax=side*.232
 tube('Short sleeve',[(ax,1.18,0,.065,.065),(side*.21,1.39,0,.074,.075)],cloth,-side*2,1.38,mask=1,n=6)
 tube('Upper arm',[(ax,1.08,.01,.043,.045),(ax,1.20,0,.048,.048)],skin,-side*2,1.38,sm=1,n=6)
 tube('Forearm',[(side*.238,.88,.015,.032,.034),(ax,1.08,.01,.043,.045)],skin,-side*2,1.38,-side*2,1.08,sm=1,n=6)
 ell('Hand',(side*.238,.845,.025),(.035,.064,.028),skin,-side*2,1.38,-side*2,1.08,sm=1,seg=4,rings=3)
tube('Neck',[(0,1.41,0,.058,.052),(0,1.52,0,.057,.05)],skin,sm=1,n=8)
tube('Sculpted jaw and skull',[(0,1.48,.01,.05,.05),(0,1.53,.01,.078,.073),(0,1.62,.006,.10,.09),(0,1.70,0,.085,.08),(0,1.74,0,.04,.04)],skin,sm=1,n=12)
tube('Sculpted hairline',[(0,1.675,0,.101,.093),(0,1.71,0,.09,.083),(0,1.745,0,.055,.052),(0,1.76,0,.008,.008)],hair,n=12)
ell('Nose',(0,1.59,.096),(.022,.029,.024),skin,sm=1,seg=4,rings=3)
ell('Mouth',(0,1.55,.083),(.028,.004,.004),(.25,.13,.09),seg=6,rings=3)
for side in [-1,1]:
 ell('Ear',(side*.101,1.60,.002),(.018,.03,.018),skin,sm=1,seg=4,rings=3)
 ell('Eye',(side*.037,1.634,.088),(.012,.007,.005),hair,seg=4,rings=3)
# One render geometry; custom attributes retain each limb's animation pivot.
bpy.context.view_layer.update()
P=[];N=[];C=[];L=[];J=[];S=[];U=[];I=[]
for o,color,limb,pivot,joint,jp,mask,sm in parts:
 mesh=o.data;mesh.calc_loop_triangles();base=len(P)//3
 for vert in mesh.vertices:
  p=o.matrix_world@vert.co;normal=o.matrix_world.to_3x3()@vert.normal;normal.normalize()
  U.extend((max(0,min(1,p.x/.43+.5)),max(0,min(1,(p.z-.88)/.55))))
  P.extend((p.x,p.z,-p.y));N.extend((normal.x,normal.z,-normal.y));C.extend(color);L.extend((pivot,limb));J.extend((jp,joint));S.extend((mask,sm))
 for tri in mesh.loop_triangles:I.extend(base+v for v in tri.vertices)
# Node transforms must be evaluated before extraction (UV sphere locations).
# update depsgraph then redo using the scene's current world matrices.
bpy.context.view_layer.update()
# The object matrices above are current after transform_apply for spheres.
with open(os.path.join(OUT,'festival_person.json'),'w') as f:json.dump(dict(position=P,normal=N,color=C,limb=L,joint=J,surface=S,shirtUV=U,index=I),f,separators=(',',':'))
# Keep an inspectable textured example in the editable Blender file as well.
shirt_image=bpy.data.images.load(os.path.join(OUT,'crowd_shirts.png'));shirt_image.pack()
m=materials[cloth];m.use_nodes=True
tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=shirt_image
m.node_tree.links.new(tex.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for o,color,*rest in parts:
 if color!=cloth:continue
 uv=o.data.uv_layers.new(name='Shirt atlas')
 for loop in o.data.loops:
  p=o.matrix_world@o.data.vertices[loop.vertex_index].co
  u=max(.012,min(.988,p.x/.43+.5));vv=max(.012,min(.988,(p.z-.88)/.55))
  uv.data[loop.index].uv=((u+0)/4,(vv+1)/4) # example: Chicago print, tile 8
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'festival_person.blend'))
print('CROWD_TRIANGLES',len(I)//3)
