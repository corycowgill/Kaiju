// Procedural animation for the shared 24-bone kaiju rig: the rig model, the
// pose solver and the clip baker. OWNER: animation engineer (with anims.js and
// animDefs.js). No DOM, no per-frame allocation outside the bake.
//
// How it works
//  - kaijuLoader records each GLB's bind pose in "rig space" (root-local x 18:
//    world units with the root at the origin, +Z forward, +X the kaiju's LEFT,
//    +Y up) as glb.rest. buildRig() turns that into a Rig: joint chains, limb
//    lengths, per-kaiju quirks.
//  - A pose is a flat struct of channels (newPose) that means the same thing on
//    every kaiju: hips offset / turn, spine and head bends as rotations about
//    the model axes, hand targets in arm lengths from the shoulder, foot
//    targets as offsets from the standing ankle. solvePose() turns it into
//    local bone quaternions with two-bone IK on arms and legs, so feet stay
//    where a pose puts them and hands reach the same relative spot on bodies
//    of different proportions.
//  - bakeClip() samples a pose function at 30 Hz into a THREE.AnimationClip.
//    Clips are built once per kaiju key and shared by every mixer.
//
// Angle conventions (radians, about rig axes, applied parent-relative):
//  pitch > 0 bows forward, yaw > 0 turns to the kaiju's left, roll > 0 leans
//  to its right. For both arms / legs "x" means outward from the midline, so
//  a symmetric pose uses the same numbers on both sides.
import * as THREE from 'three';

/** Per-kaiju rig quirks (measured from the skin weights, see the notes in
 *  devtools/anims):
 *  - Gorrak: the head mesh hangs on the `neck` bone (Head carries a sliver);
 *    its spike coat is skinned to the clavicles and upper arms.
 *  - Tridon: the whole tail AND the left thigh are skinned to LeftUpLeg, so
 *    that bone is its tail (the left leg only bends at the knee); the wings
 *    are skinned to the clavicles (they can flap); LeftFoot / LeftToeBase
 *    carry no vertices; the three heads are one block on Head.
 *  - Mechra: tail rigid on Hips. */
const QUIRKS = {
  godzilla: { headOnNeck: true, tailBone: '', wings: 0.3, tailLen: 6, name: 'Gorrak' },
  ghidorah: { headOnNeck: false, tailBone: 'LeftUpLeg', wings: 1, tailLen: 34, name: 'Tridon' },
  mecha:    { headOnNeck: false, tailBone: '', wings: 0.4, tailLen: 26, name: 'Mechra' },
};

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);

/** Quaternion of the frame whose X axis is d and whose Z axis is n made perpendicular to d. */
export function frameQuat(out, d, n) {
  const x = _v3.copy(d).normalize();
  const z = _v4.copy(n).addScaledVector(x, -n.dot(x));
  if (z.lengthSq() < 1e-8) z.set(x.y, x.z, x.x).addScaledVector(x, -(x.y * x.x + x.z * x.y + x.x * x.z));
  z.normalize();
  const y = _v5.crossVectors(z, x);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}
/** out = Ry(yaw) Rx(pitch) Rz(roll) */
export function eulerQuat(out, pitch, yaw, roll) {
  return out.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
}

function chain(rest, a, b, c) {
  const ia = rest.index[a], ib = rest.index[b], ic = rest.index[c];
  return { a: ia, b: ib, c: ic };
}

/**
 * The rig model for one kaiju key, from the loader's glb.rest.
 * Everything positional is in rig space (u).
 */
