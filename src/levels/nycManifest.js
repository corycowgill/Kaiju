// New York City asset manifest (owner: nyc-design; read by src/levels/nyc.js).
// Seeded by nyc-integrator with empty tables; same fields as dcManifest.js.
// Set ready: true only once the file (and its <name>_lod1.glb, unless lod1:
// false) is in assets/buildings/nyc/, so missing files never 404; unready
// landmarks are built from procedural massing (nyc.js BUILDERS).
export const NYC_BASE = './assets/buildings/nyc/';

// id: the landmark id in assets/levels/nyc_layout.json (ids: several sites,
// one model). trueHeightM: the model's bbox height incl. spires; the layout
// height is the roof. face: the world direction of the model's +Z front.
// fit 'footprint' (+ maxH, stretch): fill the layout outline instead of the
// true-height uniform scale. exact (+ atOrigin): map scale, no fit.
// shiftM: metres the site moves along the model's front. stone: debris tint.
export const NYC_LANDMARK_GLBS = [
  // nyc-design, procedural Blender builds at true size (devtools/nyc/design/tools/build_*.py, tiling facade maps from
  // nyc_tex.py). All: metres, Y up, base y=0 (street grade), centred X/Z on the lot, front +Z, LOD1 twin, metal 0.
  // face: the compass word nearest the grid direction the model's +Z front looks (LK.faceRot snaps to the rotated
  // grid): north = uptown, south = downtown, east = toward the East River, west = toward the Hudson.
  { id: 'empire_state_building', file: 'empire_state_building.glb', trueHeightM: 443.0, face: 'east', stone: 0xc4beb0, ready: true }, // 60 (along Fifth) x 129.5 m lot; +Z the Fifth Ave entrance (the building is on the WEST side of Fifth, so its front looks east); tower set back toward the west end
  { id: 'chrysler_building', file: 'chrysler_building.glb', trueHeightM: 319.0, face: 'west', stone: 0xcfcdc8, ready: true }, // 61 (along 42nd) x 63 m; +Z the Lexington Ave entrance (east side of Lex)
  { id: 'rockefeller_30', file: 'rockefeller_30.glb', trueHeightM: 259.2, face: 'east', stone: 0xc6b9a0, ready: true }, // slab 29-34 m thick x 100 m (+Z the sheer narrow east face on Rockefeller Plaza, the slab runs back toward Sixth); lower wings 62 m wide to 33 m
  { id: 'one_vanderbilt', file: 'one_vanderbilt.glb', trueHeightM: 427.0, face: 'east', stone: 0xc4b8a4, ready: true }, // 61 x 65 m; +Z toward Vanderbilt Ave / Grand Central
  { id: 'metlife_building', file: 'metlife_building.glb', trueHeightM: 248.5, face: 'north', stone: 0xa6a49e, ready: true }, // base 96 x 58 m, octagon slab 90 x 46 m; +Z the north face up Park Ave
  { id: 'bank_of_america_tower', file: 'bank_of_america_tower.glb', trueHeightM: 366.0, face: 'south', stone: 0x9cabb8, ready: true }, // 79 x 85 m incl. the 22 m podium; +Z Bryant Park / 42nd St; spire at the back-right (+X, -Z) corner
  { id: 'park_432', file: 'park_avenue_432.glb', trueHeightM: 425.5, face: 'east', stone: 0xd0cec8, ready: true }, // 28.5 m square tower at model x -15.5, 30 x 26 m retail podium at +X (60 x 29 m total); +Z Park Ave (west side of Park, front looks east)
  { id: 'central_park_tower', file: 'central_park_tower.glb', trueHeightM: 472.0, face: 'south', stone: 0x98a8b8, ready: true }, // podium 58 x 52 m, shaft cantilevered toward +X (= east when +Z looks downtown); +Z 57th St (north side of 57th)
  { id: 'steinway_111w57', file: 'steinway_tower.glb', trueHeightM: 435.0, face: 'north', stone: 0xc0a080, ready: true }, // 30 x 79 m incl. Steinway Hall in front (+Z, 57th St); tower 18 x 60 m behind, feathered setbacks at the back (south)
  { id: 'one57', file: 'one57.glb', trueHeightM: 306.0, face: 'east', stone: 0x7890ac, ready: true }, // 56 x 40 m podium; roofs cascade down toward +X (= uptown when +Z looks east)
  { id: 'new_york_times_building', file: 'new_york_times_building.glb', trueHeightM: 319.0, face: 'west', stone: 0xc8c6c0, ready: true }, // tower 57 x 57 m + 20 m podium behind (58 x 87 m total); +Z Eighth Ave
];

