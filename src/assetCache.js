/**
 * Asset Cache — IndexedDB-backed client-side cache for game assets.
 *
 * On first play, assets are fetched from the network and stored locally.
 * On subsequent plays, assets are served from the cache (zero network).
 * When ASSET_VERSION changes, the entire cache is wiped and re-downloaded.
 *
 * Usage:
 *   import { initAssetCache, cachedFetch, cachedBlobURL, getCacheStats } from './assetCache.js';
 *   await initAssetCache();           // call once at startup
 *   const buf = await cachedFetch('./assets/model.glb');   // ArrayBuffer
 *   const url = await cachedBlobURL('./assets/tex.jpg');   // blob: URL for loaders
 */

import { DataTexture } from 'three';
import { isMobile } from './quality.js';
import { MOBILE_VARIANTS } from './mobileAssets.js';
import { KTX2_VARIANTS } from './ktx2Assets.js';
import { ASSET_HASHES } from './assetManifest.js';

// On mobile, swap in the reduced-texture copies under assets/m/ (512px
// textures, 1024px for the kaiju/mech; see tools/make_mobile_assets.mjs).
// Keeps an iPhone's decoded textures in budget with the full GLB city.
// ?mtex=full forces the originals (testing).
const MOBILE_TEX = isMobile && !/[?&]mtex=full\b/.test(location.search);
// Desktop: GPU-compressed KTX2 copies under assets/ktx2/ (see
// tools/make_ktx2_assets.mjs), enabled by city.enableKTX2() once a
// KTX2Loader is attached to the GLTFLoader. ?ktx2=0 disables (testing).
let _ktx2On = false;
export function setKTX2Enabled(v) { _ktx2On = !!v && !/[?&]ktx2=0\b/.test(location.search); }
export function assetURL(url) {
  const m = url.match(/^(\.\/)?assets\/(.+)$/);
  if (!m) return url;
  if (MOBILE_TEX) return MOBILE_VARIANTS.has(m[2]) ? `${m[1] || ''}assets/m/${m[2]}` : url;
  if (_ktx2On && KTX2_VARIANTS.has(m[2])) return `${m[1] || ''}assets/ktx2/${m[2]}`;
  return url;
}

// ---- Bump this when assets change to force a re-download ----
const ASSET_VERSION = '1.8.0';

const DB_NAME = 'KaijuAssetCache';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const META_STORE = 'meta';

let _db = null;
let _hits = 0;
let _misses = 0;
let _enabled = true;

// ---- IndexedDB helpers ----

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _tx(store, mode = 'readonly') {
  const t = _db.transaction(store, mode);
  return t.objectStore(store);
}