export function buildRig(key, rest) {
  const Q = QUIRKS[key] || QUIRKS.mecha;
  const n = rest.bones.length, I = rest.index;
  const R = {
    key, quirks: Q, n, names: rest.names, parent: rest.parent, index: I,
    wp: rest.wp, wq: rest.wq, wqInv: rest.wq.map((q) => q.clone().invert()),
    unit: rest.unit, origin: rest.origin,
    iHips: I.Hips, iS1: I.Spine02, iS2: I.Spine01, iS3: I.Spine, iNeck: I.neck, iHead: I.Head,
    iTail: Q.tailBone ? I[Q.tailBone] : -1,
    arm: [null, null], leg: [null, null],
    hipH: rest.wp[I.Hips].y,
  };
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 'Left' : 'Right', sign = s === 0 ? 1 : -1;
    // ---- arm: Arm -> ForeArm -> Hand ----
    const A = chain(rest, side + 'Arm', side + 'ForeArm', side + 'Hand');
    const u0 = rest.wp[A.b].clone().sub(rest.wp[A.a]), f0 = rest.wp[A.c].clone().sub(rest.wp[A.b]);
    const n0 = new THREE.Vector3().crossVectors(u0, f0);
    if (n0.length() < 0.05 * u0.length() * f0.length()) n0.set(0, 0, sign);   // straight at bind: hinge about a fixed axis
    R.arm[s] = { sign, iSh: I[side + 'Shoulder'], iUp: A.a, iLo: A.b, iEnd: A.c, l1: u0.length(), l2: f0.length(), len: u0.length() + f0.length(),
      qU0inv: frameQuat(new THREE.Quaternion(), u0, n0).invert(), qF0inv: frameQuat(new THREE.Quaternion(), f0, n0).invert() };
    // ---- leg: UpLeg -> Leg -> Foot ----
    const L = chain(rest, side + 'UpLeg', side + 'Leg', side + 'Foot');
    const hip0 = rest.wp[L.a], knee0 = rest.wp[L.b];
    let ankle0 = rest.wp[L.c].clone();
    const kneeOnly = L.a === R.iTail;
    if (kneeOnly) {
      // Tridon's left foot bone is parked in the tail: use the right ankle mirrored
      const o = rest.wp[I.RightFoot];
      ankle0 = new THREE.Vector3(-o.x, o.y, o.z);
    }
    const lu0 = knee0.clone().sub(hip0), lf0 = ankle0.clone().sub(knee0);
    const ln0 = new THREE.Vector3().crossVectors(lu0, lf0);
    if (ln0.length() < 0.05 * lu0.length() * lf0.length()) ln0.set(-1, 0, 0);
    const ha = ankle0.clone().sub(hip0).normalize();
    const pole0 = lu0.clone().addScaledVector(ha, -lu0.dot(ha));
    if (pole0.length() < 0.02 * lu0.length()) pole0.set(0, 0, 1);
    R.leg[s] = { sign, iUp: L.a, iLo: L.b, iEnd: L.c, iToe: I[side + 'ToeBase'], kneeOnly, ankle0, l1: lu0.length(), l2: lf0.length(), len: lu0.length() + lf0.length(),
      f0: lf0.clone(), pole0: pole0.normalize(),
      qU0inv: frameQuat(new THREE.Quaternion(), lu0, ln0).invert(), qF0inv: frameQuat(new THREE.Quaternion(), lf0, ln0).invert() };
  }
  R.armLen = (R.arm[0].len + R.arm[1].len) / 2;
  R.legLen = R.leg[1].len;
  R.shoulderY = rest.wp[R.arm[0].iUp].y;
  R.shoulderX = (rest.wp[R.arm[0].iUp].x - rest.wp[R.arm[1].iUp].x) / 2;
  R.headY = rest.wp[R.iHead].y;
  R.stanceX = Math.abs(R.leg[1].ankle0.x);
  // bake scratch
  R._D = Array.from({ length: n }, () => new THREE.Quaternion());
  R._P = Array.from({ length: n }, () => new THREE.Vector3());
  return R;
}

