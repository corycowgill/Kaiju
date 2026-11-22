# Tokyo kit: houses (low; 6-11 m): detached 2-storey rows, machiya / kanban-kenchiku, narrow modern houses,
# corner tobacco shop-house, old wooden houses behind a tiled wall. design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *
from kit_zakkyo import shop

SASH = 0x8f8f8a


def tall_sheet(k, Fc, extra, prio=0.8):
    Fc.s = k.sheet(Fc.w, Fc.h + extra, prio, 'gable'); return Fc.s


def shutterbox(Fc, x, y, h, c, w=0.55):
    Fc.s.rect(x, y, w, h, c); Fc.s.vlines(x, y, w, h, mul(c, 0.85), 0.14, 0.02); Fc.box(x, y, w, h, 0.1, faces='flrtb')


def hood(Fc, x, y, w, d=0.45, c=0x6a6a6a):
    Fc.s.rect(x, y, w, 0.08, c); Fc.box(x, y, w, 0.08, d, faces='flrtb'); Fc.s.vshade(x, y - 0.35, w, 0.35, 1.0, 0.8)


def carport(k, x0, x1, z0, z1, y=2.3):
    ps = props(k); st = PR['steel']
    for px in (x0 + 0.1, x1 - 0.1):
        k.bar([px, 0, z0 + 0.3], [px, y, z0 + 0.3], 0.1, ps, st); k.bar([px, y, z0 + 0.3], [px, y + 0.15, z1], 0.08, ps, st)
    k.box(x0 - 0.1, y + 0.1, z0, x1 + 0.1, y + 0.18, z1 + 0.2, ps, PR['white'], PR['top'], bottom=True)


def car(k, x, z, c=0, L=3.9, w=1.6):
    """A parked kei-car as three boxes (nose toward +Z). Painted from the prop sheet's futon / steel swatches."""
    key = 'futon%d' % (c % 3); ps = props(k)
    k.box(x, 0.25, z - L, x + w, 0.95, z, ps, PR[key], PR[key], bottom=True)
    k.box(x + 0.08, 0.95, z - L + 0.2, x + w - 0.08, 1.55, z - 0.9, ps, PR['dark'], PR[key])
    for zz in (z - 0.9, z - L + 0.5):
        k.box(x - 0.02, 0.0, zz - 0.3, x + w + 0.02, 0.5, zz + 0.3, ps, PR['dark'], PR['dark'], sides='lr')


