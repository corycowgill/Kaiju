"""tokyo_detail.json. Usage: python3 -I gen_detail.py <prep.pickle> <scriptdir> <stage2.pickle> <tokyo_layout.json> <out tokyo_detail.json>"""
import sys, json, re, math, collections
sys.path.insert(0, sys.argv[2])
from tkgeo import *
import landmarks as LMK
from lm_info import SKYTREE_TRUE
import numpy as np
from shapely.geometry import Polygon, Point, LineString, MultiLineString, box as sbox
from shapely.ops import unary_union, linemerge
from shapely.prepared import prep as sprep
prep = load(sys.argv[1]); S2 = load(sys.argv[3]); L = json.load(open(sys.argv[4]))
BOXP = sbox(MINX, MINZ, MAXX, MAXZ); LAND = S2['LAND']
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
wetP = sprep(unary_union([Polygon(w['polygon'], w.get('holes', [])).buffer(0) for w in L['water'] if w['kind'] == 'bay']))
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
    ls = lines_of(LineString(pts).intersection(BOXP))
    if not ls: return []
    l = max(ls, key=lambda q: q.length)
    return ring1(list(l.simplify(tol).coords))
routes = {ref: (t, ws, ns) for ref, t, ws, ns in prep['routes']}
def route_line(rel):
    t, ws, ns = routes['relation/%d' % rel]
    return [pts for r, role, pts in ws if role not in ('platform', 'stop')], ns
def stops_of(ns, line):
    out = []; seen = set(); l = LineString(line)
    for r, role, (x, z), name in ns:
        if not name or name in seen or not BOXP.contains(Point(x, z)) or l.distance(Point(x, z)) > 6: continue
        seen.add(name); p = l.interpolate(l.project(Point(x, z))); out.append((l.project(Point(x, z)), dict(name=name, x=r1(p.x), z=r1(p.y))))
    return [o[1] for o in sorted(out, key=lambda o: o[0])]
def north_first(pts): return pts if pts and pts[0][1] <= pts[-1][1] else pts[::-1]
# ---------------- rail (raw track pieces)
rail = []
for ref, t, g in prep['rail']:
    k = t.get('railway')
    if k not in ('rail', 'light_rail', 'monorail') or t.get('tunnel') == 'yes' or str(t.get('layer') or '0').startswith('-') or t.get('service') in ('yard', 'siding', 'spur', 'crossover') or len(g) < 2: continue
    for l in lines_of(LineString(g).intersection(BOXP)):
        if l.length < 4: continue
        rail.append(dict(kind=k, name=t.get('name:en') or t.get('name', ''), points=ring1(list(l.simplify(0.15).coords)), elevated=bool(t.get('bridge'))))
# ---------------- trains: one clean polyline a line
trains = []
def add_train(name, kind, pts, elevated, deck, ns=None, note=''):
    pts = clip_longest(pts)
    e = dict(name=name, kind=kind, points=pts, elevated=elevated, deckMetres=deck, lengthU=r1(LineString(pts).length), stops=stops_of(ns or [], pts) if ns else [], note=note)
    trains.append(e); print(' train', name, len(pts), 'pts', e['lengthU'], 'u', pts[0], pts[-1], len(e['stops']), 'stops')
parts, ns = route_line(1972920)
add_train('JR Yamanote Line', 'yamanote', north_first(clip_longest(chain(parts))), True, 7.0, ns,
          'the Yamanote loop / Keihin-Tohoku corridor on its 1910 red-brick arch viaduct from Tokyo Station through Yurakucho and Shimbashi, then on embankment and bridges past Hamamatsucho, Tamachi and Takanawa Gateway to the south edge (outer-loop track of route relation 1972920)')
# Tokaido Shinkansen: the merged line of the mapped tracks that reaches furthest through the box
sk = [LineString(g) for ref, t, g in prep['rail'] if '東海道新幹線' in t.get('name', '') and t.get('railway') == 'rail' and t.get('service') not in ('yard', 'siding', 'spur', 'crossover') and len(g) > 1]
m = linemerge(unary_union(sk)); cands = []
for l in lines_of(m):
    for q in lines_of(l.intersection(BOXP)): cands.append(q)
