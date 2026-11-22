# Tokyo kit: rooftop plant cluster + debris chunks (one small-atlas material each). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *


@K.piece('tokyo_rooftop_mech', atlas=512, prop=True, stone=0x9aa0a2, desc='rooftop cluster: stair penthouse, panel water tank on a steel stand, louvred chillers, AC units, vents and a lit sign frame (placed on flat roofs)')
def rooftop_mech(k):
    S = Signs(k, 5)
    bulkhead(k, 0.0, 0, -4.4, 2.8, 2.6, 3.2, lod=1); frp_tank(k, 3.4, 0, -4.6, 3.0, 2.0, 2.0, legs=1.3, lod=1)
    plant(k, 3.2, 0, -1.9, 2.0, 1.4, 1.5, lod=1); ac_rows(k, 5.5, 0, -1.8, 2, 2); vent(k, 0.5, 0, -0.9, 0.22, 0.9); vent(k, 1.3, 0, -0.9, 0.18, 0.6); vent(k, 0.6, 2.6, -3.6, 0.2, 0.6)
    S.roof_sign(0.2, 7.8, 0, 0.0, h=2.6, legs=3.2, glow=0.95, lod=1)
    k.bar([6.9, 0, -3.0], [6.9, 5.9, -3.0], 0.08, props(k), PR['steel']); avi(k, 6.9, 5.7, -3.0, 0.3)


def chunk(k, s, parts, r, top=None, lod_first=9):
    for i, (x0, y0, z0, x1, y1, z1) in enumerate(parts):
        k.box(x0, y0, z0, x1, y1, z1, s, (r[0] + x0 - parts[0][0], r[1] + y0, x1 - x0, min(r[3] - y0, y1 - y0)), top, lod=1 if i < lod_first else 0, bottom=True)


def rebar(k, pts, c=0x6a4a3a, t=0.035):
    ms = k.metal_sheet(c)
    for i, (a, b) in enumerate(pts): k.bar(a, b, t, ms, (0.1, 0.1, 0.3, 0.3), lod=3 if i < 2 else 1)


def D(name, desc):
    return K.piece('debris_tokyo_' + name, atlas=256, mat='debris_tokyo_' + name, debris=True, desc=desc)


@D('tile_wall', 'ragged slab of white-tiled concrete wall with a window corner')
def d_tile(k):
    s = k.sheet(3.0, 2.2, 1.0, 'd'); tile(s, 0, 0, 3.0, 2.2, C(0xdedbd2), 1, 1.5); s.rect(1.9, 1.2, 0.9, 1.0, 0x34424f); s.rect(1.85, 1.15, 0.06, 1.05, 0xc9ccce); s.rect(1.85, 1.15, 1.0, 0.06, 0xc9ccce)
    chunk(k, s, [(0, 0, 0, 1.0, 2.15, 0.22), (1.0, 0, 0, 1.9, 1.5, 0.22), (1.9, 0, 0, 2.7, 0.9, 0.22), (1.0, 1.5, 0, 1.5, 1.85, 0.22), (2.7, 0, 0.03, 3.0, 0.4, 0.2), (1.9, 0.9, 0.02, 2.3, 1.15, 0.2)], (0, 0, 3.0, 2.2))
    rebar(k, [([1.9, 1.3, 0.11], [2.5, 1.7, 0.2]), ([1.0, 1.9, 0.11], [1.3, 2.4, 0.0]), ([2.7, 0.6, 0.11], [3.1, 0.9, 0.2])])


@D('sign_board', 'torn-off vertical signboard: bent steel case, coloured face with abstract glyph blocks, broken bracket arms')
def d_sign(k):
    S = Signs(k, 3); r = S.sign(0.9, 3.4, bg=0xd82a2a); r2 = S.sign(0.9, 3.4, bg=0x1f5fd0); S.s._em.ops = []
    k.box(0, 0.0, 0, 3.4 * 0.55, 0.22, 0.9, S.s, (r[0], r[1], 0.05, 0.2), (r[0], r[1] + 3.4 * 0.45, 0.9, 3.4 * 0.55), lod=1, bottom=True)
    k.boxpts([1.87, 0.0, 0], [1.45, 0.42, 0], [-0.06, 0.21, 0], [0, 0, 0.9], S.s, (r[0], r[1], 0.05, 0.2), (r2[0], r2[1], 0.9, 3.4 * 0.45), lod=1, bottom=True)
    ms = k.metal_sheet(0x3a3d40)
    for (a, b) in (([0.4, 0.1, 0.9], [0.5, 0.25, 1.5]), ([1.3, 0.1, 0.9], [1.2, 0.4, 1.4]), ([0.4, 0.1, 0], [0.2, 0.3, -0.4]), ([2.6, 0.3, 0.9], [2.9, 0.6, 1.3])): k.bar(a, b, 0.07, ms, (0.1, 0.1, 0.3, 0.3), lod=1)
    k.box(0.9, 0.22, 0.3, 1.3, 0.3, 0.6, S.s, (r2[0], r2[1], 0.3, 0.3), bottom=True)


