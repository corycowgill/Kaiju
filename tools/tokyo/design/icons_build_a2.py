# icons_build_a2.py - Tokyo tier A: Rainbow Bridge, National Diet Building, Kabuki-za.
# blender -b -P icons_build_a2.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


# ------------------------------------------------------------------ Rainbow Bridge
# X along the bridge, Z across; origin mid-span at water level (y 0 = waterline). Symmetric about x = 0 and z = 0.
@model('rainbow_bridge', tier='A', face='south', stone=0xd4d4ce, water=True, waterline=True, ground=False, center=False,
       close=((-90, 30, 210), (-285, 66, 0), 26), dusk=0,
       extra="origin: 'midspan', ",
       desc="Rainbow Bridge, whole bridge at true size, X along it: towers at x +-285 (126 m, legs at z +-17, three cross-beams), 570 m main span, side spans to the anchorage blocks (faces at x +-399, cables anchored at +-432 = 147 m), blocks to +-465, deck ends at +-470. Double deck: upper road y 60, lower deck y 50.8 with the transit guideway; z +-14.5. Main cables are true parabolic catenaries (lit white), sparse strip suspenders, strip truss diagonals; floodlit white towers, red aviation lights. y 0 = waterline")
def rainbow_bridge(b):
    WH = 0xdcdcd6; wht = b.cf(WH, 0.42, tint=0xf0f4ff); wht2 = b.cf(mul(WH, 0.9), 0.3, tint=0xf0f4ff); conc = b.c(0xa4a29a); conc2 = b.c(0x8c8a84); asph = b.c(0x3c3e42); steel = b.cf(0xc8cac8, 0.1)
    cable = b.glow(WHITEL, 0.85, 0xe4e4e0); lamp = b.glow(0xffe2b0, 0.9, 0xd8d0c0); dark = b.c(0x2c2e32); fasc = b.cf(0xd0d0cc, 0.22)
    def anch(c):
        c.rect(0, 0, 1, 1, 0xcfcdc4); c.noise(0.06, 5); c.joints(6, 4, 0.9, 1.0, stagger=False)
        for i in range(4): c.window(0.08 + i * 0.25, 0.72, 0.2 + i * 0.25, 0.8, 0x39434c, 0x8a8c8c, mull=(3, 1), sill=False, lit=0.6)
        c.flood(0.3, 0xf0f4ff, grad=0.6)
    an_s = b.band('anch', 64, anch, bay=33.0)
    def train(c):
        c.rect(0, 0, 1, 1, 0xd0d2d4); c.rect(0, 0, 1, 0.2, 0x4a4e52); c.rect(0, 0.28, 1, 0.36, 0x3a6ab0); c.litp = 1.0
        for i in range(6): c.window(0.04 + i * 0.16, 0.44, 0.17 + i * 0.16, 0.84, 0x39434c, 0x8a8c8c, mull=(1, 1), sill=False)
    tr_s = b.band('train', 32, train, bay=9.0)
    XT, XA0, XC, XA1, XE = 285.0, 399.0, 432.0, 465.0, 470.0; ZD = 14.5; ZC = 15.6; YL, YU = 50.0, 60.0; YTOP = 126.0; YSAD = 124.0; YMID = 64.5
    # ---- deck: upper road slab, lower deck slab + guideway, chords, strip truss
    b.box(-XE, XE, YU - 1.0, YU, -ZD, ZD, fasc, top=asph, bot=True)
    b.box(-XE, XE, YL, YL + 0.8, -ZD, ZD, fasc, top=asph, bot=True)
    b.box(-XE, XE, YL + 0.8, YL + 1.5, -4.2, 4.2, conc, bot=False)
    for (x0, x1) in ((-180, -126), (60, 114)): b.box(x0, x1, YL + 1.7, YL + 5.0, -3.6, -0.9, F(tr_s, bay=9.0), top=b.c(0xb0b4b6), l=dark, r=dark) if x0 < 0 else b.box(x0, x1, YL + 1.7, YL + 5.0, 0.9, 3.6, F(tr_s, bay=9.0), top=b.c(0xb0b4b6), l=dark, r=dark)
    if b.hi:
        for sz in (-1, 1):
            b.box(-XE, XE, YU, YU + 1.1, sz * ZD - 0.15, sz * ZD + 0.15, fasc); b.box(-XE, XE, YU, YU + 0.8, sz * 0.4 - 0.25, sz * 0.4 + 0.25, conc)
        np_ = 56; pl = 2 * XA0 / np_
        for i in range(np_):
            x0 = -XA0 + i * pl; x1 = x0 + pl; up = i % 2 == 0
            for sz in (-1, 1):
                z = sz * (ZD - 0.05); ya, yb = (YL + 0.8, YU - 1.0) if up else (YU - 1.0, YL + 0.8)
                b.face([(x0, ya, z), (x0 + 0.9, ya, z), (x1 + 0.9, yb, z), (x1, yb, z)], steel); b.face([(x0 - 0.3, YL + 0.8, z), (x0 + 0.3, YL + 0.8, z), (x0 + 0.3, YU - 1.0, z), (x0 - 0.3, YU - 1.0, z)], steel)
            b.box(x0 - 0.4, x0 + 0.4, YL - 1.6, YL, -ZD, ZD, steel, bot=True, notop=True)
        # road lamps on the upper deck
        for i in range(-10, 11):
            for sz in (-1, 1):
                x = i * 47.5; b.bx(x, sz * (ZD - 0.5), 0.3, 0.3, YU, 9.0, steel); b.bx(x, sz * (ZD - 1.6), 0.5, 2.2, YU + 8.8, 0.3, lamp)
    # ---- towers
    for sx in (-1, 1):
        xt = sx * XT
        b.prism([(xt - 13, 22), (xt - 9, 30), (xt + 9, 30), (xt + 13, 22), (xt + 13, -22), (xt + 9, -30), (xt - 9, -30), (xt - 13, -22)], 0, 7.0, conc, top=conc2)
        for sz in (-1, 1):
            lv = [(7.0, 19.0, 7.0, 5.0), (46.0, 18.0, 6.4, 4.6), (90.0, 17.0, 5.6, 4.2), (YTOP, 16.2, 4.8, 3.8)]
            rings = [[(xt - w / 2, y, sz * zc + d / 2), (xt + w / 2, y, sz * zc + d / 2), (xt + w / 2, y, sz * zc - d / 2), (xt - w / 2, y, sz * zc - d / 2)] for (y, zc, w, d) in lv]
            b.loft(rings if b.hi else [rings[0], rings[-1]], wht, capb=wht2)
            b.bx(xt, sz * 16.2, 6.2, 5.0, YTOP - 0.01, 1.6, wht2); avlight(b, xt, YTOP + 1.6, sz * 16.2, 1.0)
            if b.hi:
                for y in (46.0, 90.0): avlight(b, xt + 3.4, y, sz * 18.6, 0.7)
                for y in (30.0, 68.0, 104.0): b.box(xt - 3.6, xt + 3.6, y, y + 0.5, sz * 17.6 - 2.9, sz * 17.6 + 2.9, wht2, bot=True)
        for (y0, y1, w) in ((40.5, 47.5, 5.4), (84.0, 89.0, 4.6), (116.0, 123.0, 4.2)):
            b.box(xt - w / 2, xt + w / 2, y0, y1, -17.2, 17.2, wht, bot=True)
            if b.hi: b.box(xt - w / 2 - 0.2, xt + w / 2 + 0.2, y1 - 0.8, y1, -16.0, 16.0, wht2, bot=True)
        if b.hi:   # haunches under the top beam
            for sz in (-1, 1): b.face([(xt + 2.15, 116.0, sz * 14.2), (xt + 2.15, 116.0, sz * 9.0), (xt + 2.15, 111.0, sz * 14.6)][::sz], wht); b.face([(xt - 2.15, 116.0, sz * 14.2), (xt - 2.15, 116.0, sz * 9.0), (xt - 2.15, 111.0, sz * 14.6)][::-sz], wht)
        # ---- anchorage block: battered base under the deck, cheek walls with a sloping top either side of it
        xa0, xa1 = (XA0, XA1) if sx > 0 else (-XA1, -XA0)
        b.frust((xa0 - 2, xa1 + 2, -24, 24), (xa0, xa1, -21.5, 21.5), 0, YL - 1.6, an_s, top=conc2)
        for sz in (-1, 1):
            z0, z1 = (15.8, 21.5) if sz > 0 else (-21.5, -15.8)
            yi, yo = 71.0, 64.0; xi, xo = (xa1, xa0) if sx > 0 else (xa0, xa1)   # high at the landward end
            b.box(xa0, xa1, YL - 1.6, yo, z0, z1, F(an_s, bay=33.0), notop=True)
            pts = [(xo, yo), (xi, yo), (xi, yi), (xo + (xi - xo) * 0.45, yi)]
            for zz, flip in ((z1, sx * 1), (z0, -sx * 1)):
                q = [(x, y, zz) for (x, y) in pts]; b.face(q if (flip > 0) else q[::-1], wht2)
            b.face([(xi, yi, z0), (xi, yi, z1), (xo + (xi - xo) * 0.45, yi, z1), (xo + (xi - xo) * 0.45, yi, z0)][::sx], conc2)
            b.face([(xo + (xi - xo) * 0.45, yi, z0), (xo + (xi - xo) * 0.45, yi, z1), (xo, yo, z1), (xo, yo, z0)][::sx], conc2)
            b.face([(xi, yo, z1), (xi, yo, z0), (xi, yi, z0), (xi, yi, z1)][::sx], wht2)
        # ---- main cables + suspenders
        for sz in (-1, 1):
            z = sz * ZC
            n = b.d(16, 5); pm = [(sx * XT * i / n, YMID + (YSAD - YMID) * (i / n) ** 2) for i in range(n + 1)]
            ns = b.d(8, 3); ps = [(sx * (XT + (XC - XT) * i / ns), YSAD + (62.0 - YSAD) * (i / ns) - 9.0 * 4 * (i / ns) * (1 - i / ns)) for i in range(ns + 1)]
            for pp in (pm, ps):
                for i in range(len(pp) - 1): b.tube((pp[i][0], pp[i][1], z), (pp[i + 1][0], pp[i + 1][1], z), 0.55, cable, seg=b.d(6, 3), smooth=True)
            if b.hi:
                for i in range(1, 12):
                    x = sx * XT * i / 12; y = YMID + (YSAD - YMID) * (i / 12) ** 2
                    b.face([(x - 0.22, YU, z), (x + 0.22, YU, z), (x + 0.22, y, z), (x - 0.22, y, z)], steel)
                    b.bx(x, z, 1.0, 1.0, y - 0.5, 1.0, cable)
                for i in range(1, 4):
                    t = i / 4; x = sx * (XT + (XC - XT) * t * 0.78); tt = t * 0.78; y = YSAD + (62.0 - YSAD) * tt - 36.0 * tt * (1 - tt)
                    b.face([(x - 0.22, YU, z), (x + 0.22, YU, z), (x + 0.22, y, z), (x - 0.22, y, z)], steel)
    if b.hi:
        for sz in (-1, 1): b.face([(-0.22, YU, sz * ZC), (0.22, YU, sz * ZC), (0.22, YMID, sz * ZC), (-0.22, YMID, sz * ZC)], steel)


