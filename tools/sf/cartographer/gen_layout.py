"""Stage 2: sf_layout.json from prep.pickle.
Usage: python3 -I gen_layout.py <prep.pickle> <scriptdir> <out sf_layout.json> <out landmark_sites.json> <cache.pickle>"""
import sys, math, json, re, pickle, collections
sys.path.insert(0, sys.argv[2])
from sfgeo import *
import landmarks as LMK
from landmarks import parse_h, rect, compass
from lm_info import DISTRICTS
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, LineString, MultiLineString, Point, box as sbox
from shapely.ops import unary_union, linemerge, polygonize, nearest_points
from shapely import affinity

prep = load(sys.argv[1])
BOXP = sbox(MINX, MINZ, MAXX, MAXZ)
LAND, WATER = prep['LAND'], prep['WATER']
def polys_of(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'): return [q for p in g.geoms for q in polys_of(p)]
    return []
def lines_of(g):
    if g.is_empty: return []
    if g.geom_type == 'LineString': return [g]
    if g.geom_type in ('MultiLineString', 'GeometryCollection'): return [q for p in g.geoms for q in lines_of(p)]
    return []
def ccw(ring):
    """CCW viewed from above = CCW in (x, -z) = negative shoelace area in raw (x, z)."""
    a = sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
    return ring if a < 0 else ring[::-1]
def ring_of(p, tol=0.12):
    if p.geom_type != 'Polygon': p = max(polys_of(p), key=lambda g: g.area)
    q = p.simplify(tol) if tol else p
    if q.is_empty or q.geom_type != 'Polygon': q = p
    return ccw(ring1(list(q.exterior.coords)))

# ======================================================================= water, piers
print('water / piers'); sys.stdout.flush()
landB = LAND.intersection(BOXP.buffer(60))
core = landB.buffer(-16).buffer(16)
fing = [p for p in polys_of(landB.difference(core)) if p.area > 30]
pier_named = []          # OSM pier areas (closed ways) and long line piers
pier_lines = []
for ref, t, g in prep['piers']:
    if isinstance(g, list):
        if len(g) >= 4 and g[0] == g[-1]:
            p = Polygon(g).buffer(0)
            if not p.is_empty: pier_named.append((ref, t.get('name', ''), p))
        else:
            l = LineString(g)
            if l.length >= 5 and l.intersects(BOXP):
                wd = 1.0 if t.get('man_made') in ('breakwater', 'groyne') else 0.6
                pier_lines.append((ref, t.get('name', ''), l.buffer(wd / 2, cap_style=2, join_style=2)))
    else: pier_named.append((ref, t.get('name', ''), g))
waterB = WATER.intersection(BOXP)
over = [(r, n, p) for r, n, p in pier_named + pier_lines if p.intersects(BOXP)]
overU = unary_union([p for r, n, p in over]).intersection(BOXP)
decksOnWater = overU.intersection(waterB)
waterFinal = waterB.difference(overU.buffer(0.05))
DECK = unary_union([overU] + fing).intersection(BOXP).buffer(0.05).buffer(-0.05)   # every pier deck (land fingers + mapped piers)
from shapely.prepared import prep as sprep
DECKB = DECK.buffer(0.6); DECKP = sprep(DECKB); waterBP = sprep(waterB); waterS = waterB.simplify(1.0)
def is_wet(x, z): return waterFinal.contains(Point(x, z))
water = []
ponds = []
for ref, t, p in prep['areas']:
    if (t.get('natural') == 'water' or t.get('amenity') == 'fountain' or t.get('leisure') == 'swimming_pool' and False) and p.intersects(BOXP) and BOXP.contains(p.centroid):
        if p.area >= 4 and BOXP.contains(p) and not waterB.contains(p.centroid) and 'tunnel' not in t and t.get('location') != 'underground' and t.get('covered') != 'yes': ponds.append((ref, t, p))
for p in sorted(polys_of(waterFinal), key=lambda q: -q.area):
    if p.area < 3: continue
    q = p.simplify(0.12)
    if q.geom_type != 'Polygon' or not q.is_valid: q = p.buffer(0).simplify(0.12)
    holes = [ccw(ring1(list(h.coords)))[::-1] for h in q.interiors if Polygon(h).area > 1.0]
    c = p.representative_point()
    name = 'San Francisco Bay'
    water.append(dict(id='water_%d' % len(water), kind='bay', name=name, polygon=ring_of(q, 0), holes=holes, osm='natural=coastline'))
for ref, t, p in ponds:
    nm = t.get('name') or ('fountain' if t.get('amenity') == 'fountain' else 'pond')
    water.append(dict(id='water_%d' % len(water), kind='pond', name=nm, polygon=ring_of(p.intersection(BOXP) if not BOXP.contains(p) else p, 0.08), holes=[], osm=ref))
print(' water polys', len(water), 'bay area', round(waterFinal.area))
wetGeom = unary_union([waterFinal] + [p for r, t, p in ponds])
shore_dist_geom = waterB   # original water incl. under piers

# ======================================================================= roads
print('roads'); sys.stdout.flush()
MAJOR = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'}
MINOR = {'residential', 'unclassified', 'living_street', 'pedestrian'}
roads = []; raw_bridges = []
def clip_line(g):
    l = LineString(g)
    if not l.intersects(BOXP): return []
    return [x for x in lines_of(l.intersection(BOXP)) if x.length > 0.8]
for ref, t, g, ids in prep['roads']:
    hw = t.get('highway')
    if hw not in MAJOR and hw not in MINOR: continue
    if t.get('access') in ('private', 'no') and hw in MINOR and not t.get('name'): continue
    if hw == 'pedestrian' and not t.get('name'): continue
    if t.get('indoor') == 'yes' or t.get('covered') == 'yes' and hw in MINOR and not t.get('name'): continue
    exp = hw in ('motorway', 'motorway_link') or (t.get('bridge') and hw in ('trunk', 'trunk_link') and int(parse_h(t.get('layer')) or 1) >= 1)
    cls = 'major' if hw in MAJOR else 'minor'
    crooked = ref == 'way/402111597'
    for l in clip_line(g):
        pts = ring1(list((l if crooked else l.simplify(0.1)).coords)) if l.coords[0] != l.coords[-1] else [[r1(a), r1(b)] for a, b in l.coords]
        if len(pts) < 2: continue
        r = dict(id='road_%d' % len(roads), name=t.get('name', ''), **{'class': cls}, expressway=bool(exp), width=5.0 if cls == 'major' else 3.6, points=pts)
        if t.get('bridge') and t.get('bridge') != 'no': r['bridge'] = True; r['layer'] = int(parse_h(t.get('layer')) or 1)
        if t.get('tunnel') and t.get('tunnel') != 'no': r['tunnel'] = True
        if crooked: r['crooked'] = True; r['note'] = "Lombard Street's crooked block (Hyde to Leavenworth): eight brick-paved switchbacks, one-way downhill east"
        r['osm'] = ref; r['_hw'] = hw
        roads.append(r)
print(' roads', len(roads), collections.Counter((r['class'], r['expressway']) for r in roads))
# planar noded graph of the non-expressway roads
surf = [r for r in roads if not r['expressway']]
lines = [LineString(r['points']) for r in surf]
noded = unary_union(lines)
pieces = [l for l in lines_of(noded) if l.length > 0]
rtree = shapely.STRtree(lines)
def key(p): return (round(p[0], 1), round(p[1], 1))
segs = []
for l in pieces:
    cs = [list(key(c)) for c in l.coords]
    cs = [c for i, c in enumerate(cs) if i == 0 or c != cs[i - 1]]
    if len(cs) < 2: continue
    mid = l.interpolate(0.5, normalized=True)
    k = min(rtree.query(mid.buffer(0.3)), key=lambda j: lines[j].distance(mid), default=None)
    if k is None: k = int(rtree.nearest(mid))
    segs.append((cs, surf[k]))
# merge chains through degree-2 nodes of the same road
deg = collections.Counter()
for cs, r in segs: deg[tuple(cs[0])] += 1; deg[tuple(cs[-1])] += 1
ends = collections.defaultdict(list)
for i, (cs, r) in enumerate(segs): ends[tuple(cs[0])].append(i); ends[tuple(cs[-1])].append(i)
used = [False] * len(segs); chains = []
for i, (cs, r) in enumerate(segs):
    if used[i]: continue
    used[i] = True; chain = list(cs)
    for head in (False, True):
        while True:
            n = tuple(chain[0] if head else chain[-1])
            if deg[n] != 2: break
            nxt = [j for j in ends[n] if not used[j] and segs[j][1]['id'] == r['id']]
            if not nxt: break
            j = nxt[0]; used[j] = True; c2 = segs[j][0]
            if head:
                chain = (c2 if tuple(c2[-1]) == n else c2[::-1])[:-1] + chain
            else:
                chain = chain + (c2 if tuple(c2[0]) == n else c2[::-1])[1:]
    chains.append((chain, r))
nodes = {}; gnodes = []; gedges = []
def nid(p):
    p = tuple(p)
    if p not in nodes: nodes[p] = len(gnodes); gnodes.append(list(p))
    return nodes[p]
for chain, r in chains:
    L = sum(math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]) for i in range(len(chain) - 1))
    if L < 0.15: continue
    gedges.append(dict(a=nid(chain[0]), b=nid(chain[-1]), road=r['id'], **{'class': r['class']}, width=r['width'], length=r1(L), points=chain))
