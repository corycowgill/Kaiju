# SF kit: mid-rise offices / hotels / apartments, glass slabs and glass towers (buckets low .. tall). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_parts import *
from kit_block import *
from kit_tower_lib import *


def simple_tower(k, W, D, g, lobby, st, nfl, fh, mod, nv=2, corner=None, mech_h=3.0, mech_in=5.0, mech_c=0x9aa0a2, roof_c=None, seed=0, tiers=None, clutter=True):
    """Lobby tier + main tier(s) + roof + louvred penthouse. tiers: extra [(style, nfl, inset, corner)] stacked above."""
    x0, x1, z0, z1 = 0.0, W, -D, 0.0
    y = tier(k, lobby, x0, x1, z0, z1, 0, 1, g, nv=1, corner=corner)
    y = tier(k, st, x0, x1, z0, z1, y, nfl, fh, mod, nv, corner=corner)
    rs = roof_sheet(k, W, D, 0.4, seed, roof_c)
    tier_roof(k, rs, x0, x1, z0, z1, y, corner, 0, 0)
    for (st2, n2, ins, cor2) in (tiers or []):
        x0 += ins; x1 -= ins; z0 += ins; z1 -= ins
        y = tier(k, st2, x0, x1, z0, z1, y, n2, fh, min(mod, n2), 1, corner=cor2)
        tier_roof(k, rs, x0, x1, z0, z1, y, cor2, 0, 0)
    if mech_h > 0:
        mech(k, x0 + mech_in, x1 - mech_in, z0 + mech_in, z1 - mech_in, y, mech_h, mech_c)
    if clutter:
        k.roof_clutter(x0 + 1.0, z0 + 1.0, x0 + mech_in - 0.5, z1 - 1.0, y, n=3, bulk=False, seed=seed, sky=False)
    return y, rs, (x0, x1, z0, z1)


# ------------------------------------------------------------------ mid-rise
@K.piece('sf_midrise_a', style='midrise masonry', stone=0xcfc6b2,
         desc='1920s 10-storey Financial District office: granite base, cream terracotta shaft with Chicago windows and piers, arched attic, heavy cornice')
def midrise_a(k):
    o = dict(W=26.0, D=32.0, g=6.2, fh=3.8, nfl=9, par=2.2, mat='terracotta', c=0xd2c8b2, trim=0xddd4c0, base=0x9a968e, corner=True, cols=5, side_cols=6,
             win=dict(w=3.0, h=2.3, kind='transom', nx=3, d=0.28, frame=0x4a5450, lintel=False, sill=0.95, arch=False), pilasters=0.75,
             top_band=dict(n=1, c=0xd8cfba), belts=[1, 8],
             cornice=dict(h=2.1, d=1.2, dentil=0.5, brackets=3, c=0xd8cfba, y=6.2 + 34.2 - 0.3),
             ground=dict(kind='shop', pier=1.0, sign_h=1.0),
             shops=[dict(sign=C(0x2e3e36), transom=1.5), dict(sign=C(0x2e3e36), transom=1.5, door=1), dict(kind='entry', doorc=0x6a5a30), dict(sign=C(0x3a3a44), transom=1.5), dict(sign=C(0x3a3a44), transom=1.5, door=0)],
             side_shops=[dict(sign=C(0x3a3a44), transom=1.5), dict(transom=1.5), dict(transom=1.5, door=1), dict(kind='window'), dict(kind='window'), dict(kind='rollup')],
             tank=(18.0, -24.0), rear_stairs=False, party_c=0xb4ab98, rear_c=0xa89f8c, party_mat='brick', rear_mat='brick')
    block(k, o)


@K.piece('sf_midrise_b', style='midrise concrete', stone=0xc2bcae,
         desc='1960s 13-storey concrete-grid office: egg-crate frame of piers and spandrels, dark glass, recessed lobby, louvred penthouse')
def midrise_b(k):
    st = Grid(c=0xc6c0b2, mat='concrete', bay=3.1, ww=2.5, wh=2.1, sill=1.15, glass=0x3e4c56, frame=0x3a3e40, lites=2, blind=0.35,
              pier_every=1, pier_w=0.55, pier_d=0.55, bands=0.4, band_h=1.05, spandrel=C(0xbab4a6))
    lob = Lobby(pier=0xb0aa9c, bay=6.2, pier_w=1.0, d=1.6, canopy=2.2, fascia=0xc6c0b2)
    simple_tower(k, 31.0, 34.1, 5.6, lob, st, 12, 3.8, 4, mech_h=3.2, mech_in=7.0, seed=2)


