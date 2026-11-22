# far_manifest.py - writes manifest_far.js from the build stats (python3 tools/tokyo/design/far_manifest.py)
import json, os
SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/tk_far/stats'
OUT = '/home/user/Kaiju/assets/buildings/tokyo'
HERE = os.path.dirname(os.path.abspath(__file__))


def st(n):
    p = '%s/%s.json' % (SCR, n)
    if not (os.path.exists(p) and os.path.exists('%s/%s.glb' % (OUT, n)) and os.path.exists('%s/%s_lod1.glb' % (OUT, n))):
        return None
    return json.load(open(p))


PROPS = [
    ('tokyo_streetlamp', 'grey tapered pole with twin LED heads on arms along +-X (emissive undersides); set the arms across the road'),
    ('tokyo_streetlamp_ginza', "Ginza-style ornate dark-green standard, two drooping 'willow' arms along +-X with warm lanterns"),
    ('tokyo_utility_pole', 'concrete pole: two crossarms along X with insulators, grey transformer can on the +Z side, stub wire brackets, a small street-lamp arm (emissive) toward +Z'),
    ('tokyo_traffic_signal', 'horizontal three-lens signal (blue-green / yellow / red, red at the outer end) on a mast arm along +X, lenses face +Z; pole at the origin, a second head on the pole'),
    ('tokyo_pedestrian_signal', 'two-lens pedestrian head (red over blue-green, emissive) on a short pole, faces +Z'),
    ('tokyo_vending_machine', 'a pair of drink machines side by side along X (one white, one red-ish; invented), glowing fronts face +Z'),
    ('tokyo_koban', 'two-storey police box, door and lit windows face +Z, red lamp over the door (no lettering)'),
    ('tokyo_bus_stop', 'pole sign (round head, blank) at -X end beside a small roofed bench shelter, long axis X, open toward +Z'),
    ('tokyo_guard_rail', 'white pedestrian guard-pipe segment along X (posts 3 m apart at the ends: tile at 3 m)'),
    ('tokyo_torii', 'vermilion myojin torii: X across (6 m kasagi), walk through along Z; black kasagi cap and pillar feet'),
    ('tokyo_stone_lantern', 'granite kasuga lantern, warm emissive fire box'),
    ('tokyo_mailbox', 'red rectangular post box on a pedestal, slots face +Z (no lettering)'),
    ('tokyo_bicycle_rack', 'row of five parked bicycles along X on a low rail, wheels along Z'),
    ('tokyo_subway_entrance', 'stair canopy: glass sides, lit sign blank across the front (+Z), stairs descend toward -Z; base y 0 (the stair well is not cut)'),
    ('tokyo_yatai', 'festival food stall: red-and-white awning, noren along the front (+Z), red lanterns (emissive) on the eave'),
    ('tokyo_bench', 'slatted bench, seat faces +Z'),
    ('tokyo_pier_pilings', 'mooring dolphin: steel pipe piles with a concrete cap and tyre fender, base at the waterline'),
    ('tokyo_waterfront_rail', 'waterfront promenade railing segment (repeat along X every 3.1 m)'),
    ('tokyo_park_lamp', 'park globe lamp, warm emissive globe'),
    ('tokyo_billboard_roof', 'rooftop sign: steel frame legs, 8 x 5 m abstract lit panel facing +Z (emissive colour blocks, no lettering), dark back'),
]
VEH = [
    ('tokyo_kei_car', 12, '', 'tall-wagon kei car, pastel mint'),
    ('tokyo_sedan', 10, '', 'white sedan'),
    ('tokyo_minivan', 8, '', 'dark boxy people-mover'),
    ('tokyo_taxi', 10, '', "tall deep-indigo 'JPN Taxi' shape with a lit roof lamp (no lettering)"),
    ('tokyo_taxi_classic', 3, '', 'boxy sedan cab, yellow with an orange band, roof lamp'),
    ('tokyo_kei_van', 6, '', 'white kei van (cab-over box)'),
    ('tokyo_kei_truck', 6, '', 'white kei truck, drop-side bed'),
    ('tokyo_delivery_truck', 4, 'minRoadW: 5, ', '2-tonne box truck, invented green-and-cream livery'),
    ('tokyo_bus', 3, 'parked: false, minRoadW: 6.5, ', 'city bus, cream with green bands, lit windows and destination blank; doors on the +X (kerb, left-hand traffic) side'),
    ('tokyo_police', 2, 'lightBar: true, parked: false, ', 'black-and-white patrol sedan; 3 primitives: palette + lightbar_red + lightbar_blue (both lenses are RED: Japanese bar; the names feed the flasher)'),
    ('tokyo_fire_engine', 1, 'parked: false, minRoadW: 5, ', 'compact red pumper, silver shutters, roof ladder (emissive red beacons in the palette, no lightbar materials)'),
]
RAIL = 'ONE rigid unit, long axis Z, origin at the centre of the train on the rail top (y 0); leading end +Z (white head lamps), red tail lamps at -Z; lit windows'
KIT = [
    ('tokyo_yamanote_train', '5-car E235-style commuter set, silver with light-green doors and front. ' + RAIL + '. Cars 20 m; roof 3.62, AC 3.92, pantograph heads 4.9 (cars 2 and 4)'),
    ('tokyo_keihin_train', 'same body as the Yamanote set with sky-blue bands. ' + RAIL),
    ('tokyo_shinkansen', '8-car N700-style set shortened to 200 m (25 m cars, 10.5 m duck-bill noses both ends), white with a blue stripe. ' + RAIL + '. Roof 3.62, pantograph shrouds 4.6'),
    ('tokyo_monorail_train', '6-car straddle-beam monorail (15 m cars). ONE rigid unit along Z, origin at the centre; y 0 = BEAM TOP, the skirts hang to y -1.2 either side of a 1.1 m slot (beam up to 1.0 m wide); leading end +Z'),
    ('tokyo_yurikamome_train', '6-car rubber-tyred automated train (9 m cars), white with a rainbow stripe (one colour per car). ' + RAIL.replace('rail top', 'running surface')),
    ('tokyo_water_bus', 'low glass-roofed river water bus, silver-white. y 0 = waterline, bow +Z'),
    ('tokyo_yakatabune', 'traditional roofed pleasure boat, lit shoji windows, red lantern strings along both eaves. y 0 = waterline, bow +Z'),
    ('tokyo_ferry', 'island ferry / passenger ship (as berthed at Takeshiba), white with a teal-and-yellow funnel. y 0 = waterline, bow +Z'),
    ('tokyo_container_ship', 'loaded container ship, dark hull. y 0 = waterline, bow +Z'),
    ('tokyo_tug', 'harbour tug. y 0 = waterline, bow +Z'),
    ('tokyo_fishing_boat', 'small Japanese coastal fishing boat, white with blue trim. y 0 = waterline, bow +Z'),
    ('tokyo_container_crane', 'red-and-white ship-to-shore gantry crane, boom raised. Base on the quay at y 0, origin between the legs; rails along X, boom (water side) toward +Z'),
    ('expressway_pier', 'one Shuto Expressway T-pier: column to the hammerhead, top face y 14.0, hammerhead 12 m along X (ACROSS the road). Base y 0, origin at the column centre'),
    ('expressway_deck_segment', '30 m of elevated deck along Z (z -15..15, tiles every 30 m), 18 m wide. Origin on the centreline at GROUND level: girder soffit y 14.0 (sits on the pier), road surface y 15.5, noise-wall parapets to y 18.5. No piers'),
    ('rail_viaduct_segment', '30 m of the red-brick arched Yamanote viaduct along Z (z -15..15: three 10 m arch bays per side, tiles every 30 m), 22 m wide. Origin on the centreline at ground level; deck (ballast) top y 7.0, parapets y 8.0, one catenary portal to y 13.4 at z 0. Arch infill = warm lit shopfronts (emissive) on both faces'),
]

