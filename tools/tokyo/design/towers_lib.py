# Shared helpers for the Tokyo tower models (design-towers).
# Run inside Blender 4.5:  blender -b -P towers_build_a.py -- [ids...] [--norender]
# Conventions: metres, Blender Z up, FRONT = -Y (glTF +Z after the Y-up export), base z 0, centred X/Y.
# Each model = one mesh, primitive 0 (+1) = tiling facade map(s), last primitive = 256 px palette atlas.
import bpy, math, os, sys, json, time, subprocess
import numpy as np
from mathutils import Vector

REPO = '/home/user/Kaiju'
OUT = REPO + '/assets/buildings/tokyo'
SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/tk_towers'
TEXDIR = SCR + '/tex'
RENDER = SCR + '/render'
SITES_JSON = REPO + '/tools/tokyo/data/landmark_sites.json'
for d in (OUT, TEXDIR, RENDER):
    os.makedirs(d, exist_ok=True)


# ------------------------------------------------------------------ 2D polygon helpers (CCW, front = -Y)
def rect(w, d, cx=0.0, cy=0.0):
    hw, hd = w / 2, d / 2
    return [(cx - hw, cy - hd), (cx + hw, cy - hd), (cx + hw, cy + hd), (cx - hw, cy + hd)]


def rect2(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def rrect(w, d, r, seg=4, cx=0.0, cy=0.0):
    hw, hd = w / 2, d / 2
    r = min(r, hw, hd)
    out = []
    for (sx, sy, a0) in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
        ox, oy = cx + sx * (hw - r), cy + sy * (hd - r)
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            out.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return dedupe(out)


def chamfer(w, d, c, cx=0.0, cy=0.0):
    hw, hd = w / 2, d / 2
    return [(cx - hw + c, cy - hd), (cx + hw - c, cy - hd), (cx + hw, cy - hd + c), (cx + hw, cy + hd - c),
            (cx + hw - c, cy + hd), (cx - hw + c, cy + hd), (cx - hw, cy + hd - c), (cx - hw, cy - hd + c)]


def ngon(r, n, cx=0.0, cy=0.0, rot=0.0, ry=None):
    ry = r if ry is None else ry
    return [(cx + r * math.cos(rot + 2 * math.pi * i / n), cy + ry * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]


def dedupe(poly, eps=1e-5):
    out = []
    for p in poly:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > eps:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out


def area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def ccw(poly):
    return poly if area(poly) > 0 else poly[::-1]


def scale(poly, sx, sy=None, about=(0.0, 0.0)):
    sy = sx if sy is None else sy
    return [(about[0] + (p[0] - about[0]) * sx, about[1] + (p[1] - about[1]) * sy) for p in poly]


def move(poly, dx, dy):
    return [(p[0] + dx, p[1] + dy) for p in poly]


def rot(poly, deg, about=(0.0, 0.0)):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [(about[0] + (p[0] - about[0]) * c - (p[1] - about[1]) * s, about[1] + (p[0] - about[0]) * s + (p[1] - about[1]) * c) for p in poly]


def lerp(p0, p1, t):
    return [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for a, b in zip(p0, p1)]


def _n2(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1.0
    return (dy / L, -dx / L)


n2 = _n2


def offset(poly, d):
    """Miter offset (outward for d > 0) of a CCW polygon."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        n1, n2 = _n2(p0, p1), _n2(p1, p2)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]
        bl = math.hypot(bx, by)
        if bl < 1e-6:
            out.append((p1[0] + n1[0] * d, p1[1] + n1[1] * d))
            continue
        bx /= bl
        by /= bl
        k = d / max(bx * n1[0] + by * n1[1], 0.35)
        out.append((p1[0] + bx * k, p1[1] + by * k))
    return out


def zigzag(poly, bay, depth, minlen=None):
    """Replace every edge by saw-tooth bays: n = round(L / bay) teeth, apex pushed out by depth."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        o = _n2(a, b)
        k = max(1, round(L / bay))
        if minlen and L < minlen:
            out.append(a)
            continue
        for j in range(k):
            t0, tm = j / k, (j + 0.5) / k
            out.append((a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0))
            out.append((a[0] + (b[0] - a[0]) * tm + o[0] * depth, a[1] + (b[1] - a[1]) * tm + o[1] * depth))
    return out


def bbox2(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), max(xs), min(ys), max(ys)


def simplify(poly, tol):
    out = list(poly)
    changed = True
    while changed and len(out) > 4:
        changed = False
        for i in range(len(out)):
            a, p, b = out[i - 1], out[i], out[(i + 1) % len(out)]
            L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-9
            dist = abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L
            if dist < tol:
                out.pop(i)
                changed = True
                break
    return out


def clip(poly, nx, ny, c):
    """Part of the polygon with nx * x + ny * y <= c."""
    out = []
    f = lambda p: nx * p[0] + ny * p[1] - c
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        fa, fb = f(a), f(b)
        if fa <= 0:
            out.append(a)
        if (fa <= 0) != (fb <= 0):
            t = fa / (fa - fb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return dedupe(out)


def arc(cx, cy, r, a0, a1, n, ry=None):
    ry = r if ry is None else ry
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


# ------------------------------------------------------------------ procedural textures
def _save(name, arr, path, fmt, colorspace):
    h, w = arr.shape[:2]
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name + '_tmp', w, h, alpha=False)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = fmt
    img.save(quality=88) if fmt == 'JPEG' else img.save()
    bpy.data.images.remove(img)
    img = bpy.data.images.load(path)
    img.name = name
    img.colorspace_settings.name = colorspace
    return img


def _lum(c):
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def _blur(a, k=1):
    for _ in range(k):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
    return a


def _noise(rng, h, w, amp, coarse=4):
    n = rng.normal(0, 1, (h, w))
    c = rng.normal(0, 1, (max(1, h // coarse), max(1, w // coarse)))
    c = np.kron(c, np.ones((coarse, coarse)))[:h, :w]
    if c.shape != (h, w):
        c = np.pad(c, ((0, h - c.shape[0]), (0, w - c.shape[1])), mode='wrap')
    return (n * 0.6 + _blur(c, 2) * 1.2) * amp


class Tex:
    """A tiling facade map: cols bays x rows floors per tile; rows start at the bottom."""

    def __init__(self, name, cols=4, rows=8, bay=3.0, floor=3.9, size=(256, 512), wall=(.68, .67, .64), glass=(.26, .33, .40),
                 wx=(.12, .88), wy=(.22, .86), frame=None, frame_px=1, mv=0, mh=0, mull=None, spandrel=None,
                 course=0, vjoint=0, noise=.03, glass_var=.10, grad=.10, blind=.25, blindc=(.70, .68, .62), lit=.04,
                 rough=.4, bump=1.0, seed=1, sill=None, shadow=.55, hband=None, pier=None, post=None, wallvar=.02, pattern=None,
                 night=.38, cool=.14, warm=(1.0, .80, .52), nightgain=1.0, rowrun=.3):
        self.name, self.cols, self.rows, self.bay, self.floor, self.rough = name, cols, rows, bay, floor, rough
        self.tw, self.th = cols * bay, rows * floor
        W, H = size
        rng = np.random.default_rng(seed)
        cw, ch = W / cols, H / rows
        col = np.empty((H, W, 3), np.float32)
        col[:] = wall
        hgt = np.ones((H, W), np.float32)
        emi = np.zeros((H, W, 3), np.float32)
        rowp = np.clip(night * rng.uniform(0.45, 1.6, rows), 0, 0.95)
        col *= (1 + _noise(rng, H, W, noise))[..., None]
        if course:
            step = ch / course
            for k in range(rows * course):
                y = int(round(k * step))
                col[y % H, :] *= 0.86
                hgt[y % H, :] = 0.8
                if vjoint:
                    off = (k % 2) * cw / vjoint / 2
                    for q in range(cols * vjoint):
                        x = int(round(q * cw / vjoint + off)) % W
                        y1 = int(round((k + 1) * step))
                        col[y:y1, x] *= 0.9
        if pier:  # (width fraction of a bay, colour): vertical pier centred on the bay line
            pw = max(1, int(round(pier[0] * cw)))
            for i in range(cols):
                x0 = int(round(i * cw - pw / 2))
                xs = np.arange(x0, x0 + pw) % W
                col[:, xs] = np.array(pier[1], np.float32) * (1 + _noise(rng, H, pw, noise * 0.7))[..., None]
                hgt[:, xs] = 1.3
                col[:, (x0 + pw) % W] *= 0.75
        if hband:  # (y0, y1 fraction of a floor, colour): horizontal band every floor (spandrel / sunshade)
            for j in range(rows):
                y0, y1 = int(round((j + hband[0]) * ch)), int(round((j + hband[1]) * ch))
                col[y0:y1, :] = np.array(hband[2], np.float32) * (1 + _noise(rng, y1 - y0, W, noise * 0.7))[..., None]
                hgt[y0:y1, :] = 1.2
        frame = frame if frame is not None else tuple(c * 0.55 for c in wall)
        mull = mull if mull is not None else frame
        for j in range(rows):
            prev = False
            for i in range(cols):
                if pattern and not pattern(i, j):
                    continue
                x0, x1 = int(round((i + wx[0]) * cw)), int(round((i + wx[1]) * cw))
                y0, y1 = int(round((j + wy[0]) * ch)), int(round((j + wy[1]) * ch))
                if x1 <= x0 or y1 <= y0:
                    continue
                if spandrel is not None:  # panel between the window heads and sills, in the window column
                    ya, yb = int(round(j * ch)), int(round((j + 1) * ch))
                    sp = np.array(spandrel, np.float32) * (1 + rng.normal(0, wallvar))
                    col[ya:y0, x0:x1] = sp * (1 + _noise(rng, y0 - ya, x1 - x0, noise * 0.5))[..., None] if y0 > ya else 0
                    if yb > y1:
                        col[y1:yb, x0:x1] = sp * (1 + _noise(rng, yb - y1, x1 - x0, noise * 0.5))[..., None]
                    hgt[ya:y0, x0:x1] = 0.6
                    hgt[y1:yb, x0:x1] = 0.6
                g = np.array(glass, np.float32) * (1 + rng.normal(0, glass_var))
                t = np.linspace(-0.5, 0.5, y1 - y0)[:, None, None]
                win = g[None, None, :] * (1 + grad * 2 * t) * np.ones((y1 - y0, x1 - x0, 1), np.float32)
                r = rng.random()
                if r < blind:
                    f = rng.uniform(0.25, 0.85)
                    k = int((y1 - y0) * (1 - f))
                    win[k:] = win[k:] * 0.3 + np.array(blindc, np.float32) * 0.7 * (0.85 + 0.15 * rng.random())
                elif r < blind + lit:
                    win = win * 0.55 + np.array((.78, .68, .48), np.float32) * 0.45
                if shadow < 1:  # recess shadow under the head and beside the left jamb
                    sh = max(1, int(round((y1 - y0) * 0.09)))
                    win[-sh:] *= shadow
                    win[:, :max(1, int((x1 - x0) * 0.05))] *= (shadow + 1) / 2
                col[y0:y1, x0:x1] = win
                hgt[y0:y1, x0:x1] = 0.0
                on = rng.random() < min(0.97, rowp[j] + (rowrun if prev else 0.0))
                prev = on
                if on:   # lit window: warm white, a few cool; brighter under the ceiling, dimmer where a blind is down
                    ec = np.array((.72, .86, 1.0) if rng.random() < cool else warm, np.float32) * rng.uniform(0.5, 1.0) * nightgain
                    tv = np.linspace(0.72, 1.0, y1 - y0)[:, None, None]
                    emi[y0:y1, x0:x1] = ec[None, None, :] * tv * (0.8 if r < blind else 1.0)
                elif rng.random() < 0.25:
                    emi[y0:y1, x0:x1] = np.array(warm, np.float32) * 0.07
                fp = frame_px
                if fp:
                    fc = np.array(frame, np.float32)
                    col[y0:y0 + fp, x0:x1] = fc
                    col[y1 - fp:y1, x0:x1] = fc
                    col[y0:y1, x0:x0 + fp] = fc
                    col[y0:y1, x1 - fp:x1] = fc
                    hgt[y0:y0 + fp, x0:x1] = hgt[y1 - fp:y1, x0:x1] = 0.5
                    hgt[y0:y1, x0:x0 + fp] = hgt[y0:y1, x1 - fp:x1] = 0.5
                mc = np.array(mull, np.float32)
                for q in range(1, mv + 1):
                    x = x0 + int(round((x1 - x0) * q / (mv + 1)))
                    col[y0:y1, x] = mc
                    hgt[y0:y1, x] = 0.4
                for q in range(1, mh + 1):
                    y = y0 + int(round((y1 - y0) * q / (mh + 1)))
                    col[y, x0:x1] = mc
                    hgt[y, x0:x1] = 0.4
                if sill is not None and y0 >= 2:
                    col[y0 - 2:y0, max(0, x0 - 1):x1 + 1] = sill
                    hgt[y0 - 2:y0, max(0, x0 - 1):x1 + 1] = 1.3
        if post:
            post(col, hgt, rng, cw, ch)
        col = np.clip(col, 0.10, 0.86)
        emi *= (hgt < 0.45)[..., None]   # glass and thin mullions only
        emi[hgt > 0.3] *= 0.35
        self.emis = _save(name + '_emis', np.clip(emi, 0, 1), f'{TEXDIR}/{name}_emis.jpg', 'JPEG', 'sRGB')
        self.mean = col.reshape(-1, 3).mean(0)
        self.base = _save(name + '_base', col, f'{TEXDIR}/{name}_base.jpg', 'JPEG', 'sRGB')
        # normal map from the height field (128 x 256)
        hh = hgt.reshape(H // 2, 2, W // 2, 2).mean((1, 3)) if (H % 2 == 0 and W % 2 == 0) else hgt
        hh = _blur(hh, 1)
        dx = (np.roll(hh, -1, 1) - np.roll(hh, 1, 1)) * bump * 1.6
        dy = (np.roll(hh, -1, 0) - np.roll(hh, 1, 0)) * bump * 1.6
        nz = np.ones_like(hh)
        ln = np.sqrt(dx * dx + dy * dy + 1)
        nrm = np.stack([-dx / ln * 0.5 + 0.5, -dy / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], -1)
        self.normal = _save(name + '_normal', nrm, f'{TEXDIR}/{name}_normal.jpg', 'JPEG', 'Non-Color')
        self.mat = None

    def material(self):
        if self.mat:
            return self.mat
        m = bpy.data.materials.new(self.name)
        m.use_nodes = True
        m.use_backface_culling = True
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = self.base
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = self.normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Roughness'].default_value = self.rough
        bsdf.inputs['Metallic'].default_value = 0.0
        e = nt.nodes.new('ShaderNodeTexImage')
        e.image = self.emis
        nt.links.new(e.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
        self.mat = m
        return m


# ------------------------------------------------------------------ mesh builder
class Builder:
    def __init__(self, name, lod=0):
        self.name, self.lod, self.hi = name, lod, lod == 0
        self.faces = []  # (pts, uvs, mat index (-1 palette), normals | None)
        self.fac = []
        self.pal = {}
        self.double_sided = True

    def seg(self, hi, lo):
        return hi if self.hi else lo

    # --- materials
    def facade(self, tex):
        if tex not in self.fac:
            self.fac.append(tex)
        return tex

    def colour(self, name, rgb, rough=0.7, metal=0.0, emit=(0.0, 0.0, 0.0)):
        if name not in self.pal:
            self.pal[name] = (len(self.pal), tuple(rgb), rough, metal, tuple(emit))
        return name

    def glow(self, **kw):
        """name=(r, g, b, er, eg, eb[, rough[, metal]]): palette cell with an emissive colour."""
        for k, v in kw.items():
            self.colour(k, v[:3], *(v[6:] or (0.5,)), emit=v[3:6])


    def colours(self, **kw):
        for k, v in kw.items():
            if len(v) == 3:
                self.colour(k, v)
            else:
                self.colour(k, v[:3], *v[3:])

    def puv(self, name):
        i = self.pal[name][0]
        return ((i % 16 + 0.5) / 16.0, 1.0 - (i // 16 + 0.5) / 16.0)

    # --- raw faces
    def poly(self, pts, mat, uvs=None, n=None):
        pts = [Vector(p) for p in pts]
        if len(pts) < 3:
            return
        if isinstance(mat, str):
            uv = self.puv(mat)
            self.faces.append((pts, [uv] * len(pts), -1, n))
        else:
            if uvs is None:
                uvs = self._auto_uv(pts, mat)
            self.faces.append((pts, uvs, self.fac.index(mat), n))

    def _auto_uv(self, pts, tex):
        nrm = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if nrm.length < 1e-9:
            return [(0, 0)] * len(pts)
        nrm.normalize()
        if abs(nrm.z) > 0.95:
            return [(p.x / tex.tw, p.y / tex.th) for p in pts]
        h = Vector((0, 0, 1)).cross(nrm).normalized()
        up = nrm.cross(h)
        return [(p.dot(h) / tex.tw, p.dot(up) / tex.th) for p in pts]

    def wall(self, a, b, z0, z1, mat, a1=None, b1=None, urange=None, n=None, vfloors=None, v0=0.0, zb0=None, zb1=None):
        """Wall from plan point a to b (a left, b right seen from outside). a1, b1: top plan points (taper).
        zb0 / zb1: bottom / top height at b when the wall is a trapezoid."""
        a1 = a1 or a
        b1 = b1 or b
        A = Vector((a[0], a[1], z0))
        Bv = Vector((b[0], b[1], z0 if zb0 is None else zb0))
        C = Vector((b1[0], b1[1], z1 if zb1 is None else zb1))
        D = Vector((a1[0], a1[1], z1))
        if isinstance(mat, str):
            self.poly([A, Bv, C, D], mat, n=n)
            return
        e = Vector((b[0] - a[0], b[1] - a[1], 0))
        L = e.length
        if L < 1e-6:
            return
        e /= L
        if urange is None:
            urange = (0.0, max(1, round(L / mat.bay)) / mat.cols)
        us = (urange[1] - urange[0]) / L
        up = (D - A) - e * (D - A).dot(e)
        Hs = up.length
        if Hs < 1e-6:
            return
        up /= Hs
        nf = max(1, round(Hs / mat.floor)) if vfloors is None else vfloors
        vs = nf / mat.rows / Hs
        uv = lambda p: ((p - A).dot(e) * us + urange[0], (p - A).dot(up) * vs + v0)
        self.poly([A, Bv, C, D], mat, [uv(A), uv(Bv), uv(C), uv(D)], n=n)

    def ring(self, poly, z0, z1, mat, poly1=None, smooth=False, skip=(), only=None, vfloors=None, v0=0.0, thr=25.0, inward=False, closed=True, z1s=None):
        n = len(poly)
        poly1 = poly1 or poly
        if not closed:
            skip = set(skip) | {n - 1}
        idx = [i for i in range(n) if i not in skip and (only is None or i in only)]
        norms = None
        if smooth:
            fn = []
            for i in range(n):
                a, b = poly[i], poly[(i + 1) % n]
                a1, b1 = poly1[i], poly1[(i + 1) % n]
                v = (Vector((b[0], b[1], z0)) - Vector((a[0], a[1], z0))).cross(Vector((a1[0], a1[1], z1)) - Vector((a[0], a[1], z0)))
                if v.length < 1e-9:
                    v = (Vector((b1[0], b1[1], z1)) - Vector((a1[0], a1[1], z1))).cross(Vector((a1[0], a1[1], z1)) - Vector((a[0], a[1], z0)))
                fn.append(v.normalized() if v.length > 1e-9 else Vector((0, 0, 1)))
            vn = []
            for i in range(n):
                p, q = fn[i - 1], fn[i]
                vn.append((p + q).normalized() if p.angle(q) < math.radians(thr + 20) else None)
            if not closed:
                vn[0] = vn[n - 1] = None
            norms = (fn, vn)
        ur = {}
        if not isinstance(mat, str):
            lens = [math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]) for i in range(n)]
            ang = [math.atan2(poly[(i + 1) % n][1] - poly[i][1], poly[(i + 1) % n][0] - poly[i][0]) for i in range(n)]
            brk = []
            for i in range(n):
                d = abs((ang[i] - ang[i - 1] + math.pi) % (2 * math.pi) - math.pi)
                if d > math.radians(thr) or lens[i] < 1e-6 or lens[i - 1] < 1e-6 or (not closed and i in (0, n - 1)):
                    brk.append(i)
            starts = brk or [0]
            for si, s in enumerate(starts):
                e = starts[(si + 1) % len(starts)]
                run = []
                i = s
                while True:
                    run.append(i)
                    i = (i + 1) % n
                    if i == e:
                        break
                if not closed:
                    run = [i for i in run if i != n - 1]
                tot = sum(lens[i] for i in run)
                if tot < 1e-6:
                    continue
                U = max(1, round(tot / mat.bay)) / mat.cols
                acc = 0.0
                for i in run:
                    ur[i] = (acc / tot * U, (acc + lens[i]) / tot * U)
                    acc += lens[i]
        for i in idx:
            j = (i + 1) % n
            nn = None
            if norms:
                fn, vn = norms
                na, nb = vn[i] or fn[i], vn[j] or fn[i]
                nn = [na, nb, nb, na]
            za, zb = (z1s[i], z1s[j]) if z1s else (z1, None)
            if inward:
                self.wall(poly[j], poly[i], z0, zb if z1s else z1, mat, poly1[j], poly1[i], urange=ur.get(i), vfloors=vfloors, v0=v0, zb1=za if z1s else None)
            else:
                self.wall(poly[i], poly[j], z0, za, mat, poly1[i], poly1[j], urange=ur.get(i), n=nn, vfloors=vfloors, v0=v0, zb1=zb)

    def cap(self, poly, z, mat, down=False, zs=None):
        pts = [(p[0], p[1], z if zs is None else zs[i]) for i, p in enumerate(poly)]
        self.poly(pts[::-1] if down else pts, mat)

    def prism(self, poly, z0, z1, mat, top='roof', poly1=None, bottom=None, **kw):
        self.ring(poly, z0, z1, mat, poly1=poly1, **kw)
        if top:
            self.cap(poly1 or poly, z1, top)
        if bottom:
            self.cap(poly, z0, bottom, down=True)

    def box(self, x0, x1, y0, y1, z0, z1, mat, top=True, bottom=False):
        self.prism(rect2(x0, x1, y0, y1), z0, z1, mat, top=mat if (top and isinstance(mat, str)) else (top if top is not True else 'roof'),
                   bottom=mat if bottom else None)

    def cbox(self, cx, cy, w, d, z0, z1, mat, top=True, bottom=False):
        self.box(cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z0, z1, mat, top, bottom)

    def attach(self, a, b, s0, s1, z0, z1, dep, mat, a1=None, b1=None, back=0.0, top=True, bottom=True, frac=False):
        """Box stuck on the wall a->b: from s0 to s1 metres along the wall measured from its middle (frac: 0..1 along it),
        z0..z1, projecting dep outward (back: start that far inside the wall plane)."""
        a1, b1 = a1 or a, b1 or b

        def at(s, top_):
            p, q = (a1, b1) if top_ else (a, b)
            L = math.hypot(q[0] - p[0], q[1] - p[1]) or 1.0
            t = s if frac else 0.5 + s / L
            return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
        o = _n2(a, b)
        l0, r0, l1, r1 = at(s0, False), at(s1, False), at(s0, True), at(s1, True)
        P = lambda p, k, z: Vector((p[0] + o[0] * k, p[1] + o[1] * k, z))
        bk = -back
        self.poly([P(l0, bk, z0), P(l0, dep, z0), P(l1, dep, z1), P(l1, bk, z1)], mat)   # left side
        self.poly([P(l0, dep, z0), P(r0, dep, z0), P(r1, dep, z1), P(l1, dep, z1)], mat)  # front
        self.poly([P(r0, dep, z0), P(r0, bk, z0), P(r1, bk, z1), P(r1, dep, z1)], mat)   # right side
        if top:
            self.poly([P(l1, bk, z1), P(l1, dep, z1), P(r1, dep, z1), P(r1, bk, z1)], mat)
        if bottom and z0 > 0.01:
            self.poly([P(l0, bk, z0), P(r0, bk, z0), P(r0, dep, z0), P(l0, dep, z0)], mat)

    def fins(self, poly, z0, z1, mat, spacing=None, n=None, w=0.4, dep=0.4, poly1=None, edges=None, minlen=2.0, ends=False, top=False, back=0.0, lo=None):
        """Vertical piers / mullion fins along every edge (bay lines). lo: in LOD1 keep every lo-th fin (None: none)."""
        if not self.hi:
            if lo is None:
                return
            spacing = spacing * lo if spacing else None
            n = max(1, round(n / lo)) if n else None
        m = len(poly)
        poly1 = poly1 or poly
        for i in range(m):
            if edges is not None and i not in edges:
                continue
            a, b = poly[i], poly[(i + 1) % m]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < minlen:
                continue
            k = n or max(1, round(L / spacing))
            wf = w / L
            for j in range(0 if ends else 1, k + (1 if ends else 0)):
                t = min(max(j / k, wf / 2), 1 - wf / 2)
                self.attach(a, b, t - wf / 2, t + wf / 2, z0, z1, dep, mat, poly1[i], poly1[(i + 1) % m], back=back, top=top, bottom=False, frac=True)

    def band(self, poly, z, h, dep, mat, top=True, bottom=True, edges=None, inner=None):
        """Horizontal ledge / cornice ring projecting dep from the polygon."""
        outer = offset(poly, dep)
        inner = inner or poly
        m = len(poly)
        for i in range(m):
            if edges is not None and i not in edges:
                continue
            j = (i + 1) % m
            self.wall(outer[i], outer[j], z, z + h, mat)
            if top:
                self.poly([(inner[i][0], inner[i][1], z + h), (outer[i][0], outer[i][1], z + h), (outer[j][0], outer[j][1], z + h), (inner[j][0], inner[j][1], z + h)], mat)
            if bottom and z > 0.01:
                self.poly([(inner[i][0], inner[i][1], z), (inner[j][0], inner[j][1], z), (outer[j][0], outer[j][1], z), (outer[i][0], outer[i][1], z)], mat)

    def parapet(self, poly, z, h, t, mat, roof=None):
        inner = offset(poly, -t)
        self.ring(poly, z, z + h, mat)
        m = len(poly)
        for i in range(m):
            j = (i + 1) % m
            self.poly([(inner[i][0], inner[i][1], z + h), (poly[i][0], poly[i][1], z + h), (poly[j][0], poly[j][1], z + h), (inner[j][0], inner[j][1], z + h)], mat)
        self.ring(inner, z, z + h, mat, inward=True)
        if roof:
            self.cap(inner, z + 0.02, roof)

    def beam(self, p0, p1, w, mat, d=None, caps=False):
        p0, p1 = Vector(p0), Vector(p1)
        ax = p1 - p0
        if ax.length < 1e-6:
            return
        d = d or w
        ref = Vector((0, 0, 1)) if abs(ax.normalized().z) < 0.95 else Vector((1, 0, 0))
        u = ax.cross(ref).normalized() * (w / 2)
        v = ax.cross(u).normalized() * (d / 2)
        c = [u + v, -u + v, -u - v, u - v]
        for i in range(4):
            j = (i + 1) % 4
            self.poly([p0 + c[j], p0 + c[i], p1 + c[i], p1 + c[j]], mat)
        if caps:
            self.poly([p1 + k for k in c], mat)
            self.poly([p0 + k for k in c[::-1]], mat)

    def lathe(self, profile, n, mat, cx=0.0, cy=0.0, ry=1.0, rot0=0.0, smooth=True, cap=True, a0=0.0, a1=360.0):
        """Surface of revolution: profile = [(r, z), ...] bottom to top. ry: Y radius factor (ellipse)."""
        full = abs(a1 - a0) >= 359.9
        k = n if full else n + 1
        angs = [math.radians(a0 + (a1 - a0) * i / n) + rot0 for i in range(k)]
        P = lambda r, z, a: Vector((cx + r * math.cos(a), cy + r * ry * math.sin(a), z))
        for (r0, z0), (r1, z1) in zip(profile[:-1], profile[1:]):
            dr, dz = r1 - r0, z1 - z0
            for i in range(n):
                a, b = angs[i], angs[(i + 1) % k]
                N = lambda t: Vector((math.cos(t) * dz, math.sin(t) * dz / max(ry, 1e-3), -dr)).normalized()
                nn = [N(a), N(b), N(b), N(a)] if smooth else None
                if r1 < 1e-6:
                    self.poly([P(r0, z0, a), P(r0, z0, b), P(0, z1, a)], mat, n=nn[:3] if nn else None)
                elif r0 < 1e-6:
                    self.poly([P(0, z0, a), P(r1, z1, b), P(r1, z1, a)], mat, n=[nn[0], nn[2], nn[3]] if nn else None)
                else:
                    self.poly([P(r0, z0, a), P(r0, z0, b), P(r1, z1, b), P(r1, z1, a)], mat, n=nn)
        if cap and profile[-1][0] > 1e-6 and full:
            self.poly([P(profile[-1][0], profile[-1][1], a) for a in angs], mat)

    def cyl(self, cx, cy, r, z0, z1, n, mat, r1=None, cap=True):
        self.lathe([(r, z0), (r if r1 is None else r1, z1)], n, mat, cx, cy, cap=cap)

    def pyramid(self, poly, z0, apex, mat):
        m = len(poly)
        for i in range(m):
            a, b = poly[i], poly[(i + 1) % m]
            self.poly([(a[0], a[1], z0), (b[0], b[1], z0), apex], mat)

    def hip(self, x0, x1, y0, y1, z0, h, mat, ridge=None, inset=None):
        """Hipped roof over a rectangle; ridge along the long axis."""
        w, d = x1 - x0, y1 - y0
        ins = inset if inset is not None else min(w, d) / 2
        if w >= d:
            r0, r1 = (x0 + ins, (y0 + y1) / 2, z0 + h), (x1 - ins, (y0 + y1) / 2, z0 + h)
            self.poly([(x0, y0, z0), (x1, y0, z0), r1, r0], mat)
            self.poly([(x1, y1, z0), (x0, y1, z0), r0, r1], mat)
            self.poly([(x1, y0, z0), (x1, y1, z0), r1], mat)
            self.poly([(x0, y1, z0), (x0, y0, z0), r0], mat)
        else:
            r0, r1 = ((x0 + x1) / 2, y0 + ins, z0 + h), ((x0 + x1) / 2, y1 - ins, z0 + h)
            self.poly([(x1, y0, z0), (x1, y1, z0), r1, r0], mat)
            self.poly([(x0, y1, z0), (x0, y0, z0), r0, r1], mat)
            self.poly([(x0, y0, z0), (x1, y0, z0), r0], mat)
            self.poly([(x1, y1, z0), (x0, y1, z0), r1], mat)

    def portal(self, a, b, s, w, h, mat_frame, mat_glass, dep=0.6, t=0.5, canopy=None):
        """Street entrance on wall a->b centred s metres from its middle: dark glass, projecting frame, optional canopy."""
        self.attach(a, b, s - w / 2, s + w / 2, 0.0, h, 0.12, mat_glass, top=False)
        self.attach(a, b, s - w / 2 - t, s - w / 2, 0.0, h + t, dep, mat_frame)
        self.attach(a, b, s + w / 2, s + w / 2 + t, 0.0, h + t, dep, mat_frame)
        self.attach(a, b, s - w / 2, s + w / 2, h, h + t, dep, mat_frame)
        if canopy:
            self.attach(a, b, s - w / 2 - 1.0, s + w / 2 + 1.0, h * 0.62, h * 0.62 + 0.3, canopy, mat_frame)

    # --- finish
    def tris(self):
        return sum(len(f[0]) - 2 for f in self.faces)

    def bounds(self):
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for f in self.faces:
            for p in f[0]:
                for k in range(3):
                    lo[k] = min(lo[k], p[k])
                    hi[k] = max(hi[k], p[k])
        return lo, hi

    def finish(self, shift=None, fit=None, sxy=None):
        lo, hi = self.bounds()
        if shift is None:
            shift = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0.0)
        sx = sy = 1.0
        if fit:
            sx, sy = fit[0] / (hi.x - lo.x), fit[1] / (hi.y - lo.y)
        if sxy:
            sx, sy = sxy
        self.sxy = (sx, sy)
        verts, faces, uvs, mats, norms = [], [], [], [], []
        npal = len(self.fac)
        for pts, uv, mi, nn in self.faces:
            c = Vector((0.0, 0.0, 0.0))   # Newell normal (right for concave caps too)
            for k in range(len(pts)):
                p, q = pts[k], pts[(k + 1) % len(pts)]
                c += Vector(((p.y - q.y) * (p.z + q.z), (p.z - q.z) * (p.x + q.x), (p.x - q.x) * (p.y + q.y)))
            if c.length < 1e-10:
                continue
            fnrm = c.normalized()
            base = len(verts)
            for i, p in enumerate(pts):
                verts.append(((p.x + shift[0]) * sx, (p.y + shift[1]) * sy, max(0.0, p.z + shift[2])))
                uvs.append(uv[i])
                norms.append(tuple(nn[i]) if nn else tuple(fnrm))
            faces.append(list(range(base, base + len(pts))))
            mats.append(npal if mi < 0 else mi)
        # per-material boxes; a LOD1 twin is pinned to the LOD0 boxes (the game compares them primitive by primitive)
        def mboxes():
            bx = {}
            for f, m in zip(faces, mats):
                lo_, hi_ = bx.setdefault(m, ([1e9] * 3, [-1e9] * 3))
                for vi in f:
                    for k in range(3):
                        lo_[k] = min(lo_[k], verts[vi][k])
                        hi_[k] = max(hi_[k], verts[vi][k])
            return bx
        bx = mboxes()
        ref = getattr(self, 'ref_boxes', None)
        if ref:
            diag = math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
            for m, (rlo, rhi) in ref.items():
                clo, chi = bx.get(m, (rhi, rlo))
                if max(abs(rlo[k] - clo[k]) for k in range(3)) > 0.01 * diag or max(abs(rhi[k] - chi[k]) for k in range(3)) > 0.01 * diag:
                    for c, sg in ((rlo, 1), (rhi, -1)):   # 3 cm anchor triangles at the LOD0 box corners
                        base = len(verts)
                        verts += [(c[0], c[1], c[2]), (c[0] + 0.03 * sg, c[1], c[2]), (c[0], c[1] + 0.03 * sg, c[2])]
                        uvs += [self.puv(next(iter(self.pal))) if m == npal else (0.0, 0.0)] * 3
                        norms += [(0.0, 0.0, 1.0)] * 3
                        faces.append([base, base + 1, base + 2])
                        mats.append(m)
        self.boxes = bx
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(verts, [], faces)
        uvl = me.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', np.array(uvs, np.float32).ravel())
        me.polygons.foreach_set('material_index', mats)
        me.polygons.foreach_set('use_smooth', [True] * len(faces))
        me.update()
        me.normals_split_custom_set(norms)
        for t in self.fac:
            me.materials.append(t.material())
        me.materials.append(self._palette_material())
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        me.calc_loop_triangles()
        self.ntris = len(me.loop_triangles)
        self.shift = shift
        self.size = ((hi.x - lo.x) * sx, hi.z, (hi.y - lo.y) * sy)
        self.ob = ob
        return ob

    def _palette_material(self):
        base = np.zeros((256, 256, 3), np.float32)
        orm = np.zeros((256, 256, 3), np.float32)
        base[:] = (0.5, 0.5, 0.5)
        orm[:] = (1.0, 0.7, 0.0)
        emi = np.zeros((256, 256, 3), np.float32)
        for nm, (i, rgb, rough, metal, em) in self.pal.items():
            r, c = i // 16, i % 16
            y0 = 256 - (r + 1) * 16
            base[y0:y0 + 16, c * 16:(c + 1) * 16] = rgb
            orm[y0:y0 + 16, c * 16:(c + 1) * 16] = (1.0, rough, metal)
            emi[y0:y0 + 16, c * 16:(c + 1) * 16] = em
        emii = _save(self.name + '_emis', emi, f'{TEXDIR}/{self.name}_emis.png', 'PNG', 'sRGB')
        pal = _save(self.name + '_pal', base, f'{TEXDIR}/{self.name}_pal.png', 'PNG', 'sRGB')
        ormi = _save(self.name + '_orm', orm, f'{TEXDIR}/{self.name}_orm.png', 'PNG', 'Non-Color')
        m = bpy.data.materials.new(self.name + '_palette')
        m.use_nodes = True
        m.use_backface_culling = not self.double_sided
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = pal
        t.interpolation = 'Closest'
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        o = nt.nodes.new('ShaderNodeTexImage')
        o.image = ormi
        o.interpolation = 'Closest'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        e = nt.nodes.new('ShaderNodeTexImage')
        e.image = emii
        e.interpolation = 'Closest'
        nt.links.new(e.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
        return m


# ------------------------------------------------------------------ lattice helpers (sparse strip geometry; the palette is double sided)
def _strip(self, p0, p1, w, mat, ref=None, nrm=None):
    """Flat strip p0 -> p1, w wide, lying in the plane through ref (or with normal nrm)."""
    p0, p1 = Vector(p0), Vector(p1)
    ax = p1 - p0
    if ax.length < 1e-6:
        return
    n = Vector(nrm) if nrm is not None else ax.cross(Vector(ref) - p0)
    if n.length < 1e-9:
        n = Vector((0, 0, 1))
    n.normalize()
    s = ax.cross(n).normalized() * (w / 2)
    self.poly([p0 - s, p0 + s, p1 + s, p1 - s], mat, n=[n] * 4)


def _qlat(self, p00, p10, p01, p11, nx, mat, w=0.6, horiz=True, vert=True, wh=None, x=True, flip=False):
    """Lattice panel on the quad p00 p10 (bottom) p01 p11 (top): nx X-braced bays, top horizontal, bay verticals."""
    p00, p10, p01, p11 = Vector(p00), Vector(p10), Vector(p01), Vector(p11)
    n = (p10 - p00).cross(p01 - p00)
    if n.length < 1e-9:
        n = (p11 - p01).cross(p01 - p00)
    n.normalize()
    B = lambda t: p00 + (p10 - p00) * t
    T = lambda t: p01 + (p11 - p01) * t
    for i in range(nx):
        t0, t1 = i / nx, (i + 1) / nx
        if x or (i % 2 == 0) != flip:
            self.strip(B(t0), T(t1), w, mat, nrm=n)
        if x or (i % 2 == 1) != flip:
            self.strip(B(t1), T(t0), w, mat, nrm=n)
        if vert and i:
            self.strip(B(t0), T(t0), w, mat, nrm=n)
    if horiz:
        self.strip(p01, p11, wh or w * 1.3, mat, nrm=n)


Builder.strip = _strip
Builder.qlat = _qlat



# ------------------------------------------------------------------ facade presets
def curtain(name, glass, wall=(.74, .76, .78), bay=1.5, floor=4.2, cols=8, rows=16, seed=1, **kw):
    """Glass curtain wall: full-bay panes, thin mullions, a spandrel line each floor."""
    d = dict(cols=cols, rows=rows, bay=bay, floor=floor, size=(256, 512), wall=wall, glass=glass, wx=(.06, .94), wy=(.2, .97), frame_px=0,
             blind=.1, lit=0, rough=.26, grad=.14, glass_var=.07, shadow=.78, seed=seed)
    d.update(kw)
    return Tex(name, **d)


def punched(name, wall, glass=(.2, .23, .27), bay=3.2, floor=3.9, cols=8, rows=16, seed=1, **kw):
    """Masonry / panel wall with punched windows."""
    d = dict(cols=cols, rows=rows, bay=bay, floor=floor, size=(256, 512), wall=wall, glass=glass, wx=(.2, .8), wy=(.28, .82), blind=.25, lit=0,
             rough=.6, noise=.035, seed=seed)
    d.update(kw)
    return Tex(name, **d)


def interp(tab, z):
    if z <= tab[0][0]:
        return tab[0][1]
    for (z0, v0), (z1, v1) in zip(tab[:-1], tab[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return tab[-1][1]


def lin(a, b, n):
    return [a + (b - a) * i / n for i in range(n + 1)]


def floorbands(b, P, z0, z1, step, mat, h=0.35, dep=0.3, lo=None, **kw):
    """Horizontal ledges every step metres (LOD1: every lo-th, or none)."""
    if not b.hi:
        if not lo:
            return
        step *= lo
    z = z0 + step
    while z < z1 - 0.5:
        b.band(P, z, h, dep, mat, **kw)
        z += step


def slope_crown(b, P, z0, hf, T, capm, xs=None):
    """Walls rising from z0 to the sloping roof z = hf((x, y)); xs: x of a ridge that splits the roof into two planes."""
    parts = [P] if xs is None else [clip(P, 1, 0, xs), clip(P, -1, 0, -xs)]
    for Q in parts:
        zs = [hf(p) for p in Q]
        skip = set() if xs is None else {i for i in range(len(Q)) if abs(Q[i][0] - xs) < 1e-6 and abs(Q[(i + 1) % len(Q)][0] - xs) < 1e-6}
        b.ring(Q, z0, None, T, z1s=zs, skip=skip)
        b.cap(Q, 0, capm, zs=zs)



# ------------------------------------------------------------------ scene / export / render
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(ob, path, materials=True):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT' if materials else 'NONE', export_image_format='AUTO',
                              export_cameras=False, export_lights=False, export_animations=False, export_skins=False,
                              export_morph=False, export_extras=False, export_vertex_color='NONE')


def _look(cam, eye, target):
    cam.location = eye
    d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def render_sheet(ob, name, size, tier='B', extra=None):
    """Contact sheet: 3/4 aerial, street-level 3/4, crown close-up (+ back 3/4)."""
    sc = bpy.context.scene
    w, h, d = size
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 6
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 2
    sc.render.threads_mode = 'AUTO'
    sc.render.resolution_x, sc.render.resolution_y = 352, 480
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(27)
    sky.sun_rotation = math.radians(-215)  # sun from the front-left
    sky.sun_intensity = 0.6
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.085
    # ground
    gm = bpy.data.meshes.new('ground')
    s = 3000
    gm.from_pydata([(-s, -s, -0.02), (s, -s, -0.02), (s, s, -0.02), (-s, s, -0.02)], [], [(0, 1, 2, 3)])
    go = bpy.data.objects.new('ground', gm)
    mat = bpy.data.materials.new('ground')
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.16, 0.16, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    gm.materials.append(mat)
    sc.collection.objects.link(go)
    cd = bpy.data.cameras.new('cam')
    cd.clip_end = 5000
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    R = math.hypot(w, d) / 2
    views = []
    # aerial 3/4 from the front-right (portrait frame: the 36 mm sensor is the vertical side)
    def fit(lens, hh, rr):
        fv = math.atan(18 / lens)
        fh = math.atan(18 * 440 / 600 / lens)
        return max(hh / math.tan(fv), rr / math.tan(fh)) * 1.12
    az, el = math.radians(-58), math.radians(20)
    dist = fit(50, h / 2 * math.cos(el) + R * math.sin(el), R)
    eye = (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), h * 0.5 + dist * math.sin(el))
    views.append(('aerial', 50, eye, (0, 0, h * 0.5)))
    # street level from the front-left
    az = math.radians(-112)
    ds = max(w, d) * 0.9 + 22
    views.append(('street', 20, (ds * math.cos(az), ds * math.sin(az), 2.2), (0, 0, min(h * 0.3, 26))))
    # crown close-up
    az = math.radians(-62)
    top = max(h * 0.24, 16)
    el = math.radians(10)
    dc = fit(60, top / 2 + R * 0.2, R * 0.8)
    views.append(('crown', 60, (dc * math.cos(el) * math.cos(az), dc * math.cos(el) * math.sin(az), h - top * 0.5 + dc * math.sin(el)), (0, 0, h - top * 0.5)))
    if extra:
        views += extra
    az, el = math.radians(-118), math.radians(14)
    dist = fit(50, h / 2 * math.cos(el) + R * math.sin(el), R)
    views.append(('dusk', 50, (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), h * 0.5 + dist * math.sin(el)), (0, 0, h * 0.5)))
    imgs = []
    for vn, lens, eye, tgt in views:
        cd.lens = lens
        bg.inputs['Strength'].default_value = 0.004 if vn == 'dusk' else 0.085
        for m_ in ob.data.materials:   # day views without the emissive, the dusk view with it
            m_.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0 if vn == 'dusk' else 0.0
        _look(cam, eye, tgt)
        sc.render.filepath = f'{RENDER}/_{name}_{vn}.png'
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(sc.render.filepath)
        a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
        im.pixels.foreach_get(a)
        imgs.append(a.reshape(im.size[1], im.size[0], 4)[..., :3])
        bpy.data.images.remove(im)
        os.remove(sc.render.filepath)
    sheet = np.concatenate(imgs, 1)
    out = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0], alpha=False)
    px = np.ones((sheet.shape[0], sheet.shape[1], 4), np.float32)
    px[..., :3] = sheet
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = f'{RENDER}/{name}.png'
    out.file_format = 'PNG'
    out.save()
    return out.filepath_raw


def lobby(b, P, zb, edge=0, w=6.0, h=4.2, glass='glass', frame='steel', pier='pier', spacing=6.0, inset=0.8, pw=0.9, dep=None):
    """Recessed glass ground floor with piers on the building line and an entrance on the given edge."""
    Pi = offset(P, -inset)
    b.ring(Pi, 0, zb, glass)
    b.cap(P, zb, pier, down=True)
    if b.hi:
        b.fins(Pi, 0, zb, pier, spacing=spacing, w=pw, dep=inset if dep is None else dep, ends=True, minlen=4)
        a, c = Pi[edge], Pi[(edge + 1) % len(Pi)]
        b.portal(a, c, 0.0, w, h, frame, glass, dep=inset * 0.9, canopy=inset * 0.95)



# ------------------------------------------------------------------ model registry / runner
MODELS = {}


def model(mid, tier, height, face='south', stone=0x808080, desc='', ids=None, plan=None, swap=False, note='', fit=True, facelock=False):
    def deco(fn):
        MODELS[mid] = dict(id=mid, tier=tier, height=height, face=face, stone=stone, desc=desc, ids=ids, fn=fn, plan=plan, swap=swap, note=note, fit=fit, facelock=facelock)
        return fn
    return deco


def load_sites():
    try:
        with open(SITES_JSON) as f:
            d = json.load(f)
        d = d.get('sites', d) if isinstance(d, dict) else d
        return {x['id']: x for x in d} if isinstance(d, list) else d
    except Exception:
        return {}


def compass(bearing):
    return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][int(((bearing % 360) + 22.5) // 45) % 8]


def std(b, lobby=(1.0, .78, .50)):
    """Palette cells every dusk model shares: lit lobby / deck glass, a cool lit band, red aircraft warning light."""
    b.glow(lobby=(.27, .30, .32, lobby[0] * .62, lobby[1] * .62, lobby[2] * .62, .3), lit=(.34, .32, .28, 1.0, .82, .56, .3),
           litc=(.30, .33, .36, .70, .85, 1.0, .3), dim=(.22, .23, .24, .30, .24, .15, .3), red=(.45, .07, .05, 1.0, .10, .05, .4))


def beacons(b, pts, s=1.1):
    """Red aircraft warning lights: small boxes at (x, y, z)."""
    for x, y, z in pts:
        b.cbox(x, y, s, s, z, z + s, 'red')


def corners(poly, inset=1.0):
    return offset(poly, -inset)


def plant(b, P, z, h, mat='steel', k=0.6, roof='roof', dx=0.0, dy=0.0):
    """Set-back roof plant screen."""
    q = move(scale(P, k), dx, dy)
    b.prism(q, z, z + h, mat, top=roof)
    return q


def run(argv=None):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    render = '--norender' not in argv
    want = [a for a in argv if not a.startswith('--')]
    summ_path = SCR + '/summary.json'
    sites = load_sites()
    for mid, M in MODELS.items():
        if want and mid not in want:
            continue
        t0 = time.time()
        info = {}
        shift = None
        sxy = None
        site = sites.get(M['ids'][0] if M['ids'] else mid) or sites.get(mid)
        for lod in (0, 1):
            reset()
            b = Builder(mid, lod)
            if lod:
                b.ref_boxes = ref_boxes
            else:   # fit the plan to the real footprint when it is close to the built one (never the lattice towers)
                M['fn'](b)
                lo, hi = b.bounds()
                w0, d0 = hi.x - lo.x, hi.y - lo.y
                info['built'] = [round(w0, 1), round(d0, 1)]
                if site and site.get('wMetres') and site.get('dMetres'):
                    ws, ds = site['wMetres'], site['dMetres']
                    if M['swap']:
                        ws, ds = ds, ws
                    info['site'] = [ws, ds]
                    if M.get('fit', True) and 0.8 <= ws / w0 <= 1.25 and 0.8 <= ds / d0 <= 1.25:
                        sxy = (ws / w0, ds / d0)
                    info['fitted'] = bool(sxy)
                b = Builder(mid, lod)
            M['fn'](b)
            if sxy and shift is None:   # centre before scaling
                lo, hi = b.bounds()
                shift = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0.0)
            ob = b.finish(shift=shift, sxy=sxy)
            shift = b.shift
            if not lod:
                ref_boxes = b.boxes
            path = f'{OUT}/{mid}{"_lod1" if lod else ""}.glb'
            export(ob, path, materials=True)
            if lod:
                subprocess.run(['node', REPO + '/tools/tokyo/design/towers_strip.mjs', path], check=True, cwd=REPO)
            info[f'tris{lod}'] = b.ntris
            info[f'size{lod}'] = [round(v, 3) for v in b.size]
            info[f'kb{lod}'] = round(os.path.getsize(path) / 1024, 1)
            if lod == 0 and render:
                render_sheet(ob, mid, b.size, M['tier'])
        face = M['face']
        if site and site.get('frontBearing') is not None and not M.get('facelock'):
            face = compass(site['frontBearing'])
        info.update(tier=M['tier'], face=face, stone=M['stone'], desc=M['desc'], ids=M['ids'], height=M['height'], swap=M['swap'], note=M['note'])
        try:
            with open(summ_path) as f:
                summ = json.load(f)
        except Exception:
            summ = {}
        summ[mid] = info
        with open(summ_path, 'w') as f:
            json.dump(summ, f, indent=1)
        r = info['tris1'] / max(1, info['tris0'])
        print(f"BUILT {mid} tier {M['tier']} size {info['size0']} (want h {M['height']}) tris {info['tris0']} / {info['tris1']} ({r:.0%}) "
              f"kb {info['kb0']} / {info['kb1']} site {info.get('site')} fit {info.get('fitted')}  {time.time() - t0:.1f}s", flush=True)
