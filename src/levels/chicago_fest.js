// Kaijupalooza!: the summer music festival in Grant Park (Chicago level).
// Cartographer's layout (assets/levels/chicago_fest.json: fence ring, closed
// roads, 91 items with x, z, rot, w, d, h; front = local +Z) placed with the
// artist's GLBs as ordinary destructible buildings: stages, gates, tents,
// towers and the fence (instanced panels, one building per ~10u run). On
// top: trampled crowd lawns full of instanced festival-goers, KAIJUPALOOZA!
// sign panels, animated LED walls and stage light beams.
// Off by default until every festival GLB has landed (no placeholder boxes
// in a shipped build); ?fest=1 turns it on, ?fest=0 off. Flip FEST_DEFAULT
// to true in the commit that adds the last fest_* GLB.
import * as THREE from 'three';
import { assetURL } from '../assetCache.js';

const FEST_URL = './assets/levels/chicago_fest.json';
const FEST_BASE = './assets/buildings/chicago/';
const TEX_BASE = './assets/textures/';

const FEST_DEFAULT = true;
export function festEnabled() {
  try {
    const q = new URLSearchParams(location.search).get('fest');
    return q === null ? FEST_DEFAULT : q !== '0';
  } catch (e) { return FEST_DEFAULT; }
}

// Artist GLBs (front = local +Z). sizeM: the model's true w x d x h in metres
// (reference notes), for tiling before the template is parsed. ready: the
// file (and its _lod1 twin) is in assets/; until then a box stands in and
// smoke_test lists the piece as pending.
const FEST_MODELS = {
  main_stage: { file: 'fest_main_stage.glb', sizeM: [63, 25.4, 25.3], ready: true },
  side_stage: { file: 'fest_side_stage.glb', sizeM: [29.8, 16.4, 13.7], ready: true },
  tent_stage: { file: 'fest_tent_stage.glb', sizeM: [30, 25, 15], ready: true },
  // signAspect: the sign_panel's true w / h where its bbox misleads (the
  // gate's strip follows the curved arch: 13.2 x 2 m)
  entry_gate: { file: 'fest_entry_gate.glb', sizeM: [20, 6, 10], signAspect: 6.6, ready: true },
  fence_panel: { file: 'fest_fence_panel.glb', sizeM: [3.5, 0.22, 2.4], ready: true },
  vendor_tent: { file: 'fest_vendor_tent.glb', sizeM: [9, 3, 3.5], ready: true },
  porta_potty_bank: { file: 'fest_porta_potty_bank.glb', sizeM: [7.6, 1.4, 2.34], ready: true },
  delay_tower: { file: 'fest_delay_tower.glb', sizeM: [5.4, 2.6, 12.8], ready: true },
  vip_deck: { file: 'fest_vip_deck.glb', sizeM: [23.6, 7.2, 8.1], ready: true },
  led_wall: { file: 'fest_led_wall.glb', sizeM: [14.4, 4.2, 18.4], ready: true },
  foh_tower: { file: 'fest_foh_tower.glb', sizeM: [10.6, 8.6, 7.05], ready: true },
  trailer: { file: 'fest_trailer.glb', sizeM: [12, 3.6, 4.4], ready: true },
};
const _ready = (id) => !!FEST_MODELS[id]?.ready;

// Until a model is delivered, its kind is built from the published props
// instead (never a box): [model, u, v, w, d, h] with u, v the part's centre
// and w, d, h its fit box as fractions of the item's w, d, h (front +Z);
// h-only parts (towers, w = 0) fit by height. The first part carries the
// stage's name board and lights.
const STAGE_KIT = [
  ['vip_deck', 0, 0.12, 0.62, 0.75, 0.34],
  ['led_wall', 0, -0.3, 0.42, 0.3, 0.95],
  ['led_wall', -0.4, 0.12, 0.17, 0.25, 0.72],
  ['led_wall', 0.4, 0.12, 0.17, 0.25, 0.72],
  ['delay_tower', -0.48, -0.32, 0, 0, 1],
  ['delay_tower', 0.48, -0.32, 0, 0, 1],
];
const STANDIN = {
  main_stage: STAGE_KIT, side_stage: STAGE_KIT, tent_stage: STAGE_KIT,
  // Gate: two truss towers carrying a KAIJUPALOOZA! banner, bag-check tents between
  entry_gate: [
    ['delay_tower', -0.46, 0, 0, 0, 1],
    ['delay_tower', 0.46, 0, 0, 0, 1],
    ['vendor_tent', -0.2, 0.15, 0.32, 0.7, 0.4],
    ['vendor_tent', 0.2, 0.15, 0.32, 0.7, 0.4],
  ],
};

// Layout kind -> model candidates (first ready one wins, else the first is
// the pending stand-in) and how it fills the item's box: 'fit' scales one
// model into w x d x h; 'tile' repeats it at true size along w (rows along d)
const KINDS = {
  stage: { models: (it) => [it.id === 'tremor_tent' ? 'tent_stage' : it.tier === 'main' ? 'main_stage' : 'side_stage'], mode: 'fit', color: 0xd23c8c },
  screen: { models: () => ['led_wall', 'delay_tower'], mode: 'fit', color: 0x222428 },
  foh_tower: { models: () => ['foh_tower', 'vip_deck'], mode: 'fit', color: 0x3a3a44 },
  delay_tower: { models: () => ['delay_tower'], mode: 'fit', color: 0x5a5a66, fitH: true }, // the boom overhangs its 3 m box
  gate: { models: () => ['entry_gate'], mode: 'tile', color: 0xf0a020 },
  production: { models: () => ['trailer', 'vendor_tent'], mode: 'tile', color: 0x8a8a90 },
  vip: { models: () => ['vip_deck'], mode: 'tile', color: 0x7a3cc8 },
  food: { models: () => ['vendor_tent'], mode: 'tile', color: 0xf07030 },
  vendor: { models: () => ['vendor_tent'], mode: 'tile', color: 0x30b0a0 },
  merch: { models: () => ['vendor_tent'], mode: 'tile', color: 0xe0c030 },
  bar: { models: () => ['vendor_tent'], mode: 'tile', color: 0xd04070 },
  family: { models: () => ['side_stage'], mode: 'fit', color: 0x50c050, maxHM: 9 },
  first_aid: { models: () => ['vendor_tent'], mode: 'tile', color: 0xf4f4f4 },
  water: { models: () => ['vendor_tent'], mode: 'tile', color: 0x3080e0 },
  toilets: { models: () => ['porta_potty_bank'], mode: 'tile', color: 0x3070c0 },
  ops: { models: () => ['trailer', 'vendor_tent'], mode: 'tile', color: 0x606068 },
};
const _model = (it) => {
  const c = KINDS[it.kind]?.models(it) || [];
  return c.find(_ready) || c[0] || null;
};

