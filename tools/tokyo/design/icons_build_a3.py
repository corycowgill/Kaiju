# icons_build_a3.py - Tokyo tier A: Nijubashi, Wako, Tsukiji Hongan-ji, Tokyo International Forum.
# blender -b -P icons_build_a3.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


def p_shiro(c):
    """white plastered castle wall: stone footing line, small barred windows, dark eave shadow"""
    c.rect(0, 0, 1, 1, 0xdcd8cc); c.noise(0.04, 5)
    for i in range(4): c.rect(i / 4 + 0.09, 0.42, i / 4 + 0.16, 0.7, 0x3a3630); c.rect(i / 4 + 0.122, 0.42, i / 4 + 0.128, 0.7, 0xdcd8cc)
    c.rect(0, 0, 1, 0.1, 0x8a867c); c.rect(0, 0.92, 1, 1, 0xb8b4a8); c.flood(0.3, 0xfff0d8)


def p_stone(col=0x8e8a80):
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.16, 8); c.joints(7, 5, 0.72, 1.6); c.noise(0.08, 3); c.grain(0.04); c.flood(0.1, 0xfff0d8)
    return fn


# ------------------------------------------------------------------ Nijubashi (Seimon Ishibashi) + Fushimi-yagura
# X = along the stone bridge (plaza side +X, the main gate -X); the moat lies in front (+Z) and passes under the arches;
# the high rampart with the Fushimi-yagura stands behind (-Z). y 0 = moat water level.
@model('imperial_palace_nijubashi', tier='A', face='east', stone=0x8e8a80, water=True,
       close=((16, 5, 46), (-6, 8, -12), 30),
       desc="Nijubashi: the double-arched stone bridge (Seimon Ishibashi) over the moat with its parapet and bronze lamps, the white-walled main gate on the palace terrace (-X), the plaza-side abutment and ramp (+X), and behind (-Z) the battered stone rampart carrying the white Fushimi-yagura keep with its two wing galleries, pines along the walls; y 0 = moat water level")
