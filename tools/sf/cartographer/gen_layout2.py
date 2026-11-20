"""Stage 3: parks, paths, bridges, sites; writes sf_layout.json + landmark_sites.json.
Usage: python3 -I gen_layout2.py <prep.pickle> <scriptdir> <stage2.pickle> <out sf_layout.json> <out landmark_sites.json>"""
import sys, math, json, re, pickle, collections
sys.path.insert(0, sys.argv[2])
from sfgeo import *
from landmarks import parse_h, rect, compass
from lm_info import DISTRICTS
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
from shapely.prepared import prep as sprep
prep = load(sys.argv[1]); S2 = load(sys.argv[3])
BOXP = sbox(MINX, MINZ, MAXX, MAXZ)
waterFinal, waterB, DECK = S2['waterFinal'], S2['waterB'], S2['DECK']
roads, lms, out_b = S2['roads'], S2['lms'], S2['buildings']
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
    a = sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
    return ring if a < 0 else ring[::-1]
def ring_of(p, tol=0.12):
    if p.geom_type != 'Polygon': p = max(polys_of(p), key=lambda g: g.area)
    q = p.simplify(tol) if tol else p
    if q.is_empty or q.geom_type != 'Polygon': q = p
    return ccw(ring1(list(q.exterior.coords)))
wetAll = unary_union([waterFinal] + [p for r, t, p in S2['ponds']])
wetP = sprep(wetAll)
def wet(x, z): return wetP.contains(Point(x, z))
bpolys = [Polygon(e['footprint']).buffer(0) for e in out_b]
btree = shapely.STRtree(bpolys)
lmpolys = [e['_poly'] for e in lms]
solid = unary_union([p for p, e in zip(bpolys, out_b)] + [e['_poly'] for e in lms if e['kind'] != 'district'])
def free_half(x, z, cap=90.0):
    return round(min(cap, solid.distance(Point(x, z))), 1)

# ======================================================================= parks
parks = []
LAWN_NAMES = re.compile(r"Washington Square|Civic Center Plaza|Levi|South Park|Huntington|Sue Bierman|Rincon Park|Victoria Park|Pioneer Park|Yerba Buena Gardens|Maritime Garden|Helen Wills|Joe DiMaggio|Ina Coolbrith|Sydney G. Walton|Walton Square", re.I)
oracle = next(e['_poly'] for e in lms if e['id'] == 'oracle_park')
def add_park(name, kind, surface, p, osm, src=None):
    for q in polys_of(p.intersection(BOXP)):
        if q.area < 1.2 and not name: continue
        if q.area < 0.4: continue
        fp = ring_of(q, 0.12)
        if len(fp) < 3: continue
        e = dict(id='park_%d' % len(parks), name=name or '', kind=kind, polygon=fp, osm=osm)
        if surface: e['surface'] = surface
        if src: e['src'] = src
        parks.append(e)
for ref, t, p in prep['areas']:
    if p is None or not p.intersects(BOXP): continue
    if t.get('location') == 'underground' or t.get('indoor') == 'yes' or (parse_h(t.get('layer')) or 0) < 0: continue
    nm = t.get('name', '')
    le, lu, na, am, hw = t.get('leisure'), t.get('landuse'), t.get('natural'), t.get('amenity'), t.get('highway')
    kind = surface = None
    if le in ('park', 'playground', 'dog_park', 'common', 'recreation_ground') or lu in ('grass', 'recreation_ground', 'village_green', 'meadow', 'greenfield') or na in ('grassland',):
        kind, surface = 'lawn', 'grass'
    elif le == 'pitch':
        if oracle.contains(p.centroid): continue
        kind, surface = 'lawn', 'grass'
    elif le == 'garden' or lu in ('flowerbed',) or na in ('shrubbery', 'scrub'): kind, surface = 'garden', 'planting'
    elif na == 'wood' or lu == 'forest': kind, surface = 'garden', 'trees'
    elif na in ('beach', 'sand'): kind, surface = 'beach', 'sand'
    elif hw == 'pedestrian' or t.get('place') == 'square' or lu == 'plaza' or le == 'plaza': kind, surface = 'plaza', 'paved'
    elif am == 'parking' and t.get('parking', 'surface') == 'surface' and 'building' not in t and p.area >= 14: kind, surface = 'plaza', 'parking'
    else: continue
    if nm and re.search(r'\b(Plaza|Square)\b', nm) and not LAWN_NAMES.search(nm) and kind == 'lawn': kind, surface = 'plaza', 'paved'
    if 'Salesforce Park' in nm: kind, surface = 'garden', 'planting'
    if kind != 'plaza' and waterB.contains(p.centroid) and not DECK.contains(p.centroid): continue
    add_park(nm, kind, surface, p, ref)
