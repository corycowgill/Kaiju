# icons_build_b.py - tier B landmarks.   blender -b -P icons_build_b.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


# ------------------------------------------------------------------ Saints Peter and Paul
@model('sts_peter_and_paul', tier='B', fit=(42.0, 58.0, 48.0), face='south', stone=0xd2cdc0,
       desc="Saints Peter and Paul: white twin-spired church on Washington Square, gabled front with rose window and triple portal, nave and aisles, rectory wing on -X")
def sts_peter_paul(b):
    W = 0xc9c4b6
    w = b.c(W); w2 = b.c(mul(W, 0.88)); w3 = b.c(mul(W, 1.05)); roof = b.c(0x7a6a5e); dark = b.c(0x34383e); gold = b.c(0xc4a040, 0.4, 0.5); door = b.c(0x5a4634)

    def tw(c):
        c.rect(0, 0, 1, 1, W); c.noise(0.05, 6); c.rect(0, 0, 0.12, 1, mul(W, 1.06), 0.75); c.rect(0.88, 0, 1, 1, mul(W, 1.06), 0.75)
        c.window(0.38, 0.15, 0.62, 0.82, 0x3a4458, mul(W, 0.8), arch=True, mull=(1, 3), surround=mul(W, 1.08)); c.rect(0, 0.94, 1, 1, mul(W, 0.86), 0.8)
    def bel(c):
        c.rect(0, 0, 1, 1, W); c.rect(0, 0, 0.1, 1, mul(W, 1.06), 0.75); c.rect(0.9, 0, 1, 1, mul(W, 1.06), 0.75)
        for x in (0.2, 0.55): c.arch(x, 0.1, x + 0.25, 0.72, 0x40444a, 0.25)
        for j in range(8): c.rect(0.2, 0.14 + j * 0.08, 0.8, 0.16 + j * 0.08, None, k=1.25)
        c.rect(0.45, 0, 0.55, 1, W); c.rect(0, 0.92, 1, 1, mul(W, 0.86), 0.8)
    def side(c):
        c.rect(0, 0, 1, 1, W); c.noise(0.05, 6); c.window(0.34, 0.2, 0.66, 0.85, 0x3a4458, mul(W, 0.8), arch=True, mull=(2, 3), surround=mul(W, 1.08))
        c.rect(0, 0, 0.07, 1, mul(W, 1.06), 0.75)
    def rose(c):
        c.rect(0, 0, 1, 1, W); c.ell(0.5, 0.5, 0.47, None, mul(W, 0.8)); c.ell(0.5, 0.5, 0.41, None, 0x3a4a6a)
        for i in range(8):
            a = math.pi * 2 * i / 8; c.line(0.5, 0.5, 0.5 + 0.41 * math.sin(a), 0.5 + 0.41 * math.cos(a), 1.6, mul(W, 0.85)); c.ell(0.5 + 0.27 * math.sin(a + 0.39), 0.5 + 0.27 * math.cos(a + 0.39), 0.07, None, 0x8a4a4a)
        c.ell(0.5, 0.5, 0.1, None, mul(W, 0.85))
    tw_s = b.band('tw', 128, tw, bay=8.4); bel_s = b.band('bel', 96, bel, bay=8.4); side_s = b.band('side', 96, side, bay=5.5)
    tiles = b.band('tiles', 32, p_tiles(0x7a6a5e, 12, 3, 0.85), bay=5.0); rose_d = b.decal('rose', 64, 64, rose)
    cx = 6.0; ZF = 24.0; T = 4.2; tx = 9.4
    NW, NH, NR = 8.0, 17.0, 23.0
    # nave, aisles, apse
    b.box(cx - NW, cx + NW, 0, NH, -24, ZF - 6, side_s, f=None, notop=True)
    b.gable(cx - NW - 0.3, cx + NW + 0.3, -24, ZF - 6, NH, NR - NH, tiles, w, axis='z')
    for sx in (-1, 1):
        x0, x1 = (cx + NW, cx + 14.5) if sx > 0 else (cx - 14.5, cx - NW)
        b.box(x0, x1, 0, 9.5, -20, ZF - 8, side_s, notop=True)
        q = [(cx + sx * 14.5, 9.5, ZF - 8), (cx + sx * 14.5, 9.5, -20), (cx + sx * NW, 12.0, -20), (cx + sx * NW, 12.0, ZF - 8)]
        b.face(q if sx > 0 else q[::-1], F(tiles, bay=5.0))
    # front between the towers
    zf = ZF - 0.8
    b.box(cx - tx + T, cx + tx - T, 0, NH + 2, ZF - 8, zf, w, l=None, r=None, bk=None, notop=True)
    b.face([(cx - tx + T, NH + 2, zf), (cx + tx - T, NH + 2, zf), (cx, NR + 3.5, zf)], w)
    b.face([(cx - 3.2, 10.5, zf + 0.05), (cx + 3.2, 10.5, zf + 0.05), (cx + 3.2, 16.9, zf + 0.05), (cx - 3.2, 16.9, zf + 0.05)], rose_d)
    b.arcade((cx - tx + T, zf + 0.6), (cx + tx - T, zf + 0.6), 0, 5.0, 9.4, 3, w3, depth=0.6, back=door, pier=0.4, aseg=6)
    b.box(cx - tx + T, cx + tx - T, 9.4, 9.9, zf, zf + 0.9, w2, bot=True)
    for k in range(3): b.box(cx - 8, cx + 8, 0, 0.9 - k * 0.3, zf + 0.6, zf + 1.2 + k * 0.6, w2)
    b.tube((cx, NR + 3.3, zf - 0.2), (cx, NR + 5.6, zf - 0.2), 0.12, gold, seg=4)
    # twin towers with octagonal belfries and spires
    for sx in (-1, 1):
        s = b.sub()
        y = s.stack(B.rect(-T, T, -T, T), 0, [(9.5, F(tw_s, rep=1)), (9.5, F(tw_s, rep=1)), (9.0, F(tw_s, rep=1))], None)
        s.box(-T - 0.4, T + 0.4, y, y + 0.8, -T - 0.4, T + 0.4, w2, bot=True); y += 0.8
        y = s.stack(B.rect(-T + 0.5, T - 0.5, -T + 0.5, T - 0.5), y, [(8.4, F(bel_s, rep=1))], None)
        s.box(-T, T, y, y + 0.7, -T, T, w2, bot=True); y += 0.7
        sg = 8
        s.lathe(0, 0, [(3.3, y), (3.3, y + 4.2), (3.6, y + 4.4), (3.6, y + 4.9)], sg, w, smooth=False)
        if s.hi:
            for i in range(8):
                a = math.radians(i * 45 + 22.5); s.bx(3.08 * math.sin(a), 3.08 * math.cos(a), 0.9, 0.9, y + 0.6, 3.0, dark)
            for cxx in (-1, 1):
                for cz in (-1, 1): s.frust((cxx * 3.6 - 0.6, cxx * 3.6 + 0.6, cz * 3.6 - 0.6, cz * 3.6 + 0.6), (cxx * 3.6, cxx * 3.6, cz * 3.6, cz * 3.6), y, y + 4.6, w3)
        s.lathe(0, 0, [(3.3, y + 4.9), (1.6, y + 10.5), (0.15, 56.2)], sg, w3, smooth=False)
        s.tube((0, 56.0, 0), (0, 58.0, 0), 0.1, gold, seg=4); s.beam((-0.6, 57.2, 0), (0.6, 57.2, 0), 0.15, 0.15, gold)
        b.add(s, t=(cx + sx * tx, 0, ZF - T))
    # rectory / school wing on -X
    off = office(b, W, 'rect', 5.0, nwin=2)
    b.stack(B.rect(-21, cx - 14.5, -24, 14), 0, [(4.0, off)] * 3, None)
    b.frust((-21.3, cx - 14.2, -24.3, 14.3), (-19, cx - 16.5, -22, 12), 12.0, 14.2, roof, top=roof)
    b.box(cx - 5, cx + 5, 0, 13.0, -24, -19.0, w, top=roof) if False else b.lathe(cx, -22.5, [(6.5, 0), (6.5, 13), (0, 16)], b.d(10, 5), w, a0=90, a1=270)