@K.piece('sf_midrise_c', style='midrise glass', stone=0x8c979c,
         desc='modern SoMa 7-storey glass-and-metal-panel office: zinc piers, fins, deep spandrels, glazed lobby with a canopy, roof plant screen')
def midrise_c(k):
    st = Curtain(glass=0x688894, mull=0x53595c, spandrel=0x5a646a, sp=0.95, bay=3.4, sub=3, pier_every=3, pier=0x8f989c, pier_w=0.9, pier_d=0.4,
                 fin_every=1, fin_w=0.14, fin_d=0.3, finc=0x53595c, blind=0.2)
    lob = Lobby(pier=0x70777a, bay=5.1, pier_w=0.9, d=0.9, canopy=2.4, fascia=0x8f989c, shops=0.6)
    y, rs, _ = simple_tower(k, 34.0, 30.6, 5.2, lob, st, 6, 3.9, 3, mech_h=2.6, mech_in=6.5, mech_c=0x858d90, seed=4)
    # rust-coloured accent box frame round two bays of the front
    acc = k.sheet(1.0, 1.0, 0.3, 'acc'); acc.rect(0, 0, 1, 1, C(0xa85a34)); acc.noise(0, 0, 1, 1, 0.1, 0.2, 0.2, 2)
    for (a, b) in (([6.6, 5.2, 0.45], [0.35, 15.6, 0.0]), ([6.6 + 10.2, 5.2, 0.45], [0.35, 15.6, 0.0]), ([6.6, 5.2 + 15.6, 0.45], [10.55, 0.35, 0.0]), ([6.6, 5.2, 0.45], [10.55, 0.35, 0.0])):
        k.box(a[0], a[1], -0.05, a[0] + b[0], a[1] + b[1], 0.75, acc, (0.1, 0.1, 0.5, 0.5), (0.1, 0.1, 0.5, 0.5), bottom=True, lod=1)


@K.piece('sf_midrise_d', style='midrise concrete hotel', stone=0xd6ccb6,
         desc='1970s 16-storey hotel block: cream precast piers between window stacks, glazed podium with a porte-cochere canopy, blank roof sign frame')
def midrise_d(k):
    st = Grid(c=0xdad0ba, mat='concrete', bay=3.6, ww=2.6, wh=1.9, sill=0.95, glass=0x40505c, frame=0x5a544a, lites=2, blind=0.55, blindc=0xe0d8c4,
              pier_every=1, pier_w=0.7, pier_d=0.45, spandrel=C(0xc9bfa8), punch=0.0)
    lob = Lobby(pier=0xb4aa96, bay=7.2, pier_w=1.1, d=1.2, canopy=4.5, fascia=0x6a3a34, fascia_h=1.2, shops=0.3)
    W, D = 36.0, 20.0
    y, rs, _ = simple_tower(k, W, D, 6.4, lob, st, 15, 3.3, 5, mech_h=3.0, mech_in=4.5, seed=6)
    # blank sign frame on the roof edge
    sg = k.sheet(8.0, 2.0, 0.6, 'sign'); sg.rect(0, 0, 8, 2, C(0x6a3a34)); sg.rect(0.15, 0.15, 7.7, 1.7, C(0x5a302c))
    for j in range(7): sg.rect(0.6 + j * 1.0, 0.5, 0.65, 1.0, C(0xe6d8b0), 0.9)
    k.box(W / 2 - 6, y + 0.8, -1.2, W / 2 + 6, y + 3.6, -0.9, sg, (0, 0, 8, 2), (0.2, 0.02, 1, 0.1), lod=1, bottom=True)
    iron = k.metal_sheet()
    for x in (W / 2 - 5.5, W / 2, W / 2 + 5.5):
        k.bar([x, y, -1.05], [x, y + 0.8, -1.05], 0.12, iron, (0.1, 0.1, 0.3, 0.3)); k.bar([x, y, -3.0], [x, y + 3.0, -1.2], 0.08, iron, (0.1, 0.1, 0.3, 0.3))


# ------------------------------------------------------------------ apartments
@K.piece('sf_apartment_a', style='apartment midrise stucco', stone=0xe2d6bc,
         desc='1920s Nob Hill 10-storey stucco apartment house: round bay-window stacks, rusticated base with an entrance canopy, tiled parapet, roof tank')
