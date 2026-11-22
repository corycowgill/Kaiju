# Tokyo kit: warehouses (low): sawtooth wharf warehouse, barrel-roofed market shed + cold store, logistics block. design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *
from kit_house import tall_sheet, car

SASH = 0x8f8f8a


def pallets(k, x, z, n=3, key='pallet', w=1.2, d=1.0):
    for i in range(n): pbox(k, [x, i * 0.62, z], [w, 0, 0], [0, 0.6, 0], [0, 0, d], key if i % 2 == 0 else 'crate', 'pallet')


def forklift(k, x, z):
    pbox(k, [x, 0.15, z], [1.1, 0, 0], [0, 0.9, 0], [0, 0, 1.9], 'yellow', 'dark', bottom=True); pbox(k, [x + 0.1, 1.05, z + 0.2], [0.9, 0, 0], [0, 1.0, 0], [0, 0, 0.9], 'dark', 'yellow')
    ps = props(k)
    for dx in (0.15, 0.95): k.bar([x + dx, 0.1, z + 2.0], [x + dx, 2.6, z + 2.0], 0.1, ps, PR['dark']); k.box(x + dx - 0.06, 0.2, z + 2.0, x + dx + 0.06, 0.28, z + 3.0, ps, PR['steel'], PR['steel'])


def dock_light(Fc, x, y):
    pbox(Fc.k, Fc.P(x - 0.25, y, 0.0), Fc.r * 0.5, UP * 0.15, Fc.n * 0.3, 'glow', 'dark', sides='flr', bottom=True)
    Fc.s.em.ellipse(x, y - 0.9, 1.3, 1.0, col(0xfff0d0) * 0.16)


