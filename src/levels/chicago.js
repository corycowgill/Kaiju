// Chicago downtown level: the Loop, the river, Grant / Millennium Park and the
// lakefront, built from assets/levels/chicago_layout.json (game units, +X east,
// +Z south). Reuses Tokyo's systems through the kit city.js passes in
// (Building, instanced GLB buildings + LOD, debris, cars, pedestrians, props);
// everything Chicago-specific (roads from polylines, lake, river walk, the L,
// bascule bridges, landmark massing, props) lives here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isMobile } from '../quality.js';
import { loadFest, festBuildingGLBs, festClearFence, festCutRoads, festInside, festNoTree, buildFest } from './chicago_fest.js';

const LAYOUT_URL = './assets/levels/chicago_layout.json';
const SF_SITE_URL = './assets/levels/chicago_soldier_field_site.json';

/** site_dressing.json -> { lawns, gardens, plazas, northPlaza: [[x, z]...] polygons,
 *  parking [{ polygon, surface }], paths [{ points, width }], water } */
function _normalizeSite(S) {
  const polys = (a) => (a || []).map((p) => (p.polygon || []).map(_pt)).filter((p) => p.length >= 3);
  return {
    lawns: polys(S.lawns), gardens: polys(S.gardens), plazas: polys(S.plazas), water: polys(S.water),
    northPlaza: S.northPlaza ? S.northPlaza.polygon.map(_pt) : null,
    // Underground (layer -1) garages and multi-storey decks get no surface
    parking: (S.parking || []).map((p) => ({ polygon: p.polygon.map(_pt), surface: p.parking !== 'underground' && p.parking !== 'multi-storey' && String(p.layer) !== '-1' }))
      .filter((p) => p.polygon.length >= 3),
    paths: (S.paths || []).map((q) => ({ points: q.points.map(_pt), width: +(q.width || 1) })).filter((q) => q.points.length >= 2),
  };
}
let _layout = null;

/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadChicagoLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`chicago layout: HTTP ${r.status}`);
  _layout = _normalizeLayout(await r.json());
  // Optional Soldier Field site polygons (cartographer); the level builds without them
  try {
    const sr = await fetch(SF_SITE_URL, { cache: 'no-cache' });
    if (sr.ok) _layout.sfSite = _normalizeSite(await sr.json());
  } catch (e) { /* no site dressing */ }
  // Kaijupalooza! in Grant Park (see festEnabled for the default)
  _layout.fest = await loadFest();
  return _layout;
}

// --------------- GLB assets (artist manifest) ---------------
// Mirrors SP/glb/manifest.json: id, file, trueHeightM, kind. Set ready: true
// only once the file is in assets/ and has passed preview, so missing files
// never 404; unready landmarks are built from the procedural massing below.
const CHI_BASE = './assets/buildings/chicago/';
// ids: the layout landmark ids the file stands in for (one model, several
// sites). trueHeightM is the model's bbox height incl. spires; the layout
// height is the roof, so the model is scaled by layoutH / heightMetres.
// clone: placed as its own scene graph (not instanced) so a node can animate.
// face: the world direction of the model's front (+Z, from the manifest's
// frontAxis). The layout rot comes from OSM outlines and is ambiguous by
// quarter turns, so the placement picks rot + k*90deg facing that way.
// pair: a second, mirrored copy this many units south facing the first.
// Rear blocks behind a front-only landmark GLB (fitted to the rest of the
// site, front = +Z toward the main model). pending until delivered: the
// procedural rear builder stands in.
const CHICAGO_REAR_GLBS = {
  // TRELLIS: 34.6 x 34.5 x 101 m, +Z north (toward the tower); uniform:
  // scaled to its height and centred in the annex site, no fit / stretch
  cbot_annex: { file: 'cbot_annex.glb', uniform: true, ready: true },
  // TRELLIS: +Z is the Modern Wing glass face and bridge, toward Millennium Park (north)
  art_institute_rear: { file: 'art_institute_rear.glb', face: 'north', ready: true },
};
const CHICAGO_LANDMARK_GLBS = [
  { id: 'willis_tower', file: 'willis_tower.glb', trueHeightM: 527.3, face: 'east', ready: true },
  { id: 'tower_401_n_wabash', file: 'tower_401_n_wabash.glb', trueHeightM: 423, face: 'south', ready: true },
  { id: 'st_regis', file: 'st_regis.glb', trueHeightM: 363, face: 'south', ready: true },
  { id: 'aon_center', file: 'aon_center.glb', trueHeightM: 347, face: 'east', ready: true },
  { id: 'two_prudential', file: 'two_prudential.glb', trueHeightM: 303, face: 'south', ready: true },
  { id: 'chase_tower', file: 'chase_tower.glb', trueHeightM: 262.6, face: 'east', ready: true },
  { id: 'aqua', file: 'aqua.glb', trueHeightM: 262, face: 'south', ready: true },
  { id: 'crain_150_n_michigan', file: 'crain_150_n_michigan.glb', trueHeightM: 177.6, face: 'west', ready: true },
  { id: 'marina_city', ids: ['marina_city_1', 'marina_city_2'], file: 'marina_city.glb', trueHeightM: 179, ready: true },
  { id: 'navy_pier_wheel', file: 'navy_pier_wheel.glb', trueHeightM: 59.3, clone: 'wheel_rotor', ready: true },
  { id: 'franklin_center', file: 'franklin_center.glb', trueHeightM: 307, face: 'south', ready: true },
  { id: 'wacker_311_s', file: 'wacker_311_s.glb', trueHeightM: 293, face: 'east', ready: true },
  { id: 'one_prudential', file: 'one_prudential.glb', trueHeightM: 278, face: 'south', ready: true },
  // Footprint says its long side runs N-S, so no face override
  { id: 'ama_plaza_330_n_wabash', file: 'ama_plaza_330_n_wabash.glb', trueHeightM: 212, ready: true },
  { id: 'daley_center', file: 'daley_center.glb', trueHeightM: 198, face: 'south', ready: true },
  { id: 'lake_point_tower', file: 'lake_point_tower.glb', trueHeightM: 197, face: 'south', ready: true },
  { id: 'carbide_carbon', file: 'carbide_carbon.glb', trueHeightM: 154, face: 'west', ready: true },
  { id: 'merchandise_mart', file: 'merchandise_mart.glb', trueHeightM: 103, face: 'south', ready: true },
  { id: 'union_station', file: 'union_station.glb', trueHeightM: 38.6, face: 'east', ready: true },
  // v2 at true size (136 x 162 x 25 m, glass oceanarium roof): portico +Z
  // west toward the Field Museum, oceanarium (-Z) on the lake
  { id: 'shedd_aquarium', file: 'shedd_aquarium.glb', trueHeightM: 25, face: 'west', ready: true },
  // v2 at true size (50 x 50 x 20 m): entrance stair (+Z) west toward the city
  { id: 'adler_planetarium', file: 'adler_planetarium.glb', trueHeightM: 20, face: 'west', ready: true },
  // The Beaux-Arts front block only (lions, +Z on Michigan Ave): placed at the
  // Michigan edge of the 246 m site, the procedural galleries and Modern
  // Wing (rear) fill the rest
  { id: 'art_institute', file: 'art_institute.glb', trueHeightM: 20, face: 'west', fit: 'footprint', maxH: 2.0, front: true, rearGLB: 'art_institute_rear', ready: true },
  // Scaled up to its site (the 180 x 146 m model vs the 348 x 208 m
  // layout outline, height up to 1.4x); colonnade sides (+Z) east and west,
  // open ends north-south
  // Hero v2 (301 x 215 m, rims 60 m, west canopy truss to 72.35 m = its
  // bbox height): exact map scale, origin = shell centre on the layout shell
  // centre, model +X = south / +Z = west matching the layout rot (no face).
  // Phones get the artist's 9.8k-tri soldier_field_mobile.glb as the
  // assets/m/ variant (pinned in make_mobile_assets), with its own LOD1
  { id: 'soldier_field', file: 'soldier_field.glb', trueHeightM: 72.35, exact: true, atOrigin: true, ready: true },
  // Portico (+Z) and grand steps face north
  { id: 'field_museum', file: 'field_museum.glb', trueHeightM: 30, face: 'north', ready: true },
  // Only the 1930 tower (57 x 60 m, statue at 184 m), clock face (+Z) north up
  // LaSalle; the layout outline includes the 1980 annex, built procedurally behind
  { id: 'board_of_trade', file: 'board_of_trade.glb', trueHeightM: 184, face: 'north', front: true, maxH: 1.0, frontDepthM: 60, rear: 'cbot_annex', rearGLB: 'cbot_annex', rearH: 0.55, ready: true },
  // Fountain at true size; the level adds the 85 m pool and the jets
  { id: 'buckingham_fountain', file: 'buckingham_fountain.glb', trueHeightM: 7.6, fountain: true, ready: true },
  // Gable end (+Z) on State St (east); lattice windows get a dark glass core
  { id: 'harold_washington_library', file: 'harold_washington_library.glb', trueHeightM: 70, face: 'east', fit: 'footprint', maxH: 1.0, core: true, ready: true },
  // Blender fallback: shell + trellis (+Z) over the Great Lawn (east). The
  // layout spot is the shell, so the model shifts that many metres along +Z
  { id: 'pritzker_pavilion', file: 'pritzker_pavilion.glb', trueHeightM: 41, face: 'east', shiftM: 24, ready: true },
  // State St facade (+Z); its marquee/blade are unlit, the CHICAGO sign overlay is fitted to it
  { id: 'chicago_theatre', file: 'chicago_theatre.glb', trueHeightM: 25, face: 'west', fit: 'footprint', maxH: 1.3, ready: true },
  // Entrance (+Z) on Michigan Ave
  // 333 S Wabash, the red one: Wabash side (+Z) west, long side along X.
  // (pending: true marks an entry whose GLB isn't delivered; smoke_test
  // lists those instead of failing on their procedural stand-in)
  { id: 'cna_center_333_s_wabash', file: 'cna_center_333_s_wabash.glb', trueHeightM: 183, face: 'west', ready: true },
  { id: 'tribune_tower', file: 'tribune_tower.glb', trueHeightM: 141, face: 'west', ready: true },
  // Long axis X fits the layout outline (E-W); +Z, both blocks and the
  // skybridge, faces the river
  { id: 'wrigley_building', file: 'wrigley_building.glb', trueHeightM: 134, ready: true },
  { id: 'cultural_center', file: 'cultural_center.glb', trueHeightM: 35.5, ready: true },
  { id: 'rookery', file: 'rookery.glb', trueHeightM: 59, ready: true },
  // The pier deck and halls run along glTF X, east end at +X
  { id: 'navy_pier_festival_hall', file: 'navy_pier_festival_hall.glb', trueHeightM: 41, faceX: 'east', ready: true },
  // Chrome: needs scene.environment (desktop HIGH); duller steel elsewhere
  { id: 'mirrored_sculpture', file: 'mirrored_sculpture.glb', trueHeightM: 10.4, chrome: true, ready: true },
  // One glass tower; its twin stands 70 m south, the two screens facing
  { id: 'crown_fountain', file: 'crown_fountain.glb', trueHeightM: 15.2, face: 'south', pair: 14, ready: true },
];
// Generic downtown blocks, picked by height bucket like Tokyo's pools.
// share: fraction of that bucket's blocks that use it (the rest stay boxes),
// so one model doesn't repeat on every block.
// Buckets match the manifest's heightBucket: short < 18u (90 m), medium
// 18-40u, tall above.
const CHICAGO_GENERIC_GLBS = [
  // gen_low2_*: the 'low' bucket (blocks under 7u), +Z street face. Downtown
  // commercial types only: no greystones, walk-ups or courtyard flats in the Loop
  { file: 'gen_low2_brick_shop.glb', bucket: 'low', ready: true },
  { file: 'gen_low2_terracotta_comm.glb', bucket: 'low', ready: true },
  { file: 'gen_low2_warehouse.glb', bucket: 'low', share: 0.6, ready: true },
  { file: 'gen_low2_modern_mid.glb', bucket: 'low', ready: true },
  // TRELLIS downtown commercial low-rise (artist-3d / cloud-3d). maxH (u):
  // only on blocks up to that height (a 5 m strip scaled up to a 30 m block
  // reads as a giant)
  { file: 'gen_low2_bank.glb', bucket: 'low', ready: true },
  { file: 'gen_low2_loft.glb', bucket: 'low', ready: true },
  { file: 'gen_low2_garage_retail.glb', bucket: 'low', maxH: 4, ready: true },
  { file: 'gen_low2_retail_strip.glb', bucket: 'low', maxH: 3, share: 2, ready: true }, // weighted up: only ~40 blocks are low enough
  { file: 'gen_low_brick_loft.glb', bucket: 'short', ready: true },
  { file: 'gen_low_limestone_block.glb', bucket: 'short', ready: true },
  { file: 'gen_low_terracotta_office.glb', bucket: 'short', ready: true },
  { file: 'gen_short_brick_hotel.glb', bucket: 'short', ready: true },
  { file: 'parking_deck.glb', bucket: 'short', share: 0.4, ready: true },
  { file: 'gen_mid_deco_setback.glb', bucket: 'medium', ready: true },
  { file: 'gen_mid_mies_box.glb', bucket: 'medium', ready: true },
  { file: 'gen_mid_glass_condo.glb', bucket: 'medium', ready: true },
  { file: 'gen_tall_pomo_granite.glb', bucket: 'tall', ready: true },
  { file: 'gen_tall_glass_office.glb', bucket: 'tall', ready: true },
  { file: 'gen_tall_concrete_resi.glb', bucket: 'tall', ready: true },
];
// Street props: name -> file (same folder as the buildings).
const CHI_PROP_BASE = CHI_BASE;
const CHICAGO_PROP_GLBS = [
  { name: 'chi_streetlamp', file: 'chicago_streetlamp.glb', ready: true },
  { name: 'chi_bus_shelter', file: 'cta_bus_shelter.glb', ready: true },
  // US mast-arm signal: origin at the pole base, lenses face +Z, arm along +X
  { name: 'chi_traffic_signal', file: 'traffic_signal.glb', ready: true },
  { name: 'chi_hot_dog_cart', file: 'hot_dog_cart.glb', ready: true },
];
// Extra traffic (front faces +Z, real-world metres like the Tokyo vehicles).
const CHICAGO_VEHICLE_GLBS = [
  // cloud-3d: 12.05 m along Z, front +Z, wheels on y = 0. albedo 0.69: its
  // white body (a quarter of the texture) sat over the noon bloom threshold;
  // pure white now lands at sRGB 0xd8
  { url: CHI_BASE + 'cta_bus.glb', len: 12.05, weight: 8, parked: false, albedo: 0.69, ready: true },
  { url: CHI_BASE + 'chicago_taxi.glb', len: 4.92, weight: 18, ready: true },
  // v2 has its own lightbar_red/_blue lens materials, which Car flashes
  // (lightBar adds a procedural bar only if a model has none)
  { url: CHI_BASE + 'police_suv.glb', len: 5.14, weight: 6, lightBar: true, ready: true },
  { url: CHI_BASE + 'sedan_red.glb', len: 4.82, weight: 14, ready: true },
  { url: CHI_BASE + 'sedan_blue.glb', len: 4.82, weight: 12, ready: true },
  { url: CHI_BASE + 'sedan_silver.glb', len: 4.82, weight: 12, ready: true },
];
// Kit pieces placed many times: the generic bascule bridge (scaled to each
// bridges[] entry, spans along its local X) and the L track segment (tiled
// along elevatedRail; length along local `axis`, `len` metres).
const CHICAGO_KIT_GLBS = {
  bascule_bridge: { file: 'bascule_bridge.glb', ready: true },
  l_track_segment: { file: 'l_track_segment.glb', axis: 'x', len: 40, ready: true },
  // 90-degree left curve from the origin heading +X to (30, 0, -30) heading -Z
  l_track_curve: { file: 'l_track_curve.glb', radius: 30, ready: true },
  // One car along glTF X, base at rail top; coupled every 14.9 m
  l_train: { file: 'l_train.glb', ready: true },
  // River boats (cloud-3d): bow +Z, y = 0 at the keel (sink ~1.1 m)
  tour_boat: { file: 'tour_boat.glb', len: 25, sinkM: 1.0, ready: true },
  water_taxi: { file: 'water_taxi.glb', len: 15, sinkM: 1.1, ready: true },
  // Hero Michigan Ave bridge, same node scheme as bascule_bridge
  dusable_bridge: { file: 'dusable_bridge.glb', ready: true },
  // Station: spans x = -60..60 m at the track's deck height (replaces 3 segments)
  l_station: { file: 'l_station.glb', len: 120, ready: true },
  // Riverwalk tile: 12 m along X, +Z = river side, y = 0 waterline, street at 6 m
  riverwalk: { file: 'riverwalk.glb', len: 12, street: 6, ready: true },
  // Street furniture placed in bulk (metres; scaled by FURNITURE_UPM)
  sailboat_moored: { file: 'sailboat_moored.glb', ready: true },
  planter_bollard: { file: 'planter_bollard.glb', ready: true },
  // Soldier Field north wing wall: 105 x 10 x 20 m limestone, length along X
  soldier_field_wing: { file: 'soldier_field_wing.glb', ready: true },
  // desktopOnly: phones neither download nor place them (draw budget)
  lakefront_trail_bench: { file: 'lakefront_trail_bench.glb', desktopOnly: true, ready: true },
  newspaper_box_cluster: { file: 'newspaper_box_cluster.glb', desktopOnly: true, ready: true },
  // Divvy-style dock: 12.5 m row along X, bikes face +Z, kiosk at +X
  bike_share_rack: { file: 'bike_share_rack.glb', ready: true },
};
const _kit = (id) => (CHICAGO_KIT_GLBS[id]?.ready ? CHI_BASE + CHICAGO_KIT_GLBS[id].file : null);

// Tokyo generic towers used while (or where) no Chicago block GLB is ready:
// plain glass/concrete towers only (the shopping blocks and narrow towers
// carry Japanese billboards). An empty bucket builds Chicago-coloured boxes.
const TOKYO_GENERIC = {
  tall: ['skyscraper_large_1', 'skyscraper_large_2', 'skyscraper_large_3'],
  medium: ['skyscraper_medium_1', 'skyscraper_medium_2', 'condo_1', 'condo_2'],
  short: [],
  low: [],
};

// Front (+Z) direction of the procedural massing, where it matters
const PROC_FACE = { chicago_theatre: 'west' }; // faces State St
const _landmarkGLB = (id) => CHICAGO_LANDMARK_GLBS.find((g) => g.ready && (g.ids ? g.ids.includes(id) : g.id === id));
// desktopOnly on a generic entry: phones skip that template (the phone
// draw budget caps how many kit types a bucket can use; never boxes)
const _genericOK = (g) => g.ready && !(isMobile && g.desktopOnly);
function _pool(bucket) {
  bucket = _ownBucket(bucket);
  const own = CHICAGO_GENERIC_GLBS.filter((g) => _genericOK(g) && g.bucket === bucket).map((g) => CHI_BASE + g.file);
  return own.length ? own : TOKYO_GENERIC[bucket].map((n) => `./assets/buildings/${n}.glb`);
}
/** One url from the bucket's pool, weighted by share (default 1), avoiding
 *  `avoid` (the models already standing in the neighbouring cells). */
