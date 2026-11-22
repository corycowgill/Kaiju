import * as THREE from 'three';
import { BuildingGrid } from './buildingGrid.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skinnedClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoWeather } from './levels/chicagoMaterials.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cachedFetch, cachedBlobURL, normalizeGLTFMaterials, disposeInstance, assetURL, withParseSlot, reportLoadError, isCodeBug, setKTX2Enabled, markShared } from './assetCache.js';
import { isMobile } from './quality.js';
import { buildChicago, loadChicagoLayout, chicagoBuildingGLBs, chicagoPropGLBs, chicagoVehicleGLBs, chicagoLod1GLBs } from './levels/chicago.js';
import { buildDc, loadDcLayout, dcBuildingGLBs, dcPropGLBs, dcVehicleGLBs, dcLod1GLBs } from './levels/dc.js';
import { DC_DEBRIS_GLBS } from './levels/dcManifest.js';
import { buildNyc, loadNycLayout, nycBuildingGLBs, nycPropGLBs, nycVehicleGLBs, nycLod1GLBs } from './levels/nyc.js';
import { NYC_DEBRIS_GLBS } from './levels/nycManifest.js';
import { buildSeattle, loadSeattleLayout, seattleBuildingGLBs, seattlePropGLBs, seattleVehicleGLBs, seattleLod1GLBs } from './levels/seattle.js';
import { SEATTLE_DEBRIS_GLBS } from './levels/seattleManifest.js';
import { buildSf, loadSfLayout, sfBuildingGLBs, sfPropGLBs, sfVehicleGLBs, sfLod1GLBs } from './levels/sf.js';
import { SF_DEBRIS_GLBS } from './levels/sfManifest.js';
import { buildTokyo as buildTokyoLevel, loadTokyoLayout, tokyoBuildingGLBs, tokyoPropGLBs, tokyoVehicleGLBs, tokyoLod1GLBs } from './levels/tokyo.js';
import { TOKYO_DEBRIS_GLBS } from './levels/tokyoManifest.js';
import { setArenaSite } from './levels/chicago_arena.js';

// Shared GLTFLoader instance — must be declared early because loadTreeTemplates()
// and loadPedestrianTemplates() run at module-load time via top-level await in game.js.
const _glbLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // GLBs are meshopt-compressed (tools/optimize_assets.mjs)

// Procedural Tokyo: districts of buildings on a city grid, with streets, lamps, and props.
// Each building exposes hp, max_hp, height and methods damage()/destroy().

// --------------- PBR ground textures (ambientCG CC0) ---------------
const _texLoader = new THREE.TextureLoader();
const TEX_BASE = './assets/textures/';

// One decode + one GPU upload per file: every (repeat, colour space) variant
// is a clone sharing the loaded image (three keys GPU textures by Source, and
// repeat is a uniform, not a texture parameter). Variants are cached too, so
// a rebuilt city (restartInPlace) reuses them.
const _groundBase = new Map();     // file -> { tex, loaded, clones }
const _groundTexCache = new Map(); // file|repeat|colourspace -> clone
function _groundTex(file, repeatX, repeatY, srgb) {
  const key = `${file}|${repeatX}|${repeatY}|${srgb ? 'srgb' : 'lin'}`;
  if (_groundTexCache.has(key)) return _groundTexCache.get(key);
  let base = _groundBase.get(file);
  if (!base) {
    base = { tex: null, loaded: false, clones: [] };
    base.tex = _texLoader.load(assetURL(TEX_BASE + file),
      () => { base.loaded = true; for (const c of base.clones) c.needsUpdate = true; },
      undefined,
      () => reportLoadError('GroundTex', TEX_BASE + file, new Error('image load failed')));
    _groundBase.set(file, base);
  }
  const t = base.tex.clone();
  if (!base.loaded) t.version = 0; // nothing to upload until the shared image arrives
  base.clones.push(t);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  _groundTexCache.set(key, t);
  return t;
}
function _loadTileTex(file, repeatX, repeatY) { return _groundTex(file, repeatX, repeatY, true); }
function _loadDataTex(file, repeatX, repeatY) { return _groundTex(file, repeatX, repeatY, false); }

// Ground plane (large area, coarse tiling)
const GROUND_TILE = 80; // world units per texture repeat
const GROUND_REPEATS = 1600 / GROUND_TILE;
const _groundColor = _loadTileTex('concrete_color.jpg', GROUND_REPEATS, GROUND_REPEATS);
const _groundNorm  = _loadDataTex('concrete_normal.jpg', GROUND_REPEATS, GROUND_REPEATS);
const _groundRough = _loadDataTex('concrete_roughness.jpg', GROUND_REPEATS, GROUND_REPEATS);
const _groundAO    = _loadDataTex('concrete_ao.jpg', GROUND_REPEATS, GROUND_REPEATS);

// Building lot ground patches (dark concrete)
const LOT_TILE = 12; // world units per texture repeat

// Asphalt streets (smaller tile for detail)
const STREET_TILE = 12; // world units per texture repeat

// Sidewalk paving stones
// Worn road-paint texture for crosswalks / stop lines: white RGBA canvas
// whose alpha is broken up by speckle and a few scuffed tyre streaks, so
// markings read as old paint instead of crisp glowing decals.
let _wornPaintTex = null; // built once, reused by every rebuilt city
function _makeWornPaintTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Two octaves of cheap hash noise: fine speckle + coarse patches.
      const fine = Math.random();
      const coarse = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(y * 0.05) * 2.0) * Math.cos(y * 0.06 + x * 0.013);
      let a = 0.92 - (fine < 0.10 ? 0.6 : 0) - (coarse < 0.18 ? 0.45 : 0);
      const lum = 225 + (Math.random() * 25 | 0);
      const i = (y * S + x) * 4;
      d[i] = lum; d[i + 1] = lum; d[i + 2] = lum - 6;
      d[i + 3] = Math.max(0, Math.min(255, a * 255)) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Tyre scuffs: dark translucent streaks that eat into the paint alpha.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * S, 0, 6 + Math.random() * 14, S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const SIDEWALK_TILE = 6; // world units per texture repeat

const BUILDING_PALETTE = [
  0xb0b8c4, 0x9aa3ad, 0x7d8694, 0xc8cbd1, 0x6f7a87,
  0xa8b0a8, 0xc0b8a8, 0x8090a0, 0xddc8a0, 0x556677,
];
const NEON_COLORS = [0xff3366, 0x33ddff, 0xffaa22, 0xaa66ff, 0x66ff99, 0xffee44];

// Pool of Japanese sign phrases (food, entertainment, services, kanji+kana mix).
// Used by makeNeonSignTexture to bake a glowing label canvas-texture and
// then attached as both map + emissiveMap on the sign material so the
// glyphs actually emit light through bloom.
const NEON_PHRASES = [
  'カラオケ', 'ラーメン', '寿司', 'バー', 'ホテル', '居酒屋',
  'パチンコ', 'ゲーム', '焼鳥', '銀行', '東京', 'カフェ',
  'コンビニ', '書店', '映画', '怪獣', '電気', '地下鉄',
];
// Cache: one CanvasTexture per (phrase, color) so repeated buildings reuse.
const _signTexCache = new Map();
// vertical: one letter per row, stacked top to bottom (a theatre blade sign)
function makeNeonSignTexture(text, colorHex, vertical = false) {
  const key = text + ':' + colorHex + (vertical ? ':v' : '');
  const hit = _signTexCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  if (vertical) { c.width = 64; c.height = 64 * text.length; } else { c.width = 256; c.height = 96; }
  const g = c.getContext('2d');
  g.fillStyle = '#0a0006';
  g.fillRect(0, 0, c.width, c.height);
  const colorStr = '#' + colorHex.toString(16).padStart(6, '0');
  // Layered glow then crisp text on top
  g.font = 'bold 56px "Noto Sans JP", "Yuji Mai", sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.shadowColor = colorStr;
  g.shadowBlur = 28;
  g.fillStyle = colorStr;
  // Rows: the whole string centred, or one letter per 64px cell
  const lines = vertical ? [...text].map((ch, i) => [ch, 32 + i * 64]) : [[text, c.height / 2]];
  for (const [t, y] of lines) g.fillText(t, c.width / 2, y);
  g.shadowBlur = 14;
  for (const [t, y] of lines) g.fillText(t, c.width / 2, y);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  for (const [t, y] of lines) g.fillText(t, c.width / 2, y);
  // Thin border frame
  g.strokeStyle = colorStr;
  g.lineWidth = 4;
  g.strokeRect(2, 2, c.width - 4, c.height - 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _signTexCache.set(key, tex);
  return tex;
}

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ----------------------- Landmark mesh helpers -----------------------

// --------------- GLB tree templates ---------------
// v2 low-poly trees (h = height in world units at scale 1); the old Meshy
// trees (~18k tris each) load only if none of these do.
// Set ready: true only once the file is on disk and has passed preview, so
// missing assets never 404 at load.
const TREE_GLBS = [
  { url: './assets/trees/tree_zelkova.glb',    h: 7.0, ready: true },
].filter((t) => t.ready);
const TREE_GLBS_FALLBACK = [
  { url: './assets/trees/normal_tree.glb' },
];
const _treeTemplates = [];  // array of { scene, box, h } after loading

// --------------- GLB street props (v2) ---------------
// Static props built with the artist pipeline: bottom-centre origin, front
// faces +Z. Each one replaces (or adds to) a procedural builder below; when a
// file fails to load, the procedural version is used instead.
const PROP_GLB_BASE = './assets/props/';
// The shared props every level may use: the plain lamp and the rooftop kit (each level's own street
// furniture comes from its manifest)
const PROP_GLBS_READY = new Set(['street_lamp', 'roof_water_tank', 'roof_ac_cluster', 'roof_antenna']);
const _propTemplates = new Map(); // name -> { scene, size }

// --------------- LOD1 (far) geometry ---------------
// Decimated (~28% tris) geometry-only twins of the small, many-instance props
// (<name>_lod1.glb next to the LOD0 file, no materials or textures). They reuse
// the LOD0 materials, which is safe because decimation keeps the UVs, and are
// matched to the LOD0 meshes by traversal order. List a URL only once its
// _lod1 file is on disk.
const LOD1_READY = new Set([
  './assets/trees/tree_zelkova.glb', './assets/props/street_lamp.glb',
]);
for (const u of chicagoLod1GLBs()) LOD1_READY.add(u);
// The map-built levels after Chicago (src/levels/<key>.js), all on Chicago's
// US street kit: layout loader, builder, asset lists, own debris (set when
// the level has any) and phone LOW's box-rubble tint
const MAP_LEVELS = {
  dc: { load: loadDcLayout, build: buildDc, buildings: dcBuildingGLBs, props: dcPropGLBs, vehicles: dcVehicleGLBs, lod1: dcLod1GLBs, debris: DC_DEBRIS_GLBS, boxTint: 0xd6d0c4 },
  nyc: { load: loadNycLayout, build: buildNyc, buildings: nycBuildingGLBs, props: nycPropGLBs, vehicles: nycVehicleGLBs, lod1: nycLod1GLBs, debris: NYC_DEBRIS_GLBS, boxTint: null },
  seattle: { load: loadSeattleLayout, build: buildSeattle, buildings: seattleBuildingGLBs, props: seattlePropGLBs, vehicles: seattleVehicleGLBs, lod1: seattleLod1GLBs, debris: SEATTLE_DEBRIS_GLBS, boxTint: null },
  tokyo: { load: loadTokyoLayout, build: buildTokyoLevel, buildings: tokyoBuildingGLBs, props: tokyoPropGLBs, vehicles: tokyoVehicleGLBs, lod1: tokyoLod1GLBs, debris: TOKYO_DEBRIS_GLBS, boxTint: null },
  sf: { load: loadSfLayout, build: buildSf, buildings: sfBuildingGLBs, props: sfPropGLBs, vehicles: sfVehicleGLBs, lod1: sfLod1GLBs, debris: SF_DEBRIS_GLBS, boxTint: null },
};
const _usLevel = (level) => level === 'chicago' || !!MAP_LEVELS[level];
for (const k in MAP_LEVELS) for (const u of MAP_LEVELS[k].lod1()) LOD1_READY.add(u);
// Twins whose shape is checked against their LOD0 on attach (DC's: a twin
// that lost its dome failed silently at distance). Chicago's box LODs differ
// from their LOD0 by design (the bascule leaves), so the check is opt-in.
const LOD1_STRICT = new Set([...dcLod1GLBs(), ...nycLod1GLBs(), ...seattleLod1GLBs(), ...sfLod1GLBs(), ...tokyoLod1GLBs()]);
const _lod1Rejected = new Map(); // url -> why (smoke test lists them)
/** LOD1 twins left out because their shape does not match their LOD0 (url -> reason). */
export function lod1Rejected() { return _lod1Rejected; }
const _lod1ByGeom = new Map(); // LOD0 BufferGeometry -> LOD1 BufferGeometry
const _lod1Attached = new Set(); // LOD0 urls whose twin registered (smoke test)
// Beyond this distance (camera to a 120u instancing tile's centre, or kaiju to
// a moving car) the LOD1 geometry is drawn instead
const LOD1_DIST = 150;

const _isIdentity = (m) => m.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);
/** Copy of g with every attribute as plain floats (quantized / normalized
 *  ints decoded), safe to transform in place. */
