# SF kit: the two 'street' test renders (design-kit): a row of low pieces as the game would place them
# (some stretched 1.3x in width) and a downtown cluster of slabs and towers.
#   blender -b -P tools/sf/design/kit_render_scene.py
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault('KIT_RW', '1500'); os.environ.setdefault('KIT_RH', '760')
import kit_render as R
from mathutils import Vector

def place(name, x, y, sx=1.0, rot=0.0):
    obs = R.load(os.path.join(R.SRC, name + '.glb'))
    o = [a for a in obs if a.type == 'MESH'][0]
    o.location = (x, y, 0); o.scale = (sx, 1, 1); o.rotation_euler = (0, 0, rot)
    return o.dimensions.x

def row(names, y, front=1):
    x = 0.0; out = []
    for n, sx in names:
        import bpy
        obs = R.load(os.path.join(R.SRC, n + '.glb')); o = [a for a in obs if a.type == 'MESH'][0]
        bpy.context.view_layer.update()
        w = o.dimensions.x * sx; d = o.dimensions.y
        o.scale = (sx, 1, 1); o.rotation_euler = (0, 0, 0 if front > 0 else math.pi)
        o.location = (x + w / 2, y + front * d / 2, 0); x += w + 0.05
    return x

sc, co = R.setup(); R.ground(1200)
L = row([('sf_victorian_a', 1.0), ('sf_victorian_f', 1.15), ('sf_victorian_c', 1.0), ('sf_brick_a', 1.3), ('sf_victorian_b', 1.0), ('sf_lowrise_b', 1.0), ('sf_victorian_e', 1.3), ('sf_victorian_d', 1.0)], 0)
row([('sf_lowrise_a', 1.0), ('sf_brick_c', 1.2), ('sf_victorian_c', 1.0), ('sf_brick_b', 1.0), ('sf_lowrise_d', 1.0), ('sf_warehouse_a', 1.0), ('sf_lowrise_c', 1.0)], -62, -1)
R.look(co, (L * 0.5 - 20, -34, 9), (L * 0.52, 14, 6)); co.data.lens = 22
R.render(sc, os.path.join(R.OUT, 'street_row.png'))
import bpy
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'Plane']: bpy.data.objects.remove(o)
grid = [('sf_glasstower_d', 0, 0), ('sf_glassslab_d', 60, 0), ('sf_glasstower_b', 115, 0), ('sf_midrise_a', 170, 0),
        ('sf_glassslab_b', 0, 70), ('sf_glasstower_c', 60, 70), ('sf_glassslab_a', 118, 70), ('sf_midrise_d', 175, 70),
        ('sf_brick_e', 0, -62), ('sf_glassslab_c', 55, -62), ('sf_glasstower_a', 108, -62), ('sf_midrise_b', 160, -62),
        ('sf_apartment_c', -55, 0), ('sf_midrise_c', -55, -62), ('sf_apartment_a', -50, 70), ('sf_apartment_d', 215, -62), ('sf_warehouse_b', 220, 0), ('sf_brick_d', 215, 70)]
for n, x, y in grid: place(n, x, y)
R.look(co, (-70, -330, 150), (85, 10, 70)); co.data.lens = 30
R.render(sc, os.path.join(R.OUT, 'street_downtown.png'))
