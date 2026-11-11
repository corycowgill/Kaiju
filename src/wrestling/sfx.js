// Wrestling audio layer: turns the event bus into sound.
// OWNER: audio.
//
// Everything audible goes through ctx.audio (../audio.js): its wrestling pack
// (assets/sfx/wr_*, synthesized offline by tools/wrestling_sfx/), the match mix
// (limiter, music / bed ducks, slow-mo low-pass, sub side-chain, voice pool with
// priorities) and the explicit-kaiju voices. This file only decides WHAT plays
// WHEN and HOW LOUD; it never touches a Web Audio node, so it runs unchanged
// against the smoke test's stub audio.
//
// Priorities (audio.wr prio): 0 ceremony that must play (bell, count, finisher),
// 1 big impacts, 2 crowd reactions, 3 strikes and voices, 4 detail.
// Buses (audio.wr bus): 0 impacts / voices, 1 crowd, 2 ceremony / UI.
//
// The crowd has two sources of truth: the match director's crowd:intensity /
// crowd:pop cues, and this module's own reading of the raw events (so the crowd
// already reacts before the director says anything, and a cue plus the event
// that caused it never play twice - the pack's per-sound cooldowns merge them).
import { EV } from './events.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** @returns {{ start, update, updateIdle, dispose }} */
export function createSfx(ctx, W) {
  const audio = ctx.audio, bus = W.bus;
  const offs = [];
  const beginOpts = { player: '', rival: '', phone: false, low: false };
  // Mix / director state. All timers are real seconds, counted down in tick().
  const S = {
    phase: 'idle',
    heat: 0.3,          // own estimate of crowd heat 0..1 (decays to a resting level)
    dirLevel: 0, dirT: 0, // the director's crowd:intensity and how fresh it is
    hush: 0,            // 0..1: the crowd holding its breath (pin cover, finisher apex)
    duckT: 0, duckAmt: 1, // transient music duck after a big moment
    stopT: 0,           // hit-stop remaining
    slowT: 0, slowScale: 1, slowOut: false,
    chantT: 0,          // chant loop time left
    themeOn: false,     // an entrance / victory theme owns the music slot
    themeT: -1, themeWho: '', themeGain: 0.6,
    fanfareT: -1, roarT: -1, roarWho: '',
    teleT: -1, teleKind: 0,
    struggleT: 0,
    painT: { player: 0, rival: 0 },
    dizzyT: { player: -1, rival: -1 },
    calloutT: 0,
  };
  // Result of place(): where a world point sits relative to the camera
  let _pan = 0, _att = 1;

  /** Pan (-1..1) and distance gain for a world point, from the camera's position and right vector. */
  function place(x, z) {
    const cam = ctx.camera, m = cam && cam.matrixWorld && cam.matrixWorld.elements;
    if (!m) { _pan = 0; _att = 1; return; }
    const dx = x - m[12], dz = z - m[14], d = Math.hypot(dx, dz) || 1;
    const rl = Math.hypot(m[0], m[2]) || 1;
    _pan = ((dx * m[0] + dz * m[2]) / (d * rl)) * 0.7 * Math.min(1, d / 40);
    _att = Math.max(0.45, 1 / (1 + (d / 260) * (d / 260)));
  }
  function placeWho(who) {
    const f = W[who];
    if (f && f.pos) place(f.pos.x, f.pos.z); else { _pan = 0; _att = 1; }
  }
  const keyOf = (who) => { const f = W[who]; return f ? f.key : ''; };
  const bump = (v) => { S.heat = Math.min(1, S.heat + v); };
  const duck = (amt, sec) => { if (S.duckT <= 0 || amt < S.duckAmt) S.duckAmt = amt; S.duckT = Math.max(S.duckT, sec); };

  // ---- building blocks ----
  /** The one low-end layer. size 0 tight, 1 slam, 2 the long one. */
  const sub = (size, gain, when = 0) => audio.wr('wr_sub', gain, 1, when, 0, 1, 0, size);
  /** A body meets the ground. size 0..1. Call place() first. */
  function slam(size, when = 0) {
    const s = clamp01(size);
    if (!audio.wr('wr_slam', (0.6 + 0.4 * s) * _att, 1.08 - 0.14 * s, when, _pan, 1)) audio.stomp();
    sub(s > 0.75 ? 2 : s > 0.4 ? 1 : 0, 0.55 + 0.45 * s, when);
    if (s > 0.55) duck(0.45, 0.7);
    bump(0.12 + 0.3 * s);
  }
  /** A crowd reaction. kind: pop / ooh / gasp / boo / roar / panic. */
  function crowd(kind, impact = 0.6, when = 0) {
    const g = 0.5 + 0.5 * clamp01(impact);
    if (kind === 'pop') { audio.wr('wr_crowd_pop', g, 1, when, _pan * 0.4, 2, 1); bump(0.25 * g); }
    else if (kind === 'ooh') { audio.wr('wr_crowd_ooh', g, 1, when, _pan * 0.4, 2, 1); bump(0.12 * g); }
    else if (kind === 'gasp') audio.wr('wr_crowd_gasp', g, 1, when, _pan * 0.4, 2, 1);
    else if (kind === 'boo') { audio.wr('wr_crowd_boo', g, 1, when, 0, 2, 1); S.heat = Math.max(S.heat, 0.45); }
    else if (kind === 'roar') { audio.wr('wr_crowd_roar', g, 1, when, 0, 0, 1); S.heat = 1; }
    else if (kind === 'panic') { audio.scream(); audio.wr('wr_crowd_gasp', g, 1.05, when, _pan * 0.6, 2, 1); }
    else if (kind === 'chant') S.chantT = Math.max(S.chantT, 8);
  }
  const vox = (who, kind, gain = 1, when = 0, prio = 3) => { placeWho(who); audio.vox(keyOf(who), kind, gain * _att, _pan, when, prio); };

  function begin() {
    if (!W.player || !W.rival) return;
    const q = ctx.quality || {};
    beginOpts.player = W.player.key; beginOpts.rival = W.rival.key;
    beginOpts.phone = !!q.isMobile; beginOpts.low = !!(q.isMobile && (q.low || q.tier === 'low'));
    audio.matchBegin(beginOpts);
  }
  function reset() {
    S.phase = 'idle'; S.heat = 0.3; S.dirLevel = 0; S.dirT = 0; S.hush = 0; S.duckT = 0; S.duckAmt = 1; S.stopT = 0;
    S.slowT = 0; S.slowScale = 1; S.slowOut = false; S.chantT = 0; S.themeOn = false; S.themeT = -1; S.fanfareT = -1; S.roarT = -1;
    S.teleT = -1; S.struggleT = 0; S.painT.player = 0; S.painT.rival = 0; S.dizzyT.player = -1; S.dizzyT.rival = -1; S.calloutT = 0;
  }

  // ---- handlers ----
  const H = {
    [EV.MATCH_START]() { reset(); begin(); },
    [EV.MATCH_PHASE](e) {
      S.phase = e.phase;
      if (e.phase !== 'pin' && e.phase !== 'finisher') S.hush = 0;
      if (e.phase === 'between') { _pan = 0; crowd('chant'); }
      if (e.phase === 'fight' && S.themeOn) { audio.themeStop(1.5); S.themeOn = false; }
    },
    [EV.ENTRANCE_START](e) {
      // each kaiju walks out to 12 s of its own battle score; the challenger is the heel
      S.themeOn = !!audio.theme(e.key || keyOf(e.who), 0.6) || S.themeOn;
      placeWho(e.who);
      if (e.who === 'player') crowd('pop', 0.8, 0.2); else crowd('boo', 0.7, 0.3);
    },
    [EV.ENTRANCE_BEAT](e) {
      place(e.x, e.z);
      const b = e.beat;
      if (b === 'rise') { audio.splash(1); sub(1, 0.7); }
      else if (b === 'roar') { audio.roar(keyOf(e.who)); crowd(e.who === 'player' ? 'pop' : 'ooh', 0.7, 0.3); }
      else if (b === 'crash') { audio.wr('wr_crash', _att, 1, 0, _pan, 1); sub(1, 0.8); crowd('gasp', 0.8); }
      else if (b === 'pose') { crowd(e.who === 'player' ? 'pop' : 'boo', 0.9); }
      else if (b === 'namecard') audio.wr('wr_ui_big', 0.8, 1, 0, 0, 0, 2);
      else if (b === 'arrive') slam(0.45);
    },
    [EV.ENTRANCE_END]() { audio.themeStop(1.6); S.themeOn = false; },
    [EV.ENTRANCE_SKIP]() { audio.themeStop(0.3); S.themeOn = false; },
    [EV.BELL](e) {
      const n = Math.max(1, Math.min(5, e.rings | 0));
      for (let i = 0; i < n; i++) if (!audio.wr('wr_bell', i ? 0.85 : 1, 1, i * 0.28, 0, 0, 2)) audio.bellFallback(i * 0.28);
      _pan = 0;
      if (e.kind === 'start') crowd('pop', 0.7, 0.15);
      duck(0.5, 0.6 + n * 0.28);
    },
    [EV.FALL_END](e) { _pan = 0; if (e.winner === 'player') crowd('pop', 1, 0.1); else crowd('boo', 0.8, 0.2); },
    [EV.MATCH_WON]() {
      audio.matchResult(true);
      _pan = 0; crowd('roar', 1, 0.15);
      S.fanfareT = 0.95;                       // after the three bells
      S.themeT = 3.3; S.themeWho = keyOf('player'); S.themeGain = 0.6;
      S.chantT = 0;
    },
    [EV.MATCH_LOST]() {
      audio.matchResult(false);
      _pan = 0; crowd('boo', 1, 0.3); crowd('ooh', 0.8);
      S.roarT = 0.9; S.roarWho = keyOf('rival');
      S.themeT = 3.4; S.themeWho = keyOf('rival'); S.themeGain = 0.4;
      S.chantT = 0;
    },

    [EV.FIGHTER_STATE](e) {
      if (e.state === 'stunned') S.dizzyT[e.who] = 0.05;
      else if (e.prev === 'stunned') { S.dizzyT[e.who] = -1; audio.wrStop('wr_dizzy', 0.15); }
      if (e.state === 'gettingUp') vox(e.who, 'effort', 0.55, 0.05, 4);
    },
    [EV.DAMAGE](e) {
      if (e.blocked || !(e.maxHp > 0) || S.painT[e.who] > 0) return;
      const frac = e.amount / e.maxHp;
      if (frac < 0.012) return;
      S.painT[e.who] = 0.45;
      vox(e.who, 'pain', 0.6 + Math.min(0.4, frac * 5), 0.03);
    },
    [EV.HP_CRITICAL](e) { _pan = 0; if (e.who === 'player') crowd('ooh', 0.7); else crowd('pop', 0.6); },
    [EV.STAMINA_EMPTY](e) { vox(e.who, 'strain', 0.6, 0, 4); },
    [EV.MOMENTUM_FULL](e) {
      _pan = 0;
      if (e.who === 'player') { audio.pickup('rage'); crowd('pop', 0.6, 0.1); crowd('chant'); }
      else { audio.wr('wr_ui_big', 0.5, 0.8, 0, 0, 2, 2); crowd('boo', 0.5, 0.2); }
    },
    [EV.MOMENTUM_SPENT]() { S.chantT = Math.min(S.chantT, 0.5); },

    [EV.STRIKE_START](e) {
      placeWho(e.who);
      const w = e.windup || 0;
      if (e.kind === 'splash') {
        // the falling whistle ends on the hit: start it so its last sample is the contact
        if (w >= 1) audio.wr('wr_dive', _att, 1, w - 1, _pan, 3); else audio.wr('wr_dive', _att, 1, 0, _pan, 3, 0, -1, 1 - Math.max(0.15, w));
      } else if (e.kind === 'heavy' || e.kind === 'clothesline') {
        audio.wr('wr_whoosh', 0.8 * _att, e.kind === 'heavy' ? 1 : 0.9, Math.max(0, w - 0.45), _pan, 4);
        vox(e.who, 'effort', 0.7, Math.max(0, w - 0.2));
      } else if (e.combo >= 3) audio.wr('wr_whoosh', 0.45 * _att, 1.25, Math.max(0, w - 0.35), _pan, 4);
    },
    [EV.STRIKE_LANDED](e) {
      place(e.x, e.z);
      const imp = clamp01(e.impact), k = e.kind, c = e.counter ? 1.15 : 1;
      if (k === 'heavy' || k === 'clothesline') {
        if (!audio.wr('wr_strike_h', (0.8 + 0.2 * imp) * c * _att, 1, 0, _pan, 1)) audio.hit();
        sub(0, 0.6 + 0.3 * imp);
        if (k === 'clothesline') audio.wr('wr_body', 0.8 * _att, 0.95, 0.01, _pan, 3);
        bump(0.15);
        if (imp > 0.5 || e.counter) crowd('ooh', 0.5 + 0.5 * imp, 0.08);
      } else if (k === 'splash') {
        slam(Math.max(0.8, imp)); audio.wr('wr_body', _att, 0.9, 0, _pan, 1);
        crowd('ooh', 1, 0.1); crowd('pop', 0.9, 0.5);
      } else if (k === 'stomp') {
        audio.wr('wr_body', 0.9 * _att, 0.9, 0, _pan, 3); sub(0, 0.6);
      } else {
        // the light string climbs: each hit a little harder and lower, the third lands a body layer
        const n = Math.max(1, Math.min(3, e.combo | 0));
        if (!audio.wr('wr_strike_l', (0.7 + 0.1 * n + 0.2 * imp) * c * _att, 1.06 - 0.04 * n, 0, _pan, 3)) audio.hit();
        if (n === 3) { audio.wr('wr_body', 0.6 * _att, 1, 0.005, _pan, 3); sub(0, 0.45); }
        bump(0.04 * n);
        if (e.counter) crowd('ooh', 0.6, 0.08);
      }
    },
    [EV.STRIKE_BLOCKED](e) {
      place(e.x, e.z);
      if (!audio.wr('wr_block', (0.75 + 0.25 * clamp01(e.impact)) * _att, e.kind === 'light' ? 1.06 : 0.94, 0, _pan, 3)) audio.shellHit();
    },
    [EV.STRIKE_REVERSED](e) {
      place(e.x, e.z);
      audio.wr('wr_reversal', _att, 1, 0, _pan, 1);
      crowd('gasp', 0.9); crowd('pop', 0.7, 0.35);
    },
    [EV.STRIKE_WHIFFED](e) { placeWho(e.who); audio.wr('wr_whoosh', 0.4 * _att, 1.35, 0, _pan, 4); },

    [EV.POWER_TELEGRAPH](e) {
      if (e.who !== 'rival') return;
      // the boss wind-ups end on their loudest point: 0.9 s and 1.5 s before the hit
      const d = e.dur || 0;
      if (d >= 1.5) { S.teleKind = 1; S.teleT = d - 1.5; } else { S.teleKind = 0; S.teleT = Math.max(0, d - 0.9); }
    },
    [EV.POWER_FIRED](e) {
      if (e.who !== 'rival') return; // game.js voices the player's own powers
      const k = keyOf('rival'), p = e.power;
      if (p === 'beam') audio.beam(k); else if (p === 'roar') audio.roar(k); else if (p === 'charge') audio.charge(k);
      else if (p === 'stomp') audio.stomp(); else if (p === 'ult') audio.ult(k);
    },
    [EV.POWER_HIT](e) {
      place(e.x, e.z);
      if (e.blocked) { audio.wr('wr_block', 0.9 * _att, 0.9, 0, _pan, 3); return; }
      audio.wr('wr_body', (0.6 + 0.4 * clamp01(e.impact)) * _att, 0.92, 0, _pan, 3);
      if (e.impact > 0.5) { sub(0, 0.6); crowd('ooh', e.impact, 0.1); }
    },

    [EV.STAGGER](e) { bump(0.05); if (e.dur > 0.5) { place(e.x, e.z); crowd('ooh', 0.4, 0.1); } },
    [EV.STUN](e) { placeWho(e.who); crowd('ooh', 0.7, 0.05); },
    [EV.BLOCK_BROKEN](e) {
      placeWho(e.who);
      audio.wr('wr_block', _att, 0.8, 0, _pan, 1); audio.wr('wr_strike_h', 0.8 * _att, 1.1, 0.02, _pan, 1);
      crowd('ooh', 0.8, 0.1);
    },

    [EV.GRAB_ATTEMPT](e) { placeWho(e.who); audio.wr('wr_whoosh', 0.5 * _att, 1.15, 0, _pan, 4); vox(e.who, 'effort', 0.5, 0, 4); },
    [EV.GRAB_START](e) {
      place(e.x, e.z);
      audio.wr('wr_body', 0.75 * _att, 1.08, 0, _pan, 3);
      vox(e.who, 'effort', 0.7, 0.03); vox(e.target, 'strain', 0.6, 0.12, 4);
      S.struggleT = 0.9; bump(0.1);
    },
    [EV.GRAB_REVERSED](e) { placeWho(e.who); audio.wr('wr_reversal', 0.9 * _att, 1.04, 0, _pan, 1); crowd('gasp', 0.8); crowd('pop', 0.6, 0.35); },
    [EV.GRAB_ESCAPED](e) {
      placeWho(e.who);
      audio.wr('wr_body', 0.6 * _att, 1.1, 0, _pan, 3); vox(e.who, 'effort', 0.8);
      if (e.who === 'player') crowd('pop', 0.5, 0.1);
    },
    [EV.GRAB_MOVE](e) {
      // the heave: the grunt lands just before the launch
      const d = e.dur || 0;
      vox(e.who, 'effort', 0.9, Math.max(0, d - 0.18), 1);
      if (e.type === 'whip' || e.type === 'swing') audio.wr('wr_whoosh', 0.7 * _att, 0.9, Math.max(0, d - 0.4), _pan, 4);
      if (e.type === 'suplex' || e.type === 'slam') audio.wr('wr_rope_stretch', 0.35 * _att, 0.7, 0, _pan, 4); // sinew and scale under load
    },
    [EV.LIFT_START](e) { vox(e.who, 'strain', 0.9, 0, 1); vox(e.target, 'pain', 0.5, 0.25, 4); _pan = 0; crowd('ooh', 0.5, 0.2); bump(0.15); },
    [EV.SWING_SPIN](e) {
      placeWho(e.who);
      const n = Math.min(6, e.turns | 0);
      audio.wr('wr_whoosh', (0.5 + 0.06 * n) * _att, 0.9 + 0.07 * n, 0, _pan, 3);
      bump(0.08);
    },
    [EV.THROW_LAUNCH](e) {
      place(e.x, e.z);
      audio.wr('wr_whoosh', 0.9 * _att, Math.max(0.75, 1.1 - (e.speed || 0) / 400), 0, _pan, 3);
      bump(0.12);
    },
    [EV.THROW_LAND](e) {
      place(e.x, e.z);
      const imp = clamp01(e.impact), big = e.type === 'suplex' || e.type === 'slam' || e.type === 'swing';
      const sf = e.surface;
      if (sf === 'water') { audio.splash(1); audio.wr('wr_body', 0.8 * _att, 0.85, 0, _pan, 1); sub(1, 0.5 + 0.3 * imp); bump(0.2); }
      else if (sf === 'ropes') { audio.wr('wr_rope_twang', (0.7 + 0.3 * imp) * _att, 1, 0, _pan, 1); audio.wr('wr_body', 0.7 * _att, 1, 0, _pan, 3); }
      else if (sf === 'building') { audio.wr('wr_crash', (0.75 + 0.25 * imp) * _att, 1, 0, _pan, 1); sub(1, 0.6 + 0.3 * imp); bump(0.25); }
      else {
        slam(big ? Math.max(0.6, imp) : 0.3 + 0.5 * imp);
        if (sf === 'crowd') crowd('panic', 1);
      }
      if (imp > 0.45 || big) crowd('ooh', 0.6 + 0.4 * imp, 0.1);
      if (imp > 0.8) crowd('pop', imp, 0.55);
    },

    [EV.BUILDING_IMPACT](e) {
      place(e.x, e.z);
      // game.js plays the collapse itself; this is the body going through the structure
      const n = Math.min(4, e.count | 0), tall = clamp01((e.h || 0) / 80);
      audio.wr('wr_crash', (0.7 + 0.3 * tall) * _att, 1 + 0.05 * (n - 1), 0, _pan, 1);
      sub(tall > 0.5 ? 2 : 1, 0.6 + 0.3 * tall);
      duck(0.5, 0.6);
      bump(0.2 + 0.1 * n);
      if (e.name) { crowd('gasp', 1); crowd('pop', 1, 0.5); } else if (n === 1) crowd('ooh', 0.7, 0.1);
    },
    [EV.ROPE_REBOUND](e) {
      place(e.x, e.z);
      const g = (0.6 + 0.4 * clamp01((e.speed || 0) / 120)) * _att;
      audio.wr('wr_rope_twang', g, e.ropeHp <= 1 ? 1.08 : 1, 0, _pan, 1);
      audio.wr('wr_rope_stretch', 0.6 * g, 1, 0, _pan, 4);
      bump(0.1);
    },
    [EV.ROPE_SNAP](e) {
      place(e.x, e.z);
      audio.wr('wr_rope_snap', _att, 1, 0, _pan, 1);
      crowd('gasp', 1, 0.05); bump(0.3);
    },
    [EV.POST_IMPACT](e) {
      place(e.x, e.z);
      const imp = clamp01(e.impact);
      audio.wr('wr_post', (0.7 + 0.3 * imp) * _att, 1, 0, _pan, 1);
      audio.wr('wr_body', 0.7 * _att, 0.95, 0, _pan, 3); sub(0, 0.5 + 0.3 * imp);
      if (e.toppled) { audio.wr('wr_crash', 0.9 * _att, 0.9, 0.25, _pan, 1); crowd('gasp', 1, 0.1); }
      else crowd('ooh', 0.5 + 0.5 * imp, 0.1);
    },
    [EV.RING_OUT](e) { place(e.x, e.z); crowd('ooh', 0.5, 0.1); },
    [EV.WATER_IMPACT](e) {
      place(e.x, e.z);
      const s = clamp01(((e.size || 1) - 1) / 2);
      audio.splash(0.5 + 0.5 * s);
      if (s > 0.2) sub(s > 0.7 ? 1 : 0, 0.4 + 0.4 * s);
    },
    [EV.CROWD_CRUSHED](e) { place(e.x, e.z); crowd('panic', 1); },

    [EV.KNOCKDOWN](e) {
      place(e.x, e.z);
      // a thrown body already slammed through throw:land (the pack's cooldown would merge them anyway)
      if (e.cause !== 'throw' && e.cause !== 'finisher') slam(0.35 + 0.5 * clamp01(e.impact));
    },
    [EV.GETUP](e) { vox(e.who, 'effort', 0.5, 0.1, 4); },
    [EV.PICKUP](e) { placeWho(e.who); audio.wr('wr_body', 0.5 * _att, 1.1, 0, _pan, 4); vox(e.who, 'effort', 0.6); },
    [EV.PIN_START](e) {
      placeWho(e.who);
      audio.wr('wr_body', 0.8 * _att, 0.9, 0, _pan, 1);
      S.hush = 1; S.chantT = 0;
    },
    [EV.PIN_COUNT](e) {
      // post hit + the whole arena shouting the number
      const c = Math.max(1, Math.min(3, e.count | 0));
      placeWho(e.who);
      audio.wr('wr_post', (0.65 + 0.1 * c) * _att, 0.98 + 0.05 * c, 0, _pan * 0.5, 0, 2);
      sub(0, 0.4 + 0.1 * c);
      audio.wr('wr_crowd_count', 0.8 + 0.1 * c, 1, 0.03, 0, 0, 1, c - 1);
      S.hush = 0.6;
    },
    [EV.PIN_KICKOUT](e) {
      S.hush = 0;
      placeWho(e.who);
      audio.wr('wr_body', 0.8 * _att, 1.05, 0, _pan, 1);
      vox(e.who, 'effort', 1, 0, 1);
      if (e.near) { crowd('gasp', 1); crowd('ooh', 1, 0.2); crowd('pop', 1, 0.45); S.heat = 1; }
      else crowd('pop', 0.6, 0.1);
    },
    [EV.PIN_FALL](e) { S.hush = 0; _pan = 0; if (e.who === 'player') crowd('pop', 1, 0.05); else { crowd('boo', 0.9, 0.2); crowd('ooh', 0.8); } },
    [EV.PIN_BROKEN](e) { S.hush = 0; _pan = 0; if (e.reason === 'interference') crowd('boo', 1, 0.1); else crowd('ooh', 0.7); },

    [EV.TAUNT_START](e) { audio.roar(keyOf(e.who)); },
    [EV.TAUNT_COMPLETE](e) { placeWho(e.who); if (e.who === 'player') crowd('pop', 0.9); else crowd('boo', 0.8); },
    [EV.TAUNT_INTERRUPTED](e) { placeWho(e.who); crowd('ooh', 0.7, 0.05); },

    [EV.FINISHER_START](e) {
      audio.wr('wr_fin_start', 1, 1, 0, 0, 0, 2);
      audio.roar(keyOf(e.who));
      S.heat = Math.max(S.heat, 0.85); S.chantT = 0;
    },
    [EV.FINISHER_BEAT](e) {
      placeWho(e.who);
      const b = e.beat;
      if (b === 'grab') { audio.wr('wr_body', _att, 0.9, 0, _pan, 0); vox(e.target, 'pain', 0.7, 0.1, 1); }
      else if (b === 'lift') { audio.wr('wr_fin_riser', 0.9, 1, 0, 0, 0, 0); vox(e.who, 'strain', 1, 0, 1); }
      else if (b === 'rise') audio.wr('wr_whoosh', _att, 0.75, 0, _pan, 1);
      else if (b === 'apex') {
        // the held breath: the riser cuts, the crowd stops, one glass note hangs
        audio.wrStop('wr_fin_riser', 0.05);
        audio.wr('wr_fin_apex', 1, 1, 0, 0, 0, 2);
        crowd('gasp', 1);
        S.hush = 1;
      } else if (b === 'drop' || b === 'slam' || b === 'dive') audio.wr('wr_dive', _att, 1.05, 0, _pan, 0, 0, -1, 0.4);
    },
    [EV.FINISHER_IMPACT](e) {
      place(e.x, e.z);
      S.hush = 0;
      audio.wrStop('wr_dive', 0.02);
      audio.wr('wr_fin_impact', 1, 1, 0, _pan * 0.5, 0);
      audio.wr('wr_crash', 0.8 * _att, 0.85, 0.03, _pan, 1);
      // the attacker's signature on top of the blast
      const k = keyOf(e.who);
      if (k === 'ghidorah') audio.beam(k); else if (k === 'mecha') audio.shoot('boss'); else audio.explosion(2.2);
      crowd('roar', 1, 0.4);
      duck(0.25, 2.5);
    },
    [EV.KO](e) {
      place(e.x, e.z);
      vox(e.who, 'ko', 1, 0.05, 0);
      crowd('gasp', 1); crowd(e.who === 'rival' ? 'pop' : 'ooh', 1, 0.5);
      duck(0.35, 1.5);
    },

    [EV.INTERFERENCE_WARN]() { audio.alarm(); _pan = 0; crowd('boo', 0.8, 0.4); },
    [EV.INTERFERENCE_ARRIVE](e) { place(e.x, e.z); crowd('boo', 1); },
    [EV.INTERFERENCE_END]() { _pan = 0; crowd('pop', 0.5); },

    [EV.CROWD_INTENSITY](e) { S.dirLevel = clamp01(e.level); S.dirT = 1.5; },
    [EV.CROWD_POP](e) {
      place(e.x, e.z);
      if (e.kind !== 'count') crowd(e.kind, e.impact || 0.6); // the count is voiced on pin:count, on the slap
    },
    [EV.CALLOUT](e) {
      if (S.calloutT > 0 || e.tier === 'result') return;
      S.calloutT = 0.25;
      if (e.tier === 'move') audio.wr('wr_ui_callout', 0.8, 1, 0, 0, 2, 2);
      else if (e.tier === 'landmark') audio.wr('wr_ui_big', 1, 1, 0, 0, 0, 2);
      else audio.wr('wr_ui_big', 0.8, 0.9, 0, 0, 0, 2);
    },
    [EV.PROMPT](e) {
      if (!e.show) return;
      const urgent = e.id === 'kickout' || e.id === 'escape' || e.id === 'defend';
      audio.wr('wr_ui_prompt', urgent ? 1 : 0.6, urgent ? 1.12 : 1, 0, 0, urgent ? 0 : 4, 2);
    },
    [EV.LOCKON](e) { audio.wr('wr_ui_prompt', 0.4, e.on ? 1.2 : 0.85, 0, 0, 4, 2); },
    [EV.TIME_HITSTOP](e) { S.stopT = Math.max(S.stopT, e.dur || 0); },
    [EV.TIME_SLOWMO](e) {
      const d = e.dur || 0, sc = e.scale || 1;
      if (sc >= 0.95 || d <= 0) return;
      S.slowT = d; S.slowScale = sc;
      S.slowOut = d >= 0.5 && sc <= 0.6;
      if (S.slowOut) audio.wr('wr_slow_in', 0.7, 1, 0, 0, 2, 2);
    },
  };

  /** Envelopes and timers: every frame, running or idle. dtReal: real seconds. */
  function tick(dt) {
    // -- timers --
    if (S.duckT > 0) { S.duckT -= dt; if (S.duckT <= 0) S.duckAmt = 1; }
    if (S.stopT > 0) S.stopT -= dt;
    if (S.calloutT > 0) S.calloutT -= dt;
    if (S.painT.player > 0) S.painT.player -= dt;
    if (S.painT.rival > 0) S.painT.rival -= dt;
    if (S.dirT > 0) S.dirT -= dt;
    if (S.chantT > 0) S.chantT -= dt;
    if (S.slowT > 0) {
      S.slowT -= dt;
      if (S.slowT <= 0) { S.slowScale = 1; if (S.slowOut) audio.wr('wr_slow_out', 0.6, 1, 0, 0, 4, 2); }
    }
    if (S.fanfareT >= 0 && (S.fanfareT -= dt) < 0) audio.waveClear();
    if (S.roarT >= 0 && (S.roarT -= dt) < 0) audio.roar(S.roarWho);
    if (S.themeT >= 0 && (S.themeT -= dt) < 0) S.themeOn = !!audio.theme(S.themeWho, S.themeGain) || S.themeOn;
    if (S.teleT >= 0 && (S.teleT -= dt) < 0) { if (S.teleKind) audio.bossSlamWarn(); else audio.bossWindup(); }
    for (let i = 0; i < 2; i++) {
      const who = i ? 'rival' : 'player';
      if (S.dizzyT[who] >= 0 && (S.dizzyT[who] -= dt) < 0) {
        const f = W[who];
        if (f && f.state === 'stunned') { placeWho(who); audio.wr('wr_dizzy', _att, 1, 0, _pan, 4); S.dizzyT[who] = 1.55; }
      }
    }
    // the struggle in a lock-up: the two trade strained grunts while the hold lasts
    const P = W.player;
    if (P && (P.state === 'grappling' || P.state === 'grappled') && S.phase === 'fight') {
      if ((S.struggleT -= dt) < 0) {
        S.struggleT = 0.8 + Math.random() * 0.7;
        vox(Math.random() < 0.5 ? 'player' : 'rival', 'strain', 0.55, 0, 4);
      }
    }

    // -- crowd bed --
    // heat rests at a level set by the phase and sinks back to it; the director's level wins while it is fresh
    const rest = S.phase === 'fight' ? 0.3 : S.phase === 'entrance' ? 0.5 : S.phase === 'between' ? 0.25 : S.phase === 'over' ? 0.6 : 0.35;
    S.heat += (rest - S.heat) * Math.min(1, dt * (S.heat > rest ? 0.22 : 0.6));
    let L = S.dirT > 0 ? Math.max(S.dirLevel, S.heat * 0.85) : S.heat;
    L *= 1 - 0.55 * S.hush;
    // distance from the ring: the crowd thins and dulls when the fight leaves Grant Park
    let near = 1;
    const A = W.arena && W.arena.info, cam = ctx.camera, m = cam && cam.matrixWorld && cam.matrixWorld.elements;
    if (A && m) { const d = Math.hypot(A.cx - m[12], A.cz - m[14]); near = 1 / (1 + (d / 230) * (d / 230)); }
    const slow = S.slowT > 0 ? S.slowScale : 1;
    audio.crowdBed(0.85 * (1 - 0.55 * L) * near, 0.95 * L * Math.sqrt(L) * near, 0.72 + 0.28 * slow, 2600 + 13400 * near);
    audio.crowdChant(S.chantT > 0 ? 0.55 * near * Math.min(1, S.chantT) : 0);

    // -- music / bed ducks, slow-mo colour --
    const base = S.themeOn ? 0.12 : S.phase === 'pin' ? 0.35 : S.phase === 'finisher' ? 0.3 : S.phase === 'between' ? 0.7 : S.phase === 'over' ? 0.3 : S.phase === 'entrance' ? 0.5 : 1;
    audio.matchDuck(base * (S.duckT > 0 ? S.duckAmt : 1), S.stopT > 0 ? 0.4 : 1);
    audio.matchLowpass(S.stopT > 0 ? 2400 : S.slowT > 0 ? 900 + 6000 * slow * slow : 20000);
  }

  return {
    start() {
      reset();
      for (const name in H) offs.push(bus.on(name, H[name]));
      begin();
    },
    update(dt, dtReal) { tick(dtReal); },
    updateIdle(dtReal) { tick(dtReal); },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      audio.matchEnd();
    },
  };
}
