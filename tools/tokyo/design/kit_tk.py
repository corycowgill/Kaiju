# Tokyo kit: shared parts on top of kit_lib (design-kit). Walls, windows with lit scatter, balconies,
# blade / fascia / roof signs with abstract glyphs, shopfronts, external stairs, tiled pitched roofs,
# roof plant, stacked tower modules. Everything paints albedo AND the emissive twin (s.em).
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_parts import wallpaint, downpipe, cornice_paint

SIGNC = [0xd82a2a, 0xf2c81e, 0x1f5fd0, 0x1f9d55, 0xd42a8a, 0xf07a1a, 0xf4f4f0, 0x25b8d0, 0x7a3ad0, 0x1a1a1e, 0xe8455a, 0x2ac0a0]
WARM = [0xffd7a0, 0xffe2b8, 0xffe9c8, 0xfff0d8]
COOL = [0xfff4e4, 0xeef3ff, 0xe4eeff, 0xe8f6ee]
V = lambda *a: np.array(a, dtype=float)


def pick(k, lst):
    return lst[int(k.rng.random() * len(lst)) % len(lst)]


# ------------------------------------------------------------------ walls
def tile(s, x, y, w, h, c, seed=0, amt=1.0, bw=0.3, bh=0.1):
    s.bricks(x, y, w, h, c, mul(c, 0.84), bw=bw, bh=bh, var=0.07, mw=0.014)
    s.weather(x, y, w, h, amt, seed)


def wallmat(s, x, y, w, h, mat, c, seed=0, amt=1.0):
    if mat == 'tile': tile(s, x, y, w, h, c, seed, amt)
    elif mat == 'bigtile': tile(s, x, y, w, h, c, seed, amt, 0.6, 0.3)
    elif mat == 'wood':
        s.vboards(x, y, w, h, c, 0.18, 0.22); s.noise(x, y, w, h, 0.12, 0.15, 1.5, seed); s.weather(x, y, w, h, amt, seed)
    elif mat == 'panel':
        s.rect(x, y, w, h, c); s.hlines(x, y, w, h, mul(c, 0.86), 0.9, 0.025); s.vlines(x, y, w, h, mul(c, 0.86), 1.8, 0.025); s.weather(x, y, w, h, amt * 0.7, seed)
    elif mat == 'stone':
        s.bricks(x, y, w, h, c, mul(c, 0.8), bw=1.2, bh=0.6, var=0.06, mw=0.02); s.weather(x, y, w, h, amt, seed)
    elif mat == 'copper':
        s.bricks(x, y, w, h, c, mul(c, 0.7), bw=0.45, bh=0.3, var=0.12, mw=0.02); s.noise(x, y, w, h, 0.14, 0.4, 1.6, seed); s.weather(x, y, w, h, amt, seed)
    else: wallpaint(s, x, y, w, h, mat, c, seed, amt)


def box4(k, x0, z1, W, D, H, y0=0.0, prio=(1.0, 0.7, 0.7, 0.7), names='frbl'):
    """Four facades of a box whose front-left base corner is (x0, y0, z1). Returns [F, R, B, L]."""
    return [k.facade((x0, y0, z1), (1, 0, 0), W, H, prio=prio[0], name='front'),
            k.facade((x0 + W, y0, z1), (0, 0, -1), D, H, prio=prio[1], name='right'),
            k.facade((x0 + W, y0, z1 - D), (-1, 0, 0), W, H, prio=prio[2], name='back'),
            k.facade((x0, y0, z1 - D), (0, 0, 1), D, H, prio=prio[3], name='left')]


# ------------------------------------------------------------------ windows
def win(Fc, x, y, w, h, d=0.2, frame=0xc9ccce, n=2, lit=None, litc=None, blind=0.35, glass=None, sill=None, trim=None, tw=0.08, fw=0.05, ny=1, film=None, box=None):
    """A sash window (n panes) lit or dark as a whole; recessed d (0: painted only)."""
    s = Fc.s; k = Fc.k; rng = k.rng
    lit = k.lit if lit is None else lit
    on = rng.random() < lit
    cc = (litc if litc is not None else pick(k, k.litc or LITC)) if on else None
    if trim is not None: s.rect(x - tw, y - tw, w + 2 * tw, h + 2 * tw, trim)
    if sill is not None:
        s.rect(x - 0.08, y - 0.1, w + 0.16, 0.1, sill); s.vshade(x, y - 0.5, w, 0.4, 1.0, 0.88)
    s.rect(x, y, w, h, frame)
    pw = (w - fw * (n + 1)) / n; ph = (h - fw * (ny + 1)) / ny
    bl = rng.random() < blind
    for j in range(ny):
        for i in range(n):
            px = x + fw + i * (pw + fw); py = y + fw + j * (ph + fw)
            s.glass(px, py, pw, ph, glass, blind=0, lit=0)
            if bl:
                bc = mix(BLIND, GLASS, 0.3); f = 0.35 + 0.6 * rng.random() if i == 0 else f
                s.rect(px, py + ph * (1 - f), pw, ph * f, bc)
            if film is not None: s.rect(px, py, pw, ph, film, 0.75)
            if on:
                f2 = 0.6 + 0.4 * rng.random() if i == 0 and j == 0 else f2
                c = col(cc) * f2
                if film is not None: c = mix(c, col(film) * 1.2, 0.6)
                if bl: s.em.rect(px, py, pw, ph, c * 0.62)
                else: s.em.grad(px, py, pw, ph, c * 0.66, c)
    if d > 0: Fc.recess(x, y, w, h, d)
    if box is not None:
        s.rect(x - 0.1, y - 0.11, w + 0.2, 0.11, box); Fc.box(x - 0.1, y - 0.11, w + 0.2, 0.11, 0.11, faces='flrtb'); s.vshade(x, y - 0.45, w, 0.34, 1.0, 0.86)
    return on


def wins(Fc, xs, ys, w, h, skip=0.0, **kw):
    for y in ys:
        for x in xs:
            if skip and Fc.k.rng.random() < skip: continue
            win(Fc, x, y, w, h, **kw)


def ribbon(Fc, x, y, w, h, d=0.25, frame=0x8a8f94, pw=1.3, lit=None, litc=None, run=3, glass=None, blind=0.25, film=None, fw=0.06):
    """A band window: panes pw wide, lit in runs."""
    s = Fc.s; k = Fc.k; rng = k.rng
    lit = k.lit if lit is None else lit
    n = max(1, int(round(w / pw))); pw = (w - fw) / n
    s.rect(x, y, w, h, frame)
    on = False; left = 0; cc = None
    for i in range(n):
        if left <= 0:
            on = rng.random() < lit; left = 1 + int(rng.random() * run * 2); cc = col(litc if litc is not None else pick(k, k.litc or LITC)) * (0.6 + 0.4 * rng.random())
        left -= 1
        px = x + fw + i * pw
        s.glass(px, y + fw, pw - fw, h - 2 * fw, glass, blind=0, lit=0)
        bl = rng.random() < blind
        if bl: s.rect(px, y + fw + (h - 2 * fw) * 0.35, pw - fw, (h - 2 * fw) * 0.65, mix(BLIND, GLASS, 0.3))
        if film is not None and rng.random() < 0.6: s.rect(px, y + fw, pw - fw, h - 2 * fw, film, 0.7)
        if on:
            if bl: s.em.rect(px, y + fw, pw - fw, h - 2 * fw, cc * 0.6)
            else: s.em.grad(px, y + fw, pw - fw, h - 2 * fw, cc * 0.68, cc)
    if d > 0: Fc.recess(x, y, w, h, d)


