// Pose and clip definitions for the wrestling animation set (see animRig.js for
// the pose channels and conventions). OWNER: animation engineer.
//
// Every entry of DEFS is { dur, loop?, hold?, marks?, pose(t, P, R, dur) }:
// pose() fills the pose P for time t (seconds) on rig R. The same function
// drives all three kaiju; R.key / R.quirks are there for the few places a
// body needs its own treatment (Tridon's wings and tail, Gorrak's bulk).
import { mixPose, newPose, resetPose, mirrorPose, copyPose, ramp, rampIn, rampOut, pulse, kf, wobble, smooth, clamp01, TAU } from './animRig.js';
import { SIGNATURES } from './signatures.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const _A = newPose(), _B = newPose(), _C = newPose();

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
/** Bend the whole torso: split over the three spine joints. */
function torso(P, pitch, yaw, roll) {
  P.s1p += pitch * 0.4; P.s2p += pitch * 0.3; P.s3p += pitch * 0.3;
  P.s1y += yaw * 0.3; P.s2y += yaw * 0.35; P.s3y += yaw * 0.35;
  P.s1r += roll * 0.4; P.s2r += roll * 0.3; P.s3r += roll * 0.3;
}
/** Swing the tail sideways (yaw > 0: tip to the kaiju's left) / lift it. Tridon has a tail joint; the others wag from the hips with the spine countering. */
function tail(P, R, yaw, lift = 0) {
  if (R.iTail >= 0) { P.tly += yaw; P.tlp += lift; return; }
  const k = R.key === 'mecha' ? 0.55 : 0.35;
  P.hyaw += yaw * k; P.s1y -= yaw * k;
}
/** Wings / spike coat / shoulder pods: raise (up +) and sweep (back +), scaled by what the body has. */
function wings(P, R, raise, sweep = 0) {
  const k = R.quirks.wings;
  P.cLr += raise * k; P.cRr += raise * k; P.cLy += sweep * k; P.cRy += sweep * k;
}
function hand(P, s, x, y, z) { if (s === 'L') { P.aLx = x; P.aLy = y; P.aLz = z; } else { P.aRx = x; P.aRy = y; P.aRz = z; } }
function elbow(P, s, x, y, z) { if (s === 'L') { P.eLx = x; P.eLy = y; P.eLz = z; } else { P.eRx = x; P.eRy = y; P.eRz = z; } }
function foot(P, s, x, y, z, yaw = 0, pit = 0) { if (s === 'L') { P.fLx = x; P.fLy = y; P.fLz = z; P.fLyaw = yaw; P.fLpit = pit; } else { P.fRx = x; P.fRy = y; P.fRz = z; P.fRyaw = yaw; P.fRpit = pit; } }

/** The fight stance every standing anim starts from and returns to: feet apart, left foot forward, knees bent, hands up and open. */
export function stance(P, R) {
  P.hy = -1.3; P.hz = 0.3; P.hyaw = -0.22; P.hpit = 0.04;
  torso(P, 0.2, 0.1, 0);
  P.s1y += 0.12;
  P.nkp = -0.06; P.hdp = -0.08; P.hdy = 0.1;
  foot(P, 'L', 1.2, 0, 2.6, 0.15); foot(P, 'R', 1.6, 0, -2.4, 0.35);
  P.kLo = 0.15; P.kRo = 0.25;
  hand(P, 'L', 0.22, -0.08, 0.78); elbow(P, 'L', 0.7, -0.7, -0.2);
  hand(P, 'R', 0.3, -0.22, 0.6); elbow(P, 'R', 0.75, -0.65, -0.2);
  P.hLp = -0.3; P.hRp = -0.3;
  if (R.iTail >= 0) P.tlp = 0.14;
  wings(P, R, 0.1, 0.1);
  return P;
}
/** Feet side by side (the stance staggers them): the base for stepping cycles. */
function level(P) { P.fLz = 0.4; P.fRz = -0.4; P.fLx = 1.0; P.fRx = 1.2; P.fRyaw = 0.2; }
/** Breathing + weight shift + tail sway on top of any standing pose. ph = cycle phase (0..1), amt = scale. */
function alive(P, R, ph, amt = 1) {
  const b = sin(ph * TAU), b2 = sin(ph * TAU * 2 + 0.6);
  P.hy += b * 0.22 * amt; P.hx += sin(ph * TAU + 1.2) * 0.3 * amt;
  P.s2p += b * 0.025 * amt; P.s3p += b * 0.02 * amt; P.nkp -= b * 0.02 * amt;
  P.aLy += b * 0.025 * amt; P.aRy += b2 * 0.02 * amt; P.aLz += b2 * 0.015 * amt;
  tail(P, R, sin(ph * TAU - 0.9) * 0.16 * amt, b2 * 0.03 * amt);
  wings(P, R, b * 0.06 * amt, b2 * 0.04 * amt);
}

/**
 * One frame of a stepping cycle on top of the stance. ph = phase 0..1 (left
 * foot strikes at 0, right at 0.5); (dx, dz) = travel direction in the body
 * frame (x = the kaiju's left); S = stride (u), duty = fraction of the cycle a
 * foot is planted, lift = step height. A planted foot slides back at a steady
 * S / (duty * period), which is the ground speed the clip is played against.
 */
