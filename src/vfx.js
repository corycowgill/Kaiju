// VFX manager. Owns the named effect registry and the (eventual) flipbook
// texture cache. All current effect upgrades are pure THREE.ShaderMaterial
// builders; no external particle library is loaded today.
//
// Originally this module also imported three.quarks BatchedRenderer for
// future GPU particle emitters. That import was removed because (a) no
// quarks emitters are actually used yet, and (b) the unpkg ESM build was
// failing to resolve the bare `three` specifier in some browsers, which
// broke the entire import chain (vfx.js -> effects.js -> game.js) and
// took the whole title screen down with it. When real GPU particles are
// needed, re-add three.quarks via an esm.sh URL or a dynamic import that
// degrades gracefully on failure.

import * as THREE from 'three';
import { powerBuilders } from './powerVfx.js';
import { QUALITY_PROFILE, LEGACY_VFX, Q_HIGH, isMobile } from './quality.js';
import { disposeInstance, markShared, warnOnce, reportLoadError } from './assetCache.js';

let initialized = false;

// Legacy passthrough table. Upgraded shader builders override entries
// here via _registerUpgradedBuilders below; anything not yet upgraded
// falls through to the original makeXxx maker in src/effects.js.
const builders = Object.create(null);

// Flipbook texture cache. Lazily loads a sprite sheet by base name
// (e.g. 'explosion_fireball_8x8') and resolves the per-quality
// resolution suffix (`@512`, `@1k`, `@2k`). Returns a Promise for the
// THREE.Texture so multiple concurrent spawns share one decode. No
// effect uses flipbooks yet, but the cache is wired up for when one
// does.
const _flipbookCache = new Map();
const _loader = new THREE.TextureLoader();

function _resolveFlipbookURL(baseName) {
  // The 'med' profile is shared by desktop and phones; phones below HIGH
  // take the @512 sheets (64 px frames, ~4x less VRAM/bandwidth).
  const res = (isMobile && !Q_HIGH) ? Math.min(512, QUALITY_PROFILE.flipbookRes) : QUALITY_PROFILE.flipbookRes;
  const suffix = res >= 2048 ? '@2k' : res >= 1024 ? '@1k' : '@512';
  return `assets/vfx/${baseName}${suffix}.webp`;
}