/** GLB urls the festival needs (ready models only; [] when it's off). */
export function festBuildingGLBs() {
  if (!festEnabled()) return [];
  return Object.values(FEST_MODELS).filter((m) => m.ready).map((m) => FEST_BASE + m.file);
}

/** Fetch and normalise the festival layout; null when off or missing. */
export async function loadFest() {
  if (!festEnabled()) return null;
  try {
    const r = await fetch(FEST_URL, { cache: 'no-cache' });
    if (!r.ok) return null;
    const J = await r.json();
    const pt = (p) => [+p[0], +p[1]];
    return {
      fence: (J.fence?.points || []).map(pt),
      fenceH: +(J.fence?.height || 0.48),
      closed: (J.closedRoads || []).map((r) => r.points.map(pt)),
      items: (J.items || []).map((it) => ({
        ...it, x: +it.x, z: +it.z, rot: +(it.rot || 0), w: +it.w, d: +it.d, h: +it.h,
        crowdArea: it.crowdArea ? it.crowdArea.map(pt) : null,
      })),
    };
  } catch (e) { return null; }
}

function _inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function _distToRing(x, z, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Keep the fence 1.5u inside the open streets around it (the gameplay
 *  ribbons are wider than the kerbs the layout follows, e.g. Michigan):
 *  the ring is resampled every 4u and each point pushed off any road whose
 *  centreline runs outside the fence. Once per layout. */
export function festClearFence(F, roads) {
  if (F._cleared) return;
  F._cleared = true;
  const ring = [];
  for (let i = 0; i < F.fence.length; i++) {
    const a = F.fence[i], b = F.fence[(i + 1) % F.fence.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.2) continue;
    const n = Math.max(1, Math.ceil(l / 4));
    for (let k = 0; k < n; k++) ring.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  const orig = F.fence;
  // Road segments in their original scan order, bucketed on a grid. A segment
  // only acts on p when p is within its need (half width + 1.5u), so a pass
  // tests the segments near p's position at the start of the pass, in the
  // same order; if p is pushed further than SLACK from there, the rest of
  // the pass falls back to the full scan. Same pushes, same order: identical.
  const segs = [];
  let needMax = 0;
  for (const r of roads) {
    needMax = Math.max(needMax, r.width / 2 + 1.5);
    for (let i = 0; i + 1 < r.points.length; i++) segs.push(r, i);
  }
  const C = 16, SLACK = 8, cells = new Map();
  for (let g = 0; g < segs.length; g += 2) {
    const r = segs[g], i = segs[g + 1];
    const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1], R = needMax + SLACK;
    for (let cx = Math.floor((Math.min(ax, bx) - R) / C); cx <= Math.floor((Math.max(ax, bx) + R) / C); cx++) {
      for (let cz = Math.floor((Math.min(az, bz) - R) / C); cz <= Math.floor((Math.max(az, bz) + R) / C); cz++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let l = cells.get(k);
        if (!l) cells.set(k, l = []);
        l.push(g);
      }
    }
  }
  for (const p of ring) {
    for (let pass = 0; pass < 6; pass++) { // corners: two streets push in turn
      const sx = p[0], sz = p[1];
      const near = cells.get(Math.floor(sx / C) * 73856093 ^ Math.floor(sz / C) * 19349663) || [];
      let full = -1; // segs index to resume a full scan from (p moved past SLACK)
      for (let n = 0; ; n++) {
        let g;
        if (full < 0) {
          if (n >= near.length) break;
          g = near[n];
        } else {
          g = full; full += 2;
          if (g >= segs.length) break;
        }
        const r = segs[g], i = segs[g + 1];
        {
          const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2));
          const nx = ax + dx * t, nz = az + dz * t;
          const d = Math.hypot(p[0] - nx, p[1] - nz), need = r.width / 2 + 1.5;
          if (d >= need || _inPoly(nx, nz, orig)) continue; // clear, or a street inside the fence
          // Away from the centreline (toward the park when the point sits on it)
          let ux = p[0] - nx, uz = p[1] - nz;
          if (d < 1e-3) { ux = -dz; uz = dx; }
          const ul = Math.hypot(ux, uz) || 1;
          let sg = 1;
          if (!_inPoly(nx + ux / ul * need, nz + uz / ul * need, orig)) sg = -1; // the park side
          p[0] = nx + sg * ux / ul * need; p[1] = nz + sg * uz / ul * need;
          if (full < 0 && Math.hypot(p[0] - sx, p[1] - sz) > SLACK) full = g + 2;
        }
      }
    }
  }
  F.fence = ring;
  // Gates stand on the fence: follow it in off the street
  for (const g of F.items) {
    if (g.kind !== 'gate') continue;
    let best = null, bd = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((g.x - ax) * dx + (g.z - az) * dz) / l2));
      const d = Math.hypot(g.x - ax - dx * t, g.z - az - dz * t);
      if (d < bd) { bd = d; best = [ax + dx * t, az + dz * t]; }
    }
    if (best) [g.x, g.z] = best;
  }
}

