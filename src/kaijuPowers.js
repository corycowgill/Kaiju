// The six newer kaiju's powers (beam / roar / charge / ultimate, and the impact
// a beam, a charge or a signature slam ends in), one element each: magma,
// abyssal water, ice, prismatic blades, roots and thorns, magnetised scrap.
// Built from the power art kit in powerVfx.js (screen-facing energy ribbons,
// instanced atlas puffs and glow cards, all three programs shared with the
// original powers and linked by the vfx prewarm) plus solid instanced matter
// (rock, ice, crystal, root, thorn, scrap) on the same lit program as the
// explosion's fragments. Everything is built once at spawn; the per-frame
// work only writes instance attributes and uniforms.
import * as THREE from 'three';
import vfx, { flipTexture, placeScorch } from './vfx.js';
import { puffs, trail, randStable as rs } from './powerVfx.js';
import { QUALITY_PROFILE, isMobile } from './quality.js';

const TAU = Math.PI * 2, PI = Math.PI;

// Gameplay numbers per kaiju: beam range / hit half-width, charge dash and
// blast radius, ultimate radius (game.js fireBeam / fireCharge / fireUltimate).
export const KAIJU_POWERS = Object.freeze({
  cindervault: { range: 205, width: 8, dash: 26, impact: 34, ult: 110 },
  brineveil: { range: 265, width: 6, dash: 38, impact: 22, ult: 124 },
  rimehorn: { range: 295, width: 5, dash: 27, impact: 34, ult: 140 },
  vesperax: { range: 230, width: 7, dash: 46, impact: 20, ult: 100 },
  thornwake: { range: 220, width: 8, dash: 29, impact: 29, ult: 136 },
  ferrumaw: { range: 320, width: 4, dash: 34, impact: 25, ult: 120 },
});

// ---------------------------------------------------------------- helpers
const cl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sm = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
// 0 before a, ramps up to b, holds to c, down to d
const env = (T, a, b, c, d) => (T <= a || T >= d ? 0 : T < b ? (T - a) / (b - a) : T <= c ? 1 : 1 - (T - c) / (d - c));
const count = (n) => Math.max(3, Math.round(n * Math.max(0.35, QUALITY_PROFILE.particleMul) * (isMobile ? 0.7 : 1)));

