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
  try {
    _db = await _openDB();
    const storedVersion = await _idbGet(META_STORE, 'version');
    if (storedVersion !== ASSET_VERSION) {
      console.log(`[AssetCache] Version mismatch (${storedVersion} → ${ASSET_VERSION}), clearing cache`);
      await _idbClear(STORE_NAME);
      await _idbPut(META_STORE, 'version', ASSET_VERSION);
      return false;
    }
    console.log(`[AssetCache] Cache warm, version ${ASSET_VERSION}`);
    return true;
  } catch (e) {
    console.warn('[AssetCache] IndexedDB unavailable, caching disabled:', e.message);
    _enabled = false;
    return false;
  }
}

/**
 * Fetch an asset, returning an ArrayBuffer.
 * Serves from IndexedDB cache if available, otherwise fetches from network and caches.
 */
export async function cachedFetch(url) {
  url = assetURL(url);
  if (!_enabled || !_db) {
    _misses++;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
    return res.arrayBuffer();
  }

  // Normalize URL to a stable cache key
  const key = _normKey(url);

  // Try cache first
  try {
    const cached = await _idbGet(STORE_NAME, key);
    if (cached) {
      _hits++;
      return cached;
    }
  } catch (e) {
    // Cache read failed, fall through to network
  }

  // Network fetch → store → return
  _misses++;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  const buf = await res.arrayBuffer();

  // Store in background (don't block the return).
  // On iOS Safari, IDB quota is ~1GB — large assets may exceed it.
  _idbPut(STORE_NAME, key, buf).catch((e) => {
    console.warn('[AssetCache] Failed to store:', key, e.message);
    // If quota exceeded, disable caching to avoid repeated IDB errors
    if (e.name === 'QuotaExceededError') {
      console.warn('[AssetCache] Storage quota exceeded, disabling cache writes');
      _enabled = false;
    }
  });

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