# ------------------------------------------------------------------ Sing Chong Building
@model('sing_chong_building', tier='B', fit=(24.5, 22.0, 18.0), face='south', stone=0x9a8a6a,
       desc="Sing Chong Building: four-storey corner block with green-and-red trim, tiled eaves, and the three-tier pagoda tower on the +X front corner")
def sing_chong(b):
    Wc = 0xb5a684
    w = b.c(Wc); red = b.c(0xa23a2a); green = b.c(0x2e7a4c, 0.5); gold = b.c(0xc9a23a, 0.5, 0.3); roof = b.c(0x5e6064); dark = b.c(0x33373c)
    def shop(c):
        c.rect(0, 0, 1, 1, 0x7a2a22); c.window(0.06, 0.05, 0.94, 0.72, 0x3a444c, 0xc9a23a, mull=(3, 1)); c.rect(0, 0.76, 1, 1, 0x2e7a4c, 0.8); c.rect(0, 0.74, 1, 0.78, 0xc9a23a)
    def up(c):
        c.rect(0, 0, 1, 1, Wc); c.noise(0.06, 6)
        for x in (0.1, 0.4, 0.7): c.window(x, 0.2, x + 0.2, 0.8, 0x39434c, 0x8a2f24, mull=(1, 2), surround=0x2e7a4c, sw=0.012)
        c.rect(0, 0, 1, 0.07, 0xa23a2a, 0.8)
    shop_s = b.band('shop', 64, shop, bay=5.0); up_s = b.band('up', 64, up, bay=6.0); tiles = b.band('tiles', 32, p_tiles(0x2f7d4e, 10, 3), bay=2.2)
    X, Z = 12.25, 9.0
    y = b.stack(B.rect(-X, X, -Z, Z), 0, [(4.6, shop_s), (3.5, up_s), (3.5, up_s), (3.5, up_s)], roof)
    b.box(-X, X, y, y + 0.9, -Z, Z, w, notop=True)
    # tiled eave on the two street fronts
    for (p0, p1, n_) in (((-X, Z), (X, Z), (0, 1)), ((X, Z), (X, -Z), (1, 0))):
        b.face([(p0[0] + n_[0] * 1.3, y - 0.5, p0[1] + n_[1] * 1.3), (p1[0] + n_[0] * 1.3, y - 0.5, p1[1] + n_[1] * 1.3), (p1[0], y + 0.7, p1[1]), (p0[0], y + 0.7, p0[1])], tiles)
        b.face([(p0[0], y - 0.55, p0[1]), (p1[0], y - 0.55, p1[1]), (p1[0] + n_[0] * 1.3, y - 0.55, p1[1] + n_[1] * 1.3), (p0[0] + n_[0] * 1.3, y - 0.55, p0[1] + n_[1] * 1.3)], red)
    # pagoda tower on the corner
    tx, tz = X - 3.4, Z - 3.4; yy = y
    for k, (wd, h) in enumerate(((6.0, 2.2), (4.8, 1.9), (3.6, 1.7))):
        b.bx(tx, tz, wd, wd, yy, h, red)
        if b.hi:
            for cx in (-1, 1):
                for cz in (-1, 1): b.bx(tx + cx * wd / 2, tz + cz * wd / 2, 0.4, 0.4, yy, h, green)
        yy = china_roof(b, tx, tz, wd + 2.6, wd + 2.6, yy + h, 1.25 if k < 2 else 2.0, tiles, green, 0.35, 0.3 if k < 2 else 0.06, None) - (0.5 if k < 2 else 0)
    b.lathe(tx, tz, [(0.3, yy - 0.3), (0.35, yy + 0.4), (0.0, 22.0)], 6, gold)


# ------------------------------------------------------------------ ships
def mast(b, x, z, h, yards, col, ycol, sail, r=0.42, rake=0.0):
    b.tube((x, 0, z), (x, h, z - rake * h), r, col, seg=b.d(8, 4), r1=r * 0.35)
    for (y, hl) in yards:
        zz = z - rake * y + 0.5
        b.tube((x - hl, y, zz), (x + hl, y, zz), 0.16, ycol, seg=4)
        if sail is not None and b.hi: b.beam((x - hl * 0.92, y + 0.3, zz), (x + hl * 0.92, y + 0.3, zz), 0.5, 0.45, sail)


@model('balclutha', tier='B', fit=(12.0, 44.0, 92.0), face='south', stone=0x2c2e32, waterline=True,
       desc="Balclutha: 1886 three-masted steel square-rigger, black hull with a white strake, deckhouses, bowsprit, three masts crossed by yards with furled sails and stays; y 0 = waterline, bow +Z")
def balclutha(b):
    black = b.c(0x26282c, 0.6); white = b.c(0xcfcdc6); red = b.c(0x7a3028); deck = b.c(0x9a8462); wood = b.c(0x7a5a3a); mastc = b.c(0xb89a62); sail = b.c(0xc8c2ae)
    rig = b.c(0x3a3a3a); house = b.c(0xc9c6bc); roofc = b.c(0x6a6e70)
    st = [(-39.0, 3.2, 5.6, 0.5), (-34, 4.9, 5.2, 0.7), (-22, 5.75, 4.7, 0.9), (0, 5.85, 4.4, 0.95), (18, 5.6, 4.6, 0.9), (30, 3.9, 5.2, 0.7), (36.5, 1.7, 5.9, 0.45), (40.0, 0.12, 6.4, 1.0)]
    if not b.hi: st = [st[0], st[2], st[4], st[6], st[7]]
    ship_hull(b, st, (black, white), deck, stern_cap=black)
    # bulwarks, poop and forecastle, deckhouses
    b.box(-4.4, 4.4, 5.0, 6.9, -38.0, -24, white, top=deck); b.box(-3.3, 3.3, 4.9, 7.2, 27, 36.0, white, top=deck)
    b.box(-2.4, 2.4, 4.5, 6.9, -12, -2, house, top=roofc); b.box(-2.4, 2.4, 4.5, 6.9, 8, 16, house, top=roofc)
    if b.hi:
        b.box(-1.2, 1.2, 6.9, 8.6, -34, -30, house, top=roofc)
        for sx in (-1, 1): b.box(sx * 5.6 - 0.1, sx * 5.6 + 0.1, 4.4, 5.6, -22, 22, black)
    # bowsprit + jib-boom
    b.tube((0, 6.3, 38.5), (0, 10.2, 52.0), 0.3, mastc, seg=b.d(6, 4), r1=0.12)
    # masts: fore, main, mizzen (all square rigged)
    ms = [(22.0, 41.5), (0.0, 44.0), (-22.0, 39.5)]
    for (z, h) in ms:
        yd = [(4.4 + h * 0.2, 12.5 * 0.5 * 1.0 + 3), (4.4 + h * 0.38, 8.2), (4.4 + h * 0.52, 7.0), (4.4 + h * 0.66, 5.6), (4.4 + h * 0.79, 4.4)]
        mast(b, 0, z, h, yd if b.hi else yd[::2], mastc, wood, sail, rake=0.03)
    # stays and shrouds
    tops = [(0, h, z - 0.03 * h) for (z, h) in ms]
    b.tube(tops[0], (0, 10.2, 52.0), 0.05, rig, seg=3); b.tube((0, 30, 21.1), (0, 8.5, 46), 0.05, rig, seg=3)
    b.tube(tops[1], (0, 12, 21.6), 0.05, rig, seg=3); b.tube(tops[2], (0, 12, -0.4), 0.05, rig, seg=3); b.tube(tops[2], (0, 7.5, -38), 0.05, rig, seg=3)
    if b.hi:
        for (z, h) in ms:
            for sx in (-1, 1):
                for dz in (-2.2, -0.8): b.tube((sx * 5.6, 4.8, z + dz), (0, h * 0.52, z - 0.03 * h * 0.52), 0.045, rig, seg=3)
    b.tube((0, 5.6, -39.2), (0, 9.5, -39.2), 0.06, mastc, seg=3); b.face([(0, 8.0, -39.2), (0, 8.0, -41.4), (0, 9.4, -41.4), (0, 9.4, -39.2)], red, two=True)


