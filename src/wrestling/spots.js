// Fighting into Chicago: the city around the ring as wrestling set pieces.
//   - Landmark spots. A body thrown, slammed or whipped into one of them gets
//     its own payoff (spot:hit, a callout, the crowd, a slow-mo beat, an effect
//     and a small gameplay twist):
//       fountain  Buckingham Fountain, ringside: the basin, the jets surge
//       lake      Lake Michigan, past the runway: the wave
//       ltracks   the L on Wabash: the third rail (extra damage, slow to rise)
//       michigan  the Michigan Avenue street wall: through the towers, glass
//       bean      Cloud Gate (far north): bounces off it (grapple.js)
//   - Foreign objects: steel girders lying ringside and in the rubble of a
//     tower that came down. Grab next to one to rip it up, strike to swing it;
//     it breaks on its third hit. Dropped when its holder is knocked about.
// No referee, no count-out: an all-out match, falls count anywhere in the city.
// It reads both fighters and the grapple; it starts moves on a fighter only
// through the fighter's own entry points (_startMove, recover).
// OWNER: spots.
import * as THREE from 'three';
import { EV } from './events.js';
import { createProps } from './props.js';
import { createCarver } from './carve.js';

/** Tuning (exported for the AI and the balance sims). */
export const SPOTS_TUNE = {
  // set pieces
  spotCd: 3, fountainR: 15, lakeX: 70, railR: 7.5, railY: 3.2,
  bonus: { fountain: 5, lake: 0, ltracks: 9, michigan: 0, bean: 6 },
  mom: 5, score: 2000, zapDown: 1.0, zapT: 1.4,
  // foreign objects
  slots: 4, onGround: 3, pickGap: 12, pickT: 0.55, attachT: 0.28, hits: 3, spawnCd: 5, spawnR: 170, length: 28,
};
/** The weapon swing, as a MOVES entry (fighter.js frame data); the last hit always floors. */
export const WEAPON_MOVE = Object.freeze({ id: 'weapon', kind: 'weapon', combo: 1, anim: 'heavy', startup: 0.42, active: 0.14, recover: 0.5, dmg: 22, stam: 8, reach: 15, lunge: 6, stagger: 1.1, push: 52, impact: 0.85, mom: 6, blockStam: 22, hs: 0.14, high: true, kd: 'weak' });
const WEAPON_LAST = Object.freeze(Object.assign({}, WEAPON_MOVE, { impact: 1, hs: 0.18, kd: 'always' }));

