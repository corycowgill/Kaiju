# icons_build_props.py - San Francisco landmark props: Dragon Gate, Fisherman's Wharf sign, Dewey Monument,
# Cupid's Span, Vaillancourt Fountain.   blender -b -P icons_build_props.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


@model('dragon_gate', tier='A', fit=(19.4, 9.0, 4.6), face='south', stone=0x8a9488,
       desc="Dragon Gate: grey-green stone piers, three green-tiled roofs (the high centre one over Grant Ave), gold ridge dragons facing the pearl, fish finials, plaque, two guardian lions")
def dragon_gate(b):
    stone = b.c(0x8f998c); stone2 = b.c(0x7a8478); green = b.c(0x2e7a4c, 0.45); gold = b.c(0xc9a23a, 0.5, 0.3); red = b.c(0xa33a2a)
    blue = b.c(0x2c4a7a); cream = b.c(0xd8cfae)
    tiles = b.band('tiles', 64, p_tiles(0x2f7d4e, 10, 3), bay=2.2)
    xi, xo = 5.0, 8.7
    for sx in (-1, 1):
        # inner (road) piers and outer piers on plinths
        b.bx(sx * xi, 0, 1.7, 1.9, 0, 0.5, stone2); b.bx(sx * xi, 0, 1.3, 1.5, 0.5, 5.6, stone)
        b.bx(sx * xo, 0, 1.4, 1.6, 0, 0.5, stone2); b.bx(sx * xo, 0, 1.0, 1.2, 0.5, 3.9, stone)
        if b.hi:
            b.bx(sx * xi, 0, 1.5, 1.7, 5.6, 0.25, stone2); b.bx(sx * xo, 0, 1.2, 1.4, 4.1, 0.2, stone2)
            b.bx(sx * xi, 0.78, 0.5, 0.06, 2.2, 2.4, red)  # couplet plaque on the pier front
        # side lintel + bracket band + side roof
        xm = sx * (xi + xo) / 2; ws = xo - xi + 1.2
        b.bx(xm, 0, ws, 0.9, 4.4, 0.55, green); b.bx(xm, 0, ws + 0.3, 1.2, 4.95, 0.3, red)
        china_roof(b, xm, 0, ws + 1.9, 3.6, 5.25, 1.35, tiles, green, 0.3, 0.6, gold)
        # guardian lion on a pedestal in front of the outer pier
        b.bx(sx * xo, 2.1, 1.0, 1.3, 0, 0.9, stone2)
        if b.hi:
            b.bx(sx * xo, 2.0, 0.6, 0.8, 0.9, 0.7, stone); b.bx(sx * xo, 2.35, 0.55, 0.5, 1.4, 0.6, stone)
        else: b.bx(sx * xo, 2.1, 0.6, 0.8, 0.9, 1.1, stone)
    # centre beam with the plaque, bracket band, main roof
    b.bx(0, 0, 2 * xi + 1.5, 1.1, 6.0, 0.7, green); b.bx(0, 0, 2 * xi + 1.9, 1.4, 6.7, 0.3, red)
    b.bx(0, 0.6, 3.6, 0.1, 5.2, 0.8, blue)
    if b.hi:
        b.bx(0, 0.66, 3.2, 0.04, 5.3, 0.6, gold)
        for i in range(9): b.bx(-4.4 + i * 1.1, 0, 0.3, 1.6, 6.45, 0.25, gold)   # bracket ends
        b.bx(0, 0, 2 * xi - 1.2, 0.5, 5.3, 0.7, stone2)
    yt = china_roof(b, 0, 0, 2 * xi + 3.6, 4.6, 7.0, 1.5, tiles, green, 0.4, 0.62, None)
    # the pearl and the two dragons on the ridge, fish at the ridge ends
    b.lathe(0, 0, [(0.0, yt), (0.22, yt + 0.12), (0.26, yt + 0.3), (0.0, yt + 0.5)], b.d(8, 4), gold)
    for sx in (-1, 1):
        pts = [(sx * 3.9, yt + 0.25), (sx * 3.2, yt + 0.05), (sx * 2.5, yt + 0.3), (sx * 1.8, yt + 0.08), (sx * 1.1, yt + 0.32), (sx * 0.55, yt + 0.42)]
        if not b.hi: pts = [pts[0], pts[2], pts[5]]
        for i in range(len(pts) - 1): b.beam((pts[i][0], pts[i][1], 0), (pts[i + 1][0], pts[i + 1][1], 0), 0.2, 0.22, gold if i % 2 else green, caps=True, up=(0, 0, 1))
        b.bx(sx * 0.62, 0, 0.36, 0.26, yt + 0.3, 0.3, gold)
        b.bx(sx * 4.3, 0, 0.3, 0.3, yt - 0.25, 0.75, gold)


