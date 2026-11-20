# SF kit: one- and two-storey commercial (lowrise) and the SoMa warehouses (bucket low). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_parts import *
from kit_block import *


@K.piece('sf_lowrise_a', style='lowrise', stone=0xd8ccb4,
         desc='1-storey neighbourhood retail strip: six shopfronts, mixed canvas awnings, sign bands, stepped stucco parapet')
def lowrise_a(k):
    A = lambda a, b=None: (C(a),) if b is None else (C(a), C(b))
    o = dict(W=30.0, D=18.0, g=4.7, fh=3.3, nfl=0, par=1.25, mat='stucco', c=0xdcd0b6, trim=0xe8dfca, base=0xcfc3aa, cols=6,
             cornice=dict(h=0.45, d=0.25, dentil=0, y=4.7 + 0.55), ground=dict(kind='shop', pier=0.5, sign_h=0.95, rustic=False),
             shops=[dict(awning=A(0x2f5d86), sign=C(0x2f5d86), door=0), dict(awning=A(0xb23a30, 0xf0e8d6), sign=C(0xe6d9b0), door=1), dict(sign=C(0x36363a), door=0, frame=0x8a2a26),
                    dict(awning=A(0x3d6b4a), sign=C(0xe9dfc8), door=1), dict(awning=A(0xd9a23c), sign=C(0x6a3a2a), door=0), dict(awning=A(0x5a3a6a, 0xe8e0d0), sign=C(0x5a3a6a), door=1)],
             bulk=False, party_mat='stucco', rear_stairs=False)
    def deco(c):
        F = c['F']; s = F.s; cw = c['W'] / 6
        tones = [0xdcd0b6, 0xcbb9a0, 0xe4dcc8, 0xc9cdbb, 0xe0c7a4, 0xd6d0c8]
        for i in range(6):
            s.rect(i * cw, 4.75, cw, c['top'] - 4.75, C(tones[i]), 0.85); s.rect(i * cw, 4.75, 0.05, c['top'] - 4.75, mul(C(tones[i]), 0.7))
        s.weather(0, 4.75, c['W'], c['top'] - 4.75, 0.8, 3, base=False)
    block(k, o, deco)


@K.piece('sf_lowrise_b', style='lowrise stucco', stone=0xd9c8a6,
         desc='2-storey stucco commercial: shops below, steel-sash offices above, red tile pent coping')
def lowrise_b(k):
    o = dict(W=20.0, D=22.0, g=4.5, fh=3.7, nfl=1, par=1.0, mat='stucco', c=0xdac9a6, trim=0xeee4cc, base=0x7a4a38, cols=4,
             win=dict(w=3.2, h=2.0, kind='grid', nx=5, ny=3, d=0.22, frame=0x3a4a48, lintel=False, sill=0.95),
             cornice=dict(h=0.0), ground=dict(kind='shop', pier=0.6, sign_h=0.9, bmat='brick'),
             shops=[dict(sign=C(0x2c4a5a), awning=(C(0x2c4a5a),)), dict(sign=C(0xe6dcc0), door=0), dict(kind='entry', doorc=0x3a4a48), dict(sign=C(0x8a3a2a), awning=(C(0x8a3a2a), C(0xeadfc8)), door=1)],
             party_mat='stucco', bulk=False)
    def deco(c):
        from kit_victorian import tile_patch
        F = c['F']; ts, tr = tile_patch(k)
        F.awning(-0.1, c['eave'] + 0.15, c['W'] + 0.2, 0.8, 0.7, 0.1, uvrect=tr, sh=ts, lod=True, shadow=True)
        s = F.s; cw = c['W'] / 4
        for i in range(4):   # plaster medallions between the windows
            s.ellipse(i * cw + 0.02 if i else 0.3, c['g'] + 1.9, 0.22, 0.22, mul(C(0xdac9a6), 0.8))
    block(k, o, deco)