/** One power: a group of layers ticked on sim time, everything freed at the end. */
class KaijuFx {
  constructor(world, group, life) {
    this.world = world; this.mesh = group; this.life = life; this.maxLife = life;
    this.T = 0; this.dead = false; this.layers = [];
  }
  start() { this.world.scene.add(this.mesh); for (const f of this.layers) f(0, 0); return this; }
  tick(dt) {
    if (this.dead) return;
    this.T += dt; this.life -= dt;
    if (this.life <= 0) { this.dispose(); return; }
    for (const f of this.layers) f(this.T, dt);
  }
  dispose() {
    this.dead = true;
    this.mesh.removeFromParent();
    this.mesh.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

/** An energy ribbon along pts ([x,y,z] in parent space), revealed over `rise` from t0. */
function ribbon(fx, parent, pts, color, width, o = {}) {
  const { energy = 1, t0 = 0, rise = 0.12, hold = 0.3, fade = 0.4, op = 1, scroll = 1 } = o;
  const r = trail(parent, pts, color, width, energy);
  fx.layers.push((T) => {
    r.uniforms.time.value = T * scroll;
    r.uniforms.reveal.value = cl((T - t0) / rise) * 1.06;
    r.uniforms.opacity.value = op * env(T, t0, t0 + 0.02, t0 + rise + hold, t0 + rise + hold + fade);
  });
  return r.mesh;
}

/** Instanced puffs (atlas smoke / fire, or additive glow cards); fn fills P per puff. */
const P = { x: 0, y: 0, z: 0, w: 1, h: 1, r: 0, o: 0, f: 0 };
function cloud(fx, parent, n, opts, fn) {
  const p = puffs(parent, count(n), flipTexture, opts);
  fx.layers.push((T) => {
    for (let i = 0; i < p.n; i++) {
      P.x = P.y = P.z = 0; P.w = P.h = 1; P.r = i * 2.399; P.o = 0; P.f = 0;
      fn(i, T, P, p.n);
      p.set(i, P.x, P.y, P.z, P.w, P.h, P.r, P.o, P.f);
    }
    p.flush();
  });
  return p;
}
const glow = (color) => ({ hot: true, color });
const smoke = (color, textureWeight = 1) => ({ sheet: 'smoke_plume_8x8', color, textureWeight });
const fire = (color) => ({ sheet: 'fire_loop_8x8', color, additive: true });
const burst = (color) => ({ sheet: 'energy_burst_8x8', color, additive: true });
const dust = (color) => ({ sheet: 'dust_burst_8x8', color, textureWeight: 0.6 });

// Solid matter: unit shapes (base at the origin, growing along +y) shared by every spawn
const _geo = {};
function geo(name) {
  if (_geo[name]) return _geo[name];
  let g;
  if (name === 'rock') g = new THREE.DodecahedronGeometry(1, 0);
  else if (name === 'spike') { g = new THREE.ConeGeometry(1, 1, 5); g.translate(0, 0.5, 0); }
  else if (name === 'thorn') g = new THREE.ConeGeometry(0.5, 1, 5);
  else if (name === 'plate') g = new THREE.BoxGeometry(1, 0.14, 0.72);
  else if (name === 'crystal') {
    g = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.42, 0.06), new THREE.Vector2(0.5, 0.68), new THREE.Vector2(0, 1)], 6);
  } else if (name === 'root') {
    // A tapered tube that rises and curls over toward +z
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, 0.75, -0.05), new THREE.Vector3(0, 0.98, 0.5));
    g = new THREE.TubeGeometry(curve, 12, 0.2, 6, false);
    const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let s = 0; s <= 12; s++) {
      const u = s / 12, k = 1 - 0.88 * u;
      curve.getPoint(u, c);
      for (let r = 0; r <= 6; r++) {
        const i = s * 7 + r;
        v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(k).add(c);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
  }
  g.userData.keep = true;
  return (_geo[name] = g);
}
const _o = new THREE.Object3D();
_o.rotation.order = 'YXZ';
/** Instanced solid pieces; fn poses _o per piece (scale 0 = hidden). */
function shards(fx, parent, shape, n, mat, fn) {
  const k = count(n);
  const mesh = new THREE.InstancedMesh(geo(shape), new THREE.MeshStandardMaterial(mat), k);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'kaiju_power_matter';
  parent.add(mesh);
  fx.layers.push((T) => {
    for (let i = 0; i < k; i++) {
      _o.position.set(0, 0, 0); _o.rotation.set(0, 0, 0); _o.scale.set(1e-4, 1e-4, 1e-4);
      fn(i, T, _o, k);
      _o.updateMatrix();
      mesh.setMatrixAt(i, _o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}
/** fn() once, when the effect's clock passes t. */
function at(fx, t, fn) {
  let done = false;
  fx.layers.push((T) => { if (!done && T >= t) { done = true; fn(); } });
}
/** A piece that bursts out of the ground at (x, z), leaning out along yaw a,
 *  stands, then sinks back: grow from t0 over `rise`, gone by t1. */
function erupt(o, x, z, a, tilt, w, h, T, t0, rise, t1, sink = 0.5) {
  if (T < t0 || T > t1) return;
  const g = sm((T - t0) / rise), s = 1 - sm((T - (t1 - sink)) / sink);
  o.position.set(x, -h * 0.35 * (1 - g) - h * 0.6 * (1 - s), z);
  o.rotation.y = a; o.rotation.x = tilt;
  o.scale.set(w * (0.4 + 0.6 * g), h * g, w * (0.4 + 0.6 * g));
}
/** Ballistic point: launched at t0 from (0,y0,0) with radial speed v along a, up speed u. */
function arc(Pt, a, v, u, y0, g, t) {
  Pt.x = Math.sin(a) * v * t; Pt.z = Math.cos(a) * v * t;
  Pt.y = Math.max(0.3, y0 + u * t - 0.5 * g * t * t);
}
// a polyline turned about y by ay after rolling about z by az (and moved by dx, dy, dz)
function turn(pts, ay, az = 0, dx = 0, dy = 0, dz = 0) {
  const cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  return pts.map(([x, y, z]) => { const x1 = x * cz - y * sz, y1 = x * sz + y * cz; return [x1 * cy + z * sy + dx, y1 + dy, -x1 * sy + z * cy + dz]; });
}
function circlePts(n, r = 1, y = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; pts.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
  return pts;
}
// A crescent in the local XZ plane, bowed toward +z, spanning `span` rad of a circle of radius r
function crescentPts(r, span, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n - 0.5) * span; pts.push([Math.sin(a) * r, 0, Math.cos(a) * r - r]); }
  return pts;
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);
function group(pos, dir) {
  const g = new THREE.Group();
  g.position.copy(pos);
  if (dir) { _v.copy(dir).normalize(); g.quaternion.setFromUnitVectors(_Z, _v); }
  return g;
}
const lightning = (world, a, b, color, life = 0.4, segs = 10) => {
  const e = vfx.spawn('chainLightning', { world, a, b, color, life, segs });
  if (e) world.effects.push(e);
};

// ---------------------------------------------------------------- per element
// Each element: beam(fx, g, L), impact(fx, g, e), roar(fx, g, R), charge(fx, g, L), ult(fx, g, R).
// g is the effect's root group: beams along +z from the mouth; the rest at ground level
// (charge along +z from where the dash started). Lifetimes are the fx's.

const MAGMA = { core: 0xfff1c0, hot: 0xffa040, magma: 0xff5a1e, deep: 0xb8200c, crust: 0x2b1d17, ash: 0x463a35 };
const BASALT = { color: 0x231d1b, roughness: 0.9, metalness: 0.05, emissive: 0xff4a12, emissiveIntensity: 0.06 };
const cinder = {
  life: { beam: 1.7, impact: 2.6, roar: 3.0, charge: 2.4, ult: 4.4 },
  beam(fx, g, L) {
    const bulge = Math.min(14, L * 0.05), pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([Math.sin(u * 9) * 0.4, bulge * Math.sin(PI * u), u * L]); }
    const y = (u) => bulge * Math.sin(PI * u);
    ribbon(fx, g, pts, MAGMA.deep, 11, { rise: 0.14, hold: 0.55, fade: 0.5, op: 0.55 });
    ribbon(fx, g, pts, MAGMA.magma, 6.5, { rise: 0.12, hold: 0.55, fade: 0.45 });
    ribbon(fx, g, pts, MAGMA.core, 2.2, { rise: 0.1, hold: 0.5, fade: 0.35 });
    // a rolling sleeve of flame along the jet
    cloud(fx, g, 22, fire(0xff8a3a), (i, T, p, n) => {
      const u = (i + 0.5) / n, born = u * 0.12;
      p.x = Math.sin(i * 2.4) * 1.5; p.y = y(u) + Math.cos(i * 1.7) * 1.2; p.z = u * L;
      p.w = p.h = 7 + 4 * rs(i, 0, 1) + (T - born) * 4; p.f = (T * 32 + i * 9) % 63;
      p.o = env(T, born, born + 0.06, 0.62, 1.05) * 0.85;
    });
    // molten globs streaming down the jet
    cloud(fx, g, 46, glow(MAGMA.hot), (i, T, p) => {
      const ph = (T * 1.9 + i * 0.618) % 1, a = i * 2.4, r = 1 + 2.8 * ph;
      p.x = Math.sin(a) * r; p.y = y(ph) + Math.cos(a) * r; p.z = ph * L;
      p.w = p.h = 1.4 + rs(i, 0, 1.6); p.o = env(T, 0, 0.05, 0.6, 0.95) * 0.9;
    });
    // ash and smoke boiling off it
    cloud(fx, g, 26, smoke(MAGMA.ash), (i, T, p, n) => {
      const u = (i + 0.5) / n, age = T - u * 0.12;
      if (age < 0) return;
      p.x = Math.sin(i * 3.1) * (1 + age * 3); p.y = y(u) + 2 + age * 7; p.z = u * L;
      p.w = p.h = 4 + age * 7; p.f = Math.min(62, 6 + age * 30); p.o = Math.min(1, age * 6) * cl((1.7 - T) / 0.9) * 0.5;
    });
    // drips falling out of it
    cloud(fx, g, 20, glow(MAGMA.magma), (i, T, p, n) => {
      const u = (i + 0.5) / n, age = T - 0.08 - u * 0.15;
      if (age < 0) return;
      p.x = Math.sin(i * 5.3) * 2; p.z = u * L; p.y = y(u) - 14 * age * age;
      p.w = 0.9; p.h = 2.4; p.r = 0; p.o = cl(1 - age / 1.1) * 0.9;
    });
  },
  impact(fx, g, e, world) {
    const s = e / 16;
    at(fx, 0, () => { world.spawnExplosion?.(g.position.clone(), Math.min(3, 1.1 * s)); placeScorch(world, g.position, Math.min(16, e * 0.6)); });
    cloud(fx, g, 30, glow(MAGMA.hot), (i, T, p) => {
      const t = Math.min(T, 1.6), a = i * 2.399;
      arc(p, a, rs(i, 5, 15) * s, rs(i, 10, 24) * Math.sqrt(s), 1, 34, t);
      p.w = p.h = rs(i, 0.8, 1.9) * Math.sqrt(s); p.o = cl(1 - T / 1.7) * 0.95;
    });
    cloud(fx, g, 10, fire(0xff7a2a), (i, T, p) => {
      const a = i * 2.399, r = rs(i, 0.2, 0.55) * e;
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 1.2 * s;
      p.w = 5 * s; p.h = 3.6 * s; p.f = (T * 30 + i * 7) % 63; p.o = env(T, 0, 0.1, 1.4, 2.5) * 0.75;
    });
    cloud(fx, g, 14, smoke(MAGMA.ash), (i, T, p) => {
      const age = T - 0.1 - i * 0.03, a = i * 2.399;
      if (age < 0) return;
      p.x = Math.sin(a) * (2 + age * 3) * s; p.z = Math.cos(a) * (2 + age * 3) * s; p.y = (3 + age * 9) * s;
      p.w = p.h = (4 + age * 6) * s; p.f = Math.min(62, 8 + age * 24); p.o = Math.min(1, age * 5) * cl((2.6 - T) / 1.2) * 0.55;
    });
    shards(fx, g, 'rock', 12, BASALT, (i, T, o) => {
      const t = Math.min(T, 1.4), a = i * 2.399 + 0.4;
      arc(o.position, a, rs(i, 4, 11) * s, rs(i, 9, 20) * Math.sqrt(s), 1, 34, t);
      o.rotation.set(T * 5 + i, T * 3 + i * 2, 0);
      o.scale.setScalar(rs(i, 0.7, 1.7) * Math.sqrt(s) * (1 - sm((T - 2) / 0.6)));
    });
    if (e >= 20) cinder.spikes(fx, g, 9, e * 0.25, e * 0.75, e * 0.55, 0, 0.05, 2.0);
  },
  // basalt columns punched up through the street
  spikes(fx, g, n, r0, r1, h, t0, spread, t1) {
    shards(fx, g, 'spike', n, BASALT, (i, T, o) => {
      const a = i * 2.399 + 0.3, r = rs(i, r0, r1), d = t0 + (r / r1) * spread * 4;
      erupt(o, Math.sin(a) * r, Math.cos(a) * r, a, rs(i, 0.2, 0.55), rs(i, 0.16, 0.26) * h, rs(i, 0.6, 1) * h, T, d, 0.16, t1 + d * 0.5);
    });
  },
  cracks(fx, g, n, R, t0, w, c1 = MAGMA.hot, c2 = MAGMA.magma) {
    const lines = [[], []];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rs(k, -0.25, 0.25), pts = [];
      for (let j = 0; j <= 10; j++) {
        const r = (j / 10) * R * rs(k + 7, 0.75, 1), b = a + Math.sin(j * 2.1 + k) * 0.07;
        pts.push([Math.sin(b) * r, 0.5, Math.cos(b) * r]);
      }
      lines[k % 2].push(pts);
    }
    ribbon(fx, g, lines[0], c1, w, { t0, rise: 0.35, hold: 1.3, fade: 0.9, op: 0.9 });
    ribbon(fx, g, lines[1], c2, w, { t0, rise: 0.35, hold: 1.3, fade: 0.9, op: 0.9 });
  },
  roar(fx, g, R, world) {
    at(fx, 0, () => { world.spawnExplosion?.(g.position.clone().setY(4), 1.8); world.spawnShockwave?.(g.position.clone(), MAGMA.magma, R); });
    cinder.cracks(fx, g, 9, R, 0, 2.6);
    const K = 9;
    // lava fountains bursting up in a ring that runs outward
    const gr = Array.from({ length: K }, (_, k) => { const r = R * rs(k, 0.35, 0.92); return { a: (k / K) * TAU + rs(k, -0.3, 0.3), r, d: 0.05 + (r / R) * 0.4 }; });
    cloud(fx, g, K * 5, fire(0xff7a2a), (i, T, p) => {
      const q = gr[i % K], j = Math.floor(i / K), age = T - q.d - j * 0.05;
      if (age < 0) return;
      p.x = Math.sin(q.a) * q.r; p.z = Math.cos(q.a) * q.r;
      p.y = 3 + j * 6 + age * 14; p.w = p.h = 9 - j + age * 4; p.f = (T * 34 + i * 5) % 63;
      p.o = env(age, 0, 0.08, 0.8, 1.5) * 0.9;
    });
    cloud(fx, g, K * 5, glow(MAGMA.hot), (i, T, p) => {
      const q = gr[i % K], age = T - q.d;
      if (age < 0) return;
      const t = Math.min(age, 1.8);
      arc(p, q.a + rs(i, -0.6, 0.6), rs(i, 2, 9), rs(i, 18, 34), 1, 30, t);
      p.x += Math.sin(q.a) * q.r; p.z += Math.cos(q.a) * q.r;
      p.w = p.h = rs(i, 1.2, 2.4); p.o = cl(1 - age / 1.9);
    });
    cloud(fx, g, 32, smoke(MAGMA.ash), (i, T, p) => {
      const a = i * 2.399, age = T - 0.1;
      if (age < 0) return;
      const r = R * (1 - Math.exp(-age * 2.4)) * rs(i, 0.5, 1);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 4 + age * 8;
      p.w = p.h = 10 + age * 6; p.f = Math.min(62, 10 + age * 20); p.o = Math.min(1, age * 4) * cl((3 - T) / 1.3) * 0.55;
    });
    cinder.spikes(fx, g, 12, R * 0.3, R * 0.95, 20, 0.05, 0.1, 2.1);
  },
  charge(fx, g, L) {
    ribbon(fx, g, [[[-5, 6, -2], [-3, 6, L * 0.5], [0, 6, L]], [[0, 15, -2], [0, 15, L * 0.5], [0, 15, L]]], MAGMA.magma, 4.5, { rise: 0.22, hold: 0.15, fade: 0.45, op: 0.85 });
    ribbon(fx, g, [[5, 9, -2], [3, 9, L * 0.5], [0, 9, L]], MAGMA.hot, 3, { rise: 0.22, hold: 0.15, fade: 0.45, op: 0.85 });
    // a molten scar where it ran
    cloud(fx, g, 16, fire(0xff6a20), (i, T, p, n) => {
      const z = ((i + 0.5) / n) * L, t0 = (z / L) * 0.22;
      p.x = Math.sin(i * 2.7) * 3; p.z = z; p.y = 1.2;
      p.w = 7; p.h = 4; p.f = (T * 30 + i * 11) % 63; p.o = env(T, t0, t0 + 0.05, 1.3, 2.3) * 0.8;
    });
    cloud(fx, g, 22, smoke(MAGMA.ash), (i, T, p, n) => {
      const z = ((i + 0.5) / n) * L, age = T - (z / L) * 0.22;
      if (age < 0) return;
      p.x = Math.sin(i * 2.1) * (3 + age * 4); p.z = z; p.y = 3 + age * 6;
      p.w = p.h = 6 + age * 6; p.f = Math.min(62, 8 + age * 24); p.o = Math.min(1, age * 5) * cl((2.4 - T) / 1.1) * 0.5;
    });
    shards(fx, g, 'rock', 14, BASALT, (i, T, o, n) => {
      const z = ((i + 0.5) / n) * L, age = T - (z / L) * 0.22;
      if (age < 0) return;
      const t = Math.min(age, 1.3), side = i % 2 ? 1 : -1;
      o.position.set(side * (4 + rs(i, 6, 14) * t), Math.max(0.5, 2 + rs(i, 12, 22) * t - 17 * t * t), z + rs(i, 0, 8) * t);
      o.rotation.set(T * 6 + i, T * 4, 0);
      o.scale.setScalar(rs(i, 0.8, 1.8) * (1 - sm((T - 1.8) / 0.5)));
    });
  },
  ult(fx, g, R, world) {
    at(fx, 0, () => { world.spawnExplosion?.(g.position.clone().setY(8), 3); placeScorch(world, g.position, 24); world.spawnShockwave?.(g.position.clone(), MAGMA.magma, R); });
    cinder.cracks(fx, g, 14, R, 0.05, 3.4);
    // the eruption column and its ash crown
    cloud(fx, g, 26, fire(0xffa040), (i, T, p) => {
      const age = T - i * 0.04, a = i * 2.399;
      if (age < 0) return;
      p.x = Math.sin(a) * (3 + age * 2); p.z = Math.cos(a) * (3 + age * 2); p.y = 6 + age * 26;
      p.w = p.h = 14 + age * 6; p.f = (T * 30 + i * 7) % 63; p.o = env(age, 0, 0.1, 1.2, 2.2) * 0.95;
    });
    cloud(fx, g, 60, smoke(0x3a302c), (i, T, p) => {
      const crown = i % 3 !== 0, d = rs(i, 0.15, 0.6), age = T - d;
      if (age < 0) return;
      const a = i * 2.399 + age * 0.2, r = crown ? 8 + age * 12 : 4;
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = crown ? 40 + age * 14 + Math.sin(a * 3) * 6 : 8 + (i / 60) * age * 40;
      p.w = p.h = (crown ? 18 : 12) + age * 8; p.f = Math.min(62, 6 + age * 16);
      p.o = Math.min(1, age * 3) * cl((4.4 - T) / 1.6) * 0.55;
    });
    // lava bombs raining over the whole radius; each one bursts where it lands
    const NB = 28, bombs = Array.from({ length: NB }, (_, k) => ({ a: rs(k, 0, TAU), r: R * rs(k + 3, 0.25, 0.95), d: rs(k + 9, 0.1, 1.0), fl: rs(k + 5, 0.9, 1.5), h: rs(k + 2, 40, 75), hit: false }));
    let booms = 0;
    cloud(fx, g, NB, glow(MAGMA.hot), (i, T, p) => {
      const b = bombs[i], u = (T - b.d) / b.fl;
      if (u < 0 || u > 1) {
        if (u > 1 && !b.hit) { b.hit = true; if (booms++ < (isMobile ? 4 : 9)) world.spawnExplosion?.(new THREE.Vector3(Math.sin(b.a) * b.r, 0.5, Math.cos(b.a) * b.r).add(g.position), 0.9); }
        return;
      }
      p.x = Math.sin(b.a) * b.r * u; p.z = Math.cos(b.a) * b.r * u; p.y = 20 + 4 * b.h * u * (1 - u) - 20 * u;
      p.w = p.h = 3.4; p.o = 1;
    });
    cloud(fx, g, NB * 2, glow(MAGMA.magma), (i, T, p) => {
      const b = bombs[i % NB], u = (T - b.d - 0.05 * (1 + (i >= NB))) / b.fl;
      if (u < 0 || u > 1) return;
      p.x = Math.sin(b.a) * b.r * u; p.z = Math.cos(b.a) * b.r * u; p.y = 20 + 4 * b.h * u * (1 - u) - 20 * u;
      p.w = p.h = 2.2; p.o = 0.6;
    });
    cinder.spikes(fx, g, 30, R * 0.2, R * 0.95, 34, 0.1, 0.18, 3.2);
  },
};