function _pickGeneric(bucket, avoid, h = 0) {
  bucket = _ownBucket(bucket);
  const all = CHICAGO_GENERIC_GLBS.filter((g) => _genericOK(g) && g.bucket === bucket);
  const fit = all.filter((g) => !g.maxH || h <= g.maxH);
  const own = fit.length ? fit : all;
  if (!own.length) { const p = _pool(bucket); return p[Math.floor(Math.random() * p.length)]; }
  const ok = avoid ? own.filter((g) => !avoid.has(CHI_BASE + g.file)) : own;
  const list = ok.length ? ok : own;
  let r = Math.random() * list.reduce((a, g) => a + (g.share ?? 1), 0);
  for (const g of list) { r -= g.share ?? 1; if (r < 0) return CHI_BASE + g.file; }
  return CHI_BASE + list[list.length - 1].file;
}
// Layout buildings tiled with a specific kit model: a uniform-scale nx x nz
// grid of copies (each fitted to its cell, stretch <= 1.3) at the model's
// true height. The Waldron Parking Deck (169 x 165 m) south of Soldier
// Field from the 76 x 40 x 20 m parking deck.
const GENERIC_TILES = {
  b507: { file: 'parking_deck.glb', nx: 2, nz: 4, hM: 20.3 },
  // Soldier Field's north wing walls (one wall model, length along X)
  b_soldier_field_wing_nw: { file: 'soldier_field_wing.glb', nx: 1, nz: 1, hM: 20 },
  b_soldier_field_wing_ne: { file: 'soldier_field_wing.glb', nx: 1, nz: 1, hM: 20 },
};
// Every block gets a kit GLB: 'low' (< 7u, the gen_low2_* kit) borrows the
// short kit until its own pieces are ready
const _bucket = (h) => (h >= 40 ? 'tall' : h >= 18 ? 'medium' : h >= 7 ? 'short' : 'low');
const _ownBucket = (bucket) => (bucket === 'low' && !CHICAGO_GENERIC_GLBS.some((g) => _genericOK(g) && g.bucket === 'low') ? 'short' : bucket);
const DIRS = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };
/** rot + k*90deg whose local +Z (sin r, cos r) points closest to `face`
 *  (or whose local +X (cos r, -sin r) does, for faceX). */
function _faceRot(rot, face, alongX = false) {
  const d = DIRS[face];
  if (!d) return rot;
  let best = rot, bd = -2;
  for (let k = 0; k < 4; k++) {
    const r = rot + k * Math.PI / 2;
    const v = alongX ? [Math.cos(r), -Math.sin(r)] : [Math.sin(r), Math.cos(r)];
    const dot = v[0] * d[0] + v[1] * d[1];
    if (dot > bd) { bd = dot; best = r; }
  }
  return best;
}

/** Building GLB urls the Chicago level loads. */
export function chicagoBuildingGLBs() {
  return [
    ...CHICAGO_LANDMARK_GLBS.filter((g) => g.ready).map((g) => CHI_BASE + g.file),
    ...Object.keys(CHICAGO_KIT_GLBS).filter((id) => !(isMobile && CHICAGO_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ...Object.values(CHICAGO_REAR_GLBS).filter((g) => g.ready).map((g) => CHI_BASE + g.file),
    ..._pool('tall'), ..._pool('medium'), ..._pool('short'), ..._pool('low'),
    ...festBuildingGLBs(),
  ];
}
/** GLB urls with a <name>_lod1.glb twin on disk (every ready landmark/kit file). */
export function chicagoLod1GLBs() {
  return [...CHICAGO_LANDMARK_GLBS.filter((g) => g.ready && g.lod1 !== false).map((g) => CHI_BASE + g.file),
    ...Object.keys(CHICAGO_KIT_GLBS).filter((id) => !(isMobile && CHICAGO_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ...CHICAGO_PROP_GLBS.filter((p) => p.ready).map((p) => CHI_PROP_BASE + p.file),
    ...CHICAGO_GENERIC_GLBS.filter(_genericOK).map((g) => CHI_BASE + g.file),
    ...CHICAGO_VEHICLE_GLBS.filter((v) => v.ready).map((v) => v.url), ...festBuildingGLBs()];
}

/** Chicago-only street props as [{ name, url }]. */
export function chicagoPropGLBs() {
  return CHICAGO_PROP_GLBS.filter((p) => p.ready).map((p) => ({ name: p.name, url: CHI_PROP_BASE + p.file }));
}
/** Chicago-only vehicle defs for loadCarTemplates. */
export function chicagoVehicleGLBs() {
  return CHICAGO_VEHICLE_GLBS.filter((v) => v.ready).map((v) => ({ ...v, levels: ['chicago'] }));
}

// --------------- layout normalisation ---------------
const _pt = (p) => (Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.z]);
/** Footprint polygon or rect -> axis-aligned { x, z, w, d, rotY }. */
function _rect(o) {
  if (o.footprint && Array.isArray(o.footprint) && o.footprint.length >= 3 && o.w === undefined) {
    const pts = o.footprint.map(_pt);
    // Oriented box from the longest edge; w/d along that edge
    let best = 0, ang = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) {
      const u = x * c - z * s, v = x * s + z * c;
      x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v);
    }
    const cu = (x0 + x1) / 2, cv = (z0 + z1) / 2;
    const ci = Math.cos(ang), si = Math.sin(ang);
    return { x: cu * ci - cv * si, z: cu * si + cv * ci, w: x1 - x0, d: z1 - z0, rotY: -ang };
  }
  const f = o.footprint && !Array.isArray(o.footprint) ? o.footprint : o;
  return { x: +(f.x ?? o.x), z: +(f.z ?? o.z), w: +(f.w ?? f.width ?? 10), d: +(f.d ?? f.depth ?? 10), rotY: +(o.rotY ?? f.rotY ?? 0) };
}

// Landmark entries that are asset-kit pieces (tiled / instanced elsewhere), not
// single placed landmarks: the L track and stations, generic bridges, riverwalk.
// art_institute_lions: the art_institute GLB carries its own lions on the steps
const KIT_IDS = new Set(['bascule_bridge', 'l_track_segment', 'l_track_curve', 'l_station', 'riverwalk', 'dusable_bridge', 'art_institute_lions']);

/** Accepts the cartographer's schema (meta, water[], roadGraph, cx/cz/rot
 *  buildings, spawn.player) and the older dev placeholder. */
function _normalizeLayout(L) {
  const out = {};
  // Real-scale map (0.2 u/m): street furniture and sidewalks shrink to match
  out.scale = L.meta?.scale || L.unitsPerMeter || 0;
  out.real = out.scale > 0 && out.scale < 0.5 && !L.devPlaceholder;
  const b = L.bounds || {};
  out.bounds = { minX: +b.minX, maxX: +b.maxX, minZ: +b.minZ, maxZ: +b.maxZ };
  const sp = L.spawn?.player || L.spawn || { x: 0, z: 0 };
  out.spawn = Array.isArray(sp) ? { x: sp[0], z: sp[1] } : { x: +sp.x, z: +sp.z, rot: sp.rot !== undefined ? +sp.rot : undefined };
  out.enemySpawns = (L.spawn?.enemies || []).map((e) => [+e.x, +e.z]);
  const kindOf = (r) => r.kind || (r.class === 'lsd' ? 'lsd' : r.class === 'minor' ? 'minor' : r.class === 'major' ? 'major' : 'street');
  // Gameplay widths: true-scale streets are only ~1.5 Tokyo cars wide, so
  // real-scale maps get minimum widths per class (landmarks stay exact;
  // ordinary buildings are trimmed back from the wider roads below)
  const minW = (cls) => (out.real ? (cls === 'lsd' ? 12 : cls === 'minor' ? 6 : 8.5) : 0);
  out.roads = (L.roads || []).map((r) => ({
    id: r.id, name: r.name || '', kind: kindOf(r), expressway: !!r.expressway,
    width: Math.max(minW(r.class), +(r.width || (r.kind === 'lsd' ? 16 : r.kind === 'arterial' ? 12 : r.kind === 'alley' ? 4 : 9))),
    points: (r.points || r.polyline || []).map(_pt),
  })).filter((r) => r.points.length >= 2);
  // Car network: the explicit road graph when there is one. Minor roads are
  // left out, and so are expressways: planar noding makes false junctions
  // where they fly over the street grid.
  const expressway = new Set(out.roads.filter((r) => r.expressway).map((r) => r.id));
  out.netRoads = L.roadGraph
    ? L.roadGraph.edges.filter((e) => e.class !== 'minor' && !expressway.has(e.road))
      .map((e) => ({ width: Math.max(minW(e.class), +e.width), points: e.points.map(_pt) }))
    : out.roads.filter((r) => r.kind !== 'alley');
  const W = L.water || {};
  const waters = Array.isArray(W) ? W : [
    ...(W.lake || L.lake ? [{ kind: 'lake', polygon: (W.lake || L.lake).polygon || W.lake || L.lake }] : []),
    ...[].concat(W.river || W.rivers || L.river || []).filter((r) => r.polygon).map((r) => ({ kind: 'river', polygon: r.polygon })),
  ];
  out.water = waters.map((w) => ({ id: w.id, kind: w.kind || 'lake', polygon: (w.polygon || []).map(_pt), holes: (w.holes || []).map((h) => h.map(_pt)) }))
    .filter((w) => w.polygon.length >= 3);
  const rivers = L.riverCenterlines || [].concat(Array.isArray(W) ? [] : (W.river || W.rivers || L.river || []));
  out.rivers = rivers.map((r) => ({
    width: +(r.width || 20),
    points: (r.centerline || r.points || []).map(_pt),
    polygon: r.polygon ? r.polygon.map(_pt) : null,
  })).filter((r) => r.points.length >= 2);
  out.riverwalk = (L.riverwalk || []).map((r) => ({ width: +(r.width || 2.4), points: r.points.map(_pt) })).filter((r) => r.points.length >= 2);
  out.parks = (L.parks || []).map((p) => ({
    id: p.id, name: p.name || '', kind: p.kind || 'park', surface: p.surface || '', fill: p.src === 'landuse_fill',
    polygon: (p.polygon || p.points || []).map(_pt),
    paths: (p.paths || []).map((q) => ({ width: +(q.width || 2.4), points: (q.points || q).map(_pt) })),
  })).filter((p) => p.polygon.length >= 3);
  // Standalone footpaths (cartographer's landuse fill: Lakefront Trail, harbour edge)
  out.paths = (L.paths || []).map((q) => ({ width: +(q.width || 1), points: (q.points || []).map(_pt) })).filter((q) => q.points.length >= 2);
  out.rail = [].concat(L.elevatedRail || L.rail || []).map((r) => ({
    // Real-scale L decks raised to 3.2u so a bus (~2.6u) clears them
    id: r.id, name: r.name || '', closed: !!r.closed, height: Math.max(out.real ? 3.2 : 0, +(r.height || 5.5)), width: +(r.width || 6.4),
    points: (r.points || r.polyline || []).map(_pt),
  })).filter((r) => r.points.length >= 2);
  out.stations = (L.railStations || []).map((st) => ({ x: +st.x, z: +st.z, rotY: +(st.rot || 0), length: +(st.length || 20) }));
  // Bridge length runs along the local X axis of rot (same convention as building w)
  out.bridges = (L.bridges || []).map((g) => ({
    id: g.id, name: g.name || '', x: +(g.x ?? g.pos?.[0]), z: +(g.z ?? g.pos?.[1]),
    rotY: g.rot !== undefined ? +g.rot + Math.PI / 2 : +(g.rotY || 0),
    length: +(g.length || 30), carries: g.carries || 'road',
    width: Math.max(out.real && g.carries !== 'rail' ? 9.5 : 0, +(g.width || 12)),
  }));
  const lmIds = new Set((L.landmarks || []).map((l) => l.id));
  out.buildings = (L.buildings || [])
    .filter((o) => !(o.landmark && lmIds.has(o.landmark))) // the landmark itself stands there
    .map((o) => {
      const r = o.cx !== undefined ? { x: +o.cx, z: +o.cz, w: +o.w, d: +o.d, rotY: +(o.rot || 0) } : _rect(o);
      return { ...r, id: o.id, podiumOf: o.podiumOf || null, h: +(o.h ?? o.height ?? 12), style: o.style || null };
    })
    // Soldier Field's north wing walls need their own wall GLB (requested);
    // a generic block kit piece can't stand in for a 105 m x 10 m wall
    .filter((o) => !(o.podiumOf === 'soldier_field' && !_kit('soldier_field_wing')))
    .filter((o) => o.w > 0.5 && o.d > 0.5 && o.h > 0.5);
  if (out.real) _clearRoads(out.buildings, out.roads, 1.2 + 0.3);
  const dus = (L.landmarks || []).find((o) => o.id === 'dusable_bridge');
  out.dusable = dus ? [+dus.x, +dus.z] : null;
  out.landmarks = (L.landmarks || []).filter((o) => !KIT_IDS.has(o.id)).map((o) => ({
    ...(o.rot !== undefined ? { x: +o.x, z: +o.z, w: +o.w, d: +o.d, rotY: +o.rot } : _rect(o)),
    id: o.id, name: o.name || o.id, h: +(o.h ?? o.height ?? 30), hp: o.hp, kind: o.kind || 'building',
    heightM: o.heightMetres ? +o.heightMetres : 0,
  }));
  return out;
}

/** Trim (and nudge) building boxes back from the road ribbons: every road
 *  segment whose half width + `margin` reaches into a box pushes that face
 *  back; the box keeps at least 45% of each side. */
function _clearRoads(buildings, roads, margin) {
  const CELL = 24;
  const segs = new Map();
  for (const r of roads) {
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i], b = r.points[i + 1];
      const seg = { a, b, hw: r.width / 2 };
      const x0 = Math.floor((Math.min(a[0], b[0]) - 20) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + 20) / CELL);
      const z0 = Math.floor((Math.min(a[1], b[1]) - 20) / CELL), z1 = Math.floor((Math.max(a[1], b[1]) + 20) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cx + ':' + cz;
        if (!segs.has(k)) segs.set(k, []);
        segs.get(k).push(seg);
      }
    }
  }
  for (const o of buildings) {
    const w0 = o.w, d0 = o.d;
    const near = segs.get(Math.floor(o.x / CELL) + ':' + Math.floor(o.z / CELL)) || [];
    for (let pass = 0; pass < 2; pass++) {
      for (const sg of near) {
        const dx = sg.b[0] - sg.a[0], dz = sg.b[1] - sg.a[1], l = Math.hypot(dx, dz);
        if (l < 1e-3) continue;
        const ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
        // Box axes (local X -> (cos r, -sin r), local Z -> (sin r, cos r))
        const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
        const ax = [c, -s], az = [s, c];
        const ex = Math.abs(ax[0] * nx + ax[1] * nz) * o.w / 2 + Math.abs(az[0] * nx + az[1] * nz) * o.d / 2;
        const el = Math.abs(ax[0] * ux + ax[1] * uz) * o.w / 2 + Math.abs(az[0] * ux + az[1] * uz) * o.d / 2;
        const rx = o.x - sg.a[0], rz = o.z - sg.a[1];
        const t = rx * ux + rz * uz;
        if (t < -el || t > l + el) continue; // box lies beyond this segment's ends
        const dist = rx * nx + rz * nz;
        const over = sg.hw + margin - (Math.abs(dist) - ex);
        if (over <= 0 || over > ex * 2) continue; // clear, or the road runs through it (layout's call)
        // Move the face away: shift the centre by over/2, shorten the side
        // most aligned with the road normal by `over`
        const sgn = dist >= 0 ? 1 : -1;
        const alongX = Math.abs(ax[0] * nx + ax[1] * nz) >= Math.abs(az[0] * nx + az[1] * nz);
        const cur = alongX ? o.w : o.d, min = (alongX ? w0 : d0) * 0.45;
        const cut = Math.min(over, cur - min);
        if (cut <= 0) continue;
        if (alongX) o.w -= cut; else o.d -= cut;
        o.x += nx * sgn * cut / 2; o.z += nz * sgn * cut / 2;
      }
    }
  }
}

// --------------- geometry helpers ---------------
/** Ribbon along a polyline between lateral offsets o0..o1 (right of travel
 *  positive), top face up. UVs in world units * uvScale. */
function ribbon(points, o0, o1, y, uvScale = 1, closed = false) {
  const pts = closed ? [...points, points[0], points[1]] : points;
  const n = pts.length;
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    // Averaged (mitred) right vector at this vertex
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let rx = 0, rz = 0;
    for (const [p0, p1] of [[a, p], [p, b]]) {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) { rx += -dz / l; rz += dx / l; }
    }
    let rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    // Mitre length, capped so sharp corners don't spike
    if (i > 0 && i < n - 1) {
      const dx = b[0] - p[0], dz = b[1] - p[1];
      const l = Math.hypot(dx, dz) || 1;
      const cosHalf = Math.abs(rx * (-dz / l) + rz * (dx / l));
      rl = 1 / Math.max(0.5, cosHalf);
    } else rl = 1;
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0] + rx * o0 * rl, y, p[1] + rz * o0 * rl, p[0] + rx * o1 * rl, y, p[1] + rz * o1 * rl);
    uv.push(dist * uvScale, o0 * uvScale, dist * uvScale, o1 * uvScale);
    if (i > 0) {
      const v = i * 2;
      idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
    }
  }
  return _geom(pos, uv, idx);
}

function _geom(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Flat polygon at height y (world-unit UVs * uvScale). */
function polygonGeom(poly, y, uvScale = 1, holes = []) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * uvScale, p.getZ(i) * uvScale);
  return g;
}

/** Quad on the ground, centre (cx, cz), along unit (dx, dz): length l, width w. */
function quadAlong(pos, uv, idx, cx, cz, dx, dz, l, w, y) {
  const rx = -dz, rz = dx;
  const v = pos.length / 3;
  const hl = l / 2, hw = w / 2;
  for (const [a, b] of [[-hl, -hw], [-hl, hw], [hl, -hw], [hl, hw]]) {
    pos.push(cx + dx * a + rx * b, y, cz + dz * a + rz * b);
  }
  const u0 = Math.random() * 0.7, v0 = Math.random() * 0.7;
  uv.push(u0, v0, u0 + 0.2, v0, u0, v0 + 0.2, u0 + 0.2, v0 + 0.2);
  idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Accumulates transformed primitive geometries per material and merges them
 *  into one mesh per material (a landmark costs one draw per material). */
class Massing {
  constructor() { this.parts = new Map(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); }
  add(mat, geom, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this._q.setFromEuler(this._e.set(rx, ry, rz));
    geom.applyMatrix4(this._m.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(sx, sy, sz)));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(geom);
    return this;
  }
  /** Box standing on y (its base), centred on x/z. */
  box(mat, w, h, d, x = 0, y = 0, z = 0, ry = 0) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry); }
  cyl(mat, rt, rb, h, seg, x = 0, y = 0, z = 0, ry = 0) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y + h / 2, z, ry); }
  build(castShadow = true) {
    const g = new THREE.Group();
    for (const [mat, list] of this.parts) {
      // Every primitive used here is indexed with position/normal/uv
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const q of list) q.dispose();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = castShadow; m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }
}

// Mottled summer-lawn texture (canvas, built once): deep greens with mowing
// stripes and darker clumps, tiled every 14u
let _grass = null;
function _grassTex() {
  if (_grass) return _grass;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const stripe = ((x >> 4) & 1) ? 0.06 : -0.02;
      const clump = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(y * 0.17) * 2.3) * Math.cos(y * 0.19 + x * 0.05);
      const n = Math.random() * 0.18 + stripe - (clump < 0.25 ? 0.12 : 0);
      const i = (y * S + x) * 4;
      img.data[i] = (52 + n * 120) | 0; img.data[i + 1] = (96 + n * 150) | 0; img.data[i + 2] = (40 + n * 80) | 0; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _grass = new THREE.CanvasTexture(c);
  _grass.wrapS = _grass.wrapT = THREE.RepeatWrapping;
  _grass.colorSpace = THREE.SRGBColorSpace;
  _grass.anisotropy = 4;
  return _grass;
}

