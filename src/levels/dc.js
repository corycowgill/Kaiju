// Washington DC: the National Mall from the Lincoln Memorial to the Capitol,
// the White House and the Ellipse, the Tidal Basin and the Potomac edge,
// built from assets/levels/dc_layout.json (Chicago's schema: game units,
// 0.2 u/m, +X east, +Z south). Follows buildChicago's structure and shares
// its helpers, materials, water and ring (chicago.js LEVEL_KIT,
// chicago_water.js, chicago_arena.js at the layout's ring site); the DC
// specifics are the Mall's elm rows and gravel walks, the federal-stone
// block kit, the monuments' massing and the low skyline backdrop.
import * as THREE from 'three';
import { LEVEL_KIT as LK } from './chicago.js';
import { dcGround, dcFacade, tickDcMaterials, createDcTrees } from './dcMaterials.js';
import { configureChicagoWear } from './chicagoMaterials.js';
import { isMobile } from '../quality.js';
import { splashPool } from './chicago_harbor.js';
import { bakeShoreField, makeWaterMaterial, waterUniforms, waterFX } from './chicago_water.js';
import { buildArena, arenaNoTree, setArenaSite } from './chicago_arena.js';
import { DC_BASE, DC_LANDMARK_GLBS, DC_GENERIC_GLBS, DC_PROP_GLBS, DC_VEHICLE_GLBS, DC_KIT_GLBS } from './dcManifest.js';

// The cartographer's layout once delivered; the integrator's placeholder until then
const LAYOUT_URL = './assets/levels/dc_layout.json';
// The cartographer's tree survey ([x, z, kind, osm]: elm / cherry / park / street)
const TREES_URL = './assets/levels/dc_trees.json';
// Dressing detail (the Monument's flag circle; the WWII Memorial is its GLB)
const DETAIL_URL = './assets/levels/dc_mall_detail.json';
/** The Title Match belt on DC (mat, banners, HUD). */
export const DC_TITLE = 'NATIONAL MALL HEAVYWEIGHT CHAMPIONSHIP';

let _layout = null;
/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadDcLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`dc layout: HTTP ${r.status}`);
  const raw = await r.json();
  _layout = LK.normalizeLayout(raw);
  const pt = (p) => (p ? { x: +p.x, z: +p.z, rot: p.rot !== undefined ? +p.rot : undefined } : null);
  // DC extras: the ring site, VS spawns, the Lone Soldier start, wave entry points
  _layout.ring = pt(raw.ring);
  _layout.duel = raw.duel ? { a: pt(raw.duel.a), b: pt(raw.duel.b) } : null;
  _layout.soldier = pt(raw.soldier);
  _layout.approaches = (raw.approaches || []).map((p) => (Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.z]));
  // Optional: the parks are scattered procedurally without it
  try {
    const tr = await fetch(TREES_URL, { cache: 'no-cache' });
    if (tr.ok) _layout.trees = (await tr.json()).trees || null;
  } catch (e) { /* no tree survey */ }
  try {
    const dr = await fetch(DETAIL_URL, { cache: 'no-cache' });
    if (dr.ok) _layout.detail = await dr.json();
  } catch (e) { /* no detail */ }
  return _layout;
}

// --------------- GLB assets (dcManifest.js) ---------------
const _ok = (g) => g.ready && !(isMobile && g.desktopOnly);
const _landmarkGLB = (id) => DC_LANDMARK_GLBS.find((g) => g.ready && (g.ids ? g.ids.includes(id) : g.id === id));
const _kit = (id) => (DC_KIT_GLBS[id]?.ready ? DC_BASE + DC_KIT_GLBS[id].file : null);
// Until DC's own block kit is ready: Chicago's stone and brick commercial
// pieces (no glass towers: DC is limestone under a height limit)
const CHI_STONE = /gen_low_limestone_block|gen_low2_bank|gen_low2_chicago_school|gen_low_terracotta_office|gen_low2_terracotta_comm|gen_mid_deco_setback|gen_low2_modern_mid|gen_short_brick_hotel|gen_low_brick_loft/;
function _kitDefs() {
  const own = DC_GENERIC_GLBS.filter(_ok).map((g) => ({ ...g, url: DC_BASE + g.file }));
  if (own.length) return own;
  return LK.genericGLBs.filter((g) => _ok(g) && CHI_STONE.test(g.file)).map((g) => ({ ...g, url: LK.base + g.file }));
}
// DC's ceiling (~40 m above the street on most blocks): the kit's tall
// bucket folds into medium, medium into short where a bucket is empty
function _bucketDefs(bucket) {
  const defs = _kitDefs();
  for (const b of [bucket, 'medium', 'short', 'low']) {
    const list = defs.filter((g) => g.bucket === b);
    if (list.length) return list;
  }
  return defs;
}
function _pickGeneric(h, avoid) {
  const all = _bucketDefs(LK.bucket(h));
  const fit = all.filter((g) => !g.maxH || h <= g.maxH);
  const own = fit.length ? fit : all;
  const ok = avoid ? own.filter((g) => !avoid.has(g.url)) : own;
  const list = ok.length ? ok : own;
  let r = Math.random() * list.reduce((a, g) => a + (g.share ?? 1), 0);
  for (const g of list) { r -= g.share ?? 1; if (r < 0) return g.url; }
  return list[list.length - 1]?.url || null;
}

