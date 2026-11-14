// Wrestling animation layer: named anims played on either kaiju.
// OWNER: animation engineer (anims.js, animRig.js, animDefs.js, ../kaijuLoader.js).
//
// No kaiju ships a wrestling clip, so every name below is built in code:
//  - animDefs.js describes each anim as a pose function over time, in channels
//    that mean the same thing on all three bodies; animRig.js solves it on a
//    kaiju's bind pose (IK arms and legs) and bakes a THREE.AnimationClip.
//    Clips are baked once per kaiju key and shared across restarts and mixers.
//  - They play on the kaiju's own mixer through kaijuLoader's state machine, so
//    they crossfade with the mocap clips the classic powers still use.
//  - On top of the clips, after both mixers have ticked each frame, this module
//    adds what cannot be baked: locomotion picked from the root's real
//    velocity (stance, walk, back-pedal, strafe, run - time-scaled so feet do
//    not skate), a recoil spring through spine and head on every hit (weighted
//    by where on the body it landed), inertia (torso, arms, wings / coat, tail
//    and - off the ground - legs lag behind the root's own acceleration and
//    spin, on springs: follow-through on every start, stop, throw and landing),
//    heads that track the opponent, and hand IK that puts the holder's hands on the
//    other body in lock-ups, lifts, swings and pins whatever the two kaiju's
//    proportions are.
// The combat core moves the ROOTS (position, yaw, and the pitch / roll of a
// lying, held or thrown body: Fighter.setPose / lie / lean); the anims marked
// rootDriven are body-frame poses meant to sit on a root tipped that way.
import * as THREE from 'three';
import { EV } from './events.js';
import { buildRig, bakeClip, twoBone, eulerQuat } from './animRig.js';
import { DEFS } from './animDefs.js';

/** name -> { loop, hold, rootDriven, clips, dur, marks }.
 *  loop:  plays until stop() / the next play();
 *  hold:  one-shot that stays on its last frame (poses: downed, ko);
 *  rootDriven: a body-frame pose; the combat core lays the root down / carries it;
 *  clips: mocap clip keys used only if the procedural clip cannot be built;
 *  dur:   seconds at timeScale 1 (loops: one cycle);
 *  marks: named moments in seconds (contact frames, releases), see animDefs.js. */
const FALLBACK = {
  strike_1: ['punch'], strike_2: ['punch'], strike_3: ['punch'], heavy: ['skill1', 'punch'], clothesline: ['skill3', 'punch'],
  splash: ['jump', 'stomp'], stomp: ['stomp'], block: ['idle2'], block_hit: [], hit_high: [], hit_low: [], stagger: [], stunned: ['idle2'],
  grab_reach: ['punch'], lockup: ['idle2'], lift: ['cast2', 'cast1'], carried: ['idle2'], throw: ['skill1', 'punch'], whip_send: ['punch'],
  whip_run: ['run'], suplex: ['cast3', 'stomp'], swing: ['walk'], knockdown: ['death', 'dead'], downed: ['dead', 'death'], getup: [],
  pin_cover: ['stomp'], pinned: ['dead', 'death'], kickout: ['jump'], taunt_a: ['cheer', 'shrug', 'skill2'], taunt_b: ['cast2', 'skill2'],
  taunt_win: ['dance'], finisher_windup: ['cast3', 'skill2'], finisher_strike: ['stomp'], finisher_victim: ['dead', 'death'],
  ko: ['death', 'dead'], entrance: ['walk'],
  power_beam: ['skill1', 'cast1'], power_roar: ['skill2', 'cast2'], power_charge: ['skill3', 'stomp'], power_stomp: ['jump', 'stomp'], power_ult: ['cast3', 'stomp'],
  // signature grapples (signatures.js): the thrower's clip for sig 1 / sig 2 (one per kaiju), and the victim's
  sig_a: ['skill1', 'punch'], sig_b: ['skill1', 'punch'], sig_victim: [],
};
export const ANIMS = Object.freeze(Object.fromEntries(Object.keys(FALLBACK).map((name) => {
  const d = DEFS[name] || {};
  return [name, Object.freeze({ loop: !!d.loop, hold: !!d.hold, rootDriven: !!d.rootDriven, clips: FALLBACK[name], dur: d.dur || 0, marks: Object.freeze({ ...(d.marks || {}) }) })];
})));
export const ANIM_NAMES = Object.freeze(Object.keys(ANIMS));
/** Timing data for the combat core / camera / VFX: ANIM_INFO[name] = { dur, loop, hold, marks }. */
export const ANIM_INFO = ANIMS;

// Baked clips, shared by every instance of a kaiju: key -> { R, clips: { name -> AnimationClip } }
const RIGS = {};
function rigFor(glb) {
  if (!glb || !glb.rest || !glb.key) return null;
  return RIGS[glb.key] || (RIGS[glb.key] = { R: buildRig(glb.key, glb.rest), clips: {} });
}
const ckey = (name) => 'w_' + name;

/** Bake and register every clip for a loaded kaiju, a few per slice, yielding
 *  between slices. game.js awaits this behind the loading screen (perf): the
 *  45 clips cost 25-35 ms each and start() used to bake both kaiju's at the
 *  bell, a 1.4-3 s frozen frame as the match began. start()'s own ensure()
 *  then finds every clip present. */
export async function prebakeAnims(glb, sliceMs = 30) {
  const rig = rigFor(glb);
  if (!rig) return;
  let t0 = performance.now();
  for (const name in DEFS) {
    const key = ckey(name);
    if (glb.actions[key]) continue;
    const def = DEFS[name];
    glb.addClip(key, rig.clips[name] || (rig.clips[name] = bakeClip(rig.R, key, def)), !def.loop);
    if (performance.now() - t0 > sliceMs) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
  }
}

