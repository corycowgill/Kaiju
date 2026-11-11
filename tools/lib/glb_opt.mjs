// Shared GLB optimisation steps for tools/optimize_assets.mjs, make_mobile_assets.mjs and
// make_ktx2_assets.mjs:
//  - texture sizing by on-screen texel density (texels per world unit, from UV area / surface
//    area and the scale the level places the model at), near-constant maps -> 8x8, WebP
//  - geometry: weld, KHR_mesh_quantization, EXT_meshopt_compression (GLTFLoader needs
//    setMeshoptDecoder: see city.js / enemies.js / kaijuLoader.js)
//  - single-sided materials where no back face is ever the nearest surface from outside
//    (software depth raster from a sphere of viewpoints; inverted triangles are rewound)
// (needs: npm install  -- devDependencies in package.json)
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

sharp.cache(false);
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
export const makeIO = () => new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// ---------------------------------------------------------------- placement scale
// World units per model unit, by path relative to assets/ (first match wins). From the
// placement code: Chicago is built at 0.2 u/m (chicago_layout.json meta); generic blocks are
// stretched per lot (up to ~0.6, 0.4 typical); vehicles CAR_UNITS_PER_M (city.js); boats
// BOAT_UPM / SAIL_SCALE; street furniture FURNITURE_UPM (chicago.js). null: unknown, the
// density rule is skipped and only CAPS apply. Trees are scaled to a fixed height.
const TREE_HEIGHT_U = 7;
const UPM = [
  [/^buildings\/chicago\/(boat_|sailboat|tour_boat|water_taxi)/, 0.3],
  [/^buildings\/chicago\/(sedan_|chicago_taxi|cta_bus\.|cta_bus_lod1|box_truck|police_suv)/, 0.8],
  [/^buildings\/chicago\/(chicago_streetlamp|cta_bus_shelter|traffic_signal|hot_dog_cart|bench|newspaper|planter|bike_share)/, 0.6],
  [/^buildings\/chicago\/(gen_|art_institute)/, 0.4],
  [/^buildings\/chicago\//, 0.2],
];
// Hard caps (longest side) where the density rule has no scale to work with
const CAPS = [
  [/^enemies\/mech\//, 1024], // 9u enemy / 16u boss with the same density as a 32u kaiju at 2048
];
// Colour-map floor (longest side) above the default: traffic gets kicked and thrown past the
// camera, and smooth car paint shows blur and block artefacts long before a facade does
const FLOORS = [
  [/^buildings\/chicago\/(sedan_|chicago_taxi|cta_bus\.|box_truck\.|police_suv\.)/, 512],
];
// Never resized or recoloured: the kaiju are seen in close-up fight cameras
export const HERO = /^(kaiju_model|ghidorah_model|mecha_model)\//;
// Position quantization puts a dequantize transform on the mesh node; only the static
// level-art folders are known to be loaded by code that keeps node transforms (the
// phone variants have always been quantized). Everything else keeps float positions.
const QUANT_POS_DIRS = /^(buildings|props|vehicles|trees)\//;
// Viewed from every side, below included (thrown, tumbling, flying or animated)
const FULL_SPHERE = /^(enemies|military|debris|vehicles|cars|kaiju_model|ghidorah_model|mecha_model)\/|^buildings\/chicago\/(boat_|sailboat|tour_boat|water_taxi|sedan_|chicago_taxi|cta_bus|box_truck|police_suv|l_train|hot_dog_cart)/;

export function unitsPerModelUnit(rel, doc) {
  if (/^trees\//.test(rel)) {
    let minY = Infinity, maxY = -Infinity;
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue;
      const M = node.getWorldMatrix(); const v = [0, 0, 0];
      for (const p of mesh.listPrimitives()) {
        const P = p.getAttribute('POSITION'); if (!P) continue;
        for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); const y = M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    return maxY > minY ? TREE_HEIGHT_U / (maxY - minY) : null;
  }
  for (const [re, s] of UPM) if (re.test(rel)) return s;
  return null;
}

// ---------------------------------------------------------------- texel density
const SLOTS = [['map', 'getBaseColorTexture'], ['normal', 'getNormalTexture'], ['mr', 'getMetallicRoughnessTexture'], ['ao', 'getOcclusionTexture'], ['em', 'getEmissiveTexture']];
/** Map texture -> { slots:Set, dens: texels per model unit (null if unused / no UVs), alpha } */
export function textureUsage(doc) {
  const root = doc.getRoot();
  const per = new Map();
  const use = (t, slot, uv, world, alpha) => {
    if (!t) return;
    const e = per.get(t) || { slots: new Set(), uv: 0, world: 0, alpha: false };
    e.slots.add(slot); e.uv += uv; e.world += world; e.alpha = e.alpha || alpha; per.set(t, e);
  };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], ua = [0, 0], ub = [0, 0], uc = [0, 0];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    const tp = (v, o) => { o[0] = M[0] * v[0] + M[4] * v[1] + M[8] * v[2]; o[1] = M[1] * v[0] + M[5] * v[1] + M[9] * v[2]; o[2] = M[2] * v[0] + M[6] * v[1] + M[10] * v[2]; return o; };
    const A0 = [0, 0, 0], B0 = [0, 0, 0], C0 = [0, 0, 0];
    for (const p of mesh.listPrimitives()) {
      const P = p.getAttribute('POSITION'), UV = p.getAttribute('TEXCOORD_0'), I = p.getIndices(), mat = p.getMaterial();
      if (!P || !mat || p.getMode() !== 4) continue;
      const n = I ? I.getCount() : P.getCount();
      let uvA = 0, wA = 0;
      for (let t = 0; t + 2 < n; t += 3) {
        const i0 = I ? I.getScalar(t) : t, i1 = I ? I.getScalar(t + 1) : t + 1, i2 = I ? I.getScalar(t + 2) : t + 2;
        tp(P.getElement(i0, a), A0); tp(P.getElement(i1, b), B0); tp(P.getElement(i2, c), C0);
        const ux = B0[0] - A0[0], uy = B0[1] - A0[1], uz = B0[2] - A0[2], vx = C0[0] - A0[0], vy = C0[1] - A0[1], vz = C0[2] - A0[2];
        wA += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (UV) { UV.getElement(i0, ua); UV.getElement(i1, ub); UV.getElement(i2, uc); uvA += 0.5 * Math.abs((ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1])); }
      }
      const alpha = mat.getAlphaMode() !== 'OPAQUE';
      for (const [slot, get] of SLOTS) use(mat[get](), slot, uvA, wA, alpha && slot === 'map');
    }
  }
  for (const [t, e] of per) {
    const [w, h] = t.getSize() || [0, 0];
    e.dens = e.world > 0 && e.uv > 0 ? Math.sqrt(w * h * e.uv / e.world) : null;
  }
  return per;
}

