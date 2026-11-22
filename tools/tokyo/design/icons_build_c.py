# icons_build_c.py - Tokyo tier C (and small props).
# blender -b -P icons_build_c.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


def p_copper(col=0x5c8a76, ribs=12):
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.12, 6)
        for i in range(ribs): x = (i + 0.5) / ribs; c.rect(x - 0.06 / ribs, 0, x + 0.06 / ribs, 1, None, 0.9, k=1.18); c.rect(x + 0.06 / ribs, 0, x + 0.16 / ribs, 1, None, 0.3, k=0.78)
        c.joints(2, 0, 0.9, 1.0)
    return fn


def fronts(b, sides, floors, wall, decs, rng, band, n_of=lambda L: max(2, int(L / 5)), **kw):
    """modelled window storeys on the listed sides [(p0, p1)], floors [(y0, y1)]"""
    for (p0, p1) in sides:
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); n = n_of(L)
        for (y0, y1) in floors: winwall(b, p0, p1, y0, y1, n, wall, decs, rng, F(band, rep=max(1, round(n / 4))), **kw)


def fins(b, x0, x1, z0, z1, ys, out, h, skin):
    for y in ys: b.box(x0 - out, x1 + out, y, y + h, z0 - out, z1 + out, skin, bot=True)


def rect4(x0, x1, z0, z1): return [((x0, z1), (x1, z1)), ((x1, z1), (x1, z0)), ((x1, z0), (x0, z0)), ((x0, z0), (x0, z1))]


# ------------------------------------------------------------------ Ote-mon
@model('edo_castle_otemon', tier='C', face='east', stone=0x8e8a80,
       desc="Ote-mon: the white watari-yagura gatehouse with its tiled hip-and-gable roof bridging two battered stone bases over the timber gate, the masugata court walls and the small korai-mon outer gate on +Z, pines")
def otemon(b):
    st = b.tile(p_stone(), 256, 256, 6.0, 6.0); white = b.cf(0xdcd8cc, 0.3); ridge = b.c(0x3a3e42); under = b.cf(0xcfcbbf, 0.22); wood = b.c(0x3a2e26); stc = b.c(0x8a867c); iron = b.c(0x2a2a2a, 0.5, 0.6); pav = b.c(0x9c988c)
    kw = b.band('kawara', 64, p_kawara(0x474c52, 10, 3), bay=4.0); sh = b.band('shiro', 32, p_shiro, bay=10.0)
    b.cap(B.rect(-24, 24, -6, 24), 0.05, pav)
    for sx in (-1, 1): ishigaki(b, min(sx * 4, sx * 23), max(sx * 4, sx * 23), -5.5, 0.5, 0, 6.0, st, 0.14, top=stc)
    b.box(-4, 4, 0, 5.2, -2.6, -2.2, wood); b.box(-4.4, 4.4, 5.2, 6.0, -5, 0, wood, bot=True)
    if b.hi:
        for x in (-4, 4): b.bx(x, -1.6, 0.9, 0.9, 0, 5.2, wood)
        for x in (-2, 0, 2): b.box(x - 0.08, x + 0.08, 0.1, 5.1, -2.18, -2.1, iron)
        for y in (1.2, 2.6, 4.0): b.box(-3.9, 3.9, y, y + 0.14, -2.18, -2.1, iron)
    b.box(-23, 23, 6.0, 10.2, -5.2, 0.2, sh, notop=True)
    jroof(b, 0, -2.5, 50, 9.6, 10.2, 4.8, kw, ridge, style='irimoya', under=under, gable=white, up=0.9, rl=0.86, orn=b.c(0x5a6a5c, 0.5, 0.5))
    # masugata court walls and the korai-mon
    for (x0, x1, z0, z1) in ((-23.6, -22.4, 0.5, 22), (-23.6, 8, 21.4, 22.6), (22.4, 23.6, 0.5, 22), (17, 23.6, 21.4, 22.6)):
        ax = 'z' if x1 - x0 < 2 else 'x'
        b.box(x0 + 0.2, x1 - 0.2, 0, 3.6, z0 + 0.2, z1 - 0.2, white, notop=True)
        b.box(x0, x1, 0, 1.4, z0, z1, st, top=stc)
        b.box(x0 - 0.4, x1 + 0.4, 3.5, 3.6, z0 - 0.4, z1 + 0.4, white, bot=True); b.gable(x0 - 0.4, x1 + 0.4, z0 - 0.4, z1 + 0.4, 3.6, 0.7, kw, white, axis=ax)
    for x in (8.6, 16.4): b.bx(x, 22, 0.8, 0.8, 0, 5.0, wood)
    b.box(8.6, 16.4, 0, 4.4, 21.9, 22.1, wood); jroof(b, 12.5, 22, 11, 5, 5.0, 2.0, kw, ridge, style='gable', under=under, gable=white, up=0.25)
    for (x, z) in b.d(((-14, 12), (-6, 16), (4, 10), (-18, 5)), ((-14, 12),)): pine(b, x, z, 7, 2.6)
    if b.hi:
        for x in (-6.5, 6.5): stone_lantern(b, x, 6, 2.2)
        for sx in (-1, 1):
            for i in range(5): b.bx(sx * (6 + i * 4), 0.3, 0.5, 0.25, 7.6, 1.2, wood)
        for x in (-3, -1, 1, 3):
            for y in (0.8, 2.0, 3.2, 4.4): b.bx(x, -2.12, 0.16, 0.08, y, 0.16, iron)


# ------------------------------------------------------------------ Ginza Mitsukoshi
@model('mitsukoshi_ginza', tier='C', face='northwest', stone=0xcfc9b8,
       desc="Ginza Mitsukoshi: pale stone main store on the crossing with modelled window bays, lit show windows and a glazed lit corner tower, the taller glass-and-panel new wing behind linked by a bridge, roof terrace garden")
def mitsukoshi_ginza(b):
    G = 0xd0cab8; gr = b.cf(G, 0.24); gr2 = b.cf(mul(G, 0.86), 0.2); roof = b.c(0x74726c); dark = b.c(0x34383c); green = b.c(0x4e7040); rng = np.random.RandomState(21)
    wins = win_decals(b, 'w', 24, 32, 0x39434c, 0x6a665c, mull=(2, 2)); shows = win_decals(b, 's', 40, 32, 0x4a4238, 0x3a3a3a, mull=(3, 1), nlit=2, ndark=0)
    fl_s = b.band('floor', 64, fl(p_grid(G, 4, 2, wx=(0.22, 0.78), wy=(0.2, 0.82), lit=0.55), 0.22), bay=20.0)
    gl = b.band('glass', 128, p_curtain(0x4c6678, 8, 6, 0xc8cccc, 1.2, 0.2, lit=0.6, k=0.7), bay=20.0)
    cor = b.band('corner', 64, p_curtain(0x566a78, 4, 4, 0xd8d8d4, 1.6, 0.1, lit=0.95, k=0.95), bay=8.0)
    # main store (front part, +Z) and the new wing (-Z)
    x0, x1, z0, z1 = -50, 50, -4, 33
    fronts(b, rect4(x0, x1, z0, z1)[:2] + rect4(x0, x1, z0, z1)[3:], [(0, 7.0)], dark, shows, rng, fl_s, sill=0.08, head=0.16, pier=0.2, depth=0.5, plit=1.0, nlit=2, n_of=lambda L: max(2, int(L / 8)))
    fronts(b, rect4(x0, x1, z0, z1)[:2] + rect4(x0, x1, z0, z1)[3:], [(7.0 + 5.2 * i, 12.2 + 5.2 * i) for i in range(7)], gr, wins, rng, fl_s, sill=0.25, head=0.2, pier=0.5, depth=0.35, n_of=lambda L: max(2, int(L / 10)))
    b.wall((x1, z0), (x0, z0), 0, 43.4, gr2); b.cap(B.rect(x0, x1, z0, z1), 43.4, roof)
    fins(b, x0, x1, z0, z1, (6.6, 42.8), 0.5, 0.8, gr)
    if not b.hi: fins(b, x0, x1, z0, z1, [12.0 + 5.2 * i for i in range(6)], 0.2, 0.4, gr)
    b.box(x1 - 9, x1 + 0.6, 0, 50.0, z1 - 9, z1 + 0.6, cor, top=roof); b.box(x1 - 9.4, x1 + 1.0, 50.0, 51.0, z1 - 9.4, z1 + 1.0, gr, bot=True)
    b.box(-50, 50, 0, 56.0, -33, -8, gl, top=roof); b.box(-44, 44, 56.0, 60.0, -30, -11, gr2, top=roof)
    b.box(-10, 10, 14, 26, -8, -4, F(gl, rep=1), top=roof, bot=True)
    pilasters(b, (-50, -8), (50, -8), 0, 56.0, 11, 0.6, 0.5, gr2); pilasters(b, (50, -33), (-50, -33), 0, 56.0, 11, 0.6, 0.5, gr2)
    if b.hi:
        b.sweep([(x0 + 0.5, z1 - 0.5), (x1 - 9.5, z1 - 0.5)], [(0, 43.4), (0.3, 43.4), (0.3, 44.6), (0, 44.6)], gr2)
        for (x, z) in ((-36, 22), (-22, 10), (-4, 24), (14, 12), (26, 4)): tree(b, x, z, 5, 2.2, 0x4e7040, yb=43.4)
        b.box(-44, 30, 43.4, 43.7, 2, 28, green)
    for (x, z) in ((-43, -29), (43, -12)): avlight(b, x, 60.0, z, 0.6)


