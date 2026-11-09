"""Blender batch: transfer reference skin, bake textures, share animation.

Run prepare_crowd_surfaces.py first, then:
blender -b -t 4 --python tools/build_downloaded_crowd.py -- --downloads PATH
Finally run finish_crowd_assets.py and make_asset_manifest.mjs.
Original downloads are never modified. Requires Blender's bundled numpy.
"""
import bpy, numpy as np, json, struct, copy, argparse
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/enemies/festival'
OUT.mkdir(parents=True, exist_ok=True)
args = argparse.ArgumentParser()
args.add_argument('--downloads', default=str(Path.home() / 'Downloads'))
args.add_argument('--start', type=int, default=1, help='Resume at a 1-based person number')
import sys
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
DOWNLOADS = Path(opts.downloads)

def read_glb(path):
    raw = path.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+n]), raw[28+n:]

DT = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}
SZ = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def array(g, binary, i):
    a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
    return np.frombuffer(binary, dtype=DT[a['componentType']], count=a['count']*SZ[a['type']],
                         offset=v.get('byteOffset', 0)+a.get('byteOffset', 0)).reshape(-1, SZ[a['type']]).copy()

class GLB:
    def __init__(self, nodes, skin):
        self.g = {'asset': {'version': '2.0', 'generator': 'Kaiju Blender crowd pipeline'},
                  'scene': 0, 'scenes': [{'nodes': [67]}], 'nodes': copy.deepcopy(nodes),
                  'skins': [copy.deepcopy(skin)], 'bufferViews': [], 'accessors': []}
        self.binary = bytearray()
    def view(self, raw):
        while len(self.binary)%4: self.binary.append(0)
        index = len(self.g['bufferViews'])
        self.g['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(raw)})
        self.binary.extend(raw)
        return index
    def acc(self, data, kind, component=5126, normalized=False):
        a = np.asarray(data, dtype=DT[component]).reshape(-1, SZ[kind])
        entry = {'bufferView': self.view(a.tobytes()), 'componentType': component, 'count': len(a), 'type': kind}
        if normalized: entry['normalized'] = True
        if component == 5126:
            entry['min'] = a.min(axis=0).tolist(); entry['max'] = a.max(axis=0).tolist()
        self.g['accessors'].append(entry)
        return len(self.g['accessors'])-1
    def save(self, path):
        self.g['buffers'] = [{'byteLength': len(self.binary)}]
        j = json.dumps(self.g, separators=(',', ':')).encode()
        j += b' ' * (-len(j)%4)
        self.binary += b'\0' * (-len(self.binary)%4)
        path.write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(j)+len(self.binary))+
                         struct.pack('<II', len(j), 0x4e4f534a)+j+
                         struct.pack('<II', len(self.binary), 0x004e4942)+self.binary)

reference = DOWNLOADS / 'pedestrian1withFullAnimationAndRig.glb'
rg, rb = read_glb(reference)
skin = rg['skins'][0]
joint_names = [rg['nodes'][i]['name'] for i in skin['joints']]
ibm = array(rg, rb, skin['inverseBindMatrices'])
# Use the actual bind pose, not the running pose saved in the reference's nodes.
nodes = copy.deepcopy(rg['nodes'])
parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
world = {i: Matrix(ibm[j].reshape(4, 4).T).inverted() for j, i in enumerate(skin['joints'])}
for i in skin['joints']:
    local = world.get(parents.get(i), Matrix.Identity(4)).inverted() @ world[i]
    t, q, s = local.decompose()
    for key in ('matrix', 'translation', 'rotation', 'scale'): nodes[i].pop(key, None)
    nodes[i].update(translation=list(t), rotation=[q.x, q.y, q.z, q.w], scale=list(s))

library = GLB(nodes, skin)
library.g['skins'][0]['inverseBindMatrices'] = library.acc(ibm, 'MAT4')
# A tiny carrier mesh keeps the standard glTF skeleton binding intact.
attrs = {'POSITION': library.acc([[0,0,0],[0,0,0],[0,0,0]], 'VEC3'),
         'JOINTS_0': library.acc([[0,0,0,0]]*3, 'VEC4', 5123),
         'WEIGHTS_0': library.acc([[1,0,0,0]]*3, 'VEC4')}