// ---------------------------------------------------------------- textures
const DEFAULT_TEX = {
  texelsPerUnit: 20,  // colour maps: >= 1 texel per pixel at the 51u chase camera up to 1440p
  auxFactor: 0.5,     // normal / roughness / AO maps need half the colour density
  cap: Infinity,      // longest side, after the density rule
  heroCap: Infinity,
  floor: 256,         // the density rule never takes a colour map below this (half for the others):
                      // flat graphics with hard edges blur long before photos do
  resize: true, webp: true,
};
const mimeOf = (fmt) => ({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[fmt]);

/** Resize / re-encode every texture of doc in place. Returns a log line per changed texture. */
export async function optimizeTextures(doc, rel, options = {}) {
  const o = { ...DEFAULT_TEX, ...options };
  const usage = textureUsage(doc);
  const upm = unitsPerModelUnit(rel, doc);
  const hero = HERO.test(rel);
  const hardCap = Math.min(hero ? o.heroCap : o.cap, ...CAPS.filter(([re]) => !hero && re.test(rel)).map(([, c]) => c));
  const floor = Math.max(o.floor, ...FLOORS.filter(([re]) => re.test(rel)).map(([, f]) => f * o.floor / DEFAULT_TEX.floor));
  const log = [];
  let anyWebp = false;
  for (const t of doc.getRoot().listTextures()) {
    const src = t.getImage(); const size = t.getSize();
    if (!src || !size || t.getMimeType() === 'image/ktx2') continue;
    if (t.getMimeType() === 'image/webp') anyWebp = true;
    const u = usage.get(t) || { slots: new Set(), dens: null, alpha: false };
    const [w, h] = size;
    const img = sharp(Buffer.from(src));
    const meta = await img.metadata();
    const stats = await img.stats();
    const colour = u.slots.has('map') || u.slots.has('em') || !u.slots.size;
    let f = 1; // shrink factor
    let why = '';
    // Near-constant map (a baked roughness of one value, an unused channel): 8x8 says it all
    const range = Math.max(...stats.channels.map((c) => c.max - c.min));
    if (o.resize && !hero && range <= 12 && Math.max(w, h) > 8) { f = Math.max(w, h) / 8; why = 'constant'; }
    else if (o.resize && !hero) {
      if (upm && u.dens) {
        const need = o.texelsPerUnit * (colour ? 1 : o.auxFactor);
        while (u.dens / upm / (f * 2) >= need && Math.max(w, h) / (f * 2) >= (colour ? floor : floor / 2)) f *= 2;
        if (f > 1) why = `density ${(u.dens / upm).toFixed(0)}/u`;
      }
      while (Math.max(w, h) / f > hardCap) { f *= 2; why = why || 'cap'; }
    } else if (o.resize) { while (Math.max(w, h) / f > hardCap) { f *= 2; why = 'cap'; } }
    const nw = Math.max(1, Math.round(w / f)), nh = Math.max(1, Math.round(h / f));
    const resized = f > 1;
    // One-off albedo tone (options.tone: { sat, lum } multipliers), tagged so it never stacks
    // Kaiju textures are only ever re-encoded when toned (no generation loss otherwise)
    const tone = o.tone && u.slots.has('map') && !(t.getExtras() || {}).toned ? o.tone : null;
    const hasAlpha = meta.hasAlpha && stats.channels.length === 4 && stats.channels[3].min < 255;
    const base = () => {
      let s = sharp(Buffer.from(src));
      if (resized) s = s.resize(nw, nh, { fit: 'fill', kernel: why === 'constant' ? 'cubic' : 'lanczos3' });
      if (tone) s = s.modulate({ saturation: tone.sat || 1, brightness: tone.lum || 1 });
      return hasAlpha ? s : s.removeAlpha();
    };
    if (hero && !tone && !resized) continue;
    let best = null; // { buf, fmt }
    const offer = (buf, fmt) => { if (!best || buf.length < best.buf.length) best = { buf, fmt }; };
    const isNormal = u.slots.has('normal');
    // Palette swatches / flat art (few colours) must stay exact: lossless only
    const flat = meta.format === 'png' && (Math.max(w, h) <= 256 || src.byteLength < w * h / 8);
    try {
    if (flat || why === 'constant') {
      offer(await base().png({ compressionLevel: 9, palette: false }).toBuffer(), 'png');
      if (o.webp) offer(await base().webp({ lossless: true, effort: 6 }).toBuffer(), 'webp');
    } else if (isNormal) {
      // Lossy WebP subsamples chroma (two of a normal's three axes): keep 4:4:4 JPEG
      if (resized || meta.format !== 'jpeg') offer(await base().jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer(), 'jpeg');
    } else if (o.webp) {
      if (resized || tone || meta.format !== 'webp') offer(await base().webp({ quality: hero ? 95 : 86, alphaQuality: 100, smartSubsample: true, effort: 6 }).toBuffer(), 'webp');
    } else if (resized || tone) {
      if (hasAlpha || meta.format === 'png') offer(await base().png({ compressionLevel: 9 }).toBuffer(), 'png');
      else offer(await base().jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer(), 'jpeg');
    }
    } catch (e) { log.push(`${t.getName() || '?'} ${w}x${h}: encode failed (${String(e.message).split(/\n/)[0]}), left as is`); continue; }
    // A same-size re-encode has to pay for its generation loss
    if (!best || (!resized && !tone && best.buf.length > src.byteLength * 0.85)) continue;
    t.setImage(new Uint8Array(best.buf)).setMimeType(mimeOf(best.fmt));
    if (tone) t.setExtras({ ...(t.getExtras() || {}), toned: `sat ${tone.sat || 1} lum ${tone.lum || 1}` });
    if (best.fmt === 'webp') anyWebp = true;
    log.push(`${t.getName() || '?'} [${[...u.slots].join('+') || 'unused'}] ${w}x${h} ${meta.format} ${(src.byteLength / 1024).toFixed(0)}K -> ${nw}x${nh} ${best.fmt} ${(best.buf.length / 1024).toFixed(0)}K${why ? ` (${why})` : ''}${tone ? ' toned' : ''}`);
  }
  if (anyWebp) doc.createExtension(EXTTextureWebP).setRequired(true);
  return log;
}

// ---------------------------------------------------------------- sidedness
// Camera directions (unit vectors from the camera toward the model). Ground-standing level
// art is only seen from above the ground plane (rays that would have to enter through the
// model's underside are ignored); everything else gets the full sphere.
function viewDirs(full) {
  const dirs = [];
  const els = full ? [-90, -65, -40, -20, 0, 20, 45, 70, 90] : [-30, -12, 0, 20, 45, 70, 90];
  for (const el of els) {
    const n = Math.abs(el) === 90 ? 1 : 10;
    for (let i = 0; i < n; i++) {
      const az = (i + (el % 40 ? 0.5 : 0)) * 2 * Math.PI / n, e = el * Math.PI / 180;
      // camera sits at elevation el: it looks along -position
      dirs.push([-Math.cos(e) * Math.cos(az), -Math.sin(e), -Math.cos(e) * Math.sin(az)]);
    }
  }
  return dirs;
}

/** World-space triangle soup of every indexed triangle primitive. */
function triangleSoup(doc) {
  const prims = []; // { prim, mat, first, count, flip }
  const pos = [];
  const v = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const skinned = !!node.getSkin();
    const M = skinned ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : node.getWorldMatrix();
    const det = M[0] * (M[5] * M[10] - M[9] * M[6]) - M[4] * (M[1] * M[10] - M[9] * M[2]) + M[8] * (M[1] * M[6] - M[5] * M[2]);
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices();
      if (!P || !I || prim.getMode() !== 4) continue;
      const first = pos.length / 9, n = I.getCount();
      const w = new Float64Array(P.getCount() * 3);
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, v);
        w[i * 3] = M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12];
        w[i * 3 + 1] = M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13];
        w[i * 3 + 2] = M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14];
      }
      for (let t = 0; t + 2 < n; t += 3) for (let k = 0; k < 3; k++) { const i = I.getScalar(t + k) * 3; pos.push(w[i], w[i + 1], w[i + 2]); }
      prims.push({ prim, mat: prim.getMaterial(), first, count: Math.floor(n / 3), flip: det < 0 });
    }
  }
  return { prims, pos: Float64Array.from(pos) };
}

