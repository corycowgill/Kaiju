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
// One config only: node tools/smoke_test.mjs --run desktop high   (or: --run iphone med)
//
// No browser or GPU: the DOM, fetch, images and createImageBitmap are stubbed; fetch and
// <img> loads read files from the repo, so a missing or misnamed asset fails like a 404.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIGS = [['desktop', 'high'], ['iphone', 'med']];

const argv = process.argv.slice(2);
if (argv[0] !== '--run') {
  // Parent: one child process per config (quality tier is fixed at module load).
  let failed = 0;
  for (const [device, tier] of CONFIGS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', device, tier], { stdio: 'inherit' });
    if (r.status !== 0) failed++;
  }
  console.log(failed ? `SMOKE TEST FAILED (${failed}/${CONFIGS.length} configs)` : 'SMOKE TEST PASSED');
  process.exit(failed ? 1 : 0);
}

const [, device, tier] = argv;
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
globalThis.location = { search: `?q=${tier}` };
globalThis.innerWidth = iphone ? 390 : 1600;
globalThis.innerHeight = iphone ? 844 : 900;
globalThis.devicePixelRatio = 1;
globalThis.localStorage = globalThis.sessionStorage = { getItem: () => null, setItem: noop };
globalThis.ProgressEvent = class { constructor(t, o) { Object.assign(this, o); } };
globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close: noop });
URL.createObjectURL = () => 'blob:stub';
URL.revokeObjectURL = noop;
const fetched = new Set();
globalThis.fetch = async (u) => {
  const url = typeof u === 'string' ? u : u.url;
  if (/^(blob|data):/.test(url)) return new Response(new Blob([new Uint8Array(4)]));
  const p = repoFile(url);
  if (!fs.existsSync(p)) return new Response(null, { status: 404 });
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
  log(`[${device} ${tier}] FAIL: run did not complete`);
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
if (Q.GLB_CONTENT) await step('tree/ped/car templates', () => Promise.all([city.loadTreeTemplates(), city.loadPedestrianTemplates(), city.loadCarTemplates()]));
const res = await step('buildCity', () => city.buildCity(scene, world, { lite: Q.isMobile, glb: Q.GLB_CONTENT }));
for (const key of ['godzilla', 'ghidorah', 'mecha']) await step(`kaiju ${key}`, () => loadKaijuModel(key));
if (Q.GLB_CONTENT) {
  await step('building/debris/enemy templates', () => Promise.all([city.loadBuildingTemplates(), city.loadDebrisTemplates(), enemies.loadEnemyTemplates()]));
  await step('flushPendingGLBBuildings', () => city.flushPendingGLBBuildings(scene));
}
const spawned = {};
await step('spawn cars/civilians', () => { city.spawnCars(scene, 4, 380, 40); spawned.Civilian = city.spawnCivilians(scene, 4, 350)[0]; });
for (const C of [enemies.Tank, enemies.Helicopter, enemies.Mech, enemies.Jet, enemies.Artillery, enemies.Soldier, enemies.BossMech]) {
  await step(`spawn ${C.name}`, () => { const e = new C(10, 10); scene.add(e.root); e.update(1 / 60, world, new THREE.Vector3()); spawned[C.name] = e; });
}
const trisOf = (root) => { let t = 0; root?.traverse((o) => { if (o.isMesh) { const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return t; };
await new Promise((r) => setTimeout(r, 300)); // flipbooks + ground textures (async image loads) settle

// ---------------------------------------------------------------- assertions
for (const e of globalThis.__loadErrors || []) fail(`__loadErrors: ${e.bug ? 'CODE BUG ' : ''}${e.where} ${e.url}: ${e.message}`);
if (!res || !res.buildings || !res.buildings.length) fail('buildCity returned no buildings');
let summary = '';
if (Q.GLB_CONTENT) {
  const s = city.getTemplateStats();
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

const label = `[${device} ${tier}]`;
finished = true;
if (failures.length) {
  log(`${label} FAIL (${failures.length}), ${fetched.size} files fetched; ${summary}`);
  for (const f of failures) log('  - ' + f.split('\n').slice(0, 4).join('\n    '));
  process.exit(1);
}
log(`${label} ok: ${fetched.size} files fetched, no warnings; ${summary}`);
process.exit(0);