# stitch pieces of one track greedily from the southern edge northward
cands.sort(key=lambda q: -q.length)
best = list(cands[0].coords)
for _ in range(40):
    grew = False
    for q in cands[1:]:
        c = list(q.coords)
        for end in (0, -1):
            e = best[end]
            for cc in (c, c[::-1]):
                if math.dist(e, cc[0]) < 0.6 and LineString(best).distance(Point(cc[-1])) > 3:
                    best = (cc[::-1] + best) if end == 0 else (best + cc); grew = True; break
            if grew: break
        if grew: break
    if not grew: break
add_train('Tokaido Shinkansen', 'shinkansen', north_first(best), True, 8.0, None, 'the Tokaido Shinkansen from its Tokyo Station platforms south beside the Yamanote viaduct through Yurakucho, Shimbashi and Hamamatsucho to the south edge (toward Shinagawa)')
parts, ns = route_line(3417174)
add_train('Tokyo Monorail', 'monorail', north_first(clip_longest(chain(parts))), True, 12.0, ns, 'the Tokyo Monorail (straddle-beam, 1964) from Monorail Hamamatsucho station south over the Shibaura canals and along the Keihin canal toward Haneda')
parts, ns = route_line(3300716)
yk = clip_longest(chain(parts))
if yk and math.dist(yk[0], [-36, -9]) > math.dist(yk[-1], [-36, -9]): yk = yk[::-1]
add_train('Yurikamome', 'yurikamome', yk, True, 14.0, ns, 'the Yurikamome automated guideway from Shimbashi through Shiodome, Takeshiba, Hinode and Shibaura-futo, round the 270-degree loop and over the Rainbow Bridge (lower deck, about 50 m up) to Odaiba-kaihinkoen and Daiba, leaving the box toward Aomi and Toyosu')
# ---------------- ferries / water buses
ferries = []
FAR = sbox(-1900, -1900, 1900, 2300)
FN = [('way/905003475', 'Sumida River Water Bus: Hinode Pier - Hama-rikyu', False), ('way/905003476', 'Sumida River Water Bus: Hama-rikyu - Asakusa', False), ('way/905018176', 'Odaiba Water Bus: Hinode Pier - Odaiba Seaside Park', True),
      ('way/1286900865', 'Blue Ferry: Hinode Pier - Harumi', False), ('way/424083558', 'Tokai Kisen Izu Islands Ferry: Takeshiba - Miyake / Hachijo', False), ('way/202535053', 'Tokai Kisen Ferry: Takeshiba - Oshima', False), ('way/837995827', 'Ogasawara Maru Ferry: Takeshiba - Chichijima', False),
      ('way/905252387', 'Tokyo Mizube Line Water Bus: Asakusa - Odaiba - Kasai', False)]
misc = {ref: (t, g) for ref, t, g in prep['misc']}
for ref, name, rev in FN:
    if ref not in misc: print('  !! ferry missing', ref); continue
    t, g = misc[ref]
    pts = g[::-1] if rev else g
    if not BOXP.contains(Point(pts[0])):
        if BOXP.contains(Point(pts[-1])): pts = pts[::-1]
        else:
            # passes through: start where it is deepest inside the box
            ls = lines_of(LineString(pts).intersection(BOXP))
            if not ls: continue
            pts = list(max(ls, key=lambda q: q.length).coords)
    ls = lines_of(LineString(pts).intersection(FAR))
    l = min(ls, key=lambda q: q.distance(Point(pts[0])))
    c = list(l.simplify(1.5).coords)
    if math.dist(c[0], pts[0]) > math.dist(c[-1], pts[0]): c = c[::-1]
    ferries.append(dict(name=name, points=ring1(c), lengthU=r1(l.length), operator=t.get('operator', ''), nameJa=t.get('name', ''), osm=ref))
