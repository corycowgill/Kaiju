# Tokyo kit: glass slabs (60-120 m) and glass towers (120-240 m): stacked floor modules sharing painted sheets,
# with real relief (fins, spandrel bands, recessed ribbons, balcony rings), lit scatter, crowns, aviation lights. design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_tk import *
from kit_zakkyo import shop

OFF = [0xf4f6ff, 0xeef3ff, 0xfff4e4, 0xe8f6ee]


def curtain(g, sp, mull, bay, fh, lit=0.45, litc=None, sph=1.0, mw=0.1, hi=None):
    def paint(s, w, H, var):
        cells(s, 0, 0, w, H, fh, bay, g, sp, sph, mull, lit, litc or OFF, hi=hi, mw=mw, rng=np.random.default_rng(100 + var * 7 + int(w * 3)))
    return paint


def precast(c, g, bay, fh, lit=0.45, litc=None, ww=0.62, wy=1.0, wh=1.9):
    def paint(s, w, H, var):
        rng = np.random.default_rng(300 + var * 5 + int(w)); k = s.kit; nb = max(1, int(round(w / bay))); bw = w / nb
        wallmat(s, 0, 0, w, H, 'panel', c, var)
        for f in range(int(round(H / fh))):
            on = False; left = 0
            for i in range(nb):
                if left <= 0: on = rng.random() < lit; left = 1 + int(rng.random() * 4); cc = col((litc or OFF)[int(rng.random() * len(litc or OFF))]) * (0.6 + 0.4 * rng.random())
                left -= 1; x = i * bw + bw * (1 - ww) / 2; y = f * fh + wy
                s.rect(x - 0.06, y - 0.06, bw * ww + 0.12, wh + 0.12, mul(c, 0.6)); s.grad(x, y, bw * ww, wh, mul(g, 0.85), mix(g, GLASS_HI, 0.45))
                if rng.random() < 0.25: s.rect(x, y + wh * 0.45, bw * ww, wh * 0.55, mix(BLIND, g, 0.4))
                if on: s.em.grad(x, y, bw * ww, wh, cc * 0.7, cc)
            s.vshade(0, f * fh + wy + wh, w, 0.3, 0.85, 1.0)
    return paint


def resi(c, g, bay, fh, rail=0xb9c8ce, lit=0.5, rh=1.15):
    def paint(s, w, H, var):
        rng = np.random.default_rng(500 + var * 3 + int(w)); nb = max(1, int(round(w / bay))); bw = w / nb
        wallmat(s, 0, 0, w, H, 'panel', c, var)
        for f in range(int(round(H / fh))):
            y = f * fh
            for i in range(nb):
                x = i * bw + 0.3; ww = bw - 0.6
                s.rect(x, y + rh, ww, fh - rh - 0.35, 0x8a8e90); s.grad(x + 0.06, y + rh + 0.05, ww - 0.12, fh - rh - 0.45, mul(g, 0.85), mix(g, GLASS_HI, 0.4)); s.rect(x + ww / 2 - 0.03, y + rh, 0.06, fh - rh - 0.35, 0x8a8e90)
                if rng.random() < lit:
                    cc = col(WARM[int(rng.random() * 4)] if rng.random() < 0.8 else 0xeef3ff) * (0.55 + 0.45 * rng.random()); h2 = rng.random() < 0.3
                    s.em.grad(x + 0.06 + (ww / 2 if h2 else 0), y + rh + 0.05, (ww - 0.12) / (2 if h2 else 1), fh - rh - 0.45, cc * 0.7, cc)
            s.grad(0.3, y, w - 0.6, rh, mul(rail, 0.82), rail); s.rect(0.3, y, w - 0.6, 0.2, mul(c, 0.8)); s.rect(0.3, y + rh - 0.06, w - 0.6, 0.06, 0xd8dcdc); s.vlines(0.3, y, w - 0.6, rh, mul(rail, 0.7), bw, 0.06)
            s.vshade(0, y + fh - 0.35, w, 0.35, 1.0, 0.7)
    return paint