# components
par = list(range(len(gnodes)))
def find(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
for e in gedges: par[find(e['a'])] = find(e['b'])
comp = collections.Counter(find(i) for i in range(len(gnodes)))
print(' graph nodes', len(gnodes), 'edges', len(gedges), 'components', sorted(comp.values(), reverse=True)[:8])
roadU_lines = shapely.STRtree([LineString(r['points']) for r in roads]); road_lines = [LineString(r['points']) for r in roads]
def road_line(name, cls=None):
    return unary_union([LineString(r['points']) for r in roads if r['name'] == name])
def road_dist(geom):
    k = roadU_lines.nearest(geom); return road_lines[int(k)].distance(geom), roads[int(k)]

# ======================================================================= zones
UX, UZ = math.sin(math.radians(81)), -math.cos(math.radians(81))
VX, VZ = math.sin(math.radians(351)), -math.cos(math.radians(351))
MK0 = (93.4, 42.2); SD = (0.709, -0.705); TD = (0.705, 0.709)
shoreN = None
def zone_of(x, z):
    u = (x * UX + z * UZ) / SCALE; v = (x * VX + z * VZ) / SCALE
    s = ((x - MK0[0]) * SD[0] + (z - MK0[1]) * SD[1]) / SCALE; t = ((x - MK0[0]) * TD[0] + (z - MK0[1]) * TD[1]) / SCALE
    dshore = waterS.distance(Point(x, z)) / SCALE
    if t <= 0:   # north of Market
        if v > 1430: return 'fishermans_wharf'
        if dshore < 120 and u > 150: return 'embarcadero'
        if v > 590:
            if u > 330: return 'embarcadero'
            if u < -733: return 'russian_hill'
            if -220 < u < 330 and 695 < v < 1330: return 'telegraph_hill'
            return 'north_beach'
        if -440 < u <= 0 and -250 < v <= 590: return 'chinatown'
        if u > 0: return 'financial_district'
        if u <= -440 and v > -250: return 'nob_hill'
        if u > -660: return 'union_square' if u <= 0 else 'financial_district'
        if v < -1090 and u < -1100: return 'civic_center'
        return 'tenderloin'
    if t > 1640 or (z > 366 and x > 150): return 'mission_bay'
    if dshore < 120 and z < 60: return 'embarcadero'
    if s > -277 and t < 578: return 'financial_district'
    if dshore < 130 or (s > -553 and t >= 964): return 'south_beach'
    if s > -277 and t < 964: return 'rincon_hill'
    if s < -1940 and t < 400: return 'civic_center'
    return 'soma'

# ======================================================================= landmarks (footprints first)
print('landmarks'); sys.stdout.flush()
def split_ref(ref, n=2):
    t, p = LMK.geom_index(prep)[0][ref]
    cx, cz, w, d, rot = obb(p)
    along_short = d < w   # split across the short axis: slices side by side along the long axis' normal
    out = []
    for k in range(n):
        if along_short: r = rect(0, (k + 0.5) * d / n - d / 2, w + 1, d / n, 0)
        else: r = rect((k + 0.5) * w / n - w / 2, 0, w / n, d + 1, 0)
        r = affinity.translate(affinity.rotate(r, -math.degrees(rot), origin=(0, 0)), cx, cz)
        out.append(p.intersection(r))
    return sorted(out, key=lambda q: -q.centroid.y)
G_extra = {}
for ref, ids in (('way/91913152', (19, 23)), ('way/91913149', (29, 31))):
    for q, n in zip(split_ref(ref), ids):
        k = 'split/%s/%d' % (ref, n); G_extra[n] = k
        prep['areas'].append((k, {'name': 'Pier %d' % n}, max(polys_of(q), key=lambda g: g.area)))
lms, dropped = LMK.build(prep, extra_pier=G_extra)
dropped = [(a, 'the Pier 3 shed is not in the data as its own building (only the pier deck and the bulkhead / Pier 1 1/2 buildings)' if a == 'pier_3' else b) for a, b in dropped]
for e in lms:
    if e['id'] == 'bank_of_canton_pagoda':
        e['_poly'] = rect(e['x'], e['z'], 2.6, 2.6, 0.157); e['w'] = e['d'] = 2.6; e['rot'] = 0.157
    e['osm'] = e['osm'].replace('split/', '').replace('/19', ' (south half)').replace('/23', ' (north half)').replace('/29', ' (south half)').replace('/31', ' (north half)')
    c = Point(e['x'], e['z'])
    e['grid'] = 'north_of_market' if abs(abs(math.degrees(e['rot'])) - 9) < 4 else 'soma' if abs(abs(math.degrees(e['rot'])) - 45) < 4 else 'waterfront'
    if DECKP.contains(c) and e['kind'] != 'bridge' and e['id'] not in ('balclutha', 'pier_45_ships'): e['onPier'] = True
    elif waterBP.contains(c): e['onWater'] = True
    if e['id'] in ('balclutha', 'pier_45_ships'): e['onWater'] = True
print(' landmarks', len(lms), 'dropped', dropped)

# ======================================================================= buildings
print('buildings'); sys.stdout.flush()
SHIPS = re.compile(r"Jeremiah|San Francisco Belle|Santa Rosa|Pampanito|Balclutha|Eureka|Hercules|Thayer|Alma", re.I)
raw = []
for ref, t, p in prep['bld']:
    c = p.representative_point()
    if not BOXP.contains(c) or p.area < 0.6: continue
    if t.get('location') == 'underground' or t.get('building') in ('ship', 'no') or SHIPS.search(t.get('name', '')): continue
    if p.geom_type != 'Polygon': p = max(polys_of(p), key=lambda g: g.area)
    raw.append([ref, t, p])
# de-duplicate (relation outline + its tagged member way)
tree = shapely.STRtree([p for r, t, p in raw]); drop = set()
order = sorted(range(len(raw)), key=lambda i: -raw[i][2].area)
for i in order:
    if i in drop: continue
    p = raw[i][2]
    for j in tree.query(p):
        j = int(j)
        if j == i or j in drop: continue
        q = raw[j][2]
        if q.area <= p.area * 1.0001 and p.intersection(q).area > 0.85 * q.area and (q.area > 0.5 * p.area or raw[j][0].startswith('relation')):
            if not raw[i][1].get('name') and raw[j][1].get('name'): raw[i][1] = dict(raw[i][1], name=raw[j][1]['name'])
            if not raw[i][1].get('height') and raw[j][1].get('height'): raw[i][1] = dict(raw[i][1], height=raw[j][1]['height'])
            drop.add(j)
raw = [r for i, r in enumerate(raw) if i not in drop]
print(' raw buildings', len(raw), 'dups dropped', len(drop))
dsf = prep['datasf']; dtree = shapely.STRtree([d[5] for d in dsf])
def datasf_h(p):
    c = p.representative_point(); best = None
    for j in dtree.query(c):
        d = dsf[int(j)]
        if d[5].contains(c) and d[1] > 2: best = d[1] if best is None else max(best, d[1])
    return best
ptree = shapely.STRtree([p for r, t, p in prep['parts']])
def part_h(t):
    h = parse_h(t.get('height'))
    if h is None and t.get('building:levels'): h = (parse_h(t['building:levels']) or 0) * 3.6 + 2
    return h
B = []   # dicts: poly, hm, src, name, osm, tags, podiumOf
for ref, t, p in raw:
    h = parse_h(t.get('height')); src = 'osm:height'
    if h is not None and h < 2.5: h = None
    lv = parse_h(t.get('building:levels'))
    ps = []
    for j in ptree.query(p):
        r2, t2, q = prep['parts'][int(j)]
        if t2.get('building:part') in ('antenna', 'no') or q.area < 4: continue
        if p.buffer(0.2).contains(q.representative_point()) and q.intersection(p).area > 0.6 * q.area:
            ph = part_h(t2)
            if ph: ps.append((ph, q, t2, r2))
    hmax = max([x[0] for x in ps], default=None)
    if h is None and lv and not ps: h = lv * 3.4 + 1.5; src = 'osm:levels'
    if h is None and not ps:
        h = datasf_h(p); src = 'datasf:hgt_median_m'
    if ps and hmax >= 45:
        tall = [x for x in ps if x[0] >= 0.72 * hmax]
        tower = unary_union([x[1] for x in tall]).intersection(p).buffer(0)
        tower = max(polys_of(tower), key=lambda g: g.area) if polys_of(tower) else None
        rest = p.difference(tower.buffer(0.15)) if tower is not None else p
        if tower is not None and tower.area >= 4 and tower.area < 0.72 * p.area and rest.area > 16:
            low = [x for x in ps if x[0] < 0.72 * hmax]
            la = sum(x[1].area for x in low)
            ph = (sum(x[0] * x[1].area for x in low) / la) if la > 0 else None
            if h is not None and h < 0.6 * hmax: ph = h
            if ph is None: ph = min(datasf_h(rest) or 18, 0.4 * hmax)
            nm = next((x[2].get('name') for x in tall if x[2].get('name')), None) or t.get('name', '')
            B.append(dict(poly=tower, hm=hmax, src='osm:part height (tower)', name=nm, osm=tall[0][3], tags=t, tower=True, key=ref))
            for q in polys_of(rest):
                if q.area > 6: B.append(dict(poly=q, hm=ph, src='osm:part height (podium)', name=t.get('name', ''), osm=ref, tags=t, podiumKey=ref))
            continue
        h = max(h or 0, hmax); src = 'osm:part height'
    elif ps and h is None:
        a = sum(x[1].area for x in ps); h = sum(x[0] * x[1].area for x in ps) / a; src = 'osm:part height'
    B.append(dict(poly=p, hm=h, src=src if h else None, name=t.get('name', ''), osm=ref, tags=t))
# landmark flags
ltree = shapely.STRtree([e['_poly'] for e in lms])
for b in B:
    c = b['poly'].representative_point(); b['lm'] = None
    for j in ltree.query(b['poly']):
        e = lms[int(j)]
        if e['kind'] in ('prop', 'bridge') and e['id'] not in ('dragon_gate',): continue
        if e['_poly'].buffer(0.3).contains(c) or e['_poly'].intersection(b['poly']).area > 0.5 * b['poly'].area:
            if b['lm'] is None or e['_poly'].area < next(x for x in lms if x['id'] == b['lm'])['_poly'].area: b['lm'] = e['id']
# drop buildings in open water that stand on nothing (boats), keep those on decks
keep = []
for b in B:
    c = b['poly'].representative_point()
    b['wet'] = waterBP.contains(c) and not DECKP.contains(c)
    b['pier'] = DECKP.contains(c) or b['wet']
    if b['wet'] and not b['lm'] and b['poly'].area < 6: continue
    keep.append(b)
B = keep
# heights: neighbours' median for the rest
known = [(b['poly'].centroid.x, b['poly'].centroid.y, b['hm']) for b in B if b['hm']]
KX = np.array([(k[0], k[1]) for k in known]); KH = np.array([k[2] for k in known])
for b in B:
    if not b['hm']:
        c = b['poly'].centroid; d = np.hypot(KX[:, 0] - c.x, KX[:, 1] - c.y); idx = np.argsort(d)[:9]
        b['hm'] = float(np.median(KH[idx])); b['src'] = 'heuristic:neighbour-median'
    b['hm'] = max(3.0, float(b['hm'])); b['hmax'] = b['hm']; b['n'] = 1
    c = b['poly'].centroid; b['zone'] = zone_of(c.x, c.y)
print(' buildings before merge', len(B), collections.Counter(b['src'].split(' ')[0] for b in B))
# ---- merge (mergeNote)
def mrect(p):
    r = p.minimum_rotated_rectangle
    if r.geom_type != 'Polygon': return 1e9, 0
    c = list(r.exterior.coords); a = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]); bb = math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])
    return max(a, bb), (p.area / (a * bb) if a * bb > 0 else 0)
