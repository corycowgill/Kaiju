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

import { isMobile } from './quality.js';
import { MOBILE_VARIANTS } from './mobileAssets.js';

// On mobile, swap in the reduced-texture copies under assets/m/ (512px
// textures, 1024px for the kaiju/mech; see tools/make_mobile_assets.mjs).
// Keeps an iPhone's decoded textures in budget with the full GLB city.
// ?mtex=full forces the originals (testing).
const MOBILE_TEX = isMobile && !/[?&]mtex=full\b/.test(location.search);
export function assetURL(url) {
  if (!MOBILE_TEX) return url;
  const m = url.match(/^(\.\/)?assets\/(.+)$/);
  return m && MOBILE_VARIANTS.has(m[2]) ? `${m[1] || ''}assets/m/${m[2]}` : url;
}

// ---- Bump this when assets change to force a re-download ----
const ASSET_VERSION = '1.7.4';

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
    const storedVersion = await _withTimeout(_idbGet(META_STORE, 'version'), IDB_TIMEOUT_MS, 'IDB get');
    if (storedVersion !== ASSET_VERSION) {
      console.log(`[AssetCache] Version mismatch (${storedVersion} → ${ASSET_VERSION}), clearing cache`);
      await _withTimeout(_idbClear(STORE_NAME), IDB_TIMEOUT_MS, 'IDB clear');
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
      if (attempt >= 1) throw e;
      console.warn('[AssetCache] retrying', url, e.message);
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      clearTimeout(t);
    }
  }
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
export async function cachedFetch(url) {
  url = assetURL(url);
  if (!_enabled || !_db) {
    _misses++;
    return _fetchSlot(() => _networkFetch(url));
  }

  // Normalize URL to a stable cache key
  const key = _normKey(url);

  // Try cache first
  try {
    const cached = await _withTimeout(_idbGet(STORE_NAME, key), IDB_TIMEOUT_MS, 'IDB get');
    if (cached) {
      _hits++;
      return cached;
    }
  } catch (e) {
    // Hung or closed DB (iOS drops IDB connections under memory pressure or
    // when backgrounded): stop using it, fall through to the network.
    _disableCache(e.message || e.name);
  }

  // Network fetch → store → return
  _misses++;
  const buf = await _fetchSlot(() => _networkFetch(url));

  // Store in background (don't block the return). On iOS Safari the quota is
  // limited and puts can fail or abort; any failure just stops cache writes.
  if (_writes && _db) {
    try {
      _withTimeout(_idbPut(STORE_NAME, key, buf), IDB_TIMEOUT_MS * 2, 'IDB put').catch((e) => {
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
export function normalizeGLTFMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) o.geometry.userData.template = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      if (m.emissiveMap && m.emissiveMap === m.map) {
        m.emissiveMap = null;
        m.emissive.setRGB(0, 0, 0);
        m.needsUpdate = true;
      }
      if (m.metalness >= 0.9 && !m.metalnessMap) m.metalness = 0.2;
    }
  });
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