@K.piece('sf_warehouse_a', style='warehouse brick', stone=0x8a4a3a, share=2,
         desc='SoMa 3-storey brick-and-timber warehouse: arched multi-pane windows, brick pilasters, loading doors, ghost sign, roof monitor and water tank')
def warehouse_a(k):
    o = dict(W=24.0, D=34.0, g=5.2, fh=4.4, nfl=2, par=1.1, mat='brick', c=0x8c4c3a, trim=0xb8a890, base=0x7e4434, cols=5,
             win=dict(w=1.9, h=2.9, kind='grid', d=0.3, frame=0x39403c, arch=True, sill=0.9, lintel=False),
             cornice=dict(h=0.9, d=0.3, c=0x7e4434, dentil=0.5), pilasters=0.6,
             ground=dict(kind='shop', pier=1.0, bmat='brick', sign_h=0.6),
             shops=[dict(kind='rollup'), dict(kind='arch', aw=2.6, frame=0x39403c), dict(kind='entry', doorc=0x39403c), dict(kind='arch', aw=2.6, frame=0x39403c), dict(kind='rollup', gc=0x5a6a64)],
             party_c=0x86543f, rear_stairs=False, bulk=False)
    def deco(c):
        F = c['F']; s = F.s; W = c['W']; D = c['D']
        for x in np.arange(1.0, W - 1.0, 4.8):   # tie-rod star plates
            for y in (c['g'] + 0.05, c['g'] + c['fh'] + 0.05):
                s.ellipse(x + 2.4, y, 0.14, 0.14, 0x30302e)
        # ghost sign on the left party wall
        L = c['L']; ls = L.s
        ls.rect(D * 0.28, 7.0, D * 0.5, 4.2, C(0xd8cfb8), 0.38)
        for j in range(3):
            ls.rect(D * 0.31, 7.5 + j * 1.25, D * 0.44 * (0.9 - 0.2 * (j == 1)), 0.75, C(0x3a3a3a), 0.25)
        # roof monitor (long skylight lantern)
        ps = k.prop_sheet(); y = c['roof']
        k.box(W * 0.25, y, -D * 0.75, W * 0.5, y + 1.5, -D * 0.2, ps, (4, 3, 2, 1), (6, 3, 2, 1), lod=1)
        # timber canopy over the loading doors
        cw = W / 5
        for ci in (0, 4):
            s.rect(ci * cw + 0.3, c['g'] - 0.75, cw - 0.6, 0.2, C(0x5a4a3a))
            F.box(ci * cw + 0.3, c['g'] - 0.75, cw - 0.6, 0.2, 1.6, faces='flrtb', ao=0.35, lod=True)
    block(k, o, deco)


@K.piece('sf_warehouse_b', style='warehouse midrise concrete', stone=0xb9b2a2,
         desc='5-storey concrete daylight-factory loft (now offices): expressed frame, big steel-sash bays, corner site, roof tank and bulkhead')
def warehouse_b(k):
    o = dict(W=30.0, D=30.0, g=5.0, fh=4.2, nfl=4, par=1.0, mat='concrete', c=0xbcb5a4, trim=0xc8c2b2, base=0xb0a998, corner=True, cols=5, side_cols=5,
             win=dict(w=4.8, h=2.9, kind='grid', nx=6, ny=4, d=0.3, frame=0x3c4a4a, lintel=False, sill=0.95, sillbox=False),
             cornice=dict(h=0.55, d=0.3, dentil=0, c=0xc4bdac), pilasters=0.8,
             ground=dict(kind='window', pier=0.9, rustic=False),
             shops=[dict(kind='window'), dict(kind='window'), dict(kind='entry', doorc=0x2e3a3a), dict(kind='window'), dict(kind='rollup')],
             side_shops=[dict(kind='window'), dict(kind='window'), dict(kind='rollup'), dict(kind='rollup', gc=0x5a6a6a), dict(kind='window')],
             tank=(21.0, -21.0), rear_stairs=False, rear_c=0xaaa494, party_c=0xb0aa9a, party_mat='concrete', rear_mat='concrete')
    def deco(c):
        # spandrel panels under the windows read slightly darker; painted mural band on the side
        for Fc in (c['F'], c['R']):
            s = Fc.s
            for f in range(4):
                s.rect(0, c['g'] + f * 4.2 + 0.12, Fc.w, 0.7, mul(C(0xbcb5a4), 0.93), 0.7)
        k.plant(4.0, c['roof'], -12.0, 4.5, 1.8, 3.0, lod=1)
        k.duct(9.0, c['roof'], -11.0, 6.0, 0.8, 0.7)
    block(k, o, deco)


