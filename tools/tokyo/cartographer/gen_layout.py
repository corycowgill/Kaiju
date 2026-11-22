"""Stage 2: the Tokyo layout cache (water, roads, landmarks, buildings) from prep.pickle.
Usage: python3 -I gen_layout.py <prep.pickle> <scriptdir> <out sf_layout.json> <out landmark_sites.json> <cache.pickle>"""
import sys, math, json, re, pickle, collections
sys.path.insert(0, sys.argv[2])
from tkgeo import *
import landmarks as LMK
from landmarks import parse_h, rect, compass
from lm_info import DISTRICTS
from zones import zone_of as zone_seed
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
BIG = BOXP.buffer(80)
def hidden(t): return 'tunnel' in t or t.get('location') == 'underground' or t.get('covered') == 'yes' or str(t.get('layer', '0')).startswith('-') or t.get('indoor') == 'yes'
wcand = [(ref, t, p) for ref, t, p in prep['widewater'] if p.intersects(BIG) and not hidden(t) and t.get('water') not in ('wastewater', 'reservoir', 'drain', 'ditch', 'fountain') and t.get('amenity') != 'fountain' and t.get('leisure') != 'swimming_pool']
coastW = WATER.intersection(BIG)
allW = unary_union([coastW] + [p.intersection(BIG) for r, t, p in wcand]).buffer(0.3).buffer(-0.3)
tidal = unary_union([q for q in polys_of(allW) if q.intersects(coastW.buffer(0.2)) and q.area > 20])
inland = [q for q in polys_of(allW) if not q.intersects(coastW.buffer(0.2))]
print(' tidal area', round(tidal.area), 'inland water bodies', len(inland), round(sum(q.area for q in inland)))
WATER = tidal
LAND = sbox(*prep['wideBox']).difference(unary_union([prep['WATER'], tidal]))
landB = BIG.difference(tidal)
core = landB.buffer(-5).buffer(5)
fing = [p for p in polys_of(landB.difference(core)) if p.area > 6 and p.intersects(BOXP)]
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
waterB = WATER.intersection(BOXP).buffer(0)
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
wtree = shapely.STRtree([p for r, t, p in wcand])
def wname(q, default):
    best = (0, default, 'natural=water')
    for j in wtree.query(q):
        r, t, p = wcand[int(j)]
        a = p.intersection(q).area
        nm = t.get('name:en') or t.get('name')
        if nm and a > best[0]: best = (a, nm, r)
    return best[1], best[2]
for q in inland:
    q = q.intersection(BOXP)
    for p in polys_of(q):
        if p.area >= 4: ponds.append(('natural=water', {}, p))
for p in sorted(polys_of(waterFinal), key=lambda q: -q.area):
    if p.area < 3: continue
    q = p.simplify(0.15)
    if q.geom_type != 'Polygon' or not q.is_valid: q = p.buffer(0).simplify(0.15)
    if q.geom_type != 'Polygon': q = max(polys_of(q), key=lambda g: g.area)
    holes = [ccw(ring1(list(h.coords)))[::-1] for h in q.interiors if Polygon(h).area > 1.0]
    name = 'Tokyo Bay (the port, the Sumida River mouth and the canals)' if not water else wname(p, 'canal')[0]
    water.append(dict(id='water_%d' % len(water), kind='bay', name=name, polygon=ring_of(q, 0), holes=holes, osm='natural=coastline + natural=water (river, canal)'))
for i, (ref, t, p) in enumerate(ponds):
    nm, r = wname(p, 'pond')
    q = p.simplify(0.12)
    if q.geom_type != 'Polygon' or not q.is_valid: q = p
    holes = [ccw(ring1(list(h.coords)))[::-1] for h in q.interiors if Polygon(h).area > 1.0]
    ponds[i] = (r, {'name': nm}, p)
    water.append(dict(id='water_%d' % len(water), kind='pond', name=nm, polygon=ring_of(q, 0), holes=holes, osm=r))
