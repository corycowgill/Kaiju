"""Validate the SF level files. Usage: python3 validate.py <assets/levels dir> <SPEC.md>"""
import sys, json, math, re, collections, os
D = sys.argv[1]
L = json.load(open(D + '/sf_layout.json')); DET = json.load(open(D + '/sf_detail.json')); SUR = json.load(open(D + '/sf_surround.json')); TR = json.load(open(D + '/sf_trees.json'))
fails = []; warns = []
def fail(m): fails.append(m); print('FAIL', m)
def warn(m): warns.append(m); print('warn', m)
def inp(x, z, p):
    c = False; n = len(p)
    for i in range(n):
        a = p[i]; b = p[(i + 1) % n]
        if (a[1] > z) != (b[1] > z) and x < a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]): c = not c
    return c
B = L['bounds']
def inB(x, z, m=0): return B['minX'] - m <= x <= B['maxX'] + m and B['minZ'] - m <= z <= B['maxZ'] + m
def wet(x, z): return any(inp(x, z, w['polygon']) and not any(inp(x, z, h) for h in w.get('holes', [])) for w in L['water'])
piers = [p['polygon'] for p in L['parks'] if p.get('surface') == 'pier']
# 1. numbers finite, 1 decimal for coordinates
bad = [0]
def walk(o, path=''):
    if isinstance(o, float):
        if not math.isfinite(o): fail('non-finite at ' + path)
    elif isinstance(o, list):
        if len(o) == 2 and all(isinstance(v, (int, float)) for v in o) and not path.endswith(('latLon', 'originLatLon', 'frontDir', 'facing', 'dirXZ')):
            for v in o:
                if abs(v * 10 - round(v * 10)) > 1e-6: bad[0] += 1
        for i, v in enumerate(o): walk(v, path)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in ('x', 'z', 'cx', 'cz', 'w', 'd') and isinstance(v, float) and abs(v * 10 - round(v * 10)) > 1e-6: bad[0] += 1
            walk(v, path + '/' + k)
for name, o in (('layout', L), ('detail', DET), ('surround', SUR), ('trees', TR)):
    bad[0] = 0; walk(o, name)
    if bad[0]: fail('%s: %d coordinates not at 1 decimal' % (name, bad[0]))
# 2. buildings
ids = set(); nwet = 0; ncw = 0
for b in L['buildings']:
    if b['id'] in ids: fail('duplicate building id ' + b['id'])
    ids.add(b['id'])
    if not inB(b['cx'], b['cz']): fail('building %s centre outside bounds' % b['id'])
    fp = b['footprint']
    if len(fp) < 3: fail('building %s footprint < 3' % b['id'])
    a = sum(fp[i][0] * fp[(i + 1) % len(fp)][1] - fp[(i + 1) % len(fp)][0] * fp[i][1] for i in range(len(fp)))
    if a >= 0: ncw += 1
    if fp[0] == fp[-1]: fail('building %s ring closed' % b['id'])
    if wet(b['cx'], b['cz']) and not b.get('onPier'):
        nwet += 1; print('   wet building', b['id'], b['cx'], b['cz'], b.get('name'))
    if not b.get('landmark') and b.get('style') not in ('victorian', 'brick', 'warehouse', 'lowrise', 'midrise', 'apartment', 'glassslab', 'glasstower'): fail('building %s style %s' % (b['id'], b.get('style')))
    if not (b['w'] > 0.5 and b['d'] > 0.5 and b['height'] > 0.5): fail('building %s degenerate %s %s %s' % (b['id'], b['w'], b['d'], b['height']))