@K.piece('sf_warehouse_c', style='warehouse lowrise', stone=0xc9c2b0,
         desc='long low pier-style shed / auto garage: stepped stucco false front, five roll-up doors, corrugated gable roof with ridge vents')
def warehouse_c(k):
    W = 36.0; D = 24.0; eave = 5.2; ridge = 7.6; top = 8.2
    fs = k.sheet(W, top, 1.0, 'front')
    F = k.facade((0, 0, 0), (1, 0, 0), W, eave + 1.2, sheet=fs)
    s = fs; body = C(0xd3cbb6); trim = C(0x486a78)
    wallpaint(s, 0, 0, W, top, 'stucco', body, 2)
    s.rect(0, 0, W, 0.9, mul(trim, 0.9)); s.rect(0, 0.9, W, 0.08, mul(trim, 1.2))
    cw = W / 6
    for i in range(6):
        x = i * cw + 0.7; w = cw - 1.4
        if i == 2:
            s.window(x + 0.2, 1.0, w - 2.0, 2.3, trim=trim, kind='grid', nx=3, ny=2, frame=0x3a4448); F.recess(x + 0.2, 1.0, w - 2.0, 2.3, 0.2)
            s.door(x + w - 1.3, 0, 1.1, 2.4, 0x486a78, 0xe6dfcc); F.recess(x + w - 1.3, 0, 1.1, 2.4, 0.25)
            s.signband(x, 3.7, w, 0.8, trim)
        else:
            s.rect(x - 0.15, 0, w + 0.3, 4.35, mul(body, 0.82))
            s.rollup(x, 0, w, 4.2, C(0x8f9794) if i != 4 else C(0x7c8a90)); F.recess(x, 0, w, 4.2, 0.4)
            s.rect(x + w * 0.3, 4.5, w * 0.4, 0.45, mul(trim, 1.0)); s.rect(x + w * 0.38, 4.6, w * 0.24, 0.25, C(0xe6dfcc))
    # stepped parapet: centre block higher
    s.rect(0, eave + 1.05, W, 0.15, mul(body, 0.8))
    s.rect(W * 0.3, eave + 1.2, W * 0.4, top - eave - 1.2, body); s.noise(W * 0.3, eave + 1.2, W * 0.4, top - eave - 1.2, 0.05, 0.5, 0.5, 3)
    s.rect(W * 0.3, top - 0.15, W * 0.4, 0.15, mul(body, 0.8))
    s.ellipse(W / 2, eave + 1.1, 1.1, 0.8, trim); s.ellipse(W / 2, eave + 1.1, 0.8, 0.55, C(0xe6dfcc))
    s.hlines(0, 4.9, W, 0.5, trim, 0.2, 0.07)
    F.wall()
    false_front(F, eave, 0.3)
    C2 = k.facade((W * 0.3, eave + 1.2, 0), (1, 0, 0), W * 0.4, top - eave - 1.2, sheet=fs, su=W * 0.3, sv=eave + 1.2)
    C2.wall(); 
    C2.face([C2.P(0, 0, -0.3), C2.P(C2.w, 0, -0.3), C2.P(C2.w, C2.h, -0.3), C2.P(0, C2.h, -0.3)], [(0, C2.h - 0.1), (C2.w, C2.h - 0.1), (C2.w, C2.h), (0, C2.h)], -C2.n, 1)
    C2.face([C2.P(0, C2.h, 0), C2.P(C2.w, C2.h, 0), C2.P(C2.w, C2.h, -0.3), C2.P(0, C2.h, -0.3)], [(0, C2.h - 0.1), (C2.w, C2.h - 0.1), (C2.w, C2.h), (0, C2.h)], UP, 1)
    for xx, nn in ((0, -1), (C2.w, 1)):
        C2.face([C2.P(xx, 0, 0), C2.P(xx, 0, -0.3), C2.P(xx, C2.h, -0.3), C2.P(xx, C2.h, 0)], [(0.1, 0.1), (0.2, 0.1), (0.2, 0.5), (0.1, 0.5)], C2.r * nn, 1)
    # side and rear walls: corrugated metal on a concrete kerb
    metal = C(0x9aa4a2)
    R = k.facade((W, 0, 0), (0, 0, -1), D, eave, prio=0.6); L = k.facade((0, 0, -D), (0, 0, 1), D, eave, sheet=R.s)
    rs = R.s
    wallpaint(rs, 0, 0, D, eave, 'corrugated', metal, 4, 1.3); rs.rect(0, 0, D, 0.8, C(0xa9a394)); rs.noise(0, 0, D, 0.8, 0.1, 0.6, 0.6, 2)
    for j in range(4):
        x = 2.0 + j * 5.6
        rs.window(x, 2.6, 3.0, 1.5, kind='grid', nx=5, ny=2, frame=0x4a5656, blind=0)
        R.recess(x, 2.6, 3.0, 1.5, 0.12); L.recess(x, 2.6, 3.0, 1.5, 0.12)
    rs.door(D - 2.2, 0, 1.0, 2.2, 0x5a6666, 0x7a8484, glass=False)
    R.wall(); L.wall()
    bsh = k.sheet(W, ridge, 0.6, 'back')
    B = k.facade((W, 0, -D), (-1, 0, 0), W, eave, sheet=bsh)
    wallpaint(bsh, 0, 0, W, ridge, 'corrugated', mul(metal, 0.95), 6, 1.4); bsh.rect(0, 0, W, 0.8, C(0xa9a394))
    for i in (1, 4):
        bsh.rollup(i * cw + 0.8, 0, cw - 1.6, 3.8, C(0x7c8a90)); B.recess(i * cw + 0.8, 0, cw - 1.6, 3.8, 0.3)
    bsh.window(W / 2 - 2.5, eave - 0.4, 5.0, 1.4, kind='grid', nx=8, ny=2, frame=0x4a5656, blind=0)
    bsh.door(W / 2 - 0.5, 0, 1.0, 2.2, 0x5a6666, 0x7a8484, glass=False)
    B.wall(top=[(W / 2, ridge)])
    # the front gable end is hidden by the false front; close it anyway above the eave line
    gs = gable_roof(k, 0, W, -D, -0.3, eave, ridge, ov=0.0, eov=0.25, c=0x8f9a9c, kind='corrugated')
    ps = k.prop_sheet()
    for j in range(4):
        z = -3.5 - j * 5.6
        k.cyl(W / 2, z, 0.55, ridge - 0.1, ridge + 0.7, 8, ps, (6.05, 3.05, 1.9, 0.9), (0.2, 3.2, 0.5, 0.5))
        k.box(W * 0.27, eave + (ridge - eave) * 0.46, z - 1.2, W * 0.27 + 2.6, eave + (ridge - eave) * 0.46 + 0.55, z + 1.2, ps, (0.1, 3.02, 1.5, 0.2), (4, 3, 2, 1))
        k.box(W * 0.73 - 2.6, eave + (ridge - eave) * 0.46, z - 1.2, W * 0.73, eave + (ridge - eave) * 0.46 + 0.55, z + 1.2, ps, (0.1, 3.02, 1.5, 0.2), (4, 3, 2, 1))