const LOCO = { idle: 0, walk: 1, back: 1, strafe_l: 1, strafe_r: 1, run: 1 };

// ---- hand IK: where the hands go on the OTHER body, per anim ----
// L / R: anchor bones on the opponent for my left / right hand (null = that
// hand is not used). Two bones + split: the two support points of a carried
// body, shared out so the arms do not cross. t0..t1: the clip-time window the
// grip holds (loops: always). fade: seconds to ease in / out. out: elbow-out
// bias. press: how far (u) the hand stops short of the bone, toward my
// shoulder, so it rests on the surface. wrap: reach round the far side (u).
// w: peak weight.
const GRIP = {
  lockup:          { L: ['RightArm'], R: ['LeftForeArm'], t0: 0, t1: 1e9, fade: 0.22, out: 0.5, press: 2.5 },
  grab_reach:      { L: ['RightArm'], R: ['LeftArm'], t0: 0.2, t1: 0.5, fade: 0.1, out: 0.5, press: 2.5 },
  lift:            { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0.0, t1: 1e9, fade: 0.15, out: 1, press: 4.5, split: true },
  carry_idle:      { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0, t1: 1e9, fade: 0.1, out: 1, press: 4.5, split: true },
  carry_walk:      { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0, t1: 1e9, fade: 0.1, out: 1, press: 4.5, split: true },
  throw:           { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0, t1: 0.24, fade: 0.08, out: 1, press: 4.5, split: true },
  suplex:          { L: ['Hips'], R: ['Hips'], t0: 0.12, t1: 0.9, fade: 0.12, out: 0.8, press: 3.5, wrap: 3 },
  swing:           { L: ['RightFoot', 'LeftFoot'], R: ['RightFoot', 'LeftFoot'], t0: 0, t1: 1e9, fade: 0.2, out: 0.3, press: 0, split: true },
  whip_send:       { L: ['LeftForeArm'], R: ['LeftForeArm'], t0: 0, t1: 0.44, fade: 0.1, out: 0.4, press: 1 },
  pin_cover:       { L: ['Spine'], R: ['Hips'], t0: 0.1, t1: 1e9, fade: 0.2, out: 0.8, press: 4 },
  finisher_windup: { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0.3, t1: 1e9, fade: 0.15, out: 1, press: 4.5, split: true },
  fin_rise:        { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0, t1: 1e9, fade: 0.1, out: 1, press: 4.5, split: true },
  finisher_strike: { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0, t1: 0.5, fade: 0.1, out: 1, press: 4.5, split: true },
  // strikes: the hitting hand finds the target for the contact frames
  strike_1:        { L: ['Head'], R: null, t0: 0.16, t1: 0.3, fade: 0.07, out: 0.4, press: 3, w: 0.8 },
  strike_2:        { L: null, R: ['Spine'], t0: 0.14, t1: 0.27, fade: 0.07, out: 1, press: 4, w: 0.8 },
  strike_3:        { L: ['Head'], R: ['Head'], t0: 0.24, t1: 0.36, fade: 0.06, out: 0.8, press: 3, w: 0.7 },
  heavy:           { L: null, R: ['Head'], t0: 0.5, t1: 0.62, fade: 0.07, out: 1, press: 3, w: 0.8 },
  // signatures, per kaiju ('name.key'); windows in clip time (the clips are 2 s, stretched to the move: signatures.js)
  'sig_a.godzilla': { L: null, R: ['neck'], t0: 0.15, t1: 1.42, fade: 0.12, out: 0.6, press: 2 },
  'sig_b.godzilla': { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0.18, t1: 1.54, fade: 0.12, out: 1, press: 4, split: true },
  'sig_a.ghidorah': { L: ['Head'], R: ['Head'], t0: 0.47, t1: 1.18, fade: 0.1, out: 0.8, press: 3, w: 0.7 },
  'sig_b.ghidorah': { L: ['Head'], R: ['Spine'], t0: 0.1, t1: 1.38, fade: 0.12, out: 0.6, press: 2.5 },
  'sig_a.mecha':    { L: ['Spine', 'Hips'], R: ['Spine', 'Hips'], t0: 0.12, t1: 1.12, fade: 0.12, out: 1, press: 4, split: true },
  'sig_b.mecha':    { L: ['Hips'], R: ['Hips'], t0: 0.15, t1: 1.2, fade: 0.12, out: 0.8, press: 3.5, wrap: 3 },
};