function gait(P, R, ph, dx, dz, S, duty, lift, o) {
  const bob = o.bob, sway = o.sway, twist = o.twist, arms = o.arms;
  for (let s = 0; s < 2; s++) {
    const p = (ph + (s ? 0.5 : 0)) % 1;
    let along, up = 0, pit = 0;
    if (p < duty) along = 0.5 - p / duty;                       // planted: front -> back
    else {
      const q = (p - duty) / (1 - duty), e = smooth(q);          // swing: back -> front
      along = -0.5 + e;
      up = Math.sin(q * PI) * lift * (1 + 0.25 * Math.sin(q * PI));
      pit = (q < 0.5 ? 0.55 * (1 - q * 2) : -0.3 * Math.sin((q - 0.5) * TAU)) * (dz >= 0 ? 1 : -0.4) * Math.abs(dz);
    }
    if (p > duty - 0.12 && p < duty) pit = 0.55 * ((p - duty + 0.12) / 0.12) * Math.max(0, dz);   // heel peels before the foot leaves
    const wx = dx * along * S, wz = dz * along * S;
    if (s === 0) { P.fLx += wx; P.fLz += wz; P.fLy += up; P.fLpit += pit; }
    else { P.fRx -= wx; P.fRz += wz; P.fRy += up; P.fRpit += pit; }
  }
  const c2 = cos(ph * TAU * 2), s1 = sin(ph * TAU), c1 = cos(ph * TAU);
  P.hy += -bob * c2 - bob * 0.6;               // low at each foot strike, high over the planted leg
  P.hx += sway * s1 * (1 - Math.abs(dx));      // weight over the planted foot
  P.hrol += -sway * 0.02 * s1;
  // pelvis leads with the swinging leg, chest counters, arms swing against the legs
  P.hyaw += twist * c1 * dz; torso(P, 0, -twist * 1.5 * c1 * dz, sway * 0.012 * s1);
  P.aLz += -arms * c1 * dz; P.aRz += arms * c1 * dz; P.aLy += arms * 0.3 * Math.abs(s1); P.aRy += arms * 0.3 * Math.abs(s1);
  tail(P, R, -0.2 * sin(ph * TAU - 0.8) * (0.5 + 0.5 * Math.abs(dz)), 0.03 * c2);
  wings(P, R, 0.05 * c2, 0.05 * s1);
}
const WALK = { bob: 0.35, sway: 0.9, twist: 0.1, arms: 0.07 };
const RUN = { bob: 0.7, sway: 0.5, twist: 0.16, arms: 0.16 };

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------
export const DEFS = {
  // ---- locomotion (driven by anims.js from root velocity; not in the public name list) ----
  // speed = ground speed (u/s) the cycle matches at timeScale 1: stride / (duty * dur)
  idle: { dur: 3.2, loop: true, pose(t, P, R, dur) { stance(P, R); alive(P, R, t / dur); } },
  walk: { dur: 0.8, loop: true, speed: 9 / (0.6 * 0.8), pose(t, P, R, dur) { stance(P, R); level(P); P.hy += 0.4; gait(P, R, t / dur, 0, 1, 9, 0.6, 2.4, WALK); } },
  back: { dur: 0.76, loop: true, speed: 7 / (0.6 * 0.76), pose(t, P, R, dur) { stance(P, R); level(P); torso(P, 0.06, 0, 0); gait(P, R, t / dur, 0, -1, 7, 0.6, 1.8, WALK); } },
  strafe_l: { dur: 0.76, loop: true, speed: 7 / (0.6 * 0.76), pose(t, P, R, dur) { stance(P, R); gait(P, R, t / dur, 1, 0, 7, 0.6, 1.8, WALK); } },
  strafe_r: { dur: 0.76, loop: true, speed: 7 / (0.6 * 0.76), pose(t, P, R, dur) { stance(P, R); gait(P, R, (t / dur + 0.5) % 1, -1, 0, 7, 0.6, 1.8, WALK); } },
  run: { dur: 0.54, loop: true, speed: 10.5 / (0.42 * 0.54), pose(t, P, R, dur) {
    stance(P, R); level(P); P.hyaw = 0; P.s1y -= 0.12; P.hy += 0.3; torso(P, 0.24, -0.1, 0); P.hdp -= 0.18;
    foot(P, 'L', 0.6, 0, 0, 0.05); foot(P, 'R', 0.6, 0, 0, 0.05);
    hand(P, 'L', 0.3, -0.45, 0.4); hand(P, 'R', 0.3, -0.45, 0.4);
    gait(P, R, t / dur, 0, 1, 10.5, 0.42, 3.6, RUN);
  } },
  // carrying a lifted foe: what 'lift' settles into (anims.js swaps these in by the carrier's speed)
  carry_idle: { dur: 1.2, loop: true, pose(t, P, R, dur) { stance(P, R); K.liftTop(P, R); const s = sin(t / dur * TAU); P.hy += 0.25 * s; P.aLy += 0.012 * s; P.aRy -= 0.012 * s; torso(P, 0.02 * s, 0, 0.02 * sin(t / dur * TAU * 2)); } },
  carry_walk: { dur: 0.7, loop: true, speed: 5 / (0.6 * 0.7), pose(t, P, R, dur) { stance(P, R); K.liftTop(P, R); gait(P, R, t / dur, 0, 1, 5, 0.6, 1.4, CARRY); } },
  // rising with the foe overhead in a finisher (anims.js swaps it in when finisher_windup ends)
  fin_rise: { dur: 0.6, loop: true, pose(t, P, R, dur) { finRise(P, R, t / dur); } },

  // ---- strikes: durations and contact frames are fighter.js MOVES (startup -> hit) ----
  strike_1: { dur: 0.62, marks: { hit: 0.22 }, pose(t, P, R) {            // left jab
    stance(P, R);
    blend(P, R, pulse(t, 0, 0.1, 0.1, 0.19), K.jabWind);
    blend(P, R, rampIn(t, 0.1, 0.21) * (1 - ramp(t, 0.3, 0.6)), K.jabHit);
    P.hz += 0.5 * wobble(t, 0.22, 30, 9);
  } },
  strike_2: { dur: 0.60, marks: { hit: 0.20 }, pose(t, P, R) {            // right hook
    stance(P, R);
    blend(P, R, pulse(t, 0, 0.09, 0.09, 0.17), K.hookWind);
    blend(P, R, rampIn(t, 0.09, 0.2) * (1 - ramp(t, 0.3, 0.6)), K.hookHit);
    blend(P, R, pulse(t, 0.2, 0.3, 0.3, 0.5) * 0.6, K.hookThru);
  } },
  strike_3: { dur: 0.86, marks: { hit: 0.28 }, pose(t, P, R) {            // overhead double hammer
    stance(P, R);
    blend(P, R, pulse(t, 0, 0.15, 0.17, 0.27), K.hammerUp);
    blend(P, R, rampIn(t, 0.18, 0.28) * (1 - ramp(t, 0.46, 0.84)), K.hammerDown);
    P.hy += 0.6 * wobble(t, 0.28, 26, 8);
  } },
  heavy: { dur: 1.29, marks: { hit: 0.55 }, pose(t, P, R) {               // right haymaker
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.36) * (1 - rampIn(t, 0.4, 0.54)), K.heavyWind);
    blend(P, R, rampIn(t, 0.4, 0.55) * (1 - ramp(t, 0.6, 0.78)), K.heavyHit);
    blend(P, R, ramp(t, 0.57, 0.74) * (1 - ramp(t, 0.86, 1.27)), K.heavyThru);
    // the wind-up trembles with the effort
    const w = pulse(t, 0.2, 0.36, 0.4, 0.46); P.s3y += 0.02 * w * sin(t * 60); P.aRy += 0.01 * w * sin(t * 70);
  } },
  clothesline: { dur: 1.32, marks: { hit: 0.30, end: 0.62 }, pose(t, P, R) {   // running lariat, right arm
    stance(P, R);
    blend(P, R, pulse(t, 0, 0.16, 0.18, 0.28), K.lariatWind);
    blend(P, R, rampIn(t, 0.16, 0.29) * (1 - ramp(t, 0.66, 0.95)), K.lariat);
    const sw = ramp(t, 0.28, 0.62);                 // the arm scythes through the active window
    const w = rampIn(t, 0.16, 0.29) * (1 - ramp(t, 0.66, 0.95));
    torso(P, 0, w * (-0.3 + 0.75 * sw), 0); P.aRz += w * (-0.12 + 0.4 * sw);
    blend(P, R, pulse(t, 0.66, 0.9, 0.95, 1.3), K.skid);
  } },
  stomp: { dur: 0.94, marks: { hit: 0.40 }, pose(t, P, R) {               // right foot onto a downed foe
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.26) * (1 - rampIn(t, 0.29, 0.4)), K.stompUp);
    blend(P, R, rampIn(t, 0.29, 0.4) * (1 - ramp(t, 0.55, 0.92)), K.stompDown);
    P.hy += 0.5 * wobble(t, 0.4, 28, 9);
  } },
  splash: { dur: 1.67, marks: { jump: 0.30, hit: 0.92 }, pose(t, P, R) {   // diving splash (the core arcs the root and pitches it forward)
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.22) * (1 - rampIn(t, 0.24, 0.34)), K.crouch);
    blend(P, R, rampIn(t, 0.26, 0.4) * (1 - ramp(t, 0.84, 0.94)), K.spread, null);
    blend(P, R, ramp(t, 0.84, 0.94) * (1 - ramp(t, 1.0, 1.35)), K.belly, null);
    blend(P, R, pulse(t, 1.0, 1.3, 1.3, 1.6), K.crouch);
  } },

  // ---- defence and reactions ----
  block: { dur: 2.0, loop: true, pose(t, P, R, dur) { stance(P, R); K.guard(P, R); const s = sin(t / dur * TAU); P.hy += 0.12 * s; P.aLy += 0.01 * s; P.aRy += 0.012 * s; tail(P, R, 0.08 * sin(t / dur * TAU - 1)); } },
  block_hit: { dur: 0.35, pose(t, P, R) {
    stance(P, R); K.guard(P, R);
    const k = wobble(t, 0, 22, 9) + 1.4 * Math.exp(-t * 14) * (t > 0 ? 1 : 0);
    P.hz -= 0.9 * k; torso(P, -0.1 * k, 0.05 * k, 0); P.aLz -= 0.12 * k; P.aRz -= 0.12 * k; P.hdp += 0.1 * k;
  } },
  hit_high: { dur: 0.5, pose(t, P, R) {
    stance(P, R);
    blend(P, R, (1 - ramp(t, 0.1, 0.5)) * rampOut(t, 0, 0.05), K.hitHigh);
    torso(P, 0, 0.06 * wobble(t, 0.05, 24, 8), 0);
  } },
  hit_low: { dur: 0.5, pose(t, P, R) {
    stance(P, R);
    blend(P, R, (1 - ramp(t, 0.12, 0.5)) * rampOut(t, 0, 0.05), K.hitLow);
  } },
  stagger: { dur: 1.0, pose(t, P, R) {                                      // reeling back on its heels (the core slides the root)
    stance(P, R);
    const w = rampOut(t, 0, 0.08) * (1 - ramp(t, 0.6, 1.0));
    blend(P, R, w, K.reel);
    // two stumbling steps back, arms wheeling for balance
    const a = pulse(t, 0.08, 0.2, 0.2, 0.34), b = pulse(t, 0.36, 0.48, 0.48, 0.62);
    P.fRy += 2.2 * a * w; P.fRz -= 1.5 * ramp(t, 0.08, 0.34) * w; P.fLy += 1.8 * b * w; P.fLz -= 1.5 * ramp(t, 0.36, 0.62) * w;
    P.aLy += 0.3 * w * sin(t * 13); P.aRy += 0.3 * w * sin(t * 13 + 2.4); P.aLz += 0.15 * w * cos(t * 13); P.aRz += 0.15 * w * cos(t * 13 + 2.4);
    torso(P, 0, 0.12 * w * sin(t * 9), 0.1 * w * sin(t * 7));
    P.hdr += 0.25 * w * sin(t * 8);
  } },
  stunned: { dur: 2.4, loop: true, pose(t, P, R, dur) {                    // out on its feet
    stance(P, R); K.dizzy(P, R);
    const a = t / dur * TAU;
    P.hx += 1.7 * sin(a); P.hz += 1.2 * cos(a);
    torso(P, 0.1 * sin(a * 2 + 0.5), 0.15 * sin(a), 0.16 * sin(a + 1));
    P.hdr += 0.32 * sin(a - 0.8); P.hdp += 0.14 * cos(a - 0.8); P.hdy += 0.2 * sin(a + 2);
    P.aLz += 0.1 * sin(a + 1); P.aRz += 0.1 * sin(a + 2.6); P.aLx += 0.06 * cos(a); P.aRx -= 0.06 * cos(a);
    tail(P, R, 0.2 * sin(a + 2.5)); wings(P, R, 0.08 * sin(a * 2), 0);
  } },

  // ---- grapple ----
  grab_reach: { dur: 0.90, marks: { contact: 0.28 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, pulse(t, 0, 0.12, 0.13, 0.25), K.reachWind);
    blend(P, R, rampIn(t, 0.13, 0.27) * (1 - ramp(t, 0.42, 0.88)), K.reach);
  } },
  lockup: { dur: 2.0, loop: true, pose(t, P, R, dur) {                     // collar-and-elbow: both play it, half a cycle apart
    stance(P, R); K.tieUp(P, R);
    const a = t / dur * TAU, push = sin(a) + 0.3 * sin(a * 3 + 1);
    P.hz += 0.9 * push; P.hy -= 0.3 * push;
    torso(P, 0.05 * push, 0.1 * sin(a * 2 + 0.7), 0.06 * sin(a * 3));
    P.aLz -= 0.05 * push; P.aRz -= 0.05 * push;
    // the back foot digs and re-plants
    const dig = Math.max(0, sin(a * 2 + 1.5)); P.fRy += 0.7 * dig; P.fRz += 0.6 * dig;
    P.s3y += 0.015 * sin(t * 47); P.hx += 0.25 * sin(a * 2);
    tail(P, R, 0.25 * sin(a + 1), 0.05); wings(P, R, 0.12 * sin(a * 2), 0.05);
  } },
  lift: { dur: 0.80, hold: true, marks: { up: 0.6 }, pose(t, P, R) {       // squat under it, drive it overhead
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.2) * (1 - rampIn(t, 0.22, 0.48)), K.liftSquat);
    blend(P, R, rampIn(t, 0.22, 0.58), K.liftTop);
    P.hy += 0.7 * wobble(t, 0.58, 20, 7); P.aLy += 0.03 * wobble(t, 0.58, 20, 7); P.aRy += 0.03 * wobble(t, 0.58, 20, 7);
  } },
  carried: { dur: 1.6, loop: true, rootDriven: true, pose(t, P, R, dur) {  // limp in someone's hands / in the air
    limp(P, R);
    const a = t / dur * TAU;
    P.aLz += 0.1 * sin(a); P.aRz += 0.1 * sin(a + 1.3); P.aLy += 0.06 * cos(a); P.hdr += 0.15 * sin(a + 0.5); P.hdp += 0.06 * sin(a * 2);
    P.tLp += 0.12 * sin(a + 2); P.tRp += 0.12 * sin(a + 3.6); P.kLb += 0.15 * sin(a + 1); P.kRb += 0.15 * sin(a + 2.8);
    tail(P, R, 0.15 * sin(a + 1));
  } },
  throw: { dur: 0.70, marks: { release: 0.28 }, pose(t, P, R) {            // heaving it down / away from overhead
    stance(P, R);
    blend(P, R, 1 - ramp(t, 0.1, 0.24), K.liftTop);
    blend(P, R, pulse(t, 0, 0.1, 0.1, 0.2), K.heaveBack);
    blend(P, R, rampIn(t, 0.12, 0.28) * (1 - ramp(t, 0.42, 0.68)), K.heaveDown);
    P.hy += 0.5 * wobble(t, 0.3, 24, 8);
  } },
  whip_send: { dur: 0.80, marks: { release: 0.45 }, pose(t, P, R) {        // Irish whip: wheel it round and let go
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.16) * (1 - ramp(t, 0.24, 0.42)), K.whipWind);
    blend(P, R, ramp(t, 0.26, 0.45) * (1 - ramp(t, 0.58, 0.8)), K.whipThru);
  } },
  whip_run: { dur: 0.5, loop: true, speed: 60, pose(t, P, R, dur) {        // sent running, out of control: stumbling, arms wheeling
    stance(P, R); level(P); K.headlong(P, R);
    const a = t / dur * TAU;
    gait(P, R, t / dur, 0, 1, 10, 0.4, 3.4, RUN);
    hand(P, 'L', 0.6 + 0.25 * sin(a), 0.1 + 0.45 * cos(a), 0.2 + 0.45 * sin(a)); hand(P, 'R', 0.6 - 0.25 * sin(a), 0.1 - 0.45 * cos(a), 0.2 - 0.45 * sin(a));
    // every stride nearly goes down: the body pitches over the front foot and is caught again
    const trip = Math.max(0, sin(a)), trip2 = Math.max(0, -sin(a));
    P.hy -= 1.3 * trip + 0.5 * trip2; torso(P, 0.22 * trip - 0.1 * trip2, 0.18 * sin(a + 1), 0.16 * cos(a));
    P.hdp += 0.3 * trip - 0.25 * trip2; P.hdr += 0.2 * cos(a); P.hx += 0.9 * cos(a);
    tail(P, R, 0.35 * cos(a), 0.1); wings(P, R, 0.4 + 0.3 * sin(a * 2), 0.2);
  } },
  suplex: { dur: 1.45, marks: { lift: 0.25, impact: 0.95 }, pose(t, P, R) {   // clasp, arch back, throw it overhead
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.22) * (1 - ramp(t, 0.27, 0.6)), K.clasp);
    blend(P, R, rampIn(t, 0.27, 0.8) * (1 - ramp(t, 1.0, 1.4)), K.bridge);
    blend(P, R, pulse(t, 1.0, 1.2, 1.2, 1.44) * 0.5, K.crouch);
  } },
  swing: { dur: 0.5, loop: true, pose(t, P, R, dur) {                      // giant swing: leaning out against the weight (the core turns the root)
    stance(P, R); K.swingHold(P, R);
    gait(P, R, t / dur, 1, 0, 3.5, 0.6, 1.5, SHUFFLE);
    P.hy += 0.15 * sin(t / dur * TAU * 2);
  } },

  // ---- ground game (body-frame poses: the core tips the root onto its back) ----
  knockdown: { dur: 0.55, hold: true, rootDriven: true, marks: { mat: 0.45 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, rampOut(t, 0, 0.16) * (1 - ramp(t, 0.36, 0.47)), K.fallFlail, null);
    blend(P, R, ramp(t, 0.36, 0.47), K.sprawl, null);
    // the bounce off the mat
    const k = wobble(t, 0.45, 30, 12); P.tLp += 0.25 * k; P.tRp += 0.2 * k; P.aLz += 0.15 * k; P.aRz += 0.12 * k; P.hdp += 0.2 * k;
  } },
  downed: { dur: 0.6, hold: true, rootDriven: true, pose(t, P, R) {
    sprawl(P, R);
    const k = Math.exp(-t * 7) * cos(t * 16);          // limbs settle
    P.tLp += 0.3 * k; P.tRp += 0.22 * k; P.kLb += 0.2 * k; P.aLz += 0.2 * k; P.aRz += 0.15 * k; P.hdp += 0.18 * k; torso(P, 0.08 * k, 0, 0);
  } },
  getup: { dur: 0.80, marks: { feet: 0.6 }, pose(t, P, R) {                // sits up against the core's root tip (fighter.js _pose: smooth over 0.85 of the duration), then stands
    const u = t / 0.8;
    stance(P, R);
    blend(P, R, 1 - ramp(u, 0, 0.3), K.sprawl, null);
    blend(P, R, pulse(u, 0.05, 0.38, 0.45, 0.8), K.sitUp, null);
    blend(P, R, pulse(u, 0.5, 0.8, 0.8, 1.0) * 0.7, K.crouch);
  } },
  pin_cover: { dur: 0.4, hold: true, pose(t, P, R) {                       // across the foe's chest (the core pitches the root face-down)
    stance(P, R);
    blend(P, R, rampOut(t, 0, 0.3), K.cover, null);
    P.hy += 0.4 * wobble(t, 0.28, 22, 9);
  } },
  pinned: { dur: 1.2, loop: true, rootDriven: true, pose(t, P, R, dur) {   // shoulders down, still fighting it
    sprawl(P, R);
    const a = t / dur * TAU;
    hand(P, 'L', 0.55, 0.2, 0.25 + 0.15 * sin(a * 2)); hand(P, 'R', 0.5, -0.1, 0.3 + 0.15 * sin(a * 2 + 2));
    P.tLp += 0.35 * Math.max(0, sin(a)); P.kLb += 0.4 * Math.max(0, sin(a)); P.tRp += 0.35 * Math.max(0, sin(a + PI)); P.kRb += 0.4 * Math.max(0, sin(a + PI));
    torso(P, 0.08 + 0.06 * sin(a * 2), 0, 0.1 * sin(a)); P.hdp += 0.3 + 0.1 * sin(a * 2); P.hdy = 0.3 * sin(a);
    tail(P, R, 0.2 * sin(a));
  } },
  kickout: { dur: 0.6, rootDriven: true, marks: { burst: 0.15 }, pose(t, P, R) {
    sprawl(P, R);
    blend(P, R, rampOut(t, 0.02, 0.15) * (1 - ramp(t, 0.25, 0.58)), K.kick, null);
  } },

  // ---- taunts (2 s: TUNE.tauntDur), victory, entrance ----
  taunt_a: { dur: 2.0, pose(t, P, R) { stance(P, R); (TAUNT_A[R.key] || TAUNT_A.godzilla)(t, P, R); } },
  taunt_b: { dur: 2.0, pose(t, P, R) { stance(P, R); (TAUNT_B[R.key] || TAUNT_B.godzilla)(t, P, R); } },
  taunt_win: { dur: 3.0, loop: true, pose(t, P, R, dur) { stance(P, R); (WIN[R.key] || WIN.godzilla)(t / dur, P, R); } },
  entrance: { dur: 1.0, loop: true, speed: 7 / (0.6 * 1.0), pose(t, P, R, dur) {
    stance(P, R); level(P); (STRUT[R.key] || STRUT.godzilla)(P, R, t / dur);
    gait(P, R, t / dur, 0, 1, 7, 0.6, 3.0, MARCH);
  } },

  // ---- signature grapples (signatures.js): 2 s clips stretched to each move's length; the pose functions work in its real seconds ----
  sig_a: { dur: 2.0, pose(t, P, R) { stance(P, R); const d = (SIGNATURES[R.key] || SIGNATURES.godzilla)[0]; (SIG_A[R.key] || SIG_A.godzilla)(t * d.dur / 2, P, R, d.T, d.dur); } },
  sig_b: { dur: 2.0, pose(t, P, R) { stance(P, R); const d = (SIGNATURES[R.key] || SIGNATURES.godzilla)[1]; (SIG_B[R.key] || SIG_B.godzilla)(t * d.dur / 2, P, R, d.T, d.dur); } },
  sig_victim: { dur: 1.2, loop: true, rootDriven: true, pose(t, P, R, dur) {   // choked, inverted, headlocked: clawing at the grip, legs kicking
    limp(P, R);
    const a = t / dur * TAU;
    hand(P, 'L', 0.3, 0.62 + 0.08 * sin(a * 2), 0.5); hand(P, 'R', 0.32, 0.55 + 0.08 * sin(a * 2 + 2), 0.55); elbow(P, 'L', 1, -0.2, -0.3); elbow(P, 'R', 1, -0.2, -0.3);
    P.hLp = -0.4; P.hRp = -0.4;
    P.tLp = 0.25 + 0.45 * sin(a); P.kLb = 0.6 + 0.5 * Math.max(0, sin(a + 1)); P.tRp = 0.25 - 0.45 * sin(a); P.kRb = 0.6 + 0.5 * Math.max(0, -sin(a + 1));
    P.hdp = -0.45 + 0.1 * sin(a * 2); P.hdy = 0.25 * sin(a); torso(P, -0.15, 0.1 * sin(a), 0.08 * sin(a + 1));
    tail(P, R, 0.35 * sin(a * 1.5)); wings(P, R, -0.35 + 0.15 * sin(a * 2), 0.45); // (wings folded: a held Tridon would fill the screen)
    if (R.iTail >= 0) { P.tlp = -0.6; P.kLb = 1.0; }
  } },

  // ---- the rival's signature powers: anticipation -> `fire` -> the pose held through the active window -> recovery (fighter.js POWERS) ----
  power_beam: { dur: 2.0, marks: { fire: 0.95 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.6) * (1 - rampIn(t, 0.84, 0.95)), K.inhale);
    blend(P, R, rampIn(t, 0.84, 0.96) * (1 - ramp(t, 1.35, 1.95)), K.spit);
    const w = pulse(t, 0.4, 0.8, 0.84, 0.92), f = pulse(t, 0.95, 1.0, 1.3, 1.4);
    P.s3y += 0.02 * w * sin(t * 62); P.hdr += 0.03 * w * sin(t * 71); P.hz -= 0.5 * f * (0.6 + 0.4 * sin(t * 50)); P.hdy += 0.02 * f * sin(t * 57);
  } },
  power_roar: { dur: 1.7, marks: { fire: 0.80 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.5) * (1 - rampIn(t, 0.68, 0.8)), K.gather);
    blend(P, R, rampIn(t, 0.68, 0.81) * (1 - ramp(t, 1.1, 1.65)), K.bellow);
    const f = pulse(t, 0.8, 0.85, 1.0, 1.15);
    P.hdy += 0.07 * f * sin(t * 55); P.s3y += 0.03 * f * sin(t * 47); P.hdr += 0.05 * f * sin(t * 39); P.cLr += 0.06 * f * sin(t * 50); P.cRr -= 0.06 * f * sin(t * 50);
  } },
  power_charge: { dur: 2.1, marks: { fire: 0.70, end: 1.25 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.45) * (1 - rampIn(t, 0.6, 0.72)), K.coil);
    // paws the ground twice while it coils
    const paw = pulse(t, 0.1, 0.2, 0.2, 0.3) + pulse(t, 0.35, 0.45, 0.45, 0.55); P.fRy += 2.2 * paw; P.fRz -= 1.5 * paw;
    blend(P, R, rampIn(t, 0.6, 0.72) * (1 - ramp(t, 1.25, 1.5)), K.ram);
    blend(P, R, pulse(t, 1.25, 1.5, 1.55, 2.05), K.skid);
  } },
  power_stomp: { dur: 1.85, marks: { fire: 0.40, land: 1.25 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, ramp(t, 0, 0.3) * (1 - rampIn(t, 0.34, 0.46)), K.crouch);
    blend(P, R, rampIn(t, 0.36, 0.55) * (1 - rampIn(t, 1.05, 1.24)), K.tuck, null);
    blend(P, R, rampIn(t, 1.1, 1.25) * (1 - ramp(t, 1.4, 1.8)), K.slamLand);
    P.hy += 0.8 * wobble(t, 1.25, 24, 7);
  } },
  power_ult: { dur: 3.0, marks: { fire: 1.50 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, ramp(t, 0, 1.2) * (1 - rampIn(t, 1.36, 1.5)), K.summon);
    blend(P, R, rampIn(t, 1.36, 1.52) * (1 - ramp(t, 2.1, 2.95)), K.unleash);
    const w = ramp(t, 0.3, 1.3) * (1 - ramp(t, 1.36, 1.5)), f = pulse(t, 1.5, 1.55, 1.8, 2.0);   // the build shakes harder and harder
    P.s3y += 0.035 * w * sin(t * 58); P.hdr += 0.04 * w * sin(t * 67); P.aLx += 0.02 * w * sin(t * 61); P.aRx += 0.02 * w * sin(t * 53); P.hy += 0.25 * w * sin(t * 44);
    P.hy += 0.9 * wobble(t, 1.5, 22, 6); P.hdy += 0.05 * f * sin(t * 55);
  } },

  // ---- finisher (grapple.js timeline: 0.5 haul in, 0.6 lift, rise to the apex, 0.45 drop, impact) ----
  finisher_windup: { dur: 1.1, hold: true, marks: { grab: 0.5, up: 1.0 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, rampIn(t, 0.05, 0.3) * (1 - ramp(t, 0.5, 0.75)), K.reach);
    blend(P, R, pulse(t, 0.45, 0.62, 0.62, 0.85), K.liftSquat);
    blend(P, R, rampIn(t, 0.66, 1.0), K.liftTop);
    blend(P, R, ramp(t, 0.8, 1.08), FIN_POSE[R.key] || FIN_POSE.godzilla, null);
  } },
  finisher_strike: { dur: 0.95, hold: true, marks: { impact: 0.45 }, pose(t, P, R) {
    stance(P, R);
    blend(P, R, 1 - ramp(t, 0, 0.14), (Q) => finRise(Q, R, 0), null);
    blend(P, R, pulse(t, 0, 0.14, 0.14, 0.3), K.heaveBack);
    blend(P, R, rampIn(t, 0.16, 0.44) * (1 - ramp(t, 0.62, 0.92)), K.driveDown);
    blend(P, R, ramp(t, 0.62, 0.93), FIN_OVER[R.key] || FIN_OVER.godzilla);
    P.hy += 0.8 * wobble(t, 0.45, 22, 7);
  } },
  finisher_victim: { dur: 0.9, hold: true, rootDriven: true, marks: { impact: 0.45 }, pose(t, P, R) {
    limp(P, R);
    blend(P, R, rampOut(t, 0, 0.15) * (1 - ramp(t, 0.4, 0.47)), K.plummet, null);
    blend(P, R, ramp(t, 0.42, 0.48), K.wreck, null);
    const k = wobble(t, 0.46, 24, 6); P.tLp += 0.5 * k; P.tRp += 0.4 * k; P.aLz += 0.3 * k; P.aRz += 0.25 * k; P.hdp += 0.3 * k; torso(P, 0.2 * k, 0, 0);
  } },
  ko: { dur: 1.3, hold: true, rootDriven: true, pose(t, P, R) {            // out cold: the fall, one last reach, nothing
    stance(P, R);
    blend(P, R, rampOut(t, 0, 0.14) * (1 - ramp(t, 0.36, 0.47)), K.fallFlail, null);
    blend(P, R, ramp(t, 0.36, 0.47), K.wreck, null);
    const k = wobble(t, 0.45, 26, 9); P.tLp += 0.3 * k; P.tRp += 0.25 * k; P.hdp += 0.2 * k;
    const r = pulse(t, 0.6, 0.85, 0.9, 1.25); P.aRz += 0.55 * r; P.aRy += 0.2 * r; P.hdp += 0.15 * r;
  } },
};