def cells(s, x, y, w, H, fh, bay, g=0x3c4c5c, sp=None, sph=0.9, mull=0x7a8088, lit=0.45, litc=None, run=4, hi=None, mw=0.08, rng=None, floors=None):
    """Curtain wall: per floor a glass row over a spandrel band; lit in runs per floor."""
    k = s.kit; rng = rng or k.rng
    nfl = int(round(H / fh)); nb = max(1, int(round(w / bay))); bw = w / nb
    g = col(g); sp = mul(g, 0.75) if sp is None else col(sp)
    hi = mix(g, GLASS_HI, 0.6) if hi is None else col(hi)
    for f in range(nfl):
        yy = y + f * fh
        s.rect(x, yy, w, sph, sp)
        s.grad(x, yy + sph, w, fh - sph, mul(g, 0.9), mix(g, hi, 0.5))
        s.vshade(x, yy + fh - 0.3, w, 0.3, 1.0, 0.72)
        left = 0; on = False; fl = lit * (0.4 + 1.2 * rng.random()) if floors is None else floors[f % len(floors)]
        for i in range(nb):
            if left <= 0:
                on = rng.random() < fl; left = 1 + int(rng.random() * run * 2)
                cc = col(litc[int(rng.random() * len(litc))] if litc else pick(k, COOL)) * (0.55 + 0.45 * rng.random())
            left -= 1
            px = x + i * bw
            if rng.random() < 0.18: s.rect(px + mw / 2, yy + sph + (fh - sph) * 0.4, bw - mw, (fh - sph) * 0.6, mix(BLIND, g, 0.45))
            if on: s.em.grad(px + mw / 2, yy + sph + 0.05, bw - mw, fh - sph - 0.1, cc * 0.7, cc)
    for i in range(nb + 1): s.rect(x + i * bw - mw / 2, y, mw, H, mull)
    s.noise(x, y, w, H, 0.06, 6.0, 9.0, 3)


# ------------------------------------------------------------------ props sheet
PR = {'ac': (0, 0, 0.9, 0.7), 'white': (0.95, 0, 0.3, 0.7), 'steel': (1.3, 0, 0.5, 0.7), 'dark': (1.85, 0, 0.5, 0.7), 'rail': (2.4, 0, 2.0, 1.2),
      'avi': (4.45, 0, 0.3, 0.3), 'glow': (4.45, 0.35, 0.3, 0.3), 'green': (4.8, 0, 0.6, 0.7), 'tarp': (5.45, 0, 0.6, 0.7), 'wood': (6.1, 0, 0.9, 0.7), 'crate': (7.05, 0, 0.9, 0.7),
      'lan_r': (0, 1.3, 1.4, 0.6), 'lan_w': (1.45, 1.3, 1.4, 0.6), 'futon0': (2.9, 1.3, 1.0, 0.6), 'futon1': (3.95, 1.3, 1.0, 0.6), 'futon2': (5.0, 1.3, 1.0, 0.6), 'block': (6.05, 1.3, 1.95, 0.6),
      'vend0': (0, 2.0, 1.15, 1.9), 'vend1': (1.2, 2.0, 1.15, 1.9), 'vend2': (2.4, 2.0, 1.15, 1.9), 'vend3': (3.6, 2.0, 1.15, 1.9),
      'bulk': (4.8, 2.0, 3.2, 2.6), 'tank': (0, 4.0, 3.0, 2.0), 'louvre': (3.05, 4.0, 1.7, 2.0),
      'noren0': (0, 6.1, 2.4, 0.9), 'noren1': (2.45, 6.1, 2.4, 0.9), 'noren2': (4.9, 6.1, 2.4, 0.9), 'shutter': (4.8, 4.7, 3.2, 1.3), 'top': (7.4, 6.1, 0.6, 0.9),
      'verm': (4.8, 4.0, 0.6, 0.6), 'gold': (5.45, 4.0, 0.3, 0.6), 'red': (5.8, 4.0, 0.6, 0.6), 'yellow': (6.45, 4.0, 0.6, 0.6), 'blue': (7.1, 4.0, 0.6, 0.6), 'conc': (0, 0.75, 3.0, 0.5), 'pallet': (3.1, 0.75, 1.2, 0.5), 'cont': (4.4, 0.75, 3.5, 0.5)}