const FOUNTAIN = { x: 29.5, z: 4.4 };
const BEAN_IDS = { mirrored_sculpture: 1, cloud_gate: 1 };
// The L's elevated lines near the ring (chicago_layout.json: South Side Elevated and the Loop's Van Buren leg)
const RAIL = [
  [[-88.2, -27.4], [-87.9, 12.8], [-91, 22.5], [-98.9, 36.3], [-100.5, 42], [-100.9, 48], [-99, 166.3], [-97.2, 214.5]],
  [[-91.5, -210.3], [-88.3, -34.3], [-88.4, -26.2], [-89.2, -24.2], [-90.7, -22.7], [-94.7, -21.5], [-120.7, -20.3], [-208.7, -18.9]],
];
const NAMES = { fountain: 'BUCKINGHAM FOUNTAIN', lake: 'LAKE MICHIGAN', ltracks: 'THE L', michigan: 'MICHIGAN AVENUE', bean: 'CLOUD GATE' };
const LINES = {
  fountain: ['Into Buckingham Fountain! Somebody check the warranty!', 'Making a splash in Grant Park!', 'The fountain show is OVER, folks!'],
  lake: ['Into Lake Michigan! That wave will reach Indiana!', 'Splashdown! Lake Shore Drive is under water!', 'Falls count anywhere: even in the lake!'],
  ltracks: ['Onto the L tracks! Six hundred volts!', 'The third rail! You can smell the ozone from here!', 'The Green Line is not running tonight!'],
  michigan: ['The Magnificent Mile, not so magnificent now!', 'Glass raining down on Michigan Avenue!', 'There goes the Michigan Avenue skyline!'],
  bean: ['Off the Bean! Not a dent in it!', 'Bounced off Cloud Gate! It saw its own reflection!'],
  weapon: ['{0} has a steel girder! No rules in Chicago tonight!', 'A foreign object! {0} ripped it right out of the rubble!', 'That is not legal in any state!'],
  weaponHit: ['Steel on hide! What a shot!', 'That girder is bent now!', 'No disqualifications, folks!'],
  weaponBreak: ['It snapped in half over {0}!', 'The girder is in pieces!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (s, a) => s.replace('{0}', a || '');
const DROP = { staggered: 1, stunned: 1, grappled: 1, grappling: 1, airborne: 1, downed: 1, pinned: 1, pinning: 1, ko: 1, cinematic: 1 };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const REST_P = -0.55, UP_P = 2.2, HIT_P = -0.25; // held girder pitch (rad): at rest, top of the wind-up, contact
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Distance from (x, z) to the L's elevated lines (u). */
function railDist(x, z) {
  let best = Infinity;
  for (const line of RAIL) {
    for (let i = 0; i + 1 < line.length; i++) {
      const ax = line[i][0], az = line[i][1], bx = line[i + 1][0], bz = line[i + 1][1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z, d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** @returns the W.spots runtime (see the members' comments) */
export function createSpots(ctx, W) {
  const T = SPOTS_TUNE;
  const bus = W.bus;
  let offs = [];
  let live = false;
  // ---- set pieces ----
  const spotCd = { fountain: 0, lake: 0, ltracks: 0, michigan: 0, bean: 0 };
  let fountainB = null, jets = null, surge = 0, fountainHp = 0;
  const zap = { player: 0, rival: 0 }, zapDown = { player: 0, rival: 0 }, zapFx = { player: 0, rival: 0 };
  const sched = [];  // delayed effect beats: { t, kind, x, y, z, s }
  for (let i = 0; i < 16; i++) sched.push({ t: -1, kind: '', x: 0, y: 0, z: 0, s: 0 });
  // ---- foreign objects ----
  const weapons = [];
  for (let i = 0; i < T.slots; i++) weapons.push({ id: i, kind: 'girder', state: 'off', x: 0, z: 0, yaw: 0, owner: null, hits: 0, dirty: true });
  const pick2 = { player: null, rival: null };  // pickup in progress: { w, t }
  const pickRec = { player: { w: null, t: 0 }, rival: { w: null, t: 0 } };
  let spawnCd = 0, mesh = null;
  // scratch results
  const spotRes = { id: '', name: '', x: 0, z: 0, dirX: 0, dirZ: 0, dist: 0 };
  const wRes = { id: 0, kind: '', x: 0, z: 0, dist: 0 };
  const armedRes = { id: 0, kind: '', hits: 0 };

  // Torn buildings (carve.js): pieces out of the ones too big to lift. Needs the real scene (the headless labs go without)
  const carve = ctx.scene && ctx.scene.isScene && ctx.collapseBuilding ? createCarver(ctx, W) : null;
  // Thrown buildings (props.js)
  const props = createProps(ctx, W, { callout: emitCallout2, say: (t, tone) => say(t, tone), pop: (k, i, x, z) => pop(k, i, x, z) });
  function emitCallout2(text, sub, tier, who) { if (tier === 'landmark') landmarkCall(text, sub, who); else emitCallout(text, sub, tier, who); }
  function resetThrowables() { const A = W.arena && W.arena.info; if (A && A.throwables && A.throwables.reset) A.throwables.reset(); }
  const phase = () => (W.match && W.match.state ? W.match.state.phase : '');
  const fighters = () => (W.player && W.rival ? [W.player, W.rival] : null);

  // Landmark callouts one at a time: a second set piece within CALL_GAP waits its turn (Michigan Ave -> the third rail)
  const CALL_GAP = 1.1;
  let callT = 0;
  const last = { id: '', x: 0, z: 0, t: 0 }; // the set piece that just fired: its landing's other callouts are its own
  const callQ = { on: false, text: '', sub: '', tier: '', who: '' };
  function landmarkCall(text, sub, who) {
    if (callT > 0) { callQ.on = true; callQ.text = text; callQ.sub = sub; callQ.tier = 'landmark'; callQ.who = who; return; }
    callT = CALL_GAP;
    emitCallout(text, sub, 'landmark', who);
  }
  function emitCallout(text, sub, tier, who) {
    const e = bus.ev(EV.CALLOUT);
    e.text = text; e.sub = sub || ''; e.tier = tier; e.who = who || '';
    bus.emit(EV.CALLOUT);
  }
  function say(text, tone) {
    const e = bus.ev(EV.COMMENTARY);
    e.text = text; e.tone = tone || 'hype';
    bus.emit(EV.COMMENTARY);
  }
  function pop(kind, impact, x, z) {
    const e = bus.ev(EV.CROWD_POP);
    e.kind = kind; e.impact = impact; e.x = x; e.z = z;
    bus.emit(EV.CROWD_POP);
  }
  function later(t, kind, x, y, z, s) {
    for (const q of sched) if (q.t < 0) { q.t = t; q.kind = kind; q.x = x; q.y = y; q.z = z; q.s = s; return; }
  }
  const phone = () => !!(ctx.quality && !ctx.quality.full);

  // ------------------------------------------------------------------ classification
  /** Which set piece a point on the ground belongs to ('' = none). */
  function spotAt(x, z) {
    if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < T.fountainR) return 'fountain';
    if (x > T.lakeX && ctx.isWater(x, z)) return 'lake';
    if (railDist(x, z) < T.railR) return 'ltracks';
    return '';
  }
  /** Which set piece a building is part of ('' = none). */
  function spotOf(b) {
    if (!b) return '';
    if (b === fountainB || b.landmarkId === 'buckingham_fountain') return 'fountain';
    if (b.landmarkId && BEAN_IDS[b.landmarkId]) return 'bean';
    if (!b.fest && !b.isFence && b.h >= 10 && b.x > -78 && b.x < -56 && b.z > -130 && b.z < 270) return 'michigan';
    return '';
  }

  // ------------------------------------------------------------------ set pieces
  /** Fire set piece `id`: V is the body, by the fighter who sent it. */
  function fire(id, V, by, type, impact, x, y, z, b) {
    if (!id || !V || spotCd[id] > 0 || phase() === 'over' || phase() === 'between') return false;
    spotCd[id] = T.spotCd;
    last.id = id; last.x = x; last.z = z; last.t = 0.4;
    const name = id === 'michigan' && b && ctx.landmarkName(b) ? ctx.landmarkName(b).toUpperCase() : NAMES[id];
    const e = bus.ev(EV.SPOT_HIT);
    e.who = V.id; e.by = by ? by.id : ''; e.spot = id; e.name = name; e.type = type || ''; e.impact = impact; e.x = x; e.y = y; e.z = z;
    bus.emit(EV.SPOT_HIT);
    // The callout, the crowd, a beat of slow motion
    const sub = by ? by.name : '';
    if (id === 'fountain') landmarkCall('INTO BUCKINGHAM FOUNTAIN!', sub, by ? by.id : '');
    else if (id === 'lake') landmarkCall('INTO LAKE MICHIGAN!', sub, by ? by.id : '');
    else if (id === 'ltracks') landmarkCall('ONTO THE THIRD RAIL!', 'THE L · 600 VOLTS', by ? by.id : '');
    else if (id === 'michigan') landmarkCall(name === NAMES.michigan ? 'THROUGH MICHIGAN AVENUE!' : `THROUGH THE ${name}!`, name === NAMES.michigan ? sub : 'MICHIGAN AVENUE', by ? by.id : '');
    else if (id === 'bean') landmarkCall('OFF THE BEAN!', 'CLOUD GATE', by ? by.id : '');
    say(pick(LINES[id]), 'shock');
    pop('pop', 1, x, z);
    W.slowMo(0.4, 0.45, 1);
    if (by) {
      by.gainMomentum(T.mom);
      if (by.isPlayer) ctx.addScore(T.score);
    }
    const bonus = T.bonus[id] || 0;
    if (bonus > 0 && V.state !== 'ko') V.applyDamage(bonus * (by ? by.atkMult : 1), 'building', by ? by.id : 'env', x, Math.max(4, y), z, false);
    // Its own effect: vfx.js draws the set piece from spot:hit; here only the gameplay side and the level's own splashes
    const lite = phone();
    if (id === 'fountain') {
      surge = 1;
      for (let i = 0; i < (lite ? 2 : 4); i++) later(0.12 * i, 'splash', FOUNTAIN.x + (Math.random() - 0.5) * 10, 0, FOUNTAIN.z + (Math.random() - 0.5) * 10, 3);
    } else if (id === 'lake') {
      const n = lite ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, r = 18 + (i % 2) * 8;
        later(0.08 + 0.06 * i, 'splash', x + Math.cos(a) * r, 0, z + Math.sin(a) * r, 2);
      }
    } else if (id === 'ltracks') {
      if (V.state === 'downed') V.stateDur += T.zapDown; else zapDown[V.id] = 1.5;
    }
    return true;
  }
  function runSched(dt) {
    const w = ctx.world;
    for (const q of sched) {
      if (q.t < 0) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      q.t = -1;
      if (q.kind === 'splash') ctx.fx.waterImpact(q.x, q.z, q.s, 'stomp');
    }
  }

  /** The Bean bounces a flying body off itself (grapple.js smash): returns the share of speed kept. */
  function bounce(f, b, speed) {
    let nx = f.x - b.x, nz = f.z - b.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const vn = f.vx * nx + f.vz * nz;
    if (vn >= 0) return 1; // already leaving it
    f.vx = (f.vx - 2 * vn * nx) * 0.8; f.vz = (f.vz - 2 * vn * nz) * 0.8;
    f.yaw = Math.atan2(f.vx, f.vz);
    if (f.mode === 'air') f.vy = Math.max(f.vy, 12);
    const V = f.V, by = f.by;
    V.applyDamage((T.bonus.bean + speed * 0.04) * (by ? by.atkMult : 1), 'post', by ? by.id : 'env', f.x, Math.max(6, f.y), f.z, false);
    W.hitStop(0.12);
    f.impact = Math.min(1, f.impact + 0.3);
    fire('bean', V, by, f.type, 0.8, f.x, Math.max(6, f.y), f.z, b);
    return 1;
  }

  // ------------------------------------------------------------------ foreign objects
  function setGround(w, x, z, yaw) {
    w.state = 'ground'; w.x = x; w.z = z; w.yaw = yaw; w.owner = null; w.dirty = true;
  }
  function placeInitial() {
    for (const w of weapons) { w.state = 'off'; w.owner = null; w.hits = 0; w.dirty = true; }
    const A = W.arena && W.arena.info;
    if (!A) return;
    // Two lie under the ring apron from the bell, north and south, between the ropes and the front row
    setGround(weapons[0], A.cx - 14, A.cz - A.half - 4.5, 0.06);
    setGround(weapons[1], A.cx + 16, A.cz + A.half + 4.5, -0.05);
  }
  function emitW(name, w, who, x, y, z) {
    const e = bus.ev(name);
    if ('who' in e) e.who = who || '';
    e.id = w.id; e.kind = w.kind;
    if ('hits' in e) e.hits = w.hits;
    e.x = x; e.z = z;
    if ('y' in e) e.y = y;
    bus.emit(name);
  }
  /** f's weapon or null. */
  function heldBy(f) { for (const w of weapons) if (w.state === 'held' && w.owner === f) return w; return null; }
  function drop(w) {
    const f = w.owner;
    if (!f) return;
    const y = f.yaw;
    setGround(w, f.pos.x + Math.sin(y) * (f.radius + 4), f.pos.z + Math.cos(y) * (f.radius + 4), y + Math.PI / 2);
    if (ctx.isWater(w.x, w.z) && ctx.waterDepth && ctx.waterDepth(w.x, w.z) > 0.5) w.state = 'off'; // it sinks
    w.dirty = true;
    emitW(EV.WEAPON_DROP, w, f.id, w.x, 0, w.z);
  }
  function breakW(w, target) {
    const f = w.owner;
    hand(f, _a);
    w.state = 'off'; w.owner = null; w.hits = 0; w.dirty = true;
    const e = bus.ev(EV.WEAPON_BREAK);
    e.who = f ? f.id : ''; e.target = target || ''; e.id = w.id; e.kind = w.kind; e.x = _a.x; e.y = _a.y; e.z = _a.z;
    bus.emit(EV.WEAPON_BREAK);
    if (f) { say(fmt(pick(LINES.weaponBreak), f.opponent ? f.opponent.name : ''), 'shock'); pop('ooh', 0.8, _a.x, _a.z); }
  }
  /** World position of f's weapon hand. */
  function hand(f, out) {
    if (!f) return out.set(0, 10, 0);
    const b = f.bones && (f.bones.handR || f.bones.handL);
    if (b) return b.getWorldPosition(out);
    const y = f.yaw;
    return out.set(f.pos.x + Math.sin(y) * f.radius, f.pos.y + 18, f.pos.z + Math.cos(y) * f.radius);
  }
  function nearestGround(f, maxGap) {
    let best = null, bd = maxGap;
    for (const w of weapons) {
      if (w.state !== 'ground') continue;
      const d = Math.hypot(w.x - f.pos.x, w.z - f.pos.z) - f.radius;
      if (d <= bd) { bd = d; best = w; }
    }
    return best;
  }
  function claimed(w) { return (pick2.player && pick2.player.w === w) || (pick2.rival && pick2.rival.w === w); }

  // Read a fighter's intent before the fighter does: pick up, swing
  function preFighter(f, dt) {
    const it = f.intent, B = f._buf, P = pick2[f.id];
    if (P) {
      // Ripping it up
      P.t += dt;
      if (f.state !== 'attacking' || f.held) { pick2[f.id] = null; return; }
      if (P.t >= T.attachT && P.w.state === 'ground') {
        const w = P.w;
        w.state = 'held'; w.owner = f; w.hits = T.hits; w.dirty = true;
        pick2[f.id] = null;
        hand(f, _a);
        emitW(EV.WEAPON_PICKUP, w, f.id, _a.x, _a.y, _a.z);
        emitCallout('FOREIGN OBJECT!', 'STEEL GIRDER', 'move', f.id);
        say(fmt(pick(LINES.weapon), f.name), 'shock');
        pop(f.isPlayer ? 'pop' : 'boo', 0.7, f.pos.x, f.pos.z);
      }
      return;
    }
    if (phase() !== 'fight') return;
    // A building in its hands (props.js) takes every button; next to one, a grab rips it up (a girder in reach wins)
    if (props.pre(f, dt, !!heldBy(f) || !!nearestGround(f, T.pickGap))) return;
    if (!f.canAct) return;
    const foe = f.opponent, w = heldBy(f);
    const foeDown = foe && foe.state === 'downed' && !foe.held;
    if (w) {
      // Armed: a strike or a heavy is the swing (a downed foe still gets stomped, a grab drops it)
      const press = it.strike || it.heavy || B.strike > 0 || B.heavy > 0;
      if (press && !(foeDown && f.groundGap(foe) <= 12)) {
        it.strike = false; it.heavy = false; B.strike = 0; B.heavy = 0;
        f._startMove(w.hits <= 1 ? WEAPON_LAST : WEAPON_MOVE);
        return;
      }
      if (it.grab && foe && !foeDown && f.gapTo(foe) <= 9 && f.facing(foe, 1.0)) drop(w);
      return;
    }
    if (!(it.grab || B.grab > 0)) return;
    // A grab with the foe out of reach, next to a girder: rip it up
    if (foe && (foeDown ? f.groundGap(foe) <= 18 : f.gapTo(foe) <= 9 && f.facing(foe, 1.0))) return;
    const g = nearestGround(f, T.pickGap);
    if (!g || claimed(g)) return;
    it.grab = false; B.grab = 0;
    const rec = pickRec[f.id];
    rec.w = g; rec.t = 0;
    pick2[f.id] = rec;
    f.yaw = Math.atan2(g.x - f.pos.x, g.z - f.pos.z);
    f.recover(T.pickT);
    W.anims.play(f, 'grab_reach', { fade: 0.1, timeScale: 1, duration: T.pickT, commit: T.pickT });
  }

  function updateWeapons(dt) {
    if (spawnCd > 0) spawnCd -= dt;
    for (const w of weapons) {
      if (w.state !== 'held') continue;
      const f = w.owner;
      if (!f || !f.root || DROP[f.state] || f.held) { if (f && f.state !== 'ko') drop(w); else { w.state = 'off'; w.owner = null; w.dirty = true; } }
    }
  }
  function drawWeapons() {
    if (!mesh) return;
    let any = false;
    for (const w of weapons) {
      if (w.state === 'held') {
        const f = w.owner;
        hand(f, _a);
        // Pitch over the fist: dragged forward-down at rest; a swing hauls it up over the shoulder, then brings it down on the foe
        let p = REST_P;
        const m = f.move;
        if (f.state === 'attacking' && m && m.kind === 'weapon') {
          const t = f.stateT;
          if (t < m.startup) p = REST_P + (UP_P - REST_P) * smooth(t / m.startup);
          else if (t < m.startup + m.active) p = UP_P + (HIT_P - UP_P) * ((t - m.startup) / m.active);
          else p = HIT_P + (REST_P - HIT_P) * smooth((t - m.startup - m.active) / m.recover);
        }
        const y = f.yaw, c = Math.cos(p);
        _v.set(Math.sin(y) * c, Math.sin(p), Math.cos(y) * c);
        _q.setFromUnitVectors(_X, _v);
        _a.addScaledVector(_v, T.length * 0.5 - 3);
        _m.compose(_a, _q, _s);
        mesh.setMatrixAt(w.id, _m);
        any = true;
      } else if (w.dirty) {
        if (w.state === 'ground') {
          _q.setFromAxisAngle(_Y, w.yaw);
          _a.set(w.x, 1.0, w.z);
          _m.compose(_a, _q, _s);
          mesh.setMatrixAt(w.id, _m);
        } else mesh.setMatrixAt(w.id, _zero);
        any = true;
      }
      w.dirty = false;
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ events
  function subscribe() {
    const on = (n, fn) => offs.push(bus.on(n, fn));
    on(EV.MATCH_START, () => { placeInitial(); resetThrowables(); });
    on(EV.FALL_START, () => { props.clear(); resetThrowables(); zap.player = zap.rival = 0; zapDown.player = zapDown.rival = 0; for (const w of weapons) if (w.state === 'held') { w.owner = null; w.state = 'off'; w.dirty = true; } });
    on(EV.BUILDING_IMPACT, (e) => {
      const id = spotOf(e.building);
      if (id === 'michigan') fire(id, W[e.who], W[e.by], e.type, 0.9, e.x, e.y, e.z, e.building);
    });
    // a body coming down on a park throwable (a semi, a tower) flattens it
    on(EV.THROW_LAND, (e) => { props.smashProps(e.x, e.z, 10, W[e.who] || null); });
    on(EV.THROW_LAND, (e) => {
      // (the landing point is the torso; the root, at the hips, counts too: a body across the basin's rim is in it)
      const V = W[e.target];
      let id = spotAt(e.x, e.z), x = e.x, z = e.z;
      if (!id && V) { id = spotAt(V.pos.x, V.pos.z); x = V.pos.x; z = V.pos.z; }
      if (!id && V) { V.center(_w); id = spotAt(_w.x, _w.z); x = _w.x; z = _w.z; } // (the hips bone: where the body visibly is)
      if (id) fire(id, V, W[e.who], e.type, e.impact, x, 4, z, null);
    });
    on(EV.KNOCKDOWN, (e) => {
      if (e.cause !== 'strike' && e.cause !== 'power') return;
      const id = spotAt(e.x, e.z);
      if (id && (e.impact || 0) >= 0.4) fire(id, W[e.who], W[e.by] || null, '', e.impact, e.x, 4, e.z, null);
    });
    on(EV.BUILDING_DESTROYED, (e) => {
      if (carve) carve.onDestroyed(e.building);
      // A tower down near the fight leaves a girder in the rubble
      if (spawnCd > 0 || e.h < 10 || !e.building || e.building.fest || e.building.isFence) return;
      const A = W.arena && W.arena.info;
      if (A && Math.hypot(e.x - A.cx, e.z - A.cz) > T.spawnR) return;
      let ground = 0, slot = null;
      for (const w of weapons) { if (w.state === 'ground') ground++; else if (w.state === 'off' && !slot) slot = w; }
      if (!slot || ground >= T.onGround) return;
      const x = e.x + (Math.random() - 0.5) * 6, z = e.z + (Math.random() - 0.5) * 6;
      if (ctx.isWater(x, z)) return;
      spawnCd = T.spawnCd;
      setGround(slot, x, z, Math.random() * Math.PI);
      emitW(EV.WEAPON_SPAWN, slot, '', x, 0, z);
    });
    on(EV.DAMAGE, (e) => props.onDamage(e.who, e.amount));
    on(EV.FALL_END, () => props.clear());
    const hit = (e) => {
      if (e.kind !== 'weapon') return;
      const w = heldBy(W[e.who]);
      if (!w) return;
      w.hits--;
      if (e.event === EV.STRIKE_LANDED && w.hits > 0) say(pick(LINES.weaponHit), 'hype');
      if (w.hits <= 0) breakW(w, e.target);
    };
    on(EV.STRIKE_LANDED, hit);
    on(EV.STRIKE_BLOCKED, hit);
  }

  const api = {
    TUNE: T,
    /** Torn buildings (carve.js), or null without a real scene: kind(b, limits), tear(b, f), wounds(). */
    carve,
    /** Thrown buildings (props.js): the nearest building f could rip up (gap from its body's edge <= maxGap) { x, z, h, dist } or null. */
    buildingNear(f, maxGap = 40) { return props.buildingNear(f, maxGap); },
    /** f's building in hand { phase 'rip' | 'carry' | 'windup', t } or null. */
    carrying(f) { return props.carrying(f); },
    /** A building in the air thrown at `at` (or any, without it): { x, y, z, vx, vz, tx, tz, eta, by, r } or null. */
    flying(at) { return props.flying(at); },
    /** Seconds before f may rip up another building. */
    buildingCooldown(f) { return props.cooldown(f); },
    /** The foreign objects (read-only): { id, kind, state 'off' | 'ground' | 'held', x, z, owner, hits }. */
    weapons,
    /** The landmark set piece f could throw its foe into from here, or null (scratch result). */
    bestSpot(f, maxDist = 110) {
      const p = f.pos;
      let best = '', bd = maxDist, bx = 0, bz = 0;
      const cand = (id, x, z) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = id; bx = x; bz = z; } };
      cand('fountain', FOUNTAIN.x, FOUNTAIN.z);
      cand('lake', Math.max(T.lakeX + 14, p.x + 14), p.z);
      // the L: the nearest point on its lines
      let rd = Infinity, rx = 0, rz = 0;
      for (const line of RAIL) for (let i = 0; i + 1 < line.length; i++) {
        const ax = line[i][0], az = line[i][1], dx = line[i + 1][0] - ax, dz = line[i + 1][1] - az, l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((p.x - ax) * dx + (p.z - az) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const x = ax + dx * t, z = az + dz * t, d = Math.hypot(x - p.x, z - p.z);
        if (d < rd) { rd = d; rx = x; rz = z; }
      }
      cand('ltracks', rx, rz);
      if (p.x > -56 && p.z > -100 && p.z < 240) cand('michigan', -64, p.z);
      if (!best) return null;
      spotRes.id = best; spotRes.name = NAMES[best]; spotRes.x = bx; spotRes.z = bz; spotRes.dist = bd;
      spotRes.dirX = bd > 0 ? (bx - p.x) / bd : 0; spotRes.dirZ = bd > 0 ? (bz - p.z) / bd : 1;
      return spotRes;
    },
    /** Nearest foreign object lying on the ground within maxDist of f's body edge, or null (scratch result). */
    nearestWeapon(f, maxDist = 40) {
      const w = f ? nearestGround(f, maxDist) : null;
      if (!w || claimed(w)) return null;
      wRes.id = w.id; wRes.kind = w.kind; wRes.x = w.x; wRes.z = w.z; wRes.dist = Math.hypot(w.x - f.pos.x, w.z - f.pos.z) - f.radius;
      return wRes;
    },
    /** f's foreign object { id, kind, hits } or null (scratch result). */
    armed(f) {
      const w = f ? heldBy(f) : null;
      if (!w) return null;
      armedRes.id = w.id; armedRes.kind = w.kind; armedRes.hits = w.hits;
      return armedRes;
    },
    /** The set piece a ground point belongs to ('' = none): match.js leaves those callouts to spots. */
    claims(x, z) { return spotAt(x, z) || (last.t > 0 && Math.hypot(x - last.x, z - last.z) < 32 ? last.id : ''); },
    /** The set piece a building is part of ('' = none). */
    building(b) { return spotOf(b); },
    bounce,
    /** Before the fighters read their intents this frame (index.js, after the AI). */
    pre(dt) {
      if (!live || !W.player) return;
      preFighter(W.player, dt); preFighter(W.rival, dt);
    },
    start() {
      live = true;
      for (const off of offs) off();
      offs = [];
      const A = W.arena && W.arena.info;
      mesh = A && A.weapons ? A.weapons.mesh : null;
      fountainB = null; jets = null; surge = 0;
      if (ctx.forEachBuildingNear) ctx.forEachBuildingNear(FOUNTAIN.x, FOUNTAIN.z, 6, (b) => { if (b.landmarkId === 'buckingham_fountain') fountainB = b; });
      if (fountainB && fountainB.group) jets = fountainB.group.getObjectByName('Buckingham Fountain plaza and gardens') || null;
      // The fountain is a set piece for the whole match: granite that every landing next to it would otherwise flatten
      if (fountainB && !fountainB.destroyed) { fountainHp = fountainB.hp; fountainB.maxHp = fountainB.hp = 1e9; }
      for (const k in spotCd) spotCd[k] = 0;
      callT = 0; callQ.on = false;
      for (const q of sched) q.t = -1;
      zap.player = zap.rival = 0; zapDown.player = zapDown.rival = 0;
      pick2.player = pick2.rival = null; spawnCd = 0;
      placeInitial();
      subscribe();
      drawWeapons();
    },
    update(dt, dtReal) {
      if (!live || !W.player) return;
      for (const k in spotCd) if (spotCd[k] > 0) spotCd[k] -= dt;
      if (last.t > 0) last.t -= dtReal;
      if (callT > 0) { callT -= dtReal; if (callT <= 0 && callQ.on) { callQ.on = false; landmarkCall(callQ.text, callQ.sub, callQ.who); } }
      runSched(dt);
      updateWeapons(dt);
      props.update(dt);
      if (carve) carve.update(dt);
      // The third rail: slow to rise (vfx.js draws the arcs)
      for (const id of ['player', 'rival']) {
        const f = W[id];
        if (zapDown[id] > 0) { zapDown[id] -= dt; if (f.state === 'downed') { f.stateDur += T.zapDown; zapDown[id] = 0; } }
      }
      // The fountain's jets surge after a splash
      if (jets) {
        if (surge > 0) surge = Math.max(0, surge - dtReal / 2.2);
        const k = 1 + 2.6 * Math.sin(Math.min(1, (1 - surge) * 6) * Math.PI / 2) * surge;
        if (jets.scale.y !== k) jets.scale.y = k;
      }
      drawWeapons();
      void dtReal;
    },
    updateIdle() { drawWeapons(); },
    dispose() {
      live = false;
      for (const off of offs) off();
      offs = [];
      props.clear(); resetThrowables();
      if (carve) carve.dispose();
      if (jets) jets.scale.y = 1;
      if (fountainB && fountainHp > 0) { fountainB.maxHp = fountainHp; fountainB.hp = Math.min(fountainB.hp, fountainHp); }
      jets = null; fountainB = null; fountainHp = 0;
      for (const w of weapons) { w.state = 'off'; w.owner = null; w.dirty = true; }
      // Back to the two ringside girders for whoever comes next
      placeInitial();
      drawWeapons();
      pick2.player = pick2.rival = null;
    },
  };
  return api;
}