// ---------------------------------------------------------------------------
// Pose channels
// ---------------------------------------------------------------------------
const DEFAULTS = {
  // hips: offset from the standing position (u) and turn
  hx: 0, hy: 0, hz: 0, hpit: 0, hyaw: 0, hrol: 0,
  // spine low -> high (Spine02, Spine01, Spine), neck, head
  s1p: 0, s1y: 0, s1r: 0, s2p: 0, s2y: 0, s2r: 0, s3p: 0, s3y: 0, s3r: 0,
  nkp: 0, nky: 0, nkr: 0, hdp: 0, hdy: 0, hdr: 0,
  // tail (Tridon: a real joint; the others wag their hips, see tailWag in animDefs)
  tlp: 0, tly: 0, tlr: 0,
  // clavicles: Tridon's wings, Gorrak's spike coat, Mechra's shoulder pods. p = pitch (forward), y = sweep (back +), r = raise (up +)
  cLp: 0, cLy: 0, cLr: 0, cRp: 0, cRy: 0, cRr: 0,
  // arms: hand target from the shoulder in arm lengths, chest frame (x out, y up, z forward); elbow pole direction, same frame;
  // aXw = 1 switches to the absolute rig-space target aXwx.. (u, x outward from the midline); hand = wrist bend
  aLx: 0.3, aLy: -0.72, aLz: 0.22, eLx: 0.5, eLy: -0.3, eLz: -0.8, aLw: 0, aLwx: 0, aLwy: 0, aLwz: 0, hLp: 0, hLy: 0, hLr: 0,
  aRx: 0.3, aRy: -0.72, aRz: 0.22, eRx: 0.5, eRy: -0.3, eRz: -0.8, aRw: 0, aRwx: 0, aRwy: 0, aRwz: 0, hRp: 0, hRy: 0, hRr: 0,
  // legs, IK: foot offset from its standing spot (u; x outward, y up, z forward), toes-out yaw, heel-up pitch, knee-out bias
  fLx: 0, fLy: 0, fLz: 0, fLyaw: 0, fLpit: 0, kLo: 0,
  fRx: 0, fRy: 0, fRz: 0, fRyaw: 0, fRpit: 0, kRo: 0,
  // legs, FK (lXfk = 1): thigh flexion (knee forward +), abduction (out +), twist, knee bend (+), ankle pitch (toes down +)
  lLfk: 0, tLp: 0, tLr: 0, tLy: 0, kLb: 0, anLp: 0,
  lRfk: 0, tRp: 0, tRr: 0, tRy: 0, kRb: 0, anRp: 0,
  // 1 = lower the hips as far as needed for planted feet to reach their targets
  reach: 1,
};
export const POSE_KEYS = Object.freeze(Object.keys(DEFAULTS));
export function newPose() { return { ...DEFAULTS }; }
export function resetPose(P) { for (let i = 0; i < POSE_KEYS.length; i++) P[POSE_KEYS[i]] = DEFAULTS[POSE_KEYS[i]]; return P; }
export function copyPose(P, A) { for (let i = 0; i < POSE_KEYS.length; i++) P[POSE_KEYS[i]] = A[POSE_KEYS[i]]; return P; }
/** P = lerp(P, B, w) channel by channel. */
export function mixPose(P, B, w) {
  if (w <= 0) return P;
  for (let i = 0; i < POSE_KEYS.length; i++) { const k = POSE_KEYS[i]; P[k] += (B[k] - P[k]) * w; }
  return P;
}
const SWAP = [];
for (const k of POSE_KEYS) { const m = /^(a|e|h|f|k|t|c|an|l)L(.*)$/.exec(k); if (m && DEFAULTS[m[1] + 'R' + m[2]] !== undefined) SWAP.push([k, m[1] + 'R' + m[2]]); }
const FLIP = ['hx', 'hyaw', 'hrol', 's1y', 's1r', 's2y', 's2r', 's3y', 's3r', 'nky', 'nkr', 'hdy', 'hdr', 'tly', 'tlr'];
/** Mirror a pose left <-> right in place. */
export function mirrorPose(P) {
  for (let i = 0; i < SWAP.length; i++) { const a = SWAP[i][0], b = SWAP[i][1], t = P[a]; P[a] = P[b]; P[b] = t; }
  for (let i = 0; i < FLIP.length; i++) P[FLIP[i]] = -P[FLIP[i]];
  return P;
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------
const _T = new THREE.Vector3(), _S = new THREE.Vector3(), _pole = new THREE.Vector3(), _el = new THREE.Vector3(), _nn = new THREE.Vector3();
const _du = new THREE.Quaternion(), _df = new THREE.Quaternion(), _fk = new THREE.Quaternion(), _fk2 = new THREE.Quaternion(), _hy = new THREE.Quaternion();

/**
 * Two-bone IK in rig space. S = root joint, T = target for the end joint,
 * pole = direction the middle joint should lean toward. Writes the absolute
 * rig-space deltas of the two bones (relative to bind) and the middle joint.
 */
export function twoBone(c, S, T, pole, dUp, dLo, mid) {
  const t = _v1.copy(T).sub(S);
  let d = t.length();
  if (d < 1e-5) { t.set(0, -1, 0); d = 1e-5; } else t.multiplyScalar(1 / d);
  d = Math.min((c.l1 + c.l2) * 0.999, Math.max(Math.abs(c.l1 - c.l2) * 1.02 + 1e-3, d));
  const a = (c.l1 * c.l1 - c.l2 * c.l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c.l1 * c.l1 - a * a));
  const p = _v2.copy(pole).addScaledVector(t, -pole.dot(t));
  if (p.lengthSq() < 1e-8) p.set(t.y, t.z, t.x).addScaledVector(t, -(t.y * t.x + t.z * t.y + t.x * t.z));
  p.normalize();
  mid.copy(S).addScaledVector(t, a).addScaledVector(p, h);
  _nn.crossVectors(p, t);                         // bend-plane normal, same handedness as cross(upper, lower) at bind
  frameQuat(dUp, _v2.copy(mid).sub(S), _nn).multiply(c.qU0inv);
  frameQuat(dLo, _v2.copy(S).addScaledVector(t, d).sub(mid), _nn).multiply(c.qF0inv);   // toward the (clamped) target
}