def apartment_a(k):
    o = dict(W=21.0, D=30.0, g=5.0, fh=3.2, nfl=9, par=1.6, mat='stucco', c=0xe4d8be, trim=0xf0e8d4, base=0xcfc5ae, cols=5,
             win=dict(w=1.15, h=1.9, kind='hung', d=0.2, frame=0x5a5040, lintel=True, pair=True, sill=0.9, arch='top'),
             bays=dict(cols=[0, 2, 4], w=3.4, d=0.9, kind='round', c=0xe4d8be), belts=[1, 8],
             cornice=dict(h=0.6, d=0.35, dentil=0.4, c=0xf0e8d4, y=5.0 + 28.8 + 0.2),
             ground=dict(kind='window', pier=0.8, sign_h=0.6),
             shops=[dict(kind='garage', gc=0x6a5a48), dict(kind='window'), dict(kind='entry', doorc=0x3a2c22), dict(kind='window'), dict(kind='garage', gc=0x6a5a48)],
             tank=(14.0, -21.0), rear_stairs=False, party_mat='stucco', party_c=0xd4c9b0, rear_mat='stucco', rear_c=0xcfc4ac)
    def deco(c):
        from kit_victorian import tile_patch
        F = c['F']; ts, tr = tile_patch(k)
        F.awning(-0.1, c['top'] - 1.0, c['W'] + 0.2, 0.9, 0.7, 0.1, uvrect=tr, sh=ts, lod=True, shadow=True)
        # entrance canopy with a scalloped valance
        cw = c['W'] / 5
        s, ax, ay = misc_slot(k, 2.0, 0.6)
        s.rect(ax, ay, 2.0, 0.6, C(0x3f5a4a)); s.rect(ax, ay, 2.0, 0.1, C(0xe6dcc0))
        F.box(2 * cw - 0.2, 3.5, cw + 0.4, 0.5, 2.4, faces='flrtb', ao=0.4, lod=True, uvrect=(ax, ay, 2.0, 0.6), sh=s)
    block(k, o, deco)


@K.piece('sf_apartment_b', style='apartment midrise', stone=0xc9c4b8,
         desc='modern SoMa / Mission Bay 7-storey condo block: white and charcoal panels with ochre and rust accents, glass-railed balconies, retail base')
def apartment_b(k):
    st = Balcony(c=0xe2dfd6, mat='stucco', bay=4.0, ww=2.9, wh=2.2, sill=0.55, glass=0x43535e, frame=0x33383b, lites=3, blind=0.4,
                 panels=[0xc98a2e, 0xa5502e, 0x4a5258, 0x6f8a8c], panel_p=0.65, balc_at=[0, 2, 3, 5, 7], balc_sides='fb', balc_d=1.4, rail_glass=True, rail=0xb8cdd0, slabc=0xe8e6e0,
                 floorline=C(0xcfccc2), punch=0.18)
    lob = Lobby(pier=0x4a4e50, bay=4.0, pier_w=0.6, d=0.7, canopy=1.8, fascia=0x3e4244, shops=0.75, mat='metal')
    W, D = 32.0, 24.0
    y, rs, _ = simple_tower(k, W, D, 4.6, lob, st, 6, 3.1, 3, nv=2, mech_h=0, seed=3, clutter=False)
    k.bulkhead(6.0, y, -14.0, 3.0, 2.8, 4.0); k.bulkhead(24.0, y, -12.0, 3.0, 2.8, 4.0)
    k.roof_clutter(10.0, -D + 2, 22.0, -2.0, y, n=6, bulk=False, seed=5)
    # roof deck pergola
    iron = k.metal_sheet(0x5a5e60)
    for x in (12.0, 15.0, 18.0):
        k.bar([x, y, -4.0], [x, y + 2.5, -4.0], 0.12, iron, (0.1, 0.6, 0.3, 0.3)); k.bar([x, y, -8.0], [x, y + 2.5, -8.0], 0.12, iron, (0.1, 0.6, 0.3, 0.3))
        k.bar([x, y + 2.5, -3.6], [x, y + 2.5, -8.4], 0.14, iron, (0.1, 0.6, 0.3, 0.3))


@K.piece('sf_apartment_c', style='apartment midrise concrete', stone=0xcfcabd,
         desc='1960s 19-storey concrete apartment slab: continuous balconies between fin walls on both long sides, blank end walls with a window strip, pilotis lobby')