const SEA = { core: 0xeafffb, teal: 0x39dfd7, deep: 0x1c6fb0, foam: 0xd6f2f0, lum: 0x61ffe1, abyss: 0x0d3c5a };
const brine = {
  life: { beam: 1.5, impact: 2.2, roar: 2.4, charge: 1.8, ult: 4.4 },
  beam(fx, g, L) {
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], SEA.deep, 14, { rise: 0.1, hold: 0.45, fade: 0.4, op: 0.5 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], SEA.teal, 6.5, { rise: 0.09, hold: 0.45, fade: 0.4 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], SEA.core, 2.4, { rise: 0.08, hold: 0.42, fade: 0.3 });
    // a churning double helix of current around the jet
    for (let k = 0; k < 2; k++) {
      const pts = [];
      for (let i = 0; i <= 80; i++) { const u = i / 80, a = u * L * 0.16 + k * PI, r = 2.6 + u * 1.5; pts.push([Math.sin(a) * r, Math.cos(a) * r, u * L]); }
      const m = ribbon(fx, g, pts, k ? SEA.lum : SEA.foam, 1.3, { rise: 0.12, hold: 0.42, fade: 0.4, op: 0.9 });
      fx.layers.push((T) => { m.rotation.z = T * 9 * (k ? 1 : -1); });
    }
    cloud(fx, g, 30, smoke(SEA.foam, 0.9), (i, T, p, n) => {
      const u = (i + 0.5) / n, age = T - u * 0.1;
      if (age < 0) return;
      const a = i * 2.399, r = 1 + age * 7;
      p.x = Math.sin(a) * r; p.y = Math.cos(a) * r * 0.6 + age * 3; p.z = u * L + age * 10;
      p.w = p.h = 3 + age * 8; p.f = Math.min(62, 4 + age * 40); p.o = Math.min(1, age * 8) * cl((1.4 - T) / 0.7) * 0.42;
    });
    cloud(fx, g, 44, glow(SEA.foam), (i, T, p) => {
      const ph = (T * 3.1 + i * 0.618) % 1, a = i * 2.4, r = 1 + 2.5 * rs(i, 0, 1);
      p.x = Math.sin(a) * r; p.y = Math.cos(a) * r; p.z = ph * L;
      p.w = 0.5; p.h = 2.2; p.r = a; p.o = env(T, 0, 0.04, 0.5, 0.8) * 0.85;
    });
    cloud(fx, g, 18, glow(SEA.lum), (i, T, p, n) => {
      const u = (i + 0.5) / n, a = i * 2.399 + T * 1.5;
      p.x = Math.sin(a) * 6; p.y = Math.cos(a) * 4; p.z = u * L;
      p.w = p.h = 1.3; p.o = env(T, 0.05, 0.2, 0.9, 1.5) * (0.5 + 0.5 * Math.sin(T * 12 + i));
    });
  },
  impact(fx, g, e) {
    const s = e / 16;
    cloud(fx, g, 1, burst(SEA.teal), (i, T, p) => { p.y = 3 * s; p.w = p.h = 18 * s; p.f = Math.min(63, T * 70); p.o = cl(1 - T / 0.8); });
    cloud(fx, g, 26, smoke(SEA.foam, 0.9), (i, T, p) => {
      const a = i * 2.399, t = Math.min(T, 1.6);
      arc(p, a, rs(i, 3, 9) * s, rs(i, 14, 28) * Math.sqrt(s), 1, 22, t);
      p.w = p.h = (3 + T * 6) * s; p.f = Math.min(62, T * 40); p.o = Math.min(1, T * 12) * cl((2.2 - T) / 1) * 0.55;
    });
    cloud(fx, g, 34, glow(SEA.foam), (i, T, p) => {
      const a = i * 2.399, t = Math.min(T, 1.4);
      arc(p, a, rs(i, 4, 14) * s, rs(i, 12, 30) * Math.sqrt(s), 1, 30, t);
      p.w = 0.6 * Math.sqrt(s); p.h = 1.6 * Math.sqrt(s); p.o = cl(1 - T / 1.4);
    });
    // a ring of spray running out along the ground
    cloud(fx, g, 22, smoke(0xc4ece9, 0.9), (i, T, p) => {
      const a = (i / 22) * TAU, r = e * (0.3 + 0.9 * (1 - Math.exp(-T * 3)));
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 * s + T * 2;
      p.w = 6 * s; p.h = 4 * s; p.f = Math.min(62, T * 30); p.o = cl(1 - T / 1.6) * 0.5;
    });
    if (e >= 20) brine.spout(fx, g, 0, e * 1.6, 1.6);
  },
  // a column of water thrown straight up
  spout(fx, g, t0, H, dur) {
    cloud(fx, g, 26, smoke(SEA.foam, 0.9), (i, T, p) => {
      const age = T - t0 - (i % 6) * 0.03;
      if (age < 0) return;
      const u = i / 26, top = Math.min(1, age * 3) * H * u, fall = Math.max(0, age - dur * 0.5) * 10;
      p.x = Math.sin(i * 2.4) * (2 + age * 2); p.z = Math.cos(i * 2.4) * (2 + age * 2); p.y = Math.max(1, top - fall);
      p.w = p.h = 7 + age * 4; p.f = Math.min(62, age * 30); p.o = env(age, 0, 0.1, dur * 0.6, dur) * 0.7;
    });
  },
  ringWave(fx, g, R, t0, dur, h) {
    cloud(fx, g, 72, smoke(SEA.foam, 0.9), (i, T, p) => {
      const age = T - t0;
      if (age < 0) return;
      const layer = i % 3, a = (i / 72) * TAU * 3 + layer, r = R * (1 - Math.pow(1 - cl(age / dur), 2.2));
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + layer * h * 0.35 + Math.sin(cl(age / dur) * PI) * h * 0.3;
      p.w = 15 + layer * 3; p.h = 11 + layer * 3; p.f = Math.min(62, age * 34); p.o = env(age, 0, 0.08, dur * 0.55, dur) * 0.6;
    });
    for (let k = 0; k < 2; k++) {
      const m = ribbon(fx, g, circlePts(48, 1, 0.6), k ? SEA.lum : SEA.teal, 2.2, { t0: t0 + k * 0.08, rise: 0.01, hold: dur * 0.5, fade: dur * 0.5, op: 0.85 });
      fx.layers.push((T) => { const r = Math.max(0.01, R * (1 - Math.pow(1 - cl((T - t0 - k * 0.08) / dur), 2.2))); m.scale.set(r, 1, r); });
    }
  },
  roar(fx, g, R, world) {
    at(fx, 0.28, () => world.spawnShockwave?.(g.position.clone(), SEA.teal, R));
    // the water pulled in, then the pressure released
    cloud(fx, g, 24, smoke(SEA.foam, 0.9), (i, T, p) => {
      const a = (i / 24) * TAU + T * 2, r = R * 0.55 * (1 - cl(T / 0.3));
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 3 + (i % 3) * 3;
      p.w = p.h = 6; p.f = 10 + T * 30; p.o = env(T, 0, 0.06, 0.22, 0.32) * 0.55;
    });
    cloud(fx, g, 1, burst(SEA.teal), (i, T, p) => { p.y = 10; p.w = p.h = 46; p.f = Math.min(63, Math.max(0, T - 0.26) * 60); p.o = env(T, 0.26, 0.3, 0.5, 1.1); });
    brine.ringWave(fx, g, R, 0.28, 1.4, 22);
    cloud(fx, g, 36, glow(SEA.lum), (i, T, p) => {
      const age = T - 0.28, a = i * 2.399 + T * 0.8;
      if (age < 0) return;
      const r = R * rs(i, 0.2, 1) * cl(age * 1.5);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + rs(i, 0, 14) + age * 3;
      p.w = p.h = 1.4; p.o = env(age, 0, 0.1, 1.2, 2) * (0.6 + 0.4 * Math.sin(T * 10 + i));
    });
  },
  charge(fx, g, L) {
    for (let k = 0; k < 2; k++) {
      const pts = [];
      for (let i = 0; i <= 60; i++) { const u = i / 60, a = u * 8 + k * PI; pts.push([Math.sin(a) * 6, 9 + Math.cos(a) * 6, u * L]); }
      ribbon(fx, g, pts, k ? SEA.lum : SEA.foam, 2.2, { rise: 0.24, hold: 0.25, fade: 0.5, op: 0.9 });
    }
    ribbon(fx, g, [[0, 9, 0], [0, 9, L]], SEA.teal, 6, { rise: 0.24, hold: 0.2, fade: 0.4, op: 0.5 });
    // spray thrown off both sides of the wake
    cloud(fx, g, 34, smoke(SEA.foam, 0.9), (i, T, p, n) => {
      const z = ((i >> 1) / (n >> 1)) * L, age = T - (z / L) * 0.24, side = i % 2 ? 1 : -1;
      if (age < 0) return;
      p.x = side * (5 + age * 9); p.z = z; p.y = 2 + age * 10 - 6 * age * age;
      p.w = p.h = 5 + age * 6; p.f = Math.min(62, age * 36); p.o = Math.min(1, age * 10) * cl((1.6 - T) / 0.7) * 0.55;
    });
    cloud(fx, g, 30, glow(SEA.foam), (i, T, p, n) => {
      const z = (i / n) * L, age = T - (z / L) * 0.24;
      if (age < 0 || age > 1) return;
      arc(p, (i % 2 ? 1 : -1) * rs(i, 1.1, 2), rs(i, 6, 14), rs(i, 10, 18), 3, 30, age);
      p.z += z; p.w = 0.6; p.h = 1.8; p.o = 1 - age;
    });
  },
  ult(fx, g, R, world) {
    // a whirlpool winding the city in, a spout, then the sea let go
    const arms = 6, lines = [[], []];
    for (let k = 0; k < arms; k++) {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const u = i / 40, a = (k / arms) * TAU + u * 4.2; pts.push([Math.sin(a) * R * u, 0.8, Math.cos(a) * R * u]); }
      lines[k % 2].push(pts);
    }
    for (let k = 0; k < 2; k++) {
      const m = ribbon(fx, g, lines[k], k ? SEA.teal : SEA.lum, 3.6, { rise: 0.35, hold: 1.4, fade: 0.4, op: 0.9 });
      fx.layers.push((T) => { m.rotation.y = -T * 1.8; const s = 1 - 0.75 * sm(T / 1.9); m.scale.set(s, 1, s); });
    }
    cloud(fx, g, 56, smoke(SEA.foam, 0.9), (i, T, p) => {
      const u = rs(i, 0.15, 1), a = i * 2.399 + T * (2.6 - u), r = R * u * (1 - 0.7 * sm(T / 1.9));
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + (i % 4) * 3;
      p.w = p.h = 8 + (i % 3) * 3; p.f = (10 + T * 18) % 62; p.o = env(T, 0, 0.3, 1.7, 2.1) * 0.55;
    });
    brine.spout(fx, g, 1.5, 85, 2.4);
    at(fx, 1.9, () => { world.spawnShockwave?.(g.position.clone(), SEA.teal, R * 1.05); world.shake?.(1.6, 0.6); });
    brine.ringWave(fx, g, R * 1.05, 1.9, 1.6, 30);
    cloud(fx, g, 60, glow(SEA.lum), (i, T, p) => {
      const u = rs(i, 0.1, 1), a = i * 2.399 + T * (3 - u * 1.5), r = T < 1.9 ? R * u * (1 - 0.8 * sm(T / 1.9)) : R * u * (0.2 + 0.9 * sm((T - 1.9) / 1.2));
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + rs(i, 0, 20);
      p.w = p.h = 1.6; p.o = env(T, 0, 0.3, 3.4, 4.3) * (0.6 + 0.4 * Math.sin(T * 9 + i));
    });
  },
};