print(' water polys', len(water), 'bay area', round(waterFinal.area))
wetGeom = unary_union([waterFinal] + [p for r, t, p in ponds])
shore_dist_geom = waterB   # original water incl. under piers

# ======================================================================= roads
print('roads'); sys.stdout.flush()
MAJOR = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'}
MINOR = {'residential', 'unclassified', 'living_street', 'pedestrian'}
KK = re.compile(r'東京高速道路|KK線|Tokyo Expressway')
ROMAJI = {}
def rname(t):
    return t.get('name:en') or t.get('name:ja_rm') or t.get('name:ja-Latn') or t.get('name') or ''
def clip_line(g):
    l = LineString(g)
    if not l.intersects(BOXP): return []
    return [x for x in lines_of(l.intersection(BOXP)) if x.length > 0.8]
cand = []
for ref, t, g, ids in prep['roads']:
    hw = t.get('highway')
    if hw not in MAJOR and hw not in MINOR: continue
    if t.get('access') in ('private', 'no') and hw in MINOR: continue
    if hw == 'pedestrian' and not t.get('name'): continue
    if t.get('indoor') == 'yes' or t.get('covered') == 'yes' and hw in MINOR: continue
    if t.get('area') == 'yes': continue
    lay = int(parse_h(t.get('layer')) or 0) * (-1 if str(t.get('layer', '0')).strip().startswith('-') else 1)
    tun = bool(t.get('tunnel')) and t.get('tunnel') != 'no'
    exp = hw in ('motorway', 'motorway_link') or bool(KK.search(t.get('name', '') + t.get('official_name', '')))
    if not exp and (tun or lay < 0): continue          # underpasses and road tunnels under the surface streets (Loop Road No. 2 under Shintora-dori ...)
    cls = 'major' if hw in MAJOR else 'minor'
    for l in clip_line(g):
        cand.append(dict(line=l.simplify(0.1), name=rname(t), jname=t.get('name', ''), cls=cls, exp=exp, hw=hw, bridge=bool(t.get('bridge') and t.get('bridge') != 'no'), layer=lay, tunnel=tun, osm=ref, ref=t.get('ref', '')))
print(' candidate ways', len(cand), collections.Counter((c['cls'], c['exp']) for c in cand))
# ---- planar pieces of the surface network, then thin the back streets: a minor piece goes while a block beside it is smaller than BLOCK_MIN
surf = [c for c in cand if not c['exp']]
BLOCK_MIN = 110.0     # u2 = 2,750 m2
def noded_pieces(items):
    lines = [c['line'] for c in items]
    tr = shapely.STRtree(lines)
    out = []
    for l in lines_of(unary_union(lines)):
        if l.length <= 0.05: continue
        mid = l.interpolate(0.5, normalized=True)
        ks = [int(k) for k in tr.query(mid.buffer(0.2))]
        k = min(ks, key=lambda j: (lines[j].distance(mid), 0 if items[j]['cls'] == 'major' else 1), default=None)
        if k is None: k = int(tr.nearest(mid))
        out.append(dict(items[k], line=l))
    return out