@D('balcony_slab', 'broken balcony: concrete slab with a length of solid parapet rail and a bent handrail')
def d_balcony(k):
    s = k.sheet(3.2, 1.6, 1.0, 'd'); wallmat(s, 0, 0, 3.2, 1.6, 'concrete', C(0xd4cfc0), 2, 1.5); s.rect(0, 1.2, 3.2, 0.1, 0xb8b4a8)
    k.box(0, 0, 0, 3.0, 0.16, 1.2, s, (0, 0, 3.0, 0.16), (0, 0.2, 3.0, 1.2), lod=1, bottom=True)
    k.box(0, 0.16, 1.08, 1.9, 1.2, 1.2, s, (0, 0.16, 1.9, 1.04), lod=1); k.box(1.9, 0.16, 1.08, 2.6, 0.7, 1.2, s, (1.9, 0.16, 0.7, 0.54), lod=1)
    k.box(0, 0.16, 0.0, 0.12, 1.2, 1.08, s, (0, 0.16, 0.12, 1.04), side2=(0, 0.16, 1.08, 1.04)); k.box(3.0, 0, 0.2, 3.3, 0.14, 0.9, s, (0, 0, 0.3, 0.14), (0.2, 0.3, 0.3, 0.7), bottom=True)
    rebar(k, [([0, 1.25, 1.14], [2.2, 1.3, 1.14]), ([2.2, 1.3, 1.14], [3.0, 0.9, 1.5]), ([3.0, 0.08, 0.5], [3.5, 0.3, 0.6]), ([3.0, 0.08, 0.9], [3.4, 0.0, 1.1])], 0x9a9ea0, 0.05)


@D('wood_frame', 'splintered house timbers: posts and beams with a patch of plaster wall and a few roof tiles')
def d_wood(k):
    s = k.sheet(3.0, 1.2, 1.0, 'd'); s.vboards(0, 0, 3.0, 0.6, C(0x8a6a48), 0.3, 0.2); s.noise(0, 0, 3.0, 0.6, 0.2, 0.1, 0.8, 1); wallmat(s, 0, 0.6, 1.6, 0.6, 'stucco', C(0xe4dcc8), 2, 1.5); s.tiles(1.6, 0.6, 1.4, 0.6, C(0x4a4e56), 0.3, 0.3, 0.3)
    W = (0.1, 0.05, 2.8, 0.2)
    for (a, b, t) in (([0, 0.08, 0], [3.0, 0.08, 0.2], 0.16), ([0.2, 0.08, 0.9], [2.6, 0.5, 0.7], 0.14), ([0.5, 0.0, -0.3], [0.7, 1.5, 0.3], 0.14), ([2.2, 0.0, -0.2], [1.9, 1.1, 0.6], 0.12), ([1.0, 0.3, 0.1], [1.4, 0.4, 1.3], 0.1)):
        k.bar(a, b, t, s, W, lod=3)
    k.boxpts([0.6, 0.2, 0.25], [1.3, 0.2, 0], [0, 0.9, 0.25], [0, -0.02, 0.07], s, (0.1, 0.65, 1.3, 0.5), (0.1, 0.65, 1.3, 0.05), lod=1, bottom=True)
    for i, (x, z, a) in enumerate(((2.0, 0.9, 0.2), (2.5, 0.3, -0.3), (1.5, 1.2, 0.5))):
        k.boxpts([x, 0.0 + i * 0.03, z], [0.5 * math.cos(a), 0.04, 0.5 * math.sin(a)], [0, 0.05, 0], [-0.4 * math.sin(a), 0.1, 0.4 * math.cos(a)], s, (1.7, 0.65, 0.6, 0.5), (1.7, 0.65, 0.6, 0.5), bottom=True)


@D('curtain_wall', 'buckled curtain-wall panel: aluminium frame, blue-green glass, a spandrel strip')
def d_curtain(k):
    s = k.sheet(3.0, 2.8, 1.0, 'd'); s.rect(0, 0, 3, 2.8, C(0x9aa2a6))
    for i in range(2):
        for j in range(2): s.grad(i * 1.5 + 0.08, j * 1.4 + 0.08, 1.34, 1.24, C(0x3f6a74), C(0x8fb8c0))
    s.rect(0.08, 0.08, 2.84, 0.5, 0x33505f); s.poly([(0.3, 2.6), (1.2, 1.6), (0.9, 2.7)], C(0xd0e4e2), 0.5); s.noise(0, 0, 3, 2.8, 0.1, 0.5, 0.5, 2)
    k.box(0, 0, 0, 3.0, 2.8, 0.06, s, (0, 0, 3.0, 2.8), (0, 0, 0.06, 0.06), lod=1, bottom=True, side2=(0, 0, 0.06, 2.8))
    for x in (0, 1.45, 2.9): k.box(x, 0, -0.08, x + 0.1, 2.8, 0.16, s, (0.0, 0, 0.06, 2.8), (0, 0, 0.06, 0.06), bottom=True, lod=1)
    for y in (0, 1.35, 2.7): k.box(0, y, -0.06, 3.0, y + 0.1, 0.14, s, (0, 0.0, 3.0, 0.06), (0, 0, 0.06, 0.06), bottom=True, lod=1 if y != 1.35 else 0)