# the sand of Aquatic Park cove
aq = prep['LAND'].intersection(sbox(MINX, -345, -303, -296)).intersection(waterB.buffer(3.2))
for q in polys_of(aq):
    if q.area > 20: add_park('Aquatic Park Beach', 'beach', 'sand', q, 'natural=coastline (Aquatic Park cove shore, 16 m strip)')
# pier decks
over = S2['over']
for q in polys_of(DECK):
    if q.area < 1.0: continue
    best = ('', 0, '')
    for ref, nm, p in over:
        if nm and p.intersects(q):
            a = p.intersection(q).area
            if a > best[1]: best = (nm, a, ref)
    nm = best[0]
    if not nm:
        near = [(e['_poly'].distance(q), e) for e in lms if e['id'].startswith('pier_') or e['id'] in ('exploratorium_pier_15', 'ferry_building')]
        d, e = min(near, key=lambda v: v[0])
        if d < 0.5: nm = e['name'] if e['id'].startswith('pier_') else {'exploratorium_pier_15': 'Pier 15', 'ferry_building': 'Ferry Building pier'}[e['id']]
    add_park(nm, 'plaza', 'pier', q, best[2] or 'natural=coastline (pier finger)')
WANT = ['Union Square', 'Washington Square', 'Portsmouth Square', 'Huntington Park', 'Embarcadero Plaza', 'Sue Bierman Park', 'Rincon Park', 'Yerba Buena Gardens', 'Civic Center Plaza', 'United Nations Plaza', 'South Park', 'Salesforce Park', 'Pioneer Park', "Levi", 'Aquatic Park', 'Victoria Park']
for w in WANT: print('  park', w, [(p['name'], p['kind'], len(p['polygon'])) for p in parks if w.lower() in p['name'].lower()][:4])
print(' parks', len(parks), collections.Counter((p['kind'], p.get('surface')) for p in parks))
green = unary_union([Polygon(p['polygon']).buffer(0) for p in parks if p.get('surface') != 'parking']).buffer(0.6)
greenP = sprep(green)

# ======================================================================= paths
paths = []
for ref, t, g, ids in prep['roads']:
    hw = t.get('highway')
    if hw not in ('footway', 'path', 'steps', 'pedestrian', 'cycleway'): continue
    if t.get('footway') in ('sidewalk', 'crossing', 'access_aisle', 'traffic_island', 'link') or t.get('tunnel') or t.get('indoor') or t.get('location') == 'underground' or (parse_h(t.get('layer')) or 0) < 0 or t.get('level', '0').startswith('-'): continue
    if t.get('cycleway') == 'crossing' or t.get('path') == 'crossing': continue
    l = LineString(g)
    if not l.intersects(BOXP): continue
    for q in lines_of(l.intersection(BOXP)):
        if q.length < 2.5: continue
        inpark = greenP.contains(q.interpolate(0.5, normalized=True))
        if not (inpark or t.get('name') or t.get('bridge') or hw == 'steps' and q.length > 4 or hw == 'cycleway'): continue
        e = dict(id='path_%d' % len(paths), kind='footway' if hw == 'pedestrian' else hw, name=t.get('name', ''), width=0.8 if hw in ('pedestrian', 'cycleway') else 0.6, surface=t.get('surface', 'paved'), points=ring1(list(q.simplify(0.1).coords)), _len=q.length, _park=inpark)
        if t.get('bridge'): e['bridge'] = True
        if len(e['points']) >= 2: paths.append(e)
paths.sort(key=lambda e: (-(e['_park'] or bool(e['name'])), -e['_len']))
paths = paths[:1100]
for i, e in enumerate(paths): e['id'] = 'path_%d' % i; del e['_len']; del e['_park']
print(' paths', len(paths), collections.Counter(p['kind'] for p in paths))

# ======================================================================= bridges
bridges = []
def add_bridge(name, pts, typ, carries, width, deck):
    l = LineString(pts)
    if l.length < 3: return
    a, b = pts[0], pts[-1]; c = l.interpolate(0.5, normalized=True)
    rot = math.atan2(-(b[1] - a[1]), b[0] - a[0])
    ow = l.intersection(waterB).length / l.length
    bridges.append(dict(id='bridge_%d' % len(bridges), name=name, x=r1(c.x), z=r1(c.y), rot=round(rot, 3), length=r1(l.length), width=width, type=typ, carries=carries, overWater=round(ow, 2), deckHeightMetres=deck, points=pts))
