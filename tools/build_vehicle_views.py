"""Blender-authored tank gunner station and helicopter pilot cabin.
Camera-local coordinates: +Y up, -Z forward. No placeholder game primitives.
blender -b -t 4 --python tools/build_vehicle_views.py
"""
import bpy, math, os, random
import json, struct, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/viewmodels'
import sys
sys.path.insert(0,str(ROOT/'tools'))
from view_surface import make_surface, material_tile
random.seed(46)
bpy.context.preferences.filepaths.save_version=0

def v(p): return Vector((p[0],-p[2],p[1]))
def material(name,color,metal=0,rough=.65,emission=0,tile=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 if tile is not None:
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=atlas
  m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
  if emission:m.node_tree.links.new(n.outputs['Color'],p.inputs['Emission Color'])
  m['atlas_tile']=tile
 return m
def surface(name,tile,metal,rough,kind):
 return make_surface(name,surface_atlas,tile,metal,rough,kind)

def finish(o,name,m):
 o.name=name;o.data.materials.append(m)
 if 'uv_metres' in m and hasattr(o.data,'uv_layers'):
  if not o.data.uv_layers.active:o.data.uv_layers.new()
  scale=m['uv_metres']
  for face in o.data.polygons:
   axis=max(range(3),key=lambda i:abs(face.normal[i]));pair=(1,2)if axis==0 else (0,2)if axis==1 else (0,1)
   for li in face.loop_indices:
    p=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=(p[pair[0]]/scale,p[pair[1]]/scale)
 if 'atlas_tile' in m and hasattr(o.data,'uv_layers') and o.data.uv_layers.active:
  x,y=m['atlas_tile']
  for uv in o.data.uv_layers.active.data:uv.uv=(uv.uv.x*.48+x*.5+.01,uv.uv.y*.48+y*.5+.01)
 return o
def box(name,p,size,m,bevel=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Manufactured edge radii','BEVEL');mod.width=bevel;mod.segments=2
  o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return finish(o,name,m)
def rod(name,a,b,r,m,r2=None,n=16):
 a,b=v(a),v(b);d=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
 for face in o.data.polygons:face.use_smooth=True
 return finish(o,name,m)
def ell(name,p,scale,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=v(p));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for face in o.data.polygons:face.use_smooth=True
 return finish(o,name,m)
def ring(name,p,r,t,m):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=32,minor_segments=8,location=v(p),rotation=(math.pi/2,0,0))
 o=bpy.context.object
 for face in o.data.polygons:face.use_smooth=True
 return finish(o,name,m)
def quad(name,p,w,h,m):
 x,y,z=p;me=bpy.data.meshes.new(name)
 me.from_pydata([v(q) for q in [(x-w/2,y-h/2,z),(x+w/2,y-h/2,z),(x+w/2,y+h/2,z),(x-w/2,y+h/2,z)]],[],[(0,1,2,3)])
 me.uv_layers.new()
 for data,uv in zip(me.uv_layers.active.data,[(0,0),(1,0),(1,1),(0,1)]):data.uv=uv
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 return finish(o,name,m)
def glazing(name,points,m):
 me=bpy.data.meshes.new(name);me.from_pydata([v(p)for p in points],[],[tuple(range(len(points)))]);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return finish(o,name,m)
def decal(name,p,w,h,index,yaw=0):
 x,y,z=p;u=Vector((math.cos(yaw),0,-math.sin(yaw)))
 pts=[Vector(p)+u*a*w+Vector((0,b*h,0)) for a,b in [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]]
 me=bpy.data.meshes.new(name);me.from_pydata([v(q)for q in pts],[],[(0,1,2,3)]);me.uv_layers.new()
 col=index%4;row=index//4
 for data,(a,b) in zip(me.uv_layers.active.data,[(0,0),(1,0),(1,1),(0,1)]):
  data.uv=(col*.25+.008+a*.234,(3-row)*.25+.008+b*.234)
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return finish(o,name,decals)
def hose(name,points,r,m):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=2;curve.resolution_u=8
 spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
 for point,p in zip(spline.bezier_points,points):point.co=v(p);point.handle_left_type='AUTO';point.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(m)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
 return o
def sleeve(name,a,b,r1,r2):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1))).normalized();vv=axis.cross(u).normalized()
 verts=[];n=20;rings=10
 for j in range(rings):
  t=j/(rings-1);radius=(r1*(1-t)+r2*t)*(1+.045*math.sin(j*3.6))
  center=a.lerp(b,t)+Vector((0,0,math.sin(t*math.pi)*.012))
  for k in range(n):
   angle=k/n*math.tau;r=radius*(1+.025*math.sin(k*3+j*1.4))
   verts.append(v(center+(u*math.cos(angle)+vv*math.sin(angle))*r))
 faces=[(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k)for j in range(rings-1)for k in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.uv_layers.new()
 for face in me.polygons:
  face.use_smooth=True
  for li in face.loop_indices:
   vi=me.loops[li].vertex_index;me.uv_layers.active.data[li].uv=((vi%n)/(n-1),(vi//n)/(rings-1))
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return finish(o,name,cloth)

def cabin_shell(role):
 # A single connected tub: floor, lower doors, roof and roof shoulders.
 # Side glazing replaces window faces only on the aircraft.
 rear=[(-1.04,-1.03),(1.04,-1.03),(1.04,-.24),(1.04,.59),(.78,.85),(-.78,.85),(-1.04,.59),(-1.04,-.24)]
 front=[(-.98,-.78),(.98,-.78),(.87,-.25),(.77,.50),(.65,.62),(-.65,.62),(-.77,.50),(-.87,-.25)]
 zfront=-1.15
 points=[(x,y,.28)for x,y in rear]+[(x,y,zfront)for x,y in front]
 faces=[]
 for i in range(8):
  face=(i,(i+1)%8,(i+1)%8+8,i+8)
  if role=='helicopter' and i in [2,6]:glazing('Sealed side canopy glazing',[points[k]for k in face],glass)
  else:faces.append(face)
 faces.append(tuple(reversed(range(8))))
 me=bpy.data.meshes.new('Continuous crew compartment');me.from_pydata([v(p)for p in points],[],faces);me.uv_layers.new()
 for face in me.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]))
  for li in face.loop_indices:
   p=me.vertices[me.loops[li].vertex_index].co
   if axis==2:uv=((p.x+1.04)/2.08,(p.y+.28)/1.43)
   elif axis==0:uv=((p.y+.28)/1.43,(p.z+1.03)/1.88)
   else:uv=((p.x+1.04)/2.08,(p.z+1.03)/1.88)
   me.uv_layers.active.data[li].uv=uv
 o=bpy.data.objects.new('Continuous crew compartment',me);bpy.context.collection.objects.link(o);finish(o,o.name,olive)
 mod=o.modifiers.new('Cabin shell thickness','SOLIDIFY');mod.thickness=.035
 mod=o.modifiers.new('Rounded shell seams','BEVEL');mod.width=.012;mod.segments=3
 o.modifiers.new('Cabin panel normals','WEIGHTED_NORMAL')
 for side in [-1,1]:
  # Window rails and roof longerons physically join the front frame to the tub.
  hose('Canopy roof longeron',[(side*.65,.62,zfront),(side*.86,.70,-.50),(side*.9,.73,.27)],.026,rubber)
  hose('Door sill weather seal',[(side*.87,-.25,zfront),(side*.98,-.24,-.45),(side*1.04,-.24,.28)],.018,rubber)
  panel('Dashboard corner closure',[(side*.77,-.31,-.91),(side*.98,-.75,-.91),(side*.98,-.78,zfront),(side*.87,-.25,zfront)],.02,olive)
  box('Inset door service cover',(side*.94,-.47,-.49),(.09,.30,.46),metal,.015)
  rod('Integrated cabin grab rail',(side*.91,-.58,-.51),(side*.91,-.33,-.51),.015,rubber,n=20)
  for y in [-.58,-.33]:rod('Grab rail welded standoff',(side*.91,y,-.51),(side*.98,y,-.51),.011,steel,n=12)
  for zz in [-.9,-.68,-.46,-.24]:fastener((side*.96,-.34,zz))
  decal('Sidewall maintenance plate',(side*.965,-.10,-.62),.19,.095,3 if side<0 else 7,yaw=side*-math.pi/2)
  hose('Bundled avionics loom',[(side*.72,-.62,-.91),(side*.70,-.74,-.72),(side*.39,-.79,-.47),(side*.31,-.85,-.05)],.013,rubber)
  for dz in [0,.035]:hose('Hydraulic conduit',[(side*.84,-.60,-.92+dz),(side*.83,-.79,-.63+dz),(side*.85,-.87,-.14+dz)],.007,steel)
  decal('Console inspection placard',(side*.75,-.60,-.872),.13,.043,2 if side<0 else 5)
 if role=='helicopter':
  panel('Roof-mounted avionics housing',[(-.28,.53,-.57),(.28,.53,-.57),(.28,.68,-.82),(-.28,.68,-.82)],.07,olive)
  decal('Roof electrical placard',(0,.54,-.49),.20,.047,6)
 else:
  # Front bulkhead closes the gap around the rectangular armored optics.
  inner=[(-.79,-.24),(.79,-.24),(.81,-.21),(.81,.43),(.78,.46),(-.78,.46),(-.81,.43),(-.81,-.21)]
  verts=[v((x,y,-1.10))for x,y in front]+[v((x,y,-1.10))for x,y in inner]
  faces=[(i,(i+1)%8,(i+1)%8+8,i+8)for i in range(8)]
  me=bpy.data.meshes.new('Sealed armored front bulkhead');me.from_pydata(verts,[],faces);me.uv_layers.new()
  for face in me.polygons:
   for li in face.loop_indices:
    p=me.vertices[me.loops[li].vertex_index].co;me.uv_layers.active.data[li].uv=(p.x*.5+.5,p.z*.5+.5)
  o=bpy.data.objects.new('Sealed armored front bulkhead',me);bpy.context.collection.objects.link(o);finish(o,o.name,metal)