@K.piece('tokyo_warehouse_a', style='warehouse wharf sawtooth', stone=0x8f9aa0, share=2, desc='wharf warehouse: concrete base, blue-grey corrugated walls, four-bay sawtooth north-light roof, roller doors under a loading canopy, pallets and a forklift')
def warehouse_a(k):
    k.litc = [0xf0f6e8, 0xfff0d0]; k.lit = 0.35
    W, D, H, th = 36.0, 24.0, 8.4, 2.8; c = C(0x7f93a0); nt = 4; tw = W / nt
    F, R, B, L = box4(k, 0, 0, W, D, H, prio=(1.0, 0.7, 0.7, 0.7)); tall_sheet(k, F, th, 1.0); tall_sheet(k, B, th, 0.7)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, s.h, 'corrugated', c, 1, 1.6); s.rect(0, 0, Fc.w, 1.3, 0xa6a49c); s.noise(0, 0, Fc.w, 1.3, 0.1, 1.0, 0.5, 2); s.noise(0, 1.3, Fc.w, s.h - 1.3, 0.1, 0.3, 4.0, 3)
        s.rect(0, H - 0.25, Fc.w, 0.25, mul(c, 0.7))
    s = F.s
    for i in range(4):
        dx = 2.2 + i * 8.4; op = i == 2
        if op: s.grad(dx, 0, 5.0, 5.2, C(0x1c1e20), C(0x2e3134)); s.em.rect(dx + 0.5, 4.4, 4.0, 0.2, col(0xf0f6e8) * 0.7); s.em.grad(dx, 0, 5.0, 4.2, col(0xf0f6e8) * 0.22, col(0xf0f6e8) * 0.08)
        else: s.rollup(dx, 0, 5.0, 5.2, [0x9aa4a8, 0xa8a090, 0x8a9a9a, 0x9aa4a8][i])
        F.recess(dx, 0, 5.0, 5.2, 1.4 if op else 0.25); s.rect(dx - 0.2, 0, 0.2, 5.4, 0xe8c020); s.rect(dx + 5.0, 0, 0.2, 5.4, 0xe8c020)
        dock_light(F, dx + 2.5, 5.45)
    s.door(0.6, 0, 0.95, 2.1, 0x5a6a70, 0x8a8e90, glass=False); F.recess(0.5, 0, 1.15, 2.2, 0.2)
    s.rect(0, 6.0, W, 0.25, 0x6a7074); F.box(0.5, 6.0, W - 1.0, 0.25, 3.0, faces='flrtb', lod=True)
    ps = props(k)
    for i in range(6): k.bar(F.P(1.0 + i * (W - 2.0) / 5, 7.6, 0.02), F.P(1.0 + i * (W - 2.0) / 5, 6.25, 2.8), 0.08, ps, PR['steel'])
    top = []
    for i in range(nt): top += [(i * tw, H + th), ((i + 1) * tw, H)]
    F.wall(top=top[:-1]); B.wall(top=[(W - x, y) for (x, y) in top[::-1]][1:])
    for Fc in (R, L):
        for i in range(4): win(Fc, 2.5 + i * 5.6, 5.0, 2.4, 1.2, 0.15, 0x6a7074, n=3, lit=0.35, blind=0)
        for i in range(3): k.bar(Fc.P(4.0 + i * 8.0, 0, 0.08), Fc.P(4.0 + i * 8.0, H, 0.08), 0.12, ps, PR['steel'])
        Fc.wall()
    win(B, 3.0, 1.2, 1.5, 1.1, 0.12, SASH, lit=0.5); B.s.door(6.0, 0, 0.95, 2.1, 0x5a6a70, 0x8a8e90, glass=False)
    # sawtooth: glazed vertical faces look -X (north light), metal slopes fall toward +X
    gs = k.sheet(D, th, 0.8, 'northlight'); gs.rect(0, 0, D, th, 0x5a6064); n = int(D / 1.5)
    for i in range(n):
        px = 0.1 + i * D / n; gs.glass(px, 0.3, D / n - 0.2, th - 0.5, blind=0, lit=0)
        if k.rng.random() < 0.4: gs.em.grad(px, 0.3, D / n - 0.2, th - 0.5, col(0xf0f6e8) * 0.4, col(0xf0f6e8) * 0.7)
    ts = roof_sheet_tile(k, D, math.hypot(tw, th) + 0.1, 0x8a9094, 'metal', 0.55)
    for i in range(nt):
        xa = i * tw; xb = xa + tw
        k.emit([V(xa, H, -D), V(xa, H, 0), V(xa, H + th, 0), V(xa, H + th, -D)], gs, [(0, 0), (D, 0), (D, th), (0, th)], V(-1, 0, 0), 3)
        slope(k, (xb, H, 0), (xb, H, -D), (xa, H + th, -D), (xa, H + th, 0), ts, lod=3, thick=0)
        k.bar([xa, H + th, 0.1], [xa, H + th, -D - 0.1], 0.3, ts, (0, ts.h - 0.2, D, 0.18))
        vent(k, xa + tw * 0.55, H + th * 0.4, -D * 0.3, 0.35, 1.0); vent(k, xa + tw * 0.55, H + th * 0.4, -D * 0.7, 0.35, 1.0)
    pallets(k, 12.0, 0.6, 3); pallets(k, 13.4, 0.5, 2, 'cont'); pallets(k, 28.5, 0.7, 4); pallets(k, 30.0, 0.6, 2, 'crate'); forklift(k, 21.0, 1.0)
    for i in range(5): k.cyl(1.9 + i * 8.4, 0.6, 0.12, 0, 1.0, 6, ps, PR['yellow'], PR['top'])
    pbox(k, [34.2, 0, 0.1], [0.7, 0, 0], [0, 1.2, 0], [0, 0, 0.5], 'red', 'dark')