# ------------------------------------------------------------------ Atago Shrine
@model('atago_shrine', tier='C', face='east', stone=0xa83a26,
       desc="Atago Shrine: stone torii and the vermilion gate at the head of the steep stone steps, the worship hall with its green copper hip-and-gable roof and porch, the sanctuary behind, pond, lanterns and trees")
def atago_shrine(b):
    VM = 0xb23c26; verm = b.cf(VM, 0.26); white = b.cf(0xdcd8cc, 0.24); ridge = b.c(0x4a7262, 0.6, 0.3); under = b.cf(mul(VM, 0.85), 0.2); stone = b.c(0x9a968a); stone2 = b.c(0x86837a); gravel = b.c(0xaaa698); wood = b.c(0x4a3226); water = b.c(0x3a5a5a, 0.15, 0.2); gold = b.c(0xc4a24a, 0.45, 0.7)
    cu = b.band('copper', 64, p_copper(0x5a8872, 12), bay=5.0)
    def wall(c):
        c.rect(0, 0, 1, 1, 0xdcd8cc)
        for i in range(4): c.rect(i / 4, 0, i / 4 + 0.03, 1, VM); c.rect(i / 4 + 0.06, 0.1, i / 4 + 0.21, 0.74, 0x3a3028, e=(0.8, 0.56, 0.26) if i % 2 == 0 else None); c.rect(i / 4 + 0.13, 0.1, i / 4 + 0.14, 0.74, VM)
        c.rect(0, 0.84, 1, 1, VM); c.rect(0, 0, 1, 0.08, 0x8a867c); c.flood(0.24)
    wl = b.band('wall', 32, wall, bay=8.0)
    b.cap(B.rect(-14, 14, -16, 14), 0.05, gravel)
    ns = b.d(8, 3)
    for k in range(ns): b.box(-2.6, 2.6, 0, 0.05, 14 + 8.0 * k / ns, 14 + 8.0 * (k + 1) / ns, stone2)
    torii(b, 0, 13, 4.6, 5.2, b.c(0x9a968a))
    g = b.sub()   # vermilion gate
    for sx in (-1, 1):
        for z in (-1.2, 1.2): g.bx(sx * 2.2, z, 0.4, 0.4, 0, 3.8, verm)
        g.box(min(sx * 2.4, sx * 5.5), max(sx * 2.4, sx * 5.5), 0, 2.6, -0.15, 0.15, verm); g.gable(min(sx * 2.4, sx * 5.5), max(sx * 2.4, sx * 5.5), -0.6, 0.6, 2.6, 0.5, cu, verm, axis='x')
    g.box(-2.6, 2.6, 3.4, 3.9, -1.5, 1.5, verm, bot=True)
    jroof(g, 0, 0, 8.4, 6.0, 3.9, 2.4, cu, ridge, style='gable', under=under, gable=white, up=0.3)
    b.add(g, t=(0, 0, 7))
    b.box(-6, 6, 0, 0.8, -8.5, 1.5, stone, top=stone2); b.box(-5, 5, 0.8, 4.4, -7.5, -0.5, wl, notop=True)
    jroof(b, 0, -4, 15.5, 12.5, 4.4, 5.2, cu, ridge, style='irimoya', under=under, gable=white, up=0.9, orn=gold)
    jroof(b, 0, 2.2, 6.4, 5.4, 3.7, 1.9, cu, ridge, style='gable', axis='z', under=under, gable=white, up=0.25)
    for x in (-2.6, 2.6): b.bx(x, 4.4, 0.35, 0.35, 0, 3.7, verm)
    b.box(-3, 3, 0, 1.2, -14.5, -8.5, stone, top=stone2); b.box(-2.4, 2.4, 1.2, 4.2, -14, -9.5, wl, notop=True)
    jroof(b, 0, -11.7, 8, 7.4, 4.2, 3.4, cu, ridge, style='gable', axis='z', under=under, gable=white, up=0.3)
    b.cap([(7, 4), (12.5, 5), (13, 10), (9, 12), (6.5, 9)], 0.08, water)
    if b.hi:
        for (x, z) in ((-3.6, 4), (3.6, 4), (-4, 10), (4, 10)): stone_lantern(b, x, z, 2.0)
        for x in (-1.6, 0, 1.6): lantern(b, x, 2.9, 2.6, 0.26, 0.6)
        b.box(8.5, 11.5, 0.3, 0.5, 7.2, 8.2, verm)
    for (x, z) in ((-11, -12), (11, -13), (-12, 0), (-10, 11), (12, -3)): tree(b, x, z, 9, 3.2, 0x34543a)


# ------------------------------------------------------------------ Imperial Hotel
@model('imperial_hotel', tier='C', face='west', stone=0xc9b89a,
       desc="Imperial Hotel: the 17-storey tan-tiled main building with projecting wings and modelled window bays over a glazed lobby and porte-cochere, the low banquet podium, and the 129 m slab tower with vertical piers at the +X end")
def imperial_hotel(b):
    T = 0xcbb99a; tc = b.cf(T, 0.2); tc2 = b.cf(mul(T, 0.86), 0.16); roof = b.c(0x74726c); dark = b.c(0x34383c); wh = b.cf(0xdcd8cc, 0.24); lit = b.glow(WARM, 0.9, 0x5a4a38); rng = np.random.RandomState(31)
    wins = win_decals(b, 'w', 24, 24, 0x39434c, 0x6a5a44, mull=(2, 1))
    fl_s = b.band('floor', 96, fl(p_grid(T, 6, 3, wx=(0.2, 0.8), wy=(0.24, 0.8), lit=0.55, mull=(2, 1)), 0.18), bay=24.0)
    tw_s = b.band('tower', 128, p_grid(0xc4c0b4, 8, 4, glass=0x3e4a56, wx=(0.16, 0.84), wy=(0.14, 0.8), lit=0.55, pil=0xd4d0c4, mull=(1, 1)), bay=20.0)
    lob = b.band('lobby', 48, p_curtain(0x5a6a70, 8, 1, 0x4a4034, 1.6, 0.1, lit=1.0, k=1.0), bay=16.0)
    # podium + main building (cross plan) on the -X side
    b.box(-105, 105, 0, 16.0, -50, 44, fl_s, top=roof)
    b.box(-70, 10, 0, 7.0, 44, 46, lob, top=wh)
    FL = [(16.0 + 3.6 * 3 * i, 16.0 + 3.6 * 3 * (i + 1)) for i in range(4)]
    for (x0, x1, z0, z1) in ((-88, 20, -14, 12), (-48, -20, -44, 40)):
        for (y0, y1) in FL: b.box(x0, x1, y0, y1, z0, z1, fl_s, notop=True)
        b.cap(B.rect(x0, x1, z0, z1), FL[-1][1], roof); fins(b, x0, x1, z0, z1, (FL[-1][1] - 0.2,), 0.4, 1.0, tc)
    fronts(b, [((-48, 40), (-20, 40))], [(16.0 + 3.6 * i, 19.6 + 3.6 * i) for i in range(12)], tc, wins, rng, fl_s, sill=0.3, head=0.2, pier=0.42, depth=0.3, n_of=lambda L: 7)
    b.box(-46, -22, 59.2, 63.0, -20, 18, tc2, top=roof)
    # porte-cochere
    b.box(-52, -16, 6.0, 7.0, 44, 56, wh, bot=True); b.face([(-51, 5.98, 55), (-17, 5.98, 55), (-17, 5.98, 45), (-51, 5.98, 45)][::-1], lit)
    for x in (-50, -34, -18): b.bx(x, 54.5, 1.0, 1.0, 0, 6.0, tc2)
    # tower
    b.stack(B.rect(52, 100, -24, 14), 16.0, [(14.0, tw_s)] * 8, top=roof); b.box(58, 94, 128.0, 131.0, -20, 10, tc2, top=roof)
    if b.hi:
        pilasters(b, (52, 14), (100, 14), 16.0, 128.0, 7, 1.0, 0.6, wh); pilasters(b, (100, -24), (52, -24), 16.0, 128.0, 7, 1.0, 0.6, wh)
        pilasters(b, (100, 14), (100, -24), 16.0, 128.0, 4, 1.0, 0.6, wh); pilasters(b, (52, -24), (52, 14), 16.0, 128.0, 4, 1.0, 0.6, wh)
        pilasters(b, (-88, 12), (-50, 12), 16.0, 59.2, 8, 0.7, 0.35, tc); pilasters(b, (-18, 12), (20, 12), 16.0, 59.2, 8, 0.7, 0.35, tc)
        for (x, z) in ((-90, 30), (-76, 28), (30, 30), (40, -36), (-80, -34)): b.bx(x, z, 10, 8, 16.0, 3.0, tc2, top=roof)
    for (x, z) in ((53, -23), (99, -23), (99, 13), (53, 13)): avlight(b, x, 128.0, z, 0.9)


