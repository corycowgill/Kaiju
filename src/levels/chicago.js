// Chicago downtown level: the Loop, the river, Grant / Millennium Park and the
// lakefront, built from assets/levels/chicago_layout.json (game units, +X east,
// +Z south). Reuses Tokyo's systems through the kit city.js passes in
// (Building, instanced GLB buildings + LOD, debris, cars, pedestrians, props);
// everything Chicago-specific (roads from polylines, lake, river walk, the L,
// bascule bridges, landmark massing, props) lives here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LAYOUT_URL = './assets/levels/chicago_layout.json';
let _layout = null;

/** Fetch the layout once (revalidated, so an updated JSON is picked up). */
export async function loadChicagoLayout() {
  if (_layout) return _layout;
  const r = await fetch(LAYOUT_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`chicago layout: HTTP ${r.status}`);
  _layout = _normalizeLayout(await r.json());
  return _layout;
}

// --------------- GLB assets (artist manifest) ---------------
// Mirrors SP/glb/manifest.json: id, file, trueHeightM, kind. Set ready: true
// only once the file is in assets/ and has passed preview, so missing files
// never 404; unready landmarks are built from the procedural massing below.
const CHI_BASE = './assets/buildings/chicago/';
const CHICAGO_LANDMARK_GLBS = [
  // { id: 'willis_tower', file: 'willis_tower.glb', trueHeightM: 527, ready: false },
];
// Generic downtown blocks, picked by height bucket like Tokyo's pools.
const CHICAGO_GENERIC_GLBS = [
  // { file: 'chi_limestone_mid_1.glb', bucket: 'medium', ready: false },
];
// Street props: name -> file under assets/props/chicago/.
const CHI_PROP_BASE = './assets/props/chicago/';
const CHICAGO_PROP_GLBS = [
  // { name: 'chi_bus_shelter', file: 'bus_shelter.glb', ready: false },
];
// Extra traffic (front faces +Z, real-world metres like the Tokyo vehicles).
const CHICAGO_VEHICLE_GLBS = [
  // { url: './assets/vehicles/cta_bus.glb', len: 12.2, weight: 10, parked: false, ready: false },
];
// Kit pieces placed many times: the generic bascule bridge (scaled to each
// bridges[] entry, spans along its local X) and the L track segment (tiled
// along elevatedRail; length along local `axis`, `len` metres).
const CHICAGO_KIT_GLBS = {
  bascule_bridge: { file: 'bascule_bridge.glb', ready: false },
  l_track_segment: { file: 'l_track_segment.glb', axis: 'x', len: 40, ready: false },
};
const _kit = (id) => (CHICAGO_KIT_GLBS[id]?.ready ? CHI_BASE + CHICAGO_KIT_GLBS[id].file : null);

// Tokyo generic towers used while (or where) no Chicago block GLB is ready:
// plain glass/concrete boxes, no Japanese signage.
const TOKYO_GENERIC = {
  tall: ['skyscraper_large_1', 'skyscraper_large_2', 'skyscraper_large_3', 'narrow_tall_1', 'narrow_tall_2'],
  medium: ['skyscraper_medium_1', 'skyscraper_medium_2', 'condo_1', 'condo_2'],
  short: ['shopping_1', 'shopping_2', 'shopping_3'],
};

const _landmarkGLB = (id) => CHICAGO_LANDMARK_GLBS.find((g) => g.ready && g.id === id);
function _pool(bucket) {
  const own = CHICAGO_GENERIC_GLBS.filter((g) => g.ready && g.bucket === bucket).map((g) => CHI_BASE + g.file);
  return own.length ? own : TOKYO_GENERIC[bucket].map((n) => `./assets/buildings/${n}.glb`);
}
const _bucket = (h) => (h >= 40 ? 'tall' : h >= 18 ? 'medium' : 'short');

