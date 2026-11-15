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

// The six later kaiju borrow a thrower pose from animDefs.js (`pose`: an original's move id, or the generic
// 'vault' / 'wheel' lift) and its hand grips (`grip`: whose 'sig_a.<key>' entry in anims.js), and say which
// element their effects are made of (`elem`, wrestling/vfx.js). T keeps the beat names that pose reads.
function sig(id, name, dur, cost, dmg, T, pose, grip, elem) {
  return Object.freeze({ id, name, dur, cost, dmg, T: Object.freeze(T), pose, grip, elem, lift: pose === 'vault' || pose === 'wheel' ? 1 : 0 });
}

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
  cindervault: Object.freeze([
    sig('chokebomb', 'CALDERA CHOKEBOMB', 2.0, 19, 28, { grip: .38, lift: .92, hang: 1.24, drop: 1.5 }, 'chokeslam', 'godzilla', 'magma'),
    sig('backdrop', 'BASALT BACKDROP', 2.05, 21, 27, { grip: .44, peak: .98, hit: 1.5 }, 'wheel', 'mecha', 'magma'),
  ]),
  brineveil: Object.freeze([
    sig('powerbomb', 'PRESSURE BOMB', 1.85, 17, 24, { grip: .5, peak: .95, hit: 1.34 }, 'vault', 'godzilla', 'tide'),
    sig('riptide', 'RIPTIDE SUPLEX', 1.95, 19, 26, { grip: .3, peak: .95, hit: 1.47 }, 'wheel', 'mecha', 'tide'),
  ]),
  rimehorn: Object.freeze([
    sig('frostdrop', 'PERMAFROST DROP', 2.12, 21, 29, { grip: .43, peak: .95, freeze: 1.27, hit: 1.6 }, 'vault', 'godzilla', 'frost'),
    sig('horntoss', 'TUNDRA TOSS', 2.02, 20, 27, { scoop: .42, run: 1.08, drop: 1.55 }, 'bulldozer', 'godzilla', 'frost'),
  ]),
  vesperax: Object.freeze([
    sig('scissors', 'SCYTHE SCISSORS', 1.72, 16, 23, { crouch: .24, leap: .55, flip: 1.0, topple: 1.3 }, 'rana', 'ghidorah', 'prism'),
    sig('prismdriver', 'PRISM DRIVER', 1.83, 19, 26, { invert: .42, hold: .6, jump: .68, spike: 1.12, topple: 1.45 }, 'piledriver', 'mecha', 'prism'),
  ]),
  thornwake: Object.freeze([
    sig('rootlock', 'ROOTLOCK SLAM', 2.1, 19, 28, { grip: .5, peak: 1.05, hit: 1.5 }, 'vault', 'godzilla', 'root'),
    sig('timber', 'TIMBER SUPLEX', 2.22, 21, 29, { grip: .5, peak: 1.0, hit: 1.5, up: 2.0 }, 'wheel', 'mecha', 'root'),
  ]),
  ferrumaw: Object.freeze([
    sig('coil', 'COIL SUPLEX', 1.92, 18, 25, { grip: .35, peak: .7, hit: 1.4 }, 'wheel', 'mecha', 'metal'),
    sig('clamp', 'IRON CLAMP', 2.05, 22, 29, { grip: .37, p1: .55, p2: .75, p3: .95, peak: 1.1, hit: 1.5 }, 'vault', 'mecha', 'metal'),
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
  const s = { def: null, slot: 0, x: 0, z: 0, yaw: 0, aim: 0, d0: 0, beat: 0, count: 0, speed: 0, crowdT: 0, tossT: 0, ended: false };

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
    if (s.def.elem && ctx.world && ctx.world.spawnKaijuPower) ctx.world.spawnKaijuPower(A.cfg, 'impact', V.pos, { extent: 18 + 22 * size });
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
    if (def.id === 'horntoss') s.aim = hold.yaw; // (straight on through the foe; the stick steers it, horntoss())
    if (def.id === 'bulldozer') {
      // Turn toward the stick (it is "away": back the way it came), or keep going the way it faces
      const it = A.intent;
      if (Math.hypot(it.moveX, it.moveZ) > 0.3) s.aim = Math.atan2(it.moveX, it.moveZ);
      else s.aim = hold.yaw + PI;
    }
    return true;
  }

  // ------------------------------------------------------------------ throw timelines
  // Each is (A, V, t, dt): t seconds since begin(); it calls finish() when the body is down.
  // How high a lift raises the body's centre over its own standing height: onto the lifter's raised
  // hands (anims.carryY, per rig), not a fixed height that floats a smaller lifter's foe over its palms
  function liftTop(A, V, fallback) {
    const y = W.anims && W.anims.carryY ? W.anims.carryY(A, V) : NaN;
    return Number.isFinite(y) ? Math.max(10, y - V.hc) : fallback;
  }
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

  // ------------------------------------------------------------------ the six later kaiju
  // V placed `along` the move's facing from its base (and `side` to A's left), centre height y.
  function vAt(V, along, y, yaw, pitch, roll, side = 0) {
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    V.setPose(s.x + fx * along - fz * side, y, s.z + fz * along + fx * side, yaw, pitch, roll);
  }
  // ...the same, kept inside the venue (moves that carry it a long way)
  function vAtIn(V, along, y, yaw, pitch, roll) {
    _pt.x = s.x + Math.sin(s.yaw) * along; _pt.z = s.z + Math.cos(s.yaw) * along;
    ctx.clampToBounds(_pt);
    V.setPose(_pt.x, y, _pt.z, yaw, pitch, roll);
  }

  // Cindervault, CALDERA CHOKEBOMB: by the throat, up, shaken like a rag; it jumps with it and lands on top
  function chokebomb(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, top = liftTop(A, V, 25);
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.12 * u);
      vAt(V, s.d0 - 4 * u, V.hc + gy, vy, -0.12 * u, 0.06 * u * Math.sin(t * 30));
      return;
    }
    if (t < T.hang) {
      const u = smooth((t - T.grip) / (T.lift - T.grip)), sh = t > T.lift ? 1 : 0;
      if (s.beat < 1 && t >= T.lift) { s.beat = 1; W.slowMo(0.55, 0.3); ctx.shake(0.5, 0.25); }
      K.stand(A, s.x, s.z, s.yaw, 0.12 - 0.26 * u);
      vAt(V, s.d0 - 4 + sh * Math.sin(t * 26) * 0.8, V.hc + gy + top * u + sh * Math.sin(t * 31) * 1.1, vy, -0.12 - 0.12 * u, sh * 0.16 * Math.sin(t * 23));
      return;
    }
    if (s.beat < 2) { s.beat = 2; launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, top / (T.drop - T.hang)); }
    const u = clamp01((t - T.hang) / (T.drop - T.hang)), e = u * u, hop = 7 * Math.sin(PI * Math.min(1, u * 1.15));
    A.root.position.set(s.x + fx * 2 * e, gy + hop, s.z + fz * 2 * e);
    A.root.rotation.set(-0.14 + 0.75 * e, s.yaw, 0);
    vAt(V, lerp(s.d0 - 4, s.d0 + 6, e), lerp(V.hc + gy + top, V.lieY, e), vy, lerp(-0.24, -HALF_PI, e), 0);
    if (u >= 1) {
      K.stand(A, s.x + fx * 2, s.z + fz * 2, s.yaw, 0.6);
      finish('slam', s.def.dmg, 0.92, 0.62);
    }
  }

  // Cindervault, BASALT BACKDROP: ducks under its chest, stands up straight under it, and lets it fall down its back
  function backdrop(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, top = 30, dn = s.d0 - 6, hang = T.peak + 0.14;
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.38 * u);
      vAt(V, lerp(s.d0, dn, u), V.hc + gy + 3 * u, vy, 0.3 * u, 0);
      return;
    }
    if (t < hang) {
      const u = smooth((t - T.grip) / (T.peak - T.grip));
      if (s.beat < 1 && t >= T.peak) { s.beat = 1; W.slowMo(0.6, 0.25); }
      K.stand(A, s.x, s.z, s.yaw, lerp(0.38, -0.3, u));
      vAt(V, lerp(dn, -1, u), V.hc + gy + 3 + (top - 3) * u, vy, lerp(0.3, PI * 0.75, u), 0);
      return;
    }
    if (s.beat < 2) { s.beat = 2; launchEv('suplex', V.pos.x, V.pos.y, V.pos.z, -fx, -fz, top / (T.hit - hang)); }
    const u = clamp01((t - hang) / (T.hit - hang)), e = u * u;
    K.stand(A, s.x, s.z, s.yaw, -0.3 - 0.25 * e);
    vAt(V, lerp(-1, -(s.d0 + 3), e), lerp(V.hc + gy + top, V.lieY, e), vy, lerp(PI * 0.75, 1.5 * PI, e), 0);
    if (u >= 1) {
      vAt(V, -(s.d0 + 3), V.lieY, vy, -HALF_PI, 0);
      finish('suplex', s.def.dmg, 0.84, 0.5);
    }
  }

  // Brineveil, PRESSURE BOMB: it sinks out of sight under the foe, bursts up with it on its shoulders, and sits it down
  function powerbomb(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI;
    if (t < T.grip) {
      const u = smooth(t / T.grip), sink = 9 * Math.sin(HALF_PI * u);
      A.root.position.set(s.x + fx * 3 * u, gy - sink, s.z + fz * 3 * u);
      A.root.rotation.set(0.5 * u, s.yaw, 0);
      vAt(V, s.d0, V.hc + gy - 1.5 * u, vy, 0.12 * u, 0.08 * u * Math.sin(t * 12));
      return;
    }
    const H = K.carryH(A, V) - 2;
    if (t < T.peak) {
      const u = smooth((t - T.grip) / (T.peak - T.grip)), surge = 5 * Math.sin(PI * u);
      A.root.position.set(s.x + fx * 3 * (1 - u), gy - 9 * (1 - u) + surge, s.z + fz * 3 * (1 - u));
      A.root.rotation.set(0.5 * (1 - u) - 0.15 * u, s.yaw, 0);
      vAt(V, lerp(s.d0, 3, u), lerp(V.hc + gy - 1.5, H + gy, u) + surge, vy, lerp(0.12, -0.45, u), 0);
      return;
    }
    if (s.beat < 1) { s.beat = 1; W.slowMo(0.6, 0.22); launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, H / (T.hit - T.peak)); }
    const u = clamp01((t - T.peak) / (T.hit - T.peak)), e = u * u;
    A.root.position.set(s.x, gy - 4 * e, s.z);
    A.root.rotation.set(-0.15 - 0.2 * e, s.yaw, 0);
    vAt(V, lerp(3, s.d0 + 3, e), lerp(H + gy, V.lieY, e), vy, lerp(-0.45, -HALF_PI, e), 0);
    if (u >= 1) {
      K.stand(A, s.x, s.z, s.yaw, -0.2);
      vAt(V, s.d0 + 3, V.lieY, vy, -HALF_PI, 0);
      finish('slam', s.def.dmg, 0.9, 0.55);
    }
  }

  // Brineveil, RIPTIDE SUPLEX: a whirlpool turn with the foe flung out at the waist, then over the top behind it
  function riptide(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, R = s.d0 - 3;
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.1 * u);
      vAt(V, lerp(s.d0, R, u), V.hc + gy, vy, 0, 0);
      return;
    }
    if (t < T.peak) {
      const u = smooth((t - T.grip) / (T.peak - T.grip)), yaw = s.yaw + TAU * u;
      K.stand(A, s.x, s.z, yaw, 0.1 - 0.22 * u);
      V.setPose(s.x + Math.sin(yaw) * R, V.hc + gy + 9 * Math.sin(HALF_PI * u), s.z + Math.cos(yaw) * R, yaw + PI, -0.2 * u, 0.55 * Math.sin(PI * u));
      return;
    }
    if (s.beat < 1) { s.beat = 1; launchEv('suplex', V.pos.x, V.pos.y, V.pos.z, -fx, -fz, PI * R / (T.hit - T.peak)); W.slowMo(0.65, 0.22); }
    const u = clamp01((t - T.peak) / (T.hit - T.peak)), e = Math.pow(u, 1.3), th = e * PI;
    K.stand(A, s.x, s.z, s.yaw, -0.12 - 0.35 * e);
    V.setPose(s.x + fx * R * Math.cos(th), lerp(V.hc + 9, V.lieY, e) + Math.sin(th) * 22 + gy, s.z + fz * R * Math.cos(th), vy, lerp(-0.2, 1.5 * PI, e), 0);
    if (u >= 1) {
      vAt(V, -R, V.lieY, vy, -HALF_PI, 0);
      finish('suplex', s.def.dmg, 0.76, 0.45);
    }
  }

  // Rimehorn, PERMAFROST DROP: pressed overhead and held there, frozen stiff, then it falls on it like a glacier calving
  function frostdrop(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, H = K.carryH(A, V);
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.15 * u);
      vAt(V, lerp(s.d0, s.d0 - 3, u), V.hc + gy, vy, 0, 0);
      return;
    }
    if (t < T.freeze) {
      const u = smooth((t - T.grip) / (T.peak - T.grip));
      if (s.beat < 1 && t >= T.peak) { s.beat = 1; W.slowMo(0.5, 0.4); }
      K.stand(A, s.x, s.z, s.yaw, 0.15 - 0.25 * u);
      vAt(V, lerp(s.d0 - 3, 2, u), lerp(V.hc, H, u) + gy, lerp(vy, s.yaw + HALF_PI, u), 0, HALF_PI * u);
      return;
    }
    if (s.beat < 2) { s.beat = 2; launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, H / (T.hit - T.freeze)); }
    const u = clamp01((t - T.freeze) / (T.hit - T.freeze)), e = u * u, out = s.d0 + 5;
    A.root.position.set(s.x + fx * 3 * e, gy - 2 * e, s.z + fz * 3 * e);
    A.root.rotation.set(-0.1 + 1.0 * e, s.yaw, 0);
    vAt(V, lerp(2, out, e), lerp(H + gy, V.lieY, e), s.yaw + HALF_PI + HALF_PI * e, -HALF_PI * e, HALF_PI * (1 - e));
    if (u >= 1) {
      K.stand(A, s.x + fx * 3, s.z + fz * 3, s.yaw, 0.7);
      vAt(V, out, V.lieY, vy, -HALF_PI, 0);
      finish('slam', s.def.dmg, 0.95, 0.7);
    }
  }

  // Rimehorn, TUNDRA TOSS: scooped onto the horns, a charge through whatever is in the way, and tossed over the top
  function horntoss(A, V, t, dt) {
    const T = s.def.T, H = A.height * 0.62 + 1, gy = K.groundY(A), it = A.intent;
    // Steered by the stick once it is running, but never turned round onto its own heels (RUN + away started it)
    if (t > T.scoop && t < T.run && it && Math.hypot(it.moveX, it.moveZ) > 0.3) {
      const a = Math.atan2(it.moveX, it.moveZ);
      if (Math.abs(angDiff(a, hold.yaw)) < 1.6) s.aim = a;
    }
    const d = angDiff(s.aim, s.yaw), step = (t < T.scoop ? 6 : 1.8) * dt;
    s.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    if (t < T.scoop) {
      const u = smooth(t / T.scoop);
      K.stand(A, s.x, s.z, s.yaw, 0.45 * u);
      vAt(V, lerp(s.d0, 5, u), lerp(V.hc, H, u) + gy, s.yaw + PI, lerp(0, 0.9, u), 0);
      return;
    }
    if (t < T.run && !s.ended) {
      s.speed = Math.min(75, Math.max(30, s.speed + 160 * dt));
      const x0 = s.x, z0 = s.z;
      s.x += fx * s.speed * dt; s.z += fz * s.speed * dt;
      _pt.x = s.x; _pt.z = s.z;
      ctx.clampToBounds(_pt);
      if (_pt.x !== s.x || _pt.z !== s.z) s.ended = true;
      s.x = _pt.x; s.z = _pt.z;
      if (s.count < 1 && ctx.sweepBuildings) {
        _sw.t = 2; _sw.b = null;
        ctx.sweepBuildings(x0 + fx * 5, z0 + fz * 5, s.x + fx * 9, s.z + fz * 9, V.collideRadius, _swVisit);
        if (_sw.b) {
          const f = K.flightOf(V);
          f.count = 0; f.mom = 0; f.impact = 0;
          f.V = V; f.by = A; f.type = 'slam'; f.x = s.x + fx * 7; f.y = H; f.z = s.z + fz * 7;
          K.smash(f, _sw.b, 85, true);
          if (!_sw.b.fest && !_sw.b.isFence && _sw.b.h >= 5) { s.count++; s.ended = true; }
        }
      }
      s.crowdT -= dt;
      if (s.crowdT <= 0 && ctx.world && ctx.world.crowdHit) { s.crowdT = 0.12; ctx.world.crowdHit(s.x, s.z, 14 * 14); }
      K.stand(A, s.x, s.z, s.yaw, 0.45);
      V.setPose(s.x + fx * 5, H + gy + Math.sin(t * 20) * 0.8, s.z + fz * 5, s.yaw + PI, 0.9, 0);
      if (!s.ended) return;
    }
    if (s.beat < 1) { s.beat = 1; s.tossT = t; launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, 50); W.slowMo(0.6, 0.25); }
    const u = clamp01((t - s.tossT) / (T.drop - T.run)), e = u * u;
    K.stand(A, s.x, s.z, s.yaw, lerp(0.45, -0.35, smooth(u * 1.6)));
    vAtIn(V, lerp(5, 30, smooth(u)), lerp(H + gy, V.lieY, e) + Math.sin(PI * u) * 24, s.yaw + PI, lerp(0.9, -HALF_PI, smooth(u)), 0);
    if (u >= 1) {
      hold.yaw = s.yaw;
      vAtIn(V, 30, V.lieY, s.yaw + PI, -HALF_PI, 0);
      finish('slam', s.def.dmg + 4 * s.count, Math.min(1, 0.82 + 0.08 * s.count), 0.5);
    }
  }

  // Vesperax, SCYTHE SCISSORS: onto the shoulders, legs scissored round the head, a corkscrew backflip that spikes it head first
  function scissors(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, R = s.d0;
    if (t < T.crouch) {
      const u = smooth(t / T.crouch);
      K.stand(A, s.x, s.z, s.yaw, 0.25 * u);
      vAt(V, R, V.hc + gy, vy, 0, 0);
      return;
    }
    if (t < T.leap) {
      const u = smooth((t - T.crouch) / (T.leap - T.crouch)), c = lerp(A.hc * Math.sin(0.25), R - 6, u);
      A.setPose(s.x + fx * c, A.hc * lerp(Math.cos(0.25), 1, u) + gy + 20 * Math.sin(u * HALF_PI) + 4 * Math.sin(u * PI), s.z + fz * c, s.yaw, lerp(0.25, -0.4, u), 0);
      vAt(V, R, V.hc + gy, vy, -0.15 * u, 0.1 * u * Math.sin(t * 25));
      return;
    }
    if (t < T.flip) {
      if (s.beat < 1) { s.beat = 1; launchEv('suplex', V.pos.x, V.hc, V.pos.z, -fx, -fz, PI * R / (T.flip - T.leap)); W.slowMo(0.6, 0.25); }
      // The flip twists half a turn, so it lands crouched and facing its prey
      const u = clamp01((t - T.leap) / (T.flip - T.leap)), e = Math.pow(u, 1.25), th = e * PI, w = smooth(u);
      A.setPose(s.x + fx * (R - 6) * (1 - w), A.hc + gy + 20 * (1 - w) + 10 * Math.sin(PI * u), s.z + fz * (R - 6) * (1 - w), s.yaw + PI * w, lerp(-0.4, -TAU, w), 0);
      vAt(V, R * Math.cos(th), lerp(V.hc, V.hc + 1, e) + Math.sin(th) * 24 + gy, vy, e * PI, 0);
      return;
    }
    if (s.beat < 2) { s.beat = 2; jolt(V, A, s.def.dmg * 0.55, 0.16, V.pos.x, 2, V.pos.z, 0.8); }
    // Stood on its head for a beat, then over onto its back; the mantis crouched over it
    const u = clamp01((t - T.flip) / (T.topple - T.flip)), e = u * u;
    K.stand(A, s.x, s.z, s.yaw + PI, 0.32 * (1 - 0.4 * u));
    vAt(V, lerp(-R, -R - 6, e), gy + lerp(V.hc + 1, V.lieY, e), vy, lerp(PI, 1.5 * PI, e), 0);
    if (u >= 1) {
      vAt(V, -R - 6, V.lieY, vy, -HALF_PI, 0);
      hold.yaw = s.yaw + PI;
      finish('suplex', s.def.dmg * 0.45, 0.7, 0.4);
    }
  }

  // Vesperax, PRISM DRIVER: turned upside down, then a high corkscrew leap and down on its head
  function prismdriver(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, dd = 7;
    if (t < T.invert) {
      const u = smooth(t / T.invert);
      K.stand(A, s.x, s.z, s.yaw, 0.3 * Math.sin(PI * u));
      vAt(V, lerp(s.d0, dd, u), gy + V.hc + 12 * Math.sin(PI * u) + 10.5 * u, vy, PI * u, 0);
      return;
    }
    if (t < T.jump) {
      if (s.beat < 1) {
        s.beat = 1;
        const e = bus.ev(EV.CROWD_POP);
        e.kind = 'boo'; e.impact = 0.7; e.x = s.x; e.z = s.z;
        bus.emit(EV.CROWD_POP);
      }
      K.stand(A, s.x, s.z, s.yaw, -0.06);
      vAt(V, dd, gy + V.hc + 10.5 + Math.sin(t * 30) * 0.25, vy, PI, 0.04 * Math.sin(t * 11));
      return;
    }
    if (t < T.spike) {
      if (s.beat < 2) { s.beat = 2; W.slowMo(0.6, 0.3); launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, 40); }
      const u = clamp01((t - T.jump) / (T.spike - T.jump)), hop = 22 * Math.sin(PI * Math.min(1, u * 1.05)), yaw = s.yaw + TAU * smooth(u);
      A.root.position.set(s.x, gy + hop, s.z);
      A.root.rotation.set(-0.1 * u, yaw, 0);
      V.setPose(s.x + Math.sin(yaw) * dd, gy + V.hc + 10.5 + hop - 7.5 * u * u, s.z + Math.cos(yaw) * dd, yaw + PI, PI, 0);
      return;
    }
    if (s.beat < 3) {
      s.beat = 3;
      jolt(V, A, s.def.dmg * 0.65, 0.22, V.pos.x, 2, V.pos.z, 1);
      ctx.shake(2, 0.45);
    }
    const u = clamp01((t - T.spike) / (T.topple - T.spike)), e = u * u;
    K.stand(A, s.x, s.z, s.yaw, -0.1 * (1 - smooth(u)));
    vAt(V, lerp(dd, dd + 9, e), gy + lerp(V.hc + 3, V.lieY, e), vy, lerp(PI, 1.5 * PI, e), 0);
    if (u >= 1) {
      vAt(V, dd + 9, V.lieY, vy, -HALF_PI, 0);
      finish('slam', s.def.dmg * 0.35, 0.62, 0.5);
    }
  }

  // Thornwake, ROOTLOCK SLAM: the roots come up round it and hoist it high, then drag it down into the ground
  function rootlock(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, top = liftTop(A, V, 26), at = s.d0 + 2;
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, -0.12 * u);
      vAt(V, lerp(s.d0, at, u), V.hc + gy - 2.5 * u, vy, 0, 0.1 * u * Math.sin(t * 20));
      return;
    }
    if (t < T.peak) {
      const u = smooth((t - T.grip) / (T.peak - T.grip));
      K.stand(A, s.x, s.z, s.yaw, -0.12 - 0.12 * u);
      vAt(V, at, V.hc + gy - 2.5 + (top + 2.5) * u, vy + 0.5 * Math.sin(PI * u), lerp(0, -1.2, u), 0.08 * Math.sin(t * 17));
      return;
    }
    if (s.beat < 1) { s.beat = 1; W.slowMo(0.55, 0.3); launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, top / (T.hit - T.peak)); }
    // (a beat at the top, then yanked: the drop is cubic)
    const u = clamp01((t - T.peak) / (T.hit - T.peak)), e = u * u * u;
    K.stand(A, s.x, s.z, s.yaw, lerp(-0.24, 0.5, e));
    vAt(V, lerp(at, s.d0 + 4, e), lerp(V.hc + gy + top, V.lieY, e), vy, lerp(-1.2, -HALF_PI, e), 0.06 * (1 - e) * Math.sin(t * 17));
    if (u >= 1) {
      vAt(V, s.d0 + 4, V.lieY, vy, -HALF_PI, 0);
      finish('slam', s.def.dmg, 0.92, 0.6);
    }
  }

  // Thornwake, TIMBER SUPLEX: a bear hug, then it falls backwards stiff as a felled oak, and sits up out of the wreck
  function timber(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), vy = s.yaw + PI, zf = s.d0 - 5, AMAX = 1.45;
    const rise = Math.max(0, A.lieY - A.hc * Math.cos(AMAX)); // the root comes up as it falls, so it lands on its back, not through the mat
    const behind = -(2 * A.hc + 4);
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.1 * u);
      vAt(V, lerp(s.d0, zf, u), V.hc + gy + 4 * u, vy, -0.1 * u, 0);
      return;
    }
    if (t < T.peak) {
      const u = smooth((t - T.grip) / (T.peak - T.grip)), sway = 0.03 * Math.sin(t * 9);
      K.stand(A, s.x, s.z, s.yaw, 0.1 - 0.18 * u + sway);
      vAt(V, zf, V.hc + gy + 4 + 5 * u, vy, -0.1 - 0.1 * u, sway);
      return;
    }
    if (t < T.hit) {
      if (s.beat < 1) { s.beat = 1; launchEv('suplex', V.pos.x, V.pos.y, V.pos.z, -Math.sin(s.yaw), -Math.cos(s.yaw), 40); W.slowMo(0.6, 0.3); }
      const u = clamp01((t - T.peak) / (T.hit - T.peak)), e = u * u, a = -0.08 - (AMAX - 0.08) * e, lift = rise * e;
      A.root.position.set(s.x, gy + lift, s.z);
      A.root.rotation.set(a, s.yaw, 0);
      // V rides the falling trunk, then goes on over its head
      const y0 = V.hc + 9, ca = Math.cos(a), sa = Math.sin(a);
      const ry = y0 * ca - zf * sa + lift, rz = y0 * sa + zf * ca, k = smooth(clamp01((u - 0.45) / 0.55));
      vAt(V, lerp(rz, behind, k), gy + lerp(ry, V.lieY, k), vy, lerp(0, 1.5 * PI, e), 0);
      return;
    }
    if (s.beat < 2) {
      s.beat = 2;
      vAt(V, behind, V.lieY, vy, -HALF_PI, 0);
      jolt(V, A, s.def.dmg * 0.7, 0.2, V.pos.x, 2, V.pos.z, 1);
      ctx.shake(1.8, 0.4);
    }
    // It sits up out of the crater, the foe flat behind its head
    const u = clamp01((t - T.hit) / (T.up - T.hit)), e = smooth(u);
    A.root.position.set(s.x, gy + rise * (1 - e), s.z);
    A.root.rotation.set(-AMAX * (1 - e), s.yaw, 0);
    vAt(V, behind, V.lieY, vy, -HALF_PI, 0);
    if (u >= 1) {
      K.stand(A, s.x, s.z, s.yaw, 0);
      finish('suplex', s.def.dmg * 0.3, 0.6, 0.4);
    }
  }

  // Ferrumaw, COIL SUPLEX: it curls up round the foe like the pangolin it is and rolls over backwards, flinging it off at the bottom
  function coil(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, zf = s.d0 - 7, L0 = 0.7;
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, 0.12 * u);
      vAt(V, lerp(s.d0, s.d0 - 5, u), V.hc + gy, vy, 0, 0);
      return;
    }
    if (t < T.peak) {
      const u = smooth((t - T.grip) / (T.peak - T.grip));
      K.stand(A, s.x, s.z, s.yaw, lerp(0.12, L0, u));
      vAt(V, lerp(s.d0 - 5, zf, u), V.hc + gy - 1.5 * u, vy, 0.25 * u, 0);
      return;
    }
    if (s.beat < 1) {
      s.beat = 1;
      // How far back it can roll (the venue's edge)
      _pt.x = s.x - fx * 18; _pt.z = s.z - fz * 18;
      ctx.clampToBounds(_pt);
      s.speed = Math.hypot(_pt.x - s.x, _pt.z - s.z);
      launchEv('suplex', V.pos.x, V.pos.y, V.pos.z, -fx, -fz, 40);
      W.slowMo(0.65, 0.25);
    }
    const L = s.speed, u = clamp01((t - T.peak) / (T.hit - T.peak)), e = smooth(u);
    // A rolls once over backwards, its centre travelling back L
    const pitch = lerp(L0, -TAU, e), cAlong = lerp(A.hc * Math.sin(L0), -L, e), cy = gy + lerp(A.hc * Math.cos(L0), A.hc, e) - A.hc * 0.4 * Math.sin(PI * e);
    A.setPose(s.x + fx * cAlong, cy, s.z + fz * cAlong, s.yaw, pitch, 0);
    // V rolls with it (on the outside of the ball), then comes off behind
    const ph = pitch - L0, rf = zf - A.hc * Math.sin(L0), rh = (V.hc - 1.5) - A.hc * Math.cos(L0);
    const cp = Math.cos(ph), sp = Math.sin(ph);
    const ry = rh * cp - rf * sp, rz = rh * sp + rf * cp, k = smooth(clamp01((u - 0.5) / 0.5)), end = -L - (s.d0 + 2);
    vAtIn(V, lerp(cAlong + rz, end, k), lerp(cy + ry, V.lieY, k), vy, lerp(-ph + 0.25, 1.5 * PI, k), 0);
    if (u >= 1) {
      s.x -= fx * L; s.z -= fz * L;
      K.stand(A, s.x, s.z, s.yaw, 0);
      vAtIn(V, -(s.d0 + 2), V.lieY, vy, -HALF_PI, 0);
      finish('suplex', s.def.dmg, 0.8, 0.45);
    }
  }

  // Ferrumaw, IRON CLAMP: crushed against its plates by three magnetic pulses, then the polarity flips and it is blown away
  function clamp(A, V, t) {
    const T = s.def.T, gy = K.groundY(A), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), vy = s.yaw + PI, zc = s.d0 - 6;
    if (t < T.grip) {
      const u = smooth(t / T.grip);
      K.stand(A, s.x, s.z, s.yaw, -0.1 * u);
      vAt(V, lerp(s.d0, zc, u), V.hc + gy + 5 * u, vy, -0.1 * u, 0);
      return;
    }
    if (t < T.peak) {
      const n = t >= T.p3 ? 3 : t >= T.p2 ? 2 : t >= T.p1 ? 1 : 0;
      if (s.beat < n) { s.beat = n; jolt(V, A, s.def.dmg * 0.12, 0.06, V.pos.x, V.pos.y, V.pos.z, 0.45); }
      const q = s.beat > 0 ? Math.exp(-14 * (t - (s.beat === 3 ? T.p3 : s.beat === 2 ? T.p2 : T.p1))) : 0;
      K.stand(A, s.x, s.z, s.yaw, -0.1 - 0.08 * q);
      vAt(V, zc - 1.2 * q, V.hc + gy + 5 + 0.8 * q, vy, -0.1 - 0.25 * q, 0.05 * Math.sin(t * 40));
      return;
    }
    if (s.beat < 4) { s.beat = 4; launchEv('slam', V.pos.x, V.pos.y, V.pos.z, fx, fz, 60); W.slowMo(0.6, 0.22); }
    const u = clamp01((t - T.peak) / (T.hit - T.peak)), e = smooth(u);
    K.stand(A, s.x, s.z, s.yaw, lerp(-0.1, -0.35, smooth(u * 2)));
    vAtIn(V, lerp(zc, s.d0 + 24, e), lerp(V.hc + gy + 5, V.lieY, u * u) + Math.sin(PI * u) * 10, vy, lerp(-0.1, -HALF_PI, e), 0);
    if (u >= 1) {
      vAtIn(V, s.d0 + 24, V.lieY, vy, -HALF_PI, 0);
      finish('slam', s.def.dmg * 0.64, 0.8, 0.5);
    }
  }

  const RUN = { chokeslam, bulldozer, rana, ddt, breaker, piledriver, chokebomb, backdrop, powerbomb, riptide, frostdrop, horntoss, scissors, prismdriver, rootlock, timber, coil, clamp };

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