for r in roads:
    if r.get('bridge'):
        hw = r['_hw']
        mov = 'Third Street' in r['name'] or '3rd Street' in r['name'] or '4th Street' in r['name'] or 'Fourth Street' in r['name']
        over_w = LineString(r['points']).intersects(waterB)
        typ = 'freeway_viaduct' if r['expressway'] else 'bascule' if (mov and over_w) else 'overpass'
        add_bridge(r['name'] or ('I-80 viaduct' if r['expressway'] else 'overpass'), r['points'], typ, 'road', r['width'], 15.0 if r['expressway'] else 6.0)
for e in paths:
    if e.get('bridge'): add_bridge(e['name'] or 'footbridge', e['points'], 'footbridge', 'path', 0.8, 6.0)
print(' bridges', len(bridges), collections.Counter(b['type'] for b in bridges))

# ======================================================================= sites
L = {e['id']: e for e in lms}
B0 = dict(minX=MINX, maxX=MAXX, minZ=MINZ, maxZ=MAXZ)
obst = unary_union([solid, DECK, prep['LAND'].intersection(BOXP.buffer(80))])
def water_clear(x, z): return obst.distance(Point(x, z))
def best_water(tx, tz, radius, need, edge=14.0, step=4.0):
    best = None
    for x in np.arange(tx - radius, tx + radius + 1, step):
        for z in np.arange(tz - radius, tz + radius + 1, step):
            if not (MINX + edge <= x <= MAXX - edge and MINZ + edge <= z <= MAXZ - edge): continue
            if not wet(x, z): continue
            c = water_clear(x, z)
            sc = min(c, need) * 3 - math.hypot(x - tx, z - tz)
            if best is None or sc > best[0]: best = (sc, float(x), float(z), c)
    return best
fb = L['ferry_building']
t = best_water(fb['x'] + 95, fb['z'] - 75, 70, 46)
px, pz, pc = round(t[1]), round(t[2]), t[3]
aim = ((fb['x'] * 2 + L['embarcadero_center_4']['x'] + L['california_101']['x']) / 4, (fb['z'] * 2 + L['embarcadero_center_4']['z'] + L['california_101']['z']) / 4)
fx, fz = aim[0] - px, aim[1] - pz; n = math.hypot(fx, fz); fx, fz = fx / n, fz / n
spawn_player = dict(x=px, z=pz, rot=round(math.atan2(fx, fz), 3), facing=[round(fx, 3), round(fz, 3)], openWater=round(pc, 1),
    note="Rises from San Francisco Bay off the Embarcadero, north-east of the Ferry Building beyond the ends of Piers 1 to 7, and wades south-west: the Ferry Building clock tower stands dead ahead with the four Embarcadero Center slabs and the Financial District behind it, the Transamerica Pyramid to the right, Salesforce Tower and the Bay Bridge anchorage to the left. rot = rotation.y that turns a +Z-forward model to face the facing vector.")
def crossing(names, edge, inset=6.0):
    best = None
    for r in roads:
        if r['name'] not in names or r['expressway']: continue
        for k in (0, -1):
            p = r['points'][k]; q = r['points'][1 if k == 0 else -2]
            on = {'s': abs(p[1] - MAXZ) < 0.2, 'n': abs(p[1] - MINZ) < 0.2, 'w': abs(p[0] - MINX) < 0.2, 'e': abs(p[0] - MAXX) < 0.2}[edge]
            if on:
                d = math.hypot(q[0] - p[0], q[1] - p[1]); l = LineString(r['points'] if k == 0 else r['points'][::-1])
                pt = l.interpolate(min(inset, l.length))
                if best is None or r['class'] == 'major': best = (round(pt.x, 1), round(pt.y, 1), r['name'])
    return best