def label(text,p,size=.012,m=None):
 bpy.ops.object.text_add(location=v(p),rotation=(math.pi/2,0,0));o=bpy.context.object
 o.data.body=text;o.data.size=size;o.data.align_x='CENTER';o.data.extrude=.00015;o.data.materials.append(m or ink)
 bpy.ops.object.convert(target='MESH');o.name='Stenciled '+text
 return o
def panel(name,points,depth,m):
 verts=[v(p) for p in points]+[v((p[0],p[1],p[2]-depth)) for p in points];n=len(points)
 faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 me.uv_layers.new()
 for uv,loop in zip(me.uv_layers.active.data,me.loops):
  p=me.vertices[loop.vertex_index].co;uv.uv=(p.x*.5+.5,p.z*.5+.5)
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 finish(o,name,m);mod=o.modifiers.new('Rolled panel edges','BEVEL');mod.width=.012;mod.segments=2;o.modifiers.new('Panel normals','WEIGHTED_NORMAL')
 return o
def fastener(p):rod('Recessed hex fastener',(p[0],p[1],p[2]-.008),p,.006,steel,n=6)
def display(name,x,y,z,w,h,tile):
 box('Recessed display surround',(x,y,z-.02),(w+.045,h+.05,.05),rubber,.012)
 screen=quad(name,(x,y,z+.008),w,h,screen_mats[tile])
 for sx in [-1,1]:
  for i in range(4):
   yy=y+(i-1.5)*h/4
   box('MFD tactile softkey',(x+sx*(w/2+.016),yy,z+.012),(.015,.025,.012),rubber,.003)
 for sx in [-1,1]:
  for sy in [-1,1]:fastener((x+sx*(w/2+.013),y+sy*(h/2+.014),z+.017))
 return screen