def apartment_c(k):
    st = Balcony(c=0xd6d1c4, mat='concrete', bay=3.8, ww=3.0, wh=2.25, sill=0.3, glass=0x41525c, frame=0x55595a, lites=3, blind=0.5, blindc=0xddd6c4,
                 balc_run=True, balc_sides='fb', balc_d=1.5, rail=0xc4cdc8, slabc=0xdedad0, fin_walls=2, pier_every=0)
    ends = Grid(c=0xd2cdc0, mat='concrete', bay=6.0, ww=1.6, wh=1.5, sill=1.0, glass=0x41525c, lites=1, blind=0.4, punch=0.18, floorline=C(0xc2bdb0))
    lob = Lobby(pier=0xbdb8ab, bay=7.6, pier_w=1.2, d=2.2, canopy=3.0, fascia=0xd6d1c4, shops=0.0)
    W, D = 34.2, 18.0
    y = tier(k, lob, 0, W, -D, 0, 0, 1, 4.2, nv=1)
    y1 = tier(k, st, 0, W, -D, 0, y, 18, 3.05, 6, 2, sides='fb')
    tier(k, ends, 0, W, -D, 0, y, 18, 3.05, 6, 1, sides='lr')
    rs = roof_sheet(k, W, D, 0.4, 3); tier_roof(k, rs, 0, W, -D, 0, y1)
    mech(k, 12.0, 22.0, -13.0, -5.0, y1, 3.0, 0xbdb8ab)
    k.bulkhead(3.0, y1, -11.0, 3.0, 2.8, 4.0); k.bulkhead(28.0, y1, -11.0, 3.0, 2.8, 4.0)


@K.piece('sf_apartment_d', style='apartment midrise brick', stone=0x9c5c46,
         desc='South Beach 9-storey brick-clad condos: big steel-look windows, metal balconies, dark metal penthouse floor, shops at the base')
def apartment_d(k):
    from kit_brick import balcony, lattice_patch
    o = dict(W=28.0, D=30.0, g=5.0, fh=3.05, nfl=8, par=1.1, mat='brick', c=0x9e5e48, trim=0x4a4e50, base=0x8a503c, corner=True, cols=6, side_cols=6,
             win=dict(w=2.7, h=2.05, kind='grid', nx=4, ny=3, d=0.24, frame=0x33383b, lintel=True, sill=0.7, trim=0x565a5c),
             top_band=dict(n=1, c=0x565c60, mat='metal'), cornice=dict(h=0.5, d=0.45, dentil=0, c=0x4a4e50, y=5.0 + 24.4 + 0.5),
             ground=dict(kind='shop', pier=0.8, sign_h=0.8, bmat='brick'),
             shops=[dict(sign=C(0x33383b), awning=(C(0x33383b),)), dict(sign=C(0x33383b), door=0), dict(kind='entry', doorc=0x33383b), dict(sign=C(0xd8cfb8)), dict(sign=C(0x33383b), door=1), dict(kind='rollup', gc=0x565a5c)],
             rear_stairs=False, party_c=0x94604c)
    def deco(c):
        lat = lattice_patch(k, C(0x3a3e40), C(0x55595c))
        for Fc, cols in ((c['F'], 6), (c['R'], 6)):
            cw = Fc.w / cols
            for ci in (1, 4):
                for f in range(1, 7):
                    balcony(Fc, ci * cw + 0.35, c['g'] + f * c['fh'] + 0.5, cw - 0.7, 1.2, lat, C(0x4a4e50))
    block(k, o, deco)


# ------------------------------------------------------------------ glass slabs (60-120 m)
@K.piece('sf_glassslab_a', style='glassslab glass', stone=0x6a5a4a,
         desc='1970s 19-storey dark bronze-glass slab: anodised mullion fins, recessed pilotis lobby, dark louvred penthouse')
def glassslab_a(k):
    st = Curtain(glass=0x6a5846, hi=0xb09a80, mull=0x3a322c, spandrel=0x4a3e34, sp=1.15, bay=3.0, sub=2, fin_every=1, fin_w=0.16, fin_d=0.4, finc=0x3a322c, blind=0.14, blindc=0xc8bca0)
    lob = Lobby(pier=0x5a504a, bay=6.0, pier_w=1.0, d=2.4, canopy=0, fascia=0x3a322c, glass=0x4a4038, shops=0.2, mat='terracotta')
    simple_tower(k, 45.0, 26.0, 6.6, lob, st, 18, 3.9, 6, mech_h=3.4, mech_in=5.0, mech_c=0x4a423c, seed=8, roof_c=0x7a766e)


