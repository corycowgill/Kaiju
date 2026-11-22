# Tokyo kit: apartments ('mansion' blocks, danchi, setback mansion, balcony slab, tower-mansion podium block). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *
from kit_zakkyo import shop, TILES

SASH = 0x8f8f8a


def side_wall(Fc, mat, c, y0, nfl, fh, seed=0, cols=(0.3, 0.7), ww=1.2, wh=1.2, p=0.8, base=True, d=0.14, sill=True):
    s = Fc.s; rng = Fc.k.rng
    wallmat(s, 0, 0, Fc.w, Fc.h, mat, c, seed)
    if base: s.rect(0, 0, Fc.w, 0.5, mul(c, 0.7))
    for f in range(nfl):
        for fx in cols:
            if rng.random() < p: win(Fc, Fc.w * fx - ww / 2, y0 + f * fh + 1.0, ww, wh, d, SASH, n=2, lit=None, box=mul(c, 0.72) if sill else None)


def stair_tower(k, x, z1, w, d, H, c, mat='stucco', fh=2.9, y0=0.0, seed=0, slit=True, lod=True):
    """Tower standing behind z1 (toward -Z): right, back, left walls + roof."""
    F, R, B, L = box4(k, x, z1, w, d, H, y0, prio=(0.3, 0.6, 0.6, 0.6))
    for Fc in (R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, H, mat, c, seed); n = int(H / fh)
        if slit and Fc is B:
            for f in range(n):
                win(Fc, Fc.w * 0.5 - 0.35, f * fh + 1.3, 0.7, 1.5, 0.15, 0x7a7e80, n=1, lit=0.75, litc=0xe8f2e8, blind=0)
        Fc.wall()
    k.flat_roof(x, z1 - d, x + w, z1, y0 + H, y0 + H + 0.3, 0.2, prio=0.3, seed=seed)
    return F


def roof_kit(k, x0, z0, x1, z1, H, seed=0, tank=True, par=1.0, pent=True, ant=False, c=None):
    flat_roof(k, x0, z0, x1, z1, H, par, 0.25, seed=seed, tank=tank, bulk=not pent, c=c, clutter=0.6)
    if pent:
        bulkhead(k, x0 + (x1 - x0) * 0.45, H, z0 + 1.0, 3.2, 2.6, 4.5, lod=1)
    if ant: antenna(k, x0 + (x1 - x0) * 0.45 + 1.5, H + 2.6, z0 + 3.0, 5.0)


@K.piece('tokyo_apartment_a', style='apartment mansion tile', stone=0xcbb99a, share=2, desc="7-storey beige-tile 'mansion': continuous balcony fronts with futons and AC units, lobby and shop at the foot, access galleries and a stair tower behind")
def apartment_a(k):
    k.litc = WARM + [0xf0f4ff]; k.lit = 0.48
    S = Signs(k, 10); W, D, g, fh, nu = 24.0, 11.0, 3.5, 2.9, 6; H = g + nu * fh; c = C(TILES['beige'])
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.0, prio=(1.0, 0.6, 0.9, 0.6))
    s = F.s; wallmat(s, 0, 0, W, H + 1.0, 'tile', c, 1); s.rect(0, g - 0.25, W, 0.25, mul(c, 0.75))
    rs = rail_sheet(k, W, 1.25, 'solid', 0xe0d8c4)
    unit_fronts(F, 0.3, W - 0.3, g, nu, fh, 6, rs, 1.25, lit=0.5)
    shop(F, S, 0.4, 5.2, g - 0.3, 'shop'); shop(F, S, 5.8, 5.4, g - 0.3, 'lobby'); shop(F, S, 11.6, 5.0, g - 0.3, 'garage'); shop(F, S, 17.0, 6.4, g - 0.3, 'cafe')
    F.wall()
    for Fc in (R, L): side_wall(Fc, 'tile', c, g, nu, fh, 2); Fc.wall()
    s = B.s; wallmat(s, 0, 0, W, H + 1.0, 'stucco', mix(c, 0xe8e4da, 0.6), 3)
    rb = rail_sheet(k, W, 1.25, 'bars', 0xb9b4a6)
    corridor(B, 4.2, W - 0.3, g, nu, fh, 6, rb, 1.35)
    for i in range(5): win(B, 5.0 + i * 3.6, 1.0, 1.4, 1.2, 0.12, SASH, n=2, lit=0.3)
    B.wall()
    stair_tower(k, W - 3.9, -D, 3.6, 3.4, H + 2.6, mix(c, 0xe8e4da, 0.5), fh=fh, seed=4)
    roof_kit(k, 0, -D, W, 0, H, 5)
    bike(k, 6.0, -D - 2.0, 'x'); bike(k, 8.0, -D - 2.0, 'x', 'steel'); ac_rows(k, 2.0, 0, -D - 0.6, 3)