def house(k, x0, W, D, zf=-2.2, nfl=2, fh=2.75, c=0xe6dcc8, mat='stucco', c2=None, mat2=None, roof='hip', ts=None, rise=1.9, seed=0, door='l',
          balc='solid', yard=True, port=True, ov=0.55, carc=0, bc=0xd8d4c8):
    """A detached house: front wall at z = zf (the yard / carport in front reaches z = 0)."""
    rng = k.rng; H = nfl * fh + 0.25
    F, R, B, L = box4(k, x0, zf, W, D, H, prio=(1.0, 0.75, 0.75, 0.75))
    c = col(c); c2 = c if c2 is None else col(c2); mat2 = mat2 or mat
    if roof == 'gable_x': tall_sheet(k, R, rise); tall_sheet(k, L, rise)
    if roof == 'gable_z': tall_sheet(k, F, rise, 1.0); tall_sheet(k, B, rise)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, fh, mat, c, seed); wallmat(s, 0, fh, Fc.w, s.h - fh, mat2, c2, seed + 1)
        s.rect(0, 0, Fc.w, 0.35, 0x8f8d88); s.rect(0, fh - 0.06, Fc.w, 0.12, mul(c2, 0.82)); s.vshade(0, H - 0.5, Fc.w, 0.5, 1.0, 0.78)
    s = F.s; tr = mul(c, 0.7)
    # front: door, living-room window, balcony
    dx = 0.5 if door == 'l' else W - 1.5; wx = W - 2.65 if door == 'l' else 0.6
    s.door(dx, 0.2, 0.95, 2.1, pick(k, [0x5a3a2a, 0x3a4048, 0x6a4a30, 0x2e3a34]), 0x9a968c, glass=False); s.rect(dx + 0.3, 0.9, 0.12, 1.1, 0xd0c8a8); s.em.rect(dx + 0.3, 0.9, 0.12, 1.1, col(0xffd9a0) * 0.8)
    F.recess(dx - 0.15, 0.2, 1.25, 2.15, 0.35); s.rect(dx - 0.35, 0, 1.65, 0.2, 0x9a968e); F.box(dx - 0.35, 0, 1.65, 0.2, 0.5, faces='flrt')
    hood(F, dx - 0.35, 2.42, 1.65, 0.7, mul(c, 0.6))
    s.rect(dx + 1.1 if door == 'l' else dx - 0.35, 1.5, 0.22, 0.3, 0xe8e0c8); s.em.rect(dx + 1.1 if door == 'l' else dx - 0.35, 1.5, 0.22, 0.3, col(0xffe2b0) * 0.9)   # porch light
    win(F, wx, 0.4, 1.75, 1.85, 0.1, SASH, n=2, lit=0.65, box=tr); shutterbox(F, wx + 1.78 if door == 'l' else wx - 0.58, 0.4, 1.85, mul(c, 0.86))
    y2 = fh + 0.1
    if balc:
        bw = min(3.3, W - 1.9); bx = W - bw - 0.25 if door == 'l' else 0.25
        win(F, bx + 0.5, y2, 1.75, 1.95, 0.08, SASH, n=2, lit=0.6)
        rs = rail_sheet(k, bw, 1.2, balc, bc, prio=0.9)
        balcony(F, bx, y2, bw, 0.95, 1.05, 0.15, rs)
        if rng.random() < 0.6: futon(F, bx + 0.3 + rng.random() * (bw - 1.9), y2 + 1.05, 0.95, int(rng.random() * 3))
        ac(F, bx + bw - 1.0, y2 + 0.02, 0.06)
        win(F, dx + (0.0 if door == 'l' else 0.05), y2 + 0.9, 0.9, 1.0, 0.1, SASH, n=2, lit=0.5, box=tr); hood(F, dx - 0.1, y2 + 1.95, 1.1, 0.3, mul(c2, 0.6))
    else:
        for xx in (0.7, W - 2.1): win(F, xx, y2 + 0.75, 1.4, 1.2, 0.1, SASH, n=2, lit=0.55, box=tr); hood(F, xx - 0.1, y2 + 1.98, 1.6, 0.3, mul(c2, 0.6))
    if nfl > 2: win(F, W * 0.5 - 0.8, 2 * fh + 0.9, 1.6, 1.1, 0.1, SASH, n=2, lit=0.5)
    F.wall(top=[(W / 2, H + rise)] if roof == 'gable_z' else None)
    # sides + rear
    for Fc in (R, L, B):
        s = Fc.s
        for f in range(nfl):
            n = 2 if Fc.w > 5 else 1
            for j in range(n):
                if rng.random() < 0.2: continue
                ww = pick(k, [0.8, 1.2, 1.5]); hh = pick(k, [0.6, 1.0, 1.1]); xx = Fc.w * (j + 0.5) / n - ww / 2 + (rng.random() - 0.5) * 0.8
                win(Fc, xx, f * fh + (2.0 - hh), ww, hh, 0.09, SASH, n=1 if ww < 1 else 2, lit=0.5, box=tr)
        if Fc is B:
            s.door(0.5, 0.2, 0.8, 2.0, 0x8a8f90, 0x9a968c, glass=True)
            ac(B, 1.7, 0.02, 0.05); pbox(k, B.P(3.0, 0, 0.05), B.r * 0.5, UP * 1.6, B.n * 0.35, 'white', 'top', sides='flr')
        else:
            downpipe(s, Fc.w - 0.25, 0, H - 0.3)
            if rng.random() < 0.7: ac(Fc, Fc.w * 0.3, 0.02, 0.05)
        Fc.wall(top=[(Fc.w / 2, H + rise)] if (roof == 'gable_x' and Fc is not B) or (roof == 'gable_z' and Fc is B) else None)
    # roof
    if roof == 'hip': hip_roof(k, x0, x0 + W, zf - D, zf, H, rise, ts, ov)
    elif roof == 'gable_x': gable_roof(k, x0, x0 + W, zf - D, zf, H, rise, ts, 'x', ov, 0.35)
    elif roof == 'gable_z': gable_roof(k, x0, x0 + W, zf - D, zf, H, rise, ts, 'z', ov, 0.35)
    else:
        flat_roof(k, x0, zf - D, x0 + W, zf, H, 0.35, 0.18, seed=seed, bulk=False, clutter=0.0)
    for Fc in ((F, B) if roof != 'gable_z' else (R, L)): gutter(Fc, H - 0.1 if roof == 'hip' else H - 0.25, ov)
    if roof != 'flat': tv_antenna(k, x0 + W * 0.7, H + rise * 0.8, zf - D * 0.5)
    if balc:
        for hh in (1.75, 2.0): k.bar(F.P(bx + 0.1, y2 + hh, 0.75), F.P(bx + bw - 0.1, y2 + hh, 0.75), 0.04, props(k), PR['steel'])
        for xx in (bx + 0.1, bx + bw - 0.1): k.bar(F.P(xx, y2 + 1.0, 0.9), F.P(xx, y2 + 2.0, 0.75), 0.04, props(k), PR['steel'])
    # yard
    if yard:
        px0, px1 = (x0 + 2.3, x0 + W - 0.2) if door == 'l' else (x0 + 0.2, x0 + W - 2.3)
        if port and -zf > 2.0:
            carport(k, px0, px1, zf + 0.05, -0.2); car(k, (px0 + px1) / 2 - 0.8, -0.35 if -zf > 4.2 else zf + 4.0 - 0.1, carc, L=min(3.6, -zf - 0.5)) if -zf > 3.9 else None
        gx0, gx1 = (x0, x0 + 2.2) if door == 'l' else (x0 + W - 2.2, x0 + W)
        blockwall(k, gx0 + (0.0 if door == 'l' else 1.2), -0.1, gx1 - (1.2 if door == 'l' else 0.0), -0.1, 1.15)
        planter(k, gx0 + (1.25 if door == 'l' else 0.3), -0.75, 0.6, 0.45, 0.8)
        for px in ((gx1 - 1.2, gx1 - 0.2) if door == 'l' else (gx0 + 0.2, gx0 + 1.2)): k.box(px - 0.13, 0, -0.23, px + 0.13, 1.35, 0.03, props(k), (PR['block'][0], PR['block'][1], 0.26, 0.6), PR['top'])
        bike(k, x0 + (0.3 if door == 'r' else W - 1.9), zf + 0.25, 'x', pick(k, ['dark', 'steel', 'tarp']))
        pots(k, gx0 + 0.2, zf + 0.15, 3, 'x', seed)
    return H


@K.piece('tokyo_house_a', style='house detached', stone=0xe0d6c4, share=2, desc='row of three 2-storey detached houses: tiled hip and gable roofs, balconies with futons and AC units, carports, block garden walls')
def house_a(k):
    k.litc = WARM; k.lit = 0.5
    t1 = roof_sheet_tile(k, 9.0, 5.6, 0x474b54, 'kawara'); t2 = roof_sheet_tile(k, 9.0, 5.6, 0x6a4a3c, 'slate')
    house(k, 0.0, 6.6, 8.2, zf=-4.3, c=0xe6dcc8, roof='hip', ts=t1, seed=1, door='l', balc='solid', carc=0)
    house(k, 7.5, 6.9, 8.6, zf=-4.0, c=0xb9b6ae, mat='siding', c2=0xdcd8d0, roof='gable_x', ts=t2, rise=2.1, seed=2, door='r', balc='slat', bc=0x8a8880, carc=1)
    house(k, 15.3, 6.5, 8.0, zf=-4.4, c=0xd9c9a8, c2=0xeee6d2, roof='hip', ts=t1, seed=3, door='l', balc='bars', bc=0xb8b8b4, carc=2, rise=1.7)
    pole(k, 7.05, -0.25)