@model('fishermans_wharf_sign', tier='A', fit=(7.4, 12.0, 1.3), face='south', stone=0x3a5a8a,
       desc="Fisherman's Wharf sign: the ship's wheel (8 spokes with handles) round a blue disc with the red crab, on a steel post with a name board")
def wharf_sign(b):
    blue = b.c(0x24457a, 0.6); white = b.c(0xd9d6cc, 0.6); wood = b.c(0x8a5a32, 0.7); steel = b.c(0x4a5058, 0.5, 0.6); red = b.c(0xb5382a)

    def crab(c):
        c.rect(0, 0, 1, 1, 0x24457a); c.ell(0.5, 0.5, 0.49, None, 0xd9d6cc); c.ell(0.5, 0.5, 0.455, None, 0x2a4d86)
        for i in range(40):   # lettering ring (suggested, not legible)
            a = math.pi * 2 * i / 40
            if 16 < i < 24: continue
            c.line(0.5 + 0.36 * math.sin(a), 0.5 + 0.36 * math.cos(a), 0.5 + 0.42 * math.sin(a), 0.5 + 0.42 * math.cos(a), 2.4, 0xd9d6cc)
        c.ell(0.5, 0.46, 0.17, 0.115, 0xb5382a); c.ell(0.5, 0.48, 0.14, 0.08, 0xc8503a)
        for sx in (-1, 1):
            for j in range(4):   # legs
                y = 0.42 - j * 0.035; c.line(0.5 + sx * 0.13, y + 0.03, 0.5 + sx * (0.24 + j * 0.012), y + 0.06 - j * 0.03, 2.2, 0xb5382a)
                c.line(0.5 + sx * (0.24 + j * 0.012), y + 0.06 - j * 0.03, 0.5 + sx * (0.27 + j * 0.01), y - 0.03 - j * 0.035, 1.8, 0xb5382a)
            c.line(0.5 + sx * 0.1, 0.52, 0.5 + sx * 0.2, 0.62, 3.2, 0xb5382a); c.ell(0.5 + sx * 0.22, 0.66, 0.05, 0.065, 0xb5382a); c.ell(0.5 + sx * 0.205, 0.68, 0.012, 0.035, 0x2a4d86)
            c.ell(0.5 + sx * 0.045, 0.565, 0.014, None, 0x222428)
    dk = b.decal('crab', 128, 128, crab)
    cy, R = 8.2, 2.75
    # post + name board
    b.bx(0, 0, 0.5, 0.5, 0, cy - R + 0.3, steel); b.bx(0, 0, 1.2, 1.2, 0, 0.5, steel)
    b.bx(0, 0.02, 4.6, 0.3, 3.6, 0.95, blue)
    if b.hi: b.bx(0, 0.18, 4.2, 0.04, 3.82, 0.5, white)
    seg = b.d(24, 12)
    u0, v0, u1, v1 = dk[1:5]
    for sz in (1, -1):
        pts = [(R * 0.86 * math.sin(2 * math.pi * i / seg) * sz, cy + R * 0.86 * math.cos(2 * math.pi * i / seg), sz * 0.16) for i in range(seg)][::-1]
        uv = [((u0 + u1) / 2 + (u1 - u0) / 2 * math.sin(2 * math.pi * i / seg), (v0 + v1) / 2 - (v1 - v0) / 2 * math.cos(2 * math.pi * i / seg)) for i in range(seg)][::-1]
        b.face(pts, dk, uv=uv)
    # wheel rim (wood), 8 spokes with handles
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        P = lambda a, r, z: (r * math.sin(a), cy + r * math.cos(a), z)
        ri, ro, z = R * 0.86, R, 0.28
        b.face([P(a0, ro, z), P(a1, ro, z), P(a1, ro, -z), P(a0, ro, -z)], wood)
        b.face([P(a1, ri, z), P(a0, ri, z), P(a0, ro, z), P(a1, ro, z)], wood); b.face([P(a0, ri, -z), P(a1, ri, -z), P(a1, ro, -z), P(a0, ro, -z)], wood)
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        b.tube((R * 0.98 * math.sin(a), cy + R * 0.98 * math.cos(a), 0), (R * 1.33 * math.sin(a), cy + R * 1.33 * math.cos(a), 0), 0.13, wood, seg=b.d(6, 4), r1=0.09, caps=True)