// Generic blocks by height bucket (game units: low < 7, short 7-18,
// medium 18-40, tall > 40). Empty: nyc.js borrows Chicago's kit.
// { file, bucket, maxH?, share?, trueM?, stone?, desktopOnly?, ready }
export const NYC_GENERIC_GLBS = [
  // nyc-design kit (devtools/nyc/design/tools/build_nyc_kit.py, kit2 method): one material + one painted atlas per piece,
  // front +Z = street face, metres, base y=0, LOD1 twin. style: tenement | brownstone | prewar | limestone | whitebrick | deco |
  // glassslab | glasstower (bias picks by zone: tenements / brownstones on side streets, glass on Sixth / Park / Lex / Third, pre-war
  // and deco everywhere). trueM [w, h, d] incl. roof clutter / water tanks.
  { file: 'nyc_tenement_a.glb', bucket: 'low', style: 'tenement', trueM: [8.8, 21.2, 19.9], maxH: 5.5, stone: 0x8a4a3a, ready: true },
  { file: 'nyc_tenement_b.glb', bucket: 'low', style: 'tenement', trueM: [16.4, 29.4, 21.9], stone: 0x8a4a3a, ready: true },
  { file: 'nyc_tenement_c.glb', bucket: 'low', style: 'tenement', trueM: [8.8, 28.6, 21.9], stone: 0x8a4a3a, ready: true },
  { file: 'nyc_brownstone_a.glb', bucket: 'low', style: 'brownstone', trueM: [19.2, 15.2, 18.5], maxH: 4.5, stone: 0x6e4a3a, ready: true },
  { file: 'nyc_brownstone_b.glb', bucket: 'low', style: 'brownstone', trueM: [13.9, 18.5, 19.5], maxH: 5.0, stone: 0x6e4a3a, ready: true },
  { file: 'nyc_prewar_a.glb', bucket: 'short', style: 'prewar', trueM: [31.8, 51.5, 27.9], stone: 0x9a6a50, ready: true },
  { file: 'nyc_prewar_b.glb', bucket: 'short', style: 'prewar', trueM: [25.4, 67.5, 31.9], stone: 0x9a6a50, ready: true },
  { file: 'nyc_prewar_c.glb', bucket: 'short', style: 'prewar', trueM: [37.0, 52.5, 31.0], stone: 0x9a6a50, ready: true },
  { file: 'nyc_limestone_a.glb', bucket: 'short', style: 'limestone', trueM: [39.0, 54.2, 31.0], stone: 0xcdbfa4, ready: true },
  { file: 'nyc_limestone_b.glb', bucket: 'short', style: 'limestone', trueM: [27.2, 42.5, 24.4], stone: 0xcdbfa4, ready: true },
  { file: 'nyc_whitebrick_a.glb', bucket: 'short', style: 'whitebrick', trueM: [36, 64.8, 22.6], stone: 0xd2cec4, ready: true },
  { file: 'nyc_whitebrick_b.glb', bucket: 'short', style: 'whitebrick', trueM: [40, 74.6, 23.4], stone: 0xd2cec4, ready: true },
  { file: 'nyc_whitebrick_c.glb', bucket: 'short', style: 'whitebrick', trueM: [28, 57.0, 19.1], stone: 0xd2cec4, ready: true },
  { file: 'nyc_deco_a.glb', bucket: 'medium', style: 'deco', trueM: [40.4, 95.2, 30.4], stone: 0xb8a890, ready: true },
  { file: 'nyc_deco_b.glb', bucket: 'medium', style: 'deco', trueM: [38.4, 104, 32.4], stone: 0xb8a890, ready: true },
  { file: 'nyc_deco_d.glb', bucket: 'medium', style: 'deco', trueM: [42.4, 134.5, 32.4], stone: 0xb8a890, ready: true },
  { file: 'nyc_deco_c.glb', bucket: 'medium', style: 'deco', trueM: [46.4, 181.9, 36.4], stone: 0xb8a890, ready: true },
  { file: 'nyc_glassslab_a.glb', bucket: 'medium', style: 'glassslab', trueM: [48, 91.4, 34], stone: 0x8aa0b0, ready: true },
  { file: 'nyc_glassslab_b.glb', bucket: 'medium', style: 'glassslab', trueM: [50, 111.1, 34], stone: 0x8aa0b0, ready: true },
  { file: 'nyc_glassslab_c.glb', bucket: 'medium', style: 'glassslab', trueM: [62, 181.7, 42], stone: 0x8aa0b0, ready: true },
  { file: 'nyc_glassslab_d.glb', bucket: 'tall', style: 'glassslab', trueM: [56.6, 204.6, 30.6], stone: 0x8aa0b0, ready: true },
  { file: 'nyc_glasstower_a.glb', bucket: 'medium', style: 'glasstower', trueM: [46.3, 139.9, 36.3], stone: 0x90a8bc, ready: true },
  { file: 'nyc_glasstower_b.glb', bucket: 'medium', style: 'glasstower', trueM: [50.3, 191.4, 40.3], stone: 0x90a8bc, ready: true },
  { file: 'nyc_glasstower_c.glb', bucket: 'tall', style: 'glasstower', trueM: [54.3, 254.8, 46.3], stone: 0x90a8bc, ready: true },
  { file: 'nyc_glasstower_d.glb', bucket: 'tall', style: 'glasstower', trueM: [50.3, 272.3, 40.7], stone: 0x90a8bc, ready: true },
];

