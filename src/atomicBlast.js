// Gorrak's atomic breath payoff: the breath travels out as a bolt (head +
// growing trail, ~0.3-0.5 s), and a beat after it arrives it detonates into
// a huge sphere blast: white-hot core flash, an expanding glowing shell
// (bluish-white cooling into the beam colour) that holds then dissipates,
// and a rising heat cap. The ground ring, smoke column and fireball light
// come from the world's pooled spawners. Gameplay (damage, shake, audio)
// fires through onDetonate at the detonation instant.
//
// Pooled: a fixed set of blast slots (meshes + per-slot material clones of
// shared shaders), created once and reused; nothing is built per shot. The
// 'atomicBlast' vfx builder stages one of each mesh so the START prewarm
// links these programs before the first breath.
import * as THREE from 'three';
import { registerBuilder } from './vfx.js';
import { isMobile } from './quality.js';

const SLOTS = 2;               // breath cooldown 6 s vs ~2.6 s per blast
const TRAVEL_SPEED = 420;      // u/s -> 0.3-0.45 s to 125-190u
const BEAT = 0.15;             // pause between arrival and detonation
const CORE_T = 0.28, SHELL_GROW = 0.45, SHELL_HOLD = 0.35, SHELL_FADE = 0.9;
const CAP_T = 1.8;

// ---- Shared geometry + shaders ------------------------------------------

