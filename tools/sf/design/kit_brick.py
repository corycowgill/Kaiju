# SF kit: brick blocks - Chinatown, Jackson Square, Tenderloin, Union Square (buckets low / short). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_parts import *
from kit_block import *

CH_GREEN = C(0x2f7052); CH_RED = C(0xb5302a); CH_GOLD = C(0xd9ae48)


def tile_patch2(k, c, w=3.0, h=1.1, pitch=0.16):
    s, ax, ay = misc_slot(k, w, h + 0.1)
    s.tiles(ax, ay, w, h, c, pitch, 0.3, 0.3)
    s.rect(ax, ay, w, 0.12, mul(c, 0.75)); s.rect(ax, ay + h - 0.1, w, 0.1, mul(c, 0.8))
    s.noise(ax, ay, w, h, 0.1, 0.5, 0.5, 4)
    return s, (ax, ay, w, h)


def lattice_patch(k, c1, c2, w=3.0, h=1.0):
    """Painted balcony railing: posts, a fret band, top rail (alpha-free: dark backing)."""
    s, ax, ay = misc_slot(k, w, h + 0.1)
    s.rect(ax, ay, w, h, mul(c1, 0.45))
    s.vlines(ax, ay, w, h, c1, 0.14, 0.05)
    s.rect(ax, ay + h * 0.55, w, h * 0.3, mul(c1, 0.5)); s.vlines(ax, ay + h * 0.55, w, h * 0.3, c2, 0.3, 0.06); s.hlines(ax, ay + h * 0.55, w, h * 0.3, c2, h * 0.145, 0.04)
    s.rect(ax, ay + h - 0.1, w, 0.1, c2); s.rect(ax, ay, w, 0.1, c2)
    s.vlines(ax, ay, w, h, c2, 1.0, 0.1)
    return s, (ax, ay, w, h)


def balcony(Fc, x, y, w, d, patch, slab_c, rail=0.95):
    k = Fc.k; s, r = patch
    Fc.s.rect(Fc.su + x, y - 0.16, w, 0.16, slab_c)
    Fc.box(x, y - 0.16, w, 0.16, d, faces='flrtb', ao=0.35, lod=True)
    # railing: thin boxes on three sides
    k.boxpts(Fc.P(x, y, d - 0.06), Fc.r * w, UP * rail, Fc.n * 0.06, s, r, (r[0], r[1] + r[3] - 0.08, r[2], 0.06), lod=0, bottom=False)
    k.boxpts(Fc.P(x, y, 0), Fc.r * 0.06, UP * rail, Fc.n * d, s, (r[0], r[1], 0.9, r[3]), (r[0], r[1] + r[3] - 0.08, 0.5, 0.06), side2=(r[0], r[1], 0.9, r[3]))
    k.boxpts(Fc.P(x + w - 0.06, y, 0), Fc.r * 0.06, UP * rail, Fc.n * d, s, (r[0], r[1], 0.9, r[3]), (r[0], r[1] + r[3] - 0.08, 0.5, 0.06), side2=(r[0], r[1], 0.9, r[3]))


def pagoda_eave(Fc, x, y, w, patch, d=1.3, h=0.95, horns=True, lod=True):
    """A tiled pent eave with upturned corner horns."""
    k = Fc.k; s, r = patch
    Fc.awning(x, y, w, h, d, 0.12, uvrect=r, sh=s, lod=lod)
    if horns:
        for xx, sg in ((x, -1), (x + w, 1)):
            a = Fc.P(xx, y + 0.12, d); b = Fc.P(xx + sg * 0.22, y + 0.7, d + 0.18)
            k.bar(a, b, 0.14, s, (r[0] + 0.1, r[1] + 0.02, 0.3, 0.08))


def lantern_string(Fc, x, y, w, n, d=0.7, c=CH_RED):
    k = Fc.k
    s, ax, ay = misc_slot(k, 0.6, 0.6)
    s.rect(ax, ay, 0.6, 0.6, c); s.rect(ax, ay, 0.6, 0.08, CH_GOLD); s.rect(ax, ay + 0.52, 0.6, 0.08, CH_GOLD); s.vlines(ax, ay + 0.08, 0.6, 0.44, mul(c, 0.8), 0.12, 0.02)
    ms = k.metal_sheet()
    k.bar(Fc.P(x, y + 0.2, 0), Fc.P(x, y, d), 0.04, ms, (0.1, 0.1, 0.3, 0.3)); k.bar(Fc.P(x + w, y + 0.2, 0), Fc.P(x + w, y, d), 0.04, ms, (0.1, 0.1, 0.3, 0.3))
    k.bar(Fc.P(x, y, d), Fc.P(x + w, y, d), 0.03, ms, (0.1, 0.1, 0.3, 0.3))
    for i in range(n):
        px = x + (i + 0.5) * w / n
        p = Fc.P(px, y - 0.55, d)
        k.cyl(p[0], p[2], 0.2, y - 0.55, y - 0.1, 5, s, (ax, ay, 0.6, 0.6), cap=(ax + 0.1, ay + 0.52, 0.2, 0.06), capb=True)