@K.piece('tokyo_apartment_b', style='apartment danchi slab', stone=0xe2dccb, share=2, desc='5-storey danchi slab: cream concrete, a balcony per flat on the south side, four stair towers on the north, blank gable ends, roof tank')
def apartment_b(k):
    k.litc = WARM; k.lit = 0.5
    W, D, fh, nfl = 38.0, 8.2, 2.75, 5; y0 = 0.7; H = y0 + nfl * fh; c = C(0xe6dfcc); acc = C(0x9fb8c4)
    F, R, B, L = box4(k, 0, 0, W, D, H + 0.5, prio=(1.0, 0.6, 0.9, 0.6))
    s = F.s; wallmat(s, 0, 0, W, H + 0.5, 'concrete', c, 1); s.rect(0, 0, W, y0, mul(c, 0.7)); s.rect(0, H + 0.2, W, 0.3, mul(c, 0.8))
    rs = rail_sheet(k, 4.2, 1.2, 'solid', 0xd9d2bc); rs.rect(0.3, 0.3, 1.5, 0.75, 0x55585a); rs.vlines(0.3, 0.3, 1.5, 0.75, 0xc8c4b4, 0.13, 0.045)
    uw = W / 8
    for f in range(nfl):
        for u in range(8):
            ux = u * uw; y = y0 + f * fh
            win(F, ux + 0.5, y + 0.06, 1.8, 2.0, 0.0, SASH, n=2, lit=0.5); win(F, ux + 2.9, y + 0.95, 1.3, 1.1, 0.12, SASH, n=2, lit=0.5, box=mul(c, 0.7))
            balcony(F, ux + 0.25, y, 2.5, 1.05, 1.05, 0.15, rs)
            if k.rng.random() < 0.3: futon(F, ux + 0.5, y + 1.05, 1.05, int(k.rng.random() * 3))
            if k.rng.random() < 0.5: ac(F, ux + 1.6, y + 0.03, 0.08)
    for u in range(1, 8): s.rect(u * uw - 0.06, y0, 0.12, H - y0, mul(c, 0.86))
    F.box(0, H + 0.2, W, 0.3, 0.35, faces='ftb')
    F.wall()
    for Fc in (R, L):     # blank gables: a pale panel where the block number goes (left blank)
        s = Fc.s; wallmat(s, 0, 0, D, H + 0.5, 'concrete', c, 2); s.rect(D * 0.3, H - 3.6, D * 0.4, 2.2, mul(c, 1.06)); s.rect(0, 0, D, y0, mul(c, 0.7))
        for f in range(nfl): win(Fc, D * 0.72, y0 + f * fh + 1.0, 0.9, 1.0, 0.12, SASH, n=2, lit=0.4, box=mul(c, 0.7))
        Fc.wall()
    s = B.s; wallmat(s, 0, 0, W, H + 0.5, 'concrete', c, 3); s.rect(0, 0, W, y0, mul(c, 0.7))
    for q in range(4):
        cx = (q + 0.5) * W / 4
        for f in range(nfl):
            for dx in (-3.6, 2.2): win(B, cx + dx, y0 + f * fh + 1.1, 1.4, 0.95, 0.12, SASH, n=2, lit=0.45, box=mul(c, 0.7))
            if k.rng.random() < 0.6: ac(B, cx + (3.8 if f % 2 else -4.4), y0 + f * fh + 0.2, 0.0)
        s.rect(cx - 0.6, 0, 1.2, 2.2, 0x33363a)
    B.wall()
    for q in range(4):     # stair towers: open slots at every half landing
        cx = W - (q + 0.5) * W / 4; x = cx - 1.5
        T = box4(k, x, -D, 3.0, 1.6, H + 0.2, prio=(0.2, 0.5, 0.8, 0.5))
        for Fc in T[1:]:
            ss = Fc.s; wallmat(ss, 0, 0, Fc.w, H + 0.2, 'concrete', mix(c, acc, 0.75), 4 + q)
            if Fc is T[2]:
                ss.grad(0.8, 0, 1.4, 2.3, C(0x1e2024), C(0x34373a)); Fc.recess(0.8, 0, 1.4, 2.3, 0.6); ss.em.rect(1.0, 2.0, 1.0, 0.15, col(0xe8f4e8) * 0.8)
                for f in range(nfl - 1):
                    yy = y0 + f * fh + 1.9; ss.grad(0.5, yy, 2.0, 1.3, C(0x24262a), C(0x3c3f44)); ss.em.rect(0.6, yy + 0.95, 1.8, 0.25, col(0xe8f4e8) * (0.75 if k.rng.random() < 0.8 else 0.1)); Fc.recess(0.5, yy, 2.0, 1.3, 0.5)
            Fc.wall()
        k.flat_roof(x, -D - 1.6, x + 3.0, -D, H + 0.2, H + 0.4, 0.15, prio=0.25)
    flat_roof(k, 0, -D, W, 0, H, 0.5, 0.2, seed=6, bulk=False, clutter=0.25)
    frp_tank(k, W * 0.5 - 2.0, H, -D * 0.5 - 1.0, 4.0, 2.2, 2.2, legs=2.4); tv_antenna(k, 6.0, H + 0.5, -4.0, 2.5); tv_antenna(k, 30.0, H + 0.5, -4.0, 2.5)
    for i in range(3): bike(k, 3.0 + i * 0.5, -D - 2.3 - i * 0.05, 'z', 'steel' if i % 2 else 'dark')