AP = [
 ('van_ness_south', ['South Van Ness Avenue', 'Van Ness Avenue'], 's', 'South Van Ness Ave north to Market St and up Van Ness (US 101) past City Hall'),
 ('market_street_southwest', ['Market Street'], 's', 'Market St north-east from the Castro and Upper Market toward the Ferry Building'),
 ('lombard_street_west', ['Lombard Street'], 'w', 'Lombard St (US 101) east from the Marina and the Golden Gate Bridge'),
 ('bay_street_west', ['Bay Street'], 'w', "Bay St east from the Marina and Fort Mason to Fisherman's Wharf"),
 ('california_street_west', ['California Street', 'Pine Street', 'Bush Street'], 'w', 'California St east from Pacific Heights over Nob Hill on the cable-car line'),
 ('broadway_west', ['Broadway'], 'w', 'Broadway east from Pacific Heights through the tunnel to Chinatown and North Beach'),
 ('third_street_south', ['3rd Street', 'Third Street'], 's', 'Third St north from Mission Bay over the Lefty O\'Doul Bridge past the ballpark'),
 ('seventh_street_south', ['7th Street', '8th Street', '4th Street'], 's', 'north-west out of Mission Bay and Potrero Hill into SoMa'),
]
approaches = []
for label, names, edge, note in AP:
    c = None
    for nm in names:
        c = crossing([nm], edge)
        if c: break
    if c is None: print('  !! no crossing for', label); continue
    approaches.append(dict(x=c[0], z=c[1], label=label, road=c[2], edge=edge, note=note))
print(' approaches', [(a['label'], a['x'], a['z'], a['road']) for a in approaches])
def bay(tx, tz, label, note, radius=30, need=30):
    t = best_water(tx, tz, radius, need, edge=6.0)
    return dict(x=round(t[1], 1), z=round(t[2], 1), label=label, note=note + ' (open water %d u)' % t[3])
p39 = L['pier_39']
enemies = [
 bay(p39['x'] + 50, MINZ + 14, 'bay_north_pier_39', 'from the Bay off Pier 39 and Pier 35, north edge, Alcatraz behind'),
 bay(MAXX - 12, 60, 'bay_east_bay_bridge', 'from the Bay under the west span of the Bay Bridge off Rincon Park, east edge'),
 bay(308, 352, 'mccovey_cove', 'from McCovey Cove (China Basin) beside Oracle Park, south-east', radius=22, need=12),
]
for a in approaches:
    if a['label'] in ('van_ness_south', 'market_street_southwest', 'lombard_street_west', 'third_street_south'):
        enemies.append(dict(x=a['x'], z=a['z'], label=a['label'], note=a['note']))
# ---- duel
def best_dry(poly, need=11.0, prefer=None):
    best = None
    x0, z0, x1, z1 = poly.bounds
    for x in np.arange(x0, x1 + 0.1, 1.0):
        for z in np.arange(z0, z1 + 0.1, 1.0):
            if not poly.contains(Point(x, z)) or wet(x, z): continue
            c = solid.distance(Point(x, z)); sc = min(c, need + 4) - (0.05 * math.hypot(x - prefer[0], z - prefer[1]) if prefer else 0)
            if best is None or sc > best[0]: best = (sc, float(x), float(z), c)
    return best
def park_poly(rx):
    ps = [Polygon(p['polygon']).buffer(0) for p in parks if re.search(rx, p['name'])]
    return unary_union(ps)
ep = park_poly(r'Embarcadero Plaza|Justin Herman'); cc = park_poly(r'Civic Center Plaza')
vf = L['vaillancourt_fountain']
if ep.is_empty: ep = Point(vf['x'] + 6, vf['z'] + 10).buffer(12)
if cc.is_empty: cc = Point(L['sf_city_hall']['x'] + 30, L['sf_city_hall']['z'] - 4).buffer(10)
ta = best_dry(ep.buffer(3), prefer=(ep.centroid.x, ep.centroid.y)); tb = best_dry(cc.buffer(-2), prefer=(cc.centroid.x, cc.centroid.y))
ax, az, bx, bz = round(ta[1]), round(ta[2]), round(tb[1]), round(tb[2])
def face(ax, az, bx, bz): return round(math.atan2(bx - ax, bz - az), 3)
duel = dict(a=dict(x=ax, z=az, rot=face(ax, az, bx, bz), note='player: Embarcadero Plaza at the foot of Market St, the Ferry Building and the Bay behind, the Vaillancourt Fountain and the Hyatt Regency alongside (clear of buildings %.1f u)' % ta[3]),
            b=dict(x=bx, z=bz, rot=face(bx, bz, ax, az), note='rival: Civic Center Plaza, the dome of City Hall directly behind, the Asian Art Museum and the Main Library on the east side (clear of buildings %.1f u)' % tb[3]),
            note='VS Duel: the two kaiju face each other down the length of Market St, about %d u apart (kaijuDuel.js findDuelSpawns searches +-60 u round each).' % math.hypot(ax - bx, az - bz))