@K.piece('sf_brick_a', style='brick lowrise chinatown', stone=0x8e4a38,
         desc='Chinatown 4-storey brick: painted green-and-red iron balconies, shop awnings, green pagoda-tiled eave on the parapet')
def brick_a(k):
    o = dict(W=12.6, D=21.0, g=4.2, fh=3.3, nfl=3, par=1.3, mat='brick', c=0x93503c, trim=0xd9ae48, base=0xa8302a, cols=3,
             win=dict(w=1.15, h=2.0, kind='hung', cased=True, d=0.2, frame=0x2f7052, lintel=True, trim=0xe6dcc0, pair=False),
             cornice=dict(h=0.0), ground=dict(kind='shop', pier=0.5, sign_h=0.9, rustic=False),
             shops=[dict(awning=(CH_RED,), sign=CH_GOLD), dict(awning=(CH_RED,), sign=CH_GOLD, door=0), dict(kind='entry', doorc=0x2f7052)])
    def deco(c):
        F = c['F']; W = c['W']; g = c['g']; fh = c['fh']
        lat = lattice_patch(k, CH_GREEN, CH_RED)
        for f in (1, 2):
            balcony(F, 0.35, g + f * fh + 0.2, W - 0.7, 1.05, lat, mul(CH_GREEN, 0.8))
        tp = tile_patch2(k, C(0x3f7d5c))
        pagoda_eave(F, -0.25, c['eave'] + 0.25, W + 0.5, tp, 1.35, 1.0)
        F.s.rect(0, c['eave'] - 0.1, W, 0.4, CH_RED); F.s.rect(0, c['eave'] + 0.25, W, c['top'] - c['eave'] - 0.25, mul(C(0x93503c), 0.9))
        F.s.rect(0, c['top'] - 0.14, W, 0.14, CH_GOLD)
        # painted vertical sign board (abstract) on the pier between two bays
        s, ax, ay = misc_slot(k, 0.8, 1.2)
        s.rect(ax, ay, 0.8, 1.2, CH_RED); s.rect(ax + 0.06, ay + 0.06, 0.68, 1.08, mul(CH_RED, 0.8))
        for j in range(4): s.rect(ax + 0.22, ay + 0.14 + j * 0.26, 0.36, 0.18, CH_GOLD)
        k.boxpts(F.P(W / 3 - 0.08, g + 0.6, 0.15), F.r * 0.16, UP * 4.6, F.n * 0.95, s, (ax, ay, 0.05, 1.2), (ax, ay, 0.05, 0.05), side2=(ax, ay, 0.8, 1.2), bottom=True, lod=1)
    block(k, o, deco)


@K.piece('sf_brick_b', style='brick lowrise chinatown', stone=0xb06a50,
         desc='Chinatown / Grant Avenue corner block: upturned green-tile eaves on both streets, red lantern strings, balconies and a corner pagoda pavilion')