@model('pier_45_ships', tier='B', fit=(17.5, 30.0, 250.5), face='north', stone=0x7c8286, waterline=True,
       desc="Pier 45 ships in line (bows +Z): the grey Liberty ship SS Jeremiah O'Brien (midships house and funnel, three masts with cargo booms, gun tubs) ahead, the submarine USS Pampanito (low hull, fairwater, deck guns) astern; y 0 = waterline")
def pier_45_ships(b):
    grey = b.c(0x7c8286, 0.6); grey2 = b.c(0x6a7074, 0.6); grey3 = b.c(0x8e9498, 0.6); deck = b.c(0x5e6468); black = b.c(0x2a2c30, 0.5); dark = b.c(0x3c4046, 0.5)
    red = b.c(0x7a3028); boot = b.c(0x33363a)
    # ---- Liberty ship: z -9.75 .. 125.25 (135 m), beam 17.3
    z0 = -9.75; L = 135.0
    st = [(0.0, 5.6, 8.2, 0.55), (0.06, 8.0, 7.6, 0.8), (0.2, 8.65, 7.2, 0.95), (0.75, 8.65, 7.4, 0.95), (0.9, 6.6, 8.4, 0.75), (0.97, 2.6, 9.2, 0.4), (1.0, 0.15, 9.6, 1.0)]
    if not b.hi: st = [st[0], st[2], st[3], st[5], st[6]]
    ship_hull(b, [(z0 + t * L, hb, fb, fl) for (t, hb, fb, fl) in st], (grey2, grey), deck, stern_cap=grey2)
    zc = z0 + L * 0.47
    b.box(-6.6, 6.6, 7.2, 10.0, zc - 13, zc + 13, grey3, top=deck); b.box(-5.4, 5.4, 10.0, 12.6, zc - 10, zc + 9, grey3, top=deck); b.box(-4.2, 4.2, 12.6, 15.0, zc + 1, zc + 8.5, grey3, top=deck)
    b.lathe(0, zc - 3.5, [(1.9, 12.6), (1.8, 19.5)], b.d(10, 6), grey, capt=black, sq=1.3)
    b.lathe(0, zc - 3.5, [(1.85, 18.2), (1.82, 19.52)], b.d(10, 6), black, sq=1.3)
    for (zz, h) in ((z0 + L * 0.2, 27.0), (z0 + L * 0.72, 30.0), (z0 + L * 0.88, 26.0)):
        b.tube((0, 7.2, zz), (0, h, zz), 0.45, grey, seg=b.d(6, 4), r1=0.2); b.bx(0, zz, 5.0, 3.0, 7.2, 2.4, grey3)
        if b.hi:
            b.beam((-3.5, h * 0.72, zz), (3.5, h * 0.72, zz), 0.25, 0.25, grey)
            for sx in (-1, 1):
                for dz in (-1, 1): b.tube((sx * 1.2, 9.4, zz + dz * 0.8), (sx * 4.5, 17.0, zz + dz * 11.0), 0.18, grey3, seg=4)
    for zz in (z0 + 5.5, z0 + L - 9.0):   # gun tubs
        b.lathe(0, zz, [(2.9, 8.6), (3.1, 10.4)], b.d(10, 5), grey3, capb=grey3); b.tube((0, 10.0, zz), (0, 11.2, zz + 3.4), 0.16, dark, seg=4)
    for zz in (z0 + L * 0.31, z0 + L * 0.6, z0 + L * 0.8, z0 + L * 0.1): b.bx(0, zz, 7.0, 8.0, 7.2, 1.0, dark)   # hatches
    # ---- submarine: z -125.25 .. -30.25 (95 m), beam 8.3
    s0 = -125.25; SL = 95.0
    sst = [(0.0, 0.3, 0.6, 1.0), (0.08, 2.2, 1.7, 0.9), (0.3, 4.1, 2.1, 0.92), (0.7, 4.15, 2.2, 0.92), (0.92, 2.4, 2.7, 0.8), (1.0, 0.2, 3.2, 1.0)]
    ship_hull(b, [(s0 + t * SL, hb, fb, fl) for (t, hb, fb, fl) in sst], (boot, dark), dark)
    b.box(-1.6, 1.6, 2.1, 2.9, s0 + 8, s0 + SL - 6, dark, top=black)        # deck casing
    zs = s0 + SL * 0.52
    b.lathe(0, zs, [(1.5, 2.9), (1.4, 6.6)], b.d(8, 4), dark, capt=black, sq=3.2)       # fairwater
    b.tube((0, 6.6, zs + 1.2), (0, 12.0, zs + 1.2), 0.22, dark, seg=4, r1=0.12); b.tube((0, 6.6, zs - 0.6), (0, 10.4, zs - 0.6), 0.16, dark, seg=4)
    b.box(-1.2, 1.2, 6.6, 7.4, zs - 3.5, zs + 3.0, dark, notop=True)
    for (zz, sg) in ((zs + 12, 1), (zs - 12, -1)):
        b.bx(0, zz, 1.2, 1.6, 2.9, 1.1, dark); b.tube((0, 3.8, zz), (0, 4.6, zz + sg * 3.2), 0.13, black, seg=4)


# ------------------------------------------------------------------ pier sheds
def bulkhead(b, W, col, H=14.0, depth=12.0, arch_w=9.5, name='bh'):
    """neoclassical bulkhead building on the Embarcadero: central arched portal, office wings, raised centre parapet. Front at z = 0."""
    c1 = b.c(col); c2 = b.c(mul(col, 0.88)); c3 = b.c(mul(col, 1.07)); dark = b.c(0x30343a); roof = b.c(0x74787a)
    def wing(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.05, 6); c.joints(10, 2, 0.9)
        c.rect(0, 0, 0.08, 1, mul(col, 1.07), 0.75); c.rect(0.92, 0, 1, 1, mul(col, 1.07), 0.75)
        c.window(0.24, 0.08, 0.76, 0.46, 0x39434c, mul(col, 0.78), mull=(3, 2), surround=mul(col, 1.06)); c.window(0.24, 0.56, 0.76, 0.88, 0x39434c, mul(col, 0.78), arch=True, mull=(3, 2), surround=mul(col, 1.06))
        c.rect(0, 0.93, 1, 1, mul(col, 1.08), 0.8); c.rect(0, 0, 1, 0.05, mul(col, 0.85), 0.7)
    wing_s = b.band(name + 'wing', 128, wing, bay=5.0)
    hw = H * 0.72; cw = arch_w * 0.5 + 2.6
    b.box(-W / 2, W / 2, 0, hw, -depth, 0, wing_s, notop=True, f=None)
    for sx in (-1, 1):
        xa, xb = (cw, W / 2) if sx > 0 else (-W / 2, -cw)
        b.wall((xa, 0), (xb, 0), 0, hw, wing_s)
    b.arcade((-cw, 0.8), (cw, 0.8), 0, hw * 0.52, hw + H * 0.12, 1, c3, depth=1.8, back=dark, pier=1 - arch_w / (2 * cw), aseg=8, reveal=c2)
    b.wall((cw, 0.8), (cw, 0), 0, hw + H * 0.12, c3); b.wall((-cw, 0), (-cw, 0.8), 0, hw + H * 0.12, c3)
    b.box(-W / 2 - 0.3, W / 2 + 0.3, hw, hw + H * 0.07, -depth - 0.3, 0.3, c3, top=roof, bot=True)
    b.box(-cw - 0.4, cw + 0.4, hw + H * 0.12, hw + H * 0.2, -3.0, 1.2, c3, bot=True)
    b.gable(-cw - 0.4, cw + 0.4, -3.0, 1.2, hw + H * 0.2, H - (hw + H * 0.2), c2, c1, axis='z')
    return c1, c2, c3, dark, roof