@model('union_square_dewey_monument', tier='A', fit=(8.0, 30.0, 8.0), face='east', stone=0xb9b3a4,
       close=((9, 22, 16), (0, 26, 0), 50), desc="Dewey Monument: stepped granite pedestal, fluted Corinthian column, the bronze Victory with trident and wreath on a globe")
def dewey(b):
    gr = b.c(0xb0aa9c); gr2 = b.c(0x9c9688); gr3 = b.c(0xbcb6a8); bz = b.c(0x3d5a4c, 0.5, 0.6); bz2 = b.c(0x52705c, 0.5, 0.6)
    b.bx(0, 0, 8.0, 8.0, 0, 0.45, gr2); b.bx(0, 0, 6.8, 6.8, 0.45, 0.45, gr2); b.bx(0, 0, 5.6, 5.6, 0.9, 0.45, gr)
    b.bx(0, 0, 4.4, 4.4, 1.35, 1.2, gr); b.bx(0, 0, 3.6, 3.6, 2.55, 3.6, gr3); b.bx(0, 0, 4.2, 4.2, 6.15, 0.5, gr); b.bx(0, 0, 3.2, 3.2, 6.65, 0.7, gr2)
    if b.hi:
        for a in range(4):   # inscription panels
            s = b.sub(); s.bx(0, 1.83, 2.6, 0.06, 3.0, 2.6, gr2); b.add(s, ry=a * 90)
    seg = b.d(16, 8)
    b.lathe(0, 0, [(1.35, 7.35), (1.35, 7.7), (1.05, 7.95), (1.0, 8.2)], seg, gr)
    b.lathe(0, 0, [(0.95, 8.2), (0.9, 14.0), (0.78, 22.9)], b.d(14, 7), gr3, smooth=False)   # fluted shaft
    b.lathe(0, 0, [(0.82, 22.9), (0.8, 23.3), (1.25, 24.3), (1.3, 24.5)], seg, gr)     # Corinthian bell
    b.bx(0, 0, 2.9, 2.9, 24.5, 0.35, gr)
    b.lathe(0, 0, [(0.5, 24.85), (0.75, 25.2), (0.78, 25.6), (0.55, 26.05), (0.0, 26.2)], b.d(10, 6), bz)   # globe
    # Victory: skirt, torso, head, raised arms, trident and wreath
    b.lathe(0, 0, [(0.55, 26.05), (0.42, 26.9), (0.3, 27.75)], b.d(8, 5), bz2)
    b.lathe(0, 0, [(0.3, 27.75), (0.36, 28.2), (0.3, 28.55), (0.12, 28.7)], b.d(8, 5), bz2)
    b.lathe(0, 0.03, [(0.0, 28.66), (0.17, 28.8), (0.17, 28.98), (0.0, 29.1)], b.d(8, 4), bz2)
    b.tube((0.28, 28.5, 0), (0.75, 29.0, 0.15), 0.09, bz2, seg=4); b.tube((0.75, 29.0, 0.15), (0.9, 29.45, 0.2), 0.08, bz2, seg=4)
    b.tube((-0.28, 28.5, 0), (-0.8, 28.75, 0.35), 0.09, bz2, seg=4)
    b.tube((0.9, 27.6, 0.2), (0.9, 30.0, 0.2), 0.035, bz, seg=4)
    if b.hi:
        b.beam((0.72, 29.75, 0.2), (1.08, 29.75, 0.2), 0.05, 0.05, bz)
        for dx in (-0.18, 0.18): b.tube((0.9 + dx, 29.75, 0.2), (0.9 + dx, 30.0, 0.2), 0.03, bz, seg=4)
        for i in range(8):   # wreath
            a0, a1 = math.pi * 2 * i / 8, math.pi * 2 * (i + 1) / 8
            b.tube((-0.95 + 0.26 * math.cos(a0), 28.8 + 0.26 * math.sin(a0), 0.4), (-0.95 + 0.26 * math.cos(a1), 28.8 + 0.26 * math.sin(a1), 0.4), 0.05, bz, seg=4)
    else: b.bx(-0.95, 0.4, 0.5, 0.1, 28.55, 0.5, bz)