def nijubashi(b):
    st = b.tile(p_stone(), 256, 256, 6.0, 6.0); stc = b.c(0x8a867c); stc2 = b.c(0x74716a); grass = b.c(0x56683c); pav = b.c(0x9c988c); white = b.cf(0xdcd8cc, 0.3); wood = b.c(0x3a2e26)
    bronze = b.c(0x4a5a4c, 0.5, 0.5); ridge = b.c(0x3a3e42); under = b.cf(0xcfcbbf, 0.2); globe = b.glow(WARM, 1.0, 0xe8dcc0); gold = b.c(0xc4a24a, 0.45, 0.7)
    kw = b.band('kawara', 64, p_kawara(0x474c52, 10, 3), bay=4.0); sh = b.band('shiro', 32, p_shiro, bay=10.0)
    # ---- ramparts
    ishigaki(b, -62, 34, -64, -34, 0, 9.0, st, 0.28, top=grass)
    ishigaki(b, -62, -19, -34, 13, 0, 5.6, st, 0.2, top=pav, skins={2: None})
    ishigaki(b, 19, 40, -11, 11, 0, 5.6, st, 0.2, top=pav, skins={1: None})
    for (za, zb, f) in ((-9, 9, 1),):   # ramp down to the plaza
        b.face([(40, 5.6, zb), (62, 0.0, zb), (62, 0.0, za), (40, 5.6, za)], pav)
        b.face([(40, 0, zb), (62, 0, zb), (40, 5.6, zb)], st); b.face([(62, 0, za), (40, 0, za), (40, 5.6, za)], st)
    # ---- the stone bridge
    arch_bridge(b, -19, 19, 0, 12.8, 2, 0, 1.3, 3.7, 5.6, st, stc2, pier=0.17, deck=pav, cutwater=stc)
    for sz in (-1, 1):
        b.box(-21, 21, 5.6, 6.7, sz * 6.4 - 0.3, sz * 6.4 + 0.3, stc)
        if b.hi:
            b.box(-21, 21, 5.3, 5.6, sz * 6.4 - 0.5, sz * 6.4 + 0.5, stc2, bot=True, notop=True)
            for i in range(7):
                x = -18 + i * 6; b.bx(x, sz * 6.4, 0.9, 0.9, 5.6, 1.6, stc2)
                if i % 2 == 0:
                    b.cyl(x, sz * 6.4, 0.14, 7.2, 9.4, 6, bronze, cap=False)
                    for (dx, dz) in ((0.55, 0), (-0.55, 0), (0, 0.55), (0, -0.55)): b.lathe(x + dx, sz * 6.4 + dz, [(0, 8.5), (0.3, 8.8), (0.3, 9.1), (0, 9.4)], 5, globe, smooth=False)
                    b.lathe(x, sz * 6.4, [(0, 9.4), (0.36, 9.8), (0.36, 10.2), (0, 10.6)], 5, globe, smooth=False)
        else:
            for x in (-18, 0, 18): b.bx(x, sz * 6.4, 0.5, 0.5, 6.7, 3.6, bronze)
    # ---- main gate (Seimon) on the palace terrace, facing the bridge
    g = b.sub()
    g.box(-13, 13, 0, 1.0, -3.2, 3.2, st, top=stc)
    for sx in (-1, 1): g.box(min(sx * 3.4, sx * 12.5), max(sx * 3.4, sx * 12.5), 1.0, 6.4, -2.8, 2.8, sh, notop=True)
    g.box(-3.4, 3.4, 4.6, 6.4, -2.8, 2.8, white, bot=True, notop=True)
    g.face([(-3.4, 0, -0.5), (3.4, 0, -0.5), (3.4, 4.6, -0.5), (-3.4, 4.6, -0.5)], wood)
    if g.hi:
        for x in (-3.4, 3.4): g.bx(x, 2.6, 0.7, 0.7, 0, 4.8, wood)
        g.box(-3.9, 3.9, 4.6, 5.2, 2.2, 3.0, wood, bot=True)
        for x in (-1.7, 1.7): g.face([(x - 0.12, 0.1, -0.44), (x + 0.12, 0.1, -0.44), (x + 0.12, 4.4, -0.44), (x - 0.12, 4.4, -0.44)], gold)
    jroof(g, 0, 0, 30, 9.5, 6.4, 4.4, kw, ridge, style='irimoya', under=under, gable=white, up=0.8, rl=0.8)
    b.add(g, t=(-27, 5.6, 0), ry=90)
    for (x0, x1, z) in ((-60, -22, 11.5), (-60, -22, -32.5)):
        b.box(x0, x1, 5.6, 8.2, z - 0.35, z + 0.35, sh if False else white); b.box(x0, x1, 8.1, 8.2, z - 0.9, z + 0.9, white, bot=True); b.gable(x0, x1, z - 0.9, z + 0.9, 8.2, 0.7, kw, white, axis='x')
    # ---- Fushimi-yagura and its wing galleries on the rampart
    k = b.sub()
    k.box(-7.5, 7.5, 0, 1.2, -6.5, 6.5, st, top=stc)
    k.box(-6.8, 6.8, 1.2, 5.6, -5.8, 5.8, sh, notop=True)
    jroof(k, 0, 0, 18.5, 16.5, 5.6, 3.6, kw, ridge, style='hip', under=under, up=0.8)
    k.box(-5.0, 5.0, 6.8, 10.6, -4.0, 4.0, sh, notop=True)
    jroof(k, 0, 0, 14.5, 12.5, 10.6, 5.2, kw, ridge, style='irimoya', under=under, gable=white, up=1.0, orn=b.c(0x5a6a5c, 0.5, 0.5))
    b.add(k, t=(-10, 9.0, -44))
    for (x0, x1) in ((-52, -17), (-3, 26)):
        b.box(x0, x1, 9.0, 12.6, -41.5, -36.5, sh, notop=True)
        jroof(b, (x0 + x1) / 2, -39, x1 - x0 + 1.6, 7.6, 12.6, 2.6, kw, ridge, style='gable', under=under, gable=white, up=0.3)
    rng = np.random.RandomState(3)
    for (x, z, yb) in ((-56, -48, 9), (-44, -52, 9), (-30, -55, 9), (4, -50, 9), (16, -54, 9), (28, -46, 9), (-22, -58, 9), (-50, 4, 5.6), (-42, -22, 5.6), (-54, -14, 5.6), (-36, 7, 5.6), (30, -6, 5.6), (33, 7, 5.6), (-58, -60, 9), (22, -60, 9)):
        pine(b, x, z, 7 + rng.rand() * 5, 2.6 + rng.rand() * 1.6, lean=rng.rand() * 2 - 1, yb=yb)
    if b.hi:   # sentry boxes at the plaza end
        for z in (-5, 5):
            b.bx(41.5, z, 1.6, 1.6, 5.6, 2.6, white); b.frust((40.5, 42.5, z - 1.0, z + 1.0), (41.5, 41.5, z, z), 8.2, 9.0, ridge)


