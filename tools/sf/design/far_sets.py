# far_sets.py - true-size San Francisco set pieces: Bay Bridge (tower, centre anchorage, deck segment),
# Golden Gate Bridge, Alcatraz, Sutro Tower, Yerba Buena Island.
#   blender -b -P tools/sf/design/far_sets.py -- [names]
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

BB_PAL = {
    'grey': (0x9aa2a4, .55, 0), 'grey_d': (0x7c8588, .6, 0), 'grey_l': (0xb1b8b9, .5, 0), 'conc': (0xb6af9f, .9, 0),
    'conc_d': (0x958f80, .9, 0), 'tide': (0x55564a, .9, 0), 'road': (0x3b3c3f, .9, 0), 'shadow': (0x4a4d50, .9, 0),
    'beacon': (0xc02a20, .4, 0, 0xff3020), 'lamp': (0xfff0c8, .3, 0, 0xffe6a8), 'white': (0xd9d7cf, .6, 0), 'timber': (0x4c3b2c, .9, 0),
}


def plus_ring(cx, y, cz, hx, hz, c=0.28):
    a, d = hx * (1 - c), hz * (1 - c)
    P = [(hx, -d), (hx, d), (a, d), (a, hz), (-a, hz), (-a, d), (-hx, d), (-hx, -d), (-a, -d), (-a, -hz), (a, -hz), (a, -d)]
    return [(cx + x, y, cz + z) for x, z in P]


def rect_ring(cx, y, cz, hx, hz):
    return [(cx + hx, y, cz - hz), (cx + hx, y, cz + hz), (cx - hx, y, cz + hz), (cx - hx, y, cz - hz)]


def bay_bridge_tower(b):
    """One suspension tower of the western span: 158 m above the water, two legs 22 m apart (X = across the bridge)."""
    # concrete pier with rounded ends
    n = 8 if b.hi else 4
    stad = lambda hx, hz: [(hx - hz + hz * cos(radians(-90 + 180 * i / n)), hz * sin(radians(-90 + 180 * i / n))) for i in range(n + 1)] + \
        [(-(hx - hz) + hz * cos(radians(90 + 180 * i / n)), hz * sin(radians(90 + 180 * i / n))) for i in range(n + 1)]
    b.prism(stad(19.5, 8.0), 'y', 0, 3.0, 'tide', smooth=40)
    b.prism(stad(18.5, 7.0), 'y', 3.0, 12.0, 'conc', smooth=40)
    for sx in b.mirx():
        b.tb(11, 12, 0, 6.4, 9.6, 4, 5.0, 7.8, 'conc_d', skip='d')
    lv = [(16, 2.0, 3.4), (55, 1.85, 3.1), (76, 1.75, 2.95), (117, 1.5, 2.5), (154, 1.3, 2.15)]
    for sx in b.mirx():
        if b.hi:
            b.loft([plus_ring(11, y, 0, hx, hz) for y, hx, hz in lv], ['grey', 'grey_d', 'grey_l', 'grey_d', 'grey', 'grey_d', 'grey_l', 'grey_d', 'grey', 'grey_d', 'grey_l', 'grey_d'], capcol='grey_d')
        else:
            b.loft([rect_ring(11, y, 0, hx, hz) for y, hx, hz in (lv[0], lv[2], lv[4])], 'grey', capcol='grey_d')
        # cable saddle housing + beacon
        b.tb(11, 154, 0, 3.4, 6.0, 2.6, 2.6, 4.4, 'grey_d', skip='d')
        b.tb(11, 156.6, 0, 2.2, 3.6, 1.2, 1.4, 2.0, 'grey', skip='d')
        b.bb(11, 157.8, 0, .5, .2, .5, 'beacon')

    def hw(y):  # inner face x of a leg at height y
        for (y0, a, _), (y1, c, _) in zip(lv, lv[1:]):
            if y0 <= y <= y1:
                return 11 - lerp(a, c, (y - y0) / (y1 - y0))
        return 11 - 1.3

    def zw(y):
        for (y0, _, a), (y1, _, c) in zip(lv, lv[1:]):
            if y0 <= y <= y1:
                return lerp(a, c, (y - y0) / (y1 - y0))
        return 2.15
    struts = [(17.5, 3.0), (36.5, 2.2), (54.0, 2.6), (77.5, 4.2), (97.5, 2.4), (117, 2.4), (136.5, 2.4), (152.2, 3.4)]
    for y, d in struts:
        x = hw(y) + .3
        z = zw(y) * .72
        b.box(-x, y - d / 2, -z, x, y + d / 2, z, 'grey', skip='lr', f='grey_l', b='grey_l', d='grey_d')
    # portal haunches under the strut above the roadway
    for sx in b.mirx():
        x = hw(75)
        b.prism([(x + .3, 75.4), (x - 3.2, 75.4), (x + .3, 70.5)], 'z', -zw(75) * .7, zw(75) * .7, 'grey_d', capcol='grey')
    tiers = [(0, 1), (1, 2), (3, 4), (4, 5), (5, 6), (6, 7)]
    for i0, i1 in tiers:
        ya, yb = struts[i0][0] + struts[i0][1] / 2, struts[i1][0] - struts[i1][1] / 2
        xa, xb = hw(ya) + .2, hw(yb) + .2
        planes = [zw((ya + yb) / 2) * .62 * s for s in (1, -1)] if b.hi else [0.0]
        for z in planes:
            b.beam((-xa, ya, z), (xb, yb, z), 1.15, .9 if b.hi else 2.4, 'grey_l', up=(0, 0, 1), lx=False)
            b.beam((xa, ya, z), (-xb, yb, z), 1.15, .9 if b.hi else 2.4, 'grey', up=(0, 0, 1), lx=False)
            if b.hi:
                b.bb(0, (ya + yb) / 2 - 1.3, z, 3.0, 2.6, 1.0, 'grey_d')
    b.prism(stad(20.3, 8.8), 'y', 0.6, 2.2, 'timber', caps=0)  # timber fender skirt at the water line