@K.piece('sf_lowrise_c', style='lowrise stucco', stone=0xe2d9c4,
         desc='Streamline Moderne corner bar / diner: rounded corner with the entrance, ribbon windows, canopy, speed-lines and a blank neon pylon')
def lowrise_c(k):
    W = 16.0; D = 18.0; H = 6.0; r = 4.5; n = 6
    cream = C(0xe6dcc6); teal = C(0x2f7c80); maroon = C(0x7a2c34); black = C(0x2e2e30)
    def paint(s, x, w, door=None, port=()):
        s.rect(x, 0, w, H, cream); s.noise(x, 0, w, H, 0.03, 0.12, 0.12, 1); s.weather(x, 0, w, H, 0.6, int(x * 7) % 9)
        s.rect(x, 0, w, 0.95, black); s.rect(x, 0.95, w, 0.07, C(0xb9bdc0)); s.vlines(x, 0, w, 0.95, mul(black, 1.4), 0.6, 0.02)
        s.rect(x, 3.35, w, 0.38, maroon)
        s.hlines(x, 3.4, w, 0.3, C(0xc9cdd0), 0.1, 0.03)
        for j, yy in enumerate((4.55, 4.85, 5.15)):
            s.rect(x, yy, w, 0.14, teal)
        s.rect(x, H - 0.22, w, 0.22, mul(cream, 0.82)); s.rect(x, H - 0.28, w, 0.06, maroon)
        s.vshade(x, 2.2, w, 1.15, 1.0, 0.75)
    FW = W - r; SW = D - r
    F = k.facade((0, 0, 0), (1, 0, 0), FW, H, name='front'); paint(F.s, 0, FW)
    # ribbon windows in two runs, glass-block panel at the far end
    for (x, w) in ((0.7, 3.0), (4.1, 3.4), (7.9, 3.2)):
        F.s.window(x, 1.02, w, 2.05, frame=0xb9bdc0, kind='grid', nx=max(2, int(w / 1.1)), ny=1, blind=0.2, fw=0.06)
        F.recess(x, 1.02, w, 2.05, 0.2)
    F.box(-0.0, 3.35, FW + 0.2, 0.38, 0.95, ao=0.45, lod=True)
    F.wall()
    # the rounded corner as flat facets sharing one sheet
    cx, cz = W - r, -r
    pts = [np.array([cx + r * math.sin(i * math.pi / 2 / n), 0, cz + r * math.cos(i * math.pi / 2 / n)]) for i in range(n + 1)]
    ch = float(np.linalg.norm(pts[1] - pts[0]))
    cs = k.sheet(ch * n, H, 1.0, 'corner'); paint(cs, 0, ch * n)
    # entrance on the middle facets, portholes beside it
    cs.rect(ch * 2 - 0.15, 0, ch * 2 + 0.3, 2.75, C(0xb9bdc0))
    cs.door(ch * 2 + 0.05, 0, ch - 0.1, 2.55, maroon, 0xb9bdc0, glass=True, transom=0.0); cs.door(ch * 3 + 0.05, 0, ch - 0.1, 2.55, maroon, 0xb9bdc0, glass=True, transom=0.0)
    for u in (ch * 1.0, ch * 5.0):
        cs.ellipse(u, 2.0, 0.55, 0.55, C(0xb9bdc0)); cs.ellipse(u, 2.0, 0.44, 0.44, mix(GLASS, GLASS_HI, 0.3)); cs.ellipse(u + 0.1, 2.12, 0.2, 0.14, GLASS_HI, 0.4)
    for i in range(n):
        d = (pts[i + 1] - pts[i]) / ch
        Fi = k.facade(pts[i], d, ch, H, sheet=cs, su=i * ch)
        if i in (2, 3): Fi.recess(0.05, 0, ch - 0.1, 2.55, 0.5)
        Fi.box(-0.12, 3.35, ch + 0.24, 0.38, 0.95, lod=True, faces='ftb', uvrect=(0, 3.35, ch, 0.38))
        Fi.wall()
    cs.vshade(0, 2.2, ch * n, 1.15, 1.0, 0.75)
    R = k.facade((W, 0, -r), (0, 0, -1), SW, H, name='side'); paint(R.s, 0, SW)
    for (x, w) in ((0.6, 3.2), (4.4, 3.0)):
        R.s.window(x, 1.02, w, 2.05, frame=0xb9bdc0, kind='grid', nx=3, ny=1, blind=0.2, fw=0.06); R.recess(x, 1.02, w, 2.05, 0.2)
    # glass-block panel + service door
    R.s.rect(8.2, 1.0, 2.2, 2.1, C(0x9fb4b8)); R.s.vlines(8.2, 1.0, 2.2, 2.1, C(0xc8d6d8), 0.2, 0.03); R.s.hlines(8.2, 1.0, 2.2, 2.1, C(0xc8d6d8), 0.2, 0.03)
    R.s.door(11.4, 0, 1.0, 2.2, 0x4a4a4c, 0xb9bdc0, glass=False); R.recess(11.4, 0, 1.0, 2.2, 0.2)
    R.box(-0.2, 3.35, SW * 0.72, 0.38, 0.95, ao=0.45, lod=True)
    R.wall()
    o = dict(g=3.6, fh=3.0, nfl=0, c=0xcfc6b2, mat='stucco')
    B = k.facade((W, 0, -D), (-1, 0, 0), W, H, prio=0.6); rear(B, o, seed=4, stairs=False); B.wall()
    L = k.facade((0, 0, -D), (0, 0, 1), D, H, prio=0.6); party_wall(L, 'stucco', C(0xcfc6b2), 0, 3.6, 3.0, 3, wins=2); L.wall()
    # roof: plan polygon, kitchen stack, vents
    rs = k.sheet(W, D, 0.55, 'roof'); rs.roofing(0, 0, W, D, seed=4, coping=0.0)
    poly = [(0, -D), (W, -D)] + [(p[0], p[2]) for p in pts[::-1]] + [(0, 0)]
    k.roof_poly(poly, H, rs, 0, 0)
    # coping line painted round the edge
    rs.rect(0, 0, W, 0.3, mul(cream, 0.85)); rs.rect(0, D - 0.3, W, 0.3, mul(cream, 0.85)); rs.rect(0, 0, 0.3, D, mul(cream, 0.85)); rs.rect(W - 0.3, 0, 0.3, D, mul(cream, 0.85))
    k.plant(3.0, H, -13.0, 2.6, 1.3, 2.0); k.duct(6.0, H, -12.4, 4.0, 0.7, 0.6); k.vent(9.5, H, -8.0, 0.3, 1.1); k.vent(4.0, H, -6.0, 0.2, 0.6); k.skylight(8.0, H, -14.5, 2.0, 1.2)
    # neon pylon: a fin over the entrance (stripes only)
    ps, ax, ay = misc_slot(k, 1.4, 1.2)
    ps.rect(ax, ay, 1.4, 1.2, maroon); ps.rect(ax + 0.08, ay + 0.06, 1.24, 1.08, mul(maroon, 0.8))
    ps.hlines(ax + 0.2, ay + 0.15, 1.0, 0.95, C(0xe9dcae), 0.17, 0.06); ps.rect(ax, ay, 0.1, 1.2, teal); ps.rect(ax + 1.3, ay, 0.1, 1.2, teal)
    dgl = np.array([math.sin(math.pi / 4), 0, math.cos(math.pi / 4)]); perp = np.array([dgl[2], 0, -dgl[0]])
    base = np.array([cx, 0, cz]) + dgl * (r - 0.3)
    k.boxpts(base - perp * 0.18 + UP * 3.73, perp * 0.36, UP * 4.3, dgl * 1.5, ps, (ax, ay, 0.1, 1.2), (ax, ay, 0.08, 0.08), side2=(ax, ay, 1.4, 1.2), lod=1, bottom=True)