def brick_b(k):
    red = (CH_RED, CH_GOLD)
    o = dict(W=16.0, D=20.0, g=4.4, fh=3.3, nfl=3, par=1.2, mat='brick', c=0xb26e52, trim=0xe2d4b0, base=0x2f6a50, corner=True, cols=4, side_cols=5,
             win=dict(w=1.2, h=2.0, kind='hung', cased=True, d=0.2, frame=0xa82e28, lintel=True, trim=0xe2d4b0, pair=False),
             cornice=dict(h=0.0), ground=dict(kind='shop', pier=0.5, sign_h=0.85, rustic=False),
             shops=[dict(sign=CH_RED, awning=red), dict(sign=CH_GOLD, door=1), dict(sign=CH_RED, awning=red), dict(sign=CH_GOLD, door=0)],
             side_shops=[dict(sign=CH_RED, awning=red), dict(sign=CH_GOLD), dict(kind='entry', doorc=0xa82e28), dict(sign=CH_RED, door=0), dict(kind='window')])
    def deco(c):
        F, R = c['F'], c['R']; W = c['W']; D = c['D']; g = c['g']; fh = c['fh']; eave = c['eave']; top = c['top']
        tp = tile_patch2(k, C(0x3f7d5c)); tr = tile_patch2(k, C(0xb4472e))
        lat = lattice_patch(k, CH_RED, CH_GOLD)
        for Fc, w in ((F, W), (R, D)):
            pagoda_eave(Fc, -0.3 if Fc is F else 0.0, eave + 0.1, w + (1.6 if Fc is F else 0.3), tp, 1.3, 1.0, horns=(Fc is F))
            Fc.s.rect(0, eave - 0.15, w, 0.35, CH_RED); Fc.s.rect(0, top - 0.14, w, 0.14, CH_GOLD)
            # top-floor balcony run
            balcony(Fc, 0.4, g + 2 * fh + 0.2, w - 0.8, 0.9, lat, mul(CH_RED, 0.75))
            lantern_string(Fc, 0.6, g + fh - 0.3, w - 1.2, int(w / 1.7), 0.75)
        # corner pavilion: a little two-tier pagoda on the roof corner
        ps = k.sheet(3.2, 3.2, 0.7, 'pav')
        ps.rect(0, 0, 3.2, 3.2, CH_RED); ps.rect(0, 0, 3.2, 0.3, mul(CH_RED, 0.7)); ps.rect(0, 2.9, 3.2, 0.3, CH_GOLD)
        ps.window(0.45, 0.7, 0.9, 1.7, frame=CH_GOLD, kind='grid', nx=2, ny=3, blind=0); ps.window(1.85, 0.7, 0.9, 1.7, frame=CH_GOLD, kind='grid', nx=2, ny=3, blind=0)
        ps.rect(0, 0, 0.2, 3.2, CH_GREEN); ps.rect(3.0, 0, 0.2, 3.2, CH_GREEN)
        px0, pz0 = W - 4.0, -4.0; y = top
        k.box(px0, y, pz0, px0 + 3.6, y + 2.2, pz0 + 3.6, ps, (0, 0.5, 3.2, 2.2), (0.3, 0.05, 1, 0.2), lod=1)
        ts, r = tp
        for (yy, ext, rise) in ((y + 2.2, 0.9, 1.5),):
            cx, cz = px0 + 1.8, pz0 + 1.8; a = 1.8 + ext; b = 1.8 if rise == 0 else 0.0
            for i in range(4):
                ang = i * math.pi / 2; ca, sa = math.cos(ang), math.sin(ang)
                def rot(u, v): return np.array([cx + u * ca - v * sa, 0, cz + u * sa + v * ca])
                p0 = rot(-a, a) + UP * (yy - 0.35); p1 = rot(a, a) + UP * (yy - 0.35)
                p2 = rot(b, b) + UP * (yy + (rise if rise else 0.35)); p3 = rot(-b, b) + UP * (yy + (rise if rise else 0.35))
                if rise:
                    k.emit([p0, p1, p2], ts, [(r[0], r[1]), (r[0] + r[2], r[1]), (r[0] + r[2] / 2, r[1] + r[3])], np.array([-sa, 0.8, ca]), 3)
                else:
                    k.emit([p0, p1, p2, p3], ts, [(r[0], r[1]), (r[0] + r[2], r[1]), (r[0] + r[2] * 0.75, r[1] + r[3]), (r[0] + r[2] * 0.25, r[1] + r[3])], np.array([-sa, 0.8, ca]), 3)
                k.emit([p0, p1, rot(b, b) + UP * (yy - 0.35), rot(-b, b) + UP * (yy - 0.35)], ts, [(r[0], r[1]), (r[0] + r[2], r[1]), (r[0] + r[2], r[1] + 0.1), (r[0], r[1] + 0.1)], -UP, 1)
                # upturned corner
                k.bar(rot(a, a) + UP * (yy - 0.3), rot(a + 0.15, a + 0.15) + UP * (yy + 0.3), 0.14, ts, (r[0] + 0.1, r[1] + 0.02, 0.3, 0.08))
        k.bar([px0 + 1.8, y + 3.6, pz0 + 1.8], [px0 + 1.8, y + 4.3, pz0 + 1.8], 0.1, ts, (r[0] + 0.1, r[1] + 0.02, 0.3, 0.08))
    block(k, o, deco)


