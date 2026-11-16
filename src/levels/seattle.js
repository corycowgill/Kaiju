// Seattle: the city along Elliott Bay from the stadiums (T-Mobile Park, Lumen
// Field) north through Pioneer Square, the downtown core, Pike Place and
// Belltown to Seattle Center and the south shore of Lake Union, built from
// assets/levels/seattle_layout.json (NYC's schema: game units, 0.2 u/m, +X
// east, +Z south, true north up; downtown's three street grids keep their
// real angles through each lot's rot). Follows nyc.js and shares Chicago's
// helpers, materials, water and ring (chicago.js LEVEL_KIT, chicago_water.js,
// chicago_arena.js at the layout's ring site); the Seattle specifics are the
// landmark massing (the Space Needle, the stadiums, the piers), the bay with
// its ferries, the Monorail, and the surround (West Seattle across the bay,
// the hills east of I-5, Mount Rainier and the Olympics on the horizon).
// The ground is flat: Seattle's hills are not modelled.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL_KIT as LK } from './chicago.js';
import { seattleGround, seattleFacade, tickSeattleMaterials, createSeattleTrees, seattleWater } from './seattleMaterials.js';
import { createSeattleHills, seattleHillHeight } from './seattleLandscape.js';
import { configureChicagoWear } from './chicagoMaterials.js';
import { isMobile } from '../quality.js';
import { assetURL } from '../assetCache.js';
import { splashPool } from './chicago_harbor.js';
import { bakeShoreField, makeWaterMaterial, waterUniforms, waterFX } from './chicago_water.js';
import { buildArena, arenaNoTree, setArenaSite } from './chicago_arena.js';
import { setLookLayerKey } from '../look.js';
import { SEATTLE_LOOK } from './seattleLook.js';
import { SEATTLE_BASE, SEATTLE_LANDMARK_GLBS, SEATTLE_GENERIC_GLBS, SEATTLE_PROP_GLBS, SEATTLE_VEHICLE_GLBS, SEATTLE_KIT_GLBS } from './seattleManifest.js';

// The cartographer's layout (the integrator's placeholder before it: seattle_layout_placeholder.json,
// devtools/seattle/integrator/make_placeholder.mjs)
const LAYOUT_URL = './assets/levels/seattle_layout.json';
// The cartographer's tree survey ([x, z, kind, osm]; layout meta.trees: false when there is none)
const TREES_URL = './assets/levels/seattle_trees.json';
// The city past the bounds from the footprint data (boxes, the bay and the lakes over the fetch area: cartographer)
const SURROUND_URL = './assets/levels/seattle_surround.json';
// Dressing detail: the Monorail, the ferry routes (cartographer)
const DETAIL_URL = './assets/levels/seattle_detail.json';
/** The Title Match belt on Seattle (mat, banners, HUD). */
export const SEATTLE_TITLE = 'SEATTLE HEAVYWEIGHT CHAMPIONSHIP';

// Gameplay minimum street widths (u): Seattle's real streets are narrow, and the shared
// 7 / 4.5 trims more of its blocks than NYC's. TRIAL (lead's decision pending): null keeps the
// shared minimums; { minMajor, minMinor } passes Seattle's own to normalizeLayout
const STREET_MIN = { minMajor: 6, minMinor: 4 };
let _layout = null;
/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadSeattleLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`seattle layout: HTTP ${r.status}`);
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
  _layout.monorail = raw.monorail || null; // (the Monorail's beams: seattle.js)
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