def bay_bridge_deck_segment(b):
    """60 m of the double-deck stiffening truss (Z along the bridge): upper deck y 67, lower y 58, 20 m wide."""
    b.box(-10, 66.1, -30, 10, 67, 30, 'grey', u='road', d='grey_d')
    b.box(-10, 57.1 if b.hi else 56.1, -30, 10, 58, 30, 'grey', u='road', d='grey_d')
    for sx in b.mirx():
        b.box(9.7, 67, -30, 10, 68.0, 30, 'grey_l', skip='d')
        b.box(9.75, 58, -30, 10, 58.9, 30, 'grey_l', skip='d')
        nodes = [-30 + 10 * i for i in range(7)]
        for i, z in enumerate(nodes):
            w = .35 if i in (0, 6) else .7
            zc = z + (.175 if i == 0 else -.175 if i == 6 else 0)
            if b.hi or i % 2 == 0:
                b.box(9.45, 58, zc - w / 2, 9.95, 66.1, zc + w / 2, 'grey', skip='ud')
        for i in range(6):
            za, zb = nodes[i], nodes[i + 1]
            ya, yb = (58.4, 65.8) if i % 2 == 0 else (65.8, 58.4)
            b.beam((9.7, ya, za + .4), (9.7, yb, zb - .4), .5, .55, 'grey_l', up=(1, 0, 0), lx=True)
        for z in (-15, 15):
            b.beam((9.85, 68, z), (9.85, 76.5, z), .22, .22, 'grey_d', lx=True)
            b.beam((9.85, 76.4, z), (7.6, 77.0, z), .18, .18, 'grey_d', lx=True)
            b.box(7.0, 76.75, z - .3, 7.9, 76.95, z + .3, 'lamp', skip='' if b.hi else 'lrfb')
    if b.hi:
        for z in (-20, 0, 20):
            b.box(-9.5, 65.1, z - .3, 9.5, 66.1, z + .3, 'grey_d', skip='ulr')
            b.box(-9.5, 56.1, z - .3, 9.5, 57.1, z + .3, 'grey_d', skip='ulr')


def bay_bridge_anchorage(b):
    """Centre anchorage (W4): tapered concrete monolith 30 x 60 m, 85 m tall, the decks pass through an arched portal."""
    b.tb(0, 0, 0, 34, 64, 3.5, 33, 63, 'tide')
    b.tb(0, 3.5, 0, 32, 62, 8.5, 31, 60.5, 'conc_d', skip='d')
    b.tb(0, 12, 0, 31, 60.5, 44, 29.4, 56, 'conc', skip='d', u='road')
    # deco pilasters on the long sides and the ends
    if b.hi:
        for sx in b.mirx():
            for z in (-21, -10.5, 0, 10.5, 21):
                b.hexa([(15.45, 12, z - 1.6), (16.0, 12, z - 1.6), (16.0, 12, z + 1.6), (15.45, 12, z + 1.6),
                        (14.68, 52, z - 1.4), (15.2, 52, z - 1.4), (15.2, 52, z + 1.4), (14.68, 52, z + 1.4)], 'conc_d', skip='dl')
        for sz in b.mirz():
            for x in (-9, 0, 9):
                b.hexa([(x - 1.6, 12, 30.2), (x + 1.6, 12, 30.2), (x + 1.6, 12, 30.8), (x - 1.6, 12, 30.8),
                        (x - 1.4, 52, 27.95), (x + 1.4, 52, 27.95), (x + 1.4, 52, 28.5), (x - 1.4, 52, 28.5)], 'conc_d', skip='db')
    # side walls flanking the roadway, sloped shoulders where the cables come in
    for sx in b.mirx():
        b.hexa([(10.6, 56, -28), (14.7, 56, -28), (14.7, 56, 28), (10.6, 56, 28),
                (10.6, 82, -19), (14.0, 82, -19), (14.0, 82, 19), (10.6, 82, 19)], 'conc', skip='d', l='shadow')
        if b.hi:
            for z in (-12, 0, 12):  # tall deco recess panels
                b.box(14.5, 58, z - 3.2, 14.75, 78, z + 3.2, 'conc_d', skip='l')
            for sz in b.mirz():  # cable entry housings
                b.hexa([(10.4, 72, 21.0), (14.6, 72, 21.0), (14.6, 69, 25.6), (10.4, 69, 25.6),
                        (10.4, 76, 21.3), (14.6, 76, 21.3), (14.6, 72.5, 26.4), (10.4, 72.5, 26.4)], 'conc_d')
    # roof slab with the arched soffit
    na = 8 if b.hi else 3
    prof = [(-10.6, 82)] + [(-10.6 * cos(radians(180 * i / na)), 69.5 + 6.0 * sin(radians(180 * i / na))) for i in range(na + 1)][::-1][::-1] + [(10.6, 82)]
    prof = [(-10.6, 82), (-10.6, 69.5)] + [(-10.6 * cos(radians(180 * i / na)), 69.5 + 6.0 * sin(radians(180 * i / na))) for i in range(1, na)] + [(10.6, 69.5), (10.6, 82)]
    cols = ['conc'] + ['shadow'] * na + ['conc', 'conc']
    b.prism(prof, 'z', -19.5, 19.5, cols, capcol='conc')
    # stepped deco top
    b.tb(0, 82, 0, 28, 38, 1.5, 26, 34, 'conc_d', skip='d')
    b.tb(0, 83.5, 0, 20, 26, 1.5, 18, 22, 'conc', skip='d')
    b.bb(0, 85, 0, .8, .0001, .8, 'conc')
    if b.hi:
        for sx in b.mirx():
            b.bb(12.3, 83.5, 0, 1.0, 1.2, 1.0, 'beacon')



