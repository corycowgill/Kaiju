# Tokyo kit: mid-rise (15-60 m): tiled ribbon-window office, ministry block, department store, glass-and-louvre office,
# business hotel. design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *
from kit_zakkyo import shop, TILES
from kit_towers import curtain, relief, lobby, crown, OFF
from kit_lowrise import torii

SASH = 0x8f8f8a


@K.piece('tokyo_midrise_a', style='midrise tile office', stone=0xcfc8b8, share=2, desc='1970s 9-storey cream-tile office: recessed ribbon windows under concrete sunshades on three sides, lobby and shop at the foot, rooftop tank, plant and billboard')
def midrise_a(k):
    k.litc = OFF; k.lit = 0.5
    S = Signs(k, 12); W, D, g, fh, nu = 22.0, 18.0, 4.3, 3.5, 8; H = g + nu * fh; c = C(0xd4cdbc)
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.1, prio=(1.0, 0.8, 0.7, 0.8))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'tile', c, 1); s.rect(0, 0, Fc.w, 0.5, mul(c, 0.7)); s.rect(0, H + 0.8, Fc.w, 0.3, mul(c, 0.75))
        for f in range(nu):
            y = g + f * fh
            if Fc is B:
                for i in range(int(Fc.w / 3.6)): win(Fc, 1.2 + i * 3.6, y + 1.0, 1.6, 1.5, 0.2, SASH, n=2, lit=0.45, box=mul(c, 0.7))
            else:
                ribbon(Fc, 0.9, y + 0.95, Fc.w - 1.8, 1.75, 0.3, 0x7a8086, pw=1.2, lit=0.3 + 0.5 * k.rng.random(), litc=pick(k, OFF), run=4)
                s.rect(0.7, y + 2.75, Fc.w - 1.4, 0.14, mul(c, 0.72)); Fc.box(0.7, y + 2.75, Fc.w - 1.4, 0.14, 0.6, faces='flrtb')
        Fc.box(0, H + 0.8, Fc.w, 0.3, 0.15, faces='ftb')
    shop(F, S, 0.6, 7.0, g - 0.2, 'lobby'); shop(F, S, 8.2, 6.0, g - 0.2, 'shop'); shop(F, S, 14.8, 6.6, g - 0.2, 'konbini')
    shop(R, S, 1.0, 6.0, g - 0.2, 'cafe'); shop(R, S, 11.5, 5.0, g - 0.2, 'garage')
    S.blade(F, W - 0.3, g + 0.6, 1.2, 4 * fh, glow=0.9)
    for Fc in (F, R, B, L): Fc.wall()
    ext_stair(B, 15.5, 4.2, 1.8, [0.12] + [g + i * fh for i in range(nu)], c=0x8f9496); ac(B, 2.0, 0.02, 0.05, 4)
    flat_roof(k, 0, -D, W, 0, H, 1.1, 0.3, seed=1, tank=True, clutter=0.8); bulkhead(k, 9.0, H, -D + 2.0, 5.0, 2.6, 5.0)
    S.roof_sign(3.0, 17.0, H, -1.0, h=3.6, legs=1.7, glow=0.9); antenna(k, 11.0, H + 2.6, -D + 4.0, 5.0)