@K.piece('sf_glassslab_b', style='glassslab concrete', stone=0xd8d0c0,
         desc='1980s 22-storey postmodern office: pale precast with green ribbon windows, corner piers, three-step ziggurat top with a small pyramid cap')
def glassslab_b(k):
    st = Grid(c=0xdcd4c4, mat='concrete', bay=3.3, ww=3.3, wh=1.9, sill=1.05, glass=0x4f7a72, frame=0x4a5a56, lites=2, blind=0.25, ribbon=True, punch=0.3,
              pier_every=4, pier_w=1.1, pier_d=0.35, floorline=C(0xc9c1b0))
    lob = Lobby(pier=0xc2b8a4, bay=6.6, pier_w=1.4, d=1.2, canopy=2.0, fascia=0xdcd4c4, shops=0.4, mat='terracotta', fascia_h=1.4)
    W, D = 39.6, 36.3
    y, rs, (x0, x1, z0, z1) = simple_tower(k, W, D, 7.4, lob, st, 17, 3.9, 6, mech_h=0, seed=9,
                                           tiers=[(st, 3, 3.3, None), (st, 2, 3.3, None)], clutter=False)
    # pyramid cap (standing-seam, verdigris)
    ps = k.sheet(12.0, 6.0, 0.6, 'cap'); ps.vboards(0, 0, 12, 6, C(0x7fa094), 0.5, 0.2); ps.noise(0, 0, 12, 6, 0.12, 1.5, 1.5, 2); ps.rect(0, 0, 12, 0.3, C(0x5f7c72))
    cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; hw = (x1 - x0) / 2 - 2.0; hd = (z1 - z0) / 2 - 2.0
    mech(k, cx - hw, cx + hw, cz - hd, cz + hd, y, 1.6, 0xc9c1b0)
    yb = y + 1.6
    for (a, b, nrm) in (((cx - hw, cz + hd), (cx + hw, cz + hd), (0, 0.6, 1)), ((cx + hw, cz + hd), (cx + hw, cz - hd), (1, 0.6, 0)), ((cx + hw, cz - hd), (cx - hw, cz - hd), (0, 0.6, -1)), ((cx - hw, cz - hd), (cx - hw, cz + hd), (-1, 0.6, 0))):
        k.emit([np.array([a[0], yb, a[1]]), np.array([b[0], yb, b[1]]), np.array([cx, yb + 6.5, cz])], ps, [(0, 0), (12, 0), (6, 6)], np.array(nrm, dtype=float), 3)


@K.piece('sf_glassslab_c', style='glassslab glass', stone=0x7fa6a4,
         desc='2000s 26-storey blue-green curtain-wall office: chamfered corners, silver fins, glazed lobby, open metal crown screen with a canted roof blade')
