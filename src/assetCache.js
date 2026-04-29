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

// ---- Bump this when assets change to force a re-download ----
const ASSET_VERSION = '1.2.0';

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
