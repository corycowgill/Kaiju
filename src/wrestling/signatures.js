// Signature grapples: two per kaiju, out of the lock-up with RUN held
// (Shift / LB / the touch RUN toggle) + toward (sig 1) or away (sig 2).
//   Gorrak  TYRANT CHOKESLAM (one hand round the throat, up, and down through the mat)
//           LOOP BULLDOZER   (onto the shoulder, a charge through whatever is behind, powerslam)
//   Tridon  STORM HURRICANRANA (leaps onto the shoulders, backflips, flings it over)
//           SKYFALL DDT      (headlock, flies up with it, dives and spikes it head first)
//   Mechra  CIRCUIT BREAKER  (backbreaker over the knee: works the back)
//           SYSTEM CRASH     (piledriver: works the back, and the crowd hates it)
// grapple.js owns the hold (phase 'sig' while one runs) and hands this module
// its internals (K below). Every timeline is written as anchor points like
// grapple.js's own, in seconds; animDefs.js reads SIGNATURES[key][i].T so the
// thrower's clip ('sig_a' / 'sig_b', 2 s, stretched to `dur`) hits the same beats.
// OWNER: rival (with combat's grapple.js).
import { EV } from './events.js';

/** Per kaiju: [sig 1 (RUN + toward), sig 2 (RUN + away)]. T = the beats (s), dur = the thrower's anim (s). */
export const SIGNATURES = Object.freeze({
  godzilla: Object.freeze([
    Object.freeze({ id: 'chokeslam', name: 'TYRANT CHOKESLAM', dur: 2.0, cost: 18, dmg: 27, T: Object.freeze({ grip: 0.3, lift: 0.85, hang: 1.15, drop: 1.42 }) }),
    Object.freeze({ id: 'bulldozer', name: 'LOOP BULLDOZER', dur: 2.25, cost: 22, dmg: 16, T: Object.freeze({ scoop: 0.45, run: 1.45, drop: 1.73 }) }),
  ]),
  ghidorah: Object.freeze([
    Object.freeze({ id: 'rana', name: 'STORM HURRICANRANA', dur: 1.7, cost: 16, dmg: 24, T: Object.freeze({ crouch: 0.28, leap: 0.62, flip: 1.18 }) }),
    Object.freeze({ id: 'ddt', name: 'SKYFALL DDT', dur: 2.1, cost: 20, dmg: 28, T: Object.freeze({ lock: 0.3, rise: 1.0, apex: 1.15, spike: 1.45, topple: 1.7 }) }),
  ]),
  mecha: Object.freeze([
    Object.freeze({ id: 'breaker', name: 'CIRCUIT BREAKER', dur: 1.7, cost: 16, dmg: 24, T: Object.freeze({ scoop: 0.45, knee: 0.72, roll: 1.15 }) }),
    Object.freeze({ id: 'piledriver', name: 'SYSTEM CRASH', dur: 2.0, cost: 20, dmg: 28, T: Object.freeze({ invert: 0.5, hold: 0.85, jump: 1.0, spike: 1.12, topple: 1.45 }) }),
  ]),
});
/** Back damage a kaiju can carry (Mechra works it): each point takes fight out of its kick-outs (grapple.js pinStrength). */
export const WORK_MAX = 3;

const HALF_PI = Math.PI / 2, PI = Math.PI, TAU = Math.PI * 2;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const _opt = { fade: 0.12, timeScale: 1, duration: undefined, commit: undefined };
const _sw = { t: 2, b: null };
function _swVisit(b, t) { if (t < _sw.t && !b.destroyed) { _sw.t = t; _sw.b = b; } }
const _pt = { x: 0, y: 0, z: 0 };

/**
 * K: grapple.js internals { hold, stand, endHold, impact, releaseThrower, smash, flightOf, emit2, carryH, groundY }.
 * @returns {{ begin(slot) -> bool, update(dt), reset(), def(fighter, slot) }}
 */
