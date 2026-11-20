# San Francisco generic building kit: shared library (design-kit).
#
# Runs inside Blender 4.5 (`blender -b -P kit_build.py -- <piece> ...`); numpy only (no PIL).
#
# Method (as Seattle's kit: one mesh, one material, one painted 1024 atlas per piece):
#   * a piece is assembled from FACADES (planar wall panels with a metre-space elevation
#     drawing, the "sheet"), recesses cut into them (windows, doors, loading bays),
#     projecting boxes / bays / awnings, roofs and free roof props;
#   * every face's UVs are the orthographic (or unrolled) projection of the face onto its
#     sheet, so whatever is painted at (x, y) metres on a sheet lands on the geometry there,
#     and the LOD1 twin (flat walls + the big projections) reuses the same sheets;
#   * sheets are painted with lazy numpy ops in metres, packed into the 1024 atlas at one
#     texel density (per-sheet `prio` multipliers), supersampled 3x.
# Coordinates in this library are glTF's: +X right, +Y up, +Z = street front. Metres.
import math
import os
import json
import numpy as np

SS = 3          # paint supersampling
ATLAS = 1024
PAD = 2         # gutter (edge-replicated) round every sheet
EPS = 0.05      # metres: the strip of a sheet that reveal / side faces sample

UP = np.array([0.0, 1.0, 0.0])


