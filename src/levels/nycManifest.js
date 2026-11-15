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
  { id: 'one_times_square', file: 'one_times_square.glb', trueHeightM: 118.0, face: 'north', stone: 0x3a3a40, ready: true }, // 20 x 30.6 m wedge (narrow north end at +Z); screens material 'nyc_ts_screens' = assets/textures/nyc_billboards.jpg 4x4 atlas (swap for the animated LED material by name if wanted); ball mast to 118 m
  { id: 'new_york_times_building', file: 'new_york_times_building.glb', trueHeightM: 319.0, face: 'west', stone: 0xc8c6c0, ready: true }, // tower 57 x 57 m + 20 m podium behind (58 x 87 m total); +Z Eighth Ave
  // nyc-design helpers (devtools/nyc/design/tools/build_<id>.py, build_towers2.py): same conventions
  { id: 'grand_central_terminal', file: 'grand_central_terminal.glb', trueHeightM: 46.4, face: 'south', stone: 0xc8baa0, ready: true }, // 91 x 100.7 m incl. the Park Ave viaduct terrace (deck 7.5 m) in front; +Z the 42nd St facade (Tiffany clock, three arched windows)
  { id: 'nypl', file: 'nypl.glb', trueHeightM: 39.5, face: 'east', stone: 0xd6d2c8, ready: true }, // 120 x 108 m incl. terrace and steps; +Z the Fifth Ave portico (marble)
  { id: 'st_patricks_cathedral', file: 'st_patricks_cathedral.glb', trueHeightM: 100.6, face: 'west', stone: 0xd8d4ca, ready: true }, // 50 x 123 m incl. the Lady Chapel; +Z the Fifth Ave twin-spire front
  { id: 'plaza_hotel', file: 'plaza_hotel.glb', trueHeightM: 85.5, face: 'east', stone: 0xd4d0c4, ready: true }, // 75.6 x 97 m; +Z the Fifth Ave front over Grand Army Plaza; copper mansard
  { id: 'carnegie_hall', file: 'carnegie_hall.glb', trueHeightM: 63.0, face: 'north', stone: 0x9a6448, ready: true }, // 48.6 x 65.7 m incl. the 57th St studio wing; +Z the 57th St front
  { id: 'radio_city_music_hall', file: 'radio_city_music_hall.glb', trueHeightM: 140.0, face: 'west', stone: 0xc8bca4, ready: true }, // 65 x 74 m block incl. 1270 Sixth Ave (140 m) behind; +Z Sixth Ave, the marquee corner on the 50th St side (+X = downtown)
  { id: 'un_general_assembly', file: 'un_general_assembly.glb', trueHeightM: 32.8, face: 'north', stone: 0xd6d2c8, ready: true }, // 55 x 135 m; +Z the north visitors' glass wall
  { id: 'madison_square_garden', file: 'madison_square_garden.glb', trueHeightM: 48.0, face: 'east', stone: 0xb8b2a6, ready: true }, // 126 x 187 m (drum 124 m, Chase Square pavilion toward +Z Seventh Ave, service block at the back)
  { id: 'columbus_circle', file: 'columbus_circle.glb', trueHeightM: 23.2, face: 'south', stone: 0xc8c4bc, ready: true }, // 72 m round plaza island with the Columbus column; place at the circle centre (fits inside the inner kerb)
  { id: 'un_secretariat', file: 'un_secretariat.glb', trueHeightM: 155.8, face: 'west', stone: 0xd6d2c8, ready: true }, // 88 x 29 m; +Z the First Ave glass face; white marble ends
  { id: 'hudson_yards_30', file: 'hudson_yards_30.glb', trueHeightM: 388.0, face: 'south', stone: 0x9cb0c4, ready: true }, // 120 x 164 m incl. the Shops podium; +Z downtown; Edge prow at 335 m
  { id: 'vessel', file: 'vessel.glb', trueHeightM: 47.7, face: 'south', stone: 0xa86a48, ready: true }, // 49 m across at the top, 15 m at the base
  { id: 'deutsche_bank_center', file: 'deutsche_bank_center.glb', trueHeightM: 235.0, face: 'east', stone: 0x7c96a0, ready: true }, // 129 x 146 m; +Z the curved base on the circle
  { id: 'citigroup_center', file: 'citigroup_center.glb', trueHeightM: 279.0, face: 'west', stone: 0xd0d0cc, ready: true }, // 61 x 125 m incl. St Peter's and the plaza block; +Z Lexington Ave; slanted top faces downtown
  { id: 'lever_house', file: 'lever_house.glb', trueHeightM: 94.6, face: 'east', stone: 0x7aa8a0, ready: true }, // 61.5 x 59 m (podium covers the lot, slab along the north edge); +Z Park Ave
  { id: 'seagram_building', file: 'seagram_building.glb', trueHeightM: 160.0, face: 'west', stone: 0x6a5644, shiftM: 15, ready: true }, // 60 x 90 m incl. the 30 m plaza in front (+Z Park Ave) and the back wings
  { id: 'queensboro_bridge', file: 'queensboro_bridge.glb', trueHeightM: 107.0, face: 'south', stone: 0x5e6e66, ready: true }, // 534 x 36 m, model X along the bridge (grid east), origin = the layout centre; decks 37-41 m and +7.5 m; towers 92 m, finials 107 m. Place exact (no height fit): trueHeightM is the finial top
  { id: 'hudson_yards_10', file: 'hudson_yards_10.glb', trueHeightM: 268.0, face: 'east', stone: 0x9cb0c4, ready: true }, // tier B
  { id: 'hudson_yards_35', file: 'hudson_yards_35.glb', trueHeightM: 308.0, face: 'east', stone: 0xc8c4bc, ready: true }, // tier B
  { id: 'hudson_yards_50', file: 'hudson_yards_50.glb', trueHeightM: 308.0, face: 'west', stone: 0xb8bcc0, ready: true }, // tier B
  { id: 'hudson_yards_15', file: 'hudson_yards_15.glb', trueHeightM: 279.0, face: 'east', stone: 0x9cb0c4, ready: true }, // tier B
  { id: 'the_spiral', file: 'the_spiral.glb', trueHeightM: 313.9, face: 'west', stone: 0x9cb0c4, ready: true }, // tier B; planted terraces spiral up
  { id: 'one_manhattan_west', file: 'one_manhattan_west.glb', trueHeightM: 303.0, face: 'east', stone: 0x8ca0b4, ready: true }, // tier B
  { id: 'two_manhattan_west', file: 'two_manhattan_west.glb', trueHeightM: 285.0, face: 'east', stone: 0x8ca0b4, ready: true }, // tier B
  { id: 'one_penn_plaza', file: 'one_penn_plaza.glb', trueHeightM: 229.0, face: 'east', stone: 0x4a4a4c, ready: true }, // tier B; Eighth Ave
  { id: 'park_270', file: 'park_270.glb', trueHeightM: 423.2, face: 'east', stone: 0x9cb0c4, ready: true }, // tier B; JPMorgan Chase HQ, Park Ave
  { id: 'gm_building', file: 'gm_building.glb', trueHeightM: 216.6, face: 'west', stone: 0xd0d0cc, ready: true }, // tier B; Fifth Ave / Grand Army Plaza
  { id: 'four_times_square', file: 'four_times_square.glb', trueHeightM: 351.0, face: 'west', stone: 0x9cb0c4, ready: true }, // tier B; the square side
  { id: 'worldwide_plaza', file: 'worldwide_plaza.glb', trueHeightM: 237.0, face: 'east', stone: 0x9a6a50, ready: true }, // tier B; Eighth Ave
  { id: 'hearst_tower', file: 'hearst_tower.glb', trueHeightM: 182.2, face: 'east', stone: 0xb8c4cc, ready: true }, // tier B; Eighth Ave
  { id: 'central_park_south_220', file: 'central_park_south_220.glb', trueHeightM: 290.0, face: 'north', stone: 0xd0ccc0, ready: true }, // tier B; Central Park
  { id: 'moma_53w53', file: 'moma_53w53.glb', trueHeightM: 320.1, face: 'south', stone: 0x6c7c8c, ready: true }, // tier B; 53rd St
  { id: 'bloomberg_tower', file: 'bloomberg_tower.glb', trueHeightM: 246.0, face: 'west', stone: 0x9cb0c4, ready: true }, // tier B; Lexington Ave
  { id: 'trump_tower', file: 'trump_tower.glb', trueHeightM: 205.5, face: 'west', stone: 0x4a443e, ready: true }, // 36 x 54 m (35.5 along Fifth x 52.5 along 56th); +Z Fifth Ave; sawtooth planted terraces on the Fifth Ave side
  { id: 'trump_world_tower', file: 'trump_world_tower.glb', trueHeightM: 262.0, face: 'east', stone: 0x5a5650, ready: true }, // tier B; First Ave
  { id: 'international_building', file: 'international_building.glb', trueHeightM: 156.6, face: 'east', stone: 0xc8bca4, ready: true }, // tier B; Fifth Ave (facing St Patrick's, Atlas in the forecourt)
  { id: 'helmsley_building', file: 'helmsley_building.glb', trueHeightM: 172.0, face: 'north', stone: 0xc8bca4, ready: true }, // tier B; looks up Park Ave, portals at the base
  { id: 'waldorf_astoria', file: 'waldorf_astoria.glb', trueHeightM: 190.5, face: 'west', stone: 0xc8bca4, ready: true }, // tier B; Park Ave
  { id: 'chanin_building', file: 'chanin_building.glb', trueHeightM: 197.8, face: 'north', stone: 0x9a6a50, ready: true }, // tier B
  { id: 'paramount_building', file: 'paramount_building.glb', trueHeightM: 119.0, face: 'east', stone: 0xd0ccc0, ready: true }, // tier B; Broadway / the square
  { id: 'new_yorker_hotel', file: 'new_yorker_hotel.glb', trueHeightM: 152.2, face: 'east', stone: 0xb8a080, ready: true }, // tier B; Eighth Ave; NEW YORKER sign
  { id: 'sony_building', file: 'sony_building.glb', trueHeightM: 196.0, face: 'east', stone: 0xb8a0a0, ready: true }, // tier B; Madison Ave
  { id: 'madison_383', file: 'madison_383.glb', trueHeightM: 230.0, face: 'west', stone: 0x9cb0c4, ready: true }, // tier B; Madison Ave
  { id: 'park_425', file: 'park_425.glb', trueHeightM: 262.0, face: 'west', stone: 0x9cb0c4, ready: true }, // tier B; Park Ave
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
  { url: NYC_BASE + 'nyc_taxi.glb', len: 4.9, weight: 30, ready: true }, // yellow cab (roof sign TAXI, no logos)
  { url: NYC_BASE + 'nyc_bus.glb', len: 12.5, weight: 3, parked: false, minRoadW: 6.5, ready: true }, // MTA-style 40 ft bus, invented livery
  { url: NYC_BASE + 'nyc_box_truck.glb', len: 7.6, weight: 3, ready: true }, // white box truck
  { url: NYC_BASE + 'nyc_delivery_van.glb', len: 5.9, weight: 3, ready: true }, // delivery van
  { url: NYC_BASE + 'nyc_suv_black.glb', len: 5.7, weight: 3, ready: true }, // black livery SUV
  { url: NYC_BASE + 'nyc_police.glb', len: 5.05, weight: 4, lightBar: true, parked: false, ready: true }, // blue-and-white POLICE car (3 primitives)
];

