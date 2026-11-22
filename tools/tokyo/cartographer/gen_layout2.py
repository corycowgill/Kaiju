"""Stage 3: parks, paths, bridges, sites; writes tokyo_layout.json + landmark_sites.json.
Usage: python3 -I gen_layout2.py <prep.pickle> <scriptdir> <stage2.pickle> <out sf_layout.json> <out landmark_sites.json>"""
import sys, math, json, re, pickle, collections
sys.path.insert(0, sys.argv[2])
from tkgeo import *
from landmarks import parse_h, rect, compass, sites_json, geom_index
from lm_info import SKYTREE_SITE, SKYTREE_TRUE
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
G, _N = geom_index(prep)
LAND = S2['LAND']
def pname(t): return t.get('name:en') or t.get('name') or ''
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
HID = lambda t: t.get('location') == 'underground' or t.get('indoor') == 'yes' or str(t.get('layer', '0')).strip().startswith('-') or str(t.get('level', '0')).strip().startswith('-') or t.get('parking') in ('underground', 'multi-storey') or 'tunnel' in t
moats = unary_union([p for r, t, p in S2['ponds']]).buffer(0.2)
# the palace first (so later, smaller polygons draw over it)
if 'way/534754971' in G:
    add_park('Imperial Palace grounds (Fukiage woods)', 'garden', 'trees', G['way/534754971'][1].difference(moats), 'way/534754971')
if 'relation/5415394' in G:
    add_park('Imperial Palace East Gardens (Honmaru, Ninomaru)', 'garden', 'planting', G['relation/5415394'][1].difference(moats), 'relation/5415394')
if 'way/675408602' in G:
    add_park('Kokyo Gaien lawn (Imperial Palace Outer Garden: black pines on open lawn)', 'lawn', 'grass', G['way/675408602'][1].difference(moats), 'way/675408602')
if 'relation/3551007' in G:
    add_park('Kokyo Gaien gravel plaza (Imperial Palace Plaza)', 'plaza', 'gravel', G['relation/3551007'][1].difference(moats), 'relation/3551007')
SPECIAL = {'way/534754971', 'relation/5415394', 'way/675408602', 'relation/3551007'}
OPEN = re.compile(r'芝生|広場|グラウンド|運動|lawn|field|ground', re.I)
for ref, t, p in sorted(prep['areas'], key=lambda a: -(a[2].area if a[2] is not None else 0)):
    if p is None or not p.intersects(BOXP) or ref in SPECIAL: continue
    if HID(t): continue
    nm = pname(t)
    le, lu, na, am, hw = t.get('leisure'), t.get('landuse'), t.get('natural'), t.get('amenity'), t.get('highway')
    kind = surface = None
    if 'building' in t: continue
    if le in ('park', 'playground', 'dog_park', 'common', 'recreation_ground') or lu in ('grass', 'recreation_ground', 'village_green', 'meadow', 'greenfield') or na in ('grassland',):
        kind, surface = 'lawn', 'grass'
        if le == 'common' and re.search(r'広場|Plaza|Square', nm + t.get('name', '')): kind, surface = 'plaza', 'paved'
    elif le == 'pitch': kind, surface = 'lawn', 'grass'
    elif le == 'garden' or lu in ('flowerbed',) or na in ('shrubbery', 'scrub'): kind, surface = 'garden', 'planting'
    elif na == 'wood' or lu == 'forest': kind, surface = 'garden', 'trees'
    elif na in ('beach', 'sand'): kind, surface = 'beach', 'sand'
    elif hw == 'pedestrian' or t.get('place') == 'square' or lu == 'plaza' or le == 'plaza': kind, surface = 'plaza', 'paved'
    elif am == 'place_of_worship' or lu in ('religious', 'cemetery') or am == 'grave_yard': kind, surface = 'plaza', 'gravel'
    elif am == 'parking' and t.get('parking', 'surface') == 'surface' and p.area >= 14 and (p.area < 400 or t.get('parking') == 'surface'): kind, surface = 'plaza', 'parking'
    else: continue
    if kind == 'lawn' and nm and OPEN.search(t.get('name', '') + ' ' + nm) and 'lawn' not in nm.lower() and 'field' not in nm.lower(): nm += ' (open lawn)'
    if kind != 'plaza' and waterB.contains(p.centroid) and not DECK.contains(p.centroid): continue
    add_park(nm, kind, surface, p.difference(moats) if p.intersects(moats) else p, ref)
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
    add_park(nm, 'plaza', 'pier', q, best[2] or 'natural=coastline (pier finger)')