library.g['meshes'] = [{'primitives': [{'attributes': attrs}]}]
library.g['animations'] = []
clips = []
for anim in rg['animations']:
    a = {'name': anim['name'], 'channels': copy.deepcopy(anim['channels']), 'samplers': []}
    duration = 0
    for sampler in anim['samplers']:
        times = array(rg, rb, sampler['input']); values = array(rg, rb, sampler['output'])
        duration = max(duration, float(times[-1,0]))
        if np.max(np.abs(values-values[0])) < 1e-5:
            times = times[[0,-1]]; values = values[[0,-1]]
        a['samplers'].append({'input': library.acc(times, 'SCALAR'),
                              'output': library.acc(values, rg['accessors'][sampler['output']]['type']),
                              'interpolation': sampler.get('interpolation','LINEAR')})
    library.g['animations'].append(a)
    clips.append({'name': a['name'], 'duration': duration})
library.save(OUT/'animations.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(reference))
source = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('geometry'))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
rig.data.pose_position = 'REST'
source.name = 'SkinTransferReference'
source.hide_render = True
bpy.context.view_layer.update()

files = ['pedestrian1.glb','pedestrian2.glb','pedestrian3.glb','pedestrain4.glb',
         'pedestrain5.glb','pedestrian6.glb','pedestrain7.glb',
         'sample_2026-11-09T202125.720.glb','sample_2026-11-09T202401.941.glb']
report = {'reference': reference.name, 'animationFile': 'animations.glb', 'clips': clips,
          'boneCount': len(joint_names), 'models': []}