for f_ in ferries: print(' ferry', f_['name'], f_['points'][0], f_['points'][-1], f_['lengthU'])
# ---------------- piers, seawall
piers = [dict(name=p['name'], osm=p['osm'], area=round(Polygon(p['polygon']).area / 0.04), polygon=p['polygon']) for p in L['parks'] if p.get('surface') == 'pier']
landB = BOXP.buffer(60).difference(S2['tidal']); core = landB.buffer(-5).buffer(5)
sw = core.boundary.intersection(sbox(MINX + 0.3, MINZ + 0.3, MAXX - 0.3, MAXZ - 0.3))
seawall = [ring1(list(l.simplify(0.3).coords)) for l in lines_of(linemerge(sw) if sw.geom_type != 'LineString' else sw) if l.length > 12]
# ---------------- Rainbow Bridge
rb = LMK.rainbow(prep)
at = rb['at']
deck = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(rb['deckA'], rb['deckB'])] if len(rb['deckA']) == len(rb['deckB']) else rb['deckA']
west = rb['west'] if math.dist(rb['west'][-1], deck[0]) < math.dist(rb['west'][0], deck[0]) else rb['west'][::-1]
east = rb['east'] if math.dist(rb['east'][0], deck[-1]) < math.dist(rb['east'][-1], deck[-1]) else rb['east'][::-1]
full = clip_longest(west + deck + east, 0.2)
tw = [dict(name='Shibaura tower', x=r1(at(-285)[0]), z=r1(at(-285)[1]), heightMetres=126.0), dict(name='Odaiba tower', x=r1(at(285)[0]), z=r1(at(285)[1]), heightMetres=126.0)]
rainbowBridge = dict(points=full, mainSpan=[[r1(v) for v in at(-399)], [r1(v) for v in at(399)]], towers=tw, anchorages=[dict(name='Shibaura anchorage', x=r1(at(-399)[0]), z=r1(at(-399)[1])), dict(name='Odaiba anchorage', x=r1(at(399)[0]), z=r1(at(399)[1]))],
    x=r1(rb['mid'][0]), z=r1(rb['mid'][1]), rot=round(rb['rot'], 3), deckHeightMetres=52.0, upperDeckHeightMetres=60.0, widthMetres=29.0, mainSpanMetres=570, sideSpanMetres=114, lengthMetres=798,
    loop=dict(x=-52.0, z=600.0, radiusMetres=130, note='the 270-degree loop of the lower-deck road and the Yurikamome on the Shibaura side (centre approximate; the Yurikamome line in trains follows it exactly)'),
    note="Rainbow Bridge (1993): white three-span suspension bridge, 126 m towers, double deck (Shuto Expressway Route 11 above; the bay road, the Yurikamome and walkways below). points = the expressway deck centreline: the Shibaura approach viaduct from the north, the main bridge anchorage to anchorage and the Odaiba approach viaduct to the east edge of the box. x / z = mid-span of the OSM deck, rot = rotation.y with the deck along local +X (Shibaura to Odaiba); mainSpan = the two anchorage points 798 m apart; towers 285 m either side of mid-span by the published spans; heights above the water.")
print(' rainbow', rainbowBridge['x'], rainbowBridge['z'], tw, 'towers wet', [bool(wetP.contains(Point(t['x'], t['z']))) for t in tw], 'anchorages wet', [bool(wetP.contains(Point(a['x'], a['z']))) for a in rainbowBridge['anchorages']], len(full))
# ---------------- elevated expressways (clean polylines)
ex = collections.defaultdict(list)
for r in L['roads']:
    if r['expressway'] and r.get('bridge') and not r.get('tunnel') and LineString(r['points']).length > 2:
        ex[r['name'] or 'Shuto Expressway ramp'].append(LineString(r['points']))