@model('cupids_span', tier='B', fit=(43.8, 18.0, 5.3), face='east', stone=0xc9a23a,
       desc="Cupid's Span: the gold bow rising out of the lawn with its string, the red arrow driven into the ground, red fletching high at one end")
def cupids_span(b):
    gold = b.c(0xcaa235, 0.45, 0.2); red = b.c(0xb2302a, 0.5); red2 = b.c(0x8f2622, 0.5); cable = b.c(0x6a6a66, 0.5, 0.5)
    n = b.d(18, 8)
    tipL, tipR = np.array([-21.0, 17.2]), np.array([22.0, 9.0]); bot = np.array([-1.5, -1.6])
    # bow: a parabola-like arc through the two raised tips, its belly buried
    def bow(t):
        x = tipL[0] + (tipR[0] - tipL[0]) * t
        base = tipL[1] + (tipR[1] - tipL[1]) * t
        sag = 4 * t * (1 - t) * 14.2
        return np.array([x, base - sag])
    pts = [bow(i / n) for i in range(n + 1)]
    for i in range(n):
        a, c = pts[i], pts[i + 1]
        if a[1] < -0.3 and c[1] < -0.3: continue
        tt = (i + 0.5) / n; r = 0.55 + 1.15 * math.sin(math.pi * tt)   # thick at the grip, thin at the tips
        b.beam((a[0], a[1], 0), (c[0], c[1], 0), 2.3, r * 1.25, gold, caps=True, up=(0, 0, 1))
    for p, sg in ((tipL, -1), (tipR, 1)):   # recurved tips
        b.beam((p[0], p[1], 0), (p[0] + sg * 0.9, p[1] + 1.0, 0), 1.2, 0.5, gold, caps=True, up=(0, 0, 1))
    # arrow: fletching up at the left, shaft driven into the lawn near the grip
    nock = np.array([-13.5, 17.6]); tip = np.array([0.5, -0.3])
    b.tube((nock[0], nock[1], 0), (tip[0], tip[1], 0), 0.42, red, seg=b.d(8, 5), caps=True)
    d = (tip - nock) / np.linalg.norm(tip - nock); nrm = np.array([-d[1], d[0]])
    for k in range(3):   # three vanes
        ang = k * 120 + 90
        s = b.sub()
        q = [(0, 0.3, 0), (0.6, 2.6, 0), (6.6, 2.6, 0), (8.2, 0.3, 0)]
        s.face(q, red2 if k else red, two=True)
        s.face([(x, y, 0.12) for x, y, z in q], red2 if k else red, two=True)
        s2 = b.sub(); s2.add(s, rx=ang)
        b.add(s2, t=(nock[0] - d[0] * 0.5, nock[1] - d[1] * 0.5, 0), rz=math.degrees(math.atan2(d[1], d[0])))
    # string from tip to tip, drawn to the nock
    b.tube((tipL[0] - 0.9, tipL[1] + 1.0, 0), (nock[0], nock[1] + 0.3, 0), 0.09, cable, seg=4)
    b.tube((nock[0], nock[1] + 0.3, 0), (tipR[0] + 0.9, tipR[1] + 1.0, 0), 0.09, cable, seg=4)
    b.bx(0, 0, 43.8, 5.3, 0, 0.02, b.c(0x5d7a45))   # footprint marker lawn patch (thin)