def relief(fh, bay, fins=0.0, bands=0.0, ribbon=0.0, sph=1.0, finw=0.22, every=1, balc=0.0, rh=1.15, lodfin=False):
    def fn(Fm, m, sd, j):
        w = Fm.w; nb = max(1, int(round(w / bay))); bw = w / nb
        if ribbon:
            for f in range(m): Fm.recess(0.5, f * fh + sph, w - 1.0, fh - sph - 0.2, ribbon)
        if bands:
            for f in range(m): Fm.box(0, f * fh, w, sph * 0.6, bands, faces='ftb')
        if fins:
            for i in range(0, nb + 1, every): Fm.box(min(w - finw, max(0.0, i * bw - finw / 2)), 0, finw, m * fh, fins, faces='flr')
        if balc:
            for f in range(m): Fm.box(0.3, f * fh, w - 0.6, rh, balc, faces='flrtb')
    return fn


def lobby(k, x0, x1, z0, z1, g, c=0xb9b4a8, bay=6.0, seed=0, glass=0x3c4c5c):
    def paint(s, w, H, var):
        wallmat(s, 0, 0, w, H, 'stone', c, seed); n = max(1, int(round(w / bay))); bw = w / n; warm = col(0xffe9c8)
        for i in range(n):
            x = i * bw + 0.7; ww = bw - 1.4
            s.rect(x, 0, ww, H - 1.2, 0x44484c); s.grad(x + 0.1, 0.1, ww - 0.2, H - 1.4, mul(glass, 0.8), mix(glass, GLASS_HI, 0.5)); s.vlines(x, 0, ww, H - 1.2, 0x44484c, ww / 3, 0.08)
            s.em.grad(x + 0.1, 0.1, ww - 0.2, H - 1.4, warm * (0.9 if (i + var) % 3 else 0.35), warm * 0.4)
        s.rect(0, H - 0.5, w, 0.5, mul(c, 0.8))
    def rel(Fm, m, sd, j):
        n = max(1, int(round(Fm.w / bay))); bw = Fm.w / n
        for i in range(n): Fm.recess(i * bw + 0.7, 0, bw - 1.4, g - 1.2, 0.6)
        Fm.box(0, g - 0.5, Fm.w, 0.5, 0.3, faces='ftb')
    return stack(k, x0, x1, z0, z1, 0, 1, g, 1, paint, rel, nv=2, prio=1.3, key='lobby')


def crown(k, x0, x1, z0, z1, y, h, c=0x9aa4aa, glow=0xbfe4ff, inset=0.0, gl=0.9, lod=1):
    """Roof screen box with a lit band (the crown ring)."""
    s = k.sheet(8.0, h, 0.7, 'crown'); s.rect(0, 0, 8, h, c); s.vlines(0, 0, 8, h, mul(c, 0.75), 0.8, 0.12); s.rect(0, h - 0.25, 8, 0.25, mul(c, 1.15))
    if glow is not None: s.rect(0, h * 0.25, 8, h * 0.4, mix(c, 0xf0f4f4, 0.6)); s.em.grad(0, h * 0.25, 8, h * 0.4, col(glow) * gl * 0.75, col(glow) * gl)
    x0 += inset; x1 -= inset; z0 += inset; z1 -= inset
    k.box(x0, y, z0, x1, y + h, z1, s, (0, 0, 8, h), (0, h - 0.2, 1, 0.15), lod=lod)
    return y + h


def top_lights(k, x0, x1, z0, z1, y, mast=0.0):
    for (x, z) in ((x0 + 0.3, z0 + 0.3), (x1 - 0.3, z0 + 0.3), (x0 + 0.3, z1 - 0.3), (x1 - 0.3, z1 - 0.3)): avi(k, x, y, z, 0.7)
    if mast: antenna(k, (x0 + x1) / 2, y, (z0 + z1) / 2, mast)


def roofstuff(k, x0, x1, z0, z1, y, seed=0, n=4):
    rng = np.random.default_rng(seed)
    for i in range(n): plant(k, x0 + 1.5 + rng.random() * max(0.5, x1 - x0 - 7), y, z0 + 1.5 + rng.random() * max(0.5, z1 - z0 - 6), 3.0 + 2 * rng.random(), 2.0 + rng.random(), 2.5 + 2 * rng.random())
    frp_tank(k, x1 - 6.0, y, z0 + 2.0, 4.0, 2.4, 3.0, legs=1.0)