/** Per triangle: pixels where it is the nearest surface seen from its front / from its back
 *  (orthographic depth raster per direction); per material: its worst single view. */
function visibility(soup, dirs, ground, R = 256) {
  const { prims, pos } = soup;
  const nT = pos.length / 9;
  const front = new Uint32Array(nT), back = new Uint32Array(nT);
  const flip = new Uint8Array(nT), matOf = new Int32Array(nT);
  const mats = [...new Set(prims.map((p) => p.mat))];
  for (const p of prims) { if (p.flip) flip.fill(1, p.first, p.first + p.count); matOf.fill(mats.indexOf(p.mat), p.first, p.first + p.count); }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < mn[k]) mn[k] = pos[i + k]; if (pos[i + k] > mx[k]) mx[k] = pos[i + k]; }
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const eps = diag * 3e-4;
  const groundY = mn[1] + (mx[1] - mn[1]) * 0.01;
  const zF = new Float32Array(R * R), zB = new Float32Array(R * R);
  const iF = new Int32Array(R * R), iB = new Int32Array(R * R);
  const sx = new Float64Array(nT * 3), sy = new Float64Array(nT * 3), sz = new Float64Array(nT * 3);
  const worst = new Float64Array(mats.length), vBad = new Uint32Array(mats.length), vVis = new Uint32Array(mats.length);
  for (const d of dirs) {
    // right-handed basis (u, w, d): u x w = d, depth grows away from the camera
    const up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    let u = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0, j = 0; i < pos.length; i += 3, j++) {
      const X = pos[i] * u[0] + pos[i + 1] * u[1] + pos[i + 2] * u[2], Y = pos[i] * w[0] + pos[i + 1] * w[1] + pos[i + 2] * w[2];
      sx[j] = X; sy[j] = Y; sz[j] = pos[i] * d[0] + pos[i + 1] * d[1] + pos[i + 2] * d[2];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
    const sc = (R - 2) / Math.max(x1 - x0, y1 - y0, 1e-9);
    zF.fill(Infinity); zB.fill(Infinity); iF.fill(-1); iB.fill(-1);
    for (let t = 0; t < nT; t++) {
      const j = t * 3;
      const ax = (sx[j] - x0) * sc + 1, ay = (sy[j] - y0) * sc + 1, bx = (sx[j + 1] - x0) * sc + 1, by = (sy[j + 1] - y0) * sc + 1, cx = (sx[j + 2] - x0) * sc + 1, cy = (sy[j + 2] - y0) * sc + 1;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-9) continue;
      // the screen-space area is (geometric normal . d): negative = facing the camera
      const isFront = (area < 0) !== !!flip[t];
      const zb = isFront ? zF : zB, ib = isFront ? iF : iB;
      const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)), maxX = Math.min(R - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), maxY = Math.min(R - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
      const inv = 1 / area;
      for (let py = minY; py <= maxY; py++) {
        const y = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const x = px + 0.5;
          const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) * inv, w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) * inv, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * sz[j] + w1 * sz[j + 1] + w2 * sz[j + 2];
          const k = py * R + px;
          if (z < zb[k]) { zb[k] = z; ib[k] = t; }
        }
      }
    }
    vBad.fill(0); vVis.fill(0);
    for (let k = 0; k < R * R; k++) {
      if (iB[k] >= 0 && zB[k] < zF[k] - eps) {
        if (ground && d[1] > 1e-6) {
          // looking up: skip rays that enter the model's bounds through its underside
          // (the camera would be under the ground, or inside an open-bottomed shell)
          const X = ((k % R) + 0.5 - 1) / sc + x0, Y = (Math.floor(k / R) + 0.5 - 1) / sc + y0;
          const o = [X * u[0] + Y * w[0], X * u[1] + Y * w[1], X * u[2] + Y * w[2]];
          let s = -Infinity;
          for (let a = 0; a < 3; a++) if (Math.abs(d[a]) > 1e-9) s = Math.max(s, Math.min((mn[a] - o[a]) / d[a], (mx[a] - o[a]) / d[a]));
          if (o[1] + s * d[1] <= groundY) continue;
        }
        back[iB[k]]++; vBad[matOf[iB[k]]]++; vVis[matOf[iB[k]]]++;
      } else if (iF[k] >= 0) { front[iF[k]]++; vVis[matOf[iF[k]]]++; }
    }
    for (let m = 0; m < mats.length; m++) if (vVis[m] >= 40 && vBad[m] / vVis[m] > worst[m]) worst[m] = vBad[m] / vVis[m];
  }
  return { front, back, worst: new Map(mats.map((m, i) => [m, worst[i]])) };
}

