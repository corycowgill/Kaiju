# icons_build_c.py - tier C landmarks.   blender -b -P icons_build_c.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import icons_lib
from icons_lib import *
_keep = dict(MODELS); _argv = sys.argv; sys.argv = ['x', '--', '__none__']      # borrow helpers from the tier B file without building it
import icons_build_b as BB
sys.argv = _argv
for k in list(MODELS):
    if k not in _keep: del MODELS[k]


@model('old_st_marys', tier='C', fit=(42.5, 27.0, 46.5), face='south', stone=0x8f4a38,
       desc="Old St. Mary's Cathedral: 1854 red-brick Gothic church, central square clock tower with crenellated top on +Z, gabled nave, the rectory block alongside (+X)")
def old_st_marys(b):
    BR = 0x8e4c3a
    brick = b.c(BR); trim = b.c(0xb5ab98); slate = b.c(0x5a6066); dark = b.c(0x30343a); gold = b.c(0xc4a040, 0.4, 0.5)
    def side(c):
        c.brick(20, 6, BR, 0x9a8676, 0.12)
        h = 0.26 * c.w / c.h * 0.9
        c.poly([(0.36, 0.15), (0.64, 0.15), (0.64, 0.8 - h * 0.3), (0.5, 0.86), (0.36, 0.8 - h * 0.3)], 0x3a4458, 0.25); c.rect(0, 0, 0.08, 1, mul(BR, 1.12), 0.75)
    side_s = b.band('side', 96, side, bay=5.0); pl = b.band('plain', 64, p_brick(BR, 12, 6, 0x9a8676), bay=5.0)
    off = BB.office(b, BR, 'rect', 5.0, nwin=2, brick=(14, 6, 0x9a8676), frame=0xb5ab98)
    clock = b.decal('clock', 64, 64, p_clock(0xd6d0bc, 0x2a2a2c, 0x5e584c, BR))
    cx = -8.0; NW = 10.5; ZF = 23.25
    b.box(cx - NW, cx + NW, 0, 13.0, -23.25, ZF - 3, side_s, notop=True)
    b.gable(cx - NW - 0.3, cx + NW + 0.3, -23.25, ZF - 3, 13.0, 6.0, slate, brick, axis='z')
    T = 3.6
    y = b.stack(B.rect(cx - T, cx + T, ZF - 2 * T, ZF), 0, [(7.0, pl), (7.0, F(side_s, rep=1)), (5.0, pl)], None)
    b.arcade((cx - T, ZF + 0.02), (cx + T, ZF + 0.02), 0, 3.2, 6.0, 1, brick, depth=0.6, back=dark, pier=0.55, aseg=6)
    for a in range(4):
        s = b.sub(); s.face([(-1.6, 19.3, T + 0.05), (1.6, 19.3, T + 0.05), (1.6, 22.5, T + 0.05), (-1.6, 22.5, T + 0.05)], clock); b.add(s, t=(cx, 0, ZF - T), ry=a * 90)
    y = b.stack(B.rect(cx - T, cx + T, ZF - 2 * T, ZF), y, [(4.5, pl)], slate)
    b.box(cx - T - 0.3, cx + T + 0.3, y, y + 0.5, ZF - 2 * T - 0.3, ZF + 0.3, trim, bot=True)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.bx(cx + sx * (T - 0.3), ZF - T + sz * (T - 0.3), 1.0, 1.0, y + 0.5, 2.4, trim)
            if b.hi: b.bx(cx + sx * (T - 0.3) * (1 if sz > 0 else 0), ZF - T + sz * (T - 0.3) * (1 if sz > 0 else 0) + (0 if sz > 0 else sx * (T - 0.3)), 1.0, 1.0, y + 0.5, 1.2, trim)
    b.tube((cx, y, ZF - T), (cx, 27.0, ZF - T), 0.1, gold, seg=4); b.beam((cx - 0.5, 26.2, ZF - T), (cx + 0.5, 26.2, ZF - T), 0.14, 0.14, gold)
    # rectory / Paulist centre on +X
    yy = b.stack(B.rect(cx + NW, 21.25, -23.25, 16), 0, [(4.0, off)] * 3, slate)
    b.box(cx + NW, 21.25, yy, yy + 0.8, -23.25, 16, brick, notop=True)
    b.box(-21.25, cx - NW, 0, 0.03, -23.25, 23.25, b.c(0x8a8880))


