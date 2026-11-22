# icons_build_b2.py - Tokyo tier B: Ginza Place, Ministry of Justice red-brick building, Bank of Japan, Nihonbashi Mitsukoshi, Takanawa Gateway Station.
# blender -b -P icons_build_b2.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


def lion(b, x, y, z, ry, col, k=1.0):
    s = b.sub()
    s.lathe(0, 0, s.d([(0.0, 0), (0.75, 0.1), (0.8, 0.9), (0.55, 1.7), (0.35, 2.0)], [(0.0, 0), (0.8, 0.5), (0.35, 2.0)]), s.d(8, 4), col, sq=1.3)
    s.lathe(0, 0.5, [(0.0, 1.6), (0.55, 1.9), (0.6, 2.4), (0.3, 2.8), (0.0, 2.85)], s.d(8, 4), col)
    if s.hi:
        s.bx(0, 1.05, 0.5, 0.4, 1.9, 0.4, col)
        for dx in (-0.4, 0.4): s.bx(dx, 0.85, 0.28, 0.5, 0, 1.3, col)
    b.add(s, t=(x, y, z), ry=ry, sc=(k, k, k))


# ------------------------------------------------------------------ Ginza Place
@model('ginza_place', tier='B', face='southeast', stone=0xe4e4e0,
       desc="Ginza Place: 56 m corner block wrapped in a white openwork lattice of flaring panel bands with diagonal ribs, lit glazed shopfronts, two recessed glazed terrace slots with railings, rounded corners, open crown")
def ginza_place(b):
    WH = 0xe6e6e2; wh = b.cf(WH, 0.3, tint=0xf4f6ff); wh2 = b.cf(mul(WH, 0.9), 0.24, tint=0xf4f6ff); dk = b.c(0x34383c); roof = b.c(0x7a7e80); rail = b.c(0xc8cccc, 0.4, 0.5)
    def lat(c):
        c.rect(0, 0, 1, 1, WH); c.noise(0.03, 4)
        for j in range(3):
            for i in range(8):
                cx = (i + (0.5 if j % 2 else 0.0) + 0.5) / 8; cy = (j + 0.5) / 3; lit = c.rng.rand() < 0.5
                c.poly([(cx - 0.045, cy), (cx, cy - 0.13), (cx + 0.045, cy), (cx, cy + 0.13)], 0x3a444e, 0.2, e=tuple(rgbf(0xffe2b8) * (0.4 + 0.5 * c.rng.rand())) if lit else None)
        c.rect(0, 0.0, 1, 0.03, mul(WH, 0.8)); c.flood(0.26, 0xf4f6ff)
    lt = b.band('lattice', 96, lat, bay=10.0)
    shop = b.band('shop', 64, p_curtain(0x566a78, 4, 2, 0x3a3e42, 2.0, 0.15, lit=1.0, k=1.0), bay=8.0)
    slot = b.band('slot', 32, p_curtain(0x566a78, 8, 1, 0x4a4e52, 1.4, 0.1, lit=0.9, k=0.9), bay=10.0)
    HX, HZ, RC = 13.0, 14.0, 3.0; ns = b.d(3, 1)
    def ring(k, y, ins=0.0):
        pts = []
        for (cx, cz, a0) in ((HX - RC, HZ - RC, 0), (HX - RC, -HZ + RC, 90), (-HX + RC, -HZ + RC, 180), (-HX + RC, HZ - RC, 270)):
            for i in range(ns + 1):
                a = math.radians(a0 + 90 * i / ns); pts.append(((cx + (RC - ins) * math.sin(a)) * k, y, (cz + (RC - ins) * math.cos(a)) * k))
        return pts[::-1]
    def band(y0, y1, n, skin=lt):
        h = (y1 - y0) / n
        for i in range(n if b.hi else 1):
            ya, yb = (y0 + i * h, y0 + (i + 1) * h) if b.hi else (y0, y1)
            b.loft([ring(1.0, ya), ring(1.035, yb)], F(skin, bay=10.0)); b.face(ring(1.035, yb)[::-1], wh2) if b.hi else None
            if b.hi:   # diagonal ribs on each flat side
                for (p0, p1, m) in (((-HX + RC, HZ), (HX - RC, HZ), 5), ((HX, HZ - RC), (HX, -HZ + RC), 5), ((HX - RC, -HZ), (-HX + RC, -HZ), 3), ((-HX, -HZ + RC), (-HX, HZ - RC), 3)):
                    ox, oz = (p1[1] - p0[1]), -(p1[0] - p0[0]); L = math.hypot(ox, oz); ox, oz = -ox / L * 0.2, -oz / L * 0.2
                    for j in range(m):
                        t0, t1 = j / m, (j + 1) / m; up = (j + i) % 2 == 0
                        A = (p0[0] + (p1[0] - p0[0]) * t0 + ox, ya if up else yb, p0[1] + (p1[1] - p0[1]) * t0 + oz); Bq = (p0[0] + (p1[0] - p0[0]) * t1 + ox, yb if up else ya, p0[1] + (p1[1] - p0[1]) * t1 + oz)
                        kk = 1.0 if up else 1.035; kk2 = 1.035 if up else 1.0
                        b.beam((A[0] * kk, A[1], A[2] * kk), (Bq[0] * kk2, Bq[1], Bq[2] * kk2), 0.28, 0.22, wh)
    b.loft([ring(1.0, 0, 0.8), ring(1.0, 7.5, 0.8)], F(shop, bay=8.0))
    b.face(ring(1.02, 7.5)[::-1], wh2)
    band(7.5, 24.0, 4)
    b.face(ring(1.0, 24.0), wh2); b.loft([ring(1.0, 24.0, 1.8), ring(1.0, 28.0, 1.8)], F(slot, bay=10.0)); b.face(ring(1.02, 28.0)[::-1], wh2)
    band(28.0, 44.5, 4)
    b.face(ring(1.0, 44.5), wh2); b.loft([ring(1.0, 44.5, 1.8), ring(1.0, 48.5, 1.8)], F(slot, bay=10.0)); b.face(ring(1.02, 48.5)[::-1], wh2)
    band(48.5, 56.0, 2)
    b.face(ring(1.0, 54.2, 0.6), roof); b.box(-7, 7, 54.2, 57.0, -8, 8, wh2, top=roof)
    if b.hi:
        for y in (24.0, 44.5):
            r = ring(1.0, y + 1.1, 0.15)
            for i in range(len(r)): b.beam(r[i], r[(i + 1) % len(r)], 0.08, 0.08, rail)
        b.box(-4, 4, 3.4, 3.8, HZ - 0.6, HZ + 1.6, wh2, bot=True); b.box(HX - 0.6, HX + 1.6, 3.4, 3.8, -4, 4, wh2, bot=True)
    for (x, z) in ((-6.5, -7.5), (6.5, 7.5)): avlight(b, x, 57.0, z, 0.5)


