// Rival AI: the opponent's brain. It reads both fighters and the event bus and
// writes the rival's INTENT, exactly as input.js does for the player: it never
// moves the rival, deals damage or touches a timer of the combat core.
// OWNER: AI engineer.
//
// How it is put together (top to bottom in this file):
//   PERSONAS   one table per kaiju: the same move set, different habits.
//   AI_TUNE    the difficulty curve (W.match.state.difficulty -> skill 0..1)
//              and what skill buys: reaction time, defence, punishes, how well
//              it reads the city, how long it idles. Never damage or health.
//   perception the foe is seen through a reaction delay. Its strikes, grabs,
//              taunts and whiffs arrive as bus events and are answered (or
//              not) after a human-scale delay that grows when the rival has
//              just been rocked.
//   tempo      'engage' (a burst of a few actions) alternates with 'lull'
//              (spacing, circling, feints, taunts, a power from range): the
//              rhythm of a match. Being ahead makes it cocky (longer lulls,
//              taunts, lazier guard); being behind makes it desperate
//              (shorter lulls, more powers and reversals, hopeful pins).
//   plans      one small plan at a time in neutral: approach-and-do-X, circle,
//              hold, back off, feint, guard, pursue, the ground game.
//   holds      what it does with a lock-up (it looks for a tower or a rope to
//              whip the foe into), a carry, a swing; how it struggles in one.
//   persona   what each kaiju is like to wrestle, on top of the numbers above:
//              Gorrak the powerhouse (walks you down, shrugs off big hits, puts
//              you through buildings with its signatures), Tridon the high-flyer
//              (runs the ropes, dives off the corner posts onto a downed foe,
//              showboats and covers lazily when ahead), Mechra the cold heel
//              (reverses everything, works the back, stomps a downed foe, jumps
//              you as you get up and the crowd boos it). Each beat is announced
//              with a callout / commentary line / crowd reaction so it reads.
// Fairness rules it keeps on top of the core's own stun-lock guards: it gives
// a rising foe room, counts its own follow-ups on a foe that has had no
// control and backs off (or showboats) when the chain gets long, and every
// big move it has goes through the core's telegraphed wind-ups.
// No per-frame allocation: all state lives in S below; events only set fields.
import { EV } from './events.js';
import { MOVES, POWERS, TUNE } from './fighter.js';
import { GRAPPLE } from './grapple.js';
import { SIGNATURES } from './signatures.js';

const HALF_PI = Math.PI / 2;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };

/**
 * The three wrestlers. Weights are relative within a group; probabilities are
 * 0..1 at full skill unless noted. What a player can learn about each one is
 * in `tells` (documentation only: the numbers above it are what produce them).
 */
export const PERSONAS = Object.freeze({
  // Gorrak: the bruising tyrant. Walks you down, trades instead of blocking, ends strings with the big right hand, slams.
  godzilla: {
    id: 'tyrant', react: 1.15, space: 11, burst: [2, 4], lull: [0.9, 2.0], sprint: 0.15,
    w: { string: 1.0, heavy: 1.25, grab: 1.35, rush: 0.35, feint: 0.12 },
    len: [0.15, 0.55, 0.30], ender: 0.7,          // P(1 / 2 / 3 jabs); P(the string ends in the heavy)
    guard: 0.35, reversal: 0.6, guardOut: 0.7, grabRev: 0.9, counter: 0.6, counterAct: { string: 0.2, heavy: 0.4, grab: 0.4 },
    poke: 0.9, evade: 0.1, circle: 0.35, stand: 0.9, hitRun: 0.05, zoner: 0.3,
    lock: { whip: 0.8, suplex: 1.2, slam: 1.7, swing: 0.4 }, showHold: 0.9, swingTurns: 2, rope: 0.5,
    ground: { stomp: 1.4, splash: 0.4, pickup: 1.2, pin: 1.0, taunt: 0.8, wait: 0.25 },
    taunt: 0.5, tauntDown: 0.8, catchRebound: 0.5,
    pw: { beam: 0.9, roar: 1.4, charge: 0.6, stomp: 0.7 }, saveAt: 70, saver: 0.5, punish: 0.8, punishAct: { string: 0.2, heavy: 0.5, grab: 0.3 },
    // persona beats: walk pace, P(no-sells a big hit), signature weights [toward, away], rope runs, top-rope dives, heel tricks, lazy covers when ahead, back work
    walk: 0.8, noSell: 0.4, sig: [3.0, 3.5], ropeRun: 0, dive: 0, cheap: 0.08, cockyPin: 0.2, workBack: 0, bldgTaunt: 1.5,
    fireUp: 0.95, vsFire: 'trade', weapon: 1.3, spotLove: 1.4, countBack: 6, countStay: 0, outDive: 0,
    tells: 'jab-jab-HEAVY (guard after the second jab; raise it late and the heavy is reversed); rarely guards, so strike first; loves the press slam and holds you up there (mash); roars in your face (a jab stops it); stomps or gloats over you when you are down; big hits do not always rock it (it no-sells and swings right back: block); RUN-grabs into the CHOKESLAM, or onto its shoulder and through the nearest building (LOOP BULLDOZER)',
  },
  // Tridon: the fast, showy storm dragon. In and out, running clotheslines, whips, dives, and far too much taunting.
  ghidorah: {
    id: 'showman', react: 0.9, space: 22, burst: [1, 3], lull: [0.7, 1.6], sprint: 0.7,
    w: { string: 1.1, heavy: 0.45, grab: 0.9, rush: 1.3, feint: 0.5 },
    len: [0.35, 0.45, 0.20], ender: 0.15,
    guard: 0.25, reversal: 1.0, guardOut: 0.8, grabRev: 1.1, counter: 0.6, counterAct: { string: 0.7, heavy: 0.05, grab: 0.25 },
    poke: 0.5, evade: 0.9, circle: 1.2, stand: 0.2, hitRun: 0.7, zoner: 0.2,
    lock: { whip: 1.9, suplex: 0.6, slam: 0.5, swing: 1.2 }, showHold: 0.3, swingTurns: 3, rope: 1.4,
    ground: { stomp: 0.5, splash: 1.5, pickup: 0.8, pin: 0.9, taunt: 1.7, wait: 0.4 },
    taunt: 1.5, tauntDown: 2.0, catchRebound: 0.95,
    pw: { beam: 0.6, roar: 0.5, charge: 1.3, stomp: 0.4 }, saveAt: 80, // (the jump is saved for the top-rope dive) saver: 0.65, punish: 0.7, punishAct: { string: 0.6, heavy: 0.1, grab: 0.3 },
    walk: 1, noSell: 0, sig: [2.6, 2.6], ropeRun: 2.0, dive: 5, cheap: 0.15, cockyPin: 1.2, workBack: 0, bldgTaunt: 1,
    fireUp: 0.75, vsFire: 'flee', weapon: 0.25, spotLove: 1, countBack: 5, countStay: 0, outDive: 1,
    tells: 'backs out after an exchange and comes back with a running clothesline (block it, or step aside and punish the miss); whips you at the ropes to cut you down on the rebound; taunts after knockdowns (get up and hit him: a taunting kaiju takes x1.4); dives on you when you are down (mash up and he crashes on the mat); sprints himself tired; runs the ropes for a clothesline (block it as he comes back); climbs a corner post to fly at you when you are down (get up, he lands on nothing); covers lazily when ahead (kick out early)',
  },
  // Mechra: the methodical war machine. Holds its range, zones with the cannon, guards, and punishes what you miss.
  mecha: {
    id: 'machine', react: 1.0, space: 22, burst: [2, 3], lull: [1.2, 2.4], sprint: 0.05,
    w: { string: 0.9, heavy: 0.8, grab: 0.7, rush: 0.15, feint: 0.3 },
    len: [0.25, 0.35, 0.40], ender: 0.3,
    guard: 1.0, reversal: 1.2, guardOut: 1.0, grabRev: 1.25, counter: 0.95, counterAct: { string: 0.2, heavy: 0.65, grab: 0.15 },
    poke: 0.4, evade: 0.3, circle: 0.6, stand: 0.8, hitRun: 0.1, zoner: 1.6,
    lock: { whip: 1.1, suplex: 1.1, slam: 1.1, swing: 0.5 }, showHold: 0.4, swingTurns: 2, rope: 0.8,
    ground: { stomp: 0.9, splash: 0.4, pickup: 1.1, pin: 1.3, taunt: 0.25, wait: 0.8 },
    taunt: 0.12, tauntDown: 0.3, catchRebound: 0.7,
    pw: { beam: 1.5, roar: 1.0, charge: 0.8, stomp: 0.5 }, saveAt: 55, saver: 0.4, punish: 1.0, punishAct: { string: 0.25, heavy: 0.45, grab: 0.3 },
    walk: 0.92, noSell: 0, sig: [3.0, 2.6], ropeRun: 0, dive: 0, cheap: 1, cockyPin: 0.1, workBack: 1, bldgTaunt: 0.5,
    fireUp: 0.5, vsFire: 'guard', weapon: 1.0, spotLove: 0.8, countBack: 4, countStay: 1, outDive: 0,
    tells: 'guards strings, so grab it; answers a blocked string with a counter-heavy (stop after the third hit and block: reversal); steps back and fires the cannon when you stand off (sidestep late, punish the recovery); punishes what you miss; slow on its feet, it cannot run you down; a heel: it waits by you as you get up and jumps you (block on the way up), stomps you while you are down, and works your back with the CIRCUIT BREAKER and SYSTEM CRASH (each makes your kick-outs harder this fall)',
  },
});

/** The difficulty model: skill k = 1 - exp(-curve x difficulty); each pair is [k = 0, k = 1]. */
export const AI_TUNE = {
  curve: 1.8,
  react: [0.42, 0.18],        // s to notice something (x persona.react, x1.6 while rocked, +-15 %)
  expect: 0.55,               // x reaction when it is braced for a strike (close, and the foe has been swinging)
  guardOut: [0.08, 0.90],     // P(raises its guard between the hits of your string): what stops a button-masher (on k^1.5: it comes late)
  reversal: [0.03, 0.75],     // P(goes for the just-in-time block against a strike it saw coming)
  revJitter: [0.15, 0.04],    // s of timing error on that attempt
  block: [0.22, 0.96],        // P(simply blocks a slow strike it saw coming: heavy, clothesline)
  grabRev: [0.04, 0.85],      // P(turns your grab around in the tie-up)
  grabDodge: [0.05, 0.60],    // P(steps back out of your reach)
  mash: [2.5, 8.0],           // presses / s when held or down (it also sells: slower when hurt)
  punish: [0.30, 0.95],       // P(goes after a whiff, a taunt, a committed power)
  hitConfirm: [0.25, 0.95],   // P(stops a string that is hitting air)
  misjudge: [0.20, 0.03],     // P(starts a strike from too far out)
  useEnv: [0.35, 0.95],       // P(uses the tower / rope it can see)
  lull: [1.3, 0.55],           // x lull length
  burst: [0, 2.0],            // + actions per burst
  pause: [0.55, 0.12],        // s between actions inside a burst (+ up to the same again)
  groundDelay: [0.9, 0.2],    // s before it acts on a downed foe
  pinNoise: [0.22, 0.05],     // error on its read of how beaten you are
  lockDelay: [0.5, 0.03],     // s it holds the tie-up before its move (+lockMin): your window to mash out
  daze: [0.55, 0.08],         // s it stays passive after being hit hard / getting up
  powerRate: [0.6, 1.25],     // x how often it reaches for a signature power
  mercyChain: 3, mercyLock: 7, // follow-ups / seconds on a foe without control before it backs off
  farGap: 62,                 // further than this it is not a fight but a chase
};