@model('bank_of_canton_pagoda', tier='C', fit=(9.0, 12.0, 11.0), face='east', stone=0xa03028,
       desc="Old Chinese Telephone Exchange: three-tier red lacquer pagoda with green-tiled curled eaves and gold trim")
def pagoda(b):
    red = b.c(0xa2342a, 0.6); green = b.c(0x2e7a4c, 0.5); gold = b.c(0xc9a23a, 0.5, 0.3); dark = b.c(0x2c3036); black = b.c(0x3a2a26)
    tiles = b.band('tiles', 32, p_tiles(0x2f7d4e, 10, 3), bay=2.0)
    def wall(c):
        c.rect(0, 0, 1, 1, 0xa2342a); c.window(0.2, 0.12, 0.8, 0.8, 0x333a40, 0xc9a23a, mull=(3, 2)); c.rect(0, 0.88, 1, 1, 0x2e7a4c); c.rect(0, 0, 0.08, 1, 0x7a241e); c.rect(0.92, 0, 1, 1, 0x7a241e)
    wall_s = b.band('wall', 64, wall, bay=3.0)
    y = 0
    for k, (w, d, h) in enumerate(((7.0, 9.0, 3.6), (5.6, 7.4, 2.4), (4.2, 5.8, 2.0))):
        b.box(-w / 2, w / 2, y, y + h, -d / 2, d / 2, wall_s, notop=True)
        last = k == 2
        y = china_roof(b, 0, 0, w + 2.0, d + 2.0, y + h, 1.1 if not last else 1.9, tiles, green, 0.4, 0.4 if not last else 0.3, gold if last else None) - (0.45 if not last else 0)
    b.lathe(0, 0, [(0.25, y), (0.3, y + 0.3), (0.0, 12.0)], 6, gold)


@model('pier_45_sheds', tier='C', fit=(100.0, 14.0, 484.0), face='east', stone=0xc9c6ba, water=True,
       desc="Pier 45: four long white fish-processing sheds in two rows (A / B on -X, C / D on +X) with arched end fronts and roof monitors, the open valley between them")
def pier_45_sheds(b):
    col = 0xc2bfb2
    c1 = b.c(col); c2 = b.c(mul(col, 0.88)); dark = b.c(0x30343a)
    def bay(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.06, 6); c.rect(0, 0, 0.05, 1, mul(col, 1.05), 0.75)
        c.rect(0.14, 0.0, 0.5, 0.6, 0x5c6468, 0.3); c.joints(8, 0, 0.85, 1.0, reg=(0.14, 0, 0.5, 0.6)); c.window(0.6, 0.3, 0.9, 0.6, 0x39434c, mul(col, 0.78), mull=(3, 2)); c.rect(0, 0.92, 1, 1, mul(col, 0.85), 0.7)
    bay_s = b.band('bay', 96, bay, bay=12.0); roof_s = b.band('roof', 32, p_tiles(0x808486, 10, 0, 0.88), bay=8.0)
    for sx in (-1, 1):
        for (zf, L) in ((242.0, 236.0), (-6.0, 236.0)):
            s = b.sub(); pier_shed(s, 44.0, L - 1.2, 14.0, bay_s, c1, roof_s, dark, c2, zf=-1.2)
            for (z, d) in ((0.0, 1), (-L, -1)):   # arched ends
                p0, p1 = ((-22, z), (22, z)) if d > 0 else ((22, z), (-22, z))
                s.arcade(p0, p1, 0, 4.4, 8.6, 3, c1, depth=1.2, back=dark, pier=0.45, aseg=6, reveal=c2)
                s.face([(p0[0], 8.6, z), (p1[0], 8.6, z), (0, 12.3, z)], c1)
            b.add(s, t=(sx * 28.0, 0, zf))


@model('aquarium_of_the_bay', tier='C', fit=(41.5, 14.0, 75.5), face='south', stone=0x8aa0b0, water=True,
       desc="Aquarium of the Bay: two-storey white-and-blue waterfront hall at the Pier 39 entrance, glass entry corner, blue wave fascia and rooftop fin sign, fish mural on the side")