L = ['// manifest_far.js - Tokyo vehicles, trains, street props, water craft and set pieces (design-far).',
     '// Generated by tools/tokyo/design/far_manifest.py from the build stats; scripts: tools/tokyo/design/far_*.py.',
     '// All models: metres, glTF Y up, one mesh, one <name>_palette material (256 px palette atlas: base colour + metallic-roughness',
     '// + emissive for lamps / lit windows), <name>_lod1.glb twin (same primitives, no material).',
     '// bbox = exact [w (X), h (Y), d (Z)] of the LOD0; tris = LOD0 / LOD1.', '',
     '// Street props: origin at the base centre, front +Z', 'export const TOKYO_PROP_GLBS = [']
for n, d in PROPS:
    s = st(n)
    if s:
        b = s['lod0']
        L.append("  { name: '%s', file: '%s.glb', heightM: %.2f, ready: true }, // %s; bbox [%.2f, %.2f, %.2f] (x %.2f..%.2f, z %.2f..%.2f), tris %d / %d" % (
            n, n, b['bbox'][1], d, b['bbox'][0], b['bbox'][1], b['bbox'][2], b['min'][0], b['max'][0], b['min'][2], b['max'][2], b['tris'], s['lod1']['tris']))
L += ['];', '', '// Traffic: front +Z, wheels at y 0, metres. Japanese traffic keeps LEFT (the bus doors are on +X).', 'export const TOKYO_VEHICLE_GLBS = [']
for n, wgt, ex, d in VEH:
    s = st(n)
    if s:
        b = s['lod0']['bbox']
        L.append("  { url: TOKYO_BASE + '%s.glb', len: %.1f, weight: %d, %sready: true }, // %s; bbox [%.2f, %.2f, %.2f], tris %d / %d" % (n, b[2], wgt, ex, d, b[0], b[1], b[2], s['lod0']['tris'], s['lod1']['tris']))
L += ['];', '', '// Kit / set pieces placed by code (trains, water craft, the crane, expressway and viaduct pieces). TRUE size.',
      '// Water craft: y 0 = the WATERLINE (nothing below), bow +Z.', 'export const TOKYO_KIT_GLBS = {']
for n, d in KIT:
    s = st(n)
    if s:
        b = s['lod0']
        L.append("  %s: { file: '%s.glb', heightM: %.2f, ready: true }, // %s. bbox [%.2f, %.2f, %.2f] (x %.2f..%.2f, y %.2f..%.2f, z %.2f..%.2f), tris %d / %d" % (
            n, n, b['max'][1], d, b['bbox'][0], b['bbox'][1], b['bbox'][2], b['min'][0], b['max'][0], b['min'][1], b['max'][1], b['min'][2], b['max'][2], b['tris'], s['lod1']['tris']))
L += ['};', '']
open(HERE + '/manifest_far.js', 'w').write('\n'.join(L))
print('wrote manifest_far.js: %d lines' % len(L))