export function loadFlipbook(baseName) {
  if (_flipbookCache.has(baseName)) return _flipbookCache.get(baseName);
  const url = _resolveFlipbookURL(baseName);
  const promise = new Promise((resolve, reject) => {
    _loader.load(url, (tex) => {
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

// Flipbook sheets shipped in assets/vfx/ (8x8 grids, RGBA webp, straight
// alpha, element generated on black then animated offline). Resolved
// textures land in _flipTex as they finish loading; spawners check it and
// fall back to the procedural shader path until (or unless) a sheet is
// available, so a missing file never breaks an effect.
const FLIPBOOKS = ['explosion_fireball_8x8', 'smoke_plume_8x8', 'dust_burst_8x8', 'fire_loop_8x8', 'scorch_decal',
  // Grayscale-intensity sheets, tinted per monster with additive blending:
  'energy_burst_8x8', 'impact_glow_decal', 'arc_strip_1x8'];
const _flipTex = Object.create(null);

// init kicks off the flipbook preloads; tick is still a no-op hook.
export function init(_scene) {
  initialized = true;
  while (_vfxLightPool.length < _MAX_LIGHTS) _acquireLight(_scene);
  if (LEGACY_VFX) return;
  for (const name of FLIPBOOKS) {
    loadFlipbook(name).then((tex) => { _flipTex[name] = tex; })
      .catch((e) => reportLoadError('Flipbook', name, e instanceof Error ? e : new Error('image load failed'))); // procedural fallback
  }
}

/** Resolves once every flipbook sheet has loaded (or failed). The shader
 *  prewarm waits on it: a builder staged before its sheet is in takes the
 *  procedural fallback, and the flipbook variant it really plays with would
 *  then be first drawn (and its sheet first uploaded) in play. */
export function flipbooksReady() {
  if (LEGACY_VFX || !initialized) return Promise.resolve();
  return Promise.all(FLIPBOOKS.map((name) => loadFlipbook(name).then((tex) => { _flipTex[name] = tex; }, () => null)));
}

/** Every effect texture loaded so far (flipbook sheets, the noise texture),
 *  for uploading behind the loading screen instead of on first use. */
export function effectTextures() { return [...Object.values(_flipTex), NOISE_TEX]; }

export function tick(_dt) {
  if (!initialized) return;
  _tickScorch();
}

// Register a builder for a named effect. Replaces any existing entry, so
// upgraded builders shadow the legacy passthrough on registration.
export function registerBuilder(name, fn) {
  builders[name] = fn;
}

// Stub kept for forward compatibility. Returns null until a real GPU
// particle renderer is wired up; callers should null-check.
export function getBatchedRenderer() {
  return null;
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
        try { this.update(0, 1, this); } catch (e) {
          // Once per effect type (keyed by the throwing callback's frame)
          const where = ((e && e.stack) || '').split('\n')[1] || '';
          warnOnce('vfx-cleanup|' + where + (e && e.message), '[vfx] final cleanup threw (meshes may leak):', e);
        }
        // Free the per-spawn geometry (module-level _G_* stay; see markShared).
        this.mesh?.removeFromParent();
        disposeInstance(this.mesh);
      }
      this.dead = true;
      return;
    }
    const t = 1 - this.life / this.maxLife;
    this.update(dt, t, this);
  }
}

// ----- Effect material pool -----
//
// An effect's material used to be built per spawn and disposed at the end of
// its life. three re-derives the program cache key of every new material on
// its first draw (getParameters + getProgramCacheKey: ~7% of a destruction
// frame, more in the frame an ult or a row of collapses spawns 100+ effects),
// and a dispose that drops a program's last user deletes the program, so the
// next spawn links it again. Pooled materials keep their program and their own
// uniforms: _matGet(kind, make) hands back a free one of that kind (or builds
// it), _matPut(m) returns it at the end of the effect. A builder sets every
// uniform it reads on acquire; nothing else about the material changes.
const _MAT_POOL_CAP = 96; // free materials kept per kind
const _matFree = new Map();
function _matGet(kind, make) {
  let free = _matFree.get(kind);
  if (!free) _matFree.set(kind, (free = []));
  const m = free.pop() || make();
  // (own properties, not userData: Material.copy() serialises userData)
  m._vfxFree = free;
  m._vfxPooled = false;
  return m;
}
function _matPut(m) {
  if (!m._vfxFree) { m.dispose(); return; }
  if (m._vfxPooled) return; // already returned (a cleanup that ran twice)
  m._vfxPooled = true;
  if (m._vfxFree.length < _MAT_POOL_CAP) m._vfxFree.push(m);
  else m.dispose();
}

// ----- Shared instanced particle pool (sparks, shrapnel, embers) -----
//
// Every spark/shrapnel/ember in the game is an instance of ONE additive
// InstancedMesh, so a stomp that collapses 10 buildings costs 1 draw for
// all its particles instead of 22 meshes per explosion. CPU-side SoA
// arrays; live particles are kept packed in [0, _pCount) (swap-remove).
// Colours are HDR (>1) so bloom carries them; fade = colour -> black,
// which under additive blending is invisible.
const PMUL = QUALITY_PROFILE.particleMul;
const _PCAP = PMUL >= 1 ? 768 : (PMUL >= 0.5 ? 384 : 192);
const _G_PART = new THREE.OctahedronGeometry(1, 0);
const _pMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const _pPos = new Float32Array(_PCAP * 3);
const _pVel = new Float32Array(_PCAP * 3);
const _pCol = new Float32Array(_PCAP * 3);
const _pAge = new Float32Array(_PCAP);
const _pLife = new Float32Array(_PCAP);
const _pSize = new Float32Array(_PCAP);
const _pGrav = new Float32Array(_PCAP);
let _pCount = 0;
let _pIM = null;
const _pTmpCol = new THREE.Color();
function _ensurePool(scene) {
  if (!_pIM) {
    _pIM = new THREE.InstancedMesh(_G_PART, _pMat, _PCAP);
    _pIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _pIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(_PCAP * 3), 3);
    _pIM.instanceColor.setUsage(THREE.DynamicDrawUsage);
    _pIM.frustumCulled = false;
    _pIM.renderOrder = 4;
    _pIM.count = 0;
    _pIM.userData.vfxPool = true;
  }
  if (_pIM.parent !== scene) {
    // New scene / after an in-place restart swept it: drop stale particles.
    _pCount = 0; _pIM.count = 0;
    scene.add(_pIM);
  }
}
// o: { speed:[min,max], up:[min,max] (vertical speed), spread (0..1 of
//      horizontal speed), gravity, life:[min,max], size, color (hex),
//      hdr (colour multiplier) }
export function emitParticles(world, pos, n, o) {
  if (!world || !world.scene || n <= 0) return;
  _ensurePool(world.scene);
  _pTmpCol.set(o.color !== undefined ? o.color : 0xffcc66).multiplyScalar(o.hdr || 2.0);
  const sp = o.speed || [2, 6], up = o.up || [2, 8], life = o.life || [0.5, 0.8];
  for (let k = 0; k < n; k++) {
    if (_pCount >= _PCAP) return; // pool full: drop the rest
    const i = _pCount++;
    const a = Math.random() * Math.PI * 2;
    const v = sp[0] + Math.random() * (sp[1] - sp[0]);
    _pPos[i * 3] = pos.x; _pPos[i * 3 + 1] = pos.y; _pPos[i * 3 + 2] = pos.z;
    _pVel[i * 3] = Math.cos(a) * v;
    _pVel[i * 3 + 1] = up[0] + Math.random() * (up[1] - up[0]);
    _pVel[i * 3 + 2] = Math.sin(a) * v;
    _pCol[i * 3] = _pTmpCol.r; _pCol[i * 3 + 1] = _pTmpCol.g; _pCol[i * 3 + 2] = _pTmpCol.b;
    _pAge[i] = 0;
    _pLife[i] = life[0] + Math.random() * (life[1] - life[0]);
    _pSize[i] = (o.size || 0.15) * (0.75 + Math.random() * 0.5);
    _pGrav[i] = o.gravity !== undefined ? o.gravity : 18;
  }
}
export function tickParticles(dt) {
  if (!_pIM || _pCount === 0) { if (_pIM) _pIM.count = 0; return; }
  const m = _pIM.instanceMatrix.array, c = _pIM.instanceColor.array;
  let i = 0;
  while (i < _pCount) {
    _pAge[i] += dt;
    if (_pAge[i] >= _pLife[i]) {
      // swap-remove with the last live particle
      const j = --_pCount;
      if (i !== j) {
        for (let q = 0; q < 3; q++) {
          _pPos[i * 3 + q] = _pPos[j * 3 + q]; _pVel[i * 3 + q] = _pVel[j * 3 + q]; _pCol[i * 3 + q] = _pCol[j * 3 + q];
        }
        _pAge[i] = _pAge[j]; _pLife[i] = _pLife[j]; _pSize[i] = _pSize[j]; _pGrav[i] = _pGrav[j];
      }
      continue;
    }
    const i3 = i * 3;
    _pVel[i3 + 1] -= _pGrav[i] * dt;
    _pPos[i3] += _pVel[i3] * dt; _pPos[i3 + 1] += _pVel[i3 + 1] * dt; _pPos[i3 + 2] += _pVel[i3 + 2] * dt;
    if (_pPos[i3 + 1] < 0.1 && _pVel[i3 + 1] < 0) { // skid on the street
      _pPos[i3 + 1] = 0.1; _pVel[i3 + 1] *= -0.25; _pVel[i3] *= 0.55; _pVel[i3 + 2] *= 0.55;
    }
    const f = 1 - _pAge[i] / _pLife[i];
    const sc = _pSize[i] * (0.5 + 0.5 * f);
    const o16 = i * 16;
    m[o16] = sc; m[o16 + 1] = 0; m[o16 + 2] = 0; m[o16 + 3] = 0;
    m[o16 + 4] = 0; m[o16 + 5] = sc; m[o16 + 6] = 0; m[o16 + 7] = 0;
    m[o16 + 8] = 0; m[o16 + 9] = 0; m[o16 + 10] = sc; m[o16 + 11] = 0;
    m[o16 + 12] = _pPos[i3]; m[o16 + 13] = _pPos[i3 + 1]; m[o16 + 14] = _pPos[i3 + 2]; m[o16 + 15] = 1;
    c[i3] = _pCol[i3] * f; c[i3 + 1] = _pCol[i3 + 1] * f; c[i3 + 2] = _pCol[i3 + 2] * f;
    i++;
  }
  _pIM.count = _pCount;
  _pIM.instanceMatrix.needsUpdate = true;
  _pIM.instanceColor.needsUpdate = true;
}

// Concurrency limiters (timestamp-based so dropped effects can't leak).
function _slotLimiter(cap) {
  const ends = [];
  return (lifeSec) => {
    const now = performance.now();
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
    if (ends.length >= cap) return false;
    ends.push(now + lifeSec * 1000);
    return true;
  };
}
// Full explosions (ring + secondary bursts + smoke plume + scorch) beyond
// this many in flight spawn "lite": the main fireball sprite only.
const _fullExplosionSlot = _slotLimiter(PMUL >= 1 ? 8 : (PMUL >= 0.5 ? 6 : 4));
// Standalone smoke puffs (damage thresholds, collapse dust plumes).
const _smokePuffSlot = _slotLimiter(PMUL >= 1 ? 24 : (PMUL >= 0.5 ? 14 : 8));

// ----- Flipbook billboards -----
const FLIP_MAX_SIZE = 30;    // world units
const FLIP_MAX_ANG = 0.85;   // max size / view distance
const FLIP_FADE_NEAR = 6;    // fully faded at this camera distance
const FLIP_FADE_FAR = 22;    // fully visible beyond this
// Concurrent large fireballs (main sprite >= 10u). Beyond the cap new
// explosions spawn smaller, without secondary bursts.
// Tracked as expiry timestamps (not a counter) so effects dropped without
// finishing, e.g. by an in-place restart, can't leak slots.
const MAX_BIG_FIREBALLS = 4;
const _bigFireballEnds = [];
function _bigFireballSlot(lifeSec) {
  const now = performance.now();
  for (let i = _bigFireballEnds.length - 1; i >= 0; i--) if (_bigFireballEnds[i] <= now) _bigFireballEnds.splice(i, 1);
  if (_bigFireballEnds.length >= MAX_BIG_FIREBALLS) return false;
  _bigFireballEnds.push(now + lifeSec * 1000);
  return true;
}
//
// Camera-facing quad (billboarded in the vertex shader, so no per-frame
// lookAt) that plays one frame of an 8x8 sheet, cross-fading to the next
// frame for smooth playback at any lifetime. Straight-alpha normal
// blending, so fireballs keep their dark smoke instead of washing out to
// additive white; `glow` pushes only the hottest texels above 1.0 so the
// bloom pass (threshold 0.85) catches flame cores and not the smoke.
// Screen-fill guards (a stomp that collapses 5-6 buildings used to bury
// the whole view in fireballs):
//  - world size capped at FLIP_MAX_SIZE units;
//  - size also capped to FLIP_MAX_ANG x view distance, i.e. one sprite
//    covers at most ~60% of the screen height at fov 70;
//  - sprites fade out between FLIP_FADE_FAR and FLIP_FADE_NEAR units from
//    the camera, so nothing pops through the near plane as a hard card.
const _FLIP_VS = `
  uniform float rot;
  varying vec2 vUv;
  varying float vNearFade;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dist = max(0.001, -mvPosition.z);
    float sc = min(length(modelMatrix[0].xyz), min(${FLIP_MAX_SIZE.toFixed(1)}, dist * ${FLIP_MAX_ANG.toFixed(2)}));
    vNearFade = smoothstep(${FLIP_FADE_NEAR.toFixed(1)}, ${FLIP_FADE_FAR.toFixed(1)}, dist);
    float c = cos(rot), s = sin(rot);
    vec2 p = position.xy * sc;
    mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const _FLIP_FS = `
  uniform sampler2D map;
  varying float vNearFade;
  uniform float frame;
  uniform vec3 tint;
  uniform float opacity;
  uniform float glow;
  uniform float rot;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  vec4 frameTex(float f) {
    float col = mod(f, 8.0);
    float row = floor(f / 8.0);
    // Sheet is loaded with flipY=false: v=0 is the top image row.
    return texture2D(map, vec2((col + vUv.x) / 8.0, (row + 1.0 - vUv.y) / 8.0));
  }
  void main() {
    float f0 = floor(frame);
    vec4 c = mix(frameTex(f0), frameTex(min(f0 + 1.0, 63.0)), frame - f0);
    vec3 col = c.rgb * tint;
    float hot = max(col.r, max(col.g, col.b));
    col *= 1.0 + glow * smoothstep(0.55, 1.0, hot);
    #ifdef USE_FOG
    if (uLook[0].w > 0.5) {
      // Look layer on (look.js): the sheets' smoke was lit for flat daylight.
      // It takes the scene's ambient instead and catches the low sun on the
      // side that faces it; flame texels stay as they are.
      // (only the fire sheets carry glow; smoke and dust sheets are all smoke)
      float smoke = glow > 0.0 ? 1.0 - smoothstep(0.3, 0.75, hot) : 1.0;
      float cr = cos(rot), sr = sin(rot);
      vec2 q = vUv - 0.5;
      q = vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
      float lit = clamp(dot(q, (viewMatrix * vec4(uLook[0].xyz, 0.0)).xy) * 1.8 + 0.45, 0.0, 1.0);
      col = mix(col, col * uLook[19].rgb * 1.5 + uLook[3].rgb * (0.05 + 0.2 * lit * lit), smoke);
    }
    #endif
    // Soft quad border (5%) so a card edge never reads as a hard line.
    vec2 eb = smoothstep(vec2(0.0), vec2(0.05), vUv) * smoothstep(vec2(0.0), vec2(0.05), 1.0 - vUv);
    gl_FragColor = vec4(col, c.a * opacity * vNearFade * eb.x * eb.y);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }
`;
const _G_FLIP = new THREE.PlaneGeometry(1, 1);
const _flipProtos = new Map();
function _flipMaterial(name) {
  let proto = _flipProtos.get(name);
  if (!proto) {
    proto = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: null }, frame: { value: 0 }, rot: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 1 }, glow: { value: 0 },
      }]),
      vertexShader: _FLIP_VS,
      fragmentShader: _FLIP_FS,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    _flipProtos.set(name, proto);
  }
  const m = _matGet(proto, () => proto.clone());
  const u = m.uniforms;
  u.map.value = _flipTex[name];
  u.frame.value = 0; u.opacity.value = 1; u.tint.value.setRGB(1, 1, 1);
  return m;
}

// Returns a billboard Mesh for the named sheet, or null if the sheet
// isn't loaded (caller falls back to the procedural effect).
function _flipSprite(name, size, opts = {}) {
  if (!_flipTex[name]) return null;
  const mat = _flipMaterial(name);
  const u = mat.uniforms;
  u.rot.value = opts.rot !== undefined ? opts.rot : Math.random() * Math.PI * 2;
  if (opts.tint !== undefined) u.tint.value.set(opts.tint);
  u.glow.value = opts.glow || 0;
  const m = new THREE.Mesh(_G_FLIP, mat);
  m.scale.setScalar(size);
  m.frustumCulled = true;
  return m;
}

// Additive variant for the grayscale energy sheets (energy_burst_8x8):
// intensity is tinted by `tint`, the hottest texels go white-hot, and the
// result is pushed into HDR so bloom carries it. No fog: additive light
// should fade to nothing, not to the fog colour.
const _FLIP_ADD_FS = `
  uniform sampler2D map;
  varying float vNearFade;
  uniform float frame;
  uniform vec3 tint;
  uniform float opacity;
  uniform float glow;
  varying vec2 vUv;
  vec4 frameTex(float f) {
    float col = mod(f, 8.0);
    float row = floor(f / 8.0);
    return texture2D(map, vec2((col + vUv.x) / 8.0, (row + 1.0 - vUv.y) / 8.0));
  }
  void main() {
    float f0 = floor(frame);
    float I = mix(frameTex(f0).r, frameTex(min(f0 + 1.0, 63.0)).r, frame - f0);
    if (I < 0.004) discard;
    vec3 col = tint * I * (1.0 + glow) + vec3(smoothstep(0.55, 1.0, I)) * glow;
    gl_FragColor = vec4(col * opacity * vNearFade, 1.0);
  }
`;
function _flipAddMaterial(name) {
  const key = name + '|add';
  let proto = _flipProtos.get(key);
  if (!proto) {
    proto = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null }, frame: { value: 0 }, rot: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 1 }, glow: { value: 0 },
      },
      vertexShader: _FLIP_VS,
      fragmentShader: _FLIP_ADD_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    _flipProtos.set(key, proto);
  }
  const mat = _matGet(proto, () => proto.clone());
  mat.uniforms.map.value = _flipTex[name];
  mat.uniforms.frame.value = 0; mat.uniforms.opacity.value = 1;
  return mat;
}
function _flipSpriteAdd(name, size, tint, glow = 1.2) {
  if (!_flipTex[name]) return null;
  const mat = _flipAddMaterial(name);
  mat.uniforms.rot.value = Math.random() * Math.PI * 2;
  mat.uniforms.tint.value.set(tint);
  mat.uniforms.glow.value = glow;
  const m = new THREE.Mesh(_G_FLIP, mat);
  m.scale.setScalar(size);
  return m;
}

/** One mesh per flipbook material variant (fogged, additive), for linking
 *  their programs before any sheet has loaded: the sheet is a uniform, not
 *  part of the program key. Never disposed by the caller (that would
 *  release the programs again). */
export function flipbookWarmMeshes() {
  return [_flipMaterial('__warm'), _flipAddMaterial('__warm')].map((m) => new THREE.Mesh(_G_FLIP, m));
}

function _disposeFlip(m) {
  if (m.parent) m.parent.remove(m);
  _matPut(m.material);
}

// Persistent ground scorch decals left by explosions. Pooled ring buffer
// so heavy combat can't grow the scene; each fades out over its life.
const _MAX_SCORCH = 28;
const _scorchPool = [];
let _scorchCursor = 0;
const _G_SCORCH = new THREE.PlaneGeometry(1, 1);
_G_SCORCH.rotateX(-Math.PI / 2);
function _placeScorch(world, pos, radius) {
  const tex = _flipTex.scorch_decal;
  if (!tex || pos.y > 4) return;
  let d = _scorchPool[_scorchCursor];
  if (!d) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, roughness: 1.0, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    d = { mesh: new THREE.Mesh(_G_SCORCH, mat), born: 0 };
    d.mesh.renderOrder = -1;
    d.mesh.receiveShadow = true;
    _scorchPool[_scorchCursor] = d;
  }
  _scorchCursor = (_scorchCursor + 1) % _MAX_SCORCH;
  d.mesh.position.set(pos.x, 0.11, pos.z);
  d.mesh.rotation.y = Math.random() * Math.PI * 2;
  d.mesh.scale.setScalar(radius * 2);
  d.mesh.material.opacity = 0.9;
  d.born = world.time || 0;
  d.world = world;
  if (d.mesh.parent !== world.scene) world.scene.add(d.mesh);
}
const _SCORCH_LIFE = 30;
function _tickScorch() {
  for (const d of _scorchPool) {
    if (!d || !d.mesh.parent) continue;
    const age = (d.world.time || 0) - d.born;
    if (age > _SCORCH_LIFE) { d.mesh.parent.remove(d.mesh); continue; }
    d.mesh.material.opacity = 0.9 * Math.min(1, (_SCORCH_LIFE - age) / 8);
  }
}

// ----- Shader-based beam (replaces makeBeam from effects.js:322) -----
//
// Single cylinder mesh with a custom ShaderMaterial: scrolling noise core +
// radial fresnel rim + tip taper. Replaces the legacy 3-cylinder stack
// (white core + glow + outer halo). Looks energetic instead of static.
const _UP = new THREE.Vector3(0, 1, 0);
const _v0 = new THREE.Vector3();
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

const _G_BEAM = new THREE.CylinderGeometry(2.0, 1.4, 1, 18, 1, true);
function _spawnBeamShader(opts) {
  const { world, origin, dir, length, color = 0x66ff66, glowColor = 0xaaffaa } = opts;
  const len = length;
  const mat = _matGet('beam', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:  { value: NOISE_TEX },
      coreColor: { value: new THREE.Color(0xffffff) },
      glowColor: { value: new THREE.Color() },
      time:      { value: 0 },
      fade:      { value: 1 },
    },
    vertexShader: _BEAM_VS,
    fragmentShader: _BEAM_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  const uniforms = mat.uniforms;
  uniforms.glowColor.value.set(glowColor);
  uniforms.time.value = 0; uniforms.fade.value = 1;
  // Unit-height cylinder stretched to the beam's length (same shape, UVs and,
  // through the normal matrix, normals as a cylinder built at that length)
  const beam = new THREE.Mesh(_G_BEAM, mat);
  beam.scale.set(1, len, 1);
  // Position so origin is at the start, oriented along dir.
  const mid = origin.clone().addScaledVector(dir, len / 2);
  beam.position.copy(mid);
  beam.quaternion.setFromUnitVectors(_UP, _v0.copy(dir).normalize());
  world.scene.add(beam);

  // Origin point light - kept for parity with legacy beam (effects.js:348).
  // Taken from the shared pool: adding/removing a PointLight changes the
  // scene's light count, which recompiles every lit material's shader.
  const light = _acquireLight(world.scene);
  light.position.copy(origin);
  light.color.set(color);
  light.intensity = 4;
  light.distance = 30;
  const seq = (light._seq = (light._seq || 0) + 1);

  return new VFXEffect(beam, 0.6, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    if (t > 0.6) {
      const fade = 1 - (t - 0.6) / 0.4;
      uniforms.fade.value = fade;
      if (light._seq === seq) light.intensity = 4 * fade;
    }
    if (t >= 1) {
      world.scene.remove(beam);
      if (light._seq === seq) { light.intensity = 0; light.color.setHex(0xffaa33); }
      _matPut(mat);
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

// Shared PointLight pool for every transient light (explosions, beams, both
// the shader and the legacy effects.js paths). Filled to _MAX_LIGHTS at
// init() so the scene's light count never changes during play: each change
// would recompile every lit material's shader (the first-run hitch). Users
// tag the light with _seq and only touch it while the tag is still theirs.
// Sized per tier (every lit fragment evaluates every point light, even at
// intensity 0): desktop HIGH 5, desktop MED/LOW 3, mobile 2. Constant
// within a tier, so no runtime shader recompiles.
const _MAX_LIGHTS = isMobile ? 2 : (Q_HIGH ? 5 : 3);
const _vfxLightPool = [];
let   _vfxLightCursor = 0;
export function acquirePooledLight(scene) { return _acquireLight(scene); }
// Darken every pooled light and invalidate its owner (used after the
// loading-screen shader prewarm, whose throwaway effects grab lights).
export function resetPooledLights() {
  for (const l of _vfxLightPool) { l.intensity = 0; l.color.setHex(0xffaa33); l._seq = (l._seq || 0) + 1; }
}
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
  const ballMat = _matGet('fireball', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex: { value: NOISE_TEX },
      time:     { value: 0 },
      t01:      { value: 0 },
    },
    vertexShader: _FIREBALL_VS,
    fragmentShader: _FIREBALL_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const ballUniforms = ballMat.uniforms;
  ballUniforms.time.value = 0; ballUniforms.t01.value = 0;
  const ball = new THREE.Mesh(_G_FIREBALL, ballMat);

  // Flipbook path (when the sheets are loaded): one main fireball, two
  // offset secondary bursts and a dark smoke plume that outlives the fire.
  // Times are in seconds. Smoke renders first so the fire sits on top.
  const flips = [];
  const mainFb = _flipSprite('explosion_fireball_8x8', 1, { glow: 1.8 });
  // Lite explosion: too many full ones already in flight (stomp collapses).
  const lite = !!mainFb && !_fullExplosionSlot(2.9);
  if (mainFb) {
    let fbSize = 15 * scale;
    const crowded = lite || (fbSize >= 10 && !_bigFireballSlot(1.3));
    if (crowded) fbSize *= 0.55;
    flips.push({ m: mainFb, delay: 0, dur: 1.3, size: fbSize, y: 2.0 * scale, rise: 2.5 * scale });
    for (let i = 0; i < (crowded ? 0 : 2); i++) {
      const m2 = _flipSprite('explosion_fireball_8x8', 1, { glow: 1.6 });
      m2.position.set((Math.random() - 0.5) * 7 * scale, 0, (Math.random() - 0.5) * 7 * scale);
      flips.push({ m: m2, delay: 0.05 + Math.random() * 0.15, dur: 0.9, size: (7 + Math.random() * 4) * scale,
                   y: (1 + Math.random() * 4) * scale, rise: 2 * scale });
    }
    const sm = lite ? null : _flipSprite('smoke_plume_8x8', 1, { tint: 0x8c8680 });
    if (sm) {
      sm.material.uniforms.opacity.value = crowded ? 0.55 : 0.85;
      flips.push({ m: sm, delay: 0.25, dur: 2.6, size: 17 * scale * (crowded ? 0.6 : 1), y: 4 * scale, rise: 9 * scale, smoke: true });
    }
    for (const f of flips) {
      f.m.visible = false;
      f.m.renderOrder = f.smoke ? 0 : 1;
      group.add(f.m);
    }
    if (scale >= 0.4 && !lite) _placeScorch(world, pos, 4.5 * scale);
  } else {
    group.add(ball);
  }

  // Ground shockwave ring - same as legacy, keeps the gameplay-readable
  // outward blast indicator on the floor.
  const ringMat = _matGet('explosionRing', () => new THREE.MeshBasicMaterial({
    color: 0xffd166, transparent: true, opacity: 1.0,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  ringMat.opacity = 1.0;
  const ring = new THREE.Mesh(_G_RING_E, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -pos.y + 0.15;
  if (!lite) group.add(ring);

  // Drifting smoke sphere - lifts off and lingers after the fireball fades.
  const smokeMat = _matGet('explosionSmoke', () => new THREE.MeshBasicMaterial({
    color: 0x444444, transparent: true, opacity: 0.0, depthWrite: false,
  }));
  smokeMat.opacity = 0.0;
  const smoke = new THREE.Mesh(_G_FIRE_LO, smokeMat);
  // The flipbook path has its own smoke plume; an opacity-0 sphere still
  // costs a draw, so only the fallback path adds it.
  if (!flips.length) group.add(smoke);

  // Pooled point light (intensity-keyed sequencer matches legacy logic).
  const light = _acquireLight(world.scene);
  light.position.copy(pos);
  light.color.setHex(0xffaa33); // beam impacts tint pooled lights
  light.intensity = 7 * scale;
  light.distance = 70;
  const seq = (light._seq = (light._seq || 0) + 1);

  // Shrapnel: 10 embers + 12 hot sparks (x particleMul) thrown out
  // ballistically through the shared instanced particle pool.
  {
    const nE = Math.max(2, Math.round(10 * PMUL * (lite ? 0.4 : 1)));
    const nS = Math.max(2, Math.round(12 * PMUL * (lite ? 0.4 : 1)));
    const spd = [8 * scale, 20 * scale], upv = [6 * scale, 26 * scale];
    emitParticles(world, pos, nE, { speed: spd, up: upv, gravity: 32, life: [0.5, 0.9], size: 0.26, color: 0xff5522, hdr: 2.2 });
    emitParticles(world, pos, nS, { speed: spd, up: upv, gravity: 32, life: [0.9, 1.4], size: 0.2, color: 0xffeeaa, hdr: 1.8 });
  }

  const totalLife = flips.length ? 2.9 : 1.4;
  return new VFXEffect(group, totalLife, (dt, tTotal) => {
    // Legacy layers keep their 1.4 s timeline; flipbooks run in seconds.
    const T = tTotal * totalLife;
    const t = Math.min(1, T / 1.4);
    for (const f of flips) {
      const p = (T - f.delay) / f.dur;
      f.m.visible = p >= 0 && p < 1;
      if (!f.m.visible) continue;
      f.m.material.uniforms.frame.value = p * 63;
      f.m.scale.setScalar(f.size * (0.9 + 0.2 * p));
      f.m.position.y = f.y + f.rise * p;
    }
    ballUniforms.time.value = (ballUniforms.time.value + dt) % 1000;
    ballUniforms.t01.value = t;
    // Scale the fireball outward (legacy expanded over ~9x; matches well).
    const s = (1 + t * 9) * scale;
    ball.scale.setScalar(s);
    // Ground ring blasts out then thins.
    const ringR = (1 + t * 18) * scale;
    ring.scale.set(ringR, ringR, 1);
    ringMat.opacity = (1 - t) * (flips.length ? 0.45 : 0.95);
    // Smoke lifts and grows; fades the second half of life. (The flipbook
    // path has its own smoke plume, so the sphere stays hidden.)
    smoke.scale.setScalar((0.6 + t * 4.5) * scale);
    smoke.position.y = -pos.y + 0.1 + t * 6.0 * scale;
    smokeMat.opacity = flips.length ? 0 : (t < 0.4 ? 0.0 : Math.min(0.7, (t - 0.4) * 1.4) * (1.4 - t));
    // Light fades unless a newer explosion grabbed our slot.
    if (light._seq === seq) light.intensity = (1 - t) * 7 * scale;
    if (tTotal >= 1) {
      if (light._seq === seq) light.intensity = 0;
      world.scene.remove(group);
      for (const f of flips) _matPut(f.m.material);
      _matPut(ballMat);
      _matPut(ringMat);
      _matPut(smokeMat);
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
    // abs(): these shells are double-sided and the camera is often inside
    // one (the ultimate's dome); with max() every back face had fres = 1,
    // a full-white additive layer across the whole frame
    float fres = clamp(1.0 - abs(dot(vNormal, vViewDir)), 0.0, 1.0);
    fres = fres * fres;
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

  const { mat, uniforms } = _makeEnergyMaterial(color);
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
      _matPut(mat);
    }
  });
}

// ----- Shader-based smoke (replaces makeSmokePuff/makeSmokeColumn, effects.js:332/250) -----
//
// Billowy smoke shader: soft fresnel edge so the puff fades into the sky
// at its rim instead of having a hard sphere silhouette, plus animated
// two-octave noise that adds internal cloud structure. Uses normal
// blending (not additive) because smoke should occlude what's behind it,
// not add light. The same shader feeds both the standalone smoke puff
// and the periodic emitter inside makeSmokeColumn.
const _SMOKE_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 smokeColor;
  uniform float time;
  uniform float fade;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    // Two-octave scrolled noise for cloud-like surface variation.
    vec2 nuv = vUv * 2.0 + vec2(time * 0.05, time * -0.04);
    float n  = texture2D(noiseTex, nuv).r;
    float n2 = texture2D(noiseTex, nuv * 2.5 + vec2(0.31, 0.71)).r;
    float density = mix(n, n2, 0.5);
    // Fresnel-based core: smoke is densest in the middle, fades at rim.
    float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    float core = 1.0 - pow(fres, 1.5);
    vec3 col = smokeColor * (0.7 + density * 0.4);
    float a = core * (0.6 + density * 0.3) * fade;
    gl_FragColor = vec4(col, a);
  }
`;

// One prototype ShaderMaterial per smoke color. Each emit clones from the
// prototype instead of constructing a fresh ShaderMaterial -- skips the
// constructor overhead and lets the WebGL program cache reuse the compiled
// shader, while each clone still gets its own uniforms so `time` and `fade`
// can vary per puff. Disposing a clone leaves the prototype intact.
function _makeSmokeMaterial(colorHex) {
  const mat = _matGet('smoke', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:   { value: NOISE_TEX },
      smokeColor: { value: new THREE.Color() },
      time:       { value: 0 },
      fade:       { value: 1.0 },
    },
    vertexShader: _FIREBALL_VS,
    fragmentShader: _SMOKE_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  mat.uniforms.smokeColor.value.set(colorHex);
  mat.uniforms.time.value = Math.random() * 100; // de-sync sibling puffs
  mat.uniforms.fade.value = 1.0;
  return { mat, uniforms: mat.uniforms };
}

const _G_SMOKE_PUFF_S = new THREE.SphereGeometry(1, 12, 10);

function _spawnSmokePuffShader(opts) {
  const { world, pos, args = [] } = opts;
  const scale = args[0] !== undefined ? args[0] : 1.0;

  // Concurrency cap: a collapse spawns 8 dust puffs; 10 collapses were 80
  // sprites. Over the cap the puff is skipped (no-op effect).
  if (_flipTex.smoke_plume_8x8 && !_smokePuffSlot(2.5)) {
    return new VFXEffect(new THREE.Object3D(), 1e-3, () => {});
  }
  const fb = _flipSprite('smoke_plume_8x8', 1, { tint: 0xa8a4a0 });
  if (fb) {
    fb.position.copy(pos);
    world.scene.add(fb);
    const u = fb.material.uniforms;
    return new VFXEffect(fb, 2.5, (dt, t) => {
      fb.position.y += dt * 1.6;
      fb.scale.setScalar(scale * (4 + t * 5));
      u.frame.value = t * 63;
      u.opacity.value = 0.8;
      if (t >= 1) _disposeFlip(fb);
    });
  }

  const gear = _makeSmokeMaterial(0x444444);
  const m = new THREE.Mesh(_G_SMOKE_PUFF_S, gear.mat);
  m.scale.setScalar(scale);
  m.position.copy(pos);
  world.scene.add(m);

  return new VFXEffect(m, 2.5, (dt, t) => {
    gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
    m.position.y += dt * 1.6;
    m.scale.setScalar(scale * (1 + t * 3));
    gear.uniforms.fade.value = 0.6 * (1 - t);
    if (t >= 1) {
      world.scene.remove(m);
      _matPut(gear.mat);
    }
  });
}

// Smoke column emitter: periodically spawns shader smoke puffs so
// destroyed buildings keep visibly burning for 8s. Each emitted puff is
// itself a VFXEffect pushed onto world.effects[] so the existing tick
// loop drives its lifetime.
// Concurrent burning columns (each = 2-3 looping fire sprites + a stream
// of smoke puffs). When a new one starts over the cap, the oldest is told
// to burn out (fires fade, emission stops) over ~1 s.
const _SMOKE_COL_CAP = PMUL >= 1 ? 5 : (PMUL >= 0.5 ? 3 : 2);
const _activeColumns = [];
function _spawnSmokeColumnShader(opts) {
  const { world, pos, args = [] } = opts;
  const height = args[0] !== undefined ? args[0] : 30;
  const ctl = { kill: -1 }; // kill >= 0: seconds left of the burn-out
  for (let i = _activeColumns.length - 1; i >= 0; i--) if (_activeColumns[i].done) _activeColumns.splice(i, 1);
  const live = _activeColumns.filter((c) => c.kill < 0);
  if (live.length >= _SMOKE_COL_CAP) live[0].kill = 1.0;
  _activeColumns.push(ctl);
  const baseY = pos.y;
  const proxy = new THREE.Object3D();
  proxy.position.copy(pos);
  world.scene.add(proxy);
  const totalLife = 8.0;
  let nextEmit = 0;

  // Flipbook path: looping fire at the base of the column that dies down
  // over the first ~70% of the column's life.
  const fires = [];
  if (_flipTex.fire_loop_8x8) {
    const n = PMUL < 0.5 ? 1 : (height > 20 ? 3 : 2);
    for (let i = 0; i < n; i++) {
      const sz = (height > 20 ? 11 : 8) * (0.75 + Math.random() * 0.4);
      const f = _flipSprite('fire_loop_8x8', sz, { rot: 0, glow: 1.4 });
      f.position.set(pos.x + (Math.random() - 0.5) * 6, baseY + sz * 0.47, pos.z + (Math.random() - 0.5) * 6);
      f.renderOrder = 2;
      f.userData.phase = Math.random() * 64;
      f.userData.sz = sz;
      world.scene.add(f);
      fires.push(f);
    }
  }

  const eff = new VFXEffect(proxy, totalLife, (dt, t) => {
    // Burn-out requested by the column cap: fade fires, stop emitting,
    // then end the effect.
    let killK = 1;
    if (ctl.kill >= 0) {
      ctl.kill -= dt;
      killK = Math.max(0, ctl.kill);
      if (ctl.kill <= 0 && t < 1) { eff.life = 0; }
    }
    if (t >= 1) ctl.done = true;
    for (const f of fires) {
      const u = f.material.uniforms;
      f.userData.phase = (f.userData.phase + dt * 30) % 64; // 30 fps loop
      // Frame 63 -> 0 wrap is seamless in the sheet; avoid cross-fading
      // the last frame into an out-of-range index.
      u.frame.value = Math.min(f.userData.phase, 62.999);
      const k = 1 - Math.min(1, t / 0.7);
      u.opacity.value = Math.min(1, k * 1.6) * killK;
      f.scale.setScalar(f.userData.sz * (0.55 + 0.45 * k));
      if (t >= 1) _disposeFlip(f);
    }
    nextEmit -= dt;
    if (ctl.kill >= 0) nextEmit = Infinity;
    if (nextEmit <= 0 && t < 1 && _flipTex.smoke_plume_8x8) {
      // Puff rate scales with the tier (HIGH ~1.5/s, MED ~1/s, LOW ~0.75/s).
      nextEmit = (0.5 + Math.random() * 0.35) / Math.max(0.4, Math.sqrt(PMUL));
      const intensity = (1 - t);
      const m = _flipSprite('smoke_plume_8x8', 1, { tint: t < 0.4 ? 0x7a746e : 0xb4aea8 });
      const sz = (height > 20 ? 9 : 6) * (0.8 + Math.random() * 0.5);
      m.position.set(
        pos.x + (Math.random() - 0.5) * 4,
        baseY + 3 + (1 - intensity) * height * 0.3,
        pos.z + (Math.random() - 0.5) * 4,
      );
      m.renderOrder = 1;
      world.scene.add(m);
      const vy = 2.4 + Math.random() * 1.6;
      const vx = (Math.random() - 0.5) * 1.5 + 0.8; // slight shared wind drift
      const vz = (Math.random() - 0.5) * 1.5;
      const u = m.material.uniforms;
      world.effects.push(new VFXEffect(m, 5.0, (dt2, t2) => {
        m.position.x += vx * dt2;
        m.position.y += vy * dt2;
        m.position.z += vz * dt2;
        m.scale.setScalar(sz * (1 + t2 * 2.2));
        u.frame.value = t2 * 63;
        u.opacity.value = 0.85 * (0.4 + 0.6 * intensity);
        if (t2 >= 1) _disposeFlip(m);
      }));
    } else if (nextEmit <= 0 && t < 1) {
      nextEmit = 0.6 + Math.random() * 0.4;
      const intensity = (1 - t);
      // Color shifts darker at the start (fresh burn) to lighter as the
      // column ages (ash + dispersal); same as legacy.
      const colorHex = t < 0.4 ? 0x333333 : 0x666666;
      const gear = _makeSmokeMaterial(colorHex);
      const m = new THREE.Mesh(_G_SMOKE_PUFF_S, gear.mat);
      const sz = 0.85 + Math.random() * 0.55;
      m.scale.setScalar(sz * 1.4); // 1.4 to match legacy G_SMOKE_PUFF radius
      m.position.set(
        pos.x + (Math.random() - 0.5) * 4,
        baseY + 1 + (1 - intensity) * height * 0.4,
        pos.z + (Math.random() - 0.5) * 4,
      );
      world.scene.add(m);
      const vy = 1.6 + Math.random() * 1.2;
      const vx = (Math.random() - 0.5) * 1.5;
      const vz = (Math.random() - 0.5) * 1.5;
      const baseScale = sz * 1.4;
      world.effects.push(new VFXEffect(m, 4.5, (dt2, t2) => {
        gear.uniforms.time.value = (gear.uniforms.time.value + dt2) % 1000;
        m.position.x += vx * dt2;
        m.position.y += vy * dt2;
        m.position.z += vz * dt2;
        m.scale.setScalar(baseScale * (1 + t2 * 3));
        gear.uniforms.fade.value = 0.55 * intensity * (1 - t2);
        if (t2 >= 1) {
          world.scene.remove(m);
          _matPut(gear.mat);
        }
      }));
    }
    if (t >= 1) world.scene.remove(proxy);
  });
  return eff;
}

// ----- Shader-based sparks (replaces makeSparks from effects.js:186) -----
//
// Sparks are emitted into the shared instanced particle pool (see
// emitParticles): HDR additive points with gravity that skid on the
// street. _SPARK_FS below is still used by other builders.
const _SPARK_FS = `
  uniform vec3 sparkColor;
  uniform float fade;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    float intensity = pow(1.0 - fres, 2.0);
    vec3 col = sparkColor * intensity;
    gl_FragColor = vec4(col, intensity * fade);
  }
`;
const _G_SPARK_S = new THREE.SphereGeometry(0.12, 6, 5);

function _spawnSparksShader(opts) {
  const { world, pos, args = [] } = opts;
  const count = args[0] !== undefined ? args[0] : 8;
  // Through the shared particle pool (was one sphere mesh per spark).
  emitParticles(world, pos, Math.max(1, Math.round(count * PMUL)), {
    speed: [1, 7], up: [2, 8], gravity: 18, life: [0.45, 0.7], size: 0.16, color: 0xffcc66, hdr: 2.4,
  });
  // Callers push the return value onto world.effects; hand back a no-op
  // effect (no scene object, finishes on its first tick).
  return new VFXEffect(new THREE.Object3D(), 1e-3, () => {});
}

// ----- Shader-based ring/arc (wingSlash, tailSweep, wingFlap) -----
//
// All three effects are flat ring or arc geometry that flashes through.
// One shared shader: a radial gradient peaked at the ring's mid-width
// (so the ring reads as a bright centerline edge with soft falloff)
// plus an animated noise scroll around the circumference. The legacy
// versions of wingSlash and wingFlap each used two ring meshes for the
// inner highlight; the shader produces the highlight via vUv.y math
// from a single mesh.
const _RING_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 baseColor;
  uniform float time;
  uniform float fade;
  varying vec2 vUv;
  void main() {
    float band = 1.0 - abs(vUv.y - 0.5) * 2.0;
    band = pow(max(band, 0.0), 1.5);
    float n = texture2D(noiseTex, vec2(vUv.x * 3.0 + time * 0.5, vUv.y)).r;
    vec3 col = mix(baseColor, vec3(1.0), pow(band, 2.0));
    col += vec3(0.1) * n;
    float a = band * fade * (0.7 + n * 0.3);
    gl_FragColor = vec4(col, a);
  }
`;

function _makeRingMaterial(colorHex) {
  const mat = _matGet('ring', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:  { value: NOISE_TEX },
      baseColor: { value: new THREE.Color() },
      time:      { value: 0 },
      fade:      { value: 1.0 },
    },
    vertexShader: _FIREBALL_VS,
    fragmentShader: _RING_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
  const uniforms = mat.uniforms;
  uniforms.baseColor.value.set(colorHex);
  uniforms.time.value = 0; uniforms.fade.value = 1.0;
  return { mat, uniforms };
}
// The arcs' shapes never vary: one geometry each (was one per spawn)
const _G_WING_SLASH = new THREE.RingGeometry(6, 16, 24, 1, -Math.PI * 0.6, Math.PI * 1.2);
const _G_TAIL_SWEEP = new THREE.RingGeometry(4, 18, 24, 1, -Math.PI * 0.4, Math.PI * 0.8);
const _G_WING_FLAP  = new THREE.RingGeometry(2, 10, 14, 1, -Math.PI / 4, Math.PI / 1.6);
// Unit-height shapes scaled to a per-spawn length
const _G_BREATH_CONE = new THREE.ConeGeometry(0.3, 1, 14, 1, true);
const _G_AFTERBURN   = new THREE.CylinderGeometry(2.2, 0.4, 1, 12, 1, true);
const _G_STREAK      = new THREE.CylinderGeometry(0.08, 0.04, 1, 5);
const _G_AD_CHUNK    = new THREE.BoxGeometry(1, 1, 1);

function _spawnWingSlashShader(opts) {
  const { world, pos, args = [] } = opts;
  const yawRad = args[0];
  const color = args[1] !== undefined ? args[1] : 0xff66ff;

  const gear = _makeRingMaterial(color);
  const arc = new THREE.Mesh(_G_WING_SLASH, gear.mat);
  arc.rotation.x = -Math.PI / 2;
  arc.rotation.z = -yawRad;
  arc.position.copy(pos); arc.position.y = 1.2;
  world.scene.add(arc);

  return new VFXEffect(arc, 0.45, (dt, t) => {
    gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
    gear.uniforms.fade.value = 1 - t;
    const s = 1 + t * 0.6;
    arc.scale.set(s, s, 1);
    if (t >= 1) {
      world.scene.remove(arc);
      _matPut(gear.mat);
    }
  });
}

function _spawnTailSweepShader(opts) {
  const { world, pos, args = [] } = opts;
  const yawRad = args[0];
  const color = args[1] !== undefined ? args[1] : 0xffee44;

  const gear = _makeRingMaterial(color);
  const arc = new THREE.Mesh(_G_TAIL_SWEEP, gear.mat);
  arc.rotation.x = -Math.PI / 2;
  arc.rotation.z = -yawRad - Math.PI / 6;
  arc.position.copy(pos); arc.position.y = 0.6;
  world.scene.add(arc);

  return new VFXEffect(arc, 0.4, (dt, t) => {
    gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
    gear.uniforms.fade.value = 1 - t;
    arc.scale.set(1 + t * 0.4, 1 + t * 0.4, 1);
    if (t >= 1) {
      world.scene.remove(arc);
      _matPut(gear.mat);
    }
  });
}

function _spawnWingFlapShader(opts) {
  const { world, pos, args = [] } = opts;
  const side = args[0];
  const color = args[1] !== undefined ? args[1] : 0xff66ff;

  const gear = _makeRingMaterial(color);
  const wing = new THREE.Mesh(_G_WING_FLAP, gear.mat);
  wing.rotation.x = -Math.PI / 2;
  wing.rotation.z = side * Math.PI / 2.2;
  wing.position.copy(pos);
  wing.position.y += 6;
  world.scene.add(wing);

  return new VFXEffect(wing, 0.55, (dt, t) => {
    gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
    gear.uniforms.fade.value = 1 - t;
    const s = 1 + t * 0.7;
    wing.scale.set(s, s, 1);
    if (t >= 1) {
      world.scene.remove(wing);
      _matPut(gear.mat);
    }
  });
}

// ----- Shader-based breath cone (replaces makeBreathCone, effects.js:723) -----
//
// Cone geometry + shader: dense at the base (apex), fades at the tip.
// Animated noise along the cone's length adds a wispy "exhale" feel.
const _CONE_FS = `
  uniform sampler2D noiseTex;
  uniform vec3 baseColor;
  uniform float time;
  uniform float fade;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    // vUv.y goes from 0 (apex) to 1 (base) on a cone in three.js
    float density = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
    float n = texture2D(noiseTex, vec2(vUv.x * 2.0, vUv.y * 3.0 - time * 0.6)).r;
    float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    vec3 col = baseColor * (0.7 + n * 0.6);
    float a = density * fade * (fres * 0.5 + 0.4 + n * 0.3);
    gl_FragColor = vec4(col, a);
  }