@K.piece('tokyo_warehouse_b', style='warehouse market shed coldstore', stone=0xd8d8d2, desc='wholesale-market shed with a barrel roof and open lit trading bays stacked with crates and foam boxes, joined to a white insulated cold store with rooftop condensers')
def warehouse_b(k):
    k.litc = [0xf0f6e8, 0xe8f4ff]; k.lit = 0.6
    S = Signs(k, 10); W, D, H, rise = 26.0, 26.0, 6.2, 4.2; c = C(0xb9c0b8); ps = props(k)
    F, R, B, L = box4(k, 0, 0, W, D, H, prio=(1.0, 0.6, 0.6, 0.6)); tall_sheet(k, F, rise, 1.0); tall_sheet(k, B, rise, 0.6)
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, s.h, 'corrugated', c, 1, 1.5); s.rect(0, 0, Fc.w, 1.0, 0xa6a49c); s.noise(0, 1.0, Fc.w, s.h - 1.0, 0.1, 0.3, 4.0, 3)
    s = F.s; cool = col(0xf0f6e8); nb = 5; bw = W / nb
    for i in range(nb):
        bx = i * bw + 0.5; s.grad(bx, 0, bw - 1.0, 4.6, C(0x35383a), C(0x55595c)); s.em.grad(bx, 0, bw - 1.0, 4.6, cool * 0.5, cool * 0.28); s.em.rect(bx + 0.4, 4.25, bw - 1.8, 0.16, cool)
        for q in range(int((bw - 1.4) / 0.7)):
            cc = pick(k, [0xf0f0ea, 0x2a62b0, 0xe0b020, 0xf0f0ea, 0x8a5a38, 0xd04030]); hh = 0.5 + 0.9 * k.rng.random(); s.rect(bx + 0.2 + q * 0.7, 0, 0.6, hh, cc); s.em.rect(bx + 0.2 + q * 0.7, 0, 0.6, hh, col(cc) * 0.45)
        F.recess(bx, 0, bw - 1.0, 4.6, 1.6)
        r = S.slot(bw - 0.6, 1.3); S.s.awning_paint(r[0], r[1], r[2], r[3], [0x24406a, 0x8a2a20, 0x1f5a3a][i % 3], 0xf0ece0, 0.5); F.awning(bx - 0.2, 4.1, bw - 0.6, 0.9, 1.4, 0.3, uvrect=r, sh=S.s)
        S.board(F, bx + 0.6, 5.1, bw - 2.2, 0.8, 0.12, glow=0.7)
        pbox(k, [bx + 0.3, 0, 0.3], [0.6, 0, 0], [0, 0.4 + 0.3 * (i % 2), 0], [0, 0, 0.45], 'white', 'white'); pbox(k, [bx + 1.1, 0, 0.25], [0.45, 0, 0], [0, 0.7, 0], [0, 0, 0.35], 'crate', 'dark'); pbox(k, [bx + bw - 2.2, 0, 0.3], [0.9, 0, 0], [0, 0.55, 0], [0, 0, 0.6], 'tarp' if i % 2 else 'white', 'tarp' if i % 2 else 'white')
        lantern(k, F.P(bx - 0.25, 3.3, 0.5), 0.2, 0.5, 'lan_w')
    n = 10; arc = [(W / 2 - W / 2 * math.cos(math.pi * j / n), H + rise * math.sin(math.pi * j / n)) for j in range(1, n)]
    F.wall(top=arc); B.wall(top=arc)
    for Fc in (R, L):
        for i in range(5): win(Fc, 2.0 + i * 5.0, 3.6, 2.6, 1.2, 0.15, 0x6a7074, n=3, lit=0.5, blind=0)
        Fc.s.rollup(11.0, 0, 4.0, 3.4, 0x9aa4a8); Fc.recess(11.0, 0, 4.0, 3.4, 0.2); Fc.wall()
    seg = W / 2 * math.pi * 1.0 / n * 1.35
    ts = roof_sheet_tile(k, D + 0.8, seg * n * 0.62, 0x9aa2a0, 'metal', 0.5)
    pts = [(0.0, H)] + arc + [(W, H)]; v = 0.0
    for j in range(n):
        (xa, ya), (xb, yb) = pts[j], pts[j + 1]; L_ = math.hypot(xb - xa, yb - ya) * 0.6
        k.emit([V(xa, ya, 0.4), V(xa, ya, -D - 0.4), V(xb, yb, -D - 0.4), V(xb, yb, 0.4)], ts, [(0, v), (D + 0.8, v), (D + 0.8, v + L_), (0, v + L_)], V((xa + xb) / 2 - W / 2, 3.0, 0), 3); v += L_
    for j in (3, 5, 7): vent(k, pts[j][0], pts[j][1] - 0.2, -D * 0.5, 0.4, 1.2)
    # cold store
    x0 = W + 0.1; W2, D2, H2 = 12.0, 22.0, 9.6; w = C(0xe6e8e6)
    T = box4(k, x0, -1.5, W2, D2, H2 + 0.6, prio=(1.0, 0.6, 0.5, 0.3))
    for Fc in T:
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'panel', w, 5); s.rect(0, 0, Fc.w, 1.2, 0x9a9c98); s.rect(0, H2 - 1.6, Fc.w, 0.7, 0x2a62a8)
    s = T[0].s; s.rect(1.0, 1.2, 3.6, 3.6, 0xc8ccd0); s.rect(1.15, 1.35, 3.3, 3.3, 0xdfe4e6); s.rect(2.77, 1.35, 0.06, 3.3, 0x8a8e90); T[0].recess(1.0, 1.2, 3.6, 3.6, 0.3)
    s.rect(0.5, 0, W2 - 1.0, 1.2, 0x8a8c88); T[0].box(0.5, 0, W2 - 1.0, 1.2, 2.2, faces='flrt', lod=True)     # dock
    s.door(6.5, 1.2, 0.95, 2.1, 0x8a9094, 0x9a9ea0, glass=False); dock_light(T[0], 2.8, 5.2); dock_light(T[0], 7.0, 3.6)
    s.rect(0.6, 5.6, W2 - 1.2, 0.2, 0x8a8e90); T[0].box(0.6, 5.6, W2 - 1.2, 0.2, 2.6, faces='flrtb')
    S.board(T[0], 6.0, 6.6, 5.0, 1.6, 0.12, glow=0.6, bg=0x2a62a8)
    for Fc in T[:3]: Fc.wall()
    flat_roof(k, x0, -1.5 - D2, x0 + W2, -1.5, H2, 0.6, 0.25, seed=3, bulk=False, clutter=0.0)
    for i in range(4): plant(k, x0 + 1.5, H2, -5.0 - i * 4.2, 3.2, 1.8, 2.4); plant(k, x0 + 6.8, H2, -5.0 - i * 4.2, 3.2, 1.8, 2.4)
    for i in range(3): k.bar([x0 + 5.3, H2 + 0.5, -4.0 - i * 6], [x0 + 5.3, H2 + 0.5, -9.0 - i * 6], 0.3, ps, PR['steel'])
    pallets(k, x0 + 9.0, -0.6, 3, 'cont'); forklift(k, 23.0, 2.2); k.bar(T[1].P(3.0, 0, 0.1), T[1].P(3.0, H2, 0.1), 0.14, ps, PR['steel'])


