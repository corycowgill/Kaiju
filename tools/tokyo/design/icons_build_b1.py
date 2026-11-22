# icons_build_b1.py - Tokyo tier B: Imperial Palace Kyuden, Fujimi-yagura, Hie Shrine, Nihonbashi, Kachidoki Bridge, Odaiba Statue of Liberty.
# blender -b -P icons_build_b1.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


def p_copper(col=0x5c8a76, ribs=12):
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.12, 6)
        for i in range(ribs): x = (i + 0.5) / ribs; c.rect(x - 0.06 / ribs, 0, x + 0.06 / ribs, 1, None, 0.9, k=1.18); c.rect(x + 0.06 / ribs, 0, x + 0.16 / ribs, 1, None, 0.3, k=0.78)
        c.joints(2, 0, 0.9, 1.0); c.rect(0, 0, 1, 0.05, None, 0.8, k=1.2)
    return fn


# ------------------------------------------------------------------ Imperial Palace (Kyuden)
@model('imperial_palace_kyuden', tier='B', face='east', stone=0x5c8a76,
       desc="Imperial Palace Kyuden: the 160 m Chowaden reception hall along the East Court (+Z) with its long veranda colonnade, the Seiden state hall across the inner court, the Homeiden banquet hall (+X) and the Rensui / Chigusa wing (-X), linked by roofed corridors; low white-and-bronze walls under sweeping green copper hip-and-gable roofs with deep curved eaves, pines")
def kyuden(b):
    cu = b.band('copper', 64, p_copper(), bay=7.0); ridge = b.c(0x4a7262, 0.6, 0.3); under = b.cf(0xd8d2c0, 0.22); white = b.cf(0xdcd8cc, 0.25); bronze = b.c(0x4a4034, 0.5, 0.4); pav = b.c(0xa8a498); stone = b.c(0x9a968a); gold = b.c(0xc4a24a, 0.45, 0.7)
    def wall(c):
        c.rect(0, 0, 1, 1, 0xd8d2c2); c.noise(0.04, 5); c.litp = 0.65
        for i in range(4):
            c.rect(i / 4, 0, i / 4 + 0.025, 1, 0x4a4034); c.window(i / 4 + 0.045, 0.1, i / 4 + 0.23, 0.78, 0x4a4a44, 0x4a4034, mull=(4, 3), sill=False)
        c.rect(0, 0, 1, 0.08, 0x8a867c); c.rect(0, 0.84, 1, 1, 0x5a4a38); c.flood(0.22)
    wl = b.band('wall', 64, wall, bay=16.0); st = b.band('stone', 32, p_ashlar(0x9a968a, 3, 6), bay=8.0)
    b.cap(B.rect(-88, 88, -60, 66), 0.06, pav)
    def hall(cx, cz, w, d, hb, hr, ov=5.0, axis='x', plinth=1.2, cols=0, style='irimoya'):
        b.box(cx - w / 2 - 2, cx + w / 2 + 2, 0, plinth, cz - d / 2 - 2, cz + d / 2 + 2, st, top=stone)
        b.box(cx - w / 2, cx + w / 2, plinth, plinth + hb, cz - d / 2, cz + d / 2, wl, notop=True)
        jroof(b, cx, cz, w + 2 * ov, d + 2 * ov, plinth + hb, hr, cu, ridge, style=style, axis=axis, under=under, gable=white, up=hr * 0.16, orn=gold, th=0.5)
        if cols and b.hi:
            if axis == 'x':
                for i in range(cols): b.bx(cx - w / 2 - 1.2 + i * (w + 2.4) / (cols - 1), cz + d / 2 + 1.6, 0.55, 0.55, plinth, hb, bronze)
            else:
                for i in range(cols): b.bx(cx - w / 2 - 1.6, cz - d / 2 - 1.2 + i * (d + 2.4) / (cols - 1), 0.55, 0.55, plinth, hb, bronze)
    hall(0, 48, 156, 15, 7.5, 7.5, cols=27)                       # Chowaden
    hall(0, -30, 44, 26, 9.5, 11.0, ov=6.5, plinth=2.4, cols=9)   # Seiden
    hall(56, -24, 40, 46, 8.0, 9.5, axis='z', cols=9)             # Homeiden
    hall(-58, -14, 34, 30, 7.0, 8.0, cols=7)                      # Rensui
    hall(-56, -46, 26, 16, 6.0, 6.0)                              # Chigusa / Chidori
    for (x0, x1, z0, z1, ax) in ((-74, -68, 6, 40, 'z'), (68, 74, 2, 40, 'z'), (-38, -26, -32, -26, 'x'), (26, 34, -32, -26, 'x')):   # corridors
        b.box(x0, x1, 0, 5.0, z0, z1, wl, notop=True); jroof(b, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 4, z1 - z0 + 4 if ax == 'z' else z1 - z0 + 4, 5.0, 3.4, cu, ridge, style='gable', axis=ax, under=under, gable=white, up=0.3)
    b.box(-10, 10, 0, 2.4, -17, -12, stone)
    for k in range(b.d(4, 2)): b.box(-9, 9, 0, 2.4 - 0.6 * k * b.d(1, 2), -12 + 1.0 * k * b.d(1, 2), -11 + 1.0 * k * b.d(1, 2) + b.d(0, 1), stone)
    rng = np.random.RandomState(2)
    for (x, z) in ((-40, 20), (40, 18), (-20, 8), (22, 4), (-84, 56), (84, 58), (-82, -56), (82, -56), (0, 10), (-48, -2), (30, -52), (-28, -54)):
        pine(b, x, z, 7 + rng.rand() * 4, 3 + rng.rand() * 1.5, lean=rng.rand() * 1.6 - 0.8)
    if b.hi:
        for x in (-30, 30): stone_lantern(b, x, 30, 3.0)
        b.cyl(0, 22, 3.0, 0, 0.6, 12, stone); b.cyl(0, 22, 1.2, 0.6, 1.4, 8, bronze)