WANT = ['Imperial Palace', 'Kokyo Gaien', 'Hibiya Park', 'Shiba Park', 'Hama-rikyu', 'Shiba Rikyu', 'Odaiba', 'Harumi', 'Toyosu', 'Zōjō', 'Hie', 'Honganji', 'Marunouchi']
for w in WANT: print('  park', w, [(p['name'][:40], p['kind'], p.get('surface'), len(p['polygon'])) for p in parks if w.lower() in p['name'].lower()][:5])
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
        e = dict(id='path_%d' % len(paths), kind='footway' if hw == 'pedestrian' else hw, name=pname(t), width=0.8 if hw in ('pedestrian', 'cycleway') else 0.6, surface=t.get('surface', 'paved'), points=ring1(list(q.simplify(0.1).coords)), _len=q.length, _park=inpark)
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
        over_w = LineString(r['points']).intersection(waterB).length > 0.3 * LineString(r['points']).length
        typ = 'freeway_viaduct' if r['expressway'] else 'bascule' if 'Kachidoki' in r['name'] else 'overpass'
        add_bridge(r['name'] or ('Shuto Expressway viaduct' if r['expressway'] else 'bridge' if over_w else 'overpass'), r['points'], typ, 'road', r['width'], 12.0 if r['expressway'] else 6.0)
for e in paths:
    if e.get('bridge'): add_bridge(e['name'] or 'footbridge', e['points'], 'footbridge', 'path', 0.8, 6.0)
print(' bridges', len(bridges), collections.Counter(b['type'] for b in bridges))

# ======================================================================= sites
L = {e['id']: e for e in lms}
B0 = dict(minX=MINX, maxX=MAXX, minZ=MINZ, maxZ=MAXZ)
obst = unary_union([solid, DECK, LAND.intersection(BOXP.buffer(80))])
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
tt, hk = L['tokyo_tower'], L['hamarikyu_teahouse']
t = best_water(118, 322, 60, 48)
px, pz, pc = round(t[1]), round(t[2]), t[3]
aim = ((tt['x'] + L['dentsu_building']['x'] + L['shiodome_city_center']['x'] + hk['x']) / 4, (tt['z'] + L['dentsu_building']['z'] + L['shiodome_city_center']['z'] + hk['z']) / 4)
fx, fz = aim[0] - px, aim[1] - pz; n = math.hypot(fx, fz); fx, fz = fx / n, fz / n
spawn_player = dict(x=px, z=pz, rot=round(math.atan2(fx, fz), 3), facing=[round(fx, 3), round(fz, 3)], openWater=round(pc, 1),
    note="Rises from Tokyo Bay in the channel between the Harumi wharf and the Hinode / Takeshiba piers and wades north-west: the black pines and tidal pond of Hama-rikyu dead ahead with the wall of Shiodome towers (Dentsu, Shiodome City Center, Nittele) behind, Tokyo Tower and the Azabudai and Toranomon towers to the left over Takeshiba and Hamamatsucho, the Sumida mouth, Tsukiji and Kachidoki to the right; the Rainbow Bridge is astern. rot = rotation.y that turns a +Z-forward model to face the facing vector.")
def crossing(rx, edges, inset=6.0):
    best = None
    R = re.compile(rx)
    for r in roads:
        if r['expressway'] or r.get('tunnel') or not R.search(r['name'] + ' ' + r.get('nameJa', '')): continue
        for k in (0, -1):
            p = r['points'][k]
            for edge in edges:
                on = {'s': abs(p[1] - MAXZ) < 0.2, 'n': abs(p[1] - MINZ) < 0.2, 'w': abs(p[0] - MINX) < 0.2, 'e': abs(p[0] - MAXX) < 0.2}[edge]
                if on:
                    l = LineString(r['points'] if k == 0 else r['points'][::-1])
                    pt = l.interpolate(min(inset, l.length))
                    if best is None or (r['class'] == 'major' and l.length > best[4]): best = (round(pt.x, 1), round(pt.y, 1), r['name'], edge, l.length)
    return best