// --------------- GLB assets (seattleManifest.js) ---------------
const _ok = (g) => g.ready && !(isMobile && g.desktopOnly);
const _landmarkGLB = (id) => SEATTLE_LANDMARK_GLBS.find((g) => g.ready && (g.ids ? g.ids.includes(id) : g.id === id));
const _kit = (id) => (SEATTLE_KIT_GLBS[id]?.ready ? SEATTLE_BASE + SEATTLE_KIT_GLBS[id].file : null);
// Until Seattle's own block kit is ready: Chicago's whole generic kit (glass
// towers downtown, brick and masonry in Pioneer Square and Belltown)
function _kitDefs() {
  const own = SEATTLE_GENERIC_GLBS.filter(_ok).map((g) => ({ ...g, url: SEATTLE_BASE + g.file }));
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
// kit styles that suit it (seattle-design's `style` field); a lot keeps the
// whole bucket when none of them is in it
const STYLE_OK = {
  brick: /brick|masonry|pioneer|warehouse/, warehouse: /warehouse|brick/, lowrise: /lowrise|brick|warehouse|apartment/,
  midrise: /midrise|concrete|apartment/, apartment: /apartment|midrise/,
  glassslab: /glassslab|glasstower|glass/, glasstower: /glasstower|glassslab|glass/,
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
const STONE = { terra: 0xe2dccc, brick: 0x8a4a3a, concrete: 0xa9a397, glass: 0x8f9aa4, granite: 0x9a948c, steel: 0xc8ccd0 };
function _stoneOf(file) {
  const all = [...SEATTLE_LANDMARK_GLBS, ...SEATTLE_GENERIC_GLBS, ...Object.values(SEATTLE_KIT_GLBS)];
  const def = all.find((g) => g.file === file || SEATTLE_BASE + g.file === file);
  if (def && def.stone != null) return def.stone;
  const f = String(file);
  return /brick|pioneer|warehouse|loft|pike_place|king_street|union_station|masonry/.test(f) ? STONE.brick
    : /smith_tower|terra/.test(f) ? STONE.terra
    : /needle|wheel|monorail|arches|science/.test(f) ? STONE.steel
    : /glass|curtain|tower|columbia|rainier|union_square|f5|municipal|russell|bank|library|doppler|day_1|spheres|1201/.test(f) ? STONE.glass
    : /concrete|stadium|field|park|arena|dock|pier|garage/.test(f) ? STONE.concrete : STONE.granite;
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

/** Building GLB urls the Seattle level loads. */
export function seattleBuildingGLBs() {
  return [...new Set([
    ...SEATTLE_LANDMARK_GLBS.filter((g) => g.ready).map((g) => SEATTLE_BASE + g.file),
    ...Object.keys(SEATTLE_KIT_GLBS).filter((id) => !(isMobile && SEATTLE_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ..._kitDefs().map((g) => g.url),
  ])];
}
/** GLB urls with a <name>_lod1.glb twin on disk. */
export function seattleLod1GLBs() {
  return [...SEATTLE_LANDMARK_GLBS.filter((g) => g.ready && g.lod1 !== false).map((g) => SEATTLE_BASE + g.file),
    ...Object.keys(SEATTLE_KIT_GLBS).filter((id) => SEATTLE_KIT_GLBS[id].lod1 !== false).map(_kit).filter(Boolean),
    ...SEATTLE_GENERIC_GLBS.filter((g) => _ok(g) && g.lod1 !== false).map((g) => SEATTLE_BASE + g.file),
    ...SEATTLE_PROP_GLBS.filter((p) => p.ready && p.lod1 !== false).map((p) => SEATTLE_BASE + p.file),
    ...SEATTLE_VEHICLE_GLBS.filter((v) => v.ready && v.lod1 !== false).map((v) => v.url)];
}
/** Seattle-only street props as [{ name, url }]. */
export function seattlePropGLBs() {
  return SEATTLE_PROP_GLBS.filter((p) => p.ready).map((p) => ({ name: p.name, url: SEATTLE_BASE + p.file }));
}
/** Seattle-only vehicle defs for loadCarTemplates. */
export function seattleVehicleGLBs() {
  return SEATTLE_VEHICLE_GLBS.filter((v) => v.ready).map((v) => ({ ...v, levels: ['seattle'] }));
}

// --------------- materials ---------------
const FALLBACK_TEX = 'seattle_fallback_';
let _D = null;
/** Seattle's own massing surfaces on top of the shared (Chicago) set. */
function seattleMats(M) {
  if (_D) return _D;
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _D = {
    limestone: std(0xd2c6ae, 0.85), limeShade: std(0xb8ab94, 0.88), brick: std(0x9a6a52, 0.9), granite: std(0x8f8a82, 0.8),
    glass: std(0x3e5366, 0.3, 0.1), glassLight: std(0x8ea4b6, 0.32, 0.1), steel: std(0xb6bcc2, 0.35, 0.1),
    steelDark: std(0x37403c, 0.6, 0.2), // (pier piles, the Monorail's pylons)
    needleHalo: std(0xd8a040, 0.55, 0.2), // (the Space Needle's Galaxy Gold halo, MoPOP's gold)
    ferryGreen: std(0x1f6e4a, 0.6), // (the Washington State ferries' green stripe)
    copper: std(0x6c9c86, 0.7), roofDark: std(0x4a4c50, 0.85), slate: std(0x5c6066, 0.8),
    gravel: seattleGround(new THREE.MeshStandardMaterial(), 'gravel'),
  };
  // Tiling fallback facades for the procedural massing (FALLBACK_TEX:
  // seattle-design's seattle_fallback_*): glass curtain wall, stone, brick;
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
  needle(h, w, d, M, D) {
    // The Space Needle: three pairs of white legs pinched at the waist (~1/3 up)
    // round the core, flaring out under the saucer (the halo and the
    // restaurant / observation decks at ~150-160 m), the spire above
    const m = new LK.Massing();
    const r = Math.min(w, d) / 2, top = h * 0.84, waist = h * 0.33, rb = r * 0.55, rw = r * 0.16, rs = r * 0.42;
    m.cyl(M.concrete, r * 0.2, r * 0.24, top, 10); // the core (lifts, stairs)
    const leg = (x0, z0, y0, x1, z1, y1, t) => {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz);
      const g = new THREE.CylinderGeometry(t, t, l, 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / l, dy / l, dz / l)));
      m.add(M.white, g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    for (let i = 0; i < 6; i++) {
      const a = (i >> 1) * Math.PI * 2 / 3 + (i & 1 ? 0.22 : -0.22), aw = (i >> 1) * Math.PI * 2 / 3 + (i & 1 ? 0.12 : -0.12);
      const p0 = [Math.sin(a) * rb, Math.cos(a) * rb], p1 = [Math.sin(aw) * rw, Math.cos(aw) * rw], p2 = [Math.sin(a) * rs, Math.cos(a) * rs];
      leg(p0[0], p0[1], 0, p1[0], p1[1], waist, r * 0.05);
      leg(p1[0], p1[1], waist, p2[0], p2[1], top - h * 0.03, r * 0.045);
    }
    m.cyl(D.needleHalo, r * 0.9, r * 0.5, h * 0.03, 24, 0, top - h * 0.03); // the halo under the saucer
    m.cyl(M.darkGlass, r, r * 0.92, h * 0.035, 24, 0, top);                  // restaurant level (glass)
    m.cyl(M.white, r * 0.86, r, h * 0.02, 24, 0, top + h * 0.035);            // observation deck
    m.cyl(M.white, r * 0.3, r * 0.82, h * 0.03, 24, 0, top + h * 0.055);      // the roof cone
    m.cyl(M.steel, r * 0.02, r * 0.08, h - top - h * 0.085, 6, 0, top + h * 0.085); // the spire
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
  stepped(h, w, d, M, D) {
    // Columbia Center: three dark glass lobes stepping back at about 1/2 and 3/4 of its height
    const m = new LK.Massing();
    for (const [y0, y1, k] of [[0, 0.5, 1], [0.5, 0.76, 0.84], [0.76, 1, 0.64]]) {
      for (const [ox, oz, f] of [[0, 0, 1], [w * 0.16 * k, -d * 0.16 * k, 0.72], [-w * 0.16 * k, d * 0.16 * k, 0.72]]) m.box(M.darkGlass, w * k * f, h * (y1 - y0), d * k * f, ox, h * y0, oz);
    }
    return m.build();
  },
  pyramid(h, w, d, M, D, hm = h) {
    // Smith Tower: a white terra-cotta office block, the slim tower and its pyramid cap
    const m = new LK.Massing();
    const base = Math.min(hm, h) * 0.2, shaft = h * 0.62;
    m.box(D.limestone, w, base, d * 1.5);
    m.box(D.limestone, w * 0.66, shaft - base, d * 0.66, 0, base);
    m.add(D.copper, new THREE.ConeGeometry(w * 0.47, h - shaft, 4), 0, shaft + (h - shaft) / 2, 0, Math.PI / 4);
    return m.build();
  },
  pedestal(h, w, d, M, D) {
    // Rainier Tower: the tower on its tapering 11-storey concrete pedestal
    const m = new LK.Massing();
    const ped = h * 0.25;
    m.cyl(D.limeShade, w * 0.6, w * 0.24, ped, 4, 0, 0, 0, Math.PI / 4);
    m.box(D.glass, w * 0.98, h - ped, d * 0.98, 0, ped);
    return m.build();
  },
  library(h, w, d, M, D) {
    // Seattle Central Library: glass-and-diamond-steel volumes stacked off-centre
    const m = new LK.Massing();
    m.box(D.glassLight, w * 0.9, h * 0.22, d * 0.86);
    m.box(D.glassLight, w, h * 0.28, d * 0.7, w * 0.04, h * 0.22, -d * 0.1);
    m.box(D.glassLight, w * 0.76, h * 0.3, d * 0.9, -w * 0.08, h * 0.5, d * 0.04);
    m.box(D.glassLight, w * 0.6, h * 0.2, d * 0.62, w * 0.1, h * 0.8);
    return m.build();
  },
  market(h, w, d, M, D) {
    // Pike Place Market: the long low arcade along Pike Place, its roofline and the clock and sign at the corner
    const m = new LK.Massing();
    m.box(D.brick, w, h * 0.7, d);
    m.box(D.roofDark, w * 1.02, h * 0.1, d * 1.04, 0, h * 0.7);
    m.box(M.red, w * 0.12, h * 0.25, d * 0.08, -w * 0.4, h * 0.75, d * 0.5);
    return m.build();
  },
  wheel(h, w, d, M, D) {
    // The Great Wheel: the white rim on its A-frame legs (rim in the local X-Y plane)
    const m = new LK.Massing();
    const R = h * 0.47;
    m.add(M.white, new THREE.TorusGeometry(R, Math.max(0.1, R * 0.03), 6, 36), 0, h - R - 0.2, 0);
    for (const s of [-1, 1]) m.add(M.white, new THREE.CylinderGeometry(R * 0.03, R * 0.05, (h - R) * 1.05, 5), s * R * 0.3, (h - R) / 2, 0, 0, 0, s * 0.3);
    return m.build();
  },
  shed(h, w, d, M, D) {
    // A pier shed or ferry terminal: a long low hall with a shallow gabled roof
    const m = new LK.Massing();
    m.box(M.concrete, w, h * 0.75, d);
    m.add(D.roofDark, new THREE.CylinderGeometry(d * 0.6, d * 0.6, w, 3, 1), 0, h * 0.75, 0, 0, 0, Math.PI / 2, 1, 0.4, 1);
    return m.build();
  },
  stadium(h, w, d, M, D) {
    // Lumen Field / T-Mobile Park: the stands round the field, roofs over the long sides
    const m = new LK.Massing();
    const t = Math.min(w, d) * 0.18;
    for (const s of [-1, 1]) {
      m.box(M.concrete, w, h * 0.55, t, 0, 0, s * (d / 2 - t / 2));
      m.box(M.concrete, t, h * 0.45, d - 2 * t, s * (w / 2 - t / 2), 0, 0);
      m.box(D.steel, w * 0.92, h * 0.06, t * 1.2, 0, h * 0.85, s * (d / 2 - t * 0.7));
    }
    m.box(M.green, w - 2 * t, 0.12, d - 2 * t);
    return m.build();
  },
  station(h, w, d, M, D, hm = h) {
    // King Street Station: the brick depot and its clock tower (after Venice's campanile)
    const m = new LK.Massing();
    const roof = Math.min(hm, h * 0.3);
    m.box(D.brick, w, roof, d);
    m.box(D.brick, w * 0.18, h * 0.85, w * 0.18, w * 0.38, 0, 0);
    m.add(D.copper, new THREE.ConeGeometry(w * 0.12, h * 0.15, 4), w * 0.38, h * 0.925, 0, Math.PI / 4);
    return m.build();
  },
  spheres(h, w, d, M, D) {
    // The Amazon Spheres: three glass domes of diamond steel
    const m = new LK.Massing();
    // (each cap runs from r down to r cos(0.6 pi) = -0.309 r: scaled to h k tall, its rim on the ground)
    for (const [ox, oz, k] of [[0, 0, 1], [w * 0.3, d * 0.15, 0.8], [-w * 0.3, -d * 0.1, 0.8]]) {
      const r = Math.min(w, d) * 0.32 * k, sy = h * k / (1.309 * r);
      m.add(D.glassLight, new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), ox, 0.309 * r * sy, oz, 0, 0, 0, 1, sy, 1);
    }
    return m.build();
  },
  arena(h, w, d, M, D) {
    // Climate Pledge Arena: the glass walls under the old Coliseum's sweeping roof
    const m = new LK.Massing();
    m.box(D.glassLight, w * 0.92, h * 0.6, d * 0.92);
    m.add(D.roofDark, new THREE.CylinderGeometry(Math.max(w, d) * 0.7, Math.max(w, d) * 0.7, Math.min(w, d), 4, 1), 0, h * 0.62, 0, Math.PI / 4, 0, 0, 1, 0.1, 1);
    return m.build();
  },
  blob(h, w, d, M, D) {
    // MoPOP: Gehry's crumpled metal lumps in red, blue, gold and silver
    const m = new LK.Massing();
    const cols = [M.red, M.blueGlass, D.needleHalo, M.chrome];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, r = Math.min(w, d) * (0.22 + (i % 3) * 0.05);
      m.add(cols[i % 4], new THREE.SphereGeometry(r, 10, 7), Math.cos(a) * w * 0.25, h * 0.35, Math.sin(a) * d * 0.25, a, 0, 0.3, 1.2, h * 0.6 / r, 0.9);
    }
    return m.build();
  },
  arches(h, w, d, M, D) {
    // Pacific Science Center: the white Gothic arches over the pools, the low courts round them
    const m = new LK.Massing();
    m.box(M.white, w, h * 0.35, d * 0.2, 0, 0, -d * 0.4);
    m.box(M.white, w, h * 0.35, d * 0.2, 0, 0, d * 0.4);
    for (let i = 0; i < 5; i++) m.box(M.white, w * 0.03, h, w * 0.03, (i - 2) * w * 0.12, 0, 0);
    return m.build();
  },
  civic(h, w, d, M, D) {
    // A civic block (Union Station, the art museum, the convention centre)
    const m = new LK.Massing();
    m.box(D.granite, w, h * 0.12, d);
    m.box(D.limestone, w * 0.98, h * 0.76, d * 0.98, 0, h * 0.12);
    m.box(D.limeShade, w, h * 0.12, d, 0, h * 0.88);
    return m.build();
  },
  monument(h, w, d, M, D) {
    // A sculpture, fountain or small kiosk: a plinth and a bronze piece
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.45, 1), d);
    m.box(M.bronze, Math.min(w, d) * 0.4, h - Math.min(h * 0.45, 1), Math.min(w, d) * 0.4, 0, Math.min(h * 0.45, 1));
    return m.build();
  },
  block(h, w, d, M, D) {
    // Brick block (Pioneer Square, Belltown): a base, the body, a cornice
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.1, 1.2), d);
    m.box(D.brick, w * 0.98, h * 0.86, d * 0.98, 0, Math.min(h * 0.1, 1.2));
    m.box(D.limeShade, w, h * 0.04, d, 0, h * 0.96);
    return m.build();
  },
};
const BUILDER_ALIASES = [
  ['space_needle', 'needle'], ['needle', 'needle'], ['columbia', 'stepped'], ['smith_tower', 'pyramid'],
  ['rainier_tower', 'pedestal'], ['library', 'library'], ['pike_place', 'market'], ['market', 'market'],
  ['wheel', 'wheel'], ['pier', 'shed'], ['colman', 'shed'], ['ferry', 'shed'], ['terminal', 'shed'], ['aquarium', 'shed'],
  ['lumen', 'stadium'], ['t_mobile', 'stadium'], ['stadium', 'stadium'], ['field', 'stadium'],
  ['king_street', 'station'], ['union_station', 'civic'], ['spheres', 'spheres'], ['climate_pledge', 'arena'], ['arena', 'arena'],
  ['mopop', 'blob'], ['emp', 'blob'], ['science_center', 'arches'], ['chihuly', 'civic'], ['art_museum', 'civic'], ['convention', 'civic'],
  ['westlake', 'civic'], ['gate', 'monument'], ['pergola', 'monument'], ['hammering', 'monument'], ['sculpture', 'monument'], ['fountain', 'monument'], ['statue', 'monument'], ['sign', 'monument'],
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
export function buildSeattle(scene, world, opts, K) {
  const L = _layout;
  if (!L) throw new Error('buildSeattle: layout not loaded (call loadLevelData first)');
  const M = LK.mats(), D = seattleMats(M);
  const { ribbon, polygonGeom, quadAlong, pointInPoly, distToPolyline } = LK;
  const buildings = [];
  // (what the dressing placed, per kind: world.levelStats, read by the QA scripts)
  const stats = { trees: 0 };
  if (world) world.levelStats = stats;
  const grid = new K.BuildingGrid(60);
  const lite = !!opts.lite;
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  K.setBuildingLite(lite);
  setLookLayerKey('seattle', SEATTLE_LOOK.key, SEATTLE_LOOK.az); // (seattle-design's light: seattleLook.js)
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
  const makeParkTree = createSeattleTrees(K, lite, glb);
  K.onTemplatesReady((sc, get) => {
    for (const g of [..._kitDefs(), ...SEATTLE_LANDMARK_GLBS.filter((d) => d.ready).map((d) => ({ ...d, url: SEATTLE_BASE + d.file }))]) {
      get(g.url)?.traverse((o) => {
        if (!o.isMesh) return;
        // A model's own pool surface (material 'water'): the layout's water stands there
        // (hidden on the material, which the placed instances share with the template)
        if (/^water$/i.test(o.material?.name || '')) { o.material.visible = false; return; }
        for (const m of [].concat(o.material)) seattleFacade(m, g.file);
      });
    }
  });
  const surfaceWear = configureChicagoWear(null, L.paths, lite);
  if (world) world.chicagoSurfaceWear = surfaceWear;
  animators.push({ update(dt, time) { tickSeattleMaterials(time); } });
  const SW_TILE = K.TILE.SIDEWALK, ASPHALT_TILE = 2;
  // (an avenue: a road at the major minimum or wider)
  const MAJOR_W = (STREET_MIN?.minMajor ?? 7) - 0.1, SIDEWALK_W = 1.2, PS = 0.8;
  const ring = opts.mode === 'wrestling' && L.ring ? L.ring : null;
  // Landmarks that stand: a district or an area with no structure of its own
  // (Times Square, Bryant Park) is a name on the map, nothing is built there
  // (and a line or a moving thing the level animates itself: the Monorail and its trains, the ferries)
  const ANIMATED = /^(monorail_train|wsf_ferry|ferry_in_bay)$/;
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
  if (ring) setArenaSite({ x: ring.x, z: ring.z, title: SEATTLE_TITLE, place: ring.place || 'SEATTLE CENTER', fountain: false, stands: ['n', 's'].filter(standsFree).join(''), east: ring.east || 0, west: ring.west || 0, gate: ring.gate ?? true, flag: 'seattle',
    // (the fight camera settles south-west of the pair, looking north-east: the downtown skyline and Lumen Field behind them)
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

  // ---- water: Elliott Bay, Lake Union, the fountains and pools ----
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
  // over the whole fetch area ({ name, polygon, holes }; else Elliott Bay as
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
    seattleWater(WU); // (seattle-design's Sound colours)
    animators.push({ update(dt, time) { WU.uTime.value = time; } });
    waterSplash = splashPool(scene, lite ? 200 : 600, lite ? 12 : 32);
    animators.push(waterSplash);
    const wfx = waterFX(waterMat, field, waterSplash, lite);
    animators.push(wfx);
    if (world) world.water = wfx;
  }
  // Seattle's own ground maps (seattleMaterials.js): sidewalks, lawns, plazas, park paths
  const swMat = seattleGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'pavement');
  const lawnMat = seattleGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'lawn');
  const grassMat = seattleGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'grass');
  const plazaMat = seattleGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'plaza');
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
    seattleGround(asphalt, 'asphalt');
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

  // ---- parks: Seattle Center, the Olympic Sculpture Park, Occidental and Victor Steinbrueck, the plazas ----
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
  const TREE_CAP = L.trees ? (!glb ? 1400 : lite ? 2800 : 7500) : lite ? 260 : 900;
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
    // (seattleLandscape.js sizes each layout kind to its species' true height at s = 1)
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
    // (seattle-design's timber deck)
    const deckMat = seattleGround(new THREE.MeshStandardMaterial({ roughness: 1 }), 'pier');
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
  // on the flat roofs (seattle-design's seattle_rooftop_mech when shipped);
  // true size. Off on phone LOW (the procedural tier).
  const MECH = glb && _kit('seattle_rooftop_mech');
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
    // A kit piece made for this very footprint (seattleManifest layoutIds)
    const own = Object.values(SEATTLE_KIT_GLBS).find((d) => d.ready && d.layoutIds && d.layoutIds.includes(o.id));
    if (own) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
      b.layoutId = o.id; b._skipBodyIM = true;
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      b.debrisTint = _stoneOf(own.file);
      orient(b, o.w, o.d, o.rotY);
      K.queueGLB({ url: SEATTLE_BASE + own.file, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, stretch: 1.6, lot: lotOf(o.w, o.d, o.rotY) });
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
    if (onMat(lm.x, lm.z, aw / 2, ad / 2) || (lm.kind === 'prop' && lm.h < 4 && inRingBox(lm.x, lm.z))) { console.info('[seattle] landmark inside the ring venue, left out:', lm.id); continue; }
    const hp = lm.hp || Math.max(120, Math.round(lm.h * 3 + lm.w * lm.d * 0.05));
    const b = new K.Building(lm.x, lm.z, aw, ad, lm.h, { skipWindows: true });
    orient(b, lm.w, lm.d, lm.rotY);
    b._skipBodyIM = true;
    b.maxHp = hp; b.hp = hp;
    b.landmarkId = lm.id;
    b.landmarkName = lm.name; // "THROUGH THE SPACE NEEDLE!" (wrestling callouts)
    if (lm.kind === 'bridge' || lm.onPier || lm.onWater || /pier|wheel|aquarium|colman|ferry/.test(lm.id)) b.onWater = true; // (on a pier or over the bay on purpose)
    // (a model whose own footprint holds layout water, e.g. the Pacific Science Center's pools: manifest onWater)
    if (_landmarkGLB(lm.id)?.onWater) b.onWater = true;
    b.debrisTint = _stoneOf(_landmarkGLB(lm.id)?.file || lm.id);
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const def = _landmarkGLB(lm.id);
    if (def) {
      // seattle-design's models are built at true size: uniform 0.2 u/m (a spire
      // makes the layout's roof height a poor scale reference)
      const h = def.trueHeightM * S;
      const url = SEATTLE_BASE + def.file;
      const rotY = def.face ? LK.faceRot(lm.rotY || 0, def.face) : def.faceX ? LK.faceRot(lm.rotY || 0, def.faceX, true) : (lm.rotY || 0);
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
    const pend = SEATTLE_LANDMARK_GLBS.find((g) => !g.ready && (g.ids ? g.ids.includes(lm.id) : g.id === lm.id));
    // (listed by the smoke test as pending, not failed)
    b.pendingGLB = pend ? pend.file : lm.id + ' (procedural)';
    // The massing goes through the GLB path as its own template (instance
    // slots: a kaiju can lift it, or tear chunks off a tower, as from a model)
    const url = 'proc:seattle/' + lm.id;
    K.registerTemplate(url, mesh);
    K.queueGLB({ url, h: hTrue, building: b, maxW: 0, maxD: 0, rotY: lm.rotY || 0, landmark: true });
  }

  // ---- the Monorail: twin beams on T-pylons from Westlake Center up Fifth Avenue to Seattle Center ----
  // (seattle_detail.json monorail: polyline, deckHeightMetres, widthMetres,
  // stations). Spans and pylons are two InstancedMeshes (2 draws): a span the
  // kaiju walks into drops to the street; the two trains (seattle-design's
  // seattle_monorail_train when ready, else a procedural Alweg set) shuttle
  // end to end, one per beam, and fall off a broken span or a kaiju's shin.
  // (layout monorail: beams = the two beams' polylines and the station spurs,
  // beamHeightMetres, beamGapMetres, stations [{ name, x, z }]; the
  // placeholder's detail.monorail: one centreline, its beams either side)
  const offsetLine = (pts, o) => pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + (b[1] - a[1]) / l * o, p[1] - (b[0] - a[0]) / l * o];
  });
  const mono = (() => {
    const m0 = L.monorail;
    // (only the line itself: polylines within 15u of the longest one's network; strays elsewhere are left out)
    const near = (a, b) => a.some((p) => b.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 15));
    if (m0?.beams?.length) {
      const all = m0.beams.filter((b) => b.length >= 2), keep = [all.reduce((a, b) => (b.length > a.length ? b : a))];
      for (let grew = true; grew;) { grew = false; for (const b of all) if (!keep.includes(b) && keep.some((k) => near(k, b))) { keep.push(b); grew = true; } }
      m0.beams = keep;
    }
    if (m0?.beams?.length) return { beams: m0.beams, y: (m0.beamHeightMetres || 7.5) * S, gap: (m0.beamGapMetres || 4.5) * S, stations: m0.stations || [] };
    const d = L.detail?.monorail;
    if (!(d?.polyline?.length >= 2)) return null;
    const g = (d.widthMetres || 4.6) * S;
    return { beams: [-1, 1].map((sd) => offsetLine(d.polyline, sd * g / 2)), y: (d.deckHeightMetres || 8) * S, gap: g, stations: d.stations || [] };
  })();
  if (mono) {
    const yD = mono.y, half = mono.gap / 2;
    const BW = 0.24, BH = 0.42, PY = yD - BH; // beam width / depth (u), pylon top
    // each beam resampled to spans of <= 6u
    const resample = (pts) => {
      const out = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
        for (let k = i ? 1 : 0; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
      }
      return out;
    };
    const lenOf = (l) => l.reduce((a, p, k) => a + (k ? Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0), 0);
    const beams = mono.beams.filter((b) => b.length >= 2).map(resample).sort((a, b) => lenOf(b) - lenOf(a));
    // (the stretch under the Title Match venue is left out)
    const spans = [], pyl = [];
    for (const line of beams) for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      if (inRingBox((ax + bx) / 2, (az + bz) / 2, 2, 2)) continue;
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.05) continue;
      spans.push({ x: (ax + bx) / 2, z: (az + bz) / 2, l, ry: Math.atan2(bx - ax, bz - az), t: -1 });
    }
    // T-pylons along the main beam, centred between it and its twin
    const A = beams[0], B2 = beams[1] || null;
    const nearOn = (x, z, line) => {
      let best = null, bd = Infinity;
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, d, ry: Math.atan2(dx, dz) }; }
      }
      return best;
    };
    for (let i = 0; i < A.length; i++) {
      const [x, z] = A[i], o = B2 && nearOn(x, z, B2), [qx, qz] = A[Math.min(A.length - 1, i + 1)], [px, pz] = A[Math.max(0, i - 1)];
      const cx = o && o.d < mono.gap * 2 ? (x + o.x) / 2 : x, cz = o && o.d < mono.gap * 2 ? (z + o.z) / 2 : z;
      if (isWater(cx, cz) || inRingBox(cx, cz, 2, 2)) continue;
      pyl.push({ x: cx, z: cz, ry: Math.atan2(qx - px, qz - pz) });
    }
    const spanIM = new THREE.InstancedMesh(new THREE.BoxGeometry(BW, BH, 1), M.concrete, spans.length);
    // a pylon: the column and its T head (one geometry, the head across both beams)
    const pg = mergeGeometries([new THREE.BoxGeometry(0.34, PY, 0.34).translate(0, PY / 2, 0), new THREE.BoxGeometry(half * 2 + BW * 2, 0.3, 0.42).translate(0, PY - 0.15, 0)], false);
    const pylIM = new THREE.InstancedMesh(pg, M.concrete, Math.max(1, pyl.length));
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    const spanPose = (s, k) => {
      // k 0: on its pylons; 1: down on the street, rolled on its side
      q.setFromAxisAngle(up, s.ry).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), k * 1.4));
      mtx.compose(v3.set(s.x, (yD - BH / 2) * (1 - k) + BW / 2 * k, s.z), q, sc.set(1, 1, s.l * (1 - 0.04 * k)));
      spanIM.setMatrixAt(spans.indexOf(s), mtx);
    };
    spans.forEach((s) => spanPose(s, 0));
    pyl.forEach((p, i) => { pylIM.setMatrixAt(i, mtx.compose(v3.set(p.x, 0, p.z), q.setFromAxisAngle(up, p.ry), sc.set(1, 1, 1))); });
    for (const im of [spanIM, pylIM]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.computeBoundingSphere(); scene.add(im); }
    if (!pyl.length) pylIM.count = 0;
    // Stations: a platform deck and canopy beside the beams (merged into one batch)
    const st = [];
    for (const s of mono.stations) {
      if (inRingBox(s.x, s.z, 6, 6)) continue;
      const r = s.rot ?? nearOn(s.x, s.z, A).ry;
      st.push(new THREE.BoxGeometry(half * 2 + 3.2, 0.3, 9).rotateY(r).translate(s.x, PY - 0.5, s.z));
      st.push(new THREE.BoxGeometry(half * 2 + 3.6, 0.16, 9.4).rotateY(r).translate(s.x, yD + 1.1, s.z));
    }
    if (st.length) addBatch(mergeGeometries(st, false), M.concrete).castShadow = true;
    // The trains: one per beam, red and blue
    const trainGeo = (color) => {
      const m = new LK.Massing(), Lt = 7.4, Wt = 0.62, Ht = 0.66;
      m.box(color, Wt, Ht * 0.62, Lt * 0.86, 0, 0);
      m.box(M.darkGlass, Wt * 1.02, Ht * 0.24, Lt * 0.84, 0, Ht * 0.34);
      m.box(color, Wt * 0.9, Ht * 0.12, Lt * 0.8, 0, Ht * 0.58);
      for (const e of [-1, 1]) m.add(color, new THREE.SphereGeometry(Wt * 0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI), 0, Ht * 0.36, e * Lt * 0.43, 0, e * Math.PI / 2, 0, 1, 1.1, 1.6);
      m.box(M.concrete, Wt * 0.7, BH * 0.9, Lt * 0.8, 0, -BH * 0.8); // the skirt that straddles the beam
      return m.build(true);
    };
    // (seattle-design's trains: red and blue; the body straddles the beam, the beam top 1.6 m above the model's y 0)
    const kitTrain = _kit('seattle_monorail_train'), kitTrainB = _kit('seattle_monorail_train_blue') || kitTrain;
    const trains = [M.red, M.blueGlass].map((color, i) => {
      const g = new THREE.Group();
      g.add(trainGeo(color));
      scene.add(g);
      // (one per beam: the main beam and its twin, starting at opposite ends)
      const line = i && B2 ? B2 : A, cum = [0];
      for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
      return { g, line, cum, total: cum[cum.length - 1], s: i ? 0.999 : 0, dir: i ? -1 : 1, wait: i * 4, fall: -1, base: new THREE.Vector3(), ry: 0, side: i ? 1 : -1 };
    });
    if (kitTrain) K.onTemplatesReady((sc0, get) => {
      trains.forEach((tr, i) => {
        const t = get(i ? kitTrainB : kitTrain);
        if (!t) return;
        tr.g.clear();
        const c = t.clone(true);
        c.scale.setScalar(S); c.position.y = -1.6 * S;
        tr.g.add(c);
      });
    });
    // a train's point d along its beam (u), on the beam top
    const at = (tr, d, out) => {
      const { line, cum } = tr;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const [ax, az] = line[i - 1], [bx, bz] = line[i], f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      out.set(ax + (bx - ax) * f, yD + 0.02, az + (bz - az) * f);
      return Math.atan2(bx - ax, bz - az);
    };
    const SPEED = 4, DWELL = 8, RT = 0.9;
    const broken = (x, z, r) => spans.some((s) => s.t >= 0 && Math.hypot(s.x - x, s.z - z) < r);
    let acc = 0;
    animators.push({
      update(dt) {
        const kp = world && world.kaijuPos;
        acc += dt;
        // spans the kaiju wades into come down (checked ten times a second)
        if (kp && acc > 0.1) {
          for (const s of spans) if (s.t < 0 && Math.hypot(kp.x - s.x, kp.z - s.z) < 2.6 + s.l / 2) {
            s.t = 0;
            if (waterSplash && isWater(s.x, s.z)) waterSplash.burst(s.x, s.z, lite ? 6 : 14);
            world.onCarDestroyed?.();
          }
        }
        let dirty = false;
        for (const s of spans) if (s.t >= 0 && s.t < RT) { s.t = Math.min(RT, s.t + dt); const k = s.t / RT; spanPose(s, k * k); dirty = true; }
        if (dirty) spanIM.instanceMatrix.needsUpdate = true;
        for (const tr of trains) {
          if (tr.fall >= 0) {
            // off the beam: tip over and drop to the street (or into the water) in a second, then lie there
            if (tr.fall < 1) {
              tr.fall = Math.min(1, tr.fall + dt);
              const k = tr.fall * tr.fall;
              tr.g.position.set(tr.base.x, tr.base.y * (1 - k) + 0.3 * k, tr.base.z);
              tr.g.rotation.set(0, tr.ry, k * 1.45 * tr.side);
              if (tr.fall === 1 && waterSplash && isWater(tr.base.x, tr.base.z)) waterSplash.burst(tr.base.x, tr.base.z, lite ? 10 : 24);
            }
            continue;
          }
          if (tr.wait > 0) tr.wait -= dt;
          else {
            const d = tr.s * tr.total + tr.dir * SPEED * dt;
            tr.s = Math.max(0, Math.min(1, d / tr.total));
            if (tr.s === 0 || tr.s === 1) { tr.dir = -tr.dir; tr.wait = DWELL; }
          }
          tr.ry = at(tr, tr.s * tr.total, tr.base);
          tr.g.position.copy(tr.base);
          tr.g.rotation.set(0, tr.ry, 0);
          // a kaiju's leg or a fallen span ahead knocks it off the beam
          if ((kp && acc > 0.1 && Math.hypot(kp.x - tr.base.x, kp.z - tr.base.z) < 4.5) || broken(tr.base.x, tr.base.z, 3.4)) {
            tr.fall = 0;
            world.onCarDestroyed?.();
          }
        }
        if (acc > 0.1) acc = 0;
      },
    });
  }

  // ---- Elliott Bay: the Washington State ferries out of Colman Dock, a container ship, Harbor Island's cranes ----
  // (seattle_detail.json ferries: [{ name, dock: { x, z, rot }, route: [[x, z], ...] }]: each ferry
  // waits in its slip, crosses out along its route past the bounds and back.
  // A kaiju that wades into one rolls it over and sinks it, like Chicago's boats.)
  // (the layout's routes as points; the Washington State ferries only, one boat per route name: Bainbridge, Bremerton)
  const ferryRoutes = (L.detail?.ferries || []).map((f) => ({ ...f, route: f.route || f.points }))
    .filter((f, i, all) => f.route?.length >= 2 && /ferry/i.test(f.name || 'ferry') && !/fast/i.test(f.name || '') && all.findIndex((g) => g.name === f.name) === i);
  const procFerry = () => {
    // Jumbo Mark II class: ~140 x 27 m; white hull and cabins, the green stripe, the black-topped stack; front +Z
    const m = new LK.Massing(), Lf = 140 * S, Wf = 27 * S;
    m.box(M.white, Wf * 0.86, 1.0, Lf, 0, -0.5);
    m.box(D.ferryGreen, Wf * 0.88, 0.22, Lf * 1.002, 0, 0.3);
    m.box(M.white, Wf, 0.9, Lf * 0.96, 0, 0.52);
    m.box(M.white, Wf * 0.82, 1.1, Lf * 0.7, 0, 1.42);
    m.box(M.darkGlass, Wf * 0.84, 0.36, Lf * 0.68, 0, 1.8);
    m.box(M.white, Wf * 0.5, 0.6, Lf * 0.16, 0, 2.52);
    m.box(M.green, Wf * 0.2, 1.3, Wf * 0.3, 0, 2.52);
    return m.build(true);
  };
  const ferries = [];
  if (ferryRoutes.length) {
    const kitFerry = _kit('seattle_ferry');
    for (const f of ferryRoutes) {
      const g = new THREE.Group();
      g.add(procFerry());
      scene.add(g);
      const pts = f.route, cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      ferries.push({ g, pts, cum, s: 0, dir: 1, wait: 6 + ferries.length * 25, sink: -1, ry: f.dock?.rot ?? 0 });
    }
    if (kitFerry) K.onTemplatesReady((sc0, get) => {
      const t = get(kitFerry);
      if (!t) return;
      for (const fe of ferries) { fe.g.clear(); const c = t.clone(true); c.scale.setScalar(S); fe.g.add(c); }
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
            if (Math.abs(dx * s + dz * c) < 15 && Math.abs(dx * c - dz * s) < 4.5) {
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
  // The container ship at anchor and Harbor Island's cranes (detail containerShip / harborCranes;
  // seattle-design's kit models when ready, else a procedural hull and A-frame cranes): one batch each
  {
    // (defaults when the detail file has none: a ship at anchor off the stadiums clear of the ferry lanes, and
    // the ship-to-shore cranes along Harbor Island's Terminal 18 apron, ~1.2 km south-west of the box; phones: three)
    const ship = L.detail?.containerShip || { x: -480, z: 430, rot: 0.35 };
    // (the surround's Harbor Island / T5 container cranes from the cartographer when present)
    const cranes = L.detail?.harborCranes || (L.surround?.cranes?.length && L.surround.cranes.slice(0, lite ? 6 : 17)) || [[-215, 690], [-205, 722], [-195, 754], [-185, 786], [-175, 818]].slice(0, lite ? 3 : 5).map(([x, z]) => ({ x, z, rot: 1.75, land: true }));
    const kShip = _kit('seattle_container_ship'), kCrane = _kit('seattle_container_crane') || _kit('seattle_harbor_crane');
    const placeKit = (url, x, z, ry, y = 0.2) => K.onTemplatesReady((sc0, get) => {
      const t = get(url);
      if (!t) return;
      const c = t.clone(true);
      c.scale.setScalar(S); c.position.set(x, y, z); c.rotation.y = ry;
      c.updateMatrixWorld(true);
      c.traverse((o) => { o.matrixAutoUpdate = false; });
      scene.add(c);
    });
    if (ship && kShip) placeKit(kShip, ship.x, ship.z, ship.rot || 0);
    else if (ship) {
      const m = new LK.Massing(), Ls = 300 * S, Ws = 45 * S;
      m.box(M.red, Ws, 2.4, Ls * 0.94, 0, -1.4);
      m.box(D.slate, Ws, 0.5, Ls, 0, 1.0);
      const boxes = [M.red, M.blueGlass, D.ferryGreen, M.white, D.needleHalo];
      for (let i = 0; i < 14; i++) m.box(boxes[i % 5], Ws * 0.92, 1.6 + (i % 3) * 0.5, Ls * 0.055, 0, 1.5, -Ls * 0.4 + i * Ls * 0.058);
      m.box(M.white, Ws * 0.9, 4, Ls * 0.06, 0, 1.5, Ls * 0.42);
      const g = m.build(false);
      g.position.set(ship.x, 0.2, ship.z); g.rotation.y = ship.rot || 0;
      g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
      scene.add(g);
    }
    if (cranes.length && kCrane) for (const c of cranes) placeKit(kCrane, c.x, c.z, c.rot || 0, 0);
    else if (cranes.length) {
      const m = new LK.Massing();
      for (const c of cranes) {
        const r = c.rot || 0, cs = Math.cos(r), sn = Math.sin(r), P2 = (lx, lz) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
        for (const [lx, lz] of [[-3, -2.4], [3, -2.4], [-3, 2.4], [3, 2.4]]) { const [x, z] = P2(lx, lz); m.box(M.red, 0.5, 9, 0.5, x, 0, z, r); }
        const [bx, bz] = P2(0, 2); m.box(M.red, 6.6, 0.7, 26, bx, 9, bz, r);
        const [hx, hz] = P2(0, -1); m.box(M.red, 4, 2.2, 3, hx, 9.7, hz, r);
      }
      addBatch(m.build(true).children[0].geometry, M.red).castShadow = true;
    }
    // The Queen Anne TV masts (surround masts: true height on seattle-design's hill), steel lattice as
    // one tapered red-and-white column each, a single batch
    const masts = L.surround?.masts || [];
    if (masts.length) {
      const m = new LK.Massing();
      for (const ms of masts) {
        const h = (ms.heightMetres || 150) * S, y0 = seattleHillHeight(ms.x, ms.z, B);
        for (let k = 0; k < 6; k++) m.cyl(k % 2 ? M.white : M.red, 0.25 + (5 - k) * 0.12, 0.25 + (6 - k) * 0.12, h / 6, 4, ms.x, y0 + k * h / 6, ms.z);
      }
      const g = m.build(false);
      g.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); o.userData.backdrop = false; } });
      scene.add(g);
    }
    // Floatplanes moored off the Lake Union seaplane dock (landmark lake_union_seaplane), on the water
    const dock = L.landmarks.find((l) => l.id === 'lake_union_seaplane'), kPlane = _kit('seattle_floatplane') || _kit('seattle_seaplane');
    if (dock && kPlane) {
      for (const [dx, dz, ry] of [[-3.2, -1.5, 0.3], [3.4, -2.5, -0.25], [0.4, -5.2, 0.1]].slice(0, lite ? 1 : 3)) {
        if (isWater(dock.x + dx, dock.z + dz)) placeKit(kPlane, dock.x + dx, dock.z + dz, ry);
      }
    }
  }

  // ---- the Title Match venue (wrestling mode only) ----
  if (ring) buildArena(scene, world, { lite, glb, animators, grid, inside: null });

  const bodiesIM = K.buildGlobalBodies(scene, buildings);
  const windowPulse = K.buildGlobalWindows(scene, LK.windows);
  if (windowPulse) animators.push(windowPulse);

  // ---- street dressing: lamps, signals, shelters, corner furniture, the park ----
  {
    // Seattle props at true size (manifest heightM x 0.2), Chicago's at their kit height
    const propH = (name, chi) => { const d = SEATTLE_PROP_GLBS.find((p) => p.name === name); return d && d.heightM ? d.heightM * S : chi; };
    for (const n of ['chi_streetlamp', 'chi_bus_shelter']) {
      K.propScene(n)?.traverse((o) => { if (o.isMesh && o.material.emissiveMap) o.material.emissiveIntensity = 0.08; });
    }
    // Seattle's own lamp when seattle-design ships one, else Chicago's, else the Tokyo kit lamp, else procedural
    const lampName = K.hasProp('seattle_streetlamp') ? 'seattle_streetlamp' : K.hasProp('chi_streetlamp') ? 'chi_streetlamp' : 'street_lamp';
    const hasLamp = K.hasProp(lampName);
    // Seattle's lamps ~40 m apart on both sides of the avenues (staggered), every ~60 m on one side of
    // the side streets; phones: the avenues only, sparser. Chicago's / Tokyo's stand-ins sparser still
    const own = lampName === 'seattle_streetlamp';
    const lampEvery = own ? (lite ? 20 : 8) : lite ? 40 : 24;
    const putLamp = (x, z, ry) => {
      if (isWater(x, z) || onRing(x, z) || inRingBox(x, z)) return;
      const lamp = hasLamp ? K.cloneProp(lampName, propH(lampName, 5.6 * PS)) : LK.makeLamp();
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
    const sigName = K.hasProp('seattle_traffic_signal') ? 'seattle_traffic_signal' : 'chi_traffic_signal';
    if (K.hasProp(sigName)) {
      const placed = [];
      const cap = lite ? 24 : 60;
      for (const node of net.nodes) {
        if (node.edges.length < 4 || placed.length >= cap) continue;
        const ni = net.nodes.indexOf(node);
        const e = net.edges[node.edges[0]];
        const w = e.laneOff * 4;
        if (w < MAJOR_W || placed.some(([x, z]) => Math.abs(x - node.x) < 30 && Math.abs(z - node.z) < 30)) continue;
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
    const shelterName = K.hasProp('seattle_bus_shelter') ? 'seattle_bus_shelter' : 'chi_bus_shelter';
    for (let i = 0; i < (lite ? 6 : 14) && art.length; i++) {
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
    const rng = _seeded('seattle-dressing');
    const put = (name, x, z, ry) => {
      if (!K.hasProp(name) || isWater(x, z) || onRing(x, z) || inRingBox(x, z)) return false;
      const p = K.cloneProp(name, propH(name, 1));
      p.position.set(x, 0, z); p.rotation.y = ry;
      p.matrixAutoUpdate = false; p.updateMatrix();
      p.userData.instance = true;
      scene.add(p);
      return true;
    };
    // Corners: hydrants, trash cans, newspaper boxes; coffee carts mid-block (seattle-design's props, as shipped)
    const corners = net.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.edges.length >= 3);
    const caps = { seattle_hydrant: lite ? 0 : 220, seattle_trash_can: lite ? 0 : 220, seattle_newspaper_box: lite ? 0 : 60 };
    const count = {};
    for (const [nd, ni] of corners) {
      const e = net.edges[nd.edges[0]], w = e.laneOff * 4, ux = e.a === ni ? e.dx : -e.dx, uz = e.a === ni ? e.dz : -e.dz;
      for (const [name, chance, back, side] of [['seattle_hydrant', 0.5, 1.6, 0.4], ['seattle_trash_can', 0.5, 1.2, -0.4], ['seattle_newspaper_box', 0.15, 2.2, 0.5]]) {
        if ((count[name] || 0) >= caps[name] || rng() > chance) continue;
        const o = w / 2 + SIDEWALK_W * side + 0.6, x = nd.x + ux * (w / 2 + back) - uz * o, z = nd.z + uz * (w / 2 + back) + ux * o;
        if (put(name, x, z, Math.atan2(ux, uz))) count[name] = (count[name] || 0) + 1;
      }
    }
    for (let i = 0; i < (lite ? 6 : 24) && art.length; i++) {
      const e = art[Math.floor(rng() * art.length)], w = e.laneOff * 4, t = e.len * (0.2 + rng() * 0.6), sd = rng() < 0.5 ? 1 : -1;
      const x0 = net.nodes[e.a].x + e.dx * t, z0 = net.nodes[e.a].z + e.dz * t;
      put('seattle_coffee_cart', x0 - e.dz * sd * (w / 2 + 0.5), z0 + e.dx * sd * (w / 2 + 0.5), Math.atan2(e.dx, e.dz) + (sd > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
    // Parked cars (the level's traffic templates, instanced): kerbside on the side streets and the
    // avenues' parking lanes, one every ~6u with gaps, and rows in the surface lots (layout parks
    // kind plaza / surface parking). Phones: a few, nearer the cap of the draw budget
    {
      const capKerb = lite ? 60 : 900, capLot = lite ? 30 : 700;
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
      for (const r of roads) if (r.kind === 'minor') kerbRun(r.points, r.width, lite ? 0.12 : 0.45);
      for (const e of net.edges) {
        const w = e.laneOff * 4, A = net.nodes[e.a], Bn = net.nodes[e.b];
        if (w < MAJOR_W || e.len < 14) continue;
        kerbRun([[A.x + e.dx * 4, A.z + e.dz * 4], [Bn.x - e.dx * 4, Bn.z - e.dz * 4]], w, lite ? 0.06 : 0.25);
      }
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
    // Park lamps and benches along the park walks (Seattle Center, the sculpture park, the waterfront promenade)
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
            if (put('seattle_park_lamp', x, z, Math.atan2(dx, dz))) lamps++;
            if (benches < benchCap && rng() < 0.5 && put('seattle_bench', x - dz * 1.6 + dx * 2, z + dx * 1.6 + dz * 2, Math.atan2(-dz, dx))) benches++;
          }
          acc -= l;
        }
      }
    }
  }

  // ---- the surround: the city past the bounds, West Seattle and Magnolia across the water ----
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
    // (the hill neighbourhoods and West Seattle: painted clapboard houses and low apartments in greys, tans and greens)
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
      addBox(x, z, w, h, d, rot || 0, tint, ROOFS[k % 3], seattleHillHeight(x, z, B)); // (on seattle-design's hills)
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

  // ---- the hills past the bounds (seattle-design: Queen Anne, Capitol / First / Beacon Hill, Magnolia,
  // West Seattle), one unlit mesh to the shore; the surround boxes stand on them (seattleHillHeight).
  // Tagged as outer ground for the look layer (unlit shading, no painted windows on the slopes)
  {
    const hills = createSeattleHills(B, L.surround?.water || [], { lite });
    hills.userData.backdrop = false; hills.userData.outerGround = true;
    scene.add(hills);
  }

  // ---- the horizon: Mount Rainier to the south-south-east, the Olympics across the Sound, the Cascades ----
  // Silhouettes with the haze baked into their vertex colours (unlit, no fog),
  // riding with the camera at R0, inside the 1500u sky dome that also rides
  // with it (their true distance is far past the camera's far plane): each
  // range at about 1.6x its true angular height (heights below are at 1750u,
  // scaled to R0), so Rainier reads over the stadiums the way it does in photos.
  {
    const R0 = 1400, HK = R0 / 1750, pos = [], col = [], idx = [];
    const haze = new THREE.Color(SEATTLE_LOOK.statics.bg), cA = new THREE.Color(), cB = new THREE.Color(), cR = new THREE.Color();
    const rock = new THREE.Color(0x5e6a78), forest = new THREE.Color(0x46584c), snow = new THREE.Color(0xf4f6fa);
    const rnd = _seeded('seattle-horizon');
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
    range(128, 174, [[150, 140, 13], [147.5, 118, 5], [152.5, 122, 5]], 0.38, 0.42, 6, 2, 1.9); // Rainier (4,392 m, ~88 km): a broad snow cone
    range(242, 330, [[256, 60, 6], [268, 82, 7], [279, 96, 5], [288, 74, 6], [300, 88, 6], [312, 70, 7], [322, 58, 6]], 0.62, 0.5, 18, 10); // the Olympics (~2,400 m, 60-90 km)
    range(20, 118, [[38, 42, 6], [56, 50, 7], [74, 46, 6], [92, 54, 8], [108, 40, 6]], 0.7, 0.58, 12, 6); // the Cascades (~1,800 m, 80 km)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const hz = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    hz.frustumCulled = false; hz.renderOrder = -1;
    hz.matrixAutoUpdate = false;
    hz.name = 'seattle_horizon';
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
    level: 'seattle', bounds: { ...B }, center: { x: cxB, z: czB },
    spawn: { ...L.spawn }, isWater, barrier, landPoint: sidewalkPoint,
    mapWater: L.water.map((w) => ({ kind: w.kind, polygon: w.polygon, holes: w.holes })),
    enemySpawns: L.enemySpawns, duelSpawns: L.duel, soldierSpawn: L.soldier, ringSite: L.ring,
  };
}