# ------------------------------------------------------------------ Ministry of Justice (red-brick building)
@model('ministry_of_justice_red_brick', tier='B', face='west', stone=0x93402f,
       desc="Ministry of Justice red-brick building: 1895 German neo-Baroque, three storeys of red brick banded in white stone, centre pavilion with a three-arch porch and balcony under a steep slate mansard, long wings with pilasters and dormers, end pavilions with mansards and spirelets, chimneys")
def ministry_of_justice(b):
    BR = 0x93402f; WH = 0xd9d3c3; SL = 0x3c4046; MO = 0xb09a88
    wh = b.cf(WH, 0.2); slc = b.c(SL); cu = b.c(0x566a5e, 0.6, 0.3); brc = b.cf(BR, 0.16); dark = b.c(0x2a2c30); lit = b.glow(WARM, 0.85, 0x5a4a38)
    g_s = b.band('ground', 64, fl(p_grid(BR, 4, 1, wx=(0.24, 0.76), wy=(0.2, 0.86), arch=True, brick=(18, 30, MO), surround=WH, stripes=[(0.34, 0.39), (0.62, 0.67)], top=(0.08, WH), bot=(0.12, 0xa29c90), lit=0.5, mull=(2, 3)), 0.22), bay=14.0)
    u_s = b.band('upper', 128, fl(p_grid(BR, 4, 2, wx=(0.27, 0.73), wy=(0.14, 0.86), brick=(34, 30, MO), surround=WH, stripes=[(0.03, 0.055), (0.24, 0.265), (0.47, 0.53), (0.74, 0.765)], top=(0.06, WH), lit=0.45, mull=(2, 3)), 0.2), bay=14.0)
    a_s = b.band('attic', 32, fl(p_grid(BR, 4, 1, wx=(0.32, 0.68), wy=(0.22, 0.78), arch=True, brick=(9, 30, MO), surround=WH, top=(0.16, WH), lit=0.4), 0.18), bay=14.0)
    def slate(c): c.rect(0, 0, 1, 1, SL); c.noise(0.12, 8); c.joints(8, 16, 0.8, 1.0); c.rect(0, 0.94, 1, 1, 0x566a5e, 0.7)
    sl_s = b.band('slate', 32, slate, bay=8.0)
    def mansard(x0, x1, z0, z1, y0, y1, ins):
        b.box(x0 - 0.5, x1 + 0.5, y0, y0 + 0.8, z0 - 0.5, z1 + 0.5, wh, bot=True)
        b.frust((x0 - 0.2, x1 + 0.2, z0 - 0.2, z1 + 0.2), (x0 + ins, x1 - ins, z0 + ins, z1 - ins), y0 + 0.8, y1, sl_s, top=slc)
        if b.hi: b.box(x0 + ins, x1 - ins, y1, y1 + 0.45, z0 + ins, z1 - ins, cu)
    def dormer(x, z, y, sz=1):
        s = b.sub(); s.box(-1.1, 1.1, 0, 2.2, -2.4, 0, wh, notop=True, bk=None); s.gable(-1.3, 1.3, -2.4, 0.15, 2.2, 1.0, slc, wh, axis='z')
        s.face([(-0.65, 0.4, 0.04), (0.65, 0.4, 0.04), (0.65, 2.0, 0.04), (-0.65, 2.0, 0.04)], lit if (int(x * 3) % 3) else dark); b.add(s, t=(x, y, z), ry=0 if sz > 0 else 180)
    b.stack(B.rect(-50, 50, -11, 11), 0, [(6.0, g_s), (10.5, u_s)], top=slc); mansard(-50, 50, -11, 11, 16.5, 21.5, 4.5)
    b.stack(B.rect(-13, 13, -13, 15), 0, [(6.0, g_s), (10.5, u_s), (3.5, a_s)], top=slc); mansard(-13, 13, -13, 15, 20.0, 28.5, 6.0)
    b.arcade((-9, 18.5), (9, 18.5), 0, 3.4, 6.0, 3, wh, depth=3.3, back=dark, pier=0.28, aseg=6)
    b.box(-9, 9, 6.0, 6.5, 15, 18.9, wh, bot=True); b.wall((-9, 15), (-9, 18.5), 0, 6.0, wh); b.wall((9, 18.5), (9, 15), 0, 6.0, wh)
    for i in range(3): b.face([(-5.0 + i * 6 - 1.6, 0.1, 15.3), (-5.0 + i * 6 - 1.6 + 3.2, 0.1, 15.3), (-5.0 + i * 6 + 1.6, 4.6, 15.3), (-5.0 + i * 6 - 1.6, 4.6, 15.3)], lit)
    if b.hi:
        for i in range(4): b.cyl(-8.4 + i * 5.6, 18.3, 0.3, 6.5, 12.5, 8, wh, cap=False)
        b.box(-9, 9, 12.5, 13.3, 15, 18.9, wh, bot=True)
        for i in range(9): b.bx(-8.6 + i * 2.15, 18.6, 0.3, 0.3, 6.5, 1.0, wh)
        b.box(-9, 9, 7.5, 7.7, 18.4, 18.8, wh)
        pilasters(b, (-48, 11), (-15, 11), 6.0, 16.5, 9, 0.8, 0.3, wh); pilasters(b, (15, 11), (48, 11), 6.0, 16.5, 9, 0.8, 0.3, wh)
        pilasters(b, (48, -11), (15, -11), 6.0, 16.5, 9, 0.8, 0.3, wh); pilasters(b, (-15, -11), (-48, -11), 6.0, 16.5, 9, 0.8, 0.3, wh)
        for sx in (-1, 1):
            for i in range(8): dormer(sx * (17 + i * 4.1), 10.2, 17.6)
            for i in range(4): dormer(sx * (19 + i * 8.2), -10.2, 17.6, -1)
            for i in range(3): b.bx(sx * (22 + i * 11), 0, 1.6, 2.6, 21.5, 3.2, brc, top=dark); b.bx(sx * (22 + i * 11), 0, 2.0, 3.0, 24.3, 0.4, wh)
        for x in (-7, 7): dormer(x, 13.2, 22.0)
        b.tube((0, 28.9, 1), (0, 33.5, 1), 0.2, cu, seg=4, r1=0.03)
    for sx in (-1, 1):
        x0, x1 = (49, 65) if sx > 0 else (-65, -49)
        b.stack(B.rect(x0, x1, -20, 16), 0, [(6.0, g_s), (10.5, u_s), (3.5, a_s)], top=slc); mansard(x0, x1, -20, 16, 20.0, 27.0, 5.0)
        for (x, z) in ((x0, 16), (x1, 16), (x0, -20), (x1, -20)):
            b.tube((x, 0, z), (x, 21.5, z), 0.9, wh, seg=b.d(6, 4)); b.lathe(x, z, [(1.1, 21.5), (1.0, 22.5), (0.0, 26.0)], b.d(6, 4), cu)
        if b.hi:
            pilasters(b, (x0 + 1.5, 16), (x1 - 1.5, 16), 6.0, 20.0, 4, 0.9, 0.3, wh); dormer((x0 + x1) / 2, 14.6, 21.4)