def props(k):
    if getattr(k, '_tkp', None) is not None: return k._tkp
    s = k.sheet(8.0, 7.0, 0.9, 'tkprops'); k._tkp = s; e = s.em; rng = np.random.default_rng(7)
    s.rect(0, 0, 8, 7, 0x8a8c8c)
    x, y, w, h = PR['ac']; s.rect(x, y, w, h, 0xdcdcd4); s.ellipse(x + 0.33, y + 0.35, 0.26, 0.26, 0x4a4e50); s.ellipse(x + 0.33, y + 0.35, 0.08, 0.08, 0x9a9c9a); s.hlines(x + 0.66, y + 0.1, 0.2, 0.5, 0x9a9c98, 0.07, 0.025); s.rect(x, y, w, 0.04, 0x8a8a84)
    x, y, w, h = PR['white']; s.rect(x, y, w, h, 0xdcdcd4); s.noise(x, y, w, h, 0.05, 0.2, 0.2, 1)
    x, y, w, h = PR['steel']; s.rect(x, y, w, h, 0x9a9ea0); s.noise(x, y, w, h, 0.1, 0.2, 0.3, 2)
    x, y, w, h = PR['dark']; s.rect(x, y, w, h, 0x3a3d40); s.noise(x, y, w, h, 0.1, 0.2, 0.3, 3)
    x, y, w, h = PR['rail']; s.rect(x, y, w, h, 0x6a6e70); s.vlines(x, y + 0.1, w, h - 0.2, 0xb4b8b8, 0.14, 0.05); s.rect(x, y + h - 0.1, w, 0.1, 0xc4c8c8); s.rect(x, y, w, 0.12, 0x8a8e90)
    x, y, w, h = PR['avi']; s.rect(x, y, w, h, 0xb02020); e.rect(x, y, w, h, 0xff2a1a)
    x, y, w, h = PR['glow']; s.rect(x, y, w, h, 0xf0ecd8); e.rect(x, y, w, h, 0xfff0d0)
    x, y, w, h = PR['green']; s.rect(x, y, w, h, 0x4a6a3a); s.noise(x, y, w, h, 0.35, 0.08, 0.08, 4); s.rect(x, y, w, 0.25, 0x8a5a40)
    x, y, w, h = PR['tarp']; s.rect(x, y, w, h, 0x2f62b4); s.noise(x, y, w, h, 0.15, 0.2, 0.1, 5)
    x, y, w, h = PR['wood']; s.vboards(x, y, w, h, C(0x5a4030), 0.15, 0.25); s.noise(x, y, w, h, 0.15, 0.1, 0.6, 6)
    x, y, w, h = PR['crate']; s.rect(x, y, w, h, 0xe0b020); s.rect(x + 0.45, y, 0.45, h, 0x2a62b0); s.hlines(x, y, w, h, 0x403a30, 0.35, 0.05); s.vlines(x, y, w, h, 0x403a30, 0.45, 0.04)
    for nm, c, ec in (('lan_r', 0xc8281e, 0xff5a28), ('lan_w', 0xe8e0c8, 0xffe2b0)):
        x, y, w, h = PR[nm]; s.grad(x, y, w, h, mul(c, 0.8), c); s.hlines(x, y + 0.08, w, h - 0.16, mul(c, 0.82), 0.07, 0.015)
        s.rect(x, y, w, 0.07, 0x1a1a1a); s.rect(x, y + h - 0.07, w, 0.07, 0x1a1a1a)
        e.grad(x, y + 0.07, w, h - 0.14, col(ec) * 0.75, col(ec))
        for i in range(3):
            gx = x + (i + 0.5) * w / 3
            for j in range(3):
                bw = 0.04 + 0.1 * rng.random(); by = y + 0.14 + j * 0.11; bx = gx - 0.08 + 0.08 * rng.random()
                s.rect(bx, by, bw, 0.035, 0x1a1a1a); e.rect(bx, by, bw, 0.035, 0x100808)
    for i, c in enumerate((0xe8e4dc, 0xd8a8b0, 0x8fb0d0)):
        x, y, w, h = PR['futon%d' % i]; s.rect(x, y, w, h, c); s.noise(x, y, w, h, 0.07, 0.25, 0.25, i); s.vlines(x, y, w, h, mul(c, 0.9), 0.25, 0.02); s.vshade(x, y, w, 0.15, 0.8, 1.0)
    x, y, w, h = PR['block']; s.bricks(x, y, w, h, C(0xa8a6a0), C(0x7c7a76), bw=0.4, bh=0.2, var=0.06, mw=0.02); s.noise(x, y, w, h, 0.1, 0.5, 0.3, 8); s.vshade(x, y, w, 0.2, 0.8, 1.0)
    for i, (c, c2) in enumerate(((0xc8201e, 0xf0f0ea), (0xeeeee8, 0x2060c0), (0x2058b0, 0xf0f0ea), (0x2a8a70, 0xf4e8a0))):
        x, y, w, h = PR['vend%d' % i]; s.rect(x, y, w, h, c); s.rect(x + 0.06, y + 0.95, 0.88, 0.85, 0xe8eef0); e.rect(x + 0.06, y + 0.95, 0.88, 0.85, 0xdfeaf0)
        for r in range(3):
            for q in range(7):
                cc = [0xd03020, 0x2060c0, 0xe8c020, 0x30a050, 0x202020, 0xf08020, 0xffffff][int(rng.random() * 7)]
                s.rect(x + 0.1 + q * 0.12, y + 1.02 + r * 0.26, 0.085, 0.17, cc); e.rect(x + 0.1 + q * 0.12, y + 1.02 + r * 0.26, 0.085, 0.17, col(cc) * 0.8)
        s.rect(x + 0.06, y + 0.55, 0.88, 0.3, c2); e.rect(x + 0.06, y + 0.55, 0.88, 0.3, col(c2) * 0.5); s.rect(x + 0.2, y + 0.12, 0.6, 0.25, 0x2a2a2a)
    x, y, w, h = PR['bulk']; s.rect(x, y, w, h, 0xbab6aa); s.weather(x, y, w, h, 1.2, 4); s.door(x + 1.1, y, 0.9, 2.0, 0x6a7074, 0x8a8a86, glass=False); s.rect(x, y + h - 0.15, w, 0.15, 0x8a8880)
    x, y, w, h = PR['tank']; s.rect(x, y, w, h, 0xd8d4bc)
    for i in range(3):
        for j in range(2):
            s.rect(x + i + 0.04, y + j + 0.04, 0.92, 0.92, 0xe4e0c8); s.poly([(x + i + 0.1, y + j + 0.5), (x + i + 0.5, y + j + 0.9), (x + i + 0.9, y + j + 0.5), (x + i + 0.5, y + j + 0.1)], 0xd0ccb4)
    s.noise(x, y, w, h, 0.08, 0.5, 1.0, 9)
    x, y, w, h = PR['louvre']; s.rect(x, y, w, h, 0xa4a8a8); s.hlines(x + 0.1, y + 0.15, w - 0.2, h - 0.3, 0x5f6466, 0.14, 0.06); s.rect(x, y + h - 0.1, w, 0.1, 0xb8bcbc)
    for i, (c, c2) in enumerate(((0x1f3a6a, 0xf0ece0), (0xece6d6, 0x8a2a20), (0x8a2420, 0xf0ece0))):
        x, y, w, h = PR['noren%d' % i]; s.grad(x, y, w, h, mul(c, 0.85), c); s.rect(x, y + h - 0.08, w, 0.08, mul(c, 0.6))
        for q in range(1, 4): s.rect(x + q * w / 4 - 0.02, y, 0.04, h * 0.7, 0x16161a)
        for q in range(4):
            cx = x + (q + 0.5) * w / 4; s.ellipse(cx, y + 0.42, 0.17, 0.17, c2); s.rect(cx - 0.09, y + 0.4, 0.18, 0.045, c); s.rect(cx - 0.02, y + 0.3, 0.045, 0.24, c)
        e.rect(x, y, w, h, col(c) * 0.12)
    x, y, w, h = PR['shutter']; s.rollup(x, y, w, h, 0xa8aaa6)
    for nm, c in (('verm', 0xc8402a), ('gold', 0xc8a84a), ('red', 0xc82a22), ('yellow', 0xe8b820), ('blue', 0x2a5aa8)):
        x, y, w, h = PR[nm]; s.rect(x, y, w, h, c); s.noise(x, y, w, h, 0.08, 0.3, 0.5, 4)
    x, y, w, h = PR['conc']; s.rect(x, y, w, h, 0xb0aea6); s.noise(x, y, w, h, 0.1, 0.6, 0.3, 5); s.speckle(x, y, w, h, 0.05, 2)
    x, y, w, h = PR['pallet']; s.rect(x, y, w, h, 0xb89868); s.hlines(x, y, w, h, 0x4a3a28, 0.16, 0.05); s.vlines(x, y, w, h, 0x8a7048, 0.3, 0.03)
    x, y, w, h = PR['cont']; s.vboards(x, y, w, h, C(0x3a6a8a), 0.12, 0.25); s.rect(x, y + h - 0.05, w, 0.05, 0x2a4a60); s.noise(x, y, w, h, 0.1, 0.5, 0.3, 6)
    x, y, w, h = PR['top']; s.rect(x, y, w, h, 0xa4a8a8); s.noise(x, y, w, h, 0.1, 0.3, 0.3, 2)
    return s


def pbox(k, o, ax, ay, az, key, top='top', lod=0, sides='fblr', side2=None, bottom=False):
    k.boxpts(o, ax, ay, az, props(k), PR[key], PR[top] if isinstance(top, str) else top, lod=lod, sides=sides, side2=PR[side2] if isinstance(side2, str) else side2, bottom=bottom)


def ac(Fc, x, y, d0=0.0, n=1):
    for i in range(n):
        pbox(Fc.k, Fc.P(x + i * 0.95, y, d0), Fc.r * 0.85, UP * 0.62, Fc.n * 0.32, 'ac', 'white', sides='flr', side2='white')


def vending(Fc, x, d0=0.0, kinds=(0, 1)):
    for i, kd in enumerate(kinds):
        r = PR['vend%d' % kd]
        Fc.k.boxpts(Fc.P(x + i * 1.05, 0, d0), Fc.r * 1.0, UP * 1.85, Fc.n * 0.7, props(Fc.k), (r[0], r[1], 1.0, r[3]), (r[0] + 1.02, r[1], 0.1, 0.1), sides='flr', side2=(r[0] + 1.02, r[1], 0.1, 1.9))


def lantern(k, p, r=0.2, h=0.5, kind='lan_r', n=6):
    k.cyl(p[0], p[2], r * 0.8, p[1], p[1] + h * 0.5, n, props(k), (PR[kind][0], PR[kind][1], PR[kind][2], 0.3), r1=r)
    k.cyl(p[0], p[2], r, p[1] + h * 0.5, p[1] + h, n, props(k), (PR[kind][0], PR[kind][1] + 0.3, PR[kind][2], 0.3), r1=r * 0.8, cap=(PR['dark'][0] + 0.1, 0.1, 0.2, 0.2))


def lanterns(Fc, x, y, w, n, d=0.35, kind='lan_r', r=0.2, h=0.5):
    for i in range(n):
        lantern(Fc.k, Fc.P(x + (i + 0.5) * w / n, y, d), r, h, kind)


def noren(Fc, x, y, w, h=0.8, kind=0, d=0.04):
    r = PR['noren%d' % kind]; u = min(r[2], w * r[3] / h * 1.0)
    Fc.face([Fc.P(x, y, d), Fc.P(x + w, y, d), Fc.P(x + w, y + h, d), Fc.P(x, y + h, d)], [(r[0], r[1]), (r[0] + u, r[1]), (r[0] + u, r[1] + r[3]), (r[0], r[1] + r[3])], Fc.n, 1, props(Fc.k))


def futon(Fc, x, y, d, i=0, w=1.3):
    pbox(Fc.k, Fc.P(x, y - 0.7, d - 0.12), Fc.r * w, UP * 0.75, Fc.n * 0.2, 'futon%d' % (i % 3), 'futon%d' % (i % 3), sides='flr')


def planter(k, x, z, w=1.0, d=0.5, h=0.9):
    r = PR['green']
    k.box(x, 0, z, x + w, h, z + d, props(k), r, (r[0], r[1] + 0.3, r[2], 0.35))