if nwet: fail('%d buildings in water without onPier' % nwet)
if ncw: fail('%d footprints not CCW' % ncw)
# 3. landmarks
spec = open(sys.argv[2]).read()
want = set()
for m in re.finditer(r'^\| ([a-z0-9_]+) \|', spec, re.M): want.add(m.group(1))
for grp in ('id', 'embarcadero_center', 'infinity_towers', 'embarcadero_pier_shed', 'war_memorial'): want.discard(grp)
want |= {'embarcadero_center_%d' % i for i in range(1, 5)} | {'infinity_tower_1', 'infinity_tower_2', 'war_memorial_opera_house', 'war_memorial_veterans_building'}
want |= {'pier_%d' % n for n in (1, 3, 5, 9, 17, 19, 23, 29, 31, 33, 35, 26, 28, 38, 40)}
have = {l['id'] for l in L['landmarks']}; dropped = {d['id'] for d in L['meta'].get('droppedLandmarks', [])}
for w in sorted(want - have - dropped): fail('SPEC landmark missing: ' + w)
print('landmarks dropped (listed):', sorted(dropped))
print('landmark ids not in SPEC:', sorted(have - want - {l['id'] for l in L['landmarks'] if l['kind'] == 'district'}))
def rect(l):
    c, s = math.cos(l['rot']), math.sin(l['rot']); hw, hd = l['w'] / 2, l['d'] / 2
    return [(l['x'] + a * c + b * s, l['z'] - a * s + b * c) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
real = [l for l in L['landmarks'] if l['kind'] != 'district']
for l in real:
    if not inB(l['x'], l['z']): fail('landmark %s outside bounds' % l['id'])
    if wet(l['x'], l['z']) and not (l.get('onPier') or l.get('onWater')): fail('landmark %s in water' % l['id'])
    for k in ('id', 'name', 'x', 'z', 'rot', 'w', 'd', 'height', 'heightMetres', 'eaveHeight', 'eaveMetres', 'tier', 'kind', 'front', 'frontBearing', 'frontDir', 'grid', 'desc', 'latLon'):
        if k not in l: fail('landmark %s lacks %s' % (l['id'], k))
    if l.get('footprintId') and l['footprintId'] not in ids: fail('landmark %s footprintId unknown' % l['id'])
for i, a in enumerate(real):
    ra = rect(a)
    for b in real[i + 1:]:
        if math.hypot(a['x'] - b['x'], a['z'] - b['z']) > (a['w'] + a['d'] + b['w'] + b['d']) / 2: continue
        if inp(a['x'], a['z'], rect(b)) or inp(b['x'], b['z'], ra):
            small = min(a['w'] * a['d'], b['w'] * b['d'])
            (warn if small < 30 or {a['kind'], b['kind']} & {'prop'} else fail)('landmark boxes overlap grossly: %s / %s' % (a['id'], b['id']))
# 4. sites
sp = L['spawn']['player']
if not inB(sp['x'], sp['z']): fail('player spawn outside')
if not wet(sp['x'], sp['z']): fail('player spawn not in water')
for dx in range(-40, 41, 5):
    for dz in range(-40, 41, 5):
        if math.hypot(dx, dz) <= 40 and not wet(sp['x'] + dx, sp['z'] + dz): fail('player spawn: not 40 u of open water at %d,%d' % (dx, dz)); break
bb = [(b['cx'], b['cz'], max(b['w'], b['d'])) for b in L['buildings']]
if any(math.hypot(x - sp['x'], z - sp['z']) < 40 + r / 2 for x, z, r in bb): fail('player spawn within 40 u of a building')
a, b = L['duel']['a'], L['duel']['b']
for n, p in (('duel.a', a), ('duel.b', b), ('soldier', L['soldier']), ('ring', L['ring'])):
    if not inB(p['x'], p['z']) or wet(p['x'], p['z']): fail(n + ' wet or outside')
if math.hypot(a['x'] - b['x'], a['z'] - b['z']) <= 245: fail('duel pair too close')
fps = [(bd, bd['footprint']) for bd in L['buildings']]
def bdist(x, z):
    best = 1e9
    for bd, fp in fps:
        if abs(bd['cx'] - x) > 60 or abs(bd['cz'] - z) > 60: continue
        if inp(x, z, fp): return 0.0
        for i in range(len(fp)):
            (x1, z1), (x2, z2) = fp[i], fp[(i + 1) % len(fp)]
            dx, dz = x2 - x1, z2 - z1; t = max(0, min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz + 1e-12)))
            best = min(best, math.hypot(x1 + t * dx - x, z1 + t * dz - z))
    return best
for n, p in (('duel.a', a), ('duel.b', b)):
    d = bdist(p['x'], p['z']); print('  %s clear of buildings %.1f u' % (n, d))
    if d < 9: fail(n + ' within 9 u of a building')
R = L['ring']
for dx, dz in ((-45, -45), (45, -45), (45, 45), (-45, 45), (0, 0)):
    if wet(R['x'] + dx, R['z'] + dz): fail('ring mat wet')
v = R['venueBox']
for x in range(int(v[0]), int(v[2]) + 1, 4):
    for z in range(int(v[1]), int(v[3]) + 1, 4):
        if wet(x, z): fail('ring venue box wet at %d,%d' % (x, z)); break
for l in L['landmarks']:
    if abs(l['x'] - R['x']) <= 46 and abs(l['z'] - R['z']) <= 46: fail('landmark %s under the ring' % l['id'])
if not all(inB(x, z) for x, z in ((v[0], v[1]), (v[2], v[3]))): fail('ring venue box leaves the bounds')
for e in L['spawn']['enemies']:
    if not inB(e['x'], e['z'], 40): fail('enemy spawn %s far outside' % e['label'])