// ---------------------------------------------------------------------------
// Key poses (each edits a pose that already holds the stance, unless noted "from limp")
// ---------------------------------------------------------------------------
const _stack = [newPose(), newPose(), newPose(), newPose()];
let _sp = 0;
/** P = lerp(P, base + fn, w). base: stance by default, null = fn builds the whole pose. */
function blend(P, R, w, fn, base = stance) {
  if (w <= 0.0005) return;
  const Q = _stack[_sp++];
  resetPose(Q);
  if (base) base(Q, R);
  fn(Q, R);
  mixPose(P, Q, w);
  _sp--;
}
const CARRY = { bob: 0.3, sway: 1.0, twist: 0.04, arms: 0 };
const SHUFFLE = { bob: 0.15, sway: 0.2, twist: 0, arms: 0 };
const MARCH = { bob: 0.5, sway: 1.3, twist: 0.12, arms: 0 };

/** Body-frame rag doll: legs loose (FK), back arched, arms and head trailing. For held, thrown and falling bodies. */
function limp(P, R) {
  P.reach = 0; P.lLfk = 1; P.lRfk = 1;
  P.tLp = -0.12; P.tRp = 0.1; P.tLr = 0.2; P.tRr = 0.26; P.kLb = 0.5; P.kRb = 0.35; P.anLp = 0.45; P.anRp = 0.45;
  torso(P, -0.3, 0.05, 0.04);
  P.nkp = -0.15; P.hdp = -0.3; P.hdy = 0.2;
  hand(P, 'L', 0.72, 0.3, -0.3); elbow(P, 'L', 0.2, -0.4, -1); hand(P, 'R', 0.78, 0.05, -0.34); elbow(P, 'R', 0.2, -0.4, -1);
  P.hLp = 0.4; P.hRp = 0.4;
  if (R.iTail >= 0) { P.tlp = -1.1; P.kLb = 1.3; }
  wings(P, R, -0.15, 0.25);
  return P;
}
/** Flat on its back (body frame: the core has pitched the root -90 deg, so body +Z is up and body -Y points away along the mat). */
function sprawl(P, R) {
  P.reach = 0; P.lLfk = 1; P.lRfk = 1;
  P.tLp = 0.1; P.tRp = 0.16; P.tLr = 0.3; P.tRr = 0.36; P.kLb = 0.38; P.kRb = 0.24; P.anLp = 0.5; P.anRp = 0.5;
  torso(P, -0.1, 0.05, 0.03);
  P.nkp = -0.05; P.hdp = -0.2; P.hdy = 0.35; P.hdr = 0.1;
  hand(P, 'L', 0.82, 0.2, -0.28); elbow(P, 'L', 0.3, -0.6, -1); hand(P, 'R', 0.74, -0.3, -0.3); elbow(P, 'R', 0.3, -0.5, -1);
  P.hLp = 0.3; P.hRp = 0.3;
  P.hz = LIE_Z[R.key] || 0;
  // Tridon: swing the tail (and the thigh skinned to it) up off the mat so it lies between the legs instead of spearing the ground
  if (R.iTail >= 0) { P.tly = -1.45; P.tlp = -0.2; P.kLb = 0.5; }
  wings(P, R, -0.35, -0.2);
  return P;
}
// How far to shift each body along its own front-back axis so its back rests on the mat when the root lies at lieY = 6
const LIE_Z = { godzilla: 0.5, ghidorah: -1.0, mecha: -2.0 };