def blockwall(k, x0, z0, x1, z1, h=1.2, t=0.15):
    """Low concrete-block garden wall along the segment (x0,z0)-(x1,z1) (axis aligned)."""
    r = PR['block']
    if abs(x1 - x0) > abs(z1 - z0): k.box(x0, 0, z0 - t / 2, x1, h, z0 + t / 2, props(k), (r[0], r[1], min(r[2], abs(x1 - x0) * 0.5), r[3]), (r[0], r[1] + 0.5, 0.5, 0.08))
    else: k.box(x0 - t / 2, 0, min(z0, z1), x0 + t / 2, h, max(z0, z1), props(k), (r[0], r[1], 0.3, r[3]), (r[0], r[1] + 0.5, 0.5, 0.08), side2=(r[0], r[1], min(r[2], abs(z1 - z0) * 0.5), r[3]))


# ------------------------------------------------------------------ signs
class Signs:
    """One sheet of abstract signboards (albedo + emissive), shelf-packed in metres."""

    def __init__(self, k, w=12.0, h=1.0, prio=1.0):
        self.k = k; self.s = k.sheet(w, 1.0, prio, 'signs'); self.s.em
        self.x = 0.0; self.y = 0.0; self.rh = 0.0

    def slot(self, w, h):
        g = 0.06
        if self.x + w > self.s.w + 1e-6: self.x = 0.0; self.y += self.rh + g; self.rh = 0.0
        if self.y + h > self.s.h: self.s.h = self.y + h + g; self.s.em.h = self.s.h   # the sheet grows (ops replay later)
        r = (self.x, self.y, w, h); self.x += w + g; self.rh = max(self.rh, h)
        return r

    def glyph(self, x, y, sz, ca, ce, s=None):
        s = s or self.s; rng = self.k.rng; t = sz * 0.13
        kind = rng.random()
        if kind < 0.12:
            s.ellipse(x + sz / 2, y + sz / 2, sz * 0.45, sz * 0.45, ca); s.em.ellipse(x + sz / 2, y + sz / 2, sz * 0.45, sz * 0.45, ce)
            return
        if kind < 0.22:
            s.rect(x, y, sz, sz, ca); s.em.rect(x, y, sz, sz, ce); return
        for i in range(3 + int(rng.random() * 3)):
            if rng.random() < 0.55:
                L = sz * (0.45 + 0.55 * rng.random()); bx = x + (sz - L) * rng.random(); by = y + (sz - t) * rng.random()
                s.rect(bx, by, L, t, ca); s.em.rect(bx, by, L, t, ce)
            else:
                L = sz * (0.4 + 0.6 * rng.random()); bx = x + (sz - t) * rng.random(); by = y + (sz - L) * rng.random()
                s.rect(bx, by, t, L, ca); s.em.rect(bx, by, t, L, ce)

    def sign(self, w, h, bg=None, mode=None, fg=None, glow=1.0, n=None, border=True, at=None):
        """Paint a sign w x h (vertical if h > w); returns its rect. at=(sheet, x, y): paint there instead of a slot."""
        k = self.k; rng = k.rng; s = self.s if at is None else at[0]; e = s.em
        x, y, w, h = r = self.slot(w, h) if at is None else (at[1], at[2], w, h)
        bg = col(pick(k, SIGNC) if bg is None else bg)
        mode = mode or ('neon' if rng.random() < 0.25 else 'box')
        lum = float(np.mean(bg))
        if fg is None: fg = 0xf6f2e6 if lum < 0.6 else pick(k, [0x1a1a1e, 0xc0201e, 0x1f4fb0])
        fg = col(fg)
        if mode == 'neon':
            s.rect(x, y, w, h, 0x26262c); e.rect(x, y, w, h, col(0x0a0a10))
            ca = mix(bg, 0xffffff, 0.2); ce = np.clip(bg * 1.3 + 0.15, 0, 1) * glow
            for (rx, ry, rw, rh) in ((x, y, w, 0.05), (x, y + h - 0.05, w, 0.05), (x, y, 0.05, h), (x + w - 0.05, y, 0.05, h)):
                s.rect(rx, ry, rw, rh, ca); e.rect(rx, ry, rw, rh, ce)
        else:
            s.rect(x, y, w, h, bg); e.rect(x, y, w, h, np.clip(bg * 0.85 + 0.06, 0, 1) * glow * 0.9)
            if border:
                s.rect(x, y, w, 0.04, mul(bg, 0.6)); s.rect(x, y + h - 0.04, w, 0.04, mul(bg, 0.6)); s.rect(x, y, 0.04, h, mul(bg, 0.6)); s.rect(x + w - 0.04, y, 0.04, h, mul(bg, 0.6))
            ca = fg; ce = np.clip(fg * 1.1, 0, 1) * glow if float(np.mean(fg)) > 0.5 else fg * 0.3
        if h >= w:
            nc = 1 if w < 1.7 else max(2, int(w / 1.3)); cw = w / nc
            sz = cw * 0.62; m = n or max(1, int((h - cw * 0.3) / (cw * 0.85)))
            pitch = (h - cw * 0.3) / m
            for q in range(nc):
                for i in range(m): self.glyph(x + q * cw + (cw - sz) / 2, y + h - cw * 0.15 - (i + 0.5) * pitch - sz / 2, sz, ca, ce, s)
            w = cw
            if rng.random() < 0.5 and pitch > sz * 1.1:
                c2 = col(pick(k, SIGNC)); s.rect(x + 0.06, y + 0.06, w - 0.12, w * 0.25, c2); e.rect(x + 0.06, y + 0.06, w - 0.12, w * 0.25, c2 * 0.9 * glow)
        else:
            H0 = h; nr = 1 if h < 1.5 else 2; h = h / nr
            sz = h * 0.6; m = n or max(1, int((w - h * 0.4) / (h * 0.8)))
            m = min(m, 9); pitch = min(h * 0.85, (w - h * 0.4) / m); x0 = x + (w - pitch * m) / 2
            if nr == 2:
                for i in range(m): self.glyph(x0 + (i + 0.5) * pitch - sz / 2, y + h + (h - sz) / 2 - h * 0.08, sz, ca, ce, s)
                y += h * 0.08
            if rng.random() < 0.5 and w > h * 3:
                c2 = col(pick(k, SIGNC)); s.rect(x + 0.06, y + 0.06, h * 0.7, h - 0.12, c2); e.rect(x + 0.06, y + 0.06, h * 0.7, h - 0.12, c2 * 0.9 * glow)
                x0 = max(x0, x + h * 0.85); m = max(1, int((x + w - x0 - 0.1) / pitch))
            for i in range(m): self.glyph(x0 + (i + 0.5) * pitch - sz / 2, y + (h - sz) / 2, sz, ca, ce, s)
        return r

    def stripes(self, w, h, cols, glow=0.9):
        """Convenience-store style fascia: horizontal colour stripes on white."""
        s = self.s; e = s.em; x, y, w, h = r = self.slot(w, h)
        s.rect(x, y, w, h, 0xf2f2ee); e.rect(x, y, w, h, col(0xf2f2ee) * glow)
        n = len(cols); bh = h * 0.6 / n
        for i, c in enumerate(cols):
            s.rect(x, y + h * 0.2 + i * bh, w, bh * 0.92, c); e.rect(x, y + h * 0.2 + i * bh, w, bh * 0.92, col(c) * glow)
        return r

    def chase(self, w, h, c1, c2, glow=1.0):
        """Pachinko-bright fascia: bulbs and chevrons."""
        s = self.s; e = s.em; x, y, w, h = r = self.slot(w, h); rng = self.k.rng
        s.rect(x, y, w, h, c1); e.rect(x, y, w, h, col(c1) * 0.85 * glow)
        n = int(w / (h * 0.5))
        for i in range(n):
            px = x + i * w / n; c = c2 if i % 2 == 0 else 0xfff6d0
            s.poly([(px, y + h * 0.18), (px + w / n * 0.5, y + h * 0.5), (px, y + h * 0.82), (px + w / n * 0.45, y + h * 0.82), (px + w / n * 0.95, y + h * 0.5), (px + w / n * 0.45, y + h * 0.18)], c)
            e.poly([(px, y + h * 0.18), (px + w / n * 0.5, y + h * 0.5), (px, y + h * 0.82), (px + w / n * 0.45, y + h * 0.82), (px + w / n * 0.95, y + h * 0.5), (px + w / n * 0.45, y + h * 0.18)], col(c) * glow)
        for yy in (y + 0.03, y + h - 0.11):
            m = int(w / 0.22)
            for i in range(m):
                s.rect(x + i * w / m + 0.04, yy, 0.09, 0.08, 0xfff2c0); e.rect(x + i * w / m + 0.04, yy, 0.09, 0.08, 0xfff2c0)
        return r

    # ---- geometry
    def blade(self, Fc, x, y, w, h, t=0.22, gap=0.12, r=None, lod=0, **kw):
        """Projecting (sode) sign: w = projection from the wall, h tall, at facade x."""
        r = r or self.sign(w, h, **kw); k = self.k
        k.boxpts(Fc.P(x - t / 2, y, gap), Fc.n * w, UP * h, Fc.r * t, self.s, r, (r[0], r[1], 0.05, 0.05), lod=lod, sides='fbr', side2=(r[0], r[1], 0.04, h), bottom=True)
        pbox(k, Fc.P(x - 0.04, y + h * 0.2, 0), Fc.r * 0.08, UP * 0.08, Fc.n * gap, 'dark', 'dark', sides='lr')
        pbox(k, Fc.P(x - 0.04, y + h * 0.8, 0), Fc.r * 0.08, UP * 0.08, Fc.n * gap, 'dark', 'dark', sides='lr')
        return r

    def board(self, Fc, x, y, w, h, d=0.15, r=None, lod=False, d0=0.0, **kw):
        """Flat sign box on the facade."""
        r = r or self.sign(w, h, **kw)
        Fc.box(x, y, w, h, d, d0, faces='flrtb', lod=lod, uvrect=r, sh=self.s)
        return r

    def roof_sign(self, x0, x1, y, z, h=3.0, legs=1.6, t=0.35, back=True, r=None, lod=1, **kw):
        """Billboard on a steel frame standing on the roof, facing +Z (and -Z if back)."""
        k = self.k; w = x1 - x0
        r = r or self.sign(w, h, **kw)
        k.box(x0, y + legs, z - t, x1, y + legs + h, z, self.s, r, (r[0], r[1], 0.05, 0.05), lod=lod, sides='fblr' if back else 'flr', side2=(r[0], r[1], 0.04, h), bottom=True)
        ps = props(k); d = PR['dark']; n = max(2, int(w / 3) + 1)
        for i in range(n):
            px = x0 + 0.2 + i * (w - 0.4) / (n - 1)
            k.bar([px, y, z - t / 2], [px, y + legs, z - t / 2], 0.14, ps, d)
            k.bar([px, y, z - t - 1.6], [px, y + legs + h * 0.7, z - t], 0.1, ps, d)
        return r