def simple(k, W, D, g, nfl, fh, mod, paint, rel, roofc=None, seed=0, lob=0xb9b4a8, crown_h=4.0, crown_c=0x9aa4aa, glow=None, mast=0.0, lights=True, cache=None, nv=2):
    y = lobby(k, 0, W, -D, 0, g, lob, seed=seed)
    y = stack(k, 0, W, -D, 0, y, nfl, fh, mod, paint, rel, nv=nv, cache=cache)
    rs = roof_plan(k, W, D, roofc, seed); deck(k, rs, 0, W, -D, 0, y, par=1.2)
    yc = crown(k, 0, W, -D, 0, y, crown_h, crown_c, glow, inset=3.0) if crown_h else y
    roofstuff(k, 0, 3.0, -D, 0, y, seed, 0) if False else None
    if lights: top_lights(k, 3.0, W - 3.0, -D + 3.0, -3.0, yc, mast)
    return y, yc


# ------------------------------------------------------------------ glass slabs
@K.piece('tokyo_glassslab_a', style='glassslab bronze', stone=0x6a5a4a, desc='1970s bronze-glass office slab: 19 floors of dark bronze curtain wall behind projecting anodised fins over a stone-pier lobby, louvred roof plant')
def glassslab_a(k):
    fh, bay = 3.8, 1.7
    y, yc = simple(k, 44.0, 24.0, 6.0, 19, fh, 5, curtain(0x4e4034, 0x3a2e24, 0x6a5440, bay, fh, 0.45, [0xffe9c0, 0xfff0d0, 0xf4f0e0]), relief(fh, bay, fins=0.45, bands=0.12, sph=1.0), seed=1, crown_c=0x6a5a4a, lob=0x9a9080)


@K.piece('tokyo_glassslab_b', style='glassslab clear podium', stone=0xbfb8a8, desc='Marunouchi-style block: 7-storey stone podium with deep punched windows and piers, a clear blue-green glass slab of 19 floors set back above it')
def glassslab_b(k):
    W, D, g, fh, bay = 46.0, 30.0, 6.5, 4.0, 3.6; c = C(0xc4bcaa)
    y = lobby(k, 0, W, -D, 0, g, 0xa8a090, bay=5.75, seed=2)
    def pp(s, w, H, var):
        precast(c, 0x34424f, bay, fh, 0.5, OFF, 0.5, 1.0, 2.3)(s, w, H, var); wallmat(s, 0, 0, w, 0.01, 'stone', c, 1)
    def pr(Fm, m, sd, j):
        nb = max(1, int(round(Fm.w / bay))); bw = Fm.w / nb
        for f in range(m):
            for i in range(nb): Fm.recess(i * bw + bw * 0.25, f * fh + 1.0, bw * 0.5, 2.3, 0.45)
    y = stack(k, 0, W, -D, 0, y, 6, fh, 3, pp, pr, nv=2, key='pod')
    rs = roof_plan(k, W, D, None, 2); deck(k, rs, 0, W, -D, 0, y, par=1.4, cc=0xc4bcaa)
    cb = k.sheet(8, 1.4, 0.6, 'cornice'); cornice_paint(cb, 0, 0, 8, 1.4, c, 0.5)
    for Fc in box4(k, -0.5, 0.5, W + 1.0, D + 1.0, 1.4, y - 1.4): Fc.s = cb; Fc.wall()
    k.emit([V(-0.5, y, 0.5), V(W + 0.5, y, 0.5), V(W + 0.5, y, -D - 0.5), V(-0.5, y, -D - 0.5)], cb, [(0, 1.3), (1, 1.3), (1, 1.38), (0, 1.38)], UP, 1)
    k.emit([V(-0.5, y - 1.4, 0.5), V(W + 0.5, y - 1.4, 0.5), V(W + 0.5, y - 1.4, -D - 0.5), V(-0.5, y - 1.4, -D - 0.5)], cb, [(0, 0.02), (1, 0.02), (1, 0.1), (0, 0.1)], -UP, 1)
    fh2, b2 = 4.0, 1.8; x0, x1, z0, z1 = 5.0, W - 5.0, -D + 4.0, -5.0
    y2 = stack(k, x0, x1, z0, z1, y, 19, fh2, 5, curtain(0x4a6a72, 0x39545c, 0xa8b4b8, b2, fh2, 0.5, OFF, hi=0x9ac0c4), relief(fh2, b2, fins=0.3, every=2, bands=0.15, sph=1.0))
    deck(k, rs, x0, x1, z0, z1, y2, par=1.2)
    yc = crown(k, x0, x1, z0, z1, y2, 4.5, 0xa8b4b8, None, inset=3.0); top_lights(k, x0 + 3, x1 - 3, z0 + 3, z1 - 3, yc, 6.0)


