# icons_build_a1.py - Tokyo tier A: Tokyo Station, Zojo-ji.
# blender -b -P icons_build_a1.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


# ------------------------------------------------------------------ Tokyo Station (Marunouchi building)
@model('tokyo_station', tier='A', face='west', stone=0x93402f,
       close=((-60, 26, 95), (-100, 14, 0), 30),
       desc="Tokyo Station, Marunouchi building: the 335 m red-brick 1914 front with white stone banding and pilasters, slate mansard roofs with dormers, the two octagonal ribbed domes over the north / south entrances, the gabled centre pavilion with the imperial porch, paired turrets and end pavilions; four platform canopies with trains on the viaduct behind (-Z)")
def tokyo_station(b):
    BR = 0x93402f; WH = 0xd9d3c3; SL = 0x3a3e44; MO = 0xb09a88
    wh = b.cf(WH, 0.16); slc = b.c(SL); cu = b.c(0x566a5e, 0.6, 0.3); brc = b.cf(BR, 0.14); conc = b.c(0x8f8d86); dark = b.c(0x2a2c30); gold = b.c(0xb89a50, 0.5, 0.6)
    lit = b.glow(WARM, 0.9, 0x5a4a38); plat = b.c(0xa8a49c); canopy = b.c(0xc8c8c2); strip = b.glow(WHITEL, 0.8, 0xd8d8d0)
    g_s = b.band('ground', 96, fl(p_grid(BR, 4, 1, wx=(0.22, 0.78), wy=(0.16, 0.9), arch=True, brick=(22, 36, MO), surround=WH, stripes=[(0.34, 0.38), (0.6, 0.64)], top=(0.07, WH), bot=(0.1, 0xa29c90), lit=0.7, mull=(2, 3)), 0.2), bay=16.0)
    u_s = b.band('upper', 128, fl(p_grid(BR, 4, 2, wx=(0.26, 0.74), wy=(0.14, 0.86), brick=(34, 36, MO), surround=WH, stripes=[(0.03, 0.055), (0.24, 0.265), (0.47, 0.53), (0.74, 0.765)], top=(0.06, WH), lit=0.5, mull=(2, 3)), 0.17), bay=16.0)
    a_s = b.band('attic', 48, fl(p_grid(BR, 4, 1, wx=(0.3, 0.7), wy=(0.2, 0.8), arch=True, brick=(12, 36, MO), surround=WH, stripes=[(0.0, 0.1)], top=(0.14, WH), lit=0.4), 0.15), bay=16.0)
    def slate(c):
        c.rect(0, 0, 1, 1, SL); c.noise(0.12, 8); c.joints(8, 16, 0.8, 1.0); c.rect(0, 0.94, 1, 1, 0x566a5e, 0.7); c.rect(0, 0, 1, 0.05, 0x566a5e, 0.7)
    sl_s = b.band('slate', 32, slate, bay=8.0)
    def train(c):
        c.rect(0, 0, 1, 1, 0xc4c8ca); c.rect(0, 0.0, 1, 0.16, 0x4a4e52); c.rect(0, 0.3, 1, 0.38, 0x2e8a7a); c.litp = 1.0
        for i in range(6): c.window(0.05 + i * 0.155, 0.45, 0.17 + i * 0.155, 0.82, 0x39434c, 0x8a8c8c, mull=(1, 1), sill=False)
        for x in (0.02, 0.33, 0.64, 0.95): c.rect(x, 0.2, x + 0.03, 0.86, 0x9a9ea0)
        c.rect(0, 0.92, 1, 1, 0x8a8e90)
    tr_s = b.band('train', 32, train, bay=20.0)
    clock_d = b.decal('clock', 32, 32, lambda c: (p_clock(0xe8e2d0, 0x2a2a2c, 0x6a6458, BR)(c), c.ell(0.5, 0.5, 0.42, None, e=(0.8, 0.74, 0.6)), c.line(0.5, 0.5, 0.7, 0.63, 2.6, 0x2a2a2c), c.line(0.5, 0.5, 0.4, 0.83, 1.8, 0x2a2a2c)))
    def oculus(c):
        c.rect(0, 0, 1, 1, SL); c.ell(0.5, 0.5, 0.44, None, WH); c.ell(0.5, 0.5, 0.34, None, 0x39434c, e=(0.95, 0.8, 0.55)); c.line(0.5, 0.16, 0.5, 0.84, 1.5, WH); c.line(0.16, 0.5, 0.84, 0.5, 1.5, WH)
    oc_d = b.decal('oculus', 32, 32, oculus)

    def mansard(x0, x1, z0, z1, y0, y1, ins, crest=True):
        b.box(x0 - 0.5, x1 + 0.5, y0, y0 + 0.8, z0 - 0.5, z1 + 0.5, wh, bot=True)
        b.frust((x0 - 0.2, x1 + 0.2, z0 - 0.2, z1 + 0.2), (x0 + ins, x1 - ins, z0 + ins, z1 - ins), y0 + 0.8, y1, sl_s, top=slc)
        if crest and b.hi: b.box(x0 + ins, x1 - ins, y1, y1 + 0.5, z0 + ins, z1 - ins, cu, notop=False)
    def dormer(x, z, y, w=2.2, h=2.2):
        b.box(x - w / 2, x + w / 2, y, y + h, z - 2.6, z, wh, notop=True, bk=None)
        b.gable(x - w / 2 - 0.2, x + w / 2 + 0.2, z - 2.6, z + 0.15, y + h, 1.0, slc, wh, axis='z')
        b.face([(x - w * 0.3, y + 0.4, z + 0.04), (x + w * 0.3, y + 0.4, z + 0.04), (x + w * 0.3, y + h - 0.2, z + 0.04), (x - w * 0.3, y + h - 0.2, z + 0.04)], lit if (int(x * 7) % 3) else dark)
    def turret(x, z, w, h, cap=5.0):
        if not b.hi:
            b.box(x - w / 2, x + w / 2, 0, h + 0.7, z - w / 2, z + w / 2, brc, notop=True); b.frust((x - w * 0.72, x + w * 0.72, z - w * 0.72, z + w * 0.72), (x, x, z, z), h + 0.7, h + 0.7 + cap, slc); return
        b.stack(B.rect(x - w / 2, x + w / 2, z - w / 2, z + w / 2), 0, [(h, brc)], top=slc)
        if b.hi:
            for yy in (6.2, 11.5, 16.8): b.box(x - w / 2 - 0.12, x + w / 2 + 0.12, yy, yy + 0.5, z - w / 2 - 0.12, z + w / 2 + 0.12, wh, bot=True)
            b.face([(x - 0.7, 8.0, z + w / 2 + 0.04), (x + 0.7, 8.0, z + w / 2 + 0.04), (x + 0.7, 10.8, z + w / 2 + 0.04), (x - 0.7, 10.8, z + w / 2 + 0.04)], lit)
            b.face([(x - 0.7, 13.0, z + w / 2 + 0.04), (x + 0.7, 13.0, z + w / 2 + 0.04), (x + 0.7, 15.8, z + w / 2 + 0.04), (x - 0.7, 15.8, z + w / 2 + 0.04)], dark)
        b.box(x - w / 2 - 0.4, x + w / 2 + 0.4, h, h + 0.7, z - w / 2 - 0.4, z + w / 2 + 0.4, wh, bot=True)
        b.lathe(x, z, [(w * 0.72, h + 0.7), (w * 0.66, h + 0.7 + cap * 0.45), (w * 0.3, h + 0.7 + cap * 0.85), (0.25, h + 0.7 + cap)], 4, sl_s if False else slc, smooth=False, a0=45, a1=405)
        if b.hi: b.tube((x, h + 0.6 + cap, z), (x, h + 2.6 + cap, z), 0.14, cu, seg=4, r1=0.02)

    # ---- wings
    X = 167.5; ZB, ZF = -11.0, 9.0
    b.stack(B.rect(-151, 151, ZB, ZF), 0, [(6.5, g_s), (10.5, u_s)], top=slc)
    for (xa, xb) in ((-148, -126), (-90, -22), (22, 90), (126, 148)): mansard(xa - 2, xb + 2, ZB, ZF, 17.0, 22.5, 4.5)
    if b.hi:
        for (xa, xb) in ((-146, -128), (-88, -72), (-44, -24), (24, 44), (72, 88), (128, 146)):
            n = int(round((xb - xa) / 8)) + 1
            pilasters(b, (xa, ZF), (xb, ZF), 6.5, 17.0, n, 0.9, 0.35, wh)
            for i in range(n - 1): dormer(xa + (xb - xa) * (i + 0.5) / (n - 1), ZF - 0.8, 18.0)
    # ---- centre pavilion
    b.stack(B.rect(-20, 20, ZB, 14), 0, [(6.5, g_s), (10.5, u_s), (4.0, a_s)], top=slc)
    b.box(-20.5, 20.5, 21.0, 21.8, ZB - 0.5, 14.5, wh, bot=True)
    b.frust((-20.2, 20.2, ZB - 0.2, 14.2), (-10, 10, -4, 6), 21.8, 30.0, sl_s, top=slc)
    if b.hi:
        b.box(-10, 10, 30.0, 30.6, -4, 6, cu); pilasters(b, (-18, 14), (18, 14), 6.5, 21.0, 7, 1.0, 0.4, wh)
        for x in (-14, 14): dormer(x, 12.5, 23.0, 2.6, 2.4)
    b.stack(B.rect(-8.5, 8.5, 12, 16.5), 0, [(6.5, F(g_s, rep=1)), (10.5, F(u_s, rep=1)), (4.0, F(a_s, rep=1))], top=slc)
    b.box(-9, 9, 21.0, 21.8, 12, 17, wh, bot=True)
    b.gable(-9, 9, 6, 17, 21.8, 6.0, sl_s, brc, axis='z')
    b.face([(-1.6, 23.0, 17.06), (1.6, 23.0, 17.06), (1.6, 26.2, 17.06), (-1.6, 26.2, 17.06)], clock_d)
    if b.hi:
        b.beam((-9, 21.9, 17.1), (0, 27.9, 17.1), 0.5, 0.6, wh); b.beam((9, 21.9, 17.1), (0, 27.9, 17.1), 0.5, 0.6, wh)
        b.tube((0, 27.8, 16.5), (0, 31.5, 16.5), 0.18, cu, seg=4, r1=0.03)
    b.box(-7, 7, 4.6, 5.5, 16.5, 21, wh, bot=True); b.face([(-6.6, 4.58, 20.6), (6.6, 4.58, 20.6), (6.6, 4.58, 16.6), (-6.6, 4.58, 16.6)][::-1], lit)
    for x in b.d((-6.4, -2.2, 2.2, 6.4), ()): b.cyl(x, 20.4, 0.35, 0, 4.6, 8, wh, cap=False)
    for sx in (-1, 1): turret(sx * 20, 13.2, 5.2, 23.0, 5.5)
    # ---- dome pavilions
    for sx in (-1, 1):
        xc, zc, ap = sx * 108.0, -1.0, 16.0; Rv = ap / math.cos(math.radians(22.5))
        octo = [(xc + Rv * math.sin(math.radians(22.5 + 45 * k)), zc + Rv * math.cos(math.radians(22.5 + 45 * k))) for k in range(8)]
        b.stack(octo, 0, [(6.5, F(g_s, rep=1)), (10.5, F(u_s, rep=1)), (4.0, F(a_s, rep=1))], top=slc)
        b.lathe(xc, zc, [(Rv + 0.1, 21.0), (Rv + 0.7, 21.0), (Rv + 0.7, 21.8), (Rv - 0.4, 21.8)], 8, wh, smooth=False, a0=22.5, a1=382.5)
        prof = [(Rv - 0.4, 21.8), (Rv - 0.9, 25.5), (Rv - 3.0, 29.0), (Rv - 6.5, 32.0), (Rv - 10.8, 33.8), (5.0, 34.3)]
        b.lathe(xc, zc, prof if b.hi else prof[::2] + [prof[-1]], 8, sl_s, smooth=False, a0=22.5, a1=382.5, capt=slc, ub=2)
        b.lathe(xc, zc, b.d([(4.4, 34.3), (4.4, 36.0), (4.9, 36.2), (2.6, 38.2), (0.5, 39.2)], [(4.4, 34.3), (4.6, 36.1), (0.5, 39.2)]), b.d(8, 4), cu, smooth=False, a0=22.5, a1=382.5)
        b.tube((xc, 39.0, zc), (xc, 43.0, zc), 0.25, cu, seg=4, r1=0.03)
        if b.hi:
            for k in range(8):
                a = math.radians(22.5 + 45 * k)
                for i in range(len(prof) - 1):
                    (r0, y0), (r1, y1) = prof[i], prof[i + 1]
                    b.beam((xc + (r0 + 0.1) * math.sin(a), y0, zc + (r0 + 0.1) * math.cos(a)), (xc + (r1 + 0.1) * math.sin(a), y1, zc + (r1 + 0.1) * math.cos(a)), 0.7, 0.5, cu)
                # white corner piers + an oculus dormer on each dome facet
                b.tube((octo[k][0] * 1.0 + 0.2 * math.sin(a), 0, octo[k][1] + 0.2 * math.cos(a)), (octo[k][0] + 0.2 * math.sin(a), 21.0, octo[k][1] + 0.2 * math.cos(a)), 0.75, wh, seg=4)
                s = b.sub(); s.box(-1.7, 1.7, 22.6, 26.0, ap - 3.0, ap - 0.6, slc, notop=True, bk=None); s.gable(-1.9, 1.9, ap - 3.6, ap - 0.5, 26.0, 1.1, slc, wh, axis='z')
                s.face([(-1.4, 22.9, ap - 0.56), (1.4, 22.9, ap - 0.56), (1.4, 25.7, ap - 0.56), (-1.4, 25.7, ap - 0.56)], oc_d)
                b.add(s, t=(xc, 0, zc), ry=45 * k)
        # entrance canopy
        b.box(xc - 7, xc + 7, 5.0, 5.8, zc + ap, zc + ap + 4.5, wh, bot=True)
        b.face([(xc - 6.6, 4.98, zc + ap + 0.1), (xc + 6.6, 4.98, zc + ap + 0.1), (xc + 6.6, 4.98, zc + ap + 4.2), (xc - 6.6, 4.98, zc + ap + 4.2)], lit)
        for x in b.d((-6.5, 6.5), ()): b.cyl(xc + x, zc + ap + 4.0, 0.3, 0, 5.0, 6, wh, cap=False)
        # paired turrets flanking the wing bays + end pavilion
        for xt in (48, 66): turret(sx * xt, ZF + 0.6, 4.8, 20.5, 4.5)
        b.stack(B.rect(sx * 58 - 7, sx * 58 + 7, ZF - 2, ZF + 1.2), 0, [(6.5, F(g_s, rep=1)), (10.5, F(u_s, rep=1))], top=slc)
        b.gable(sx * 58 - 7, sx * 58 + 7, ZF - 8, ZF + 1.4, 17.0, 5.0, sl_s, brc, axis='z')
        b.face([(sx * 58 - 1.3, 18.2, ZF + 1.45), (sx * 58 + 1.3, 18.2, ZF + 1.45), (sx * 58 + 1.3, 20.8, ZF + 1.45), (sx * 58 - 1.3, 20.8, ZF + 1.45)], oc_d)
        xe0, xe1 = (150.0, X) if sx > 0 else (-X, -150.0)
        b.stack(B.rect(xe0, xe1, ZB, 12.5), 0, [(6.5, g_s), (10.5, u_s), (4.0, a_s)], top=slc)
        mansard(xe0, xe1, ZB, 12.5, 21.0, 27.5, 5.5)
        for xt in (xe0 + 0.5, xe1 - 0.5): turret(xt, 12.0, 4.2, 22.5, 4.5)
        if b.hi: dormer((xe0 + xe1) / 2, 11.0, 22.3, 2.6, 2.4)
    # ---- platforms on the viaduct behind
    b.box(-150, 150, 0, 6.0, -47, ZB, conc, top=b.c(0x5a5c5e))
    for i, zc in enumerate((-16.5, -25.0, -33.5, -42.0)):
        b.box(-140, 140, 6.0, 7.1, zc - 2.6, zc + 2.6, plat)
        b.gable(-132, 132, zc - 3.6, zc + 3.6, 11.2, 0.9, canopy, canopy, axis='x')
        b.face([(-131, 11.15, zc + 3.2), (131, 11.15, zc + 3.2), (131, 11.15, zc - 3.2), (-131, 11.15, zc - 3.2)][::-1], strip)
        if b.hi:
            for k in range(12): b.bx(-121 + k * 22, zc, 0.4, 0.4, 7.1, 4.1, conc)
    for (zc, x0, x1) in ((-20.75, -120, 80), (-29.25, -60, 140), (-37.75, -130, 30)):
        b.box(x0, x1, 6.4, 10.0, zc - 1.45, zc + 1.45, F(tr_s, bay=20.0), top=b.c(0x9a9ea0), l=b.c(0x9a9ea0), r=b.c(0x9a9ea0))