const ICE = { core: 0xffffff, pale: 0xd9f1ff, blue: 0x73baff, deep: 0x2f6fd0, snow: 0xf2f8ff };
const ICEMAT = { color: 0xcdeeff, roughness: 0.12, metalness: 0.1, emissive: 0x3d8fd8, emissiveIntensity: 0.3 };
const rime = {
  life: { beam: 2.8, impact: 2.8, roar: 3.2, charge: 3.0, ult: 4.8 },
  // ice spires out of the ground (in g's frame), each leaning out from (cx, cz)
  spires(fx, g, pts, o2) {
    const { rise = 0.14, t1 = 2.3, sink = 0.5, mat = ICEMAT } = o2;
    shards(fx, g, 'crystal', pts.length, mat, (i, T, o) => {
      const q = pts[i];
      if (!q) return;
      erupt(o, q.x, q.z, q.a, q.tilt, q.w, q.h, T, q.d, rise, t1 + q.d * 0.4, sink);
    });
  },
  ring(n, r0, r1, h0, h1, d0, dPer, seed = 0) {
    return Array.from({ length: n }, (_, i) => {
      const a = rs(i + seed, 0, TAU), r = rs(i + seed + 11, r0, r1), h = rs(i + seed + 3, h0, h1);
      return { x: Math.sin(a) * r, z: Math.cos(a) * r, a, tilt: rs(i + seed + 5, 0.15, 0.6), w: h * rs(i + 4, 0.22, 0.34), h, d: d0 + (r / Math.max(1, r1)) * dPer };
    });
  },
  beam(fx, g, L, world, origin, dir) {
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], ICE.deep, 10, { rise: 0.12, hold: 0.5, fade: 0.5, op: 0.45 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], ICE.blue, 4.2, { rise: 0.11, hold: 0.5, fade: 0.45 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], ICE.core, 1.6, { rise: 0.1, hold: 0.48, fade: 0.35 });
    cloud(fx, g, 34, glow(ICE.snow), (i, T, p) => {
      const ph = (T * 1.4 + i * 0.618) % 1, a = i * 2.4 + T * 4, r = 2 + 3 * rs(i, 0, 1);
      p.x = Math.sin(a) * r; p.y = Math.cos(a) * r; p.z = ph * L;
      p.w = p.h = 0.9 + 0.6 * Math.sin(T * 20 + i); p.o = env(T, 0, 0.05, 0.6, 1.0) * 0.9;
    });
    // frost vapour hanging where it passed
    cloud(fx, g, 28, smoke(ICE.pale, 0.55), (i, T, p, n) => {
      const u = (i + 0.5) / n, age = T - u * 0.11;
      if (age < 0) return;
      p.x = Math.sin(i * 3.3) * (1.5 + age * 2.5); p.y = Math.cos(i * 2.1) * (1 + age) - age * 2; p.z = u * L;
      p.w = p.h = 4 + age * 4; p.f = Math.min(62, 6 + age * 18); p.o = Math.min(1, age * 6) * cl((2.8 - T) / 1.4) * 0.45;
    });
    // and a line of ice spikes grown up out of the street beneath it
    const ground = new THREE.Group();
    ground.position.set(origin.x, 0, origin.z);
    const yaw = Math.atan2(dir.x, dir.z), flat = Math.hypot(dir.x, dir.z) || 1, pts = [];
    for (let i = 0; i < 16; i++) {
      const u = 0.12 + (i / 16) * 0.88, along = u * L * flat, side = (i % 2 ? 1 : -1) * rs(i, 2, 7);
      const h = rs(i + 2, 7, 15) * (0.6 + 0.4 * u);
      pts.push({ x: Math.sin(yaw) * along + Math.cos(yaw) * side, z: Math.cos(yaw) * along - Math.sin(yaw) * side, a: yaw + (side > 0 ? PI / 2 : -PI / 2), tilt: rs(i, 0.2, 0.5), w: h * 0.3, h, d: u * 0.12 });
    }
    fx.mesh.add(ground); // (the effect's root: world space)
    rime.spires(fx, ground, pts, { t1: 2.2, sink: 0.6 });
  },
  impact(fx, g, e) {
    const s = e / 16;
    rime.spires(fx, g, rime.ring(e >= 20 ? 14 : 9, 0.5, e * 0.7, 5 * s, 11 * s, 0, 0.12), { t1: 2.1 });
    cloud(fx, g, 20, smoke(ICE.pale, 0.5), (i, T, p) => {
      const a = i * 2.399, r = e * (0.2 + 0.8 * (1 - Math.exp(-T * 3))) * rs(i, 0.4, 1);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + T * 3;
      p.w = p.h = (5 + T * 5) * s; p.f = Math.min(62, T * 24); p.o = Math.min(1, T * 10) * cl((2.6 - T) / 1.2) * 0.5;
    });
    cloud(fx, g, 28, glow(ICE.snow), (i, T, p) => {
      const t = Math.min(T, 1.5);
      arc(p, i * 2.399, rs(i, 4, 12) * s, rs(i, 8, 22) * Math.sqrt(s), 1, 26, t);
      p.w = p.h = 0.9 * Math.sqrt(s); p.o = cl(1 - T / 1.6) * (0.6 + 0.4 * Math.sin(T * 25 + i));
    });
    cloud(fx, g, 1, burst(ICE.blue), (i, T, p) => { p.y = 4 * s; p.w = p.h = 16 * s; p.f = Math.min(63, T * 70); p.o = cl(1 - T / 0.8); });
  },
  blizzard(fx, g, R, t0, dur, n, h) {
    cloud(fx, g, n, smoke(ICE.snow, 0.6), (i, T, p) => {
      const age = T - t0;
      if (age < 0) return;
      const layer = i % 3, f = 1 - Math.pow(1 - cl(age / dur), 2), a = i * 2.399 + age * 1.3, r = R * f * rs(i, 0.75, 1.05);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 3 + layer * h * 0.35;
      p.w = p.h = 11 + layer * 3 + age * 3; p.f = Math.min(62, 8 + age * 18); p.o = env(age, 0, 0.12, dur * 0.7, dur * 1.25) * 0.55;
    });
    cloud(fx, g, n, glow(ICE.snow), (i, T, p) => {
      const age = T - t0;
      if (age < 0) return;
      const a = i * 2.399 + age * 2.2, r = R * cl(age / dur) * rs(i, 0.3, 1.05);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = rs(i, 1, h * 1.2);
      p.w = p.h = 0.9; p.o = env(age, 0, 0.1, dur, dur * 1.3);
    });
  },
  roar(fx, g, R) {
    cloud(fx, g, 1, burst(ICE.blue), (i, T, p) => { p.y = 10; p.w = p.h = 40; p.f = Math.min(63, T * 60); p.o = cl(1 - T / 1); });
    rime.blizzard(fx, g, R, 0, 1.6, 54, 20);
    rime.spires(fx, g, rime.ring(22, R * 0.3, R * 0.95, 7, 16, 0.05, 0.5, 4), { t1: 2.5 });
    const m = ribbon(fx, g, circlePts(48, 1, 0.6), ICE.pale, 2.6, { rise: 0.01, hold: 0.8, fade: 0.8, op: 0.8 });
    fx.layers.push((T) => { const r = Math.max(0.01, R * (1 - Math.pow(1 - cl(T / 1.2), 2))); m.scale.set(r, 1, r); });
  },
  charge(fx, g, L) {
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const z = ((i >> 1) / 9) * L + 4, side = i % 2 ? 1 : -1, h = rs(i, 7, 15);
      pts.push({ x: side * rs(i + 1, 6, 11), z, a: side * PI / 2, tilt: rs(i, 0.3, 0.6), w: h * 0.3, h, d: (z / L) * 0.22 });
    }
    rime.spires(fx, g, pts, { t1: 2.4, sink: 0.6 });
    ribbon(fx, g, [[[-4, 7, -3], [-4, 7, L]], [[0, 17, -3], [0, 17, L]]], ICE.pale, 3, { rise: 0.22, hold: 0.15, fade: 0.4, op: 0.8 });
    ribbon(fx, g, [[4, 12, -3], [4, 12, L]], ICE.blue, 3, { rise: 0.22, hold: 0.15, fade: 0.4, op: 0.8 });
    cloud(fx, g, 30, smoke(ICE.snow, 0.6), (i, T, p, n) => {
      const z = (i / n) * L, age = T - (z / L) * 0.22, side = i % 2 ? 1 : -1;
      if (age < 0) return;
      p.x = side * (4 + age * 7); p.z = z; p.y = 2 + age * 5;
      p.w = p.h = 6 + age * 5; p.f = Math.min(62, 6 + age * 20); p.o = Math.min(1, age * 8) * cl((2.8 - T) / 1.2) * 0.5;
    });
  },
  ult(fx, g, R, world) {
    at(fx, 0, () => world.spawnShockwave?.(g.position.clone(), ICE.blue, R));
    cloud(fx, g, 1, burst(ICE.pale), (i, T, p) => { p.y = 16; p.w = p.h = 80; p.f = Math.min(63, T * 50); p.o = cl(1 - T / 1.3); });
    // three waves of glacier spires, each further out and taller
    rime.spires(fx, g, [...rime.ring(14, R * 0.15, R * 0.4, 14, 26, 0.05, 0.25, 1), ...rime.ring(16, R * 0.4, R * 0.7, 18, 34, 0.35, 0.35, 21),
      ...rime.ring(16, R * 0.7, R, 20, 40, 0.7, 0.4, 41)], { t1: 3.4, sink: 0.7, rise: 0.2 });
    rime.blizzard(fx, g, R * 1.05, 0.1, 2.6, 70, 34);
    cloud(fx, g, 30, smoke(ICE.pale, 0.55), (i, T, p) => {
      const a = i * 2.399, r = R * rs(i, 0.1, 1);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2;
      p.w = 18; p.h = 7; p.f = (10 + T * 10) % 62; p.o = env(T, 0.4 + (r / R) * 0.8, 1.2 + (r / R) * 0.8, 3.6, 4.8) * 0.45;
    });
  },
};