@K.piece('tokyo_glassslab_c', style='glassslab mansion tower', stone=0xd0d0c8, desc='tower-mansion: 31 residential floors ringed by glass-railed balconies between corner piers, over a stone podium, with a softly lit crown')
def glassslab_c(k):
    W, D, fh, bay = 30.0, 30.0, 3.1, 5.6; c = C(0xd4d2c8)
    y = lobby(k, -2, W + 2, -D - 2, 2, 7.0, 0xb0a898, bay=5.6, seed=3)
    rs = roof_plan(k, W + 4, D + 4, 0x8f9a84, 3); deck(k, rs, -2, W + 2, -D - 2, 2, y, X0=-2, Z1=2, par=1.0)
    y2 = stack(k, 0, W, -D, 0, y, 31, fh, 8, resi(c, 0x3a4854, bay, fh), relief(fh, bay, balc=1.3, fins=1.35, every=99, finw=0.9))
    deck(k, rs, 0, W, -D, 0, y2, X0=-2, Z1=2, par=1.0)
    yc = crown(k, 0, W, -D, 0, y2, 3.6, 0xc8c8c0, 0xffe2b0, inset=1.5, gl=0.8); top_lights(k, 1.5, W - 1.5, -D + 1.5, -1.5, yc, 0)


@K.piece('tokyo_glassslab_d', style='glassslab precast grid', stone=0xe0dcd0, share=2, desc='pale precast-grid office tower of 18 floors: recessed window bands between projecting piers, stone lobby, plant screen and rooftop sign')
def glassslab_d(k):
    fh, bay = 3.9, 3.2; c = C(0xe2ded2)
    y, yc = simple(k, 32.0, 28.0, 6.0, 18, fh, 6, precast(c, 0x34424f, bay, fh, 0.48, OFF, 0.7, 1.05, 2.0), relief(fh, bay, fins=0.4, finw=0.7, ribbon=0.4, sph=1.05), seed=4, crown_c=0xcfcabd, crown_h=3.5)
    S = Signs(k, 10); S.roof_sign(8.0, 24.0, yc, -3.2, h=3.2, legs=0.6, glow=0.9)


# ------------------------------------------------------------------ glass towers
@K.piece('tokyo_glasstower_a', style='glasstower glass sloped', stone=0x8fb0bc, desc='130 m blue-glass office tower with a sloped glazed crown: curtain wall with fins and spandrel bands, stone lobby, aviation lights')
def glasstower_a(k):
    W, D, g, fh, bay, nfl = 36.0, 34.0, 8.0, 4.1, 1.8, 27
    paint = curtain(0x44667a, 0x33505f, 0x9ab0b8, bay, fh, 0.47, OFF, hi=0x8fb8cc); cache = {}
    y = lobby(k, 0, W, -D, 0, g, 0xb4b0a6, seed=5)
    y = stack(k, 0, W, -D, 0, y, nfl, fh, 6, paint, relief(fh, bay, fins=0.35, every=2, bands=0.14), cache=cache)
    # sloped crown: front edge low, rear high
    ch = 13.0; sh = cache[('', round(W, 2), round(6 * fh, 2), 0)]; ss = cache[('', round(D, 2), round(6 * fh, 2), 0)]
    k.emit([V(W, y, -D), V(0, y, -D), V(0, y + ch, -D), V(W, y + ch, -D)], sh, [(0, 0), (W, 0), (W, ch), (0, ch)], V(0, 0, -1), 3)
    for xx, sg in ((0, -1), (W, 1)): k.emit([V(xx, y, 0), V(xx, y, -D), V(xx, y + ch, -D)], ss, [(0, 0), (D, 0), (D, ch)] if sg < 0 else [(D, 0), (0, 0), (0, ch)], V(sg, 0, 0), 3)
    L = math.hypot(D, ch); cs = k.sheet(W, 6 * fh, 1.0, 'slopeglass'); paint(cs, W, 6 * fh, 3); n = 4
    for i in range(n):
        a = i / n; b = (i + 1) / n
        k.emit([V(0, y + ch * a, -D * a), V(W, y + ch * a, -D * a), V(W, y + ch * b, -D * b), V(0, y + ch * b, -D * b)], cs, [(0, 0), (W, 0), (W, min(6 * fh, L / n)), (0, min(6 * fh, L / n))], V(0, 1, 1), 3)
    for i in range(0, 21, 2): k.bar([i * W / 20, y + 0.1, 0.1], [i * W / 20, y + ch + 0.1, -D + 0.1], 0.3, props(k), PR['steel'])
    for (x, z) in ((0.4, -D + 0.4), (W - 0.4, -D + 0.4)): avi(k, x, y + ch, z, 0.8)
    avi(k, 0.4, y, -0.5, 0.8); avi(k, W - 0.4, y, -0.5, 0.8)