def tier_mansion(k, S, x0, z1, W, D, y0, nfl, fh, c, units, rs, rb, seed, top=True, par=1.0, tank=False, front=True, lit=0.5):
    H = nfl * fh
    Hh = H + par
    F = k.facade((x0, y0, z1), (1, 0, 0), W, Hh); R = k.facade((x0 + W, y0, z1), (0, 0, -1), D, Hh, prio=0.6)
    B = k.facade((x0 + W, y0, z1 - D), (-1, 0, 0), W, Hh if top else H, prio=0.8); L = k.facade((x0, y0, z1 - D), (0, 0, 1), D, Hh, prio=0.6)
    s = F.s; wallmat(s, 0, 0, W, F.h, 'tile', c, seed)
    if front: unit_fronts(F, 0.3, W - 0.3, 0.0, nfl, fh, units, rs, 1.2, lit=lit)
    F.wall()
    for Fc in (R, L): side_wall(Fc, 'tile', c, 0.0, nfl, fh, seed + 1, base=False); Fc.wall()
    s = B.s; wallmat(s, 0, 0, W, B.h, 'tile', mul(c, 1.06), seed + 2)
    corridor(B, 0.3, W - 4.3, 0.0, nfl, fh, units, rb, 1.3, cap=top)
    B.wall()
    return y0 + H


@K.piece('tokyo_apartment_c', style='apartment mansion setback', stone=0x7d5a44, desc='9-storey brown-tile mansion stepping back under the slant-plane rule: balcony fronts, planted roof terraces on each setback, rear galleries and stair tower')
def apartment_c(k):
    k.litc = WARM + [0xf0f4ff]; k.lit = 0.5
    S = Signs(k, 9); W, D, g, fh = 20.0, 17.0, 3.6, 2.9; c = C(TILES['brown'])
    rs = rail_sheet(k, W, 1.25, 'solid', 0xd8cdb8); rb = rail_sheet(k, W, 1.25, 'slat', 0xb9b0a0)
    # ground floor
    F, R, B, L = box4(k, 0, 0, W, D, g, prio=(1.0, 0.5, 0.5, 0.5))
    wallmat(F.s, 0, 0, W, g, 'stone', 0xb9b0a0, 1); shop(F, S, 0.5, 6.0, g - 0.1, 'lobby'); shop(F, S, 7.0, 5.5, g - 0.1, 'garage'); shop(F, S, 13.0, 6.5, g - 0.1, 'shop'); F.wall()
    for Fc in (R, B, L):
        wallmat(Fc.s, 0, 0, Fc.w, g, 'stone', 0xb9b0a0, 2)
        for i in range(int(Fc.w / 4)): win(Fc, 1.5 + i * 4.0, 1.2, 1.5, 1.1, 0.14, SASH, n=2, lit=0.3)
        Fc.wall()
    y = tier_mansion(k, S, 0, 0, W, D, g, 4, fh, c, 4, rs, rb, 3, top=False)
    flat_roof(k, 0, -3.2, W, 0, y, 1.0, 0.25, seed=1, bulk=False, clutter=0.0, prio=0.4)
    y2 = tier_mansion(k, S, 0.3, -3.2, W - 0.6, D - 3.2, y, 2, fh, c, 4, rs, rb, 5, top=False)
    flat_roof(k, 0.3, -6.8, W - 0.3, -3.2, y2, 1.0, 0.25, seed=2, bulk=False, clutter=0.0, prio=0.4)
    y3 = tier_mansion(k, S, 0.6, -6.8, W - 1.2, D - 6.8, y2, 2, fh, c, 3, rs, rb, 7, top=True)
    for (yy, zz) in ((y, -0.6), (y2, -3.8)):
        for i in range(4): pbox(k, [1.0 + i * 4.8, yy, zz - 1.2], [2.2, 0, 0], [0, 0.7, 0], [0, 0, 0.7], 'green', (PR['green'][0], PR['green'][1] + 0.3, 0.6, 0.35))
        pbox(k, [W - 3.0, yy, zz - 1.9], [1.4, 0, 0], [0, 0.75, 0], [0, 0, 0.8], 'wood', 'wood')
    stair_tower(k, W - 3.9, -D, 3.6, 3.2, y3 + 2.6, mul(c, 1.1), 'tile', fh=fh, seed=9)
    roof_kit(k, 0.6, -D, W - 0.6, -6.8, y3, 3, par=1.0)


