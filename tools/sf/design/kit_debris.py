# SF kit: rooftop plant cluster + debris chunks (one small-atlas material each). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_parts import *


@K.piece('sf_rooftop_mech', atlas=512, prop=True, stone=0x9aa0a2, desc='rooftop plant room with a wooden water tank, louvred chillers, ducts and vents (placed on flat roofs)')
def rooftop_mech(k):
    k.bulkhead(0.0, 0, -4.2, 3.4, 2.9, 4.2, lod=1)
    k.tank(5.9, 0, -2.0, 1.3, 2.2, 1.1, lod=1)
    k.plant(3.9, 0, -5.9, 2.6, 1.6, 1.9, lod=1); k.plant(6.7, 0, -5.9, 1.3, 1.2, 1.6)
    k.duct(3.4, 0.9, -3.4, 1.2, 0.6, 0.5); k.box(0, 0, -5.9, 0.1, 0.1, -5.8, k.prop_sheet(), (0.1, 3.1, 0.1, 0.1), lod=1); k.box(7.9, 0, -0.1, 8.0, 0.1, 0.0, k.prop_sheet(), (0.1, 3.1, 0.1, 0.1), lod=1); k.duct(4.3, 0, -4.0, 0.6, 3.6, 0.55)
    k.vent(3.9, 0, -0.5, 0.22, 0.9); k.vent(0.6, 2.9, -1.0, 0.2, 0.6); k.skylight(0.3, 0, -5.9, 1.6, 1.2)


def chunk(k, s, parts, r, top=None, lod_first=9):
    for i, (x0, y0, z0, x1, y1, z1) in enumerate(parts):
        k.box(x0, y0, z0, x1, y1, z1, s, (r[0] + x0 - parts[0][0], r[1], x1 - x0, min(r[3], y1 - y0)), top, lod=1 if i < lod_first else 0, bottom=True)


@K.piece('debris_sf_victorian_bay', atlas=256, mat='debris_sf_victorian_bay', debris=True, desc='torn-off painted wood bay window')
def d_bay(k):
    F = k.facade((0, 0, 0), (1, 0, 0), 3.0, 2.7); s = F.s
    body = C(0x86adc2); trim = C(0xf0e8d6)
    s.siding(0, 0, 3.0, 2.7, mul(body, 0.8)); 
    bs, segs = F.bay(0.1, 0, 2.7, [(0, 0), (0.75, 0.8), (2.05, 0.8), (2.8, 0)])
    u1 = segs[-1][1]; bs.siding(0, 0, u1, 2.7, body); bs.rect(0, 0, u1, 0.2, trim); bs.rect(0, 2.45, u1, 0.25, trim)
    for (a, b) in segs:
        bs.rect(a + 0.12, 0.3, b - a - 0.24, 0.5, trim); bs.window(a + 0.2, 0.95, b - a - 0.4, 1.35, trim=trim, tw=0.08, frame=trim, blind=0); bs.rect(a, 0, 0.07, 2.7, trim)
    bs.noise(0, 0, u1, 2.7, 0.15, 0.6, 0.6, 2)
    F.face([F.P(0.1, 0, 0), F.P(2.9, 0, 0), F.P(2.9, 2.7, 0), F.P(0.1, 2.7, 0)], [(0.1, 0), (2.9, 0), (2.9, 2.7), (0.1, 2.7)], -F.n, 3)
    ms = k.metal_sheet(0x8a7458)
    for (x, y, l) in ((0.3, 2.3, 0.9), (2.6, 0.5, 0.7), (1.5, 1.4, 0.6)):
        k.bar(F.P(x, y, -0.02), F.P(x + 0.1, y + 0.15, -l * 0.5), 0.1, ms, (0.1, 0.6, 0.3, 0.3), lod=3)
    F.box(0.0, 2.7, 3.0, 0.18, 0.95, d0=-0.05, faces='flrtb', lod=True, uvrect=(0, 0.02, 3.0, 0.1))
    F.box(0.3, -0.0, 2.4, 0.12, 0.6, faces='flrb')