// --------------- materials (shared by every rebuilt Chicago city) ---------------
let _M = null;
function mats() {
  if (_M) return _M;
  const std = (color, roughness = 0.8, metalness = 0.05, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _M = {
    limestone: std(0xcbbd9f, 0.85), brick: std(0x8c4f3c, 0.9), terracotta: std(0xe2d6c2, 0.7),
    darkGlass: std(0x1d242c, 0.25, 0.75), blueGlass: std(0x5f7f99, 0.2, 0.8), silverGlass: std(0x9aa8b4, 0.22, 0.85),
    blackSteel: std(0x17191c, 0.45, 0.6), steel: std(0x8a9096, 0.4, 0.7), white: std(0xcfcdc7, 0.7), // kept under the noon bloom threshold
    concrete: std(0xb3ada3, 0.9), bronze: std(0x6e5432, 0.5, 0.6), copper: std(0x5f9c86, 0.6, 0.4),
    chrome: std(0xd8dde2, 0.05, 1.0), red: std(0xb3262a, 0.6), green: std(0x3d7a35, 0.95),
    beacon: std(0xff3344, 0.5, 0, { emissive: 0xff3344, emissiveIntensity: 2.4 }),
    warmLit: std(0x443322, 0.5, 0, { emissive: 0xffcc88, emissiveIntensity: 1.6 }),
    marquee: std(0xaa2222, 0.5, 0, { emissive: 0xff5533, emissiveIntensity: 1.8 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1a5276, roughness: 0.08, metalness: 0.7, emissive: 0x0a2e42, emissiveIntensity: 0.25 }),
    lake: new THREE.MeshStandardMaterial({ color: 0x24607e, roughness: 0.1, metalness: 0.65, emissive: 0x0c3448, emissiveIntensity: 0.25 }),
    wall: std(0x6a6862, 0.9), path: std(0xb8ad92, 0.95),
    grass: std(0x7f9a6a, 0.95, 0, { map: _grassTex() }), lawn: std(0x8aa676, 0.95, 0, { map: _grassTex() }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xd9a820, emissiveIntensity: 0.3, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }),
    whiteLine: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }),
    curb: std(0x3a3a3c, 1.0), lot: std(0x6c6a66, 0.95),
    ballast: std(0x8a8072, 1.0), gravel: std(0x9a8f7c, 1.0), trackBed: std(0x4a4038, 1.0),
    trainBody: std(0xb9bec4, 0.35, 0.8), trainWin: std(0x223344, 0.3, 0.2, { emissive: 0xffe2aa, emissiveIntensity: 0.9 }),
    trainStripe: std(0x2a4a9a, 0.5, 0.3), railSteel: std(0x3d3226, 0.8, 0.5), deck: std(0x4a4038, 0.85, 0.4),
    bridgeRed: std(0x7a2a24, 0.7, 0.3), bridgeGrey: std(0x5c6066, 0.6, 0.5),
    hull: std(0xf0f0ee, 0.5), hullDark: std(0x24384e, 0.6), canvas: std(0x2b4f7a, 0.8),
    fountain: std(0xd8b7a6, 0.7), fountainWater: std(0x9fd4ea, 0.1, 0.3, { emissive: 0x6fb8d8, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }),
    glassShelter: std(0x9fc2cc, 0.1, 0.4, { transparent: true, opacity: 0.45 }),
    cartYellow: std(0xf0b81e, 0.6), umbrella: std(0xd23a2a, 0.8),
    seawall: std(0x9a958a, 0.9), sand: std(0xd8c79a, 1.0),
    roofCap: std(0x2e2c2a, 0.95), cornice: std(0xb8ae9c, 0.85),
  };
  for (const m of Object.values(_M)) m.userData.shared = true;
  return _M;
}

// Ground decal layers that overlap at (almost) the same height: a copy of
// the material pulled toward the camera by n depth units, so the upper
// layer wins without lifting it over the roads
const _decals = new Map();
function decal(mat, n) {
  const k = mat.uuid + '|' + n;
  if (!_decals.has(k)) {
    const m = mat.clone();
    m.polygonOffset = true; m.polygonOffsetFactor = 0; m.polygonOffsetUnits = -n;
    m.userData.shared = true;
    _decals.set(k, m);
  }
  return _decals.get(k);
}

/** Principal axis (unit [x, z]) of a polygon's vertices. */
function _axis(poly) {
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x; cz += z; }
  cx /= poly.length; cz /= poly.length;
  let a = 0, b = 0, c = 0;
  for (const [x, z] of poly) { a += (x - cx) ** 2; b += (x - cx) * (z - cz); c += (z - cz) ** 2; }
  const t = 0.5 * Math.atan2(2 * b, a - c);
  return [Math.cos(t), Math.sin(t)];
}

// Chicago facade palette for procedural blocks: limestone, brick, dark glass, art-deco
// Red brick, limestone, dark glass, terracotta and art-deco tan, with a
// little per-block jitter so neighbours never match exactly
const FACADE = [
  0x8c4f3c, 0x7a4636, 0x9b5a40, 0x6e3b2e,  // red / brown brick
  0xcbbd9f, 0xb9a98a, 0xd9cdb4,            // limestone
  0x2c333b, 0x3a4652, 0x252b33,            // dark glass / steel
  0xc98f6a, 0xd8a47f,                      // terracotta
  0xb79b6c, 0x9a8f80,                      // deco tan, grey granite
];
const _facade = () => new THREE.Color(FACADE[Math.floor(Math.random() * FACADE.length)]).offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06).getHex();
// Window palette (procedural blocks): warm office light, no synthwave neon
const CHI_WINDOWS = [
  // Unlit glass reads as blue-grey sky reflection against brick and stone
  { name: 'off',   color: 0x46576a, emissive: 0x0e141c, intensity: 1.0, weight: 0.40 },
  { name: 'warm',  color: 0x332818, emissive: 0xffc070, intensity: 1.6, weight: 0.22 },
  { name: 'white', color: 0x2a2a28, emissive: 0xfff2dd, intensity: 1.4, weight: 0.18 },
  { name: 'cool',  color: 0x1c2630, emissive: 0xbfd8ff, intensity: 1.2, weight: 0.10 },
  { name: 'gold',  color: 0x3a2a14, emissive: 0xffaa44, intensity: 1.8, weight: 0.05 },
];

// --------------- procedural landmark massing ---------------
// Each builder returns a Group centred on (0, 0) with its base at y = 0,
// sized to h (tallest point) inside roughly w x d. Used when the landmark's
// GLB isn't ready, and on the procedural-only (phone LOW) path.
const LANDMARK_BUILDERS = {
  willis(h, w, d, M) {
    // 3x3 bundled tubes stepping down, black glass, twin antennas
    const m = new Massing();
    const roofH = h * 0.79;
    const tw = w / 3, td = d / 3;
    const hs = [[0.55, 0.79, 0.55], [0.82, 1.0, 0.82], [0.62, 1.0, 0.88]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      m.box(M.darkGlass, tw * 0.98, roofH * hs[i][j] / 1.0, td * 0.98, (i - 1) * tw, 0, (j - 1) * td);
    }
    m.cyl(M.blackSteel, 0.35, 0.5, h - roofH, 6, -tw * 0.3, roofH, 0);
    m.cyl(M.blackSteel, 0.35, 0.5, (h - roofH) * 0.9, 6, tw * 0.3, roofH, 0);
    m.add(M.beacon, new THREE.SphereGeometry(0.6, 6, 4), -tw * 0.3, h, 0);
    return m.build();
  },
  hancock(h, w, d, M) {
    // Tapered obelisk with X-braced faces (dark bands), two antennas
    const m = new Massing();
    const roofH = h * 0.75;
    m.add(M.blackSteel, new THREE.CylinderGeometry(Math.SQRT1_2 * w * 0.62, Math.SQRT1_2 * w, roofH, 4, 1), 0, roofH / 2, 0, Math.PI / 4, 0, 0, 1, 1, d / w);
    for (let k = 1; k < 5; k++) {
      const y = roofH * k / 5, s = 1 - 0.38 * (k / 5);
      m.box(M.steel, w * s * 1.02, 0.5, d * s * 1.02, 0, y, 0);
    }
    m.cyl(M.white, 0.35, 0.45, h - roofH, 6, -w * 0.18, roofH, 0);
    m.cyl(M.white, 0.35, 0.45, (h - roofH) * 0.95, 6, w * 0.18, roofH, 0);
    m.add(M.beacon, new THREE.SphereGeometry(0.5, 6, 4), -w * 0.18, h, 0);
    return m.build();
  },
  trump(h, w, d, M) {
    // Silver-glass setbacks and a spire
    const m = new Massing();
    const roofH = h * 0.85;
    const tiers = [[1.0, 0.45], [0.8, 0.75], [0.62, 1.0]];
    let y = 0;
    for (const [s, f] of tiers) {
      const th = roofH * f - y;
      m.box(M.silverGlass, w * s, th, d * s * 0.7, 0, y, 0);
      y += th;
    }
    m.cyl(M.steel, 0.25, 0.7, h - roofH, 8, 0, roofH, 0);
    return m.build();
  },
  aon(h, w, d, M) {
    const m = new Massing();
    m.box(M.white, w, h, d);
    for (let k = 0; k < 4; k++) m.box(M.concrete, w * 1.01, h, 0.4, 0, 0, (k - 1.5) * d * 0.25);
    return m.build();
  },
  st_regis(h, w, d, M) {
    // Three stacked, offset blue-glass frustums
    const m = new Massing();
    const seg = [[0.4, 1.0, 0], [0.32, 0.9, w * 0.08], [0.28, 0.7, -w * 0.05]];
    let y = 0;
    for (const [f, s, off] of seg) {
      const sh = h * f;
      m.add(M.blueGlass, new THREE.CylinderGeometry(w * s * 0.45, w * s * 0.55, sh, 8), off, y + sh / 2, 0, 0, 0, 0, 1, 1, d / w);
      y += sh;
    }
    return m.build();
  },
  marina_city(h, w, d, M) {
    // Twin corn-cob towers: scalloped cylinders with balcony rings
    const m = new Massing();
    const r = Math.min(w / 4.4, d / 2.2);
    for (const sx of [-1, 1]) {
      const x = sx * r * 1.15;
      m.add(M.concrete, new THREE.CylinderGeometry(r, r, h, 16, 1), x, h / 2, 0);
      for (let k = 1; k < 10; k++) m.add(M.white, new THREE.TorusGeometry(r * 1.02, r * 0.05, 3, 16), x, h * k / 10, 0, 0, Math.PI / 2);
    }
    return m.build();
  },
  wrigley(h, w, d, M) {
    const m = new Massing();
    m.box(M.terracotta, w, h * 0.45, d);
    m.box(M.terracotta, w * 0.45, h * 0.3, d * 0.45, -w * 0.2, h * 0.45, 0);
    m.box(M.terracotta, w * 0.32, h * 0.12, d * 0.32, -w * 0.2, h * 0.75, 0);
    m.add(M.warmLit, new THREE.BoxGeometry(w * 0.2, w * 0.2, d * 0.34), -w * 0.2, h * 0.68, 0);
    m.cyl(M.terracotta, 0.2, w * 0.14, h * 0.13, 8, -w * 0.2, h * 0.87, 0);
    return m.build();
  },
  tribune(h, w, d, M) {
    // Gothic shaft with a buttressed crown
    const m = new Massing();
    m.box(M.limestone, w, h * 0.78, d);
    m.add(M.limestone, new THREE.CylinderGeometry(w * 0.32, w * 0.4, h * 0.12, 8), 0, h * 0.84, 0, Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      m.add(M.limestone, new THREE.ConeGeometry(w * 0.06, h * 0.12, 4), Math.cos(a) * w * 0.38, h * 0.84, Math.sin(a) * w * 0.38);
    }
    m.add(M.limestone, new THREE.ConeGeometry(w * 0.2, h * 0.1, 8), 0, h * 0.95, 0);
    return m.build();
  },
  board_of_trade(h, w, d, M) {
    const m = new Massing();
    m.box(M.limestone, w, h * 0.55, d);
    m.box(M.limestone, w * 0.7, h * 0.3, d * 0.7, 0, h * 0.55, 0);
    m.add(M.copper, new THREE.ConeGeometry(w * 0.45, h * 0.1, 4), 0, h * 0.9, 0, Math.PI / 4);
    m.cyl(M.bronze, 0.3, 0.5, h * 0.05, 6, 0, h * 0.95, 0);
    return m.build();
  },
  merchandise_mart(h, w, d, M) {
    const m = new Massing();
    m.box(M.limestone, w, h * 0.72, d);
    m.box(M.limestone, w * 0.3, h * 0.28, d * 0.4, 0, h * 0.72, 0);
    for (const sx of [-1, 1]) m.box(M.limestone, w * 0.12, h * 0.12, d * 0.5, sx * w * 0.36, h * 0.72, 0);
    m.box(M.darkGlass, w * 1.005, h * 0.5, d * 1.005, 0, h * 0.1, 0);
    return m.build();
  },
  centennial_wheel(h, w, d, M) {
    // Navy Pier Ferris wheel: rim + spokes + gondolas on an A-frame. The
    // wheel part spins (userData.spin, driven by the level animator).
    const g = new THREE.Group();
    const R = h * 0.46;
    const hub = h - R - 0.4;
    const frame = new Massing();
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const len = Math.hypot(R * 0.55, hub);
      frame.add(M.steel, new THREE.CylinderGeometry(0.35, 0.5, len, 6), sx * R * 0.275, hub / 2, sz * d * 0.18, 0, 0, sx * Math.atan2(R * 0.55, hub));
    }
    g.add(frame.build());
    const wheel = new Massing();
    wheel.add(M.white, new THREE.TorusGeometry(R, 0.35, 6, 40), 0, 0, 0);
    wheel.add(M.white, new THREE.TorusGeometry(R * 0.96, 0.18, 4, 40), 0, 0, 0, 0, 0, 0, 1, 1, 1);
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      wheel.add(M.steel, new THREE.BoxGeometry(0.12, R, 0.12), Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a - Math.PI / 2);
    }
    const spin = wheel.build();
    spin.position.y = hub;
    const gondolas = new Massing();
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      gondolas.add(M.red, new THREE.BoxGeometry(1.2, 1.4, 1.6), Math.cos(a) * R, Math.sin(a) * R - 0.9, 0);
    }
    spin.add(gondolas.build());
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, d * 0.4, 10).rotateX(Math.PI / 2), M.steel));
    g.add(spin);
    g.userData.spin = spin;
    return g;
  },
  soldier_field(h, w, d, M) {
    // Oval bowl (modern glass/steel insert) inside the classical colonnades
    const m = new Massing();
    const rx = w / 2, rz = d / 2;
    m.add(M.green, new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), 0, 0.15, 0, 0, 0, 0, rx * 0.55, 1, rz * 0.62);
    m.add(M.steel, new THREE.CylinderGeometry(1, 0.8, h * 0.8, 24, 1, true), 0, h * 0.4, 0, 0, 0, 0, rx * 0.9, 1, rz * 0.92);
    m.add(M.silverGlass, new THREE.CylinderGeometry(1.02, 1.0, h * 0.25, 24, 1, true), 0, h * 0.875, 0, 0, 0, 0, rx * 0.9, 1, rz * 0.92);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 9; k++) m.cyl(M.limestone, 0.7, 0.8, h * 0.55, 8, sx * rx * 0.97, 0, (k - 4) * rz * 0.18);
      m.box(M.limestone, 2.2, h * 0.08, rz * 1.7, sx * rx * 0.97, h * 0.55, 0);
    }
    return m.build();
  },
  field_museum(h, w, d, M) {
    const m = new Massing();
    m.box(M.white, w, h * 0.7, d * 0.8);
    m.box(M.white, w * 0.3, h * 0.25, d * 0.3, 0, h * 0.7, 0);
    for (let k = 0; k < 8; k++) m.cyl(M.white, 0.6, 0.6, h * 0.6, 8, (k - 3.5) * w * 0.06, 0, d * 0.45);
    m.box(M.white, w * 0.55, h * 0.1, 2, 0, h * 0.6, d * 0.46);
    m.box(M.concrete, w * 0.6, 0.8, 4, 0, 0, d * 0.5);
    return m.build();
  },
  shedd_aquarium(h, w, d, M) {
    const m = new Massing();
    m.add(M.white, new THREE.CylinderGeometry(w * 0.5, w * 0.5, h * 0.6, 8), 0, h * 0.3, 0, Math.PI / 8, 0, 0, 1, 1, d / w);
    m.add(M.white, new THREE.CylinderGeometry(w * 0.12, w * 0.2, h * 0.3, 8), 0, h * 0.75, 0, Math.PI / 8);
    m.add(M.white, new THREE.ConeGeometry(w * 0.14, h * 0.12, 8), 0, h * 0.94, 0);
    return m.build();
  },
  adler_planetarium(h, w, d, M) {
    const m = new Massing();
    m.add(M.brick, new THREE.CylinderGeometry(w * 0.45, w * 0.5, h * 0.55, 12), 0, h * 0.275, 0);
    m.add(M.copper, new THREE.SphereGeometry(w * 0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, h * 0.55, 0, 0, 0, 0, 1, (h * 0.45) / (w * 0.32), 1);
    return m.build();
  },
  buckingham_fountain(h, w, d, M) {
    const m = new Massing();
    m.cyl(M.fountain, w * 0.5, w * 0.5, 0.6, 24);
    m.cyl(M.fountain, w * 0.22, w * 0.26, h * 0.3, 16, 0, 0.6, 0);
    m.cyl(M.fountain, w * 0.14, w * 0.16, h * 0.25, 12, 0, 0.6 + h * 0.3, 0);
    m.cyl(M.fountain, w * 0.07, w * 0.08, h * 0.2, 10, 0, 0.6 + h * 0.55, 0);
    m.add(M.fountainWater, new THREE.CircleGeometry(w * 0.47, 24).rotateX(-Math.PI / 2), 0, 0.62, 0);
    m.add(M.fountainWater, new THREE.ConeGeometry(w * 0.06, h * 0.25, 8, 1, true), 0, h * 0.875, 0);
    return m.build(false);
  },
  cloud_gate(h, w, d, M) {
    const m = new Massing();
    m.add(M.chrome, new THREE.SphereGeometry(1, 20, 12), 0, h * 0.5, 0, 0, 0, 0, w / 2, h / 2, d / 2);
    return m.build();
  },
  pritzker_pavilion(h, w, d, M) {
    const m = new Massing();
    for (let k = 0; k < 6; k++) {
      const r = h * (0.35 + k * 0.08);
      m.add(M.steel, new THREE.TorusGeometry(r, 0.25, 4, 12, Math.PI * 0.7), (k - 2.5) * 1.2, 0, -d * 0.3, Math.PI / 2 + (k - 2.5) * 0.15, 0, Math.PI * 0.15);
    }
    m.box(M.concrete, w * 0.5, h * 0.25, d * 0.25, 0, 0, -d * 0.35);
    // Trellis over the lawn
    for (let k = -2; k <= 2; k++) m.box(M.steel, 0.3, 0.3, d * 0.9, k * w * 0.2, h * 0.6, d * 0.05);
    return m.build();
  },
  art_institute(h, w, d, M) {
    // Beaux-Arts front block on Michigan Ave (local -X): rusticated base,
    // engaged columns, cornice + attic, a three-arch entrance pavilion with
    // a pediment, grand steps and the two lions. Behind it the lower
    // galleries, and the white Modern Wing (NE) under its floating
    // "flying carpet" canopy.
    const m = new Massing();
    const fw = w * 0.30, fd = d * 0.62, fx = -w / 2 + fw / 2; // front block
    m.box(M.concrete, fw, h * 0.22, fd, fx, 0, 0);                       // rusticated base
    m.box(M.limestone, fw * 0.96, h * 0.56, fd * 0.98, fx, h * 0.22, 0); // piano nobile
    m.box(M.limestone, fw * 1.04, h * 0.06, fd * 1.03, fx, h * 0.78, 0); // cornice
    m.box(M.terracotta, fw * 0.9, h * 0.14, fd * 0.94, fx, h * 0.84, 0); // attic
    // Engaged columns along the Michigan face
    const face = -w / 2 - 0.05;
    for (let k = 0; k < 14; k++) {
      const z = -fd * 0.46 + k * fd * 0.92 / 13;
      if (Math.abs(z) < fd * 0.16) continue; // pavilion in the middle
      m.cyl(M.white, 0.16, 0.18, h * 0.54, 6, face + 0.1, h * 0.23, z);
    }
    // Entrance pavilion: projecting bay, three dark arches, pediment
    const pw = fd * 0.32, px = face - 0.6;
    m.box(M.limestone, 1.4, h * 0.8, pw, px + 0.7, 0, 0);
    for (let k = -1; k <= 1; k++) {
      m.box(M.darkGlass, 0.12, h * 0.42, pw * 0.2, px - 0.02, h * 0.12, k * pw * 0.3);
      m.add(M.darkGlass, new THREE.CylinderGeometry(pw * 0.1, pw * 0.1, 0.12, 10, 1, false, 0, Math.PI), px - 0.02, h * 0.54, k * pw * 0.3, 0, 0, Math.PI / 2);
    }
    m.add(M.limestone, new THREE.CylinderGeometry(h * 0.16, h * 0.16, pw * 1.05, 3), px + 0.5, h * 0.86, 0, 0, Math.PI / 2, Math.PI / 2, 1.8, 1, 1);
    // Grand steps and the lions on their plinths
    for (let k = 0; k < 3; k++) m.box(M.concrete, 1.0 + k * 0.7, 0.12, pw * (1.3 - k * 0.1), face - 0.9 - k * 0.35, k * 0.12, 0);
    for (const sz of [-1, 1]) {
      m.box(M.limestone, 1.0, 0.55, 1.0, face - 2.6, 0, sz * pw * 0.75);
      m.box(M.bronze, 0.5, 0.45, 1.1, face - 2.6, 0.55, sz * pw * 0.75);
    }
    // Lower gallery wings behind
    m.box(M.limestone, w * 0.34, h * 0.6, d * 0.8, -w * 0.02, 0, -d * 0.05);
    m.box(M.terracotta, w * 0.30, h * 0.08, d * 0.76, -w * 0.02, h * 0.6, -d * 0.05);
    // Modern Wing: white flat-roofed block, glass ground floor, canopy on posts
    const mx = w * 0.3, mz = -d * 0.18;
    m.box(M.darkGlass, w * 0.36, h * 0.3, d * 0.5, mx, 0, mz);
    m.box(M.white, w * 0.36, h * 0.55, d * 0.5, mx, h * 0.3, mz);
    m.box(M.steel, w * 0.42, 0.08, d * 0.56, mx, h * 1.08, mz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(M.steel, 0.12, h * 0.23, 0.12, mx + sx * w * 0.2, h * 0.85, mz + sz * d * 0.27);
    return m.build();
  },
  cbot_annex(h, w, d, M) {
    // The 1980 Board of Trade annex: a glass-and-granite slab echoing the
    // tower's setbacks, with a stepped pyramidal crown (front = +Z, the tower)
    const m = new Massing();
    m.box(M.limestone, w * 0.9, h * 0.14, d * 0.9);
    m.box(M.blueGlass, w * 0.78, h * 0.62, d * 0.8, 0, h * 0.14, -d * 0.04);
    m.box(M.limestone, w * 0.6, h * 0.1, d * 0.62, 0, h * 0.76, -d * 0.04);
    m.add(M.blueGlass, new THREE.CylinderGeometry(0.2, w * 0.38, h * 0.14, 4), 0, h * 0.93, -d * 0.04, Math.PI / 4, 0, 0, 1, 1, d / w);
    return m.build();
  },
  art_institute_rear(h, w, d, M) {
    // What stands behind the GLB front block: the lower galleries and the
    // white Modern Wing under its floating canopy (front = +Z, toward the GLB)
    const m = new Massing();
    m.box(M.limestone, w * 0.55, h * 0.6, d * 0.7, -w * 0.18, 0, d * 0.1);
    m.box(M.terracotta, w * 0.5, h * 0.08, d * 0.66, -w * 0.18, h * 0.6, d * 0.1);
    const mx = w * 0.22, mz = -d * 0.12;
    m.box(M.darkGlass, w * 0.45, h * 0.3, d * 0.6, mx, 0, mz);
    m.box(M.white, w * 0.45, h * 0.55, d * 0.6, mx, h * 0.3, mz);
    m.box(M.steel, w * 0.52, 0.08, d * 0.66, mx, h * 1.08, mz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(M.steel, 0.12, h * 0.23, 0.12, mx + sx * w * 0.24, h * 0.85, mz + sz * d * 0.32);
    return m.build();
  },
  chicago_theatre(h, w, d, M) {
    // Terracotta front with the arch window; the blade sign and lit marquee
    // are added by addTheatreSign (they carry the CHICAGO lettering)
    const m = new Massing();
    m.box(M.terracotta, w, h * 0.85, d);
    m.box(M.limestone, w * 0.4, h * 0.45, 0.2, 0, h * 0.28, d * 0.5);
    m.box(M.darkGlass, w * 0.3, h * 0.36, 0.25, 0, h * 0.32, d * 0.5);
    return m.build();
  },
  generic(h, w, d, M) {
    // Art-deco setback tower
    const m = new Massing();
    const mat = [M.limestone, M.darkGlass, M.terracotta, M.blueGlass][Math.floor(Math.random() * 4)];
    m.box(mat, w, h * 0.6, d);
    m.box(mat, w * 0.78, h * 0.25, d * 0.78, 0, h * 0.6, 0);
    m.box(mat, w * 0.5, h * 0.15, d * 0.5, 0, h * 0.85, 0);
    return m.build();
  },
};
/** The Chicago Theatre's vertical blade sign (CHICAGO stacked, lit both
 *  sides) over a bulb-lit marquee, on the front (+Z) of a landmark w x d
 *  wide and h tall. Returned as a Group in the landmark's local frame. */
function makeTheatreSign(h, w, d, K, bladeX = 0) {
  const g = new THREE.Group();
  const red = 0xff3a2a, warm = 0xffe2b0;
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a0d0a, roughness: 0.6, metalness: 0.4 });
  // Marquee: a deep box with lit edges and the name on its front
  const mq = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, h * 0.14, h * 0.22),
    new THREE.MeshStandardMaterial({ color: 0x551511, emissive: red, emissiveIntensity: 0.9, roughness: 0.5 }));
  mq.position.set(0, h * 0.22, d / 2 + h * 0.11);
  g.add(mq);
  const name = K.signTex('CHICAGO', warm);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, w * 0.6 * 96 / 256),
    new THREE.MeshStandardMaterial({ map: name, emissiveMap: name, emissive: 0xffffff, emissiveIntensity: 1.5 }));
  front.position.set(0, h * 0.22, d / 2 + h * 0.22 + 0.02);
  front.scale.y = Math.min(1, (h * 0.13) / (w * 0.6 * 96 / 256));
  g.add(front);
  // Blade: perpendicular to the facade, above the marquee, letters stacked
  // Taller than the facade, like the real one; seven letters, cells a touch wider than tall
  const bh = h * 0.95, bw = bh / 7 * 1.15;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.18, bh, bw), dark);
  const by = h * 0.29 + bh / 2, bz = d / 2 + bw / 2 + 0.05;
  blade.position.set(bladeX, by, bz);
  g.add(blade);
  const letters = K.signTex('CHICAGO', red, true);
  const lm = new THREE.MeshStandardMaterial({ map: letters, emissiveMap: letters, emissive: 0xffffff, emissiveIntensity: 1.8 });
  for (const sx of [-1, 1]) {
    // One plane per side, each facing outward so neither reads mirrored
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.95, bh * 0.97), lm);
    pl.rotation.y = sx * Math.PI / 2;
    pl.position.set(bladeX + sx * (bw * 0.09 + 0.02), by, bz);
    g.add(pl);
  }
  return g;
}

