# Contact sheets for the Tokyo kit (KIT_DUSK=1: blue-hour light, emissive maps shown)
# Contact sheets for the SF kit (design-kit): imports the exported GLBs and renders
# street-level 3/4 front | rear 3/4 from above | steep top view, side by side.
#   blender -b -P tools/sf/design/kit_render.py -- [name-or-prefix ...]
import sys, os, math
import bpy
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.environ.get('KIT_SRC', os.path.join(ROOT, 'assets', 'buildings', 'tokyo'))
OUT = os.environ.get('KIT_SHEETS', os.path.join(os.environ.get('KIT_SCRATCH', '/tmp/tokyo_kit'), 'sheets'))
DUSK = bool(os.environ.get('KIT_DUSK'))
RW, RH = int(os.environ.get('KIT_RW', 640)), int(os.environ.get('KIT_RH', 500))

def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.eevee.taa_render_samples = 6
    sc.render.resolution_x = RW; sc.render.resolution_y = RH
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.62, 0.74, 0.92, 1); bg.inputs[1].default_value = 0.7
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.color = (1.0, 0.93, 0.80); sun.angle = math.radians(2)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    # late-afternoon sun from the front-left (Blender: front = -Y), ~32 deg up
    d = Vector((0.55, -0.75, 0.62)).normalized()
    if DUSK:
        bg.inputs[0].default_value = (0.10, 0.14, 0.30, 1); bg.inputs[1].default_value = 0.55
        sun.energy = 0.35; sun.color = (0.55, 0.62, 1.0)
    so.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    cam.lens = 35; cam.clip_end = 5000
    return sc, co

def ground(size=400, col=(0.19, 0.19, 0.2, 1)):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, -0.01))
    g = bpy.context.active_object
    m = bpy.data.materials.new('ground'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    g.data.materials.append(m)
    return g

def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.data.objects if o not in before]
    for o in obs:
        for sl in getattr(o, 'material_slots', []):
            b = sl.material.node_tree.nodes.get('Principled BSDF') if sl.material and sl.material.use_nodes else None
            if b: b.inputs['Emission Strength'].default_value = 2.6 if DUSK else 0.0
    return obs

def look(co, pos, target):
    co.location = pos
    co.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()

def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def stitch(paths, out):
    ims = []
    for p in paths:
        im = bpy.data.images.load(p); w, h = im.size
        a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4); ims.append(a); bpy.data.images.remove(im)
    a = np.concatenate(ims, axis=1)
    im = bpy.data.images.new('st', a.shape[1], a.shape[0], alpha=False)
    im.pixels.foreach_set(a.ravel()); im.filepath_raw = out; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)
    for p in paths: os.remove(p)

_SC = None
def sheet(name):
    global _SC
    if _SC is None:
        _SC = setup(); ground()
    sc, co = _SC
    obs = load(os.path.join(SRC, name + '.glb'))
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in obs:
        if o.type != 'MESH': continue
        for c in o.bound_box:
            v = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, v)); mx = Vector(map(max, mx, v))
    W, D, H = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    R = 0.5 * math.sqrt(W * W + D * D + H * H)
    fov = 2 * math.atan(18 / 35.0 * RH / RW * 1.0)   # vertical-ish
    dist = R / math.tan(min(fov, 2 * math.atan(18 / 35.0)) / 2) * 0.9
    tgt = (0, 0, H * 0.5)
    paths = []
    # 1 street 3/4 front (camera low)
    a = math.radians(32); eh = max(1.8, min(H * 0.12, 12))
    look(co, (math.sin(a) * dist * 0.85, -math.cos(a) * dist * 0.85, eh), (0, 0, H * 0.46))
    p = os.path.join(OUT, name + '_v1.png'); render(sc, p); paths.append(p)
    # 2 rear 3/4 from above
    a = math.radians(145); el = math.radians(32)
    look(co, (math.sin(a) * dist * math.cos(el), -math.cos(a) * dist * math.cos(el), H * 0.5 + dist * math.sin(el)), tgt)
    p = os.path.join(OUT, name + '_v2.png'); render(sc, p); paths.append(p)
    # 3 steep top view from the front
    a = math.radians(-20); el = math.radians(68)
    look(co, (math.sin(a) * dist * math.cos(el), -math.cos(a) * dist * math.cos(el), H * 0.5 + dist * math.sin(el)), tgt)
    p = os.path.join(OUT, name + '_v3.png'); render(sc, p); paths.append(p)
    stitch(paths, os.path.join(OUT, name + ('_dusk' if DUSK else '') + '.png'))
    for o in obs:
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o)
        if me: bpy.data.meshes.remove(me)
    for m in list(bpy.data.materials):
        if m.users == 0: bpy.data.materials.remove(m)
    for im in list(bpy.data.images):
        if im.users == 0: bpy.data.images.remove(im)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.glb') and not f.endswith('_lod1.glb'))
    if os.environ.get('KIT_LOD1'): names = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('_lod1.glb'))
    names = [n for n in names if not argv or any(n == a or n.startswith(a) for a in argv)]
    for n in names:
        sheet(n); print('SHEET', n)