def _wall(k, mat, c, parts, w, h, seed=1):
    s = k.sheet(w, h, 1.0, 'd'); wallpaint(s, 0, 0, w, h, mat, c, seed, 1.5)
    return s


@K.piece('debris_sf_wood_siding', atlas=256, mat='debris_sf_wood_siding', debris=True, desc='splintered panel of painted lap siding on studs')
def d_siding(k):
    s = _wall(k, 'siding', C(0xe6c878), None, 3.2, 2.0)
    chunk(k, s, [(0, 0, 0, 1.2, 1.9, 0.12), (1.2, 0, 0, 2.3, 1.4, 0.12), (2.3, 0, 0, 3.2, 0.8, 0.12)], (0, 0, 3.2, 2.0))
    ms = k.metal_sheet(0x9a8262)
    for x in (0.3, 1.6, 2.8):
        k.bar([x, 0, -0.06], [x + 0.05, 2.1 - x * 0.35, -0.06], 0.11, ms, (0.1, 0.6, 0.3, 0.3), lod=3)


@K.piece('debris_sf_brick_wall', atlas=256, mat='debris_sf_brick_wall', debris=True, desc='ragged slab of red brick wall')
def d_brick_wall(k):
    s = _wall(k, 'brick', C(0x8e4a38), None, 2.6, 2.0)
    chunk(k, s, [(0, 0, 0, 0.9, 1.95, 0.45), (0.9, 0, 0, 1.8, 1.45, 0.45), (1.8, 0, 0, 2.6, 0.85, 0.45), (0.9, 1.45, 0, 1.3, 1.7, 0.45), (1.8, 0.85, 0.05, 2.2, 1.1, 0.4), (2.6, 0, 0.08, 2.85, 0.4, 0.4)], (0, 0, 2.6, 2.0))


@K.piece('debris_sf_brick_corner', atlas=256, mat='debris_sf_brick_corner', debris=True, desc='broken brick building corner')
def d_brick_corner(k):
    s = _wall(k, 'brick', C(0x9c5842), None, 2.4, 2.4)
    chunk(k, s, [(0, 0, 0, 2.0, 1.6, 0.42), (0, 0, -1.7, 0.42, 2.3, 0), (0, 1.6, 0, 1.0, 2.3, 0.42), (0, 0, -2.2, 0.42, 1.2, -1.7), (1.0, 1.6, 0.04, 1.5, 1.9, 0.4), (2.0, 0, 0.05, 2.3, 0.7, 0.4)], (0, 0, 2.4, 2.4))


@K.piece('debris_sf_terracotta_cornice', atlas=256, mat='debris_sf_terracotta_cornice', debris=True, desc='length of cream terracotta cornice with dentils')
def d_cornice(k):
    s = k.sheet(2.8, 1.0, 1.0, 'd'); cornice_paint(s, 0, 0, 2.8, 1.0, C(0xd9cdb4), dentil=0.3); s.noise(0, 0, 2.8, 1.0, 0.12, 0.5, 0.5, 3)
    for i, (x0, y0, z0, x1, y1, z1) in enumerate([(0, 0, 0, 2.7, 0.35, 0.5), (0, 0.35, 0, 2.5, 0.65, 0.8), (0.1, 0.65, 0, 2.3, 0.85, 1.05), (0.3, 0.85, 0, 1.6, 1.0, 0.6), (2.7, 0, 0.05, 2.95, 0.3, 0.45)]):
        k.box(x0, y0, z0, x1, y1, z1, s, (x0, y0, x1 - x0, y1 - y0), lod=1, bottom=True)