/** Building GLB urls the Chicago level loads. */
export function chicagoBuildingGLBs() {
  return [
    ...CHICAGO_LANDMARK_GLBS.filter((g) => g.ready).map((g) => CHI_BASE + g.file),
    ...Object.keys(CHICAGO_KIT_GLBS).map(_kit).filter(Boolean),
    ..._pool('tall'), ..._pool('medium'), ..._pool('short'),
  ];
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
const KIT_IDS = new Set(['bascule_bridge', 'l_track_segment', 'l_track_curve', 'l_station', 'riverwalk', 'dusable_bridge']);

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
  out.roads = (L.roads || []).map((r) => ({
    id: r.id, name: r.name || '', kind: kindOf(r),
    width: +(r.width || (r.kind === 'lsd' ? 16 : r.kind === 'arterial' ? 12 : r.kind === 'alley' ? 4 : 9)),
    points: (r.points || r.polyline || []).map(_pt),
  })).filter((r) => r.points.length >= 2);
  // Car network: the explicit road graph when there is one (minor/service roads excluded)
  out.netRoads = L.roadGraph
    ? L.roadGraph.edges.filter((e) => e.class !== 'minor').map((e) => ({ width: +e.width, points: e.points.map(_pt) }))
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
    id: p.id, name: p.name || '', kind: p.kind || 'park',
    polygon: (p.polygon || p.points || []).map(_pt),
    paths: (p.paths || []).map((q) => ({ width: +(q.width || 2.4), points: (q.points || q).map(_pt) })),
  })).filter((p) => p.polygon.length >= 3);
  out.rail = [].concat(L.elevatedRail || L.rail || []).map((r) => ({
    id: r.id, name: r.name || '', closed: !!r.closed, height: +(r.height || 5.5), width: +(r.width || 6.4),
    points: (r.points || r.polyline || []).map(_pt),
  })).filter((r) => r.points.length >= 2);
  out.stations = (L.railStations || []).map((st) => ({ x: +st.x, z: +st.z, rotY: +(st.rot || 0), length: +(st.length || 20) }));
  // Bridge length runs along the local X axis of rot (same convention as building w)
  out.bridges = (L.bridges || []).map((g) => ({
    id: g.id, name: g.name || '', x: +(g.x ?? g.pos?.[0]), z: +(g.z ?? g.pos?.[1]),
    rotY: g.rot !== undefined ? +g.rot + Math.PI / 2 : +(g.rotY || 0),
    length: +(g.length || 30), width: +(g.width || 12), carries: g.carries || 'road',
  }));
  const lmIds = new Set((L.landmarks || []).map((l) => l.id));
  out.buildings = (L.buildings || [])
    .filter((o) => !(o.landmark && lmIds.has(o.landmark))) // the landmark itself stands there
    .map((o) => {
      const r = o.cx !== undefined ? { x: +o.cx, z: +o.cz, w: +o.w, d: +o.d, rotY: +(o.rot || 0) } : _rect(o);
      return { ...r, h: +(o.h ?? o.height ?? 12), style: o.style || null };
    })
    .filter((o) => o.w > 0.5 && o.d > 0.5 && o.h > 0.5);
  out.landmarks = (L.landmarks || []).filter((o) => !KIT_IDS.has(o.id)).map((o) => ({
    ...(o.rot !== undefined ? { x: +o.x, z: +o.z, w: +o.w, d: +o.d, rotY: +o.rot } : _rect(o)),
    id: o.id, name: o.name || o.id, h: +(o.h ?? o.height ?? 30), hp: o.hp, kind: o.kind || 'building',
  }));
  return out;
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

