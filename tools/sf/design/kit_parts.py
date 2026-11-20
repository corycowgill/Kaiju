# SF kit: shared building parts (shell, walls, cornices, party / rear wall painters). design-kit.
import math
import numpy as np
from kit_lib import *


def shell(k, W, D, hf, hs=None, hb=None, prio_side=0.6, prio_back=0.6, share_sides=False, prio_front=1.0):
    """Four facades of a W x D box (front at z=0 facing +Z, x from 0). Returns F, R, B, L."""
    hs = hf if hs is None else hs; hb = hs if hb is None else hb
    F = k.facade((0, 0, 0), (1, 0, 0), W, hf, name='front', prio=prio_front)
    R = k.facade((W, 0, 0), (0, 0, -1), D, hs, prio=prio_side, name='right')
    B = k.facade((W, 0, -D), (-1, 0, 0), W, hb, prio=prio_back, name='back')
    L = k.facade((0, 0, -D), (0, 0, 1), D, hs, sheet=R.s if share_sides else None, prio=prio_side, name='left')
    return F, R, B, L


def false_front(F, y0, t=0.3, x0=0.0, x1=None, lod=True):
    """Back and top of the part of facade F that stands above the roof parapet (y0)."""
    x1 = F.w if x1 is None else x1
    e = EPS; h = F.h
    F.face([F.P(x0, y0, -t), F.P(x1, y0, -t), F.P(x1, h, -t), F.P(x0, h, -t)], [(x0, h - e), (x1, h - e), (x1, h), (x0, h)], -F.n, 1)
    F.face([F.P(x0, h, 0), F.P(x1, h, 0), F.P(x1, h, -t), F.P(x0, h, -t)], [(x0, h - e), (x1, h - e), (x1, h), (x0, h)], UP, 1)
    F.face([F.P(x0, y0, 0), F.P(x0, y0, -t), F.P(x0, h, -t), F.P(x0, h, 0)], [(x0, y0), (x0 + e, y0), (x0 + e, h), (x0, h)], -F.r, 1)
    F.face([F.P(x1, y0, 0), F.P(x1, y0, -t), F.P(x1, h, -t), F.P(x1, h, 0)], [(x1, y0), (x1 - e, y0), (x1 - e, h), (x1, h)], F.r, 1)


def wallpaint(s, x, y, w, h, mat, c, seed=0, amt=1.0):
    if mat == 'siding': s.siding(x, y, w, h, c, 0.14)
    elif mat == 'brick': s.bricks(x, y, w, h, c, mul(mix(c, 0xd8d0c0, 0.45), 1.0))
    elif mat == 'terracotta':
        s.rect(x, y, w, h, c); s.hlines(x, y, w, h, mul(c, 0.88), 0.45, 0.025); s.noise(x, y, w, h, 0.05, 0.5, 0.45, seed + 9)
    elif mat == 'concrete':
        s.rect(x, y, w, h, c); s.hlines(x, y, w, h, mul(c, 0.9), 1.2, 0.03); s.noise(x, y, w, h, 0.08, 1.2, 1.2, seed + 9)
    elif mat == 'metal':
        s.vboards(x, y, w, h, c, 0.4, 0.14)
    elif mat == 'corrugated':
        s.vboards(x, y, w, h, c, 0.12, 0.2)
    else:  # stucco
        s.rect(x, y, w, h, c); s.noise(x, y, w, h, 0.035, 0.12, 0.12, seed + 9)
    s.weather(x, y, w, h, amt, seed)


def downpipe(s, x, y, h, c=0x6a6e6e):
    s.rect(x, y, 0.1, h, c); s.rect(x + 0.1, y, 0.04, h, mul(c, 0.7))
    s.rect(x - 0.04, y + h - 0.25, 0.18, 0.25, mul(c, 0.9))


def party_wall(Fc, mat, c, floors, g, fh, seed=0, wins=3, wc=None, recess=0.0, lightwell=False, trim=None, extra=True, wkind='hung', ww=0.9, wh=1.5, first=0):
    """Side wall: plainer, a few small windows per floor, pipes, patched paint. floors = upper-floor count."""
    s = Fc.s; W = Fc.w; H = Fc.h
    rng = np.random.default_rng(seed + 400)
    wallpaint(s, 0, 0, W, H, mat, c, seed)
    s.rect(0, 0, W, 0.4, mul(c, 0.72))
    if extra:
        # a repainted patch and a ghost of a lower neighbour
        s.rect(W * 0.55, 0.4, W * 0.3, min(H * 0.35, 3.2), mul(c, 0.93), 0.6)
        s.rect(W * 0.08, H * 0.5, W * 0.18, H * 0.2, mul(c, 1.06), 0.5)
    trim = mul(c, 1.2) if trim is None else trim
    for f in range(first, floors + 1):
        y = (g + (f - 1) * fh if f > 0 else 0) + (1.0 if f > 0 else 1.1)
        if y + wh > H - 0.4: continue
        for j in range(wins):
            if rng.random() < 0.2: continue
            x = W * (j + 0.5) / wins - ww / 2 + (rng.random() - 0.5) * 0.8
            s.window(x, y, ww, wh, trim=trim, tw=0.08, frame=wc if wc is not None else 0xd8d4c8, kind=wkind, sill=mul(trim, 0.9))
            if recess > 0: Fc.recess(x, y, ww, wh, recess)
    downpipe(s, W * 0.33, 0, H - 0.3)
    if W > 14: downpipe(s, W * 0.78, 0, H - 0.3)
    # meters / vents low on the wall
    s.rect(W * 0.12, 0.9, 0.5, 0.7, 0x8a8c88); s.rect(W * 0.12 + 0.6, 1.0, 0.3, 0.5, 0x777a78)
    s.vshade(0, H - 0.5, W, 0.5, 1.0, 0.9)