const K = {
  // -- strikes --
  jabWind(Q) { torso(Q, 0.02, 0.24, 0); hand(Q, 'L', 0.32, -0.14, 0.4); Q.hz -= 0.6; },
  jabHit(Q) {
    torso(Q, 0.14, -0.55, 0); Q.hyaw -= 0.12; Q.hz += 1.7; Q.fLz += 1.2; Q.fRpit = 0.3;
    hand(Q, 'L', 0.0, 0.12, 1.0); elbow(Q, 'L', 0.6, -0.4, -0.3); Q.hLp = 0.25; Q.aLs = 1.3;
    hand(Q, 'R', 0.28, -0.05, 0.42); Q.hdp -= 0.05;
  },
  hookWind(Q) { torso(Q, 0.02, -0.5, 0); hand(Q, 'R', 0.8, -0.02, 0.0); elbow(Q, 'R', 0.8, 0.1, -0.6); Q.hz -= 0.5; Q.hx -= 0.6; },
  hookHit(Q) {
    torso(Q, 0.12, 0.8, -0.06); Q.hyaw += 0.38; Q.hz += 1.3; Q.hx += 0.8; Q.fRpit = 0.55; Q.fRz += 0.8;
    hand(Q, 'R', -0.28, 0.06, 0.8); elbow(Q, 'R', 1, 0.15, -0.1); Q.hRp = 0.2; Q.aRs = 1.3;
    hand(Q, 'L', 0.2, 0.12, 0.4); Q.hdy -= 0.3;
  },
  hookThru(Q) {
    torso(Q, 0.2, 1.15, -0.1); Q.hyaw += 0.5; Q.hz += 1.0; Q.hx += 1.0; Q.fRpit = 0.6; Q.fRz += 1.2;
    hand(Q, 'R', -0.55, -0.08, 0.55); elbow(Q, 'R', 0.6, 0.2, -0.4); hand(Q, 'L', 0.25, 0.05, 0.35); Q.hdy -= 0.55;
  },
  hammerUp(Q, R) {
    torso(Q, -0.38, -0.1, 0); Q.hy += 1.0; Q.hz -= 0.6; Q.hyaw = 0;
    hand(Q, 'L', 0.1, 0.95, 0.02); hand(Q, 'R', 0.1, 0.95, 0.02); elbow(Q, 'L', 1, 0.2, -0.2); elbow(Q, 'R', 1, 0.2, -0.2);
    Q.hdp += 0.22; wings(Q, R, 0.5, -0.2);
  },
  hammerDown(Q, R) {
    torso(Q, 0.62, -0.1, 0); Q.hy -= 2.6; Q.hz += 1.6; Q.hyaw = 0; Q.fLz += 1.0;
    hand(Q, 'L', 0.03, -0.25, 0.9); hand(Q, 'R', 0.03, -0.25, 0.9); elbow(Q, 'L', 1, -0.2, -0.2); elbow(Q, 'R', 1, -0.2, -0.2); Q.aLs = 1.3; Q.aRs = 1.3;
    Q.hdp -= 0.4; Q.nkp -= 0.15; wings(Q, R, -0.3, 0.3);
  },
  heavyWind(Q, R) {
    Q.hz -= 2.2; Q.hy -= 1.0; Q.hyaw -= 0.45; torso(Q, 0.1, -0.8, 0.06);
    hand(Q, 'R', 0.6, 0.02, -0.55); elbow(Q, 'R', 0.7, 0.4, -1); hand(Q, 'L', 0.08, 0.05, 0.86);
    Q.hdy += 0.75; Q.fRx += 0.6; Q.fLpit = 0.25; tail(Q, R, 0.35); wings(Q, R, 0.3, 0.3);
  },
  heavyHit(Q, R) {
    Q.hz += 3.2; Q.hy -= 0.6; Q.hyaw += 0.5; torso(Q, 0.26, 0.95, -0.06); Q.fLz += 1.5; Q.fRz += 2.4; Q.fRpit = 0.65;
    hand(Q, 'R', -0.2, 0.1, 0.96); elbow(Q, 'R', 1, 0.3, -0.2); Q.hRp = 0.2; Q.aRs = 1.5;
    hand(Q, 'L', 0.45, -0.25, 0.1); Q.hdy -= 0.6; tail(Q, R, -0.45); wings(Q, R, -0.1, 0.4);
  },
  heavyThru(Q, R) {
    Q.hz += 2.6; Q.hy -= 1.6; Q.hyaw += 0.7; torso(Q, 0.45, 1.3, -0.12); Q.fLz += 1.5; Q.fRz += 3.0; Q.fRpit = 0.5;
    hand(Q, 'R', -0.65, -0.2, 0.5); elbow(Q, 'R', 0.5, 0.4, -0.5); hand(Q, 'L', 0.5, -0.3, -0.1); Q.hdy -= 0.9; Q.hdp -= 0.1; tail(Q, R, -0.6);
  },
  lariatWind(Q) { torso(Q, 0.25, -0.5, 0); hand(Q, 'R', 0.7, 0.1, -0.4); elbow(Q, 'R', 0.6, 0.5, -1); Q.hy -= 1.0; Q.fLz += 1.5; },
  lariat(Q, R) {
    torso(Q, 0.34, 0, -0.08); Q.hyaw = -0.1; Q.hy -= 1.4; Q.hz += 2.0; Q.fLz += 2.6; Q.fRz -= 2.2; Q.fRpit = 0.7;
    hand(Q, 'R', 0.99, 0.06, 0.05); elbow(Q, 'R', 0.5, 0.6, -0.6); Q.hRp = 0; Q.aRs = 1.45;
    hand(Q, 'L', 0.35, -0.5, -0.15); Q.hdp -= 0.2; wings(Q, R, 0.2, 0.5);
  },
  skid(Q) { Q.hy -= 2.2; Q.hz -= 1.2; torso(Q, 0.3, 0.3, 0); Q.fLz += 2.5; Q.fRz -= 1.0; hand(Q, 'L', 0.5, -0.4, 0.4); hand(Q, 'R', 0.6, -0.3, 0.3); },
  stompUp(Q, R) {
    Q.hx += 1.6; Q.hy += 0.4; Q.hyaw = 0; torso(Q, -0.18, 0, 0.1);
    Q.fRy = 8.0; Q.fRz = 2.5; Q.fRx = 0.4; Q.fRpit = -0.3; Q.kRo = 0.5;
    hand(Q, 'L', 0.7, 0.3, 0.3); hand(Q, 'R', 0.7, 0.4, 0.2); Q.hdp += 0.35; wings(Q, R, 0.5, 0);
  },
  stompDown(Q, R) {
    Q.hx += 0.3; Q.hy -= 2.2; Q.hz += 1.8; Q.hyaw = 0; torso(Q, 0.5, 0, 0);
    Q.fRy = 0; Q.fRz = 5.5; Q.fRx = 0.4;
    hand(Q, 'L', 0.45, -0.5, 0.4); hand(Q, 'R', 0.45, -0.55, 0.5); Q.hdp += 0.1; wings(Q, R, -0.3, 0.2);
  },
  crouch(Q) { Q.hy -= 3.6; torso(Q, 0.4, 0, 0); hand(Q, 'L', 0.45, -0.55, -0.2); hand(Q, 'R', 0.45, -0.55, -0.2); Q.hdp -= 0.25; Q.fLz = 1; Q.fRz = -1; },
  // from limp: spread-eagled in the air
  spread(Q, R) {
    limp(Q, R); torso(Q, -0.1, 0, 0); Q.tLp = -0.4; Q.tRp = -0.3; Q.tLr = 0.4; Q.tRr = 0.4; Q.kLb = 0.6; Q.kRb = 0.5;
    hand(Q, 'L', 0.82, 0.45, 0.3); hand(Q, 'R', 0.82, 0.45, 0.3); elbow(Q, 'L', 0.3, 0.3, -1); elbow(Q, 'R', 0.3, 0.3, -1); Q.hdp = -0.45; wings(Q, R, 0.9, -0.2);
    if (R.iTail >= 0) { Q.tlp = 0.3; Q.kLb = 0.6; }
  },
  // from limp: belly-down on the target
  belly(Q, R) {
    limp(Q, R); torso(Q, 0.4, 0, 0); Q.tLp = -0.1; Q.tRp = -0.05; Q.tLr = 0.35; Q.tRr = 0.35; Q.kLb = 0.3; Q.kRb = 0.3;
    hand(Q, 'L', 0.85, 0.15, 0.4); hand(Q, 'R', 0.85, 0.15, 0.4); Q.hdp = -0.5; wings(Q, R, 0.2, 0.2);
    if (R.iTail >= 0) { Q.tlp = -0.5; Q.kLb = 0.7; }
  },
  // -- powers --
  inhale(Q, R) {
    Q.hz -= 1.6; Q.hy += 0.6; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, -0.4, -0.1, 0); Q.nkp = -0.25; Q.hdp = -0.4; Q.fLz = 1.2; Q.fRz = -1.8; Q.fLx = 1.8; Q.fRx = 1.8;
    hand(Q, 'L', 0.6, -0.5, -0.1); hand(Q, 'R', 0.6, -0.5, -0.1); elbow(Q, 'L', 1, 0.2, -0.5); elbow(Q, 'R', 1, 0.2, -0.5); wings(Q, R, 0.8, -0.2); tail(Q, R, 0, 0.15);
  },
  spit(Q, R) {
    Q.hz += 2.4; Q.hy -= 1.8; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, 0.34, -0.1, 0); Q.nkp = -0.1; Q.hdp = -0.3; Q.fLz = 3.0; Q.fRz = -2.8; Q.fLx = 2.2; Q.fRx = 2.2; Q.fRpit = 0.3;
    hand(Q, 'L', 0.7, -0.45, -0.25); hand(Q, 'R', 0.7, -0.45, -0.25); elbow(Q, 'L', 1, 0.2, -0.5); elbow(Q, 'R', 1, 0.2, -0.5); wings(Q, R, 0.3, 0.5); tail(Q, R, 0, 0.25);
  },
  gather(Q, R) {
    Q.hy -= 2.6; Q.hyaw = 0; torso(Q, 0.45, 0, 0); Q.hdp = 0.25; hand(Q, 'L', -0.05, -0.2, 0.42); hand(Q, 'R', -0.05, -0.3, 0.42); Q.fLx = 2; Q.fRx = 2; wings(Q, R, -0.4, 0.4);
  },
  bellow(Q, R) {
    Q.hy -= 0.8; Q.hz += 1.8; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, 0.1, -0.1, 0); Q.nkp = -0.2; Q.hdp = -0.35; Q.fLz = 2.4; Q.fRz = -2.4; Q.fLx = 2.4; Q.fRx = 2.4;
    hand(Q, 'L', 0.92, 0.05, -0.1); hand(Q, 'R', 0.92, 0.05, -0.1); elbow(Q, 'L', 0.6, -0.6, -0.6); elbow(Q, 'R', 0.6, -0.6, -0.6); Q.hLp = -0.5; Q.hRp = -0.5; wings(Q, R, 1.1, -0.3); tail(Q, R, 0, 0.2);
  },
  coil(Q, R) {
    Q.hy -= 3.0; Q.hz -= 1.6; Q.hyaw -= 0.2; torso(Q, 0.5, -0.4, 0); Q.hdp = -0.45; Q.fLz = 2.8; Q.fRz = -2.6;
    hand(Q, 'L', 0.2, -0.35, 0.5); hand(Q, 'R', 0.55, -0.4, -0.3); wings(Q, R, -0.2, 0.5); tail(Q, R, 0.3, 0.1);
  },
  ram(Q, R) {
    Q.hy -= 2.0; Q.hz += 3.0; Q.hyaw = -0.3; torso(Q, 0.62, -0.25, 0); Q.nkp = 0.1; Q.hdp = -0.3; Q.fLz = 3.4; Q.fRz = -3.6; Q.fRpit = 0.7;
    hand(Q, 'L', 0.1, -0.2, 0.5); hand(Q, 'R', 0.5, -0.5, -0.3); wings(Q, R, 0.2, 0.7); tail(Q, R, 0, 0.3);
  },
  // from limp: knees up at the top of the jump
  tuck(Q, R) {
    limp(Q, R); resetSpine(Q); torso(Q, 0.2, 0, 0); Q.hdp = 0.1; Q.hdy = 0; Q.nkp = 0;
    Q.tLp = 1.0; Q.tRp = 0.9; Q.kLb = 1.5; Q.kRb = 1.4; Q.tLr = 0.35; Q.tRr = 0.35; Q.anLp = 0.3; Q.anRp = 0.3;
    hand(Q, 'L', 0.6, 0.75, 0.1); hand(Q, 'R', 0.6, 0.75, 0.1); wings(Q, R, 1.0, -0.2);
    if (R.iTail >= 0) { Q.tlp = 0.3; Q.kLb = 1.0; }
  },
  slamLand(Q, R) {
    Q.hy -= 4.4; Q.hz += 0.8; Q.hyaw = 0; torso(Q, 0.6, 0, 0); Q.hdp = -0.45; Q.fLx = 2.8; Q.fRx = 2.8; Q.fLz = 0.8; Q.fRz = -0.8;
    hand(Q, 'L', 0.55, -0.6, 0.3); hand(Q, 'R', 0.55, -0.6, 0.3); wings(Q, R, -0.4, 0.3);
  },
  summon(Q, R) {
    Q.hy += 1.3; Q.hz -= 0.6; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, -0.3, -0.1, 0); Q.nkp = -0.2; Q.hdp = -0.4; Q.fLx = 2.2; Q.fRx = 2.2; Q.fLz = 0.5; Q.fRz = -0.5;
    hand(Q, 'L', 0.45, 0.88, 0.0); hand(Q, 'R', 0.45, 0.88, 0.0); elbow(Q, 'L', 1, -0.2, -0.2); elbow(Q, 'R', 1, -0.2, -0.2); Q.hLp = -0.5; Q.hRp = -0.5; wings(Q, R, 1.2, -0.3); tail(Q, R, 0, 0.3);
  },
  unleash(Q, R) {
    Q.hy -= 3.8; Q.hz += 1.8; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, 0.55, -0.1, 0); Q.nkp = -0.2; Q.hdp = -0.5; Q.fLx = 3.0; Q.fRx = 3.0; Q.fLz = 2.0; Q.fRz = -1.6;
    hand(Q, 'L', 0.85, -0.45, 0.15); hand(Q, 'R', 0.85, -0.45, 0.15); elbow(Q, 'L', 1, 0.3, -0.4); elbow(Q, 'R', 1, 0.3, -0.4); Q.aLs = 1.25; Q.aRs = 1.25; wings(Q, R, 1.3, 0.2); tail(Q, R, 0, 0.3);
  },
  // -- defence --
  guard(Q, R) {
    Q.hy -= 0.9; Q.hyaw = -0.1; torso(Q, 0.2, -0.05, 0); Q.fLx += 0.5; Q.fRx += 0.6;
    hand(Q, 'L', -0.1, 0.3, 0.52); elbow(Q, 'L', 0.5, -1, 0.1); hand(Q, 'R', -0.04, 0.1, 0.56); elbow(Q, 'R', 0.5, -1, 0.1);
    Q.hLp = -0.5; Q.hRp = -0.5; Q.hdp = 0.12; Q.nkp = 0.05; wings(Q, R, 0.1, -0.5);
  },
  hitHigh(Q, R) {
    torso(Q, -0.42, 0.28, 0.1); Q.hz -= 1.6; Q.hy += 0.3; Q.nkp -= 0.2; Q.hdp -= 0.45; Q.hdy = 0.35; Q.hdr = -0.2;
    hand(Q, 'L', 0.55, -0.15, 0.45); hand(Q, 'R', 0.6, -0.3, 0.3); Q.fLpit = -0.2; tail(Q, R, 0.3, 0.1); wings(Q, R, 0.3, 0.2);
  },
  hitLow(Q, R) {
    torso(Q, 0.6, -0.12, 0); Q.hz -= 1.2; Q.hy -= 1.4; Q.hdp += 0.25;
    hand(Q, 'L', 0.02, -0.5, 0.38); hand(Q, 'R', 0.05, -0.55, 0.4); tail(Q, R, -0.2, 0.15); wings(Q, R, -0.2, 0.3);
  },
  reel(Q, R) {
    torso(Q, -0.34, 0.2, 0.1); Q.hz -= 1.5; Q.hy -= 0.4; Q.hpit = -0.06; Q.hdp -= 0.3; Q.hdy = 0.2;
    hand(Q, 'L', 0.7, 0.1, 0.3); hand(Q, 'R', 0.7, -0.1, 0.25); wings(Q, R, 0.4, 0);
  },
  dizzy(Q, R) {
    Q.hy -= 1.6; Q.hyaw = 0; torso(Q, 0.32, 0, 0); Q.nkp = 0.1; Q.hdp = 0.25;
    hand(Q, 'L', 0.3, -0.9, 0.12); hand(Q, 'R', 0.3, -0.9, 0.12); Q.hLp = 0.3; Q.hRp = 0.3; Q.fLz = 0.5; Q.fRz = -0.5;
    wings(Q, R, -0.45, 0.25);
    if (R.iTail >= 0) Q.tlp = 0.02;
  },
  // -- grapple --
  reachWind(Q, R) { torso(Q, 0.05, 0, 0); Q.hyaw = 0; hand(Q, 'L', 0.9, 0.1, 0.25); hand(Q, 'R', 0.9, 0.1, 0.25); Q.hy -= 0.8; wings(Q, R, 0.4, 0); },
  reach(Q) {
    torso(Q, 0.42, 0, 0); Q.hyaw = 0; Q.hz += 2.4; Q.hy -= 1.6; Q.fLz += 2.0; Q.fRpit = 0.5;
    hand(Q, 'L', 0.14, 0.2, 0.97); hand(Q, 'R', 0.14, 0.05, 0.97); elbow(Q, 'L', 1, -0.3, 0); elbow(Q, 'R', 1, -0.3, 0); Q.hdp -= 0.35;
  },
  tieUp(Q) {
    Q.hy -= 2.2; Q.hz += 1.0; Q.hx -= 3.2; Q.hyaw = 0.1; torso(Q, 0.44, 0.22, -0.1);
    Q.fLx = 2.2; Q.fLz = 2.4; Q.fRx = 2.4; Q.fRz = -3.4; Q.fRpit = 0.4; Q.fRyaw = 0.45;
    hand(Q, 'L', 0.2, 0.3, 0.9); elbow(Q, 'L', 1, -0.2, -0.2); hand(Q, 'R', 0.3, 0.02, 0.86); elbow(Q, 'R', 1, -0.5, -0.2);
    Q.hLp = -0.2; Q.hRp = -0.2; Q.nkp = -0.15; Q.hdp = -0.3; Q.hdy = -0.25; Q.hdr = -0.2;
  },
  liftSquat(Q) {
    Q.hy -= 4.4; Q.hz += 1.4; Q.hyaw = 0; torso(Q, 0.5, 0, 0); Q.fLx = 2.2; Q.fRx = 2.2; Q.fLz = 0.8; Q.fRz = -0.8;
    hand(Q, 'L', 0.28, -0.5, 0.78); hand(Q, 'R', 0.28, -0.5, 0.78); elbow(Q, 'L', 1, -0.6, -0.3); elbow(Q, 'R', 1, -0.6, -0.3); Q.hdp -= 0.3;
  },
  liftTop(Q, R) {
    Q.hy += 0.9; Q.hz -= 0.2; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, -0.3, -0.1, 0); Q.fLx = 2.0; Q.fRx = 2.0; Q.fLz = 0.6; Q.fRz = -0.6; Q.fRyaw = 0.25; Q.fLyaw = 0.25;
    hand(Q, 'L', 0.34, 0.93, 0.02); hand(Q, 'R', 0.34, 0.93, 0.02); elbow(Q, 'L', 1, 0.1, 0.1); elbow(Q, 'R', 1, 0.1, 0.1);
    Q.hLp = -0.6; Q.hRp = -0.6; Q.hdp = 0.12; Q.nkp = 0; wings(Q, R, 0.2, 0.4);
  },
  heaveBack(Q, R) { K.liftTop(Q, R); torso(Q, -0.22, 0, 0); Q.aLz = -0.22; Q.aRz = -0.22; Q.hy -= 0.8; },
  heaveDown(Q, R) {
    Q.hy -= 2.8; Q.hz += 1.8; Q.hyaw = 0; torso(Q, 0.7, -0.1, 0); Q.fLz = 2.4; Q.fRz = -1.6; Q.fRpit = 0.5; Q.fLx = 1.8; Q.fRx = 1.8;
    hand(Q, 'L', 0.22, -0.4, 0.86); hand(Q, 'R', 0.22, -0.4, 0.86); Q.hdp -= 0.45; wings(Q, R, -0.3, 0.3);
  },
  driveDown(Q, R) {
    Q.hy -= 4.2; Q.hz += 2.2; Q.hyaw = 0; torso(Q, 0.85, -0.1, 0); Q.fLz = 2.6; Q.fRz = -1.2; Q.fLx = 2.4; Q.fRx = 2.4;
    hand(Q, 'L', 0.2, -0.55, 0.8); hand(Q, 'R', 0.2, -0.55, 0.8); Q.hdp -= 0.6; wings(Q, R, 0.7, -0.3);
  },
  whipWind(Q) {
    torso(Q, 0.15, -0.6, 0); Q.hyaw -= 0.2; Q.hz -= 1.2; Q.hx -= 1.0; Q.hy -= 1.2;
    hand(Q, 'R', 0.5, -0.05, 0.6); hand(Q, 'L', -0.3, -0.05, 0.75); Q.hdy += 0.4;
  },
  whipThru(Q, R) {
    torso(Q, 0.3, 0.75, -0.05); Q.hyaw += 0.45; Q.hz += 2.4; Q.hx += 0.8; Q.hy -= 1.4; Q.fRz += 2.4; Q.fRpit = 0.6;
    hand(Q, 'L', 0.45, 0.08, 0.88); hand(Q, 'R', -0.25, 0.08, 0.95); elbow(Q, 'L', 0.5, -0.5, -0.5); elbow(Q, 'R', 0.5, -0.5, -0.5);
    Q.hdy -= 0.5; tail(Q, R, -0.5);
  },
  headlong(Q) { Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, 0.35, -0.1, 0); Q.hdp -= 0.1; Q.hy -= 0.3; },
  clasp(Q) {
    Q.hy -= 3.8; Q.hz += 1.8; Q.hyaw = 0; torso(Q, 0.46, 0, 0); Q.fLx = 2.2; Q.fRx = 2.2; Q.fLz = 1.0; Q.fRz = -1.0;
    hand(Q, 'L', 0.08, -0.32, 0.85); hand(Q, 'R', 0.08, -0.4, 0.85); elbow(Q, 'L', 1, -0.2, -0.3); elbow(Q, 'R', 1, -0.2, -0.3); Q.hdy = 0.5; Q.hdr = -0.3;
  },
  bridge(Q, R) {
    Q.hy -= 1.6; Q.hz += 2.6; Q.hyaw = 0; Q.hpit = -0.3; torso(Q, -1.05, 0, 0); Q.fLx = 2.2; Q.fRx = 2.2; Q.fLz = 0.5; Q.fRz = -0.5; Q.fLpit = 0.6; Q.fRpit = 0.6;
    hand(Q, 'L', 0.2, 0.86, -0.45); hand(Q, 'R', 0.2, 0.86, -0.45); elbow(Q, 'L', 1, 0.2, 0.3); elbow(Q, 'R', 1, 0.2, 0.3);
    Q.nkp = -0.25; Q.hdp = -0.45; wings(Q, R, 0.3, -0.4);
  },
  swingHold(Q, R) {
    Q.hy -= 2.4; Q.hz -= 0.6; Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, -0.1, -0.1, 0); Q.fLx = 2.0; Q.fRx = 2.0; Q.fLz = 1.2; Q.fRz = 0.6;
    hand(Q, 'L', 0.1, -0.22, 0.97); hand(Q, 'R', 0.1, -0.22, 0.97); Q.aLs = 1.3; Q.aRs = 1.3; Q.hdp = 0.2; tail(Q, R, 0, 0.1); wings(Q, R, 0.3, 0.5);
  },
  // -- ground --
  // from limp: thrown off its feet, grabbing at the air
  fallFlail(Q, R) {
    limp(Q, R); torso(Q, 0.6, 0, 0); Q.nkp = 0.2; Q.hdp = 0.35; Q.hdy = 0;
    Q.tLp = 0.75; Q.tRp = 0.55; Q.kLb = 0.6; Q.kRb = 0.8; Q.tLr = 0.3; Q.tRr = 0.3;
    hand(Q, 'L', 0.45, 0.5, 0.65); hand(Q, 'R', 0.5, 0.3, 0.7); elbow(Q, 'L', 0.8, -0.4, -0.2); elbow(Q, 'R', 0.8, -0.4, -0.2);
    wings(Q, R, 0.7, -0.3);
    if (R.iTail >= 0) { Q.tlp = -0.6; Q.kLb = 1.0; }
  },
  sprawl(Q, R) { sprawl(Q, R); },
  // from limp: sitting up off the mat, hands pushing
  sitUp(Q, R) {
    sprawl(Q, R); torso(Q, 0.95, 0, 0); Q.nkp = 0.1; Q.hdp = -0.1; Q.hdy = 0;
    Q.tLp = 1.0; Q.tRp = 1.1; Q.kLb = 1.5; Q.kRb = 1.6; Q.tLr = 0.3; Q.tRr = 0.3;
    hand(Q, 'L', 0.55, -0.7, -0.2); hand(Q, 'R', 0.55, -0.7, -0.2);
    if (R.iTail >= 0) { Q.tlp = -0.7; Q.kLb = 1.2; }
    wings(Q, R, 0.1, 0);
  },
  // from limp: lying across the foe, pressing its shoulders down
  cover(Q, R) {
    limp(Q, R); Q.hpit = -0.35; torso(Q, 0.75, 0, 0); Q.nkp = -0.2; Q.hdp = -0.55; Q.hdy = 0.3;
    Q.tLp = -0.2; Q.tRp = 0.1; Q.tLr = 0.4; Q.tRr = 0.45; Q.kLb = 0.5; Q.kRb = 0.9;
    hand(Q, 'L', 0.5, 0.3, 0.75); hand(Q, 'R', 0.5, 0.2, 0.78); elbow(Q, 'L', 1, 0, -0.4); elbow(Q, 'R', 1, 0, -0.4);
    wings(Q, R, 0.5, 0.2);
    if (R.iTail >= 0) { Q.tlp = -0.7; Q.kLb = 0.8; }
  },
  // from limp: the kick-out
  kick(Q, R) {
    sprawl(Q, R); torso(Q, 0.55, 0, 0); Q.hdp = 0.3; Q.hdy = 0;
    Q.tLp = 1.0; Q.tRp = 0.9; Q.kLb = 0.5; Q.kRb = 0.4;
    hand(Q, 'L', 0.25, 0.3, 0.9); hand(Q, 'R', 0.25, 0.3, 0.9); wings(Q, R, 0.8, -0.3);
    if (R.iTail >= 0) Q.tlp = -0.9;
  },
  // from limp: driven down back-first, limbs trailing above it
  plummet(Q, R) {
    limp(Q, R); torso(Q, 0.7, 0, 0); Q.hdp = 0.4;
    Q.tLp = 0.9; Q.tRp = 0.8; Q.kLb = 0.3; Q.kRb = 0.35; Q.tLr = 0.4; Q.tRr = 0.4;
    hand(Q, 'L', 0.5, 0.2, 0.8); hand(Q, 'R', 0.5, 0.1, 0.82); wings(Q, R, 0.9, -0.4);
    if (R.iTail >= 0) Q.tlp = -0.9;
  },
  // from limp: wrecked (KO / after a finisher): flatter and more broken than a plain sprawl
  wreck(Q, R) {
    sprawl(Q, R); torso(Q, -0.05, 0.12, 0.08); Q.hdy = 0.6; Q.hdp = -0.3; Q.hdr = 0.2;
    Q.tLr = 0.5; Q.tRr = 0.42; Q.tLp = 0.02; Q.tRp = 0.3; Q.kLb = 0.2; Q.kRb = 0.75;
    hand(Q, 'L', 0.9, 0.5, -0.3); hand(Q, 'R', 0.6, -0.55, -0.3);
    if (R.iTail >= 0) { Q.tlp = -1.25; Q.kLb = 1.5; }
  },
};