@model('embarcadero_pier_shed', tier='B', fit=(45.0, 14.0, 180.0), face='west', stone=0xc4bfb2, water=True,
       ids=['pier_1', 'pier_3', 'pier_5', 'pier_9', 'pier_17', 'pier_19', 'pier_23', 'pier_29', 'pier_31', 'pier_33', 'pier_35', 'pier_26', 'pier_28', 'pier_38', 'pier_40'],
       extra="fit: 'footprint', stretch: 1.6, ",
       desc="Embarcadero bulkhead pier: arched neoclassical bulkhead building on +Z (portal arch, office wings, pedimented centre), long gabled transit shed with a roof monitor running back along -Z in repeating door bays (stretch-tolerant 0.7-1.6x)")
def pier_shed_model(b):
    col = 0xbdb8aa
    c1, c2, c3, dark, roof = bulkhead(b, 45.0, col)
    def bay(c):
        c.rect(0, 0, 1, 1, mul(col, 0.97)); c.noise(0.06, 6); c.rect(0, 0, 0.06, 1, mul(col, 1.06), 0.75)
        c.rect(0.14, 0.0, 0.48, 0.62, 0x5a6266, 0.3); c.joints(8, 0, 0.85, 1.0, reg=(0.14, 0, 0.48, 0.62))
        c.window(0.58, 0.3, 0.9, 0.62, 0x39434c, mul(col, 0.78), mull=(3, 2)); c.window(0.14, 0.72, 0.9, 0.9, 0x414b54, mul(col, 0.78), mull=(6, 1)); c.rect(0, 0.95, 1, 1, mul(col, 0.85), 0.7)
    bay_s = b.band('bay', 96, bay, bay=12.0); roof_s = b.band('roof', 32, p_tiles(0x7c8082, 10, 0, 0.88), bay=8.0)
    pier_shed(b, 42.0, 168.0, 12.6, bay_s, c1, roof_s, dark, c2, zf=-12.0, bulk=True)
    b.box(-21, 21, 0, 7.6, -180.5 + 0.5, -180.0, c1) if False else None
    b.arcade((21, -180.0), (-21, -180.0), 0, 4.0, 7.8, 1, c1, depth=0.5, back=dark, pier=0.7, aseg=6)
    b.box(-22.5, 22.5, 0, 0.02, -180.0, 0.0, c2) if False else None


@model('exploratorium_pier_15', tier='B', fit=(62.5, 15.0, 252.0), face='west', stone=0xcfccc2, water=True,
       desc="Exploratorium at Pier 15: white bulkhead building with the neoclassical portal arch on +Z, long white shed with a photovoltaic roof and monitor, glass Bay Observatory at the far end (-Z)")
def exploratorium(b):
    col = 0xc4c1b6
    c1, c2, c3, dark, roof = bulkhead(b, 62.5, col, H=15.0, depth=14.0, arch_w=11.0)
    def bay(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.05, 6); c.rect(0, 0, 0.05, 1, mul(col, 1.05), 0.75)
        c.window(0.12, 0.08, 0.9, 0.6, 0x3c4a54, mul(col, 0.78), mull=(5, 2)); c.window(0.12, 0.72, 0.9, 0.9, 0x414b54, mul(col, 0.78), mull=(6, 1))
    def pv(c):
        c.rect(0, 0, 1, 1, 0x2c3a52); c.vgrad(1.15, 0.9); c.joints(4, 8, 1.5, 1.0, stagger=False)
    bay_s = b.band('bay', 96, bay, bay=12.0); pv_s = b.band('pv', 32, pv, bay=8.0)
    pier_shed(b, 46.0, 206.0, 13.4, bay_s, c1, pv_s, dark, c2, zf=-14.0, bulk=True)
    # open apron on the +X side, the glass observatory at the end
    gl = b.band('glass', 64, p_glass(0x48626e, 6, 2, 0xb0b4b4), bay=10.0)
    b.stack(B.rect(-14, 22, -251.5, -222), 0, [(4.6, gl), (4.6, gl)], b.c(0xb8bcbc))
    b.box(-15, 23, 9.2, 9.6, -252.0, -221.5, c2, bot=True)
    b.box(23, 31.25, 0, 0.3, -252, -14, b.c(0x8a8478)); b.box(-31.25, -23, 0, 0.3, -252, -14, b.c(0x8a8478))


# ------------------------------------------------------------------ SFMOMA
@model('sfmoma', tier='B', fit=(84.5, 60.0, 108.5), face='north', stone=0x9a5a44,
       desc="SFMOMA: Botta's stepped red-brick blocks on +Z with the black-and-white striped cylinder sliced by a sloping skylight, and the tall white rippled Snohetta slab behind (-Z)")