/** Rewrite triangles `tris` (indices into the primitive) with reversed winding and / or
 *  negated normals; vertices shared with other triangles are duplicated first. */
function retarget(prim, tris, { rewind, negate }) {
  const isPrim = (p) => p.propertyType === PropertyType.PRIMITIVE;
  const I = prim.getIndices(); const idx = Array.from(I.getArray());
  const inSet = new Uint8Array(idx.length / 3); for (const t of tris) inSet[t] = 1;
  const nV = prim.getAttribute('POSITION').getCount();
  const usedOut = new Uint8Array(nV);
  for (let t = 0; t < inSet.length; t++) if (!inSet[t]) for (let k = 0; k < 3; k++) usedOut[idx[t * 3 + k]] = 1;
  const remap = new Map(); const dup = []; const negV = new Set();
  if (negate) {
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      if (!usedOut[v]) { negV.add(v); continue; }
      if (!remap.has(v)) { remap.set(v, nV + dup.length); dup.push(v); }
      idx[t * 3 + k] = remap.get(v);
    }
  }
  if (rewind) for (const t of tris) { const a = idx[t * 3 + 1]; idx[t * 3 + 1] = idx[t * 3 + 2]; idx[t * 3 + 2] = a; }
  if (dup.length) {
    for (const sem of prim.listSemantics()) {
      const A = prim.getAttribute(sem); const es = A.getElementSize(); const old = A.getArray();
      const arr = new old.constructor((nV + dup.length) * es); arr.set(old);
      dup.forEach((v, i) => { for (let k = 0; k < es; k++) arr[(nV + i) * es + k] = old[v * es + k]; });
      // the accessor may be shared with another primitive: this one gets its own copy
      prim.setAttribute(sem, A.clone().setArray(arr));
    }
  }
  if (negate) {
    let N = prim.getAttribute('NORMAL');
    if (N) {
      if (N.listParents().filter(isPrim).length > 1) { N = N.clone(); prim.setAttribute('NORMAL', N); }
      const arr = N.getArray();
      const neg = (v) => { for (let k = 0; k < 3; k++) arr[v * 3 + k] = -arr[v * 3 + k]; };
      for (const v of negV) neg(v);
      for (let i = 0; i < dup.length; i++) neg(nV + i);
      N.setArray(arr);
    }
  }
  const out = nV + dup.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  prim.setIndices(I.listParents().filter(isPrim).length > 1 ? I.clone().setArray(out) : I.setArray(out));
}