if len(L['spawn']['enemies']) != 7: fail('enemy spawns != 7')
if len(L['approaches']) != 8: fail('approaches != 8')
# 5. road graph
G = L['roadGraph']; par = list(range(len(G['nodes'])))
def find(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
rid = {r['id'] for r in L['roads']}
for e in G['edges']:
    par[find(e['a'])] = find(e['b'])
    if e['road'] not in rid: fail('graph edge road id unknown')
    if e['points'][0] != G['nodes'][e['a']] or e['points'][-1] != G['nodes'][e['b']]: fail('graph edge ends do not match its nodes')
comp = sorted(collections.Counter(find(i) for i in range(len(par))).values(), reverse=True)
print('road graph components:', comp[:10], 'of', len(par), 'nodes;', 'major-only:', end=' ')
par = list(range(len(G['nodes'])))
used = set()
for e in G['edges']:
    if e['class'] != 'minor': par[find(e['a'])] = find(e['b']); used |= {e['a'], e['b']}
print(sorted(collections.Counter(find(i) for i in used).values(), reverse=True)[:10])
if comp[0] < 0.9 * len(G['nodes']): fail('road graph poorly connected')
for r in L['roads']:
    if any(not inB(p[0], p[1], 0.05) for p in r['points']): fail('road %s leaves the bounds' % r['id']); break
if not any(r.get('crooked') for r in L['roads']): fail('no crooked Lombard block')
# 6. counts
C = L['meta']['counts']
chk = dict(roads=len(L['roads']), roadGraphNodes=len(G['nodes']), roadGraphEdges=len(G['edges']), water=len(L['water']), parks=len(L['parks']), paths=len(L['paths']), bridges=len(L['bridges']), buildings=len(L['buildings']),
           mergedBuildings=sum(1 for b in L['buildings'] if b.get('merged')), onPier=sum(1 for b in L['buildings'] if b.get('onPier')), phoneSkip=sum(1 for b in L['buildings'] if b.get('phoneSkip')),
           landmarks=len(L['landmarks']), trees=len(TR['trees']), enemySpawns=len(L['spawn']['enemies']), approaches=len(L['approaches']))
for k, vv in chk.items():
    if C.get(k) != vv: fail('meta.counts.%s = %s, actual %s' % (k, C.get(k), vv))
if 'monorail' in L: fail('monorail key present')
# 7. trees / detail / surround
for t in TR['trees']:
    if not inB(t[0], t[1]) or t[2] not in ('palm', 'plane', 'street', 'evergreen', 'park'): fail('bad tree %s' % t); break
tw = sum(1 for t in TR['trees'] if wet(t[0], t[1]) and not any(inp(t[0], t[1], q) for q in piers))
if tw: warn('%d trees in water' % tw)
for k in ('rail', 'streetcar', 'cableCar', 'ferries', 'piers', 'seawall', 'bayBridge', 'containerShip', 'alcatraz', 'goldenGateBridge', 'sutroTower'):
    if k not in DET: fail('detail lacks ' + k)
for f in DET['ferries']:
    if 'Ferry' not in f['name']: fail('ferry name without Ferry: ' + f['name'])
    if not inB(*f['points'][0]): fail('ferry does not start in the box: ' + f['name'])
for c in DET['cableCar'] + DET['streetcar']:
    if any(not inB(p[0], p[1], 0.05) for p in c['points']): fail('line leaves the box: ' + c['name'])
    seg = [math.dist(c['points'][i], c['points'][i + 1]) for i in range(len(c['points']) - 1)]
    if max(seg) > 0.75 * sum(seg) and len(seg) > 3: warn('line %s has one huge segment' % c['name'])
if len(DET['bayBridge']['towers']) != 4: fail('bay bridge towers != 4')
for k in ('boxes', 'water', 'islands', 'horizon', 'masts', 'cranes', 'named'):
    if k not in SUR: fail('surround lacks ' + k)
nin = sum(1 for b in SUR['boxes'] if inB(b[0], b[1]))
if nin: fail('%d surround boxes inside the play box' % nin)
for isl in SUR['islands']:
    w0 = SUR['water'][0]
    if inp(isl['x'], isl['z'], w0['polygon']) and not any(inp(isl['x'], isl['z'], h) for h in w0['holes']): fail('island %s is covered by surround water' % isl['name'])
print('sizes KB:', {f: os.path.getsize(D + '/' + f) // 1024 for f in ('sf_layout.json', 'sf_detail.json', 'sf_surround.json', 'sf_trees.json')})
print('counts:', C)
print('RESULT:', 'PASS' if not fails else 'FAIL (%d)' % len(fails), '| warnings', len(warns))
sys.exit(1 if fails else 0)