# ------------------------------------------------------------------ Fujimi-yagura
@model('fujimi_yagura', tier='B', face='south', stone=0x8e8a80,
       desc="Fujimi-yagura: three-tier white Edo keep with curved tiled roofs and small gables on a 15 m battered stone base (concave ishigaki), plastered parapet walls running off along the rampart, pines")
def fujimi_yagura(b):
    st = b.tile(p_stone(), 256, 256, 6.0, 6.0); grass = b.c(0x56683c); white = b.cf(0xdcd8cc, 0.32); ridge = b.c(0x3a3e42); under = b.cf(0xcfcbbf, 0.22); stc = b.c(0x8a867c); orn = b.c(0x5a6a5c, 0.5, 0.5); dk = b.c(0x2e2c2a)
    kw = b.band('kawara', 64, p_kawara(0x474c52, 10, 3), bay=4.0); sh = b.band('shiro', 32, p_shiro, bay=10.0)
    ishigaki(b, -26, 26, -16, 6, 0, 11.0, st, 0.3, top=grass)
    ishigaki(b, -9.5, 9.5, -8.5, 8.5, 0, 15.0, st, 0.34, top=stc)
    y = 15.0
    for i, (w, d, h, hr) in enumerate(((16.5, 14.5, 4.2, 3.4), (13.0, 11.0, 3.8, 3.2), (9.6, 8.0, 3.6, 5.2))):
        b.box(-w / 2, w / 2, y, y + h, -d / 2, d / 2, sh, notop=True)
        if b.hi:
            for sx in (-1, 1):
                for sz in (-1, 1): b.bx(sx * (w / 2 - 0.1), sz * (d / 2 - 0.1), 0.5, 0.5, y, h, white)
        jroof(b, 0, 0, w + 4.6, d + 4.6, y + h, hr, kw, ridge, style='hip' if i < 2 else 'irimoya', under=under, gable=white, up=0.9, orn=orn if i == 2 else None)
        if i == 0:   # the kara-hafu on the first roof, front and the small triangular gables on the sides
            karahafu(b, 0, d / 2 + 0.3, d / 2 + 2.9, 6.5, y + h - 0.2, 1.9, kw, white, ridge, th=0.3, under=under)
        if i == 1:
            for sx in (-1, 1):
                s = b.sub(); jroof(s, 0, 0, 5.0, 4.4, 0, 2.2, kw, ridge, style='gable', axis='z', under=under, gable=white, up=0.2); b.add(s, t=(sx * (w / 2 + 0.6), y + h + 0.3, 0), ry=90 * sx)
        y += h + (1.3 if i < 2 else hr)
    for sx in (-1, 1):   # parapet walls along the rampart
        x0, x1 = (9.5, 26) if sx > 0 else (-26, -9.5)
        b.box(x0, x1, 11.0, 13.4, 4.6, 5.4, white); b.box(x0, x1, 13.3, 13.4, 4.1, 5.9, white, bot=True); b.gable(x0, x1, 4.1, 5.9, 13.4, 0.7, kw, white, axis='x')
    rng = np.random.RandomState(6)
    for (x, z) in ((-21, -6), (-15, -11), (17, -9), (22, -3), (-23, 1), (14, -13)): pine(b, x, z, 7 + rng.rand() * 4, 2.6 + rng.rand() * 1.4, lean=rng.rand() * 1.6 - 0.8, yb=11.0)


