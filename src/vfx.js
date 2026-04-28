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

// ----- Shader-based explosion (replaces makeExplosion from effects.js:71) -----
//
// One sphere mesh with a heat-ramp shader replaces the legacy 3-layer
// concentric sphere stack (white core + yellow mid + orange shell). The
// shader samples scrolling noise twice per pixel and modulates a color
// ramp (white-yellow center -> orange mid -> dark red rim) keyed off
// fresnel so the surface looks volumetric. All the supporting structure
// from the legacy maker (pooled point light, ground shockwave ring, 22
// shrapnel chunks with ballistic+spin physics, drifting smoke sphere) is
// ported verbatim because it was already well-tuned.
const _FIREBALL_VS = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const _FIREBALL_FS = `
  uniform sampler2D noiseTex;
  uniform float time;
  uniform float t01;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    // Two-octave noise scrolled across the spherical UVs gives wispy
    // volumetric structure to what is geometrically just a sphere.
    vec2 nuv = vUv * 3.0 + vec2(time * 0.4, time * -0.25);
    float n1 = texture2D(noiseTex, nuv).r;
    float n2 = texture2D(noiseTex, nuv * 2.5 + vec2(0.31, 0.71)).r;
    float n = mix(n1, n2, 0.5);
    // Fresnel: rim dims, center is "deepest" / hottest. Combine with noise
    // so wisps push through the rim instead of giving a clean ball.
    float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    float heat = 1.0 - clamp(fres + n * 0.5, 0.0, 1.0);
    vec3 c0 = vec3(1.0, 0.95, 0.75);  // white-yellow core
    vec3 c1 = vec3(1.0, 0.55, 0.10);  // orange mid
    vec3 c2 = vec3(0.6, 0.10, 0.05);  // dark red rim
    vec3 col = mix(c2, c1, smoothstep(0.0, 0.6, heat));
    col     = mix(col, c0, smoothstep(0.5, 1.0, heat));
    // Cool the whole ball as it ages.
    col *= mix(1.2, 0.6, t01);
    // Soft alpha edge plus a hot flash burst in the first 10% of life
    // (mirrors the legacy flashMat layer).
    float a = (1.0 - smoothstep(0.7, 1.0, fres)) * (1.0 - t01);
    float flash = 1.0 - smoothstep(0.0, 0.10, t01);
    a += flash * 0.6;
    col += flash * vec3(0.4, 0.4, 0.3);
    gl_FragColor = vec4(col, a);
  }
`;

// Local light pool. Mirrors the one in src/effects.js (lines 13-30); we
// keep them separate so the legacy and shader explosion paths don't
// stomp on each other's lights when LEGACY_VFX toggles mid-game.
const _MAX_LIGHTS = 5;
const _vfxLightPool = [];
let   _vfxLightCursor = 0;
function _acquireLight(scene) {
  if (_vfxLightPool.length < _MAX_LIGHTS) {
    const l = new THREE.PointLight(0xffaa33, 0, 60);
    scene.add(l);
    _vfxLightPool.push(l);
    return l;
  }
  const l = _vfxLightPool[_vfxLightCursor];
  _vfxLightCursor = (_vfxLightCursor + 1) % _vfxLightPool.length;
  return l;
}

// Shared geometries for explosion bits. Reused across spawns so high-rate
// combat doesn't churn through allocations (same pattern as effects.js).
const _G_FIREBALL = new THREE.SphereGeometry(1.0, 24, 18);
const _G_FIRE_LO  = new THREE.SphereGeometry(1.0, 12, 12);  // smoke/flash use lower poly
const _G_RING_E   = new THREE.RingGeometry(0.9, 1.0, 36);
const _G_SHRAPNEL = new THREE.SphereGeometry(0.18, 4, 4);