@K.piece('tokyo_warehouse_c', style='warehouse logistics docks', stone=0xc8c8c2, desc='4-storey logistics block: row of raised truck docks with shutters and a canopy, strip windows, vehicle ramp up the side, containers, rooftop plant')
def warehouse_c(k):
    k.litc = [0xf0f6e8, 0xe8f4ff, 0xfff0d0]; k.lit = 0.45
    S = Signs(k, 12); W, D, fh, nfl = 42.0, 28.0, 6.0, 4; H = fh * nfl; c = C(0xcfd0cc); ps = props(k)
    F, R, B, L = box4(k, 0, 0, W, D, H + 1.2, prio=(1.0, 0.7, 0.7, 0.7))
    for Fc in (F, R, B, L):
        s = Fc.s; wallmat(s, 0, 0, Fc.w, Fc.h, 'panel', c, 1, 1.3); s.rect(0, 0, Fc.w, 1.3, 0x9a9a94); s.rect(0, H - 1.0, Fc.w, 1.4, 0x2f7a5a); s.rect(0, H + 0.9, Fc.w, 0.3, mul(c, 0.75))
        for f in range(1, nfl):
            ribbon(Fc, 1.5, f * fh + 2.2, Fc.w - 3.0, 1.3, 0.2, 0x6a7074, pw=1.8, lit=0.4 if Fc is not B else 0.25, run=5, blind=0.1)
            s.rect(0, f * fh - 0.2, Fc.w, 0.4, mul(c, 0.86)); Fc.box(0, f * fh - 0.2, Fc.w, 0.4, 0.12, faces='ftb')
    s = F.s; nd = 8; dw = (W - 6.0) / nd
    s.rect(0, 0, W, 1.25, 0x8a8a84)
    for i in range(nd):
        dx = 0.8 + i * dw; op = i in (2, 5)
        if op: s.grad(dx, 1.25, dw - 1.0, 3.7, C(0x1e2022), C(0x33363a)); s.em.grad(dx, 1.25, dw - 1.0, 3.7, col(0xf0f6e8) * 0.4, col(0xf0f6e8) * 0.2); s.em.rect(dx + 0.3, 4.5, dw - 1.6, 0.18, col(0xf0f6e8))
        else: s.rollup(dx, 1.25, dw - 1.0, 3.7, 0xa8aeb0)
        F.recess(dx, 1.25, dw - 1.0, 3.7, 1.2 if op else 0.22)
        s.rect(dx + 0.2, 0.75, 0.3, 0.5, 0x202020); s.rect(dx + dw - 1.5, 0.75, 0.3, 0.5, 0x202020); s.rect(dx + dw * 0.5 - 0.9, 5.05, 0.8, 0.5, 0xf0f0ea)
        F.box(dx + 0.2, 0.75, 0.3, 0.5, 0.15, faces='flrt'); F.box(dx + dw - 1.5, 0.75, 0.3, 0.5, 0.15, faces='flrt')
        if i % 2 == 0: dock_light(F, dx + dw * 0.5 - 0.5, 5.3)
    shop_x = W - 5.0; s.rect(shop_x, 0, 4.4, 3.2, 0x3a3e42)
    for i in range(3): s.glass(shop_x + 0.1 + i * 1.45, 0.1, 1.3, 2.9, blind=0, lit=0); s.em.grad(shop_x + 0.1 + i * 1.45, 0.1, 1.3, 2.9, col(0xfff0d0) * 0.8, col(0xfff0d0) * 0.5)
    F.recess(shop_x, 0, 4.4, 3.2, 0.3)
    s.rect(0.3, 5.6, W - 6.0, 0.3, 0x7a7e80); F.box(0.3, 5.6, W - 6.0, 0.3, 3.2, faces='flrtb', lod=True)
    for i in range(nd + 1): k.bar(F.P(0.5 + i * dw, 7.2, 0.02), F.P(0.5 + i * dw, 5.9, 3.0), 0.08, ps, PR['steel'])
    S.board(F, W * 0.5 - 7.0, H - 0.95, 14.0, 1.3, 0.15, glow=0.85, bg=0xf0f0ea, fg=0x2f7a5a)
    for Fc in (F, R, B, L): Fc.wall()
    for i in range(3): k.bar(B.P(6.0 + i * 15.0, 0, 0.1), B.P(6.0 + i * 15.0, H, 0.1), 0.14, ps, PR['steel'])
    B.s.rollup(4.0, 0, 5.0, 4.5, 0xa8aeb0)
    # vehicle ramp along the left side up to the first floor
    rw = 6.0; x0 = -rw; rs = k.sheet(D, fh + 1.2, 0.5, 'ramp'); wallmat(rs, 0, 0, D, fh + 1.2, 'concrete', 0xb0aea6, 4)
    def rq(pts, uvs, want, lod=1): k.emit([V(*p) for p in pts], rs, uvs, want, lod)
    z0 = -D + 1.0; z1 = -1.0; Lr = z1 - z0
    rq([(x0, 0, z1), (x0, 0, z0), (x0, fh + 1.1, z0), (x0, 1.1, z1)], [(0, 0), (Lr, 0), (Lr, fh + 1.1), (0, 1.1)], V(-1, 0, 0), 3)
    rq([(x0 + 0.25, 0, z1), (x0 + 0.25, 0, z0), (x0 + 0.25, fh + 1.1, z0), (x0 + 0.25, 1.1, z1)], [(0, 0), (Lr, 0), (Lr, fh + 1.1), (0, 1.1)], V(1, 0, 0), 1)
    rq([(x0, 0, z0), (0, 0, z0), (0, fh + 1.1, z0), (x0, fh + 1.1, z0)], [(0, 0), (rw, 0), (rw, fh + 1.1), (0, fh + 1.1)], V(0, 0, -1), 3)
    rq([(x0, 1.1, z1), (x0 + 0.25, 1.1, z1), (x0 + 0.25, fh + 1.1, z0), (x0, fh + 1.1, z0)], [(0, 1.0), (0.25, 1.0), (0.25, 1.1), (0, 1.1)], UP, 1)
    rq([(x0, 0, z1), (x0 + 0.25, 0, z1), (x0 + 0.25, 1.1, z1), (x0, 1.1, z1)], [(0, 0), (0.25, 0), (0.25, 1.1), (0, 1.1)], V(0, 0, 1), 1)
    deck = k.sheet(rw, Lr, 0.35, 'rampdeck'); deck.rect(0, 0, rw, Lr, 0x6e6e6c); deck.hlines(0, 0, rw, Lr, 0x5a5a58, 0.6, 0.12); deck.rect(rw / 2 - 0.08, 0, 0.16, Lr, 0xd8d4c0)
    k.emit([V(x0 + 0.25, 0, z1), V(0, 0, z1), V(0, fh, z0), V(x0 + 0.25, fh, z0)], deck, [(0, 0), (rw, 0), (rw, Lr), (0, Lr)], UP, 3)
    L.s.grad(1.0, fh, 6.0, 4.6, C(0x1e2022), C(0x33363a)); L.s.em.rect(1.5, fh + 4.0, 5.0, 0.2, col(0xf0f6e8) * 0.7)
    flat_roof(k, 0, -D, W, 0, H, 1.2, 0.3, seed=5, bulk=True, clutter=0.5, prio=0.4)
    for i in range(5): plant(k, 6.0 + i * 6.5, H, -8.0, 3.6, 2.0, 2.6)
    frp_tank(k, 34.0, H, -20.0, 4.0, 2.4, 3.0); bulkhead(k, 20.0, H, -22.0, 5.0, 2.6, 4.5)
    for i, (cx, key) in enumerate(((3.0, 'cont'), (W - 14.0, 'red'), (W - 14.0 + 2.7, 'cont'))):
        pbox(k, [cx, 0.9 if i == 0 else 0.0, 1.4 if i == 0 else 3.5], [2.5, 0, 0], [0, 2.6, 0], [0, 0, 6.1 if i else 9.0], key, key, bottom=True, lod=1 if i == 0 else 0)
    pallets(k, 20.0, 0.5, 3); pallets(k, 21.6, 0.6, 2, 'crate')
    for i in range(nd + 1): k.cyl(0.4 + i * dw, 3.6, 0.12, 0, 1.0, 6, ps, PR['yellow'], PR['top'])
