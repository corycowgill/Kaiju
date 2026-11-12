"""Blender-authored anatomical glove forms, two-bone arm IK and reload action."""
import bpy, math
from mathutils import Vector

def build_arms(api):
 v,finish,ell,rod,box=[api[k]for k in ['v','finish','ell','rod','box']]
 cloth,rubber,knuckle,poly=[api[k]for k in ['cloth','rubber','knuckle','poly']]
 before=set(bpy.context.scene.objects);bindings={}
 def bind(o,bone):bindings[o]=bone;return o
 def tube(name,points,radii,m,bone,sides=12):
  points=[Vector(p)for p in points];verts=[];faces=[]
  for j,p in enumerate(points):
   tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
   u=tangent.cross(Vector((0,1,0))if abs(tangent.y)<.9 else Vector((1,0,0))).normalized();w=tangent.cross(u)
   for k in range(sides):
    a=k/sides*math.tau;verts.append(v(p+(u*math.cos(a)+w*math.sin(a))*radii[j]))
  for j in range(len(points)-1):
   for k in range(sides):faces.append((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k))
  faces.extend([tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))])
  me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
  for f in me.polygons:f.use_smooth=True
  o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,m);return bind(o,bone)
 joints={
  'R':[(.50,-.72,.08),(.43,-.52,-.19),(.24,-.38,-.54),(.236,-.322,-.554)],
  'L':[(-.48,-.76,.02),(-.32,-.55,-.12),(.13,-.32,-.86),(.16,-.305,-.858)],
 }
 for side,(shoulder,elbow,wrist,palm)in joints.items():
  for a,b,r1,r2,bone in [(shoulder,elbow,.096,.080,'upper'),(elbow,wrist,.080,.048,'forearm')]:
   aa,bb=Vector(a),Vector(b);points=[];radii=[]
   for j in range(13):
    t=j/12;points.append(aa.lerp(bb,t));radii.append((r1*(1-t)+r2*t)*(1+.045*math.sin(t*math.pi*9)*math.sin(t*math.pi)))
   tube(side+' tailored sleeve',points,radii,cloth,side+'_'+bone,20)
  bind(ell(side+' folded elbow',elbow,(.081,.084,.085),cloth),side+'_forearm')
  d=(Vector(wrist)-Vector(elbow)).normalized()
  tube(side+' sealed textile cuff',[Vector(wrist)-d*.04,Vector(wrist)+d*.018],[.054,.048],poly,side+'_hand',20)
  for i in range(3):
   p=Vector(wrist)-d*(.005+i*.009)
   bind(rod(side+' cuff stitching',p-d*.0015,p+d*.0015,.054,knuckle,verts=20),side+'_hand')
  # Closed palm, wrist and thenar forms overlap: no detached digits or cuffs.
  scale=(.042,.060,.039)if side=='R'else(.047,.030,.054)
  bind(ell(side+' shaped leather palm',palm,scale,rubber),side+'_hand')
  bind(ell(side+' connected wrist',Vector(wrist)+d*.012,(.046,.044,.045),rubber),side+'_hand')
  if side=='R':
   for i in range(3):
    y=-.326-i*.020
    pts=[(.263,y,-.544),(.228,y,-.526),(.194,y,-.529),(.179,y,-.548),(.186,y,-.571)]
    tube('Curled grip finger '+str(i),pts,[.012,.012,.011,.010,.008],rubber,'R_hand')
    bind(ell('Raised finger knuckle',pts[0],(.013,.012,.014),knuckle),'R_hand')
   tube('Articulated trigger finger',[(.265,-.304,-.548),(.254,-.298,-.572),(.242,-.303,-.600),(.224,-.310,-.608)],[.011,.011,.010,.008],rubber,'R_hand')
   tube('Opposed trigger hand thumb',[(.211,-.335,-.526),(.189,-.317,-.532),(.177,-.290,-.550),(.192,-.280,-.570)],[.019,.017,.013,.009],rubber,'R_hand')
   for i in range(4):bind(ell('Individual backhand padding',(.270,-.300-i*.018,-.554),(.012,.009,.019),knuckle),'R_hand')
  else:
   for i in range(4):
    z=-.820-i*.022
    pts=[(.164,-.311,z),(.200,-.309,z),(.238,-.300,z),(.248,-.278,z),(.242,-.255,z)]
    tube('Wrapped support finger '+str(i),pts,[.012,.012,.011,.010,.008],rubber,'L_hand')
    bind(ell('Support finger knuckle',(.195,-.306,z),(.013,.011,.012),knuckle),'L_hand')
   tube('Opposed support thumb',[(.139,-.315,-.878),(.120,-.291,-.893),(.133,-.262,-.897),(.154,-.250,-.879)],[.019,.017,.013,.009],rubber,'L_hand')
   for z in [-.830,-.851,-.872]:bind(ell('Backhand reinforcement',(.135,-.290,z),(.019,.008,.009),knuckle),'L_hand')

 # A real armature drives both arms; a baked IK action is portable to glTF.
 arm=bpy.data.armatures.new('Infantry arm skeleton');rig=bpy.data.objects.new('INFANTRY_ARMS',arm)
 bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT')
 for side,points in joints.items():
  for i,name in enumerate(['upper','forearm','hand']):
   b=arm.edit_bones.new(side+'_'+name);b.head=v(points[i]);b.tail=v(points[i+1])
   if i:b.parent=arm.edit_bones[side+'_'+['upper','forearm'][i-1]];b.use_connect=True
 bpy.ops.object.mode_set(mode='OBJECT')
 for o,bone in bindings.items():
  group=o.vertex_groups.new(name=bone);group.add(list(range(len(o.data.vertices))),1,'REPLACE')
  mod=o.modifiers.new('Infantry skeletal deformation','ARMATURE');mod.object=rig;o.parent=rig
 for side,points in joints.items():
  target=bpy.data.objects.new(side+' wrist IK',None);bpy.context.collection.objects.link(target);target.location=v(points[2])
  pole=bpy.data.objects.new(side+' elbow pole',None);bpy.context.collection.objects.link(pole)
  shoulder,elbow,wrist=[Vector(p)for p in points[:3]];axis=(wrist-shoulder).normalized()
  offset=elbow-(shoulder+axis*(elbow-shoulder).dot(axis));pole.location=v(elbow+offset.normalized()*.5)
  pb=rig.pose.bones[side+'_forearm'];ik=pb.constraints.new('IK');ik.target=target;ik.chain_count=2
  # No pole constraint: the authored rest bend provides a stable preferred plane.
  orientation=bpy.data.objects.new(side+' glove orientation',None);bpy.context.collection.objects.link(orientation)
  orientation.rotation_mode='QUATERNION';orientation.rotation_quaternion=arm.bones[side+'_hand'].matrix_local.to_quaternion()
  copy=rig.pose.bones[side+'_hand'].constraints.new('COPY_ROTATION');copy.target=orientation;copy.owner_space='WORLD';copy.target_space='WORLD'
  if side=='L':
   poses=[(1,points[2]),(12,(.150,-.435,-.655)),(25,(.15,-.66,-.60)),(34,(.15,-.67,-.60)),(46,(.150,-.435,-.655)),(52,(.15,-.40,-.67)),(60,(.14,-.31,-.61)),(66,(.145,-.30,-.61)),(82,points[2])]
   for frame,p in poses:target.location=v(p);target.keyframe_insert(data_path='location',frame=frame)
  else:
   for frame in [1,82]:target.keyframe_insert(data_path='location',frame=frame)
 bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=82;bpy.context.scene.render.fps=30
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.nla.bake(frame_start=1,frame_end=82,step=1,only_selected=False,visual_keying=True,clear_constraints=True,use_current_action=False,bake_types={'POSE'})
 if rig.animation_data and rig.animation_data.action:rig.animation_data.action.name='reload'
 bpy.context.scene.frame_set(1)
 return rig
