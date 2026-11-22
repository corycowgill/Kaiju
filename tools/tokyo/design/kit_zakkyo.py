# Tokyo kit: zakkyo (multi-tenant 'pencil') buildings + the shared shopfront painter. design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *

TILES = {'white': 0xdedbd2, 'beige': 0xcbb99a, 'brown': 0x7d5a44, 'bluegrey': 0x7f8d9a, 'grey': 0xa3a39d, 'green': 0x6f8576, 'cream': 0xe0d4b8, 'black': 0x3c3c40, 'rust': 0x9a5a40}


def _lattice(s, x, y, w, h, c, px=0.16, py=0.0, lw=0.03):
    s.vlines(x, y, w, h, c, px, lw); s.em.vlines(x, y, w, h, 0x000000, px, lw)
    if py: s.hlines(x, y, w, h, c, py, lw); s.em.hlines(x, y, w, h, 0x000000, py, lw)


def shop(Fc, S, x, w, g, kind, hf=0.8, fascia=True):
    """Paint + model a ground-floor unit in (x, 0, w, g) of facade Fc. Kinds: ramen izakaya konbini pachinko shop
    shutter entry bar garage cafe."""
    s = Fc.s; e = s.em; k = Fc.k; rng = k.rng
    yo = g - hf
    if kind in ('ramen', 'izakaya'):
        wood = C(0x4a3424) if kind == 'ramen' else C(0x2e2a28)
        s.rect(x, 0, w, yo, wood); s.vlines(x, 0, w, yo, mul(wood, 0.72), 0.12, 0.03)
        dw = min(1.7, w * 0.42); left = rng.random() < 0.5
        dx = x + 0.35 if left else x + w - 0.35 - dw
        warm = col(0xffc27a)
        s.rect(dx, 0, dw, 2.05, mul(wood, 1.3))
        for i in range(2):
            px = dx + 0.07 + i * dw / 2; pw = dw / 2 - 0.14
            s.rect(px, 0.35, pw, 1.6, 0xd9cba4); e.grad(px, 0.35, pw, 1.6, warm * 0.75, warm); _lattice(s, px, 0.35, pw, 1.6, mul(wood, 1.2), 0.14, 0.4)
        wx = dx + dw + 0.3 if left else x + 0.3; ww = w - dw - 0.95
        if ww > 0.7:
            s.rect(wx, 0.95, ww, 1.15, 0xd9cba4); e.grad(wx, 0.95, ww, 1.15, warm * 0.7, warm * 0.95); _lattice(s, wx, 0.95, ww, 1.15, mul(wood, 1.2), 0.11)
            s.rect(wx, 0.1, ww, 0.75, mul(wood, 1.15)); s.rect(wx - 0.05, 0.88, ww + 0.1, 0.07, mul(wood, 1.5))
        Fc.recess(x + 0.15, 0, w - 0.3, yo - 0.05, 0.3)
        noren(Fc, dx - 0.08, 1.4, dw + 0.16, 0.8, 0 if kind == 'izakaya' else pick(k, [1, 2]))
        if kind == 'izakaya': lanterns(Fc, x + 0.25, yo - 0.5, w - 0.5, max(2, int(w / 0.85)), 0.28, 'lan_r', 0.17, 0.42)
        else:
            lx = dx + dw + 0.4 if left else dx - 0.4
            lantern(k, Fc.P(lx, 1.15, 0.32), 0.27, 0.72, 'lan_r'); lantern(k, Fc.P(lx + (0.75 if left else -0.75), 1.5, 0.3), 0.17, 0.42, 'lan_w')
        if ww > 1.6: pbox(k, Fc.P(wx + ww - 0.5, 0, 0.05), Fc.r * 0.45, UP * 0.7, Fc.n * 0.35, 'crate', 'dark', sides='flr')
        if fascia: S.board(Fc, x + 0.1, yo, w - 0.2, hf - 0.06, 0.2, bg=pick(k, [0x2a2420, 0xe8dcc0, 0x8a2a20, 0x1f3a6a, 0x5a4030]), mode='box', glow=0.75)
    elif kind == 'konbini':
        s.rect(x, 0, w, yo, 0xd4d6d8); n = max(2, int(round(w / 1.5))); bw = w / n; door = n // 2
        for i in range(n):
            px = x + i * bw + 0.05; pw = bw - 0.1
            s.grad(px, 0.12, pw, yo - 0.2, C(0xb9c0c2), C(0xd9dfe0)); e.grad(px, 0.12, pw, yo - 0.2, col(0xdfe8f0) * 0.8, col(0xf4f8ff))
            if i == door:
                s.rect(px + pw / 2 - 0.03, 0.12, 0.06, yo - 0.2, 0x9a9ea0); e.rect(px + pw / 2 - 0.03, 0.12, 0.06, yo - 0.2, 0x202020)
                s.rect(px, 1.0, pw, 0.12, 0x2a9a8a); e.rect(px, 1.0, pw, 0.12, col(0x2a9a8a) * 0.6)
            else:
                for r in range(4):
                    for q in range(int(pw / 0.2)):
                        cc = pick(k, [0xd03020, 0x2060c0, 0xe8c020, 0x30a050, 0xf08020, 0xffffff, 0x8040a0])
                        s.rect(px + 0.06 + q * 0.2, 0.3 + r * 0.36, 0.15, 0.24, cc); e.rect(px + 0.06 + q * 0.2, 0.3 + r * 0.36, 0.15, 0.24, col(cc) * 0.75)
                    s.rect(px, 0.24 + r * 0.36, pw, 0.05, 0xe8e8e4)
        Fc.recess(x + 0.05, 0.1, w - 0.1, yo - 0.15, 0.18)
        if fascia: S.board(Fc, x, yo, w, hf, 0.28, r=S.stripes(min(w, 11.0), hf, pick(k, [(0x1f9d8a, 0xf07a1a), (0x2a62c8, 0xe8455a), (0x7a3ad0, 0xf2c81e), (0xd82a2a, 0x1f9d55)])))
    elif kind == 'pachinko':
        s.rect(x, 0, w, yo, 0x24242c); c1 = pick(k, [0xd82a2a, 0xd42a8a, 0x1f5fd0]); c2 = pick(k, [0xf2c81e, 0x25b8d0, 0xf4f4f0])
        dw = min(3.2, w * 0.4); dx = x + (w - dw) / 2
        s.grad(dx, 0.05, dw, yo - 0.3, C(0xc8c0a8), C(0xe8e2d0)); e.grad(dx, 0.05, dw, yo - 0.3, col(0xffe9b8) * 0.85, col(0xfff4d8))
        s.vlines(dx, 0.05, dw, yo - 0.3, 0x8a8a8a, dw / 4, 0.05); e.vlines(dx, 0.05, dw, yo - 0.3, 0x101010, dw / 4, 0.05)
        for (sx, sw) in ((x + 0.15, dx - x - 0.3), (dx + dw + 0.15, x + w - dx - dw - 0.3)):
            if sw < 0.4: continue
            s.rect(sx, 0.1, sw, yo - 0.4, c1); e.rect(sx, 0.1, sw, yo - 0.4, col(c1) * 0.8)
            nb = max(1, int(sw / 0.9))
            for i in range(nb):
                S.sign(sw / nb - 0.15, min(2.2, yo - 0.9), bg=pick(k, SIGNC), at=(s, sx + i * sw / nb + 0.07, 0.35))
            for yy in (0.14, yo - 0.42):
                for i in range(int(sw / 0.2)):
                    s.rect(sx + i * 0.2 + 0.05, yy, 0.09, 0.09, 0xfff2c0); e.rect(sx + i * 0.2 + 0.05, yy, 0.09, 0.09, 0xfff2c0)
        Fc.recess(dx, 0.05, dw, yo - 0.35, 0.5)
        if fascia: S.board(Fc, x, yo - 0.25, w, hf + 0.25, 0.4, r=S.chase(min(w, 11.0), hf + 0.25, c1, c2))
    elif kind in ('shop', 'cafe'):
        fr = pick(k, [0x3a3d40, 0x5a4030, 0xe8e4da, 0x2a4a3a]); s.rect(x, 0, w, yo, fr); n = max(1, int(round(w / 1.7))); bw = w / n; door = int(rng.random() * n)
        warm = col(pick(k, WARM))
        for i in range(n):
            px = x + i * bw + 0.07; pw = bw - 0.14; y0 = 0.08 if i == door else 0.55
            s.glass(px, y0, pw, yo - y0 - 0.12, blind=0, lit=0); e.grad(px, y0, pw, yo - y0 - 0.12, warm * 0.6, warm * 0.95)
            if i != door:
                s.rect(px + 0.05, y0 + 0.05, pw - 0.1, 0.5, mix(GLASS, [0.6, 0.5, 0.4], 0.5)); e.rect(px + 0.1, y0 + 0.05, pw - 0.2, 0.45, warm * 0.35)
        Fc.recess(x + 0.07, 0.05, w - 0.14, yo - 0.15, 0.22)
        if kind == 'shop':
            r = S.slot(min(w, 6.0), 1.2); c1 = pick(k, [0x8a2a20, 0x1f5a3a, 0x24406a, 0xc8a030, 0x30343a]); S.s.awning_paint(r[0], r[1], r[2], r[3], c1, 0xf0ece0 if rng.random() < 0.5 else None, 0.4)
            S.s.em.rect(r[0], r[1], r[2], 0.25, col(c1) * 0.25)
            Fc.awning(x + 0.05, yo - 0.45, w - 0.1, 0.95, 1.0, 0.25, uvrect=r, sh=S.s)
            if fascia: S.board(Fc, x + 0.3, yo + 0.55, w - 0.6, hf - 0.3, 0.1, glow=0.7)
        elif fascia: S.board(Fc, x + 0.2, yo + 0.05, w - 0.4, hf - 0.15, 0.14, mode='neon')
    elif kind == 'bar':
        tc = C(0x2a2a30); s.rect(x, 0, w, yo, tc); s.bricks(x, 0, w, yo, tc, mul(tc, 0.7), 0.2, 0.1)
        nc = col(pick(k, [0xff3a9a, 0x2ad0ff, 0xff8a2a, 0x8a5aff])); dw = 0.95; dx = x + w * 0.5 - dw / 2
        s.door(dx, 0, dw, 2.05, 0x3a2a24, 0x1a1a1a, glass=False)
        for (rx, ry, rw, rh) in ((dx - 0.12, 0, 0.05, 2.2), (dx + dw + 0.07, 0, 0.05, 2.2), (dx - 0.12, 2.17, dw + 0.24, 0.05)):
            s.rect(rx, ry, rw, rh, mix(nc, 0xffffff, 0.3)); e.rect(rx, ry, rw, rh, nc)
        for wx in (x + 0.3, x + w - 0.3 - 0.6):
            if abs(wx - dx) > 0.8: s.rect(wx, 1.2, 0.6, 0.6, mul(nc, 0.5)); e.rect(wx, 1.2, 0.6, 0.6, nc * 0.55); Fc.recess(wx, 1.2, 0.6, 0.6, 0.12)
        Fc.recess(dx, 0, dw, 2.05, 0.25)
        if fascia: S.board(Fc, x + 0.3, yo + 0.05, w - 0.6, hf - 0.2, 0.12, bg=hexof(nc), mode='neon')
    elif kind == 'lobby':
        fr = C(0x2e3236); s.rect(x, 0, w, yo, fr); n = max(2, int(round(w / 1.5))); bw = w / n; warm = col(0xffe6c0)
        for i in range(n):
            px = x + i * bw + 0.06; s.glass(px, 0.1, bw - 0.12, yo - 0.2, blind=0, lit=0); e.grad(px, 0.1, bw - 0.12, yo - 0.2, warm * 0.75, warm * 0.5)
        e.rect(x + w * 0.3, 0.1, w * 0.4, yo * 0.55, warm * 0.95)
        Fc.recess(x + 0.05, 0.05, w - 0.1, yo - 0.1, 0.35)
        s.rect(x - 0.2, yo, w + 0.4, 0.22, 0x8a8e90); Fc.box(max(0.0, x - 0.2), yo, min(Fc.w, x + w + 0.2) - max(0.0, x - 0.2), 0.22, 1.5, faces='flrtb'); e.rect(x, yo - 0.4, w, 0.1, warm * 0.6)
    elif kind == 'shutter':
        s.rollup(x + 0.1, 0, w - 0.2, yo - 0.1, pick(k, [0xa8aaa6, 0x8f9a9a, 0xb8b0a0, 0x7a8a9a])); Fc.recess(x + 0.1, 0, w - 0.2, yo - 0.1, 0.1)
        if fascia: S.board(Fc, x + 0.15, yo + 0.05, w - 0.3, hf - 0.15, 0.1, glow=0.12)
    elif kind == 'garage':
        s.grad(x + 0.15, 0, w - 0.3, yo, C(0x1c1d20), C(0x34363a)); e.rect(x + 0.15, yo - 0.5, w - 0.3, 0.2, col(0xfff0d0) * 0.25); Fc.recess(x + 0.15, 0, w - 0.3, yo, 1.2)
        s.rect(x, yo, w, 0.3, 0xe8c020)
        for i in range(int(w / 0.6)): s.poly([(x + i * 0.6, yo), (x + i * 0.6 + 0.3, yo), (x + i * 0.6 + 0.6, yo + 0.3), (x + i * 0.6 + 0.3, yo + 0.3)], 0x202020)
    else:  # entry to the upper floors
        s.grad(x + 0.1, 0, w - 0.2, g - 0.5, C(0x24262a), C(0x3a3c40)); e.grad(x + 0.1, 0, w - 0.2, g - 0.5, col(0xffe6c0) * 0.3, col(0xffe6c0) * 0.12)
        s.rect(x + w * 0.5 - 0.4, 0, 0.8, 2.0, 0x9aa0a4); e.rect(x + w * 0.5 - 0.4, 0, 0.8, 2.0, col(0xdfe8f0) * 0.45)
        Fc.recess(x + 0.1, 0, w - 0.2, g - 0.5, 0.8)
        S.sign(min(0.5, w * 0.3), 1.5, bg=0xf0ece0, fg=0x1a1a1e, at=(s, x + 0.14, 0.6), glow=0.5)