def join(pa, pb):
    u = unary_union([pa, pb]).buffer(0.25, join_style=2).buffer(-0.25, join_style=2)
    if u.geom_type != 'Polygon':
        ps = polys_of(u)
        if len(ps) != 1: return None
        u = ps[0]
    return Polygon(u.exterior)
def merge_pass(B, fill, side, ratio, hcap, only_small=None, same_zone=True):
    tree = shapely.STRtree([b['poly'] for b in B]); done = set(); out = []; merged = 0
    for i in sorted(range(len(B)), key=lambda i: B[i]['poly'].area):
        if i in done: continue
        a = B[i]
        if a['lm'] or a.get('tower') or a['hm'] >= hcap or (only_small and a['poly'].area >= only_small): continue
        best = None
        for j in tree.query(a['poly'].buffer(0.22)):
            j = int(j)
            if j == i or j in done: continue
            c = B[j]
            if c['lm'] or c.get('tower') or c['hm'] >= hcap or c['pier'] != a['pier']: continue
            if max(a['hm'], c['hm']) / min(a['hm'], c['hm']) > ratio: continue
            if a['poly'].distance(c['poly']) > 0.2: continue
            if a['poly'].area + c['poly'].area > 620: continue
            score = abs(a['hm'] - c['hm'])
            if best is None or score < best[0]: best = (score, j)
        if best is None: continue
        j = best[1]; c = B[j]
        u = join(a['poly'], c['poly'])
        if u is None: continue
        mx, fl = mrect(u)
        if mx > side or fl < fill: continue
        aa, ca = a['poly'].area, c['poly'].area
        big = a if aa >= ca else c
        nb = dict(big); nb.update(poly=u, hm=(a['hm'] * aa + c['hm'] * ca) / (aa + ca), hmax=max(a['hmax'], c['hmax']), n=a['n'] + c['n'],
                  name=big['name'] or (a['name'] if a is not big else c['name']), srcs=set(a.get('srcs', {a['src']})) | set(c.get('srcs', {c['src']})))
        done.add(i); done.add(j); out.append(nb); merged += 1
    out += [b for i, b in enumerate(B) if i not in done]
    return out, merged
