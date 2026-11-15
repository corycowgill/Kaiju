// Washington DC asset manifest (owner: dc-design; read by src/levels/dc.js).
// Same fields as the tables at the top of src/levels/chicago.js. Set
// ready: true only once the file (and its <name>_lod1.glb, unless lod1:
// false) is in assets/buildings/dc/, so missing files never 404; unready
// landmarks are built from procedural massing.
export const DC_BASE = './assets/buildings/dc/';

// id: the landmark id in assets/levels/dc_layout.json (ids: several sites,
// one model). trueHeightM: the model's bbox height incl. spires; the layout
// height is the roof. face: the world direction of the model's +Z front.
// fit 'footprint' (+ maxH, stretch): fill the layout outline instead of the
// true-height uniform scale. exact (+ atOrigin): map scale, no fit.
export const DC_LANDMARK_GLBS = [
  // dc-design, procedural Blender builds at true size (devtools/dc/design/tools/build_*.py).
  // All: metres, Y up, base y=0 (street grade), centred X/Z, front +Z, LOD1 twin, metal 0.
  { id: 'us_capitol', file: 'us_capitol.glb', trueHeightM: 94.0, face: 'west', ready: true }, // 230 x 142 m incl. the 6 m west terraces + stair; Freedom crest 88 m above the terrace; model X = N-S
  { id: 'washington_monument', file: 'washington_monument.glb', trueHeightM: 169.3, face: 'east', ready: true }, // obelisk 16.8 m base on a 22.8 m granite plinth; door east
  { id: 'lincoln_memorial', file: 'lincoln_memorial.glb', trueHeightM: 30.2, face: 'east', ready: true }, // 67.8 x 59.1 m incl. podium and east stair
  { id: 'jefferson_memorial', file: 'jefferson_memorial.glb', trueHeightM: 39.0, face: 'north', ready: true }, // 70 x 88.5 m incl. terrace and north stair; portico north
  { id: 'white_house', file: 'white_house.glb', trueHeightM: 21.9, face: 'north', ready: true }, // 52 x 48.5 m residence; north portico +Z, bowed south portico; wings not included
  { id: 'natural_history_museum', file: 'natural_history_museum.glb', trueHeightM: 40.1, face: 'south', ready: true }, // 224 x 144 m; portico + dome on the Mall side
  { id: 'air_and_space_museum', file: 'air_and_space_museum.glb', trueHeightM: 29.2, face: 'north', ready: true }, // 220 x 92 m
  { id: 'national_gallery_west', file: 'national_gallery_west.glb', trueHeightM: 34.0, face: 'south', ready: true }, // 248 x 115 m; dome over the rotunda
  { id: 'national_gallery_east', file: 'national_gallery_east.glb', trueHeightM: 33.0, face: 'west', ready: true }, // 97 x 134 m; +Z the west entrance toward the West Building
  { id: 'nmaahc', file: 'nmaahc.glb', trueHeightM: 34.3, face: 'south', ready: true }, // 100 x 112 m incl. porch and plaza
  { id: 'hirshhorn_museum', file: 'hirshhorn_museum.glb', trueHeightM: 25.5, face: 'north', ready: true }, // 96 x 96 m incl. walled plaza; drum 70 m
  { id: 'smithsonian_castle', file: 'smithsonian_castle.glb', trueHeightM: 44.3, face: 'north', ready: true }, // 139 x 40 m
  { id: 'national_archives', file: 'national_archives.glb', trueHeightM: 51.0, face: 'south', ready: true }, // 106 x 94 m; +Z the Constitution Ave (Mall) front
  { id: 'old_post_office', file: 'old_post_office.glb', trueHeightM: 96.0, face: 'north', ready: true }, // 100 x 70 m; +Z the Pennsylvania Ave front with the clock tower
  { id: 'treasury_building', file: 'treasury_building.glb', trueHeightM: 25.1, face: 'east', ready: true }, // 166 x 105 m; +Z the 15th St colonnade
  { id: 'supreme_court', file: 'supreme_court.glb', trueHeightM: 28.8, face: 'west', ready: true }, // 96 x 164 m incl. the west plaza; model X = N-S
  { id: 'library_of_congress', file: 'library_of_congress.glb', trueHeightM: 59.0, face: 'west', ready: true }, // 146 x 133 m; +Z the west front + stair toward the Capitol
  { id: 'wwii_memorial', file: 'wwii_memorial.glb', trueHeightM: 16.8, face: 'east', ready: true }, // 93 x 148 m; +Z the 17th St entrance; pool material "water" for the game to replace
  { id: 'eeob', file: 'eeob.glb', trueHeightM: 38.9, face: 'east', ready: true }, // tier A
  { id: 'nmah', file: 'nmah.glb', trueHeightM: 26.0, face: 'south', ready: true }, // tier A
  { id: 'nmai', file: 'nmai.glb', trueHeightM: 32.0, face: 'east', ready: true }, // tier A
  { id: 'arts_industries', file: 'arts_industries.glb', trueHeightM: 24.0, face: 'north', ready: true }, // tier B
  { id: 'usbg_conservatory', file: 'usbg_conservatory.glb', trueHeightM: 24.4, face: 'north', ready: true }, // tier B
  { id: 'union_station', file: 'union_station.glb', trueHeightM: 29.0, face: 'south', ready: true }, // tier B
  { id: 'kennedy_center', file: 'kennedy_center.glb', trueHeightM: 32.0, face: 'west', ready: true }, // tier B
  { id: 'watergate', file: 'watergate.glb', trueHeightM: 42.0, face: 'west', ready: true }, // tier B
  { id: 'fbi_hoover', file: 'fbi_hoover.glb', trueHeightM: 49.0, face: 'south', ready: true }, // tier B
  { id: 'holocaust_museum', file: 'holocaust_museum.glb', trueHeightM: 24.0, face: 'east', ready: true }, // tier B
  { id: 'grant_memorial', file: 'grant_memorial.glb', trueHeightM: 13.0, face: 'west', ready: true }, // tier B
  { id: 'mlk_memorial', file: 'mlk_memorial.glb', trueHeightM: 9.1, face: 'south-east', ready: true }, // tier B
  { id: 'usda_whitten', file: 'usda_whitten.glb', trueHeightM: 18.1, face: 'north', ready: true }, // tier B
  { id: 'reagan_building', file: 'reagan_building.glb', trueHeightM: 38.1, face: 'north', ready: true }, // tier B
  // Tier-B federal blocks: build_fedblock.py (courtyard ring plans from the layout's w x d, height, front)
  { id: 'commerce_hchb', file: 'commerce_hchb.glb', trueHeightM: 25.4, face: 'east', ready: true }, // tier B
  { id: 'epa_federal_triangle', file: 'epa_federal_triangle.glb', trueHeightM: 29.2, face: 'south', ready: true }, // tier B
  { id: 'irs_building', file: 'irs_building.glb', trueHeightM: 25.4, face: 'south', ready: true }, // tier B
  { id: 'doj_rfk', file: 'doj_rfk.glb', trueHeightM: 25.4, face: 'south', ready: true }, // tier B
  { id: 'labor_perkins', file: 'labor_perkins.glb', trueHeightM: 25.4, face: 'south', ready: true }, // tier B
  { id: 'state_dept', file: 'state_dept.glb', trueHeightM: 34.1, face: 'south', ready: true }, // tier B
  { id: 'fed_eccles', file: 'fed_eccles.glb', trueHeightM: 29.5, face: 'south', ready: true }, // tier B
  { id: 'interior_main', file: 'interior_main.glb', trueHeightM: 32.6, face: 'east', ready: true }, // tier B
  { id: 'nas_building', file: 'nas_building.glb', trueHeightM: 18, face: 'south', ready: true }, // tier B
  { id: 'dar_hall', file: 'dar_hall.glb', trueHeightM: 20, face: 'east', ready: true }, // tier B
  { id: 'oas_building', file: 'oas_building.glb', trueHeightM: 18, face: 'east', ready: true }, // tier B
  { id: 'cannon_house', file: 'cannon_house.glb', trueHeightM: 27.6, face: 'north', ready: true }, // tier B
  { id: 'longworth_house', file: 'longworth_house.glb', trueHeightM: 25.6, face: 'north', ready: true }, // tier B
  { id: 'rayburn_house', file: 'rayburn_house.glb', trueHeightM: 29.6, face: 'north', ready: true }, // tier B
  { id: 'russell_senate', file: 'russell_senate.glb', trueHeightM: 27.6, face: 'south', ready: true }, // tier B
  { id: 'dirksen_hart', file: 'dirksen_hart.glb', trueHeightM: 27.6, face: 'south', ready: true }, // tier B
  { id: 'loc_madison', file: 'loc_madison.glb', trueHeightM: 34.1, face: 'north', ready: true }, // tier B
  { id: 'loc_adams', file: 'loc_adams.glb', trueHeightM: 25.4, face: 'west', ready: true }, // tier B
  { id: 'bep_main', file: 'bep_main.glb', trueHeightM: 29.6, face: 'west', ready: true }, // tier B
  { id: 'usda_south', file: 'usda_south.glb', trueHeightM: 25.4, face: 'north', ready: true }, // tier B
  { id: 'freer', file: 'freer.glb', trueHeightM: 14, face: 'north', ready: true }, // tier B
];

