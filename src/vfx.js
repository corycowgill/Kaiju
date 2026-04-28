// VFX manager. Owns the three.quarks BatchedRenderer, the flipbook texture
// cache, and a registry of effect builders that game/enemy code spawns by
// name. This is the foundation for the procedural-to-flipbook migration
// outlined in the graphics upgrade plan.
//
// Phase 1 of the rollout (this file): wire up BatchedRenderer, expose
// init/tick/spawn, and route every name to the legacy effects.js
// implementations as a transparent passthrough. Subsequent PRs replace
// individual builders with three.quarks emitters and shader materials.
//
// Concretely, today vfx.spawn('explosion', ...) calls makeExplosion from
// effects.js. Tomorrow it calls a three.quarks-powered builder living in
// this file. Call sites in game.js / enemies.js never change.

import * as THREE from 'three';
import { BatchedRenderer } from 'three.quarks';
import { QUALITY_PROFILE } from './quality.js';

// Singleton BatchedRenderer attached to the active scene at init time. All
// quark emitters share one renderer to amortize draw calls. Ticked every
// frame from the main game loop with delta-time.
let batched = null;
let initialized = false;

// Legacy passthrough table. As effect-by-effect upgrades land, entries here
// get swapped for three.quarks-backed builders that consume flipbook
// textures from the cache below. Until then, vfx.spawn delegates to the
// matching makeXxx export so the game's behavior is unchanged.
const builders = Object.create(null);

// Flipbook texture cache. Lazily loads a sprite sheet by base name (e.g.
// 'explosion_fireball_8x8') and resolves the per-quality resolution suffix
// (`@512`, `@1k`, `@2k`). Returns a Promise for the THREE.Texture so multiple
// concurrent spawns share one decode.
const _flipbookCache = new Map();
const _loader = new THREE.TextureLoader();

function _resolveFlipbookURL(baseName) {
  const res = QUALITY_PROFILE.flipbookRes;
  const suffix = res >= 2048 ? '@2k' : res >= 1024 ? '@1k' : '@512';
  return `assets/vfx/${baseName}${suffix}.webp`;
}

export function loadFlipbook(baseName) {
  if (_flipbookCache.has(baseName)) return _flipbookCache.get(baseName);
  const url = _resolveFlipbookURL(baseName);
  const promise = new Promise((resolve, reject) => {
    _loader.load(url, (tex) => {
      // three.quarks expects flipY=false on flipbook atlases.
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = QUALITY_PROFILE.anisotropy;
      resolve(tex);
    }, undefined, reject);
  });
  _flipbookCache.set(baseName, promise);
  return promise;
}

export function init(scene) {
  if (initialized) return;
  batched = new BatchedRenderer();
  scene.add(batched);
  initialized = true;
}

export function tick(dt) {
  if (!initialized || !batched) return;
  batched.update(dt);
}

// Register a builder for a named effect. Replaces any existing entry, so
// upgraded builders shadow the legacy passthrough on registration.
export function registerBuilder(name, fn) {
  builders[name] = fn;
}

export function getBatchedRenderer() {
  return batched;
}

// Wire all legacy effects through the registry as a single bulk call.
// Invoked once from game.js after the imports settle so the registry is
// populated before any spawn() call. Each entry takes the user-facing name
// and the legacy maker function; the builder normalizes the call shape.
export function registerLegacyEffects(legacy) {
  // Most makers are (world, pos, ...rest). Capture the rest verbatim.
  const wrapPosArgs = (fn) => (opts) => {
    const { world, pos, args = [] } = opts;
    return fn(world, pos, ...args);
  };
  // makeBeam is (world, from, to, color, life). makeChainLightning is
  // (world, points, color, life). makeMissileSwarm is (world, origin,
  // targets, color). makeAfterburnerTrail is (world, from, to, color).
  // For these we expose explicit wrappers so callers can stay declarative.
  registerBuilder('explosion',          wrapPosArgs(legacy.makeExplosion));
  registerBuilder('sparks',             wrapPosArgs(legacy.makeSparks));
  registerBuilder('shockwave',          wrapPosArgs(legacy.makeShockwave));
  registerBuilder('muzzleFlash',        wrapPosArgs(legacy.makeMuzzleFlash));
  registerBuilder('smokePuff',          wrapPosArgs(legacy.makeSmokePuff));
  registerBuilder('smokeColumn',        wrapPosArgs(legacy.makeSmokeColumn));
  registerBuilder('hitPulse',           wrapPosArgs(legacy.makeHitPulse));
  registerBuilder('atomicDome',         wrapPosArgs(legacy.makeAtomicDome));
  registerBuilder('atomicDevastation',  wrapPosArgs(legacy.makeAtomicDevastation));
  registerBuilder('wingSlash',          wrapPosArgs(legacy.makeWingSlash));
  registerBuilder('tailSweep',          wrapPosArgs(legacy.makeTailSweep));
  registerBuilder('dustBurst',          wrapPosArgs(legacy.makeDustBurst));
  registerBuilder('soundRings',         wrapPosArgs(legacy.makeSoundWaveRings));
  registerBuilder('breathCone',         wrapPosArgs(legacy.makeBreathCone));
  registerBuilder('wingFlap',           wrapPosArgs(legacy.makeWingFlap));
  registerBuilder('windStreaks',        wrapPosArgs(legacy.makeWindStreaks));
  registerBuilder('missileLaunchFlash', wrapPosArgs(legacy.makeMissileLaunchFlash));
  // Explicit shapes
  registerBuilder('beam', (opts) => legacy.makeBeam(opts.world, opts.from, opts.to, opts.color, opts.life));
  registerBuilder('chainLightning', (opts) => legacy.makeChainLightning(opts.world, opts.points, opts.color, opts.life));
  registerBuilder('missileSwarm', (opts) => legacy.makeMissileSwarm(opts.world, opts.origin, opts.targets, opts.color));
  registerBuilder('afterburner', (opts) => legacy.makeAfterburnerTrail(opts.world, opts.from, opts.to, opts.color));
}

export function spawn(name, opts) {
  const fn = builders[name];
  if (!fn) {
    if (typeof console !== 'undefined') console.warn('[vfx] unknown effect:', name);
    return null;
  }
  return fn(opts);
}

const vfx = {
  init,
  tick,
  spawn,
  registerBuilder,
  registerLegacyEffects,
  loadFlipbook,
  getBatchedRenderer,
};
export default vfx;