@K.piece('tokyo_midrise_b', style='midrise ministry stone', stone=0xb8b2a4, desc='ministry-style 8-storey stone-and-concrete block: giant piers, deep punched windows, rusticated base, heavy cornice, columned entrance porch with steps and flagpoles')
def midrise_b(k):
    k.litc = [0xf4f6ff, 0xf0f6e8, 0xfff4e4]; k.lit = 0.42
    W, D, g, fh, nu, bay = 43.2, 27.0, 5.0, 3.8, 7, 3.6; H = g + nu * fh; c = C(0xbcb6a8)
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.6, prio=(1.0, 0.8, 0.6, 0.8))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'stone', c, 1); s.bricks(0, 0, Fc.w, g, mul(c, 0.86), mul(c, 0.6), 1.6, 0.55, 0.05, 0.05); s.rect(0, g - 0.3, Fc.w, 0.3, mul(c, 0.75))
        cornice_paint(s, 0, H, Fc.w, 1.0, c, 0.6); Fc.box(0, H, Fc.w, 1.0, 0.5, faces='ftb', lod=True)
        nb = int(round(Fc.w / bay)); bw = Fc.w / nb; rec = Fc is not B
        for i in range(nb):
            x = i * bw
            for f in range(nu): win(Fc, x + bw / 2 - 0.85, g + f * fh + 0.9, 1.7, 2.3, 0.45 if rec else 0.0, 0x5a5e5c, n=2, ny=2, lit=None, blind=0.4)
            win(Fc, x + bw / 2 - 0.85, 1.4, 1.7, 2.4, 0.4 if rec else 0.0, 0x5a5e5c, n=2, ny=2, lit=0.35)
            if rec: s.rect(x - 0.45, g, 0.9, H - g, mul(c, 1.04)); Fc.box(max(0.0, x - 0.45), g, 0.9 if x > 0 else 0.45, H - g, 0.3, faces='flr')
        if rec: Fc.box(Fc.w - 0.45, g, 0.45, H - g, 0.3, faces='flr'); Fc.box(0, g - 0.3, Fc.w, 0.3, 0.35, faces='ftb')
    # entrance porch
    s = F.s; px = W / 2 - 7.2; s.grad(px + 1.0, 0, 12.4, 4.2, C(0x26282a), C(0x3e4144)); s.em.grad(px + 3.0, 0, 8.4, 3.6, col(0xffe9c8) * 0.7, col(0xffe9c8) * 0.35); F.recess(px + 1.0, 0, 12.4, 4.2, 1.2)
    for Fc in (F, R, B, L): Fc.wall()
    ps = props(k); st = (PR['conc'][0], PR['conc'][1], 0.6, 0.5)
    for i in range(6): k.cyl(px + 1.2 + i * 2.4, 2.6, 0.42, 0.6, 5.2, 8, ps, st)
    k.box(px, 5.2, 0, px + 14.4, 6.4, 3.4, ps, (PR['conc'][0], PR['conc'][1], 3.0, 0.5), bottom=True, lod=1)
    for i in range(3): k.box(px - 0.6 + i * 0.4, 0, 0, px + 15.0 - i * 0.4, 0.2 * (i + 1), 4.6 - i * 0.5, ps, st, (PR['conc'][0], PR['conc'][1], 3.0, 0.5))
    for xx in (px - 2.5, px + 16.9): k.bar([xx, 0, 3.0], [xx, 11.0, 3.0], 0.12, ps, PR['steel']); k.box(xx + 0.06, 9.4, 2.98, xx + 2.0, 10.7, 3.02, ps, PR['white'], PR['white'], sides='fb')
    flat_roof(k, 0, -D, W, 0, H + 0.6, 1.0, 0.4, seed=2, tank=False, clutter=0.6); bulkhead(k, 18.0, H + 0.6, -D + 6.0, 7.0, 2.6, 8.0); antenna(k, 21.5, H + 3.2, -D + 10.0, 9.0)
    for i in range(4): plant(k, 6.0 + i * 9.0, H + 0.6, -8.0, 4.0, 1.8, 2.6)