@K.piece('tokyo_apartment_d', style='apartment slab balcony', stone=0xe4e2da, desc='14-storey white balcony slab: solid-railed balconies across the south face, open access corridors with door lamps on the rear, lift and stair towers')
def apartment_d(k):
    k.litc = WARM + [0xf0f4ff, 0xffe9c8]; k.lit = 0.47
    S = Signs(k, 9); W, D, g, fh, nu = 40.0, 10.5, 3.3, 2.85, 13; H = g + nu * fh; c = C(0xe4e2da)
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.0, prio=(1.0, 0.5, 0.95, 0.5))
    s = F.s; wallmat(s, 0, 0, W, H + 1.0, 'stucco', c, 1); s.rect(0, g - 0.25, W, 0.25, mul(c, 0.8))
    rs = rail_sheet(k, W, 1.25, 'solid', 0xecebe4); rs.rect(0, 0.45, W, 0.5, 0xbfc8cc, 0.7)
    unit_fronts(F, 0.3, W - 0.3, g, nu, fh, 8, rs, 1.3, lit=0.48, fut=0.18)
    shop(F, S, 0.5, 8.0, g - 0.3, 'garage'); shop(F, S, 9.0, 6.0, g - 0.3, 'lobby')
    for i in range(6): s.grad(16.2 + i * 3.9, 0.1, 3.3, g - 0.6, C(0x22252a), C(0x3a3d42)); F.recess(16.2 + i * 3.9, 0.1, 3.3, g - 0.6, 1.2)
    F.wall()
    for Fc in (R, L):
        side_wall(Fc, 'stucco', c, g, nu, fh, 2, cols=(0.5,), ww=1.0, p=0.9); Fc.s.rect(0.6, g, 0.5, H - g, mul(c, 0.86)); Fc.s.rect(D - 1.1, g, 0.5, H - g, mul(c, 0.86)); Fc.wall()
    s = B.s; wallmat(s, 0, 0, W, H + 1.0, 'stucco', mul(c, 0.97), 3)
    rb = rail_sheet(k, W, 1.25, 'solid', 0xdcdad2)
    corridor(B, 0.3, 17.5, g, nu, fh, 4, rb, 1.4, dc=0x5a7a8a); corridor(B, 21.5, W - 4.2, g, nu, fh, 3, rb, 1.4, dc=0x5a7a8a, u0=3.0)
    B.wall()
    stair_tower(k, 17.5, -D, 4.0, 4.2, H + 3.4, mul(c, 0.96), fh=fh, seed=4)     # lift tower
    T = stair_tower(k, W - 4.0, -D, 3.7, 3.4, H + 0.6, mul(c, 0.96), fh=fh, seed=5)
    roof_kit(k, 0, -D, W, 0, H, 6, ant=True); frp_tank(k, 6.0, H, -7.0, 3.0, 2.0, 2.0)
    for i in range(5): bike(k, 24.0 + i * 0.55, -D - 2.4, 'z', ['dark', 'steel', 'tarp'][i % 3])


