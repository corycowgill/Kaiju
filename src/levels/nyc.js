// New York City: Midtown Manhattan from the Hudson to the East River, about
// 30th to 72nd Street (Penn Station and the Empire State Building to the
// south end of Central Park), built from assets/levels/nyc_layout.json (DC's
// schema: game units, 0.2 u/m, +X east, +Z south; the street grid keeps its
// real ~29 deg turn from true north). Follows buildNyc and shares Chicago's
// helpers, materials, water and ring (chicago.js LEVEL_KIT, chicago_water.js,
// chicago_arena.js at the layout's ring site); the NYC specifics are the
// supertall massing, the avenue canyons' block kit, Central Park and the
// surround (the rest of Manhattan, New Jersey, Queens).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL_KIT as LK } from './chicago.js';
import { nycGround, nycFacade, tickNycMaterials, createNycTrees, nycWater } from './nycMaterials.js';
import { configureChicagoWear } from './chicagoMaterials.js';
import { isMobile } from '../quality.js';
import { splashPool } from './chicago_harbor.js';
import { bakeShoreField, makeWaterMaterial, waterUniforms, waterFX } from './chicago_water.js';
import { buildArena, arenaNoTree, setArenaSite } from './chicago_arena.js';
import { setLookLayerKey } from '../look.js';
import { NYC_LOOK } from './nycLook.js';
import { NYC_BASE, NYC_LANDMARK_GLBS, NYC_GENERIC_GLBS, NYC_PROP_GLBS, NYC_VEHICLE_GLBS, NYC_KIT_GLBS } from './nycManifest.js';

// The cartographer's layout once delivered; the integrator's placeholder until then
const LAYOUT_URL = './assets/levels/nyc_layout.json';
// The cartographer's tree survey ([x, z, kind, osm]: elm / plane / street; layout meta.trees: false when there is none)
const TREES_URL = './assets/levels/nyc_trees.json';
// The city past the bounds from the footprint data (boxes, the rivers over the fetch area: cartographer)
const SURROUND_URL = './assets/levels/nyc_surround.json';
// Dressing detail: Times Square's sign faces, the High Line (cartographer)
const DETAIL_URL = './assets/levels/nyc_detail.json';
/** The Title Match belt on NYC (mat, banners, HUD). */
export const NYC_TITLE = 'NEW YORK HEAVYWEIGHT CHAMPIONSHIP';

let _layout = null;
/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadNycLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`nyc layout: HTTP ${r.status}`);
  const raw = await r.json();
  _layout = LK.normalizeLayout(raw);
  const pt = (p) => (p ? { x: +p.x, z: +p.z, rot: p.rot !== undefined ? +p.rot : undefined } : null);
  // Layout extras (DC's): the ring site, VS spawns, the Lone Soldier start, wave entry points
  // (ring east / west: runway and west screens pulled in, u; gate: false drops the entrance gateway)
  _layout.ring = raw.ring ? { ...pt(raw.ring), east: +raw.ring.east || 0, west: +raw.ring.west || 0, gate: raw.ring.gate } : null;
  _layout.duel = raw.duel ? { a: pt(raw.duel.a), b: pt(raw.duel.b) } : null;
  _layout.soldier = pt(raw.soldier);
  _layout.gridRotationDeg = raw.meta?.gridRotationDeg ?? 29;
  _layout.onPier = new Set((raw.buildings || []).filter((o) => o.onPier).map((o) => o.id));
  _layout.rawBuildings = raw.buildings || []; // (the detail file's sign faces name layout rects)
  _layout.approaches = (raw.approaches || []).map((p) => (Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.z]));
  // Optional: the parks are scattered procedurally without it (meta.trees
  // false: no survey, no fetch and no 404)
  if (raw.meta?.trees !== false) {
    try {
      const tr = await fetch(TREES_URL, { cache: 'no-cache' });
      if (tr.ok) _layout.trees = (await tr.json()).trees || null;
    } catch (e) { /* no tree survey */ }
  }
  // (meta.surround / meta.detail false: none shipped, nothing fetched)
  for (const [key, url] of [['surround', SURROUND_URL], ['detail', DETAIL_URL]]) {
    if (raw.meta?.[key] === false) continue;
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) _layout[key] = await r.json();
    } catch (e) { /* optional */ }
  }
  return _layout;
}

