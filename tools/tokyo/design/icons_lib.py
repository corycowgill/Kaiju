# icons_lib.py - shared helpers for the Tokyo landmark models (design-icons); adapted from tools/sf/design/icons_lib.py.
# Tokyo plays at dusk: every material carries an EMISSIVE map (Cv.em layer, palette emissive swatches).
# Run inside Blender 4.5:  blender -b -P icons_build_a.py -- [id ...]
# Geometry is built in glTF space (metres, Y up, front +Z, +X to the viewer's right when looking at the
# front), written as plain GLB by write_glb() (full control of primitive order / the material-free LOD1
# twin), and mirrored into a Blender mesh for the contact-sheet render (Cycles CPU).
# Materials per model (fixed primitive order fac, til, pal; empty ones dropped):
#   <id>_facade  : 256 px wide TRIM SHEET of horizontal bands (each tiles in u), metal 0, + normal map
#   <id>_tile    : optional fully tiling map (brick, seats, roof), metal 0
#   <id>_palette : 256 px atlas, 16 px colour swatches in the top half, painted decals in the bottom
#                  half (clock faces, rose windows ...), + ORM map (metal 1 / rough 1 factors)
import bpy, numpy as np, math, struct, zlib, json, os, sys, time
from mathutils import Vector

OUT = '/home/user/Kaiju/assets/buildings/tokyo'
SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/tk_icons'
SITES = '/home/user/Kaiju/tools/tokyo/data/landmark_sites.json'
os.makedirs(OUT, exist_ok=True); os.makedirs(SCR, exist_ok=True)


def rgbf(c):
    if isinstance(c, (tuple, list, np.ndarray)): return np.array(c[:3], np.float32)
    return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], np.float32) / 255.0


def mul(c, k):
    v = np.clip(rgbf(c) * k, 0, 1); return tuple(float(x) for x in v)


def mix(a, b, t):
    v = rgbf(a) * (1 - t) + rgbf(b) * t; return tuple(float(x) for x in v)


# ------------------------------------------------------------------ texture canvas
class Cv:
    """Paint canvas, normalised coords: x 0..1 left to right, y 0..1 bottom to top. 2x supersampled."""

    def __init__(s, w, h, col=0x808080, ss=2, seed=1):
        s.pw, s.ph, s.ss = w, h, ss
        s.w, s.h = w * ss, h * ss
        s.rgb = np.empty((s.h, s.w, 3), np.float32); s.rgb[:] = rgbf(col)
        s.hg = np.full((s.h, s.w), 0.5, np.float32)
        s.em = np.zeros((s.h, s.w, 3), np.float32); s.litp = 0.5
        yy, xx = np.mgrid[0:s.h, 0:s.w]
        s.X = (xx + 0.5) / s.w; s.Y = 1 - (yy + 0.5) / s.h
        s.rng = np.random.RandomState(seed)

    def m(s, mask, col=None, h=None, a=1.0, k=None, e=None):
        if col is not None:
            c = rgbf(col)
            if a >= 1: s.rgb[mask] = c; s.em[mask] = 0
            else: s.rgb[mask] = s.rgb[mask] * (1 - a) + c * a; s.em[mask] *= (1 - a)
        if e is not None: s.em[mask] = rgbf(e)
        if k is not None: s.rgb[mask] *= k
        if h is not None: s.hg[mask] = h
        return s

    def rmask(s, x0, y0, x1, y1): return (s.X >= x0) & (s.X < x1) & (s.Y >= y0) & (s.Y < y1)

    def rect(s, x0, y0, x1, y1, col=None, h=None, a=1.0, k=None, e=None): return s.m(s.rmask(x0, y0, x1, y1), col, h, a, k, e)

    def amask(s, x0, y0, x1, ys):
        """rect x0..x1, y0..ys with a semicircle (in pixels) on top springing at ys"""
        cx = (x0 + x1) / 2; r = (x1 - x0) / 2 * s.w
        d2 = ((s.X - cx) * s.w) ** 2 + ((s.Y - ys) * s.h) ** 2
        return s.rmask(x0, y0, x1, ys) | ((d2 < r * r) & (s.Y >= ys))

    def arch(s, x0, y0, x1, ys, col=None, h=None, a=1.0, k=None, e=None): return s.m(s.amask(x0, y0, x1, ys), col, h, a, k, e)

    def emask(s, cx, cy, rx, ry=None):
        """ellipse; ry None: a circle in pixels with radius rx * width"""
        if ry is None: return ((s.X - cx) * s.w) ** 2 + ((s.Y - cy) * s.h) ** 2 < (rx * s.w) ** 2
        return ((s.X - cx) / rx) ** 2 + ((s.Y - cy) / ry) ** 2 < 1

    def ell(s, cx, cy, rx, ry=None, col=None, h=None, a=1.0, k=None, e=None): return s.m(s.emask(cx, cy, rx, ry), col, h, a, k, e)

    def poly(s, pts, col=None, h=None, a=1.0, k=None, e=None):
        """convex polygon, CCW or CW"""
        m = np.ones(s.X.shape, bool); n = len(pts); sg = 0
        for i in range(n):
            x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % n]
            cr = (x1 - x0) * (s.Y - y0) * s.h / s.w - (y1 - y0) * (s.X - x0) * s.w / s.h
            if sg == 0:
                ar = sum(pts[j][0] * pts[(j + 1) % n][1] - pts[(j + 1) % n][0] * pts[j][1] for j in range(n)); sg = 1 if ar > 0 else -1
            m &= (cr * sg >= 0)
        return s.m(m, col, h, a, k, e)

    def line(s, x0, y0, x1, y1, wpx, col=None, h=None, a=1.0, k=None, e=None):
        ax, ay = (s.X - x0) * s.w, (s.Y - y0) * s.h; bx, by = (x1 - x0) * s.w, (y1 - y0) * s.h
        t = np.clip((ax * bx + ay * by) / max(bx * bx + by * by, 1e-9), 0, 1)
        d2 = (ax - t * bx) ** 2 + (ay - t * by) ** 2
        return s.m(d2 < (wpx * s.ss / 2) ** 2, col, h, a, k, e)

    def joints(s, rows, cols, k=0.8, wpx=1.0, stagger=True, reg=(0, 0, 1, 1), h=0.3):
        """ashlar / brick joints drawn over what is there, inside reg"""
        x0, y0, x1, y1 = reg; R = s.rmask(x0, y0, x1, y1)
        fy = (s.Y - y0) / (y1 - y0) * rows; r = np.floor(fy)
        wy = wpx * s.ss / (s.h * (y1 - y0) / rows); m = (fy - r) < wy
        if cols:
            fx = (s.X - x0) / (x1 - x0) * cols + (0.5 * (r % 2) if stagger else 0)
            wx = wpx * s.ss / (s.w * (x1 - x0) / cols); m |= (fx - np.floor(fx)) < wx
        return s.m(m & R, None, h, k=k)

    def brick(s, rows, cols, col, mortar, var=0.12, reg=(0, 0, 1, 1), wpx=1.0):
        x0, y0, x1, y1 = reg; R = s.rmask(x0, y0, x1, y1)
        fy = (s.Y - y0) / (y1 - y0) * rows; r = np.floor(fy).astype(int)
        fx = (s.X - x0) / (x1 - x0) * cols + 0.5 * (r % 2); c = np.floor(fx).astype(int)
        tab = 1 + var * (s.rng.rand(rows + 1, cols + 1) * 2 - 1)
        v = tab[np.clip(r, 0, rows), c % cols]
        s.rgb[R] = (rgbf(col)[None, :] * v[R][:, None]); s.hg[R] = 0.6
        wy = wpx * s.ss / (s.h * (y1 - y0) / rows); wx = wpx * s.ss / (s.w * (x1 - x0) / cols)
        m = (((fy - r) < wy) | ((fx - c) < wx)) & R
        return s.m(m, mortar, 0.35)

    def noise(s, amt=0.08, cells=8, reg=None):
        """tileable low-frequency value noise (multiplies)"""
        g = s.rng.rand(cells, cells).astype(np.float32)
        fx = s.X * cells; fy = s.Y * cells; ix = np.floor(fx).astype(int) % cells; iy = np.floor(fy).astype(int) % cells
        tx = fx - np.floor(fx); ty = fy - np.floor(fy); tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
        ix1 = (ix + 1) % cells; iy1 = (iy + 1) % cells
        n = (g[iy, ix] * (1 - tx) + g[iy, ix1] * tx) * (1 - ty) + (g[iy1, ix] * (1 - tx) + g[iy1, ix1] * tx) * ty
        k = (1 + amt * (n * 2 - 1))[:, :, None]
        if reg is None: s.rgb *= k
        else:
            R = s.rmask(*reg); s.rgb[R] = (s.rgb * k)[R]
        return s

    def grain(s, amt=0.03):
        s.rgb *= (1 + amt * (s.rng.rand(s.h, s.w, 1) * 2 - 1)); return s

    def vgrad(s, top=1.0, bot=0.85, reg=(0, 0, 1, 1)):
        R = s.rmask(*reg); t = (s.Y - reg[1]) / (reg[3] - reg[1])
        s.rgb[R] = (s.rgb * (bot + (top - bot) * t)[:, :, None])[R]; return s

    def window(s, x0, y0, x1, y1, glass=0x39434c, frame=0xb0aca0, arch=False, fw=0.012, mull=(1, 2), sill=True, surround=None, sw=0.02, lit=None):
        """a window: optional surround, frame, glass with mullions and a sky-reflection gradient"""
        A = (lambda a, b, c, d, **k: s.arch(a, b, c, d - (c - a) / 2 * s.w / s.h, **k)) if arch else s.rect
        ay = s.w / s.h
        if surround is not None: A(x0 - sw, y0 - sw * ay * 0.5, x1 + sw, y1 + sw * ay, col=surround, h=0.7)
        A(x0, y0, x1, y1, col=frame, h=0.45)
        A(x0 + fw, y0 + fw * ay, x1 - fw, y1 - fw * ay, col=glass, h=0.25)
        gm = (s.amask(x0 + fw, y0 + fw * ay, x1 - fw, y1 - fw * ay - (x1 - x0 - 2 * fw) / 2 * ay) if arch else s.rmask(x0 + fw, y0 + fw * ay, x1 - fw, y1 - fw * ay))
        t = np.clip((s.Y - y0) / max(y1 - y0, 1e-6), 0, 1)
        s.rgb[gm] = (s.rgb * (0.8 + 0.45 * t)[:, :, None])[gm]
        lp = s.litp if lit is None else lit
        if lp is True or (lp and s.rng.rand() < lp):   # lit at dusk: warm / white / cool, dimmer toward the sill
            lc = rgbf([0xffd29a, 0xffd29a, 0xffe6c0, 0xfff1dc, 0xd4e2ff][s.rng.randint(5)]) * (0.55 + 0.45 * s.rng.rand())
            s.em[gm] = (lc[None, None, :] * (0.7 + 0.3 * t)[:, :, None])[gm]
        nx, ny = mull
        for i in range(1, nx):
            xm = x0 + (x1 - x0) * i / nx; s.m(gm & (np.abs(s.X - xm) < fw * 0.35), frame, 0.45)
        for j in range(1, ny):
            ym = y0 + (y1 - y0) * j / ny; s.m(gm & (np.abs(s.Y - ym) < fw * 0.35 * ay), frame, 0.45)
        if sill: s.rect(x0 - sw, y0 - sw * ay * 0.7, x1 + sw, y0, col=None, h=0.75, k=1.08)
        return s

    def out(s):
        r = s.rgb.reshape(s.ph, s.ss, s.pw, s.ss, 3).mean(axis=(1, 3))
        h = s.hg.reshape(s.ph, s.ss, s.pw, s.ss).mean(axis=(1, 3))
        return np.clip(r, 0.09, 0.9), h

    def out_e(s): return np.clip(s.em.reshape(s.ph, s.ss, s.pw, s.ss, 3).mean(axis=(1, 3)), 0, 1)


def png_bytes(arr):
    """arr (h, w, 3|4) float 0..1 or uint8 -> PNG bytes"""
    a = arr if arr.dtype == np.uint8 else (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
    h, w, ch = a.shape
    raw = np.concatenate([np.zeros((h, 1), np.uint8), a.reshape(h, w * ch)], axis=1).tobytes()

    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2 if ch == 3 else 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def bl_image(name, arr, srgb=True, pack=True):
    h, w, _ = arr.shape
    old = bpy.data.images.get(name)
    if old: bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), np.float32); px[:, :, :3] = arr[::-1]
    img.pixels.foreach_set(px.ravel()); img.update()
    if pack: img.pack()
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    return img