`;

function _spawnBreathConeShader(opts) {
  const { world, origin, dir, length = 28, color = 0xffaa66, life = 0.7 } = opts;
  const mat = _matGet('cone', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:  { value: NOISE_TEX },
      baseColor: { value: new THREE.Color() },
      time:      { value: 0 },
      fade:      { value: 1.0 },
    },
    vertexShader: _FIREBALL_VS,
    fragmentShader: _CONE_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
  const uniforms = mat.uniforms;
  uniforms.baseColor.value.set(color);
  uniforms.time.value = 0; uniforms.fade.value = 1.0;
  const cone = new THREE.Mesh(_G_BREATH_CONE, mat);
  cone.scale.set(1, length, 1);
  cone.quaternion.setFromUnitVectors(_UP, _v0.copy(dir).normalize());
  cone.position.copy(origin).addScaledVector(dir, length / 2);
  world.scene.add(cone);

  return new VFXEffect(cone, life, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    uniforms.fade.value = Math.min(1, t * 4) * (1 - t) * 0.6;
    const widen = 1 + t * 8;
    cone.scale.set(widen, length, widen);
    if (t >= 1) {
      world.scene.remove(cone);
      _matPut(mat);
    }
  });
}

// ----- Shader-based afterburner trail (replaces makeAfterburnerTrail, effects.js:624) -----
//
// One cylinder + ring shader replaces the legacy 2-cylinder stack.
function _spawnAfterburnerShader(opts) {
  const { world, fromPos, toPos, color = 0x66aaff } = opts;
  const dir = new THREE.Vector3().subVectors(toPos, fromPos);
  const len = dir.length();
  if (len < 0.01) return null;
  const mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
  const gear = _makeRingMaterial(color);
  const cone = new THREE.Mesh(_G_AFTERBURN, gear.mat);
  cone.scale.set(1, len, 1);
  cone.position.copy(mid); cone.position.y += 4;
  cone.quaternion.setFromUnitVectors(_UP, _v0.copy(dir).normalize());
  world.scene.add(cone);

  return new VFXEffect(cone, 0.55, (dt, t) => {
    gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
    gear.uniforms.fade.value = (1 - t) * 0.85;
    if (t >= 1) {
      world.scene.remove(cone);
      _matPut(gear.mat);
    }
  });
}

// ----- Shader-based wind streaks (replaces makeWindStreaks, effects.js:784) -----
//
// 10 cylinders fanning forward; replaces flat MeshBasicMaterial with the
// hot-point spark shader so each streak reads as a glowing dash of speed.
function _spawnWindStreaksShader(opts) {
  const { world, origin, dir, color = 0xffffff, count = 10 } = opts;
  const group = new THREE.Group();
  world.scene.add(group);

  const mat = _matGet('streak', () => new THREE.ShaderMaterial({
    uniforms: {
      sparkColor: { value: new THREE.Color() },
      fade:       { value: 1.0 },
    },
    vertexShader: _FIREBALL_VS,
    fragmentShader: _SPARK_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const uniforms = mat.uniforms;
  uniforms.sparkColor.value.set(color);
  uniforms.fade.value = 1.0;

  const streaks = [];
  for (let i = 0; i < count; i++) {
    const yawJit = (Math.random() - 0.5) * 0.55;
    const pitchJit = (Math.random() - 0.5) * 0.25;
    const yaw = Math.atan2(dir.x, dir.z) + yawJit;
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) + pitchJit;
    const dirOut = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const streak = new THREE.Mesh(_G_STREAK, mat);
    streak.scale.set(1, 4 + Math.random() * 3, 1);
    streak.quaternion.setFromUnitVectors(_UP, dirOut);
    streak.position.copy(origin).addScaledVector(dirOut, 6 + Math.random() * 8);
    streak.userData.vel = dirOut.clone().multiplyScalar(40 + Math.random() * 25);
    group.add(streak);
    streaks.push(streak);
  }

  return new VFXEffect(group, 0.55, (dt, t) => {
    uniforms.fade.value = 1 - t;
    for (const s of streaks) s.position.addScaledVector(s.userData.vel, dt);
    if (t >= 1) {
      world.scene.remove(group);
      _matPut(mat);
    }
  });
}

// ----- Shader-based dust burst (replaces makeDustBurst, effects.js:656) -----
//
// 8 dust puffs ejected radially with gravity. Reuses the smoke shader
// with a tan/brown color so the puffs look like kicked-up dirt instead
// of solid colored balls.
const _G_DUST_PUFF = new THREE.SphereGeometry(1, 10, 8);

function _spawnDustBurstShader(opts) {
  const { world, pos, args = [] } = opts;
  const radius = args[0] !== undefined ? args[0] : 14;
  const count = args[1] !== undefined ? args[1] : 8;

  if (_flipTex.dust_burst_8x8) {
    const n = Math.max(3, Math.round(Math.min(10, count) * Math.max(0.5, PMUL)));
    const fl = [];
    const proxy = new THREE.Object3D();
    world.scene.add(proxy);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = radius * (0.35 + Math.random() * 0.35);
      const m = _flipSprite('dust_burst_8x8', 1, { tint: 0xf2eadf });
      m.position.set(pos.x + Math.cos(a) * r, 2.0, pos.z + Math.sin(a) * r);
      m.userData.vel = new THREE.Vector3(Math.cos(a) * radius * 0.6, 1.5 + Math.random(), Math.sin(a) * radius * 0.6);
      m.userData.sz = radius * (0.55 + Math.random() * 0.3);
      m.userData.f0 = Math.random() * 6;
      world.scene.add(m);
      fl.push(m);
    }
    return new VFXEffect(proxy, 1.8, (dt, t) => {
      for (const m of fl) {
        m.position.addScaledVector(m.userData.vel, dt);
        m.userData.vel.multiplyScalar(Math.max(0, 1 - 2.2 * dt)); // drag
        m.scale.setScalar(m.userData.sz * (0.7 + t * 0.9));
        m.material.uniforms.frame.value = Math.min(63, m.userData.f0 + t * 63);
        m.material.uniforms.opacity.value = 0.9;
        if (t >= 1) _disposeFlip(m);
      }
      if (t >= 1) world.scene.remove(proxy);
    });
  }

  const puffs = [];
  const gears = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const r = radius * (0.6 + Math.random() * 0.4);
    const gear = _makeSmokeMaterial(0xa68864);
    const m = new THREE.Mesh(_G_DUST_PUFF, gear.mat);
    m.scale.setScalar(2 + Math.random() * 1.5);
    m.position.set(pos.x + Math.cos(a) * r, 0.4, pos.z + Math.sin(a) * r);
    m.userData.outVel = new THREE.Vector3(Math.cos(a) * 6, 1.2 + Math.random() * 1.0, Math.sin(a) * 6);
    world.scene.add(m);
    puffs.push(m);
    gears.push(gear);
  }

  return new VFXEffect(puffs[0], 1.1, (dt, t) => {
    for (let i = 0; i < puffs.length; i++) {
      const m = puffs[i];
      const gear = gears[i];
      gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
      m.position.addScaledVector(m.userData.outVel, dt);
      m.userData.outVel.y -= 4 * dt;
      m.scale.setScalar(2 + t * 4);
      gear.uniforms.fade.value = 0.65 * (1 - t);
    }
    if (t >= 1) {
      for (let i = 0; i < puffs.length; i++) {
        world.scene.remove(puffs[i]);
        _matPut(gears[i].mat);
      }
    }
  });
}

// ----- Shader-based muzzle flash (replaces makeMuzzleFlash, effects.js:332) -----
//
// Single sphere + energy-field shader. Brief 0.12s burst.
function _spawnMuzzleFlashShader(opts) {
  const { world, pos, args = [] } = opts;
  const scale = args[0] !== undefined ? args[0] : 0.5;

  const gear = _makeEnergyMaterial(0xffee88);
  const m = new THREE.Mesh(_G_AD_FLASH, gear.mat);
  m.scale.setScalar(scale);
  m.position.copy(pos);
  world.scene.add(m);
  const baseScale = scale;

  return new VFXEffect(m, 0.12, (dt, t) => {
    gear.uniforms.time.value = (gear.uniforms.time.value + dt) % 1000;
    gear.uniforms.t01.value = t;
    m.scale.setScalar(baseScale * (1 + t * 2));
    if (t >= 1) {
      world.scene.remove(m);
      _matPut(gear.mat);
    }
  });
}

// ----- Shader-based missile launch flash (replaces makeMissileLaunchFlash, effects.js:821) -----
//
// Energy flash + smoke combo at the launch point.
function _spawnMissileLaunchFlashShader(opts) {
  const { world, pos } = opts;
  const flashGear = _makeEnergyMaterial(0xffeebb);
  const flash = new THREE.Mesh(_G_AD_FLASH, flashGear.mat);
  flash.position.copy(pos);
  flash.scale.setScalar(0.6);
  world.scene.add(flash);
  const smokeGear = _makeSmokeMaterial(0x444444);
  const smoke = new THREE.Mesh(_G_AD_FLASH, smokeGear.mat);
  smoke.position.copy(pos);
  smoke.scale.setScalar(0.4);
  world.scene.add(smoke);

  return new VFXEffect(flash, 0.5, (dt, t) => {
    flashGear.uniforms.time.value = (flashGear.uniforms.time.value + dt) % 1000;
    flashGear.uniforms.t01.value = t;
    flash.scale.setScalar(0.6 + t * 3.5);
    smokeGear.uniforms.time.value = (smokeGear.uniforms.time.value + dt) % 1000;
    smoke.scale.setScalar(0.4 + t * 3.6);
    smoke.position.y += 4 * dt;
    smokeGear.uniforms.fade.value = 0.7 * (1 - t);
    if (t >= 1) {
      world.scene.remove(flash);
      world.scene.remove(smoke);
      _matPut(flashGear.mat);
      _matPut(smokeGear.mat);
    }
  });
}

// ----- Shader-based missile swarm (replaces makeMissileSwarm, effects.js:497) -----
//
// 8 ballistic missiles. The bodies stay solid metallic (they're meant to
// look like physical objects), but trails get the smoke/fire shader so
// the swarm has a real fire-trail look instead of stretched orange spheres.
const _G_MISSILE = new THREE.CylinderGeometry(0.18, 0.06, 1.0, 8);
const _M_MISSILE_BODY = new THREE.MeshStandardMaterial({
  color: 0x666666, metalness: 0.7, roughness: 0.4,
  emissive: 0xff5522, emissiveIntensity: 0.6,
});

function _spawnMissileSwarmShader(opts) {
  const { world, origin, radius = 60, count = 8 } = opts;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = radius * (0.5 + Math.random() * 0.5);
    const target = new THREE.Vector3(origin.x + Math.cos(ang) * r, 0.5, origin.z + Math.sin(ang) * r);
    const T = 0.7 + Math.random() * 0.3;
    const g = 22;
    const vy = (target.y - origin.y) / T + 0.5 * g * T;
    const vx = (target.x - origin.x) / T;
    const vz = (target.z - origin.z) / T;
    const m = new THREE.Mesh(_G_MISSILE, _M_MISSILE_BODY);
    m.position.copy(origin);
    world.scene.add(m);
    // Fire trail: smoke shader with hot orange tint, additive feel
    // approximated by warm color; falls back to NormalBlending which
    // matches legacy trail occlusion.
    const trailGear = _makeSmokeMaterial(0xff8844);
    const trail = new THREE.Mesh(_G_AD_FLASH, trailGear.mat);
    trail.scale.setScalar(0.5);
    trail.position.copy(origin);
    world.scene.add(trail);
    const vel = new THREE.Vector3(vx, vy, vz);
    let timeLeft = T + 0.05;
    let landed = false;
    world.effects.push(new VFXEffect(m, T + 0.1, (dt, t) => {
      if (landed) return;
      timeLeft -= dt;
      vel.y -= g * dt;
      m.position.addScaledVector(vel, dt);
      m.quaternion.setFromUnitVectors(_UP, _v0.copy(vel).normalize());
      trailGear.uniforms.time.value = (trailGear.uniforms.time.value + dt) % 1000;
      trail.position.lerp(m.position, 0.7);
      trailGear.uniforms.fade.value = 0.9 * (1 - t * 0.6);
      trail.scale.setScalar(0.5 + t * 1.2);
      // (t >= 1: dropped before landing, e.g. by the effect cap. Clean up, no blast.)
      if (timeLeft <= 0 || m.position.y <= 0.4 || t >= 1) {
        // Once: this used to run again every frame until the effect's life
        // ran out (~0.05 s), one more explosion each time (3 per missile at
        // 60 fps, more at higher frame rates)
        landed = true;
        world.scene.remove(m);
        world.scene.remove(trail);
        _matPut(trailGear.mat);
        if (t < 1) world.spawnExplosion?.(m.position.clone().setY(0.5), 0.7);
      }
    }));
  }
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
  const mat = _matGet('energy', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:  { value: NOISE_TEX },
      baseColor: { value: new THREE.Color() },
      time:      { value: 0 },
      t01:       { value: 0 },
    },
    vertexShader: _DOME_VS,
    fragmentShader: _DOME_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  const uniforms = mat.uniforms;
  uniforms.baseColor.value.set(colorHex);
  uniforms.time.value = 0; uniforms.t01.value = 0;
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
  // (one unit box scaled per chunk and one material for all 16: they always
  // carried the same colour and opacity)
  const debris = [];
  const chunkMat = _matGet('adChunk', () => new THREE.MeshBasicMaterial({ color: 0x3a4a2a, transparent: true, opacity: 0.85, depthWrite: false }));
  chunkMat.opacity = 0.85;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const m = new THREE.Mesh(_G_AD_CHUNK, chunkMat);
    m.scale.set(2 + Math.random() * 2.5, 2 + Math.random() * 2.5, 2 + Math.random() * 2.5);
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
    }
    chunkMat.opacity = Math.max(0, 0.85 - t * 0.9);

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
      _matPut(chunkMat);
      _matPut(flashGear.mat);
      _matPut(fireGear.mat);
      _matPut(stemGear.mat);
      _matPut(stemCoreGear.mat);
      _matPut(capGear.mat);
      _matPut(capCoreGear.mat);
      for (const w of wisps) _matPut(w.userData.gear.mat);
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

  const mat = _matGet('shock', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:  { value: NOISE_TEX },
      baseColor: { value: new THREE.Color() },
      time:      { value: 0 },
      t01:       { value: 0 },
    },
    vertexShader: _SHOCK_VS,
    fragmentShader: _SHOCK_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }));
  const uniforms = mat.uniforms;
  uniforms.baseColor.value.set(color);
  uniforms.time.value = 0; uniforms.t01.value = 0;
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
      _matPut(mat);
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
function _makeSoundMaterial(color) {
  const mat = _matGet('sound', () => new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color() },
      t01:       { value: 0 },
    },
    vertexShader: _FIREBALL_VS,
    fragmentShader: _SOUND_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  mat.uniforms.baseColor.value.set(color);
  mat.uniforms.t01.value = 0;
  return mat;
}

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
    const mat = _makeSoundMaterial(color);
    const uniforms = mat.uniforms;
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
      for (const mat of mats) _matPut(mat);
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

  const mat = _makeSoundMaterial(color);
  const uniforms = mat.uniforms;
  const m = new THREE.Mesh(_G_SOUND_SPHERE, mat);
  m.position.copy(pos);
  world.scene.add(m);

  return new VFXEffect(m, 0.22, (dt, t) => {
    m.scale.setScalar(1 + t * 6);
    uniforms.t01.value = t;
    if (t >= 1) {
      world.scene.remove(m);
      _matPut(mat);
    }
  });
}

// ----- Beam impact -----
//
// Where a beam lands: two tinted energy-burst flipbooks, a spray of
// sparks, a coloured light flash and, on the ground, a glowing molten
// impact decal that cools off over ~2.5 s and leaves a scorch mark.
// opts: { world, pos, color }. Falls back to a hit pulse if the energy
// sheet isn't loaded.
const _G_IMPACT = new THREE.PlaneGeometry(1, 1);
// Every module-level _G_* is shared across spawns: disposeInstance() must not free them.
markShared(_G_BEAM, _G_WING_SLASH, _G_TAIL_SWEEP, _G_WING_FLAP, _G_BREATH_CONE, _G_AFTERBURN, _G_STREAK, _G_AD_CHUNK, _G_PART, _G_FLIP, _G_SCORCH, _G_FIREBALL, _G_FIRE_LO, _G_RING_E, _G_SHRAPNEL, _G_DOME, _G_SMOKE_PUFF_S, _G_SPARK_S, _G_DUST_PUFF, _G_MISSILE, _G_AD_FLASH, _G_AD_FIREBALL, _G_AD_STEM, _G_AD_STEMCORE, _G_AD_CAP, _G_AD_CAPCORE, _G_SHOCK, _G_SOUND_SPHERE, _G_IMPACT);
_G_IMPACT.rotateX(-Math.PI / 2);
function _smoothstepJS(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function _spawnBeamImpactShader(opts) {
  const { world, pos, color = 0xffffff } = opts;
  const b1 = _flipSpriteAdd('energy_burst_8x8', 16, color, 1.6);
  if (!b1) return builders.hitPulse ? builders.hitPulse({ world, pos, args: [color] }) : null;

  const group = new THREE.Group();
  group.position.copy(pos);
  world.scene.add(group);
  const bursts = [{ m: b1, delay: 0, dur: 0.55 }];
  const b2 = _flipSpriteAdd('energy_burst_8x8', 10, color, 1.2);
  b2.position.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
  bursts.push({ m: b2, delay: 0.08, dur: 0.45 });
  for (const b of bursts) { b.m.visible = false; b.m.renderOrder = 3; group.add(b.m); }

  // Ground decal: additive tinted glow that cools from white-hot to the
  // monster colour, then out. Only when the hit is near street level.
  let decal = null, decalMat = null;
  if (pos.y < 4 && _flipTex.impact_glow_decal) {
    decalMat = _matGet('impactDecal', () => new THREE.MeshBasicMaterial({
      map: _flipTex.impact_glow_decal, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    }));
    decalMat.color.set(color);
    decal = new THREE.Mesh(_G_IMPACT, decalMat);
    decal.position.y = 0.14 - pos.y;
    decal.rotation.y = Math.random() * Math.PI * 2;
    decal.scale.setScalar(13);
    decal.renderOrder = 2;
    group.add(decal);
    _placeScorch(world, pos, 5.5);
  }
  const baseCol = new THREE.Color(color);
  const hotCol = baseCol.clone().lerp(new THREE.Color(1, 1, 1), 0.6);

  if (builders.sparks) {
    const sp = builders.sparks({ world, pos, args: [14] });
    if (sp) world.effects.push(sp);
  }

  const light = _acquireLight(world.scene);
  light.position.copy(pos); light.position.y += 3;
  light.color.copy(baseCol);
  light.distance = 55;
  light.intensity = 9;
  const seq = (light._seq = (light._seq || 0) + 1);

  const LIFE = 2.6;
  return new VFXEffect(group, LIFE, (dt, t) => {
    const T = t * LIFE;
    for (const b of bursts) {
      const p = (T - b.delay) / b.dur;
      b.m.visible = p >= 0 && p < 1;
      if (b.m.visible) b.m.material.uniforms.frame.value = p * 63;
    }
    if (decal) {
      // White-hot for the first 0.3 s, cools to the beam colour, fades.
      const k = Math.min(1, T / 0.3);
      decalMat.color.copy(hotCol).lerp(baseCol, k).multiplyScalar(2.2 * (1 - _smoothstepJS(0.25, 1.0, t)));
    }
    if (light._seq === seq) light.intensity = 9 * Math.max(0, 1 - T / 0.5);
    if (t >= 1) {
      // Explosion lights in this pool default to warm orange; restore it.
      if (light._seq === seq) { light.intensity = 0; light.color.setHex(0xffaa33); }
      world.scene.remove(group);
      for (const b of bursts) _matPut(b.m.material);
      if (decalMat) _matPut(decalMat);
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
  if (_flipTex.arc_strip_1x8) {
    // Re-strike: a fresh jitter of the same a->b path, so the bolt jumps
    // to a new shape a few times over its life instead of only fading.
    const restrike = () => {
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const p = new THREE.Vector3().copy(a).addScaledVector(dir, i / segs);
        if (i > 0 && i < segs) {
          p.addScaledVector(right, (Math.random() - 0.5) * len * 0.08);
          p.addScaledVector(updir, (Math.random() - 0.5) * len * 0.08);
        }
        pts.push(p);
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    return _spawnArcRibbon(world, curve, len, color, life, segs, restrike);
  }
  // Single fat tube; the shader produces both the white core and colored halo
  // in one draw via radial UV sampling. Radius set between the legacy core
  // (0.30) and halo (0.95) so the visual silhouette is similar.
  const geom = new THREE.TubeGeometry(curve, segs * 2, 0.95, 8, false);
  const mat = _matGet('lightning', () => new THREE.ShaderMaterial({
    uniforms: {
      noiseTex:  { value: NOISE_TEX },
      boltColor: { value: new THREE.Color() },
      time:      { value: 0 },
      fade:      { value: 1 },
    },
    vertexShader: _LIGHTNING_VS,
    fragmentShader: _LIGHTNING_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const uniforms = mat.uniforms;
  uniforms.boltColor.value.set(color);
  uniforms.time.value = 0; uniforms.fade.value = 1;
  const bolt = new THREE.Mesh(geom, mat);
  world.scene.add(bolt);

  return new VFXEffect(bolt, life, (dt, t) => {
    uniforms.time.value = (uniforms.time.value + dt) % 1000;
    uniforms.fade.value = 1 - t;
    if (t >= 1) {
      world.scene.remove(bolt);
      geom.dispose();
      _matPut(mat);
    }
  });
}

// Textured arc ribbon: camera-facing strip along the jittered curve,
// sampling one of the 8 procedural bolt rows in arc_strip_1x8 (fine
// crackle + side branches the polyline alone can't show). The row flips
// every ~50 ms so the bolt visibly re-strikes; a second, wider, dimmer
// ribbon on a different row gives a secondary arc around the main one.
// The tube shader below stays as the fallback when the sheet is missing.
const _ARC_VS = `
  attribute vec3 aDir;
  attribute float aSide;
  uniform float width;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 mv2 = (modelViewMatrix * vec4(position + aDir, 1.0)).xyz;
    vec3 tv = normalize(mv2 - mv.xyz);
    vec3 perp = normalize(cross(tv, normalize(-mv.xyz)));
    mv.xyz += perp * aSide * width * 0.5;
    gl_Position = projectionMatrix * mv;
  }