def zak(k, S, x0, W, D, nfl, g=3.8, fh=3.1, c=0xdedbd2, mat='tile', shops=('ramen',), floors=None, stair='rear', seed=0, par=1.0,
        blades=True, roofsign=True, tank=True, entry=1.3, pier=0.35, fd=0.3, side_c=None, wallsign='r', bladew=0.95, z1=0.0, rs_h=3.0):
    """One pencil building: front-left base corner (x0, 0, z1). Returns its roof height."""
    rng = k.rng; H = g + (nfl - 1) * fh; HT = H + par
    F, R, B, L = box4(k, x0, z1, W, D, HT, prio=(1.0, 0.5, 0.6, 0.5))
    s = F.s; c = col(c); sc = col(side_c) if side_c is not None else mix(c, 0xb4b0a8, 0.55)
    wallmat(s, 0, 0, W, HT, mat, c, seed)
    s.rect(0, HT - 0.3, W, 0.3, mul(c, 0.8)); F.box(0, HT - 0.3, W, 0.3, 0.1, faces='ftb', lod=False)
    fs = 0.0
    if stair == 'front':
        fs = 2.3; ys = [0.12] + [g + i * fh for i in range(nfl - 1)]
        s.rect(0.1, 0, fs - 0.1, HT - 0.4, mul(c, 0.72))
        for y in ys[1:]: s.door(0.7, y, 0.85, 2.0, 0x70787c, 0x9a9ea0, glass=False)
        ext_stair(F, 0.15, fs - 0.1, 1.5, ys, c=pick(k, [0x8f9496, 0x7a8a80, 0xa09a8c, 0x6a7a8a]))
    xa = max(pier, fs + 0.2); wa = W - pier - xa
    for px in ((0.0, W - pier + 0.05) if not fs else (W - pier + 0.05,)): F.box(px, g, pier - 0.05, HT - g - 0.3, 0.1, faces='flr')
    def brow(y, d=0.45):
        s.rect(xa, y, wa, 0.1, mul(c, 0.7)); F.box(xa - 0.05, y, wa + 0.1, 0.1, d, faces='flrtb'); s.vshade(xa, y - 0.5, wa, 0.5, 1.0, 0.75)
    kinds = ['ribbon', 'ribbon', 'ribbon', 'film', 'sign', 'punched', 'punched', 'glass', 'glass', 'dark']
    for i in range(1, nfl):
        y = g + (i - 1) * fh; kd = floors[(i - 1) % len(floors)] if floors else pick(k, kinds)
        lc = pick(k, LITC); s.rect(0, y - 0.15, W, 0.3, mul(c, 0.86)); F.box(xa - 0.1, y - 0.15, wa + 0.2, 0.3, 0.08, faces='ftb')
        if kd in ('ribbon', 'dark'):
            ribbon(F, xa, y + 0.95, wa, fh - 1.5, fd, pw=1.05, lit=0.0 if kd == 'dark' else (0.85 if rng.random() < 0.65 else 0.15), litc=lc, run=2)
            if rng.random() < 0.6: S.sign(min(wa * 0.6, 2.4), 0.5, at=(s, xa + 0.1 + rng.random() * wa * 0.3, y + 0.3), glow=0.8)
            if rng.random() < 0.5: brow(y + fh - 0.5)
        elif kd == 'film':
            fc = pick(k, SIGNC[:9]); ribbon(F, xa, y + 0.7, wa, fh - 1.15, fd, pw=1.0, lit=0.95, litc=lc, film=fc, run=1, blind=0)
        elif kd == 'sign':
            S.board(F, xa, y + 0.45, wa, fh - 0.8, 0.14, glow=0.95)
            for j in range(max(2, int(wa / 1.6))):     # sign lamps on arms
                lx = xa + (j + 0.5) * wa / max(2, int(wa / 1.6)); k.bar(F.P(lx, y + fh - 0.3, 0.1), F.P(lx, y + fh - 0.15, 0.75), 0.05, props(k), PR['dark'])
                pbox(k, F.P(lx - 0.1, y + fh - 0.25, 0.7), F.r * 0.2, UP * 0.1, F.n * 0.18, 'glow', 'dark', sides='flr', bottom=True)
        elif kd == 'punched':
            n = max(1, int(wa / 1.7)); ww = min(1.25, wa / n - 0.35)
            for j in range(n):
                wx = xa + (j + 0.5) * wa / n - ww / 2; win(F, wx, y + 0.95, ww, 1.45, 0.22, lit=0.6)
                s.rect(wx - 0.1, y + 0.83, ww + 0.2, 0.12, mul(c, 0.7)); F.box(wx - 0.1, y + 0.83, ww + 0.2, 0.12, 0.12, faces='flrtb')
                if rng.random() < 0.4: ac(F, wx + 0.1, y + 0.2, 0.0)
            if rng.random() < 0.5: S.sign(min(wa * 0.7, 2.2), 0.45, at=(s, xa + 0.2, y + 0.3), glow=0.7)
        else:
            ribbon(F, xa, y + 0.3, wa, fh - 0.6, 0.16, frame=0x3a3e42, pw=1.3, lit=0.8, litc=lc, run=3)
        if blades and rng.random() < 0.92:
            S.blade(F, W - pier * 0.5, y + 0.25, bladew, fh - 0.45, glow=0.95)
        if blades and not fs and rng.random() < 0.4:
            S.blade(F, pier * 0.5, y + 0.5, 0.6, 1.3 + rng.random(), glow=0.9, t=0.18)
    # ground floor
    units = list(shops); xs = fs if stair == 'front' else 0.0; wsh = W - xs
    if entry and wsh > 4.2:
        shop(F, S, xs + wsh - entry, entry, g, 'entry'); wsh -= entry
    uw = wsh / len(units)
    for i, kd in enumerate(units): shop(F, S, xs + i * uw, uw, g - 0.2, kd)
    F.wall()
    # sides
    for Fc, key in ((R, 'r'), (L, 'l')):
        ss = Fc.s; wallmat(ss, 0, 0, D, HT, 'panel' if mat != 'concrete' else 'concrete', sc, seed + 3); ss.rect(0, 0, D, 0.4, mul(sc, 0.7))
        ret = 1.2   # the front finish returns round the corner
        xr = 0.0 if key == 'r' else D - ret
        wallmat(ss, xr, 0, ret, HT, mat, c, seed + 5)
        for i in range(1, nfl):
            y = g + (i - 1) * fh
            for fx in (0.3, 0.72):
                if rng.random() < 0.45: win(Fc, D * fx, y + 1.0, 0.9, 1.2, 0.15, lit=0.5, n=1, sill=mul(sc, 0.7))
            if rng.random() < 0.3: ac(Fc, D * 0.5 + rng.random() * 1.5, y + 0.2, 0.0)
        ps = props(k)
        for fx in (0.45, 0.9): k.bar(Fc.P(D * fx, 0, 0.09), Fc.P(D * fx, HT - 0.4, 0.09), 0.12, ps, PR['steel'])
        if wallsign and key in wallsign and nfl >= 5:
            bw = min(D * 0.45, 4.5); S.board(Fc, D * 0.08 if key == 'r' else D * 0.92 - bw, H - 1.9 * fh, bw, fh * 1.5, 0.15, glow=0.85)
        Fc.wall()
    # rear
    bs = B.s; wallmat(bs, 0, 0, W, HT, 'panel', sc, seed + 7); bs.rect(0, 0, W, 0.4, mul(sc, 0.7))
    sw = min(3.4, W - 1.4) if stair == 'rear' else 0.0
    for i in range(0, nfl):
        y = g + (i - 1) * fh if i > 0 else 0.0
        if stair == 'rear': bs.door(0.5 + sw * 0.5 - 0.45, y + (0.0 if i else 0.12), 0.9, 2.0, 0x6f777a, 0x9a9ea0, glass=False)
        wx = sw + 0.9
        for q in range(1, int((W - wx - 0.3) / 2.4)):
            if i > 0: win(B, wx + q * 2.4, y + 1.0, 1.3, 1.2, 0.15, lit=0.5, box=mul(sc, 0.7))
        if W - wx > 1.3 and i > 0:
            win(B, wx, y + 1.0, min(1.3, W - wx - 0.5), 1.2, 0.15, lit=0.5, sill=mul(sc, 0.7))
            if rng.random() < 0.7: ac(B, wx + 0.1, y + 0.15, 0.0)
            F_ = B; bs.rect(wx - 0.15, y - 0.12, min(1.6, W - wx - 0.2), 0.12, mul(sc, 0.75)); F_.box(wx - 0.15, y - 0.12, min(1.6, W - wx - 0.2), 0.12, 0.5, faces='flrtb')
    if stair == 'rear': ext_stair(B, 0.5, sw, 1.7, [0.12] + [g + i * fh for i in range(nfl - 1)], c=pick(k, [0x8f9496, 0x7a8a80, 0xa09a8c, 0x9a5a48]))
    k.bar(B.P(W - 0.3, 0, 0.09), B.P(W - 0.3, HT - 0.4, 0.09), 0.12, props(k), PR['steel'])
    B.wall()
    flat_roof(k, x0, z1 - D, x0 + W, z1, H, par, 0.22, seed=seed, tank=tank, clutter=0.7)
    ps = props(k); x1 = x0 + W; zb = z1 - D     # roof safety rail
    for (a, b) in (((x0 + 0.1, zb + 0.1), (x1 - 0.1, zb + 0.1)), ((x0 + 0.1, zb + 0.1), (x0 + 0.1, z1 - 1.5)), ((x1 - 0.1, zb + 0.1), (x1 - 0.1, z1 - 1.5))):
        for hh in (0.45, 0.85): k.bar([a[0], H + par + hh, a[1]], [b[0], H + par + hh, b[1]], 0.06, ps, PR['steel'])
        for p in (a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)): k.bar([p[0], H + par, p[1]], [p[0], H + par + 0.85, p[1]], 0.06, ps, PR['steel'])
    if roofsign:
        S.roof_sign(x0 + 0.25, x0 + W - 0.25, H, z1 - 0.5, h=rs_h, legs=par + 0.5, glow=0.95)
    return H


