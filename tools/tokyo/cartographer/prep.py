"""Stage 1: project the OSM extract into game units and save prep.pickle.
Usage: python3 -I prep.py <osm.pickle> <out prep.pickle> <scriptdir>"""
import sys, json, math, pickle, collections
sys.path.insert(0, sys.argv[3])
from tkgeo import *
from shapely.geometry import Polygon, LineString, MultiPolygon, Point, box as sbox, shape
from shapely.ops import unary_union, polygonize, linemerge
import shapely

D = load(sys.argv[1])
ways, rels, nodes = D['ways'], D['rels'], D['nodes']
P = lambda pts: [xz(lo, la) for lo, la in pts]
wide = sbox(-2000, -2000, 2000, 2400)
NEAR = sbox(MINX - 700, MINZ - 700, MAXX + 700, MAXZ + 700)

def poly_of(pts):
    if len(pts) < 4 or pts[0] != pts[-1]: return None
    try:
        p = Polygon(pts)
        if not p.is_valid: p = p.buffer(0)
        if p.is_empty or p.area < 0.01: return None
        if p.geom_type == 'MultiPolygon': p = max(p.geoms, key=lambda g: g.area)
        return p
    except Exception:
        return None

def rel_poly(rid):
    t, mem = rels[rid]
    outer = [LineString(P(ways[r][1])) for ty, r, role in mem if ty == 'w' and r in ways and role in ('outer', '', 'outline') and len(ways[r][1]) > 1]
    inner = [LineString(P(ways[r][1])) for ty, r, role in mem if ty == 'w' and r in ways and role == 'inner' and len(ways[r][1]) > 1]
    if not outer: return None
    try:
        op = unary_union(list(polygonize(unary_union(outer))))
        if inner:
            ip = list(polygonize(unary_union(inner)))
            if ip: op = op.difference(unary_union(ip))
        if not op.is_valid: op = op.buffer(0)
        return None if op.is_empty else op
    except Exception:
        return None