/** Triangles of prim whose three vertex normals all point against their winding. */
function inwardNormalTris(prim, candidates) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), I = prim.getIndices();
  if (!N) return [];
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], n = [0, 0, 0], out = [];
  for (const t of candidates) {
    const i0 = I.getScalar(t * 3), i1 = I.getScalar(t * 3 + 1), i2 = I.getScalar(t * 3 + 2);
    P.getElement(i0, a); P.getElement(i1, b); P.getElement(i2, c);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const g = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const gl = Math.hypot(...g);
    // slivers have no dependable facing (and would flip back and forth between runs)
    const e2 = Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz);
    if (gl < 1e-12 || gl < 0.05 * e2) continue;
    let all = true;
    for (const i of [i0, i1, i2]) { N.getElement(i, n); if ((n[0] * g[0] + n[1] * g[1] + n[2] * g[2]) / gl > -0.2) { all = false; break; } }
    if (all) out.push(t);
  }
  return out;
}

/**
 * Turn doubleSided off on every opaque material whose back faces are never the nearest
 * surface from outside. Triangles only ever seen from behind are inside-out: they are
 * rewound, and their normals negated so they shade exactly as the double-sided path
 * shaded them. Front-facing triangles whose normals point inward (they render black) get
 * their normals negated. A material stays double-sided when a real two-sided sheet uses
 * it. tol / viewTol: share of the material's visible pixels (overall / in its worst view)
 * that may be back faces.
 */