// --------------- materials (shared by every rebuilt Chicago city) ---------------
let _M = null;
function mats() {
  if (_M) return _M;
  const std = (color, roughness = 0.8, metalness = 0.05, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  _M = {
    limestone: std(0xcbbd9f, 0.85), brick: std(0x8c4f3c, 0.9), terracotta: std(0xe2d6c2, 0.7),
    darkGlass: std(0x1d242c, 0.25, 0.75), blueGlass: std(0x5f7f99, 0.2, 0.8), silverGlass: std(0x9aa8b4, 0.22, 0.85),
    blackSteel: std(0x17191c, 0.45, 0.6), steel: std(0x8a9096, 0.4, 0.7), white: std(0xe9e7e2, 0.6),
    concrete: std(0xb3ada3, 0.9), bronze: std(0x6e5432, 0.5, 0.6), copper: std(0x5f9c86, 0.6, 0.4),
    chrome: std(0xd8dde2, 0.05, 1.0), red: std(0xb3262a, 0.6), green: std(0x3d7a35, 0.95),
    beacon: std(0xff3344, 0.5, 0, { emissive: 0xff3344, emissiveIntensity: 2.4 }),
    warmLit: std(0x443322, 0.5, 0, { emissive: 0xffcc88, emissiveIntensity: 1.6 }),
    marquee: std(0xaa2222, 0.5, 0, { emissive: 0xff5533, emissiveIntensity: 1.8 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1a5276, roughness: 0.08, metalness: 0.7, emissive: 0x0a2e42, emissiveIntensity: 0.25 }),
    lake: new THREE.MeshStandardMaterial({ color: 0x24607e, roughness: 0.1, metalness: 0.65, emissive: 0x0c3448, emissiveIntensity: 0.25 }),
    wall: std(0x6a6862, 0.9), grass: std(0x4a7a33, 0.95), lawn: std(0x5b8a3c, 0.95), path: std(0xb8ad92, 0.95),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xd9a820, emissiveIntensity: 0.3, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }),
    whiteLine: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }),
    curb: std(0x3a3a3c, 1.0), lot: std(0x6c6a66, 0.95),
    trainBody: std(0xb9bec4, 0.35, 0.8), trainWin: std(0x223344, 0.3, 0.2, { emissive: 0xffe2aa, emissiveIntensity: 0.9 }),
    trainStripe: std(0x2a4a9a, 0.5, 0.3), railSteel: std(0x3d3226, 0.8, 0.5), deck: std(0x4a4038, 0.85, 0.4),
    bridgeRed: std(0x7a2a24, 0.7, 0.3), bridgeGrey: std(0x5c6066, 0.6, 0.5),
    hull: std(0xf0f0ee, 0.5), hullDark: std(0x24384e, 0.6), canvas: std(0x2b4f7a, 0.8),
    fountain: std(0xd8b7a6, 0.7), fountainWater: std(0x9fd4ea, 0.1, 0.3, { emissive: 0x6fb8d8, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }),
    glassShelter: std(0x9fc2cc, 0.1, 0.4, { transparent: true, opacity: 0.45 }),
    cartYellow: std(0xf0b81e, 0.6), umbrella: std(0xd23a2a, 0.8),
    seawall: std(0x9a958a, 0.9), sand: std(0xd8c79a, 1.0),
  };
  for (const m of Object.values(_M)) m.userData.shared = true;
  return _M;
}

