"""sf_detail.json. Usage: python3 -I gen_detail.py <prep.pickle> <scriptdir> <stage2.pickle> <sf_layout.json> <out sf_detail.json>"""
import sys, json, re, math, collections
sys.path.insert(0, sys.argv[2])
from sfgeo import *
from shapely.geometry import Polygon, Point, LineString, box as sbox
from shapely.ops import unary_union, linemerge
prep = load(sys.argv[1]); S2 = load(sys.argv[3]); L = json.load(open(sys.argv[4]))
BOXP = sbox(MINX, MINZ, MAXX, MAXZ); LAND = prep['LAND']
def lines_of(g):
    if g.is_empty: return []
    if g.geom_type == 'LineString': return [g]
    if g.geom_type in ('MultiLineString', 'GeometryCollection'): return [q for p in g.geoms for q in lines_of(p)]
    return []
def polys_of(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'): return [q for p in g.geoms for q in polys_of(p)]
    return []
railtags = {ref: t for ref, t, g in prep['rail']}
LM = {l['id']: l for l in L['landmarks']}
def chain(parts, gap=4.0):
    """Join ordered polylines end to end (reversing where needed); a part that does not continue the line is skipped."""
    parts = [list(p) for p in parts if len(p) >= 2]
    if not parts: return []
    out = list(parts[0])
    if len(parts) > 1:
        a = parts[1]
        d0 = min(math.dist(out[0], a[0]), math.dist(out[0], a[-1])); d1 = min(math.dist(out[-1], a[0]), math.dist(out[-1], a[-1]))
        if d0 < d1: out.reverse()
    for a in parts[1:]:
        d0, d1 = math.dist(out[-1], a[0]), math.dist(out[-1], a[-1])
        if min(d0, d1) > gap: continue
        if d1 < d0: a = a[::-1]
        out += a[1:] if d0 < 0.05 or d1 < 0.05 else a
    return out
def clip_longest(pts, tol=0.15):
    if len(pts) < 2: return []
    g = LineString(pts).intersection(BOXP)
    ls = lines_of(g)
    if not ls: return []
    # rejoin pieces that only left the box for a moment
    l = max(ls, key=lambda q: q.length)
    return ring1(list(l.simplify(tol).coords))
routes = {ref: (t, ws, ns) for ref, t, ws, ns in prep['routes']}
def route_line(rel, surface_only=False):
    t, ws, ns = routes['relation/%d' % rel]
    parts = []
    for r, role, pts in ws:
        if role in ('platform', 'stop'): continue
        tg = railtags.get('way/%d' % r, {})
        if surface_only and (tg.get('tunnel') in ('yes', 'building_passage') and tg.get('tunnel') == 'yes' or (tg.get('layer') or '0').startswith('-')): parts.append(None); continue
        parts.append(pts)
    return parts, ns
# ---------------- rail
rail = []
for ref, t, g in prep['rail']:
    k = t.get('railway')
    if k not in ('tram', 'light_rail', 'rail') or t.get('tunnel') == 'yes' or (t.get('layer') or '0').startswith('-') or t.get('service') in ('yard', 'siding', 'spur') and k != 'rail': continue
    if 'Cable Car' in t.get('name', '') or t.get('tram') == 'cable_car' or 'cable' in t.get('name', '').lower(): continue
    for l in lines_of(LineString(g).intersection(BOXP)):
        if l.length < 3: continue
        rail.append(dict(kind=k, name=t.get('name', ''), points=ring1(list(l.simplify(0.12).coords)), elevated=bool(t.get('bridge'))))
# ---------------- cable cars
turn = []
for ref, t, g in prep['rail']:
    if t.get('railway') == 'turntable':
        c = Polygon(g).centroid if len(g) > 3 else LineString(g).centroid
        if BOXP.contains(c): turn.append((c.x, c.y))
def stops_of(ns, line):
    out = []; seen = set()
    l = LineString(line)
    for r, role, (x, z), name in ns:
        if not name or name in seen or not BOXP.contains(Point(x, z)) or l.distance(Point(x, z)) > 4: continue
        seen.add(name); p = l.interpolate(l.project(Point(x, z))); out.append((l.project(Point(x, z)), dict(name=name, x=r1(p.x), z=r1(p.y))))
    return [o[1] for o in sorted(out, key=lambda o: o[0])]
cable = []
for name, rel in (('California Street line', 2852264), ('Powell-Hyde line', 1959009), ('Powell-Mason line', 1959010)):
    parts, ns = route_line(rel)
    pts = clip_longest(chain([p for p in parts if p]))
    tt = [dict(name='turntable', x=r1(x), z=r1(z)) for x, z in turn if LineString(pts).distance(Point(x, z)) < 14]
    for t in tt:
        t['name'] = 'Powell & Market turntable' if t['z'] > 100 else ('Hyde & Beach turntable (Aquatic Park)' if t['x'] < -250 else 'Bay & Taylor turntable')
    cable.append(dict(name=name, points=pts, stops=stops_of(ns, pts), turntables=tt, lengthU=r1(LineString(pts).length)))
    print(name, len(pts), 'pts', cable[-1]['lengthU'], 'u', len(cable[-1]['stops']), 'stops', tt, pts[0], pts[-1])
# ---------------- streetcar: clean polylines
parts, ns = route_line(2007933)
f = clip_longest(chain([p for p in parts if p]))
parts, ns2 = route_line(63223, surface_only=True)
# the surface part of the N after the Embarcadero portal: the last run of non-tunnel ways
runs = [[]]
for p in parts:
    if p is None: runs.append([])
    else: runs[-1].append(p)
runs = [chain(r) for r in runs if r]
runs = [r for r in runs if len(r) >= 2 and LineString(r).intersects(BOXP)]
ek = clip_longest(max(runs, key=lambda r: LineString(r).intersection(BOXP).length))
if ek and math.dist(ek[0], [LM['ferry_building']['x'], LM['ferry_building']['z']]) > math.dist(ek[-1], [LM['ferry_building']['x'], LM['ferry_building']['z']]): ek = ek[::-1]
streetcar = [dict(name='F Market & Wharves', points=f, stops=stops_of(ns, f), lengthU=r1(LineString(f).length)), dict(name='Embarcadero - King St', points=ek, stops=stops_of(ns2, ek), lengthU=r1(LineString(ek).length))]
for s in streetcar: print(s['name'], len(s['points']), s['lengthU'], s['points'][0], s['points'][-1], len(s['stops']))
# ---------------- ferries
fway = {ref: g for ref, t, g in prep['misc'] if t.get('route') == 'ferry'}
ferries = []
fb = (LM['ferry_building']['x'], LM['ferry_building']['z']); p41 = (-125.0, -362.0)
FAR = sbox(-1500, -1500, 1500, 1500)
for ref, t, g in prep['misc']:
    if t.get('route') != 'ferry' or len(g) < 2: continue
    ends = [min(math.dist(g[k], q) for q in (fb, p41, (6, -310), (307, 329), (319, 399))) for k in (0, -1)]
    if min(ends) > 45: continue
    pts = g if ends[0] <= ends[1] else g[::-1]
    if not BOXP.contains(Point(pts[0])): continue
    ls = lines_of(LineString(pts).intersection(FAR))
    l = min(ls, key=lambda q: q.distance(Point(pts[0])))
    c = list(l.simplify(1.5).coords)
    if math.dist(c[0], pts[0]) > math.dist(c[-1], pts[0]): c = c[::-1]
    nm = t.get('name', 'ferry')
    a_, b_ = [x.strip() for x in nm.split(' - ', 1)] if ' - ' in nm else (nm, '')
    sf_ = lambda q: bool(re.search(r'San Francisco|Pier 33|Oracle Park|Chase Center', q))
    name = ('%s - %s' % (b_, a_) if b_ and sf_(b_) and not sf_(a_) else nm)
    if any(f0['name'].replace(' (Seasonal)', '') == (name if 'Ferry' in name else name + ' Ferry').replace(' (Seasonal)', '') for f0 in ferries): continue
    if 'Ferry' not in name: name += ' Ferry'
    ferries.append(dict(name=name, points=ring1(c), lengthU=r1(l.length), operator=t.get('operator', ''), osm=ref))
for f_ in ferries: print(' ferry', f_['name'], f_['points'][0], f_['points'][-1], f_['lengthU'])
# ---------------- piers, seawall
piers = []
for p in L['parks']:
    if p.get('surface') == 'pier':
        piers.append(dict(name=p['name'], osm=p['osm'], area=round(Polygon(p['polygon']).area / 0.04), polygon=p['polygon']))
landB = LAND.intersection(BOXP.buffer(60)); core = landB.buffer(-16).buffer(16)
sw = core.boundary.intersection(sbox(MINX + 0.3, MINZ + 0.3, MAXX - 0.3, MAXZ - 0.3))
seawall = [ring1(list(l.simplify(0.3).coords)) for l in lines_of(linemerge(sw) if sw.geom_type != 'LineString' else sw) if l.length > 6]
# ---------------- Bay Bridge (west span)
bb = [LineString(g) for ref, t, g in prep['far'] + [(r, t, g) for r, t, g, i in prep['roads']] if t.get('highway') == 'motorway' and t.get('bridge') and re.search(r'Bay Bridge', t.get('name', '') + t.get('bridge:name', '') + t.get('official_name', ''))]
bbu = unary_union(bb)
print('bay bridge ways', len(bb), bbu.bounds if bb else None)
islands = [p for p in polys_of(LAND) if not p.intersects(sbox(*prep['wideBox']).boundary)]
ybi = min(islands, key=lambda p: p.distance(Point(*xz(-122.3655, 37.8105))))
# centreline: project all vertices on the principal axis from the SF shore to YBI and average across the decks
pts = [c for l in bb for c in l.coords if c[0] < 780 and c[0] > 200]
import numpy as np
A = np.array(pts); m = A.mean(0); u, s, vt = np.linalg.svd(A - m); d = vt[0]
if d[0] < 0: d = -d
tpar = (A - m) @ d; order = np.argsort(tpar)
bins = np.arange(tpar.min(), tpar.max() + 12, 12.0); cl = []
for a, b in zip(bins[:-1], bins[1:]):
    sel = A[(tpar >= a) & (tpar < b)]
    if len(sel): cl.append(sel.mean(0))
cl = LineString(cl)
ybi_anch = next(dd for dd in np.arange(cl.length * 0.5, cl.length, 0.5) if ybi.contains(cl.interpolate(dd)))
def at(dm): p = cl.interpolate(ybi_anch + dm * SCALE); return r1(p.x), r1(p.y)
tw = [('W2', -2470, 144.0), ('W3', -1766, 158.0), ('W5', -1058, 158.0), ('W6', -354, 144.0)]
towers = [dict(name=n, x=at(dm)[0], z=at(dm)[1], heightMetres=h) for n, dm, h in tw]
sfa = at(-2824); ca = at(-1412); ya = at(0)
start = max(0.0, ybi_anch - 2824 * SCALE - 60)
seg = [cl.interpolate(dd) for dd in np.arange(start, cl.length, 12.0)]
bayBridge = dict(points=ring1([(p.x, p.y) for p in seg]), towers=towers, centreAnchorage=dict(name='W4', x=ca[0], z=ca[1], heightMetres=86.0), anchorage=dict(x=sfa[0], z=sfa[1]), yerbaBuenaAnchorage=dict(x=ya[0], z=ya[1]),
                 deckHeightMetres=58.0, upperDeckHeightMetres=67.0, widthMetres=20.0, mainSpanMetres=704, sideSpanMetres=354,
                 note="West span of the San Francisco - Oakland Bay Bridge (1936): two suspension bridges end to end sharing the centre anchorage W4, grey-silver steel, double deck. points = deck centreline (mean of the OSM carriageways) from the approach viaduct on Rincon Hill past the San Francisco anchorage out to Yerba Buena Island (the tunnel portal is just past the last point). Towers and anchorages are placed by the bridge's published span lengths (354 / 704 / 354 m each side of W4) measured back along the centreline from the island shore; tower heights above water.")
print('bay bridge', bayBridge['anchorage'], [(t['x'], t['z']) for t in towers], ca, ya, 'sf anchorage on land', LAND.contains(Point(*sfa)))
# ---------------- far set pieces
alc = min(islands, key=lambda p: p.distance(Point(*xz(-122.4230, 37.8267))))
cx, cz, w, dd, rot = obb(alc)
if dd > w: rot += math.pi / 2; w, dd = dd, w
alcatraz = dict(x=r1(alc.centroid.x), z=r1(alc.centroid.y), rot=round(rot, 3), lengthMetres=round(w / SCALE), widthMetres=round(dd / SCALE), heightMetres=41, latLon=[round(v, 5) for v in ll(alc.centroid.x, alc.centroid.y)],
                note='true position north of the box; rot = rotation.y of the island\'s long axis (local +X)')
gst, gnt = xz(-122.4776, 37.8141), xz(-122.4795, 37.8249)
gx, gz = (gst[0] + gnt[0]) / 2, (gst[1] + gnt[1]) / 2
gg = [LineString(g) for ref, t, g in prep['far'] if 'Golden Gate Bridge' in t.get('name', '') and t.get('bridge')]
print('golden gate ways', len(gg), 'tower offsets from the OSM deck (u):', [round(unary_union(gg).distance(Point(*p)), 1) for p in (gst, gnt)] if gg else None)
if gg:
    u = unary_union(gg)
    gst = (lambda p: (p.x, p.y))(u.interpolate(u.project(Point(*gst))) if u.geom_type == 'LineString' else min((l.interpolate(l.project(Point(*gst))) for l in lines_of(u)), key=lambda p: p.distance(Point(*gst))))
    gnt = (lambda p: (p.x, p.y))(u.interpolate(u.project(Point(*gnt))) if u.geom_type == 'LineString' else min((l.interpolate(l.project(Point(*gnt))) for l in lines_of(u)), key=lambda p: p.distance(Point(*gnt))))
    gx, gz = (gst[0] + gnt[0]) / 2, (gst[1] + gnt[1]) / 2
grot = math.atan2(-(gnt[1] - gst[1]), gnt[0] - gst[0])
goldenGateBridge = dict(x=r1(gx), z=r1(gz), rot=round(grot, 3), towers=[dict(name='south', x=r1(gst[0]), z=r1(gst[1]), heightMetres=227), dict(name='north', x=r1(gnt[0]), z=r1(gnt[1]), heightMetres=227)],
                        bearingDeg=round(math.degrees(math.atan2(gx, -gz)) % 360, 1), distanceKm=round(math.hypot(gx, gz) / SCALE / 1000, 2), mainSpanMetres=1280, lengthMetres=2737, deckHeightMetres=67,
                        note='true position, far west-north-west; x / z = mid-span, rot = rotation.y with the deck along local +X (south tower to north tower); bearing / distance from the origin')
sx, sz = xz(-122.4528, 37.7552)
sutro = dict(x=r1(sx), z=r1(sz), heightMetres=297.8, groundMetres=254, latLon=[37.7552, -122.4528], note='Sutro Tower, the red-and-white three-legged TV mast on the hill between Twin Peaks and Mount Sutro; top 552 m above sea level')
cs = xz(-122.3640, 37.7720)
container = dict(x=r1(cs[0]), z=r1(cs[1]), rot=0.35, note='Anchorage 9, the big-ship anchorage south of the Bay Bridge off the eastern waterfront: open bay water outside the box to the south-east')
print('alcatraz', alcatraz, 'gg', goldenGateBridge['bearingDeg'], goldenGateBridge['distanceKm'], 'container wet', not LAND.contains(Point(*cs)))
meta = dict(scale=SCALE, originLatLon=[LAT0, LON0], note="Detail dressing for San Francisco (same frame as sf_layout.json). rail: surface tracks from OSM (the F-line streetcar on Market St and the Embarcadero, Muni Metro on the Embarcadero / King St / 3rd and 4th Streets, Caltrain's depot throat) as raw polylines; elevated = on a bridge. "
    "streetcar: ONE clean ordered polyline per line, clipped to the play box: 'F Market & Wharves' (from the box's south-west edge up Market St to the Ferry Building, then the Embarcadero and Jefferson / Beach St to Fisherman's Wharf; the inbound track of the OSM route relation) and 'Embarcadero - King St' (Muni Metro N/T surface track from the Ferry portal south along the Embarcadero and King St to 4th & King). "
    "cableCar: one clean ordered polyline per line (outbound route relation), stops in line order and the turntables at the line's ends. ferries: real routes out of the Ferry Building, Pier 41 and Pier 33 running out past the bounds (first point at the dock, clipped at 1500 u). piers: the deck polygons of sf_layout parks with surface 'pier'. seawall: the bulkhead line behind the piers (the land edge with the pier fingers removed), polylines. "
    "bayBridge, alcatraz, goldenGateBridge, sutroTower, containerShip: the far set pieces at their true positions (outside the box).")
out = dict(meta=meta, rail=rail, streetcar=streetcar, cableCar=cable, ferries=ferries, piers=piers, seawall=seawall, bayBridge=bayBridge, sculptures=[], containerShip=container, alcatraz=alcatraz, goldenGateBridge=goldenGateBridge, sutroTower=sutro)
json.dump(out, open(sys.argv[5], 'w'), separators=(',', ':'))
print('rail', len(rail), 'ferries', len(ferries), 'piers', len(piers), 'seawall', len(seawall))