# ------------------------------------------------------------------ Kantei
@model('kantei', tier='C', face='east', stone=0xb8bcbc,
       desc="Prime Minister's Office (Kantei): long five-storey glass box behind a screen of slender columns and horizontal louvres on a stone base, the deep flat roof slab, glazed entrance hall with canopy on +Z, bamboo court and trees")
def kantei(b):
    stc = b.cf(0xb4b0a4, 0.2); wh = b.cf(0xdcdcd8, 0.22); steel = b.c(0xc0c4c4, 0.5, 0.4); roof = b.c(0x74787a); dark = b.c(0x34383c); pav = b.c(0xa4a29a); lit = b.glow(WARM, 0.9, 0x5a4a38)
    gl = b.band('glass', 128, p_curtain(0x4e6676, 8, 4, 0xc8cccc, 1.2, 0.2, lit=0.7, k=0.8), bay=20.0)
    st = b.band('stone', 32, fl(p_ashlar(0xb4b0a4, 3, 6), 0.2), bay=8.0)
    X, Z = 48.0, 25.0
    b.cap(B.rect(-50, 50, -29, 29), 0.05, pav)
    b.box(-X, X, 0, 5.0, -Z, Z, st, top=pav); b.box(-X + 3, X - 3, 5.0, 26.0, -Z + 3, Z - 3, gl, notop=True)
    b.box(-X - 1, X + 1, 26.0, 27.6, -Z - 1, Z + 1, wh, bot=True, top=roof); b.box(-30, 30, 27.6, 30.0, -12, 12, steel, top=roof)
    n = b.d(17, 5)
    for i in range(n):
        x = -X + 0.6 + i * (2 * X - 1.2) / (n - 1)
        for sz in (-1, 1): b.bx(x, sz * (Z - 0.6), 0.6, 0.6, 5.0, 21.0, wh)
    nz = b.d(9, 3)
    for i in range(1, nz - 1):
        for sx in (-1, 1): b.bx(sx * (X - 0.6), -Z + 0.6 + i * (2 * Z - 1.2) / (nz - 1), 0.6, 0.6, 5.0, 21.0, wh)
    if b.hi:
        for y in (9.2, 13.4, 17.6, 21.8): b.box(-X + 0.4, X - 0.4, y, y + 0.25, -Z + 0.2, Z - 0.2, steel, bot=True, notop=True); b.box(-X + 1.2, X - 1.2, y - 0.9, y - 0.75, -Z + 1.0, Z - 1.0, steel, bot=True, notop=True)
        for (x, z) in ((-40, 27), (-30, 27.5), (30, 27), (40, 27.5), (-44, -27), (44, -27)): tree(b, x, z, 7, 2.4, 0x4a6a3a)
    # entrance hall + canopy on +Z
    b.box(-12, 12, 0, 9.0, Z, Z + 5, F(gl, rep=1), top=wh); b.box(-15, 15, 9.0, 9.8, Z, Z + 11, wh, bot=True)
    b.face([(-14, 8.98, Z + 10.5), (14, 8.98, Z + 10.5), (14, 8.98, Z + 5.2), (-14, 8.98, Z + 5.2)][::-1], lit)
    for x in (-13.5, 13.5): b.bx(x, Z + 10, 0.7, 0.7, 0, 9.0, wh)


# ------------------------------------------------------------------ Supreme Court
@model('supreme_court_japan', tier='C', face='east', stone=0xbdb8ab,
       desc="Supreme Court of Japan: massive blank granite cuboids of stepped heights, the tall central hall block with its deep vertical slit, the flanking court blocks with recessed ribbon windows, the broad front steps and terrace walls")
def supreme_court(b):
    G = 0xbfbaad; gr = b.cf(G, 0.22); gr2 = b.cf(mul(G, 0.86), 0.18); roof = b.c(0x7a7870); dark = b.c(0x2a2c30); lit = b.glow(WARM, 0.8, 0x5a4a38); rng = np.random.RandomState(41)
    wins = win_decals(b, 'w', 40, 16, 0x39434c, 0x5a584e, mull=(4, 1))
    gs = b.band('granite', 64, fl(p_ashlar(G, 8, 4, 0.08), 0.22), bay=12.0)
    rb = b.band('ribbon', 64, fl(p_grid(G, 2, 3, wx=(0.04, 0.96), wy=(0.34, 0.7), lit=0.5, mull=(4, 1), rows=6, cols=2), 0.2), bay=16.0)
    def blk(x0, x1, z0, z1, h): b.box(x0, x1, 0, h, z0, z1, gs, top=roof)
    b.box(-90, 90, 0, 3.0, -52, 44, gs, top=gr2)
    blk(-22, 22, -30, 26, 37.0); blk(-34, -22, -20, 18, 30.0); blk(22, 34, -20, 18, 30.0)
    blk(-84, -34, -46, 6, 22.0); blk(34, 84, -46, 6, 22.0); blk(-70, -40, 6, 30, 16.0); blk(40, 70, 6, 30, 16.0); blk(-30, 30, -50, -30, 26.0)
    # the slit and entrance in the hall block
    b.box(-3.2, 3.2, 8.0, 34.0, 25.6, 26.3, dark); b.face([(-2.2, 9.0, 26.36), (2.2, 9.0, 26.36), (2.2, 33.0, 26.36), (-2.2, 33.0, 26.36)], lit)
    for sx in (-1, 1): b.box(sx * 3.2 if sx > 0 else -6.4, 6.4 if sx > 0 else -3.2, 3.0, 35.0, 26, 28.5, gr)
    b.box(-12, 12, 3.0, 8.0, 26, 32, gs, top=gr2); b.face([(-5, 3.0, 32.06), (5, 3.0, 32.06), (5, 6.8, 32.06), (-5, 6.8, 32.06)], lit)
    for sx in (-1, 1):
        x0, x1 = (34, 84) if sx > 0 else (-84, -34)
        fronts(b, [((x0, 6), (x1, 6))] if True else [], [(6.0, 10.5), (11.0, 15.5), (16.0, 20.5)], gr, wins, rng, rb, sill=0.3, head=0.3, pier=0.25, depth=0.9, n_of=lambda L: 5)
        xa, xb = (40, 70) if sx > 0 else (-70, -40)
        fronts(b, [((xa, 30), (xb, 30))], [(5.0, 9.5), (10.0, 14.5)], gr, wins, rng, rb, sill=0.3, head=0.3, pier=0.25, depth=0.9, n_of=lambda L: 3)
        if b.hi:
            pilasters(b, (sx * 84, 4) if sx > 0 else (sx * 84, -44), (sx * 84, -44) if sx > 0 else (sx * 84, 4), 3.0, 22.0, 7, 2.2, 0.8, gr2)
            b.box(sx * 60 - 8, sx * 60 + 8, 22.0, 25.0, -30, -10, gr2, top=roof)
    ns = b.d(7, 2)
    for k in range(ns): b.box(-20, 20, 0, 3.0 * (ns - k) / ns - 0.001, 44 + 9.0 * k / ns, 44 + 9.0 * (k + 1) / ns, gr2)
    if b.hi:
        for sx in (-1, 1): b.box(sx * 20 if sx > 0 else -23, 23 if sx > 0 else -20, 0, 4.2, 44, 54, gr)
        b.box(-18, 18, 37.0, 39.0, -24, 10, gr2, top=roof)


# ------------------------------------------------------------------ National Theatre
@model('national_theatre', tier='C', face='east', stone=0x6a5a4a,
       desc="National Theatre: azekura (log-store) style in dark precast concrete, the large theatre block of stacked horizontal 'log' courses with crossing corner ends under a deep flat roof slab on beam ends, the pillared entrance loggia and steps, the small theatre block alongside")