AP = [
 ('sakurada_dori_southwest', r'桜田通り|Sakurada', 'ws', 'Sakurada-dori (Route 1) north-east from Gotanda and Meguro past Mita and Tokyo Tower to Kasumigaseki'),
 ('daiichi_keihin_south', r'第一京浜|Daiichi.Keihin|Dai-ichi Keihin', 's', 'the Dai-ichi Keihin (Route 15, the old Tokaido) north from Shinagawa through Takanawa and Mita to Shimbashi'),
 ('aoyama_dori_west', r'青山通り|Aoyama', 'w', 'Aoyama-dori (Route 246) east from Shibuya and Aoyama to Akasaka-mitsuke and the palace moat'),
 ('chuo_dori_north', r'中央通り|Ch[uū][oō].d[oō]ri', 'n', 'Chuo-dori south from Kanda and Akihabara over Nihonbashi to Ginza'),
 ('eitai_dori_east', r'永代通り|Eitai', 'e', 'Eitai-dori west from the Eitai Bridge over the Sumida through Kayabacho to Otemachi'),
 ('roppongi_dori_west', r'六本木通り|Roppongi.d[oō]ri', 'w', 'Roppongi-dori east from Shibuya and the Roppongi crossing under the expressway to Tameike and Kasumigaseki'),
 ('harumi_dori_east', r'晴海通り|Harumi.d[oō]ri', 'es', 'Harumi-dori north-west from Toyosu over Harumi, Kachidoki and the Kachidoki Bridge to Tsukiji and Ginza'),
 ('kaigan_dori_south', r'海岸通り|Kaigan|旧海岸通り', 's', 'Kaigan-dori north from Shinagawa wharf along the Shibaura waterfront to Takeshiba and Shiodome'),
]
approaches = []
for label, rx, edges, note in AP:
    c = crossing(rx, edges)
    if c is None: print('  !! no crossing for', label); continue
    approaches.append(dict(x=c[0], z=c[1], label=label, road=c[2], edge=c[3], note=note))
print(' approaches', [(a['label'], a['x'], a['z'], a['road'], a['edge']) for a in approaches])
def bay(tx, tz, label, note, radius=30, need=30):
    t = best_water(tx, tz, radius, need, edge=6.0)
    return dict(x=round(t[1], 1), z=round(t[2], 1), label=label, note=note + ' (open water %d u)' % t[3])
enemies = [
 bay(MAXX - 30, 640, 'bay_south_east', 'from Tokyo Bay off the Toyosu wharf and Ariake, south-east edge, the bay opening behind', radius=60),
 bay(MAXX - 30, -150, 'sumida_river_north_east', 'down the Sumida River past Tsukuda and the River City towers, north-east', radius=60, need=14),
 bay(170, MAXZ - 110, 'odaiba_cove', 'from the water off Odaiba Seaside Park and the old gun batteries, the Rainbow Bridge overhead', radius=50, need=24),
]
for a in approaches:
    if a['label'] in ('sakurada_dori_southwest', 'daiichi_keihin_south', 'aoyama_dori_west', 'chuo_dori_north', 'eitai_dori_east'):
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
ts, zj = L['tokyo_station'], L['zojoji']
fdx, fdz = ts['frontDir']
pa = (ts['x'] + fdx * (ts['w'] / 2 + 14), ts['z'] + fdz * (ts['w'] / 2 + 14))
ta = best_dry(Point(*pa).buffer(13), prefer=pa)
g = zj['extra']['gate']; pb = ((zj['x'] * 0.45 + g['x'] * 0.55), (zj['z'] * 0.45 + g['z'] * 0.55))
tb = best_dry(Point(*pb).buffer(16), prefer=pb)
ax, az, bx, bz = round(ta[1]), round(ta[2]), round(tb[1]), round(tb[2])
def face(ax, az, bx, bz): return round(math.atan2(bx - ax, bz - az), 3)
duel = dict(a=dict(x=ax, z=az, rot=face(ax, az, bx, bz), note='player: the Marunouchi station plaza at the head of Gyoko-dori, the red-brick front and domes of Tokyo Station directly behind, the Marunouchi and Shin-Marunouchi Buildings either side and the JP Tower on the right (clear of buildings %.1f u)' % ta[3]),
            b=dict(x=bx, z=bz, rot=face(bx, bz, ax, az), note="rival: Zojo-ji's forecourt in Shiba Park between the Sangedatsumon gate and the great hall, Tokyo Tower rising straight behind (clear of buildings %.1f u)" % tb[3]),
            note='VS Duel: the two kaiju face each other across the centre, Tokyo Station to Tokyo Tower, about %d u (%.1f km) apart with Hibiya, Shimbashi and Toranomon between (kaijuDuel.js findDuelSpawns searches +-60 u round each).' % (math.hypot(ax - bx, az - bz), math.hypot(ax - bx, az - bz) / 200))