@K.piece('tokyo_zakkyo_a', em=1024, style='zakkyo tile', stone=0xdedbd2, desc='7-storey white-tile pencil building: ramen shop with noren and lanterns, a different tenant per floor, corner sign stack, rear steel stair, rooftop billboard and panel tank')
def zakkyo_a(k):
    S = Signs(k, 12, 12)
    zak(k, S, 0, 6.6, 13.0, 7, c=TILES['white'], shops=('ramen',), seed=1)


@K.piece('tokyo_zakkyo_b', em=1024, style='zakkyo tile glass', stone=0x7f8d9a, desc='10-storey blue-grey tile and glass tenant building: convenience store on the ground, open steel stair up the front, sign stack and roof sign')
def zakkyo_b(k):
    S = Signs(k, 13, 14)
    zak(k, S, 0, 9.4, 16.0, 10, g=4.0, fh=3.2, c=TILES['bluegrey'], shops=('konbini',), stair='front', seed=2, entry=0, floors=['glass', 'ribbon', 'film', 'glass', 'sign', 'ribbon', 'glass', 'punched', 'ribbon'], rs_h=3.4)


@K.piece('tokyo_zakkyo_c', em=1024, style='zakkyo tile pair', stone=0x8a6a50, share=2, desc='fused pair: 6-storey beige-tile izakaya building and a 9-storey brown-tile tenant block with a bar and a shuttered shop')
def zakkyo_c(k):
    S = Signs(k, 14, 14)
    zak(k, S, 0, 5.4, 13.0, 6, c=TILES['beige'], shops=('izakaya',), seed=3, entry=0, wallsign='', roofsign=False)
    zak(k, S, 5.45, 7.2, 14.5, 9, g=3.9, fh=3.05, c=TILES['brown'], shops=('bar', 'shutter'), seed=4, wallsign='l', entry=1.2)