function _spawnExplosionShader(opts) {
  const { world, pos, args = [] } = opts;
  const scale = args[0] !== undefined ? args[0] : 1.0;

  const group = new THREE.Group();
  group.position.copy(pos);
  world.scene.add(group);

  // Shader fireball - one mesh replacing legacy flash + fire + core layers.
  const ballUniforms = {
    noiseTex: { value: NOISE_TEX },
    time:     { value: 0 },
    t01:      { value: 0 },
  };
  const ballMat = new THREE.ShaderMaterial({
    uniforms: ballUniforms,
    vertexShader: _FIREBALL_VS,
    fragmentShader: _FIREBALL_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ball = new THREE.Mesh(_G_FIREBALL, ballMat);
  group.add(ball);

  // Ground shockwave ring - same as legacy, keeps the gameplay-readable
  // outward blast indicator on the floor.
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd166, transparent: true, opacity: 1.0,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(_G_RING_E, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -pos.y + 0.15;
  group.add(ring);

  // Drifting smoke sphere - lifts off and lingers after the fireball fades.
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x444444, transparent: true, opacity: 0.0, depthWrite: false,
  });
  const smoke = new THREE.Mesh(_G_FIRE_LO, smokeMat);
  group.add(smoke);

  // Pooled point light (intensity-keyed sequencer matches legacy logic).
  const light = _acquireLight(world.scene);
  light.position.copy(pos);
  light.intensity = 7 * scale;
  light.distance = 70;
  const seq = (light._seq = (light._seq || 0) + 1);

  // Shrapnel chunks with ballistic + tumble physics (ported from legacy).
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 1.0 });
  const sparks = [];
  for (let i = 0; i < 22; i++) {
    const useEmber = i < 10;
    const s = new THREE.Mesh(_G_SHRAPNEL, useEmber ? emberMat : sparkMat);
    const speed = (8 + Math.random() * 16) * scale;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = Math.PI * 0.18 + Math.random() * Math.PI * 0.45;
    s.userData.vel = new THREE.Vector3(
      Math.cos(yaw) * Math.cos(pitch) * speed,
      Math.sin(pitch) * speed * 1.4,
      Math.sin(yaw) * Math.cos(pitch) * speed,
    );
    s.userData.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    );
    s.userData.ember = useEmber;
    group.add(s);
    sparks.push(s);
  }

  return new VFXEffect(group, 1.4, (dt, t) => {
    ballUniforms.time.value = (ballUniforms.time.value + dt) % 1000;
    ballUniforms.t01.value = t;
    // Scale the fireball outward (legacy expanded over ~9x; matches well).
    const s = (1 + t * 9) * scale;
    ball.scale.setScalar(s);
    // Ground ring blasts out then thins.
    const ringR = (1 + t * 18) * scale;
    ring.scale.set(ringR, ringR, 1);
    ringMat.opacity = (1 - t) * 0.95;
    // Smoke lifts and grows; fades the second half of life.
    smoke.scale.setScalar((0.6 + t * 4.5) * scale);
    smoke.position.y = -pos.y + 0.1 + t * 6.0 * scale;
    smokeMat.opacity = t < 0.4 ? 0.0 : Math.min(0.7, (t - 0.4) * 1.4) * (1.4 - t);
    // Light fades unless a newer explosion grabbed our slot.
    if (light._seq === seq) light.intensity = (1 - t) * 7 * scale;
    // Shrapnel ballistics + tumble.
    for (const sp of sparks) {
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= 32 * dt;
      sp.rotation.x += sp.userData.spin.x * dt;
      sp.rotation.y += sp.userData.spin.y * dt;
      sp.rotation.z += sp.userData.spin.z * dt;
      if (sp.userData.ember) {
        sp.material.opacity = Math.max(0, 1 - t * 1.6);
      }
    }
    if (t >= 1) {
      if (light._seq === seq) light.intensity = 0;
      world.scene.remove(group);
      ballMat.dispose();
      ringMat.dispose();
      smokeMat.dispose();
      sparkMat.dispose();
      emberMat.dispose();
    }
  });
}

// ----- Shader-based atomic dome (replaces makeAtomicDome from effects.js:495) -----
//
// One hemisphere with an energy-field shader replaces the legacy two
// nested hemispheres (white inner + colored outer). Scrolling noise +
// fresnel rim makes the dome read as a contained energy bubble instead
// of two stacked translucent shells.
const _DOME_VS = _FIREBALL_VS;
const _DOME_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 baseColor;
  uniform float time;
  uniform float t01;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vec2 nuv = vUv * 4.0 + vec2(time * 0.2, time * -0.15);
    float n  = texture2D(noiseTex, nuv).r;
    float n2 = texture2D(noiseTex, nuv * 2.0 + vec2(0.13, 0.91)).r;
    float energy = mix(n, n2, 0.5);
    float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    fres = pow(fres, 2.0);
    vec3 col = baseColor + vec3(1.0) * energy * 0.4;
    col += vec3(1.0) * fres * 1.5;
    float a = (fres * 0.7 + 0.3 + energy * 0.2) * (1.0 - t01) * 0.7;
    gl_FragColor = vec4(col, a);
  }