// ---------------------------------------------------------------------------
// Per-kaiju character: taunts, victory, entrance strut, finisher poses
// ---------------------------------------------------------------------------
/** Snap between poses like a machine: 0 -> 1 in `d` seconds starting at a. */
const snap = (t, a, d = 0.07) => smooth((t - a) / d);

const TAUNT_A = {
  // Gorrak, the tyrant: rears up, beats its chest, then bellows at the foe with its spines flared
  godzilla(t, P, R) {
    blend(P, R, ramp(t, 0, 0.28) * (1 - ramp(t, 1.15, 1.3)), (Q) => {
      Q.hy += 1.2; Q.hyaw = 0; Q.hz -= 0.4; torso(Q, -0.3, -0.1, 0); Q.hdp = -0.2; Q.fLz = 0.6; Q.fRz = -0.6; Q.fLx = 2; Q.fRx = 2;
      hand(Q, 'L', 0.85, 0.15, 0.3); hand(Q, 'R', 0.85, 0.15, 0.3); elbow(Q, 'L', 1, 0.2, -0.3); elbow(Q, 'R', 1, 0.2, -0.3); wings(Q, R, 0.5, 0);
    });
    // four beats, alternating fists
    for (let i = 0; i < 4; i++) {
      const b = pulse(t, 0.3 + i * 0.21, 0.37 + i * 0.21, 0.39 + i * 0.21, 0.5 + i * 0.21);
      if (b <= 0) continue;
      const s = i % 2 ? 'R' : 'L';
      if (s === 'L') { P.aLx += (-0.12 - P.aLx) * b; P.aLy += (-0.25 - P.aLy) * b; P.aLz += (0.36 - P.aLz) * b; P.aRx += 0.2 * b; P.aRy += 0.35 * b; }
      else { P.aRx += (-0.12 - P.aRx) * b; P.aRy += (-0.25 - P.aRy) * b; P.aRz += (0.36 - P.aRz) * b; P.aLx += 0.2 * b; P.aLy += 0.35 * b; }
      torso(P, 0.1 * b, (i % 2 ? -0.3 : 0.3) * b, (i % 2 ? 0.1 : -0.1) * b); P.hy -= 0.7 * b; P.hx += (i % 2 ? -0.8 : 0.8) * b;
    }
    blend(P, R, ramp(t, 1.15, 1.34) * (1 - ramp(t, 1.82, 2.0)), (Q) => {
      Q.hy -= 1.8; Q.hz += 2.2; Q.hyaw = 0; torso(Q, 0.34, -0.1, 0); Q.nkp = -0.2; Q.hdp = -0.4; Q.fLz = 2.6; Q.fRz = -2.6; Q.fRpit = 0.4; Q.fLx = 2.2; Q.fRx = 2.2;
      hand(Q, 'L', 0.75, -0.5, -0.3); hand(Q, 'R', 0.75, -0.5, -0.3); elbow(Q, 'L', 1, 0, -0.6); elbow(Q, 'R', 1, 0, -0.6); Q.hLp = -0.5; Q.hRp = -0.5; wings(Q, R, 1.2, -0.3);
    });
    const roar = pulse(t, 1.3, 1.4, 1.75, 1.85);   // the whole body shakes with it
    P.hdy += 0.06 * roar * sin(t * 55); P.s3y += 0.025 * roar * sin(t * 47); P.hdr += 0.05 * roar * sin(t * 39); P.cLr += 0.05 * roar * sin(t * 50); P.cRr -= 0.05 * roar * sin(t * 50);
  },
  // Tridon, the storm dragon: folds down, then throws its wings and all three heads to the sky
  ghidorah(t, P, R) {
    blend(P, R, ramp(t, 0, 0.4) * (1 - rampIn(t, 0.45, 0.62)), (Q) => {
      Q.hy -= 2.6; Q.hyaw = 0; torso(Q, 0.5, -0.1, 0); Q.hdp = 0.3; hand(Q, 'L', 0.2, -0.4, 0.4); hand(Q, 'R', 0.2, -0.4, 0.4);
      Q.cLr = -0.5; Q.cRr = -0.5; Q.cLy = 0.5; Q.cRy = 0.5; Q.tlp = 0.05;
    });
    blend(P, R, rampIn(t, 0.45, 0.66) * (1 - ramp(t, 1.7, 2.0)), (Q) => {
      Q.hy += 1.4; Q.hyaw = 0; Q.hz -= 0.5; torso(Q, -0.42, -0.1, 0); Q.nkp = -0.35; Q.hdp = -0.55; Q.fLz = 0.8; Q.fRz = -0.8; Q.fLx = 2; Q.fRx = 2;
      hand(Q, 'L', 0.85, 0.3, 0.1); hand(Q, 'R', 0.85, 0.3, 0.1); elbow(Q, 'L', 0.6, -0.6, -0.6); elbow(Q, 'R', 0.6, -0.6, -0.6); Q.hLp = -0.5; Q.hRp = -0.5;
      Q.cLr = 0.75; Q.cRr = 0.75; Q.cLy = -0.35; Q.cRy = -0.35; Q.tlp = 0.3;
    });
    const up = pulse(t, 0.62, 0.72, 1.6, 1.75), a = (t - 0.66) * TAU;
    P.cLr += 0.22 * up * sin(a * 1.6); P.cRr += 0.22 * up * sin(a * 1.6); P.cLy += 0.15 * up * cos(a * 1.6); P.cRy += 0.15 * up * cos(a * 1.6);
    P.hdy += 0.3 * up * sin(a * 1.1); P.hdr += 0.12 * up * sin(a * 1.1 + 1); P.tly += 0.55 * up * sin(a * 1.6 + 1); P.hy += 0.3 * up * sin(a * 1.6);
    P.hdy += 0.04 * up * sin(t * 51);
  },
  // Mechra, the war machine: a systems check in hard stops, ending with the fists driven together
  mecha(t, P, R) {
    const m = (a, fn) => blend(P, R, snap(t, a), fn);
    m(0.08, (Q) => { Q.hy += 1.0; Q.hyaw = 0; Q.hz = 0; Q.hpit = 0; resetTorso(Q); Q.fLz = 0; Q.fRz = 0; Q.fLx = 1; Q.fRx = 1; Q.fRyaw = 0.1; Q.fLyaw = 0.1; hand(Q, 'L', 0.32, -0.92, 0.05); hand(Q, 'R', 0.32, -0.92, 0.05); Q.hdp = 0; Q.hdy = 0; Q.nkp = 0; });
    m(0.4, (Q) => { K.mechT(Q, R); hand(Q, 'L', 0.98, 0.0, 0.0); hand(Q, 'R', 0.98, 0.0, 0.0); wings(Q, R, 0.8, 0); });
    m(0.68, (Q) => { K.mechT(Q, R); hand(Q, 'L', 0.55, 0.5, 0.05); hand(Q, 'R', 0.55, 0.5, 0.05); elbow(Q, 'L', 1, -0.3, 0); elbow(Q, 'R', 1, -0.3, 0); wings(Q, R, 1.2, 0); });
    m(0.95, (Q) => { K.mechT(Q, R); hand(Q, 'L', 0.55, 0.5, 0.05); hand(Q, 'R', 0.55, 0.5, 0.05); elbow(Q, 'L', 1, -0.3, 0); elbow(Q, 'R', 1, -0.3, 0); torso(Q, 0, -0.7, 0); Q.hdy = -0.4; wings(Q, R, 1.2, 0); });
    m(1.2, (Q) => { K.mechT(Q, R); hand(Q, 'L', 0.55, 0.5, 0.05); hand(Q, 'R', 0.55, 0.5, 0.05); elbow(Q, 'L', 1, -0.3, 0); elbow(Q, 'R', 1, -0.3, 0); torso(Q, 0, 0.7, 0); Q.hdy = 0.4; wings(Q, R, 1.2, 0); });
    m(1.48, (Q) => { K.mechT(Q, R); Q.hy -= 1.2; torso(Q, 0.2, 0, 0); hand(Q, 'L', -0.12, -0.05, 0.62); hand(Q, 'R', -0.12, -0.05, 0.62); elbow(Q, 'L', 1, 0, 0); elbow(Q, 'R', 1, 0, 0); Q.hdp = -0.15; wings(Q, R, -0.2, 0); });
    P.hz -= 0.5 * wobble(t, 1.55, 40, 12); P.s3p -= 0.04 * wobble(t, 1.55, 40, 12);
    blend(P, R, ramp(t, 1.82, 2.0), () => {});
  },
};
function resetSpine(Q) { Q.s1p = Q.s2p = Q.s3p = 0; Q.s1y = Q.s2y = Q.s3y = 0; Q.s1r = Q.s2r = Q.s3r = 0; }
function resetTorso(Q) { Q.s1p = Q.s2p = Q.s3p = 0; Q.s1y = Q.s2y = Q.s3y = 0; Q.s1r = Q.s2r = Q.s3r = 0; }
K.mechT = (Q, R) => { Q.hy += 0.8; Q.hyaw = 0; Q.hz = 0; resetTorso(Q); Q.fLz = 0; Q.fRz = 0; Q.fLx = 1.6; Q.fRx = 1.6; Q.hdp = 0; Q.hdy = 0; Q.nkp = 0; };

