"""tokyo_surround.json. Usage: python3 -I gen_surround.py <prep.pickle> <scriptdir> <demdir> <stage2.pickle> <out tokyo_surround.json>"""
import sys, json, re, math, collections
sys.path.insert(0, sys.argv[2])
from tkgeo import *
from landmarks import parse_h
from lm_info import SKYTREE_TRUE
import numpy as np
from shapely.geometry import Polygon, Point, LineString, box as sbox
from shapely.ops import unary_union, nearest_points
import shapely
prep = load(sys.argv[1]); S2 = load(sys.argv[4])
DEM = np.load(sys.argv[3] + '/dem.npy'); Z, TX0, TY0 = map(int, open(sys.argv[3] + '/dem.txt').read().split())
def elev(x, z):
    la, lo = ll(x, z)
    px = ((lo + 180) / 360 * 2 ** Z - TX0) * 256; py = ((1 - math.asinh(math.tan(math.radians(la))) / math.pi) / 2 * 2 ** Z - TY0) * 256
    i, j = int(py), int(px)
    if not (0 <= i < DEM.shape[0] - 1 and 0 <= j < DEM.shape[1] - 1): return 0.0
    fy, fx = py - i, px - j
    v = DEM[i, j] * (1 - fx) * (1 - fy) + DEM[i, j + 1] * fx * (1 - fy) + DEM[i + 1, j] * (1 - fx) * fy + DEM[i + 1, j + 1] * fx * fy
    return max(0.0, float(v))