# ------------------------------------------------------------------ Zojo-ji
@model('zojoji', tier='A', face='east', stone=0x8a3a2a,
       close=((-28, 9, 144), (0, 9, 100), 28),
       desc="Zojo-ji: the vermilion two-storey Sangedatsumon gate (five bays, pent roof and hip-and-gable upper roof with curved eaves) on +Z, the stone-paved approach with lanterns and pines, the great hall (Daiden, its centre 155 m behind the gate: after centring the hall sits at z -62, the gate at z +93) on its stone terrace with the skirt roof, the sweeping irimoya main roof and stepped porch, the Ankokuden hall (+X) and the bell tower (-X)")
def zojoji(b):
    VM = 0xa83a26; verm = b.cf(VM, 0.22); verm2 = b.cf(mul(VM, 0.8), 0.18); white = b.cf(0xd8d2c4, 0.14); wood = b.c(0x4a3226); stone = b.c(0x9a968a); stone2 = b.c(0x86837a)
    gold = b.c(0xc4a24a, 0.45, 0.7, emit=(0.25, 0.2, 0.08)); pav = b.c(0x8f8c84); gravel = b.c(0x9c9889); dk = b.c(0x2a2622); glow = b.glow(WARM, 0.85, 0x6a5238); ridge = b.c(0x3a3e42); under = b.c(0x5a3a2a)
    kw = b.band('kawara', 64, p_kawara(0x4a4f54, 10, 3), bay=5.0)
    def gatewall(c):
        c.rect(0, 0, 1, 1, VM); c.noise(0.06, 5)
        for i in range(4):
            c.rect(i / 4 + 0.03, 0.12, i / 4 + 0.22, 0.86, 0xd8d2c4); c.rect(i / 4 + 0.05, 0.18, i / 4 + 0.2, 0.8, 0x3a2c22, e=(0.5, 0.36, 0.18) if i % 2 else None)
            for k in range(1, 5): c.rect(i / 4 + 0.05 + k * 0.03 - 0.003, 0.18, i / 4 + 0.05 + k * 0.03 + 0.003, 0.8, 0x6a2a1c)
        c.rect(0, 0.9, 1, 1, 0x2e6a52); c.rect(0, 0, 1, 0.08, 0x7a2a1c); c.flood(0.2)
    gw = b.band('gatewall', 32, gatewall, bay=8.0)
    def kumi(c):   # bracket frieze
        c.rect(0, 0, 1, 1, mul(VM, 0.7))
        for i in range(8):
            c.rect(i / 8 + 0.02, 0.1, i / 8 + 0.105, 0.5, 0xd8d2c4); c.rect(i / 8 + 0.01, 0.5, i / 8 + 0.115, 0.72, VM); c.rect(i / 8 + 0.0, 0.72, i / 8 + 0.125, 0.9, 0xd8d2c4)
        c.rect(0, 0.9, 1, 1, 0x3a2c22); c.flood(0.2)
    km = b.band('kumi', 32, kumi, bay=6.0)
    def hallfront(c):
        c.rect(0, 0, 1, 1, 0x4a3226); c.noise(0.08, 5)
        for i in range(4):
            c.rect(i / 4 + 0.02, 0.05, i / 4 + 0.23, 0.72, 0x2c2420, e=(0.75, 0.52, 0.24)); c.rect(i / 4 + 0.02, 0.76, i / 4 + 0.23, 0.95, 0xd8d2c4)
            for k in range(1, 7): c.rect(i / 4 + 0.02 + k * 0.03 - 0.004, 0.05, i / 4 + 0.02 + k * 0.03 + 0.004, 0.72, 0x3a2a20)
            for k in range(1, 5): c.rect(i / 4 + 0.02, 0.05 + k * 0.134 - 0.01, i / 4 + 0.23, 0.05 + k * 0.134 + 0.01, 0x3a2a20)
        c.rect(0, 0, 1, 0.05, 0x6a655c)
    hf = b.band('hallfront', 64, hallfront, bay=12.0)
    def hallside(c):
        c.rect(0, 0, 1, 1, 0xd4cec0); c.noise(0.05, 5)
        for i in range(4): c.rect(i / 4, 0, i / 4 + 0.03, 1, 0x4a3226); c.rect(i / 4 + 0.07, 0.3, i / 4 + 0.2, 0.7, 0x3a2c24)
        c.rect(0, 0.45, 1, 0.5, 0x4a3226); c.rect(0, 0.92, 1, 1, 0x4a3226); c.rect(0, 0, 1, 0.07, 0x4a3226); c.flood(0.14)
    hs = b.band('hallside', 32, hallside, bay=12.0)
    st = b.band('stone', 32, p_ashlar(0x98948a, 4, 6), bay=8.0)
    b.cap(B.rect(-50, 50, -98, 112), 0.06, gravel); b.cap(B.rect(-5, 5, -30, 106), 0.1, pav)

    # ---- Sangedatsumon
    g = b.sub(); W, D = 19.5, 9.0
    g.box(-W / 2 - 1.5, W / 2 + 1.5, 0, 0.6, -D / 2 - 1.5, D / 2 + 1.5, st, top=stone)
    for i in range(6):
        x = -W / 2 + i * W / 5
        for z in (-D / 2, 0, D / 2):
            if g.hi or z != 0: g.cyl(x, z, 0.42, 0.6, 7.6, 8, verm, cap=False)
    for sx in (-1, 1):   # closed end bays + side walls
        g.box(sx * W / 2 - 0.15, sx * W / 2 + 0.15, 0.6, 7.6, -D / 2, D / 2, white, notop=True)
        g.box(min(sx * W / 2, sx * W * 0.3), max(sx * W / 2, sx * W * 0.3), 0.6, 7.6, -0.15, 0.15, white, notop=True)
        if g.hi: g.box(min(sx * W / 2, sx * W * 0.3), max(sx * W / 2, sx * W * 0.3), 3.6, 4.0, -0.25, 0.25, verm)
    g.box(-W / 2 - 0.5, W / 2 + 0.5, 6.6, 7.4, -D / 2 - 0.5, D / 2 + 0.5, verm, bot=True)
    g.box(-W / 2 - 0.9, W / 2 + 0.9, 7.4, 8.6, -D / 2 - 0.9, D / 2 + 0.9, km, bot=True, top=wood)
    jroof(g, 0, 0, W + 8.5, D + 8.5, 8.6, 4.6, kw, ridge, style='hip', under=verm2, up=0.9)
    g.box(-W / 2 + 0.6, W / 2 - 0.6, 9.6, 14.2, -D / 2 + 0.6, D / 2 - 0.6, gw)
    if g.hi:   # balcony
        g.box(-W / 2 - 0.9, W / 2 + 0.9, 10.9, 11.15, -D / 2 - 0.9, D / 2 + 0.9, wood, bot=True)
        for (p0, p1) in (((-W / 2 - 0.9, D / 2 + 0.9), (W / 2 + 0.9, D / 2 + 0.9)), ((W / 2 + 0.9, D / 2 + 0.9), (W / 2 + 0.9, -D / 2 - 0.9)), ((W / 2 + 0.9, -D / 2 - 0.9), (-W / 2 - 0.9, -D / 2 - 0.9)), ((-W / 2 - 0.9, -D / 2 - 0.9), (-W / 2 - 0.9, D / 2 + 0.9))):
            g.beam((p0[0], 12.0, p0[1]), (p1[0], 12.0, p1[1]), 0.14, 0.14, verm); g.beam((p0[0], 11.55, p0[1]), (p1[0], 11.55, p1[1]), 0.1, 0.1, verm)
    g.box(-W / 2 - 0.4, W / 2 + 0.4, 14.2, 15.3, -D / 2 - 0.4, D / 2 + 0.4, km, bot=True, top=wood)
    jroof(g, 0, 0, W + 8.0, D + 8.0, 15.3, 6.4, kw, ridge, style='irimoya', under=verm2, gable=white, up=1.1)
    for x in (-W * 0.2, W * 0.2): lantern(g, x, 4.6, D / 2 + 0.3, 0.55, 1.3)
    g.face([(-2.2, 12.3, D / 2 - 0.5), (2.2, 12.3, D / 2 - 0.5), (2.2, 13.5, D / 2 - 0.5), (-2.2, 13.5, D / 2 - 0.5)], gold)
    b.add(g, t=(0, 0, 100))

    # ---- Daiden (great hall)
    h = b.sub(); HW, HD = 40.0, 32.0
    h.box(-HW / 2 - 6, HW / 2 + 6, 0, 2.4, -HD / 2 - 5, HD / 2 + 6, st, top=stone)
    for k in range(4): h.box(-9, 9, 0, 2.4 - 0.6 * k - 0.6 + 0.6, HD / 2 + 6, HD / 2 + 7.2 + 1.1 * k, stone2) if k == 0 else h.box(-9, 9, 0, 2.4 - 0.6 * k, HD / 2 + 6 + 1.1 * k, HD / 2 + 7.2 + 1.1 * k, stone2)
    h.box(-HW / 2, HW / 2, 2.4, 9.6, -HD / 2, HD / 2 - 3.5, hs, f=F(hf, rep=3), notop=True)
    n = h.d(9, 5)
    for i in range(n):
        x = -HW / 2 + 0.6 + i * (HW - 1.2) / (n - 1); h.cyl(x, HD / 2 - 0.5, 0.5, 2.4, 9.6, 8, wood, cap=False)
    h.box(-HW / 2 - 0.5, HW / 2 + 0.5, 9.0, 10.2, -HD / 2 - 0.5, HD / 2 + 0.2, km, bot=True, top=wood)
    jroof(h, 0, 0, HW + 12, HD + 12, 10.2, 5.2, kw, ridge, style='hip', under=under, up=1.0)
    h.box(-HW / 2 + 3.5, HW / 2 - 3.5, 11.5, 15.6, -HD / 2 + 3.5, HD / 2 - 3.5, hs)
    h.box(-HW / 2 + 3.0, HW / 2 - 3.0, 14.6, 15.8, -HD / 2 + 3.0, HD / 2 - 3.0, km, bot=True, top=wood)
    jroof(h, 0, 0, HW + 9, HD + 10, 15.8, 10.4, kw, ridge, style='irimoya', under=under, gable=white, up=1.7, hipf=0.4, orn=gold)
    # stepped porch (kohai)
    jroof(h, 0, HD / 2 + 4.5, 16, 12, 9.4, 3.2, kw, ridge, style='gable', axis='z', under=under, gable=white, up=0.4)
    for x in (-7, -2.4, 2.4, 7): h.bx(x, HD / 2 + 9.3, 0.6, 0.6, 0.6, 8.8, wood)
    for x in (-12, 12): lantern(h, x, 6.2, HD / 2 - 0.2, 0.7, 1.6)
    if h.hi:
        for i in range(n - 1): lantern(h, -HW / 2 + 0.6 + (i + 0.5) * (HW - 1.2) / (n - 1), 8.0, HD / 2 - 0.5, 0.28, 0.6, WARM)
        for x in (-11, 11): h.cyl(x, HD / 2 + 9, 0.9, 0, 1.5, 8, b.c(0x5a6a5a, 0.5, 0.5))
    b.add(h, t=(0, 0, -55))

    # ---- Ankokuden (+X) and the bell tower (-X)
    a = b.sub()
    a.box(-12, 12, 0, 1.2, -9, 9.5, st, top=stone); a.box(-10.5, 10.5, 1.2, 6.4, -7.5, 7.5, hs, f=F(hf, rep=2), notop=True)
    a.box(-10.9, 10.9, 6.0, 6.9, -7.9, 7.9, km, bot=True, top=wood)
    jroof(a, 0, 0, 28, 22, 6.9, 7.2, kw, ridge, style='irimoya', under=under, gable=white, up=1.0)
    jroof(a, 0, 11, 9, 7, 6.2, 2.2, kw, ridge, style='gable', axis='z', under=under, gable=white, up=0.3)
    for x in (-3.8, 3.8): a.bx(x, 13.6, 0.45, 0.45, 0, 6.2, wood)
    b.add(a, t=(34, 0, -46))
    s = b.sub()
    s.box(-4.5, 4.5, 0, 1.6, -4.5, 4.5, st, top=stone)
    for (x, z) in ((-3, -3), (3, -3), (3, 3), (-3, 3)): s.bx(x, z, 0.55, 0.55, 1.6, 5.4, wood)
    s.box(-3.4, 3.4, 6.4, 7.0, -3.4, 3.4, wood, bot=True)
    s.lathe(0, 0, [(0.0, 3.3), (1.25, 3.3), (1.15, 5.2), (0.7, 5.9), (0.0, 6.3)], s.d(8, 5), b.c(0x4a5a4e, 0.5, 0.6))
    jroof(s, 0, 0, 11.5, 11.5, 7.0, 4.4, kw, ridge, style='irimoya', under=under, gable=white, up=0.8, rl=0.42)
    b.add(s, t=(-30, 0, 30))
    # ---- lanterns, pines, the precinct wall either side of the gate
    for sx in (-1, 1):
        b.box(sx * 13 if sx > 0 else -50, 50 if sx > 0 else -13, 0, 3.0, 99.4, 100.6, white); b.box(sx * 13 if sx > 0 else -50, 50 if sx > 0 else -13, 2.9, 3.0, 98.9, 101.1, white, bot=True); b.gable(sx * 13 if sx > 0 else -50, 50 if sx > 0 else -13, 98.9, 101.1, 3.0, 0.8, kw, white, axis='x')
        for z in (84, 62, 40, 18, -4): stone_lantern(b, sx * 7.5, z, 2.6)
    rng = np.random.RandomState(7)
    for (x, z) in ((-22, 86), (24, 84), (-36, 70), (38, 60), (-40, 14), (-18, 54), (20, 34), (-44, -30), (44, 10), (-42, -88), (42, -90), (-16, 108), (17, 109), (-34, 106), (36, 107)):
        pine(b, x, z, 8 + rng.rand() * 5, 2.8 + rng.rand() * 1.4, lean=rng.rand() * 1.6 - 0.8)


run()