// Chicago facade palette for procedural blocks: limestone, brick, dark glass, art-deco
const FACADE = [0xcbbd9f, 0xb9a98a, 0x8c4f3c, 0x7a4636, 0x2c333b, 0x3a4652, 0xb79b6c, 0xd9cdb4, 0x9a8f80];
// Window palette (procedural blocks): warm office light, no synthwave neon
const CHI_WINDOWS = [
  { name: 'off',   color: 0x1a2028, emissive: 0x000000, intensity: 0.0, weight: 0.45 },
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
    const m = new Massing();
    m.box(M.limestone, w, h * 0.75, d);
    m.add(M.limestone, new THREE.CylinderGeometry(0.1, w * 0.3, h * 0.15, 4), 0, h * 0.825, 0, Math.PI / 4, 0, 0, 1, 1, d / w);
    for (let k = 0; k < 6; k++) m.cyl(M.white, 0.45, 0.45, h * 0.55, 8, (k - 2.5) * w * 0.09, 0, d * 0.48);
    for (const sx of [-1, 1]) m.box(M.bronze, 1.4, 1.2, 2.6, sx * w * 0.3, 0, d * 0.62);
    return m.build();
  },
  chicago_theatre(h, w, d, M) {
    const m = new Massing();
    m.box(M.terracotta, w, h * 0.7, d);
    m.box(M.marquee, w * 0.9, h * 0.08, 2.4, 0, h * 0.12, d * 0.5 + 1.2);
    m.box(M.marquee, 1.2, h * 0.6, 1.2, 0, h * 0.25, d * 0.5 + 0.8);
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
  const glb = opts.glb !== undefined ? !!opts.glb : !lite;
  K.setBuildingLite(lite);
  const B = L.bounds;
  const animators = [];
  const STREET_TILE = K.TILE.STREET, SW_TILE = K.TILE.SIDEWALK;
  // Real-scale map: narrower sidewalks, smaller markings and street furniture
  const REAL = L.real;
  const SIDEWALK_W = REAL ? 1.2 : 3.0;
  const PS = REAL ? 0.6 : 1; // street-prop scale

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
    const gm = K.groundMaps();
    const groundGeom = new THREE.PlaneGeometry(1600, 1600, 1, 1);
    const ground = new THREE.Mesh(groundGeom, new THREE.MeshStandardMaterial({
      ...gm, normalScale: new THREE.Vector2(1.2, 1.2), aoMapIntensity: 0.6, roughness: 0.95, color: 0x8f8a82,
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
    const onEdge = (p) => p[0] >= B.maxX - 0.5 || p[0] <= B.minX + 0.5 || p[1] <= B.minZ + 0.5 || p[1] >= B.maxZ - 0.5;
    for (const w of L.water) {
      const wm = new THREE.Mesh(polygonGeom(w.polygon, w.kind === 'pond' ? 0.08 : 0.2, 1, w.holes), w.kind === 'lake' ? M.lake : M.water);
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
    }
  }
  const sidewalkMat = (rep) => new THREE.MeshStandardMaterial({
    map: K.loadTileTex('sidewalk_color.jpg', rep, rep), normalMap: K.loadDataTex('sidewalk_normal.jpg', rep, rep),
    normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: K.loadDataTex('sidewalk_roughness.jpg', rep, rep),
    aoMap: K.loadDataTex('sidewalk_ao.jpg', rep, rep), aoMapIntensity: 0.8, roughness: 0.9, color: 0xc4bfb6,
  });
  const swMat = sidewalkMat(1);
  if (L.riverwalk.length) {
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
  {
    const asphalt = new THREE.MeshStandardMaterial({
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
    for (const r of roads) addBatch(ribbon(r.points, -r.width / 2, r.width / 2, 0.05, uvs), asphalt);
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
    const jp = [], ju = [], ji = [];
    net.nodes.forEach((n, i) => {
      if (n.edges.length < 3) return;
      const e = net.edges[n.edges[0]];
      quadAlong(jp, ju, ji, n.x, n.z, e.dx, e.dz, nodeW[i] + 0.6, nodeW[i] + 0.6, 0.06);
    });
    if (jp.length) {
      const g = _geom(jp, ju, ji);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * uvs, p.getZ(i) * uvs);
      addBatch(g, asphalt);
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
  K.setCarNet(net);

  // ---- parks ----
  for (const p of L.parks) {
    // Under the road layer (0.05): streets crossing a park stay on top
    addBatch(polygonGeom(p.polygon, 0.03), p.kind === 'plaza' ? M.lot : p.kind === 'beach' ? M.sand : p.kind === 'lawn' ? M.lawn : M.grass);
    for (const q of p.paths) addBatch(ribbon(q.points, -q.width / 2, q.width / 2, 0.04), M.path);
    // Trees: jittered grid inside the polygon, away from paths and water
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const step = (lite ? 16 : 11) * (REAL ? 0.7 : 1);
    if (p.kind === 'plaza' || p.kind === 'beach') continue;
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      if (Math.random() < (p.kind === 'lawn' ? 0.8 : 0.55)) continue;
      const tx = x + (Math.random() - 0.5) * step * 0.7, tz = z + (Math.random() - 0.5) * step * 0.7;
      if (!pointInPoly(tx, tz, p.polygon) || isWater(tx, tz)) continue;
      if (p.paths.some((q) => distToPolyline(tx, tz, q.points) < q.width / 2 + 2)) continue;
      if (roads.some((r) => distToPolyline(tx, tz, r.points) < r.width / 2 + SIDEWALK_W + 1.5)) continue;
      scene.add(K.makeTree(tx, tz, (0.9 + Math.random() * 0.5) * PS));
    }
  }

  // ---- buildings ----
  const placeBlock = (o) => {
    const color = FACADE[Math.floor(Math.random() * FACADE.length)];
    // AABB of the (possibly rotated) footprint: collision and AOE use axis-aligned w/d
    const c = Math.abs(Math.cos(o.rotY || 0)), s = Math.abs(Math.sin(o.rotY || 0));
    const aw = o.w * c + o.d * s, ad = o.w * s + o.d * c;
    // Low-rise (and the procedural-only tier) stays a coloured box in the one
    // global body InstancedMesh: a 12k-tri GLB on every 3-storey shop blew the
    // triangle budget
    if (!glb || o.h < (REAL ? (lite ? 12 : 7) : 0)) {
      const b = new K.Building(o.x, o.z, aw, ad, o.h, { color, noDecor: true });
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      return;
    }
    const b = new K.Building(o.x, o.z, aw, ad, o.h, { skipWindows: true, color });
    b._skipBodyIM = true;
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    const pool = _pool(_bucket(o.h));
    K.queueGLB({ url: pool[Math.floor(Math.random() * pool.length)], h: o.h, building: b, maxW: aw, maxD: ad, rotY: o.rotY || 0, pool });
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
    const def = glb ? _landmarkGLB(lm.id) : null;
    if (def) {
      // Exact layout height: no footprint clamp (maxW/maxD 0)
      K.queueGLB({ url: CHI_BASE + def.file, h: lm.h, building: b, maxW: 0, maxD: 0, rotY: lm.rotY || 0, landmark: true });
      continue;
    }
    const mesh = _builderFor(lm.id)(lm.h, lm.w, lm.d, M);
    mesh.position.set(lm.x, 0, lm.z);
    mesh.rotation.y = lm.rotY || 0;
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
  const bridgeGLB = glb ? _kit('bascule_bridge') : null;
  if (bridgeGLB) {
    // Instanced GLB bridges: fitted inside each bridge's footprint (uniform
    // scale), destructible like any instanced GLB building
    for (const br of L.bridges) {
      const c = Math.abs(Math.cos(br.rotY)), s = Math.abs(Math.sin(br.rotY));
      const aw = br.width * c + br.length * s, ad = br.width * s + br.length * c;
      const b = new K.Building(br.x, br.z, aw, ad, 3, { skipWindows: true });
      b._skipBodyIM = true;
      b.maxHp = b.hp = 120;
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
      // The GLB spans along local X; rotY here is the template-Z convention
      K.queueGLB({ url: bridgeGLB, h: 50, building: b, maxW: aw, maxD: ad, rotY: br.rotY - Math.PI / 2, landmark: true });
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
      b.customMesh = new THREE.Object3D(); // scene-less marker: hit-tested by its AABB
      b._glbSlots = ims.map((im) => ({ im, idx: i }));
      b.group.matrixAutoUpdate = false; b.group.updateMatrix();
      scene.add(b.group); buildings.push(b); grid.add(b);
    });
    for (const im of ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); }
  }

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
  const tiledRail = (tpl) => {
    // One InstancedMesh per template mesh; each tile stretched to divide its
    // straight run exactly and scaled so the deck top sits at the line height
    const def = CHICAGO_KIT_GLBS.l_track_segment;
    tpl.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tpl);
    const size = box.getSize(new THREE.Vector3());
    const alongX = def.axis !== 'z';
    const rawLen = alongX ? size.x : size.z, rawW = alongX ? size.z : size.x;
    const tiles = [];
    for (const r of L.rail) {
      const pts = railPts(r);
      const sy = r.height / size.y, sw = r.width / rawW;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 0.2) continue;
        const n = Math.max(1, Math.round(l / (def.len * (L.scale || 0.2))));
        const dx = (bx - ax) / l, dz = (bz - az) / l;
        // Local length axis -> segment direction
        const ry = alongX ? Math.atan2(-dz, dx) : Math.atan2(dx, dz);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) * l / n;
          tiles.push({ x: ax + dx * t, z: az + dz * t, ry, sl: l / n / rawLen, sy, sw });
        }
      }
    }
    const meshes = [];
    tpl.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), off = new THREE.Matrix4();
    // Template origin: bottom centre of its bbox
    off.makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    for (const src of meshes) {
      const im = new THREE.InstancedMesh(src.geometry, src.material, tiles.length);
      const local = new THREE.Matrix4().multiplyMatrices(off, src.matrixWorld);
      tiles.forEach((t, i) => {
        const sc = alongX ? new THREE.Vector3(t.sl, t.sy, t.sw) : new THREE.Vector3(t.sw, t.sy, t.sl);
        m.compose(new THREE.Vector3(t.x, 0, t.z), q.setFromAxisAngle(up, t.ry), sc);
        im.setMatrixAt(i, m.multiply(local));
      });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
  };
  const trackGLB = glb ? _kit('l_track_segment') : null;
  if (trackGLB) {
    K.onTemplatesReady((sc, get) => {
      const tpl = get(trackGLB);
      if (tpl) tiledRail(tpl);
      else { proceduralRail(); K.mergeStaticMeshes(scene); }
    });
  } else {
    proceduralRail();
  }
  {
    // Trains on the longest lines (two on phones)
    let trains = 0;
    for (const r of L.rail) {
      const pts = railPts(r);
      const len = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
      if (len > 60 && trains < (lite ? 2 : 5)) {
        trains++;
        animators.push(makeTrain(scene, world, pts, r.height + 0.05, M, r.width));
      }
    }
    // Stations: platform slabs with a canopy either side of the deck
    if (L.stations.length) {
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
    const hasLamp = K.hasProp('street_lamp');
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
        if (isWater(x, z)) continue;
        const lamp = hasLamp ? K.cloneProp('street_lamp', 5.6 * PS) : makeChiLamp();
        if (!hasLamp) lamp.scale.setScalar(PS);
        lamp.position.set(x, 0, z);
        lamp.rotation.y = Math.atan2(e.dx, e.dz) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
        lamp.matrixAutoUpdate = false; lamp.updateMatrix();
        lamp.userData.instance = true;
        scene.add(lamp);
        // Sidewalk trees on the other side, sparser
        if (!lite && Math.random() < 0.45) {
          const tx = net.nodes[e.a].x + e.dx * (t + lampEvery / 2) + e.dz * off, tz = net.nodes[e.a].z + e.dz * (t + lampEvery / 2) - e.dx * off;
          if (t + lampEvery / 2 < e.len - 6 && !isWater(tx, tz)) scene.add(K.makeTree(tx, tz, (0.75 + Math.random() * 0.3) * PS));
        }
      }
    }
    // Traffic signals on one corner of every 4-way junction
    if (K.hasProp('traffic_signal')) {
      // Major 4-way junctions, at least 30u apart, capped per tier
      const placed = [];
      const cap = lite ? 30 : 70;
      for (const node of net.nodes) {
        if (node.edges.length < 4 || placed.length >= cap) continue;
        const e = net.edges[node.edges[0]];
        const w = e.laneOff * 4;
        if (w < lampMinW || placed.some(([x, z]) => Math.abs(x - node.x) < 30 && Math.abs(z - node.z) < 30)) continue;
        placed.push([node.x, node.z]);
        const sig = K.cloneProp('traffic_signal', 6.4 * PS);
        const co = w / 2 + SIDEWALK_W * 0.7;
        sig.position.set(node.x + (e.dx - e.dz) * co, 0, node.z + (e.dz + e.dx) * co);
        sig.rotation.y = Math.atan2(e.dx, e.dz) + Math.PI;
        sig.matrixAutoUpdate = false; sig.updateMatrix();
        sig.userData.instance = true;
        scene.add(sig);
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
      if (isWater(x, z)) continue;
      const shelter = i < shelterN;
      const glbName = shelter ? 'chi_bus_shelter' : 'chi_hot_dog_cart';
      const p = K.hasProp(glbName) ? K.cloneProp(glbName, (shelter ? 2.6 : 3.4) * PS) : (shelter ? makeBusShelter() : makeHotDogCart());
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
  for (const r of rivers) animators.push(makeRiverBoats(scene, r, lite ? 2 : 4, PS));
  if (lakes.length) {
    for (let i = 0; i < (lite ? 5 : 12); i++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = B.minX + Math.random() * (B.maxX - B.minX), z = B.minZ + Math.random() * (B.maxZ - B.minZ);
        // Open water at least 8u from any shore
        if (!isWater(x, z) || !isWater(x + 8, z) || !isWater(x - 8, z) || !isWater(x, z + 8) || !isWater(x, z - 8)) continue;
        if (!lakes.some((w) => pointInPoly(x, z, w.polygon))) continue;
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

  K.instanceStaticClones(scene);
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
  };
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
function makeTrain(scene, world, pts, y, M, trackW = 6.4) {
  const path = pathSampler(pts);
  // Sized to the track: one car is ~0.4 track widths wide (two tracks)
  const k = trackW / 6.4;
  const CARS = 4, CAR_L = 10 * k, GAP = 0.8 * k;
  const P = propKit();
  P.trainBody = P.trainBody || new THREE.BoxGeometry(2.6, 2.6, 10);
  P.trainWin = P.trainWin || new THREE.BoxGeometry(2.66, 0.7, 8.6);
  P.trainStripe = P.trainStripe || new THREE.BoxGeometry(2.64, 0.25, 10);
  for (const g of [P.trainBody, P.trainWin, P.trainStripe]) g.userData.shared = true;
  const lane = trackW * 0.25; // runs on the right-hand track
  const fleet = makeFleet(scene, [
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
function makeRiverBoats(scene, r, n, ps = 1) {
  const P = propKit();
  const M = P.M;
  const s = 1.8 * ps;
  const fleet = makeFleet(scene, [
    { geom: P.hull, mat: M.hullDark, m: _local(0, 0.4 * s, 0, s, s, s) },
    { geom: P.bow, mat: M.hullDark, m: _local(0, 0.4 * s, 5 * s, s, s, s * 0.5, Math.PI / 2, Math.PI / 4) },
    { geom: P.canopy, mat: M.canvas, m: _local(0, 2.6 * s / 1.8, 0, s, s, s) },
  ], n);
  const path = pathSampler(r.points);
  const boats = [];
  for (let i = 0; i < n; i++) boats.push({ d: (i + 0.5) / n * path.total, dir: i % 2 ? 1 : -1, ph: i * 2.3 });
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
