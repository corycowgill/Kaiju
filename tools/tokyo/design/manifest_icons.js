// Tokyo landmark models by design-icons (tools/tokyo/design/icons_build_*.py + icons_lib.py, Blender 4.5).
// Paste into the level manifest. All: metres, Y up, base y = 0 (bridges / waterline models: y 0 = water level), centred X/Z, front +Z, LOD1 twin.
// Every material carries an emissive map (dusk: lit windows, lanterns, floodlights; emissiveFactor 1, scale it in the look layer).
// trueHeightM = exported bbox height; face = compass word the model's +Z front should point to.
export const TOKYO_ICON_GLBS = [
  { id: 'tokyo_station', file: 'tokyo_station.glb', trueHeightM: 43, face: 'west', stone: 0x93402f, ready: true }, // tier A, 339 x 68 m, 4064 / 982 tris; Tokyo Station, Marunouchi building: the 335 m red-brick 1914 front with white stone banding and pilasters, slate mansard roofs with dormers, the two octagonal ribbed domes over the north / south entrances, the gabled centre pavilion with the imperial porch, paired turrets and end pavilions; four platform canopies with trains on the viaduct behind (-Z)
  { id: 'national_diet_building', file: 'national_diet_building.glb', trueHeightM: 65.5, face: 'east', stone: 0xc4c0b4, ready: true }, // tier A, 210.9 x 124.5 m, 3000 / 672 tris; National Diet Building: pale granite, 206 m symmetric front with giant pilasters between window strips over a rusticated base, projecting end pavilions, the two chamber blocks with hipped roofs behind, the pillared centre porch with its steps and the 65 m tower with a columned stage under the stepped pyramid; courtyards and rear range
  // imperial_palace_nijubashi: not built
  // imperial_palace_kyuden: not built
  // fujimi_yagura: not built
  // edo_castle_otemon: not built
  { id: 'kabukiza', file: 'kabukiza.glb', trueHeightM: 149, face: 'northwest', stone: 0xd8d4c8, ready: true }, // tier A, 82.2 x 99.5 m, 3376 / 718 tris; Kabuki-za: white Momoyama-revival theatre front on +Z: the great karahafu entrance gable with gold fittings and purple curtain, the big front-facing irimoya roof over the centre, gabled end pavilions with their own karahafu doors, tiled eaves, vermilion balustrades, rows of red lanterns and the drum-tower box; the plain pale 145 m office tower with vertical fins rising behind
  // wako_ginza: not built
  // ginza_place: not built
  // mitsukoshi_ginza: not built
  { id: 'zojoji', file: 'zojoji.glb', trueHeightM: 26.85, face: 'east', stone: 0x8a3a2a, ready: true }, // tier A, 100 x 171.6 m, 5162 / 1574 tris; Zojo-ji: the vermilion two-storey Sangedatsumon gate (five bays, pent roof and hip-and-gable upper roof with curved eaves) on +Z, the stone-paved approach with lanterns and pines, the great hall (Daiden) on its stone terrace with the skirt roof, the sweeping irimoya main roof and stepped porch, the Ankokuden hall (+X) and the bell tower (-X)
  // tsukiji_honganji: not built
  // hie_shrine: not built
  // atago_shrine: not built
  // tokyo_international_forum: not built
  // imperial_hotel: not built
  // ministry_of_justice_red_brick: not built
  // kantei: not built
  // supreme_court_japan: not built
  // national_theatre: not built
  // bank_of_japan: not built
  // mitsukoshi_nihonbashi: not built
  // nihonbashi_bridge: not built
  // takashimaya_nihonbashi: not built
  { id: 'rainbow_bridge', file: 'rainbow_bridge.glb', trueHeightM: 128.6, face: 'south', stone: 0xd4d4ce, origin: 'midspan', onWater: true, waterline: true, ready: true }, // tier A, 1000 x 60 m, 4366 / 594 tris; Rainbow Bridge, whole bridge at true size, X along it: towers at x +-285 (126 m, legs at z +-17, three cross-beams), 570 m main span, side spans to the anchorage blocks (faces at x +-399, cables anchored at +-432 = 147 m), blocks to +-465, approach stubs to +-500. Double deck: upper road y 60, lower deck y 50.8 with the transit guideway; z +-14.5. Main cables are true parabolic catenaries (lit white), sparse strip suspenders, strip truss diagonals; floodlit white towers, red aviation lights. y 0 = waterline
  // odaiba_statue_of_liberty: not built
  // aqua_city_odaiba: not built
  // kachidoki_bridge: not built
  // tsukiji_outer_market: not built
  // toyosu_market: not built
  // hamarikyu_teahouse: not built
  // takeshiba_pier: not built
  // takanawa_gateway_station: not built
  // shimbashi_sl_plaza: not built
  // ginza_six: not built
];
