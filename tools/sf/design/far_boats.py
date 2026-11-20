# far_boats.py - San Francisco Bay water craft + the Oakland container crane.
#   blender -b -P tools/sf/design/far_boats.py -- [names]
# y 0 = the waterline (nothing below), bow +Z, metres.  Invented liveries.
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

BP = {
    'white': (0xe4e3dc, .45, 0), 'white_d': (0xc4c4bc, .5, 0), 'glass': (0x22303a, .1, 0), 'blue': (0x1f4f8a, .4, 0), 'gold': (0xd3a534, .4, 0),
    'deck': (0x7f8483, .85, 0), 'hull_d': (0x1e2a36, .5, 0), 'boot': (0x7c2a22, .6, 0), 'steel': (0x5d6266, .6, 0), 'black': (0x1c1d1f, .7, 0),
    'red': (0xb3302a, .5, 0), 'green': (0x2f6a48, .5, 0), 'wood': (0x8c6a45, .7, 0), 'sail': (0xeeeade, .8, 0), 'orange': (0xd8642a, .5, 0),
    'c1': (0x9a3b2e, .6, 0), 'c2': (0x2d5f8f, .6, 0), 'c3': (0x3f7d55, .6, 0), 'c4': (0xc9a23b, .6, 0), 'c5': (0x8c8f92, .6, 0), 'c6': (0xc56a2d, .6, 0),
    'c7': (0x5a3d6e, .6, 0), 'lamp': (0xfff0c2, .2, 0, 0xffe9a8), 'tyre': (0x232325, .9, 0), 'grey': (0x9da1a3, .5, 0), 'beacon': (0xc02a20, .4, 0, 0xff3020),
}


def hull(b, L, w, ys, cols, rf, rr, pf=1.25, pr=1.0, zc=0.0, flare=.82, top='deck', nf=5, nr=4, x0=0.0, zs=()):
    """Hull from the waterline up; ys = band heights, cols = one colour per band."""
    zf, zr = zc + L / 2, zc - L / 2
    n = len(ys)
    lv = [(y, w * lerp(flare, 1, i / (n - 1)), zf - (1 - i / (n - 1)) * rf * .12, zr + (1 - i / (n - 1)) * rr * .06, rf, rr) for i, y in enumerate(ys)]
    with b.at(x0):
        plan_body(b, lv, list(zs), lambda k, sx, part, j, z: cols[k], nf=nf, nr=nr, top=top, bottom=None, caps=2, pf=pf, pr=pr)


def cabin(b, y0, y1, w, zf, zr, rf, rr, wall='white', roof='white_d', win=None, nf=3, nr=2, pf=.7, inset=.0, wy=(.35, .8), wins=None):
    """Deckhouse with a window band between wy fractions; wins: list of (z0, z1) side windows (None = continuous)."""
    h = y1 - y0
    lv = [(y0, w, zf, zr, rf, rr), (y0 + h * wy[0], w, zf, zr, rf, rr), (y0 + h * wy[1], w - inset, zf - inset * 2, zr, rf, rr), (y1, w - inset, zf - inset * 2, zr + inset, rf, rr)]
    zs = sorted(set(e for a in (wins or []) for e in a))

    def col(k, sx, part, j, z):
        if k != 1 or not win:
            return wall
        if part == 's' and wins is not None:
            return win if (b.hi and any(a < z < c for a, c in wins)) or (not b.hi and wins[0][0] < z < wins[-1][1]) else wall
        if part == 'r' and nr < 2:
            return wall
        return win
    plan_body(b, lv, zs, col, nf=nf, nr=nr, top=roof, bottom=None, caps=2, pf=pf)


def winrow(z0, z1, n, gap=.25):
    p = (z1 - z0) / n
    return [(z0 + i * p + gap * p / 2, z0 + (i + 1) * p - gap * p / 2) for i in range(n)]