# ------------------------------------------------------------------ balconies / stairs
def rail_sheet(k, w, h, kind='solid', c=0xd8d4c8, slab=0.15, prio=1.0):
    s = k.sheet(w, h, prio, 'rail'); c = col(c)
    if kind == 'solid':
        s.rect(0, 0, w, h, c); s.noise(0, 0, w, h, 0.05, 0.6, 1.2, 2); s.vshade(0, slab, w, 0.5, 0.92, 1.0); s.vlines(0, slab, w, h - slab, mul(c, 0.9), 2.7, 0.03)
    elif kind == 'bars':
        s.rect(0, 0, w, h, 0x53575a); s.vlines(0, slab, w, h - slab, c, 0.13, 0.045)
    elif kind == 'glass':
        s.grad(0, 0, w, h, C(0x8fa4ae), C(0xb9cad0)); s.vlines(0, 0, w, h, 0xd8dcdc, 1.2, 0.04)
    elif kind == 'slat':
        s.rect(0, 0, w, h, mul(c, 0.7)); s.hlines(0, slab, w, h - slab, c, 0.12, 0.08)
    s.rect(0, 0, w, slab, mul(c if kind != 'bars' else C(0xb8b4a8), 0.82)); s.rect(0, h - 0.06, w, 0.06, mul(c, 1.08) if kind != 'glass' else C(0xd8dcdc))
    return s


def balcony(Fc, x, y, w, d=1.1, rail=1.1, slab=0.15, sh=None, u0=0.0, lod=False, open=True, t=0.08, ends='lr'):
    """Balcony tray at floor level y: slab + parapet rail on three sides. sh: rail sheet (w x (slab+rail))."""
    k = Fc.k; P = Fc.P; L = 3 if lod else 1
    if sh is None: sh = rail_sheet(k, w, slab + rail)
    u0 = min(u0, max(0.0, sh.w - w)); h = slab + rail; yb = y - slab; yt = y + rail; x1 = x + w; e = 0.04
    def q(pts, uvs, want, l=1): k.emit(pts, sh, uvs, want, l)
    q([P(x, yb, d), P(x1, yb, d), P(x1, yt, d), P(x, yt, d)], [(u0, 0), (u0 + w, 0), (u0 + w, h), (u0, h)], Fc.n, L)
    for xx, sg in ((x, -1), (x1, 1)):
        if ('l' if sg < 0 else 'r') not in ends: continue
        q([P(xx, yb, 0), P(xx, yb, d), P(xx, yt, d), P(xx, yt, 0)], [(u0, 0), (u0 + d, 0), (u0 + d, h), (u0, h)], Fc.r * sg, L)
        if open: q([P(xx - sg * t, y, 0), P(xx - sg * t, y, d - t), P(xx - sg * t, yt, d - t), P(xx - sg * t, yt, 0)], [(u0, slab), (u0 + d, slab), (u0 + d, h), (u0, h)], -Fc.r * sg)
    q([P(x, yb, 0), P(x1, yb, 0), P(x1, yb, d), P(x, yb, d)], [(u0, 0), (u0 + w, 0), (u0 + w, e), (u0, e)], -UP)
    if open:
        q([P(x, y, 0), P(x1, y, 0), P(x1, y, d), P(x, y, d)], [(u0, e), (u0 + w, e), (u0 + w, slab), (u0, slab)], UP)
        q([P(x, y, d - t), P(x1, y, d - t), P(x1, yt, d - t), P(x, yt, d - t)], [(u0, slab), (u0 + w, slab), (u0 + w, h), (u0, h)], -Fc.n)
        q([P(x, yt, d - t), P(x1, yt, d - t), P(x1, yt, d), P(x, yt, d)], [(u0, h - e), (u0 + w, h - e), (u0 + w, h), (u0, h)], UP)
    else:
        q([P(x, yt, 0), P(x1, yt, 0), P(x1, yt, d), P(x, yt, d)], [(u0, h - e), (u0 + w, h - e), (u0 + w, h), (u0, h)], UP, L)
    Fc.s.vshade(Fc.su + x, Fc.sv + yb - min(1.0, d), w, min(1.0, d), 1.0, 0.72)


def ext_stair(Fc, x, w, d, ys, c=0x8f9496, post=0.12, roof=True, flip=False):
    """Steel emergency stair on facade Fc: a landing per level in ys (wall half), a sloped flight on the outer half
    rising across the width to the next level (alternating), solid balustrades, four posts."""
    k = Fc.k; P = Fc.P; ms = k.metal_sheet(c); A = (0.05, 0.55, 0.4, 0.4); Bq = (0.55, 0.05, 0.4, 0.4); Dk = (0.05, 0.05, 0.4, 0.4)
    def q(pts, r, want, lod=1):
        k.emit(pts, ms, [(r[0], r[1]), (r[0] + r[2], r[1]), (r[0] + r[2], r[1] + r[3]), (r[0], r[1] + r[3])], want, lod)
    x1 = x + w; dm = d * 0.5; rl = 1.05
    for (px, pd) in ((x, d), (x1, d)):
        k.bar(P(px, 0, pd), P(px, ys[-1] + (2.3 if roof else rl), pd), post, ms, Dk)
    for i, y in enumerate(ys):
        # landing (wall half) + its outer-edge kerb
        k.boxpts(P(x, y - 0.12, 0), Fc.r * w, UP * 0.12, Fc.n * dm, ms, Bq, A, bottom=True, sides='flr')
        if i + 1 < len(ys):
            y2 = ys[i + 1]; up = ((i % 2 == 0) != flip)
            xa, xb = (x + 0.9, x1 - 0.9) if up else (x1 - 0.9, x + 0.9)
            # flight: sloped slab on the outer half, top + bottom
            pts = [P(xa, y, dm), P(xa, y, d), P(xb, y2, d), P(xb, y2, dm)]
            q(pts, Bq, UP); q([p - UP * 0.1 for p in pts], Dk, -UP)
            # end landings at the turn (outer half)
            for (xe0, xe1, yy) in ((((x, x + 0.9) if up else (x1 - 0.9, x1)) + (y,),) if i == 0 else ()) + (((x1 - 0.9, x1) if up else (x, x + 0.9)) + (y2,),):
                k.boxpts(P(xe0, yy - 0.12, dm), Fc.r * (xe1 - xe0), UP * 0.12, Fc.n * (d - dm), ms, Bq, A, bottom=True, sides='flr')
            # outer balustrade following the flight (both faces) + inner stringer
            bp = [P(xa, y, d), P(xb, y2, d), P(xb, y2 + rl, d), P(xa, y + rl, d)]
            q(bp, A, Fc.n, 3 if i % 2 == 0 else 1); q([p - Fc.n * 0.05 for p in bp], Dk, -Fc.n)
            # end balustrades
            for xe, sg in ((x, -1), (x1, 1)):
                yy = y if ((xe == x) == up) else y2
                ep = [P(xe, yy, dm), P(xe, yy, d), P(xe, yy + rl, d), P(xe, yy + rl, dm)]
                q(ep, A, Fc.r * sg); q([p - Fc.r * sg * 0.05 for p in ep], Dk, -Fc.r * sg)
    if roof:
        y = ys[-1] + 2.3
        k.boxpts(P(x - 0.1, y, 0), Fc.r * (w + 0.2), UP * 0.1, Fc.n * (d + 0.1), ms, A, A, bottom=True, sides='flr')


