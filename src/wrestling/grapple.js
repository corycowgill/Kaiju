// Grapple system: everything in which one kaiju's body is moved by the other.
//   - the lock-up and its four moves: Irish whip (forward), suplex (back),
//     lift / carry / press slam or toss (neutral), giant swing (sideways);
//     reversal and mash-escape; pick-up of a downed foe;
//   - thrown and whipped bodies travelling through the world: they plough
//     through buildings (each collapse hurts and is reported with the
//     landmark's name), rebound off the ring ropes until the ropes snap,
//     splash into the lake, crush the ringside crowd, and end in a knockdown;
//   - the pin and its three count, with the kick-out rules;
//   - the finisher timeline.
// It drives BOTH roots procedurally while it owns them (fighter.held; the
// player's through ctx.player.control.external). Bodies are placed by their
// centre with Fighter.setPose, so every timeline below is written as anchor
// points (chest to chest, overhead, at arm's length) that a real pose from
// anims.js lines up with: see ANCHORS at the bottom of this header.
// OWNER: combat core.
//
// ANCHORS (u; A = the one doing it, V = the one it is done to; hc = 13.5 the
// height of a body's centre; "front" = along A's facing):
//   lockup      V's root at front (rA + rV - 3), facing A. Collar-and-elbow.
//   whip        V orbits A at that distance to the aim, released running.
//   suplex      V's centre travels a half circle of radius (rA + rV - 3) over
//               A's head, pitching forward 270 deg: it lands flat on its back
//               behind A, head toward A. A bridges back up to 0.5 rad.
//   lift/carry  V flat on its back across A's raised hands: centre at
//               (front 2, up A.height + 8), body axis across A's shoulders.
//   press slam  from there straight down to front (rA + 9), on its back.
//   swing       V flat, feet in A's hands: centre at radius (rA + hc + 3),
//               height 9, head outward, turning counter-clockwise with A.
//   pin         A face-down (root pitched 1.35 rad forward) across V's chest,
//               at right angles to it.
//   finisher    lift as above, both rise to the apex, then V is driven down
//               to front (rA + 8).
import * as THREE from 'three';
import { EV } from './events.js';
import { MOVES } from './fighter.js';

/** Grapple tuning (exported for the balance simulation and the AI). */
export const GRAPPLE = {
  lockMin: 0.30,        // s in the lock-up before a move can start
  lockAuto: 0.90,       // s after which a lock-up with no direction becomes the lift
  revWindow: 0.25,      // s after grab:start in which the victim's own grab press reverses it
  escapeGain: 0.24,     // escape meter per mash at full stamina
  escapeDecay: 0.30,    // meter lost per second
  cost: { whip: 8, suplex: 12, slam: 14, swing: 16, pickup: 6 },
  // Irish whip
  whipTime: 0.45, whipSpeed: 100, runDecel: 30, runStop: 24,
  // suplex
  suplexCrouch: 0.25, suplexArc: 0.70, suplexDmg: 20,
  // lift / carry / slam / toss
  hoist: 0.60, carryMax: 3.0, carryDrain: 9, carrySpeed: 0.4, slamTime: 0.32, slamDmg: 22, tossSpeed: 64, tossUp: 22, tossDmg: 12,
  // giant swing
  swingSetup: 0.45, swingW0: 2.5, swingAccel: 3.4, swingWMax: 8.5, swingTurns: 3, swingSpeed: 58, swingPerTurn: 26, swingUp: 15, swingDmg: 10, swingTurnCost: 5,
  // flight
  gravity: 70, slideDecel: 95, smashMin: 42, bldgDmg: 8, bldgSpeedDmg: 0.045, landSpeedDmg: 0.08,
  ropeHp: 3,
  // pin
  countAt: [1.0, 2.0, 3.0], forcedAt: [0.8, 1.6, 2.4], nearFall: 2.55,
  pinGain: 0.05, pinGainS: 0.22, pinDecay: 0.22,
  // finisher
  finDmg: 55, finRadius: 70, finRange: 22,
};
/** Finisher per kaiju: the name on the callout and the shape of the move. */
export const FINISHERS = Object.freeze({
  godzilla: { name: 'ATOMIC DRIVER', apex: 58, spin: 0 },
  ghidorah: { name: 'THUNDERFALL', apex: 88, spin: 2 },
  mecha:    { name: 'ROCKET BUSTER', apex: 72, spin: 1 },
});
const FIN_T = { grab: 0.5, lift: 1.1, rise: 2.0, apex: 2.35, drop: 2.8, end: 3.7 };
const TWO_PI = Math.PI * 2, HALF_PI = Math.PI / 2;
const MOVE_DUR = { whip: GRAPPLE.whipTime, suplex: GRAPPLE.suplexCrouch, slam: GRAPPLE.hoist, swing: GRAPPLE.swingSetup, pickup: 0.65 };

const _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _dmgOpt = { kind: 'slam', src: 'player', aerial: false };
const _animOpt = { fade: 0.12, timeScale: 1, duration: undefined, commit: undefined };
const _sweep = { t: 2, b: null, y: 0 };
function _sweepVisit(b, t) { if (t < _sweep.t && (b.h + 3 > _sweep.y)) { _sweep.t = t; _sweep.b = b; } }
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const mkFlight = () => ({ on: false, V: null, by: null, type: '', mode: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, spinP: 0, spinR: 0,
  count: 0, rebounds: 0, t: 0, impact: 0, landed: false });

