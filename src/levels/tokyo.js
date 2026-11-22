// Tokyo: the centre and the bay, from Otemachi, Tokyo Station and the Imperial Palace south through Kasumigaseki,
// Ginza, Shimbashi, Shiodome and Tsukiji to Tokyo Tower, Zojo-ji, Takeshiba and Shibaura, with Harumi, Toyosu,
// the Rainbow Bridge and the tip of Odaiba in the bay, built from assets/levels/tokyo_layout.json (the map
// levels' schema: game units, 0.2 u/m, +X east, +Z south, true north up; each lot keeps its real angle).
// Follows sf.js and shares Chicago's helpers, materials, water and ring (chicago.js LEVEL_KIT, chicago_water.js,
// chicago_arena.js at the layout's ring site). Tokyo's own: the landmark massing, the Yamanote viaduct and its
// trains, the Shinkansen, the Monorail and the Yurikamome, the Shuto Expressway's elevated decks, water buses on
// the Sumida, the blue-hour look with lit windows, and Mount Fuji on the horizon. The ground is flat.
// (This replaces the old procedural Tokyo that lived in city.js.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL_KIT as LK } from './chicago.js';
import { tokyoGround, tokyoFacade, tickTokyoMaterials, createTokyoTrees, tokyoWater } from './tokyoMaterials.js';
import { createTokyoHills, tokyoHillHeight } from './tokyoLandscape.js';
import { configureChicagoWear } from './chicagoMaterials.js';
import { isMobile } from '../quality.js';
import { assetURL } from '../assetCache.js';
import { splashPool } from './chicago_harbor.js';
import { bakeShoreField, makeWaterMaterial, waterUniforms, waterFX } from './chicago_water.js';
import { buildArena, arenaNoTree, setArenaSite } from './chicago_arena.js';
import { setLookLayerKey } from '../look.js';
import { TOKYO_LOOK } from './tokyoLook.js';
import { TOKYO_BASE, TOKYO_LANDMARK_GLBS, TOKYO_GENERIC_GLBS, TOKYO_PROP_GLBS, TOKYO_VEHICLE_GLBS, TOKYO_KIT_GLBS } from './tokyoManifest.js';

// The cartographer's layout (the integrator's placeholder before it: tokyo_layout_placeholder.json,
// devtools/tokyo/integrator/make_placeholder.mjs)
const LAYOUT_URL = './assets/levels/tokyo_layout.json';
// The cartographer's tree survey ([x, z, kind, osm]; layout meta.trees: false when there is none)
const TREES_URL = './assets/levels/tokyo_trees.json';
// The city past the bounds from the footprint data (boxes, the bay and the lakes over the fetch area: cartographer)
const SURROUND_URL = './assets/levels/tokyo_surround.json';
// Dressing detail: the train lines, the elevated expressways, the water-bus routes (cartographer)
const DETAIL_URL = './assets/levels/tokyo_detail.json';
/** The Title Match belt on Tokyo (mat, banners, HUD). */
export const TOKYO_TITLE = 'TOKYO HEAVYWEIGHT CHAMPIONSHIP';

// Gameplay minimum street widths (u): Tokyo's real streets are narrow, and the shared
// 7 / 4.5 trims more of its blocks than NYC's. TRIAL (lead's decision pending): null keeps the
// shared minimums; { minMajor, minMinor } passes Tokyo's own to normalizeLayout
const STREET_MIN = { minMajor: 6, minMinor: 4 };
let _layout = null;
/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadTokyoLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`tokyo layout: HTTP ${r.status}`);
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