BOXP = sbox(MINX, MINZ, MAXX, MAXZ)
wide = sbox(*prep['wideBox'])
def polys_of(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'): return [q for p in g.geoms for q in polys_of(p)]
    return []
# tidal water over the fetch area: the coastline's bay plus the rivers and canals joined to it
def hidden(t): return 'tunnel' in t or t.get('location') == 'underground' or t.get('covered') == 'yes' or str(t.get('layer', '0')).startswith('-')
wc = [p for ref, t, p in prep['widewater'] if not hidden(t) and t.get('water') not in ('wastewater', 'reservoir', 'drain', 'ditch', 'fountain', 'pond', 'reflecting_pool', 'basin')]
coastW = prep['WATER']
allW = unary_union([coastW] + [p.intersection(wide) for p in wc]).buffer(0.3).buffer(-0.3)
WATER = unary_union([q for q in polys_of(allW) if q.intersects(coastW.buffer(0.2)) and q.area > 200])
LAND = wide.difference(WATER)
def gnd(x, z):
    d = BOXP.distance(Point(x, z))
    k = 0.0 if d < 40 else min(1.0, (d - 40) / 60)
    return r1(elev(x, z) * SCALE * k)
REACH = 560.0
boxes = []; named = {}
tall_polys = []
WANT = re.compile(r'Roppongi Hills Mori Tower|六本木ヒルズ森タワー|Tokyo Midtown|ミッドタウン・タワー|Shinagawa|品川|Sumitomo Fudosan Roppongi Grand|Akasaka|赤坂|Toyosu|豊洲|Ariake|有明|Telecom|テレコム|Hotel New Otani|ニューオータニ|Prudential|Kioi|紀尾井|Atlas|Bay|ベイ|Tower|タワー', re.I)
for ref, t, p in prep['bld']:
    c = p.representative_point()
    if BOXP.contains(c) or BOXP.distance(c) > 700: continue
    lv = parse_h(t.get('building:levels')) or 0
    h = parse_h(t.get('height')) or (lv * (3.9 if lv >= 20 else 3.5))
    if h < 40 or h > 340 or p.area < 3 or str(t.get('layer', '0')).startswith('-'): continue
    cx, cz, w, d, rot = obb(p if p.geom_type == 'Polygon' else p.convex_hull)
    if MINX <= cx <= MAXX and MINZ <= cz <= MAXZ: continue
    nm = t.get('name:en') or t.get('name')
    if nm and (h >= 100 or WANT.search(nm)) and nm not in named: named[nm] = dict(i=len(boxes), heightMetres=round(h, 1))
    boxes.append([r1(cx), r1(cz), r1(max(w, 1.0)), r1(max(d, 1.0)), r1(h * SCALE), round(rot, 3), 1, gnd(cx, cz)]); tall_polys.append(p)
ntall = len(boxes)
tt = shapely.STRtree(tall_polys) if tall_polys else None
# cls 0: the low fabric (OSM footprints) in block-sized cells
CELL = 30.0
cells = collections.defaultdict(list)
for ref, t, p in prep['bld']:
    c = p.centroid
    if BOXP.contains(c) or BOXP.distance(c) > REACH or p.area < 0.8: continue
    if t.get('location') == 'underground' or str(t.get('layer', '0')).startswith('-') or t.get('building') in ('roof', 'no'): continue
    lv = parse_h(t.get('building:levels')) or 0
    h = parse_h(t.get('height')) or (lv * 3.4 + 1.5 if lv else None)
    a_m2 = p.area / 0.04
    if h is None: h = 7.0 if a_m2 < 90 else 10.5 if a_m2 < 220 else 18.0 if a_m2 < 600 else 26.0
    if h >= 40: continue
    cells[(math.floor(c.x / CELL), math.floor(c.y / CELL))].append((p.area, min(h, 39.0), c.x, c.y, p))
for (i, j), bs in cells.items():
    A = sum(b[0] for b in bs)
    if A < 14: continue
    h = sum(b[0] * b[1] for b in bs) / A
    cx = sum(b[0] * b[2] for b in bs) / A; cz = sum(b[0] * b[3] for b in bs) / A
    big = max(bs, key=lambda b: b[0])
    _, _, _, _, rot = obb(big[4] if big[4].geom_type == 'Polygon' else big[4].convex_hull)
    sx = (sum(b[0] * (b[2] - cx) ** 2 for b in bs) / A) ** 0.5; sz = (sum(b[0] * (b[3] - cz) ** 2 for b in bs) / A) ** 0.5
    k = math.sqrt(A / max(1e-6, (sx + 2) * (sz + 2)))
    w = min(CELL * 0.96, max(3.0, (sx + 2) * k)); d = min(CELL * 0.96, max(3.0, (sz + 2) * k))
    boxes.append([r1(cx), r1(cz), r1(w), r1(d), r1(h * SCALE), round(rot, 3) if abs(rot) < 0.3 else 0.0, 0, gnd(cx, cz)])
print('boxes', len(boxes), 'tall', ntall, 'low', len(boxes) - ntall, 'max g', max(b[7] for b in boxes), 'named', len(named))
def ring(c): return ring1(list(c))
water = []
for p in sorted(polys_of(WATER), key=lambda q: -q.area):
    if p.area < 400: continue
    q = p.simplify(1.2)
    if q.geom_type != 'Polygon' or not q.is_valid: q = p.buffer(0).simplify(1.2)
    if q.geom_type != 'Polygon': q = max(polys_of(q), key=lambda g: g.area)
    name = 'Tokyo Bay, the port, the Sumida and Arakawa rivers and the canals' if not water else 'water'
    water.append(dict(name=name, polygon=ring(q.exterior.coords), holes=[ring(h.coords) for h in q.interiors if Polygon(h).area > 20]))
print('water', [(w['name'][:20], len(w['polygon']), len(w['holes'])) for w in water][:8])
# islands: the reclaimed islands of the port that lie outside the box (holes of the water)
NAMES = [('Odaiba and Aomi (Landfill No. 13)', 35.6190, 139.7790, 8, 'the rest of Odaiba: Palette Town site, the Telecom Center, the Aomi container terminal on its west quay'),
         ('Ariake', 35.6350, 139.7930, 6, 'Ariake: the Big Sight exhibition halls with their inverted pyramids, arenas, tower blocks'),
         ('Shinagawa Wharf', 35.6190, 139.7580, 5, 'Shinagawa container wharf and power station across the channel from Odaiba'),
         ('Oi Wharf', 35.5990, 139.7620, 5, 'the Oi container terminal: two kilometres of quay with gantry cranes'),
         ('Central Breakwater landfill', 35.6030, 139.8050, 10, 'the outer and inner Central Breakwater landfills, low and bare, the Tokyo Gate Bridge beyond'),
         ('Toyosu and Shinonome', 35.6500, 139.7960, 5, 'the rest of Toyosu, Shinonome and Tatsumi: tower mansions and canals'),
         ('Tsukishima and Harumi', 35.6600, 139.7850, 4, 'the east side of the Tsukishima / Harumi island'),
         ('Yumenoshima and Shin-Kiba', 35.6480, 139.8280, 5, 'Yumenoshima park and the timber yards of Shin-Kiba'),
         ('Wakasu', 35.6230, 139.8330, 5, 'Wakasu: golf links and the Tokyo Gate Bridge landing'),
         ('Jonanjima and Keihinjima', 35.5800, 139.7800, 5, 'industrial islands toward Haneda'),
         ('Koto delta (Kiba, Fukagawa)', 35.6700, 139.8050, 3, 'the low city east of the Sumida between its canals')]
isl = [p for p in polys_of(LAND) if not p.intersects(wide.boundary) and p.area > 300]
islands = []
used = set()
for p in sorted(isl, key=lambda q: -q.area):
    inside = p.intersection(BOXP).area / p.area
    if inside > 0.6: continue
    best = min(NAMES, key=lambda n: p.distance(Point(*xz(n[2], n[1]))))
    if p.distance(Point(*xz(best[2], best[1]))) > 60: nm, h, note = 'reclaimed island', 4, 'reclaimed land of the port'
    else: nm, h, note = best[0], best[3], best[4]
    if nm in used: nm = nm + ' (%d)' % (sum(1 for u in used if u.startswith(nm)) + 1)
    used.add(nm)
    rp = p.representative_point()
    islands.append(dict(name=nm, polygon=ring(p.simplify(1.0).exterior.coords), heightMetres=h, x=r1(rp.x), z=r1(rp.y), areaHa=round(p.area / 0.04 / 10000), inBoxShare=round(inside, 2), note=note))
print('islands', [(i['name'], i['x'], i['z'], i['areaHa']) for i in islands])
def hz(name, lat, lon, h, note):
    x, z = xz(lon, lat); d = math.hypot(x, z)
    return dict(name=name, bearingDeg=round(math.degrees(math.atan2(x, -z)) % 360, 1), distanceKm=round(d / SCALE / 1000, 1), heightMetres=h, dirXZ=[round(x / d, 3), round(z / d, 3)], note=note)
horizon = [
 hz('Mount Fuji', 35.3606, 138.7274, 3776, 'the snow-capped cone of Fuji on the west-south-west horizon, clearest at dawn and at dusk when it stands in silhouette against the afterglow; the level looks that way down the avenues of Shiba and Mita'),
 hz('Tanzawa Mountains (Mount Tanzawa, Mount Oyama)', 35.4743, 139.1627, 1567, 'the dark saw-toothed wall of the Tanzawa range in front of and to the left of Fuji, the pyramid of Oyama (1,252 m) at its east end'),
 hz('Okutama and Chichibu ranges (Mount Kumotori)', 35.8555, 138.9438, 2017, 'the long blue ridges of the Okutama and Chichibu mountains closing the Kanto plain to the west-north-west'),
 hz('Shinjuku skyscraper cluster', 35.6896, 139.6922, 243, 'the Shinjuku towers 6 km to the west-north-west: the twin-towered Metropolitan Government Building, the Park Hyatt trio, the Cocoon Tower, NTT Docomo clock tower to their left at Yoyogi'),
 hz('Shibuya and Roppongi Hills', 35.6595, 139.7005, 230, 'Shibuya Scramble Square and the Shibuya cluster beyond the Roppongi Hills Mori Tower to the west'),
 hz('Tokyo Skytree (true position, Oshiage)', SKYTREE_TRUE[0], SKYTREE_TRUE[1], 634, 'where the Skytree really stands, north-east across the Sumida; in play it is moved to Harumi (tokyo_layout meta.movedLandmarks), so nothing should be drawn here'),
 hz('Ikebukuro (Sunshine 60)', 35.7295, 139.7180, 240, 'the lone slab of Sunshine 60 and the Ikebukuro towers to the north-north-west'),
 hz('Boso hills (Mount Nokogiri, Kano-zan)', 35.2540, 139.9560, 379, 'the low hills of the Boso peninsula across Tokyo Bay to the south-south-east, a faint line over the water with the Aqua-Line and the Kisarazu shore'),
 hz('Mount Tsukuba', 36.2253, 140.1067, 877, 'the twin-peaked Mount Tsukuba alone on the plain to the north-east'),
 hz('Yokohama (Landmark Tower) and the Miura hills', 35.4547, 139.6315, 296, 'the Minato Mirai towers of Yokohama down the bay shore to the south-south-west'),
 hz('Haneda Airport', 35.5494, 139.7798, 116, 'the control tower and runways of Haneda on the bay shore to the south, aircraft climbing out over the port'),
]
masts = []
# cranes: mapped ones plus gantry cranes synthesised along the Oi and Aomi container quays
cranes = []
landU = LAND
def quay(terminal, a, b, n):
    (la0, lo0), (la1, lo1) = a, b
    for i in range(n):
        f = (i + 0.5) / n
        x, z = xz(lo0 + (lo1 - lo0) * f, la0 + (la1 - la0) * f)
        pt = Point(x, z)
        q = nearest_points(landU.boundary, pt)[0]
        if q.distance(pt) > 40: continue
        # 3 u inland of the quay edge
        ins = Point(q.x + 3, q.y) if landU.contains(Point(q.x + 3, q.y)) else Point(q.x - 3, q.y) if landU.contains(Point(q.x - 3, q.y)) else q
        if math.hypot(ins.x, ins.y) < 1950 and not BOXP.contains(ins):
            cranes.append(dict(terminal=terminal, x=r1(ins.x), z=r1(ins.y), rot=round(math.atan2(-(xz(lo1, la1)[1] - xz(lo0, la0)[1]), xz(lo1, la1)[0] - xz(lo0, la0)[0]), 3), heightMetres=80.0, boomUp=len(cranes) % 3 == 0, synthesised=True))
quay('Oi Container Terminal', (35.6185, 139.7648), (35.5975, 139.7700), 10)
quay('Aomi Container Terminal', (35.6215, 139.7745), (35.6100, 139.7775), 5)
quay('Shinagawa Container Terminal', (35.6235, 139.7600), (35.6170, 139.7612), 2)
print('cranes', len(cranes), cranes[:2])
meta = dict(scale=SCALE, originLatLon=[LAT0, LON0], counts=dict(boxes=len(boxes), tall=ntall, lowCells=len(boxes) - ntall, water=len(water), islands=len(islands), cranes=len(cranes)),
    note="The city past the play box. boxes: [x, z, w, d, h, rot, cls, g], game units, rot = rotation.y (w along local X). cls 0 = the low fabric (OpenStreetMap footprints; height from the height / levels tags, else by footprint area) of a 30 u cell within %d u of the box edge as one mass (area-weighted height, sized to the built area); cls 1 = an OpenStreetMap building of 40 m or more (its own oriented rectangle) within 700 u of the box (Roppongi Hills, Tokyo Midtown, Akasaka, Kioicho, Shinagawa, Toyosu, Ariake, the Odaiba towers). Nothing is boxed on the water. "
         "g = ground under the box in game units from the terrarium DEM (the Yamanote plateau 25-40 m at Roppongi, Azabu and Shirokane; the low city and the reclaimed islands 0-5 m): 0 within 40 u of the play box edge and ramped in over the next 60 u so the surround meets the flat play area; lift the backdrop by g (or a share of it), or ignore it. named: name -> index into boxes (towers of 100 m and more, and other named towers). "
         "water: Tokyo Bay, the port, the Sumida, Arakawa and Meguro rivers and the canals over the fetch area (x -2000..2000, z -2000..2400) as {name, polygon, holes}; the reclaimed islands are holes of the bay polygon, so a point is wet only inside a polygon and outside its holes. islands: outline polygons of the islands that lie wholly or mostly outside the box (Odaiba / Aomi, Ariake, Shinagawa and Oi wharves, the Central Breakwater ...), x / z = a point on the island. masts: none (Tokyo Tower is in play; the Skytree is moved into play). cranes: container gantry cranes synthesised along the Oi, Aomi and Shinagawa quays (OSM maps only a handful; synthesised: true, positions approximate, rot = along the quay). horizon: far features by bearing (deg clockwise from north) and distance from the origin." % REACH)
json.dump(dict(meta=meta, named=named, water=water, islands=islands, horizon=horizon, masts=masts, cranes=cranes, boxes=boxes), open(sys.argv[5], 'w'), separators=(',', ':'), ensure_ascii=False)
