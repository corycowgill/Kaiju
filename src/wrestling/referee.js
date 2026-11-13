// The referee: a kaiju-scale official in the striped shirt, one draw of
// boxes posed procedurally on the CPU (no rig, no clips, same on every tier;
// the arena's own atlas material, so no new shader program).
//   buildRefereeMesh(material, u, v)   at level build (chicago_arena.js), so
//                                      the level prewarm compiles its program;
//   createReferee(ctx, W, mesh)        the runtime spots.js drives: it keeps
//                                      out of the fighters' way, walks to the
//                                      ropes to face a fighter being counted
//                                      out and chops one more count per
//                                      countout:count, and drops beside a pin
//                                      to slap the mat on every pin:count.
// OWNER: spots.
import * as THREE from 'three';
import { EV } from './events.js';

/** Height (u) of the official, feet to crown. */
export const REF_H = 22;
const S = REF_H / 1.8;            // parts are laid out in metres of a 1.8 m person
const WHITE = 'white', BLACK = 'black', SKIN = 'skin', HAIR = 'hair'; // atlas cells (buildRefereeMesh's uv table)
// Parts: [joint, w, h, d, x, y, z (centre, in the joint's frame), colour]
//   joints: 0 root (feet), 1 hips (legs hang from it), 2 torso (pivots at the hips), 3 / 4 right / left shoulder
const LEG = (s) => [[1, 0.16, 0.86, 0.19, s * 0.1, -0.43, 0, BLACK], [1, 0.17, 0.09, 0.3, s * 0.1, -0.86, 0.05, BLACK]];
const PARTS = [
  ...LEG(1), ...LEG(-1),
  // the shirt: six vertical stripes
  ...[0, 1, 2, 3, 4, 5].map((i) => [2, 0.07, 0.56, 0.24, -0.175 + i * 0.07, 0.28, 0, i % 2 ? BLACK : WHITE]),
  [2, 0.42, 0.06, 0.25, 0, 0.0, 0, BLACK],                 // belt
  [2, 0.22, 0.26, 0.24, 0, 0.74, 0.01, SKIN],              // head
  [2, 0.23, 0.07, 0.25, 0, 0.88, -0.01, HAIR],
  [2, 0.09, 0.08, 0.26, 0, 0.6, 0.0, BLACK],               // collar
  // arms: sleeve (striped half-and-half), forearm + hand
  [3, 0.13, 0.26, 0.13, 0, -0.13, 0, WHITE], [3, 0.1, 0.44, 0.1, 0, -0.47, 0, SKIN],
  [4, 0.13, 0.26, 0.13, 0, -0.13, 0, BLACK], [4, 0.1, 0.44, 0.1, 0, -0.47, 0, SKIN],
];
const HIP_Y = 0.9, SHOULDER = [0.27, 0.54]; // shoulder: x out, y up from the hips

/** The official as one Mesh of PARTS.length boxes, re-posed in place each frame.
 *  material: the arena's atlas material; uv: { white, black, skin, hair } -> [u, v] of a flat atlas cell. */