// Grid index of the fence ring for festInside, rebuilt when F.fence is replaced
// (festClearFence resamples it). Rows bucket edges by z (the even-odd ray test
// only needs edges straddling the query z); cells bucket edges by their bbox
// grown 1u (a superset of the edges within 0.8u of a query). The same
// per-edge tests as _inPoly / _distToRing on fewer edges: identical results.
const _FI_ROW = 4, _FI_CELL = 8;
function _fenceIndex(F) {
  if (F._fenceIdx && F._fenceIdx.ring === F.fence) return F._fenceIdx;
  const ring = F.fence, rows = new Map(), cells = new Map();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const push = (m, k, i) => { let l = m.get(k); if (!l) m.set(k, l = []); l.push(i); };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    minX = Math.min(minX, ax); maxX = Math.max(maxX, ax); minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
    for (let r = Math.floor(Math.min(az, bz) / _FI_ROW); r <= Math.floor(Math.max(az, bz) / _FI_ROW); r++) push(rows, r, i);
    for (let cx = Math.floor((Math.min(ax, bx) - 1) / _FI_CELL); cx <= Math.floor((Math.max(ax, bx) + 1) / _FI_CELL); cx++) {
      for (let cz = Math.floor((Math.min(az, bz) - 1) / _FI_CELL); cz <= Math.floor((Math.max(az, bz) + 1) / _FI_CELL); cz++) push(cells, cx * 73856093 ^ cz * 19349663, i);
    }
  }
  return (F._fenceIdx = { ring, rows, cells, minX, maxX, minZ, maxZ });
}

/** Inside the festival fence (not on it): closed streets go pedestrian.
 *  Same as _inPoly(x, z, F.fence) && _distToRing(x, z, F.fence) > 0.8, via
 *  _fenceIndex. */
export function festInside(F, x, z) {
  const I = _fenceIndex(F), ring = I.ring;
  // Outside the bbox (1u margin on x): no edge straddles z, or every
  // straddling edge's crossing is on the same side -> even count -> outside
  if (z < I.minZ || z > I.maxZ || x < I.minX - 1 || x > I.maxX + 1) return false;
  let inside = false;
  const row = I.rows.get(Math.floor(z / _FI_ROW));
  if (row) {
    for (const i of row) {
      // _inPoly's edge (i, j) pairs are (i, i-1); same edge, same test
      const [xi, zi] = ring[i], [xj, zj] = ring[(i + 1) % ring.length];
      if ((zi > z) !== (zj > z) && x < (xi - xj) * (z - zj) / (zi - zj) + xj) inside = !inside;
    }
  }
  if (!inside) return false;
  const cell = I.cells.get(Math.floor(x / _FI_CELL) * 73856093 ^ Math.floor(z / _FI_CELL) * 19349663);
  if (!cell) return true;
  for (const i of cell) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= 0.8) return false;
  }
  return true;
}

/** Car-network polylines with the stretches inside the fence cut out
 *  (Columbus, Balbo, Congress Plaza and Jackson east of Columbus close;
 *  Michigan, Lake Shore Drive and Roosevelt run along the outside). */
export function festCutRoads(netRoads, F) {
  const out = [];
  const closed = (x, z) => festInside(F, x, z);
  for (const r of netRoads) {
    let run = [];
    const flush = () => { if (run.length >= 2) out.push({ width: r.width, points: run }); run = []; };
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      if (i > 0) {
        // Densify so a long two-point edge is cut where it enters the fence
        const q = r.points[i - 1], l = Math.hypot(p[0] - q[0], p[1] - q[1]);
        for (let t = 2; t < l; t += 2) {
          const x = q[0] + (p[0] - q[0]) * t / l, z = q[1] + (p[1] - q[1]) * t / l;
          if (closed(x, z)) flush();
          else if (!run.length) run.push([x, z]);
        }
      }
      if (closed(p[0], p[1])) flush();
      else run.push(p);
    }
    flush();
  }
  return out;
}

const _rectPoly = (it, pad = 0) => {
  const c = Math.cos(it.rot), s = Math.sin(it.rot), hw = it.w / 2 + pad, hd = it.d / 2 + pad;
  // local X -> (cos r, -sin r), local Z -> (sin r, cos r)
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [it.x + c * u + s * v, it.z - s * u + c * v]);
};

/** Convex polygon grown by pad (vertices pushed out from the centroid). */
function _padPoly(poly, pad) {
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x; cz += z; }
  cx /= poly.length; cz /= poly.length;
  return poly.map(([x, z]) => { const l = Math.hypot(x - cx, z - cz) || 1; return [x + (x - cx) / l * pad * 1.42, z + (z - cz) / l * pad * 1.42]; });
}

/** Convex hull (monotone chain) of [x, z] points. */
function _hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Polygons trees and street props keep off: every footprint (+1u), and per
 *  stage its footprint +6u together with the whole wedge out to its crowd
 *  field (hull of both), so nothing stands between a stage and its crowd. */
export function festNoTree(F) {
  return [...F.items.filter((it) => KINDS[it.kind] || it.kind === 'food_seating').map((it) => _rectPoly(it, 1)),
    ...F.items.filter((it) => it.crowdArea).map((it) => _hull([..._rectPoly(it, 6), ..._padPoly(it.crowdArea, 2)]))];
}

// --------------- textures ---------------
function _canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const _loadImg = (file, fn) => new THREE.ImageLoader().load(assetURL(TEX_BASE + file), fn, undefined, () => {});

/** The KAIJUPALOOZA! lettering on a navy panel, sized to the panel's aspect.
 *  glb: for a GLB quad (glTF UVs, origin top-left: no flipY). */
function _signTexture(aspect, glb = true) {
  const wide = aspect > 1.8;
  const W = wide ? 1024 : 512, H = wide ? Math.round(1024 / Math.min(4, aspect)) : Math.round(512 / Math.max(0.5, aspect));
  const cv = _canvas(W, H);
  const cx = cv.getContext('2d');
  const paint = (img) => {
    const g = cx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b1650'); g.addColorStop(1, '#3a1466');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    if (img) {
      const k = Math.min(W * 0.94 / img.width, H * 0.9 / img.height);
      cx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    }
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = !glb;
  paint(null);
  _loadImg(wide ? 'kaijupalooza_banner.png' : 'kaijupalooza_stacked.png', paint);
  return tex;
}

