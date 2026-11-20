// San Francisco: downtown and the northern waterfront, from Oracle Park and the Caltrain depot north
// through SoMa, the Financial District, Union Square, Chinatown, Nob Hill and North Beach to Fisherman's
// Wharf, west to Van Ness and Civic Center, east into the Bay past the Embarcadero piers, built from
// assets/levels/sf_layout.json (Seattle's schema: game units, 0.2 u/m, +X east, +Z south, true north up;
// the two street grids either side of Market Street keep their real angles through each lot's rot).
// Follows seattle.js and shares Chicago's helpers, materials, water and ring (chicago.js LEVEL_KIT,
// chicago_water.js, chicago_arena.js at the layout's ring site); the San Francisco specifics are the
// landmark massing, the cable cars and the F-line streetcars on their real lines, the Bay with its
// ferries, the Bay Bridge's western span out to Yerba Buena Island, Alcatraz, and the surround (the
// hills to the west and south with Sutro Tower, the Golden Gate Bridge, Marin and the East Bay hills
// on the horizon). The ground is flat: the hills inside the play box are not modelled.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL_KIT as LK } from './chicago.js';
import { sfGround, sfFacade, tickSfMaterials, createSfTrees, sfWater } from './sfMaterials.js';
import { createSfHills, sfHillHeight } from './sfLandscape.js';
import { configureChicagoWear } from './chicagoMaterials.js';
import { isMobile } from '../quality.js';
import { assetURL } from '../assetCache.js';
import { splashPool } from './chicago_harbor.js';
import { bakeShoreField, makeWaterMaterial, waterUniforms, waterFX } from './chicago_water.js';
import { buildArena, arenaNoTree, setArenaSite } from './chicago_arena.js';
import { setLookLayerKey } from '../look.js';
import { SF_LOOK } from './sfLook.js';
import { SF_BASE, SF_LANDMARK_GLBS, SF_GENERIC_GLBS, SF_PROP_GLBS, SF_VEHICLE_GLBS, SF_KIT_GLBS } from './sfManifest.js';

// The cartographer's layout (the integrator's placeholder before it: sf_layout_placeholder.json,
// devtools/sf/integrator/make_placeholder.mjs)
const LAYOUT_URL = './assets/levels/sf_layout.json';
// The cartographer's tree survey ([x, z, kind, osm]; layout meta.trees: false when there is none)
const TREES_URL = './assets/levels/sf_trees.json';
// The city past the bounds from the footprint data (boxes, the bay and the lakes over the fetch area: cartographer)
const SURROUND_URL = './assets/levels/sf_surround.json';
// Dressing detail: the cable-car and streetcar lines, the ferry routes, the Bay Bridge, Alcatraz (cartographer)
const DETAIL_URL = './assets/levels/sf_detail.json';
/** The Title Match belt on San Francisco (mat, banners, HUD). */
export const SF_TITLE = 'SAN FRANCISCO HEAVYWEIGHT CHAMPIONSHIP';

// Gameplay minimum street widths (u): San Francisco's real streets are narrow, and the shared
// 7 / 4.5 trims more of its blocks than NYC's. TRIAL (lead's decision pending): null keeps the
// shared minimums; { minMajor, minMinor } passes San Francisco's own to normalizeLayout
const STREET_MIN = { minMajor: 6, minMinor: 4 };
let _layout = null;
/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadSfLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`sf layout: HTTP ${r.status}`);
  const raw = await r.json();
  _layout = LK.normalizeLayout(raw, STREET_MIN || undefined);
  const pt = (p) => (p ? { x: +p.x, z: +p.z, rot: p.rot !== undefined ? +p.rot : undefined } : null);
  // Layout extras (DC's): the ring site, VS spawns, the Lone Soldier start, wave entry points
  // (ring east / west: runway and west screens pulled in, u; gate: false drops the entrance gateway)
  _layout.ring = raw.ring ? { ...pt(raw.ring), east: +raw.ring.east || 0, west: +raw.ring.west || 0, gate: raw.ring.gate, place: raw.ring.place || null } : null;
  _layout.duel = raw.duel ? { a: pt(raw.duel.a), b: pt(raw.duel.b) } : null;
  _layout.soldier = pt(raw.soldier);
  // (the outer ground's street texture follows downtown's grid: meta.gridRotationDeg, degrees clockwise of north)
  _layout.gridRotationDeg = raw.meta?.gridRotationDeg ?? 0;
  _layout.onPier = new Set((raw.buildings || []).filter((o) => o.onPier).map((o) => o.id));
  // (what normalizeLayout leaves out: a landmark's front and whether it stands on a pier or afloat)
  const rawLm = new Map((raw.landmarks || []).map((l) => [l.id, l]));
  for (const lm of _layout.landmarks) {
    const r = rawLm.get(lm.id) || {};
    lm.frontDir = Array.isArray(r.frontDir) ? [+r.frontDir[0], +r.frontDir[1]] : null;
    lm.onPier = !!r.onPier; lm.onWater = !!r.onWater;
  }
  _layout.approaches = (raw.approaches || []).map((p) => (Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.z]));
  // Optional: the parks are scattered procedurally without it (meta.trees
  // false: no survey, no fetch and no 404)
  if (raw.meta?.trees !== false) {
    try {
      const tr = await fetch(TREES_URL, { cache: 'no-cache' });
      if (tr.ok) _layout.trees = (await tr.json()).trees || null;
    } catch (e) { /* no tree survey */ }
  }
  // (meta.surround / meta.detail false: none shipped, nothing fetched; the placeholder carries them inline)
  for (const [key, url] of [['surround', SURROUND_URL], ['detail', DETAIL_URL]]) {
    if (raw[key]) { _layout[key] = raw[key]; continue; }
    if (raw.meta?.[key] === false) continue;
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) _layout[key] = await r.json();
    } catch (e) { /* optional */ }
  }
  return _layout;
}

// --------------- GLB assets (sfManifest.js) ---------------
const _ok = (g) => g.ready && !(isMobile && g.desktopOnly);
const _landmarkGLB = (id) => SF_LANDMARK_GLBS.find((g) => g.ready && (g.ids ? g.ids.includes(id) : g.id === id));
const _kit = (id) => (SF_KIT_GLBS[id]?.ready ? SF_BASE + SF_KIT_GLBS[id].file : null);
// Until San Francisco's own block kit is ready: Chicago's whole generic kit (glass
// towers downtown, brick and masonry elsewhere)
function _kitDefs() {
  const own = SF_GENERIC_GLBS.filter(_ok).map((g) => ({ ...g, url: SF_BASE + g.file }));
  if (own.length) return own;
  return LK.genericGLBs.filter(_ok).map((g) => ({ ...g, url: LK.base + g.file }));
}
// A bucket left empty by the kit folds into the next one down (tall into
// medium, medium into short)
function _bucketDefs(bucket) {
  const defs = _kitDefs();
  const order = ['tall', 'medium', 'short', 'low'];
  for (const b of [bucket, ...order.slice(Math.max(0, order.indexOf(bucket)))]) {
    const list = defs.filter((g) => g.bucket === b);
    if (list.length) return list;
  }
  return defs;
}
/** One kit url for a block of height h (rnd: the block's own seeded random, so a
 *  building gets the same piece every run; avoid: urls standing next door). */
// The layout's style per lot (from its era and height: cartographer) -> the
// kit styles that suit it (sf-design's `style` field); a lot keeps the
// whole bucket when none of them is in it
const STYLE_OK = {
  // (a kit piece's first style word is its family: sf_victorian_* 'victorian lowrise', sf_brick_d 'brick apartment midrise')
  victorian: /^victorian/, brick: /^brick/, warehouse: /^warehouse|^brick lowrise warehouse/, lowrise: /^lowrise/,
  midrise: /^midrise|^brick masonry|^warehouse midrise|^apartment midrise brick/, apartment: /^apartment|^brick apartment/,
  glassslab: /^glassslab/, glasstower: /^glasstower/,
};
function _styled(defs, style) {
  const re = STYLE_OK[style];
  if (!re) return defs;
  const own = defs.filter((g) => g.style && re.test(g.style));
  return own.length ? own : defs;
}
/** The kit pieces for a lot h tall: its bucket, cut to the pieces whose true
 *  height is within ~35% of h (a piece is scaled to the lot height, so a 50 m
 *  piece on a 90 m lot draws storeys 1.8x tall; else the nearest heights),
 *  then to the lot's style where any of those suit it. */
