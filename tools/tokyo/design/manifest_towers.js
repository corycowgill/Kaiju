// Tokyo landmark towers (design-towers): ready-to-paste lines for the level manifest (line shape as tools/sf/design/manifest_towers.js).
// Procedural Blender 4.5 builds at true size: tools/tokyo/design/towers_lib.py + towers_build_a.py / _a2.py / _b.py / _c.py (blender -b -P ... -- [ids]);
// plan sizes fitted to tools/tokyo/data/landmark_sites.json (wMetres / dMetres) where that file had the site at build time. All: metres, Y up,
// base y = 0, centred X/Z on the lot, front +Z, LOD1 twin (no materials), palette atlas + one or two tiling facade maps (metal 0 on facades).
// DUSK: every material carries an emissive map (lit-window scatter on the facade tiles; lobby glass, deck lighting, floodlit steel and red
// aircraft warning lights in the palette), emissive factor 1: the level look layer scales it. Base colour stays daytime.
// face: the compass word nearest the direction the model's +Z front should look (from frontBearing when the sites file had it).
// trueHeightM = the exported bbox height.
export const TOKYO_TOWER_GLBS = [
  { id: 'tokyo_tower', file: 'tokyo_tower.glb', trueHeightM: 333.0, face: 'south', stone: 0xd9531e, ready: true }, // tier A, 98.0 x 98.0 m, 5300 / 1372 tris; 94 m square at the feet: true open lattice (corner chords as tubes, X-bracing as strips), four splayed lattice legs with the arch between them, lift shaft, two-storey main deck at 150 m, top deck at 250 m, antenna, FootTown block under the legs; international-orange and white bands, warm floodlight emissive on the steel, lit decks, red warning lights
  { id: 'tokyo_skytree', file: 'tokyo_skytree.glb', trueHeightM: 634.0, face: 'south', stone: 0xdfe6ee, ready: true }, // tier A, 60.9 x 60.4 m, 6350 / 1566 tris; 68 m rounded-triangle base morphing to a circle by 300 m: sparse white lattice skin (columns, rings, diagonals as strips) over a pale core, the flared Tembo Deck at 340-360 m and Galleria at 445-455 m with its spiral glass ramp, gain tower to 634 m; pale blue core light and blue-violet deck lighting emissive
  // azabudai_hills_mori_jp_tower: NOT BUILT
  // toranomon_hills_mori_tower: NOT BUILT
  // toranomon_hills_station_tower: NOT BUILT
  // tokyo_midtown_yaesu: NOT BUILT
  // tokiwabashi_tower: NOT BUILT
  // marunouchi_building: NOT BUILT
  // shin_marunouchi_building: NOT BUILT
  // jp_tower_kitte: NOT BUILT
  // gran_tokyo: NOT BUILT
  // otemachi_tower: NOT BUILT
  // tokyo_midtown_hibiya: NOT BUILT
  // dentsu_building: NOT BUILT
  // nittele_tower: NOT BUILT
  // shiodome_city_center: NOT BUILT
  // shiodome_media_tower: NOT BUILT
  // tokyo_shiodome_building: NOT BUILT
  // kasumigaseki_building: NOT BUILT
  // kasumigaseki_common_gate: NOT BUILT
  // sanno_park_tower: NOT BUILT
  // izumi_garden_tower: NOT BUILT
  // ark_mori_building: NOT BUILT
  // atago_green_hills_mori_tower: NOT BUILT
  // world_trade_center_hamamatsucho: NOT BUILT
  // tokyo_port_city_takeshiba: NOT BUILT
  // nec_supertower: NOT BUILT
  // st_lukes_tower: NOT BUILT
  // the_tokyo_towers: NOT BUILT
  // harumi_triton: NOT BUILT
  // river_city_21: NOT BUILT
  // prince_park_tower: NOT BUILT
  { id: 'fuji_tv_building', file: 'fuji_tv_building.glb', trueHeightM: 123.0, face: 'north', stone: 0xb9bec4, ready: true }, // tier A, 203.0 x 77.5 m, 3037 / 759 tris; Tange megastructure, 200 x 62 m: the wide office tower and the media tower joined by three levels of twin sky corridors on a grid of megacolumns, the 32 m titanium sphere in the top bay, studio podium with the grand stair and tube escalator, roof mast
  // tokyo_metropolitan_police_hq: NOT BUILT
];