// Our own stage names: reference-artist's lettering PNGs (assets/textures/
// stage_<id>.png); a canvas-lettered fallback for any stage without one
const STAGE_PNG = new Set(['monster_main', 'kaiju_stage', 'tremor_tent', 'atomic_stage', 'stomp_stage', 'roar_grove']);
const NAME_COLORS = ['#ff3d8b', '#ff8a1f', '#ffd21f', '#2fd4c0', '#9b5cff', '#4fb3ff'];
/** Paint one stage's name into a 512 x 128 slot of cx at (0, oy). */
function _drawName(cx, oy, id, name, done) {
  cx.fillStyle = '#1b1650'; cx.fillRect(0, oy, 512, 128);
  if (STAGE_PNG.has(id)) {
    _loadImg(`stage_${id}.png`, (img) => {
      const k = Math.min(492 / img.width, 116 / img.height);
      cx.drawImage(img, (512 - img.width * k) / 2, oy + (128 - img.height * k) / 2, img.width * k, img.height * k);
      done();
    });
    return;
  }
  // Fallback: chunky letters, one colour each, navy outline
  const text = name.toUpperCase();
  let size = 78;
  cx.font = `900 ${size}px 'Arial Black', 'Trebuchet MS', sans-serif`;
  const tw = cx.measureText(text).width || 300;
  if (tw > 480) { size = Math.floor(size * 480 / tw); cx.font = `900 ${size}px 'Arial Black', 'Trebuchet MS', sans-serif`; }
  cx.textBaseline = 'middle';
  cx.lineJoin = 'round';
  let x = (512 - Math.min(480, tw)) / 2;
  [...text].forEach((ch, i) => {
    const w = cx.measureText(ch).width || size * 0.6;
    cx.lineWidth = size * 0.18; cx.strokeStyle = '#0d0a33';
    cx.strokeText(ch, x + 4, oy + 68); cx.strokeText(ch, x, oy + 64);
    cx.fillStyle = NAME_COLORS[i % NAME_COLORS.length];
    cx.fillText(ch, x, oy + 64);
    x += w;
  });
  done();
}

/** Animated LED wall: colour-cycling visuals on a small canvas, redrawn ~12x a second. */
function _ledScreen(lite) {
  const W = lite ? 128 : 256, H = lite ? 64 : 128;
  const cv = _canvas(W, H);
  const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // GLB led_screen quads: glTF UVs
  let logo = null;
  _loadImg('kaijupalooza_stacked.png', (img) => { logo = img; });
  let acc = 1;
  const draw = (t) => {
    const scene = Math.floor(t / 6) % 5, u = t % 6;
    const hue = (t * 40) % 360;
    if (scene === 0) {
      // Scrolling rainbow bars
      for (let i = 0; i < 12; i++) {
        cx.fillStyle = `hsl(${(hue + i * 30) % 360},95%,55%)`;
        cx.fillRect(((i * W / 12 + t * W * 0.25) % (W + W / 12)) - W / 12, 0, W / 12 + 1, H);
      }
    } else if (scene === 1) {
      // Pulsing rings
      cx.fillStyle = '#0a0620'; cx.fillRect(0, 0, W, H);
      for (let r = 8; r > 0; r--) {
        cx.fillStyle = `hsl(${(hue + r * 45) % 360},100%,${40 + 15 * Math.sin(t * 6 + r)}%)`;
        cx.beginPath(); cx.arc(W / 2, H / 2, (r / 8) * W * (0.45 + 0.1 * Math.sin(t * 4)), 0, Math.PI * 2); cx.fill();
      }
    } else if (scene === 2) {
      // Equaliser
      cx.fillStyle = '#05030f'; cx.fillRect(0, 0, W, H);
      for (let i = 0; i < 16; i++) {
        const v = 0.2 + 0.8 * Math.abs(Math.sin(t * (3 + i * 0.37) + i));
        cx.fillStyle = `hsl(${(hue + i * 22) % 360},100%,55%)`;
        cx.fillRect(i * W / 16 + 1, H * (1 - v), W / 16 - 2, H * v);
      }
    } else if (scene === 3 && logo) {
      cx.fillStyle = `hsl(${hue},70%,${20 + 10 * Math.sin(t * 3)}%)`; cx.fillRect(0, 0, W, H);
      const k = Math.min(W / logo.width, H / logo.height) * (0.85 + 0.08 * Math.sin(t * 5));
      cx.drawImage(logo, (W - logo.width * k) / 2, (H - logo.height * k) / 2, logo.width * k, logo.height * k);
    } else {
      // Strobe checker
      const on = Math.floor(u * 4) % 2;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        cx.fillStyle = (i + j + on) % 2 ? `hsl(${(hue + i * 40) % 360},100%,60%)` : '#000';
        cx.fillRect(i * W / 8, j * H / 4, W / 8, H / 4);
      }
    }
    tex.needsUpdate = true;
  };
  draw(0);
  return {
    tex,
    update(dt, time) {
      acc += dt;
      if (acc < (lite ? 1 / 8 : 1 / 12)) return;
      acc = 0;
      draw(time);
    },
  };
}