# ---- soldier: California St at Grant Ave, looking east down the hill
cal = unary_union([LineString(r['points']) for r in roads if r['name'] == 'California Street']); gr = unary_union([LineString(r['points']) for r in roads if r['name'] == 'Grant Avenue'])
ip = cal.intersection(gr).centroid
ex, ez = math.sin(math.radians(81)), -math.cos(math.radians(81))
sx, sz = ip.x - ex * 5, ip.y - ez * 5
pt = cal.interpolate(cal.project(Point(sx, sz))); sx, sz = round(pt.x, 1), round(pt.y, 1)
soldier = dict(x=sx, z=sz, rot=round(math.atan2(ex, ez), 3), facing=[round(ex, 3), round(ez, 3)], freeHalf=free_half(sx, sz),
    note="Lone Soldier start: California St just west of Grant Avenue on the cable-car line at the edge of Chinatown, facing east down the hill: Old St. Mary's and the Sing Chong pagoda corner at the crossing ahead, the canyon of the Financial District (555 California on the right, 345 California and 101 California beyond) and the Bay Bridge towers at the end of the street.")
# ---- ring
print(' ring search'); sys.stdout.flush()
expU = unary_union([LineString(r['points']) for r in roads if r['expressway']])
vol = [(p, e) for p, e in zip(bpolys, out_b) if not e['landmark']]
MK0 = (93.4, 42.2); SD = (0.709, -0.705); TD = (0.705, 0.709)
cands = []
for x in np.arange(-190, 190, 4.0):
    for z in np.arange(150, MAXZ - 80, 4.0):
        s = ((x - MK0[0]) * SD[0] + (z - MK0[1]) * SD[1]) / SCALE; t = ((x - MK0[0]) * TD[0] + (z - MK0[1]) * TD[1]) / SCALE
        if t < 250: continue
        vb = sbox(x - 58, z - 78, x + 48, z + 78)
        if any(abs(e['x'] - x) <= 47 and abs(e['z'] - z) <= 47 for e in lms): continue
        if wetAll.intersects(vb.buffer(4)): continue
        lmhit = sum(1 for e in lms if e['kind'] != 'district' and e['_poly'].intersects(vb))
        fw = expU.intersection(vb).length
        v = 0; tall = 0
        for j in btree.query(vb):
            e = out_b[int(j)]
            if e['landmark']: continue
            a = bpolys[int(j)].intersection(vb).area
            v += a * e['heightMetres']; tall += (e['heightMetres'] >= 45 and a > 4)
        mat = sbox(x - 46, z - 46, x + 46, z + 46)
        cands.append((v / 1000 + fw * 25 + tall * 150 + lmhit * 3000 + expU.intersection(mat).length * 40, float(x), float(z), round(v / 1000), round(fw), tall, lmhit))
cands.sort()
for c in cands[:8]: print('   ring cand score %.0f at %.0f,%.0f vol %s freeway %s tall %s lmhit %s' % c, ll(c[1], c[2]))
_, rx, rz, rv, rfw, rtall, rlm = cands[0]
rx, rz = round(rx), round(rz)
vbox = [rx - 58, rz - 78, rx + 48, rz + 78]
inbox = [dict(id=e['id'], name=e['name'], heightMetres=e['heightMetres']) for p, e in zip(bpolys, out_b) if p.intersects(sbox(*vbox)) and e['heightMetres'] >= 30 and not e['landmark']]
def clear_dir(dx, dz):
    for d in range(46, 140):
        px, pz = rx + dx * d, rz + dz * d
        for j in btree.query(Point(px, pz).buffer(3)):
            if out_b[int(j)]['heightMetres'] >= 25 and bpolys[int(j)].distance(Point(px, pz)) < 3: return d
    return 140
ring = dict(x=rx, z=rz, east=0, west=0, rot=0, clear=round(min(e['_poly'].distance(Point(rx, rz)) for e in lms), 1), clearNote='distance (u) from the ring centre to the nearest landmark footprint',
            clearToBuildings=dict(north=clear_dir(0, -1), south=clear_dir(0, 1), west=clear_dir(-1, 0), east=clear_dir(1, 0)),
            venueBox=vbox, runwayBox=[rx + 48, rz - 17, rx + 73, rz + 17], matWaterShare=0, venueWaterShare=0,
            landmarkCentresWithin46=[e['id'] for e in lms if abs(e['x'] - rx) <= 46 and abs(e['z'] - rz) <= 46],
            inVenueBox=[e['id'] for e in lms if e['kind'] != 'district' and e['_poly'].intersects(sbox(*vbox))],
            tallInVenueBox=inbox, freewayInVenueBox=rfw,
            title='GOLDEN GATE HEAVYWEIGHT CHAMPIONSHIP', place='SOUTH OF MARKET', ringClearTrees=vbox,
            chicagoVenue=dict(half=42, matHalf=45.5, clearHalf=60, venueX=[-58, 48], rampToX=73, venueZ=[-78, 78]))