/** Building GLB urls the DC level loads. */
export function dcBuildingGLBs() {
  return [...new Set([
    ...DC_LANDMARK_GLBS.filter((g) => g.ready).map((g) => DC_BASE + g.file),
    ...Object.keys(DC_KIT_GLBS).filter((id) => !(isMobile && DC_KIT_GLBS[id].desktopOnly)).map(_kit).filter(Boolean),
    ..._kitDefs().map((g) => g.url),
  ])];
}
/** GLB urls with a <name>_lod1.glb twin on disk. */
export function dcLod1GLBs() {
  return [...DC_LANDMARK_GLBS.filter((g) => g.ready && g.lod1 !== false).map((g) => DC_BASE + g.file),
    ...Object.keys(DC_KIT_GLBS).filter((id) => DC_KIT_GLBS[id].lod1 !== false).map(_kit).filter(Boolean),
    ...DC_GENERIC_GLBS.filter((g) => _ok(g) && g.lod1 !== false).map((g) => DC_BASE + g.file),
    ...DC_PROP_GLBS.filter((p) => p.ready && p.lod1 !== false).map((p) => DC_BASE + p.file),
    ...DC_VEHICLE_GLBS.filter((v) => v.ready && v.lod1 !== false).map((v) => v.url)];
}
/** DC-only street props as [{ name, url }]. */
export function dcPropGLBs() {
  return DC_PROP_GLBS.filter((p) => p.ready).map((p) => ({ name: p.name, url: DC_BASE + p.file }));
}
/** DC-only vehicle defs for loadCarTemplates. */
export function dcVehicleGLBs() {
  return DC_VEHICLE_GLBS.filter((v) => v.ready).map((v) => ({ ...v, levels: ['dc'] }));
}

// --------------- materials ---------------
let _D = null;
/** DC's own surfaces on top of the shared (Chicago) set: marble, the Mall's gravel walks. */
function dcMats(M) {
  if (_D) return _D;
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _D = {
    marble: std(0xe4e0d6, 0.62), marbleShade: std(0xc9c4b8, 0.7), sandstone: std(0x8e4b3c, 0.9),
    roofLead: std(0x5c6168, 0.7, 0.2), domeWhite: std(0xe9e6de, 0.55), bronzeDark: std(0x3c3428, 0.5, 0.5),
    limestone: std(0xd6cdb8, 0.85), roofTile: std(0x8a5446, 0.88), granite: std(0x8f8a82, 0.8),
    flag: std(0xb8323c, 0.8),
    gravel: dcGround(new THREE.MeshStandardMaterial(), 'gravel'),
  };
  for (const m of Object.values(_D)) m.userData.shared = true;
  return _D;
}

