# Tokyo kit: low-rise (< 15 m): shotengai shop row, convenience store + parking, family restaurant over a garage,
# koban + shrine office. design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *
from kit_zakkyo import shop, TILES
from kit_house import car, hood, toro, tall_sheet

SASH = 0x8f8f8a


def shophouse(k, S, x0, W, D, H, c, mat, kind, seed=0, par=0.8, upper='win', g=3.3, tank=False):
    rng = k.rng; c = col(c)
    F, R, B, L = box4(k, x0, 0, W, D, H + par, prio=(1.0, 0.5, 0.6, 0.5)); s = F.s
    wallmat(s, 0, 0, W, H + par, mat, c, seed); s.rect(0, H + par - 0.25, W, 0.25, mul(c, 0.75)); F.box(0, H + par - 0.25, W, 0.25, 0.1, faces='ftb')
    shop(F, S, 0.1, W - 0.2, g, kind)
    if upper == 'sign': S.board(F, 0.4, g + 0.5, W - 0.8, H - g - 0.6, 0.14, glow=0.9)
    else:
        n = 2 if W > 4.6 else 1
        for i in range(n):
            ww = min(1.6, W / n - 0.9); wx = (i + 0.5) * W / n - ww / 2; win(F, wx, g + 1.0, ww, 1.3, 0.12, SASH, n=2, lit=0.6, box=mul(c, 0.7)); hood(F, wx - 0.1, g + 2.35, ww + 0.2, 0.3, mul(c, 0.6))
        if rng.random() < 0.7: ac(F, 0.4, g + 0.25, 0.0)
        if rng.random() < 0.6: S.blade(F, W - 0.2, g + 0.9, 0.7, 1.8, glow=0.9)
    F.wall()
    sc = mix(c, 0xb4b0a8, 0.6)
    for Fc in (R, L, B):
        ss = Fc.s; wallmat(ss, 0, 0, Fc.w, H + par, 'stucco' if mat != 'corrugated' else mat, sc, seed + 2); ss.rect(0, 0, Fc.w, 0.35, mul(sc, 0.7))
        if Fc is B:
            ss.door(0.5, 0.05, 0.85, 2.0, 0x6f777a, 0x9a9ea0, glass=False); win(B, W - 1.8, 1.0, 1.2, 1.0, 0.1, SASH, n=2, lit=0.4, box=mul(sc, 0.7)); win(B, W * 0.5 - 0.6, g + 1.0, 1.2, 1.1, 0.1, SASH, n=2, lit=0.5, box=mul(sc, 0.7))
            ac(B, 1.6, 0.02, 0.05); ac(B, W - 1.3, g + 0.2, 0.0); k.bar(B.P(W - 0.25, 0, 0.07), B.P(W - 0.25, H, 0.07), 0.09, props(k), PR['steel'])
        else:
            for f in range(2):
                if rng.random() < 0.6: win(Fc, D * (0.3 + 0.4 * f), f * g + 1.1, 1.0, 1.0, 0.1, SASH, n=2, lit=0.45)
        Fc.wall()
    flat_roof(k, x0, -D, x0 + W, 0, H, par, 0.2, seed=seed, bulk=False, clutter=0.9)
    if tank: frp_tank(k, x0 + 0.8, H, -D + 1.0, 2.0, 1.5, 1.5, legs=0.8)
    return H