/** What the commentary says when a persona beat happens ({0} = the rival's name). */
const VOICE = Object.freeze({
  godzilla: {
    noSell: ['{0} shrugs it off!', '{0} walks right through that!', 'That only made {0} angry!'],
    building: ['{0} is looking for a building!', '{0} wants to put somebody through the skyline!', '{0} is redecorating the Loop!'],
    taunt: ['{0} beats its chest! The ground is shaking!', '{0} demands respect from Chicago!'],
    fire: ['{0} is HULKING UP!', '{0} is shaking the whole park!', 'You just made {0} mad!'],
  },
  ghidorah: {
    ropes: ['{0} hits the ropes!', 'Off the ropes, here comes {0}!', '{0} using the cables like a slingshot!'],
    dive: ['{0} is going up top!', '{0} is climbing the corner post!', 'Up on the tower! {0} is going to fly!'],
    outDive: ['{0} flies over the ropes onto the floor!', 'A dive to the outside by {0}!'],
    lazy: ['A lazy cover! {0} is getting cocky!', 'One foot on the chest? Disrespectful, {0}!', '{0} thinks this is already over!'],
    taunt: ['{0} is soaking it up!', 'Look at {0} showboating!', '{0} cannot stop posing!'],
  },
  mecha: {
    cheap: ['Cheap shot by {0}!', '{0} jumped the gun! Despicable!', 'No honour from {0}!'],
    stomp: ['{0} keeps putting the boots in!', 'The crowd is letting {0} hear it!', 'Kicking a kaiju while it is down, {0}?'],
    work: ['{0} is working on the back!', '{0} is targeting that spine!', 'Methodical. {0} is taking you apart piece by piece.'],
    reversal: ['{0} saw that coming a mile away!', 'Calculated. {0} reads everything.', 'Countered by the machine!'],
    countStay: ['{0} wants to win this by count-out!', '{0} is just standing in the ring, waiting!', 'Coward! {0} will not go out there!'],
    guardFire: ['{0} covers up and waits it out!', 'Cold as steel: {0} weathers the storm.'],
  },
});
const SIDE_YAW = { e: HALF_PI, w: -HALF_PI, s: 0, n: Math.PI };
const _scan = { t: 2, b: null };
function _scanVisit(b, t) { if (!b.isFence && b.h >= 8 && t < _scan.t) { _scan.t = t; _scan.b = b; } }
const _m = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