# ---- soldier: Chuo-dori at the Ginza 4-chome crossing, looking north-east at the Wako clock tower
wk, mk = L['wako_ginza'], L['mitsukoshi_ginza']
chuo = unary_union([LineString(r['points']) for r in roads if re.search(r'中央通り|Ch[uū][oō]', r['name'] + r.get('nameJa', '')) and not r['expressway']])
haru = unary_union([LineString(r['points']) for r in roads if re.search(r'晴海通り|Harumi', r['name'] + r.get('nameJa', '')) and not r['expressway']])
ipt = chuo.intersection(haru)
ip = min((q for q in (ipt.geoms if hasattr(ipt, 'geoms') else [ipt])), key=lambda q: q.distance(Point(wk['x'], wk['z']))).centroid
gb = math.radians(42.0); ex, ez = math.sin(gb), -math.cos(gb)       # north-east along Chuo-dori
sx, sz = ip.x - ex * 9, ip.y - ez * 9
pt = chuo.interpolate(chuo.project(Point(sx, sz))); sx, sz = round(pt.x, 1), round(pt.y, 1)
soldier = dict(x=sx, z=sz, rot=round(math.atan2(ex, ez), 3), facing=[round(ex, 3), round(ez, 3)], freeHalf=free_half(sx, sz),
    note="Lone Soldier start: the middle of Chuo-dori in Ginza 5-chome a few steps short of the Ginza 4-chome crossing, facing north-east up the avenue: the curved stone corner and clock tower of Wako on the left of the crossing, Ginza Mitsukoshi on the right, Ginza Place's white lattice beside you, and the canyon of Chuo-dori's signs running on toward Kyobashi and Nihonbashi.")
# ---- ring
print(' ring search'); sys.stdout.flush()
expU = unary_union([LineString(r['points']) for r in roads if r['expressway'] and not r.get('tunnel')])
KG = (-72.0, -168.0)      # Hibiya Park (Kokyo Gaien cannot hold the 92 u mat between its moats: 77 u of dry ground at the widest)
smallP = [p for r, t, p in S2['ponds'] if p.area < 80]
wetBig = unary_union([waterFinal] + [p for r, t, p in S2['ponds'] if p.area >= 80])
smallU = unary_union(smallP)
cands = []
for x in np.arange(MINX + 60, MAXX - 76, 2.0):
    for z in np.arange(MINZ + 80, MAXZ - 80, 2.0):
        vb = sbox(x - 58, z - 78, x + 48, z + 78)
        if any(abs(e['x'] - x) <= 47 and abs(e['z'] - z) <= 47 for e in lms): continue
        if math.hypot(x - KG[0], z - KG[1]) > 70 or not wetBig.disjoint(vb): continue
        wa = smallU.intersection(vb).area / 8
        mat = sbox(x - 46, z - 46, x + 46, z + 46)
        if wetAll.intersects(mat.buffer(1)): continue
        lmhit = sum(1 for e in lms if e['kind'] != 'district' and e['_poly'].intersects(vb))
        fw = expU.intersection(vb).length
        v = 0; tall = 0
        for j in btree.query(vb):
            e = out_b[int(j)]
            if e['landmark']: continue
            a = bpolys[int(j)].intersection(vb).area
            v += a * e['heightMetres']; tall += (e['heightMetres'] >= 45 and a > 4)
        cands.append((v / 1000 + fw * 25 + tall * 150 + lmhit * 3000 + wa * 40 + math.hypot(x - KG[0], z - KG[1]) * 6, float(x), float(z), round(v / 1000), round(fw), tall, lmhit, round(wa, 1)))
cands.sort()
_seen = []
for c in cands:
    if all(math.hypot(c[1] - q[1], c[2] - q[2]) > 40 for q in _seen): _seen.append(c)
    if len(_seen) >= 14: break
for c in _seen: print('   distinct ring cand score %.0f at %.0f,%.0f vol %s freeway %s tall %s lmhit %s wet %s' % c, [round(v, 4) for v in ll(c[1], c[2])])
for c in cands[:3]: print('   ring cand score %.0f at %.0f,%.0f vol %s freeway %s tall %s lmhit %s wet %s' % c, ll(c[1], c[2]))
_, rx, rz, rv, rfw, rtall, rlm, rwet = cands[0]
rx, rz = round(rx), round(rz)
vbox = [rx - 58, rz - 78, rx + 48, rz + 78]
inbox = [dict(id=e['id'], name=e['name'], heightMetres=e['heightMetres']) for p, e in zip(bpolys, out_b) if p.intersects(sbox(*vbox)) and e['heightMetres'] >= 30 and not e['landmark']]
def clear_dir(dx, dz):
    for d in range(46, 140):
        px_, pz_ = rx + dx * d, rz + dz * d
        for j in btree.query(Point(px_, pz_).buffer(3)):
            if out_b[int(j)]['heightMetres'] >= 25 and bpolys[int(j)].distance(Point(px_, pz_)) < 3: return d
    return 140