// --------------- GLB assets (dcManifest.js) ---------------
const _ok = (g) => g.ready && !(isMobile && g.desktopOnly);
const _landmarkGLB = (id) => NYC_LANDMARK_GLBS.find((g) => g.ready && (g.ids ? g.ids.includes(id) : g.id === id));
const _kit = (id) => (NYC_KIT_GLBS[id]?.ready ? NYC_BASE + NYC_KIT_GLBS[id].file : null);
// Until NYC's own block kit is ready: Chicago's whole generic kit (Midtown
// has its glass towers as well as its masonry blocks)
function _kitDefs() {
  const own = NYC_GENERIC_GLBS.filter(_ok).map((g) => ({ ...g, url: NYC_BASE + g.file }));
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
function _pickGeneric(h, avoid, rnd = Math.random) {
  const all = _bucketDefs(LK.bucket(h));
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
const STONE = { limestone: 0xcdbfa4, brownstone: 0x6e4a3a, brick: 0x8a4a3a, concrete: 0xa9a397, glass: 0x8f9aa4, granite: 0x9a948c };
function _stoneOf(file) {
  const all = [...NYC_LANDMARK_GLBS, ...NYC_GENERIC_GLBS, ...Object.values(NYC_KIT_GLBS)];
  const def = all.find((g) => g.file === file || NYC_BASE + g.file === file);
  if (def && def.stone != null) return def.stone;
  const f = String(file);
  return /brownstone/.test(f) ? STONE.brownstone : /brick|tenement|loft|walkup|empire_state/.test(f) ? STONE.brick
    : /glass|curtain|tower|vanderbilt|hudson_yards|bank_of_america|times_building|432|central_park_tower|one57|steinway|111_west|secretariat|lever|seagram|citigroup|deutsche/.test(f) ? STONE.glass
    : /concrete|brutal|garden/.test(f) ? STONE.concrete
    : /granite|cathedral|patrick/.test(f) ? STONE.granite : STONE.limestone;
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

/** Building GLB urls the NYC level loads. */
export function nycBuildingGLBs() {
  return [...new Set([
    ...NYC_LANDMARK_GLBS.filter((g) => g.ready).map((g) => NYC_BASE + g.file),
    ...Object.keys(NYC_KIT_GLBS).filter((id) => !(isMobile && NYC_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ..._kitDefs().map((g) => g.url),
  ])];
}
/** GLB urls with a <name>_lod1.glb twin on disk. */
export function nycLod1GLBs() {
  return [...NYC_LANDMARK_GLBS.filter((g) => g.ready && g.lod1 !== false).map((g) => NYC_BASE + g.file),
    ...Object.keys(NYC_KIT_GLBS).filter((id) => NYC_KIT_GLBS[id].lod1 !== false).map(_kit).filter(Boolean),
    ...NYC_GENERIC_GLBS.filter((g) => _ok(g) && g.lod1 !== false).map((g) => NYC_BASE + g.file),
    ...NYC_PROP_GLBS.filter((p) => p.ready && p.lod1 !== false).map((p) => NYC_BASE + p.file),
    ...NYC_VEHICLE_GLBS.filter((v) => v.ready && v.lod1 !== false).map((v) => v.url)];
}
/** NYC-only street props as [{ name, url }]. */
export function nycPropGLBs() {
  return NYC_PROP_GLBS.filter((p) => p.ready).map((p) => ({ name: p.name, url: NYC_BASE + p.file }));
}
/** NYC-only vehicle defs for loadCarTemplates. */
export function nycVehicleGLBs() {
  return NYC_VEHICLE_GLBS.filter((v) => v.ready).map((v) => ({ ...v, levels: ['nyc'] }));
}

// --------------- materials ---------------
let _D = null;
/** NYC's own massing surfaces on top of the shared (Chicago) set. */
function nycMats(M) {
  if (_D) return _D;
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _D = {
    limestone: std(0xd2c6ae, 0.85), limeShade: std(0xb8ab94, 0.88), brick: std(0x9a6a52, 0.9), granite: std(0x8f8a82, 0.8),
    glass: std(0x3e5366, 0.3, 0.1), glassLight: std(0x8ea4b6, 0.32, 0.1), steel: std(0xb6bcc2, 0.35, 0.1),
    steelDark: std(0x37403c, 0.6, 0.2), // (the High Line's painted girders and columns)
    copper: std(0x6c9c86, 0.7), roofDark: std(0x4a4c50, 0.85), slate: std(0x5c6066, 0.8),
    gravel: nycGround(new THREE.MeshStandardMaterial(), 'gravel'),
  };
  for (const m of Object.values(_D)) m.userData.shared = true;
  return _D;
}

// --------------- procedural landmark massing ---------------
// Each returns a Group centred on (0, 0), base at y = 0, h the tallest
// point (spire included), inside roughly w (x) by d (z). Stand-ins until a
// GLB is ready; hm: the layout's roof height (h is the true height incl. spire).
const BUILDERS = {
  deco(h, w, d, M, D, hm = h) {
    // Art Deco setback tower (the Empire State): a five-storey base on the
    // whole lot, setbacks stepping in to a long shaft, a mast above the roof
    const m = new LK.Massing();
    const roof = Math.min(hm, h), base = roof * 0.07;
    m.box(D.limestone, w, base, d);
    let y = base, sw = w * 0.82, sd = d * 0.72;
    for (const [k, f] of [[0.12, 1], [0.6, 0.86], [0.12, 0.74], [0.09, 0.6]]) {
      const th = (roof - base) * k;
      m.box(D.limestone, sw * f, th, sd * f, 0, y);
      y += th;
    }
    if (h > roof + 1) {
      m.cyl(D.steel, w * 0.06, w * 0.09, (h - roof) * 0.45, 8, 0, y);
      m.cyl(D.steel, w * 0.012, w * 0.03, h - y - (h - roof) * 0.45, 6, 0, y + (h - roof) * 0.45);
    }
    return m.build();
  },
  crown(h, w, d, M, D, hm = h) {
    // The Chrysler: brick shaft with setbacks, the terraced stainless crown and needle
    const m = new LK.Massing();
    const shaft = h * 0.72;
    m.box(D.brick, w, shaft * 0.2, d);
    m.box(D.brick, w * 0.8, shaft * 0.5, d * 0.8, 0, shaft * 0.2);
    m.box(D.brick, w * 0.62, shaft * 0.3, d * 0.62, 0, shaft * 0.7);
    for (let i = 0; i < 5; i++) {
      const r = w * 0.36 * (1 - i * 0.17), th = (h - shaft) * 0.12;
      m.cyl(D.steel, r * 0.84, r, th, 4, 0, shaft + i * th, 0, Math.PI / 4);
    }
    m.cyl(D.steel, 0.02, w * 0.05, (h - shaft) * 0.4, 6, 0, shaft + (h - shaft) * 0.6);
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
  pencil(h, w, d, M, D) {
    // Supertall pencil tower (432 Park, 111 West 57th, Central Park Tower): a
    // slender shaft with open mechanical bands every ~12 storeys
    const m = new LK.Massing();
    const bands = Math.max(3, Math.round(h / 9));
    for (let i = 0; i < bands; i++) {
      const y = h * i / bands, th = h / bands;
      m.box(D.glass, w, th * 0.86, d, 0, y);
      m.box(D.limeShade, w * 0.92, th * 0.14, d * 0.92, 0, y + th * 0.86);
    }
    return m.build();
  },
  slab(h, w, d, M, D) {
    // Modernist slab (the UN Secretariat, Lever House): glass faces, stone ends
    const m = new LK.Massing();
    m.box(D.glassLight, w, h * 0.97, d);
    m.box(D.limestone, w * 1.02, h * 0.03, d * 1.02, 0, h * 0.97);
    return m.build();
  },
  terminal(h, w, d, M, D) {
    // Grand Central: the Beaux-Arts limestone hall, its three great windows, the copper roof
    const m = new LK.Massing();
    m.box(D.limestone, w, h * 0.55, d);
    m.box(D.limestone, w * 0.6, h * 0.3, d * 0.86, 0, h * 0.55);
    m.box(D.copper, w * 0.56, h * 0.15, d * 0.82, 0, h * 0.85);
    return m.build();
  },
  cathedral(h, w, d, M, D, hm = h) {
    // St. Patrick's: the marble nave (long axis d), transepts and the two west spires (+Z)
    const m = new LK.Massing();
    const nave = Math.min(hm, h * 0.35);
    m.box(D.limestone, w * 0.55, nave, d * 0.92);
    m.box(D.slate, w * 0.5, nave * 0.3, d * 0.9, 0, nave);
    m.box(D.limestone, w, nave * 0.9, d * 0.2, 0, 0, d * 0.05);
    for (const s of [-1, 1]) {
      m.box(D.limestone, w * 0.18, h * 0.55, w * 0.18, s * w * 0.2, 0, d * 0.42);
      m.add(D.limestone, new THREE.ConeGeometry(w * 0.11, h * 0.45, 8), s * w * 0.2, h * 0.775, d * 0.42);
    }
    return m.build();
  },
  arena(h, w, d, M, D) {
    // Madison Square Garden: the drum on the Penn Station block
    const m = new LK.Massing();
    const r = Math.min(w, d) / 2;
    m.cyl(D.limeShade, r * 0.98, r, h * 0.85, 32);
    m.cyl(D.roofDark, r * 0.6, r * 0.98, h * 0.15, 32, 0, h * 0.85);
    return m.build();
  },
  hotel(h, w, d, M, D) {
    // The Plaza: white brick and marble with the green copper mansard
    const m = new LK.Massing();
    m.box(D.limestone, w, h * 0.78, d);
    m.box(D.copper, w * 0.94, h * 0.22, d * 0.94, 0, h * 0.78);
    return m.build();
  },
  civic(h, w, d, M, D) {
    // Beaux-Arts civic block (the Public Library, Carnegie Hall, Radio City)
    const m = new LK.Massing();
    m.box(D.granite, w, h * 0.12, d);
    m.box(D.limestone, w * 0.98, h * 0.76, d * 0.98, 0, h * 0.12);
    m.box(D.limeShade, w, h * 0.12, d, 0, h * 0.88);
    return m.build();
  },
  vessel(h, w, d, M, D) {
    // The Vessel: a copper honeycomb bowl widening upward
    const m = new LK.Massing();
    const r = Math.min(w, d) / 2;
    m.add(M.bronze, new THREE.CylinderGeometry(r, r * 0.55, h, 12, 1, true), 0, h / 2, 0);
    return m.build();
  },
  rink(h, w, d, M, D) {
    // A sunken rink or plaza (Wollman, Rockefeller): a granite rim round a pale floor
    const m = new LK.Massing();
    m.box(D.granite, w, h, d);
    m.box(M.white, w * 0.86, h * 1.04, d * 0.86);
    return m.build();
  },
  monument(h, w, d, M, D) {
    // A statue, fountain or small kiosk: a granite plinth and a bronze piece
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.45, 1), d);
    m.box(M.bronze, Math.min(w, d) * 0.4, h - Math.min(h * 0.45, 1), Math.min(w, d) * 0.4, 0, Math.min(h * 0.45, 1));
    return m.build();
  },
  steps(h, w, d, M, D) {
    // The TKTS red steps: a glowing red stair rising toward the back (+Z)
    const m = new LK.Massing();
    for (let i = 0; i < 6; i++) m.box(M.red, w, h * (i + 1) / 6, d / 6, 0, 0, -d / 2 + d * (i + 0.5) / 6);
    return m.build();
  },
  ship(h, w, d, M, D) {
    // The Intrepid: a grey hull, the flight deck overhanging it, the island on the starboard side (long axis w)
    const m = new LK.Massing();
    m.box(D.slate, w * 0.92, h * 0.5, d * 0.7);
    m.box(D.roofDark, w, h * 0.06, d, 0, h * 0.5);
    m.box(D.slate, w * 0.12, h * 0.44, d * 0.16, w * 0.05, h * 0.56, d * 0.38);
    return m.build();
  },
  lattice(h, w, d, M, D) {
    // A steel lattice tower (the Roosevelt Island Tramway): four legs and a head frame
    const m = new LK.Massing();
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) m.box(D.steel, w * 0.12, h * 0.9, d * 0.12, sx * w * 0.38, 0, sz * d * 0.38);
    m.box(D.steel, w, h * 0.1, d, 0, h * 0.9);
    return m.build();
  },
  sign(h, w, d, M, D) {
    // A rooftop sign on its frame (Pepsi-Cola): legs and a red board
    const m = new LK.Massing();
    for (const s of [-0.4, 0, 0.4]) m.box(D.steel, w * 0.03, h * 0.5, d * 0.5, s * w, 0);
    m.box(M.red, w, h * 0.5, d * 0.4, 0, h * 0.5);
    return m.build();
  },
  bridge(h, w, d, M, D) {
    // The Queensboro: a road deck along w with cantilever truss towers rising to h over its piers
    const m = new LK.Massing();
    const deck = h * 0.36;
    m.box(D.slate, w, h * 0.06, d, 0, deck);
    for (const t of [-0.32, 0.18]) {
      m.box(D.granite, d * 0.6, deck, d * 0.9, t * w, 0);
      m.add(D.slate, new THREE.ConeGeometry(d * 0.5, h - deck, 4), t * w, deck + (h - deck) / 2, 0, Math.PI / 4);
    }
    return m.build();
  },
  block(h, w, d, M, D) {
    // Pre-war masonry block: a base, the body, a cornice
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h * 0.1, 1.2), d);
    m.box(D.brick, w * 0.98, h * 0.86, d * 0.98, 0, Math.min(h * 0.1, 1.2));
    m.box(D.limeShade, w, h * 0.04, d, 0, h * 0.96);
    return m.build();
  },
};
const BUILDER_ALIASES = [
  ['empire_state', 'deco'], ['chrysler', 'crown'], ['rockefeller', 'deco'], ['30_rock', 'deco'], ['comcast', 'deco'],
  ['432_park', 'pencil'], ['111_west_57', 'pencil'], ['steinway', 'pencil'], ['central_park_tower', 'pencil'],
  ['secretariat', 'slab'], ['lever', 'slab'], ['general_assembly', 'civic'], ['grand_central', 'terminal'],
  ['patrick', 'cathedral'], ['cathedral', 'cathedral'], ['madison_square_garden', 'arena'], ['msg', 'arena'],
  ['plaza_hotel', 'hotel'], ['waldorf', 'deco'], ['library', 'civic'], ['carnegie', 'civic'], ['radio_city', 'civic'],
  ['vessel', 'vessel'], ['penn_station', 'civic'], ['moynihan', 'civic'], ['farley', 'civic'],
  ['rink', 'rink'], ['tkts', 'steps'], ['intrepid', 'ship'], ['tramway', 'lattice'], ['sign', 'sign'], ['queensboro', 'bridge'],
  ['bethesda', 'civic'], ['tavern', 'block'], ['zoo', 'block'], ['fountain', 'monument'], ['monument', 'monument'], ['apple_cube', 'monument'],
  ['clock', 'monument'], ['gapstow', 'monument'], ['columbus_circle', 'monument'],
];
/** The massing builder for a landmark: by id, else by its height (a tower above ~60 m). */
function _builderFor(id, h = 0) {
  const s = String(id || '').toLowerCase();
  for (const [k, b] of BUILDER_ALIASES) if (s.includes(k)) return BUILDERS[b];
  return h > 12 ? BUILDERS.glass : null;
}

// --------------- the builder ---------------
export function buildNyc(scene, world, opts, K) {
  const L = _layout;
  if (!L) throw new Error('buildNyc: layout not loaded (call loadLevelData first)');
  const M = LK.mats(), D = nycMats(M);
  const { ribbon, polygonGeom, quadAlong, pointInPoly, distToPolyline } = LK;
  const buildings = [];
  const grid = new K.BuildingGrid(60);
  const lite = !!opts.lite;
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  K.setBuildingLite(lite);
  setLookLayerKey('nyc', NYC_LOOK.key, NYC_LOOK.az); // (nyc-design's light: nycLook.js)
  const smallCull = glb && lite ? { px: 3, maxH: 2, keep: /tree|lamp/i } : null;
  const instance = () => K.instanceStaticClones(scene, !glb ? Infinity : lite ? 240 : 120, lite ? 185 : 150, smallCull);
  K.setBuildingTile(!glb || lite ? Infinity : 400);
  const B = L.bounds;
  const S = L.scale || 0.2;
  const cxB = (B.minX + B.maxX) / 2, czB = (B.minZ + B.maxZ) / 2;
  // The Manhattan grid frame: u uptown along the avenues (~29 deg east of
  // true north), v crosstown toward the East River, both in game units
  const RG = (L.gridRotationDeg ?? 29) * Math.PI / 180;
  const AX = [Math.sin(RG), -Math.cos(RG)], CX = [Math.cos(RG), Math.sin(RG)];
  const toV = (x, z) => x * CX[0] + z * CX[1], toU = (x, z) => x * AX[0] + z * AX[1];
  const fromVU = (v, u) => [v * CX[0] + u * AX[0], v * CX[1] + u * AX[1]];
  const FAR = 3000;
  // The outside of the play rectangle as four convex regions (half-plane lists [nx, nz, c]: nx*x + nz*z <= c)
  const OUTSIDE = [[[1, 0, B.minX]], [[-1, 0, -B.maxX]], [[-1, 0, -B.minX], [1, 0, B.maxX], [0, 1, B.minZ]], [[-1, 0, -B.minX], [1, 0, B.maxX], [0, -1, -B.maxZ]]];
  // Shorelines in v: the Hudson's east bank and the East River's west bank
  // (from the layout's river polygons: the median v of their vertices inside
  // the bounds), each river's width to the far shore (New Jersey, Queens)
  const SHORE = (() => {
    const inner = (p) => p[0] > B.minX + 1 && p[0] < B.maxX - 1 && p[1] > B.minZ + 1 && p[1] < B.maxZ - 1;
    const med = (re) => {
      const vs = L.water.filter((w) => re.test(w.name || w.id || '')).flatMap((w) => w.polygon.filter(inner).map((p) => toV(p[0], p[1]))).sort((a, b) => a - b);
      return vs.length ? vs[vs.length >> 1] : null;
    };
    const corners = [[B.minX, B.minZ], [B.maxX, B.minZ], [B.minX, B.maxZ], [B.maxX, B.maxZ]].map(([x, z]) => toV(x, z));
    return { hudson: med(/hudson/i) ?? Math.min(...corners) - 40, east: med(/east.?river/i) ?? Math.max(...corners) + 40, hudsonW: 250, eastW: 130 };
  })();
  const animators = [];
  const makeParkTree = createNycTrees(K, lite, glb);
  K.onTemplatesReady((sc, get) => {
    for (const g of [..._kitDefs(), ...NYC_LANDMARK_GLBS.filter((d) => d.ready).map((d) => ({ ...d, url: NYC_BASE + d.file }))]) {
      get(g.url)?.traverse((o) => {
        if (!o.isMesh) return;
        // A model's own pool surface (material 'water'): the layout's water stands there
        // (hidden on the material, which the placed instances share with the template)
        if (/^water$/i.test(o.material?.name || '')) { o.material.visible = false; return; }
        for (const m of [].concat(o.material)) nycFacade(m, g.file);
      });
    }
  });
  const surfaceWear = configureChicagoWear(null, L.paths, lite);
  if (world) world.chicagoSurfaceWear = surfaceWear;
  animators.push({ update(dt, time) { tickNycMaterials(time); } });
  const SW_TILE = K.TILE.SIDEWALK, ASPHALT_TILE = 2;
  const MAJOR_W = 6.9, SIDEWALK_W = 1.2, PS = 0.8;
  const ring = opts.mode === 'wrestling' && L.ring ? L.ring : null;
  // Landmarks that stand: a district or an area with no structure of its own
  // (Times Square, Bryant Park) is a name on the map, nothing is built there
  const LMS = L.landmarks.filter((lm) => lm.kind !== 'district' && lm.h > 0.05);
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
  // (Central Park: the layout's ring entry may trim the runway (east) and the west screens (west) or drop the gateway)
  if (ring) setArenaSite({ x: ring.x, z: ring.z, title: NYC_TITLE, place: 'CENTRAL PARK', fountain: false, stands: ['n', 's'].filter(standsFree).join(''), east: ring.east || 0, west: ring.west || 0, gate: ring.gate ?? true, flag: 'nyc' });
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

  // ---- water: the Hudson, the East River, the Central Park ponds ----
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
  // The rivers carry on past the bounds: the surround file's Hudson and East
  // River over the whole fetch area (else a strip along the grid from each
  // bank), clipped to the outside of the play rectangle in four pieces, so
  // they never overlap the layout's water
  const farWater = [];
  const farRivers = L.surround?.water?.length ? L.surround.water
    : [[SHORE.hudson - SHORE.hudsonW, SHORE.hudson], [SHORE.east, SHORE.east + SHORE.eastW]].map(([v0, v1]) => [fromVU(v0, -FAR), fromVU(v1, -FAR), fromVU(v1, FAR), fromVU(v0, FAR)]);
  for (const river of farRivers) {
    for (const region of OUTSIDE) {
      const piece = clipPoly(river, region);
      if (piece.length >= 3) farWater.push(piece);
    }
  }
  if (L.water.length) {
    const shore = [[], [], []], waterMeshes = [];
    if (farWater.length) {
      const fm = new THREE.Mesh(mergeGeometries(farWater.map((p) => polygonGeom(p, 0.19, 1)), false), M.water);
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
    const field = bakeShoreField([...L.water, ...farWater.map((polygon) => ({ kind: 'lake', polygon }))], [], { x0: B.minX - 100, z0: B.minZ - 100, x1: B.maxX + 100, z1: B.maxZ + 100 });
    const waterMat = makeWaterMaterial(field);
    for (const wm of waterMeshes) wm.material = waterMat;
    const WU = waterUniforms(waterMat);
    nycWater(WU); // (nyc-design's river colours)
    animators.push({ update(dt, time) { WU.uTime.value = time; } });
    waterSplash = splashPool(scene, lite ? 200 : 600, lite ? 12 : 32);
    animators.push(waterSplash);
    const wfx = waterFX(waterMat, field, waterSplash, lite);
    animators.push(wfx);
    if (world) world.water = wfx;
  }
  const swMat = M.path;

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
        const a = pts[i - 1], b = pts[i], n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
        for (let k = 1; k < n; k++) visit([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
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
    nycGround(asphalt, 'asphalt');
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
      } else if (w >= 4.5) {
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

  // ---- parks: Central Park, Bryant Park, the plazas ----
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
  // (the surveyed trees: thinned to the cap)
  const TREE_CAP = L.trees ? (!glb ? 700 : lite ? 1300 : 3200) : lite ? 260 : 900;
  const tree = (x, z, s, kind) => { if (trees < TREE_CAP) { scene.add(makeParkTree(x, z, s * PS, kind)); trees++; } };
  if (L.trees) {
    // (every elm: the Mall's allee in Central Park; plane and street trees thinned to the cap)
    const special = L.trees.filter((t) => t[2] === 'elm'), other = L.trees.filter((t) => t[2] !== 'elm');
    const room = Math.max(0, TREE_CAP - special.length), step = other.length > room ? other.length / Math.max(1, room) : 1;
    const list = [...special];
    for (let i = 0; i < other.length && list.length < TREE_CAP; i += step) list.push(other[Math.floor(i)]);
    // true sizes on DC's elm template (~22 m at 1.0): the Mall's elms, London planes ~18 m, Midtown's street trees (honey locust, pear) ~10 m
    const SIZE = { elm: [1.0, 0.18], plane: [0.78, 0.18], park: [0.8, 0.3], street: [0.46, 0.14] };
    for (const [x, z, kind] of list) {
      if (isWater(x, z) || onRoad(x, z, 0.3) || onLandmark(x, z) || inRingBox(x, z)) continue;
      const [s0, sv] = SIZE[kind] || SIZE.park;
      tree(x, z, s0 + Math.random() * sv, 'elm');
    }
  }
  for (const p of L.parks) {
    const plaza = { parking: roadMat, gravel: D.gravel, paved: swMat }[p.surface] || M.lot;
    const uv = p.kind === 'plaza' && p.surface === 'parking' ? 1 / ASPHALT_TILE : p.surface === 'paved' ? 1 / SW_TILE : 1 / 14;
    const base = p.kind === 'plaza' ? plaza : p.kind === 'lawn' ? M.lawn : M.grass;
    const lay = !p.fill ? 0 : p.kind === 'plaza' ? 3 : 2;
    addBatch(polygonGeom(p.polygon, 0.03, uv), lay ? LK.decal(base, lay) : base);
    for (const q of p.paths) addBatch(ribbon(q.points, -q.width / 2, q.width / 2, 0.04), D.gravel);
    if (p.kind === 'plaza' || p.kind === 'beach' || L.trees) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // A loose scatter, denser where it is woodland (open lawns: Sheep Meadow, the Great Lawn, stay open)
    if (/meadow|great lawn/i.test(p.name)) continue;
    const step = (lite ? 16 : 11) * 0.7;
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (Math.random() < (p.kind === 'lawn' ? 0.8 : 0.55)) continue;
      const tx = x + (Math.random() - 0.5) * step * 0.7, tz = z + (Math.random() - 0.5) * step * 0.7;
      if (p.paths.some((q) => distToPolyline(tx, tz, q.points) < q.width / 2 + 2)) continue;
      if (treeOK(tx, tz, p.polygon)) tree(tx, tz, 0.9 + Math.random() * 0.5);
    }
  }

  // ---- buildings: Midtown's blocks from the kit ----
  const picked = new Map();
  // Turned lots (the grid's ~29 deg): the building keeps its axis box (w, d)
  // for the broad phase and carries its own footprint (obb) for contact,
  // camera rays and the look map; kit pieces are fitted to the lot itself
  const turned = (r) => Math.abs(Math.sin(2 * (r || 0))) > 0.05;
  const orient = (b, w, d, r) => { if (turned(r)) b.obb = { hw: w / 2, hd: d / 2, c: Math.cos(r), s: Math.sin(r) }; };
  const lotOf = (w, d, r) => (turned(r) ? { w, d } : null);
  const placeBlock = (o) => {
    const color = LK.facadeColor();
    const c = Math.abs(Math.cos(o.rotY || 0)), s = Math.abs(Math.sin(o.rotY || 0));
    const aw = o.w * c + o.d * s, ad = o.w * s + o.d * c;
    if (inRingBox(o.x, o.z, aw / 2, ad / 2)) return; // the Title Match venue stands here
    if (o.x < B.minX || o.x > B.maxX || o.z < B.minZ || o.z > B.maxZ) return; // (a lot whose centre lies past the edge)
    // A kit piece made for this very footprint (nycManifest layoutIds)
    const own = Object.values(NYC_KIT_GLBS).find((d) => d.ready && d.layoutIds && d.layoutIds.includes(o.id));
    if (own) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
      b.layoutId = o.id; b._skipBodyIM = true;
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      b.debrisTint = _stoneOf(own.file);
      orient(b, o.w, o.d, o.rotY);
      K.queueGLB({ url: NYC_BASE + own.file, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, stretch: 1.6, lot: lotOf(o.w, o.d, o.rotY) });
      return;
    }
    const rnd = _seeded(o.id + ':' + Math.round(o.x) + ':' + Math.round(o.z));
    const url = _pickGeneric(o.h, null, rnd);
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
    if (L.onPier.has(o.id)) b.onWater = true; // a shed on a Hudson pier (the layout's water runs under the piers)
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const cx = Math.floor(o.x / 24), cz = Math.floor(o.z / 24);
    const avoid = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const u of picked.get((cx + i) + ':' + (cz + j)) || []) avoid.add(u);
    const pick = _pickGeneric(o.h, avoid, rnd) || url;
    const k = cx + ':' + cz;
    if (!picked.has(k)) picked.set(k, []);
    picked.get(k).push(pick);
    const fill = o.h < 18;
    // (read at the collapse: a fill row may have placed another kit piece than the pick)
    Object.defineProperty(b, 'debrisTint', { get() { return _stoneOf(this.glbUrl || pick); } });
    orient(b, o.w, o.d, o.rotY);
    K.queueGLB({ url: pick, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, pool: _bucketDefs(LK.bucket(o.h)).map((g) => g.url), stretch: 1.3, fill, lot: lotOf(o.w, o.d, o.rotY) });
  };
  for (const o of L.buildings) if (!(lite && o.phoneSkip)) placeBlock(o);

  // ---- landmarks ----
  for (const lm of LMS) {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    const aw = lm.w * c + lm.d * s, ad = lm.w * s + lm.d * c;
    if (onMat(lm.x, lm.z, aw / 2, ad / 2) || (lm.kind === 'prop' && lm.h < 4 && inRingBox(lm.x, lm.z))) { console.info('[nyc] landmark inside the ring venue, left out:', lm.id); continue; }
    const hp = lm.hp || Math.max(120, Math.round(lm.h * 3 + lm.w * lm.d * 0.05));
    const b = new K.Building(lm.x, lm.z, aw, ad, lm.h, { skipWindows: true });
    orient(b, lm.w, lm.d, lm.rotY);
    b._skipBodyIM = true;
    b.maxHp = hp; b.hp = hp;
    b.landmarkId = lm.id;
    b.landmarkName = lm.name; // "THROUGH THE CHRYSLER BUILDING!" (wrestling callouts)
    if (lm.kind === 'bridge' || /intrepid/.test(lm.id)) b.onWater = true; // (over or moored on the river on purpose)
    b.debrisTint = _stoneOf(_landmarkGLB(lm.id)?.file || lm.id);
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const def = _landmarkGLB(lm.id);
    if (def) {
      // nyc-design's models are built at true size: uniform 0.2 u/m (a spire
      // makes the layout's roof height a poor scale reference)
      const h = def.trueHeightM * S;
      const url = NYC_BASE + def.file;
      const rotY = def.face ? LK.faceRot(lm.rotY || 0, def.face) : def.faceX ? LK.faceRot(lm.rotY || 0, def.faceX, true) : (lm.rotY || 0);
      if (def.shiftM) {
        // A model whose origin is not its building's centre: the site moves
        // shiftM metres along the model's front (+Z)
        grid.remove(b);
        b.x += Math.sin(rotY) * def.shiftM * S; b.z += Math.cos(rotY) * def.shiftM * S;
        b.group.position.set(b.x, 0, b.z); b.group.updateMatrix();
        grid.add(b);
      }
      if (def.exact) K.queueGLB({ url, h: def.trueHeightM * S, building: b, maxW: 0, maxD: 0, rotY, landmark: true, atOrigin: !!def.atOrigin });
      else if (def.fit === 'footprint') K.queueGLB({ url, h: lm.h * (def.maxH || 1.6), building: b, maxW: aw, maxD: ad, rotY, landmark: true, stretch: def.stretch || 1.3, lot: lotOf(lm.w, lm.d, lm.rotY) });
      else K.queueGLB({ url, h, building: b, maxW: 0, maxD: 0, rotY, landmark: true });
      continue;
    }
    // Procedural massing until the GLB is ready, at true height (spire
    // included) over the layout's roof height
    const hTrue = Math.max(lm.h, (lm.heightM || 0) * S);
    const bld = _builderFor(lm.id, lm.h);
    const mesh = (bld || BUILDERS.block)(hTrue, lm.w, lm.d, M, D, lm.h);
    mesh.userData.procedural = true;
    const pend = NYC_LANDMARK_GLBS.find((g) => !g.ready && (g.ids ? g.ids.includes(lm.id) : g.id === lm.id));
    // (listed by the smoke test as pending, not failed)
    b.pendingGLB = pend ? pend.file : lm.id + ' (procedural)';
    mesh.position.set(lm.x, 0, lm.z);
    mesh.rotation.y = lm.rotY || 0;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
    b.customMesh = mesh;
  }

  // ---- Times Square: stacked LED screens and billboards on the faces round the bow-tie ----
  // (nyc_detail.json timesSquare.signs: a layout building and the faces of its
  // rect that look onto the square). One mesh per sign building, a child of
  // its group so the screens come down with it; one shared unlit atlas whose
  // offset steps every few seconds (the screens change together)
  const signs = L.detail?.timesSquare?.signs || [];
  if (signs.length) {
    const TS = 512, cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g2 = cv.getContext('2d');
    const WORDS = ['KAIJU HAVOC', 'LIVE', 'BREAKING', 'FIGHT NIGHT', 'TONIGHT', 'NEWS 24', 'SALE', '怪獣', 'TITLE MATCH', 'NOW SHOWING', 'EVACUATE', 'MIDTOWN'];
    const HUES = ['#e8202a', '#1c6cf2', '#f2c41c', '#18c27a', '#ff6a1a', '#b524e8', '#ffffff', '#0fd2e6'];
    // 4 x 4 cells, each an ad: a gradient ground, a slogan, bars
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 128, y = Math.floor(i / 4) * 128, a = HUES[i % HUES.length], b = HUES[(i * 5 + 3) % HUES.length];
      const gr = g2.createLinearGradient(x, y, x + 128, y + 128); gr.addColorStop(0, a); gr.addColorStop(1, '#101018');
      g2.fillStyle = gr; g2.fillRect(x, y, 128, 128);
      g2.fillStyle = b; g2.fillRect(x + 6, y + 92, 116, 10);
      g2.font = '900 26px Impact, "Arial Black", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillStyle = '#ffffff'; g2.fillText(WORDS[i % WORDS.length], x + 64, y + 52, 116);
      g2.strokeStyle = '#05050a'; g2.lineWidth = 4; g2.strokeRect(x + 2, y + 2, 124, 124);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    const led = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: true });
    led.userData.shared = true;
    const raw = new Map((L.rawBuildings || []).map((o) => [o.id, o]));
    for (const sg of signs) {
      const o = raw.get(sg.id);
      if (!o) continue;
      // the Buildings standing on that lot (a long low lot is several), or the landmark
      const owners = buildings.filter((b) => !b.destroyed && (sg.landmark ? b.landmarkId === sg.landmark : b.layoutId === sg.id));
      if (!owners.length) continue;
      const r = +o.rot || 0, c = Math.cos(r), s = Math.sin(r), hw = o.w / 2, hd = o.d / 2;
      const top = Math.min(sg.signTopMetres * S, (o.height || 10) * 0.92), y0 = 1.2;
      if (top < y0 + 1.5) continue;
      const parts = new Map(); // owner -> [pos, uv, col, idx]
      const rng = _seeded('ts:' + sg.id);
      for (const f of sg.faces) {
        // face frame: n the outward normal (local), t along the face, its half length
        const ax = f[1] === 'x', sg1 = f[0] === '+' ? 1 : -1;
        const nl = ax ? [sg1, 0] : [0, sg1], tl = ax ? [0, 1] : [1, 0], half = (ax ? hd : hw) + 0.6; // (wraps 0.6u round the corners)
        const off = (ax ? hw : hd) + 0.14;
        const N = [nl[0] * c + nl[1] * s, -nl[0] * s + nl[1] * c], T = [tl[0] * c + tl[1] * s, -tl[0] * s + tl[1] * c];
        // the screens: columns 2.5-6u wide, rows 2-5u tall, the odd gap
        for (let a = -half; a < half - 0.5;) {
          const cw = Math.min(half - a, 2.5 + rng() * 3.5);
          for (let y = y0; y < top - 0.8;) {
            const rh = Math.min(top - y, 2 + rng() * 3);
            if (rng() > 0.12) {
              const mid = a + cw / 2, px = o.cx + N[0] * off + T[0] * mid, pz = o.cz + N[1] * off + T[1] * mid;
              let best = owners[0], bd = Infinity;
              for (const b of owners) { const d = Math.hypot(b.x - px, b.z - pz); if (d < bd) { bd = d; best = b; } }
              if (!parts.has(best)) parts.set(best, [[], [], [], []]);
              const [pos, uv, col, idx] = parts.get(best);
              const i0 = pos.length / 3, cell = Math.floor(rng() * 16), u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 4, k = 0.88 + rng() * 0.12;
              for (const [ta, yy, uu, vv] of [[-cw / 2 + 0.08, y + 0.08, 0, 0], [cw / 2 - 0.08, y + 0.08, 1, 0], [cw / 2 - 0.08, y + rh - 0.08, 1, 1], [-cw / 2 + 0.08, y + rh - 0.08, 0, 1]]) {
                // (wound so the face looks out along N)
                const tt = sg1 * (ax ? -1 : 1) * ta;
                pos.push(px + T[0] * tt - best.x, yy, pz + T[1] * tt - best.z); uv.push(u0 + uu / 4, v0 + vv / 4); col.push(k, k, k);
              }
              idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
            }
            y += rh;
          }
          a += cw;
        }
      }
      for (const [b, [pos, uv, col, idx]] of parts) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, led);
        m.matrixAutoUpdate = false; m.updateMatrix();
        m.name = 'nyc_times_square_screens';
        b.group.add(m);
      }
    }
    let shown = 0;
    animators.push({ update(dt, time) { const n = Math.floor(time / 3.5); if (n !== shown) { shown = n; tex.offset.set((n % 4) / 4, Math.floor(n / 4) % 4 / 4); } } });
  }

  // ---- the High Line: the planted deck on its girders and riveted columns, 9 m over the West Side ----
  const hl = L.detail?.highLine;
  if (hl?.polylines?.length) {
    const yD = (hl.deckHeightMetres || 9) * S, hwD = (hl.widthMetres || 11) * S / 2, fascia = 0.45;
    const deck = [], steel = [];
    for (const pts0 of hl.polylines) {
      const pts = pts0.filter((p) => !inRingBox(p[0], p[1]));
      if (pts.length < 2) continue;
      deck.push(ribbon(pts, -hwD, hwD, yD, 1 / 6));
      // the girder fascia both sides, and a pair of columns every ~7u
      const pos = [], idx = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
        if (l < 0.05) continue;
        const dx = (bx - ax) / l, dz = (bz - az) / l, rx = -dz, rz = dx;
        for (const sd of [-1, 1]) {
          const i0 = pos.length / 3, ox = rx * hwD * sd, oz = rz * hwD * sd;
          pos.push(ax + ox, yD - fascia, az + oz, bx + ox, yD - fascia, bz + oz, bx + ox, yD + 0.02, bz + oz, ax + ox, yD + 0.02, az + oz);
          if (sd > 0) idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3); else idx.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2); // (facing out)
        }
        for (let t = 0; t < l; t += 7) for (const sd of [-0.8, 0.8]) {
          const cx = ax + dx * t + rx * hwD * sd, cz = az + dz * t + rz * hwD * sd;
          if (isWater(cx, cz)) continue;
          steel.push(new THREE.BoxGeometry(0.28, yD - fascia, 0.28).translate(cx, (yD - fascia) / 2, cz).toNonIndexed());
        }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setIndex(idx);
      steel.push(fg.toNonIndexed());
    }
    if (deck.length) {
      const dm = addBatch(mergeGeometries(deck, false), D.gravel);
      dm.castShadow = true;
    }
    if (steel.length) {
      for (const g of steel) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
      const sg = mergeGeometries(steel, false);
      sg.computeVertexNormals();
      const sm = addBatch(sg, D.steelDark);
      sm.castShadow = true;
    }
  }

  // ---- the Title Match venue (wrestling mode only) ----
  if (ring) buildArena(scene, world, { lite, glb, animators, grid, inside: null });

  const bodiesIM = K.buildGlobalBodies(scene, buildings);
  const windowPulse = K.buildGlobalWindows(scene, LK.windows);
  if (windowPulse) animators.push(windowPulse);

  // ---- street dressing: acorn lamps, signals, shelters ----
  {
    for (const n of ['chi_streetlamp', 'chi_bus_shelter']) {
      K.propScene(n)?.traverse((o) => { if (o.isMesh && o.material.emissiveMap) o.material.emissiveIntensity = 0.08; });
    }
    // NYC's own lamp when nyc-design ships one, else Chicago's, else the Tokyo kit lamp, else procedural
    const lampName = K.hasProp('nyc_streetlamp') ? 'nyc_streetlamp' : K.hasProp('chi_streetlamp') ? 'chi_streetlamp' : 'street_lamp';
    const hasLamp = K.hasProp(lampName);
    const lampEvery = lite ? 56 : 34;
    let n = 0;
    for (const e of net.edges) {
      const w = e.laneOff * 4;
      if (w < MAJOR_W) continue;
      for (let t = Math.min(6, e.len / 2); t < e.len - 3; t += lampEvery) {
        const s = (n++ % 2) ? 1 : -1;
        const off = s * (w / 2 + 0.25);
        const x = net.nodes[e.a].x + e.dx * t - e.dz * off, z = net.nodes[e.a].z + e.dz * t + e.dx * off;
        if (isWater(x, z) || onRing(x, z)) continue;
        const lamp = hasLamp ? K.cloneProp(lampName, 5.6 * PS) : LK.makeLamp();
        if (!hasLamp) lamp.scale.setScalar(PS);
        lamp.position.set(x, 0, z);
        lamp.rotation.y = Math.atan2(e.dx, e.dz) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
        lamp.matrixAutoUpdate = false; lamp.updateMatrix();
        lamp.userData.instance = true;
        scene.add(lamp);
        if (!lite && Math.random() < 0.45) {
          const tx = net.nodes[e.a].x + e.dx * (t + lampEvery / 2) + e.dz * off, tz = net.nodes[e.a].z + e.dz * (t + lampEvery / 2) - e.dx * off;
          if (t + lampEvery / 2 < e.len - 6 && !isWater(tx, tz) && !onRing(tx, tz)) tree(tx, tz, 0.75 + Math.random() * 0.3);
        }
      }
    }
    const sigName = K.hasProp('nyc_traffic_signal') ? 'nyc_traffic_signal' : 'chi_traffic_signal';
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
        const sig = K.cloneProp(sigName, 6.4 * PS);
        sig.position.set(x, 0, z);
        sig.rotation.y = Math.atan2(ux, uz);
        sig.matrixAutoUpdate = false; sig.updateMatrix();
        sig.userData.instance = true;
        scene.add(sig);
      }
    }
    // Bus shelters on the avenues
    const art = net.edges.filter((e) => e.laneOff * 4 >= MAJOR_W && e.len > 15);
    const shelterName = K.hasProp('nyc_bus_shelter') ? 'nyc_bus_shelter' : 'chi_bus_shelter';
    for (let i = 0; i < (lite ? 6 : 14) && art.length; i++) {
      const e = art[Math.floor(Math.random() * art.length)];
      const w = e.laneOff * 4, t = e.len * (0.2 + Math.random() * 0.6), s = Math.random() < 0.5 ? 1 : -1;
      const off = s * (w / 2 + 0.3);
      const x = net.nodes[e.a].x + e.dx * t - e.dz * off, z = net.nodes[e.a].z + e.dz * t + e.dx * off;
      if (isWater(x, z) || onRing(x, z)) continue;
      const p = K.hasProp(shelterName) ? K.cloneProp(shelterName, 2.6 * PS) : LK.makeShelter();
      if (!K.hasProp(shelterName)) p.scale.setScalar(PS);
      p.position.set(x, 0, z);
      p.rotation.y = Math.atan2(e.dx, e.dz) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
      p.matrixAutoUpdate = false; p.updateMatrix();
      p.userData.instance = true;
      scene.add(p);
    }
  }

  // ---- the surround: the rest of Manhattan, New Jersey, Queens and Brooklyn ----
  // Out to the ground plane's edge (where the look layer's world-edge fade
  // takes everything into the haze): the cartographer's surround boxes from
  // the footprint data (cls 0: a tax block of low fabric as one mass, 1: a
  // building of 40 m or more, One World Trade Center 5.5 km south among them,
  // 2: New Jersey), and Central Park carried north past the bounds. One merged
  // UNLIT mesh with baked sun shading (one draw) plus the outer ground (one draw).
  const G = GROUND / 2, RX0 = cxB - G, RX1 = cxB + G, RZ0 = czB - G, RZ1 = czB + G;
  const BU = 16, BV = 44, ST = 3.6; // a Manhattan block (~80 x 220 m) with its streets, in u (the outer ground's tile)
  const inPlay = (x, z, pad) => x > B.minX - pad && x < B.maxX + pad && z > B.minZ - pad && z < B.maxZ + pad;
  // Central Park past the bounds: the v range of the layout's park polygon, from its south edge north
  const cpark = (() => {
    const p = L.parks.find((q) => /^central park$/i.test(q.name));
    if (!p) return null;
    const vs = p.polygon.map(([x, z]) => toV(x, z)), us = p.polygon.map(([x, z]) => toU(x, z));
    return { v0: Math.min(...vs), v1: Math.max(...vs), u0: Math.min(...us) };
  })();
  if (L.surround?.boxes?.length || cpark) {
    const sunL = new THREE.Vector3(0.55, 1.2, 0.65).normalize();
    const pos = [], uv = [], col = [], idx = [];
    const cc = new THREE.Color(), nn = new THREE.Vector3();
    // A box centred on (x, z), w along its local X, d along local Z, turned
    // by rot (three.js rotation.y: local X along (c, -s), local Z along (s, c))
    const addBox = (x, z, w, h, d, rot, tint, roof) => {
      const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
      const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      for (const [a, b, nl, fw] of [[[-hw, hd], [hw, hd], [0, 1], w], [[hw, hd], [hw, -hd], [1, 0], d], [[hw, -hd], [-hw, -hd], [0, -1], w], [[-hw, -hd], [-hw, hd], [-1, 0], d]]) {
        nn.set(nl[0] * c + nl[1] * s, 0, -nl[0] * s + nl[1] * c);
        cc.copy(tint).multiplyScalar(Math.min(1, 0.6 + 0.5 * Math.max(0, nn.dot(sunL))) * 0.9);
        const i0 = pos.length / 3, u0 = (x * 0.37 + z * 0.61) / 6;
        const pa = P(a[0], a[1]), pb = P(b[0], b[1]);
        for (const [p, ly, uu] of [[pa, 0, 0], [pb, 0, fw], [pb, h, fw], [pa, h, 0]]) {
          pos.push(p[0], ly, p[1]); uv.push(u0 + uu / 6, ly / 3.2); col.push(cc.r, cc.g, cc.b);
        }
        idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
      const i0 = pos.length / 3;
      for (const [lx, lz] of [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]]) { const p = P(lx, lz); pos.push(p[0], h, p[1]); uv.push(0.5, 0.03); col.push(roof.r, roof.g, roof.b); }
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    // A flat patch on the grid (park lawn), just over the outer ground
    const addFlat = (v0, v1, u0, u1, tint) => {
      const i0 = pos.length / 3;
      for (const [vv, uu] of [[v0, u0], [v1, u0], [v1, u1], [v0, u1]]) { const p = fromVU(vv, uu); pos.push(p[0], 0.06, p[1]); uv.push(0.5, 0.03); col.push(tint.r, tint.g, tint.b); }
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    const rnd = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const STONE = [0xd8cfbd, 0xcbbfa8, 0xe0dacd, 0xb9ae9a], BRICK = [0x9a6452, 0x8c5c4c, 0xa87660, 0x7c5a4e, 0xb08a6e], GLASSY = [0x7f93a6, 0x6a7c8e, 0x9eabb6, 0x8a98a2];
    const pick = (arr, k) => new THREE.Color(arr[Math.floor(rnd(k) * arr.length) % arr.length]);
    const ROOFS = [new THREE.Color(0x6e6a66), new THREE.Color(0x5b5f63), new THREE.Color(0x7d848a)];
    const GREEN = new THREE.Color(0x52703f);
    const onGround = (x, z) => x > RX0 && x < RX1 && z > RZ0 && z < RZ1;
    // (phone LOW keeps the towers and the nearer low fabric)
    let k = 0;
    for (const [x, z, w, d, h, rot, cls] of L.surround?.boxes || []) {
      k++;
      if (!onGround(x, z) || inPlay(x, z, 1)) continue;
      const dEdge = Math.max(B.minX - x, x - B.maxX, B.minZ - z, z - B.maxZ, 0);
      if (lite && cls !== 1 && dEdge > 200 && rnd(k * 1.7) < 0.5) continue;
      // towers glass or stone by height, low fabric brick or stone, New Jersey mixed
      const tint = cls === 1 ? pick(h > 30 ? GLASSY : rnd(k * 2.3) < 0.5 ? STONE : GLASSY, k) : pick(rnd(k * 6.7) < 0.55 ? BRICK : STONE, k * 3);
      addBox(x, z, w, h, d, rot || 0, tint, ROOFS[k % 3]);
    }
    // Central Park on north past the bounds (the blocks either side are in the boxes)
    if (cpark) {
      const uTop = Math.max(...[[RX0, RZ0], [RX1, RZ0], [RX0, RZ1], [RX1, RZ1]].map(([x, z]) => toU(x, z)));
      for (let u = cpark.u0; u < uTop; u += 4 * BU) {
        const [x, z] = fromVU((cpark.v0 + cpark.v1) / 2, u + 2 * BU);
        if (onGround(x, z) && !inPlay(x, z, -2)) addFlat(cpark.v0, cpark.v1, u, u + 4 * BU, GREEN);
      }
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

  // ---- outer ground: the street grid, pavement and street trees under the surround ----
  {
    // one tile: 2 blocks crosstown by 4 uptown, mapped on the rotated grid
    const TV = BV * 2, TU = BU * 4, TS = 512, pv = TS / TV, pu = TS / TU;
    const cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#5e5d5a'; g2.fillRect(0, 0, TS, TS); // asphalt
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      const x0 = (i * BV + ST * 0.5) * pv, y0 = (j * BU + ST * 0.5) * pu, w = (BV - ST) * pv, h = (BU - ST) * pu;
      g2.fillStyle = '#b4afa6'; g2.fillRect(x0, y0, w, h);                         // sidewalk
      g2.fillStyle = '#8f8a82'; g2.fillRect(x0 + 1.0 * pv, y0 + 1.0 * pu, w - 2 * pv, h - 2 * pu); // the block
      g2.fillStyle = '#56703f';                                                      // street trees on the kerbs
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
    level: 'nyc', bounds: { ...B }, center: { x: cxB, z: czB },
    spawn: { ...L.spawn }, isWater, barrier, landPoint: sidewalkPoint,
    mapWater: L.water.map((w) => ({ kind: w.kind, polygon: w.polygon, holes: w.holes })),
    enemySpawns: L.enemySpawns, duelSpawns: L.duel, soldierSpawn: L.soldier, ringSite: L.ring,
  };
}