@K.piece('tokyo_house_b', style='house machiya shop', stone=0x5a4636, desc='shop-house pair: dark-timber machiya with a tiled pent roof, lattice front, noren and lanterns beside a copper-clad kanban-kenchiku false-front shop')
def house_b(k):
    k.litc = WARM; k.lit = 0.55
    S = Signs(k, 8, 5); ts = roof_sheet_tile(k, 7.0, 4.6, 0x44484f, 'kawara')
    # machiya
    W, D, g, H, rise = 5.8, 11.0, 2.9, 5.6, 1.8
    F, R, B, L = box4(k, 0, 0, W, D, H, prio=(1.0, 0.6, 0.6, 0.6)); tall_sheet(k, R, rise, 0.6); tall_sheet(k, L, rise, 0.6)
    wood = C(0x3e2c20); pl = C(0xe4dcc8)
    s = F.s; s.rect(0, 0, W, H, wood); wallmat(s, 0, g + 0.7, W, H - g - 0.7, 'stucco', pl, 1)
    for xx in (0, W - 0.18, W * 0.5 - 0.09): s.rect(xx, 0, 0.18, H, mul(wood, 1.15))
    s.rect(0, H - 0.3, W, 0.3, mul(wood, 1.1))
    shop(F, S, 0.1, W - 0.2, g + 0.2, 'izakaya', hf=0.5, fascia=False)
    for (wx, ww) in ((0.5, W * 0.5 - 0.8), (W * 0.5 + 0.3, W * 0.5 - 0.8)):
        on = k.rng.random() < 0.7; s.rect(wx, g + 1.1, ww, 1.1, 0xd8cca8)
        if on: s.em.grad(wx, g + 1.1, ww, 1.1, col(0xffc880) * 0.6, col(0xffc880) * 0.9)
        s.vlines(wx, g + 1.1, ww, 1.1, wood, 0.1, 0.045); s.em.vlines(wx, g + 1.1, ww, 1.1, 0x000000, 0.1, 0.045); F.recess(wx, g + 1.1, ww, 1.1, 0.12)
    F.wall()
    # pent roof over the shop front
    slope(k, (-0.2, g + 0.05, 1.0), (W + 0.2, g + 0.05, 1.0), (W + 0.2, g + 0.6, 0), (-0.2, g + 0.6, 0), ts, lod=1)
    k.emit([V(-0.2, g - 0.05, 1.0), V(W + 0.2, g - 0.05, 1.0), V(W + 0.2, g + 0.5, 0), V(-0.2, g + 0.5, 0)], ts, [(0, 0), (0.3, 0), (0.3, 0.06), (0, 0.06)], V(0, -1, 0.5), 1)
    for xx in (-0.2, W + 0.2): k.emit([V(xx, g - 0.05, 1.0), V(xx, g + 0.05, 1.0), V(xx, g + 0.6, 0), V(xx, g + 0.5, 0)], ts, [(0, 0), (0.3, 0), (0.3, 0.06), (0, 0.06)], V(1 if xx > 0 else -1, 0, 0), 1)
    for Fc in (R, L, B):
        ss = Fc.s; wallmat(ss, 0, 0, Fc.w, ss.h, 'wood', wood, 2); wallmat(ss, 0, H - 0.2, Fc.w, ss.h - H + 0.2, 'stucco', pl, 3) if Fc is not B else None
        for f in range(2):
            if k.rng.random() < 0.8: win(Fc, Fc.w * (0.3 + 0.35 * f), f * 2.8 + 1.0, 1.0, 1.0, 0.1, 0x6a5a48, n=2, lit=0.5)
        Fc.wall(top=[(Fc.w / 2, H + rise)] if Fc is not B else None)
    ac(B, 1.0, 0.02, 0.05); gutter(F, H - 0.3, 0.7, c='dark'); gutter(B, H - 0.3, 0.7, c='dark')
    gable_roof(k, 0, W, -D, 0, H, rise, ts, 'x', 0.7, 0.25)
    ps = props(k); wd = PR['wood']
    for xx in (-0.25, W + 0.25): k.box(xx - 0.2, H + rise - 0.1, -D / 2 - 0.2, xx + 0.2, H + rise + 0.45, -D / 2 + 0.2, ts, (0.5, ts.h - 0.2, 0.4, 0.18))     # onigawara
    for i in range(7): k.bar(F.P(0.25 + i * (W - 0.5) / 6, g + 0.45, 0.0), F.P(0.25 + i * (W - 0.5) / 6, g, 0.95), 0.07, ps, wd)     # pent-roof rafters
    for xx in (0.5, W * 0.5 + 0.3):     # upper lattice boxes (degoshi)
        k.boxpts(F.P(xx - 0.08, g + 1.0, 0), F.r * (W * 0.5 - 0.64), UP * 0.08, F.n * 0.16, ps, wd, wd, sides='flr', bottom=True); k.boxpts(F.P(xx - 0.08, g + 2.2, 0), F.r * (W * 0.5 - 0.64), UP * 0.08, F.n * 0.16, ps, wd, wd, sides='flr', bottom=True)
    pots(k, 0.3, 0.1, 4, 'x', 1); bike(k, 3.9, 0.45, 'x', 'steel'); pole(k, W + 0.05, 0.9, lamp=V(0, 0, 1))
    # kanban-kenchiku
    x0 = W + 0.1; W2, D2, H2, He = 5.5, 10.5, 8.2, 6.4
    F2 = k.facade((x0, 0, 0), (1, 0, 0), W2, H2, name='kanban'); tall_sheet(k, F2, 0.8, 1.0)
    cu = C(0x5f9080); s = F2.s; wallmat(s, 0, 0, W2, H2 + 0.8, 'copper', cu, 4)
    g2 = 3.1; shop(F2, S, 0.15, W2 - 0.3, g2, 'shop')
    for (yy, hh) in ((g2 + 0.05, 0.3), (H2 - 0.75, 0.3)):
        s.grad(0, yy, W2, hh, mul(cu, 0.75), mul(cu, 1.1)); F2.box(0, yy, W2, hh, 0.14, faces='flrtb')
    for i in range(3):
        wx = 0.55 + i * (W2 - 1.1 - 1.1) / 2; win(F2, wx, g2 + 1.1, 1.1, 1.75, 0.15, 0xe6e0d0, n=2, ny=2, lit=0.55, trim=mul(cu, 1.25), tw=0.12)
        s.rect(wx - 0.15, g2 + 0.9, 1.4, 0.14, mul(cu, 0.7)); F2.box(wx - 0.15, g2 + 0.9, 1.4, 0.14, 0.12, faces='flrtb')
    s.ellipse(W2 / 2, H2 + 0.3, 0.3, 0.3, mul(cu, 0.65))
    for xx in (0.0, W2 - 0.4): s.rect(xx, g2 + 0.35, 0.4, H2 - g2 - 1.1, mul(cu, 0.9)); F2.box(xx, g2 + 0.35, 0.4, H2 - g2 - 1.1, 0.1, faces='flr')
    for i in range(10):     # dentils under the top cornice
        dx_ = 0.5 + i * (W2 - 1.0 - 0.22) / 9; s.rect(dx_, H2 - 1.0, 0.22, 0.25, mul(cu, 1.15)); F2.box(dx_, H2 - 1.0, 0.22, 0.25, 0.1, faces='flrb')
    F2.wall(top=[(W2 * 0.2, H2), (W2 * 0.2, H2 + 0.75), (W2 * 0.8, H2 + 0.75), (W2 * 0.8, H2)])
    P = F2.P; e = 0.05     # back + top of the false front
    F2.face([P(0, He - 0.5, -0.25), P(W2, He - 0.5, -0.25), P(W2, H2, -0.25), P(0, H2, -0.25)], [(0, He - 0.5), (W2, He - 0.5), (W2, H2), (0, H2)], -F2.n, 1)
    F2.face([P(W2 * 0.2, H2, -0.25), P(W2 * 0.8, H2, -0.25), P(W2 * 0.8, H2 + 0.75, -0.25), P(W2 * 0.2, H2 + 0.75, -0.25)], [(W2 * 0.2, H2), (W2 * 0.8, H2), (W2 * 0.8, H2 + 0.75), (W2 * 0.2, H2 + 0.75)], -F2.n, 1)
    for (xa, xb, yy) in ((0, W2 * 0.2, H2), (W2 * 0.2, W2 * 0.8, H2 + 0.75), (W2 * 0.8, W2, H2)):
        F2.face([P(xa, yy, 0), P(xb, yy, 0), P(xb, yy, -0.25), P(xa, yy, -0.25)], [(xa, yy - e), (xb, yy - e), (xb, yy), (xa, yy)], UP, 1)
    for xx, sg in ((0, -1), (W2, 1)): F2.face([P(xx, He - 0.5, 0), P(xx, He - 0.5, -0.25), P(xx, H2, -0.25), P(xx, H2, 0)], [(xx, He), (xx - sg * e, He), (xx - sg * e, H2), (xx, H2)], F2.r * sg, 1)
    mo = C(0xa9a59a)
    R2 = k.facade((x0 + W2, 0, 0), (0, 0, -1), D2, He, prio=0.6); B2 = k.facade((x0 + W2, 0, -D2), (-1, 0, 0), W2, He, prio=0.6); L2 = k.facade((x0, 0, -D2), (0, 0, 1), D2, He, prio=0.5)
    tall_sheet(k, B2, 1.2, 0.6)
    for Fc in (R2, B2, L2):
        wallmat(Fc.s, 0, 0, Fc.w, Fc.s.h, 'stucco', mo, 5); Fc.s.rect(0, 0, Fc.w, 0.35, mul(mo, 0.75))
        for f in range(2):
            if Fc is not L2: win(Fc, Fc.w * (0.25 + 0.4 * f), f * 3.1 + 1.1, 1.0, 1.2, 0.1, 0xd8d4c8, n=2, lit=0.5)
        Fc.wall(top=[(W2 / 2, He + 1.2)] if Fc is B2 else None)
    ac(R2, D2 * 0.6, 0.02, 0.05); ac(B2, 1.0, 3.3, 0.0); ac(R2, D2 * 0.3, 3.4, 0.0); gutter(R2, He - 0.15, 0.25); pots(k, x0 + W2 + 0.1, -4.0, 3, 'z', 2); bike(k, x0 + W2 + 0.25, -7.5, 'z')
    for i in range(3): k.bar(F2.P(0.4 + i * (W2 - 0.8) / 2, 2.6, 0.02), F2.P(0.4 + i * (W2 - 0.8) / 2, 2.05, 0.95), 0.05, props(k), PR['dark'])
    vent(k, x0 + W2 * 0.5, He + 0.9, -D2 * 0.5, 0.25, 0.9)
    tm = roof_sheet_tile(k, 11.2, 3.4, 0x6f7a80, 'metal', 0.6)
    gable_roof(k, x0, x0 + W2, -D2, -0.25, He, 1.2, tm, 'z', 0.25, 0.2)
    lantern(k, F2.P(W2 - 0.5, 2.0, 0.5), 0.2, 0.5, 'lan_w')