/**
 * Solve pose P on rig R. Writes R._D (absolute rig-space delta per bone),
 * R._P (rig-space joint positions) and, when given, local quaternions into
 * outQ (n x 4) and the hips' local position into outHip (3).
 */
export function solvePose(R, P, outQ, outHip) {
  const D = R._D, pos = R._P, wp = R.wp, par = R.parent, Q = R.quirks;
  const iH = R.iHips;
  eulerQuat(D[iH], P.hpit, P.hyaw, P.hrol);
  pos[iH].set(wp[iH].x + P.hx, wp[iH].y + P.hy, wp[iH].z + P.hz);
  eulerQuat(_hy, 0, P.hyaw, 0);
  // Hip drop so planted feet can reach (two passes: the hip joints move with the hips)
  if (P.reach > 0) {
    let drop = 0;
    for (let s = 0; s < 2; s++) {
      const L = R.leg[s], fkW = s === 0 ? P.lLfk : P.lRfk;
      if (fkW > 0.5 || L.kneeOnly) continue;
      const hip = _v1.copy(wp[L.iUp]).sub(wp[iH]).applyQuaternion(D[iH]).add(pos[iH]);
      const fx = s === 0 ? P.fLx : P.fRx, fy = s === 0 ? P.fLy : P.fRy, fz = s === 0 ? P.fLz : P.fRz;
      const tx = L.ankle0.x + L.sign * fx - hip.x, ty = L.ankle0.y + fy - hip.y, tz = L.ankle0.z + fz - hip.z;
      const dh2 = tx * tx + tz * tz, max = L.len * 0.985;
      if (dh2 + ty * ty > max * max) {
        const need = dh2 < max * max ? Math.sqrt(max * max - dh2) : 0;   // hip height above the ankle that just reaches
        drop = Math.max(drop, -ty - need);
      }
    }
    pos[iH].y -= drop * P.reach;
  }
  for (let i = 0; i < R.n; i++) {
    if (i === iH) continue;
    const p = par[i];
    if (p < 0) { D[i].identity(); pos[i].copy(wp[i]); continue; }
    pos[i].copy(wp[i]).sub(wp[p]).applyQuaternion(D[p]).add(pos[p]);
    D[i].copy(D[p]);
  }
  // (the loop above gave every bone its parent's delta in skeleton order; now the driven joints, root to leaf)
  const setLocal = (i, pitch, yaw, roll) => {
    D[i].copy(D[par[i]]).multiply(eulerQuat(_q1, pitch, yaw, roll));
  };
  const refresh = (i) => { const p = par[i]; pos[i].copy(wp[i]).sub(wp[p]).applyQuaternion(D[p]).add(pos[p]); };
  setLocal(R.iS1, P.s1p, P.s1y, P.s1r);
  refresh(R.iS2); setLocal(R.iS2, P.s2p, P.s2y, P.s2r);
  refresh(R.iS3); setLocal(R.iS3, P.s3p, P.s3y, P.s3r);
  refresh(R.iNeck);
  if (Q.headOnNeck) { setLocal(R.iNeck, P.nkp + P.hdp, P.nky + P.hdy, P.nkr + P.hdr); refresh(R.iHead); D[R.iHead].copy(D[R.iNeck]); }
  else { setLocal(R.iNeck, P.nkp, P.nky, P.nkr); refresh(R.iHead); setLocal(R.iHead, P.hdp, P.hdy, P.hdr); }
  for (let i = 0; i < R.n; i++) if (par[i] === R.iHead) { refresh(i); D[i].copy(D[R.iHead]); }
  // ---- arms ----
  for (let s = 0; s < 2; s++) {
    const A = R.arm[s], L = s === 0, sg = A.sign;
    refresh(A.iSh);
    // clavicle: raise about Z (outward-up), sweep about Y, pitch about X
    D[A.iSh].copy(D[R.iS3]).multiply(eulerQuat(_q1, L ? P.cLp : P.cRp, sg * (L ? P.cLy : P.cRy), sg * (L ? P.cLr : P.cRr)));
    refresh(A.iUp);
    _S.copy(pos[A.iUp]);
    _T.set(sg * (L ? P.aLx : P.aRx), L ? P.aLy : P.aRy, L ? P.aLz : P.aRz).multiplyScalar(A.len).applyQuaternion(D[R.iS3]).add(_S);
    const w = L ? P.aLw : P.aRw;
    if (w > 0) _T.lerp(_v3.set(sg * (L ? P.aLwx : P.aRwx), L ? P.aLwy : P.aRwy, L ? P.aLwz : P.aRwz), w);
    _pole.set(sg * (L ? P.eLx : P.eRx), L ? P.eLy : P.eRy, L ? P.eLz : P.eRz).applyQuaternion(D[R.iS3]);
    twoBone(A, _S, _T, _pole, D[A.iUp], D[A.iLo], pos[A.iLo]);
    refresh(A.iEnd);
    D[A.iEnd].copy(D[A.iLo]).multiply(eulerQuat(_q1, L ? P.hLp : P.hRp, sg * (L ? P.hLy : P.hRy), sg * (L ? P.hLr : P.hRr)));
  }
  // ---- legs ----
  for (let s = 0; s < 2; s++) {
    const G = R.leg[s], L = s === 0, sg = G.sign;
    const fkW = L ? P.lLfk : P.lRfk;
    const tp = L ? P.tLp : P.tRp, tr = L ? P.tLr : P.tRr, ty = L ? P.tLy : P.tRy, kb = L ? P.kLb : P.kRb, anp = L ? P.anLp : P.anRp;
    const fyaw = sg * (L ? P.fLyaw : P.fRyaw), fpit = L ? P.fLpit : P.fRpit;
    refresh(G.iUp);
    _S.copy(pos[G.iUp]);
    _T.set(G.ankle0.x + sg * (L ? P.fLx : P.fRx), G.ankle0.y + (L ? P.fLy : P.fRy), G.ankle0.z + (L ? P.fLz : P.fRz));
    // foot orientation when planted: flat, turned by its yaw, heel raised by its pitch
    eulerQuat(_q2, fpit, fyaw, 0);
    if (G.kneeOnly) {
      // the thigh is the tail: it only follows the hips and the tail channels; the shin aims at the target
      D[G.iUp].copy(D[iH]).multiply(eulerQuat(_q1, P.tlp, P.tly, P.tlr));
      refresh(G.iLo);
      _v1.copy(G.f0).applyQuaternion(D[G.iUp]).normalize();
      _v2.copy(_T).sub(pos[G.iLo]);
      if (_v2.lengthSq() > 1e-6) _q3.setFromUnitVectors(_v1, _v2.normalize()); else _q3.identity();
      _du.copy(_q3).multiply(D[G.iUp]);                               // IK shin
      _fk.copy(D[G.iUp]).multiply(eulerQuat(_q1, kb, 0, 0));          // FK shin
      D[G.iLo].copy(_du).slerp(_fk, fkW);
      refresh(G.iEnd); D[G.iEnd].copy(D[G.iLo]);
      refresh(G.iToe); D[G.iToe].copy(D[G.iLo]);
      continue;
    }
    // IK
    _pole.copy(G.pole0).applyQuaternion(_hy).applyQuaternion(eulerQuat(_q1, 0, fyaw * 0.6, 0));
    _pole.x += sg * (L ? P.kLo : P.kRo);
    twoBone(G, _S, _T, _pole, _du, _df, _el);
    if (fkW > 0) {
      // FK: thigh from the hips, shin from the thigh
      _fk.copy(D[iH]).multiply(eulerQuat(_q1, -tp, sg * ty, sg * tr));
      _fk2.copy(_fk).multiply(eulerQuat(_q1, kb, 0, 0));
      _du.slerp(_fk, fkW); _df.slerp(_fk2, fkW);
    }
    D[G.iUp].copy(_du); D[G.iLo].copy(_df);
    refresh(G.iLo); refresh(G.iEnd);
    if (fkW > 0) { _q3.copy(_df).multiply(eulerQuat(_q1, anp, 0, 0)); _q2.slerp(_q3, fkW); }
    D[G.iEnd].copy(_q2);
    refresh(G.iToe); D[G.iToe].copy(_q2);
  }
  if (R.iTail >= 0 && !R.leg[0].kneeOnly && !R.leg[1].kneeOnly) {
    const i = R.iTail; refresh(i); setLocal(i, P.tlp, P.tly, P.tlr);
  }
  if (outQ) {
    for (let i = 0; i < R.n; i++) {
      const p = par[i];
      _q1.copy(D[i]).multiply(R.wq[i]);
      if (p >= 0) { _q2.copy(D[p]).multiply(R.wq[p]).invert(); _q1.premultiply(_q2); }
      _q1.normalize();
      outQ[i * 4] = _q1.x; outQ[i * 4 + 1] = _q1.y; outQ[i * 4 + 2] = _q1.z; outQ[i * 4 + 3] = _q1.w;
    }
  }
  if (outHip) {
    outHip[0] = (pos[iH].x - R.origin.x) / R.unit; outHip[1] = (pos[iH].y - R.origin.y) / R.unit; outHip[2] = (pos[iH].z - R.origin.z) / R.unit;
  }
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------
const FPS = 30;
const _bakePose = newPose();
/**
 * Sample def.pose(t, P, R, dur) at 30 Hz into an AnimationClip for rig R.
 * def: { dur, pose, loop }. A looping clip's last key repeats its first.
 */
export function bakeClip(R, name, def) {
  const dur = def.dur, N = Math.max(2, Math.round(dur * FPS) + 1);
  const times = new Float32Array(N), q = new Float32Array(R.n * 4), hip = [0, 0, 0];
  const qs = Array.from({ length: R.n }, () => new Float32Array(N * 4)), hp = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const t = dur * k / (N - 1);
    times[k] = t;
    resetPose(_bakePose);
    def.pose(def.loop && k === N - 1 ? 0 : t, _bakePose, R, dur);
    solvePose(R, _bakePose, q, hip);
    hp[k * 3] = hip[0]; hp[k * 3 + 1] = hip[1]; hp[k * 3 + 2] = hip[2];
    for (let i = 0; i < R.n; i++) {
      const o = qs[i], b = k * 4;
      let x = q[i * 4], y = q[i * 4 + 1], z = q[i * 4 + 2], w = q[i * 4 + 3];
      // keep neighbouring keys in the same hemisphere so the interpolation takes the short way
      if (k > 0 && o[b - 4] * x + o[b - 3] * y + o[b - 2] * z + o[b - 1] * w < 0) { x = -x; y = -y; z = -z; w = -w; }
      o[b] = x; o[b + 1] = y; o[b + 2] = z; o[b + 3] = w;
    }
  }
  const tracks = [new THREE.VectorKeyframeTrack('Hips.position', times, hp)];
  for (let i = 0; i < R.n; i++) tracks.push(new THREE.QuaternionKeyframeTrack(R.names[i] + '.quaternion', times, qs[i]));
  return new THREE.AnimationClip(name, dur, tracks);
}

