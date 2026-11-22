"""tokyo_trees.json. Usage: python3 -I gen_trees.py <prep.pickle> <scriptdir> <stage2.pickle> <tokyo_layout.json> <out tokyo_trees.json>"""
import sys, json, re, math, random, collections
sys.path.insert(0, sys.argv[2])
from tkgeo import *
import numpy as np
from shapely.geometry import Polygon, Point, LineString, box as sbox
from shapely.ops import unary_union
from shapely.prepared import prep as sprep
prep = load(sys.argv[1]); S2 = load(sys.argv[3]); L = json.load(open(sys.argv[4]))
rnd = random.Random(7)
SAKURA = re.compile(r'Prunus|Cerasus|サクラ|桜|ソメイヨシノ|cherry', re.I)
GINKGO = re.compile(r'Ginkgo|イチョウ|銀杏', re.I)
ZELK = re.compile(r'Zelkova|ケヤキ|欅', re.I)
PINE = re.compile(r'Pinus|マツ|松|Cryptomeria|Cedrus|Metasequoia|Picea|Abies|Juniper|\bPine\b', re.I)
def kind_of(sp, default):
    if SAKURA.search(sp): return 'sakura'
    if GINKGO.search(sp): return 'ginkgo'
    if ZELK.search(sp): return 'zelkova'
    if PINE.search(sp): return 'pine'
    return default
parks = [(p, Polygon(p['polygon']).buffer(0)) for p in L['parks'] if p['kind'] in ('lawn', 'garden') and p.get('surface') != 'pier']
green = unary_union([q for p, q in parks]); greenP = sprep(green)
wetU = unary_union([Polygon(w['polygon'], w.get('holes', [])).buffer(0) for w in L['water']])
wet = sprep(wetU)
vb = L['ring']['ringClearTrees']; ringB = sbox(*vb)
bU = sprep(unary_union([Polygon(b['footprint']).buffer(0) for b in L['buildings']]).buffer(-0.3))
T = []
for ref, t, (x, z) in prep['nodes']:
    if t.get('natural') != 'tree' or not (MINX + 0.5 < x < MAXX - 0.5 and MINZ + 0.5 < z < MAXZ - 0.5): continue
    sp = ' '.join(t.get(k, '') for k in ('species', 'genus', 'taxon', 'species:en', 'species:ja', 'genus:en', 'genus:ja', 'name'))
    k = kind_of(sp, 'park' if greenP.contains(Point(x, z)) else 'street')
    if t.get('leaf_type') == 'needleleaved' and k in ('park', 'street'): k = 'pine'
    T.append([x, z, k, 1])
nosm = len(T)
# mapped tree rows: a tree every 8 m
for ref, t, g in prep['misc']:
    if t.get('natural') != 'tree_row' or len(g) < 2: continue
    l = LineString(g)
    if not l.intersects(sbox(MINX, MINZ, MAXX, MAXZ)): continue
    sp = ' '.join(t.get(k, '') for k in ('species', 'genus', 'species:ja', 'genus:ja', 'name'))
    k = kind_of(sp, 'street'); d = 0.8
    while d < l.length:
        p = l.interpolate(d); d += 1.6; T.append([p.x, p.y, k, 1])
print('osm trees', nosm, 'tree-row trees', len(T) - nosm)
# avenue trees along named streets, both kerbs
AVE = [(r'日比谷通り|Hibiya', 'ginkgo', 2.2), (r'行幸通り|Gy[oō]k[oō]', 'ginkgo', 2.4), (r'丸の内仲通り|Naka.d[oō]ri', 'zelkova', 2.0), (r'内堀通り|Uchibori', 'ginkgo', 2.6), (r'桜田通り|Sakurada', 'ginkgo', 2.4), (r'外堀通り|Sotobori', 'zelkova', 2.4),
       (r'中央通り|Ch[uū][oō]', 'zelkova', 2.6), (r'晴海通り|Harumi', 'zelkova', 2.6), (r'昭和通り|Sh[oō]wa', 'ginkgo', 2.6), (r'第一京浜|Keihin', 'ginkgo', 2.6), (r'青山通り|Aoyama', 'zelkova', 2.6), (r'六本木通り|Roppongi', 'zelkova', 2.6),
       (r'新大橋通り|Shin.?[oō]hashi', 'zelkova', 2.4), (r'海岸通り|Kaigan', 'street', 2.6), (r'永代通り|Eitai', 'ginkgo', 2.4), (r'清澄通り|Kiyosumi', 'zelkova', 2.4), (r'愛宕通り|Atago', 'ginkgo', 2.2), (r'新虎通り|Shintora', 'zelkova', 2.6), (r'八重洲通り|Yaesu', 'ginkgo', 2.4), (r'鍛冶橋通り|Kajibashi', 'zelkova', 2.4)]