def round_tier(k, x0, x1, z0, z1, y0, nfl, fh, mod, paint, rel, c, n=3, cache=None, key=''):
    """stack() + faceted rounded corners."""
    cache = {} if cache is None else cache
    y = stack(k, x0, x1, z0, z1, y0, nfl, fh, mod, paint, rel, cache=cache, key=key, inset=c)
    ch = 2 * c * math.sin(math.pi / (4 * n)); modH = min(mod, nfl) * fh
    cs = k.sheet(ch * n, modH, 1.0, 'corner'); paint(cs, ch * n, modH, 5)
    for q, (cx, cz, a0) in enumerate(((x1 - c, z1 - c, 0.0), (x1 - c, z0 + c, math.pi / 2), (x0 + c, z0 + c, math.pi), (x0 + c, z1 - c, 1.5 * math.pi))):
        for i in range(n):
            a = a0 + (math.pi / 2) * i / n; b = a0 + (math.pi / 2) * (i + 1) / n
            pa = V(cx + c * math.sin(a), 0, cz + c * math.cos(a)); pb = V(cx + c * math.sin(b), 0, cz + c * math.cos(b)); d = (pb - pa) / ch
            f0 = 0
            while f0 < nfl:
                m = min(mod, nfl - f0); Fm = k.facade((pa[0], y0 + f0 * fh, pa[2]), d, ch, m * fh, sheet=cs, su=i * ch); Fm.wall(); f0 += m
    return y


def round_deck(k, rs, x0, x1, z0, z1, y, c, n=3, X0=0.0, Z1=0.0):
    pts = []
    for (cx, cz, a0) in ((x1 - c, z1 - c, 0.0), (x1 - c, z0 + c, math.pi / 2), (x0 + c, z0 + c, math.pi), (x0 + c, z1 - c, 1.5 * math.pi)):
        for i in range(n + 1): a = a0 + (math.pi / 2) * i / n; pts.append((cx + c * math.sin(a), cz + c * math.cos(a)))
    k.roof_poly(pts, y, rs, X0, Z1)


@K.piece('tokyo_glasstower_b', style='glasstower glass rounded', stone=0x9cc0c0, desc='160 m green-glass tower with rounded corners: horizontal spandrel bands on every floor, a double-height lit lobby, a recessed lit crown and a roof mast')
def glasstower_b(k):
    W, D, g, fh, bay, nfl, c = 38.0, 38.0, 8.0, 4.2, 1.9, 34, 6.0
    paint = curtain(0x4a7470, 0x3a5c58, 0xb0c0bc, bay, fh, 0.5, OFF, hi=0x9cd0c8); rs = roof_plan(k, W, D, None, 6)
    def lp(s, w, H, var): cells(s, 0, 0, w, H, H, 2.4, 0x3c4c5c, 0x8a8e88, 1.2, 0x55595c, 0.9, [0xffe9c8], mw=0.14, floors=[0.9])
    y = round_tier(k, 0, W, -D, 0, 0, 1, g, 1, lp, lambda Fm, m, sd, j: Fm.box(0, g - 0.7, Fm.w, 0.7, 0.4, faces='ftb'), c, key='lob')
    y = round_tier(k, 0, W, -D, 0, y, nfl, fh, 6, paint, relief(fh, bay, bands=0.3, sph=1.0), c)
    round_deck(k, rs, 0, W, -D, 0, y, c)
    y2 = round_tier(k, 2.5, W - 2.5, -D + 2.5, -2.5, y, 1, 5.0, 1, lambda s, w, H, var: (s.rect(0, 0, w, H, 0xa8b8b4), s.vlines(0, 0, w, H, 0x7a8a86, 0.9, 0.14), s.rect(0, H * 0.3, w, H * 0.35, 0xe0ecea), s.em.grad(0, H * 0.3, w, H * 0.35, col(0xbff0e0) * 0.7, col(0xbff0e0) * 0.95)), None, c - 2.0, key='crown')
    round_deck(k, rs, 2.5, W - 2.5, -D + 2.5, -2.5, y2, c - 2.0)
    top_lights(k, 6, W - 6, -D + 6, -6, y2, 14.0); plant(k, 12, y2, -24, 6, 2.5, 5); plant(k, 21, y2, -16, 5, 2.2, 4)