pieces = noded_pieces(surf)
print(' noded pieces', len(pieces))
def kkey(p): return (round(p[0], 1), round(p[1], 1))
for it in range(14):
    faces = [f for f in polygonize(unary_union([p['line'] for p in pieces] + [BOXP.boundary]))]
    ftree = shapely.STRtree(faces)
    area = [f.area for f in faces]
    side = collections.defaultdict(list)       # face -> [(length, piece index)]
    adj = {}
    for i, p in enumerate(pieces):
        if p['cls'] != 'minor': continue
        l = p['line']; m = l.interpolate(0.5, normalized=True); a = l.interpolate(max(0.0, l.length / 2 - 0.05)); b = l.interpolate(min(l.length, l.length / 2 + 0.05))
        dx, dz = b.x - a.x, b.y - a.y; n = math.hypot(dx, dz) or 1; nx, nz = dz / n * 0.08, -dx / n * 0.08
        fs = []
        for q in (Point(m.x + nx, m.y + nz), Point(m.x - nx, m.y - nz)):
            f = next((int(k) for k in ftree.query(q) if faces[int(k)].contains(q)), None); fs.append(f)
        adj[i] = fs
        for f in fs:
            if f is not None: side[f].append((l.length, i))
    kill = set(); touched = set()
    for f in sorted(range(len(faces)), key=lambda f: area[f]):
        if area[f] >= BLOCK_MIN: break
        if f in touched or not side.get(f): continue
        # the longest minor side whose other face is the smallest neighbour
        best = None
        for ln, i in side[f]:
            if i in kill: continue
            o = [g for g in adj[i] if g is not None and g != f]
            oa = area[o[0]] if o else 1e9
            if o and o[0] in touched: continue
            sc = (oa, -ln)
            if best is None or sc < best[0]: best = (sc, i, o)
        if best is None: continue
        kill.add(best[1]); touched.add(f)
        for g in best[2]: touched.add(g)
    # dead-end stubs
    pieces = [p for i, p in enumerate(pieces) if i not in kill]
    while True:
        deg = collections.Counter()
        for p in pieces:
            c = p['line'].coords; deg[kkey(c[0])] += 1; deg[kkey(c[-1])] += 1
        def dead(p):
            if p['cls'] != 'minor': return False
            c = p['line'].coords
            for e in (c[0], c[-1]):
                if deg[kkey(e)] == 1 and min(abs(e[0] - MINX), abs(e[0] - MAXX), abs(e[1] - MINZ), abs(e[1] - MAXZ)) > 0.3 and p['line'].length < 30: return True
            return False
        keep = [p for p in pieces if not dead(p)]
        if len(keep) == len(pieces): break
        pieces = keep
    print('  thin pass', it, 'removed', len(kill), 'pieces left', len(pieces), 'small faces', sum(1 for a in area if a < BLOCK_MIN)); sys.stdout.flush()
    if len(kill) < 8: break
# ---- chains through degree-2 nodes of the same street -> roads
def chain_up(pieces):
    segs = []
    for p in pieces:
        cs = [list(kkey(c)) for c in p['line'].coords]
        cs = [c for i, c in enumerate(cs) if i == 0 or c != cs[i - 1]]
        if len(cs) >= 2: segs.append((cs, p))
    deg = collections.Counter(); ends = collections.defaultdict(list)
    for i, (cs, r) in enumerate(segs):
        deg[tuple(cs[0])] += 1; deg[tuple(cs[-1])] += 1; ends[tuple(cs[0])].append(i); ends[tuple(cs[-1])].append(i)
    used = [False] * len(segs); chains = []
    def same(a, b): return a['cls'] == b['cls'] and a['exp'] == b['exp'] and a['bridge'] == b['bridge'] and a['tunnel'] == b['tunnel'] and (a['osm'] == b['osm'] or a['name'] == b['name'])
    for i, (cs, r) in enumerate(segs):
        if used[i]: continue
        used[i] = True; chain = list(cs)
        for head in (False, True):
            while True:
                n = tuple(chain[0] if head else chain[-1])
                if deg[n] != 2: break
                nxt = [j for j in ends[n] if not used[j] and same(segs[j][1], r)]
                if not nxt: break
                j = nxt[0]; used[j] = True; c2 = segs[j][0]
                if tuple(c2[0]) == tuple(c2[-1]): break
                if head: chain = (c2 if tuple(c2[-1]) == n else c2[::-1])[:-1] + chain
                else: chain = chain + (c2 if tuple(c2[0]) == n else c2[::-1])[1:]
        chains.append((chain, r))
    return chains
