# Tokyo kit: the two 'street' test renders (design-kit): a row of houses / zakkyo / shop rows as the game would place
# them (some stretched up to 1.3x) and a downtown cluster. KIT_DUSK=1 renders them at dusk with the emissive maps shown.
#   blender -b -P tools/tokyo/design/kit_render_scene.py
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault('KIT_RW', '1500'); os.environ.setdefault('KIT_RH', '760')
import bpy
import kit_render as R
SUF = '_dusk' if R.DUSK else ''

def place(name, x, y, sx=1.0, rot=0.0):
    obs = R.load(os.path.join(R.SRC, name + '.glb')); o = [a for a in obs if a.type == 'MESH'][0]
    o.location = (x, y, 0); o.scale = (sx, 1, 1); o.rotation_euler = (0, 0, rot)

def row(names, y, front=1):
    x = 0.0
    for n, sx in names:
        obs = R.load(os.path.join(R.SRC, 'tokyo_' + n + '.glb')); o = [a for a in obs if a.type == 'MESH'][0]
        bpy.context.view_layer.update()
        w = o.dimensions.x * sx; d = o.dimensions.y
        o.scale = (sx, 1, 1); o.rotation_euler = (0, 0, 0 if front > 0 else math.pi)
        o.location = (x + w / 2, y + front * d / 2, 0); x += w + 0.05
    return x

sc, co = R.setup(); R.ground(1200)
L = row([('house_a', 1.0), ('zakkyo_a', 1.2), ('zakkyo_d', 1.0), ('lowrise_a', 1.0), ('zakkyo_e', 1.3), ('zakkyo_c', 1.0), ('house_b', 1.15), ('zakkyo_f', 1.0), ('house_d', 1.0), ('zakkyo_b', 1.0), ('house_c', 1.0)], 0)
row([('house_e', 1.0), ('lowrise_d', 1.0), ('apartment_a', 1.0), ('lowrise_c', 1.0), ('house_a', 1.3), ('lowrise_b', 1.0), ('apartment_b', 1.0), ('midrise_a', 1.0)], -70, -1)
R.look(co, (L * 0.5 - 30, -40, 10), (L * 0.5 + 2, 14, 9)); co.data.lens = 22
R.render(sc, os.path.join(R.OUT, 'street_row%s.png' % SUF))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'Plane']: bpy.data.objects.remove(o)
grid = [('glasstower_d', 0, 0), ('glassslab_d', 62, 0), ('glasstower_b', 118, 0), ('midrise_c', 178, 0),
        ('glassslab_b', 0, 75), ('glasstower_c', 66, 75), ('glassslab_a', 126, 75), ('midrise_b', 190, 75),
        ('midrise_e', -2, -62), ('glassslab_c', 50, -62), ('glasstower_a', 106, -62), ('midrise_d', 160, -62),
        ('apartment_d', -62, 0), ('midrise_a', -50, -62), ('apartment_e', -62, 75), ('apartment_c', 205, -62), ('warehouse_c', 240, 0), ('zakkyo_b', 25, -62), ('zakkyo_d', 78, -66), ('zakkyo_e', 135, -62)]
for n, x, y in grid: place('tokyo_' + n, x, y)
R.look(co, (-80, -340, 150), (85, 10, 75)); co.data.lens = 30
R.render(sc, os.path.join(R.OUT, 'street_downtown%s.png' % SUF))
