# far_lib.py - shared mesh builder / exporter for the San Francisco "far" design set
# (vehicles, street props, water craft, set pieces).  Runs inside Blender 4.5:
#   blender -b -P tools/sf/design/far_vehicles.py -- [name ...]
# Model code works in the glTF frame: +X right, +Y up, +Z front (metres).  Every face gets ONE
# palette cell (a 16 px cell of a 256 px atlas) so there is no texture stretching; vertices are
# never shared between colours, so LOD decimation cannot smear UVs.
import bpy, math, os, sys, json, struct, zlib
from collections import defaultdict
from contextlib import contextmanager
from math import sin, cos, pi, radians
import numpy as np
from mathutils import Vector, Matrix

ROOT = '/home/user/Kaiju'
OUT = ROOT + '/assets/buildings/sf'
SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/design_far'
os.makedirs(OUT, exist_ok=True)
os.makedirs(SCR + '/tex', exist_ok=True)
os.makedirs(SCR + '/stats', exist_ok=True)

GRID = 16  # palette cells per side
TEX = 256


def write_png(path, arr):
    h, w, c = arr.shape
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, {3: 2, 4: 6}[c], 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def hx(h):
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


# Special colour names -> separate (untextured) materials, as Seattle's police car
EXTRA_MATS = {
    'LB_RED': ('lightbar_red', (0.55, 0.05, 0.05), (0.6, 0.03, 0.03)),
    'LB_BLUE': ('lightbar_blue', (0.05, 0.12, 0.55), (0.03, 0.12, 0.6)),
}