export function buildRefereeMesh(material, uv) {
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const bp = box.getAttribute('position').array, bn = box.getAttribute('normal').array, nv = bp.length / 3;
  const n = PARTS.length * nv;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), tex = new Float32Array(n * 2);
  for (let i = 0; i < PARTS.length; i++) {
    const [u, v] = uv[PARTS[i][7]];
    for (let k = 0; k < nv; k++) { tex[(i * nv + k) * 2] = u; tex[(i * nv + k) * 2 + 1] = v; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
  g.userData.box = { p: bp, n: bn, nv };
  const m = new THREE.Mesh(g, material);
  m.name = 'arena_referee';
  m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}
/** Write part i's box (unit box through matrix M) into the mesh. */
function writeBox(g, i, M) {
  const B = g.userData.box, P = g.attributes.position.array, N = g.attributes.normal.array, e = M.elements;
  for (let k = 0; k < B.nv; k++) {
    const o = (i * B.nv + k) * 3, x = B.p[k * 3], y = B.p[k * 3 + 1], z = B.p[k * 3 + 2];
    P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
    P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    // (a box face normal is one axis: the scale only lengthens it, so transform and renormalise)
    const a = B.n[k * 3], b = B.n[k * 3 + 1], c = B.n[k * 3 + 2];
    let nx = e[0] * a + e[4] * b + e[8] * c, ny = e[1] * a + e[5] * b + e[9] * c, nz = e[2] * a + e[6] * b + e[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
  }
}

const _root = new THREE.Matrix4(), _j = new THREE.Matrix4(), _p = new THREE.Matrix4(), _t = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _J = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
// Arm angles (rad about the shoulder's X: 0 hanging, -PI overhead, -PI/2 pointing forward)
const UP = -2.75, CHOP = -1.35, SLAP = -0.55;

/** @returns the referee runtime: { start, update(dt, dtReal), dispose, state } */
export function createReferee(ctx, W, mesh) {
  const st = { x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, mode: 'idle', walk: 0, speed: 0, crouch: 0, beatT: 9, beat: '', armR: 0, armL: 0, raise: 0, pickT: 0 };
  let offs = [];
  const A = () => (W.arena && W.arena.info) || null;

  const last = new Float32Array(7).fill(NaN), _cur = new Float32Array(7);
  function pose(force) {
    if (!mesh) return;
    // Standing still (between counts, idle at his spot): nothing to re-write this frame
    const cur = _cur;
    cur[0] = st.x; cur[1] = st.z; cur[2] = st.yaw; cur[3] = st.armR; cur[4] = st.armL; cur[5] = st.crouch; cur[6] = st.speed > 0.5 ? st.walk : 0;
    let same = !force;
    for (let i = 0; i < 7 && same; i++) if (Math.abs(cur[i] - last[i]) > 1e-3) same = false;
    if (same) return;
    for (let i = 0; i < 7; i++) last[i] = cur[i];
    const k = smooth(st.crouch), sw = Math.sin(st.walk) * Math.min(1, st.speed / 25);
    // root: feet on the ground (kneeling lowers the hips), facing yaw
    _q.setFromAxisAngle(_v.set(0, 1, 0), st.yaw);
    _root.compose(_v.set(st.x, 0, st.z), _q, _s.set(S, S, S));
    // hips
    _J[1].multiplyMatrices(_root, _t.makeTranslation(0, HIP_Y - 0.42 * k, 0));
    // torso pivots at the hips: a lean into the count, and over the pin
    _J[2].multiplyMatrices(_J[1], _t.makeRotationX(0.12 * Math.min(1, st.speed / 30) + 0.75 * k));
    // shoulders
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1; // (the model faces +Z: its right hand is on -X)
      const a = s === 0 ? st.armR : st.armL;
      _e.set(a, 0, side * (0.08 + 0.1 * Math.abs(a) / 3), 'XYZ');
      _q.setFromEuler(_e);
      _p.compose(_v.set(side * SHOULDER[0], SHOULDER[1], 0), _q, _s.set(1, 1, 1));
      _J[3 + s].multiplyMatrices(_J[2], _p);
    }
    for (let i = 0; i < PARTS.length; i++) {
      const [j, w, h, d, x, y, z] = PARTS[i];
      let J = _J[j];
      if (j === 1) {
        // legs: a stride when walking; folded back under the body when kneeling
        const side = x > 0 ? 1 : -1;
        _J[0].multiplyMatrices(_J[1], _t.makeRotationX(side * sw * 0.55 - 1.35 * k));
        J = _J[0];
      }
      _t.compose(_v.set(x, y, z), _q.identity(), _s.set(w, h, d));
      _p.multiplyMatrices(J, _t);
      writeBox(mesh.geometry, i, _p);
    }
    const g = mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere();
    g.boundingSphere.center.set(st.x, REF_H * 0.5, st.z); g.boundingSphere.radius = REF_H;
  }

  // Where to stand: out of the way, at the ropes for a count-out, beside a pin
  function choose(dt) {
    const a = A(), P = W.player, R = W.rival, g = W.grapple, sp = W.spots;
    if (!a || !P || !R) return;
    const h = a.half, cx = a.cx, cz = a.cz;
    const ph = W.match ? W.match.state.phase : '';
    st.mode = 'idle';
    if (g && g.pin && g.pin.active && g.pin.V && !g.pin.done) {
      // Down beside the cover, on the side of the shoulders, facing them
      const V = g.pin.V;
      V.mid(_v);
      const y = V.root.rotation.y, nx = Math.cos(y), nz = -Math.sin(y);
      const s = (cx - _v.x) * nx + (cz - _v.z) * nz >= 0 ? 1 : -1; // the ring side of the body
      st.tx = _v.x + nx * s * 20; st.tz = _v.z + nz * s * 20;
      st.tyaw = Math.atan2(_v.x - st.tx, _v.z - st.tz);
      st.mode = 'pin';
      return;
    }
    if (sp && sp.count && sp.count.who) {
      // At the ropes nearest the one outside, looking at it
      const f = W[sp.count.who];
      const lim = h - 7;
      st.tx = Math.max(cx - lim, Math.min(cx + lim, f.pos.x));
      st.tz = Math.max(cz - lim, Math.min(cz + lim, f.pos.z));
      st.tyaw = Math.atan2(f.pos.x - st.tx, f.pos.z - st.tz);
      st.mode = 'count';
      return;
    }
    // Idle: on the far side of the ring from the action, facing it (re-picked now and then, not every frame)
    st.pickT -= dt;
    const mx = (P.pos.x + R.pos.x) / 2, mz = (P.pos.z + R.pos.z) / 2;
    const close = Math.hypot(st.x - P.pos.x, st.z - P.pos.z) < P.radius + 10 || Math.hypot(st.x - R.pos.x, st.z - R.pos.z) < R.radius + 10;
    if (st.pickT <= 0 || close || ph !== 'fight') {
      st.pickT = 2.5;
      let dx = cx - mx, dz = cz - mz;
      const d = Math.hypot(dx, dz);
      if (d < 8) { dx = -(R.pos.z - P.pos.z); dz = R.pos.x - P.pos.x; } // they are in the middle: stand off to the side of their line
      const l = Math.hypot(dx, dz) || 1;
      st.tx = cx + dx / l * h * 0.72; st.tz = cz + dz / l * h * 0.72;
      if (ph === 'between' || ph === 'over' || ph === 'entrance') { st.tx = cx; st.tz = cz - h * 0.7; }
    }
    st.tyaw = Math.atan2(mx - st.x, mz - st.z);
  }

  function step(dt) {
    choose(dt);
    const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz);
    const vmax = st.mode === 'pin' ? 120 : st.mode === 'count' ? 60 : 32;
    const sp = d > 2 ? Math.min(vmax, d * 4) : 0;
    st.speed += (sp - st.speed) * (1 - Math.exp(-10 * dt));
    if (d > 0.01 && st.speed > 0.1) { const m = Math.min(d, st.speed * dt); st.x += dx / d * m; st.z += dz / d * m; }
    st.walk += st.speed * dt * 0.42;
    const face = st.speed > 20 && d > 6 ? Math.atan2(dx, dz) : st.tyaw;
    st.yaw += angDiff(face, st.yaw) * (1 - Math.exp(-9 * dt));
    st.crouch += ((st.mode === 'pin' && d < 10 ? 1 : 0) - st.crouch) * (1 - Math.exp(-12 * dt));
    // Arms: a count is up-then-chop (pin: up-then-slap); between counts the arm rises again, ready
    st.beatT += dt;
    const counting = st.mode === 'count' || st.mode === 'pin';
    const down = st.beat === 'slap' ? SLAP : CHOP;
    let r;
    if (st.beatT < 0.12) r = lerp(UP, down, st.beatT / 0.12);
    else if (counting) r = lerp(down, UP, smooth((st.beatT - 0.18) / 0.55));
    else r = lerp(down, -0.15, smooth((st.beatT - 0.12) / 0.5));
    st.armR += (r - st.armR) * (st.beatT < 0.12 ? 1 : 1 - Math.exp(-14 * dt));
    // the other arm: swinging when walking, pointing at a fighter being counted (go back in!)
    const l = st.mode === 'count' ? -1.45 : st.mode === 'pin' ? -0.5 : -Math.sin(st.walk) * 0.45 * Math.min(1, st.speed / 25);
    st.armL += (l - st.armL) * (1 - Math.exp(-8 * dt));
  }

  return {
    state: st,
    start() {
      for (const off of offs) off();
      offs = [];
      const a = A();
      if (a) { st.x = st.tx = a.cx; st.z = st.tz = a.cz - a.half * 0.7; st.yaw = 0; }
      st.beatT = 9; st.beat = ''; st.armR = -0.15; st.armL = 0; st.crouch = 0; st.speed = 0; st.pickT = 0;
      const on = (n, fn) => offs.push(W.bus.on(n, fn));
      on(EV.COUNTOUT_COUNT, (e) => { if (e.count > 0 && !e.held) { st.beatT = 0; st.beat = 'chop'; } });
      on(EV.PIN_COUNT, () => { st.beatT = 0; st.beat = 'slap'; });
      pose(true);
    },
    update(dt) {
      if (!W.player) return;
      if (dt > 0) step(dt);
      pose();
    },
    dispose() {
      for (const off of offs) off();
      offs = [];
      const a = A();
      if (a) { st.x = a.cx; st.z = a.cz - a.half * 0.7; st.yaw = 0; st.crouch = 0; st.speed = 0; st.armR = -0.15; st.armL = 0; pose(true); }
    },
  };
}
