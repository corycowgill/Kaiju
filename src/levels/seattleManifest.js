// Seattle asset manifest (owner: seattle-design; read by src/levels/seattle.js).
// Seeded by seattle-integrator with empty tables; same fields as nycManifest.js.
// Set ready: true only once the file (and its <name>_lod1.glb, unless lod1:
// false) is in assets/buildings/seattle/, so missing files never 404; unready
// landmarks are built from procedural massing (seattle.js BUILDERS).
export const SEATTLE_BASE = './assets/buildings/seattle/';

// id: the landmark id in assets/levels/seattle_layout.json (ids: several sites,
// one model). trueHeightM: the model's bbox height incl. spires; the layout
// height is the roof. face: the world direction of the model's +Z front.
// fit 'footprint' (+ maxH, stretch): fill the layout outline instead of the
// true-height uniform scale. exact (+ atOrigin): map scale, no fit.
// shiftM: metres the site moves along the model's front. offsetM: [east, south] metres in map directions
// (added to the site, combines with shiftM). y0: metres the base sits above grade (negative: below).
// stone: debris tint.
export const SEATTLE_LANDMARK_GLBS = [
  // seattle-design, procedural Blender builds at true size (devtools/seattle/design/tools/build_space_needle.py,
  // build_sea_towers.py, build_sea_low.py, build_sea_venues.py, build_sea_center.py, build_great_wheel.py; tiling facade
  // maps from sea_tex.py). All: metres, Y up, base y=0, centred X/Z on the lot, front +Z, LOD1 twin, metal 0 on facades.
  // face: the compass word nearest the direction the model's +Z front should look (LK.faceRot snaps it to the lot's grid).
  { id: 'space_needle', file: 'space_needle.glb', trueHeightM: 184.7, face: 'south', stone: 0xd4d2cc, ready: true }, // 52 x 52 m incl. the curved glass Pavilion (front side); legs splay 36 m, waist 4.6 m at 110 m, top house 46 m across at 146-161 m, Galaxy Gold roof, spire 184.4 m
  { id: 'columbia_center', file: 'columbia_center.glb', trueHeightM: 287.0, face: 'east', stone: 0x3a3c40, ready: true }, // three concave-faced lobes, 53 x 70 m; setbacks at 175 and 245 m; roof 284 m (+ roof plant)
  { id: 'seattle_municipal_tower', file: 'municipal_tower.glb', trueHeightM: 220.0, face: 'west', stone: 0x5a7078, ready: true }, // 55 x 44 m, bowed faces, three rounded setbacks at the top
  { id: 'f5_tower', file: 'f5_tower.glb', trueHeightM: 201.0, face: 'west', stone: 0x9cb0c0, ready: true }, // faceted glass, 33 m at the street swelling to 46 m two thirds up
  { id: 'rainier_square_tower', file: 'rainier_square_tower.glb', trueHeightM: 260.0, face: 'west', stone: 0xa8b4be, ready: true }, // 44 x 32 m shaft; the +Z face sweeps out in the concave skirt to 53 m deep at the street
  { id: 'rainier_tower', file: 'rainier_tower.glb', trueHeightM: 157.0, face: 'east', stone: 0xcac8c2, ready: true }, // 33.5 m square shaft on the 12 m 'golf tee' pedestal (to 37 m)
  { id: 'third_1201', file: 'third_1201.glb', trueHeightM: 235.0, face: 'east', stone: 0xa89890, ready: true }, // 44 m notched square, rose granite piers, gabled pyramid crown
  { id: 'two_union_square', file: 'two_union_square.glb', trueHeightM: 226.0, face: 'north', stone: 0x5a8088, ready: true }, // 46 m square with scalloped corners, blue-green glass
  { id: 'russell_investments_center', file: 'russell_investments_center.glb', trueHeightM: 182.0, face: 'east', stone: 0x4a5a6a, ready: true }, // 57 x 35 m dark-blue glass slab, long side to the front
  { id: 'us_bank_centre', file: 'us_bank_centre.glb', trueHeightM: 203.0, face: 'west', stone: 0xa8a09c, ready: true }, // 47 x 42 m chamfered, bowed glass corner bays, granite crown
  { id: 'seattle_central_library', file: 'central_library.glb', trueHeightM: 57.5, face: 'west', stone: 0x8a9aa4, ready: true }, // 84 x 68 m: shifted platforms in the diamond-lattice skin; entrance on +Z (Fourth Ave)
  { id: 'smith_tower', file: 'smith_tower.glb', trueHeightM: 148.4, face: 'west', stone: 0xd4d0c6, ready: true }, // 33 x 40 m base block (82 m) with the 18 m tower over its +Z half, pyramid and globe lantern
  { id: 'pike_place_market', file: 'pike_place_market.glb', trueHeightM: 18.9, face: 'east', stone: 0xc8bea8, offsetM: [-38, -40], ready: true }, // offsetM: the layout lot is only the Pike St corner; the arcade runs ~55 m north-west from it along Pike Place. 129 x 35 m: the Main Arcade opening on +Z (Pike Place), the brick corner block at model -X (Pike St end); the sign is its own prop
  { id: 'pike_place_sign', file: 'pike_place_sign.glb', trueHeightM: 21.2, face: 'east', stone: 0x8a3028, ready: true }, // PUBLIC MARKET CENTER neon board 20 m wide on four steel columns from grade (top 21 m), FARMERS MARKET board, the clock on its post 4 m in front
  { id: 'westlake_center', file: 'westlake_center.glb', trueHeightM: 94.0, face: 'west', stone: 0x8aa0a0, ready: true }, // 80 x 70 m mall with the glass entrance vault on +Z (Pine St / Westlake Park), tower over the back half, monorail station canopy along the back (-Z, Fifth Ave)
  { id: 'convention_center_summit', file: 'convention_center_summit.glb', trueHeightM: 60.0, face: 'west', stone: 0x5a5c60, ready: true }, // 150 x 85 m shifted blocks, charcoal panels and faceted glass; glazed corner at model (+X, +Z)
  { id: 'seattle_art_museum', file: 'art_museum.glb', trueHeightM: 30.0, face: 'west', stone: 0xc4b08c, ready: true }, // 60 x 40 m fluted limestone, terracotta bands, SEATTLE ART MUSEUM lettering on +Z; Hammering Man is its own prop
  { id: 'hammering_man', file: 'hammering_man.glb', trueHeightM: 14.6, face: 'west', stone: 0x202022, ready: true }, // flat black steel silhouette, arm raised with the hammer
  { id: 'great_wheel', file: 'great_wheel.glb', trueHeightM: 53.3, face: 'west', stone: 0xd8dadc, clone: 'wheel_rotor', spinAxis: 'z', ready: true }, // 51 x 20 m, wheel plane faces +Z; node 'wheel_rotor' turns about its local Z (the axle), origin at the hub (28.6 m)
  { id: 'pier_57', file: 'pier_57.glb', trueHeightM: 21.6, face: 'east', stone: 0x8a8a84, ready: true }, // timber pier 60 x 120 m (deck top 1.2 m), gabled shed, MINER'S LANDING on the +Z street end; the pier runs toward -Z (the bay)
  { id: 'seattle_aquarium', file: 'aquarium.glb', trueHeightM: 23.3, face: 'north', stone: 0x8a9496, ready: true }, // pier 50 x 130 m, shed, timber-louvre entrance pavilion and SEATTLE AQUARIUM letters on the +Z street end
  { id: 'colman_dock', file: 'colman_dock.glb', trueHeightM: 21.8, face: 'east', stone: 0x7a7c7a, ready: true }, // 190 x 150 m apron, terminal on the +Z (Alaskan Way) side, three slips at the -Z end (berth centrelines model x -55, 0, 55)
  { id: 'olympic_sculpture_park', file: 'olympic_sculpture_park.glb', trueHeightM: 6.8, face: 'west', stone: 0x9a968e, ready: true }, // the PACCAR pavilion only (30 x 20 m); lawns and the Z path are the layout's
  { id: 'calder_eagle', file: 'calder_eagle.glb', trueHeightM: 13.1, face: 'east', stone: 0xb03020, ready: true }, // red steel stabile, 12 x 8 m
  { id: 'echo_plensa', file: 'echo_plensa.glb', trueHeightM: 14.0, face: 'west', stone: 0xd0cec8, ready: true }, // white elongated head, face on +Z
  { id: 'lumen_field', file: 'lumen_field.glb', trueHeightM: 78.1, face: 'east', stone: 0x9a9c9e, ready: true }, // 258 x 206 m bowl, field long axis along model X: the low open Hawks Nest end is model +X (face east puts it north), scoreboard end -X
  { id: 't_mobile_park', file: 'tmobile_park.glb', trueHeightM: 74.0, face: 'south', stone: 0x8a4a3a, ready: true }, // 307 x 249 m; home plate on the +Z side (face south: the plate ends up at the south / south-west), centre field toward -Z, the retractable roof parked open over model +X (east, the railway) on its green rail trusses
  { id: 'king_street_station', file: 'king_street_station.glb', trueHeightM: 74.0, face: 'east', stone: 0x9a4a36, ready: true }, // 105 x 31 m station, clock tower (12 m square, 74 m) at model +X (face east puts it at the north end, the long side toward the tracks)
  { id: 'union_station', file: 'union_station.glb', trueHeightM: 33.2, face: 'north', stone: 0x9a4a36, ready: true }, // 84 x 51 m, the great arched window in the +Z pavilion (Jackson St)
  { id: 'amazon_spheres', file: 'amazon_spheres.glb', trueHeightM: 28.0, face: 'east', stone: 0xa0b8c0, ready: true }, // 92 x 48 m: three glass spheres (39.6 m / 31 m / 29 m) on their plaza
  { id: 'amazon_doppler', file: 'amazon_doppler.glb', trueHeightM: 158.0, face: 'south', stone: 0x8aa0b0, ready: true }, // 47 x 41 m
  { id: 'amazon_day1', file: 'amazon_day1.glb', trueHeightM: 152.0, face: 'south', stone: 0x8aa0b0, ready: true }, // 51 x 35 m
  { id: 'climate_pledge_arena', file: 'climate_pledge_arena.glb', trueHeightM: 34.6, face: 'east', stone: 0x8a8c88, ready: true }, // 141 x 146 m saddle roof on four corner buttresses, glass walls, entrance canopy on +Z
  { id: 'mopop', file: 'mopop.glb', trueHeightM: 28.1, face: 'west', stone: 0xa07a50, ready: true }, // 115 x 75 m cluster of smooth coloured metal blobs; a gap at model x ~ +6 lets the monorail through
  { id: 'pacific_science_center', file: 'pacific_science_center.glb', trueHeightM: 36.2, face: 'north', stone: 0xd4d2cc, onWater: true, ready: true }, // 120 x 100 m white pavilions round the pools, the five arches (34 m)
  { id: 'chihuly_garden_glass', file: 'chihuly_garden_glass.glb', trueHeightM: 12.3, face: 'east', stone: 0x8aa8b0, ready: true }, // 34 x 30 m: the Glasshouse (30 m long, 12.2 m) with the Sealife glass inside and a strip of the garden in front (+Z)
  // seattle-design tier B / C (tools/build_sea_b.py, build_sea_center.py, build_sea_low.py): same conventions
  { id: 'safeco_plaza', file: 'safeco_plaza.glb', trueHeightM: 192, face: 'west', stone: 0x5a4a3a, ready: true }, // tier B, 60 x 56 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'wells_fargo_center', file: 'wells_fargo_center.glb', trueHeightM: 176.6, face: 'west', stone: 0x9a9690, ready: true }, // tier B, 36.5 x 31.4 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'fourth_and_madison', file: 'fourth_and_madison.glb', trueHeightM: 163, face: 'west', stone: 0x7aa090, ready: true }, // tier B, 50.6 x 35.4 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'bank_of_america_fifth_ave', file: 'bank_of_america_fifth_ave.glb', trueHeightM: 143, face: 'west', stone: 0x4a5a6a, ready: true }, // tier C, 44.6 x 45.4 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'thousand_second', file: 'thousand_second.glb', trueHeightM: 135, face: 'east', stone: 0xb8a098, ready: true }, // tier C, 35.7 x 35.7 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'seattle_tower', file: 'seattle_tower.glb', trueHeightM: 99, face: 'east', stone: 0x8a5a40, ready: true }, // tier B, 36.9 x 31.5 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'two_and_u', file: 'two_and_u.glb', trueHeightM: 166.4, face: 'east', stone: 0x9cb0c0, ready: true }, // tier C, 56 x 50 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'hyatt_regency', file: 'hyatt_regency.glb', trueHeightM: 150, face: 'south', stone: 0x8aa0b0, ready: true }, // tier B, 80.8 x 36.8 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'westin_seattle', file: 'westin_seattle.glb', trueHeightM: 140.6, face: 'south', stone: 0xc8c6c0, ready: true }, // tier B, 110.3 x 65.2 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'us_courthouse', file: 'us_courthouse.glb', trueHeightM: 117, face: 'south', stone: 0xb0bcc4, ready: true }, // tier C, 68 x 40 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'king_county_courthouse', file: 'king_county_courthouse.glb', trueHeightM: 50, face: 'west', stone: 0xa09888, ready: true }, // tier C, 106 x 62.1 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'arctic_building', file: 'arctic_building.glb', trueHeightM: 37, face: 'west', stone: 0xd0ccc0, ready: true }, // tier C, 42.8 x 36.8 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'pioneer_building', file: 'pioneer_building.glb', trueHeightM: 31.5, face: 'west', stone: 0x8a4a3a, ready: true }, // tier B, 36 x 52.2 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'fairmont_olympic', file: 'fairmont_olympic.glb', trueHeightM: 50, face: 'west', stone: 0xbca880, ready: true }, // tier C, 76 x 72 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'benaroya_hall', file: 'benaroya_hall.glb', trueHeightM: 30, face: 'east', stone: 0xb8a888, ready: true }, // tier C, 91.7 x 74.2 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'paramount_theatre', file: 'paramount_theatre.glb', trueHeightM: 40, face: 'west', stone: 0xbca880, ready: true }, // tier C, 37.6 x 74.8 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'nordstrom_flagship', file: 'nordstrom_flagship.glb', trueHeightM: 34, face: 'west', stone: 0xd0c8b8, ready: true }, // tier C, 112 x 76.1 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'macys_bon_marche', file: 'macys_bon_marche.glb', trueHeightM: 40, face: 'west', stone: 0xbca880, ready: true }, // tier C, 110.6 x 91.9 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'moore_theatre', file: 'moore_theatre.glb', trueHeightM: 30.4, face: 'south', stone: 0xd0ccc0, ready: true }, // tier C, 55.8 x 37.1 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'cinerama', file: 'cinerama.glb', trueHeightM: 14, face: 'south', stone: 0xd0d0cc, ready: true }, // tier C, 70 x 36.6 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'pioneer_pergola', file: 'pioneer_pergola.glb', trueHeightM: 18.6, face: 'north', stone: 0x303232, ready: true }, // tier B, 18.4 x 12 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'chinatown_gate', file: 'chinatown_gate.glb', trueHeightM: 13.5, face: 'west', stone: 0xa03028, ready: true }, // tier C, 17.2 x 5.6 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'victor_steinbrueck_park', file: 'victor_steinbrueck_park.glb', trueHeightM: 15.2, face: 'west', stone: 0x8a6040, ready: true }, // tier C, 30 x 7.1 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'seattle_center_armory', file: 'seattle_center_armory.glb', trueHeightM: 26, face: 'north', stone: 0xb8b6b0, ready: true }, // tier B, 110.8 x 96.4 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'mccaw_hall', file: 'mccaw_hall.glb', trueHeightM: 36, face: 'south', stone: 0xc0b090, ready: true }, // tier C, 104 x 96 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'gates_foundation', file: 'gates_foundation.glb', trueHeightM: 31, face: 'south', stone: 0x9cb0c0, ready: true }, // tier C, 173.5 x 100.3 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'international_fountain', file: 'international_fountain.glb', trueHeightM: 26, face: 'south', stone: 0xd0d0cc, onWater: true, ready: true }, // tier B, 67 x 67 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'kexp_northwest_rooms', file: 'kexp_northwest_rooms.glb', trueHeightM: 10, face: 'south', stone: 0xd0d0cc, ready: true }, // tier C, 121.2 x 61.2 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'mohai', file: 'mohai.glb', trueHeightM: 26, face: 'north', stone: 0xd0d0cc, ready: true }, // tier B, 48.6 x 60.6 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'ivars_pier_54', file: 'ivars_pier_54.glb', trueHeightM: 21.8, face: 'east', stone: 0x8a8a84, ready: true }, // tier B, 51.1 x 120.5 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'edgewater_hotel', file: 'edgewater_hotel.glb', trueHeightM: 22.8, face: 'north', stone: 0x705038, ready: true }, // tier C, 51.1 x 150.5 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'pier_69', file: 'pier_69.glb', trueHeightM: 25, face: 'north', stone: 0x9a9a96, ready: true }, // tier C, 56.1 x 200.5 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'pier_62', file: 'pier_62.glb', trueHeightM: 5, face: 'west', stone: 0x8a8a84, ready: true }, // tier C, 51.1 x 140.5 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'bell_harbor', file: 'bell_harbor.glb', trueHeightM: 27.8, face: 'north', stone: 0xa0b0aa, ready: true }, // tier B, 81.1 x 290.9 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)
  { id: 'ocean_pavilion', file: 'ocean_pavilion.glb', trueHeightM: 17, face: 'south', stone: 0x505458, ready: true }, // tier B, 52.8 x 72.4 m (build_sea_b.py / build_sea_center.py / build_sea_low.py)

];