// --------------- crowd ---------------
/** Low-poly festival-goer (~1.2u), origin at the feet; white vertices take the shirt colour. */
function _personGeom() {
  const parts = [
    [0.30, 0.52, 0.18, 0.26, [0.18, 0.2, 0.3]],  // legs (jeans)
    [0.38, 0.44, 0.22, 0.74, [1, 1, 1]],         // torso (shirt: instance colour)
    [0.22, 0.22, 0.22, 1.08, [0.86, 0.68, 0.55]], // head
  ];
  const pos = [], col = [], idx = [];
  for (const [w, h, d, y, c] of parts) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(0, y, 0);
    const p = g.attributes.position;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(...c); idx.push(base + i); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const SHIRTS = [0xff3d8b, 0xff8a1f, 0xffd21f, 0x2fd4c0, 0x9b5cff, 0x4fb3ff, 0xd8d8d8, 0x222222, 0xe23030, 0x44cc55]; // white kept under the noon bloom threshold

/** Uniforms of the crowd shader at rest: the festival's own values (about
 *  half the crowd bouncing to the beat, nothing else). The ringside audience
 *  (chicago_arena.js) drives its own set from the match:
 *   uBounce  x share NOT bouncing (0..1), y bounce height, z bounce rate, w pop (everyone jumps) 0..1
 *   uWave    xy: centre (x, z) the stadium wave runs around, z: the crest's angle (rad), w: height 0..1
 *   uFear[3] x, z, radius, strength: people shuffle and lean away (two kaiju + the last landing)
 *   uShock   x, z, start time, strength: a flinch that spreads out from an impact
 *   uRing    x, z centre of the floodlit ring, z: reach (u), w: light strength (emissive)
 *   uSigns   share of people holding a sign up (the sign box is part of the arena's geometry) */
function _crowdUniforms() {
  return {
    uTime: { value: 0 },
    uBounce: { value: new THREE.Vector4(0.45, 0.22, 7.5, 0) },
    uWave: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFear: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uShock: { value: new THREE.Vector4(0, 0, -100, 0) },
    uRing: { value: new THREE.Vector4(0, 0, 1, 0) },
    uSigns: { value: 0 },
  };
}

function _crowdMaterial(U) {
  if (!U.uBounce) U = Object.assign(_crowdUniforms(), { uTime: U }); // (uTime) alone: the festival at rest
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `uniform float uTime, uSigns;
uniform vec4 uBounce, uWave, uShock, uRing, uFear[3];
varying float vCrowdGlow;
` + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
        // white vertices take the shirt colour; red above 1.5 marks the sign board
        vColor = color.r > 1.5 ? vec3(0.92, 0.9, 0.82) * (0.55 + 0.45 * instanceColor.rgb) : (color.r + color.g + color.b > 2.99 ? instanceColor.rgb : color);
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCrowdGlow = 0.0;
#ifdef USE_INSTANCING
        float ph = float(gl_InstanceID) * 1.618;
        float h1 = fract(ph * 0.37), h2 = fract(ph * 0.731 + 0.19);
        vec3 ip = instanceMatrix[3].xyz;
        float sc2 = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
        // (a flattened spectator keeps still: its matrix is squashed in y)
        float up = step(0.25, dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz));
        if (color.r > 1.5) {
          // sign boards: only the people who brought one, pumped on a pop
          float has = step(h2, uSigns) * up;
          transformed *= has;
          transformed.y += has * (0.10 + 0.25 * uBounce.w) * sin(uTime * 6.0 + ph * 6.2831);
        }
        // Jumping to the beat: a share of the crowd bounces, each on its own phase
        float jumper = step(uBounce.x, h1);
        float hop = jumper * max(0.0, sin(uTime * uBounce.z + ph * 6.2831)) * uBounce.y;
        // A pop: everybody is off the ground
        hop += uBounce.w * (0.35 + 0.65 * h2) * abs(sin(uTime * (8.0 + 3.0 * h1) + ph * 6.2831)) * 0.75;
        // The wave: a crest running round the ring lifts people as it passes
        vec2 wv = ip.xz - uWave.xy;
        float wd = atan(wv.y, wv.x) - uWave.z;
        wd = abs(mod(wd + 3.14159265, 6.2831853) - 3.14159265);
        float crest = (1.0 - smoothstep(0.0, 0.55, wd)) * uWave.w;
        float tall = 1.0 + 0.32 * crest;
        hop += 0.35 * crest;
        // The flinch: a ring spreading from an impact, people duck as it passes
        vec2 sv = ip.xz - uShock.xy;
        float sd = length(sv);
        float st = uTime - uShock.z - sd / 70.0;
        float flinch = uShock.w * exp(-sd / 110.0) * smoothstep(0.0, 0.07, st) * (1.0 - smoothstep(0.12, 0.85, st));
        tall *= 1.0 - 0.34 * flinch;
        vec2 push = sv / max(sd, 0.001) * flinch * 0.9;
        // Fear: back away from a kaiju's feet (and from where one just landed), leaning as they go
        float lean = 0.0;
        for (int i = 0; i < 3; i++) {
          vec2 fv = ip.xz - uFear[i].xy;
          float fd = length(fv);
          float f = (1.0 - smoothstep(uFear[i].z * 0.35, uFear[i].z, fd)) * uFear[i].w;
          push += fv / max(fd, 0.001) * f * (2.2 + 1.6 * h2);
          lean += f;
          hop *= 1.0 - 0.8 * f;
        }
        transformed.y = transformed.y * mix(1.0, tall, up) + hop * up;
        // world-space shove, carried into the instance's own frame
        vec3 shove = vec3(push.x, 0.0, push.y) * (1.0 + min(lean, 1.0) * 0.45 * position.y) * up;
        transformed += (shove * mat3(instanceMatrix)) / max(sc2, 1e-4);
        // Floodlit side of the audience: emissive that falls off with distance from the ring
        vec2 rv = uRing.xy - ip.xz;
        float rd = length(rv);
        vec3 wn = normalize(mat3(instanceMatrix) * normal);
        float facing = 0.45 + 0.55 * clamp(dot(wn.xz, rv / max(rd, 0.001)) + 0.35 * wn.y, 0.0, 1.0);
        vCrowdGlow = uRing.w * facing * (1.0 - smoothstep(uRing.z * 0.45, uRing.z, rd)) * up;
#endif`);
    sh.fragmentShader = 'varying float vCrowdGlow;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vCrowdGlow;`);
  };
  mat.customProgramCacheKey = () => 'fest-crowd';
  return mat;
}

/** Festival-goers on the stage lawns, packed denser toward each stage:
 *  one InstancedMesh for every lawn (a single draw). lawns: [{ it, n }]. */