// Street props: { name, file, heightM?, ready } (front +Z, metres)
export const NYC_PROP_GLBS = [
  // nyc-design (devtools/nyc/design/tools/build_nyc_props.py, build_nyc_rocks.py), metres, origin at the base centre
  { name: 'nyc_streetlamp', file: 'nyc_streetlamp.glb', heightM: 9.2, ready: true }, // NYC octagonal pole with a cobra-head, grey-green; avenues and streets
  { name: 'nyc_traffic_signal', file: 'nyc_traffic_signal.glb', heightM: 6.5, ready: true }, // mast-arm signal, yellow heads; avenue corners
  { name: 'nyc_hydrant', file: 'nyc_hydrant.glb', heightM: 0.9, ready: true }, // kerbside
  { name: 'nyc_subway_entrance', file: 'nyc_subway_entrance.glb', heightM: 2.9, ready: true }, // green iron railings + globe lamps on posts, stair down (5.6 m long along +Z)
  { name: 'nyc_scaffold', file: 'nyc_scaffold.glb', heightM: 4.3, ready: true }, // green sidewalk shed, 12.3 m along X: kerb-side in front of facades
  { name: 'nyc_steam_stack', file: 'nyc_steam_stack.glb', heightM: 3.2, ready: true }, // orange-and-white Con Ed steam chimney in the roadway (add a steam sprite)
  { name: 'nyc_newsstand', file: 'nyc_newsstand.glb', heightM: 2.8, ready: true }, // sidewalk
  { name: 'nyc_food_cart', file: 'nyc_food_cart.glb', heightM: 2.9, ready: true }, // sidewalk corners
  { name: 'nyc_bus_shelter', file: 'nyc_bus_shelter.glb', heightM: 2.6, ready: true }, // avenues
  { name: 'nyc_trash_can', file: 'nyc_trash_can.glb', heightM: 1.0, ready: true }, // corners
  { name: 'nyc_mailbox', file: 'nyc_mailbox.glb', heightM: 1.2, ready: true }, // corners
  { name: 'nyc_bench', file: 'nyc_bench.glb', heightM: 0.9, ready: true }, // Central Park walks
  { name: 'nyc_park_lamp', file: 'nyc_park_lamp.glb', heightM: 4.2, ready: true }, // Central Park bishop-crook lamp
  { name: 'nyc_rock_umpire', file: 'nyc_rock_umpire.glb', heightM: 6.0, ready: true }, // Central Park schist outcrop (19 x 11 m)
  { name: 'nyc_rock_hump', file: 'nyc_rock_hump.glb', heightM: 2.8, ready: true }, // Central Park schist (9 x 6 m)
  { name: 'nyc_rock_ledge', file: 'nyc_rock_ledge.glb', heightM: 2.2, ready: true }, // Central Park schist (14 x 5 m)
];

