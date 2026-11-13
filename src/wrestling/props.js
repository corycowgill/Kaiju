// Thrown buildings: either kaiju rips a real city building out of the ground,
// carries it overhead and hurls it at the other one.
//   rip     grab next to a building (not a bridge, a fence or the arena)
//           with the foe out of grab reach: the city
//           collapses it the normal way (grid, rubble, dust, score), and its
//           own instance slots (GLB kit pieces / procedural body / windows,
//           whatever this tier drew it with) are re-posed from then on, so
//           the building you see in its hands IS that building: no clone,
//           no new draw, no new shader;
//   carry   slow (TUNE.carrySpeed), light strikes do not shake it loose; a
//           heavier hit, a stagger or a grab drops it at its feet;
//   throw   strike / heavy / grab: a TUNE.windup s tell (power:telegraph: a
//           ground disc where it will come down), then a slow heavy arc at
//           where the foe stood when the wind-up began. It hits the foe (big
//           damage + knockdown; through a guard: chip + pushed back), or it
//           crashes into the street / the buildings in its path. Either way
//           it shatters (its slots go to zero, explosion, dust).
// A building too big to lift (a tower, a stadium: taller than TUNE.maxH or
// wider than TUNE.maxSide) gives up a piece instead: carve.js tears a
// kaiju-sized chunk out of it, the building keeps the wound, and the chunk is
// carried and thrown like any building. Landmarks are fair game either way.
//   smash   with the foe within reach the attack button brings what is
//           carried down over its head instead of throwing it.
// One building per kaiju at a time and TUNE.cooldown s between them.
// Driven by spots.js (pre before the fighters, update after); the AI reads
// buildingNear / carrying / flying (see the bottom of this file).
// OWNER: spots.
import * as THREE from 'three';
import { EV } from './events.js';

