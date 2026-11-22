# far_boats.py - Tokyo Bay / Sumida River water craft + the Oi container crane.
#   blender -b -P tools/tokyo/design/far_boats.py -- [names]
# y 0 = the waterline (nothing below), bow +Z, metres.  Invented liveries.
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

BP = {
    'white': (0xe4e3dc, .45, 0), 'white_d': (0xc4c4bc, .5, 0), 'glass': (0x22303a, .1, 0), 'blue': (0x1f4f8a, .4, 0), 'gold': (0xd3a534, .4, 0),
    'deck': (0x7f8483, .85, 0), 'hull_d': (0x1e2a36, .5, 0), 'boot': (0x7c2a22, .6, 0), 'steel': (0x5d6266, .6, 0), 'black': (0x1c1d1f, .7, 0),
    'red': (0xb3302a, .5, 0), 'green': (0x2f6a48, .5, 0), 'wood': (0x8c6a45, .7, 0), 'sail': (0xeeeade, .8, 0), 'orange': (0xd8642a, .5, 0),
    'c1': (0x9a3b2e, .6, 0), 'c2': (0x2d5f8f, .6, 0), 'c3': (0x3f7d55, .6, 0), 'c4': (0xc9a23b, .6, 0), 'c5': (0x8c8f92, .6, 0), 'c6': (0xc56a2d, .6, 0),
    'c7': (0x5a3d6e, .6, 0), 'lamp': (0xfff0c2, .2, 0, 0xffe9a8), 'lit': (0x8a8f86, .2, 0, 0xf2e2b0), 'silver': (0xc9cdd0, .3, .5), 'silver_d': (0x9aa0a4, .35, .5),
    'groof': (0x35525a, .1, .2, 0x1c3038), 'teal': (0x178a8c, .45, 0), 'yellow': (0xe2b824, .45, 0), 'lantern': (0xe0452a, .5, 0, 0xe04a20), 'shoji': (0xe8dcb8, .6, 0, 0xf0d898),
    'tile': (0x3d4a48, .7, 0), 'tile_d': (0x2c3634, .7, 0), 'wood_d': (0x4a3524, .8, 0), 'crane_r': (0xc8352a, .5, 0), 'crane_w': (0xe6e4dc, .5, 0), 'tyre': (0x232325, .9, 0), 'grey': (0x9da1a3, .5, 0), 'beacon': (0xc02a20, .4, 0, 0xff3020),
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


def water_bus(b):
    """Low glass-roofed river water bus, 34 x 8 x 5 m: silver hull, long lit saloon under a curved glass roof."""
    hull(b, 34, 4.0, [0, .5, 1.3, 1.7], ['hull_d', 'silver', 'blue'], 9, 3.5, pf=1.1, pr=.9, flare=.8, top='deck', nf=6, nr=4)
    lv = [(1.7, 3.55, 12.5, -11.5, 5.5, 1.5), (2.15, 3.6, 12.6, -11.5, 5.5, 1.5), (3.0, 3.45, 12.2, -11.5, 5.3, 1.5), (3.55, 2.8, 11.2, -11.3, 4.6, 1.4),
          (3.85, 1.6, 9.6, -10.8, 3.2, 1.2)]
    wins = winrow(-9.5, 7.5, 12, .12)
    zs = sorted(set(e for a in wins for e in a))

    def col(k, sx, part, j, z):
        if k == 0:
            return 'silver'
        if k == 1:
            if part == 's':
                return 'lit' if (any(a < z < c for a, c in wins) if b.hi else -9.5 < z < 7.5) else 'silver_d'
            return 'glass' if part == 'f' else 'silver'
        if k == 2:
            if part == 's':
                return 'groof' if (any(a + .1 < z < c - .1 for a, c in wins) if b.hi else -9.5 < z < 7.5) else 'silver'
            return 'glass' if part == 'f' else 'silver'
        return 'silver' if part != 'f' else 'groof'
    plan_body(b, lv, zs, col, nf=5, nr=3, top='groof', bottom=None, caps=2, pf=.9)
    # wheelhouse blister, mast, stern deck rail
    cabin(b, 3.6, 4.5, 1.5, 8.6, 5.4, 1.4, .4, wall='silver', roof='silver_d', win='glass', nf=4, wy=(.2, .8), inset=.15)
    b.beam((0, 4.5, 6.0), (0, 5.0, 5.8), .12, .12, 'silver_d', lx=True)
    b.box(-.8, 4.72, 5.8, .8, 4.8, 6.0, 'silver_d')
    for sx in b.mirx():
        b.box(3.5, 1.7, -15.6, 3.56, 2.6, -11.6, 'silver_d', skip='ud') if b.hi else None
        b.box(3.3, .9, 15.5, 3.5, 1.2, 15.7, 'lamp') if False else None
    b.box(-3.4, 1.7, -16.2, 3.4, 2.6, -16.14, 'silver_d', skip='ud')
    if b.hi:
        b.box(-3.7, 1.32, -13, 3.7, 1.42, 13, 'teal', skip='ud')


def yakatabune(b):
    """Traditional roofed pleasure boat, 20 x 4.5 x 4 m: lit shoji windows, tiled roof, red lantern strings on both eaves."""
    hull(b, 20, 2.25, [0, .35, .95, 1.1], ['wood_d', 'white', 'red'], 6.5, 2.2, pf=1.15, pr=.9, flare=.78, top='wood', nf=5, nr=3)
    z0, z1, w = -6.6, 5.2, 1.9
    wins = winrow(z0 + .3, z1 - .3, 8, .14)
    zs = [z0] + [e for a in wins for e in a] + [z1]

    def side(u, v):
        if v < 1.5 or v > 2.3:
            return 'wood_d' if v < 1.25 or v > 2.38 else 'wood'
        return 'shoji' if (any(a < u < c for a, c in wins) if b.hi else z0 + .3 < u < z1 - .3) else 'wood_d'
    ys = [1.1, 1.25, 1.5, 2.3, 2.38, 2.5] if b.hi else [1.1, 1.5, 2.3, 2.5]
    for sx in b.mirx():
        b.grid((w, 0, 0), (0, 0, 1), (0, 1, 0), zs if b.hi else [z0, z0 + .3, z1 - .3, z1], ys, side, flip=True)
    endf = lambda u, v: 'shoji' if (abs(u) < 1.2 and 1.4 < v < 2.3) else 'wood_d'
    b.grid((0, 0, z1), (1, 0, 0), (0, 1, 0), [-w, -1.2, 1.2, w], [1.1, 1.4, 2.3, 2.5], endf)
    b.grid((0, 0, z0), (1, 0, 0), (0, 1, 0), [-w, -1.2, 1.2, w], [1.1, 1.4, 2.3, 2.5], endf, flip=True)
    # roof: low gable with wide eaves
    ro = [(-2.25, 2.42), (-2.25, 2.5), (-.5, 3.12), (.5, 3.12), (2.25, 2.5), (2.25, 2.42)]
    b.prism(ro, 'z', z0 - .5, z1 + .5, ['tile_d', 'tile', 'tile_d', 'tile', 'tile_d', 'wood_d'], capcol='wood')
    b.box(-.12, 3.1, z0 - .5, .12, 3.24, z1 + .5, 'tile_d', skip='d')
    # lantern strings under both eaves, bow lantern pole, stern awning posts
    n = 10
    for sx in b.mirx():
        for i in range(n):
            z = z0 + .1 + (z1 - z0 - .2) * i / (n - 1)
            b.box(2.08, 2.0, z - .13, 2.3, 2.36, z + .13, 'lantern', skip='u' if b.hi else 'ud')
    b.beam((0, 1.1, 7.6), (0, 4.0, 7.5), .1, .1, 'wood_d', lx=True)
    b.box(-.2, 3.2, 7.35, .2, 3.7, 7.7, 'lantern')
    b.box(-1.2, 1.1, -9.0, 1.2, 1.5, -7.2, 'wood_d', u='wood')
    if b.hi:
        for sx in b.mirx():
            b.beam((1.7, 1.1, -8.8), (1.7, 2.45, -8.8), .08, .08, 'wood_d')
        b.box(-1.9, 2.42, -9.0, 1.9, 2.5, z0 - .5, 'tile_d')
        b.cyl((0, 1.5, -8.2), (0, 2.2, -8.2), .3, n=6, col='steel')


def ferry(b):
    """Island ferry / passenger ship, 120 x 17 x 25 m: white, blue boot stripe, teal funnel with a yellow band."""
    hull(b, 120, 8.5, [0, 1.6, 5.2, 7.2], ['boot', 'white', 'white'], 26, 6, pf=1.3, pr=.85, flare=.84, top='deck', nf=6, nr=4)
    if b.hi:
        b.box(-8.52, 4.6, -52, 8.52, 5.0, 30, 'blue', skip='ud')
    # superstructure: three decks stepping back, bridge on top
    cabin(b, 7.2, 10.2, 8.2, 22, -50, 5, 1.2, win='lit', wins=winrow(-46, 18, 22, .35), nf=4, wy=(.35, .75))
    b.box(-8.4, 10.2, -52, 8.4, 10.4, 22, 'white_d', u='deck')
    cabin(b, 10.4, 13.2, 7.6, 20, -44, 4.5, 1.0, win='lit', wins=winrow(-41, 16, 20, .35), nf=4, wy=(.35, .75))
    b.box(-7.9, 13.2, -46, 7.9, 13.4, 20.5, 'white_d', u='deck')
    cabin(b, 13.4, 16.2, 7.0, 18, -30, 4.0, 1.0, win='lit', wins=winrow(-27, 13, 14, .35), nf=4, wy=(.35, .75))
    b.box(-7.4, 16.2, -32, 7.4, 16.4, 18.5, 'white_d', u='deck')
    cabin(b, 16.4, 19.2, 8.4, 18, 10, 3.0, .5, win='glass', nf=5, nr=2, wy=(.4, .85), inset=.3, roof='white')    # bridge with wings
    # funnel, masts, lifeboats, fore-deck cargo gear
    b.tb(0, 16.4, -16, 6.4, 9.0, 6.6, 5.0, 6.5, 'teal', skip='d', u='black', dz=-1.2)
    if b.hi:
        b.tb(0, 19.4, -16.55, 5.98, 8.3, 1.3, 5.72, 7.82, 'yellow', skip='du', dz=-.24)
    b.beam((0, 19.2, 14), (0, 25.0, 13.4), .5, .5, 'white_d', lx=True)
    b.box(-3.0, 22.0, 13.4, 3.0, 22.3, 13.9, 'white_d')
    b.beam((0, 16.4, -27), (0, 21.0, -27.5), .35, .35, 'white_d', lx=True)
    for sx in b.mirx():
        for z in ((-6, 2) if b.hi else (-2,)):
            b.box(7.0, 16.6, z - (3 if b.hi else 7), 8.3, 18.0, z + (3 if b.hi else 7), 'orange', u='white')
    b.beam((0, 7.2, 36), (0, 14.5, 35.5), .6, .6, 'white_d', lx=True)
    b.beam((0, 13.5, 35.6), (0, 10.5, 46), .35, .35, 'white_d', lx=True)
    b.bb(0, 7.2, 30, 9, 1.6, 8, 'white_d', u='deck')
    if b.hi:
        for x, c in ((-2.4, 'c2'), (2.4, 'c1')):
            b.bb(x, 7.2, 42, 2.5, 2.6, 6.1, c)
        b.bb(0, 7.2, 55, 3, 1.2, 2, 'steel')
    b.box(-7.5, 7.2, -59.2, 7.5, 8.3, -58.9, 'white', skip='ud')
    b.bb(0, 25.0, 13.4, .4, .02, .4, 'beacon') if False else None


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
    b.tb(0, 15, -106, 10, 9, 30, 8, 7, 'red', skip='d', u='black')
    if b.hi:
        for y in (20, 25, 30, 35):
            b.box(-22.05, y, -84.45, 22.05, y + 1.4, -84.4, 'glass')
        b.beam((0, 18.5, 142), (0, 30, 142), .6, .6, 'white_d')
        for sx in b.mirx():
            b.bb(19, 15, -130, 6, 2.5, 8, 'orange')


def tug(b):
    """28 m harbour tug: dark hull, fender band, cream house, red-and-black stack."""
    hull(b, 28, 4.8, [0, .8, 2.4, 3.3], ['boot', 'hull_d', 'black'], 8, 4.5, pf=.9, pr=.8, flare=.85, top='deck', nf=6, nr=4)
    cabin(b, 3.3, 5.8, 3.3, 7.5, -3.5, 3, .5, win='lit', wins=winrow(-2.8, 3.6, 4, .45), nf=4, wy=(.4, .78))
    cabin(b, 5.8, 8.3, 2.4, 6.2, 1.2, 2.2, .4, win='glass', nf=5, nr=2, wy=(.35, .85), inset=.15, roof='white')
    b.cyl((0, 5.8, -1.6), (0, 10.2, -1.9), 1.0, .95, n=10, col='orange', sq=1.4, nl=6, capcol='black')
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
    """Small Japanese coastal fishing boat, 9 m: white hull with blue trim, high bow, wheelhouse aft of midships, light mast."""
    hull(b, 9, 1.3, [0, .2, .85, 1.1], ['blue', 'white', 'blue'], 4.2, 1.2, pf=1.3, pr=.9, flare=.7, top='white_d', nf=5, nr=3)
    b.tb(0, 1.1, 3.3, 1.5, 1.6, .3, 1.0, 1.2, 'white', skip='d', u='white_d', dz=.3)         # raised foredeck
    cabin(b, 1.1, 2.7, .8, -.6, -2.4, .35, .1, win='glass', nf=3, nr=1, wy=(.5, .85), roof='blue', pf=.6)
    b.box(-.6, 1.1, .2, .6, 1.4, 2.0, 'white', u='blue')                                    # fish hold hatch
    b.beam((0, 2.7, -1.4), (0, 4.4, -1.5), .08, .08, 'white_d', lx=True)
    b.beam((0, 1.1, 2.6), (0, 3.2, 2.7), .07, .07, 'white_d', lx=True)
    b.beam((0, 3.1, 2.7), (0, 4.2, -1.5), .03, .03, 'steel', lx=True)
    b.box(-.5, 3.7, -1.6, .5, 3.78, -1.4, 'white_d')
    b.box(-.12, 4.25, -1.62, .12, 4.5, -1.38, 'lamp')
    if b.hi:
        b.cyl((0, 1.4, 1.1), (0, 1.8, 1.1), .28, n=6, col='orange')
        b.box(-.9, 1.1, -4.1, .9, 1.3, -3.0, 'wood')
        for sx in b.mirx():
            b.box(.95, 1.1, -3.6, 1.0, 1.5, 1.5, 'white', skip='d')


def banded(b, p0, p1, w, h, n, cols=('crane_r', 'crane_w'), **kw):
    p0, p1 = Vector(p0), Vector(p1)
    if not b.hi:
        n = max(1, n // 2) if n > 2 else n
    for i in range(n):
        b.beam(p0.lerp(p1, i / n), p0.lerp(p1, (i + 1) / n), w, h, cols[i % 2], **kw)


def container_crane(b):
    """Red-and-white banded ship-to-shore gantry crane, boom raised (about 100 m). Rails along X, water side +Z."""
    W, R = 'crane_w', 'crane_r'
    for sx in b.mirx():
        for z in (-13.5, 13.5):
            banded(b, (9.5, 0, z), (9.5, 48, z), 2.0, 2.0, 4)
            b.bb(9.5, 0, z, 3.2, 1.6, 5.5, 'steel')
        b.beam((9.5, 14, -13.5), (9.5, 14, 13.5), 1.6, 1.8, R)
        b.beam((9.5, 15, -13.5), (9.5, 47, 13.5), 1.0, 1.0, W, lx=True)
        b.beam((9.5, 48, -37), (9.5, 48, 15.5), 1.6, 2.6, W, caps=1)          # main girder (landside back reach)
        b.beam((9.5, 48, 13.5), (5.5, 74, 13.5), 1.6, 1.6, R)                 # A-frame
        b.beam((9.5, 48, -4), (5.5, 74, 13.0), 1.2, 1.2, R, lx=True)
        b.beam((5.5, 73, 13.5), (9.5, 49, -34), .45, .45, 'grey', lx=True)   # back stay
        banded(b, (6.5, 48.5, 15.5), (6.5, 99.0, 26.5), 1.5, 2.4, 6, up=(1, 0, 0), caps=1)   # raised boom
        b.beam((5.5, 74, 13.5), (6.5, 80, 22.2), .4, .4, 'grey', lx=True)   # forestays folded
        b.beam((5.5, 74, 13.5), (6.5, 96, 25.6), .4, .4, 'grey', lx=True)
    for z in (-13.5, 13.5):
        b.beam((-9.5, 46, z), (9.5, 46, z), 1.6, 2.0, W)
        b.beam((-9.5, 14, z), (9.5, 14, z), 1.2, 1.4, R)
    b.beam((-5.5, 73.5, 13.5), (5.5, 73.5, 13.5), 1.4, 1.4, R)
    b.beam((-6.5, 99, 26.5), (6.5, 99, 26.5), 1.2, 1.2, R)
    for t in (.3, .65):
        y, z = lerp(48.5, 99, t), lerp(15.5, 26.5, t)
        b.beam((-6.5, y, z), (6.5, y, z), .8, .8, W, lx=True)
    b.bb(0, 49.3, -26, 14, 7, 14, 'crane_w', u='white_d', f='grey')            # machinery house
    b.bb(3, 43.6, -6, 3.2, 3.0, 4.2, 'white', f='lit', l='lit', r='lit')       # operator cab on the trolley
    b.bb(0, 46.6, -6, 10, 1.2, 5, 'grey')
    b.bb(0, 99.6, 26.5, .8, .4, .8, 'beacon')
    for sx in b.mirx():
        b.bb(9.5, 74.8, 13.5, .7, .4, .7, 'beacon', skip='d') if b.hi else None
    if b.hi:
        for z in (-13.5, 13.5):
            b.beam((-9.5, 15, z), (9.5, 45, z), .6, .6, W)
            b.beam((9.5, 15, z), (-9.5, 45, z), .6, .6, W)
        b.beam((-9.5, 48, -37), (9.5, 48, -37), 1.2, 1.6, W)


MODELS = {
    'tokyo_water_bus': (water_bus, BP),
    'tokyo_yakatabune': (yakatabune, BP),
    'tokyo_ferry': (ferry, BP),
    'tokyo_container_ship': (container_ship, BP),
    'tokyo_tug': (tug, BP),
    'tokyo_fishing_boat': (fishing_boat, BP),
    'tokyo_container_crane': (container_crane, BP, {'settle': None}),
}

if __name__ == '__main__':
    run(MODELS)