@K.piece('sf_lowrise_d', style='lowrise wharf', stone=0xd9d4c8,
         desc="Fisherman's-Wharf seafood restaurant shed: white board-and-batten gable, big striped sidewalk awning over crab-stand counters and steam pots, round blank roof sign")
def lowrise_d(k):
    W = 20.0; D = 19.0; eave = 4.3; ridge = 7.1
    white = C(0xe6e2d6); blue = C(0x2f5f8a); red = C(0xb8342c)
    fs = k.sheet(W, ridge, 1.0, 'front'); bsh = k.sheet(W, ridge, 0.6, 'back')
    F = k.facade((0, 0, 0), (1, 0, 0), W, eave, sheet=fs); s = fs
    s.vboards(0, 0, W, ridge, white, 0.3, 0.12); s.weather(0, 0, W, ridge, 0.9, 3)
    s.rect(0, 0, W, 0.8, blue); s.rect(0, eave - 0.2, W, 0.25, blue)
    # restaurant front: door in the middle, picture windows either side
    for (x, w) in ((1.0, 3.6), (5.2, 3.2), (11.6, 3.2), (15.4, 3.6)):
        s.window(x, 1.0, w, 2.3, trim=blue, tw=0.12, frame=white, kind='transom', nx=3, blind=0.2)
        F.recess(x, 1.0, w, 2.3, 0.18)
    s.rect(8.85, 0, 2.3, 3.0, blue); s.door(9.0, 0, 1.0, 2.6, red, white, transom=0.35); s.door(10.0, 0, 1.0, 2.6, red, white, transom=0.35)
    F.recess(9.0, 0, 2.0, 2.6, 0.6)
    # gable: round sign with an abstract crab, fish-scale shingles
    s.scales(0, eave + 0.05, W, ridge - eave, mul(white, 0.95), 0.3, 0.14)
    s.ellipse(W / 2, eave + 1.35, 1.25, 1.25, blue); s.ellipse(W / 2, eave + 1.35, 1.08, 1.08, white)
    s.ellipse(W / 2, eave + 1.3, 0.55, 0.38, red)
    for sg in (-1, 1):
        s.ellipse(W / 2 + sg * 0.68, eave + 1.72, 0.2, 0.16, red)
        for j in range(3):
            s.poly([(W / 2 + sg * 0.45, eave + 1.2 - j * 0.14), (W / 2 + sg * 0.9, eave + 1.05 - j * 0.2), (W / 2 + sg * 0.9, eave + 0.98 - j * 0.2), (W / 2 + sg * 0.45, eave + 1.12 - j * 0.14)], red)
    F.wall(top=[(W / 2, ridge)])
    # big sidewalk awning + crab stand counters and pots under it
    asn, ax, ay = misc_slot(k, 3.2, 1.3)
    asn.awning_paint(ax, ay, 3.2, 1.3, C(0xeae4d6), red, 0.4); asn.rect(ax, ay, 3.2, 0.3, white); asn.rect(ax, ay + 0.26, 3.2, 0.04, red)
    F.awning(0.3, 2.85, W - 0.6, 1.3, 3.0, 0.3, uvrect=(ax, ay, 3.2, 1.3), sh=asn, lod=True)
    iron = k.metal_sheet(0x8f9498)
    for x in (0.4, W / 2 - 1.3, W / 2 + 1.3, W - 0.4):
        k.bar(F.P(x, 0, 2.9), F.P(x, 2.9, 2.9), 0.08, iron, (0.1, 0.6, 0.3, 0.3))
    cs_, cx_, cy_ = misc_slot(k, 2.0, 1.0)
    cs_.rect(cx_, cy_, 2.0, 1.0, C(0xb9bdc0)); cs_.rect(cx_, cy_, 2.0, 0.55, red); cs_.rect(cx_ + 0.1, cy_ + 0.1, 1.8, 0.35, white); cs_.rect(cx_ + 0.25, cy_ + 0.2, 0.3, 0.15, red); cs_.rect(cx_ + 0.75, cy_ + 0.2, 0.5, 0.15, blue); cs_.rect(cx_ + 1.45, cy_ + 0.2, 0.3, 0.15, red)
    cs_.rect(cx_, cy_ + 0.9, 2.0, 0.1, C(0xd4d8da))
    for (x, w) in ((1.2, 6.0), (12.8, 6.0)):
        F.box(x, 0, w, 1.0, 2.6, d0=1.7, faces='flrt', uvrect=(cx_, cy_, 2.0, 1.0), sh=cs_, lod=True)
        fb = F.P(x, 0, 1.7)
        k.emit([F.P(x, 0, 1.7), F.P(x + w, 0, 1.7), F.P(x + w, 1.0, 1.7), F.P(x, 1.0, 1.7)], cs_, [(cx_, cy_ + 0.6), (cx_ + 2, cy_ + 0.6), (cx_ + 2, cy_ + 0.9), (cx_, cy_ + 0.9)], -F.n)
        for j in range(3):
            p = F.P(x + 0.9 + j * 2.0, 1.0, 2.15)
            k.cyl(p[0], p[2], 0.32, 1.0, 1.55, 7, cs_, (cx_, cy_ + 0.6, 2.0, 0.3), (cx_ + 0.2, cy_ + 0.92, 0.4, 0.06))
    # sides: board and batten, rear: plain
    R = k.facade((W, 0, 0), (0, 0, -1), D, eave, prio=0.6); L = k.facade((0, 0, -D), (0, 0, 1), D, eave, sheet=R.s)
    rs = R.s; rs.vboards(0, 0, D, eave, mul(white, 0.96), 0.3, 0.12); rs.weather(0, 0, D, eave, 1.1, 5); rs.rect(0, 0, D, 0.8, blue)
    for j in range(4):
        x = 1.6 + j * 4.3
        rs.window(x, 1.3, 1.6, 1.6, trim=blue, tw=0.1, frame=white, kind='pair'); R.recess(x, 1.3, 1.6, 1.6, 0.12); L.recess(x, 1.3, 1.6, 1.6, 0.12)
    R.wall(); L.wall()
    B = k.facade((W, 0, -D), (-1, 0, 0), W, eave, sheet=bsh)
    bsh.vboards(0, 0, W, ridge, mul(white, 0.93), 0.3, 0.12); bsh.weather(0, 0, W, ridge, 1.3, 8); bsh.rect(0, 0, W, 0.8, mul(blue, 0.9))
    bsh.door(4.0, 0, 1.0, 2.2, 0x5a6268, 0x8a9094, glass=False); B.recess(4.0, 0, 1.0, 2.2, 0.15)
    bsh.rollup(12.0, 0, 3.0, 2.8, C(0x9aa0a0)); B.recess(12.0, 0, 3.0, 2.8, 0.25)
    bsh.window(7.0, 1.4, 2.4, 1.2, frame=0x8a9094, kind='grid', nx=4, ny=2, blind=0)
    B.wall(top=[(W / 2, ridge)])
    gable_roof(k, 0, W, -D, 0, eave, ridge, ov=0.5, eov=0.4, c=0x6f7478, kind='shingle')
    ps = k.prop_sheet()
    k.cyl(W * 0.3, -D * 0.6, 0.35, eave + 1.2, ridge + 0.25, 6, ps, (6.05, 3.05, 1.9, 0.9), (0.2, 3.2, 0.5, 0.5))
    k.box(W * 0.62, eave + 0.9, -D * 0.7, W * 0.62 + 2.4, eave + 2.3, -D * 0.7 + 1.8, ps, (3, 0, 2, 2), (0.1, 3.1, 1.8, 0.8))