def glassslab_c(k):
    st = Curtain(glass=0x5f9c98, hi=0xc6e0dc, mull=0xaab4b6, spandrel=0x4f8884, sp=0.85, bay=3.2, sub=2, fin_every=2, fin_w=0.18, fin_d=0.45, finc=0xc0c8ca, blind=0.12)
    lob = Lobby(pier=0xb0b6b6, bay=6.4, pier_w=0.9, d=0.8, canopy=2.6, fascia=0xc0c8ca, glass=0x4a7a78, shops=0.3, mat='metal')
    W = D = 38.4
    y, rs, _ = simple_tower(k, W, D, 7.5, lob, st, 25, 4.0, 5, corner=('chamfer', 3.2, 1), mech_h=3.6, mech_in=8.0, mech_c=0xa8b0b2, seed=11)
    # crown: open screen of fins standing above the roof on the four faces + canted blade
    cs = k.sheet(2.0, 6.0, 0.5, 'crown'); cs.grad(0, 0, 2, 6, C(0xa8b2b4), C(0xd0d8da)); cs.hlines(0, 0, 2, 6, C(0x8a9496), 1.0, 0.08)
    n = 12
    for i in range(n + 1):
        t = 3.2 + (W - 6.4) * i / n
        for (xa, za, dx, dz) in ((t, 0.0, 0.18, -0.9), (t, -D, 0.18, 0.9), (0.0, -t, 0.9, 0.18), (W, -t, -0.9, 0.18)):
            k.box(min(xa, xa + dx), y, min(za, za + dz), max(xa, xa + dx), y + 5.2, max(za, za + dz), cs, (0.1, 0, 0.5, 6.0), (0.1, 5.6, 0.5, 0.3), lod=(1 if i % 4 == 0 else 0))
    for (yy) in (y + 2.6, y + 5.0):
        k.box(3.2, yy, -0.25, W - 3.2, yy + 0.25, 0.0, cs, (0.8, 0, 0.6, 1.0), (0.8, 5.6, 0.6, 0.3), bottom=True, lod=1); k.box(3.2, yy, -D, W - 3.2, yy + 0.25, -D + 0.25, cs, (0.8, 0, 0.6, 1.0), (0.8, 5.6, 0.6, 0.3), bottom=True, lod=1)
        k.box(0.0, yy, -D + 3.2, 0.25, yy + 0.25, -3.2, cs, (0.8, 0, 0.6, 1.0), (0.8, 5.6, 0.6, 0.3), bottom=True, lod=1); k.box(W - 0.25, yy, -D + 3.2, W, yy + 0.25, -3.2, cs, (0.8, 0, 0.6, 1.0), (0.8, 5.6, 0.6, 0.3), bottom=True, lod=1)
    k.emit([np.array([9.0, y + 3.6, -8.0]), np.array([W - 9.0, y + 3.6, -8.0]), np.array([W - 9.0, y + 7.5, -D + 8.0]), np.array([9.0, y + 7.5, -D + 8.0])], cs, [(0.1, 0.2), (1.9, 0.2), (1.9, 5.8), (0.1, 5.8)], UP, 3)
    k.emit([np.array([9.0, y + 3.5, -8.0]), np.array([W - 9.0, y + 3.5, -8.0]), np.array([W - 9.0, y + 7.4, -D + 8.0]), np.array([9.0, y + 7.4, -D + 8.0])], cs, [(0.1, 0.2), (1.9, 0.2), (1.9, 1.0), (0.1, 1.0)], -UP, 1)


@K.piece('sf_glassslab_d', style='glassslab concrete', stone=0xe2dccd, share=2,
         desc="1980s 15-storey white precast 'bay-window' office tower: stacked slanted glass bays on every column (the downtown bay-window code), notched corners, stepped mechanical top")
def glassslab_d(k):
    st = BayTower(c=0xe4decf, bay=3.75, bayw=2.7, bayd=0.75, glass=0x5f8490)
    lob = Lobby(pier=0xd2ccbc, bay=7.5, pier_w=1.3, d=1.0, canopy=2.2, fascia=0xe4decf, shops=0.5, fascia_h=1.2)
    W = D = 30.0
    y, rs, _ = simple_tower(k, W, D, 6.4, lob, st, 14, 3.8, 7, nv=1, mech_h=0, seed=12, clutter=False)
    cap = Grid(c=0xe0dacb, mat='concrete', bay=3.75, ww=2.6, wh=1.6, sill=0.9, glass=0x5f8490, lites=2, punch=0.0, pier_every=1, pier_w=0.6, pier_d=0.0)
    y2 = tier(k, cap, 4.0, W - 4.0, -D + 4.0, -4.0, y, 1, 3.6, nv=1)
    tier_roof(k, rs, 4.0, W - 4.0, -D + 4.0, -4.0, y2, None, 0, 0)
    mech(k, 9.0, W - 9.0, -D + 9.0, -9.0, y2, 2.4, 0xc9c3b4)


# ------------------------------------------------------------------ glass towers (120-240 m)
@K.piece('sf_glasstower_a', style='glasstower glass apartment', stone=0xa9c0c8,
         desc='slim 46-storey modern residential glass tower: pale blue window wall with white slab edges, stacked balcony notches, glass crown screen')
def glasstower_a(k):
    st = Curtain(glass=0x7ea4b4, hi=0xd4e4e8, mull=0xc4cccc, spandrel=0x9ab6c0, sp=0.7, bay=3.5, sub=3, slab=C(0xe4e6e2), slab_h=0.28, blind=0.3, blindc=0xe6e4da,
                 notch=dict(at=[1, 6], bays=1, d=1.5), mw=0.07)
    lob = Lobby(pier=0xcfd2d0, bay=7.0, pier_w=0.9, d=0.9, canopy=2.2, fascia=0xe4e6e2, glass=0x5f8894, shops=0.4, mat='metal')
    W = D = 28.0
    y, rs, _ = simple_tower(k, W, D, 7.2, lob, st, 45, 3.15, 5, corner=None, mech_h=0, seed=13, clutter=False)
    top = Curtain(glass=0x8fb4c2, hi=0xdcecf0, mull=0xd0d6d6, spandrel=0xa4c0c8, sp=0.5, bay=3.5, sub=3, blind=0.0, mw=0.07)
    y2 = tier(k, top, 0, W, -D, 0, y, 1, 4.2, nv=1, sides='fl')
    y2 = tier(k, top, 4.0, W, -D, -4.0, y, 1, 6.0, nv=1)
    tier_roof(k, rs, 4.0, W, -D, -4.0, y2, None, 0, 0)
    mech(k, 9.0, W - 5.0, -D + 5.0, -9.0, y2, 1.8, 0xb4bcbc)