def aquarium(b):
    white = b.c(0xc9cac4); blue = b.c(0x2f6a9a); blue2 = b.c(0x245680); roof = b.c(0x7a7e80); dark = b.c(0x30343a)
    def wall(c):
        c.rect(0, 0, 1, 1, 0xc9cac4); c.noise(0.05, 6); c.joints(0.0001 and 1, 8, 0.92, 1.0, stagger=False); c.window(0.2, 0.25, 0.8, 0.7, 0x3c4c58, 0x8a9094, mull=(3, 1))
        c.rect(0, 0.86, 1, 1, 0x2f6a9a)
        for i in range(8): c.ell(i / 8 + 0.06, 0.86, 0.07, 0.035, 0x2f6a9a)
    def mural(c):
        c.rect(0, 0, 1, 1, 0x2a5a86); c.vgrad(1.2, 0.8)
        for (x, y, r, col) in ((0.2, 0.6, 0.09, 0xc87a3a), (0.5, 0.4, 0.13, 0x8aa8b0), (0.78, 0.65, 0.08, 0xc8b040), (0.66, 0.25, 0.05, 0xb05a4a)):
            c.ell(x, y, r, r * 0.9, col); c.poly([(x - r, y), (x - r * 1.7, y + r * 0.8), (x - r * 1.7, y - r * 0.8)], col)
    wall_s = b.band('wall', 64, wall, bay=7.0); gl = b.band('glass', 64, p_glass(0x47657a, 5, 2, 0xb8bcbc, 1.4), bay=7.0)
    mur = b.decal('mural', 128, 64, mural)
    X, Z = 20.75, 37.75
    b.stack(B.rect(-X, X, -Z, Z - 8), 0, [(5.0, wall_s), (5.0, wall_s)], roof)
    b.stack(B.rect(-X + 4, X - 4, Z - 8, Z), 0, [(4.0, gl), (4.0, gl)], white)
    b.box(-X + 3, X - 3, 8.0, 8.6, Z - 9, Z + 1.2, blue, bot=True)
    b.face([(X + 0.05, 1.5, 10), (X + 0.05, 1.5, -22), (X + 0.05, 9.0, -22), (X + 0.05, 9.0, 10)], mur)
    b.face([(-X - 0.05, 1.5, -22), (-X - 0.05, 1.5, 10), (-X - 0.05, 9.0, 10), (-X - 0.05, 9.0, -22)], mur)
    n = b.d(10, 5)   # the wave fin on the roof
    pts = [(-12 + 24 * i / n, 10.0 + 2.0 + 1.9 * math.sin(i / n * math.pi * 2.0)) for i in range(n + 1)]
    for i in range(n):
        b.face([(pts[i][0], 10.0, Z - 12), (pts[i + 1][0], 10.0, Z - 12), (pts[i + 1][0], pts[i + 1][1], Z - 12), (pts[i][0], pts[i][1], Z - 12)], blue if i % 2 else blue2)
    b.bx(0, -10, 18, 30, 10.0, 1.6, white, top=roof); b.tube((14, 10, Z - 12), (14, 14.0, Z - 12), 0.1, white, seg=4)


@model('pier_27_cruise_terminal', tier='C', fit=(197.0, 18.0, 41.5), face='west', stone=0xc4c8c8, water=True,
       desc="James R. Herman Cruise Terminal (Pier 27): long two-storey glass-and-white terminal with a rising mono-pitch roof on raking struts, glazed entrance hall, gangway tower")
def pier_27(b):
    white = b.c(0xc8cbca, 0.5, 0.1); roof = b.c(0x8a8e90); steel = b.c(0xb0b4b4, 0.5, 0.3); dark = b.c(0x30343a); conc = b.c(0xa5a39c)
    gl = b.band('glass', 64, p_glass(0x47626e, 6, 2, 0xc0c4c4, 1.5), bay=9.0)
    def panel(c):
        c.rect(0, 0, 1, 1, 0xc8cbca); c.noise(0.05, 6); c.joints(2, 6, 0.9, 1.0, stagger=False); c.window(0.1, 0.3, 0.9, 0.62, 0x41525c, 0x9aa0a2, mull=(6, 1))
    pan = b.band('panel', 64, panel, bay=9.0)
    X, Z = 98.5, 20.75
    b.box(-X, X, 0, 5.2, -Z, Z - 3, pan, f=gl, notop=True); b.box(-X, X, 5.2, 10.4, -Z, Z - 3, pan, f=gl, notop=True)
    # mono-pitch roof rising to the front, overhanging on struts
    q = [(-X - 1, 15.6, Z), (X + 1, 15.6, Z), (X + 1, 10.4, -Z), (-X - 1, 10.4, -Z)]
    b.face(q[::-1], roof); b.face([(x, y - 0.5, z) for (x, y, z) in q], white)
    b.face([(-X - 1, 15.1, Z), (X + 1, 15.1, Z), (X + 1, 15.6, Z), (-X - 1, 15.6, Z)], white)
    for sx in (-1, 1): b.face([(sx * X, 10.4, Z - 3), (sx * X, 10.4, -Z), (sx * X, 14.9, Z - 3)][::sx], white)
    b.wall((-X, Z - 3), (X, Z - 3), 10.4, 14.9, F(gl, rep=22))
    n = b.d(12, 6)
    for i in range(n):
        x = -X + 6 + i * (2 * X - 12) / (n - 1); b.tube((x, 0, Z - 3), (x, 15.2, Z - 0.6), 0.3, steel, seg=4)
    b.box(-14, 14, 0, 12.0, Z - 3, Z, gl, top=white, bk=None)      # entrance hall
    b.bx(X - 14, -Z + 5, 6, 6, 0, 18.0, white, top=roof); b.box(X - 30, X - 17, 6.0, 9.0, -Z, -Z + 3, gl, top=white, bot=True)