# ------------------------------------------------------------------ pitched roofs
def roof_sheet_tile(k, w, h, c=0x4a4e56, kind='kawara', prio=0.8, seed=0):
    s = k.sheet(w, h, prio, 'tiles'); c = col(c)
    if kind == 'kawara': s.tiles(0, 0, w, h, c, 0.3, 0.3, 0.3)
    elif kind == 'metal':
        s.rect(0, 0, w, h, c); s.vlines(0, 0, w, h, mul(c, 0.72), 0.42, 0.05); s.vlines(0, 0, w, h, mul(c, 1.15), 0.42, 0.03, off=0.05)
    else: s.shingles(0, 0, w, h, c, 0.4, 0.22)
    s.noise(0, 0, w, h, 0.12, 2.0, 2.0, seed + 3); s.noise(0, 0, w, h, 0.07, 0.4, 3.0, seed + 5)
    s.rect(0, 0, w, 0.1, mul(c, 0.62)); s.rect(0, h - 0.22, w, 0.22, mul(c, 0.8)); s.hlines(0, h - 0.22, w, 0.22, mul(c, 0.55), 0.11, 0.03)
    return s


def slope(k, e0, e1, r1, r0, s, u0=0.0, lod=3, thick=0.12):
    """Roof plane: eave e0 -> e1, ridge r0 (above e0 side) .. r1; u along the eave, v up the slope."""
    e0 = V(*e0); e1 = V(*e1); r0 = V(*r0); r1 = V(*r1)
    eh = (e1 - e0); L = np.linalg.norm(eh); eh = eh / L
    vv = (r0 - e0) - np.dot(r0 - e0, eh) * eh; vv = vv / np.linalg.norm(vv)
    pts = [e0, e1, r1] + ([r0] if np.linalg.norm(r1 - r0) > 1e-6 else [])
    uv = [(u0 + float(np.dot(p - e0, eh)), float(np.dot(p - e0, vv))) for p in pts]
    n = np.cross(eh, vv)
    if n[1] < 0: n = -n
    k.emit(pts, s, uv, n, lod)
    if thick > 0:   # eave fascia
        k.emit([e0 - UP * thick, e1 - UP * thick, e1, e0], s, [(u0, 0.0), (u0 + L, 0.0), (u0 + L, 0.08), (u0, 0.08)], np.cross(eh, UP) * (1 if np.dot(np.cross(eh, UP), e0 - r0) > 0 else -1), 1)


def ridge(k, a, b, s, t=0.28):
    k.bar(V(*a), V(*b), t, s, (0.0, s.h - 0.2, min(s.w, float(np.linalg.norm(V(*b) - V(*a)))), 0.18))


def hip_roof(k, x0, x1, z0, z1, y, rise, s, ov=0.5, lod=3, ridges=True):
    """Hipped roof over the rect (ridge along the longer side). Returns the ridge height."""
    X0, X1, Z0, Z1 = x0 - ov, x1 + ov, z0 - ov, z1 + ov
    W = X1 - X0; D = Z1 - Z0; yr = y + rise; ye = y
    if W >= D:
        h = D / 2; a = (X0 + h, yr, (Z0 + Z1) / 2); b = (X1 - h, yr, (Z0 + Z1) / 2)
        slope(k, (X0, ye, Z1), (X1, ye, Z1), b, a, s, lod=lod); slope(k, (X1, ye, Z0), (X0, ye, Z0), a, b, s, lod=lod)
        slope(k, (X1, ye, Z1), (X1, ye, Z0), b, b, s, lod=lod); slope(k, (X0, ye, Z0), (X0, ye, Z1), a, a, s, lod=lod)
    else:
        h = W / 2; a = ((X0 + X1) / 2, yr, Z1 - h); b = ((X0 + X1) / 2, yr, Z0 + h)
        slope(k, (X1, ye, Z1), (X1, ye, Z0), b, a, s, lod=lod); slope(k, (X0, ye, Z0), (X0, ye, Z1), a, b, s, lod=lod)
        slope(k, (X0, ye, Z1), (X1, ye, Z1), a, a, s, lod=lod); slope(k, (X1, ye, Z0), (X0, ye, Z0), b, b, s, lod=lod)
    k.emit([V(X0, ye - 0.12, Z1), V(X1, ye - 0.12, Z1), V(X1, ye - 0.12, Z0), V(X0, ye - 0.12, Z0)], s, [(0, 0), (0.3, 0), (0.3, 0.06), (0, 0.06)], -UP, 1)
    if ridges:
        ridge(k, a, b, s)
        for c, e in (((X0, ye, Z1), a), ((X1, ye, Z1), b if W >= D else a), ((X1, ye, Z0), b), ((X0, ye, Z0), a if W >= D else b)):
            ridge(k, c, e, s, 0.2)
    return yr


def gable_roof(k, x0, x1, z0, z1, y, rise, s, axis='x', ov=0.5, gov=0.3, lod=3, ridges=True):
    """Gable roof; axis = ridge direction ('x': eaves on the front and back). Close the gable walls with Facade.wall(top=...)."""
    if axis == 'x':
        zm = (z0 + z1) / 2; half = (z1 - z0) / 2; ye = y - rise * ov / half
        a = (x0 - gov, y + rise, zm); b = (x1 + gov, y + rise, zm)
        slope(k, (x0 - gov, ye, z1 + ov), (x1 + gov, ye, z1 + ov), b, a, s, lod=lod); slope(k, (x1 + gov, ye, z0 - ov), (x0 - gov, ye, z0 - ov), a, b, s, lod=lod)
        for zz, sg, zc in ((z1 + ov, 1, zm), (z0 - ov, -1, zm)):
            k.emit([V(x0 - gov, ye - 0.1, zz), V(x1 + gov, ye - 0.1, zz), V(x1 + gov, y + rise - 0.1, zc), V(x0 - gov, y + rise - 0.1, zc)], s, [(0, 0), (0.3, 0), (0.3, 0.06), (0, 0.06)], V(0, -1, 0), 1)
    else:
        xm = (x0 + x1) / 2; half = (x1 - x0) / 2; ye = y - rise * ov / half
        a = (xm, y + rise, z1 + gov); b = (xm, y + rise, z0 - gov)
        slope(k, (x1 + ov, ye, z1 + gov), (x1 + ov, ye, z0 - gov), b, a, s, lod=lod); slope(k, (x0 - ov, ye, z0 - gov), (x0 - ov, ye, z1 + gov), a, b, s, lod=lod)
        for xx, sg in ((x1 + ov, 1), (x0 - ov, -1)):
            k.emit([V(xx, ye - 0.1, z1 + gov), V(xx, ye - 0.1, z0 - gov), V(xm, y + rise - 0.1, z0 - gov), V(xm, y + rise - 0.1, z1 + gov)], s, [(0, 0), (0.3, 0), (0.3, 0.06), (0, 0.06)], V(0, -1, 0), 1)
    if ridges: ridge(k, a, b, s)
    return y + rise