# ------------------------------------------------------------------ Bank of Japan (old building)
@model('bank_of_japan', tier='B', face='south', stone=0xb4ae9c,
       desc="Bank of Japan old building: Tatsuno's 1896 neo-Baroque stone block, rusticated granite base and columned upper storeys round a forecourt closed by an arcaded screen with the gate, the centre block with a paired-column portico under the green copper dome and lantern, small corner domes on the wings, hipped copper roofs")
def bank_of_japan(b):
    G = 0xb6b09e; gr = b.cf(G, 0.24); gr2 = b.cf(mul(G, 0.87), 0.2); cop = b.c(0x6f9a86, 0.6, 0.3); cop2 = b.c(0x5a8270, 0.6, 0.3); dark = b.c(0x2a2c30); roofc = b.c(0x5a7468, 0.6, 0.3); pav = b.c(0x9a968a); lit = b.glow(WARM, 0.85, 0x5a4a38)
    base = b.band('base', 64, fl(p_grid(mul(G, 0.9), 4, 1, wx=(0.26, 0.74), wy=(0.18, 0.84), arch=True, rows=7, cols=4, lit=0.4, top=(0.09, G)), 0.24), bay=13.0)
    upp = b.band('upper', 96, fl(p_grid(G, 4, 2, wx=(0.28, 0.72), wy=(0.12, 0.84), rows=14, cols=6, lit=0.45, mull=(2, 3), pil=mul(G, 1.06), top=(0.08, mul(G, 1.06))), 0.22), bay=13.0)
    ash = b.band('ash', 32, fl(p_ashlar(G, 4, 6), 0.22), bay=8.0)
    LV = [(6.0, base), (9.5, upp), (2.0, ash)]
    def blk(x0, x1, z0, z1, lv=LV, hr=3.2, ins=5.0):
        y = b.stack(B.rect(x0, x1, z0, z1), 0, lv, top=roofc)
        b.box(x0 - 0.5, x1 + 0.5, y - 0.9, y, z0 - 0.5, z1 + 0.5, gr, bot=True)
        b.frust((x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3), (x0 + ins, x1 - ins, z0 + ins, z1 - ins), y, y + hr, roofc, top=cop2); return y
    b.cap(B.rect(-28, 28, -22, 26), 0.06, pav)
    blk(-42, 42, -46, -22); blk(-42, -28, -22, 28); blk(28, 42, -22, 28)
    y = b.stack(B.rect(-13, 13, -22, 2), 0, LV + [(2.5, ash)], top=roofc)
    # portico of paired columns
    b.box(-13, 13, 0, 6.0, 2, 6.5, base, top=gr2)
    for i in range(4):
        for dx in (-0.8, 0.8):
            x = -9.6 + i * 6.4 + dx; b.cyl(x, 5.6, 0.48, 6.0, 14.6, b.d(8, 5), gr, cap=False)
            if b.hi: b.bx(x, 5.6, 1.2, 1.2, 6.0, 0.5, gr2); b.bx(x, 5.6, 1.3, 1.3, 14.1, 0.5, gr2)
    b.box(-13.4, 13.4, 14.6, 17.0, 2, 6.9, gr, bot=True); b.box(-13.8, 13.8, 17.0, 17.7, 2, 7.3, gr2, bot=True)
    if b.hi:
        for i in range(11): b.bx(-12.5 + i * 2.5, 6.9, 0.4, 0.4, 17.7, 0.9, gr2)
        b.box(-13, 13, 18.5, 18.75, 6.6, 7.2, gr2)
        for x in (-6.4, 0, 6.4): b.face([(x - 1.3, 6.2, 2.06), (x + 1.3, 6.2, 2.06), (x + 1.3, 12.5, 2.06), (x - 1.3, 12.5, 2.06)], lit)
    # dome on an octagonal drum
    cz = -10.0
    b.lathe(0, cz, [(9.6, y), (9.6, y + 0.8), (8.6, y + 0.8), (8.6, y + 4.4), (9.1, y + 4.6), (9.1, y + 5.2), (8.4, y + 5.2)], 8, gr, smooth=False, a0=22.5, a1=382.5)
    if b.hi:
        for k in range(8):
            a = math.radians(45 * k); q = lambda dx, yy, r=8.68: (r * math.sin(a) + dx * math.cos(a), yy, cz + r * math.cos(a) - dx * math.sin(a))
            b.face([q(-1.1, y + 1.4), q(1.1, y + 1.4), q(1.1, y + 3.8), q(-1.1, y + 3.8)], lit if k % 2 == 0 else dark)
    dome(b, 0, cz, 8.4, y + 5.2, 6.4, b.d(16, 8), cop, rib=cop2)
    b.lathe(0, cz, b.d([(1.6, y + 11.4), (1.6, y + 13.0), (1.9, y + 13.2), (1.0, y + 14.4), (0.2, y + 14.8), (0.0, y + 16.4)], [(1.6, y + 11.4), (1.7, y + 13.2), (0.0, y + 16.4)]), b.d(8, 4), cop2)
    for sx in (-1, 1):
        # small corner domes on the wing fronts
        xt, zt = sx * 35.0, 23.0
        b.lathe(xt, zt, [(4.4, 17.5), (4.4, 19.6), (4.8, 19.8), (4.8, 20.3), (4.2, 20.3)], 8, gr, smooth=False)
        dome(b, xt, zt, 4.2, 20.3, 3.4, b.d(12, 6), cop); b.lathe(xt, zt, [(0.5, 23.6), (0.6, 24.4), (0.0, 25.4)], b.d(6, 4), cop2)
        # screen wall with arcade, the gate in the middle
        x0, x1 = (4.5, 28) if sx > 0 else (-28, -4.5)
        b.arcade((x0, 32), (x1, 32), 0, 3.6, 7.6, 5, gr, depth=1.4, back=dark, pier=0.36, aseg=b.d(6, 2))
        b.box(x0, x1, 0, 7.6, 26.5, 30.6, gr2, top=roofc, f=None); b.box(x0, x1, 7.6, 8.3, 26.2, 32.4, gr, bot=True)
        if b.hi:
            pilasters(b, (sx * 28, 26) if sx < 0 else (sx * 28, -22), (sx * 28, -22) if sx < 0 else (sx * 28, 26), 6.0, 15.5, 8, 0.9, 0.35, gr)
            pilasters(b, (sx * 42, -44) if sx < 0 else (sx * 42, 26), (sx * 42, 26) if sx < 0 else (sx * 42, -44), 6.0, 15.5, 12, 0.9, 0.35, gr)
            pilasters(b, (x0 if sx > 0 else -41, 28), (41 if sx > 0 else x1, 28), 6.0, 15.5, 3, 0.9, 0.35, gr) if False else None
            for i in range(8): b.bx(x0 + 1.2 + i * (x1 - x0 - 2.4) / 7, 32.1, 0.35, 0.35, 8.3, 0.9, gr2)
        b.box(sx * 4.5 - 1.6, sx * 4.5 + 1.6, 0, 10.2, 27, 33, gr, top=gr2); b.bx(sx * 4.5, 30, 3.8, 6.6, 10.2, 0.6, gr2)
        if b.hi: b.lathe(sx * 4.5, 30, [(0, 10.8), (0.5, 11.2), (0.5, 11.8), (0, 12.3)], 6, b.glow(WARM, 0.95, 0xe8dcc0))
    b.box(-3, 3, 7.4, 9.4, 28.5, 31.5, gr, bot=True)
    if b.hi: pilasters(b, (-40, -46) if False else (40, -46), (-40, -46), 6.0, 15.5, 14, 0.9, 0.35, gr)