/** @returns the grapple runtime (see the members' comments) */
export function createGrapple(ctx, W) {
  const bus = W.bus;
  /** The hold in progress (read-only for other modules). phase: lockup | whip | suplex | hoist | carry | slamdown | swing | pickup. escape: the victim's 0..1 mash meter. */
  const hold = { active: false, who: '', target: '', phase: '', type: '', escape: 0, locked: false,
    A: null, V: null, t: 0, yaw: 0, yaw0: 0, d0: 0, noRev: false, aim: 0, ang: 0, omega: 0, spun: 0, turns: 0, want: false, sx: 0, sz: 0, syaw: 0, launched: false, ax: 0, az: 0 };
  /** The pin in progress (read-only). meter: the pinned one's 0..1 kick-out meter; count: slaps so far. */
  const pin = { active: false, who: '', target: '', t: 0, count: 0, meter: 0, forced: false, done: false, A: null, V: null, kickAt: Infinity, strength: 0 };
  /** The finisher in progress (read-only). */
  const fin = { active: false, who: '', target: '', name: '', t: 0, A: null, V: null, def: null, beat: 0, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, vyaw: 0, vlie: 0, hit: false };
  const flights = [mkFlight(), mkFlight()];
  /** Hits each side of the ring ropes has left (0 = snapped). */
  const ropes = { n: GRAPPLE.ropeHp, e: GRAPPLE.ropeHp, s: GRAPPLE.ropeHp, w: GRAPPLE.ropeHp };
  const inRing = { player: true, rival: true };

  const flightOf = (f) => flights[f.isPlayer ? 0 : 1];
  const groundY = (f) => -f.sink;
  const play = (f, name, dur, fade = 0.12) => {
    _animOpt.fade = fade; _animOpt.timeScale = 1; _animOpt.duration = dur; _animOpt.commit = dur;
    return W.anims.play(f, name, _animOpt);
  };
  function stand(f, x, z, yaw, lean = 0) {
    f.root.position.set(x, groundY(f), z);
    f.root.rotation.set(lean, yaw, 0);
  }
  function emit2(name, who, target) {
    const e = bus.ev(name);
    e.who = who.id; e.target = target.id;
    return e;
  }
  function take(A, V) {
    A.held = true; V.held = true;
    A.vel.set(0, 0, 0); V.vel.set(0, 0, 0);
    V.targetable = false; V.solid = false; A.solid = false;
    V.lean = 0; A.lean = 0;
  }
  function freeBody(f) {
    f.held = false; f.targetable = f.state !== 'ko'; f.solid = true;
    f.root.rotation.x = 0; f.root.rotation.z = 0;
    f.root.position.y = groundY(f);
    f.lie = 0; f._lieP = 0; f.lieTarget = 0;
  }
  // The thrower lets go: back under its own control after `rec` seconds
  function releaseThrower(A, rec) {
    A.held = false; A.solid = true; A.lean = 0;
    A.root.rotation.x = 0; A.root.rotation.z = 0;
    A.root.position.y = groundY(A);
    if (A.isPlayer) ctx.player.yaw = A.root.rotation.y; // the lock-on eases it back from here
    if (A.state !== 'ko') A.recover(rec);
  }

  // ------------------------------------------------------------------ lock-up
  /** A's grab is active: take hold of its foe if it can be held. True once the lock-up exists. */
  function connect(A) {
    const V = A.opponent;
    if (!V || hold.active || pin.active || fin.active) return false;
    if (V.held || V.invuln || V.invulnT > 0 || V.state === 'ko' || V.state === 'downed' || V.state === 'gettingUp') return false;
    if (A.gapTo(V) > MOVES.grab.reach || !A.facing(V, 1.0)) return false;
    lockup(A, V, V.grabLocked, V.state === 'blocking');
    return true;
  }
  function lockup(A, V, locked, noRev) {
    take(A, V);
    hold.active = true; hold.A = A; hold.V = V; hold.who = A.id; hold.target = V.id;
    hold.phase = 'lockup'; hold.type = ''; hold.t = 0; hold.escape = 0; hold.locked = !!locked; hold.noRev = !!locked || !!noRev;
    hold.d0 = A.radius + V.radius - 3;
    hold.yaw = A.distTo(V) > 1 ? A.yawTo(V) : A.yaw;
    hold.yaw0 = hold.yaw; hold.turns = 0; hold.spun = 0; hold.want = false; hold.launched = false;
    V.grabChain++;
    A.yaw = hold.yaw;
    A.setState('grappling'); V.setState('grappled');
    const e = emit2(EV.GRAB_START, A, V);
    e.x = (A.pos.x + V.pos.x) / 2; e.y = A.hc + 4; e.z = (A.pos.z + V.pos.z) / 2;
    bus.emit(EV.GRAB_START);
  }
  function endHold() {
    hold.active = false; hold.phase = ''; hold.type = ''; hold.escape = 0;
    hold.A = null; hold.V = null; hold.who = ''; hold.target = '';
  }
  // The victim turns the tie-up around
  function reverse() {
    const A = hold.A, V = hold.V;
    emit2(EV.GRAB_REVERSED, V, A);
    bus.emit(EV.GRAB_REVERSED);
    V.gainMomentum(8);
    if (V.isPlayer) ctx.addScore(400);
    endHold();
    stand(A, A.pos.x, A.pos.z, A.root.rotation.y);
    stand(V, V.pos.x, V.pos.z, V.root.rotation.y);
    lockup(V, A, true, true);
  }
  /** The victim gets free. by: 'mash' | 'timeout' | 'hit'. */
  function escape(by) {
    const A = hold.A, V = hold.V;
    const e = emit2(EV.GRAB_ESCAPED, V, A);
    e.by = by;
    bus.emit(EV.GRAB_ESCAPED);
    const pa = A.pos, fx = Math.sin(hold.yaw), fz = Math.cos(hold.yaw);
    // From overhead it drops to its feet behind the carrier, otherwise it shoves off in front
    const back = hold.phase === 'carry' || hold.phase === 'hoist';
    const d = (hold.d0 + 4) * (back ? -1 : 1);
    endHold();
    freeBody(V);
    stand(V, pa.x + fx * d, pa.z + fz * d, back ? hold.yaw : hold.yaw + Math.PI);
    if (V.isPlayer) ctx.player.yaw = V.root.rotation.y;
    V.invulnT = 0.35;
    V.vel.set(fx * (back ? -20 : 20), 0, fz * (back ? -20 : 20));
    V.gainMomentum(5);
    V.setState('neutral');
    A.held = false; A.solid = true;
    stand(A, pa.x, pa.z, hold.yaw);
    A.setState('neutral');
    A._buf.grab = 0; A._buf.strike = 0;
    A.lockT = 0; A.lockHits = 0;
    if (by !== 'timeout') A.stagger(by === 'hit' ? 0.4 : 0.6, V.id, -fx, -fz, 14);
  }
  function startMove(type) {
    const A = hold.A, V = hold.V;
    hold.type = type; hold.t = 0;
    hold.phase = type === 'slam' ? 'hoist' : type;
    A.spend(GRAPPLE.cost[type] * (A.tired ? 0.5 : 1));
    A.gainMomentum(4);
    const e = emit2(EV.GRAB_MOVE, A, V);
    e.type = type; e.dur = MOVE_DUR[type];
    bus.emit(EV.GRAB_MOVE);
    if (type === 'whip') { play(A, 'whip_send', 0.8); hold.aim = hold.yaw; }
    else if (type === 'suplex') { play(A, 'suplex', GRAPPLE.suplexCrouch + GRAPPLE.suplexArc + 0.5); W.anims.play(V, 'carried'); }
    else if (type === 'slam') {
      play(A, 'lift', GRAPPLE.hoist + 0.2); W.anims.play(V, 'carried');
      emit2(EV.LIFT_START, A, V);
      bus.emit(EV.LIFT_START);
    } else if (type === 'swing') {
      W.anims.play(A, 'swing'); W.anims.play(V, 'carried');
      hold.ang = hold.yaw; hold.omega = GRAPPLE.swingW0; hold.spun = 0; hold.turns = 0; hold.want = false; hold.aim = hold.yaw0 + HALF_PI;
    }
  }

  /** Pick a downed foe up into a lock-up. */
  function startPickup(A, V) {
    if (hold.active || pin.active || fin.active || V.held || V.state !== 'downed') return false;
    const locked = V.grabChain < 2;
    take(A, V);
    hold.active = true; hold.A = A; hold.V = V; hold.who = A.id; hold.target = V.id;
    hold.phase = 'pickup'; hold.type = 'pickup'; hold.t = 0; hold.escape = 0; hold.locked = locked; hold.noRev = locked;
    hold.d0 = A.radius + V.radius - 3;
    V.mid(_c);
    hold.yaw = Math.atan2(_c.x - A.pos.x, _c.z - A.pos.z); hold.yaw0 = hold.yaw;
    hold.sx = V.pos.x; hold.sz = V.pos.z; hold.syaw = V.root.rotation.y;
    A.spend(GRAPPLE.cost.pickup);
    A.setState('grappling', 0, null); play(A, 'grab_reach', 0.65);
    V.setState('grappled', 0, null);
    // A clip that lies by itself blends up to the tie-up; a root-tipped body is stood up by the timeline
    hold.launched = V.lieByClip;
    if (V.lieByClip) { _animOpt.fade = 0.5; _animOpt.timeScale = 1; _animOpt.duration = undefined; _animOpt.commit = undefined; W.anims.play(V, 'lockup', _animOpt); }
    else W.anims.play(V, 'carried');
    emit2(EV.PICKUP, A, V);
    bus.emit(EV.PICKUP);
    const e = emit2(EV.GRAB_MOVE, A, V);
    e.type = 'pickup'; e.dur = MOVE_DUR.pickup;
    bus.emit(EV.GRAB_MOVE);
    return true;
  }

  function updateHold(dt) {
    const A = hold.A, V = hold.V, ia = A.intent, iv = V.intent;
    hold.t += dt;
    const t = hold.t, pa = A.pos, G = GRAPPLE;
    let fx = Math.sin(hold.yaw), fz = Math.cos(hold.yaw);
    // The victim struggles: mash to get out (while the hold can be escaped at all)
    if (!hold.locked && (hold.phase === 'lockup' || hold.phase === 'carry' || hold.phase === 'hoist' || (hold.phase === 'swing' && hold.turns < 1))) {
      if (iv.mash > 0) {
        const g = G.escapeGain * (0.35 + 0.65 * V.stamina / V.maxStamina) * (1 + 0.5 * Math.max(0, V.grabChain - 1)) * (hold.phase === 'lockup' ? 1 : 0.7);
        hold.escape += iv.mash * g;
      }
      hold.escape = Math.max(0, hold.escape - G.escapeDecay * dt);
      if (hold.phase === 'lockup' && !hold.noRev && t <= G.revWindow && iv.grab) { reverse(); return; }
      if (hold.escape >= 1) { escape('mash'); return; }
    }
    switch (hold.phase) {
      case 'lockup': {
        // Settle chest to chest
        const k = 1 - Math.exp(-14 * dt);
        const tx = pa.x + fx * hold.d0, tz = pa.z + fz * hold.d0;
        stand(A, pa.x, pa.z, hold.yaw);
        V.root.position.set(lerp(V.pos.x, tx, k), groundY(V), lerp(V.pos.z, tz, k));
        V.root.rotation.set(0, V.root.rotation.y + angDiff(hold.yaw + Math.PI, V.root.rotation.y) * k, 0);
        if (ia.finisher && tryFinisher(A)) return;
        if (t >= G.lockMin) {
          const ax = Math.abs(ia.dirX), az = Math.abs(ia.dirZ);
          if (ax > 0.5 && ax >= az) startMove('swing');
          else if (ia.dirZ > 0.5) startMove('whip');
          else if (ia.dirZ < -0.5) startMove('suplex');
          else if (ia.grab || ia.strike || t >= G.lockAuto) startMove('slam');
        }
        break;
      }
      case 'pickup': {
        const e = smooth(t / MOVE_DUR.pickup);
        const tx = pa.x + fx * hold.d0, tz = pa.z + fz * hold.d0;
        stand(A, pa.x, pa.z, hold.yaw, 0.35 * Math.sin(Math.PI * e));
        const lie = hold.launched ? 0 : 1 - e;
        V.root.position.set(lerp(hold.sx, tx, e), lie * V.lieY + groundY(V) * (1 - lie), lerp(hold.sz, tz, e));
        V.root.rotation.set(-lie * HALF_PI, hold.syaw + angDiff(hold.yaw + Math.PI, hold.syaw) * e, 0);
        V.lie = lie; V._lieP = lie; V.lieTarget = 0;
        if (t >= MOVE_DUR.pickup) {
          const locked = hold.locked;
          endHold();
          V.grabChain = Math.max(0, V.grabChain); // the chain keeps counting through the pick-up
          lockup(A, V, locked, true);
        }
        break;
      }
      case 'whip': {
        // Wheel the victim around to the aim, then send it
        if (Math.hypot(ia.moveX, ia.moveZ) > 0.3) hold.aim = Math.atan2(ia.moveX, ia.moveZ);
        const d = angDiff(hold.aim, hold.yaw), step = 9 * dt;
        hold.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
        fx = Math.sin(hold.yaw); fz = Math.cos(hold.yaw);
        stand(A, pa.x, pa.z, hold.yaw);
        stand(V, pa.x + fx * hold.d0, pa.z + fz * hold.d0, hold.yaw + Math.PI);
        if (t >= G.whipTime && Math.abs(angDiff(hold.aim, hold.yaw)) < 0.05) {
          const x = pa.x + fx * (hold.d0 + 2), z = pa.z + fz * (hold.d0 + 2);
          endHold();
          launch(V, A, 'whip', 'run', x, V.hc, z, fx, fz, G.whipSpeed * (V.tired ? 1.12 : 1), 0);
          releaseThrower(A, 0.38);
        }
        break;
      }
      case 'suplex': {
        const R = hold.d0;
        if (t < G.suplexCrouch) {
          const u = smooth(t / G.suplexCrouch);
          stand(A, pa.x, pa.z, hold.yaw, 0.18 * u);
          V.setPose(pa.x + fx * R, V.hc + 2 * u + groundY(V), pa.z + fz * R, hold.yaw + Math.PI, 0.25 * u, 0);
          break;
        }
        if (!hold.launched) {
          hold.launched = true;
          const e = emit2(EV.THROW_LAUNCH, A, V);
          e.type = 'suplex'; e.x = V.pos.x; e.y = V.hc; e.z = V.pos.z; e.dirX = -fx; e.dirZ = -fz; e.speed = Math.PI * R / G.suplexArc;
          bus.emit(EV.THROW_LAUNCH);
        }
        const u = Math.min(1, (t - G.suplexCrouch) / G.suplexArc);
        const e = Math.pow(u, 1.5); // heaved up, then whipped into the mat
        const th = e * Math.PI, apex = A.height * 0.75;
        stand(A, pa.x, pa.z, hold.yaw, -0.5 * Math.sin(th) - 0.18 * (1 - e) + 0.18 * e * 0);
        V.setPose(pa.x + fx * R * Math.cos(th), lerp(V.hc, V.lieY, e) + Math.sin(th) * apex, pa.z + fz * R * Math.cos(th), hold.yaw + Math.PI, 0.25 + e * (1.5 * Math.PI - 0.25), 0);
        if (u >= 1) {
          endHold();
          V.setPose(pa.x - fx * R, V.lieY, pa.z - fz * R, hold.yaw + Math.PI, -HALF_PI, 0);
          impact(V, A, 'suplex', G.suplexDmg, 0.62, true);
          releaseThrower(A, 0.7);
        }
        break;
      }
      case 'hoist': {
        const u = smooth(t / G.hoist), H = A.height + 8;
        stand(A, pa.x, pa.z, hold.yaw, -0.12 * Math.sin(Math.PI * u));
        V.setPose(pa.x + fx * lerp(hold.d0, 2, u), lerp(V.hc, H, u) + groundY(A), pa.z + fz * lerp(hold.d0, 2, u), hold.yaw + Math.PI - HALF_PI * u, -HALF_PI * u, 0);
        if (t >= G.hoist) { hold.phase = 'carry'; hold.t = 0; }
        break;
      }
      case 'carry': {
        // Walk it where you want it
        const H = A.height + 8, mv = Math.hypot(ia.moveX, ia.moveZ);
        if (mv > 0.3) {
          const sp = A.cfg.stats.speed * 18 * G.carrySpeed * (A.tired ? 0.6 : 1);
          pa.x += ia.moveX / mv * sp * dt; pa.z += ia.moveZ / mv * sp * dt;
          ctx.resolveBuildingCollisions(pa, A.collideRadius, dt, 35, A.id);
          ctx.clampToBounds(pa);
          hold.yaw += angDiff(Math.atan2(ia.moveX, ia.moveZ), hold.yaw) * (1 - Math.exp(-5 * dt));
          fx = Math.sin(hold.yaw); fz = Math.cos(hold.yaw);
          A.glb.play('walk', 0.3, 0.6);
        }
        A.spend(G.carryDrain * dt);
        stand(A, pa.x, pa.z, hold.yaw);
        V.setPose(pa.x + fx * 2, H + groundY(A) + Math.sin(t * 5) * 0.5, pa.z + fz * 2, hold.yaw + HALF_PI, -HALF_PI, 0);
        if ((t >= 0.2 && (ia.grab || ia.strike)) || t >= G.carryMax || A.stamina <= 0) {
          if (mv > 0.3) {
            // Thrown: out over the ropes, at whatever is in the way
            play(A, 'throw', 0.6);
            const x = pa.x + fx * 4, z = pa.z + fz * 4;
            endHold();
            launch(V, A, 'toss', 'air', x, H + groundY(A), z, fx, fz, G.tossSpeed, G.tossUp);
            releaseThrower(A, 0.55);
          } else {
            play(A, 'throw', 0.7);
            hold.phase = 'slamdown'; hold.t = 0;
            const e = emit2(EV.THROW_LAUNCH, A, V);
            e.type = 'slam'; e.x = pa.x + fx * 2; e.y = H; e.z = pa.z + fz * 2; e.dirX = fx; e.dirZ = fz; e.speed = H / G.slamTime;
            bus.emit(EV.THROW_LAUNCH);
          }
        }
        break;
      }
      case 'slamdown': {
        const u = Math.min(1, t / G.slamTime), e = u * u, H = A.height + 8, out = A.radius + 9;
        stand(A, pa.x, pa.z, hold.yaw, 0.45 * e);
        V.setPose(pa.x + fx * lerp(2, out, e), lerp(H + groundY(A), V.lieY, e), pa.z + fz * lerp(2, out, e), hold.yaw + HALF_PI, -HALF_PI, 0);
        if (u >= 1) {
          endHold();
          impact(V, A, 'slam', G.slamDmg, 0.72, true);
          releaseThrower(A, 0.6);
        }
        break;
      }
      case 'swing': {
        const Rs = A.radius + V.hc + 3;
        if (t < G.swingSetup) {
          const u = smooth(t / G.swingSetup);
          stand(A, pa.x, pa.z, hold.ang, -0.15 * u);
          V.setPose(pa.x + fx * lerp(hold.d0, Rs, u), lerp(V.hc, 9, u) + groundY(A), pa.z + fz * lerp(hold.d0, Rs, u), hold.ang + Math.PI, -HALF_PI * u, 0);
          break;
        }
        hold.omega = Math.min(G.swingWMax, hold.omega + G.swingAccel * dt);
        const da = hold.omega * dt;
        hold.ang += da; hold.spun += da;
        const sx = Math.sin(hold.ang), sz = Math.cos(hold.ang);
        A.root.position.y = groundY(A);
        A.root.rotation.set(-0.2, hold.ang, 0);
        V.setPose(pa.x + sx * Rs, 9 + groundY(A) + Math.sin(hold.spun * 2) * 1.2, pa.z + sz * Rs, hold.ang + Math.PI, -HALF_PI, 0);
        if (hold.spun >= TWO_PI * (hold.turns + 1)) {
          hold.turns++;
          A.spend(G.swingTurnCost);
          const e = emit2(EV.SWING_SPIN, A, V);
          e.turns = hold.turns;
          bus.emit(EV.SWING_SPIN);
        }
        // A kaiju on the end of your arms is a wrecking ball
        const hx = pa.x + sx * (Rs + V.hc * 0.8), hz = pa.z + sz * (Rs + V.hc * 0.8);
        const b = ctx.buildingAt(hx, hz);
        if (b && !b.destroyed) {
          const f = flightOf(V);
          f.count = hold.launched ? f.count : 0; hold.launched = true;
          f.V = V; f.by = A; f.type = 'swing'; f.x = hx; f.y = 9; f.z = hz;
          smash(f, b, 60, true);
          hold.omega *= 0.85;
        }
        if (!hold.want && ((hold.spun >= Math.PI * 1.5 && (ia.grab || ia.strike)) || hold.turns >= G.swingTurns || A.stamina <= 0)) {
          hold.want = true;
          // Let go toward the stick, or back the way it was facing when it took hold
          hold.aim = Math.hypot(ia.moveX, ia.moveZ) > 0.3 ? Math.atan2(ia.moveX, ia.moveZ) : hold.yaw0;
          hold.sx = hold.spun;
        }
        if (hold.want && (Math.abs(angDiff(hold.ang + HALF_PI, hold.aim)) <= da * 1.1 || hold.spun - hold.sx >= TWO_PI)) {
          const turns = Math.max(1, hold.spun / TWO_PI), heading = hold.ang + HALF_PI;
          const x = pa.x + sx * Rs, z = pa.z + sz * Rs, n = flightOf(V).count;
          play(A, 'throw', 0.6);
          endHold();
          launch(V, A, 'swing', 'air', x, 10 + groundY(A), z, Math.sin(heading), Math.cos(heading),
            G.swingSpeed + G.swingPerTurn * Math.min(G.swingTurns, turns), G.swingUp + 3 * Math.min(G.swingTurns, turns));
          flightOf(V).count = n;
          flightOf(V).pitch = -HALF_PI; flightOf(V).yaw = hold.ang + Math.PI; flightOf(V).spinP = 0; flightOf(V).spinR = 0;
          releaseThrower(A, 0.6);
        }
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ bodies in flight
  /**
   * Send V travelling. mode 'run' (whipped: on its feet, out of control) or
   * 'air' (thrown: ballistic, then sliding). (x, y, z) = its centre, (dx, dz)
   * unit heading, speed u/s, up = vertical speed.
   */
  function launch(V, by, type, mode, x, y, z, dx, dz, speed, up) {
    const f = flightOf(V);
    f.on = true; f.V = V; f.by = by; f.type = type; f.mode = mode;
    f.x = x; f.y = y; f.z = z; f.vx = dx * speed; f.vz = dz * speed; f.vy = up;
    f.yaw = mode === 'run' ? Math.atan2(dx, dz) : V.root.rotation.y; f.pitch = V.root.rotation.x; f.roll = 0;
    f.spinP = mode === 'air' ? -(2.5 + speed * 0.02) : 0; f.spinR = 0;
    f.count = 0; f.rebounds = 0; f.t = 0; f.impact = 0; f.landed = false;
    V.held = true; V.targetable = false; V.solid = false; V.lean = 0;
    V.vel.set(0, 0, 0);
    V.setState('airborne', 0, mode === 'run' ? 'whip_run' : 'carried');
    by.gainMomentum(6);
    if (by.isPlayer) ctx.addScore(200);
    const e = emit2(EV.THROW_LAUNCH, by, V);
    e.type = type; e.x = x; e.y = y; e.z = z; e.dirX = dx; e.dirZ = dz; e.speed = speed;
    bus.emit(EV.THROW_LAUNCH);
  }

  // A travelling body meets a building. Returns the share of its speed it keeps (0 = stopped dead).
  function smash(f, b, speed, forceCollapse) {
    const V = f.V, by = f.by;
    if (b.isFence || b.h < 5) { ctx.collapseBuilding(b, by.id); return 1; } // stalls and fences are confetti
    const name = ctx.landmarkName(b), big = !!name;
    const through = forceCollapse || speed >= GRAPPLE.smashMin;
    f.count++;
    const dmg = (GRAPPLE.bldgDmg + speed * GRAPPLE.bldgSpeedDmg) * (big ? 1.5 : 1) * by.atkMult;
    const dealt = V.applyDamage(dmg, 'building', by.id, f.x, Math.max(6, f.y), f.z, false);
    if (through) ctx.collapseBuilding(b, by.id); else ctx.damageBuilding(b, 500, null, by.id);
    by.gainMomentum(big ? 12 : 6);
    if (by.isPlayer) ctx.addScore(big ? 1500 : 350);
    const e = emit2(EV.BUILDING_IMPACT, V, V);
    e.target = undefined; e.by = by.id; e.type = f.type; e.building = b; e.landmarkId = b.landmarkId || ''; e.name = name; e.destroyed = !!b.destroyed;
    e.count = f.count; e.damage = dealt; e.h = b.h; e.x = b.x; e.y = Math.min(b.h, Math.max(6, f.y)); e.z = b.z;
    delete e.target;
    bus.emit(EV.BUILDING_IMPACT);
    W.hitStop(big ? 0.18 : Math.min(0.1, 0.05 + 0.015 * f.count));
    if (big) W.slowMo(0.4, 0.5);
    f.impact = Math.min(1, f.impact + (big ? 0.35 : 0.18));
    return b.destroyed ? (big ? 0.62 : 0.78) : 0;
  }

  // The ring ropes: a whipped body crossing a side that still stands bounces back
  function ropeHit(f, x1, z1) {
    const A = W.arena && W.arena.info;
    if (!A) return false;
    const h = A.half, x0 = f.x, z0 = f.z;
    let side = '';
    if (Math.abs(z0 - A.cz) <= h && Math.abs(z1 - A.cz) <= h + 4) {
      if ((x0 - (A.cx + h)) * (x1 - (A.cx + h)) < 0) side = 'e';
      else if ((x0 - (A.cx - h)) * (x1 - (A.cx - h)) < 0) side = 'w';
    }
    if (!side && Math.abs(x0 - A.cx) <= h && Math.abs(x1 - A.cx) <= h + 4) {
      if ((z0 - (A.cz + h)) * (z1 - (A.cz + h)) < 0) side = 's';
      else if ((z0 - (A.cz - h)) * (z1 - (A.cz - h)) < 0) side = 'n';
    }
    if (!side || ropes[side] <= 0) return false;
    const V = f.V, speed = Math.hypot(f.vx, f.vz);
    ropes[side]--;
    if (ropes[side] <= 0) {
      // Third time: the cables give and it goes through
      const e = bus.ev(EV.ROPE_SNAP);
      e.who = V.id; e.side = side; e.x = x1; e.z = z1;
      bus.emit(EV.ROPE_SNAP);
      f.vx *= 0.75; f.vz *= 0.75;
      W.hitStop(0.1);
      return false;
    }
    // Bounce: mirrored, bent toward the one who sent it (that is who it is coming back to)
    if (side === 'e' || side === 'w') f.vx = -f.vx; else f.vz = -f.vz;
    const out = Math.max(72, speed * 0.92);
    let dx = f.vx / speed, dz = f.vz / speed;
    const by = f.by;
    if (by && !by.held) {
      const tx = by.pos.x - x0, tz = by.pos.z - z0, td = Math.hypot(tx, tz) || 1;
      dx = dx * 0.45 + tx / td * 0.55; dz = dz * 0.45 + tz / td * 0.55;
      const n = Math.hypot(dx, dz) || 1;
      dx /= n; dz /= n;
    }
    f.vx = dx * out; f.vz = dz * out;
    f.yaw = Math.atan2(dx, dz);
    f.rebounds++;
    if (by) by.gainMomentum(4);
    const e = bus.ev(EV.ROPE_REBOUND);
    e.who = V.id; e.side = side; e.speed = out; e.ropeHp = ropes[side]; e.x = x0; e.z = z0;
    bus.emit(EV.ROPE_REBOUND);
    return true;
  }

  // A body comes down (or is put down): damage, the ground it hit, what was under it. settle: it stays where it is.
  function impact(V, by, type, base, size, settle) {
    V.mid(_c);
    const f = flightOf(V);
    const x = settle ? _c.x : f.x, z = settle ? _c.z : f.z;
    const speed = settle ? 0 : Math.hypot(f.vx, f.vz);
    let surface = 'ground';
    const b = settle ? ctx.buildingAt(x, z) : null;
    if (b && !b.destroyed) {
      // Put down ON something
      f.V = V; f.by = by; f.type = type; f.x = x; f.y = V.lieY; f.z = z;
      if (settle) f.count = 0;
      smash(f, b, 80, true);
      surface = 'building';
    }
    const water = ctx.isWater(x, z);
    if (water) surface = 'water';
    const n = ctx.world.crowdHit ? ctx.world.crowdHit(x, z, 15 * 15) : 0;
    if (n > 0) {
      if (n >= 4 && surface === 'ground') surface = 'crowd';
      const e = bus.ev(EV.CROWD_CRUSHED);
      e.who = V.id; e.count = n; e.x = x; e.z = z;
      bus.emit(EV.CROWD_CRUSHED);
    }
    // Whatever else was under it: cars, tanks, stalls
    _dmgOpt.kind = 'slam'; _dmgOpt.src = by.id; _dmgOpt.aerial = false;
    const tw = W.rival.targetable;
    W.rival.targetable = false;
    _c.set(x, 0, z);
    ctx.damageInRadius(_c, 15, 160, _dmgOpt);
    W.rival.targetable = tw;
    const imp = Math.min(1, size + speed * 0.002 + f.impact * (settle ? 0 : 1));
    const dealt = V.applyDamage((base + speed * GRAPPLE.landSpeedDmg) * by.dmgMult, type === 'whip' ? 'slam' : type, by.id, x, V.lieY, z, false);
    by.gainMomentum(8);
    if (by.isPlayer) ctx.addScore(Math.round(dealt * 15));
    if (water) {
      const e = bus.ev(EV.WATER_IMPACT);
      e.who = V.id; e.size = imp > 0.75 ? 3 : imp > 0.45 ? 2 : 1; e.x = x; e.z = z;
      bus.emit(EV.WATER_IMPACT);
    }
    const e = emit2(EV.THROW_LAND, by, V);
    e.type = type; e.damage = dealt; e.impact = imp; e.surface = surface; e.x = x; e.y = 0; e.z = z;
    bus.emit(EV.THROW_LAND);
    W.hitStop(0.08 + imp * 0.1);
    if (settle) V.land(by.id, 'throw', imp);
    else {
      // Still sliding: the mat has it, the knockdown is now
      const k = bus.ev(EV.KNOCKDOWN);
      k.who = V.id; k.by = by.id; k.cause = 'throw'; k.impact = imp; k.x = x; k.y = 0; k.z = z;
      bus.emit(EV.KNOCKDOWN);
    }
    f.impact = imp;
    return surface;
  }

  // A whipped body runs out of steam (or into its thrower) still on its feet
  function endRun(f, dizzy) {
    const V = f.V, by = f.by;
    f.on = false;
    freeBody(V);
    stand(V, f.x, f.z, f.yaw);
    if (V.isPlayer) ctx.player.yaw = f.yaw;
    V.setState('neutral');
    V.lockT = 0; V.lockHits = 0;
    if (V.hp <= 0) return; // the next update makes it a KO
    if (dizzy) V.stun(1.2, by ? by.id : ''); else V.stagger(0.7, by ? by.id : '', 0, 0, 0);
  }
  /** A whipped body on the run can be struck (the rebound clothesline). */
  function strikable(V) { const f = flightOf(V); return f.on && f.mode === 'run'; }
  /** ...and that strike floors it. */
  function cutDown(V, by, size) {
    const f = flightOf(V);
    if (!f.on) return;
    f.on = false;
    freeBody(V);
    stand(V, f.x, f.z, f.yaw + Math.PI);
    V.state = 'neutral';
    const dx = V.pos.x - by.pos.x, dz = V.pos.z - by.pos.z, d = Math.hypot(dx, dz) || 1;
    V.lockT = 0; V.lockHits = 0;
    V.knockDown(by.id, 'strike', Math.min(1, size + 0.15), dx / d, dz / d, 46);
  }

  function updateFlight(f, dt) {
    const V = f.V, G = GRAPPLE;
    f.t += dt;
    let speed = Math.hypot(f.vx, f.vz);
    let x1 = f.x + f.vx * dt, z1 = f.z + f.vz * dt;
    if (f.mode === 'run') {
      if (ropeHit(f, x1, z1)) { x1 = f.x + f.vx * dt; z1 = f.z + f.vz * dt; speed = Math.hypot(f.vx, f.vz); }
    }
    // Buildings along this step (nearest first; one per frame is plenty at these speeds)
    if (speed > 1 && (f.mode !== 'air' || f.y < 150)) {
      _sweep.t = 2; _sweep.b = null; _sweep.y = f.mode === 'air' ? f.y - 5 : 0;
      ctx.sweepBuildings(f.x, f.z, x1, z1, V.collideRadius, _sweepVisit);
      if (_sweep.b) {
        const keep = smash(f, _sweep.b, speed, false);
        f.vx *= keep; f.vz *= keep;
        if (f.mode === 'air') f.vy = Math.min(f.vy, 4) * (keep > 0 ? 1 : 0);
        if (keep === 0) {
          if (f.mode === 'run') {
            // Stopped dead against the wall: down it goes
            f.on = false;
            freeBody(V);
            stand(V, f.x, f.z, f.yaw + Math.PI);
            V.state = 'neutral';
            const e = emit2(EV.THROW_LAND, f.by, V);
            e.type = f.type; e.damage = 0; e.impact = 0.5; e.surface = 'building'; e.x = f.x; e.y = 0; e.z = f.z;
            bus.emit(EV.THROW_LAND);
            V.knockDown(f.by.id, 'throw', 0.5, 0, 0, 0);
            return;
          }
          x1 = f.x; z1 = f.z;
        } else { x1 = f.x + f.vx * dt; z1 = f.z + f.vz * dt; }
        speed = Math.hypot(f.vx, f.vz);
      }
    }
    f.x = x1; f.z = z1;
    // The edge of the map stops everything
    _c.set(f.x, 0, f.z);
    ctx.clampToBounds(_c);
    if (_c.x !== f.x || _c.z !== f.z) { f.x = _c.x; f.z = _c.z; f.vx = 0; f.vz = 0; speed = 0; }

    if (f.mode === 'run') {
      const ns = Math.max(0, speed - G.runDecel * dt);
      if (speed > 0) { f.vx *= ns / speed; f.vz *= ns / speed; }
      V.root.position.set(f.x, groundY(V), f.z);
      V.root.rotation.set(0.28, f.yaw, 0);
      V.sink += ((ctx.isWater(f.x, f.z) ? 3 : 0) - V.sink) * (1 - Math.exp(-3 * dt));
      const by = f.by;
      // Back into the arms of the one who sent it, or out of steam
      if (f.rebounds > 0 && by && !by.held && by.state !== 'ko' && Math.hypot(by.pos.x - f.x, by.pos.z - f.z) < by.radius + V.radius + 1 && f.vx * (by.pos.x - f.x) + f.vz * (by.pos.z - f.z) > 0) endRun(f, true);
      else if (ns < G.runStop) endRun(f, f.rebounds > 0);
      return;
    }
    if (f.mode === 'air') {
      f.vy -= G.gravity * dt;
      f.y += f.vy * dt;
      // Tumbling, then flattening out to land on its back
      const eta = f.vy < 0 ? (f.y - V.lieY) / -f.vy : 1;
      if (eta < 0.28) {
        const target = -HALF_PI + Math.round((f.pitch + HALF_PI) / TWO_PI) * TWO_PI;
        const k = 1 - Math.exp(-16 * dt);
        f.pitch += (target - f.pitch) * k; f.roll += (0 - f.roll) * k;
      } else { f.pitch += f.spinP * dt; f.roll += f.spinR * dt; }
      if (f.y <= V.lieY) {
        f.y = V.lieY;
        f.pitch = -HALF_PI; f.roll = 0;
        const base = f.type === 'swing' ? G.swingDmg : G.tossDmg;
        const surface = impact(V, f.by, f.type, base, f.type === 'swing' ? 0.55 : 0.5, false);
        f.mode = 'slide'; f.landed = true;
        const keep = surface === 'water' ? 0.3 : 0.55;
        f.vx *= keep; f.vz *= keep; f.vy = 0;
      }
      V.setPose(f.x, f.y, f.z, f.yaw, f.pitch, f.roll);
      return;
    }
    // slide: on its back, ploughing to a stop
    const ns = Math.max(0, speed - G.slideDecel * dt);
    if (speed > 0) { f.vx *= ns / speed; f.vz *= ns / speed; }
    V.setPose(f.x, V.lieY, f.z, f.yaw, -HALF_PI, 0);
    if (ns < 4) {
      f.on = false;
      V.targetable = true;
      V.land(f.by.id, 'throw', f.impact, false);
    }
  }

  // ------------------------------------------------------------------ pin
  /** How much fight a pinned kaiju has left, about 0 (done) .. 1 (fresh): health, stamina, the size of the move that put it there, kick-outs already spent. */
  function pinStrength(V) {
    const hp = Math.max(0, V.hp) / Math.max(1, V.maxHp), st = V.stamina / V.maxStamina;
    return 0.2 + 0.6 * hp + 0.15 * st - 0.28 * V.lastImpact - 0.07 * V.kickouts - (V.finished > 0 ? 0.5 : 0);
  }
  /** A covers the downed V. forced: a knockout cover that cannot be kicked out of. */
  function startPin(A, V, forced) {
    if (hold.active || pin.active || fin.active || V.held || flightOf(V).on) return false;
    if (V.state !== 'downed' && V.state !== 'ko') return false;
    take(A, V);
    pin.active = true; pin.done = false; pin.A = A; pin.V = V; pin.who = A.id; pin.target = V.id;
    pin.t = 0; pin.count = 0; pin.meter = 0; pin.forced = !!forced;
    const S = pinStrength(V) + (V.isPlayer ? 0 : 0.05 * (W.match.state.difficulty || 0));
    pin.strength = S;
    if (forced || V.isPlayer) pin.kickAt = Infinity;
    else {
      // The rival's kick-out is decided as the cover goes on: fresh = at one, hurt = the last instant, spent = never
      const r = S + (Math.random() * 0.2 - 0.1);
      pin.kickAt = r < 0.2 ? Infinity : 2.95 - 2.5 * clamp01((r - 0.2) / 0.55);
    }
    V.mid(_c);
    A.setPose(_c.x, V.lieY + 8, _c.z, V.root.rotation.y + HALF_PI, 1.35, 0);
    A.setState('pinning');
    if (V.state !== 'ko') V.setState('pinned', 0, V.lieByClip ? 'pinned' : null);
    const e = emit2(EV.PIN_START, A, V);
    e.forced = pin.forced;
    bus.emit(EV.PIN_START);
    return true;
  }
  // The cover comes off: the pinner back on its feet beside the body
  function pinnerOff(A, V) {
    V.mid(_c);
    const y = V.root.rotation.y + HALF_PI, d = A.radius + 10;
    A.held = false; A.solid = true;
    stand(A, _c.x + Math.sin(y) * d, _c.z + Math.cos(y) * d, y + Math.PI);
    if (A.isPlayer) ctx.player.yaw = A.root.rotation.y;
    A.setState('neutral');
  }
  function kickOut() {
    const A = pin.A, V = pin.V, near = pin.t >= GRAPPLE.nearFall;
    const e = emit2(EV.PIN_KICKOUT, V, A);
    e.count = pin.count; e.at = pin.t; e.near = near;
    bus.emit(EV.PIN_KICKOUT);
    pin.active = false;
    V.kickouts++;
    V.gainMomentum(near ? 14 : 7);
    V.stamina = Math.min(V.maxStamina, V.stamina + 12);
    if (V.isPlayer) ctx.addScore(near ? 800 : 250);
    W.hitStop(0.06);
    pinnerOff(A, V);
    A.lockT = 0; A.lockHits = 0;
    A.stagger(0.9, V.id, -Math.sin(A.root.rotation.y), -Math.cos(A.root.rotation.y), 26);
    V.held = false; V.targetable = true;
    V.getUp();
  }
  function breakPin(reason) {
    const A = pin.A, V = pin.V;
    const e = emit2(EV.PIN_BROKEN, A, V);
    e.reason = reason;
    bus.emit(EV.PIN_BROKEN);
    pin.active = false;
    pinnerOff(A, V);
    A.stagger(0.5, '', 0, 0, 0);
    V.held = false; V.targetable = true;
    if (V.state === 'pinned') { V.state = 'downed'; V.stateT = 0; V.stateDur = 1.0; V.solid = false; }
  }
  function updatePin(dt) {
    if (pin.done) return;
    const A = pin.A, V = pin.V, G = GRAPPLE;
    pin.t += dt;
    const at = pin.forced ? G.forcedAt : G.countAt;
    if (pin.count < 3 && pin.t >= at[pin.count]) {
      pin.count++;
      const e = emit2(EV.PIN_COUNT, A, V);
      e.count = pin.count; e.forced = pin.forced;
      bus.emit(EV.PIN_COUNT);
      if (pin.count >= 3) {
        pin.done = true;
        const f = emit2(EV.PIN_FALL, A, V);
        f.forced = pin.forced;
        bus.emit(EV.PIN_FALL); // match.js takes it from here
        return;
      }
    }
    if (pin.forced) return;
    if (V.isPlayer) {
      const S = clamp01(pin.strength);
      if (V.intent.mash > 0) pin.meter += V.intent.mash * (G.pinGain + G.pinGainS * S);
      pin.meter = Math.max(0, pin.meter - G.pinDecay * dt);
      if (pin.meter >= 1) kickOut();
    } else {
      pin.meter = pin.kickAt === Infinity ? Math.min(0.8, pin.t / 3 * 0.6 + Math.sin(pin.t * 9) * 0.05) : clamp01(pin.t / pin.kickAt);
      if (pin.t >= pin.kickAt) kickOut();
    }
  }
  /** After a fall: let both bodies go (match.js resets them). */
  function clear() {
    if (hold.active) { const A = hold.A, V = hold.V; endHold(); freeBody(A); freeBody(V); }
    if (pin.active) { pin.active = false; pin.A.held = false; pin.V.held = false; }
    if (fin.active) { fin.active = false; fin.A.held = false; fin.V.held = false; fin.A.invuln = false; fin.V.invuln = false; }
    for (const f of flights) if (f.on) { f.on = false; f.V.held = false; f.V.targetable = true; }
    pin.done = false; pin.A = null; pin.V = null; pin.who = ''; pin.target = ''; pin.meter = 0; pin.count = 0;
  }

  // ------------------------------------------------------------------ finisher
  /** Momentum full, and the foe stunned, held by A, or down and in reach. */
  function canFinisher(A) {
    const V = A.opponent;
    if (!V || fin.active || pin.active || A.momentum < 100 || W.match.state.phase !== 'fight') return false;
    if (hold.active) return hold.A === A && hold.phase === 'lockup';
    if (!A.canAct || V.held || V.invuln || V.state === 'ko') return false;
    if (V.state !== 'stunned' && V.state !== 'staggered' && !(V.state === 'downed' && V.falling <= 0)) return false;
    return (V.state === 'downed' ? A.groundGap(V) : A.gapTo(V)) <= GRAPPLE.finRange;
  }
  function tryFinisher(A) {
    if (!canFinisher(A)) return false;
    const V = A.opponent;
    if (hold.active) endHold();
    take(A, V);
    const def = FINISHERS[A.key] || FINISHERS.godzilla;
    fin.active = true; fin.A = A; fin.V = V; fin.who = A.id; fin.target = V.id; fin.def = def; fin.name = def.name;
    fin.t = 0; fin.beat = 0; fin.hit = false;
    V.mid(_c);
    fin.yaw = Math.hypot(_c.x - A.pos.x, _c.z - A.pos.z) > 1 ? Math.atan2(_c.x - A.pos.x, _c.z - A.pos.z) : A.yaw;
    fin.x = A.pos.x; fin.z = A.pos.z;
    fin.vx = V.pos.x; fin.vz = V.pos.z; fin.vyaw = V.root.rotation.y; fin.vlie = V.lieByClip ? 0 : V.lie;
    A.invuln = true; V.invuln = true;
    A.spendMomentum();
    A.yaw = fin.yaw;
    A.setState('grappling', 0, null); V.setState('grappled', 0, null);
    play(A, 'finisher_windup', FIN_T.lift);
    _animOpt.fade = 0.4; _animOpt.duration = undefined; _animOpt.commit = undefined; W.anims.play(V, 'carried', _animOpt);
    const e = emit2(EV.FINISHER_START, A, V);
    e.name = def.name;
    bus.emit(EV.FINISHER_START);
    beat('grab');
    W.slowMo(0.5, 0.6, 2);
    return true;
  }
  function beat(name) {
    const e = emit2(EV.FINISHER_BEAT, fin.A, fin.V);
    e.beat = name; e.t = fin.t;
    bus.emit(EV.FINISHER_BEAT);
  }
  function updateFinisher(dt) {
    const A = fin.A, V = fin.V, T = FIN_T, def = fin.def;
    fin.t += dt;
    const t = fin.t, fx = Math.sin(fin.yaw), fz = Math.cos(fin.yaw);
    const d0 = A.radius + V.radius - 3, H = A.height + 8, gy = groundY(A);
    if (t < T.grab) {
      // Hauled in (off the mat if it was down) to the tie-up
      const e = smooth(t / T.grab), lie = fin.vlie * (1 - e);
      stand(A, fin.x, fin.z, fin.yaw);
      V.root.position.set(lerp(fin.vx, fin.x + fx * d0, e), lie * V.lieY + gy * (1 - lie), lerp(fin.vz, fin.z + fz * d0, e));
      V.root.rotation.set(-lie * HALF_PI, fin.vyaw + angDiff(fin.yaw + Math.PI, fin.vyaw) * e, 0);
      V.lie = lie; V._lieP = lie; V.lieTarget = 0;
      return;
    }
    if (fin.beat < 1) { fin.beat = 1; beat('lift'); }
    if (t < T.lift) {
      const u = smooth((t - T.grab) / (T.lift - T.grab));
      stand(A, fin.x, fin.z, fin.yaw, -0.12 * Math.sin(Math.PI * u));
      V.setPose(fin.x + fx * lerp(d0, 2, u), lerp(V.hc, H, u) + gy, fin.z + fz * lerp(d0, 2, u), fin.yaw + Math.PI - HALF_PI * u, -HALF_PI * u, 0);
      return;
    }
    if (fin.beat < 2) { fin.beat = 2; beat('rise'); }
    if (t < T.apex) {
      // Up they go, and hang there
      const u = clamp01((t - T.lift) / (T.rise - T.lift)), e = 1 - (1 - u) * (1 - u);
      if (fin.beat < 3 && t >= T.rise) { fin.beat = 3; beat('apex'); W.slowMo(0.45, 0.4, 2); }
      const y = gy + def.apex * e, spin = def.spin * TWO_PI * e;
      A.root.position.set(fin.x, y, fin.z);
      A.root.rotation.set(-0.1, fin.yaw + spin, 0);
      V.setPose(fin.x + Math.sin(fin.yaw + spin) * 2, H + y, fin.z + Math.cos(fin.yaw + spin) * 2, fin.yaw + spin + HALF_PI, -HALF_PI, 0);
      return;
    }
    if (fin.beat < 4) {
      fin.beat = 4; beat('drop');
      play(A, 'finisher_strike', T.drop - T.apex + 0.5);
      W.anims.play(V, 'finisher_victim');
      V.lieByClip = false; // the timeline lays it down
    }
    if (t < T.drop) {
      const u = (t - T.apex) / (T.drop - T.apex), e = u * u, out = A.radius + 8;
      const y = gy + def.apex * (1 - e);
      A.root.position.set(fin.x, y, fin.z);
      A.root.rotation.set(0.5 * e, fin.yaw, 0);
      V.setPose(fin.x + fx * lerp(2, out, e), lerp(H + y, V.lieY, e), fin.z + fz * lerp(2, out, e), fin.yaw + HALF_PI, -HALF_PI, 0);
      return;
    }
    if (!fin.hit) {
      fin.hit = true;
      const out = A.radius + 8, x = fin.x + fx * out, z = fin.z + fz * out;
      stand(A, fin.x, fin.z, fin.yaw, 0.5);
      V.setPose(x, V.lieY, z, fin.yaw + HALF_PI, -HALF_PI, 0);
      V.invuln = false;
      const dealt = V.applyDamage(GRAPPLE.finDmg * A.dmgMult, 'finisher', A.id, x, V.lieY, z, false);
      V.invuln = true;
      // The block goes with it
      _dmgOpt.kind = 'finisher'; _dmgOpt.src = A.id; _dmgOpt.aerial = true;
      const tw = W.rival.targetable;
      W.rival.targetable = false;
      _c.set(x, 0, z);
      ctx.damageInRadius(_c, GRAPPLE.finRadius, 700, _dmgOpt);
      W.rival.targetable = tw;
      if (ctx.world.crowdHit) ctx.world.crowdHit(x, z, 20 * 20);
      A.gainMomentum(10);
      if (A.isPlayer) ctx.addScore(2500);
      const e = emit2(EV.FINISHER_IMPACT, A, V);
      e.name = fin.name; e.damage = dealt; e.radius = GRAPPLE.finRadius; e.x = x; e.y = 0; e.z = z;
      bus.emit(EV.FINISHER_IMPACT);
      const k = bus.ev(EV.KNOCKDOWN);
      k.who = V.id; k.by = A.id; k.cause = 'finisher'; k.impact = 1; k.x = x; k.y = 0; k.z = z;
      bus.emit(EV.KNOCKDOWN);
      if (ctx.isWater(x, z)) {
        const w = bus.ev(EV.WATER_IMPACT);
        w.who = V.id; w.size = 3; w.x = x; w.z = z;
        bus.emit(EV.WATER_IMPACT);
      }
      W.hitStop(0.35);
      W.slowMo(0.3, 1.0, 2);
    }
    const r = clamp01((t - T.drop) / (T.end - T.drop));
    stand(A, fin.x, fin.z, fin.yaw, 0.5 * (1 - smooth(r * 1.5)));
    if (t >= T.end) {
      fin.active = false;
      A.invuln = false; V.invuln = false;
      emit2(EV.FINISHER_END, A, V);
      bus.emit(EV.FINISHER_END);
      V.finished = 9;
      V.targetable = true;
      V.land(A.id, 'finisher', 1, false, 1.5);
      A.held = false; A.solid = true;
      if (A.isPlayer) ctx.player.yaw = A.root.rotation.y;
      A.setState('neutral');
    }
  }

  /** A fighter took outside damage (military fire): it can break a hold or a cover. */
  function onDamage(f, dealt) {
    if (dealt < 2) return;
    if (hold.active && hold.A === f && (hold.phase === 'lockup' || hold.phase === 'carry')) escape('hit');
    else if (pin.active && !pin.forced && !pin.done && pin.A === f) breakPin('interference');
  }

  function trackRing(f) {
    const A = W.arena && W.arena.info;
    if (!A || !f) return;
    const p = f.pos, inside = Math.abs(p.x - A.cx) <= A.half && Math.abs(p.z - A.cz) <= A.half;
    if (inside === inRing[f.id]) return;
    inRing[f.id] = inside;
    if (inside) {
      const e = bus.ev(EV.RING_IN);
      e.who = f.id;
      bus.emit(EV.RING_IN);
    } else {
      const dx = p.x - A.cx, dz = p.z - A.cz;
      const e = bus.ev(EV.RING_OUT);
      e.who = f.id; e.side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n'); e.x = p.x; e.z = p.z;
      bus.emit(EV.RING_OUT);
    }
  }

  const g = {
    hold, pin, fin, ropes,
    /** True while a hold, a throw, a pin or a finisher owns a body. */
    get active() { return hold.active || pin.active || fin.active || flights[0].on || flights[1].on; },
    /** Is `who` ('player' | 'rival') inside the ring square? */
    inRing(who) { return inRing[who]; },
    /** The thrown / whipped body's flight record, or null: { type, mode ('run' | 'air' | 'slide'), vx, vz, y, count, rebounds }. */
    flight(f) { const r = flightOf(f); return r.on ? r : null; },
    connect, startPickup, startPin, canFinisher, tryFinisher, strikable, cutDown, onDamage, pinStrength, clear,
    /** Move choice the lock-up would make from a fighter's intent right now (for prompts). */
    start() {
      endHold();
      pin.active = false; pin.done = false; fin.active = false;
      for (const f of flights) f.on = false;
      ropes.n = ropes.e = ropes.s = ropes.w = GRAPPLE.ropeHp;
      inRing.player = true; inRing.rival = true;
      // Where each one starts (the player may still be out in the lake): no ring:in / out for that
      const A = W.arena && W.arena.info;
      if (A) for (const f of [W.player, W.rival]) inRing[f.id] = Math.abs(f.pos.x - A.cx) <= A.half && Math.abs(f.pos.z - A.cz) <= A.half;
    },
    update(dt) {
      if (dt > 0) {
        if (fin.active) updateFinisher(dt);
        else if (pin.active) updatePin(dt);
        else if (hold.active) updateHold(dt);
        for (let i = 0; i < 2; i++) if (flights[i].on) updateFlight(flights[i], dt);
      }
      trackRing(W.player); trackRing(W.rival);
    },
    /** Put the ropes back (a new match). */
    resetRopes() { ropes.n = ropes.e = ropes.s = ropes.w = GRAPPLE.ropeHp; },
    dispose() {
      clear();
      endHold();
      for (const f of flights) { f.on = false; f.V = null; f.by = null; }
      fin.A = null; fin.V = null; pin.A = null; pin.V = null;
    },
  };
  return g;
}