roads = []
def add_road(chain, c):
    L = sum(math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]) for i in range(len(chain) - 1))
    if L < 0.15: return None
    r = dict(id='road_%d' % len(roads), name=c['name'], **{'class': c['cls']}, expressway=bool(c['exp']), width=5.0 if c['cls'] == 'major' else 3.6, points=[[r1(a), r1(b)] for a, b in chain])
    if c['jname'] and c['jname'] != c['name']: r['nameJa'] = c['jname']
    if c['bridge']: r['bridge'] = True; r['layer'] = max(1, c['layer'])
    if c['tunnel']: r['tunnel'] = True
    r['osm'] = c['osm']; r['_hw'] = c['hw']; r['_len'] = L
    roads.append(r); return r
gnodes = []; gedges = []; nodes = {}
def nid(p):
    p = tuple(p)
    if p not in nodes: nodes[p] = len(gnodes); gnodes.append(list(p))
    return nodes[p]
for chain, c in chain_up(pieces):
    r = add_road(chain, c)
    if r is None: continue
    gedges.append(dict(a=nid(chain[0]), b=nid(chain[-1]), road=r['id'], **{'class': r['class']}, width=r['width'], length=r1(r['_len']), points=r['points']))
# expressways: chained per carriageway, not in the car graph
for chain, c in chain_up([c for c in cand if c['exp']]):
    add_road(chain, c)