const TAUNT_B = {
  // Gorrak: hammers the ground with both fists, then waves the foe in
  godzilla(t, P, R) {
    blend(P, R, ramp(t, 0, 0.4) * (1 - rampIn(t, 0.44, 0.58)), K.hammerUp);
    blend(P, R, rampIn(t, 0.44, 0.6) * (1 - ramp(t, 0.95, 1.3)), (Q) => {
      Q.hy -= 5.0; Q.hz += 2.5; Q.hyaw = 0; torso(Q, 0.9, -0.1, 0); Q.fLx = 2.6; Q.fRx = 2.6; Q.fLz = 0.5; Q.fRz = -0.5; Q.hdp = -0.7;
      Q.aLw = 1; Q.aRw = 1; Q.aLwx = 3.2; Q.aRwx = 3.2; Q.aLwy = 1.2; Q.aRwy = 1.2; Q.aLwz = 9; Q.aRwz = 9; wings(Q, R, 1.0, -0.2);
    });
    P.hy += 0.6 * wobble(t, 0.6, 26, 7);
    blend(P, R, ramp(t, 1.15, 1.4) * (1 - ramp(t, 1.85, 2.0)), (Q) => {
      Q.hy += 0.6; torso(Q, -0.15, 0.1, 0); Q.hdp = -0.2; hand(Q, 'L', 0.45, -0.6, 0.1); hand(Q, 'R', 0.12, -0.05, 0.92); elbow(Q, 'R', 0.3, -1, 0); Q.hRp = -0.9;
    });
    const c = pulse(t, 1.4, 1.45, 1.8, 1.85), k = 0.5 - 0.5 * cos((t - 1.4) * TAU / 0.2);   // "come on": the hand curls twice
    P.aRz -= 0.22 * c * k; P.aRy += 0.12 * c * k; P.hRp += 0.9 * c * k;
  },
  // Tridon: three beats of the wings that would flatten a city block, heads weaving
  ghidorah(t, P, R) {
    const w = ramp(t, 0, 0.2) * (1 - ramp(t, 1.75, 2.0));
    blend(P, R, w, (Q) => { Q.hy -= 1.2; Q.hyaw = 0; torso(Q, 0.2, -0.1, 0); Q.fLx = 2; Q.fRx = 2; hand(Q, 'L', 0.7, -0.2, 0.4); hand(Q, 'R', 0.7, -0.2, 0.4); Q.hdp = -0.15; });
    const a = (t - 0.15) / 0.52 * TAU, beat = sin(a), lead = cos(a);
    P.cLr += w * (0.1 + 0.9 * beat); P.cRr += w * (0.1 + 0.9 * beat); P.cLy += w * (-0.15 - 0.75 * lead); P.cRy += w * (-0.15 - 0.75 * lead); P.cLp += w * 0.45 * lead; P.cRp += w * 0.45 * lead;
    P.hy += w * 1.4 * beat; P.hz += w * 1.2 * lead; torso(P, -0.25 * w * beat, 0, 0);
    P.hdy += w * 0.45 * sin(a * 0.5); P.hdr += w * 0.2 * sin(a * 0.5 + 1); P.hdp += w * 0.12 * lead; P.tly += w * 0.6 * sin(a * 0.5 + 2); P.tlp += w * 0.12 * beat;
  },
  // Mechra: target lock. The arm comes up dead level at the foe, then the fist goes up and drops like a verdict
  mecha(t, P, R) {
    const m = (a, fn) => blend(P, R, snap(t, a), fn);
    m(0.1, (Q) => { K.mechT(Q, R); Q.fLz = 1.5; Q.fRz = -1.5; torso(Q, 0, -0.35, 0); hand(Q, 'R', 0.3, -0.9, 0); hand(Q, 'L', 0.02, 0.02, 0.99); elbow(Q, 'L', 0, -1, 0); Q.hLp = 0; Q.hdr = 0.22; });
    m(0.95, (Q) => { K.mechT(Q, R); Q.fLz = 1.5; Q.fRz = -1.5; torso(Q, -0.1, 0.1, 0); hand(Q, 'L', 0.35, -0.85, 0.1); hand(Q, 'R', 0.12, 0.99, 0.0); Q.hdp = -0.1; wings(Q, R, 1.0, 0); });
    m(1.4, (Q) => { K.mechT(Q, R); Q.hy -= 2.0; Q.fLz = 1.5; Q.fRz = -1.5; torso(Q, 0.35, 0.3, 0); hand(Q, 'L', 0.35, -0.85, 0.1); hand(Q, 'R', 0.1, -0.5, 0.7); Q.hdp = -0.2; wings(Q, R, -0.3, 0); });
    const lock = pulse(t, 0.2, 0.25, 0.85, 0.9);    // servo pulses while it holds the aim
    P.aLz -= 0.03 * lock * Math.max(0, sin((t - 0.2) * TAU / 0.22)); P.hz -= 0.5 * wobble(t, 1.47, 40, 12);
    blend(P, R, ramp(t, 1.8, 2.0), () => {});
  },
};