@K.piece('debris_sf_curtain_wall', atlas=256, mat='debris_sf_curtain_wall', debris=True, desc='buckled curtain-wall panel: aluminium frame, blue-green glass')
def d_curtain(k):
    s = k.sheet(3.0, 2.8, 1.0, 'd'); s.rect(0, 0, 3, 2.8, C(0x9aa2a6))
    for i in range(2):
        for j in range(2):
            s.grad(i * 1.5 + 0.08, j * 1.4 + 0.08, 1.34, 1.24, C(0x4f8884), C(0x8fc0bc))
    s.poly([(0.3, 2.6), (1.2, 1.6), (0.9, 2.7)], C(0xd0e4e2), 0.5); s.noise(0, 0, 3, 2.8, 0.1, 0.5, 0.5, 2)
    k.box(0, 0, 0, 3.0, 2.8, 0.06, s, (0, 0, 3.0, 2.8), (0, 0, 0.06, 0.06), lod=1, bottom=True, side2=(0, 0, 0.06, 2.8))
    for x in (0, 1.45, 2.9):
        k.box(x, 0, -0.08, x + 0.1, 2.8, 0.16, s, (0.0, 0, 0.06, 2.8), (0, 0, 0.06, 0.06), bottom=True, lod=1)
    for y in (0, 1.35, 2.7):
        k.box(0, y, -0.06, 3.0, y + 0.1, 0.14, s, (0, 0.0, 3.0, 0.06), (0, 0, 0.06, 0.06), bottom=True, lod=1 if y != 1.35 else 0)


@K.piece('debris_sf_steel_beam', atlas=256, mat='debris_sf_steel_beam', debris=True, desc='twisted steel I-beam with a torn end plate')
def d_beam(k):
    s = k.sheet(4.2, 0.6, 1.0, 'd'); s.rect(0, 0, 4.2, 0.6, C(0x6a5a50)); s.noise(0, 0, 4.2, 0.6, 0.25, 0.3, 0.2, 2); s.rect(0, 0.5, 4.2, 0.1, C(0x8a4a38), 0.5)
    r = (0, 0, 4.2, 0.6)
    k.box(0, 0, 0, 4.2, 0.05, 0.4, s, (0, 0, 4.2, 0.05), (0, 0.05, 4.2, 0.4), lod=1, bottom=True)
    k.box(0, 0.05, 0.17, 4.2, 0.55, 0.23, s, (0, 0.05, 4.2, 0.5), lod=1)
    k.box(0, 0.55, 0, 4.2, 0.6, 0.4, s, (0, 0.5, 4.2, 0.05), (0, 0.1, 4.2, 0.4), lod=1, bottom=True)
    k.box(4.1, 0, -0.1, 4.2, 0.75, 0.5, s, (0.2, 0.1, 0.1, 0.4), (0.2, 0.1, 0.1, 0.1), bottom=True, side2=(0.5, 0, 0.6, 0.6), lod=1)
    k.box(1.4, 0.05, 0.02, 1.48, 0.55, 0.38, s, (0.2, 0.1, 0.08, 0.4), bottom=True, side2=(1.0, 0.05, 0.4, 0.5))


@K.piece('debris_sf_concrete_slab', atlas=256, mat='debris_sf_concrete_slab', debris=True, desc='broken reinforced-concrete floor slab with rebar')
def d_slab(k):
    s = _wall(k, 'concrete', C(0xb0aa9c), None, 3.2, 2.4)
    for i, (x0, z0, x1, z1) in enumerate([(0, 0, 1.3, 2.4), (1.3, 0.2, 2.4, 2.1), (2.4, 0.6, 3.2, 1.6), (0.4, -0.4, 1.1, 0.0)]):
        k.box(x0, 0, z0, x1, 0.34 if i < 3 else 0.3, z1, s, (x0, 0.05, x1 - x0, 0.34), (x0, max(0, z0), x1 - x0, min(2.4, z1) - max(0, z0)), lod=1, bottom=True)
    ms = k.metal_sheet(0x6a4a3a)
    for (x, z, dx, dy, dz) in ((3.2, 0.9, 0.6, 0.25, 0.1), (3.2, 1.3, 0.5, -0.05, -0.2), (1.8, 2.1, 0.1, 0.3, 0.5), (0.6, 2.4, -0.1, 0.15, 0.6), (1.3, 0.2, 0.2, 0.2, -0.5)):
        k.bar([x, 0.17, z], [x + dx, 0.17 + dy, z + dz], 0.035, ms, (0.1, 0.1, 0.3, 0.3), lod=3 if dx > 0.4 or dz > 0.4 else 1)