@K.piece('sf_glasstower_b', style='glasstower glass', stone=0x9cb8c2,
         desc='31-storey clear-glass office tower with rounded corners: fine silver mullions, floor-line shadow joints, tall glass lobby, recessed crown')
def glasstower_b(k):
    st = Curtain(glass=0x7fa6b2, hi=0xd2e4ea, mull=0xb4c0c4, spandrel=0x6f98a6, sp=0.9, bay=3.0, sub=2, blind=0.14, bands=0.0, fin_every=0)
    lob = Lobby(pier=0xc0c6c8, bay=6.0, pier_w=0.8, d=0.9, canopy=2.6, fascia=0xb4c0c4, glass=0x5f8490, shops=0.25, mat='metal')
    W = D = 40.0
    cor = ('round', 6.0, 3)
    y, rs, _ = simple_tower(k, W, D, 8.4, lob, st, 30, 4.0, 5, corner=cor, mech_h=0, seed=14, clutter=False)
    top = Curtain(glass=0x6f96a2, hi=0xc8dce2, mull=0xb4c0c4, spandrel=0x8fa8b0, sp=2.2, bay=3.0, sub=2, blind=0.0)
    y2 = tier(k, top, 2.0, W - 2.0, -D + 2.0, -2.0, y, 1, 4.4, nv=1, corner=('round', 5.0, 3))
    tier_roof(k, rs, 2.0, W - 2.0, -D + 2.0, -2.0, y2, ('round', 5.0, 3), 0, 0)
    mech(k, 12.0, W - 12.0, -D + 12.0, -12.0, y2, 2.2, 0xa8b2b4)


@K.piece('sf_glasstower_c', style='glasstower glassslab', stone=0x6e5a56,
         desc='1980s 52-storey dark granite-and-glass tower: carnelian piers and spandrels, grey glass, two setbacks and a hipped copper-green crown')
def glasstower_c(k):
    st = Grid(c=0x775f58, mat='terracotta', bay=3.4, ww=2.5, wh=2.0, sill=1.1, glass=0x4c5c68, frame=0x3c3432, lites=2, blind=0.2,
              pier_every=2, pier_w=0.9, pier_d=0.4, pier=0x826860)
    lob = Lobby(pier=0x6a544e, bay=6.8, pier_w=1.4, d=1.2, canopy=2.4, fascia=0x775f58, glass=0x3c4a54, shops=0.25, mat='terracotta', fascia_h=1.5)
    W = D = 44.2
    y, rs, (x0, x1, z0, z1) = simple_tower(k, W, D, 9.2, lob, st, 40, 3.9, 5, mech_h=0, seed=15, clutter=False,
                                           tiers=[(st, 6, 3.4, None), (st, 4, 3.4, None)])
    ps = k.sheet(14.0, 9.0, 0.5, 'cap'); ps.vboards(0, 0, 14, 9, C(0x6f9488), 0.6, 0.2); ps.noise(0, 0, 14, 9, 0.12, 2.0, 2.0, 2); ps.rect(0, 0, 14, 0.4, C(0x557268))
    cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; hw = (x1 - x0) / 2 - 0.4; rt = 5.0; hgt = 8.0
    for (a, b, nrm, a2, b2) in (((x0 + 0.4, z1 - 0.4), (x1 - 0.4, z1 - 0.4), (0, 0.6, 1), (cx - rt, cz + rt), (cx + rt, cz + rt)),
                                ((x1 - 0.4, z1 - 0.4), (x1 - 0.4, z0 + 0.4), (1, 0.6, 0), (cx + rt, cz + rt), (cx + rt, cz - rt)),
                                ((x1 - 0.4, z0 + 0.4), (x0 + 0.4, z0 + 0.4), (0, 0.6, -1), (cx + rt, cz - rt), (cx - rt, cz - rt)),
                                ((x0 + 0.4, z0 + 0.4), (x0 + 0.4, z1 - 0.4), (-1, 0.6, 0), (cx - rt, cz - rt), (cx - rt, cz + rt))):
        k.emit([np.array([a[0], y, a[1]]), np.array([b[0], y, b[1]]), np.array([b2[0], y + hgt, b2[1]]), np.array([a2[0], y + hgt, a2[1]])], ps, [(0, 0), (14, 0), (10.5, 9), (3.5, 9)], np.array(nrm, dtype=float), 3)
    k.emit([np.array([cx - rt, y + hgt, cz + rt]), np.array([cx + rt, y + hgt, cz + rt]), np.array([cx + rt, y + hgt, cz - rt]), np.array([cx - rt, y + hgt, cz - rt])], ps, [(1, 0.05), (2, 0.05), (2, 0.3), (1, 0.3)], UP, 3)
    mech(k, cx - 3.0, cx + 3.0, cz - 3.0, cz + 3.0, y + hgt, 2.4, 0x557268)


