// The broadcast booth: two announcers calling the match, captioned and voiced.
//   Mike Brannigan  play-by-play, the straight man: calls it as it is and backs the faces.
//   Sterling Vance  colour: backs the heels, makes their excuses, needles Mike.
// The lines are data (commentaryLines.js, built from tools/vo/script/*.txt by tools/vo/build.mjs);
// each is tagged with a topic and with conditions on who is doing what to whom (the kaiju, their
// alignment from roster.js, the match-up, a landmark, a move). This module listens to the match's
// events, turns each into a topic and the facts of the moment, picks the most specific line that
// has not been used lately, and plays it: a `commentary` event for the HUD's caption and the
// recorded voice through ctx.audio. One line (or one exchange) at a time: a bigger moment cuts a
// smaller one off, a smaller one waits briefly or is dropped. With nothing happening the booth
// banters. No audio file (or audio off): the caption alone, timed by its length.
// OWNER: commentary.
import { EV } from './events.js';
import { VO_LINES } from './commentaryLines.js';
import { alignOf, matchup } from './roster.js';

export const BOOTH = Object.freeze({
  M: Object.freeze({ id: 'mike', name: 'MIKE BRANNIGAN', tag: 'BRANNIGAN' }),
  V: Object.freeze({ id: 'vance', name: 'STERLING VANCE', tag: 'VANCE' }),
});
/** Tuning. Priorities: 0 banter, 1 routine, 2 notable, 3 big, 4 must be heard. */
export const VO_TUNE = {
  gap: 0.35, gapAfterExchange: 0.7,   // s of air after a line / after an exchange
  hold: { 0: 0, 1: 0.9, 2: 1.8, 3: 3.2, 4: 6 }, // s a line of that priority waits for the booth to be free before it is stale
  banterAfter: [8, 14],               // s of quiet before the booth fills it
  lateAudio: 0.5,                     // s: a voice file that arrives later than this after its caption is not played
  perChar: 0.062, minDur: 1.1,        // caption-only timing
  routine: { strike: 0.4, block: 0.2, whiff: 0.3, grab: 0.3, ropes: 0.35, power_hit: 0.4, bldg_down: 0.2 }, // chance a routine event is called at all
};
const SIG_ID = { 'TYRANT CHOKESLAM': 'chokeslam', 'LOOP BULLDOZER': 'bulldozer', 'STORM HURRICANRANA': 'rana', 'SKYFALL DDT': 'ddt', 'CIRCUIT BREAKER': 'breaker', 'SYSTEM CRASH': 'piledriver' };
const AI_TOPIC = { cheap: 'ai.cheap', stomp: 'ai.stomp', work: 'ai.work', dive: 'ai.dive', ropes: 'ai.ropes', lazy: 'pin.lazy', guardFire: 'ai.guard', noSell: 'ai.nosell' };
const lmKey = (id) => (id || '').replace(/_(rear|twin|\d)$/, '');