// Generic blocks by height bucket (game units: low < 7, short 7-18,
// medium 18-40, tall > 40). Empty: seattle.js borrows Chicago's kit.
// { file, bucket, style?, maxH?, share?, trueM?, stone?, desktopOnly?, ready }
export const SEATTLE_GENERIC_GLBS = [
  // seattle-design kit, low-rise set (build_seattle_kit.py LOW-RISE section): true storeys 3.0-4.4 m, walls 4.5-12 m
  { file: 'seattle_low_a.glb', bucket: 'low', style: 'lowrise', trueM: [30.3, 6.95, 19.45], stone: 0x784a38, ready: true }, // 1-st retail strip, awnings, parapet 6.3 m
  { file: 'seattle_low_b.glb', bucket: 'low', style: 'lowrise brick', trueM: [16.4, 6.95, 23.64], stone: 0x702c28, ready: true }, // 1-st corner cafe with the mural, parapet 6.4 m
  { file: 'seattle_low_c.glb', bucket: 'low', style: 'lowrise brick', trueM: [24.9, 10.4, 21.75], stone: 0x7e4232, ready: true }, // 2-st Pioneer Square brick, cast-iron fronts, cornice 9.6 m
  { file: 'seattle_low_d.glb', bucket: 'low', style: 'lowrise', trueM: [15.2, 8.55, 22.0], stone: 0x3c7878, ready: true }, // 2-st teal lap-siding false front, 8.3 m
  { file: 'seattle_low_e.glb', bucket: 'low', style: 'lowrise brick apartment', trueM: [19.5, 12.6, 26.0], stone: 0xa05a3e, ready: true }, // 3-st brick walk-up, fire escapes, cornice 11.2 m
  { file: 'seattle_low_f.glb', bucket: 'low', style: 'lowrise apartment', trueM: [22.6, 13.77, 25.2], stone: 0xb6b6b2, ready: true }, // 3-st mixed-use fibre-cement, rust bays, parapet 11.95 m
  { file: 'seattle_low_g.glb', bucket: 'low', style: 'lowrise warehouse', trueM: [35.16, 8.6, 25.16], stone: 0xc4c0b0, ready: true }, // 1-st auto shop, roll-up doors, parapet 7.4 m
  { file: 'seattle_low_h.glb', bucket: 'low', style: 'lowrise warehouse brick', trueM: [24.0, 7.5, 30.0], stone: 0x5c3630, ready: true }, // 1-st sawtooth brick warehouse
  { file: 'seattle_house_a.glb', bucket: 'low', style: 'lowrise house', trueM: [11.2, 7.4, 17.9], stone: 0x78825e, ready: true }, // Craftsman bungalow with porch
  { file: 'seattle_house_b.glb', bucket: 'low', style: 'lowrise house', trueM: [10.2, 9.45, 13.5], stone: 0xcecabe, ready: true }, // two-storey foursquare, hipped roof
  // seattle-design kit (devtools/seattle/design/tools/build_seattle_kit.py, kit2 method): one material + one painted atlas per piece,
  // front +Z = street face, metres, base y=0, LOD1 twin. style words match seattle.js STYLE_OK (pioneer / brick / masonry /
  // warehouse / concrete / midrise / apartment / lowrise / glassslab / glasstower / glass). trueM [w, h, d] incl. roof clutter.
  { file: 'seattle_pioneer_a.glb', bucket: 'low', style: 'pioneer brick', trueM: [37.4, 27.7, 31.6], stone: 0x8a4a3a, ready: true },
  { file: 'seattle_pioneer_b.glb', bucket: 'low', style: 'pioneer brick', trueM: [41.9, 34.8, 36.2], stone: 0x8a4a3a, ready: true },
  { file: 'seattle_pioneer_c.glb', bucket: 'low', style: 'pioneer brick masonry', trueM: [27.5, 22.3, 32], stone: 0xb8a080, ready: true },
  { file: 'seattle_pioneer_d.glb', bucket: 'low', style: 'pioneer brick', trueM: [13.9, 16.2, 30], stone: 0x8a4a3a, ready: true },
  { file: 'seattle_belltown_a.glb', bucket: 'low', style: 'brick lowrise', trueM: [40.6, 14.8, 23.6], stone: 0xc0a880, ready: true },
  { file: 'seattle_belltown_b.glb', bucket: 'low', style: 'apartment lowrise', trueM: [30.7, 22.1, 25.7], stone: 0xd0ccc0, ready: true },
  { file: 'seattle_belltown_c.glb', bucket: 'low', style: 'brick apartment', trueM: [33.7, 26, 29.7], stone: 0x8a4a3a, ready: true },
  { file: 'seattle_terracotta_a.glb', bucket: 'short', style: 'masonry brick', trueM: [36.8, 44.6, 31.6], stone: 0xd0ccc0, ready: true },
  { file: 'seattle_warehouse_a.glb', bucket: 'low', style: 'warehouse brick', trueM: [31.2, 16.2, 65.9], stone: 0x8a4a3a, ready: true },
  { file: 'seattle_warehouse_b.glb', bucket: 'low', style: 'warehouse brick', trueM: [44.7, 27.5, 34.7], stone: 0x8a4a3a, ready: true },
  { file: 'seattle_garage_a.glb', bucket: 'low', style: 'concrete midrise', trueM: [36.3, 20.5, 56.6], stone: 0xa8a8a4, ready: true },
  { file: 'seattle_garage_b.glb', bucket: 'low', style: 'concrete midrise', trueM: [40.5, 30.5, 51.2], stone: 0xa8a8a4, ready: true },
  { file: 'seattle_podium_a.glb', bucket: 'low', style: 'midrise apartment', trueM: [60.2, 25.7, 27.6], stone: 0x7a7c80, ready: true },
  { file: 'seattle_podium_b.glb', bucket: 'low', style: 'midrise apartment', trueM: [50.8, 27, 31.7], stone: 0xb0aca4, ready: true },
  { file: 'seattle_podium_c.glb', bucket: 'low', style: 'midrise apartment', trueM: [58.8, 31.5, 29.5], stone: 0x4a4e56, ready: true },
  { file: 'seattle_podium_d.glb', bucket: 'low', style: 'midrise apartment brick', trueM: [48.3, 26.1, 27.5], stone: 0x9a5a40, ready: true },
  { file: 'seattle_officeslab_a.glb', bucket: 'short', style: 'concrete glassslab', trueM: [47, 68.6, 29.9], stone: 0xc8c4bc, ready: true },
  { file: 'seattle_officeslab_b.glb', bucket: 'medium', style: 'glassslab', trueM: [52, 93.1, 44], stone: 0x8a6a50, ready: true },
  { file: 'seattle_officeslab_c.glb', bucket: 'medium', style: 'glassslab', trueM: [44, 126.2, 41], stone: 0xa89890, ready: true },
  { file: 'seattle_glasstower_a.glb', bucket: 'medium', style: 'glasstower glass', trueM: [48.5, 134, 40.2], stone: 0x9cb0c0, ready: true },
  { file: 'seattle_glasstower_b.glb', bucket: 'medium', style: 'glasstower glass', trueM: [50.5, 167.1, 44.2], stone: 0x6a9090, ready: true },
  { file: 'seattle_glasstower_c.glb', bucket: 'tall', style: 'glasstower glass', trueM: [52.5, 209.8, 42.8], stone: 0x5a6470, ready: true },
  { file: 'seattle_glasstower_d.glb', bucket: 'tall', style: 'glasstower glass', trueM: [56.3, 243, 50.2], stone: 0x9cb0c0, ready: true },
  { file: 'seattle_condotower_a.glb', bucket: 'short', style: 'glasstower apartment', trueM: [34.6, 82.2, 28.2], stone: 0xd0d0cc, ready: true },
  { file: 'seattle_condotower_b.glb', bucket: 'medium', style: 'glasstower apartment', trueM: [50, 129.8, 40], stone: 0x9cb0c0, ready: true },
  { file: 'seattle_condotower_c.glb', bucket: 'medium', style: 'glasstower apartment', trueM: [37, 180.6, 32.7], stone: 0xc8ccd0, ready: true },
];