def cornice_paint(s, x, y, w, h, c, dentil=0.3, top=None):
    """Classical cornice elevation: frieze, dentil row, crown (lighter top)."""
    s.grad(x, y, w, h, mul(c, 0.9), mul(c, 1.04))
    s.rect(x, y, w, h * 0.12, mul(c, 0.78))
    if dentil:
        dy = y + h * 0.45; dh = h * 0.16
        s.rect(x, dy - 0.02, w, dh + 0.04, mul(c, 0.8))
        n = int(w / dentil)
        for i in range(n):
            s.rect(x + (i + 0.25) * w / n, dy, w / n * 0.5, dh, mul(c, 1.06))
    s.rect(x, y + h * 0.68, w, h * 0.06, mul(c, 0.8))
    s.rect(x, y + h - max(0.06, h * 0.12), w, max(0.06, h * 0.12), mul(c, 1.08) if top is None else top)


def brackets(F, x, w, y, h, n, bw=0.16, d=0.3, lod=False):
    """n scroll brackets (boxes) spaced over [x, x+w]; paint them first (they sample the sheet)."""
    for i in range(n):
        bx = x + (i + 0.5) * w / n - bw / 2
        F.box(bx, y, bw, h, d, faces='flrb', lod=lod)


def paint_brackets(s, x, w, y, h, n, c, bw=0.16):
    for i in range(n):
        bx = x + (i + 0.5) * w / n - bw / 2
        s.grad(bx, y, bw, h, mul(c, 0.82), c)
        s.rect(bx, y, bw, 0.05, mul(c, 0.7))


def steps(F, x, w, n, rise, tread, c, d0=0.0, y0=0.0):
    """n steps climbing INTO the wall from depth d0 (inside a recess): paint + geometry."""
    s = F.s
    s.rect(x, y0, w, n * rise, c)
    for j in range(n):
        s.rect(x, y0 + j * rise + rise - 0.05, w, 0.05, mul(c, 1.15)); s.rect(x, y0 + j * rise, w, 0.04, mul(c, 0.75))
        F.box(x, y0 + j * rise, w, rise, d0 - j * tread, d0 - (j + 1) * tread, faces='ft')


def roof_firewalls(k, xs, z0, z1, y, h=0.35, t=0.25):
    s = k.prop_sheet()
    for x in xs:
        k.box(x - t / 2, y, z0, x + t / 2, y + h, z1, s, (0.1, 3.05, 1.5, 0.3), (0.1, 3.4, 1.5, 0.3))


def gable_roof(k, x0, x1, z0, z1, eave, ridge, sheet=None, ov=0.4, eov=0.3, prio=0.5, c=0x60646a, kind='shingle'):
    """Two slopes, ridge running front (z1) to back (z0) at mid-x. Returns the sheet (slope length x depth)."""
    xr = (x0 + x1) / 2; half = (x1 - x0) / 2; rise = ridge - eave
    L = math.hypot(half + eov, rise * (half + eov) / half); Dp = z1 - z0 + 2 * ov
    s = sheet
    if s is None:
        s = k.sheet(L, Dp, prio, 'groof')
        if kind == 'shingle': s.shingles(0, 0, L, Dp, c, 0.35, 0.2)
        else:
            # corrugated sheet: ribs run down the slope (along u), drawn as fine lines across v
            s.rect(0, 0, L, Dp, c); s.hlines(0, 0, L, Dp, mul(c, 0.82), 0.25, 0.08)
            s.vlines(0, 0, L, Dp, mul(c, 0.9), 2.4, 0.04)
        s.noise(0, 0, L, Dp, 0.12, 2.0, 2.0, 3); s.noise(0, 0, L, Dp, 0.08, 3.0, 0.3, 5)
        s.rect(0, 0, 0.14, Dp, mul(c, 0.75))
    for sgn in (-1, 1):
        xe = xr + sgn * (half + eov); ye = ridge - rise * (half + eov) / half
        pts = [np.array([xe, ye, z1 + ov]), np.array([xr, ridge, z1 + ov]), np.array([xr, ridge, z0 - ov]), np.array([xe, ye, z0 - ov])]
        k.emit(pts, s, [(L, 0), (0, 0), (0, Dp), (L, Dp)], np.array([sgn * 0.7, 0.7, 0]), 3)
        low = [p - UP * 0.06 for p in pts]
        k.emit(low, s, [(0.12, 0), (0.02, 0), (0.02, Dp), (0.12, Dp)], np.array([-sgn * 0.7, -0.7, 0]), 1)
        for zz, zn in ((z1 + ov, 1.0), (z0 - ov, -1.0)):
            k.emit([np.array([xe, ye, zz]), np.array([xr, ridge, zz]), np.array([xr, ridge - 0.3, zz]), np.array([xe, ye - 0.3, zz])], s, [(0.12, 0), (0.02, 0), (0.02, 1), (0.12, 1)], np.array([0, 0, zn]), 1)
    return s