@K.piece('sf_brick_c', style='brick lowrise warehouse', stone=0x9a5a44,
         desc='Jackson Square 1850s 2-storey brick commercial: arched openings with iron shutters, cast-iron pilasters, corbelled brick cornice')
def brick_c(k):
    sh = C(0x2c4438)
    o = dict(W=19.0, D=23.0, g=4.8, fh=3.9, nfl=1, par=1.1, mat='brick', c=0x9c5842, trim=0xe2d8c4, base=0x9c5842, cols=5,
             win=dict(w=1.25, h=2.5, kind='hung', d=0.3, frame=0x2c4438, arch=True, sill=0.7, lintel=False),
             cornice=dict(h=0.9, d=0.35, c=0x8a4c3a, dentil=0.45), pilasters=0.45,
             ground=dict(kind='arch', pier=1.2, bmat='brick'),
             shops=[dict(shutters=sh, frame=0x2c4438), dict(shutters=sh, frame=0x2c4438), dict(shutters=sh, frame=0x5a2c24), dict(shutters=sh, frame=0x2c4438), dict(shutters=sh, frame=0x2c4438)],
             bulk=False, party_c=0x94705c)
    def deco(c):
        F = c['F']; s = F.s; cw = c['W'] / 5; g = c['g']
        for ci in range(5):
            # iron shutters folded back beside the upper windows, painted lintel arches
            x = ci * cw + (cw - 1.25) / 2; y = g + 0.7
            for sx in (x - 0.52, x + 1.27):
                s.rect(sx, y, 0.5, 1.85, sh); s.hlines(sx, y, 0.5, 1.85, mul(sh, 0.7), 0.62, 0.04); s.rect(sx + 0.05, y + 0.05, 0.4, 0.04, mul(sh, 1.3))
                F.box(sx, y, 0.5, 1.85, 0.06, faces='flrtb')
            s.rect(ci * cw + 0.3, g - 0.75, cw - 0.6, 0.5, C(0x3a3a36)); s.signband(ci * cw + 0.6, g - 0.68, cw - 1.2, 0.36, C(0x3a3a36))
        # gas-lamp brackets
        ms = k.metal_sheet()
        for ci in (1, 4):
            k.bar(F.P(ci * cw, 3.4, 0), F.P(ci * cw, 3.4, 0.7), 0.05, ms, (0.1, 0.1, 0.3, 0.3))
            k.boxpts(F.P(ci * cw - 0.15, 2.85, 0.55), F.r * 0.3, UP * 0.5, F.n * 0.3, ms, (0.55, 0.55, 0.4, 0.4), bottom=True)
    block(k, o, deco)


@K.piece('sf_brick_d', style='brick apartment midrise', stone=0x7e4636,
         desc='Tenderloin 7-storey brick apartment-hotel: bay-window stacks, iron fire escape, entrance marquee, blank blade-sign, bracketed cornice, roof water tank')
