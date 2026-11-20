#!/usr/bin/env python3
"""Bring Alcatraz and the Golden Gate Bridge into play (run after the cartographer's run_all.sh; safe to re-run).

The cartographer's layout is true to the map: Alcatraz lies 1.7 km north of the downtown box and the Golden Gate
Bridge 6.5 km west of it, so neither could be reached. This step extends the play box north over the Bay and adds
both as layout landmarks the kaiju can wade out to and wreck:
  - the play box's north edge moves from the Fisherman's Wharf pier heads out to z = NORTH (open Bay);
  - the Golden Gate Bridge (true size, true north-south run) is moved in from the west: it springs from the
    Aquatic Park shore at the box's north-west corner and crosses to a Marin shore just past the new north edge;
  - Alcatraz (true size and heading) stands in the Bay off Fisherman's Wharf, moved about 1 km east of its true
    spot so it clears the bridge.
The surround gets the Marin shore (land past the north edge) and the level's hills module raises the headland on it.
usage: python3 tools/sf/extend_bay.py
"""
import json, math, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'levels')
NORTH = -880.0
GG = dict(x=-340.0, zSouth=-325.0, lengthM=2737.0, widthM=94.0, heightM=227.0)
ALC = dict(x=-95.0, z=-715.0, lengthM=510.0, widthM=180.0, heightM=41.0)
MARIN = [[-560.0, -1180.0], [-560.0, -940.0], [-470.0, -872.0], [-400.0, -866.0], [-290.0, -866.0], [-230.0, -880.0], [-150.0, -930.0], [-120.0, -1010.0], [-120.0, -1180.0]]

def load(n):
    with open(os.path.join(ROOT, n)) as f: return json.load(f)
def save(n, d):
    with open(os.path.join(ROOT, n), 'w') as f: json.dump(d, f, separators=(',', ':'))

L, D, S = load('sf_layout.json'), load('sf_detail.json'), load('sf_surround.json')
B = L['bounds']
if 'cityMinZ' not in L['meta']: L['meta']['cityMinZ'] = B['minZ']
city_n = L['meta']['cityMinZ']
B['minZ'] = NORTH
L['meta']['bayExtension'] = ('The play box runs north of the city (z < %.1f) over open Bay to z = %.1f so Alcatraz and the Golden Gate Bridge are in play. '
    'Both are at true size; the bridge is moved in from 6.5 km west (it springs from the Aquatic Park shore at the north-west corner), Alcatraz about 1 km east of its true spot. tools/sf/extend_bay.py' % (city_n, NORTH))
# the Bay over the extension (a 2 u overlap with the city's own bay polygons, which end at the old edge)
L['water'] = [w for w in L['water'] if w.get('id') != 'water_bay_north']
L['water'].append({'id': 'water_bay_north', 'kind': 'bay', 'name': 'San Francisco Bay', 'polygon': [[B['minX'], NORTH], [B['minX'], city_n + 2], [B['maxX'], city_n + 2], [B['maxX'], NORTH]], 'holes': []})
u = 0.2
ggz = GG['zSouth'] - GG['lengthM'] * u / 2
lms = [l for l in L['landmarks'] if l['id'] not in ('golden_gate_bridge', 'alcatraz')]
lms.append({'id': 'golden_gate_bridge', 'name': 'Golden Gate Bridge', 'x': GG['x'], 'z': round(ggz, 1), 'rot': round(math.pi / 2, 4),
    'w': round(GG['lengthM'] * u, 1), 'd': round(GG['widthM'] * u, 1), 'height': round(GG['heightM'] * u, 1), 'heightMetres': GG['heightM'],
    'eaveHeight': 13.4, 'eaveMetres': 67.0, 'tier': 'A', 'kind': 'bridge', 'front': 'E', 'frontBearing': 90, 'grid': 'waterfront', 'onWater': True, 'hp': 900, 'moved': True,
    'desc': 'The 1937 suspension bridge in International Orange: two 227 m Art Deco towers with stepped portal struts, a 1,280 m main span between them, the deck 67 m over the water, main cables in a long catenary and close-set suspender ropes, the steel arch over Fort Point at the south end. Moved in from the west so it is in play: it runs north from the Aquatic Park shore to Marin.'})