// Layout / manifest ids -> builder (substring match, so 'willis_tower' finds willis)
const BUILDER_ALIASES = [
  ['willis', 'willis'], ['sears', 'willis'], ['hancock', 'hancock'], ['875', 'hancock'], ['trump', 'trump'],
  ['aon', 'aon'], ['regis', 'st_regis'], ['vista', 'st_regis'], ['marina', 'marina_city'], ['wrigley', 'wrigley'],
  ['tribune', 'tribune'], ['trade', 'board_of_trade'], ['cbot', 'board_of_trade'], ['merch', 'merchandise_mart'],
  ['wheel', 'centennial_wheel'], ['navy', 'centennial_wheel'], ['soldier', 'soldier_field'], ['field_museum', 'field_museum'],
  ['shedd', 'shedd_aquarium'], ['adler', 'adler_planetarium'], ['buckingham', 'buckingham_fountain'], ['fountain', 'buckingham_fountain'],
  ['cloud', 'cloud_gate'], ['bean', 'cloud_gate'], ['pritzker', 'pritzker_pavilion'], ['art_inst', 'art_institute'],
  ['theatre', 'chicago_theatre'], ['theater', 'chicago_theatre'],
];
function _builderFor(id) {
  const s = String(id || '').toLowerCase();
  for (const [k, b] of BUILDER_ALIASES) if (s.includes(k)) return LANDMARK_BUILDERS[b];
  return LANDMARK_BUILDERS.generic;
}

// --------------- procedural props (instanced via userData.instance) ---------------
let _P = null;
function propKit() {
  if (_P) return _P;
  const M = mats();
  const G = (geom) => { geom.userData.shared = true; return geom; };
  _P = {
    shelterRoof: G(new THREE.BoxGeometry(3.6, 0.15, 1.6)), shelterGlass: G(new THREE.BoxGeometry(3.4, 2.2, 0.06)),
    shelterSide: G(new THREE.BoxGeometry(0.06, 2.2, 1.4)), post: G(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5)),
    cartBody: G(new THREE.BoxGeometry(1.8, 1.0, 0.9)), wheel: G(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8)),
    umbrella: G(new THREE.ConeGeometry(1.3, 0.5, 8)), pole: G(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4)),
    hull: G(new THREE.BoxGeometry(2.6, 1.0, 8.0)), bow: G(new THREE.ConeGeometry(1.3, 2.4, 4)),
    cabin: G(new THREE.BoxGeometry(2.0, 1.2, 3.2)), canopy: G(new THREE.BoxGeometry(2.4, 0.12, 4.0)),
    lampPole: G(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6)), lampHead: G(new THREE.BoxGeometry(0.5, 0.25, 1.2)),
    M,
  };
  return _P;
}
function makeBusShelter() {
  const P = propKit();
  const g = new THREE.Group();
  const roof = new THREE.Mesh(P.shelterRoof, P.M.blackSteel); roof.position.y = 2.45; g.add(roof);
  const back = new THREE.Mesh(P.shelterGlass, P.M.glassShelter); back.position.set(0, 1.3, -0.7); g.add(back);
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(P.shelterSide, P.M.glassShelter); s.position.set(sx * 1.7, 1.3, 0); g.add(s);
    const p = new THREE.Mesh(P.post, P.M.blackSteel); p.position.set(sx * 1.75, 1.2, 0.7); g.add(p);
  }
  return g;
}
function makeHotDogCart() {
  const P = propKit();
  const g = new THREE.Group();
  const body = new THREE.Mesh(P.cartBody, P.M.cartYellow); body.position.y = 0.9; g.add(body);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(P.wheel, P.M.blackSteel); w.rotation.x = Math.PI / 2; w.position.set(sx * 0.6, 0.3, 0.5); g.add(w);
  }
  const pole = new THREE.Mesh(P.pole, P.M.steel); pole.position.y = 2.1; g.add(pole);
  const um = new THREE.Mesh(P.umbrella, P.M.umbrella); um.position.y = 3.2; g.add(um);
  return g;
}
function makeBoat(big) {
  const P = propKit();
  const g = new THREE.Group();
  const s = big ? 1.8 : 1;
  const hull = new THREE.Mesh(P.hull, big ? P.M.hullDark : P.M.hull); hull.position.y = 0.4; hull.scale.setScalar(s); g.add(hull);
  const bow = new THREE.Mesh(P.bow, big ? P.M.hullDark : P.M.hull);
  bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.scale.set(s, s, s * 0.5); bow.position.set(0, 0.4, 4.0 * s + 1.0 * s); g.add(bow);
  const cab = new THREE.Mesh(big ? P.canopy : P.cabin, big ? P.M.canvas : P.M.white);
  cab.position.y = big ? 2.6 : 1.5; cab.scale.setScalar(s); g.add(cab);
  return g;
}
function makeChiLamp() {
  // Procedural fallback lamp: cobra-head on a dark pole
  const P = propKit();
  const g = new THREE.Group();
  const pole = new THREE.Mesh(P.lampPole, P.M.blackSteel); pole.position.y = 2.7; g.add(pole);
  const head = new THREE.Mesh(P.lampHead, P.M.warmLit); head.position.set(0, 5.4, 0.5); g.add(head);
  return g;
}