const PRISM = { violet: 0xbe62ff, pink: 0xff6ad5, cyan: 0x6ae8ff, white: 0xf6e2ff, deep: 0x7a2fd0 };
const RAINBOW = [PRISM.violet, PRISM.pink, PRISM.cyan, PRISM.white, 0xffd36a];
const AMETHYST = { color: 0x8a52d6, roughness: 0.18, metalness: 0.3, emissive: 0x7a2fd0, emissiveIntensity: 0.35 };
const vesp = {
  life: { beam: 1.1, impact: 2.0, roar: 2.4, charge: 1.3, ult: 3.8 },
  // scythe crescents, baked into one mesh per colour: each [r, span, roll, dx, dy, dz, upright]
  blades(fx, parent, list, c1, c2, o) {
    const outer = [], inner = [];
    for (const [r, span, roll, dx = 0, dy = 0, dz = 0, upright = false] of list) {
      const shape = (rr, sp) => (upright ? crescentPts(rr, sp).map(([x, , z]) => [x, -z, 0]) : crescentPts(rr, sp));
      outer.push(turn(shape(r, span), 0, roll, dx, dy, dz));
      inner.push(turn(shape(r * 0.97, span * 0.9), 0, roll, dx, dy, dz));
    }
    const w = list[0][0];
    return [ribbon(fx, parent, outer, c1, w * 0.3, o), ribbon(fx, parent, inner, c2, w * 0.09, o)];
  },
  glints(fx, g, n, fn) {
    const p = cloud(fx, g, n, glow(0xffffff), fn);
    for (let i = 0; i < p.n; i++) p.tint(i, RAINBOW[i % RAINBOW.length]);
  },
  beam(fx, g, L) {
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], PRISM.deep, 7, { rise: 0.06, hold: 0.32, fade: 0.35, op: 0.5 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], PRISM.violet, 3, { rise: 0.06, hold: 0.32, fade: 0.3 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], PRISM.white, 1.1, { rise: 0.05, hold: 0.3, fade: 0.25 });
    // the light split into a fan of colours
    ribbon(fx, g, [[[0, 0, 0], [-0.06 * L, -0.02 * L, L]], [[0, 0, 0], [0.06 * L, 0.02 * L, L]]], PRISM.pink, 1.3, { rise: 0.08, hold: 0.28, fade: 0.3, op: 0.85 });
    ribbon(fx, g, [[0, 0, 0], [0, 0.035 * L, L]], PRISM.cyan, 1.3, { rise: 0.08, hold: 0.28, fade: 0.3, op: 0.85 });
    // three scythe crescents riding the beam, one behind the other
    const rider = new THREE.Group();
    g.add(rider);
    vesp.blades(fx, rider, [[10, 1.9, 0, 0, 0, 0], [9, 1.8, 0.9, 0, 0, -24], [9, 1.8, -0.9, 0, 0, -48]], PRISM.violet, PRISM.white, { rise: 0.04, hold: 0.55, fade: 0.2, op: 0.95 });
    fx.layers.push((T) => { rider.position.z = Math.min(L + 48, T * 340); rider.visible = rider.position.z < L + 40; });
    vesp.glints(fx, g, 40, (i, T, p) => {
      const u = rs(i, 0, 1), a = i * 2.4;
      p.x = Math.sin(a) * rs(i, 1, 4) + u * L * (i % 3 - 1) * 0.04; p.y = Math.cos(a) * rs(i, 1, 4); p.z = u * L;
      p.w = p.h = 1.2 * (0.4 + 0.6 * Math.abs(Math.sin(T * 30 + i))); p.o = env(T, u * 0.1, u * 0.1 + 0.03, 0.5, 0.9);
    });
  },
  impact(fx, g, e) {
    const s = e / 16;
    shards(fx, g, 'crystal', e >= 20 ? 13 : 9, AMETHYST, (i, T, o) => {
      const a = i * 2.399, r = rs(i, 0.1, 0.55) * e, h = rs(i, 5, 11) * s;
      erupt(o, Math.sin(a) * r, Math.cos(a) * r, a, rs(i, 0.25, 0.7), h * 0.32, h, T, (r / e) * 0.1, 0.1, 1.7);
    });
    // an X of two blades through the hit
    vesp.blades(fx, g, [[10 * s, 2.2, 0.8, 0, 9 * s, 0, true], [10 * s, 2.2, -0.8, 0, 9 * s, 0, true]], PRISM.pink, PRISM.white, { rise: 0.08, hold: 0.2, fade: 0.3 });
    vesp.glints(fx, g, 30, (i, T, p) => {
      const t = Math.min(T, 1.3);
      arc(p, i * 2.399, rs(i, 5, 14) * s, rs(i, 8, 20) * Math.sqrt(s), 2, 24, t);
      p.w = p.h = 1.1 * Math.sqrt(s); p.o = cl(1 - T / 1.4);
    });
    cloud(fx, g, 1, burst(PRISM.violet), (i, T, p) => { p.y = 4 * s; p.w = p.h = 16 * s; p.f = Math.min(63, T * 70); p.o = cl(1 - T / 0.7); });
  },
  // a ring of blades (arcs of the unit circle, scaled out to the front) spinning at height y
  bladeRing(fx, g, nArc, y, R, t0, dur, spin, c) {
    const ring = new THREE.Group(), outer = [], inner = [];
    ring.position.y = y;
    g.add(ring);
    for (let k = 0; k < nArc; k++) {
      const a = (k / nArc) * TAU;
      outer.push(turn(crescentPts(1, 0.9).map(([x, , z]) => [x, 0, z + 1]), a));
      inner.push(turn(crescentPts(0.98, 0.8).map(([x, , z]) => [x, 0, z + 0.98]), a));
    }
    const o = { t0, rise: 0.06, hold: dur * 0.6, fade: dur * 0.4 };
    ribbon(fx, ring, outer, c, 3.4, o);
    ribbon(fx, ring, inner, PRISM.white, 1, o);
    fx.layers.push((T) => {
      const r = Math.max(0.01, R * (0.1 + 0.9 * sm((T - t0) / dur)));
      ring.scale.set(r, 1, r); ring.rotation.y = T * spin;
    });
  },
  roar(fx, g, R, world) {
    at(fx, 0, () => world.spawnShockwave?.(g.position.clone(), PRISM.violet, R));
    vesp.bladeRing(fx, g, 6, 5, R, 0, 1.1, 3, PRISM.violet);
    vesp.bladeRing(fx, g, 5, 12, R * 0.85, 0.08, 1.1, -3.6, PRISM.pink);
    shards(fx, g, 'crystal', 18, AMETHYST, (i, T, o) => {
      const a = rs(i, 0, TAU), r = rs(i + 3, 0.3, 0.95) * R, h = rs(i, 8, 16);
      erupt(o, Math.sin(a) * r, Math.cos(a) * r, a, rs(i, 0.2, 0.55), h * 0.3, h, T, (r / R) * 0.5, 0.1, 2.0);
    });
    vesp.glints(fx, g, 50, (i, T, p) => {
      const a = i * 2.399 + T * 2, r = R * rs(i, 0.1, 1) * cl(T * 1.4);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = rs(i, 2, 18);
      p.w = p.h = 1.4 * (0.4 + 0.6 * Math.abs(Math.sin(T * 24 + i))); p.o = env(T, 0, 0.1, 1.5, 2.3);
    });
    cloud(fx, g, 24, smoke(0xd8c4ff, 0.4), (i, T, p) => {
      const a = (i / 24) * TAU, r = R * (1 - Math.pow(1 - cl(T / 1.2), 2));
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 3;
      p.w = 10; p.h = 5; p.f = Math.min(62, T * 40); p.o = cl(1 - T / 1.3) * 0.35;
    });
  },
  charge(fx, g, L) {
    ribbon(fx, g, [[[-3, 6, -4], [-3, 6, L]], [[3, 11, -4], [3, 11, L]]], PRISM.pink, 2.4, { rise: 0.16, hold: 0.1, fade: 0.35, op: 0.85 });
    ribbon(fx, g, [[0, 16, -4], [0, 16, L]], PRISM.cyan, 2.4, { rise: 0.16, hold: 0.1, fade: 0.35, op: 0.85 });
    // an X slashed through the air at the end of the dash
    vesp.blades(fx, g, [[16, 2.4, 0.75, 0, 14, L * 0.85, true], [16, 2.4, -0.75, 0, 14, L * 0.85, true]], PRISM.violet, PRISM.white, { t0: 0.12, rise: 0.08, hold: 0.25, fade: 0.35 });
    vesp.glints(fx, g, 30, (i, T, p, n) => {
      const z = (i / n) * L, age = T - (z / L) * 0.16;
      if (age < 0) return;
      p.x = Math.sin(i * 2.4) * (3 + age * 6); p.y = 3 + rs(i, 0, 16) + age * 3; p.z = z;
      p.w = p.h = 1.2; p.o = cl(1 - age / 1);
    });
  },
  ult(fx, g, R, world) {
    at(fx, 0, () => world.spawnShockwave?.(g.position.clone(), PRISM.violet, R));
    // a tornado of blades thrown out over the radius
    vesp.bladeRing(fx, g, 6, 5, R, 0, 2.6, 4.2, PRISM.violet);
    vesp.bladeRing(fx, g, 5, 16, R * 0.8, 0.15, 2.6, -5, PRISM.pink);
    vesp.bladeRing(fx, g, 4, 28, R * 0.6, 0.3, 2.6, 6, PRISM.cyan);
    vesp.bladeRing(fx, g, 3, 40, R * 0.4, 0.45, 2.6, -7, PRISM.violet);
    shards(fx, g, 'crystal', 30, AMETHYST, (i, T, o) => {
      const a = rs(i, 0, TAU), r = rs(i + 3, 0.15, 0.95) * R, h = rs(i, 12, 30);
      erupt(o, Math.sin(a) * r, Math.cos(a) * r, a, rs(i, 0.15, 0.45), h * 0.28, h, T, 0.2 + (r / R) * 1.2, 0.12, 3.2, 0.6);
    });
    vesp.glints(fx, g, 90, (i, T, p) => {
      const u = rs(i, 0.05, 1), a = i * 2.399 + T * (5 - 3 * u), r = R * u * cl(T / 2);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = rs(i, 2, 44);
      p.w = p.h = 1.6 * (0.4 + 0.6 * Math.abs(Math.sin(T * 22 + i))); p.o = env(T, 0, 0.2, 3, 3.8);
    });
    cloud(fx, g, 1, burst(PRISM.violet), (i, T, p) => { p.y = 18; p.w = p.h = 70; p.f = Math.min(63, T * 50); p.o = cl(1 - T / 1.2); });
  },
};