function _sizedDefs(h, style) {
  const all = _bucketDefs(LK.bucket(h));
  const off = (g) => (g.trueM ? Math.abs(Math.log(h / (g.trueM[1] * 0.2))) : 0);
  const near = all.filter((g) => off(g) < 0.3);
  const best = Math.min(...all.map(off));
  return _styled(near.length ? near : all.filter((g) => off(g) <= best + 0.15), style);
}
function _pickGeneric(h, avoid, rnd = Math.random, style = null) {
  const all = _sizedDefs(h, style);
  const fit = all.filter((g) => !g.maxH || h <= g.maxH);
  const own = fit.length ? fit : all;
  const ok = avoid ? own.filter((g) => !avoid.has(g.url)) : own;
  const list = ok.length ? ok : own;
  const share = (g) => g.share ?? 1;
  let r = rnd() * list.reduce((a, g) => a + share(g), 0);
  for (const g of list) { r -= share(g); if (r < 0) return g.url; }
  return list[list.length - 1]?.url || null;
}
// The stone a fallen building's debris and rubble take (city.js tints a
// level kit's chunks with it): a manifest entry's `stone` (0xRRGGBB) when
// given, else by the model's name
const STONE = { wood: 0xd8cdb8, terra: 0xe2dccc, brick: 0x8a4a3a, concrete: 0xa9a397, glass: 0x8f9aa4, granite: 0x9a948c, steel: 0xc8ccd0 };
function _stoneOf(file) {
  const all = [...SF_LANDMARK_GLBS, ...SF_GENERIC_GLBS, ...Object.values(SF_KIT_GLBS)];
  const def = all.find((g) => g.file === file || SF_BASE + g.file === file);
  if (def && def.stone != null) return def.stone;
  const f = String(file);
  return /brick|ghirardelli|warehouse|cable_car_barn|oracle|old_st_marys|sfmoma|jewish/.test(f) ? STONE.brick
    : /victorian|wood|pier_39/.test(f) ? STONE.wood
    : /transamerica|coit|terra|russ|pacbell|shell|hobart|peter_and_paul|phelan/.test(f) ? STONE.terra
    : /bridge|sutro|dewey|cupid|wheel/.test(f) ? STONE.steel
    : /glass|curtain|tower|salesforce|fremont|millennium|rincon|california|mission|market|infinity|lumina|marriott|regis|seasons/.test(f) ? STONE.glass
    : /concrete|embarcadero|hyatt|hilton|stadium|pier|garage|federal|plaza|transit/.test(f) ? STONE.concrete : STONE.granite;
}
// Compass words (and the 45-degree ones: SoMa's grid runs north-east / south-east) as (x, z) unit vectors
const DIR8 = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], northeast: [0.707, -0.707], northwest: [-0.707, -0.707], southeast: [0.707, 0.707], southwest: [-0.707, 0.707] };
/** rot + k * 90 deg whose local +Z (sin r, cos r) points closest to `face` (a compass word or an [x, z] vector). */
function _faceRot(rot, face) {
  const d = Array.isArray(face) ? face : DIR8[face];
  if (!d) return rot;
  let best = rot, bd = -2;
  for (let k = 0; k < 4; k++) {
    const r = rot + k * Math.PI / 2, dot = Math.sin(r) * d[0] + Math.cos(r) * d[1];
    if (dot > bd + 1e-6) { bd = dot; best = r; }
  }
  return best;
}
/** poly ([[x, z], ...]) clipped to the convex region of the half-planes [[nx, nz, c], ...] (nx*x + nz*z <= c). */
function clipPoly(poly, planes) {
  for (const [nx, nz, c] of planes) {
    const out = [], f = (p) => nx * p[0] + nz * p[1] - c;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa <= 0) out.push(a);
      if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    poly = out;
    if (poly.length < 3) return [];
  }
  return poly;
}
/** A small seeded random from a string (mulberry32 on its hash). */
function _seeded(key) {
  let t = 2166136261;
  for (let i = 0; i < key.length; i++) t = Math.imul(t ^ key.charCodeAt(i), 16777619);
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Building GLB urls the San Francisco level loads. */
export function sfBuildingGLBs() {
  return [...new Set([
    ...SF_LANDMARK_GLBS.filter((g) => g.ready).map((g) => SF_BASE + g.file),
    ...Object.keys(SF_KIT_GLBS).filter((id) => !(isMobile && SF_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ..._kitDefs().map((g) => g.url),
  ])];
}
/** GLB urls with a <name>_lod1.glb twin on disk. */
export function sfLod1GLBs() {
  return [...SF_LANDMARK_GLBS.filter((g) => g.ready && g.lod1 !== false).map((g) => SF_BASE + g.file),
    ...Object.keys(SF_KIT_GLBS).filter((id) => SF_KIT_GLBS[id].lod1 !== false).map(_kit).filter(Boolean),
    ...SF_GENERIC_GLBS.filter((g) => _ok(g) && g.lod1 !== false).map((g) => SF_BASE + g.file),
    ...SF_PROP_GLBS.filter((p) => p.ready && p.lod1 !== false).map((p) => SF_BASE + p.file),
    ...SF_VEHICLE_GLBS.filter((v) => v.ready && v.lod1 !== false).map((v) => v.url)];
}
/** San Francisco-only street props as [{ name, url }]. */
export function sfPropGLBs() {
  return SF_PROP_GLBS.filter((p) => p.ready).map((p) => ({ name: p.name, url: SF_BASE + p.file }));
}
/** San Francisco-only vehicle defs for loadCarTemplates. */
export function sfVehicleGLBs() {
  return SF_VEHICLE_GLBS.filter((v) => v.ready).map((v) => ({ ...v, levels: ['sf'] }));
}

// --------------- materials ---------------
const FALLBACK_TEX = 'seattle_fallback_'; // (the shared tiling fallback facades)
let _D = null;
/** San Francisco's own massing surfaces on top of the shared (Chicago) set. */
function sfMats(M) {
  if (_D) return _D;
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _D = {
    limestone: std(0xd2c6ae, 0.85), limeShade: std(0xb8ab94, 0.88), brick: std(0x9a6a52, 0.9), granite: std(0x8f8a82, 0.8),
    glass: std(0x3e5366, 0.3, 0.1), glassLight: std(0x8ea4b6, 0.32, 0.1), steel: std(0xb6bcc2, 0.35, 0.1),
    steelDark: std(0x37403c, 0.6, 0.2), // (pier piles, rails)
    gold: std(0xc8a040, 0.5, 0.2), // (City Hall's gilding)
    ferryBlue: std(0x2a5a8c, 0.6), // (the Bay ferries' band)
    copper: std(0x6c9c86, 0.7), roofDark: std(0x4a4c50, 0.85), slate: std(0x5c6066, 0.8),
    gravel: sfGround(new THREE.MeshStandardMaterial(), 'gravel'),
  };
  // Tiling fallback facades for the procedural massing (FALLBACK_TEX:
  // the shared seattle_fallback_* maps): glass curtain wall, stone, brick;
  // UVs are world-tiled per face by _tileUVs (tile in u)
  const tl = new THREE.TextureLoader(), tex = (f, srgb) => {
    const t = tl.load(assetURL('./assets/textures/' + f));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  for (const [kind, mats, tint, tile] of [['glass', ['glass', 'glassLight'], [0xffffff, 0xdfe8f0], [9.12, 17.08]], ['stone', ['limestone', 'limeShade', 'granite'], [0xffffff, 0xe0d8cc, 0xb8b4ae], [8, 8]], ['brick', ['brick'], [0xffffff], [9.6, 13.4]]]) {
    const map = tex(`${FALLBACK_TEX}${kind}_color.jpg`, true), normalMap = tex(`${FALLBACK_TEX}${kind}_normal.jpg`, false);
    mats.forEach((k, i) => { Object.assign(_D[k], { map, normalMap }); _D[k].color.setHex(tint[i]); _D[k].userData.tile = [tile[0] * 0.2, tile[1] * 0.2]; });
  }
  for (const m of Object.values(_D)) m.userData.shared = true;
  return _D;
}
/** World-tiled UVs on a procedural massing group (a box projection per vertex
 *  by its normal: the side faces run u along the wall, v up; tops in plan),
 *  each mesh at its material's tile size (userData.tile, u). */
function _tileUVs(group) {
  group.traverse((o) => {
    const t = o.isMesh && o.material.userData.tile;
    if (!t) return;
    const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    if (!p || !n || !uv) return;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      if (ny > nx && ny > nz) uv.setXY(i, p.getX(i) / t[0], p.getZ(i) / t[0]);
      else uv.setXY(i, (nx > nz ? p.getZ(i) : p.getX(i)) / t[0], p.getY(i) / t[1]);
    }
    uv.needsUpdate = true;
  });
}

// --------------- procedural landmark massing ---------------
// Each returns a Group centred on (0, 0), base at y = 0, h the tallest
// point (spire included), inside roughly w (x) by d (z). Stand-ins until a
// GLB is ready; hm: the layout's roof height (h is the true height incl. spire).
const BUILDERS = {
  pyramid(h, w, d, M, D) {
    // The Transamerica Pyramid: the white tapering shaft on its crossed base truss, the two wings high up, the spire
    const m = new LK.Massing();
    const r = Math.min(w, d) / 2 * Math.SQRT2, shaft = h * 0.8, base = h * 0.06;
    m.cyl(D.limeShade, r * 0.94, r, base, 4, 0, 0, 0, Math.PI / 4);
    m.cyl(D.limestone, r * 0.1, r * 0.94, shaft - base, 4, 0, base, 0, Math.PI / 4);
    for (const s of [-1, 1]) m.box(D.limestone, w * 0.07, h * 0.36, d * 0.2, s * w * 0.2, h * 0.42);
    m.cyl(D.steel, r * 0.005, r * 0.1, h - shaft, 4, 0, shaft, 0, Math.PI / 4);
    return m.build();
  },
  obelisk(h, w, d, M, D) {
    // Salesforce Tower: a rounded square shaft tapering into the hollow crown
    const m = new LK.Massing();
    const r = Math.min(w, d) / 2;
    m.cyl(D.glassLight, r * 0.94, r, h * 0.55, 12);
    m.cyl(D.glassLight, r * 0.62, r * 0.94, h * 0.35, 12, 0, h * 0.55);
    m.cyl(D.steel, r * 0.5, r * 0.62, h * 0.1, 12, 0, h * 0.9);
    return m.build();
  },
  glass(h, w, d, M, D, hm = h) {
    // Glass office tower: a stone podium, the shaft, a set-back crown and a mast where it has one
    const m = new LK.Massing();
    const roof = Math.min(hm, h), pod = Math.min(roof * 0.08, 6);
    m.box(D.granite, w, pod, d);
    m.box(D.glass, w * 0.9, roof * 0.78 - pod, d * 0.9, 0, pod);
    m.box(D.glassLight, w * 0.78, roof * 0.22, d * 0.78, 0, roof * 0.78);
    if (h > roof + 1) m.cyl(D.steel, w * 0.015, w * 0.04, h - roof, 6, 0, roof);
    return m.build();
  },
  slab(h, w, d, M, D) {
    // Embarcadero Center: a thin stepped concrete slab on its podium
    const m = new LK.Massing();
    m.box(D.limeShade, w, h * 0.08, d);
    for (const [k, y0, y1] of [[1, 0.08, 0.7], [0.82, 0.7, 0.88], [0.6, 0.88, 1]]) m.box(D.limestone, w * 0.9 * k, h * (y1 - y0), d * 0.6, 0, h * y0);
    return m.build();
  },
  masonry(h, w, d, M, D, hm = h) {
    // A 1920s tower (the Russ, PacBell and Shell buildings, the Nob Hill hotels): a base, the shaft, stepped crown
    const m = new LK.Massing();
    const roof = Math.min(hm, h);
    m.box(D.limeShade, w, roof * 0.12, d);
    m.box(D.limestone, w * 0.94, roof * 0.6, d * 0.94, 0, roof * 0.12);
    m.box(D.limestone, w * 0.7, roof * 0.18, d * 0.7, 0, roof * 0.72);
    m.box(D.limeShade, w * 0.46, h - roof * 0.9, d * 0.46, 0, roof * 0.9);
    return m.build();
  },
  ferry(h, w, d, M, D, hm = h) {
    // The Ferry Building: the long arcaded hall and its clock tower in the middle of the front
    const m = new LK.Massing();
    const roof = Math.min(hm, h * 0.3), L = Math.max(w, d), T = Math.min(w, d), along = w >= d;
    m.box(D.limestone, along ? L : T, roof, along ? T : L);
    m.box(D.roofDark, along ? L * 0.96 : T * 0.4, roof * 0.2, along ? T * 0.4 : L * 0.96, 0, roof);
    const t = T * 0.2;
    m.box(D.limestone, t, h * 0.62, t, 0, 0);
    m.box(D.limeShade, t * 0.8, h * 0.2, t * 0.8, 0, h * 0.62);
    m.cyl(D.limestone, t * 0.12, t * 0.36, h * 0.18, 8, 0, h * 0.82);
    return m.build();
  },
  coit(h, w, d, M, D) {
    // Coit Tower: the fluted white shaft, the arcade and the open ring at the top, on its low base
    const m = new LK.Massing();
    const r = Math.min(w, d) * 0.2;
    m.box(D.limestone, w * 0.7, h * 0.1, d * 0.7);
    m.cyl(D.limestone, r * 0.86, r, h * 0.72, 16, 0, h * 0.1);
    m.cyl(D.limeShade, r * 0.9, r * 0.9, h * 0.1, 16, 0, h * 0.82);
    m.cyl(D.limestone, r * 0.72, r * 0.76, h * 0.08, 16, 0, h * 0.92);
    return m.build();
  },
  dome(h, w, d, M, D, hm = h) {
    // City Hall: the long granite block, the pedimented centre, the drum and the gilded dome
    const m = new LK.Massing();
    const roof = Math.min(hm, h * 0.34), r = Math.min(w, d) * 0.2;
    m.box(D.limestone, w, roof, d * 0.8);
    m.box(D.limeShade, w * 0.3, roof * 1.1, d, 0, 0);
    m.cyl(D.limestone, r, r, h * 0.26, 20, 0, roof);
    m.add(D.slate, new THREE.SphereGeometry(r * 0.96, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, roof + h * 0.26, 0, 0, 0, 0, 1, (h * 0.3) / (r * 0.96), 1);
    m.cyl(D.gold, r * 0.04, r * 0.18, h - roof - h * 0.56, 8, 0, roof + h * 0.56);
    return m.build();
  },
  church(h, w, d, M, D, hm = h) {
    // A twin-towered church (Grace Cathedral, Saints Peter and Paul): the nave and the two west towers
    const m = new LK.Massing();
    const nave = Math.min(hm, h * 0.5), t = Math.min(w, d) * 0.28;
    m.box(D.limestone, w * 0.8, nave, d);
    m.add(D.roofDark, new THREE.CylinderGeometry(w * 0.46, w * 0.46, d * 0.98, 3, 1), 0, nave, 0, 0, Math.PI / 2, 0, 1, 1, 0.5);
    for (const s of [-1, 1]) {
      m.box(D.limestone, t, h * 0.74, t, s * (w / 2 - t / 2), 0, d / 2 - t / 2);
      m.add(D.limeShade, new THREE.ConeGeometry(t * 0.6, h * 0.26, 4), s * (w / 2 - t / 2), h * 0.87, d / 2 - t / 2, Math.PI / 4);
    }
    return m.build();
  },
  shed(h, w, d, M, D) {
    // A pier shed: the arched bulkhead front and a long low hall with a shallow gabled roof
    const m = new LK.Massing();
    m.box(M.concrete, w, h * 0.75, d);
    m.add(D.roofDark, new THREE.CylinderGeometry(Math.min(w, d) * 0.6, Math.min(w, d) * 0.6, Math.max(w, d), 3, 1), 0, h * 0.75, 0, w >= d ? 0 : Math.PI / 2, 0, Math.PI / 2, 1, 0.4, 1);
    return m.build();
  },
  stadium(h, w, d, M, D) {
    // Oracle Park: the stands round three sides of the field, open to the cove
    const m = new LK.Massing();
    const t = Math.min(w, d) * 0.2;
    m.box(D.brick, w, h * 0.55, t, 0, 0, -(d / 2 - t / 2));
    for (const s of [-1, 1]) m.box(D.brick, t, h * (s < 0 ? 0.55 : 0.3), d - t, s * (w / 2 - t / 2), 0, t / 2);
    m.box(M.green, w - 2 * t, 0.12, d - t, 0, 0, t / 2);
    for (const s of [-1, 1]) m.cyl(D.steel, 0.12, 0.2, h, 5, s * w * 0.42, 0, -d * 0.42);
    return m.build();
  },
  ship(h, w, d, M, D) {
    // A moored ship (the Balclutha, the Liberty ship): the hull, a deckhouse and masts; long axis = the lot's long side
    const m = new LK.Massing();
    const L = Math.max(w, d), Bm = Math.min(w, d), ry = w >= d ? Math.PI / 2 : 0;
    m.box(D.steelDark, Bm * 0.8, h * 0.14, L, 0, 0, 0, ry);
    m.box(M.white, Bm * 0.5, h * 0.08, L * 0.3, 0, h * 0.14, 0, ry);
    for (const k of [-0.3, 0, 0.3]) m.cyl(M.bronze, 0.04, 0.08, h * 0.86, 5, ry ? k * L : 0, h * 0.14, ry ? 0 : k * L);
    return m.build();
  },
  gate(h, w, d, M, D) {
    // The Dragon Gate: stone piers, three green-tiled roofs
    const m = new LK.Massing();
    for (const s of [-1, 1]) m.box(D.granite, w * 0.12, h * 0.6, d * 0.6, s * w * 0.3);
    m.box(D.copper, w, h * 0.14, d, 0, h * 0.6);
    m.box(D.copper, w * 0.5, h * 0.14, d * 0.9, 0, h * 0.8);
    return m.build();
  },
  civic(h, w, d, M, D) {
    // A civic block (the Opera House, the library, the museums, the Old Mint)
    const m = new LK.Massing();
    m.box(D.granite, w, h * 0.12, d);
    m.box(D.limestone, w * 0.98, h * 0.76, d * 0.98, 0, h * 0.12);
    m.box(D.limeShade, w, h * 0.12, d, 0, h * 0.88);
    return m.build();
  },
  monument(h, w, d, M, D) {
    // A sculpture, fountain, column or sign: a plinth and a bronze piece
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.3, 1), d);
    m.cyl(M.bronze, Math.min(w, d) * 0.12, Math.min(w, d) * 0.16, h - Math.min(h * 0.3, 1), 8, 0, Math.min(h * 0.3, 1));
    return m.build();
  },
  block(h, w, d, M, D) {
    // Brick block (Ghirardelli Square, the car barn, Chinatown): a base, the body, a cornice
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.1, 1.2), d);
    m.box(D.brick, w * 0.98, h * 0.86, d * 0.98, 0, Math.min(h * 0.1, 1.2));
    m.box(D.limeShade, w, h * 0.04, d, 0, h * 0.96);
    return m.build();
  },
};
const BUILDER_ALIASES = [
  ['transamerica', 'pyramid'], ['salesforce_tower', 'obelisk'], ['embarcadero_center', 'slab'],
  ['russ_building', 'masonry'], ['pacbell', 'masonry'], ['shell_building', 'masonry'], ['hobart', 'masonry'], ['fairmont', 'masonry'], ['mark_hopkins', 'masonry'], ['st_francis', 'masonry'],
  ['ferry_building', 'ferry'], ['coit', 'coit'], ['city_hall', 'dome'], ['grace_cathedral', 'church'], ['peter_and_paul', 'church'], ['st_marys', 'church'],
  ['pier_45_ships', 'ship'], ['balclutha', 'ship'], ['pier', 'shed'], ['exploratorium', 'shed'], ['cruise_terminal', 'shed'], ['aquarium', 'shed'], ['caltrain', 'shed'], ['moscone', 'shed'], ['transit_center', 'shed'],
  ['oracle_park', 'stadium'], ['stadium', 'stadium'],
  ['dragon_gate', 'gate'], ['bridge', 'gate'],
  ['ghirardelli', 'block'], ['cable_car_barn', 'block'], ['sing_chong', 'block'], ['pagoda', 'block'], ['sentinel', 'block'], ['pacific_union', 'block'], ['jewish_museum', 'block'], ['sfmoma', 'block'],
  ['war_memorial', 'civic'], ['symphony', 'civic'], ['asian_art', 'civic'], ['library', 'civic'], ['auditorium', 'civic'], ['mint', 'civic'], ['flood', 'civic'], ['phelan', 'civic'], ['palace', 'civic'], ['westfield', 'civic'],
  ['cupids_span', 'monument'], ['fountain', 'monument'], ['monument', 'monument'], ['sign', 'monument'], ['statue', 'monument'],
];
/** The massing builder for a landmark: by id, else by its height (a tower above ~60 m). */
function _builderFor(id, h = 0) {
  const s = String(id || '').toLowerCase();
  for (const [k, b] of BUILDER_ALIASES) if (s.includes(k)) return BUILDERS[b];
  return h > 12 ? BUILDERS.glass : null;
}