// ---------------------------------------------------------------------------
// Curve helpers for pose functions
// ---------------------------------------------------------------------------
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeIn = (x) => { x = clamp01(x); return x * x; };
export const easeOut = (x) => { x = clamp01(x); return 1 - (1 - x) * (1 - x); };
/** 0 -> 1 between a and b (smoothstep). */
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
export const rampIn = (t, a, b) => easeIn((t - a) / (b - a));
export const rampOut = (t, a, b) => easeOut((t - a) / (b - a));
/** 0 -> 1 -> 0: up over [a, b], held, down over [c, d]. */
export const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
/** Piecewise curve through keys [t0, v0, t1, v1, ...]; smoothstep between keys, held outside. ease: 0 smooth, 1 in, 2 out, 3 linear. */
export function kf(t, keys, ease = 0) {
  const n = keys.length;
  if (t <= keys[0]) return keys[1];
  for (let i = 2; i < n; i += 2) {
    if (t <= keys[i]) {
      let x = (t - keys[i - 2]) / (keys[i] - keys[i - 2]);
      x = ease === 0 ? smooth(x) : ease === 1 ? x * x : ease === 2 ? 1 - (1 - x) * (1 - x) : x;
      return keys[i - 1] + (keys[i + 1] - keys[i - 1]) * x;
    }
  }
  return keys[n - 1];
}
/** Damped wobble starting at t0: sin(freq (t - t0)) e^(-damp (t - t0)), 0 before. */
export const wobble = (t, t0, freq, damp) => (t < t0 ? 0 : Math.sin((t - t0) * freq) * Math.exp(-(t - t0) * damp));
export const TAU = Math.PI * 2;