const WOOD = { leaf: 0xa4c653, glow: 0xe4ff8c, moss: 0x7aa233, spore: 0xd9ff7a, earth: 0x8c7454 };
const ROOT = { color: 0x4a3420, roughness: 0.95, metalness: 0, emissive: 0x3f7a12, emissiveIntensity: 0.22 };
const THORN = { color: 0x6f5a34, roughness: 0.8, metalness: 0, emissive: 0x587a14, emissiveIntensity: 0.15 };
const thorn = {
  life: { beam: 1.6, impact: 2.8, roar: 3.4, charge: 2.8, ult: 4.8 },
  // roots heaved up out of the ground, curling outward, each with a thorn beside it
  roots(fx, g, pts, t1) {
    shards(fx, g, 'root', pts.length, ROOT, (i, T, o) => {
      const q = pts[i];
      if (!q) return;
      erupt(o, q.x, q.z, q.a, 0, q.w, q.h, T, q.d, 0.22, t1 + q.d * 0.4, 0.6);
      o.scale.z = o.scale.y * 0.9;
    });
    shards(fx, g, 'spike', pts.length, THORN, (i, T, o) => {
      const q = pts[i];
      if (!q) return;
      erupt(o, q.x + Math.cos(q.a) * q.w * 0.8, q.z - Math.sin(q.a) * q.w * 0.8, q.a, 0.5, q.w * 0.22, q.h * 0.55, T, q.d + 0.06, 0.12, t1 + q.d * 0.4, 0.5);
    });
    cloud(fx, g, Math.min(30, pts.length), dust(WOOD.earth), (i, T, p) => {
      const q = pts[i % pts.length], age = T - q.d;
      if (!q || age < 0) return;
      p.x = q.x; p.z = q.z; p.y = 1 + age * 3; p.w = p.h = q.w * 1.6 + age * 6; p.f = Math.min(62, age * 40); p.o = cl(1 - age / 1.4) * 0.6;
    });
  },
  ring(n, r0, r1, h0, h1, d0, dPer, seed = 0) {
    return Array.from({ length: n }, (_, i) => {
      const a = rs(i + seed, 0, TAU), r = rs(i + seed + 7, r0, r1), h = rs(i + seed + 2, h0, h1);
      return { x: Math.sin(a) * r, z: Math.cos(a) * r, a, w: h * 0.42, h, d: d0 + (r / Math.max(1, r1)) * dPer };
    });
  },
  spores(fx, g, n, R, t0, life, hMax) {
    cloud(fx, g, n, glow(WOOD.spore), (i, T, p) => {
      const age = T - t0 - rs(i, 0, 0.4);
      if (age < 0) return;
      const a = i * 2.399 + age * 0.6, r = R * rs(i + 1, 0.1, 1);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + age * rs(i, 3, 9) + Math.sin(age * 3 + i) * 1.5;
      p.w = p.h = 1.1 + Math.sin(T * 6 + i) * 0.3; p.o = env(age, 0, 0.2, life * 0.7, life) * 0.85;
      if (p.y > hMax) p.o = 0;
    });
  },
  beam(fx, g, L) {
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], WOOD.moss, 8, { rise: 0.12, hold: 0.4, fade: 0.4, op: 0.5 });
    ribbon(fx, g, [[[-2, 0, 0], [-0.07 * L, 0, L]], [[2, 0, 0], [0.07 * L, 0, L]], [[0, 1, 0], [0, 0.04 * L, L]]], WOOD.glow, 1.6, { rise: 0.12, hold: 0.35, fade: 0.3, op: 0.8 });
    // a volley of thorns, fanned and staggered
    const N = 18, speed = 300;
    const tip = (i, T, out) => {
      const d = (i % 6) * 0.03 + Math.floor(i / 6) * 0.05, z = Math.max(0, T - d) * speed;
      const fan = rs(i, -1, 1) * 0.07, lift = rs(i + 4, -1, 1) * 0.04;
      out.set(fan * Math.min(z, L), lift * Math.min(z, L) + 2 * Math.sin(Math.min(1, z / L) * PI), Math.min(z, L));
      return z < L + 2 && T >= d;
    };
    shards(fx, g, 'thorn', N, THORN, (i, T, o) => {
      if (!tip(i, T, o.position)) return;
      o.rotation.x = PI / 2;
      const s = rs(i, 0.8, 1.3);
      o.scale.set(2.4 * s, 15 * s, 2.4 * s);
    });
    // spore wakes behind each thorn
    cloud(fx, g, N * 3, glow(WOOD.spore), (i, T, p) => {
      const k = i % N, j = Math.floor(i / N);
      if (!tip(k, T - j * 0.025, _v)) return;
      p.x = _v.x; p.y = _v.y; p.z = _v.z; p.w = p.h = 2.6 - j * 0.6; p.o = 0.9 - j * 0.2;
    });
    cloud(fx, g, 12, dust(0x8fae58), (i, T, p) => {
      const a = i * 2.399, t = T;
      p.x = Math.sin(a) * (1 + t * 8); p.y = Math.cos(a) * (1 + t * 6); p.z = 3 + t * 12;
      p.w = p.h = 3 + t * 8; p.f = Math.min(62, t * 50); p.o = cl(1 - t / 0.8) * 0.5;
    });
  },
  impact(fx, g, e) {
    const s = e / 16, big = e >= 20;
    thorn.roots(fx, g, thorn.ring(big ? 9 : 6, e * 0.1, e * 0.6, 6 * s, 13 * s, 0, 0.12), 2.0);
    thorn.spores(fx, g, 24, e * 0.6, 0, 2.2, 30);
    cloud(fx, g, 16, dust(0x8f7a58), (i, T, p) => {
      const a = i * 2.399, r = e * (0.2 + 0.8 * (1 - Math.exp(-T * 3))) * rs(i, 0.5, 1);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 2 + T * 2;
      p.w = p.h = (5 + T * 5) * s; p.f = Math.min(62, T * 30); p.o = cl(1 - T / 2) * 0.55;
    });
  },
  roar(fx, g, R, world) {
    at(fx, 0, () => world.spawnShockwave?.(g.position.clone(), WOOD.leaf, R));
    cinder.cracks(fx, g, 10, R, 0, 2.4, WOOD.glow, WOOD.leaf);
    cloud(fx, g, 1, burst(WOOD.leaf), (i, T, p) => { p.y = 8; p.w = p.h = 44; p.f = Math.min(63, T * 60); p.o = cl(1 - T / 1); });
    thorn.roots(fx, g, thorn.ring(24, R * 0.2, R * 0.95, 13, 26, 0.04, 0.6, 3), 2.6);
    thorn.spores(fx, g, 44, R, 0.1, 2.8, 40);
    cloud(fx, g, 30, dust(0x9cb565), (i, T, p) => {
      const a = i * 2.399 + T * 0.8, r = R * rs(i, 0.2, 1) * cl(T * 1.6);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 4 + rs(i, 0, 12) - T * 2;
      p.w = p.h = 2.2; p.r = T * 5 + i; p.f = 20; p.o = env(T, 0.1, 0.3, 1.8, 2.8) * 0.8;
    });
  },
  charge(fx, g, L) {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const z = ((i >> 1) / 8) * L + 3, side = i % 2 ? 1 : -1, h = rs(i, 9, 17);
      pts.push({ x: side * rs(i + 1, 6, 10), z, a: side * PI / 2 + rs(i, -0.4, 0.4), w: h * 0.42, h, d: (z / L) * 0.24 });
    }
    thorn.roots(fx, g, pts, 2.2);
    ribbon(fx, g, [[[-4, 6, -3], [-4, 6, L]], [[0, 16, -3], [0, 16, L]]], WOOD.leaf, 2.6, { rise: 0.24, hold: 0.12, fade: 0.4, op: 0.75 });
    ribbon(fx, g, [[4, 11, -3], [4, 11, L]], WOOD.glow, 2.6, { rise: 0.24, hold: 0.12, fade: 0.4, op: 0.75 });
    cloud(fx, g, 24, dust(0x8f7a58), (i, T, p, n) => {
      const z = (i / n) * L, age = T - (z / L) * 0.24;
      if (age < 0) return;
      p.x = Math.sin(i * 2.4) * (3 + age * 6); p.z = z; p.y = 2 + age * 4;
      p.w = p.h = 6 + age * 6; p.f = Math.min(62, age * 34); p.o = cl(1 - age / 1.6) * 0.55;
    });
  },
  ult(fx, g, R, world) {
    at(fx, 0, () => world.spawnShockwave?.(g.position.clone(), WOOD.leaf, R));
    // a forest torn up out of the city
    cinder.cracks(fx, g, 16, R, 0.05, 3, WOOD.glow, WOOD.leaf);
    cloud(fx, g, 1, burst(WOOD.leaf), (i, T, p) => { p.y = 14; p.w = p.h = 80; p.f = Math.min(63, T * 50); p.o = cl(1 - T / 1.2); });
    thorn.roots(fx, g, [...thorn.ring(16, R * 0.12, R * 0.45, 22, 36, 0.05, 0.4, 1), ...thorn.ring(22, R * 0.45, R, 26, 44, 0.45, 0.8, 31)], 3.4);
    thorn.spores(fx, g, 80, R, 0.2, 3.8, 60);
    cloud(fx, g, 34, smoke(0x8fb055, 0.5), (i, T, p) => {
      const a = i * 2.399, r = R * rs(i, 0.1, 1), age = T - 0.3 - (r / R) * 0.8;
      if (age < 0) return;
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 6 + age * 6;
      p.w = p.h = 14 + age * 6; p.f = Math.min(62, 8 + age * 16); p.o = Math.min(1, age * 3) * cl((4.6 - T) / 1.6) * 0.45;
    });
  },
};

