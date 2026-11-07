// Headless asset-load smoke test: loads every template the game loads (trees, props, cars,
// pedestrian, buildings + landmarks, debris, enemies, all three kaiju, VFX flipbooks, ground
// textures, LOD1 twins), builds the city and spawns one of each actor, for desktop HIGH and iPhone MED
// (which loads the assets/m/ mobile variants). Exits non-zero on ANY console.warn/error,
// uncaught error, window.__loadErrors entry or missing template. Silent fallbacks (a loader
// catch swapping in procedural content) are exactly what it is meant to catch.
//
// usage (from the repo root):
//   npm install                      # devDependency three@0.160.0 (same version as index.html)
//   node tools/smoke_test.mjs        # or: npm run smoke
// or, without installing into the repo, point it at any node_modules/three r160 checkout:
//   THREE_DIR=/path/to/node_modules/three node tools/smoke_test.mjs
// One config only: node tools/smoke_test.mjs --run desktop high   (or: --run iphone med chicago)
// Each config runs for both levels (Tokyo, Chicago); Chicago also checks its layout:
// buildings and landmarks inside the bounds and off the water, and the scene's draw /
// triangle totals against Tokyo's budget.
//
// No browser or GPU: the DOM, fetch, images and createImageBitmap are stubbed; fetch and
// <img> loads read files from the repo, so a missing or misnamed asset fails like a 404.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// (iphone low chicago: the procedural-only tier, where Chicago still loads its building GLBs)
const CONFIGS = [['desktop', 'high', 'tokyo'], ['iphone', 'med', 'tokyo'], ['desktop', 'high', 'chicago'], ['iphone', 'med', 'chicago'], ['iphone', 'low', 'chicago']];

const argv = process.argv.slice(2);
if (argv[0] !== '--run') {
  // Parent: one child process per config (quality tier is fixed at module load).
  let failed = 0;
  for (const [device, tier, level] of CONFIGS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', device, tier, level], { stdio: 'inherit' });
    if (r.status !== 0) failed++;
  }
  console.log(failed ? `SMOKE TEST FAILED (${failed}/${CONFIGS.length} configs)` : 'SMOKE TEST PASSED');
  process.exit(failed ? 1 : 0);
}

const [, device, tier, level = 'tokyo'] = argv;
const failures = [];
const fail = (msg) => failures.push(msg);

// Resolve 'three' / 'three/addons/*' from THREE_DIR when given (else normal node resolution).
if (process.env.THREE_DIR) {
  const base = pathToFileURL(path.resolve(process.env.THREE_DIR) + '/').href;
  register('data:text/javascript,' + encodeURIComponent(`
    const B = ${JSON.stringify(base)};
    export async function resolve(spec, ctx, next) {
      if (spec === 'three') return { url: B + 'build/three.module.js', shortCircuit: true };
      if (spec.startsWith('three/addons/')) return { url: B + 'examples/jsm/' + spec.slice(13), shortCircuit: true };
      if (spec.startsWith('three/examples/jsm/')) return { url: B + spec.slice(6), shortCircuit: true };
      return next(spec, ctx);
    }`));
}

// ---------------------------------------------------------------- browser stubs
const noop = () => {};
const repoFile = (url) => path.join(REPO, decodeURIComponent(String(url).replace(/^\.\//, '').replace(/[?#].*$/, '')));
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
  : (k === 'getImageData' || k === 'createImageData') ? (x, y, w = 4, h = 4) => ({ data: new Uint8ClampedArray((+w || 4) * (+h || 4) * 4) })
  : (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') ? () => ({ addColorStop: noop })
  : (k in t ? t[k] : noop)), set: () => true });
const makeEl = (tag) => ({
  tagName: String(tag).toUpperCase(), style: {}, width: 4, height: 4, getContext: () => ctx2d,
  addEventListener(type, fn) { this['on' + type] = fn; }, removeEventListener: noop, setAttribute: noop,
  // <img>: load if the file exists in the repo (blob:/data: always), else error like a 404
  set src(v) {
    this._src = v;
    const ok = /^(blob|data):/.test(v) || fs.existsSync(repoFile(v));
    setTimeout(() => (ok ? this.onload?.({ target: this }) : this.onerror?.({ type: 'error', target: this })), 0);
  },
  get src() { return this._src; },
});
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = { createElement: makeEl, createElementNS: (ns, tag) => makeEl(tag) }; // no body: banner stays off
const iphone = device === 'iphone';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  userAgent: iphone ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 Chrome/120',
  maxTouchPoints: iphone ? 5 : 0 } });