lms.append({'id': 'alcatraz', 'name': 'Alcatraz Island', 'x': ALC['x'], 'z': ALC['z'], 'rot': D.get('alcatraz', {}).get('rot', -0.575),
    'w': round(ALC['lengthM'] * u, 1), 'd': round(ALC['widthM'] * u, 1), 'height': round(ALC['heightM'] * u, 1), 'heightMetres': ALC['heightM'],
    'eaveHeight': 6.0, 'eaveMetres': 30.0, 'tier': 'A', 'kind': 'building', 'front': 'E', 'frontBearing': 90, 'grid': 'waterfront', 'onWater': True, 'hp': 700, 'moved': True,
    'desc': 'The Rock: a 510 m tan sandstone island with cliffs, the long pale cellhouse on its crown, the lighthouse, the water tower, the ruined warden\'s house, the dock and guard tower on the east side and the industries building at the north-west end. Stands in the Bay off Fisherman\'s Wharf (about 1 km east of its true spot).'})
L['landmarks'] = lms
L['minimap']['icons'] = [i for i in L['minimap'].get('icons', []) if i['id'] not in ('golden_gate_bridge', 'alcatraz')] + [
    {'id': 'golden_gate_bridge', 'x': GG['x'], 'z': round(ggz, 1)}, {'id': 'alcatraz', 'x': ALC['x'], 'z': ALC['z']}]
L['minimap']['labels'] = [l for l in L['minimap'].get('labels', []) if l['text'] not in ('GOLDEN GATE', 'ALCATRAZ')] + [
    {'text': 'GOLDEN GATE', 'x': GG['x'] + 70, 'z': round(ggz, 1)}, {'text': 'ALCATRAZ', 'x': ALC['x'], 'z': ALC['z'] - 40}]
sp = [e for e in L['spawn']['enemies'] if e.get('label') != 'bay_golden_gate']
sp.append({'x': -200.0, 'z': NORTH + 12, 'label': 'bay_golden_gate', 'note': 'from the open Bay north of Alcatraz, in through the Golden Gate'})
L['spawn']['enemies'] = sp
L['meta'].setdefault('counts', {})['landmarks'] = len(lms); L['meta']['counts']['enemySpawns'] = len(sp)
# detail: the in-play positions (the true ones stay under trueXZ)
for key, x, z in (('alcatraz', ALC['x'], ALC['z']), ('goldenGateBridge', GG['x'], round(ggz, 1))):
    d = D.setdefault(key, {})
    if 'trueXZ' not in d: d['trueXZ'] = [d.get('x'), d.get('z')]
    d['x'], d['z'], d['inPlay'] = x, z, True
# surround: the Marin shore past the north edge (land: a hole in the Bay, an island entry the level draws and the hills stand on)
S['islands'] = [i for i in S.get('islands', []) if i['name'] != 'Marin shore'] + [{'name': 'Marin shore', 'polygon': MARIN, 'heightMetres': 220, 'x': -340.0, 'z': -1010.0, 'note': 'the headland the in-play Golden Gate Bridge lands on (moved in with it)'}]
bay = max(S['water'], key=lambda w: len(w['polygon']))
bay['holes'] = [h for h in bay.get('holes', []) if h != MARIN] + [MARIN]
save('sf_layout.json', L); save('sf_detail.json', D); save('sf_surround.json', S)
print('bounds', B, '| golden_gate_bridge at', GG['x'], round(ggz, 1), '| alcatraz at', ALC['x'], ALC['z'], '| landmarks', len(lms))
