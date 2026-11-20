# far_render.py - contact sheets for the "far" set: imports the EXPORTED GLBs and renders views with Cycles.
#   blender -b -P tools/sf/design/far_render.py -- [--far] [--water] [--dir <glb dir>] name [name ...]
# Tiles: 3/4 front, side, 3/4 rear (high), front, LOD1 3/4 (+ far-and-low views with --far).
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/design_far'
DIR = '/home/user/Kaiju/assets/buildings/sf'
args = sys.argv[sys.argv.index('--') + 1:]
FAR = '--far' in args
WATER = '--water' in args
if '--dir' in args:
    DIR = args[args.index('--dir') + 1]
    args.remove(DIR)
ZOOM = 1.0
TARGET = None
if '--zoom' in args:
    z = args[args.index('--zoom') + 1]
    args.remove(z)
    ZOOM = float(z)
if '--target' in args:  # gltf coordinates x,y,z
    t = args[args.index('--target') + 1]
    args.remove(t)
    tx, ty, tz = [float(v) for v in t.split(',')]
    TARGET = Vector((tx, -tz, ty))
TAG = ''
if '--tag' in args:
    TAG = args[args.index('--tag') + 1]
    args.remove(TAG)
names = [a for a in args if not a.startswith('--')]
TW, TH = 520, 390


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 8
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 2
    sc.render.resolution_x, sc.render.resolution_y = TW, TH
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.72, 0.86, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sc.world = w
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    sun.angle = math.radians(3)
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(52), 0, math.radians(-35))
    sc.collection.objects.link(so)
    cam = bpy.data.cameras.new('cam')
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    return sc, co


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.data.objects if o not in before]
    return obs


def bounds(obs):
    pts = []
    for o in obs:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def shot(sc, co, mn, mx, az, el, path, lens=60, zoom=1.0, target=None):
    c = target if target else (mn + mx) / 2
    r = (mx - mn).length / 2
    co.data.lens = lens
    co.data.sensor_width = 36
    fov = 2 * math.atan(18 * TH / TW / lens)
    d = r / math.sin(fov / 2) * 1.02 / zoom
    a, e = math.radians(az), math.radians(el)
    # Blender frame: model front (+Z gltf) = -Y blender.  az 0 = looking at the front.
    dirv = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    co.location = c + dirv * d
    co.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()
    co.data.clip_start = max(0.05, d * 0.01)
    co.data.clip_end = d * 20 + 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def ground(mn, mx, water):
    r = (mx - mn).length
    bpy.ops.mesh.primitive_plane_add(size=r * 60, location=((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, -0.002 * r if not water else 0.0))
    g = bpy.context.object
    m = bpy.data.materials.new('g')
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.10, 0.22, 0.30, 1) if water else (0.34, 0.34, 0.35, 1)
    bs.inputs['Roughness'].default_value = 0.35 if water else 0.9
    g.data.materials.append(m)
    return g


def sheet(name):
    sc, co = setup()
    p0 = '%s/%s.glb' % (DIR, name)
    obs = load(p0)
    mn, mx = bounds(obs)
    water = WATER
    ground(mn, mx, water)
    tiles = []
    views = [(35, 18, 1.2), (90, 6, 1.25), (215, 32, 1.2), (0, 8, 1.2)]
    if FAR:
        views = [(35, 18, 1.0), (90, 4, 1.0), (0, 5, 1.0), (215, 30, 1.0), (55, 1.5, 0.55)]
    else:
        views += [(140, 12, 1.6)]
    for i, (az, el, zm) in enumerate(views):
        f = '%s/tmp_%s_%d.png' % (SCR, name, i)
        shot(sc, co, mn, mx, az, el, f, zoom=zm * ZOOM, target=TARGET)
        tiles.append(f)
    # LOD1 tile (grey, no material)
    p1 = '%s/%s_lod1.glb' % (DIR, name)
    if os.path.exists(p1):
        for o in obs:
            o.hide_render = True
        o1 = load(p1)
        gm = bpy.data.materials.new('lod')
        gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.7, 0.62, 0.5, 1)
        for o in o1:
            if o.type == 'MESH':
                o.data.materials.clear()
                o.data.materials.append(gm)
        f = '%s/tmp_%s_l.png' % (SCR, name)
        shot(sc, co, mn, mx, 35, 18, f, zoom=(1.0 if FAR else 1.2) * ZOOM, target=TARGET)
        tiles.append(f)
    cols = 3 if len(tiles) > 4 else 2
    rows = (len(tiles) + cols - 1) // cols
    out = np.zeros((rows * TH, cols * TW, 4), np.float32)
    out[..., 3] = 1
    for i, f in enumerate(tiles):
        im = bpy.data.images.load(f)
        a = np.array(im.pixels[:], np.float32).reshape(TH, TW, 4)
        r, c = i // cols, i % cols
        out[(rows - 1 - r) * TH:(rows - r) * TH, c * TW:(c + 1) * TW] = a
        bpy.data.images.remove(im)
        os.remove(f)
    res = bpy.data.images.new('sheet', cols * TW, rows * TH)
    res.pixels.foreach_set(out.ravel())
    res.filepath_raw = '%s/sheet_%s%s.png' % (SCR, name, TAG)
    res.file_format = 'PNG'
    res.save()
    print('SHEET', res.filepath_raw)


def mini(names, tag):
    """Two tiles per model, all models on one sheet."""
    tw, th = 400, 300
    tiles = []
    for name in names:
        sc, co = setup()
        sc.render.resolution_x, sc.render.resolution_y = tw, th
        obs = load('%s/%s.glb' % (DIR, name))
        mn, mx = bounds(obs)
        ground(mn, mx, WATER)
        for i, (az, el, zm) in enumerate([(35, 18, 1.25), (270 if not FAR else 60, 6 if not FAR else 2, 1.25 if not FAR else .6), (200, 25, 1.25)]):
            f = '%s/tmp_%s_%d.png' % (SCR, name, i)
            sc.render.resolution_x, sc.render.resolution_y = tw, th
            global TW, TH
            TW, TH = tw, th
            shot(sc, co, mn, mx, az, el, f, zoom=zm * ZOOM, target=TARGET)
            im = bpy.data.images.load(f)
            tiles.append(np.array(im.pixels[:], np.float32).reshape(th, tw, 4))
            os.remove(f)
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    out = np.zeros((rows * th, cols * tw, 4), np.float32)
    out[..., 3] = 1
    for i, a in enumerate(tiles):
        r, c = i // cols, i % cols
        out[(rows - 1 - r) * th:(rows - r) * th, c * tw:(c + 1) * tw] = a
    res = bpy.data.images.new('sheet', cols * tw, rows * th)
    res.pixels.foreach_set(out.ravel())
    res.filepath_raw = '%s/mini_%s.png' % (SCR, tag)
    res.file_format = 'PNG'
    res.save()
    print('SHEET', res.filepath_raw)


if '--mini' in args:
    mini(names, TAG or names[0])
    names = []
for n in names:
    sheet(n)