function _idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = _tx(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _idbPut(store, key, value) {
  return new Promise((resolve, reject) => {
    const req = _tx(store, 'readwrite').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function _idbClear(store) {
  return new Promise((resolve, reject) => {
    const req = _tx(store, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---- Public API ----

/**
 * Initialize the asset cache. Must be called once before any cachedFetch calls.
 * If the stored version doesn't match ASSET_VERSION, the cache is wiped.
 * Returns true if cache was warm (existing version matched).
 */
export async function initAssetCache() {
  if (_db) return true; // already initialized
  if (!_enabled) return false;
  try {
    // iOS Safari can leave indexedDB.open / the first transaction pending
    // forever; time out and play from the network instead of hanging the load.
    _db = await _withTimeout(_openDB(), IDB_TIMEOUT_MS, 'IDB open');
    // Entries are versioned per file (see _tagFor), so a changed asset only
    // re-downloads itself. A new ASSET_VERSION no longer wipes everything; it
    // just prunes entries that are stale or no longer in the manifest.
    const storedVersion = await _withTimeout(_idbGet(META_STORE, 'version'), IDB_TIMEOUT_MS, 'IDB get');
    if (storedVersion !== ASSET_VERSION) {
      console.log(`[AssetCache] Version ${storedVersion} → ${ASSET_VERSION}: pruning stale entries`);
      _pruneStale().catch((e) => console.warn('[AssetCache] prune failed:', e.message || e.name));
      await _withTimeout(_idbPut(META_STORE, 'version', ASSET_VERSION), IDB_TIMEOUT_MS, 'IDB put');
      return false;
    }
    console.log(`[AssetCache] Cache warm, version ${ASSET_VERSION}`);
    return true;
  } catch (e) {
    console.warn('[AssetCache] IndexedDB unavailable, caching disabled:', e.message);
    _enabled = false;
    _db = null;
    return false;
  }
}

// ---- Load hardening (mostly for iOS Safari) ----
// - IndexedDB calls time out; a hung/closed DB disables the cache and every
//   later asset comes straight from the network.
// - Network fetches run at most MAX_FETCHES at a time (mobile Safari stalls
//   or drops requests with ~40 GLBs in flight), time out, and retry once.
// - GLB parses (which decode every texture) run at most MAX_PARSES at a time
//   via withParseSlot(), so a phone never holds dozens of decoding images.
const IDB_TIMEOUT_MS = 4000;
const FETCH_TIMEOUT_MS = isMobile ? 45000 : 60000;
const MAX_FETCHES = isMobile ? 6 : 12;
const MAX_PARSES = isMobile ? 2 : 6;
let _writes = true;

function _withTimeout(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out`)), ms); })])
    .finally(() => clearTimeout(t));
}

function _limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const _fetchSlot = _limiter(MAX_FETCHES);
const _parseSlot = _limiter(MAX_PARSES);
/** Run fn (e.g. a GLTFLoader.parse) inside the global parse-concurrency limit. */
export function withParseSlot(fn) { return _parseSlot(fn); }

async function _networkFetch(url) {
  for (let attempt = 0; ; attempt++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : 0;
    try {
      const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
      return await res.arrayBuffer();
    } catch (e) {
      // fetch() rejects with a TypeError on network errors: tag it so
      // reportLoadError() doesn't mistake it for a code bug.
      if (attempt >= 1) { e.loadFailure = true; throw e; }
      console.warn('[AssetCache] retrying', url, e.message);
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      clearTimeout(t);
    }
  }
}

// Per-file cache tag: the content hash from the generated manifest, else
// ASSET_VERSION (files not in the manifest still refresh on a version bump).
function _tagFor(key) { return ASSET_HASHES[key] || `v${ASSET_VERSION}`; }

// Drop entries whose stored tag no longer matches (or old-format raw buffers,
// or files gone from the manifest), so the quota isn't held by dead assets.
async function _pruneStale() {
  const keys = await _withTimeout(new Promise((resolve, reject) => {
    const req = _tx(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }), IDB_TIMEOUT_MS, 'IDB keys');
  let dropped = 0;
  for (const key of keys) {
    const v = await _withTimeout(_idbGet(STORE_NAME, key), IDB_TIMEOUT_MS, 'IDB get');
    if (v && v.tag === _tagFor(key)) continue;
    await _withTimeout(new Promise((resolve, reject) => {
      const req = _tx(STORE_NAME, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }), IDB_TIMEOUT_MS, 'IDB delete');
    dropped++;
  }
  if (dropped) console.log(`[AssetCache] pruned ${dropped} stale entries`);
}

function _disableCache(why) {
  if (!_enabled) return;
  console.warn('[AssetCache] disabling IndexedDB cache:', why);
  _enabled = false;
  _db = null;
}

/**
 * Fetch an asset, returning an ArrayBuffer.
 * Serves from IndexedDB cache if available, otherwise fetches from network and caches.
 */
export async function cachedFetch(url, opts = {}) {
  // opts.original: skip the mobile/KTX2 variant swap (fallback after a failure)
  if (!opts.original) url = assetURL(url);
  // Normalize URL to a stable cache key; the per-file tag (content hash)
  // also busts the browser's HTTP cache when a file changes.
  const key = _normKey(url);
  const tag = _tagFor(key);
  const netURL = `${url}${url.includes('?') ? '&' : '?'}h=${tag}`;
  if (!_enabled || !_db) {
    _misses++;
    return _fetchSlot(() => _networkFetch(netURL));
  }

  // Try cache first: entries are { tag, buf }; a different tag (file changed)
  // or an old-format raw buffer is a miss and gets overwritten below.
  try {
    const cached = await _withTimeout(_idbGet(STORE_NAME, key), IDB_TIMEOUT_MS, 'IDB get');
    if (cached && cached.tag === tag && cached.buf) {
      _hits++;
      return cached.buf;
    }
  } catch (e) {
    // Hung or closed DB (iOS drops IDB connections under memory pressure or
    // when backgrounded): stop using it, fall through to the network.
    _disableCache(e.message || e.name);
  }

  // Network fetch → store → return
  _misses++;
  const buf = await _fetchSlot(() => _networkFetch(netURL));

  // Store in background (don't block the return). On iOS Safari the quota is
  // limited and puts can fail or abort; any failure just stops cache writes.
  if (_writes && _db) {
    try {
      _withTimeout(_idbPut(STORE_NAME, key, { tag, buf }), IDB_TIMEOUT_MS * 2, 'IDB put').catch((e) => {
        console.warn('[AssetCache] Failed to store:', key, e.message || e.name, '- disabling cache writes');
        _writes = false;
      });
    } catch (e) {
      _writes = false; // transaction() threw synchronously (closed DB)
    }
  }

  return buf;
}

/**
 * Fetch an asset and return a blob: URL suitable for Three.js loaders
 * (TextureLoader, AudioLoader, etc.)
 */
export async function cachedBlobURL(url, mimeType) {
  const buf = await cachedFetch(url);
  const blob = new Blob([buf], mimeType ? { type: mimeType } : undefined);
  return URL.createObjectURL(blob);
}

/**
 * Return cache hit/miss stats for display on the loading screen.
 */
export function getCacheStats() {
  return { hits: _hits, misses: _misses, enabled: _enabled, version: ASSET_VERSION };
}

// ---- Load-error reporting ----
// Every loader fallback is recorded in window.__loadErrors as
// { where, url, message, bug }. A ReferenceError / TypeError / SyntaxError
// thrown by our own code in a loader's success path (e.g. a renamed helper)
// used to look exactly like a failed download and silently swap in fallback
// content. Those are flagged bug: true and rethrown on a fresh task so they
// reach the console and window.onerror with their stack, while the loader's
// own promise still settles (boot never waits on it). A corrupt GLB that
// GLTFLoader chokes on can also land here as a SyntaxError; that is worth
// surfacing too. Network failures are tagged loadFailure in _networkFetch.
const _DEBUG_LOADS = /[?&]debug\b/.test(location.search);
const _loadErrors = (window.__loadErrors = window.__loadErrors || []);

export function isCodeBug(err) {
  return !!err && !err.loadFailure &&
    (err instanceof ReferenceError || err instanceof TypeError || err instanceof SyntaxError);
}

/** Record a loader failure / fallback; surface code bugs (see above). */
export function reportLoadError(where, url, err) {
  const bug = isCodeBug(err);
  const message = (err && (err.message || err.name)) || String(err);
  _loadErrors.push({ where, url: url || '', message, bug });
  if (bug) {
    console.error(`[${where}] code bug while loading ${url || ''}:`, err);
    setTimeout(() => { throw err; }, 0);
  } else {
    console.warn(`[${where}] failed to load ${url || ''}:`, message);
  }
  _updateLoadErrorBanner();
}

/** console.warn the first time `key` is seen (errors in per-frame or per-spawn
 *  paths that must not stop the game but shouldn't vanish silently either). */
const _warnedKeys = new Set();
export function warnOnce(key, ...args) {
  if (_warnedKeys.has(key)) return;
  _warnedKeys.add(key);
  console.warn(...args);
}

// Small dismissible banner (fixed, so it shows over the loading screen and
// the title menu): with ?debug always, otherwise only after a code bug.
let _banner = null, _bannerText = null, _bannerDismissed = false;
function _updateLoadErrorBanner() {
  if (_bannerDismissed || typeof document === 'undefined' || !document.body) return;
  if (!_DEBUG_LOADS && !_loadErrors.some((e) => e.bug)) return;
  if (!_banner) {
    _banner = document.createElement('div');
    _banner.id = 'load-error-banner';
    // Bottom-left: index.html's ?debug log (#debug-banner) owns the top edge
    _banner.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:10001;max-width:min(560px,92vw);'
      + 'max-height:40vh;overflow:auto;padding:6px 28px 6px 10px;background:rgba(70,0,10,0.92);'
      + 'color:#ffd6d6;font:12px/1.4 monospace;border:1px solid #ff5566;border-radius:4px;'
      + 'pointer-events:auto;white-space:pre-wrap;';
    _bannerText = document.createElement('div');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Dismiss');
    close.style.cssText = 'position:absolute;top:2px;right:4px;background:none;border:0;color:#ffd6d6;'
      + 'font:14px monospace;cursor:pointer;';
    close.addEventListener('click', () => { _bannerDismissed = true; _banner.remove(); });
    _banner.append(_bannerText, close);
    document.body.appendChild(_banner);
  }
  const bugs = _loadErrors.filter((e) => e.bug).length;
  const lines = _loadErrors.slice(-8).map((e) =>
    `${e.bug ? 'BUG ' : ''}${e.where}: ${e.url.split('/').pop()} ${e.message}`);
  _bannerText.textContent = `ASSET LOAD ERRORS: ${_loadErrors.length}` + (bugs ? ` (${bugs} code bug${bugs > 1 ? 's' : ''})` : '')
    + (lines.length ? '\n' + lines.join('\n') : '');
}
if (_DEBUG_LOADS) {
  if (typeof document !== 'undefined' && document.body) _updateLoadErrorBanner();
  else if (typeof window.addEventListener === 'function') window.addEventListener('DOMContentLoaded', _updateLoadErrorBanner);
}

/**
 * Fix-ups for every parsed GLB scene, applied in the shared load path:
 *  - Meshy exports bake the albedo into the emissive slot (emissiveMap === map,
 *    emissive #ffffff), so the model is self-lit and blooms like a ghost. Drop
 *    that baked emissive; real glow maps (a separate emissiveMap, e.g. neon
 *    signs) are left alone.
 *  - The same exports ship metalness 1 with no metalnessMap, which renders
 *    near-black once the baked emissive is gone (and always without an env
 *    map). Clamp untextured metalness >= 0.9 down to 0.2. Code-built chrome
 *    materials never pass through here.
 *  - Tag geometry as template-owned (userData.template) so a teardown can skip
 *    disposing buffers that every later clone still shares.
 */
// Called with every parsed GLB scene (after the fix-ups below): game.js uploads
// its textures right away (renderer.initTexture), so they reach the GPU while
// loading instead of all at once on the first gameplay frame.
let _glbParsedHook = null;
export function onGLBParsed(fn) { _glbParsedHook = fn; }

// Fewer shader programs: a standard material's program key includes which of
// these maps it has, so every combination was its own program (26 lit ones in
// Chicago, ~150 ms each to link). Each missing one gets a shared 1x1 white
// texture, which multiplies by exactly 1 (colour, emissive, metalness,
// roughness, AO): same pixels, and every material shares the same few
// programs (Chicago 26 -> 13). Normal maps are left alone (a flat one would
// cost per-pixel derivatives). Applied as GLBs parse; game.js applies it to
// the scene before START links it and to later materials on first draw.
const _WHITE_TEX = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
_WHITE_TEX.needsUpdate = true;
const _CANON_SLOTS = ['map', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'aoMap'];
export function canonMaterialMaps(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.canonMaps) return;
  m.userData.canonMaps = true;
  let changed = false;
  for (const k of _CANON_SLOTS) if (!m[k]) { m[k] = _WHITE_TEX; changed = true; }
  if (changed) m.needsUpdate = true;
}

export function normalizeGLTFMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) o.geometry.userData.template = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      if (m.emissiveMap && m.emissiveMap === m.map && m.map !== _WHITE_TEX) {
        m.emissiveMap = null;
        m.emissive.setRGB(0, 0, 0);
        m.needsUpdate = true;
      }
      if (m.metalness >= 0.9 && !m.metalnessMap) m.metalness = 0.2;
      canonMaterialMaps(m);
    }
  });
  if (_glbParsedHook) {
    try { _glbParsedHook(root); } catch (e) { /* uploads on first use instead */ }
  }
  return root;
}

/**
 * Free the per-instance GPU bone texture of every SkinnedMesh under root.
 * SkeletonUtils.clone gives each clone its own Skeleton, and three.js
 * uploads a bone DataTexture per Skeleton on first render; removing the
 * clone from the scene does not free it (the texture leak across runs).
 * Geometry and materials stay: they belong to the shared template.
 */
export function disposeSkeletons(root) {
  root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
}

/**
 * Free the GPU resources a removed, one-off object owns: its bone textures
 * plus every geometry that is neither loader-template geometry
 * (userData.template) nor a module-level shared geometry (userData.shared,
 * see markShared). Materials are left alone on purpose: disposing them
 * releases shader programs that the next spawn would recompile (hitch).
 */
export function disposeInstance(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    const g = o.geometry;
    if (g && !g.userData.template && !g.userData.shared) g.dispose();
  });
}

/** Tag module-level geometries that many spawns reuse so disposeInstance skips them. */
export function markShared(...geoms) {
  for (const g of geoms) g.userData.shared = true;
}

/**
 * Normalize a relative URL to a consistent cache key.
 * Strips leading ./ and query strings.
 */
function _normKey(url) {
  let k = url;
  if (k.startsWith('./')) k = k.slice(2);
  const q = k.indexOf('?');
  if (q !== -1) k = k.substring(0, q);
  return k;
}