def national_theatre(b):
    C = 0x6e5e4e; cc = b.cf(C, 0.2); cc2 = b.cf(mul(C, 0.8), 0.16); roof = b.c(0x5a5650); dark = b.c(0x2a2622); lit = b.glow(WARM, 0.9, 0x5a4a38); pav = b.c(0xa09c92)
    lob = b.band('lobby', 48, p_curtain(0x5a5a54, 8, 1, 0x4a3e32, 1.8, 0.1, lit=1.0, k=1.0), bay=16.0)
    def logs(c):
        c.rect(0, 0, 1, 1, C); c.noise(0.08, 6)
        for j in range(4): c.rect(0, j / 4, 1, j / 4 + 0.05, None, 0.2, k=0.6); c.rect(0, j / 4 + 0.2, 1, j / 4 + 0.25, None, 0.8, k=1.15)
        c.flood(0.2)
    lg = b.band('logs', 64, logs, bay=10.0)
    def block(x0, x1, z0, z1, h, n):
        b.box(x0 + 1.5, x1 - 1.5, 0, 6.0, z0 + 1.5, z1 - 1.5, lob, notop=True)
        b.box(x0, x1, 6.0, h, z0, z1, lg, top=cc2, bot=True, notop=True)
        m = b.d(n, 3); hh = (h - 6.0) / m
        for i in range(m):   # log courses, alternate ones run past the corners
            y = 6.0 + i * hh; e = 1.6 if i % 2 == 0 else 0.0
            b.box(x0 - e, x1 + e, y + hh * 0.15, y + hh * 0.85, z0 - 0.7, z1 + 0.7, cc, bot=True) if i % 2 == 0 else b.box(x0 - 0.7, x1 + 0.7, y + hh * 0.15, y + hh * 0.85, z0 - 1.6, z1 + 1.6, cc, bot=True)
        b.box(x0 - 3.5, x1 + 3.5, h, h + 2.0, z0 - 3.5, z1 + 3.5, cc2, bot=True, top=roof)
        if b.hi:
            k = int((x1 - x0) / 7)
            for i in range(k + 1):
                x = x0 + i * (x1 - x0) / k
                b.box(x - 0.5, x + 0.5, h - 1.2, h, z0 - 3.0, z1 + 3.0, cc2, bot=True, notop=True)
                for z in (z0 + 0.4, z1 - 0.4): b.bx(x, z, 1.1, 1.1, 0, 6.0, cc)
    b.cap(B.rect(-52, 52, -54, 54), 0.05, pav)
    block(-44, 44, -46, 14, 27.5, 9); block(-30, 14, 24, 48, 18.0, 5)
    ns = b.d(5, 2)
    for k in range(ns): b.box(-20, 20, 0, 1.5 * (ns - k) / ns - 0.001, 14 + 3.5 + 4.0 * k / ns, 14 + 3.5 + 4.0 * (k + 1) / ns, pav) if False else None
    b.box(-36, 36, 27.5 + 2.0, 33.0, -40, -8, cc2, top=roof)
    if b.hi:
        for (x, z) in ((30, 30), (40, 40), (-42, 30), (30, 48)): tree(b, x, z, 8, 3.0)
        b.box(-8, 8, 4.6, 5.2, 14, 21, cc2, bot=True); b.face([(-7.5, 4.58, 20.5), (7.5, 4.58, 20.5), (7.5, 4.58, 14.2), (-7.5, 4.58, 14.2)][::-1], lit)


# ------------------------------------------------------------------ Nihonbashi Takashimaya
@model('takashimaya_nihonbashi', tier='C', face='west', stone=0xc4b8a0,
       desc="Nihonbashi Takashimaya: 1933 eight-storey stone department store, arcaded base with lit show windows, pilastered upper floors with modelled windows on the street fronts, bracketed cornice, corner entrance bay with canopy, roof garden pavilions")
def takashimaya(b):
    G = 0xc6baa2; gr = b.cf(G, 0.24); gr2 = b.cf(mul(G, 0.86), 0.2); base_c = b.cf(0xa49c8c, 0.2); roof = b.c(0x74726c); bronze = b.c(0x4a4034, 0.5, 0.5); lit = b.glow(WARM, 0.9, 0x5a4a38); green = b.c(0x4e7040); rng = np.random.RandomState(51)
    wins = win_decals(b, 'w', 24, 32, 0x39434c, 0x6a665c, mull=(2, 3), wall=G); shows = win_decals(b, 's', 32, 40, 0x4a4238, 0x4a4034, arch=True, mull=(3, 2), nlit=2, ndark=0, wall=0xa49c8c)
    bs = b.band('base', 64, fl(p_grid(0xa49c8c, 4, 1, wx=(0.2, 0.8), wy=(0.1, 0.88), arch=True, rows=7, cols=4, lit=0.95, glass=0x4a4238, top=(0.08, G)), 0.24), bay=24.0)
    up = b.band('upper', 128, fl(p_grid(G, 4, 3, wx=(0.26, 0.74), wy=(0.16, 0.82), rows=18, cols=6, lit=0.55, mull=(2, 3)), 0.22), bay=20.0)
    X, Z = 56.0, 32.0; S = rect4(-X, X, -Z, Z)
    fronts(b, S, [(0, 8.0)], base_c, shows, rng, bs, sill=0.08, head=0.14, pier=0.34, depth=0.7, arch=True, plit=1.0, nlit=2, n_of=lambda L: int(L / 7))
    fronts(b, S[:1], [(8.0 + 4.6 * i, 12.6 + 4.6 * i) for i in range(6)], gr, wins, rng, up, sill=0.24, head=0.18, pier=0.5, depth=0.35, n_of=lambda L: int(L / 10))
    for (p0, p1) in S[1:]: b.wall(p0, p1, 8.0, 35.6, up)
    if not b.hi:
        fins(b, -X, X, -Z, Z, [12.6 + 4.6 * i for i in range(5)], 0.15, 0.3, gr); pilasters(b, S[0][0], S[0][1], 8.6, 35.6, 21, 0.9, 0.4, gr); pilasters(b, S[1][0], S[1][1], 8.6, 35.6, 12, 0.9, 0.4, gr); pilasters(b, S[2][0], S[2][1], 8.6, 35.6, 21, 0.9, 0.4, gr)
    for (p0, p1) in S: b.wall(p0, p1, 35.6, 40.0, F(up, bay=20.0)) if False else b.wall(p0, p1, 36.6, 40.0, gr)
    fins(b, -X, X, -Z, Z, (7.6, 35.6), 0.6, 1.0, gr); fins(b, -X, X, -Z, Z, (39.6,), 0.4, 0.8, gr); b.cap(B.rect(-X, X, -Z, Z), 40.0, roof)
    if b.hi:
        pilasters(b, S[0][0], S[0][1], 8.6, 35.6, 15, 0.9, 0.4, gr); pilasters(b, S[1][0], S[1][1], 8.6, 35.6, 12, 0.9, 0.4, gr)
        for (x0, x1, z0, z1, h) in ((-40, -20, -20, 0, 4.0), (10, 34, -22, -6, 5.0), (-8, 6, 6, 20, 3.0), (36, 50, 4, 24, 6.0)): b.box(x0, x1, 40.0, 40.0 + h, z0, z1, gr2, top=roof)
        for (x, z) in ((-46, 20), (-30, 16), (20, 22), (-48, -24)): tree(b, x, z, 5, 2.2, 0x4e7040, yb=40.0)
    b.box(-8, 8, 4.4, 5.0, Z, Z + 3.6, bronze, bot=True); b.face([(-7.6, 4.38, Z + 3.4), (7.6, 4.38, Z + 3.4), (7.6, 4.38, Z + 0.1), (-7.6, 4.38, Z + 0.1)][::-1], lit)
    b.box(-6, 6, 40.0, 43.0, Z - 6, Z, gr, top=roof)


# ------------------------------------------------------------------ Aqua City / Decks Odaiba
@model('aqua_city_odaiba', tier='C', face='north', stone=0xc8ccd0,
       desc="Aqua City / Decks Odaiba: two long bayside mall blocks joined by a bridge, stepped boardwalk terraces with railings and lit restaurant fronts facing the bay on +Z, the glazed atrium arch, coloured lit panels (no lettering), rooftop cinema box and plant")