# ------------------------------------------------------------------ Hie Shrine
@model('hie_shrine', tier='B', face='east', stone=0xa83a26,
       desc="Hie Shrine: the vermilion Sanno torii with its triangular gable at the head of the stone steps (+Z), the two-storey Shinmon gate, the roofed cloister round the gravel court, the worship hall (haiden) with its stepped porch and the main sanctuary (honden) behind, all white-walled and vermilion-posted under green copper roofs; lanterns, trees")
def hie_shrine(b):
    VM = 0xb23c26; verm = b.cf(VM, 0.26); white = b.cf(0xdcd8cc, 0.24); ridge = b.c(0x4a7262, 0.6, 0.3); under = b.cf(mul(VM, 0.85), 0.2); stone = b.c(0x9a968a); stone2 = b.c(0x86837a); gravel = b.c(0xaaa698); gold = b.c(0xc4a24a, 0.45, 0.7, emit=(0.25, 0.2, 0.08)); wood = b.c(0x4a3226)
    cu = b.band('copper', 64, p_copper(0x5a8872, 12), bay=5.0); st = b.band('stone', 32, p_ashlar(0x98948a, 4, 6), bay=8.0)
    def wall(c):
        c.rect(0, 0, 1, 1, 0xdcd8cc); c.noise(0.04, 5)
        for i in range(4):
            c.rect(i / 4, 0, i / 4 + 0.03, 1, VM); c.rect(i / 4 + 0.07, 0.25, i / 4 + 0.2, 0.7, 0x2e5a48); c.rect(i / 4 + 0.085, 0.29, i / 4 + 0.185, 0.66, 0x3a3028, e=(0.7, 0.5, 0.22) if i % 2 == 0 else None)
        c.rect(0, 0.84, 1, 1, VM); c.rect(0, 0.0, 1, 0.1, VM); c.rect(0, 0.47, 1, 0.5, VM); c.flood(0.24)
    wl = b.band('wall', 32, wall, bay=8.0)
    def front(c):
        c.rect(0, 0, 1, 1, VM)
        for i in range(4):
            c.rect(i / 4 + 0.03, 0.06, i / 4 + 0.22, 0.8, 0x3a2c22, e=(0.8, 0.55, 0.25))
            for k in range(1, 6): c.rect(i / 4 + 0.03 + k * 0.032 - 0.004, 0.06, i / 4 + 0.03 + k * 0.032 + 0.004, 0.8, 0x6a2a1c)
            c.rect(i / 4 + 0.03, 0.42, i / 4 + 0.22, 0.45, 0x6a2a1c)
        c.rect(0, 0.86, 1, 1, 0xdcd8cc)
    fr = b.band('front', 32, front, bay=8.0)
    b.cap(B.rect(-34, 34, -44, 30), 3.0, gravel); b.box(-34, 34, 0, 3.0, -44, 30, st, top=None)
    ns = b.d(8, 3)
    for k in range(ns): b.box(-7, 7, 0, 3.0 * (ns - k) / ns - 0.001, 30 + 12.0 * k / ns, 30 + 12.0 * (k + 1) / ns, stone2)
    for sx in (-1, 1): b.box(sx * 7 if sx > 0 else -8.2, 8.2 if sx > 0 else -7, 0, 3.6, 30, 42, stone)
    torii(b, 0, 46, 9.0, 10.5, verm, sanno=True, black=b.c(0x2a2a2a))
    Y = 3.0
    # shinmon gate
    g = b.sub()
    for i in range(4):
        for z in (-2.6, 2.6): g.cyl(-6 + i * 4, z, 0.4, 0, 5.2, s_ := g.d(8, 5), verm, cap=False)
    for sx in (-1, 1): g.box(min(sx * 2, sx * 6), max(sx * 2, sx * 6), 0, 5.2, -0.2, 0.2, white, notop=True)
    g.box(-6.6, 6.6, 4.8, 5.8, -3.2, 3.2, verm, bot=True)
    jroof(g, 0, 0, 18, 11.5, 5.8, 2.8, cu, ridge, style='hip', under=under, up=0.6)
    g.box(-5.4, 5.4, 6.8, 9.4, -2.2, 2.2, wl, notop=True)
    jroof(g, 0, 0, 16, 9.5, 9.4, 4.6, cu, ridge, style='irimoya', under=under, gable=white, up=0.8, orn=gold)
    for x in (-2, 2): lantern(g, x, 3.6, 2.9, 0.4, 0.9)
    b.add(g, t=(0, Y, 24))
    # cloister
    for (x0, x1, z0, z1, ax) in ((-30, -8.5, 21.5, 26.5, 'x'), (8.5, 30, 21.5, 26.5, 'x'), (-30, -25, -16, 21.5, 'z'), (25, 30, -16, 21.5, 'z')):
        b.box(x0, x1, Y, Y + 3.6, z0, z1, wl, notop=True)
        jroof(b, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 2.4, z1 - z0 + 2.4, Y + 3.6, 2.4, cu, ridge, style='gable', axis=ax, under=under, gable=white, up=0.25)
    # haiden + heiden + honden
    b.box(-11, 11, Y, Y + 1.0, -16, -1, st, top=stone)
    b.box(-9.5, 9.5, Y + 1.0, Y + 6.0, -14, -4, wl, f=F(fr, rep=2), notop=True)
    jroof(b, 0, -9, 26, 17, Y + 6.0, 7.0, cu, ridge, style='irimoya', under=under, gable=white, up=1.1, orn=gold)
    jroof(b, 0, 0.5, 9, 9, Y + 5.0, 2.6, cu, ridge, style='gable', axis='z', under=under, gable=white, up=0.3)
    for x in (-3.6, 3.6): b.bx(x, 4.2, 0.45, 0.45, Y, 5.0, verm)
    for k in range(3): b.box(-4, 4, Y, Y + 1.0 - 0.33 * k, -1 + 0.6 * k, -0.4 + 0.6 * k, stone2)
    b.box(-4, 4, Y, Y + 4.4, -24, -14, wl, notop=True); jroof(b, 0, -19, 11, 12, Y + 4.4, 2.6, cu, ridge, style='gable', axis='z', under=under, gable=white, up=0.2)
    b.box(-7, 7, Y, Y + 1.8, -38, -24, st, top=stone); b.box(-5.5, 5.5, Y + 1.8, Y + 6.6, -36, -26, wl, notop=True)
    jroof(b, 0, -31, 17, 16, Y + 6.6, 6.2, cu, ridge, style='irimoya', under=under, gable=white, up=1.0, orn=gold)
    if b.hi:
        for x in (-11, 11):
            for z in (2, 12): stone_lantern(b, x, z, 2.4)
        for (x0, x1, z) in ((-30, -8.5, 26.5), (8.5, 30, 26.5)):
            for i in range(6): b.bx(x0 + 0.4 + i * (x1 - x0 - 0.8) / 5, z + 0.15, 0.4, 0.4, Y, 3.6, verm)
        for i in range(6): lantern(b, -7.5 + i * 3, Y + 5.0, -3.6, 0.3, 0.7, WARM)
    rng = np.random.RandomState(9)
    for (x, z) in ((-18, 8), (18, 10), (-20, -30), (20, -32), (-31, -40), (31, -40), (-16, 36), (16, 37), (-26, 40), (27, 39)):
        tree(b, x, z, 10 + rng.rand() * 5, 3.5 + rng.rand(), 0x34543a if rng.rand() < 0.6 else 0x46643e, yb=Y if z < 30 else 0)


