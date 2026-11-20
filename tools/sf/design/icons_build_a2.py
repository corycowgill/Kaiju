# icons_build_a2.py - tier A: Oracle Park, Pier 39, Ghirardelli Square, Salesforce Transit Center.
# blender -b -P icons_build_a2.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


# ------------------------------------------------------------------ Oracle Park
# model frame: front +Z = King St (north-west); home plate toward (+X, +Z) = the Third & King corner;
# third-base stands along +Z, first-base stands along +X, the cove wall and arcade along -Z, bleachers / scoreboard -X.
@model('oracle_park', tier='A', fit=(213.0, 60.0, 191.5), face='north', stone=0x9a5a44,
       close=((-40, 55, 60), (-30, 8, -40), 28),
       desc="Oracle Park: brick ballpark, three-deck stands round the infield (third-base side on +Z, first-base on +X), brick entry towers at the home-plate corner, 24 ft right-field brick wall with the cove arcade on -Z, bleachers, scoreboard, glove and bottle on -X, four light towers, green field with the diamond")
def oracle_park(b):
    BR = 0x9a5440
    brick = b.c(BR); brick2 = b.c(mul(BR, 0.85)); green = b.c(0x24503c); dgreen = b.c(0x1e4032); conc = b.c(0xa8a49a); conc2 = b.c(0x8c8a84); dark = b.c(0x30343a)
    grass = b.c(0x4e7c3c); grass2 = b.c(0x5a8a44); dirt = b.c(0x9a7250); white = b.c(0xd6d4cc); steel = b.c(0x5a6058, 0.6, 0.4); glass = b.c(0x3c4a54, 0.3)
    tan = b.c(0xa87a4a); bottle = b.c(0x3d6a48, 0.35); label = b.c(0xb8b4a8); cream = b.c(0xcfc8b0); pav = b.c(0x8f8d86)

    def brick_arch(c):
        c.brick(14, 8, BR, 0xa89a8a, 0.12); c.rect(0, 0.86, 1, 1, 0xb7ab98, 0.8); c.rect(0, 0, 1, 0.08, 0x8a8478, 0.7)
        c.arch(0.2, 0.08, 0.8, 0.5, 0xb7ab98, 0.75); c.arch(0.24, 0.08, 0.76, 0.5, 0x2c3034, 0.2)
        for x in (0.37, 0.5, 0.63): c.rect(x - 0.008, 0.08, x + 0.008, 0.75, 0x24503c, 0.4)
        c.rect(0.24, 0.5, 0.76, 0.52, 0x24503c, 0.4)
    def brick_win(c):
        c.brick(22, 8, BR, 0xa89a8a, 0.12); c.rect(0, 0.95, 1, 1, 0xb7ab98, 0.8)
        for (y0_, y1_) in ((0.08, 0.4), (0.52, 0.86)):
            for x in (0.14, 0.56): c.window(x, y0_, x + 0.3, y1_, 0x343c42, 0x24503c, arch=True, mull=(2, 3), surround=0xb7ab98, sw=0.02)
    def seats(c):
        c.rect(0, 0, 1, 1, 0x22483a); c.noise(0.15, 8)
        for j in range(8): c.rect(0, j / 8, 1, j / 8 + 0.03, 0x6a6e68, 0.7); c.rect(0, j / 8 + 0.03, 1, j / 8 + 0.06, 0x1a3028, 0.3)
        c.rect(0.0, 0, 0.06, 1, 0x8a8c86, 0.6)
        for i in range(18): c.rect(0.08 + i * 0.05, 0, 0.085 + i * 0.05, 1, None, None, k=0.82)
    def plainb(c): c.brick(8, 8, BR, 0xa89a8a, 0.12); c.rect(0, 0, 1, 0.3, 0x24503c, 0.6); c.rect(0, 0.9, 1, 1, 0xb7ab98, 0.8)
    def lights(c):
        c.rect(0, 0, 1, 1, 0x4a4e52)
        for j in range(4):
            for i in range(10): c.ell((i + 0.5) / 10, (j + 0.5) / 4, 0.032, None, 0xd8d6c8)
    def board(c):
        c.rect(0, 0, 1, 1, 0x2a3038); c.rect(0.03, 0.2, 0.97, 0.94, 0x26364e); c.rect(0.3, 0.3, 0.7, 0.9, 0x34507a)
        for i in range(9): c.rect(0.05, 0.3 + i * 0.065, 0.27, 0.34 + i * 0.065, 0x9aa08a)
        for i in range(4): c.rect(0.74, 0.34 + i * 0.14, 0.95, 0.44 + i * 0.14, [0x8a4a3a, 0x3a6a8a, 0x9a8a4a, 0x4a7a5a][i])
        for i in range(5): c.rect(0.04 + i * 0.19, 0.03, 0.2 + i * 0.19, 0.16, [0x9a8a4a, 0x8a4a3a, 0xa8a8a0, 0x3a6a8a, 0x4a7a5a][i])
    arch_s = b.band('brick_arch', 128, brick_arch, bay=9.0); win_s = b.band('brick_win', 128, brick_win, bay=9.0); plain_s = b.band('plainb', 64, plainb, bay=8.0)
    seat_t = b.tile(seats, 256, 256, 12.0, 7.0)
    light_d = b.decal('lights', 64, 32, lights); board_d = b.decal('board', 128, 64, board); clock_d = b.decal('clock', 32, 32, p_clock(0xd6d0bc, 0x2a2a2c, 0x24503c, BR))

    XS, ZS = 106.5, 95.75
    H = (32.5, 24.75)
    b.cap(B.rect(-XS, XS, -ZS, ZS), 0.04, pav)
    # ---- field
    wall = [(H[0], -69.25), (-30, -69.25), (-53.5, -61.25), (-70.5, -35), (-70.5, H[1])]
    field = [(H[0] + 6, H[1] + 6)] + [(H[0] + 6, -69.25)] + wall[1:4] + [(-70.5, H[1] + 6)]
    b.cap(field, 0.10, dirt)
    inner = [(H[0], H[1])] + [(H[0], -65.5), (-29, -65.5), (-50.5, -58.5), (-66.5, -34), (-66.5, H[1])]
    b.cap(inner, 0.14, grass)
    n = b.d(10, 5)   # infield dirt quarter disc, the grass square, mound, plate circle
    b.face([(H[0], 0.18, H[1])] + [(H[0] - 44 * math.sin(math.radians(90 * i / n)), 0.18, H[1] - 44 * math.cos(math.radians(90 * i / n))) for i in range(n + 1)][::-1], dirt)
    b.cap(B.rect(H[0] - 25.5, H[0] - 2.5, H[1] - 25.5, H[1] - 2.5), 0.22, grass2)
    for (cx, cz, r) in ((H[0] - 13, H[1] - 13, 2.8), (H[0] - 0.5, H[1] - 0.5, 4.0)):
        b.face([(cx + r * math.sin(2 * math.pi * i / 8), 0.26, cz + r * math.cos(2 * math.pi * i / 8)) for i in range(8)], dirt)
    if b.hi:   # foul lines + bases
        b.cap([(H[0] - 0.15, H[1]), (H[0] + 0.15, H[1]), (H[0] + 0.15, -65.5), (H[0] - 0.15, -65.5)], 0.2, white)
        b.cap([(H[0], H[1] - 0.15), (H[0], H[1] + 0.15), (-66.5, H[1] + 0.15), (-66.5, H[1] - 0.15)], 0.2, white)
        for (dx, dz) in ((0, -27.4), (-27.4, -27.4), (-27.4, 0)): b.bx(H[0] + dx, H[1] + dz, 0.9, 0.9, 0.26, 0.1, white)
    # ---- main stands (sweep, outer-bottom -> inner)
    path = [(-72.0, H[1] + 6), (H[0] - 12, H[1] + 6)]
    na = b.d(6, 3)
    path += [(H[0] - 12 + 18 * math.sin(math.radians(90 * i / na)), H[1] - 12 + 18 * math.cos(math.radians(90 * i / na))) for i in range(1, na + 1)]
    path += [(H[0] + 6, -66.0)]
    prof = [(62, 0), (62, 9), (62, 26), (62, 40), (60, 41.5), (31, 24), (31, 21.5), (33, 21.5), (33, 18.5), (25, 15), (25, 12.5), (27, 12.5), (27, 9.5), (0, 1.3), (0, 0)]
    skins = [arch_s, win_s, dgreen, conc2, seat_t, cream, None, glass, seat_t, green, None, dark, seat_t, green]
    b.sweep(path, prof, skins, ends=conc)
    if b.hi:   # roof canopy over the top rows + its struts
        b.sweep(path, [(62.5, 45.5), (53, 46.6), (53, 46.3), (62.5, 45.2)], [conc, None, conc2], ends=None)
    # brick entry towers with green pyramid roofs (two flank the home-plate gate, one at each end)
    C = (H[0] - 12, H[1] - 12)
    tws = [(C[0] + 82 * math.sin(math.radians(a)), C[1] + 82 * math.cos(math.radians(a)), a) for a in (27, 63)] + [(-74, H[1] + 6 + 63, 0), (H[0] + 6 + 63, -68, 90)]
    for (tx, tz, a) in tws:
        s = b.sub(); s.stack(B.rect(-5, 5, -5, 5), 0, [(9, F(arch_s, rep=1)), (17, F(win_s, rep=1)), (5, F(plain_s, rep=1))], None)
        s.box(-5.5, 5.5, 31, 32, -5.5, 5.5, cream, bot=True); s.frust((-5.5, 5.5, -5.5, 5.5), (0, 0, 0, 0), 32, 39.5, green)
        s.face([(-2.2, 26.2, 5.06), (2.2, 26.2, 5.06), (2.2, 30.6, 5.06), (-2.2, 30.6, 5.06)], clock_d)
        if s.hi: s.tube((0, 39.3, 0), (0, 43, 0), 0.12, white, seg=4)
        b.add(s, t=(tx, 0, tz), ry=a)
    # ---- right-field wall + cove arcade (-Z)
    zr = -69.25; za = -83.0
    b.wall((H[0] + 6, zr), (-30, zr), 0, 7.3, plain_s) if False else b.wall((-30, zr), (H[0] + 6, zr), 0, 7.3, F(plain_s, bay=8.0))
    b.arcade((H[0] + 6, za), (-30, za), 0, 3.4, 6.4, 14, brick, depth=2.5, back=dark, pier=0.3, aseg=6, reveal=brick2)
    b.wall((H[0] + 6, za), (H[0] + 6, zr), 0, 7.3, brick); b.wall((-30, zr), (-30, za), 0, 7.3, brick)
    b.face([(H[0] + 6, 6.4, za), (-30, 6.4, za), (-30, 11.0, za), (H[0] + 6, 11.0, za)], F(plain_s, bay=8.0)) if False else b.wall((H[0] + 6, za), (-30, za), 6.4, 11.0, F(plain_s, bay=8.0))
    b.face([(-30, 7.3, zr), (H[0] + 6, 7.3, zr), (H[0] + 6, 11.0, za), (-30, 11.0, za)], seat_t)
    b.face([(H[0] + 6, 7.3, zr), (H[0] + 6, 7.3, za), (H[0] + 6, 11.0, za)], brick); b.face([(-30, 7.3, za), (-30, 7.3, zr), (-30, 11.0, za)], brick)
    # ---- bleachers behind left / centre field
    bp = [(-30, -69.25), (-53.5, -61.25), (-70.5, -35), (-70.5, H[1] + 6 + 20)]
    b.sweep(bp, [(26, 0), (26, 13.5), (2.5, 3.6), (0, 3.6), (0, 0)], [F(plain_s, bay=8.0), seat_t, conc, green], ends=brick)
    # scoreboard in centre field, facing the plate
    s = b.sub()
    s.box(-17, 17, 13, 35, -1.5, 1.5, dgreen); s.face([(-16.4, 13.6, 1.56), (16.4, 13.6, 1.56), (16.4, 34.4, 1.56), (-16.4, 34.4, 1.56)], board_d)
    for x in (-13, 0, 13): s.bx(x, -0.5, 1.4, 1.4, 0, 13, steel)
    s.bx(0, 0, 9, 1.0, 35, 2.6, dgreen); s.face([(-1.1, 35.2, 0.56), (1.1, 35.2, 0.56), (1.1, 37.4, 0.56), (-1.1, 37.4, 0.56)], clock_d)
    b.add(s, t=(-73, 0, -70), ry=45)
    # the glove and the bottle slide behind the left-field bleachers
    s = b.sub()   # bottle: lathed upright then tipped
    s.lathe(0, 0, [(0.0, 0), (2.6, 0.2), (2.7, 9.5), (2.4, 12.0), (1.1, 16.5), (1.0, 21.0), (1.25, 21.2), (1.25, 22.2), (0, 22.3)], b.d(12, 6), bottle)
    s.lathe(0, 0, [(2.78, 3.5), (2.78, 8.5)], b.d(12, 6), label)
    b.add(s, t=(-92, 15.0, -22), rx=-62)
    for x in (0, 1):
        b.bx(-92, -22 - 4 - x * 9, 1.0, 1.0, 0, 15 + 0.2 + x * 4.6, steel)
    g = b.sub()   # glove: palm + four fingers + thumb
    g.lathe(0, 0, [(0, 0), (2.6, 0.6), (3.2, 2.6), (3.0, 4.6), (2.2, 5.4)], b.d(8, 5), tan, sq=0.45, capt=tan)
    for i in range(4):
        a = math.radians(-36 + i * 22); g.tube((2.2 * math.sin(a) * 1.1, 5.0, 0), (4.9 * math.sin(a), 5.0 + 4.6 * math.cos(a), 0), 0.78, tan, seg=b.d(6, 4), r1=0.55, caps=True)
    g.tube((2.6, 2.6, 0), (5.0, 5.4, 0), 0.85, tan, seg=b.d(6, 4), r1=0.6, caps=True)
    b.add(g, t=(-90, 13.5, 6), ry=80)
    b.bx(-90, 6, 6, 5, 0, 13.5, conc2)
    # ---- light towers: two on the upper-deck rim, two free-standing in the outfield
    def ltower(base_y, top, wide):
        s = b.sub()
        for x in (-wide / 2 + 1, wide / 2 - 1): s.bx(x, 0, 1.0, 1.0, base_y, top - base_y - 4, steel)
        if s.hi:
            for k in range(3):
                y0_ = base_y + (top - base_y - 9) * k / 3; y1_ = base_y + (top - base_y - 9) * (k + 1) / 3
                s.beam((-wide / 2 + 1, y0_, 0), (wide / 2 - 1, y1_, 0), 0.4, 0.4, steel); s.beam((wide / 2 - 1, y0_, 0), (-wide / 2 + 1, y1_, 0), 0.4, 0.4, steel)
        s.box(-wide / 2, wide / 2, top - 9, top, -0.6, 0.6, steel)
        s.face([(-wide / 2, top - 9, 0.66), (wide / 2, top - 9, 0.66), (wide / 2, top, 0.66), (-wide / 2, top, 0.66)], light_d)
        return s
    b.add(ltower(40, 60, 22), t=(-22, 0, H[1] + 6 + 60), ry=180)
    b.add(ltower(40, 60, 22), t=(H[0] + 6 + 60, 0, -24), ry=-90)
    b.add(ltower(0, 60, 14), t=(-99, 0, -48), ry=60)
    b.add(ltower(0, 60, 14), t=(-38, 0, -89), ry=20)