def ferry(b):
    """Modern Bay catamaran ferry, 41 x 11 x 12 m: white, blue-and-gold band."""
    for sx in (1, -1):
        hull(b, 41, 1.75, [0, .9, 2.2, 2.9], ['hull_d', 'white', 'blue'], 7, 1.2, x0=sx * 3.75, flare=.7, top='deck')
    b.box(-5.5, 2.2, -19.5, 5.5, 3.3, 14, 'white', f='blue', d='white_d', u='deck')
    b.box(-5.5, 2.9, -19.5, 5.5, 3.05, 14, 'gold', skip='ud') if b.hi else None
    cabin(b, 3.3, 6.0, 5.3, 16.5, -15.5, 4.5, .6, win='glass', wins=winrow(-14.5, 11.5, 13), nf=4)
    b.box(-5.3, 6.0, -19, 5.3, 6.12, -15.5, 'deck')
    cabin(b, 6.0, 8.5, 4.6, 11.0, -11, 3.5, .5, win='glass', wins=winrow(-10, 7, 8), nf=4)
    cabin(b, 8.5, 10.4, 3.0, 9.0, 3.5, 2.2, .3, win='glass', nf=4, inset=.25, wy=(.3, .85), roof='white')
    # blue band along the cabin top edge, stacks, mast, radar
    for sx in b.mirx():
        b.box(3.6, 8.5, -9.5, 4.3, 10.6, -6.5, 'blue', skip='d', u='black')
        b.box(5.3, 3.3, -19, 5.36, 4.3, -15.5, 'white_d') if b.hi else None
        if b.hi:
            b.beam((4.5, 8.5, -10.9), (4.5, 9.5, -10.9), .06, .06, 'steel')
            b.beam((4.5, 9.5, -10.9), (4.5, 9.5, 3.4), .06, .06, 'steel')
    b.beam((0, 10.4, 5), (0, 12.0, 4.6), .18, .18, 'white_d', lx=True)
    b.box(-1.2, 11.2, 4.6, 1.2, 11.35, 4.9, 'white_d')
    b.box(-.9, 10.4, 6.2, .9, 10.7, 6.6, 'steel')


def ferry_classic(b):
    """1920s-style double-ended bay ferryboat, 75 x 18 m: white, twin pilot houses, single black-topped stack."""
    hull(b, 75, 9.0, [0, 1.2, 3.2], ['boot', 'white'], 15, 15, pf=1.0, flare=.86, top='deck', nf=6, nr=6)
    b.box(-9, 2.9, -28, 9, 3.3, 28, 'green', skip='ud') if b.hi else None
    cabin(b, 3.2, 7.6, 8.4, 33, -33, 9, 9, win='glass', wins=winrow(-23, 23, 16, .35), nf=5, nr=5, pf=1.0, wy=(.3, .72))
    b.box(-8.9, 7.6, -30, 8.9, 7.8, 30, 'white_d', u='deck')
    cabin(b, 7.8, 11.2, 7.0, 27, -27, 7, 7, win='glass', wins=winrow(-19, 19, 14, .35), nf=5, nr=5, pf=1.0, wy=(.3, .75))
    b.box(-7.4, 11.2, -25, 7.4, 11.4, 25, 'white_d', u='deck')
    for sz in b.mirz():
        with b.at(z=20):
            cabin(b, 11.4, 14.4, 2.6, 3.2, -2.6, 2.0, .4, win='glass', nf=4, wy=(.4, .85), roof='green')
        b.beam((0, 14.4, 20), (0, 18.5, 20), .15, .15, 'white_d', lx=True)
        if b.hi:
            for x in (-5, 5):
                b.bb(x, 11.4, 10, 1.6, 1.0, 5.5, 'white_d')
    b.cyl((0, 11.4, 0), (0, 18.0, 0), 1.9, 1.8, n=12, col='gold', nl=8)
    b.cyl((0, 18.0, 0), (0, 20.5, 0), 1.8, 1.75, n=12, col='black', nl=8)
    b.bb(0, 11.4, 0, 9, 1.6, 12, 'white', u='white_d')