filled = []
for w in list(S2['water']):
    if w['kind'] == 'pond' and Polygon(w['polygon']).buffer(0).intersects(sbox(*vbox)):
        filled.append(dict(name=w['name'], osm=w['osm'], areaM2=round(Polygon(w['polygon']).area / 0.04))); S2['water'].remove(w)
wetAll = unary_union([waterFinal] + [p for r, t, p in S2['ponds'] if not p.intersects(sbox(*vbox))]); wetP = sprep(wetAll)
vsh = wetAll.intersection(sbox(*vbox)).area / sbox(*vbox).area
ring = dict(x=rx, z=rz, east=0, west=0, rot=0, clear=round(min(e['_poly'].distance(Point(rx, rz)) for e in lms), 1), clearNote='distance (u) from the ring centre to the nearest landmark footprint',
            clearToBuildings=dict(north=clear_dir(0, -1), south=clear_dir(0, 1), west=clear_dir(-1, 0), east=clear_dir(1, 0)),
            venueBox=vbox, runwayBox=[rx + 48, rz - 17, rx + 73, rz + 17], matWaterShare=0, venueWaterShare=round(vsh, 4),
            landmarkCentresWithin46=[e['id'] for e in lms if abs(e['x'] - rx) <= 46 and abs(e['z'] - rz) <= 46],
            inVenueBox=[e['id'] for e in lms if e['kind'] != 'district' and e['_poly'].intersects(sbox(*vbox))],
            tallInVenueBox=inbox, freewayInVenueBox=rfw,
            title='TOKYO HEAVYWEIGHT CHAMPIONSHIP', place='HIBIYA PARK', ringClearTrees=vbox, filledPonds=filled,
            chicagoVenue=dict(half=42, matHalf=45.5, clearHalf=60, venueX=[-58, 48], rampToX=73, venueZ=[-78, 78]))
la, lo = ll(rx, rz)
ring['note'] = ("Title Match ring at Hibiya Park, at about %.4f, %.4f: the lawns, flower beds and bandstand of Tokyo's first Western-style park and the edge of the Kasumigaseki ministry blocks beside it; the level leaves out the blocks inside venueBox in that mode. "
                "Kokyo Gaien (the palace plaza) was the first choice but has only 77 u of dry ground between the Nijubashi and Babasaki moats, short of the 92 u mat. The palace moats and Nijubashi lie to the north, the Imperial Hotel, Tokyo Midtown Hibiya and the Ginza side to the east, the ministries, the Diet and Toranomon's towers to the west, the Shiodome wall to the south-east. venueBox [minX, minZ, maxX, maxZ] = the Chicago venue x -58..+48, z -78..+78 with both grandstands; "
                "runwayBox = the entrance runway and gate (x +48..+73); east / west = 0 (nothing pulled in). No landmark centre lies within 46 u on both axes; the box is dry: filledPonds lists the park's ornamental ponds inside the box, which are left out of water (the ground there is plain park). clearToBuildings = distance from the centre to the first building of 25 m or more in each direction. "
                "tallInVenueBox lists generic buildings of 30 m or more whose footprints fall in the box (not built in that mode); freewayInVenueBox = length (u) of elevated expressway inside the box.") % (la, lo)
print(' ring', rx, rz, ring['clearToBuildings'], ring['inVenueBox'], len(inbox), 'venue wet share', vsh)

# ======================================================================= minimap, meta, write
labels = [dict(text=n.upper(), x=r1(xz(lo, la)[0]), z=r1(xz(lo, la)[1])) for id_, n, la, lo in DISTRICTS]
icons = [dict(id=e['id'], x=e['x'], z=e['z']) for e in lms if e['tier'] == 'A']
landmarks = []
for e in lms:
    d = {k: v for k, v in e.items() if not k.startswith('_')}
    order = ['id', 'name', 'x', 'z', 'rot', 'w', 'd', 'height', 'heightMetres', 'eaveHeight', 'eaveMetres', 'tier', 'kind', 'front', 'frontBearing', 'frontDir', 'grid', 'desc', 'latLon', 'footprintId', 'osm', 'dataRoofMetres', 'onPier', 'onWater', 'moved', 'trueLatLon', 'extra']
    landmarks.append({k: d[k] for k in order if k in d})
for id_, n, la, lo in DISTRICTS:
    x, z = xz(lo, la)
    landmarks.append(dict(id=id_, name=n, x=r1(x), z=r1(z), rot=0.0, w=0.0, d=0.0, height=0.0, heightMetres=0, eaveHeight=0.0, eaveMetres=0, tier='C', kind='district', front='S', frontBearing=180, frontDir=[0.0, 1.0],
                          grid='local', desc='District name for the map only; nothing is built for this entry.', latLon=[la, lo]))