syn = 0
for rx, kind, off in AVE:
    R = re.compile(rx)
    for r in L['roads']:
        if r.get('expressway') or r.get('bridge') or not R.search(r['name'] + ' ' + r.get('nameJa', '')): continue
        l = LineString(r['points'])
        if l.length < 6: continue
        for side in (off, -off):
            try: o = l.parallel_offset(abs(side), 'left' if side > 0 else 'right')
            except Exception: continue
            for q in ([o] if o.geom_type == 'LineString' else list(getattr(o, 'geoms', []))):
                d = 2.0 + rnd.uniform(0, 1)
                while d < q.length - 1.5:
                    p = q.interpolate(d); d += 3.2; T.append([p.x, p.y, kind, 0]); syn += 1
# other major streets: sparse mixed street trees
for r in L['roads']:
    if r['class'] != 'major' or r.get('expressway') or r.get('bridge'): continue
    l = LineString(r['points'])
    if l.length < 12: continue
    for side in ('left', 'right'):
        try: o = l.parallel_offset(2.3, side)
        except Exception: continue
        for q in ([o] if o.geom_type == 'LineString' else list(getattr(o, 'geoms', []))):
            d = 3.0 + rnd.uniform(0, 3)
            while d < q.length - 2:
                p = q.interpolate(d); d += 6.5; T.append([p.x, p.y, 'street', 0]); syn += 1
print('synth street', syn)
# cherries along the moats and the river banks: the inside edge of the palace moats (Chidorigafuchi side = north-west), the Sumida terraces
moats = [Polygon(w['polygon']).buffer(0) for w in L['water'] if w['kind'] == 'pond' and Polygon(w['polygon']).area > 150]
sy = 0
for m in moats:
    edge = m.buffer(1.2).exterior
    d = 0.0
    while d < edge.length:
        p = edge.interpolate(d); d += 3.4
        k = 'sakura' if (p.x < -180 or p.y < -430) else 'pine' if rnd.random() < 0.6 else 'sakura' if rnd.random() < 0.3 else None
        if k: T.append([p.x, p.y, k, 0]); sy += 1
bay = [Polygon(w['polygon']).buffer(0) for w in L['water'] if w['kind'] == 'bay']
riv = sbox(250, -260, MAXX, 60)       # the Sumida terraces between Tsukuda, Akashicho and Shinkawa
for m in bay:
    for ring in [m.exterior]:
        e = ring.intersection(riv)
        for q in ([e] if e.geom_type == 'LineString' else list(getattr(e, 'geoms', []))):
            if q.geom_type != 'LineString': continue
            try: o = q.parallel_offset(1.2, 'left')
            except Exception: continue
            for oo in ([o] if o.geom_type == 'LineString' else list(getattr(o, 'geoms', []))):
                d = 1.0
                while d < oo.length:
                    p = oo.interpolate(d); d += 4.5; T.append([p.x, p.y, 'sakura', 0]); sy += 1
            try: o = q.parallel_offset(1.2, 'right')
            except Exception: continue
            for oo in ([o] if o.geom_type == 'LineString' else list(getattr(o, 'geoms', []))):
                d = 1.0
                while d < oo.length:
                    p = oo.interpolate(d); d += 4.5; T.append([p.x, p.y, 'sakura', 0]); sy += 1
print('synth moat / river', sy)
# park trees where OSM maps none: woods on a jittered grid, lawns round the edge
pts = np.array([(t[0], t[1]) for t in T]); synp = 0
def park_kind(name, wood):
    n = name.lower(); r = rnd.random()
    if 'kokyo gaien' in n: return 'pine' if r < 0.9 else 'park'
    if 'hama-rikyu' in n or 'hamarikyu' in n: return 'pine' if r < 0.55 else 'sakura' if r < 0.7 else 'park'
    if 'shiba rikyu' in n: return 'pine' if r < 0.5 else 'park'
    if 'imperial palace' in n: return 'park' if r < 0.72 else 'pine' if r < 0.9 else 'sakura'
    if 'shiba park' in n or 'zōjō' in n: return 'sakura' if r < 0.35 else 'park' if r < 0.8 else 'ginkgo'
    if 'hibiya' in n: return 'ginkgo' if r < 0.3 else 'park' if r < 0.8 else 'zelkova'
    if wood: return 'park' if r < 0.8 else 'sakura'
    return 'sakura' if r < 0.28 else 'park' if r < 0.75 else 'zelkova'
for p, q in parks:
    if q.area < 10 or re.search(r'pitch|Playground|Roof', p['name']): continue
    x0, z0, x1, z1 = q.bounds
    inside = int(((pts[:, 0] > x0) & (pts[:, 0] < x1) & (pts[:, 1] > z0) & (pts[:, 1] < z1)).sum())
    wood = p.get('surface') in ('trees', 'planting')
    big = q.area > 4000
    if inside > q.area / (30 if wood else 90) and not big: continue
    step = (6.5 if big else 4.2) if wood else (9.0 if 'kokyo gaien' in p['name'].lower() else 7.5)
    qp = sprep(q.buffer(-0.8)); qin = sprep(q.buffer(-4.5))
    for x in np.arange(x0, x1, step):
        for z in np.arange(z0, z1, step):
            xx, zz = x + rnd.uniform(-1.6, 1.6), z + rnd.uniform(-1.6, 1.6)
            if not qp.contains(Point(xx, zz)): continue
            if not wood and 'kokyo gaien' not in p['name'].lower() and qin.contains(Point(xx, zz)) and rnd.random() < 0.7: continue
            T.append([xx, zz, park_kind(p['name'], wood), 0]); synp += 1