# ------------------------------------------------------------------ National Diet Building
@model('national_diet_building', tier='A', face='east', stone=0xc4c0b4,
       close=((-50, 16, 120), (0, 26, 30), 30),
       desc="National Diet Building: pale granite, 206 m symmetric front with giant pilasters between window strips over a rusticated base, projecting end pavilions, the two chamber blocks with hipped roofs behind, the pillared centre porch with its steps and the 65 m tower with a columned stage under the stepped pyramid; courtyards and rear range")
def national_diet_building(b):
    G = 0xc6c2b6; gr = b.cf(G, 0.2); gr2 = b.cf(mul(G, 0.9), 0.16); roof = b.c(0x6a6c6a); dark = b.c(0x2e3034); bronze = b.c(0x5a4a34, 0.5, 0.5); lit = b.glow(WARM, 0.8, 0x6a5a40)
    base = b.band('base', 48, fl(p_grid(mul(G, 0.93), 4, 1, wx=(0.28, 0.72), wy=(0.2, 0.82), rows=6, cols=4, lit=0.35, top=(0.1, G)), 0.22), bay=13.0)
    main = b.band('main', 128, fl(p_grid(G, 4, 2, wx=(0.26, 0.74), wy=(0.1, 0.86), rows=20, cols=6, lit=0.35, mull=(2, 3), top=(0.05, mul(G, 1.05))), 0.2), bay=13.0)
    att = b.band('attic', 32, fl(p_grid(G, 4, 1, wx=(0.3, 0.7), wy=(0.2, 0.75), lit=0.3, top=(0.2, mul(G, 1.06))), 0.18), bay=13.0)
    ash = b.band('ash', 32, fl(p_ashlar(G, 4, 6), 0.2), bay=10.0)
    def tw(c):
        c.rect(0, 0, 1, 1, G); c.noise(0.05, 5); c.joints(14, 4, 0.9)
        for i in range(4): c.window(i / 4 + 0.07, 0.08, i / 4 + 0.18, 0.86, 0x39434c, mul(G, 0.7), mull=(1, 5), lit=0.8)
        c.rect(0, 0.92, 1, 1, mul(G, 1.06)); c.flood(0.3)
    tw_s = b.band('tower', 64, tw, bay=22.0)
    L3 = [(5.0, base), (12.5, main), (3.0, att)]; H3 = 20.5
    def blk(x0, x1, z0, z1, lv=L3, top=roof, par=True):
        y = b.stack(B.rect(x0, x1, z0, z1), 0, lv, top=top)
        if par and b.hi: b.box(x0 - 0.4, x1 + 0.4, y - 0.9, y, z0 - 0.4, z1 + 0.4, gr, bot=True, notop=True); b.cap(B.rect(x0 - 0.4, x1 + 0.4, z0 - 0.4, z1 + 0.4), y + 0.02, top)
        return y
    def pil(p0, p1, n, y0=5.0, y1=17.5, w=1.1): 
        if b.hi: pilasters(b, p0, p1, y0, y1, n, w, 0.45, gr)
    # front range, side ranges, rear range, centre spine
    blk(-103, 103, 22, 44); blk(-103, -82, -44, 22); blk(82, 103, -44, 22); blk(-82, 82, -44, -30); blk(-22, 22, -30, 22, [(5.0, base), (12.5, main), (3.0, att), (6.5, ash)])
    for sx in (-1, 1):
        x0, x1 = (84, 105) if sx > 0 else (-105, -84)
        blk(x0, x1, 16, 48, [(5.0, base), (12.5, main), (3.0, att), (2.0, ash)]); pil((x0 + 1.5, 48), (x1 - 1.5, 48), 6, w=1.2)
        pil((sx * 24.5, 44), (sx * 82.5, 44), 19) if sx > 0 else pil((-82.5, 44), (-24.5, 44), 19)
        xs = sx * 105
        pil((xs, 46) if sx > 0 else (xs, 18), (xs, 18) if sx > 0 else (xs, 46), 8, w=1.2)
        pil((sx * 103, 14) if sx > 0 else (sx * 103, -42), (sx * 103, -42) if sx > 0 else (sx * 103, 14), 17)
        pil((sx * 26, -44) if sx < 0 else (sx * 80, -44), (sx * 80, -44) if sx < 0 else (sx * 26, -44), 17)
        b.box(sx * 19 - 0.6, sx * 19 + 0.6, 0, 1.1, 60, 80, gr2)
        # chamber block with its hipped roof and lantern
        cx0, cx1 = (32, 74) if sx > 0 else (-74, -32)
        blk(cx0, cx1, -24, 16, [(5.0, base), (12.5, main), (3.0, att), (4.5, ash)], par=False)
        b.frust((cx0 - 0.5, cx1 + 0.5, -24.5, 16.5), (cx0 + 12, cx1 - 12, -12, 4), 25.0, 30.0, roof, top=b.c(0x4a5a64, 0.4))
        if b.hi:
            b.box(cx0 + 13, cx1 - 13, 30.0, 31.2, -11, 3, b.glow(0xd4e2ff, 0.35, 0x4a5a64), bot=False)
            pilasters(b, (cx0 + 2, 16), (cx1 - 2, 16), 5.0, 20.5, 7, 1.2, 0.45, gr); pilasters(b, (cx1 - 2, -24), (cx0 + 2, -24), 5.0, 20.5, 7, 1.2, 0.45, gr)
            for k in range(5): b.bx(sx * 92.5, -36 + k * 17, 6, 5, 20.5, 2.2, gr2, top=roof)
            for k in range(4): b.bx(sx * (30 + k * 16), 33, 5, 6, 20.5, 2.0, gr2, top=roof)
            for z in (64, 76):   # forecourt lamp standards
                b.bx(sx * 19, z, 1.2, 1.2, 0, 1.6, gr2); b.cyl(sx * 19, z, 0.16, 1.6, 6.0, 6, bronze, cap=False); b.lathe(sx * 19, z, [(0.0, 5.9), (0.55, 6.3), (0.55, 7.0), (0.0, 7.4)], 6, b.glow(WARM, 0.9, 0xd8d0b8))

    # centre pavilion + porch
    blk(-24, 24, 22, 50, [(5.0, base), (12.5, main), (3.0, att), (6.5, ash)]); pil((-22, 50), (22, 50), 2, y1=27.0, w=2.2)
    b.box(-17, 17, 0, 3.0, 50, 60, ash, top=gr)
    for k in range(b.d(5, 2)): b.box(-15, 15, 0, 3.0 - 0.6 * k * b.d(1, 2.5) - 0.0001, 60 + 1.2 * k * b.d(1, 2.5), 61.2 + 1.2 * k * b.d(1, 4), gr2)
    for i in range(6):
        x = -14.5 + i * 5.8; b.bx(x, 58.4, 1.9, 1.9, 3.0, 12.5, gr)
        if b.hi: b.bx(x, 58.4, 2.3, 2.3, 3.0, 0.8, gr2); b.bx(x, 58.4, 2.3, 2.3, 14.7, 0.8, gr2)
    b.box(-17, 17, 15.5, 19.0, 50, 60, gr, bot=True); b.box(-17.5, 17.5, 19.0, 20.0, 50, 60.5, gr2, bot=True)
    for x in (-5.8, 0, 5.8): b.face([(x - 1.8, 3.0, 50.06), (x + 1.8, 3.0, 50.06), (x + 1.8, 12.0, 50.06), (x - 1.8, 12.0, 50.06)], bronze if x else lit)
    # tower: plinth, columned stage, stepped pyramid
    b.box(-17, 17, 27.0, 31.0, 5, 39, ash, top=roof)
    b.box(-13.5, 13.5, 31.0, 43.0, 8.5, 35.5, F(tw_s, rep=1), top=roof)
    for k in range(4):
        s = b.sub()
        for x in s.d((-9.5, -3.2, 3.2, 9.5), ()): s.cyl(x, 14.6, 0.95, 31.0, 41.0, 8, gr, cap=False)
        s.box(-14.6, 14.6, 41.0, 43.2, 13.2, 15.6, gr, bot=True)
        for x in (-13.6, 13.6): s.bx(x, 14.4, 2.4, 2.4, 31.0, 10.0, gr)
        b.add(s, t=(0, 0, 22), ry=90 * k)
    b.box(-15.6, 15.6, 43.2, 44.6, 6.4, 37.6, gr2, bot=True)
    n = b.d(12, 3); y = 44.6
    for k in range(n):
        h = (61.0 - 44.6) / n; r = 13.2 - (13.2 - 3.6) * k / (n - 1)
        b.box(-r, r, y, y + h, 22 - r, 22 + r, gr if k % 2 == 0 else gr2, notop=False); y += h
    b.box(-2.6, 2.6, 61.0, 63.4, 19.4, 24.6, b.glow(WARM, 0.7, G)); b.frust((-3.0, 3.0, 19.0, 25.0), (0, 0, 22, 22), 63.4, 65.5, gr2)
    if b.hi:
        for (x, z) in ((-3.0, 19.0), (3.0, 19.0), (3.0, 25.0), (-3.0, 25.0)): b.bx(x * 0.9, 22 + (z - 22) * 0.9, 0.7, 0.7, 61.0, 2.4, gr)


