// Gorrak's atomic breath, start to finish, as one pooled effect:
//  charge (0.4 s): the body's glow ramps up, energy motes converge on the
//    mouth, a mouth glow swells
//  travel (0.3-0.5 s): a bright core bolt inside a wider soft glow, a
//    spiralling ribbon, sparks shed along the path, dust kicked up where it
//    runs low
//  detonation (a 0.15 s beat after it arrives): a white-hot core flash and a
//    second pulse, an expanding shell (bluish-white cooling into the beam
//    colour), a condensation torus at the equator, radial ember streaks, dust
//    walls rolling outward, a rising heat cap; over water a steam column and
//    ring waves instead of dust
//  aftermath: a glowing scorch on the ground (~7 s) and falling ash/embers.
// The ground rings, smoke column and fireball light come from the world's
// pooled spawners (game.js). Gameplay fires through onDetonate.
//
// Pooled: a fixed set of blast slots (meshes + per-slot material clones of
// shared shaders) and two particle pools (glow / smoke, one Points draw
// each), created once and reused; nothing is built per shot and nothing is
// allocated per frame. The 'atomicBlast' vfx builder stages one of each so
// the START prewarm links these programs before the first breath.
// Tiers: desktop gets everything; phone MED the core layers (charge glow,
// bolt core + outer glow, torus, scorch, fewer embers); LOW the minimum.
import * as THREE from 'three';
import { registerBuilder, spawn as spawnVFX } from './vfx.js';
import { isMobile, Q_LOW, LEGACY_VFX } from './quality.js';

const FULL = !isMobile && !Q_LOW;   // desktop MED / HIGH
const MID = !FULL && !Q_LOW;        // phone MED
const SLOTS = 2;                    // breath cooldown 6 s vs ~3 s per blast (scorch outlives it: own pool)
const CHARGE = Q_LOW ? 0.25 : 0.4;
const TRAVEL_SPEED = 420;           // u/s -> 0.3-0.45 s to 125-190u
const BEAT = 0.15;
const CORE_T = 0.28, PULSE_AT = 0.32, PULSE_T = 0.22;
const SHELL_GROW = 0.45, SHELL_HOLD = 0.35, SHELL_FADE = 0.9;
const CAP_T = 1.8, TORUS_T = 1.6, SCORCH_T = 7.0;
const R_SHELL = isMobile ? 26 : 32;

// ---- Shared geometry + shaders ------------------------------------------

let _G = null;
function _tpl(g) { g.userData.shared = g.userData.template = true; return g; } // restartInPlace keeps template geometry
function _geoms() {
  if (_G) return _G;
  const bolt = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  bolt.translate(0, 0.5, 0);   // base at the origin, +Y = length
  // Ribbon: a flat strip coiling 6 turns around the unit-length axis
  const pts = [], TURNS = 6, N = 96;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * TURNS * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), t, Math.sin(a)));
  }
  const ribbon = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.12, 4, false);
  const sph = new THREE.SphereGeometry(1, isMobile ? 16 : 28, isMobile ? 12 : 20);
  const torus = new THREE.TorusGeometry(1, 0.22, isMobile ? 8 : 12, isMobile ? 32 : 56);
  torus.rotateX(Math.PI / 2); // horizontal
  const disc = new THREE.PlaneGeometry(2, 2);
  disc.rotateX(-Math.PI / 2);
  _G = { bolt: _tpl(bolt), ribbon: _tpl(ribbon), sph: _tpl(sph), torus: _tpl(torus), disc: _tpl(disc) };
  return _G;
}