// --------------- the builder ---------------
export function buildChicago(scene, world, opts, K) {
  const L = _layout;
  if (!L) throw new Error('buildChicago: layout not loaded (call loadLevelData first)');
  const M = mats();
  const buildings = [];
  const grid = new K.BuildingGrid(60);
  const lite = !!opts.lite;
  // glb: the GLB kit pieces (track, boats, furniture); buildings are GLB on
  // every tier, procedural massing / boxes only as a load-failure fallback
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  const bldgGLB = true;
  K.setBuildingLite(lite);
  // Static props/kit pieces: phones batch into 240u tiles (fewer draws: the
  // festival's parts need the headroom) and drop to LOD1 from 185u, just
  // past a tile's half-diagonal so the tile you stand in stays LOD0
  // (desktop: 120u tiles, LOD1 from 150u)
  // (phone LOW: its lamps/trees are procedural, a few dozen tris each, so one
  // tile spans the whole map: one draw per part)
  const instance = () => K.instanceStaticClones(scene, !glb ? 4000 : lite ? 240 : 120, lite ? 185 : 150);
  // GLB buildings: the generic kit is a dozen tiny (<300 tri) templates, so
  // big batch tiles keep their draws down at almost no triangle cost
  K.setBuildingTile(!glb ? 600 : lite ? 440 : 300); // phone LOW: one tile per quadrant
  const B = L.bounds;
  const animators = [];
  const STREET_TILE = K.TILE.STREET, SW_TILE = K.TILE.SIDEWALK;
  // Real-scale map: narrower sidewalks, smaller markings and street furniture
  const REAL = L.real;
  const SIDEWALK_W = REAL ? 1.2 : 3.0;
  const PS = REAL ? 0.8 : 1; // street-prop scale

  const addBatch = (geom, mat, shadow = true) => {
    const m = new THREE.Mesh(geom, mat);
    m.receiveShadow = shadow;
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.userData.batch = true; // merged per material by mergeStaticMeshes
    scene.add(m);
    return m;
  };

  // ---- ground ----
  {
    // Paving, not the Tokyo dirt maps: unmapped downtown ground (rail
    // yards, lots, campus edges) read as big brown dirt fields at noon
    const rep = 1600 / 6;
    const groundGeom = new THREE.PlaneGeometry(1600, 1600, 1, 1);
    const ground = new THREE.Mesh(groundGeom, new THREE.MeshStandardMaterial({
      map: K.loadTileTex('sidewalk_color.jpg', rep, rep), normalMap: K.loadDataTex('sidewalk_normal.jpg', rep, rep),
      normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: K.loadDataTex('sidewalk_roughness.jpg', rep, rep),
      roughness: 0.95, color: 0x9c9a94,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((B.minX + B.maxX) / 2 - 200, 0, (B.minZ + B.maxZ) / 2);
    ground.receiveShadow = true;
    ground.renderOrder = 1; // after the city: depth test rejects most of it
    ground.matrixAutoUpdate = false; ground.updateMatrix();
    scene.add(ground);
  }

  // ---- water: lake, river, ponds ----
  const rivers = L.rivers;
  // Water lookup grid (4u cells), scanline-filled from the polygons; holes
  // (piers) are cleared afterwards
  const waterCell = 4;
  const wx0 = B.minX - 100, wz0 = B.minZ - 100;
  const wcx = Math.ceil((B.maxX - B.minX + 200) / waterCell), wcz = Math.ceil((B.maxZ - B.minZ + 200) / waterCell);
  const waterGrid = new Uint8Array(wcx * wcz);
  const fill = (poly, v) => {
    for (let j = 0; j < wcz; j++) {
      const z = wz0 + (j + 0.5) * waterCell;
      const xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, za] = poly[a], [xb, zb] = poly[b];
        if ((za > z) !== (zb > z)) xs.push(xa + (z - za) * (xb - xa) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.round((xs[k] - wx0) / waterCell)), i1 = Math.min(wcx - 1, Math.round((xs[k + 1] - wx0) / waterCell) - 1);
        for (let i = i0; i <= i1; i++) waterGrid[i * wcz + j] = v;
      }
    }
  };
  for (const w of L.water) fill(w.polygon, 1);
  for (const w of L.water) for (const h of w.holes) fill(h, 0);
  // Dev layout rivers are centrelines only
  for (const r of rivers) {
    if (r.polygon || L.water.some((w) => w.kind === 'river')) continue;
    for (let i = 0; i < wcx; i++) for (let j = 0; j < wcz; j++) {
      if (distToPolyline(wx0 + (i + 0.5) * waterCell, wz0 + (j + 0.5) * waterCell, r.points) < r.width / 2 + 1) waterGrid[i * wcz + j] = 1;
    }
  }
  const lakes = L.water.filter((w) => w.kind === 'lake');
  const isWater = (x, z) => {
    const i = Math.floor((x - wx0) / waterCell), j = Math.floor((z - wz0) / waterCell);
    if (i < 0 || j < 0 || i >= wcx || j >= wcz) return lakes.length > 0 && x > B.maxX; // beyond the map: the lake side is water
    return waterGrid[i * wcz + j] === 1;
  };
  {
    let east = -Infinity;
    const shore = [[], [], []];
    // On or past the map edge (the lake is clipped to the bounds + 60u): no seawall there
    const onEdge = (p) => p[0] >= B.maxX - 0.5 || p[0] <= B.minX + 0.5 || p[1] <= B.minZ + 0.5 || p[1] >= B.maxZ - 0.5;
    for (const w of L.water) {
      // Lake holes are thin breakwaters that touch the outer ring; cutting
      // them out made the triangulator drop big wedges of water, so the lake
      // is drawn whole and the breakwaters sit on top as concrete strips
      const holes = w.kind === 'lake' ? [] : w.holes;
      const wm = new THREE.Mesh(polygonGeom(w.polygon, w.kind === 'pond' ? 0.08 : 0.2, 1, holes), w.kind === 'lake' ? M.lake : M.water);
      if (w.kind === 'lake') for (const h of w.holes) addBatch(polygonGeom(h, 0.22, 1), M.seawall);
      wm.receiveShadow = true;
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      wm.userData.batch = true;
      scene.add(wm);
      if (w.kind === 'lake') for (const [x] of w.polygon) east = Math.max(east, x);
      if (w.kind === 'pond') continue;
      // Seawall / embankment along every shore edge that isn't a map edge
      for (const ring of [w.polygon, ...w.holes]) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          if (onEdge(a) && onEdge(b)) continue;
          const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
          if (l < 0.05) continue;
          quadAlong(shore[0], shore[1], shore[2], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dx / l, dz / l, l + 0.3, REAL ? 0.6 : 1.6, 0.35);
        }
      }
    }
    if (shore[0].length) addBatch(_geom(...shore), M.seawall);
    if (lakes.length) {
      // Open water out to the horizon past the east edge of the map
      const far = new THREE.Mesh(new THREE.PlaneGeometry(1800, 3000), M.lake);
      far.rotation.x = -Math.PI / 2;
      far.position.set(Math.max(east, B.maxX) + 900 - 0.5, 0.19, (B.minZ + B.maxZ) / 2);
      far.matrixAutoUpdate = false; far.updateMatrix();
      scene.add(far);
      // ...and north and south past the clipped lake: from the westmost
      // shoreline of any lake polygon (harbours too) at the clipped edge
      // eastward, out to the horizon
      const big = lakes.reduce((a, w) => (w.polygon.length > a.polygon.length ? w : a));
      let z0 = Infinity, z1 = -Infinity;
      for (const [, z] of big.polygon) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (const [edge, dir] of [[z1, 1], [z0, -1]]) {
        let xs = Infinity;
        for (const w of lakes) for (const [x, z] of w.polygon) if (Math.abs(z - edge) < 3) xs = Math.min(xs, x);
        if (!isFinite(xs)) continue;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1500), M.lake);
        pl.rotation.x = -Math.PI / 2;
        pl.position.set(xs + 1500, 0.19, edge + dir * 750 - dir * 0.5);
        pl.matrixAutoUpdate = false; pl.updateMatrix();
        scene.add(pl);
      }
    }
  }
  const sidewalkMat = (rep) => new THREE.MeshStandardMaterial({
    map: K.loadTileTex('sidewalk_color.jpg', rep, rep), normalMap: K.loadDataTex('sidewalk_normal.jpg', rep, rep),
    normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: K.loadDataTex('sidewalk_roughness.jpg', rep, rep),
    aoMap: K.loadDataTex('sidewalk_ao.jpg', rep, rep), aoMapIntensity: 0.8, roughness: 0.9, color: 0xc4bfb6,
  });
  const swMat = sidewalkMat(1);
  const riverwalkGLB = glb ? _kit('riverwalk') : null;
  if (L.riverwalk.length && riverwalkGLB) {
    // Tiled promenade: river side (+Z) toward the water; vertically squashed
    // so its street-level wall top sits a kerb above our flat ground
    K.onTemplatesReady((sc, get) => {
      const tpl = get(riverwalkGLB);
      if (!tpl) {
        for (const r of L.riverwalk) addBatch(ribbon(r.points, -r.width / 2, r.width / 2, 0.3, 1 / SW_TILE), swMat);
        K.mergeStaticMeshes(scene);
        return;
      }
      const def = CHICAGO_KIT_GLBS.riverwalk;
      const S = L.scale || 0.2;
      const sy = 0.55 / def.street; // 6 m street level -> 0.55u above the waterline
      const tiles = [];
      for (const r of L.riverwalk) {
        for (let k = 0; k + 1 < r.points.length; k++) {
          const [ax, az] = r.points[k], [bx, bz] = r.points[k + 1];
          const l = Math.hypot(bx - ax, bz - az);
          if (l < 0.5) continue;
          const dx = (bx - ax) / l, dz = (bz - az) / l;
          const n = Math.max(1, Math.round(l / (def.len * S)));
          // Local +Z = right of travel for ry = atan2(-dz, dx); flip if the water is on the left
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          const right = isWater(mx - dz * 3, mz + dx * 3) ? 1 : isWater(mx + dz * 3, mz - dx * 3) ? -1 : 1;
          const ry = Math.atan2(-dz, dx) + (right > 0 ? 0 : Math.PI);
          for (let q = 0; q < n; q++) {
            const t = (q + 0.5) * l / n;
            tiles.push({ x: ax + dx * t, z: az + dz * t, ry, sl: l / n / (def.len * S) });
          }
        }
      }
      placeStatic(scene, tpl, true, tiles, (t) => new THREE.Vector3(S * t.sl, sy, S), 0.2);
      instance();
    });
  } else if (L.riverwalk.length) {
    for (const r of L.riverwalk) addBatch(ribbon(r.points, -r.width / 2, r.width / 2, 0.3, 1 / SW_TILE), swMat);
  } else {
    for (const r of rivers) {
      // Dev layout: water ribbon, embankment walls and a Riverwalk on both banks
      const hw = r.width / 2;
      const wm = new THREE.Mesh(ribbon(r.points, -hw - 0.5, hw + 0.5, 0.2), M.water);
      wm.receiveShadow = true;
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      scene.add(wm);
      for (const s of [-1, 1]) {
        addBatch(ribbon(r.points, s > 0 ? hw : -hw - 0.8, s > 0 ? hw + 0.8 : -hw, 0.5), M.wall);
        addBatch(ribbon(r.points, s > 0 ? hw + 0.8 : -hw - 4.8, s > 0 ? hw + 4.8 : -hw - 0.8, 0.12, 1 / SW_TILE), swMat);
      }
    }
  }

  // ---- roads ----
  let roadMat = null; // the asphalt, shared with the Soldier Field lots
  const roads = L.roads.filter((r) => !(lite && r.kind === 'alley'));
  // Traffic stays inside the play area (+ a margin): polylines are cut where
  // they leave it
  const inB = ([x, z]) => x > B.minX - 10 && x < B.maxX + 10 && z > B.minZ - 10 && z < B.maxZ + 10;
  const netRoads = [];
  for (const r of L.netRoads) {
    let run = [];
    for (const p of r.points) {
      if (inB(p)) run.push(p);
      else { if (run.length >= 2) netRoads.push({ width: r.width, points: run }); run = []; }
    }
    if (run.length >= 2) netRoads.push({ width: r.width, points: run });
  }
  const net = K.buildRoadNet(netRoads, REAL ? 0.3 : 1.5);
  // Festival on: traffic keeps off the roads inside its fence (the streets
  // themselves, sidewalks and lamps stay)
  if (L.fest) festClearFence(L.fest, roads);
  const carNet = L.fest ? K.buildRoadNet(festCutRoads(netRoads, L.fest), REAL ? 0.3 : 1.5) : net;
  {
    const asphalt = roadMat = new THREE.MeshStandardMaterial({
      map: K.loadTileTex('asphalt_color.jpg', 1, 1), normalMap: K.loadDataTex('asphalt_normal.jpg', 1, 1),
      normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: K.loadDataTex('asphalt_roughness.jpg', 1, 1),
      aoMap: K.loadDataTex('asphalt_ao.jpg', 1, 1), aoMapIntensity: 0.7, roughness: 0.82, metalness: 0.08, color: 0x9a9a9a,
    });
    const uvs = 1 / STREET_TILE;
    // Each net edge separately so sidewalks/markings can be trimmed at junctions
    const nodeW = new Float32Array(net.nodes.length); // widest road at each node
    for (const e of net.edges) {
      const w = e.laneOff * 4;
      nodeW[e.a] = Math.max(nodeW[e.a], w); nodeW[e.b] = Math.max(nodeW[e.b], w);
    }
    const yel = [[], [], []], wht = [[], [], []], cross = [[], [], []];
    // Festival on: the closed streets inside its fence are paved promenade
    // (no asphalt or lane markings); runs split where a street crosses the fence
    const inFest = (x, z) => !!L.fest && festInside(L.fest, x, z);
    for (const r of roads) {
      if (!L.fest) { addBatch(ribbon(r.points, -r.width / 2, r.width / 2, 0.05, uvs), asphalt); continue; }
      let run = [], runIn = null;
      const flush = () => {
        if (run.length >= 2) addBatch(ribbon(run, -r.width / 2, r.width / 2, 0.05, runIn ? 1 / SW_TILE : uvs), runIn ? swMat : asphalt);
        run = run.slice(-1);
      };
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i];
        const samples = [p];
        if (i > 0) {
          const q = r.points[i - 1], l = Math.hypot(p[0] - q[0], p[1] - q[1]);
          samples.unshift(...Array.from({ length: Math.floor(l / 2) }, (_, k) => [q[0] + (p[0] - q[0]) * (k + 1) * 2 / l, q[1] + (p[1] - q[1]) * (k + 1) * 2 / l]).filter((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) < l - 0.5));
        }
        for (const s of samples) {
          const f = inFest(s[0], s[1]);
          if (runIn !== null && f !== runIn) { run.push(s); flush(); }
          runIn = f;
          if (run[run.length - 1] !== s) run.push(s);
        }
      }
      flush();
    }
    for (const e of net.edges) {
      const A = net.nodes[e.a], Bn = net.nodes[e.b];
      const w = e.laneOff * 4;
      const tA = A.edges.length >= 3 ? nodeW[e.a] / 2 + SIDEWALK_W : 0;
      const tB = Bn.edges.length >= 3 ? nodeW[e.b] / 2 + SIDEWALK_W : 0;
      const len = e.len - tA - tB;
      if (len <= 0.5) continue;
      const p0 = [A.x + e.dx * tA, A.z + e.dz * tA], p1 = [Bn.x - e.dx * tB, Bn.z - e.dz * tB];
      // Sidewalks + curbs
      for (const s of [-1, 1]) {
        addBatch(ribbon([p0, p1], s > 0 ? w / 2 : -w / 2 - SIDEWALK_W, s > 0 ? w / 2 + SIDEWALK_W : -w / 2, 0.09, 1 / SW_TILE), swMat);
        const cb = REAL ? 0.1 : 0.2;
        addBatch(ribbon([p0, p1], s > 0 ? w / 2 - cb : -w / 2 - cb, s > 0 ? w / 2 + cb : -w / 2 + cb, 0.1), M.curb);
      }
      const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
      if (inFest(cx, cz)) continue; // pedestrian promenade: no markings
      // Centre line: double yellow on wide roads, dashed yellow otherwise
      const lw = REAL ? 0.1 : 0.18, dash = REAL ? 1.8 : 3, gap = REAL ? 3.2 : 5;
      if (w >= (REAL ? 8 : 11)) {
        for (const o of [-lw * 1.4, lw * 1.4]) quadAlong(yel[0], yel[1], yel[2], cx - e.dz * o, cz + e.dx * o, e.dx, e.dz, len, lw, 0.07);
        // White lane dashes between the two lanes each way
        for (const o of [-w / 4, w / 4]) {
          for (let t = 1; t + dash < len; t += dash + gap + 1) {
            const px = p0[0] + e.dx * (t + dash / 2) - e.dz * o, pz = p0[1] + e.dz * (t + dash / 2) + e.dx * o;
            quadAlong(wht[0], wht[1], wht[2], px, pz, e.dx, e.dz, dash, lw * 0.85, 0.07);
          }
        }
      } else if (w >= 4.5) {
        for (let t = 0.5; t + dash < len; t += dash + gap) {
          quadAlong(yel[0], yel[1], yel[2], p0[0] + e.dx * (t + dash / 2), p0[1] + e.dz * (t + dash / 2), e.dx, e.dz, dash, lw * 1.1, 0.07);
        }
      }
      // Zebra crosswalks just outside each junction
      for (const [node, sgn, t] of [[A, 1, tA], [Bn, -1, tB]]) {
        if (node.edges.length < 3) continue;
        const d0 = t - SIDEWALK_W / 2 - 0.3;
        const ccx = node.x + e.dx * d0 * sgn, ccz = node.z + e.dz * d0 * sgn;
        const pitch = REAL ? 0.5 : 0.9, inset = REAL ? 0.25 : 0.5;
        const bars = Math.max(3, Math.floor((w - 2 * inset) / pitch));
        for (let k = 0; k < bars; k++) {
          const o = -w / 2 + inset + (k + 0.5) * (w - 2 * inset) / bars;
          quadAlong(cross[0], cross[1], cross[2], ccx - e.dz * o, ccz + e.dx * o, e.dx, e.dz, REAL ? 1.3 : 2.6, pitch / 2, 0.075);
        }
      }
    }
    // Junction patches: one asphalt square over each multi-way node hides the
    // overlapping road ribbons beneath it
    const jp = [[], [], []], jq = [[], [], []]; // asphalt, festival paving
    net.nodes.forEach((n, i) => {
      if (n.edges.length < 3) return;
      const e = net.edges[n.edges[0]];
      const [P, U, I] = inFest(n.x, n.z) ? jq : jp;
      quadAlong(P, U, I, n.x, n.z, e.dx, e.dz, nodeW[i] + 0.6, nodeW[i] + 0.6, 0.06);
    });
    for (const [[P, U, I], mat, t] of [[jp, asphalt, uvs], [jq, swMat, 1 / SW_TILE]]) {
      if (!P.length) continue;
      const g = _geom(P, U, I);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * t, p.getZ(i) * t);
      addBatch(g, mat);
    }
    if (yel[0].length) addBatch(_geom(...yel), M.yellow, false);
    if (wht[0].length) addBatch(_geom(...wht), M.whiteLine, false);
    if (cross[0].length) {
      const cw = new THREE.Mesh(_geom(...cross), new THREE.MeshStandardMaterial({
        color: 0xd9d9d2, roughness: 0.85, map: K.wornPaintTex(), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      cw.receiveShadow = true;
      cw.matrixAutoUpdate = false; cw.updateMatrix();
      scene.add(cw);
    }
  }
  K.setCarNet(carNet);

  // ---- parks ----
  // Lawns: mottled grass texture (world-unit UVs). Grant Park also gets its
  // formal path grid lined with allees of trees; other parks a loose scatter.
  const onRoad = (x, z, pad) => roads.some((r) => distToPolyline(x, z, r.points) < r.width / 2 + SIDEWALK_W + pad);
  // Park trees keep off landmark sites (the Art Institute, the fountain pool...)
  const lmBoxes = L.landmarks.map((lm) => {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    return [lm.x, lm.z, (lm.w * c + lm.d * s) / 2 + 2, (lm.w * s + lm.d * c) / 2 + 2];
  });
  // ...and off the Soldier Field site's paving and parking
  const noTree = L.sfSite ? [L.sfSite.northPlaza, ...L.sfSite.plazas, ...L.sfSite.parking.map((p) => p.polygon)].filter(Boolean) : [];
  // ...and off the festival's stages, tents and crowd lawns
  const festPolys = L.fest ? festNoTree(L.fest) : [];
  noTree.push(...festPolys);
  const onFest = (x, z) => festPolys.some((poly) => pointInPoly(x, z, poly));
  const onLandmark = (x, z) => lmBoxes.some(([lx, lz, hw, hd]) => Math.abs(x - lx) < hw && Math.abs(z - lz) < hd)
    || noTree.some((poly) => pointInPoly(x, z, poly));
  for (const q of L.paths) addBatch(ribbon(q.points, -Math.max(0.3, q.width / 2), Math.max(0.3, q.width / 2), 0.04), M.path);
  // Ground under a stadium bowl is cut out: the GLB's turf sits only 0.06u
  // above the lawns and shimmered through them
  const bowlHoles = L.landmarks.filter((lm) => lm.id === 'soldier_field').map((lm) => {
    const c = Math.cos(lm.rotY || 0), s = Math.sin(lm.rotY || 0), hw = lm.w * 0.42, hd = lm.d * 0.42;
    return [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]].map(([u, v]) => [lm.x + c * u + s * v, lm.z - s * u + c * v]);
  });
  const holesIn = (poly) => bowlHoles.filter((h) => h.every(([x, z]) => pointInPoly(x, z, poly)));
  let alleeTrees = 0, railTracks = 0;
  const RAIL_CAP = lite ? 60 : 240;
  const ALLEE_CAP = lite ? 60 : 320;
  for (const p of L.parks) {
    // Under the road layer (0.05): streets crossing a park stay on top
    // Plazas by surface (landuse fill): lots are asphalt, rail yards ballast
    // Ballast and gravel: the asphalt grain at world-unit UVs, tinted
    if (!M.ballast.map) {
      M.ballast.map = M.gravel.map = K.loadTileTex('asphalt_color.jpg', 1, 1);
      M.ballast.needsUpdate = M.gravel.needsUpdate = true;
    }
    const plaza = { parking: roadMat, railyard: M.ballast, gravel: M.gravel, paved: swMat }[p.surface] || M.lot;
    const uv = p.kind === 'plaza' && ['parking', 'railyard', 'gravel'].includes(p.surface) ? 1 / STREET_TILE : p.surface === 'paved' ? 1 / SW_TILE : 1 / 14;
    const base = p.kind === 'plaza' ? plaza : p.kind === 'beach' ? M.sand : p.kind === 'lawn' ? M.lawn : M.grass;
    // Landuse fill overlaps the older park polygons at the same height: its
    // own draw order (yards, lawns, gardens, then lots and paving) by depth offset
    const lay = !p.fill ? 0 : p.surface === 'railyard' || p.surface === 'gravel' ? 1 : p.kind === 'plaza' ? 3 : 2;
    addBatch(polygonGeom(p.polygon, 0.03, uv, holesIn(p.polygon)), lay ? decal(base, lay) : base);
    for (const q of p.paths) addBatch(ribbon(q.points, -q.width / 2, q.width / 2, 0.04), M.path);
    // Rail yards (landuse fill: the Metra / IC corridor): track pairs along
    // the yard's long axis every ~4.6 m, clipped to the polygon
    if (REAL && p.surface === 'railyard') {
      const [ux, uz] = _axis(p.polygon), vx = -uz, vz = ux;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, z] of p.polygon) {
        const u = x * ux + z * uz, v = x * vx + z * vz;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const gauge = 1.435 * (L.scale || 0.2) / 2, step = 0.6;
      for (let v = v0 + 0.6; v < v1 - 0.4 && railTracks < RAIL_CAP; v += 0.92) {
        let run = [];
        const flush = () => {
          if (run.length >= 2) {
            const pts = [run[0], run[run.length - 1]];
            addBatch(ribbon(pts, -gauge - 0.16, gauge + 0.16, 0.042), decal(M.trackBed, 1), false);
            for (const sd of [-1, 1]) addBatch(ribbon(pts, sd * gauge - 0.025, sd * gauge + 0.025, 0.045), M.railSteel, false);
            railTracks++;
          }
          run = [];
        };
        for (let u = u0; u <= u1; u += step) {
          const x = ux * u + vx * v, z = uz * u + vz * v;
          if (pointInPoly(x, z, p.polygon) && !onRoad(x, z, 0)) run.push([x, z]);
          else flush();
        }
        flush();
      }
    }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (p.kind === 'plaza' || p.kind === 'beach') continue;
    const formal = REAL && /grant park/i.test(p.name) && (x1 - x0) * (z1 - z0) > 400;
    if (formal) {
      // Paths every 36u both ways, cut where they leave the lawn or meet a road
      const runs = [];
      const GRID = 36, STEP = 1.5;
      for (let gx = Math.ceil(x0 / GRID) * GRID; gx < x1; gx += GRID) runs.push([[gx, z0], [gx, z1]]);
      for (let gz = Math.ceil(z0 / GRID) * GRID; gz < z1; gz += GRID) runs.push([[x0, gz], [x1, gz]]);
      for (const [[ax, az], [bx, bz]] of runs) {
        const l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
        let run = [];
        const flush = () => {
          if (run.length >= 2 && Math.hypot(run[run.length - 1][0] - run[0][0], run[run.length - 1][1] - run[0][1]) > 6) {
            const pts = [run[0], run[run.length - 1]];
            addBatch(ribbon(pts, -0.8, 0.8, 0.04), M.path);
            // Allee: a tree row each side of the path
            const rl = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
            for (let t = 3; t < rl - 2 && alleeTrees < ALLEE_CAP; t += 7) {
              for (const sd of [-1, 1]) {
                const tx = pts[0][0] + dx * t - dz * 2.4 * sd, tz = pts[0][1] + dz * t + dx * 2.4 * sd;
                if (!pointInPoly(tx, tz, p.polygon) || isWater(tx, tz) || onRoad(tx, tz, 1) || onLandmark(tx, tz)) continue;
                scene.add(K.makeTree(tx, tz, (0.95 + Math.random() * 0.15) * PS));
                alleeTrees++;
              }
            }
          }
          run = [];
        };
        for (let t = 0; t <= l; t += STEP) {
          const x = ax + dx * t, z = az + dz * t;
          if (pointInPoly(x, z, p.polygon) && !isWater(x, z) && !onRoad(x, z, 0.5)) run.push([x, z]);
          else flush();
        }
        flush();
      }
      continue;
    }
    // Trees: jittered grid inside the polygon, away from paths and water
    const step = (lite ? 16 : 11) * (REAL ? 0.7 : 1);
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (Math.random() < (p.kind === 'lawn' ? 0.8 : 0.55)) continue;
      const tx = x + (Math.random() - 0.5) * step * 0.7, tz = z + (Math.random() - 0.5) * step * 0.7;
      if (!pointInPoly(tx, tz, p.polygon) || isWater(tx, tz)) continue;
      if (p.paths.some((q) => distToPolyline(tx, tz, q.points) < q.width / 2 + 2)) continue;
      if (onRoad(tx, tz, 1.5) || onLandmark(tx, tz)) continue;
      scene.add(K.makeTree(tx, tz, (0.9 + Math.random() * 0.5) * PS));
    }
  }

  // ---- buildings ----
  // Box buildings: real-scale window grid on two faces, plus a roof cap and
  // cornice band (instanced below, zeroed with the building on collapse)
  const boxes = [];
  const BOX_WIN = REAL ? { scale: 0.65, faces: lite ? 2 : 4, minH: 2.5 } : undefined;
  const picked = new Map(); // 24u cell -> generic urls placed there
  const placeBlock = (o) => {
    const color = _facade();
    // AABB of the (possibly rotated) footprint: collision and AOE use axis-aligned w/d
    const c = Math.abs(Math.cos(o.rotY || 0)), s = Math.abs(Math.sin(o.rotY || 0));
    const aw = o.w * c + o.d * s, ad = o.w * s + o.d * c;
    // A windowed box only when no generic GLB exists at all (failure
    // fallback; flushPendingGLBBuildings also boxes a block whose template
    // failed to load)
    const pool = _pool(_bucket(o.h));
    if (!bldgGLB || !pool.length) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { color, noDecor: true, noRoofProps: REAL, windows: BOX_WIN });
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      boxes.push(b);
      return;
    }
    const tile = GENERIC_TILES[o.id];
    if (tile) {
      const cw = o.w / tile.nx, cd = o.d / tile.nz;
      const ax = [Math.cos(o.rotY || 0), -Math.sin(o.rotY || 0)], az = [Math.sin(o.rotY || 0), Math.cos(o.rotY || 0)];
      for (let i = 0; i < tile.nx; i++) for (let j = 0; j < tile.nz; j++) {
        const u = (i + 0.5) * cw - o.w / 2, v = (j + 0.5) * cd - o.d / 2;
        const tx = o.x + ax[0] * u + az[0] * v, tz = o.z + ax[1] * u + az[1] * v;
        const tb = new K.Building(tx, tz, cw * c + cd * s, cw * s + cd * c, tile.hM * (L.scale || 0.2), { skipWindows: true, color });
        tb._skipBodyIM = true;
        tb.group.matrixAutoUpdate = false; tb.group.updateMatrix();
        scene.add(tb.group); buildings.push(tb); grid.add(tb);
        K.queueGLB({ url: CHI_BASE + tile.file, h: tile.hM * (L.scale || 0.2), building: tb, maxW: tb.w, maxD: tb.d, rotY: o.rotY || 0, pool, stretch: 1.3 });
      }
      return;
    }
    const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
    b._skipBodyIM = true;
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    // Neighbours differ: skip models already used in this or the adjacent 24u cells
    const cx = Math.floor(o.x / 24), cz = Math.floor(o.z / 24);
    const avoid = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const u of picked.get((cx + i) + ':' + (cz + j)) || []) avoid.add(u);
    const url = _pickGeneric(_bucket(o.h), avoid, o.h);
    const k = cx + ':' + cz;
    if (!picked.has(k)) picked.set(k, []);
    picked.get(k).push(url);
    // Kit pieces stretch up to 1.3x per axis to fill the footprint (artist-approved)
    K.queueGLB({ url, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, pool, stretch: 1.3 });
  };
  {
    // Phones: keep every tower but thin out the low infill so the GLB city
    // stays inside the mobile draw/triangle budget
    for (const o of L.buildings) {
      if (lite && o.h < 16 && Math.random() < 0.4) continue;
      placeBlock(o);
    }
  }

  // ---- landmarks ----
  // The theatre's lettered blade sign + marquee ride on the building's group,
  // so they go when it collapses
  const addTheatreSign = (b, lm, ry, bladeX = 0) => {
    const sg = makeTheatreSign(lm.h, lm.w, lm.d, K, bladeX);
    sg.rotation.y = ry;
    b.group.add(sg);
  };
  // Buckingham: the 85 m pool (the model's own basin is small), granite rim
  // and animated jets, all on the landmark's group (gone when it collapses)
  const addFountainPool = (b, lm) => {
    const R = Math.max(lm.w, lm.d) / 2;
    const g = new THREE.Group();
    const pool = new THREE.Mesh(new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2), M.water);
    pool.position.y = 0.12;
    pool.receiveShadow = true;
    g.add(pool);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 4, 48).rotateX(Math.PI / 2), M.fountain);
    rim.position.y = 0.2;
    g.add(rim);
    // Central jet plus a ring of arcing side jets, breathing up and down
    const jets = [];
    const jetGeom = new THREE.ConeGeometry(0.35, 1, 8, 1, true).translate(0, 0.5, 0);
    const main = new THREE.Mesh(jetGeom, M.fountainWater);
    main.position.y = lm.h * 0.6;
    g.add(main); jets.push({ m: main, base: lm.h * 4, ph: 0 });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const j = new THREE.Mesh(jetGeom, M.fountainWater);
      j.position.set(Math.cos(a) * R * 0.55, 0.15, Math.sin(a) * R * 0.55);
      j.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); // lean in toward the centre
      g.add(j); jets.push({ m: j, base: lm.h * 1.2, ph: k * 0.7 });
    }
    b.group.add(g);
    animators.push({
      update(dt, time) {
        if (b.destroyed) return;
        for (const jt of jets) jt.m.scale.set(1, jt.base * (0.85 + 0.15 * Math.sin(time * 1.7 + jt.ph)), 1);
      },
    });
  };
  for (const lm of L.landmarks) {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    const aw = lm.w * c + lm.d * s, ad = lm.w * s + lm.d * c;
    const hp = lm.hp || Math.max(120, Math.round(lm.h * 3 + lm.w * lm.d * 0.05));
    const b = new K.Building(lm.x, lm.z, aw, ad, lm.h, { skipWindows: true });
    b._skipBodyIM = true;
    b.maxHp = hp; b.hp = hp;
    b.landmarkId = lm.id;
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const def = bldgGLB ? _landmarkGLB(lm.id) : null;
    if (def) {
      // Layout height is the roof; the model's bbox includes spires/antennas
      const h = lm.heightM ? lm.h * def.trueHeightM / lm.heightM : lm.h;
      const url = CHI_BASE + def.file;
      const rotY = def.face ? _faceRot(lm.rotY || 0, def.face) : def.faceX ? _faceRot(lm.rotY || 0, def.faceX, true) : (lm.rotY || 0);
      if (/theat/.test(lm.id)) {
        // The GLB's sign is blank: fit the CHICAGO blade + marquee to the
        // placed model once its size is known (its +Z face is the front)
        K.onTemplatesReady(() => {
          if (b.destroyed) return;
          const quarter = Math.abs(Math.sin(rotY)) > Math.SQRT1_2;
          const w = quarter ? b.d : b.w;
          // The GLB's blade sits on the +X side of the arch
          addTheatreSign(b, { h: b.h, w, d: quarter ? b.w : b.d }, rotY, w * 0.22);
        });
      }
      if (def.fountain) addFountainPool(b, lm);
      if (def.shiftM) {
        // Move the site centre along the model's front so its anchor part
        // (Pritzker's shell) stands on the layout spot
        const sm = def.shiftM * (lm.heightM ? lm.h / lm.heightM : (L.scale || 0.2));
        grid.remove(b);
        b.x += Math.sin(rotY) * sm; b.z += Math.cos(rotY) * sm;
        b.group.position.set(b.x, 0, b.z); b.group.updateMatrix();
        grid.add(b);
      }
      if (def.core) {
        // Dark glass box inside open lattice windows, sized to the placed model
        K.onTemplatesReady(() => {
          if (b.destroyed) return;
          const core = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.86, b.h * 0.82, b.d * 0.86), M.darkGlass);
          core.position.set(0, b.h * 0.41, 0);
          b.group.add(core);
        });
      }
      if (def.clone) {
        // Own scene graph so its node can move (the wheel's rotor)
        K.onTemplatesReady((sc, get) => {
          const tpl = get(url);
          if (!tpl || b.destroyed) return;
          // twin: two copies spread along the layout's w axis, the second mirrored
          const copies = def.twin ? [-1, 1] : [0];
          const holder = new THREE.Group();
          const ax = Math.cos(lm.rotY || 0), az = -Math.sin(lm.rotY || 0);
          for (const side of copies) {
            const root = tpl.clone(true);
            root.rotation.y = rotY;
            const box = new THREE.Box3().setFromObject(root);
            const k = h / Math.max(1e-3, box.max.y - box.min.y);
            root.scale.set(side > 0 ? -k : k, k, k);
            box.setFromObject(root);
            const spread = side ? side * Math.max(0, lm.w / 2 - Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2) : 0;
            root.position.set(lm.x + ax * spread - (box.min.x + box.max.x) / 2, -box.min.y, lm.z + az * spread - (box.min.z + box.max.z) / 2);
            holder.add(root);
          }
          scene.add(holder);
          b.customMesh = holder;
          b.glbUrl = url;
          b.h = h;
          const node = typeof def.clone === 'string' ? holder.getObjectByName(def.clone) : null;
          if (node) animators.push({ update(dt) { if (!b.destroyed) node.rotation.z += dt * 0.12; } });
        });
        b.customMesh = new THREE.Object3D(); // AABB hit-test marker until placed
        continue;
      }
      if (def.chrome && !scene.environment) {
        // No env map off desktop HIGH: metal 1 would render black
        K.onTemplatesReady((sc, get) => {
          get(url)?.traverse((o) => {
            if (o.isMesh && o.material.metalness > 0.9) { o.material.metalness = 0.55; o.material.roughness = Math.max(0.25, o.material.roughness); }
          });
        });
      }
      if (def.exact) {
        // Hero model at exact map scale (uniform L.scale u/m, no fit or
        // stretch); phones draw its LOD1 twin only (def.phoneLod1)
        const sc = L.scale || 0.2;
        if (def.phoneLod1 && isMobile) b.lod1Only = true;
        K.queueGLB({ url, h: def.trueHeightM * sc, building: b, maxW: 0, maxD: 0, rotY, landmark: true, atOrigin: !!def.atOrigin });
      } else if (def.front) {
        // Front block on the street edge (+Z side of the site), a separate
        // destructible landmark; the procedural rear fills the remainder
        const s = lm.h * def.maxH / def.trueHeightM;
        const fd = Math.min(lm.d * 0.6, (def.frontDepthM || 42) * s * 1.15); // its depth, front to back (approx.)
        const fx = Math.sin(rotY), fz = Math.cos(rotY); // front direction
        // Depth of the site along the front direction
        const siteDepth = Math.abs(fx * Math.cos(lm.rotY || 0) - fz * Math.sin(lm.rotY || 0)) > Math.SQRT1_2 ? lm.w : lm.d;
        const off = siteDepth / 2 - fd / 2;
        grid.remove(b);
        b.x = lm.x + fx * off; b.z = lm.z + fz * off;
        b.group.position.set(b.x, 0, b.z); b.group.updateMatrix();
        grid.add(b);
        const fw = siteDepth === lm.w ? lm.d : lm.w;
        K.queueGLB({ url, h: lm.h * def.maxH, building: b, maxW: Math.abs(fz) > Math.SQRT1_2 ? fw : fd, maxD: Math.abs(fz) > Math.SQRT1_2 ? fd : fw, rotY, landmark: true, stretch: 1.3 });
        // Rear: procedural massing behind it (def.rear builder, def.rearH x height)
        const rd = siteDepth - fd;
        const rh = lm.h * (def.rearH || 1);
        const rx = lm.x - fx * (fd / 2), rz = lm.z - fz * (fd / 2);
        const rw = Math.abs(fz) > Math.SQRT1_2 ? fw : rd, rdd = Math.abs(fz) > Math.SQRT1_2 ? rd : fw;
        const rb = new K.Building(rx, rz, rw, rdd, rh, { skipWindows: true });
        rb._skipBodyIM = true;
        rb.maxHp = rb.hp = Math.round(hp * 0.6);
        rb.landmarkId = lm.id + '_rear';
        rb.group.matrixAutoUpdate = false; rb.group.updateMatrix();
        scene.add(rb.group); buildings.push(rb); grid.add(rb);
        const rg = CHICAGO_REAR_GLBS[def.rearGLB];
        if (rg && rg.ready) {
          // rg.face: the rear model's own front direction (else it faces the front block)
          const rry = rg.face ? _faceRot(lm.rotY || 0, rg.face) : rotY;
          K.queueGLB(rg.uniform
            ? { url: CHI_BASE + rg.file, h: rh, building: rb, maxW: 0, maxD: 0, rotY: rry, landmark: true }
            : { url: CHI_BASE + rg.file, h: rh, building: rb, maxW: rw, maxD: rdd, rotY: rry, landmark: true, stretch: 1.3 });
        } else {
          const rear = LANDMARK_BUILDERS[def.rear || 'art_institute_rear'](rh, fw, rd, M);
          rear.position.set(rx, 0, rz);
          rear.rotation.y = rotY;
          rear.matrixAutoUpdate = false; rear.updateMatrix();
          rear.userData.procedural = true;
          scene.add(rear);
          rb.customMesh = rear;
          if (rg && rg.pending) rb.pendingGLB = rg.file;
        }
      } else if (def.fit === 'footprint') {
        // Model's plan is undersized for the site (AI proportions run tall):
        // fill the layout outline instead, height capped at maxH x layout
        K.queueGLB({ url, h: lm.h * (def.maxH || 1.6), building: b, maxW: aw, maxD: ad, rotY, landmark: true, stretch: 1.3 });
      } else {
        // Exact layout height: no footprint clamp (maxW/maxD 0)
        K.queueGLB({ url, h, building: b, maxW: 0, maxD: 0, rotY, landmark: true });
      }
      if (def.pair) {
        // The mirrored twin, turned to face the first across the plaza
        const b2 = new K.Building(lm.x, lm.z + def.pair, aw, ad, lm.h, { skipWindows: true });
        b2._skipBodyIM = true;
        b2.maxHp = hp; b2.hp = hp;
        b2.landmarkId = lm.id + '_twin';
        b2.group.matrixAutoUpdate = false; b2.group.updateMatrix();
        scene.add(b2.group); buildings.push(b2); grid.add(b2);
        K.queueGLB({ url, h, building: b2, maxW: 0, maxD: 0, rotY: rotY + Math.PI, landmark: true });
      }
      continue;
    }
    // Procedural massing: only a fallback (GLB not listed / not ready)
    const mesh = _builderFor(lm.id)(lm.h, lm.w, lm.d, M);
    mesh.userData.procedural = true;
    const pend = CHICAGO_LANDMARK_GLBS.find((g) => g.pending && (g.ids ? g.ids.includes(lm.id) : g.id === lm.id));
    if (pend) b.pendingGLB = pend.file;
    mesh.position.set(lm.x, 0, lm.z);
    mesh.rotation.y = PROC_FACE[lm.id] ? _faceRot(lm.rotY || 0, PROC_FACE[lm.id]) : (lm.rotY || 0);
    if (/theat/.test(lm.id)) addTheatreSign(b, lm, mesh.rotation.y);
    if (mesh.userData.spin) {
      const spin = mesh.userData.spin;
      animators.push({ update(dt) { if (!b.destroyed) spin.rotation.z += dt * 0.12; } });
    } else {
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    }
    scene.add(mesh);
    b.customMesh = mesh;
  }

  // ---- bascule bridges (destructible, like Tokyo's GLB bridges) ----
  // One template (22u span, 15u deck) instanced per material and scaled to
  // each bridge, so every bridge together costs one draw per material;
  // collapse() zeroes the bridge's slots like an instanced GLB building.
  // Phones keep the procedural bridges: one draw per material for all of them,
  // where the GLB costs 3 per 120u tile
  const bridgeGLB = glb && !lite ? _kit('bascule_bridge') : null;
  if (bridgeGLB) {
    // Instanced GLB bridges: fitted inside each bridge's footprint (uniform
    // scale), destructible like any instanced GLB building
    for (const br of L.bridges) {
      const c = Math.abs(Math.cos(br.rotY)), s = Math.abs(Math.sin(br.rotY));
      const aw = br.width * c + br.length * s, ad = br.width * s + br.length * c;
      const b = new K.Building(br.x, br.z, aw, ad, 3, { skipWindows: true });
      b._skipBodyIM = true;
      b.maxHp = b.hp = 120;
      b.isBridge = true;
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      // The Michigan Ave crossing gets the hero DuSable model
      const hero = L.dusable && _kit('dusable_bridge') && Math.hypot(br.x - L.dusable[0], br.z - L.dusable[1]) < 15;
      // The GLB spans along local X; rotY here is the template-Z convention
      K.queueGLB({ url: hero ? _kit('dusable_bridge') : bridgeGLB, h: 50, building: b, maxW: aw, maxD: ad, rotY: br.rotY - Math.PI / 2, landmark: true });
    }
  } else if (L.bridges.length) {
    const L0 = 22, W0 = 15;
    const g = new Massing();
    g.box(M.bridgeGrey, W0, 0.6, L0, 0, 0.5, 0);
    g.box(M.deck, W0 - 3, 0.05, L0, 0, 1.1, 0);
    for (const sx of [-1, 1]) {
      // Through-truss sides (the bascule leaves) and the four tender houses
      g.box(M.bridgeRed, 0.4, 0.4, L0, sx * (W0 / 2 - 0.2), 2.6, 0);
      for (let k = 0; k <= 6; k++) g.box(M.bridgeRed, 0.3, 1.5, 0.3, sx * (W0 / 2 - 0.2), 1.1, -L0 / 2 + k * L0 / 6);
      for (const sz of [-1, 1]) {
        g.box(M.limestone, 2.6, 3.2, 2.6, sx * (W0 / 2 + 1.6), 0.5, sz * (L0 / 2 - 1.5));
        g.add(M.copper, new THREE.ConeGeometry(1.9, 1.2, 4), sx * (W0 / 2 + 1.6), 4.3, sz * (L0 / 2 - 1.5), Math.PI / 4);
      }
    }
    const tpl = g.build();
    const ims = tpl.children.map((m) => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, L.bridges.length);
      im.castShadow = true; im.receiveShadow = true;
      return im;
    });
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    L.bridges.forEach((br, i) => {
      mtx.compose(new THREE.Vector3(br.x, 0, br.z), q.setFromAxisAngle(up, br.rotY), new THREE.Vector3(br.width / W0, 1, br.length / L0));
      for (const im of ims) im.setMatrixAt(i, mtx);
      const c = Math.abs(Math.cos(br.rotY)), s = Math.abs(Math.sin(br.rotY));
      const b = new K.Building(br.x, br.z, br.width * c + br.length * s, br.width * s + br.length * c, 3, { skipWindows: true });
      b._skipBodyIM = true;
      b.maxHp = b.hp = 120;
      b.isBridge = true;
      b.customMesh = new THREE.Object3D(); // scene-less marker: hit-tested by its AABB
      b._glbSlots = ims.map((im) => ({ im, idx: i }));
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
    });
    for (const im of ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); }
  }

  if (boxes.length && REAL) {
    // Dark roof cap (tar / gravel) and a lighter parapet cornice band: two
    // InstancedMeshes for every box in the city
    const capIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.roofCap, boxes.length);
    const corIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.cornice, boxes.length);
    const dm = new THREE.Object3D();
    boxes.forEach((b, i) => {
      dm.position.set(b.x, b.h + 0.03, b.z); dm.scale.set(b.w * 0.94, 0.08, b.d * 0.94); dm.updateMatrix();
      capIM.setMatrixAt(i, dm.matrix);
      const band = Math.min(0.35, b.h * 0.06);
      dm.position.set(b.x, b.h - band / 2 + 0.05, b.z); dm.scale.set(b.w + 0.16, band, b.d + 0.16); dm.updateMatrix();
      corIM.setMatrixAt(i, dm.matrix);
      b._glbSlots = [{ im: capIM, idx: i }, { im: corIM, idx: i }];
    });
    for (const im of [capIM, corIM]) { im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); }
  }

  // ---- Kaijupalooza! (Grant Park festival): buildings too, so before the bodies ----
  if (L.fest) buildFest(scene, L.fest, { K, buildings, grid, animators, world, lite, glb, addBatch, polygonGeom, M, S: L.scale || 0.2 });

  const bodiesIM = K.buildGlobalBodies(scene, buildings);
  const windowPulse = K.buildGlobalWindows(scene, CHI_WINDOWS);
  if (windowPulse) animators.push(windowPulse);

  // ---- the L: elevated tracks on steel bents, plus trains ----
  // Procedural deck, girders, rails and columns sized from each line's width,
  // or the l_track_segment GLB tiled along the lines once its template is
  // parsed (flush hook; the procedural deck is the fallback if it failed).
  const railPts = (r) => (r.closed ? [...r.points, r.points[0]] : r.points);
  const proceduralRail = () => {
    const cols = [];
    for (const r of L.rail) {
      const pts = railPts(r);
      const H = r.height, hw = r.width / 2;
      addBatch(ribbon(pts, -hw, hw, H, 0.1), M.deck, true).castShadow = true;
      // Girder sides, then two tracks
      for (const s of [-1, 1]) addBatch(ribbon(pts, s * hw - 0.06, s * hw + 0.06, H + 0.25 * r.width / 6.4 + 0.05), M.bridgeGrey, false);
      for (const o of [-0.36, -0.14, 0.14, 0.36]) addBatch(ribbon(pts, o * r.width - 0.04, o * r.width + 0.04, H + 0.06, 1), M.railSteel, false);
      // Bents: a column at each kerb every `step` u along the line
      const step = Math.max(3, r.width * 2.2);
      let carry = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 1e-3) continue;
        const dx = (bx - ax) / l, dz = (bz - az) / l;
        let t = carry;
        for (; t < l; t += step) {
          const x = ax + dx * t, z = az + dz * t;
          if (isWater(x, z)) continue;
          for (const s of [-1, 1]) cols.push([x - dz * hw * 0.9 * s, z + dx * hw * 0.9 * s, H]);
        }
        carry = t - l;
      }
    }
    if (cols.length) {
      const cw = Math.max(0.18, (L.rail[0]?.width || 6.4) * 0.08);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(cw, 1, cw), M.bridgeGrey, cols.length);
      const dm = new THREE.Object3D();
      cols.forEach(([x, z, h], i) => { dm.position.set(x, h / 2, z); dm.scale.set(1, h, 1); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); });
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
  };
  const tiledRail = (tpl, curveTpl, stationTpl) => {
    // Straight runs tile the 40 m segment (stretched to divide each run
    // exactly); ~90-degree corners get the curve piece, with the straights
    // trimmed back by its radius. Map scale in plan, stretched in height so
    // the rail top sits at the (raised) line height.
    const def = CHICAGO_KIT_GLBS.l_track_segment;
    const S = L.scale || 0.2;
    tpl.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tpl);
    const size = box.getSize(new THREE.Vector3());
    const rawLen = size.x;
    const R = (CHICAGO_KIT_GLBS.l_track_curve?.radius || 30) * S;
    const tiles = [], curves = [];
    for (const r of L.rail) {
      const pts = railPts(r);
      const sy = r.height / size.y;
      const n = pts.length;
      const dir = (k) => {
        const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) || 1;
        return [(pts[k + 1][0] - pts[k][0]) / l, (pts[k + 1][1] - pts[k][1]) / l, l];
      };
      const trimA = new Float32Array(n), trimB = new Float32Array(n); // per segment start/end
      if (curveTpl) {
        for (let k = 1; k + 1 < n; k++) {
          const d1 = dir(k - 1), d2 = dir(k);
          const dot = d1[0] * d2[0] + d1[1] * d2[1];
          if (Math.abs(dot) > 0.35 || d1[2] - trimA[k - 1] < R + 1 || d2[2] < R + 1) continue;
          trimB[k - 1] = R; trimA[k] = R;
          const P = pts[k];
          const left = d1[0] * d2[1] - d1[1] * d2[0] < 0;
          // A right turn is the left-turn piece run backwards from the exit
          curves.push(left
            ? { x: P[0] - d1[0] * R, z: P[1] - d1[1] * R, ry: Math.atan2(-d1[1], d1[0]), sy }
            : { x: P[0] + d2[0] * R, z: P[1] + d2[1] * R, ry: Math.atan2(d2[1], -d2[0]), sy });
        }
      }
      for (let k = 0; k + 1 < n; k++) {
        const [dx, dz, l0] = dir(k);
        const l = l0 - trimA[k] - trimB[k];
        if (l < 0.2) continue;
        const cnt = Math.max(1, Math.round(l / (def.len * S)));
        const ry = Math.atan2(-dz, dx); // local X -> segment direction
        for (let q = 0; q < cnt; q++) {
          const t = trimA[k] + (q + 0.5) * l / cnt;
          tiles.push({ x: pts[k][0] + dx * t, z: pts[k][1] + dz * t, ry, sl: l / cnt / rawLen, sy });
        }
      }
    }
    // Stations replace the straight tiles they cover (120 m of deck)
    const stHalf = (CHICAGO_KIT_GLBS.l_station.len * S) / 2;
    const covered = (t) => stationTpl && L.stations.some((st) => Math.hypot(t.x - st.x, t.z - st.z) < stHalf - 1);
    placeStatic(scene, tpl, true, tiles.filter((t) => !covered(t)), (t) => new THREE.Vector3(t.sl, t.sy, S));
    // The curve piece is authored from its own origin (not recentred)
    if (curveTpl && curves.length) placeStatic(scene, curveTpl, false, curves, (t) => new THREE.Vector3(S, t.sy, S));
    if (stationTpl) {
      const sy = (L.rail[0]?.height || 3.2) / size.y;
      placeStatic(scene, stationTpl, true, L.stations.map((st) => ({ x: st.x, z: st.z, ry: st.rotY, sy })), (t) => new THREE.Vector3(S, t.sy, S));
    }
    instance();
  };
  const trackGLB = glb ? _kit('l_track_segment') : null;
  const curveGLB = glb ? _kit('l_track_curve') : null;
  const trainGLB = glb ? _kit('l_train') : null;
  const stationGLB = glb ? _kit('l_station') : null;
  if (trackGLB) {
    K.onTemplatesReady((sc, get) => {
      const tpl = get(trackGLB);
      if (tpl) tiledRail(tpl, curveGLB ? get(curveGLB) : null, stationGLB ? get(stationGLB) : null);
      else { proceduralRail(); K.mergeStaticMeshes(scene); }
    });
  } else {
    proceduralRail();
  }
  {
    // Trains on the longest lines (two on phones): the l_train GLB once its
    // template is parsed, else procedural cars right away
    const lines = [];
    for (const r of L.rail) {
      const pts = railPts(r);
      const len = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
      if (len > 60 && lines.length < (lite ? 2 : 5)) lines.push([pts, r]);
    }
    const startTrains = (car) => {
      for (const [pts, r] of lines) animators.push(makeTrain(scene, world, pts, r.height + 0.05, M, r.width, car));
    };
    if (trainGLB) {
      K.onTemplatesReady((sc, get) => {
        const tpl = get(trainGLB);
        if (!tpl) { startTrains(null); return; }
        // Car runs along glTF X, base at rail top: turn X onto the travel
        // direction (+Z in the fleet's local frame), map scale
        const S = L.scale || 0.2;
        tpl.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(tpl);
        const fix = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2), new THREE.Vector3(S, S, S))
          .multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2));
        const parts = [];
        tpl.traverse((o) => { if (o.isMesh) parts.push({ geom: o.geometry, mat: o.material, m: new THREE.Matrix4().multiplyMatrices(fix, o.matrixWorld) }); });
        startTrains({ parts, len: 14.9 * S, lane: 2.0 * S });
      });
    } else {
      startTrains(null);
    }
    // Stations: platform slabs with a canopy either side of the deck
    if (L.stations.length && !stationGLB) {
      const sw = L.rail[0]?.width || 6.4, H = L.rail[0]?.height || 5.5;
      const g = new Massing();
      g.box(M.concrete, sw * 0.35, 0.12, 1, sw * 0.68, H - 0.05, 0);
      g.box(M.concrete, sw * 0.35, 0.12, 1, -sw * 0.68, H - 0.05, 0);
      g.box(M.copper, sw * 0.45, 0.06, 1, sw * 0.68, H + sw * 0.45, 0);
      g.box(M.copper, sw * 0.45, 0.06, 1, -sw * 0.68, H + sw * 0.45, 0);
      const tpl = g.build(false);
      const ims = tpl.children.map((m) => new THREE.InstancedMesh(m.geometry, m.material, L.stations.length));
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      L.stations.forEach((st, i) => {
        // Station length runs along local X (layout convention): template's Z axis
        mtx.compose(new THREE.Vector3(st.x, 0, st.z), q.setFromAxisAngle(up, st.rotY + Math.PI / 2), new THREE.Vector3(1, 1, st.length));
        for (const im of ims) im.setMatrixAt(i, mtx);
      });
      for (const im of ims) { im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); }
    }
  }

  // ---- street dressing: lamps, signals, trees, shelters, carts ----
  {
    // High noon: the lamp globes and shelter light boxes are off (their
    // full emissive palettes bloomed into white halos in daylight)
    for (const n of ['chi_streetlamp', 'chi_bus_shelter']) {
      K.propScene(n)?.traverse((o) => { if (o.isMesh && o.material.emissiveMap) o.material.emissiveIntensity = 0.08; });
    }
    // Washington-style acorn lamp GLB, else the Tokyo kit lamp, else procedural
    const lampName = K.hasProp('chi_streetlamp') ? 'chi_streetlamp' : 'street_lamp';
    const hasLamp = K.hasProp(lampName);
    // Lamps along the wider streets only (each GLB lamp is ~1k tris)
    const lampEvery = lite ? 56 : 34;
    const lampMinW = REAL ? 8 : 0;
    let n = 0;
    for (const e of net.edges) {
      const w = e.laneOff * 4;
      if (w < lampMinW) continue;
      for (let t = Math.min(6, e.len / 2); t < e.len - 3; t += lampEvery) {
        const s = (n++ % 2) ? 1 : -1;
        const off = s * (w / 2 + SIDEWALK_W * 0.25);
        const x = net.nodes[e.a].x + e.dx * t - e.dz * off, z = net.nodes[e.a].z + e.dz * t + e.dx * off;
        if (isWater(x, z) || onFest(x, z)) continue;
        const lamp = hasLamp ? K.cloneProp(lampName, 5.6 * PS) : makeChiLamp();
        if (!hasLamp) lamp.scale.setScalar(PS);
        lamp.position.set(x, 0, z);
        lamp.rotation.y = Math.atan2(e.dx, e.dz) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
        lamp.matrixAutoUpdate = false; lamp.updateMatrix();
        lamp.userData.instance = true;
        scene.add(lamp);
        // Sidewalk trees on the other side, sparser
        if (!lite && Math.random() < 0.45) {
          const tx = net.nodes[e.a].x + e.dx * (t + lampEvery / 2) + e.dz * off, tz = net.nodes[e.a].z + e.dz * (t + lampEvery / 2) - e.dx * off;
          if (t + lampEvery / 2 < e.len - 6 && !isWater(tx, tz) && !onFest(tx, tz)) scene.add(K.makeTree(tx, tz, (0.75 + Math.random() * 0.3) * PS));
        }
      }
    }
    // Traffic signals on one corner of every 4-way junction
    // Only a US-style signal (the Tokyo kit's is Japanese); none delivered yet
    if (K.hasProp('chi_traffic_signal')) {
      // Major 4-way junctions, at least 30u apart, capped per tier. One mast
      // per junction, on the approach of its first edge: pole on the kerb
      // left of the incoming traffic, arm (+X) out over the lanes, lenses
      // (+Z) facing the cars.
      const placed = [];
      const cap = lite ? 30 : 70;
      for (const node of net.nodes) {
        if (node.edges.length < 4 || placed.length >= cap) continue;
        const ni = net.nodes.indexOf(node);
        const e = net.edges[node.edges[0]];
        const w = e.laneOff * 4;
        if (w < lampMinW || placed.some(([x, z]) => Math.abs(x - node.x) < 30 && Math.abs(z - node.z) < 30)) continue;
        placed.push([node.x, node.z]);
        const ux = e.a === ni ? e.dx : -e.dx, uz = e.a === ni ? e.dz : -e.dz; // away from the junction
        const ry = Math.atan2(ux, uz); // +Z -> u; +X -> (uz, -ux)
        const back = w / 2 + SIDEWALK_W * 1.2, side = w / 2 + SIDEWALK_W * 0.5;
        const sig = K.cloneProp('chi_traffic_signal', 6.4 * PS);
        sig.position.set(node.x + ux * back - uz * side, 0, node.z + uz * back + ux * side);
        sig.rotation.y = ry;
        sig.matrixAutoUpdate = false; sig.updateMatrix();
        sig.userData.instance = true;
        scene.add(sig);
      }
      // One city-wide cycle on the shared lens materials: green 7 s, amber 2 s, red 7 s
      const lens = {};
      K.propScene('chi_traffic_signal')?.traverse((o) => {
        if (o.isMesh && /lens_(red|yellow|green)/.test(o.material.name)) lens[o.material.name.match(/lens_(\w+)/)[1]] = o.material;
      });
      const col = { red: 0xff2a1a, yellow: 0xffaa22, green: 0x33ff88 };
      for (const [k, m] of Object.entries(lens)) m.emissive.setHex(col[k]);
      if (Object.keys(lens).length) {
        let lit = '';
        animators.push({
          update(dt, time) {
            const t = time % 16, on = t < 7 ? 'green' : t < 9 ? 'yellow' : 'red';
            if (on === lit) return;
            lit = on;
            for (const [k, m] of Object.entries(lens)) m.emissiveIntensity = k === on ? 1.6 : 0.04;
          },
        });
      }
    }
    // Bus shelters and hot-dog carts on arterial sidewalks
    const art = net.edges.filter((e) => e.laneOff * 4 >= (REAL ? 8 : 11) && e.len > (REAL ? 15 : 30));
    const shelterN = lite ? 8 : 18, cartN = lite ? 6 : 14;
    for (let i = 0; i < shelterN + cartN && art.length; i++) {
      const e = art[Math.floor(Math.random() * art.length)];
      const w = e.laneOff * 4;
      const t = e.len * (0.2 + Math.random() * 0.6);
      const s = Math.random() < 0.5 ? 1 : -1;
      const off = s * (w / 2 + SIDEWALK_W * 0.55);
      const x = net.nodes[e.a].x + e.dx * t - e.dz * off, z = net.nodes[e.a].z + e.dz * t + e.dx * off;
      if (isWater(x, z) || onFest(x, z)) continue;
      const shelter = i < shelterN;
      const glbName = shelter ? 'chi_bus_shelter' : 'chi_hot_dog_cart';
      // GLBs at street-furniture scale (~0.8u/m): 2.6 m shelter, 2.2 m cart
      const p = K.hasProp(glbName) ? K.cloneProp(glbName, (shelter ? 2.6 : 2.2) * PS) : (shelter ? makeBusShelter() : makeHotDogCart());
      if (!K.hasProp(glbName)) p.scale.setScalar(PS);
      p.position.set(x, 0, z);
      // Face the street
      p.rotation.y = Math.atan2(e.dx, e.dz) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
      p.matrixAutoUpdate = false; p.updateMatrix();
      p.userData.instance = true;
      scene.add(p);
    }
  }

  // ---- boats: tour boats cruising the river, sailboats on the lake ----
  const boatGLBs = glb ? ['tour_boat', 'water_taxi'].filter((k) => _kit(k)) : [];
  if (boatGLBs.length) {
    // Tour boats and water taxis from the GLBs once parsed (procedural if not)
    K.onTemplatesReady((sc, get) => {
      const BOAT_UPM = 0.3; // a 25 m tour boat ~7.5u on the ~13u river
      const kinds = boatGLBs.map((k) => {
        const tpl = get(_kit(k));
        if (!tpl) return null;
        tpl.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(tpl);
        const fix = new THREE.Matrix4().makeScale(BOAT_UPM, BOAT_UPM, BOAT_UPM)
          .multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y - CHICAGO_KIT_GLBS[k].sinkM, -(b.min.z + b.max.z) / 2));
        const parts = [];
        tpl.traverse((o) => { if (o.isMesh) parts.push({ geom: o.geometry, mat: o.material, m: new THREE.Matrix4().multiplyMatrices(fix, o.matrixWorld) }); });
        return parts;
      }).filter(Boolean);
      for (const r of rivers) {
        const n = lite ? 2 : 4;
        if (!kinds.length) { animators.push(makeRiverBoats(scene, r, n, PS)); continue; }
        kinds.forEach((parts, ki) => animators.push(makeRiverBoats(scene, r, Math.max(1, Math.round(n / kinds.length)), PS, parts, ki * 0.37)));
      }
    });
  } else {
    for (const r of rivers) animators.push(makeRiverBoats(scene, r, lite ? 2 : 4, PS));
  }
  const sailGLB = glb ? _kit('sailboat_moored') : null;
  const moorings = [];
  if (lakes.length) {
    for (let i = 0; i < (lite ? 5 : 12) * (sailGLB ? 2 : 1); i++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = B.minX + Math.random() * (B.maxX - B.minX), z = B.minZ + Math.random() * (B.maxZ - B.minZ);
        // Open water at least 8u from any shore
        if (!isWater(x, z) || !isWater(x + 8, z) || !isWater(x - 8, z) || !isWater(x, z + 8) || !isWater(x, z - 8)) continue;
        if (!lakes.some((w) => pointInPoly(x, z, w.polygon))) continue;
        if (Math.hypot(x - L.spawn.x, z - L.spawn.z) < 20) continue; // the kaiju wades in here
        if (sailGLB) { moorings.push({ x, z, ry: Math.random() * Math.PI * 2 }); break; }
        // Moored: static, folded into the prop InstancedMeshes
        const bt = makeBoat(false);
        bt.scale.setScalar(PS);
        bt.position.set(x, 0.1, z);
        bt.rotation.y = Math.random() * Math.PI * 2;
        bt.matrixAutoUpdate = false; bt.updateMatrix();
        bt.userData.instance = true;
        scene.add(bt);
        break;
      }
    }
  }

  // ---- GLB street furniture and moored sailboats (placed once parsed) ----
  {
    // Furniture reads at gameplay scale next to the Tokyo-scale cars and
    // civilians, not at the map's 0.2 u/m
    const FURNITURE_UPM = REAL ? 0.6 : 1.2;
    const S = L.scale || 0.2;
    const spots = { planter_bollard: [], newspaper_box_cluster: [], lakefront_trail_bench: [], bike_share_rack: [] };
    // Bike-share docks along major-street kerbs, the ones near L stations
    // first: row along the kerb (+X along the street), bikes (+Z) facing it
    {
      const cap = lite ? 10 : 30;
      const major = net.edges.filter((e) => e.laneOff * 4 >= (REAL ? 8 : 0) && e.len > 14);
      const mid = (e) => [net.nodes[e.a].x + e.dx * e.len / 2, net.nodes[e.a].z + e.dz * e.len / 2];
      const nearSt = (e) => { const [x, z] = mid(e); return L.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 30); };
      const order = [...major.filter(nearSt), ...major.filter((e) => !nearSt(e)).sort(() => Math.random() - 0.5)];
      const used = [];
      for (const e of order) {
        if (spots.bike_share_rack.length >= cap) break;
        const [mx, mz] = mid(e);
        if (used.some(([x, z]) => Math.abs(x - mx) < 40 && Math.abs(z - mz) < 40)) continue;
        const side = Math.random() < 0.5 ? 1 : -1;
        const off = side * (e.laneOff * 2 + SIDEWALK_W * 0.55);
        const x = mx - e.dz * off, z = mz + e.dx * off;
        if (isWater(x, z) || onLandmark(x, z)) continue;
        used.push([mx, mz]);
        // Local X along the street; +Z (sin r, cos r) points back toward the road
        const ry = Math.atan2(-e.dz, e.dx) + (side > 0 ? Math.PI : 0);
        spots.bike_share_rack.push({ x, z, ry });
      }
    }
    // Planters in pairs and newspaper boxes on major-street corners
    let corner = 0;
    for (const node of net.nodes) {
      if (node.edges.length < 4) continue;
      const e = net.edges[node.edges[0]];
      const w = e.laneOff * 4;
      if (w < (REAL ? 8 : 0)) continue;
      corner++;
      const co = w / 2 + SIDEWALK_W * 0.5;
      const ry = Math.atan2(e.dx, e.dz);
      if (corner % 2 === 0 && spots.planter_bollard.length < (lite ? 40 : 120)) {
        for (const sgn of [-1, 1]) {
          spots.planter_bollard.push({ x: node.x + (-e.dx * sgn - e.dz) * co, z: node.z + (-e.dz * sgn + e.dx) * co, ry: 0 });
        }
      }
      if (corner % 3 === 1 && spots.newspaper_box_cluster.length < (lite ? 15 : 45)) {
        spots.newspaper_box_cluster.push({ x: node.x + (e.dx + e.dz) * co * 1.4, z: node.z + (e.dz - e.dx) * co * 1.4, ry: ry + Math.PI / 2 });
      }
    }
    // Lakefront Trail benches: every ~25u along the shore, on the land side, facing the water
    for (const w of lakes) {
      const ring = w.polygon;
      let carry = 0;
      for (let i = 0; i < ring.length && spots.lakefront_trail_bench.length < (lite ? 20 : 60); i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 1e-3) continue;
        const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
        let t = carry;
        for (; t < l; t += 25) {
          const x = a[0] + dx * t, z = a[1] + dz * t;
          // Land side: the normal whose end is dry
          const side = !isWater(x - dz * 3, z + dx * 3) ? 1 : !isWater(x + dz * 3, z - dx * 3) ? -1 : 0;
          if (!side) continue;
          const px = x - dz * 2.2 * side, pz = z + dx * 2.2 * side;
          if (px < B.minX || px > B.maxX || pz < B.minZ || pz > B.maxZ) continue;
          // Seat side (+Z) toward the water: (sin r, cos r) = -normal
          spots.lakefront_trail_bench.push({ x: px, z: pz, ry: Math.atan2(dz * side, -dx * side) });
        }
        carry = t - l;
      }
    }
    for (const k of Object.keys(spots)) spots[k] = spots[k].filter((p) => !onFest(p.x, p.z));
    // Phones: planters only (each kind costs a draw per 120u tile it reaches)
    const kinds = Object.keys(spots).filter((k) => glb && _kit(k) && spots[k].length && !(lite && CHICAGO_KIT_GLBS[k].desktopOnly));
    if (kinds.length || (sailGLB && moorings.length)) {
      K.onTemplatesReady((sc, get) => {
        for (const k of kinds) {
          const tpl = get(_kit(k));
          if (tpl) placeStatic(scene, tpl, true, spots[k], () => new THREE.Vector3(FURNITURE_UPM, FURNITURE_UPM, FURNITURE_UPM));
        }
        const boat = sailGLB && get(sailGLB);
        // Hull bottom at y = 0: sunk ~0.6 m below the lake surface (0.2)
        if (boat) placeStatic(scene, boat, true, moorings, () => new THREE.Vector3(S * 1.5, S * 1.5, S * 1.5), 0.2 - 0.6 * S * 1.5);
        instance();
      });
    }
  }

  // ---- Soldier Field site (cartographer's site_dressing.json, OSM polygons) ----
  // Drawn over the layout parks, under the road layer: lawns, gardens,
  // plazas (the North Plaza is the North Garage roof), surface parking with
  // stall rows of parked cars, footpaths and the memorial fountain. The
  // underground garage and the Waldron multi-storey deck (a GLB building)
  // get no surface.
  if (REAL && L.sfSite) {
    const S = L.sfSite;
    const flat = (polys, y, mat, uvTile) => {
      for (const poly of polys) {
        if (poly.length < 3) continue;
        addBatch(polygonGeom(poly, y, 1 / uvTile), mat);
      }
    };
    // Layered by depth offset as well as height: lawn < garden < plaza /
    // lots < paths < water (the North Plaza lawn, paving and garage roof
    // striped where they overlapped at nearly the same y). A lawn mostly
    // under paving is dropped.
    const paved = [S.northPlaza, ...S.plazas].filter(Boolean);
    const lots = S.parking.filter((p) => p.surface);
    const covered = (poly) => {
      let n = 0, hit = 0;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        const x = x0 + (i + 0.5) * (x1 - x0) / 8, z = z0 + (j + 0.5) * (z1 - z0) / 8;
        if (!pointInPoly(x, z, poly)) continue;
        n++;
        if (paved.some((q) => pointInPoly(x, z, q)) || lots.some((q) => pointInPoly(x, z, q.polygon))) hit++;
      }
      return n > 0 && hit / n > 0.5;
    };
    for (const poly of S.lawns) if (poly.length >= 3 && !covered(poly)) addBatch(polygonGeom(poly, 0.031, 1 / 14, holesIn(poly)), decal(M.lawn, 1));
    flat(S.gardens, 0.032, decal(M.grass, 2), 14);
    flat(paved, 0.033, decal(swMat, 3), SW_TILE);
    flat(lots.map((p) => p.polygon), 0.034, decal(roadMat, 3), STREET_TILE);
    for (const q of S.paths) addBatch(ribbon(q.points, -Math.max(0.3, q.width / 2), Math.max(0.3, q.width / 2), 0.036), decal(M.path, 4));
    flat(S.water, 0.04, decal(M.water, 5), 14);
    // Parked cars: E-W stall rows on a 2.3 x 6u grid inside each lot,
    // keeping a car's corners inside the polygon (phones: fewer, LOW: none)
    let cars = 0;
    const cap = !glb ? 0 : lite ? 60 : 200;
    for (const p of lots) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of p.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const along = x1 - x0 >= z1 - z0; // stall rows along the lot's long side
      for (let u = (along ? x0 : z0) + 1.2; u < (along ? x1 : z1) - 1.2 && cars < cap; u += 2.3) {
        for (let v = (along ? z0 : x0) + 2.5; v < (along ? z1 : x1) - 2.5 && cars < cap; v += 6) {
          const x = along ? u : v, z = along ? v : u;
          const ok = [[-1, -2], [1, -2], [-1, 2], [1, 2]].every(([a, b]) => pointInPoly(along ? x + a : x + b, along ? z + b : z + a, p.polygon));
          if (!ok || Math.random() < 0.3) continue;
          const car = K.makeParkedCar(x, z, (along ? 0 : Math.PI / 2) + (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.08);
          if (car) { scene.add(car); cars++; }
        }
      }
    }
  }

  // ---- distant backdrop: suburbs west/north/south (nothing over the lake) ----
  {
    const N = lite ? 60 : 110;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6f6a66, roughness: 0.95 }), N);
    const dm = new THREE.Object3D();
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    for (let i = 0; i < N; i++) {
      // Angles from north (-z) round through west to south: x < lake
      const a = Math.PI * (0.5 + Math.random());
      const r = 470 + Math.random() * 260;
      const h = 15 + Math.random() * (Math.random() < 0.15 ? 90 : 35);
      dm.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r);
      dm.rotation.set(0, Math.random() * Math.PI, 0);
      dm.scale.set(14 + Math.random() * 30, h, 14 + Math.random() * 30);
      dm.updateMatrix();
      im.setMatrixAt(i, dm.matrix);
    }
    im.frustumCulled = false;
    scene.add(im);
  }

  // ---- play-area barrier: a faint rectangle at the bounds ----
  let barrier = null;
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    const w = B.maxX - B.minX + 16, d = B.maxZ - B.minZ + 16;
    // 4-sided open cylinder turned 45 degrees: a unit square, which the
    // parent's (w, 1, d) scale stretches to the play rectangle
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 22, 4, 1, true), mat);
    mesh.rotation.y = Math.PI / 4;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.scale.set(w, 1, d);
    holder.position.set((B.minX + B.maxX) / 2, 11, (B.minZ + B.maxZ) / 2);
    scene.add(holder);
    barrier = { mesh: holder, mat };
  }

  animators.push(K.makePigeonFlock(scene));

  instance();
  K.mergeStaticMeshes(scene);

  // Pedestrians: on land inside the bounds, spawned on sidewalks
  const sidewalkPoint = () => {
    for (let k = 0; k < 20; k++) {
      let r = Math.random() * net.total, ei = 0;
      while (ei < net.edges.length - 1 && r > net.edges[ei].len) { r -= net.edges[ei].len; ei++; }
      const e = net.edges[ei];
      if (!e) break;
      const off = (Math.random() < 0.5 ? 1 : -1) * (e.laneOff * 2 + 1.5);
      const x = net.nodes[e.a].x + e.dx * r - e.dz * off, z = net.nodes[e.a].z + e.dz * r + e.dx * off;
      if (!isWater(x, z) && x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ) return [x, z];
    }
    return [L.spawn.x, L.spawn.z];
  };
  K.setPedCfg({ blocked: isWater, bounds: B, spawn: sidewalkPoint });

  return {
    buildings, grid, bodiesIM, cityAnimators: animators,
    cityRadius: Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2,
    level: 'chicago', bounds: { ...B }, center: { x: (B.minX + B.maxX) / 2, z: (B.minZ + B.maxZ) / 2 },
    spawn: { ...L.spawn }, isWater, barrier, landPoint: sidewalkPoint,
    // Minimap: lake / river / pond outlines
    mapWater: L.water.map((w) => ({ kind: w.kind, polygon: w.polygon, holes: w.holes })),
  };
}