`;

// Hemisphere geometry: top half of a sphere (matches legacy effects.js:496).
const _G_DOME = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);

function _spawnAtomicDomeShader(opts) {
  const { world, pos, args = [] } = opts;
  const maxRadius = args[0] !== undefined ? args[0] : 130;
  const color = args[1] !== undefined ? args[1] : 0x66ff66;

  const uniforms = {
    noiseTex:  { value: NOISE_TEX },
    baseColor: { value: new THREE.Color(color) },
    time:      { value: 0 },
    t01:       { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _DOME_VS,
    fragmentShader: _DOME_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const dome = new THREE.Mesh(_G_DOME, mat);
  dome.position.copy(pos);
  dome.position.y = 0.3;
  world.scene.add(dome);

  return new VFXEffect(dome, 1.1, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    uniforms.t01.value = t;
    const r = maxRadius * t;
    dome.scale.set(r, r, r);
    if (t >= 1) {
      world.scene.remove(dome);
      mat.dispose();
    }
  });
}

// ----- Shader-based atomic devastation (replaces makeAtomicDevastation, effects.js:827) -----
//
// Gojira's ultimate. Six layered meshes (flash, green fireball, stem,
// stem core, cap, cap core) plus 8 rising wisps and 16 ballistic debris
// chunks span a 3.5s timeline that the player watches end-to-end. The
// legacy version used flat MeshBasicMaterial on every layer so the cloud
// looked like stacked translucent geometry. This version reuses the
// energy-field dome shader on every glowing surface, varying only the
// color uniform per layer, so the stem and cap read as a contained
// nuclear column with a boiling cap rim instead of opaque green shapes.
// All animation curves (rise heights, scale lerps, opacity gates, boil
// rotations) are preserved verbatim from the legacy maker.
function _makeEnergyMaterial(colorHex) {
  const uniforms = {
    noiseTex:  { value: NOISE_TEX },
    baseColor: { value: new THREE.Color(colorHex) },
    time:      { value: 0 },
    t01:       { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _DOME_VS,
    fragmentShader: _DOME_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return { mat, uniforms };
}

// Geometries shared across atomic devastation spawns.
const _G_AD_FLASH    = new THREE.SphereGeometry(1, 24, 16);
const _G_AD_FIREBALL = new THREE.SphereGeometry(1, 20, 14);
const _G_AD_STEM     = new THREE.CylinderGeometry(10, 22, 1, 18, 1, true);
const _G_AD_STEMCORE = new THREE.CylinderGeometry(5, 12, 1, 14, 1, true);
const _G_AD_CAP      = new THREE.SphereGeometry(1, 20, 14);
const _G_AD_CAPCORE  = new THREE.SphereGeometry(1, 16, 12);

function _spawnAtomicDevastationShader(opts) {
  const { world, pos, args = [] } = opts;
  const color = args[0] !== undefined ? args[0] : 0x66ff66;

  // 1. Blinding white flash at ground zero.
  const flashGear = _makeEnergyMaterial(0xffffff);
  const flash = new THREE.Mesh(_G_AD_FLASH, flashGear.mat);
  flash.position.copy(pos); flash.position.y = 8;
  flash.scale.setScalar(10);
  world.scene.add(flash);

  // 2. Toxic-green fireball core.
  const fireGear = _makeEnergyMaterial(color);
  const fireball = new THREE.Mesh(_G_AD_FIREBALL, fireGear.mat);
  fireball.position.copy(pos); fireball.position.y = 10;
  world.scene.add(fireball);

  // 3. Mushroom stem - tapered cylinder rising from ground to cap height.
  const stemGear = _makeEnergyMaterial(color);
  const stem = new THREE.Mesh(_G_AD_STEM, stemGear.mat);
  stem.position.copy(pos); stem.position.y = 0.5;
  world.scene.add(stem);
  // Brighter inner stem core for depth.
  const stemCoreGear = _makeEnergyMaterial(0xeeffcc);
  const stemCore = new THREE.Mesh(_G_AD_STEMCORE, stemCoreGear.mat);
  stemCore.position.copy(pos); stemCore.position.y = 0.5;
  world.scene.add(stemCore);

  // 4. Mushroom cap - squashed sphere balloons outward at the top.
  const capGear = _makeEnergyMaterial(color);
  const cap = new THREE.Mesh(_G_AD_CAP, capGear.mat);
  cap.position.copy(pos); cap.position.y = 60;
  world.scene.add(cap);
  // Inner "boiling" core.
  const capCoreGear = _makeEnergyMaterial(0xddffaa);
  const capCore = new THREE.Mesh(_G_AD_CAPCORE, capCoreGear.mat);
  capCore.position.copy(cap.position);
  world.scene.add(capCore);

  // 5. Radial debris - 16 ballistic chunks. Kept as opaque box meshes
  // because they're meant to read as solid earth being thrown skyward;
  // the dome shader would make them ghostly. Same physics as legacy.
  const debris = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(2 + Math.random() * 2.5, 2 + Math.random() * 2.5, 2 + Math.random() * 2.5),
      new THREE.MeshBasicMaterial({ color: 0x3a4a2a, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    m.position.copy(pos);
    m.position.y = 6 + Math.random() * 4;
    const speed = 50 + Math.random() * 40;
    m.userData.vel = new THREE.Vector3(
      Math.cos(a) * speed,
      28 + Math.random() * 30,
      Math.sin(a) * speed,
    );
    m.userData.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
    );
    world.scene.add(m);
    debris.push(m);
  }

  // 6. Rising wisps along the stem - 8 staggered green puffs.
  const wisps = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 12;
    const gear = _makeEnergyMaterial(color);
    const m = new THREE.Mesh(_G_FIREBALL, gear.mat);
    m.position.set(pos.x + Math.cos(a) * r, 8 + i * 9, pos.z + Math.sin(a) * r);
    m.userData.startY = m.position.y;
    m.userData.delay = i * 0.08;
    m.userData.gear = gear;
    m.scale.setScalar(3 + Math.random() * 2);
    world.scene.add(m);
    wisps.push(m);
  }

  const totalLife = 3.5;
  return new VFXEffect(flash, totalLife, (dt, t) => {
    // Tick all energy-field uniforms together so the cloud breathes in sync.
    const tickEnergy = (gear, opacity, localT) => {
      gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
      // Encode (1 - opacity_factor) into t01 so the shader's (1.0 - t01)
      // alpha multiplier behaves like the legacy opacity pulls.
      gear.uniforms.t01.value = 1.0 - Math.max(0, Math.min(1, opacity));
    };

    // Flash: peaks instantly, fades in 1/6 of the lifetime.
    flash.scale.setScalar(10 + t * 50);
    tickEnergy(flashGear, Math.max(0, 1 - t * 6), t);

    // Fireball: balloons fast for first 25% then collapses upward.
    const fbT = Math.min(1, t * 4);
    fireball.scale.setScalar(8 + fbT * 26);
    fireball.position.y = 10 + Math.min(1, t * 2.5) * 35;
    tickEnergy(fireGear, (1 - Math.pow(t, 0.6)) * 0.9, t);

    // Stem: rises to ~95u then holds + thins out.
    const stemH = THREE.MathUtils.lerp(4, 95, Math.min(1, t * 1.4));
    stem.scale.set(1 + t * 0.4, stemH, 1 + t * 0.4);
    stem.position.y = stemH / 2;
    stemCore.scale.set(1, stemH * 0.95, 1);
    stemCore.position.y = stemH / 2;
    const stemFade = (1 - Math.max(0, t - 0.55) / 0.45);
    tickEnergy(stemGear,     Math.min(0.7, t * 3) * stemFade, t);
    tickEnergy(stemCoreGear, Math.min(0.85, t * 3) * stemFade * 0.9, t);

    // Cap: rises up the stem and balloons outward.
    const capRise = THREE.MathUtils.lerp(35, 115, Math.min(1, t * 1.15));
    cap.position.y = capRise;
    capCore.position.y = capRise;
    const capR = THREE.MathUtils.lerp(10, 60, Math.min(1, Math.pow(t, 0.55)));
    cap.scale.set(capR, capR * 0.65, capR);
    capCore.scale.set(capR * 0.55, capR * 0.5, capR * 0.55);
    const capFade = (1 - Math.max(0, t - 0.6) / 0.4);
    tickEnergy(capGear,     Math.min(0.7, t * 2.5) * capFade, t);
    tickEnergy(capCoreGear, Math.min(0.95, t * 2.5) * capFade, t);
    // Slow boil rotation - the noise scroll already adds animation, but
    // the rotation gives the cap a sense of mass and weight.
    cap.rotation.y     += dt * 0.35;
    capCore.rotation.y -= dt * 0.55;
    capCore.rotation.x = Math.sin(t * 4) * 0.15;

    // Debris ballistics + tumble; fade as they land.
    for (const d of debris) {
      d.position.addScaledVector(d.userData.vel, dt);
      d.userData.vel.y -= 38 * dt;
      d.rotation.x += d.userData.spin.x * dt;
      d.rotation.y += d.userData.spin.y * dt;
      d.rotation.z += d.userData.spin.z * dt;
      if (d.position.y < 0.5) { d.position.y = 0.5; d.userData.vel.set(0, 0, 0); }
      d.material.opacity = Math.max(0, 0.85 - t * 0.9);
    }

    // Wisps: rise up the stem with their delay; fade in then out.
    for (const w of wisps) {
      const local = Math.max(0, t - w.userData.delay / totalLife);
      w.position.y = w.userData.startY + local * 75;
      const fade = Math.min(1, local * 4) * (1 - local) * 0.55;
      tickEnergy(w.userData.gear, fade, local);
      w.scale.setScalar(3 + local * 8);
    }

    if (t >= 1) {
      world.scene.remove(flash); world.scene.remove(fireball);
      world.scene.remove(stem);  world.scene.remove(stemCore);
      world.scene.remove(cap);   world.scene.remove(capCore);
      for (const d of debris) world.scene.remove(d);
      for (const w of wisps)  world.scene.remove(w);
      flashGear.mat.dispose();
      fireGear.mat.dispose();
      stemGear.mat.dispose();
      stemCoreGear.mat.dispose();
      capGear.mat.dispose();
      capCoreGear.mat.dispose();
      for (const w of wisps) w.userData.gear.mat.dispose();
    }
  });
}

// ----- Shader-based shockwave (replaces makeShockwave from effects.js:212) -----
//
// One ring + shader replaces the legacy 2-ring stack (white inner +
// colored outer scaled to 60%). The shader reads vUv.y (0..1 across the
// ring's width) and pushes a soft gaussian band of brightness through it
// with animated noise scroll, so the ring looks like an actual shock
// front instead of a flat colored disc.
const _SHOCK_VS = _FIREBALL_VS;
const _SHOCK_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 baseColor;
  uniform float time;
  uniform float t01;
  varying vec2 vUv;
  void main() {
    // Soft band peaked at the middle of the ring's width.
    float band = 1.0 - abs(vUv.y - 0.5) * 2.0;
    band = pow(max(band, 0.0), 1.5);
    // Scroll noise around the ring (vUv.x runs the circumference).
    float n = texture2D(noiseTex, vec2(vUv.x * 4.0 + time * 0.4, vUv.y)).r;
    // White core where the band peaks, colored elsewhere; noise modulates
    // both intensity and alpha so the front feels turbulent.
    vec3 col = mix(baseColor, vec3(1.0), pow(band, 2.0));
    col += vec3(0.1) * n;
    float a = band * (1.0 - t01) * (0.6 + n * 0.5);
    gl_FragColor = vec4(col, a);
  }
`;
const _G_SHOCK = new THREE.RingGeometry(0.5, 1.0, 48);

