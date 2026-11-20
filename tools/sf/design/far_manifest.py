# far_manifest.py - writes manifest_far.js from the build stats (python3 tools/sf/design/far_manifest.py)
import json, os
SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/design_far/stats'
OUT = '/home/user/Kaiju/assets/buildings/sf'
HERE = os.path.dirname(os.path.abspath(__file__))


def st(n):
    p = '%s/%s.json' % (SCR, n)
    if not (os.path.exists(p) and os.path.exists('%s/%s.glb' % (OUT, n)) and os.path.exists('%s/%s_lod1.glb' % (OUT, n))):
        return None
    return json.load(open(p))


PROPS = [
    ('sf_streetlamp', "Market Street 'Path of Gold' three-globe cast-iron standard, emissive globes"),
    ('sf_streetlamp_cobra', 'plain grey cobra-head on a tapered pole, arm over the road (+Z)'),
    ('sf_traffic_signal', 'mast arm along +X with yellow signal heads'),
    ('sf_hydrant', 'white-bodied hydrant with a coloured cap'),
    ('sf_bus_shelter', 'wavy-red-roof transit shelter, long axis X, open front +Z'),
    ('sf_trash_can', 'dark green round can'),
    ('sf_newspaper_box', 'pedestal newsrack row'),
    ('sf_bench', 'slatted bench, seat faces +Z'),
    ('sf_cable_car_stop_sign', 'brown-and-white cable car stop pole sign, pictogram only, faces +Z'),
    ('sf_parking_meter', 'single-head parking meter'),
    ('sf_pier_pilings', 'timber dolphin cluster, base at the waterline'),
    ('sf_waterfront_rail', 'Embarcadero railing segment (repeat along X)'),
    ('sf_bollard_chain', 'two bollards and a chain along X'),
    ('sf_crab_stand', "Fisherman's Wharf sidewalk crab pot stand with awning, counter faces +Z"),
    ('sf_sea_lion_float', 'timber float with sea lions; y 0 = waterline'),
]
VEH = [
    ('sf_sedan', 12, '', 'light grey sedan'),
    ('sf_hatch_ev', 10, '', 'white compact EV hatchback'),
    ('sf_suv', 10, '', 'dark blue SUV'),
    ('sf_taxi', 5, '', 'yellow taxi sedan with roof light (no lettering)'),
    ('sf_delivery_van', 4, '', 'white high-roof delivery van'),
    ('sf_box_truck', 3, '', 'white box truck with a teal band (invented livery)'),
    ('sf_bus', 3, 'parked: false, minRoadW: 6.5, ', '12.2 m trolleybus, white / grey with a red band, twin poles (roof 3.24 m, pole tips 3.9 m)'),
    ('sf_police', 3, 'lightBar: true, parked: false, ', 'black-and-white police SUV; 3 primitives: palette + lightbar_red + lightbar_blue (no lettering)'),
    ('sf_fire_engine', 1, 'parked: false, ', 'red pumper with white cab roof (emissive red beacons in the palette, no lightbar materials)'),
]
KIT = [
    ('sf_cable_car', 'Powell-style single-ended cable car: open front section, closed rear saloon, clerestory roof. Front +Z, wheels y 0, origin centre of the car on the rail top'),
    ('sf_cable_car_california', 'California Street double-ended cable car (open both ends). Either end leads; wheels y 0'),
    ('sf_streetcar', 'F-line PCC streetcar, cream / green wings livery. Front +Z, wheels y 0; roof 3.13 m, raised trolley pole tip 4.37 m (trails to -Z); doors on -X (kerb) side'),
    ('sf_streetcar_orange', 'Milan-style Peter Witt tram, orange. Front +Z, wheels y 0; roof 3.2 m, pole tip 4.37 m; doors on -X side'),
    ('sf_ferry', 'modern Bay catamaran ferry, white with blue-and-gold band. y 0 = waterline, bow +Z'),
    ('sf_ferry_classic', '1920s double-ended white bay ferryboat, twin pilot houses, single stack. y 0 = waterline, either end +Z'),
    ('sf_container_ship', 'loaded container ship, dark hull. y 0 = waterline, bow +Z'),
    ('sf_sailboat', '11 m sloop under sail, white hull. y 0 = waterline, bow +Z'),
    ('sf_tug', 'harbour tug. y 0 = waterline, bow +Z'),
    ('sf_fishing_boat', 'Monterey-clipper style wharf fishing boat, white with green trim. y 0 = waterline, bow +Z'),
    ('sf_container_crane', 'white ship-to-shore crane, boom raised. Base on the quay at y 0, origin between the legs; boom (water side) toward +Z'),
    ('bay_bridge_tower', 'ONE suspension tower of the western span. y 0 = waterline, origin at the tower centre; X = ACROSS the bridge (legs at x +-11), Z = along it. No deck / cables. Deck opening y 56-75 between the legs; cable saddles at (x +-11, y 156.6)'),
    ('bay_bridge_anchorage', 'centre anchorage (W4). y 0 = waterline, origin at the centre; Z = along the bridge (64 m), X across (34 m at the waterline). Clear portal for the decks: x +-10.6, y 56 to 69.5 (arched to 75.5)'),
    ('bay_bridge_deck_segment', '60 m of double-deck truss, Z along the bridge (z -30..30, tiles every 60 m). Origin on the centreline at WATER level: upper road y 67, lower road y 58, geometry spans y 56.1..77.1 (light poles). No piers'),
    ('golden_gate_bridge', 'whole bridge, X along it: x -1423 (San Francisco / south end, with the Fort Point arch) .. +1314 (Marin). Origin at mid-span at water level; towers at x +-640 (227 m), pylons at x +-983 and -1080; deck y 67; Z across (deck +-13.7; south tower fender ring reaches z +-47). Approach-viaduct bents stop on an implied rising ground line (y 8..58 south, 12..58 north): put land under the ends'),
    ('alcatraz', 'Alcatraz Island. y 0 = waterline, origin at the island centre, long axis X: -X = the real NORTH-WEST end (industries buildings), +X = south-east (lighthouse, parade ground); +Z = the dock / barracks side (real north-east, facing the city ferry route). Rotate about Y to the real NW-SE bearing'),
    ('sutro_tower', 'three-legged red-and-white TV tower. Base y 0, origin at the centre of the leg triangle (legs at 90 / 210 / 330 deg, radius 26.5 m; one leg toward +Z)'),
    ('yerba_buena_island', 'wooded island hill with the Bay Bridge tunnel portal on the west face (-X). y 0 = waterline, origin at the centre, long axis X'),
]

