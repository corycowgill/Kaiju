// Pose and clip definitions for the wrestling animation set (see animRig.js for
// the pose channels and conventions). OWNER: animation engineer.
//
// Every entry of DEFS is { dur, loop?, hold?, marks?, pose(t, P, R, dur) }:
// pose() fills the pose P for time t (seconds) on rig R. The same function
// drives all three kaiju; R.key / R.quirks are there for the few places a
// body needs its own treatment (Tridon's wings and tail, Gorrak's bulk).
import { mixPose, newPose, resetPose, mirrorPose, copyPose, ramp, rampIn, rampOut, pulse, kf, wobble, smooth, clamp01, TAU } from './animRig.js';

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
  if (R.iTail >= 0) { P.tly += yaw; P.tlp += -lift; return; }
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
  if (R.iTail >= 0) { P.tlp = -0.05; }
  wings(P, R, 0.1, 0.1);
  return P;
}
/** Breathing + weight shift + tail sway on top of any standing pose. ph = cycle phase (0..1), amt = scale. */
function alive(P, R, ph, amt = 1) {
  const b = sin(ph * TAU), b2 = sin(ph * TAU * 2 + 0.6);
  P.hy += b * 0.22 * amt; P.hx += sin(ph * TAU + 1.2) * 0.3 * amt;
  P.s2p += b * 0.025 * amt; P.s3p += b * 0.02 * amt; P.nkp -= b * 0.02 * amt;
  P.aLy += b * 0.025 * amt; P.aRy += b2 * 0.02 * amt; P.aLz += b2 * 0.015 * amt;
  tail(P, R, sin(ph * TAU - 0.9) * 0.16 * amt, b2 * 0.03 * amt);
  wings(P, R, b * 0.06 * amt, b2 * 0.04 * amt);
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------
export const DEFS = {
  // ---- locomotion (driven by anims.js from root velocity; not in the public name list) ----
  idle: { dur: 3.2, loop: true, pose(t, P, R, dur) { stance(P, R); alive(P, R, t / dur); } },
};