for k in range(10):
    B, m = merge_pass(B, 0.62, 22.0, 1.8, 60.0)
    print('  merge pass', k, 'merged', m, 'left', len(B)); sys.stdout.flush()
    if m < 15: break
for k in range(6):
    B, m = merge_pass(B, 0.45, 24.0, 2.6, 60.0, only_small=28.0)
    print('  sliver pass', k, 'merged', m, 'left', len(B)); sys.stdout.flush()
    if m < 10: break
# isolated crumbs: sheds and kiosks under 60 m2 that merged with nothing
B = [b for b in B if b['lm'] or b['poly'].area >= 4.0 or b['hm'] >= 25]
print(' buildings after merge', len(B))
# ---- finish
RES = {'apartments', 'residential', 'house', 'dormitory', 'hotel', 'terrace', 'detached', 'semidetached_house'}
def style_of(b, area_m2):
    h, z, t = b['hm'], b['zone'], b['tags']
    bt = t.get('building', 'yes')
    if h >= 120: return 'glasstower'
    if h >= 60: return 'glassslab'
    if b['pier'] or bt in ('warehouse', 'industrial', 'hangar', 'shed'): return 'warehouse'
    if z in ('soma', 'south_beach', 'mission_bay') and h < 16 and area_m2 > 900 and bt not in RES: return 'warehouse'
    if h < 17 and z in ('north_beach', 'telegraph_hill', 'russian_hill', 'nob_hill') : return 'victorian'
    if h < 15 and z == 'tenderloin' and area_m2 < 500: return 'victorian'
    if h < 45 and z in ('chinatown',): return 'brick'
    if h < 38 and z in ('union_square', 'tenderloin') and bt not in ('apartments',) : return 'brick' if h < 15 or (hash(b['osm']) % 3) else 'apartment'
    if z == 'financial_district' and h < 30 and (b['poly'].centroid.x * VX + b['poly'].centroid.y * VZ) / SCALE > 330: return 'brick'   # Jackson Square
    if h < 15: return 'lowrise'
    if bt in RES or z in ('nob_hill', 'russian_hill', 'north_beach', 'telegraph_hill', 'tenderloin', 'rincon_hill', 'south_beach', 'mission_bay'): return 'apartment'
    return 'midrise'