export function fixSidedness(doc, rel, { tol = 0.001, viewTol = 0.002 } = {}) {
  const log = [];
  const root = doc.getRoot();
  if (root.listMeshes().some((m) => m.listPrimitives().some((p) => p.listTargets().length))) return log; // morph targets: leave alone
  const full = FULL_SPHERE.test(rel);
  const dirs = viewDirs(full);
  let soup = triangleSoup(doc);
  if (!soup.prims.length) return log;
  let vis = visibility(soup, dirs, !full);
  const opaque = (m) => m && m.getAlphaMode() === 'OPAQUE';
  const cand = new Set(root.listMaterials().filter((m) => m.getDoubleSided() && opaque(m)));
  // 1. rewind inside-out triangles of the candidate materials; fix inward normals
  let rewound = 0, renormal = 0;
  const per = new Map();
  for (const p of soup.prims) {
    const e = per.get(p.mat) || { front: 0, back: 0, backOnly: 0, flips: [] };
    const list = [], frontOnly = [];
    for (let t = 0; t < p.count; t++) {
      const f = vis.front[p.first + t], b = vis.back[p.first + t];
      e.front += f; e.back += b;
      if (b && !f) { e.backOnly += b; list.push(t); } else if (f && !b) frontOnly.push(t);
    }
    if (list.length) e.flips.push([p.prim, list]);
    per.set(p.mat, e);
    p.frontOnly = frontOnly;
  }
  const rewindPrims = new Set();
  for (const m of cand) {
    const e = per.get(m); if (!e || !e.back) continue;
    if ((e.back - e.backOnly) / (e.front + e.back) > tol) continue; // a real two-sided sheet: rewinding can't fix it
    for (const [prim, list] of e.flips) { retarget(prim, list, { rewind: true, negate: true }); rewound += list.length; rewindPrims.add(prim); }
  }
  for (const p of soup.prims) {
    if (!opaque(p.mat) || p.flip || rewindPrims.has(p.prim) || !p.frontOnly.length) continue;
    const bad = inwardNormalTris(p.prim, p.frontOnly);
    if (bad.length) { retarget(p.prim, bad, { rewind: false, negate: true }); renormal += bad.length; }
  }
  if (rewound) { soup = triangleSoup(doc); vis = visibility(soup, dirs, !full); }
  // 2. decide per material
  const tot = new Map();
  for (const p of soup.prims) {
    const e = tot.get(p.mat) || { front: 0, back: 0 };
    for (let t = 0; t < p.count; t++) { e.front += vis.front[p.first + t]; e.back += vis.back[p.first + t]; }
    tot.set(p.mat, e);
  }
  const kept = [];
  for (const m of cand) {
    const e = tot.get(m);
    const share = e && e.front + e.back ? e.back / (e.front + e.back) : 0;
    const w = vis.worst.get(m) || 0;
    if (share <= tol && w <= viewTol) m.setDoubleSided(false);
    else kept.push(`${m.getName()} ${(share * 100).toFixed(2)}%/${(w * 100).toFixed(1)}%`);
  }
  if (cand.size || renormal) {
    // "note:" = nothing a re-run would not find again (callers don't count it as a change)
    log.push(`${cand.size > kept.length || renormal ? 'sides' : 'note'}: ${cand.size - kept.length}/${cand.size} materials single-sided${rewound ? `, ${rewound} tris rewound` : ''}${renormal ? `, ${renormal} inward normals fixed` : ''}`
      + (kept.length ? `; still double (back share overall/worst view): ${kept.join(', ')}` : ''));
  }
  return log;
}