const WIN = {
  godzilla(ph, P, R) {
    const a = ph * TAU;
    P.hy += 0.8 + 0.5 * sin(a * 3); P.hyaw = 0; torso(P, -0.3, 0.3 * sin(a) - 0.1, 0.05 * sin(a * 3)); P.nkp = -0.25; P.hdp = -0.45; P.hdy = 0.2 * sin(a);
    hand(P, 'L', 0.5, 0.8 + 0.1 * sin(a * 3), 0.1); hand(P, 'R', 0.5, 0.8 + 0.1 * sin(a * 3 + 1.2), 0.1); elbow(P, 'L', 1, -0.3, 0); elbow(P, 'R', 1, -0.3, 0);
    P.fLx = 2; P.fRx = 2; P.fLz = 0.5; P.fRz = -0.5; P.fLy = 1.6 * Math.max(0, sin(a * 3)); P.fRy = 1.6 * Math.max(0, -sin(a * 3));
    wings(P, R, 0.8 + 0.3 * sin(a * 3), 0); P.hdy += 0.03 * sin(ph * 300);
  },
  ghidorah(ph, P, R) {
    const a = ph * TAU, b = sin(a * 2);
    P.hy += 1.0 + 0.6 * b; P.hyaw = 0; torso(P, -0.35 - 0.08 * b, -0.1, 0); P.nkp = -0.3; P.hdp = -0.45; P.hdy = 0.4 * sin(a); P.hdr = 0.15 * sin(a + 1);
    hand(P, 'L', 0.8, 0.2, 0.2); hand(P, 'R', 0.8, 0.2, 0.2);
    P.cLr = 0.55 + 0.4 * b; P.cRr = 0.55 + 0.4 * b; P.cLy = -0.2 - 0.3 * cos(a * 2); P.cRy = -0.2 - 0.3 * cos(a * 2);
    P.tly = 0.6 * sin(a + 1); P.tlp = 0.25; P.fLx = 2; P.fRx = 2; P.fLz = 0.5; P.fRz = -0.5;
  },
  mecha(ph, P, R) {
    const a = ph * TAU;
    // the head and chest sweep the crowd in three stops
    const yaw = 0.45 * (smooth((ph % 1) * 6 - 0.5) - smooth((ph % 1) * 6 - 2.5) * 2 + smooth((ph % 1) * 6 - 4.5));
    K.mechT(P, R); torso(P, -0.08, yaw, 0); P.hdy = yaw * 0.6; P.hy += 0.1 * sin(a * 2);
    hand(P, 'R', 0.15, 0.99, 0.0); hand(P, 'L', 0.5, -0.5, 0.05); elbow(P, 'L', 1, 0, -0.6); P.hLp = 0.8;
    wings(P, R, 0.8 + 0.2 * sin(a * 2), 0);
  },
};

const STRUT = {
  godzilla(P, R, ph) {       // knuckles low, shoulders rolling: it owns the street
    const a = ph * TAU;
    P.hyaw = 0; P.s1y -= 0.12; torso(P, 0.1, -0.1 + 0.2 * cos(a), 0.08 * sin(a)); P.hdp = -0.2; P.hdy = -0.25 * cos(a);
    hand(P, 'L', 0.55, -0.72, 0.15 - 0.25 * cos(a)); hand(P, 'R', 0.55, -0.72, 0.15 + 0.25 * cos(a)); elbow(P, 'L', 1, 0, -0.5); elbow(P, 'R', 1, 0, -0.5);
    wings(P, R, 0.3 + 0.2 * sin(a * 2), 0);
  },
  ghidorah(P, R, ph) {       // wings half open, heads high and swaying
    const a = ph * TAU;
    P.hyaw = 0; P.s1y -= 0.12; P.hy += 0.5; torso(P, -0.15, -0.1, 0); P.nkp = -0.15; P.hdp = -0.25; P.hdy = 0.3 * sin(a); P.hdr = 0.1 * sin(a + 1);
    hand(P, 'L', 0.4, -0.5, 0.45); hand(P, 'R', 0.4, -0.5, 0.45);
    P.cLr = 0.3 + 0.15 * sin(a * 2); P.cRr = 0.3 + 0.15 * sin(a * 2); P.cLy = -0.1; P.cRy = -0.1; P.tlp = 0.2;
  },
  mecha(P, R, ph) {          // parade march: square shoulders, arms swinging like pistons
    const a = ph * TAU;
    P.hyaw = 0; P.hy += 0.6; resetTorso(P); P.hdp = 0; P.hdy = 0; P.nkp = 0;
    hand(P, 'L', 0.3, -0.85, 0.1 - 0.4 * cos(a)); hand(P, 'R', 0.3, -0.85, 0.1 + 0.4 * cos(a));
    wings(P, R, 0.3, 0);
  },
};

// The held pose at the top of the finisher lift (mixed over the plain overhead press)
const FIN_POSE = {
  godzilla(Q, R) { stance(Q, R); K.liftTop(Q, R); torso(Q, -0.15, 0, 0); Q.hdp = -0.5; Q.nkp = -0.3; wings(Q, R, 1.2, -0.2); Q.hy -= 1.5; Q.fLx = 2.6; Q.fRx = 2.6; },
  ghidorah(Q, R) { stance(Q, R); K.liftTop(Q, R); Q.hdp = -0.4; Q.cLr = 0.85; Q.cRr = 0.85; Q.cLy = -0.3; Q.cRy = -0.3; Q.tlp = 0.25; Q.hy -= 1.0; },
  mecha(Q, R) { stance(Q, R); K.liftTop(Q, R); resetTorso(Q); Q.hdp = 0; Q.fLx = 1.4; Q.fRx = 1.4; Q.fLz = 0; Q.fRz = 0; wings(Q, R, 1.0, 0); },
};
/** Going up with the foe overhead. Gorrak leaps (legs tucked), Tridon beats its wings, Mechra rides its thrusters ramrod straight. */
function finRise(P, R, ph) {
  const a = ph * TAU;
  stance(P, R); K.liftTop(P, R);
  P.reach = 0; P.lLfk = 1; P.lRfk = 1;
  if (R.key === 'ghidorah') {
    P.tRp = 0.25 + 0.1 * sin(a); P.kRb = 0.7; P.kLb = 0.6; P.anRp = 0.6; P.tlp = -0.15 + 0.1 * sin(a + 1); P.tly = 0.2 * sin(a);
    P.cLr = 0.35 + 0.6 * sin(a); P.cRr = 0.35 + 0.6 * sin(a); P.cLy = -0.2 - 0.45 * cos(a); P.cRy = -0.2 - 0.45 * cos(a); P.hy += 0.5 * sin(a); P.hdp = -0.35;
  } else if (R.key === 'mecha') {
    resetTorso(P); P.tLp = 0; P.tRp = 0; P.kLb = 0.05; P.kRb = 0.05; P.tLr = 0.05; P.tRr = 0.05; P.anLp = 0.9; P.anRp = 0.9; P.hdp = -0.1;
    P.hx += 0.12 * sin(a * 3); P.s3r += 0.01 * sin(a * 5); wings(P, R, 1.0, 0);
  } else {
    P.tLp = 0.9 + 0.05 * sin(a); P.tRp = 0.7; P.kLb = 1.5; P.kRb = 1.3; P.tLr = 0.35; P.tRr = 0.35; P.anLp = 0.5; P.anRp = 0.5;
    torso(P, -0.1, 0, 0); P.hdp = -0.45; wings(P, R, 1.1 + 0.2 * sin(a * 2), -0.2); P.hdy += 0.03 * sin(a * 7);
  }
  return P;
}
// Standing over the wreck after the finisher lands
const FIN_OVER = {
  godzilla(Q, R) {   // crouched over it, arms cocked wide, bellowing down
    Q.hy -= 2.4; Q.hz += 1.5; Q.hyaw = 0; torso(Q, 0.3, -0.1, 0); Q.nkp = -0.1; Q.hdp = -0.1; Q.fLx = 2.8; Q.fRx = 2.8; Q.fLz = 2.0; Q.fRz = -1.5;
    hand(Q, 'L', 0.75, -0.45, 0.2); hand(Q, 'R', 0.75, -0.45, 0.2); elbow(Q, 'L', 1, 0.3, -0.5); elbow(Q, 'R', 1, 0.3, -0.5); wings(Q, R, 1.2, -0.2);
  },
  ghidorah(Q, R) {   // wings mantled over the kill, heads snaking down at it
    Q.hy -= 1.6; Q.hz += 1.2; Q.hyaw = 0; torso(Q, 0.4, -0.1, 0); Q.nkp = 0.15; Q.hdp = 0.2; Q.fLx = 2.2; Q.fRx = 2.2; Q.fLz = 1.5; Q.fRz = -1.5;
    hand(Q, 'L', 0.6, -0.4, 0.5); hand(Q, 'R', 0.6, -0.4, 0.5); Q.cLr = 0.5; Q.cRr = 0.5; Q.cLy = -0.7; Q.cRy = -0.7; Q.cLp = 0.3; Q.cRp = 0.3; Q.tlp = 0.3; Q.tly = 0.3;
  },
  mecha(Q, R) {      // upright, one arm levelled down at the wreck
    K.mechT(Q, R); Q.fLz = 1.6; Q.fRz = -1.2; torso(Q, 0.12, 0.25, 0); Q.hdp = 0.3;
    hand(Q, 'R', 0.05, -0.55, 0.8); elbow(Q, 'R', 0.3, -1, 0); hand(Q, 'L', 0.4, -0.85, 0.0); wings(Q, R, 0.6, 0);
  },
};