expressways = []
for name, ls in ex.items():
    m = linemerge(unary_union(ls))
    kept = []
    for l in sorted(lines_of(m), key=lambda q: -q.length):
        if l.length < 14: continue
        if any(l.intersection(k.buffer(3.2)).length > 0.7 * l.length for k in kept): continue      # the opposite carriageway
        kept.append(l)
    for l in kept:
        expressways.append(dict(name=name, points=ring1(list(l.simplify(0.2).coords)), deckMetres=40.0 if 'Daiba' in name and l.distance(Point(rb['mid'])) < 120 else 12.0, lengthU=r1(l.length)))
print(' expressways', len(expressways), collections.Counter(e['name'] for e in expressways).most_common(12))
# ---------------- far set pieces
obst = unary_union([LAND.intersection(BOXP.buffer(100)), unary_union([Polygon(b['footprint']) for b in L['buildings'] if b.get('onPier')] or [Point(0, 0)])])
best = None
for x in np.arange(240, MAXX - 20, 6.0):
    for z in np.arange(560, 780, 6.0):
        if wetP.contains(Point(x, z)):
            c = obst.distance(Point(x, z)) - 0.02 * math.hypot(x - 330, z - 650)
            if LineString(full).distance(Point(x, z)) > 40 and (best is None or c > best[0]): best = (c, float(x), float(z))
container = dict(x=r1(best[1]), z=r1(best[2]), rot=0.9, clearU=r1(best[0]), note='a container ship at anchor in the port basin between the Toyosu wharf, Odaiba and the Rainbow Bridge (the fairway to the Harumi and Shibaura piers), inside the box')
skx, skz = xz(SKYTREE_TRUE[1], SKYTREE_TRUE[0])
skytree = dict(trueLatLon=list(SKYTREE_TRUE), x=r1(skx), z=r1(skz), heightMetres=634, movedTo=dict(x=LM['tokyo_skytree']['x'], z=LM['tokyo_skytree']['z']),
               note='the true position of Tokyo Skytree at Oshiage (north-east, outside the box); in play it is moved to Harumi Futo Park (movedTo, the tokyo_skytree landmark)')
meta = dict(scale=SCALE, originLatLon=[LAT0, LON0], counts=dict(trains=len(trains), rail=len(rail), ferries=len(ferries), piers=len(piers), seawall=len(seawall), expressways=len(expressways)),
    note="Detail dressing for Tokyo (same frame as tokyo_layout.json). trains: ONE clean ordered polyline per line, clipped to the play box, north / Shimbashi end first: {name, kind: yamanote | shinkansen | monorail | yurikamome, points, elevated, deckMetres (typical deck height above the street), stops (in line order, names from OSM), lengthU}. "
         "rail: the other mapped surface / elevated tracks as raw polylines (the Tokaido, Yokosuka, Keihin-Tohoku and Keikyu lines, the Shinkansen approaches, the Yurikamome and monorail second tracks); elevated = on a bridge or viaduct; subways and tunnels are left out. "
         "ferries: real routes from OSM, first point at the dock inside the box, clipped at the fetch area: the Sumida River water buses from Hinode Pier and Hama-rikyu up-river toward Asakusa and across to Odaiba, the Harumi boat, and the island ships from Takeshiba that sail out of the bay past the bounds. "
         "piers: the deck polygons of tokyo_layout parks with surface 'pier'. seawall: the quay line (the land edge with jetties under 50 m wide removed), polylines. rainbowBridge: see its note. expressways: the elevated Shuto Expressway / Tokyo Expressway decks as clean polylines, one carriageway of each pair ({name, points, deckMetres}); the level may draw decks on pylons along them. containerShip: {x, z, rot}. skytree: the true position, for the note.")
out = dict(meta=meta, trains=trains, rail=rail, ferries=ferries, piers=piers, seawall=seawall, rainbowBridge=rainbowBridge, expressways=expressways, sculptures=[], containerShip=container, skytree=skytree)
json.dump(out, open(sys.argv[5], 'w'), separators=(',', ':'), ensure_ascii=False)
print('rail', len(rail), 'ferries', len(ferries), 'piers', len(piers), 'seawall', len(seawall), 'container', container)