globalThis.location = { search: `?q=${tier}&level=${level}&fest=1` };
globalThis.innerWidth = iphone ? 390 : 1600;
globalThis.innerHeight = iphone ? 844 : 900;
globalThis.devicePixelRatio = 1;
globalThis.localStorage = globalThis.sessionStorage = { getItem: () => null, setItem: noop };
globalThis.ProgressEvent = class { constructor(t, o) { Object.assign(this, o); } };
globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close: noop });
URL.createObjectURL = () => 'blob:stub';
URL.revokeObjectURL = noop;
const fetched = new Set();
let fetchedBytes = 0; // GLBs + JSON through fetch (images via <img> not counted)
globalThis.fetch = async (u) => {
  const url = typeof u === 'string' ? u : u.url;
  if (/^(blob|data):/.test(url)) return new Response(new Blob([new Uint8Array(4)]));
  const p = repoFile(url);
  if (!fs.existsSync(p)) return new Response(null, { status: 404 });
  if (!fetched.has(url)) fetchedBytes += fs.statSync(p).size;
  fetched.add(url);
  return new Response(fs.readFileSync(p));
};

// Every warning or error is a failure (loaders report fallbacks through console.warn).
const log = console.log;
console.log = noop; console.info = noop; console.debug = noop;
console.warn = (...a) => fail('console.warn: ' + a.map(String).join(' '));
console.error = (...a) => fail('console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' '));
process.on('uncaughtException', (e) => fail('uncaught: ' + ((e && e.stack) || e)));
process.on('unhandledRejection', (e) => fail('unhandled rejection: ' + ((e && e.stack) || e)));
// If the run dies early (e.g. a module throws during import, which the handler above
// swallows), the event loop drains and node would exit 0 silently: report and fail.
let finished = false;
process.on('exit', () => {
  if (finished) return;
  finished = true;
  log(`[${device} ${tier} ${level}] FAIL: run did not complete`);
  for (const f of failures) log('  - ' + f.split('\n').slice(0, 6).join('\n    '));
  process.exit(1);
});

// ---------------------------------------------------------------- game load flow (mirrors game.js)
const imp = (f) => import(pathToFileURL(path.join(REPO, 'src', f)).href);
const step = async (label, fn) => { try { return await fn(); } catch (e) { fail(`${label} threw: ${(e && e.stack) || e}`); } };
const THREE = await import('three');
const Q = await imp('quality.js');
const city = await imp('city.js');
const enemies = await imp('enemies.js');
const { loadKaijuModel } = await imp('kaijuLoader.js');
const vfx = await imp('vfx.js');
const effects = await imp('effects.js');

const scene = new THREE.Scene();
const world = new Proxy({ scene, enemies: [], effects: [], shells: [], debris: [], time: 0 },
  { get: (t, k) => (k in t ? t[k] : noop) });
await step('vfx.init', () => { vfx.init(scene); vfx.registerAllBuilders(effects); });
await step('level data', () => city.loadLevelData(level));
if (Q.GLB_CONTENT) await step('tree/ped/car templates', () => Promise.all([city.loadTreeTemplates(undefined, level), city.loadPedestrianTemplates(), city.loadCarTemplates(undefined, level)]));
const res = await step('buildCity', () => city.buildCity(scene, world, { lite: Q.isMobile, glb: Q.GLB_CONTENT, level }));
for (const key of ['godzilla', 'ghidorah', 'mecha']) await step(`kaiju ${key}`, () => loadKaijuModel(key));
if (Q.GLB_CONTENT) {
  await step('building/debris/enemy templates', () => Promise.all([city.loadBuildingTemplates(undefined, level), city.loadDebrisTemplates(), enemies.loadEnemyTemplates()]));
  await step('flushPendingGLBBuildings', () => city.flushPendingGLBBuildings(scene));
} else if (level === 'chicago') {
  // Chicago's buildings are GLB on every tier, the procedural-only phone LOW included (as game.js)
  await step('chicago building templates', () => city.loadBuildingTemplates(undefined, level));
  await step('flushPendingGLBBuildings', () => city.flushPendingGLBBuildings(scene));
}
const spawned = {};
let traffic = { cars: [], civs: [] };
await step('spawn cars/civilians', () => {
  traffic = { cars: city.spawnCars(scene, 8, 380, 40), civs: city.spawnCivilians(scene, 8, 350) };
  spawned.Civilian = traffic.civs[0];
  for (const c of traffic.cars) c.update(0.5, world, new THREE.Vector3(1e4, 0, 1e4), 380, 40); // drive (and turn) a little
});
for (const C of [enemies.Tank, enemies.Helicopter, enemies.Mech, enemies.Jet, enemies.Artillery, enemies.Soldier, enemies.BossMech]) {
  await step(`spawn ${C.name}`, () => { const e = new C(10, 10); scene.add(e.root); e.update(1 / 60, world, new THREE.Vector3()); spawned[C.name] = e; });
}
const trisOf = (root) => { let t = 0; root?.traverse((o) => { if (o.isMesh) { const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return t; };
await new Promise((r) => setTimeout(r, 300)); // flipbooks + ground textures (async image loads) settle

// ---------------------------------------------------------------- assertions
for (const e of globalThis.__loadErrors || []) fail(`__loadErrors: ${e.bug ? 'CODE BUG ' : ''}${e.where} ${e.url}: ${e.message}`);
if (!res || !res.buildings || !res.buildings.length) fail('buildCity returned no buildings');
let summary = '';
if (res && res.level !== level) fail(`buildCity built level '${res && res.level}', expected '${level}'`);

// Scene totals, no frustum culling (an upper bound on what the renderer can draw):
// one draw per visible mesh with geometry, triangles x instance count.
const sceneTotals = () => {
  let draws = 0, tris = 0, shadowDraws = 0;
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    const inst = o.isInstancedMesh ? o.count : 1;
    if (!n || !inst) return;
    draws++; tris += (n / 3) * inst;
    if (o.castShadow) shadowDraws++;
  });
  return { draws, tris, shadowDraws };
};
// Run the LOD controllers (onBeforeRender hooks) once from a chase-camera spot over the
// spawn, so each tile pair counts its LOD0 or LOD1 copy like a real frame would
{
  const sp = (res && res.spawn) || { x: 0, z: 0 };
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(sp.x, 40, sp.z + 40); cam.updateMatrixWorld(true);
  const base = THREE.Object3D.prototype.onBeforeRender;
  scene.traverse((o) => { if (o.onBeforeRender !== base) o.onBeforeRender(null, scene, cam); });
}
const totals = sceneTotals();
if (process.env.SMOKE_BREAKDOWN) {
  // Top triangle contributors (debug aid): by geometry name / material
  const by = new Map();
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry; const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    const key = (o.isInstancedMesh ? 'IM ' : '') + (g.name || g.type) + ' / ' + (o.material.name || o.material.type) + ' ' + (o.material.color ? o.material.color.getHexString() : '');
    const e = by.get(key) || { tris: 0, draws: 0 }; e.tris += n / 3 * (o.isInstancedMesh ? o.count : 1); e.draws++; by.set(key, e);
  });
  // SMOKE_BREAKDOWN=draws ranks by draw count instead
  const rank = process.env.SMOKE_BREAKDOWN === 'draws' ? 'draws' : 'tris';
  for (const [k, e] of [...by].sort((a, b) => b[1][rank] - a[1][rank]).slice(0, 25)) log(`${(e.tris / 1e3).toFixed(0)}k tris, ${e.draws} draws: ${k}`);
}
summary += `${res && res.buildings ? res.buildings.length : 0} buildings, scene ${totals.draws} meshes (${totals.shadowDraws} cast), ${(totals.tris / 1e6).toFixed(2)}M tris; `;
// Chicago budget (desktop): Tokyo's own totals with this counter (desktop HIGH ~710 meshes /
// ~5.0M tris) plus ~15%; phones: the MED target of ~450 draws and 4-5M tris (Tokyo MED: ~365 / ~2.3M)
const BUDGET = Q.isMobile ? { draws: 450, tris: 4.5e6 } : { draws: 815, tris: 5.8e6 };
if (level === 'chicago' && res && res.bounds) {
  const B = res.bounds;
  // Footprint centres (edge blocks may overhang the play limit a little)
  const outside = res.buildings.filter((b) => b.x < B.minX || b.x > B.maxX || b.z < B.minZ || b.z > B.maxZ);
  if (outside.length) fail(`chicago: ${outside.length} buildings outside bounds, e.g. (${outside[0].x.toFixed(1)}, ${outside[0].z.toFixed(1)})`);
  const wet = res.buildings.filter((b) => !b.isBridge && b.h > 4 && res.isWater && res.isWater(b.x, b.z));
  if (wet.length) fail(`chicago: ${wet.length} buildings stand on water, e.g. (${wet[0].x.toFixed(1)}, ${wet[0].z.toFixed(1)})`);
  // The kaiju wades in from Lake Michigan: open water, nothing solid (shore,
  // breakwater, festival) within 10u of the spawn
  if (res.isWater) {
    const { x, z } = res.spawn;
    const dry = [];
    for (let dx = -10; dx <= 10; dx += 2.5) for (let dz = -10; dz <= 10; dz += 2.5) if (!res.isWater(x + dx, z + dz)) dry.push([x + dx, z + dz]);
    if (dry.length) fail(`chicago: kaiju spawn (${x}, ${z}) is not in open water (land at ${dry[0].join(', ')})`);
    const near = res.buildings.filter((b) => !b.destroyed && Math.abs(b.x - x) < b.w / 2 + 10 && Math.abs(b.z - z) < b.d / 2 + 10);
    if (near.length) fail(`chicago: ${near.length} buildings within 10u of the kaiju spawn`);
  }
  if (res.spawn.x < B.minX || res.spawn.x > B.maxX || res.spawn.z < B.minZ || res.spawn.z > B.maxZ) fail('chicago: kaiju spawn outside bounds');
  const tooTall = res.buildings.filter((b) => !(b.h > 0 && b.h < 140));
  if (tooTall.length) fail(`chicago: ${tooTall.length} buildings with height outside 0..140u`);
  // No Tokyo dressing: cherry blossom / black pine trees or Japanese street props
  // (Tokyo kit material names exactly; Chicago's own pieces, e.g. traffic_signal_palette, are fine)
  const tokyoOnly = /^(tree_sakura|tree_black_pine|koban|yatai_stall|torii_gate|vending_machine|subway_entrance|street_sign|traffic_signal)$/;
  const leaks = new Set();
  scene.traverse((o) => { if (o.isMesh && tokyoOnly.test(o.material?.name || '')) leaks.add(o.material.name); });
  if (leaks.size) fail(`chicago: Tokyo-only meshes in the scene: ${[...leaks].join(', ')}`);
  // Every Chicago building and landmark is a pipeline GLB once templates load:
  // procedural massing or a box is only a load-failure fallback. Assets still
  // marked pending in chicago.js (not delivered) are listed, not failed.
  {
    const proc = res.buildings.filter((b) => !b.isBridge && !b.glbUrl);
    const pending = proc.filter((b) => b.pendingGLB);
    const bad = proc.filter((b) => !b.pendingGLB);
    if (bad.length) fail(`chicago: ${bad.length} buildings are procedural, not GLB: ${bad.slice(0, 6).map((b) => b.landmarkId || `(${b.x.toFixed(0)},${b.z.toFixed(0)} h${b.h.toFixed(1)})`).join(', ')}`);
    summary += `${res.buildings.length - proc.length} GLB buildings${pending.length ? `, ${pending.length} pending GLB (${[...new Set(pending.map((b) => b.pendingGLB))].join(', ')})` : ''}; `;
  }
  // Kaijupalooza! (on by default): its stages, tents and fence runs are
  // buildings too, so the GLB check above covers them; here just that it's there
  {
    const fest = res.buildings.filter((b) => b.fest);
    if (!fest.length) fail('chicago: Kaijupalooza! festival not built');
    const fp = fest.filter((b) => !b.glbUrl).length;
    summary += `festival ${fest.length} pieces (${fest.filter((b) => b.isFence).length} fence runs${fp ? `, ${fp} pending` : ''}); `;
  }
  const lms = res.buildings.filter((b) => b.landmarkId);
  summary += `${lms.length} landmarks; `;
  if (!lms.length) fail('chicago: no landmarks built');
  for (const [kind, list] of [['car', traffic.cars], ['civilian', traffic.civs]]) {
    for (const a of list) {
      const p = a.root.position;
      if (!(p.y >= 0 && p.y < 2) || p.x < B.minX - 40 || p.x > B.maxX + 40 || p.z < B.minZ - 40 || p.z > B.maxZ + 40) {
        fail(`chicago: ${kind} spawned at (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`);
      } else if (kind === 'civilian' && res.isWater(p.x, p.z)) fail(`chicago: civilian spawned on water at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
  }
  if (BUDGET.draws && totals.draws > BUDGET.draws) fail(`chicago: ${totals.draws} meshes in the scene, budget ${BUDGET.draws}`);
  if (BUDGET.tris && totals.tris > BUDGET.tris) fail(`chicago: ${(totals.tris / 1e6).toFixed(2)}M tris in the scene, budget ${(BUDGET.tris / 1e6).toFixed(2)}M`);
}
if (Q.GLB_CONTENT) {
  const s = city.getTemplateStats(level);
  const count = (name, { loaded, expected }) => { if (loaded !== expected) fail(`${name}: ${loaded}/${expected} templates loaded`); };
  const set = (name, { loaded, expected }) => {
    const missing = expected.filter((x) => !loaded.includes(x));
    if (missing.length) fail(`${name}: missing ${missing.join(', ')}`);
  };
  count('trees', s.trees); count('debris', s.debris); count('cars', s.cars);
  set('buildings', s.buildings); set('props', s.props); set('pedestrian clips', s.pedestrian);
  set('LOD1 twins attached', s.lod1);
  const exact = (name, { loaded, expected }) => { if (loaded.length !== expected.length) fail(`${name}: ${loaded.length} clips (${loaded.join(',')}), expected ${expected.length} (${expected.join(',')})`); };
  exact('pedestrian clips', s.pedestrian);
  const en = enemies.getTemplateStats();
  for (const k of ['tank', 'helicopter', 'artillery', 'jet']) if (!en[k]) fail(`enemy ${k}: template missing (or v1 fallback in use)`);
  if (en.tankAnims !== 3) fail(`enemy tank anims: ${en.tankAnims}/3`);
  set('soldier clips', en.soldier); set('mech clips', en.mech); exact('soldier clips', en.soldier);
  // Decimated crowd models (desktop and the assets/m/ mobile variants): tiny on screen, many of them
  for (const [name, max] of [['Civilian', 4000], ['Soldier', 6000]]) {
    const t = trisOf(spawned[name] && spawned[name].root);
    if (!t) fail(`${name}: no mesh spawned`); else if (t > max) fail(`${name}: ${t} tris, budget ${max} (stale, undecimated model?)`);
  }
  // Spawn scale: a freshly cloned Skeleton has all-zero bone matrices, so measuring a skinned
  // clone before posing it gave ~0 height and scaled soldiers ~100x / mechs ~500x into the
  // sky. Check the posed world-space height against each class's target (+-40%)...
  const skinnedHeight = (actor) => {
    actor.mixer?.update(0);
    actor.root.updateMatrixWorld(true);
    const box = new THREE.Box3(), part = new THREE.Box3();
    actor.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      o.computeBoundingBox(); // posed vertices, mesh-local
      box.union(part.copy(o.boundingBox).applyMatrix4(o.matrixWorld));
    });
    return box.isEmpty() ? 0 : box.max.y - box.min.y;
  };
  const heights = [];
  for (const [name, target] of [['Soldier', 2.0], ['Mech', 9.0], ['BossMech', 16.0], ['Civilian', 2.0]]) {
    const a = spawned[name];
    if (!a) { fail(`${name}: not spawned`); continue; }
    const h = skinnedHeight(a);
    heights.push(`${name} ${h.toFixed(2)}u`);
    if (!(h >= target * 0.6 && h <= target * 1.4)) fail(`${name}: skinned height ${h.toFixed(3)}u, expected ${target}u +-40%`);
  }
  // ...and that no spawned actor's model child is scaled absurdly (GLB units are metres-ish)
  for (const [name, a] of Object.entries(spawned)) {
    for (const c of a.root.children) {
      const sc = Math.max(Math.abs(c.scale.x), Math.abs(c.scale.y), Math.abs(c.scale.z));
      if (!(sc < 20)) fail(`${name}: child '${c.name || c.type}' scale ${sc.toFixed(1)} (>= 20)`);
    }
  }
  summary += `heights ${heights.join(', ')}; `;
  summary += `trees ${s.trees.loaded}/${s.trees.expected}, buildings ${s.buildings.loaded.length}/${s.buildings.expected.length}, `
    + `debris ${s.debris.loaded}/${s.debris.expected}, cars ${s.cars.loaded}/${s.cars.expected}, props ${s.props.loaded.length}/${s.props.expected.length}, `
    + `LOD1 ${s.lod1.loaded.length}/${s.lod1.expected.length}, ped clips ${s.pedestrian.loaded.join('+')} (${trisOf(spawned.Civilian && spawned.Civilian.root)} tris), `
    + `soldier clips ${en.soldier.loaded.join('+')} (${trisOf(spawned.Soldier && spawned.Soldier.root)} tris), mech clips ${en.mech.loaded.length}/${en.mech.expected.length}`;
}

const label = `[${device} ${tier} ${level}]`;
finished = true;
if (failures.length) {
  log(`${label} FAIL (${failures.length}), ${fetched.size} files fetched; ${summary}`);
  for (const f of failures) log('  - ' + f.split('\n').slice(0, 4).join('\n    '));
  process.exit(1);
}
log(`${label} ok: ${fetched.size} files fetched (${(fetchedBytes / 1e6).toFixed(1)} MB), no warnings; ${summary}`);
process.exit(0);