la, lo = ll(rx, rz)
ring['note'] = ("Title Match ring in low-rise South of Market at about %.4f, %.4f: the blocks of one- to four-storey brick-and-timber warehouses, workshops and car parks; the level leaves out the blocks inside venueBox in that mode. "
                "The downtown skyline (Salesforce Tower, 181 Fremont, the Marriott 'jukebox', the PacBell Building) rises to the north-east, City Hall's dome to the west. venueBox [minX, minZ, maxX, maxZ] = the Chicago venue x -58..+48, z -78..+78 with both grandstands; "
                "runwayBox = the entrance runway and gate (x +48..+73); east / west = 0 (nothing pulled in). No landmark centre lies within 46 u on both axes; the box is dry. clearToBuildings = distance from the centre to the first building of 25 m or more in each direction. "
                "tallInVenueBox lists generic buildings of 30 m or more whose footprints fall in the box (not built in that mode); freewayInVenueBox = length (u) of elevated I-80 inside the box.") % (la, lo)
print(' ring', rx, rz, ring['clearToBuildings'], ring['inVenueBox'], len(inbox))

# ======================================================================= minimap, meta, write
labels = [dict(text=n.upper(), x=r1(xz(lo, la)[0]), z=r1(xz(lo, la)[1])) for id_, n, la, lo in DISTRICTS if id_ != 'lombard_street']
icons = [dict(id=e['id'], x=e['x'], z=e['z']) for e in lms if e['tier'] == 'A']
landmarks = []
for e in lms:
    d = {k: v for k, v in e.items() if not k.startswith('_')}
    order = ['id', 'name', 'x', 'z', 'rot', 'w', 'd', 'height', 'heightMetres', 'eaveHeight', 'eaveMetres', 'tier', 'kind', 'front', 'frontBearing', 'frontDir', 'grid', 'desc', 'latLon', 'footprintId', 'osm', 'dataRoofMetres', 'onPier', 'onWater']
    landmarks.append({k: d[k] for k in order if k in d})
for id_, n, la, lo in DISTRICTS:
    x, z = xz(lo, la)
    landmarks.append(dict(id=id_, name=n, x=r1(x), z=r1(z), rot=0.0, w=0.0, d=0.0, height=0.0, heightMetres=0, eaveHeight=0.0, eaveMetres=0, tier='C', kind='district', front='S', frontBearing=180, frontDir=[0.0, 1.0],
                          grid='north_of_market' if id_ != 'soma' else 'soma', desc='District name for the map only; nothing is built for this entry.' if id_ != 'lombard_street' else "The crooked block of Lombard St between Hyde and Leavenworth on Russian Hill: eight tight brick-paved switchbacks between hydrangea beds, one-way downhill east (roads: the entry with crooked: true). Name for the map only.", latLon=[la, lo]))