// --------------- the builder ---------------
// Park lawns kept open of the tree scatter (and of the survey's trees)
const OPEN_LAWN = /fountain|lawn|meadow|mural|field|ballfield/i;
export function buildSf(scene, world, opts, K) {
  const L = _layout;
  if (!L) throw new Error('buildSf: layout not loaded (call loadLevelData first)');
  const M = LK.mats(), D = sfMats(M);
  const { ribbon, polygonGeom, quadAlong, pointInPoly, distToPolyline } = LK;
  const buildings = [];
  // (what the dressing placed, per kind: world.levelStats, read by the QA scripts)
  const stats = { trees: 0 };
  if (world) world.levelStats = stats;
  const grid = new K.BuildingGrid(60);
  const lite = !!opts.lite;
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  K.setBuildingLite(lite);
  setLookLayerKey('sf', SF_LOOK.key, SF_LOOK.az); // (sf-design's light: sfLook.js)
  const smallCull = glb && lite ? { px: 3, maxH: 2, keep: /tree|lamp/i } : null;
  // (instancing tiles as NYC's)
  const instance = () => K.instanceStaticClones(scene, !glb ? Infinity : lite ? 480 : 300, lite ? 185 : 150, smallCull);
  K.setBuildingTile(!glb || lite ? Infinity : 400);
  const B = L.bounds;
  const S = L.scale || 0.2;
  const cxB = (B.minX + B.maxX) / 2, czB = (B.minZ + B.maxZ) / 2;
  // Downtown's grid frame for the outer ground's street texture: u along the
  // avenues (meta.gridRotationDeg clockwise of true north), v across them
  const RG = (L.gridRotationDeg ?? 0) * Math.PI / 180;
  const AX = [Math.sin(RG), -Math.cos(RG)], CX = [Math.cos(RG), Math.sin(RG)];
  const toV = (x, z) => x * CX[0] + z * CX[1], toU = (x, z) => x * AX[0] + z * AX[1];
  const FAR = 3000;
  // The outside of the play rectangle as four convex regions (half-plane lists [nx, nz, c]: nx*x + nz*z <= c)
  const OUTSIDE = [[[1, 0, B.minX]], [[-1, 0, -B.maxX]], [[-1, 0, -B.minX], [1, 0, B.maxX], [0, 1, B.minZ]], [[-1, 0, -B.minX], [1, 0, B.maxX], [0, -1, -B.maxZ]]];
  const animators = [];
  const makeParkTree = createSfTrees(K, lite, glb);
  K.onTemplatesReady((sc, get) => {
    for (const g of [..._kitDefs(), ...SF_LANDMARK_GLBS.filter((d) => d.ready).map((d) => ({ ...d, url: SF_BASE + d.file }))]) {
      get(g.url)?.traverse((o) => {
        if (!o.isMesh) return;
        // A model's own pool surface (material 'water'): the layout's water stands there
        // (hidden on the material, which the placed instances share with the template)
        if (/^water$/i.test(o.material?.name || '')) { o.material.visible = false; return; }
        for (const m of [].concat(o.material)) sfFacade(m, g.file);
      });
    }
  });
  const surfaceWear = configureChicagoWear(null, L.paths, lite);
  if (world) world.chicagoSurfaceWear = surfaceWear;
  animators.push({ update(dt, time) { tickSfMaterials(time); } });
  const SW_TILE = K.TILE.SIDEWALK, ASPHALT_TILE = 2;
  // (an avenue: a road at the major minimum or wider)
  const MAJOR_W = (STREET_MIN?.minMajor ?? 7) - 0.1, SIDEWALK_W = 1.2, PS = 0.8;
  const ring = opts.mode === 'wrestling' && L.ring ? L.ring : null;
  // Landmarks that stand: a district or an area with no structure of its own
  // (Times Square, Bryant Park) is a name on the map, nothing is built there
  // (and a line or a moving thing the level animates itself: the cable cars, the ferries)
  const ANIMATED = /^(cable_car|streetcar|ferry_in_bay)$/;
  const LMS = L.landmarks.filter((lm) => lm.kind !== 'district' && lm.kind !== 'line' && !ANIMATED.test(lm.id) && lm.h > 0.05);
  // A grandstand that would stand on a landmark is left out; standing room
  // takes that side (chicago_arena.js)
  const lmBox = (lm) => {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    return [lm.x, lm.z, (lm.w * c + lm.d * s) / 2, (lm.w * s + lm.d * c) / 2];
  };
  const STAND_REL = { n: [-42, 14, -76, -50], s: [-42, 42, 50, 76] }; // x0, x1, z0, z1 from the ring centre
  const standsFree = (id) => {
    const [x0, x1, z0, z1] = STAND_REL[id];
    return !LMS.some((lm) => {
      if (lm.kind === 'prop' && lm.h < 4) return false; // small memorials and markers give way
      const [x, z, hw, hd] = lmBox(lm);
      return x + hw > ring.x + x0 && x - hw < ring.x + x1 && z + hd > ring.z + z0 && z - hd < ring.z + z1;
    });
  };
  // (the layout's ring entry may trim the runway (east) and the west screens (west) or drop the gateway)
  if (ring) setArenaSite({ x: ring.x, z: ring.z, title: SF_TITLE, place: ring.place || 'SOUTH OF MARKET', fountain: false, stands: ['n', 's'].filter(standsFree).join(''), east: ring.east || 0, west: ring.west || 0, gate: ring.gate ?? true, flag: 'sf',
    // (the fight camera settles south-west of the pair, looking north-east: the Financial District skyline behind them)
    hardAz: ring.hardAz ?? -0.785 });
  const ringPoly = ring ? arenaNoTree() : null;
  // Landmarks only give way to the venue's structures: the mat, the entrance
  // gate's legs, the big screens, the grandstands built (from the ring centre,
  // chicago_arena.js; a corner clipped by under 1.5u stays), and small props inside the venue
  const VENUE_REL = [[-47.5, 47.5, -47.5, 47.5], [-51, -47, -46, -18], [-51, -47, 18, 46]];
  const onMat = (x, z, hw, hd) => !!ring && [...VENUE_REL, ...['n', 's'].filter(standsFree).map((id) => STAND_REL[id])].some(([x0, x1, z0, z1]) =>
    x + hw - 1.5 > ring.x + x0 && x - hw + 1.5 < ring.x + x1 && z + hd - 1.5 > ring.z + z0 && z - hd + 1.5 < ring.z + z1);
  // The venue's bounding box: blocks standing in it are not built for the match
  const ringBox = ringPoly && ringPoly.reduce((a, [x, z]) => [Math.min(a[0], x), Math.max(a[1], x), Math.min(a[2], z), Math.max(a[3], z)], [Infinity, -Infinity, Infinity, -Infinity]);
  const inPlayBox = (x, z) => x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ;
  const inRingBox = (x, z, hw = 0, hd = 0) => !!ringBox && x + hw > ringBox[0] && x - hw < ringBox[1] && z + hd > ringBox[2] && z - hd < ringBox[3];

  const addBatch = (geom, mat, shadow = true) => {
    const m = new THREE.Mesh(geom, mat);
    m.receiveShadow = shadow;
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.userData.batch = true;
    scene.add(m);
    return m;
  };

  // ---- ground ----
  const GROUND = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) + 1000;
  {
    const rep = GROUND / 6;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND, 1, 1), new THREE.MeshStandardMaterial({
      map: K.loadTileTex('sidewalk_color.jpg', rep, rep), normalMap: K.loadDataTex('sidewalk_normal.jpg', rep, rep),
      normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: K.loadDataTex('sidewalk_roughness.jpg', rep, rep),
      roughness: 0.95, color: 0x9c9a94,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cxB, 0, czB);
    ground.receiveShadow = true;
    ground.renderOrder = 1;
    ground.matrixAutoUpdate = false; ground.updateMatrix();
    scene.add(ground);
  }

  // ---- water: the Bay, McCovey Cove and Mission Creek, the fountains and pools ----
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
  const isWater = (x, z) => {
    const i = Math.floor((x - wx0) / waterCell), j = Math.floor((z - wz0) / waterCell);
    if (i < 0 || j < 0 || i >= wcx || j >= wcz) return false;
    return waterGrid[i * wcz + j] === 1;
  };
  let waterSplash = null;
  // The bay and the lake carry on past the bounds: the surround file's water
  // over the whole fetch area ({ name, polygon, holes }; else the Bay as
  // everything west of the bounds), clipped to the outside of the play
  // rectangle in four pieces, so they never overlap the layout's water
  const farWater = []; // { polygon, holes }
  const farRivers = L.surround?.water?.length ? L.surround.water.map((w) => (Array.isArray(w) ? { polygon: w, holes: [] } : { polygon: w.polygon, holes: w.holes || [] }))
    : [{ polygon: [[B.minX - FAR, B.minZ - FAR], [B.minX, B.minZ - FAR], [B.minX, B.maxZ + FAR], [B.minX - FAR, B.maxZ + FAR]], holes: [] }];
  for (const river of farRivers) {
    for (const region of OUTSIDE) {
      const piece = clipPoly(river.polygon, region);
      if (piece.length < 3) continue;
      farWater.push({ polygon: piece, holes: river.holes.map((h) => clipPoly(h, region)).filter((h) => h.length >= 3) });
    }
  }
  if (L.water.length) {
    const shore = [[], [], []], waterMeshes = [];
    if (farWater.length) {
      const fm = new THREE.Mesh(mergeGeometries(farWater.map((p) => polygonGeom(p.polygon, 0.19, 1, p.holes)), false), M.water);
      fm.matrixAutoUpdate = false; fm.updateMatrix();
      scene.add(fm);
      waterMeshes.push(fm);
    }
    const onEdge = (p) => p[0] >= B.maxX - 0.5 || p[0] <= B.minX + 0.5 || p[1] <= B.minZ + 0.5 || p[1] >= B.maxZ - 0.5;
    for (const w of L.water) {
      const wm = new THREE.Mesh(polygonGeom(w.polygon, w.kind === 'pond' ? 0.08 : 0.2, 1, w.holes), M.water);
      wm.receiveShadow = true;
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      wm.userData.batch = true;
      scene.add(wm);
      waterMeshes.push(wm);
      // Granite coping round the pools and the basin, a seawall on the river
      for (const ring of [w.polygon, ...w.holes]) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          if (onEdge(a) && onEdge(b)) continue;
          const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
          if (l < 0.05) continue;
          quadAlong(shore[0], shore[1], shore[2], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dx / l, dz / l, l + 0.3, w.kind === 'pond' ? 0.4 : 0.6, w.kind === 'pond' ? 0.16 : 0.35);
        }
      }
    }
    if (shore[0].length) addBatch(LK.geom(...shore), M.seawall);
    const field = bakeShoreField([...L.water, ...farWater.map((p) => ({ kind: 'lake', polygon: p.polygon, holes: p.holes }))], [], { x0: B.minX - 100, z0: B.minZ - 100, x1: B.maxX + 100, z1: B.maxZ + 100 });
    const waterMat = makeWaterMaterial(field);
    for (const wm of waterMeshes) wm.material = waterMat;
    const WU = waterUniforms(waterMat);
    sfWater(WU); // (sf-design's Sound colours)
    animators.push({ update(dt, time) { WU.uTime.value = time; } });
    waterSplash = splashPool(scene, lite ? 200 : 600, lite ? 12 : 32);
    animators.push(waterSplash);
    const wfx = waterFX(waterMat, field, waterSplash, lite);
    animators.push(wfx);
    if (world) world.water = wfx;
  }
  // San Francisco's own ground maps (sfMaterials.js): sidewalks, lawns, plazas, park paths
  const swMat = sfGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'pavement');
  const lawnMat = sfGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'lawn');
  const grassMat = sfGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'grass');
  const plazaMat = sfGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'plaza');
  for (const m of [swMat, lawnMat, grassMat, plazaMat]) m.userData.shared = true;

  // ---- roads ----
  // Title Match: the streets through the venue (Constitution Ave, 15th and
  // 17th St) are closed under it: polylines are cut where they enter the
  // venue box (+ their half width), so no asphalt, markings or traffic there
  const clipVenue = (pts, hw) => {
    if (!ringBox) return [pts];
    const runs = [];
    let run = [];
    const visit = (p) => {
      if (inRingBox(p[0], p[1], hw + 1, hw + 1)) { if (run.length >= 2) runs.push(run); run = []; } else run.push(p);
    };
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        // (sampled every 2u only where the segment comes near the venue: elsewhere the road keeps its
        // own points, so the car graph's edges stay block-long, lamps and parking get their spacing)
        const a = pts[i - 1], b = pts[i], n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
        if (inRingBox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 + hw + 1, Math.abs(b[1] - a[1]) / 2 + hw + 1)) {
          for (let k = 1; k < n; k++) visit([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
        }
      }
      visit(pts[i]);
    }
    if (run.length >= 2) runs.push(run);
    return runs;
  };
  const roads = L.roads.filter((r) => !(lite && r.kind === 'alley')).flatMap((r) => (ringBox ? clipVenue(r.points, r.width / 2).map((points) => ({ ...r, points })) : [r]));
  const inB = ([x, z]) => x > B.minX - 10 && x < B.maxX + 10 && z > B.minZ - 10 && z < B.maxZ + 10;
  const netRoads = [];
  for (const r0 of L.netRoads) for (const points of clipVenue(r0.points, r0.width / 2)) {
    const r = { width: r0.width, points };
    let run = [];
    for (const p of r.points) {
      if (inB(p)) run.push(p);
      else { if (run.length >= 2) netRoads.push({ width: r.width, points: run }); run = []; }
    }
    if (run.length >= 2) netRoads.push({ width: r.width, points: run });
  }
  const net = K.buildRoadNet(netRoads, 0.3);
  let roadMat = null;
  {
    const asphalt = roadMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    sfGround(asphalt, 'asphalt');
    const uvs = 1 / ASPHALT_TILE;
    const nodeW = new Float32Array(net.nodes.length);
    for (const e of net.edges) {
      const w = e.laneOff * 4;
      nodeW[e.a] = Math.max(nodeW[e.a], w); nodeW[e.b] = Math.max(nodeW[e.b], w);
    }
    const yel = [[], [], []], wht = [[], [], []], cross = [[], [], []];
    for (const r of roads) addBatch(ribbon(r.points, -r.width / 2, r.width / 2, 0.05, uvs), asphalt);
    const lw = 0.1, dash = 1.8, gap = 3.2, cb = 0.1;
    for (const e of net.edges) {
      const A = net.nodes[e.a], Bn = net.nodes[e.b];
      const w = e.laneOff * 4;
      const tA = A.edges.length >= 3 ? nodeW[e.a] / 2 + SIDEWALK_W : 0;
      const tB = Bn.edges.length >= 3 ? nodeW[e.b] / 2 + SIDEWALK_W : 0;
      const len = e.len - tA - tB;
      if (len <= 0.5) continue;
      const p0 = [A.x + e.dx * tA, A.z + e.dz * tA], p1 = [Bn.x - e.dx * tB, Bn.z - e.dz * tB];
      for (const s of [-1, 1]) {
        addBatch(ribbon([p0, p1], s > 0 ? w / 2 : -w / 2 - SIDEWALK_W, s > 0 ? w / 2 + SIDEWALK_W : -w / 2, 0.09, 1 / SW_TILE), swMat);
        addBatch(ribbon([p0, p1], s > 0 ? w / 2 - cb : -w / 2 - cb, s > 0 ? w / 2 + cb : -w / 2 + cb, 0.1), M.curb);
      }
      const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
      if (w >= MAJOR_W) {
        for (const o of [-lw * 1.4, lw * 1.4]) quadAlong(yel[0], yel[1], yel[2], cx - e.dz * o, cz + e.dx * o, e.dx, e.dz, len, lw, 0.07);
        for (const o of [-w / 4, w / 4]) {
          for (let t = 1; t + dash < len; t += dash + gap + 1) {
            const px = p0[0] + e.dx * (t + dash / 2) - e.dz * o, pz = p0[1] + e.dz * (t + dash / 2) + e.dx * o;
            quadAlong(wht[0], wht[1], wht[2], px, pz, e.dx, e.dz, dash, lw * 0.85, 0.07);
          }
        }
      } else if (w >= (STREET_MIN?.minMinor ?? 4.5)) {
        for (let t = 0.5; t + dash < len; t += dash + gap) {
          quadAlong(yel[0], yel[1], yel[2], p0[0] + e.dx * (t + dash / 2), p0[1] + e.dz * (t + dash / 2), e.dx, e.dz, dash, lw * 1.1, 0.07);
        }
      }
      for (const [node, sgn, t] of [[A, 1, tA], [Bn, -1, tB]]) {
        if (node.edges.length < 3) continue;
        const d0 = t - SIDEWALK_W / 2 - 0.3;
        const ccx = node.x + e.dx * d0 * sgn, ccz = node.z + e.dz * d0 * sgn;
        const pitch = 0.5, inset = 0.25;
        const bars = Math.max(3, Math.floor((w - 2 * inset) / pitch));
        for (let k = 0; k < bars; k++) {
          const o = -w / 2 + inset + (k + 0.5) * (w - 2 * inset) / bars;
          quadAlong(cross[0], cross[1], cross[2], ccx - e.dz * o, ccz + e.dx * o, e.dx, e.dz, 1.3, pitch / 2, 0.075);
        }
      }
    }
    // Minor streets (not in the car graph): their own sidewalks, curbs and centre line
    {
      const onAnyRoad = LK.roadIndex(roads, 0, 0);
      for (const r of roads) {
        if (r.kind !== 'minor') continue;
        const w = r.width, pts = [r.points[0]];
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1], b = r.points[i], k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          for (let j = 1; j <= k; j++) pts.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
        }
        const keep = [[], []];
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          const o = w / 2 + SIDEWALK_W / 2;
          keep[0].push(!onAnyRoad(mx + dz * o, mz - dx * o, 0));
          keep[1].push(!onAnyRoad(mx - dz * o, mz + dx * o, 0));
        }
        keep.forEach((side, si) => {
          const s = si ? 1 : -1;
          for (let i = 0; i < side.length;) {
            if (!side[i]) { i++; continue; }
            let j = i;
            while (j < side.length && side[j]) j++;
            const run = pts.slice(i, j + 1);
            addBatch(ribbon(run, s > 0 ? w / 2 : -w / 2 - SIDEWALK_W, s > 0 ? w / 2 + SIDEWALK_W : -w / 2, 0.09, 1 / SW_TILE), swMat);
            addBatch(ribbon(run, s > 0 ? w / 2 - cb : -w / 2 - cb, s > 0 ? w / 2 + cb : -w / 2 + cb, 0.1), M.curb);
            i = j;
          }
        });
        let t = 0.5;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          if (keep[0][i] && keep[1][i]) {
            const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
            for (; t + dash <= l; t += dash + gap) quadAlong(yel[0], yel[1], yel[2], a[0] + dx * (t + dash / 2), a[1] + dz * (t + dash / 2), dx, dz, dash, lw * 1.1, 0.07);
          }
          t = Math.max(0, t - l);
        }
      }
    }
    const jp = [[], [], []];
    net.nodes.forEach((n, i) => {
      if (n.edges.length < 3) return;
      const e = net.edges[n.edges[0]];
      quadAlong(jp[0], jp[1], jp[2], n.x, n.z, e.dx, e.dz, nodeW[i] + 0.6, nodeW[i] + 0.6, 0.06);
    });
    if (jp[0].length) {
      const g = LK.geom(...jp);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * uvs, p.getZ(i) * uvs);
      addBatch(g, asphalt);
    }
    if (yel[0].length) addBatch(LK.geom(...yel), M.yellow, false);
    if (wht[0].length) addBatch(LK.geom(...wht), M.whiteLine, false);
    if (cross[0].length) {
      const cw = new THREE.Mesh(LK.geom(...cross), new THREE.MeshStandardMaterial({
        color: 0xd9d9d2, roughness: 0.85, map: K.wornPaintTex(), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      cw.receiveShadow = true;
      cw.matrixAutoUpdate = false; cw.updateMatrix();
      scene.add(cw);
    }
  }
  K.setCarNet(net);
  stats.netEdges = net.edges.length; stats.netMajor = net.edges.filter((e) => e.laneOff * 4 >= MAJOR_W).length;

  // ---- parks: Union Square, Washington Square, Yerba Buena Gardens, Civic Center Plaza, the piers and plazas ----
  const onRoad = LK.roadIndex(roads, SIDEWALK_W, 2);
  const lmBoxes = LMS.map((lm) => {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    return [lm.x, lm.z, (lm.w * c + lm.d * s) / 2 + 2, (lm.w * s + lm.d * c) / 2 + 2];
  });
  const noTree = ringPoly ? [ringPoly] : [];
  const onRing = (x, z) => !!ringPoly && pointInPoly(x, z, ringPoly);
  const onLandmark = (x, z) => lmBoxes.some(([lx, lz, hw, hd]) => Math.abs(x - lx) < hw && Math.abs(z - lz) < hd)
    || noTree.some((poly) => pointInPoly(x, z, poly));
  for (const q of L.paths) for (const pts of clipVenue(q.points, 0)) addBatch(ribbon(pts, -Math.max(0.3, q.width / 2), Math.max(0.3, q.width / 2), 0.04), D.gravel);
  const treeOK = (x, z, poly) => (!poly || pointInPoly(x, z, poly)) && !isWater(x, z) && !onRoad(x, z, 1.2) && !onLandmark(x, z);
  let trees = 0;
  // The surveyed trees, in order until the cap: the park trees and conifers,
  // then the street trees thinned evenly.
  // Instanced (draws by template, not by tree); phone LOW keeps the park.
  // (phones with GLB trees: 2000, the survey's park and evergreen trees first; the VS walk view sat over the 2M budget)
  const TREE_CAP = L.trees ? (!glb ? 1400 : lite ? 2000 : 7500) : lite ? 260 : 900;
  const tree = (x, z, s, kind) => { if (trees < TREE_CAP) { scene.add(makeParkTree(x, z, s * PS, kind)); trees++; } };
  if (L.trees) {
    // (open lawns stay open: the International Fountain lawn, the Mural Amphitheatre, the ring box)
    const meadows = L.parks.filter((p) => OPEN_LAWN.test(p.name)).map((p) => p.polygon);
    // (street trees stand on the sidewalk: only the carriageway itself is off limits for them; the
    // rest keep the sidewalk-wide margin)
    const carriage = LK.roadIndex(roads, 0, 2);
    // The survey's street trees stand on the real (narrower) sidewalks, so the widened game
    // streets (7u avenues, 4.5u side streets) swallow most of them: a street / plane tree inside
    // a carriageway moves out square to the nearest road's edge, onto the sidewalk (+0.5u)
    const segs = new Map(), SC = 12;
    for (const r of roads) for (let i = 0; i + 1 < r.points.length; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1], T = r.width / 2 + 1;
      for (let cx = Math.floor((Math.min(ax, bx) - T) / SC); cx <= Math.floor((Math.max(ax, bx) + T) / SC); cx++) {
        for (let cz = Math.floor((Math.min(az, bz) - T) / SC); cz <= Math.floor((Math.max(az, bz) + T) / SC); cz++) {
          const k = cx + ':' + cz;
          if (!segs.has(k)) segs.set(k, []);
          segs.get(k).push(r, i);
        }
      }
    }
    const toKerb = (t) => {
      if (t[2] !== 'street' && t[2] !== 'plane') return t;
      const [x, z] = t, list = segs.get(Math.floor(x / SC) + ':' + Math.floor(z / SC));
      if (!list) return t;
      let best = null, bd = Infinity;
      for (let j = 0; j < list.length; j += 2) {
        const r = list[j], i = list[j + 1], [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * u, pz = az + dz * u, d = Math.hypot(x - px, z - pz), over = d - r.width / 2;
        if (over < 0.4 && over - 0.4 < bd) { bd = over - 0.4; best = [px, pz, d, r.width / 2 + 0.5, dx, dz]; }
      }
      if (!best) return t;
      const [px, pz, d, to, dx, dz] = best;
      // (a tree on the centre line: off to the side square to the road)
      const nx = d > 1e-3 ? (x - px) / d : -dz / Math.hypot(dx, dz), nz = d > 1e-3 ? (z - pz) / d : dx / Math.hypot(dx, dz);
      return [px + nx * to, pz + nz * to, t[2], t[3]];
    };
    L.trees = L.trees.map(toKerb);
    const ok = ([x, z, kind]) => !isWater(x, z) && (kind === 'street' || kind === 'plane' ? !carriage(x, z, 0.15) : !onRoad(x, z, 0.3)) && !onLandmark(x, z) && !inRingBox(x, z) && !meadows.some((q) => pointInPoly(x, z, q));
    const list = [];
    for (const kinds of [['park', 'evergreen'], ['plane'], ['street', null]]) {
      const tier = L.trees.filter((t) => kinds.includes(t[2]) || (kinds.includes(null) && !['park', 'evergreen', 'plane', 'street'].includes(t[2]))).filter(ok);
      const room = TREE_CAP - list.length;
      if (room <= 0) break;
      const step = tier.length > room ? tier.length / room : 1;
      for (let i = 0; i < tier.length && list.length < TREE_CAP; i += step) list.push(tier[Math.floor(i)]);
    }
    // (sfLandscape.js sizes each layout kind to its species' true height at s = 1)
    for (const [x, z, kind] of list) tree(x, z, 0.9 + Math.random() * 0.2, kind);
    stats.treesSurvey = L.trees.length; stats.treesOk = L.trees.filter(ok).length;
    // (why the rest were left out: the first test each fails)
    const why = { water: 0, road: 0, landmark: 0, ring: 0, lawn: 0 };
    for (const [x, z, kind] of L.trees) {
      if (isWater(x, z)) why.water++;
      else if (kind === 'street' || kind === 'plane' ? carriage(x, z, 0.15) : onRoad(x, z, 0.3)) why.road++;
      else if (onLandmark(x, z)) why.landmark++;
      else if (inRingBox(x, z)) why.ring++;
      else if (meadows.some((q) => pointInPoly(x, z, q))) why.lawn++;
    }
    stats.treesDropped = why;
  }
  stats.trees = trees;
  // The waterfront piers (parks with surface 'pier'): a concrete deck
  // 0.8u over the water on a dark pile edge, under their sheds
  const PIER_Y = 0.8, pierDecks = [], pierEdge = [[], [], []];
  const pierPolys = L.parks.filter((p) => p.surface === 'pier').map((p) => p.polygon);
  for (const p of L.parks) {
    if (p.surface !== 'pier') continue;
    pierDecks.push(polygonGeom(p.polygon, PIER_Y, 1 / SW_TILE));
    const [pos, , idx] = pierEdge;
    for (let i = 0; i < p.polygon.length; i++) {
      const a = p.polygon[i], b = p.polygon[(i + 1) % p.polygon.length], i0 = pos.length / 3;
      // (both faces, own vertices each: rings come in either winding)
      for (let k = 0; k < 2; k++) pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], PIER_Y, b[1], a[0], PIER_Y, a[1]);
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3, i0 + 4, i0 + 6, i0 + 5, i0 + 4, i0 + 7, i0 + 6);
    }
  }
  if (pierDecks.length) {
    // (sf-design's timber deck)
    const deckMat = sfGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'pier');
    deckMat.userData.shared = true;
    addBatch(mergeGeometries(pierDecks, false), deckMat);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pierEdge[0], 3));
    g.setIndex(pierEdge[2]);
    g.computeVertexNormals();
    addBatch(g, D.steelDark);
  }
  for (const p of L.parks) {
    if (p.surface === 'pier') continue;
    const plaza = { parking: roadMat, gravel: D.gravel, paved: plazaMat }[p.surface] || plazaMat;
    const uv = p.kind === 'plaza' && p.surface === 'parking' ? 1 / ASPHALT_TILE : p.surface === 'paved' ? 1 / SW_TILE : 1 / 14;
    const base = p.kind === 'plaza' ? plaza : p.kind === 'lawn' ? lawnMat : grassMat;
    const lay = !p.fill ? 0 : p.kind === 'plaza' ? 3 : 2;
    addBatch(polygonGeom(p.polygon, 0.03, uv), lay ? LK.decal(base, lay) : base);
    for (const q of p.paths) addBatch(ribbon(q.points, -q.width / 2, q.width / 2, 0.04), D.gravel);
    if (p.kind === 'plaza' || p.kind === 'beach' || L.trees) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // A loose scatter, denser where it is woodland (open lawns stay open)
    if (OPEN_LAWN.test(p.name)) continue;
    const step = (lite ? 16 : 11) * 0.7;
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (Math.random() < (p.kind === 'lawn' ? 0.8 : 0.55)) continue;
      const tx = x + (Math.random() - 0.5) * step * 0.7, tz = z + (Math.random() - 0.5) * step * 0.7;
      if (p.paths.some((q) => distToPolyline(tx, tz, q.points) < q.width / 2 + 2)) continue;
      if (treeOK(tx, tz, p.polygon)) tree(tx, tz, 0.9 + Math.random() * 0.2, 'park');
    }
  }

  // ---- buildings: the city's blocks from the kit ----
  const picked = new Map();
  // Turned lots (the grid's ~29 deg): the building keeps its axis box (w, d)
  // for the broad phase and carries its own footprint (obb) for contact,
  // camera rays and the look map; kit pieces are fitted to the lot itself
  const turned = (r) => Math.abs(Math.sin(2 * (r || 0))) > 0.05;
  const orient = (b, w, d, r) => { if (turned(r)) b.obb = { hw: w / 2, hd: d / 2, c: Math.cos(r), s: Math.sin(r) }; };
  const lotOf = (w, d, r) => (turned(r) ? { w, d } : null);
  // Rooftop kit (city.js entry.roof, falls with the building): a plant room
  // on the flat roofs (sf-design's sf_rooftop_mech when shipped);
  // true size. Off on phone LOW (the procedural tier).
  const MECH = glb && _kit('sf_rooftop_mech');
  const roofFor = (o, rnd) => {
    if (!MECH || o.h < 3 || o.h > 60 || Math.min(o.w, o.d) < 3) return null;
    const spot = () => [(rnd() - 0.5) * 0.66, (rnd() - 0.5) * 0.66];
    return rnd() < 0.55 ? [{ url: MECH, fx: spot()[0], fz: spot()[1], ry: Math.round(rnd() * 4) * Math.PI / 2, s: S }] : null;
  };
  const placeBlock = (o) => {
    const color = LK.facadeColor();
    const c = Math.abs(Math.cos(o.rotY || 0)), s = Math.abs(Math.sin(o.rotY || 0));
    const aw = o.w * c + o.d * s, ad = o.w * s + o.d * c;
    if (inRingBox(o.x, o.z, aw / 2, ad / 2)) return; // the Title Match venue stands here
    if (o.x < B.minX || o.x > B.maxX || o.z < B.minZ || o.z > B.maxZ) return; // (a lot whose centre lies past the edge)
    // a split lot's cell out over the river (a lot's rect overhanging the bulkhead): left out
    if (o.cell && isWater(o.x, o.z) && !L.onPier.has(o.id) && !pierPolys.some((q) => pointInPoly(o.x, o.z, q))) return;
    // A kit piece made for this very footprint (sfManifest layoutIds)
    const own = Object.values(SF_KIT_GLBS).find((d) => d.ready && d.layoutIds && d.layoutIds.includes(o.id));
    if (own) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
      b.layoutId = o.id; b._skipBodyIM = true;
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      b.debrisTint = _stoneOf(own.file);
      orient(b, o.w, o.d, o.rotY);
      K.queueGLB({ url: SF_BASE + own.file, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, stretch: 1.6, lot: lotOf(o.w, o.d, o.rotY) });
      return;
    }
    const rnd = _seeded(o.id + ':' + Math.round(o.x) + ':' + Math.round(o.z));
    const url = _pickGeneric(o.h, null, rnd, o.style);
    if (!url) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { color, noDecor: true, noRoofProps: true, windows: { scale: 0.65, faces: lite ? 2 : 4, minH: 2.5 } });
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      return;
    }
    // Long low blocks split into lots ~1.5x their height
    if (!o.cell && o.h < 18) {
      const cell = Math.max(o.h * 1.5, 6);
      const nx = Math.min(4, Math.max(1, Math.round(o.w / cell))), nz = Math.min(4, Math.max(1, Math.round(o.d / cell)));
      if (nx * nz > 1) {
        const r = o.rotY || 0, cw = o.w / nx, cd = o.d / nz;
        const ax = [Math.cos(r), -Math.sin(r)], az = [Math.sin(r), Math.cos(r)];
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          if (nx >= 3 && nz >= 3 && i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
          const u = (i + 0.5) * cw - o.w / 2, v = (j + 0.5) * cd - o.d / 2;
          placeBlock({ ...o, cell: true, x: o.x + ax[0] * u + az[0] * v, z: o.z + ax[1] * u + az[1] * v, w: cw, d: cd, h: o.h * (0.9 + rnd() * 0.2) });
        }
        return;
      }
    }
    const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
    b.layoutId = o.id;
    b._skipBodyIM = true;
    // a shed on a pier deck, or hanging over its edge: there on purpose (the
    // water grid is 4u, the decks are notches in the river)
    if (L.onPier.has(o.id) || (isWater(o.x, o.z) && pierPolys.some((q) => pointInPoly(o.x, o.z, q) || distToPolyline(o.x, o.z, q) < 4))) b.onWater = true;
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const cx = Math.floor(o.x / 24), cz = Math.floor(o.z / 24);
    const avoid = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const u of picked.get((cx + i) + ':' + (cz + j)) || []) avoid.add(u);
    const pick = _pickGeneric(o.h, avoid, rnd, o.style) || url;
    const k = cx + ':' + cz;
    if (!picked.has(k)) picked.set(k, []);
    picked.get(k).push(pick);
    const fill = o.h < 18;
    // (read at the collapse: a fill row may have placed another kit piece than the pick)
    Object.defineProperty(b, 'debrisTint', { get() { return _stoneOf(this.glbUrl || pick); } });
    orient(b, o.w, o.d, o.rotY);
    K.queueGLB({ url: pick, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, pool: _sizedDefs(o.h, o.style).map((g) => g.url), stretch: 1.3, fill, lot: lotOf(o.w, o.d, o.rotY), roof: roofFor(o, rnd) });
  };
  for (const o of L.buildings) if (!(lite && o.phoneSkip)) placeBlock(o);

  // ---- landmarks ----
  for (const lm of LMS) {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    const aw = lm.w * c + lm.d * s, ad = lm.w * s + lm.d * c;
    if (onMat(lm.x, lm.z, aw / 2, ad / 2) || (lm.kind === 'prop' && lm.h < 4 && inRingBox(lm.x, lm.z))) { console.info('[sf] landmark inside the ring venue, left out:', lm.id); continue; }
    const hp = lm.hp || Math.max(120, Math.round(lm.h * 3 + lm.w * lm.d * 0.05));
    const b = new K.Building(lm.x, lm.z, aw, ad, lm.h, { skipWindows: true });
    orient(b, lm.w, lm.d, lm.rotY);
    b._skipBodyIM = true;
    b.maxHp = hp; b.hp = hp;
    b.landmarkId = lm.id;
    b.landmarkName = lm.name; // "THROUGH THE SPACE NEEDLE!" (wrestling callouts)
    if (lm.kind === 'bridge' || lm.onPier || lm.onWater || /^pier_|ferry_building|aquarium|balclutha|exploratorium|cruise_terminal|third_street_bridge/.test(lm.id)) b.onWater = true; // (on a pier or over the bay on purpose)
    // (a model whose own footprint holds layout water, e.g. the Pacific Science Center's pools: manifest onWater)
    if (_landmarkGLB(lm.id)?.onWater) b.onWater = true;
    b.debrisTint = _stoneOf(_landmarkGLB(lm.id)?.file || lm.id);
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const def = _landmarkGLB(lm.id);
    if (def) {
      // sf-design's models are built at true size: uniform 0.2 u/m (a spire
      // makes the layout's roof height a poor scale reference)
      const h = def.trueHeightM * S;
      const url = SF_BASE + def.file;
      // (the model's +Z front: the manifest's compass word, else the layout's own frontDir for the landmark)
      const rotY = _faceRot(lm.rotY || 0, def.face && def.face !== 'layout' ? def.face : lm.frontDir);
      b.placedRotY = rotY;
      if (def.shiftM || def.offsetM) {
        // A model whose origin is not its building's centre: the site moves
        // shiftM metres along the model's front (+Z), and/or offsetM [east, south] metres on the map
        grid.remove(b);
        b.x += Math.sin(rotY) * (def.shiftM || 0) * S + (def.offsetM?.[0] || 0) * S; b.z += Math.cos(rotY) * (def.shiftM || 0) * S + (def.offsetM?.[1] || 0) * S;
        b.group.position.set(b.x, 0, b.z); b.group.updateMatrix();
        grid.add(b);
      }
      // (a model whose z0 is the waterline sets waterline: true: it sits at the water surface, not lifted to its keel)
      const y0 = def.waterline ? 0.2 : def.y0 != null ? def.y0 * S : undefined;
      if (def.clone) {
        // Own scene graph so its node can turn (the Great Wheel's 'wheel_rotor', about
        // its local spinAxis through the hub: 'x' by default), as Chicago's Navy Pier wheel
        K.onTemplatesReady((sc, get) => {
          const tpl = get(url);
          if (!tpl || b.destroyed) return;
          const root = tpl.clone(true);
          root.rotation.y = rotY;
          root.scale.setScalar(S);
          const box = new THREE.Box3().setFromObject(root);
          root.position.set(b.x - (box.min.x + box.max.x) / 2, y0 ?? -box.min.y, b.z - (box.min.z + box.max.z) / 2);
          scene.add(root);
          b.customMesh = root; b.glbUrl = url; b.h = box.max.y - box.min.y;
          const node = typeof def.clone === 'string' ? root.getObjectByName(def.clone) : null;
          const ax = def.spinAxis || 'x';
          if (node) animators.push({ update(dt) { if (!b.destroyed) node.rotation[ax] += dt * 0.12; } });
        });
        b.customMesh = new THREE.Object3D(); // (AABB hit-test marker until placed)
        continue;
      }
      if (def.exact) K.queueGLB({ url, h: def.trueHeightM * S, building: b, maxW: 0, maxD: 0, rotY, landmark: true, atOrigin: !!def.atOrigin, y0 });
      else if (def.fit === 'footprint') K.queueGLB({ url, h: lm.h * (def.maxH || 1.6), building: b, maxW: aw, maxD: ad, rotY, landmark: true, stretch: def.stretch || 1.3, lot: lotOf(lm.w, lm.d, lm.rotY) });
      else K.queueGLB({ url, h, building: b, maxW: 0, maxD: 0, rotY, landmark: true, y0 });
      continue;
    }
    // Procedural massing until the GLB is ready, at true height (spire
    // included) over the layout's roof height
    const hTrue = Math.max(lm.h, (lm.heightM || 0) * S);
    const bld = _builderFor(lm.id, lm.h);
    const mesh = (bld || BUILDERS.block)(hTrue, lm.w, lm.d, M, D, lm.h);
    mesh.userData.procedural = true;
    _tileUVs(mesh);
    const pend = SF_LANDMARK_GLBS.find((g) => !g.ready && (g.ids ? g.ids.includes(lm.id) : g.id === lm.id));
    // (listed by the smoke test as pending, not failed)
    b.pendingGLB = pend ? pend.file : lm.id + ' (procedural)';
    // The massing goes through the GLB path as its own template (instance
    // slots: a kaiju can lift it, or tear chunks off a tower, as from a model)
    const url = 'proc:sf/' + lm.id;
    K.registerTemplate(url, mesh);
    K.queueGLB({ url, h: hTrue, building: b, maxW: 0, maxD: 0, rotY: lm.rotY || 0, landmark: true });
  }

  // ---- cable cars and the F-line streetcars ----
  // (sf_detail.json cableCar / streetcar: [{ name, points }], one clean polyline a line.) The cable
  // cars shuttle end to end on the California Street and the two Powell lines, the historic
  // streetcars along Market Street and the Embarcadero; their slot and rails are drawn on the
  // street. A kaiju's leg tips a car over (sf_cable_car / sf_streetcar models when ready, else a
  // procedural car).
  {
    const lineLen = (l) => l.reduce((a, p, k) => a + (k ? Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0), 0);
    // (the stretch under the Title Match venue is closed: the longest run left)
    const clean = (pts) => clipVenue((pts || []).filter((p) => inB(p)), 1).sort((a, b) => lineLen(b) - lineLen(a))[0] || [];
    const lines = [
      ...(L.detail?.cableCar || []).map((c) => ({ ...c, cable: true })),
      ...(L.detail?.streetcar || []).map((c) => ({ ...c, cable: false })),
    ].map((c) => ({ ...c, pts: clean(c.points) })).filter((c) => c.pts.length >= 2 && lineLen(c.pts) > 30);
    const railGeo = [];
    for (const c of lines) {
      const g = (c.cable ? 1.07 : 1.435) * S / 2; // (3 ft 6 in cable-car gauge, standard-gauge streetcars)
      for (const o of c.cable ? [-g, 0, g] : [-g, g]) railGeo.push(ribbon(c.pts, o - 0.02, o + 0.02, 0.062));
    }
    if (railGeo.length) addBatch(mergeGeometries(railGeo, false), D.steelDark, false);
    const procCar = (cable, color) => {
      // (front +Z) a cable car: open front section with posts, the closed saloon behind, clerestory roof;
      // a streetcar: a long streamlined body with a window band and a trolley pole
      const m = new LK.Massing(), Lc = (cable ? 8.4 : 14) * S, Wc = (cable ? 2.4 : 2.6) * S, Hc = (cable ? 3.2 : 3.1) * S;
      m.box(D.steelDark, Wc * 0.8, Hc * 0.16, Lc * 0.9, 0, 0);
      if (cable) {
        m.box(color, Wc, Hc * 0.5, Lc * 0.5, 0, Hc * 0.16, -Lc * 0.24);
        m.box(M.darkGlass, Wc * 1.02, Hc * 0.2, Lc * 0.46, 0, Hc * 0.42, -Lc * 0.24);
        m.box(color, Wc * 0.9, Hc * 0.22, Lc * 0.46, 0, Hc * 0.16, Lc * 0.25);
        for (const sx of [-1, 1]) for (const k of [0.04, 0.25, 0.46]) m.box(D.limestone, Wc * 0.04, Hc * 0.5, Wc * 0.04, sx * Wc * 0.46, Hc * 0.16, Lc * k);
      } else {
        m.box(color, Wc, Hc * 0.34, Lc, 0, Hc * 0.16);
        m.box(M.darkGlass, Wc * 1.01, Hc * 0.24, Lc * 0.92, 0, Hc * 0.5);
        m.add(D.steelDark, new THREE.CylinderGeometry(0.01, 0.01, Lc * 0.4, 4), 0, Hc * 1.12, -Lc * 0.2, 0, 1.25);
      }
      m.box(D.limestone, Wc * 1.04, Hc * 0.08, Lc * (cable ? 1.0 : 0.98), 0, Hc * (cable ? 0.66 : 0.74));
      m.box(D.limestone, Wc * 0.6, Hc * 0.08, Lc * 0.8, 0, Hc * (cable ? 0.74 : 0.82));
      return m.build(true);
    };
    const maroon = new THREE.MeshStandardMaterial({ color: 0x7a2a28, roughness: 0.6 }), cream = new THREE.MeshStandardMaterial({ color: 0xc9b46a, roughness: 0.6 });
    maroon.userData.shared = cream.userData.shared = true;
    const cars = [];
    for (const c of lines) {
      const pts = c.pts, cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const total = cum[cum.length - 1];
      // (a car every ~450 m of line; phones: one a line)
      const n = lite ? 1 : Math.max(2, Math.min(4, Math.round(total / 130)));
      const kit = c.cable ? (/california/i.test(c.name || '') && _kit('sf_cable_car_california')) || _kit('sf_cable_car')
        : (cars.length % 2 && _kit('sf_streetcar_orange')) || _kit('sf_streetcar');
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        g.add(procCar(c.cable, c.cable ? maroon : cream));
        scene.add(g);
        const car = { g, pts, cum, total, s: (i + 0.5) / n, dir: i % 2 ? -1 : 1, wait: 0, fall: -1, base: new THREE.Vector3(), ry: 0, side: i % 2 ? 1 : -1, speed: c.cable ? 1.5 : 2.4 };
        cars.push(car);
        if (kit) K.onTemplatesReady((sc0, get) => {
          const t = get(kit);
          if (!t) return;
          g.clear();
          const m = t.clone(true);
          m.scale.setScalar(S);
          g.add(m);
        });
      }
    }
    stats.railCars = cars.length;
    const at = (car, d, out) => {
      const { pts, cum } = car;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      out.set(ax + (bx - ax) * f, 0.07, az + (bz - az) * f);
      return Math.atan2(bx - ax, bz - az);
    };
    let acc = 0;
    if (cars.length) animators.push({
      update(dt) {
        const kp = world && world.kaijuPos;
        acc += dt;
        for (const car of cars) {
          if (car.fall >= 0) {
            // knocked off the rails: over on its side in a second, then it lies there
            if (car.fall < 1) {
              car.fall = Math.min(1, car.fall + dt);
              const k = car.fall * car.fall;
              car.g.position.set(car.base.x + Math.cos(car.ry) * car.side * k * 0.5, 0.07 + 0.25 * k, car.base.z - Math.sin(car.ry) * car.side * k * 0.5);
              car.g.rotation.set(0, car.ry, k * 1.5 * car.side);
            }
            continue;
          }
          if (car.wait > 0) car.wait -= dt;
          else {
            car.s = Math.max(0, Math.min(1, car.s + car.dir * car.speed * dt / car.total));
            if (car.s === 0 || car.s === 1) { car.dir = -car.dir; car.wait = 6; } // (the turntable / the terminal)
          }
          car.ry = at(car, car.s * car.total, car.base) + (car.dir < 0 ? Math.PI : 0);
          car.g.position.copy(car.base);
          car.g.rotation.set(0, car.ry, 0);
          if (kp && acc > 0.1 && Math.hypot(kp.x - car.base.x, kp.z - car.base.z) < 3.2) {
            car.fall = 0;
            world.onCarDestroyed?.();
          }
        }
        if (acc > 0.1) acc = 0;
      },
    });
  }

  // ---- the Bay: ferries out of the Ferry Building, the Bay Bridge, Alcatraz, ships and sailboats ----
  // (sf_detail.json ferries: [{ name, points: [[x, z], ...] }]: each ferry waits at its dock,
  // crosses out along its route past the bounds and back.
  // A kaiju that wades into one rolls it over and sinks it, like Chicago's boats.)
  const placeKit = (url, x, z, ry, y = 0.2, k = S) => K.onTemplatesReady((sc0, get) => {
    const t = get(url);
    if (!t) return;
    const c = t.clone(true);
    c.scale.setScalar(k); c.position.set(x, y, z); c.rotation.y = ry;
    c.updateMatrixWorld(true);
    c.traverse((o) => { o.matrixAutoUpdate = false; });
    scene.add(c);
  });
  const ferryRoutes = (L.detail?.ferries || []).map((f) => ({ ...f, route: f.route || f.points }))
    .filter((f, i, all) => f.route?.length >= 2 && all.findIndex((g) => g.name === f.name) === i).slice(0, lite ? 2 : 5);
  // (a Bay catamaran: 41 x 11 m; every third boat the big white double-ender when the kit has it)
  const FERRY_L = 41 * S, FERRY_W = 11 * S;
  const procFerry = () => {
    const m = new LK.Massing();
    for (const s of [-1, 1]) m.box(M.white, FERRY_W * 0.26, 0.5, FERRY_L, s * FERRY_W * 0.36, -0.1);
    m.box(M.white, FERRY_W, 0.5, FERRY_L * 0.9, 0, 0.36);
    m.box(M.darkGlass, FERRY_W * 0.94, 0.3, FERRY_L * 0.74, 0, 0.86);
    m.box(D.ferryBlue, FERRY_W * 1.01, 0.12, FERRY_L * 0.9, 0, 0.6);
    m.box(M.white, FERRY_W * 0.8, 0.4, FERRY_L * 0.5, 0, 1.16);
    m.box(M.white, FERRY_W * 0.4, 0.4, FERRY_L * 0.14, 0, 1.56, FERRY_L * 0.2);
    return m.build(true);
  };
  const ferries = [];
  if (ferryRoutes.length) {
    const kitFerry = _kit('sf_ferry'), kitClassic = _kit('sf_ferry_classic');
    for (const f of ferryRoutes) {
      const g = new THREE.Group();
      g.add(procFerry());
      scene.add(g);
      const pts = f.route, cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const big = !!kitClassic && ferries.length % 3 === 2;
      ferries.push({ g, pts, cum, s: 0, dir: 1, wait: 6 + ferries.length * 25, sink: -1, ry: Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), kit: big ? kitClassic : kitFerry, hl: (big ? 75 : 41) * S / 2 + 2.5, hw: (big ? 18 : 11) * S / 2 + 2.6 });
    }
    K.onTemplatesReady((sc0, get) => {
      for (const fe of ferries) {
        const t = fe.kit && get(fe.kit);
        if (!t) continue;
        fe.g.clear(); const c = t.clone(true); c.scale.setScalar(S); fe.g.add(c);
      }
    });
    const SPEED = 3.2, OUT_WAIT = 12, DOCK_WAIT = 30, P = new THREE.Vector3();
    const pose = (fe) => {
      const d = fe.s * fe.cum[fe.cum.length - 1];
      let i = 1;
      while (i < fe.cum.length - 1 && fe.cum[i] < d) i++;
      const [ax, az] = fe.pts[i - 1], [bx, bz] = fe.pts[i], f = (d - fe.cum[i - 1]) / Math.max(1e-6, fe.cum[i] - fe.cum[i - 1]);
      P.set(ax + (bx - ax) * f, 0.2, az + (bz - az) * f);
      // bow along the way it is going; it turns on the spot at either end
      const want = Math.atan2(bx - ax, bz - az) + (fe.dir < 0 ? Math.PI : 0);
      fe.ry += Math.atan2(Math.sin(want - fe.ry), Math.cos(want - fe.ry)) * Math.min(1, 0.02 * SPEED);
    };
    let acc = 0;
    animators.push({
      update(dt) {
        const kp = world && world.kaijuPos;
        acc += dt;
        for (const fe of ferries) {
          if (fe.sink >= 0) {
            if (fe.sink < 6) {
              fe.sink += dt;
              const r = Math.min(1, fe.sink / 2), k = Math.max(0, (fe.sink - 2) / 4);
              fe.g.rotation.set(0, fe.ry, (1 - (1 - r) * (1 - r)) * 1.2);
              fe.g.position.y = 0.2 - Math.min(1, k) ** 1.5 * 6;
              if (fe.sink >= 6) fe.g.visible = false;
            }
            continue;
          }
          if (fe.wait > 0) fe.wait -= dt;
          else {
            const T = fe.cum[fe.cum.length - 1];
            fe.s = Math.max(0, Math.min(1, fe.s + fe.dir * SPEED * dt / T));
            if (fe.s === 1) { fe.dir = -1; fe.wait = OUT_WAIT; } else if (fe.s === 0) { fe.dir = 1; fe.wait = DOCK_WAIT; }
          }
          pose(fe);
          fe.g.position.copy(P);
          fe.g.rotation.set(0, fe.ry, 0);
          if (kp && acc > 0.1) {
            // in the ferry's own frame: along its length, across its beam
            const dx = kp.x - P.x, dz = kp.z - P.z, c = Math.cos(fe.ry), s = Math.sin(fe.ry);
            if (Math.abs(dx * s + dz * c) < fe.hl && Math.abs(dx * c - dz * s) < fe.hw) {
              fe.sink = 0;
              waterSplash?.burst(P.x, P.z, lite ? 16 : 40, 1.4);
              world.onCarDestroyed?.();
              world.onBoatSunk?.(P.x, P.z);
            }
          }
        }
        if (acc > 0.1) acc = 0;
      },
    });
  }
  // The Bay Bridge's western span (sf_detail.json bayBridge: the deck centreline from the Rincon Hill
  // anchorage out to Yerba Buena Island, the four suspension towers, the centre anchorage): the
  // double deck as 60 m segments (one InstancedMesh: sf-design's bay_bridge_deck_segment when ready,
  // else a truss box), the towers and the anchorage (kit models, else procedural legs and braces),
  // the main cables and suspenders (one batch). A deck segment the kaiju wades into drops into the Bay.
  const bb = L.detail?.bayBridge;
  if (bb?.points?.length >= 2) {
    const DECK_TOP = 67 * S, DECK_LOW = (bb.deckHeightMetres || 58) * S, HALF = (bb.widthMetres || 20) * S / 2, SEG = 60 * S;
    const G0 = GROUND / 2 - 20, onPlane = ([x, z]) => Math.abs(x - cxB) < G0 && Math.abs(z - czB) < G0;
    // the centreline by arc length
    const P0 = bb.points.filter(onPlane), cum = [0];
    for (let i = 1; i < P0.length; i++) cum.push(cum[i - 1] + Math.hypot(P0[i][0] - P0[i - 1][0], P0[i][1] - P0[i - 1][1]));
    const total = cum[cum.length - 1];
    const atLen = (d) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const [ax, az] = P0[i - 1], [bx, bz] = P0[i], f = Math.max(0, Math.min(1, (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])));
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, ry: Math.atan2(bx - ax, bz - az) };
    };
    const lenOf = (x, z) => {
      let best = 0, bd = Infinity;
      for (let i = 1; i < P0.length; i++) {
        const [ax, az] = P0[i - 1], [bx, bz] = P0[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d < bd) { bd = d; best = cum[i - 1] + Math.sqrt(l2) * t; }
      }
      return best;
    };
    if (total > SEG) {
      // (over land the approach is the layout's freeway: the deck starts where the line leaves the shore)
      let d0 = 0;
      while (d0 < total - SEG && !isWater(atLen(d0 + SEG / 2).x, atLen(d0 + SEG / 2).z) && inPlayBox(atLen(d0).x, atLen(d0).z)) d0 += SEG / 2;
      d0 = Math.max(0, d0 - SEG * 1.5);
      const n = Math.floor((total - d0) / SEG), segs = [];
      for (let i = 0; i < n; i++) { const p = atLen(d0 + (i + 0.5) * SEG); segs.push({ ...p, t: -1 }); }
      const kDeck = _kit('bay_bridge_deck_segment'), kTower = _kit('bay_bridge_tower'), kAnch = _kit('bay_bridge_anchorage');
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), roll = new THREE.Quaternion(), zAx = new THREE.Vector3(0, 0, 1);
      let deckIM = null, deckK = 1, deckY = 0;
      const deckPose = (s, i, k) => {
        // k 0: in place; 1: down in the water, rolled over
        q.setFromAxisAngle(up, s.ry).multiply(roll.setFromAxisAngle(zAx, k * 1.1));
        mtx.compose(v3.set(s.x, deckY * (1 - k) + (0.2 - (deckY ? DECK_LOW * 0.6 : 0)) * k, s.z), q, sc.set(deckK, deckK, deckK));
        deckIM.setMatrixAt(i, mtx);
      };
      const setDeck = (geom, mat, k, y) => {
        if (deckIM) { scene.remove(deckIM); deckIM.dispose(); }
        deckIM = new THREE.InstancedMesh(geom, mat, segs.length);
        deckK = k; deckY = y;
        segs.forEach((s, i) => deckPose(s, i, s.t < 0 ? 0 : 1));
        deckIM.castShadow = true; deckIM.receiveShadow = true; deckIM.frustumCulled = false;
        deckIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(deckIM);
      };
      // (procedural: the two decks and the truss between them as one box set, 60 m long)
      setDeck(mergeGeometries([
        new THREE.BoxGeometry(HALF * 2, 0.3, SEG).translate(0, DECK_TOP - 0.15, 0), new THREE.BoxGeometry(HALF * 2, 0.3, SEG).translate(0, DECK_LOW - 0.15, 0),
        new THREE.BoxGeometry(0.16, DECK_TOP - DECK_LOW, SEG).translate(-HALF, (DECK_TOP + DECK_LOW) / 2 - 0.15, 0), new THREE.BoxGeometry(0.16, DECK_TOP - DECK_LOW, SEG).translate(HALF, (DECK_TOP + DECK_LOW) / 2 - 0.15, 0),
      ], false), M.bridgeGrey, 1, 0.2);
      if (kDeck) K.onTemplatesReady((sc0, get) => {
        const t = get(kDeck);
        let mesh = null;
        t?.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) return;
        // (the model's own node transform baked in: quantized GLBs carry their scale on the node)
        t.updateMatrixWorld(true);
        setDeck(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mesh.material, S, 0.2);
      });
      // towers and the centre anchorage, in order along the bridge
      const towers = (bb.towers || []).filter((t) => onPlane([t.x, t.z])).map((t) => ({ ...t, len: lenOf(t.x, t.z), top: (t.heightMetres || 158) * S }));
      const anch = bb.centreAnchorage && onPlane([bb.centreAnchorage.x, bb.centreAnchorage.z]) ? { ...bb.centreAnchorage, len: lenOf(bb.centreAnchorage.x, bb.centreAnchorage.z), top: (bb.centreAnchorage.heightMetres || 85) * S, low: true } : null;
      const proc = new LK.Massing();
      for (const t of towers) {
        const ry = atLen(t.len).ry;
        if (kTower) { placeKit(kTower, t.x, t.z, ry, 0.2); continue; }
        const c = Math.cos(ry), s = Math.sin(ry);
        for (const sd of [-1, 1]) proc.box(M.bridgeGrey, 0.9, t.top, 1.1, t.x + c * sd * (HALF + 0.3), 0.2, t.z - s * sd * (HALF + 0.3), ry);
        for (const f of [0.18, 0.5, 0.64, 0.8, 0.97]) proc.box(M.bridgeGrey, HALF * 2 + 0.6, 0.5, 0.8, t.x, 0.2 + t.top * f, t.z, ry);
      }
      if (anch) {
        const ry = atLen(anch.len).ry;
        if (kAnch) placeKit(kAnch, anch.x, anch.z, ry, 0.2);
        else proc.box(M.concrete, HALF * 2 + 2, anch.top, 10, anch.x, 0.2, anch.z, ry);
      }
      // the main cables: over each tower top, down to the deck at the ends and to the centre anchorage's top
      const sup = [{ len: d0, y: DECK_TOP + 0.2, low: true }, ...towers.map((t) => ({ len: t.len, y: t.top + 0.2 })), ...(anch ? [{ len: anch.len, y: anch.top + 0.2, low: true }] : []), { len: d0 + n * SEG, y: DECK_TOP + 0.2, low: true }]
        .filter((p) => p.len >= d0 - 1 && p.len <= d0 + n * SEG + 1).sort((a, b) => a.len - b.len);
      for (let i = 0; i + 1 < sup.length && towers.length; i++) {
        const a = sup[i], b = sup[i + 1], span = b.len - a.len;
        if (span < 4) continue;
        const N = Math.max(6, Math.round(span / 8)), sag = a.low || b.low ? 0.12 : Math.min(a.y, b.y) - DECK_TOP - 0.8;
        const yAt = (f) => a.y + (b.y - a.y) * f - sag * 4 * f * (1 - f) * (a.low || b.low ? Math.abs(b.y - a.y) : 1);
        for (let k = 0; k < N; k++) {
          const f0 = k / N, f1 = (k + 1) / N, p0 = atLen(a.len + span * f0), p1 = atLen(a.len + span * f1), y0 = yAt(f0), y1 = yAt(f1);
          const dx = p1.x - p0.x, dz = p1.z - p0.z, dy = y1 - y0, l = Math.hypot(dx, dy, dz), ry = Math.atan2(dx, dz), c = Math.cos(ry), s = Math.sin(ry);
          for (const sd of [-1, 1]) {
            const ox = c * sd * (HALF + 0.3), oz = -s * sd * (HALF + 0.3);
            proc.add(M.bridgeGrey, new THREE.BoxGeometry(0.14, 0.14, l), (p0.x + p1.x) / 2 + ox, (y0 + y1) / 2, (p0.z + p1.z) / 2 + oz, ry, -Math.atan2(dy, Math.hypot(dx, dz)));
            // suspenders down to the upper deck (every other panel; none on phones)
            if (!lite && k % 2 === 0 && y0 > DECK_TOP + 1) proc.box(M.bridgeGrey, 0.04, y0 - DECK_TOP, 0.04, p0.x + ox, DECK_TOP, p0.z + oz);
          }
        }
      }
      const pg = proc.build(true);
      pg.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); o.frustumCulled = false; } });
      scene.add(pg);
      stats.bridgeSegs = segs.length; stats.bridgeTowers = towers.length;
      // segments inside reach come down when the kaiju wades into them
      const RT = 1.2;
      let acc = 0;
      animators.push({
        update(dt) {
          const kp = world && world.kaijuPos;
          acc += dt;
          if (kp && acc > 0.1) {
            acc = 0;
            segs.forEach((s) => {
              if (s.t < 0 && Math.hypot(kp.x - s.x, kp.z - s.z) < 3.5 + SEG / 2) {
                s.t = 0;
                waterSplash?.burst(s.x, s.z, lite ? 10 : 30, 1.6);
                world.onCarDestroyed?.();
              }
            });
          }
          let dirty = false;
          segs.forEach((s, i) => { if (s.t >= 0 && s.t < RT) { s.t = Math.min(RT, s.t + dt); const k = s.t / RT; deckPose(s, i, k * k); dirty = true; } });
          if (dirty) deckIM.instanceMatrix.needsUpdate = true;
        },
      });
    }
  }
  // Alcatraz, a container ship at anchor, sailboats and a tug on the Bay; Sutro Tower on its hill; the
  // far shore's container cranes when the surround has them (sf-design's kit models when ready)
  {
    const alc = L.detail?.alcatraz, kAlc = _kit('alcatraz');
    // (Alcatraz and the Golden Gate Bridge are layout landmarks, in play: tools/sf/extend_bay.py; as kit pieces only on a layout without them)
    if (alc && kAlc && !alc.inPlay) placeKit(kAlc, alc.x, alc.z, alc.rot || 0, 0.2);
    const ybi = (L.surround?.islands || []).find((i) => /yerba/i.test(i.name || '')), kYbi = _kit('yerba_buena_island');
    if (ybi && kYbi && ybi.x != null) placeKit(kYbi, ybi.x, ybi.z, ybi.rot || 0, 0.2);
    const ship = L.detail?.containerShip, kShip = _kit('sf_container_ship');
    if (ship && kShip) placeKit(kShip, ship.x, ship.z, ship.rot || 0);
    else if (ship) {
      const m = new LK.Massing(), Ls = 300 * S, Ws = 45 * S;
      m.box(M.red, Ws, 2.4, Ls * 0.94, 0, -1.4);
      m.box(D.slate, Ws, 0.5, Ls, 0, 1.0);
      const boxes = [M.red, M.blueGlass, D.ferryBlue, M.white, D.gold];
      for (let i = 0; i < 14; i++) m.box(boxes[i % 5], Ws * 0.92, 1.6 + (i % 3) * 0.5, Ls * 0.055, 0, 1.5, -Ls * 0.4 + i * Ls * 0.058);
      m.box(M.white, Ws * 0.9, 4, Ls * 0.06, 0, 1.5, Ls * 0.42);
      const g = m.build(false);
      g.position.set(ship.x, 0.2, ship.z); g.rotation.y = ship.rot || 0;
      g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
      scene.add(g);
    }
    const cranes = (L.surround?.cranes || []).slice(0, lite ? 4 : 10), kCrane = _kit('sf_container_crane');
    if (kCrane) for (const c of cranes) placeKit(kCrane, c.x, c.z, c.rot || 0, 0);
    // Small craft in open water clear of the piers and the ferry lanes (seeded: the same every run)
    const kSail = _kit('sf_sailboat'), kTug = _kit('sf_tug'), kFish = _kit('sf_fishing_boat');
    if (kSail || kTug || kFish) {
      const rnd = _seeded('sf-bay-craft');
      const nearFerry = (x, z) => ferryRoutes.some((f) => distToPolyline(x, z, f.route) < 12);
      const open = (x, z, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => isWater(x + dx, z + dz) || x + dx < B.minX || x + dx > B.maxX || z + dz < B.minZ) && !nearFerry(x, z);
      let placed = 0;
      for (let i = 0; i < 400 && placed < (lite ? 3 : 9); i++) {
        const x = B.minX - 60 + rnd() * (B.maxX - B.minX + 140), z = B.minZ - 80 + rnd() * (B.maxZ - B.minZ + 80);
        if (!(inPlayBox(x, z) ? isWater(x, z) && open(x, z, 14) : (x > B.maxX || z < B.minZ) && L.surround?.water?.some((w) => pointInPoly(x, z, w.polygon || w)))) continue;
        const kind = placed % 7 === 3 ? kTug : placed % 5 === 4 ? kFish : kSail;
        if (kind) placeKit(kind, x, z, rnd() * Math.PI * 2);
        placed++;
      }
      stats.bayCraft = placed;
    }
    // Sutro Tower (surround masts; sf-design's sutro_tower at true size on the landscape's hill, else
    // a tapered red-and-white column)
    const masts = L.surround?.masts || [], kSutro = _kit('sutro_tower');
    if (masts.length) {
      const m = new LK.Massing();
      let any = false;
      for (const ms of masts) {
        const h = (ms.heightMetres || 298) * S, y0 = sfHillHeight(ms.x, ms.z, B);
        if (kSutro && /sutro/i.test(ms.name || 'sutro')) { placeKit(kSutro, ms.x, ms.z, 0, y0); continue; }
        any = true;
        for (let k = 0; k < 6; k++) m.cyl(k % 2 ? M.white : M.red, 0.25 + (5 - k) * 0.12, 0.25 + (6 - k) * 0.12, h / 6, 4, ms.x, y0 + k * h / 6, ms.z);
      }
      if (any) {
        const g = m.build(false);
        g.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); o.userData.backdrop = false; } });
        scene.add(g);
      }
    }
    // The islands' ground (surround islands: polygons standing in the Bay; Alcatraz's rock is its model)
    const isl = (L.surround?.islands || []).filter((i) => i.polygon?.length >= 3 && !/alcatraz/i.test(i.name || ''));
    if (isl.length) {
      const land = new THREE.Mesh(mergeGeometries(isl.map((i) => polygonGeom(i.polygon, 0.24, 1 / 14)), false), new THREE.MeshBasicMaterial({ color: 0x8c8a78, fog: true }));
      land.userData.outerGround = true;
      land.matrixAutoUpdate = false; land.updateMatrix();
      scene.add(land);
    }
  }

  // ---- the Title Match venue (wrestling mode only) ----
  if (ring) buildArena(scene, world, { lite, glb, animators, grid, inside: null });

  const bodiesIM = K.buildGlobalBodies(scene, buildings);
  const windowPulse = K.buildGlobalWindows(scene, LK.windows);
  if (windowPulse) animators.push(windowPulse);

  // ---- street dressing: lamps, signals, shelters, corner furniture, the park ----
  {
    // San Francisco props at true size (manifest heightM x 0.2), Chicago's at their kit height
    const propH = (name, chi) => { const d = SF_PROP_GLBS.find((p) => p.name === name); return d && d.heightM ? d.heightM * S : chi; };
    for (const n of ['chi_streetlamp', 'chi_bus_shelter']) {
      K.propScene(n)?.traverse((o) => { if (o.isMesh && o.material.emissiveMap) o.material.emissiveIntensity = 0.08; });
    }
    // The city's own lamps when shipped (the plain cobra-head on most streets, the three-globe 'Path of Gold'
    // standards along Market Street), else Chicago's, else the Tokyo kit lamp, else procedural
    const lampName = K.hasProp('sf_streetlamp_cobra') ? 'sf_streetlamp_cobra' : K.hasProp('sf_streetlamp') ? 'sf_streetlamp' : K.hasProp('chi_streetlamp') ? 'chi_streetlamp' : 'street_lamp';
    const hasLamp = K.hasProp(lampName);
    const market = K.hasProp('sf_streetlamp') ? roads.filter((r) => /^market st/i.test(r.name || '')) : [];
    const onMarket = (x, z) => market.some((r) => distToPolyline(x, z, r.points) < r.width / 2 + 1.2);
    // Lamps ~40 m apart on both sides of the avenues (staggered), every ~60 m on one side of
    // the side streets; phones: the avenues only, sparser. Chicago's / Tokyo's stand-ins sparser still
    const own = /^sf_/.test(lampName);
    const lampEvery = own ? (lite ? 20 : 8) : lite ? 40 : 24;
    const putLamp = (x, z, ry) => {
      if (isWater(x, z) || onRing(x, z) || inRingBox(x, z)) return;
      const name = market.length && onMarket(x, z) ? 'sf_streetlamp' : lampName;
      const lamp = hasLamp ? K.cloneProp(name, propH(name, 5.6 * PS)) : LK.makeLamp();
      if (!hasLamp) lamp.scale.setScalar(PS);
      lamp.position.set(x, 0, z);
      lamp.rotation.y = ry;
      lamp.matrixAutoUpdate = false; lamp.updateMatrix();
      lamp.userData.instance = true;
      scene.add(lamp);
      stats.lamps = (stats.lamps || 0) + 1;
    };
    for (const e of net.edges) {
      const w = e.laneOff * 4;
      if (w < MAJOR_W) continue;
      for (const s of lite ? [1] : [-1, 1]) {
        for (let t = Math.min(lite ? 4 : 6, e.len / 2) + (!lite && s > 0 ? lampEvery / 2 : 0); t < e.len - 3; t += lampEvery) {
          const ss = lite ? ((Math.floor(t / lampEvery) % 2) ? 1 : -1) : s, off = ss * (w / 2 + 0.25);
          putLamp(net.nodes[e.a].x + e.dx * t - e.dz * off, net.nodes[e.a].z + e.dz * t + e.dx * off, Math.atan2(e.dx, e.dz) + (ss > 0 ? -Math.PI / 2 : Math.PI / 2));
        }
      }
    }
    if (!lite) {
      for (const r of roads) {
        if (r.kind !== 'minor') continue;
        let acc = 6;
        for (let i = 0; i + 1 < r.points.length; i++) {
          const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1], l = Math.hypot(bx - ax, bz - az);
          if (l < 0.01) continue;
          const dx = (bx - ax) / l, dz = (bz - az) / l, off = r.width / 2 + 0.25;
          for (; acc < l; acc += own ? 12 : 30) putLamp(ax + dx * acc - dz * off, az + dz * acc + dx * off, Math.atan2(dx, dz) - Math.PI / 2);
          acc -= l;
        }
      }
    }
    const sigName = K.hasProp('sf_traffic_signal') ? 'sf_traffic_signal' : 'chi_traffic_signal';
    if (K.hasProp(sigName)) {
      const placed = [];
      // (signals at most avenue crossings downtown: one every ~80 m of grid; phones fewer)
      const cap = lite ? 30 : 180;
      for (const node of net.nodes) {
        if (node.edges.length < 4 || placed.length >= cap) continue;
        const ni = net.nodes.indexOf(node);
        const e = net.edges[node.edges[0]];
        const w = e.laneOff * 4;
        if (w < MAJOR_W || placed.some(([x, z]) => Math.abs(x - node.x) < (lite ? 30 : 16) && Math.abs(z - node.z) < (lite ? 30 : 16))) continue;
        const ux = e.a === ni ? e.dx : -e.dx, uz = e.a === ni ? e.dz : -e.dz;
        const back = w / 2 + SIDEWALK_W * 1.2, side = w / 2 + 0.35;
        const x = node.x + ux * back - uz * side, z = node.z + uz * back + ux * side;
        if (onRing(x, z)) continue;
        placed.push([node.x, node.z]);
        const sig = K.cloneProp(sigName, propH(sigName, 6.4 * PS));
        sig.position.set(x, 0, z);
        sig.rotation.y = Math.atan2(ux, uz);
        sig.matrixAutoUpdate = false; sig.updateMatrix();
        sig.userData.instance = true;
        scene.add(sig);
      }
    }
    // Bus shelters on the avenues
    const art = net.edges.filter((e) => e.laneOff * 4 >= MAJOR_W && e.len > 15);
    const shelterName = K.hasProp('sf_bus_shelter') ? 'sf_bus_shelter' : 'chi_bus_shelter';
    // (Market, Mission, Van Ness, Stockton: shelters on many avenue blocks; phones a handful)
    for (let i = 0; i < (lite ? 8 : 60) && art.length; i++) {
      const e = art[Math.floor(Math.random() * art.length)];
      const w = e.laneOff * 4, t = e.len * (0.2 + Math.random() * 0.6), s = Math.random() < 0.5 ? 1 : -1;
      const off = s * (w / 2 + 0.3);
      const x = net.nodes[e.a].x + e.dx * t - e.dz * off, z = net.nodes[e.a].z + e.dz * t + e.dx * off;
      if (isWater(x, z) || onRing(x, z)) continue;
      const p = K.hasProp(shelterName) ? K.cloneProp(shelterName, propH(shelterName, 2.6 * PS)) : LK.makeShelter();
      if (!K.hasProp(shelterName)) p.scale.setScalar(PS);
      p.position.set(x, 0, z);
      p.rotation.y = Math.atan2(e.dx, e.dz) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
      p.matrixAutoUpdate = false; p.updateMatrix();
      p.userData.instance = true;
      scene.add(p);
    }
    // One prop at true size, instanced (seeded so a run looks the same each time)
    const rng = _seeded('sf-dressing');
    const put = (name, x, z, ry) => {
      if (!K.hasProp(name) || isWater(x, z) || onRing(x, z) || inRingBox(x, z)) return false;
      const p = K.cloneProp(name, propH(name, 1));
      p.position.set(x, 0, z); p.rotation.y = ry;
      p.matrixAutoUpdate = false; p.updateMatrix();
      p.userData.instance = true;
      scene.add(p);
      return true;
    };
    // Corners: hydrants, trash cans, newspaper boxes; coffee carts mid-block (sf-design's props, as shipped)
    const corners = net.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.edges.length >= 3);
    const caps = { sf_hydrant: lite ? 0 : 220, sf_trash_can: lite ? 0 : 220, sf_newspaper_box: lite ? 0 : 60 };
    const count = {};
    for (const [nd, ni] of corners) {
      const e = net.edges[nd.edges[0]], w = e.laneOff * 4, ux = e.a === ni ? e.dx : -e.dx, uz = e.a === ni ? e.dz : -e.dz;
      for (const [name, chance, back, side] of [['sf_hydrant', 0.5, 1.6, 0.4], ['sf_trash_can', 0.5, 1.2, -0.4], ['sf_newspaper_box', 0.15, 2.2, 0.5]]) {
        if ((count[name] || 0) >= caps[name] || rng() > chance) continue;
        const o = w / 2 + SIDEWALK_W * side + 0.6, x = nd.x + ux * (w / 2 + back) - uz * o, z = nd.z + uz * (w / 2 + back) + ux * o;
        if (put(name, x, z, Math.atan2(ux, uz))) count[name] = (count[name] || 0) + 1;
      }
    }
    // Fisherman's Wharf: crab stands on the sidewalks of the northern waterfront blocks; cable-car stop signs at the stops
    const wharf = art.filter((e) => net.nodes[e.a].z < B.minZ + 70 && net.nodes[e.a].x < cxB + 60);
    for (let i = 0; i < (lite ? 3 : 12) && wharf.length; i++) {
      const e = wharf[Math.floor(rng() * wharf.length)], w = e.laneOff * 4, t = e.len * (0.2 + rng() * 0.6), sd = rng() < 0.5 ? 1 : -1;
      const x0 = net.nodes[e.a].x + e.dx * t, z0 = net.nodes[e.a].z + e.dz * t;
      put('sf_crab_stand', x0 - e.dz * sd * (w / 2 + 0.6), z0 + e.dx * sd * (w / 2 + 0.6), Math.atan2(e.dx, e.dz) + (sd > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
    if (!lite) for (const c of L.detail?.cableCar || []) for (const st of c.stops || []) put('sf_cable_car_stop_sign', st.x + 0.9, st.z + 0.9, 0);
    // Parked cars (the level's traffic templates, instanced): kerbside on the side streets and the
    // avenues' parking lanes, one every ~6u with gaps, and rows in the surface lots (layout parks
    // kind plaza / surface parking). Phones: a few, nearer the cap of the draw budget
    {
      const capKerb = lite ? 60 : 1300, capLot = lite ? 30 : 700;
      let kerb = 0, lot = 0;
      const park = (x, z, yaw) => {
        if (isWater(x, z) || onRing(x, z) || inRingBox(x, z, 1.5, 1.5) || onLandmark(x, z)) return false;
        const car = K.makeParkedCar(x, z, yaw);
        if (!car) return false;
        scene.add(car);
        return true;
      };
      const kerbRun = (pts, w, chance) => {
        let acc = 4;
        for (let i = 0; i + 1 < pts.length && kerb < capKerb; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
          if (l < 0.01) continue;
          const dx = (bx - ax) / l, dz = (bz - az) / l;
          for (; acc < l - 4 && kerb < capKerb; acc += 6.2) {
            for (const sd of [-1, 1]) {
              if (rng() > chance) continue;
              const off = sd * (w / 2 - 0.55);
              if (park(ax + dx * acc - dz * off, az + dz * acc + dx * off, Math.atan2(dx, dz) + (rng() < 0.5 ? 0 : Math.PI))) kerb++;
            }
          }
          acc -= l;
        }
      };
      // (the avenues first, so the cap never runs out before the downtown core is dressed; then the side streets)
      for (const e of net.edges) {
        const w = e.laneOff * 4, A = net.nodes[e.a], Bn = net.nodes[e.b];
        if (w < MAJOR_W || e.len < 14) continue;
        kerbRun([[A.x + e.dx * 4, A.z + e.dz * 4], [Bn.x - e.dx * 4, Bn.z - e.dz * 4]], w, lite ? 0.06 : 0.4);
      }
      for (const r of roads) if (r.kind === 'minor') kerbRun(r.points, r.width, lite ? 0.12 : 0.45);
      for (const p of L.parks) {
        if (p.surface !== 'parking' || lot >= capLot) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of p.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        const along = x1 - x0 >= z1 - z0; // rows along the lot's long side
        for (let v = (along ? z0 : x0) + 2.5; v < (along ? z1 : x1) - 2.5 && lot < capLot; v += 6) {
          for (let u = (along ? x0 : z0) + 1.2; u < (along ? x1 : z1) - 1.2 && lot < capLot; u += 2.3) {
            const x = along ? u : v, z = along ? v : u;
            if (!pointInPoly(x, z, p.polygon) || rng() < (lite ? 0.7 : 0.3)) continue;
            if (park(x, z, (along ? 0 : Math.PI / 2) + (rng() < 0.5 ? 0 : Math.PI))) lot++;
          }
        }
      }
      stats.parkedKerb = kerb; stats.parkedLots = lot;
      Object.assign(stats, count);
    }
    // Park lamps and benches along the park walks (Yerba Buena Gardens, Washington Square, the Embarcadero promenade)
    {
      let lamps = 0, benches = 0;
      const lampCap = lite ? 40 : 160, benchCap = lite ? 0 : 140;
      const inPark = (x, z) => L.parks.some((p) => p.kind !== 'plaza' && p.surface !== 'pier' && pointInPoly(x, z, p.polygon));
      for (const q of L.paths) {
        let acc = 0;
        for (let i = 0; i + 1 < q.points.length && lamps < lampCap; i++) {
          const [ax, az] = q.points[i], [bx, bz] = q.points[i + 1], l = Math.hypot(bx - ax, bz - az);
          if (l < 0.01) continue;
          const dx = (bx - ax) / l, dz = (bz - az) / l;
          for (; acc < l; acc += 9) {
            const x = ax + dx * acc + dz * 0.9, z = az + dz * acc - dx * 0.9;
            if (!inPark(x, z)) continue;
            if (put('sf_park_lamp', x, z, Math.atan2(dx, dz))) lamps++;
            if (benches < benchCap && rng() < 0.5 && put('sf_bench', x - dz * 1.6 + dx * 2, z + dx * 1.6 + dz * 2, Math.atan2(-dz, dx))) benches++;
          }
          acc -= l;
        }
      }
    }
  }

  // ---- the surround: the city past the bounds (the Western Addition, the Mission, Potrero, Mission Bay) ----
  // Out to the ground plane's edge (where the look layer's world-edge fade
  // takes everything into the haze): the cartographer's surround boxes from
  // the footprint data (cls 0: low fabric, 1: a building of 40 m or more,
  // 2: across the water). One merged UNLIT mesh with baked sun shading (one
  // draw) plus the outer ground (one draw).
  const G = GROUND / 2, RX0 = cxB - G, RX1 = cxB + G, RZ0 = czB - G, RZ1 = czB + G;
  const BU = 16, BV = 22, ST = 3.6; // a downtown block (~80 x 110 m) with its streets, in u (the outer ground's tile)
  const inPlay = (x, z, pad) => x > B.minX - pad && x < B.maxX + pad && z > B.minZ - pad && z < B.maxZ + pad;
  if (L.surround?.boxes?.length) {
    const sunL = new THREE.Vector3(-0.55, 1.2, 0.65).normalize();
    const pos = [], uv = [], col = [], idx = [];
    const cc = new THREE.Color(), nn = new THREE.Vector3();
    // A box centred on (x, z), w along its local X, d along local Z, turned
    // by rot (three.js rotation.y: local X along (c, -s), local Z along (s, c))
    const addBox = (x, z, w, h, d, rot, tint, roof, y0 = 0) => {
      const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
      const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      for (const [a, b, nl, fw] of [[[-hw, hd], [hw, hd], [0, 1], w], [[hw, hd], [hw, -hd], [1, 0], d], [[hw, -hd], [-hw, -hd], [0, -1], w], [[-hw, -hd], [-hw, hd], [-1, 0], d]]) {
        nn.set(nl[0] * c + nl[1] * s, 0, -nl[0] * s + nl[1] * c);
        cc.copy(tint).multiplyScalar(Math.min(1, 0.6 + 0.5 * Math.max(0, nn.dot(sunL))) * 0.9);
        const i0 = pos.length / 3, u0 = (x * 0.37 + z * 0.61) / 6;
        const pa = P(a[0], a[1]), pb = P(b[0], b[1]);
        for (const [p, ly, uu] of [[pa, 0, 0], [pb, 0, fw], [pb, h, fw], [pa, h, 0]]) {
          pos.push(p[0], y0 + ly, p[1]); uv.push(u0 + uu / 6, ly / 3.2); col.push(cc.r, cc.g, cc.b);
        }
        idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
      const i0 = pos.length / 3;
      for (const [lx, lz] of [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]]) { const p = P(lx, lz); pos.push(p[0], y0 + h, p[1]); uv.push(0.5, 0.03); col.push(roof.r, roof.g, roof.b); }
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    const rnd = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const STONE = [0xd8cfbd, 0xcbbfa8, 0xe0dacd, 0xb9ae9a], BRICK = [0x9a6452, 0x8c5c4c, 0xa87660, 0x7c5a4e, 0xb08a6e], GLASSY = [0x7f93a6, 0x6a7c8e, 0x9eabb6, 0x8a98a2];
    // (the hill neighbourhoods and West San Francisco: painted clapboard houses and low apartments in greys, tans and greens)
    const WOOD = [0xb8b2a4, 0x9aa4a0, 0xc4b496, 0x8c9a8a, 0xd0ccc0, 0x7e8a94];
    const pick = (arr, k) => new THREE.Color(arr[Math.floor(rnd(k) * arr.length) % arr.length]);
    const ROOFS = [new THREE.Color(0x6e6a66), new THREE.Color(0x5b5f63), new THREE.Color(0x7d848a)];
    const onGround = (x, z) => x > RX0 && x < RX1 && z > RZ0 && z < RZ1;
    // (phone LOW keeps the towers and the nearer low fabric)
    let k = 0;
    for (const [x, z, w, d, h, rot, cls] of L.surround.boxes) {
      k++;
      if (!onGround(x, z) || inPlay(x, z, 1)) continue;
      const dEdge = Math.max(B.minX - x, x - B.maxX, B.minZ - z, z - B.maxZ, 0);
      if (lite && cls !== 1 && dEdge > 200 && rnd(k * 1.7) < 0.5) continue;
      const tint = cls === 1 ? pick(h > 30 ? GLASSY : rnd(k * 2.3) < 0.5 ? STONE : GLASSY, k) : cls === 2 ? pick(WOOD, k) : pick(rnd(k * 6.7) < 0.4 ? BRICK : rnd(k * 3.1) < 0.5 ? STONE : WOOD, k * 3);
      addBox(x, z, w, h, d, rot || 0, tint, ROOFS[k % 3], sfHillHeight(x, z, B)); // (on sf-design's hills)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    // Facade tile: three storeys of windows a repeat (v: 3.2u), a plain roof texel at (0.5, 0.03)
    const TS = 128, cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#ece8e0'; g2.fillRect(0, 0, TS, TS);
    for (let r = 0; r < 3; r++) for (let b = 0; b < 6; b++) {
      const val = 90 + Math.random() * 50;
      g2.fillStyle = `rgb(${val | 0},${(val + 8) | 0},${(val + 16) | 0})`;
      g2.fillRect(b * TS / 6 + 4, r * TS / 3 + 9, TS / 6 - 8, TS / 3 - 18);
    }
    g2.fillStyle = '#ffffff'; g2.fillRect(48, TS - 8, 32, 8);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: true }));
    mesh.frustumCulled = false;
    mesh.userData.backdrop = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
  }

  // ---- the hills past the bounds (sfLandscape.js: Pacific Heights, Twin Peaks and Mount Sutro, Potrero Hill,
  // Yerba Buena Island), one unlit mesh to the shore; the surround boxes stand on them (sfHillHeight).
  // Tagged as outer ground for the look layer (unlit shading, no painted windows on the slopes)
  {
    const hills = createSfHills(B, L.surround?.water || [], { lite });
    hills.userData.backdrop = false; hills.userData.outerGround = true;
    scene.add(hills);
  }

  // ---- the horizon: the Marin Headlands and Mount Tamalpais past the Golden Gate, Angel Island, the East Bay
  // hills with Mount Diablo behind, San Bruno Mountain to the south; the Golden Gate Bridge in the north-west ----
  // Silhouettes with the haze baked into their vertex colours (unlit, no fog),
  // riding with the camera at R0, inside the 1500u sky dome that also rides
  // with it (their true distance is far past the camera's far plane): each
  // range at about 1.6x its true angular height (heights below are at 1750u,
  // scaled to R0). Dry-grass and chaparral hills: no snowline.
  {
    const R0 = 1400, HK = R0 / 1750, pos = [], col = [], idx = [];
    const haze = new THREE.Color(SF_LOOK.statics.bg), cA = new THREE.Color(), cB = new THREE.Color(), cR = new THREE.Color();
    const rock = new THREE.Color(0x8a8668), forest = new THREE.Color(0x55624c), snow = new THREE.Color(0xf4f6fa);
    const rnd = _seeded('sf-horizon');
    // range: bearing from north (deg, clockwise) start / end, peaks [bearing, height u, half width deg], snowline (0..1 of the peak), haze 0..1,
    // base height, ridge noise, the flanks' curve (higher: a volcano's concave slopes)
    const range = (b0, b1, peaks, snowK, hz, base, noise, flank = 1.3) => {
      const N = Math.max(8, Math.round((b1 - b0) * 3)), i0 = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const b = b0 + (b1 - b0) * i / N, a = b * Math.PI / 180, x = Math.sin(a) * R0, z = -Math.cos(a) * R0;
        let y = base;
        for (const [pb, ph, pw] of peaks) { const t = Math.abs(b - pb) / pw; if (t < 1) y = Math.max(y, ph * (1 - t) ** flank); }
        y += (rnd() - 0.5) * noise * (y / Math.max(1, base * 3));
        y *= HK;
        // three rows: the foot (forest in the haze), the snowline (rock), the ridge (snow above the
        // snowline, else rock): snow only on the peaks, not a pale curtain down the face
        const top = Math.max(...peaks.map((p) => p[1])) * HK, sl = Math.min(y, top * snowK);
        cB.copy(forest).lerp(haze, Math.min(1, hz + 0.25));
        cR.copy(rock).lerp(haze, hz);
        cA.copy(y > sl + 0.5 ? snow : rock).lerp(haze, hz);
        pos.push(x, -12, z, x, sl, z, x, y, z);
        col.push(cB.r, cB.g, cB.b, cR.r, cR.g, cR.b, cA.r, cA.g, cA.b);
        if (i) { const j = i0 + i * 3; idx.push(j - 3, j - 2, j, j - 2, j + 1, j, j - 2, j - 1, j + 1, j - 1, j + 2, j + 1); }
      }
    };
    range(282, 334, [[292, 58, 7], [303, 70, 8], [316, 104, 9], [326, 72, 6]], 2, 0.5, 14, 6, 1.2); // the Marin Headlands (~280 m, 9 km), Mount Tamalpais behind (784 m, 20 km)
    range(346, 376, [[358, 70, 9], [369, 44, 6]], 2, 0.46, 8, 4, 1.4); // Angel Island (240 m, 7 km) and Tiburon
    range(18, 128, [[30, 44, 8], [46, 58, 9], [62, 66, 9], [76, 82, 5], [88, 64, 10], [104, 54, 9], [120, 40, 7]], 2, 0.56, 16, 6); // the Berkeley and Oakland hills (~500 m, 19 km), Mount Diablo over them
    range(176, 214, [[190, 66, 9], [201, 82, 8]], 2, 0.5, 12, 5, 1.3); // San Bruno Mountain (400 m, 11 km)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const hz = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    hz.frustumCulled = false; hz.renderOrder = -1;
    hz.matrixAutoUpdate = false;
    hz.name = 'sf_horizon';
    // (three computes the model-view matrix after onBeforeRender: centred on the camera every draw)
    hz.onBeforeRender = (r, sc0, cam) => { hz.matrixWorld.makeTranslation(cam.matrixWorld.elements[12], 0, cam.matrixWorld.elements[14]); };
    scene.add(hz);
  }

  // The Golden Gate Bridge (sf-design's golden_gate_bridge at true proportions): too far for the world (6.5 km
  // west-north-west, past the ground plane), so it rides with the camera on the horizon ring like the hills, at its
  // true bearing from the middle of the map and 1.5x its true angular size, unlit in International Orange under the haze
  {
    const gg = L.detail?.goldenGateBridge || {}, kGG = _kit('golden_gate_bridge');
    if (kGG && !gg.inPlay) K.onTemplatesReady((sc0, get) => {
      const t = get(kGG);
      if (!t) return;
      const R1 = 1380, bearing = (gg.bearingDeg ?? 294) * Math.PI / 180, dist = (gg.distanceKm ?? 6.6) * 1000 * S;
      const c = t.clone(true);
      c.scale.setScalar(S * (R1 / dist) * 1.5);
      c.position.set(Math.sin(bearing) * R1, -2, -Math.cos(bearing) * R1);
      c.rotation.y = gg.rot ?? 1.4; // (the model's long axis is local X: the bridge runs a little east of north)
      c.updateMatrixWorld(true);
      const paint = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8452c).lerp(new THREE.Color(SF_LOOK.statics.bg), 0.42), fog: false });
      c.traverse((o) => {
        if (!o.isMesh) return;
        const base = o.matrixWorld.clone();
        o.material = paint; o.frustumCulled = false; o.renderOrder = -1; o.castShadow = false; o.matrixAutoUpdate = false;
        o.onBeforeRender = (r, sc1, cam) => { o.matrixWorld.copy(base); o.matrixWorld.elements[12] += cam.matrixWorld.elements[12]; o.matrixWorld.elements[14] += cam.matrixWorld.elements[14]; };
      });
      c.matrixAutoUpdate = false;
      c.name = 'sf_golden_gate';
      scene.add(c);
    });
  }

  // ---- outer ground: the street grid, pavement and street trees under the surround ----
  {
    // one tile: 2 blocks across by 4 along, mapped on downtown's grid
    const TV = BV * 2, TU = BU * 4, TS = 512, pv = TS / TV, pu = TS / TU;
    const cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#5e5d5a'; g2.fillRect(0, 0, TS, TS); // asphalt
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      const x0 = (i * BV + ST * 0.5) * pv, y0 = (j * BU + ST * 0.5) * pu, w = (BV - ST) * pv, h = (BU - ST) * pu;
      g2.fillStyle = '#b4afa6'; g2.fillRect(x0, y0, w, h);                         // sidewalk
      g2.fillStyle = '#8f8a82'; g2.fillRect(x0 + 1.0 * pv, y0 + 1.0 * pu, w - 2 * pv, h - 2 * pu); // the block
      g2.fillStyle = '#4c6a44';                                                      // street trees on the kerbs
      for (let t = 0; t < w; t += 3 * pv) for (const ty of [y0 + 0.5 * pu, y0 + h - 0.5 * pu]) {
        if (Math.random() < 0.5) { g2.beginPath(); g2.arc(x0 + t, ty, 0.8 * pv, 0, Math.PI * 2); g2.fill(); }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    const rects = [[RX0, B.minX, RZ0, RZ1], [B.maxX, RX1, RZ0, RZ1], [B.minX, B.maxX, RZ0, B.minZ], [B.minX, B.maxX, B.maxZ, RZ1]];
    const pos = [], uv = [], idx = [];
    for (const [x0, x1, z0, z1] of rects) {
      if (x1 <= x0 || z1 <= z0) continue;
      const i0 = pos.length / 3;
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) { pos.push(x, 0.03, z); uv.push(toV(x, z) / TV, -toU(x, z) / TU); }
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: true }));
    outer.userData.outerGround = true;
    outer.matrixAutoUpdate = false; outer.updateMatrix();
    scene.add(outer);
  }

  // ---- play-area barrier ----
  let barrier = null;
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 22, 4, 1, true), mat);
    mesh.rotation.y = Math.PI / 4;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.scale.set(B.maxX - B.minX + 16, 1, B.maxZ - B.minZ + 16);
    holder.position.set(cxB, 11, czB);
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
      const off = (Math.random() < 0.5 ? 1 : -1) * (e.laneOff * 2 + 0.4);
      const x = net.nodes[e.a].x + e.dx * r - e.dz * off, z = net.nodes[e.a].z + e.dz * r + e.dx * off;
      if (!isWater(x, z) && !onRing(x, z) && x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ) return [x, z];
    }
    return [L.spawn.x, L.spawn.z];
  };
  K.setPedCfg({ blocked: (x, z) => isWater(x, z) || onRing(x, z), bounds: B, spawn: sidewalkPoint });

  return {
    buildings, grid, bodiesIM, cityAnimators: animators,
    cityRadius: Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2,
    level: 'sf', bounds: { ...B }, center: { x: cxB, z: czB },
    spawn: { ...L.spawn }, isWater, barrier, landPoint: sidewalkPoint,
    mapWater: L.water.map((w) => ({ kind: w.kind, polygon: w.polygon, holes: w.holes })),
    enemySpawns: L.enemySpawns, duelSpawns: L.duel, soldierSpawn: L.soldier, ringSite: L.ring,
  };
}