// ---- anchors: named points on a body for effects (W.anims.anchor) ----
// name -> [bone, x, y, z]: an offset from the bone in rig space at the bind pose (u; +x the kaiju's left, +z forward), carried by the bone.
// Measured by eye on the bind meshes: good to a couple of units.
const ANCHORS = {
  godzilla: { head: ['neck', 0, 3, 3], crown: ['neck', 0, 6.5, 1], mouth: ['neck', 0, 0, 6], chest: ['Spine', 0, -1, 6], back: ['Spine', 0, 2, -6] },
  ghidorah: { head: ['Head', 0, 3.5, 9], headL: ['Head', 5, 2.5, 9], headR: ['Head', -5, 2.5, 9], crown: ['Head', 0, 7.5, 6], mouth: ['Head', 0, 1.5, 13], chest: ['Spine', 0, -3, 4], back: ['Spine', 0, 1, -5] },
  mecha:    { head: ['Head', 0, 1, 6], crown: ['Head', 0, 2.8, 3], mouth: ['Head', 0, -0.5, 10], chest: ['Spine', 0, -3, 4.5], back: ['Spine', 0, 0, -5] },
};
const ANCHOR_ALIAS = { headL: 'head', headR: 'head' };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _pole = new THREE.Vector3(), _mid = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _dU = new THREE.Quaternion(), _dF = new THREE.Quaternion(), _rootQ = new THREE.Quaternion();
const _ikArm = { l1: 0, l2: 0, qU0inv: null, qF0inv: null };
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clampTo = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---- inertia: springs on the parts that hang off the body, driven by the root's motion ----
// k / c: stiffness and damping (1/s^2, 1/s); g: spring force per u/s^2 of root acceleration in the body frame;
// lim: how far a part may swing (rad). Steady lag under an acceleration a is g * a / k.
export const INERTIA = {
  aMax: 420,                                       // root acceleration is clamped here (a landing, a teleport that slipped through)
  torso: 0.25,                                      // (on the recoil spring: k 190)
  torsoYaw: 6,                                     // twist against the turn, per rad/s
  arm:  { k: 110, c: 6.5, g: 0.33, up: 0.8, fling: 15, lim: 1.1, tuck: 0.15, fore: 0.5 },
  leg:  { k: 120, c: 8, g: 0.3, lim: 0.8, knee: 0.5 },
  wing: { k: 90, c: 5, g: 0.18, lim: 0.6 },
  tail: { k: 70, c: 5, g: 0.15, turn: 5.8, lim: 0.7, limGround: 0.16 },
  calm: 0.4,                                       // arms while the body is doing a move of its own (a strike keeps its line)
};
// states in which the body is not in charge of its own limbs
const LOOSE = { airborne: 1, downed: 1, staggered: 1, stunned: 1, ko: 1, grappled: 1, pinned: 1 };
// spring channels (angle, velocity pairs in st.S)
const S_ALP = 0, S_ALR = 2, S_ARP = 4, S_ARR = 6, S_LP = 8, S_LR = 10, S_WUP = 12, S_WBK = 14, S_TP = 16, S_TY = 18, S_N = 20;
function sprung(S, i, force, k, c, h, lo, hi) {
  S[i + 1] += (force - k * S[i] - c * S[i + 1]) * h;
  S[i] += S[i + 1] * h;
  if (S[i] < lo) { S[i] = lo; if (S[i + 1] < 0) S[i + 1] = 0; } else if (S[i] > hi) { S[i] = hi; if (S[i + 1] > 0) S[i + 1] = 0; }
}
const _once = { duration: undefined, commit: undefined, hold: false, restart: true };