/** Static copies of a GLB template as plain meshes tagged userData.instance
 *  (the caller runs instanceStaticClones: per-120u-tile InstancedMeshes,
 *  frustum culled, LOD1 twin far away). list: [{ x, z, ry }]; scaleOf(t)
 *  gives the scale; y lifts every copy. recentre: bottom-centre the bbox. */
function placeStatic(scene, src, recentre, list, scaleOf, y = 0) {
  src.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(src);
  const off = new THREE.Matrix4();
  if (recentre) off.makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const meshes = [];
  src.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const locals = meshes.map((o) => new THREE.Matrix4().multiplyMatrices(off, o.matrixWorld));
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4();
  for (const t of list) {
    m.compose(new THREE.Vector3(t.x, (t.y ?? 0) + y, t.z), q.setFromAxisAngle(up, t.ry), scaleOf(t));
    const g = new THREE.Group();
    meshes.forEach((o, k) => {
      const mesh = new THREE.Mesh(o.geometry, o.material);
      mesh.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, locals[k]));
      mesh.receiveShadow = true;
      g.add(mesh);
    });
    g.userData.instance = true;
    scene.add(g);
  }
}

/** N moving copies of a multi-part prop as one InstancedMesh per part
 *  (parts: [{ geom, mat, m: local Matrix4 }]); pose(i, x, y, z, ry). */
