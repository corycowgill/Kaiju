// Match director: entrances, bell, best-of-three falls, pin / KO resolution,
// between-fall corner advice, win / loss, title defenses, military run-ins,
// and the crowd-heat, callout, commentary and prompt cues the presentation
// modules listen for.
// OWNER: combat core.
//
// Flow: start() -> 'entrance' (skippable) -> bell -> 'fight' <-> 'pin' /
// 'finisher' -> pin:fall -> fall:end -> 'between' (winner poses, both back to
// their corners, ctx.offerUpgrades) -> bell -> ... -> 'over' -> ctx.gameOver.
// After a win the HUD's DEFEND THE TITLE button sets W.input.ui.defend:
// ctx.continueRun(), W.swapRival(the other kaiju), a harder match, the score
// carries on. A knockout is a fall too: the winner walks over and covers for
// a three count that cannot be kicked out of.
import { EV } from './events.js';

/** Match tuning. */
export const MATCH = {
  bestOf: 3,
  hpBase: 150, hpStat: 0.45, // match health = hpBase + hpStat x the kaiju's stats.hp (226 / 249 / 267: character, not a mismatch)
  rivalHp: 1.1,           // x that for the rival (the player has its powers on tap and a human's reads)
  rivalHpPerDefense: 0.2,
  rivalAtk: 0.85, rivalAtkPerFall: 0.1, rivalAtkPerDefense: 0.15, rivalAtkMax: 1.7,
  healBetween: 0.35, healFloor: 0.75, momCarry: 20, // between falls: +35% of max health, at least 75%; momentum carried over is capped
  koWait: 1.5, koRun: 2.0, fallHold: 1.4, betweenPose: 2.2, winHold: 4.5, loseHold: 3.5,
  interferenceAt: [50, 40, 34], interferenceJitter: 12, interferenceLen: 22, interferenceEta: 4,
  scoreFall: 2500, scoreMatch: 10000,
  stallDist: 48, stallAfter: 6, stallMom: 6, stallSpeed: 1.45, // keeping away: after 6 s beyond 48 u the crowd turns, the rival's meter fills and it closes faster
};
const ENT = { rise: 2.2, roar: 2.2, card: 2.4, walk: 3.0, pEnd: 3.6, rivalWalk: 3.4, pose: 0.2, card2: 0.4, rEnd: 1.8, bell: 1.2 };
const MOVE_NAME = { whip: 'IRISH WHIP', suplex: 'SUPLEX', slam: 'GORILLA PRESS', swing: 'GIANT SWING' };
const LINES = {
  bell: ['And here we go!', 'The bell rings in Grant Park!', 'Chicago, are you ready?'],
  strike: ['Big right hand!', 'What a shot!', 'That rattled the skyline!'],
  reversal: ['Reversal! Beautifully timed!', 'Read it all the way!', 'Countered!'],
  whip: ['Off the ropes...', 'Sent for the ride!', 'Irish whip across the ring!'],
  suplex: ['Up and over!', 'Suplex! The whole Loop felt that!', 'Dropped on the back of the head!'],
  slam: ['Press slam!', 'Up overhead... and DOWN!', 'Military press!'],
  swing: ['Around and around!', 'The giant swing! How many turns?', 'Somebody stop the ride!'],
  building: ['Right through the building!', 'There goes the property value!', 'Call the insurance company!', 'That one was load-bearing!'],
  landmark: ['NOT THE {0}!', 'They will be rebuilding the {0} for years!', 'Through the {0}! Good grief!'],
  ropes: ['The ropes are straining!', 'Slingshot off the cables!'],
  snap: ['The ropes are gone! Falls count anywhere!', 'Steel cable, snapped like thread!'],
  water: ['Into Lake Michigan!', 'Splashdown!', 'That wave will reach Indiana!'],
  crowd: ['Into the crowd! Look out!', 'The front row is running!'],
  down: ['Down goes {0}!', '{0} is on the mat!'],
  pin: ['Cover! Is this it?', 'Hooks the leg!', 'Shoulders down!'],
  kickout: ['Kick out!', 'Not yet!', 'Shoulder up!'],
  near: ['SO close! Two and nine tenths!', 'How did {0} kick out of THAT?', 'I thought that was three!'],
  taunt: ['Playing to the crowd!', '{0} wants to hear it, Chicago!'],
  tauntHit: ['Showboating will cost you!', 'Never turn your back on a kaiju!'],
  momentum: ['{0} is fired up!', 'The momentum is with {0}!'],
  finisher: ['This could be it! {1}!', 'Here it comes... {1}!'],
  power: ['{1}!', '{0} unleashes the {1}!'],
  critical: ['{0} is in real trouble!', '{0} is running on fumes!'],
  tired: ['{0} is gassed!', '{0} has nothing left in the tank!'],
  military: ['The military is storming the ring!', 'Here comes the cavalry. Nobody invited them!'],
  ko: ['{0} is OUT COLD!', 'Lights out for {0}!'],
  fall: ['One fall to {0}!', '{0} takes the fall!'],
  stall: ['{0} wants no part of this!', 'The crowd is letting {0} hear it!', 'You cannot win a title running, {0}!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (s, a, b) => s.replace('{0}', a || '').replace('{1}', b || '');

/** @returns {{ state, start, update, updateIdle, gameOverText, end, dispose }} */
export function createMatch(ctx, W) {
  /** Live match state (read-only for other modules; HUD polls it). */
  const s = { phase: 'idle', fall: 0, playerFalls: 0, rivalFalls: 0, bestOf: MATCH.bestOf, time: 0, defense: 0, winner: '', by: '', difficulty: 0 };
  const bus = W.bus;
  const offs = [];
  // sequencing
  let seq = '', seqT = 0, entStage = 0, entShort = false, crashed = false;
  let koT = 0, koRunT = -1, picked = false, reported = false, swapping = false, fallT = 0;
  let intAt = 0, intState = 0, intT = 0;
  let stallT = 0, booT = 0;
  // director
  let heat = 0.25, heatWas = 0.25, heatT = 0, lineT = 0, promptT = 0;
  const prompts = { grab: false, pickup: false, pin: false, kickout: false, escape: false, finisher: false, skip: false, getup: false };
  const corner = { px: 0, pz: 0, rx: 0, rz: 0 };
  const ent = { x0: 0, x1: 0, z: 0, py: 0 };

  function setPhase(phase) {
    if (phase === s.phase) return;
    const e = bus.ev(EV.MATCH_PHASE);
    e.phase = phase; e.prev = s.phase;
    s.phase = phase;
    bus.emit(EV.MATCH_PHASE);
    W.player._syncGate();
  }
  function bell(kind, rings) {
    const e = bus.ev(EV.BELL);
    e.kind = kind; e.rings = rings;
    bus.emit(EV.BELL);
  }
  function camCue(shot, who, dur) {
    const e = bus.ev(EV.CAM_CUE);
    e.shot = shot; e.who = who || ''; e.dur = dur || 0;
    bus.emit(EV.CAM_CUE);
  }
  function callout(text, tier, who, sub) {
    const e = bus.ev(EV.CALLOUT);
    e.text = text; e.tier = tier || 'move'; e.who = who || ''; e.sub = sub || '';
    bus.emit(EV.CALLOUT);
  }
  function pop(kind, impact, x, z) {
    heat = Math.min(1, heat + impact * 0.35);
    const e = bus.ev(EV.CROWD_POP);
    e.kind = kind; e.impact = impact; e.x = x; e.z = z;
    bus.emit(EV.CROWD_POP);
  }
  // One ticker line at a time; `force` for the lines that must not be lost
  function say(key, tone, a, b, force) {
    if (lineT > 0 && !force) return;
    lineT = 2.6;
    const e = bus.ev(EV.COMMENTARY);
    e.text = fmt(pick(LINES[key]), a, b); e.tone = tone || 'neutral';
    bus.emit(EV.COMMENTARY);
  }
  function prompt(id, show) {
    if (prompts[id] === show) return;
    prompts[id] = show;
    const e = bus.ev(EV.PROMPT);
    e.id = id; e.show = show;
    bus.emit(EV.PROMPT);
  }
  function hidePrompts() { for (const id in prompts) prompt(id, false); }
  const nameOf = (id) => (W[id] ? W[id].name : '');
  const beat = (who, name, t) => {
    const f = W[who], e = bus.ev(EV.ENTRANCE_BEAT);
    e.who = who; e.beat = name; e.t = t; e.x = f.pos.x; e.y = f.pos.y; e.z = f.pos.z;
    bus.emit(EV.ENTRANCE_BEAT);
  };

  function corners() {
    const A = W.arena && W.arena.info;
    const cx = A ? A.cx : W.rival.pos.x + 20, cz = A ? A.cz : W.rival.pos.z, h = A ? A.half : 42;
    corner.px = cx + h * 0.45; corner.pz = cz; corner.rx = cx - h * 0.45; corner.rz = cz;
  }
  // Under the director's hand: nobody else moves it
  function direct(f, anim) {
    f.held = true; f.invuln = true;
    f.vel.set(0, 0, 0);
    f.setState('cinematic', 0, null);
    if (anim) W.anims.play(f, anim); else W.anims.stop(f, 0.3);
  }
  function freeFighter(f) {
    f.held = false; f.invuln = false;
    f.root.rotation.x = 0; f.root.rotation.z = 0;
    f.setState('neutral');
  }
  function toCorners(healed) {
    corners();
    const p = W.player, r = W.rival;
    p.reset(corner.px, corner.pz, -Math.PI / 2);
    r.reset(corner.rx, corner.rz, Math.PI / 2);
    if (healed) for (const f of [p, r]) {
      f.hp = Math.min(f.maxHp, Math.max(f.hp + f.maxHp * MATCH.healBetween, f.maxHp * MATCH.healFloor));
      f.momentum = Math.min(f.momentum, MATCH.momCarry);
    }
  }
  function tuneRival() {
    const r = W.rival;
    s.difficulty = 0.25 * s.defense + 0.12 * Math.max(0, s.fall - 1);
    r.atkMult = Math.min(MATCH.rivalAtkMax, MATCH.rivalAtk + MATCH.rivalAtkPerFall * Math.max(0, s.fall - 1) + MATCH.rivalAtkPerDefense * s.defense);
  }

  // ------------------------------------------------------------------ match / fall
  function beginMatch() {
    const p = W.player, r = W.rival;
    s.fall = 0; s.playerFalls = 0; s.rivalFalls = 0; s.time = 0; s.winner = ''; s.by = '';
    reported = false; picked = false; koT = 0; koRunT = -1; intState = 0;
    W.grapple.clear(); W.grapple.resetRopes();
    ctx.rules.passiveRage = false; // momentum is earned (the fighter adds its own trickle)
    if (s.defense === 0) p.maxHp = Math.round(MATCH.hpBase + MATCH.hpStat * p.cfg.stats.hp); // (health upgrades add to it from here)
    p.hp = p.maxHp;
    const hp = Math.round((MATCH.hpBase + MATCH.hpStat * r.cfg.stats.hp) * MATCH.rivalHp * (1 + MATCH.rivalHpPerDefense * s.defense));
    r.maxHp = hp; r.hp = hp;
    p.momentum = Math.min(p.momentum, 50); r.momentum = 0;
    tuneRival();
    const e = bus.ev(EV.MATCH_START);
    e.playerKey = p.key; e.rivalKey = r.key; e.playerName = p.name; e.rivalName = r.name; e.bestOf = s.bestOf; e.defense = s.defense;
    bus.emit(EV.MATCH_START);
    startEntrance();
  }
  function startEntrance() {
    const p = W.player, r = W.rival, A = W.arena && W.arena.info;
    corners();
    setPhase('entrance');
    seq = 'entrance'; seqT = 0; entStage = 0; crashed = false;
    // A champion already standing in the ring (a title defense) only watches the challenger come
    entShort = s.defense > 0;
    const bd = ctx.world.bounds;
    ent.z = corner.rz;
    ent.x0 = Math.max(bd ? bd.minX + 25 : -1e9, corner.rx - 130); ent.x1 = corner.rx;
    direct(p, entShort ? null : 'entrance'); direct(r, null);
    r.crushes = true;
    if (entShort) { p.root.position.set(corner.px, 0, corner.pz); p.yaw = -Math.PI / 2; }
    else { ent.py = -22; p.root.position.y = ent.py; }
    r.root.position.set(ent.x0, 0, ent.z); r.root.rotation.set(0, Math.PI / 2, 0);
    r.root.visible = entShort; // the challenger is not in shot until its music hits
    prompt('skip', true);
    if (entShort) rivalEntrance(); else {
      const e = bus.ev(EV.ENTRANCE_START);
      e.who = 'player'; e.key = p.key; e.name = p.name;
      bus.emit(EV.ENTRANCE_START);
      camCue('entrance', 'player', ENT.pEnd);
      beat('player', 'rise', 0);
    }
    void A;
  }
  function rivalEntrance() {
    const r = W.rival, p = W.player;
    entStage = 10; seqT = 0;
    if (!entShort) {
      const e = bus.ev(EV.ENTRANCE_END);
      e.who = 'player';
      bus.emit(EV.ENTRANCE_END);
      // Off camera: the player is in its corner when the shot comes back
      p.root.position.set(corner.px, 0, corner.pz); p.yaw = -Math.PI / 2; p.root.rotation.set(0, -Math.PI / 2, 0);
      W.anims.stop(p, 0.2);
    }
    r.root.visible = true;
    W.anims.play(r, 'entrance');
    const e = bus.ev(EV.ENTRANCE_START);
    e.who = 'rival'; e.key = r.key; e.name = r.name;
    bus.emit(EV.ENTRANCE_START);
    camCue('entrance', 'rival', ENT.rivalWalk + ENT.rEnd);
    beat('rival', 'walk', 0);
  }
  function crashVisit(b) {
    if (b.destroyed) return;
    ctx.collapseBuilding(b, 'rival');
    if (!crashed && b.h >= 5 && !b.isFence) { crashed = true; beat('rival', 'crash', seqT); }
  }
  function updateEntrance(dt) {
    const p = W.player, r = W.rival;
    seqT += dt;
    if (W.input.ui.skip && entStage < 20) {
      bus.ev(EV.ENTRANCE_SKIP); bus.emit(EV.ENTRANCE_SKIP);
      if (entStage < 10 && !entShort) { const e = bus.ev(EV.ENTRANCE_END); e.who = 'player'; bus.emit(EV.ENTRANCE_END); }
      const e = bus.ev(EV.ENTRANCE_END); e.who = 'rival'; bus.emit(EV.ENTRANCE_END);
      r.root.visible = true;
      startFall(true);
      return;
    }
    if (entStage < 10) {
      // The player: up out of the lake, a roar for the city, then wading in
      const u = Math.min(1, seqT / ENT.rise), e = u * u * (3 - 2 * u);
      p.root.position.y = ent.py * (1 - e) - p.sink * e;
      p._wade(dt);
      if (entStage === 0 && seqT >= ENT.roar) { entStage = 1; W.anims.play(p, 'taunt_a'); beat('player', 'roar', seqT); }
      if (entStage === 1 && seqT >= ENT.card) { entStage = 2; beat('player', 'namecard', seqT); }
      if (entStage === 2 && seqT >= ENT.walk) { entStage = 3; W.anims.play(p, 'entrance'); beat('player', 'walk', seqT); }
      if (entStage === 3) { const y = p.root.rotation.y; p.root.position.x += Math.sin(y) * 20 * dt; p.root.position.z += Math.cos(y) * 20 * dt; }
      if (seqT >= ENT.pEnd) rivalEntrance();
      return;
    }
    if (entStage === 10) {
      // The challenger: in from the Loop, through whatever is in the way
      const u = Math.min(1, seqT / ENT.rivalWalk), x0 = r.pos.x;
      const x = ent.x0 + (ent.x1 - ent.x0) * u;
      ctx.sweepBuildings(x0, ent.z, x + 4, ent.z, r.collideRadius + 2, crashVisit);
      r.root.position.set(x, -(r.waterSink || 0), ent.z);
      if (u >= 1) {
        entStage = 11; seqT = 0;
        W.anims.stop(r, 0.3);
        beat('rival', 'arrive', ENT.rivalWalk);
      }
      return;
    }
    if (entStage === 11 && seqT >= ENT.pose) { entStage = 12; W.anims.play(r, 'taunt_b'); beat('rival', 'pose', ENT.rivalWalk + seqT); }
    if (entStage === 12 && seqT >= ENT.card2) { entStage = 13; beat('rival', 'namecard', ENT.rivalWalk + seqT); }
    if (entStage === 13 && seqT >= ENT.rEnd) {
      entStage = 20; seqT = 0;
      const e = bus.ev(EV.ENTRANCE_END);
      e.who = 'rival';
      bus.emit(EV.ENTRANCE_END);
      camCue('bell', '', ENT.bell);
      W.anims.stop(r, 0.3); W.anims.stop(p, 0.3);
    }
    if (entStage === 20 && seqT >= ENT.bell) startFall(true);
  }

  function startFall(first) {
    const p = W.player, r = W.rival;
    prompt('skip', false);
    s.fall++;
    W.grapple.clear();
    if (first) {
      // From the entrance: keep vitals, just put both in their corners
      const php = p.hp, rhp = r.hp, pm = p.momentum;
      toCorners(false);
      p.hp = php; r.hp = rhp; p.momentum = pm;
    }
    p.kickouts = 0; r.kickouts = 0; p._critical = false; r._critical = false;
    freeFighter(p); freeFighter(r);
    tuneRival();
    fallT = 0; koT = 0; koRunT = -1; seq = ''; stallT = 0; booT = 0; r.speedMult = 1;
    intState = 0;
    intAt = (MATCH.interferenceAt[Math.min(2, s.fall - 1)] || 40) + Math.random() * MATCH.interferenceJitter;
    setPhase('fight');
    const e = bus.ev(EV.FALL_START);
    e.fall = s.fall; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls;
    bus.emit(EV.FALL_START);
    bell('start', 1);
    camCue('', '', 0);
    say('bell', 'hype', '', '', true);
    heat = Math.max(heat, 0.6);
  }

  function onFall(winner, by) {
    const loser = winner === 'player' ? 'rival' : 'player';
    if (winner === 'player') s.playerFalls++; else s.rivalFalls++;
    s.winner = winner; s.by = by;
    const need = Math.floor(s.bestOf / 2) + 1;
    const decided = s.playerFalls >= need || s.rivalFalls >= need;
    let e = bus.ev(EV.FALL_END);
    e.fall = s.fall; e.winner = winner; e.loser = loser; e.by = by; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls;
    bus.emit(EV.FALL_END);
    hidePrompts();
    endInterference();
    if (winner === 'player') ctx.addScore(MATCH.scoreFall);
    pop(winner === 'player' ? 'pop' : 'boo', 1, W[winner].pos.x, W[winner].pos.z);
    if (!decided) {
      bell('fall', 2);
      say('fall', 'hype', nameOf(winner), '', true);
      setPhase('between');
      seq = 'fallHold'; seqT = 0;
      return;
    }
    setPhase('over');
    bell('end', 3);
    e = bus.ev(EV.MATCH_OVER);
    e.winner = winner; e.loser = loser; e.by = by; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls; e.time = s.time; e.defense = s.defense;
    bus.emit(EV.MATCH_OVER);
    const name = winner === 'player' ? EV.MATCH_WON : EV.MATCH_LOST;
    e = bus.ev(name);
    e.by = by; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls; e.time = s.time; e.defense = s.defense;
    bus.emit(name);
    if (winner === 'player') {
      ctx.addScore(Math.round(MATCH.scoreMatch * (1 + 0.5 * s.defense)));
      callout(s.defense > 0 ? 'AND STILL...' : 'AND NEW...', 'result', 'player', `${W.player.name} · CHICAGO HEAVYWEIGHT CHAMPION`);
    } else callout(s.defense > 0 ? 'AND NEW...' : 'AND STILL...', 'result', 'rival', `${W.rival.name} · CHICAGO HEAVYWEIGHT CHAMPION`);
    W.slowMo(0.3, 0.9);
    seq = 'overHold'; seqT = 0;
  }

  function celebrate(winner, anim) {
    const f = W[winner];
    W.grapple.clear();
    // Up off the cover, beside the body
    const o = f.opponent;
    if (f.state === 'pinning' || f.root.rotation.x !== 0) {
      o.mid(_p);
      const y = o.root.rotation.y + Math.PI / 2, d = f.radius + 10;
      f.root.position.set(_p.x + Math.sin(y) * d, -f.sink, _p.z + Math.cos(y) * d);
      f.root.rotation.set(0, y + Math.PI, 0);
      if (f.isPlayer) ctx.player.yaw = f.root.rotation.y;
    }
    direct(f, anim);
    o.held = true; o.invuln = true; // the loser stays where it fell
  }

  function updateSeq(dt, dtReal) {
    seqT += dtReal;
    switch (seq) {
      case 'fallHold':
        if (seqT >= MATCH.fallHold) { seq = 'betweenPose'; seqT = 0; celebrate(s.winner, 'taunt_a'); camCue('between', s.winner, MATCH.betweenPose); }
        break;
      case 'betweenPose':
        if (seqT >= MATCH.betweenPose) {
          seq = 'advice'; seqT = 0; picked = false;
          ctx.military.clear();
          toCorners(true);
          direct(W.player, null); direct(W.rival, null);
          // Corner advice: the upgrade pick (pauses the sim; the pick calls back)
          ctx.offerUpgrades(onPicked);
        }
        break;
      case 'advice':
        if (picked) startFall(false);
        break;
      case 'overHold':
        if (seqT >= MATCH.fallHold) {
          seq = 'over'; seqT = 0;
          celebrate(s.winner, 'taunt_win');
          camCue(s.winner === 'player' ? 'win' : 'lose', s.winner, 0);
        }
        break;
      case 'over':
        if (!reported && seqT >= (s.winner === 'player' ? MATCH.winHold : MATCH.loseHold)) {
          reported = true;
          ctx.gameOver(s.winner === 'player', api.gameOverText(s.winner === 'player'));
        }
        break;
      default: break;
    }
  }
  function onPicked() { picked = true; }

  // A knockout: the one left standing walks over and covers
  function updateKO(dt) {
    const p = W.player, r = W.rival, g = W.grapple;
    const loser = p.state === 'ko' ? p : r.state === 'ko' ? r : null;
    if (!loser || g.pin.active) return;
    const win = loser.opponent;
    if (koRunT < 0) {
      if (g.active && !win.held) { /* the body is still travelling */ }
      koT += dt;
      if (koT < MATCH.koWait || g.fin.active || g.hold.active || loser.held || loser.falling > 0) return;
      if (win.held && win.state !== 'cinematic') return;
      if (win.state === 'ko') return;
      koRunT = 0;
      hidePrompts();
      direct(win, null);
      win.glb.play('run', 0.2);
    }
    koRunT += dt;
    loser.mid(_p);
    const dx = _p.x - win.pos.x, dz = _p.z - win.pos.z, d = Math.hypot(dx, dz);
    const reach = win.radius + 10;
    if (d > reach && koRunT < MATCH.koRun) {
      const step = Math.min(d - reach, 95 * dt);
      win.root.position.x += dx / d * step; win.root.position.z += dz / d * step;
      win.root.rotation.y = Math.atan2(dx, dz);
      win._wade(dt);
      win.root.position.y = -win.sink;
      return;
    }
    if (d > reach + 2) { win.root.position.x = _p.x - dx / d * reach; win.root.position.z = _p.z - dz / d * reach; }
    if (win.isPlayer) ctx.player.yaw = win.root.rotation.y;
    win.held = false; win.invuln = false;
    win.state = 'neutral';
    loser.held = false;
    if (!g.startPin(win, loser, true)) { win.held = true; win.invuln = true; win.state = 'cinematic'; }
  }

  // ------------------------------------------------------------------ interference
  function updateInterference(dt) {
    if (intState === 0) {
      if (fallT < intAt - MATCH.interferenceEta) return;
      intState = 1;
      const kind = s.fall % 3 === 1 ? 'tanks' : s.fall % 3 === 2 ? 'helis' : 'mixed';
      const e = bus.ev(EV.INTERFERENCE_WARN);
      e.kind = kind; e.eta = MATCH.interferenceEta;
      bus.emit(EV.INTERFERENCE_WARN);
      say('military', 'shock', '', '', true);
    } else if (intState === 1) {
      if (fallT < intAt) return;
      intState = 2; intT = 0;
      const kind = s.fall % 3 === 1 ? 'tanks' : s.fall % 3 === 2 ? 'helis' : 'mixed';
      const A = W.arena && W.arena.info;
      _spawn.x = A ? A.cx : W.player.pos.x; _spawn.z = A ? A.cz : W.player.pos.z;
      let n = 0;
      const extra = Math.min(2, s.defense);
      // Half for each kaiju: nobody's friend
      const send = (unit, count) => {
        _spawn.target = 'player'; n += ctx.military.spawn(unit, Math.ceil(count / 2), _spawn) || 0;
        _spawn.target = 'rival'; n += ctx.military.spawn(unit, Math.floor(count / 2), _spawn) || 0;
      };
      if (kind !== 'helis') send('tank', kind === 'mixed' ? 2 : 3 + extra);
      if (kind !== 'tanks') send('heli', kind === 'mixed' ? 2 : 3 + extra);
      const e = bus.ev(EV.INTERFERENCE_ARRIVE);
      e.kind = kind; e.count = n; e.x = _spawn.x; e.z = _spawn.z;
      bus.emit(EV.INTERFERENCE_ARRIVE);
    } else if (intState === 2) {
      intT += dt;
      if (intT >= MATCH.interferenceLen || (intT > 3 && ctx.military.count === 0)) endInterference();
    }
  }
  function endInterference() {
    if (intState !== 2) { if (intState === 1) intState = 3; return; }
    intState = 3;
    ctx.military.clear();
    bus.ev(EV.INTERFERENCE_END);
    bus.emit(EV.INTERFERENCE_END);
  }

  // Running away costs: the crowd boos, the rival's momentum builds and it runs you down
  function updateStall(dt) {
    const p = W.player, r = W.rival;
    const apart = !p.held && !r.held && r.state === 'neutral' && (p.state === 'neutral' || p.state === 'blocking') && p.distTo(r) > MATCH.stallDist;
    if (!apart) { if (stallT > 0) { stallT = 0; r.speedMult = 1; } return; }
    stallT += dt;
    if (stallT < MATCH.stallAfter) return;
    r.speedMult = MATCH.stallSpeed;
    r.gainMomentum(MATCH.stallMom * dt);
    booT -= dt;
    if (booT <= 0) { booT = 4; pop('boo', 0.6, p.pos.x, p.pos.z); say('stall', 'neutral', nameOf('player'), '', true); }
  }

  // ------------------------------------------------------------------ director: prompts, heat
  function updatePrompts() {
    const p = W.player, g = W.grapple, fight = s.phase === 'fight';
    const foe = p.opponent;
    const fin = fight && g.canFinisher(p);
    prompt('finisher', fin);
    const ground = fight && p.can('pickup');
    prompt('pickup', ground); prompt('pin', ground);
    prompt('grab', fight && !ground && p.canAct && foe.hittable && p.gapTo(foe) <= 9 && p.facing(foe, 1.0));
    prompt('kickout', g.pin.active && g.pin.V === p && !g.pin.forced && !g.pin.done);
    prompt('escape', g.hold.active && g.hold.V === p && !g.hold.locked);
    prompt('getup', fight && p.state === 'downed' && !p.held && p.falling <= 0);
  }

  function listen() {
    const on = (name, fn) => offs.push(bus.on(name, fn));
    on(EV.PIN_START, (e) => {
      setPhase('pin');
      pop('gasp', 0.6, W[e.who].pos.x, W[e.who].pos.z);
      say('pin', 'hype', '', '', true);
    });
    on(EV.PIN_COUNT, (e) => { pop('count', 0.4 + e.count * 0.2, W[e.who].pos.x, W[e.who].pos.z); });
    on(EV.PIN_KICKOUT, (e) => {
      if (s.phase === 'pin') setPhase('fight');
      pop(e.near ? 'ooh' : 'pop', e.near ? 1 : 0.5, W[e.who].pos.x, W[e.who].pos.z);
      if (e.near) { callout('NEAR FALL!', 'move', e.who, '2.9!'); say('near', 'shock', nameOf(e.who), '', true); }
      else say('kickout', 'neutral', nameOf(e.who));
    });
    on(EV.PIN_BROKEN, () => { if (s.phase === 'pin') setPhase('fight'); });
    on(EV.PIN_FALL, (e) => onFall(e.who, e.forced ? 'ko' : 'pin'));
    on(EV.FINISHER_START, (e) => {
      setPhase('finisher');
      callout(e.name, 'finisher', e.who, nameOf(e.who));
      pop(e.who === 'player' ? 'pop' : 'gasp', 1, W[e.who].pos.x, W[e.who].pos.z);
      say('finisher', 'hype', nameOf(e.who), e.name, true);
    });
    on(EV.FINISHER_IMPACT, (e) => pop('pop', 1, e.x, e.z));
    on(EV.FINISHER_END, () => { if (s.phase === 'finisher') setPhase('fight'); });
    on(EV.KO, (e) => { koT = 0; koRunT = -1; pop('gasp', 1, e.x, e.z); say('ko', 'shock', nameOf(e.who), '', true); });
    on(EV.STRIKE_LANDED, (e) => {
      heat = Math.min(1, heat + e.impact * 0.12);
      if (e.kind === 'clothesline') { callout(e.counter ? 'REBOUND CLOTHESLINE!' : 'CLOTHESLINE!', 'move', e.who); pop('pop', 0.7, e.x, e.z); }
      else if (e.kind === 'splash') { callout('DIVING SPLASH!', 'move', e.who); pop('pop', 0.8, e.x, e.z); }
      else if (e.impact >= 0.4) { pop('ooh', e.impact * 0.6, e.x, e.z); say('strike', 'neutral'); }
    });
    on(EV.STRIKE_REVERSED, (e) => { callout('REVERSAL!', 'move', e.who); pop('pop', 0.7, e.x, e.z); say('reversal', 'hype', '', '', true); });
    on(EV.GRAB_REVERSED, (e) => { callout('REVERSAL!', 'move', e.who); pop('pop', 0.7, W[e.who].pos.x, W[e.who].pos.z); say('reversal', 'hype', '', '', true); });
    on(EV.BLOCK_BROKEN, (e) => { callout('GUARD BREAK!', 'move', e.by); pop('gasp', 0.5, W[e.who].pos.x, W[e.who].pos.z); });
    on(EV.GRAB_MOVE, (e) => {
      if (!MOVE_NAME[e.type]) return;
      callout(MOVE_NAME[e.type], 'move', e.who);
      say(e.type, 'neutral');
      heat = Math.min(1, heat + 0.1);
    });
    on(EV.BUILDING_IMPACT, (e) => {
      if (e.name) {
        callout(`THROUGH THE ${e.name.toUpperCase()}!`, 'landmark', e.by, e.count > 1 ? `${e.count} BUILDINGS` : '');
        pop('pop', 1, e.x, e.z);
        say('landmark', 'shock', e.name.toUpperCase(), '', true);
      } else {
        if (e.count >= 2) callout(`THROUGH ${e.count} BUILDINGS!`, 'move', e.by);
        pop('ooh', Math.min(1, 0.5 + e.count * 0.15), e.x, e.z);
        say('building', 'hype');
      }
    });
    on(EV.THROW_LAND, (e) => {
      pop(e.impact > 0.6 ? 'pop' : 'ooh', e.impact, e.x, e.z);
      if (e.surface === 'water') { callout('INTO LAKE MICHIGAN!', 'move', e.who); say('water', 'hype', '', '', true); }
      else if (e.surface === 'crowd') { callout('INTO THE CROWD!', 'move', e.who); say('crowd', 'shock', '', '', true); }
    });
    on(EV.KNOCKDOWN, (e) => { if (e.cause === 'strike' || e.cause === 'power') say('down', 'hype', nameOf(e.who)); });
    on(EV.ROPE_REBOUND, (e) => { pop('ooh', 0.4, e.x, e.z); say('ropes', 'neutral'); });
    on(EV.ROPE_SNAP, (e) => { callout('THE ROPES SNAP!', 'move', ''); pop('gasp', 0.9, e.x, e.z); say('snap', 'shock', '', '', true); });
    if (EV.POST_IMPACT) on(EV.POST_IMPACT, (e) => { if (e.toppled) callout('THE CORNER POST IS DOWN!', 'move', ''); pop('gasp', 0.7, e.x, e.z); });
    on(EV.TAUNT_START, (e) => { pop(e.who === 'player' ? 'pop' : 'boo', 0.4, W[e.who].pos.x, W[e.who].pos.z); say('taunt', 'neutral', nameOf(e.who)); });
    on(EV.TAUNT_COMPLETE, (e) => pop(e.who === 'player' ? 'chant' : 'boo', 0.6, W[e.who].pos.x, W[e.who].pos.z));
    on(EV.TAUNT_INTERRUPTED, () => say('tauntHit', 'shock', '', '', true));
    on(EV.MOMENTUM_FULL, (e) => { pop(e.who === 'player' ? 'chant' : 'boo', 0.8, W[e.who].pos.x, W[e.who].pos.z); say('momentum', 'hype', nameOf(e.who), '', true); });
    on(EV.POWER_FIRED, (e) => { callout(e.name, 'move', e.who); say('power', 'hype', nameOf(e.who), e.name); });
    on(EV.POWER_HIT, (e) => { if (!e.blocked) pop('ooh', e.impact, e.x, e.z); });
    on(EV.HP_CRITICAL, (e) => say('critical', 'shock', nameOf(e.who), '', true));
    on(EV.STAMINA_EMPTY, (e) => say('tired', 'neutral', nameOf(e.who)));
    on(EV.CROWD_CRUSHED, (e) => pop('gasp', Math.min(1, e.count / 12), e.x, e.z));
  }

  const api = {
    state: s,
    start() {
      s.defense = 0; swapping = false;
      heat = 0.25; heatWas = 0.25; heatT = 0; lineT = 0; promptT = 0;
      for (const id in prompts) prompts[id] = false;
      s.phase = 'idle';
      listen();
      beginMatch();
    },
    update(dt, dtReal) {
      if (swapping) return;
      if (lineT > 0) lineT -= dtReal;
      if (s.phase === 'entrance') updateEntrance(dt);
      else if (s.phase === 'fight' || s.phase === 'pin' || s.phase === 'finisher') {
        s.time += dt; fallT += dt;
        if (s.phase === 'fight') { updateInterference(dt); updateStall(dt); }
        updateKO(dt);
      } else if (s.phase === 'between' || s.phase === 'over') updateSeq(dt, dtReal);
      // Prompts and crowd heat a few times a second
      promptT -= dtReal;
      if (promptT <= 0) { promptT = 0.12; updatePrompts(); }
      heat += (0.25 - heat) * Math.min(1, dtReal * 0.12);
      heatT -= dtReal;
      if (heatT <= 0) {
        heatT = 0.25;
        const e = bus.ev(EV.CROWD_INTENSITY);
        e.level = heat; e.trend = Math.max(-1, Math.min(1, (heat - heatWas) * 8));
        heatWas = heat;
        bus.emit(EV.CROWD_INTENSITY);
      }
    },
    updateIdle(dtReal) {
      if (swapping) return;
      // Corner advice calls back while paused; the result screen's DEFEND THE TITLE button arrives here
      if (reported && s.winner === 'player' && s.phase === 'over' && W.input.ui && W.input.ui.defend) api.defend();
    },
    /** Title defense: the same run goes on against the other kaiju, harder. */
    defend() {
      if (swapping || s.phase !== 'over' || s.winner !== 'player') return false;
      const keys = Object.keys(ctx.MONSTERS || {}).filter((k) => k !== W.player.key && k !== W.rival.key);
      const key = keys[0];
      if (!key || !W.swapRival) return false;
      if (ctx.continueRun && reported) ctx.continueRun();
      swapping = true;
      hidePrompts();
      W.grapple.clear();
      s.phase = 'idle';
      Promise.resolve(W.swapRival(key)).then((r) => {
        swapping = false;
        if (!r || !W.running) return;
        s.defense++;
        const p = W.player;
        p.held = false; p.invuln = false;
        toCorners(false);
        beginMatch();
      }, (err) => { swapping = false; console.error('[wrestling] title defense: rival load failed', err); });
      return true;
    },
    /** Result-screen strings (game.js asks for these if the run ends some other way, e.g. __qa.gameOver). */
    gameOverText(victory) {
      const falls = `${s.playerFalls} - ${s.rivalFalls}`;
      const def = s.defense > 0 ? ` · ${s.defense} TITLE DEFENSE${s.defense > 1 ? 'S' : ''}` : '';
      return victory
        ? { title: s.defense > 0 ? 'AND STILL...' : 'AND NEW...', subtitle: `${W.player.name} · CHICAGO HEAVYWEIGHT CHAMPION${def}`, waveLabel: 'Falls Won', waveValue: falls, keepPose: true }
        : { title: `${W.rival.name} WINS`, subtitle: s.defense > 0 ? `The title changes hands after ${s.defense} defense${s.defense > 1 ? 's' : ''}` : `${W.rival.name} retains the Chicago Heavyweight title`, waveLabel: 'Falls Won', waveValue: falls, keepPose: true };
    },
    /** QA: end the current fall now as a win for 'player' or 'rival' (through the normal fall path). */
    end(winner) {
      if (s.phase !== 'fight' && s.phase !== 'pin' && s.phase !== 'entrance') return;
      if (s.phase === 'entrance') startFall(true);
      W.grapple.clear();
      onFall(winner, 'pin');
    },
    /** QA: skip straight to the bell. */
    skipEntrance() { if (s.phase === 'entrance') { W.rival.root.visible = true; startFall(true); } },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      if (W.rival) W.rival.root.visible = true;
      s.phase = 'idle'; seq = ''; swapping = false;
    },
  };
  return api;
}
const _p = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const _spawn = { x: 0, z: 0, rMin: 120, rMax: 170, target: 'player' };