for r in roads: r.pop('_hw', None)
sites = {'player': spawn_player, 'duel.a': duel['a'], 'duel.b': duel['b'], 'soldier': soldier, 'ring': ring}
for e in enemies: sites['enemy.' + e['label']] = e
siteChecks = {k: dict(buildingFreeHalf=free_half(v['x'], v['z']), treesWithin6=0, inWater=bool(wet(v['x'], v['z']))) for k, v in sites.items()}
meta = dict(version=1, name='San Francisco (downtown and the northern waterfront)', scale=SCALE, scaleNote='game units per real metre; uniform, no compression',
    originLatLon=[LAT0, LON0], originNote='Chinatown / Financial District edge: Kearny St between California and Sacramento Streets',
    transamericaPyramidXZ=[L['transamerica_pyramid']['x'], L['transamerica_pyramid']['z']], ferryBuildingXZ=[L['ferry_building']['x'], L['ferry_building']['z']],
    boundsLatLon=BOX,
    coverage="South edge just below Oracle Park, Mission Creek and the Caltrain depot; north past Pier 39 and Pier 45 into the Bay; west past Van Ness Ave (City Hall, the Opera House, Ghirardelli Square, Aquatic Park); east into the Bay past the Embarcadero piers and the Bay Bridge anchorage. %d x %d u (%.1f x %.1f km)." % (round(MAXX - MINX), round(MAXZ - MINZ), (MAXX - MINX) / 200, (MAXZ - MINZ) / 200),
    terrain="FLAT. San Francisco is steep (Nob Hill 105 m, Russian Hill 90 m, Telegraph Hill 85 m, Rincon Hill 30 m above the Bay); the game ground is flat and the hills are not modelled. Heights are measured from each building's own ground. Streets that really run in tunnels (the Broadway and Stockton tunnels) are plain surface streets here (tunnel: true).",
    axes='+X = east, -Z = north (true north up), +Y up. Matches the minimap (screen up = -Z).',
    gridNote="Two street grids meet at Market St and are kept. north_of_market (the Financial District, Chinatown, Nob Hill, North Beach, the Tenderloin, Civic Center, Fisherman's Wharf): avenues bear 351 deg (9 deg west of north), cross streets 81 deg; street-aligned rot about 0.157. soma (South of Market, Rincon Hill, South Beach, Mission Bay): Market St and the streets parallel to it bear 45 deg, the numbered streets 135 deg; rot about +-0.785. waterfront: the piers follow the curve of the Embarcadero seawall. Columbus Avenue cuts the north grid on a diagonal. Landmark front = compass point of frontBearing (deg clockwise from north) and frontDir = the world (x, z) unit vector; grid = the landmark's grid.",
    rotNote='All rot values are three.js rotation.y (radians). An object rotated by rot has its local +X axis pointing along (cos rot, -sin rot) in world (x, z). Building w is along local X, d along local Z: footprints on the rotated grids are oriented rects (OBB), not axis-aligned. rot is folded into (-pi/4, pi/4].',
    footprintNote='Footprints are CCW viewed from above (CCW in (x, -z)), open rings (first vertex not repeated). For THREE.Shape use (x, -z) then rotateX(-PI/2).',
    heightNote="height / eaveHeight are game units (metres x 0.2). Landmarks: heightMetres = top of the structure incl. spires and masts; eaveMetres = main roof, or where the crown / spire begins; dataRoofMetres = the OSM height of the matched footprint. Buildings: heightMetres = the OpenStreetMap height tag (in San Francisco mostly the city's 2010-11 LiDAR roof heights), else the height of the tallest building:part, else building:levels x 3.4 + 1.5, else the DataSF Building Footprints hgt_median_m of the footprint under the building, else the nine nearest neighbours' median; a merged block mass takes the area-weighted height and keeps heightMaxMetres.",
    mergeNote="Touching buildings (so always inside one street block) under 60 m within 1.8x of each other in height are merged while their union fills at least 62% of its rectangle and no side passes 110 m; slivers under 700 m2 then fold into the nearest-height touching neighbour (2.6x, fill 45%). San Francisco's rows of 25 ft house lots become block-face rows this way. A tower standing on a podium in the data (building:part) is split into the tower (its own entry) and the podium (podiumOf = the tower's id). footprint = the outline; cx/cz/w/d/rot = its oriented rectangle (what the kit fills); phoneSkip = small low structures that touch no street.",
    buildingFields="osm = the OpenStreetMap way / relation of the outline (the largest member of a merged row); onPier = stands on a pier deck or over the Bay (keep it, do not drop it as in-water); zone = financial_district / chinatown / north_beach / telegraph_hill / fishermans_wharf / russian_hill / nob_hill / union_square / tenderloin / civic_center / soma / south_beach / embarcadero / rincon_hill / mission_bay; style (generic only; landmark footprints carry landmark = the id and no style) = victorian (2-4 storey bay-windowed wood row houses and flats), brick (historic brick / terracotta blocks 1906-1930), warehouse (pier sheds, SoMa brick-and-timber warehouses), lowrise (< 15 m commercial), midrise (15-60 m offices / hotels), apartment (15-60 m residential), glassslab (60-120 m), glasstower (120 m and more); frontage = avenue (faces a north-south or numbered street) / street; merged = number of outlines in the mass.",
    projection='equirectangular about origin: x = (lon-lon0)*%.1f*scale, z = -(lat-lat0)*%.1f*scale (WGS84 metres per degree at lat0)' % (M_LON, M_LAT),
    source="OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright), BBBike extract of San Francisco (download.bbbike.org, snapshot 2026-11-14): coastline, piers, roads, parks, paths, bridges, rail, cable-car and ferry routes, building outlines, names, heights and building parts, park trees. City and County of San Francisco open data (DataSF, data.sfgov.org, PDDL): Building Footprints (ynuv-fyni, LiDAR heights) and Street Tree List (tkzw-k3nq). Terrain tiles (Mapzen / AWS Open Data terrarium; USGS 3DEP, SRTM) for the surround's ground heights. Landmark heights: CTBUH / Skyscraper Center and Wikipedia figures as given in tools/sf/SPEC.md.",
    generator='tools/sf/cartographer/ (extract_osm.py, fetch_datasf.py, prep.py, gen_layout.py, gen_layout2.py, landmarks.py, gen_detail.py, gen_surround.py, gen_trees.py, validate.py, preview.py)',
    detailFiles=['sf_trees.json', 'sf_detail.json', 'sf_surround.json'],
    grids={'north_of_market': 9.0, 'soma': 45.0}, gridsNote='degrees WEST of north of each grid\'s north-south streets (as Seattle\'s grids)',
    gridRotationDeg=-9.0, gridRotationNote='degrees clockwise of north of the dominant (north-of-Market) grid: its avenues bear 351 deg, i.e. 9 deg anticlockwise',
    trees=True, siteChecks=siteChecks, droppedLandmarks=[dict(id=a, reason=b) for a, b in S2['dropped']])