def aqua_city(b):
    wh = b.cf(0xd8dadc, 0.22); wh2 = b.cf(0xb8bcc0, 0.18); deck = b.c(0x8a6a4a); roof = b.c(0x74787a); steel = b.c(0xc0c4c4, 0.5, 0.4); dark = b.c(0x34383c); rng = np.random.RandomState(61)
    gl = b.band('glass', 64, p_curtain(0x50687a, 8, 2, 0xc8cccc, 1.4, 0.2, lit=0.9, k=0.95), bay=24.0)
    def panel(c):
        c.rect(0, 0, 1, 1, 0xcfd2d4); c.noise(0.05, 5); c.joints(4, 8, 0.9, 1.0, stagger=False)
        for i in range(8):
            if c.rng.rand() < 0.4: col = [0x3a8ac8, 0xe86a3a, 0xf0c040, 0x48b070, 0xd8487a][c.rng.randint(5)]; c.rect(i / 8 + 0.02, 0.3, i / 8 + 0.105, 0.75, col, e=tuple(rgbf(col) * 0.8))
        c.flood(0.14, 0xf0f4ff)
    pn = b.band('panel', 64, panel, bay=40.0)
    for (x0, x1, h) in ((-130, -8, 38.0), (8, 130, 30.0)):
        b.box(x0, x1, 0, h, -44, 20, pn, top=roof, f=None)
        for i, (y, zo) in enumerate(((0, 40), (7.5, 34), (15.0, 28), (22.5, 22))):   # stepped terraces toward the bay
            if y + 7.5 > h + 0.1: break
            b.box(x0, x1, y, y + 7.5, 20, zo, gl, top=deck, bk=None)
            b.box(x0, x1, y + 7.5, y + 8.6, zo - 0.1, zo, steel, notop=False)
            if b.hi:
                n = 12
                for k in range(n + 1): b.bx(x0 + k * (x1 - x0) / n, zo - 0.4, 0.5, 0.5, y, 7.5, wh)
        yt = 30.0 if h > 30 else 22.5
        b.wall((x0, 22 if h > 30 else 28), (x1, 22 if h > 30 else 28), yt, h, pn) if h > yt else None
        b.wall((x0, 20), (x1, 20), min(h, 30.0), h, pn) if False else None
    b.box(-130, -8, 30.0, 38.0, -44, 22, pn, top=roof)
    b.box(-8, 8, 8.0, 14.0, -10, 14, F(gl, rep=1), top=wh, bot=True)
    # atrium arch on the Aqua City block
    n = b.d(10, 4); prof = [(-70 + 16 * math.cos(math.pi * i / n), 22.5 + 12 * math.sin(math.pi * i / n)) for i in range(n + 1)][::-1]
    b.loft([[(x, y, 4.0) for (x, y) in prof][::-1], [(x, y, 40.5) for (x, y) in prof][::-1]], b.c(0x587084, 0.2, 0.2, emit=(0.3, 0.3, 0.26)), closed=False)
    b.face([(-70, 0.2, 40.5)] + [(x, y - 22.5 + 0.0 if False else y, 40.5) for (x, y) in prof], b.glow(WARM, 0.6, 0x587084)) if False else b.face([(-70, 22.5, 40.5)] + [(x, y, 40.5) for (x, y) in prof], b.glow(WARM, 0.6, 0x587084))
    b.box(-110, -84, 38.0, 46.0, -36, -6, wh2, top=roof); b.box(40, 100, 30.0, 34.0, -36, 0, wh2, top=roof)
    if b.hi:
        for i in range(n):
            (xa, ya), (xb, yb) = prof[i], prof[i + 1]; b.beam((xa, ya + 0.1, 40.3), (xb, yb + 0.1, 40.3), 0.6, 0.6, wh)
        for x in (-120, -96, -40, -20, 20, 44, 70, 96, 120): tree(b, x, 43.5, 6, 2.0, 0x4a6a3a)
    for (x, z) in ((-109, -35), (-85, -7)): avlight(b, x, 46.0, z, 0.7)


# ------------------------------------------------------------------ Tsukiji Outer Market
@model('tsukiji_outer_market', tier='C', face='northwest', stone=0x8a8478,
       desc="Tsukiji Outer Market: a block of low shop-houses back to back, each front different: striped awnings, lit open shopfronts, sign panels (no lettering), lanterns, tin and tiled roofs with tanks and aircon units, covered alley down the middle")
def tsukiji_outer_market(b):
    rng = np.random.RandomState(71); roofc = b.c(0x6a6c6e); tin = b.c(0x8a9094, 0.5, 0.4); dark = b.c(0x2e2e2c); wood = b.c(0x5a4a38)
    def shop(c):
        c.rect(0, 0, 1, 1, 0x3a3630)
        for i in range(4):
            c.rect(i / 4 + 0.01, 0.05, i / 4 + 0.24, 0.8, 0x5a4a38, e=tuple(rgbf([0xffd29a, 0xfff1dc, 0xffe6c0, 0xffc880][i]) * 0.85))
            for k in range(3): c.rect(i / 4 + 0.03 + k * 0.07, 0.08, i / 4 + 0.085 + k * 0.07, 0.3 + 0.1 * ((i + k) % 3), [0xb8a888, 0x8a6a4a, 0xc8c0b0, 0x9a3a2a][(i + k) % 4])
            c.rect(i / 4 + 0.24, 0, i / 4 + 0.26, 1, 0x2e2a26)
        c.rect(0, 0.82, 1, 1, 0x4a4640)
    sp = b.band('shop', 48, shop, bay=16.0)
    def upper(c):
        cols = [0xb8b0a0, 0x9a8f7c, 0xc8c4b8, 0x8a8478]
        for i in range(4):
            c.rect(i / 4, 0, (i + 1) / 4, 1, cols[i]); c.window(i / 4 + 0.04, 0.2, i / 4 + 0.21, 0.7, 0x39434c, 0x5a584e, mull=(2, 1)); c.rect(i / 4, 0, i / 4 + 0.008, 1, 0x4a4640)
            col = [0xb83a2a, 0x2a5a8a, 0xe8e0c8, 0x3a6a4a][i]; c.rect(i / 4 + 0.03, 0.78, i / 4 + 0.22, 0.96, col, e=tuple(rgbf(col) * 0.5))
        c.noise(0.06, 6); c.flood(0.12)
    upb = b.band('upper', 48, upper, bay=16.0)
    AW = [b.cf(c_, 0.2) for c_ in (0xb83a2a, 0x2a5a8a, 0xd8d0b8, 0x3a6a4a, 0xc8922a)]
    n = 11; L = 106.0; W = 11.0
    for side in (-1, 1):
        for i in range(n):
            z0 = -L / 2 + i * L / n; z1 = z0 + L / n - 0.2; h = 6.0 + 3.2 * rng.randint(0, 3) * 0.5; s = b.sub(); w = z1 - z0
            s.box(-w / 2, w / 2, 0, 3.2, 0.8, W, F(sp, rep=1) if False else dark, notop=True, f=F(sp, rep=1)); s.box(-w / 2, w / 2, 3.2, h, 0.8, W + 0.4, dark, f=F(upb, rep=1), top=roofc if rng.rand() < 0.5 else tin)
            aw = AW[rng.randint(5)]; s.face([(-w / 2, 2.5, W + 2.2), (w / 2, 2.5, W + 2.2), (w / 2, 3.3, W + 0.4), (-w / 2, 3.3, W + 0.4)], aw); s.face([(-w / 2, 2.2, W + 2.2), (w / 2, 2.2, W + 2.2), (w / 2, 2.5, W + 2.2), (-w / 2, 2.5, W + 2.2)], aw)
            if rng.rand() < 0.45: s.gable(-w / 2, w / 2, 0.8, W + 0.6, h, 1.4, tin, dark, axis='x')
            if s.hi:
                if rng.rand() < 0.7: s.bx(rng.rand() * 3 - 1.5, 5, 1.4, 1.0, h, 0.9, tin)
                if rng.rand() < 0.4: s.cyl(1.5, 7, 0.7, h, h + 1.6, 6, b.c(0xb8bcc0, 0.5, 0.3))
                lantern(s, -w / 2 + 0.6, 1.7, W + 2.0, 0.22, 0.5, LANT if i % 2 else WARM)
                s.bx(-w / 2 + 0.1, W + 2.1, 0.1, 0.1, 0, 2.3, wood)
            b.add(s, t=(0, 0, (z0 + z1) / 2), ry=90 * side)
    b.box(-0.8, 0.8, 0, 4.6, -L / 2, L / 2, dark, top=tin)
    for sz in (-1, 1):
        b.box(-W - 0.4, W + 0.4, 0, 7.5, sz * L / 2 - (0 if sz > 0 else 0.6), sz * L / 2 + (0.6 if sz > 0 else 0), dark, f=F(upb, rep=1) if sz > 0 else 0, bk=F(upb, rep=1) if sz < 0 else 0)