def container_ship(b):
    """Loaded container ship, 300 x 48 m, dark hull, bow +Z."""
    hull(b, 300, 24, [0, 1.5, 9, 15], ['boot', 'hull_d', 'hull_d'], 52, 14, pf=1.35, pr=.8, flare=.86, top='deck', nf=6, nr=3)
    b.tb(0, 15, 136, 26, 18, 3.5, 30, 24, 'hull_d', skip='d', u='deck', dz=1)  # forecastle
    rnd = random.Random(4)
    cc = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c1', 'c2', 'c5']
    z = -128.0
    bay = 0
    while z < 122:
        if -100 < z < -82:  # accommodation block
            z += 20
            continue
        L = 12.6
        t = (z + 150) / 300
        hw = 22 if t < .78 else lerp(22, 9, (t - .78) / .2)
        tiers = rnd.choice([4, 5, 6, 6, 7]) if t < .85 else rnd.choice([2, 3, 4])
        h = 2.6
        nx = max(2, int(round(hw * 2 / 7.4))) if b.hi else 2
        seed = bay * 131

        def cs(u, v, seed=seed, f=0):
            return cc[(int(u * 7.3 + 100) * 7 + int(v * 3.1) * 13 + seed + f) % len(cc)]
        ys = [15 + h * i for i in range(tiers + 1)] if b.hi else [15, 15 + h * tiers]
        for sx in (1, -1):
            b.grid((sx * hw, 0, z), (0, 0, 1), (0, 1, 0), [0, L], ys, lambda u, v: cs(sx * 3.0 + 5, v), flip=sx > 0)
        xs = [-hw + 2 * hw * i / nx for i in range(nx + 1)]
        b.grid((0, 15 + h * tiers, z), (1, 0, 0), (0, 0, 1), xs, [0, L], lambda u, v: cs(u, 1, f=3), flip=True)
        b.grid((0, 0, z), (1, 0, 0), (0, 1, 0), [-hw, hw], [15, 15 + h * tiers], lambda u, v: 'steel', flip=True)
        b.grid((0, 0, z + L), (1, 0, 0), (0, 1, 0), [-hw, hw], [15, 15 + h * tiers], lambda u, v: 'steel')
        z += L + 1.4
        bay += 1
    # accommodation + bridge + funnel
    b.bb(0, 15, -91, 44, 26, 13, 'white', u='white_d')
    b.bb(0, 41, -90, 48, 3.2, 10, 'white', f='glass', u='white_d')
    b.bb(0, 44.2, -91, 20, 1.2, 8, 'white_d')
    b.beam((0, 45.4, -91), (0, 52.0, -91), .8, .8, 'white_d', lx=True)
    b.bb(0, 49, -91, 9, .5, 1.2, 'white_d')
    b.tb(0, 15, -106, 10, 9, 30, 8, 7, 'blue', skip='d', u='black')
    if b.hi:
        for y in (20, 25, 30, 35):
            b.box(-22.05, y, -84.45, 22.05, y + 1.4, -84.4, 'glass')
        b.beam((0, 18.5, 142), (0, 30, 142), .6, .6, 'white_d')
        for sx in b.mirx():
            b.bb(19, 15, -130, 6, 2.5, 8, 'orange')