out_b = []
keyid = {}
B.sort(key=lambda b: (-b['hm'] if b['hm'] >= 60 else 0, round(b['poly'].centroid.y), b['poly'].centroid.x))
for i, b in enumerate(B):
    p = b['poly']
    fp = ring_of(p, 0.12)
    if len(fp) < 3: continue
    cx, cz, w, d, rot = obb(p)
    if not (MINX <= cx <= MAXX and MINZ <= cz <= MAXZ): continue
    bid = 'b%d' % len(out_b)
    if b.get('tower'): keyid[b['key']] = bid
    dr, rd = road_dist(p)
    area_m2 = p.area / (SCALE * SCALE)
    srcs = b.get('srcs') or {b['src']}
    e = dict(id=bid, footprint=fp, cx=r1(cx), cz=r1(cz), rot=round(rot, 3), w=r1(max(w, 0.6)), d=r1(max(d, 0.6)), height=r1(b['hm'] * SCALE), levels=max(1, int(round(b['hm'] / 3.4))),
             landmark=b['lm'], name=b['name'] or '', heightSource='+'.join(sorted(s.split(' (')[0] for s in srcs)) + (' merged x%d (area-weighted)' % b['n'] if b['n'] > 1 else ''),
             heightMetres=round(b['hm'], 1), osm=b['osm'], aabb=[r1(v) for v in p.bounds])
    # frontage: avenue = the block face on a north-south (north grid) / numbered (SoMa) street
    pts = rd['points']; k = min(range(len(pts) - 1), key=lambda k: LineString([pts[k], pts[k + 1]]).distance(p))
    be = math.degrees(math.atan2(pts[k + 1][0] - pts[k][0], -(pts[k + 1][1] - pts[k][1]))) % 180
    e['frontage'] = 'avenue' if (be > 150 or be < 15 or 120 < be < 150) else 'street'
    e['zone'] = b['zone']
    if not b['lm']: e['style'] = style_of(b, area_m2)
    if b['n'] > 1: e['merged'] = b['n']; e['heightMaxMetres'] = round(b['hmax'], 1)
    if b.get('podiumKey'): e['_pk'] = b['podiumKey']
    if b['pier'] or waterBP.contains(Point(cx, cz)): e['onPier'] = True
    if not b['lm'] and area_m2 < 160 and b['hm'] < 9 and dr > 3.4: e['phoneSkip'] = True
    out_b.append(e)
for e in out_b:
    if '_pk' in e:
        k = e.pop('_pk')
        if k in keyid: e['podiumOf'] = keyid[k]
print(' buildings out', len(out_b), collections.Counter(e.get('style') for e in out_b), collections.Counter(e['zone'] for e in out_b))
bpolys = [Polygon(e['footprint']) for e in out_b]; btree = shapely.STRtree(bpolys)
for e in lms:
    best = None
    for j in btree.query(e['_poly']):
        if out_b[int(j)]['landmark'] == e['id']:
            a = bpolys[int(j)].area
            if best is None or a > best[0]: best = (a, out_b[int(j)]['id'])
    if best: e['footprintId'] = best[1]

pickle.dump(dict(water=water, waterFinal=waterFinal, waterB=waterB, DECK=DECK, over=over, fing=fing, roads=roads, gnodes=gnodes, gedges=gedges, lms=lms, dropped=dropped,
                 buildings=out_b, ponds=ponds, comp=sorted(comp.values(), reverse=True)), open(sys.argv[5], 'wb'), protocol=4)
print('cached')