print(' roads', len(roads), collections.Counter((r['class'], r['expressway']) for r in roads))
par = list(range(len(gnodes)))
def find(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
for e in gedges: par[find(e['a'])] = find(e['b'])
comp = collections.Counter(find(i) for i in range(len(gnodes)))
# drop the islands of the car graph that hang off nothing (a few nodes)
big = max(comp, key=lambda k: comp[k])
small = {k for k, v in comp.items() if v < 6}
dropr = {e['road'] for e in gedges if find(e['a']) in small and e['class'] == 'minor'}
if dropr:
    roads = [r for r in roads if r['id'] not in dropr]; gedges = [e for e in gedges if e['road'] not in dropr]
    idm = {r['id']: 'road_%d' % i for i, r in enumerate(roads)}
    for r in roads: r['id'] = idm[r['id']]
    for e in gedges: e['road'] = idm[e['road']]
    usedn = sorted({e['a'] for e in gedges} | {e['b'] for e in gedges}); nm = {o: i for i, o in enumerate(usedn)}
    gnodes = [gnodes[o] for o in usedn]
    for e in gedges: e['a'] = nm[e['a']]; e['b'] = nm[e['b']]
    par = list(range(len(gnodes)))
    for e in gedges: par[find(e['a'])] = find(e['b'])
    comp = collections.Counter(find(i) for i in range(len(gnodes)))
print(' graph nodes', len(gnodes), 'edges', len(gedges), 'components', sorted(comp.values(), reverse=True)[:8])
road_lines = [LineString(r['points']) for r in roads if not r['expressway'] and not r.get('tunnel')]; road_refs = [r for r in roads if not r['expressway'] and not r.get('tunnel')]
roadU_lines = shapely.STRtree(road_lines)
def road_dist(geom):
    k = roadU_lines.nearest(geom); return road_lines[int(k)].distance(geom), road_refs[int(k)]

# ======================================================================= zones
G0, _N0 = LMK.geom_index(prep)
PAL = unary_union([G0[k][1] for k in ('way/534754971', 'relation/5415394', 'way/675408602') if k in G0]).buffer(0)
PALP = sprep(PAL)
def zone_of(x, z):
    if PALP.contains(Point(x, z)): return 'imperial_palace'
    zn = zone_seed(x, z)
    return 'marunouchi' if zn == 'imperial_palace' and x > 30 else 'nagatacho' if zn == 'imperial_palace' and x < -250 else zn

# ======================================================================= landmarks (footprints first)
print('landmarks'); sys.stdout.flush()
lms, dropped = LMK.build(prep)
GINZA_ROT = math.radians(-42.0)
for e in lms:
    c = Point(e['x'], e['z'])
    e['grid'] = 'ginza' if abs(math.degrees(e['rot']) + 42) < 5 or abs(math.degrees(e['rot']) - 48) < 5 else 'local'
    if e['kind'] == 'bridge': e['onWater'] = True
    elif DECKP.contains(c): e['onPier'] = True
    elif waterBP.contains(c): e['onWater'] = True
print(' landmarks', len(lms), 'dropped', dropped)

# ======================================================================= buildings
print('buildings'); sys.stdout.flush()
UNDER = re.compile(r'地下街|地下駐車場|地下通路|Underground')
raw = []
for ref, t, p in prep['bld']:
    c = p.representative_point()
    if not BOXP.contains(c) or p.area < 0.6: continue
    if t.get('location') == 'underground' or t.get('building') in ('ship', 'no') or UNDER.search(t.get('name', '') + t.get('name:en', '')): continue
    if str(t.get('layer', '0')).strip().startswith('-') or str(t.get('level', '0')).strip().startswith('-') or str(t.get('building:levels', '1')).strip() in ('0',): continue
    if t.get('building') == 'construction' and not (t.get('height') or t.get('building:levels')): continue
    if t.get('building') in ('roof', 'carport', 'bridge') and not t.get('name'): continue
    if t.get('man_made') in ('bridge', 'tunnel') or t.get('highway') == 'elevator': continue
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
def datasf_h(p): return None
ptree = shapely.STRtree([p for r, t, p in prep['parts']])
def part_h(t):
    h = parse_h(t.get('height'))
    if h is None and t.get('building:levels'): h = (parse_h(t['building:levels']) or 0) * 3.6 + 2
    return h
B = []   # dicts: poly, hm, src, name, osm, tags, podiumOf
for ref, t, p in raw:
    h = parse_h(t.get('height')); src = 'osm:height'
    if h is not None and (h < 2.5 or h > 400): h = None
    if ref == 'way/145394394': h = 180.0   # the Marunouchi Building's height tag reads '18 m'
    lv = parse_h(t.get('building:levels'))
    ps = []
    for j in ptree.query(p):
        r2, t2, q = prep['parts'][int(j)]
        if t2.get('building:part') in ('antenna', 'no') or q.area < 4: continue
        if p.buffer(0.2).contains(q.representative_point()) and q.intersection(p).area > 0.6 * q.area:
            ph = part_h(t2)
            if ph: ps.append((ph, q, t2, r2))
    hmax = max([x[0] for x in ps], default=None)
    if h is None and lv and lv < 90 and not ps: h = lv * (3.9 if lv >= 20 else 3.4) + 1.5; src = 'osm:levels'
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
ltree = shapely.STRtree([unary_union([e['_poly']] + e.get('_extraPolys', [])) for e in lms])
for b in B:
    c = b['poly'].representative_point(); b['lm'] = None
    for j in ltree.query(b['poly']):
        e = lms[int(j)]
        if e['kind'] in ('prop', 'bridge') and e['id'] != 'imperial_palace_nijubashi': continue
        ep = unary_union([e['_poly']] + e.get('_extraPolys', []))
        if ep.buffer(0.3).contains(c) or ep.intersection(b['poly']).area > 0.5 * b['poly'].area:
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
CORE = {'marunouchi', 'otemachi', 'nihonbashi', 'ginza', 'yurakucho', 'shimbashi', 'shiodome', 'kasumigaseki', 'toranomon', 'akasaka', 'hamamatsucho', 'nagatacho', 'roppongi', 'tamachi', 'tsukiji'}
BAYSIDE = {'tsukishima', 'kachidoki', 'harumi', 'toyosu', 'shibaura', 'takeshiba', 'odaiba', 'takanawa', 'shiba'}
LOWT = {'house', 'detached', 'shed', 'garage', 'garages', 'hut', 'kiosk', 'toilets', 'shrine', 'temple', 'roof', 'service', 'greenhouse', 'carport'}
def typical(zone, a_m2, bt):
    if zone == 'imperial_palace' or bt in LOWT: return 6.0 if a_m2 < 400 else 9.0
    if bt in ('warehouse', 'industrial', 'hangar'): return 10.0 if a_m2 < 3000 else 14.0
    if bt in ('school', 'kindergarten', 'university', 'hospital', 'train_station', 'public', 'civic'): return 16.0
    if zone in CORE:
        return 9.5 if a_m2 < 60 else 17.0 if a_m2 < 160 else 26.0 if a_m2 < 450 else 33.0 if a_m2 < 1500 else 40.0
    if zone in ('tsukishima', 'takanawa'):
        return 7.0 if a_m2 < 90 else 10.0 if a_m2 < 220 else 20.0 if a_m2 < 600 else 34.0
    return 7.5 if a_m2 < 70 else 12.0 if a_m2 < 200 else 21.0 if a_m2 < 500 else 30.0 if a_m2 < 1500 else 34.0
known = [(b['poly'].centroid.x, b['poly'].centroid.y, b['hm'], b['poly'].area) for b in B if b['hm'] and b['hm'] < 100]
KX = np.array([(k[0], k[1]) for k in known]); KH = np.array([k[2] for k in known]); KA = np.array([k[3] for k in known])
import zlib
for b in B:
    c = b['poly'].centroid; b['zone'] = zone_of(c.x, c.y)
    if not b['hm']:
        a = b['poly'].area; bt = b['tags'].get('building', 'yes')
        typ = typical(b['zone'], a / (SCALE * SCALE), bt)
        d = np.hypot(KX[:, 0] - c.x, KX[:, 1] - c.y)
        sel = (d < 30) & (KA > a * 0.4) & (KA < a * 2.5)
        if sel.sum() >= 3 and bt not in LOWT and b['zone'] != 'imperial_palace':
            idx = np.argsort(np.where(sel, d, 1e9))[:9]; idx = idx[sel[idx]]
            h = 0.5 * typ + 0.5 * float(np.median(KH[idx])); b['src'] = 'heuristic:zone-typical+neighbour-median'
        else: h = typ; b['src'] = 'heuristic:zone-typical'
        j = (zlib.crc32(b['osm'].encode()) % 1000) / 1000.0
        b['hm'] = h * (0.82 + 0.36 * j)
    b['hm'] = max(3.0, float(b['hm'])); b['hmax'] = b['hm']; b['n'] = 1
print(' buildings before merge', len(B), collections.Counter(b['src'].split(' ')[0] for b in B))
# ---- merge (mergeNote)
def mrect(p):
    r = p.minimum_rotated_rectangle
    if r.geom_type != 'Polygon': return 1e9, 0
    c = list(r.exterior.coords); a = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]); bb = math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])
    return max(a, bb), (p.area / (a * bb) if a * bb > 0 else 0)