// ---------------------------------------------------------------------------
// Signature grapples (the thrower). fn(s, P, R, T, D): s = real seconds into the
// move, T = its beats and D = its length (signatures.js SIGNATURES). Each starts
// from the lock-up and ends back in the stance.
// ---------------------------------------------------------------------------
const SIG_A = {
  // Gorrak, TYRANT CHOKESLAM: one hand on the throat, up at full stretch, then the whole body drives it through the mat
  godzilla(s, P, R, T, D) {
    blend(P, R, 1 - ramp(s, 0.05, 0.3), K.tieUp);
    blend(P, R, ramp(s, 0.1, 0.3) * (1 - ramp(s, 0.32, 0.6)), (Q) => {
      torso(Q, 0.18, 0.15, 0); Q.hz += 1.2; Q.hy -= 1.0; Q.fLz += 1.4;
      hand(Q, 'R', 0.12, 0.35, 0.95); elbow(Q, 'R', 1, -0.3, -0.2); hand(Q, 'L', 0.5, -0.2, 0.4); Q.hRp = -0.4;
    });
    blend(P, R, ramp(s, 0.32, T.lift) * (1 - rampIn(s, T.hang, T.hang + 0.08)), (Q) => {
      Q.hy += 0.8; Q.hz -= 0.3; Q.hyaw = 0; torso(Q, -0.3, 0.2, -0.08); Q.fLx = 2.4; Q.fRx = 2.4; Q.fLz = 1.4; Q.fRz = -1.6;
      hand(Q, 'R', 0.1, 0.97, 0.22); elbow(Q, 'R', 1, 0, -0.1); hand(Q, 'L', 0.85, 0.15, 0.1); elbow(Q, 'L', 0.6, -0.6, -0.5);
      Q.hRp = -0.6; Q.hdp = -0.35; Q.nkp = -0.2; wings(Q, R, 1.1, -0.2);
    });
    blend(P, R, rampIn(s, T.hang, T.drop) * (1 - ramp(s, T.drop + 0.2, D)), (Q) => {
      Q.hy -= 3.8; Q.hz += 2.6; Q.hyaw = 0; torso(Q, 0.8, 0.1, 0); Q.fLz = 3.0; Q.fRz = -1.8; Q.fRpit = 0.5; Q.fLx = 2.4; Q.fRx = 2.4;
      hand(Q, 'R', 0.08, -0.45, 0.88); elbow(Q, 'R', 1, 0.2, -0.3); hand(Q, 'L', 0.9, 0.2, -0.2); Q.hdp -= 0.4; wings(Q, R, 1.3, -0.3);
    });
    // the hang: the arm trembles under the weight
    const w = pulse(s, T.lift, T.lift + 0.05, T.hang - 0.05, T.hang); P.aRx += 0.012 * w * sin(s * 70); P.s3y += 0.02 * w * sin(s * 55);
    P.hy += 0.8 * wobble(s, T.drop, 24, 7);
  },
  // Tridon, STORM HURRICANRANA: a crouch, a leap onto the shoulders, a backflip with the legs locked, a cocky landing
  ghidorah(s, P, R, T, D) {
    blend(P, R, 1 - ramp(s, 0, 0.12), K.tieUp);
    blend(P, R, ramp(s, 0, T.crouch) * (1 - ramp(s, T.crouch, T.crouch + 0.1)), K.crouch);
    blend(P, R, ramp(s, T.crouch, T.crouch + 0.15) * (1 - ramp(s, T.leap + 0.05, T.leap + 0.2)), (Q, R2) => {
      limp(Q, R2); resetSpine(Q); torso(Q, -0.35, 0, 0); Q.hdp = -0.1; Q.hdy = 0; Q.nkp = 0;
      Q.tLp = 1.35; Q.tRp = 1.35; Q.kLb = 1.5; Q.kRb = 1.5; Q.tLr = 0.5; Q.tRr = 0.5; Q.anLp = 0.4; Q.anRp = 0.4;
      hand(Q, 'L', 0.15, 0.25, 0.9); hand(Q, 'R', 0.15, 0.25, 0.9); wings(Q, R2, 1.0, -0.3);
      if (R2.iTail >= 0) { Q.tlp = 0.4; Q.kLb = 1.3; }
    }, null);
    blend(P, R, ramp(s, T.leap + 0.05, T.leap + 0.2) * (1 - ramp(s, T.flip - 0.12, T.flip)), (Q, R2) => { K.tuck(Q, R2); Q.tLp = 1.4; Q.tRp = 1.3; wings(Q, R2, 1.3, 0.2); }, null);
    blend(P, R, pulse(s, T.flip - 0.08, T.flip, T.flip + 0.1, T.flip + 0.28), K.crouch);
    // the showboat: wings thrown open at the crowd before it even turns round
    blend(P, R, ramp(s, T.flip + 0.15, T.flip + 0.32) * (1 - ramp(s, D - 0.2, D)), (Q) => {
      Q.hy += 1.0; Q.hyaw = 0; torso(Q, -0.35, -0.1, 0); Q.nkp = -0.3; Q.hdp = -0.5; Q.fLx = 2; Q.fRx = 2;
      hand(Q, 'L', 0.85, 0.35, 0.1); hand(Q, 'R', 0.85, 0.35, 0.1); Q.cLr = 0.8; Q.cRr = 0.8; Q.cLy = -0.35; Q.cRy = -0.35; Q.tlp = 0.3;
    });
  },
  // Mechra, CIRCUIT BREAKER: scoop, down on one knee, the spine across the thigh; locked there a beat, then shoved off
  mecha(s, P, R, T, D) {
    blend(P, R, 1 - ramp(s, 0.05, 0.25), K.tieUp);
    blend(P, R, ramp(s, 0.05, 0.25) * (1 - ramp(s, T.scoop - 0.1, T.scoop)), K.liftSquat);
    blend(P, R, ramp(s, T.scoop - 0.12, T.scoop) * (1 - ramp(s, T.scoop + 0.02, T.knee - 0.08)), (Q) => {
      K.mechT(Q, R); Q.hy -= 0.6; torso(Q, 0.15, 0, 0); hand(Q, 'L', 0.35, 0.05, 0.85); hand(Q, 'R', 0.35, 0.0, 0.85); elbow(Q, 'L', 1, -0.5, -0.3); elbow(Q, 'R', 1, -0.5, -0.3);
    });
    blend(P, R, rampIn(s, T.scoop + 0.02, T.knee) * (1 - ramp(s, T.roll, D - 0.1)), (Q) => {
      K.mechT(Q, R); Q.hy -= 8.6; Q.hz -= 0.3; torso(Q, 0.25, 0, 0); Q.reach = 0;
      Q.fLz = 4.4; Q.fLx = 1.6; Q.fRz = -5.4; Q.fRy = 0; Q.fRx = 1.6; Q.fRpit = 1.25; Q.kLo = 0.1; Q.kRo = 0.15;
      hand(Q, 'L', 0.35, -0.3, 0.8); hand(Q, 'R', 0.3, -0.45, 0.85); elbow(Q, 'L', 1, -0.3, -0.3); elbow(Q, 'R', 1, -0.3, -0.3); Q.hdp = 0.35; wings(Q, R, 0.6, 0);
    });
    P.hy += 0.7 * wobble(s, T.knee, 30, 9); P.hz -= 0.4 * wobble(s, T.knee, 40, 12);
    // the shove off the knee
    blend(P, R, pulse(s, T.knee + 0.18, T.knee + 0.3, T.roll - 0.05, T.roll + 0.1) * 0.6, (Q) => { K.mechT(Q, R); Q.hy -= 5; hand(Q, 'L', 0.2, -0.1, 0.99); hand(Q, 'R', 0.2, -0.15, 0.99); Q.aLs = 1.15; Q.aRs = 1.15; });
  },
};

const SIG_B = {
  // Gorrak, LOOP BULLDOZER: onto the shoulder, head down and run through the city, then the powerslam
  godzilla(s, P, R, T, D) {
    blend(P, R, 1 - ramp(s, 0.02, 0.2), K.tieUp);
    blend(P, R, pulse(s, 0.02, 0.2, 0.22, T.scoop), K.liftSquat);
    const carry = ramp(s, 0.25, T.scoop) * (1 - ramp(s, T.run, T.run + 0.1));
    if (carry > 0) {
      const ph = ((s - T.scoop) / 0.36 % 1 + 1) % 1, run = ramp(s, T.scoop, T.scoop + 0.12);
      blend(P, R, carry, (Q) => {
        level(Q); Q.hyaw = 0; Q.s1y -= 0.12; torso(Q, 0.38, -0.05, 0); Q.hdp = -0.25; Q.nkp = 0.1; Q.hy -= 0.6;
        hand(Q, 'L', 0.25, 0.55, 0.5); hand(Q, 'R', 0.4, 0.6, 0.3); elbow(Q, 'L', 1, -0.4, -0.4); elbow(Q, 'R', 1, -0.4, -0.4); wings(Q, R, 0.6, 0.3);
        if (run > 0) gait(Q, R, ph, 0, 1, 12 * run, 0.42, 3.8 * run, RUN);
      });
    }
    blend(P, R, ramp(s, T.run, T.run + 0.12) * (1 - ramp(s, T.drop + 0.2, D)), K.driveDown);
    P.hy += 0.9 * wobble(s, T.drop, 24, 7);
  },
  // Tridon, SKYFALL DDT: front facelock, up on the wings, a dive, the sit-out
  ghidorah(s, P, R, T, D) {
    blend(P, R, 1 - ramp(s, 0.02, 0.2), K.tieUp);
    const lock = ramp(s, 0.05, T.lock) * (1 - ramp(s, T.spike, T.spike + 0.08));
    blend(P, R, lock, (Q) => {
      torso(Q, 0.3, -0.1, 0); Q.hyaw = 0; Q.hy -= 0.8;
      hand(Q, 'L', 0.05, -0.05, 0.75); elbow(Q, 'L', 1, 0.3, -0.2); hand(Q, 'R', 0.3, 0.05, 0.8);
    });
    // airborne: legs hang, the wings beat
    const air = ramp(s, T.lock, T.lock + 0.15) * (1 - ramp(s, T.spike - 0.05, T.spike + 0.05));
    if (air > 0) {
      P.reach = 0; P.lLfk = 1; P.lRfk = 1;
      P.tLp = 0.35 * air; P.tRp = 0.25 * air; P.kLb = 0.6 * air; P.kRb = 0.7 * air; P.anLp = 0.5 * air; P.anRp = 0.5 * air;
      const b = sin((s - T.lock) * 15), c = cos((s - T.lock) * 15), up = s < T.apex ? 1 : 0.25;
      P.cLr += air * (0.2 + 0.85 * b * up); P.cRr += air * (0.2 + 0.85 * b * up); P.cLy += air * (-0.2 - 0.5 * c * up); P.cRy += air * (-0.2 - 0.5 * c * up);
      if (s >= T.apex) { P.cLy += air * 0.8; P.cRy += air * 0.8; P.tLp -= 0.5 * air; P.tRp -= 0.5 * air; torso(P, 0.25 * air, 0, 0); }
      if (R.iTail >= 0) P.tlp += air * (s >= T.apex ? 0.5 : -0.3);
    }
    // the sit-out after the spike: on its seat, legs out, wings flared
    blend(P, R, ramp(s, T.spike - 0.03, T.spike + 0.05) * (1 - ramp(s, T.topple + 0.05, D - 0.05)), (Q, R2) => {
      Q.reach = 0; Q.lLfk = 1; Q.lRfk = 1; Q.hy -= 9.5; Q.hz -= 1.5;
      Q.tLp = 1.45; Q.tRp = 1.4; Q.kLb = 0.15; Q.kRb = 0.2; Q.tLr = 0.35; Q.tRr = 0.35; Q.anLp = -0.2; Q.anRp = -0.2;
      torso(Q, 0.15, 0, 0); hand(Q, 'L', 0.2, -0.3, 0.8); hand(Q, 'R', 0.7, -0.3, 0.2); Q.cLr = 0.7; Q.cRr = 0.7; Q.cLy = -0.2; Q.cRy = -0.2;
      if (R2.iTail >= 0) { Q.tlp = 0.2; Q.kLb = 0.4; }
    });
  },
  // Mechra, SYSTEM CRASH: turns it upside down, holds it there for the boos, hops and sits down on it
  mecha(s, P, R, T, D) {
    blend(P, R, 1 - ramp(s, 0.02, 0.18), K.tieUp);
    blend(P, R, pulse(s, 0.02, 0.18, 0.2, T.invert), K.clasp);
    blend(P, R, ramp(s, T.invert - 0.15, T.invert) * (1 - ramp(s, T.jump - 0.03, T.jump + 0.05)), (Q) => {
      K.mechT(Q, R); Q.hy -= 0.8; torso(Q, 0.2, 0, 0); Q.fLx = 0.9; Q.fRx = 0.9; Q.fLz = 0.3; Q.fRz = -0.3;
      hand(Q, 'L', 0.15, -0.2, 0.7); hand(Q, 'R', 0.15, -0.2, 0.7); elbow(Q, 'L', 1, 0, -0.4); elbow(Q, 'R', 1, 0, -0.4); Q.hdp = 0.25; wings(Q, R, 0.9, 0);
    });
    blend(P, R, ramp(s, T.jump - 0.03, T.jump + 0.06) * (1 - ramp(s, T.spike - 0.02, T.spike + 0.02)), (Q) => {
      K.mechT(Q, R); Q.hy -= 2.5; torso(Q, 0.15, 0, 0); hand(Q, 'L', 0.15, -0.3, 0.7); hand(Q, 'R', 0.15, -0.3, 0.7); Q.fLy = 2; Q.fRy = 2;
    });
    blend(P, R, ramp(s, T.spike - 0.02, T.spike + 0.03) * (1 - ramp(s, T.topple, D - 0.05)), (Q) => {
      resetTorso(Q); Q.hyaw = 0; Q.hdp = 0.2; Q.nkp = 0; Q.hdy = 0;
      Q.reach = 0; Q.lLfk = 1; Q.lRfk = 1; Q.hy -= 10; Q.hz -= 0.5;
      Q.tLp = 1.5; Q.tRp = 1.5; Q.kLb = 0.1; Q.kRb = 0.1; Q.tLr = 0.45; Q.tRr = 0.45; Q.anLp = -0.3; Q.anRp = -0.3;
      hand(Q, 'L', 0.2, -0.45, 0.75); hand(Q, 'R', 0.2, -0.45, 0.75); wings(Q, R, 1.1, 0);
    });
    P.hy += 0.8 * wobble(s, T.spike, 30, 10);
  },
};
