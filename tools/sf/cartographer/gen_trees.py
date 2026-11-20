"""sf_trees.json. Usage: python3 -I gen_trees.py <prep.pickle> <scriptdir> <stage2.pickle> <sf_layout.json> <out sf_trees.json>"""
import sys, json, re, math, random
sys.path.insert(0, sys.argv[2])
from sfgeo import *
from shapely.geometry import Polygon, Point, LineString, box as sbox
from shapely.ops import unary_union
from shapely.prepared import prep as sprep
import shapely
prep = load(sys.argv[1]); S2 = load(sys.argv[3]); L = json.load(open(sys.argv[4]))
rnd = random.Random(7)
PALM = re.compile(r'Phoenix|Washingtonia|Syagrus|Trachycarpus|Brahea|Archontophoenix|Howea|Chamaerops|Butia|Livistona|\bPalm\b', re.I)
PLANE = re.compile(r'Platanus|London Plane|Sycamore', re.I)
EVER = re.compile(r'Pinus|Cupressus|Hesperocyparis|Cypress|\bPine\b|Sequoia|Araucaria|Cedrus|Juniper|Calocedrus|Thuja|Picea|Abies|Casuarina|Cedar|Redwood|Pseudotsuga', re.I)
def kind_of(sp, default):
    if PALM.search(sp): return 'palm'
    if PLANE.search(sp): return 'plane'
    if EVER.search(sp): return 'evergreen'
    return default
parks = [(p, Polygon(p['polygon']).buffer(0)) for p in L['parks'] if p['kind'] in ('lawn', 'garden') and p.get('surface') != 'pier']
green = unary_union([q for p, q in parks]); greenP = sprep(green)
wet = sprep(unary_union([S2['waterFinal']] + [p for r, t, p in S2['ponds']]))
vb = L['ring']['ringClearTrees']; ringB = sbox(*vb)
bU = sprep(unary_union([Polygon(b['footprint']).buffer(0) for b in L['buildings']]).buffer(-0.3))
T = []
for (x, z), sp, site, street in prep['datasf_trees']:
    if not (MINX + 0.5 < x < MAXX - 0.5 and MINZ + 0.5 < z < MAXZ - 0.5): continue
    if not sp or sp.strip().startswith('::') and False: pass
    if 'Empty' in (site or '') : continue
    T.append([x, z, kind_of(sp or '', 'street'), 1])
nd = len(T)
for ref, t, (x, z) in prep['nodes']:
    if t.get('natural') != 'tree' or not (MINX + 0.5 < x < MAXX - 0.5 and MINZ + 0.5 < z < MAXZ - 0.5): continue
    sp = ' '.join(t.get(k, '') for k in ('species', 'genus', 'taxon', 'species:en', 'genus:en', 'name'))
    inpark = greenP.contains(Point(x, z))
    k = kind_of(sp, 'park' if inpark else 'street')
    if t.get('leaf_type') == 'needleleaved' and k in ('park', 'street'): k = 'evergreen'
    if t.get('leaf_type') == 'palm' or t.get('genus') == 'Phoenix': k = 'palm'
    T.append([x, z, k, 1])
print('datasf', nd, 'osm', len(T) - nd)
# palms of the Embarcadero median / promenade and King St where the surveys have none
def have(kind, x, z, r):
    return any(t[2] == kind and abs(t[0] - x) < r and abs(t[1] - z) < r for t in T)
syn = 0
for name, step, off in (('The Embarcadero', 5.0, 0.0), ('King Street', 5.0, 0.0)):
    for r in L['roads']:
        if r['name'] != name or r.get('expressway'): continue
        l = LineString(r['points']); d = step / 2
        while d < l.length:
            p = l.interpolate(d); d += step
            if not have('palm', p.x, p.y, 3.2): T.append([p.x, p.y, 'palm', 0]); syn += 1