# ------------------------------------------------------------------ roofs / plant
def bulkhead(k, x, y, z, w=2.8, h=2.6, d=3.2, lod=1):
    r = PR['bulk']; k.box(x, y, z, x + w, y + h, z + d, props(k), (r[0], r[1], min(w, r[2]), min(h, r[3])), PR['top'], lod=lod)


def plant(k, x, y, z, w=1.7, h=1.5, d=1.4, lod=0):
    k.box(x, y, z, x + w, y + h, z + d, props(k), PR['louvre'], PR['top'], lod=lod)


def frp_tank(k, x, y, z, w=3.0, h=2.0, d=2.0, legs=1.2, lod=1):
    """Panel (FRP) water tank on a steel stand."""
    ps = props(k); dk = PR['dark']
    for px in (x + 0.15, x + w - 0.15):
        for pz in (z + 0.15, z + d - 0.15):
            k.bar([px, y, pz], [px, y + legs, pz], 0.12, ps, dk)
    k.box(x - 0.05, y + legs - 0.12, z - 0.05, x + w + 0.05, y + legs, z + d + 0.05, ps, dk, dk, bottom=True)
    r = PR['tank']; k.box(x, y + legs, z, x + w, y + legs + h, z + d, ps, (r[0], r[1], min(3.0, round(w)), min(2.0, h)), (r[0], r[1], 2, 2), lod=lod, side2=(r[0], r[1], min(3.0, max(1.0, round(d))), min(2.0, h)))
    k.bar([x + 0.4, y, z + d + 0.1], [x + 0.4, y + legs + h * 0.6, z + d + 0.1], 0.1, ps, PR['steel'])


def ac_rows(k, x, y, z, n=3, rows=1):
    for j in range(rows):
        for i in range(n):
            pbox(k, [x + i * 1.0, y + 0.1, z + j * 0.9], [0.85, 0, 0], [0, 0.62, 0], [0, 0, 0.35], 'ac', 'white', sides='fblr', side2='white')


def vent(k, x, y, z, r=0.22, h=0.8):
    k.cyl(x, z, r, y, y + h, 6, props(k), PR['steel'], PR['top'])


def antenna(k, x, y, z, h=6.0, light=True):
    ps = props(k); k.bar([x, y, z], [x, y + h, z], 0.14, ps, PR['steel'])
    k.bar([x - 0.7, y + h * 0.7, z], [x + 0.7, y + h * 0.7, z], 0.07, ps, PR['steel']); k.bar([x, y + h * 0.85, z - 0.5], [x, y + h * 0.85, z + 0.5], 0.07, ps, PR['steel'])
    if light: avi(k, x, y + h, z)


def avi(k, x, y, z, sz=0.35, lod=0):
    """Red aviation obstruction light."""
    k.box(x - sz / 2, y, z - sz / 2, x + sz / 2, y + sz, z + sz / 2, props(k), PR['avi'], PR['avi'], lod=lod)


def flat_roof(k, x0, z0, x1, z1, y, par=0.9, t=0.25, seed=0, c=None, cc=None, clutter=1.0, bulk=True, tank=False, prio=0.55, sheet=None):
    """Parapet roof + typical clutter. Returns the roof sheet."""
    rs = k.flat_roof(x0, z0, x1, z1, y, y + par, t, seed=seed, c=c, cc=cc, prio=prio, sheet=sheet)
    rng = np.random.default_rng(seed + 31); w = x1 - x0; d = z1 - z0
    if bulk and w > 4.5 and d > 6: bulkhead(k, x0 + t + 0.2 + (w - 3.6) * rng.random() * 0.4, y, z0 + t + 0.2, min(2.8, w - 1.5), 2.6, 3.2)
    if tank and w > 4 and d > 7: frp_tank(k, x1 - t - 0.4 - min(3.0, w - 2), y, z0 + t + 4.0 if d > 12 else z1 - t - 3.0, min(3.0, w - 2), 2.0, 2.0)
    n = int(max(2, min(10, w * d / 45)) * clutter)
    for i in range(n):
        px = x0 + t + 0.3 + rng.random() * max(0.1, w - 3.2); pz = z0 + d * 0.35 + rng.random() * max(0.1, d * 0.6 - 2.4)
        q = rng.random()
        if q < 0.45: ac_rows(k, px, y, pz, 1 + int(rng.random() * min(3, (w - 1) / 1.2)))
        elif q < 0.7: plant(k, px, y, pz, 1.2 + rng.random(), 1.0 + rng.random() * 0.7, 1.1 + rng.random() * 0.6)
        else: vent(k, px, y, pz, 0.18 + 0.1 * rng.random(), 0.5 + 0.5 * rng.random())
    return rs


# ------------------------------------------------------------------ tower modules
def stack(k, x0, x1, z0, z1, y0, nfl, fh, mod, paint, relief=None, nv=2, sides='frbl', prio=1.0, cache=None, key='', inset=0.0):
    """Walls of one tier as stacked modules of `mod` floors sharing sheets (nv painted variants per width).
    paint(s, w, H, var) paints a module sheet; relief(Fm, m, side, j) cuts / adds per module. Returns top y."""
    cache = {} if cache is None else cache
    mod = min(mod, nfl); modH = mod * fh; W = x1 - x0; D = z1 - z0; c = inset
    S = {'f': ((x0 + c, z1), (1, 0, 0), W - 2 * c), 'r': ((x1, z1 - c), (0, 0, -1), D - 2 * c), 'b': ((x1 - c, z0), (-1, 0, 0), W - 2 * c), 'l': ((x0, z0 + c), (0, 0, 1), D - 2 * c)}
    for si, (sd, (p, r, w)) in enumerate(S.items()):
        if sd not in sides: continue
        f0 = 0; j = 0
        while f0 < nfl:
            m = min(mod, nfl - f0); var = (j + si) % nv; ck = (key, round(w, 2), round(modH, 2), var)
            if ck not in cache:
                cache[ck] = k.sheet(w, modH, prio, 'mod'); paint(cache[ck], w, modH, var)
            Fm = k.facade((p[0], y0 + f0 * fh, p[1]), r, w, m * fh, sheet=cache[ck])
            if relief: relief(Fm, m, sd, j)
            Fm.wall()
            f0 += m; j += 1
    return y0 + nfl * fh


def roof_plan(k, W, D, c=None, seed=0, prio=0.4):
    s = k.sheet(W, D, prio, 'roof'); s.roofing(0, 0, W, D, seed=seed, c=c)
    return s


def deck(k, rs, x0, x1, z0, z1, y, X0=0.0, Z1=0.0, cop=0.4, cc=0xb8b6ae, par=0.0, lod=True):
    """Close a tier top with the plan-mapped roof sheet rs (origin X0, Z1); optional parapet upstand."""
    u0 = x0 - X0; v0 = Z1 - z1; w = x1 - x0; d = z1 - z0
    if cop > 0:
        for (rx, ry, rw, rh) in ((u0, v0, w, cop), (u0, v0 + d - cop, w, cop), (u0, v0, cop, d), (u0 + w - cop, v0, cop, d)): rs.rect(rx, ry, rw, rh, cc)
    if par > 0:
        k.flat_roof(x0, z0, x1, z1, y, y + par, cop, sheet=_Sub(rs, u0, v0, w, d), lod=lod)
    else: k.roof_poly([(x0, z1), (x1, z1), (x1, z0), (x0, z0)], y, rs, X0, Z1, lod=lod)


class _Sub:
    """A window onto a sheet (so flat_roof's plan mapping lands on a sub-rect of a shared roof sheet)."""
    def __init__(self, s, u0, v0, w, d): self.s = s; self.u0 = u0; self.v0 = v0; self.w = w; self.h = d


_emit0 = K.Kit.emit
def _emit(self, pts, sheet, uvs, want=None, lod=1):
    if isinstance(sheet, _Sub):
        # flat_roof maps u = x - x0, v = z1 - z measured from the sheet's bottom: shift into the parent
        par = sheet.s; uvs = [(u + sheet.u0, v + sheet.v0) for (u, v) in uvs]; sheet = par
    _emit0(self, pts, sheet, uvs, want, lod)
