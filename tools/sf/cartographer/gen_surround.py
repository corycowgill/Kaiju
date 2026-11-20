"""sf_surround.json. Usage: python3 -I gen_surround.py <prep.pickle> <scriptdir> <demdir> <out sf_surround.json>"""
import sys, json, re, math, collections
sys.path.insert(0, sys.argv[2])
from sfgeo import *
from landmarks import parse_h
import numpy as np
from shapely.geometry import Polygon, Point, LineString, box as sbox
from shapely.ops import unary_union
import shapely
prep = load(sys.argv[1])
DEM = np.load(sys.argv[3] + '/dem.npy'); Z, TX0, TY0 = map(int, open(sys.argv[3] + '/dem.txt').read().split())
def elev(x, z):
    la, lo = ll(x, z)
    px = ((lo + 180) / 360 * 2 ** Z - TX0) * 256; py = ((1 - math.asinh(math.tan(math.radians(la))) / math.pi) / 2 * 2 ** Z - TY0) * 256
    i, j = int(py), int(px)
    if not (0 <= i < DEM.shape[0] - 1 and 0 <= j < DEM.shape[1] - 1): return 0.0
    fy, fx = py - i, px - j
    v = DEM[i, j] * (1 - fx) * (1 - fy) + DEM[i, j + 1] * fx * (1 - fy) + DEM[i + 1, j] * (1 - fx) * fy + DEM[i + 1, j + 1] * fx * fy
    return max(0.0, float(v))