// --------------- procedural landmark massing ---------------
// Each returns a Group centred on (0, 0), base at y = 0, h the tallest
// point, inside roughly w (x) by d (z). Stand-ins until a GLB is ready.
const BUILDERS = {
  monument(h, w, d, M, D) {
    // Marble obelisk: a square shaft tapering to 0.63 of its base, pyramidion on top
    const m = new LK.Massing();
    const r0 = w / Math.SQRT2, shaft = h * 0.9;
    m.add(D.marble, new THREE.CylinderGeometry(r0 * 0.63, r0, shaft, 4, 1), 0, shaft / 2, 0, Math.PI / 4);
    m.add(D.marble, new THREE.ConeGeometry(r0 * 0.63, h - shaft, 4), 0, shaft + (h - shaft) / 2, 0, Math.PI / 4);
    m.box(D.marbleShade, w * 2.4, 0.2, d * 2.4); // the plaza step
    return m.build();
  },
  capitol(h, w, d, M, D) {
    // Long axis north-south (d): the central block, the two wings, the
    // cast-iron dome on its colonnaded drum, the lantern and the statue
    const m = new LK.Massing();
    const roof = h * 0.24;
    m.box(D.marble, w * 0.55, roof, d * 0.34);
    for (const s of [-1, 1]) {
      m.box(D.marble, w * 0.62, roof * 0.92, d * 0.27, 0, 0, s * d * 0.36);
      m.box(D.marbleShade, w * 0.3, roof * 0.7, d * 0.12, w * 0.12, 0, s * d * 0.19); // connecting corridors
    }
    // East portico (+X)
    m.box(D.marble, w * 0.18, roof * 0.95, d * 0.16, w * 0.33, 0);
    m.add(D.marble, new THREE.ConeGeometry(w * 0.12, roof * 0.25, 3), w * 0.33, roof + roof * 0.12, 0, Math.PI / 2, 0, Math.PI / 2, 1, 1, d * 0.6 / w);
    const rd = Math.min(w, d) * 0.3;
    m.cyl(D.marble, rd * 1.05, rd * 1.1, roof * 0.35, 24, 0, roof);
    m.cyl(D.domeWhite, rd * 0.9, rd * 0.95, h * 0.16, 24, 0, roof + roof * 0.35);
    const yd = roof + roof * 0.35 + h * 0.16;
    m.add(D.domeWhite, new THREE.SphereGeometry(rd * 0.92, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, yd, 0, 0, 0, 0, 1, 1.15, 1);
    m.cyl(D.domeWhite, rd * 0.18, rd * 0.2, h * 0.08, 12, 0, yd + rd * 1.0);
    m.cyl(D.bronzeDark, rd * 0.04, rd * 0.07, h - (yd + rd * 1.0 + h * 0.08), 6, 0, yd + rd * 1.0 + h * 0.08);
    return m.build();
  },
  lincoln(h, w, d, M, D) {
    // Doric temple: a stepped podium, 36 columns round the cella, the attic
    const m = new LK.Massing();
    const pod = h * 0.18, col = h * 0.55, att = h - pod - col;
    m.box(D.marbleShade, w * 1.08, pod * 0.5, d * 1.08);
    m.box(D.marble, w, pod, d);
    m.box(D.marbleShade, w * 0.72, col, d * 0.8, 0, pod);
    const nx = 6, nz = 12, r = Math.min(w, d) * 0.035;
    for (let i = 0; i < nz; i++) for (const s of [-1, 1]) m.cyl(D.marble, r, r * 1.1, col, 8, s * w * 0.44, pod, -d * 0.45 + i * d * 0.9 / (nz - 1));
    for (let i = 1; i < nx - 1; i++) for (const s of [-1, 1]) m.cyl(D.marble, r, r * 1.1, col, 8, -w * 0.44 + i * w * 0.88 / (nx - 1), pod, s * d * 0.45);
    m.box(D.marble, w * 0.96, att * 0.55, d * 0.97, 0, pod + col);
    m.box(D.marble, w * 0.8, att * 0.45, d * 0.85, 0, pod + col + att * 0.55);
    return m.build();
  },
  jefferson(h, w, d, M, D) {
    // Round Pantheon temple: circular podium, peristyle, low dome, a north portico
    const m = new LK.Massing();
    const R = Math.min(w, d) / 2, pod = h * 0.2, col = h * 0.38;
    m.cyl(D.marbleShade, R, R * 1.04, pod, 32);
    m.cyl(D.marbleShade, R * 0.62, R * 0.64, col, 24, 0, pod);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2;
      m.cyl(D.marble, R * 0.03, R * 0.034, col, 8, Math.cos(a) * R * 0.82, pod, Math.sin(a) * R * 0.82);
    }
    m.cyl(D.marble, R * 0.86, R * 0.86, col * 0.18, 32, 0, pod + col);
    m.add(D.domeWhite, new THREE.SphereGeometry(R * 0.66, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, pod + col * 1.18, 0, 0, 0, 0, 1, (h - pod - col * 1.18) / (R * 0.66), 1);
    m.box(D.marble, R * 0.7, col * 1.1, R * 0.5, 0, pod, -R * 0.95);
    return m.build();
  },
  white_house(h, w, d, M, D) {
    // Aquia sandstone painted white: the residence, the south portico (+Z), the north portico
    const m = new LK.Massing();
    const body = h * 0.82;
    m.box(D.domeWhite, w, body, d);
    m.box(D.roofLead, w * 0.96, h - body, d * 0.9, 0, body);
    m.cyl(D.domeWhite, d * 0.42, d * 0.42, body * 0.95, 20, 0, 0, d * 0.5);
    m.box(D.domeWhite, w * 0.2, body * 0.95, d * 0.25, 0, 0, -d * 0.6);
    return m.build();
  },
  castle(h, w, d, M, D) {
    // Red Seneca sandstone, Norman towers
    const m = new LK.Massing();
    const body = h * 0.45;
    m.box(D.sandstone, w, body, d * 0.6);
    m.box(D.sandstone, w * 0.25, body * 1.15, d * 0.95, -w * 0.2);
    m.box(D.sandstone, w * 0.06, h, w * 0.06, -w * 0.02, 0, -d * 0.25);
    m.box(D.sandstone, w * 0.08, h * 0.8, w * 0.08, w * 0.12, 0, d * 0.22);
    m.box(D.sandstone, w * 0.07, h * 0.7, w * 0.07, -w * 0.38, 0, 0);
    for (const s of [-1, 1]) m.add(D.roofLead, new THREE.ConeGeometry(w * 0.05, h * 0.18, 4), s * w * 0.46, body + h * 0.09, 0, Math.PI / 4);
    return m.build();
  },
  federal(h, w, d, M, D) {
    // Federal Triangle / Southwest block: a limestone body on a granite base,
    // a cornice, and (on the big ones) a red tile hipped roof
    const m = new LK.Massing();
    const roof = w * d > 300 ? h * 0.16 : 0, body = h - roof;
    m.box(D.granite, w, body * 0.12, d);
    m.box(D.limestone, w * 0.98, body * 0.88, d * 0.98, 0, body * 0.12);
    m.box(D.marbleShade, w * 1.01, body * 0.05, d * 1.01, 0, body * 0.95);
    // (a 4-sided frustum turned to the axes, then stretched to the block)
    if (roof) m.add(D.roofTile, new THREE.CylinderGeometry(Math.SQRT1_2 * 0.55, Math.SQRT1_2, roof, 4, 1).rotateY(Math.PI / 4), 0, body + roof / 2, 0, 0, 0, 0, w * 0.98, 1, d * 0.98);
    return m.build();
  },
  memorial(h, w, d, M, D) {
    // A small memorial or statue group: a granite plinth and a marble or bronze piece
    const m = new LK.Massing();
    m.box(D.granite, w, Math.min(h, 0.3), d);
    if (h > 0.6) m.box(h > 2 ? D.bronzeDark : D.marble, Math.min(w, d) * 0.35, h - 0.3, Math.min(w, d) * 0.35, 0, 0.3);
    return m.build();
  },
  museum(h, w, d, M, D) {
    // Beaux-Arts museum block: base, colonnade face, attic, a central dome where it is big
    const m = new LK.Massing();
    m.box(D.marble, w, h * 0.75, d);
    m.box(D.marbleShade, w * 0.92, h * 0.12, d * 0.92, 0, h * 0.75);
    if (w * d > 400) m.add(D.domeWhite, new THREE.SphereGeometry(Math.min(w, d) * 0.18, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, h * 0.87, 0, 0, 0, 0, 1, 0.7, 1);
    return m.build();
  },
};
const BUILDER_ALIASES = [
  ['monument', 'monument'], ['capitol', 'capitol'], ['lincoln', 'lincoln'], ['jefferson', 'jefferson'],
  ['white_house', 'white_house'], ['whitehouse', 'white_house'], ['castle', 'castle'], ['smithsonian_institution', 'castle'],
  ['museum', 'museum'], ['gallery', 'museum'], ['archives', 'museum'], ['nmah', 'museum'], ['nmai', 'museum'], ['nmnh', 'museum'],
  ['nasm', 'museum'], ['hirshhorn', 'museum'], ['arts_industries', 'castle'], ['freer', 'museum'], ['loc_', 'museum'], ['union_station', 'museum'],
  ['eeob', 'federal'], ['kennedy', 'federal'],
];
function _builderFor(id) {
  const s = String(id || '').toLowerCase();
  for (const [k, b] of BUILDER_ALIASES) if (s.includes(k)) return BUILDERS[b];
  return null;
}

// --------------- the builder ---------------
export function buildDc(scene, world, opts, K) {
  const L = _layout;
  if (!L) throw new Error('buildDc: layout not loaded (call loadLevelData first)');
  const M = LK.mats(), D = dcMats(M);
  const { ribbon, polygonGeom, quadAlong, pointInPoly, distToPolyline } = LK;
  const buildings = [];
  const grid = new K.BuildingGrid(60);
  const lite = !!opts.lite;
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  K.setBuildingLite(lite);
  const smallCull = glb && lite ? { px: 3, maxH: 2, keep: /tree|lamp/i } : null;
  const instance = () => K.instanceStaticClones(scene, !glb ? Infinity : lite ? 240 : 120, lite ? 185 : 150, smallCull);
  K.setBuildingTile(!glb || lite ? Infinity : 400);
  const B = L.bounds;
  const S = L.scale || 0.2;
  const cxB = (B.minX + B.maxX) / 2, czB = (B.minZ + B.maxZ) / 2;
  const animators = [];
  const makeParkTree = createDcTrees(K, lite, glb);
  K.onTemplatesReady((sc, get) => {
    for (const g of [..._kitDefs(), ...DC_LANDMARK_GLBS.filter((d) => d.ready).map((d) => ({ ...d, url: DC_BASE + d.file }))]) {
      get(g.url)?.traverse((o) => {
        if (!o.isMesh) return;
        // A model's own pool surface (the WWII Memorial's Rainbow Pool): the layout's water stands
        // there (hidden on the material, which the placed instances share with the template)
        if (/^water$/i.test(o.material?.name || '')) { o.material.visible = false; return; }
        for (const m of [].concat(o.material)) dcFacade(m, g.file);
      });
    }
  });
  const surfaceWear = configureChicagoWear(null, L.paths, lite);
  if (world) world.chicagoSurfaceWear = surfaceWear;
  animators.push({ update(dt, time) { tickDcMaterials(time); } });
  const SW_TILE = K.TILE.SIDEWALK, ASPHALT_TILE = 2;
  const MAJOR_W = 6.9, SIDEWALK_W = 1.2, PS = 0.8;
  const ring = opts.mode === 'wrestling' && L.ring ? L.ring : null;
  // A grandstand that would stand on a landmark (the Monument south of the
  // ring site) is left out; standing room takes that side (chicago_arena.js)
  const lmBox = (lm) => {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    return [lm.x, lm.z, (lm.w * c + lm.d * s) / 2, (lm.w * s + lm.d * c) / 2];
  };
  const STAND_REL = { n: [-42, 14, -76, -50], s: [-42, 42, 50, 76] }; // x0, x1, z0, z1 from the ring centre
  const standsFree = (id) => {
    const [x0, x1, z0, z1] = STAND_REL[id];
    return !L.landmarks.some((lm) => {
      if (lm.kind === 'prop' && lm.h < 4) return false; // small memorials and markers give way
      const [x, z, hw, hd] = lmBox(lm);
      return x + hw > ring.x + x0 && x - hw < ring.x + x1 && z + hd > ring.z + z0 && z - hd < ring.z + z1;
    });
  };
  if (ring) setArenaSite({ x: ring.x, z: ring.z, title: DC_TITLE, place: 'THE NATIONAL MALL', fountain: false, stands: ['n', 's'].filter(standsFree).join('') });
  const ringPoly = ring ? arenaNoTree() : null;
  // Landmarks only give way to the venue's structures: the mat, the entrance
  // gate's legs, the big screens, the grandstands built (from the ring centre,
  // chicago_arena.js; a corner clipped by under 1.5u stays), and small props inside the venue
  const VENUE_REL = [[-47.5, 47.5, -47.5, 47.5], [56, 70, -26, -12], [56, 70, 12, 26], [-56, -52, -46, -18], [-56, -52, 18, 46]];
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

  // ---- water: the Potomac edge, the Tidal Basin, the reflecting pools ----
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
  if (L.water.length) {
    const shore = [[], [], []], waterMeshes = [];
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
    const field = bakeShoreField(L.water, [], { x0: B.minX - 100, z0: B.minZ - 100, x1: B.maxX + 100, z1: B.maxZ + 100 });
    const waterMat = makeWaterMaterial(field);
    for (const wm of waterMeshes) wm.material = waterMat;
    const WU = waterUniforms(waterMat);
    animators.push({ update(dt, time) { WU.uTime.value = time; } });
    waterSplash = splashPool(scene, lite ? 200 : 600, lite ? 12 : 32);
    animators.push(waterSplash);
    const wfx = waterFX(waterMat, field, waterSplash, lite);
    animators.push(wfx);
    if (world) world.water = wfx;
  }
  const swMat = M.path;

  // ---- roads ----
  const roads = L.roads.filter((r) => !(lite && r.kind === 'alley'));
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
  const net = K.buildRoadNet(netRoads, 0.3);
  let roadMat = null;
  {
    const asphalt = roadMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    dcGround(asphalt, 'asphalt');
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

  // ---- parks: the Mall's lawn panels and elm rows, the memorial parks ----
  const onRoad = LK.roadIndex(roads, SIDEWALK_W, 2);
  const lmBoxes = L.landmarks.map((lm) => {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    return [lm.x, lm.z, (lm.w * c + lm.d * s) / 2 + 2, (lm.w * s + lm.d * c) / 2 + 2];
  });
  const noTree = ringPoly ? [ringPoly] : [];
  const onRing = (x, z) => !!ringPoly && pointInPoly(x, z, ringPoly);
  const onLandmark = (x, z) => lmBoxes.some(([lx, lz, hw, hd]) => Math.abs(x - lx) < hw && Math.abs(z - lz) < hd)
    || noTree.some((poly) => pointInPoly(x, z, poly));
  for (const q of L.paths) addBatch(ribbon(q.points, -Math.max(0.3, q.width / 2), Math.max(0.3, q.width / 2), 0.04), D.gravel);
  const treeOK = (x, z, poly) => (!poly || pointInPoly(x, z, poly)) && !isWater(x, z) && !onRoad(x, z, 1.2) && !onLandmark(x, z);
  let trees = 0;
  // (the surveyed trees: every elm and cherry, the rest thinned to the cap)
  const TREE_CAP = L.trees ? (!glb ? 700 : lite ? 1300 : 3200) : lite ? 260 : 900;
  const tree = (x, z, s, kind) => { if (trees < TREE_CAP) { scene.add(makeParkTree(x, z, s * PS, kind)); trees++; } };
  if (L.trees) {
    const special = L.trees.filter((t) => t[2] === 'elm' || t[2] === 'cherry'), other = L.trees.filter((t) => t[2] !== 'elm' && t[2] !== 'cherry');
    const room = Math.max(0, TREE_CAP - special.length), step = other.length > room ? other.length / Math.max(1, room) : 1;
    const list = [...special];
    for (let i = 0; i < other.length && list.length < TREE_CAP; i += step) list.push(other[Math.floor(i)]);
    const SIZE = { elm: [1.0, 0.18], cherry: [0.62, 0.12], park: [0.85, 0.35], street: [0.75, 0.2] };
    for (const [x, z, kind] of list) {
      if (isWater(x, z) || onRoad(x, z, 0.3) || onLandmark(x, z) || inRingBox(x, z)) continue;
      const [s0, sv] = SIZE[kind] || SIZE.park;
      tree(x, z, s0 + Math.random() * sv, kind === 'cherry' ? 'cherry' : 'elm');
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
    if (/national mall|^the mall/i.test(p.name) && x1 - x0 > z1 - z0) {
      // The Mall: an open lawn between two double rows of American elms and
      // the gravel walks under them, along both long edges
      for (const [edge, dir] of [[z0, 1], [z1, -1]]) {
        addBatch(ribbon([[x0 + 1, edge + dir * 4.2], [x1 - 1, edge + dir * 4.2]], -1.1, 1.1, 0.04), LK.decal(D.gravel, 1));
        for (const off of [2.2, 6.2]) {
          for (let x = x0 + 3; x < x1 - 2; x += lite ? 9 : 6) {
            const tx = x + (Math.random() - 0.5) * 0.6, tz = edge + dir * off;
            if (treeOK(tx, tz, p.polygon)) tree(tx, tz, 0.95 + Math.random() * 0.15);
          }
        }
      }
      continue;
    }
    // Other parks: a loose scatter, denser where it is woodland
    const step = (lite ? 16 : 11) * 0.7;
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (Math.random() < (p.kind === 'lawn' ? 0.8 : 0.55)) continue;
      const tx = x + (Math.random() - 0.5) * step * 0.7, tz = z + (Math.random() - 0.5) * step * 0.7;
      if (p.paths.some((q) => distToPolyline(tx, tz, q.points) < q.width / 2 + 2)) continue;
      if (treeOK(tx, tz, p.polygon)) tree(tx, tz, 0.9 + Math.random() * 0.5);
    }
  }

  // ---- buildings: federal and museum blocks from the kit ----
  const picked = new Map();
  const placeBlock = (o) => {
    const color = LK.facadeColor();
    const c = Math.abs(Math.cos(o.rotY || 0)), s = Math.abs(Math.sin(o.rotY || 0));
    const aw = o.w * c + o.d * s, ad = o.w * s + o.d * c;
    if (inRingBox(o.x, o.z, aw / 2, ad / 2)) return; // the Title Match venue stands here
    const url = _pickGeneric(o.h, null);
    if (!url) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { color, noDecor: true, noRoofProps: true, windows: { scale: 0.65, faces: lite ? 2 : 4, minH: 2.5 } });
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      return;
    }
    // Long low blocks (the federal stretch) split into lots ~1.5x their height
    if (!o.cell && o.h < 18) {
      const cell = Math.max(o.h * 1.5, 6);
      const nx = Math.min(4, Math.max(1, Math.round(o.w / cell))), nz = Math.min(4, Math.max(1, Math.round(o.d / cell)));
      if (nx * nz > 1) {
        const r = o.rotY || 0, cw = o.w / nx, cd = o.d / nz;
        const ax = [Math.cos(r), -Math.sin(r)], az = [Math.sin(r), Math.cos(r)];
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          if (nx >= 3 && nz >= 3 && i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
          const u = (i + 0.5) * cw - o.w / 2, v = (j + 0.5) * cd - o.d / 2;
          placeBlock({ ...o, cell: true, x: o.x + ax[0] * u + az[0] * v, z: o.z + ax[1] * u + az[1] * v, w: cw, d: cd, h: o.h * (0.9 + Math.random() * 0.2) });
        }
        return;
      }
    }
    const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
    b.layoutId = o.id;
    b._skipBodyIM = true;
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const cx = Math.floor(o.x / 24), cz = Math.floor(o.z / 24);
    const avoid = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const u of picked.get((cx + i) + ':' + (cz + j)) || []) avoid.add(u);
    const pick = _pickGeneric(o.h, avoid) || url;
    const k = cx + ':' + cz;
    if (!picked.has(k)) picked.set(k, []);
    picked.get(k).push(pick);
    const fill = o.h < 18;
    K.queueGLB({ url: pick, h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, pool: _bucketDefs(LK.bucket(o.h)).map((g) => g.url), stretch: 1.3, fill });
  };
  for (const o of L.buildings) if (!(lite && o.phoneSkip)) placeBlock(o);

  // ---- landmarks ----
  for (const lm of L.landmarks) {
    const c = Math.abs(Math.cos(lm.rotY || 0)), s = Math.abs(Math.sin(lm.rotY || 0));
    const aw = lm.w * c + lm.d * s, ad = lm.w * s + lm.d * c;
    if (onMat(lm.x, lm.z, aw / 2, ad / 2) || (lm.kind === 'prop' && lm.h < 4 && inRingBox(lm.x, lm.z))) { console.info('[dc] landmark inside the ring venue, left out:', lm.id); continue; }
    const hp = lm.hp || Math.max(120, Math.round(lm.h * 3 + lm.w * lm.d * 0.05));
    const b = new K.Building(lm.x, lm.z, aw, ad, lm.h, { skipWindows: true });
    b._skipBodyIM = true;
    b.maxHp = hp; b.hp = hp;
    b.landmarkId = lm.id;
    b.landmarkName = lm.name; // "THROUGH THE LINCOLN MEMORIAL!" (wrestling callouts)
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const def = _landmarkGLB(lm.id);
    if (def) {
      const h = lm.heightM ? lm.h * def.trueHeightM / lm.heightM : lm.h;
      const url = DC_BASE + def.file;
      const rotY = def.face ? LK.faceRot(lm.rotY || 0, def.face) : def.faceX ? LK.faceRot(lm.rotY || 0, def.faceX, true) : (lm.rotY || 0);
      if (def.exact) K.queueGLB({ url, h: def.trueHeightM * S, building: b, maxW: 0, maxD: 0, rotY, landmark: true, atOrigin: !!def.atOrigin });
      else if (def.fit === 'footprint') K.queueGLB({ url, h: lm.h * (def.maxH || 1.6), building: b, maxW: aw, maxD: ad, rotY, landmark: true, stretch: def.stretch || 1.3 });
      else K.queueGLB({ url, h, building: b, maxW: 0, maxD: 0, rotY, landmark: true });
      continue;
    }
    // Procedural massing until the GLB is ready
    const bld = _builderFor(lm.id);
    // (no alias: a memorial when the layout calls it a prop, else a federal block)
    const mesh = (bld || (lm.kind === 'prop' ? BUILDERS.memorial : BUILDERS.federal))(lm.h, lm.w, lm.d, M, D);
    mesh.userData.procedural = true;
    const pend = DC_LANDMARK_GLBS.find((g) => !g.ready && (g.ids ? g.ids.includes(lm.id) : g.id === lm.id));
    // (listed by the smoke test as pending, not failed: no DC landmark GLB is delivered yet)
    b.pendingGLB = pend ? pend.file : lm.id + ' (procedural)';
    mesh.position.set(lm.x, 0, lm.z);
    mesh.rotation.y = lm.rotY || 0;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
    b.customMesh = mesh;
  }

  // ---- the Washington Monument's circle of 50 flags (GLB tiers) ----
  const poles = L.detail?.monumentFlags?.poles;
  if (glb && poles?.length) {
    const ph = (L.detail.monumentFlags.poleHeightMetres || 7.6) * S;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.05, ph, 5).translate(0, ph / 2, 0), M.steel, poles.length);
    const flag = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.32, 0.5).translate(0, 0, 0.27), D.flag, poles.length);
    const dm = new THREE.Object3D();
    poles.forEach(([x, z], i) => {
      if (onRing(x, z)) { dm.scale.setScalar(0); } else dm.scale.setScalar(1);
      dm.position.set(x, 0, z); dm.rotation.set(0, 0.6, 0); dm.updateMatrix(); pole.setMatrixAt(i, dm.matrix);
      dm.position.set(x, ph - 0.2, z); dm.updateMatrix(); flag.setMatrixAt(i, dm.matrix);
    });
    for (const im of [pole, flag]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); }
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
    // The Washington globe lamp (Chicago's acorn GLB is that design), else the Tokyo kit lamp, else procedural
    const lampName = K.hasProp('dc_streetlamp') ? 'dc_streetlamp' : K.hasProp('chi_streetlamp') ? 'chi_streetlamp' : 'street_lamp';
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
    const sigName = K.hasProp('dc_traffic_signal') ? 'dc_traffic_signal' : 'chi_traffic_signal';
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
    const shelterName = K.hasProp('dc_bus_shelter') ? 'dc_bus_shelter' : 'chi_bus_shelter';
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

  // ---- distant backdrop: Arlington and Rosslyn west, the city north and east ----
  // One merged unlit mesh beyond the bounds, as Chicago's: low and mid-rise
  // stone and brick (the DC height limit), Rosslyn's towers across the river
  {
    const N = lite ? 90 : 220;
    const halfW = (B.maxX - B.minX) / 2, halfD = (B.maxZ - B.minZ) / 2;
    const BAY = 6, STOREYS = 8;
    const sunL = new THREE.Vector3(-0.4, 1.4, 0.6).normalize();
    const TINTS = [0xd9d3c4, 0xcbc3b0, 0xe2ddd2, 0x9a6a58, 0x8c7466, 0xb8b0a2, 0x7e8a96, 0xa9a297];
    const pos = [], uv = [], col = [], idx = [];
    const cc = new THREE.Color(), cTop = new THREE.Color(), nn = new THREE.Vector3();
    const addBox = (x, y0, z, w, h, d, ry, tint, roof) => {
      const cs = Math.cos(ry), sn = Math.sin(ry);
      const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y0 + ly, z - lx * sn + lz * cs];
      const hw = w / 2, hd = d / 2;
      const sides = [[[-hw, hd], [hw, hd], [0, 1], w], [[hw, hd], [hw, -hd], [1, 0], d], [[hw, -hd], [-hw, -hd], [0, -1], w], [[-hw, -hd], [-hw, hd], [-1, 0], d]];
      for (const [a, b, nl, fw] of sides) {
        nn.set(nl[0] * cs + nl[1] * sn, 0, -nl[0] * sn + nl[1] * cs);
        const shade = 0.62 + 0.38 * Math.max(0, nn.dot(sunL)) / 0.34;
        cc.copy(tint).multiplyScalar(Math.min(1, shade) * 0.86);
        const v = pos.length / 3, u0 = (x * 0.37 + z * 0.61) / BAY;
        for (const [lx, lz, ly, uu] of [[a[0], a[1], 0, 0], [b[0], b[1], 0, fw], [b[0], b[1], h, fw], [a[0], a[1], h, 0]]) {
          pos.push(...P(lx, ly, lz)); uv.push(u0 + uu / BAY, (y0 + ly) / STOREYS); col.push(cc.r, cc.g, cc.b);
        }
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
      cTop.copy(roof);
      const v = pos.length / 3;
      for (const [lx, lz] of [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]]) { pos.push(...P(lx, h, lz)); uv.push(0.5, 0.082); col.push(cTop.r, cTop.g, cTop.b); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    };
    for (let i = 0; i < N; i++) {
      // A band 60-300u outside the play rectangle on every side
      const a = Math.random() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const t = Math.min(halfW / Math.max(1e-3, Math.abs(ca)), halfD / Math.max(1e-3, Math.abs(sa)));
      const r = t + 60 + Math.random() * 240;
      const x = cxB + ca * r, z = czB + sa * r;
      if (isWater(x, z)) continue;
      const ry = Math.random() * Math.PI;
      const tint = new THREE.Color(TINTS[(Math.random() * TINTS.length) | 0]);
      const roof = tint.clone().lerp(new THREE.Color(0x8c8a86), 0.6).multiplyScalar(0.95);
      const west = x < B.minX; // Rosslyn and Crystal City across the river
      if (west && Math.random() < 0.4) {
        const h = 18 + Math.random() * 22, w = 8 + Math.random() * 6;
        addBox(x, 0, z, w, h, w * (0.8 + Math.random() * 0.4), ry, new THREE.Color([0x7e93a6, 0x5f6c78, 0xb7b0a6][(Math.random() * 3) | 0]), roof);
      } else if (Math.random() < 0.5) {
        const h = 6 + Math.random() * 6, w = 14 + Math.random() * 16, d = 10 + Math.random() * 12;
        addBox(x, 0, z, w, h, d, ry, tint, roof);
      } else {
        const h = 2.5 + Math.random() * 4, w = 12 + Math.random() * 16, d = 10 + Math.random() * 12;
        addBox(x, 0, z, w, h, d, ry, tint, roof);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const TS = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#e4e2dc'; g2.fillRect(0, 0, TS, TS);
    const rowH = TS / 10, bayW = TS / 6;
    for (let rI = 0; rI < 10; rI++) for (let bI = 0; bI < 6; bI++) {
      const k = 92 + Math.random() * 46;
      g2.fillStyle = `rgb(${k | 0},${(k + 8) | 0},${(k + 18) | 0})`;
      g2.fillRect(bI * bayW + 1.5, rI * rowH + 4.5, bayW - 3, rowH - 5.5);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: true }));
    mesh.frustumCulled = false;
    mesh.userData.backdrop = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
  }

  // ---- outer ground: a street grid from the map edge out to the backdrop ----
  {
    const T = 48, TS = 256, px = TS / T;
    const cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#5e5c58'; g2.fillRect(0, 0, TS, TS);
    for (const bz of [0, 24]) {
      const x0 = 2 * px, z0 = (bz + 2) * px, w = 44 * px, d = 20 * px;
      g2.fillStyle = '#b4b0a8'; g2.fillRect(x0, z0, w, d);
      g2.fillStyle = '#9a978f'; g2.fillRect(x0 + px, z0 + px, w - 2 * px, d - 2 * px);
      for (const side of [0, 1]) {
        let x = x0 + 1.5 * px;
        while (x < x0 + w - 4 * px) {
          const lw = (4 + Math.random() * 7) * px, ld = (5 + Math.random() * 3) * px;
          const k = 70 + Math.random() * 70, warm = Math.random() < 0.4 ? 18 : 0;
          g2.fillStyle = `rgb(${(k + warm) | 0},${(k + warm * 0.5) | 0},${k | 0})`;
          g2.fillRect(x, side ? z0 + d - 1.5 * px - ld : z0 + 1.5 * px, Math.min(lw, x0 + w - 1.5 * px - x), ld);
          x += lw + 0.6 * px;
        }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const G = GROUND / 2, RX0 = cxB - G, RX1 = cxB + G, RZ0 = czB - G, RZ1 = czB + G;
    const rects = [[RX0, B.minX, RZ0, RZ1], [B.maxX, RX1, RZ0, RZ1], [B.minX, B.maxX, RZ0, B.minZ], [B.minX, B.maxX, B.maxZ, RZ1]];
    const pos = [], uv = [], idx = [];
    for (const [x0, x1, z0, z1] of rects) {
      if (x1 <= x0 || z1 <= z0) continue;
      const v = pos.length / 3;
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) { pos.push(x, 0.03, z); uv.push(x / T, -z / T); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
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
    level: 'dc', bounds: { ...B }, center: { x: cxB, z: czB },
    spawn: { ...L.spawn }, isWater, barrier, landPoint: sidewalkPoint,
    mapWater: L.water.map((w) => ({ kind: w.kind, polygon: w.polygon, holes: w.holes })),
    enemySpawns: L.enemySpawns, duelSpawns: L.duel, soldierSpawn: L.soldier, ringSite: L.ring,
  };
}