function _makeCrowd(scene, lawns, geom, mat) {
  const pts = [], yaw = [];
  for (const { it, n } of lawns) {
    const poly = it.crowdArea;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const far = Math.hypot(x1 - x0, z1 - z0);
    for (let tries = 0, got = 0; got < n && tries < n * 12; tries++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      if (!_inPoly(x, z, poly)) continue;
      const near = 1 - Math.min(1, Math.hypot(x - it.x, z - it.z) / far);
      if (Math.random() > 0.3 + 0.7 * near * near) continue;
      pts.push(x, z); yaw.push(Math.atan2(it.x - x, it.z - z)); got++;
    }
  }
  const count = pts.length / 2;
  if (!count) return null;
  const im = new THREE.InstancedMesh(geom, mat, count);
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    o.position.set(pts[i * 2], 0.04, pts[i * 2 + 1]);
    o.rotation.set(0, yaw[i] + (Math.random() - 0.5) * 0.6, 0);
    o.scale.setScalar(0.9 + Math.random() * 0.25);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, c.setHex(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]));
  }
  im.computeBoundingSphere();
  im.castShadow = false; im.receiveShadow = false;
  scene.add(im);
  return { im, pts, alive: new Uint8Array(count).fill(1) };
}

// --------------- builder ---------------
/**
 * Place the festival. ctx: { K, buildings, grid, animators, world, lite, glb,
 * addBatch, polygonGeom, M (Chicago shared materials), S (units per metre) }.
 */
