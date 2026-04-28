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
import { QUALITY_PROFILE, LEGACY_VFX } from './quality.js';

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

// ----- Procedural textures (no asset files needed) -----
//
// Tileable value-noise DataTexture. Used by the beam and chain lightning
// shaders for animated displacement and energy flicker. Generated once at
// module import; all shaders share the same texture instance.
function _makeNoiseTexture(size = 128) {
  const data = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    data[i] = (Math.random() * 255) | 0;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
const NOISE_TEX = _makeNoiseTexture(128);

// Lightweight Effect-like wrapper. Mirrors the contract of the Effect class
// in src/effects.js (life ticks down, update(dt, t01) called each frame,
// final cleanup at t>=1) so the existing world.effects[] tick loop drives
// these without needing a separate scheduler.
class VFXEffect {
  constructor(mesh, life, update) {
    this.mesh = mesh;
    this.life = life;
    this.maxLife = life;
    this.update = update;
    this.dead = false;
  }
  tick(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      if (!this._cleaned) {
        this._cleaned = true;
        try { this.update(0, 1, this); } catch (e) {}
      }
      this.dead = true;
      return;
    }
    const t = 1 - this.life / this.maxLife;
    this.update(dt, t, this);
  }
}

// ----- Shader-based beam (replaces makeBeam from effects.js:322) -----
//
// Single cylinder mesh with a custom ShaderMaterial: scrolling noise core +
// radial fresnel rim + tip taper. Replaces the legacy 3-cylinder stack
// (white core + glow + outer halo). Looks energetic instead of static.
const _BEAM_VS = `
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const _BEAM_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 coreColor;
  uniform vec3 glowColor;
  uniform float time;
  uniform float fade;
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vNormal;
  void main() {
    // Fresnel: rim glow when looking edge-on
    float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.5);
    // Scroll noise along beam length for energy flicker
    vec2 nuv = vec2(vUv.x * 4.0 + time * 0.3, vUv.y * 1.5 - time * 2.5);
    float n = texture2D(noiseTex, nuv).r;
    float n2 = texture2D(noiseTex, nuv * 2.3 + vec2(0.31, 0.71)).r;
    float energy = mix(n, n2, 0.5);
    // Brighten the beam mid-length, taper at the tips
    float taper = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
    vec3 col = mix(glowColor, coreColor, fres + energy * 0.6);
    float a = (fres * 0.85 + 0.35 + energy * 0.25) * taper * fade;
    gl_FragColor = vec4(col, a);
  }
`;

