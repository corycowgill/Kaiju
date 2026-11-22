# Tokyo kit: second-pass street / yard / roof detail for the low pieces (loaded last; wraps the registered builders). design-kit.
import math
import __main__
import numpy as np
from kit_lib import *
from kit_tk import *
from kit_warehouse import pallets
from kit_house import car


def more(name, extra):
    fn, meta = __main__.REG[name]
    __main__.REG[name] = ((lambda k, fn=fn: (fn(k), extra(k))), meta)


def fence(k, x0, z0, x1, z1, h=1.2, step=1.6, key='steel'):
    ps = props(k); L = math.hypot(x1 - x0, z1 - z0); n = max(1, int(L / step))
    for hh in (h, h * 0.55): k.bar([x0, hh, z0], [x1, hh, z1], 0.05, ps, PR[key])
    for i in range(n + 1): t = i / n; k.bar([x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t], [x0 + (x1 - x0) * t, h, z0 + (z1 - z0) * t], 0.06, ps, PR[key])


def lrow(k, x0, x1, y, z, n, alt=True):
    for i in range(n): lantern(k, V(x0 + (i + 0.5) * (x1 - x0) / n, y, z), 0.17, 0.42, 'lan_r' if (i % 2 == 0 or not alt) else 'lan_w')


def bikes(k, x, z, n, along='x'):
    for i in range(n): bike(k, x + (i * 0.55 if along == 'z' else 0), z + (i * 0.55 if along == 'x' else 0), 'z' if along == 'x' else 'x', ['dark', 'steel', 'tarp', 'red'][i % 4])


def x_house_b(k):
    lrow(k, 6.4, 11.0, 2.35, 1.05, 5); bikes(k, 10.0, 1.3, 2); pots(k, 6.3, 0.15, 3, 'x', 9); fence(k, 12.2, -1.0, 12.2, -9.0, 1.1, 1.3, 'dark')
    for i in range(3): pbox(k, [0.4 + i * 0.5, 0, -11.5], [0.45, 0, 0], [0, 0.7, 0], [0, 0, 0.35], 'crate', 'dark')


def x_house_d(k):
    lrow(k, 4.0, 9.0, 2.0, 1.0, 5); bikes(k, 1.6, 0.25, 2); pots(k, 9.4, -2.0, 4, 'z', 8); fence(k, 0.0, -9.7, 9.2, -9.7, 1.1, 1.3)
    pbox(k, [9.5, 0, -4.6], [0.45, 0, 0], [0, 0.45, 0], [0, 0, 1.5], 'wood', 'wood'); tv_antenna(k, 3.0, 7.6, -3.0, 1.8)
    for i in range(3): pbox(k, [2.2 + i * 0.55, 0, 0.15], [0.5, 0, 0], [0, 0.9, 0], [0, 0, 0.45], ['steel', 'blue', 'green'][i], 'dark')


def x_lowrise_b(k):
    fence(k, 13.5, -16.4, 18.0, -16.4, 1.6, 1.1); fence(k, 18.0, -16.4, 18.0, -2.0, 1.6, 1.3); bikes(k, 8.6, -6.0, 3)
    pole(k, 0.2, -0.3, 7.5, lamp=V(0.7, 0, -0.7)); pole(k, 17.6, -15.8, 7.5, lamp=V(-0.7, 0, 0.7))
    ac_rows(k, 2.0, 3.8, -15.5, 5, 1); ac_rows(k, 8.0, 3.8, -9.5, 3, 2)
    for i in range(4): k.cyl(13.4, -7.2 - i * 2.6, 0.09, 0, 0.9, 6, props(k), PR['yellow'], PR['top'])
    car(k, 14.8, -8.0, 1, 3.7, 1.6); pallets(k, 11.2, -17.0, 2, 'crate', 0.9, 0.5)
    for i in range(3): pbox(k, [5.0 + i * 0.7, 0, -6.45], [0.6, 0, 0], [0, 1.1, 0], [0, 0, 0.5], ['red', 'yellow', 'white'][i], 'dark')
    k.bar([12.6, 0, -16.6], [12.6, 4.1, -16.6], 0.05, props(k), PR['steel']); k.bar([12.2, 0, -16.6], [12.2, 4.1, -16.6], 0.05, props(k), PR['steel'])
    for i in range(8): k.bar([12.2, 0.4 + i * 0.45, -16.6], [12.6, 0.4 + i * 0.45, -16.6], 0.04, props(k), PR['steel'])


def x_lowrise_c(k):
    lrow(k, 0.5, 19.5, 7.0, 0.5, 14, alt=False); bikes(k, 12.8, 1.2, 3); pots(k, 0.4, 0.4, 4, 'x', 7)
    pole(k, 19.8, 2.6, 7.5, lamp=V(-0.7, 0, -0.7)); fence(k, 0.0, -12.2, 20.0, -12.2, 1.5, 1.3)
    ac_rows(k, 3.0, 8.2, -11.6, 4, 1); ac_rows(k, 12.0, 8.2, -11.6, 4, 1)
    for i in range(5):
        for z in (-0.6, -3.6): pbox(k, [0.2 + i * 4.72, 0, z - 0.35], [0.7, 0, 0], [0, 0.9, 0], [0, 0, 0.7], 'yellow', 'dark', sides='fblr')
    for i in range(6): k.box(1.0 + i * 3.2, 0, -5.9, 2.6 + i * 3.2, 0.14, -5.7, props(k), PR['conc'], PR['conc'])