// Generic blocks by height bucket (game units: low < 7, short 7-18,
// medium 18-40, tall > 40). Empty: dc.js borrows Chicago's stone kit.
export const DC_GENERIC_GLBS = [
  // dc-design kit (devtools/dc/design/tools/build_kit.py): front +Z = street face,
  // metres, fitted to lots like Chicago's kit. trueM [w, h, d] incl. roof.
  // maxH (u): only on blocks up to that height (a rowhouse blown up to a
  // 30 m block reads as a giant)
  { file: 'dc_brick_row.glb', bucket: 'low', maxH: 3.5, trueM: [24, 12, 15], ready: true },      // Capitol Hill red-brick rowhouses with bays
  { file: 'dc_brick_corner.glb', bucket: 'low', maxH: 5, trueM: [22, 18, 18], ready: true },     // 4-5 storey brick + stone corner shop
  { file: 'dc_beaux.glb', bucket: 'low', trueM: [41, 34, 31], ready: true },                     // Beaux-Arts limestone, copper mansard
  { file: 'dc_fed_plain.glb', bucket: 'low', trueM: [57, 37, 37], ready: true },                 // plain limestone federal office
  { file: 'dc_fed_colonnade.glb', bucket: 'short', trueM: [64, 43, 51], ready: true },           // Federal Triangle: colonnade facade, red tile roof
  { file: 'dc_fed_white.glb', bucket: 'short', trueM: [61, 41, 41], ready: true },               // white granite federal with pilasters + attic
  { file: 'dc_brutal.glb', bucket: 'short', trueM: [70, 44, 34], ready: true },                  // brutalist concrete agency block on pilotis
  { file: 'dc_office_band.glb', bucket: 'short', trueM: [46, 45, 34], ready: true },             // 1980s stone + ribbon-window office, setback top
  { file: 'dc_office_glass.glb', bucket: 'short', trueM: [45, 47, 33], ready: true },            // 2000s glass-and-stone office
];