# ------------------------------------------------------------------ Nihonbashi Mitsukoshi
@model('mitsukoshi_nihonbashi', tier='B', face='west', stone=0xc8bfa8,
       desc="Nihonbashi Mitsukoshi main store: seven-storey Renaissance-revival stone block, arcaded granite base with lit show windows, giant pilasters over four floors, heavy cornice and attic, the two-storey arched main entrance with its bronze canopy and the two lions, the stepped central tower and flagpole, roof pavilions")
def mitsukoshi_nihonbashi(b):
    G = 0xc9c0aa; gr = b.cf(G, 0.24); gr2 = b.cf(mul(G, 0.87), 0.2); base_c = b.cf(0x9a9488, 0.2); roof = b.c(0x74726c); bronze = b.c(0x4a4034, 0.5, 0.5); dark = b.c(0x2a2c30); lit = b.glow(WARM, 0.9, 0x5a4a38); green = b.c(0x55745e)
    rng = np.random.RandomState(12)
    shows = win_decals(b, 's', 32, 40, 0x4a4238, 0x4a4034, arch=True, mull=(3, 2), nlit=2, ndark=0, wall=0x9a9488)
    bs = b.band('base', 64, fl(p_grid(0x9a9488, 4, 1, wx=(0.2, 0.8), wy=(0.1, 0.88), arch=True, rows=7, cols=4, lit=0.95, glass=0x4a4238, top=(0.08, G)), 0.24), bay=20.0)
    up = b.band('upper', 128, fl(p_grid(G, 4, 4, wx=(0.24, 0.76), wy=(0.16, 0.82), rows=24, cols=6, lit=0.6, mull=(2, 2)), 0.22), bay=16.0)
    at = b.band('attic', 48, fl(p_grid(G, 4, 2, wx=(0.26, 0.74), wy=(0.18, 0.8), lit=0.5, top=(0.1, mul(G, 1.06))), 0.2), bay=16.0)
    ash = b.band('ash', 32, fl(p_ashlar(G, 4, 6), 0.22), bay=8.0)
    X, Z = 36.0, 48.0
    sides = [((-X, Z), (X, Z), 6), ((X, Z), (X, -Z), 8), ((X, -Z), (-X, -Z), 6), ((-X, -Z), (-X, Z), 8)]
    for k, (p0, p1, n) in enumerate(sides):
        winwall(b, p0, p1, 0, 9.0, n, base_c, shows, rng, F(bs, rep=max(1, n // 4)), sill=0.08, head=0.14, pier=0.34, depth=0.7, arch=True, plit=1.0, nlit=2)
        b.wall(p0, p1, 9.0, 26.5, up); b.wall(p0, p1, 27.7, 33.0, at)
        if b.hi: pilasters(b, p0, p1, 9.6, 26.5, n * 2 + 1, 1.0, 0.45, gr)
    plan = B.rect(-X, X, -Z, Z)
    cornice(b, plan, 9.0, 0.5, 0.6, gr); b.box(-X - 1.0, X + 1.0, 26.5, 27.7, -Z - 1.0, Z + 1.0, gr, bot=True, notop=True); cornice(b, plan, 32.4, 0.6, 0.8, gr)
    b.cap(plan, 33.0, roof)
    # main entrance on +Z: tall arch, bronze canopy, lions
    b.box(-6.5, 6.5, 0, 13.5, Z, Z + 1.6, gr, top=gr2)
    b.arcade((-5, Z + 1.6), (5, Z + 1.6), 0, 6.5, 12.6, 1, gr, depth=1.2, back=lit, pier=0.3, aseg=b.d(8, 3)) if False else b.face([(-3.4, 0, Z + 1.66), (3.4, 0, Z + 1.66), (3.4, 9.6, Z + 1.66), (-3.4, 9.6, Z + 1.66)], shows[0])
    b.box(-5.5, 5.5, 4.6, 5.1, Z + 1.6, Z + 5.0, bronze, bot=True); b.face([(-5.2, 4.58, Z + 4.8), (5.2, 4.58, Z + 4.8), (5.2, 4.58, Z + 1.7), (-5.2, 4.58, Z + 1.7)][::-1], lit)
    for sx in (-1, 1):
        b.bx(sx * 6.0, Z + 4.2, 2.0, 3.4, 0, 1.6, base_c); lion(b, sx * 6.0, 1.6, Z + 4.0, 0, bronze, 0.75)
        if b.hi: b.cyl(sx * 5.2, Z + 4.8, 0.14, 0, 4.6, 6, bronze, cap=False)
    b.box(-7.5, 7.5, 13.5, 14.3, Z, Z + 2.2, gr2, bot=True)
    # tower and roof pavilions
    b.box(-8, 8, 33.0, 42.0, -6, 10, F(at, rep=1), top=roof); b.box(-8.6, 8.6, 42.0, 43.0, -6.6, 10.6, gr, bot=True)
    b.box(-5.5, 5.5, 43.0, 50.0, -3.5, 7.5, ash, top=roof); b.box(-6.0, 6.0, 50.0, 50.8, -4.0, 8.0, gr, bot=True)
    b.frust((-5.0, 5.0, -3.0, 7.0), (-1.2, 1.2, 0.8, 3.2), 50.8, 55.0, green, top=gr2)
    b.tube((0, 55.0, 2), (0, 62.0, 2), 0.16, bronze, seg=4, r1=0.05); avlight(b, 0, 61.8, 2, 0.4)
    if b.hi:
        for k in range(4):
            s = b.sub()
            for x in (-4.6, 4.6): s.bx(x, 5.0, 1.0, 1.0, 43.0, 7.0, gr)
            s.face([(-2.2, 44.5, 5.56), (2.2, 44.5, 5.56), (2.2, 48.5, 5.56), (-2.2, 48.5, 5.56)], lit if k % 2 == 0 else dark); b.add(s, t=(0, 0, 2), ry=90 * k)
        for (x0, x1, z0, z1, h) in ((-30, -14, -40, -24, 4.5), (14, 30, -40, -26, 5.5), (-28, -16, 20, 40, 3.5), (16, 30, 24, 40, 4.0), (-4, 6, -36, -20, 6.5)): b.box(x0, x1, 33.0, 33.0 + h, z0, z1, gr2, top=roof)
        b.sweep([(-X + 0.6, Z - 0.6), (X - 0.6, Z - 0.6), (X - 0.6, -Z + 0.6), (-X + 0.6, -Z + 0.6)], [(0, 33.0), (0.4, 33.0), (0.4, 34.1), (0, 34.1)], gr2, closed=True)
        for (x, z) in ((20, 6), (24, 10), (-22, 0)): tree(b, x, z, 5, 2.2, yb=33.0)


# ------------------------------------------------------------------ Takanawa Gateway Station
@model('takanawa_gateway_station', tier='B', face='west', stone=0xe8e6de,
       desc="Takanawa Gateway Station: the white folded-membrane roof (origami folds, softly glowing) floating on cedar-coloured timber-and-steel frames over the glazed concourse, the deck over the tracks with its balcony, timber columns, plaza stairs on +Z and platform openings below")
def takanawa_gateway(b):
    mem = b.c(0xf0efe8, 0.6, 0.0, emit=(0.42, 0.4, 0.34)); mem2 = b.c(0xdedcd4, 0.6, 0.0, emit=(0.3, 0.28, 0.24)); wood = b.cf(0xb48c5c, 0.3); wood2 = b.cf(0x96724a, 0.24); wh = b.cf(0xe4e4e0, 0.2); conc = b.c(0x9c9a94); dk = b.c(0x34383c); pav = b.c(0xa4a29a); steel = b.c(0xc0c4c4, 0.5, 0.4)
    gls = b.band('glass', 96, p_curtain(0x587084, 8, 3, 0xb48c5c, 2.0, 0.2, lit=0.9, k=0.85), bay=16.0)
    def basew(c):
        c.rect(0, 0, 1, 1, 0xa8a69e); c.noise(0.06, 5); c.joints(4, 4, 0.9, 1.0, stagger=False)
        for i in range(4): c.rect(i / 4 + 0.03, 0.12, i / 4 + 0.22, 0.62, 0x2e3236, e=(0.5, 0.48, 0.42) if i % 2 == 0 else (0.15, 0.15, 0.14))
        c.rect(0, 0.9, 1, 1, 0xdcdcd8)
    bw = b.band('base', 48, basew, bay=20.0)
    def train(c):
        c.rect(0, 0, 1, 1, 0xc8ccce); c.rect(0, 0.0, 1, 0.16, 0x4a4e52); c.rect(0, 0.3, 1, 0.38, 0x8ab83a); c.litp = 1.0
        for i in range(6): c.window(0.05 + i * 0.155, 0.45, 0.17 + i * 0.155, 0.82, 0x39434c, 0x8a8c8c, mull=(1, 1), sill=False)
    tr = b.band('train', 32, train, bay=20.0)
    XW, ZW, YD = 54.0, 17.0, 8.0
    b.box(-XW, XW, 0, YD, -ZW, ZW, F(bw, bay=20.0), notop=True); b.box(-XW - 2, XW + 2, YD, YD + 0.8, -ZW - 3, ZW + 3, wh, bot=True, top=pav)
    b.box(-XW + 4, XW - 4, YD + 0.8, 21.0, -ZW + 3, ZW - 3, gls, notop=True)
    # folded roof: fold lines across the hall, crowned at the centre line
    n = 14; XR, ZR = 60.0, 23.0
    def fold(i):
        x = -XR + 2 * XR * i / n; hi_ = i % 2 == 0; ends = 0 if 0 < i < n else -1.5
        return [(x, (25.0 if hi_ else 21.8) + ends, ZR), (x, (29.5 if hi_ else 26.0) + ends, 2.0), (x, (28.5 if hi_ else 25.4) + ends, -6.0), (x, (24.5 if hi_ else 21.5) + ends, -ZR)]
    for i in range(n):
        A, C = fold(i), fold(i + 1)
        for j in range(3): b.face([A[j], C[j], C[j + 1], A[j + 1]], mem if i % 2 == 0 else mem2)
        if b.hi:
            b.beam(A[0], A[1], 0.35, 0.5, wood); b.beam(A[1], A[2], 0.35, 0.5, wood); b.beam(A[2], A[3], 0.35, 0.5, wood)
    if b.hi:
        A = fold(n); b.beam(A[0], A[1], 0.35, 0.5, wood); b.beam(A[1], A[2], 0.35, 0.5, wood); b.beam(A[2], A[3], 0.35, 0.5, wood)
        for i in range(1, n, 2):   # timber columns with raking struts under the valleys
            x = -XR + 2 * XR * i / n
            for sz in (-1, 1):
                b.bx(x, sz * (ZW - 2.4), 0.6, 0.6, YD + 0.8, 13.6, wood2)
                b.beam((x, 17.0, sz * (ZW - 2.4)), (x, 21.9 if sz > 0 else 21.6, sz * (ZR - 0.5)), 0.4, 0.4, wood); b.beam((x, 19.0, sz * (ZW - 2.4)), (x - 2 * XR / n, 24.2, sz * (ZW + 1)), 0.3, 0.3, wood2); b.beam((x, 19.0, sz * (ZW - 2.4)), (x + 2 * XR / n, 24.2, sz * (ZW + 1)), 0.3, 0.3, wood2)
        for sz in (-1, 1):   # balcony rail
            b.box(-XW - 2, XW + 2, YD + 1.8, YD + 1.95, sz * (ZW + 2.9) - 0.06, sz * (ZW + 2.9) + 0.06, steel)
            for i in range(15): b.bx(-XW - 1.8 + i * (2 * XW + 3.6) / 14, sz * (ZW + 2.9), 0.1, 0.1, YD + 0.8, 1.1, steel)
    else:
        for sz in (-1, 1):
            for x in (-40, 0, 40): b.bx(x, sz * (ZW - 2.4), 0.8, 0.8, YD + 0.8, 13.6, wood2)
    # plaza stairs + escalator box on +Z, entrance canopy
    ns = b.d(8, 2)
    for k in range(ns): b.box(-12, 12, 0, YD * (ns - k) / ns - 0.001, ZW + 3 + 14.0 * k / ns, ZW + 3 + 14.0 * (k + 1) / ns, pav if k % 2 else conc)
    for sx in (-1, 1): b.box(sx * 12 if sx > 0 else -13, 13 if sx > 0 else -12, 0, YD + 1.0, ZW + 3, ZW + 17, wh)
    b.box(18, 26, 0, YD, ZW, ZW + 6, F(gls, rep=1), top=wh)
    # trains at the platforms below, seen through the openings at both ends
    for (z, x0, x1) in ((-9, -70, 50), (5, -46, 70)): b.box(x0, x1, 1.0, 4.7, z - 1.45, z + 1.45, F(tr, bay=20.0), top=b.c(0x9a9ea0), l=dk, r=dk)
    b.box(-70, 70, 0, 1.0, -13, 13, conc)


run()