// ---------------------------------------------------------------- geometry
/** Weld, quantize and mark for meshopt compression (applied when the file is written). */
export async function optimizeGeometry(doc, rel) {
  const root = doc.getRoot();
  await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }), weld());
  return root;
}
export async function compressGeometry(doc, rel) {
  const root = doc.getRoot();
  const animated = root.listSkins().length > 0 || root.listAnimations().length > 0
    || root.listMeshes().some((m) => m.listPrimitives().some((p) => p.listTargets().length));
  if (root.listAnimations().length) await doc.transform(resample());
  // UVs only where they stay in [0, 1] (no KHR_texture_transform: the level swaps some
  // maps at runtime and would drop a transform)
  const uvs = root.listMeshes().flatMap((m) => m.listPrimitives()).flatMap((p) => p.listSemantics().filter((x) => /^TEXCOORD/.test(x)).map((x) => p.getAttribute(x)));
  const uvOK = uvs.every((a) => Math.min(...a.getMin([])) >= 0 && Math.max(...a.getMax([])) <= 1);
  const sem = ['NORMAL', ...(uvOK ? ['TEXCOORD_\\d+'] : []), ...(QUANT_POS_DIRS.test(rel) && !animated ? ['POSITION'] : [])];
  await doc.transform(
    reorder({ encoder: MeshoptEncoder }),
    quantize({ pattern: new RegExp(`^(${sem.join('|')})$`), quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14, cleanup: false }),
    // drop only the replaced accessors (no material / node dedup: the game looks both up by name)
    prune({ propertyTypes: [PropertyType.ACCESSOR], keepAttributes: true, keepLeaves: true }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}

/** Counters for reports. */
export function docStats(doc) {
  const root = doc.getRoot();
  let tris = 0, verts = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const P = p.getAttribute('POSITION'); if (!P) continue;
    verts += P.getCount(); tris += (p.getIndices() ? p.getIndices().getCount() : P.getCount()) / 3;
  }
  const mats = root.listMaterials();
  return { tris: Math.round(tris), verts, materials: mats.length, doubleSided: mats.filter((m) => m.getDoubleSided()).length,
    texBytes: root.listTextures().reduce((a, t) => a + (t.getImage() ? t.getImage().byteLength : 0), 0),
    vram: root.listTextures().reduce((a, t) => { const s = t.getSize() || [0, 0]; return a + s[0] * s[1] * 4 * 4 / 3; }, 0) };
}