counts = dict(roads=len(roads), roadGraphNodes=len(S2['gnodes']), roadGraphEdges=len(S2['gedges']), roadGraphComponents=S2['comp'][:6], water=len(S2['water']), parks=len(parks), paths=len(paths), bridges=len(bridges),
              buildings=len(out_b), mergedBuildings=sum(1 for b in out_b if b.get('merged')), onPier=sum(1 for b in out_b if b.get('onPier')), phoneSkip=sum(1 for b in out_b if b.get('phoneSkip')),
              landmarks=len(landmarks), landmarksA=sum(1 for l in landmarks if l['tier'] == 'A' and l['kind'] != 'district'), landmarksB=sum(1 for l in landmarks if l['tier'] == 'B'), landmarksC=sum(1 for l in landmarks if l['tier'] == 'C' and l['kind'] != 'district'),
              districts=sum(1 for l in landmarks if l['kind'] == 'district'), trees=0, enemySpawns=len(enemies), approaches=len(approaches))
meta['counts'] = counts
out = dict(meta=meta, bounds=B0, minimap=dict(labels=labels, icons=icons, note='District names for the minimap (centres) and the tier-A landmarks to mark on it; the map itself draws from roads / water / parks / buildings. Screen up = -Z (north).'),
           roads=roads, water=S2['water'], parks=parks, paths=paths, bridges=bridges, roadGraph=dict(nodes=S2['gnodes'], edges=S2['gedges']), buildings=out_b, landmarks=landmarks,
           spawn=dict(player=spawn_player, enemies=enemies), ring=ring, duel=duel, soldier=soldier, approaches=approaches)
json.dump(out, open(sys.argv[4], 'w'), separators=(',', ':'))
sitesj = [dict(id=e['id'], name=e['name'], latLon=e['latLon'], x=e['x'], z=e['z'], rot=e['rot'], wMetres=round(e['w'] / SCALE, 1), dMetres=round(e['d'] / SCALE, 1), heightMetres=e['heightMetres'], eaveMetres=e['eaveMetres'],
               dataRoofMetres=e.get('dataRoofMetres'), frontBearing=e['frontBearing'], front=e['front'], tier=e['tier'], kind=e['kind'], onPier=bool(e.get('onPier')), onWater=bool(e.get('onWater')), osm=e['osm']) for e in lms]
json.dump(dict(note='rot = three.js rotation.y of the oriented rectangle (wMetres along local X = (cos rot, -sin rot) in world (x, z), dMetres along local Z), folded into (-45, 45] deg; the model front (+Z) faces frontBearing (deg clockwise from north). x / z in game units (0.2 u per m). dropped = SPEC ids not on the map.',
               sites=sitesj, dropped=[dict(id=a, reason=b) for a, b in S2['dropped']]), open(sys.argv[5], 'w'), indent=1)
import os; print('wrote', os.path.getsize(sys.argv[4]) // 1024, 'KB', counts)
print(json.dumps(spawn_player)[:200]); print(json.dumps(duel)[:500]); print(json.dumps(soldier)[:200]); print(enemies)