def jpg_bytes(name, arr, q=88, srgb=True):
    img = bl_image('_j_' + name, arr, srgb, pack=True)
    p = os.path.join(SCR, '_tmp_' + name + '.jpg')
    sc = bpy.context.scene; st = sc.render.image_settings; old = (st.file_format, st.color_mode, sc.view_settings.view_transform)
    st.file_format = 'JPEG'; st.color_mode = 'RGB'; st.quality = q; sc.view_settings.view_transform = 'Standard' if srgb else 'Raw'
    img.save_render(p, scene=sc)
    st.file_format, st.color_mode, sc.view_settings.view_transform = old
    bpy.data.images.remove(img)
    with open(p, 'rb') as f: d = f.read()
    os.remove(p); assert d[:2] == b'\xff\xd8', 'not a JPEG'
    return d


class Tex:
    """palette + decals + trim-sheet bands + tile map, shared by the LOD0 and LOD1 passes of one model"""

    def __init__(s, name):
        s.name = name; s.pal = {}; s.dec = {}; s.decx = 0; s.decy = 128; s.decrow = 0
        s.bands = {}; s.bandy = 0; s.til = None
        s.palimg = np.full((256, 256, 3), 0.5, np.float32); s.ormimg = np.zeros((256, 256, 3), np.float32)
        s.ormimg[:, :, 0] = 1; s.ormimg[:, :, 1] = 0.85
        s.facrgb = []; s.fachg = []; s.facem = []; s.emimg = np.zeros((256, 256, 3), np.float32)

    def col(s, c, rough=0.85, metal=0.0, emit=None):
        key = (tuple(np.round(rgbf(c), 4)), rough, metal, None if emit is None else tuple(np.round(rgbf(emit), 3)))
        if key not in s.pal:
            k = len(s.pal); assert k < 128, 'palette full'
            s.pal[key] = k; x, y = (k % 16) * 16, (k // 16) * 16
            s.palimg[y:y + 16, x:x + 16] = np.clip(rgbf(c), 0.07, 0.92); s.ormimg[y:y + 16, x:x + 16] = (1, rough, metal)
            if emit is not None: s.emimg[y:y + 16, x:x + 16] = rgbf(emit)
        k = s.pal[key]
        return ('p', ((k % 16) + 0.5) / 16, ((k // 16) + 0.5) / 16)

    def decal(s, name, pw, ph, fn, rough=0.8, metal=0.0):
        if name not in s.dec:
            if s.decx + pw > 256: s.decx = 0; s.decy += s.decrow; s.decrow = 0
            assert s.decy + ph <= 256, 'decal space full'
            c = Cv(pw, ph); fn(c); r, _ = c.out()
            x, y = s.decx, s.decy
            s.palimg[y:y + ph, x:x + pw] = r; s.ormimg[y:y + ph, x:x + pw] = (1, rough, metal); s.emimg[y:y + ph, x:x + pw] = c.out_e()
            e = 0.75
            s.dec[name] = ('d', (x + e) / 256, (y + e) / 256, (x + pw - e) / 256, (y + ph - e) / 256)
            s.decx += pw; s.decrow = max(s.decrow, ph)
        return s.dec[name]

    def band(s, name, px, fn, bay=4.0, col=0x808080):
        if name not in s.bands:
            c = Cv(256, px, col, seed=len(s.bands) + 3); fn(c); r, h = c.out()
            s.bands[name] = (s.bandy, px, bay); s.bandy += px; s.facrgb.append(r); s.fachg.append(h); s.facem.append(c.out_e())
            assert s.bandy <= 512, 'trim sheet full'
        return ('f', name, s.bands[name][2], None)

    def tile(s, fn, pw, ph, sx, sy, col=0x808080):
        if s.til is None:
            c = Cv(pw, ph, col, seed=11); fn(c); r, h = c.out(); s.til = (r, h, sx, sy, c.out_e())
        return ('t', s.til[2], s.til[3])

    def fac_h(s):
        H = 64
        while H < s.bandy: H *= 2
        return H

    def fac_images(s):
        H = s.fac_h(); r = np.concatenate(s.facrgb, 0); h = np.concatenate(s.fachg, 0)
        if r.shape[0] < H:
            pad = H - r.shape[0]; r = np.concatenate([r, np.repeat(r[-1:], pad, 0)], 0); h = np.concatenate([h, np.repeat(h[-1:], pad, 0)], 0)
        return r, normal_from_height(h, 2.0, wrap_y=False)

    def fac_emis(s):
        H = s.fac_h(); e = np.concatenate(s.facem, 0)
        if e.shape[0] < H: e = np.concatenate([e, np.zeros((H - e.shape[0], 256, 3), np.float32)], 0)
        return e


def normal_from_height(h, k=2.0, wrap_y=True):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k
    if wrap_y: dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
    else:
        dy = np.zeros_like(h); dy[1:-1] = (h[2:] - h[:-2]) * k
    n = np.stack([-dx, dy, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def F(skin, bay=None, rep=None):
    """re-parametrise a band skin: metres per repeat, or an explicit repeat count"""
    return ('f', skin[1], bay if bay is not None else skin[2], rep)


# ------------------------------------------------------------------ geometry
def v3(p): return np.array(p, np.float64)


def ear_clip(poly):
    """poly: list of (x, z); returns triangles as index triples (any orientation in, same orientation out)"""
    n = len(poly); idx = list(range(n)); tris = []
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sg = 1 if area > 0 else -1

    def cross(a, b, c): return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1; m = len(idx); done = False
        for i in range(m):
            a, b, c = idx[(i - 1) % m], idx[i], idx[(i + 1) % m]
            if cross(poly[a], poly[b], poly[c]) * sg <= 1e-12: continue
            ok = True
            for j in idx:
                if j in (a, b, c): continue
                p = poly[j]
                if cross(poly[a], poly[b], p) * sg >= 0 and cross(poly[b], poly[c], p) * sg >= 0 and cross(poly[c], poly[a], p) * sg >= 0: ok = False; break
            if ok: tris.append((a, b, c)); idx.pop(i); done = True; break
        if not done: idx.pop(0)
    if len(idx) == 3: tris.append(tuple(idx))
    return tris


class B:
    def __init__(s, tex, lod=0):
        s.tex = tex; s.lod = lod; s.hi = lod == 0
        s.P = {'f': [], 't': [], 'p': []}  # lists of (pos(n,3), nrm(n,3), uv(n,2)) triangles expanded later
        s.ntri = 0

    # skins
    def c(s, col, rough=0.85, metal=0.0, emit=None): return s.tex.col(col, rough, metal, emit)
    def glow(s, col, k=1.0, base=None): return s.tex.col(base if base is not None else mul(col, 0.8), 0.6, 0.0, mul(col, k))
    def band(s, name, px, fn, bay=4.0, col=0x808080): return s.tex.band(name, px, fn, bay, col)
    def tile(s, fn, pw=256, ph=256, sx=4.0, sy=4.0, col=0x808080): return s.tex.tile(fn, pw, ph, sx, sy, col)
    def decal(s, name, pw, ph, fn, **k): return s.tex.decal(name, pw, ph, fn, **k)
    def d(s, a, b): return a if s.hi else b
    def sub(s): return B(s.tex, s.lod)

    def add(s, o, t=(0, 0, 0), ry=0.0, sc=(1, 1, 1), rx=0.0, rz=0.0):
        """merge sub-builder o: scale, rotate (rx then rz then ry, degrees), translate"""
        sc = np.array(sc, np.float64); flip = sc[0] * sc[1] * sc[2] < 0
        def rot(ax, deg):
            a = math.radians(deg); c_, s_ = math.cos(a), math.sin(a)
            if ax == 0: return np.array([[1, 0, 0], [0, c_, -s_], [0, s_, c_]])
            if ax == 1: return np.array([[c_, 0, s_], [0, 1, 0], [-s_, 0, c_]])
            return np.array([[c_, -s_, 0], [s_, c_, 0], [0, 0, 1]])
        R = rot(1, ry) @ rot(2, rz) @ rot(0, rx)
        for k in 'ftp':
            for (p, n, uv) in o.P[k]:
                p2 = (p * sc) @ R.T + np.array(t); n2 = (n / sc) @ R.T
                n2 /= np.maximum(np.linalg.norm(n2, axis=1, keepdims=True), 1e-9)
                if flip: p2, n2, uv = p2[::-1], n2[::-1], uv[::-1]
                s.P[k].append((p2, n2, uv))
        s.ntri += o.ntri

    # core
    def face(s, pts, skin, nrm=None, two=False, uv=None):
        """convex polygon, CCW seen from outside. skin: palette / decal / band / tile"""
        p = np.array(pts, np.float64); n = len(p)
        if nrm is None:
            fn = np.zeros(3)
            for i in range(n): fn += np.cross(p[i], p[(i + 1) % n])
            l = np.linalg.norm(fn)
            if l < 1e-12: return
            fn /= l; nr = np.repeat(fn[None], n, 0)
        else:
            nr = np.array(nrm, np.float64); fn = nr.mean(0); fn /= max(np.linalg.norm(fn), 1e-9)
        k = skin[0]
        if uv is not None: u = np.array(uv, np.float64)
        elif k == 'f' and n != 4: raise AssertionError('band skins need quads')
        elif k == 'p': u = np.repeat(np.array([[skin[1], skin[2]]]), n, 0)
        elif k == 'd':
            assert n == 4; u0, v0, u1, v1 = skin[1:5]; u = np.array([[u0, v1], [u1, v1], [u1, v0], [u0, v0]])
        elif k == 'f':
            assert n == 4, 'band skins need quads'
            y, h, bay = s.tex.bands[skin[1]]
            L = np.linalg.norm(p[1] - p[0]); rep = skin[3] if skin[3] else max(1, round(L / (skin[2] or bay)))
            e = 0.6; u = np.array([[0, y + h - e], [rep, y + h - e], [rep, y + e], [0, y + e]], np.float64)  # v in pixel rows, normalised at export
        else:
            sx, sy = skin[1], skin[2]
            if abs(fn[1]) > 0.99: u = np.stack([p[:, 0] / sx, p[:, 2] / sy], 1)
            else:
                t = np.cross([0, 1, 0], fn); t /= np.linalg.norm(t); bt = np.cross(fn, t)
                u = np.stack([p @ t / sx, -(p @ bt) / sy], 1)
        key = 'p' if k in 'pd' else k
        for i in range(1, n - 1):
            ii = [0, i, i + 1]
            s.P[key].append((p[ii], nr[ii], u[ii])); s.ntri += 1
            if two and key != 'p': s.P[key].append((p[ii[::-1]], -nr[ii[::-1]], u[ii[::-1]])); s.ntri += 1

    def wall(s, p0, p1, y0, y1, skin, two=False):
        """vertical quad seen with p0 on the left, p1 on the right; p = (x, z)"""
        s.face([(p0[0], y0, p0[1]), (p1[0], y0, p1[1]), (p1[0], y1, p1[1]), (p0[0], y1, p0[1])], skin, two=two)

    def _orient(s, poly):
        a = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
        return list(poly) if a < 0 else list(poly)[::-1]   # a < 0: walls (d x up) point outward

    def cap(s, poly, y, skin, up=True):
        poly = s._orient(poly)
        for (a, b, c) in ear_clip(poly):
            tri = [(poly[a][0], y, poly[a][1]), (poly[b][0], y, poly[b][1]), (poly[c][0], y, poly[c][1])]
            s.face(tri if up else tri[::-1], skin)

    def prism(s, poly, y0, y1, skin, top=None, bot=False, skins=None, notop=False):
        """extrude a plan polygon [(x, z)...]; skins: {edge index (of the given order): skin or None to skip}"""
        n = len(poly); ori = s._orient(poly); rev = ori != list(poly)
        for i in range(n):
            a, b = ori[i], ori[(i + 1) % n]
            oi = (n - 2 - i) % n if rev else i
            sk = skins.get(oi, skin) if skins else skin
            if sk is not None: s.wall(a, b, y0, y1, sk)
        tp = top if top is not None else (skin if skin[0] in 'pt' else None)
        if tp is not None and not notop: s.cap(poly, y1, tp)
        if bot: s.cap(poly, y0, tp or skin, up=False)

    def stack(s, poly, y0, levels, top=None, skins=None):
        """levels: [(height, skin)...] bottom to top; returns the top y"""
        y = y0
        for i, (h, sk) in enumerate(levels):
            s.prism(poly, y, y + h, sk, top=top if i == len(levels) - 1 else None, notop=i < len(levels) - 1, skins=skins); y += h
        return y

    @staticmethod
    def rect(x0, x1, z0, z1):
        """plan rectangle, edge order: front (+Z), right (+X), back, left"""
        return [(x0, z1), (x1, z1), (x1, z0), (x0, z0)]

    def box(s, x0, x1, y0, y1, z0, z1, skin, top=None, f=0, r=0, bk=0, l=0, bot=False, notop=False):
        sk = {i: v for i, v in enumerate((f, r, bk, l)) if v != 0}
        s.prism(s.rect(x0, x1, z0, z1), y0, y1, skin, top=top, skins=sk or None, bot=bot, notop=notop)

    def bx(s, cx, cz, w, d, y0, h, skin, top=None, **k): s.box(cx - w / 2, cx + w / 2, y0, y0 + h, cz - d / 2, cz + d / 2, skin, top, **k)

    def frust(s, r0, r1, y0, y1, skin, top=None):
        """between plan rects r0=(x0,x1,z0,z1) at y0 and r1 at y1 (mansards, hips, pyramids when r1 is a point)"""
        a = [(r0[0], y0, r0[3]), (r0[1], y0, r0[3]), (r0[1], y0, r0[2]), (r0[0], y0, r0[2])]
        b = [(r1[0], y1, r1[3]), (r1[1], y1, r1[3]), (r1[1], y1, r1[2]), (r1[0], y1, r1[2])]
        for i in range(4):
            j = (i + 1) % 4
            if np.allclose(b[i], b[j]): s.face([a[i], a[j], b[i]], skin)
            else: s.face([a[i], a[j], b[j], b[i]], skin)
        if top is not None and r1[0] != r1[1] and r1[2] != r1[3]: s.face(b, top)

    def gable(s, x0, x1, z0, z1, y0, h, skin, end=None, axis='x', ov=0.0):
        """gabled roof, ridge along axis; end: gable-end skin (None: open)"""
        end = end or skin
        if axis == 'x':
            zm = (z0 + z1) / 2; xa, xb = x0 - ov, x1 + ov
            s.face([(xa, y0, z1), (xb, y0, z1), (xb, y0 + h, zm), (xa, y0 + h, zm)], skin)
            s.face([(xb, y0, z0), (xa, y0, z0), (xa, y0 + h, zm), (xb, y0 + h, zm)], skin)
            s.face([(x1, y0, z1), (x1, y0, z0), (x1, y0 + h, zm)], end); s.face([(x0, y0, z0), (x0, y0, z1), (x0, y0 + h, zm)], end)
        else:
            xm = (x0 + x1) / 2; za, zb = z0 - ov, z1 + ov
            s.face([(x1, y0, zb), (x1, y0, za), (xm, y0 + h, za), (xm, y0 + h, zb)], skin)
            s.face([(x0, y0, za), (x0, y0, zb), (xm, y0 + h, zb), (xm, y0 + h, za)], skin)
            s.face([(x0, y0, z1), (x1, y0, z1), (xm, y0 + h, z1)], end); s.face([(x1, y0, z0), (x0, y0, z0), (xm, y0 + h, z0)], end)

    def lathe(s, cx, cz, prof, seg, skin, smooth=True, a0=0.0, a1=360.0, capt=None, capb=None, sq=1.0, ub=1.0):
        """revolve profile [(r, y)...] (bottom to top) about the vertical through (cx, cz); sq: z squash"""
        full = abs(a1 - a0) >= 359.9
        ang = [math.radians(a0 + (a1 - a0) * i / seg) for i in range(seg + 1)]
        def pt(r, y, a): return (cx + r * math.sin(a), y, cz + r * math.cos(a) * sq)
        cum = [0.0]
        for j in range(len(prof) - 1): cum.append(cum[-1] + math.hypot(prof[j + 1][0] - prof[j][0], prof[j + 1][1] - prof[j][1]))
        isf = skin[0] == 'f'
        if isf: by, bh, _ = s.tex.bands[skin[1]]; vv = [by + bh - 0.6 - (bh - 1.2) * c_ / max(cum[-1], 1e-9) for c_ in cum]
        for j in range(len(prof) - 1):
            (r0, y0), (r1, y1) = prof[j], prof[j + 1]
            dr, dy = r1 - r0, y1 - y0; L = math.hypot(dr, dy)
            if L < 1e-9: continue
            ny, nr_ = -dr / L, dy / L
            for i in range(seg):
                a, b = ang[i], ang[i + 1]
                na = (nr_ * math.sin(a), ny, nr_ * math.cos(a)); nb = (nr_ * math.sin(b), ny, nr_ * math.cos(b))
                if r1 < 1e-6: pts, ns = [pt(r0, y0, a), pt(r0, y0, b), pt(0, y1, a)], [na, nb, ((na[0] + nb[0]) / 2, ny, (na[2] + nb[2]) / 2)]
                elif r0 < 1e-6: pts, ns = [pt(0, y0, a), pt(r1, y1, b), pt(r1, y1, a)], [((na[0] + nb[0]) / 2, ny, (na[2] + nb[2]) / 2), nb, na]
                else: pts, ns = [pt(r0, y0, a), pt(r0, y0, b), pt(r1, y1, b), pt(r1, y1, a)], [na, nb, nb, na]
                uv = None
                if isf:
                    uv = [[i * ub, vv[j]], [(i + 1) * ub, vv[j]], [(i + 1) * ub, vv[j + 1]], [i * ub, vv[j + 1]]]
                    if r1 < 1e-6: uv = [uv[0], uv[1], [(i + 0.5) * ub, vv[j + 1]]]
                    elif r0 < 1e-6: uv = [[(i + 0.5) * ub, vv[j]], uv[2], uv[3]]
                s.face(pts, skin, nrm=ns if smooth else None, uv=uv)
        if capt is not None and prof[-1][0] > 1e-6: s.face([pt(prof[-1][0], prof[-1][1], a) for a in ang[:seg if full else seg + 1]], capt)
        if capb is not None and prof[0][0] > 1e-6: s.face([pt(prof[0][0], prof[0][1], a) for a in ang[:seg if full else seg + 1]][::-1], capb)

    def cyl(s, cx, cz, r, y0, y1, seg, skin, r1=None, cap=True, smooth=True):
        if not s.hi: seg = max(4, seg // 2)
        s.lathe(cx, cz, [(r, y0), (r if r1 is None else r1, y1)], seg, skin, smooth, capt=skin if cap else None)

    def tube(s, A, Bp, r, skin, seg=4, r1=None, caps=False, smooth=None, up=(0, 1, 0)):
        """prism / cylinder between two 3D points (seg 4: a square beam, sides aligned to `up`)"""
        A, Bp = v3(A), v3(Bp); d = Bp - A; L = np.linalg.norm(d)
        if L < 1e-9: return
        d /= L; u = v3(up)
        if abs(d @ u) > 0.98: u = v3((1, 0, 0))
        x = np.cross(u, d); x /= np.linalg.norm(x); y = np.cross(d, x)
        if smooth is None: smooth = seg > 6
        r1 = r if r1 is None else r1; off = math.pi / seg if seg == 4 else 0
        k = 1 / math.cos(math.pi / seg) if seg == 4 else 1
        ring = lambda c, rr: [c + (x * math.cos(off + 2 * math.pi * i / seg) + y * math.sin(off + 2 * math.pi * i / seg)) * rr * k for i in range(seg)]
        ra, rb = ring(A, r), ring(Bp, r1)
        for i in range(seg):
            j = (i + 1) % seg
            if smooth: ns = [(ra[i] - A), (ra[j] - A), (ra[j] - A), (ra[i] - A)]; ns = [n_ / max(np.linalg.norm(n_), 1e-9) for n_ in ns]
            else: ns = None
            if r1 < 1e-6: s.face([ra[i], ra[j], rb[i]], skin, nrm=ns[:3] if ns else None)
            else: s.face([ra[i], ra[j], rb[j], rb[i]], skin, nrm=ns)
        if caps:
            s.face(ra[::-1], skin)
            if r1 > 1e-6: s.face(rb, skin)

    def beam(s, A, Bp, w, h, skin, caps=False, up=(0, 1, 0)):
        """rectangular beam w (horizontal) x h between two points"""
        A, Bp = v3(A), v3(Bp); d = Bp - A; L = np.linalg.norm(d)
        if L < 1e-9: return
        d /= L; u = v3(up)
        if abs(d @ u) > 0.98: u = v3((1, 0, 0))
        x = np.cross(u, d); x /= np.linalg.norm(x); y = np.cross(d, x)
        ring = lambda c: [c - x * w / 2 - y * h / 2, c + x * w / 2 - y * h / 2, c + x * w / 2 + y * h / 2, c - x * w / 2 + y * h / 2]
        ra, rb = ring(A), ring(Bp)
        for i in range(4): s.face([ra[i], ra[(i + 1) % 4], rb[(i + 1) % 4], rb[i]], skin)
        if caps: s.face(ra[::-1], skin); s.face(rb, skin)

    def loft(s, rings, skin, closed=True, smooth=False, capa=None, capb=None, skins=None, under=None):
        """quads between consecutive rings of equal point count (rings CCW seen from the far end = from ring[-1] side)"""
        n = len(rings[0])
        for j in range(len(rings) - 1):
            a, b = rings[j], rings[j + 1]
            for i in range(n if closed else n - 1):
                k = (i + 1) % n; sk = skins[i] if skins else skin
                if sk is None: continue
                s.face([a[i], a[k], b[k], b[i]], sk)
                if under is not None:
                    dn = lambda p: (p[0], p[1] - 0.03, p[2])
                    s.face([dn(b[k]), dn(a[k]), dn(a[i])], under); s.face([dn(b[i]), dn(b[k]), dn(a[i])], under)
        if capa is not None: s.face(list(rings[0])[::-1], capa)
        if capb is not None: s.face(list(rings[-1]), capb)

    def sweep(s, path, prof, skins, closed=False, ends=None):
        """sweep a profile [(out, y)...] along a plan path [(x, z)...]; 'out' is to the RIGHT of travel.
        skins: one per profile segment (or a single skin). Faces look outward/up when the profile runs
        bottom-outer -> top -> inner (clockwise seen with travel into the page)."""
        m = len(path); P = [np.array(p, np.float64) for p in path]; rings = []
        for i in range(m):
            a = P[i - 1] if (i > 0 or closed) else P[i]; c = P[(i + 1) % m] if (i < m - 1 or closed) else P[i]
            d0 = P[i] - a; d1 = c - P[i]
            def nrm_(d):
                l = np.linalg.norm(d); return np.array([-d[1], d[0]]) / l if l > 1e-9 else None
            n0, n1 = nrm_(d0), nrm_(d1)
            if n0 is None: nn = n1
            elif n1 is None: nn = n0
            else:
                nn = n0 + n1; nn /= np.linalg.norm(nn); nn /= max(nn @ n0, 0.3)
            rings.append([(P[i][0] + nn[0] * o, y, P[i][1] + nn[1] * o) for (o, y) in prof])
        if closed: rings.append(rings[0])
        if not isinstance(skins, list): skins = [skins] * (len(prof) - 1)
        for j in range(len(rings) - 1):
            a, b_ = rings[j], rings[j + 1]
            for i in range(len(prof) - 1):
                if skins[i] is not None: s.face([a[i], b_[i], b_[i + 1], a[i + 1]], skins[i])
        if ends is not None and not closed:
            tr = ear_clip(prof); ar = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1] for i in range(len(prof)))
            for (i, j, k) in tr:
                t0 = [rings[0][i], rings[0][j], rings[0][k]]; t1 = [rings[-1][i], rings[-1][j], rings[-1][k]]
                s.face(t0, ends, two=True); s.face(t1, ends, two=True)

    def arcade(s, p0, p1, y0, ys, yt, n, skin, depth=1.0, back=None, pier=0.3, aseg=6, reveal=None, flat=False, sill=None):
        """wall p0->p1 (seen p0 left) from y0 to yt with n arched openings springing at ys, modelled reveal"""
        p0, p1 = np.array(p0, np.float64), np.array(p1, np.float64); L = np.linalg.norm(p1 - p0); d = (p1 - p0) / L
        out = np.array([-d[1], d[0]])
        back = back or skin; reveal = reveal or skin; y0w = y0 if sill is None else sill
        bw = L / n; ow = bw * (1 - pier); r = ow / 2
        if ys + r > yt - 0.05: r = max(0.05, yt - 0.05 - ys)
        if not s.hi: aseg = 2
        def P(t, y, dep=0.0):
            q = p0 + d * t - out * dep; return (q[0], y, q[1])
        for i in range(n):
            a = i * bw; xl = a + (bw - ow) / 2; xr = xl + ow; cx = a + bw / 2
            s.face([P(a, y0), P(xl, y0), P(xl, yt), P(a, yt)], skin)
            s.face([P(xr, y0), P(a + bw, y0), P(a + bw, yt), P(xr, yt)], skin)
            arc = [(cx - ow / 2 * math.cos(math.pi * k / aseg), ys + r * math.sin(math.pi * k / aseg)) for k in range(aseg + 1)]
            if flat: arc = [(xl, ys + r), (xr, ys + r)]
            for k in range(len(arc) - 1):
                (xa, ya), (xb, yb) = arc[k], arc[k + 1]
                s.face([P(xa, ya), P(xb, yb), P(xb, yt), P(xa, yt)], skin)
            if s.hi and depth > 0:
                s.face([P(xl, y0), P(xl, y0, depth), P(xl, arc[0][1], depth), P(xl, arc[0][1])], reveal)
                s.face([P(xr, y0, depth), P(xr, y0), P(xr, arc[-1][1]), P(xr, arc[-1][1], depth)], reveal)
                for k in range(len(arc) - 1):
                    (xa, ya), (xb, yb) = arc[k], arc[k + 1]
                    s.face([P(xa, ya), P(xa, ya, depth), P(xb, yb, depth), P(xb, yb)], reveal)
            bk = back(i) if callable(back) else back
            if bk[0] == 'd' or bk[0] == 'f' or callable(back): s.face([P(xl, y0, depth), P(xr, y0, depth), P(xr, ys + r, depth), P(xl, ys + r, depth)], bk)
        if not callable(back) and back[0] in 'pt': s.face([P(0, y0, depth), P(L, y0, depth), P(L, ys + r, depth), P(0, ys + r, depth)], back)

    def colonnade(s, p0, p1, y0, h, n, r, skin, seg=8, base=True, taper=0.85, ends=True):
        """n columns evenly spaced on the line p0->p1 (plan points)"""
        for i in range(n):
            t = (i + (0.5 if not ends else 0)) / (n if not ends else max(1, n - 1))
            x = p0[0] + (p1[0] - p0[0]) * t; z = p0[1] + (p1[1] - p0[1]) * t
            if s.hi and base:
                s.bx(x, z, r * 2.5, r * 2.5, y0, r * 0.6, skin); s.bx(x, z, r * 2.5, r * 2.5, y0 + h - r * 0.6, r * 0.6, skin)
                s.lathe(x, z, [(r, y0 + r * 0.6), (r * taper, y0 + h - r * 0.6)], seg, skin)
            else: s.lathe(x, z, [(r, y0), (r * taper, y0 + h)], s.d(seg, 4), skin)

    # export data
    def arrays(s):
        out = {}
        for k in 'ftp':
            if not s.P[k]: continue
            p = np.concatenate([t[0] for t in s.P[k]]).astype(np.float32); n = np.concatenate([t[1] for t in s.P[k]]).astype(np.float32)
            u = np.concatenate([t[2] for t in s.P[k]]).astype(np.float32)
            out[k] = [p, n, u]
        return out


def finalize(arr, fit=None, center=True, ground=True, ref=None):
    """recentre on X/Z, base at y 0, optional non-uniform fit to [w, h, d]; ref: reuse the LOD0 transform"""
    allp = np.concatenate([a[0] for a in arr.values()])
    if ref is None:
        mn, mx = allp.min(0), allp.max(0); off = np.zeros(3)
        if center: off[0] = -(mn[0] + mx[0]) / 2; off[2] = -(mn[2] + mx[2]) / 2
        if ground: off[1] = -mn[1]
        sc = np.ones(3)
        if fit is not None:
            for i in range(3):
                if fit[i]: sc[i] = fit[i] / max(mx[i] - mn[i], 1e-6)
        ref = (off, sc)
    off, sc = ref
    for a in arr.values():
        a[0] = ((a[0] + off) * sc).astype(np.float32)
        n = a[1] / sc; a[1] = (n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)).astype(np.float32)
    return ref


def weld(p, n, u):
    key = np.round(np.concatenate([p, n, u], 1), 4)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return p[idx], n[idx], u[idx], inv.astype(np.uint32)


def write_glb(path, name, arr, tex, with_mats=True):
    bins = []; views = []; accs = []; off = [0]

    def add_view(data, target=None):
        pad = (4 - len(data) % 4) % 4; v = {'buffer': 0, 'byteOffset': off[0], 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v); bins.append(data + b'\0' * pad); off[0] += len(data) + pad; return len(views) - 1

    def add_acc(a, typ, ct, target, mm=False):
        d = {'bufferView': add_view(a.tobytes(), target), 'componentType': ct, 'count': len(a), 'type': typ}
        if mm: d['min'] = [float(x) for x in a.min(0)]; d['max'] = [float(x) for x in a.max(0)]
        accs.append(d); return len(accs) - 1
    prims = []; mats = []; texs = []; imgs = []; order = [k for k in 'ftp' if k in arr]; ntri = 0

    def add_img(nm, data, mime):
        imgs.append({'name': nm, 'mimeType': mime, 'bufferView': add_view(data)}); texs.append({'sampler': 0, 'source': len(imgs) - 1, 'name': nm}); return len(texs) - 1
    H = tex.fac_h()
    for k in order:
        p, n, u = arr[k]
        if k == 'f': u = u.copy(); u[:, 1] /= H
        p, n, u, idx = weld(p, n, u); ntri += len(idx) // 3
        it = idx.astype(np.uint16) if len(p) < 65535 else idx
        pr = {'attributes': {'POSITION': add_acc(p, 'VEC3', 5126, 34962, True), 'NORMAL': add_acc(n, 'VEC3', 5126, 34962), 'TEXCOORD_0': add_acc(u, 'VEC2', 5126, 34962)},
              'indices': add_acc(it, 'SCALAR', 5123 if it.dtype == np.uint16 else 5125, 34963), 'mode': 4}
        if with_mats:
            if k == 'p':
                bt = add_img(name + '_pal', png_bytes(tex.palimg), 'image/png'); ot = add_img(name + '_orm', png_bytes(tex.ormimg), 'image/png'); et = add_img(name + '_emis', png_bytes(tex.emimg), 'image/png')
                mats.append({'name': name + '_palette', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': bt}, 'metallicRoughnessTexture': {'index': ot}, 'metallicFactor': 1.0, 'roughnessFactor': 1.0}, 'emissiveTexture': {'index': et}, 'emissiveFactor': [1.0, 1.0, 1.0]})
            elif k == 'f':
                r, nm = tex.fac_images()
                bt = add_img(name + '_facade_base', jpg_bytes(name + '_facade_base', r, 90), 'image/jpeg'); nt = add_img(name + '_facade_normal', jpg_bytes(name + '_facade_normal', nm, 82, False), 'image/jpeg'); et = add_img(name + '_facade_emis', jpg_bytes(name + '_facade_emis', tex.fac_emis(), 80), 'image/jpeg')
                mats.append({'name': name + '_facade', 'pbrMetallicRoughness': {'baseColorTexture': {'index': bt}, 'metallicFactor': 0.0, 'roughnessFactor': 0.85}, 'normalTexture': {'index': nt}, 'emissiveTexture': {'index': et}, 'emissiveFactor': [1.0, 1.0, 1.0]})
            else:
                r, h = tex.til[0], tex.til[1]
                bt = add_img(name + '_tile_base', jpg_bytes(name + '_tile_base', r, 90), 'image/jpeg'); nt = add_img(name + '_tile_normal', jpg_bytes(name + '_tile_normal', normal_from_height(h), 82, False), 'image/jpeg'); et = add_img(name + '_tile_emis', jpg_bytes(name + '_tile_emis', tex.til[4], 80), 'image/jpeg')
                mats.append({'name': name + '_tile', 'pbrMetallicRoughness': {'baseColorTexture': {'index': bt}, 'metallicFactor': 0.0, 'roughnessFactor': 0.85}, 'normalTexture': {'index': nt}, 'emissiveTexture': {'index': et}, 'emissiveFactor': [1.0, 1.0, 1.0]})
            pr['material'] = len(mats) - 1
        prims.append(pr)
    g = {'asset': {'version': '2.0', 'generator': 'kaiju tokyo icons_lib (Blender ' + bpy.app.version_string + ')'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
         'nodes': [{'name': name, 'mesh': 0}], 'meshes': [{'name': name, 'primitives': prims}], 'accessors': accs, 'bufferViews': views}
    if with_mats:
        g['materials'] = mats; g['textures'] = texs; g['images'] = imgs; g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    blob = b''.join(bins); g['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob))); f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)
    return ntri


# ------------------------------------------------------------------ Blender scene + contact sheet
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 10
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.threads_mode = 'AUTO'; sc.view_settings.view_transform = 'Standard'
    return sc


def bl_material(nm, base, orm=None, normal=None, emis=None):
    m = bpy.data.materials.new(nm); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = base; nt.links.new(ti.outputs['Color'], bs.inputs['Base Color'])
    if orm is not None:
        to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm; sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Green'], bs.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
        ti.interpolation = 'Closest'; to.interpolation = 'Closest'
    else: bs.inputs['Roughness'].default_value = 0.85
    if normal is not None:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal; nm_ = nt.nodes.new('ShaderNodeNormalMap'); nm_.inputs['Strength'].default_value = 0.6
        nt.links.new(tn.outputs['Color'], nm_.inputs['Color']); nt.links.new(nm_.outputs['Normal'], bs.inputs['Normal'])
    if emis is not None:
        te = nt.nodes.new('ShaderNodeTexImage'); te.image = emis; nt.links.new(te.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.0
        if orm is not None: te.interpolation = 'Closest'
    # back faces magenta (single-sided check) for the facade / tile materials
    if orm is None:
        geo = nt.nodes.new('ShaderNodeNewGeometry'); mx = nt.nodes.new('ShaderNodeMixShader'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1, 0, 1, 1)
        out = nt.nodes['Material Output']; nt.links.new(geo.outputs['Backfacing'], mx.inputs['Fac']); nt.links.new(bs.outputs['BSDF'], mx.inputs[1]); nt.links.new(em.outputs['Emission'], mx.inputs[2]); nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    return m


def bl_object(name, arr, tex):
    order = [k for k in 'ftp' if k in arr]; H = tex.fac_h()
    P = np.concatenate([arr[k][0] for k in order]); N = np.concatenate([arr[k][1] for k in order]); U = np.concatenate([arr[k][2] / (np.array([1, H]) if k == 'f' else 1) for k in order])
    nt = len(P) // 3; me = bpy.data.meshes.new(name)
    me.vertices.add(len(P)); me.loops.add(len(P)); me.polygons.add(nt)
    co = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
    me.vertices.foreach_set('co', co.ravel()); me.loops.foreach_set('vertex_index', np.arange(len(P), dtype=np.int32))
    me.polygons.foreach_set('loop_start', np.arange(0, len(P), 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(nt, 3, np.int32))
    mi = np.concatenate([np.full(len(arr[k][0]) // 3, i, np.int32) for i, k in enumerate(order)]); me.polygons.foreach_set('material_index', mi)
    uv = me.uv_layers.new(name='UVMap'); uvb = np.stack([U[:, 0], 1 - U[:, 1]], 1); uv.data.foreach_set('uv', uvb.ravel().astype(np.float32))
    me.update(); me.validate()
    nb = np.stack([N[:, 0], -N[:, 2], N[:, 1]], 1); me.normals_split_custom_set(nb.tolist())
    for k in order:
        if k == 'p': m = bl_material(name + '_palette', bl_image(name + '_pal', tex.palimg), bl_image(name + '_orm', tex.ormimg, False), None, bl_image(name + '_em', tex.emimg))
        elif k == 'f':
            r, nm = tex.fac_images(); m = bl_material(name + '_facade', bl_image(name + '_fb', r), None, bl_image(name + '_fn', nm, False), bl_image(name + '_fe', tex.fac_emis()))
        else: m = bl_material(name + '_tile', bl_image(name + '_tb', tex.til[0]), None, bl_image(name + '_tn', normal_from_height(tex.til[1]), False), bl_image(name + '_te', tex.til[4]))
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob


def render_sheet(name, arr, tex, water=False, close=None, tier='B', views=None, suffix='', dusk=None):
    sc = bpy.context.scene
    allp = np.concatenate([a[0] for a in arr.values()]); mn, mx = allp.min(0), allp.max(0)
    w, h, d = mx - mn; R = 0.5 * math.sqrt(w * w + h * h + d * d); ctr = np.array([0, h * 0.45, 0])
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.74, 0.92, 1); world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.color = (1.0, 0.93, 0.82); sun.angle = 0.03
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    # late afternoon: sun 32 deg up, from the front-left (glTF -X, +Z)
    sd = Vector((-0.75, -0.75, 0.62)).normalized(); so.rotation_euler = (-sd).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=max(4000, R * 40), location=(0, 0, -0.03)); gp = bpy.context.object
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.20, 0.30, 0.38, 1) if water else (0.32, 0.33, 0.32, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9; gp.data.materials.append(gm)
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    cam.clip_start = 0.3; cam.clip_end = 20000
    sc.render.resolution_x = 640; sc.render.resolution_y = 440; sc.render.image_settings.file_format = 'PNG'

    def shot(pos, tgt, lens, fn):
        cam.lens = lens; p = Vector((pos[0], -pos[2], pos[1])); t = Vector((tgt[0], -tgt[2], tgt[1]))
        co.location = p; co.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler(); sc.render.filepath = fn
        bpy.ops.render.render(write_still=True)
    fns = []
    if views is None:
        # aerial 3/4 from the front-right
        dv = np.array([0.62, 0.55, 0.78]); dv /= np.linalg.norm(dv)
        views = [(ctr + dv * R * (3.1 if max(w, d) < 3.5 * min(w, d) + 2 * h else 2.1), ctr, 35)]
        # street level 3/4 from the front-left
        eye = max(1.7, min(6.0, h * 0.06))
        dist = min(max(w, d, h) * 0.95 + 8, h * 4.5 + 45)
        views.append((np.array([-dist * 0.55, eye, d / 2 + dist * 0.75]), np.array([0, h * 0.42, 0]), 24))
        if tier == 'A' or close:
            if close: views.append(close)
            else: views.append((np.array([w * 0.18, h * 0.5, d / 2 + max(w, h) * 0.45]), np.array([0, h * 0.55, 0]), 30))
    for i, (pos, tgt, lens) in enumerate(views):
        fn = os.path.join(SCR, '_%s_v%d.png' % (name, i)); shot(pos, tgt, lens, fn); fns.append(fn)
    # dusk shot (emissive check): dim blue sky, low sun, emission x4
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.10, 0.14, 0.30, 1); world.node_tree.nodes['Background'].inputs[1].default_value = 0.35; sun.energy = 0.12
    for m_ in bpy.data.materials:
        if m_.name != 'ground' and m_.use_nodes and 'Principled BSDF' in m_.node_tree.nodes: m_.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 5.0
    pos, tgt, lens = views[dusk if dusk is not None else (2 if len(views) > 2 else 1)]
    fn = os.path.join(SCR, '_%s_vd.png' % name); shot(pos, tgt, lens, fn); fns.append(fn)
    ims = []
    for fn in fns:
        im = bpy.data.images.load(fn); a = np.array(im.pixels[:], np.float32).reshape(im.size[1], im.size[0], 4)[::-1, :, :3]; ims.append(a); bpy.data.images.remove(im); os.remove(fn)
    sheet = np.concatenate(ims, 1); out = os.path.join(SCR, name + suffix + '_sheet.png')
    with open(out, 'wb') as f: f.write(png_bytes(sheet))
    return out


MODELS = {}


def model(id, tier='B', fit=None, face='south', stone=0x9a968e, desc='', water=False, waterline=False, ids=None, extra='', close=None, ground=True, sites=None, views=None, dusk=None, center=True):
    def deco(fn):
        MODELS[id] = dict(id=id, fn=fn, tier=tier, fit=fit, face=face, stone=stone, desc=desc, water=water, waterline=waterline, ids=ids, extra=extra, close=close, ground=ground, sites=sites, views=views, dusk=dusk, center=center); return fn
    return deco


def site_dims(id):
    try:
        with open(SITES) as f: j = json.load(f)
        items = j.get('sites', j) if isinstance(j, dict) else j
        if isinstance(items, dict): e = items.get(id)
        else: e = next((x for x in items if x.get('id') == id), None)
        return e
    except Exception: return None


def build_one(M, render=True):
    t0 = time.time(); sc = reset_scene(); tex = Tex(M['id'])
    b0 = B(tex, 0); M['fn'](b0); a0 = b0.arrays()
    b1 = B(tex, 1); M['fn'](b1); a1 = b1.arrays()
    assert list(a0.keys()) == list(a1.keys()), 'LOD1 primitive set differs: %s vs %s' % (list(a0.keys()), list(a1.keys()))
    ref = finalize(a0, M['fit'], center=M['center'], ground=M['ground']); finalize(a1, ref=ref)
    # the LOD1 box must match: clamp tiny differences by reporting
    p0 = np.concatenate([a[0] for a in a0.values()]); p1 = np.concatenate([a[0] for a in a1.values()])
    bb0 = (p0.min(0), p0.max(0)); bb1 = (p1.min(0), p1.max(0))
    f0 = os.path.join(OUT, M['id'] + '.glb'); f1 = os.path.join(OUT, M['id'] + '_lod1.glb')
    n0 = write_glb(f0, M['id'], a0, tex, True); n1 = write_glb(f1, M['id'], a1, tex, False)
    size = bb0[1] - bb0[0]; dev = float(np.abs(np.concatenate([bb1[0] - bb0[0], bb1[1] - bb0[1]])).max() / max(size.max(), 1e-6))
    st = dict(id=M['id'], tier=M['tier'], bbox=[round(float(x), 2) for x in size], min=[round(float(x), 2) for x in bb0[0]], tris0=n0, tris1=n1, kb0=round(os.path.getsize(f0) / 1024, 1), kb1=round(os.path.getsize(f1) / 1024, 1),
              lodbox=round(dev, 4), face=M['face'], stone=M['stone'], desc=M['desc'], water=M['water'], waterline=M['waterline'], ids=M['ids'], extra=M['extra'], pal=len(tex.pal), fac=[256, tex.fac_h()] if tex.bands else None, til=list(tex.til[0].shape[:2]) if tex.til else None)
    with open(os.path.join(SCR, 'stats_' + M['id'] + '.json'), 'w') as f: json.dump(st, f)
    sheet = ''
    if os.environ.get('VIEW'):
        v = [float(x) for x in os.environ['VIEW'].split(',')]; M['views'] = [(np.array(v[0:3]), np.array(v[3:6]), v[6])]; M['dusk'] = 0
    if render:
        bl_object(M['id'], a0, tex); sheet = render_sheet(M['id'], a0, tex, water=M['water'] or M['waterline'], close=M['close'], tier=M['tier'], views=M['views'], dusk=M['dusk'])
    print('BUILT %-28s %s  [%.1f x %.1f x %.1f]  tris %d / %d (%.0f%%)  %.0f KB  lodbox %.3f  pal %d  %.1fs' % (M['id'], M['tier'], size[0], size[1], size[2], n0, n1, 100.0 * n1 / max(n0, 1), st['kb0'], dev, len(tex.pal), time.time() - t0))
    return st


def run():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    norender = '--norender' in argv; ids = [a for a in argv if not a.startswith('--')]
    for id, M in MODELS.items():
        if ids and id not in ids: continue
        try: build_one(M, not norender)
        except Exception as e:
            import traceback; traceback.print_exc(); print('FAILED', id, e)


# ------------------------------------------------------------------ shared painters (return fn(c))
def p_ashlar(col, rows=6, cols=3, var=0.07, k=0.82):
    def fn(c): c.rect(0, 0, 1, 1, col); c.noise(var, 6); c.joints(rows, cols, k); c.grain(0.02)
    return fn


def p_rust(col, rows=5, k=0.68):
    """rusticated base: deep horizontal joints"""
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.07, 6); c.joints(rows, 2, k, 2.0); c.vgrad(1.0, 0.86); c.grain(0.02)
    return fn


def p_win(wall, glass=0x39434c, frame=0xb8b4a8, n=1, x=(0.22, 0.78), y=(0.18, 0.84), arch=False, rows=0, cols=2, surround=None, mull=(2, 3), base=None, corn=None, pil=None, brick=None):
    """wall bay with n windows; rows: ashlar courses; base / corn: (height frac, colour) bands; pil: pilaster colour at the bay edges"""
    def fn(c):
        if brick: c.brick(brick[0], brick[1], wall, brick[2], 0.1)
        else:
            c.rect(0, 0, 1, 1, wall); c.noise(0.06, 6)
            if rows: c.joints(rows, cols, 0.84)
        if pil is not None:
            c.rect(0, 0, 0.07, 1, pil, 0.75); c.rect(0.93, 0, 1, 1, pil, 0.75); c.rect(0.07, 0, 0.085, 1, k=0.8); c.rect(0.915, 0, 0.93, 1, k=1.1)
        for i in range(n):
            a = x[0] + (x[1] - x[0]) * i / n; b_ = x[0] + (x[1] - x[0]) * (i + 1) / n; g = (b_ - a) * (0.12 if n > 1 else 0)
            c.window(a + g, y[0], b_ - g, y[1], glass, frame, arch, mull=mull, surround=surround)
        if base: c.rect(0, 0, 1, base[0], base[1], 0.7); c.rect(0, base[0] - 0.02, 1, base[0], k=0.8)
        if corn: c.rect(0, 1 - corn[0], 1, 1, corn[1], 0.8); c.rect(0, 1 - corn[0], 1, 1 - corn[0] + 0.025, k=0.75)
        c.grain(0.02)
    return fn


def p_brick(col, rows=16, cols=8, mortar=0x9a8e80, var=0.12):
    def fn(c): c.brick(rows, cols, col, mortar, var); c.noise(0.06, 5); c.grain(0.02)
    return fn


def p_tiles(col, ribs=8, laps=4, k=0.72):
    """roof tiles / standing seams: ribs run up the band"""
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.08, 6)
        for i in range(ribs):
            x = (i + 0.5) / ribs; c.rect(x - 0.18 / ribs, 0, x + 0.18 / ribs, 1, None, 0.8, k=1.12); c.rect(x + 0.18 / ribs, 0, x + 0.3 / ribs, 1, None, 0.3, k=k)
        if laps: c.joints(laps, 0, 0.82, 1.5)
    return fn


def p_glass(col=0x4a6274, nx=4, ny=2, frame=0x8a8c8c, fw=1.2, sky=0.25):
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.vgrad(1 + sky, 1 - sky * 0.5); c.noise(0.1, 4)
        for i in range(nx): c.rect(i / nx, 0, i / nx + fw / 256, 1, frame, 0.7)
        for j in range(ny): c.rect(0, j / ny, 1, j / ny + fw / c.ph, frame, 0.7)
    return fn


def p_board(col, n=12, k=0.8):
    """board and batten siding"""
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.08, 6)
        for i in range(n): c.rect(i / n, 0, i / n + 0.012, 1, None, 0.75, k=1.1); c.rect(i / n + 0.012, 0, i / n + 0.02, 1, None, 0.3, k=k)
        c.grain(0.03)
    return fn


def p_clock(face=0xd8d2c0, hand=0x2a2a2c, ring=0x6a6458, bg=0xa8a294):
    def fn(c):
        c.rect(0, 0, 1, 1, bg); c.ell(0.5, 0.5, 0.47, None, ring); c.ell(0.5, 0.5, 0.42, None, face)
        for i in range(12):
            a = math.pi * 2 * i / 12; c.line(0.5 + 0.33 * math.sin(a), 0.5 + 0.33 * math.cos(a), 0.5 + 0.39 * math.sin(a), 0.5 + 0.39 * math.cos(a), 2.2, hand)
        c.line(0.5, 0.5, 0.5 + 0.2, 0.5 + 0.13, 2.6, hand); c.line(0.5, 0.5, 0.5 - 0.1, 0.5 + 0.33, 1.8, hand); c.ell(0.5, 0.5, 0.035, None, hand)
    return fn


# ------------------------------------------------------------------ shared building parts
def china_roof(b, cx, cz, w, d, y, h, tile, ridge, up=0.35, ridge_len=0.62, finial=None, under=0x7a3028):
    """hipped Chinese roof with a concave slope and upturned corners; w x d = eave size"""
    def ring(sx, sz, yy, cu):
        x0, x1, z0, z1 = cx - w / 2 * sx, cx + w / 2 * sx, cz - d / 2 * sz, cz + d / 2 * sz
        return [(x0, yy + cu, z1), (cx, yy, z1), (x1, yy + cu, z1), (x1, yy, cz), (x1, yy + cu, z0), (cx, yy, z0), (x0, yy + cu, z0), (x0, yy, cz)]
    rings = [ring(1, 1, y, up), ring(0.78, 0.6, y + h * 0.2, up * 0.2), ring(ridge_len, 0.08, y + h * 0.82, 0)]
    b.loft(rings[:2], tile, under=b.c(under))
    b.loft(rings[1:], tile)
    b.face([(x, yy - 0.1, z) for (x, yy, z) in rings[1]][::-1], b.c(under))
    rl = w * ridge_len
    b.box(cx - rl / 2, cx + rl / 2, y + h * 0.8, y + h, cz - d * 0.05, cz + d * 0.05, ridge)
    if b.hi:
        for sx in (-1, 1):
            for sz in (-1, 1):
                b.beam((cx + sx * w / 2, y + up + 0.08, cz + sz * d / 2), (cx + sx * w / 2 * 0.78, y + h * 0.2 + up * 0.2 + 0.1, cz + sz * d / 2 * 0.6), 0.22, 0.18, ridge)
                b.beam((cx + sx * w / 2 * 0.78, y + h * 0.2 + up * 0.2 + 0.1, cz + sz * d / 2 * 0.6), (cx + sx * rl / 2, y + h * 0.86, cz + sz * d * 0.04), 0.22, 0.18, ridge)
    if finial is not None:
        for sx in (-1, 1): b.bx(cx + sx * rl / 2, cz, 0.35, max(0.3, d * 0.12), y + h, h * 0.22, finial)
    return y + h


def beaux(b, col, bay=5.0, glass=0x363e46, pfx='', main_floors=2, arch_main=True, base_arch=True, pil=True):
    """trim bands for a Beaux-Arts stone block: rusticated base, main (1 or 2 floors between pilasters), attic, plain ashlar"""
    def base(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.06, 6); c.joints(7, 2, 0.72, 2.0)
        c.window(0.28, 0.1, 0.72, 0.8, glass, mul(col, 0.78), arch=base_arch, mull=(2, 2), surround=mul(col, 1.06), sw=0.03)
        c.rect(0, 0.93, 1, 1, mul(col, 1.08), 0.8); c.rect(0, 0.93, 1, 0.945, k=0.75)
    def main(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.05, 6); c.joints(12, 2, 0.9)
        if pil:
            c.rect(0, 0, 0.1, 1, mul(col, 1.07), 0.75); c.rect(0.9, 0, 1, 1, mul(col, 1.07), 0.75); c.rect(0.1, 0, 0.115, 1, k=0.78); c.rect(0.885, 0, 0.9, 1, k=1.08)
        if main_floors == 2:
            c.window(0.27, 0.07, 0.73, 0.54, glass, mul(col, 0.78), arch=arch_main, mull=(2, 3), surround=mul(col, 1.06), sw=0.03)
            c.window(0.3, 0.66, 0.7, 0.9, glass, mul(col, 0.78), mull=(2, 2), surround=mul(col, 1.06), sw=0.025)
        else: c.window(0.25, 0.08, 0.75, 0.86, glass, mul(col, 0.78), arch=arch_main, mull=(3, 4), surround=mul(col, 1.06), sw=0.035)
        c.rect(0, 0.95, 1, 1, mul(col, 1.08), 0.8)
    def attic(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.05, 6); c.window(0.3, 0.2, 0.7, 0.78, glass, mul(col, 0.78), mull=(2, 1)); c.rect(0, 0.88, 1, 1, mul(col, 1.08), 0.8)
    return (b.band(pfx + 'base', 96, base, bay=bay), b.band(pfx + 'main', 128, main, bay=bay), b.band(pfx + 'attic', 32, attic, bay=bay), b.band(pfx + 'ash', 32, p_ashlar(col, 4, 3), bay=bay))


def office(b, col, name='off', bay=6.0, glass=0x39434c, nwin=3, px=64, brick=None, frame=None, sill=None, arch=False):
    """one storey of an office / hotel facade: nwin windows per bay"""
    def fn(c):
        if brick: c.brick(brick[0], brick[1], col, brick[2], 0.1)
        else: c.rect(0, 0, 1, 1, col); c.noise(0.06, 6)
        for i in range(nwin):
            x0 = (i + 0.22) / nwin; x1 = (i + 0.78) / nwin
            c.window(x0, 0.18, x1, 0.8, glass, frame or mul(col, 0.75), arch=arch, mull=(2, 2), surround=sill, sw=0.012)
        c.rect(0, 0, 1, 0.05, mul(col, 0.9), 0.7)
    return b.band(name, px, fn, bay=bay)


def portico(b, cx, zf, w, y0, hc, n, r, skin, roof, depth=5.0, ped=4.0, ent=2.0, steps=0, seg=8, back=None):
    """temple front: n columns on the line z = zf, entablature, pediment; steps down in front"""
    b.colonnade((cx - w / 2 + r * 1.3, zf - r * 1.3), (cx + w / 2 - r * 1.3, zf - r * 1.3), y0, hc, n, r, skin, seg=seg)
    b.box(cx - w / 2, cx + w / 2, y0 + hc, y0 + hc + ent, zf - depth, zf, skin, bot=True)
    if ped > 0: b.gable(cx - w / 2 - 0.3, cx + w / 2 + 0.3, zf - depth, zf + 0.3, y0 + hc + ent, ped, roof, skin, axis='z')
    if y0 > 0: b.box(cx - w / 2, cx + w / 2, 0, y0, zf - depth, zf, back or skin)
    for k in range(steps):
        hh = y0 * (steps - k) / (steps + 1); b.box(cx - w / 2 + 0.5, cx + w / 2 - 0.5, 0, hh, zf, zf + 0.6 * (k + 1), back or skin)


def ship_hull(b, stations, skins, deck, stern_cap=None):
    """stations: [(z, half beam, freeboard, flare)] stern to bow; open below the waterline (y 0).
    skins: (lower hull, upper strake); returns nothing"""
    rings = []
    for (z, hb, fb, fl) in stations:
        rings.append([(hb * fl, 0, z), (hb, fb * 0.55, z), (hb, fb, z), (-hb, fb, z), (-hb, fb * 0.55, z), (-hb * fl, 0, z)])
    b.loft(rings, None, closed=False, skins=[skins[0], skins[1], deck, skins[1], skins[0]], capa=stern_cap)


def pier_shed(b, W, L, H, wall_s, front_col, roof_s, dark, trim, zf=0.0, bulk=None, monitor=True, door_s=None):
    """long gabled transit shed running back along -Z from z = zf; wall_s repeats along the sides"""
    x0, x1 = -W / 2, W / 2; hw = H * 0.62
    b.box(x0, x1, 0, hw, zf - L, zf, wall_s, notop=True, f=None if bulk else 0)
    b.gable(x0 - 0.4, x1 + 0.4, zf - L, zf, hw, H * 0.26, roof_s, front_col, axis='z')
    if monitor:
        mw = W * 0.16; yb = hw + H * 0.26 * (1 - mw / (W / 2)) - 0.1
        b.box(-mw, mw, yb, yb + H * 0.07, zf - L + 6, zf - 6, dark, notop=True)
        b.gable(-mw - 0.3, mw + 0.3, zf - L + 6, zf - 6, yb + H * 0.07, H - (yb + H * 0.07) if bulk is None else H * 0.05, roof_s, trim, axis='z')


# ================================================================== Tokyo additions
WARM = 0xffcf8a; LANT = 0xff7a3a; REDL = 0xff2a1a; WHITEL = 0xfff4e0


def p_grid(wall, nx=4, ny=1, glass=0x39434c, frame=None, wx=(0.2, 0.8), wy=(0.2, 0.82), arch=False, lit=None, rows=0, cols=3, brick=None, surround=None, mull=(2, 2),
           top=None, bot=None, pil=None, stripes=None, noise=0.06):
    """wall with nx * ny separately lit windows; top / bot: (frac, colour) bands; pil: colour of piers between windows;
    stripes: [(y0, y1, colour)...] horizontal stone bands; brick: (rows, cols, mortar)"""
    def fn(c):
        if lit is not None: c.litp = lit
        if brick: c.brick(brick[0], brick[1], wall, brick[2], 0.1)
        else:
            c.rect(0, 0, 1, 1, wall); c.noise(noise, 6)
            if rows: c.joints(rows, cols, 0.84)
        for st_ in (stripes or []):
            a, b_ = st_[0], st_[1]; c.rect(0, a, 1, b_, st_[2] if len(st_) > 2 else (surround if surround is not None else 0xd8d2c4), 0.75); c.rect(0, a - 0.012, 1, a, k=0.8)
        fr = frame if frame is not None else mul(wall, 0.7)
        for i in range(nx):
            if pil is not None: c.rect((i - 0.07) / nx, 0, (i + 0.07) / nx, 1, pil, 0.78); c.rect((i + 0.07) / nx, 0, (i + 0.085) / nx, 1, k=0.8)
            for j in range(ny):
                c.window((i + wx[0]) / nx, (j + wy[0]) / ny, (i + wx[1]) / nx, (j + wy[1]) / ny, glass, fr, arch, fw=0.012 * 4 / max(nx, 2), mull=mull, surround=surround, sw=0.02 * 3 / max(nx, 3))
        if pil is not None: c.rect(1 - 0.07 / nx, 0, 1, 1, pil, 0.78)
        if bot: c.rect(0, 0, 1, bot[0], bot[1], 0.7); c.rect(0, bot[0] - 0.02, 1, bot[0], k=0.8)
        if top: c.rect(0, 1 - top[0], 1, 1, top[1], 0.8); c.rect(0, 1 - top[0], 1, 1 - top[0] + 0.025, k=0.75)
        c.grain(0.02)
    return fn


def p_curtain(col=0x4a6274, nx=8, ny=4, frame=0x8a8c8c, fw=1.0, sky=0.2, lit=0.45, span=None, k=0.55):
    """glass curtain wall, nx * ny cells, a scatter of them lit (dim); span: opaque spandrel fraction at each cell's foot"""
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.vgrad(1 + sky, 1 - sky * 0.5); c.noise(0.1, 4)
        for i in range(nx):
            for j in range(ny):
                if c.rng.rand() < lit:
                    lc = rgbf([0xffd29a, 0xffe6c0, 0xfff1dc, 0xd4e2ff][c.rng.randint(4)]) * (0.3 + 0.7 * c.rng.rand()) * k
                    c.rect(i / nx, j / ny, (i + 1) / nx, (j + 1) / ny, e=tuple(lc))
        if span:
            for j in range(ny): c.rect(0, j / ny, 1, (j + span) / ny, mul(col, 0.7), 0.6)
        for i in range(nx): c.rect(i / nx, 0, i / nx + fw / 256, 1, frame, 0.7)
        for j in range(ny): c.rect(0, j / ny, 1, j / ny + fw / c.ph, frame, 0.7)
    return fn


def p_kawara(col=0x4c5054, ribs=10, laps=3):
    """Japanese pan tiles: round ribs running up the slope, eave row of round tile ends at the foot"""
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.1, 6)
        for i in range(ribs):
            x = (i + 0.5) / ribs; c.rect(x - 0.2 / ribs, 0, x + 0.2 / ribs, 1, None, 0.85, k=1.18); c.rect(x + 0.2 / ribs, 0, x + 0.36 / ribs, 1, None, 0.25, k=0.66)
        if laps: c.joints(laps, 0, 0.85, 1.2)
        c.rect(0, 0, 1, 0.06, None, 0.9, k=1.25); c.grain(0.03)
    return fn


def buv(b, skin, u, t):
    """explicit uv for a band skin: u in repeats, t 0 (band foot) .. 1 (band top)"""
    y, h, _ = b.tex.bands[skin[1]]; return [u, y + h - 0.6 - (h - 1.2) * t]


def jroof(b, cx, cz, w, d, y, h, tile, ridge, style='irimoya', up=None, hipf=0.42, gable=None, under=None, axis='x', th=0.3, rl=None, orn=None, p=1.35, soffit=True):
    """Japanese tiled roof with concave slopes and upturned eave corners. w x d = eave plan size, y = eave height (mid side),
    h = height to the ridge top, ridge along X (axis 'z': along Z). style: 'irimoya' (hip-and-gable), 'hip' (yosemune / hogyo), 'gable' (kirizuma)."""
    if axis == 'z':
        s = b.sub(); jroof(s, 0, 0, d, w, y, h, tile, ridge, style, up, hipf, gable, under, 'x', th, rl, orn, p, soffit); b.add(s, t=(cx, 0, cz), ry=90); return y + h
    up = h * 0.14 if up is None else up; gable = gable or b.c(0xd8d4c8); under = under or b.c(0x4a3a30)
    isf = tile[0] == 'f'; bay = tile[2] if isf else 1.0; n = b.d(4, 2)
    def Q(pts, us, ts):
        b.face(pts, tile, uv=[buv(b, tile, u / bay, t) for u, t in zip(us, ts)] if isf else None)
    yr = y + h * 0.92
    if style == 'gable':
        lv = b.d([0, 0.5, 1], [0, 1]); R = []
        for s_ in lv:
            R.append([(cx + (-1 + 2 * i / n) * w / 2, y + (yr - y) * s_ ** p + up * (1 - s_) ** 2 * abs(-1 + 2 * i / n) ** 2.5, d / 2 * (1 - s_)) for i in range(n + 1)])
        for j in range(len(lv) - 1):
            for i in range(n):
                a0, a1, b1, b0 = R[j][i], R[j][i + 1], R[j + 1][i + 1], R[j + 1][i]; us = [a0[0], a1[0], b1[0], b0[0]]; ts = [lv[j], lv[j], lv[j + 1], lv[j + 1]]
                Q([(q[0], q[1], cz + q[2]) for q in (a0, a1, b1, b0)], us, ts)
                Q([(q[0], q[1], cz - q[2]) for q in (a1, a0, b0, b1)], [-a1[0], -a0[0], -b0[0], -b1[0]], ts)
                if soffit and (j == 0):
                    b.face([(q[0], q[1] - (th if k_ < 2 else 0), cz + q[2]) for k_, q in enumerate((b0, b1, a1, a0))], under); b.face([(q[0], q[1] - (th if k_ < 2 else 0), cz - q[2]) for k_, q in enumerate((b1, b0, a0, a1))], under)
                    if i == 0: yq = R[1][0][1] - th - up * (1 - lv[1]) ** 2; zq = R[1][0][2]; b.face([(cx - w / 2, yq, cz - zq), (cx + w / 2, yq, cz - zq), (cx + w / 2, yq, cz + zq), (cx - w / 2, yq, cz + zq)], under)
        gi = min(0.6, w * 0.04)
        for sx in (-1, 1):
            prof = [(R[j][0][2], R[j][0][1] - up * (1 - lv[j]) ** 2) for j in range(len(lv))]   # (z, y) eave -> ridge
            pts = [(0, y)] + [(-sx * z_, y_) for (z_, y_) in prof] + [(sx * z_, y_) for (z_, y_) in prof[-2::-1]]
            b.face([(cx + sx * (w / 2 - gi), y_, cz + z_) for (z_, y_) in pts], gable)
            if b.hi:
                for j in range(len(lv) - 1):
                    for sz in (-1, 1): b.beam((cx + sx * w / 2, R[j][0 if sx < 0 else n][1] - 0.05, cz + sz * R[j][0][2]), (cx + sx * w / 2, R[j + 1][0 if sx < 0 else n][1] - 0.05, cz + sz * R[j + 1][0][2]), 0.18, 0.4, under)
        hx1 = w / 2
    else:
        if style == 'hip': ax = rl if rl is not None else max(0.04, (w - d * 0.92) / w); az = 0.04 if d > 6 else 0.08; hh = (yr - y); lv = b.d([0, 0.3, 0.65, 1], [0, 0.45, 1])
        else: ax = rl if rl is not None else max(0.3, (w - d * 0.5) / w); az = 0.5; hh = h * hipf; lv = b.d([0, 0.45, 1], [0, 1])
        tk = 1.0 if style == 'hip' else 0.5
        def ring(s_):
            hx, hz = w / 2 * (1 - s_ * (1 - ax)), d / 2 * (1 - s_ * (1 - az)); yy = y + hh * s_ ** p; L = lambda t: yy + up * (1 - s_) ** 2 * abs(t) ** 2.5
            T = [-1 + 2 * i / n for i in range(n)]
            return ([(cx + t * hx, L(t), cz + hz) for t in T] + [(cx + hx, L(t), cz - t * hz) for t in T] + [(cx - t * hx, L(t), cz - hz) for t in T] + [(cx - hx, L(t), cz + t * hz) for t in T], hx, hz)
        R = [ring(s_) for s_ in lv]
        for j in range(len(lv) - 1):
            (A, ahx, ahz), (Bq, bhx, bhz) = R[j], R[j + 1]
            for k in range(4):
                ha, hb = (ahx, bhx) if k % 2 == 0 else (ahz, bhz)
                for i in range(n):
                    i0 = k * n + i; i1 = (i0 + 1) % (4 * n); t0 = -1 + 2 * i / n; t1 = -1 + 2 * (i + 1) / n
                    Q([A[i0], A[i1], Bq[i1], Bq[i0]], [t0 * ha, t1 * ha, t1 * hb, t0 * hb], [lv[j] * tk, lv[j] * tk, lv[j + 1] * tk, lv[j + 1] * tk])
                    if j == 0 and soffit:
                        dn = lambda q: (q[0], q[1] - th, q[2])
                        b.face([dn(Bq[i0]), dn(Bq[i1]), A[i1], A[i0]], under)
            if j == 0 and soffit: b.face([(q[0], y + hh * lv[1] ** p - th, q[2]) for q in Bq][::-1], under)
            if b.hi:
                for k in range(4):
                    a, c_ = A[k * n], Bq[k * n]; b.beam((a[0], a[1] + 0.12, a[2]), (c_[0], c_[1] + 0.12, c_[2]), 0.28, 0.24, ridge)
        Tq, hx1, hz1 = R[-1]; y1 = y + hh
        if style == 'irimoya':
            ym = y1 + (yr - y1) * 0.42; prof = b.d([(hz1, y1, 0.5), (hz1 * 0.5, ym, 0.75), (0, yr, 1.0)], [(hz1, y1, 0.5), (0, yr, 1.0)])
            for j in range(len(prof) - 1):
                (za, ya, ta), (zb, yb, tb) = prof[j], prof[j + 1]
                Q([(cx - hx1, ya, cz + za), (cx + hx1, ya, cz + za), (cx + hx1, yb, cz + zb), (cx - hx1, yb, cz + zb)], [-hx1, hx1, hx1, -hx1], [ta, ta, tb, tb])
                Q([(cx + hx1, ya, cz - za), (cx - hx1, ya, cz - za), (cx - hx1, yb, cz - zb), (cx + hx1, yb, cz - zb)], [-hx1, hx1, hx1, -hx1], [ta, ta, tb, tb])
                for sx in (-1, 1):   # soffit of the gable overhang
                    xa_, xb_ = cx + sx * (hx1 - min(0.7, hx1 * 0.12)), cx + sx * hx1
                    for sz in (-1, 1):
                        q = [(xa_, ya - 0.06, cz + sz * za), (xb_, ya - 0.06, cz + sz * za), (xb_, yb - 0.06, cz + sz * zb), (xa_, yb - 0.06, cz + sz * zb)]
                        b.face(q if sx * sz < 0 else q[::-1], under)
                if b.hi:
                    for sx in (-1, 1):
                        for sz in (-1, 1): b.beam((cx + sx * hx1, ya - 0.05, cz + sz * za), (cx + sx * hx1, yb - 0.05, cz + sz * zb), 0.2, 0.45, under)
            gi = min(0.7, hx1 * 0.12)
            for sx in (-1, 1):
                pts = [(0, y1)] + [(-sx * z_, y_) for (z_, y_, _) in prof] + [(sx * z_, y_) for (z_, y_, _) in prof[-2::-1]]
                b.face([(cx + sx * (hx1 - gi), y_, cz + z_) for (z_, y_) in pts], gable)
    rd = max(0.45, min(1.2, d * 0.035)); rx = hx1 + (0.25 if style != 'hip' else 0.1)
    if hx1 > 0.3:
        b.box(cx - rx, cx + rx, yr - 0.15, y + h, cz - rd / 2, cz + rd / 2, ridge)
        if b.hi or orn is not None:
            for sx in (-1, 1): b.bx(cx + sx * rx, cz, rd * 1.3, rd * 1.5, y + h - 0.1, max(0.35, h * 0.07), orn or ridge)
    else:
        b.frust((cx - rd, cx + rd, cz - rd, cz + rd), (cx - rd * 0.5, cx + rd * 0.5, cz - rd * 0.5, cz + rd * 0.5), yr - 0.1, y + h * 0.97, ridge, top=ridge)
        if b.hi: b.lathe(cx, cz, [(rd * 0.3, y + h * 0.97), (rd * 0.55, y + h * 1.03), (0, y + h * 1.12)], 6, orn or ridge)
    return y + h


def karahafu(b, cx, z0, z1, w, y, h, tile, front, edge, th=0.5, under=None):
    """undulating 'Chinese' gable: bell-curve roof sheet from z0 (back) to z1 (front) with a thick front bargeboard and tympanum"""
    n = b.d(12, 6); under = under or edge
    pr = [(cx + (-1 + 2 * i / n) * w / 2, y + h * (0.5 + 0.5 * math.cos(math.pi * (-1 + 2 * i / n))) ** 0.9 + 0.1 * h * abs(-1 + 2 * i / n) ** 4) for i in range(n + 1)]
    isf = tile[0] == 'f'
    for i in range(n):
        (xa, ya), (xb, yb) = pr[i], pr[i + 1]
        uv = [buv(b, tile, 0, 0), buv(b, tile, max(1, round((z1 - z0) / tile[2])), 0), buv(b, tile, max(1, round((z1 - z0) / tile[2])), 1), buv(b, tile, 0, 1)] if isf else None
        rp = max(1, round((z1 - z0) / tile[2])) if isf else 1
        b.face([(xa, ya, z1), (xb, yb, z1), (xb, yb, z0), (xa, ya, z0)], tile, uv=[buv(b, tile, 0, i / n), buv(b, tile, 0, (i + 1) / n), buv(b, tile, rp, (i + 1) / n), buv(b, tile, rp, i / n)] if isf else None)
        b.face([(xa, ya - th, z1 + 0.05), (xb, yb - th, z1 + 0.05), (xb, yb, z1 + 0.05), (xa, ya, z1 + 0.05)], edge)
        b.face([(xb, yb - th, z0), (xa, ya - th, z0), (xa, ya - th, z1), (xb, yb - th, z1)], under)
        if ya - th > y or yb - th > y: b.face([(xa, y, z1 - 0.1), (xb, y, z1 - 0.1), (xb, max(y, yb - th), z1 - 0.1), (xa, max(y, ya - th), z1 - 0.1)], front)
    return y + h


def pine(b, x, z, h=9.0, r=3.0, lean=0.0, col=0x2e4a34, trunk=0x4a3a2c, yb=0.0):
    """Japanese black pine: leaning trunk and flat foliage pads"""
    g = b.c(col); g2 = b.c(mul(col, 0.82)); tr = b.c(trunk)
    b.tube((x, yb, z), (x + lean, yb + h * 0.8, z), 0.28, tr, seg=b.d(4, 3), r1=0.14)
    pads = b.d([(0.0, 0.52, 1.0), (0.45, 0.68, 0.8), (-0.3, 0.84, 0.62)], [(0.0, 0.6, 1.0)])
    for i, (ox, f, k) in enumerate(pads):
        px = x + lean * f + ox * r; rr = r * k; y0 = yb + h * f
        b.lathe(px, z + (0.3 * r if i == 1 else 0), [(0, y0 - 0.1), (rr, y0), (rr * 0.75, y0 + rr * 0.35), (0, y0 + rr * (0.5 if b.hi else 0.9))], b.d(6, 4), g if i % 2 == 0 else g2, smooth=False)


def tree(b, x, z, h=8.0, r=3.0, col=0x3c5a38, yb=0.0):
    b.tube((x, yb, z), (x, yb + h * 0.5, z), 0.25, b.c(0x4a3a2c), seg=b.d(4, 3))
    b.lathe(x, z, b.d([(0, yb + h * 0.3), (r * 0.8, yb + h * 0.42), (r, yb + h * 0.62), (r * 0.6, yb + h * 0.88), (0, yb + h)], [(0, yb + h * 0.3), (r, yb + h * 0.55), (0, yb + h)]), b.d(6, 4), b.c(col), smooth=False)


def ishigaki(b, x0, x1, z0, z1, y0, y1, skin, batter=0.25, top=None, skins=None):
    """battered dry-stone castle base: plan rect at the TOP, splaying out by batter * height at the foot"""
    o = batter * (y1 - y0)
    a = [(x0 - o, y0, z1 + o), (x1 + o, y0, z1 + o), (x1 + o, y0, z0 - o), (x0 - o, y0, z0 - o)]; t = [(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)]
    m = [((p[0] + q[0]) / 2 - (q[0] - p[0]) * 0.18, (y0 + y1) / 2, (p[2] + q[2]) / 2 - (q[2] - p[2]) * 0.18) for p, q in zip(a, t)]   # concave sori
    for i in range(4):
        if skins and skins.get(i, 1) is None: continue
        j = (i + 1) % 4
        if b.hi: b.face([a[i], a[j], m[j], m[i]], skin); b.face([m[i], m[j], t[j], t[i]], skin)
        else: b.face([a[i], a[j], t[j], t[i]], skin)
    if top is not None: b.face(t, top)


def torii(b, cx, cz, w, h, col, sanno=False, black=None, axis='x'):
    """myojin torii (pillars w apart, h to the top of the kasagi); sanno: the triangular gable of Hie's Sanno torii"""
    s = b.sub(); r = max(0.18, h * 0.035); black = black or col
    for sx in (-1, 1):
        s.tube((sx * w / 2 * 1.04, 0, 0), (sx * w / 2 * 0.98, h * 0.86, 0), r, col, seg=s.d(8, 5), r1=r * 0.9)
        if s.hi: s.cyl(sx * w / 2 * 1.04, 0, r * 1.5, 0, r * 1.4, 8, black)
    s.box(-w / 2 * 1.22, w / 2 * 1.22, h * 0.66, h * 0.66 + r * 1.5, -r * 0.5, r * 0.5, col, bot=True)     # nuki
    if s.hi: s.box(-r * 0.6, r * 0.6, h * 0.66 + r * 1.5, h * 0.86, -r * 0.4, r * 0.4, col)               # gakuzuka
    L = w / 2 * 1.42; n = s.d(4, 2)
    for i in range(n):                                                                                   # shimaki + kasagi, curving up to the tips
        for sx in (-1, 1):
            t0, t1 = i / n, (i + 1) / n; ya, yb = h * 0.86 + h * 0.07 * t0 ** 2.2, h * 0.86 + h * 0.07 * t1 ** 2.2
            s.beam((sx * L * t0, ya + r * 0.6, 0), (sx * L * t1, yb + r * 0.6, 0), r * 1.6, r * 1.2, col, caps=(i == n - 1))
            s.beam((sx * L * t0 * 1.04, ya + r * 1.6, 0), (sx * L * t1 * 1.04, yb + r * 1.6, 0), r * 2.2, r * 0.9, black, caps=(i == n - 1))
    if sanno:
        yk = h * 0.86 + r * 2.0
        s.beam((-w * 0.42, yk + 0.05, 0), (0, h * 1.16, 0), r * 1.4, r * 0.9, col); s.beam((w * 0.42, yk + 0.05, 0), (0, h * 1.16, 0), r * 1.4, r * 0.9, col)
        s.bx(0, 0, r * 1.2, r * 1.2, yk, h * 1.16 - yk, col)
    b.add(s, t=(cx, 0, cz), ry=0 if axis == 'x' else 90)


def lantern(b, x, y, z, r=0.5, h=0.9, col=LANT, k=1.0):
    """paper lantern (chochin), emissive"""
    g = b.glow(col, k); b.lathe(x, z, [(r * 0.5, y), (r, y + h * 0.3), (r, y + h * 0.7), (r * 0.5, y + h)], b.d(6, 4), g, capt=b.c(0x1c1c1c), capb=b.c(0x1c1c1c))


def stone_lantern(b, x, z, h=2.2, col=0x8c8a80):
    c_ = b.c(col)
    b.bx(x, z, h * 0.22, h * 0.22, 0, h * 0.5, c_)
    if b.hi: b.bx(x, z, h * 0.34, h * 0.34, h * 0.5, h * 0.2, b.glow(WARM, 0.8, 0x6a6458))
    b.frust((x - h * 0.3, x + h * 0.3, z - h * 0.3, z + h * 0.3), (x, x, z, z), h * 0.7 if b.hi else h * 0.5, h, c_)


def cornice(b, poly, y, out, hgt, skin, closed=True):
    """projecting string course / cornice round a plan polygon (CCW or CW)"""
    pl = b._orient(poly)[::-1]
    b.sweep(pl, [(0, y), (out, y + hgt * 0.5), (out, y + hgt), (0, y + hgt)], skin, closed=closed)


def pilasters(b, p0, p1, y0, y1, n, w, dep, skin, ends=True, cap=None):
    """n shallow piers along the wall p0 -> p1 (seen p0 left), projecting dep"""
    p0 = np.array(p0, np.float64); p1 = np.array(p1, np.float64); L = np.linalg.norm(p1 - p0); d = (p1 - p0) / L; o = np.array([-d[1], d[0]])
    for i in range(n):
        t = (i / max(1, n - 1)) if ends else (i + 0.5) / n
        c = p0 + (p1 - p0) * t; a = c - d * w / 2; e = c + d * w / 2; ao = a + o * dep; eo = e + o * dep
        b.wall(ao, eo, y0, y1, skin)
        if b.hi:
            b.wall(a, ao, y0, y1, skin); b.wall(eo, e, y0, y1, skin)
            b.face([(ao[0], y1, ao[1]), (eo[0], y1, eo[1]), (e[0], y1, e[1]), (a[0], y1, a[1])], cap or skin)


def dome(b, cx, cz, r, y, h, seg, skin, rib=None, sq=1.0, n=None):
    n = n or b.d(5, 3); prof = [(r * math.cos(math.pi / 2 * i / n), y + h * math.sin(math.pi / 2 * i / n)) for i in range(n + 1)]; prof[-1] = (0, y + h)
    b.lathe(cx, cz, prof, seg, skin, sq=sq)
    if rib is not None and b.hi:
        for k in range(seg):
            a = 2 * math.pi * k / seg
            for i in range(n):
                (r0, y0), (r1, y1) = prof[i], prof[i + 1]
                b.beam((cx + (r0 + 0.05) * math.sin(a), y0, cz + (r0 + 0.05) * math.cos(a) * sq), (cx + (r1 + 0.05) * math.sin(a), y1 + 0.02, cz + (r1 + 0.05) * math.cos(a) * sq), r * 0.05, r * 0.05, rib, up=(math.sin(a), 0, math.cos(a)))


def avlight(b, x, y, z, s=0.6): b.bx(x, z, s, s, y, s, b.glow(REDL, 1.0, 0x8a1a14))


def _flood(s, k=0.14, col=0xffdcae, reg=(0, 0, 1, 1), grad=0.45):
    """floodlit wall: faint emissive wash of the albedo (never dims lit windows)"""
    R = s.rmask(*reg); t = np.clip((s.Y - reg[1]) / (reg[3] - reg[1]), 0, 1)
    e = s.rgb * rgbf(col)[None, None, :] * (k * (1 - grad * t))[:, :, None]; s.em[R] = np.maximum(s.em, e)[R]; return s
Cv.flood = _flood
B.cf = lambda s, col, k=0.14, rough=0.85, metal=0.0, tint=0xffdcae: s.tex.col(col, rough, metal, tuple(float(x) for x in rgbf(col) * rgbf(tint) * k))


def fl(painter, k=0.14, col=0xffdcae, grad=0.45):
    def fn(c): painter(c); c.flood(k, col, grad=grad)
    return fn


def win_decals(b, name='win', pw=24, ph=32, glass=0x39434c, frame=0x6a6a66, arch=False, mull=(2, 3), nlit=3, ndark=2, wall=None):
    """a few window decals for modelled openings: lit (warm / white / cool) and dark variants"""
    out = []
    for k in range(nlit + ndark):
        def fn(c, k=k):
            c.rect(0, 0, 1, 1, wall if wall is not None else frame); c.rng = np.random.RandomState(k * 7 + 3)
            c.window(0.04, 0.03, 0.96, 0.97, glass, frame, arch, fw=0.05, mull=mull, sill=False, lit=True if k < nlit else 0)
        out.append(b.decal('%s%d' % (name, k), pw, ph, fn))
    return out


def winwall(b, p0, p1, y0, y1, n, wall, decs, rng, lod_band, sill=0.22, head=0.14, pier=0.4, depth=0.35, arch=False, plit=0.5, reveal=None, nlit=3):
    """one storey p0 -> p1 with n modelled window openings (LOD0); the LOD1 pass draws the painted band instead"""
    if not b.hi:
        b.wall(p0, p1, y0, y1, lod_band); return
    H = y1 - y0; ys = y0 + H * sill
    # hidden band quad just behind the window plane: keeps the LOD0 facade primitive's box equal to the LOD1's
    L_ = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); ox, oz = (p1[1] - p0[1]) / L_ * (depth + 0.06), -(p1[0] - p0[0]) / L_ * (depth + 0.06)
    b.face([(p0[0], y0, p0[1]), (p1[0], y0, p1[1]), (p1[0] + ox * 0, y1, p1[1]), (p0[0], y1, p0[1])], lod_band) if False else b.wall((p0[0] + ox, p0[1] + oz), (p1[0] + ox, p1[1] + oz), y0, y1, lod_band)
    if sill > 0: b.wall(p0, p1, y0, ys, wall)
    pick = lambda i: decs[rng.randint(nlit)] if rng.rand() < plit else decs[nlit + rng.randint(len(decs) - nlit)]
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); ow = L / n * (1 - pier)
    if arch: b.arcade(p0, p1, ys, y1 - H * head - ow / 2, y1, n, wall, depth=depth, back=pick, pier=pier, aseg=4, reveal=reveal)
    else: b.arcade(p0, p1, ys, y1 - H * head - 0.05, y1, n, wall, depth=depth, back=pick, pier=pier, flat=True, reveal=reveal)


def curvewall(b, pts, y0, y1, skin, bay=None, y0b=None, y1b=None):
    """wall along a plan polyline (seen from outside, left to right) with u continuous by arc length"""
    cum = [0.0]
    for i in range(len(pts) - 1): cum.append(cum[-1] + math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
    isf = skin[0] == 'f'; bay = bay or (skin[2] if isf else 1.0); k = max(1, round(cum[-1] / bay)) / cum[-1]
    for i in range(len(pts) - 1):
        a, c = pts[i], pts[i + 1]
        q = [(a[0], y0 if y0b is None else y0b[i], a[1]), (c[0], y0 if y0b is None else y0b[i + 1], c[1]), (c[0], y1 if y1b is None else y1b[i + 1], c[1]), (a[0], y1 if y1b is None else y1b[i], a[1])]
        b.face(q, skin, uv=[buv(b, skin, cum[i] * k, 0), buv(b, skin, cum[i + 1] * k, 0), buv(b, skin, cum[i + 1] * k, 1), buv(b, skin, cum[i] * k, 1)] if isf else None)


def arch_bridge(b, x0, x1, zc, width, n, y0, ys, rise, yt, skin, soffit, pier=0.16, aseg=None, deck=None, cutwater=None):
    """masonry arch bridge along X: n segmental arches springing at ys with the given rise, spandrel walls to yt on both faces"""
    aseg = aseg or b.d(8, 3); L = x1 - x0; bw = L / n; ow = bw * (1 - pier)
    for i in range(n):
        a = x0 + i * bw; xl = a + (bw - ow) / 2; xr = xl + ow; cx = a + bw / 2
        arc = [(cx - ow / 2 * math.cos(math.pi * k / aseg), ys + rise * math.sin(math.pi * k / aseg)) for k in range(aseg + 1)]
        for sz in (-1, 1):
            z = zc + sz * width / 2; F_ = (lambda q: q) if sz > 0 else (lambda q: q[::-1])
            b.face(F_([(a, y0, z), (xl, y0, z), (xl, yt, z), (a, yt, z)]), skin); b.face(F_([(xr, y0, z), (a + bw, y0, z), (a + bw, yt, z), (xr, yt, z)]), skin)
            for k in range(aseg):
                (xa, ya), (xb, yb) = arc[k], arc[k + 1]; b.face(F_([(xa, ya, z), (xb, yb, z), (xb, yt, z), (xa, yt, z)]), skin)
        za, zb = zc - width / 2, zc + width / 2
        b.face([(xl, y0, zb), (xl, y0, za), (xl, ys, za), (xl, ys, zb)], soffit); b.face([(xr, y0, za), (xr, y0, zb), (xr, ys, zb), (xr, ys, za)], soffit)
        for k in range(aseg):
            (xa, ya), (xb, yb) = arc[k], arc[k + 1]; b.face([(xa, ya, zb), (xa, ya, za), (xb, yb, za), (xb, yb, zb)], soffit)
        if cutwater is not None and i > 0:
            for sz in (-1, 1):
                z = zc + sz * width / 2; pw = (bw - ow)
                b.prism([(a - pw / 2, z), (a + pw / 2, z), (a, z + sz * pw * 0.9)], y0, ys + rise * 0.55, cutwater, top=cutwater)
    if deck is not None: b.face([(x0, yt, zc + width / 2), (x1, yt, zc + width / 2), (x1, yt, zc - width / 2), (x0, yt, zc - width / 2)], deck)


def p_shiro(c):
    """white plastered castle wall: stone footing line, small barred windows, dark eave shadow"""
    c.rect(0, 0, 1, 1, 0xdcd8cc); c.noise(0.04, 5)
    for i in range(4): c.rect(i / 4 + 0.09, 0.42, i / 4 + 0.16, 0.7, 0x3a3630); c.rect(i / 4 + 0.122, 0.42, i / 4 + 0.128, 0.7, 0xdcd8cc)
    c.rect(0, 0, 1, 0.1, 0x8a867c); c.rect(0, 0.92, 1, 1, 0xb8b4a8); c.flood(0.3, 0xfff0d8)


def p_stone(col=0x8e8a80):
    def fn(c):
        c.rect(0, 0, 1, 1, col); c.noise(0.16, 8); c.joints(7, 5, 0.72, 1.6); c.noise(0.08, 3); c.grain(0.04); c.flood(0.1, 0xfff0d8)
    return fn