@model('westfield_dome', tier='C', fit=(182.5, 40.0, 167.5), face='north', stone=0xb8ae98,
       desc="Westfield San Francisco Centre: the 1896 Emporium sandstone front on +Z (arcaded base, giant columns, attic) before the mall block, the restored glass dome on the roof")
def westfield(b):
    S = 0xb5aa92
    s1 = b.c(S); s3 = b.c(mul(S, 1.07)); roof = b.c(0x74787a); steel = b.c(0xb0b4b4, 0.5, 0.3); dark = b.c(0x30343a)
    base_s, main_s, att_s, ash_s = beaux(b, S, 5.6, main_floors=2)
    off = BB.office(b, 0xa9a59a, 'mall', 8.0, nwin=3)
    def domeg(c):
        c.rect(0, 0, 1, 1, 0x5a7686); c.vgrad(1.3, 0.85); c.rect(0, 0, 0.08, 1, 0xc0c4c4, 0.8); c.rect(0.92, 0, 1, 1, 0xc0c4c4, 0.8); c.joints(5, 0, 1.4, 1.2)
    dg = b.band('domeg', 64, domeg)
    X, Z = 91.25, 83.75
    b.stack(B.rect(-X, X, -Z, Z - 6), 0, [(6.0, off)] * 5, roof)
    b.stack(B.rect(-X + 20, X - 20, -Z + 10, Z - 60), 30.0, [(4.0, off)], roof)
    # Emporium front
    cw = 42.0
    y = b.stack(B.rect(-cw, cw, Z - 12, Z), 0, [(8.0, base_s), (15.0, main_s), (4.0, att_s)], roof, skins={2: None})
    b.box(-cw - 0.5, cw + 0.5, 23.0, 24.2, Z - 12, Z + 0.6, s3, bot=True)
    b.colonnade((-18, Z + 0.9), (18, Z + 0.9), 8.0, 15.0, 8, 0.9, s3, seg=8)
    b.box(-20, 20, 0, 8.0, Z, Z + 1.8, base_s, bk=None, top=s3); b.box(-20, 20, 23.0, 25.5, Z - 0.5, Z + 1.9, s3, bot=True)
    b.arcade((-6, Z + 1.82), (6, Z + 1.82), 0, 4.2, 7.9, 1, s1, depth=1.0, back=dark, pier=0.4, aseg=6)
    # the dome
    zc = Z - 40; n = b.d(20, 10); R = 15.5
    b.lathe(0, zc, [(R + 1.2, 30.0), (R + 1.2, 31.6), (R, 31.6)], n, s3, smooth=False)
    prof = [(R * math.cos(math.radians(a)), 31.6 + 7.6 * math.sin(math.radians(a))) for a in (0, 25, 50, 72)]
    b.lathe(0, zc, prof, n, dg, ub=1, smooth=False)
    b.lathe(0, zc, [(prof[-1][0], prof[-1][1]), (prof[-1][0], prof[-1][1] + 0.6), (0, 40.0)], n, steel, smooth=False)


@model('phelan_building', tier='C', fit=(62.5, 45.0, 92.5), face='east', stone=0xcfc6ae,
       desc="Phelan Building: eleven-storey cream terra-cotta flatiron, arcaded base, rounded prow on the front (-X) corner, bracketed cornice")
def phelan(b):
    BB.flatiron(b, 62.5, 92.5, 45.0, 0xc6bca2, 'ph', tip=7.0, floors=11, cut=0.42, base_col=0xb8ae96)