K.Kit.emit = _emit


# ------------------------------------------------------------------ street clutter
def bike(k, x, z, along='x', c='dark'):
    """A parked bicycle (wheels as thin slabs)."""
    ps = props(k); dk = PR['dark']; a = V(1, 0, 0) if along == 'x' else V(0, 0, 1); n = V(0, 0, 1) if along == 'x' else V(1, 0, 0); o = V(x, 0, z)
    for u in (0.0, 1.05):
        k.boxpts(o + a * u - n * 0.02, a * 0.62, UP * 0.62, n * 0.04, ps, dk, dk, sides='fb')
    k.bar(o + a * 0.31 + UP * 0.31, o + a * 0.75 + UP * 0.85, 0.05, ps, PR[c]); k.bar(o + a * 0.75 + UP * 0.85, o + a * 1.36 + UP * 0.31, 0.05, ps, PR[c])
    k.bar(o + a * 0.45 + UP * 0.8, o + a * 1.3 + UP * 0.95, 0.05, ps, PR[c])
    k.boxpts(o + a * 1.25 - n * 0.15 + UP * 0.7, a * 0.3, UP * 0.22, n * 0.3, ps, PR['steel'], PR['dark'], sides='fblr')


def pole(k, x, z, h=9.4, lamp=V(0, 0, 1), arm=1.0):
    """Concrete utility pole: crossarms, a pole transformer, a street lamp (lit)."""
    ps = props(k); st = PR['steel']; bl = (PR['block'][0] + 0.02, PR['block'][1] + 0.02, 0.2, 0.5)
    k.cyl(x, z, 0.17, 0, h, 6, ps, bl, r1=0.11, cap=PR['top'])
    for yy, L in ((h - 0.5, 0.9), (h - 1.2, 0.75)):
        k.bar([x - L, yy, z], [x + L, yy, z], 0.09, ps, st)
    k.cyl(x + 0.42, z, 0.27, h - 3.0, h - 2.2, 6, ps, st, cap=PR['top'], capb=True); k.bar([x, h - 2.5, z], [x + 0.42, h - 2.5, z], 0.08, ps, st)
    p0 = V(x, 5.6, z); p1 = p0 + lamp * arm + UP * 0.3
    k.bar(p0, p1, 0.07, ps, st); k.boxpts(p1 - V(0.12, 0.12, 0.12) + lamp * 0.1, V(0.24, 0, 0) if abs(lamp[2]) > 0.5 else V(0, 0, 0.24), UP * 0.1, lamp * 0.45, ps, PR['glow'], PR['steel'], bottom=True)


def gutter(Fc, y, ov=0.5, pipe=True, c='steel'):
    k = Fc.k; ps = props(k)
    k.bar(Fc.P(-ov * 0.5, y, ov), Fc.P(Fc.w + ov * 0.5, y, ov), 0.1, ps, PR[c])
    if pipe:
        k.bar(Fc.P(Fc.w - 0.12, 0, 0.07), Fc.P(Fc.w - 0.12, y - 0.35, 0.07), 0.08, ps, PR[c]); k.bar(Fc.P(Fc.w - 0.12, y - 0.35, 0.07), Fc.P(Fc.w - 0.12, y, ov), 0.08, ps, PR[c])


def tv_antenna(k, x, y, z, h=2.2):
    ps = props(k); st = PR['steel']
    k.bar([x, y, z], [x, y + h, z], 0.05, ps, st); k.bar([x - 0.9, y + h - 0.15, z], [x + 0.9, y + h - 0.15, z], 0.04, ps, st)
    for i in range(3): k.bar([x - 0.7 + i * 0.6, y + h - 0.15, z - 0.35], [x - 0.7 + i * 0.6, y + h - 0.15, z + 0.35], 0.03, ps, st)


def pots(k, x, z, n=4, along='x', seed=0):
    rng = np.random.default_rng(seed + 3); r = PR['green']
    for i in range(n):
        w = 0.3 + 0.25 * rng.random(); h = 0.45 + 0.6 * rng.random(); px = x + i * 0.62 if along == 'x' else x; pz = z if along == 'x' else z + i * 0.62
        k.box(px, 0, pz, px + w, h, pz + w, props(k), (r[0], r[1], r[2], 0.7), (r[0], r[1] + 0.3, 0.5, 0.35))


# ------------------------------------------------------------------ apartment fronts
def unit_fronts(Fc, x0, x1, y0, nfl, fh, units, rs, d=1.2, rail=1.1, frame=0x8f8f8a, part=0xd8d4c8, fut=0.25, acp=0.5, lit=None, ends='lr', cap=True, open=True, rd=0.0):
    """Balcony front: per floor a tray across [x0, x1]; behind it per unit a sliding door + window; partitions, futons, AC units."""
    k = Fc.k; rng = k.rng; uw = (x1 - x0) / units; s = Fc.s
    for f in range(nfl):
        y = y0 + f * fh
        for u in range(units):
            ux = x0 + u * uw
            win(Fc, ux + 0.35, y + 0.06, min(1.8, uw * 0.42), 2.0, rd, frame, n=2, lit=lit, blind=0.3)
            if uw > 4.0: win(Fc, ux + uw - 0.4 - 1.3, y + 0.9, 1.3, 1.15, rd, frame, n=2, lit=lit, blind=0.3)
            if rng.random() < acp: ac(Fc, ux + uw * 0.5 - 0.4, y + 0.03, 0.08)
            if open and rng.random() < fut: futon(Fc, ux + 0.3 + rng.random() * max(0.1, uw - 1.9), y + rail, d, int(rng.random() * 3))
        balcony(Fc, x0, y, x1 - x0, d, rail, 0.15, rs, ends=ends, open=open, u0=(f % 2) * 0.7)
        if part is not None and open:
            for u in range(1, units):
                px = x0 + u * uw - 0.04; s.rect(px, y, 0.08, fh - 0.15, part); Fc.box(px, y, 0.08, fh - 0.15, d - 0.06, faces='flr')
    if cap:
        y = y0 + nfl * fh; s.rect(x0, y - 0.15, x1 - x0, 0.15, part if part is not None else 0xd8d4c8); Fc.box(x0, y - 0.15, x1 - x0, 0.15, d + 0.1, faces='flrtb')


def corridor(Fc, x0, x1, y0, nfl, fh, units, rs, d=1.3, rail=1.1, dc=None, cap=True, lamp=0.9, u0=0.0):
    """Open access gallery: per floor a tray; per unit a steel door, a kitchen window, a door lamp (lit)."""
    k = Fc.k; rng = k.rng; uw = (x1 - x0) / units; s = Fc.s; dc = dc or pick(k, [0x5a7a8a, 0x6a7a5a, 0x7a5a48, 0x4a5a6a, 0x8a8478])
    for f in range(nfl):
        y = y0 + f * fh
        s.em.rect(x0, y + fh - 0.45, x1 - x0, 0.12, col(0xe8f0e8) * 0.16)
        for u in range(units):
            ux = x0 + u * uw
            s.door(ux + 0.5, y + 0.02, 0.85, 2.0, dc, 0x9a9a94, glass=False); s.rect(ux + 1.5, y + 0.9, 0.35, 0.6, 0x9a9c98)
            win(Fc, ux + uw - 1.45, y + 1.05, 0.95, 0.85, 0.0, 0x8f8f8a, n=2, lit=0.4, blind=0.5)
            if rng.random() < lamp: s.rect(ux + 0.75, y + 2.12, 0.35, 0.12, 0xf0ecd8); s.em.rect(ux + 0.7, y + 2.08, 0.45, 0.2, pick(k, [0xfff0d0, 0xe8f6e8, 0xfff0d0]))
        balcony(Fc, x0, y, x1 - x0, d, rail, 0.15, rs, u0=u0)
    if cap:
        y = y0 + nfl * fh; s.rect(x0, y - 0.15, x1 - x0, 0.15, 0xc8c4b8); Fc.box(x0, y - 0.15, x1 - x0, 0.15, d + 0.1, faces='flrtb')