/** Tuning (exported for the AI and the sims). */
export const PROP_TUNE = {
  reach: 12,           // u from the body's edge to the building's footprint
  maxH: 50, minH: 6, maxSide: 30,
  festMinH: 3,         // the festival's stages, screens, towers, bars and cabins count too (the park around the ring has no other buildings)
  big: { h: 36, side: 22 }, // past these a building is heavy: slower to carry, a longer wind-up, a slower flight, more damage (x weight)
  rip: 0.8, carryMax: 9, carrySpeed: 0.45, cooldown: 10,
  windup: 0.75, rivalEasy: 0.2, // (rivalEasy: + the rival's wind-up at defense 0)
  speed: 72, gravity: 70, tMin: 0.7, tMax: 1.6,
  dmg: 50, dmgPerH: 0.6, chip: 0.25, chipStam: 30, push: 46,
  dropDmg: 9,          // one hit at least this big drops it (on top of any stagger / knockdown)
  facing: 14, lmPull: 6, // picking which building in reach a grab takes: u of extra gap for one directly behind its walk; u a landmark is preferred by
  lmMinH: 4,           // a landmark this low can still be ripped up whole (a museum wing)
  smashGap: 15,        // foe this close (gap, facing it): the attack button smashes it over its head
  smashWindup: 0.5, smashReach: 22, smashDmg: 1.2,
};
const CARRY = Object.freeze({ id: 'carry', kind: 'ppower', startup: 0, active: 0, recover: 0, steer: PROP_TUNE.carrySpeed });
const CARRY_LIGHT = Object.freeze({ id: 'carry', kind: 'ppower', startup: 0, active: 0, recover: 0, steer: 0.62 });
const CARRY_HEAVY = Object.freeze({ id: 'carry', kind: 'ppower', startup: 0, active: 0, recover: 0, steer: PROP_TUNE.carrySpeed * 0.65 });
const LINES = {
  rip: ['{0} ripped a building out of the ground!', 'That is somebody\'s office!', '{0} is holding a city block over its head!'],
  hit: ['Direct hit! Right in the face with a building!', 'They threw the WHOLE building!', 'That was zoned commercial!'],
  miss: ['Missed! And that block is gone too!', 'Wide! There goes another street!'],
  tear: ['{0} just tore a piece out of {1}!', 'That is a load-bearing piece of {1}!', '{0} is carrying part of {1}!'],
  ripLm: ['{0} ripped {1} out of the ground!', '{1} is over its head! The whole thing!'],
  smash: ['Smashed it over the head!', 'Broke a building over its skull!', 'That is one way to bring the house down!'],
  blocked: ['Blocked a building! Unbelievable!', 'Took a building on the forearms!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _m = new THREE.Matrix4(), _c = new THREE.Matrix4(), _o = new THREE.Matrix4(), _r = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _dmgOpt = { kind: 'building', src: 'player', aerial: true };

/** @param hooks { callout(text, sub, tier, who), say(text, tone), pop(kind, impact, x, z) } */
export function createProps(ctx, W, hooks) {
  const T = PROP_TUNE, bus = W.bus;
  const mk = () => ({ wu: 0.75, k: 1, move: CARRY, on: false, phase: '', f: null, b: null, t: 0, slots: [], m0: [], ox: 0, oz: 0, h: 0, side: 0,
    chunk: null, obj: null, objM: new THREE.Matrix4(), flat: false, hp: new THREE.Vector3(), hq: new THREE.Quaternion(), smash: false, name: '',
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tx: 0, tz: 0, yaw: 0, spin: 0, eta: 0, hit: false });
  const props = { player: mk(), rival: mk() };
  const cd = { player: 0, rival: 0 };
  const nearRes = { x: 0, z: 0, h: 0, dist: 0, b: null, kind: '', mode: '', name: '' };
  const carryRes = { phase: '', t: 0, smash: false, chunk: false, name: '' };
  const carve = () => (W.spots && W.spots.carve) || null;
  const flyRes = { x: 0, y: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, eta: 0, by: '', r: 0 };
  let best = null, bestD = 0, bestS = 0, qMax = 0, qf = null;
  const uncull = new Map(); // instanced mesh -> slots of ours in it with culling off

  /** How a standing building comes away in this kaiju's hands: 'whole' (lifted out of the ground), 'snap' / 'bite'
   *  (too big: carve.js tears a piece out of it), or '' (a fence, a bridge, a tent, a set piece that cannot fall). */
  function modeOf(b) {
    if (!b || b.destroyed || b.isFence || b.isBridge || b.crushOnContact || b.maxHp > 1e6) return '';
    // its own scene graph (the Navy Pier wheel), not instance slots: lifted whole, object and all
    const own = !!(b.customMesh && b.customMesh.parent && ctx.scene);
    if (!own && !((b._glbSlots && b._glbSlots.length) || (b._bodyIM && b._bodyIndex >= 0))) return '';
    const C = carve(), big = b._wound || b.h > T.maxH || Math.max(b.w, b.d) > T.maxSide;
    if (big) return C && !own ? C.kind(b, T) : '';
    return b.h >= (b.fest ? T.festMinH : b.landmarkId ? T.lmMinH : T.minH) ? 'whole' : '';
  }
  function visitNear(b) {
    if (!modeOf(b)) return;
    // gap from the body's edge to the footprint (AABB)
    const p = qf.pos, dx = Math.max(0, Math.abs(p.x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(p.z - b.z) - b.d / 2);
    const d = Math.hypot(dx, dz) - qf.radius;
    if (d >= qMax) return;
    const s = score(qf, b, d);
    if (s < bestS) { bestS = s; bestD = d; best = b; }
  }
  /** Which of the buildings in reach a grab takes (lowest wins). Downtown several always are: the one it is walking at
   *  (or, standing still, loosely the one it faces) wins, and a landmark or a tower beats the hut beside it. */
  function score(f, b, d) {
    const it = f.intent, m = Math.hypot(it.moveX, it.moveZ), p = f.pos;
    const a = m > 0.3 ? Math.atan2(it.moveX, it.moveZ) : f.yaw;
    // toward the nearest point of its footprint
    const nx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, p.x)) - p.x, nz = Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, p.z)) - p.z;
    const off = nx === 0 && nz === 0 ? 0 : 1 - Math.cos(Math.atan2(nx, nz) - a);
    return Math.max(0, d) + T.facing * (m > 0.3 ? 1 : 0.2) * off - (b.landmarkId ? T.lmPull : 0) - Math.min(4, b.h / 20);
  }
  function nearest(f, maxGap) {
    best = null; bestD = maxGap; qMax = maxGap; bestS = 1e9; qf = f;
    if (ctx.forEachBuildingNear) ctx.forEachBuildingNear(f.pos.x, f.pos.z, f.radius + maxGap + 24, visitNear);
    // and the park's throwables (chicago_arena.js: semis, towers)
    const A = W.arena && W.arena.info, items = A && A.throwables ? A.throwables.items : null;
    if (items) for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      const dx = Math.max(0, Math.abs(f.pos.x - it.x) - it.w / 2), dz = Math.max(0, Math.abs(f.pos.z - it.z) - it.d / 2);
      const d = Math.hypot(dx, dz) - f.radius;
      if (d >= maxGap) continue;
      const s = score(f, it, d);
      if (s < bestS) { bestS = s; bestD = d; best = it; }
    }
    qf = null;
    return best;
  }

  // ---- the building's own instance slots ----
  function capture(P, b) {
    P.slots.length = 0; P.m0.length = 0;
    const add = (im, idx) => {
      if (!im || idx < 0) return;
      const m = new THREE.Matrix4(); im.getMatrixAt(idx, m); P.slots.push(im, idx); P.m0.push(m);
      // The city's instanced meshes are culled by their own tile's sphere: carried off its tile, this one must still draw
      if (im.frustumCulled) { im.frustumCulled = false; uncull.set(im, (uncull.get(im) || 0) + 1); }
    };
    if (b._glbSlots) for (const s of b._glbSlots) add(s.im, s.idx);
    if (b._bodyIM && b._bodyIndex >= 0) add(b._bodyIM, b._bodyIndex);
    if (b.windowEntries) for (let i = 0; i < b.windowEntries.length && i < 48; i++) add(b.windowEntries[i].im, b.windowEntries[i].idx);
  }
  /** Pose every slot: C is the building's frame (its base centre) in the world. */
  function place(P, C) {
    if (P.chunk) { P.chunk.set(C); return; }
    _o.makeTranslation(-P.ox, 0, -P.oz);
    _r.multiplyMatrices(C, _o);
    if (P.obj) { P.obj.matrix.multiplyMatrices(_r, P.objM); P.obj.matrixWorldNeedsUpdate = true; }
    for (let i = 0, k = 0; i < P.slots.length; i += 2, k++) {
      const im = P.slots[i];
      _m.multiplyMatrices(_r, P.m0[k]);
      im.setMatrixAt(P.slots[i + 1], _m);
      im.instanceMatrix.needsUpdate = true;
    }
  }
  function hide(P) {
    if (P.chunk) { P.chunk.remove(); P.chunk = null; }
    if (P.obj) { if (P.obj.parent) P.obj.parent.remove(P.obj); P.obj = null; }
    for (let i = 0; i < P.slots.length; i += 2) {
      const im = P.slots[i];
      im.setMatrixAt(P.slots[i + 1], _zero); im.instanceMatrix.needsUpdate = true;
      const n = uncull.get(im);
      if (n !== undefined) { if (n <= 1) { uncull.delete(im); im.frustumCulled = true; } else uncull.set(im, n - 1); }
    }
    P.slots.length = 0; P.m0.length = 0;
  }
  /** The carry frame: lying across the raised hands, centre over the head. */
  function carryFrame(P, out) {
    const f = P.f, H = W.anims && W.anims.carryY ? W.anims.carryY(f, f) : 38;
    _q.setFromAxisAngle(_Y, f.yaw);
    if (P.flat) {
      // a low wide piece (a bite of a stadium) rides upright on the hands
      _w.set(f.pos.x + Math.sin(f.yaw) * 2, f.pos.y + H + 2, f.pos.z + Math.cos(f.yaw) * 2);
      return out.compose(_w, _q, _one);
    }
    _q1.setFromAxisAngle(_Z, Math.PI / 2 * P.side);
    _q.multiply(_q1);
    // base centre such that the middle of the (now horizontal) building sits at the hands
    _v.set(0, -P.h / 2, 0).applyQuaternion(_q);
    _w.set(f.pos.x + Math.sin(f.yaw) * 2, f.pos.y + H + 4 + Math.min(P.b.w, P.b.d) * 0.3, f.pos.z + Math.cos(f.yaw) * 2).add(_v);
    return out.compose(_w, _q, _one);
  }

  // ---- lifecycle of one building ----
  function rip(f, b) {
    const P = props[f.id], mode = b.isProp ? 'whole' : modeOf(b);
    const lm = !b.isProp && ctx.landmarkName ? ctx.landmarkName(b) : '';
    let ch = null;
    if (mode === 'snap' || mode === 'bite') {
      ch = carve().tear(b, f, T);
      if (!ch) return false;
    }
    P.on = true; P.phase = 'rip'; P.f = f; P.b = ch || b; P.t = 0; P.hit = false; P.smash = false;
    P.chunk = ch; P.flat = !!(ch && ch.flat); P.name = lm;
    P.ox = b.x; P.oz = b.z; P.h = b.h;
    P.hp.set(b.x, 0, b.z); P.hq.identity();
    P.side = Math.random() < 0.5 ? 1 : -1;
    if (ch) {
      // a piece of something too big to lift: it starts where it sat in the building (carve.js draws it)
      P.h = ch.h;
      P.k = Math.max(1, Math.sqrt(Math.max(ch.h / T.big.h, Math.max(ch.w, ch.d) / T.big.side)));
      P.move = P.k > 1.1 ? CARRY_HEAVY : CARRY;
      P.slots.length = 0; P.m0.length = 0;
      _c.multiplyMatrices(ch.home, _o.makeTranslation(ch.x, ch.y, ch.z)).decompose(P.hp, P.hq, _w);
    } else if (b.isProp) {
      // a park throwable: light (quick to carry, a short wind-up, less damage); its one slot in the arena's instanced kind
      P.k = 0.8; P.move = CARRY_LIGHT;
      P.slots.length = 0; P.m0.length = 0; P.slots.push(b.im, b.idx); P.m0.push(b.m0);
      b.alive = false;
    } else {
      P.k = Math.max(1, Math.sqrt(Math.max(b.h / T.big.h, Math.max(b.w, b.d) / T.big.side)));
      P.move = P.k > 1.1 ? CARRY_HEAVY : CARRY;
      capture(P, b);
      const own = b.customMesh && b.customMesh.parent ? b.customMesh : null;
      // The city's own collapse: out of the grid, rubble and dust on the lot, the crash, the score and building:destroyed
      ctx.collapseBuilding(b, f.id);
      if (own) {
        // (the collapse took its object out of the scene: back in, and from here on posed like the slots)
        own.updateMatrix(); P.objM.copy(own.matrix);
        own.matrixAutoUpdate = false;
        ctx.scene.add(own); P.obj = own;
      }
    }
    place(P, _c.compose(P.hp, P.hq, _one)); // (and straight back where it stood: it rises from there)
    f.yaw = Math.atan2(b.x - f.pos.x, b.z - f.pos.z);
    f.recover(999);
    f.move = P.move; f.armor = true;
    if (f.isPlayer) f._syncGate();
    W.anims.play(f, 'lift', { fade: 0.15, timeScale: 1, duration: T.rip, commit: T.rip });
    if (ctx.fx && ctx.fx.dustBurst) ctx.fx.dustBurst(_v.set(b.x, 0, b.z), Math.max(b.w, b.d) * 0.8 + 8, ctx.quality && !ctx.quality.full ? 6 : 12);
    if (ctx.shake) ctx.shake(0.8, 0.5);
    const e = bus.ev(EV.PROP_LIFT);
    e.who = f.id; e.x = b.x; e.z = b.z; e.h = b.h;
    bus.emit(EV.PROP_LIFT);
    const up = lm.toUpperCase();
    if (ch) hooks.callout(lm ? `A PIECE OF ${up}!` : 'TORE A CHUNK OUT OF IT!', lm ? 'TORN RIGHT OFF' : 'A PIECE OF A TOWER', lm ? 'landmark' : 'move', f.id);
    else if (lm) hooks.callout(`${up}!`, 'RIPPED OUT OF THE GROUND', 'landmark', f.id);
    else hooks.callout(b.isProp ? 'PICKED IT UP!' : 'RIPPED OUT OF THE GROUND!', b.isProp ? (b.kind === 'semi' ? 'A TOUR SEMI' : 'A LIGHTING TOWER') : 'A WHOLE BUILDING', 'move', f.id);
    hooks.say(pick(ch ? LINES.tear : lm ? LINES.ripLm : LINES.rip).replace('{0}', f.name).replace('{1}', lm || 'that tower'), 'shock');
    hooks.pop(f.isPlayer ? 'pop' : 'gasp', ch || lm ? 1 : 0.9, b.x, b.z);
    if (ch && f.isPlayer) ctx.addScore(lm ? 2500 : 1200); // (a whole building scores through the city's collapse)
    return true;
  }
  /** Let go of it where it is (dropped, or the fall ended): it comes down in front and shatters. */
  function drop(P) {
    if (!P.on || P.phase === 'fly') return;
    const f = P.f;
    carryFrame(P, _c);
    _v.setFromMatrixPosition(_c);
    crash(P, f.pos.x + Math.sin(f.yaw) * (f.radius + 8), 3, f.pos.z + Math.cos(f.yaw) * (f.radius + 8), false);
    if (f.state === 'attacking' && f.move === P.move) f.setState('neutral');
    f.armor = false;
    if (f.isPlayer) f._syncGate();
  }
  /** The foe within reach and in front: what is carried comes down over its head (startThrow from further away). */
  function smashable(P) {
    const f = P.f, foe = f.opponent;
    return !!foe && foe.state !== 'ko' && !foe.held && f.gapTo(foe) <= T.smashGap && f.facing(foe, 1.2);
  }
  function startSmash(P) {
    const f = P.f, foe = f.opponent;
    P.phase = 'windup'; P.t = 0; P.smash = true;
    P.tx = foe.pos.x; P.tz = foe.pos.z;
    f.yaw = Math.atan2(P.tx - f.pos.x, P.tz - f.pos.z);
    const wu = T.smashWindup * Math.min(1.3, P.k) + (f.isPlayer ? 0 : (W.match && W.match.state.defense === 0 ? T.rivalEasy : 0));
    P.wu = wu;
    W.anims.play(f, 'throw', { fade: 0.08, timeScale: 1, duration: wu / 0.4, commit: wu / 0.4 });
    const e = bus.ev(EV.POWER_TELEGRAPH);
    e.who = f.id; e.target = foe.id; e.power = 'building'; e.name = 'BUILDING'; e.dur = wu + 0.2; e.radius = foe.radius + 6; e.x = P.tx; e.z = P.tz;
    bus.emit(EV.POWER_TELEGRAPH);
    if (!f.isPlayer && ctx.ui && ctx.ui.warnIndicator) ctx.ui.warnIndicator(f, wu + 0.3);
  }
  /** The swing of a smash: from over the head (u 0) down onto where the foe stood (u 1). */
  function smashFrame(P, u, out) {
    const f = P.f, foe = f.opponent, s = u * u;
    carryFrame(P, out);
    if (s <= 0) return out;
    out.decompose(_v, _q, _w);
    const mid = P.flat ? 0 : P.h / 2;
    // the middle of the piece now, and where it ends: on the foe's head
    _w.set(0, mid, 0).applyQuaternion(_q).add(_v);
    _v.set(P.tx, (foe ? foe.height : 28) * 0.8, P.tz);
    _w.lerp(_v, s);
    // pitching forward as it comes down
    _q1.setFromAxisAngle(_X, s);
    _q0.setFromAxisAngle(_Y, f.yaw).multiply(_q1);
    if (!P.flat) { _q1.setFromAxisAngle(_Z, Math.PI / 2 * P.side); _q0.multiply(_q1); }
    _v.set(0, -mid, 0).applyQuaternion(_q0).add(_w);
    return out.compose(_v, _q0, _one);
  }
  function landSmash(P) {
    const f = P.f, foe = f.opponent;
    smashFrame(P, 1, _c);
    _w.set(0, P.flat ? 0 : P.h / 2, 0).applyMatrix4(_c);
    P.x = _w.x; P.y = _w.y; P.z = _w.z;
    P.vx = Math.sin(f.yaw); P.vz = Math.cos(f.yaw);
    f.setState('neutral'); f.armor = false;
    f.recover(0.55);
    if (f.isPlayer) f._syncGate();
    cd[f.id] = T.cooldown;
    const ok = foe && !foe.invuln && foe.invulnT <= 0 && foe.state !== 'ko' && !foe.held
      && Math.hypot(foe.pos.x - P.tx, foe.pos.z - P.tz) <= foe.radius + 6 && Math.hypot(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z) <= f.radius + foe.radius + T.smashReach;
    if (ok) hitFoe(P, foe, true);
    else crash(P, P.tx, 3, P.tz, false);
  }
  function startThrow(P) {
    const f = P.f, foe = f.opponent;
    if (smashable(P)) { startSmash(P); return; }
    P.phase = 'windup'; P.t = 0; P.smash = false;
    // aimed where the foe stands now: the tell is honest, a step aside beats it
    P.tx = foe.pos.x; P.tz = foe.pos.z;
    f.yaw = Math.atan2(P.tx - f.pos.x, P.tz - f.pos.z);
    // (a title match against the rival: a little longer to read it coming; a defense goes back to normal)
    const wu = T.windup * P.k + (f.isPlayer ? 0 : (W.match && W.match.state.defense === 0 ? T.rivalEasy : 0));
    P.wu = wu;
    W.anims.play(f, 'throw', { fade: 0.08, timeScale: 1, duration: wu / 0.4, commit: wu / 0.4 });
    const r = foe.radius + Math.max(P.b.w, P.b.d) * 0.5;
    const e = bus.ev(EV.POWER_TELEGRAPH);
    e.who = f.id; e.target = foe.id; e.power = 'building'; e.name = 'BUILDING'; e.dur = wu + 0.9; e.radius = r; e.x = P.tx; e.z = P.tz;
    bus.emit(EV.POWER_TELEGRAPH);
    if (!f.isPlayer && ctx.ui && ctx.ui.warnIndicator) ctx.ui.warnIndicator(f, wu + 0.6);
  }
  function release(P) {
    const f = P.f, foe = f.opponent;
    carryFrame(P, _c);
    _v.setFromMatrixPosition(_c);
    // its centre now (the frame is at its base)
    _w.set(0, P.h / 2, 0).applyMatrix4(_c);
    P.x = _w.x; P.y = _w.y; P.z = _w.z;
    const dx = P.tx - P.x, dz = P.tz - P.z, d = Math.hypot(dx, dz) || 1;
    const t = Math.min(T.tMax * P.k, Math.max(T.tMin, d / (T.speed / P.k))), y1 = 12;
    P.vx = dx / t; P.vz = dz / t; P.vy = (y1 - P.y + 0.5 * T.gravity * t * t) / t;
    P.eta = t; P.t = 0; P.phase = 'fly';
    P.yaw = f.yaw; P.spin = 0;
    f.setState('neutral'); f.armor = false;
    f.recover(0.45);
    if (f.isPlayer) f._syncGate();
    cd[f.id] = T.cooldown;
    const e = bus.ev(EV.PROP_THROW);
    e.who = f.id; e.target = foe.id; e.x = P.x; e.y = P.y; e.z = P.z; e.tx = P.tx; e.tz = P.tz; e.eta = t;
    bus.emit(EV.PROP_THROW);
    hooks.callout(P.chunk && P.name ? `${P.name.toUpperCase()} THROW!` : 'BUILDING THROW!', '', 'move', f.id);
  }
  /** It came down / hit something at (x, y, z): shatter. */
  function crash(P, x, y, z, hitFoe) {
    const f = P.f, lite = !!(ctx.quality && !ctx.quality.full);
    hide(P);
    P.on = false; P.phase = '';
    _v.set(x, Math.max(2, y), z);
    const w = ctx.world;
    if (w.spawnExplosion) { w.spawnExplosion(_v.clone(), 1.4); if (!lite) w.spawnExplosion(_v.clone().setY(_v.y + P.h * 0.3), 1.0); }
    if (w.spawnSmokeColumn) w.spawnSmokeColumn(_v.clone().setY(0), 26);
    if (ctx.fx && ctx.fx.dustBurst) ctx.fx.dustBurst(_v.clone().setY(0), 26, lite ? 8 : 14);
    if (ctx.shake) ctx.shake(1.3, 0.6);
    W.hitStop(hitFoe ? 0.16 : 0.1);
    // Whatever is under it (cars, crowd, a tank): the foe is the direct hit's, never splash
    _dmgOpt.src = f.id;
    const tw = W.rival.targetable;
    W.rival.targetable = false;
    ctx.damageInRadius(_v.set(x, 0, z), 18, 260, _dmgOpt);
    W.rival.targetable = tw;
    smashProps(x, z, 16, f);
    const e = bus.ev(EV.PROP_CRASH);
    e.who = f.id; e.x = x; e.y = y; e.z = z; e.h = P.h;
    bus.emit(EV.PROP_CRASH);
    if (!hitFoe) { hooks.say(pick(LINES.miss), 'hype'); hooks.pop('ooh', 0.7, x, z); }
  }
  /** Park throwables under something heavy coming down at (x, z) break into debris. */
  function smashProps(x, z, r, by) {
    const A = W.arena && W.arena.info, items = A && A.throwables ? A.throwables.items : null;
    if (!items) return;
    for (const it of items) {
      if (!it.alive || Math.hypot(it.x - x, it.z - z) > r + Math.max(it.w, it.d) / 2) continue;
      it.alive = false;
      it.im.setMatrixAt(it.idx, _zero); it.im.instanceMatrix.needsUpdate = true;
      _w.set(it.x, 3, it.z);
      if (ctx.world.spawnExplosion) ctx.world.spawnExplosion(_w.clone(), 0.8);
      if (ctx.fx && ctx.fx.dustBurst) ctx.fx.dustBurst(_w.clone().setY(0), 16, 6);
      if (by && by.isPlayer) ctx.addScore(300);
    }
  }
  function hitFoe(P, foe, smash = false) {
    const f = P.f;
    const blocked = foe.state === 'blocking' && foe.facing(f, 1.35);
    const dmg = (T.dmg + T.dmgPerH * Math.min(P.h, T.big.h)) * P.k * f.dmgMult * (smash ? T.smashDmg : 1);
    const dx = P.vx, dz = P.vz, l = Math.hypot(dx, dz) || 1;
    let dealt;
    if (blocked) {
      dealt = foe.applyDamage(dmg * T.chip, 'building', f.id, P.x, P.y, P.z, true);
      foe.spend(T.chipStam);
      foe.vel.x += dx / l * T.push; foe.vel.z += dz / l * T.push;
      if (foe.stamina <= 0 && foe._guardBreak) foe._guardBreak(f.id);
      hooks.say(pick(LINES.blocked), 'shock');
    } else {
      dealt = foe.applyDamage(dmg, 'building', f.id, P.x, P.y, P.z, false);
      if (foe.state !== 'ko') foe.knockDown(f.id, 'throw', 0.95, dx / l, dz / l, T.push);
      const what = P.name ? (P.chunk ? `WITH A PIECE OF ${P.name.toUpperCase()}` : `WITH ${P.name.toUpperCase()}`) : 'WITH A BUILDING';
      hooks.callout(smash ? 'OVER THE HEAD!' : 'DIRECT HIT!', what, 'landmark', f.id);
      hooks.say(pick(smash ? LINES.smash : LINES.hit), 'shock');
    }
    if (f.isPlayer) ctx.addScore(blocked ? 500 : 3000);
    f.gainMomentum(blocked ? 4 : 12);
    hooks.pop(blocked ? 'ooh' : 'pop', 1, P.x, P.z);
    const e = bus.ev(EV.PROP_HIT);
    e.who = f.id; e.target = foe.id; e.damage = dealt; e.blocked = blocked; e.x = P.x; e.y = P.y; e.z = P.z;
    bus.emit(EV.PROP_HIT);
    crash(P, P.x, P.y, P.z, true);
  }
  let sweepHit = null, sweepY = 0;
  function sweepVisit(b) { if (!sweepHit && b.h + 2 > sweepY && !b.fest && !b.isFence) sweepHit = b; }

  function fly(P, dt) {
    P.t += dt;
    const x0 = P.x, z0 = P.z;
    P.vy -= T.gravity * dt;
    P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt;
    P.spin += dt * 2.2;
    // Into the foe?
    const foe = P.f.opponent;
    if (foe && !foe.invuln && foe.invulnT <= 0 && foe.state !== 'ko' && !foe.held) {
      const r = foe.radius + Math.min(P.b.w, P.b.d) * 0.5 + 2;
      if (Math.hypot(P.x - foe.pos.x, P.z - foe.pos.z) < r && P.y < foe.height + P.h * 0.4) { hitFoe(P, foe); return; }
    }
    // Into a building on the way (it goes too), or the ground
    sweepHit = null; sweepY = P.y - P.h * 0.4;
    ctx.sweepBuildings(x0, z0, P.x, P.z, Math.min(P.b.w, P.b.d) * 0.4, sweepVisit);
    if (sweepHit) { ctx.collapseBuilding(sweepHit, P.f.id); crash(P, P.x, P.y, P.z, false); return; }
    if (P.y <= P.h * 0.25 || P.t > 4) { crash(P, P.x, 2, P.z, false); return; }
    // tumbling end over end along its flight
    _q.setFromAxisAngle(_Y, P.yaw);
    _q1.setFromAxisAngle(_X, P.spin);
    _q.multiply(_q1);
    _q1.setFromAxisAngle(_Z, Math.PI / 2 * P.side);
    _q.multiply(_q1);
    _v.set(0, -P.h / 2, 0).applyQuaternion(_q).add(_w.set(P.x, P.y, P.z));
    place(P, _c.compose(_v, _q, _one));
  }

  function tick(P, dt) {
    const f = P.f;
    if (P.phase === 'fly') { fly(P, dt); return; }
    // Held: a stagger, a knockdown, a grab or any big hit makes it fall
    const holding = f.state === 'attacking' && (f.move === P.move || P.phase === 'windup');
    if (!holding || f.held) { drop(P); return; }
    P.t += dt;
    if (P.phase === 'rip') {
      // rises out of its lot into the hands
      const u = smooth(P.t / T.rip);
      carryFrame(P, _c);
      _c.decompose(_v, _q1, _w);
      _q.slerpQuaternions(P.hq, _q1, u);
      _w.copy(P.hp).lerp(_v, u);
      place(P, _c.compose(_w, _q, _one));
      if (P.t >= T.rip) { P.phase = 'carry'; P.t = 0; }
      return;
    }
    if (P.phase === 'windup' && P.smash) {
      // over the head, then down: the swing is the last 45% of the wind-up
      place(P, smashFrame(P, Math.max(0, (P.t / P.wu - 0.55) / 0.45), _c));
      if (P.t >= P.wu) landSmash(P);
      return;
    }
    place(P, carryFrame(P, _c));
    if (P.phase === 'windup') { if (P.t >= P.wu) release(P); return; }
    if (P.t >= T.carryMax) startThrow(P); // arms give out: it goes anyway
  }

  return {
    TUNE: T,
    /** Before the fighters read their intents: rip / throw / keep the carrier's hands busy. True when it took f's intent. */
    pre(f, dt, girderNear) {
      if (cd[f.id] > 0) cd[f.id] -= dt;
      const P = props[f.id], it = f.intent, B = f._buf;
      if (P.on && P.phase !== 'fly') {
        // carrying: every attack button is the throw; nothing else
        const press = it.strike || it.heavy || it.grab || B.strike > 0 || B.heavy > 0 || B.grab > 0;
        it.strike = it.heavy = it.grab = it.taunt = it.block = false; it.finisher = false; it.power = '';
        B.strike = B.heavy = B.grab = 0;
        if (press && P.phase === 'carry') startThrow(P);
        // the rival walks its intent at carrying pace (the player's is game.js's, through the gate's steer)
        if (!f.isPlayer && P.phase !== 'rip' && !f.held) {
          const sp = f.cfg.stats.speed * 18 * P.move.steer;
          f.pos.x += it.moveX * sp * dt; f.pos.z += it.moveZ * sp * dt;
          if (it.faceYaw !== null && it.faceYaw !== undefined) f.yaw += Math.atan2(Math.sin(it.faceYaw - f.yaw), Math.cos(it.faceYaw - f.yaw)) * (1 - Math.exp(-5 * dt));
        }
        if (f.isPlayer) { const c = ctx.player.control; c.powers = false; c.ult = false; }
        return true;
      }
      if (P.on || cd[f.id] > 0 || !f.canAct || !(it.grab || B.grab > 0) || girderNear) return false;
      const foe = f.opponent;
      if (foe && (foe.state === 'downed' ? f.groundGap(foe) <= 18 : f.gapTo(foe) <= 9 && f.facing(foe, 1.0))) return false;
      const b = nearest(f, T.reach);
      if (!b) return false;
      it.grab = false; B.grab = 0;
      return rip(f, b) !== false;
    },
    update(dt) {
      if (dt <= 0) return;
      for (const id in props) if (props[id].on) tick(props[id], dt);
    },
    /** A fighter took a big hit (fighter damage event): drop what it carries. */
    onDamage(who, amount) { const P = props[who]; if (P.on && P.phase !== 'fly' && amount >= T.dropDmg) drop(P); },
    /** End of a fall / dispose: everything in the air or in hands shatters now. */
    clear() { for (const id in props) { const P = props[id]; if (P.on) { if (P.f && P.f.state === 'attacking' && P.f.move === P.move) P.f.setState('neutral'); if (P.f) P.f.armor = false; crash(P, P.phase === 'fly' ? P.x : P.f.pos.x, 2, P.phase === 'fly' ? P.z : P.f.pos.z, false); } cd[id] = 0; } },
    /** Nearest building f could rip up (within maxGap of its body's edge), or null (scratch result). */
    buildingNear(f, maxGap = 40) {
      const b = f ? nearest(f, maxGap) : null;
      if (!b) return null;
      nearRes.x = b.x; nearRes.z = b.z; nearRes.h = b.h; nearRes.dist = bestD; nearRes.b = b; nearRes.kind = b.isProp ? b.kind : 'building';
      // mode: 'whole' (lifted out of the ground) | 'snap' / 'bite' (a piece torn out of it); name: the landmark's, or ''
      nearRes.mode = b.isProp ? 'whole' : modeOf(b); nearRes.name = !b.isProp && ctx.landmarkName ? ctx.landmarkName(b) : '';
      return nearRes;
    },
    /** f's building in hand: { phase 'rip' | 'carry' | 'windup', t } or null (scratch result). */
    carrying(f) {
      const P = f ? props[f.id] : null;
      if (!P || !P.on || P.phase === 'fly') return null;
      carryRes.phase = P.phase; carryRes.t = P.t;
      // smash: the attack button would bring it down over the foe's head now; chunk: a torn piece; name: the landmark's
      carryRes.smash = P.phase === 'windup' ? P.smash : smashable(P); carryRes.chunk = !!P.chunk; carryRes.name = P.name;
      return carryRes;
    },
    /** A building in the air thrown by `by`'s foe at `by`... any building in flight: { x, y, z, vx, vz, tx, tz, eta (s left), by, r } or null. */
    flying(at) {
      for (const id in props) {
        const P = props[id];
        if (!P.on || P.phase !== 'fly' || (at && P.f.opponent !== at)) continue;
        flyRes.x = P.x; flyRes.y = P.y; flyRes.z = P.z; flyRes.vx = P.vx; flyRes.vz = P.vz; flyRes.tx = P.tx; flyRes.tz = P.tz;
        flyRes.eta = Math.max(0, P.eta - P.t); flyRes.by = id; flyRes.r = P.f.opponent.radius + Math.min(P.b.w, P.b.d) * 0.5 + 2;
        return flyRes;
      }
      return null;
    },
    smashProps,
    /** Seconds before f may rip up another. */
    cooldown(f) { return f ? Math.max(0, cd[f.id]) : 0; },
  };
}