# ------------------------------------------------------------------ Wako (Ginza 4-chome)
@model('wako_ginza', tier='A', face='southwest', stone=0xb8b2a2,
       close=((34, 14, 44), (6, 22, 8), 30),
       desc="Wako, Ginza 4-chome: seven-storey 1932 granite block with the convex curved corner (+X, +Z) on the crossing, modelled window bays between piers, lit show windows, string courses and cornice, and the square clock tower with four lit clock faces above the corner; party walls on -X and -Z")
def wako_ginza(b):
    G = 0xb9b3a3; gr = b.cf(G, 0.24); gr2 = b.cf(mul(G, 0.88), 0.2); dkg = b.c(0x4a4844); roof = b.c(0x6a6a66); bronze = b.c(0x4a4034, 0.5, 0.5); rng = np.random.RandomState(4)
    wins = win_decals(b, 'w', 24, 32, 0x39434c, 0x4a4034, mull=(2, 3)); shows = win_decals(b, 's', 40, 32, 0x4a4238, 0x4a4034, mull=(3, 1), nlit=2, ndark=0)
    fl_s = b.band('floor', 64, fl(p_grid(G, 4, 1, wx=(0.24, 0.76), wy=(0.2, 0.84), rows=6, cols=4, lit=0.5, mull=(2, 3), frame=0x4a4034), 0.24), bay=16.0)
    ash = b.band('ash', 32, fl(p_ashlar(G, 4, 5), 0.24), bay=8.0)
    clock = b.decal('clock', 48, 48, lambda c: (p_clock(0xf0ead8, 0x2a2a2c, 0x4a4034, G)(c), c.ell(0.5, 0.5, 0.42, None, e=(1.0, 0.95, 0.8)), [c.line(0.5 + 0.33 * math.sin(a), 0.5 + 0.33 * math.cos(a), 0.5 + 0.39 * math.sin(a), 0.5 + 0.39 * math.cos(a), 2.4, 0x2a2a2c) for a in [math.pi * i / 6 for i in range(12)]], c.line(0.5, 0.5, 0.68, 0.6, 3.0, 0x2a2a2c), c.line(0.5, 0.5, 0.42, 0.82, 2.0, 0x2a2a2c)))
    R = 9.0; ac = (5.0, 9.0); na = 3
    arc = [(ac[0] + R * math.sin(math.radians(90 * i / na)), ac[1] + R * math.cos(math.radians(90 * i / na))) for i in range(na + 1)]
    path = [(-14, 18)] + arc + [(14, -18)]
    segs = [((-14, 18), arc[0], 5)] + [(arc[i], arc[i + 1], 1) for i in range(na)] + [(arc[-1], (14, -18), 7)]
    plan = path + [(-14, -18)]
    FL = [(6.5, 10.9), (10.9, 15.1), (15.1, 19.3), (19.3, 23.5), (23.5, 27.7)]
    for (p0, p1, n) in segs:
        winwall(b, p0, p1, 0, 6.5, n, dkg, shows, rng, F(fl_s, rep=max(1, n // 4)), sill=0.1, head=0.2, pier=0.22, depth=0.6, plit=1.0, nlit=2)
        for (y0, y1) in FL: winwall(b, p0, p1, y0, y1, n * 2 if n > 1 else 2, gr, wins, rng, F(fl_s, rep=max(1, n // 2)), sill=0.2, head=0.16, pier=0.42, depth=0.4, plit=0.55)
        b.wall(p0, p1, 27.7, 31.0, F(ash, rep=max(1, n // 2)))
    b.wall((14, -18), (-14, -18), 0, 31.0, gr2); b.wall((-14, -18), (-14, 18), 0, 31.0, gr2); b.cap(plan, 31.0, roof)
    for (y, o, h) in ((6.3, 0.5, 0.6), (27.4, 0.45, 0.6), (30.4, 0.7, 0.9)): b.sweep(path, [(0, y), (o, y + h * 0.4), (o, y + h), (0, y + h)], gr)
    if b.hi:   # piers running the full height between the paired windows
        for (p0, p1, n) in segs:
            if n > 1: pilasters(b, p0, p1, 6.9, 27.4, n + 1, 0.8, 0.3, gr)
        for (x, z) in arc: b.tube((x, 6.9, z), (x, 27.4, z), 0.42, gr, seg=4)
        for (x0, x1, z0, z1) in ((-11, -4, -14, -6), (-10, -6, 2, 8)): b.box(x0, x1, 31.0, 33.4, z0, z1, gr2, top=roof)
    b.box(-2, 3, 3.6, 4.0, 18, 20.2, bronze, bot=True)
    if not b.hi:
        for (p0, p1, n) in segs:
            if n > 1: pilasters(b, p0, p1, 6.9, 27.4, n + 1, 0.8, 0.3, gr)
    else:
        b.sweep(path, [(0, 31.0), (0, 31.9), (-0.5, 31.9), (-0.5, 31.0)], gr2)
        for (x, z) in ((-8, 12), (-2, -10), (8, -12)): b.bx(x, z, 3, 3, 31.0, 1.6, gr2, top=roof)
        for k in range(4):
            s = b.sub()
            for x in (-2.6, 2.6): s.bx(x, 4.9, 0.8, 0.8, 31.0, 2.9, gr)
            s.box(-1.2, 1.2, 38.9, 40.3, 3.0, 3.5, gr2)
            b.add(s, t=(6.5, 0, 10.5), ry=90 * k)
    # ---- clock tower over the corner
    tx, tz = 6.5, 10.5
    b.box(tx - 5.2, tx + 5.2, 31.0, 33.4, tz - 5.2, tz + 5.2, ash, top=roof)
    b.box(tx - 4.2, tx + 4.2, 33.4, 38.2, tz - 4.2, tz + 4.2, gr, top=roof)
    for k in range(4):
        s = b.sub(); s.face([(-1.9, 33.9, 4.26), (1.9, 33.9, 4.26), (1.9, 37.7, 4.26), (-1.9, 37.7, 4.26)], clock)
        if s.hi:
            for x in (-3.7, 3.7): s.bx(x, 3.9, 1.0, 1.0, 33.4, 4.8, gr2)
        b.add(s, t=(tx, 0, tz), ry=90 * k)
    b.box(tx - 4.7, tx + 4.7, 38.2, 38.9, tz - 4.7, tz + 4.7, gr2, bot=True)
    b.box(tx - 3.2, tx + 3.2, 38.9, 39.9, tz - 3.2, tz + 3.2, gr); b.frust((tx - 3.4, tx + 3.4, tz - 3.4, tz + 3.4), (tx - 0.8, tx + 0.8, tz - 0.8, tz + 0.8), 39.9, 41.0, b.c(0x5a6a5e, 0.5, 0.4), top=gr2)
    b.tube((tx, 41.0, tz), (tx, 44.0, tz), 0.12, bronze, seg=4, r1=0.04); avlight(b, tx, 43.9, tz, 0.3)


# ------------------------------------------------------------------ Tsukiji Hongan-ji
@model('tsukiji_honganji', tier='A', face='northwest', stone=0xa8a69c,
       close=((-30, 9, 62), (0, 14, 14), 30),
       desc="Tsukiji Hongan-ji: grey stone ancient-Indian style temple; the centre hall with the rounded lotus (chaitya) arch roof, lit arch window and finial over a columned porch and broad steps, two-storey wings with pilasters and balustrades, the two stupa towers at the ends, corner pinnacles")
def tsukiji_honganji(b):
    G = 0xaaa89e; gr = b.cf(G, 0.24); gr2 = b.cf(mul(G, 0.86), 0.2); cop = b.c(0x76887c, 0.6, 0.3); roof = b.c(0x6c6e6a); dk = b.c(0x2e2c2a); gold = b.c(0xc4a24a, 0.45, 0.7, emit=(0.2, 0.16, 0.06)); glow = b.glow(WARM, 0.85, 0x6a5a40)
    rng = np.random.RandomState(8)
    wins = win_decals(b, 'w', 24, 40, 0x39434c, 0x5a584e, arch=True, mull=(2, 3), wall=G)
    w_s = b.band('wing', 96, fl(p_grid(G, 4, 2, wx=(0.28, 0.72), wy=(0.12, 0.84), arch=True, rows=14, cols=6, lit=0.45, mull=(2, 3), top=(0.06, mul(G, 1.06)), bot=(0.06, mul(G, 0.85))), 0.24), bay=14.0)
    ash = b.band('ash', 32, fl(p_ashlar(G, 4, 5), 0.24), bay=8.0)
    def lotus(c):
        c.rect(0, 0, 1, 1, G); pts = [(0.5 + 0.44 * math.cos(math.radians(a)), 0.08 + 0.74 * math.sin(math.radians(a)) ** 0.85) for a in range(0, 181, 12)]; pts[len(pts) // 2] = (0.5, 0.97)
        for i in range(len(pts) - 1): c.poly([(0.5, 0.08), pts[i], pts[i + 1]], 0x3a3832, e=(0.95, 0.72, 0.36))
        for i in range(len(pts)): c.line(0.5, 0.08, pts[i][0], pts[i][1], 1.6, 0x6a685e)
        for r in (0.3, 0.55): c.line(0.5 - r * 0.44, 0.08 + r * 0.74 * 0.7, 0.5 + r * 0.44, 0.08 + r * 0.74 * 0.7, 1.4, 0x6a685e)
        c.rect(0, 0, 1, 0.08, mul(G, 0.9))
    lot = b.decal('lotus', 64, 64, lotus)
    door = b.decal('door', 32, 48, lambda c: (c.rect(0, 0, 1, 1, 0x3a3028, e=(0.9, 0.62, 0.3)), c.rect(0.47, 0, 0.53, 1, 0x5a4a38), c.rect(0, 0.7, 1, 0.74, 0x5a4a38), c.rect(0, 0, 0.06, 1, 0x5a4a38), c.rect(0.94, 0, 1, 1, 0x5a4a38)))
    # ---- podium and steps
    b.box(-45, 45, 0, 3.0, -30, 16, ash, top=gr2)
    for k in range(b.d(6, 2)): st_ = b.d(1, 3); b.box(-13, 13, 0, 3.0 - 0.5 * k * st_ - 0.001, 16 + 1.0 * k * st_ + 6.0, 16 + 6.0 + 1.0 * (k + 1) * st_, gr2)
    b.box(-13, 13, 0, 3.0, 16, 22, ash, top=gr2)
    # ---- centre hall with the lotus-arch roof
    b.box(-17, 17, 3.0, 19.0, -28, 14, ash, top=roof)
    n = b.d(16, 6); prof = [(15.0 * math.cos(math.pi * i / n), 19.0 + 11.0 * math.sin(math.pi * i / n) ** 0.85) for i in range(n + 1)]; prof[n // 2] = (0.0, 32.2)
    b.loft([[(x, y, -26.0) for (x, y) in prof], [(x, y, 14.6) for (x, y) in prof]], cop, closed=False)
    b.face([(0, 19.0, 14.6)] + [(x, y, 14.6) for (x, y) in prof[::-1]], gr); b.face([(0, 19.0, -26.0)] + [(x, y, -26.0) for (x, y) in prof], gr2)
    b.face([(-8.5, 19.6, 14.68), (8.5, 19.6, 14.68), (8.5, 30.6, 14.68), (-8.5, 30.6, 14.68)], lot)
    if b.hi:   # the thick arch rim + roof ribs
        rim = [(x * 1.06, 19.0 + (y - 19.0) * 1.07) for (x, y) in prof]
        for i in range(n):
            (xa, ya), (xb, yb) = rim[i], rim[i + 1]; (xc, yc), (xd, yd) = prof[i], prof[i + 1]
            b.face([(xa, ya, 15.6), (xb, yb, 15.6), (xd * 0.9, 19 + (yd - 19) * 0.9, 15.6), (xc * 0.9, 19 + (yc - 19) * 0.9, 15.6)][::-1], gr2)
            b.face([(xa, ya, 13.6), (xb, yb, 13.6), (xb, yb, 15.6), (xa, ya, 15.6)][::-1], gr2)
            b.face([(xc * 0.9, 19 + (yc - 19) * 0.9, 15.6), (xd * 0.9, 19 + (yd - 19) * 0.9, 15.6), (xd * 0.9, 19 + (yd - 19) * 0.9, 14.6), (xc * 0.9, 19 + (yc - 19) * 0.9, 14.6)][::-1], gr2)
        for z in (-18, -8, 2):
            for i in range(n): b.beam((prof[i][0] * 1.01, prof[i][1] + 0.1, z), (prof[i + 1][0] * 1.01, prof[i + 1][1] + 0.1, z), 0.5, 0.3, b.c(0x66786c, 0.6, 0.3), up=(0, 0, 1))
    b.lathe(0, 14.0, [(0.9, 32.0), (1.3, 32.8), (0.7, 33.6), (0.9, 34.2), (0.25, 35.2), (0.0, 36.2)], b.d(8, 4), gold)
    b.box(-17.6, 17.6, 18.4, 19.4, -28.6, 15.2, gr2, bot=True, notop=True)
    # porch: six columns, entablature, parapet
    for i in range(6):
        x = -11.5 + i * 4.6; b.cyl(x, 20.4, 0.75, 3.0, 11.6, b.d(10, 5), gr, cap=False)
        if b.hi: b.bx(x, 20.4, 2.0, 2.0, 3.0, 0.7, gr2); b.lathe(x, 20.4, [(0.72, 10.6), (1.15, 11.2), (1.15, 11.6)], 8, gr2)
    b.box(-13.2, 13.2, 11.6, 13.8, 14, 21.8, gr, bot=True); b.box(-13.6, 13.6, 13.8, 14.5, 14, 22.2, gr2, bot=True)
    if b.hi:
        for i in range(9): b.bx(-12 + i * 3.0, 21.6, 0.5, 0.5, 14.5, 1.0, gr2)
        b.box(-13, 13, 15.3, 15.6, 21.3, 21.9, gr2)
    for x in (-6.9, 0, 6.9): b.face([(x - 1.7, 3.0, 14.06), (x + 1.7, 3.0, 14.06), (x + 1.7, 9.6, 14.06), (x - 1.7, 9.6, 14.06)], door)
    # ---- wings + stupa towers
    for sx in (-1, 1):
        x0, x1 = (17, 37) if sx > 0 else (-37, -17)
        b.box(x0, x1, 3.0, 15.0, -22, 12, w_s, top=roof, f=None)
        for (y0, y1) in ((3.0, 9.0), (9.0, 15.0)): winwall(b, (x0, 12), (x1, 12), y0, y1, 5, gr, wins, rng, F(w_s, rep=1), sill=0.2, head=0.12, pier=0.5, depth=0.45, arch=True, plit=0.5)
        b.box(x0 - 0.4, x1 + 0.4, 15.0, 15.8, -22.4, 12.5, gr2, bot=True, notop=True)
        if b.hi:
            pilasters(b, (x0, 12), (x1, 12), 3.0, 15.0, 6, 0.9, 0.35, gr2)
            for i in range(8): b.bx(x0 + 1.2 + i * 2.5, 12.2, 0.45, 0.45, 15.8, 1.0, gr2)
            b.box(x0, x1, 16.6, 16.9, 11.9, 12.5, gr2)
        xt = sx * 41.0; zt = 6.0
        b.box(xt - 4.5, xt + 4.5, 3.0, 15.5, zt - 4.5, zt + 4.5, F(w_s, rep=1), top=roof)
        b.box(xt - 5.0, xt + 5.0, 15.5, 16.5, zt - 5.0, zt + 5.0, gr2, bot=True)
        b.lathe(xt, zt, [(3.6, 16.5), (3.6, 18.4), (4.0, 18.6), (4.0, 19.2), (3.5, 19.2)], 8, gr, smooth=False)
        if b.hi:
            for k in range(8): a = math.radians(22.5 + 45 * k); b.face([(xt + 3.62 * math.sin(a) - 0.5 * math.cos(a), 16.8, zt + 3.62 * math.cos(a) + 0.5 * math.sin(a)), (xt + 3.62 * math.sin(a) + 0.5 * math.cos(a), 16.8, zt + 3.62 * math.cos(a) - 0.5 * math.sin(a)), (xt + 3.62 * math.sin(a) + 0.5 * math.cos(a), 18.2, zt + 3.62 * math.cos(a) - 0.5 * math.sin(a)), (xt + 3.62 * math.sin(a) - 0.5 * math.cos(a), 18.2, zt + 3.62 * math.cos(a) + 0.5 * math.sin(a))], glow if k % 2 == 0 else dk)
        b.lathe(xt, zt, b.d([(3.5, 19.2), (3.7, 20.4), (3.2, 22.0), (2.0, 23.4), (0.9, 24.0), (0.9, 24.8), (1.4, 25.0), (1.4, 25.5), (0.5, 25.7), (0.35, 27.2), (0.0, 28.4)], [(3.5, 19.2), (3.5, 21.0), (1.4, 24.2), (1.2, 25.5), (0.0, 28.4)]), b.d(10, 5), cop)
        for (px, pz) in ((sx * 16.0, 13.0), (sx * 16.0, -27.0)):   # corner pinnacles of the hall
            b.bx(px, pz, 2.2, 2.2, 19.0, 1.6, gr2); b.lathe(px, pz, b.d([(1.0, 20.6), (1.1, 21.6), (0.5, 22.6), (0.2, 23.0), (0.0, 24.2)], [(1.0, 20.6), (0.9, 22.0), (0.0, 24.2)]), b.d(8, 4), cop)
        b.box(x0, x1, 3.0, 12.0, -30, -22, ash, top=roof)
        stone_lantern(b, sx * 18, 26, 3.0)


# ------------------------------------------------------------------ Tokyo International Forum
@model('tokyo_international_forum', tier='A', face='west', stone=0xc8ccd0,
       close=((-98, 22, -6), (0, 30, -40), 24),
       desc="Tokyo International Forum: the 207 m lens-plan Glass Hall (60 m) on -Z along the tracks, glass walls in a white frame under the ribbed keel roof (transverse ribs and spine), the four cube halls stepping down in size along +Z (A at -X to D at +X) with finned pale-metal walls, glazed lobbies and bridges across the tree-planted plaza")
def tokyo_international_forum(b):
    WH = 0xdfe1e0; wh = b.cf(WH, 0.2, tint=0xf0f4ff); stl = b.c(0xb8bcbc, 0.5, 0.4); roofc = b.c(0x8a9094); pav = b.c(0x9a9890); dk = b.c(0x34383c); gl = b.c(0x50687a, 0.2, 0.2, emit=(0.16, 0.2, 0.24))
    gls = b.band('glass', 128, p_curtain(0x4c6678, 8, 6, 0xd4d8d8, 1.4, 0.25, lit=0.7, k=0.5), bay=24.0)
    glr = b.band('groof', 32, p_curtain(0x5c7688, 8, 1, 0xdcdede, 1.6, 0.1, lit=0.9, k=0.3), bay=12.0)
    def cube(c):
        c.rect(0, 0, 1, 1, 0xc9ccca); c.noise(0.05, 5); c.joints(8, 8, 0.9, 1.0, stagger=False)
        for i in range(8):
            if c.rng.rand() < 0.5: c.rect(i / 8 + 0.02, 0.56, i / 8 + 0.1, 0.66, 0x3c4852, e=(0.8, 0.7, 0.5) if c.rng.rand() < 0.6 else None)
        c.rect(0, 0.92, 1, 1, 0xa8acac); c.flood(0.12, 0xf0f4ff)
    cb = b.band('cube', 128, cube, bay=24.0)
    lob = b.band('lobby', 48, p_curtain(0x566a78, 8, 2, 0xc8cccc, 1.4, 0.15, lit=0.95, k=0.95), bay=20.0)
    b.cap(B.rect(-105, 105, -60, 60), 0.08, pav)
    # ---- Glass Hall: lens plan
    n = b.d(18, 6); zc = -36.0
    hw = lambda t: 2.0 + 15.0 * (1 - t * t) ** 0.7
    T = [-1 + 2 * i / n for i in range(n + 1)]
    west = [(103.0 * t, zc + hw(t) * 0.8) for t in T]; east = [(103.0 * t, zc - hw(t) * 1.2) for t in T][::-1]
    for y0, y1 in ((0, 19), (19, 38), (38, 57)): curvewall(b, west, y0, y1, gls); curvewall(b, east, y0, y1, gls)
    b.wall(east[-1], west[0], 0, 57, wh); b.wall(west[-1], east[0], 0, 57, wh)
    plan = west + east
    b.cap(plan, 57.0, glr if False else gl)
    b.sweep(west, [(0.0, 56.2), (0.8, 56.2), (0.8, 58.2), (0.0, 58.2)], wh); b.sweep(east, [(0.0, 56.2), (0.8, 56.2), (0.8, 58.2), (0.0, 58.2)], wh)
    # ribbed keel: spine + transverse ribs arching over the roof
    b.box(-100, 100, 57.0, 60.0, zc - 3.0 - 0.9, zc - 3.0 + 0.9, wh)
    nr = b.d(26, 8)
    for i in range(nr):
        t = -0.94 + 1.88 * i / (nr - 1); x = 103.0 * t; zw = zc + hw(t) * 0.8; ze = zc - hw(t) * 1.2; zm = zc - 3.0
        b.beam((x, 57.6, zw), (x, 59.6, zm), 0.5, 0.7, wh); b.beam((x, 59.6, zm), (x, 57.6, ze), 0.5, 0.7, wh)
    if b.hi:
        for i in range(0, n + 1, 2):
            for (px, pz) in (west[i], east[n - i]): b.bx(px, pz, 0.7, 0.7, 0, 57, wh)
        for y in (19, 38): b.sweep(west, [(0.0, y - 0.3), (0.35, y - 0.3), (0.35, y + 0.3), (0.0, y + 0.3)], wh); b.sweep(east, [(0.0, y - 0.3), (0.35, y - 0.3), (0.35, y + 0.3), (0.0, y + 0.3)], wh)
    for sx in (-1, 1): avlight(b, sx * 100, 60.0, zc - 3.0, 0.8)
    # ---- the four cube halls
    x = -100.0
    for i, (w, d, h) in enumerate(((60, 50, 46), (42, 42, 42), (38, 38, 38), (32, 32, 34))):
        x0, x1 = x, x + w; z1 = 58.0; z0 = z1 - d; x += w + 8.67
        b.box(x0 + 1.5, x1 - 1.5, 0, 7.0, z0 + 1.5, z1 - 1.5, lob, notop=True)
        b.box(x0, x1, 7.0, h, z0, z1, cb, top=roofc, bot=True)
        b.box(x0 + 5, x1 - 5, h, h + 3.0, z0 + 5, z1 - 5, b.c(0xb0b4b4), top=roofc)
        if b.hi:
            for (p0, p1) in (((x0, z1), (x1, z1)), ((x1, z1), (x1, z0)), ((x1, z0), (x0, z0)), ((x0, z0), (x0, z1))):
                L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); pilasters(b, p0, p1, 7.0, h, int(L // 6) + 1, 0.35, 0.6, stl)
            for (cx_, cz_) in ((x0 + 0.6, z0 + 0.6), (x1 - 0.6, z0 + 0.6), (x1 - 0.6, z1 - 0.6), (x0 + 0.6, z1 - 0.6)): b.bx(cx_, cz_, 1.2, 1.2, 0, 7.0, wh)
            b.box(x0 + w * 0.3, x0 + w * 0.7, 6.0, 6.5, z1, z1 + 4.0, stl, bot=True)
            xm = (x0 + x1) / 2; t = xm / 103.0; zw = zc + hw(t) * 0.8
            b.box(xm - 2.2, xm + 2.2, 16.0, 19.0, zw, z0, lob if False else gl, bot=True); b.box(xm - 2.4, xm + 2.4, 15.6, 16.0, zw, z0, wh, bot=True)
    rng = np.random.RandomState(5)
    for i in range(b.d(14, 14)):
        tx = -92 + i * 14.0; t = tx / 103.0; b.hi and None
        tree(b, tx, zc + hw(t) * 0.8 + 6.5 + rng.rand() * 2, 11 + rng.rand() * 3, 3.6)


run()