@model('palace_hotel', tier='C', fit=(79.0, 37.0, 103.0), face='north', stone=0xb9a888,
       desc="Palace Hotel: nine-storey buff-brick 1909 block, stone base with arched windows, deep cornice, the Garden Court glass roof in the light court")
def palace(b):
    BF = 0xb5a380
    c1 = b.c(BF); c3 = b.c(0xc4bca8); roof = b.c(0x74787a); glassc = b.c(0x6a8088, 0.3)
    base_s, main_s, att_s, ash_s = beaux(b, 0xbdb5a0, 5.6, main_floors=1)
    mid = BB.office(b, BF, 'mid', 5.6, nwin=2, brick=(10, 6, 0x9a8c74), frame=0xc4bca8, sill=0xc4bca8)
    X, Z = 39.5, 51.5
    y = b.stack(B.rect(-X, X, -Z, Z), 0, [(7.4, base_s)] + [(3.6, mid)] * 7, roof)
    b.box(-X - 0.9, X + 0.9, y, y + 1.6, -Z - 0.9, Z + 0.9, c3, bot=True); b.box(-X, X, y + 1.6, y + 2.6, -Z, Z, c1, top=roof)
    b.box(-16, 16, y + 2.4, y + 2.7, -22, 22, b.c(0x30343a))
    b.gable(-12, 12, -18, 18, y + 2.7, 37.0 - (y + 2.7) - 0.01, glassc, glassc, axis='z')
    b.box(-7, 7, 4.0, 4.6, Z, Z + 3.0, c3, bot=True)


@model('cable_car_barn', tier='C', fit=(63.0, 15.0, 83.5), face='south', stone=0x8f4a38,
       desc="Cable Car Museum and powerhouse: red-brick car barn, arched windows and car doors, twin gabled roofs with monitors, the brick chimney")
def cable_car_barn(b):
    BR = 0x8c4a38
    brick = b.c(BR); trim = b.c(0xb5ab98); roof = b.c(0x60666a); dark = b.c(0x30343a)
    def bw(c):
        c.brick(18, 8, BR, 0x9a8676, 0.12); c.rect(0, 0.92, 1, 1, 0xb5ab98, 0.8)
        c.window(0.12, 0.08, 0.44, 0.42, 0x343c44, 0x3a5a48, arch=True, mull=(2, 2), surround=0xb5ab98, sw=0.018); c.window(0.56, 0.08, 0.88, 0.42, 0x343c44, 0x3a5a48, arch=True, mull=(2, 2), surround=0xb5ab98, sw=0.018)
        c.window(0.12, 0.54, 0.44, 0.86, 0x343c44, 0x3a5a48, arch=True, mull=(2, 2), surround=0xb5ab98, sw=0.018); c.window(0.56, 0.54, 0.88, 0.86, 0x343c44, 0x3a5a48, arch=True, mull=(2, 2), surround=0xb5ab98, sw=0.018)
    bw_s = b.band('bw', 128, bw, bay=8.0); rs = b.band('roof', 32, p_tiles(0x60666a, 12, 0, 0.88), bay=6.0)
    X, Z = 31.5, 41.75
    b.box(-X, X, 0, 9.6, -Z, Z, bw_s, notop=True, f=None)
    b.wall((-X, Z), (-12, Z), 0, 9.6, bw_s); b.wall((12, Z), (X, Z), 0, 9.6, bw_s)
    b.arcade((-12, Z), (12, Z), 0, 3.6, 9.6, 3, brick, depth=1.2, back=dark, pier=0.3, aseg=6, reveal=trim)
    b.box(-X - 0.3, X + 0.3, 9.6, 10.4, -Z - 0.3, Z + 0.3, trim, bot=True)
    for sx in (-1, 1):
        b.gable(min(0, sx * X), max(0, sx * X), -Z, Z, 10.4, 2.6, rs, brick, axis='z')
        b.box(sx * X / 2 - 2.5, sx * X / 2 + 2.5, 12.2, 13.3, -Z + 8, Z - 8, dark, top=roof)
    b.bx(X - 5, -Z + 6, 3.4, 3.4, 0, 14.4, brick); b.bx(X - 5, -Z + 6, 3.9, 3.9, 14.4, 0.6, trim)


@model('pacific_union_club', tier='C', fit=(52.5, 20.0, 51.5), face='east', stone=0x6e5a4a,
       desc="Pacific-Union Club (Flood Mansion): dark Connecticut brownstone block, columned entrance porch, side wings, balustraded cornice and attic, bronze fence round the lot")