export function createSignatures(ctx, W, K) {
  const bus = W.bus, hold = K.hold;
  // The move in progress: base position / facing captured at the start (the roots move with the move)
  const s = { def: null, slot: 0, x: 0, z: 0, yaw: 0, aim: 0, d0: 0, beat: 0, count: 0, speed: 0, crowdT: 0, ended: false };

  const defOf = (f, slot) => { const L = SIGNATURES[f.key]; return L ? L[slot - 1] || null : null; };
  function anim(f, name, dur, fade = 0.12) {
    _opt.fade = fade; _opt.timeScale = 1; _opt.duration = dur; _opt.commit = dur;
    return W.anims.play(f, name, _opt);
  }
  function launchEv(type, x, y, z, dx, dz, speed) {
    const e = K.emit2(EV.THROW_LAUNCH, hold.A, hold.V);
    e.type = type; e.x = x; e.y = y; e.z = z; e.dirX = dx; e.dirZ = dz; e.speed = speed;
    bus.emit(EV.THROW_LAUNCH);
  }
  // A blow mid-move that does not end it (the knee, the spike): damage, freeze, a burst of dust where it landed
  function jolt(V, A, dmg, hs, x, y, z, impact) {
    V.applyDamage(dmg * A.dmgMult, 'slam', A.id, x, y, z, false);
    W.hitStop(hs);
    ctx.shake(0.9 + impact, 0.3);
    _pt.x = x; _pt.y = 0; _pt.z = z;
    if (ctx.fx && ctx.fx.dustBurst) ctx.fx.dustBurst(_pt, 12 + 8 * impact, 8);
    const e = bus.ev(EV.STRIKE_LANDED);
    e.who = A.id; e.target = V.id; e.kind = 'heavy'; e.combo = 1; e.damage = 0; e.impact = impact; e.high = true; e.x = x; e.y = y; e.z = z;
    bus.emit(EV.STRIKE_LANDED);
  }
  function work(V) { V.worked = Math.min(WORK_MAX, (V.worked || 0) + 1); }
  // Put it down on its back where it lies now, and let the thrower go
  function finish(type, base, size, rec) {
    const A = hold.A, V = hold.V;
    K.endHold();
    s.def = null;
    K.impact(V, A, type, base, size, true);
    K.releaseThrower(A, rec);
  }

  /** Start signature `slot` (1 | 2) of the holder out of the lock-up. False: it has none, or it is too tired for it. */
  function begin(slot) {
    const A = hold.A, V = hold.V, def = defOf(A, slot);
    if (!def || A.tired || A.stamina < def.cost * 0.5) return false;
    s.def = def; s.slot = slot; s.beat = 0; s.count = 0; s.speed = 0; s.crowdT = 0; s.ended = false;
    s.x = A.pos.x; s.z = A.pos.z; s.yaw = hold.yaw; s.d0 = hold.d0;
    hold.phase = 'sig'; hold.type = 'signature'; hold.t = 0;
    A.spend(def.cost);
    A.gainMomentum(4);
    const e = K.emit2(EV.GRAB_MOVE, A, V);
    e.type = 'signature'; e.dur = def.T[Object.keys(def.T)[0]]; e.name = def.name; e.sig = slot;
    bus.emit(EV.GRAB_MOVE);
    anim(A, slot === 1 ? 'sig_a' : 'sig_b', def.dur, 0.1);
    _opt.fade = 0.2; _opt.duration = undefined; _opt.commit = undefined;
    W.anims.play(V, def.id === 'bulldozer' ? 'carried' : 'sig_victim', _opt);
    if (def.id === 'bulldozer') {
      // Turn toward the stick (it is "away": back the way it came), or keep going the way it faces
      const it = A.intent;
      if (Math.hypot(it.moveX, it.moveZ) > 0.3) s.aim = Math.atan2(it.moveX, it.moveZ);
      else s.aim = hold.yaw + PI;
    }
    return true;
  }

  // ------------------------------------------------------------------ the six timelines
  // Each is (A, V, t, dt): t seconds since begin(); it calls finish() when the body is down.
  function chokeslam(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI;
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.08 * u);
      V.setPose(s.x + fx * (s.d0 - 4 * u), V.hc + gy, s.z + fz * (s.d0 - 4 * u), vy, -0.12 * u, 0);
      return;
    }
    if (t < T.hang) {
      // Up by the throat, held at arm's length over the city
      const u = smooth((t - T.grip) / (T.lift - T.grip)), bob = t > T.lift ? Math.sin((t - T.lift) * 18) * 0.4 : 0;
      if (s.beat < 1 && t >= T.lift) { s.beat = 1; W.slowMo(0.55, 0.3); }
      K.stand(A, s.x, s.z, s.yaw, 0.08 - 0.2 * u);
      V.setPose(s.x + fx * (s.d0 - 4), V.hc + gy + 21 * u + bob, s.z + fz * (s.d0 - 4), vy, -0.12 - 0.1 * u, 0.05 * Math.sin(t * 9));
      return;
    }
    if (s.beat < 2) { s.beat = 2; launchEv('slam', V.pos.x, V.hc + 21, V.pos.z, fx, fz, 21 / (T.drop - T.hang)); }
    const u = clamp01((t - T.hang) / (T.drop - T.hang)), e = u * u;
    K.stand(A, s.x, s.z, s.yaw, -0.12 + 0.6 * e);
    V.setPose(s.x + fx * lerp(s.d0 - 4, s.d0 + 5, e), lerp(V.hc + gy + 21, V.lieY, e), s.z + fz * lerp(s.d0 - 4, s.d0 + 5, e), vy, lerp(-0.22, -HALF_PI, e), 0);
    if (u >= 1) finish('slam', s.def.dmg, 0.82, 0.6);
  }

  function bulldozer(A, V, t, dt) {
    const T = s.def.T, H = A.height * 0.85 + 1; // (across the shoulder, not overhead)
    // Turning toward the aim (the AI / the stick may still steer it during the scoop)
    const it = A.intent;
    if (t < T.run && Math.hypot(it.moveX, it.moveZ) > 0.3) s.aim = Math.atan2(it.moveX, it.moveZ);
    const turn = t < T.scoop ? 7 : 2.2, d = angDiff(s.aim, s.yaw), step = turn * dt;
    s.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    let fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const gy = K.groundY(A);
    if (t < T.scoop) {
      // Onto the right shoulder, lying across it
      const u = smooth(t / T.scoop);
      K.stand(A, s.x, s.z, s.yaw, 0.25 * Math.sin(PI * u));
      V.setPose(s.x + fx * lerp(s.d0, 4, u), lerp(V.hc, H, u) + gy, s.z + fz * lerp(s.d0, 4, u), hold.yaw + PI - HALF_PI * u, 0, HALF_PI * u);
      return;
    }
    if (t < T.run) {
      if (s.beat < 1) { s.beat = 1; s.speed = 40; launchEv('slam', V.pos.x, H, V.pos.z, fx, fz, 70); }
      s.speed = Math.min(90, s.speed + 140 * dt);
      const x0 = s.x, z0 = s.z;
      s.x += fx * s.speed * dt; s.z += fz * s.speed * dt;
      _pt.x = s.x; _pt.z = s.z;
      ctx.clampToBounds(_pt);
      const walled = _pt.x !== s.x || _pt.z !== s.z;
      s.x = _pt.x; s.z = _pt.z;
      // The carried body leads: whatever is in front of it comes down on it
      if (s.count < 3) {
        _sw.t = 2; _sw.b = null;
        ctx.sweepBuildings(x0 + fx * 6, z0 + fz * 6, s.x + fx * 10, s.z + fz * 10, V.collideRadius, _swVisit);
        if (_sw.b) {
          const f = K.flightOf(V);
          if (s.count === 0) { f.count = 0; f.mom = 0; f.impact = 0; }
          f.V = V; f.by = A; f.type = 'slam'; f.x = s.x + fx * 8; f.y = H; f.z = s.z + fz * 8;
          K.smash(f, _sw.b, 90, true);
          if (!_sw.b.fest && !_sw.b.isFence && _sw.b.h >= 5) { s.count++; s.speed *= 0.82; }
        }
      }
      s.crowdT -= dt;
      if (s.crowdT <= 0 && ctx.world && ctx.world.crowdHit) { s.crowdT = 0.12; ctx.world.crowdHit(s.x, s.z, 14 * 14); }
      K.stand(A, s.x, s.z, s.yaw, 0.22);
      V.setPose(s.x + fx * 4, H + gy + Math.sin(t * 22) * 0.6, s.z + fz * 4, s.yaw + HALF_PI, 0, HALF_PI);
      if (walled) s.ended = true;
      if (!s.ended) return;
      hold.t = T.run; t = T.run; // (into the slam now)
    }
    if (s.beat < 2) { s.beat = 2; launchEv('slam', V.pos.x, H, V.pos.z, fx, fz, H / (T.drop - T.run)); }
    const u = clamp01((t - T.run) / (T.drop - T.run)), e = u * u, out = A.radius + 8;
    fx = Math.sin(s.yaw); fz = Math.cos(s.yaw);
    K.stand(A, s.x, s.z, s.yaw, 0.22 + 0.35 * e);
    V.setPose(s.x + fx * lerp(4, out, e), lerp(H + gy, V.lieY, e), s.z + fz * lerp(3, out, e), s.yaw + HALF_PI + HALF_PI * e, -HALF_PI * e, HALF_PI * (1 - e));
    if (u >= 1) {
      hold.yaw = s.yaw;
      finish('slam', s.def.dmg + 5 * s.count, Math.min(1, 0.75 + 0.08 * s.count), 0.55);
    }
  }

  function rana(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, R = s.d0;
    if (t < T.crouch) {
      const u = smooth(t / T.crouch);
      K.stand(A, s.x, s.z, s.yaw, 0.22 * u);
      V.setPose(s.x + fx * R, V.hc + gy, s.z + fz * R, vy, 0, 0);
      return;
    }
    if (t < T.leap) {
      // Up onto its shoulders, legs round its head, leaning back
      const u = smooth((t - T.crouch) / (T.leap - T.crouch));
      const c = lerp(A.hc * Math.sin(0.22), R - 6, u); // (from where the crouch has its centre)
      A.setPose(s.x + fx * c, A.hc * lerp(Math.cos(0.22), 1, u) + gy + 18 * Math.sin(u * HALF_PI) + 4 * Math.sin(u * PI), s.z + fz * c, s.yaw, lerp(0.22, -0.4, u), 0);
      V.setPose(s.x + fx * R, V.hc + gy, s.z + fz * R, vy, -0.15 * u, 0);
      return;
    }
    if (s.beat < 1) {
      s.beat = 1;
      launchEv('suplex', V.pos.x, V.hc, V.pos.z, -fx, -fz, PI * R / (T.flip - T.leap));
      W.slowMo(0.6, 0.25);
    }
    // The backflip: Tridon turns over backwards and lands where it started; the foe goes over the top, head first
    const u = clamp01((t - T.leap) / (T.flip - T.leap)), e = Math.pow(u, 1.3), th = e * PI;
    A.setPose(s.x + fx * (R - 6) * (1 - smooth(u)), A.hc + gy + 18 * (1 - smooth(u)) + 10 * Math.sin(PI * u), s.z + fz * (R - 6) * (1 - smooth(u)), s.yaw, lerp(-0.4, -TAU, smooth(u)), 0);
    V.setPose(s.x + fx * R * Math.cos(th), lerp(V.hc, V.lieY, e) + Math.sin(th) * 26 + gy, s.z + fz * R * Math.cos(th), vy, e * 1.5 * PI, 0);
    if (u >= 1) {
      K.stand(A, s.x, s.z, s.yaw, 0.15);
      V.setPose(s.x - fx * R, V.lieY, s.z - fz * R, vy, -HALF_PI, 0);
      A.gainMomentum(3); // the crowd loves it
      finish('suplex', s.def.dmg, 0.7, 0.42);
    }
  }

  function ddt(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, top = 38;
    const dl = s.d0 - 5;
    if (t < T.lock) {
      // Front facelock: its head tucked under Tridon's arm
      const u = smooth(t / T.lock);
      K.stand(A, s.x, s.z, s.yaw, 0.1 * u);
      V.setPose(s.x + fx * lerp(s.d0, dl, u), V.hc + gy - 2 * u, s.z + fz * lerp(s.d0, dl, u), vy, 0.65 * u, 0);
      return;
    }
    if (t < T.apex) {
      // Wings: up they go
      const u = clamp01((t - T.lock) / (T.rise - T.lock)), e = 1 - (1 - u) * (1 - u), y = top * e + (t > T.rise ? Math.sin((t - T.rise) * 14) * 0.8 : 0);
      if (s.beat < 1 && t >= T.rise) { s.beat = 1; W.slowMo(0.5, 0.3); }
      A.root.position.set(s.x, gy + y, s.z);
      A.root.rotation.set(-0.12 * e, s.yaw, 0);
      V.setPose(s.x + fx * (dl - 1.5 * e), gy + y + V.hc - 3 - 3 * e, s.z + fz * (dl - 1.5 * e), vy, 0.65 + 0.3 * e, 0.06 * Math.sin(t * 7));
      return;
    }
    if (s.beat < 2) { s.beat = 2; launchEv('slam', V.pos.x, top, V.pos.z, fx, fz, top / (T.spike - T.apex)); }
    if (t < T.spike) {
      // The dive: both turn over, its head first
      const u = clamp01((t - T.apex) / (T.spike - T.apex)), e = u * u, y = top * (1 - e);
      A.setPose(s.x + fx * 2 * e, gy + y + A.hc, s.z + fz * 2 * e, s.yaw, lerp(-0.12, 1.15, e), 0);
      V.setPose(s.x + fx * lerp(dl - 1.5, dl + 2, e), gy + lerp(top + V.hc - 6, V.hc + 3, e), s.z + fz * lerp(dl - 1.5, dl + 2, e), vy, lerp(0.95, PI, e), 0);
      return;
    }
    if (s.beat < 3) {
      s.beat = 3;
      jolt(V, A, s.def.dmg * 0.6, 0.16, V.pos.x, 2, V.pos.z, 0.85);
      ctx.shake(1.8, 0.4);
    }
    // Tridon sits out; the foe stands on its head for a beat, then folds over onto its back
    const u = clamp01((t - T.spike) / (T.topple - T.spike)), e = u * u;
    A.setPose(s.x + fx * 2, gy + A.hc, s.z + fz * 2, s.yaw, lerp(1.15, 0, smooth(u * 1.6)), 0); // (the clip sits it out on the mat)
    V.setPose(s.x + fx * lerp(dl + 2, dl + 6, e), gy + lerp(V.hc + 3, V.lieY, e), s.z + fz * lerp(dl + 2, dl + 6, e), vy, lerp(PI, 1.5 * PI, e), 0);
    if (u >= 1) {
      K.stand(A, s.x + fx * 2, s.z + fz * 2, s.yaw, 0);
      V.setPose(s.x + fx * (dl + 6), V.lieY, s.z + fz * (dl + 6), vy, -HALF_PI, 0);
      finish('slam', s.def.dmg * 0.4, 0.6, 0.35);
    }
  }

  function breaker(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), lx = Math.cos(s.yaw), lz = -Math.sin(s.yaw);
    const across = s.yaw + HALF_PI, top = 26;
    if (t < T.scoop) {
      // Scooped up and turned over: across Mechra's front, belly to the sky
      const u = smooth(t / T.scoop);
      K.stand(A, s.x, s.z, s.yaw, 0.15 * Math.sin(PI * u));
      V.setPose(s.x + fx * lerp(s.d0, 6, u), gy + lerp(V.hc, top, u), s.z + fz * lerp(s.d0, 6, u), lerp(s.yaw + PI, across, u), -HALF_PI * u, 0);
      return;
    }
    if (t < T.knee) {
      // Down on one knee, the spine driven across it
      const u = clamp01((t - T.scoop) / (T.knee - T.scoop)), e = u * u;
      K.stand(A, s.x, s.z, s.yaw, 0.08 * e); // (the clip drops to one knee)
      V.setPose(s.x + fx * 6 + lx * 2 * e, gy + lerp(top, 13, e), s.z + fz * 6 + lz * 2 * e, across, -HALF_PI, 0);
      return;
    }
    if (s.beat < 1) {
      s.beat = 1;
      jolt(V, A, s.def.dmg * 0.65, 0.18, V.pos.x + fx * 4, 13, V.pos.z + fz * 4, 0.8);
      work(V);
    }
    // It bends over the knee, then is shoved off onto the mat
    const u = clamp01((t - T.knee) / (T.roll - T.knee)), e = smooth(u);
    K.stand(A, s.x, s.z, s.yaw, 0.08 * (1 - e));
    V.setPose(s.x + fx * lerp(6, 14, e) + lx * 2, gy + lerp(13, V.lieY, e) + Math.sin(u * PI) * 3, s.z + fz * lerp(6, 14, e) + lz * 2, across, -HALF_PI, 0.25 * Math.sin(u * PI));
    if (u >= 1) {
      K.stand(A, s.x, s.z, s.yaw, 0);
      finish('slam', s.def.dmg * 0.35, 0.55, 0.45);
    }
  }

  function piledriver(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, dd = 7;
    if (t < T.invert) {
      // Upside down in front of it, head between its knees
      const u = smooth(t / T.invert);
      K.stand(A, s.x, s.z, s.yaw, 0.3 * Math.sin(PI * u));
      V.setPose(s.x + fx * lerp(s.d0, dd, u), gy + V.hc + 12 * Math.sin(PI * u) + 10.5 * u, s.z + fz * lerp(s.d0, dd, u), vy, PI * u, 0);
      return;
    }
    if (t < T.jump) {
      // The hold: the crowd knows what is coming
      if (s.beat < 1) {
        s.beat = 1;
        const e = bus.ev(EV.CROWD_POP);
        e.kind = 'boo'; e.impact = 0.9; e.x = s.x; e.z = s.z;
        bus.emit(EV.CROWD_POP);
      }
      K.stand(A, s.x, s.z, s.yaw, -0.08);
      V.setPose(s.x + fx * dd, gy + V.hc + 10.5 + Math.sin(t * 30) * 0.25, s.z + fz * dd, vy, PI, 0.04 * Math.sin(t * 11));
      return;
    }
    if (t < T.spike) {
      // A hop, and it sits down on it
      const u = clamp01((t - T.jump) / (T.spike - T.jump));
      const hop = 7 * Math.sin(PI * u);
      A.root.position.set(s.x, gy + hop, s.z);
      A.root.rotation.set(-0.1 * u, s.yaw, 0);
      V.setPose(s.x + fx * dd, gy + V.hc + 10.5 + hop - 7.5 * u * u, s.z + fz * dd, vy, PI, 0);
      return;
    }
    if (s.beat < 2) {
      s.beat = 2;
      jolt(V, A, s.def.dmg * 0.7, 0.22, V.pos.x, 2, V.pos.z, 1);
      ctx.shake(2, 0.45);
      work(V);
    }
    // It keels over; Mechra rises off the seat
    const u = clamp01((t - T.spike) / (T.topple - T.spike)), e = u * u;
    K.stand(A, s.x, s.z, s.yaw, -0.1 * (1 - smooth(u))); // (the clip sits it down on the mat, and up again)
    V.setPose(s.x + fx * lerp(dd, dd + 9, e), gy + lerp(V.hc + 3, V.lieY, e), s.z + fz * lerp(dd, dd + 9, e), vy, lerp(PI, 1.5 * PI, e), 0);
    if (u >= 1) {
      K.stand(A, s.x, s.z, s.yaw, 0);
      V.setPose(s.x + fx * (dd + 9), V.lieY, s.z + fz * (dd + 9), vy, -HALF_PI, 0);
      finish('slam', s.def.dmg * 0.3, 0.6, 0.5);
    }
  }

  const RUN = { chokeslam, bulldozer, rana, ddt, breaker, piledriver };

  return {
    begin,
    /** One frame of the signature in progress (grapple.js, hold.phase === 'sig'). */
    update(dt) {
      if (!s.def) return;
      RUN[s.def.id](hold.A, hold.V, hold.t, dt);
    },
    /** A fall is over: no move in progress, backs are fresh. */
    reset() {
      s.def = null;
      if (W.player) W.player.worked = 0;
      if (W.rival) W.rival.worked = 0;
    },
    /** The fighter's signature in slot 1 / 2, or null. */
    def: defOf,
  };
}