def C(h):
    """0xRRGGBB -> (r, g, b) floats (sRGB)."""
    return np.array([(h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0], dtype=np.float32)


def col(c):
    if isinstance(c, (int, np.integer)):
        return C(int(c))
    return np.asarray(c, dtype=np.float32)


def mix(a, b, t):
    a = col(a); b = col(b)
    return a * (1 - t) + b * t


def mul(a, f):
    return np.clip(col(a) * f, 0, 1)


def hexof(c):
    c = np.clip(col(c), 0, 1)
    return (int(round(c[0] * 255)) << 16) | (int(round(c[1] * 255)) << 8) | int(round(c[2] * 255))


GLASS = C(0x34424f)       # daytime window glass (dark blue-grey)
GLASS_HI = C(0x6f8496)    # sky reflection
BLIND = C(0xb9b4a6)
TAR = C(0x6e6c68)
GRAVEL = C(0x8d8a82)
METAL = C(0x8e9296)
DARK = C(0x2e3033)


def op(fn):
    def wrap(self, *a, **k):
        if self.c is None:
            self.ops.append((fn, a, k))
            return self
        fn(self, *a, **k)
        return self
    wrap.__name__ = fn.__name__
    return wrap


def _vnoise(hp, wp, cy, cx, rng):
    cy = max(cy, 1.0); cx = max(cx, 1.0)
    gh = int(hp / cy) + 3; gw = int(wp / cx) + 3
    g = rng.random((gh, gw)).astype(np.float32)
    ys = np.arange(hp, dtype=np.float32) / cy; xs = np.arange(wp, dtype=np.float32) / cx
    y0 = ys.astype(np.int32); x0 = xs.astype(np.int32)
    fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def _hash(a, b):
    v = np.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return v - np.floor(v)


class Sheet:
    """A metre-space drawing (w x h, origin bottom-left, y up) that becomes one atlas rect."""

    def __init__(self, kit, w, h, prio=1.0, name=''):
        self.kit = kit; self.w = float(w); self.h = float(h); self.prio = prio; self.name = name
        self.ops = []; self.c = None; self.px = None
        kit.sheets.append(self)

    # ---- raster helpers (replay time)
    def _box(self, x, y, w, h):
        x0 = int(round(x * self.sx)); x1 = int(round((x + w) * self.sx))
        y1 = int(round((self.h - y) * self.sy)); y0 = int(round((self.h - y - h) * self.sy))
        if x1 <= x0: x1 = x0 + 1
        if y1 <= y0: y1 = y0 + 1
        H, W = self.c.shape[:2]
        x0 = max(0, min(W, x0)); x1 = max(0, min(W, x1)); y0 = max(0, min(H, y0)); y1 = max(0, min(H, y1))
        return x0, y0, x1, y1

    def _grid(self, b):
        x0, y0, x1, y1 = b
        X = ((np.arange(x0, x1, dtype=np.float32) + 0.5) / self.sx)[None, :]
        Y = (self.h - (np.arange(y0, y1, dtype=np.float32) + 0.5) / self.sy)[:, None]
        return X, Y

    def _blend(self, b, colr, a):
        x0, y0, x1, y1 = b
        if x1 <= x0 or y1 <= y0: return
        reg = self.c[y0:y1, x0:x1]
        if np.isscalar(a):
            if a >= 1: reg[...] = colr
            else: reg[...] = reg * (1 - a) + np.asarray(colr) * a
        else:
            a = a[..., None]
            reg[...] = reg * (1 - a) + np.asarray(colr) * a

    # ---- primitives
    @op
    def rect(self, x, y, w, h, c, a=1.0):
        self._blend(self._box(x, y, w, h), col(c), a)

    @op
    def grad(self, x, y, w, h, cb, ct, a=1.0):
        b = self._box(x, y, w, h); n = b[3] - b[1]
        if n <= 0 or b[2] <= b[0]: return
        t = np.linspace(1, 0, n, dtype=np.float32)[:, None, None]
        g = col(ct)[None, None, :] * t + col(cb)[None, None, :] * (1 - t)
        self._blend(b, np.broadcast_to(g, (n, b[2] - b[0], 3)), a)

    @op
    def hgrad(self, x, y, w, h, cl, cr, a=1.0):
        b = self._box(x, y, w, h); n = b[2] - b[0]
        if n <= 0 or b[3] <= b[1]: return
        t = np.linspace(0, 1, n, dtype=np.float32)[None, :, None]
        g = col(cr)[None, None, :] * t + col(cl)[None, None, :] * (1 - t)
        self._blend(b, np.broadcast_to(g, (b[3] - b[1], n, 3)), a)

    @op
    def shade(self, x, y, w, h, f):
        x0, y0, x1, y1 = self._box(x, y, w, h)
        self.c[y0:y1, x0:x1] *= f

    @op
    def vshade(self, x, y, w, h, fb, ft):
        x0, y0, x1, y1 = self._box(x, y, w, h); n = y1 - y0
        if n <= 0: return
        self.c[y0:y1, x0:x1] *= np.linspace(ft, fb, n, dtype=np.float32)[:, None, None]

    @op
    def hshade(self, x, y, w, h, fl, fr):
        x0, y0, x1, y1 = self._box(x, y, w, h); n = x1 - x0
        if n <= 0: return
        self.c[y0:y1, x0:x1] *= np.linspace(fl, fr, n, dtype=np.float32)[None, :, None]

    @op
    def ellipse(self, cx, cy, rx, ry, c, a=1.0, half=None):
        b = self._box(cx - rx, cy - ry, 2 * rx, 2 * ry); X, Y = self._grid(b)
        m = (((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0)
        if half == 'top': m = m & (Y >= cy)
        if half == 'bottom': m = m & (Y <= cy)
        self._blend(b, col(c), m.astype(np.float32) * a)

    @op
    def poly(self, pts, c, a=1.0):
        pts = np.asarray(pts, dtype=np.float32)
        mn = pts.min(0); mx = pts.max(0)
        b = self._box(mn[0], mn[1], mx[0] - mn[0], mx[1] - mn[1]); X, Y = self._grid(b)
        inside = np.zeros((b[3] - b[1], b[2] - b[0]), dtype=bool)
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
            if y1 == y2: continue
            cond = ((y1 > Y) != (y2 > Y))
            xi = (x2 - x1) * (Y - y1) / (y2 - y1) + x1
            inside ^= (cond & (X < xi))
        self._blend(b, col(c), inside.astype(np.float32) * a)

    @op
    def noise(self, x, y, w, h, amp, sx_m, sy_m=None, seed=0):
        """Multiplicative value noise, cell size in metres."""
        x0, y0, x1, y1 = self._box(x, y, w, h)
        if x1 <= x0 or y1 <= y0: return
        rng = np.random.default_rng(seed + 17)
        n = _vnoise(y1 - y0, x1 - x0, (sy_m or sx_m) * self.sy, sx_m * self.sx, rng)
        self.c[y0:y1, x0:x1] *= (1 + amp * (n - 0.5) * 2)[..., None]

    @op
    def speckle(self, x, y, w, h, amp, seed=0):
        x0, y0, x1, y1 = self._box(x, y, w, h)
        if x1 <= x0 or y1 <= y0: return
        rng = np.random.default_rng(seed + 5)
        n = rng.random(((y1 - y0 + SS - 1) // SS + 1, (x1 - x0 + SS - 1) // SS + 1)).astype(np.float32)
        n = np.repeat(np.repeat(n, SS, 0), SS, 1)[:y1 - y0, :x1 - x0]
        self.c[y0:y1, x0:x1] *= (1 + amp * (n - 0.5) * 2)[..., None]

    @op
    def bricks(self, x, y, w, h, c, mortar=None, bw=0.22, bh=0.075, var=0.10, mw=0.012):
        b = self._box(x, y, w, h); X, Y = self._grid(b)
        if b[2] <= b[0] or b[3] <= b[1]: return
        c = col(c); mortar = mul(c, 1.25) if mortar is None else col(mortar)
        row = np.floor(Y / bh); xo = X + (row % 2) * bw * 0.5
        cc = np.floor(xo / bw)
        fx = xo - cc * bw; fy = Y - row * bh
        m = ((fx < mw) | (fy < mw)).astype(np.float32)
        hv = _hash(row, cc)
        tone = (1 + var * (hv - 0.5) * 2)[..., None] * c[None, None, :]
        tone = tone * (1 - m[..., None]) + mortar[None, None, :] * m[..., None]
        self.c[b[1]:b[3], b[0]:b[2]] = tone

    @op
    def siding(self, x, y, w, h, c, board=0.15, depth=0.16):
        """Horizontal lap siding: each board lighter at its top, a shadow line at its bottom."""
        b = self._box(x, y, w, h); X, Y = self._grid(b)
        if b[2] <= b[0] or b[3] <= b[1]: return
        fy = Y / board - np.floor(Y / board)
        sh = 1 + depth * (fy - 0.6) - np.where(fy < 0.14, depth * 1.2, 0)
        self.c[b[1]:b[3], b[0]:b[2]] = col(c)[None, None, :] * np.broadcast_to(sh, (b[3] - b[1], b[2] - b[0]))[..., None]

    @op
    def vboards(self, x, y, w, h, c, board=0.3, depth=0.12):
        """Vertical board / standing-seam / corrugated lines."""
        b = self._box(x, y, w, h); X, Y = self._grid(b)
        if b[2] <= b[0] or b[3] <= b[1]: return
        fx = X / board - np.floor(X / board)
        sh = 1 + depth * 0.3 * (fx - 0.5) - np.where(fx < 0.12, depth, 0)
        self.c[b[1]:b[3], b[0]:b[2]] = col(c)[None, None, :] * np.broadcast_to(sh, (b[3] - b[1], b[2] - b[0]))[..., None]

    @op
    def scales(self, x, y, w, h, c, size=0.22, depth=0.2):
        """Fish-scale shingles."""
        b = self._box(x, y, w, h); X, Y = self._grid(b)
        if b[2] <= b[0] or b[3] <= b[1]: return
        row = np.floor(Y / size); xo = X + (row % 2) * size * 0.5
        fx = xo / size - np.floor(xo / size) - 0.5; fy = Y / size - row
        edge = 0.5 - np.sqrt(np.maximum(0.0, 0.25 - fx * fx))
        sh = np.where(fy < edge + 0.12, 1 - depth, 1 + depth * 0.25 * (fy - 0.5))
        hv = _hash(row, np.floor(xo / size))
        sh = sh * (1 + 0.06 * (hv - 0.5))
        self.c[b[1]:b[3], b[0]:b[2]] = col(c)[None, None, :] * sh[..., None]

    @op
    def tiles(self, x, y, w, h, c, pitch=0.3, rows=0.45, depth=0.22):
        """Barrel (mission / pagoda) roof tiles: ribs run up the sheet."""
        b = self._box(x, y, w, h); X, Y = self._grid(b)
        if b[2] <= b[0] or b[3] <= b[1]: return
        rib = np.abs(np.sin(np.pi * X / pitch))
        fy = Y / rows - np.floor(Y / rows)
        sh = (1 - depth + 1.4 * depth * rib) * np.where(fy < 0.12, 0.85, 1.0)
        hv = _hash(np.floor(Y / rows), np.floor(X / pitch))
        sh = sh * (1 + 0.08 * (hv - 0.5))
        self.c[b[1]:b[3], b[0]:b[2]] = col(c)[None, None, :] * sh[..., None]

    @op
    def shingles(self, x, y, w, h, c, size=0.3, rows=0.18, depth=0.14):
        """Asphalt / wood shingle courses."""
        b = self._box(x, y, w, h); X, Y = self._grid(b)
        if b[2] <= b[0] or b[3] <= b[1]: return
        row = np.floor(Y / rows); xo = X + _hash(row, row * 0 + 3.0) * size
        cc = np.floor(xo / size); fx = xo / size - cc; fy = Y / rows - row
        sh = np.where((fy < 0.16) | (fx < 0.06), 1 - depth, 1.0) * (1 + 0.12 * (_hash(row, cc) - 0.5))
        self.c[b[1]:b[3], b[0]:b[2]] = col(c)[None, None, :] * sh[..., None]

    # ---- composite painters (record-time; all metres)
    def hlines(self, x, y, w, h, c, pitch, lw=0.03, a=1.0, off=0.0):
        n = int(h / pitch + 1e-6)
        for i in range(n + 1):
            yy = y + off + i * pitch
            if yy + lw <= y + h + 1e-6: self.rect(x, yy, w, lw, c, a)

    def vlines(self, x, y, w, h, c, pitch, lw=0.03, a=1.0, off=0.0):
        n = int(w / pitch + 1e-6)
        for i in range(n + 1):
            xx = x + off + i * pitch
            if xx + lw <= x + w + 1e-6: self.rect(xx, y, lw, h, c, a)

    def weather(self, x, y, w, h, amt=1.0, seed=0, base=True):
        self.noise(x, y, w, h, 0.07 * amt, 3.0, 2.2, seed)
        self.noise(x, y, w, h, 0.05 * amt, 0.22, 4.0, seed + 1)   # vertical streaks
        self.speckle(x, y, w, h, 0.035 * amt, seed + 2)
        if base and h > 2.5:
            self.vshade(x, y, w, min(1.6, h * 0.2), 0.86, 1.0)

    def glass(self, x, y, w, h, g=None, seed=0, blind=0.45, hi=None, tint=None):
        """A pane: darker low, sky-bright high, a soft diagonal sheen, maybe a blind."""
        rng = self.kit.rng
        g = GLASS if g is None else col(g)
        hi = mix(g, GLASS_HI, 0.75) if hi is None else col(hi)
        v = 0.9 + 0.25 * rng.random()
        self.grad(x, y, w, h, mul(g, 0.85 * v), mix(g, hi, 0.55) * v)
        if blind and rng.random() < blind:
            f = 0.2 + 0.6 * rng.random()
            bc = mix(BLIND if tint is None else tint, g, 0.35 + 0.2 * rng.random())
            self.rect(x, y + h * (1 - f), w, h * f, bc)
            if h * f > 0.5: self.hlines(x, y + h * (1 - f), w, h * f, mul(bc, 0.9), 0.12, 0.03)
        elif blind and rng.random() < 0.25:
            cw = w * (0.18 + 0.1 * rng.random()); cc = mix(C(0xc8bfae), g, 0.4)
            self.rect(x, y, cw, h, cc); self.rect(x + w - cw, y, cw, h, cc)
        self.vshade(x, y + h - min(0.22, h * 0.25), w, min(0.22, h * 0.25), 1.0, 0.62)   # head shadow

    def window(self, x, y, w, h, *, trim=None, tw=0.10, frame=0xe2ddd0, glass=None, kind='hung',
               blind=0.45, wall=None, sill=None, nx=2, ny=2, fw=None):
        """Paint a window whose OPENING is (x, y, w, h). trim: casing colour drawn tw outside it."""
        if trim is not None:
            self.rect(x - tw, y - tw, w + 2 * tw, h + 2 * tw, trim)
        if sill is not None:
            self.rect(x - tw - 0.06, y - tw - 0.09, w + 2 * tw + 0.12, 0.11, sill)
            self.vshade(x - tw, y - tw - 0.45, w + 2 * tw, 0.36, 1.0, 0.86)
        frame = col(frame)
        fw = min(0.07, w * 0.09) if fw is None else fw
        if kind == 'arch':
            r = w / 2
            self.rect(x, y, w, h, wall if wall is not None else frame)
            self.rect(x, y, w, h - r, frame)
            self.ellipse(x + r, y + h - r, r, r, frame, half='top')
            self.glass(x + fw, y + fw, w - 2 * fw, h - r - fw, glass, blind=blind)
            self.ellipse(x + r, y + h - r, r - fw, r - fw, mix(glass if glass is not None else GLASS, GLASS_HI, 0.4), half='top')
            self.rect(x + r - fw / 2, y + fw, fw, h - fw - 0.02, frame)
            self.rect(x, y + h - r - fw / 2, w, fw, frame)
            return
        self.rect(x, y, w, h, frame)
        gx, gy, gw, gh = x + fw, y + fw, w - 2 * fw, h - 2 * fw
        if kind == 'hung':
            hh = (gh - fw) / 2
            self.glass(gx, gy, gw, hh, glass, blind=0)
            self.glass(gx, gy + hh + fw, gw, hh, glass, blind=blind)
        elif kind == 'pair':
            ww = (gw - fw) / 2; hh = (gh - fw) / 2
            for i in range(2):
                self.glass(gx + i * (ww + fw), gy, ww, hh, glass, blind=0)
                self.glass(gx + i * (ww + fw), gy + hh + fw, ww, hh, glass, blind=blind)
        elif kind == 'grid':
            self.glass(gx, gy, gw, gh, glass, blind=blind * 0.5)
            for i in range(1, nx): self.rect(gx + gw * i / nx - fw / 3, gy, fw / 1.5, gh, frame)
            for j in range(1, ny): self.rect(gx, gy + gh * j / ny - fw / 3, gw, fw / 1.5, frame)
        elif kind == 'transom':
            th = min(0.55, gh * 0.25)
            self.glass(gx, gy, gw, gh - th - fw, glass, blind=blind)
            self.glass(gx, gy + gh - th, gw, th, glass, blind=0)
            for i in range(1, nx): self.rect(gx + gw * i / nx - fw / 2, gy, fw, gh, frame)
        else:  # fixed
            self.glass(gx, gy, gw, gh, glass, blind=blind)

    def door(self, x, y, w, h, c=0x5a3a2a, frame=0xe2ddd0, glass=True, transom=0.0):
        self.rect(x, y, w, h, frame)
        fw = 0.07
        dh = h - transom - fw
        self.rect(x + fw, y, w - 2 * fw, dh, c)
        self.rect(x + fw + 0.1, y + 0.15, w - 2 * fw - 0.2, dh * 0.38, mul(c, 0.86))
        if glass: self.glass(x + fw + 0.14, y + dh * 0.55, w - 2 * fw - 0.28, dh * 0.36, blind=0)
        else: self.rect(x + fw + 0.1, y + dh * 0.55, w - 2 * fw - 0.2, dh * 0.36, mul(c, 0.86))
        if transom > 0: self.glass(x + fw, y + dh + fw, w - 2 * fw, transom - fw, blind=0)
        self.rect(x + w - fw - 0.2, y + dh * 0.45, 0.07, 0.07, 0xb09a5a)

    def garage(self, x, y, w, h, c=0xd8d2c4, panels=4, lites=True):
        self.rect(x, y, w, h, mul(c, 0.8))
        ph = h / panels
        for i in range(panels):
            self.grad(x + 0.04, y + i * ph + 0.03, w - 0.08, ph - 0.06, mul(c, 0.94), c)
        if lites:
            n = max(2, int(w / 0.6))
            for i in range(n):
                self.glass(x + 0.12 + i * (w - 0.24) / n + 0.04, y + (panels - 1) * ph + 0.1, (w - 0.24) / n - 0.08, ph - 0.2, blind=0)
        self.vshade(x, y + h - 0.3, w, 0.3, 1.0, 0.7)

    def rollup(self, x, y, w, h, c=0x9a9c98):
        self.rect(x, y, w, h, c)
        self.hlines(x, y, w, h, mul(c, 0.8), 0.14, 0.035)
        self.vshade(x, y + h - 0.5, w, 0.5, 1.0, 0.65)
        self.noise(x, y, w, h, 0.06, 0.4, 1.5, 7)

    def storefront(self, x, y, w, h, *, frame=0x3a3d40, bulk=0x5a5248, bulk_h=0.5, transom=0.6, door=None,
                   bays=None, glass=None, sign=None, sign_h=0.0):
        """Shopfront glazing filling (x, y, w, h): bulkhead, display panes, transom lights,
        optional door bay index and an abstract sign band on top (sign = colour)."""
        self.rect(x, y, w, h, frame)
        if sign is not None and sign_h > 0:
            self.signband(x + 0.1, y + h - sign_h + 0.06, w - 0.2, sign_h - 0.12, sign)
            h = h - sign_h
        n = bays or max(1, int(round(w / 1.8)))
        bw = w / n
        g = GLASS if glass is None else glass
        for i in range(n):
            bx = x + i * bw + 0.05; ww = bw - 0.1
            if door is not None and i == door:
                self.rect(bx, y, ww, h - transom, mul(frame, 1.25))
                self.glass(bx + 0.12, y + 0.25, ww - 0.24, h - transom - 0.4, mul(g, 0.8), blind=0)
                self.rect(bx + ww - 0.3, y + 1.0, 0.06, 0.3, 0xb8b8b0)
            else:
                self.rect(bx, y, ww, bulk_h, bulk)
                self.rect(bx + 0.08, y + 0.08, ww - 0.16, bulk_h - 0.16, mul(bulk, 0.85))
                self.glass(bx, y + bulk_h + 0.05, ww, h - transom - bulk_h - 0.1, g, blind=0)
                # goods / interior glow low in the pane
                rng = self.kit.rng
                self.rect(bx + 0.05, y + bulk_h + 0.08, ww - 0.1, 0.5 + 0.4 * rng.random(), mix(g, [0.55 + 0.2 * rng.random(), 0.5, 0.4], 0.35), 0.8)
            if transom > 0.05:
                self.glass(bx, y + h - transom + 0.03, ww, transom - 0.08, mul(g, 1.15), blind=0)
        self.vshade(x, y + h - 0.6, w, 0.6, 1.0, 0.72)

    def signband(self, x, y, w, h, c, blocks=True):
        """An abstract sign: a coloured board with illegible light blocks."""
        self.rect(x, y, w, h, c)
        self.rect(x, y, w, 0.04, mul(c, 0.7)); self.rect(x, y + h - 0.04, w, 0.04, mul(c, 1.2))
        if blocks:
            rng = self.kit.rng
            lc = mix(c, 0xf0ead8, 0.75) if float(np.mean(col(c))) < 0.55 else mix(c, 0x2a2a2a, 0.7)
            n = max(2, int(w / (h * 0.9)))
            used = 0.15 * w
            while used < w * 0.85:
                bw = h * (0.25 + 0.5 * rng.random())
                if used + bw > w * 0.88: break
                bh = h * (0.35 + 0.2 * rng.random())
                self.rect(x + used, y + (h - bh) / 2, bw, bh, lc, 0.9)
                used += bw + h * 0.14 * (1 + 2 * (rng.random() < 0.2))

    def awning_paint(self, x, y, w, h, c1, c2=None, stripe=0.4):
        self.grad(x, y, w, h, mul(c1, 0.85), c1)
        if c2 is not None:
            n = int(w / stripe)
            for i in range(0, n + 1, 2):
                self.rect(x + i * stripe, y, min(stripe, x + w - (x + i * stripe)), h, c2, 0.9)
        self.vshade(x, y, w, h, 0.85, 1.05)

    def roofing(self, x, y, w, h, seed=0, c=None, coping=0.0, cc=None, skylights=0, hatches=1):
        """Flat tar-and-gravel roof seen in plan; coping = parapet thickness drawn round the edge."""
        c = GRAVEL if c is None else col(c)
        self.rect(x, y, w, h, c)
        self.noise(x, y, w, h, 0.10, 2.5, 2.5, seed)
        self.noise(x, y, w, h, 0.06, 0.6, 0.6, seed + 3)
        self.speckle(x, y, w, h, 0.06, seed)
        rng = np.random.default_rng(seed + 99)
        # roll seams and ponding stains
        n = int(w / 3.0)
        for i in range(1, n + 1):
            self.rect(x + i * w / (n + 1), y, 0.05, h, mul(c, 0.86), 0.6)
        for i in range(3):
            px = x + coping + rng.random() * max(0.1, w - 2 * coping - 2); py = y + coping + rng.random() * max(0.1, h - 2 * coping - 2)
            self.ellipse(px + 1, py + 1, 0.8 + rng.random() * 1.6, 0.6 + rng.random() * 1.0, mul(c, 0.78), 0.35)
        if coping > 0:
            cc = mul(c, 1.15) if cc is None else col(cc)
            for (rx, ry, rw, rh) in ((x, y, w, coping), (x, y + h - coping, w, coping), (x, y, coping, h), (x + w - coping, y, coping, h)):
                self.rect(rx, ry, rw, rh, cc)
            # shadow the parapet throws on the roof
            self.vshade(x + coping, y + coping, w - 2 * coping, 0.5, 0.7, 1.0)
            self.hshade(x + w - coping - 0.5, y + coping, 0.5, h - 2 * coping, 1.0, 0.75)


class Facade:
    """A planar wall panel: p0 = base-left corner seen from outside, r = unit horizontal 'right'."""

    def __init__(self, kit, p0, r, w, h, sheet=None, su=0.0, sv=0.0, prio=1.0, name=''):
        self.k = kit; self.p0 = np.asarray(p0, dtype=float); self.r = np.asarray(r, dtype=float)
        self.w = float(w); self.h = float(h)
        self.n = np.cross(self.r, UP)
        self.s = sheet if sheet is not None else Sheet(kit, w, h, prio, name)
        self.su = su; self.sv = sv
        self.holes = []

    def P(self, x, y, d=0.0):
        return self.p0 + self.r * x + UP * y + self.n * d

    def uv(self, x, y):
        return (self.su + x, self.sv + y)

    def face(self, pts, uvs, want, lod=1, sh=None):
        if sh is not None: self.k.emit(pts, sh, list(uvs), want, lod)
        else: self.k.emit(pts, self.s, [self.uv(*u) for u in uvs], want, lod)

    def quad(self, x0, y0, x1, y1, d=0.0, lod=1):
        self.face([self.P(x0, y0, d), self.P(x1, y0, d), self.P(x1, y1, d), self.P(x0, y1, d)],
                  [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], self.n, lod)

    def recess(self, x, y, w, h, d=0.2):
        """Cut a rectangular recess d deep (back face + four reveals)."""
        x0 = max(0.0, x); y0 = max(0.0, y); x1 = min(self.w, x + w); y1 = min(self.h, y + h)
        if x1 - x0 > 1e-3 and y1 - y0 > 1e-3:
            self.holes.append((x0, y0, x1 - x0, y1 - y0, d))

    def wall(self, lod1=True, top=None):
        """Emit the wall (with its recesses). top: optional list of (x, y) points above y=h closing a gable."""
        H = self.holes
        ys = sorted(set([0.0, self.h] + [round(v, 4) for (x, y, w, h, d) in H for v in (y, y + h)]))
        opened = {}; out = []
        for i in range(len(ys) - 1):
            ya, yb = ys[i], ys[i + 1]
            if yb - ya < 1e-5: continue
            hs = sorted([(x, x + w) for (x, y, w, h, d) in H if y < ya + 1e-4 and y + h > yb - 1e-4])
            spans = []; cx = 0.0
            for (a, b) in hs:
                if a > cx + 1e-4: spans.append((cx, a))
                cx = max(cx, b)
            if cx < self.w - 1e-4: spans.append((cx, self.w))
            cur = set((round(a, 4), round(b, 4)) for a, b in spans)
            for s in list(opened):
                if s not in cur:
                    out.append((s[0], opened[s], s[1], ya)); del opened[s]
            for s in cur:
                if s not in opened: opened[s] = ya
        for s in opened: out.append((s[0], opened[s], s[1], self.h))
        for (x0, y0, x1, y1) in out: self.quad(x0, y0, x1, y1, 0.0, 1)
        for (x, y, w, h, d) in H:
            x1 = x + w; y1 = y + h; e = EPS
            self.quad(x, y, x1, y1, -d, 1)
            self.face([self.P(x, y, 0), self.P(x, y, -d), self.P(x, y1, -d), self.P(x, y1, 0)], [(x - e, y), (x, y), (x, y1), (x - e, y1)], self.r, 1)
            self.face([self.P(x1, y, 0), self.P(x1, y, -d), self.P(x1, y1, -d), self.P(x1, y1, 0)], [(x1 + e, y), (x1, y), (x1, y1), (x1 + e, y1)], -self.r, 1)
            self.face([self.P(x, y, 0), self.P(x1, y, 0), self.P(x1, y, -d), self.P(x, y, -d)], [(x, y - e), (x1, y - e), (x1, y), (x, y)], UP, 1)
            self.face([self.P(x, y1, 0), self.P(x1, y1, 0), self.P(x1, y1, -d), self.P(x, y1, -d)], [(x, y1 + e), (x1, y1 + e), (x1, y1), (x, y1)], -UP, 1)
        if top:
            pts = [(0.0, self.h), (self.w, self.h)] + list(top)[::-1]
            self.face([self.P(px, py) for px, py in pts], pts, self.n, 3)
        if lod1:
            self.quad(0, 0, self.w, self.h, 0.0, 2)

    def box(self, x, y, w, h, d, d0=0.0, faces='flrtb', lod=False, ao=0.0, uvrect=None, sh=None):
        """A box standing proud of the wall from depth d0 to d (front face = its sheet rect).
        faces: f front, l left, r right, t top, b bottom. ao: paint a soft shadow below."""
        L = 3 if lod else 1
        x1 = x + w; y1 = y + h; e = min(EPS, w * 0.3, h * 0.3)
        if uvrect is None: ux, uy, ux1, uy1 = x, y, x1, y1
        else: ux, uy, ux1, uy1 = uvrect[0], uvrect[1], uvrect[0] + uvrect[2], uvrect[1] + uvrect[3]
        P = self.P
        if 'f' in faces:
            self.face([P(x, y, d), P(x1, y, d), P(x1, y1, d), P(x, y1, d)], [(ux, uy), (ux1, uy), (ux1, uy1), (ux, uy1)], self.n, L, sh)
        if 'l' in faces:
            self.face([P(x, y, d0), P(x, y, d), P(x, y1, d), P(x, y1, d0)], [(ux, uy), (ux + e, uy), (ux + e, uy1), (ux, uy1)], -self.r, L, sh)
        if 'r' in faces:
            self.face([P(x1, y, d0), P(x1, y, d), P(x1, y1, d), P(x1, y1, d0)], [(ux1, uy), (ux1 - e, uy), (ux1 - e, uy1), (ux1, uy1)], self.r, L, sh)
        if 't' in faces:
            self.face([P(x, y1, d0), P(x1, y1, d0), P(x1, y1, d), P(x, y1, d)], [(ux, uy1), (ux1, uy1), (ux1, uy1 - e), (ux, uy1 - e)], UP, L, sh)
        if 'b' in faces:
            self.face([P(x, y, d0), P(x1, y, d0), P(x1, y, d), P(x, y, d)], [(ux, uy), (ux1, uy), (ux1, uy + e), (ux, uy + e)], -UP, 1, sh)
        if ao > 0:
            dd = min(1.2, (d - d0) * 1.6)
            self.s.vshade(self.su + x, self.sv + y - dd, w, dd, 1.0, 1.0 - ao)

    def awning(self, x, y, w, h, d, val=0.25, lod=False, uvrect=None, sh=None, shadow=True):
        """Sloped canvas awning: fixed to the wall at y+h, front edge at depth d with a valance val tall at y."""
        L = 3 if lod else 1
        x1 = x + w; y1 = y + h; P = self.P
        ux, uy, uw, uh = (x, y, w, h) if uvrect is None else uvrect
        self.face([P(x, y + val, d), P(x1, y + val, d), P(x1, y1, 0), P(x, y1, 0)], [(ux, uy + val), (ux + uw, uy + val), (ux + uw, uy + uh), (ux, uy + uh)], self.n + UP, L, sh)
        self.face([P(x, y, d), P(x1, y, d), P(x1, y + val, d), P(x, y + val, d)], [(ux, uy), (ux + uw, uy), (ux + uw, uy + val), (ux, uy + val)], self.n, L, sh)
        e = EPS
        self.face([P(x, y + val, 0), P(x, y + val, d), P(x, y1, 0)], [(ux, uy + val), (ux + e, uy + val), (ux, uy + uh)], -self.r, 1, sh)
        self.face([P(x1, y + val, 0), P(x1, y + val, d), P(x1, y1, 0)], [(ux + uw, uy + val), (ux + uw - e, uy + val), (ux + uw, uy + uh)], self.r, 1, sh)
        self.face([P(x, y + val, 0), P(x1, y + val, 0), P(x1, y + val, d), P(x, y + val, d)], [(ux, uy + val), (ux + uw, uy + val), (ux + uw, uy + val + e), (ux, uy + val + e)], -UP, 1, sh)
        self.face([P(x, y, d), P(x, y + val, d), P(x, y + val, d - 0.02)], [(ux, uy), (ux, uy + val), (ux + e, uy + val)], -self.r, 0, sh)
        if shadow: self.s.vshade(self.su + x, self.sv + y - 0.9, w, 0.9 + val, 1.0, 0.72)

    def bay(self, x, y, h, prof, sheet=None, su=0.0, sv=0.0, caps='tb', lod=True, captop=None):
        """A bay window column. prof: plan polyline [(dx, depth), ...] from (0, 0) to (w, 0).
        Its faces are unrolled along u on `sheet` (default: a new sheet) from su. Returns
        (sheet, segs) with segs = [(u0, u1), ...] per face."""
        prof = [(float(a), float(b)) for a, b in prof]
        L = [math.hypot(prof[i + 1][0] - prof[i][0], prof[i + 1][1] - prof[i][1]) for i in range(len(prof) - 1)]
        tot = sum(L)
        if sheet is None: sheet = Sheet(self.k, tot, h, 1.0, 'bay')
        segs = []; u = su
        pts = [self.P(x + a, y, b) for a, b in prof]; cen = np.mean(pts, axis=0) - self.n * 0.01
        for i in range(len(prof) - 1):
            a = pts[i]; b = pts[i + 1]
            want = (a + b) / 2 - cen; want[1] = 0
            self.k.emit([a, b, b + UP * h, a + UP * h], sheet, [(u, sv), (u + L[i], sv), (u + L[i], sv + h), (u, sv + h)], want, 1)
            segs.append((u, u + L[i])); u += L[i]
        e = EPS
        ct = captop if captop is not None else sv + h - e
        if 't' in caps:
            self.k.emit([p + UP * h for p in pts], sheet, [(su + tot * i / (len(pts) - 1), ct) for i in range(len(pts))], UP, 3 if (lod and len(pts) <= 4) else 1)
        if 'b' in caps:
            self.k.emit(pts, sheet, [(su + tot * i / (len(pts) - 1), sv + e) for i in range(len(pts))], -UP, 1)
        if lod:
            n = len(prof)
            idx = list(range(n)) if n <= 4 else [0, max(1, (n - 1) // 3), min(n - 2, (2 * (n - 1) + 2) // 3), n - 1]
            cum = [su]
            for l in L: cum.append(cum[-1] + l)
            for j in range(len(idx) - 1):
                a = pts[idx[j]]; b = pts[idx[j + 1]]
                want = (a + b) / 2 - cen; want[1] = 0
                self.k.emit([a, b, b + UP * h, a + UP * h], sheet, [(cum[idx[j]], sv), (cum[idx[j + 1]], sv), (cum[idx[j + 1]], sv + h), (cum[idx[j]], sv + h)], want, 2)
            if n > 4 and 't' in caps:
                self.k.emit([pts[i] + UP * h for i in idx], sheet, [(cum[i], ct) for i in idx], UP, 2)
        return sheet, segs

    def fire_escape(self, x, w, levels, d=1.0, rail=1.0, c=None, ladder=True, drop=True):
        """Iron fire escape: a slab landing per level in `levels` (y values), railings as thin
        bars, ladders between. Painted from a small dark patch of the kit's metal sheet."""
        k = self.k; ms = k.metal_sheet(c)
        def bar(a, b, t=0.05):
            k.bar(a, b, t, ms, (0.1, 0.1, 0.3, 0.3))
        for i, y in enumerate(levels):
            # landing: slatted slab
            k.boxpts(self.P(x, y - 0.06, 0), self.r * w, UP * 0.06, self.n * d, ms, (0.5, 0.0, 0.5, 0.5), (0.5, 0.5, 0.5, 0.5), lod=0, bottom=True)
            # rails: top + mid on three sides, corner posts
            for hh in (rail, rail * 0.5):
                bar(self.P(x, y + hh, d), self.P(x + w, y + hh, d))
                bar(self.P(x, y + hh, 0), self.P(x, y + hh, d))
                bar(self.P(x + w, y + hh, 0), self.P(x + w, y + hh, d))
            for px in (x, x + w, x + w / 2):
                bar(self.P(px, y, d), self.P(px, y + rail, d))
            # diagonal braces under the landing
            bar(self.P(x, y - 0.7, 0), self.P(x, y - 0.06, d * 0.9), 0.04)
            bar(self.P(x + w, y - 0.7, 0), self.P(x + w, y - 0.06, d * 0.9), 0.04)
            if ladder and i + 1 < len(levels):
                y2 = levels[i + 1]
                lx = x + (0.25 if i % 2 == 0 else w - 0.75)
                # a stair flight seen as two stringers
                bar(self.P(lx, y, d * 0.35), self.P(lx + (0.5 if i % 2 == 0 else -0.5) * 0 + 0.0, y2, d * 0.35), 0.05)
                bar(self.P(lx + 0.5, y, d * 0.35), self.P(lx + 0.5, y2, d * 0.35), 0.05)
                n = int((y2 - y) / 0.75)
                for j in range(1, n + 1):
                    bar(self.P(lx, y + j * (y2 - y) / (n + 1), d * 0.35), self.P(lx + 0.5, y + j * (y2 - y) / (n + 1), d * 0.35), 0.035)
        if drop and levels:
            y = levels[0]; lx = x + w - 0.75
            bar(self.P(lx, y - 2.2, d * 0.8), self.P(lx, y, d * 0.8), 0.045)
            bar(self.P(lx + 0.45, y - 2.2, d * 0.8), self.P(lx + 0.45, y, d * 0.8), 0.045)
            for j in range(4):
                bar(self.P(lx, y - 0.4 - j * 0.5, d * 0.8), self.P(lx + 0.45, y - 0.4 - j * 0.5, d * 0.8), 0.03)


class Kit:
    def __init__(self, name, seed=1):
        self.name = name
        self.rng = np.random.default_rng(seed)
        self.sheets = []
        self.faces = [[], []]   # LOD0 / LOD1: (pts[n,3], sheet, uvs[n,2])
        self._metal = {}
        self.max_ppm = 56.0

    # ---- emission
    def emit(self, pts, sheet, uvs, want=None, lod=1):
        pts = np.asarray(pts, dtype=float)
        if want is not None:
            n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
            if len(pts) > 3 and np.dot(n, n) < 1e-12: n = np.cross(pts[2] - pts[0], pts[3] - pts[0])
            if np.dot(n, np.asarray(want, dtype=float)) < 0:
                pts = pts[::-1]; uvs = list(uvs)[::-1]
        if lod & 1: self.faces[0].append((pts, sheet, list(uvs)))
        if lod & 2: self.faces[1].append((pts, sheet, list(uvs)))

    def sheet(self, w, h, prio=1.0, name=''):
        return Sheet(self, w, h, prio, name)

    def metal_sheet(self, c=None):
        """A 1 x 1 m swatch: [0..0.5]x[0..0.5] flat dark iron, right half grating, top-left lighter."""
        key = hexof(c if c is not None else DARK)
        if key not in self._metal:
            s = Sheet(self, 1.0, 1.0, 0.35, 'metal'); cc = col(c if c is not None else DARK)
            s.rect(0, 0, 1, 1, cc)
            s.rect(0.5, 0, 0.5, 0.5, mul(cc, 1.15)); s.hlines(0.5, 0, 0.5, 0.5, mul(cc, 0.7), 0.06, 0.02)
            s.rect(0.5, 0.5, 0.5, 0.5, mul(cc, 1.1))
            s.rect(0, 0.5, 0.5, 0.5, mul(cc, 1.3))
            self._metal[key] = s
        return self._metal[key]

    def facade(self, p0, r, w, h, sheet=None, **kw):
        return Facade(self, p0, r, w, h, sheet, **kw)

    def boxpts(self, o, ax, ay, az, sheet, side, top=None, lod=0, bottom=False, sides='fblr', side2=None):
        """A box from corner o with edge vectors ax (width), ay (up), az (depth toward the viewer side).
        side / top = (x, y, w, h) rects on `sheet`; side2: rect for the l / r faces. lod: 0 none, 1 also in LOD1."""
        o = np.asarray(o, dtype=float); ax = np.asarray(ax, dtype=float); ay = np.asarray(ay, dtype=float); az = np.asarray(az, dtype=float)
        L = 3 if lod else 1
        c = o + (ax + ay + az) / 2
        def rc(r):
            return [(r[0], r[1]), (r[0] + r[2], r[1]), (r[0] + r[2], r[1] + r[3]), (r[0], r[1] + r[3])]
        s2 = side2 if side2 is not None else side
        quads = {'f': ([o + az, o + az + ax, o + az + ax + ay, o + az + ay], side), 'b': ([o + ax, o, o + ay, o + ax + ay], side),
                 'l': ([o, o + az, o + az + ay, o + ay], s2), 'r': ([o + az + ax, o + ax, o + ax + ay, o + az + ax + ay], s2)}
        for kf in sides:
            p, r = quads[kf]
            self.emit(p, sheet, rc(r), np.mean(p, axis=0) - c, L)
        t = top if top is not None else (side[0], side[1] + side[3] - EPS, side[2], EPS)
        p = [o + ay + az, o + ay + az + ax, o + ay + ax, o + ay]
        self.emit(p, sheet, rc(t), np.mean(p, axis=0) - c, L)
        if bottom:
            p = [o + az, o + az + ax, o + ax, o]
            self.emit(p, sheet, rc(t), np.mean(p, axis=0) - c, 1)

    def box(self, x0, y0, z0, x1, y1, z1, sheet, side, top=None, lod=0, bottom=False, sides='fblr', side2=None):
        self.boxpts([x0, y0, z0], [x1 - x0, 0, 0], [0, y1 - y0, 0], [0, 0, z1 - z0], sheet, side, top, lod, bottom, sides, side2)

    def bar(self, a, b, t, sheet, rect, lod=1):
        """A thin square bar from a to b (4 faces, no caps)."""
        a = np.asarray(a, dtype=float); b = np.asarray(b, dtype=float)
        d = b - a; L = np.linalg.norm(d)
        if L < 1e-6: return
        d /= L
        ref = UP if abs(d[1]) < 0.9 else np.array([1.0, 0, 0])
        u = np.cross(d, ref); u /= np.linalg.norm(u); v = np.cross(d, u)
        u *= t / 2; v *= t / 2
        cs = [u + v, -u + v, -u - v, u - v]
        uv = [(rect[0], rect[1]), (rect[0] + rect[2], rect[1]), (rect[0] + rect[2], rect[1] + rect[3]), (rect[0], rect[1] + rect[3])]
        for i in range(4):
            c0 = cs[i]; c1 = cs[(i + 1) % 4]
            self.emit([a + c0, a + c1, b + c1, b + c0], sheet, uv, c0 + c1, lod)

    def cyl(self, cx, cz, r, y0, y1, n, sheet, rect, cap=None, lod=0, r1=None, a0=0.0, a1=2 * math.pi, capb=False):
        """Vertical prism / frustum (r at y0, r1 at y1); rect is wrapped round it; cap rect for the top."""
        r1 = r if r1 is None else r1
        L = 3 if lod else 1
        full = abs(a1 - a0 - 2 * math.pi) < 1e-6
        ring0 = []; ring1 = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            ring0.append(np.array([cx + r * math.sin(a), y0, cz + r * math.cos(a)]))
            ring1.append(np.array([cx + r1 * math.sin(a), y1, cz + r1 * math.cos(a)]))
        for i in range(n):
            u0 = rect[0] + rect[2] * i / n; u1 = rect[0] + rect[2] * (i + 1) / n
            mid = (ring0[i] + ring0[i + 1]) / 2 - np.array([cx, y0, cz])
            if r < 1e-6: mid = (ring1[i] + ring1[i + 1]) / 2 - np.array([cx, y1, cz])
            mid[1] = abs(r - r1) / max(1e-6, (y1 - y0)) * np.linalg.norm(mid) * (1 if r > r1 else -1)
            if r1 < 1e-6:
                self.emit([ring0[i], ring0[i + 1], ring1[i]], sheet, [(u0, rect[1]), (u1, rect[1]), ((u0 + u1) / 2, rect[1] + rect[3])], mid, L)
            else:
                self.emit([ring0[i], ring0[i + 1], ring1[i + 1], ring1[i]], sheet, [(u0, rect[1]), (u1, rect[1]), (u1, rect[1] + rect[3]), (u0, rect[1] + rect[3])], mid, L)
        if cap is not None and r1 > 1e-6:
            pts = ring1[:-1] if full else ring1
            uvs = [(cap[0] + cap[2] * (0.5 + 0.5 * (p[0] - cx) / r1), cap[1] + cap[3] * (0.5 - 0.5 * (p[2] - cz) / r1)) for p in pts]
            self.emit(pts, sheet, uvs, UP, L)
        if capb and cap is not None:
            pts = ring0[:-1] if full else ring0
            uvs = [(cap[0] + cap[2] * (0.5 + 0.5 * (p[0] - cx) / r), cap[1] + cap[3] * (0.5 - 0.5 * (p[2] - cz) / r)) for p in pts]
            self.emit(pts, sheet, uvs, -UP, 1)

    def flat_roof(self, x0, z0, x1, z1, y_roof, y_par, t=0.3, sheet=None, prio=0.55, lod=True, seed=0, paint=True, **kw):
        """Flat roof at y_roof inside a parapet whose top is y_par (thickness t). The sheet is the
        plan (u = x - x0, v = z1 - z): coping ring, deck. Returns the sheet (paint more on it)."""
        w = x1 - x0; d = z1 - z0
        s = sheet if sheet is not None else Sheet(self, w, d, prio, 'roof')
        if paint and sheet is None: s.roofing(0, 0, w, d, seed=seed, coping=t if y_par > y_roof + 0.01 else 0.0, **kw)
        def uv(x, z): return (x - x0, z1 - z)
        def q(pts, want, lod=1):
            self.emit([np.array(p, dtype=float) for p in pts], s, [uv(p[0], p[2]) for p in pts], want, lod)
        if y_par > y_roof + 0.01:
            q([(x0 + t, y_roof, z1 - t), (x1 - t, y_roof, z1 - t), (x1 - t, y_roof, z0 + t), (x0 + t, y_roof, z0 + t)], UP)
            # coping ring
            q([(x0, y_par, z1), (x1, y_par, z1), (x1 - t, y_par, z1 - t), (x0 + t, y_par, z1 - t)], UP)
            q([(x0, y_par, z0), (x0 + t, y_par, z0 + t), (x1 - t, y_par, z0 + t), (x1, y_par, z0)], UP)
            q([(x0, y_par, z1), (x0 + t, y_par, z1 - t), (x0 + t, y_par, z0 + t), (x0, y_par, z0)], UP)
            q([(x1, y_par, z1), (x1, y_par, z0), (x1 - t, y_par, z0 + t), (x1 - t, y_par, z1 - t)], UP)
            # inner faces (sample the coping edge)
            e = EPS
            def qi(a, b, want):
                self.emit([np.array([a[0], y_roof, a[1]]), np.array([b[0], y_roof, b[1]]), np.array([b[0], y_par, b[1]]), np.array([a[0], y_par, a[1]])], s,
                          [uv(a[0], a[1]), uv(b[0], b[1]), uv(b[0] + want[0] * e, b[1] + want[2] * e), uv(a[0] + want[0] * e, a[1] + want[2] * e)], want, 1)
            qi((x0 + t, z1 - t), (x1 - t, z1 - t), np.array([0, 0, -1.0]))
            qi((x0 + t, z0 + t), (x1 - t, z0 + t), np.array([0, 0, 1.0]))
            qi((x0 + t, z0 + t), (x0 + t, z1 - t), np.array([1.0, 0, 0]))
            qi((x1 - t, z0 + t), (x1 - t, z1 - t), np.array([-1.0, 0, 0]))
            if lod: q([(x0, y_par, z1), (x1, y_par, z1), (x1, y_par, z0), (x0, y_par, z0)], UP, 2)
        else:
            q([(x0, y_roof, z1), (x1, y_roof, z1), (x1, y_roof, z0), (x0, y_roof, z0)], UP, 3 if lod else 1)
        s.x0 = x0; s.z1 = z1
        return s

    def roof_poly(self, pts, y, sheet, x0, z1, lod=True):
        """Convex horizontal polygon mapped in plan onto `sheet` (u = x - x0, v = z1 - z)."""
        self.emit([np.array([p[0], y, p[1]], dtype=float) for p in pts], sheet, [(p[0] - x0, z1 - p[1]) for p in pts], UP, 3 if lod else 1)

    # ---- roof props (all sample a shared prop sheet)
    def prop_sheet(self):
        if getattr(self, '_props', None) is None:
            s = Sheet(self, 8.0, 4.0, 0.8, 'props'); self._props = s
            # (0,0) 3x3: stair bulkhead wall with a door | (3,0) 2x2: louvred plant | (5,0) 1.5x2: tank staves
            # (0,3) 4x1: sheet-metal tops | (4,3) 2x1 skylight glass | (6.5,0) 1.5x2 brick chimney | (6,3) 2x1 duct
            st = C(0xb9b2a2)
            s.rect(0, 0, 3, 3, st); s.weather(0, 0, 3, 3, 1.2, 4)
            s.door(1.0, 0, 0.95, 2.1, 0x6a6f72, 0x8a8a86, glass=False)
            s.rect(0, 2.85, 3, 0.15, mul(st, 0.8))
            s.rect(3, 0, 2, 2, C(0x9ea3a4)); s.hlines(3.1, 0.15, 1.8, 1.7, C(0x5f6466), 0.14, 0.06); s.rect(3, 0, 2, 0.12, C(0x7c8082)); s.rect(3, 1.88, 2, 0.12, C(0xb4b8b8))
            s.rect(5, 0, 1.5, 2, C(0x8a6a4a)); s.vlines(5, 0, 1.5, 2, C(0x5e4630), 0.15, 0.03); s.rect(5, 0.5, 1.5, 0.06, DARK); s.rect(5, 1.4, 1.5, 0.06, DARK); s.noise(5, 0, 1.5, 2, 0.12, 0.3, 1.0, 3)
            s.rect(6.5, 0, 1.5, 2, C(0x8a4a3a)); s.bricks(6.5, 0, 1.5, 2, C(0x8a4a3a)); s.rect(6.5, 1.85, 1.5, 0.15, C(0x9a9288))
            s.rect(0, 3, 4, 1, C(0xa4a8a8)); s.noise(0, 3, 4, 1, 0.08, 0.5, 0.5, 2); s.rect(0, 3, 4, 0.05, C(0x7a7e80))
            s.rect(4, 3, 2, 1, C(0x8c9092)); s.glass(4.08, 3.08, 1.84, 0.84, C(0x5a6e7c), blind=0); s.rect(4.98, 3.05, 0.05, 0.9, C(0x8c9092))
            s.rect(6, 3, 2, 1, C(0xaeb2b2)); s.vlines(6, 3, 2, 1, C(0x82868a), 0.5, 0.03); s.noise(6, 3, 2, 1, 0.06, 0.3, 0.3, 5)
            s.rect(3, 2, 3.5, 1, C(0x6f7376)); s.noise(3, 2, 3.5, 1, 0.1, 0.4, 0.4, 8)
        return self._props

    def bulkhead(self, x, y, z, w=2.8, h=2.7, d=3.4, lod=1):
        s = self.prop_sheet()
        self.box(x, y, z, x + w, y + h, z + d, s, (0, 0, 3, 3), (0.1, 3.1, 1.8, 0.8), lod=lod, side2=(0.0, 0, 0.9, 3))

    def plant(self, x, y, z, w=2.4, h=1.6, d=1.8, lod=0):
        s = self.prop_sheet()
        self.box(x, y, z, x + w, y + h, z + d, s, (3, 0, 2, 2), (0.1, 3.1, 1.8, 0.8), lod=lod)

    def skylight(self, x, y, z, w=1.8, d=1.2, h=0.35):
        s = self.prop_sheet()
        self.box(x, y, z, x + w, y + h, z + d, s, (0.1, 3.02, 1.5, 0.2), (4, 3, 2, 1))

    def vent(self, x, y, z, r=0.25, h=0.8):
        s = self.prop_sheet()
        self.cyl(x, z, r, y, y + h, 6, s, (6.05, 3.05, 1.4, 0.9), (0.2, 3.2, 0.5, 0.5))

    def duct(self, x, y, z, w, d, h=0.6):
        s = self.prop_sheet()
        self.box(x, y, z, x + w, y + h, z + d, s, (6, 3, 2, 1), (6, 3, 2, 1))

    def chimney(self, x, y, z, w=0.7, h=1.6, d=0.7):
        s = self.prop_sheet()
        self.box(x, y, z, x + w, y + h, z + d, s, (6.5, 0, 1.5, 2), (3.1, 2.1, 0.5, 0.5))

    def tank(self, x, y, z, r=1.5, h=3.0, legs=1.6, lod=1):
        """Wooden rooftop water tank on a steel stand with a conical cap."""
        s = self.prop_sheet(); ms = (3.1, 2.1, 0.3, 0.3)
        for dx in (-1, 1):
            for dz in (-1, 1):
                self.bar([x + dx * r * 0.65, y, z + dz * r * 0.65], [x + dx * r * 0.65, y + legs, z + dz * r * 0.65], 0.14, s, ms)
        self.box(x - r * 0.8, y + legs - 0.12, z - r * 0.8, x + r * 0.8, y + legs, z + r * 0.8, s, ms, ms, bottom=True)
        self.cyl(x, z, r, y + legs, y + legs + h, 10, s, (5, 0, 1.5, 2), lod=lod, cap=(3.1, 2.1, 0.5, 0.5), capb=True)
        self.cyl(x, z, r * 1.06, y + legs + h, y + legs + h + r * 0.55, 10, s, (3.1, 2.3, 3.0, 0.6), r1=0.0, lod=lod)

    def roof_clutter(self, x0, z0, x1, z1, y, n=None, bulk=True, seed=0, sky=True):
        """Scatter typical flat-roof kit over the deck rect."""
        rng = np.random.default_rng(seed + 31)
        w = x1 - x0; d = z1 - z0
        if bulk and w > 5 and d > 6:
            self.bulkhead(x0 + w * (0.15 + 0.5 * rng.random()), y, z0 + d * (0.1 + 0.3 * rng.random()), 2.6, 2.6, 3.2)
        n = n if n is not None else int(max(2, min(9, w * d / 60)))
        for i in range(n):
            px = x0 + 0.8 + rng.random() * max(0.1, w - 3.6); pz = z0 + 0.8 + rng.random() * max(0.1, d - 3.6)
            t = rng.random()
            if t < 0.3 and sky: self.skylight(px, y, pz, 1.4 + rng.random(), 1.0 + rng.random() * 0.6)
            elif t < 0.55: self.vent(px, y, pz, 0.18 + 0.12 * rng.random(), 0.5 + 0.6 * rng.random())
            elif t < 0.8: self.plant(px, y, pz, 1.4 + rng.random() * 1.2, 0.9 + rng.random() * 0.7, 1.2 + rng.random())
            else: self.duct(px, y, pz, 2.0 + 2 * rng.random(), 0.6, 0.5)

    # ---- finish
    def bbox(self, lod=0):
        pts = np.concatenate([f[0] for f in self.faces[lod]], axis=0)
        return pts.min(0), pts.max(0)

    def tris(self, lod=0):
        return int(sum(len(f[0]) - 2 for f in self.faces[lod]))

    def finish(self):
        """Centre on X/Z, base to y=0; fit LOD1's box to LOD0's."""
        mn, mx = self.bbox(0)
        off = np.array([(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2])
        for L in (0, 1):
            self.faces[L] = [(p - off, s, u) for (p, s, u) in self.faces[L]]
        mn, mx = self.bbox(0)
        if self.faces[1]:
            m1, x1 = self.bbox(1)
            sc = (mx - mn) / np.maximum(x1 - m1, 1e-6)
            self.lod_fit = float(np.max(np.abs(sc - 1)))
            self.faces[1] = [((p - m1) * sc + mn, s, u) for (p, s, u) in self.faces[1]]
        self.size = mx - mn
        return self.size

    def pack(self):
        used = set(id(f[1]) for L in (0, 1) for f in self.faces[L])
        sheets = [s for s in self.sheets if id(s) in used]
        self.used_sheets = sheets
        def try_ppm(ppm):
            items = []
            for s in sheets:
                p = min(ppm * s.prio, self.max_ppm * max(1.0, s.prio))
                wp = max(4, int(round(s.w * p))); hp = max(4, int(round(s.h * p)))
                if wp + 2 * PAD > ATLAS or hp + 2 * PAD > ATLAS: return None
                items.append((s, wp, hp))
            items.sort(key=lambda t: (-max(t[1], t[2]), -t[1] * t[2]))
            # MaxRects, best-short-side-fit
            free = [(0, 0, ATLAS, ATLAS)]; out = []
            for s, wp, hp in items:
                W = wp + 2 * PAD; Hh = hp + 2 * PAD
                bi = None; bs = None
                for (fx, fy, fw, fh) in free:
                    if W <= fw and Hh <= fh:
                        sc = (min(fw - W, fh - Hh), fy, fx)
                        if bs is None or sc < bs: bs = sc; bi = (fx, fy)
                if bi is None: return None
                x, y = bi
                out.append((s, x + PAD, y + PAD, wp, hp))
                nf = []
                for (fx, fy, fw, fh) in free:
                    if x >= fx + fw or x + W <= fx or y >= fy + fh or y + Hh <= fy:
                        nf.append((fx, fy, fw, fh)); continue
                    if x > fx: nf.append((fx, fy, x - fx, fh))
                    if x + W < fx + fw: nf.append((x + W, fy, fx + fw - x - W, fh))
                    if y > fy: nf.append((fx, fy, fw, y - fy))
                    if y + Hh < fy + fh: nf.append((fx, y + Hh, fw, fy + fh - y - Hh))
                free = [a for a in nf if not any(a is not b and a[0] >= b[0] and a[1] >= b[1] and a[0] + a[2] <= b[0] + b[2] and a[1] + a[3] <= b[1] + b[3] and (a != b or id(a) > id(b)) for b in nf)]
            return out
        lo, hi = 0.5, self.max_ppm; best = try_ppm(lo)
        if best is None: raise RuntimeError('atlas does not fit: ' + self.name)
        for _ in range(22):
            mid = (lo + hi) / 2; r = try_ppm(mid)
            if r is not None: lo = mid; best = r
            else: hi = mid
        r = try_ppm(self.max_ppm)
        if r is not None: best = r; lo = self.max_ppm
        self.ppm = lo
        for s, x, y, wp, hp in best: s.px = (x, y, wp, hp)

    def paint(self):
        atlas = np.zeros((ATLAS, ATLAS, 3), dtype=np.float32)
        filled = np.zeros((ATLAS, ATLAS), dtype=bool)
        for s in self.used_sheets:
            x, y, wp, hp = s.px
            s.c = np.full((hp * SS, wp * SS, 3), 0.5, dtype=np.float32)
            s.sx = wp * SS / s.w; s.sy = hp * SS / s.h
            ops = s.ops; s.ops = []
            for fn, a, k in ops: fn(s, *a, **k)
            img = s.c.reshape(hp, SS, wp, SS, 3).mean(axis=(1, 3))
            s.c = None
            img = np.pad(img, ((PAD, PAD), (PAD, PAD), (0, 0)), mode='edge')
            atlas[y - PAD:y + hp + PAD, x - PAD:x + wp + PAD] = img
            filled[y - PAD:y + hp + PAD, x - PAD:x + wp + PAD] = True
        mean = atlas[filled].mean(axis=0) if filled.any() else np.array([0.5, 0.5, 0.5])
        atlas[~filled] = mean
        # albedo range: no pure black / white
        atlas = np.clip(atlas, 0.0, 1.0)
        atlas = 0.085 + atlas * (0.90 - 0.085)
        self.atlas = atlas
        self.fill = float(filled.mean())
        return atlas

    def uv_of(self, sheet, u, v):
        x, y, wp, hp = sheet.px
        uu = min(max(u, 0.0), sheet.w); vv = min(max(v, 0.0), sheet.h)
        return ((x + uu * wp / sheet.w) / ATLAS, 1.0 - (y + (sheet.h - vv) * hp / sheet.h) / ATLAS)

    def mesh_data(self, lod=0):
        verts = []; faces = []; uvs = []
        for pts, s, uv in self.faces[lod]:
            # drop degenerate faces
            if len(pts) < 3: continue
            n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
            if len(pts) == 3 and np.dot(n, n) < 1e-12: continue
            i0 = len(verts)
            for p in pts: verts.append((float(p[0]), float(-p[2]), float(p[1])))   # glTF -> Blender
            faces.append(tuple(range(i0, i0 + len(pts))))
            for (u, v) in uv: uvs.append(self.uv_of(s, u, v))
        return verts, faces, uvs


# ------------------------------------------------------------------ Blender side
def export_kit(k, out_dir, scratch, jpeg_quality=92, mat_name=None, node_name=None):
    import bpy
    size = k.finish(); k.pack(); atlas = k.paint()
    os.makedirs(scratch, exist_ok=True)
    # reset scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    img = bpy.data.images.new(k.name + '_atlas', ATLAS, ATLAS, alpha=False)
    px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32); px[..., :3] = atlas[::-1]
    img.pixels.foreach_set(px.ravel())
    png = os.path.join(scratch, k.name + '_atlas.png')
    img.filepath_raw = png; img.file_format = 'PNG'; img.save()
    img = bpy.data.images.load(png); img.pack()
    mat = bpy.data.materials.new(mat_name or ('sf_kit_' + k.name[3:] if k.name.startswith('sf_') else k.name))
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.86; bsdf.inputs['Metallic'].default_value = 0.0
    stats = {'name': k.name, 'size': [round(float(v), 2) for v in size], 'ppm': round(k.ppm, 2), 'fill': round(k.fill, 3)}
    for lod in (0, 1):
        verts, faces, uvs = k.mesh_data(lod)
        me = bpy.data.meshes.new(node_name or k.name)
        me.from_pydata(verts, [], faces)
        uvl = me.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', np.asarray(uvs, dtype=np.float32).ravel())
        me.polygons.foreach_set('use_smooth', [False] * len(me.polygons))
        me.update()
        ob = bpy.data.objects.new(node_name or k.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if lod == 0: me.materials.append(mat)
        for o in bpy.context.scene.objects: o.select_set(False)
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        path = os.path.join(out_dir, k.name + ('_lod1' if lod else '') + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                                  export_cameras=False, export_lights=False, export_animations=False, export_tangents=False,
                                  export_normals=True, export_texcoords=True, export_vertex_color='NONE', export_extras=False,
                                  export_materials='EXPORT' if lod == 0 else 'NONE', export_image_format='JPEG',
                                  export_image_quality=jpeg_quality, export_jpeg_quality=jpeg_quality)
        stats['tris%d' % lod] = k.tris(lod)
        stats['kb%d' % lod] = round(os.path.getsize(path) / 1024, 1)
        bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    stats['lod_fit'] = round(getattr(k, 'lod_fit', 0.0), 4)
    with open(os.path.join(scratch, k.name + '.json'), 'w') as f: json.dump(stats, f)
    return stats