print('synth park', synp)
# clean: no trees in water, in buildings, on the carriageways, in the ring box; 1 u apart
roadU = sprep(unary_union([LineString(r['points']).buffer(1.5 if r['class'] == 'major' else 1.2) for r in L['roads'] if not r.get('expressway')]))
plz = sprep(unary_union([Polygon(p['polygon']).buffer(0) for p in L['parks'] if p.get('surface') == 'gravel' and 'Kokyo' in p['name']] or [Point(1e6, 1e6)]))
lmU = sprep(unary_union([Polygon([(l['x'] + a * math.cos(l['rot']) + b * math.sin(l['rot']), l['z'] - a * math.sin(l['rot']) + b * math.cos(l['rot'])) for a, b in ((-l['w'] / 2, -l['d'] / 2), (l['w'] / 2, -l['d'] / 2), (l['w'] / 2, l['d'] / 2), (-l['w'] / 2, l['d'] / 2))]) for l in L['landmarks'] if l['kind'] not in ('district', 'bridge') and l['w'] > 0]))
out = []; seen = {}
PRI = {'sakura': 0, 'pine': 0, 'ginkgo': 1, 'park': 1, 'zelkova': 2, 'street': 3}
T.sort(key=lambda t: (-t[3], PRI[t[2]]))
for t in T:
    x, z = t[0], t[1]
    if not (MINX + 0.5 < x < MAXX - 0.5 and MINZ + 0.5 < z < MAXZ - 0.5): continue
    pt = Point(x, z)
    if ringB.contains(pt) or wet.contains(pt) or bU.contains(pt) or lmU.contains(pt): continue
    if not t[3] and (roadU.contains(pt) or plz.contains(pt)): continue
    k = (int(x // 1), int(z // 1)); ok = True
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for o in seen.get((k[0] + i, k[1] + j), ()):
                if math.hypot(o[0] - x, o[1] - z) < 1.0: ok = False
    if not ok: continue
    seen.setdefault(k, []).append(t); out.append(t)
CAP = 11000
if len(out) > CAP:
    keep = [t for t in out if t[2] != 'street' or t[3]]; rest = [t for t in out if t[2] == 'street' and not t[3]]
    rnd.shuffle(rest); out = keep[:CAP] + rest[:max(0, CAP - len(keep))]
out = [[r1(t[0]), r1(t[1]), t[2], t[3]] for t in out]
out.sort(key=lambda t: (t[2], t[1], t[0]))
c = collections.Counter(t[2] for t in out); print(len(out), c)
meta = dict(scale=SCALE, originLatLon=[LAT0, LON0], counts=dict(c), surveyed=sum(t[3] for t in out),
    note="Trees as [x, z, kind, surveyed] (surveyed 1 = an OpenStreetMap natural=tree or a tree of a mapped tree_row, 0 = synthesised). kind: sakura = cherry (Somei-yoshino: the palace moats on the Hanzomon / Chidorigafuchi side, Shiba Park and Zojo-ji, the Sumida terraces, small parks; pale pink in the level's season or plain green); ginkgo = the avenue ginkgos (Hibiya-dori, Gyoko-dori, Uchibori-dori, Sakurada-dori, Showa-dori: tall, narrow, gold in autumn); zelkova = keyaki street trees (Marunouchi Naka-dori, Chuo-dori, Harumi-dori, Aoyama-dori: vase-shaped); pine = Japanese black pines (the 2,000 pines of Kokyo Gaien on open lawn, Hama-rikyu, Kyu-Shiba-rikyu, the moat banks: low, dark, layered) and other conifers; park = camphor and mixed evergreen broadleaf (the palace woods, shrine groves, parks); street = other street trees. Avenue trees are synthesised every 16 m on both kerbs of the named avenues and every 32 m on other major streets; park trees on a jittered grid (woods 21-32 m apart, lawns round the edge) where OSM maps none. Trees closer than 1 u to another, in water, inside building or landmark footprints, on the carriageways, on the Kokyo Gaien gravel plaza or inside the ring venue box (ring.ringClearTrees in tokyo_layout.json) are left out; synthesised street / park trees are thinned at random to keep the file at about 11,000.")
json.dump(dict(meta=meta, trees=out), open(sys.argv[5], 'w'), separators=(',', ':'))
L['meta']['counts']['trees'] = len(out)
A = np.array([(t[0], t[1]) for t in out])
def within(x, z): return int((np.hypot(A[:, 0] - x, A[:, 1] - z) <= 6).sum())
sites = {'player': L['spawn']['player'], 'duel.a': L['duel']['a'], 'duel.b': L['duel']['b'], 'soldier': L['soldier'], 'ring': L['ring']}
for e in L['spawn']['enemies']: sites['enemy.' + e['label']] = e
for k, v in sites.items(): L['meta']['siteChecks'][k]['treesWithin6'] = within(v['x'], v['z'])
json.dump(L, open(sys.argv[4], 'w'), separators=(',', ':'), ensure_ascii=False)