@D('steel_beam', 'twisted steel H-beam with a torn end plate and a stub of cross beam')
def d_beam(k):
    s = k.sheet(4.2, 0.6, 1.0, 'd'); s.rect(0, 0, 4.2, 0.6, C(0x6a5a50)); s.noise(0, 0, 4.2, 0.6, 0.25, 0.3, 0.2, 2); s.rect(0, 0.5, 4.2, 0.1, C(0x8a4a38), 0.5)
    k.box(0, 0, 0, 4.2, 0.05, 0.4, s, (0, 0, 4.2, 0.05), (0, 0.05, 4.2, 0.4), lod=1, bottom=True); k.box(0, 0.05, 0.17, 4.2, 0.55, 0.23, s, (0, 0.05, 4.2, 0.5), lod=1)
    k.box(0, 0.55, 0, 4.2, 0.6, 0.4, s, (0, 0.5, 4.2, 0.05), (0, 0.1, 4.2, 0.4), lod=1, bottom=True)
    k.box(4.1, 0, -0.1, 4.2, 0.75, 0.5, s, (0.2, 0.1, 0.1, 0.4), (0.2, 0.1, 0.1, 0.1), bottom=True, side2=(0.5, 0, 0.6, 0.6), lod=1)
    k.box(1.4, 0.05, 0.02, 1.48, 0.55, 0.38, s, (0.2, 0.1, 0.08, 0.4), bottom=True, side2=(1.0, 0.05, 0.4, 0.5))
    k.box(2.4, 0.15, 0.4, 2.6, 0.5, 1.1, s, (0.2, 0.1, 0.2, 0.35), (1.0, 0.1, 0.2, 0.4), bottom=True, side2=(1.0, 0.05, 0.7, 0.35))


@D('concrete_slab', 'broken reinforced-concrete floor slab with rebar')
def d_slab(k):
    s = k.sheet(3.2, 2.4, 1.0, 'd'); wallmat(s, 0, 0, 3.2, 2.4, 'concrete', C(0xb0aa9c), 1, 1.5)
    for i, (x0, z0, x1, z1) in enumerate([(0, 0, 1.3, 2.4), (1.3, 0.2, 2.4, 2.1), (2.4, 0.6, 3.2, 1.6), (0.4, -0.4, 1.1, 0.0)]):
        k.box(x0, 0, z0, x1, 0.34 if i < 3 else 0.3, z1, s, (x0, 0.05, x1 - x0, 0.34), (x0, max(0, z0), x1 - x0, min(2.4, z1) - max(0, z0)), lod=1, bottom=True)
    rebar(k, [([3.2, 0.17, 0.9], [3.8, 0.42, 1.0]), ([3.2, 0.17, 1.3], [3.7, 0.12, 1.1]), ([1.8, 0.17, 2.1], [1.9, 0.47, 2.6]), ([0.6, 0.17, 2.4], [0.5, 0.32, 3.0]), ([1.3, 0.17, 0.2], [1.5, 0.37, -0.3])])


@D('roof_tiles', 'slid heap of grey kawara roof tiles on a broken batten panel')
def d_tiles(k):
    s = k.sheet(2.6, 2.0, 1.0, 'd'); s.tiles(0, 0, 2.6, 1.6, C(0x4a4e56), 0.3, 0.3, 0.3); s.noise(0, 0, 2.6, 1.6, 0.15, 0.6, 0.6, 2); s.vboards(0, 1.6, 2.6, 0.4, C(0x8a6a48), 0.3, 0.2)
    k.boxpts([0, 0, 0], [2.4, 0, 0], [0, 0.1, 0], [0, 0.5, 1.5], s, (0, 1.65, 2.4, 0.1), (0, 0, 2.4, 1.55), lod=1, bottom=True)
    k.boxpts([0.3, 0.1, 0.1], [1.2, 0.05, 0.2], [0, 0.09, 0], [-0.1, 0.35, 0.9], s, (0, 1.65, 1.2, 0.1), (0.3, 0.3, 1.2, 0.9), lod=1, bottom=True)
    for i, (x, z, a) in enumerate(((2.5, 0.2, 0.3), (2.7, 0.9, -0.4), (-0.4, 0.5, 0.6), (1.0, -0.5, 0.1), (1.8, -0.4, -0.5))):
        k.boxpts([x, 0.0, z], [0.32 * math.cos(a), 0.03 * i, 0.32 * math.sin(a)], [0, 0.05, 0], [-0.3 * math.sin(a), 0.08, 0.3 * math.cos(a)], s, (0, 1.65, 0.3, 0.08), (0.3 * i, 0.3, 0.3, 0.3), bottom=True)
    k.bar([0.2, 0.05, 1.5], [2.9, 0.1, 1.9], 0.07, s, (0, 1.65, 2.4, 0.3), lod=1)