GAP = 0.5
def join(pa, pb):
    u = unary_union([pa, pb]).buffer(GAP * 0.6, join_style=2).buffer(-GAP * 0.6, join_style=2)
    if u.geom_type != 'Polygon':
        ps = polys_of(u)
        if len(ps) != 1: return None
        u = ps[0]
    return Polygon(u.exterior)
def merge_pass(B, fill, side, ratio, hcap, only_small=None, same_zone=False, area_cap=420.0):
    tree = shapely.STRtree([b['poly'] for b in B]); done = set(); out = []; merged = 0
    for i in sorted(range(len(B)), key=lambda i: B[i]['poly'].area):
        if i in done: continue
        a = B[i]
        if a['lm'] or a.get('tower') or a['hm'] >= hcap or (only_small and a['poly'].area >= only_small): continue
        best = None
        for j in tree.query(a['poly'].buffer(GAP + 0.02)):
            j = int(j)
            if j == i or j in done: continue
            c = B[j]
            if c['lm'] or c.get('tower') or c['hm'] >= hcap or c['pier'] != a['pier']: continue
            if max(a['hm'], c['hm']) / min(a['hm'], c['hm']) > ratio: continue
            if c['zone'] != a['zone'] and same_zone: continue
            if a['poly'].distance(c['poly']) > GAP: continue
            if a['poly'].area + c['poly'].area > area_cap: continue
            score = abs(a['hm'] - c['hm'])
            if best is None or score < best[0]: best = (score, j)
        if best is None: continue
        j = best[1]; c = B[j]
        u = join(a['poly'], c['poly'])
        if u is None: continue
        mx, fl = mrect(u)
        if mx > side or fl < fill: continue
        if any(road_lines[int(k)].intersects(u.buffer(-0.25)) for k in roadU_lines.query(u)): continue
        aa, ca = a['poly'].area, c['poly'].area
        big = a if aa >= ca else c
        nb = dict(big); nb.update(poly=u, hm=(a['hm'] * aa + c['hm'] * ca) / (aa + ca), hmax=max(a['hmax'], c['hmax']), n=a['n'] + c['n'],
                  name=big['name'] or (a['name'] if a is not big else c['name']), srcs=set(a.get('srcs', {a['src']})) | set(c.get('srcs', {c['src']})))
        done.add(i); done.add(j); out.append(nb); merged += 1
    out += [b for i, b in enumerate(B) if i not in done]
    return out, merged