def hands(role):
 before=set(bpy.context.scene.objects)
 for side in [-1,1]:
  wrist=(side*.66,-.43,-.72) if role=='tank' else ((-.66,-.49,-.64)if side<0 else (.10,-.55,-.71))
  elbow=(side*.66,-.72,-.22);shoulder=(side*.8,-.95,.12)
  sleeve('Tailored crew upper sleeve',shoulder,elbow,.105,.084)
  sleeve('Sculpted folded forearm sleeve',elbow,wrist,.084,.048)
  ell('Folded flight suit elbow',elbow,(.084,.09,.09),cloth)
  d=(Vector(wrist)-Vector(elbow)).normalized()
  rod('Ribbed flight glove cuff',Vector(wrist)-d*.04,wrist,.052,glove,.048,20)
  palm=(wrist[0],wrist[1]+.043,wrist[2]-.04)
  collective=role=='helicopter' and side<0
  ell('Anatomical control grip glove',palm,(.046,.035,.062)if collective else (.046,.061,.039),glove)
  # Wrapped fingers visibly curl around a cylindrical control grip.
  # Overlapping closed cuffs and a wrist volume seal the sleeve/palm join.
  rod('Sealed gauntlet wrist cuff',Vector(wrist)-d*.035,Vector(wrist)+d*.025,.057,glove,.052,20)
  ell('Connected glove wrist volume',Vector(wrist)+d*.018,(.048,.052,.054),glove)
  for t in [-.025,-.012,0]:
   p=Vector(wrist)+d*t;rod('Gauntlet cuff seam',p-d*.0015,p+d*.0015,.057,leather,n=20)
  for i in range(4):
   yy=palm[1]+.033-i*.022;zz=palm[2]+.021
   if collective:yy=palm[1]+.018;zz=palm[2]+.034-i*.023
   rod('Curled gloved finger',(palm[0]-side*.025,yy,zz),(palm[0]+side*.027,yy,zz),.010,leather,n=12)
   tip=(palm[0]+side*.031,yy-.030,zz)if collective else(palm[0]+side*.031,yy,zz-.035)
   rod('Glove fingertip',(palm[0]+side*.027,yy,zz),tip,.009,glove,n=12)
   ell('Individual glove knuckle pad',(palm[0]+side*.030,yy,zz+.01),(.014,.010,.014),leather)
  rod('Gloved thumb',(palm[0]-side*.033,palm[1]+.001,palm[2]+.002),(palm[0]-side*.015,palm[1]+.058,palm[2]-.017),.013,leather,n=16)
  if collective:
   rod('Collective lift lever',(palm[0],-.66,-.30),(palm[0],palm[1]-.015,palm[2]-.09),.022,rubber,n=20)
   ell('Collective lever pivot',(palm[0],-.66,-.30),(.055,.055,.055),steel)
  else:
   rod('Cyclic control column'if role=='helicopter'else'Gunner control grip stalk',(palm[0],palm[1]-.18,palm[2]-.03),(palm[0],palm[1]+.065,palm[2]-.03),.021,rubber,r2=.025,n=20)
  ell('Thumb control hat',(palm[0],palm[1]+.077,palm[2]-.03),(.027,.018,.026),rubber)
  box('Control trigger guard',(palm[0],palm[1]+.037,palm[2]-.06),(.043,.065,.014),steel,.006)
  box('Red guarded control button',(palm[0]+side*.015,palm[1]+.074,palm[2]-.017),(.014,.008,.014),red,.003)
 group=bpy.data.objects.new('CREW_CONTROLS',None);bpy.context.collection.objects.link(group)
 for o in set(bpy.context.scene.objects)-before-{group}:o.parent=group