// Street props: { name, file, heightM?, ready } (front +Z, metres)
export const SEATTLE_PROP_GLBS = [
  // seattle-design (devtools/seattle/design/tools/build_seattle_props.py), metres, origin at the base centre
  { name: 'seattle_streetlamp', file: 'seattle_streetlamp.glb', heightM: 10.6, ready: true }, // tall grey pole with a cobra-head arm reaching 4.4 m over the road (+Z)
  { name: 'seattle_traffic_signal', file: 'seattle_traffic_signal.glb', heightM: 7.5, ready: true }, // mast arm 7.8 m along +X with three yellow heads, street-name blade
  { name: 'seattle_hydrant', file: 'seattle_hydrant.glb', heightM: 0.9, ready: true }, // yellow body, white bonnet
  { name: 'seattle_bus_shelter', file: 'seattle_bus_shelter.glb', heightM: 3.0, ready: true }, // dark green steel and glass, 5.9 m along X
  { name: 'seattle_trash_can', file: 'seattle_trash_can.glb', heightM: 1.0, ready: true },
  { name: 'seattle_newspaper_box', file: 'seattle_newspaper_box.glb', heightM: 1.1, ready: true }, // a row of three coloured boxes
  { name: 'seattle_bench', file: 'seattle_bench.glb', heightM: 0.9, ready: true },
  { name: 'seattle_pier_pilings', file: 'seattle_pier_pilings.glb', heightM: 5.0, ready: true }, // cluster of creosote timber piles (a dolphin), base at the water line
  { name: 'seattle_waterfront_rail', file: 'seattle_waterfront_rail.glb', heightM: 1.1, ready: true }, // 3.1 m seawall railing segment (repeat along X)
];