def modern(k, x0, W, D, c, mat, c2, seed, garage='l', deck=True, zf=-0.8, rail='glass'):
    """Narrow 3-storey modern house with a built-in garage and a roof deck."""
    rng = k.rng; fh = 2.8; H = 3 * fh + 0.3
    F, R, B, L = box4(k, x0, zf, W, D, H + 0.9, prio=(1.0, 0.65, 0.65, 0.65)); c = col(c); c2 = col(c2)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, H + 0.9, mat, c, seed); s.rect(0, 0, Fc.w, 0.3, 0x8a8a88); s.rect(0, H + 0.78, Fc.w, 0.12, mul(c, 0.7))
    s = F.s; gw = 2.7; gx = 0.25 if garage == 'l' else W - gw - 0.25; dx = W - 1.35 if garage == 'l' else 0.4
    s.grad(gx, 0, gw, 2.25, C(0x1e2024), C(0x33363a)); F.recess(gx, 0, gw, 2.25, 1.6)
    s.em.rect(gx + gw * 0.3, 2.0, gw * 0.4, 0.12, col(0xfff0d0) * 0.5)
    s.door(dx, 0.15, 0.95, 2.15, pick(k, [0x4a3a30, 0x2a3038, 0x7a5a3a]), 0x55585c, glass=False); s.rect(dx + 0.65, 0.4, 0.14, 1.7, 0xc8d0d0); s.em.rect(dx + 0.65, 0.4, 0.14, 1.7, col(0xffe2b8) * 0.8)
    F.recess(dx - 0.1, 0.15, 1.15, 2.2, 0.3)
    wallmat(s, 0.15, fh + 0.05, W - 0.3, fh - 0.15, 'panel' if mat != 'panel' else 'stucco', c2, seed + 2)
    bw = W - 0.5; rs = rail_sheet(k, bw, 1.2, rail, 0xc8ccd0, prio=0.9)
    win(F, 0.6, fh + 0.15, min(2.6, W - 1.8), 2.05, 0.1, 0x4a4e52, n=2, lit=0.65, blind=0.2); balcony(F, 0.25, fh + 0.1, bw, 0.8, 1.05, 0.12, rs)
    win(F, W - 1.0, fh + 0.9, 0.5, 1.3, 0.1, 0x4a4e52, n=1, lit=0.5)
    for (wx, ww, wy, wh) in ((0.5, 0.55, 2 * fh + 0.5, 1.9), (1.5, min(2.2, W - 2.4), 2 * fh + 0.9, 1.2)):
        win(F, wx, wy, ww, wh, 0.12, 0x4a4e52, n=1 if ww < 1 else 2, lit=0.55, blind=0.3)
    ac(F, W - 1.1, fh + 0.12, 0.06)
    s.rect(0.2, 2 * fh + 0.3, W - 0.4, 0.1, mul(c, 0.6)); F.box(0.2, 2 * fh + 0.3, W - 0.4, 0.1, 0.5, faces='flrtb')     # brise-soleil
    for i in range(4): s.rect(W - 1.9 + i * 0.3, 2 * fh + 0.5, 0.08, 2.2, mul(c2, 0.8)); F.box(W - 1.9 + i * 0.3, 2 * fh + 0.5, 0.08, 2.2, 0.22, faces='flr')     # timber fins
    F.wall()
    for Fc in (R, L, B):
        for f in range(3):
            for j in range(2):
                if rng.random() < 0.2: continue
                ww = pick(k, [0.5, 0.9, 1.4]); win(Fc, Fc.w * (0.25 + 0.5 * j) - ww / 2, f * fh + 1.2, ww, 0.9, 0.08, 0x4a4e52, n=1 if ww < 1 else 2, lit=0.5, box=mul(c, 0.7))
        k.bar(Fc.P(Fc.w - 0.2, 0, 0.06), Fc.P(Fc.w - 0.2, H, 0.06), 0.08, props(k), PR['steel'])
        if Fc is B: ac(B, 0.5, 0.02, 0.05); ac(B, 1.6, 0.02, 0.05)
        Fc.wall()
    rsheet = k.flat_roof(x0, zf - D, x0 + W, zf, H, H + 0.9, 0.15, seed=seed, c=0x9a8a74 if deck else None, prio=0.5)
    if deck:
        bulkhead(k, x0 + 0.3, H, zf - D + 0.3, 1.8, 2.3, 2.4); ac_rows(k, x0 + W - 1.3, H, zf - D + 0.5, 1)
        ps = props(k)
        for hh in (1.25, 1.6): k.bar([x0 + 0.1, H + hh, zf - 0.1], [x0 + W - 0.1, H + hh, zf - 0.1], 0.05, ps, PR['steel'])
        for i in range(4): k.bar([x0 + 0.1 + i * (W - 0.2) / 3, H + 0.9, zf - 0.1], [x0 + 0.1 + i * (W - 0.2) / 3, H + 1.6, zf - 0.1], 0.05, ps, PR['steel'])
        tv_antenna(k, x0 + 1.2, H + 2.3, zf - D + 1.5, 1.6)
        pbox(k, [x0 + W - 1.9, H, zf - 2.2], [1.4, 0, 0], [0, 0.75, 0], [0, 0, 0.8], 'wood', 'wood')     # deck table
        planter(k, x0 + 0.4, zf - 1.0, 0.9, 0.5, 0.8) if False else pbox(k, [x0 + 0.35, H, zf - 1.1], [1.0, 0, 0], [0, 0.8, 0], [0, 0, 0.5], 'green', (PR['green'][0], PR['green'][1] + 0.3, 0.6, 0.35))
    return H