for r in roads: r.pop('_hw', None); r.pop('_len', None)
sites = {'player': spawn_player, 'duel.a': duel['a'], 'duel.b': duel['b'], 'soldier': soldier, 'ring': ring}
for e in enemies: sites['enemy.' + e['label']] = e
siteChecks = {k: dict(buildingFreeHalf=free_half(v['x'], v['z']), treesWithin6=0, inWater=bool(wet(v['x'], v['z']))) for k, v in sites.items()}
sk = L['tokyo_skytree']; skt = xz(SKYTREE_TRUE[1], SKYTREE_TRUE[0])
meta = dict(version=1, name='Tokyo (the centre and the bay)', scale=SCALE, scaleNote='game units per real metre; uniform, no compression',
    originLatLon=[LAT0, LON0], originNote='Shimbashi / Shiodome: the east side of Shimbashi Station by the Nittele Tower',
    tokyoTowerXZ=[L['tokyo_tower']['x'], L['tokyo_tower']['z']], tokyoStationXZ=[L['tokyo_station']['x'], L['tokyo_station']['z']], rainbowBridgeXZ=[L['rainbow_bridge']['x'], L['rainbow_bridge']['z']],
    boundsLatLon=BOX,
    coverage="North edge past Otemachi, the Bank of Japan and the Imperial Palace East Gardens; south to the Rainbow Bridge, Takanawa Gateway and the north tip of Odaiba (Fuji TV); west past Akasaka, Roppongi 1-chome and Mita; east over the Sumida mouth to Tsukuda, Harumi and the Toyosu wharf. %d x %d u (%.1f x %.1f km)." % (round(MAXX - MINX), round(MAXZ - MINZ), (MAXX - MINX) / 200, (MAXZ - MINZ) / 200),
    terrain="FLAT. Central Tokyo's relief is modest (the Yamanote plateau at Atago, Azabudai, Nagatacho and Takanawa stands 20-30 m over the reclaimed low city); the game ground is flat and the hills are not modelled. Heights are measured from each building's own ground. Road tunnels and underpasses that duplicate a surface street are left out; the Shuto Expressway's tunnels are kept (tunnel: true).",
    axes='+X = east, -Z = north (true north up), +Y up. Matches the minimap (screen up = -Z).',
    gridNote="Central Tokyo has no single street grid: the castle-town blocks of each quarter turn with the moats, the old shoreline and the hills, so every building and landmark carries its own real rot. The largest regular grid is Ginza / Kyobashi / Nihonbashi's: Chuo-dori and the streets parallel to it bear about 42 deg (north-east), the cross streets (Harumi-dori) about 132 deg; street-aligned rot about -0.73. Marunouchi and Otemachi turn about 15 deg west of north (rot about -0.26), Tsukishima / Kachidoki / Harumi lie at 40 deg like Ginza, Shibaura and Takeshiba follow the quays. Landmark front = compass point of frontBearing (deg clockwise from north) and frontDir = the world (x, z) unit vector; grid = 'ginza' where the footprint sits on the Ginza grid, else 'local'. Japan drives on the left; that is not modelled.",
    rotNote='All rot values are three.js rotation.y (radians). An object rotated by rot has its local +X axis pointing along (cos rot, -sin rot) in world (x, z). Building w is along local X, d along local Z: footprints are oriented rects (OBB), not axis-aligned. rot is folded into (-pi/4, pi/4], except landmarks of kind bridge (kachidoki_bridge, nihonbashi_bridge, rainbow_bridge), whose w is the deck length and rot the deck direction.',
    footprintNote='Footprints are CCW viewed from above (CCW in (x, -z)), open rings (first vertex not repeated). For THREE.Shape use (x, -z) then rotateX(-PI/2).',
    heightNote="height / eaveHeight are game units (metres x 0.2). Landmarks: heightMetres = top of the structure incl. spires and masts; eaveMetres = main roof, or where the crown / spire begins; dataRoofMetres = the OSM height of the matched footprint. Buildings: heightMetres = the OpenStreetMap height tag, else the height of the tallest building:part, else building:levels x 3.4 (3.9 from 20 floors) + 1.5; where OSM gives none (most of the small lots) a zone-typical height by footprint area (the core's pencil buildings 17-33 m, the low city's houses 7-12 m) averaged with the median of the mapped heights of similar-sized neighbours within 150 m, +-18% by a hash of the id; a merged block mass takes the area-weighted height and keeps heightMaxMetres.",
    mergeNote="Touching or nearly touching buildings (2.5 m) under 60 m within 2x of each other in height are merged while their union fills at least 56% of its rectangle and no side passes 120 m; lots under 1,600 m2 then fold into the nearest-height neighbour (3.5x, fill 38%), and last the rows either side of a dropped back alley (gap up to 5.5 m) join into block masses, never across a street that is kept in roads. Tokyo's rows of 4-8 m wide pencil buildings and wooden houses become block-face masses this way. A tower standing on a podium in the data (building:part) is split into the tower (its own entry) and the podium (podiumOf = the tower's id). footprint = the outline; cx/cz/w/d/rot = its oriented rectangle (what the kit fills); phoneSkip = the smallest, lowest masses away from the streets (30%: phones build about 70%).",
    buildingFields="osm = the OpenStreetMap way / relation of the outline (the largest member of a merged row); onPier = stands on a pier deck or over the water (keep it, do not drop it as in-water); zone = marunouchi / otemachi / nihonbashi / ginza / yurakucho / shimbashi / shiodome / kasumigaseki / nagatacho / akasaka / toranomon / roppongi / shiba / hamamatsucho / takeshiba / tsukiji / tsukishima / kachidoki / harumi / toyosu / tamachi / shibaura / takanawa / odaiba / imperial_palace; style (generic only; landmark footprints carry landmark = the id and no style) = house (1-3 storey wooden / light houses and shop-houses), zakkyo (narrow 4-10 storey multi-tenant pencil buildings with signboards), apartment (mansion blocks, danchi slabs, tower-mansion podiums), lowrise (other < 15 m), midrise (15-60 m offices / ministries / hotels / department stores), warehouse (wharf sheds, markets, depots), glassslab (60-120 m), glasstower (120 m and more); frontage = avenue (on a major street) / street; merged = number of outlines in the mass.",
    roadNote="roads are the pieces of each OSM street between junctions (name = name:en where mapped, nameJa = the Japanese name). The narrow back streets are thinned: a minor street piece is dropped while a block beside it is under 2,750 m2, so the kept minors bound the merged blocks; alleys (service / footway) are not roads. expressway: true = the Shuto Expressway (Inner Circular C1, Route 1 Haneda / Ueno, Route 2, Route 3, Route 4, Route 6, Yaesu line, Route 11 Daiba over the Rainbow Bridge), the Tokyo Expressway (KK line) and their ramps: mostly elevated (bridge: true), in cuttings round the palace moats and under Kasumigaseki / Shiodome (tunnel: true). Expressways are not in roadGraph.",
    waterNote="water kind bay = Tokyo Bay, the port, the Sumida River, the Nihonbashi / Kamejima / Kanda rivers and the canals of Shibaura, Tsukiji, Tsukishima, Harumi and Toyosu (one tidal body from the OSM coastline plus the river and canal areas, clipped to the box, islands and wharves as holes); kind pond = inland water: the Imperial Palace moats (Sakurada-bori, Hanzo-bori, Hibiya-bori, Babasaki-bori, Kikyo-bori, Ote-bori ...), the ponds of Hibiya Park, Shiba Park, Kyu-Shiba-rikyu and the hotel gardens. The tidal pond of Hama-rikyu joins the bay. Every polygon is wet (wade-able).",
    projection='equirectangular about origin: x = (lon-lon0)*%.1f*scale, z = -(lat-lat0)*%.1f*scale (WGS84 metres per degree at lat0)' % (M_LON, M_LAT),
    source="OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright), BBBike extract of Tokyo (download.bbbike.org, snapshot 2026-11): coastline, rivers, canals and moats, piers, roads, parks, paths, bridges, rail and guideway lines, ferry routes, building outlines, names, heights, levels and building parts, mapped trees. Terrain tiles (Mapzen / AWS Open Data terrarium; SRTM / GSI) for the surround's ground heights. Landmark heights: CTBUH / Skyscraper Center and Wikipedia figures as given in tools/tokyo/SPEC.md.",
    generator='tools/tokyo/cartographer/ (extract_osm.py, prep.py, gen_layout.py, gen_layout2.py, landmarks.py, lm_table.py, lm_info.py, zones.py, gen_detail.py, gen_surround.py, gen_trees.py, validate.py, preview.py)',
    detailFiles=['tokyo_trees.json', 'tokyo_detail.json', 'tokyo_surround.json'],
    grids={'ginza': -42.0, 'marunouchi': 15.0, 'tsukishima': -40.0}, gridsNote="degrees WEST of north of each grid's north-south streets (negative = east of north); lots elsewhere carry their own rot",
    gridRotationDeg=42.0, gridRotationNote="degrees clockwise of north of the Ginza / Nihonbashi grid: Chuo-dori bears about 42 deg",
    trees=True, siteChecks=siteChecks, droppedLandmarks=[dict(id=a, reason=b) for a, b in S2['dropped']],
    movedLandmarks=[dict(id='tokyo_skytree', fromLatLon=list(SKYTREE_TRUE), toLatLon=sk['latLon'], trueXZ=[r1(skt[0]), r1(skt[1])], x=sk['x'], z=sk['z'],
                         reason="Tokyo Skytree really stands at Oshiage, Sumida ward, about %.1f km north-east of the origin and %.1f km outside the box; it is moved onto the open lawn plaza of Harumi Futo Park at the tip of the Harumi wharf (reclaimed land, the former passenger-terminal site), where nothing else is built." % (math.hypot(*skt) / 200, (-skt[1] + MINZ) / 200))],
    approximatedLandmarks=[
        dict(id='ginza_place', note='the OSM outline (way/195551651, still named Sapporo Ginza Building) covers the whole corner block, larger than Ginza Place itself (about 25 x 30 m at the crossing corner)'),
        dict(id='world_trade_center_hamamatsucho', note='the South Tower (2021, OSM height 197 m) is the mapped footprint; the 235 m main tower beside it is still a construction site in the data'),
        dict(id='kasumigaseki_common_gate', note='the west tower (Central Government Building No. 7 West, 176 m) only; the 156 m east tower is a generic glasstower lot'),
        dict(id='tokyo_tower', note='the box is the 95 m leg spread centred on the main deck; FootTown (relation/4247312) lies inside it'),
        dict(id='toyosu_market', note='the Fish Intermediate Wholesale building (block 6); the Fruit and Vegetable building (block 5) is east of the box'),
        dict(id='tsukiji_outer_market', note='the entry is the Tsukiji Uogashi halls; the shop rows of the outer market north of it are generic house / zakkyo lots'),
        dict(id='takeshiba_pier', note='the terminal building on the pier (way/436096961) inside the ferry-terminal area relation/2136745'),
        dict(id='river_city_21_b', note='River Point Tower (40 floors, 132 m) at the tip of Tsukuda; SPEC height 140'),
        dict(id='the_tokyo_towers_sea', note='true site at Kachidoki 6-chome, about 500 m south-west of the SPEC coordinate'),
        dict(id='rainbow_bridge', note='x / z = mid-span of the OSM expressway deck; w = the 921 m of deck between the anchorage blocks with their end spans; towers by the published 570 m main span (detail.rainbowBridge)')])