for number, name in enumerate(files, 1):
    if number < opts.start:
        lods = []
        for lod in ['near','far','distant']:
            filename = f'person_{number:02d}_{lod}.glb'
            existing, _ = read_glb(OUT/filename)
            primitive = existing['meshes'][0]['primitives'][0]
            lods.append({'lod':lod,'file':filename,'triangles':existing['accessors'][primitive['indices']]['count']//3,
                         'vertices':existing['accessors'][primitive['attributes']['POSITION']]['count']})
        report['models'].append({'id':f'person_{number:02d}','source':name,'sourceBytes':(DOWNLOADS/name).stat().st_size,'lods':lods})
        continue
    path = DOWNLOADS/name
    original, binary = read_glb(path)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = set(bpy.data.objects)-before
    obj = next(o for o in imported if o.type == 'MESH')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coords = np.array([v.co[:] for v in obj.data.vertices])
    low, high = coords.min(axis=0), coords.max(axis=0)
    # Same canonical skeleton for every variant; fit full height and fingertip span.
    coords[:,0] = (coords[:,0]-(low[0]+high[0])/2) * 1.701788/(high[0]-low[0])
    coords[:,1] = (coords[:,1]-(low[1]+high[1])/2) * 1.7/(high[2]-low[2])
    coords[:,2] = (coords[:,2]-low[2]) * 1.7/(high[2]-low[2])
    obj.data.vertices.foreach_set('co', coords.reshape(-1))
    texture_source = obj.copy(); texture_source.data = obj.data.copy()
    bpy.context.collection.objects.link(texture_source)
    texture_source.hide_render = False
    for material in texture_source.data.materials:
        image_node = next(n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image.colorspace_settings.name == 'sRGB')
        tree = material.node_tree; output = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL')
        emission = tree.nodes.new('ShaderNodeEmission')
        tree.links.new(image_node.outputs['Color'],emission.inputs['Color'])
        tree.links.new(emission.outputs[0],output.inputs['Surface'])
    atlas_image = bpy.data.images.new(f'Festival_{number:02d}',width=1024,height=1024)
    atlas_image.generated_color = (.35,.35,.35,1)
    bake_material = bpy.data.materials.new(f'Bake_{number:02d}')
    bake_material.use_nodes = True
    destination = bake_material.node_tree.nodes.new('ShaderNodeTexImage')
    destination.image = atlas_image; bake_material.node_tree.nodes.active = destination
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.samples = 1
    bpy.context.scene.render.bake.use_selected_to_active = True
    bpy.context.scene.render.bake.use_clear = False
    bpy.context.scene.render.bake.cage_extrusion = .04
    bpy.context.scene.render.bake.max_ray_distance = .12
    bpy.context.scene.render.bake.margin = 2
    bpy.context.scene.view_settings.view_transform = 'Standard'
    lods = []
    for lod, width, offset in [('near',.74,0),('far',.20,.75),('distant',.04,.96)]:
        prepared = np.load(ROOT.parent/'crowd_build'/f'person_{number:02d}_{lod}.npz')
        points = prepared['vertices']
        mesh_data = bpy.data.meshes.new(f'Clean_{number:02d}_{lod}')
        mesh_data.from_pydata([(x,-z,y) for x,y,z in points],[],prepared['faces'].tolist())
        mesh_data.update(); obj.data = mesh_data
        obj.data.materials.clear(); obj.data.materials.append(bake_material)
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.015)
        bpy.ops.object.mode_set(mode='OBJECT')
        for uv in obj.data.uv_layers.active.data:
            uv.uv.x = offset + uv.uv.x * width
            uv.uv.y = .005 + uv.uv.y * .99
        for poly in obj.data.polygons: poly.use_smooth = True
        texture_source.select_set(True)
        bpy.ops.object.bake(type='EMIT')
        texture_source.select_set(False)
        print('TEXTURE_BAKE_DONE',name,lod,flush=True)
        for poly in obj.data.polygons: poly.use_smooth = True
        for group in source.vertex_groups: obj.vertex_groups.new(name=group.name)
        transfer = obj.modifiers.new('Reference surface skin weights', 'DATA_TRANSFER')
        transfer.object = source; transfer.use_vert_data = True
        transfer.data_types_verts = {'VGROUP_WEIGHTS'}
        transfer.vert_mapping = 'POLYINTERP_NEAREST'
        transfer.layers_vgroup_select_src = 'ALL'; transfer.layers_vgroup_select_dst = 'NAME'
        bpy.ops.object.modifier_apply(modifier=transfer.name)
        # Keep four normalized influences, as required by the crowd GPU shader.
        group_map = {g.index:joint_names.index(g.name) for g in obj.vertex_groups if g.name in joint_names}
        weights, joints = [], []
        for vertex in obj.data.vertices:
            influences = sorted([(group_map[g.group],g.weight) for g in vertex.groups if g.group in group_map and g.weight>1e-6],key=lambda v:-v[1])[:4]
            if not influences: raise RuntimeError(f'Unweighted vertex in {name}')
            total = sum(w for j,w in influences)
            joints.append([j for j,w in influences]+[0]*(4-len(influences)))
            weights.append([w/total for j,w in influences]+[0]*(4-len(influences)))
        mesh = obj.data; mesh.calc_loop_triangles()
        # Split UV seams, not every triangle: retain compact indexed geometry.
        verts, normals, uvs, js, ws, indices, lookup = [], [], [], [], [], [], {}
        uv_layer = mesh.uv_layers.active.data
        for triangle in mesh.loop_triangles:
            for li in triangle.loops:
                vi = mesh.loops[li].vertex_index
                uv = tuple(uv_layer[li].uv)
                key = (vi, round(uv[0],7),round(uv[1],7))
                if key not in lookup:
                    lookup[key] = len(verts)
                    p = mesh.vertices[vi].co; n = mesh.vertices[vi].normal
                    verts.append([p.x,p.z,-p.y]); normals.append([n.x,n.z,-n.y])
                    uvs.append([uv[0],1-uv[1]]); js.append(joints[vi]); ws.append(weights[vi])
                indices.append(lookup[key])
        glb = GLB(nodes,skin)
        glb.g['skins'][0]['inverseBindMatrices'] = glb.acc(ibm,'MAT4')
        attributes = {'POSITION':glb.acc(verts,'VEC3'),'NORMAL':glb.acc(normals,'VEC3'),
                      'TEXCOORD_0':glb.acc(uvs,'VEC2'),'JOINTS_0':glb.acc(js,'VEC4',5123),
                      'WEIGHTS_0':glb.acc(ws,'VEC4')}
        glb.g['meshes'] = [{'name':f'festival_person_{number:02d}_{lod}',
                            'primitives':[{'attributes':attributes,'indices':glb.acc(indices,'SCALAR',5123),'material':0}]}]
        glb.g['images'] = [{'uri':f'person_{number:02d}.jpg'}]
        glb.g['textures'] = [{'source':0}]
        glb.g['materials'] = [{'name':f'Festival {number:02d}', 'pbrMetallicRoughness':{
            'baseColorTexture':{'index':0}, 'metallicFactor':0, 'roughnessFactor':.86}}]
        filename = f'person_{number:02d}_{lod}.glb'
        glb.save(OUT/filename)
        lods.append({'lod':lod,'file':filename,'triangles':len(indices)//3,'vertices':len(verts)})
    report['models'].append({'id':f'person_{number:02d}','source':name,'sourceBytes':path.stat().st_size,'lods':lods})
    atlas_image.filepath_raw = str(ROOT.parent/'crowd_build'/f'person_{number:02d}_baked.png')
    atlas_image.file_format = 'PNG'; atlas_image.save()
    for o in imported: bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.objects.remove(texture_source,do_unlink=True)
    print('CROWD_MODEL_DONE',name,lods,flush=True)
(OUT/'manifest.json').write_text(json.dumps(report,indent=2))
print('CROWD_BUILD_COMPLETE',flush=True)