# ------------------------------------------------------------------ Nihonbashi
@model('nihonbashi_bridge', tier='B', face='south', stone=0x9c988c, water=True, waterline=True,
       desc="Nihonbashi: the 1911 double-arched granite bridge, X along it (49 m, 27 m wide): cutwater pier, balustrade parapets, the four end pillars with seated lions, the two centre lamp pillars with winged kirin, bronze lamp standards with lit globes, tram-era roadway; y 0 = water level")
def nihonbashi_bridge(b):
    st = b.tile(p_stone(0x9a968a), 256, 256, 5.0, 5.0); stc = b.cf(0x9c988c, 0.2); stc2 = b.c(0x7c7970); road = b.c(0x46484a); walk = b.c(0x9a9890); bronze = b.c(0x3e4a40, 0.45, 0.6); globe = b.glow(WARM, 1.0, 0xe8dcc0)
    L, W = 24.5, 27.0
    arch_bridge(b, -L, L, 0, W, 2, 0, 0.9, 3.4, 5.2, st, stc2, pier=0.15, deck=road, cutwater=stc)
    for sz in (-1, 1):
        z = sz * (W / 2 - 0.4)
        b.box(-L, L, 5.2, 5.5, sz * W / 2 - (4.6 if sz > 0 else 0), sz * W / 2 + (0 if sz > 0 else 4.6), walk)
        b.box(-L - 3, L + 3, 4.9, 5.2, z - 0.7, z + 0.7, stc, bot=True, notop=True)
        b.box(-L, L, 6.3, 6.6, z - 0.35, z + 0.35, stc, bot=True); b.box(-L, L, 5.5, 5.75, z - 0.35, z + 0.35, stc)
        if b.hi:
            for i in range(41):
                x = -L + 1.2 + i * (2 * L - 2.4) / 40
                if i % 8 == 0: b.bx(x, z, 0.9, 0.9, 5.5, 1.5, stc)
                else: b.bx(x, z, 0.3, 0.3, 5.75, 0.55, stc)
        else: b.box(-L, L, 5.75, 6.3, z - 0.2, z + 0.2, stc)
        for sx in (-1, 1):   # end pillar + lion, lamp
            x = sx * (L + 1.2)
            b.bx(x, z, 2.6, 2.6, 0 if not b.hi else 0, 7.4, st, top=stc)
            b.bx(x, z, 3.0, 3.0, 7.4, 0.5, stc)
            s = b.sub()   # seated lion with a shield
            s.lathe(0, 0, s.d([(0.0, 0), (0.75, 0.1), (0.8, 0.9), (0.55, 1.7), (0.35, 2.0)], [(0.0, 0), (0.8, 0.5), (0.35, 2.0)]), s.d(8, 4), bronze, sq=1.3)
            s.lathe(0, 0.5, [(0.0, 1.6), (0.55, 1.9), (0.6, 2.4), (0.3, 2.8), (0.0, 2.85)], s.d(8, 4), bronze)
            if s.hi:
                s.bx(0, 1.05, 0.5, 0.4, 1.9, 0.4, bronze); s.box(-0.35, 0.35, 0.2, 1.2, 0.9, 1.05, bronze)
                for dx in (-0.4, 0.4): s.bx(dx, 0.85, 0.28, 0.5, 0, 1.3, bronze)
            b.add(s, t=(x, 7.9, z), ry=90 * sx)
            b.cyl(sx * 12.5, z, 0.16, 6.6, 9.6, 6, bronze, cap=False)
            for (dx, dz) in ((0.5, 0), (-0.5, 0)): b.lathe(sx * 12.5 + dx, z + dz, [(0, 9.0), (0.3, 9.3), (0.3, 9.6), (0, 9.9)], b.d(6, 4), globe, smooth=False)
            b.bx(sx * 12.5, z, 0.9, 0.9, 5.5, 1.4, stc)
        # centre pillar: obelisk lamp standard with kirin
        b.bx(0, z, 2.4, 2.4, 5.2, 2.6, st, top=stc); b.bx(0, z, 1.5, 1.5, 7.8, 3.4, bronze)
        b.frust((-0.75, 0.75, z - 0.75, z + 0.75), (-0.3, 0.3, z - 0.3, z + 0.3), 11.2, 13.4, bronze, top=bronze)
        b.lathe(0, z, [(0, 13.4), (0.55, 13.9), (0.55, 14.5), (0, 15.0)], b.d(8, 4), globe)
        for sx in (-1, 1):
            if b.hi:
                for dz in (-1.0, 1.0): b.lathe(sx * 0.9, z + dz, [(0, 10.6), (0.36, 10.95), (0.36, 11.3), (0, 11.65)], 6, globe, smooth=False); b.beam((0, 10.4, z), (sx * 0.9, 10.5, z + dz), 0.12, 0.12, bronze)
            k = b.sub()   # kirin: body, neck + head, raised wing
            k.lathe(0, 0, k.d([(0.0, 0.0), (0.6, 0.15), (0.62, 0.9), (0.4, 1.3)], [(0.0, 0), (0.62, 0.5), (0.4, 1.3)]), k.d(8, 4), bronze, sq=1.5)
            k.tube((0, 1.1, 0.5), (0, 2.1, 1.0), 0.3, bronze, seg=k.d(6, 4), r1=0.22); k.bx(0, 1.2, 0.4, 0.7, 2.0, 0.4, bronze)
            for dx in (-1, 1): k.face([(dx * 0.4, 0.9, 0.1), (dx * 1.5, 2.3, -0.6), (dx * 0.5, 1.5, -0.7)], bronze); k.face([(dx * 0.4, 0.9, 0.1), (dx * 1.3, 1.6, -0.9), (dx * 1.5, 2.3, -0.6)], bronze)
            b.add(k, t=(sx * 1.9, 7.8, z), ry=90 * sx)
            b.bx(sx * 1.9, z, 1.6, 1.8, 5.2, 2.6, st, top=stc)
    if b.hi:
        for z in (-0.75, 0.75): b.box(-L, L, 5.2, 5.24, z - 0.07, z + 0.07, b.c(0x8a8c8e, 0.4, 0.8))
        b.cyl(0, 0, 0.5, 5.2, 5.26, 8, b.c(0xb89a50, 0.5, 0.7))