// Additive glow: fresnel-weighted rim + a hot centre, colour/opacity per slot
const _GLOW_VS = `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const _GLOW_FS = `
  uniform vec3 color; uniform vec3 hot; uniform float opacity; uniform float rim;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a = mix(1.0, pow(f, 1.6), rim);
    vec3 c = mix(hot, color, f);
    gl_FragColor = vec4(min(c * (1.0 + .35 * (1.0 - f)), vec3(2.2)), a * opacity * .65);
  }`;
function _glowMat(rim) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0x66ff66) },
      hot: { value: new THREE.Color(0xeef6ff) },
      opacity: { value: 0 },
      rim: { value: rim },
    },
    vertexShader: _GLOW_VS, fragmentShader: _GLOW_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
}

// Scorch: radial texture (dark charred centre, glowing rim) drawn twice: a
// normal-blended dark pass and an additive glow pass that cools faster
let _scorchTex = null;
function _scorchTexture() {
  if (_scorchTex) return _scorchTex;
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const cx = cv.getContext && cv.getContext('2d');
  if (cx) {
    const img = cx.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
      const jag = 1 + 0.08 * Math.sin(a * 7) + 0.05 * Math.sin(a * 13 + 1.3) + 0.04 * (Math.random() - 0.5);
      const rr = r * jag;
      // R: char density, G: glow ring (peak at ~0.7)
      const dark = Math.max(0, Math.min(1, (1 - rr) * 1.6)) * (0.85 + 0.15 * Math.random());
      const glow = Math.exp(-(((rr - 0.68) / 0.12) ** 2)) * (0.6 + 0.4 * Math.random());
      const i = (y * N + x) * 4;
      d[i] = dark * 255; d[i + 1] = glow * 255; d[i + 2] = 0; d[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
  }
  _scorchTex = new THREE.CanvasTexture(cv);
  return _scorchTex;
}
const _DECAL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const _DECAL_FS = `
  uniform sampler2D map; uniform vec3 color; uniform float dark; uniform float glow; uniform float glowPass;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    if (glowPass > 0.5) gl_FragColor = vec4(color * t.g * glow * 2.0, 1.0);
    else gl_FragColor = vec4(vec3(0.03, 0.025, 0.02), t.r * dark);
  }`;
function _decalMat(glowPass) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, color: { value: new THREE.Color(0x66ff66) }, dark: { value: 0 }, glow: { value: 0 }, glowPass: { value: glowPass } },
    vertexShader: _DECAL_VS, fragmentShader: _DECAL_FS,
    transparent: true, depthWrite: false,
    blending: glowPass ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 - glowPass,
    toneMapped: false, fog: false,
  });
}

// ---- Particles: two pools (additive glow, normal smoke), one draw each ---

const PT_VS = `
  attribute float size; attribute vec4 rgba;
  varying vec4 vC;
  void main() {
    vC = rgba;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (700.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const PT_FS = `
  varying vec4 vC;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r) * (1.0 - r));
  }`;
const GLOW_N = FULL ? 700 : (MID ? 160 : 60);
const SMOKE_N = FULL ? 320 : 0;

function _makePool(n, additive) {
  if (!n) return null;
  const pos = new Float32Array(n * 3).fill(-1e4), rgba = new Float32Array(n * 4), size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('rgba', new THREE.BufferAttribute(rgba, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.userData.template = true;
  const mat = new THREE.ShaderMaterial({
    vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = additive ? 2 : 1;
  // Per particle: age, life, vel, colour, size, drag, gravity, fadeIn
  const P = {
    pts, n, pos, rgba, size, live: 0, next: 0,
    age: new Float32Array(n).fill(-1), life: new Float32Array(n),
    vel: new Float32Array(n * 3), col: new Float32Array(n * 3), a0: new Float32Array(n),
    s0: new Float32Array(n), s1: new Float32Array(n), drag: new Float32Array(n), grav: new Float32Array(n),
    target: new Float32Array(n * 3), seek: new Uint8Array(n),
  };
  return P;
}
let _glow = null, _smoke = null;
function _pools(scene) {
  if (!_glow) { _glow = _makePool(GLOW_N, true); _smoke = _makePool(SMOKE_N, false); }
  for (const P of [_glow, _smoke]) if (P && P.pts.parent !== scene) scene.add(P.pts);
}

/** Spawn one particle (oldest slot reused). */
function _emit(P, x, y, z, vx, vy, vz, r, g, b, a, life, s0, s1, drag = 0, grav = 0) {
  if (!P) return -1;
  const i = P.next; P.next = (P.next + 1) % P.n;
  P.age[i] = 0; P.life[i] = life;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b; P.a0[i] = a;
  P.s0[i] = s0; P.s1[i] = s1; P.drag[i] = drag; P.grav[i] = grav; P.seek[i] = 0;
  P.live = 1; P.pts.visible = true;
  return i;
}

function _updatePool(P, dt) {
  if (!P || !P.live) return;
  let any = 0;
  const { pos, rgba, size, age, life, vel, col, a0, s0, s1, drag, grav, seek, target } = P;
  for (let i = 0; i < P.n; i++) {
    if (age[i] < 0) continue;
    age[i] += dt;
    const k = age[i] / life[i];
    if (k >= 1) { age[i] = -1; pos[i * 3 + 1] = -1e4; rgba[i * 4 + 3] = 0; continue; }
    any = 1;
    const j = i * 3;
    if (seek[i]) {
      // Converge on the target (mouth), accelerating in
      const e = k * k;
      pos[j] += (target[j] - pos[j]) * Math.min(1, dt * (3 + 14 * e));
      pos[j + 1] += (target[j + 1] - pos[j + 1]) * Math.min(1, dt * (3 + 14 * e));
      pos[j + 2] += (target[j + 2] - pos[j + 2]) * Math.min(1, dt * (3 + 14 * e));
    } else {
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[j] *= dr; vel[j + 1] = vel[j + 1] * dr - grav[i] * dt; vel[j + 2] *= dr;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.2 && grav[i] > 0) { pos[j + 1] = 0.2; vel[j + 1] *= -0.2; vel[j] *= 0.6; vel[j + 2] *= 0.6; }
    }
    // Quick fade in, long fade out
    const a = a0[i] * Math.min(1, k * 8) * (1 - k) * (1 - k * 0.3);
    rgba[i * 4] = col[j]; rgba[i * 4 + 1] = col[j + 1]; rgba[i * 4 + 2] = col[j + 2]; rgba[i * 4 + 3] = a;
    size[i] = s0[i] + (s1[i] - s0[i]) * k;
  }
  const g = P.pts.geometry;
  g.attributes.position.needsUpdate = true; g.attributes.rgba.needsUpdate = true; g.attributes.size.needsUpdate = true;
  P.live = any;
  P.pts.visible = !!any; // no draw while the pool is empty
}

// ---- Slots -----------------------------------------------------------------

/** One slot's meshes. null where the tier drops the layer. */
function _makeParts() {
  const g = _geoms();
  const mk = (geom, mat, order = 3) => {
    const m = new THREE.Mesh(geom, mat);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.visible = false; m.renderOrder = order;
    return m;
  };
  return {
    mouth: Q_LOW ? null : mk(g.sph, _glowMat(0.0)),
    bolt: mk(g.bolt, _glowMat(0.35)),
    boltOuter: Q_LOW ? null : mk(g.bolt, _glowMat(1.0)),
    ribbon: FULL ? mk(g.ribbon, _glowMat(0.0)) : null,
    head: mk(g.sph, _glowMat(0.0)),
    core: mk(g.sph, _glowMat(0.0)),
    shell: mk(g.sph, _glowMat(1.0)),
    torus: Q_LOW ? null : mk(g.torus, _glowMat(0.6)),
    cap: FULL ? mk(g.sph, _glowMat(0.8)) : null,
  };
}
function _makeScorch() {
  if (Q_LOW) return null;
  const g = _geoms();
  const mk = (glowPass) => {
    const m = new THREE.Mesh(g.disc, _decalMat(glowPass));
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.visible = false; m.renderOrder = 0;
    return m;
  };
  return { dark: mk(0), glow: mk(1), t: -1 };
}

// Prewarm: _stageVfx calls vfx builders with a stub world whose scene is a
// staging group. Stage one of each part there (same shaders as the slots).
registerBuilder('atomicBlast', (opts) => {
  const add = (m) => { if (!m) return; m.visible = true; opts.world.scene.add(m); };
  const p = _makeParts();
  for (const k in p) { if (p[k]) { p[k].material.uniforms.opacity.value = 0.5; add(p[k]); } }
  const sc = _makeScorch();
  if (sc) { sc.dark.material.uniforms.map.value = sc.glow.material.uniforms.map.value = _scorchTexture(); add(sc.dark); add(sc.glow); }
  for (const P of [_makePool(4, true), _makePool(SMOKE_N ? 4 : 0, false)]) if (P) opts.world.scene.add(P.pts);
  return null;
});

const _slots = [];
const _scorches = [];
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

function _slot(scene) {
  let s = _slots.find((x) => !x.active);
  if (!s) {
    if (_slots.length < SLOTS) {
      s = { parts: _makeParts(), active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(), pos: new THREE.Vector3(),
        color: new THREE.Color(), side: new THREE.Vector3(), up2: new THREE.Vector3(), mats: [], emis: [] };
      _slots.push(s);
    } else {
      s = _slots.reduce((a, b) => (a.t > b.t ? a : b)); // reuse the oldest
      _restoreGlow(s);
    }
  }
  // A restart-in-place empties the scene: re-add the parts
  for (const k in s.parts) { const m = s.parts[k]; if (m && m.parent !== scene) scene.add(m); }
  return s;
}

/** The kaiju body glow (charge): emissive ramp on its own materials. */
function _restoreGlow(s) {
  for (let i = 0; i < s.mats.length; i++) {
    const m = s.mats[i];
    m.emissive.copy(s.emis[i]);
  }
  s.mats.length = 0;
}
function _collectGlow(s, root) {
  s.mats.length = 0;
  if (!root || Q_LOW) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m.emissive || s.mats.includes(m)) continue;
      const k = s.mats.length;
      s.mats.push(m);
      if (!s.emis[k]) s.emis[k] = new THREE.Color();
      s.emis[k].copy(m.emissive);
    }
  });
}
function _setGlow(s, amt) {
  for (let i = 0; i < s.mats.length; i++) s.mats[i].emissive.copy(s.emis[i]).lerp(s.color, Math.max(0, Math.min(1, amt)));
}

/**
 * Fire a breath from origin (the mouth) along dir, detonating dist ahead.
 * opts: { kaijuRoot (body glow), world (isWater + water API for the
 * steam/ring-wave variant) }. onDetonate(pos) runs once at the detonation
 * instant (gameplay, audio).
 */
export function fireAtomicBreath(scene, origin, dir, dist, color, onDetonate, opts = {}) {
  _pools(scene);
  const s = _slot(scene);
  s.active = true; s.t = 0; s.detonated = false; s.emitAcc = 0;
  s.origin.copy(origin); s.dir.copy(dir).normalize();
  s.side.crossVectors(s.dir, _up).normalize();
  if (s.side.lengthSq() < 1e-4) s.side.set(1, 0, 0);
  s.up2.crossVectors(s.side, s.dir).normalize();
  s.dist = dist;
  s.travel = Math.min(0.5, Math.max(0.3, dist / TRAVEL_SPEED));
  s.pos.copy(origin).addScaledVector(s.dir, dist);
  s.color.set(color);
  s.onDetonate = onDetonate;
  s.ground = Math.max(0, s.pos.y);
  s.world = opts.world || null;
  s.water = !!(s.world && s.world.isWater && s.world.isWater(s.pos.x, s.pos.z));
  _restoreGlow(s);
  _collectGlow(s, opts.kaijuRoot);
  for (const k in s.parts) {
    const m = s.parts[k];
    if (!m) continue;
    m.visible = false;
    m.material.uniforms.color.value.copy(s.color);
    m.material.uniforms.opacity.value = 0;
  }
  const { mouth } = s.parts;
  if (mouth) { mouth.position.copy(origin); mouth.visible = true; }
  // Motes: start scattered around the head, converge on the mouth
  const motes = FULL ? 46 : (MID ? 14 : 0);
  for (let i = 0; i < motes; i++) {
    _v.set(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(9 + Math.random() * 9);
    const j = _emit(_glow, origin.x + _v.x, origin.y + _v.y, origin.z + _v.z, 0, 0, 0,
      s.color.r * 1.6 + 0.4, s.color.g * 1.6 + 0.4, s.color.b * 1.6 + 0.4, 1, CHARGE * (0.8 + Math.random() * 0.3), 1.0, 0.4);
    if (j >= 0) { _glow.seek[j] = 1; _glow.target[j * 3] = origin.x; _glow.target[j * 3 + 1] = origin.y; _glow.target[j * 3 + 2] = origin.z; }
  }
}

/** Per frame (game loop). No allocations. */
export function updateAtomicBlasts(dt) {
  for (const s of _slots) if (s.active) _updateSlot(s, dt);
  for (const sc of _scorches) if (sc.t >= 0) _updateScorch(sc, dt);
  _updatePool(_glow, dt);
  _updatePool(_smoke, dt);
}

function _updateSlot(s, dt) {
  s.t += dt;
  const { mouth, bolt, boltOuter, ribbon, head, core, shell, torus, cap } = s.parts;
  const t = s.t, tr = s.travel, C = s.color;
  // --- Charge: the body glows up, the mouth swells
  if (t < CHARGE) {
    const k = t / CHARGE;
    _setGlow(s, 0.28 * k * k * (0.85 + 0.15 * Math.sin(t * 50)));
    if (mouth) {
      mouth.scale.setScalar(1.2 + 3.4 * k + Math.sin(t * 70) * 0.3);
      mouth.material.uniforms.opacity.value = 0.4 + 0.6 * k;
    }
    return;
  }
  const tt = t - CHARGE; // travel clock
  // Body glow decays through the travel
  if (tt < tr + 0.4) _setGlow(s, 0.28 * Math.max(0, 1 - tt / (tr + 0.4)));
  else if (s.mats.length) _restoreGlow(s);
  if (mouth && mouth.visible) {
    if (tt > 0.25) mouth.visible = false;
    else mouth.material.uniforms.opacity.value = 1 - tt / 0.25;
  }
  // --- Travel: the core and outer glow grow to the head, the ribbon coils
  // around them; then everything fades
  if (tt < tr + 0.3) {
    const f = Math.min(1, tt / tr);
    const len = Math.max(0.01, s.dist * f);
    const fade = tt < tr ? 1 : 1 - (tt - tr) / 0.3;
    if (!bolt.visible) {
      _q.setFromUnitVectors(_up, s.dir);
      for (const m of [bolt, boltOuter, ribbon]) if (m) { m.position.copy(s.origin); m.quaternion.copy(_q); m.visible = true; }
      head.visible = true;
    }
    bolt.scale.set(1.4, len, 1.4);
    bolt.material.uniforms.opacity.value = 1.0 * fade;
    bolt.material.uniforms.hot.value.setRGB(2.2, 2.4, 2.6);
    if (boltOuter) {
      boltOuter.scale.set(2.2 + Math.sin(tt * 40) * .2, len, 2.2 + Math.sin(tt * 40) * .2);
      boltOuter.material.uniforms.opacity.value = .12 * fade;
    }
    if (ribbon) {
      ribbon.scale.set(2.6, len, 2.6);
      ribbon.rotateY(dt * 18); // spin about the bolt axis
      ribbon.material.uniforms.opacity.value = 0.9 * fade;
    }
    head.position.copy(s.origin).addScaledVector(s.dir, len);
    head.scale.setScalar(3.4 + Math.sin(tt * 60) * 0.5);
    head.material.uniforms.opacity.value = tt < tr ? 1 : fade;
    head.material.uniforms.hot.value.setRGB(2.5, 2.6, 2.8);
    // Sparks shed from the head; dust kicked up where it runs low
    if (tt < tr && (FULL || MID)) {
      s.emitAcc += dt * (FULL ? 220 : 50);
      const hp = head.position;
      while (s.emitAcc >= 1) {
        s.emitAcc -= 1;
        const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 14;
        _emit(_glow, hp.x, hp.y, hp.z,
          (s.side.x * Math.cos(a) + s.up2.x * Math.sin(a)) * sp - s.dir.x * 10,
          (s.side.y * Math.cos(a) + s.up2.y * Math.sin(a)) * sp + 4,
          (s.side.z * Math.cos(a) + s.up2.z * Math.sin(a)) * sp - s.dir.z * 10,
          C.r + 0.6, C.g + 0.6, C.b + 0.4, 1, 0.5 + Math.random() * 0.5, 0.9, 0.2, 1.2, 18);
        if (FULL && hp.y < 14 && Math.random() < 0.35) {
          _emit(_smoke, hp.x + (Math.random() - 0.5) * 4, 0.6, hp.z + (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 6 + s.dir.x * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 6 + s.dir.z * 8,
            0.5, 0.46, 0.4, 0.55, 1.4 + Math.random(), 4, 10, 1.5, 0);
        }
      }
    }
  } else if (bolt.visible) {
    for (const m of [bolt, boltOuter, ribbon, head]) if (m) m.visible = false;
  }
  // --- Detonation
  const td = tt - tr - BEAT;
  if (td >= 0 && !s.detonated) _detonate(s);
  if (td < 0) return;
  // Core: a white-hot flash, then a second, smaller pulse
  if (core.visible) {
    if (td < CORE_T) {
      const k = td / CORE_T;
      core.scale.setScalar(2 + 5 * (1 - (1 - k) * (1 - k)));
      core.material.uniforms.opacity.value = Math.max(0, 1 - k * 3);
    } else if (td < PULSE_AT) {
      core.material.uniforms.opacity.value = 0;
    } else if (td < PULSE_AT + PULSE_T && !Q_LOW) {
      const k = (td - PULSE_AT) / PULSE_T;
      core.scale.setScalar(8 + 10 * k);
      core.material.uniforms.opacity.value = .12 * Math.sin(Math.PI * k);
    } else core.visible = false;
  }
  // Shell: grows (ease-out) bluish-white, holds, then cools into the beam
  // colour, keeps swelling a little and dissipates
  const R = R_SHELL;
  let r, op, cool;
  if (td < SHELL_GROW) { const k = td / SHELL_GROW; r = R * (1 - (1 - k) ** 3); op = 0.95; cool = k * 0.3; }
  else if (td < SHELL_GROW + SHELL_HOLD) { r = R; op = 0.9; cool = 0.3 + 0.4 * (td - SHELL_GROW) / SHELL_HOLD; }
  else {
    const k = (td - SHELL_GROW - SHELL_HOLD) / SHELL_FADE;
    r = R * (1 + 0.18 * k); op = 0.9 * (1 - k) * (1 - k); cool = 0.7 + 0.3 * k;
    if (k >= 1) { shell.visible = false; op = 0; }
  }
  if (shell.visible) {
    shell.scale.setScalar(r);
    _c.setRGB(0.85, 0.93, 1.0).lerp(C, Math.min(1, cool));
    shell.material.uniforms.color.value.copy(_c);
    shell.material.uniforms.hot.value.setRGB(1.6, 1.7, 1.8).lerp(C, cool * 0.8);
    shell.material.uniforms.opacity.value = op;
  }
  // Condensation torus at the shell's equator, racing outward
  if (torus && torus.visible) {
    const k = (td - 0.1) / TORUS_T;
    if (k >= 1) torus.visible = false;
    else if (k > 0) {
      const rr = R * (0.7 + 1.9 * (1 - (1 - k) * (1 - k)));
      torus.scale.set(rr, rr * (0.9 + 0.6 * k), rr);
      torus.material.uniforms.color.value.setRGB(0.75, 0.8, 0.85).lerp(C, 0.25);
      torus.material.uniforms.hot.value.setRGB(1.3, 1.35, 1.4);
      torus.material.uniforms.opacity.value = 0.7 * (1 - k) * Math.min(1, k * 6);
    }
  }
  // Heat cap: a squat glowing puff rising off the blast (desktop)
  if (cap && cap.visible) {
    const k = td / CAP_T;
    if (k >= 1) cap.visible = false;
    else {
      const rr = R * (0.45 + 0.5 * k);
      cap.scale.set(rr, rr * 0.45, rr);
      cap.position.y = s.ground + R * 0.6 + k * R * 1.4;
      cap.material.uniforms.color.value.copy(C).multiplyScalar(0.8);
      cap.material.uniforms.hot.value.setRGB(1.4, 1.2, 0.9);
      cap.material.uniforms.opacity.value = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.15));
    }
  }
  // Lingering ash and embers drifting down over the area (desktop)
  if (FULL && td < 3.5) {
    s.emitAcc += dt * 40;
    while (s.emitAcc >= 1) {
      s.emitAcc -= 1;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * R * 1.6;
      const x = s.pos.x + Math.cos(a) * rr, z = s.pos.z + Math.sin(a) * rr, y = s.ground + 20 + Math.random() * 30;
      if (Math.random() < 0.4) _emit(_glow, x, y, z, (Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3, C.r + 0.8, C.g * 0.7 + 0.5, 0.2, 0.9, 3 + Math.random() * 2, 0.6, 0.3, 0.2, 1.2);
      else _emit(_smoke, x, y, z, (Math.random() - 0.5) * 2, -1.5, (Math.random() - 0.5) * 2, 0.22, 0.21, 0.2, 0.7, 3.5 + Math.random() * 2, 0.9, 0.7, 0.3, 0.8);
    }
  }
  if (!shell.visible && !core.visible && !(cap && cap.visible) && !(torus && torus.visible) && td > 3.5) s.active = false;
}

/** The detonation instant: show the blast meshes, burst particles, lay the
 *  scorch, call gameplay. */
function _detonate(s) {
  s.detonated = true;
  const { core, shell, torus, cap } = s.parts;
  const P = s.pos, C = s.color, g = s.ground;
  if (s.world && !LEGACY_VFX) {
    const plume = spawnVFX('atomicDetonation', { world: s.world, pos: P.clone() });
    if (plume) s.world.effects.push(plume);
  }
  core.position.copy(P); core.visible = true;
  core.material.uniforms.hot.value.setRGB(3, 3, 3);
  core.material.uniforms.color.value.setRGB(2.2, 2.4, 2.6);
  shell.position.set(P.x, g + 4, P.z); shell.visible = LEGACY_VFX;
  if (torus) { torus.position.set(P.x, g + 4, P.z); torus.visible = LEGACY_VFX; }
  if (cap) { cap.position.copy(P); cap.visible = LEGACY_VFX; }
  // Radial ember streaks flung outward
  const embers = FULL ? 160 : (MID ? 40 : 14);
  for (let i = 0; i < embers; i++) {
    const a = Math.random() * Math.PI * 2, el = Math.random() * 0.9 - 0.1, sp = 30 + Math.random() * 55;
    _emit(_glow, P.x, g + 4 + Math.random() * 6, P.z,
      Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.8 + 6, Math.sin(a) * Math.cos(el) * sp,
      1.6, 1.3 + C.g * 0.4, 0.5 + C.b * 0.3, 1, 0.9 + Math.random() * 0.9, 1.6, 0.4, 1.4, 22);
  }
  if (s.water) {
    // Over water: a steam / spray column and ring waves
    const w = s.world && s.world.water;
    w?.splash?.(P.x, P.z, 3, 'ult');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      w?.surge?.(P.x + Math.cos(a) * R_SHELL, P.z + Math.sin(a) * R_SHELL, 1);
      w?.ripple?.(P.x + Math.cos(a) * R_SHELL * 0.6, P.z + Math.sin(a) * R_SHELL * 0.6, 1.2);
    }
    const steam = FULL ? 90 : 0;
    for (let i = 0; i < steam; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 8;
      _emit(_smoke, P.x + Math.cos(a) * rr, 0.5, P.z + Math.sin(a) * rr,
        Math.cos(a) * 3, 14 + Math.random() * 22, Math.sin(a) * 3, 0.92, 0.94, 0.96, 0.55, 2.5 + Math.random() * 1.5, 6, 22, 0.8, 0);
    }
  } else if (FULL) {
    // Dust walls rolling outward along the ground with the shock ring
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * Math.PI * 2 + Math.random() * 0.05, sp = 34 + Math.random() * 10;
      _emit(_smoke, P.x + Math.cos(a) * 6, 1 + Math.random() * 3, P.z + Math.sin(a) * 6,
        Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 0.52, 0.48, 0.42, 0.6, 1.8 + Math.random() * 0.6, 5, 14, 1.1, 0);
    }
  }
  // The scorch (own pool: it outlives the slot)
  if (!s.water && !Q_LOW) {
    let sc = _scorches.find((x) => x.t < 0);
    if (!sc) {
      if (_scorches.length < 4) { sc = _makeScorch(); _scorches.push(sc); }
      else sc = _scorches.reduce((a, b) => (a.t > b.t ? a : b));
    }
    const scene = core.parent;
    for (const m of [sc.dark, sc.glow]) {
      if (m.parent !== scene && scene) scene.add(m);
      m.material.uniforms.map.value = _scorchTexture();
      m.position.set(P.x, 0.06, P.z);
      m.scale.setScalar(R_SHELL * 0.95);
      m.rotation.y = Math.random() * Math.PI * 2;
      m.visible = true;
    }
    sc.glow.material.uniforms.color.value.copy(C).lerp(_c.setRGB(1, 0.6, 0.2), 0.4);
    sc.t = 0;
  }
  try { s.onDetonate && s.onDetonate(P); } catch (e) { /* gameplay error must not stall the pool */ }
}

function _updateScorch(sc, dt) {
  sc.t += dt;
  const k = sc.t / SCORCH_T;
  if (k >= 1) { sc.t = -1; sc.dark.visible = sc.glow.visible = false; return; }
  sc.dark.material.uniforms.dark.value = 0.85 * Math.min(1, sc.t * 4) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
  sc.glow.material.uniforms.glow.value = Math.min(1, sc.t * 4) * Math.max(0, 1 - k * 1.6) * (0.85 + 0.15 * Math.sin(sc.t * 9));
}

/** Hide everything (restart / game over cleanup). */
export function resetAtomicBlasts() {
  for (const s of _slots) {
    _restoreGlow(s);
    s.active = false;
    for (const k in s.parts) if (s.parts[k]) s.parts[k].visible = false;
  }
  for (const sc of _scorches) { sc.t = -1; sc.dark.visible = sc.glow.visible = false; }
  for (const P of [_glow, _smoke]) {
    if (!P) continue;
    P.age.fill(-1); P.pos.fill(-1e4); P.rgba.fill(0); P.live = 1;
  }
}