// Street props: { name, file, ready } (front +Z, metres)
export const DC_PROP_GLBS = [
  // dc-design (devtools/dc/design/tools/build_dc_props.py), metres, origin at the base centre
  { name: 'dc_globe_lamp', file: 'dc_globe_lamp.glb', heightM: 4.6, ready: true },   // Washington globe streetlight (the Mall, downtown)
  { name: 'dc_metro_pylon', file: 'dc_metro_pylon.glb', heightM: 4.4, ready: true }, // WMATA station pylon (Smithsonian, Federal Triangle, L'Enfant)
];

// Extra traffic: { url, len, weight, parked?, albedo?, minRoadW?, ready }
export const DC_VEHICLE_GLBS = [
  // dc-design procedural (simple boxes: placeholder quality next to Chicago's cars). Front +Z, wheels at y 0
  { url: DC_BASE + 'dc_tour_bus.glb', len: 12.2, weight: 6, parked: false, minRoadW: 6.5, ready: true },  // white motorcoach, blue sweep
  { url: DC_BASE + 'dc_food_truck.glb', len: 7.2, weight: 3, ready: true },                            // yellow step-van food truck (parks along the Mall)
];

// Kit pieces placed many times: { id: { file, ready, ... } }
export const DC_KIT_GLBS = {
  // The 50 flags round the Washington Monument: one mesh, ring radius 33 m centred on the origin
  // (place at the Monument's centre, true size), 9.1 m poles, flags flying toward +X
  dc_flag_ring: { file: 'dc_flag_ring.glb', radiusM: 33, heightM: 9.1, ready: true },
  // Security bollards: 6 m row along X (5 steel bollards, granite end blocks), for the White House,
  // Capitol and federal building kerbs
  dc_bollard_row: { file: 'dc_bollard_row.glb', len: 7.8, ready: true },
};