@K.piece('tokyo_midrise_c', style='midrise department store', stone=0xe0dccf, desc='department-store block: lit show-window band and canopy at the street, blank pale upper facade with fins and hanging banners, rooftop garden with a little shrine, beer-garden lanterns, tanks and lift towers')
def midrise_c(k):
    k.litc = [0xfff4e0, 0xffe9c8]; k.lit = 0.9
    S = Signs(k, 12); W, D, g, H = 38.0, 32.0, 5.2, 33.0; c = C(0xe2ddd0); ps = props(k)
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.4, prio=(1.0, 0.9, 0.5, 0.7))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'bigtile' if Fc is not B else 'panel', c, 1); s.rect(0, H + 1.0, Fc.w, 0.4, mul(c, 0.8))
        if Fc is B:
            for f in range(7): ribbon(Fc, 2.0, g + 1.5 + f * 3.9, Fc.w - 4.0, 1.4, 0.2, 0x7a8086, pw=1.5, lit=0.35, litc=0xf0f6e8, run=3)
            s.rollup(4.0, 0, 5.0, 4.2, 0xa8aeb0); Fc.recess(4.0, 0, 5.0, 4.2, 0.3); s.rollup(12.0, 0, 5.0, 4.2, 0xa8aeb0); Fc.recess(12.0, 0, 5.0, 4.2, 0.3)
        else:
            n = int(Fc.w / 6.3); uw = Fc.w / n
            for i in range(n): shop(Fc, S, i * uw + 0.5, uw - 1.0, g, 'lobby' if i == n // 2 else 'shop' if False else 'cafe', hf=0.9, fascia=False)
            s.rect(0, g, Fc.w, 0.5, 0x8a8478); Fc.box(0, g, Fc.w, 0.5, 2.2, faces='flrtb', lod=True); s.em.rect(0, g - 0.25, Fc.w, 0.2, col(0xfff0d0) * 0.8)
            nf = int(Fc.w / 2.4)
            for i in range(nf + 1): x = min(Fc.w - 0.3, i * Fc.w / nf); s.rect(x, g + 1.5, 0.3, H - g - 2.5, mul(c, 0.9)); Fc.box(x, g + 1.5, 0.3, H - g - 2.5, 0.45, faces='flr')
            for f in range(2): ribbon(Fc, 3.0, g + 2.0 + f * 16.0 + 6.0, Fc.w - 6.0, 1.3, 0.25, 0x6a7074, pw=1.2, lit=0.8, run=3)
            for i in range(3 if Fc is F else 2): S.board(Fc, Fc.w * (0.2 + 0.3 * i) - 1.2, g + 3.5, 2.4, 13.0, 0.55, glow=0.85)
            Fc.box(0, H + 1.0, Fc.w, 0.4, 0.3, faces='ftb')
        Fc.wall()
    S.board(F, W - 9.0, H - 4.5, 7.0, 3.2, 0.3, glow=0.95, bg=0xc0201e)
    flat_roof(k, 0, -D, W, 0, H, 1.4, 0.35, seed=3, c=0x8f9a84, bulk=False, tank=False, clutter=0.3)
    bulkhead(k, 3.0, H, -D + 2.0, 6.0, 2.6, 7.0); bulkhead(k, 26.0, H, -D + 2.0, 7.0, 2.6, 6.0); frp_tank(k, 12.0, H, -D + 3.0, 4.0, 2.4, 3.0); frp_tank(k, 18.0, H, -D + 3.0, 4.0, 2.4, 3.0)
    gr = (PR['green'][0], PR['green'][1] + 0.3, 0.6, 0.35)
    for i in range(6): pbox(k, [2.0 + i * 6.0, H, -3.5], [3.6, 0, 0], [0, 0.8, 0], [0, 0, 1.4], 'green', gr)
    for i in range(3): pbox(k, [2.0, H, -8.0 - i * 5.0], [1.4, 0, 0], [0, 1.6, 0], [0, 0, 3.0], 'green', gr)
    # roof shrine + beer garden
    ts = roof_sheet_tile(k, 4.0, 2.2, 0x3e7a5a, 'metal', 0.6)
    k.box(8.0, H, -12.5, 10.4, H + 2.0, -10.5, ps, PR['verm'], PR['verm']); gable_roof(k, 7.8, 10.6, -12.7, -10.3, H + 2.0, 0.9, ts, 'x', 0.4, 0.2, lod=1); torii(k, 8.0, -8.2, 2.4, 2.8) if False else None
    for px in (8.0, 10.4): k.cyl(px, -8.2, 0.13, H, H + 2.8, 6, ps, PR['verm'])
    k.box(7.5, H + 2.8, -8.35, 10.9, H + 3.05, -8.05, ps, PR['verm'], PR['dark'], bottom=True); k.box(7.8, H + 2.2, -8.3, 10.6, H + 2.4, -8.1, ps, PR['verm'], PR['verm'], bottom=True)
    for i in range(4):
        for j in range(2): k.bar([20.0 + i * 5.0, H, -8.0 - j * 9.0], [20.0 + i * 5.0, H + 3.2, -8.0 - j * 9.0], 0.12, ps, PR['steel'])
    for j in range(3):
        k.bar([20.0, H + 3.2, -8.0 - j * 4.5], [35.0, H + 3.2, -8.0 - j * 4.5], 0.06, ps, PR['dark'])
        for i in range(10): lantern(k, V(20.7 + i * 1.5, H + 2.65, -8.0 - j * 4.5), 0.18, 0.45, 'lan_r' if (i + j) % 2 else 'lan_w')
    for i in range(4): pbox(k, [21.5 + i * 3.4, H, -11.5], [2.0, 0, 0], [0, 0.75, 0], [0, 0, 0.9], 'wood', 'wood'); pbox(k, [21.5 + i * 3.4, H, -15.0], [2.0, 0, 0], [0, 0.75, 0], [0, 0, 0.9], 'wood', 'wood')
    S.roof_sign(10.0, 28.0, H, -1.2, h=4.0, legs=2.0, glow=0.95)


@K.piece('tokyo_midrise_d', style='midrise glass louvre office', stone=0x9aa8ac, desc='modern 12-storey glass office: curtain wall behind horizontal louvre blades and slim vertical fins, double-height lit lobby, roof screen')
def midrise_d(k):
    W, D, g, fh, bay, nfl = 26.0, 22.0, 6.5, 4.0, 1.6, 11
    y = lobby(k, 0, W, -D, 0, g, 0x8f9498, bay=4.3, seed=4)
    def rel(Fm, m, sd, j):
        if sd == 'b': return relief(fh, bay, fins=0.3, every=2)(Fm, m, sd, j)
        for f in range(m):
            for hh in (1.0, 2.0, 3.0): Fm.box(0.2, f * fh + hh, Fm.w - 0.4, 0.12, 0.7, faces='flrtb')
        for i in range(0, int(Fm.w / 5.2) + 1): Fm.box(min(Fm.w - 0.3, i * 5.2), 0, 0.3, m * fh, 0.85, faces='flr')
    def paint(s, w, H, var):
        curtain(0x47606a, 0x354a52, 0x9aa8ac, bay, fh, 0.55, OFF, hi=0x94b8c4)(s, w, H, var)
        for f in range(int(round(H / fh))):
            for hh in (1.0, 2.0, 3.0): s.rect(0, f * fh + hh, w, 0.12, 0xb8c0c2); s.vshade(0, f * fh + hh - 0.3, w, 0.3, 1.0, 0.8); s.em.rect(0, f * fh + hh, w, 0.12, 0x000000)
    y = stack(k, 0, W, -D, 0, y, nfl, fh, 4, paint, rel, nv=3)
    rs = roof_plan(k, W, D, None, 4); deck(k, rs, 0, W, -D, 0, y, par=1.2)
    yc = crown(k, 0, W, -D, 0, y, 3.6, 0xa8b0b4, None, inset=2.5); plant(k, 3.0, y, -1.9 - 0.3, 0.1, 0.1, 0.1) if False else None
    for i in range(3): plant(k, 5.0 + i * 5.5, yc, -D + 5.0, 4.0, 1.6, 3.0)
    antenna(k, W / 2, yc, -D / 2, 5.0)


@K.piece('tokyo_midrise_e', style='midrise hotel business', stone=0xcbbda4, desc='14-storey business hotel: beige tile, a grid of small deep-set windows with warm scattered lights, lit lobby, a full-height vertical sign and rooftop sign')
def midrise_e(k):
    k.litc = WARM; k.lit = 0.5
    S = Signs(k, 9); W, D, g, fh, nu = 17.0, 14.0, 4.2, 3.0, 13; H = g + nu * fh; c = C(0xcdbfa6)
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.2, prio=(1.0, 0.8, 0.8, 0.6))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'tile', c, 1); s.rect(0, 0, Fc.w, 0.5, mul(c, 0.7)); s.rect(0, H + 0.9, Fc.w, 0.3, mul(c, 0.75)); s.rect(0, g - 0.2, Fc.w, 0.2, mul(c, 0.75))
        if Fc is L:
            for f in range(nu): win(Fc, D * 0.5 - 0.5, g + f * fh + 1.0, 1.0, 1.3, 0.2, SASH, n=1, lit=0.35)
        else:
            nb = int((Fc.w - 2.4 if Fc is F else Fc.w) / 2.5); bw = (Fc.w - (2.4 if Fc is F else 0)) / nb
            for f in range(nu):
                for i in range(nb): win(Fc, i * bw + bw / 2 - 0.55, g + f * fh + 0.95, 1.1, 1.45, 0.28, 0x6a6e70, n=1, lit=0.5, blind=0.0 if k.rng.random() < 0.6 else 1.0)
            for i in range(nb + 1): x = max(0.0, min(Fc.w - 0.25, i * bw - 0.12)); Fc.box(x, g, 0.25, H - g, 0.12, faces='flr')
    shop(F, S, 0.5, 9.0, g - 0.3, 'lobby'); shop(F, S, 10.0, 6.4, g - 0.3, 'cafe'); shop(R, S, 1.0, 5.0, g - 0.3, 'garage')
    S.blade(F, W - 1.2, g + 1.0, 1.5, 9 * fh, t=0.4, glow=0.95, bg=0x1f5fd0)
    for Fc in (F, R, B, L): Fc.wall()
    ext_stair(B, 0.6, 3.6, 1.7, [0.12] + [g + i * fh for i in range(nu)], c=0xa09a8c)
    ac(B, 6.0, 0.02, 0.05, 4)
    flat_roof(k, 0, -D, W, 0, H, 1.2, 0.3, seed=5, tank=True, clutter=0.7)
    S.roof_sign(2.0, 15.0, H, -0.9, h=3.0, legs=1.8, glow=0.95, bg=0x1f5fd0); antenna(k, 4.0, H + 2.6, -D + 3.5, 4.0)
