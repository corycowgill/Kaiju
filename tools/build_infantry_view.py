"""Rebuild the original first-person infantry art with Blender (no external assets)."""
import bpy, math, random, os
from mathutils import Vector
random.seed(29)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'assets','viewmodels')
os.makedirs(OUT,exist_ok=True)
def v(p):return Vector((p[0],-p[2],p[1]))
def mat(name,color,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
import sys
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__))))
from view_surface import make_surface
surfaces=bpy.data.images.load(os.path.join(OUT,'../../art/viewmodels/cabin_surfaces.png'))
surfaces.file_format='JPEG'
steel=make_surface('Parkerized graphite steel',surfaces,[0,1],.75,.42,'paint')
edge=make_surface('Machined worn rail edges',surfaces,[0,1],.80,.38,'paint')
poly=make_surface('Worn olive polymer',surfaces,[0,1],0,.73,'paint')
rubber=make_surface('Rubber grips and gloves',surfaces,[1,1],0,.90,'leather')
knuckle=make_surface('Reinforced glove panels',surfaces,[1,1],0,.85,'leather')
cloth=make_surface('Woven tactical sleeve',surfaces,[0,0],0,.92,'woven')

def finish(o,name,m):
 o.name=name;o.data.materials.append(m)
 if 'uv_metres' in m and o.type=='MESH':
  if not o.data.uv_layers.active:o.data.uv_layers.new()
  scale=m['uv_metres']
  for face in o.data.polygons:
   axis=max(range(3),key=lambda i:abs(face.normal[i]));pair=(1,2)if axis==0 else (0,2)if axis==1 else (0,1)
   for li in face.loop_indices:
    p=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=(p[pair[0]]/scale,p[pair[1]]/scale)
 if 'atlas_tile' in m and o.type=='MESH' and o.data.uv_layers.active:
  tx,ty=m['atlas_tile']
  for uv in o.data.uv_layers.active.data:uv.uv=(uv.uv.x*.48+tx*.5+.01,uv.uv.y*.48+ty*.5+.01)
 return o
def box(name,p,size,m,bevel=.006):
 bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3
  o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return finish(o,name,m)
def rod(name,a,b,r,m,r2=None,verts=12):
 a,b=v(a),v(b);d=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,m)
def ell(name,p,scale,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=v(p));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return finish(o,name,m)
# Carbine centered down the screen-right firing line.
x=.205
box('Upper receiver',(x,-.235,-.63),(.075,.065,.25),steel)
box('Lower receiver',(x,-.285,-.59),(.069,.055,.15),poly)
# Octagonal free-float handguard: chamfered silhouette, no solid rectangular slab.
section=[(-.03,-.038),(.03,-.038),(.041,-.026),(.041,.026),(.03,.038),(-.03,.038),(-.041,.026),(-.041,-.026)]
verts=[v((x+u,-.235+y,z)) for z in [-.745,-.995] for u,y in section]
faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8)for i in range(8)]
me=bpy.data.meshes.new('Octagonal handguard');me.from_pydata(verts,[],faces);me.update()
o=bpy.data.objects.new('Ventilated octagonal handguard',me);bpy.context.collection.objects.link(o);finish(o,o.name,poly)
for side in [-1,1]:
 for i in range(7):box('Recessed cooling slot',(x+side*.041,-.23,-.775-i*.031),(.003,.022,.019),rubber,.002)
rod('Exposed barrel',(x,-.233,-.98),(x,-.233,-1.18),.013,steel,verts=20)
rod('Muzzle brake',(x,-.233,-1.16),(x,-.233,-1.205),.020,edge,verts=20)
rod('Dark bore',(x,-.233,-1.205),(x,-.233,-1.207),.010,rubber,verts=20)
for i in range(4):box('Brake port',(x+.019,-.23,-1.17-i*.008),(.002,.012,.004),rubber,.001)
box('Picatinny rail',(x,-.188,-.77),(.037,.012,.40),steel,.002)
for i in range(23):box('Rail tooth',(x,-.178,-.58-i*.017),(.052,.009,.008),edge,.001)
box('Stock buffer',(x,-.24,-.42),(.036,.04,.18),steel)
box('Adjustable shoulder stock',(x,-.26,-.33),(.061,.09,.14),poly)
box('Rubber butt pad',(x,-.26,-.255),(.067,.105,.016),rubber)
g=box('Pistol grip',(x,-.355,-.555),(.055,.12,.05),poly);g.rotation_euler.x=-.24
for i in range(6):box('Grip traction',(x+.028,-.315-i*.013,-.555),(.003,.004,.035),rubber,.001)
verts=[]
for i in range(5):
 t=i/4;cy=-.31-t*.165;cz=-.68+t*t*.043
 for sx,sz in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append(v((x+sx*.024,cy,cz+sz*.035)))
faces=[tuple(reversed(range(4))),tuple(range(16,20))]+[(i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j)for i in range(4)for j in range(4)]
me=bpy.data.meshes.new('Curved stamped magazine');me.from_pydata(verts,[],faces);me.uv_layers.new()
for polyface in me.polygons:
 for li in polyface.loop_indices:
  co=me.vertices[me.loops[li].vertex_index].co;me.uv_layers.active.data[li].uv=((co.x-x+.024)/.048,(co.z+.475)/.165)