function _spawnShockwaveShader(opts) {
  const { world, pos, args = [] } = opts;
  const color = args[0] !== undefined ? args[0] : 0xffcc44;
  const maxRadius = args[1] !== undefined ? args[1] : 60;

  const uniforms = {
    noiseTex:  { value: NOISE_TEX },
    baseColor: { value: new THREE.Color(color) },
    time:      { value: 0 },
    t01:       { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _SHOCK_VS,
    fragmentShader: _SHOCK_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(_G_SHOCK, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(pos);
  ring.position.y += 0.3;
  world.scene.add(ring);

  return new VFXEffect(ring, 0.9, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    uniforms.t01.value = t;
    const r = t * maxRadius + 0.001;
    ring.scale.set(r, r, 1);
    if (t >= 1) {
      world.scene.remove(ring);
      mat.dispose();
    }
  });
}

// ----- Shader-based sound wave rings (replaces makeSoundWaveRings, effects.js:645) -----
//
// Three concentric spheres with a fresnel-rim shader replaces the legacy
// wireframe spheres. The shader makes each sphere read as a glowing
// energy bubble whose surface only shows up at the rim, so the rings
// feel like actual sound waves expanding outward instead of a wireframe
// gizmo. Same staggered-delay spawning so they pulse out one after the
// other from the kaiju roar.
const _SOUND_FS = `
  uniform vec3 baseColor;
  uniform float t01;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    fres = pow(fres, 3.0);
    vec3 col = baseColor * (1.0 + fres * 2.0);
    float a = fres * (1.0 - t01) * 0.7;
    gl_FragColor = vec4(col, a);
  }
`;
const _G_SOUND_SPHERE = new THREE.SphereGeometry(1, 18, 12);

function _spawnSoundRingsShader(opts) {
  const { world, pos, args = [] } = opts;
  const color = args[0] !== undefined ? args[0] : 0xffffff;
  const count = args[1] !== undefined ? args[1] : 3;
  const maxRadius = args[2] !== undefined ? args[2] : 80;
  const life = args[3] !== undefined ? args[3] : 1.4;

  const group = new THREE.Group();
  group.position.copy(pos);
  world.scene.add(group);

  const mats = [];
  const meshes = [];
  for (let i = 0; i < count; i++) {
    const uniforms = {
      baseColor: { value: new THREE.Color(color) },
      t01:       { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: _FIREBALL_VS,
      fragmentShader: _SOUND_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(_G_SOUND_SPHERE, mat);
    m.userData.delay = i * 0.18;
    m.userData.uniforms = uniforms;
    group.add(m);
    mats.push(mat);
    meshes.push(m);
  }

  return new VFXEffect(group, life, (dt, t) => {
    for (const m of meshes) {
      const local01 = Math.max(0, t - m.userData.delay / life);
      const r = 1 + local01 * maxRadius;
      m.scale.setScalar(r);
      m.userData.uniforms.t01.value = local01;
    }
    if (t >= 1) {
      world.scene.remove(group);
      for (const mat of mats) mat.dispose();
    }
  });
}

// ----- Shader-based hit pulse (replaces makeHitPulse from effects.js:286) -----
//
// Single sphere + fresnel rim shader replaces the flat colored sphere.
// Only on screen for 0.22s but fires every time anything takes damage,
// so the visual upgrade is felt across constant gameplay.
function _spawnHitPulseShader(opts) {
  const { world, pos, args = [] } = opts;
  const color = args[0] !== undefined ? args[0] : 0xffffff;

  const uniforms = {
    baseColor: { value: new THREE.Color(color) },
    t01:       { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _FIREBALL_VS,
    fragmentShader: _SOUND_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(_G_SOUND_SPHERE, mat);
  m.position.copy(pos);
  world.scene.add(m);

  return new VFXEffect(m, 0.22, (dt, t) => {
    m.scale.setScalar(1 + t * 6);
    uniforms.t01.value = t;
    if (t >= 1) {
      world.scene.remove(m);
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
  // For names with shim wrappers in effects.js (explosion, atomicDome,
  // beam, chainLightning), use the underscore-prefixed raw reference so
  // the legacy fallback registration doesn't recurse through the shim.
  registerBuilder('explosion',          wrapPosArgs(legacy._makeExplosionLegacy || legacy.makeExplosion));
  registerBuilder('sparks',             wrapPosArgs(legacy.makeSparks));
  registerBuilder('shockwave',          wrapPosArgs(legacy._makeShockwaveLegacy || legacy.makeShockwave));
  registerBuilder('muzzleFlash',        wrapPosArgs(legacy.makeMuzzleFlash));
  registerBuilder('smokePuff',          wrapPosArgs(legacy.makeSmokePuff));
  registerBuilder('smokeColumn',        wrapPosArgs(legacy.makeSmokeColumn));
  registerBuilder('hitPulse',           wrapPosArgs(legacy._makeHitPulseLegacy || legacy.makeHitPulse));
  registerBuilder('atomicDome',         wrapPosArgs(legacy._makeAtomicDomeLegacy || legacy.makeAtomicDome));
  registerBuilder('atomicDevastation',  wrapPosArgs(legacy._makeAtomicDevastationLegacy || legacy.makeAtomicDevastation));
  registerBuilder('soundRings',         wrapPosArgs(legacy._makeSoundWaveRingsLegacy || legacy.makeSoundWaveRings));
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
  registerBuilder('beam',              _spawnBeamShader);
  registerBuilder('chainLightning',    _spawnChainLightningShader);
  registerBuilder('explosion',         _spawnExplosionShader);
  registerBuilder('atomicDome',        _spawnAtomicDomeShader);
  registerBuilder('atomicDevastation', _spawnAtomicDevastationShader);
  registerBuilder('shockwave',         _spawnShockwaveShader);
  registerBuilder('soundRings',        _spawnSoundRingsShader);
  registerBuilder('hitPulse',          _spawnHitPulseShader);
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