// --------------- GLB assets (tokyoManifest.js) ---------------
const _ok = (g) => g.ready && !(isMobile && g.desktopOnly);
const _landmarkGLB = (id) => TOKYO_LANDMARK_GLBS.find((g) => g.ready && (g.ids ? g.ids.includes(id) : g.id === id));
const _kit = (id) => (TOKYO_KIT_GLBS[id]?.ready ? TOKYO_BASE + TOKYO_KIT_GLBS[id].file : null);
// Until Tokyo's own block kit is ready: Chicago's whole generic kit (glass
// towers downtown, brick and masonry elsewhere)
function _kitDefs() {
  const own = TOKYO_GENERIC_GLBS.filter(_ok).map((g) => ({ ...g, url: TOKYO_BASE + g.file }));
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
// kit styles that suit it (tokyo-design's `style` field); a lot keeps the
// whole bucket when none of them is in it
const STYLE_OK = {
  // (a kit piece's first style word is its family: tokyo_zakkyo_* 'zakkyo ...', tokyo_house_* 'house ...')
  house: /^house/, zakkyo: /^zakkyo/, apartment: /^apartment/, lowrise: /^lowrise|^house/, midrise: /^midrise/,
  warehouse: /^warehouse/, glassslab: /^glassslab/, glasstower: /^glasstower/,
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
  const all = [...TOKYO_LANDMARK_GLBS, ...TOKYO_GENERIC_GLBS, ...Object.values(TOKYO_KIT_GLBS)];
  const def = all.find((g) => g.file === file || TOKYO_BASE + g.file === file);
  if (def && def.stone != null) return def.stone;
  const f = String(file);
  return /station|ministry_of_justice|brick|viaduct/.test(f) ? STONE.brick
    : /house|zojoji|shrine|torii|teahouse|yagura|kabukiza|otemon|wood/.test(f) ? STONE.wood
    : /tokyo_tower|skytree|rainbow|bridge|crane|expressway/.test(f) ? STONE.steel
    : /glass|tower|hills|midtown|marunouchi|shiodome|dentsu|nittele|gran_tokyo|kitte|forum/.test(f) ? STONE.glass
    : /zakkyo|apartment|midrise|warehouse|market|pier|concrete/.test(f) ? STONE.concrete : STONE.granite;
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

/** Building GLB urls the Tokyo level loads. */
export function tokyoBuildingGLBs() {
  return [...new Set([
    ...TOKYO_LANDMARK_GLBS.filter((g) => g.ready).map((g) => TOKYO_BASE + g.file),
    ...Object.keys(TOKYO_KIT_GLBS).filter((id) => !(isMobile && TOKYO_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ..._kitDefs().map((g) => g.url),
  ])];
}
/** GLB urls with a <name>_lod1.glb twin on disk. */
export function tokyoLod1GLBs() {
  return [...TOKYO_LANDMARK_GLBS.filter((g) => g.ready && g.lod1 !== false).map((g) => TOKYO_BASE + g.file),
    ...Object.keys(TOKYO_KIT_GLBS).filter((id) => TOKYO_KIT_GLBS[id].lod1 !== false).map(_kit).filter(Boolean),
    ...TOKYO_GENERIC_GLBS.filter((g) => _ok(g) && g.lod1 !== false).map((g) => TOKYO_BASE + g.file),
    ...TOKYO_PROP_GLBS.filter((p) => p.ready && p.lod1 !== false).map((p) => TOKYO_BASE + p.file),
    ...TOKYO_VEHICLE_GLBS.filter((v) => v.ready && v.lod1 !== false).map((v) => v.url)];
}
/** Tokyo-only street props as [{ name, url }]. */
export function tokyoPropGLBs() {
  return TOKYO_PROP_GLBS.filter((p) => p.ready).map((p) => ({ name: p.name, url: TOKYO_BASE + p.file }));
}
/** Tokyo-only vehicle defs for loadCarTemplates. */
export function tokyoVehicleGLBs() {
  return TOKYO_VEHICLE_GLBS.filter((v) => v.ready).map((v) => ({ ...v, levels: ['tokyo'] }));
}

// --------------- materials ---------------
const FALLBACK_TEX = 'seattle_fallback_'; // (the shared tiling fallback facades)
let _D = null;
/** Tokyo's own massing surfaces on top of the shared (Chicago) set. */
function tokyoMats(M) {
  if (_D) return _D;
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _D = {
    limestone: std(0xd2c6ae, 0.85), limeShade: std(0xb8ab94, 0.88), brick: std(0x9a6a52, 0.9), granite: std(0x8f8a82, 0.8),
    glass: std(0x3e5366, 0.3, 0.1), glassLight: std(0x8ea4b6, 0.32, 0.1), steel: std(0xb6bcc2, 0.35, 0.1),
    steelDark: std(0x37403c, 0.6, 0.2), // (pier piles, rails)
    gold: std(0xc8a040, 0.5, 0.2), // (City Hall's gilding)
    ferryBlue: std(0x2a5a8c, 0.6), // (the Bay ferries' band)
    copper: std(0x6c9c86, 0.7), roofDark: std(0x4a4c50, 0.85), slate: std(0x5c6066, 0.8),
    gravel: tokyoGround(new THREE.MeshStandardMaterial(), 'gravel'),
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
  lattice(h, w, d, M, D) {
    // Tokyo Tower / the Skytree: four splayed legs closing to a shaft, two decks, the mast
    const m = new LK.Massing();
    const r = Math.min(w, d) / 2 * Math.SQRT2;
    m.cyl(M.red, r * 0.12, r, h * 0.45, 4, 0, 0, 0, Math.PI / 4);
    m.box(M.white, r * 0.5, h * 0.03, r * 0.5, 0, h * 0.44);
    m.cyl(M.red, r * 0.05, r * 0.12, h * 0.3, 4, 0, h * 0.47, 0, Math.PI / 4);
    m.box(M.white, r * 0.22, h * 0.02, r * 0.22, 0, h * 0.75);
    m.cyl(M.white, r * 0.01, r * 0.05, h * 0.23, 4, 0, h * 0.77, 0, Math.PI / 4);
    return m.build();
  },
  glass(h, w, d, M, D, hm = h) {
    const m = new LK.Massing();
    const roof = Math.min(hm, h), pod = Math.min(roof * 0.08, 6);
    m.box(D.granite, w, pod, d);
    m.box(D.glass, w * 0.9, roof * 0.78 - pod, d * 0.9, 0, pod);
    m.box(D.glassLight, w * 0.78, roof * 0.22, d * 0.78, 0, roof * 0.78);
    if (h > roof + 1) m.cyl(D.steel, w * 0.015, w * 0.04, h - roof, 6, 0, roof);
    return m.build();
  },
  temple(h, w, d, M, D) {
    // A temple hall, shrine, gate or keep: a base, the timber body, a sweeping tiled roof
    const m = new LK.Massing();
    m.box(D.granite, w, h * 0.12, d);
    m.box(M.red, w * 0.8, h * 0.4, d * 0.8, 0, h * 0.12);
    m.add(D.roofDark, new THREE.ConeGeometry(Math.max(w, d) * 0.74, h * 0.48, 4), 0, h * 0.76, 0, Math.PI / 4, 0, 0, w >= d ? 1 : d / w * 0.9, 1, w >= d ? d / w * 0.9 : 1);
    return m.build();
  },
  civic(h, w, d, M, D) {
    const m = new LK.Massing();
    m.box(D.granite, w, h * 0.12, d);
    m.box(D.limestone, w * 0.98, h * 0.76, d * 0.98, 0, h * 0.12);
    m.box(D.limeShade, w, h * 0.12, d, 0, h * 0.88);
    return m.build();
  },
  bridge(h, w, d, M, D) {
    // A bridge along the lot's long side: the deck and two towers
    const m = new LK.Massing();
    const L = Math.max(w, d), Bm = Math.min(w, d), ry = w >= d ? 0 : Math.PI / 2;
    m.box(M.white, L, h * 0.06, Bm, 0, h * 0.42, 0, ry);
    for (const s of [-1, 1]) m.box(M.white, Bm * 0.3, h, Bm * 1.1, ry ? 0 : s * L * 0.3, 0, ry ? s * L * 0.3 : 0, ry);
    return m.build();
  },
  shed(h, w, d, M, D) {
    const m = new LK.Massing();
    m.box(M.concrete, w, h * 0.75, d);
    m.add(D.roofDark, new THREE.CylinderGeometry(Math.min(w, d) * 0.6, Math.min(w, d) * 0.6, Math.max(w, d), 3, 1), 0, h * 0.75, 0, w >= d ? 0 : Math.PI / 2, 0, Math.PI / 2, 1, 0.4, 1);
    return m.build();
  },
  monument(h, w, d, M, D) {
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.3, 1), d);
    m.cyl(M.bronze, Math.min(w, d) * 0.12, Math.min(w, d) * 0.16, h - Math.min(h * 0.3, 1), 8, 0, Math.min(h * 0.3, 1));
    return m.build();
  },
  block(h, w, d, M, D) {
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.1, 1.2), d);
    m.box(D.brick, w * 0.98, h * 0.86, d * 0.98, 0, Math.min(h * 0.1, 1.2));
    m.box(D.limeShade, w, h * 0.04, d, 0, h * 0.96);
    return m.build();
  },
};
const BUILDER_ALIASES = [
  ['tokyo_tower', 'lattice'], ['skytree', 'lattice'],
  ['zojoji', 'temple'], ['honganji', 'temple'], ['shrine', 'temple'], ['yagura', 'temple'], ['otemon', 'temple'], ['kabukiza', 'temple'], ['kyuden', 'temple'], ['teahouse', 'temple'], ['nijubashi', 'temple'],
  ['bridge', 'bridge'], ['tokyo_station', 'block'], ['ministry_of_justice', 'block'],
  ['market', 'shed'], ['pier', 'shed'], ['takanawa', 'shed'], ['forum', 'shed'],
  ['statue', 'monument'], ['sl_plaza', 'monument'],
  ['diet', 'civic'], ['bank_of_japan', 'civic'], ['mitsukoshi', 'civic'], ['takashimaya', 'civic'], ['wako', 'civic'], ['court', 'civic'], ['theatre', 'civic'], ['kantei', 'civic'], ['ginza', 'civic'], ['aqua_city', 'civic'],
];
/** The massing builder for a landmark: by id, else by its height (a tower above ~60 m). */
function _builderFor(id, h = 0) {
  const s = String(id || '').toLowerCase();
  for (const [k, b] of BUILDER_ALIASES) if (s.includes(k)) return BUILDERS[b];
  return h > 12 ? BUILDERS.glass : null;
}

// --------------- the builder ---------------
// Park lawns kept open of the tree scatter (and of the survey's trees)
// (street-tree kinds stand on the kerb)
const KERB = new Set(['street', 'ginkgo', 'zelkova']);
const OPEN_LAWN = /fountain|lawn|meadow|mural|field|ballfield/i;
export function buildTokyo(scene, world, opts, K) {
  const L = _layout;
  if (!L) throw new Error('buildTokyo: layout not loaded (call loadLevelData first)');
  const M = LK.mats(), D = tokyoMats(M);
  const { ribbon, polygonGeom, quadAlong, pointInPoly, distToPolyline } = LK;
  const buildings = [];
  // (what the dressing placed, per kind: world.levelStats, read by the QA scripts)
  const stats = { trees: 0 };
  if (world) world.levelStats = stats;
  const grid = new K.BuildingGrid(60);
  const lite = !!opts.lite;
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  K.setBuildingLite(lite);
  setLookLayerKey('tokyo', TOKYO_LOOK.key, TOKYO_LOOK.az); // (tokyo-design's light: tokyoLook.js)
  const smallCull = glb && lite ? { px: 3, maxH: 2, keep: /tree|lamp/i } : null;
  // (instancing tiles as NYC's)
  // (a long map, 4.4 x 7.2 km: wider instancing tiles than the other levels' 300 keep the draw count in budget)
  const instance = () => K.instanceStaticClones(scene, !glb ? Infinity : lite ? 640 : 480, lite ? 185 : 150, smallCull);
  K.setBuildingTile(!glb || lite ? Infinity : 640);
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
  const makeParkTree = createTokyoTrees(K, lite, glb);
  K.onTemplatesReady((sc, get) => {
    for (const g of [..._kitDefs(), ...TOKYO_LANDMARK_GLBS.filter((d) => d.ready).map((d) => ({ ...d, url: TOKYO_BASE + d.file }))]) {
      get(g.url)?.traverse((o) => {
        if (!o.isMesh) return;
        // A model's own pool surface (material 'water'): the layout's water stands there
        // (hidden on the material, which the placed instances share with the template)
        if (/^water$/i.test(o.material?.name || '')) { o.material.visible = false; return; }
        for (const m of [].concat(o.material)) tokyoFacade(m, g.file);
      });
    }
  });
  const surfaceWear = configureChicagoWear(null, L.paths, lite);
  if (world) world.chicagoSurfaceWear = surfaceWear;
  animators.push({ update(dt, time) { tickTokyoMaterials(time); } });
  const SW_TILE = K.TILE.SIDEWALK, ASPHALT_TILE = 2;
  // (an avenue: a road at the major minimum or wider)
  const MAJOR_W = (STREET_MIN?.minMajor ?? 7) - 0.1, SIDEWALK_W = 1.2, PS = 0.8;
  const ring = opts.mode === 'wrestling' && L.ring ? L.ring : null;
  // Landmarks that stand: a district or an area with no structure of its own
  // (Times Square, Bryant Park) is a name on the map, nothing is built there
  // (and a line or a moving thing the level animates itself: the trains, the ferries)
  const ANIMATED = /^(train|ferry_in_bay)$/;
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
  if (ring) setArenaSite({ x: ring.x, z: ring.z, title: TOKYO_TITLE, place: ring.place || 'HIBIYA PARK', fountain: false, stands: ['n', 's'].filter(standsFree).join(''), east: ring.east || 0, west: ring.west || 0, gate: ring.gate ?? true, flag: 'tokyo',
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
    tokyoWater(WU); // (tokyo-design's Sound colours)
    animators.push({ update(dt, time) { WU.uTime.value = time; } });
    waterSplash = splashPool(scene, lite ? 200 : 600, lite ? 12 : 32);
    animators.push(waterSplash);
    const wfx = waterFX(waterMat, field, waterSplash, lite);
    animators.push(wfx);
    if (world) world.water = wfx;
  }
  // Tokyo's own ground maps (tokyoMaterials.js): sidewalks, lawns, plazas, park paths
  const swMat = tokyoGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'pavement');
  const lawnMat = tokyoGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'lawn');
  const grassMat = tokyoGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'grass');
  const plazaMat = tokyoGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'plaza');
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
    tokyoGround(asphalt, 'asphalt');
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

  // ---- parks: the Imperial Palace grounds, Hibiya and Shiba Park, Hama-rikyu, the piers and plazas ----
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
      if (!KERB.has(t[2])) return t;
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
    const ok = ([x, z, kind]) => !isWater(x, z) && (KERB.has(kind) ? !carriage(x, z, 0.15) : !onRoad(x, z, 0.3)) && !onLandmark(x, z) && !inRingBox(x, z) && !meadows.some((q) => pointInPoly(x, z, q));
    const list = [];
    for (const kinds of [['park', 'evergreen', 'pine', 'sakura', 'camphor', 'cedar'], ['ginkgo'], ['zelkova', 'street', null]]) {
      const tier = L.trees.filter((t) => kinds.includes(t[2]) || (kinds.includes(null) && !['park', 'evergreen', 'pine', 'sakura', 'camphor', 'cedar', 'ginkgo', 'zelkova', 'street'].includes(t[2]))).filter(ok);
      const room = TREE_CAP - list.length;
      if (room <= 0) break;
      const step = tier.length > room ? tier.length / room : 1;
      for (let i = 0; i < tier.length && list.length < TREE_CAP; i += step) list.push(tier[Math.floor(i)]);
    }
    // (tokyoLandscape.js sizes each layout kind to its species' true height at s = 1)
    for (const [x, z, kind] of list) tree(x, z, 0.9 + Math.random() * 0.2, kind);
    stats.treesSurvey = L.trees.length; stats.treesOk = L.trees.filter(ok).length;
    // (why the rest were left out: the first test each fails)
    const why = { water: 0, road: 0, landmark: 0, ring: 0, lawn: 0 };
    for (const [x, z, kind] of L.trees) {
      if (isWater(x, z)) why.water++;
      else if (KERB.has(kind) ? carriage(x, z, 0.15) : onRoad(x, z, 0.3)) why.road++;
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
    // (tokyo-design's timber deck)
    const deckMat = tokyoGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'pier');
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
  // on the flat roofs (tokyo-design's tokyo_rooftop_mech when shipped);
  // true size. Off on phone LOW (the procedural tier).
  const MECH = glb && _kit('tokyo_rooftop_mech');
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
    // A kit piece made for this very footprint (tokyoManifest layoutIds)
    const own = Object.values(TOKYO_KIT_GLBS).find((d) => d.ready && d.layoutIds && d.layoutIds.includes(o.id));
    if (own) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
      b.layoutId = o.id; b._skipBodyIM = true;
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      b.debrisTint = _stoneOf(own.file);
      orient(b, o.w, o.d, o.rotY);
      K.queueGLB({ url: TOKYO_BASE + own.file, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, stretch: 1.6, lot: lotOf(o.w, o.d, o.rotY) });
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
    if (onMat(lm.x, lm.z, aw / 2, ad / 2) || (lm.kind === 'prop' && lm.h < 4 && inRingBox(lm.x, lm.z))) { console.info('[tokyo] landmark inside the ring venue, left out:', lm.id); continue; }
    const hp = lm.hp || Math.max(120, Math.round(lm.h * 3 + lm.w * lm.d * 0.05));
    const b = new K.Building(lm.x, lm.z, aw, ad, lm.h, { skipWindows: true });
    orient(b, lm.w, lm.d, lm.rotY);
    b._skipBodyIM = true;
    b.maxHp = hp; b.hp = hp;
    b.landmarkId = lm.id;
    b.landmarkName = lm.name; // "THROUGH THE SPACE NEEDLE!" (wrestling callouts)
    if (lm.kind === 'bridge' || lm.onPier || lm.onWater || /bridge|_pier$|statue_of_liberty|teahouse/.test(lm.id)) b.onWater = true; // (on a pier or over the bay on purpose)
    // (a model whose own footprint holds layout water, e.g. the Pacific Science Center's pools: manifest onWater)
    if (_landmarkGLB(lm.id)?.onWater) b.onWater = true;
    b.debrisTint = _stoneOf(_landmarkGLB(lm.id)?.file || lm.id);
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const def = _landmarkGLB(lm.id);
    if (def) {
      // tokyo-design's models are built at true size: uniform 0.2 u/m (a spire
      // makes the layout's roof height a poor scale reference)
      const h = def.trueHeightM * S;
      const url = TOKYO_BASE + def.file;
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
    const pend = TOKYO_LANDMARK_GLBS.find((g) => !g.ready && (g.ids ? g.ids.includes(lm.id) : g.id === lm.id));
    // (listed by the smoke test as pending, not failed)
    b.pendingGLB = pend ? pend.file : lm.id + ' (procedural)';
    // The massing goes through the GLB path as its own template (instance
    // slots: a kaiju can lift it, or tear chunks off a tower, as from a model)
    const url = 'proc:tokyo/' + lm.id;
    K.registerTemplate(url, mesh);
    K.queueGLB({ url, h: hTrue, building: b, maxW: 0, maxD: 0, rotY: lm.rotY || 0, landmark: true });
  }

  // ---- elevated lines: the Yamanote viaduct and its trains, the Shinkansen, the Monorail, the Yurikamome, the Shuto Expressway ----
  // (tokyo_detail.json trains: [{ name, kind, points, elevated, deckMetres }], expressways: [{ name, points, deckMetres }].)
  // Each elevated line is a run of instanced deck segments on piers (tokyo-design's kit pieces when ready, else boxes):
  // a segment the kaiju wades into drops to the street; a train reaching a fallen stretch, or struck, comes off.
  const elevated = []; // { segs: [{ x, z, ry, t }], y }
  const runLen = (l) => l.reduce((a, p, k) => a + (k ? Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0), 0);
  const cleanRun = (pts) => clipVenue((pts || []).filter((p) => inB(p)), 2).sort((a, b) => runLen(b) - runLen(a))[0] || [];
  const offsetRun = (pts, o) => pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - (b[1] - a[1]) / l * o, p[1] + (b[0] - a[0]) / l * o];
  });
  /** An elevated run along pts: deck top at y (u), segments segLen long. kit: { seg, pier } urls (true-size models, the
   *  segment segM metres long along Z with its origin at ground level); proc: { w, t, color, pierW } for the box stand-in. */
  const elevatedRun = (ptsIn, y, segLen, kit, proc, overWater = false) => {
    // (one polyline, or several drawn as one batch: the expressway's many ramps and carriageways)
    const segs = [];
    for (const pts of (Array.isArray(ptsIn[0][0]) ? ptsIn : [ptsIn])) {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = cum[cum.length - 1], n = Math.floor(total / segLen);
      const at = (d) => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, ry: Math.atan2(bx - ax, bz - az) };
      };
      // (n segments spread over the whole run, so the two ends meet the next polyline)
      for (let i = 0; i < n; i++) { const p = at((i + 0.5) * total / n); if (overWater || !isWater(p.x, p.z)) segs.push({ ...p, t: -1 }); }
    }
    if (!segs.length) return null;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), roll = new THREE.Quaternion(), zAx = new THREE.Vector3(0, 0, 1);
    const run = { segs, y, im: null, k: 1, kz: 1, y0: 0 };
    const pose = (s, i, k) => {
      q.setFromAxisAngle(up, s.ry).multiply(roll.setFromAxisAngle(zAx, k * 0.5));
      run.im.setMatrixAt(i, mtx.compose(v3.set(s.x, run.y0 - k * run.drop, s.z), q, sc.set(run.k, run.k, run.k * run.kz)));
    };
    const set = (geom, mat, k, kz, y0, drop) => {
      if (run.im) { scene.remove(run.im); run.im.dispose(); }
      run.im = new THREE.InstancedMesh(geom, mat, segs.length);
      Object.assign(run, { k, kz, y0, drop });
      segs.forEach((s, i) => pose(s, i, s.t < 0 ? 0 : 1));
      run.im.castShadow = true; run.im.receiveShadow = true; run.im.frustumCulled = false;
      run.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(run.im);
    };
    run.pose = pose;
    // (the stand-in: a deck slab on a centre pier, one geometry)
    set(mergeGeometries([new THREE.BoxGeometry(proc.w, proc.t, segLen).translate(0, y - proc.t / 2, 0), new THREE.BoxGeometry(proc.pierW, y - proc.t, proc.pierW).translate(0, (y - proc.t) / 2, 0)], false), proc.mat, 1, 1, 0, y * 0.8);
    if (kit?.seg) K.onTemplatesReady((sc0, get) => {
      const geoms = [];
      for (const [url, zk] of [[kit.seg, 1], [kit.pier, 0]]) {
        const t = url && get(url);
        let mesh = null;
        t?.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) { if (zk) return; continue; }
        t.updateMatrixWorld(true);
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geoms.push({ g, mat: mesh.material });
      }
      const seg = geoms[0];
      set(seg.g, seg.mat, S, segLen / (kit.segM * S), (y - kit.topM * S), y * 0.8);
      // (the piers: a second instanced mesh, one under every segment; they stay standing when a segment falls)
      if (geoms[1]) {
        const pim = new THREE.InstancedMesh(geoms[1].g, geoms[1].mat, segs.length);
        segs.forEach((s, i) => pim.setMatrixAt(i, mtx.compose(v3.set(s.x, 0, s.z), q.setFromAxisAngle(up, s.ry), sc.set(S, S * (y / (kit.topM * S)), S))));
        pim.castShadow = true; pim.receiveShadow = true; pim.frustumCulled = false;
        scene.add(pim);
      }
    });
    elevated.push(run);
    return run;
  };
  const brickMat = D.brick, deckMat = M.concrete;
  const trainLines = (L.detail?.trains || []).map((t) => ({ ...t, pts: cleanRun(t.points) })).filter((t) => t.pts.length >= 2 && runLen(t.pts) > 40);
  const trains = [];
  const addTrain = (pts, y, kitId, lenM, speed, phase, color) => {
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const g = new THREE.Group(), Lt = lenM * S;
    const m = new LK.Massing();
    m.box(color, 0.58, 0.5, Lt, 0, 0.12); m.box(M.darkGlass, 0.6, 0.18, Lt * 0.96, 0, 0.34); m.box(D.limestone, 0.5, 0.06, Lt * 0.98, 0, 0.62);
    g.add(m.build(true));
    scene.add(g);
    const kit = _kit(kitId);
    if (kit) K.onTemplatesReady((sc0, get) => { const t = get(kit); if (!t) return; g.clear(); const c = t.clone(true); c.scale.setScalar(S); g.add(c); });
    trains.push({ g, pts, cum, total: cum[cum.length - 1], s: phase, dir: phase > 0.5 ? -1 : 1, wait: 0, fall: -1, base: new THREE.Vector3(), ry: 0, side: trains.length % 2 ? 1 : -1, speed, y, half: Lt / 2 });
  };
  const green = new THREE.MeshStandardMaterial({ color: 0x9ccc4a, roughness: 0.6 }), blue = new THREE.MeshStandardMaterial({ color: 0x4aa8d8, roughness: 0.6 });
  green.userData.shared = blue.userData.shared = true;
  for (const t of trainLines) {
    const y = t.elevated === false ? 0.08 : (t.deckMetres || (t.kind === 'monorail' ? 10 : t.kind === 'yurikamome' ? 14 : 7)) * S;
    if (t.kind === 'yamanote') {
      // the brick viaduct under the whole corridor; the Yamanote, the Keihin-Tohoku and (when its own line is not given) the Shinkansen on it
      if (t.elevated !== false) elevatedRun(t.pts, y, 6, { seg: _kit('rail_viaduct_segment'), segM: 30, topM: 7 }, { w: 4.4, t: y, pierW: 0.1, mat: brickMat });
      addTrain(offsetRun(t.pts, -1.1), y, 'tokyo_yamanote_train', 100, 3.4, 0.1, green);
      if (!lite) addTrain(offsetRun(t.pts, -0.3), y, _kit('tokyo_keihin_train') ? 'tokyo_keihin_train' : 'tokyo_yamanote_train', 100, 3.0, 0.7, blue);
      if (!trainLines.some((q) => q.kind === 'shinkansen')) addTrain(offsetRun(t.pts, 1.3), y, 'tokyo_shinkansen', 200, 6, 0.4, M.white);
    } else if (t.kind === 'shinkansen') {
      addTrain(t.pts, y, 'tokyo_shinkansen', 200, 6, 0.4, M.white);
    } else if (t.kind === 'monorail') {
      if (t.elevated !== false) elevatedRun(t.pts, y, 6, null, { w: 0.2, t: 0.36, pierW: 0.3, mat: deckMat }, true);
      addTrain(t.pts, y, 'tokyo_monorail_train', 90, 3.6, 0.2, M.white);
    } else {
      if (t.elevated !== false) elevatedRun(t.pts, y, 6, null, { w: 1.5, t: 0.3, pierW: 0.4, mat: deckMat });
      addTrain(t.pts, y, 'tokyo_yurikamome_train', 54, 2.8, 0.3, M.white);
    }
  }
  // The Shuto Expressway's elevated decks, all its lines and ramps as one batch (phones: left out; the streets
  // under them are the layout's roads)
  if (!lite) {
    const runs = (L.detail?.expressways || []).map((e) => cleanRun(e.points)).filter((pts) => pts.length >= 2 && runLen(pts) > 12);
    if (runs.length) elevatedRun(runs, 15.5 * S, 6, { seg: _kit('expressway_deck_segment'), pier: _kit('expressway_pier'), segM: 30, topM: 15.5 }, { w: 3.4, t: 0.4, pierW: 0.5, mat: deckMat }, true);
  }
  stats.trains = trains.length; stats.elevatedRuns = elevated.length; stats.elevatedSegs = elevated.reduce((a, r) => a + r.segs.length, 0);
  if (trains.length || elevated.length) {
    const RT = 0.9;
    let acc = 0;
    const fallen = (x, z, r) => elevated.some((run) => run.segs.some((s) => s.t >= 0 && Math.abs(s.x - x) < r && Math.abs(s.z - z) < r));
    const at = (tr, d, out) => {
      const { pts, cum } = tr;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      out.set(ax + (bx - ax) * f, tr.y, az + (bz - az) * f);
      return Math.atan2(bx - ax, bz - az);
    };
    animators.push({
      update(dt) {
        const kp = world && world.kaijuPos;
        acc += dt;
        const check = acc > 0.1;
        if (check) acc = 0;
        for (const run of elevated) {
          let dirty = false;
          run.segs.forEach((s, i) => {
            if (check && kp && s.t < 0 && Math.abs(kp.x - s.x) < 6 && Math.abs(kp.z - s.z) < 6 && Math.hypot(kp.x - s.x, kp.z - s.z) < 5.6) { s.t = 0; world.onCarDestroyed?.(); }
            if (s.t >= 0 && s.t < RT) { s.t = Math.min(RT, s.t + dt); const k = s.t / RT; run.pose(s, i, k * k); dirty = true; }
          });
          if (dirty) run.im.instanceMatrix.needsUpdate = true;
        }
        for (const tr of trains) {
          if (tr.fall >= 0) {
            if (tr.fall < 1) {
              tr.fall = Math.min(1, tr.fall + dt);
              const k = tr.fall * tr.fall;
              tr.g.position.set(tr.base.x + Math.cos(tr.ry) * tr.side * k * 1.2, tr.base.y * (1 - k) + 0.3 * k, tr.base.z - Math.sin(tr.ry) * tr.side * k * 1.2);
              tr.g.rotation.set(0, tr.ry, k * 1.45 * tr.side);
              if (tr.fall === 1 && waterSplash && isWater(tr.base.x, tr.base.z)) waterSplash.burst(tr.base.x, tr.base.z, lite ? 10 : 24);
            }
            continue;
          }
          if (tr.wait > 0) tr.wait -= dt;
          else {
            tr.s = Math.max(0, Math.min(1, tr.s + tr.dir * tr.speed * dt / tr.total));
            if (tr.s === 0 || tr.s === 1) { tr.dir = -tr.dir; tr.wait = 8; }
          }
          tr.ry = at(tr, tr.s * tr.total, tr.base) + (tr.dir < 0 ? Math.PI : 0);
          tr.g.position.copy(tr.base);
          tr.g.rotation.set(0, tr.ry, 0);
          if (check && ((kp && Math.hypot(kp.x - tr.base.x, kp.z - tr.base.z) < 3.5 + tr.half) || fallen(tr.base.x, tr.base.z, 4 + tr.half * 0.5))) { tr.fall = 0; world.onCarDestroyed?.(); }
        }
      },
    });
  }

  // ---- Tokyo Bay: water buses and ferries, ships at anchor, small craft, the container cranes ----
  // (tokyo_detail.json ferries: [{ name, points: [[x, z], ...] }]: each ferry waits at its dock,
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
    const kitFerry = _kit('tokyo_water_bus'), kitClassic = _kit('tokyo_ferry');
    for (const f of ferryRoutes) {
      const g = new THREE.Group();
      g.add(procFerry());
      scene.add(g);
      const pts = f.route, cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const big = !!kitClassic && ferries.length % 3 === 2;
      ferries.push({ g, pts, cum, s: 0, dir: 1, wait: 6 + ferries.length * 25, sink: -1, ry: Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), kit: big ? kitClassic : kitFerry, hl: (big ? 120 : 34) * S / 2 + 2.5, hw: (big ? 17 : 8) * S / 2 + 2.6 });
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
  // A container ship at anchor, pleasure boats and a tug on the bay, the far shore's container cranes
  {
    const ship = L.detail?.containerShip, kShip = _kit('tokyo_container_ship');
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
    const cranes = (L.surround?.cranes || []).slice(0, lite ? 4 : 10), kCrane = _kit('tokyo_container_crane');
    if (kCrane) for (const c of cranes) placeKit(kCrane, c.x, c.z, c.rot || 0, 0);
    // Small craft in open water clear of the piers and the ferry lanes (seeded: the same every run)
    const kSail = _kit('tokyo_yakatabune'), kTug = _kit('tokyo_tug'), kFish = _kit('tokyo_fishing_boat');
    if (kSail || kTug || kFish) {
      const rnd = _seeded('tokyo-bay-craft');
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
    // Radio masts in the surround, when it lists any: a tapered red-and-white column each
    const masts = L.surround?.masts || [];
    if (masts.length) {
      const m = new LK.Massing();
      for (const ms of masts) {
        const h = (ms.heightMetres || 150) * S, y0 = tokyoHillHeight(ms.x, ms.z, B);
        for (let k = 0; k < 6; k++) m.cyl(k % 2 ? M.white : M.red, 0.25 + (5 - k) * 0.12, 0.25 + (6 - k) * 0.12, h / 6, 4, ms.x, y0 + k * h / 6, ms.z);
      }
      const g = m.build(false);
      g.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); o.userData.backdrop = false; } });
      scene.add(g);
    }
    // The islands' ground (surround islands: the bay's reclaimed land past the bounds)
    const isl = (L.surround?.islands || []).filter((i) => i.polygon?.length >= 3);
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
    // Tokyo props at true size (manifest heightM x 0.2), Chicago's at their kit height
    const propH = (name, chi) => { const d = TOKYO_PROP_GLBS.find((p) => p.name === name); return d && d.heightM ? d.heightM * S : chi; };
    for (const n of ['chi_streetlamp', 'chi_bus_shelter']) {
      K.propScene(n)?.traverse((o) => { if (o.isMesh && o.material.emissiveMap) o.material.emissiveIntensity = 0.08; });
    }
    // Tokyo's lamps when shipped (twin-arm standards on the avenues, Ginza's green willow lamps on Chuo-dori through
    // Ginza), else Chicago's, else procedural; the side streets carry utility poles instead
    const lampName = K.hasProp('tokyo_streetlamp') ? 'tokyo_streetlamp' : K.hasProp('chi_streetlamp') ? 'chi_streetlamp' : 'street_lamp';
    const hasLamp = K.hasProp(lampName);
    const market = K.hasProp('tokyo_streetlamp_ginza') ? roads.filter((r) => /chuo.?dori|中央通/i.test(r.name || '')) : [];
    const onMarket = (x, z) => z > -80 && z < 10 && market.some((r) => distToPolyline(x, z, r.points) < r.width / 2 + 1.2);
    // Lamps ~40 m apart on both sides of the avenues (staggered), every ~60 m on one side of
    // the side streets; phones: the avenues only, sparser. Chicago's / Tokyo's stand-ins sparser still
    const own = /^tokyo_/.test(lampName);
    const lampEvery = own ? (lite ? 20 : 8) : lite ? 40 : 24;
    const putLamp = (x, z, ry, pole = false) => {
      if (isWater(x, z) || onRing(x, z) || inRingBox(x, z)) return;
      const name = pole && K.hasProp('tokyo_utility_pole') ? 'tokyo_utility_pole' : market.length && onMarket(x, z) ? 'tokyo_streetlamp_ginza' : lampName;
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
          for (; acc < l; acc += own ? 12 : 30) putLamp(ax + dx * acc - dz * off, az + dz * acc + dx * off, Math.atan2(dx, dz) - Math.PI / 2, true);
          acc -= l;
        }
      }
    }
    const sigName = K.hasProp('tokyo_traffic_signal') ? 'tokyo_traffic_signal' : 'chi_traffic_signal';
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
    const shelterName = K.hasProp('tokyo_bus_stop') ? 'tokyo_bus_stop' : 'chi_bus_shelter';
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
    const rng = _seeded('tokyo-dressing');
    const put = (name, x, z, ry) => {
      if (!K.hasProp(name) || isWater(x, z) || onRing(x, z) || inRingBox(x, z)) return false;
      const p = K.cloneProp(name, propH(name, 1));
      p.position.set(x, 0, z); p.rotation.y = ry;
      p.matrixAutoUpdate = false; p.updateMatrix();
      p.userData.instance = true;
      scene.add(p);
      return true;
    };
    // Corners: hydrants, trash cans, newspaper boxes; coffee carts mid-block (tokyo-design's props, as shipped)
    const corners = net.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.edges.length >= 3);
    const caps = { tokyo_vending_machine: lite ? 40 : 260, tokyo_bicycle_rack: lite ? 0 : 160, tokyo_mailbox: lite ? 0 : 60, tokyo_subway_entrance: lite ? 0 : 40, tokyo_koban: lite ? 0 : 10 };
    const count = {};
    for (const [nd, ni] of corners) {
      const e = net.edges[nd.edges[0]], w = e.laneOff * 4, ux = e.a === ni ? e.dx : -e.dx, uz = e.a === ni ? e.dz : -e.dz;
      for (const [name, chance, back, side] of [['tokyo_vending_machine', 0.55, 1.5, 0.45], ['tokyo_bicycle_rack', 0.3, 2.4, -0.45], ['tokyo_mailbox', 0.12, 1.1, -0.4], ['tokyo_subway_entrance', 0.08, 3.2, 0.5], ['tokyo_koban', 0.02, 2.6, -0.6]]) {
        if ((count[name] || 0) >= caps[name] || rng() > chance) continue;
        const o = w / 2 + SIDEWALK_W * side + 0.6, x = nd.x + ux * (w / 2 + back) - uz * o, z = nd.z + uz * (w / 2 + back) + ux * o;
        if (put(name, x, z, Math.atan2(ux, uz))) count[name] = (count[name] || 0) + 1;
      }
    }
    // Festival stalls on the avenue blocks by the temples and shrines (Zojo-ji, Hie Shrine, Tsukiji Hongan-ji)
    const holy = LMS.filter((lm) => /zojoji|shrine|honganji/.test(lm.id));
    const fair = art.filter((e) => holy.some((lm) => Math.hypot(net.nodes[e.a].x - lm.x, net.nodes[e.a].z - lm.z) < 45));
    for (let i = 0; i < (lite ? 3 : 14) && fair.length; i++) {
      const e = fair[Math.floor(rng() * fair.length)], w = e.laneOff * 4, t = e.len * (0.2 + rng() * 0.6), sd = rng() < 0.5 ? 1 : -1;
      const x0 = net.nodes[e.a].x + e.dx * t, z0 = net.nodes[e.a].z + e.dz * t;
      put('tokyo_yatai', x0 - e.dz * sd * (w / 2 + 0.6), z0 + e.dx * sd * (w / 2 + 0.6), Math.atan2(e.dx, e.dz) + (sd > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
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
    // Park lamps and benches along the park walks (Hibiya Park, Shiba Park, Hama-rikyu, the waterfront promenades)
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
            if (put('tokyo_park_lamp', x, z, Math.atan2(dx, dz))) lamps++;
            if (benches < benchCap && rng() < 0.5 && put('tokyo_bench', x - dz * 1.6 + dx * 2, z + dx * 1.6 + dz * 2, Math.atan2(-dz, dx))) benches++;
          }
          acc -= l;
        }
      }
    }
  }

  // ---- the surround: the city past the bounds (Roppongi and Akasaka, Kanda, Koto's wharves, Shinagawa) ----
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
    // (the hill neighbourhoods and West Tokyo: painted clapboard houses and low apartments in greys, tans and greens)
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
      addBox(x, z, w, h, d, rot || 0, tint, ROOFS[k % 3], tokyoHillHeight(x, z, B)); // (on tokyo-design's hills)
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

  // ---- the high ground past the bounds (tokyoLandscape.js), one unlit mesh; the surround boxes stand on it ----
  {
    const hills = createTokyoHills(B, L.surround?.water || [], { lite });
    hills.userData.backdrop = false; hills.userData.outerGround = true;
    scene.add(hills);
  }

  // ---- the horizon: Mount Fuji to the west-south-west over the Tanzawa range, Okutama and Chichibu to the west
  // and north-west, Mount Tsukuba to the north-east, the Boso hills across the bay ----
  // Silhouettes with the haze baked into their vertex colours (unlit, no fog), riding with the camera at R0
  // inside the sky dome, each at about 1.6x its true angular height (heights below are at 1750u, scaled to R0).
  // Dusk: dark blue-violet ranges against the afterglow, Fuji's cone the tallest thing on the skyline.
  {
    const R0 = 1400, HK = R0 / 1750, pos = [], col = [], idx = [];
    const haze = new THREE.Color(TOKYO_LOOK.statics.bg), cA = new THREE.Color(), cB = new THREE.Color(), cR = new THREE.Color();
    const rock = new THREE.Color(0x3c4460), forest = new THREE.Color(0x2c3448), snow = new THREE.Color(0xc8cce0);
    const rnd = _seeded('tokyo-horizon');
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
    range(228, 262, [[246, 110, 9], [244.5, 96, 4], [247.5, 98, 4]], 0.55, 0.3, 8, 2, 1.9); // Mount Fuji (3,776 m, 97 km): the cone, snow on the upper half
    range(222, 300, [[232, 34, 8], [252, 44, 9], [268, 40, 8], [284, 46, 9], [296, 36, 6]], 2, 0.4, 12, 6); // Tanzawa and Okutama (~1,500-2,000 m, 50-70 km)
    range(300, 350, [[312, 30, 9], [330, 24, 9]], 2, 0.5, 8, 4); // Chichibu
    range(24, 44, [[34, 30, 5], [36.5, 26, 3]], 2, 0.5, 4, 2, 1.5); // Mount Tsukuba (877 m, 62 km): the twin peak
    range(110, 170, [[128, 18, 12], [150, 22, 10]], 2, 0.5, 6, 3); // the Boso hills across the bay
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const hz = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    hz.frustumCulled = false; hz.renderOrder = -1;
    hz.matrixAutoUpdate = false;
    hz.name = 'tokyo_horizon';
    // (three computes the model-view matrix after onBeforeRender: centred on the camera every draw)
    hz.onBeforeRender = (r, sc0, cam) => { hz.matrixWorld.makeTranslation(cam.matrixWorld.elements[12], 0, cam.matrixWorld.elements[14]); };
    scene.add(hz);
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
    level: 'tokyo', bounds: { ...B }, center: { x: cxB, z: czB },
    spawn: { ...L.spawn }, isWater, barrier, landPoint: sidewalkPoint,
    mapWater: L.water.map((w) => ({ kind: w.kind, polygon: w.polygon, holes: w.holes })),
    enemySpawns: L.enemySpawns, duelSpawns: L.duel, soldierSpawn: L.soldier, ringSite: L.ring,
  };
}