def sailboat(b):
    """11 m sloop under sail, white hull."""
    hull(b, 11, 1.7, [0, .25, .95], ['blue', 'white'], 4.2, .8, pf=1.3, flare=.7, top='wood', nf=5, nr=2)
    cabin(b, .95, 1.55, 1.05, 2.2, -1.2, 1.4, .2, win='glass', nf=3, nr=1, wy=(.35, .8), roof='white')
    b.box(-.9, .95, -4.6, .9, 1.15, -1.4, 'white', skip='d', u='wood')  # cockpit coaming
    b.cyl((0, 1.5, 1.2), (0, 15.5, 1.0), .09, .06, n=6, col='grey', nl=4)
    b.beam((0, 2.3, 1.1), (0, 2.5, -3.6), .1, .1, 'grey')
    # sails: slightly bellied main and jib (double-sided thin shells)
    b.pid += 1
    b.face([(0, 2.6, 1.0), (.45, 2.75, -1.3), (0.05, 2.7, -3.5)], 'sail')
    b.face([(0, 2.6, 1.0), (.4, 8.0, -.3), (.45, 2.75, -1.3)], 'sail')
    b.face([(.45, 2.75, -1.3), (.4, 8.0, -.3), (0.05, 2.7, -3.5)], 'sail')
    b.face([(0, 2.6, 1.0), (0, 15.0, 1.0), (.4, 8.0, -.3)], 'sail')
    b.face([(.4, 8.0, -.3), (0, 15.0, 1.0), (.05, 2.7, -3.5)], 'sail')
    b.face([(0, 1.3, 5.3), (.5, 5.0, 3.0), (0, 13.0, 1.15)], 'sail')
    b.face([(0, 1.3, 5.3), (.35, 1.5, 1.4), (.5, 5.0, 3.0)], 'sail')
    b.face([(.35, 1.5, 1.4), (0, 13.0, 1.15), (.5, 5.0, 3.0)], 'sail')
    if b.hi:
        b.beam((0, .95, -5.4), (0, 15.4, 1.0), .03, .03, 'steel')
        b.cyl((0, 1.1, -4.2), (0, 1.9, -4.2), .04, n=4, col='steel')
        b.cyl((0, 1.9, -4.35), (0, 1.9, -4.05), .35, n=8, col='steel')


def tug(b):
    """28 m harbour tug: dark hull, fender band, cream house, red-and-black stack."""
    hull(b, 28, 4.8, [0, .8, 2.4, 3.3], ['boot', 'hull_d', 'black'], 8, 4.5, pf=.9, pr=.8, flare=.85, top='deck', nf=6, nr=4)
    cabin(b, 3.3, 5.8, 3.3, 7.5, -3.5, 3, .5, win='glass', wins=winrow(-2.8, 3.6, 4, .45), nf=4, wy=(.4, .78))
    cabin(b, 5.8, 8.3, 2.4, 6.2, 1.2, 2.2, .4, win='glass', nf=5, nr=2, wy=(.35, .85), inset=.15, roof='white')
    b.cyl((0, 5.8, -1.6), (0, 10.2, -1.9), 1.0, .95, n=10, col='red', sq=1.4, nl=6, capcol='black')
    b.cyl((0, 9.2, -1.83), (0, 10.3, -1.9), 1.02, .98, n=10, col='black', sq=1.4, nl=6)
    b.beam((0, 8.3, 3.2), (0, 13.0, 3.0), .16, .16, 'white_d', lx=True)
    b.box(-1.3, 10.6, 3.0, 1.3, 10.75, 3.2, 'white_d')
    b.cyl((-1.2, 4.0, -7.5), (1.2, 4.0, -7.5), .8, n=8, col='steel', nl=6)  # tow winch
    b.bb(0, 3.3, -7.5, 3.0, .7, 2.2, 'steel')
    if True:
        for sx in b.mirx():
            for z in (-9, -5, -1, 3, 7) if b.hi else (-1,):
                b.cyl((4.75 - (0.5 if abs(z) > 6 else 0), 2.2, z), (5.0 - (0.5 if abs(z) > 6 else 0), 2.2, z), .5, n=8, col='tyre')
        if b.hi:
            b.cyl((0, 2.6, 13.3), (0, 2.6, 13.95), 1.2, .9, n=8, col='tyre', caps=2)


def fishing_boat(b):
    """Monterey-clipper style wharf fishing boat, 9 m: white hull, green trim."""
    hull(b, 9, 1.45, [0, .2, .9, 1.15], ['green', 'white', 'green'], 3.6, 1.6, pf=1.25, pr=1.0, flare=.72, top='wood', nf=5, nr=4)
    cabin(b, 1.15, 2.75, .85, 2.0, .2, .5, .1, win='glass', nf=3, nr=1, wy=(.5, .85), roof='green', pf=.6)
    b.box(-.6, 1.15, -2.8, .6, 1.55, -.6, 'white', u='green')  # fish hold hatch
    b.beam((0, 2.75, 1.0), (0, 4.6, .9), .09, .09, 'white_d', lx=True)
    b.beam((0, 3.4, .95), (0, 2.3, -3.2), .07, .07, 'white_d', lx=True)
    for sx in b.mirx():
        b.beam((.3, 2.75, .8), (2.2, 4.3, .2), .05, .05, 'white_d', lx=True)
    if b.hi:
        b.cyl((0, 1.55, -1.7), (0, 2.0, -1.7), .3, n=6, col='orange')
        b.box(-.9, 1.15, -4.2, .9, 1.3, -3.2, 'wood')