# ------------------------------------------------------------------ Toyosu Market
@model('toyosu_market', tier='C', face='northwest', stone=0xc4c8c8,
       desc="Toyosu Market: the huge pale wholesale hall with its green roof lawn and modelled truck-dock bays under a long canopy, the seven-storey administration block with ribbon windows, the intermediate hall, two spiral vehicle ramps, a glazed footbridge on columns and roof plant")
def toyosu_market(b):
    W = 0xc8cccc; wh = b.cf(W, 0.18); wh2 = b.cf(mul(W, 0.86), 0.14); roof = b.c(0x7a7e80); lawn = b.c(0x5a7a3e); dark = b.c(0x2e3236); steel = b.c(0xb8bcbc, 0.5, 0.4); lit = b.glow(WHITEL, 0.6, 0x4a4e52); conc = b.c(0x9c9a94); rng = np.random.RandomState(81)
    def panel(c):
        c.rect(0, 0, 1, 1, W); c.noise(0.05, 5); c.joints(3, 8, 0.92, 1.0, stagger=False); c.rect(0, 0.62, 1, 0.74, 0x3a444e)
        for i in range(8):
            if c.rng.rand() < 0.6: c.rect(i / 8 + 0.01, 0.63, i / 8 + 0.115, 0.73, 0x3a444e, e=(0.55, 0.56, 0.5))
        c.flood(0.12, 0xf0f4ff)
    pn = b.band('panel', 48, panel, bay=40.0)
    off = b.band('office', 96, fl(p_grid(W, 4, 3, wx=(0.04, 0.96), wy=(0.3, 0.72), lit=0.6, mull=(3, 1)), 0.14), bay=24.0)
    gl = b.band('glass', 32, p_curtain(0x50687a, 8, 1, 0xc8cccc, 1.4, 0.1, lit=0.9, k=0.8), bay=24.0)
    docks = win_decals(b, 'd', 32, 24, 0x2e3236, 0x6a6e70, mull=(1, 1), nlit=2, ndark=2)
    # wholesale hall (-X), intermediate hall (+X), admin block in front
    b.box(-180, 20, 6.0, 26.0, -74, 40, pn, top=lawn, bot=False); b.box(-176, 16, 26.0, 26.5, -70, 36, wh2, notop=True)
    fronts(b, rect4(-180, 20, -74, 40), [(0, 6.0)], wh2, docks, rng, pn, sill=0.0, head=0.2, pier=0.3, depth=1.5, plit=0.5, nlit=2, n_of=lambda L: int(L / 10))
    b.box(40, 180, 0, 22.0, -70, 30, pn, top=roof); b.box(60, 160, 22.0, 26.0, -50, 10, wh2, top=roof)
    b.box(-60, 30, 0, 30.0, 46, 72, off, top=roof); b.box(-50, 20, 30.0, 33.0, 50, 68, wh2, top=roof)
    # dock canopy along the front of the hall
    b.box(-180, 20, 6.4, 7.0, 40, 47, wh, bot=True)
    # spiral ramps
    for (cx, cz) in ((-166, 58), (166, 52)):
        b.cyl(cx, cz, 13.0, 0, 20.0, 14, wh2); b.lathe(cx, cz, [(13.0, 20.0), (13.6, 20.0), (13.6, 21.2), (13.0, 21.2)], b.d(14, 7), wh)
        if b.hi:
            for y in (5, 10, 15): b.lathe(cx, cz, [(13.05, y), (13.5, y), (13.5, y + 1.2), (13.05, y + 1.2)], 14, wh)
            b.lathe(cx, cz, [(13.1, 2.0), (13.1, 4.0)], 14, lit)
    # footbridge on columns to the station side
    b.box(20, 40, 12.0, 16.0, 20, 26, gl, top=wh, bot=True); b.box(-60, -56, 12.0, 16.0, 72, 76, gl, top=wh, bot=True) if False else None
    b.box(30, 36, 12.0, 16.0, 26, 76, F(gl, bay=24.0), top=wh, bot=True)
    for z in b.d((34, 48, 62, 75), (34, 75)): b.bx(33, z, 1.2, 1.2, 0, 12.0, conc)
    if b.hi:
        for i in range(19): b.bx(-176 + i * 10.6, 46.4, 0.5, 0.5, 0, 6.4, steel)
        for i in range(8): b.bx(-160 + i * 22, -20 + (i % 3) * 14, 8, 5, 26.0, 2.6, wh2, top=roof)
        pilasters(b, (-60, 72), (30, 72), 0, 30.0, 10, 0.7, 0.5, wh); pilasters(b, (40, 30), (180, 30), 0, 22.0, 12, 0.8, 0.5, wh)
        for i in range(6): b.bx(70 + i * 16, -20, 6, 6, 26.0 if 60 < 70 + i * 16 < 160 else 22.0, 2.4, steel)
    for (x, z) in ((-59, 47), (29, 71)): avlight(b, x, 33.0, z, 0.8)


# ------------------------------------------------------------------ Hama-rikyu Nakajima teahouse
@model('hamarikyu_teahouse', tier='C', face='south', stone=0x6a5a48, water=True,
       desc="Hama-rikyu Nakajima-no-ochaya: the timber teahouse with lit shoji screens and a shingled hip-and-gable roof with curved eaves on its stone-edged islet, the veranda on posts over the tidal pond, and the cypress Otsutai bridges with railings running off to both sides; y 0 = pond level")
def hamarikyu_teahouse(b):
    wood = b.c(0x7a5e42); wood2 = b.c(0x5a4532); cyp = b.cf(0xb89868, 0.14); ridge = b.c(0x4a443c); under = b.c(0x8a6e4e); stone = b.c(0x8a867c); grass = b.c(0x5a7040); white = b.cf(0xe4decc, 0.3)
    def shingle(c):
        c.rect(0, 0, 1, 1, 0x5c5248); c.noise(0.12, 8); c.joints(6, 24, 0.82, 1.0); c.grain(0.04)
    sg = b.band('shingle', 64, shingle, bay=4.0)
    def shoji(c):
        c.rect(0, 0, 1, 1, 0x7a5e42)
        for i in range(4):
            c.rect(i / 4 + 0.015, 0.14, i / 4 + 0.235, 0.86, 0xe8e0c8, e=(0.95, 0.78, 0.48))
            for k in range(1, 4): c.rect(i / 4 + 0.015 + k * 0.055 - 0.004, 0.14, i / 4 + 0.015 + k * 0.055 + 0.004, 0.86, 0x7a5e42)
            for k in range(1, 4): c.rect(i / 4 + 0.015, 0.14 + k * 0.18 - 0.012, i / 4 + 0.235, 0.14 + k * 0.18 + 0.012, 0x7a5e42)
    sj = b.band('shoji', 32, shoji, bay=5.4)
    b.prism([(-6, 5), (6, 5.5), (6.6, -3), (2, -5.6), (-5, -5), (-6.6, 0)], 0, 0.7, stone, top=grass)
    b.box(-5.2, 5.2, 1.3, 1.5, -3.2, 5.8, cyp, bot=True)                                   # veranda deck out over the water
    n = b.d(5, 2)
    for i in range(n):
        for z in (5.5, 2.5): b.bx(-4.9 + i * 9.8 / (n - 1), z, 0.22, 0.22, 0, 1.3, wood2)
    b.box(-4.0, 4.0, 1.5, 4.0, -2.6, 3.6, sj, notop=True); b.box(-4.0, -1.0, 1.5, 4.0, -5.0, -2.6, sj, notop=True)
    if b.hi:
        for (x, z) in ((-4, 3.6), (0, 3.6), (4, 3.6), (4, -2.6), (-4, -5.0), (-1, -5.0)): b.bx(x, z, 0.24, 0.24, 1.5, 2.5, wood)
        for (p0, p1) in (((-5.1, 5.7), (5.1, 5.7)), ((5.1, 5.7), (5.1, -3.1)), ((-5.1, -3.1), (-5.1, 5.7))):
            b.beam((p0[0], 2.3, p0[1]), (p1[0], 2.3, p1[1]), 0.08, 0.08, wood); b.beam((p0[0], 1.9, p0[1]), (p1[0], 1.9, p1[1]), 0.06, 0.06, wood)
            for i in range(7): t = i / 6; b.bx(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, 0.07, 0.07, 1.5, 0.8, wood)
    jroof(b, 0, 0.6, 12.4, 10.6, 4.0, 3.4, sg, ridge, style='irimoya', under=under, gable=white, up=0.5, th=0.2)
    jroof(b, -2.5, -4.2, 5.6, 5.0, 3.9, 2.0, sg, ridge, style='gable', axis='z', under=under, gable=white, up=0.2, th=0.2)
    # Otsutai bridges: long cypress decks on trestles with railings
    for (pa, pb) in (((5.2, 3.0), (7.0, 12.0)), ((7.0, 12.0), (5.5, 14.6)), ((-5.2, 1.0), (-7.0, -9.0)), ((-7.0, -9.0), (-5.6, -14.6))):
        d = np.array([pb[0] - pa[0], pb[1] - pa[1]]); Ld = np.linalg.norm(d); d /= Ld; o = np.array([-d[1], d[0]]) * 0.95
        b.beam((pa[0], 1.4, pa[1]), (pb[0], 1.4, pb[1]), 1.9, 0.18, cyp, caps=True)
        for sg_ in (-1, 1):
            b.beam((pa[0] + sg_ * o[0], 2.2, pa[1] + sg_ * o[1]), (pb[0] + sg_ * o[0], 2.2, pb[1] + sg_ * o[1]), 0.1, 0.1, cyp)
            m = b.d(max(2, int(Ld / 1.6)), 1)
            for i in range(m + 1):
                t = i / m; x = pa[0] + (pb[0] - pa[0]) * t + sg_ * o[0]; z = pa[1] + (pb[1] - pa[1]) * t + sg_ * o[1]; b.bx(x, z, 0.14, 0.14, 0 if i % 2 == 0 else 1.3, 2.3 if i % 2 == 0 else 1.0, cyp)
    pine(b, 4.6, -3.2, 5.5, 2.2, lean=0.8, yb=0.7)
    if b.hi: pine(b, -5.0, 3.6, 4.5, 1.8, lean=-0.6, yb=0.7); pine(b, 0.5, -4.6, 4.0, 1.6, lean=0.4, yb=0.7)
    if b.hi: stone_lantern(b, 3.0, -4.2, 2.3)