@K.piece('tokyo_lowrise_a', style='lowrise shotengai shops', stone=0xcfc6b2, share=2, desc='shotengai row of four 2-storey shops under a continuous arcade canopy hung with red and white lanterns: ramen, cafe, awninged shops, signboards')
def lowrise_a(k):
    k.litc = WARM + [0xf0f4ff]; k.lit = 0.55
    S = Signs(k, 12)
    spec = [(5.6, 10.0, 6.9, 0xdcd4c0, 'stucco', 'shop', 'win'), (5.0, 11.0, 7.8, TILES['brown'], 'tile', 'ramen', 'sign'), (6.2, 10.5, 6.6, 0x9fb0b4, 'siding', 'cafe', 'win'), (5.4, 9.5, 7.4, TILES['white'], 'tile', 'shop', 'win')]
    x = 0.0
    for i, (W, D, H, c, mat, kd, up) in enumerate(spec):
        shophouse(k, S, x, W, D, H, c, mat, kd, i + 1, upper=up, tank=i == 1); x += W + 0.05
    # arcade canopy
    ps = props(k); y = 3.45; d = 2.0
    r = S.stripes(11.0, 0.5, (0xd82a2a, 0xf2c81e), glow=0.6)
    k.box(0, y, 0.02, x, y + 0.5, d, S.s, r, PR['top'], sides='flr', bottom=True); k.emit([V(0, y + 0.5, 0.02), V(x, y + 0.5, 0.02), V(x, y + 0.5, d), V(0, y + 0.5, d)], ps, [(PR['white'][0], 0.05), (PR['white'][0] + 0.25, 0.05), (PR['white'][0] + 0.25, 0.6), (PR['white'][0], 0.6)], UP, 3)
    n = 5
    for i in range(n): k.bar([0.15 + i * (x - 0.3) / (n - 1), 0, d - 0.15], [0.15 + i * (x - 0.3) / (n - 1), y, d - 0.15], 0.14, ps, PR['steel'])
    m = int(x / 1.15)
    for i in range(m): lantern(k, V(0.6 + i * (x - 1.2) / (m - 1), y - 0.55, d - 0.25), 0.17, 0.42, 'lan_r' if i % 2 == 0 else 'lan_w')
    bike(k, 3.0, 0.5, 'x'); bike(k, 12.5, 0.5, 'x', 'steel'); pots(k, 17.5, 0.2, 3, 'x', 2)
    for i in range(3): pbox(k, [7.9 + i * 0.5, 0, 0.25], [0.45, 0, 0], [0, 0.7 if i != 1 else 1.05, 0], [0, 0, 0.35], 'crate', 'dark')


def pylon(k, S, x, z, h=2.4, legs=4.4, w=2.2, **kw):
    S.roof_sign(x, x + w, 0.0, z, h=h, legs=legs, t=0.4, **kw)


def nobori(k, S, x, z, c=None):
    ps = props(k); k.bar([x, 0, z], [x, 3.2, z], 0.05, ps, PR['steel'])
    r = S.sign(0.6, 1.9, bg=c, glow=0.25); k.box(x + 0.03, 1.2, z - 0.015, x + 0.63, 3.1, z + 0.015, S.s, r, (r[0], r[1], 0.05, 0.05), sides='fb')