@K.piece('tokyo_apartment_e', style='apartment tower podium bayside', stone=0xc9d0d2, desc='bayside tower-mansion block: 3-storey glass and stone podium with shops and a planted deck, 15 residential floors ringed by glass-railed balconies, lit crown')
def apartment_e(k):
    k.litc = WARM + [0xf0f4ff, 0xf0f4ff]; k.lit = 0.5
    S = Signs(k, 12); PW, PD, PH = 34.0, 26.0, 12.0; c = C(0xcfd2d0)
    F, R, B, L = box4(k, 0, 0, PW, PD, PH, prio=(1.0, 0.8, 0.6, 0.8))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, PH, 'stone', 0xc4beb0, 1)
        if Fc is B:
            for i in range(int(Fc.w / 5)): s.rect(1.0 + i * 5, 0.6, 3.8, 3.0, 0x8f9496); s.hlines(1.0 + i * 5, 0.6, 3.8, 3.0, 0x5f6466, 0.25, 0.1); Fc.recess(1.0 + i * 5, 0.6, 3.8, 3.0, 0.2)
        else:
            n = int(Fc.w / 6.4); uw = Fc.w / n
            for i in range(n):
                kd = ['shop', 'cafe', 'lobby', 'konbini', 'shop', 'cafe'][(i + (0 if Fc is F else 2)) % 6]
                shop(Fc, S, i * uw + 0.5, uw - 1.0, 4.4, kd)
            for f in range(2):
                ribbon(Fc, 1.0, 5.4 + f * 3.3, Fc.w - 2.0, 2.0, 0.3, 0x5a5e62, pw=1.6, lit=0.6, run=4)
            s.rect(0, 4.5, Fc.w, 0.35, 0x9a968a); Fc.box(0, 4.5, Fc.w, 0.35, 0.5, faces='ftb')
        s.rect(0, PH - 0.4, Fc.w, 0.4, 0xa8a498)
        Fc.wall()
    flat_roof(k, 0, -PD, PW, 0, PH, 1.1, 0.3, seed=1, c=0x8f9a84, bulk=False, clutter=0.0)
    for i in range(5): pbox(k, [1.5 + i * 6.5, PH, -2.6], [3.5, 0, 0], [0, 0.8, 0], [0, 0, 1.2], 'green', (PR['green'][0], PR['green'][1] + 0.3, 0.6, 0.35))
    for i in range(3): pbox(k, [1.2, PH, -7 - i * 6.0], [1.2, 0, 0], [0, 0.8, 0], [0, 0, 3.5], 'green', (PR['green'][0], PR['green'][1] + 0.3, 0.6, 0.35)); pbox(k, [PW - 2.4, PH, -7 - i * 6.0], [1.2, 0, 0], [0, 0.8, 0], [0, 0, 3.5], 'green', (PR['green'][0], PR['green'][1] + 0.3, 0.6, 0.35))
    # tower
    TW, TD, fh, nf = 24.0, 18.0, 3.0, 15; x0 = 5.0; z1 = -4.0; H = nf * fh
    T = box4(k, x0, z1, TW, TD, H + 2.2, PH, prio=(1.0, 0.85, 0.85, 0.85))
    rs = rail_sheet(k, TW, 1.25, 'glass', 0xc8d4d8)
    for Fc in T:
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'panel', c, 3)
        s.rect(0, H + 0.2, Fc.w, 2.0, 0xa8b0b4); s.em.rect(0.3, H + 1.5, Fc.w - 0.6, 0.35, col(0xbfe4ff) * 0.95)     # crown light
        s.vlines(0.5, H + 0.2, Fc.w - 1.0, 1.2, 0x7a8286, 0.6, 0.12)
        unit_fronts(Fc, 0.6, Fc.w - 0.6, 0.0, nf, fh, 4 if Fc.w > 20 else 3, rs, 1.3, part=None, fut=0.0, acp=0.0, lit=0.5, cap=True)
        for xx in (0.0, Fc.w - 0.6): s.rect(xx, 0, 0.6, H, mul(c, 0.82)); Fc.box(xx, 0, 0.6, H, 1.35, faces='flr', lod=True)
        Fc.wall()
    y = PH + H
    flat_roof(k, x0, z1 - TD, x0 + TW, z1, y, 2.2, 0.3, seed=3, tank=False, bulk=False, clutter=0.5)
    bulkhead(k, x0 + 9.0, y, z1 - 12.0, 6.0, 3.6, 7.0); avi(k, x0 + 9.3, y + 3.6, z1 - 11.7); avi(k, x0 + 14.7, y + 3.6, z1 - 5.3)