mag=bpy.data.objects.new('Curved stamped magazine',me);bpy.context.collection.objects.link(mag);finish(mag,mag.name,steel)
mod=mag.modifiers.new('Stamped magazine edge roll','BEVEL');mod.width=.003;mod.segments=2;mag.modifiers.new('Magazine normals','WEIGHTED_NORMAL')
for side in [-1,1]:
 for i in range(3):box('Magazine pressed rib',(x+side*.025,-.39,-.658-i*.02),(.003,.11,.006),edge,.001)
box('Trigger guard',(x,-.327,-.603),(.049,.008,.061),steel,.003)
rod('Trigger',(x,-.295,-.602),(x,-.319,-.61),.004,edge)
box('Ejection port',(x+.038,-.228,-.637),(.002,.023,.075),rubber,.002)
box('Bolt carrier visible in port',(x+.040,-.227,-.641),(.003,.013,.035),edge,.001)
for z in [-.55,-.66]:rod('Receiver pivot pin',(x+.036,-.276,z),(x+.041,-.276,z),.006,edge,verts=12)
rod('Safety selector',(x-.038,-.275,-.56),(x-.055,-.275,-.56),.007,edge)
box('Angled selector lever',(x-.056,-.285,-.565),(.006,.026,.012),rubber,.003)
rod('Charging handle',(x-.044,-.216,-.535),(x+.044,-.216,-.535),.007,edge)
box('Optic mount',(x,-.16,-.65),(.044,.026,.065),steel)
# Open reflex optic hood and a tiny amber aiming point; no opaque lens slab.
for side in [-1,1]:box('Reflex sight hood',(x+side*.026,-.12,-.65),(.008,.062,.055),edge,.003)
box('Reflex hood bridge',(x,-.087,-.65),(.057,.009,.055),edge,.003)
ell('Amber optic dot',(x,-.12,-.68),(.002,.002,.002),mat('Amber reticle',(.8,.3,.03),.2))
glass=mat('Coated reflex optic glass',(.08,.18,.16),.10,.12)
glass.diffuse_color=(.08,.18,.16,.07);glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.07
me=bpy.data.meshes.new('Reflex lens');me.from_pydata([v(p)for p in [(x-.022,-.148,-.647),(x+.022,-.148,-.647),(x+.022,-.092,-.647),(x-.022,-.092,-.647)]],[],[(0,1,2,3)])
o=bpy.data.objects.new('Coated reflex optic lens',me);bpy.context.collection.objects.link(o);finish(o,o.name,glass)
# Anatomical sleeve volumes, connected cuffs and shaped palms.
for name,elbow,wrist in [('Right',(.48,-.55,-.13),(.24,-.38,-.54)),('Left',(-.32,-.55,-.12),(.13,-.32,-.86))]:
 shoulder=(.57,-.78,.03) if name=='Right' else (-.48,-.76,.02)
 rod(name+' upper sleeve',shoulder,elbow,.098,cloth,.081,20)
 rod(name+' forearm sleeve',elbow,wrist,.081,cloth,.052,20)
 ell(name+' elbow fold',elbow,(.082,.083,.09),cloth)
 # Cuff sits on the sleeve, with visible ribbed stitching.
 d=Vector(wrist)-Vector(elbow);d.normalize();a=Vector(wrist)-d*.035
 rod(name+' cuff',a,wrist,.055,poly,.049,20)
 for i in range(3):
  q=Vector(wrist)-d*(.006+i*.009);rod(name+' cuff seam',q-d*.002,q+d*.002,.055,knuckle,verts=20)
ell('Right trigger palm',(.236,-.322,-.554),(.046,.061,.042),rubber)
ell('Right knuckle plate',(.272,-.318,-.555),(.019,.044,.034),knuckle)
for i in range(3):
 y=-.323-i*.021
 rod('Right curled finger',(.243,y,-.53),(.18,y,-.533),.011,knuckle)
 rod('Right finger tip',(.18,y,-.533),(.177,y,-.56),.010,rubber)
rod('Trigger index',(.248,-.304,-.558),(.246,-.302,-.61),.010,knuckle)
rod('Right thumb',(.17,-.31,-.55),(.18,-.275,-.57),.013,knuckle)
ell('Left support palm',(.16,-.305,-.858),(.049,.035,.057),rubber)
for i in range(4):
 z=-.818-i*.023
 rod('Left gripping finger',(.144,-.303,z),(.238,-.302,z),.011,knuckle)
 rod('Left wrapped fingertip',(.238,-.302,z),(.248,-.263,z),.010,rubber)
rod('Left thumb',(.133,-.288,-.89),(.151,-.249,-.867),.013,knuckle)
marker=bpy.data.objects.new('MUZZLE',None);bpy.context.collection.objects.link(marker);marker.location=v((x,-.233,-1.22))
# Export evaluated bevels and smooth normals; geometry is in camera-local metres.
# Apply modifiers and merge by material to keep the viewmodel at seven draws.
for o in list(bpy.context.scene.objects):
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 o.select_set(False)
for m in list(bpy.data.materials):
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials) and o.data.materials[0]==m]
 if not objs:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();objs[0].name=m.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'infantry_view.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'infantry_view.glb'),export_format='GLB',use_selection=True,export_apply=True,export_image_format='AUTO',export_jpeg_quality=90)
from viewmodel_ao import bake_view_ao
bake_view_ao(__import__('pathlib').Path(OUT)/'infantry_view.glb')
print('VIEWMODEL_EXPORTED',len(bpy.context.scene.objects))