# ---------------- coastline -> land / water over the wide area ----------------
coast = [LineString(P(pts)) for i, (t, pts, ids) in ways.items() if t.get('natural') == 'coastline' and len(pts) > 1]
coast = [c for c in coast if c.intersects(wide)]
merged = unary_union(coast).intersection(wide)
faces = list(polygonize(unary_union([merged, wide.boundary])))
print('coast ways', len(coast), 'faces', len(faces))
tree = shapely.STRtree(faces)
votes = collections.defaultdict(lambda: [0.0, 0.0])
for c in coast:
    cs = list(c.coords)
    for a, b in zip(cs[:-1], cs[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dz)
        if l < 0.5: continue
        mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        # game coords are (x east, z south): left of the direction of travel (land) is (dz, -dx)
        nx, nz = dz / l, -dx / l
        for side, (px, pz) in enumerate(((mx + nx * 0.15, mz + nz * 0.15), (mx - nx * 0.15, mz - nz * 0.15))):
            pt = Point(px, pz)
            for k in tree.query(pt):
                if faces[k].contains(pt): votes[k][side] += l
land = [faces[k] for k in range(len(faces)) if votes[k][0] > votes[k][1]]
unv = [faces[k] for k in range(len(faces)) if k not in votes]
print('land faces', len(land), 'unvoted', len(unv), [round(f.area) for f in unv][:10])
LAND = unary_union(land).buffer(0)
WATER = wide.difference(LAND)
print('land area', LAND.area, 'water', WATER.area)

# ---------------- features ----------------
out = dict(LAND=LAND, WATER=WATER, wideBox=wide.bounds)
def near_pts(pts): 
    g = P(pts)
    xs = [p[0] for p in g]; zs = [p[1] for p in g]
    return g if (max(xs) > MINX - 700 and min(xs) < MAXX + 700 and max(zs) > MINZ - 700 and min(zs) < MAXZ + 700) else None
relway = collections.defaultdict(list)
for i, (t, mem) in rels.items():
    for ty, ref, role in mem:
        if ty == 'w': relway[ref].append((i, role))
bld, parts, roads, areas, piers, rail, paths, misc = [], [], [], [], [], [], [], []
AREA_KEYS = ('leisure', 'landuse', 'natural', 'amenity', 'place', 'tourism', 'man_made', 'highway', 'historic', 'water')
for i, (t, pts, ids) in ways.items():
    if len(pts) < 2: continue
    g = near_pts(pts)
    if g is None: continue
    ref = 'way/%d' % i
    if 'building' in t or 'building:part' in t:
        p = poly_of(g)
        if p is not None:
            if 'building' in t and t.get('building') not in ('roof', 'no') or (t.get('building') == 'roof' and t.get('name')): bld.append((ref, t, p))
            if 'building:part' in t: parts.append((ref, t, p))
        if t.get('man_made') != 'pier': continue
    if t.get('man_made') in ('pier', 'breakwater', 'groyne', 'quay'):
        piers.append((ref, t, g)); 
        if 'highway' not in t: continue
    if 'highway' in t:
        closed = g[0] == g[-1] and (t.get('area') == 'yes')
        if closed: areas.append((ref, t, poly_of(g)))
        else: roads.append((ref, t, g, ids))
        continue
    if 'railway' in t:
        rail.append((ref, t, g)); continue
    if t.get('route') == 'ferry': misc.append((ref, t, g)); continue
    if g[0] == g[-1] and any(k in t for k in AREA_KEYS):
        p = poly_of(g)
        if p is not None: areas.append((ref, t, p))
    elif any(k in t for k in ('natural', 'man_made', 'barrier', 'waterway')) : misc.append((ref, t, g))
for i, (t, mem) in rels.items():
    if t.get('type') not in ('multipolygon', 'building'): continue
    ws = [r for ty, r, role in mem if ty == 'w' and r in ways and ways[r][1]]
    if not ws or near_pts([p for r in ws for p in ways[r][1]]) is None: continue
    p = rel_poly(i)
    if p is None: continue
    ref = 'relation/%d' % i
    if t.get('type') == 'building' or ('building' in t and t.get('building') != 'roof'): bld.append((ref, dict(t, **({} if 'building' in t else {'building': 'yes'})), p))
    elif 'building:part' in t: parts.append((ref, t, p))
    elif t.get('man_made') == 'pier': piers.append((ref, t, p))
    elif any(k in t for k in AREA_KEYS): areas.append((ref, t, p))
print('bld', len(bld), 'parts', len(parts), 'roads', len(roads), 'areas', len(areas), 'piers', len(piers), 'rail', len(rail))
out.update(bld=bld, parts=parts, roads=roads, areas=[a for a in areas if a[2] is not None], piers=piers, rail=rail, misc=misc)
nn = []
for i, (lo, la, t) in nodes.items():
    x, z = xz(lo, la)
    if abs(x) < 2600 and abs(z) < 2600: nn.append(('node/%d' % i, t, (x, z)))
out['nodes'] = nn
# route relations (cable cars, F line, ferries, light rail) as ordered member way geometries
routes = []
for i, (t, mem) in rels.items():
    if t.get('route') in ('tram', 'ferry', 'light_rail', 'train', 'monorail', 'subway'):
        ws = [(r, role, P(ways[r][1])) for ty, r, role in mem if ty == 'w' and r in ways and len(ways[r][1]) > 1]
        if not any(abs(p[0][0]) < 2600 and abs(p[0][1]) < 2600 for r, role, p in ws): continue
        ns = [(r, role) + (xz(nodes[r][0], nodes[r][1]), nodes[r][2].get('name')) for ty, r, role in mem if ty == 'n' and r in nodes]
        routes.append(('relation/%d' % i, t, ws, ns))
out['routes'] = routes
# all tagged ways of the wide area needed for the far set pieces
far = []
for i, (t, pts, ids) in ways.items():
    if len(pts) < 2: continue
    if t.get('man_made') in ('bridge', 'crane', 'tower', 'mast', 'gantry') or t.get('place') in ('island', 'islet') or t.get('bridge') and t.get('highway') in ('motorway', 'trunk') or t.get('natural') in ('peak',) or t.get('landuse') in ('industrial', 'port') or t.get('man_made') == 'crane':
        far.append(('way/%d' % i, t, P(pts)))
out['far'] = far
# water areas (rivers, canals, moats, docks) over the wide area
ww = []
for i, (t, pts, ids) in ways.items():
    if (t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock')) and len(pts) >= 4 and pts[0] == pts[-1]:
        g = P(pts)
        if max(p[0] for p in g) < -2000 or min(p[0] for p in g) > 2000 or max(p[1] for p in g) < -2000 or min(p[1] for p in g) > 2400: continue
        p = poly_of(g)
        if p is not None and p.area > 2: ww.append(('way/%d' % i, t, p))
for i, (t, mem) in rels.items():
    if t.get('type') == 'multipolygon' and (t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock')):
        p = rel_poly(i)
        if p is not None and p.intersects(wide) and p.area > 2: ww.append(('relation/%d' % i, t, p))
out['widewater'] = ww
print('wide water areas', len(ww))
pickle.dump(out, open(sys.argv[2], 'wb'), protocol=4)