const IRON = { pink: 0xff6589, hot: 0xffd0ac, copper: 0xefad72, spark: 0xffc27a, arc: 0xff8fc0 };
const SCRAP = { color: 0xa39c94, roughness: 0.42, metalness: 0.85, emissive: 0x4a0c1c, emissiveIntensity: 0.12 };
const ferr = {
  life: { beam: 1.2, impact: 2.2, roar: 2.6, charge: 1.6, ult: 4.4 },
  sparks(fx, g, n, s, t0 = 0) {
    cloud(fx, g, n, glow(IRON.spark), (i, T, p) => {
      const age = T - t0;
      if (age < 0) return;
      const t = Math.min(age, 1.2);
      arc(p, i * 2.399, rs(i, 6, 18) * s, rs(i, 6, 22) * Math.sqrt(s), 2, 34, t);
      p.w = 0.35 * Math.sqrt(s); p.h = 2.4 * Math.sqrt(s); p.r = i; p.o = cl(1 - age / rs(i, 0.5, 1.2));
    });
  },
  beam(fx, g, L, world, origin, dir) {
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], IRON.pink, 7, { rise: 0.04, hold: 0.25, fade: 0.4, op: 0.55 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], IRON.hot, 2.6, { rise: 0.035, hold: 0.22, fade: 0.3 });
    ribbon(fx, g, [[0, 0, 0], [0, 0, L]], 0xffffff, 0.9, { rise: 0.03, hold: 0.2, fade: 0.2 });
    // the rails: coil rings strung out along the shot, flashing in sequence
    const NR = 12, rings = [[], []];
    for (let k = 0; k < NR; k++) {
      const z = ((k + 0.5) / NR) * L * 0.9, r = 3.5 + (k % 3);
      rings[k % 2].push(circlePts(20, r, 0).map(([x, , y]) => [x, y, z]));
    }
    for (let k = 0; k < 2; k++) {
      const m = ribbon(fx, g, rings[k], k ? IRON.copper : IRON.pink, 1.1, { t0: k * 0.04, rise: 0.02, hold: 0.25, fade: 0.35, op: 0.95 });
      fx.layers.push((T) => { const sc = 1 + T * 2.5; m.scale.set(sc, sc, 1); });
    }
    // scrap slugs fired down the rail
    shards(fx, g, 'plate', 10, SCRAP, (i, T, o) => {
      const z = Math.max(0, T - i * 0.025) * 420;
      if (z > L || T < i * 0.025) return;
      o.position.set(Math.sin(i * 2.4) * 1.5, Math.cos(i * 2.4) * 1.5, z);
      o.rotation.set(T * 30 + i, T * 20, i);
      o.scale.setScalar(rs(i, 1.6, 2.6));
    });
    cloud(fx, g, 36, glow(IRON.spark), (i, T, p) => {
      const u = rs(i, 0, 1), age = T - u * 0.06, t = Math.min(Math.max(0, age), 0.8), a = i * 2.399;
      p.x = Math.sin(a) * rs(i, 4, 14) * t; p.y = Math.cos(a) * rs(i, 4, 14) * t - 10 * t * t; p.z = u * L;
      p.w = 0.3; p.h = 1.8; p.r = a; p.o = age < 0 ? 0 : cl(1 - age / 0.8);
    });
    at(fx, 0.02, () => {
      _w.copy(dir).normalize();
      for (let k = 0; k < 2; k++) {
        const b = origin.clone().addScaledVector(_w, L * (0.45 + k * 0.4));
        b.x += rs(k, -6, 6); b.y += rs(k + 1, -4, 4);
        lightning(world, origin, b, IRON.arc, 0.35, 10);
      }
    });
  },
  impact(fx, g, e, world) {
    const s = e / 16;
    at(fx, 0, () => {
      world.spawnExplosion?.(g.position.clone(), Math.min(2.6, 0.9 * s));
      for (let k = 0; k < (e >= 20 ? 3 : 2); k++) {
        const a = rs(k, 0, TAU), r = e * rs(k + 2, 0.5, 1.1);
        lightning(world, g.position.clone().setY(g.position.y + 4 * s), g.position.clone().add(_w.set(Math.sin(a) * r, 0, Math.cos(a) * r)).setY(0.4), IRON.arc, 0.4, 8);
      }
    });
    ferr.sparks(fx, g, 40, s);
    if (e >= 20) ferr.field(fx, g, 8, e * 1.5, e * 0.8, 0, 0.5, IRON.pink, IRON.copper);
    shards(fx, g, 'plate', e >= 20 ? 16 : 10, SCRAP, (i, T, o) => {
      const t = Math.min(T, 1.5);
      arc(o.position, i * 2.399, rs(i, 5, 14) * s, rs(i, 8, 20) * Math.sqrt(s), 1, 30, t);
      o.rotation.set(T * 7 + i, T * 5 + i, i);
      o.scale.setScalar(rs(i, 2, 4) * Math.sqrt(s) * (1 - sm((T - 1.7) / 0.5)));
    });
    cloud(fx, g, 1, burst(IRON.pink), (i, T, p) => { p.y = 3 * s; p.w = p.h = 15 * s; p.f = Math.min(63, T * 70); p.o = cl(1 - T / 0.7); });
  },
  // magnetic field lines: loops out of the body that land on the ground around it
  field(fx, g, n, R, H, t0, hold, c1, c2) {
    const lines = [[], []];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, r = R * u, y = 6 + H * Math.sin(PI * u) * (1 - u * 0.35) - 6 * u;
        pts.push([Math.sin(a) * r, Math.max(0.5, y), Math.cos(a) * r]);
      }
      lines[k % 2].push(pts);
    }
    for (let k = 0; k < 2; k++) {
      const m = ribbon(fx, g, lines[k], k ? c1 : c2, 1.8, { t0, rise: 0.25, hold, fade: 0.4, op: 0.9, scroll: 3 });
      fx.layers.push((T) => { m.rotation.y = (T - t0) * 0.4; });
    }
  },
  roar(fx, g, R, world) {
    at(fx, 0, () => {
      world.spawnShockwave?.(g.position.clone(), IRON.pink, R);
      for (let k = 0; k < (isMobile ? 3 : 6); k++) {
        const a = rs(k + 9, 0, TAU), r = R * rs(k, 0.45, 0.9);
        lightning(world, g.position.clone().setY(g.position.y + 22), g.position.clone().add(_w.set(Math.sin(a) * r, 0, Math.cos(a) * r)).setY(0.4), IRON.arc, 0.5, 12);
      }
    });
    ferr.field(fx, g, 10, R * 0.85, 26, 0, 0.9, IRON.pink, IRON.copper);
    // scrap dragged up off the street, held in orbit, then thrown out
    shards(fx, g, 'plate', 30, SCRAP, (i, T, o) => {
      const a0 = rs(i, 0, TAU), r0 = R * rs(i + 1, 0.3, 0.75), lift = rs(i + 2, 8, 22), sz = rs(i + 3, 3, 5.5);
      if (T < 0.8) {
        const k = sm(T / 0.5), a = a0 + T * 2.4, r = r0 * (1 - 0.35 * k);
        o.position.set(Math.sin(a) * r, 0.5 + lift * k, Math.cos(a) * r);
      } else {
        const t = T - 0.8, a = a0 + 0.8 * 2.4, r = r0 * 0.65 + t * rs(i, 40, 70);
        o.position.set(Math.sin(a) * r, Math.max(0.4, lift + 10 * t - 25 * t * t), Math.cos(a) * r);
      }
      o.rotation.set(T * 4 + i, T * 3, i);
      o.scale.setScalar(sz * (1 - sm((T - 2.1) / 0.4)));
    });
    cloud(fx, g, 46, glow(IRON.spark), (i, T, p) => {
      const a = i * 2.399 + T * 2.4, r = R * rs(i, 0.15, 0.8), y = rs(i, 2, 22);
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = y;
      p.w = 0.35; p.h = 1.8; p.r = a; p.o = env(T, 0, 0.1, 0.8, 1.4) * Math.abs(Math.sin(T * 25 + i));
    });
  },
  charge(fx, g, L) {
    const pts = [];
    for (let i = 0; i <= 90; i++) { const u = i / 90, a = u * L * 0.3; pts.push([Math.sin(a) * 7, 8 + Math.cos(a) * 7, u * L]); }
    ribbon(fx, g, pts, IRON.pink, 2.2, { rise: 0.2, hold: 0.2, fade: 0.45, op: 0.95 });
    ribbon(fx, g, [[0, 8, -3], [0, 8, L]], IRON.hot, 5, { rise: 0.2, hold: 0.15, fade: 0.4, op: 0.5 });
    cloud(fx, g, 40, glow(IRON.spark), (i, T, p, n) => {
      const z = (i / n) * L, age = T - (z / L) * 0.2;
      if (age < 0 || age > 1) return;
      arc(p, (i % 2 ? 1 : -1) * rs(i, 1.2, 2.2), rs(i, 8, 18), rs(i, 6, 14), 1, 30, age);
      p.z += z; p.w = 0.35; p.h = 2; p.r = i; p.o = 1 - age;
    });
    shards(fx, g, 'plate', 10, SCRAP, (i, T, o, n) => {
      const z = (i / n) * L, age = T - (z / L) * 0.2;
      if (age < 0) return;
      const t = Math.min(age, 1.1);
      arc(o.position, (i % 2 ? 1 : -1) * rs(i, 1, 2), rs(i, 6, 14), rs(i, 8, 16), 1, 30, t);
      o.position.z += z; o.rotation.set(T * 8 + i, T * 5, 0); o.scale.setScalar(rs(i, 2.2, 3.6) * (1 - sm((T - 1.2) / 0.4)));
    });
  },
  ult(fx, g, R, world) {
    // a maelstrom of scrap whirled up around it, held, then let fly
    let arcs = 0;
    fx.layers.push((T) => {
      if (T < 0.15 * arcs || arcs >= (isMobile ? 8 : 18) || T > 3) return;
      const k = arcs++, a = rs(k + 30, 0, TAU), r = R * rs(k + 3, 0.3, 0.95);
      lightning(world, g.position.clone().setY(g.position.y + rs(k, 20, 50)), g.position.clone().add(_w.set(Math.sin(a) * r, 0, Math.cos(a) * r)).setY(0.4), IRON.arc, 0.45, 12);
    });
    ferr.field(fx, g, 14, R * 0.9, 50, 0, 2.6, IRON.pink, IRON.copper);
    at(fx, 2.7, () => { world.spawnShockwave?.(g.position.clone(), IRON.pink, R); world.shake?.(1.5, 0.6); });
    shards(fx, g, 'plate', 64, SCRAP, (i, T, o) => {
      const u = rs(i, 0, 1), a0 = rs(i + 1, 0, TAU), sz = rs(i + 3, 2.2, 5.5);
      const rr = 14 + u * R * 0.7, y = 4 + u * 50 + Math.sin(T * 2 + i) * 3;
      if (T < 2.7) {
        const k = sm(T / 0.8), a = a0 + T * (3.2 - 1.8 * u);
        o.position.set(Math.sin(a) * rr * (0.4 + 0.6 * k), 0.5 + (y - 0.5) * k, Math.cos(a) * rr * (0.4 + 0.6 * k));
      } else {
        const t = T - 2.7, a = a0 + 2.7 * (3.2 - 1.8 * u), r = rr + t * rs(i, 50, 90);
        o.position.set(Math.sin(a) * r, Math.max(0.4, y + 6 * t - 22 * t * t), Math.cos(a) * r);
      }
      o.rotation.set(T * 3 + i, T * 4 + i * 2, i);
      o.scale.setScalar(sz * (1 - sm((T - 3.9) / 0.4)));
    });
    cloud(fx, g, 70, glow(IRON.spark), (i, T, p) => {
      const u = rs(i, 0, 1), a = i * 2.399 + T * (3.2 - 1.8 * u), r = 14 + u * R * 0.7;
      p.x = Math.sin(a) * r; p.z = Math.cos(a) * r; p.y = 4 + u * 50;
      p.w = 0.4; p.h = 2.2; p.r = a; p.o = env(T, 0.3, 0.5, 2.6, 3) * Math.abs(Math.sin(T * 20 + i));
    });
    ferr.sparks(fx, g, 50, 3.5, 2.7);
  },
};