@K.piece('tokyo_house_c', style='house modern narrow', stone=0xd8d8d4, desc='three narrow 3-storey modern houses: white, grey and charcoal siding, built-in garages, glass-railed balconies, roof decks')
def house_c(k):
    k.litc = WARM + [0xf4f6ff]; k.lit = 0.5
    modern(k, 0.0, 4.9, 10.5, 0xe6e6e2, 'siding', 0xb8b4aa, 1, 'l')
    modern(k, 5.35, 5.2, 11.0, 0x8f9496, 'metal', 0xdcdad4, 2, 'r', rail='slat', zf=-1.1)
    modern(k, 11.0, 4.8, 10.2, 0x44484c, 'metal', 0xa08a6c, 3, 'l', deck=True, rail='bars')
    car(k, 0.75, -1.0, 1, 2.3, 1.5); car(k, 11.85, -1.0, 0, 2.3, 1.5)
    bike(k, 3.2, -0.45, 'x', 'tarp'); bike(k, 5.6, -0.6, 'x'); pots(k, 8.9, -0.6, 3, 'x', 4); pole(k, 10.7, -0.2)


@K.piece('tokyo_house_d', style='house shop corner', stone=0xd6c8a8, desc='corner tobacco / liquor shop-house: counter window under an awning, noren, vending-machine alcoves on two sides, flat above under a tiled hip roof')
def house_d(k):
    k.litc = WARM; k.lit = 0.55
    S = Signs(k, 9, 5); ts = roof_sheet_tile(k, 11.5, 6.4, 0x4f5258, 'kawara')
    W, D, fh, H = 9.2, 9.6, 3.0, 6.1
    F, R, B, L = box4(k, 0, 0, W, D, H, prio=(1.0, 0.95, 0.6, 0.6)); c = C(0xdccfb0); c2 = C(0xe8e0cc)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, fh, 'tile', mul(c, 0.86), 1); wallmat(s, 0, fh, Fc.w, H - fh, 'stucco', c2, 2); s.rect(0, 0, Fc.w, 0.3, 0x8a8880); s.vshade(0, H - 0.5, Fc.w, 0.5, 1.0, 0.8)
    s = F.s
    # front: vending alcove | shop door with noren | tobacco counter window
    s.grad(0.4, 0, 3.4, 2.3, C(0x2a2c30), C(0x44474c)); s.em.rect(0.5, 2.05, 3.2, 0.12, col(0xf0f6ff) * 0.9); F.recess(0.4, 0, 3.4, 2.3, 0.9)
    vending(F, 0.55, -0.85, (0, 1, 2))
    shop(F, S, 4.0, 2.4, fh - 0.1, 'cafe', hf=0.7, fascia=False); noren(F, 4.2, 1.45, 2.0, 0.75, 0)
    cx = 6.7; s.rect(cx, 0, 2.2, 1.0, 0x9a3a2a); s.bricks(cx, 0, 2.2, 1.0, C(0x9a3a2a), C(0x6a2a20), 0.15, 0.15)
    s.rect(cx, 1.0, 2.2, 1.25, 0xd8d4c8); s.grad(cx + 0.08, 1.08, 2.04, 1.1, C(0xb8c0c0), C(0xd8dcd8)); s.em.grad(cx + 0.08, 1.08, 2.04, 1.1, col(0xffe9c0) * 0.7, col(0xffe9c0))
    for r in range(3):
        for q in range(9):
            cc = pick(k, [0xd03020, 0x2060c0, 0xe8c020, 0x30a050, 0xffffff, 0x202020]); s.rect(cx + 0.14 + q * 0.22, 1.15 + r * 0.3, 0.17, 0.22, cc); s.em.rect(cx + 0.14 + q * 0.22, 1.15 + r * 0.3, 0.17, 0.22, col(cc) * 0.7)
    F.recess(cx + 0.05, 1.05, 2.1, 1.15, 0.25); s.rect(cx - 0.05, 0.92, 2.3, 0.1, 0xe8e4d8); F.box(cx - 0.05, 0.92, 2.3, 0.1, 0.3, faces='flrtb')
    r = S.slot(5.0, 1.2); S.s.awning_paint(r[0], r[1], r[2], r[3], 0x8a2a20, 0xf0ece0, 0.5); F.awning(3.9, 2.35, 5.2, 0.6, 1.1, 0.3, uvrect=r, sh=S.s)
    S.board(F, 0.3, fh + 0.1, 4.2, 0.9, 0.15, glow=0.8, bg=0xf0ece0, fg=0xc0201e)
    S.blade(F, W - 0.25, fh + 0.2, 0.8, 2.2, bg=0xd82a2a, glow=0.9)
    win(F, 5.3, fh + 1.0, 1.7, 1.25, 0.1, SASH, n=2, lit=0.6, box=0x9a9488); shutterbox(F, 7.02, fh + 1.0, 1.25, mul(c2, 0.86)); hood(F, 5.2, fh + 2.3, 2.4, 0.35)
    F.wall()
    # right (side street): liquor shutter + vending pair + balcony
    s = R.s
    s.grad(0.5, 0, 2.4, 2.3, C(0x2a2c30), C(0x44474c)); s.em.rect(0.6, 2.05, 2.2, 0.12, col(0xf0f6ff) * 0.9); R.recess(0.5, 0, 2.4, 2.3, 0.9); vending(R, 0.65, -0.85, (3, 1))
    shop(R, S, 3.2, 3.4, fh - 0.1, 'shutter', hf=0.7)
    for i in range(3): pbox(k, R.P(7.0 + i * 0.5, 0, 0.05), R.r * 0.45, UP * (0.7 if i != 1 else 1.05), R.n * 0.35, 'crate', 'dark', sides='flr')
    win(R, 7.2, 0.9, 1.4, 1.2, 0.1, SASH, n=2, lit=0.5)
    rs = rail_sheet(k, 4.0, 1.2, 'slat', 0xb8b0a0, prio=0.9); win(R, 1.2, fh + 0.1, 1.75, 1.95, 0.08, SASH, n=2, lit=0.6); balcony(R, 0.7, fh + 0.1, 4.0, 0.95, 1.05, 0.15, rs)
    futon(R, 1.0, fh + 1.15, 0.95, 1); futon(R, 2.5, fh + 1.15, 0.95, 2); ac(R, 3.7, fh + 0.12, 0.06)
    win(R, 6.4, fh + 1.0, 1.4, 1.2, 0.1, SASH, n=2, lit=0.55, box=0x9a9488); hood(R, 6.3, fh + 2.25, 1.6, 0.3)
    R.wall()
    for Fc in (B, L):
        for f in range(2):
            for j in range(2):
                win(Fc, Fc.w * (0.25 + 0.5 * j) - 0.6, f * fh + 1.0, 1.2, 1.1, 0.09, SASH, n=2, lit=0.5, box=0x9a9488); hood(Fc, Fc.w * (0.25 + 0.5 * j) - 0.7, f * fh + 2.15, 1.4, 0.3)
        ac(Fc, Fc.w * 0.5, 0.02, 0.05); Fc.wall()
    hip_roof(k, 0, W, -D, 0, H, 2.0, ts, 0.6)
    lantern(k, F.P(3.85, 1.3, 0.3), 0.2, 0.5, 'lan_r')
    for Fc in (F, R, B, L): gutter(Fc, H - 0.1, 0.6)
    tv_antenna(k, 6.5, H + 1.6, -5.0); pole(k, W + 0.75, 0.75, lamp=V(-0.7, 0, 0.7)); bike(k, 0.2, 0.3, 'x', 'steel'); bike(k, W + 0.3, -8.6, 'z'); pots(k, 4.0, 0.15, 2, 'x', 5)
    for i in range(4): pbox(k, [W + 0.1 + (i % 2) * 0.5, (i // 2) * 0.36, -6.6], [0.45, 0, 0], [0, 0.34, 0], [0, 0, 0.35], 'crate', 'dark')
    ps = props(k)
    for hh in (1.75, 2.0): k.bar(R.P(0.8, fh + 0.1 + hh, 0.75), R.P(4.6, fh + 0.1 + hh, 0.75), 0.04, ps, PR['steel'])
    for i in range(4): k.bar(F.P(4.1 + i * 1.6, 2.9, 0.02), F.P(4.1 + i * 1.6, 2.4, 1.05), 0.05, ps, PR['dark'])
    ac(F, 1.0, fh + 0.2, 0.0); ac(B, 6.0, fh + 0.3, 0.0); k.bar(B.P(6.4, 0, 0.05), B.P(6.4, fh + 0.3, 0.05), 0.06, ps, PR['white'])


def tiled_wall(k, x0, x1, z, ts, h=1.75, t=0.28, c=0xe6e0d0):
    """Plaster boundary wall with a little tiled cap."""
    ws = getattr(k, '_tw', None)
    if ws is None:
        ws = k._tw = k.sheet(6.0, h, 0.8, 'twall'); wallmat(ws, 0, 0, 6.0, h, 'stucco', c, 3); ws.bricks(0, 0, 6.0, 0.45, C(0x8a8a84), C(0x5a5a56), 0.5, 0.22); ws.rect(0, h - 0.12, 6.0, 0.12, 0x5a4636)
    x = x0
    while x < x1 - 0.01:
        w = min(6.0, x1 - x); k.box(x, 0, z - t / 2, x + w, h, z + t / 2, ws, (0, 0, w, h), (0, h - 0.1, w, 0.08), side2=(0, 0, t, h)); x += w
    gable_roof(k, x0, x1, z - t / 2 - 0.12, z + t / 2 + 0.12, h + 0.08, 0.26, ts, 'x', 0.12, 0.05, lod=1, ridges=True)


def toro(k, x, z):
    """Stone lantern."""
    ps = props(k); st = (PR['block'][0] + 0.02, PR['block'][1] + 0.02, 0.3, 0.14)
    k.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.2, z + 0.3, ps, st, st); k.box(x - 0.12, 0.2, z - 0.12, x + 0.12, 1.0, z + 0.12, ps, st, st)
    k.box(x - 0.28, 1.0, z - 0.28, x + 0.28, 1.12, z + 0.28, ps, st, st, bottom=True); k.box(x - 0.2, 1.12, z - 0.2, x + 0.2, 1.45, z + 0.2, ps, PR['glow'], st)
    k.cyl(x, z, 0.5, 1.45, 1.75, 4, ps, st, r1=0.05, a0=math.pi / 4, a1=math.pi / 4 + 2 * math.pi)


def oldhouse(k, x0, W, D, zf, ts, nfl=2, seed=0, rise=2.2):
    rng = k.rng; fh = 2.6; H = nfl * fh + 0.2 if nfl > 1 else 2.9
    F, R, B, L = box4(k, x0, zf, W, D, H, prio=(1.0, 0.7, 0.7, 0.7)); wood = C(0x4a3628); pl = C(0xe6dfcc)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, H, 'wood', wood, seed)
        if nfl > 1:
            wallmat(s, 0, fh + 0.5, Fc.w, H - fh - 0.5, 'stucco', pl, seed + 1); s.vlines(0, fh + 0.5, Fc.w, H - fh - 0.5, wood, 1.82, 0.1); s.rect(0, fh + 0.4, Fc.w, 0.14, mul(wood, 0.9))
        s.rect(0, 0, Fc.w, 0.3, 0x7a7a74); s.vshade(0, H - 0.6, Fc.w, 0.6, 1.0, 0.72)
    s = F.s; warm = col(0xffcf90)
    # engawa: a run of shoji / glass sliding doors
    ew = W - 2.4; ex = 0.4
    s.rect(ex, 0.35, ew, 1.95, mul(wood, 0.8)); n = max(2, int(ew / 0.9))
    for i in range(n):
        px = ex + 0.05 + i * (ew - 0.1) / n; pw = (ew - 0.1) / n - 0.06; on = rng.random() < 0.7
        s.rect(px, 0.45, pw, 1.75, 0xe2d8bc)
        if on: s.em.grad(px, 0.45, pw, 1.75, warm * 0.6, warm * 0.9)
        s.vlines(px, 0.45, pw, 1.75, mul(wood, 1.2), pw / 3, 0.03); s.hlines(px, 0.45, pw, 1.75, mul(wood, 1.2), 0.44, 0.03); s.em.hlines(px, 0.45, pw, 1.75, 0x000000, 0.44, 0.03)
    F.recess(ex, 0.35, ew, 1.95, 0.5); s.rect(ex - 0.1, 0.2, ew + 0.2, 0.15, mul(wood, 1.3)); F.box(ex - 0.1, 0.2, ew + 0.2, 0.15, 0.55, faces='flrtb')
    s.door(W - 1.6, 0.2, 1.1, 2.0, 0x5a4434, mul(wood, 1.3), glass=True); F.recess(W - 1.7, 0.2, 1.3, 2.1, 0.3)
    # pent roof over the engawa
    yy = 2.55
    slope(k, (x0 - 0.3, yy, zf + 1.0), (x0 + W + 0.3, yy, zf + 1.0), (x0 + W + 0.3, yy + 0.5, zf), (x0 - 0.3, yy + 0.5, zf), ts, lod=1)
    k.emit([V(x0 - 0.3, yy - 0.1, zf + 1.0), V(x0 + W + 0.3, yy - 0.1, zf + 1.0), V(x0 + W + 0.3, yy + 0.4, zf), V(x0 - 0.3, yy + 0.4, zf)], ts, [(0, 0), (0.3, 0), (0.3, 0.06), (0, 0.06)], V(0, -1, 0.4), 1)
    if nfl > 1:
        for xx in (0.8, W - 2.6): win(F, xx, fh + 1.1, 1.8, 1.1, 0.12, 0x6a5a48, n=2, lit=0.55)
    F.wall()
    for Fc in (R, L, B):
        for f in range(nfl):
            for j in range(2):
                if rng.random() < 0.85:
                    wx = Fc.w * (0.25 + 0.5 * j) - 0.5; wy = f * fh + 1.0 + (0.5 if f else 0); win(Fc, wx, wy, 1.0, 0.9, 0.09, 0x6a5a48, n=2, lit=0.45, box=mul(wood, 1.3)); hood(Fc, wx - 0.15, wy + 0.95, 1.3, 0.35, mul(wood, 0.8))
        Fc.wall()
    ac(B, 1.0, 0.02, 0.05)
    ps = props(k); wd = PR['wood']
    for i in range(int(W / 0.9) + 1): k.bar(F.P(i * 0.9, yy + 0.4, 0.0), F.P(i * 0.9, yy - 0.05, 0.95), 0.07, ps, wd)     # veranda rafters
    for px in (-0.2, W * 0.5, W + 0.2): k.bar(F.P(px, 0, 0.95), F.P(px, yy - 0.05, 0.95), 0.1, ps, wd)     # veranda posts
    for Fc in (F, R, B, L): gutter(Fc, H - 0.12, 0.8, pipe=Fc is B, c='dark')
    hip_roof(k, x0, x0 + W, zf - D, zf, H, rise, ts, 0.8)
    return H


@K.piece('tokyo_house_e', style='house wooden old', stone=0x5a4636, desc='two old timber-and-plaster houses with deep tiled hip roofs and shoji verandas behind a tile-capped plaster wall with a roofed gate and a stone lantern')
def house_e(k):
    k.litc = WARM; k.lit = 0.5
    ts = roof_sheet_tile(k, 13.0, 7.0, 0x464a52, 'kawara')
    oldhouse(k, 0.3, 8.2, 7.6, -3.6, ts, 1, 1, rise=2.7)
    oldhouse(k, 10.2, 7.0, 8.4, -3.2, ts, 2, 2, rise=2.2)
    tiled_wall(k, 0.0, 7.2, -0.2, ts); tiled_wall(k, 9.4, 17.8, -0.2, ts)
    # roofed gate
    ps = props(k); wd = PR['wood']
    for px in (7.25, 9.35): k.box(px - 0.11, 0, -0.35, px + 0.11, 2.3, -0.05, ps, wd, wd)
    k.box(7.1, 2.1, -0.3, 9.5, 2.3, -0.1, ps, wd, wd, bottom=True)
    gable_roof(k, 7.0, 9.6, -0.85, 0.45, 2.3, 0.55, ts, 'x', 0.15, 0.1, lod=1)
    toro(k, 5.6, -1.6); planter(k, 1.2, -1.6, 1.4, 0.9, 1.0); planter(k, 15.6, -1.5, 1.2, 0.8, 0.9)
    toro(k, 9.9, -1.4); pots(k, 11.0, -3.0, 4, 'x', 6); bike(k, 15.5, -2.9, 'x', 'steel'); pole(k, 17.9, 0.15, lamp=V(-0.7, 0, 0.7))
    for i in range(5): k.box(7.9 + (i % 2) * 0.45, 0, -0.9 - i * 0.55, 8.4 + (i % 2) * 0.45, 0.06, -0.5 - i * 0.55, ps, (PR['block'][0], PR['block'][1], 0.4, 0.2), (PR['block'][0], PR['block'][1], 0.4, 0.2))     # stepping stones
    for xx in (7.3, 8.35): k.box(xx, 0.15, -0.26, xx + 0.95, 2.0, -0.2, ps, wd, wd, bottom=True)     # gate leaves