// Extra traffic: { url, len, weight, parked?, albedo?, minRoadW?, ready }
export const SEATTLE_VEHICLE_GLBS = [
  // seattle-design (devtools/seattle/design/tools/build_seattle_vehicles.py). Front +Z, wheels at y 0, metres
  { url: SEATTLE_BASE + 'seattle_sedan.glb', len: 4.9, weight: 12, ready: true }, // silver sedan
  { url: SEATTLE_BASE + 'seattle_suv.glb', len: 4.7, weight: 10, ready: true }, // dark green SUV
  { url: SEATTLE_BASE + 'seattle_delivery_van.glb', len: 5.9, weight: 4, ready: true }, // white delivery van
  { url: SEATTLE_BASE + 'seattle_box_truck.glb', len: 7.6, weight: 3, ready: true }, // white box truck
  { url: SEATTLE_BASE + 'seattle_bus.glb', len: 12.5, weight: 3, parked: false, minRoadW: 6.5, ready: true }, // Metro-style 40 ft bus, invented livery
  { url: SEATTLE_BASE + 'seattle_police.glb', len: 5.2, weight: 3, lightBar: true, parked: false, ready: true }, // white-and-blue POLICE car (invented livery)
];

// Kit pieces placed many times or fitted to named footprints:
// { id: { file, heightM?, ready, layoutIds?, desktopOnly? } }
// Placed by seattle.js when ready: seattle_ferry, seattle_container_ship (waterline y = 0, front +Z),
// seattle_container_crane, seattle_floatplane, seattle_monorail_train (+ _blue; seated 1.6 m below the beam top).
export const SEATTLE_KIT_GLBS = {
  // seattle-design. Water craft: y 0 = the WATERLINE (nothing below), front +Z.
  seattle_ferry: { file: 'seattle_ferry.glb', heightM: 29.0, ready: true }, // Jumbo Mark II class, 140 x 27.4 m, double-ended, white with the green band
  seattle_container_ship: { file: 'seattle_container_ship.glb', heightM: 50.0, ready: true }, // 300 x 49 m, bow +Z
  seattle_floatplane: { file: 'seattle_floatplane.glb', heightM: 5.0, ready: true }, // Beaver-class floatplane, 9.6 m long, 14.6 m span, floats at y 0
  seattle_container_crane: { file: 'seattle_container_crane.glb', heightM: 103.9, ready: true }, // red-and-white ship-to-shore gantry crane, boom raised (true size, base on the quay)
  // The Monorail (build_sea_center.py): the Alweg train STRADDLES the beam - model y 0 is the skirt bottom and the beam top
  // is at model y +1.6, so seat it 1.6 m below the beam top. 37.5 m, front +Z (either end leads).
  seattle_monorail_train: { file: 'seattle_monorail_train.glb', heightM: 3.8, ready: true }, // the Red train
  seattle_monorail_train_blue: { file: 'seattle_monorail_train_blue.glb', heightM: 3.8, ready: true }, // the Blue train
};

// Debris for wrecked Seattle buildings (urls), used instead of the shared concrete kit when listed.
export const SEATTLE_DEBRIS_GLBS = [
  // seattle-design (devtools/seattle/design/tools/build_seattle_debris.py): one material each, metres
  'debris_seattle_brick_wall.glb', 'debris_seattle_brick_corner.glb', 'debris_seattle_sandstone_block.glb', 'debris_seattle_terracotta_cornice.glb',
  'debris_seattle_curtain_wall.glb', 'debris_seattle_steel_beam.glb', 'debris_seattle_concrete_slab.glb', 'debris_seattle_pier_planks.glb',
].map((f) => SEATTLE_BASE + f);