const ELEMENTS = { cindervault: cinder, brineveil: brine, rimehorn: rime, vesperax: vesp, thornwake: thorn, ferrumaw: ferr };

/**
 * Spawn one of a newer kaiju's powers. move: 'beam' (position = muzzle, direction, extent = length),
 * 'charge' (position = where the dash started, direction = the dash, extent = its length),
 * 'roar' / 'ult' (position = the kaiju's feet, extent = radius), 'impact' (position = the hit point,
 * extent = its size: ~16 for a beam, 25-40 for a charge or a slam). False for any other kaiju.
 */
export function spawnKaijuPower(world, cfg, move, position, opts) {
  const fx = build(world, cfg, move, position, opts);
  if (!fx) return false;
  // Held here, not in world.effects: a power that levels a block spawns enough collapse effects
  // to hit world.effects' cap, which retires the oldest first (this power, the frame it started)
  _live.push(fx);
  if (_live.length > MAX_LIVE) _live.shift().dispose();
  return true;
}
const _live = [], MAX_LIVE = 24;
/** Tick the live powers (game.js, next to updateAtomicBlasts). */
export function updateKaijuPowers(dt) {
  for (let i = _live.length - 1; i >= 0; i--) {
    const fx = _live[i];
    fx.tick(dt);
    if (fx.dead) _live.splice(i, 1);
  }
}
/** Drop every live power (a level teardown). */
export function resetKaijuPowers() {
  for (const fx of _live) if (!fx.dead) fx.dispose();
  _live.length = 0;
}
/** The live powers (tests, QA). */
export function liveKaijuPowers() { return _live; }

function build(world, cfg, move, position, { direction, extent } = {}) {
  const E = ELEMENTS[cfg?.variant];
  if (!E || !E[move] || !world?.scene || !world.effects || !(extent > 0.01)) return null;
  const directional = move === 'beam' || move === 'charge';
  if (directional && !(direction && direction.lengthSq() > 1e-6)) return null;
  const pos = position.clone();
  let dir = null;
  if (move === 'charge') {
    // (along the ground it stands on: position is the feet, as for roar / ult - a raised ring included)
    dir = _v.set(direction.x, 0, direction.z);
    if (dir.lengthSq() < 1e-6) return null;
    pos.y = Math.max(0.2, pos.y);
  } else if (move === 'beam') dir = direction;
  else if (move !== 'impact') pos.y = Math.max(0.2, pos.y);
  // root: world space (for pieces placed in world terms); g: the power's own frame
  const root = new THREE.Group(), g = group(pos, dir);
  root.name = `${cfg.variant}_${move}`;
  root.add(g);
  const fx = new KaijuFx(world, root, E.life[move]);
  E[move](fx, g, Math.min(extent, 420), world, position, direction);
  return fx.start();
}

// Prewarm: _stageVfx (game.js) calls every vfx builder with a stub world whose scene is a
// staging group. Stage each element's big impact there (every material kind they use), so
// their programs are linked with the rest of the effect set even if the kit's change.
vfx.registerBuilder('kaijuPowers', (opts) => {
  if (!opts?.world?.scene) return null;
  const stub = Object.create(opts.world);
  stub.effects = [];
  stub.spawnExplosion = stub.spawnShockwave = stub.shake = () => {};
  // (built, never ticked: the staged copies keep their programs acquired)
  for (const variant of Object.keys(ELEMENTS)) build(stub, { variant }, 'impact', new THREE.Vector3(0, 2, 0), { extent: 30 });
  return null;
});