def brick_d(k):
    o = dict(W=18.5, D=30.0, g=4.8, fh=3.1, nfl=6, par=1.5, mat='brick', c=0x804838, trim=0xdcd0b8, base=0xcfc4ac, cols=5,
             win=dict(w=1.15, h=1.85, kind='hung', d=0.2, frame=0xd8d2c2, lintel=True, pair=True, sill=0.85),
             bays=dict(cols=[1, 3], w=3.2, d=0.8, c=0xd4c8ae, mat='stucco'), fes=[2],
             cornice=dict(h=1.5, d=0.75, dentil=0.35, brackets=3, c=0xd8ccb2), belts=[5],
             ground=dict(kind='shop', pier=0.6, sign_h=0.9),
             shops=[dict(sign=C(0x34506a), awning=(C(0x34506a),)), dict(sign=C(0x7a2a28), door=0), dict(kind='entry', doorc=0x3a2a20), dict(sign=C(0x3a5a3a), door=1), dict(sign=C(0xc8b070), awning=(C(0x8a3a2a), C(0xe8dcc0)))],
             tank=(12.5, -20.0), rear_stairs=False, party_c=0x8a6a58)
    def deco(c):
        F = c['F']; s = F.s; W = c['W']; g = c['g']; cw = W / 5
        # entrance marquee
        mx = 2 * cw - 0.3; mw = cw + 0.6
        ms_, ax, ay = misc_slot(k, 2.0, 0.6)
        ms_.rect(ax, ay, 2.0, 0.6, C(0x4a3028)); ms_.rect(ax, ay, 2.0, 0.08, CH_GOLD); ms_.rect(ax, ay + 0.52, 2.0, 0.08, CH_GOLD)
        for j in range(9): ms_.ellipse(ax + 0.2 + j * 0.2, ay + 0.3, 0.05, 0.05, C(0xe8dcb0))
        F.box(mx, g - 0.95, mw, 0.55, 1.9, faces='flrtb', ao=0.4, lod=True, uvrect=(ax, ay, 2.0, 0.6), sh=ms_)
        iron = k.metal_sheet()
        for xx in (mx + 0.3, mx + mw - 0.3):
            k.bar(F.P(xx, g - 0.4, 1.8), F.P(xx, g + 1.4, 0), 0.04, iron, (0.1, 0.1, 0.3, 0.3))
        # blade sign (blank: stripes only) on brackets at the corner
        bs_, bx, by = misc_slot(k, 1.2, 1.2)
        bs_.rect(bx, by, 1.2, 1.2, C(0x8a2a26)); bs_.rect(bx + 0.08, by + 0.05, 1.04, 1.1, C(0x6e2220))
        bs_.vlines(bx + 0.2, by + 0.1, 0.9, 1.0, C(0xe6d6a0), 0.35, 0.06); bs_.rect(bx, by, 1.2, 0.05, CH_GOLD); bs_.rect(bx, by + 1.15, 1.2, 0.05, CH_GOLD)
        y0 = g + 3.1 + 0.6; hh = 3.1 * 3.2
        k.boxpts(F.P(cw * 4 + cw - 0.45, y0, 0.25), F.r * 0.3, UP * hh, F.n * 1.3, bs_, (bx, by, 0.06, 1.2), (bx, by, 0.05, 0.05), side2=(bx, by, 1.2, 1.2), bottom=True, lod=1)
        for yy in (y0 + 0.4, y0 + hh - 0.4):
            k.bar(F.P(cw * 5 - 0.3, yy, 0), F.P(cw * 5 - 0.3, yy, 0.3), 0.06, iron, (0.1, 0.1, 0.3, 0.3))
    block(k, o, deco)


@K.piece('sf_brick_e', style='brick masonry midrise', stone=0xcbbfa6,
         desc='1910s 11-storey Union Square commercial block: cream terracotta base and attic, buff brick shaft, paired windows, heavy bracketed cornice')
def brick_e(k):
    o = dict(W=24.0, D=30.0, g=6.4, fh=3.7, nfl=10, par=2.4, mat='brick', c=0xb49672, trim=0xddd2ba, base=0xd6cab0, corner=True, cols=5, side_cols=6,
             win=dict(w=1.45, h=2.2, kind='hung', d=0.26, frame=0x4c5450, lintel=True, pair=True, sill=0.9, arch='top'),
             top_band=dict(n=2, c=0xd9ceb6), belts=[1],
             cornice=dict(h=2.3, d=1.3, dentil=0.5, brackets=4, c=0xdccfb4, y=6.4 + 37.0 - 0.3),
             ground=dict(kind='shop', pier=0.9, sign_h=1.0),
             shops=[dict(sign=C(0x2a3a4a), transom=1.6), dict(sign=C(0x2a3a4a), transom=1.6, door=1), dict(kind='entry', doorc=0x3c3026), dict(sign=C(0x5a2a2a), transom=1.6, awning=(C(0x5a2a2a),)), dict(sign=C(0x5a2a2a), transom=1.6, awning=(C(0x5a2a2a),))],
             side_shops=[dict(sign=C(0x5a2a2a), transom=1.6), dict(sign=C(0x3a4a3a), transom=1.6, door=0), dict(sign=C(0x3a4a3a), transom=1.6), dict(kind='window'), dict(kind='entry'), dict(kind='rollup')],
             tank=(17.0, -22.0), rear_stairs=False, party_c=0xa8947c, rear_c=0xa08e78)
    def deco(c):
        F, R = c['F'], c['R']
        # flagpole over the entrance
        iron = k.metal_sheet(0x5a5e60)
        p = F.P(c['W'] / 2, 6.4 + 3.7 * 1.2, 0)
        k.bar(p, p + F.n * 2.6 + UP * 3.4, 0.09, iron, (0.1, 0.6, 0.3, 0.3))
    block(k, o, deco)