def x_lowrise_d(k):
    x0 = 9.0; lrow(k, x0 + 0.4, x0 + 8.0, 2.35, -1.75, 7); bikes(k, 0.4, 0.4, 2)
    for i in range(9):
        if 2 <= i <= 4: continue
        px = x0 + 0.2 + i * 1.0; k.box(px, 0, -0.25, px + 0.2, 1.1, -0.05, props(k), (PR['conc'][0], PR['conc'][1], 0.2, 0.5), PR['conc'])
    for i in range(2): k.bar([x0 + 0.2 + (5 if i else 0) * 1.0, 0.8, -0.15], [x0 + 2.4 - 1.0 + (6.0 if i else 0), 0.8, -0.15], 0.07, props(k), PR['conc'])
    fence(k, 0.0, -7.4, 7.6, -7.4, 1.5, 1.3); pots(k, 6.0, 0.2, 2, 'x', 3); tv_antenna(k, 2.0, 7.1, -3.0, 1.6)


def x_warehouse_a(k):
    for i, (x, n, key) in enumerate(((1.6, 3, 'pallet'), (8.2, 2, 'crate'), (9.6, 4, 'pallet'), (16.6, 3, 'cont'), (24.6, 2, 'pallet'), (26.0, 3, 'white'), (32.8, 2, 'pallet'))): pallets(k, x, 1.9 + (i % 2) * 0.5, n, key)
    pole(k, -0.1, 3.4, 9.0, lamp=V(0.7, 0, 0.7)); pole(k, 36.1, 3.4, 9.0, lamp=V(-0.7, 0, 0.7)); fence(k, 0.0, -24.3, 36.0, -24.3, 1.8, 2.0)
    for i in range(4):
        for z in (-4.0, -12.0, -20.0): vent(k, i * 9.0 + 2.5, 8.4 + 2.8 * (1 - 2.5 / 9.0) - 0.1, z, 0.25, 0.8)
    pbox(k, [28.0, 0, 3.6], [2.5, 0, 0], [0, 2.6, 0], [0, 0, 6.1], 'cont', 'cont', bottom=True); pbox(k, [31.0, 0, 3.8], [2.5, 0, 0], [0, 2.6, 0], [0, 0, 6.1], 'red', 'red', bottom=True)
    car(k, 4.0, 8.5, 0, 3.9, 1.6)


def x_warehouse_b(k):
    for i in range(5):
        bx = i * 5.2 + 0.5; lantern(k, V(bx + 4.4, 3.3, 0.5), 0.2, 0.5, 'lan_r'); pallets(k, bx + 1.8, 1.7 + (i % 2) * 0.4, 2 + i % 2, ['white', 'crate', 'pallet', 'tarp', 'white'][i], 1.0, 0.8)
        for q in range(3): pbox(k, [bx + 0.3 + q * 0.75, 0, -1.2], [0.65, 0, 0], [0, 0.45 + 0.25 * ((q + i) % 3), 0], [0, 0, 0.5], ['white', 'tarp', 'crate'][(q + i) % 3], 'white')
    pole(k, -0.1, 2.6, 9.0, lamp=V(0.7, 0, 0.7)); pole(k, 38.3, 1.6, 9.0, lamp=V(-0.7, 0, 0.7)); fence(k, 26.2, -23.7, 38.2, -23.7, 1.8, 1.5)
    pbox(k, [14.0, 0, 2.2], [1.3, 0, 0], [0, 1.2, 0], [0, 0, 2.6], 'blue', 'white', bottom=True); pbox(k, [14.1, 1.2, 3.9], [1.1, 0, 0], [0, 0.7, 0], [0, 0, 0.8], 'dark', 'blue')     # turret truck


def x_warehouse_c(k):
    for i in range(6): pallets(k, 5.0 + i * 4.6, 3.9 + (i % 2) * 0.4, 2 + i % 3, ['pallet', 'crate', 'white'][i % 3])
    pole(k, -6.2, 0.5, 9.5, lamp=V(0.7, 0, 0.7)); pole(k, 42.2, 3.6, 9.5, lamp=V(-0.7, 0, 0.7))
    fence(k, 0.3, 25.5, 41.7, 25.5, 1.1, 2.0) if False else None
    for (a, b) in (((0.3, -0.3), (41.7, -0.3)), ((0.3, -27.7), (41.7, -27.7))): 
        for hh in (1.6, 2.0): k.bar([a[0], 25.2 + hh - 0.4, a[1]], [b[0], 25.2 + hh - 0.4, b[1]], 0.06, props(k), PR['steel'])
    fence(k, -6.0, -28.3, 42.0, -28.3, 1.8, 2.4)


for nm, fn in (('tokyo_house_b', x_house_b), ('tokyo_house_d', x_house_d), ('tokyo_lowrise_b', x_lowrise_b), ('tokyo_lowrise_c', x_lowrise_c), ('tokyo_lowrise_d', x_lowrise_d),
               ('tokyo_warehouse_a', x_warehouse_a), ('tokyo_warehouse_b', x_warehouse_b), ('tokyo_warehouse_c', x_warehouse_c)):
    more(nm, fn)