L = ['// manifest_far.js - San Francisco vehicles, street props, water craft and far set pieces (design-far).',
     '// Generated by tools/sf/design/far_manifest.py from the build stats; scripts: tools/sf/design/far_*.py.',
     '// All models: metres, glTF Y up, one mesh, one <name>_palette material (256 px palette atlas), <name>_lod1.glb twin.',
     '// bbox = exact [w (X), h (Y), d (Z)] of the LOD0; tris = LOD0 / LOD1.', '',
     '// Street props: origin at the base centre, front +Z', 'export const SF_PROP_GLBS = [']
for n, d in PROPS:
    s = st(n)
    if s:
        b = s['lod0']['bbox']
        L.append("  { name: '%s', file: '%s.glb', heightM: %.2f, ready: true }, // %s; bbox [%.2f, %.2f, %.2f], tris %d / %d" % (n, n, b[1], d, b[0], b[1], b[2], s['lod0']['tris'], s['lod1']['tris']))
L += ['];', '', '// Traffic: front +Z, wheels at y 0, metres (cable cars and streetcars are under kit)', 'export const SF_VEHICLE_GLBS = [']
for n, wgt, ex, d in VEH:
    s = st(n)
    if s:
        b = s['lod0']['bbox']
        L.append("  { url: SF_BASE + '%s.glb', len: %.1f, weight: %d, %sready: true }, // %s; bbox [%.2f, %.2f, %.2f], tris %d / %d" % (n, b[2], wgt, ex, d, b[0], b[1], b[2], s['lod0']['tris'], s['lod1']['tris']))
L += ['];', '', '// Kit / set pieces placed by code. Water craft: y 0 = the WATERLINE (nothing below), bow +Z. Set pieces are TRUE size.', 'export const SF_KIT_GLBS = {']
for n, d in KIT:
    s = st(n)
    if s:
        b = s['lod0']
        L.append("  %s: { file: '%s.glb', heightM: %.2f, ready: true }, // %s. bbox [%.2f, %.2f, %.2f] (x %.2f..%.2f, y %.2f..%.2f, z %.2f..%.2f), tris %d / %d" % (
            n, n, b['max'][1], d, b['bbox'][0], b['bbox'][1], b['bbox'][2], b['min'][0], b['max'][0], b['min'][1], b['max'][1], b['min'][2], b['max'][2], b['tris'], s['lod1']['tris']))
L += ['};', '']
open(HERE + '/manifest_far.js', 'w').write('\n'.join(L))
print('wrote manifest_far.js')