@K.piece('tokyo_zakkyo_d', em=1024, style='zakkyo tile triple', stone=0xa3a39d, share=2, desc='fused triple of different heights: white 5-storey cafe building, grey 8-storey pachinko-fronted block, green-tile 6-storey izakaya building')
def zakkyo_d(k):
    S = Signs(k, 15, 15)
    zak(k, S, 0, 4.8, 12.0, 5, c=TILES['white'], shops=('cafe',), seed=5, entry=0, wallsign='', roofsign=False, tank=False)
    zak(k, S, 4.85, 6.8, 14.0, 8, g=4.0, c=TILES['grey'], shops=('pachinko',), seed=6, entry=0, wallsign='lr', floors=['sign', 'ribbon', 'film', 'ribbon', 'glass', 'punched', 'ribbon'])
    zak(k, S, 11.7, 5.4, 12.5, 6, c=TILES['green'], shops=('izakaya',), seed=7, entry=0, wallsign='', roofsign=False, stair='rear')


@K.piece('tokyo_zakkyo_e', em=1024, style='zakkyo tile slender', stone=0xe0d4b8, desc='11-storey cream-tile sliver building 5 m wide: bar at the foot, a sign on every floor, rear stair, tank and antenna')
def zakkyo_e(k):
    S = Signs(k, 12, 14)
    H = zak(k, S, 0, 5.0, 12.5, 11, g=3.6, fh=3.0, c=TILES['cream'], shops=('bar',), seed=8, entry=1.2, pier=0.3, rs_h=2.6)
    antenna(k, 1.0, H + 1.0, -6.0, 5.0)


@K.piece('tokyo_zakkyo_f', em=1024, style='zakkyo tile wide', stone=0x4a4a50, desc='wide 5-storey black-tile amusement block: pachinko-bright ground floor, sign-covered upper floors, big rooftop billboard')
def zakkyo_f(k):
    S = Signs(k, 15, 15)
    zak(k, S, 0, 12.0, 14.0, 5, g=4.4, fh=3.4, c=TILES['black'], shops=('pachinko', 'konbini'), seed=9, entry=0, floors=['sign', 'film', 'ribbon', 'sign'], rs_h=4.2, wallsign='lr', bladew=1.2)