# ------------------------------------------------------------------ Kachidoki Bridge
@model('kachidoki_bridge', tier='B', face='south', stone=0x9aa6a2, water=True, waterline=True,
       close=((-40, 14, 70), (-30, 12, 0), 28),
       desc="Kachidoki Bridge: 1940 double-leaf bascule over the Sumida, X along it (246 m, 22 m wide): the two-leaf plate-girder centre span between granite piers with four control towers, a steel tied-arch span either side (twin ribs, hangers, lateral bracing), abutments, lamp standards; pale grey-green steel floodlit at dusk; y 0 = water level")
def kachidoki_bridge(b):
    SG = 0xa2aeaa; steel = b.cf(SG, 0.34, tint=0xd8ffe8); steel2 = b.cf(mul(SG, 0.85), 0.26, tint=0xd8ffe8); gran = b.cf(0xa8a498, 0.16); gran2 = b.c(0x8a877e); road = b.c(0x46484a); walk = b.c(0x9a9890); lamp = b.glow(0xffe2b0, 1.0, 0xd8d0c0); dk = b.c(0x2c2e30)
    st = b.band('stone', 48, fl(p_ashlar(0xa8a498, 6, 6), 0.16), bay=8.0)
    tw = b.band('tower', 48, fl(p_grid(0xb0ac9e, 2, 1, wx=(0.3, 0.7), wy=(0.5, 0.86), rows=6, cols=3, lit=0.8, mull=(2, 2)), 0.18), bay=5.0)
    XP, XA, XE = 22.0, 110.0, 123.0; YD = 8.0; ZW = 11.0; ZR = 8.6
    # deck
    b.box(-XE, XE, YD - 0.5, YD, -ZR + 0.6, ZR - 0.6, road, bot=True)
    for sz in (-1, 1):
        b.box(-XE, XE, YD - 0.4, YD + 0.2, min(sz * (ZR + 0.5), sz * ZW), max(sz * (ZR + 0.5), sz * ZW), walk, bot=True)
        b.box(-XE, XE, YD + 0.2, YD + 1.3, sz * ZW - 0.12, sz * ZW + 0.12, steel2)
    # piers, towers, abutments
    for sx in (-1, 1):
        b.prism([(sx * XP - 7, 12), (sx * XP - 5, 16), (sx * XP + 5, 16), (sx * XP + 7, 12), (sx * XP + 7, -12), (sx * XP + 5, -16), (sx * XP - 5, -16), (sx * XP - 7, -12)], 0, YD - 0.5, st, top=gran2)
        for sz in (-1, 1):
            xt, zt = sx * XP, sz * 13.4
            b.box(xt - 2.6, xt + 2.6, YD - 0.5, YD + 5.6, zt - 2.4, zt + 2.4, F(tw, rep=1), top=gran2)
            b.box(xt - 3.0, xt + 3.0, YD + 5.6, YD + 6.1, zt - 2.8, zt + 2.8, gran, bot=True); b.frust((xt - 2.8, xt + 2.8, zt - 2.6, zt + 2.6), (xt - 1.4, xt + 1.4, zt - 1.2, zt + 1.2), YD + 6.1, YD + 7.3, b.c(0x5a6a62, 0.6, 0.3), top=gran2)
            if b.hi: b.tube((xt, YD + 7.3, zt), (xt, YD + 10.3, zt), 0.1, dk, seg=4); b.lathe(xt, zt, [(0, YD + 10.2), (0.35, YD + 10.5), (0, YD + 11.0)], 6, lamp)
        b.box(sx * XA if sx > 0 else -XE, XE if sx > 0 else -XA, 0, YD - 0.5, -ZW - 1, ZW + 1, st, top=gran2)
        b.bx(sx * (XA - 1.5), 0, 3.0, 26, 0, YD - 0.5, st, top=gran2)
        # bascule leaf: haunched plate girders
        n = b.d(6, 2)
        for sz in (-1, 1):
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n; xa, xb = sx * (XP - 5) * (1 - t0), sx * (XP - 5) * (1 - t1); da, db = 3.6 - 2.2 * t0 ** 0.7, 3.6 - 2.2 * t1 ** 0.7
                q = [(xa, YD - 0.5 - da, sz * ZR), (xb, YD - 0.5 - db, sz * ZR), (xb, YD - 0.5, sz * ZR), (xa, YD - 0.5, sz * ZR)]
                b.face(q, steel); b.face([(x, y, z - sz * 0.5) for (x, y, z) in q], steel2)
        # tied arch span
        x0, x1 = sx * (XP + 7), sx * XA; na = b.d(12, 5); H = 14.5
        for sz in (-1, 1):
            z = sz * ZR
            pts = [(x0 + (x1 - x0) * i / na, YD + 0.4 + H * 4 * (i / na) * (1 - i / na)) for i in range(na + 1)]
            for i in range(na): b.beam((pts[i][0], pts[i][1], z), (pts[i + 1][0], pts[i + 1][1], z), 1.0, 1.5, steel)
            b.box(min(x0, x1), max(x0, x1), YD - 2.6, YD + 0.4, z - 0.5, z + 0.5, steel, bot=True)
            if b.hi:
                for i in range(1, na): b.bx(pts[i][0], z, 0.28, 0.28, YD + 0.4, pts[i][1] - YD - 1.0, steel2)
        if b.hi:
            for i in range(3, na - 2):
                x = x0 + (x1 - x0) * i / na; y = YD + 0.4 + H * 4 * (i / na) * (1 - i / na)
                b.beam((x, y, -ZR), (x, y, ZR), 0.5, 0.6, steel2)
                if i < na - 3:
                    xn = x0 + (x1 - x0) * (i + 1) / na; yn = YD + 0.4 + H * 4 * ((i + 1) / na) * (1 - (i + 1) / na)
                    b.beam((x, y, -ZR), (xn, yn, ZR), 0.3, 0.3, steel2); b.beam((x, y, ZR), (xn, yn, -ZR), 0.3, 0.3, steel2)
            for i in range(9):
                x = x0 + (x1 - x0) * (i + 0.5) / 9; b.box(x - 0.3, x + 0.3, YD - 2.0, YD - 0.5, -ZR, ZR, steel2, bot=True, notop=True)
            for i in range(5):
                for sz in (-1, 1):
                    x = sx * (XP + 14 + i * 19); b.cyl(x, sz * (ZW - 0.5), 0.12, YD + 0.2, YD + 6.5, 5, dk, cap=False); b.lathe(x, sz * (ZW - 0.5), [(0, YD + 6.4), (0.32, YD + 6.7), (0.32, YD + 7.0), (0, YD + 7.3)], 5, lamp, smooth=False)
        else:
            for sz in (-1, 1): b.bx((x0 + x1) / 2, sz * (ZW - 0.5), 0.4, 0.4, YD + 0.2, 7.1, dk)