def pacific_union(b):
    BS = 0x735e4e
    s1 = b.c(BS); s2 = b.c(mul(BS, 0.85)); s3 = b.c(mul(BS, 1.1)); roof = b.c(0x5a5e60); bronze = b.c(0x4a5a4a, 0.5, 0.4); green = b.c(0x55764a)
    base_s, main_s, att_s, ash_s = beaux(b, BS, 4.6, main_floors=2, arch_main=False, base_arch=False)
    b.cap(B.rect(-26.25, 26.25, -25.75, 25.75), 0.03, green)
    y = b.stack(B.rect(-15, 15, -15, 13), 0, [(3.0, ash_s), (9.5, main_s)], roof)
    b.box(-15.6, 15.6, y, y + 1.3, -15.6, 13.6, s3, bot=True)
    b.stack(B.rect(-11, 11, -11, 9), y + 1.3, [(3.4, att_s)], roof); b.box(-11.5, 11.5, y + 4.7, y + 5.5, -11.5, 9.5, s3, top=roof, bot=True)
    b.bx(0, -1, 5, 5, y + 5.5, 20.0 - y - 5.5, s1, top=roof)
    for sx in (-1, 1):
        x0, x1 = (15, 22) if sx > 0 else (-22, -15)
        yy = b.stack(B.rect(x0, x1, -10, 8), 0, [(3.0, ash_s), (5.0, F(main_s, bay=4.6))], roof); b.box(x0 - 0.4, x1 + 0.4, yy, yy + 0.9, -10.4, 8.4, s3, bot=True)
    BB.portico(b, 0, 18.0, 11.0, 3.0, 6.0, 4, 0.5, s3, roof, depth=5.0, ped=0, ent=1.2, steps=4, seg=8, back=s2)
    for (p0, p1) in (((-26, 25.5), (26, 25.5)), ((26, 25.5), (26, -25.5)), ((26, -25.5), (-26, -25.5)), ((-26, -25.5), (-26, 25.5))):
        b.wall(p0, p1, 0, 1.0, s2); b.wall(p0, p1, 1.0, 2.6, bronze)


@model('caltrain_station', tier='C', fit=(71.0, 12.0, 32.0), face='east', stone=0xa8a8a0,
       desc="San Francisco Caltrain station (4th and King): low modern concourse with a glazed front under a long flat canopy on columns, clock pylon, platform canopies behind")
def caltrain(b):
    conc = b.c(0xa9a8a0); white = b.c(0xc6c8c6); roof = b.c(0x7a7e80); steel = b.c(0x8a9094, 0.5, 0.3); red = b.c(0xa83a30)
    gl = b.band('glass', 64, p_glass(0x47606e, 5, 2, 0xa8acac, 1.5), bay=7.0); cb = b.band('conc', 32, p_ashlar(0xa9a8a0, 2, 3, k=0.9), bay=7.0)
    clock = b.decal('clock', 32, 32, p_clock(0xd6d0bc, 0x2a2a2c, 0x5e584c, 0xa9a8a0))
    X, Z = 35.5, 16.0
    b.box(-X + 4, X - 4, 0, 5.4, -4, Z - 4, cb, f=gl, top=roof)
    b.box(-X, X, 5.4, 6.3, -6, Z, white, top=roof, bot=True)
    n = b.d(8, 4)
    for i in range(n): b.tube((-X + 2 + i * (2 * X - 4) / (n - 1), 0, Z - 1.2), (-X + 2 + i * (2 * X - 4) / (n - 1), 5.4, Z - 1.2), 0.25, steel, seg=4)
    b.bx(X - 9, Z - 2.5, 2.2, 2.2, 0, 12.0, conc); b.face([(X - 9.9, 9.6, Z - 1.38), (X - 8.1, 9.6, Z - 1.38), (X - 8.1, 11.4, Z - 1.38), (X - 9.9, 11.4, Z - 1.38)], clock)
    b.box(-X + 8, -X + 24, 6.3, 7.5, Z - 0.5, Z, red)
    for k in range(4):   # platform canopies
        x = -X + 9 + k * 17.7
        b.box(x - 3.2, x + 3.2, 4.2, 4.5, -Z, -4, white, top=roof, bot=True)
        for z in (-Z + 2, -9): b.tube((x, 0, z), (x, 4.2, z), 0.2, steel, seg=4)


run()