def sfmoma(b):
    BR = 0x94523e
    brick = b.c(BR); white = b.c(0xcfd0cc); dark = b.c(0x30343a); glassc = b.c(0x55687a, 0.25); roof = b.c(0x6e7072); steel = b.c(0xb8bab8)
    def bband(c):
        c.brick(20, 10, BR, 0x8a6a5a, 0.1); c.joints(2, 0, 0.78, 2.0)
    def stripes(c):
        c.rect(0, 0, 1, 1, 0xc8c6be)
        for j in range(4): c.rect(0, j / 4, 1, j / 4 + 0.125, 0x2e3034)
    def ripple(c):
        c.rect(0, 0, 1, 1, 0xcbccc8)
        for j in range(8):
            y = j / 8
            for i in range(64):
                x = i / 64; dy = 0.035 * math.sin(i / 64 * math.pi * 4 + j * 1.7)
                c.rect(x, y + 0.045 + dy, x + 1 / 64 + 0.002, y + 0.075 + dy, None, 0.35, k=0.84)
            c.rect(0, y, 1, y + 0.012, 0x9aa0a4, 0.4)
        c.noise(0.05, 6)
    bb = b.band('bband', 64, bband, bay=6.0); rip = b.band('ripple', 128, ripple, bay=18.0)
    zeb = b.tile(stripes, 32, 64, 4.0, 3.2)
    # Botta: symmetric stepped boxes, front at z = +54
    ZF = 54.25; ZB = -18.0
    def step(hw, z0, z1, y0, y1):
        n = max(1, round((y1 - y0) / 4.6)); b.stack(B.rect(-hw, hw, z0, z1), y0, [((y1 - y0) / n, bb)] * n, roof)
    step(31, ZB, ZF, 0, 15); step(24, ZB, ZF - 10, 15, 25); step(16.5, ZB, ZF - 20, 25, 34)
    b.arcade((-7, ZF + 0.02), (7, ZF + 0.02), 0, 7.5, 7.6, 1, brick, depth=1.5, back=dark, pier=0.3, flat=True)
    # the striped cylinder with its sliced skylight
    cz = ZF - 34; R = 11.5; n = b.d(24, 12)
    def ytop(a): return 44.0 - 5.5 * math.cos(a)
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        p = lambda a, y: (R * math.sin(a), y, cz + R * math.cos(a))
        b.face([p(a0, 33), p(a1, 33), p(a1, ytop(a1)), p(a0, ytop(a0))], zeb)
    ring = [(R * math.sin(2 * math.pi * i / n), ytop(2 * math.pi * i / n), cz + R * math.cos(2 * math.pi * i / n)) for i in range(n)]
    b.face(ring, glassc)
    if b.hi:
        b.beam(ring[0], ring[n // 2], 0.6, 0.35, steel); b.beam(ring[n // 4], ring[3 * n // 4], 0.6, 0.35, steel)
    # Snohetta slab behind: tall, white, rippled; its long east face (+Z) bows out
    hw = 42.25; z0 = -54.25; H = 60.0; nseg = b.d(10, 5); nf = 8
    front = [(hw - (2 * hw) * i / nseg, ZB + 0.0 + 4.0 * math.sin(math.pi * i / nseg) - 4.0) for i in range(nseg + 1)]
    poly = [(-hw, z0), (hw, z0)] + front
    b.stack(poly, 0, [(H / nf, rip)] * nf, white)


# ------------------------------------------------------------------ Moscone Center
@model('moscone_center', tier='B', fit=(81.5, 30.0, 50.0), face='north', stone=0xa8b0b4,
       desc="Moscone Center: glass-and-white-steel convention lobby, projecting upper glass box on V struts, steel roof trusses and a barrel skylight over the hall")
def moscone(b):
    white = b.c(0xc9cccc, 0.5, 0.2); conc = b.c(0xa9a8a2); dark = b.c(0x30343a); roof = b.c(0x7a7e80)
    gl = b.band('glass', 64, p_glass(0x496272, 6, 2, 0xc0c4c4, 1.6), bay=9.0); gl2 = b.band('glass2', 64, p_glass(0x3d5464, 8, 3, 0x9aa0a2), bay=9.0)
    cb = b.band('conc', 32, p_ashlar(0xa9a8a2, 2, 2), bay=8.0)
    X, Z = 40.75, 25.0
    b.stack(B.rect(-X, X, -Z, Z - 7), 0, [(6.0, gl2), (6.0, cb), (6.0, cb)], roof)
    b.stack(B.rect(-X + 4, X - 4, Z - 16, Z), 6.5, [(5.5, gl), (5.5, gl), (5.5, gl)], white)       # projecting glass box
    b.box(-X + 3.5, X - 3.5, 6.0, 6.5, Z - 16.5, Z + 0.5, white, bot=True); b.box(-X + 3, X - 3, 23.0, 23.8, Z - 17, Z + 1.5, white, bot=True)
    n = b.d(8, 4)
    for i in range(n):
        x = -X + 9 + i * (2 * X - 18) / (n - 1)
        for dx in (-3.2, 3.2): b.tube((x, 0, Z - 2.5), (x + dx, 6.2, Z - 1.0), 0.32, white, seg=b.d(6, 4))
        if b.hi: b.beam((x, 23.8, Z + 1.2), (x, 28.6, -Z + 12), 0.4, 0.5, white)
    # barrel skylight + plant on the roof
    m = b.d(8, 4)
    ring = lambda x: [(x, 18.0 + 12.0 * math.sin(math.pi * k / m), -4 - 14 * math.cos(math.pi * k / m)) for k in range(m + 1)]
    b.loft([ring(-X + 8), ring(X - 8)], F(gl, rep=6), closed=False)
    b.face(ring(X - 8), white); b.face(ring(-X + 8)[::-1], white)
    b.bx(0, -Z + 4, 2 * X - 20, 5, 18, 3.0, conc)


# ------------------------------------------------------------------ Contemporary Jewish Museum
@model('contemporary_jewish_museum', tier='B', fit=(85.5, 20.0, 28.0), face='south', stone=0x9a5a44,
       desc="Contemporary Jewish Museum: the 1907 brick power substation front (arched windows, cornice) with the tilted blue steel cube standing on its corner at the +X end and the blue slanted 'chet' volume breaking through the roof")
def cjm(b):
    BR = 0x9a5c46
    brick = b.c(BR); trim = b.c(0xbcb4a2); blue = b.c(0x2a5c9a, 0.35, 0.6); blue2 = b.c(0x234e86, 0.35, 0.6); roof = b.c(0x6e7072); dark = b.c(0x30343a)
    def sub(c):
        c.brick(22, 6, BR, 0xa3907e, 0.1); c.rect(0, 0, 1, 0.1, 0xb0a898, 0.75); c.rect(0, 0.84, 1, 1, 0xbcb4a2, 0.8); c.rect(0, 0.84, 1, 0.86, k=0.7)
        c.rect(0, 0, 0.07, 0.84, 0xbcb4a2, 0.7); c.rect(0.93, 0, 1, 0.84, 0xbcb4a2, 0.7)
        c.window(0.24, 0.14, 0.76, 0.74, 0x343c44, 0x5a5e58, arch=True, mull=(3, 4), surround=0xbcb4a2, sw=0.03)
    def panel(c):
        c.rect(0, 0, 1, 1, 0x2a5c9a); c.noise(0.12, 5)
        for i in range(-6, 12): c.line(i / 6, 0, i / 6 + 0.5, 1, 1.0, None, None, k=0.82)
        c.joints(4, 0, 0.85, 1.0)
    sub_s = b.band('sub', 128, sub, bay=6.2); panel_s = b.band('panel', 64, panel, bay=6.0)
    X, Z = 42.75, 14.0
    b.box(-X, X - 22, 0, 13.4, -Z, Z - 2, sub_s, top=roof)
    b.box(-X - 0.4, X - 21.6, 13.4, 14.4, -Z - 0.4, Z - 1.6, trim, top=roof, bot=True)
    # the 'chet': a long blue slanted prism rising out of the roof
    s = b.sub(); s.box(-22, 16, 0, 8.0, -5.5, 5.5, panel_s, top=blue2, bot=True)
    b.add(s, t=(-8, 10.6, -3), rz=5, rx=-8)
    # the 'yud': a cube balanced on a corner
    E = 15.6; s = b.sub(); s.box(-E / 2, E / 2, -E / 2, E / 2, -E / 2, E / 2, F(panel_s, rep=2), top=blue2, bot=True)
    s2 = b.sub(); s2.add(s, rx=38, rz=0); s3 = b.sub(); s3.add(s2, rz=33, ry=0)
    ys = np.concatenate([p[:, 1] for k in 'ftp' for (p, n_, u) in s3.P[k]]); sc = 19.6 / (ys.max() - ys.min())
    b.add(s3, t=(X - 12.2, -ys.min() * sc, 3.0), ry=12, sc=(sc, sc, sc))
    b.box(X - 23, X, 0, 0.05, -Z, Z, roof); b.box(-X, X, 0, 0.04, Z - 2, Z, b.c(0x9a9890))


# ------------------------------------------------------------------ flatirons
def flatiron(b, W, D, H, col, name, tip=7.0, floors=10, cut=0.55, glass=0x39434c, cornice_col=None, base_col=None):
    """wedge block: square at the back (-Z), the +X side cut diagonally to a rounded prow at the front-left"""
    c1 = b.c(col); c3 = b.c(cornice_col or mul(col, 1.07)); roof = b.c(0x6e7072)
    def base(c):
        c.rect(0, 0, 1, 1, base_col or mul(col, 0.95)); c.noise(0.05, 6); c.joints(8, 0, 0.8, 1.5)
        c.window(0.12, 0.05, 0.88, 0.6, 0x3a464e, mul(col, 0.7), arch=True, mull=(3, 2), surround=mul(col, 1.08), sw=0.03)
        c.window(0.2, 0.7, 0.8, 0.9, glass, mul(col, 0.7), mull=(3, 1)); c.rect(0, 0.95, 1, 1, mul(col, 1.1), 0.8)
    def mid(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.05, 6); c.joints(6, 0, 0.92)
        for x in (0.12, 0.56): c.window(x, 0.18, x + 0.32, 0.82, glass, mul(col, 0.72), mull=(2, 2), surround=mul(col, 1.06), sw=0.012)
    def topb(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.05, 6)
        for x in (0.12, 0.56): c.window(x, 0.12, x + 0.32, 0.72, glass, mul(col, 0.72), arch=True, mull=(2, 2), surround=mul(col, 1.08), sw=0.02)
        c.rect(0, 0.82, 1, 1, mul(col, 1.1), 0.85); c.rect(0, 0.8, 1, 0.83, k=0.7)
        for i in range(12): c.rect(i / 12, 0.84, i / 12 + 0.04, 0.92, None, k=0.8)
    base_s = b.band(name + 'base', 96, base, bay=6.0); mid_s = b.band(name + 'mid', 64, mid, bay=6.0); top_s = b.band(name + 'top', 64, topb, bay=6.0)
    x0, x1, z0, z1 = -W / 2, W / 2, -D / 2, D / 2
    n = b.d(6, 3)
    cxp, czp = x0 + tip, z1 - tip
    zc = z0 + D * cut
    # prow arc from the -X side round the front to the diagonal
    ang0 = -90.0; dx, dz = (x1 - cxp), (zc - czp); ang1 = math.degrees(math.atan2(-dz, dx)) * -1 + 0
    d_ang = math.degrees(math.atan2(dx, -dz))   # direction of the diagonal seen from the tip
    a_end = d_ang - 90
    arc = [(cxp + tip * math.sin(math.radians(ang0 + (a_end + 180 - ang0 - 180 + 180) * 0)), 0)]  # placeholder (replaced below)
    arc = []
    a_start, a_stop = -90.0, 90.0 - (90 - math.degrees(math.atan2(czp - zc, x1 - cxp)))
    for i in range(n + 1):
        a = math.radians(a_start + (a_stop - a_start) * i / n); arc.append((cxp + tip * math.sin(a), czp + tip * math.cos(a)))
    poly = [(x0, z0), (x1, z0), (x1, zc)] + arc[::-1]
    fh = (H - 9.0 - 1.2) / (floors - 2)
    y = b.stack(poly, 0, [(9.0, base_s)] + [(fh, mid_s)] * (floors - 3) + [(fh, top_s)], roof)
    off = [(px + (0.9 if px > 0 else -0.9) * 0, pz) for (px, pz) in poly]
    b.prism(poly, y, y + 1.2, c3, top=roof)
    return y + 1.2, poly


@model('flood_building', tier='B', fit=(53.5, 50.0, 81.5), face='south', stone=0xa8a294,
       desc="Flood Building: twelve-storey grey sandstone flatiron, arcaded two-storey base, rounded prow at the Market and Powell corner (front -X), colonnaded top storey under a heavy cornice")
def flood_building(b):
    y, poly = flatiron(b, 53.5, 81.5, 50.0, 0xa69f90, 'fl', tip=8.0, floors=12, cut=0.5)
    b.box(-10, 6, y, y + 0.02, -30, -10, b.c(0x30343a)) if False else None


# ------------------------------------------------------------------ Old Mint
@model('old_mint', tier='B', fit=(58.5, 20.0, 67.5), face='west', stone=0xb0a48e,
       desc="Old Mint ('Granite Lady'): Greek Revival sandstone block on a granite basement, hexastyle Doric portico with pediment and broad steps on +Z, corner pavilions, courtyard, two tall brick chimneys at the rear")
def old_mint(b):
    S = 0xb3a78f
    s1 = b.c(S); s2 = b.c(mul(S, 0.88)); s3 = b.c(mul(S, 1.06)); gran = b.c(0x8f8c86); roof = b.c(0x6a6c6c); brick = b.c(0x8a4a3a); dark = b.c(0x30343a)
    def bas(c): c.rect(0, 0, 1, 1, 0x8f8c86); c.noise(0.06, 6); c.joints(4, 2, 0.75, 2.0); c.window(0.34, 0.25, 0.66, 0.8, 0x343c44, 0x6a6862, mull=(2, 1))
    def fl(c):
        c.rect(0, 0, 1, 1, S); c.noise(0.05, 6); c.joints(8, 2, 0.9)
        c.window(0.3, 0.12, 0.7, 0.86, 0x39434c, mul(S, 0.75), mull=(2, 3), surround=mul(S, 1.07), sw=0.03); c.rect(0.26, 0.88, 0.74, 0.93, mul(S, 1.1), 0.8)
    bas_s = b.band('bas', 64, bas, bay=4.6); fl_s = b.band('fl', 96, fl, bay=4.6)
    X, Z = 29.25, 30.0
    lv = [(3.4, bas_s), (5.6, fl_s), (5.0, fl_s)]
    y = b.stack(B.rect(-X, X, -Z, Z), 0, lv, roof)
    b.box(-X - 0.5, X + 0.5, y, y + 1.2, -Z - 0.5, Z + 0.5, s3, top=roof, bot=True)
    for sx in (-1, 1):   # corner pavilions step forward
        for sz in (-1, 1):
            x0, x1 = (X - 9, X + 0.9) if sx > 0 else (-X - 0.9, -X + 9); z0, z1 = (Z - 9, Z + 0.9) if sz > 0 else (-Z - 0.9, -Z + 9)
            yy = b.stack(B.rect(x0, x1, z0, z1), 0, lv, None); b.box(x0 - 0.4, x1 + 0.4, yy, yy + 1.6, z0 - 0.4, z1 + 0.4, s3, top=roof, bot=True)
    b.box(-14, 14, y + 1.0, y + 1.3, -12, 12, dark)    # courtyard well
    portico(b, 0, Z + 7.5, 22.0, 3.4, 10.6, 6, 0.95, s3, roof, depth=8.5, ped=3.2, ent=1.8, steps=5, seg=10, back=gran)
    for sx in (-1, 1):
        b.bx(sx * 9, -Z + 12, 2.6, 2.6, y, 20.0 - y - 0.6, brick); b.bx(sx * 9, -Z + 12, 3.1, 3.1, 19.4, 0.6, s2)


# ------------------------------------------------------------------ War Memorial (Opera House / Veterans Building)
@model('war_memorial', tier='B', fit=(72.0, 46.0, 96.0), face='east', stone=0xb9b4a6,
       ids=['war_memorial_opera_house', 'war_memorial_veterans_building'],
       desc="War Memorial Opera House / Veterans Building (matching pair): rusticated arcaded base, loggia of paired Doric columns before tall arched windows, entablature and balustrade, slate mansard, the tall stage / hall block behind")
def war_memorial(b):
    G = 0xb5b0a2
    g = b.c(G); g2 = b.c(mul(G, 0.88)); g3 = b.c(mul(G, 1.07)); slate = b.c(0x565e66); dark = b.c(0x30343a); roof = b.c(0x6e7072)
    base_s, main_s, att_s, ash_s = beaux(b, G, 5.2, main_floors=1)
    msl = b.band('mans', 32, p_tiles(0x565e66, 14, 4, 0.85), bay=5.0)
    X, Z = 36.0, 48.0; Y1, Y2, Y3 = 7.6, 20.6, 23.4
    b.box(-X, X, 0, Y1, -Z, Z, base_s, notop=True)
    b.box(-X, X, Y1, Y2, -Z, Z - 3.0, main_s, notop=True)
    for sx in (-1, 1):     # end pavilions flank the loggia
        b.box(min(sx * X, sx * (X - 9)), max(sx * X, sx * (X - 9)), Y1, Y2, Z - 3.0, Z, main_s, bk=None, notop=True)
    b.box(-X + 9, X - 9, Y1 - 0.01, Y1 + 0.9, Z - 0.5, Z, g3)   # balustrade
    b.cap(B.rect(-X, X, Z - 3.0, Z), Y1, g2)
    for i in range(6):   # paired columns across the loggia
        x = -X + 9 + 1.6 + i * (2 * X - 18 - 3.2) / 5
        for dx in (-0.85, 0.85): b.colonnade((x + dx, Z - 0.9), (x + dx, Z - 0.9), Y1 + 0.9, Y2 - Y1 - 0.9, 1, 0.62, g3, seg=8, base=False)
    b.box(-X - 0.6, X + 0.6, Y2, Y3, -Z - 0.6, Z + 0.6, g3, bot=True)
    b.box(-X, X, Y3, Y3 + 1.2, -Z, Z, g, notop=True)
    b.frust((-X + 1, X - 1, -Z + 1, Z - 1), (-X + 5, X - 5, -Z + 5, Z - 5), Y3, Y3 + 6.5, msl, top=roof)
    b.box(-X + 8, X - 8, Y3 + 6.5, 38.0, -Z + 8, Z - 30, ash_s if False else g, top=roof)        # auditorium / stage block
    b.frust((-X + 8, X - 8, -Z + 8, -Z + 40), (-X + 12, X - 12, -Z + 12, -Z + 36), 38.0, 46.0, msl, top=roof)
    for k in range(3): b.box(-X + 10, X - 10, 0, 0.9 - 0.3 * k, Z, Z + 0.7 * (k + 1), g2)


# ------------------------------------------------------------------ Davies Symphony Hall
@model('davies_symphony_hall', tier='B', fit=(84.5, 30.0, 121.5), face='east', stone=0xb9b5a8,
       desc="Davies Symphony Hall: bowed glass lobby front on +Z wrapped by concrete fins and a deep concrete band, the boxy hall with its copper-green roof behind")
def davies(b):
    C = 0xb7b3a6
    conc = b.c(C); conc2 = b.c(mul(C, 0.9)); green = b.c(0x6f9484, 0.6); roof = b.c(0x74787a); dark = b.c(0x30343a)
    gl = b.band('glass', 64, p_glass(0x41586a, 4, 3, 0xa0a49e, 1.6), bay=6.0); cb = b.band('conc', 32, p_ashlar(C, 3, 2, k=0.9), bay=8.0)
    def side(c):
        c.rect(0, 0, 1, 1, C); c.noise(0.06, 6); c.joints(4, 2, 0.9); c.window(0.3, 0.2, 0.7, 0.75, 0x39434c, mul(C, 0.75), mull=(2, 2))
    side_s = b.band('side', 64, side, bay=8.0)
    X = 42.25; zb = -60.75; zc = 22.0; R = 38.5
    b.stack(B.rect(-X, X, zb, zc), 0, [(6.5, side_s), (6.5, side_s), (6.0, cb)], roof)
    b.frust((-X + 6, X - 6, zb + 8, zc - 6), (-X + 14, X - 14, zb + 16, zc - 14), 19.0, 30.0, green, top=green)
    # bowed front: semicircle of glass with fins, concrete crown band
    n = b.d(18, 9)
    for (r, y0, y1, sk) in ((R - 2.2, 0, 14.5, gl), (R, 14.5, 20.5, cb)):
        b.lathe(0, zc, [(r, y0), (r, y1)], n, sk, smooth=False, a0=-90, a1=90, ub=1)
    arc = lambda r: [(r * math.sin(math.radians(-90 + 180 * i / n)), zc + r * math.cos(math.radians(-90 + 180 * i / n))) for i in range(n + 1)]
    b.cap(arc(R), 20.5, roof); b.cap(arc(R), 14.5, conc2, up=False)
    b.lathe(0, zc, [(R - 7, 20.5), (R - 7, 23.5)], n, cb, smooth=False, a0=-90, a1=90, ub=1); b.cap(arc(R - 7), 23.5, roof)
    for i in range(n + 1):
        if i % 2 and not b.hi: continue
        a = math.radians(-90 + 180 * i / n); b.tube(((R - 1.0) * math.sin(a), 0, zc + (R - 1.0) * math.cos(a)), ((R - 1.0) * math.sin(a), 14.5, zc + (R - 1.0) * math.cos(a)), 0.55, conc, seg=4)


# ------------------------------------------------------------------ Asian Art Museum
@model('asian_art_museum', tier='B', fit=(55.0, 25.0, 106.5), face='west', stone=0xb9b5aa,
       desc="Asian Art Museum (old Main Library): Beaux-Arts granite, rusticated arcaded base, upper loggia of Ionic columns before arched windows on +Z, pilastered sides, skylit court roofs")
def asian_art(b):
    G = 0xb6b2a6
    g = b.c(G); g2 = b.c(mul(G, 0.88)); g3 = b.c(mul(G, 1.07)); roof = b.c(0x74787a); glassc = b.c(0x5a707c, 0.3); dark = b.c(0x30343a)
    base_s, main_s, att_s, ash_s = beaux(b, G, 5.0, main_floors=1)
    X, Z = 27.5, 53.25; Y1, Y2, Y3 = 7.0, 18.6, 21.2
    b.box(-X, X, 0, Y1, -Z, Z, base_s, notop=True)
    b.box(-X, X, Y1, Y2, -Z, Z - 2.6, main_s, notop=True)
    for sx in (-1, 1): b.box(min(sx * X, sx * (X - 6.5)), max(sx * X, sx * (X - 6.5)), Y1, Y2, Z - 2.6, Z, main_s, bk=None, notop=True)
    b.colonnade((-X + 7.6, Z - 0.9), (X - 7.6, Z - 0.9), Y1, Y2 - Y1, 9, 0.7, g3, seg=8)
    b.cap(B.rect(-X, X, Z - 2.6, Z), Y1, g2)
    b.box(-X - 0.6, X + 0.6, Y2, Y3, -Z - 0.6, Z + 0.6, g3, bot=True)
    b.box(-X + 1.5, X - 1.5, Y3, Y3 + 2.4, -Z + 1.5, Z - 1.5, att_s, top=roof)
    for zc in (-22, 18):   # skylights over the courts
        b.gable(-12, 12, zc - 12, zc + 12, Y3 + 2.4, 1.4, glassc, glassc, axis='z')
    for k in range(4): b.box(-13, 13, 0, 1.6 - 0.4 * k, Z, Z + 0.8 * (k + 1), g2)


# ------------------------------------------------------------------ Main Library
@model('sf_main_library', tier='B', fit=(57.0, 30.0, 106.5), face='west', stone=0xb4b2ac,
       desc="San Francisco Main Library: grey granite gridded block echoing its Beaux-Arts neighbours on +Z, glass-and-steel modern sides, the round atrium skylight drum on the roof")
def main_library(b):
    G = 0xb0aea6
    g = b.c(G); g2 = b.c(mul(G, 0.88)); g3 = b.c(mul(G, 1.06)); roof = b.c(0x74787a); glassc = b.c(0x58707e, 0.3); steel = b.c(0xb0b4b4, 0.5, 0.3)
    def grid(c):
        c.rect(0, 0, 1, 1, G); c.noise(0.05, 6); c.joints(6, 3, 0.9, 1.0, stagger=False)
        c.window(0.2, 0.14, 0.8, 0.86, 0x3a4650, mul(G, 0.75), mull=(3, 3), surround=mul(G, 1.06), sw=0.02)
    def basef(c):
        c.rect(0, 0, 1, 1, mul(G, 0.95)); c.noise(0.05, 6); c.joints(6, 2, 0.78, 1.8); c.window(0.3, 0.1, 0.7, 0.75, 0x3a4650, mul(G, 0.75), mull=(2, 2))
    grid_s = b.band('grid', 96, grid, bay=6.0); base_s = b.band('basef', 64, basef, bay=6.0); gl = b.band('glass', 64, p_glass(0x47606e, 6, 3, 0xb0b4b4, 1.4), bay=8.0)
    X, Z = 28.5, 53.25
    y = b.stack(B.rect(-X, X, -10, Z), 0, [(6.0, base_s), (6.2, grid_s), (6.2, grid_s), (5.2, grid_s)], roof)
    b.box(-X - 0.5, X + 0.5, y, y + 1.0, -10.5, Z + 0.5, g3, top=roof, bot=True)
    b.stack(B.rect(-X, X, -Z, -10), 0, [(6.0, base_s), (6.2, gl), (6.2, gl), (5.2, gl)], roof)      # the modern (Hyde St) half
    b.box(-X - 0.3, X + 0.3, y, y + 0.6, -Z - 0.3, -10, steel, top=roof, bot=True)
    b.arcade((-9, Z + 0.6), (9, Z + 0.6), 0, 6.0, 12.4, 1, g3, depth=1.4, back=glassc, pier=0.4, flat=True)
    b.box(-9, 9, 12.4, 13.2, Z, Z + 1.0, g3, bot=True)
    n = b.d(16, 8)   # atrium drum + conical glass skylight
    b.lathe(0, 8, [(10.5, y + 1.0), (10.5, y + 4.0), (11.0, y + 4.2)], n, steel, smooth=False)
    b.lathe(0, 8, [(11.0, y + 4.2), (2.5, 29.0), (0, 30.0)], n, glassc, smooth=False)
    b.box(-X + 3, -X + 14, y, y + 3.2, -40, -20, g2, top=roof)


# ------------------------------------------------------------------ Bill Graham Civic Auditorium
@model('bill_graham_civic_auditorium', tier='B', fit=(128.0, 30.0, 79.0), face='north', stone=0xb7b2a4,
       desc="Bill Graham Civic Auditorium: 1915 Beaux-Arts granite front on +Z with seven great arched windows between columns over the entrance doors and marquee, flanking wings, the broad low octagonal arena roof")
def bill_graham(b):
    G = 0xb4afa1
    g = b.c(G); g2 = b.c(mul(G, 0.88)); g3 = b.c(mul(G, 1.07)); roof = b.c(0x7c8082); dark = b.c(0x30343a); bronze = b.c(0x6a5a3a, 0.5, 0.4)
    base_s, main_s, att_s, ash_s = beaux(b, G, 6.0, main_floors=1)
    X, Z = 64.0, 39.5; Y1, Y2, Y3 = 7.5, 19.5, 22.2
    b.box(-X, X, 0, Y1, -Z, Z - 2.5, base_s, notop=True); b.box(-X, X, Y1, Y2, -Z, Z - 2.5, main_s, notop=True)
    b.box(-X - 0.5, X + 0.5, Y2, Y3, -Z - 0.5, Z - 2.0, g3, bot=True); b.box(-X + 1.5, X - 1.5, Y3, Y3 + 2.2, -Z + 1.5, Z - 4.0, att_s, top=roof)
    # centre pavilion: seven tall arches behind free-standing columns
    cw = 30.0
    b.box(-cw, cw, 0, Y1, Z - 2.5, Z, base_s, bk=None, notop=True); b.cap(B.rect(-cw - 1, cw + 1, Z - 2.5, Z + 1.4), Y1 - 0.02, g2)
    b.arcade((-cw, Z - 0.4), (cw, Z - 0.4), Y1, Y1 + 6.4, Y2, 7, g, depth=1.2, back=dark, pier=0.36, aseg=8, reveal=g2)
    b.wall((cw, Z - 0.4), (cw, Z - 2.5), Y1, Y2, g); b.wall((-cw, Z - 2.5), (-cw, Z - 0.4), Y1, Y2, g)
    b.colonnade((-cw, Z + 0.5), (cw, Z + 0.5), Y1, Y2 - Y1, 8, 0.72, g3, seg=8)
    b.box(-cw - 0.8, cw + 0.8, Y2, Y3 + 0.6, Z - 2.6, Z + 1.4, g3, bot=True)
    b.box(-cw - 0.3, cw + 0.3, Y1 - 0.5, Y1, Z, Z + 1.4, g3, bot=True)
    b.box(-14, 14, 4.2, 4.9, Z, Z + 3.4, bronze, bot=True)     # marquee
    # arena roof: low octagonal dome
    n = 8
    b.lathe(0, -4, [(46, Y3 + 2.2), (46, Y3 + 4.0), (30, 28.0), (8, 29.6), (0, 30.0)], n, roof, smooth=False, sq=0.62)


# ------------------------------------------------------------------ Third Street (Lefty O'Doul) Bridge
@model('third_street_bridge', tier='B', fit=(88.5, 25.0, 33.5), face='east', stone=0x6f7a74,
       desc="Lefty O'Doul (Third Street) Bridge: Strauss heel-trunnion bascule, span along X, leaf lowered; riveted through-truss leaf, the tower frame at -X carrying the great concrete counterweight over the roadway, operator houses; road deck top at y 0.3")
def third_street_bridge(b):
    steel = b.c(0x6f7a74, 0.6, 0.4); steel2 = b.c(0x5e6862, 0.6, 0.4); conc = b.c(0xa39f93); conc2 = b.c(0x8c897f); road = b.c(0x4a4c4e); house = b.c(0xb5b0a0); roofc = b.c(0x5a5e60)
    ZT = 9.6    # truss planes at z = +-ZT
    b.box(-44.25, 44.25, 0, 0.3, -11.6, 11.6, conc2, top=road)
    for sz in (-1, 1): b.box(-44.25, 44.25, 0.3, 1.3, sz * 11.6 - 0.2, sz * 11.6 + 0.2, steel2)
    # piers under the trunnion end widen the footprint
    b.box(-30, -6, 0, 0.22, -16.75, 16.75, conc); b.box(30, 38, 0, 0.22, -16.75, 16.75, conc)
    # leaf: two through trusses from the trunnion (x = -10) to the toe (x = 34), top chord rising toward the tower
    xs = [-10 + i * 5.5 for i in range(9)]
    def top(x): return 6.0 + 6.5 * ((34 - x) / 44.0) ** 1.4
    for sz in (-1, 1):
        z = sz * ZT
        b.beam((xs[0], 1.0, z), (xs[-1], 1.0, z), 0.6, 0.9, steel)
        for i in range(len(xs) - 1):
            b.beam((xs[i], top(xs[i]), z), (xs[i + 1], top(xs[i + 1]), z), 0.6, 0.7, steel)
            if b.hi or i % 2 == 0: b.beam((xs[i], 1.0, z), (xs[i], top(xs[i]), z), 0.45, 0.45, steel2)
            if b.hi: b.beam((xs[i], top(xs[i]), z) if i % 2 == 0 else (xs[i], 1.0, z), (xs[i + 1], 1.0, z) if i % 2 == 0 else (xs[i + 1], top(xs[i + 1]), z), 0.35, 0.35, steel2)
        b.beam((xs[-1], 1.0, z), (xs[-1], top(xs[-1]), z), 0.45, 0.45, steel2)
    for i in range(0, len(xs), b.d(1, 2)):   # portal / sway bracing overhead
        if top(xs[i]) > 6.4: b.beam((xs[i], top(xs[i]), -ZT), (xs[i], top(xs[i]), ZT), 0.35, 0.5, steel2)
    # tower: A-frames each side at x = -22 .. -10, counterweight hung at the top behind the trunnion
    for sz in (-1, 1):
        z = sz * ZT
        b.beam((-10, 0.3, z), (-16, 21.0, z), 0.8, 0.9, steel); b.beam((-28, 0.3, z), (-16, 21.0, z), 0.8, 0.9, steel)
        b.beam((-13, 10.5, z), (-22, 10.5, z), 0.5, 0.5, steel2)
        b.beam((-16, 21.0, z), (-10, top(-10), z), 0.5, 0.6, steel2)       # link to the leaf
        b.beam((-16, 21.0, z), (-25, 19.5, z), 0.6, 0.8, steel)            # counterweight arm
        if b.hi: b.beam((-13, 10.5, z), (-28, 0.3, z), 0.35, 0.35, steel2); b.lathe(-16, z, [(0.9, 20.4), (0.9, 21.6)], 6, steel2, capt=steel2)
    b.beam((-16, 21.0, -ZT), (-16, 21.0, ZT), 0.6, 0.6, steel2)
    b.box(-31.5, -22.5, 12.5, 20.0, -ZT - 1.4, ZT + 1.4, conc, bot=True)    # the concrete counterweight
    if b.hi: b.box(-31.7, -22.3, 15.6, 16.0, -ZT - 1.6, ZT + 1.6, conc2, bot=True)
    b.tube((-16, 21.0, 0), (-16, 25.0, 0), 0.12, steel2, seg=4)
    # operator houses
    for (x, sz) in ((-4, 1), (38, -1)):
        b.bx(x, sz * 14.3, 4.6, 4.2, 0.3, 4.4, house); b.frust((x - 2.6, x + 2.6, sz * 14.3 - 2.4, sz * 14.3 + 2.4), (x, x, sz * 14.3, sz * 14.3), 4.7, 6.4, roofc)


run()