function makeFleet(scene, parts, n) {
  const ims = parts.map((p) => {
    const im = new THREE.InstancedMesh(p.geom, p.mat, n);
    im.frustumCulled = false; // instances roam the whole map
    im.castShadow = false; im.receiveShadow = true;
    scene.add(im);
    return im;
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Matrix4();
  return {
    ims,
    pose(i, x, y, z, ry, scale = 1) {
      m.compose(v.set(x, y, z), q.setFromAxisAngle(up, ry), one.setScalar(scale));
      parts.forEach((p, k) => ims[k].setMatrixAt(i, tmp.multiplyMatrices(m, p.m)));
    },
    hide(i) { tmp.makeScale(0, 0, 0); for (const im of ims) im.setMatrixAt(i, tmp); },
    flush() { for (const im of ims) im.instanceMatrix.needsUpdate = true; },
  };
}
const _local = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));

/** Polyline sampler: at(d) -> [x, z, heading]; closed loops wrap. */
function pathSampler(pts) {
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (l < 1e-4) continue;
    seg.push({ a: pts[i], b: pts[i + 1], l, s: total });
    total += l;
  }
  const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1;
  return {
    total, closed,
    at(d) {
      d = closed ? ((d % total) + total) % total : Math.max(0, Math.min(total - 0.01, d));
      let k = 0;
      while (k < seg.length - 1 && d > seg[k].s + seg[k].l) k++;
      const q = seg[k], t = (d - q.s) / q.l;
      return [q.a[0] + (q.b[0] - q.a[0]) * t, q.a[1] + (q.b[1] - q.a[1]) * t, Math.atan2(q.b[0] - q.a[0], q.b[1] - q.a[1])];
    },
  };
}