@K.piece('tokyo_lowrise_b', style='lowrise konbini parking', stone=0xe6e6e2, desc='convenience store on a corner parking lot (invented livery): bright glazed front under a striped lit fascia, pylon sign, flags, cars, bins, vending machines')
def lowrise_b(k):
    k.lit = 0.8
    S = Signs(k, 13); W, D, H, zf = 13.0, 10.0, 4.1, -6.5; cols = (0x1f9d8a, 0xf07a1a)
    F, R, B, L = box4(k, 0, zf, W, D, H, prio=(1.0, 0.8, 0.5, 0.6)); c = C(0xe8e8e4)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, H, 'panel', c, 1); s.rect(0, 0, Fc.w, 0.3, 0x8a8a88)
    shop(F, S, 0.2, W - 0.4, H - 0.05, 'konbini', hf=1.0, fascia=False)
    r = S.stripes(W, 1.0, cols); S.board(F, 0, H - 1.0, W, 1.0, 0.3, r=r); F.wall()
    shop(R, S, 0.2, 4.2, H - 0.05, 'konbini', hf=1.0, fascia=False); S.board(R, 0, H - 1.0, D, 1.0, 0.3, r=(r[0], r[1], D, 1.0))
    R.s.door(D - 1.6, 0.05, 0.9, 2.0, 0x8a9094, 0x9a9ea0, glass=False); R.wall()
    S.board(L, 0, H - 1.0, D, 1.0, 0.3, r=(r[0], r[1], D, 1.0)); L.wall()
    B.s.door(1.0, 0.05, 0.9, 2.0, 0x8a9094, 0x9a9ea0, glass=False); ac(B, 3.0, 0.02, 0.05, 3); B.wall()
    flat_roof(k, 0, zf - D, W, zf, H - 0.3, 0.3, 0.2, seed=2, bulk=False, clutter=0.0)
    ac_rows(k, 2.0, H - 0.3, zf - 6.0, 4, 2); plant(k, 8.0, H - 0.3, zf - 7.0, 2.4, 1.4, 1.8); vent(k, 6.5, H - 0.3, zf - 3.0)
    S.roof_sign(3.5, 9.5, H - 0.3, zf - 0.6, h=1.6, legs=0.8, r=S.stripes(6.0, 1.6, cols))
    ps = props(k)
    # forecourt: wheel stops, bollards, bins, vending, cars, pylon, flags
    for i in range(5): k.box(0.8 + i * 2.6, 0, zf + 1.1, 2.6 + i * 2.6, 0.14, zf + 1.3, ps, PR['conc'], PR['conc'])
    for i in range(4): k.cyl(1.9 + i * 2.6 + (5.2 if i > 1 else 0) * 0, zf + 0.75, 0.09, 0, 0.9, 6, ps, PR['yellow'], PR['top'])
    for i in range(3): pbox(k, [W - 2.4 + i * 0.6, 0, zf + 0.05], [0.55, 0, 0], [0, 0.95, 0], [0, 0, 0.5], ['steel', 'blue', 'green'][i], 'dark')
    vending(F, 0.1, 0.0, (2, 0)) if False else None
    car(k, 1.0, -0.9, 0, 3.6, 1.6); car(k, 6.3, -0.7, 2, 3.8, 1.6)
    for i in range(4): k.box(W + 0.8, 0, zf - 1.0 - i * 2.6, W + 1.0, 0.14, zf - 2.8 - i * 2.6, ps, PR['conc'], PR['conc'])
    car(k, W + 1.3, zf - 4.3, 1, 3.6, 1.6) if False else None
    pylon(k, S, W + 2.3, -0.6, r=S.stripes(2.2, 2.4, cols))
    for i in range(4): nobori(k, S, 0.3 + i * 1.3 + (7.5 if i > 1 else 0), -0.25, [0xd82a2a, 0xf2c81e, 0x1f5fd0, 0xd82a2a][i])
    bike(k, 10.2, zf + 0.5, 'x', 'steel'); bike(k, 11.6, zf + 0.55, 'x'); pole(k, W + 4.3, -0.3, lamp=V(-0.7, 0, -0.7))
    k.box(W + 0.6, 0, zf - D + 0.2, W + 4.4, 1.6, zf - D + 0.35, ps, (PR['block'][0], PR['block'][1], 1.9, 0.6), PR['top'])


