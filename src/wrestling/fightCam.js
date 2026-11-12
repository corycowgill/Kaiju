// Fight camera: the broadcast camera of a kaiju wrestling match.
// OWNER: camera engineer.
//
// Three modes, one composed pose (position, look point, FOV) per frame:
//   FIGHT  two-body framing. The camera sits side-on to the line between the
//          kaiju (biased toward the player's back as they separate), low when
//          space allows, at the distance that fits both bodies inside the HUD's
//          safe area. An obstruction solver slides / raises it around towers.
//          Thrown bodies are tracked until they land.
//   FREE   the classic chase cam (game.js's own), for sightseeing. Entered by
//          the lock-on toggle or when the kaiju are very far apart.
//   SHOT   cinematics keyed on bus events: entrances, pin, finisher, KO,
//          win / lose, between falls.
// Every change of mode or shot blends from the last composed pose, so nothing
// pops unless a cut is asked for. On top of the pose: trauma shake, a kick
// spring along the hit direction, FOV punches and push-ins, all on real time
// so the camera stays alive through hit-stop.
//
// Hooks (ctx, see notes/wrestling_api.md):
//   ctx.setCameraOverride(fn)  fn(camera, dtReal) -> true when it placed the camera
//   ctx.forEachBuildingNear    footprints for the obstruction tests (AABBs, b.h tall)
//   ctx.camClearDist           the chase cam's boom test (used to hand over to it)
//   ctx.shakeOffset(out)       this frame's world.shake offset (collapses, classic powers)
//   ctx.player.control.faceYaw / faceRate / moveYaw / look: owned by this module.
import * as THREE from 'three';
import { EV } from './events.js';

const DEG = Math.PI / 180;
const FREE = 0, FIGHT = 1, SHOT = 2;
const CHASE_FOV = 70;          // game.js's chase cam
const LOCK_RANGE = 340;        // further apart than this the fight framing lets go...
const LOCK_RANGE_IN = 300;     // ...and comes back inside this
const MIN_Y = 3.2;             // lowest the lens goes (ground 0, lake 0.2, crowd 1.2)
const MIN_DIST = 34, MAX_DIST = 330;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

// ---- scratch (module-level: no per-frame allocation) ----
const UP = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _head = new THREE.Vector3();
const _back = new THREE.Vector3();

// Buildings near the action (refreshed a few times a second), for the ray and push-out tests
const _near = [];
function _collect(b) { if (b.h >= 3 && !b.isFence) _near.push(b); }
// The arena's own solids (grandstands, corner towers) as boxes of the same shape, always in the list
const _solids = [];

/** Does the segment A -> B cross a standing building? Boxes that contain A (a body inside a tower) are ignored. */
function segBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < _near.length; i++) {
    const b = _near[i];
    if (b.destroyed) continue;
    const hw = b.w * 0.5 + 0.8, hd = b.d * 0.5 + 0.8;
    const x0 = b.x - hw, x1 = b.x + hw, z0 = b.z - hd, z1 = b.z + hd;
    if (ax > x0 && ax < x1 && az > z0 && az < z1 && ay < b.h) continue;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-6) { if (ax < x0 || ax > x1) continue; } else {
      const a = (x0 - ax) / dx, c = (x1 - ax) / dx;
      t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-6) { if (az < z0 || az > z1) continue; } else {
      const a = (z0 - az) / dz, c = (z1 - az) / dz;
      t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
      if (t0 > t1) continue;
    }
    // inside the footprint for t0..t1: blocked if the line is under the roof anywhere in that span
    const ya = ay + dy * t0, yb = ay + dy * t1;
    if (Math.min(ya, yb) < b.h && !(b.y0 > Math.max(ya, yb))) return true;
  }
  return false;
}
/** Is the point inside (or within pad of) a standing building? */
function inBuilding(x, y, z, pad) {
  for (let i = 0; i < _near.length; i++) {
    const b = _near[i];
    if (b.destroyed) continue;
    if (Math.abs(x - b.x) < b.w * 0.5 + pad && Math.abs(z - b.z) < b.d * 0.5 + pad && y < b.h + pad && !(b.y0 - pad > y)) return true;
  }
  return false;
}
/** Slide a point out of any building it is inside (nearest face, or over the roof). */
function pushOut(p, pad) {
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (let i = 0; i < _near.length; i++) {
      const b = _near[i];
      if (b.destroyed) continue;
      const hw = b.w * 0.5 + pad, hd = b.d * 0.5 + pad;
      const ex = hw - Math.abs(p.x - b.x), ez = hd - Math.abs(p.z - b.z), ey = b.h + pad - p.y;
      if (ex <= 0 || ez <= 0 || ey <= 0 || b.y0 - pad > p.y) continue;
      if (ey <= ex && ey <= ez) p.y += ey;
      else if (ex <= ez) p.x += p.x >= b.x ? ex : -ex;
      else p.z += p.z >= b.z ? ez : -ez;
      moved = true;
    }
    if (!moved) break;
  }
}

// Fit bodies: up to 3 vertical cylinders (x, y0, z, radius, height)
const _bod = new Float64Array(15);
let _nBod = 0;
const LOW_STATES = { downed: 1, pinned: 1, ko: 1, pinning: 1 };
// A body's vertical extent: standing = root..root + height; on the mat = low and long; carried / thrown
// (root off the ground, lying on its side) = a 22 u slab around the root
const bodyLo = (f) => (f.root.position.y > 6 ? f.root.position.y - 9 : Math.max(-2, f.root.position.y));
const bodyH = (f) => (f.root.position.y > 6 ? 22 : LOW_STATES[f.state] === 1 ? 16 : f.height * 1.08);
function addBody(f, w, ax, ay, az) {
  const wide = LOW_STATES[f.state] === 1 || f.root.position.y > 6;
  const p = f.root.position, i = _nBod * 5;
  _bod[i] = lerp(ax, p.x, w); _bod[i + 1] = lerp(ay, bodyLo(f), w); _bod[i + 2] = lerp(az, p.z, w);
  _bod[i + 3] = wide ? 18 : f.radius * 1.15;
  _bod[i + 4] = bodyH(f);
  _nBod++;
}
// Safe area of the frame the bodies must stay inside (fractions of the half-frame), set per viewport
const _fill = { x: 0.8, top: 0.7, bot: 0.84 };
/** Distance from the focus, along the boom (az, el), at which every fit body is inside the safe area. */
function fitDist(fx, fy, fz, az, el, tanH, tanV) {
  const sa = Math.sin(az), ca = Math.cos(az), se = Math.sin(el), ce = Math.cos(el);
  // fwd = -(sa ce, se, ca ce); right = (ca, 0, -sa); up = right x fwd
  const wx = -sa * ce, wy = -se, wz = -ca * ce;
  const ux = sa * wy, uy = -sa * wx - ca * wz, uz = ca * wy;
  let need = 0;
  for (let k = 0; k < _nBod; k++) {
    const i = k * 5, r = _bod[i + 3];
    const qx = _bod[i] - fx, qz = _bod[i + 2] - fz;
    const x = Math.abs(qx * ca - qz * sa) + r;
    for (let j = 0; j < 2; j++) {
      const qy = _bod[i + 1] + (j ? _bod[i + 4] : 0) - fy;
      const z = qx * wx + qy * wy + qz * wz, y = qx * ux + qy * uy + qz * uz;
      const d = Math.max(x / (tanH * _fill.x), y > 0 ? y / (tanV * _fill.top) : -y / (tanV * _fill.bot), r + 20) - z;
      if (d > need) need = d;
    }
  }
  return need;
}

// Obstruction candidates: slide sideways, raise, or both (costs in the solver prefer the first entries)
const CAND_AZ = [0, 0.32, -0.32, 0.7, -0.7, 1.15, -1.15];
const CAND_EL = [0, 0.22, 0.48, 0.85];
// Per-kaiju finisher camera style (hero angle, lens, and how the apex is shot)
const FIN_STYLE = {
  godzilla: { heroAz: 0.95, heroFov: 64, apex: 'low', roll: 0.05 },
  ghidorah: { heroAz: 0.75, heroFov: 60, apex: 'high', roll: 0 },
  mecha:    { heroAz: 1.1, heroFov: 54, apex: 'side', roll: -0.03 },
};
const SHOT_IDLE = { win: 1, lose: 1, between: 1, ko: 1 };  // shots that keep moving while the simulation is stopped
// Entrance beats that change the shot, per fighter. The director's beats come quicker than a shot can read
// (roar / card / walk inside 0.8 s), so only these cut; the rest play out inside the running shot.
const BEAT_SUB = { player: { rise: 'rise', namecard: 'namecard' }, rival: { walk: 'walk', crash: 'crash', namecard: 'namecard' } };