# ------------------------------------------------------------------ Golden Gate Bridge
GG_PAL = {
    'io': (0xc0362c, .5, 0), 'io_d': (0x98291f, .55, 0), 'io_l': (0xcf4a3b, .5, 0), 'road': (0x3b3c3f, .9, 0),
    'conc': (0xbdb29a, .9, 0), 'conc_d': (0x9d9480, .9, 0), 'tide': (0x55564a, .9, 0), 'beacon': (0xc02a20, .4, 0, 0xff3020),
    'shadow': (0x6d1d17, .8, 0),
}


def cat_a(half, sag):
    lo, hi = 50.0, 1e6
    for _ in range(100):
        a = (lo + hi) / 2
        if a * (math.cosh(half / a) - 1) > sag:
            lo = a
        else:
            hi = a
    return a


def cat_pts(x0, y0, x1, y1, a, n):
    lo, hi = x0 - 50 * a, x1 + 50 * a
    lo, hi = x0 - 6 * a, x1 + 6 * a
    f = lambda xm: a * (math.cosh((x1 - xm) / a) - math.cosh((x0 - xm) / a)) - (y1 - y0)
    for _ in range(100):  # f decreases with xm
        xm = (lo + hi) / 2
        if f(xm) > 0:
            lo = xm
        else:
            hi = xm
    c = y0 - a * math.cosh((x0 - xm) / a)
    fy = lambda x: a * math.cosh((x - xm) / a) + c
    return [(x0 + (x1 - x0) * i / n, fy(x0 + (x1 - x0) * i / n)) for i in range(n + 1)], fy


GG_SEC = [(13, 67, 15.5, 9.6), (67, 104, 13.4, 8.6), (104, 141, 11.8, 7.7), (141, 175, 10.2, 6.9), (175, 207, 8.8, 6.2), (207, 222, 7.6, 5.6)]
GG_STRUT = [(98, 110), (136, 146), (171, 180), (203, 211)]
LEGZ = 13.7


def gg_tower(b, x0, fender):
    n = 6 if b.hi else 3
    stz = lambda hx, hz: [(x0 + hx * cos(radians(180 * i / n)), (hz - hx) + hx * sin(radians(180 * i / n))) for i in range(n + 1)] + \
        [(x0 + hx * cos(radians(180 + 180 * i / n)), -(hz - hx) + hx * sin(radians(180 + 180 * i / n))) for i in range(n + 1)]
    b.prism(stz(12.5, 28), 'y', 0, 3, 'tide', smooth=40)
    b.prism(stz(11.5, 27), 'y', 3, 13, 'conc', smooth=40)
    if fender:
        with b.at(x0, 0, 0):
            b.lathe([(1.0, 0), (1.0, 4.5), (.93, 4.5), (.93, 0)], n=20, col=['conc_d', 'conc', 'conc_d'], sx=27, sz=47, caps=0, nl=12, smooth=40)
    for sz in b.mirz():
        for i, (y0, y1, wx, wz) in enumerate(GG_SEC):
            cz = LEGZ - (9.6 - wz) * .28
            cols = ['io', 'io_d', 'io_l', 'io_d'] * 3
            if b.hi:
                b.loft([plus_ring(x0, y0, cz, wx / 2, wz / 2, .22), plus_ring(x0, y1, cz, wx / 2 * .965, wz / 2 * .965, .22)], cols, caps=2, capcol='io_l')
            else:
                b.loft([rect_ring(x0, y0, cz, wx / 2, wz / 2), rect_ring(x0, y1, cz, wx / 2 * .965, wz / 2 * .965)], 'io', caps=2 if i == len(GG_SEC) - 1 else 0, capcol='io_l')
        b.tb(x0, 222, LEGZ - 1.1, 6.6, 5.0, 3.2, 5.0, 3.6, 'io_d', skip='d')
        b.tb(x0, 225.2, LEGZ - 1.1, 3.6, 2.6, 1.8, 2.4, 1.6, 'io', skip='d')
        if b.hi:
            b.bb(x0, 226.9, LEGZ - 1.1, .8, .1, .8, 'beacon')
    b.bb(x0, 226.999, 0, .2, .001, .2, 'io')
    # portal struts, stepping in toward the top (Art Deco corbels at the ends)
    for k, (y0, y1) in enumerate(GG_STRUT):
        wx, wz = GG_SEC[k + 1][2], GG_SEC[k + 1][3]
        zi = LEGZ - (9.6 - wz) * .28 - wz / 2 + .4
        d = wx * .34
        b.box(x0 - d, y0, -zi, x0 + d, y1, zi, 'io', skip='fb', d='io_d', u='io_l')
        b.box(x0 - d * .72, y1, -zi, x0 + d * .72, y1 + (y1 - y0) * .28, zi, 'io_d', skip='fbd', u='io_l')
        for sz in b.mirz():
            b.prism([(zi, y0 - 7.0), (zi, y0), (zi - 7.5, y0), (zi - 4.6, y0 - 1.6), (zi - 4.6, y0 - 3.2), (zi - 2.2, y0 - 3.2), (zi - 2.2, y0 - 5.4)][::1] if b.hi else
                    [(zi, y0 - 7.0), (zi, y0), (zi - 7.5, y0)], 'x', x0 - d * .8, x0 + d * .8, 'io_d', capcol='io')
    # below the roadway: struts and X bracing
    zi = LEGZ - 9.6 / 2 + .5
    for y0, y1 in ((38, 42), (57, 61)):
        b.box(x0 - 4, y0, -zi, x0 + 4, y1, zi, 'io', skip='fb', d='io_d')
    for ya, yb in ((14, 38), (42, 57)):
        for s in (1, -1):
            b.beam((x0, ya, -zi * s), (x0, yb, zi * s), 2.4, 3.2, 'io_l' if s > 0 else 'io', up=(1, 0, 0))