# ------------------------------------------------------------------ Takeshiba Passenger Ship Terminal
@model('takeshiba_pier', tier='C', face='southeast', stone=0xc8ccd0,
       desc="Takeshiba Passenger Ship Terminal: the paved pier plaza with the tall ship's-mast monument (mast, three yards, crow's nest, stays, red top light), the two glass-fronted terminal blocks with rounded corners and blue roofs either side, covered boarding walkway and bollards on the quay (+Z)")
def takeshiba_pier(b):
    wh = b.cf(0xdcdcd8, 0.26); wh2 = b.cf(0xb8bcc0, 0.18); blue = b.c(0x3a6a9a, 0.5, 0.3); pav = b.c(0xa8a49a); pav2 = b.c(0x8a6a5a); steel = b.c(0xd8d8d4, 0.5, 0.4); dark = b.c(0x2e3236); lit = b.glow(WARM, 0.85, 0x5a4a38)
    gl = b.band('glass', 64, p_curtain(0x50687a, 8, 3, 0xd0d4d4, 1.4, 0.2, lit=0.8, k=0.9), bay=16.0)
    pn = b.band('panel', 48, fl(p_grid(0xd4d6d6, 4, 2, wx=(0.1, 0.9), wy=(0.3, 0.74), lit=0.6, mull=(3, 1)), 0.16), bay=16.0)
    b.cap(B.rect(-22, 22, -42, 42), 0.06, pav); b.cyl(0, 6, 9.0, 0, 0.14, b.d(16, 8), pav2)
    for sx in (-1, 1):
        x0, x1 = (9, 22) if sx > 0 else (-22, -9)
        pts = []; r = 5.0; ns = b.d(4, 2)
        for (cx, cz, a0) in ((x1 - r, 30 - r, 0), (x1 - r, -38 + r, 90), (x0 + r, -38 + r, 180), (x0 + r, 30 - r, 270)):
            for i in range(ns + 1): a = math.radians(a0 + 90 * i / ns); pts.append((cx + r * math.sin(a), cz + r * math.cos(a)))
        pts = pts[::-1]; cl = pts + [pts[0]]
        curvewall(b, cl[::-1], 0, 5.0, gl); curvewall(b, cl[::-1], 5.0, 14.0, pn)
        b.cap(pts, 14.0, blue); b.sweep(cl[::-1], [(0, 13.4), (0.7, 13.4), (0.7, 14.4), (0, 14.4)], wh)
        b.box(x0 + 3, x1 - 3, 14.0, 17.5, -30, 10, wh2, top=blue)
        if b.hi:
            b.sweep(cl[::-1], [(0, 4.8), (1.6, 5.0), (1.6, 5.3), (0, 5.3)], wh)
            b.bx(sx * 15.5, -10, 1.0, 1.0, 17.5, 4.5, steel)
    # the mast monument
    b.cyl(0, 6, 1.6, 0.14, 1.2, b.d(10, 6), wh2); b.tube((0, 1.2, 6), (0, 29.0, 6), 0.42, steel, seg=b.d(8, 5), r1=0.16)
    for (y, L) in ((9.0, 8.0), (16.0, 6.4), (22.5, 4.6)):
        b.tube((-L, y, 6), (L, y, 6), 0.16, steel, seg=b.d(6, 3), smooth=True)
        if b.hi:
            for sx in (-1, 1): b.face([(sx * L, y, 6), (sx * L * 0.99, y + 0.06, 6.02), (0, y + 5.4, 6.02), (0, y + 5.3, 6)], steel)
    b.cyl(0, 6, 1.0, 12.4, 13.0, b.d(10, 6), wh)
    for (dx, dz) in ((9, 0), (-9, 0), (0, 9), (0, -9)): b.face([(dx, 0.2, 6 + dz), (dx * 1.01 + 0.06, 0.2, 6 + dz * 1.01 + 0.06), (0.03, 28.0, 6.03), (0, 28.0, 6)], steel)
    avlight(b, 0, 29.0, 6, 0.5)
    # boarding walkway + bollards on the quay
    b.box(-20, 20, 3.4, 3.8, 34, 39, wh, bot=True); b.face([(-19.6, 3.38, 38.6), (19.6, 3.38, 38.6), (19.6, 3.38, 34.4), (-19.6, 3.38, 34.4)][::-1], lit)
    for i in range(b.d(6, 2)): b.bx(-19 + i * 38 / (b.d(6, 2) - 1), 38.5, 0.4, 0.4, 0, 3.4, steel)
    if b.hi:
        for i in range(8): b.cyl(-17.5 + i * 5, 41.2, 0.3, 0, 0.7, 6, dark)
        for (x, z) in ((-5, -20), (5, -20), (-5, -32), (5, -32)): tree(b, x, z, 6, 2.2, 0x4a6a3a)


# ------------------------------------------------------------------ Shimbashi SL Plaza (C11 steam locomotive)
@model('shimbashi_sl_plaza', tier='C', face='north', stone=0x2a2a2c,
       desc="Shimbashi SL Plaza: a black C11-class 2-6-4 tank locomotive on a short length of track and plinth: boiler with smokebox, chimney and domes, side tanks, cab and bunker, three coupled driving wheels a side with rods, pony and trailing wheels, red buffer beams, lit headlamp; front of the engine to +X")