function _floatGeom(g) {
  const out = g.clone();
  for (const [name, a] of Object.entries(out.attributes)) {
    if (!a.isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized) continue;
    const f = new Float32Array(a.count * a.itemSize);
    const get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a[get[k]](i);
    out.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  return out;
}
/** Load url's _lod1 twin (if listed) and register its geometries against scene's meshes. */
function _attachLod1(url, scene) {
  if (!LOD1_READY.has(url)) return Promise.resolve();
  return _cachedGLB(url.replace(/\.glb$/, '_lod1.glb')).then((gltf) => {
    const m0 = [], m1 = [];
    scene.traverse((o) => { if (o.isMesh) m0.push(o); });
    gltf.scene.traverse((o) => { if (o.isMesh) m1.push(o); });
    if (m0.length !== m1.length) {
      reportLoadError('LOD', url, new Error(`LOD1 mesh count mismatch (${m1.length} vs ${m0.length}), skipped`));
      return;
    }
    // Twins are swapped geometry-only under the LOD0 node, so a LOD1 whose
    // node transform differs (quantized phone GLBs carry their dequantize
    // scale / offset on the mesh node) is moved into its LOD0's mesh space
    scene.updateMatrixWorld(true); gltf.scene.updateMatrixWorld(true);
    const rel = new THREE.Matrix4();
    const twins = m0.map((m, i) => {
      rel.copy(m.matrixWorld).invert().multiply(m1[i].matrixWorld);
      return _isIdentity(rel) ? m1[i].geometry : _floatGeom(m1[i].geometry).applyMatrix4(rel);
    });
    // Same count is not enough: a twin that lost a part (a dome decimated
    // away, meshes in another order) would draw that building without it
    // from LOD1_DIST on. Each twin's box must match its LOD0's to 8% of the
    // model's size, else the model keeps LOD0 everywhere (and it is reported)
    const all = new THREE.Box3(), b0 = new THREE.Box3(), b1 = new THREE.Box3();
    for (const m of m0) { m.geometry.computeBoundingBox(); all.union(m.geometry.boundingBox); }
    const tol = all.getSize(new THREE.Vector3()).length() * 0.08;
    for (let i = 0; i < m0.length && LOD1_STRICT.has(url); i++) {
      b0.copy(m0[i].geometry.boundingBox);
      twins[i].computeBoundingBox(); b1.copy(twins[i].boundingBox);
      if (b0.min.distanceTo(b1.min) > tol || b0.max.distanceTo(b1.max) > tol) {
        // The model keeps LOD0 at every distance: correct, a little dearer. An
        // asset to fix, not a load failure (listed by the smoke test, logged here)
        _lod1Rejected.set(url, `mesh ${i} box off by more than 8% of the model`);
        console.info('[LOD] ' + url + ': LOD1 mesh ' + i + ' does not match its LOD0, LOD0 kept');
        return;
      }
    }
    m0.forEach((m, i) => _lod1ByGeom.set(m.geometry, twins[i]));
    _lod1Attached.add(url);
  }).catch((err) => {
    // LOD0 still works; the tile just keeps drawing full detail
    reportLoadError('LOD', url.replace(/\.glb$/, '_lod1.glb'), err);
  });
}

const PROP_GLBS_GENERIC = ['street_lamp', 'roof_water_tank', 'roof_ac_cluster', 'roof_antenna'];
const _propLoading = new Map(); // name -> Promise (each prop loads once)

/** Load prop templates [{ name, url }] not loaded yet. */
function _loadProps(list) {
  return Promise.all(list.map(({ name, url }) => {
    if (!_propLoading.has(name)) {
      _propLoading.set(name, _cachedGLB(url).then((gltf) => {
        const s = gltf.scene;
        s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        s.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(s).getSize(new THREE.Vector3());
        _propTemplates.set(name, { scene: s, size });
        return _attachLod1(url, s);
      }).catch((err) => {
        reportLoadError('PropGLB', url, err);
      }));
    }
    return _propLoading.get(name);
  }));
}

/** The level's prop list as [{ name, url }]: the shared kit, Chicago's US street kit on the US levels
 *  (its acorn lamp is the Washington globe), and the level's own. */
function _levelProps(level) {
  return [...PROP_GLBS_GENERIC.filter((n) => PROP_GLBS_READY.has(n)).map((name) => ({ name, url: PROP_GLB_BASE + name + '.glb' })),
    ...(level === 'tokyo' ? [] : chicagoPropGLBs()), ...(MAP_LEVELS[level] ? MAP_LEVELS[level].props() : [])];
}

function loadPropTemplates(level = 'tokyo') {
  return _loadProps(_levelProps(level));
}

/** Clone a prop scaled to `height` world units, sitting on y=0. Null if not loaded. */
function _cloneProp(name, height) {
  const tpl = _propTemplates.get(name);
  if (!tpl) return null;
  const clone = _cloneTreeScene(tpl);
  clone.scale.setScalar(height / tpl.size.y);
  return clone;
}

/** Deep-clone a GLTF scene by rebuilding the mesh hierarchy (more robust than scene.clone). */
function _cloneTreeScene(tpl) {
  const group = new THREE.Group();
  tpl.scene.traverse((o) => {
    if (o.isMesh) {
      const m = new THREE.Mesh(o.geometry, o.material);
      // Copy the mesh's world transform relative to scene root
      o.updateWorldMatrix(true, false);
      m.applyMatrix4(o.matrixWorld);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  });
  return group;
}

function _loadTreeList(list, onProgress) {
  return Promise.all(list.map((def, idx) =>
    new Promise((resolve) => {
      const url = def.url;
      // Same cached, concurrency-limited, retried path as every other GLB.
      _cachedGLB(url).then((gltf) => {
        const s = gltf.scene;
        let meshCount = 0;
        s.traverse((o) => { if (o.isMesh) meshCount++; });
        console.log(`[TreeGLB] Loaded ${url} — ${meshCount} meshes`);
        if (meshCount === 0) {
          reportLoadError('TreeGLB', url, new Error('no meshes found'));
          resolve();
          return;
        }
        s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        normalizeGLTFMaterials(s);
        const box = new THREE.Box3().setFromObject(s);
        const size = box.getSize(new THREE.Vector3());
        console.log(`[TreeGLB] Bounding box: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`);
        _treeTemplates.push({ scene: s, box, h: def.h, url });
        if (onProgress) onProgress(idx + 1, list.length, url.split('/').pop().replace('.glb', ''));
        _attachLod1(url, s).then(resolve);
      }).catch((err) => {
        // .catch (not a then() rejection handler) so a throw in the success
        // path still resolves; otherwise the top-level await in game.js hangs
        reportLoadError('TreeGLB', url, err);
        if (onProgress) onProgress(idx + 1, list.length, 'error');
        resolve();
      });
    })
  ));
}

/** Load tree GLB templates (and the level's v2 street props, which buildCity
 *  also needs before it runs). Call once at startup. */
export async function loadTreeTemplates(onProgress, level = 'tokyo') {
  await Promise.all([_loadTreeList(TREE_GLBS, onProgress), loadPropTemplates(level)]);
  if (_treeTemplates.length === 0) await _loadTreeList(TREE_GLBS_FALLBACK, onProgress);
}

/** Boot-time templates (props, vehicles) for a level picked after boot;
 *  loads only what is missing. Trees and pedestrians are shared. */
export function loadLevelTemplates(level, onProgress) {
  return Promise.all([loadPropTemplates(level), loadCarTemplates(onProgress, level)]);
}

// --------------- Static batching (draw-call reduction) ---------------
// Props are tagged where they are created and folded together once at the
// end of buildCity. Nothing here is ever moved, destroyed or raycast.
//  - userData.instance: a GLB clone (tree, parked car). Every mesh of every
//    tagged clone becomes one instance of an InstancedMesh per
//    (geometry, material, BATCH_TILE x BATCH_TILE tile); tiles keep frustum
//    culling effective.
//  - userData.batch: a plain static Mesh child of the scene (street strips,
//    lot pads, cables). Merged into one BufferGeometry per material.
const BATCH_TILE = 120;

// tile / lodDist: a level may batch into bigger tiles and switch to LOD1
// sooner (Chicago on phones); Tokyo uses the defaults.
// smallCull (phones): { px, maxH, keep } hides a tile of small props (under
// maxH tall, template not matching keep) once its nearest instance would be
// under ~px CSS pixels tall on a phone-sized view, so nothing visibly pops.
function _instanceStaticClones(scene, tile = BATCH_TILE, lodDist = LOD1_DIST, smallCull = null) {
  scene.updateMatrixWorld(true);
  const clones = [];
  scene.traverse((o) => { if (o.userData.instance) clones.push(o); });
  const buckets = new Map();
  for (const c of clones) {
    // userData.instanceTile: a coarser tile for one kind (lot cars: many
    // small copies spread thin, where 120u tiles cost a draw each)
    const t = c.userData.instanceTile || tile;
    c.traverse((m) => {
      if (!m.isMesh) return;
      const e = m.matrixWorld.elements;
      // (t Infinity: one tile for the whole map; a finite one splits at the origin's axes at least)
      const key = `${m.geometry.uuid}|${m.material.uuid}|${t}:${t === Infinity ? 'all' : Math.floor(e[12] / t) + ',' + Math.floor(e[14] / t)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { geometry: m.geometry, material: m.material, recv: m.receiveShadow, lodDistance:c.userData.instanceLodDistance, matrices: [] });
      b.matrices.push(m.matrixWorld.clone());
    });
  }
  _removeChildren(new Set(clones));
  const lodPairs = [];
  for (const b of buckets.values()) {
    const cull2 = smallCull ? _smallCullDist2(b, smallCull) : 0;
    const ims = [b.geometry, _lod1ByGeom.get(b.geometry)].filter(Boolean).map((geom) => {
      const im = new THREE.InstancedMesh(_ownVAO(geom), b.material, b.matrices.length);
      b.matrices.forEach((mat, i) => im.setMatrixAt(i, mat));
      // Small static props (trees, parked cars, street props) don't cast: the
      // tiles inside the shadow frustum were redrawing ~millions of triangles
      // in the shadow pass. They still receive the kaiju/building shadows.
      im.castShadow = false;
      im.receiveShadow = b.recv;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      scene.add(im);
      return im;
    });
    // Same tile, same instances: exactly one of the pair is visible, so the
    // draw-call count doesn't change
    if (ims.length === 2) ims[1].visible = false;
    if (ims.length === 2 || cull2) {
      const bs = ims[0].boundingSphere;
      lodPairs.push({ near: ims[0], far: ims[1] || null, center: bs.center, dist2:b.lodDistance?b.lodDistance*b.lodDistance:0, cull2: cull2 && (Math.sqrt(cull2) + bs.radius) ** 2 });
    }
  }
  if (lodPairs.length) _makeLodController(scene, lodPairs, lodDist);
}

/** A geometry of its own over the same buffers (index, attributes, groups,
 *  bounds and userData shared, so nothing is uploaded twice). three keys a
 *  vertex-array object by geometry and program, not by mesh: the tile
 *  batches of one template, each with its own instanceMatrix, rebuilt that
 *  VAO (a vertexAttribPointer per attribute) on every draw of every frame.
 *  Teardown leaves a template's copies alone like the template itself, so
 *  the next buildCity disposes them (_releaseVAOCopies): three then deletes
 *  the shared buffers too and uploads them again on their next draw. */
const _vaoCopies = new Set();
function _releaseVAOCopies() {
  for (const g of _vaoCopies) g.dispose();
  _vaoCopies.clear();
}
function _ownVAO(geom) {
  const g = new THREE.BufferGeometry();
  _vaoCopies.add(g);
  g.name = geom.name;
  g.index = geom.index;
  for (const k in geom.attributes) g.attributes[k] = geom.attributes[k];
  g.morphAttributes = geom.morphAttributes;
  g.morphTargetsRelative = geom.morphTargetsRelative;
  g.groups = geom.groups;
  g.drawRange = geom.drawRange;
  if (!geom.boundingBox) geom.computeBoundingBox();
  if (!geom.boundingSphere) geom.computeBoundingSphere();
  g.boundingBox = geom.boundingBox;
  g.boundingSphere = geom.boundingSphere;
  g.userData = geom.userData;
  return g;
}

// Squared distance past which a bucket's props are under smallCull.px tall
// on screen (a ~450 CSS px tall landscape phone view, 70 deg FOV: h u at d u
// is ~h * 320 / d px); 0 when the bucket isn't small or is kept.
const _cullBox = new THREE.Box3();
function _smallCullDist2(b, { px, maxH, keep }) {
  if (keep && (keep.test(b.material.name || '') || keep.test(b.geometry.name || ''))) return 0;
  if (!b.geometry.boundingBox) b.geometry.computeBoundingBox();
  let h = 0;
  for (const m of b.matrices) { _cullBox.copy(b.geometry.boundingBox).applyMatrix4(m); h = Math.max(h, _cullBox.max.y - _cullBox.min.y); }
  if (!(h > 0) || h >= maxH) return 0;
  const d = h * 320 / px;
  return d * d;
}

/** Run fn(camera) once per render() of scene, with its camera, before the
 *  shadow pass and the render list are built (three calls Scene.onBeforeRender
 *  first). Replaces the invisible 'camera probe' meshes, which cost a
 *  program bind and uniform setup in the main pass every frame. */
function _onCamera(scene, fn) {
  if (!scene.userData.camHooks) {
    const hooks = scene.userData.camHooks = [];
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (renderer, s, camera, target) => {
      prev.call(scene, renderer, s, camera, target);
      for (const h of hooks) h(camera);
    };
  }
  scene.userData.camHooks.push(fn);
}

/** Flips each tile pair between LOD0 and LOD1 by the main camera's distance
 *  (before the frame's draw calls). far: null for a tile without a LOD1
 *  twin; cull2: squared center distance past which the tile is hidden. */
function _makeLodController(scene, pairs, dist = LOD1_DIST) {
  const camPos = new THREE.Vector3();
  const d2 = dist * dist;
  _onCamera(scene, (camera) => {
    camera.getWorldPosition(camPos);
    for (const p of pairs) {
      const c2 = p.center.distanceToSquared(camPos);
      if (p.cull2 && c2 > p.cull2) {
        p.near.visible = false;
        if (p.far) p.far.visible = false;
        continue;
      }
      const far = !!p.far && c2 > (p.dist2||d2);
      p.near.visible = !far;
      if (p.far) p.far.visible = far;
    }
  });
}

function _mergeStaticMeshes(scene) {
  const groups = new Map();
  for (const m of scene.children) {
    if (!m.isMesh || !m.userData.batch) continue;
    const attrs = Object.keys(m.geometry.attributes).sort().join();
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${attrs}|${!!m.geometry.index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const oldGeoms = new Set(), gone = new Set();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const merged = mergeGeometries(list.map((m) => m.geometry.clone().applyMatrix4(m.matrix)), false);
    if (!merged) continue; // incompatible attributes: keep the originals
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    for (const m of list) { gone.add(m); oldGeoms.add(m.geometry); }
  }
  _removeChildren(gone);
  for (const g of oldGeoms) g.dispose();
}

// Detach many children at once: Object3D.remove is an indexOf + splice per
// call, so removing thousands of a parent's children one by one was O(n^2)
// (Chicago: ~3.8k buildings' worth of props and strips on the scene). Same
// result and 'removed' events as remove(); child order is preserved.
function _removeChildren(set) {
  const parents = new Set();
  for (const o of set) { if (o.parent) parents.add(o.parent); }
  for (const p of parents) p.children = p.children.filter((c) => !set.has(c));
  for (const o of set) {
    if (!o.parent) continue;
    o.parent = null;
    o.dispatchEvent({ type: 'removed' });
  }
}

// Single tree: uses GLB clone if templates loaded, else procedural fallback.
// Tree species a level leaves out (Chicago: no cherry blossom or Japanese
// black pine); set by buildCity. Falls back to every template if that
// would leave none.
let _treeExclude = new Set();
// Foliage tint a level multiplies into the tree materials (Chicago: deeper
// summer green under its warm light); tinted clones are cached per source.
let _treeTint = null;
const _treeTintMats = new Map(); // `${uuid}|${hex}` -> tinted clone
function _tintTree(group) {
  if (!_treeTint) return;
  group.traverse((m) => {
    if (!m.isMesh) return;
    const key = m.material.uuid + '|' + _treeTint.getHexString();
    let t = _treeTintMats.get(key);
    if (!t) {
      t = m.material.clone();
      // Only foliage is muted by the summer shader; bark retains its brown.
      t.color.multiplyScalar(.94);t.metalness=0;t.roughness=.94;
      chicagoWeather(t,5);
      _treeTintMats.set(key, t);
    }
    m.material = t;
  });
}
function _treePool() {
  const ok = _treeTemplates.filter((t) => !_treeExclude.has(t.url));
  return ok.length ? ok : _treeTemplates;
}

function makeTree(x = 0, z = 0, scale = 1) {
  const pool = _treePool();
  if (pool.length > 0) {
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    // Robust clone: rebuild meshes from geometry/material refs
    const clone = _cloneTreeScene(tpl);
    // v2 trees: their own height (tpl.h) at scale=1; old trees: ~6 units by largest side
    const size = tpl.box.getSize(new THREE.Vector3());
    const targetH = (tpl.h || 6.0) * scale;
    const s = targetH / (tpl.h ? size.y : Math.max(size.x, size.y, size.z));
    clone.scale.setScalar(s);
    // Update world matrices so bounding box is accurate
    clone.updateMatrixWorld(true);
    const cloneBox = new THREE.Box3().setFromObject(clone);
    clone.position.y = -cloneBox.min.y;
    clone.rotation.y = Math.random() * Math.PI * 2;
    clone.position.x = x;
    clone.position.z = z;
    clone.userData.instance = true; // folded into InstancedMeshes by _instanceStaticClones
    _tintTree(clone);
    return clone;
  }

  // Procedural fallback (mobile, or no tree GLBs). Geometry and materials
  // are shared by every fallback tree, scaled per tree via the group, and
  // tagged for _instanceStaticClones like the GLB trees.
  if (!_fallbackTree) {
    _fallbackTree = {
      trunkGeom: new THREE.CylinderGeometry(0.35, 0.5, 4, 6),
      leafGeom: new THREE.SphereGeometry(2, 8, 6),
      trunkMat: new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.95 }),
      leafMat: new THREE.MeshStandardMaterial({ color: 0x346a2a, roughness: 0.85 }),
    };
    // Shared by every tree and every rebuilt city: never dispose.
    _fallbackTree.trunkGeom.userData.template = true;
    _fallbackTree.leafGeom.userData.template = true;
  }
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(_fallbackTree.trunkGeom, _fallbackTree.trunkMat);
  trunk.position.y = 2;
  tree.add(trunk);
  const leaves = new THREE.Mesh(_fallbackTree.leafGeom, _fallbackTree.leafMat);
  leaves.position.y = 5;
  leaves.scale.set(1.2, 1.0, 1.2);
  tree.add(leaves);
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  tree.userData.instance = true;
  return tree;
}
let _fallbackTree = null;

// ---------- Real Tokyo landmark mesh helpers ----------

// Flush any pending body-IM color/matrix changes once per frame.
export function flushBodiesIM(im) {
  if (!im) return;
  if (im._colorDirty && im.instanceColor) {
    im.instanceColor.needsUpdate = true;
    im._colorDirty = false;
  }
  if (im._matrixDirty) {
    im.instanceMatrix.needsUpdate = true;
    im._matrixDirty = false;
  }
}

// Build a single InstancedMesh for every building body. Saves ~one draw
// call per building (the body is what the player primarily sees).
function buildGlobalBodies(scene, buildings) {
  if (!buildings.length) return null;
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.85, metalness: 0.1, vertexColors: false,
  });
  // unit cube; scaled per-instance via matrix
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(geom, mat, buildings.length);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(buildings.length * 3), 3);
  // City bodies span the whole map; let the renderer skip the per-instance
  // bounding-sphere test by disabling object-level frustum culling. There's
  // only one mesh.
  im.frustumCulled = false;
  // Buildings receive the kaiju's shadow but don't cast (1024 shadow map is
  // tight enough that distant casters would alias badly).
  im.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const _skipMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  let shown = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b._skipBodyIM) shown++;
    if (b._skipBodyIM) {
      // Landmark with its own custom mesh -- park its IM slot at zero scale
      // but still register the index so collapse() can address it.
      im.setMatrixAt(i, _skipMatrix);
      im.setColorAt(i, b.bodyColor);
    } else {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, b.bodyColor);
    }
    b._bodyIM = im;
    b._bodyIndex = i;
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  // Every body parked (Chicago: all GLB): nothing to draw. It was still one
  // draw of 12 x count triangles each frame, and an instance-colour upload on
  // every frame a building took damage. Raycasts don't need it visible.
  im.visible = shown > 0;
  scene.add(im);
  return im;
}

// Build the two global window InstancedMeshes from the queue and register
// each entry on its owning Building so collapse can hide them.
// Synthwave window palette. Each emissive bucket gets its own InstancedMesh so
// per-window colour variation is essentially free (no per-instance shader
// patching needed). 'off' is the dim/un-lit bucket.
const WINDOW_BUCKETS_DEFAULT = [
  { name: 'off',   color: 0x111822, emissive: 0x000000, intensity: 0.0, weight: 0.30 },
  { name: 'pink',  color: 0x331122, emissive: 0xff3388, intensity: 2.6, weight: 0.16 },
  { name: 'cyan',  color: 0x003344, emissive: 0x33ddff, intensity: 2.4, weight: 0.16 },
  { name: 'amber', color: 0x442211, emissive: 0xffaa44, intensity: 2.2, weight: 0.22 },
  { name: 'white', color: 0x332a22, emissive: 0xffeedd, intensity: 1.8, weight: 0.16 },
];
function pickWindowBucket(WINDOW_BUCKETS) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < WINDOW_BUCKETS.length; i++) {
    acc += WINDOW_BUCKETS[i].weight;
    if (r < acc) return i;
  }
  return WINDOW_BUCKETS.length - 1;
}

// palette: the level's window palette (same shape as WINDOW_BUCKETS_DEFAULT, 'off' first)
function buildGlobalWindows(scene, palette) {
  const WINDOW_BUCKETS = palette || WINDOW_BUCKETS_DEFAULT;
  if (_windowQueue.length === 0) return null;
  const geom = new THREE.BoxGeometry(0.6, 1.2, 0.15);
  // Track the lit emissive materials so we can pulse their intensity
  // on a slow sin wave. Returned to buildCity for cityAnimators wiring.
  const litMats = [];
  // Bucket every window. Buildings whose owner had `lit:false` (we tag this
  // at queue time) skew heavily to the 'off' bucket; otherwise they pick
  // from the synthwave palette weights.
  const buckets = WINDOW_BUCKETS.map(() => []);
  for (const w of _windowQueue) {
    let bIdx;
    if (!w.lit) {
      // 80% off, 20% any of the lit colours -- gives the unlit buildings a
      // few stray glowing windows so the city never looks completely dead.
      bIdx = Math.random() < 0.8 ? 0 : (1 + Math.floor(Math.random() * 4));
    } else {
      bIdx = pickWindowBucket(WINDOW_BUCKETS);
    }
    buckets[bIdx].push(w);
  }
  // Build one IM per bucket
  for (let i = 0; i < WINDOW_BUCKETS.length; i++) {
    const cfg = WINDOW_BUCKETS[i];
    const list = buckets[i];
    if (!list.length) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: cfg.intensity,
      roughness: 0.5,
      metalness: 0.0,
    });
    const im = new THREE.InstancedMesh(geom, mat, list.length);
    im.frustumCulled = false;
    im.matrixAutoUpdate = false; im.updateMatrix();
    for (let j = 0; j < list.length; j++) {
      const w = list[j];
      im.setMatrixAt(j, w.matrix);
      w.b.windowEntries.push({ im, idx: j });
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    if (i > 0) litMats.push({ mat, base: cfg.intensity, phase: i * 1.7 });
  }
  _windowQueue = [];
  // Animator: pulse each lit bucket on its own sin wave so the city
  // breathes. Each colour gets a different phase so they don't pulse
  // in unison. Amplitude is small (15%) -- just enough to feel alive.
  return {
    update(dt, time) {
      for (const m of litMats) {
        const pulse = 0.85 + 0.15 * Math.sin(time * 0.6 + m.phase);
        m.mat.emissiveIntensity = m.base * pulse;
      }
    },
  };
}

let LITE_MODE = false;
export function setBuildingLite(v) { LITE_MODE = !!v; }

// Spatial grid keyed by 60u cells. Lets per-frame queries (collisions, AOE
// damage, camera collision raycast) skip the 90% of buildings that aren't
// nearby instead of iterating the whole list.
export { BuildingGrid };

// Global window pipeline. Buildings push their window matrices here;
// after all buildings exist, buildCity merges them into 2 InstancedMesh
// (one lit, one dim) so the entire skyline's windows cost 2 draw calls.
let _windowQueue = [];
const _zeroMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);

export class Building {
  constructor(x, z, w, d, h, opts = {}) {
    this.x = x; this.z = z; this.w = w; this.d = d; this.h = h;
    this.maxHp = Math.max(20, Math.floor(h * 1.4 + w * d * 0.18));
    this.hp = this.maxHp;
    this.destroyed = false;
    this.debris = [];
    this.windows = [];
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const baseColor = opts.color || pick(BUILDING_PALETTE);
    // Body is no longer a per-building Mesh -- it's an instance in the global
    // InstancedMesh built by buildGlobalBodies(). Record the data for later.
    this.bodyColor = new THREE.Color(baseColor);
    this._bodyIndex = -1;
    // Lightweight stand-in so existing code paths (b.body.material.color
    // mutations) don't crash. Replaced by the IM at scene level.
    this.body = { material: { color: this.bodyColor }, userData: { building: this } };

    // Bail early for landmarks with custom meshes -- they don't want the
    // generic procedural water tanks / AC vents / billboards / neon signs /
    // awnings / roof variants painted on top.
    if (opts.skipWindows) {
      this.windowEntries = [];
      return;
    }

    // noDecor: no Tokyo street dressing (neon signs, billboards, pagoda /
    // dome roofs, awnings) for other cities; tanks, vents, antennas and
    // windows stay.
    const decor = !opts.noDecor;
    // noRoofProps: no per-building rooftop meshes (each is its own draw);
    // a level that instances its own roof dressing sets it
    const roofProps = !opts.noRoofProps;
    // Rooftop details (probabilities tuned down to keep mesh count manageable)
    const wantTank = roofProps && h > 14 && Math.random() < 0.4;
    if (wantTank && _propTemplates.has('roof_water_tank')) {
      // v2 GLB water tank on its stand
      const tank = _cloneProp('roof_water_tank', Math.min(4.0, Math.min(w, d) * 0.45));
      tank.position.set(rand(-w*0.25, w*0.25), h, rand(-d*0.25, d*0.25));
      tank.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(tank);
    } else if (wantTank) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(w, d) * 0.18, Math.min(w, d) * 0.2, 1.6, 10),
        new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.85 })
      );
      tank.position.set(rand(-w*0.25, w*0.25), h + 0.8, rand(-d*0.25, d*0.25));
      tank.castShadow = true;
      this.group.add(tank);
      // tank ladder
      const lad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      lad.position.copy(tank.position);
      lad.position.y = h + 0.8;
      lad.position.x += Math.min(w, d) * 0.21;
      this.group.add(lad);
    }
    // AC units / vents (only on tall buildings, fewer per building)
    if (roofProps && h > 18 && Math.random() < 0.5) {
      const ventCount = 1;
      for (let i = 0; i < ventCount; i++) {
        const ac = _cloneProp('roof_ac_cluster', 1.4);
        if (ac) {
          // v2 GLB AC-unit cluster
          ac.position.set(rand(-w * 0.3, w * 0.3), h, rand(-d * 0.3, d * 0.3));
          ac.rotation.y = Math.floor(Math.random() * 4) * Math.PI / 2;
          this.group.add(ac);
          continue;
        }
        const vw = rand(1.0, 2.4), vd = rand(1.0, 2.4);
        const v = new THREE.Mesh(
          new THREE.BoxGeometry(vw, 1.0, vd),
          new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7 })
        );
        v.position.set(rand(-w * 0.35, w * 0.35), h + 0.5, rand(-d * 0.35, d * 0.35));
        v.castShadow = true;
        this.group.add(v);
      }
    }
    // Antenna with blinking light (rare; only tall buildings)
    if (roofProps && Math.random() < 0.3 && h > 30) {
      // GLB mast is a wide dish rig, so keep it human-scale; the cylinder can be a tall spike
      const antH = _propTemplates.has('roof_antenna')
        ? Math.min(7, h * (0.12 + Math.random() * 0.08))
        : h * (0.25 + Math.random() * 0.25);
      const antGLB = _cloneProp('roof_antenna', antH);
      const ant = antGLB || new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.12, antH, 4),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      // GLB mast sits on its base (origin at the bottom); the cylinder is centred
      ant.position.set(rand(-1.5, 1.5), antGLB ? h : h + antH / 2, rand(-1.5, 1.5));
      this.group.add(ant);
      const blink = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.4 })
      );
      blink.position.copy(ant.position);
      blink.position.y = h + antH;
      if (antGLB) blink.scale.setScalar(0.6);
      this.group.add(blink);
    }
    // Rooftop billboard / neon panel (sparser)
    if (decor && h > 28 && Math.random() < 0.25) {
      const c = pick(NEON_COLORS);
      const billW = Math.min(w, d) * 0.7;
      const billH = Math.min(8, h * 0.18);
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, billH * 0.6, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      stand.position.set(-billW * 0.4, h + billH * 0.3, 0);
      this.group.add(stand);
      const stand2 = stand.clone();
      stand2.position.x = billW * 0.4;
      this.group.add(stand2);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(billW, billH, 0.4),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.6, roughness: 0.4 })
      );
      panel.position.set(0, h + billH * 0.65, 0);
      panel.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      this.group.add(panel);
    }

    // Roof variant for visual variety: pagoda / dome / stepped tile.
    // Layered on top of the existing IM cube body so it doesn't add to
    // building-grid complexity. Probability gated to keep mesh count sane.
    if (decor && Math.random() < 0.18) {
      const variant = Math.random();
      if (variant < 0.4) {
        // Pagoda: 4-sided pyramid roof, dark blue tiles, red ridge spine
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.62, Math.max(3, h * 0.18), 4),
          new THREE.MeshStandardMaterial({ color: 0x223844, roughness: 0.5, metalness: 0.35 })
        );
        roof.position.y = h + Math.max(3, h * 0.18) / 2;
        roof.rotation.y = Math.PI / 4;
        this.group.add(roof);
        // Red accent strip just under the roof
        const accent = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.4, 0.7, d + 0.4),
          new THREE.MeshStandardMaterial({ color: 0xa12b2b, roughness: 0.6 })
        );
        accent.position.y = h - 0.4;
        this.group.add(accent);
      } else if (variant < 0.7) {
        // Dome roof for office tower: copper hemisphere
        const r = Math.min(w, d) * 0.55;
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x4a6677, roughness: 0.4, metalness: 0.6 })
        );
        dome.position.y = h;
        this.group.add(dome);
        // Spire tip
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(0.25, 4, 6),
          new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        spire.position.y = h + r + 2;
        this.group.add(spire);
      } else {
        // Stepped / setback roof: 2 smaller stacked boxes
        for (let s = 0; s < 2; s++) {
          const sz = 1 - (s + 1) * 0.25;
          const stepH = Math.max(2, h * 0.08);
          const setback = new THREE.Mesh(
            new THREE.BoxGeometry(w * sz, stepH, d * sz),
            new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.85 })
          );
          setback.position.y = h + stepH / 2 + s * stepH;
          this.group.add(setback);
        }
      }
    }

    // Side neon sign(s) -- usually 0 or 1, rare 2. Each sign now bakes a
    // Japanese-text canvas as both map + emissiveMap so the glyphs actually
    // glow (and pump bloom) instead of being a featureless coloured slab.
    const sideSignCount = decor && h > 12 ? (Math.random() < 0.45 ? 1 : 0) : 0;
    for (let i = 0; i < sideSignCount; i++) {
      const c = pick(NEON_COLORS);
      const phrase = pick(NEON_PHRASES);
      const tex = makeNeonSignTexture(phrase, c);
      // Sign uses fixed real-world dimensions (a Tokyo neon is roughly
      // 4-7m wide at the building scale we're rendering at), not relative
      // to building height -- otherwise tall towers got billboards bigger
      // than the building itself. Width is also clamped so the sign never
      // exceeds 70% of the smaller building face dimension.
      const SIGN_W_MIN = 4.0, SIGN_W_MAX = 7.5;
      const maxFaceW = Math.min(w, d) * 0.7;
      const sw = Math.min(SIGN_W_MIN + Math.random() * (SIGN_W_MAX - SIGN_W_MIN), maxFaceW);
      const sh = sw * (96 / 256); // preserve texture aspect (8:3)
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, 0.4),
        new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex,
          emissive: 0xffffff, emissiveIntensity: 1.6,
          roughness: 0.4, metalness: 0.1,
        })
      );
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = Math.random() < 0.5;
      const yPos = h * (0.35 + Math.random() * 0.4);
      if (axis) {
        // Sign on +X or -X wall: rotate 90° so face points outward.
        sign.position.set(side * (w / 2 + 0.25), yPos, rand(-d * 0.2, d * 0.2));
        sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        // Sign on +Z or -Z wall: 0 or 180°.
        sign.position.set(rand(-w * 0.2, w * 0.2), yPos, side * (d / 2 + 0.25));
        sign.rotation.y = side > 0 ? 0 : Math.PI;
      }
      this.group.add(sign);
      // Frame outline (slightly darker box around)
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(sw + 0.4, sh + 0.4, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      frame.position.copy(sign.position);
      frame.rotation.copy(sign.rotation);
      // Push the frame slightly inboard
      const inset = 0.1;
      if (axis) frame.position.x -= side * inset;
      else frame.position.z -= side * inset;
      this.group.add(frame);
    }

    // Storefront awning at base (low buildings only, sparser)
    if (decor && h < 25 && Math.random() < 0.25) {
      const c = pick(NEON_COLORS);
      const aw = w * 0.85, ad = 1.6;
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(aw, 0.4, ad),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 })
      );
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = Math.random() < 0.5;
      if (axis) awning.position.set(0, 3.0, side * (d / 2 + ad * 0.4));
      else { awning.position.set(side * (w / 2 + ad * 0.4), 3.0, 0); awning.rotation.y = Math.PI / 2; }
      this.group.add(awning);
    }

    // Windows -- pushed to the global queue, instanced once after all buildings.
    // Records local matrices (relative to the building's footprint), translated
    // by (x,z) at queue time so the global IM lives in world space.
    // skipWindows opt: landmarks render their own custom mesh and don't
    // want generic procedural window dots painted onto them.
    // opts.windows { scale, faces, minH }: real-scale cities (Chicago) use
    // smaller windows at tighter floor spacing on every face.
    const wo = opts.windows;
    const ws = wo ? wo.scale : 1;
    if (h >= (wo ? wo.minH : 6) && !opts.skipWindows) {
      const lit = Math.random() < 0.6;
      const facesToRender = wo ? wo.faces : (h < 16 ? 1 : 2);
      const faceOffset = Math.floor(Math.random() * 4);
      const rows = Math.max(wo ? 1 : 2, Math.floor(h / (4 * ws)));
      const colsAll = Math.max(2, Math.floor(Math.max(w, d) / 3.5));
      const dummy = new THREE.Object3D();
      for (let f = 0; f < facesToRender; f++) {
        const face = (f + faceOffset) % 4;
        const cols = wo ? Math.max(2, Math.floor((face % 2 === 0 ? w : d) / (3.5 * ws))) : colsAll;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            dummy.position.set(0, 0, 0);
            dummy.rotation.set(0, 0, 0);
            const yy = 1.5 * ws + r * (h - 2 * ws) / rows;
            const span = (face % 2 === 0 ? w : d) - 1.0 * ws;
            const xx = -span / 2 + c * span / (cols - 1 || 1);
            if (face === 0)      dummy.position.set(xx, yy, d / 2 + 0.08);
            else if (face === 1) { dummy.position.set(w / 2 + 0.08, yy, xx); dummy.rotation.y = Math.PI / 2; }
            else if (face === 2) dummy.position.set(xx, yy, -d / 2 - 0.08);
            else                 { dummy.position.set(-w / 2 - 0.08, yy, xx); dummy.rotation.y = Math.PI / 2; }
            // bake building world position
            dummy.position.x += this.x;
            dummy.position.z += this.z;
            if (wo) dummy.scale.setScalar(ws);
            dummy.updateMatrix();
            _windowQueue.push({ b: this, matrix: dummy.matrix.clone(), lit });
          }
        }
      }
    }
    // Records of window slots in the global IM, filled by buildGlobalWindows.
    this.windowEntries = [];
    // (body.userData.building backlink is set on the stub at line ~167;
    //  raycasts use the global body InstancedMesh + instanceId now.)
  }

  damage(amount, hitPoint, world) {
    if (this.destroyed) return 0;
    const before = this.hp;
    this.hp -= amount;
    // Tint darker as it weakens -- write into the IM but DEFER the
    // needsUpdate flag so a single multi-hit frame triggers one GPU sync
    // instead of N. flushBodiesIM() is called once per frame from updateWorld.
    this.bodyColor.offsetHSL(0, 0, -0.005);
    if (this._bodyIM && this._bodyIndex >= 0 && this._bodyIM.instanceColor) {
      this._bodyIM.setColorAt(this._bodyIndex, this.bodyColor);
      this._bodyIM._colorDirty = true;
    }
    // Hit effects at most every 0.15 s per building: pushing into a
    // building calls damage() every frame, which spawned ~217 extra draws.
    const fxNow = world ? (world.time || 0) : 0;
    if (hitPoint && world && (this._fxT === undefined || fxNow - this._fxT >= 0.15 || fxNow < this._fxT)) {
      this._fxT = fxNow;
      world.spawnSparks(hitPoint, 6);
      world.spawnHitPulse?.(hitPoint, 0xffaa44);
    }
    // emit smoke when crossing damage thresholds (50% / 25%)
    const halfPct = before / this.maxHp;
    const nowPct = this.hp / this.maxHp;
    if (world && halfPct > 0.5 && nowPct <= 0.5) {
      world.spawnSmoke(this.group.position.clone().setY(this.h * 0.85), 1.4);
    }
    if (world && halfPct > 0.25 && nowPct <= 0.25) {
      world.spawnSmoke(this.group.position.clone().setY(this.h * 0.7), 1.8);
      world.spawnSparks(this.group.position.clone().setY(this.h * 0.6), 8);
    }
    if (this.hp <= 0) {
      this.collapse(world);
      return this.maxHp; // score
    }
    return amount;
  }

  collapse(world) {
    if (this.destroyed) return;
    this.destroyed = true;
    // Drop out of the spatial grid so future queries skip us
    if (this._grid) this._grid.remove(this);
    // Hide our slot in the global body InstancedMesh (deferred flush)
    if (this._bodyIM && this._bodyIndex >= 0) {
      this._bodyIM.setMatrixAt(this._bodyIndex, _zeroMatrix);
      this._bodyIM._matrixDirty = true;
    }
    // Custom landmark mesh -- remove it on destruction.
    if (this.customMesh && this.customMesh.parent) {
      this.customMesh.parent.remove(this.customMesh);
    }
    // Instanced GLB building: zero its slots in the shared InstancedMeshes.
    if (this._glbSlots) {
      for (const sl of this._glbSlots) {
        sl.im.setMatrixAt(sl.idx, _zeroMatrix);
        sl.im.instanceMatrix.needsUpdate = true;
      }
    }
    // Hide our slots in the global window InstancedMesh(es)
    if (this.windowEntries && this.windowEntries.length) {
      for (const e of this.windowEntries) e.im.setMatrixAt(e.idx, _zeroMatrix);
      // Mark each unique IM dirty
      const seen = new Set();
      for (const e of this.windowEntries) {
        if (!seen.has(e.im)) { e.im.instanceMatrix.needsUpdate = true; seen.add(e.im); }
      }
    }
    // Festival fabric and truss collapse into dust and sparks, not a row
    // of petrol fireballs. Masonry keeps the larger explosive silhouette.
    const festival = !!this.fest;
    // Ground rubble (stays permanently): placed at once, so the lot is never bare
    const useGLBDebris = !festival && _debrisTemplates.length > 0;
    const rubbleCount = festival ? 2 : 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < rubbleCount && world; i++) {
      const rubSize = THREE.MathUtils.clamp(Math.max(this.w, this.d) * rand(0.15, 0.3), 2.5, 8);
      if (useGLBDebris && _placeRubbleInstanced(world.scene, rubSize, this.debrisTint ?? null,
          this.group.position.x + rand(-this.w / 4, this.w / 4),
          rubSize * 0.15,
          this.group.position.z + rand(-this.d / 4, this.d / 4),
          rand(-0.2, 0.2), rand(0, Math.PI), rand(-0.2, 0.2))) {
        continue;
      }
      // Fallback (no debris GLBs, e.g. mobile LOW; festival pieces): procedural box, instanced
      const rw = festival ? rand(.3, 1.1) : this.w * rand(0.3, 0.7);
      const rd = festival ? rand(.2, .7) : this.d * rand(0.3, 0.7);
      const rh = festival ? rand(.06, .18) : rand(1.2, 2.6);
      _placeBoxRubble(world.scene, this.debrisTint != null ? new THREE.Color(this.debrisTint) : _boxDebrisTint || this.body.material.color, rw, rh, rd,
        this.group.position.x + rand(-this.w / 4, this.w / 4),
        festival ? rh / 2 : rubSize * 0.15,
        this.group.position.z + rand(-this.d / 4, this.d / 4),
        rand(-0.2, 0.2), rand(0, Math.PI), rand(-0.2, 0.2));
    }

    if (world) {
      world.shake(festival ? .16 : .9 + Math.min(.7, this.h / 40), festival ? .18 : .7);
      // Fireballs, flying debris, the dust plume and ring, the burning column:
      // queued, and built a few buildings per frame (_drainCollapseFx)
      _queueCollapseFx(world, this);
      world.onBuildingDestroyed?.(this);
    }

    // remove building from scene
    this.group.parent && this.group.parent.remove(this.group);
    // ...and free its own geometry (procedural bodies, landmark parts: the
    // fountain's jets, basins, rims), as _teardownScene would have. Removed
    // here, teardown never saw them: ~10-30 geometries leaked per restart
    // after a finisher's collapses. Template / shared geometry stays.
    this.group.traverse((n) => {
      const g = n.geometry;
      if (g && !g.userData.template && !g.userData.shared) g.dispose();
    });
  }
}

// ---- Collapse effects queue ----
// A collapse used to build its whole show inside collapse(): 3 explosions (two
// on setTimeout), 16-25 flying chunks, 8 dust puffs, a shock ring and a smoke
// column. One building is fine; an ultimate, a finisher or a body thrown
// through a block brings down 5-300 in the same frame, and that frame (and the
// two timer bursts after it) was the game's worst spike: 39 ms on a desktop,
// 130-440 ms at 4x CPU slowdown. Now collapse() does the structural part at
// once (instances hidden, grid, rubble, score) and queues the show:
//  - the first _FX_INLINE collapses of a frame still get theirs in the same
//    call, so one or two buildings behave exactly as before;
//  - the rest are built by the city animator, oldest first, for at most
//    _FX_BUDGET_MS per frame (always at least one);
//  - when a burst leaves a backlog, the buildings at its head get a cheaper
//    show: the effect and debris caps kept only ~15 buildings' worth on screen
//    anyway, and dropped the rest after they had been paid for.
// The follow-up explosions run on game time (world.time), so they hold during
// hit-stop and pause and stretch with slow motion, and a restart drops them.
const _FX_INLINE = isMobile ? 1 : 2;           // collapses per frame that get their effects inside collapse()
const _FX_BUDGET_MS = isMobile ? 2.5 : 1.5;    // per frame, for the queued ones
const _FX_FULL_BACKLOG = isMobile ? 3 : 8;     // jobs waiting behind this one: up to here the full show,
const _FX_MID_BACKLOG = isMobile ? 8 : 24;     // up to here a reduced one, beyond it a fireball and (below) a ring
const _FX_RING_BACKLOG = isMobile ? 30 : 80;
const _FX_STALE = 0.6;                         // s of game time in the queue after which a job is only worth the cheap show
const _fxJobs = [];       // waiting for their main burst: { x, z, w, d, h, color, t }
const _fxLater = [];      // follow-up explosions: { x, y, z, scale, at }
let _fxHead = 0;
let _fxInlineT = -1, _fxInlineN = 0;
const _fxV = new THREE.Vector3();

function _queueCollapseFx(world, b) {
  const t = typeof world.time === 'number' ? world.time : 0;
  const kp = world.kaijuPos; // chunks fly away from the kaiju
  _fxJobs.push({ x: b.group.position.x, z: b.group.position.z, w: b.w, d: b.d, h: b.h, color: b.debrisTint != null ? new THREE.Color(b.debrisTint) : _boxDebrisTint || b.body.material.color, tint: b.debrisTint ?? null, t,
    fest: !!b.fest, fence: !!b.isFence, metal: b.destructionMaterial === 'metal', kx: kp ? kp.x : NaN, kz: kp ? kp.z : NaN });
  if (_fxInlineT !== t) { _fxInlineT = t; _fxInlineN = 0; }
  if (_fxJobs.length - _fxHead === 1 && _fxInlineN < _FX_INLINE) {
    _fxInlineN++;
    _collapseFx(world, _fxJobs[_fxHead++], 2);
    _fxJobs.length = 0; _fxHead = 0;
  }
}

/** The queued collapses' effects, within the frame's budget, and the
 *  follow-up explosions that have come due. Called once per frame. */
function _drainCollapseFx(world) {
  const now = typeof world.time === 'number' ? world.time : 0;
  for (let i = _fxLater.length - 1; i >= 0; i--) {
    const e = _fxLater[i];
    if (e.at > now) continue;
    _fxLater[i] = _fxLater[_fxLater.length - 1]; _fxLater.pop();
    world.spawnExplosion(new THREE.Vector3(e.x, e.y, e.z), e.scale);
  }
  if (_fxHead >= _fxJobs.length) return;
  const t0 = performance.now();
  do {
    const backlog = _fxJobs.length - _fxHead - 1;
    const j = _fxJobs[_fxHead++];
    const stale = now - j.t > _FX_STALE;
    _collapseFx(world, j, backlog > _FX_MID_BACKLOG || stale ? (backlog > _FX_RING_BACKLOG ? -1 : 0) : (backlog > _FX_FULL_BACKLOG ? 1 : 2));
  } while (_fxHead < _fxJobs.length && performance.now() - t0 < _FX_BUDGET_MS);
  if (_fxHead >= _fxJobs.length) { _fxJobs.length = 0; _fxHead = 0; }
}

/** A new city (restart, level switch): nothing of the old one is owed. */
function _resetCollapseFx() {
  _fxJobs.length = 0; _fxLater.length = 0; _fxHead = 0; _fxInlineT = -1; _fxInlineN = 0;
}

/** One collapsed building's show. level 2: all of it (what collapse() always
 *  built). 1: one follow-up explosion, half the chunks and dust puffs.
 *  0: the fireball and the dust ring. -1: the fireball. */
function _collapseFx(world, j, level) {
  const now = typeof world.time === 'number' ? world.time : 0;
  // Festival fabric and truss collapse into dust and sparks, not a row of
  // petrol fireballs. Masonry keeps the larger explosive silhouette (one
  // fireball; the staggered follow-ups are gone).
  const festival = j.fest;
  if (!festival) world.spawnExplosion(new THREE.Vector3(j.x, j.h / 2, j.z), 1.6 + Math.min(2.0, j.h / 30));
  else if (j.metal) world.spawnSparks(new THREE.Vector3(j.x, j.h / 2, j.z), 12);
  const spread = Math.max(1.5, Math.min(24, Math.hypot(j.w, j.d) * .65));
  if (level >= 0) {
    // Ground dust ring
    world.spawnShockwave(new THREE.Vector3(j.x, 0, j.z), festival ? 0xc4b18a : 0xaa8866, spread * 1.6);
  }
  if (level < 1) return;

  // Lots of debris chunks for satisfying spray
  const useGLBDebris = !festival && _debrisTemplates.length > 0;
  // More, smaller pieces with the v2 kit (facade panels, rebar, beams, glass)
  let chunks = 10 + Math.floor(Math.random() * 4) + Math.min(6, Math.floor(j.h / 15)) + (useGLBDebris ? 6 : 0);
  if (festival) chunks = j.fence ? 3 : 6;
  if (level < 2) chunks = Math.ceil(chunks / 2);
  let awayX = j.x - j.kx, awayZ = j.z - j.kz;
  if (!(awayX === awayX)) { awayX = 0; awayZ = 0; } // no kaiju position (NaN)
  const awayL = Math.hypot(awayX, awayZ) || 1;
  // A frame's flying debris is capped (world.debrisRoom: the world keeps
  // only that many anyway); a lone collapse still gets every chunk
  const room = typeof world.debrisRoom === 'function' ? world.debrisRoom(chunks) : chunks;
  if (Number.isFinite(room)) chunks = room;
  for (let i = 0; i < chunks; i++) {
    // Capped in world units so wide GLB footprints don't throw kaiju-sized chunks
    const targetSize = useGLBDebris
      ? THREE.MathUtils.clamp(Math.max(j.w, j.d) * rand(0.06, 0.16), 1.2, 5.5)
      : Math.max(j.w, j.d) * rand(0.25, 0.65);
    let m;
    if (useGLBDebris) {
      m = _cloneDebris(targetSize, _pickDebrisTemplate(j.tint));
    }
    if (!m) {
      // Fallback to a procedural box if GLBs not loaded (pooled, see _boxDebris)
      m = festival ? _boxDebris(j.color, rand(.25, 1.1), rand(.04, .16), rand(.2, .8))
        : _boxDebris(j.color, j.w * rand(0.18, 0.55), j.h * rand(0.08, 0.32), j.d * rand(0.18, 0.55));
    }
    m.position.set(j.x + rand(-j.w / 3, j.w / 3), j.h * rand(0.2, 0.7), j.z + rand(-j.d / 3, j.d / 3));
    m.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
    const u = m.userData;
    (u.vel || (u.vel = new THREE.Vector3())).set(rand(-6, 6) + awayX / awayL * 7, festival ? rand(3, 8) : rand(10, 22), rand(-6, 6) + awayZ / awayL * 7);
    (u.angVel || (u.angVel = new THREE.Vector3())).set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
    u.life = 6.5;
    u.landed = false; u.sunk = false; // a reused chunk's last flight
    world.scene.add(m);
    world.debris.push(m);
  }

  // Dust plume spreading from the base
  world.spawnDustBurst?.(new THREE.Vector3(j.x, 0, j.z), spread, festival ? 5 : (level >= 2 ? 9 : 5));
  // Lingering smoke column visible from afar
  if (!festival) world.spawnSmokeColumn?.(_fxV.set(j.x, 0, j.z).clone(), j.h);
}

// --------------- GLB building system ---------------
const _glbTemplates = new Map();

/** Fetch a GLB via the asset cache, then parse with GLTFLoader. */
// GPU-compressed building textures (desktop). The transcoder comes from the
// same three r160 CDN as the rest of three; a building whose KTX2 copy fails
// to fetch/transcode falls back to its JPEG original (loadBuildingTemplates).
const KTX2_TRANSCODER = 'https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/';
export function enableKTX2(renderer) {
  try {
    const k = new KTX2Loader().setTranscoderPath(KTX2_TRANSCODER).detectSupport(renderer);
    _glbLoader.setKTX2Loader(k);
    setKTX2Enabled(true);
    return k;
  } catch (e) {
    console.warn('[KTX2] unavailable, using JPEG textures:', e.message);
    return null;
  }
}

// original=true skips the mobile/KTX2 variant (fallback retry).
function _cachedGLB(url, original = false) {
  return cachedFetch(url, { original }).then((buf) => withParseSlot(() =>
    new Promise((resolve, reject) => _glbLoader.parse(buf, '', resolve, reject))
  )).then((gltf) => { normalizeGLTFMaterials(gltf.scene); return gltf; });
}

/** Building GLB urls a level loads. */
function _levelBuildingGLBs(level) {
  return level === 'chicago' ? chicagoBuildingGLBs() : (MAP_LEVELS[level] || MAP_LEVELS.tokyo).buildings();
}

/** Load the level's unique building GLB templates (already-loaded ones are skipped). */
export function loadBuildingTemplates(onProgress, level = 'tokyo') {
  const unique = [...new Set(_levelBuildingGLBs(level))].filter((u) => !_glbTemplates.has(u));
  let loaded = 0;
  const total = unique.length;
  // One retry per template: a flaky mobile fetch/decode shouldn't cost a building
  const loadOnce = (url) => _cachedGLB(url).catch((err) => {
    if (isCodeBug(err)) throw err; // a retry can't fix our own code
    console.warn('[BuildingGLB] retrying', url, err.message);
    // Retry with the JPEG original: covers a failed KTX2 copy/transcode too
    return new Promise((r) => setTimeout(r, 400)).then(() => _cachedGLB(url, true));
  });
  return Promise.all(unique.map((url) =>
    loadOnce(url).then((gltf) => {
      const s = gltf.scene;
      s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      _glbTemplates.set(url, { scene: s, box: new THREE.Box3().setFromObject(s) });
      loaded++;
      if (onProgress) onProgress(loaded, total, url.split('/').pop().replace('.glb', ''));
      return _attachLod1(url, s); // listed buildings only (Chicago landmarks, L track)
    }).catch((err) => {
      reportLoadError('BuildingGLB', url, err);
      loaded++;
      if (onProgress) onProgress(loaded, total, 'error');
    })
  ));
}

// --------------- Debris GLB system ---------------
const DEBRIS_GLB_BASE = './assets/debris/';
// v2 textured debris kit (<=4.5k tris each); the old set loads only if none do
const DEBRIS_GLBS = [
  DEBRIS_GLB_BASE + 'debris_facade_windows.glb',
  DEBRIS_GLB_BASE + 'debris_rebar_slab.glb',
  DEBRIS_GLB_BASE + 'debris_ibeam.glb',
  DEBRIS_GLB_BASE + 'debris_glass_shards.glb',
  DEBRIS_GLB_BASE + 'debris_concrete_a.glb',
  DEBRIS_GLB_BASE + 'debris_concrete_b.glb',
];
const DEBRIS_GLBS_FALLBACK = [
  DEBRIS_GLB_BASE + 'debris_slab_1.glb',
  DEBRIS_GLB_BASE + 'debris_twisted_1.glb',
  DEBRIS_GLB_BASE + 'debris_concrete_1.glb',
  DEBRIS_GLB_BASE + 'debris_concrete_2.glb',
  DEBRIS_GLB_BASE + 'debris_concrete_3.glb',
  DEBRIS_GLB_BASE + 'debris_chunk_1.glb',
];
const _debrisTemplates = [];  // array of { scene, box, set } after loading
// A level's own debris (DC: marble and limestone chunks), used there instead of
// the concrete / rebar kit; set by buildCity
const LEVEL_DEBRIS = Object.fromEntries(Object.entries(MAP_LEVELS).filter(([, v]) => v.debris.length).map(([k, v]) => [k, v.debris]));
const _debrisLoaded = new Set(); // urls requested
let _debrisSet = 'default';
// Phone LOW's procedural chunks and rubble take the building's colour; a
// level may tint them instead (DC: stone, not brick / glass)
let _boxDebrisTint = null;

/** The shared debris kit, plus the level's own (call again for a level picked later). */
export async function loadDebrisTemplates(level = 'tokyo') {
  if (!_debrisLoaded.has(DEBRIS_GLBS[0])) {
    await _loadDebrisList(DEBRIS_GLBS);
    if (!_debrisTemplates.some((t) => t.set === 'default')) await _loadDebrisList(DEBRIS_GLBS_FALLBACK);
  }
  if (LEVEL_DEBRIS[level]) await _loadDebrisList(LEVEL_DEBRIS[level], level);
}

function _loadDebrisList(list, set = 'default') {
  list = list.filter((u) => !_debrisLoaded.has(u));
  for (const u of list) _debrisLoaded.add(u);
  return Promise.all(list.map((url) =>
    _cachedGLB(url).then((gltf) => {
      const s = gltf.scene;
      s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      _debrisTemplates.push({ scene: s, box: new THREE.Box3().setFromObject(s), set });
    }).catch((err) => {
      reportLoadError('DebrisGLB', url, err);
    })
  ));
}

/** A debris template for the level in play; tint (0xRRGGBB, a level's own
 *  kit only): the fallen building's stone, as a tinted copy of the template
 *  (made once per template and stone: same program, its own material). */
function _pickDebrisTemplate(tint = null) {
  if (_debrisTemplates.length === 0) return null;
  const own = _debrisTemplates.filter((t) => t.set === _debrisSet);
  const list = own.length ? own : _debrisTemplates.filter((t) => t.set === 'default');
  const tpl = list[Math.floor(Math.random() * list.length)] || null;
  return tpl && tint != null && tpl.set !== 'default' ? _tintedDebris(tpl, tint) : tpl;
}
// The level kit is authored in marble: other stones scale its colour by stone / marble
const DEBRIS_MARBLE = new THREE.Color(0xd6d0c4);
const _tinted = new Map(); // template -> Map(hex -> tinted template)
function _tintedDebris(tpl, hex) {
  let byHex = _tinted.get(tpl);
  if (!byHex) _tinted.set(tpl, (byHex = new Map()));
  let t = byHex.get(hex);
  if (!t) {
    const c = new THREE.Color(hex), k = [c.r / DEBRIS_MARBLE.r, c.g / DEBRIS_MARBLE.g, c.b / DEBRIS_MARBLE.b];
    const scene = tpl.scene.clone(true), mats = new Map();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!mats.has(o.material)) { const m = o.material.clone(); m.color.setRGB(m.color.r * k[0], m.color.g * k[1], m.color.b * k[2]); mats.set(o.material, m); }
      o.material = mats.get(o.material);
    });
    t = { scene, box: tpl.box, set: tpl.set, tint: hex };
    byHex.set(hex, t);
  }
  return t;
}

// Flying chunks are reused: a chunk the game has dropped (expired, trimmed or
// swept by a restart: no parent any more) flies again instead of a fresh
// tpl.scene.clone(true) per chunk, 16-25 per collapse. Its template geometry
// and materials were always shared; what is saved is the Object3D tree.
const _debrisPool = new Map(); // tpl -> clones made so far
function _cloneDebris(targetSize, tpl = _pickDebrisTemplate()) {
  if (!tpl) return null;
  let list = _debrisPool.get(tpl);
  if (!list) _debrisPool.set(tpl, (list = []));
  let root = null;
  for (let i = 0; i < list.length; i++) if (!list[i].parent) { root = list[i]; break; }
  if (!root) {
    root = tpl.scene.clone(true);
    // Flying chunks are small and fast: skip the shadow pass (it doubled
    // their draw calls in multi-collapse storms). Ground rubble still receives.
    root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    list.push(root);
  }
  const rawSize = Math.max(
    tpl.box.max.x - tpl.box.min.x,
    tpl.box.max.y - tpl.box.min.y,
    tpl.box.max.z - tpl.box.min.z,
  );
  const s = rawSize > 0 ? targetSize / rawSize : 1;
  root.scale.setScalar(s);
  return root;
}

// The procedural stand-ins (no debris GLBs: phone LOW). Each chunk and each
// rubble piece used to be a Mesh with its own BoxGeometry and its own
// MeshStandardMaterial: a draw each (rubble for the rest of the run: 3-4 more
// draws per collapsed building, forever) and a program lookup per new
// material. Chunks now share one unit box and one material per body colour,
// so carBatch draws them instanced; rubble is one InstancedMesh.
const _G_BOX = new THREE.BoxGeometry(1, 1, 1);
markShared(_G_BOX);
const _boxMats = new Map(); // body colour (5 bits a channel) -> material
function _boxMat(color) {
  const key = ((color.r * 31) | 0) << 10 | ((color.g * 31) | 0) << 5 | ((color.b * 31) | 0);
  let m = _boxMats.get(key);
  if (!m) {
    if (_boxMats.size >= 24) return _boxMats.values().next().value; // a damaged building's darkened shade: close enough
    m = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.95 });
    _boxMats.set(key, m);
  }
  return m;
}
const _boxDebrisPool = [];
function _boxDebris(color, w, h, d) {
  let m = null;
  for (let i = 0; i < _boxDebrisPool.length; i++) if (!_boxDebrisPool[i].parent) { m = _boxDebrisPool[i]; break; }
  if (!m) {
    m = new THREE.Mesh(_G_BOX, _boxMat(color));
    m.castShadow = false;
    _boxDebrisPool.push(m);
  }
  m.material = _boxMat(color);
  m.scale.set(w, h, d);
  return m;
}
const BOX_RUBBLE_CAP = 360; // pieces kept (oldest overwritten): ~100 collapsed buildings
let _boxRubble = null;
function _placeBoxRubble(scene, color, w, h, d, x, y, z, rx, ry, rz) {
  let R = _boxRubble;
  if (!R) {
    const im = new THREE.InstancedMesh(_G_BOX, new THREE.MeshStandardMaterial({ roughness: 1.0 }), BOX_RUBBLE_CAP);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BOX_RUBBLE_CAP * 3), 3);
    im.count = 0;
    // Permanent + low: receive shadows only (no shadow-pass draw).
    im.castShadow = false; im.receiveShadow = true;
    im.frustumCulled = false; // instances span the whole city
    im.userData.rubblePool = true;
    R = _boxRubble = { im, next: 0 };
  }
  if (R.im.parent !== scene) { R.next = 0; R.im.count = 0; scene.add(R.im); } // new city / after a restart swept it
  const i = R.next;
  R.next = (R.next + 1) % BOX_RUBBLE_CAP;
  R.im.count = Math.min(BOX_RUBBLE_CAP, Math.max(R.im.count, i + 1));
  _rubQ.setFromEuler(_rubE.set(rx, ry, rz));
  _rubM.compose(_rubP.set(x, y, z), _rubQ, _rubS.set(w, h, d));
  R.im.setMatrixAt(i, _rubM);
  R.im.setColorAt(i, color);
  R.im.instanceMatrix.needsUpdate = true;
  R.im.instanceColor.needsUpdate = true;
}

// Permanent ground rubble, instanced per debris template: one
// InstancedMesh per template sub-mesh (shared geometry, so the template
// stays its owner; its own copy of the material, since flying debris draws
// the template's material un-instanced and a material drawn both ways has
// its program re-resolved on every draw). Rubble used to be 3-4 cloned
// meshes per collapse that never went away (and cast shadows). Each
// instance matrix is rubbleTransform x the sub-mesh's transform inside the
// template. Every instance is kept in pool.all; cullRubble() packs the ones
// in view into the InstancedMeshes each frame (late game: ~960 pieces of
// ~4k tris city-wide, mostly off screen). After an in-place restart sweeps
// the IMs out of the scene, the next placement re-adds them with count
// reset to 0.
const RUBBLE_CAP = 160; // instances per template (oldest overwritten)
const _rubblePools = new Map(); // tpl -> { parts: [{ im, local }], next, count }
const _rubM = new THREE.Matrix4();
const _rubQ = new THREE.Quaternion();
const _rubE = new THREE.Euler();
const _rubP = new THREE.Vector3();
const _rubS = new THREE.Vector3();
const _rubW = new THREE.Matrix4();
const _rubSph = new THREE.Sphere();
function _rubblePool(tpl, scene) {
  let pool = _rubblePools.get(tpl);
  if (!pool) {
    tpl.scene.updateMatrixWorld(true);
    const parts = [];
    tpl.scene.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material.clone(), RUBBLE_CAP);
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false;   // permanent, low and static: receive only
      im.receiveShadow = true;
      im.frustumCulled = false; // instances span the whole city
      im.userData.rubblePool = true;
      parts.push({ im, local: o.matrixWorld.clone(), all: new Float32Array(RUBBLE_CAP * 16) });
    });
    // Bounding sphere of the whole template, for the per-instance cull
    const sphere = tpl.box.getBoundingSphere(new THREE.Sphere());
    pool = { parts, next: 0, count: 0, sphere, at: new Float32Array(RUBBLE_CAP * 4) };
    _rubblePools.set(tpl, pool);
  }
  if (pool.parts.length && pool.parts[0].im.parent !== scene) {
    pool.next = 0; pool.count = 0; pool.dirty = true;
    for (const pt of pool.parts) { pt.im.count = 0; scene.add(pt.im); }
  }
  return pool;
}
/** Place one rubble piece (instanced). Returns false if no template. */
function _placeRubbleInstanced(scene, targetSize, tint, x, y, z, rx, ry, rz) {
  const tpl = _pickDebrisTemplate(tint);
  if (!tpl) return false;
  const rawSize = Math.max(
    tpl.box.max.x - tpl.box.min.x,
    tpl.box.max.y - tpl.box.min.y,
    tpl.box.max.z - tpl.box.min.z,
  );
  const sc = rawSize > 0 ? targetSize / rawSize : 1;
  const pool = _rubblePool(tpl, scene);
  _rubQ.setFromEuler(_rubE.set(rx, ry, rz));
  _rubM.compose(_rubP.set(x, y, z), _rubQ, _rubS.setScalar(sc));
  const idx = pool.next;
  pool.next = (pool.next + 1) % RUBBLE_CAP;
  pool.count = Math.min(RUBBLE_CAP, pool.count + 1);
  for (const pt of pool.parts) {
    _rubW.multiplyMatrices(_rubM, pt.local);
    _rubW.toArray(pt.all, idx * 16);
  }
  // World-space bounding sphere of this piece
  _rubSph.copy(pool.sphere).applyMatrix4(_rubM);
  pool.at[idx * 4] = _rubSph.center.x; pool.at[idx * 4 + 1] = _rubSph.center.y;
  pool.at[idx * 4 + 2] = _rubSph.center.z; pool.at[idx * 4 + 3] = _rubSph.radius;
  pool.dirty = true;
  return true;
}

/** Pack the rubble pieces in the camera's view into the pools'
 *  InstancedMeshes (same per-piece frustum test three applies to a Mesh,
 *  on the whole debris template's sphere). Call once per frame before
 *  rendering; skips the work while neither the camera nor the rubble moved.
 *  all: every piece, in view or not. */
const _rubFr = new THREE.Frustum();
const _rubPM = new THREE.Matrix4();
const _rubLastPM = new THREE.Matrix4();
export function cullRubble(camera, all = false) {
  if (!_rubblePools.size) return;
  camera.updateMatrixWorld();
  _rubPM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const camMoved = !_rubPM.equals(_rubLastPM);
  _rubLastPM.copy(_rubPM);
  if (camMoved) _rubFr.setFromProjectionMatrix(_rubPM);
  for (const pool of _rubblePools.values()) {
    if (!camMoved && !pool.dirty && !all) continue;
    pool.dirty = false;
    let n = 0;
    for (let i = 0; i < pool.count; i++) {
      _rubSph.center.fromArray(pool.at, i * 4); _rubSph.radius = pool.at[i * 4 + 3];
      if (!all && !_rubFr.intersectsSphere(_rubSph)) continue;
      for (const pt of pool.parts) pt.im.instanceMatrix.array.set(pt.all.subarray(i * 16, i * 16 + 16), n * 16);
      n++;
    }
    for (const pt of pool.parts) {
      pt.im.count = n;
      pt.im.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Shader prewarm (game.js _prewarmShaders): one of everything a collapse
 *  builds lazily, parented to `stage`, so that START links their programs and
 *  the warm frame draws them once: a flying chunk of every debris template
 *  (drawn through carBatch: the caller batches the returned `debris`), every
 *  rubble pool with one (zero-sized) instance, and on the procedural tier the
 *  box chunk and box rubble. The first collapse of a run used to create these
 *  buffers and link the instanced variants on its own frame. Call release()
 *  after the warm frame. */
export function stageDestruction(stage) {
  const debris = [], ims = [], cars = [];
  // Every vehicle model of the level, near and far (LOD1) geometry: traffic is a
  // weighted random pick, so a handful of staged cars missed the rare models,
  // and none of them was far
  for (const tpl of _carTemplates.filter(_carFor)) {
    for (const far of [false, true]) {
      const c = new Car(0, 0, 'z', 1, tpl);
      if (far) { if (!c._lodMeshes || !c._lodMeshes.length) continue; for (const l of c._lodMeshes) l.mesh.geometry = l.g1; }
      stage.add(c.root);
      cars.push(c);
    }
  }
  for (const tpl of _debrisTemplates) {
    const d = _cloneDebris(1, tpl);
    stage.add(d);
    debris.push(d);
    for (const pt of _rubblePool(tpl, stage).parts) { pt.im.count = 1; ims.push(pt.im); }
  }
  if (!_debrisTemplates.length) {
    const c = new THREE.Color(BUILDING_PALETTE[0]);
    const d = _boxDebris(c, 1, 1, 1);
    stage.add(d);
    debris.push(d);
    _placeBoxRubble(stage, c, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    ims.push(_boxRubble.im);
  }
  return {
    debris, cars,
    release() {
      for (const d of debris) if (d.parent) d.parent.remove(d);
      // Off the stage with nothing in them: the first real piece re-adds each to the scene
      for (const im of ims) { im.count = 0; if (im.parent) im.parent.remove(im); }
      if (_boxRubble) _boxRubble.next = 0;
    },
  };
}

// ---- Clone-free GLB placement ----
// A placed building used to be tpl.scene.clone(true) (a full Object3D tree per
// building, ~3.8k in Chicago) only to read its box and its meshes' world
// matrices. _Placed stands in for that clone: `top` carries the clone's own
// transform (copied from the template root, then edited as the clone was) and
// the template's descendants are walked with the same Matrix4 calls that
// Object3D.updateWorldMatrix / Box3.setFromObject make on a clone (local
// matrix recomposed, matrixWorld = parent.matrixWorld x matrix), so boxes and
// instance matrices are bit-identical to the clone path. Templates holding a
// node with its own boundingBox (skinned/instanced) take a real clone.
const _GLB_MARKER = new THREE.Object3D(); // b.customMesh for instanced GLB buildings: scene-less, hit-tested by AABB
const _pBox = new THREE.Box3();
function _cloneFreeOK(tplScene) {
  if (tplScene._cloneFreeOK === undefined) {
    let ok = true;
    tplScene.traverse((o) => { if (o.boundingBox !== undefined) ok = false; });
    tplScene._cloneFreeOK = ok;
  }
  return tplScene._cloneFreeOK;
}
class _Placed {
  constructor(tplScene) {
    this.tpl = tplScene;
    this.real = !_cloneFreeOK(tplScene);
    this.top = this.real ? tplScene.clone(true) : new THREE.Object3D().copy(tplScene, false);
  }
  /** [{ node, matrix }] for every node with geometry, pre-order (= traverse()):
   *  world matrices with the clone parented under parentWorld (null: no parent). */
  nodes(parentWorld = null) {
    const out = [];
    if (this.real) {
      if (parentWorld) { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(parentWorld); g.add(this.top); g.updateMatrixWorld(true); }
      else this.top.updateMatrixWorld(true);
      this.top.traverse((o) => { if (o.geometry !== undefined) out.push({ node: o, matrix: o.matrixWorld }); });
      return out;
    }
    const top = this.top;
    if (top.matrixAutoUpdate) top.updateMatrix();
    const tw = parentWorld ? new THREE.Matrix4().multiplyMatrices(parentWorld, top.matrix) : top.matrix.clone();
    const visit = (src, w) => {
      if (src.geometry !== undefined) out.push({ node: src, matrix: w });
      for (const ch of src.children) {
        if (ch.matrixAutoUpdate) ch.updateMatrix();
        visit(ch, new THREE.Matrix4().multiplyMatrices(w, ch.matrix));
      }
    };
    visit(this.tpl, tw);
    return out;
  }
  /** Box3.setFromObject(clone) for the parentless clone. */
  box() {
    if (this.real) return new THREE.Box3().setFromObject(this.top);
    const box = new THREE.Box3();
    for (const { node, matrix } of this.nodes()) {
      const g = node.geometry;
      if (g.boundingBox === null) g.computeBoundingBox();
      box.union(_pBox.copy(g.boundingBox).applyMatrix4(matrix));
    }
    return box;
  }
}

/** Clone a loaded template, scale to targetHeight, wire onto Building. */
// stretch > 1: per-axis scale allowed up to stretch x the uniform fit, so a
// generic block fills its footprint and reaches its height (Chicago kit)
// atOrigin: put the model's own origin (not its bbox centre) on the
// building position, for models authored around a meaningful centre
function placeBuildingGLB(url, targetHeight, building, scene, maxW, maxD, rotY, stretch = 1, atOrigin = false, lot = null, y0 = null) {
  const tpl = _glbTemplates.get(url);
  if (!tpl || building.destroyed) return;

  const P = new _Placed(tpl.scene), root = P.top;

  // A turned lot (lot: its own w x d, e.g. the Manhattan grid's 29 deg): the
  // model is fitted to the lot in its own frame, then turned
  if (lot) { maxW = lot.w; maxD = lot.d; }
  // Apply Y rotation before measuring if specified
  else if (rotY) root.rotation.y = rotY;

  const rawBox = P.box();
  const rawW = rawBox.max.x - rawBox.min.x;
  const rawD = rawBox.max.z - rawBox.min.z;
  const rawH = rawBox.max.y - rawBox.min.y;

  // Scale to target height first
  let s = rawH > 0 ? targetHeight / rawH : 1;

  // If a max footprint was specified, clamp so the model doesn't overflow
  if (maxW > 0 && maxD > 0 && rawW > 0 && rawD > 0) {
    const sW = maxW / rawW;
    const sD = maxD / rawD;
    s = Math.min(s, sW, sD);
  }

  if (stretch > 1 && maxW > 0 && maxD > 0 && rawW > 0 && rawD > 0 && rawH > 0) {
    const sx = Math.min(maxW / rawW, s * stretch);
    const sz = Math.min(maxD / rawD, s * stretch);
    const sy = Math.min(targetHeight / rawH, s * stretch);
    // Scale is applied before the Y rotation: a quarter-turned model's
    // local X lies along world Z
    const quarter = !lot && Math.abs(Math.sin(rotY || 0)) > Math.SQRT1_2;
    root.scale.set(quarter ? sz : sx, sy, quarter ? sx : sz);
  } else {
    root.scale.setScalar(s);
  }
  if (lot && rotY) root.rotation.y = rotY;

  const boxScaled = P.box();
  building.w = boxScaled.max.x - boxScaled.min.x;
  building.d = boxScaled.max.z - boxScaled.min.z;
  building._grid?.expandBounds(building);
  building.h = boxScaled.max.y - boxScaled.min.y;

  // (y0: the model's origin goes to that height as it is, e.g. a ship's waterline on the river)
  const yOffset = y0 != null ? y0 : Math.abs(boxScaled.min.y) > 0.5 ? -boxScaled.min.y : 0;
  const centerX = (boxScaled.min.x + boxScaled.max.x) / 2;
  const centerZ = (boxScaled.min.z + boxScaled.max.z) / 2;
  if (atOrigin) root.position.set(building.x, yOffset, building.z);
  else root.position.set(building.x - centerX, yOffset, building.z - centerZ);

  _bucketGLBNodes(P.nodes(), url, building);
}

/** Every mesh of a placed building ([{ node, matrix }] from _Placed.nodes,
 *  world matrices) becomes a pending instance slot of the building. */
function _bucketGLBNodes(nodes, url, building, append = false) {
  if (!append) building._glbSlots = [];
  for (const { node: m, matrix } of nodes) {
    if (!m.isMesh) continue;
    const e = matrix.elements;
    // building.glbBucket: a compact group (a festival) batches as one tile
    // (_bldgTile Infinity: the whole map is one tile; a finite one splits at the origin's axes at least)
    const tile = building.glbBucket || (_bldgTile === Infinity ? 'all' : `${Math.floor(e[12] / _bldgTile)},${Math.floor(e[14] / _bldgTile)}`);
    const key = `${m.geometry.uuid}|${m.material.uuid}|${tile}`;
    let b = _glbBuckets.get(key);
    if (!b) _glbBuckets.set(key, b = { geometry: m.geometry, material: m.material, cast: m.castShadow, recv: m.receiveShadow, items: [], lod1Only: !!building.lod1Only });
    b.items.push({ matrix: matrix.clone(), building });
  }
  if (append) return;
  building.customMesh = _GLB_MARKER;
  building.glbUrl = url; // what stands there (smoke_test: no procedural fallbacks)
}

/** Rooftop kit on a placed building (entry.roof: [{ url, fx, fz, ry, s }], NYC's
 *  water tanks): each piece at true scale s, at (fx, fz) of the lot's half
 *  sizes in its own frame (entry.lot, else the axis box), on the roof (the
 *  placed model's top less 2%), instanced with the building's own slots so it
 *  falls with it. */
function _placeRoofKit(entry) {
  const b = entry.building;
  if (b.destroyed || !b._glbSlots || !entry.roof) return;
  const r = entry.lot ? entry.rotY || 0 : 0, c = Math.cos(r), sn = Math.sin(r);
  const hw = (entry.lot ? entry.lot.w : b.w) / 2, hd = (entry.lot ? entry.lot.d : b.d) / 2;
  for (const k of entry.roof) {
    const tpl = _glbTemplates.get(k.url);
    if (!tpl) continue;
    const P = new _Placed(tpl.scene), top = P.top;
    const lx = k.fx * hw, lz = k.fz * hd;
    top.position.set(b.x + lx * c + lz * sn, b.h * 0.98, b.z - lx * sn + lz * c);
    top.rotation.y = r + (k.ry || 0);
    top.scale.setScalar(k.s || 1);
    _bucketGLBNodes(P.nodes(), k.url, b, true);
  }
}

// Repeat-fill never uses these (a row of them reads as residential)
const FILL_NO_REPEAT = /brick_hotel/;

/** Generic lot fill (entry.fill): the kit piece whose plan best covers the
 *  lot at the block height, fitted non-uniformly within +-25% in plan; a lot
 *  no single piece covers is cut along its long side into 2-4 frontage
 *  cells, each its own best-fitting piece (never the same as its neighbour)
 *  butted edge to edge, all one building. */
function _placeFillGLB(entry, scene) {
  const b = entry.building;
  if (b.destroyed) return;
  const rotY = entry.rotY || 0, h = entry.h, lot = entry.lot || null;
  // (a turned lot: cells laid out and fitted in the lot's own frame, offsets turned to the world)
  const W = lot ? lot.w : entry.maxW, D = lot ? lot.d : entry.maxD;
  const quarter = !lot && Math.abs(Math.sin(rotY)) > Math.SQRT1_2;
  const ca = Math.cos(rotY), sa = Math.sin(rotY);
  const urls = [...new Set([entry.url, ...(entry.pool || [])])].filter((u) => _glbTemplates.has(u));
  const dim = new Map();
  for (const u of urls) {
    const t = _glbTemplates.get(u);
    if (!t._size) { t.scene.updateMatrixWorld(true); t._size = new THREE.Box3().setFromObject(t.scene).getSize(new THREE.Vector3()); }
    const z = t._size;
    dim.set(u, quarter ? [z.z, z.y, z.x] : [z.x, z.y, z.z]); // world-axis plan after the turn
  }
  // Share of a w x d cell one piece covers at height h (plan stretch <= 1.25;
  // a piece too big for the cell has to shrink, and loses height: penalised)
  const cover = (u, w, d) => {
    const [rw, rh, rd] = dim.get(u), s = h / rh;
    const fw = rw * s, fd = rd * s;
    const k = Math.max(fw * 0.75 / w, fd * 0.75 / d, 1);
    return Math.min(w, fw * 1.25 / k) * Math.min(d, fd * 1.25 / k) / (w * d) / Math.sqrt(k);
  };
  const best = (w, d, not, list = urls) => {
    const c = list.filter((u) => u !== not).map((u) => [u, cover(u, w, d)]).sort((x, y) => y[1] - x[1]);
    const top = c.filter((x) => x[1] >= c[0][1] * 0.92); // near-ties: vary
    return top[Math.floor(Math.random() * top.length)] || c[0];
  };
  const [u0, c0] = best(W, D, null);
  if (c0 >= 0.75 || W * D < 12) { placeBuildingGLB(u0, h, b, scene, W, D, rotY, 1.25, false, lot); return; }
  const alongX = W >= D, len = alongX ? W : D, dep = alongX ? D : W;
  const [pw, , pd] = dim.get(u0), plong = (alongX ? pw : pd) * h / dim.get(u0)[1];
  const n = Math.max(2, Math.min(4, Math.round(len / Math.max(plong * 1.1, 1e-3))));
  const cl = len / n;
  // The cells' clones sat under an identity Group: its matrixWorld is the
  // identity, so each cell's nodes are walked under that
  const rootW = new THREE.Matrix4(), cells = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    const cw = alongX ? cl : dep, cd = alongX ? dep : cl;
    // Cell pieces scale to the block height but never past their cell in
    // plan (they were blown up to 3-7x the lot): only pieces that still
    // reach 75% of the height inside the cell, if any do
    let pool = urls.filter((u) => !FILL_NO_REPEAT.test(u));
    const fit = pool.filter((u) => { const [rw, rh, rd] = dim.get(u); return Math.min(cw / rw, cd / rd) * 1.25 >= h / rh * 0.75; });
    if (fit.length) pool = fit;
    const [u] = (pool.length ? best(cw, cd, prev, pool) || [pool[0]] : [u0]);
    const uu = pool.includes(u) ? u : (pool.find((x) => x !== prev) || u0);
    prev = uu;
    const [rw, rh, rd] = dim.get(uu), s = Math.min(h / rh * (0.9 + Math.random() * 0.2), cw / rw * 1.25, cd / rd * 1.25);
    // Plan scale to the cell (+-25% of the height scale), height by the block
    const sx = THREE.MathUtils.clamp(cw / rw, s * 0.75, s * 1.25), sz = THREE.MathUtils.clamp(cd / rd, s * 0.75, s * 1.25);
    const P = new _Placed(_glbTemplates.get(uu).scene), c = P.top;
    c.rotation.y = rotY;
    c.scale.set(quarter ? sz : sx, s, quarter ? sx : sz);
    const bx = P.box();
    const off = -len / 2 + (i + 0.5) * cl;
    const ox = alongX ? off : 0, oz = alongX ? 0 : off;
    const tx = b.x + (lot ? ox * ca + oz * sa : ox), tz = b.z + (lot ? -ox * sa + oz * ca : oz);
    c.position.set(tx - (bx.min.x + bx.max.x) / 2, -bx.min.y, tz - (bx.min.z + bx.max.z) / 2);
    cells.push(P);
  }
  b.w = lot ? entry.maxW : W; b.d = lot ? entry.maxD : D; b.h = h;
  b._grid?.expandBounds(b);
  _bucketGLBNodes(cells.flatMap((P) => P.nodes(rootW)), u0, b);
}

/** One building made of many true-size copies of a template (a fence run):
 *  tiles [{ x, z, ry }] are copy centres, each scaled to tileLen along its
 *  local X and h tall (depth keeps the height's scale). */
function _placeTiledGLB(url, entry) {
  const tpl = _glbTemplates.get(url), building = entry.building;
  if (!tpl || building.destroyed) return;
  tpl.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tpl.scene);
  const sx = entry.tileLen / Math.max(1e-3, box.max.x - box.min.x);
  const sy = entry.h / Math.max(1e-3, box.max.y - box.min.y);
  // root (identity Group) -> holder (tile position/turn) -> copy, as before
  const rootW = new THREE.Matrix4(), holder = new THREE.Object3D(), nodes = [];
  for (const t of entry.tiles) {
    holder.position.set(t.x, 0, t.z);
    holder.rotation.y = t.ry;
    holder.updateMatrix();
    const hw = new THREE.Matrix4().multiplyMatrices(rootW, holder.matrix);
    const P = new _Placed(tpl.scene), c = P.top;
    c.scale.set(sx, sy, sy);
    c.position.set(-(box.min.x + box.max.x) / 2 * sx, -box.min.y * sy, -(box.min.z + box.max.z) / 2 * sy);
    nodes.push(...P.nodes(hw));
  }
  _bucketGLBNodes(nodes, url, building);
}

// Pending GLB building instances, keyed geometry|material|tile (see above).
// Tile size trades draws against wasted triangles: every instance in a tile
// is drawn (and shadow-cast) if any part of the tile is visible. Measured
// headless (desktop HIGH, 5 kaiju positions, +-112u shadow frustum):
//   240u: 154 IMs, shadow 1.23M tris, in-view 1.82M   (big shadow regression)
//   120u: 247 IMs, shadow 0.56M,      in-view 1.45M   <- chosen
//    60u: 336 IMs, shadow 0.45M,      in-view 1.37M
//   per-building (~370 draws):        shadow ~0.50M, in-view ~1.38M
const BLDG_TILE = 120;
// A level with many low-poly generic GLBs (Chicago's kit, 56-272 tris each)
// batches into bigger tiles: draws scale with templates x tiles, triangles
// barely matter. buildCity resets it per level.
let _bldgTile = BLDG_TILE;
const _glbBuckets = new Map();
function _buildGLBBuildingInstances(scene) {
  const lodPairs = [];
  for (const b of _glbBuckets.values()) {
    // Templates with a registered LOD1 twin get a far copy of the bucket;
    // the LOD controller shows exactly one of the pair (Tokyo has none)
    // lod1Only (a hero model on phones): draw just the LOD1 twin, near and far
    const lod1 = _lod1ByGeom.get(b.geometry);
    const geoms = b.lod1Only && lod1 ? [lod1] : [b.geometry, lod1].filter(Boolean);
    const ims = geoms.map((geom) => {
      const im = new THREE.InstancedMesh(_ownVAO(geom), b.material, b.items.length);
      b.items.forEach((it, i) => {
        im.setMatrixAt(i, it.building.destroyed ? _zeroMatrix : it.matrix);
        it.building._glbSlots.push({ im, idx: i });
      });
      im.castShadow = b.cast;
      im.receiveShadow = b.recv;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      scene.add(im);
      return im;
    });
    if (ims.length === 2) {
      ims[1].visible = false;
      ims[1].userData.lodFar = true; // (wrestling/carve.js: a building's far twins are skipped when it is redrawn in pieces)
      lodPairs.push({ near: ims[0], far: ims[1], center: ims[0].boundingSphere.center });
    }
  }
  if (lodPairs.length) _makeLodController(scene, lodPairs);
  _glbBuckets.clear();
}

const _pendingGLBBuildings = [];
const _flushHooks = []; // run once by the next flushPendingGLBBuildings

/** A loaded template for height h when the picked one failed: another from the level's own pool. */
function _fallbackBuildingGLB(h, levelPool) {
  const lp = levelPool ? levelPool.filter((u) => _glbTemplates.has(u)) : [];
  return lp.length ? lp[Math.floor(Math.random() * lp.length)] : null;
}

/** Last resort: show the placeholder's procedural box so it never stays invisible. */
function _revealProceduralBody(b) {
  b._skipBodyIM = false;
  if (!b._bodyIM || b._bodyIndex < 0) return;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
  b._bodyIM.setMatrixAt(b._bodyIndex, m);
  b._bodyIM._matrixDirty = true;
  b._bodyIM.visible = true;
}

/** Called after templates load to clone + place every queued building. */
export function flushPendingGLBBuildings(scene) {
  let swapped = 0, boxed = 0;
  for (const entry of _pendingGLBBuildings) {
    let url = entry.url;
    if (!_glbTemplates.has(url)) {
      // Landmarks keep their silhouette as a box; generic blocks borrow another model
      url = entry.landmark ? null : _fallbackBuildingGLB(entry.h, entry.pool);
      if (url) swapped++;
    }
    if (url && entry.tiles) {
      _placeTiledGLB(url, entry);
    } else if (url && entry.fill) {
      _placeFillGLB({ ...entry, url }, scene);
      _placeRoofKit(entry);
    } else if (url) {
      placeBuildingGLB(url, entry.h, entry.building, scene, entry.maxW || 0, entry.maxD || 0, entry.rotY || 0, entry.stretch || 1, !!entry.atOrigin, entry.lot || null, entry.y0 ?? null);
      _placeRoofKit(entry);
    } else if (!entry.building.destroyed) {
      _revealProceduralBody(entry.building);
      boxed++;
    }
  }
  _buildGLBBuildingInstances(scene);
  // Level code that needs a parsed template itself (e.g. Chicago tiling its L
  // track GLB): called with a lookup that returns the template scene or null
  for (const fn of _flushHooks.splice(0)) fn(scene, (url) => _glbTemplates.get(url)?.scene || null);
  if (swapped || boxed) console.warn('[BuildingGLB] missing templates:', swapped, 'buildings swapped,', boxed, 'shown as boxes');
  _pendingGLBBuildings.length = 0;
}

/** Fetch the level's map data before buildCity (Tokyo is procedural: none). */
export function loadLevelData(level) {
  return level === 'chicago' ? loadChicagoLayout() : MAP_LEVELS[level] ? MAP_LEVELS[level].load() : Promise.resolve();
}

/** Build the selected level's city. opts.level: 'tokyo' (default) | 'chicago'.
 *  Returns { buildings, grid, bodiesIM, cityAnimators, cityRadius, level,
 *  bounds?, spawn?, roadNet?, isWater? } (Tokyo leaves the optional fields
 *  unset, so game.js keeps its Tokyo defaults). */
export function buildCity(scene, world, opts = {}) {
  // A replaced city that was never flushed (level switched at the menu)
  // must not leave its GLB placeholders or windows queued for the new one
  _pendingGLBBuildings.length = 0;
  _flushHooks.length = 0;
  // ...nor its camera hooks (LOD flips, harbour bands) on the reused scene
  if (scene.userData.camHooks) scene.userData.camHooks.length = 0;
  _glbBuckets.clear();
  _releaseVAOCopies();
  _windowQueue = [];
  _pedCfg = null;
  _carNet = null;
  _carLevel = _usLevel(opts.level) ? opts.level : 'tokyo';
  // Chicago: zelkova only (elm-like summer green; the ginkgo read neon yellow)
  _bldgTile = BLDG_TILE;
  // (DC: the same; its cherry trees round the Tidal Basin are its own landscape's)
  const usTrees = _usLevel(opts.level);
  _treeTint = usTrees ? new THREE.Color(0.62, 0.78, 0.55) : null;
  _treeExclude = new Set();
  _resetCollapseFx();
  _debrisSet = LEVEL_DEBRIS[opts.level] ? opts.level : 'default';
  _boxDebrisTint = MAP_LEVELS[opts.level]?.boxTint != null ? new THREE.Color(MAP_LEVELS[opts.level].boxTint) : null;
  // The ring stands on Hutchinson Field unless a level moves it (dc.js does)
  setArenaSite();
  const res = opts.level === 'chicago' ? buildChicago(scene, world, opts, CITY_KIT)
    : (MAP_LEVELS[opts.level] || MAP_LEVELS.tokyo).build(scene, world, opts, CITY_KIT);
  // Queued collapse effects, a few buildings per frame (see _drainCollapseFx)
  (res.cityAnimators || (res.cityAnimators = [])).push({ update: () => _drainCollapseFx(world) });
  return res;
}

// Pigeon flock: 14 birds drifting in slow lazy circles overhead. Wings
// flap via a sine curve in the animator. Three IMs (body, wing-L, wing-R)
// plus an animator object that the main loop ticks.
function makePigeonFlock(scene) {
  const COUNT = 14;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.85 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.8, side: THREE.DoubleSide });
  const bodyGeom = new THREE.BoxGeometry(0.45, 0.35, 1.0);
  const wingGeom = new THREE.BoxGeometry(1.4, 0.05, 0.45);
  const bodyIM = new THREE.InstancedMesh(bodyGeom, bodyMat, COUNT);
  const wingLIM = new THREE.InstancedMesh(wingGeom, wingMat, COUNT);
  const wingRIM = new THREE.InstancedMesh(wingGeom, wingMat, COUNT);
  bodyIM.frustumCulled = false; wingLIM.frustumCulled = false; wingRIM.frustumCulled = false;
  scene.add(bodyIM); scene.add(wingLIM); scene.add(wingRIM);
  // Each pigeon has its own circle: random center, radius, height,
  // angular speed, phase, and wing-flap phase offset.
  const birds = [];
  for (let i = 0; i < COUNT; i++) {
    birds.push({
      cx: (Math.random() - 0.5) * 600,
      cz: (Math.random() - 0.5) * 600,
      r:  20 + Math.random() * 80,
      y:  35 + Math.random() * 45,
      omega: 0.18 + Math.random() * 0.25, // rad/s
      phase: Math.random() * Math.PI * 2,
      flapPhase: Math.random() * Math.PI * 2,
      flapHz: 6 + Math.random() * 3,
    });
  }
  const dummy = new THREE.Object3D();
  // Update writes new matrices each frame.
  function update(dt, time) {
    for (let i = 0; i < COUNT; i++) {
      const b = birds[i];
      const a = b.phase + time * b.omega;
      const x = b.cx + Math.cos(a) * b.r;
      const z = b.cz + Math.sin(a) * b.r;
      // Tangent direction for the bird's heading
      const yaw = a + Math.PI / 2;
      const flap = Math.sin(b.flapPhase + time * b.flapHz);
      // Body
      dummy.position.set(x, b.y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      bodyIM.setMatrixAt(i, dummy.matrix);
      // Wings flap up/down with the sine curve
      const wingTilt = flap * 0.8;
      // Left wing
      dummy.position.set(x, b.y + 0.05, z);
      dummy.rotation.set(0, yaw, wingTilt);
      dummy.updateMatrix(); wingLIM.setMatrixAt(i, dummy.matrix);
      // Right wing -- mirror
      dummy.rotation.set(0, yaw + Math.PI, wingTilt);
      dummy.updateMatrix(); wingRIM.setMatrixAt(i, dummy.matrix);
    }
    bodyIM.instanceMatrix.needsUpdate = true;
    wingLIM.instanceMatrix.needsUpdate = true;
    wingRIM.instanceMatrix.needsUpdate = true;
  }
  return { update };
}

// -------------------- Cars --------------------
const CAR_COLORS = [0xff3344, 0x33aaff, 0xffcc33, 0xffffff, 0x222222, 0x44aa66, 0xaa44ff];

// --------------- GLB car templates ---------------
// v2 Japanese vehicles: front faces +Z, bottom-centre origin, real-world metres
// (len). Clones are scaled by CAR_UNITS_PER_M so a bus stays ~3x a kei van.
// parked:false keeps long vehicles out of the 6u-spaced kerbside parking rows.
// weight = relative share of moving traffic (bus ≈ 6%).
// levels: the levels whose traffic uses it (default: every level).
// (every level's traffic comes from its own manifest; Chicago's US fleet is shared by the US levels)
const CAR_GLBS = [];
// Old Meshy cars, loaded only if none of the v2 vehicles load
const CAR_GLBS_FALLBACK = [
  { url: './assets/cars/car_1.glb' },
  { url: './assets/cars/car_2.glb' },
];
const CAR_UNITS_PER_M = 3.6 / 4.5; // a 4.5m sedan matches the old 3.6u car
const _carTemplates = []; // array of { scene, box, len, parked } after loading

/** Car clone length in world units (old templates have no len: fixed 3.6u). */
function _carTargetLen(tpl) {
  return tpl.len ? tpl.len * CAR_UNITS_PER_M : 3.6;
}

const _carLoading = new Set(); // urls requested (each vehicle loads once)
// Level whose traffic is spawned (buildCity sets it); templates tagged with
// other levels are skipped.
let _carLevel = 'tokyo';
const _carFor = (t) => !t.levels || t.levels.includes(_carLevel);

function _loadCarList(list, onProgress) {
  list = list.filter((d) => !_carLoading.has(d.url));
  for (const d of list) _carLoading.add(d.url);
  return Promise.all(list.map((def, idx) =>
    _cachedGLB(def.url).then((gltf) => {
      const s = gltf.scene;
      let meshCount = 0;
      s.traverse((o) => { if (o.isMesh) { meshCount++; o.castShadow = true; o.receiveShadow = true; } });
      if (meshCount === 0) {
        reportLoadError('CarGLB', def.url, new Error('no meshes found'));
        return;
      }
      // albedo: a per-model base-colour scale (a white body over a level's bloom threshold)
      if (def.albedo) s.traverse((o) => { if (o.isMesh && o.material.color) o.material.color.multiplyScalar(def.albedo); });
      _carTemplates.push({ scene: s, box: new THREE.Box3().setFromObject(s), len: def.len, parked: def.parked !== false, weight: def.weight || 1, levels: def.levels, minRoadW: def.minRoadW, lightBar: !!def.lightBar, flash: _flashMats(s) });
      if (onProgress) onProgress(idx + 1, list.length, def.url.split('/').pop().replace('.glb', ''));
      return _attachLod1(def.url, s);
    }).catch((err) => {
      reportLoadError('CarGLB', def.url, err);
      if (onProgress) onProgress(idx + 1, list.length, 'error');
    })
  ));
}

/** The level's vehicle defs (shared v2 vehicles plus the level's own). */
function _levelCars(level) {
  // DC drives Chicago's US fleet (less the CTA bus) plus its own; tagging
  // both levels on the shared templates leaves Chicago's traffic as it was
  // (NYC the same)
  const us = chicagoVehicleGLBs().map((v) => ({ ...v, levels: /cta_bus/.test(v.url) ? ['chicago'] : ['chicago', ...Object.keys(MAP_LEVELS).filter((k) => k !== 'tokyo')] }));
  const own = level === 'chicago' ? us : MAP_LEVELS[level] ? [...us.filter((v) => v.levels.includes(level)), ...MAP_LEVELS[level].vehicles()] : [];
  return [...CAR_GLBS.filter((d) => !d.levels || d.levels.includes(level)), ...own];
}

/** Load the level's car GLB templates. Call once at startup (and again for a level picked later). */
export async function loadCarTemplates(onProgress, level = 'tokyo') {
  await _loadCarList(_levelCars(level), onProgress);
  if (_carTemplates.length === 0) await _loadCarList(CAR_GLBS_FALLBACK, onProgress);
}

function _cloneCarScene(tpl) {
  const group = new THREE.Group();
  tpl.scene.traverse((o) => {
    if (o.isMesh) {
      const m = new THREE.Mesh(o.geometry, o.material);
      o.updateWorldMatrix(true, false);
      m.applyMatrix4(o.matrixWorld);
      m.castShadow = false; // moving cars: too small to matter in the shadow pass
      m.receiveShadow = true;
      group.add(m);
    }
  });
  return group;
}

/** A vehicle's own light-bar lens materials (lightbar_red / lightbar_blue), if any. */
function _flashMats(scene) {
  const f = {};
  scene.traverse((o) => { if (o.isMesh) { const m = /lightbar_(red|blue)/.exec(o.material.name || ''); if (m) f[m[1]] = o.material; } });
  return f.red && f.blue ? f : null;
}

// Police light bar: shared by every flashing car, toggled in Car.update
let _lightBarGeom = null;
const _lightBarMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2020, emissiveIntensity: 2.2 });
const markSharedGeom = (g) => { g.userData.shared = true; return g; };

export class Car {
  constructor(x, z, axis /* 'x' or 'z' */, dir /* +1/-1 */, model = null /* a _carTemplates entry: this one, not a weighted pick */) {
    this.dead = false;
    this.axis = axis; this.dir = dir;
    this.speed = 12 + Math.random() * 8;
    this.cruise = this.speed; // the speed it eases back to behind a clear road
    this.len = 3.6; // length (u) for following gaps; GLB cars set their own
    const root = new THREE.Group();
    root.position.set(x, 0.6, z);

    const tpls = _carTemplates.filter(_carFor);
    if (tpls.length > 0) {
      // GLB car: pick a template by traffic weight
      let pick = Math.random() * tpls.reduce((s, t) => s + t.weight, 0);
      let tpl = tpls[tpls.length - 1];
      for (const t of tpls) { pick -= t.weight; if (pick < 0) { tpl = t; break; } }
      if (model) tpl = model;
      const clone = _cloneCarScene(tpl);
      // Long vehicles (buses, 10 m+; or a model's own minRoadW) keep to the
      // major streets: Loop bus routes run on State, Michigan, Madison,
      // Jackson... not 4.5u side streets
      this.minRoadW = tpl.minRoadW ?? (tpl.len && tpl.len >= 10 ? 6.5 : 0);
      const size = tpl.box.getSize(new THREE.Vector3());
      const targetLen = _carTargetLen(tpl); // old cars: ~3.6u to match procedural size
      this.len = targetLen;
      const s = targetLen / Math.max(size.x, size.y, size.z);
      clone.scale.setScalar(s);
      clone.updateMatrixWorld(true);
      const cloneBox = new THREE.Box3().setFromObject(clone);
      clone.position.y = -cloneBox.min.y - 0.6; // sit on road surface
      root.add(clone);
      if (tpl.flash) this._flash = tpl.flash; // the model's own lenses: flash them
      else if (tpl.lightBar) {
        // Roof light bar (the model's is unlit): one shared material flashed
        // red/blue for every police car, so it costs a draw per car only
        const cl = targetLen;
        const lb = new THREE.Mesh(_lightBarGeom || (_lightBarGeom = markSharedGeom(new THREE.BoxGeometry(1, 1, 1))), _lightBarMat);
        lb.scale.set(cl * 0.28, cl * 0.035, cl * 0.07);
        lb.position.set(0, cloneBox.max.y - cloneBox.min.y - 0.6 + cl * 0.015, -cl * 0.04);
        root.add(lb);
        this._lightBar = true;
      }
      // LOD1 swap targets (geometry only; the material is shared)
      this._lodMeshes = clone.children
        .filter((m) => _lod1ByGeom.has(m.geometry))
        .map((m) => ({ mesh: m, g0: m.geometry, g1: _lod1ByGeom.get(m.geometry) }));
      this._far = false;
    } else {
      // Procedural fallback
      const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.6 });
      const lightMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffee99, emissiveIntensity: 1.2 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 3.4), bodyMat);
      body.castShadow = true;
      root.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.6), glassMat);
      cabin.position.set(0, 0.65, -0.1);
      root.add(cabin);
      for (const sx of [-0.7, 0.7]) {
        for (const sz of [-1.1, 1.1]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8), dark);
          w.rotation.z = Math.PI / 2; w.position.set(sx, -0.35, sz);
          root.add(w);
        }
      }
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
      hl.position.set(-0.45, 0.0, 1.7); root.add(hl);
      const hr = hl.clone(); hr.position.x = 0.45; root.add(hr);
    }

    if (axis === 'x') root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    else if (dir < 0) root.rotation.y = Math.PI;

    this.root = root;
  }

  /** Put the car on road-network edge ei (see buildRoadNet), heading away
   *  from node `from`, t units along it. */
  _placeOnNet(net, ei, from, t) {
    this.net = net;
    this.edge = ei;
    this.from = from;
    this.t = t;
    this._occupy(ei);
    this._netPose();
  }

  /** Move this car to edge ei's list in net._occ (the cars on each edge, for
   *  following gaps): touched only on an edge change, never per frame. */
  _occupy(ei) {
    const occ = this.net._occ || (this.net._occ = new Map());
    if (this._occEdge !== undefined) {
      const l = occ.get(this._occEdge), k = l ? l.indexOf(this) : -1;
      if (k >= 0) l.splice(k, 1);
    }
    let l = occ.get(ei);
    if (!l) occ.set(ei, l = []);
    l.push(this);
    this._occEdge = ei;
  }

  /** Following distance: ease toward the speed of the nearest car ahead on
   *  this edge in this direction, slowing as the bumper gap drops under 1.5
   *  car lengths and stopping under 0.3 (one short list per edge, no
   *  all-pairs). Back to cruise speed on a clear road. */
  _follow(dt) {
    let list = this.net._occ && this.net._occ.get(this.edge);
    if (!list || this._occEdge !== this.edge) { this._occupy(this.edge); list = this.net._occ.get(this.edge); }
    // Cars that stopped updating (removed without dying, e.g. the menu's
    // shader-prewarm traffic) drop out after half a second
    const now = this._seen = performance.now();
    let lead = null, gap = Infinity;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.dead || now - c._seen > 500) { list.splice(i, 1); if (c !== this && !c.dead) c._occEdge = undefined; continue; }
      if (c === this || c.from !== this.from || c.t <= this.t) continue;
      if (c.t - this.t < gap) { gap = c.t - this.t; lead = c; }
    }
    let v = this.cruise;
    if (lead) {
      const bump = gap - (this.len + lead.len) / 2, stop = 0.3 * this.len, near = 1.5 * this.len;
      if (bump < near) v = Math.min(v, lead.speed) * Math.max(0, Math.min(1, (bump - stop) / (near - stop)));
    }
    this.speed += (v - this.speed) * Math.min(1, dt * 4);
  }

  _netPose() {
    const e = this.net.edges[this.edge];
    const a = this.net.nodes[this.from];
    const sgn = this.from === e.a ? 1 : -1;
    const dx = e.dx * sgn, dz = e.dz * sgn;
    // Right-hand traffic: the lane centre sits a quarter road width to the
    // right of the centreline ((-dz, dx) is "right" of heading (dx, dz)).
    const off = e.laneOff;
    this.root.position.set(a.x + dx * this.t - dz * off, this.root.position.y, a.z + dz * this.t + dx * off);
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  _updateNet(dt) {
    const net = this.net;
    this._follow(dt);
    this.t += this.speed * dt;
    let e = net.edges[this.edge];
    let guard = 0;
    while (this.t > e.len && guard++ < 4) {
      this.t -= e.len;
      const node = this.from === e.a ? e.b : e.a;
      const out = net.nodes[node].edges;
      // Any edge but the one we came along (U-turn only at dead ends)
      let next = this.edge;
      if (out.length > 1) {
        const wide = this.minRoadW ? out.filter((ei) => ei !== this.edge && net.edges[ei].laneOff * 4 >= this.minRoadW) : [];
        if (wide.length) next = wide[Math.floor(Math.random() * wide.length)];
        else do { next = out[Math.floor(Math.random() * out.length)]; } while (next === this.edge);
      }
      this.edge = next;
      this.from = node;
      e = net.edges[next];
    }
    if (this._occEdge !== this.edge) this._occupy(this.edge);
    this._netPose();
  }

  update(dt, world, kaijuPos, cityRadius, blockSize) {
    if (this.dead) return;
    if (this.net) {
      this._updateNet(dt);
      this._afterMove(world, kaijuPos);
      return;
    }
    const BLOCK = blockSize || 40;
    const root = this.root;
    // Move along the current axis
    if (this.axis === 'x') root.position.x += this.speed * this.dir * dt;
    else                   root.position.z += this.speed * this.dir * dt;

    // Decide whether we're crossing an intersection. Intersections sit at every
    // multiple of BLOCK along the perpendicular axis. We compute distance from
    // the nearest intersection on the axis we're DRIVING along.
    const along = this.axis === 'x' ? root.position.x : root.position.z;
    const phase = ((along + BLOCK / 2) % BLOCK + BLOCK) % BLOCK; // 0..BLOCK
    const distToCenter = Math.abs(phase - BLOCK / 2);
    const stepLen = Math.abs(this.speed * dt);
    if (distToCenter <= stepLen && (this._lastCrossDist || 1e9) > distToCenter) {
      // Just crossed an intersection -- 25% chance to turn 90°.
      if (Math.random() < 0.25) {
        // Snap to the intersection so the turn looks clean
        const snap = Math.round(along / BLOCK) * BLOCK;
        if (this.axis === 'x') root.position.x = snap;
        else                   root.position.z = snap;
        // Switch axis and pick a new direction (left or right turn).
        this.axis = this.axis === 'x' ? 'z' : 'x';
        this.dir = Math.random() < 0.5 ? 1 : -1;
        // Set lane offset so we drive on the correct side of the road
        if (this.axis === 'x') {
          root.position.z = Math.round(root.position.z / BLOCK) * BLOCK + (this.dir > 0 ? -2 : 2);
          root.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          root.position.x = Math.round(root.position.x / BLOCK) * BLOCK + (this.dir > 0 ? 2 : -2);
          root.rotation.y = this.dir > 0 ? 0 : Math.PI;
        }
      }
    }
    this._lastCrossDist = distToCenter;

    // Wrap around city bounds
    const lim = cityRadius + 30;
    if (root.position.x > lim) root.position.x = -lim;
    if (root.position.x < -lim) root.position.x = lim;
    if (root.position.z > lim) root.position.z = -lim;
    if (root.position.z < -lim) root.position.z = lim;
    this._afterMove(world, kaijuPos);
  }

  _afterMove(world, kaijuPos) {
    if (this._lightBar) _lightBarMat.emissive.setHex(((performance.now() / 250) | 0) % 2 ? 0x2050ff : 0xff2020);
    if (this._flash) {
      const on = ((performance.now() / 250) | 0) % 2;
      this._flash.red.emissiveIntensity = on ? 3.0 : 0.15;
      this._flash.blue.emissiveIntensity = on ? 0.15 : 3.0;
    }
    // Stomped by kaiju
    const dx = kaijuPos.x - this.root.position.x;
    const dz = kaijuPos.z - this.root.position.z;
    // Far from the kaiju (and so from the chase camera): draw the LOD1 geometry
    if (this._lodMeshes && this._lodMeshes.length) {
      const far = dx * dx + dz * dz > LOD1_DIST * LOD1_DIST;
      if (far !== this._far) {
        this._far = far;
        for (const l of this._lodMeshes) l.mesh.geometry = far ? l.g1 : l.g0;
      }
    }
    if (dx * dx + dz * dz < 5 * 5) {
      this.explode(world);
    }
  }

  explode(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(1), 0.7);
    world.shake(0.15, 0.15);
    this.root.parent && this.root.parent.remove(this.root);
    world.onCarDestroyed?.();
  }
}

// Road network the cars follow on a non-Tokyo level (set by its builder via
// CITY_KIT.setCarNet); null for Tokyo's block grid.
let _carNet = null;

/** Road graph from polylines [{ points: [[x, z], ...], width }]. Points
 *  closer than `snap` are merged into one node, so roads that share
 *  endpoints (or cross at a shared vertex) become intersections. */
export function buildRoadNet(roads, snap = 1.5) {
  const nodes = [], edges = [];
  const key = (x, z) => Math.round(x / snap) + ':' + Math.round(z / snap);
  const byKey = new Map();
  const nodeAt = (x, z) => {
    const k = key(x, z);
    let i = byKey.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, z, edges: [] }); byKey.set(k, i); }
    return i;
  };
  for (const r of roads) {
    const pts = r.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = nodeAt(pts[i][0], pts[i][1]), b = nodeAt(pts[i + 1][0], pts[i + 1][1]);
      if (a === b) continue;
      const A = nodes[a], B = nodes[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const ei = edges.length;
      edges.push({ a, b, len, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len, laneOff: (r.width || 8) / 4 });
      A.edges.push(ei); B.edges.push(ei);
    }
  }
  let total = 0;
  for (const e of edges) total += e.len;
  return { nodes, edges, total };
}

export function spawnCars(scene, count, cityRadius = 380, blockSize = 36) {
  const cars = [];
  if (_carNet && _carNet.edges.length) {
    const net = _carNet;
    for (let i = 0; i < count; i++) {
      // Edge picked by length, so traffic density is even along the roads
      let r = Math.random() * net.total, ei = 0;
      while (ei < net.edges.length - 1 && r > net.edges[ei].len) { r -= net.edges[ei].len; ei++; }
      let e = net.edges[ei];
      const c = new Car(0, 0, 'z', 1);
      if (c.minRoadW && e.laneOff * 4 < c.minRoadW) {
        // A bus spawns on a major street
        const wide = net.edges.map((x, k) => k).filter((k) => net.edges[k].laneOff * 4 >= c.minRoadW);
        if (wide.length) { ei = wide[Math.floor(Math.random() * wide.length)]; e = net.edges[ei]; }
      }
      c._placeOnNet(net, ei, Math.random() < 0.5 ? e.a : e.b, Math.random() * e.len);
      scene.add(c.root);
      cars.push(c);
    }
    return cars;
  }
  for (let i = 0; i < count; i++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const dir = Math.random() < 0.5 ? 1 : -1;
    // Pick a street line (multiple of blockSize), with random position along it
    const lane = (Math.floor(Math.random() * (cityRadius * 2 / blockSize)) - cityRadius / blockSize) * blockSize;
    const along = (Math.random() - 0.5) * cityRadius * 2;
    const x = axis === 'x' ? along : lane + (dir > 0 ? -2 : 2);
    const z = axis === 'z' ? along : lane + (dir > 0 ? 2 : -2);
    const c = new Car(x, z, axis, dir);
    scene.add(c.root);
    cars.push(c);
  }
  return cars;
}

// -------------------- Civilians --------------------
// Tiny 2u-tall pedestrians who wander the city. They panic and sprint away
// when the kaiju is within 30u, and instantly die if the kaiju is within
// 3u. Each squashed civilian fires world.onCivilianStomped() (small score
// + rage bonus). Pure ambient flavour -- not registered with the spatial
// grid, no collision against buildings (they're tiny enough to clip OK).

// --------------- Pedestrian GLB templates ---------------
// One merged GLB (skinned mesh + all clips); clips are named after the
// original per-animation file minus '.glb'.
const PED_FILE = './assets/enemies/pedestrian/pedestrian.glb';
const PED_ANIMS = {
  walk: 'Walking.glb',
  run:  'Running.glb',
  sprint: 'Run_02.glb',
};
let _pedTemplate = null; // { scene, animations: { name: clip } }

/** Load pedestrian GLB templates. Call once at startup. */
export async function loadPedestrianTemplates(onProgress) {
  const animNames = Object.keys(PED_ANIMS);
  let scene = null;
  const animations = {};
  try {
    const gltf = await _cachedGLB(PED_FILE);
    scene = gltf.scene;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); // ~2u tall: no shadow pass
    const clips = new Map(gltf.animations.map((c) => [c.name, c]));
    for (const name of animNames) {
      const clip = clips.get(PED_ANIMS[name].replace(/\.glb$/, ''));
      if (clip) animations[name] = clip;
      else reportLoadError('PedGLB', PED_FILE, new Error(`missing clip ${PED_ANIMS[name]}`));
    }
  } catch (e) {
    reportLoadError('PedGLB', PED_FILE, e);
  }
  if (onProgress) onProgress(animNames.length, animNames.length, 'pedestrian');

  if (scene) _pedTemplate = { scene, animations };
}

function _clonePedestrian() {
  if (!_pedTemplate) return null;
  const clone = skinnedClone(_pedTemplate.scene);
  // Pose the cloned skeleton before anyone measures it (see enemies.js _cloneBiped)
  clone.updateMatrixWorld(true);
  clone.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.boundingBox = null; } });
  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const [name, clip] of Object.entries(_pedTemplate.animations)) {
    actions[name] = mixer.clipAction(clip);
  }
  return { root: clone, mixer, actions };
}

let _civFallback = null; // shared look of the procedural fallback civilian (see Civilian)
const _civSphere = new THREE.Sphere(), _civCenter = new THREE.Vector3();
export class Civilian {
  constructor(x, z) {
    this.dead = false;
    this.speed = 4 + Math.random() * 2;
    this.heading = Math.random() * Math.PI * 2;
    this.headingChangeT = 1 + Math.random() * 2;
    this._currentAnim = '';

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const ped = _clonePedestrian();
    if (ped) {
      const box = new THREE.Box3().setFromObject(ped.root);
      const size = box.getSize(new THREE.Vector3());
      // Same height as soldiers. (The old 0.9 was measured against an unposed
      // clone, so civilians actually rendered ~3.8u tall.)
      const targetH = 2.0;
      const s = targetH / size.y;
      ped.root.scale.setScalar(s);
      box.setFromObject(ped.root);
      ped.root.position.y = -box.min.y;
      ped.root.rotation.y = Math.PI; // align front
      root.add(ped.root);
      this.mixer = ped.mixer;
      this._actions = ped.actions;
      if (ped.actions.walk) { ped.actions.walk.play(); this._currentAnim = 'walk'; }
    } else {
      // Minimal procedural fallback (phone LOW: no pedestrian GLB). Every
      // fallback civilian shares one set of materials and boxes, so the
      // crowd draws as 2 batches (carBatch) instead of 3 meshes each.
      const fb = _civFallback || (_civFallback = {
        torsoMat: new THREE.MeshStandardMaterial({ color: 0x55aaff, roughness: 0.85 }),
        legMat: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.95 }),
        legGeom: markSharedGeom(new THREE.BoxGeometry(0.18, 0.7, 0.2)),
        torsoGeom: markSharedGeom(new THREE.BoxGeometry(0.5, 0.7, 0.3)),
      });
      const legL = new THREE.Mesh(fb.legGeom, fb.legMat);
      legL.position.set(-0.12, 0.35, 0); root.add(legL);
      const legR = legL.clone(); legR.position.x = 0.12; root.add(legR);
      this.legL = legL; this.legR = legR;
      const torso = new THREE.Mesh(fb.torsoGeom, fb.torsoMat);
      torso.position.y = 1.05; root.add(torso);
      this.walkPhase = Math.random() * Math.PI * 2;
    }

    this.root = root;
  }

  _playAnim(name) {
    if (!this._actions || this._currentAnim === name || !this._actions[name]) return;
    if (this._actions[this._currentAnim]) this._actions[this._currentAnim].fadeOut(0.2);
    this._actions[name].reset().fadeIn(0.2).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos, cityRadius) {
    if (this.dead) return;
    const myPos = this.root.position;
    const dx = kaijuPos.x - myPos.x;
    const dz = kaijuPos.z - myPos.z;
    const distSq = dx * dx + dz * dz;
    // Skinned-mixer ticks are the civilians' main per-frame cost. Beyond
    // ~120u a pedestrian is a few pixels tall, so tick its mixer at 1/4
    // rate with the accumulated dt (same pose timing, a quarter of the work).
    // Out of the last frame's view (world.viewFrustum, with a margin), or
    // past the phones' draw distance (_farHidden, carBatch), it isn't drawn
    // at all: the dt just accumulates until it is.
    if (this.mixer) {
      this._mixDt = (this._mixDt || 0) + dt;
      this._mixSkip = (this._mixSkip || 0) + 1;
      const fr = world.viewFrustum;
      const inView = !this._farHidden && (!(fr instanceof THREE.Frustum) || fr.intersectsSphere(_civSphere.set(_civCenter.set(myPos.x, myPos.y + 1, myPos.z), 4)));
      if (!this._mixed || (inView && (distSq < 120 * 120 || this._mixSkip >= 4))) {
        this._mixed = true; // always posed once (no bind pose on its first frame in view)
        this.mixer.update(this._mixDt);
        this._mixDt = 0; this._mixSkip = 0;
      }
    }

    // Squashed
    if (distSq < 9) { this.die(world); return; }

    let speed = this.speed;
    let panicking = false;
    if (distSq < 900) { // 30u panic radius
      const d = Math.sqrt(distSq) || 1;
      this.heading = Math.atan2(-dx / d, -dz / d);
      speed *= 2.6;
      panicking = true;
    } else {
      this.headingChangeT -= dt;
      if (this.headingChangeT <= 0) {
        this.heading += (Math.random() - 0.5) * Math.PI;
        this.headingChangeT = 1.5 + Math.random() * 2;
      }
    }

    const prevZ = myPos.z;
    myPos.x += Math.sin(this.heading) * speed * dt;
    myPos.z += Math.cos(this.heading) * speed * dt;
    // The river is off limits: stop at the bank and turn back.
    if (myPos.z > _pedRiverMin && myPos.z < _pedRiverMax) {
      myPos.z = prevZ;
      this.heading = Math.PI - this.heading;
      this.headingChangeT = 1.5 + Math.random() * 2;
    }
    if (_pedCfg) {
      // Level with its own water/bounds (Chicago): step back off the water
      // and turn around; bounds clamp instead of wrapping (the lake edge).
      if (_pedCfg.blocked(myPos.x, myPos.z)) {
        myPos.x -= Math.sin(this.heading) * speed * dt;
        myPos.z = prevZ;
        this.heading += Math.PI * (0.75 + Math.random() * 0.5);
        this.headingChangeT = 1.5 + Math.random() * 2;
      }
      const bd = _pedCfg.bounds;
      myPos.x = THREE.MathUtils.clamp(myPos.x, bd.minX, bd.maxX);
      myPos.z = THREE.MathUtils.clamp(myPos.z, bd.minZ, bd.maxZ);
    }
    const lim = _pedCfg ? Infinity : cityRadius;
    if (myPos.x > lim)  myPos.x = -lim;
    if (myPos.x < -lim) myPos.x =  lim;
    if (myPos.z > lim)  myPos.z = -lim;
    if (myPos.z < -lim) myPos.z =  lim;

    this.root.rotation.y = this.heading + Math.PI;

    // Animate: walk normally, run/sprint when panicking
    if (this._actions) {
      this._playAnim(panicking ? (this._actions.sprint ? 'sprint' : 'run') : 'walk');
    } else if (this.legL) {
      this.walkPhase += dt * (panicking ? 18 : 8);
      const sw = Math.sin(this.walkPhase) * 0.5;
      this.legL.rotation.x =  sw;
      this.legR.rotation.x = -sw;
    }
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    if (this.root.parent) this.root.parent.remove(this.root);
    disposeInstance(this.root);
    world.onCivilianStomped?.();
  }
}

// River band (z) that pedestrians must stay out of. Written by buildCity()
// so it tracks the lite/desktop RIVER_Z; NaN until then (no-op checks).
let _pedRiverMin = NaN, _pedRiverMax = NaN;
// Level-provided pedestrian rules ({ blocked(x, z), bounds, spawn() -> [x, z] }),
// set by a non-Tokyo builder; null for Tokyo (the river band above applies).
let _pedCfg = null;

export function spawnCivilians(scene, count, cityRadius) {
  const arr = [];
  if (_pedCfg) {
    for (let i = 0; i < count; i++) {
      const [x, z] = _pedCfg.spawn();
      const c = new Civilian(x, z);
      scene.add(c.root);
      arr.push(c);
    }
    return arr;
  }
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 50 + Math.random() * (cityRadius - 80);
    let z = Math.sin(a) * r;
    // Never spawn on the water; push to the nearer bank.
    if (z > _pedRiverMin && z < _pedRiverMax) {
      const mid = (_pedRiverMin + _pedRiverMax) / 2;
      z = z < mid ? _pedRiverMin - 2 - Math.random() * 6 : _pedRiverMax + 2 + Math.random() * 6;
    }
    const c = new Civilian(Math.cos(a) * r, z);
    scene.add(c.root);
    arr.push(c);
  }
  return arr;
}

/** Urls whose LOD1 twin a level loads (its trees, props and vehicles). */
function _levelLod1Urls(level) {
  return new Set([...TREE_GLBS.map((t) => t.url), ..._levelProps(level).map((p) => p.url), ..._levelCars(level).map((c) => c.url),
    ..._levelBuildingGLBs(level)]);
}

/** Loaded vs expected template sets, for tools/smoke_test.mjs (read-only). */
export function getTemplateStats(level = 'tokyo') {
  return {
    trees: { loaded: _treeTemplates.length, expected: TREE_GLBS.length },
    buildings: { loaded: [..._glbTemplates.keys()], expected: [...new Set(_levelBuildingGLBs(level))] },
    debris: { loaded: _debrisTemplates.length, expected: DEBRIS_GLBS.length + (LEVEL_DEBRIS[level] || []).length },
    cars: { loaded: _carTemplates.length, expected: _levelCars(level).length },
    props: { loaded: [..._propTemplates.keys()], expected: _levelProps(level).map((p) => p.name) },
    pedestrian: { loaded: _pedTemplate ? Object.keys(_pedTemplate.animations) : [], expected: Object.keys(PED_ANIMS) },
    lod1: { loaded: [..._lod1Attached], expected: [...LOD1_READY].filter((u) => _levelLod1Urls(level).has(u)) },
  };
}

// City-building internals handed to the non-Tokyo level builders
// (src/levels/*.js) so they reuse the same building, instancing, LOD,
// destruction and prop systems as Tokyo without a circular import.
const CITY_KIT = {
  Building, BuildingGrid, setBuildingLite, buildGlobalBodies, buildGlobalWindows,
  instanceStaticClones: _instanceStaticClones, mergeStaticMeshes: _mergeStaticMeshes,
  makeTree, makePigeonFlock, onCamera: _onCamera, lod1Of: (geom) => _lod1ByGeom.get(geom) || null, cloneProp: _cloneProp, hasProp: (n) => _propTemplates.has(n),
  registerLod1: (geometry, lod) => _lod1ByGeom.set(geometry, lod),
  propSize: (n) => _propTemplates.get(n)?.size || null,
  propScene: (n) => _propTemplates.get(n)?.scene || null,
  loadTileTex: _loadTileTex, loadDataTex: _loadDataTex,
  groundMaps: () => ({ map: _groundColor, normalMap: _groundNorm, roughnessMap: _groundRough, aoMap: _groundAO }),
  signTex: makeNeonSignTexture,
  wornPaintTex: () => _wornPaintTex || (_wornPaintTex = _makeWornPaintTexture()),
  queueGLB: (entry) => _pendingGLBBuildings.push(entry),
  onTemplatesReady: (fn) => _flushHooks.push(fn),
  setBuildingTile: (t) => { _bldgTile = t; },
  hasTemplate: (url) => _glbTemplates.has(url),
  /** A level's own procedural model as a building template under url (Seattle's
   *  unready landmarks: placed through queueGLB like a GLB, so they get instance
   *  slots and can be lifted or torn like one). Built once: a known url is kept. */
  registerTemplate: (url, scene) => {
    if (_glbTemplates.has(url)) return;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    _glbTemplates.set(url, { scene, box: new THREE.Box3().setFromObject(scene) });
  },
  buildRoadNet,
  /** A parked car (random level-appropriate template) at x, z facing yaw, tagged for instancing; null if none loaded. */
  makeParkedCar: (x, z, yaw) => {
    const parkable = _carTemplates.filter((t) => t.parked && _carFor(t));
    if (!parkable.length) return null;
    const tpl = parkable[Math.floor(Math.random() * parkable.length)];
    const clone = _cloneCarScene(tpl);
    const size = tpl.box.getSize(new THREE.Vector3());
    clone.scale.setScalar(_carTargetLen(tpl) / Math.max(size.x, size.y, size.z));
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    clone.position.set(x, -box.min.y, z);
    clone.rotation.y = yaw;
    clone.matrixAutoUpdate = false; clone.updateMatrix();
    clone.userData.instance = true;
    return clone;
  },
  setCarNet: (net) => { _carNet = net; },
  setPedCfg: (cfg) => { _pedCfg = cfg; },
  TILE: { LOT: LOT_TILE, STREET: STREET_TILE, SIDEWALK: SIDEWALK_TILE },
};