let _G = null;
function _geoms() {
  if (_G) return _G;
  const bolt = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  bolt.translate(0, 0.5, 0);   // base at the origin, +Y = length
  bolt.userData.shared = bolt.userData.template = true; // restartInPlace keeps template geometry
  const sph = new THREE.SphereGeometry(1, isMobile ? 16 : 28, isMobile ? 12 : 20);
  sph.userData.shared = sph.userData.template = true;
  _G = { bolt, sph };
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
    gl_FragColor = vec4(c * (1.0 + 1.5 * (1.0 - f)), a * opacity);
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

/** One slot's meshes: bolt trail, bolt head, core flash, shell, heat cap. */
function _makeParts() {
  const g = _geoms();
  const mk = (geom, mat) => {
    const m = new THREE.Mesh(geom, mat);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.visible = false;
    return m;
  };
  return {
    bolt: mk(g.bolt, _glowMat(0.35)),
    head: mk(g.sph, _glowMat(0.0)),
    core: mk(g.sph, _glowMat(0.0)),
    shell: mk(g.sph, _glowMat(1.0)),
    cap: isMobile ? null : mk(g.sph, _glowMat(0.8)),
  };
}

// Prewarm: _stageVfx calls vfx builders with a stub world whose scene is a
// staging group. Stage one of each part there (same shaders as the slots).
registerBuilder('atomicBlast', (opts) => {
  const p = _makeParts();
  for (const k in p) {
    if (!p[k]) continue;
    p[k].visible = true;
    p[k].material.uniforms.opacity.value = 0.5;
    opts.world.scene.add(p[k]);
  }
  return null;
});

// ---- Pool ----------------------------------------------------------------

const _slots = [];
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _c = new THREE.Color();

function _slot(scene) {
  let s = _slots.find((x) => !x.active);
  if (!s) {
    if (_slots.length < SLOTS) {
      s = { parts: _makeParts(), active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(), pos: new THREE.Vector3(), color: new THREE.Color() };
      _slots.push(s);
    } else {
      s = _slots.reduce((a, b) => (a.t > b.t ? a : b)); // reuse the oldest
    }
  }
  // A restart-in-place empties the scene: re-add the parts
  for (const k in s.parts) {
    const m = s.parts[k];
    if (m && m.parent !== scene) scene.add(m);
  }
  return s;
}

/**
 * Fire a breath: bolt from origin along dir, detonating dist ahead.
 * onDetonate(pos) runs once at the detonation instant (gameplay, audio).
 */
export function fireAtomicBreath(scene, origin, dir, dist, color, onDetonate) {
  const s = _slot(scene);
  s.active = true; s.t = 0; s.detonated = false;
  s.origin.copy(origin); s.dir.copy(dir).normalize();
  s.dist = dist;
  s.travel = Math.min(0.5, Math.max(0.3, dist / TRAVEL_SPEED));
  s.pos.copy(origin).addScaledVector(s.dir, dist);
  s.color.set(color);
  s.onDetonate = onDetonate;
  s.ground = Math.max(0, s.pos.y);
  for (const k in s.parts) {
    const m = s.parts[k];
    if (!m) continue;
    m.visible = false;
    m.material.uniforms.color.value.copy(s.color);
    m.material.uniforms.opacity.value = 0;
  }
  const { bolt, head } = s.parts;
  bolt.position.copy(origin);
  bolt.quaternion.copy(_q.setFromUnitVectors(_up, s.dir));
  bolt.visible = head.visible = true;
}

/** Per frame (game loop). No allocations. */
export function updateAtomicBlasts(dt) {
  for (const s of _slots) {
    if (!s.active) continue;
    s.t += dt;
    const { bolt, head, core, shell, cap } = s.parts;
    const t = s.t, tr = s.travel;
    // --- Travel: the trail grows to the head; then the trail fades out
    if (t < tr + 0.3) {
      const f = Math.min(1, t / tr);
      const len = Math.max(0.01, s.dist * f);
      const fade = t < tr ? 1 : 1 - (t - tr) / 0.3;
      bolt.scale.set(1.6, len, 1.6);
      bolt.material.uniforms.opacity.value = 0.9 * fade;
      head.position.copy(s.origin).addScaledVector(s.dir, len);
      head.scale.setScalar(3.2 + Math.sin(t * 60) * 0.4);
      head.material.uniforms.opacity.value = t < tr ? 1 : fade;
    } else if (bolt.visible) {
      bolt.visible = head.visible = false;
    }
    // --- Detonation
    const td = t - tr - BEAT;
    if (td >= 0 && !s.detonated) {
      s.detonated = true;
      core.position.copy(s.pos); core.visible = true;
      shell.position.copy(s.pos); shell.position.y = s.ground + 4; shell.visible = true;
      if (cap) { cap.position.copy(s.pos); cap.visible = true; }
      try { s.onDetonate && s.onDetonate(s.pos); } catch (e) { /* gameplay error must not stall the pool */ }
    }
    if (td < 0) continue;
    // Core: a white-hot flash that swells fast and burns out
    if (core.visible) {
      const k = td / CORE_T;
      if (k >= 1) core.visible = false;
      else {
        core.scale.setScalar(3 + 13 * (1 - (1 - k) * (1 - k)));
        core.material.uniforms.hot.value.setRGB(3, 3, 3);
        core.material.uniforms.color.value.setRGB(2.2, 2.4, 2.6);
        core.material.uniforms.opacity.value = 1 - k;
      }
    }
    // Shell: grows (ease-out) bluish-white, holds, then cools into the beam
    // colour, keeps swelling a little and dissipates
    const R = isMobile ? 26 : 32;
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
      _c.setRGB(0.85, 0.93, 1.0).lerp(s.color, Math.min(1, cool));
      shell.material.uniforms.color.value.copy(_c);
      shell.material.uniforms.hot.value.setRGB(1.6, 1.7, 1.8).lerp(s.color, cool * 0.8);
      shell.material.uniforms.opacity.value = op;
    }
    // Heat cap: a squat glowing puff rising off the blast (desktop)
    if (cap && cap.visible) {
      const k = td / CAP_T;
      if (k >= 1) cap.visible = false;
      else {
        const rr = R * (0.45 + 0.5 * k);
        cap.scale.set(rr, rr * 0.45, rr);
        cap.position.y = s.ground + R * 0.6 + k * R * 1.4;
        cap.material.uniforms.color.value.copy(s.color).multiplyScalar(0.8);
        cap.material.uniforms.hot.value.setRGB(1.4, 1.2, 0.9);
        cap.material.uniforms.opacity.value = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.15));
      }
    }
    if (!shell.visible && !core.visible && !(cap && cap.visible)) s.active = false;
  }
}

/** Hide everything (restart / game over cleanup). */
export function resetAtomicBlasts() {
  for (const s of _slots) {
    s.active = false;
    for (const k in s.parts) if (s.parts[k]) s.parts[k].visible = false;
  }
}