def shimbashi_sl(b):
    bk = b.c(0x232325, 0.5, 0.4); bk2 = b.c(0x333336, 0.6, 0.3); red = b.c(0x9a2a22); steel = b.c(0x9a9c9c, 0.4, 0.8); gold = b.c(0xb89a50, 0.45, 0.7); conc = b.c(0x9c9a94); rail = b.c(0x6a5a4a, 0.5, 0.6); wood = b.c(0x4a3a2c); lamp = b.glow(WHITEL, 1.0, 0xe8e0c8); cab = b.glow(WARM, 0.5, 0x3a3028)
    b.box(-7.2, 7.2, 0, 0.5, -2.0, 2.0, conc)
    for z in (-0.53, 0.53): b.box(-6.8, 6.8, 0.62, 0.76, z - 0.04, z + 0.04, rail)
    for i in range(b.d(14, 4)): b.bx(-6.4 + i * 12.8 / (b.d(14, 4) - 1), 0, 0.24, 1.9, 0.5, 0.12, wood)
    Y = 0.76; seg = b.d(14, 5)
    def xcyl(x0, x1, y, r, skin, z=0.0, sg=None, cap=True):
        b.tube((x0, y, z), (x1, y, z), r, skin, seg=sg or seg, smooth=True, caps=cap)
    b.box(-5.6, 5.9, Y + 0.7, Y + 1.0, -1.25, 1.25, bk2, bot=True)                       # running plate / frame
    b.box(-5.2, 5.6, Y + 0.25, Y + 0.7, -0.55, 0.55, bk2, bot=True)
    xcyl(-1.6, 5.2, Y + 2.25, 0.82, bk); xcyl(5.2, 5.5, Y + 2.25, 0.86, bk2)             # boiler + smokebox door
    b.lathe(4.6, 0, [(0.26, Y + 3.0), (0.22, Y + 3.7), (0.3, Y + 3.78)], b.d(8, 5), bk, capt=bk2)   # chimney
    for x in (2.6, 0.8): b.lathe(x, 0, [(0.36, Y + 3.0), (0.36, Y + 3.3), (0.2, Y + 3.5), (0, Y + 3.52)], b.d(8, 5), gold if x > 1 else bk)
    for sz in (-1, 1): b.box(-1.6, 2.4, Y + 1.0, Y + 2.5, sz * 0.86, sz * 1.3, bk) if sz > 0 else b.box(-1.6, 2.4, Y + 1.0, Y + 2.5, -1.3, -0.86, bk)   # side tanks
    b.box(-3.6, -1.6, Y + 1.0, Y + 3.3, -1.3, 1.3, bk); b.box(-3.75, -1.45, Y + 3.3, Y + 3.42, -1.4, 1.4, bk2, bot=True)   # cab + roof
    b.box(-5.6, -3.6, Y + 1.0, Y + 2.7, -1.3, 1.3, bk)                                    # bunker
    for sz in (-1, 1): b.face([(-3.3 if sz > 0 else -2.0, Y + 2.3, sz * 1.31), (-2.0 if sz > 0 else -3.3, Y + 2.3, sz * 1.31), (-2.0 if sz > 0 else -3.3, Y + 3.0, sz * 1.31), (-3.3 if sz > 0 else -2.0, Y + 3.0, sz * 1.31)], cab)
    for x in (5.9, -5.7): b.box(x - 0.1, x + 0.1, Y + 0.55, Y + 1.0, -1.3, 1.3, red)
    b.bx(5.45, 0, 0.3, 0.34, Y + 3.15, 0.36, bk2); b.face([(5.61, Y + 3.2, 0.13), (5.61, Y + 3.2, -0.13), (5.61, Y + 3.46, -0.13), (5.61, Y + 3.46, 0.13)], lamp)
    ws = b.d(14, 5)
    for sz in (-1, 1):
        for x in (2.5, 0.9, -0.7):
            b.tube((x, Y + 0.76, sz * 0.48), (x, Y + 0.76, sz * 0.64), 0.76, bk2, seg=ws, smooth=True, caps=True)
            if b.hi: b.tube((x, Y + 0.76, sz * 0.64), (x, Y + 0.76, sz * 0.7), 0.2, red, seg=6, caps=True)
        for x in (4.6, -2.6, -4.2): b.tube((x, Y + 0.43, sz * 0.48), (x, Y + 0.43, sz * 0.62), 0.43, bk2, seg=b.d(10, 4), smooth=True, caps=True)
        b.beam((-0.7, Y + 0.5, sz * 0.74), (2.5, Y + 0.5, sz * 0.74), 0.06, 0.14, steel)   # coupling rod
        b.beam((0.9, Y + 0.56, sz * 0.8), (4.1, Y + 0.9, sz * 0.8), 0.06, 0.12, steel)    # connecting rod
        b.box(3.7, 4.9, Y + 0.6, Y + 1.25, sz * 0.7 if sz > 0 else -1.2, 1.2 if sz > 0 else -0.7, bk)   # cylinder
        if b.hi:
            for x in (5.95,): b.tube((x, Y + 0.8, sz * 0.85), (x + 0.4, Y + 0.8, sz * 0.85), 0.16, steel, seg=6, caps=True)
            b.beam((-1.6, Y + 2.62, sz * 1.08), (2.4, Y + 2.62, sz * 1.08), 0.05, 0.05, steel)
            b.box(1.2, 2.2, Y + 2.52, Y + 2.9, sz * 0.9 if sz > 0 else -1.26, 1.26 if sz > 0 else -0.9, bk2)
    if b.hi:
        for i in range(8):
            for z in (-1.9, 1.9): b.bx(-7.0 + i * 2.0, z, 0.12, 0.12, 0.5, 0.9, steel)
        for z in (-1.9, 1.9): b.box(-7.0, 7.0, 1.3, 1.36, z - 0.03, z + 0.03, steel)
        for x in (3.6, 1.7, -0.4): b.lathe(x, 0, [(0.84, Y + 2.25)], 4, bk) if False else xcyl(x - 0.04, x + 0.04, Y + 2.25, 0.85, bk2, cap=False)


# ------------------------------------------------------------------ GINZA SIX
@model('ginza_six', tier='C', face='southeast', stone=0xc8c8c4,
       desc="GINZA SIX: block-long retail and office building, two-storey lit shopfronts of differing designs along the +Z street front, horizontal stainless eave-like canopies at every floor, glass office floors above, set-back top and roof garden with trees")
def ginza_six(b):
    st = b.c(0xcfd0cc, 0.4, 0.5, emit=(0.14, 0.14, 0.13)); st2 = b.cf(0xb0b2b0, 0.16); roof = b.c(0x74787a); dark = b.c(0x2e3236); green = b.c(0x4e7040); rng = np.random.RandomState(91)
    gl = b.band('glass', 96, p_curtain(0x4c6272, 8, 3, 0xb8bcbc, 1.2, 0.2, lit=0.6, k=0.7), bay=24.0)
    def shopf(c):
        for i in range(4):
            col = [0xe8e4d8, 0x2a2a2c, 0xc8a878, 0x8a8e92][i]; c.rect(i / 4, 0, (i + 1) / 4, 1, col)
            lc = [0xffe6c0, 0xfff1dc, 0xffd29a, 0xd4e2ff][i]
            if i % 2 == 0:
                for k in range(5): c.rect(i / 4 + 0.012 + k * 0.047, 0.04, i / 4 + 0.042 + k * 0.047, 0.94, 0x4a4238, e=tuple(rgbf(lc) * 0.9))
            else: c.rect(i / 4 + 0.03, 0.04, i / 4 + 0.22, 0.6, 0x4a4238, e=tuple(rgbf(lc) * 0.95)); c.rect(i / 4 + 0.03, 0.66, i / 4 + 0.22, 0.94, col, e=tuple(rgbf(lc) * 0.3))
            c.rect(i / 4, 0, i / 4 + 0.006, 1, 0x3a3a3a)
    sf = b.band('shopfront', 64, shopf, bay=48.0)
    X, Z = 42.0, 57.0
    b.box(-X + 0.8, X - 0.8, 0, 10.0, -Z + 0.8, Z - 0.8, F(sf, bay=48.0), notop=True)
    b.box(-X, X, 10.0, 28.0, -Z, Z, gl, notop=True); b.box(-X, X, 28.0, 52.0, -Z, Z, gl, top=roof)
    b.box(-X + 8, X - 8, 52.0, 56.0, -Z + 8, Z - 8, st2, top=roof)
    ys = b.d([10.0 + 4.67 * i for i in range(10)], [10.0, 24.0, 38.0, 51.5])
    for y in ys: b.box(-X - 1.3, X + 1.3, y - 0.25, y + 0.25, -Z - 1.3, Z + 1.3, st, bot=True)
    b.box(-X - 1.6, X + 1.6, 51.4, 52.4, -Z - 1.6, Z + 1.6, st, bot=True)
    if b.hi:
        for i in range(9): b.bx(-X + 0.5 + i * (2 * X - 1.0) / 8, Z - 0.5, 1.0, 1.0, 0, 10.0, st2); b.bx(-X + 0.5 + i * (2 * X - 1.0) / 8, -Z + 0.5, 1.0, 1.0, 0, 10.0, st2)
        for i in range(1, 11): 
            for sx in (-1, 1): b.bx(sx * (X - 0.5), -Z + 0.5 + i * (2 * Z - 1.0) / 11, 1.0, 1.0, 0, 10.0, st2)
        b.box(-X + 10, X - 10, 52.0, 52.3, Z - 7.5, Z - 1, green); b.box(-X + 1, -X + 7.5, 52.0, 52.3, -Z + 2, Z - 8, green)
        for (x, z) in ((-30, 52), (-12, 53), (10, 52), (28, 53), (-38, 20), (-38, -10), (-38, -40), (38, 30)): tree(b, x, z, 5, 2.2, 0x4e7040, yb=52.0)
    for (x, z) in ((-10, -20), (14, 10), (0, 30)): b.bx(x, z, 12, 8, 56.0, 2.5, st2, top=roof)
    if not b.hi:
        for (x, z) in ((-X + 0.5, Z - 0.5), (X - 0.5, Z - 0.5), (X - 0.5, -Z + 0.5), (-X + 0.5, -Z + 0.5)): b.bx(x, z, 1.0, 1.0, 0, 10.0, st2)
    for (x, z) in ((-X + 8.5, -Z + 8.5), (X - 8.5, Z - 8.5)): avlight(b, x, 56.0, z, 0.6)


run()