def export(role):
 # Dynamic displays and cannon recoil remain named; merge static details by material.
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':continue
  bpy.context.view_layer.objects.active=o
  for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 for m in list(bpy.data.materials):
  for parent in [None,bpy.data.objects.get('CREW_CONTROLS')]:
   objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==parent and o.data.materials and o.data.materials[0]==m and not o.name.startswith(('DISPLAY_','RECOIL_'))]
   if not objects:continue
   bpy.ops.object.select_all(action='DESELECT')
   for o in objects:o.select_set(True)
   bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=m.name
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{role}_view.blend'),compress=True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{role}_view.glb'),export_format='GLB',use_selection=True,export_apply=True,export_image_format='AUTO',export_jpeg_quality=90)
 import sys
 if str(ROOT/'tools')not in sys.path:sys.path.insert(0,str(ROOT/'tools'))
 from viewmodel_ao import bake_view_ao
 bake_view_ao(OUT/f'{role}_view.glb')
 print('COCKPIT_EXPORTED',role,flush=True)

for role in ['tank','helicopter']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.context.preferences.filepaths.save_version=0
 atlas=bpy.data.images.load(str(ROOT/'art/viewmodels/cockpit_atlas.png'))
 atlas.file_format='JPEG'
 surface_atlas=bpy.data.images.load(str(ROOT/'art/viewmodels/cabin_surfaces.png'))
 surface_atlas.file_format='JPEG'
 metal=surface('Weathered painted cockpit structure',[0,1],.65,.48,'paint')
 steel=surface('Worn satin alloy hardware',[0,1],.82,.39,'paint')
 olive=surface('Olive cabin interior panels',[0,1],.30,.72,'paint')
 glove=surface('Soft textured leather gloves',[1,1],0,.88,'leather')
 rubber=surface('Matte rubber cockpit trim',[1,1],0,.90,'leather')
 p=rubber.node_tree.nodes.get('Principled BSDF')
 for link in list(p.inputs['Base Color'].links):rubber.node_tree.links.remove(link)
 p.inputs['Base Color'].default_value=(.018,.022,.025,1)
 leather=surface('Reinforced leather glove stitching',[1,1],0,.82,'leather')
 cloth=surface('Woven flight suit sleeve',[0,0],0,.92,'woven')
 decals=material('Maintenance placards and safety decals',(.5,.5,.5),0,.72)
 node=decals.node_tree.nodes.new('ShaderNodeTexImage');node.image=material_tile(surface_atlas,[1,0])
 decals.node_tree.links.new(node.outputs['Color'],decals.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 ink=material('Ivory instrument stencils',(.7,.74,.66),0,.7,.12)
 red=material('Safety red switch guards',(.47,.055,.035),.25,.5)
 amber=material('Amber backlit annunciators',(.85,.31,.055),0,.5,.5)
 glass=material('Subtle canopy glazing',(.14,.22,.25),.12,.16)
 glass.diffuse_color=(.14,.22,.25,.045)
 glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.045
 screen_mats={
  'flight':material('Aviation flight screen',(.1,.4,.5),0,.45,.45,tile=[0,1]),
  'tank':material('Green navigation optics screen',(.1,.4,.2),0,.45,.45,tile=[1,1]),
  'analog':material('Analog gauge cluster',(.3,.3,.3),0,.55,.20,tile=[1,0])}
 cabin_shell(role)
 # Physical bezels, recessed cabin, padded glare shield, structural canopy frame.
 if role=='helicopter':
  panel('Sculpted avionics dashboard',[(-.98,-.75,-.91),(.98,-.75,-.91),(.77,-.31,-.91),(-.77,-.31,-.91)],.23,metal)
  box('Padded glare shield',(0,-.29,-1.0),(1.80,.065,.32),rubber,.026)
  display('DISPLAY_FLIGHT',-.265,-.465,-.875,.40,.26,'flight')
  display('DISPLAY_TACTICAL',.265,-.465,-.875,.40,.26,'tank')
  display('DISPLAY_ANALOG',-.70,-.46,-.89,.18,.19,'analog')
  display('DISPLAY_ENGINE',.70,-.46,-.89,.18,.19,'analog')
  label('FLIGHT',(-.265,-.292,-.83),.015)
  label('NAV / SYSTEMS',(.265,-.292,-.83),.015)
  for side in [-1,1]:
   pts=[(side*.86,-.42,-.67),(side*.92,.02,-.85),(side*.65,.62,-1.15)]
   for i in range(len(pts)-1):rod('Curved canopy structural arch',pts[i],pts[i+1],.031,metal,n=20)
   hose('Continuous front window gasket',[(side*.87,-.25,-1.13),(side*.77,.50,-1.13),(side*.65,.62,-1.13)],.012,rubber)
   box('Side console armrest',(side*.78,-.66,-.35),(.21,.14,.63),rubber,.035)
   box('Integrated door latch housing',(side*.965,-.36,-.55),(.07,.10,.10),olive)
   rod('Door latch handle',(side*.91,-.32,-.50),(side*.91,-.40,-.50),.012,steel)
   rod('Door latch linkage',(side*.91,-.36,-.50),(side*.965,-.36,-.55),.009,steel)
   for t in [.22,.55,.82]:
    p=Vector((side*.92,.02,-.85)).lerp(Vector((side*.65,.62,-1.15)),t)
    fastener((p.x,p.y,p.z+.024))
  rod('Overhead canopy bow',(-.65,.62,-1.15),(.65,.62,-1.15),.031,metal,n=20)
  glazing('Forward canopy glass',[(-.87,-.25,-1.145),(.87,-.25,-1.145),(.77,.50,-1.145),(.65,.62,-1.145),(-.65,.62,-1.145),(-.77,.50,-1.145)],glass)
  box('Overhead switch panel',(0,.60,-.83),(.48,.09,.18),olive,.015)
  for i in range(7):
   x=(i-3)*.054;rod('Overhead toggle',(x,.56,-.72),(x,.54,-.69),.006,steel,n=8)
  label('CAUTION   ROTOR',(.59,-.29,-.82),.012,m=amber)
  for side in [-1,1]:
   rod('Connected external weapon mounting spar',(side*.88,-.27,-1.12),(side*.90,-.24,-1.53),.027,metal,n=20)
   rod('External cannon pod sleeve',(side*.90,-.24,-1.48),(side*.90,-.24,-1.91),.065,metal,n=20)
   for a in [0,2.094,4.189]:
    x=side*.90+math.cos(a)*.032;y=-.24+math.sin(a)*.032
    rod('External multi-barrel assembly',(x,y,-1.88),(x,y,-2.50),.012,steel,n=12)
 else:
  panel('Armored gunner console',[(-1.0,-.79,-.98),(1.0,-.79,-.98),(.82,-.31,-.98),(-.82,-.31,-.98)],.28,olive)
  box('Padded periscope lower bolster',(0,-.285,-1.09),(1.73,.09,.24),rubber,.026)
  for side in [-1,1]:
   panel('Angled armored periscope cheek',[(side*.83,-.35,-1.12),(side*1.02,-.5,-.63),(side*1.02,.64,-.63),(side*.83,.49,-1.12)],.08,metal)
   rod('Periscope inner sealing gasket',(side*.80,-.24,-1.08),(side*.80,.49,-1.08),.018,rubber)
   rod('Grab handle',(side*.94,-.05,-.63),(side*.94,.22,-.63),.018,steel)
   for y in [-.05,.22]:rod('Grab handle mounting boss',(side*.94,y,-.63),(side*1.0,y,-.63),.012,steel)
   for y in [-.22,.05,.34]:fastener((side*.86,y,-.98))
  box('Heavy armored roof lip',(0,.55,-.95),(1.95,.18,.37),metal,.025)
  box('Padded brow rest',(0,.465,-.99),(1.6,.07,.11),rubber,.022)
  glazing('Armored optical window',[(-.79,-.24,-1.075),(.79,-.24,-1.075),(.79,.46,-1.075),(-.79,.46,-1.075)],glass)
  display('DISPLAY_SIGHT',-.48,-.47,-.925,.43,.25,'tank')
  display('DISPLAY_SYSTEMS',.48,-.47,-.925,.32,.25,'analog')
  # Stepped concentric breech and external recoil sleeve, rather than a box gun.
  rod('Breech steel housing',(0,-.52,-.75),(0,-.52,-1.25),.13,steel,r2=.105,n=24)
  rod('Cannon recoil sleeve',(0,-.32,-1.18),(0,-.32,-1.66),.082,metal,r2=.068,n=24)
  barrel=rod('RECOIL_BARREL',(0,-.32,-1.62),(0,-.32,-2.83),.046,steel,r2=.037,n=24)
  rod('Bore aperture',(0,-.32,-2.832),(0,-.32,-2.84),.029,rubber,n=24)
  for z in [-1.21,-1.36,-1.59]:ring('Cannon machined collar',(0,-.32,z),.079,.011,steel)
  ring('Right elevation hand wheel',(.73,-.44,-.81),.11,.012,rubber)
  for a in range(0,360,90):
   r=math.radians(a);rod('Elevation handwheel spoke',(.73,-.44,-.81),(.73+math.cos(r)*.10,-.44+math.sin(r)*.10,-.81),.006,steel)
  label('GUNNER   OPTICS',(-.48,-.295,-.87),.014)
  label('SYSTEMS',(.48,-.295,-.87),.013)
  label('BREECH   KEEP CLEAR',(0,-.665,-.72),.014,m=amber)
 hands(role)
 for side in [-1,1]:
  decal('Avionics serial number plate',(side*.66,-.57,-.867),.115,.040,10 if side<0 else 11)
  decal('Control hazard marking',(side*.44,-.642,-.787),.20,.023,12 if side<0 else 13)
 for name,p in [('MUZZLE',(.90,-.24,-2.52) if role=='helicopter' else (0,-.32,-2.86)),('MUZZLE_ALT',(-.90,-.24,-2.52) if role=='helicopter' else (0,-.32,-2.86))]:
  marker=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(marker);marker.location=v(p)
 # Tactile rows: rubber rocker switches, screw heads, knobs, colored guards.
 for side in [-1,1]:
  for i in range(5):
   x=side*(.14+i*.085)
   box('Beveled rocker switch',(x,-.67,-.80),(.047,.025,.018),rubber,.005)
   box('Amber switch annunciator',(x,-.645,-.786),(.018,.004,.003),amber,.001)
  rod('Knurled control knob',(side*.64,-.625,-.81),(side*.64,-.625,-.77),.025,steel,n=20)
  ring('Knob traction ring',(side*.64,-.625,-.771),.024,.003,rubber)
  for x in [.1,.3,.5,.7]:fastener((side*x,-.72,-.79))
 export(role)