/** @returns {{ start, update, updateIdle, dispose, locked, setLock, mode, shot, info }} */
export function createFightCam(ctx, W) {
  const offs = [];
  const touch = !!(ctx.quality && (ctx.quality.touchUI || ctx.quality.isMobile));
  let mode = FREE, lockWanted = true, idle = false, active = false, time = 0;
  let aspect = 16 / 9;
  // The composed pose: tgt = this frame's from the mode, out = after blending (before impulses)
  const tgt = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: CHASE_FOV, roll: 0 };
  const out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: CHASE_FOV, roll: 0, valid: false };
  const blend = { t: 1, dur: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: CHASE_FOV, roll: 0 };
  // Fight rig: spherical around a smoothed focus
  const rig = { focus: new THREE.Vector3(), az: 0, el: 0, dist: 60, fov: 58, side: 1, snap: true, axX: 1, axZ: 0,
    selI: 0, selJ: 0, solveT: 0, userAz: 0, userIdle: 9, closeK: 0, swingK: 0, nearT: 9, nearX: 1e9, nearZ: 1e9, nearR: 0 };
  const V = new Float64Array(8); // smoothDamp velocities: 0 az, 1 el, 2 dist, 3-5 focus, 6 fov
  // Thrown-body tracking
  const track = { id: '', w: 0, on: false, landed: false, hold: 0, dirX: 0, dirZ: 0, speed: 0, t: 0 };
  // Impulses
  const kick = new THREE.Vector3(), kickV = new THREE.Vector3(), wsLP = new THREE.Vector3(), pushPt = new THREE.Vector3();
  const fx = { trauma: 0, fovK: 0, fovV: 0, rollK: 0, rollV: 0, pushT: 0, pushAmt: 0, pushK: 0, freezeT: 0, freezeK: 0, slowT: 0, slowAmt: 0, slowK: 0 };
  // Cinematic shot state
  const shot = { name: '', sub: '', t: 0, subT: 0, max: 0, who: null, other: null, side: 1, fresh: true, beats: false, count: 0,
    azOff: 0, elOff: 0, az0: 0, az1: 0, d0: 60, f0: 55, radius: 60, endT: -1, subj: new THREE.Vector3(), subj2: new THREE.Vector3(),
    anchor: new THREE.Vector3(), pt: new THREE.Vector3() };
  // Movement basis handed to game.js (camera yaw, rate-limited so a cut never spins a held stick)
  let basis = 0, basisValid = false;

  function sd(cur, target, vi, st, dt) {
    if (dt <= 0) return cur;
    const o = 2 / Math.max(1e-4, st), x = o * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = cur - target, tmp = (V[vi] + o * ch) * dt;
    V[vi] = (V[vi] - o * tmp) * e;
    return target + (ch + tmp) * e;
  }
  function refreshNear(x, z, r, dt) {
    rig.nearT += dt;
    if (rig.nearT < 0.3 && Math.hypot(x - rig.nearX, z - rig.nearZ) < 14 && r <= rig.nearR + 1) return;
    rig.nearT = 0; rig.nearX = x; rig.nearZ = z; rig.nearR = r;
    _near.length = 0;
    if (ctx.forEachBuildingNear) ctx.forEachBuildingNear(x, z, r, _collect);
    for (let i = 0; i < _solids.length; i++) _near.push(_solids[i]);
  }
  function beginBlend(dur) {
    if (dur <= 0) { blend.t = 1; blend.dur = 0; return; }
    if (!out.valid) {
      // nothing composed yet (match start): blend from wherever the camera is
      const camera = ctx.camera;
      out.pos.copy(camera.position);
      camera.getWorldDirection(_f);
      out.look.copy(camera.position).addScaledVector(_f, 50);
      out.fov = camera.fov; out.roll = 0; out.valid = true;
    }
    blend.pos.copy(out.pos); blend.look.copy(out.look); blend.fov = out.fov; blend.roll = out.roll;
    blend.t = 0; blend.dur = dur;
  }
  /** tgt = an orbit pose: camera at c + boom(az, el) * dist looking at c. */
  function orbit(cx, cy, cz, az, el, dist) {
    const ce = Math.cos(el);
    tgt.look.set(cx, cy, cz);
    tgt.pos.set(cx + Math.sin(az) * ce * dist, cy + Math.sin(el) * dist, cz + Math.cos(az) * ce * dist);
    if (tgt.pos.y < MIN_Y) tgt.pos.y = MIN_Y;
  }
  /** Slide the look point sideways so the subject sits off-centre (k > 0: subject left of centre), k in half-frames. */
  function offCentre(k, dist) {
    _f.subVectors(tgt.look, tgt.pos).normalize();
    _r.crossVectors(_f, UP).normalize();
    tgt.look.addScaledVector(_r, k * dist * Math.tan(tgt.fov * 0.5 * DEG) * aspect);
  }
  const camAzAround = (x, z) => (out.valid ? Math.atan2(out.pos.x - x, out.pos.z - z) : Math.atan2(ctx.camera.position.x - x, ctx.camera.position.z - z));

  // ------------------------------------------------------------------ impulses
  /** A hit: shake (trauma 0..1), a shove of the frame along (dx, dy, dz) and a FOV punch (deg/s of spring velocity). */
  function hit(trauma, dx, dy, dz, shove, fovPunch) {
    fx.trauma = Math.min(1, fx.trauma + trauma);
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-4 && shove) { const k = shove / l; kickV.x += dx * k; kickV.y += dy * k; kickV.z += dz * k; }
    if (fovPunch) fx.fovV += fovPunch;
  }
  /** Brief push-in toward a point (reversal, near-fall, taunt). */
  function push(sec, amt, x, y, z) {
    if (amt < fx.pushAmt && fx.pushT > 0.1) return;
    fx.pushT = sec; fx.pushAmt = amt; pushPt.set(x, y, z);
  }
  function dirBetween(whoId, targetId, outV) {
    const a = W[whoId], b = W[targetId];
    if (!a || !b) return outV.set(0, 0, 0);
    return outV.set(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z);
  }
  function tickImpulses(dt) {
    if (dt <= 0) return;
    fx.trauma = Math.max(0, fx.trauma - dt * (0.9 + fx.trauma * 1.4));
    // kick: damped spring back to rest
    const n = dt > 0.02 ? 2 : 1, h = dt / n;
    for (let i = 0; i < n; i++) {
      kickV.x += (-400 * kick.x - 22 * kickV.x) * h; kickV.y += (-400 * kick.y - 22 * kickV.y) * h; kickV.z += (-400 * kick.z - 22 * kickV.z) * h;
      kick.addScaledVector(kickV, h);
      fx.fovV += (-200 * fx.fovK - 17 * fx.fovV) * h; fx.fovK += fx.fovV * h;
      fx.rollV += (-260 * fx.rollK - 16 * fx.rollV) * h; fx.rollK += fx.rollV * h;
    }
    fx.pushT -= dt;
    const pk = fx.pushT > 0 ? fx.pushAmt : 0;
    fx.pushK += (pk - fx.pushK) * (1 - Math.exp(-dt * (pk > fx.pushK ? 14 : 4.5)));
    if (fx.pushT <= 0) fx.pushAmt = 0;
    fx.freezeT -= dt;
    fx.freezeK += ((fx.freezeT > 0 ? 1 : 0) - fx.freezeK) * (1 - Math.exp(-dt * (fx.freezeT > 0 ? 40 : 9)));
    fx.slowT -= dt;
    fx.slowK += ((fx.slowT > 0 ? fx.slowAmt : 0) - fx.slowK) * (1 - Math.exp(-dt * 5));
  }
  const noise = (t, s) => Math.sin(t * 33.1 + s * 12.9) * 0.55 + Math.sin(t * 51.7 + s * 4.1) * 0.3 + Math.sin(t * 87.3 + s * 7.7) * 0.15;

  // ------------------------------------------------------------------ fight framing
  // The ring: glowing cables and corner towers the lens should not look through.
  const RING_PAD = 5, RING_FOV = 76;
  let ringA = null, ringA_top = 18; // W.arena.info while a match runs; top rope height
  const ropeUp = (side) => { const R = ringA.ropes && ringA.ropes[side]; return !R || R.up !== false; };
  const inRing = (x, z, pad) => Math.abs(x - ringA.cx) < ringA.half - pad && Math.abs(z - ringA.cz) < ringA.half - pad;
  /** Both kaiju inside the ring: how far the boom (azimuth az) can run before it reaches a standing rope. */
  function ringLimit(x, z, az) {
    if (!ringA || !inRing(W.player.pos.x, W.player.pos.z, -3) || !inRing(W.rival.pos.x, W.rival.pos.z, -3)) return 1e9;
    return ringRun(x, z, az);
  }
  /** From a point inside the ring: the flat run along az to a standing rope (1e9 when outside / the rope is down). */
  function ringRun(x, z, az) {
    if (!ringA || !inRing(x, z, 1)) return 1e9;
    const sa = Math.sin(az), ca = Math.cos(az), h = ringA.half - RING_PAD;
    const tx = Math.abs(sa) < 1e-4 ? 1e9 : ((sa > 0 ? ringA.cx + h : ringA.cx - h) - x) / sa;
    const tz = Math.abs(ca) < 1e-4 ? 1e9 : ((ca > 0 ? ringA.cz + h : ringA.cz - h) - z) / ca;
    const side = tx < tz ? (sa > 0 ? 'e' : 'w') : (ca > 0 ? 's' : 'n');
    return ropeUp(side) ? Math.max(8, Math.min(tx, tz)) : 1e9;
  }
  /** Does the sight line from a body to the lens cut through the ropes? */
  function crossesRing(x, z, cx, cz) {
    if (!ringA) return false;
    const a = inRing(x, z, 0), b = inRing(cx, cz, 0);
    if (a || b) return a !== b;
    const h = ringA.half, dx = cx - x, dz = cz - z;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-6) { if (Math.abs(x - ringA.cx) > h) return false; } else {
      const a = (ringA.cx - h - x) / dx, c = (ringA.cx + h - x) / dx;
      t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
    }
    if (Math.abs(dz) < 1e-6) { if (Math.abs(z - ringA.cz) > h) return false; } else {
      const a = (ringA.cz - h - z) / dz, c = (ringA.cz + h - z) / dz;
      t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
    }
    return t0 <= t1;
  }
  function solve(fxx, fy, fz, azB, elB, tanH, tanV, wOther, tb) {
    if (_near.length === 0 && !ringA) { rig.selI = 0; rig.selJ = 0; return; }
    const p = W.player, r = W.rival;
    const wp = tb === r ? wOther : 1, wr = tb === p ? wOther : 1;
    let best = 1e9, bi = 0, bj = 0;
    for (let i = 0; i < CAND_AZ.length; i++) {
      for (let j = 0; j < CAND_EL.length; j++) {
        const az = azB + CAND_AZ[i], el = elB + CAND_EL[j];
        let cost = Math.abs(CAND_AZ[i]) * 0.5 + CAND_EL[j] * 0.75 + Math.abs(wrap(az - rig.az)) * 0.2 - (i === rig.selI && j === rig.selJ ? 0.18 : 0);
        if (cost >= best) continue;
        const ce = Math.cos(el), need = clamp(fitDist(fxx, fy, fz, az, el, tanH, tanV), MIN_DIST, MAX_DIST);
        const D = Math.min(need, ringLimit(fxx, fz, az) / ce);
        // inside the ropes the boom is short: a wider lens makes up ~1.35x, beyond that the pair gets cropped
        if (D < need) cost += Math.max(0, need / D - 1.3) * 1.6;
        const cx = fxx + Math.sin(az) * ce * D, cy = Math.max(MIN_Y, fy + Math.sin(el) * D), cz = fz + Math.cos(az) * ce * D;
        if (inBuilding(cx, cy, cz, 2.5)) cost += 2.2;
        if (cost >= best) continue;
        const P = p.pos, R = r.pos;
        if (cy < ringA_top + 8) {
          if (crossesRing(P.x, P.z, cx, cz)) cost += 0.45 * wp;
          if (crossesRing(R.x, R.z, cx, cz)) cost += 0.45 * wr;
        }
        if (wp > 0.05) {
          if (segBlocked(P.x, P.y + p.height * 0.55, P.z, cx, cy, cz)) cost += 1.15 * wp;
          if (segBlocked(P.x, P.y + p.height * 0.92, P.z, cx, cy, cz)) cost += 0.7 * wp;
        }
        if (wr > 0.05 && cost < best) {
          if (segBlocked(R.x, R.y + r.height * 0.55, R.z, cx, cy, cz)) cost += 1.0 * wr;
          if (segBlocked(R.x, R.y + r.height * 0.92, R.z, cx, cy, cz)) cost += 0.6 * wr;
        }
        if (cost < best) { best = cost; bi = i; bj = j; }
      }
    }
    rig.selI = bi; rig.selJ = bj;
  }

  function computeFight(dt) {
    const p = W.player, r = W.rival, P = p.pos, R = r.pos;
    const dx = R.x - P.x, dz = R.z - P.z, sep = Math.hypot(dx, dz);
    if (sep > 14) { rig.axX = dx / sep; rig.axZ = dz / sep; } // (bodies on top of each other: keep the last line)
    const ax = rig.axX, az_ = rig.axZ;
    const tanV = Math.tan(rig.fov * 0.5 * DEG), tanH = tanV * aspect;

    // thrown-body tracking: follow the body, let the thrower leave the frame once it is far
    let tb = null, wT = 0, wOther = 1;
    if (track.w > 0.001) {
      tb = W[track.id];
      if (tb) { wT = track.w * smooth(35, 75, sep); wOther = 1 - track.w * smooth(45, 85, sep); } // a body that leaves takes the camera with it
    }
    const grap = p.state === 'grappling' || p.state === 'grappled' || r.state === 'pinning' || p.state === 'pinning';
    const hold = W.grapple && W.grapple.hold, swing = !!(hold && hold.active && hold.type === 'swing');
    rig.closeK += ((grap && !swing ? 1 : 0) - rig.closeK) * (1 - Math.exp(-dt * 3));
    rig.swingK += ((swing ? 1 : 0) - rig.swingK) * (1 - Math.exp(-dt * (swing ? 5 : 1.5)));

    // focus: midpoint of the two, body mid-height; slides onto a tracked body
    const lo = Math.max(0, Math.min(bodyLo(p), bodyLo(r))), hi = Math.max(bodyLo(p) + bodyH(p), bodyLo(r) + bodyH(r));
    let fxx = P.x + dx * 0.5, fy = (lo + hi) * 0.5, fz = P.z + dz * 0.5;
    if (tb && wT > 0) {
      const lead = track.landed ? 0 : Math.min(26, track.speed * 0.3);
      fxx = lerp(fxx, tb.pos.x + track.dirX * lead, wT);
      fz = lerp(fz, tb.pos.z + track.dirZ * lead, wT);
      fy = lerp(fy, Math.max(0, tb.pos.y) + tb.height * 0.5, wT);
    }
    if (fx.pushK > 0.01) {
      const k = fx.pushK * 0.5;
      fxx = lerp(fxx, pushPt.x, k); fy = lerp(fy, pushPt.y, k); fz = lerp(fz, pushPt.z, k);
    }

    // boom angles: side-on up close, swinging behind the player's shoulder as they separate; low when close
    const far = smooth(36, 135, sep);
    let beta = lerp(20, 74, far) * DEG * (1 - 0.5 * rig.closeK);
    if (tb && wT > 0) beta = lerp(beta, (tb === r ? 50 : -45) * DEG, wT); // trail a thrown body, whoever threw it
    let elB = lerp(-0.2, 0.15, smooth(45, 140, sep)) - 0.05 * rig.closeK;
    if (tb && wT > 0) elB = lerp(elB, 0.2, wT);
    elB += 0.3 * rig.swingK;
    elB -= clamp(ctx.player.pitch || 0, -0.6, 0.4) * 0.5; // look up / down input tilts the boom
    const cb = Math.cos(beta), sb = Math.sin(beta);
    // ideal azimuth on side s: perp * cos(beta) - axis * sin(beta), perp = s * (axis rotated -90 deg)
    const a1 = Math.atan2(az_ * cb - ax * sb, -ax * cb - az_ * sb), a2 = Math.atan2(-az_ * cb - ax * sb, ax * cb - az_ * sb);
    if (rig.snap) {
      const cur = camAzAround(fxx, fz);
      rig.side = Math.abs(wrap(a1 - cur)) <= Math.abs(wrap(a2 - cur)) ? 1 : -1;
    } else {
      // stay on this side of the action unless the other side is now clearly nearer (the fighters swapped): never a long swing
      const dCur = Math.abs(wrap((rig.side > 0 ? a1 : a2) - rig.az)), dAlt = Math.abs(wrap((rig.side > 0 ? a2 : a1) - rig.az));
      if (dAlt + 0.6 < dCur) rig.side = -rig.side;
    }
    // manual orbit from look input (if game.js provides it), easing home once the stick rests
    const lx = ctx.input.lookX || 0;
    if (lx !== 0) { rig.userAz = clamp(rig.userAz - lx * 1.9 * dt, -1.3, 1.3); rig.userIdle = 0; } else {
      rig.userIdle += dt;
      if (rig.userIdle > 2.5) rig.userAz *= Math.exp(-dt * 1.2);
    }
    const azB = (rig.side > 0 ? a1 : a2) + rig.userAz;

    // bodies to keep in frame
    _nBod = 0;
    if (tb) {
      addBody(tb, 1, 0, 0, 0);
      const o = tb === p ? r : p;
      if (wOther > 0.02) addBody(o, wOther, tb.pos.x, Math.max(0, tb.pos.y), tb.pos.z);
    } else { addBody(p, 1, 0, 0, 0); addBody(r, 1, 0, 0, 0); }
    if (swing) {
      // the whole circle the swung body sweeps, so it never comes through the lens
      const c = W[hold.who] || p, i = _nBod * 5;
      _bod[i] = c.pos.x; _bod[i + 1] = 0; _bod[i + 2] = c.pos.z; _bod[i + 3] = 46; _bod[i + 4] = 24;
      _nBod++;
    }

    // obstruction: pick the cheapest clear boom, ~12 times a second
    refreshNear(fxx, fz, rig.dist + 80, dt);
    rig.solveT -= dt;
    if (rig.solveT <= 0 || rig.snap) { rig.solveT = 0.08; solve(fxx, fy, fz, azB, elB, tanH, tanV, wOther, tb); }
    const azT = azB + CAND_AZ[rig.selI], elT = elB + CAND_EL[rig.selJ];
    const fovT = lerp(56, 66, far) + 3 * rig.closeK;

    if (rig.snap) {
      rig.az = azT; rig.el = elT; rig.focus.set(fxx, fy, fz); rig.fov = fovT;
      rig.dist = clamp(fitDist(fxx, fy, fz, azT, elT, tanH, tanV), MIN_DIST, MAX_DIST);
      V.fill(0);
      rig.limK = undefined;
      rig.snap = false;
    } else {
      rig.az = sd(rig.az, rig.az + wrap(azT - rig.az), 0, 0.5, dt);
      rig.el = sd(rig.el, elT, 1, 0.45, dt);
      const st = lerp(0.2, 0.08, track.w);
      rig.focus.x = sd(rig.focus.x, fxx, 3, st, dt); rig.focus.y = sd(rig.focus.y, fy, 4, fy < rig.focus.y ? 0.1 : st * 1.3, dt); rig.focus.z = sd(rig.focus.z, fz, 5, st, dt);
      rig.fov = sd(rig.fov, fovT, 6, 0.6, dt);
      // pull out at once when a body is about to leave the frame, creep back in
      const need = clamp(fitDist(rig.focus.x, rig.focus.y, rig.focus.z, rig.az, rig.el, tanH, tanV), MIN_DIST, MAX_DIST);
      rig.dist = sd(rig.dist, need, 2, need > rig.dist ? 0.12 : 0.7, dt);
    }
    // inside the ropes: stop the boom short of them and widen the lens to keep the pair in frame
    const limK = Math.min(1, ringLimit(rig.focus.x, rig.focus.z, rig.az) / (Math.cos(rig.el) * rig.dist));
    rig.limK = rig.limK === undefined ? limK : rig.limK + (limK - rig.limK) * (1 - Math.exp(-dt * 6));
    const D = rig.dist * rig.limK * (1 - 0.24 * fx.pushK - 0.06 * fx.slowK);
    // keep the lens off the ground: lift the boom, not just the position, so the horizon stays put
    let el = rig.el;
    if (rig.focus.y + Math.sin(el) * D < MIN_Y) el = Math.asin(clamp((MIN_Y - rig.focus.y) / D, -1, 1));
    orbit(rig.focus.x, rig.focus.y, rig.focus.z, rig.az, el, D);
    tgt.fov = rig.limK < 0.999 ? Math.min(RING_FOV, 2 * Math.atan(Math.tan(rig.fov * 0.5 * DEG) / rig.limK) / DEG) : rig.fov;
    tgt.roll = 0;
  }

  /** The classic chase pose (game.js updateCamera), so handing over to it is seamless. */
  function computeChase() {
    const P = ctx.player, yaw = P.yaw, pitch = P.pitch || 0;
    if (P.head) P.head.getWorldPosition(_head); else _head.copy(W.player.pos).setY(W.player.pos.y + 30);
    _back.set(-Math.sin(yaw), (28 - pitch * 25) / 51, -Math.cos(yaw)).normalize();
    const d = ctx.camClearDist(_head, _back, 51);
    tgt.pos.copy(_head).addScaledVector(_back, d);
    tgt.look.copy(_head); tgt.look.y += pitch * 27;
    tgt.fov = CHASE_FOV; tgt.roll = 0;
  }

  // ------------------------------------------------------------------ shots
  function startShot(name, who, blendDur, max) {
    mode = SHOT;
    shot.name = name; shot.sub = ''; shot.t = 0; shot.subT = 0; shot.max = max; shot.fresh = true; shot.beats = false;
    shot.count = 0; shot.endT = -1; shot.azOff = 0; shot.elOff = 0;
    shot.who = who; shot.other = who ? who.opponent : null;
    if (who) { shot.subj.copy(who.pos); if (who.opponent) shot.subj2.copy(who.opponent.pos); }
    beginBlend(blendDur);
  }
  function setSub(sub, blendDur) {
    shot.sub = sub; shot.subT = 0; shot.fresh = true; shot.azOff = 0; shot.elOff = 0;
    beginBlend(blendDur);
  }
  /** Leave the shot for the fight cam (or the chase cam when the lock is off). */
  function endShot(blendDur) {
    if (mode !== SHOT) return;
    shot.name = ''; shot.who = null; shot.other = null;
    mode = wantFight() ? FIGHT : FREE;
    rig.snap = true;
    beginBlend(blendDur);
  }
  function wantFight() {
    const p = W.player, r = W.rival;
    if (!lockWanted || !p || !r) return false;
    return p.distTo(r) < (mode === FIGHT ? LOCK_RANGE : LOCK_RANGE_IN) || track.on;
  }
  /** At the start of a sub-shot: nudge the orbit (shot.azOff / elOff) to a boom that is not through or inside a tower. */
  function clearOrbit(cx, cy, cz, az, el, dist) {
    refreshNear(cx, cz, dist + 60, 9);
    shot.azOff = 0; shot.elOff = 0;
    if (_near.length === 0) return;
    const dist0 = dist;
    for (let j = 0; j < CAND_EL.length; j++) {
      for (let i = 0; i < CAND_AZ.length; i++) {
        const a = az + CAND_AZ[i], e = el + CAND_EL[j], ce = Math.cos(e);
        if (cy + Math.sin(e) * dist < ringA_top + 6) dist = Math.min(dist0, ringRun(cx, cz, a) / Math.max(0.2, ce)); else dist = dist0;
        const x = cx + Math.sin(a) * ce * dist, y = Math.max(MIN_Y, cy + Math.sin(e) * dist), z = cz + Math.cos(a) * ce * dist;
        if (inBuilding(x, y, z, 3) || segBlocked(cx, cy, cz, x, y, z)) continue;
        shot.azOff = CAND_AZ[i]; shot.elOff = CAND_EL[j];
        return;
      }
    }
    shot.elOff = 1.0; // boxed in: go over the top
  }
  /** Orbit shot around c with the lens at height camY (low angles), kept clear of towers. */
  function lowOrbit(cx, cy, cz, az, camY, dist, fov) {
    const el = Math.asin(clamp((camY - cy) / dist, -0.95, 0.95));
    if (shot.fresh) { clearOrbit(cx, cy, cz, az, el, dist); shot.fresh = false; }
    // a low lens stays inside the ropes with its subject (the lens widens to keep the framing)
    const e2 = el + shot.elOff, run = ringRun(cx, cz, az + shot.azOff) / Math.max(0.2, Math.cos(e2));
    if (run < dist && cy + Math.sin(e2) * dist < ringA_top + 6) {
      fov = Math.min(RING_FOV, 2 * Math.atan(Math.tan(fov * 0.5 * DEG) * Math.min(1.5, dist / run)) / DEG);
      dist = run;
    }
    orbit(cx, cy, cz, az + shot.azOff, e2, dist);
    tgt.fov = fov; tgt.roll = 0;
  }
  function follow(v, f, rate, dt) {
    const k = 1 - Math.exp(-rate * dt), p = f.pos;
    v.x += (p.x - v.x) * k; v.y += (Math.max(-6, p.y) - v.y) * k; v.z += (p.z - v.z) * k;
  }

  function shotEntrance(dt) {
    const f = shot.who, h = f.yaw, s = shot.side, sub = shot.sub, t = shot.subT, S = shot.subj;
    follow(S, f, 6, dt);
    // no beats from the match director: run a default card
    if (!shot.beats && (sub === 'rise' || sub === 'walk') && t > 3.6) return setSub('namecard', 0);
    if (sub === 'rise') {
      // low over the water, three-quarter front, creeping in as it surfaces
      lowOrbit(S.x, 17, S.z, h + 0.5 * s, MIN_Y, lerp(48, 37, ease(t / 3)), 58);
      tgt.look.y = lerp(9, 22, ease(t / 2.4));
    } else if (sub === 'walk') {
      if (f.isPlayer) {
        // behind the shoulder, low: the skyline and the ring lights ahead of it
        lowOrbit(S.x, 19, S.z, h + Math.PI - 0.5 * s, 8, 52, 60);
        tgt.look.set(S.x + Math.sin(h) * 34, 21, S.z + Math.cos(h) * 34);
      } else {
        // long lens from where it is headed (the ring): a locked-off camera it walks down on
        if (shot.fresh) {
          shot.fresh = false;
          let run = 150;
          if (ringA) run = clamp(Math.hypot(ringA.cx - S.x, ringA.cz - S.z) + 8, 60, 170);
          shot.anchor.set(S.x + Math.sin(h) * run + Math.cos(h) * 7 * s, ringA ? ringA_top + 4 : 5, S.z + Math.cos(h) * run - Math.sin(h) * 7 * s); // over the top rope
          refreshNear(shot.anchor.x, shot.anchor.z, 70, 9);
          pushOut(shot.anchor, 3);
        }
        const d = Math.hypot(shot.anchor.x - S.x, shot.anchor.z - S.z);
        tgt.pos.copy(shot.anchor);
        tgt.look.set(S.x, lerp(19, 15, smooth(40, 120, d)), S.z);
        tgt.fov = clamp(2 * Math.atan(25 / Math.max(20, d)) / DEG, 24, 66); tgt.roll = 0;
      }
    } else if (sub === 'crash') {
      // locked-off low side angle on the building it comes through, then back to the long lens
      if (shot.fresh) {
        lowOrbit(shot.pt.x, 14, shot.pt.z, h + (Math.PI / 2) * s + 0.4, 4.5, 62, 60);
        shot.anchor.copy(tgt.pos);
      }
      tgt.pos.copy(shot.anchor);
      tgt.look.set(lerp(shot.pt.x, S.x, 0.7), 17, lerp(shot.pt.z, S.z, 0.7));
      tgt.fov = 60; tgt.roll = 0;
      if (t > 1.15) setSub('walk', 0);
    } else if (sub === 'pose') {
      // low hero close-up
      lowOrbit(S.x, 24, S.z, h + 0.32 * s, 4, lerp(40, 34, ease(t / 2.5)), 56);
    } else if (sub === 'namecard') {
      // three-quarter front, long-ish lens, the kaiju on its third of the frame (player left, rival right), slow drift
      // (the HUD's card is lower-left for the player, lower-right for the rival: the kaiju takes the other side)
      const dist = 42;
      lowOrbit(S.x, 19, S.z, h + (0.62 + 0.045 * t) * s, 4.5, dist, 52);
      offCentre(-0.3 * s, dist);
    } else { // 'arrive': both in the ring, wide and low
      const o = shot.other, mx = (S.x + o.pos.x) * 0.5, mz = (S.z + o.pos.z) * 0.5, sep = f.distTo(o);
      if (shot.fresh) shot.az0 = camAzAround(mx, mz);
      lowOrbit(mx, 15, mz, shot.az0 + 0.04 * t, 7, sep * 0.5 + 66, 52);
    }
  }

  function shotPin(dt) {
    // low and close on the cover, bodies in the lower half: the sky above them is the HUD's for the count
    const v = shot.other, S = shot.subj;
    follow(S, v, 8, dt);
    const dist = 46 - 2.5 * shot.count - 1.2 * Math.min(1, shot.t);
    lowOrbit(S.x, 6, S.z, shot.az0 + 0.035 * shot.t * shot.side, 4.2, dist, 52);
    tgt.look.y = 14.5;
    if (shot.endT >= 0 && shot.t > shot.endT) endShot(0.9);
  }

  function shotKo(dt) {
    // push in on the body going down
    const S = shot.subj, k = ease(shot.t / 1.1);
    follow(S, shot.who, 7, dt);
    lowOrbit(S.x, lerp(15, 9, k), S.z, shot.az0 + 0.1 * k * shot.side, 5, lerp(shot.d0, 46, k), lerp(shot.f0, 46, k));
  }

  function shotResult(dt) {
    // hero orbit: low, looking up at the winner, the loser's body in the foreground when it is close
    const w = shot.who, l = shot.other, S = shot.subj, sep = w.distTo(l), k = ease(shot.t / 1.6);
    follow(S, w, 5, dt);
    const dist = sep < 75 ? Math.max(54, sep + 34) : 54;
    lowOrbit(S.x, 19, S.z, shot.az0 + 0.13 * shot.t * shot.side, lerp(7, 4.5, k), lerp(dist + 14, dist, k), lerp(56, 50, k));
  }

  function shotBetween(dt) {
    if (shot.sub === 'pose') {
      // the fall's winner plays to the crowd
      shotResult(dt);
      if (shot.t >= shot.d0) { const A = W.arena && W.arena.info; shot.az0 = camAzAround(A ? A.cx : W.player.pos.x, A ? A.cz : W.player.pos.z); setSub('crane', 1.6); }
      return;
    }
    // crane over the ring while the corner advice is up
    const A = W.arena && W.arena.info, p = W.player.pos, r = W.rival.pos, t = shot.subT;
    const cx = A ? A.cx : (p.x + r.x) * 0.5, cz = A ? A.cz : (p.z + r.z) * 0.5;
    if (shot.fresh) { shot.fresh = false; refreshNear(cx, cz, 220, 9); }
    orbit(cx, 10, cz, shot.az0 + 0.07 * t, lerp(0.3, 0.5, ease(t / 4)), lerp(118, 142, ease(t / 4)));
    tgt.fov = 50; tgt.roll = 0;
  }

  // The combat core's finisher: grab (0 s) - lift (0.5) - rise (1.1: both rocket up 58-88 u) - apex (2.0, hang) -
  // drop (2.35) - impact (2.8) - end (3.7), sim seconds, with slow-mo at the start, the apex and the impact.
  function shotFinisher(dt) {
    const a = shot.who, v = shot.other, sub = shot.sub, t = shot.subT, s = shot.side;
    const st = FIN_STYLE[a.key] || FIN_STYLE.godzilla;
    const S = shot.subj, T = shot.subj2;
    follow(S, a, 14, dt); follow(T, v, 14, dt);
    const mx = (S.x + T.x) * 0.5, mz = (S.z + T.z) * 0.5, my = (Math.max(0, S.y) + Math.max(0, T.y)) * 0.5 + 16;
    if (sub === 'windup') {
      // hero: low three-quarter front of the attacker, wide lens, creeping in
      lowOrbit(S.x, 21, S.z, a.yaw + st.heroAz * s, 4, lerp(46, 36, ease(t / 1.0)), st.heroFov);
      tgt.look.set(lerp(S.x, mx, 0.35), 20, lerp(S.z, mz, 0.35));
      tgt.roll = st.roll * ease(t / 1.0);
    } else if (sub === 'lift' || sub === 'rise' || (sub === 'apex' && st.apex === 'low')) {
      // from the ground, under them: the lens stays down and tilts up as they go
      const k = sub === 'lift' ? 0 : ease((sub === 'rise' ? t : 9) / 0.8);
      lowOrbit(shot.pt.x, 16, shot.pt.z, shot.az0, MIN_Y, lerp(44, 58, k), lerp(64, 48, k)); // tighten as they shrink into the sky
      tgt.look.set(mx, my, mz);
      tgt.roll = st.roll * (sub === 'apex' ? 1 + t : k);
    } else if (sub === 'apex') {
      if (st.apex === 'high') {
        // from above them: the city they are about to fall on
        orbit(mx, my, mz, shot.az0 + 0.5 * s + 0.25 * t, 0.95, 74);
        tgt.fov = 58; tgt.roll = 0;
      } else {
        // long lens, level with them, dead side-on: the silhouette against the sky
        orbit(mx, my, mz, shot.az0, 0.02, 104);
        tgt.fov = 32; tgt.roll = 0;
      }
    } else if (sub === 'drop') {
      // on the ground beside where they will land, watching them come down
      lowOrbit(shot.pt.x, 12, shot.pt.z, shot.az0 + 0.25 * s, MIN_Y + 0.6, 56, 64);
      tgt.look.set(T.x, Math.max(10, T.y + 4), T.z);
    } else { // 'impact': crane up and out over the shockwave
      const k = ease(t / 1.1), P = shot.pt;
      if (shot.fresh) { shot.fresh = false; refreshNear(P.x, P.z, 200, 9); }
      orbit(P.x, lerp(9, 12, k), P.z, shot.az1 + 0.05 * t * s, lerp(0.05, 0.5, k), lerp(58, Math.max(84, shot.radius + 30), k));
      tgt.fov = lerp(62, 64, k); tgt.roll = 0;
      if (shot.endT >= 0 && shot.t > shot.endT) endShot(1.0);
    }
  }

  function updateShot(dt) {
    shot.t += dt; shot.subT += dt;
    const f = shot.who;
    if ((f && f !== W.player && f !== W.rival) || (shot.max > 0 && shot.t > shot.max)) return endShot(0.8); // stale or overdue: never hold the frame hostage
    switch (shot.name) {
      case 'entrance': shotEntrance(dt); break;
      case 'pin': shotPin(dt); break;
      case 'ko': shotKo(dt); break;
      case 'win': case 'lose': shotResult(dt); break;
      case 'between': shotBetween(dt); break;
      case 'finisher': shotFinisher(dt); break;
      default: endShot(0.5);
    }
    if (mode !== SHOT) computeNow(dt); // the shot ended this frame: a pose from whatever took over
    else refreshNear(tgt.pos.x, tgt.pos.z, 70, dt);
  }
  function computeNow(dt) {
    if (mode === FIGHT) computeFight(dt);
    else if (mode === FREE) computeChase();
  }

  // ------------------------------------------------------------------ the override
  function drive(camera, dtRaw) {
    const p = W.player, r = W.rival;
    if (!active || !p || !r) return false;
    aspect = camera.aspect || aspect;
    const dt = idle && !(mode === SHOT && SHOT_IDLE[shot.name]) ? 0 : dtRaw;
    time += dt;
    tickImpulses(dt);
    track.t += dt;
    if (track.on && track.landed) { track.hold -= dt; if (track.hold <= 0) track.on = false; }
    if (track.on && track.t > 9) track.on = false;
    track.w += ((track.on ? 1 : 0) - track.w) * (1 - Math.exp(-dt * (track.on ? 9 : 1.6)));

    if (mode === FREE && blend.t >= 1) {
      // the chase cam's frame; remember where it is so a blend can start from it
      out.pos.copy(camera.position);
      camera.getWorldDirection(_f);
      out.look.copy(camera.position).addScaledVector(_f, 50);
      out.fov = camera.fov; out.roll = 0; out.valid = true;
      return false;
    }
    if (mode === SHOT) updateShot(dt); else computeNow(dt);
    if (mode === FREE && blend.t >= 1) return false;

    // blend from the previous mode / shot
    if (blend.t < 1) {
      blend.t = blend.dur > 0 ? Math.min(1, blend.t + dt / blend.dur) : 1;
      const k = ease(blend.t);
      out.pos.lerpVectors(blend.pos, tgt.pos, k); out.look.lerpVectors(blend.look, tgt.look, k);
      out.fov = lerp(blend.fov, tgt.fov, k); out.roll = lerp(blend.roll, tgt.roll, k);
    } else { out.pos.copy(tgt.pos); out.look.copy(tgt.look); out.fov = tgt.fov; out.roll = tgt.roll; }
    if (mode !== FREE) { pushOut(out.pos, 2.5); if (out.pos.y < MIN_Y) out.pos.y = MIN_Y; }
    out.valid = true;

    // impulses on top
    _f.subVectors(out.look, out.pos).normalize();
    _r.crossVectors(_f, UP).normalize();
    _u.crossVectors(_r, _f);
    const amp = fx.trauma * fx.trauma + 0.05 * fx.freezeK;
    wsLP.lerp(ctx.shakeOffset(_v), dt > 0 ? 0.45 : 0);
    _v.copy(kick).addScaledVector(wsLP, 0.8);
    _v.addScaledVector(_r, noise(time, 1) * 1.3 * amp).addScaledVector(_u, noise(time, 2) * 1.7 * amp);
    camera.position.copy(out.pos).add(_v);
    _v2.copy(out.look).addScaledVector(_v, 0.35);
    camera.up.set(0, 1, 0);
    camera.lookAt(_v2);
    const roll = out.roll + fx.rollK + noise(time, 3) * 0.024 * amp;
    if (roll !== 0) camera.rotateZ(roll);
    const fov = clamp(out.fov + fx.fovK - 5 * fx.pushK - 2.2 * fx.freezeK - 3 * fx.slowK, 24, 88);
    if (Math.abs(camera.fov - fov) > 0.005) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return true;
  }

  // ------------------------------------------------------------------ events
  function listen() {
    const on = (name, fn) => offs.push(W.bus.on(name, fn));
    const strike = (e, scale) => {
      const w = clamp(e.impact, 0, 1) * scale;
      dirBetween(e.who, e.target, _v);
      hit(0.16 + 0.5 * w, _v.x, w * -0.25 * (Math.hypot(_v.x, _v.z) || 1), _v.z, 18 + 62 * w, 20 + 90 * w);
    };
    on(EV.STRIKE_LANDED, (e) => strike(e, e.counter ? 1.25 : 1));
    on(EV.STRIKE_BLOCKED, (e) => strike(e, 0.4));
    on(EV.STRIKE_REVERSED, (e) => { hit(0.22, 0, 0, 0, 0, -50); push(0.55, 0.9, e.x, e.y, e.z); });
    on(EV.POWER_HIT, (e) => { dirBetween(e.who, e.target, _v); const w = clamp(e.impact, 0, 1) * (e.blocked ? 0.5 : 1); hit(0.2 + 0.5 * w, _v.x, 0, _v.z, 30 + 60 * w, 40 + 80 * w); });
    on(EV.BLOCK_BROKEN, (e) => { const f = W[e.who]; if (f) push(0.4, 0.5, f.pos.x, f.pos.y + 18, f.pos.z); hit(0.3, 0, 0, 0, 0, 40); });
    on(EV.STUN, (e) => { const f = W[e.who]; if (f) push(0.5, 0.45, f.pos.x, f.pos.y + 20, f.pos.z); });
    on(EV.GRAB_START, (e) => { hit(0.18, 0, -1, 0, 16, -30); push(0.45, 0.4, e.x, e.y || 16, e.z); });
    on(EV.GRAB_REVERSED, (e) => { const f = W[e.who]; if (f) push(0.5, 0.8, f.pos.x, f.pos.y + 18, f.pos.z); hit(0.2, 0, 0, 0, 0, -40); });
    on(EV.SWING_SPIN, () => hit(0.08, 0, 0, 0, 0, 14));
    on(EV.THROW_LAUNCH, (e) => {
      track.id = e.target; track.on = true; track.landed = false; track.hold = 0; track.t = 0;
      track.dirX = e.dirX; track.dirZ = e.dirZ; track.speed = e.speed;
      hit(0.15, e.dirX, 0, e.dirZ, 30, 50);
    });
    on(EV.BUILDING_IMPACT, (e) => hit(0.4 + Math.min(0.35, e.h / 130), track.dirX, -0.3, track.dirZ, 55, 70));
    on(EV.THROW_LAND, (e) => {
      const w = clamp(e.impact, 0, 1);
      if (track.on && track.id === e.target) { track.landed = true; track.hold = 1.1; track.speed = 0; }
      hit(0.35 + 0.5 * w, 0, -1, 0, 40 + 60 * w, 50 + 90 * w);
    });
    on(EV.KNOCKDOWN, (e) => { const w = clamp(e.impact, 0, 1); hit(0.2 + 0.35 * w, 0, -1, 0, 26 + 40 * w, 30 + 50 * w); });
    on(EV.ROPE_REBOUND, (e) => { hit(0.18, 0, 0, 0, 0, 30); if (track.on && track.id === e.who) { track.dirX = -track.dirX; track.dirZ = -track.dirZ; track.speed = e.speed; } });
    on(EV.ROPE_SNAP, () => hit(0.4, 0, 0, 0, 0, 50));
    on(EV.POST_IMPACT, (e) => hit(0.3 + 0.4 * clamp(e.impact, 0, 1), track.dirX, -0.3, track.dirZ, 50, 60));
    on(EV.WATER_IMPACT, (e) => hit(0.15 * e.size, 0, -1, 0, 14 * e.size, 0));
    on(EV.TAUNT_START, (e) => { const f = W[e.who]; if (f) push(Math.max(0.8, e.dur * 0.9), 1, f.pos.x, f.pos.y + 20, f.pos.z); });
    on(EV.TAUNT_INTERRUPTED, () => { fx.pushT = 0; });
    on(EV.BELL, () => hit(0.06, 0, 0, 0, 0, 26));
    on(EV.TIME_HITSTOP, (e) => { fx.freezeT = Math.max(fx.freezeT, e.dur); });
    on(EV.TIME_SLOWMO, (e) => { fx.slowT = e.dur; fx.slowAmt = clamp(1 - e.scale, 0, 1); });
    on(EV.FIGHTER_STATE, (e) => {
      // a new exchange while the last throw is still being admired: let go
      if (track.on && track.landed && (e.state === 'grappling' || e.state === 'pinning')) track.on = false;
      // a whip ends in a stagger / stun / clothesline, with no throw:land
      if (track.on && !track.landed && e.who === track.id && e.prev === 'airborne' && e.state !== 'airborne') { track.landed = true; track.hold = 0.5; track.speed = 0; }
    });

    // ---- cinematics ----
    on(EV.ENTRANCE_START, (e) => {
      const f = W[e.who];
      if (!f) return;
      startShot('entrance', f, 0, 20);
      shot.side = f.isPlayer ? 1 : -1;
      shot.sub = f.isPlayer ? 'rise' : 'walk';
    });
    on(EV.ENTRANCE_BEAT, (e) => {
      if (mode !== SHOT || shot.name !== 'entrance' || shot.who !== W[e.who]) return;
      const sub = BEAT_SUB[e.who] && BEAT_SUB[e.who][e.beat];
      shot.beats = true;
      if (e.beat === 'crash') { shot.pt.set(e.x, e.y, e.z); hit(0.7, 0, -1, 0, 50, 60); }
      if (sub && sub !== shot.sub) setSub(sub, 0);
    });
    on(EV.ENTRANCE_END, (e) => { if (mode === SHOT && shot.name === 'entrance' && shot.who === W[e.who]) shot.max = shot.t + 2.5; });
    on(EV.ENTRANCE_SKIP, () => { if (mode === SHOT && shot.name === 'entrance') endShot(0.5); });
    on(EV.MATCH_PHASE, (e) => {
      if (e.phase === 'fight' && mode === SHOT && (shot.name === 'entrance' || shot.name === 'between')) endShot(1.1);
    });
    on(EV.FALL_START, () => { if (mode === SHOT && (shot.name === 'between' || shot.name === 'ko' || shot.name === 'pin')) endShot(1.0); });

    on(EV.PIN_START, (e) => {
      const a = W[e.who];
      if (!a || !a.opponent) return;
      const v = a.opponent;
      // stay on the side the camera is on; settle square to the cover
      startShot('pin', a, 0.5, 14);
      shot.subj.copy(v.pos);
      shot.az0 = camAzAround(v.pos.x, v.pos.z);
      shot.side = rig.side;
    });
    on(EV.PIN_COUNT, (e) => {
      if (mode === SHOT && shot.name === 'pin') shot.count = e.count;
      hit(0.2 + 0.1 * e.count, 0, -1, 0, 18 + 9 * e.count, 30 + 14 * e.count);
    });
    on(EV.PIN_KICKOUT, (e) => {
      const f = W[e.who];
      hit(e.near ? 0.5 : 0.3, 0, 1, 0, 40, 70);
      if (mode === SHOT && shot.name === 'pin') endShot(0.4);
      if (e.near && f) push(0.7, 1, f.pos.x, f.pos.y + 14, f.pos.z);
    });
    on(EV.PIN_BROKEN, () => { if (mode === SHOT && shot.name === 'pin') endShot(0.45); });
    on(EV.PIN_FALL, () => { hit(0.45, 0, -1, 0, 30, 80); if (mode === SHOT && shot.name === 'pin') { shot.endT = shot.t + 1.6; shot.max = shot.t + 4; } });

    on(EV.FINISHER_START, (e) => {
      const a = W[e.who];
      if (!a || !a.opponent) return;
      const v = a.opponent;
      startShot('finisher', a, 0.4, 16);
      shot.sub = 'windup';
      // the side the fight cam was on, square to the pair; everything on the ground pivots on the attacker's spot
      const axis = Math.atan2(v.pos.x - a.pos.x, v.pos.z - a.pos.z);
      const cur = camAzAround((a.pos.x + v.pos.x) * 0.5, (a.pos.z + v.pos.z) * 0.5);
      shot.side = Math.abs(wrap(axis + Math.PI / 2 - cur)) <= Math.abs(wrap(axis - Math.PI / 2 - cur)) ? 1 : -1;
      shot.az0 = axis + (Math.PI / 2) * shot.side;
      shot.pt.copy(a.pos).setY(0);
    });
    on(EV.FINISHER_BEAT, (e) => {
      if (mode !== SHOT || shot.name !== 'finisher') return;
      const b = e.beat;
      if (b === shot.sub || (b !== 'lift' && b !== 'rise' && b !== 'apex' && b !== 'drop')) return;
      const st = FIN_STYLE[shot.who.key] || FIN_STYLE.godzilla;
      if (b === 'lift' || b === 'rise' || (b === 'apex' && st.apex === 'low')) {
        // one continuous ground shot: keep whatever clearance the first of them found
        const keep = shot.sub === 'lift' || shot.sub === 'rise', ao = shot.azOff, eo = shot.elOff;
        setSub(b, keep ? 0 : 0.45);
        if (keep) { shot.fresh = false; shot.azOff = ao; shot.elOff = eo; }
      } else setSub(b, 0);
    });
    on(EV.FINISHER_IMPACT, (e) => {
      hit(1, 0, -1, 0, 120, 190);
      if (mode !== SHOT || shot.name !== 'finisher') return;
      shot.pt.set(e.x, e.y, e.z); shot.radius = e.radius || 60;
      // crane out between the corner towers (they stand on the diagonals), on the nearest square side
      shot.az1 = camAzAround(e.x, e.z);
      if (ringA && inRing(e.x, e.z, -10)) shot.az1 = Math.round(shot.az1 / (Math.PI / 2)) * (Math.PI / 2) + 0.12 * shot.side;
      setSub('impact', 0.35);
      shot.max = shot.t + 6;
    });
    on(EV.FINISHER_END, () => { if (mode === SHOT && shot.name === 'finisher') { if (shot.sub !== 'impact') endShot(0.8); else shot.endT = shot.t + 0.7; } });

    on(EV.KO, (e) => {
      const f = W[e.who];
      if (!f) return;
      hit(0.5, 0, -1, 0, 40, -60);
      if (mode === SHOT && (shot.name === 'finisher' || shot.name === 'pin')) return;
      const d0 = out.valid ? Math.hypot(out.pos.x - f.pos.x, out.pos.z - f.pos.z) : 70;
      startShot('ko', f, 0.45, 2.6);
      // square to the pair on the side the lens is on, so the one left standing is beside the body, not in front of it
      const o = f.opponent, cur = camAzAround(f.pos.x, f.pos.z);
      shot.az0 = cur;
      if (o && f.distTo(o) > 6 && f.distTo(o) < 70) {
        const ax = Math.atan2(f.pos.x - o.pos.x, f.pos.z - o.pos.z) + 0.5;
        shot.az0 = Math.abs(wrap(ax + Math.PI / 2 - cur)) <= Math.abs(wrap(ax - Math.PI / 2 - cur)) ? ax + Math.PI / 2 : ax - Math.PI / 2;
      }
      shot.d0 = clamp(d0, 50, 110); shot.f0 = out.valid ? out.fov : 56;
      shot.side = rig.side;
    });
    on(EV.CAM_CUE, (e) => {
      if (e.shot === 'win' || e.shot === 'lose') {
        const w = W[e.who] || (e.shot === 'win' ? W.player : W.rival);
        const wasKo = mode === SHOT && shot.name === 'ko';
        startShot(e.shot, w, wasKo ? 1.6 : 1.1, 0);
        const l = w.opponent, sep = w.distTo(l);
        // open from beyond the fallen body, looking up over it at the winner
        shot.az0 = sep < 75 && sep > 4 ? Math.atan2(l.pos.x - w.pos.x, l.pos.z - w.pos.z) + 0.3 * rig.side : camAzAround(w.pos.x, w.pos.z);
        shot.side = rig.side;
      } else if (e.shot === 'between') { if (!(mode === SHOT && shot.name === 'between')) startBetween(W[e.who], e.dur); }
      else if (e.shot === 'bell') { if (mode === SHOT && shot.name === 'entrance') endShot(1.3); } // the fight framing is the two-shot for the bell
      else if (e.shot === 'ko') { /* started off the ko event itself */ }
      else if (e.shot === '' && mode === SHOT) endShot(0.9);
    });
  }
  function startBetween(winner, dur) {
    const A = W.arena && W.arena.info;
    startShot('between', winner || null, 1.2, 0);
    shot.sub = winner && dur > 0 ? 'pose' : 'crane';
    shot.d0 = dur || 0;
    if (winner) { shot.az0 = camAzAround(winner.pos.x, winner.pos.z); shot.side = rig.side; }
    else shot.az0 = camAzAround(A ? A.cx : W.player.pos.x, A ? A.cz : W.player.pos.z);
  }

  // ------------------------------------------------------------------ module
  const cam = {
    /** The fight framing is steering the player (lock-on). */
    locked: false,
    /** 'fight' | 'free' | 'shot', and the running shot's name ('' when none). */
    get mode() { return mode === FIGHT ? 'fight' : mode === SHOT ? 'shot' : 'free'; },
    get shot() { return mode === SHOT ? shot.name : ''; },
    /** QA: a snapshot of the rig. */
    info() {
      return { mode: cam.mode, shot: cam.shot, sub: shot.sub, az: rig.az, el: rig.el, dist: rig.dist, fov: ctx.camera.fov, side: rig.side,
        sel: [rig.selI, rig.selJ], near: _near.length, track: track.w, trauma: fx.trauma, blend: blend.t };
    },
    setLock(on) {
      if (on === lockWanted) return;
      lockWanted = on;
      const e = W.bus.ev(EV.LOCKON);
      e.on = on;
      W.bus.emit(EV.LOCKON);
      ctx.ui.toastMini(on ? 'LOCK-ON' : 'FREE CAMERA', '');
    },
    start() {
      lockWanted = true; idle = false; active = true; time = 0;
      mode = FREE; cam.locked = false;
      out.valid = false; blend.t = 1; rig.snap = true; rig.userAz = 0; rig.closeK = 0; rig.swingK = 0; rig.selI = 0; rig.selJ = 0; rig.nearT = 9;
      track.on = false; track.w = 0; track.id = '';
      kick.set(0, 0, 0); kickV.set(0, 0, 0); wsLP.set(0, 0, 0);
      for (const k in fx) fx[k] = 0;
      shot.name = ''; shot.who = null; shot.other = null;
      basisValid = false;
      _near.length = 0;
      ringA = (W.arena && W.arena.info) || null;
      if (ringA && ringA.ropeY) ringA_top = ringA.ropeY[ringA.ropeY.length - 1];
      _solids.length = 0;
      if (ringA) {
        for (const st of ringA.stands || []) _solids.push({ x: (st.x0 + st.x1) / 2, z: (st.z0 + st.z1) / 2, w: Math.abs(st.x1 - st.x0), d: Math.abs(st.z1 - st.z0), h: st.h + 3, destroyed: false });
        for (const P of ringA.posts || []) _solids.push({ x: P.x, z: P.z, w: 7, d: 7, h: ringA.towerH || 55, get destroyed() { return P.up === false; } });
        // video walls (raised slabs) and the gateway's pylons + truss
        for (const sc of ringA.screens || []) _solids.push({ x: sc.x, z: sc.z, w: sc.nx ? 3 : sc.w, d: sc.nx ? sc.w : 3, y0: sc.y - sc.h / 2, h: sc.y + sc.h / 2, destroyed: false });
        const G = ringA.gate;
        if (G) {
          const hw = G.halfWidth + 5;
          _solids.push({ x: G.x, z: G.z - hw, w: 7, d: 7, h: G.top, destroyed: false }, { x: G.x, z: G.z + hw, w: 7, d: 7, h: G.top, destroyed: false },
            { x: G.x, z: G.z, w: 6, d: hw * 2, y0: G.clearance, h: G.top, destroyed: false });
        }
      }
      // phones: touch controls sit in the lower corners, so frame a little looser there
      // (HUD: top 13 % is bars; touch: joystick / buttons cover the lower corners, so sit the pair above centre)
      _fill.x = touch ? 0.64 : 0.8; _fill.top = touch ? 0.72 : 0.7; _fill.bot = touch ? 0.56 : 0.84;
      listen();
      ctx.setCameraOverride(drive);
    },
    update(dt, dtReal) {
      idle = false;
      if (W.input.ui.lockToggle) cam.setLock(!lockWanted);
      const c = ctx.player.control, p = W.player, r = W.rival;
      if (mode !== SHOT) {
        const want = wantFight() && p.alive && r.alive;
        if (want && mode === FREE) { mode = FIGHT; rig.snap = true; beginBlend(0.8); }
        else if (!want && mode === FIGHT) { mode = FREE; beginBlend(0.7); }
      }
      cam.locked = mode === FIGHT;
      if (mode === FREE) { c.faceYaw = null; c.moveYaw = null; c.look = true; basisValid = false; return; }
      // movement is relative to the camera: follow its yaw, but only as fast as a hand can adapt while the stick is held
      const camera = ctx.camera, inp = ctx.input;
      camera.getWorldDirection(_f);
      const camYaw = Math.atan2(_f.x, _f.z), held = Math.abs(inp.moveX) + Math.abs(inp.moveZ) > 0.15;
      if (!basisValid || !out.valid) { basis = out.valid ? camYaw : p.yaw; basisValid = true; } else {
        const d = wrap(camYaw - basis), lim = held ? 2.6 * dtReal : Math.PI;
        basis = wrap(basis + clamp(d, -lim, lim));
      }
      c.moveYaw = basis;
      c.look = mode === FIGHT; // pitch tilts the fight boom; cinematics ignore the mouse
      // lock-on: face the rival; a sprint turns the body to run where it is going
      const vel = ctx.player.vel;
      if (mode !== FIGHT || !r.alive) c.faceYaw = null;
      else if (inp.sprint && held && vel && vel.x * vel.x + vel.z * vel.z > 4) { c.faceYaw = Math.atan2(vel.x, vel.z); c.faceRate = 7; }
      else { c.faceYaw = p.yawTo(r); c.faceRate = 10; }
    },
    updateIdle(dtReal) { idle = true; },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      active = false; cam.locked = false; mode = FREE; ringA = null;
      shot.name = ''; shot.who = null; shot.other = null;
      track.on = false; track.w = 0;
      _near.length = 0; _solids.length = 0;
      ctx.setCameraOverride(null);
      const camera = ctx.camera;
      camera.up.set(0, 1, 0);
      if (camera.fov !== CHASE_FOV) { camera.fov = CHASE_FOV; camera.updateProjectionMatrix(); }
      const c = ctx.player.control;
      c.faceYaw = null; c.faceRate = 10; c.moveYaw = null; c.look = true;
    },
  };
  return cam;
}