# Union Square's corner palms and Market St's east end
print('synth palms', syn)
# park trees where OSM maps none: woods on a 4.2 u grid, lawns sparsely round the edge
import numpy as np
pts = np.array([(t[0], t[1]) for t in T])
synp = 0
for p, q in parks:
    if q.area < 12 or re.search(r'Oracle|pitch|Playground', p['name']): continue
    x0, z0, x1, z1 = q.bounds
    inside = int(((pts[:, 0] > x0) & (pts[:, 0] < x1) & (pts[:, 1] > z0) & (pts[:, 1] < z1)).sum())
    wood = p.get('surface') == 'trees'
    if inside > q.area / (30 if wood else 90): continue
    step = 4.2 if wood else 7.5
    qp = sprep(q.buffer(-0.8)); 
    for x in np.arange(x0, x1, step):
        for z in np.arange(z0, z1, step):
            xx, zz = x + rnd.uniform(-1.5, 1.5), z + rnd.uniform(-1.5, 1.5)
            if not qp.contains(Point(xx, zz)): continue
            if not wood and q.buffer(-4.5).contains(Point(xx, zz)) and rnd.random() < 0.7: continue   # lawns stay open in the middle
            ev = wood and rnd.random() < 0.55 or re.search(r'Pioneer|Aquatic|Victoria|Ina Coolbrith|Huntington', p['name']) and rnd.random() < 0.6
            T.append([xx, zz, 'evergreen' if ev else 'park', 0]); synp += 1
print('synth park', synp)
# clean
out = []; seen = {}
PRI = {'palm': 0, 'evergreen': 1, 'park': 1, 'plane': 2, 'street': 3}
T.sort(key=lambda t: (PRI[t[2]], -t[3]))
for t in T:
    x, z = t[0], t[1]
    if not (MINX + 0.5 < x < MAXX - 0.5 and MINZ + 0.5 < z < MAXZ - 0.5): continue
    if ringB.contains(Point(x, z)) or wet.contains(Point(x, z)) or bU.contains(Point(x, z)): continue
    k = (int(x // 1), int(z // 1)); ok = True
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for o in seen.get((k[0] + i, k[1] + j), ()):
                if math.hypot(o[0] - x, o[1] - z) < 1.0: ok = False
    if not ok: continue
    seen.setdefault(k, []).append(t); out.append(t)
CAP = 11000
if len(out) > CAP:
    keep = [t for t in out if t[2] != 'street']; st = [t for t in out if t[2] == 'street']
    rnd.shuffle(st); out = keep + st[:max(0, CAP - len(keep))]
out = [[r1(t[0]), r1(t[1]), t[2], t[3]] for t in out]
out.sort(key=lambda t: (t[2], t[1], t[0]))
import collections
c = collections.Counter(t[2] for t in out); print(len(out), c)
meta = dict(scale=SCALE, originLatLon=[LAT0, LON0], counts=dict(c), surveyed=sum(t[3] for t in out),
    note="Trees as [x, z, kind, surveyed] (surveyed 1 = a DataSF Street Tree List tree or an OpenStreetMap natural=tree, 0 = synthesised). kind: palm = Canary Island date palms and fan palms (the Embarcadero median and promenade, King St by the ballpark, Market St's east end, Union Square: 12-18 m, thick trunk, big crown; synthesised every 25 m along The Embarcadero and King St where the surveys map none); plane = London plane (Platanus: Market St, the pollarded planes of Civic Center); street = other street trees (ficus, Brisbane box, flowering pear and plum, New Zealand Christmas tree, ginkgo: 6-12 m, rounded, in sidewalk pits); evergreen = Monterey cypress and pine, redwoods (parks, Telegraph Hill, Aquatic Park: dark, wind-shaped); park = mixed park trees (synthesised on a jittered grid in woods and round the edges of lawns where OSM maps none). Trees closer than 1 u to another, in water, inside building footprints or inside the ring venue box (ring.ringClearTrees in sf_layout.json) are left out; street trees are thinned at random to keep the file under about 11,000.")
json.dump(dict(meta=meta, trees=out), open(sys.argv[5], 'w'), separators=(',', ':'))
# patch the layout's counts and site checks
L['meta']['counts']['trees'] = len(out)
import numpy as np
A = np.array([(t[0], t[1]) for t in out])
def within(x, z): return int((np.hypot(A[:, 0] - x, A[:, 1] - z) <= 6).sum())
sites = {'player': L['spawn']['player'], 'duel.a': L['duel']['a'], 'duel.b': L['duel']['b'], 'soldier': L['soldier'], 'ring': L['ring']}
for e in L['spawn']['enemies']: sites['enemy.' + e['label']] = e
for k, v in sites.items(): L['meta']['siteChecks'][k]['treesWithin6'] = within(v['x'], v['z'])
json.dump(L, open(sys.argv[4], 'w'), separators=(',', ':'))