# ------------------------------------------------------------------ Pier 39
@model('pier_39', tier='A', fit=(134.5, 15.0, 357.0), face='south', stone=0x8a8880, water=True,
       close=((-70, 30, -20), (-20, 2, -80), 30),
       desc="Pier 39: two rows of two-storey grey board-and-batten shops with gabled roofs along a central boardwalk with upper galleries and bridges, entrance sign frame with flags on +Z, carousel near the far end, sea-lion floats on the west (-X) side, marina fingers on +X; y 0 = pier deck")
def pier_39(b):
    rng = np.random.RandomState(39)
    GR = [0x8d8b84, 0x7e8488, 0x94887a]
    wood = b.c(0x7a6a56); wood2 = b.c(0x8a7a66); white = b.c(0xd0cec6); blue = b.c(0x2c4f86); red = b.c(0xa83a30); gold = b.c(0xc8a640, 0.5); dark = b.c(0x33363a)
    lion = b.c(0x5a4634); lion2 = b.c(0x6e5840); steel = b.c(0x5a6066, 0.6, 0.3); floatc = b.c(0x9a8f7c)
    flagc = [b.c(x) for x in (0xb03a30, 0x2f5a9a, 0xc8a83a, 0x3a8a5a, 0xc8c6be)]

    def shop(col):
        def fn(c):
            p_board(col, 16)(c)
            c.rect(0, 0.8, 1, 1, mul(col, 0.8), 0.8); c.rect(0, 0.78, 1, 0.8, mul(col, 1.2), 0.9)
            for i, x in enumerate((0.04, 0.37, 0.7)):
                c.window(x, 0.06, x + 0.26, 0.7, 0x3e4a52, 0xc8c4b8, mull=(2, 2) if i != 1 else (1, 1))
                c.rect(x - 0.01, 0.7, x + 0.27, 0.78, [0x9a3a30, 0x2f5a8a, 0x3a7a5a][i], 0.8)
        return fn
    def upper(col):
        def fn(c):
            p_board(col, 16)(c)
            for x in (0.1, 0.42, 0.74): c.window(x, 0.3, x + 0.16, 0.78, 0x3e4a52, 0xc8c4b8, mull=(2, 2))
            c.rect(0, 0, 1, 0.05, mul(col, 0.7), 0.8)
        return fn
    def stripe(c):
        c.rect(0, 0, 1, 1, 0xc8c2a8); c.rect(0, 0, 0.5, 1, 0xa83a30); c.rect(0, 0, 1, 0.08, 0xc8a640)
    shops = [b.band('shop%d' % i, 64, shop(GR[i]), bay=12.0) for i in range(3)]
    uppers = [b.band('up%d' % i, 64, upper(GR[i]), bay=12.0) for i in range(3)]
    shing = b.band('shingle', 32, p_tiles(0x6a6a68, 16, 4, 0.85), bay=6.0); stripe_s = b.band('stripe', 32, stripe)

    def sign(c):
        c.rect(0, 0, 1, 1, 0x2c4f86); c.rect(0.02, 0.06, 0.98, 0.94, 0xc8a640); c.rect(0.035, 0.1, 0.965, 0.9, 0x2c4f86)
        for i, ch in enumerate((0.2, 0.33, 0.46, 0.59, 0.76, 0.86)):   # block glyphs (suggested lettering)
            c.rect(ch - 0.04, 0.28, ch + 0.04, 0.72, 0xd8d4c4)
            c.rect(ch - 0.015, 0.4 + 0.1 * (i % 2), ch + 0.04, 0.56 + 0.06 * (i % 2), 0x2c4f86)
    sign_d = b.decal('sign', 128, 32, sign)

    XI, XO = 8.0, 27.0
    ZA, ZB = 150.0, -150.0
    for sx in (-1, 1):
        z = ZA; k = 0
        while z > ZB + 5:
            L = min(float(rng.choice([22, 26, 30, 34])), z - ZB); k += 1
            ci = int(rng.randint(0, 3)); tall = rng.rand() < 0.2; hw = 8.0 + (2.2 if tall else 0) + float(rng.choice([0, 0.0, 0.8]))
            dep = XO - XI - float(rng.choice([0, 1.5, 3.0])); gap = 1.2 if rng.rand() < 0.35 else 0.0
            x0, x1 = (XI, XI + dep) if sx > 0 else (-XI - dep, -XI)
            z1, z0 = z - gap, z - L
            b.box(x0, x1, 0, 4.2, z0, z1, uppers[ci], notop=True, **({'l': shops[ci]} if sx > 0 else {'r': shops[ci]}))
            b.box(x0, x1, 4.2, hw, z0, z1, uppers[ci], notop=True)
            rh = 3.2 + (1.0 if tall else 0)
            b.gable(x0 - 0.5, x1 + 0.5, z0, z1, hw, rh, shing, uppers[ci] if False else b.c(mul(GR[ci], 0.92)), axis='z')
            if rng.rand() < 0.6:   # cross gable facing the boardwalk
                gw = 8.0; zc = (z0 + z1) / 2; xi = sx * XI; xm = sx * (XI + dep / 2)
                yb = hw; q = b.sub()
                q.face([(-gw / 2, yb, 0.3), (gw / 2, yb, 0.3), (0, yb + rh * 0.95, 0.3)], b.c(mul(GR[ci], 1.05)))
                q.face([(gw / 2, yb, 0.3), (gw / 2 + 0.3, yb, -dep / 2), (0, yb + rh * 0.95, -dep / 2), (0, yb + rh * 0.95, 0.3)], shing)
                q.face([(-gw / 2 - 0.3, yb, -dep / 2), (-gw / 2, yb, 0.3), (0, yb + rh * 0.95, 0.3), (0, yb + rh * 0.95, -dep / 2)], shing)
                b.add(q, t=(xi, 0, zc), ry=-90 * sx)
            # upper gallery along the boardwalk side with posts and rail
            gx0, gx1 = (XI - 2.4, XI) if sx > 0 else (-XI, -XI + 2.4)
            b.box(gx0, gx1, 3.9, 4.2, z0, z1, wood2, top=wood, bot=True)
            if b.hi:
                xr = sx * (XI - 2.3)
                b.box(min(xr, xr + sx * 0.1), max(xr, xr + sx * 0.1), 5.1, 5.25, z0, z1, wood)
                for j in range(int(L // 6) + 1): b.bx(xr, z0 + 0.3 + j * 6.0, 0.25, 0.25, 0, 5.2, wood)
            if k % 3 == 0 and b.hi:   # roof flag
                fz = (z0 + z1) / 2; fx = sx * (XI + dep / 2)
                b.tube((fx, hw + rh, fz), (fx, 14.9, fz), 0.07, white, seg=4); b.face([(fx, 13.6, fz), (fx, 13.6, fz - 1.9), (fx, 14.8, fz - 1.9), (fx, 14.8, fz)], flagc[k % 5], two=True)
            z -= L
    # bridges across the boardwalk at the upper level
    for zb in (96.0, 20.0, -64.0):
        b.box(-XI + 2.4, XI - 2.4, 3.9, 4.2, zb - 1.8, zb + 1.8, wood2, top=wood, bot=True)
        for dz in (-1.8, 1.7): b.box(-XI + 2.4, XI - 2.4, 5.1, 5.25, zb + dz, zb + dz + 0.1, wood)
    # entrance: sign frame with the flag row
    ze = 164.0
    for sx in (-1, 1):
        b.bx(sx * 10.5, ze, 1.1, 1.1, 0, 10.8, white)
        b.bx(sx * 10.5, ze, 1.6, 1.6, 0, 1.2, blue)
    b.box(-11.6, 11.6, 7.2, 10.2, ze - 0.35, ze + 0.35, blue)
    b.face([(-11.2, 7.4, ze + 0.38), (11.2, 7.4, ze + 0.38), (11.2, 10.0, ze + 0.38), (-11.2, 10.0, ze + 0.38)], sign_d)
    b.face([(11.2, 7.4, ze - 0.38), (-11.2, 7.4, ze - 0.38), (-11.2, 10.0, ze - 0.38), (11.2, 10.0, ze - 0.38)], sign_d)
    for i in range(b.d(9, 5)):
        x = -11 + i * 22 / (b.d(9, 5) - 1)
        b.tube((x, 10.2, ze), (x, 15.0, ze), 0.07, white, seg=4)
        b.face([(x, 13.7, ze), (x + 1.9, 13.7, ze), (x + 1.9, 14.9, ze), (x, 14.9, ze)], flagc[i % 5], two=True)
    # entrance plaza kiosks
    for sx in (-1, 1):
        b.bx(sx * 20, 160, 9, 9, 0, 4.0, uppers[1]); b.frust((sx * 20 - 5, sx * 20 + 5, 155, 165), (sx * 20, sx * 20, 160, 160), 4.0, 7.0, shing if False else b.c(0x6a6a68))
    # carousel pavilion near the far end
    zc = -118.0; sg = b.d(12, 6)
    b.lathe(0, zc, [(6.6, 0), (6.6, 6.0)], sg, F(uppers[2], rep=1), smooth=False, ub=1) if False else b.lathe(0, zc, [(6.6, 0), (6.6, 6.2)], sg, glass_ := b.c(0x55626a, 0.3), smooth=False)
    if b.hi:
        for i in range(12):
            a = 2 * math.pi * i / 12; b.tube((6.65 * math.sin(a), 0, zc + 6.65 * math.cos(a)), (6.65 * math.sin(a), 6.2, zc + 6.65 * math.cos(a)), 0.22, white, seg=4)
    b.lathe(0, zc, [(7.4, 6.2), (7.4, 6.8)], sg, gold, smooth=False, capb=white)
    b.lathe(0, zc, [(7.4, 6.8), (2.0, 10.0)], sg, stripe_s, smooth=False, ub=1 if b.hi else 2)
    b.lathe(0, zc, [(2.0, 10.0), (2.0, 11.2), (2.4, 11.3), (0, 13.2)], b.d(8, 4), gold, smooth=False)
    b.tube((0, 13.0, zc), (0, 15.0, zc), 0.06, white, seg=4)
    # far-end stage deck building
    b.bx(0, -165, 30, 10, 0, 5.0, uppers[0]); b.gable(-15.5, 15.5, -170, -160, 5.0, 2.6, shing, b.c(mul(GR[0], 0.92)), axis='x')
    # ---- sea-lion floats (west side, -X): rafts at deck level (documented choice), sea lions hauled out
    for i in range(3):
        for j in range(7):
            fx = -58 + i * 9.5; fz = -30 - j * 13.5
            b.box(fx - 4.0, fx + 4.0, 0, 0.35, fz - 5.4, fz + 5.4, floatc, top=wood2)
            nl = int(rng.randint(2, 6))
            pts = [(fx + rng.uniform(-3, 3), fz + rng.uniform(-4.4, 4.4), rng.uniform(0, 360), rng.uniform(0.85, 1.25)) for _ in range(nl)]
            if b.hi:
                for (lx, lz, a, sc) in pts:
                    s = b.sub(); s.tube((0, 0.3, -1.1), (0, 0.55, 0.5), 0.45, lion if sc > 1 else lion2, seg=5, r1=0.4, caps=True, smooth=True)
                    s.tube((0, 0.55, 0.5), (0, 1.15, 1.0), 0.38, lion if sc > 1 else lion2, seg=5, r1=0.16, caps=True, smooth=True)
                    b.add(s, t=(lx, 0.3, lz), ry=a, sc=(sc, sc, sc))
            else:
                b.bx(fx, fz, 5.0, 7.0, 0.35, 0.7, lion2)
    b.box(-63, -62, 0, 0.3, -125, -20, floatc, top=wood2)   # the float spine walkway
    # ---- east marina fingers (+X)
    b.box(60, 62, 0, 0.3, -140, 120, floatc, top=wood2)
    for j in range(b.d(12, 6)):
        fz = -130 + j * (240 / (b.d(12, 6) - 1)); b.box(34, 60, 0, 0.3, fz - 0.8, fz + 0.8, floatc, top=wood2)
    b.box(-66.5, -66.0, 0, 0.3, -178, -177.5, floatc); b.box(66.0, 66.5, 0, 0.3, 178, 178.5, floatc)   # footprint corners


# ------------------------------------------------------------------ Ghirardelli Square
# front +Z = Beach St (north, the bay); the clock tower is at the south-west corner = (+X, -Z)
@model('ghirardelli_square', tier='A', fit=(127.0, 40.0, 84.5), face='north', stone=0x8f4a38,
       close=((30, 34, 80), (0, 20, -10), 30),
       desc="Ghirardelli Square: red-brick factory blocks with crenellated parapets round a terraced court, the clock tower at the south-west corner (+X, -Z), low terrace pavilions on the bay front, the big roof sign frame (block letters SQUARE on a steel lattice) facing +Z")
def ghirardelli(b):
    BR = 0x91503c
    brick = b.c(BR); brick2 = b.c(mul(BR, 0.85)); trim = b.c(0xb9ad98); roof = b.c(0x5e6064); dark = b.c(0x30343a); steel = b.c(0x4a4e52, 0.6, 0.4)
    letter = b.c(0xd4cfbc); pav = b.c(0x9a8f80); green = b.c(0x55764a); slate = b.c(0x565c62); water = b.c(0x4a6a72, 0.3); awn = b.c(0x7a2a24)

    def bw(c):
        c.brick(20, 8, BR, 0xa3907e, 0.12); c.noise(0.06, 5)
        c.window(0.14, 0.14, 0.42, 0.8, 0x353c42, 0xc0b8a8, arch=True, mull=(2, 3), surround=0xb9ad98, sw=0.018)
        c.window(0.58, 0.14, 0.86, 0.8, 0x353c42, 0xc0b8a8, arch=True, mull=(2, 3), surround=0xb9ad98, sw=0.018)
        c.rect(0, 0.93, 1, 1, 0xb9ad98, 0.8); c.rect(0, 0.925, 1, 0.94, k=0.7)
    def bg(c):
        c.brick(20, 8, BR, 0xa3907e, 0.12); c.rect(0, 0, 1, 0.08, 0x8a7f72, 0.7)
        c.window(0.1, 0.08, 0.44, 0.82, 0x3a444a, 0xc0b8a8, arch=True, mull=(2, 2), surround=0xb9ad98, sw=0.018)
        c.window(0.56, 0.08, 0.9, 0.82, 0x3a444a, 0xc0b8a8, arch=True, mull=(2, 2), surround=0xb9ad98, sw=0.018)
        c.rect(0, 0.93, 1, 1, 0xb9ad98, 0.8)
    def plain(c): c.brick(12, 8, BR, 0xa3907e, 0.12); c.noise(0.06, 5); c.rect(0, 0.88, 1, 1, 0xb9ad98, 0.8)
    def tw(c):
        c.brick(24, 6, BR, 0xa3907e, 0.12); c.rect(0, 0, 0.1, 1, mul(BR, 1.12), 0.7); c.rect(0.9, 0, 1, 1, mul(BR, 1.12), 0.7)
        c.window(0.36, 0.2, 0.64, 0.8, 0x353c42, 0xc0b8a8, arch=True, mull=(2, 4), surround=0xb9ad98)
    bw_s = b.band('bw', 128, bw, bay=7.0); bg_s = b.band('bg', 128, bg, bay=7.0); pl_s = b.band('plain', 64, plain, bay=7.0); tw_s = b.band('tw', 128, tw, bay=9.0)
    clock = b.decal('clock', 64, 64, p_clock(0xd6d0bc, 0x2a2a2c, 0x5e584c, BR))

    def cren(s, x0, x1, z0, z1, y, h=1.1, step=2.4):
        """crenellated parapet round a rectangle"""
        if not s.hi:
            s.box(x0, x1, y, y + h * 0.6, z0, z1, brick, notop=True); return
        s.box(x0, x1, y, y + h * 0.45, z0, z1, brick, notop=True)
        nx = max(2, int((x1 - x0) / step)); nz = max(2, int((z1 - z0) / step))
        for i in range(nx):
            xx = x0 + (i + 0.5) * (x1 - x0) / nx
            for zz in (z0 + 0.25, z1 - 0.25): s.bx(xx, zz, (x1 - x0) / nx * 0.5, 0.5, y + h * 0.45, h * 0.55, trim)
        for i in range(1, nz - 1):
            zz = z0 + (i + 0.5) * (z1 - z0) / nz
            for xx in (x0 + 0.25, x1 - 0.25): s.bx(xx, zz, 0.5, (z1 - z0) / nz * 0.5, y + h * 0.45, h * 0.55, trim)

    def block(x0, x1, z0, z1, floors, crenel=True, ground=bg_s, fh=4.4):
        y = b.stack(B.rect(x0, x1, z0, z1), 0, [(fh + 0.4, ground)] + [(fh, bw_s)] * (floors - 1), roof)
        if crenel: cren(b, x0, x1, z0, z1, y)
        else: b.box(x0, x1, y, y + 0.7, z0, z1, pl_s if False else brick, notop=True)
        return y
    X, Z = 63.5, 42.25
    b.cap(B.rect(-X, X, -Z, Z), 0.03, pav)
    # back row along North Point (-Z): the long Chocolate / Cocoa blocks
    y1 = block(-40, 14, -Z, -22, 4)
    y2 = block(14, 45.5, -Z, -24, 3)
    # east wing: the old woolen mill (-X) with a gabled slate roof
    yw = b.stack(B.rect(-X, -44, -Z, 18), 0, [(4.8, bg_s), (4.4, bw_s), (4.4, bw_s)], None)
    b.gable(-X - 0.3, -44 + 0.3, -Z, 18, yw, 4.0, slate, brick, axis='z')
    # west wing (+X): Apartment / Power house blocks
    block(45.5, X, -24, 4, 3); block(47, X, 4, 26, 2)
    # centre: the Mustard building carrying the sign
    ym = block(-17, 17, -22, -2, 4)
    # ---- clock tower at the (+X, -Z) corner
    tx, tz, T = X - 8.5, -Z + 8.5, 5.2
    block(X - 17, X, -Z, -24, 4, crenel=True)
    yt = b.stack(B.rect(tx - T, tx + T, tz - T, tz + T), 17.6, [(7.5, F(tw_s, rep=1))], None)
    b.box(tx - T - 0.5, tx + T + 0.5, yt, yt + 0.8, tz - T - 0.5, tz + T + 0.5, trim, bot=True); yt += 0.8
    b.box(tx - T + 0.4, tx + T - 0.4, yt, yt + 5.6, tz - T + 0.4, tz + T - 0.4, brick)
    for a in range(4):
        s = b.sub(); s.face([(-2.2, yt + 0.6, T - 0.34), (2.2, yt + 0.6, T - 0.34), (2.2, yt + 5.0, T - 0.34), (-2.2, yt + 5.0, T - 0.34)], clock); b.add(s, t=(tx, 0, tz), ry=a * 90)
    yt += 5.6
    cren(b, tx - T, tx + T, tz - T, tz + T, yt, 1.4, 2.0)
    b.frust((tx - 3.4, tx + 3.4, tz - 3.4, tz + 3.4), (tx - 0.4, tx + 0.4, tz - 0.4, tz + 0.4), yt, yt + 5.0, slate, top=slate)
    b.tube((tx, yt + 4.8, tz), (tx, 40.0, tz), 0.12, trim, seg=4)
    if b.hi:
        for cx in (-1, 1):
            for cz in (-1, 1): b.bx(tx + cx * (T - 0.5), tz + cz * (T - 0.5), 1.2, 1.2, yt, 2.6, trim)
    # ---- the roof sign: steel lattice + block letters (SQUARE), facing the bay (+Z)
    zs = -3.5; y0 = ym + 1.0; LH = 7.0; LW = 4.3; gap = 1.2; word = 'SQUARE'
    glyph = {  # strokes on a 0..1 x 0..1 cell: (x0, y0, x1, y1)
        'S': [(0, 1, 1, 1), (0, 0.5, 0, 1), (0, 0.5, 1, 0.5), (1, 0, 1, 0.5), (0, 0, 1, 0)],
        'Q': [(0, 0, 0, 1), (1, 0, 1, 1), (0, 1, 1, 1), (0, 0, 1, 0), (0.55, 0.3, 1.05, -0.08)],
        'U': [(0, 0, 0, 1), (1, 0, 1, 1), (0, 0, 1, 0)],
        'A': [(0, 0, 0.5, 1), (0.5, 1, 1, 0), (0.22, 0.4, 0.78, 0.4)],
        'R': [(0, 0, 0, 1), (0, 1, 1, 1), (1, 0.5, 1, 1), (0, 0.5, 1, 0.5), (0.4, 0.5, 1, 0)],
        'E': [(0, 0, 0, 1), (0, 1, 1, 1), (0, 0.5, 0.8, 0.5), (0, 0, 1, 0)]}
    tw_ = len(word) * LW + (len(word) - 1) * gap; xs = -tw_ / 2
    for i, ch in enumerate(word):
        ox = xs + i * (LW + gap)
        if b.hi:
            for (ax, ay, bx_, by) in glyph[ch]:
                b.beam((ox + ax * LW, y0 + 1.2 + ay * LH, zs), (ox + bx_ * LW, y0 + 1.2 + by * LH, zs), 0.5, 0.85, letter, caps=True, up=(0, 0, 1))
        else: b.box(ox, ox + LW, y0 + 1.2, y0 + 1.2 + LH, zs - 0.25, zs + 0.25, letter)
    for i in range(b.d(9, 5)):   # lattice posts + bracing behind the letters
        x = xs + i * tw_ / (b.d(9, 5) - 1)
        b.bx(x, zs - 0.8, 0.3, 0.3, ym, LH + 2.6, steel)
        if b.hi: b.beam((x, ym, zs - 4.0), (x, ym + LH + 1.5, zs - 0.8), 0.22, 0.22, steel)
    for yy in (y0 + 1.0, y0 + 1.2 + LH / 2, y0 + 1.4 + LH): b.box(xs - 0.5, xs + tw_ + 0.5, yy - 0.12, yy + 0.12, zs - 0.95, zs - 0.65, steel)
    # ---- court: terraces stepping down to Beach St, fountain, low front pavilions
    b.box(-44, 45.5, 0, 3.0, -2, 10, pl_s if False else brick2, top=pav)
    b.box(-30, 30, 0, 1.5, 10, 22, brick2, top=green)
    b.lathe(0, 4.0, [(3.4, 3.0), (3.4, 3.7), (3.0, 3.7), (3.0, 3.4)], b.d(12, 6), trim); b.lathe(0, 4.0, [(3.0, 3.45), (0, 3.45)], b.d(12, 6), water)
    b.lathe(0, 4.0, [(0.5, 3.4), (0.4, 4.6), (1.2, 4.9), (0, 5.2)], b.d(8, 4), trim)
    for (x0, x1, h) in ((-X, -34, 6.4), (34, X, 6.4)):   # Wurster-era pavilions on the bay front
        b.box(x0, x1, 0, h, 26, Z, F(bg_s, bay=7.0), top=roof)
        b.box(x0 - 0.0, x1, h, h + 0.7, 26, Z, brick, notop=True)
        if b.hi: b.box(x0 + 1, x1 - 1, 3.2, 3.5, Z, Z + 1.6, awn, bot=True)
    b.box(-12, 12, 0, 4.6, 30, Z, F(bg_s, bay=7.0), top=roof)
    if b.hi:
        for i in range(8): b.bx(-38 + i * 11, 16, 2.2, 2.2, 1.5 if abs(-38 + i * 11) < 30 else 0.03, 2.6, green)


# ------------------------------------------------------------------ Salesforce Transit Center
@model('salesforce_transit_center', tier='A', fit=(437.5, 24.0, 55.5), face='north', stone=0xd2d4d2,
       close=((60, 32, 70), (20, 12, 0), 28),
       desc="Salesforce Transit Center: 440 m white perforated-metal undulating skin with a rippling lower edge on V columns over set-back glass, three street crossings bridged, rooftop park with lawns, a curving path, trees, the Grand Hall oculus and the bus bridge stub at the -X end")
def transit_center(b):
    W = 0xcdd0d0
    white = b.c(W, 0.5, 0.1); white2 = b.c(mul(W, 0.88), 0.5, 0.1); conc = b.c(0x9a9a96); dark = b.c(0x2e3238); glassc = b.c(0x4a6272, 0.25); lawn = b.c(0x5a8444); lawn2 = b.c(0x4a7040)
    path_c = b.c(0xbdb6a4); tree = b.c(0x3a6436); tree2 = b.c(0x4c7a3e); trunk = b.c(0x5a4a3a); steel = b.c(0xb8bcbc, 0.5, 0.4); soff = b.c(0x8a8e90)

    def perf(c):   # white perforated panels: diamond pattern of holes, panel seams
        c.rect(0, 0, 1, 1, W); c.vgrad(1.05, 0.9)
        for j in range(10):
            for i in range(16):
                x = (i + 0.5 * (j % 2)) / 16; y = (j + 0.5) / 10
                r = 0.012 + 0.008 * math.sin(i * 0.8 + j * 1.3)
                c.ell(x % 1.0, y, r, None, 0x8f979c, 0.35)
        c.joints(2, 4, 0.9, 1.0, stagger=False)
    def glass(c): p_glass(0x3f5666, 6, 2, 0x9aa0a2)(c); c.rect(0, 0, 1, 0.06, 0x6a6e70)
    perf_s = b.band('perf', 128, perf, bay=12.0); glass_s = b.band('glass', 64, glass, bay=12.0)

    XL, HW = 218.75, 27.75
    n = b.d(72, 36)
    def half(t):   # half width along the length, t = -1..1 : rounded ends + gentle bulges
        e = 1 - abs(t) ** 10
        return (HW - 3.2) * max(e, 0.0) ** 0.4
    # perimeter path (clockwise seen from above so that 'out' is to the right)
    top = [(-XL + 2 * XL * i / n, 0) for i in range(n + 1)]
    pts = []
    for i in range(n + 1):
        t = -1 + 2 * i / n; x = t * XL; hw = half(t) + 1.6 * math.sin(t * 13.0) * (1 - abs(t) ** 4)
        pts.append((x, hw))
    per = [(x, hw) for (x, hw) in pts] + [(x, -hw) for (x, hw) in pts[::-1][1:-1]]
    m = len(per)
    def station(i):
        p = np.array(per[i]); a = np.array(per[i - 1]); c_ = np.array(per[(i + 1) % m]); d = c_ - a; d /= np.linalg.norm(d)
        return p, np.array([-d[1], d[0]])
    # skin rings: bottom edge ripples, belly bulges
    rings = []
    for i in range(m):
        p, o = station(i); ph = i * 2 * math.pi / m
        yb = 7.4 + 1.5 * math.sin(ph * 17); bulge = 2.4 + 0.9 * math.sin(ph * 11 + 1.0)
        prof = [(-1.2, yb), (0.6 * bulge, yb + 2.6), (bulge, 12.6), (0.7 * bulge, 16.6), (-0.6, 19.6)]
        if not b.hi: prof = [prof[0], prof[2], prof[4]]
        rings.append([(p[0] + o[0] * q, y, p[1] + o[1] * q) for (q, y) in prof])
    rings.append(rings[0])
    for j in range(m):
        a, c_ = rings[j], rings[j + 1]
        for i in range(len(a) - 1):
            b.face([a[i], c_[i], c_[i + 1], a[i + 1]], F(perf_s, rep=1))
            if i < b.d(2, 1): b.face([a[i + 1], c_[i + 1], c_[i], a[i]], soff)
    # soffit under the skin, roof deck, park
    inner = [tuple(station(i)[0] - station(i)[1] * 1.2) for i in range(m)]
    b.cap(inner, 7.6, soff, up=False)
    deck = [tuple(station(i)[0] - station(i)[1] * 0.6) for i in range(m)]
    b.cap(deck, 19.6, conc)
    b.sweep(deck + [deck[0]], [(0.0, 19.6), (0.0, 20.7), (-0.3, 20.7)], [glassc, steel])
    park = [tuple(station(i)[0] - station(i)[1] * 3.0) for i in range(0, m, 2)]
    b.cap(park, 19.9, lawn)
    # curving path + lawns
    npth = b.d(40, 16); pp = [(-XL * 0.93 + 2 * XL * 0.93 * i / npth, 9.0 * math.sin(i / npth * math.pi * 7)) for i in range(npth + 1)]
    b.sweep(pp, [(2.2, 19.95), (2.2, 20.0), (-2.2, 20.0), (-2.2, 19.95)], [None, path_c, None])
    # set-back glass ground floor between the street crossings, V columns under the skin
    streets = [-150.0, -62.0, 40.0, 128.0]      # crossings (clear spans)
    segs = []; x = -XL + 14
    for sx_ in streets + [XL - 14 + 12]:
        segs.append((x, sx_ - 12)); x = sx_ + 12
    for (x0, x1) in segs:
        if x1 - x0 < 10: continue
        b.box(x0, x1, 0, 7.6, -HW + 9.5, HW - 9.5, glass_s, notop=True)
    b.box(-XL + 14, XL - 14, 7.5, 7.7, -HW + 8, HW - 8, soff, notop=True)
    nv = b.d(30, 15)
    for i in range(nv):
        x = -XL + 22 + i * (2 * XL - 44) / (nv - 1)
        for sz in (-1, 1):
            z = sz * (HW - 6.5)
            for dx in (-3.6, 3.6): b.tube((x, 0, z), (x + dx, 8.4, z + sz * 1.5), 0.42, steel, seg=b.d(6, 4), r1=0.3)
    # rooftop: the Grand Hall oculus, trees, a cafe pavilion, the amphitheatre lawn
    b.lathe(-10, 0, [(7.5, 19.9), (7.5, 20.5), (6.2, 22.4), (3.0, 23.6), (0, 24.0)], b.d(16, 8), glassc)
    if b.hi: b.lathe(-10, 0, [(7.7, 19.9), (7.7, 20.6), (7.3, 20.6)], 16, steel)
    rng = np.random.RandomState(5)
    for k in range(64):
        x = rng.uniform(-XL * 0.9, XL * 0.9); z = rng.uniform(-1, 1) * (half(x / XL) - 4.5); r = rng.uniform(1.6, 2.6); h = rng.uniform(2.8, 4.0)
        if abs(x + 10) < 11 and abs(z) < 11: continue
        if abs(z - 9.0 * math.sin((x + XL * 0.93) / (2 * XL * 0.93) * math.pi * 7)) < 3.2: continue
        if b.hi:
            b.tube((x, 19.9, z), (x, 19.9 + h * 0.5, z), 0.16, trunk, seg=4)
            b.lathe(x, z, [(0, 19.9 + h * 0.35), (r, 19.9 + h * 0.6), (r * 0.8, 19.9 + h * 0.85), (0, 19.9 + h)], 6, tree if k % 2 else tree2, smooth=True)
        elif k % 2 == 0: b.frust((x - r, x + r, z - r, z + r), (x, x, z, z), 19.9 + 0.8, 19.9 + h, tree)
    b.bx(120, -4, 16, 9, 19.9, 3.4, glass_s if False else glassc, top=white)
    b.bx(-170, 5, 9, 7, 19.9, 3.0, white2, top=white)
    # bus bridge stub leaving the -X end at bus-deck level
    b.box(-XL - 0.0, -XL + 16, 11.0, 12.6, -8, 8, white2, top=conc, bot=True)
    b.bx(-XL + 3, 0, 2.2, 2.2, 0, 11.0, conc)


run()