@K.piece('tokyo_lowrise_c', style='lowrise restaurant garage', stone=0xd8c8a8, desc='2-storey family restaurant raised over an open parking garage: warm-lit ribbon windows, red metal hip roof with a lit fascia, entrance stair, pylon sign')
def lowrise_c(k):
    k.litc = WARM; k.lit = 0.9
    S = Signs(k, 13); W, D, g, H = 20.0, 12.0, 3.3, 7.3; c = C(0xe2d4b4)
    # core at the rear of the ground floor + columns
    F, R, B, L = box4(k, 0, -6.5, W, D - 6.5, g, prio=(0.6, 0.5, 0.6, 0.5))
    for Fc in (F, R, B, L):
        wallmat(Fc.s, 0, 0, Fc.w, g, 'concrete', 0xa8a69e, 1)
        if Fc is F: Fc.s.door(2.0, 0, 0.9, 2.0, 0x70787c, 0x9a9ea0, glass=False); Fc.s.em.rect(6.0, g - 0.5, 8.0, 0.14, col(0xf0f4e8) * 0.7)
        if Fc is B: ac(B, 3.0, 0.02, 0.05, 3); Fc.s.door(8.0, 0, 0.9, 2.0, 0x70787c, 0x9a9ea0, glass=False); win(B, 12.0, 1.2, 1.4, 1.0, 0.1, SASH, lit=0.6)
        Fc.wall()
    ps = props(k)
    for i in range(5):
        for z in (-0.6, -3.6): k.box(0.3 + i * 4.72, 0, z - 0.25, 0.8 + i * 4.72, g, z + 0.25, ps, (PR['conc'][0], PR['conc'][1], 0.5, 0.5), lod=1 if z > -1 and i in (0, 4) else 0)
    car(k, 1.6, -1.2, 0, 3.8, 1.6); car(k, 11.2, -1.4, 2, 3.8, 1.6); car(k, 6.4, -1.6, 1, 3.6, 1.6)
    # restaurant floor
    U = box4(k, 0, 0, W, D, H - g, g, prio=(1.0, 0.8, 0.6, 0.8))
    for Fc in U:
        s = Fc.s; h = H - g; wallmat(s, 0, 0, Fc.w, h, 'stucco', c, 2); s.rect(0, 0, Fc.w, 0.35, 0x8a5a40)
        if Fc is U[2]:
            for i in range(4): win(Fc, 2.0 + i * 4.5, 1.2, 1.5, 1.1, 0.12, SASH, lit=0.6, box=mul(c, 0.7))
            ac(Fc, 9.0, 0.5, 0.0, 2)
        else:
            n = int(Fc.w / 3.3); bw = Fc.w / n
            for i in range(n):
                ribbon(Fc, i * bw + 0.3, 0.75, bw - 0.6, 2.0, 0.18, 0x6a4a38, pw=1.3, lit=0.92, run=1, blind=0.15)
                s.rect(i * bw + 0.2, 2.8, bw - 0.4, 0.1, 0x8a2a20); Fc.box(i * bw + 0.2, 2.8, bw - 0.4, 0.1, 0.5, faces='flrtb')
        Fc.wall()
    k.emit([V(0, g, 0), V(W, g, 0), V(W, g, -6.5), V(0, g, -6.5)], ps, [(PR['conc'][0], PR['conc'][1]), (PR['conc'][0] + 3, PR['conc'][1]), (PR['conc'][0] + 3, PR['conc'][1] + 0.5), (PR['conc'][0], PR['conc'][1] + 0.5)], -UP, 1)
    ts = roof_sheet_tile(k, 22.0, 7.6, 0x9a3a2c, 'metal', 0.6)
    r = S.sign(10.0, 0.9, bg=0xf0e6c8, fg=0xc0201e, glow=0.9)
    for Fc in (U[0], U[1], U[3]): S.board(Fc, 0.0, H - g - 0.05, Fc.w, 0.9, 0.35, r=(r[0], r[1], min(10.0, Fc.w), 0.9))
    hip_roof(k, 0.3, W - 0.3, -D + 0.3, -0.3, H + 0.85, 2.0, ts, 0.1)
    plant(k, 8.0, H + 0.8, -D + 0.2, 2.2, 1.2, 1.2)
    ext_stair(U[0], 15.2, 4.2, 1.6, [0.1 - g, 0.0], c=0x8a5a40, roof=True)
    pylon(k, S, 0.4, 2.2, h=2.6, legs=5.2, w=2.6, bg=0xc0201e); pots(k, 14.0, 0.3, 2, 'x', 3); bike(k, 17.0, 1.9, 'x')