/** @returns {{ start, update, updateIdle, dispose, say, enabled, debug }} */
export function createCommentary(ctx, W) {
  const T = VO_TUNE, bus = W.bus, audio = ctx.audio;
  const byTopic = new Map();
  for (const row of VO_LINES) { let a = byTopic.get(row[0]); if (!a) byTopic.set(row[0], a = []); a.push(row); }
  const used = new Map();            // topic -> Set of rows used since it last ran dry
  let offs = [], live = false;
  let cur = null;                    // { row, i, t, prio, src }
  let pend = null;                   // { topics, f, prio, exp, sticky }
  const later = [];                  // must-say lines waiting their turn in order (the intro, the fall, the result)
  let gapT = 0, idleT = 0, idleAt = 10, clock = 0, lastRing = -99, voiceOn = true;
  const cand = [], weight = [], cues = [];
  const stats = { said: 0, dropped: 0, cut: 0, voiced: 0, late: 0, topics: {} };

  // ---- the facts of the moment ----
  const keyOf = (id) => (W[id] ? W[id].key : '');
  function facts(a, v, extra) {
    const pk = keyOf('player'), rk = keyOf('rival');
    const f = { a: '', v: '', aa: '', va: '', mu: matchup(pk, rk), pair: [pk, rk].sort().join('+'), lm: '', m: '' };
    if (a) { f.a = keyOf(a); f.aa = alignOf(f.a); }
    if (v) { f.v = keyOf(v); f.va = alignOf(f.v); }
    if (extra) Object.assign(f, extra);
    return f;
  }
  const other = (id) => (id === 'player' ? 'rival' : id === 'rival' ? 'player' : '');
  function fits(c, f) { for (const k in c) if (c[k] !== f[k]) return false; return true; }
  function specificity(c) { let n = 0; for (const k in c) n += k === 'lm' || k === 'm' ? 4 : k === 'pair' ? 3 : k === 'a' || k === 'v' ? 2 : 1; return n; }

  /** The row to say for the first topic in `topics` that has a fitting line (later topics are fallbacks, pooled at a lower weight). */
  function pick(topics, f) {
    cand.length = 0; weight.length = 0;
    let total = 0;
    for (let ti = 0; ti < topics.length; ti++) {
      const rows = byTopic.get(topics[ti]);
      if (!rows) continue;
      let u = used.get(topics[ti]);
      if (!u) used.set(topics[ti], u = new Set());
      let fresh = 0;
      for (const r of rows) if (fits(r[1], f) && !u.has(r)) fresh++;
      if (!fresh) u.clear();
      for (const r of rows) {
        if (!fits(r[1], f) || u.has(r)) continue;
        // the more a line says about this exact moment, the likelier it is
        const w = (1 + 1.6 * specificity(r[1])) * (ti === 0 ? 1 : 0.45);
        cand.push(r); weight.push(w); total += w;
      }
    }
    if (!cand.length) return null;
    let x = Math.random() * total;
    for (let i = 0; i < cand.length; i++) { x -= weight[i]; if (x <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }

  // ---- playing a line ----
  function utter() {
    const u = cur.row[2][cur.i], sp = u[0], text = u[1], id = u[2], dur = u[3];
    cur.t = (dur > 0 && voiceOn ? dur : Math.max(T.minDur, text.length * T.perChar)) + 0.12;
    cur.src = null;
    const e = bus.ev(EV.COMMENTARY);
    e.text = text; e.tone = cur.prio >= 3 ? 'shock' : cur.prio >= 2 ? 'hype' : 'neutral'; e.vo = true; e.speaker = sp; e.dur = cur.t;
    bus.emit(EV.COMMENTARY);
    if (dur > 0 && voiceOn && audio && audio.voLoad) {
      const mine = cur, at = clock, i = cur.i;
      const p = audio.voLoad(id);
      if (p && p.then) p.then((buf) => {
        if (!buf || cur !== mine || cur.i !== i) return;
        if (clock - at > T.lateAudio) { stats.late++; return; }
        mine.src = audio.voPlay(buf, sp === 'V' ? 0.95 : 1);
        stats.voiced++;
      });
    }
  }
  function begin(row, prio, topic) {
    cur = { row, i: 0, t: 0, prio, src: null };
    const u = used.get(row[0]); if (u) u.add(row);
    stats.said++; stats.topics[topic] = (stats.topics[topic] || 0) + 1;
    idleT = 0;
    // (the files of an exchange's later lines: fetched while the first one plays)
    if (voiceOn && audio && audio.voLoad) for (let k = 1; k < row[2].length; k++) if (row[2][k][3] > 0) audio.voLoad(row[2][k][2]);
    utter();
  }
  function cut() {
    if (!cur) return;
    if (cur.src && audio.voStop) audio.voStop(cur.src);
    cur = null; stats.cut++;
  }
  /** Say something about `topics` (first with a fitting line wins), given the facts f. sticky: never dropped, said in turn. */
  function say(topics, f, prio = 1, sticky = false) {
    if (!live) return false;
    if (typeof topics === 'string') topics = [topics];
    if (sticky) { later.push({ topics, f, prio }); if (cur && cur.prio < prio) cut(); return true; }
    if (cur) {
      // a bigger moment takes the microphone; an equal or smaller one waits (briefly) or goes unsaid
      if (prio > cur.prio && (prio >= 3 || cur.prio <= 0)) cut();
      else { if (!pend || prio >= pend.prio) pend = { topics, f, prio, exp: clock + T.hold[Math.min(4, prio)] }; else stats.dropped++; return false; }
    } else if (gapT > 0 && prio < 3) {
      if (!pend || prio >= pend.prio) pend = { topics, f, prio, exp: clock + T.hold[Math.min(4, prio)] };
      return false;
    }
    const row = pick(topics, f);
    if (!row) return false;
    begin(row, prio, topics[0]);
    return true;
  }
  /** Fetch the voice files a topic is likely to need before it is needed (a pin's kick-out lines while the count runs). */
  function prime(topics, f) {
    if (!voiceOn || !audio || !audio.voLoad) return;
    for (const t of topics) {
      const rows = byTopic.get(t);
      if (!rows) continue;
      let n = 0;
      for (const r of rows) if (fits(r[1], f) && n++ < 6) for (const u of r[2]) if (u[3] > 0) audio.voLoad(u[2]);
    }
  }
  function tick(dtReal) {
    if (!live) return;
    clock += dtReal;
    for (let i = 0; i < cues.length; i += 3) say(cues[i], facts(cues[i + 1], other(cues[i + 1])), cues[i + 2]);
    cues.length = 0;
    if (cur) {
      cur.t -= dtReal;
      if (cur.t <= 0) {
        if (++cur.i < cur.row[2].length) utter();
        else { gapT = cur.row[2].length > 1 ? T.gapAfterExchange : T.gap; cur = null; }
      }
      return;
    }
    if (gapT > 0) { gapT -= dtReal; if (gapT > 0) return; }
    if (later.length) {
      const q = later.shift(), row = pick(q.topics, q.f);
      if (row) begin(row, q.prio, q.topics[0]);
      return;
    }
    if (pend) {
      const q = pend; pend = null;
      if (q.exp >= clock) { const row = pick(q.topics, q.f); if (row) { begin(row, q.prio, q.topics[0]); return; } }
      else stats.dropped++;
    }
    // dead air: the booth fills it (never over a pin, a finisher or the walk to the ring)
    const ph = W.match && W.match.state ? W.match.state.phase : '';
    if (ph !== 'fight') { idleT = 0; return; }
    idleT += dtReal;
    if (idleT >= idleAt) {
      idleT = 0; idleAt = T.banterAfter[0] + Math.random() * (T.banterAfter[1] - T.banterAfter[0]);
      say('banter', facts('', ''), 0);
    }
  }

  // ---- the match's events as topics ----
  const chance = (p) => Math.random() < p;
  function subscribe() {
    const on = (n, fn) => offs.push(bus.on(n, fn));
    on(EV.MATCH_START, () => { say('intro', facts('', ''), 4, true); });
    on(EV.ENTRANCE_START, (e) => { say('entrance', facts(e.who, ''), 3, true); });
    on(EV.ENTRANCE_SKIP, () => { later.length = 0; if (cur && cur.prio >= 3) cut(); });
    on(EV.FALL_START, (e) => {
      later.length = 0;
      say(e.fall <= 1 ? 'bell' : e.playerFalls + e.rivalFalls >= 2 && e.playerFalls === e.rivalFalls ? 'fall.three' : 'fall.two', facts('', ''), 3);
      // what the fall will certainly need, fetched now
      for (const id of ['player', 'rival']) {
        prime(['knockdown', 'pin.start', 'pin.kick', 'pin.near', 'ko', 'reversal', 'strike.big'], facts(id, other(id)));
        prime(['finisher.start', 'finisher.hit', 'fall.end', 'comeback', 'critical'], facts(id, other(id)));
      }
    });
    on(EV.FALL_END, (e) => { if (e.winner) say('fall.end', facts(e.winner, e.loser), 4, true); });
    on(EV.MATCH_OVER, (e) => { later.length = 0; if (e.winner) say('match.over', facts(e.winner, e.loser), 4, true); });
    on(EV.KO, (e) => say('ko', facts(other(e.who), e.who), 4));

    on(EV.STRIKE_LANDED, (e) => {
      const f = facts(e.who, e.target);
      if (e.kind === 'weapon') { say('weapon.hit', f, 2); return; }
      if (e.counter) { say(['strike.counter', 'strike.big'], f, 2); return; }
      if (e.kind === 'heavy' || e.kind === 'clothesline' || e.kind === 'splash' || e.impact >= 0.7) { say(['strike.big', 'strike'], f, 2); return; }
      if (e.combo >= 3 && chance(0.6)) { say(['strike.combo', 'strike'], f, 1); return; }
      if (e.impact >= 0.35 && chance(T.routine.strike)) say('strike', f, 1);
    });
    on(EV.STRIKE_WHIFFED, (e) => { if (e.kind === 'heavy' && chance(T.routine.whiff)) say('whiff', facts(e.who, other(e.who)), 1); });
    on(EV.STRIKE_BLOCKED, (e) => { if (chance(T.routine.block)) say('block', facts(e.target, e.who), 1); });
    on(EV.BLOCK_BROKEN, (e) => say('guardbreak', facts(e.by, e.who), 2));
    on(EV.STRIKE_REVERSED, (e) => say('reversal', facts(e.who, e.target), 3));
    on(EV.GRAB_REVERSED, (e) => say('reversal', facts(e.who, e.target), 3));
    on(EV.GRAB_START, (e) => { if (chance(T.routine.grab)) say('grab', facts(e.who, e.target), 1); });
    on(EV.GRAB_ESCAPED, (e) => say('grab.escape', facts(e.who, e.target), 1));
    on(EV.GRAB_MOVE, (e) => {
      const f = facts(e.who, e.target);
      if (e.sig) { f.m = SIG_ID[e.name] || ''; say(['sig', 'slam'], f, 3); return; }
      if (e.type === 'whip') say('whip', f, 1);
      else if (e.type === 'suplex' || e.type === 'slam' || e.type === 'swing') say(e.type, f, 2);
    });
    on(EV.POWER_FIRED, (e) => say(['power.' + e.power, 'power.stomp'], facts(e.who, other(e.who)), e.power === 'ult' ? 4 : 2));
    on(EV.POWER_HIT, (e) => { if (!e.blocked && e.impact >= 0.5 && chance(T.routine.power_hit)) say('power.hit', facts(e.who, e.target), 1); });

    on(EV.BUILDING_IMPACT, (e) => {
      const f = facts(e.by, e.who);
      if (e.landmarkId && e.name) { f.lm = lmKey(e.landmarkId); say(['lm.any', 'bldg.through'], f, 3); }
      else say(e.count >= 2 ? ['bldg.many', 'bldg.through'] : 'bldg.through', f, 2);
    });
    on(EV.BUILDING_DESTROYED, (e) => {
      const by = e.by === 'player' || e.by === 'rival' ? e.by : '';
      const f = facts(by, other(by));
      if (e.landmarkId && e.name && e.h >= 4) { f.lm = lmKey(e.landmarkId); say(['lm.down', 'lm.any'], f, 2); }
      else if (e.h >= 14 && chance(T.routine.bldg_down)) say('bldg.down', f, 1);
    });
    on(EV.PROP_LIFT, (e) => {
      const f = facts(e.who, other(e.who));
      f.lm = lmKey(e.lm);
      if (e.kind === 'chunk') say(f.lm ? ['prop.tear', 'lm.any'] : 'prop.tear', f, 3);
      else if (e.kind === 'semi' || e.kind === 'tower') say(['prop.semi', 'prop.rip'], f, 3);
      else say(f.lm ? ['lm.any', 'prop.rip'] : 'prop.rip', f, 3);
      prime(['prop.throw', 'prop.hit', 'prop.miss', 'prop.smash', 'prop.blocked'], f);
    });
    on(EV.PROP_THROW, (e) => say('prop.throw', facts(e.who, e.target), 2));
    on(EV.PROP_HIT, (e) => say(e.blocked ? 'prop.blocked' : e.smash ? ['prop.smash', 'prop.hit'] : 'prop.hit', facts(e.who, e.target), 4));
    on(EV.PROP_CRASH, (e) => {
      if (e.cause === 'miss') say('prop.miss', facts(e.who, other(e.who)), 2);
      else if (e.cause === 'drop') say('prop.drop', facts(other(e.who), e.who), 2);
    });
    on(EV.THROW_LAND, (e) => {
      if (e.surface === 'water') say('water', facts(e.who, e.target), 3);
      else if (e.surface === 'crowd') say('crowd', facts(e.who, e.target), 3);
    });
    on(EV.SPOT_HIT, (e) => say(['spot.' + e.spot, 'bldg.through'], facts(e.by, e.who), 4));
    on(EV.ROPE_REBOUND, (e) => { if (chance(T.routine.ropes)) say('ropes', facts(e.who, other(e.who)), 1); });
    on(EV.ROPE_SNAP, (e) => say('ropesnap', facts(e.who, other(e.who)), 3));
    on(EV.POST_IMPACT, (e) => { if (e.impact >= 0.4) say('post', facts(other(e.who), e.who), 2); });
    on(EV.RING_OUT, () => { if (clock - lastRing > 25) { lastRing = clock; say('ringout', facts('', ''), 2); } });
    on(EV.WEAPON_PICKUP, (e) => say('weapon.pickup', facts(e.who, other(e.who)), 2));
    on(EV.WEAPON_BREAK, (e) => say('weapon.break', facts(other(e.target), e.target), 2));
    on(EV.INTERFERENCE_WARN, () => say('military.warn', facts('', ''), 2));
    on(EV.INTERFERENCE_ARRIVE, () => say('military.arrive', facts('', ''), 3));

    on(EV.KNOCKDOWN, (e) => { if (e.cause === 'strike' || e.cause === 'power') say('knockdown', facts(e.by === 'player' || e.by === 'rival' ? e.by : other(e.who), e.who), 2); });
    on(EV.PIN_START, (e) => {
      const f = facts(e.who, e.target);
      say('pin.start', f, 3);
      prime(['pin.kick', 'pin.near', 'pin.finkick', 'fall.end'], f);
    });
    on(EV.PIN_KICKOUT, (e) => {
      // (who: the one kicking out)
      const f = facts(other(e.who), e.who);
      say(e.finisher ? ['pin.finkick', 'pin.near'] : e.near ? 'pin.near' : 'pin.kick', f, e.finisher || e.near ? 4 : 3);
    });
    on(EV.COMEBACK_START, (e) => say('comeback', facts(e.who, other(e.who)), 4));
    on(EV.COMEBACK_NOSELL, (e) => { if (e.damage >= 2) say('nosell', facts(e.who, e.by), 2); });
    on(EV.COMEBACK_END, (e) => {
      if (e.by === 'done') say('comeback.done', facts(e.who, other(e.who)), 3);
      else if (e.by === 'cut') say('comeback.cut', facts(other(e.who), e.who), 3);
    });
    on(EV.HP_CRITICAL, (e) => say('critical', facts(other(e.who), e.who), 3));
    on(EV.STAMINA_EMPTY, (e) => say('tired', facts(other(e.who), e.who), 1));
    on(EV.MOMENTUM_FULL, (e) => say('momentum', facts(e.who, other(e.who)), 2));
    on(EV.FINISHER_START, (e) => say('finisher.start', facts(e.who, e.target), 4));
    on(EV.FINISHER_IMPACT, (e) => say('finisher.hit', facts(e.who, e.target), 4));
    on(EV.TAUNT_START, (e) => say('taunt', facts(e.who, other(e.who)), 1));
    on(EV.TAUNT_INTERRUPTED, (e) => say('taunt.hit', facts(e.by === 'player' || e.by === 'rival' ? e.by : other(e.who), e.who), 3));
    // What the match director and the rival's persona used to put on the ticker themselves: now cues for the booth
    // (taken up on the next tick: a line of ours is itself a commentary event, and a listener must not emit the event it is handling)
    on(EV.COMMENTARY, (e) => {
      if (e.vo || !e.key) return;
      const who = e.who === 'player' || e.who === 'rival' ? e.who : '';
      if (e.key === 'rally' || e.key === 'stall') cues.push(e.key, who, 2);
      else if (AI_TOPIC[e.key]) cues.push(AI_TOPIC[e.key], 'rival', e.key === 'lazy' ? 3 : 2);
    });
  }

  return {
    TUNE: T,
    start() {
      live = true; cur = null; pend = null; later.length = 0; gapT = 0; idleT = 0; clock = 0; lastRing = -99;
      used.clear();
      try { voiceOn = !/[?&]vo=0\b/.test(location.search) && localStorage.getItem('kh_vo') !== '0'; } catch (e) { voiceOn = true; }
      subscribe();
    },
    update(dt, dtReal) { tick(dtReal); },
    updateIdle(dtReal) { tick(dtReal); },
    dispose() {
      live = false;
      for (const off of offs) off();
      offs = [];
      if (cur && cur.src && audio && audio.voStop) audio.voStop(cur.src);
      cur = null; pend = null; later.length = 0;
    },
    /** Say a line about a topic now (QA): topics, facts ({ a, v, lm, m } as fighter ids for a / v), priority. */
    say(topics, o = {}, prio = 4) { const f = facts(o.a || '', o.v || '', { lm: o.lm || '', m: o.m || '' }); return say(topics, f, prio); },
    /** The voice track on / off (captions stay). Remembered. */
    set voice(on) { voiceOn = !!on; try { localStorage.setItem('kh_vo', on ? '1' : '0'); } catch (e) { /* private mode */ } if (!on && cur && cur.src && audio.voStop) audio.voStop(cur.src); },
    get voice() { return voiceOn; },
    get debug() { return { stats, cur: cur ? cur.row[2][cur.i][1] : '', pending: !!pend, later: later.length, topics: byTopic.size, lines: VO_LINES.length }; },
  };
}