class B:
    """Face-soup builder.  pal: ordered {name: (hex, rough, metal[, emissive hex])}."""

    def __init__(s, name, pal, lod=0):
        s.name, s.lod, s.hi = name, lod, lod == 0
        s.pal = pal
        s.F = []  # (pts, col, smooth_deg|None, pid)
        s.pid = 0
        s.M = [Matrix.Identity(4)]

    # ---------------------------------------------------------------- transforms
    @contextmanager
    def at(s, x=0, y=0, z=0, ry=0, rx=0, rz=0, sc=(1, 1, 1)):
        if isinstance(sc, (int, float)):
            sc = (sc, sc, sc)
        m = (Matrix.Translation((x, y, z)) @ Matrix.Rotation(radians(ry), 4, 'Y') @ Matrix.Rotation(radians(rx), 4, 'X')
             @ Matrix.Rotation(radians(rz), 4, 'Z') @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1)))
        s.M.append(s.M[-1] @ m)
        try:
            yield
        finally:
            s.M.pop()

    def mirx(s):
        for sx in (1, -1):
            s.M.append(s.M[-1] @ Matrix.Diagonal((sx, 1, 1, 1)))
            yield sx
            s.M.pop()

    def mirz(s):
        for sz in (1, -1):
            s.M.append(s.M[-1] @ Matrix.Diagonal((1, 1, sz, 1)))
            yield sz
            s.M.pop()

    def n(s, k, nl=None):
        """Segment count for the current LOD."""
        if s.hi:
            return k
        if nl:
            return nl
        return 8 if k >= 10 else 4 if k >= 6 else k

    # ---------------------------------------------------------------- faces
    def face(s, pts, col, smooth=None):
        assert col in s.pal or col in EXTRA_MATS, 'unknown colour ' + str(col)
        m = s.M[-1]
        P = []
        for p in pts:
            q = m @ Vector(p)
            if not P or (q - P[-1]).length > 1e-6:
                P.append(q)
        if len(P) > 1 and (P[0] - P[-1]).length <= 1e-6:
            P.pop()
        if len(P) < 3:
            return
        if m.determinant() < 0:
            P.reverse()
        s.F.append((P, col, smooth, s.pid))

    def quad(s, a, b_, c, d, col, smooth=None):
        s.pid += 1
        s.face([a, b_, c, d], col, smooth)

    def poly(s, pts, col):
        s.pid += 1
        s.face(pts, col)

    # ---------------------------------------------------------------- loft family
    def loft(s, rings, col, closed=True, caps=3, capcol=None, smooth=None, flip=None):
        """rings: list of equal-length point lists.  col: name | [per segment i] | f(k, i) -> name|None.
        caps: bit 1 = first ring, bit 2 = last ring."""
        s.pid += 1
        rings = [[Vector(p) for p in r] for r in rings]
        K, N = len(rings), len(rings[0])
        fs = []
        for k in range(K - 1):
            for i in range(N if closed else N - 1):
                j = (i + 1) % N
                c = col(k, i) if callable(col) else (col[i] if isinstance(col, (list, tuple)) else col)
                fs.append(([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], c, smooth))
        if capcol is None:
            capcol = col if isinstance(col, str) else (col[0] if isinstance(col, (list, tuple)) else None)
        c0, c1 = (capcol if isinstance(capcol, (list, tuple)) else (capcol, capcol))
        cf = [(list(reversed(rings[0])), c0, None), (list(rings[-1]), c1, None)]
        if flip is None:
            flip = False
            if closed:
                ctr = sum((p for r in rings for p in r), Vector()) / (K * N)
                vol = 0.0
                for P, _, _ in fs + cf:
                    for t in range(1, len(P) - 1):
                        vol += (P[0] - ctr).dot((P[t] - ctr).cross(P[t + 1] - ctr))
                flip = vol < 0
        out = fs + ([cf[0]] if caps & 1 else []) + ([cf[1]] if caps & 2 else [])
        for P, c, sm in out:
            if c is None:
                continue
            s.face(list(reversed(P)) if flip else P, c, sm)

    def cyl(s, p0, p1, r0, r1=None, n=8, col='', caps=3, capcol=None, smooth=50, nl=None, ph=0.0, sq=1.0):
        """Cylinder / cone between two points.  sq: squash of the second radial axis (ellipse)."""
        r1 = r0 if r1 is None else r1
        n = s.n(n, nl)
        p0, p1 = Vector(p0), Vector(p1)
        ax = (p1 - p0).normalized()
        u = Vector((1, 0, 0)) if abs(ax.y) > 0.9 else Vector((0, 1, 0))
        u = (u - ax * u.dot(ax)).normalized()
        v = ax.cross(u)
        rings = [[p + (u * cos(ph + 2 * pi * i / n) + v * sq * sin(ph + 2 * pi * i / n)) * r for i in range(n)]
                 for p, r in ((p0, r0), (p1, r1))]
        s.loft(rings, col, caps=caps, capcol=capcol, smooth=smooth)

    def tube(s, pts, r, n=4, col='', caps=3, smooth=50, closed_path=False, up=None, ph=0.0):
        """Round tube along a polyline (mitred).  r may be a list per point."""
        pts = [Vector(p) for p in pts]
        K = len(pts)
        rr = r if isinstance(r, (list, tuple)) else [r] * K
        rings = []
        prev_u = None
        for k in range(K):
            a = pts[k] - pts[k - 1] if k > 0 else None
            c = pts[k + 1] - pts[k] if k < K - 1 else None
            if closed_path:
                a = pts[k] - pts[k - 1]
                c = pts[(k + 1) % K] - pts[k]
            t = ((a.normalized() if a else Vector()) + (c.normalized() if c else Vector())).normalized()
            if prev_u is None:
                h = Vector(up) if up else (Vector((1, 0, 0)) if abs(t.y) > 0.9 else Vector((0, 1, 0)))
            else:
                h = prev_u
            u = (h - t * h.dot(t)).normalized()
            v = t.cross(u)
            prev_u = u
            # mitre scale
            ms = 1.0
            if a and c:
                ca = a.normalized().dot(t)
                ms = 1.0 / max(ca, 0.5)
            rings.append([pts[k] + (u * cos(ph + 2 * pi * i / n) + v * sin(ph + 2 * pi * i / n)) * rr[k] * ms for i in range(n)])
        if closed_path:
            rings.append(rings[0])
            caps = 0
        s.loft(rings, col, caps=caps, smooth=smooth)

    def prism(s, poly2, plane, a0, a1, col, capcol=None, caps=3, smooth=None):
        """Extrude a 2D polygon.  plane 'z': (u,v)=(x,y) along z; 'x': (u,v)=(z,y) along x; 'y': (u,v)=(x,z) along y."""
        def P(u, v, a):
            return {'z': (u, v, a), 'x': (a, v, u), 'y': (u, a, v)}[plane]
        rings = [[P(u, v, a) for u, v in poly2] for a in (a0, a1)]
        s.loft(rings, col, caps=caps, capcol=capcol if capcol else (col if isinstance(col, str) else col[0]), smooth=smooth)

    def lathe(s, prof, n=8, col='', caps=3, smooth=50, nl=None, capcol=None, ph=0.0, sx=1.0, sz=1.0):
        """Revolve [(r, y)] about the local Y axis."""
        n = s.n(n, nl)
        rings = [[(r * cos(ph + 2 * pi * i / n) * sx, y, -r * sin(ph + 2 * pi * i / n) * sz) for i in range(n)] for r, y in prof]
        cc = (lambda k, i: col[k]) if isinstance(col, (list, tuple)) else col
        s.loft(rings, cc, caps=caps, smooth=smooth, capcol=capcol or (col if isinstance(col, str) else col[0]))

    def sphere(s, c, r, n=8, m=4, col='', nl=None, y0=-1.0, y1=1.0, smooth=80):
        """Ellipsoid; r scalar or (rx, ry, rz).  y0..y1 clip the latitude range (-1..1)."""
        rx, ry, rz = (r, r, r) if isinstance(r, (int, float)) else r
        if not s.hi:
            m = max(2, m // 2 + (m % 2))
        a0, a1 = math.asin(y0), math.asin(y1)
        prof = [(cos(a0 + (a1 - a0) * k / m), sin(a0 + (a1 - a0) * k / m)) for k in range(m + 1)]
        with s.at(c[0], c[1], c[2], sc=(rx, ry, rz)):
            s.lathe(prof, n, col, smooth=smooth, nl=nl)

    # ---------------------------------------------------------------- boxes
    def hexa(s, c, col, skip='', **fc):
        """8 corners: 0-3 ring A, 4-7 ring B (same order).  Faces d (ring A), u (ring B), b r f l (sides 01 12 23 30)."""
        s.pid += 1
        c = [Vector(p) for p in c]
        ctr = sum(c, Vector()) / 8
        for key, idx in (('d', (0, 1, 2, 3)), ('u', (4, 5, 6, 7)), ('b', (0, 1, 5, 4)), ('r', (1, 2, 6, 5)), ('f', (2, 3, 7, 6)), ('l', (3, 0, 4, 7))):
            if key in skip:
                continue
            P = [c[i] for i in idx]
            nrm = Vector()
            for t in range(len(P)):
                a, b_ = P[t], P[(t + 1) % len(P)]
                nrm += Vector(((a.y - b_.y) * (a.z + b_.z), (a.z - b_.z) * (a.x + b_.x), (a.x - b_.x) * (a.y + b_.y)))
            if nrm.dot(sum(P, Vector()) / 4 - ctr) < 0:
                P.reverse()
            s.face(P, fc.get(key, col))

    def box(s, x0, y0, z0, x1, y1, z1, col, skip='', **fc):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        s.hexa([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], col, skip, **fc)

    def bb(s, cx, y0, cz, sx, h, sz, col, skip='', **fc):
        """Box by base centre + size."""
        s.box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + h, cz + sz / 2, col, skip, **fc)

    def tb(s, cx, y0, cz, sx0, sz0, h, sx1, sz1, col, skip='', dx=0.0, dz=0.0, **fc):
        """Tapered box (frustum): base size sx0 x sz0, top size sx1 x sz1 (top centre offset dx, dz)."""
        a, b_ = sx0 / 2, sz0 / 2
        c, d = sx1 / 2, sz1 / 2
        y1 = y0 + h
        s.hexa([(cx - a, y0, cz - b_), (cx + a, y0, cz - b_), (cx + a, y0, cz + b_), (cx - a, y0, cz + b_),
                (cx + dx - c, y1, cz + dz - d), (cx + dx + c, y1, cz + dz - d), (cx + dx + c, y1, cz + dz + d), (cx + dx - c, y1, cz + dz + d)], col, skip, **fc)

    def beam(s, p0, p1, w, h=None, col='', up=None, caps=0, lx=False):
        """Rectangular member between two points (w across, h along 'up').  lx: crossed quads in LOD1."""
        h = w if h is None else h
        p0, p1 = Vector(p0), Vector(p1)
        a = (p1 - p0)
        if a.length < 1e-6:
            return
        a.normalize()
        hint = Vector(up) if up else (Vector((1, 0, 0)) if abs(a.y) > 0.95 else Vector((0, 1, 0)))
        sd = a.cross(hint).normalized()
        u2 = sd.cross(a).normalized()
        if lx and not s.hi:
            s.pid += 1
            s.face([p0 - sd * w / 2, p0 + sd * w / 2, p1 + sd * w / 2, p1 - sd * w / 2], col)
            s.face([p0 - u2 * h / 2, p0 + u2 * h / 2, p1 + u2 * h / 2, p1 - u2 * h / 2], col)
            return
        ring = lambda p: [p - sd * w / 2 - u2 * h / 2, p + sd * w / 2 - u2 * h / 2, p + sd * w / 2 + u2 * h / 2, p - sd * w / 2 + u2 * h / 2]
        s.hexa(ring(p0) + ring(p1), col, skip='' if caps else 'du')

    def grid(s, o, du, dv, us, vs, colfn, merge=True, flip=False):
        """Flat panel: origin o, unit vectors du / dv, breakpoints us / vs; colfn(uc, vc) -> colour|None for the cell
        centred at (uc, vc).  Equal-colour runs are merged along u, then identical rows along v.
        The face normal is du x dv (flip reverses it)."""
        s.pid += 1
        o, du, dv = Vector(o), Vector(du), Vector(dv)
        rows = []
        for j in range(len(vs) - 1):
            runs = []
            for i in range(len(us) - 1):
                c = colfn((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)
                if merge and runs and runs[-1][2] == c:
                    runs[-1][1] = us[i + 1]
                else:
                    runs.append([us[i], us[i + 1], c])
            rows.append([vs[j], vs[j + 1], runs])
        merged = []
        for r in rows:
            if merge and merged and merged[-1][2] == r[2]:
                merged[-1][1] = r[1]
            else:
                merged.append([r[0], r[1], [list(x) for x in r[2]]])
        for v0, v1, runs in merged:
            for u0, u1, c in runs:
                if c is None:
                    continue
                P = [o + du * u0 + dv * v0, o + du * u1 + dv * v0, o + du * u1 + dv * v1, o + du * u0 + dv * v1]
                s.face(list(reversed(P)) if flip else P, c)

    def panel(s, o, du, dv, w, h, col, line, inset=0.07, lw=0.025, flip=False):
        """Rectangular panel with a thin lining rectangle (plain in LOD1)."""
        if not s.hi or w < 2 * (inset + lw) + 0.02 or h < 2 * (inset + lw) + 0.02:
            s.grid(o, du, dv, [0, w], [0, h], lambda u, v: col, flip=flip)
            return
        us = [0, inset, inset + lw, w - inset - lw, w - inset, w]
        vs = [0, inset, inset + lw, h - inset - lw, h - inset, h]

        def f(u, v):
            iu = inset < u < w - inset
            iv = inset < v < h - inset
            core = inset + lw < u < w - inset - lw and inset + lw < v < h - inset - lw
            return line if (iu and iv and not core) else col
        s.grid(o, du, dv, us, vs, f, flip=flip)

    # ---------------------------------------------------------------- whole-model helpers
    def bbox(s):
        pts = [p for f in s.F for p in f[0]]
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        return mn, mx

    def tris(s):
        return sum(len(f[0]) - 2 for f in s.F)

    def settle(s, cx=True, cz=True, y0=True):
        """Translate so the bbox is centred on X / Z and rests on y 0."""
        mn, mx = s.bbox()
        d = Vector((-(mn.x + mx.x) / 2 if cx else 0, -mn.y if y0 else 0, -(mn.z + mx.z) / 2 if cz else 0))
        s.F = [([p + d for p in P], c, sm, pid) for P, c, sm, pid in s.F]

    # ---------------------------------------------------------------- Blender mesh
    def mesh(s):
        cells = {nm: i for i, nm in enumerate(s.pal)}
        extra = [k for k in EXTRA_MATS if any(f[1] == k for f in s.F)]
        if not extra:  # keep slots identical between LODs: look at the palette declaration too
            extra = []
        mat_of = {k: i + 1 for i, k in enumerate(extra)}
        key = lambda p: (round(p.x, 4), round(p.y, 4), round(p.z, 4))
        fn = []
        acc = defaultdict(list)
        good = []
        for P, col, sm, pid in s.F:
            nrm = Vector()
            for t in range(len(P)):
                a, b_ = P[t], P[(t + 1) % len(P)]
                nrm += Vector(((a.y - b_.y) * (a.z + b_.z), (a.z - b_.z) * (a.x + b_.x), (a.x - b_.x) * (a.y + b_.y)))
            if nrm.length < 1e-9:
                continue
            good.append((P, col, sm, pid, nrm))
            if sm:
                for p in P:
                    acc[(pid, key(p))].append(nrm)
        vmap, verts, polys, uvs, mats, norms = {}, [], [], [], [], []
        for P, col, sm, pid, nrm in good:
            N = nrm.normalized()
            idx = []
            for p in P:
                k = (key(p), col, pid if sm else -1)
                if k not in vmap:
                    vmap[k] = len(verts)
                    verts.append((p.x, -p.z, p.y))
                idx.append(vmap[k])
                if sm:
                    ct = cos(radians(sm))
                    tot = Vector()
                    for q in acc[(pid, key(p))]:
                        if q.normalized().dot(N) >= ct:
                            tot += q
                    nn = tot.normalized() if tot.length > 1e-9 else N
                else:
                    nn = N
                norms.append((nn.x, -nn.z, nn.y))
                if col in cells:
                    ci = cells[col]
                    uvs.append(((ci % GRID + 0.5) / GRID, 1 - (ci // GRID + 0.5) / GRID))
                else:
                    uvs.append((0.5 / GRID, 1 - (GRID - 0.5) / GRID))
            if len(set(idx)) < 3:
                del norms[-len(P):]
                del uvs[-len(P):]
                continue
            polys.append(idx)
            mats.append(mat_of.get(col, 0))
        me = bpy.data.meshes.new(s.name)
        me.from_pydata(verts, [], polys)
        uvl = me.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', [c for uv in uvs for c in uv])
        me.polygons.foreach_set('material_index', mats)
        me.polygons.foreach_set('use_smooth', [True] * len(polys))
        me.update()
        me.normals_split_custom_set(norms)
        return me, extra


# -------------------------------------------------------------------- materials / export
def make_material(name, pal):
    n = len(pal)
    assert n <= GRID * GRID, 'palette too large'
    col = np.zeros((TEX, TEX, 3), np.uint8)
    orm = np.zeros((TEX, TEX, 3), np.uint8)
    emi = np.zeros((TEX, TEX, 3), np.uint8)
    col[:] = (128, 128, 128)
    orm[:] = (255, 200, 0)
    has_e = False
    cs = TEX // GRID
    for i, (nm, v) in enumerate(pal.items()):
        x, y = (i % GRID) * cs, (i // GRID) * cs
        col[y:y + cs, x:x + cs] = hx(v[0])
        orm[y:y + cs, x:x + cs] = (255, int(round(v[1] * 255)), int(round(v[2] * 255)))
        if len(v) > 3 and v[3] is not None:
            emi[y:y + cs, x:x + cs] = hx(v[3])
            has_e = True
    paths = {}
    for tag, arr in (('pal', col), ('orm', orm), ('emi', emi)):
        if tag == 'emi' and not has_e:
            continue
        paths[tag] = '%s/tex/%s_%s.png' % (SCR, name, tag)
        write_png(paths[tag], arr)
    mat = bpy.data.materials.new(name + '_palette')
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']

    def tex(tag, cs_name):
        nd = nt.nodes.new('ShaderNodeTexImage')
        img = bpy.data.images.load(paths[tag])
        img.name = '%s_%s' % (name, tag)
        img.colorspace_settings.name = cs_name
        nd.image = img
        nd.interpolation = 'Closest'
        return nd
    nt.links.new(tex('pal', 'sRGB').outputs['Color'], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tex('orm', 'Non-Color').outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if has_e:
        nt.links.new(tex('emi', 'sRGB').outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def make_extra(key):
    nm, base, em = EXTRA_MATS[key]
    mat = bpy.data.materials.new(nm)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.2
    bsdf.inputs['Emission Color'].default_value = (*em, 1)
    bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _export(path, materials):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials=materials, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_animations=False, export_cameras=False, export_lights=False, export_extras=False,
                              export_image_format='AUTO')


def export(name, fn, pal, lod_ratio=0.33, settle=None, note='', pin=True):
    """Build LOD0 + LOD1 with fn(b) and write <name>.glb / <name>_lod1.glb.  Returns stats."""
    stats = {'name': name, 'note': note}
    t0 = None
    for lod in (0, 1):
        reset()
        b = B(name, pal, lod)
        fn(b)
        if settle:
            b.settle(**settle)
        me, extra = b.mesh()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(make_material(name, pal))
        for k in extra:
            me.materials.append(make_extra(k))
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if lod == 0:
            t0 = tris
        elif tris > lod_ratio * t0 * 1.06:
            # pin the vertices on the bounding-box extremes so the twin keeps the LOD0 box
            vs0 = np.array([v.co[:] for v in me.vertices])
            lo, hi_ = vs0.min(0), vs0.max(0)
            eps = 1e-4 * max(1.0, float((hi_ - lo).max()))
            free = [i for i, v in enumerate(vs0) if not pin or not (np.any(v - lo < eps) or np.any(hi_ - v < eps))]
            vg = ob.vertex_groups.new(name='dec')
            vg.add(free, 1.0, 'REPLACE')
            md = ob.modifiers.new('dec', 'DECIMATE')
            md.vertex_group = 'dec'
            md.ratio = max(0.02, (lod_ratio * t0 - 0) / tris)
            md.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier='dec')
            me = ob.data
            tris = sum(len(p.vertices) - 2 for p in me.polygons)
            stats['decimated'] = True
        vs = np.array([v.co[:] for v in me.vertices])
        mn, mx = vs.min(0), vs.max(0)
        bbx = [round(float(mx[0] - mn[0]), 3), round(float(mx[2] - mn[2]), 3), round(float(mx[1] - mn[1]), 3)]
        path = '%s/%s%s.glb' % (OUT, name, '_lod1' if lod else '')
        _export(path, 'EXPORT' if lod == 0 else ('PLACEHOLDER' if extra else 'NONE'))
        stats['lod%d' % lod] = {'tris': tris, 'bbox': bbx, 'min': [round(float(mn[0]), 3), round(float(mn[2]), 3), round(float(-mx[1]), 3)],
                                'max': [round(float(mx[0]), 3), round(float(mx[2]), 3), round(float(-mn[1]), 3)], 'kb': round(os.path.getsize(path) / 1024, 1)}
    for a, c in zip(stats['lod0']['bbox'], stats['lod1']['bbox']):
        if abs(a - c) > 0.03 * max(a, 1e-6):
            print('  !! BBOX MISMATCH %s: lod0 %s lod1 %s' % (name, stats['lod0']['bbox'], stats['lod1']['bbox']))
            break
    with open('%s/stats/%s.json' % (SCR, name), 'w') as f:
        json.dump(stats, f)
    print('BUILT %-28s bbox %s  tris %d / %d (%.0f%%)  %.0f / %.0f KB%s' % (
        name, stats['lod0']['bbox'], stats['lod0']['tris'], stats['lod1']['tris'], 100 * stats['lod1']['tris'] / stats['lod0']['tris'],
        stats['lod0']['kb'], stats['lod1']['kb'], '  [decimated]' if stats.get('decimated') else ''))
    return stats


def run(models):
    """models: {name: (fn, pal, kwargs)}.  CLI: blender -b -P file.py -- [names]"""
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for nm, spec in models.items():
        if args and nm not in args:
            continue
        fn, pal = spec[0], spec[1]
        kw = spec[2] if len(spec) > 2 else {}
        export(nm, fn, pal, **kw)


# -------------------------------------------------------------------- small shared helpers
def arc(cx, cy, r, a0, a1, n, ry=None):
    """2D arc points (degrees), inclusive."""
    ry = r if ry is None else ry
    return [(cx + r * cos(radians(a0 + (a1 - a0) * i / n)), cy + ry * sin(radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def lerp(a, b_, t):
    return a + (b_ - a) * t


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def plan_body(b, levels, zs, colfn, nf=6, nr=6, top='roof', bottom='under', sm=50, pf=1.0, pr=None, caps=3, warp=None):
    """Streamlined body lofted UP through plan outlines.  levels: [(y, w, zf, zr, rf, rr)] - half width, nose z, tail z and
    the depth of the rounded nose / tail.  zs: z stations on the straight sides (window / door edges).
    colfn(k, sx, part, j, z) -> colour: k band index, sx +1 / -1 side, part 'f' / 's' / 'r', j index in the part
    (front arc from the centre line out, side from the front back, rear arc from the centre line out), z mid of the piece.
    Equal-colour runs on the straight sides are merged."""
    pr = pf if pr is None else pr
    zs = sorted(zs, reverse=True)
    nf_, nr_ = (nf, nr) if b.hi else (max(2, (nf + 1) // 2), max(2, (nr + 1) // 2))

    def half(y, w, zf, zr, rf, rr):
        pts = []
        for j in range(nf_ + 1):
            t = pi / 2 * j / nf_
            pts.append(Vector((w * sin(t) ** pf, y, zf - rf * (1 - cos(t)))))
        for z in zs:
            pts.append(Vector((w, y, z)))
        for j in range(nr_, -1, -1):
            t = pi / 2 * j / nr_
            pts.append(Vector((w * sin(t) ** pr, y, zr + rr * (1 - cos(t)))))
        return pts
    H = [half(*lv) for lv in levels]
    if warp:
        H = [[Vector(warp(p.x, p.y, p.z)) for p in h] for h in H]
    M = len(H[0])
    ns = len(zs) + 1
    b.pid += 1
    zc = (levels[0][2] + levels[0][3]) / 2
    for k in range(len(levels) - 1):
        for sx in (1, -1):
            segs = []  # (i0, i1, col, straight)
            for i in range(M - 1):
                if i < nf_:
                    part, j = 'f', i
                elif i < nf_ + ns:
                    part, j = 's', i - nf_
                else:
                    part, j = 'r', M - 2 - i
                zm = (H[k][i].z + H[k][i + 1].z + H[k + 1][i].z + H[k + 1][i + 1].z) / 4
                c = colfn(k, sx, part, j, zm)
                if part == 's' and segs and segs[-1][3] and segs[-1][2] == c:
                    segs[-1][1] = i + 1
                else:
                    segs.append([i, i + 1, c, part == 's'])
            for i0, i1, c, _ in segs:
                if c is None:
                    continue
                P = [H[k][i0], H[k][i1], H[k + 1][i1], H[k + 1][i0]]
                P = [Vector((p.x * sx, p.y, p.z)) for p in P]
                if sx < 0:
                    P.reverse()
                b.face(P, c, sm)
    ring = lambda h: h + [Vector((-p.x, p.y, p.z)) for p in reversed(h[1:-1])]
    b.pid += 1
    if caps & 2 and top:
        b.face(ring(H[-1]), top)
    if caps & 1 and bottom:
        b.face(list(reversed(ring(H[0]))), bottom)


def wheel(b, x, z, r, w, tire='tire', hub='hub', n=12, nl=8, hubr=0.58):
    """Road wheel centred at (x, r, z), axis X; outer face toward +x (call inside mirx)."""
    b.cyl((x - w, r, z), (x, r, z), r, n=n, col=tire, nl=nl)
    b.cyl((x, r, z), (x + 0.015, r, z), r * hubr, r * hubr * 0.85, n=8, col=hub, caps=2, nl=6)