`;
const _ARC_FS = `
  uniform sampler2D map;
  uniform vec3 boltColor;
  uniform float row;
  uniform float fade;
  varying vec2 vUv;
  void main() {
    // Sheet loaded with flipY=false: v=0 is the top row.
    float I = texture2D(map, vec2(vUv.x, (row + vUv.y) / 8.0)).r;
    if (I < 0.004) discard;
    vec3 col = boltColor * I * 1.6 + vec3(smoothstep(0.65, 1.0, I)) * .65;
    gl_FragColor = vec4(col * fade, 1.0);
  }
`;
function _arcRibbonGeometry(curve, n) {
  const pts = curve.getSpacedPoints(n);
  const pos = new Float32Array((n + 1) * 6);
  const dir = new Float32Array((n + 1) * 6);
  const side = new Float32Array((n + 1) * 2);
  const uv = new Float32Array((n + 1) * 4);
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i];
    const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
    const dx = q.x - o.x, dy = q.y - o.y, dz = q.z - o.z;
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z;
      dir[j * 3] = dx; dir[j * 3 + 1] = dy; dir[j * 3 + 2] = dz;
      side[j] = k ? 1 : -1;
      uv[j * 2] = i / n; uv[j * 2 + 1] = k;
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // Ribbon is expanded in the vertex shader; pad the cull sphere for it.
  g.boundingSphere.radius += 10;
  return g;
}
function _spawnArcRibbon(world, curve, len, color, life, segs, restrike) {
  const nPts = Math.max(8, segs * 4);
  let geom = _arcRibbonGeometry(curve, nPts);
  const group = new THREE.Group();
  const layers = [];
  // Widths scale with arc length so long beam-length bolts stay readable
  // from the chase cam (core / halo).
  for (const [w, dim] of [[Math.min(1.4, .35 + len * .008), 1.0], [Math.min(3, .8 + len * .012), .22]]) {
    const mat = _matGet('arc', () => new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        boltColor: { value: new THREE.Color() },
        row: { value: 0 },
        fade: { value: 1 },
        width: { value: 1 },
      },
      vertexShader: _ARC_VS, fragmentShader: _ARC_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    const uniforms = mat.uniforms;
    uniforms.map.value = _flipTex.arc_strip_1x8;
    uniforms.boltColor.value.set(color);
    uniforms.row.value = Math.floor(Math.random() * 8);
    uniforms.fade.value = dim;
    uniforms.width.value = w;
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    layers.push({ mat, uniforms, dim, next: 0, mesh });
  }
  world.scene.add(group);
  // Lives >= ~1 s get re-struck (new bolt path) every 0.18-0.3 s.
  let nextStrike = restrike && life >= 0.8 ? 0.18 + Math.random() * 0.12 : Infinity;
  return new VFXEffect(group, life, (dt, t) => {
    nextStrike -= dt;
    if (nextStrike <= 0 && t < 0.85) {
      nextStrike = 0.18 + Math.random() * 0.12;
      const g2 = _arcRibbonGeometry(restrike(), nPts);
      for (const L of layers) L.mesh.geometry = g2;
      geom.dispose();
      geom = g2;
    }
    for (const L of layers) {
      L.next -= dt;
      if (L.next <= 0) {
        L.next = 0.035 + Math.random() * 0.03;
        L.uniforms.row.value = Math.floor(Math.random() * 8);
      }
      // Flicker on top of an ease-out fade (stays bright most of its life).
      L.uniforms.fade.value = L.dim * (1 - t * t) * (0.7 + Math.random() * 0.3);
    }
    if (t >= 1) {
      world.scene.remove(group);
      geom.dispose();
      for (const L of layers) _matPut(L.mat);
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
  registerBuilder('sparks',             wrapPosArgs(legacy._makeSparksLegacy || legacy.makeSparks));
  registerBuilder('shockwave',          wrapPosArgs(legacy._makeShockwaveLegacy || legacy.makeShockwave));
  registerBuilder('muzzleFlash',        wrapPosArgs(legacy._makeMuzzleFlashLegacy || legacy.makeMuzzleFlash));
  registerBuilder('smokePuff',          wrapPosArgs(legacy._makeSmokePuffLegacy || legacy.makeSmokePuff));
  registerBuilder('smokeColumn',        wrapPosArgs(legacy._makeSmokeColumnLegacy || legacy.makeSmokeColumn));
  registerBuilder('hitPulse',           wrapPosArgs(legacy._makeHitPulseLegacy || legacy.makeHitPulse));
  // No legacy beam-impact effect existed; a coloured hit pulse stands in.
  registerBuilder('beamImpact', (opts) => (legacy._makeHitPulseLegacy || legacy.makeHitPulse)(
    opts.world, opts.pos, opts.color));
  registerBuilder('weaponTracer', o=>(legacy._makeBeamLegacy || legacy.makeBeam)(o.world,o.origin,o.dir,o.length,0xffbc67,0xffdfaa));
  registerBuilder('ballisticImpact', o=>(legacy._makeSparksLegacy || legacy.makeSparks)(o.world,o.pos,8));
  registerBuilder('kaijuCharge', o=>{
    const pos=new THREE.Vector3();o.source.getWorldPosition(pos);
    return (legacy._makeHitPulseLegacy || legacy.makeHitPulse)(o.world,pos,0x77d9ff);
  });
  registerBuilder('atomicDome',         wrapPosArgs(legacy._makeAtomicDomeLegacy || legacy.makeAtomicDome));
  registerBuilder('atomicDevastation',  wrapPosArgs(legacy._makeAtomicDevastationLegacy || legacy.makeAtomicDevastation));
  registerBuilder('soundRings',         wrapPosArgs(legacy._makeSoundWaveRingsLegacy || legacy.makeSoundWaveRings));
  registerBuilder('wingSlash',          wrapPosArgs(legacy._makeWingSlashLegacy || legacy.makeWingSlash));
  registerBuilder('tailSweep',          wrapPosArgs(legacy._makeTailSweepLegacy || legacy.makeTailSweep));
  registerBuilder('dustBurst',          wrapPosArgs(legacy._makeDustBurstLegacy || legacy.makeDustBurst));
  registerBuilder('wingFlap',           wrapPosArgs(legacy._makeWingFlapLegacy || legacy.makeWingFlap));
  registerBuilder('missileLaunchFlash', wrapPosArgs(legacy._makeMissileLaunchFlashLegacy || legacy.makeMissileLaunchFlash));
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
  registerBuilder('missileSwarm', (opts) => (legacy._makeMissileSwarmLegacy || legacy.makeMissileSwarm)(
    opts.world, opts.origin, opts.radius, opts.count));
  // makeAfterburnerTrail(world, fromPos, toPos, color) - effects.js:542
  registerBuilder('afterburner', (opts) => (legacy._makeAfterburnerTrailLegacy || legacy.makeAfterburnerTrail)(
    opts.world, opts.fromPos, opts.toPos, opts.color));
  // makeBreathCone(world, origin, dir, length, color, life) - effects.js:633
  registerBuilder('breathCone', (opts) => (legacy._makeBreathConeLegacy || legacy.makeBreathCone)(
    opts.world, opts.origin, opts.dir, opts.length, opts.color, opts.life));
  // makeWindStreaks(world, origin, dir, color, count) - effects.js:694
  registerBuilder('windStreaks', (opts) => (legacy._makeWindStreaksLegacy || legacy.makeWindStreaks)(
    opts.world, opts.origin, opts.dir, opts.color, opts.count));
}

export function listBuilders() { return Object.keys(builders); }

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
  registerBuilder('smokePuff',         _spawnSmokePuffShader);
  registerBuilder('smokeColumn',       _spawnSmokeColumnShader);
  registerBuilder('sparks',            _spawnSparksShader);
  registerBuilder('wingSlash',         _spawnWingSlashShader);
  registerBuilder('tailSweep',         _spawnTailSweepShader);
  registerBuilder('wingFlap',          _spawnWingFlapShader);
  registerBuilder('breathCone',        _spawnBreathConeShader);
  registerBuilder('afterburner',       _spawnAfterburnerShader);
  registerBuilder('windStreaks',       _spawnWindStreaksShader);
  registerBuilder('dustBurst',         _spawnDustBurstShader);
  registerBuilder('muzzleFlash',       _spawnMuzzleFlashShader);
  registerBuilder('missileLaunchFlash', _spawnMissileLaunchFlashShader);
  registerBuilder('missileSwarm',      _spawnMissileSwarmShader);
  registerBuilder('beamImpact',        _spawnBeamImpactShader);
}

// Convenience: register legacy fallbacks first, then upgrade overrides.
// game.js calls this single helper instead of orchestrating order itself.
// With ?vfx=legacy, the upgrade pass is a no-op and every effect routes
// through the original procedural makers in src/effects.js.
export function registerAllBuilders(legacy) {
  registerLegacyEffects(legacy);
  _registerUpgradedBuilders();
  if (!LEGACY_VFX) {
    for (const [name, builder] of Object.entries(powerBuilders(name => _flipTex[name], _placeScorch, (world,pos,scale)=>{
      const light=_acquireLight(world.scene),seq=(light._seq=(light._seq||0)+1);
      light.position.copy(pos);light.color.setHex(0xffb468);light.distance=22*scale;
      return {update(age){if(light._seq===seq)light.intensity=5*scale*Math.exp(-age*12);},
        dispose(){if(light._seq===seq)light.intensity=0;}};
    }))) registerBuilder(name, builder);
  }
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
  emitParticles,
  tickParticles,
};
export default vfx;