@K.piece('tokyo_glasstower_c', style='glasstower glass setback', stone=0x8a98a8, desc='190 m stepped tower: three glass-and-fin tiers setting back at the 26th and 38th floors, each terrace edged with a lit band, mast on the top tier')
def glasstower_c(k):
    W, g, fh, bay = 42.0, 8.0, 4.15, 1.75
    paint = curtain(0x3e4c62, 0x2c3848, 0x8a94a4, bay, fh, 0.48, OFF, hi=0x8aa0c0); rel = relief(fh, bay, fins=0.4, every=2, bands=0.12)
    y = lobby(k, 0, W, -W, 0, g, 0xa8a8a8, seed=7); rs = roof_plan(k, W, W, None, 7)
    x0, x1 = 0.0, W
    for i, (nf, ins) in enumerate(((25, 0.0), (12, 5.0), (7, 4.5))):
        x0 += ins; x1 -= ins
        y = stack(k, x0, x1, -x1, -x0, y, nf, fh, 6, paint, rel)
        deck(k, rs, x0, x1, -x1, -x0, y, par=0.0)
        yc = crown(k, x0, x1, -x1, -x0, y, 1.6, 0x8a94a4, 0xcfe4ff, inset=0.0 if i < 2 else 0.0, gl=0.85)
        for (x, z) in ((x0 + 0.4, -x0 - 0.4), (x1 - 0.4, -x0 - 0.4), (x0 + 0.4, -x1 + 0.4), (x1 - 0.4, -x1 + 0.4)): avi(k, x, yc, z, 0.7)
        y = y   # next tier starts at the deck (the lit band wraps its foot)
    plant(k, x0 + 3, yc, -x1 + 3, 8, 3.5, 6, lod=1); antenna(k, (x0 + x1) / 2, yc, -(x0 + x1) / 2 + 3, 16.0)


@K.piece('tokyo_glasstower_d', style='glasstower mansion crown', stone=0xc8ccd0, desc='230 m tower-mansion: 68 residential floors ringed by glass-railed balconies between white corner piers, podium with shops, a brightly lit crown ring and aviation lights')
def glasstower_d(k):
    W, fh, bay = 38.0, 3.15, 6.3; c = C(0xd8dadc); S = Signs(k, 10)
    P = box4(k, -4, 4, W + 8, W + 8, 9.0, prio=(1.2, 1.0, 0.8, 1.0))
    for Fc in P:
        wallmat(Fc.s, 0, 0, Fc.w, 9.0, 'stone', 0xb8b4aa, 8); n = 7; uw = Fc.w / n
        for i in range(n): shop(Fc, S, i * uw + 0.6, uw - 1.2, 4.6, ['lobby', 'shop', 'cafe', 'konbini', 'shop', 'cafe', 'shop'][(i + int(Fc.w)) % 7] if Fc is not P[2] else 'garage')
        ribbon(Fc, 1.5, 5.8, Fc.w - 3.0, 2.0, 0.3, 0x5a5e62, pw=1.6, lit=0.6, run=4); Fc.wall()
    rs = roof_plan(k, W + 8, W + 8, 0x8f9a84, 8); deck(k, rs, -4, W + 4, -W - 4, 4, 9.0, X0=-4, Z1=4, par=1.1)
    y = stack(k, 0, W, -W, 0, 9.0, 68, fh, 8, resi(c, 0x3a4a5a, bay, fh, rail=0xa8c0cc), relief(fh, bay, balc=1.3, fins=1.4, every=99, finw=1.0))
    deck(k, rs, 0, W, -W, 0, y, X0=-4, Z1=4, par=1.0)
    yc = crown(k, 0, W, -W, 0, y, 6.0, 0xd0d4d8, 0xcfe8ff, inset=2.0, gl=1.0); top_lights(k, 2, W - 2, -W + 2, -2, yc, 9.0)
    for yy in (80.0, 150.0):
        for (x, z) in ((-0.2, 0.2), (W + 0.2, 0.2), (-0.2, -W - 0.2), (W + 0.2, -W - 0.2)): avi(k, x, yy, z, 0.6)