function _spawnBeamShader(opts) {
  const { world, origin, dir, length, color = 0x66ff66, glowColor = 0xaaffaa } = opts;
  const len = length;
  const geom = new THREE.CylinderGeometry(2.0, 1.4, len, 18, 1, true);
  const uniforms = {
    noiseTex:  { value: NOISE_TEX },
    coreColor: { value: new THREE.Color(0xffffff) },
    glowColor: { value: new THREE.Color(glowColor) },
    time:      { value: 0 },
    fade:      { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _BEAM_VS,
    fragmentShader: _BEAM_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(geom, mat);
  // Position so origin is at the start, oriented along dir.
  const mid = origin.clone().addScaledVector(dir, len / 2);
  beam.position.copy(mid);
  const up = new THREE.Vector3(0, 1, 0);
  beam.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  world.scene.add(beam);

  // Origin point light - kept for parity with legacy beam (effects.js:348).
  const light = new THREE.PointLight(color, 4, 30);
  light.position.copy(origin);
  world.scene.add(light);

  return new VFXEffect(beam, 0.6, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    if (t > 0.6) {
      const fade = 1 - (t - 0.6) / 0.4;
      uniforms.fade.value = fade;
      light.intensity = 4 * fade;
    }
    if (t >= 1) {
      world.scene.remove(beam);
      world.scene.remove(light);
      geom.dispose();
      mat.dispose();
    }
  });
}

// ----- Shader-based chain lightning (replaces makeChainLightning, effects.js:377) -----
//
// Keeps the polyline jitter generation (it works well visually) but replaces
// the dual-tube halo with one tube and a shader that does the glow ramp +
// noise flicker, halving the geometry cost.
const _LIGHTNING_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 boltColor;
  uniform float time;
  uniform float fade;
  varying vec2 vUv;
  void main() {
    // vUv.x runs around the tube circumference (0..1), vUv.y along its length
    float radial = abs(vUv.x - 0.5) * 2.0;            // 0 at center, 1 at edge
    float core = 1.0 - smoothstep(0.0, 0.3, radial);  // bright core stripe
    float halo = 1.0 - smoothstep(0.2, 1.0, radial);  // wider colored halo
    // Time-flicker via noise so the bolt visibly crackles instead of fading flat
    vec2 nuv = vec2(vUv.x + time * 0.5, vUv.y * 4.0 - time * 3.0);
    float flick = 0.6 + 0.4 * texture2D(noiseTex, nuv).r;
    vec3 col = mix(boltColor, vec3(1.0), core);
    float a = (halo * 0.55 + core * 1.0) * flick * fade;
    gl_FragColor = vec4(col, a);
  }
`;
const _LIGHTNING_VS = _BEAM_VS; // same passthrough

function _spawnChainLightningShader(opts) {
  const { world, a, b, color = 0xffee66, life = 0.45, segs = 14 } = opts;
  const points = [];
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const upVec = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, upVec).normalize();
  const updir = new THREE.Vector3().crossVectors(right, dir).normalize();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().copy(a).addScaledVector(dir, t);
    if (i > 0 && i < segs) {
      p.addScaledVector(right, (Math.random() - 0.5) * len * 0.08);
      p.addScaledVector(updir, (Math.random() - 0.5) * len * 0.08);
    }
    points.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(points);
  // Single fat tube; the shader produces both the white core and colored halo
  // in one draw via radial UV sampling. Radius set between the legacy core
  // (0.30) and halo (0.95) so the visual silhouette is similar.
  const geom = new THREE.TubeGeometry(curve, segs * 2, 0.95, 8, false);
  const uniforms = {
    noiseTex:  { value: NOISE_TEX },
    boltColor: { value: new THREE.Color(color) },
    time:      { value: 0 },
    fade:      { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _LIGHTNING_VS,
    fragmentShader: _LIGHTNING_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bolt = new THREE.Mesh(geom, mat);
  world.scene.add(bolt);

  return new VFXEffect(bolt, life, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    uniforms.fade.value = 1 - t;
    if (t >= 1) {
      world.scene.remove(bolt);
      geom.dispose();
      mat.dispose();
    }
  });
}

// Wire all legacy effects through the registry as a single bulk call.
// Invoked once from game.js after the imports settle so the registry is
// populated before any spawn() call. Each entry takes the user-facing name
// and the legacy maker function; the builder normalizes the call shape.
export function registerLegacyEffects(legacy) {
  // Pos-style makers (world, pos, ...rest). Capture the rest verbatim so
  // call sites can keep their existing positional argument shape.
  const wrapPosArgs = (fn) => (opts) => {
    const { world, pos, args = [] } = opts;
    return fn(world, pos, ...args);
  };
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
  registerBuilder('wingFlap',           wrapPosArgs(legacy.makeWingFlap));
  registerBuilder('missileLaunchFlash', wrapPosArgs(legacy.makeMissileLaunchFlash));
  // Explicit-shape makers - signatures verified against the actual definitions
  // in src/effects.js (line numbers in comments).
  // For names that have shimmed exports (beam, chainLightning), the legacy
  // registration uses the underscore-prefixed raw reference to avoid
  // recursing back through the shim if a follow-up code path ever asks
  // vfx.spawn() for the legacy fallback explicitly.
  // makeBeam(world, origin, dir, length, color, glowColor) - effects.js:322
  registerBuilder('beam', (opts) => (legacy._makeBeamLegacy || legacy.makeBeam)(
    opts.world, opts.origin, opts.dir, opts.length, opts.color, opts.glowColor));
  // makeChainLightning(world, a, b, color, life, segs) - effects.js:377
  registerBuilder('chainLightning', (opts) => (legacy._makeChainLightningLegacy || legacy.makeChainLightning)(
    opts.world, opts.a, opts.b, opts.color, opts.life, opts.segs));
  // makeMissileSwarm(world, origin, radius, count) - effects.js:423
  registerBuilder('missileSwarm', (opts) => legacy.makeMissileSwarm(
    opts.world, opts.origin, opts.radius, opts.count));
  // makeAfterburnerTrail(world, fromPos, toPos, color) - effects.js:542
  registerBuilder('afterburner', (opts) => legacy.makeAfterburnerTrail(
    opts.world, opts.fromPos, opts.toPos, opts.color));
  // makeBreathCone(world, origin, dir, length, color, life) - effects.js:633
  registerBuilder('breathCone', (opts) => legacy.makeBreathCone(
    opts.world, opts.origin, opts.dir, opts.length, opts.color, opts.life));
  // makeWindStreaks(world, origin, dir, color, count) - effects.js:694
  registerBuilder('windStreaks', (opts) => legacy.makeWindStreaks(
    opts.world, opts.origin, opts.dir, opts.color, opts.count));
}

export function spawn(name, opts) {
  const fn = builders[name];
  if (!fn) {
    if (typeof console !== 'undefined') console.warn('[vfx] unknown effect:', name);
    return null;
  }
  return fn(opts);
}

// Override the legacy passthrough for the names we have shader-based
// upgrades for. Run at module load time; game.js then calls
// registerLegacyEffects() which registers everything else without
// overwriting these (legacy registers first, then... actually legacy is
// called from game.js *after* this runs, so we need to re-apply the
// upgrade overrides after the legacy pass too. Handled by exporting a
// helper that runs both phases in the correct order).
function _registerUpgradedBuilders() {
  if (LEGACY_VFX) return;
  registerBuilder('beam', _spawnBeamShader);
  registerBuilder('chainLightning', _spawnChainLightningShader);
}

// Convenience: register legacy fallbacks first, then upgrade overrides.
// game.js calls this single helper instead of orchestrating order itself.
// With ?vfx=legacy, the upgrade pass is a no-op and every effect routes
// through the original procedural makers in src/effects.js.
export function registerAllBuilders(legacy) {
  registerLegacyEffects(legacy);
  _registerUpgradedBuilders();
}

const vfx = {
  init,
  tick,
  spawn,
  registerBuilder,
  registerLegacyEffects,
  registerAllBuilders,
  loadFlipbook,
  getBatchedRenderer,
};
export default vfx;