// Kit pieces placed many times or fitted to named footprints:
// { id: { file, ready, layoutIds?, desktopOnly? } }
export const NYC_KIT_GLBS = {
  // Rooftop water tank (wooden tank on a steel stand, 4.4 m dia, 7.6 m tall): one InstancedMesh; one or two on most
  // tenement / pre-war / brownstone roofs (kit pieces nyc_tenement_*, nyc_prewar_*, nyc_limestone_* already carry their own)
  nyc_water_tank: { file: 'nyc_water_tank.glb', heightM: 7.6, ready: true },
  // Rooftop cooling tower / mechanical box cluster (8 x 4.3 x 4.5 m) for flat roofs of procedural masses and glass slabs
  nyc_rooftop_mech: { file: 'nyc_rooftop_mech.glb', heightM: 4.3, ready: true },
  // USS Maine Monument at Merchants' Gate (the park corner of Columbus Circle, north-east of the circle): 26 x 21 m,
  // pylon to 22.3 m, +Z the fountain side facing the circle (true size, place exact)
  maine_monument: { file: 'maine_monument.glb', heightM: 22.3, ready: true },
};

// Debris for wrecked NYC buildings (urls), used instead of the shared concrete kit when listed.
export const NYC_DEBRIS_GLBS = [
  // nyc-design (devtools/nyc/design/tools/build_nyc_debris.py): one material each, metres
  'debris_nyc_brick_wall.glb', 'debris_nyc_brick_corner.glb', 'debris_nyc_glazed_brick.glb', 'debris_nyc_limestone_block.glb',
  'debris_nyc_limestone_cornice.glb', 'debris_nyc_curtain_wall.glb', 'debris_nyc_steel_beam.glb', 'debris_nyc_concrete_slab.glb',
].map((f) => NYC_BASE + f);