# ------------------------------------------------------------------ Odaiba Statue of Liberty
@model('odaiba_statue_of_liberty', tier='B', face='north', stone=0x7ab09c,
       desc="Odaiba Statue of Liberty: the verdigris replica on its stepped stone pedestal, robed figure with the raised torch (lit flame), tablet and rayed crown, on a round terrace with railing posts and floodlights")
def odaiba_statue_of_liberty(b):
    G = 0x74ac98; gr = b.cf(G, 0.34, tint=0xe0fff0); gr2 = b.cf(mul(G, 0.82), 0.28, tint=0xe0fff0); stone = b.cf(0xb8b2a2, 0.3); stone2 = b.cf(0x9c978a, 0.24); flame = b.glow(0xffb040, 1.0, 0xe8c060); pav = b.c(0x9a968c); lampc = b.glow(WHITEL, 0.9, 0xd0d0c8); dk = b.c(0x3a3c3e)
    n = b.d(16, 7)
    b.cyl(0, 0, 6.0, 0, 0.35, n, pav)
    b.box(-2.6, 2.6, 0.35, 0.9, -2.6, 2.6, stone2); b.box(-2.2, 2.2, 0.9, 1.5, -2.2, 2.2, stone)
    b.frust((-1.9, 1.9, -1.9, 1.9), (-1.5, 1.5, -1.5, 1.5), 1.5, 4.3, stone); b.box(-1.8, 1.8, 4.3, 4.7, -1.8, 1.8, stone2, bot=True); b.box(-1.45, 1.45, 4.7, 5.2, -1.45, 1.45, stone)
    if b.hi:
        for k in range(4):
            s = b.sub(); s.box(-0.8, 0.8, 1.9, 3.9, 1.62, 1.82, stone2); s.box(-1.0, 1.0, 3.9, 4.1, 1.5, 1.9, stone2); b.add(s, ry=90 * k)
        for k in range(12):
            a = 2 * math.pi * k / 12; b.bx(5.6 * math.sin(a), 5.6 * math.cos(a), 0.18, 0.18, 0.35, 0.9, dk)
            if k % 3 == 0: b.bx(4.2 * math.sin(a + 0.4), 4.2 * math.cos(a + 0.4), 0.4, 0.4, 0.35, 0.3, lampc)
    Y = 5.2; seg = b.d(12, 6)
    # robe: flared hem, waist, shoulders
    b.lathe(0, 0, b.d([(0.95, Y), (0.92, Y + 0.6), (0.8, Y + 1.6), (0.7, Y + 2.6), (0.66, Y + 3.3), (0.72, Y + 3.9), (0.62, Y + 4.25), (0.3, Y + 4.45)], [(0.95, Y), (0.75, Y + 2.0), (0.7, Y + 3.9), (0.3, Y + 4.45)]), seg, gr, sq=0.8, capb=gr2)
    if b.hi:
        for k in range(8):   # drapery folds
            a = math.radians(-70 + 20 * k); b.beam((0.92 * math.sin(a), Y + 0.1, 0.74 * math.cos(a)), (0.7 * math.sin(a * 0.8), Y + 3.2, 0.57 * math.cos(a * 0.8)), 0.12, 0.1, gr2)
        b.beam((-0.7, Y + 3.9, 0.3), (0.55, Y + 2.3, 0.5), 0.5, 0.14, gr2)
    b.lathe(0, 0, [(0.2, Y + 4.4), (0.22, Y + 4.7)], b.d(8, 5), gr)                                    # neck
    b.lathe(0, 0.03, b.d([(0.18, Y + 4.65), (0.3, Y + 4.85), (0.31, Y + 5.1), (0.22, Y + 5.3), (0.0, Y + 5.36)], [(0.2, Y + 4.65), (0.31, Y + 5.0), (0.0, Y + 5.36)]), b.d(10, 5), gr, sq=1.1)
    b.lathe(0, 0, [(0.34, Y + 5.1), (0.36, Y + 5.22), (0.3, Y + 5.3)], b.d(10, 5), gr2)              # diadem
    for k in range(7):
        a = math.radians(-78 + 26 * k); b.tube((0.3 * math.sin(a), Y + 5.24, 0.3 * math.cos(a) * 0.4 + 0.05), (0.78 * math.sin(a), Y + 5.3 + 0.5 * math.cos(a), 0.2), 0.05, gr, seg=3, r1=0.005)
    # raised right arm (-X side seen from the front is the statue's right) with the torch
    b.tube((-0.55, Y + 4.1, 0.0), (-0.85, Y + 5.3, 0.1), 0.2, gr, seg=b.d(8, 4), r1=0.15); b.tube((-0.85, Y + 5.3, 0.1), (-0.9, Y + 6.3, 0.1), 0.15, gr, seg=b.d(8, 4), r1=0.11)
    b.lathe(-0.9, 0.1, [(0.07, Y + 6.3), (0.09, Y + 6.7), (0.26, Y + 6.8), (0.26, Y + 6.88), (0.12, Y + 6.9)], b.d(8, 4), gr2)
    b.lathe(-0.9, 0.1, [(0.12, Y + 6.9), (0.19, Y + 7.1), (0.1, Y + 7.4), (0.0, Y + 7.75)], b.d(8, 4), flame)
    # left arm cradling the tablet
    b.tube((0.55, Y + 4.05, 0.05), (0.75, Y + 3.2, 0.3), 0.19, gr, seg=b.d(8, 4), r1=0.15); b.tube((0.75, Y + 3.2, 0.3), (0.45, Y + 3.0, 0.6), 0.15, gr, seg=b.d(8, 4), r1=0.12)
    s = b.sub(); s.box(-0.22, 0.22, 0, 0.85, -0.05, 0.05, gr2, bot=True); b.add(s, t=(0.62, Y + 2.95, 0.52), ry=-25, rx=-12)


run()