// Extra traffic: { url, len, weight, parked?, albedo?, minRoadW?, ready }
export const NYC_VEHICLE_GLBS = [
  // nyc-design (devtools/nyc/design/tools/build_nyc_vehicles.py). Front +Z, wheels at y 0, metres
  { url: NYC_BASE + 'nyc_taxi.glb', len: 4.9, weight: 10, ready: true }, // yellow cab (roof sign TAXI, no logos)
  { url: NYC_BASE + 'nyc_bus.glb', len: 12.5, weight: 3, parked: false, minRoadW: 6.5, ready: true }, // MTA-style 40 ft bus, invented livery
  { url: NYC_BASE + 'nyc_box_truck.glb', len: 7.6, weight: 3, ready: true }, // white box truck
  { url: NYC_BASE + 'nyc_delivery_van.glb', len: 5.9, weight: 3, ready: true }, // delivery van
  { url: NYC_BASE + 'nyc_suv_black.glb', len: 5.7, weight: 3, ready: true }, // black livery SUV
  { url: NYC_BASE + 'nyc_police.glb', len: 5.2, weight: 1, ready: true }, // blue-and-white POLICE car (3 primitives)
];

// Kit pieces placed many times or fitted to named footprints:
// { id: { file, ready, layoutIds?, desktopOnly? } }
export const NYC_KIT_GLBS = {
  // Rooftop water tank (wooden tank on a steel stand, 4.4 m dia, 7.6 m tall): one InstancedMesh; one or two on most
  // tenement / pre-war / brownstone roofs (kit pieces nyc_tenement_*, nyc_prewar_*, nyc_limestone_* already carry their own)
  nyc_water_tank: { file: 'nyc_water_tank.glb', heightM: 7.6, ready: true },
  // Rooftop cooling tower / mechanical box cluster (8 x 4.3 x 4.5 m) for flat roofs of procedural masses and glass slabs
  nyc_rooftop_mech: { file: 'nyc_rooftop_mech.glb', heightM: 4.3, ready: true },
};

// Debris for wrecked NYC buildings (urls), used instead of the shared concrete kit when listed.
export const NYC_DEBRIS_GLBS = [
  // nyc-design (devtools/nyc/design/tools/build_nyc_debris.py): one material each, metres
  'debris_nyc_brick_wall.glb', 'debris_nyc_brick_corner.glb', 'debris_nyc_glazed_brick.glb', 'debris_nyc_limestone_block.glb',
  'debris_nyc_limestone_cornice.glb', 'debris_nyc_curtain_wall.glb', 'debris_nyc_steel_beam.glb', 'debris_nyc_concrete_slab.glb',
].map((f) => NYC_BASE + f);