/** @returns {{ start, update, dispose, enabled, skill, setRng, onNote, debug }} */
export function createRivalAI(ctx, W) {
  let rnd = Math.random;
  let P = PERSONAS.godzilla;
  let now = 0;
  const offs = [];
  // Everything the brain remembers (reset per fall)
  const S = {
    key: '', k: 0, lead: 0, cocky: 0, desperate: 0,
    // perception
    thr: false, thrKind: '', thrHitAt: 0, thrActAt: 0, thrDo: 0,   // an incoming strike and what it decided to do about it: 0 eat it, 1 block, 2 reversal, 3 step back
    gthr: false, gthrAt: 0, gthrSeen: 0, gthrDo: 0,                // an incoming grab: 0 nothing, 1 step back
    grabRevAt: -1, mashFrom: 0, mashT: 0,
    openUntil: 0, openSeen: 0, openGo: false,                      // the foe is stuck in a whiff / taunt / power
    rockedUntil: 0, dazeUntil: 0,
    foeAggro: 0, foeBlockT: 0, myBlocked: 0, hitsTaken: 0,
    foeFreeT: 0, foeLockT: 0, chain: 0, awayT: 0, fullT: 0, nearT: 0,
    // tempo
    mode: 'lull', modeT: 1, budget: 0, pauseT: 0,
    // plan
    plan: '', planT: 0, planDur: 0, act: '', range: 1, stage: 0, strafe: 1, wantGap: 12, busyT: 0, nextRush: false,
    hitsLeft: 0, ender: false, decided: null,
    guardUntil: 0, counterAt: -1, counterAct: '',
    // ground game
    gPlan: '', gAt: 0, gActs: 0,
    // holds
    holdSeen: false, holdMove: '', holdAt: 0, holdAim: 0, holdAimOn: false, holdT: 0, toss: false, showT: 0, turns: 2,
    // the city
    envT: 0, envAhead: 0, envYaw: 0, envScore: 0, envKind: '', envName: '',
    // steering
    navSide: 1, navHold: 0, stuckT: 0, sampleT: 0, sx: 0, sz: 0, want: 0,
    diveStage: 0, finT: 0, tauntCd: 0, powerCd: 0, catchGo: -1, run: false, chase: false, saving: false, fromPickup: false, flee: 0, fleeT: 0, fpx: 0, fpz: 0, sprinting: false, dt: 0, _kind: '',
    fvx: 0, fvz: 0, milOn: false, milHurt: 0, swat: null, swatCd: 0, beamEye: 0,
    // persona beats
    noSell: false, noSellT: 0, noSellCd: 0, voiceAt: 0, shoutAt: 0, cheapGo: false, lazyPin: false, dozerYaw: 0, dozerOn: false,
    ropeSide: '', rx: 0, rz: 0, ropeCalled: false, postX: 0, postZ: 0, bldgT: -99, sigCd: 0,
    fireTry: 0, foeFireUntil: 0, wx: 0, wz: 0, countSaid: false, outDiveCd: 0,
  };
  const T = AI_TUNE;
  const sk = (pair) => lerp(pair[0], pair[1], S.k);
  const note = (tag, a, b) => { if (ai.onNote) ai.onNote(tag, a, b); };
  const react = () => sk(T.react) * P.react * (now < S.rockedUntil ? 1.6 : 1) * (0.85 + 0.3 * rnd());
  const hpF = (f) => Math.max(0, f.hp) / Math.max(1, f.maxHp);
  // The persona speaks: a ticker line (at most one every 4 s), a big callout (one every 3 s), the crowd's answer
  function voice(key, tone) {
    const L = VOICE[S.key] && VOICE[S.key][key];
    if (!L || now < S.voiceAt || !W.rival) return;
    S.voiceAt = now + 4;
    const e = W.bus.ev(EV.COMMENTARY);
    e.text = L[Math.floor(rnd() * L.length) % L.length].replace('{0}', W.rival.name); e.tone = tone || 'hype';
    W.bus.emit(EV.COMMENTARY);
    note('voice', key, '');
  }
  function shout(text) {
    if (now < S.shoutAt) return;
    S.shoutAt = now + 3;
    const e = W.bus.ev(EV.CALLOUT);
    e.text = text; e.tier = 'move'; e.who = 'rival'; e.sub = '';
    W.bus.emit(EV.CALLOUT);
  }
  function crowd(kind, impact) {
    if (!W.rival) return;
    const e = W.bus.ev(EV.CROWD_POP);
    e.kind = kind; e.impact = impact; e.x = W.rival.pos.x; e.z = W.rival.pos.z;
    W.bus.emit(EV.CROWD_POP);
  }

  // Weighted choice without allocating
  const _opt = new Array(16).fill(''), _wt = new Float64Array(16);
  let _n = 0;
  const opt = (name, w) => { if (w > 0 && _n < 16) { _opt[_n] = name; _wt[_n] = w; _n++; } };
  function choose() {
    let s = 0;
    for (let i = 0; i < _n; i++) s += _wt[i];
    let u = rnd() * s;
    for (let i = 0; i < _n; i++) { u -= _wt[i]; if (u <= 0) return _opt[i]; }
    return _n ? _opt[_n - 1] : '';
  }
  function chooseOf(table) {
    _n = 0;
    for (const k in table) opt(k, table[k]);
    return choose();
  }

  function readSkill() {
    S.k = ai.skill !== null ? clamp01(ai.skill) : clamp01(1 - Math.exp(-T.curve * (W.match.state.difficulty || 0)));
  }
  function resetFall() {
    if (W.rival) usePersona(W.rival);
    readSkill();
    S.thr = false; S.gthr = false; S.grabRevAt = -1; S.mashT = 0;
    S.openUntil = 0; S.openGo = false; S.rockedUntil = 0; S.dazeUntil = 0;
    S.foeAggro = 0; S.foeBlockT = 0; S.myBlocked = 0; S.hitsTaken = 0;
    S.foeFreeT = 2; S.foeLockT = 0; S.chain = 0; S.awayT = 0; S.fullT = 0; S.nearT = 0;
    // Every fall opens with a feeling-out moment
    S.mode = 'lull'; S.modeT = 0.8 + rnd() * 0.8 + 0.8 * (1 - S.k); S.budget = 0; S.pauseT = 0;
    S.plan = ''; S.planT = 0; S.act = ''; S.nextRush = false; S.hitsLeft = 0; S.ender = false; S.decided = null;
    S.guardUntil = 0; S.counterAt = -1; S.gPlan = ''; S.gActs = 0; S.holdSeen = false; S.fromPickup = false;
    S.envT = 0; S.envAhead = 0; S.navHold = 0; S.stuckT = 0; S.sampleT = 0; S.want = 0;
    S.finT = 0; S.tauntCd = 3; S.powerCd = 2; S.catchGo = -1; S.chase = false; S.saving = rnd() < 0.3; S.flee = 0; S.fleeT = 0;
    S.fvx = 0; S.fvz = 0; S.milOn = false; S.milHurt = 0; S.swat = null; S.swatCd = 0; S.beamEye = 0;
    S.noSell = false; S.noSellCd = 0; S.voiceAt = 0; S.shoutAt = 0; S.cheapGo = false; S.lazyPin = false; S.dozerOn = false;
    S.ropeSide = ''; S.ropeCalled = false; S.bldgT = -99; S.sigCd = 0;
    S.fireTry = 0; S.foeFireUntil = 0; S.countSaid = false; S.outDiveCd = 0;
    if (W.player) { S.fpx = W.player.pos.x; S.fpz = W.player.pos.z; }
    S.strafe = rnd() < 0.5 ? 1 : -1;
  }
  function usePersona(me) {
    if (S.key === me.key) return;
    S.key = me.key;
    P = PERSONAS[me.key] || PERSONAS.godzilla;
    S.wantGap = P.space;
  }

  // ------------------------------------------------------------------ what it hears (events only set fields)
  function onStrikeStart(e) {
    if (e.who !== 'player' || !W.rival) return;
    const me = W.rival, foe = W.player, kind = e.kind;
    S.foeAggro = Math.min(3, S.foeAggro + 1);
    if (kind === 'stomp' || kind === 'splash') return; // those come when it is already down
    const st = me.state;
    if (st !== 'neutral' && st !== 'blocking' && st !== 'staggered' && st !== 'attacking') return;
    const reach = kind === 'clothesline' ? 40 : 18;
    if (me.gapTo(foe) > reach) return;
    // (a running clothesline arrives when the dash has covered the gap, not when its wind-up ends)
    const eta = kind === 'clothesline' ? Math.max(e.windup, 0.12 + (me.gapTo(foe) - 5) / 64) : e.windup;
    S.thr = true; S.thrKind = kind; S.thrHitAt = now + eta; S.thrDo = 0;
    S.chase = false;
    const des = 1 + 0.8 * S.desperate, lazy = 1 - 0.6 * S.cocky;
    if (st === 'staggered' || st === 'blocking') {
      // Between the hits of a string: the reflex to cover up as soon as it can
      if (rnd() < lerp(T.guardOut[0], T.guardOut[1], Math.pow(S.k, 1.5)) * P.guardOut * des * lazy + (st === 'blocking' ? 0.5 : 0)) { S.thrDo = 1; S.thrActAt = now; }
      return;
    }
    const braced = (me.gapTo(foe) < 16 && S.foeAggro > 1.2) || kind === 'clothesline'; // it saw the run-up
    const see = now + react() * (braced ? T.expect : 1);
    const u = rnd(), pRev = sk(T.reversal) * P.reversal * des * lazy, pBlk = sk(T.block) * (0.4 + 0.6 * P.guard) * des * lazy;
    if (now < S.rockedUntil) return; // still seeing stars: it eats this one
    if (u < pRev) {
      const lead = 0.06 + rnd() * 0.1 + (rnd() - 0.5) * 2 * sk(T.revJitter);
      S.thrActAt = S.thrHitAt - lead;
      if (S.thrActAt >= see) S.thrDo = 2;
    } else if (u < pRev + pBlk) {
      // A plain block has to be up early (a late one IS the reversal: that is skill, rolled above)
      if (see <= S.thrHitAt - TUNE.reversalWindow - 0.03) { S.thrDo = 1; S.thrActAt = see; }
    } else if (u < pRev + pBlk + P.evade * 0.25 && (kind === 'heavy' || kind === 'clothesline') && see < S.thrHitAt - 0.25) {
      S.thrDo = 3; S.thrActAt = see;
    }
  }
  function onStrikeLanded(e) {
    if (e.target === 'rival') {
      S.hitsTaken = Math.min(6, S.hitsTaken + 1);
      // Gorrak: sometimes a big shot does not rock it at all (it swings straight back: see neutral)
      if ((e.impact >= 0.4 || e.counter) && P.noSell && W.rival && now >= S.noSellCd && hpF(W.rival) > 0.35 && rnd() < P.noSell * lerp(0.55, 1, S.k)) {
        S.noSell = true; S.noSellT = now; S.noSellCd = now + 9 + rnd() * 6;
      } else if (e.impact >= 0.4 || e.counter) {
        // Rocked: slow to react and passive for a moment after it recovers (the sell)
        S.rockedUntil = Math.max(S.rockedUntil, now + 0.8 + e.impact);
        S.dazeUntil = Math.max(S.dazeUntil, now + 0.7 + sk(T.daze) * (0.6 + e.impact));
      }
      S.counterAt = -1;
    } else if (e.who === 'rival') { S.myBlocked = Math.max(0, S.myBlocked - 0.5); S.chase = false; }
  }
  function onStrikeBlocked(e) {
    if (e.who === 'rival') { S.myBlocked = Math.min(4, S.myBlocked + 1); return; }
    // It blocked one: answer once the string is over (a poor fighter answers too soon and eats the next hit)
    const last = e.kind !== 'light' || e.combo >= 3;
    const early = !last && rnd() < lerp(0.22, 0.02, S.k);
    if ((last || early) && rnd() < P.counter * lerp(0.45, 1, S.k)) {
      S.counterAt = now + TUNE.blockStun + 0.03 + rnd() * lerp(0.2, 0.04, S.k);
      S.counterAct = chooseOf(P.counterAct);
    }
    S.guardUntil = Math.max(S.guardUntil, now + (last ? 0.3 : 0.55));
  }
  function onStrikeReversed(e) {
    if (e.who === 'rival') open(1.0, 1);
    else { S.rockedUntil = now + 1.4; S.dazeUntil = now + 1.0 + sk(T.daze); S.budget = 0; }
  }
  function onStrikeWhiffed(e) {
    if (e.who !== 'player') return;
    const m = MOVES[e.kind === 'light' ? 'light' + (e.combo || 1) : e.kind];
    if (m) open(m.recover, e.kind === 'light' ? 0.5 : 1);
  }
  // The foe cannot defend for `dur` s: decide now whether it will go after it; it notices after its reaction time
  function open(dur, weight) {
    if (now + dur <= S.openUntil) return;
    S.openUntil = now + dur; S.openSeen = now + react();
    S.openGo = rnd() < sk(T.punish) * P.punish * weight * (1 - 0.5 * S.cocky) * (1 + 0.5 * S.desperate);
  }
  function onGrabAttempt(e) {
    if (e.who !== 'player') return;
    S.gthr = true; S.gthrAt = now + MOVES.grab.startup; S.gthrSeen = now + react();
    S.gthrDo = rnd() < sk(T.grabDodge) * (0.4 + P.evade) && S.gthrSeen < S.gthrAt - 0.12 ? 1 : 0;
  }
  function onGrabStart(e) {
    if (e.who === 'player') {
      // In the tie-up: turn it around at once (a read, decided here), else fight the hold
      const p = sk(T.grabRev) * P.grabRev * (1 + 0.6 * S.desperate);
      S.grabRevAt = rnd() < p ? now + 0.06 + rnd() * 0.15 : -1;
      S.mashFrom = now + react();
      S.thr = false; S.gthr = false;
    } else {
      // (the tie-up that follows its own pick-up keeps the move it already chose)
      if (S.fromPickup) S.fromPickup = false; else S.holdSeen = false;
      S.chase = false;
    }
  }
  function onTauntStart(e) { if (e.who === 'player') open(e.dur, 1.2); }
  // The player's classic powers. The jump, the dash and the ultimate take a moment to arrive: cover up if it sees
  // them in time. (The beam is instant: only a guard already up stops it; see beamEye in track().)
  function onPowerFired(e) {
    if (e.who !== 'player' || !W.rival) return;
    const me = W.rival, d = me.distTo(W.player), pw = e.power;
    const eta = pw === 'stomp' ? 0.55 : pw === 'charge' ? 0.3 + Math.max(0, d - 30) / 90 : pw === 'ult' ? 0.6 : 0;
    const reach = pw === 'stomp' ? 55 : pw === 'charge' ? 95 : pw === 'ult' ? 150 : 0;
    if (eta > 0 && d < reach && (me.state === 'neutral' || me.state === 'blocking') && now >= S.rockedUntil) {
      const see = now + react() * (S.beamEye > 0.5 ? T.expect : 1);
      if (see < now + eta - 0.05 && rnd() < sk(T.block) * (0.5 + 0.5 * P.guard) * (1 + 0.8 * S.desperate) * (1 - 0.6 * S.cocky)) {
        S.thr = true; S.thrKind = pw; S.thrHitAt = now + eta + 0.35; S.thrDo = 1; S.thrActAt = see;
      }
    }
    open(pw === 'stomp' ? 0.95 : 0.7, 0.8);
  }
  function onKnockdown(e) {
    if (e.who === 'player') { S.gPlan = ''; S.gActs = 0; }
    else { S.budget = 0; S.plan = ''; S.noSell = false; }
  }
  // Military run-ins: shells in the back are noticed, and a tank underfoot is a tank
  function onDamage(e) { if (e.who === 'rival' && e.by === 'military') S.milHurt = Math.min(40, S.milHurt + e.amount); }
  function pickSwat(me) {
    const list = ctx.world && ctx.world.enemies;
    S.swat = null;
    if (!list) return false;
    let best = 70 * 70;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u || u.dead || !u.root || (u.type !== 'tank' && u.type !== 'artillery' && u.type !== 'soldier')) continue;
      const dx = u.root.position.x - me.pos.x, dz = u.root.position.z - me.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; S.swat = u; }
    }
    return !!S.swat;
  }
  function onComeback(e) {
    if (e.who !== 'player') return;
    S.foeFireUntil = now + e.dur;
    if (P.vsFire === 'guard') voice('guardFire', 'neutral');
  }
  function onGetup(e) {
    // The heel decides now whether to be waiting when it stands
    if (e.who === 'player') S.cheapGo = P.cheap > 0.5 && rnd() < P.cheap * lerp(0.25, 0.75, S.k);
  }
  function onRivalBeat(e) {
    // The persona's answer to its own big moments
    const ev = e.event;
    if (ev === EV.TAUNT_START && e.who === 'rival' && rnd() < 0.6) voice('taunt');
    else if ((ev === EV.STRIKE_REVERSED || ev === EV.GRAB_REVERSED) && e.who === 'rival' && P.cheap > 0.5) voice('reversal');
    else if (ev === EV.PIN_START && e.who === 'rival' && S.lazyPin) { S.lazyPin = false; shout('LAZY COVER!'); voice('lazy', 'shock'); crowd('boo', 0.6); }
    else if (ev === EV.BUILDING_IMPACT && e.by === 'rival') S.bldgT = now;
  }
  function onGetupDone(e) {
    if (e.who !== 'rival') return;
    S.dazeUntil = Math.max(S.dazeUntil, now + sk(T.daze));
    enterLull(0.5 + rnd() * 0.9);
  }
  function onKickout(e) {
    // Its cover was kicked out of: frustration feeds the desperation
    if (e.who === 'player') { S.dazeUntil = now + 0.9 + sk(T.daze); S.plan = ''; enterLull(0.6 + rnd() * 0.6); }
  }

  // ------------------------------------------------------------------ tempo
  function enterEngage() {
    S.mode = 'engage';
    S.budget = P.burst[0] + Math.floor(rnd() * (P.burst[1] - P.burst[0] + 1) + sk(T.burst) * rnd() + S.desperate);
    S.pauseT = 0;
  }
  function enterLull(dur) {
    S.mode = 'lull';
    S.modeT = dur !== undefined ? dur : lerp(P.lull[0], P.lull[1], rnd()) * sk(T.lull) * (1 + 0.5 * S.cocky) * (1 - 0.45 * S.desperate);
    S.strafe = rnd() < 0.35 ? -S.strafe : S.strafe;
  }

  // ------------------------------------------------------------------ the city: what is there to throw it into
  function scanDir(x, z, yaw, range) {
    _scan.t = 2; _scan.b = null;
    ctx.sweepBuildings(x, z, x + Math.sin(yaw) * range, z + Math.cos(yaw) * range, 8, _scanVisit);
    return _scan.b ? _scan.t * range : -1;
  }
  // Score one direction from (x, z): a building in the way (landmarks most of all), or a rope that still stands
  function scoreDir(x, z, yaw, range, cardinal) {
    const A = W.arena && W.arena.info;
    let score = 0, kind = '';
    if (cardinal && A && Math.abs(x - A.cx) < A.half && Math.abs(z - A.cz) < A.half) {
      const ropes = W.grapple.ropes;
      if (ropes && ropes[cardinal] > 0) {
        const d = cardinal === 'e' ? A.cx + A.half - x : cardinal === 'w' ? x - (A.cx - A.half) : cardinal === 's' ? A.cz + A.half - z : z - (A.cz - A.half);
        if (d < range * 0.8) { score = (ropes[cardinal] > 1 ? P.rope : 0.45); kind = 'rope'; }
      }
    }
    const d = scanDir(x, z, yaw, range);
    if (d >= 0 && kind !== 'rope') {
      const big = ctx.landmarkName(_scan.b) !== '';
      const s = 1 + (big ? 0.8 : 0) + 0.5 * (1 - d / range);
      if (s > score) { score = s; kind = big ? 'landmark' : 'building'; }
    }
    S._kind = kind;
    return score;
  }
  // All round, from where the foe would be let go: the best direction to send it
  function scanAround(me, foe, range, ropes) {
    const x = foe.pos.x, z = foe.pos.z, noise = lerp(1.2, 0.2, S.k);
    S.envScore = 0; S.envKind = ''; S.envName = ''; S.envYaw = me.yawTo(foe);
    let bestB = null;
    for (let i = 0; i < 12; i++) {
      const yaw = -Math.PI + i * (Math.PI / 6);
      const card = !ropes ? '' : i === 0 ? 'n' : i === 3 ? 'w' : i === 6 ? 's' : i === 9 ? 'e' : ''; // (only a whipped body comes back off the ropes)
      const s = scoreDir(x, z, yaw, range, card) * (1 + (rnd() - 0.5) * noise);
      if (s > S.envScore) { S.envScore = s; S.envYaw = yaw; S.envKind = S._kind; bestB = S._kind === 'rope' ? null : _scan.b; }
    }
    if (bestB) S.envName = ctx.landmarkName(bestB);
    // A landmark set piece in reach (spots.js: the fountain, the lake, the L, Michigan Avenue): the persona's favourite target
    const sp = W.spots && W.spots.bestSpot ? W.spots.bestSpot(foe, 110) : null;
    if (sp) {
      const sc = 2.1 * P.spotLove * (1 - 0.5 * sp.dist / 110) * (1 + (rnd() - 0.5) * noise);
      if (sc > S.envScore) { S.envScore = sc; S.envYaw = Math.atan2(sp.dirX, sp.dirZ); S.envKind = 'landmark'; S.envName = sp.name; }
    }
    if (S.envKind === 'rope') S.envName = Math.abs(S.envYaw) < 0.1 ? 'south' : Math.abs(S.envYaw) > 3 ? 'north' : S.envYaw > 0 ? 'east' : 'west';
    // A weaker fighter often does not look
    if (rnd() > sk(T.useEnv)) { S.envScore = 0; S.envKind = ''; S.envName = ''; S.envYaw = me.yawTo(foe); }
  }
  // Cheap and occasional: is there something right behind the foe? (raises its appetite for the grab)
  function glanceAhead(me, foe) {
    const yaw = me.yawTo(foe);
    let card = '';
    for (const k in SIDE_YAW) if (Math.abs(angDiff(yaw, SIDE_YAW[k])) < 0.45) card = k;
    S.envAhead = Math.min(1.5, scoreDir(foe.pos.x, foe.pos.z, yaw, 120, card));
  }

  // ------------------------------------------------------------------ steering
  function blocked(x, z) {
    const b = ctx.buildingAt(x, z);
    return !!b && !b.destroyed && !b.isFence && b.h >= 5;
  }
  function inBounds(x, z, margin) {
    const bd = ctx.world && ctx.world.bounds;
    return !bd || (x > bd.minX + margin && x < bd.maxX - margin && z > bd.minZ + margin && z < bd.maxZ - margin);
  }
  // Walk along (dx, dz) (unit), around buildings rather than into them
  function go(me, it, dx, dz, mag, sprint) {
    const p = me.pos, look = me.collideRadius + 9;
    if (blocked(p.x + dx * look, p.z + dz * look)) {
      const yaw = Math.atan2(dx, dz);
      if (S.navHold <= 0) S.navSide = rnd() < 0.5 ? 1 : -1;
      S.navHold = 0.7;
      let found = false;
      for (let pass = 0; pass < 2 && !found; pass++) {
        const side = pass === 0 ? S.navSide : -S.navSide;
        for (let i = 1; i <= 3 && !found; i++) {
          const a = yaw + side * i * 0.55;
          if (!blocked(p.x + Math.sin(a) * look, p.z + Math.cos(a) * look)) { dx = Math.sin(a); dz = Math.cos(a); found = true; if (pass === 1) S.navSide = side; }
        }
      }
    }
    it.sprint = !!sprint && !me.tired && me.stamina > 12;
    if (!it.sprint) mag *= P.walk; // (Gorrak lumbers)
    it.moveX = dx * mag; it.moveZ = dz * mag;
    S.want += mag * me.cfg.stats.speed * (it.sprint ? 32 : 18) * me.speedMult * (me.tired ? TUNE.tiredMove : 1) * S.dt;
  }
  function toward(me, it, x, z, mag, sprint) {
    const dx = x - me.pos.x, dz = z - me.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.5) go(me, it, dx / d, dz / d, mag, sprint);
  }
  // Away from the foe; along it when there is no room behind (a wall, the edge of the map)
  function away(me, foe, it, mag, sprint) {
    const dx = me.pos.x - foe.pos.x, dz = me.pos.z - foe.pos.z, d = Math.hypot(dx, dz) || 1;
    let nx = dx / d, nz = dz / d;
    const px = me.pos.x + nx * 26, pz = me.pos.z + nz * 26;
    if (!inBounds(px, pz, 20) || blocked(px, pz)) { const t = nx; nx = -nz * S.strafe; nz = t * S.strafe; }
    go(me, it, nx, nz, mag, sprint);
  }
  // Circle the foe at about wantGap
  function circle(me, foe, it, mag) {
    const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d, err = clamp01(Math.abs(me.gapTo(foe) - S.wantGap) / 12) * Math.sign(me.gapTo(foe) - S.wantGap);
    let mx = -nz * S.strafe * (1 - 0.5 * Math.abs(err)) + nx * err, mz = nx * S.strafe * (1 - 0.5 * Math.abs(err)) + nz * err;
    const m = Math.hypot(mx, mz) || 1;
    mx /= m; mz /= m;
    const px = me.pos.x + mx * 22, pz = me.pos.z + mz * 22;
    if (!inBounds(px, pz, 24) || blocked(px, pz)) { S.strafe = -S.strafe; return; }
    go(me, it, mx, mz, mag, false);
  }
  // Has it been walking into something? (twice a second)
  function watchStuck(dt, me) {
    S.sampleT += dt;
    if (S.navHold > 0) S.navHold -= dt;
    if (S.sampleT < 0.5) return;
    const moved = Math.hypot(me.pos.x - S.sx, me.pos.z - S.sz);
    if (S.want > 4 && moved < S.want * 0.25) {
      S.stuckT += S.sampleT;
      if (S.stuckT >= 1) { S.navSide = -S.navSide; S.navHold = 1.4; S.strafe = -S.strafe; }
    } else S.stuckT = 0;
    S.sx = me.pos.x; S.sz = me.pos.z; S.sampleT = 0; S.want = 0;
  }

  // ------------------------------------------------------------------ the ring (Tridon's playground)
  // A standing rope behind it, away from the foe, to bounce off and come back with a clothesline: sets S.ropeSide / rx / rz
  function ropeTarget(me, foe) {
    const A = W.arena && W.arena.info, ropes = W.grapple.ropes;
    if (!A || !ropes) return false;
    const x = me.pos.x, z = me.pos.z, h = A.half;
    if (Math.abs(x - A.cx) > h - 4 || Math.abs(z - A.cz) > h - 4) return false;
    const fx = foe.pos.x - x, fz = foe.pos.z - z, fd = Math.hypot(fx, fz) || 1;
    let best = 1e9;
    S.ropeSide = '';
    for (const k in SIDE_YAW) {
      if (!(ropes[k] > 0) || (A.ropes && A.ropes[k] && A.ropes[k].up === false)) continue;
      const tx = k === 'e' ? A.cx + h - 5 : k === 'w' ? A.cx - h + 5 : x;
      const tz = k === 's' ? A.cz + h - 5 : k === 'n' ? A.cz - h + 5 : z;
      const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
      if (d < 12 || d > 70 || dx * fx + dz * fz > 0.25 * d * fd) continue; // (not toward the foe: it comes back at it)
      if (d < best) { best = d; S.ropeSide = k; S.rx = tx; S.rz = tz; }
    }
    return S.ropeSide !== '';
  }
  // Foreign objects (spots.js)
  function armedNow(me) { return !!(W.spots && W.spots.armed && W.spots.armed(me)); }
  function findWeapon(me, r) {
    const w = W.spots && W.spots.nearestWeapon ? W.spots.nearestWeapon(me, r) : null;
    if (!w) return false;
    S.wx = w.x; S.wz = w.z;
    return true;
  }
  // The count-out (spots.js): back in before ten, or (the heel) stay in and let the referee count the foe out;
  // Tridon flies over the ropes onto a foe on the floor. True when it took this frame.
  function countOut(me, foe, it, gap) {
    const sp = W.spots;
    if (!sp || !sp.outside || !sp.count) return false;
    const c = sp.count;
    if (c.who === 'rival' && !sp.outside(foe) && c.n >= Math.max(1, P.countBack - Math.round(2 * S.k))) {
      sp.homeTo(me, _m);
      toward(me, it, _m.x, _m.z, 1, true);
      it.faceYaw = Math.atan2(_m.x - me.pos.x, _m.z - me.pos.z);
      return true;
    }
    if (c.who === 'player' && sp.outside(foe) && !sp.outside(me)) {
      if (P.outDive && now >= S.outDiveCd && gap > 20 && gap < 70 && me.can('pstomp') && me.momentum >= POWERS.stomp.cost && foe.state !== 'downed' && rnd() < 0.02 * P.outDive) {
        S.outDiveCd = now + 12;
        it.power = 'stomp'; shout('DIVE TO THE OUTSIDE!'); voice('outDive'); crowd('pop', 0.9);
        return true;
      }
      if (!P.countStay && c.n >= 1) {
        // Everyone else waits at the edge of the venue nearest the foe (stepping out would stop the count)
        if (gap < 16) return false;
        sp.homeTo(foe, _m);
        if (Math.hypot(_m.x - me.pos.x, _m.z - me.pos.z) > 8) toward(me, it, _m.x, _m.z, 0.8, false);
        return true;
      }
      if (P.countStay && c.n >= 1) {
        // The heel stays in the ring and lets the count run (it still answers a foe that comes to it)
        if (gap < 16) return false;
        if (!S.countSaid) { S.countSaid = true; voice('countStay', 'shock'); crowd('boo', 0.7); }
        if (S.tauntCd <= 0 && c.n >= 4 && gap > 40) { it.taunt = true; S.tauntCd = 8; }
        return true;
      }
    }
    if (!c.who) S.countSaid = false;
    return false;
  }
  // Gorrak's run with the foe on its shoulder: the best building within reach of the charge (sets S.dozerYaw)
  function dozerAim(me) {
    let best = 0;
    for (let i = 0; i < 12; i++) {
      const yaw = -Math.PI + i * (Math.PI / 6), sc = scoreDir(me.pos.x, me.pos.z, yaw, 100, '') * (1 + (rnd() - 0.5) * lerp(1, 0.2, S.k));
      if (sc > best) { best = sc; S.dozerYaw = yaw; }
    }
    return best > 0 && rnd() < sk(T.useEnv) + 0.2;
  }
  // A corner post to fly from onto a downed foe (24..80 u from it): sets S.postX / postZ
  function pickPost(foe) {
    const A = W.arena && W.arena.info;
    if (!A || !A.posts) return false;
    let best = 80 * 80, ok = false;
    for (let i = 0; i < A.posts.length; i++) {
      const q = A.posts[i];
      if (q.up === false) continue;
      const dx = q.x - foe.pos.x, dz = q.z - foe.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > 24 * 24 && d2 < best) { best = d2; S.postX = q.x; S.postZ = q.z; ok = true; }
    }
    return ok;
  }

  // ------------------------------------------------------------------ powers
  function spendOk(me, cost) {
    if (S.powerCd > 0) return false;
    const left = me.momentum - cost;
    if (left < 0) return false;
    if (S.chase || S.desperate > 0.6) return true;
    return !S.saving && me.momentum < P.saveAt;
  }
  function powerW(me, name, gap) {
    const canName = name === 'stomp' ? 'pstomp' : name;
    if (!me.can(canName) || !spendOk(me, POWERS[name].cost)) return 0;
    const rate = sk(T.powerRate) * (1 + 0.8 * S.desperate) * P.pw[name];
    if (name === 'beam') return gap > 26 && gap < 165 ? rate * (gap > 45 ? 1.2 : 0.6) : 0;
    if (name === 'roar') return gap < 20 ? rate * 0.7 * (gap < 11 && S.foeAggro > 1 ? lerp(0.8, 0.1, S.k) : 1) : 0; // (a jab stops it cold: the better ones wait for room)
    if (name === 'charge') return gap > 12 && gap < 36 ? rate * 0.8 : 0;
    return gap > 18 && gap < 66 ? rate * 0.7 : 0; // the jump
  }
  // The foe's speed across the line between the two (u/s)
  function crossing(me, foe) {
    const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1;
    return Math.abs(S.fvx * dz - S.fvz * dx) / d;
  }
  // A clear line for the beam: nothing tall between the two
  function lineClear(me, foe) {
    const d = scanDir(me.pos.x, me.pos.z, me.yawTo(foe), me.distTo(foe));
    return d < 0;
  }

  // ------------------------------------------------------------------ neutral: choosing what to do
  function setAct(act) {
    S.plan = 'act'; S.planT = 0; S.act = act; S.stage = 0;
    S.range = (act === 'string' || act === 'heavy' || act === 'grab') && rnd() < sk(T.misjudge) ? 1.6 : 1;
    S.run = rnd() < P.sprint;
  }
  function setPlan(plan, dur) { S.plan = plan; S.planT = 0; S.planDur = dur; S.stage = 0; }

  function pickAttack(me, foe, gap) {
    const soft = foe.state === 'staggered' || foe.state === 'stunned';
    const turtle = (Math.min(1, S.foeBlockT * 1.5) + Math.min(1, S.myBlocked * 0.4)) * lerp(0.4, 1, S.k); // a novice keeps punching the guard
    const env = 1 + S.envAhead * sk(T.useEnv);
    const fit = me.stamina > 26 ? 1 : 0.15;
    _n = 0;
    if (S.chase) {
      // The foe will not stand and fight: run it down
      // (a foe in full flight outruns everything but a point-blank clothesline and the beam)
      const flee = S.flee > 10;
      const fast = me.speedMult > 1.2; // the crowd is on its side: it can run this one down
      opt('rush', gap > 9 && gap < (flee && !fast ? 14 : 24) && !me.tired ? 3 : 0);
      opt('charge', flee && !fast ? 0 : powerW(me, 'charge', gap) * 2);
      // A full meter and a foe that will not come near: the big one reaches a long way
      opt('ult', me.can('ult') && gap < 75 ? 5 : 0);
      opt('beam', crossing(me, foe) < 14 ? powerW(me, 'beam', gap) * (flee ? 6 : 3) : 0); // (a foe running across the line walks out of the beam)
      opt('stomp', S.stuckT > 1 ? powerW(me, 'stomp', gap) * 3 : !flee && gap < 34 ? powerW(me, 'stomp', gap) * 0.6 : 0); // (over a building in the way; a foe on the move walks out from under it)
      // Out of reach and out of momentum: play to the crowd, which fills the meter (and dares the foe to come back)
      opt('taunt', gap > 42 && S.tauntCd <= 0 && me.momentum < 60 ? 1.2 + P.taunt : 0);
      opt('grab', !flee && gap < 12 ? 2 : 0); opt('string', !flee && gap < 10 ? 1 : 0);
      opt('close', 2);
    } else if (S.nextRush && gap > 12 && !me.tired) { S.nextRush = false; opt('rush', 3); opt('stomp', powerW(me, 'stomp', gap) * 2); opt('string', 0.6); }
    else if (soft && gap < 18) { opt('grab', P.w.grab * 2 * env * fit * (me.momentum >= 100 ? 3 : 1)); opt('heavy', P.w.heavy * 1.6); opt('string', 0.3); }
else {
      const last = hpF(foe) < 0.04 ? 1 : 0; // only a big move takes the last of its health
      const arm = armedNow(me) ? 1 : 0;     // (with a girder in hand every strike is a swing of it)
      const fl = me.comebackPhase === 'flurry' ? 1 : 0, noGrab = foe.comebackPhase ? 0 : 1; // (its own flurry: strings and heavies; a fired-up foe reverses grabs)
      opt('string', P.w.string * (turtle > 0.6 ? 0.5 : 1) * (last ? 0.15 : 1) * (1 + 1.5 * arm) * (1 + 2 * fl));
      opt('heavy', P.w.heavy * (foe.tired ? 1.6 : 1) * (turtle > 0.6 ? 0.6 : 1) * (1 + last) * (1 + 2 * arm) * (1 + 2 * fl));
      opt('grab', noGrab * (1 - fl) * P.w.grab * (1 + 2.6 * turtle) * env * (foe.tired ? 1.8 : 1) * fit * (1 + 1.5 * last) * (me.momentum >= 100 ? 3 : 1)); // (a full meter: the finisher comes out of the tie-up)
      opt('rush', gap > 13 && gap < 42 && !me.tired ? P.w.rush * fit * (1 + 0.6 * S.desperate) : 0);
      opt('ropes', P.ropeRun && gap < 55 && !me.tired && me.stamina > 30 && ropeTarget(me, foe) ? P.ropeRun * fit * (1 + 0.5 * S.cocky) : 0);
      opt('feint', gap < 34 ? P.w.feint * (1 + turtle) : 0);
      opt('roar', powerW(me, 'roar', gap) * (1 + turtle));
      opt('charge', powerW(me, 'charge', gap));
      opt('stomp', powerW(me, 'stomp', gap));
      opt('beam', powerW(me, 'beam', gap) * 0.6);
      // Full momentum and no opening for the finisher: the big one
      if (me.can('ult') && gap < 60 && (S.fullT > 5 || S.desperate > 0.6)) opt('ult', 2.5);
    }
    const a = choose();
    if (a === 'feint') setPlan('feint', 0.9 + rnd() * 0.6);
    else if (a === 'close') setPlan('close', 0.7 + rnd() * 0.8);
    else if (a === 'ropes') { setPlan('ropes', 2.6); note('ropes', S.ropeSide, ''); }
    else setAct(a || 'string');
  }

  function think(me, foe, gap) {
    if (gap > T.farGap) { setPlan('pursue', 0.8 + rnd() * 0.8); return; }
    if (S.chase && !me.tired) { S.mode = 'engage'; S.budget = Math.max(S.budget, 2); }
    else if ((me.tired || me.stamina < 16) && S.mode === 'engage') enterLull(1.4 + rnd());
    if (S.mode === 'engage') {
      if (S.budget > 0) { pickAttack(me, foe, gap); return; }
      enterLull();
      if (rnd() < P.hitRun && gap < 20) { S.nextRush = rnd() < 0.7; setPlan('backoff', 0.5 + rnd() * 0.5); S.stage = 1; return; }
    }
    // Lull: spacing, a look, a taunt, something from range; an answer if the foe brings the fight
    const pressed = gap < 16 && (S.foeAggro > 0.8 || S.nearT > lerp(0.45, 0.2, S.k));
    _n = 0;
    if (pressed) {
      opt('grab', P.w.grab * 0.5 * (me.stamina > 26 ? 1 : 0.1) * (S.foeAggro > 1.5 ? 0.3 : 1));
      opt('guard', P.guard * (1 + S.desperate) * (me.stamina > 30 ? 1 : 0.2) * lerp(0.5, 1.2, S.k));
      opt('poke', P.poke);
      opt('backoff', P.evade * (me.tired ? 3 : 1));
      opt('roar', powerW(me, 'roar', gap));
      opt('hold', 0.25 * (1 - S.k));
    } else {
      opt('circle', P.circle);
      // Step out to cannon range and fire (the zoner's habit)
      opt('zone', gap <= 30 && me.can('beam') && spendOk(me, POWERS.beam.cost) ? P.zoner * sk(T.powerRate) : 0);
      opt('hold', P.stand * (gap > S.wantGap - 4 ? 1 : 0.3));
      opt('backoff', gap < S.wantGap - 5 ? 0.9 : 0);
      opt('feint', gap < 34 ? P.w.feint : 0);
      opt('ropes', P.ropeRun && gap < 40 && !me.tired && me.stamina > 40 && ropeTarget(me, foe) ? P.ropeRun * 0.6 * (1 + S.cocky) : 0);
      // A girder lying about: Gorrak and the heel go and rip it up
      opt('weapon', P.weapon && gap > 14 && !armedNow(me) && findWeapon(me, 70) ? P.weapon * lerp(0.6, 1.2, S.k) * (1 + 0.6 * S.desperate) : 0);
      opt('taunt', gap > 26 + 16 * S.k && S.tauntCd <= 0 && foe.state !== 'attacking' && S.foeAggro < 0.5 ? P.taunt * (0.5 + 1.5 * S.cocky) * lerp(1.2, 0.4, S.k) * (S.desperate > 0.5 ? 0.3 : 1) : 0);
      opt('beam', powerW(me, 'beam', gap) * 2);
      opt('stomp', powerW(me, 'stomp', gap) * 0.7);
      opt('charge', powerW(me, 'charge', gap) * 0.6);
      opt('guard', gap < 15 ? P.guard * 0.3 : 0);
      // Stared down from range with the beam loaded: cover up for a moment (the better ones do, and then close in)
      opt('beamguard', S.beamEye > 0.4 && me.stamina > 35 ? (0.6 + P.guard) * 2.5 * S.k : 0);
      // Shells in the back: go and stand on what is firing them
      opt('swat', S.milOn && S.swatCd <= 0 && gap > 20 && S.milHurt > 3 && pickSwat(me) ? 1.2 + S.milHurt * 0.15 : 0);
    }
    const c = choose();
    switch (c) {
      case 'circle': setPlan('circle', 0.6 + rnd() * 0.9); break;
      case 'backoff': setPlan('backoff', 0.4 + rnd() * 0.5); break;
      case 'zone': setPlan('backoff', 1.2); S.stage = 2; break;
      case 'feint': setPlan('feint', 0.9 + rnd() * 0.6); break;
      case 'guard': setPlan('guard', 0.5 + rnd() * 0.8); S.guardUntil = now + S.planDur; break;
      case 'beamguard': setPlan('guard', 0.7 + rnd() * 0.7); S.stage = 1; S.guardUntil = now + S.planDur; note('beam-guard', '', ''); break;
      case 'ropes': setPlan('ropes', 2.6); S.budget = Math.max(S.budget, 1); note('ropes', S.ropeSide, ''); break;
      case 'weapon': setPlan('weapon', 3.5); note('weapon', '', ''); break;
      case 'swat': setPlan('swat', 3.2); S.swatCd = 6 + rnd() * 5; note('swat', S.swat.type, ''); break;
      case 'poke': setAct('string'); S.budget = Math.max(S.budget, 1); break;
      case 'grab': setAct('grab'); S.budget = Math.max(S.budget, 1); break;
      case 'taunt': case 'beam': case 'stomp': case 'charge': case 'roar': setAct(c); break;
      default: setPlan('hold', 0.35 + rnd() * 0.7);
    }
  }

  // Gap within which an action is started (and the least gap for the ones that need room)
  function actRange(act) {
    switch (act) {
      case 'string': return 8.5;
      case 'heavy': return 12.5;
      case 'grab': return 8.5;
      case 'rush': return 25;
      case 'roar': return 20;
      case 'charge': return 34;
      case 'stomp': return 64;
      case 'beam': return 160;
      case 'ult': return 78;
      default: return 1e9; // taunt: where it stands
    }
  }
  function fire(me, foe, it, act) {
    S.decided = null; S.hitsLeft = 0; S.ender = false;
    if (act === 'grab' && foe.comebackPhase) act = 'heavy'; // (a fired-up foe turns every grab around)
    switch (act) {
      case 'string': {
        it.strike = true;
        const u = rnd();
        S.hitsLeft = u < P.len[0] ? 0 : u < P.len[0] + P.len[1] ? 1 : 2;
        S.ender = S.hitsLeft < 2 && rnd() < P.ender;
        break;
      }
      case 'heavy': it.heavy = true; break;
      case 'grab': it.grab = true; break;
      case 'rush': {
        const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1;
        it.moveX = dx / d; it.moveZ = dz / d; it.sprint = true; it.strike = true;
        break;
      }
      case 'taunt': it.taunt = true; S.tauntCd = (S.chase ? 6 : 7) + rnd() * (S.chase ? 4 : 6); break; // (in a chase: some walking between the poses)
      default:
        // A signature power (the core telegraphs it). Afterwards it may decide to build toward the finisher instead
        it.power = act; S.powerCd = 3.5 + rnd() * 3;
        S.saving = rnd() < P.saver * (0.5 + 0.5 * S.k);
    }
    note(act, '', '');
    if (act !== 'taunt') S.budget--;
    S.plan = 'busy'; S.busyT = 0;
  }
  function afterAct(me, foe) {
    S.plan = '';
    if (S.mode !== 'engage') return;
    if (S.budget <= 0 || me.gapTo(foe) > 40) { S.budget = Math.min(S.budget, 0); return; } // think() turns that into the lull
    S.pauseT = sk(T.pause) * (1 + rnd());
  }

  function runPlan(dt, me, foe, it, gap) {
    S.planT += dt;
    switch (S.plan) {
      case 'act': {
        const act = S.act, r = actRange(act) * S.range;
        const min = act === 'rush' ? 12 : act === 'charge' ? 10 : act === 'stomp' ? 16 : act === 'beam' ? 22 : 0;
        if (S.planT > 3.2 || !foe.hittable) { S.plan = ''; return; }
        if (gap < min) { away(me, foe, it, 1, false); return; }
        if (gap > r) { toward(me, it, foe.pos.x, foe.pos.z, 1, gap > 38 || act === 'rush' || S.run || S.chase); return; }
        if (!me.facing(foe, act === 'beam' || act === 'charge' ? 0.25 : 0.6)) return; // still turning
        if (act === 'beam' && !lineClear(me, foe)) { S.plan = ''; return; }
        fire(me, foe, it, act);
        return;
      }
      case 'busy':
        S.busyT += dt;
        if (S.busyT > 0.1) afterAct(me, foe);
        return;
      case 'circle':
        circle(me, foe, it, 0.75);
        break;
      case 'backoff':
        // stage 1: the hit-and-run exit (a sprint out to its own range); stage 2: out to beam range, then fire
        if (S.stage === 2) {
          if (gap < 30 && S.planT < S.planDur) { away(me, foe, it, 1, false); return; }
          if (gap > 24) setAct('beam'); else S.plan = '';
          return;
        }
        if (gap < S.wantGap + (S.stage ? 10 : 0)) away(me, foe, it, 1, S.stage === 1);
        else if (S.stage) S.planT = S.planDur;
        break;
      case 'swat': {
        const u = S.swat;
        if (!u || u.dead || !u.root || gap < 14) { S.plan = ''; S.swat = null; return; }
        toward(me, it, u.root.position.x, u.root.position.z, 1, false); // (game.js crushes what the rival walks over)
        it.faceYaw = Math.atan2(u.root.position.x - me.pos.x, u.root.position.z - me.pos.z);
        break;
      }
      case 'guard':
        if ((gap > 24 && S.stage !== 1) || me.stamina < 22) { S.plan = ''; return; }
        if (me.can('block')) it.block = true;
        break;
      case 'feint':
        // Step in as if to strike, stop short and look: a guard that comes up gets grabbed
        if (S.stage === 0) {
          if (gap > 10) toward(me, it, foe.pos.x, foe.pos.z, 1, gap > 16);
          else { S.stage = 1; S.planT = 0; S.planDur = 0.22 + rnd() * 0.25 + react() * 0.5; }
          if (S.planT > 1.6) S.plan = '';
          return;
        }
        if (S.planT >= S.planDur) {
          if (foe.state === 'blocking' && rnd() < lerp(0.5, 0.95, S.k)) { note('feint-grab', '', ''); setAct('grab'); }
          else if (rnd() < 0.5 + 0.3 * S.k) setAct(rnd() < 0.6 ? 'string' : 'heavy');
          else setPlan('backoff', 0.4);
          if (S.mode === 'lull') S.budget = Math.max(S.budget, 1);
        }
        return;
      case 'ropes': {
        // Into the ropes behind it at a sprint, off them, and back at the foe with the clothesline
        if (me.tired) { S.plan = ''; return; }
        if (Math.hypot(S.rx - me.pos.x, S.rz - me.pos.z) > 6 && S.planT < 2.4) { toward(me, it, S.rx, S.rz, 1, true); it.faceYaw = Math.atan2(S.rx - me.pos.x, S.rz - me.pos.z); return; }
        const e = W.bus.ev(EV.ROPE_REBOUND);
        e.who = 'rival'; e.side = S.ropeSide; e.speed = 70; e.ropeHp = W.grapple.ropes[S.ropeSide] || 0; e.x = me.pos.x; e.z = me.pos.z;
        W.bus.emit(EV.ROPE_REBOUND);
        if (!S.ropeCalled) { S.ropeCalled = true; shout('OFF THE ROPES!'); }
        voice('ropes');
        setAct('rush'); S.run = true; S.range = 1;
        if (S.mode === 'lull') { S.mode = 'engage'; S.budget = Math.max(S.budget, 1); }
        return;
      }
      case 'weapon': {
        // Walk to the girder, rip it up (a grab with the foe out of reach: spots.js)
        if (armedNow(me) || !findWeapon(me, 80)) { S.plan = ''; return; }
        if (gap < 10) { S.plan = ''; return; }
        if (Math.hypot(S.wx - me.pos.x, S.wz - me.pos.z) - me.radius > 9) { toward(me, it, S.wx, S.wz, 1, gap < 30); return; }
        it.grab = true; S.plan = 'busy'; S.busyT = 0;
        return;
      }
      case 'pursue':
        pursue(dt, me, foe, it, gap);
        break;
      case 'close':
        if (gap > 9) intercept(me, foe, it, burst(me));
        else S.planT = S.planDur;
        break;
      default: break; // hold: stand its ground
    }
    if (S.planT >= S.planDur) S.plan = '';
  }

  // Run to where a fleeing foe is going, not where it is (cuts the corner on one that circles away)
  function intercept(me, foe, it, sprint) {
    const d = me.distTo(foe), sp = me.cfg.stats.speed * (sprint ? 32 : 18);
    const t = S.flee > 6 ? Math.min(2.2, d / Math.max(10, sp)) * 0.8 : 0;
    _m.set(foe.pos.x + S.fvx * t, 0, foe.pos.z + S.fvz * t);
    ctx.clampToBounds(_m);
    toward(me, it, _m.x, _m.z, 1, sprint);
  }
  // A run in bursts: it sprints until it is blowing, walks until it has its wind back (something is kept for the fight)
  function burst(me) {
    S.sprinting = S.sprinting ? me.stamina > 22 : me.stamina > 55;
    return S.sprinting;
  }
  // The foe has left the fight (running, wrecking the city, out in the lake): go after it, and make it pay from range
  function pursue(dt, me, foe, it, gap) {
    if (gap < T.farGap - 12) { S.plan = ''; return; }
    if (S.stuckT > 1.4) {
      // Walled in: over it or through it
      if (me.can('pstomp') && S.powerCd <= 0) { fire(me, foe, it, 'stomp'); return; }
      if (me.can('charge') && S.powerCd <= 0 && me.facing(foe, 0.3)) { fire(me, foe, it, 'charge'); return; }
    }
    if (S.planT >= S.planDur) {
      // Every second or so: something better than walking?
      S.planT = 0; S.planDur = 0.8 + rnd() * 0.8;
      _n = 0;
      opt('run', 2.2);
      if (S.awayT > 2.5) {
        opt('beam', me.can('beam') && S.powerCd <= 0 && gap < 170 && me.facing(foe, 0.4) && crossing(me, foe) < 14 && lineClear(me, foe) ? 3.5 : 0);
        opt('stomp', me.can('pstomp') && S.powerCd <= 0 && gap < 70 && S.stuckT > 1 ? 2 : 0);
        // Nothing in the tank: play to the crowd, which fills it (and dares the foe to come back)
        opt('taunt', gap > 85 && S.tauntCd <= 0 && me.momentum < 100 ? 1.2 + P.taunt : 0);
        opt('ult', me.can('ult') && gap < 75 ? 4 : 0);
      }
      const c = choose();
      if (c !== 'run' && c !== '') { fire(me, foe, it, c); if (c === 'taunt') S.tauntCd = 6 + rnd() * 4; return; }
    }
    intercept(me, foe, it, burst(me));
  }

  // The foe is on the mat: stomp, dive, drag it up, cover it, or gloat
  function ground(dt, me, foe, it) {
    const g = W.grapple;
    foe.mid(_m);
    it.faceYaw = Math.atan2(_m.x - me.pos.x, _m.z - me.pos.z);
    const gg = me.groundGap(foe);
    if (S.gPlan === '') {
      S.gPlan = 'look'; S.gAt = now + react() * 0.6 + sk(T.groundDelay) * (0.6 + 0.8 * rnd());
    }
    if (S.gPlan === 'look') {
      // Close the distance while it makes up its mind
      if (gg > 16) toward(me, it, _m.x, _m.z, 1, gg > 40 && P.sprint > 0.1);
      if (now < S.gAt || foe.falling > 0) return;
      const est = g.pinStrength(foe) + (rnd() - 0.5) * 2 * sk(T.pinNoise);
      const heel = P.cheap > 0.5 ? 1 : 0; // (the heel stays on a downed foe one shot longer)
      const mercy = S.chain >= T.mercyChain + heel || S.foeLockT > T.mercyLock + 2 * heel, long = S.foeLockT > T.mercyLock * 0.6;
      const second = S.gActs > 0;
      const G = P.ground;
      _n = 0;
      // (on its last legs jabs and stomps cannot finish it: cover it)
      if (foe.finished > 0 || est < 0.2 || hpF(foe) < 0.04) opt('pin', 12);
      else {
        // After a slam or another big move on a hurt foe it covers early and hopefully (the kick-out at two is the drama);
        // a cover on a fresh foe is cheap: only a desperate one tries it
        const big = foe.lastImpact >= 0.55 && hpF(foe) < 0.75 ? 1 : 0;
        opt('pin', est < 0.36 ? G.pin * 4 : est < 0.5 ? G.pin * (0.9 + 1.2 * S.desperate) * (1 + 1.2 * big) : big ? G.pin * 0.7 : G.pin * 0.25 * S.desperate);
        // Tridon ahead: a lazy cover on a foe that is nowhere near done (it will kick out; the crowd lets him know)
        if (P.cockyPin && S.cocky > 0.3 && est >= 0.5) opt('pin', P.cockyPin * S.cocky * 1.4);
        if (!mercy) {
          opt('stomp', gg < 30 ? G.stomp * (second ? 0.6 : 1) * (1 + 0.5 * P.workBack * (foe.worked || 0)) : 0);
          // Tridon: up on a corner post, and fly
          opt('dive', P.dive && !second && me.can('pstomp') && me.momentum >= POWERS.stomp.cost && foe.stateDur - foe.stateT > 0.6 && pickPost(foe) ? P.dive * (1 + S.cocky) * lerp(0.5, 1, S.k) : 0);
          opt('splash', gg > 12 && gg < MOVES.splash.reach - 2 && me.stamina > 20 ? G.splash * (1 + 0.5 * S.cocky) : 0);
          opt('pickup', !second && !long && S.chain < 2 && me.stamina > 28 ? G.pickup : 0);
        }
        opt('taunt', S.tauntCd <= 0 && !second ? P.tauntDown * (0.6 + 1.2 * S.cocky) * lerp(1.3, 0.55, S.k) * (mercy ? 3 : 1) * (S.desperate > 0.5 ? 0.3 : 1) * (now - S.bldgT < 5 ? P.bldgTaunt : 1) : 0);
        opt('wait', G.wait * (mercy ? 4 : 1) * (second ? 2 : 1));
      }
      S.gPlan = choose() || 'wait';
      S.planT = 0; S.diveStage = 0;
      S.lazyPin = S.gPlan === 'pin' && est >= 0.5 && P.cockyPin > 0.5;
      if (S.gPlan === 'stomp' && P.cheap > 0.5) { crowd('boo', 0.5); voice(foe.worked ? 'work' : 'stomp', 'neutral'); }
      note('ground', S.gPlan, '');
      if (S.gPlan !== 'taunt' && S.gPlan !== 'wait') S.chain++;
    }
    S.planT += dt;
    const p = S.gPlan;
    if (p === 'wait') { if (gg < 18) away(me, foe, it, 0.7, false); return; }
    if (p === 'taunt') {
      if (gg < 12) { away(me, foe, it, 1, false); if (S.planT < 0.5) return; }
      it.taunt = true; S.tauntCd = 8 + rnd() * 6; S.gPlan = 'done'; S.gActs++;
      return;
    }
    if (p === 'done') {
      // Back in neutral after the stomp / taunt: once more, if the foe is still down
      if (S.gActs < 2 && rnd() < 0.6 * dt * 6) S.gPlan = '';
      else if (gg < 14) away(me, foe, it, 0.6, false);
      return;
    }
    if (p === 'dive') {
      if (S.diveStage === 0) {
        if (Math.hypot(S.postX - me.pos.x, S.postZ - me.pos.z) > 12 && S.planT < 2.2) { toward(me, it, S.postX, S.postZ, 1, true); return; }
        S.diveStage = 1; S.planT = 0;
        shout('TO THE TOP ROPE!'); voice('dive'); crowd('ooh', 0.8);
        return;
      }
      // a beat up there, eyes on the body, then it flies (the jump lands where the foe lies now: get up and it hits nothing)
      if (S.planT < 0.35) return;
      if (foe.state === 'downed') it.power = 'stomp';
      S.gPlan = 'done'; S.gActs++;
      return;
    }
    if (S.planT > 3) { S.gPlan = 'done'; return; }
    if (p === 'splash') {
      if (gg > MOVES.splash.reach - 3) { toward(me, it, _m.x, _m.z, 1, true); return; }
      if (gg < 10) { away(me, foe, it, 1, false); return; }
      it.heavy = true; S.gPlan = 'done'; S.gActs++;
      return;
    }
    const reach = p === 'stomp' ? MOVES.stomp.reach + 2 : MOVES.reach.reach + 2;
    if (gg > reach) { toward(me, it, _m.x, _m.z, 1, gg > 30); return; }
    if (p === 'stomp') it.strike = true; else if (p === 'pin') it.pin = true; else it.grab = true;
    S.gPlan = 'done'; S.gActs++;
  }

  // Its own throw is still travelling: follow it; a whipped foe coming back off the ropes can be cut down
  function follow(dt, me, foe, it, gap) {
    const fl = W.grapple.flight(foe);
    if (!fl) return;
    if (fl.mode === 'run' && fl.rebounds > 0) {
      if (S.catchGo < 0) S.catchGo = rnd() < P.catchRebound * lerp(0.5, 1, S.k) ? 1 : 0;
      if (S.catchGo === 1) {
        const closing = Math.hypot(fl.vx, fl.vz) + 40, eta = (gap - 5) / closing;
        const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1;
        if (eta < 0.5 && gap > 8 && !me.tired) {
          it.moveX = dx / d; it.moveZ = dz / d; it.sprint = true; it.strike = true;
          S.catchGo = 2; note('rebound-clothesline', '', '');
          S.plan = 'busy'; S.busyT = 0;
        }
      }
      return;
    }
    S.catchGo = -1;
    if (gap > 30) toward(me, it, foe.pos.x, foe.pos.z, 0.8, P.sprint > 0.5);
  }

  function neutral(dt, me, foe, it) {
    const g = W.grapple;
    const gap = me.gapTo(foe);
    it.faceYaw = me.yawTo(foe);
    if (S.pauseT > 0) S.pauseT -= dt;
    const down = foe.state === 'downed' && !foe.held;
    // The finisher: momentum full and the foe hurt in front of it
    if (me.momentum >= 100 && !foe.held && (down || foe.state === 'stunned' || foe.state === 'staggered')) {
      if (g.canFinisher(me)) {
        S.finT += dt;
        if (S.finT >= 0.15 + sk(T.daze)) { it.finisher = true; S.finT = 0; S.saving = false; note('finisher', '', ''); S.plan = 'busy'; S.busyT = 0; }
        return;
      }
      if (gap < 70) { toward(me, it, foe.pos.x, foe.pos.z, 1, true); return; }
    } else S.finT = 0;

    // A strike it saw coming
    if (S.thr) {
      if (now > S.thrHitAt + 0.06) S.thr = false;
      else if (S.thrDo && now >= S.thrActAt) {
        if (S.thrDo === 3) { away(me, foe, it, 1, true); return; }
        if (me.can('block')) {
          it.block = true;
          S.guardUntil = S.thrHitAt + 0.15 + (S.thrDo === 1 ? rnd() * 0.5 : 0);
          return;
        }
      }
    }
    // A grab it saw coming
    if (S.gthr) {
      if (now > S.gthrAt + 0.12) S.gthr = false;
      else if (S.gthrDo === 1 && now >= S.gthrSeen) { away(me, foe, it, 1, true); return; }
    }
    if (down) { ground(dt, me, foe, it); return; }
    S.gPlan = '';
    if (countOut(me, foe, it, gap)) return;
    // The foe has fired up: Gorrak trades, Tridon wants no part of it, Mechra covers up and waits it out
    if (now < S.foeFireUntil && foe.comebackPhase) {
      if (P.vsFire === 'flee' && gap < 34) { away(me, foe, it, 1, true); return; }
      if (P.vsFire === 'guard' && gap < 24 && me.can('block') && me.stamina > 25) { it.block = true; S.guardUntil = now + 0.4; return; }
    }
    if (foe.held) { follow(dt, me, foe, it, gap); return; }
    S.catchGo = -1;
    // A rising foe gets room (and so does one it has been all over). The heel waits right on top of it instead
    if (foe.state === 'gettingUp' || foe.invulnT > 0) {
      if (S.cheapGo) { if (gap > 9) toward(me, it, foe.pos.x, foe.pos.z, 0.8, false); }
      else if (gap < S.wantGap) away(me, foe, it, 0.7, false);
      S.plan = '';
      return;
    }
    if (S.cheapGo) {
      // ...and jumps it the instant it can be hit (a heavy: the wind-up is the tell, block on the way up)
      S.cheapGo = false;
      if (gap < 13 && foe.hittable && me.stamina > 20) {
        const low = rnd() < 0.4;
        setAct(low ? 'string' : 'heavy'); S.range = 1;
        shout(low ? 'LOW BLOW!' : 'CHEAP SHOT!'); voice('cheap', 'shock'); crowd('boo', 0.8);
        if (S.mode === 'lull') { S.mode = 'engage'; S.budget = Math.max(S.budget, 1); }
        return;
      }
    }
    // Gorrak no-sells it: straight back in with the big one (only right after the hit: a knockdown in between ends it)
    if (S.noSell && now - S.noSellT > 2.5) S.noSell = false;
    if (S.noSell) {
      S.noSell = false;
      S.dazeUntil = 0; S.rockedUntil = 0;
      shout('SHRUGS IT OFF!'); voice('noSell'); crowd('ooh', 0.7);
      setAct(gap < 13 ? 'heavy' : 'rush'); S.range = 1;
      if (S.mode === 'lull') { S.mode = 'engage'; S.budget = Math.max(S.budget, 1); }
      note('no-sell', '', '');
    }
    // Seeing stars
    if (now < S.dazeUntil) {
      if (gap < 10 && S.hitsTaken > 2) away(me, foe, it, 0.45, false);
      return;
    }
    // The foe is wide open (whiffed, taunting, firing): go and get it
    if (S.openGo && now >= S.openSeen && S.plan !== 'busy') {
      const left = S.openUntil - now;
      S.openGo = false;
      if (left > 0.25) {
        const reachT = Math.max(0, gap - 9) / (me.cfg.stats.speed * 32);
        _n = 0;
        if (left - reachT > 0.75) { opt('heavy', P.punishAct.heavy); opt('grab', P.punishAct.grab * (me.stamina > 26 ? 1 : 0.2)); }
        if (left - reachT > 0.35) { opt('string', P.punishAct.string); opt('grab', P.punishAct.grab * 0.5); }
        if (gap > 14 && gap < 40 && left > 0.8 && !me.tired) opt('rush', 0.8);
        if (gap > 30 && left > 1.3) { opt('beam', powerW(me, 'beam', gap) * 2); opt('charge', powerW(me, 'charge', gap)); }
        const a = choose();
        if (a) { note('punish', a, ''); setAct(a); S.range = 1; if (S.mode === 'lull') { S.mode = 'engage'; S.budget = 2; } }
      }
    }
    // Lull clock; a foe that walks away from a lull is chased again at once
    if (S.mode === 'lull') {
      S.modeT -= dt * (S.nearT > 0.3 ? 2 : 1); // crowded: the lull does not last
      if (S.modeT <= 0 && S.plan !== 'busy' && S.plan !== 'act') { enterEngage(); S.plan = ''; }
    }
    if (S.plan === '' && S.pauseT <= 0) think(me, foe, gap);
    if (S.plan !== '') runPlan(dt, me, foe, it, gap);
    else if (S.pauseT > 0 && gap > 9 && S.mode === 'engage') toward(me, it, foe.pos.x, foe.pos.z, 0.6, false); // keep the pressure on between actions
  }

  // ------------------------------------------------------------------ not in neutral
  // Mid-string: the next press, the heavy that ends it, or stop if it is hitting air
  function attacking(me, it) {
    const m = me.move;
    if (!m || m.kind !== 'light' || S.decided === m || me.stateT < m.startup + m.active) return;
    S.decided = m;
    if (me.moveHit === 2 && rnd() < sk(T.hitConfirm)) { S.hitsLeft = 0; S.ender = false; return; }
    if (S.hitsLeft > 0 && m.next) { it.strike = true; S.hitsLeft--; }
    else if (S.ender) { it.heavy = true; S.ender = false; }
  }
  function guarding(me, foe, it) {
    let keep = now < S.guardUntil;
    if (S.thr && now <= S.thrHitAt + 0.06) keep = true;
    if (S.gthr && now >= S.gthrSeen) keep = false;           // a guard is no use against a grab
    if (me.stamina < 14 || (me.gapTo(foe) > 26 && !S.thr && !(S.plan === 'guard' && S.stage === 1))) keep = false;
    if (S.counterAt >= 0 && now >= S.counterAt) {
      // Out of the guard with the answer
      S.counterAt = -1;
      const a = S.counterAct;
      if (me.gapTo(foe) < (a === 'heavy' ? 13 : 9.5)) {
        S.decided = null; S.hitsLeft = 0; S.ender = false;
        if (a === 'heavy') it.heavy = true;
        else if (a === 'grab' && !foe.comebackPhase) it.grab = true;
        else { it.strike = true; S.hitsLeft = rnd() < 0.6 ? 2 : 1; }
        note('counter', a, '');
        S.plan = 'busy'; S.busyT = 0;
        if (S.mode === 'lull') { S.mode = 'engage'; S.budget = 1; }
        return;
      }
    }
    if (!keep && S.plan === 'guard') S.plan = '';
    it.block = keep;
  }
  function mash(dt, it, rate) {
    S.mashT -= dt;
    if (S.mashT <= 0) { S.mashT = 1 / rate * (0.8 + 0.4 * rnd()); it.mash = 1; }
  }
  // Held by the foe: turn it around in the first instant if it read it, otherwise fight the grip
  function struggle(dt, me, it) {
    const h = W.grapple.hold;
    if (S.grabRevAt >= 0 && now >= S.grabRevAt) { S.grabRevAt = -1; if (h.phase === 'lockup' && !h.noRev) it.grab = true; }
    if (now >= S.mashFrom) mash(dt, it, sk(T.mash) * (0.55 + 0.45 * hpF(me)));
  }
  // It has the foe: pick the move (once), then steer the whip / carry / swing
  function driveHold(dt, me, foe, it) {
    const h = W.grapple.hold, G = GRAPPLE;
    if (!S.holdSeen) {
      S.holdSeen = true; S.holdT = 0; S.holdAimOn = false; S.toss = false;
      if (h.phase === 'pickup' || h.phase === 'lockup') {
        scanAround(me, foe, 150, true);
        const env = S.envScore, hurt = 1 - hpF(foe), fit = me.stamina > 30 ? 1 : 0.3, L = P.lock;
        _n = 0;
        opt('whip', L.whip * (1 + env * (0.7 + 2.5 * S.k)));
        opt('suplex', L.suplex * (1 + hurt));
        opt('slam', L.slam * (1 + hurt) * (1 + env * (0.2 + 0.8 * S.k)) * fit);
        opt('swing', L.swing * (1 + 0.5 * env) * (1 + S.cocky) * fit);
        // The signatures (RUN + toward / away, signatures.js): the persona's favourites, saved for when they mean something.
        // Gorrak's LOOP BULLDOZER wants a building to run the foe through.
        const sg = SIGNATURES[me.key], sigOk = !!sg && !!P.sig && now >= S.sigCd && me.stamina > 34 && !me.tired;
        S.dozerOn = sigOk && sg[1].id === 'bulldozer' && dozerAim(me);
        opt('sig1', sigOk ? P.sig[0] * (0.6 + hurt) * lerp(0.7, 1, S.k) * (1 + 1.6 * env) : 0);
        opt('sig2', sigOk ? P.sig[1] * (0.6 + hurt) * lerp(0.7, 1, S.k) * (1 + 1.6 * env) * (sg[1].id !== 'bulldozer' ? 1 : S.dozerOn ? 2.5 : 0.6) : 0);
        S.holdMove = choose() || 'slam';
        if (S.holdMove === 'sig1' || S.holdMove === 'sig2') {
          S.sigCd = now + 7 + rnd() * 5;
          if (S.holdMove === 'sig2' && S.dozerOn) voice('building');
        } else S.dozerOn = false;
        S.holdAt = Math.min(G.lockAuto - 0.08, G.lockMin + 0.05 + sk(T.lockDelay) * (0.5 + rnd())); // (left any longer, the core makes it the lift)
        S.turns = Math.max(1, P.swingTurns - (rnd() < 0.4 ? 1 : 0));
        S.showT = 0.25 + P.showHold * (0.4 + rnd() * 0.8) * (1 + 0.6 * S.cocky);
        if (S.holdMove === 'slam') {
          // Is there something close enough to throw it AT? Otherwise it is the press slam where it stands
          scanAround(me, foe, 90, false);
          S.toss = S.envScore > 0.9;
        }
        if (ai.onNote) ai.onNote('lockup', S.holdMove, S.envScore > 0 ? S.envKind + ' ' + S.envName : '');
      }
    }
    if (h.phase === 'pickup') return;
    S.holdT += dt;
    const ax = Math.sin(S.envYaw), az = Math.cos(S.envYaw), aimed = S.envScore > 0;
    switch (h.phase) {
      case 'lockup':
        if (me.momentum >= 100 && h.t >= 0.2) { it.finisher = true; return; }
        if (h.t < S.holdAt) return;
        if (S.holdMove === 'whip') it.dirZ = 1;
        else if (S.holdMove === 'suplex') it.dirZ = -1;
        else if (S.holdMove === 'sig1' || S.holdMove === 'sig2') {
          it.sprint = true; it.dirZ = S.holdMove === 'sig1' ? 1 : -1;
          if (S.dozerOn) { it.moveX = Math.sin(S.dozerYaw); it.moveZ = Math.cos(S.dozerYaw); }
        }
        else if (S.holdMove === 'swing') it.dirX = S.strafe;
        else it.grab = true;
        S.holdT = 0;
        break;
      case 'whip':
        if (aimed) { it.moveX = ax; it.moveZ = az; }
        break;
      case 'carry':
        if (S.toss && aimed) {
          it.moveX = ax; it.moveZ = az;
          if (h.t > 0.7 && Math.abs(angDiff(S.envYaw, h.yaw)) < 0.25) it.grab = true;
        } else if (h.t >= S.showT) it.grab = true; // held up for the crowd, then down
        break;
      case 'swing':
        if (h.turns >= S.turns) { it.grab = true; if (aimed) { it.moveX = ax; it.moveZ = az; } }
        break;
      case 'sig':
        // The bulldozer is steered at its building through the scoop and the run
        if (S.dozerOn) { it.moveX = Math.sin(S.dozerYaw); it.moveZ = Math.cos(S.dozerYaw); }
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ per frame
  function track(dt, me, foe) {
    const fs = foe.state;
    if (fs === 'neutral' || fs === 'attacking' || fs === 'blocking') {
      S.foeFreeT += dt;
      if (S.foeFreeT > 1.5) { S.foeLockT = 0; S.chain = 0; }
    } else { S.foeFreeT = 0; S.foeLockT += dt; }
    S.foeBlockT = fs === 'blocking' ? Math.min(2, S.foeBlockT + dt) : Math.max(0, S.foeBlockT - dt * 0.4);
    S.foeAggro = Math.max(0, S.foeAggro - dt * 0.55);
    S.myBlocked = Math.max(0, S.myBlocked - dt * 0.2);
    S.hitsTaken = Math.max(0, S.hitsTaken - dt * 0.5);
    // (time spent out of reach while it could have been fighting: being thrown across town is not the foe running away)
    if (me.state === 'neutral' && !me.held) S.awayT = me.gapTo(foe) > T.farGap ? S.awayT + dt : Math.max(0, S.awayT - dt * 2);
    // Is it running? (its speed away from the rival, smoothed)
    if (dt > 0) {
      const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1;
      let vx = (foe.pos.x - S.fpx) / dt, vz = (foe.pos.z - S.fpz) / dt;
      if (foe.held || Math.hypot(vx, vz) > 200) { vx = 0; vz = 0; } // thrown or teleported: not its legs
      const a = Math.min(1, dt * 4);
      S.fvx += (vx - S.fvx) * a; S.fvz += (vz - S.fvz) * a;
      S.flee = (S.fvx * dx + S.fvz * dz) / d;
      S.fpx = foe.pos.x; S.fpz = foe.pos.z;
      S.fleeT = S.flee > 10 && me.gapTo(foe) > 18 ? S.fleeT + dt : 0;
    }
    if (S.awayT > 2.5 || S.fleeT > 1.5) S.chase = true;
    S.fullT = me.momentum >= 100 ? S.fullT + dt : 0;
    S.nearT = me.gapTo(foe) < 16 && (fs === 'neutral' || fs === 'attacking') ? S.nearT + dt : 0;
    S.milHurt = Math.max(0, S.milHurt - dt * 2);
    if (S.swatCd > 0) S.swatCd -= dt;
    // Is the player standing off with the beam loaded and looking this way? (its meter and cooldown are on the HUD)
    const pl = ctx.player, bc = pl && pl.cfg && pl.cfg.beam;
    const loaded = !!bc && !!pl.cooldowns && pl.cooldowns.beam <= 0 && foe.momentum >= (bc.cost || 0) && fs === 'neutral'
      && me.gapTo(foe) > 24 && me.gapTo(foe) < 200 && foe.facing(me, 0.35);
    S.beamEye = loaded ? Math.min(2, S.beamEye + dt) : Math.max(0, S.beamEye - dt * 2);
    if (S.tauntCd > 0) S.tauntCd -= dt;
    if (S.powerCd > 0) S.powerCd -= dt;
    // Who is winning, and how it feels about that
    const mine = hpF(me), theirs = hpF(foe), m = W.match.state;
    S.lead = mine - theirs;
    S.cocky = mine > 0.4 ? clamp01((S.lead - 0.15) / 0.3) : 0;
    S.desperate = clamp01(Math.max((0.35 - mine) / 0.25, (-S.lead - 0.15) / 0.3) + (m.rivalFalls < m.playerFalls ? 0.2 : 0));
    S.envT -= dt;
    if (S.envT <= 0) {
      S.envT = 0.6;
      S.envAhead = me.state === 'neutral' && me.gapTo(foe) < 34 ? 0 : S.envAhead;
      if (me.state === 'neutral' && me.gapTo(foe) < 34) glanceAhead(me, foe);
    }
  }

  const ai = {
    /** QA: false freezes the rival's decisions (it stands and takes it). */
    enabled: true,
    /** QA / tuning: a number 0..1 overrides the skill the match difficulty gives (null = follow the match). */
    skill: null,
    /** Trace hook: (tag, a, b) on each decision worth a line (null in the game). */
    onNote: null,
    /** Read-only view of the brain for QA and traces. */
    get debug() { return S; },
    get persona() { return P; },
    /** Use a seeded generator (tests, simulations). */
    setRng(fn) { rnd = fn || Math.random; },
    start() {
      ai.enabled = true;
      now = 0; S.key = '';
      for (const off of offs) off();
      offs.length = 0;
      const bus = W.bus, on = (name, fn) => offs.push(bus.on(name, fn));
      on(EV.FALL_START, resetFall);
      on(EV.STRIKE_START, onStrikeStart);
      on(EV.STRIKE_LANDED, onStrikeLanded);
      on(EV.STRIKE_BLOCKED, onStrikeBlocked);
      on(EV.STRIKE_REVERSED, onStrikeReversed);
      on(EV.STRIKE_WHIFFED, onStrikeWhiffed);
      on(EV.GRAB_ATTEMPT, onGrabAttempt);
      on(EV.GRAB_WHIFFED, (e) => { if (e.who === 'player') open(MOVES.grab.recover, 1); });
      on(EV.GRAB_START, onGrabStart);
      on(EV.PICKUP, (e) => { if (e.who === 'rival') { S.fromPickup = true; S.holdSeen = false; } });
      on(EV.TAUNT_START, onTauntStart);
      on(EV.STUN, (e) => { if (e.who === 'player') open(e.dur, 1.5); });
      on(EV.POWER_FIRED, onPowerFired);
      on(EV.DAMAGE, onDamage);
      on(EV.INTERFERENCE_ARRIVE, () => { S.milOn = true; S.dazeUntil = Math.max(S.dazeUntil, now + 0.5 * (1 - S.k)); }); // a glance at the newcomers
      on(EV.INTERFERENCE_END, () => { S.milOn = false; S.swat = null; });
      on(EV.KNOCKDOWN, onKnockdown);
      on(EV.GETUP_DONE, onGetupDone);
      on(EV.GETUP, onGetup);
      if (EV.COMEBACK_START) on(EV.COMEBACK_START, onComeback);
      on(EV.TAUNT_START, onRivalBeat); on(EV.STRIKE_REVERSED, onRivalBeat); on(EV.GRAB_REVERSED, onRivalBeat); on(EV.PIN_START, onRivalBeat); on(EV.BUILDING_IMPACT, onRivalBeat);
      on(EV.PIN_KICKOUT, onKickout);
      resetFall();
    },
    /** Fill W.rival.intent for this frame. */
    update(dt) {
      const me = W.rival, foe = W.player;
      if (!me || !foe) return;
      const it = me.intent;
      it.moveX = 0; it.moveZ = 0; it.sprint = false; it.faceYaw = null;
      it.block = false; it.grabHeld = false; it.dirX = 0; it.dirZ = 0;
      if (!ai.enabled || !me.alive || W.match.state.phase !== 'fight') return;
      if (!foe.alive) return; // nothing left to fight: stand over it
      usePersona(me);
      readSkill();
      now += dt; S.dt = dt;
      track(dt, me, foe);
      watchStuck(dt, me);
      const h = W.grapple.hold;
      if (h.active) {
        if (h.V === me) struggle(dt, me, it);
        else if (h.A === me) driveHold(dt, me, foe, it);
        return;
      }
      // The comeback: hurt and behind, it fires up (Gorrak hulks up at once; the machine is slower to)
      // (one roll per offer: a yes fires after a short sell, a no waits 6 s; about half the offers at the first match)
      if (me.comebackReady) {
        if (S.fireTry === 0) S.fireTry = rnd() < P.fireUp * lerp(0.55, 1, S.k) ? 0.3 + rnd() * 0.5 : -6;
        else if (S.fireTry > 0) {
          S.fireTry -= dt;
          if (S.fireTry <= 0) { S.fireTry = -6; it.taunt = true; if (S.key === 'godzilla') voice('fire'); note('fire-up', '', ''); }
        } else if ((S.fireTry += dt) >= 0) S.fireTry = 0;
      } else if (S.fireTry > 0) S.fireTry = 0;
      else if (S.fireTry < 0) S.fireTry = Math.min(0, S.fireTry + dt);
      switch (me.state) {
        case 'neutral': if (!me.held) neutral(dt, me, foe, it); break;
        case 'attacking': attacking(me, it); break;
        case 'blocking': guarding(me, foe, it); break;
        case 'downed':
          // Mashing gets it up sooner; a hurt one stays down longer (and sells it)
          if (!me.held && me.falling <= 0) mash(dt, it, sk(T.mash) * (0.35 + 0.65 * hpF(me)));
          break;
        default: break;
      }
    },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
    },
  };
  return ai;
}