@K.piece('sf_glasstower_d', style='glasstower glass', stone=0x7a9cc0,
         desc='58-storey faceted blue glass tower: octagonal plan from big chamfers, a second tighter-chamfered upper stage and a sloped glass crown')
def glasstower_d(k):
    st = Curtain(glass=0x5f8cb8, hi=0xc4daee, mull=0x8ea4b8, spandrel=0x507aa6, sp=0.9, bay=3.2, sub=2, blind=0.1, fin_every=0)
    lob = Lobby(pier=0xaab4bc, bay=6.4, pier_w=0.9, d=1.0, canopy=2.8, fascia=0x8ea4b8, glass=0x4a709a, shops=0.2, mat='metal')
    W = D = 43.2
    c1 = ('chamfer', 9.0, 1); c2 = ('chamfer', 11.0, 1)
    y = tier(k, lob, 0, W, -D, 0, 0, 1, 9.0, nv=1, corner=c1)
    y = tier(k, st, 0, W, -D, 0, y, 42, 4.0, 6, 2, corner=c1)
    rs = roof_sheet(k, W, D, 0.35, 16); tier_roof(k, rs, 0, W, -D, 0, y, c1, 0, 0)
    i = 2.4
    y = tier(k, st, i, W - i, -D + i, -i, y, 12, 4.0, 6, 1, corner=c2)
    tier_roof(k, rs, i, W - i, -D + i, -i, y, c2, 0, 0)
    # sloped crown: a wedge of glass rising to the north-east
    cs = k.sheet(20.0, 10.0, 0.6, 'crown')
    Curtain(glass=0x6f9cc6, hi=0xd0e2f2, mull=0x8ea4b8, spandrel=0x5f8cb8, sp=0.6, bay=2.5, sub=1, blind=0.0).skin(cs, 20.0, 10.0, 0, 2.5, '')
    j = i + 6.0; a0, a1, b0, b1 = j, W - j, -D + j, -j; h0, h1 = 3.0, 10.5
    P = lambda x, yy, z: np.array([x, yy, z], dtype=float)
    k.emit([P(a0, y, b1), P(a1, y, b1), P(a1, y + h0, b1), P(a0, y + h0, b1)], cs, [(0, 0), (20, 0), (20, 3), (0, 3)], np.array([0, 0, 1.0]), 3)
    k.emit([P(a1, y, b0), P(a0, y, b0), P(a0, y + h1, b0), P(a1, y + h1, b0)], cs, [(0, 0), (20, 0), (20, 10), (0, 10)], np.array([0, 0, -1.0]), 3)
    k.emit([P(a1, y, b1), P(a1, y, b0), P(a1, y + h1, b0), P(a1, y + h0, b1)], cs, [(0, 0), (20, 0), (20, 10), (0, 3)], np.array([1.0, 0, 0]), 3)
    k.emit([P(a0, y, b0), P(a0, y, b1), P(a0, y + h0, b1), P(a0, y + h1, b0)], cs, [(0, 0), (20, 0), (20, 3), (0, 10)], np.array([-1.0, 0, 0]), 3)
    k.emit([P(a0, y + h0, b1), P(a1, y + h0, b1), P(a1, y + h1, b0), P(a0, y + h1, b0)], cs, [(0, 0), (20, 0), (20, 10), (0, 10)], UP, 3)