export function buildFest(scene, F, ctx) {
  const { K, buildings, grid, animators, lite, glb, addBatch, polygonGeom, M } = ctx;
  const S = ctx.S || 0.2;
  const stages = [];

  // Trampled lawns in front of the stages (over the park grass, under the paths)
  const trampled = new THREE.MeshStandardMaterial({ color: 0x7c8456, roughness: 1.0, map: M.grass.map });
  for (const it of F.items) if (it.crowdArea) addBatch(polygonGeom(it.crowdArea, 0.035, 1 / 14), trampled);
  // Picnic-table strip: paving
  for (const it of F.items) if (it.kind === 'food_seating') addBatch(polygonGeom(_rectPoly(it), 0.036, 1 / 6), M.path);

  const newBuilding = (x, z, aw, ad, h, color, modelId) => {
    const b = new K.Building(x, z, aw, ad, h, { skipWindows: true, color });
    b.fest = true;
    b.glbBucket = 'fest'; // Grant Park straddles tile lines: one batch per part for the whole festival
    const ok = _ready(modelId);
    if (ok) b._skipBodyIM = true;
    else b.pendingGLB = FEST_MODELS[modelId].file;
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group); buildings.push(b); grid.add(b);
    return { b, ok };
  };
  const aabb = (w, d, r) => {
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    return [w * c + d * s, w * s + d * c];
  };

  for (const it of F.items) {
    const kind = KINDS[it.kind];
    if (!kind) continue;
    const id = _model(it);
    if (!id) continue;
    const mdl = FEST_MODELS[id];
    const url = FEST_BASE + mdl.file;
    const ax = [Math.cos(it.rot), -Math.sin(it.rot)], az = [Math.sin(it.rot), Math.cos(it.rot)];
    if (!mdl.ready && STANDIN[id]) {
      const h = it.kind === 'gate' ? mdl.sizeM[2] * S * 1.2 : Math.min(it.h, (kind.maxHM || Infinity) * S);
      let first = null;
      for (const [pid, u, v, fw, fd, fh] of STANDIN[id]) {
        const x = it.x + ax[0] * u * it.w + az[0] * v * it.d, z = it.z + ax[1] * u * it.w + az[1] * v * it.d;
        const ph = fh * h, byH = !fw;
        const [aw, ad] = byH ? [0.8, 0.8] : aabb(fw * it.w, fd * it.d, it.rot);
        const { b } = newBuilding(x, z, aw, ad, ph, kind.color, pid);
        K.queueGLB({ url: FEST_BASE + FEST_MODELS[pid].file, h: ph, building: b, maxW: byH ? 0 : aw * 1.05, maxD: byH ? 0 : ad * 1.05, rotY: it.rot, landmark: true, stretch: byH ? 1 : 1.15 });
        first = first || b;
      }
      if (it.kind === 'stage') stages.push({ it, b: first });
      if (it.kind === 'gate') {
        // The banner rides on the first tower: it goes when that one falls
        const bw = Math.min(it.w * 0.8, 7), bh = bw / 3;
        const mat = new THREE.MeshStandardMaterial({ map: _signTexture(3, false), roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.3 });
        mat.emissiveMap = mat.map;
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), mat);
        banner.position.set(it.x - first.x, h * 0.92 - bh / 2, it.z - first.z);
        banner.rotation.y = it.rot;
        first.group.add(banner);
        first.group.updateMatrixWorld(true);
      }
      continue;
    }
    if (kind.mode === 'fit') {
      const h = Math.min(it.h, (kind.maxHM || Infinity) * S);
      const [aw, ad] = aabb(it.w, it.d, it.rot);
      const { b, ok } = newBuilding(it.x, it.z, aw, ad, h, kind.color, id);
      if (ok) K.queueGLB({ url, h, building: b, maxW: kind.fitH ? 0 : aw * 1.05, maxD: kind.fitH ? 0 : ad * 1.05, rotY: it.rot, landmark: true, stretch: kind.fitH ? 1 : 1.15 });
      if (it.kind === 'stage') stages.push({ it, b });
      continue;
    }
    // Tiled: true-size copies along the item's width, rows along its depth
    const [mw, md, mh] = mdl.sizeM.map((v) => v * S);
    const nx = Math.max(1, Math.min(12, Math.round(it.w / mw)));
    const nz = Math.max(1, Math.min(4, Math.floor(it.d / (md * 1.6))));
    const cw = it.w / nx, cd = it.d / nz;
    const h = Math.min(mh, it.kind === 'gate' ? mh : Math.max(it.h, mh));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const u = (i + 0.5) * cw - it.w / 2, v = (j + 0.5) * cd - it.d / 2;
      const [aw, ad] = aabb(cw, cd, it.rot);
      const tx = it.x + ax[0] * u + az[0] * v, tz = it.z + ax[1] * u + az[1] * v;
      const { b, ok } = newBuilding(tx, tz, aw, ad, h, kind.color, id);
      if (ok) K.queueGLB({ url, h, building: b, maxW: aw * 1.02, maxD: ad * 1.02, rotY: it.rot, landmark: true });
    }
  }

  // ---- fence: instanced panels in runs of up to 14, gaps at the gates ----
  {
    const pm = FEST_MODELS.fence_panel;
    const pl = pm.sizeM[0] * S, h = F.fenceH;
    const gates = F.items.filter((it) => it.kind === 'gate');
    const ring = F.fence;
    // Panels every ~3.5 m along the whole ring (arc length, across its
    // resampled corners); a run (one building) ends after 14 panels, at a
    // gate gap or where the fence turns
    let run = [];
    const flush = () => {
      if (!run.length) return;
      let rx0 = Infinity, rx1 = -Infinity, rz0 = Infinity, rz1 = -Infinity;
      for (const t of run) { rx0 = Math.min(rx0, t.x); rx1 = Math.max(rx1, t.x); rz0 = Math.min(rz0, t.z); rz1 = Math.max(rz1, t.z); }
      const [ew, ed] = aabb(pl, 0.15, run[0].ry);
      const { b, ok } = newBuilding((rx0 + rx1) / 2, (rz0 + rz1) / 2, rx1 - rx0 + ew, rz1 - rz0 + ed, h, 0x9c3cc8, 'fence_panel');
      b.isFence = true;
      if (ok) K.queueGLB({ url: FEST_BASE + pm.file, h, building: b, tiles: run, tileLen: pl, landmark: true });
      run = [];
    };
    let carry = pl / 2;
    for (let i = 0; i < ring.length; i++) { // closing edge too (zero length if the ring repeats its start)
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l < 1e-3) continue;
      const dx = (c[0] - a[0]) / l, dz = (c[1] - a[1]) / l;
      const ry = Math.atan2(-dz, dx); // panel length (local X) along the edge
      let t = carry;
      for (; t < l; t += pl) {
        const x = a[0] + dx * t, z = a[1] + dz * t;
        if (gates.some((g) => Math.hypot(x - g.x, z - g.z) < g.w / 2 + pl * 0.5)) { flush(); continue; }
        if (ctx.ring && festRingGap(x, z)) { flush(); continue; }
        if (run.length && Math.abs(Math.sin(ry - run[0].ry)) > 0.5) flush();
        run.push({ x, z, ry });
        if (run.length >= 14) flush();
      }
      carry = t - l;
    }
    flush();
  }

  // ---- stage name boards: one mesh for all (a name atlas, one slot per
  // stage) standing on each stage's roof line; a board folds away when its
  // stage collapses ----
  if (stages.length) {
    const N = stages.length;
    const cv = _canvas(512, 128 * N);
    const cx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pos = [], uv = [], idx = [];
    stages.forEach(({ it }, i) => {
      _drawName(cx, i * 128, it.id, it.name, () => { tex.needsUpdate = true; });
      const bw = Math.min(it.w * 0.62, 9), bh = bw / 4;
      const c = Math.cos(it.rot), sn = Math.sin(it.rot);
      const fx = it.x + sn * (it.d / 2 + 0.05), fz = it.z + c * (it.d / 2 + 0.05), y0 = it.h + 0.1;
      const v0 = 1 - (i + 1) / N, v1 = 1 - i / N;
      const base = pos.length / 3;
      for (const [u, v] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]]) {
        // local X across the stage front: (cos r, -sin r)
        pos.push(fx + c * u * bw, y0 + v * bh, fz - sn * u * bw);
        uv.push(u + 0.5, v ? v1 : v0);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide });
    const boards = new THREE.Mesh(g, mat);
    boards.matrixAutoUpdate = false;
    scene.add(boards);
    const gone = new Uint8Array(N);
    let acc = 0;
    animators.push({
      update(dt) {
        if ((acc += dt) < 0.25) return;
        acc = 0;
        const p = g.attributes.position;
        stages.forEach(({ b }, i) => {
          if (gone[i] || !b.destroyed) return;
          gone[i] = 1;
          for (let k = 0; k < 4; k++) p.setY(i * 4 + k, -1); // folded flat under the ground
          p.needsUpdate = true;
        });
      },
    });
  }

  // ---- crowds: instanced festival-goers on the lawns (phones fewer, LOW minimal) ----
  const crowds = [];
  {
    const uTime = { value: 0 };
    const geom = _personGeom(), mat = _crowdMaterial(uTime);
    const perU2 = !glb ? 0.08 : lite ? 0.22 : 0.62; // people per square unit
    const cap = !glb ? 450 : lite ? 1600 : 5200;
    // (ctx.ring: the title match has drawn everyone to the ring; chicago_arena.js seats them there)
    const lawns = ctx.ring ? [] : stages.filter(({ it }) => it.crowdArea && (glb || it.tier === 'main'));
    const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; s += x0 * z1 - x1 * z0; } return Math.abs(s) / 2; };
    const tot = lawns.reduce((s, { it }) => s + area(it.crowdArea), 0);
    const k = Math.min(perU2, cap / Math.max(1, tot));
    const c = _makeCrowd(scene, lawns.map(({ it }) => ({ it, n: Math.round(area(it.crowdArea) * k) })), geom, mat);
    if (c) crowds.push(c);
    animators.push({ update(dt, time) { uTime.value = time; } });
    // Stomped / blasted festival-goers: flattened where they stood
    // (game.js damageInRadius calls this like it does for civilians)
    const flat = new THREE.Matrix4(), squash = new THREE.Vector3(1.6, 0.04, 1.6);
    if (ctx.world) {
      ctx.world.crowdHit = (x, z, r2) => {
        let n = 0;
        for (const c of crowds) {
          let dirty = false;
          for (let i = 0; i < c.alive.length; i++) {
            if (!c.alive[i]) continue;
            const dx = c.pts[i * 2] - x, dz = c.pts[i * 2 + 1] - z;
            if (dx * dx + dz * dz > r2) continue;
            c.alive[i] = 0; n++; dirty = true;
            c.im.getMatrixAt(i, flat);
            flat.scale(squash);
            c.im.setMatrixAt(i, flat);
          }
          if (dirty) c.im.instanceMatrix.needsUpdate = true;
        }
        return n;
      };
    }
  }

  // ---- LED walls, KAIJUPALOOZA! sign panels (on the shared GLB materials) ----
  const led = _ledScreen(lite);
  animators.push(led);
  K.onTemplatesReady((sc, get) => {
    for (const m of Object.values(FEST_MODELS)) {
      if (!m.ready) continue;
      get(FEST_BASE + m.file)?.traverse((o) => {
        if (!o.isMesh) return;
        const mat = o.material, name = mat.name || '';
        if (/led_screen/i.test(name)) {
          mat.map = led.tex; mat.emissiveMap = led.tex; mat.emissive?.setRGB(1, 1, 1); mat.emissiveIntensity = 0.9;
          mat.color.setRGB(1, 1, 1); mat.metalness = 0; mat.roughness = 0.5;
          mat.needsUpdate = true;
        } else if (/sign_panel/i.test(name) && !mat.userData.festSign) {
          mat.userData.festSign = true;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3());
          const along = Math.max(sz.x, sz.z), up = Math.max(1e-3, sz.y);
          mat.map = _signTexture(m.signAspect || along / up);
          mat.color.setRGB(1, 1, 1); mat.metalness = 0;
          mat.emissiveMap = mat.map; mat.emissive?.setRGB(1, 1, 1); mat.emissiveIntensity = 0.35;
          mat.needsUpdate = true;
        }
      });
    }
  });

  // ---- stage lights: sweeping additive beams + strobe bursts (desktop / phone MED) ----
  if (glb) {
    const beams = [];
    for (const { it, b } of stages) {
      const n = lite ? (it.tier === 'main' ? 4 : 2) : (it.tier === 'main' ? 8 : it.id === 'roar_grove' ? 3 : 5);
      for (let i = 0; i < n; i++) beams.push({ it, b, u: (i + 0.5) / n - 0.5, phase: Math.random() * 6.28, hue: i / n });
    }
    if (beams.length) {
      const g = new THREE.CylinderGeometry(0.03, 0.55, 1, 10, 1, true);
      g.translate(0, -0.5, 0); // apex at the origin, opening down -Y
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const im = new THREE.InstancedMesh(g, mat, beams.length);
      im.frustumCulled = false; im.castShadow = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const q = new THREE.Quaternion(), down = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), m = new THREE.Matrix4(), col = new THREE.Color();
      im.setColorAt(0, col.setRGB(1, 1, 1));
      scene.add(im);
      const strobe = new Map(); // stage id -> burst end time
      animators.push({
        update(dt, time) {
          beams.forEach((bm, i) => {
            const { it } = bm;
            if (bm.b.destroyed) { im.setMatrixAt(i, m.makeScale(0, 0, 0)); return; }
            const fx = Math.sin(it.rot), fz = Math.cos(it.rot);
            pos.set(it.x + Math.cos(it.rot) * bm.u * it.w * 0.8 + fx * it.d * 0.35, it.h * 0.88, it.z - Math.sin(it.rot) * bm.u * it.w * 0.8 + fz * it.d * 0.35);
            // Sky beams fanning out over the crowd: yaw swing around the
            // stage front, elevation bob
            const yaw = Math.sin(time * 0.7 + bm.phase) * 0.8 + bm.u * 1.2;
            const pitch = 0.75 + 0.35 * Math.sin(time * 0.55 + bm.phase * 1.7);
            const cy = Math.cos(yaw), sy = Math.sin(yaw);
            dir.set((fx * cy + fz * sy) * Math.cos(pitch), Math.sin(pitch), (fz * cy - fx * sy) * Math.cos(pitch)).normalize();
            q.setFromUnitVectors(down, dir);
            const len = it.tier === 'main' ? 30 : 18;
            scl.set(len * 0.08, len, len * 0.08);
            im.setMatrixAt(i, m.compose(pos, q, scl));
            let burst = strobe.get(it.id) || 0;
            if (time > burst + 3 && Math.random() < dt * 0.25) strobe.set(it.id, burst = time + 1.2);
            const flash = time < burst && Math.floor(time * 14) % 2 ? 2.2 : 1;
            col.setHSL((bm.hue + time * 0.06) % 1, 1, 0.5).multiplyScalar(flash);
            im.setColorAt(i, col);
          });
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        },
      });
    }
  }

  // Hook for other systems (stage music, audio-director): one entry per
  // stage; destroyed reads live, group is the stage building's group
  // (removed from the scene when it collapses)
  if (ctx.world) {
    ctx.world.festStages = stages.map(({ it, b }) => ({
      id: it.id, name: it.name, tier: it.tier || '', x: it.x, z: it.z, rot: it.rot, w: it.w, d: it.d, h: it.h,
      building: b, group: b.group, get destroyed() { return b.destroyed; },
    }));
  }
  return { stages, crowds };
}

// The ringside crowd (chicago_arena.js) stands the same people around the ring
export { _personGeom as festPersonGeom, _crowdMaterial as festCrowdMaterial, _crowdUniforms as festCrowdUniforms, SHIRTS as FEST_SHIRTS };

/** Wrestling mode (ctx.ring): the stretches of fence left open for the two
 *  entrances. East, the player's ramp from the lake; west, the rival's way
 *  in from the Loop along Balbo Dr (either side of the Balbo gate). */
export const FEST_RING_GAPS = Object.freeze([
  Object.freeze({ x0: 40, x1: 70, z0: 47, z1: 77 }),
  Object.freeze({ x0: -70, x1: -45, z0: 49, z1: 75 }),
]);
function festRingGap(x, z) {
  for (const g of FEST_RING_GAPS) if (x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1) return true;
  return false;
}