def torii(k, x, z, w=3.0, h=3.4):
    ps = props(k); vm = PR['verm']
    for px in (x, x + w): k.cyl(px, z, 0.17, 0, h, 6, ps, vm); k.cyl(px, z, 0.24, 0, 0.35, 6, ps, PR['dark'], cap=PR['dark'])
    k.box(x - 0.55, h, z - 0.16, x + w + 0.55, h + 0.26, z + 0.16, ps, vm, PR['dark'], bottom=True); k.box(x - 0.7, h + 0.26, z - 0.2, x + w + 0.7, h + 0.4, z + 0.2, ps, PR['dark'], PR['dark'], bottom=True)
    k.box(x - 0.25, h - 0.75, z - 0.1, x + w + 0.25, h - 0.5, z + 0.1, ps, vm, vm, bottom=True)


@K.piece('tokyo_lowrise_d', style='lowrise civic koban shrine', stone=0xd8d8d2, desc='neighbourhood civic pair: a 2-storey tiled police box with a red lamp, lit office and roof mast, beside a timber shrine office under a tiled hip roof with a vermilion torii and stone lanterns')
def lowrise_d(k):
    k.litc = [0xf4f6ff, 0xfff0d8]; k.lit = 0.7
    S = Signs(k, 8)
    # koban
    W, D, g, H = 7.6, 7.2, 3.2, 6.5; c = C(0xdcdcd4)
    F, R, B, L = box4(k, 0, 0, W, D, H + 0.6, prio=(1.0, 0.8, 0.6, 0.6))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, H + 0.6, 'tile', c, 1); s.rect(0, 0, Fc.w, 0.5, 0x6a7a8a); s.rect(0, g - 0.1, Fc.w, 0.25, 0x3a5a8a); s.rect(0, H + 0.3, Fc.w, 0.3, mul(c, 0.8))
    s = F.s; cool = col(0xf0f6ff)
    s.rect(0.5, 0.05, 4.4, 2.5, 0x5a5e62)
    for i in range(3):
        px = 0.6 + i * 1.45; s.glass(px, 0.15 if i == 1 else 0.9, 1.3, 2.3 if i == 1 else 1.55, blind=0, lit=0); s.em.grad(px, 0.15 if i == 1 else 0.9, 1.3, 2.3 if i == 1 else 1.55, cool * 0.7, cool * 0.95)
    F.recess(0.5, 0.05, 4.4, 2.5, 0.3)
    s.rect(0.2, 2.65, 5.2, 0.2, 0x8a8e90); F.box(0.2, 2.65, 5.2, 0.2, 1.1, faces='flrtb')
    pbox(k, F.P(2.55, 2.85, 0.6), F.r * 0.3, UP * 0.3, F.n * 0.3, 'avi', 'avi', sides='fblr')     # the red lamp
    s.ellipse(2.7, g + 0.45, 0.28, 0.28, 0xc8a84a); s.ellipse(2.7, g + 0.45, 0.14, 0.14, 0xe8d48a)
    S.board(F, 5.6, 0.8, 1.6, 1.3, 0.1, bg=0xe8e4d8, fg=0x1a1a1e, glow=0.25)
    for i in range(2): win(F, 1.0 + i * 3.4, g + 1.0, 1.8, 1.2, 0.14, SASH, n=2, lit=0.7, box=mul(c, 0.7)); hood(F, 0.9 + i * 3.4, g + 2.3, 2.0, 0.35)
    F.wall()
    for Fc in (R, L, B):
        for f in range(2):
            for j in range(2): win(Fc, Fc.w * (0.27 + 0.46 * j) - 0.6, f * g + 1.1, 1.2, 1.1, 0.12, SASH, n=2, lit=0.55, box=mul(c, 0.7))
        Fc.wall()
    ac(B, 3.2, 0.02, 0.05, 2); flat_roof(k, 0, -D, W, 0, H, 0.6, 0.2, seed=1, bulk=False, clutter=0.4)
    antenna(k, 5.8, H, -5.5, 7.0); ps = props(k)
    for hh in (0.95, 1.3): k.bar([0.1, H + hh, -0.1], [W - 0.1, H + hh, -0.1], 0.05, ps, PR['steel'])
    k.bar([0.5, 0, 0.9], [0.5, 6.0, 0.9], 0.07, ps, PR['steel']); k.box(0.53, 5.0, 0.89, 1.5, 5.6, 0.91, ps, PR['white'], PR['white'], sides='fb')     # flagpole
    for i in range(2): bike(k, 5.6 + i * 0.5, 0.4 + i * 0.05, 'z', 'white')
    # shrine office
    x0 = W + 1.4; W2, D2, H2, zf = 8.4, 6.6, 3.0, -2.6; wood = C(0x4a3628); pl = C(0xe8e2d0)
    ts = roof_sheet_tile(k, 11.0, 5.6, 0x454952, 'kawara')
    T = box4(k, x0, zf, W2, D2, H2, prio=(1.0, 0.7, 0.6, 0.7))
    for Fc in T:
        s = Fc.s; wallmat(s, 0, 0, Fc.w, H2, 'stucco', pl, 3); wallmat(s, 0, 0, Fc.w, 1.0, 'wood', wood, 4); s.vlines(0, 0, Fc.w, H2, wood, 1.4, 0.12); s.rect(0, H2 - 0.2, Fc.w, 0.2, wood)
    s = T[0].s; warm = col(0xffd9a0)
    s.rect(0.6, 1.0, 4.6, 1.3, 0xd8cca8); s.em.grad(0.6, 1.0, 4.6, 1.3, warm * 0.7, warm); s.vlines(0.6, 1.0, 4.6, 1.3, wood, 1.15, 0.07); s.em.vlines(0.6, 1.0, 4.6, 1.3, 0x000000, 1.15, 0.07)
    for q in range(12): cc = pick(k, [0xd03020, 0xf0f0e8, 0xe8c020, 0x7a3ad0, 0x30a050]); s.rect(0.8 + q * 0.36, 1.1, 0.2, 0.34, cc); s.em.rect(0.8 + q * 0.36, 1.1, 0.2, 0.34, col(cc) * 0.7)
    T[0].recess(0.6, 1.0, 4.6, 1.3, 0.4); s.rect(0.5, 0.88, 4.8, 0.12, mul(wood, 1.4)); T[0].box(0.5, 0.88, 4.8, 0.12, 0.45, faces='flrtb')
    s.door(6.2, 0.1, 1.3, 2.1, 0x5a4434, wood, glass=True); T[0].recess(6.1, 0.1, 1.5, 2.2, 0.3); noren(T[0], 6.1, 1.55, 1.5, 0.7, 1)
    T[0].wall()
    for Fc in T[1:]:
        for j in range(2): win(Fc, Fc.w * (0.27 + 0.46 * j) - 0.6, 1.1, 1.2, 1.0, 0.1, 0x6a5a48, n=2, lit=0.5, box=mul(wood, 1.3))
        Fc.wall()
    hip_roof(k, x0, x0 + W2, zf - D2, zf, H2, 2.1, ts, 0.9)
    for i in range(6): k.bar(T[0].P(0.2 + i * (W2 - 0.4) / 5, H2, 0), T[0].P(0.2 + i * (W2 - 0.4) / 5, H2 - 0.12, 0.85), 0.07, ps, PR['wood'])
    torii(k, x0 + 2.7, -0.4); toro(k, x0 + 1.5, -1.0); toro(k, x0 + 6.9, -1.0); lantern(k, T[0].P(5.7, 1.9, 0.3), 0.2, 0.5, 'lan_w')
    pots(k, x0 + 0.3, zf + 0.15, 3, 'x', 5); k.box(x0 + 3.3, 0, -1.9, x0 + 5.1, 0.9, -1.2, ps, PR['wood'], PR['wood'])     # offertory box