@model('vaillancourt_fountain', tier='C', fit=(42.0, 12.0, 30.0), face='east', stone=0x8d8779,
       desc="Vaillancourt Fountain: the tangle of bent square concrete tubes cantilevering over an angular pool with stepping slabs")
def vaillancourt(b):
    conc = b.c(0x8f887a); conc2 = b.c(0x7b7568); dark = b.c(0x3c3a36); water = b.c(0x3f5a58, 0.25); pav = b.c(0x9a958a)
    pool = [(-26, 19), (20, 19), (26, 4), (14, -19), (-20, -19), (-26, -2)]
    b.prism(pool, 0, 0.7, conc2, top=conc2)
    inner = [(-24.5, 17.5), (19, 17.5), (24.3, 4), (13, -17.5), (-19, -17.5), (-24.5, -2)]
    b.cap(inner, 0.72, water)
    T = 3.3
    arms = [  # polylines of square tubes (x, y, z)
        [(-18, 0, -14), (-18, 8.5, -14), (-4, 8.5, -14), (-4, 8.5, 2), (-4, 4.5, 2)],
        [(-8, 0, -15), (-8, 11.5, -15), (-8, 11.5, -1), (6, 11.5, -1), (6, 6.0, -1)],
        [(8, 0, -15), (8, 6.5, -15), (8, 6.5, 0), (-6, 6.5, 0)],
        [(16, 0, -10), (16, 10.0, -10), (16, 10.0, 6), (4, 10.0, 6), (4, 10.0, 12)],
        [(-22, 0, -8), (-22, 5.0, -8), (-22, 5.0, 8), (-12, 5.0, 8), (-12, 2.5, 8)],
        [(0, 0, -16), (0, 4.2, -16), (0, 4.2, -6), (12, 4.2, -6), (12, 4.2, 4)],
        [(20, 0, 0), (20, 7.5, 0), (10, 7.5, 0), (10, 7.5, 10), (10, 3.5, 10)],
        [(-14, 0, -16), (-14, 3.4, -16), (-14, 3.4, -4), (-14, 3.4, 4)],
    ]
    if not b.hi: arms = arms[:6]
    for k, arm in enumerate(arms):
        for i in range(len(arm) - 1):
            A, C = np.array(arm[i], float), np.array(arm[i + 1], float); d = (C - A) / np.linalg.norm(C - A)
            last = i == len(arm) - 2
            b.beam(A + d * (T / 2 if i else 0), C + d * T / 2 * (0 if last else 1), T, T, conc if k % 2 else conc2, caps=True)
            if last and b.hi: b.beam(C + d * 0.01, C + d * 0.04, T - 0.7, T - 0.7, dark, caps=True)   # open tube mouth
    for (x, z) in ((-10, 10), (-4, 13), (2, 9), (14, 14), (-18, 14), (18, 9)):
        b.bx(x, z, 3.2, 3.2, 0.7, 0.35, pav)
    b.bx(0, -18.2, 30, 1.6, 0, 9.0 if False else 2.4, conc2)


run()