S2['water'] = [dict(w, id='water_%d' % i) for i, w in enumerate(S2['water'])]
counts = dict(roads=len(roads), roadGraphNodes=len(S2['gnodes']), roadGraphEdges=len(S2['gedges']), roadGraphComponents=S2['comp'][:6], water=len(S2['water']), parks=len(parks), paths=len(paths), bridges=len(bridges),
              buildings=len(out_b), mergedBuildings=sum(1 for b in out_b if b.get('merged')), onPier=sum(1 for b in out_b if b.get('onPier')), phoneSkip=sum(1 for b in out_b if b.get('phoneSkip')),
              landmarks=len(landmarks), landmarksA=sum(1 for l in landmarks if l['tier'] == 'A' and l['kind'] != 'district'), landmarksB=sum(1 for l in landmarks if l['tier'] == 'B'), landmarksC=sum(1 for l in landmarks if l['tier'] == 'C' and l['kind'] != 'district'),
              districts=sum(1 for l in landmarks if l['kind'] == 'district'), trees=0, enemySpawns=len(enemies), approaches=len(approaches))
meta['counts'] = counts
out = dict(meta=meta, bounds=B0, minimap=dict(labels=labels, icons=icons, note='District names for the minimap (centres) and the tier-A landmarks to mark on it; the map itself draws from roads / water / parks / buildings. Screen up = -Z (north).'),
           roads=roads, water=S2['water'], parks=parks, paths=paths, bridges=bridges, roadGraph=dict(nodes=S2['gnodes'], edges=S2['gedges']), buildings=out_b, landmarks=landmarks,
           spawn=dict(player=spawn_player, enemies=enemies), ring=ring, duel=duel, soldier=soldier, approaches=approaches)
json.dump(out, open(sys.argv[4], 'w'), separators=(',', ':'), ensure_ascii=False)
json.dump(sites_json(lms, S2['dropped']), open(sys.argv[5], 'w'), indent=1, ensure_ascii=False)
import os; print('wrote', os.path.getsize(sys.argv[4]) // 1024, 'KB', counts)
print(json.dumps(spawn_player)[:200]); print(json.dumps(duel)[:300]); print(json.dumps(soldier)[:200]); print(enemies)