/** @returns {{ start, play, stop, current, update, updateIdle, dispose, info, markTime }} */
export function createAnims(ctx, W) {
  // Per-fighter runtime state, rebuilt whenever a fighter's GLB changes (restart, title defense)
  const states = { player: null, rival: null };
  let started = false;
  const offs = [];

  function makeState(f) {
    const rig = rigFor(f.glb);
    return {
      f, glb: f.glb, rig, R: rig ? rig.R : null,
      anim: '', loop: false, hold: false,      // wrestling anim in force ('' = locomotion)
      sub: '',                                  // private clip standing in for it (carry_idle / carry_walk / fin_rise)
      // layers: bones this module writes after the mixer, the mixer's values for them, and what was written
      B: null, mod: null, base: null, wrote: null,
      // recoil spring (pitch, yaw, roll: angle + velocity), head tracking, grip weights and targets
      sp: 0, sv: 0, sy: 0, syv: 0, sr: 0, srv: 0, lookY: 0, lookP: 0, gripL: 0, gripR: 0, gripName: '',
      gL: new THREE.Vector3(), gR: new THREE.Vector3(),
      gait: '', gaitT: 0, px: f.root.position.x, pz: f.root.position.z, vx: 0, vz: 0, yaw: f.root.rotation.y, yawRate: 0,
      // inertia: the root's height, vertical speed, acceleration (world), pitch / roll and their rates; the limb springs; how high the last hit landed (0 feet .. 1 head); legs loose (0..1)
      py: f.root.position.y, vy: 0, ax: 0, ay: 0, az: 0, rx: f.root.rotation.x, rz: f.root.rotation.z, wP: 0, wR: 0,
      S: new Float32Array(S_N), hi: 0.6, air: 0,
    };
  }
  function stateOf(f) {
    let st = states[f.id];
    if (!st || st.glb !== f.glb) {
      st = states[f.id] = makeState(f);
      if (started) f.glb.lockLoco(true);
    }
    return st;
  }
  function bonesOf(st) {
    if (st.mod || !st.R) return;
    const R = st.R;
    st.B = st.glb.rest.bones;
    st.mod = [R.iS2, R.iS3, R.iNeck, R.iHead, R.arm[0].iUp, R.arm[0].iLo, R.arm[1].iUp, R.arm[1].iLo];
    // (inertia also swings the clavicles - wings, spike coat, shoulder pods -, the legs of a body off the ground, and a tail that has a bone)
    for (const i of [R.arm[0].iSh, R.arm[1].iSh, R.leg[0].iUp, R.leg[0].iLo, R.leg[1].iUp, R.leg[1].iLo, R.iTail]) if (i >= 0 && !st.mod.includes(i)) st.mod.push(i);
    st.base = st.mod.map(() => new THREE.Quaternion());
    st.wrote = st.mod.map(() => new THREE.Quaternion(9, 9, 9, 9));
  }

  // ---- layers on top of the mixer's pose ----
  // Rotate bone i by a pitch / yaw / roll given about the rig axes, relative to its parent (the convention of the pose channels)
  function nudge(st, i, pitch, yaw, roll) {
    const R = st.R, p = R.parent[i];
    eulerQuat(_q1, pitch, yaw, roll);
    _q2.copy(R.wqInv[p]).multiply(_q1).multiply(R.wq[p]);
    st.B[i].quaternion.premultiply(_q2);
  }
  function springs(st, dt) {
    const k = 190, c = 9;                         // ~2.2 Hz, lightly damped: one clear overshoot
    const R = st.R, f = st.f, S = st.S, I = INERTIA;
    if (dt > 0) {
      const h = Math.min(dt, 0.033);
      // The root's acceleration in the body's own frame (+x its left, +y its up, +z its front): everything that
      // hangs off the body lags behind it. Upright chains (spine, neck) tip away from it, hanging ones (arms, legs) trail it.
      f.root.getWorldQuaternion(_rootQ).invert();
      _v1.set(st.ax, st.ay, st.az).applyQuaternion(_rootQ);
      const lx = _v1.x, ly = _v1.y, lz = _v1.z, spin = Math.min(6, Math.abs(st.wP) + Math.abs(st.wR));
      st.sv += (-I.torso * lz - k * st.sp - c * st.sv) * h; st.sp += st.sv * h;
      st.syv += (-I.torsoYaw * clampTo(st.yawRate, -5, 5) - k * st.sy - c * st.syv) * h; st.sy += st.syv * h;
      st.srv += (I.torso * lx - k * st.sr - c * st.srv) * h; st.sr += st.srv * h;
      st.sp = clampTo(st.sp, -0.6, 0.6); st.sy = clampTo(st.sy, -0.6, 0.6); st.sr = clampTo(st.sr, -0.6, 0.6);
      // arms: trailing the body; out from the sides in free fall and in a tumble, pressed in on a landing
      const A = I.arm, up = -ly * A.up + spin * A.fling;
      for (let s = 0; s < 2; s++) {
        const sign = R.arm[s].sign, o = s ? S_ARP : S_ALP;
        sprung(S, o, A.g * lz, A.k, A.c, h, -A.lim, A.lim);
        sprung(S, o + 2, -A.g * lx + sign * up, A.k, A.c, h, sign > 0 ? -A.tuck : -A.lim, sign > 0 ? A.lim : A.tuck);
      }
      // legs: only loose on a body off its feet (held up, thrown, tumbling)
      const off = f.held && (f.root.position.y > 2.5 || Math.abs(f.root.rotation.x) > 0.4 || Math.abs(f.root.rotation.z) > 0.4) ? 1 : 0;
      st.air += (off - st.air) * (1 - Math.exp(-h * 9));
      const L = I.leg;
      sprung(S, S_LP, L.g * lz, L.k, L.c, h, -L.lim, L.lim);
      sprung(S, S_LR, -L.g * lx, L.k, L.c, h, -L.lim, L.lim);
      // wings / coat / pods on the clavicles: tips lag up-down and fore-aft
      const Wg = I.wing;
      sprung(S, S_WUP, -Wg.g * ly, Wg.k, Wg.c, h, -Wg.lim, Wg.lim);
      sprung(S, S_WBK, Wg.g * lz, Wg.k, Wg.c, h, -Wg.lim, Wg.lim);
      // tail (a cantilever out of the back): whips against a turn and a sidestep, droops under a lift
      if (R.iTail >= 0) {
        const T = I.tail, lim = T.limGround + (T.lim - T.limGround) * st.air;
        sprung(S, S_TP, -T.g * ly, T.k, T.c, h, -lim, lim);
        sprung(S, S_TY, T.g * lx - T.turn * clampTo(st.yawRate, -5, 5), T.k, T.c, h, -lim, lim);
      }
    }
    // where the last hit landed shifts the recoil: high = the head and neck snap, low = the trunk folds
    const lowW = 1.25 - 0.5 * st.hi, highW = 0.7 + 0.6 * st.hi;
    if (Math.abs(st.sp) + Math.abs(st.sy) + Math.abs(st.sr) >= 1e-4) {
      nudge(st, R.iS2, st.sp * 0.4 * lowW, st.sy * 0.4 * lowW, st.sr * 0.4 * lowW);
      nudge(st, R.iS3, st.sp * 0.35, st.sy * 0.4, st.sr * 0.3);
      nudge(st, R.iNeck, st.sp * 0.45 * highW, st.sy * 0.3 * highW, st.sr * 0.4 * highW);
      if (!R.quirks.headOnNeck) nudge(st, R.iHead, st.sp * 0.4 * highW, st.sy * 0.2 * highW, st.sr * 0.3 * highW);
    }
    // arms (less of it while the body is throwing a move of its own)
    const calm = st.anim && !LOOSE[f.state] && !f.held ? I.calm : 1;
    for (let s = 0; s < 2; s++) {
      const o = s ? S_ARP : S_ALP, p = S[o] * calm, r = S[o + 2] * calm, G = R.arm[s];
      if (Math.abs(p) + Math.abs(r) < 1e-3) continue;
      nudge(st, G.iUp, p, 0, r);
      nudge(st, G.iLo, p * I.arm.fore, 0, 0);
    }
    if (st.air > 0.01 && Math.abs(S[S_LP]) + Math.abs(S[S_LR]) > 1e-3) {
      for (let s = 0; s < 2; s++) {
        const G = R.leg[s];
        if (G.iUp === R.iTail) continue;           // (Tridon's left thigh bone is its tail)
        nudge(st, G.iUp, S[S_LP] * st.air * (s ? 1 : 0.8), 0, S[S_LR] * st.air);
        nudge(st, G.iLo, Math.abs(S[S_LP]) * I.leg.knee * st.air, 0, 0);
      }
    }
    const wg = R.quirks.wings;
    if (Math.abs(S[S_WUP]) + Math.abs(S[S_WBK]) > 1e-3) {
      for (let s = 0; s < 2; s++) { const sign = R.arm[s].sign, i = R.arm[s].iSh; if (i >= 0) nudge(st, i, 0, sign * S[S_WBK] * wg, sign * S[S_WUP] * wg); }
    }
    if (R.iTail >= 0 && Math.abs(S[S_TP]) + Math.abs(S[S_TY]) > 1e-3) {
      nudge(st, R.iTail, S[S_TP], S[S_TY], 0);
      // (a tail bone that is also a thigh: the shin under it stays with the body)
      for (let s = 0; s < 2; s++) if (R.leg[s].iUp === R.iTail) nudge(st, R.leg[s].iLo, -S[S_TP], -S[S_TY], 0);
    }
  }
  /** A hit from world (x, y, z): kick the recoil spring away from it, and everything loose with it. mag ~0..1.5 */
  function recoil(st, x, z, mag, y) {
    const f = st.f, p = f.root.position, yaw = f.root.rotation.y;
    let dx = p.x - x, dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = -Math.sin(yaw); dz = -Math.cos(yaw); } else { dx /= d; dz /= d; }
    // the blow's direction of travel in the body frame: fwd < 0 = it came from the front, lat > 0 = it is heading to the body's left
    const s = Math.sin(yaw), c = Math.cos(yaw), fwd = dx * s + dz * c, lat = dx * c - dz * s;
    st.sv += fwd * 9 * mag;                        // from the front: the torso snaps back (pitch < 0)
    st.srv += -lat * 7 * mag;                      // heading left: the body leans left (roll < 0)
    st.syv += lat * 5.5 * mag;
    // how high it landed (feet 0 .. head 1): springs() gives a high one to the neck and head, a low one to the trunk
    if (st.R && y !== undefined) st.hi = clampTo((y - p.y) / Math.max(6, st.R.headY), 0, 1);
    // the body is knocked out from under its arms, wings and tail: they are left behind, then catch up
    const S = st.S;
    for (let s = 0; s < 2; s++) {
      const o = s ? S_ARP : S_ALP, side = st.R ? st.R.arm[s].sign : 1;
      S[o + 1] += fwd * 6 * mag;
      S[o + 3] += (-lat * 5 + side * 2.5) * mag;   // (and thrown a little wide)
    }
    S[S_WBK + 1] += -fwd * 4 * mag; S[S_WUP + 1] += 3 * mag;
    S[S_TY + 1] += lat * 5 * mag; S[S_TP + 1] += -2 * mag;
  }
  function look(st, dt) {
    const f = st.f, o = f.opponent, R = st.R;
    let wantY = 0, wantP = 0;
    const d = DEFS[st.sub || st.anim || st.gait];
    const upright = Math.abs(f.root.rotation.x) < 0.2 && Math.abs(f.root.rotation.z) < 0.2;
    const w = !upright ? 0 : d && d.look !== undefined ? d.look : st.anim ? 0.4 : 1;
    if (o && w > 0) {
      const a = f.root.position, hips = o.bones && o.bones.hips;
      if (hips) hips.getWorldPosition(_v1); else _v1.copy(o.root.position).setY(o.root.position.y + 14);
      const dx = _v1.x - a.x, dz = _v1.z - a.z, dist = Math.hypot(dx, dz);
      if (dist > 4) {
        let dy = Math.atan2(dx, dz) - f.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        if (Math.abs(dy) < 2.3) wantY = Math.max(-0.85, Math.min(0.85, dy)) * w;
        // its body centre against my head height: look down at a foe on the mat, up at one overhead
        wantP = Math.max(-0.5, Math.min(0.6, Math.atan2(R.headY - 9 - _v1.y + a.y, dist))) * w;
      }
    }
    const k = 1 - Math.exp(-dt * 7);
    st.lookY += (wantY - st.lookY) * k; st.lookP += (wantP - st.lookP) * k;
    if (Math.abs(st.lookY) + Math.abs(st.lookP) < 1e-3) return;
    nudge(st, R.iS3, st.lookP * 0.15, st.lookY * 0.2, 0);
    if (R.quirks.headOnNeck) nudge(st, R.iNeck, st.lookP * 0.7, st.lookY * 0.65, 0);
    else { nudge(st, R.iNeck, st.lookP * 0.4, st.lookY * 0.35, 0); nudge(st, R.iHead, st.lookP * 0.45, st.lookY * 0.45, 0); }
  }
  // Index of an anchor bone on a body (Tridon's left foot bones are parked in its tail: use the right foot)
  function anchorBone(ost, name) {
    if (name === 'LeftFoot' && ost.R.leg[0].kneeOnly) name = 'RightFoot';
    return ost.R.index[name];
  }
  // Stop a hand short of its anchor, toward my shoulder, so it rests on the surface rather than in the bone
  function pressOut(st, side, G, out) {
    if (!G.press) return;
    st.B[st.R.arm[side].iUp].getWorldPosition(_v3);
    _v4.copy(_v3).sub(out);
    const l = _v4.length();
    if (l > 1e-3) out.addScaledVector(_v4, Math.min(G.press, l * 0.5) / l);
  }
  function gripTargets(st, ost, G) {
    const y = st.f.root.rotation.y, lx = Math.cos(y), lz = -Math.sin(y);   // my left, in the world
    if (G.split && G.L && G.L.length > 1) {
      // Two support points along the other body: the one further to my left goes to my left hand
      ost.B[anchorBone(ost, G.L[0])].getWorldPosition(_v1);
      ost.B[anchorBone(ost, G.L[1])].getWorldPosition(_v2);
      const da = _v1.x * lx + _v1.z * lz, db = _v2.x * lx + _v2.z * lz;
      if (Math.abs(da - db) < 3) {
        // in line with my facing (or one bone for both): a hand either side of the midpoint
        _v3.copy(_v1).add(_v2).multiplyScalar(0.5);
        st.gL.copy(_v3); st.gR.copy(_v3);
        st.gL.x += lx * 3.4; st.gL.z += lz * 3.4; st.gR.x -= lx * 3.4; st.gR.z -= lz * 3.4;
      } else if (da > db) { st.gL.copy(_v1); st.gR.copy(_v2); } else { st.gL.copy(_v2); st.gR.copy(_v1); }
    } else {
      if (G.L) ost.B[anchorBone(ost, G.L[0])].getWorldPosition(st.gL);
      if (G.R) ost.B[anchorBone(ost, G.R[0])].getWorldPosition(st.gR);
      if (G.wrap) { st.gL.x += lx * G.wrap; st.gL.z += lz * G.wrap; st.gR.x -= lx * G.wrap; st.gR.z -= lz * G.wrap; }
    }
    if (G.L) pressOut(st, 0, G, st.gL);
    if (G.R) pressOut(st, 1, G, st.gR);
  }
  function armIK(st, side, target, w, out) {
    if (w <= 0.001) return;
    const R = st.R, A = R.arm[side], B = st.B, root = st.f.root;
    const up = B[A.iUp], lo = B[A.iLo];
    // into rig space (root-local x scale)
    const sc = root.scale.x;
    up.getWorldPosition(_v1); root.worldToLocal(_v1).multiplyScalar(sc);
    _v2.copy(target); root.worldToLocal(_v2).multiplyScalar(sc);
    const d = _v1.distanceTo(_v2);
    if (d > A.len * 1.9) w *= Math.max(0, 1 - (d - A.len * 1.9) / (A.len * 0.6));   // far out of reach: do not point at it
    if (w <= 0.001) return;
    _pole.set(A.sign * out, -0.7, -0.5);
    if (_v2.y - _v1.y > A.len * 0.5) _pole.set(A.sign, -0.1, 0.25);                 // overhead: elbows out to the sides
    _ikArm.l1 = A.l1; _ikArm.l2 = A.l2 * lo.scale.x; _ikArm.qU0inv = A.qU0inv; _ikArm.qF0inv = A.qF0inv;
    twoBone(_ikArm, _v1, _v2, _pole, _dU, _dF, _mid);
    root.getWorldQuaternion(_rootQ);
    up.parent.getWorldQuaternion(_q1); _q1.premultiply(_q3.copy(_rootQ).invert());  // the clavicle's orientation in rig space
    _q2.copy(_dU).multiply(R.wq[A.iUp]);                                            // upper arm, rig space
    _q3.copy(_q1).invert().multiply(_q2);
    up.quaternion.slerp(_q3, w);
    _q3.copy(_q2).invert().multiply(_dF).multiply(R.wq[A.iLo]);
    lo.quaternion.slerp(_q3, w);
  }
  function grips(st, dt) {
    const o = st.f.opponent;
    const name = st.sub || st.anim, kn = GRIP[name] ? name : name + '.' + st.R.key, G = GRIP[kn];
    let wantL = 0, wantR = 0;
    const ost = o ? states[o.id] : null;
    if (G && ost && ost.B && o.root.visible !== false) {
      let on = true;
      if (!DEFS[name] || !DEFS[name].loop) {
        const act = st.glb.actions[ckey(name)], t = act ? act.time : 0;
        on = t >= G.t0 && t <= G.t1;
      }
      if (on) { wantL = G.L ? (G.w || 1) : 0; wantR = G.R ? (G.w || 1) : 0; }
      st.gripName = kn;
    }
    const H = G || GRIP[st.gripName];
    const k = dt > 0 ? Math.min(1, dt / (H ? H.fade : 0.15)) : 0;
    st.gripL += Math.sign(wantL - st.gripL) * Math.min(Math.abs(wantL - st.gripL), k);
    st.gripR += Math.sign(wantR - st.gripR) * Math.min(Math.abs(wantR - st.gripR), k);
    if (st.gripL <= 0.001 && st.gripR <= 0.001) return;
    if (!H || !ost || !ost.B) { st.gripL = 0; st.gripR = 0; return; }
    if (G) gripTargets(st, ost, G);   // (a grip easing out after its anim keeps heading for where it last was)
    armIK(st, 0, st.gL, smooth01(st.gripL), H.out);
    armIK(st, 1, st.gR, smooth01(st.gripR), H.out);
  }
  function layers(st, dt) {
    if (!st.R) return;
    bonesOf(st);
    const B = st.B, mod = st.mod;
    // The mixer rewrites these bones every time it ticks. If it did not tick (a frozen frame), start again from what it last wrote
    for (let i = 0; i < mod.length; i++) {
      const q = B[mod[i]].quaternion;
      if (q.equals(st.wrote[i])) q.copy(st.base[i]); else st.base[i].copy(q);
    }
    springs(st, dt);
    look(st, dt);
    st.f.root.updateMatrixWorld(true);
    grips(st, dt);
    for (let i = 0; i < mod.length; i++) st.wrote[i].copy(B[mod[i]].quaternion);
  }

  /** Bake (once per kaiju) and register (once per GLB) the clip for a name; returns its action key or ''. */
  function ensure(st, name) {
    const def = DEFS[name];
    if (!def || !st.rig) return '';
    const key = ckey(name);
    if (!st.glb.actions[key]) {
      const clip = st.rig.clips[name] || (st.rig.clips[name] = bakeClip(st.R, key, def));
      st.glb.addClip(key, clip, !def.loop);
    }
    return key;
  }

  // ---- locomotion from the root's real motion ----
  function locomote(st, dt) {
    const f = st.f, glb = st.glb;
    const sp = Math.hypot(st.vx, st.vz);
    const yaw = f.root.rotation.y, s = Math.sin(yaw), c = Math.cos(yaw);
    const fwd = st.vx * s + st.vz * c, lat = st.vx * c - st.vz * s;
    let want = 'idle';
    if (sp > 2.5) {
      if (Math.abs(fwd) >= Math.abs(lat) * 0.8) want = fwd > 0 ? (sp > DEFS.walk.speed * 1.45 || (st.gait === 'run' && sp > DEFS.walk.speed * 1.2) ? 'run' : 'walk') : 'back';
      else want = lat > 0 ? 'strafe_l' : 'strafe_r';
    }
    st.gaitT += dt;
    if (want !== st.gait && st.gait && st.gaitT < 0.18 && want !== 'idle') want = st.gait;   // do not flicker between gaits
    const key = ensure(st, want);
    if (!key) { glb.loop(want === 'idle' ? 'idle' : want === 'run' ? 'run' : 'walk', 0.3); return; }
    const d = DEFS[want];
    const ts = d.speed ? Math.min(1.7, Math.max(0.55, sp / d.speed)) : 1;
    if (want !== st.gait || glb.currentName !== key) {
      // Carry the stride phase from gait to gait so the feet do not jump
      let phase;
      const cur = glb.currentAction;
      if (LOCO[st.gait] && LOCO[want] && cur && glb.currentName === ckey(st.gait)) phase = (cur.time / cur.getClip().duration) % 1;
      glb.loop(key, want === 'idle' ? 0.35 : st.gait === 'idle' || !st.gait ? 0.22 : 0.3, ts, phase);
      st.gait = want; st.gaitT = 0;
    } else glb.loop(key, 0.3, ts);
  }

  function track(st, dt) {
    const p = st.f.root.position, yaw = st.f.root.rotation.y;
    const r = st.f.root.rotation;
    if (dt > 1e-5) {
      const dx = p.x - st.px, dz = p.z - st.pz, dh = p.y - st.py, k = 1 - Math.exp(-dt / 0.08);
      const ox = st.vx, oy = st.vy, oz = st.vz;
      if (dx * dx + dz * dz + dh * dh < 900) {   // (a teleport is not a velocity)
        st.vx += (dx / dt - st.vx) * k; st.vz += (dz / dt - st.vz) * k; st.vy += (dh / dt - st.vy) * k;
        // ...and the change in it is what the springs feel
        const ka = 1 - Math.exp(-dt / 0.05), M = INERTIA.aMax;
        st.ax += (clampTo((st.vx - ox) / dt, -M, M) - st.ax) * ka;
        st.ay += (clampTo((st.vy - oy) / dt, -M, M) - st.ay) * ka;
        st.az += (clampTo((st.vz - oz) / dt, -M, M) - st.az) * ka;
      } else { st.ax = 0; st.ay = 0; st.az = 0; }
      let dy = yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yawRate += (dy / dt - st.yawRate) * k;
      let dp = r.x - st.rx; dp = Math.atan2(Math.sin(dp), Math.cos(dp));
      let dr = r.z - st.rz; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      st.wP += (dp / dt - st.wP) * k; st.wR += (dr / dt - st.wR) * k;
    }
    st.px = p.x; st.pz = p.z; st.py = p.y; st.yaw = yaw; st.rx = r.x; st.rz = r.z;
  }

  function tick(dt) {
    for (const id in states) {
      const f = W[id];
      if (!f) continue;
      const st = stateOf(f);
      track(st, dt);
      // A finished one-shot (ours or a mocap power clip) hands back to locomotion
      if (st.anim && !st.loop && !st.hold && !st.glb.oneShotActive) st.anim = '';
      if (!st.anim && !st.glb.oneShotActive) locomote(st, dt);
      else if (st.anim) follow(st);
    }
    // Layers once BOTH kaiju have their clip pose (the grips read the other body's bones)
    for (const id in states) if (W[id] && states[id]) { bonesOf(states[id]); W[id].root.updateMatrixWorld(true); }
    for (const id in states) if (W[id] && states[id]) layers(states[id], dt);
  }
  // What a playing anim needs from frame to frame: cycles matched to the root's speed, and held poses that turn into loops
  function follow(st) {
    const glb = st.glb, sp = Math.hypot(st.vx, st.vz);
    if (st.anim === 'lift' || st.anim === 'finisher_windup') {
      const act = glb.actions[ckey(st.anim)];
      if (st.sub || (act && act.time >= act.getClip().duration - 0.02)) {
        const want = st.anim === 'lift' ? (sp > 2 ? 'carry_walk' : 'carry_idle') : (st.sub === 'fin_rise' || st.f.root.position.y > 1.5 ? 'fin_rise' : '');
        if (want && want !== st.sub) {
          const key = ensure(st, want);
          if (key) { glb.loop(key, 0.28, 1); st.sub = want; }
        }
        if (st.sub === 'carry_walk') glb.loop(ckey('carry_walk'), 0.25, Math.min(1.8, Math.max(0.5, sp / DEFS.carry_walk.speed)));
      }
      return;
    }
    const d = DEFS[st.anim];
    if (d && d.loop && d.speed && sp > 1) glb.loop(ckey(st.anim), 0.2, Math.min(1.8, Math.max(0.5, sp / d.speed)));
  }

  return {
    start() {
      started = true;
      // Every hit lands on the body: a recoil through spine and head, away from where it came from
      offs.push(W.bus.on(EV.DAMAGE, (e) => {
        const st = W[e.who] ? states[e.who] : null;
        if (st) recoil(st, e.x, e.z, Math.min(1.6, 0.35 + e.amount / 12) * (e.blocked ? 0.4 : 1), e.y);
      }));
      // Locomotion clips are ours for the whole match: game.js stops picking idle / walk / run for the player
      ctx.player.control.loco = false;
      for (const id in states) {
        const f = W[id];
        if (!f) continue;
        const st = stateOf(f);
        f.glb.lockLoco(true);
        for (const name in DEFS) ensure(st, name);   // bake now, not on first use mid-fight
      }
    },
    /**
     * Play `name` on a fighter. opts: { fade = 0.15, timeScale = 1, duration (s:
     * stretch the clip), commit (s locomotion cannot interrupt) }.
     * Returns false when the name has nothing to show on this rig.
     */
    play(fighter, name, opts) {
      const def = ANIMS[name];
      if (!def) throw new Error(`[wrestling] unknown anim '${name}' (see ANIMS in anims.js)`);
      const st = stateOf(fighter), glb = fighter.glb;
      const fade = opts && opts.fade !== undefined ? opts.fade : 0.15;
      let ts = opts && opts.timeScale !== undefined ? opts.timeScale : 1;
      const key = ensure(st, name);
      if (key) {
        if (def.loop) {
          if (opts && opts.duration) ts = def.dur / opts.duration;
          // two kaiju in a tie-up push against each other: half a cycle apart
          glb.loop(key, fade, ts, name === 'lockup' && !fighter.isPlayer ? 0.5 : undefined);
        } else {
          _once.duration = opts ? opts.duration : undefined;
          _once.commit = opts ? opts.commit : undefined;
          _once.hold = def.hold;
          glb.playOnce(key, fade, ts, _once);
        }
        st.anim = name; st.loop = def.loop; st.hold = def.hold; st.gait = ''; st.sub = '';
        fighter.animName = name;
        return true;
      }
      // No procedural clip (a rig the loader could not describe): the mocap stand-ins
      for (let i = 0; i < def.clips.length; i++) {
        const k = def.clips[i];
        if (!glb.actions[k]) continue;
        let ok;
        if (def.loop) ok = glb.loop(k, fade, ts);
        else {
          _once.duration = opts ? opts.duration : undefined;
          _once.commit = opts ? opts.commit : undefined;
          _once.hold = def.hold;
          ok = glb.playOnce(k, fade, ts, _once);
        }
        if (ok) { st.anim = name; st.loop = def.loop; st.hold = def.hold; st.gait = ''; fighter.animName = name; return true; }
      }
      return false;
    },
    /** Back to locomotion on this fighter. */
    stop(fighter, fade = 0.25) {
      fighter.animName = '';
      const st = stateOf(fighter);
      st.anim = ''; st.gait = ''; st.sub = '';
      if (!started) { fighter.glb.resetAnim(); return; }
      const key = ensure(st, 'idle');
      if (key) { fighter.glb.loop(key, fade); st.gait = 'idle'; st.gaitT = 1; } else fighter.glb.loop('idle', fade);
    },
    /**
     * World position of a named point on a fighter, for effects: 'head' (centre skull), 'headL' / 'headR' (Tridon's
     * side heads; the head on the others), 'crown' (top of the skull), 'mouth', 'chest', 'back' (between the
     * shoulders), 'handL', 'handR', 'hands' (midpoint), 'hips'. Allocation-free; current as of the last update.
     */
    anchor(fighter, name, out) {
      const st = stateOf(fighter);
      if (!st.R) return fighter.center ? fighter.center(out) : out.copy(fighter.root.position);
      bonesOf(st);
      const R = st.R, B = st.B;
      if (name === 'handL') return B[R.arm[0].iEnd].getWorldPosition(out);
      if (name === 'handR') return B[R.arm[1].iEnd].getWorldPosition(out);
      if (name === 'hands') { B[R.arm[0].iEnd].getWorldPosition(out); B[R.arm[1].iEnd].getWorldPosition(_v4); return out.add(_v4).multiplyScalar(0.5); }
      if (name === 'hips') return B[R.iHips].getWorldPosition(out);
      const T = ANCHORS[R.key] || ANCHORS.mecha, a = T[name] || T[ANCHOR_ALIAS[name]] || T.chest;
      const i = R.index[a[0]];
      // the rig-space offset, taken into the bone's own frame, then out through wherever the bone is now
      out.set(a[1], a[2], a[3]).applyQuaternion(R.wqInv[i]).multiplyScalar(1 / R.unit);
      return B[i].localToWorld(out);
    },
    /** Root-to-root distance (u) at which this pair's tie-up poses meet (heads cheek to cheek, hands on shoulders). */
    lockDist(a, b) { return ctx.bodyRadius(a.key) + ctx.bodyRadius(b.key) - 3; },
    /** Height (u above the lifter's root) for the centre of a body carried overhead so it rests on the lifter's raised hands. */
    carryY(lifter, victim) {
      const st = stateOf(lifter);
      return st.R ? st.R.shoulderY + st.R.armLen * 0.92 + 5.5 : 38;
    },
    /** The wrestling anim last played on the fighter ('' after stop()). */
    current(fighter) { return fighter.animName; },
    /** Timing of an anim: { dur, loop, hold, marks } (seconds at timeScale 1). */
    info(name) { return ANIMS[name]; },
    /** When a mark falls if the anim is played with opts.duration = duration (default: its own length). */
    markTime(name, mark, duration) {
      const d = ANIMS[name];
      if (!d || d.marks[mark] === undefined) return 0;
      return duration && d.dur ? d.marks[mark] * duration / d.dur : d.marks[mark];
    },
    update(dt, dtReal) { tick(dt); },
    updateIdle(dtReal) { tick(dtReal); },
    dispose() {
      started = false;
      for (let i = 0; i < offs.length; i++) offs[i]();
      offs.length = 0;
      for (const id in states) {
        const st = states[id];
        if (st) { st.glb.lockLoco(false); st.glb.resetAnim(); }
        states[id] = null;
      }
      ctx.player.control.loco = true;
    },
  };
}