# ------------------------------------------------------------------ Kabuki-za
@model('kabukiza', tier='A', face='southwest', stone=0xd8d4c8,
       close=((-34, 9, 92), (0, 15, 30), 30), dusk=2,
       desc="Kabuki-za: white Momoyama-revival theatre front on +Z: the great karahafu entrance gable with gold fittings and purple curtain, the big front-facing irimoya roof over the centre, gabled end pavilions with their own karahafu doors, tiled eaves, vermilion balustrades, rows of red lanterns and the drum-tower box; the plain pale 145 m office tower with vertical fins rising behind")
def kabukiza(b):
    W = 0xdcd8cc; wh = b.cf(W, 0.3); wh2 = b.cf(mul(W, 0.9), 0.22); verm = b.cf(0xb03a28, 0.3); gold = b.c(0xc8a850, 0.45, 0.7, emit=(0.3, 0.24, 0.1)); ridge = b.c(0x3a3e42); under = b.cf(0xcfcbbf, 0.2)
    purple = b.cf(0x5a2a6a, 0.3); dk = b.c(0x2a2622); roofc = b.c(0x55585a); wood = b.c(0x3a2a22); glow = b.glow(WARM, 0.9, 0x6a5238); twc = b.c(0xcfcdc6)
    kw = b.band('kawara', 64, p_kawara(0x4a4f54, 10, 3), bay=5.0)
    def wall(c):
        c.rect(0, 0, 1, 1, W); c.noise(0.04, 5); c.litp = 0.6
        for i in range(4):
            for j in range(2):
                x0 = i / 4 + 0.05; y0 = j / 2 + 0.1
                c.window(x0, y0, x0 + 0.15, y0 + 0.3, 0x4a4238, 0x7a2a1c, mull=(4, 3), sill=False)
        c.rect(0, 0.47, 1, 0.5, 0x9a3626); c.rect(0, 0.96, 1, 1, 0x9a3626); c.rect(0, 0, 1, 0.05, 0x8c887c); c.flood(0.28)
    wl = b.band('wall', 64, wall, bay=14.0)
    def door(c):
        c.rect(0, 0, 1, 1, W); c.rect(0, 0, 1, 0.06, 0x8c887c)
        for i in range(4):
            c.rect(i / 4 + 0.03, 0.06, i / 4 + 0.22, 0.8, 0x7a2a1c); c.rect(i / 4 + 0.045, 0.08, i / 4 + 0.205, 0.76, 0x3a3028, e=(0.9, 0.66, 0.32))
            c.rect(i / 4 + 0.12, 0.08, i / 4 + 0.13, 0.76, 0x7a2a1c)
        c.rect(0, 0.86, 1, 1, 0x9a3626); c.flood(0.3)
    dr = b.band('door', 48, door, bay=14.0)
    twf = b.band('tower', 96, p_grid(0xd2d0c8, 8, 4, glass=0x3e4a56, wx=(0.18, 0.82), wy=(0.12, 0.8), lit=0.5, pil=0xdddbd4, mull=(1, 1)), bay=14.0)
    twt = b.band('ttop', 32, p_grid(0xcac8c0, 8, 1, glass=0x54585c, wx=(0.1, 0.9), wy=(0.1, 0.9), lit=0.0, pil=0xdddbd4, mull=(1, 3)), bay=14.0)
    ZF = 28.0
    # ---- theatre body + rear podium + tower
    b.box(-39, 39, 0, 18.0, -2, ZF - 2, wl, f=None, top=roofc)
    b.box(-39, 39, 0, 23.0, -62, -2, F(wl, bay=14.0), top=roofc)
    b.stack(B.rect(-27, 27, -58, -14), 23.0, [(14.5, twf)] * 8 + [(6.0, twt)], top=roofc)
    b.box(-20, 20, 145.0, 149.0, -52, -20, twc, top=roofc)
    for (x, z) in ((-26, -57), (26, -57), (26, -15), (-26, -15)): avlight(b, x, 145.0, z, 0.9)
    if b.hi:
        for sz, z in ((1, -14), (-1, -58)): pilasters(b, (-27, z) if sz > 0 else (27, z), (27, z) if sz > 0 else (-27, z), 23.0, 145.0, 5, 1.0, 0.7, twc)
    # ---- front wall in three planes: centre, links, end pavilions
    def front(x0, x1, z, h):
        b.wall((x0, z), (x1, z), 0, 6.0, F(dr, bay=(x1 - x0) / max(1, round((x1 - x0) / 14.0)))); b.wall((x0, z), (x1, z), 6.0, h, wl)
    front(-17, 17, ZF, 19.0); b.box(-17, 17, 0, 19.0, ZF - 2, ZF, wh, f=None, top=roofc)
    for sx in (-1, 1):
        x0, x1 = (17, 22) if sx > 0 else (-22, -17); front(x0, x1, ZF - 2, 18.0)
        x0, x1 = (22, 39) if sx > 0 else (-39, -22)
        front(x0, x1, ZF + 1.5, 20.0); b.box(x0, x1, 0, 20.0, ZF - 2, ZF + 1.5, wh, f=None, top=roofc)
        xc = (x0 + x1) / 2
        jroof(b, xc, ZF - 9, 21, 26, 20.0, 7.0, kw, ridge, style='irimoya', axis='z', under=under, gable=wh, up=1.0, orn=gold)
        karahafu(b, xc, ZF + 1.5, ZF + 5.0, 11.0, 6.4, 2.6, kw, wh, gold, th=0.4, under=under)
        for x in (xc - 5, xc + 5): b.bx(x, ZF + 4.6, 0.5, 0.5, 0, 6.5, wood)
        b.face([(xc - 4.6, 4.2, ZF + 4.7), (xc + 4.6, 4.2, ZF + 4.7), (xc + 4.6, 6.2, ZF + 4.7), (xc - 4.6, 6.2, ZF + 4.7)], purple, two=True)
        # link: straight tiled eaves at two levels
        xl0, xl1 = (17, 22) if sx > 0 else (-22, -17)
        for y in (6.6, 13.2): b.face([(xl0, y, ZF + 1.2), (xl1, y, ZF + 1.2), (xl1, y + 1.4, ZF - 2), (xl0, y + 1.4, ZF - 2)], kw); b.face([(xl1, y - 0.2, ZF + 1.2), (xl0, y - 0.2, ZF + 1.2), (xl0, y + 1.2, ZF - 2), (xl1, y + 1.2, ZF - 2)], under)
        if b.hi:   # vermilion balustrades at the upper windows of the pavilion
            for y in (9.2, 15.0):
                b.box(x0 + 0.8, x1 - 0.8, y, y + 0.25, ZF + 1.5, ZF + 2.4, wood, bot=True)
                b.beam((x0 + 0.8, y + 1.1, ZF + 2.35), (x1 - 0.8, y + 1.1, ZF + 2.35), 0.14, 0.14, verm); b.beam((x0 + 0.8, y + 0.65, ZF + 2.35), (x1 - 0.8, y + 0.65, ZF + 2.35), 0.1, 0.1, verm)
            for i in range(5): lantern(b, x0 + 2.5 + i * 3.0, 4.9, ZF + 5.3, 0.38, 0.85)
    # ---- centre: long tiled eaves, the big front-facing irimoya roof, the great karahafu
    for y, ov in ((13.4, 2.6),):
        b.face([(-17, y, ZF + ov), (17, y, ZF + ov), (17, y + 1.5, ZF - 0.1), (-17, y + 1.5, ZF - 0.1)], kw); b.face([(17, y - 0.25, ZF + ov), (-17, y - 0.25, ZF + ov), (-17, y + 1.2, ZF), (17, y + 1.2, ZF)], under)
        b.face([(-17, y - 0.25, ZF + ov), (17, y - 0.25, ZF + ov), (17, y, ZF + ov), (-17, y, ZF + ov)], gold)
    jroof(b, 0, ZF - 12, 38, 32, 19.0, 11.0, kw, ridge, style='irimoya', axis='z', under=under, gable=wh, up=1.6, hipf=0.38, orn=gold)
    karahafu(b, 0, ZF, ZF + 7.0, 24.0, 7.2, 5.2, kw, wh, gold, th=0.6, under=under)
    for x in (-11, -4.2, 4.2, 11): b.bx(x, ZF + 6.4, 0.7, 0.7, 0, 7.6, wood)
    b.face([(-10.6, 4.6, ZF + 6.5), (10.6, 4.6, ZF + 6.5), (10.6, 7.2, ZF + 6.5), (-10.6, 7.2, ZF + 6.5)], purple, two=True)
    b.face([(-10.6, 4.6, ZF + 6.56), (10.6, 4.6, ZF + 6.56), (10.6, 5.0, ZF + 6.56), (-10.6, 5.0, ZF + 6.56)], wh)
    b.face([(-9, 0.05, ZF + 6.2), (9, 0.05, ZF + 6.2), (9, 0.05, ZF + 0.1), (-9, 0.05, ZF + 0.1)], b.c(0x8a2a22))
    # gold crest disc in the tympanum + gable ornament (gegyo)
    b.face([(-1.3, 9.0, ZF + 6.98), (1.3, 9.0, ZF + 6.98), (1.3, 11.4, ZF + 6.98), (-1.3, 11.4, ZF + 6.98)], gold)
    # drum tower (yagura) box with its draped curtain over the entrance
    b.box(-2.4, 2.4, 14.9, 17.6, ZF + 0.2, ZF + 3.0, purple, top=wood); b.box(-2.7, 2.7, 17.6, 17.9, ZF - 0.1, ZF + 3.3, wood, bot=True)
    if b.hi:
        b.face([(-2.4, 16.9, ZF + 3.04), (2.4, 16.9, ZF + 3.04), (2.4, 17.3, ZF + 3.04), (-2.4, 17.3, ZF + 3.04)], wh)
        for x in (-2.3, 2.3): b.bx(x, ZF + 2.9, 0.2, 0.2, 14.9, 4.6, wood)
        for i in range(9): lantern(b, -9.6 + i * 2.4, 12.2, ZF + 2.5, 0.42, 0.95)
        for i in range(6): lantern(b, -8.5 + i * 3.4, 5.6, ZF + 7.2, 0.4, 0.9, col=WARM)
        b.box(-17, 17, 8.4, 8.6, ZF, ZF + 0.9, wood, bot=True)
        for sx in (-1, 1):
            for k in range(4): b.bx(sx * (12.6 + k * 1.4), ZF + 0.85, 0.12, 0.12, 8.6, 0.9, verm)
            for i in range(3): lantern(b, sx * (13.2 + i * 1.6), 12.2, ZF + 2.5, 0.42, 0.95)
            b.cyl(sx * 14.5, ZF + 9, 0.5, 0, 1.4, 8, b.c(0x8c887c)); stone_lantern(b, sx * 20, ZF + 7, 2.4)
        for sx in (-1, 1): b.beam((sx * 17, 9.5, ZF + 0.85), (sx * 12.2, 9.5, ZF + 0.85), 0.14, 0.14, verm)


run()