def gg_pylon(b, x0, y1=98):
    for sz in b.mirz():
        b.tb(x0, 0, 18.2, 11, 8.4, 60, 10, 7.6, 'conc', skip='d')
        b.tb(x0, 60, 18.2, 10, 7.6, y1 - 68, 9.2, 7.0, 'conc', skip='d')
        b.tb(x0, y1 - 8, 18.2, 7.6, 5.8, 5, 7.0, 5.4, 'conc_d', skip='d')
        b.tb(x0, y1 - 3, 18.2, 5.0, 4.0, 3, 4.2, 3.4, 'conc', skip='d')
        if b.hi:
            for dx in (-2.6, 0, 2.6):  # vertical flutes
                b.box(x0 + dx - .6, 64, 18.2 + 3.55, x0 + dx + .6, y1 - 10, 18.2 + 3.85, 'conc_d', skip='b')
    b.box(x0 - 4, 44, -14.2, x0 + 4, 59.4, 14.2, 'conc_d', skip='fb')


def golden_gate_bridge(b):
    """The whole bridge, 2,737 m along X (-X = the San Francisco / south end), origin at mid-span on the water."""
    XS, XN = -1423.0, 1314.0
    gg_tower(b, -640, True)
    gg_tower(b, 640, False)
    # stiffening truss + roadway between the pylons
    for sz in b.mirz():
        b.box(-983, 59.4, 13.0, 983, 60.3, 13.7, 'io', skip='lr')
        b.box(-983, 67, 12.9, 983, 68.3, 13.7, 'io', skip='lrd')
        pn = 25.0
        nP = int(round(1966 / pn))
        step = 1 if b.hi else 3
        for i in range(0, nP, step):
            xa = -983 + i * 1966 / nP
            xb = -983 + (i + step) * 1966 / nP
            ya, yb = (60.3, 65.6) if (i // step) % 2 == 0 else (65.6, 60.3)
            w = 1.3 if b.hi else 2.2
            dx = w * .5
            b.quad((xa - dx, ya, 13.68), (xa + dx, ya, 13.68), (xb + dx, yb, 13.68), (xb - dx, yb, 13.68), 'io_l')
    b.box(-983, 65.6, -13.7, 983, 67, 13.7, 'io', skip='lr', u='road', d='io_d')
    b.quad((-983, 59.6, -13), (983, 59.6, -13), (983, 59.6, 13), (-983, 59.6, 13), 'shadow')
    # main cables (catenaries) and suspender ropes
    a = cat_a(640, 224.4 - 71.0)
    nm, ns = (36, 10) if b.hi else (16, 5)
    main, fm = cat_pts(-640, 224.4, 640, 224.4, a, nm)
    sideS, fs = cat_pts(-983, 73.0, -640, 224.4, a, ns)
    sideN, fn = cat_pts(640, 224.4, 983, 73.0, a, ns)
    for sz in b.mirz():
        z = LEGZ - 1.1
        b.tube([(x, y, z) for x, y in sideS[:-1] + main + sideN[1:]], 1.0 if b.hi else 1.3, n=4 if b.hi else 3, col='io', caps=0, up=(0, 0, 1), smooth=None)
        sp = 1280 / 48 * (1 if b.hi else 3)
        x = -983 + sp * .9
        while x < 983 - sp * .5:
            f = fs if x < -640 else (fn if x > 640 else fm)
            yc = f(x)
            if abs(abs(x) - 640) > 9 and yc - 68.3 > 2:
                w = .32 if b.hi else .8
                b.quad((x - w, 68.3, z), (x + w, 68.3, z), (x + w, yc, z), (x - w, yc, z), 'io')
            x += sp
        # cable housings at the pylons
        for xp in (-983, 983):
            b.box(xp - 7, 66, 11.4, xp + 7, 76, 14.2, 'conc_d', skip='f')
    # pylons: both ends of the suspended spans + the south arch's far pylon
    for xp in (-983, 983, -1080):
        gg_pylon(b, xp)
    # Fort Point arch (south): steel arch under the deck between the two south pylons
    for sz in b.mirz():
        na = 8 if b.hi else 4
        pts = [(-1075 + 87 * i / na, 26 + 31.5 * sin(pi * i / na)) for i in range(na + 1)]
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            b.beam((xa, ya, 10), (xb, yb, 10), 1.6, 2.6, 'io', up=(0, 0, 1), lx=True)
        for i in range(1, na):
            if i != na // 2:
                b.beam((pts[i][0], pts[i][1], 10), (pts[i][0], 61.5, 10), 1.0, 1.0, 'io_d', lx=True)
    # approach viaducts: girder deck on steel bents; the ground rises to the abutments
    for xa, xb, g0, g1, nsp in ((-1080, XS, 8.0, 58.0, 6), (983, XN, 12.0, 58.0, 5)):
        x0, x1 = min(xa, xb), max(xa, xb)
        b.box(x0, 61.6, -13.7, x1, 67, 13.7, 'io', skip='', u='road', d='io_d')
        for sz in b.mirz():
            b.box(x0, 67, 12.9, x1, 68.3, 13.7, 'io', skip='d')
        for i in range(1, nsp):
            t = i / nsp
            x = lerp(xa, xb, t)
            g = lerp(g0, g1, t)
            for sz in b.mirz():
                b.beam((x, g, 11.5), (x, 61.6, 9.5), 3.0, 2.6, 'io', up=(1, 0, 0), lx=True)
            if b.hi and 61.6 - g > 14:
                b.beam((x, g + 3, -11.3), (x, 58, 9.7), 1.2, 1.2, 'io_d', up=(1, 0, 0))
                b.beam((x, g + 3, 11.3), (x, 58, -9.7), 1.2, 1.2, 'io_d', up=(1, 0, 0))
        b.box(xb - 6 if xb > xa else xb, 50, -15, xb if xb > xa else xb + 6, 67, 15, 'conc', skip='')
    if b.hi:  # arch-span deck truss is shallower: fascia between the south pylons
        pass
    b.box(-1080, 61.6, -13.7, -983, 65.6, 13.7, 'io', skip='lru', d='io_d')


# ------------------------------------------------------------------ Sutro Tower
SU_PAL = {
    'red': (0xc5432e, .5, 0), 'white': (0xe6e4dc, .5, 0), 'steel': (0x8d9194, .5, 0), 'conc': (0xa9a598, .9, 0),
    'beacon': (0xc02a20, .4, 0, 0xff3020), 'grey_d': (0x5d6164, .6, 0), 'red_d': (0xa33523, .55, 0),
}


def sutro_tower(b):
    """Three-legged red-and-white candelabra TV tower, 298 m."""
    L1, L3, L6 = 0.0, 115.0, 232.0
    ang = [radians(90 + 120 * i) for i in range(3)]

    def rr(y):
        return lerp(26.5, 10.6, y / L3) if y <= L3 else lerp(10.6, 17.6, min(1, (y - L3) / (L6 - L3)))

    def tt(y):
        return lerp(4.2, 3.0, y / L3) if y <= L3 else lerp(3.0, 2.5, min(1, (y - L3) / (L6 - L3)))

    def leg(i, y):
        return Vector((rr(y) * cos(ang[i]), y, rr(y) * sin(ang[i])))

    def tri(i, y, t):
        c = leg(i, y)
        return [c + Vector((t * cos(ang[i] + radians(120 * k)), 0, t * sin(ang[i] + radians(120 * k)))) for k in range(3)]

    def band(y):
        return 'red' if int(y / 232.0 * 12 + 1e-6) % 2 == 0 else 'white'
    nb = 12 if b.hi else 6
    for i in range(3):
        ys = [L6 * k / nb for k in range(nb + 1)]
        if L3 not in ys:
            ys = sorted(ys + [L3])
        for ya, yb in zip(ys, ys[1:]):
            b.loft([tri(i, ya, tt(ya)), tri(i, yb, tt(yb))], band((ya + yb) / 2), caps=0)
        c = leg(i, 0)
        b.bb(c.x, 0, c.z, 13, 2.5, 13, 'conc')
        # antenna masts
        top = (298.0, 291.0, 285.0)[i]
        c = leg(i, L6)
        ms = [(L6, 2.5), (L6 + 12, 2.2), (L6 + 24, 1.9), (L6 + 36, 1.6), (L6 + 46, 1.3)]
        for k, ((ya, ta), (yb, tb_)) in enumerate(zip(ms, ms[1:])):
            b.loft([tri(i, ya, ta), tri(i, yb, tb_)], 'red' if k % 2 == 0 else 'white', caps=2 if k == 3 else 0)
        b.cyl((c.x, L6 + 46, c.z), (c.x, top - 6, c.z), .8, .7, n=5, col='white', nl=3)
        b.cyl((c.x, top - 6, c.z), (c.x, top, c.z), .5, .25, n=5, col='red', nl=3)
        if b.hi:
            b.bb(c.x, L6 + 46, c.z, 3.4, .6, 3.4, 'grey_d')
    # horizontal trusses between the legs
    for y, dep, colr in ((57.0, 6.0, 'red'), (L3, 7.0, 'white'), (172.0, 7.0, 'red'), (L6 - 9.0, 9.0, 'white')):
        for i in range(3):
            j = (i + 1) % 3
            pa0, pb0 = leg(i, y), leg(j, y)
            pa1, pb1 = leg(i, y + dep), leg(j, y + dep)
            b.beam(pa0, pb0, 1.1, 1.1, colr, lx=True)
            b.beam(pa1, pb1, 1.1, 1.1, colr, lx=True)
            npn = 6 if b.hi else 2
            for k in range(npn):
                t0, t1 = k / npn, (k + 1) / npn
                lo0, hi1 = pa0.lerp(pb0, t0), pa1.lerp(pb1, t1)
                hi0, lo1 = pa1.lerp(pb1, t0), pa0.lerp(pb0, t1)
                if k % 2 == 0:
                    b.beam(lo0, hi1, .6, .6, colr, lx=True)
                else:
                    b.beam(hi0, lo1, .6, .6, colr, lx=True)
                if b.hi and k > 0:
                    b.beam(lo0, hi0, .5, .5, colr)
            if b.hi:  # plan bracing to the centre
                b.beam(pa0.lerp(pb0, .5), Vector((0, y, 0)), .6, .6, 'steel')
    # X bracing between truss levels (thin rods)
    for ya, yb in ((63.0, L3), (L3 + 7, 172.0), (179.0, L6 - 9)):
        for i in range(3):
            j = (i + 1) % 3
            b.beam(leg(i, ya), leg(j, yb), .45, .45, 'steel', lx=True)
            b.beam(leg(j, ya), leg(i, yb), .45, .45, 'steel', lx=True)
    # top platform (level 6) and equipment
    b.pid += 1
    for y, c in ((L6, 'steel'),):
        P = [leg(i, y) + (leg(i, y) - Vector((0, y, 0))).normalized() * 3.5 for i in range(3)]
        Q = [p - Vector((0, 1.2, 0)) for p in P]
        b.loft([[tuple(q) for q in Q], [tuple(p) for p in P]], 'white', capcol='steel', smooth=None)
    if b.hi:
        b.bb(0, L6, 0, 6, 3, 6, 'white')
        b.cyl((0, L6 + 3, 0), (0, L6 + 14, 0), .4, n=4, col='red')
        for i in range(3):
            c = leg(i, 298 - (0, 7, 13)[i])
            b.bb(c.x, c.y - .3, c.z, .7, .3, .7, 'beacon')
        b.bb(0, 0, 0, 30, 6, 22, 'conc', u='grey_d')
    else:
        b.bb(0, 0, 0, 30, 6, 22, 'conc')



# ------------------------------------------------------------------ islands
def island(b, N, base, levels, yfn, colfn, seed=3, top='dirt', jit=0.02):
    """Rock lofted up through outline rings.  base(theta) -> (x, z); levels: [(y, scale, (cx, cz), ell|None, blend)]
    where ell = (rx, rz) pulls the ring toward an ellipse.  yfn(x, z, y) -> y (terraces).  colfn(ny, rnd, y) -> colour."""
    rnd = random.Random(seed)
    rings = []
    for k, (y, sc, (cx, cz), ell, bl) in enumerate(levels):
        ring = []
        for i in range(N):
            th = 2 * pi * i / N
            x, z = base(th)
            j = 1 + (rnd.uniform(-jit, jit) if 0 < k else 0)
            px, pz = cx + (x - cx) * sc * j, cz + (z - cz) * sc * j
            if ell:
                ex, ez = cx + ell[0] * cos(th), cz + ell[1] * sin(th)
                px, pz = lerp(px, ex, bl), lerp(pz, ez, bl)
            ring.append(Vector((px, yfn(px, pz, y), pz)))
        rings.append(ring)
    b.pid += 1
    for k in range(len(rings) - 1):
        for i in range(N):
            j = (i + 1) % N
            P = [rings[k][j], rings[k][i], rings[k + 1][i], rings[k + 1][j]]
            nrm = (P[1] - P[0]).cross(P[3] - P[0])
            if nrm.length < 1e-9:
                nrm = (P[2] - P[1]).cross(P[3] - P[1])
            ny = nrm.normalized().y if nrm.length > 1e-9 else 1
            if ny < 0:
                P.reverse()
                ny = -ny
            c = colfn(ny, rnd.random(), (P[0].y + P[2].y) / 2)
            # split the quad so each triangle is flat (crisp rock facets)
            b.face([P[0], P[1], P[2]], c)
            b.face([P[0], P[2], P[3]], c)
    cap = list(rings[-1])
    nrm = Vector()
    for t in range(len(cap)):
        a, c_ = cap[t], cap[(t + 1) % len(cap)]
        nrm += Vector(((a.y - c_.y) * (a.z + c_.z), (a.z - c_.z) * (a.x + c_.x), (a.x - c_.x) * (a.y + c_.y)))
    if nrm.y < 0:
        cap.reverse()
    ctr = sum(cap, Vector()) / len(cap)
    for t in range(len(cap)):
        b.face([ctr, cap[t], cap[(t + 1) % len(cap)]], top)
    return rings


def block(b, sx, h, sz, wall, roof, floors=1, bx=1, bz=1, win='win', wf=.5, hf=.55, base=0.0, sides='fblr'):
    """Simple building: walls with window cells, flat roof.  Origin at the base centre (use inside b.at)."""
    def wallgrid(o, du, w, nb, flip):
        us, vs = [0.0], [0.0, base] if base else [0.0]
        for i in range(nb):
            a = w * i / nb
            us += [a + w / nb * (1 - wf) / 2, a + w / nb * (1 + wf) / 2, a + w / nb]
        fh = (h - base) / floors
        for j in range(floors):
            a = base + fh * j
            vs += [a + fh * (1 - hf) / 2, a + fh * (1 + hf) / 2, a + fh]

        def f(u, v):
            if not b.hi or v < base:
                return wall
            iu = (u % (w / nb)) / (w / nb)
            iv = ((v - base) % fh) / fh
            return win if ((1 - wf) / 2 < iu < (1 + wf) / 2 and (1 - hf) / 2 < iv < (1 + hf) / 2) else wall
        b.grid(o, du, (0, 1, 0), us, vs, f, flip=flip)
    if 'f' in sides:
        wallgrid((-sx / 2, 0, sz / 2), (1, 0, 0), sx, bx, False)
    if 'b' in sides:
        wallgrid((-sx / 2, 0, -sz / 2), (1, 0, 0), sx, bx, True)
    if 'r' in sides:
        wallgrid((sx / 2, 0, -sz / 2), (0, 0, 1), sz, bz, True)
    if 'l' in sides:
        wallgrid((-sx / 2, 0, -sz / 2), (0, 0, 1), sz, bz, False)
    if roof:
        b.quad((-sx / 2, h, sz / 2), (sx / 2, h, sz / 2), (sx / 2, h, -sz / 2), (-sx / 2, h, -sz / 2), roof)


AL_PAL = {
    'rock': (0xb09a6e, .95, 0), 'rock_d': (0x8d7950, .95, 0), 'rock_l': (0xc2ad82, .95, 0), 'tide': (0x4c4a3b, .9, 0),
    'scrub': (0x66733f, .95, 0), 'scrub_d': (0x4c5c38, .95, 0), 'dirt': (0xaba28a, .95, 0), 'cell': (0xd8d1bb, .85, 0),
    'cell_d': (0xb7af98, .85, 0), 'roofc': (0x98958a, .9, 0), 'win': (0x3b4044, .4, 0), 'rust': (0x9a4a34, .7, 0),
    'steel': (0x5f6163, .6, 0), 'white': (0xe3e0d3, .7, 0), 'black': (0x26272a, .6, 0), 'lamp': (0xfff0c2, .2, 0, 0xffe9a8),
    'ruin': (0xa49b85, .95, 0), 'timber': (0x6b5a45, .9, 0), 'chim': (0xa3876c, .9, 0), 'tree': (0x3d5634, .95, 0),
    'ruin_d': (0x7d7566, .95, 0),
}


def alcatraz(b):
    """Alcatraz Island, 510 x 180 m, long axis X (-X = the north-west end, +Z = the dock / city-facing east side)."""
    def base(th):
        c, s_ = cos(th), sin(th)
        x = 255 * (abs(c) ** .85) * (1 if c >= 0 else -1)
        z = 90 * (abs(s_) ** .9) * (1 if s_ >= 0 else -1)
        m = 1 + .05 * sin(3 * th + 1.0) + .035 * sin(5 * th + 2.0) + .025 * sin(8 * th + .5)
        z *= m * (.80 + .20 * (x / 255 + 1) / 2)
        return x * (1 + .012 * sin(7 * th)), z
    N = 44 if b.hi else 20
    pts = [base(2 * pi * i / N) for i in range(N)]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    z0, z1 = min(p[1] for p in pts), max(p[1] for p in pts)

    def nb(th):
        x, z = base(th)
        return ((x - (x0 + x1) / 2) * 510 / (x1 - x0), (z - (z0 + z1) / 2) * 180 / (z1 - z0))

    def yfn(x, z, y):
        t = smooth((x - 120) / 45)           # south-east parade ground terrace
        y = lerp(y, min(y, 20.0), t)
        t = smooth((-150 - x) / 40)          # north-west industries terrace
        y = lerp(y, min(y, 11.0), t)
        if 24 < x < 150 and z > 70:          # the dock shelf
            y = min(y, 3.2)
        return y

    def colfn(ny, r, y):
        if y < 2.5:
            return 'tide'
        if ny > .9:
            return 'dirt' if (r < .75 or y < 6) else 'scrub'
        if ny > .5:
            return 'scrub' if r < .7 else ('scrub_d' if r < .9 else 'rock')
        return 'rock' if r < .6 else ('rock_d' if r < .82 else 'rock_l')
    C = (5, -3)
    lv = [(0, 1.0, C, None, 0), (3.5, .985, C, None, 0), (16, .965, C, None, 0), (25, .925, C, None, 0), (34, .80, C, (178, 54), .5), (38, .62, C, (142, 45), .85)]
    if not b.hi:
        lv = [lv[0], lv[2], lv[3], lv[5]]
    island(b, N, nb, lv, yfn, colfn, seed=11, jit=.03 if b.hi else 0)
    S = 38.0
    # cellhouse
    with b.at(8, S - 3, -3):
        block(b, 150, 18, 58, 'cell', 'roofc', floors=1, bx=22, bz=8, wf=.42, hf=.6, base=4.5)
        if b.hi:
            for z in (-16, 0, 16):
                b.tb(0, 18, z, 118, 5, 2.0, 116, 2.2, 'cell_d', skip='d')
            b.bb(62, 18, 0, 10, 3, 30, 'cell_d', skip='d')
    # dining hall wing + recreation yard walls (north-west)
    with b.at(-78, S - 3, 4):
        block(b, 26, 13, 36, 'cell', 'roofc', floors=1, bx=3, bz=5, base=3)
    for (cx, cz, sx, sz) in ((-98, -32, 60, 1.2), (-128, -14, 1.2, 37), (-98, 5, 60, 1.2)) if b.hi else ((-98, -14, 60, 37),):
        b.bb(cx, S - 6, cz, sx, 12 if b.hi else 9, sz, 'cell_d')
    # lighthouse + keeper's ruin
    with b.at(98, S - 2, -24):
        b.lathe([(3.4, 0), (2.5, 20), (3.2, 20.4), (3.2, 21.3), (2.1, 21.3), (2.1, 24.6), (2.5, 24.8), (.4, 27), (0.0, 28)], n=8, nl=6,
                col=['white', 'black', 'black', 'black', 'lamp', 'black', 'black', 'black'], smooth=30)
        b.bb(8, 0, 4, 11, 7, 9, 'ruin', u='ruin_d')
    # warden's house ruin: roofless shell
    with b.at(104, S - 3, 4):
        block(b, 17, 12, 12, 'ruin', None, floors=2, bx=4, bz=3, win='ruin_d', wf=.4, hf=.5, base=3)
        b.bb(0, 0, 0, 16, 3.2, 11, 'ruin_d')
        if b.hi:
            b.bb(-6, 12, -4, 1.6, 3.5, 1.6, 'ruin')
            b.bb(5, 12, 3, 1.6, 2.5, 1.6, 'ruin')
    # water tower (rust-red tank on a steel trestle)
    with b.at(-100, S - 6, 22):
        nl = 6 if b.hi else 4
        for i in range(nl):
            a = 2 * pi * i / nl
            b.beam((5.6 * cos(a), 0, 5.6 * sin(a)), (4.3 * cos(a), 22, 4.3 * sin(a)), .55, .55, 'steel', lx=True)
            if b.hi:
                a2 = 2 * pi * (i + 1) / nl
                for y in (8, 15):
                    r_ = 5.6 - 1.3 * y / 22
                    b.beam((r_ * cos(a), y, r_ * sin(a)), (r_ * cos(a2), y, r_ * sin(a2)), .3, .3, 'steel')
                b.beam((5.1 * cos(a), 8, 5.1 * sin(a)), (4.7 * cos(a2), 15, 4.7 * sin(a2)), .25, .25, 'steel')
        b.lathe([(0, 21), (4.9, 22), (5.2, 22.3), (5.2, 29.5), (5.5, 29.6), (0, 32.5)], n=12, nl=8, col=['steel', 'rust', 'rust', 'rust', 'rust'], smooth=40)
    # power house and chimney (north shore)
    with b.at(-150, 8, 42, ry=8):
        block(b, 34, 14, 16, 'cell_d', 'roofc', floors=2, bx=6, bz=3, base=1)
        b.cyl((12, 0, 2), (12, 38, 2), 2.0, 1.3, n=8, col='chim', nl=5)
    # new industries building (long, on the western terrace) and model industries (the tip)
    with b.at(-170, 7, -40, ry=-9):
        block(b, 96, 14, 15, 'cell', 'roofc', floors=2, bx=16, bz=2, base=1)
    with b.at(-226, 4, 2, ry=70):
        block(b, 34, 16, 13, 'ruin', 'roofc', floors=3, bx=6, bz=2, base=1)
    # the dock (east side): wharf, the long barracks block (Building 64), guard tower
    b.box(26, 0, 76, 148, 3.3, 90, 'timber', u='dirt')
    with b.at(88, 3.2, 80):
        block(b, 100, 16, 15, 'cell', 'roofc', floors=4, bx=18, bz=2, base=1)
    with b.at(34, 3.3, 85):
        for sx in b.mirx():
            for sz in b.mirz():
                b.beam((2.0, 0, 2.0), (1.4, 10, 1.4), .3, .3, 'steel', lx=True)
        b.bb(0, 10, 0, 4.2, .3, 4.2, 'steel')
        b.bb(0, 10.3, 0, 3.2, 2.6, 3.2, 'cell', f='win', b='win', l='win', r='win')
        b.tb(0, 12.9, 0, 4.4, 4.4, 1.5, .4, .4, 'black', skip='d')
    # officers' club ruin beside the dock road
    with b.at(4, 22, 60, ry=-10):
        block(b, 30, 13, 14, 'ruin', None, floors=2, bx=6, bz=3, win='ruin_d', base=5)
        b.bb(0, 0, 0, 29, 5.2, 13, 'ruin_d')
    # tree / scrub clumps
    rnd = random.Random(5)
    spots = [(-60, 58, 30), (-20, 62, 30), (60, 62, 30), (140, 50, 21), (150, -50, 21), (60, -62, 30), (-10, -66, 30), (-70, -62, 30),
             (170, 10, 21), (205, -10, 21), (-190, 20, 11), (-120, 60, 26), (120, -60, 26), (20, 60, 32), (-40, -66, 30), (190, 35, 21)]
    for x, z, y in (spots if b.hi else spots[::3]):
        r_ = rnd.uniform(7, 12)
        b.sphere((x, y - 2, z), (r_, r_ * .7, r_ * .9), n=6, m=2, col='tree' if rnd.random() < .6 else 'scrub_d', y0=0, nl=5, smooth=None)



YB_PAL = {
    'rock': (0x9a8a66, .95, 0), 'rock_d': (0x7c6e50, .95, 0), 'tide': (0x4c4a3b, .9, 0), 'tree': (0x3f5a36, .95, 0), 'tree_d': (0x304a2c, .95, 0),
    'grass': (0x7a8048, .95, 0), 'dirt': (0x9f977f, .95, 0), 'conc': (0xb6af9f, .9, 0), 'shadow': (0x2a2c2e, .9, 0), 'white': (0xdedbd0, .7, 0),
    'roofr': (0x9a4a38, .8, 0), 'win': (0x3b4044, .4, 0), 'road': (0x3b3c3f, .9, 0),
}


def yerba_buena_island(b):
    """Yerba Buena Island: wooded hill 900 x 600 m, 100 m tall; the Bay Bridge tunnel portal on the west face (-X)."""
    def base(th):
        c, s_ = cos(th), sin(th)
        m = 1 + .07 * sin(2 * th + .6) + .05 * sin(3 * th + 2.1) + .03 * sin(5 * th + 1.0)
        return (450 * (abs(c) ** .9) * (1 if c >= 0 else -1) * m, 300 * (abs(s_) ** .9) * (1 if s_ >= 0 else -1) * m)
    N = 36 if b.hi else 16
    pts = [base(2 * pi * i / N) for i in range(N)]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    z0, z1 = min(p[1] for p in pts), max(p[1] for p in pts)
    nb = lambda th: ((base(th)[0] - (x0 + x1) / 2) * 900 / (x1 - x0), (base(th)[1] - (z0 + z1) / 2) * 600 / (z1 - z0))

    def colfn(ny, r, y):
        if y < 3:
            return 'tide'
        if y < 16:
            return 'rock' if r < .6 else 'rock_d'
        return 'tree' if r < .6 else ('tree_d' if r < .94 else 'grass')
    C = (20, 0)
    lv = [(0, 1, C, None, 0), (4, .985, C, None, 0), (22, .95, C, None, 0), (50, .78, C, None, 0), (78, .52, C, None, 0), (95, .26, C, None, 0), (100, .08, C, None, 0)]
    if not b.hi:
        lv = [lv[0], lv[2], lv[3], lv[4], lv[6]]
    island(b, N, nb, lv, lambda x, z, y: y, colfn, seed=8, top='tree', jit=.04 if b.hi else 0)
    # tunnel portal (west face): concrete headwall with two stacked dark openings, short approach deck stub
    b.box(-322, 40, -19, -285, 82, 19, 'conc', skip='r')
    b.box(-322.5, 57, -10.5, -321.9, 65.5, 10.5, 'shadow')
    b.box(-322.5, 67, -10.5, -321.9, 76, 10.5, 'shadow')
    b.box(-324, 79, -21, -285, 84, 21, 'conc', skip='r') if b.hi else None
    # east side: the viaduct landing + a few white Navy-era buildings on the north-east slope
    b.box(285, 48, -14, 330, 67, 14, 'conc', skip='l', f='shadow' if False else 'conc')
    if b.hi:
        for x, z, y, ry in ((150, 190, 22, 10), (220, 150, 26, -20), (60, 215, 20, 0), (-60, 205, 22, 5)):
            with b.at(x, y, z, ry=ry):
                block(b, 34, 16, 16, 'white', 'roofr', floors=2, bx=5, bz=2, base=6)
        b.cyl((0, 98, 0), (0, 108, 0), .9, .5, n=5, col='white')
    else:
        b.cyl((0, 98, 0), (0, 108, 0), .9, .5, n=4, col='white')


MODELS = {
    'bay_bridge_tower': (bay_bridge_tower, BB_PAL),
    'bay_bridge_deck_segment': (bay_bridge_deck_segment, BB_PAL, {'lod_ratio': 0.34}),
    'bay_bridge_anchorage': (bay_bridge_anchorage, BB_PAL),
    'golden_gate_bridge': (golden_gate_bridge, GG_PAL),
    'sutro_tower': (sutro_tower, SU_PAL),
    'alcatraz': (alcatraz, AL_PAL),
    'yerba_buena_island': (yerba_buena_island, YB_PAL),
}

if __name__ == '__main__':
    run(MODELS)