BOXP = sbox(MINX, MINZ, MAXX, MAXZ); LAND, WATER = prep['LAND'], prep['WATER']
def polys_of(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'): return [q for p in g.geoms for q in polys_of(p)]
    return []
def gnd(x, z):
    d = BOXP.distance(Point(x, z))
    k = 0.0 if d < 40 else min(1.0, (d - 40) / 60)
    return r1(elev(x, z) * SCALE * k)
REACH = 560.0
boxes = []; named = {}
# cls 1: OSM buildings of 40 m or more outside the box
tall_polys = []
for ref, t, p in prep['bld']:
    c = p.representative_point()
    if BOXP.contains(c) or BOXP.distance(c) > 700: continue
    h = parse_h(t.get('height')) or ((parse_h(t.get('building:levels')) or 0) * 3.5)
    if h < 40 or h > 330 or p.area < 3: continue
    cx, cz, w, d, rot = obb(p if p.geom_type == 'Polygon' else p.convex_hull)
    if t.get('name'): named[t['name']] = dict(i=len(boxes), heightMetres=round(h, 1))
    boxes.append([r1(cx), r1(cz), r1(w), r1(d), r1(h * SCALE), round(rot, 3), 1, gnd(cx, cz)]); tall_polys.append(p)
ntall = len(boxes)
tt = shapely.STRtree(tall_polys) if tall_polys else None
# cls 0: the low fabric (DataSF footprints) in block-sized cells
CELL = 30.0
cells = collections.defaultdict(list)
for bid, hmed, hmax, hmean, g0, p in prep['datasf']:
    c = p.centroid
    if BOXP.contains(c) or BOXP.distance(c) > REACH or hmed < 2.5: continue
    if tt is not None and any(tall_polys[int(j)].contains(c) for j in tt.query(c)): continue
    cells[(math.floor(c.x / CELL), math.floor(c.y / CELL))].append((p.area, min(hmed, 39.0), c.x, c.y, p))
for (i, j), bs in cells.items():
    A = sum(b[0] for b in bs)
    if A < 14: continue
    h = sum(b[0] * b[1] for b in bs) / A
    cx = sum(b[0] * b[2] for b in bs) / A; cz = sum(b[0] * b[3] for b in bs) / A
    big = max(bs, key=lambda b: b[0])
    _, _, _, _, rot = obb(big[4])
    sx = (sum(b[0] * (b[2] - cx) ** 2 for b in bs) / A) ** 0.5; sz = (sum(b[0] * (b[3] - cz) ** 2 for b in bs) / A) ** 0.5
    k = math.sqrt(A / max(1e-6, (sx + 2) * (sz + 2)))
    w = min(CELL * 0.96, max(3.0, (sx + 2) * k)); d = min(CELL * 0.96, max(3.0, (sz + 2) * k))
    boxes.append([r1(cx), r1(cz), r1(w), r1(d), r1(h * SCALE), round(rot, 3) if abs(rot) < 0.3 else 0.0, 0, gnd(cx, cz)])
print('boxes', len(boxes), 'tall', ntall, 'low', len(boxes) - ntall, 'max g', max(b[7] for b in boxes))
# water over the fetch area, islands cut out as holes
def ring(c, tol=None): return ring1(list(c))
water = []
for p in sorted(polys_of(WATER), key=lambda q: -q.area):
    if p.area < 400: continue
    q = p.simplify(1.2)
    if q.geom_type != 'Polygon' or not q.is_valid: q = p.buffer(0).simplify(1.2)
    if q.geom_type != 'Polygon': q = max(polys_of(q), key=lambda g: g.area)
    name = 'San Francisco Bay and the Golden Gate' if not water else 'water'
    water.append(dict(name=name, polygon=ring(q.exterior.coords), holes=[ring(h.coords) for h in q.interiors if Polygon(h).area > 20]))
# small lakes of the western city for completeness
for ref, t, p in prep['areas']:
    if t.get('natural') == 'water' and p.area > 300 and not BOXP.intersects(p) and LAND.contains(p.centroid):
        water.append(dict(name=t.get('name', 'lake'), polygon=ring(p.simplify(0.6).exterior.coords) if p.geom_type == 'Polygon' else ring(max(polys_of(p), key=lambda g: g.area).exterior.coords), holes=[]))
print('water', [(w['name'], len(w['polygon']), len(w['holes'])) for w in water][:8])
wb = sbox(*prep['wideBox'])
isl = [p for p in polys_of(LAND) if not p.intersects(wb.boundary)]
def near(lat, lon): return min(isl, key=lambda p: p.distance(Point(*xz(lon, lat))))
islands = []
alc = near(37.8267, -122.4230); ang = near(37.8609, -122.4326); yt = near(37.8105, -122.3655)
cut = xz(-122.37, 37.8145)[1]
ybi = yt.intersection(sbox(-9999, cut, 9999, 9999)); ti = yt.intersection(sbox(-9999, -9999, 9999, cut))
for name, p, h, note in (('Alcatraz', alc, 41, 'bare sandstone rock with the cellhouse, lighthouse and water tower'), ('Yerba Buena Island', ybi, 103, 'steep wooded island the Bay Bridge tunnels through'),
                         ('Treasure Island', ti, 4, 'flat man-made island (1939 fair), low buildings and palms'), ('Angel Island', ang, 240, 'wooded hill island (Mount Livermore 240 m) north of Alcatraz')):
    p = max(polys_of(p), key=lambda g: g.area)
    islands.append(dict(name=name, polygon=ring(p.simplify(1.0).exterior.coords), heightMetres=h, x=r1(p.centroid.x), z=r1(p.centroid.y), note=note))
print('islands', [(i['name'], i['x'], i['z'], len(i['polygon'])) for i in islands])
def hz(name, lat, lon, h, note):
    x, z = xz(lon, lat); d = math.hypot(x, z)
    return dict(name=name, bearingDeg=round(math.degrees(math.atan2(x, -z)) % 360, 1), distanceKm=round(d / SCALE / 1000, 1), heightMetres=h, dirXZ=[round(x / d, 3), round(z / d, 3)], note=note)
horizon = [
 hz('Marin Headlands (Hawk Hill, Slacker Hill)', 37.8330, -122.4990, 280, 'bare golden-brown grass hills falling steeply to the strait behind the Golden Gate Bridge; green in winter, fog pouring over them in summer'),
 hz('Mount Tamalpais', 37.9235, -122.5965, 784, 'the long dark-green wooded ridge of Marin with its triple summit (East Peak 784 m), the highest thing on the north-west horizon'),
 hz('Angel Island (Mount Livermore)', 37.8609, -122.4326, 240, 'wooded island hill north of Alcatraz, Tiburon and Belvedere behind it'),
 hz('Berkeley Hills (Grizzly Peak)', 37.8820, -122.2330, 536, 'the East Bay hills behind Berkeley: a long even ridge, golden grass and dark eucalyptus, the Campanile and the white Claremont hotel at its foot'),
 hz('Oakland Hills (Round Top)', 37.8490, -122.1920, 537, 'the ridge continues south-east behind downtown Oakland and the container cranes of the Port of Oakland'),
 hz('Mount Diablo', 37.8816, -121.9142, 1173, 'the isolated double-peaked mountain far to the east, seen over the East Bay hills on a clear day'),
 hz('San Bruno Mountain', 37.6850, -122.4340, 400, 'the long bare ridge that closes the city to the south, radio masts on its crest'),
 hz('Twin Peaks and Mount Sutro', 37.7544, -122.4477, 282, 'the two bare grassy summits in the middle of the city to the south-west with the red-and-white Sutro Tower beside them on its wooded hill'),
]
sx, sz = xz(-122.4528, 37.7552)
masts = [dict(name='Sutro Tower', x=r1(sx), z=r1(sz), heightMetres=297.8, g=r1(254 * SCALE))]
cranes = []
for ref, t, (x, z) in prep['nodes']:
    if t.get('man_made') == 'crane' and math.hypot(x, z) < 1950 and x > 600: cranes.append(dict(terminal=t.get('name', 'Port of Oakland'), x=r1(x), z=r1(z), rot=0.0, heightMetres=80.0, boomUp=len(cranes) % 3 == 0))
for ref, t, g in prep['far']:
    if t.get('man_made') == 'crane':
        x = sum(p[0] for p in g) / len(g); z = sum(p[1] for p in g) / len(g)
        if math.hypot(x, z) < 1950 and x > 600:
            a, b = g[0], g[len(g) // 2]
            cranes.append(dict(terminal=t.get('name', 'Port of Oakland'), x=r1(x), z=r1(z), rot=round(math.atan2(-(b[1] - a[1]), b[0] - a[0]), 3), heightMetres=80.0, boomUp=len(cranes) % 3 == 0))
print('cranes', len(cranes), cranes[:3])
meta = dict(scale=SCALE, originLatLon=[LAT0, LON0], counts=dict(boxes=len(boxes), tall=ntall, lowCells=len(boxes) - ntall, water=len(water), islands=len(islands), cranes=len(cranes)),
    note="The city past the play box. boxes: [x, z, w, d, h, rot, cls, g], game units, rot = rotation.y (w along local X). cls 0 = the low fabric (DataSF Building Footprints, LiDAR median heights) of a 30 u cell within %d u of the box edge as one mass (area-weighted height, sized to the built area); cls 1 = an OpenStreetMap building of 40 m or more (its own oriented rectangle) within 700 u of the box (Cathedral Hill, Pacific Heights, the Western Addition, Mission Bay, Potrero). Nothing is boxed across the water: the islands are in islands. "
         "g = ground under the box in game units from the terrarium DEM (Pacific Heights 60-110 m, Twin Peaks and Mount Sutro 250 m+, Potrero Hill 90 m): 0 within 40 u of the play box edge and ramped in over the next 60 u so the surround meets the flat play area; lift the backdrop by g (or a share of it), or ignore it. named: index into boxes. "
         "water: San Francisco Bay, the Golden Gate strait and the ocean over the fetch area ({name, polygon, holes}); the islands (Alcatraz, Angel Island, Yerba Buena / Treasure Island) are holes of the bay polygon, so a point is wet only inside a polygon and outside its holes; the extract ends at 122.32 W (x = %d u), east of which the Oakland shore is not covered. islands: outline polygons with summit heights. masts: Sutro Tower (g = its hilltop). cranes: Port of Oakland container cranes where the extract maps them (it ends just short of most of the port). horizon: far features by bearing (deg clockwise from north) and distance from the origin." % (REACH, round(prep['wideBox'][2])))
json.dump(dict(meta=meta, named=named, water=water, islands=islands, horizon=horizon, masts=masts, cranes=cranes, boxes=boxes), open(sys.argv[4], 'w'), separators=(',', ':'))