// L train: 4 cars following the track, looping (or shuttling on an open
// line); a stomp derails the whole train in a chain of explosions.
// car: { parts, len, lane } from the l_train GLB, or null for procedural cars
function makeTrain(scene, world, pts, y, M, trackW = 6.4, car = null) {
  const path = pathSampler(pts);
  // Sized to the track: one car is ~0.4 track widths wide (two tracks)
  const k = trackW / 6.4;
  const CARS = 4, CAR_L = car ? car.len * 0.98 : 10 * k, GAP = car ? car.len * 0.02 : 0.8 * k;
  const P = propKit();
  P.trainBody = P.trainBody || new THREE.BoxGeometry(2.6, 2.6, 10);
  P.trainWin = P.trainWin || new THREE.BoxGeometry(2.66, 0.7, 8.6);
  P.trainStripe = P.trainStripe || new THREE.BoxGeometry(2.64, 0.25, 10);
  for (const g of [P.trainBody, P.trainWin, P.trainStripe]) g.userData.shared = true;
  const lane = car ? car.lane : trackW * 0.25; // runs on one of the two tracks
  const fleet = makeFleet(scene, car
    ? car.parts.map((p) => ({ geom: p.geom, mat: p.mat, m: new THREE.Matrix4().makeTranslation(lane, 0, 0).multiply(p.m) }))
    : [
      { geom: P.trainBody, mat: M.trainBody, m: _local(lane, 1.5 * k, 0, k, k, k) },
      { geom: P.trainWin, mat: M.trainWin, m: _local(lane, 2.0 * k, 0, k, k, k) },
      { geom: P.trainStripe, mat: M.trainStripe, m: _local(lane, 0.6 * k, 0, k, k, k) },
    ], CARS);
  let head = Math.random() * path.total, dir = 1, dead = false;
  const pos = [];
  return {
    update(dt) {
      if (dead || !fleet.ims[0].parent) return;
      head += dir * 16 * dt;
      if (!path.closed && (head > path.total - 1 || head < (CAR_L + GAP) * CARS)) dir = -dir;
      const kp = world.kaijuPos;
      for (let i = 0; i < CARS; i++) {
        const [x, z, ry] = path.at(head - dir * i * (CAR_L + GAP));
        fleet.pose(i, x, y, z, ry);
        pos[i] = [x, z];
        if (kp && Math.abs(kp.x - x) < 4 + CAR_L * 0.3 && Math.abs(kp.z - z) < 4 + CAR_L * 0.3) dead = true;
      }
      if (dead) {
        pos.forEach(([x, z], i) => {
          fleet.hide(i);
          setTimeout(() => world.scene && world.spawnExplosion?.(new THREE.Vector3(x, y + 1.5 * k, z), 0.6 + k * 0.6), i * 120);
        });
        world.shake?.(0.5, 0.4);
        world.onCarDestroyed?.();
      }
      fleet.flush();
    },
  };
}

// River tour boats cruising the river on either side of the centreline
// parts: GLB boat parts ({ geom, mat, m }, bow +Z) or null for procedural;
// phase0 staggers fleets sharing a river
function makeRiverBoats(scene, r, n, ps = 1, parts = null, phase0 = 0) {
  const P = propKit();
  const M = P.M;
  const s = 1.8 * ps;
  const fleet = makeFleet(scene, parts || [
    { geom: P.hull, mat: M.hullDark, m: _local(0, 0.4 * s, 0, s, s, s) },
    { geom: P.bow, mat: M.hullDark, m: _local(0, 0.4 * s, 5 * s, s, s, s * 0.5, Math.PI / 2, Math.PI / 4) },
    { geom: P.canopy, mat: M.canvas, m: _local(0, 2.6 * s / 1.8, 0, s, s, s) },
  ], n);
  const path = pathSampler(r.points);
  const boats = [];
  for (let i = 0; i < n; i++) boats.push({ d: ((i + 0.5) / n + phase0) % 1 * path.total, dir: i % 2 ? 1 : -1, ph: i * 2.3 + phase0 * 5 });
  return {
    update(dt, time) {
      if (!fleet.ims[0].parent) return;
      for (let i = 0; i < n; i++) {
        const b = boats[i];
        b.d += b.dir * 5 * dt;
        if (b.d > path.total - 8) { b.d = path.total - 8; b.dir = -1; }
        if (b.d < 8) { b.d = 8; b.dir = 1; }
        const [x, z, ry] = path.at(b.d);
        // Keep right: offset to starboard of the travel direction
        const dx = Math.sin(ry) * b.dir, dz = Math.cos(ry) * b.dir;
        const off = r.width * 0.22;
        fleet.pose(i, x - dz * off, 0.15 + Math.sin(time * 1.1 + b.ph) * 0.08, z + dx * off, Math.atan2(dx, dz));
      }
      fleet.flush();
    },
  };
}