B = [b for b in B if not (b['lm'] and b['poly'].area < 4.0)]      # the mapped legs / decks / lift shafts of Tokyo Tower and other fragments under a landmark
for k in range(14):
    B, m = merge_pass(B, 0.56, 24.0, 2.0, 60.0)
    print('  merge pass', k, 'merged', m, 'left', len(B)); sys.stdout.flush()
    if m < 15: break
for k in range(8):
    B, m = merge_pass(B, 0.38, 26.0, 3.5, 60.0, only_small=64.0)
    print('  sliver pass', k, 'merged', m, 'left', len(B)); sys.stdout.flush()
    if m < 10: break
GAP = 1.1      # across the back alleys that the road thinning dropped (never across a kept street)
for k in range(8):
    B, m = merge_pass(B, 0.36, 28.0, 3.5, 60.0, only_small=110.0, area_cap=520.0)
    print('  block pass', k, 'merged', m, 'left', len(B)); sys.stdout.flush()
    if m < 10: break
# isolated crumbs: single houses, sheds and kiosks that merged with nothing
CRUMB = 6.0
B = [b for b in B if b['lm'] or b['poly'].area >= CRUMB or b['hm'] >= 40]
print(' buildings after merge', len(B))
# ---- finish
RES = {'apartments', 'residential', 'dormitory', 'terrace', 'semidetached_house'}
HOUSE = {'house', 'detached', 'hut', 'shed', 'garage', 'garages'}
ZAK = {'shimbashi', 'ginza', 'nihonbashi', 'yurakucho', 'hamamatsucho', 'akasaka', 'roppongi', 'toranomon', 'tsukiji', 'tamachi', 'shiba', 'otemachi', 'kachidoki', 'tsukishima', 'takanawa', 'shibaura'}
def style_of(b, area_m2):
    h, z, t = b['hm'], b['zone'], b['tags']
    bt = t.get('building', 'yes'); unit = area_m2 / max(1, b['n'])
    if h >= 120: return 'glasstower'
    if h >= 60: return 'apartment' if (bt in RES and h < 75) else 'glassslab'
    if b['pier'] or bt in ('warehouse', 'industrial', 'hangar'): return 'warehouse'
    if z in ('harumi', 'toyosu', 'shibaura', 'takeshiba', 'kachidoki', 'odaiba') and h < 16 and area_m2 > 1200 and bt not in RES: return 'warehouse'
    if bt in HOUSE and h < 14: return 'house'
    if h <= 11.5 and unit < 190 and bt not in ('office', 'commercial', 'retail', 'hotel', 'public', 'school'): return 'house'
    if bt in RES and h >= 11.5: return 'apartment'
    if 11.5 < h <= 45 and unit < 330 and z in ZAK and bt not in ('public', 'school', 'hotel', 'train_station', 'university', 'hospital'): return 'zakkyo'
    if z in ('tsukishima', 'kachidoki', 'harumi', 'toyosu', 'shibaura', 'takanawa', 'odaiba') and h >= 15 and bt not in ('office', 'commercial', 'retail', 'hotel', 'public', 'school', 'train_station', 'university'): return 'apartment'
    if h < 15: return 'lowrise'
    return 'midrise'