def container_crane(b):
    """White ship-to-shore gantry crane, boom raised (about 100 m). Rails along X, water side +Z."""
    W = 'white'
    for sx in b.mirx():
        for z in (-13.5, 13.5):
            b.beam((9.5, 0, z), (9.5, 48, z), 2.0, 2.0, W, caps=0)
            b.bb(9.5, 0, z, 3.2, 1.6, 5.5, 'steel')
        b.beam((9.5, 14, -13.5), (9.5, 14, 13.5), 1.6, 1.8, W)
        b.beam((9.5, 15, -13.5), (9.5, 47, 13.5), 1.0, 1.0, W, lx=True)
        b.beam((9.5, 48, -37), (9.5, 48, 15.5), 1.6, 2.6, W, caps=1)          # main girder (landside back reach)
        b.beam((9.5, 48, 13.5), (5.5, 74, 13.5), 1.6, 1.6, W)                 # A-frame
        b.beam((9.5, 48, -4), (5.5, 74, 13.0), 1.2, 1.2, W, lx=True)
        b.beam((5.5, 73, 13.5), (9.5, 49, -34), .45, .45, 'grey', lx=True)   # back stay
        # raised boom (hinge at the water-side girder end)
        b.beam((6.5, 48.5, 15.5), (6.5, 99.0, 26.5), 1.5, 2.4, W, up=(1, 0, 0), caps=1)
        b.beam((5.5, 74, 13.5), (6.5, 80, 22.2), .4, .4, 'grey', lx=True)   # forestays folded
        b.beam((5.5, 74, 13.5), (6.5, 96, 25.6), .4, .4, 'grey', lx=True)
    for z in (-13.5, 13.5):
        b.beam((-9.5, 46, z), (9.5, 46, z), 1.6, 2.0, W)
        b.beam((-9.5, 14, z), (9.5, 14, z), 1.2, 1.4, W)
    b.beam((-5.5, 73.5, 13.5), (5.5, 73.5, 13.5), 1.4, 1.4, W)
    b.beam((-6.5, 99, 26.5), (6.5, 99, 26.5), 1.2, 1.2, W)
    for t in (.3, .65):
        y, z = lerp(48.5, 99, t), lerp(15.5, 26.5, t)
        b.beam((-6.5, y, z), (6.5, y, z), .8, .8, W, lx=True)
    b.bb(0, 49.3, -26, 14, 7, 14, 'white', u='white_d', f='grey')              # machinery house
    b.bb(3, 43.6, -6, 3.2, 3.0, 4.2, 'white', f='glass', l='glass', r='glass')  # operator cab on the trolley
    b.bb(0, 46.6, -6, 10, 1.2, 5, 'grey')
    b.bb(0, 99.6, 26.5, .8, .4, .8, 'beacon')
    if b.hi:
        for z in (-13.5, 13.5):
            b.beam((-9.5, 15, z), (9.5, 45, z), .6, .6, W)
            b.beam((9.5, 15, z), (-9.5, 45, z), .6, .6, W)
        b.beam((-9.5, 48, -37), (9.5, 48, -37), 1.2, 1.6, W)


MODELS = {
    'sf_ferry': (ferry, BP),
    'sf_ferry_classic': (ferry_classic, BP),
    'sf_container_ship': (container_ship, BP),
    'sf_sailboat': (sailboat, BP),
    'sf_tug': (tug, BP),
    'sf_fishing_boat': (fishing_boat, BP),
    'sf_container_crane': (container_crane, BP),
}

if __name__ == '__main__':
    run(MODELS)
