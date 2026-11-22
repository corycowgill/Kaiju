# Tokyo tier A towers, part 1 (design-towers): Tokyo Tower, Tokyo Skytree, Fuji TV.
# blender -b -P towers_build_a.py -- [ids...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2


def interp(tab, z):
    if z <= tab[0][0]:
        return tab[0][1]
    for (z0, v0), (z1, v1) in zip(tab[:-1], tab[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return tab[-1][1]


def lin(a, b, n):
    return [a + (b - a) * i / n for i in range(n + 1)]


# ------------------------------------------------------------------------------------------------ Tokyo Tower
@model('tokyo_tower', 'A', 333.0, face='south', stone=0xd9531e, fit=False,
       desc='94 m square at the feet: true open lattice (corner chords as tubes, X-bracing as strips), four splayed lattice legs with the arch '
            'between them, lift shaft, two-storey main deck at 150 m, top deck at 250 m, antenna, FootTown block under the legs; '
            'international-orange and white bands, warm floodlight emissive on the steel, lit decks, red warning lights')
def tokyo_tower(b):
    std(b)
    F = b.facade(Tex('tokyo_tower_foottown', cols=8, rows=4, bay=3.2, floor=4.6, size=(256, 256), wall=(.74, .72, .68), glass=(.23, .28, .33),
                     wx=(.05, .95), wy=(.30, .80), frame=(.42, .42, .42), mv=1, blind=.2, rough=.6, night=.62, seed=11))
    D = b.facade(Tex('tokyo_tower_deck', cols=8, rows=2, bay=1.75, floor=5.4, size=(256, 128), wall=(.88, .87, .84), glass=(.24, .31, .38),
                     wx=(.04, .96), wy=(.26, .86), frame=(.6, .6, .6), blind=.05, rough=.4, night=.93, rowrun=.5, warm=(1.0, .84, .58), seed=12))
    b.glow(orange=(.88, .29, .08, .58, .21, .04, .55), white=(.88, .87, .83, .56, .40, .21, .55), shaft=(.70, .52, .40, .34, .20, .09, .6),
           orange_d=(.70, .22, .07, .30, .11, .02, .6))
    b.colours(roof=(.42, .42, .42), conc=(.68, .67, .64, .85), dark=(.2, .2, .22, .6), glass=(.2, .24, .28, .25))
    PROF = [(0, 46.0), (12, 42.0), (24, 37.6), (35, 33.9), (46, 30.6), (60, 27.0), (75, 23.6), (90, 20.6), (105, 18.0), (120, 15.9),
            (135, 14.2), (142, 13.6), (156, 12.6), (175, 10.9), (200, 8.9), (225, 7.1), (247, 5.7)]
    hw = lambda z: interp(PROF, z)
    g = lambda z: max(0.0, (hw(z) - 11.0) * max(0.0, 1 - (z / 46.0) ** 2) ** 0.3)
    gi = lambda z: max(g(z), hw(z) - 13.0)

    def L(k, x, y, z):
        c, s = [(1, 0), (0, 1), (-1, 0), (0, -1)][k]
        return (x * c - y * s, x * s + y * c, z)

    def colz(z):
        if z < 142:
            return 'orange'
        for z1, c in ((172, 'white'), (197, 'orange'), (222, 'white'), (247, 'orange'), (257, 'white'), (283, 'orange'), (305, 'white'), (320, 'orange')):
            if z < z1:
                return c
        return 'white'
    cw = lambda z: 2.7 - 1.7 * min(z, 247) / 247
    sw = lambda z: 0.95 - 0.45 * min(z, 247) / 247
    hi = b.hi
    Z1 = [0, 12, 24, 35, 42, 46] if hi else [0, 24, 42, 46]
    Z2 = lin(46, 142, 16) if hi else lin(46, 142, 4)
    Z3 = lin(156, 247, 14) if hi else lin(156, 247, 3)

    def nx(z):
        if not hi:
            return 2 if z < 100 else 1
        return 5 if z < 70 else 4 if z < 94 else 3 if z < 118 else 2 if z < 200 else 1
    # corner chords, ground to the top deck
    for zs in (Z1, Z2, [142, 156], Z3):
        for z0, z1 in zip(zs[:-1], zs[1:]):
            for k in range(4):
                b.beam(L(k, hw(z0), -hw(z0), z0), L(k, hw(z1), -hw(z1), z1), cw(z0), colz((z0 + z1) / 2))
    # legs under the arch: outer faces, inner faces, inner chords
    for z0, z1 in zip(Z1[:-1], Z1[1:]):
        m = 'orange'
        h0, h1, g0, g1, i0, i1 = hw(z0), hw(z1), g(z0), g(z1), gi(z0), gi(z1)
        for k in range(4):
            for sx in (1, -1):
                P = lambda x, y, z: L(k, sx * x, y, z)
                b.qlat(P(g0, -h0, z0), P(h0, -h0, z0), P(g1, -h1, z1), P(h1, -h1, z1), 2 if hi else 1, m, w=sw(z0), wh=1.3)
                b.beam(P(g0, -h0, z0), P(g1, -h1, z1), 1.5, m)   # arch chord
                if hi and z0 < 35:
                    b.qlat(P(g0, -h0, z0), P(i0, -i0, z0), P(g1, -h1, z1), P(i1, -i1, z1), 1, 'orange_d', w=0.8)
            b.beam(L(k, i0, -i0, z0), L(k, i1, -i1, z1), 1.5, 'orange_d')
    # full faces from the arch to the main deck, and from the main deck to the top deck
    for zs in (Z2, Z3):
        for z0, z1 in zip(zs[:-1], zs[1:]):
            h0, h1 = hw(z0), hw(z1)
            m = colz((z0 + z1) / 2)
            for k in range(4):
                b.qlat(L(k, -h0, -h0, z0), L(k, h0, -h0, z0), L(k, -h1, -h1, z1), L(k, h1, -h1, z1), nx(z0), m, w=sw(z0), wh=sw(z0) * 1.5)
    for k in range(4):   # girder over the arch
        b.beam(L(k, -hw(46), -hw(46), 46), L(k, hw(46), -hw(46), 46), 1.6, 'orange', d=2.2)
        if hi:
            b.beam(L(k, -hw(94), -hw(94), 94), L(k, hw(94), -hw(94), 94), 1.2, 'orange', d=1.6)
    # lift shaft
    b.prism(rect(8.5, 8.5), 19, 142, 'shaft', top=None)
    if hi:
        for z in lin(30, 138, 9):
            b.band(rect(8.5, 8.5), z, 0.8, 0.5, 'orange_d', top=False, bottom=False)
        for k in range(4):   # stair / service legs beside the shaft
            b.beam(L(k, 7.5, -7.5, 19), L(k, 7.5, -7.5, 142), 0.7, 'orange_d')
    # main deck (two storeys)
    sq = lambda h: rect(2 * h, 2 * h)
    b.ring(sq(13.9), 138.5, 143.0, 'white', poly1=sq(17.6))
    b.cap(sq(13.9), 138.5, 'white', down=True)
    b.ring(sq(17.6), 143.0, 153.8, D, vfloors=2)
    b.band(sq(17.6), 153.8, 1.0, 0.5, 'white')
    b.cap(sq(17.6), 154.6, 'roof')
    b.prism(sq(13.2), 154.6, 157.5, 'white', top='roof')
    if hi:
        b.band(sq(17.6), 148.0, 0.7, 0.45, 'white')
        b.band(sq(17.6), 142.6, 0.8, 0.45, 'white')
        b.fins(sq(17.6), 143.0, 153.8, 'white', n=4, w=0.5, dep=0.35, ends=True)
    # top deck
    oc = lambda r: ngon(r, 8, rot=math.radians(22.5))
    b.ring(oc(6.3), 245.5, 248.5, 'white', poly1=oc(8.6))
    b.cap(oc(6.3), 245.5, 'white', down=True)
    b.ring(oc(8.6), 248.5, 253.9, D, vfloors=1)
    b.ring(oc(8.6), 253.9, 255.0, 'white', poly1=oc(8.9))
    b.ring(oc(8.9), 255.0, 257.0, 'white', poly1=oc(5.0))
    b.cap(oc(5.0), 257.0, 'roof')
    # antenna: lattice mast, then the stepped pole
    ZA = lin(257, 283, 4) if hi else [257, 283]
    ha = lambda z: 3.0 - 0.9 * (z - 257) / 26
    for z0, z1 in zip(ZA[:-1], ZA[1:]):
        for k in range(4):
            b.beam(L(k, ha(z0), -ha(z0), z0), L(k, ha(z1), -ha(z1), z1), 0.6, 'orange')
            b.qlat(L(k, -ha(z0), -ha(z0), z0), L(k, ha(z0), -ha(z0), z0), L(k, -ha(z1), -ha(z1), z1), L(k, ha(z1), -ha(z1), z1), 1, 'orange', w=0.4)
    b.prism(sq(1.7), 283, 305, 'white', poly1=sq(1.25), top='white')
    b.prism(sq(1.0), 305, 320, 'orange', poly1=sq(0.8), top='orange')
    b.cyl(0, 0, 0.5, 320, 333.0, 6, 'white', r1=0.3)
    if hi:
        for z in (262, 268, 274, 280, 288, 294, 300):   # antenna element rings
            b.band(sq(ha(min(z, 283)) if z < 283 else 1.5), z, 0.5, 1.0, 'white' if z < 283 else 'orange', top=True, bottom=True)
        beacons(b, [(0, 0, 331.2)] + [L(k, 2.0, -2.0, 283) for k in range(4)] + [L(k, 8.0, 0, 256) for k in range(4)] + [L(k, 17.2, -17.2, 154.8) for k in range(4)])
    else:
        beacons(b, [(0, 0, 331.2)])
    # FootTown block and the leg footings
    ft = rect(62.0, 52.0)
    b.prism(ft, 0, 18.4, F, top='roof', vfloors=4)
    b.band(ft, 18.4, 1.0, 0.4, 'conc', bottom=False)
    b.prism(rect(30, 22, 0, 4), 18.4, 23.0, 'conc', top='roof')
    for k in range(4):
        c = L(k, 39.5, -39.5, 0)
        b.cbox(c[0], c[1], 16, 16, 0, 1.6, 'conc')
    if hi:
        b.portal(ft[0], ft[1], 0.0, 10.0, 4.6, 'conc', 'lobby', dep=0.8, canopy=3.0)
        b.band(ft, 4.9, 0.5, 0.5, 'conc', edges={0, 1, 3})
        b.cbox(-18, -6, 10, 8, 18.4, 21.5, 'conc')
        b.cbox(20, 14, 12, 9, 23.0, 25.0, 'dark')


# ------------------------------------------------------------------------------------------------ Tokyo Skytree
@model('tokyo_skytree', 'A', 634.0, face='south', stone=0xdfe6ee, fit=False,
       desc='68 m rounded-triangle base morphing to a circle by 300 m: sparse white lattice skin (columns, rings, diagonals as strips) over a '
            'pale core, the flared Tembo Deck at 340-360 m and Galleria at 445-455 m with its spiral glass ramp, gain tower to 634 m; '
            'pale blue core light and blue-violet deck lighting emissive')
def skytree(b):
    std(b)
    D = b.facade(Tex('skytree_deck', cols=8, rows=2, bay=1.7, floor=5.0, size=(256, 128), wall=(.84, .87, .90), glass=(.25, .33, .43),
                     wx=(.04, .96), wy=(.16, .90), frame=(.62, .65, .7), blind=.04, rough=.3, night=.9, rowrun=.5, cool=.45, warm=(.92, .86, 1.0), seed=21))
    b.glow(white=(.87, .90, .93, .20, .22, .36, .45), core=(.58, .64, .72, .17, .25, .52, .6), violet=(.66, .64, .88, .55, .44, 1.0, .4),
           gain=(.84, .86, .90, .24, .25, .40, .4), tube=(.55, .66, .80, .50, .62, 1.0, .25))
    b.colours(roof=(.52, .54, .57), deckw=(.86, .88, .91, .4), dark=(.3, .33, .37, .5))
    hi = b.hi
    RC = [(0, 28.6), (60, 25.0), (150, 20.4), (250, 17.6), (340, 15.6)]

    def node(th, z):
        t = min(1.0, z / 300.0)
        t = t * t * (3 - 2 * t)
        ph = ((th - math.pi / 2) % (2 * math.pi / 3)) - math.pi / 3
        f = min(1.0 / math.cos(ph), 1.74) * 0.8
        r = interp(RC, z) * ((1 - t) * f + t)
        return Vector((r * math.cos(th), r * math.sin(th), z))

    def lattice(N, zs, pt, wv, wr, wd, mat='white'):
        for j, (z0, z1) in enumerate(zip(zs[:-1], zs[1:])):
            for i in range(N):
                a0, a1 = math.pi / 2 + 2 * math.pi * i / N, math.pi / 2 + 2 * math.pi * (i + 1) / N
                p00, p10, p01, p11 = pt(a0, z0), pt(a1, z0), pt(a0, z1), pt(a1, z1)
                b.strip(p00, p01, wv, mat, nrm=(math.cos(a0), math.sin(a0), 0))
                n = (p10 - p00).cross(p01 - p00)
                b.strip(p01, p11, wr, mat, nrm=n)
                if (i + j) % 2:
                    b.strip(p00, p11, wd, mat, nrm=n)
                else:
                    b.strip(p10, p01, wd, mat, nrm=n)
    N = b.seg(24, 12)
    lattice(N, lin(0, 340, 28) if hi else lin(0, 340, 9), node, 1.25, 0.75, 0.62)
    b.lathe([(12.5, 0), (10.0, 150), (8.5, 340)], b.seg(12, 8), 'core', cap=False)
    # entrance plinth
    base = [tuple(node(math.pi / 2 + 2 * math.pi * i / 12, 0)[:2]) for i in range(12)]
    b.prism(scale(base, 0.86), 0, 7.5, D, top='deckw', vfloors=1)
    b.band(scale(base, 0.86), 7.5, 0.9, 0.8, 'deckw')
    C = lambda r: ngon(r, N, rot=math.pi / 2)
    # Tembo Deck: inverted cone of glass, three levels, the roof drum
    b.ring(C(15.8), 336.0, 341.0, 'deckw', poly1=C(18.0), smooth=True)
    b.ring(C(18.0), 341.0, 351.5, D, poly1=C(25.6), smooth=True, vfloors=2)
    b.ring(C(25.6), 351.5, 352.6, 'violet', smooth=True)
    b.ring(C(25.6), 352.6, 353.2, 'deckw', poly1=C(22.0), smooth=True)
    b.ring(C(22.0), 353.2, 358.4, D, poly1=C(22.8), smooth=True, vfloors=1)
    b.ring(C(22.8), 358.4, 359.4, 'violet', smooth=True)
    b.ring(C(22.8), 359.4, 360.0, 'roof', poly1=C(13.5), smooth=True)
    b.ring(C(13.5), 360.0, 370.0, 'deckw', smooth=True)
    b.ring(C(13.5), 370.0, 375.0, 'deckw', poly1=C(11.2), smooth=True)
    # shaft between the decks
    N2 = b.seg(16, 8)
    sh = lambda th, z: Vector(((11.0 - 1.2 * (z - 375) / 68) * math.cos(th), (11.0 - 1.2 * (z - 375) / 68) * math.sin(th), z))
    lattice(N2, lin(375, 443, 6) if hi else lin(375, 443, 2), sh, 0.9, 0.6, 0.5)
    b.lathe([(6.4, 375), (6.0, 443)], 8, 'core', cap=False)
    # Tembo Galleria and the spiral glass ramp
    b.ring(C(9.8), 441.5, 446.5, 'deckw', poly1=C(13.8), smooth=True)
    b.ring(C(13.8), 446.5, 451.6, D, poly1=C(14.8), smooth=True, vfloors=1)
    b.ring(C(14.8), 451.6, 452.6, 'violet', smooth=True)
    b.ring(C(14.8), 452.6, 453.4, 'roof', poly1=C(10.5), smooth=True)
    b.ring(C(10.5), 453.4, 462.0, 'deckw', poly1=C(8.6), smooth=True)
    ns = b.seg(26, 9)
    hel = lambda t: (16.2 * math.cos(math.radians(-90 + 400 * t)), 16.2 * math.sin(math.radians(-90 + 400 * t)), 444.6 + 9.4 * t)
    for i in range(ns):
        b.beam(hel(i / ns), hel((i + 1) / ns), 3.0, 'tube', d=3.0, caps=(i in (0, ns - 1)))
    # upper lattice and the gain tower
    N3 = b.seg(12, 6)
    up = lambda th, z: Vector(((8.6 - 2.4 * (z - 462) / 33) * math.cos(th), (8.6 - 2.4 * (z - 462) / 33) * math.sin(th), z))
    lattice(N3, lin(462, 495, 3) if hi else [462, 495], up, 0.8, 0.55, 0.45)
    b.lathe([(4.6, 462), (4.2, 495)], 8, 'core', cap=False)
    b.lathe([(6.2, 494.2), (8.0, 495.0), (8.0, 496.6), (3.6, 497.2)], N3, 'deckw', cap=False)
    b.lathe([(3.5, 495), (3.3, 549), (4.5, 549.6), (4.5, 551.4), (2.7, 552), (2.5, 599), (3.5, 599.6), (3.5, 601.2), (1.7, 602), (1.2, 627), (0.45, 634.0)],
            b.seg(10, 6), 'gain')
    beacons(b, [(7.2 * math.cos(a), 7.2 * math.sin(a), 496.6) for a in (0.5, 2.6, 4.7)] + [(0, 0, 632.6)], s=1.4)
    if hi:
        beacons(b, [(4.0 * math.cos(a), 4.0 * math.sin(a), 551.4) for a in (0, 2.1, 4.2)] + [(3.0 * math.cos(a), 3.0 * math.sin(a), 601.2) for a in (1, 3.1, 5.2)]
                + [(24.5 * math.cos(a), 24.5 * math.sin(a), 353.0) for a in (0.3, 1.87, 3.44, 5.0)], s=1.3)
        for z in (575, 615):
            b.lathe([(3.2, z), (3.2, z + 1.0)], 8, 'violet', cap=False)


# ------------------------------------------------------------------------------------------------ Fuji TV
@model('fuji_tv_building', 'A', 123.0, face='north', stone=0xb9bec4,
       desc='Tange megastructure, 240 x 70 m: the wide office tower and the media tower joined by three levels of twin sky corridors on a grid '
            'of megacolumns, the 32 m titanium sphere in the top bay, studio podium with the grand stair and tube escalator, roof mast')
def fuji_tv(b):
    std(b)
    T = b.facade(Tex('fuji_tv_panel', cols=8, rows=8, bay=3.6, floor=4.3, size=(256, 512), wall=(.72, .74, .76), glass=(.21, .26, .32),
                     wx=(.14, .86), wy=(.28, .78), frame=(.48, .5, .53), course=1, blind=.15, rough=.38, noise=.02, night=.5, cool=.3, seed=31))
    b.colours(alu=(.74, .76, .78, .35, .45), alu_d=(.55, .57, .60, .4, .4), titan=(.72, .73, .74, .28, .8), roof=(.42, .43, .44), conc=(.66, .66, .64, .85),
              step=(.62, .62, .60, .85), glass=(.17, .21, .26, .2), mast=(.8, .8, .8, .5))
    b.glow(band=(.30, .33, .36, .85, .80, .62, .3), tube=(.42, .5, .58, .55, .70, .95, .25))
    hi = b.hi
    ZR = 108.0
    LV = [(32.0, 40.0), (62.0, 70.0), (92.0, 100.0)]
    # towers
    off = rect2(-119, -22, -27, 27)
    med = rect2(64, 119, -27, 27)
    for P in (off, med):
        b.prism(P, 0, ZR, T, top='roof')
        b.band(P, ZR, 1.6, 0.5, 'alu', bottom=False)
        for z0, z1 in LV:   # megaframe beams round the towers
            b.band(P, z0 + 2.0, 4.0, 1.1, 'alu')
        b.fins(P, 0, ZR + 1.6, 'alu', n=2, w=5.0, dep=1.5, ends=True, top=True, lo=1)
        if hi:
            b.band(P, 5.0, 0.6, 0.6, 'alu_d')
            b.fins(P, 0, ZR, 'alu', n=8, w=1.3, dep=0.55, minlen=20)
    b.prism(rect2(-106, -36, -17, 17), ZR, 114.0, 'alu_d', top='roof')
    b.prism(rect2(74, 110, -17, 17), ZR, 115.0, 'alu_d', top='roof')
    # megacolumns and sky corridors in the open bays
    for x in (21,):
        for y in (-22, 22):
            if x == 21:
                b.cbox(x, y, 5.6, 5.6, 0, ZR + 2.0, 'alu')
    for z0, z1 in LV:
        for y in (-22, 22):
            c = rect2(-22, 21 if z0 > 80 else 64, y - 4.5, y + 4.5)
            b.ring(c, z0, z1, T, vfloors=2, only={0, 2})
            b.cap(c, z1, 'roof')
            b.cap(c, z0, 'alu_d', down=True)
            if hi:
                b.band(c, z1 - 0.2, 0.8, 0.4, 'alu', edges={0, 2}, bottom=False)
                b.band(c, z0 - 0.6, 0.8, 0.4, 'alu', edges={0, 2}, top=False)
                b.fins(c, z0, z1, 'alu', spacing=3.6, w=0.55, dep=0.3, edges={0, 2})
        for x in (0,) if z0 > 80 else (0, 21, 42):   # cross corridors
            c = rect2(x - 3.5, x + 3.5, -17.5, 17.5)
            b.ring(c, z0 + 0.5, z1 - 0.5, 'band', only={1, 3})
            b.cap(c, z1 - 0.5, 'roof')
            b.cap(c, z0 + 0.5, 'alu_d', down=True)
    for y in (-22, 22):   # top frame
        b.box(-22, 64, y - 2.5, y + 2.5, ZR - 3.2, ZR + 1.6, 'alu', bottom=True)
    # the sphere
    R, sc, sz = 16.0, (42.5, -3.0), 88.2
    n, m = b.seg(24, 10), b.seg(12, 5)
    prof = [(R * math.sin(math.pi * i / m), sz - R * math.cos(math.pi * i / m)) for i in range(m + 1)]
    prof[0] = (0.0, sz - R)
    prof[-1] = (0.0, sz + R)
    b.lathe(prof, n, 'titan', cx=sc[0], cy=sc[1])
    b.lathe([(R * 0.985, sz + 2.0), (R * 0.995, sz + 3.6)], n, 'band', cx=sc[0], cy=sc[1], cap=False)
    if hi:
        for sx in (-1, 1):   # sphere cradle
            for sy in (-1, 1):
                b.beam((sc[0] + sx * 9, sy * 19.0, 70.0), (sc[0] + sx * 7, sc[1] + sy * 9.0, sz - 11.5), 1.6, 'alu_d')
    # studio podium, roof garden, grand stair, tube escalator
    pod = rect2(-22, 64, -17, 27)
    b.prism(pod, 0, 30.0, T, top='roof', skip={1, 3})
    b.band(pod, 30.0, 1.2, 0.4, 'alu', edges={0, 2}, bottom=False)
    ns = b.seg(15, 2)
    for i in range(ns):
        y0, y1 = -42 + 25 * i / ns, -42 + 25 * (i + 1) / ns
        b.box(-4, 50, y0, -17, 30.0 * i / ns, 30.0 * (i + 1) / ns, 'step')
    b.beam((-18, -41, 1.6), (12, -19, 31.5), 3.4, 'tube', caps=True)
    if hi:
        b.fins(pod, 0, 30.0, 'alu', n=4, w=1.2, dep=0.5, edges={2})
        b.portal(off[0], off[1], 0.0, 9.0, 5.0, 'alu_d', 'lobby', dep=1.2, canopy=3.0)
        b.portal(med[0], med[1], 0.0, 7.0, 5.0, 'alu_d', 'lobby', dep=1.2, canopy=3.0)
        for x, y, w, d, h in ((-92, 4, 9, 9, 3.5), (-58, -6, 12, 8, 2.6), (84, 8, 7, 7, 3.0)):
            b.cbox(x, y, w, d, 114.0, 114.0 + h, 'alu')
        b.cyl(-74, 6, 4.2, 114.0, 115.2, 10, 'mast')   # dishes
        b.cyl(100, -6, 3.2, 115.0, 116.0, 10, 'mast')
    # mast on the media tower
    b.prism(rect(2.4, 2.4, 92, 0), 115.0, 119.9, 'mast', top='mast', poly1=rect(1.2, 1.2, 92, 0))
    b.cyl(92, 0, 0.35, 119.9, 123.0, 5, 'mast')
    beacons(b, [(92, 0, 118.8), (-118, -26, ZR + 1.6), (118, 26, ZR + 1.6), (-118, 26, ZR + 1.6), (118, -26, ZR + 1.6)], s=1.2)


if __name__ == '__main__':
    run()