out_b = []
keyid = {}
B.sort(key=lambda b: (-b['hm'] if b['hm'] >= 60 else 0, round(b['poly'].centroid.y), b['poly'].centroid.x))
for i, b in enumerate(B):
    p = b['poly']
    fp = ring_of(p, 0.12)
    if len(fp) < 3: continue
    cx, cz, w, d, rot = obb(p)
    b['w'], b['d'] = w, d
    if not (MINX + 0.3 <= cx <= MAXX - 0.3 and MINZ + 0.3 <= cz <= MAXZ - 0.3): continue
    bid = 'b%d' % len(out_b)
    if b.get('tower'): keyid[b['key']] = bid
    dr, rd = road_dist(p)
    area_m2 = p.area / (SCALE * SCALE)
    srcs = b.get('srcs') or {b['src']}
    e = dict(id=bid, footprint=fp, cx=r1(cx), cz=r1(cz), rot=round(rot, 3), w=r1(max(w, 0.6)), d=r1(max(d, 0.6)), height=r1(b['hm'] * SCALE), levels=max(1, int(round(b['hm'] / 3.4))),
             landmark=b['lm'], name=b['name'] or '', heightSource='+'.join(sorted(s.split(' (')[0] for s in srcs)) + (' merged x%d (area-weighted)' % b['n'] if b['n'] > 1 else ''),
             heightMetres=round(b['hm'], 1), osm=b['osm'], aabb=[r1(v) for v in p.bounds])
    # frontage: avenue = the block face on a north-south (north grid) / numbered (SoMa) street
    e['frontage'] = 'avenue' if (rd['class'] == 'major' and dr < 4.0) else 'street'
    e['zone'] = b['zone']
    if not b['lm']: e['style'] = style_of(b, area_m2)
    if b['n'] > 1: e['merged'] = b['n']; e['heightMaxMetres'] = round(b['hmax'], 1)
    if b.get('podiumKey'): e['_pk'] = b['podiumKey']
    if b['pier'] or waterBP.contains(Point(cx, cz)): e['onPier'] = True
    e['_skip'] = (0 if b['lm'] or b['hm'] >= 30 else (2.0 if dr > 3.4 else 0.6 if e['frontage'] == 'street' else 0.0) + 1.0 / (1.0 + area_m2 / 150.0) + 1.0 / (1.0 + b['hm'] / 8.0))
    out_b.append(e)
for e in out_b:
    if '_pk' in e:
        k = e.pop('_pk')
        if k in keyid: e['podiumOf'] = keyid[k]
cand_skip = sorted([e for e in out_b if e['_skip'] > 0], key=lambda e: -e['_skip'])
for e in cand_skip[:int(0.30 * len(out_b))]: e['phoneSkip'] = True
for e in out_b: del e['_skip']
print(' buildings out', len(out_b), collections.Counter(e.get('style') for e in out_b), collections.Counter(e['zone'] for e in out_b))
bpolys = [Polygon(e['footprint']) for e in out_b]; btree = shapely.STRtree(bpolys)
for e in lms:
    best = None
    for j in btree.query(e['_poly']):
        if out_b[int(j)]['landmark'] == e['id']:
            a = bpolys[int(j)].area
            if best is None or a > best[0]: best = (a, out_b[int(j)]['id'])
    if best: e['footprintId'] = best[1]

pickle.dump(dict(water=water, waterFinal=waterFinal, waterB=waterB, DECK=DECK, over=over, fing=fing, roads=roads, gnodes=gnodes, gedges=gedges, lms=lms, dropped=dropped, LAND=LAND, tidal=tidal, PAL=PAL,
                 buildings=out_b, ponds=ponds, comp=sorted(comp.values(), reverse=True)), open(sys.argv[5], 'wb'), protocol=4)
print('cached')
