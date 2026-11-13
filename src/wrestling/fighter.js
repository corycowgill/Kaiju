// Fighter: one abstraction over either kaiju in a match. The player's Fighter
// wraps game.js's player (HP = state.hp, momentum = state.rage, facing =
// state.yaw, neutral movement and the classic powers stay in updatePlayer);
// the rival's owns its root outright. Both are driven by an INTENT struct:
// input.js fills the player's from raw input, rivalAI.js fills the rival's,
// and from there on the two obey exactly the same rules.
// OWNER: combat core (fighter.js + match.js + grapple.js).
//
// What lives here: vitals (health, stamina, momentum), the state machine,
// strikes (light string, heavy, running clothesline, ground stomp, diving
// splash) with startup / active / recovery windows, block + reversal, stagger,
// stun, knockdown, get-up, taunt, the rival's signature powers, and the damage
// intake from game.js's classic attacks. Holds, throws, pins and the finisher
// are grapple.js's: while it drives a body the fighter is `held` and only
// keeps its timers.
//
// Frame data and numbers are in MOVES / POWERS / TUNE below (exported so the
// balance simulation and the AI read the same table the game runs on).
import * as THREE from 'three';
import { EV } from './events.js';
import { ANIMS } from './anims.js';

/** Every state a fighter can be in (design section 3). */
export const STATES = Object.freeze(['neutral', 'attacking', 'blocking', 'staggered', 'grappling', 'grappled',
  'airborne', 'downed', 'gettingUp', 'stunned', 'pinning', 'pinned', 'taunting', 'ko', 'cinematic']);
// The anim a state shows when nothing more specific is playing
const STATE_ANIM = { blocking: 'block', staggered: 'stagger', grappling: 'lockup', grappled: 'lockup', airborne: 'carried',
  stunned: 'stunned', pinning: 'pin_cover', pinned: 'pinned' };
// States in which the fighter does not drive itself: for the player these
// take the root away from updatePlayer (ctx.player.control.external)
const HELPLESS = new Set(['staggered', 'grappling', 'grappled', 'airborne', 'downed', 'gettingUp', 'stunned', 'pinning', 'pinned', 'taunting', 'ko', 'cinematic']);

/** What a fighter wants to do this frame. Edges (strike, heavy, grab, taunt,
 *  finisher, mash, power) are true/non-zero for ONE update and cleared by the
 *  composer; held fields persist while held. */
export function createIntent() {
  return {
    moveX: 0, moveZ: 0,   // desired movement, WORLD space, length 0..1 (also the throw aim during a hold)
    sprint: false,        // held
    faceYaw: null,        // rad: turn to face this (rival only; the player's facing is ctx.player.yaw); null = leave
    strike: false,        // pressed: light strike / next hit of the string (downed foe in reach: ground stomp)
    strikeHeld: false,    // held
    heavy: false,         // pressed: heavy strike (downed foe in reach: diving splash)
    block: false,         // held
    grab: false,          // pressed: grab / pick up a downed foe
    grabHeld: false,      // held (a reach for a downed foe that is still held at contact is a pin)
    pin: false,           // pressed: cover a downed foe for the pin
    dirX: 0, dirZ: 0,     // move choice in a lock-up, relative to own facing: z +1 forward (whip), -1 back (suplex); x +-1 sideways (swing); 0,0 = slam
    taunt: false,         // pressed
    finisher: false,      // pressed (the ultimate button)
    mash: 0,              // mash presses this frame (escape a hold / kick out / get up sooner)
    power: '',            // rival AI only: 'beam' | 'roar' | 'charge' | 'stomp' | 'ult' requested this frame
  };
}
/** Clear the one-frame edges (the composer calls this after every update). */
export function clearIntentEdges(it) {
  it.strike = false; it.heavy = false; it.grab = false; it.pin = false; it.taunt = false; it.finisher = false;
  it.mash = 0; it.power = '';
}

/**
 * Strike frame data. Seconds: startup (the tell) -> active (can connect) ->
 * recover. dmg is base HP at melee stat 60; stam the attacker's stamina cost;
 * reach the gap between the two bodies it covers (u); lunge the step taken in
 * startup; stagger the hit-stun it causes; push the knockback speed (u/s);
 * impact 0..1 its weight for camera / VFX / audio; mom momentum gained on a
 * hit; blockStam what blocking it costs the defender; hs the hit-stop (s);
 * kd: 'always' knocks down, 'weak' knocks down a staggered / stunned / tired
 * target (else staggers); next: the string continues into that move.
 */
export const MOVES = Object.freeze({
  light1:      { id: 'light1', kind: 'light', combo: 1, anim: 'strike_1', startup: 0.22, active: 0.10, recover: 0.30, dmg: 5, stam: 3, reach: 7, lunge: 3, stagger: 0.40, push: 12, impact: 0.22, mom: 2, blockStam: 5, hs: 0.04, high: true, next: 'light2' },
  light2:      { id: 'light2', kind: 'light', combo: 2, anim: 'strike_2', startup: 0.20, active: 0.10, recover: 0.30, dmg: 6, stam: 3, reach: 7, lunge: 3, stagger: 0.36, push: 12, impact: 0.26, mom: 2, blockStam: 5, hs: 0.045, high: false, next: 'light3' },
  light3:      { id: 'light3', kind: 'light', combo: 3, anim: 'strike_3', startup: 0.28, active: 0.12, recover: 0.46, dmg: 9, stam: 4, reach: 8, lunge: 5, stagger: 0.95, push: 28, impact: 0.42, mom: 4, blockStam: 8, hs: 0.07, high: true },
  heavy:       { id: 'heavy', kind: 'heavy', combo: 1, anim: 'heavy', startup: 0.55, active: 0.14, recover: 0.60, dmg: 16, stam: 10, reach: 9, lunge: 7, stagger: 1.10, push: 42, impact: 0.66, mom: 5, blockStam: 16, hs: 0.12, high: true, kd: 'weak' },
  clothesline: { id: 'clothesline', kind: 'clothesline', combo: 1, anim: 'clothesline', startup: 0.30, active: 0.32, recover: 0.70, dmg: 14, stam: 12, reach: 5, dash: 64, stagger: 1.0, push: 48, impact: 0.72, mom: 6, blockStam: 14, hs: 0.14, high: true, kd: 'always' },
  stomp:       { id: 'stomp', kind: 'stomp', combo: 1, anim: 'stomp', startup: 0.40, active: 0.12, recover: 0.42, dmg: 7, stam: 4, reach: 6, lunge: 2, push: 0, impact: 0.4, mom: 2, hs: 0.07, high: false, ground: true },
  splash:      { id: 'splash', kind: 'splash', combo: 1, anim: 'splash', startup: 0.30, active: 0.62, recover: 0.75, dmg: 18, stam: 12, reach: 34, push: 0, impact: 0.8, mom: 6, hs: 0.16, high: false, ground: true, ext: true, peak: 22 },
  grab:        { id: 'grab', kind: 'grab', combo: 1, anim: 'grab_reach', startup: 0.28, active: 0.10, recover: 0.52, dmg: 0, stam: 8, reach: 6, lunge: 5 },
  reach:       { id: 'reach', kind: 'reach', combo: 1, anim: 'grab_reach', startup: 0.32, active: 0.05, recover: 0.30, dmg: 0, stam: 0, reach: 10, lunge: 2, ground: true },
});

/**
 * The rival's signature powers (the player's are game.js's classic ones).
 * windup = the telegraph; cd = cooldown; cost = momentum; dmg = base HP;
 * chipStam = what blocking it costs. Radii and ranges in u.
 */
export const POWERS = Object.freeze({
  beam:   { id: 'beam', kind: 'power', power: 'beam', windup: 0.95, active: 0.35, recover: 0.70, cd: 8, cost: 28, dmg: 20, range: 190, width: 4, impact: 0.6, hs: 0.06, chipStam: 16, clips: ['skill1', 'cast1'] },
  roar:   { id: 'roar', kind: 'power', power: 'roar', windup: 0.80, active: 0.20, recover: 0.70, cd: 9, cost: 20, dmg: 13, radius: 46, impact: 0.5, hs: 0.06, chipStam: 14, clips: ['skill2', 'cast2'] },
  charge: { id: 'charge', kind: 'power', power: 'charge', windup: 0.70, active: 0.55, recover: 0.85, cd: 9, cost: 24, dmg: 17, speed: 80, impact: 0.7, hs: 0.12, chipStam: 18, clips: ['skill3', 'stomp'] },
  stomp:  { id: 'pstomp', kind: 'power', power: 'stomp', windup: 0.40, active: 0.85, recover: 0.60, cd: 7, cost: 15, dmg: 13, radius: 30, peak: 26, maxJump: 75, impact: 0.65, hs: 0.12, chipStam: 14, clips: ['jump', 'stomp'], ext: true },
  ult:    { id: 'ult', kind: 'power', power: 'ult', windup: 1.50, active: 0.30, recover: 1.20, cd: 25, cost: 100, dmg: 34, radius: 95, impact: 1, hs: 0.2, chipStam: 30, clips: ['cast3', 'stomp'], armor: true },
});

/** Tuning shared by both fighters (see the report for how each was arrived at). */
export const TUNE = {
  dmg: 0.58,           // global scale on every move's damage (the fall-length knob)
  // stamina
  stamRegen: 11, stamRegenDown: 7, stamDelay: 0.7, stamRecoverAt: 30, sprintDrain: 4, tiredMove: 0.62,
  // block
  blockDrain: 4, blockMove: 0.35, reversalWindow: 0.20, reblockLock: 0.45, stunReblock: 0.3, chip: 0.15, powerChip: 0.3,
  blockStun: 0.22, guardBreakStun: 1.8, reversalStagger: 1.0, reversalMom: 8,
  // hit reactions
  counterMult: 1.25, tauntHitMult: 1.4, friction: 85, lockMax: 2.4,
  // ground
  fallDur: 0.45, downBase: 1.7, downImpact: 1.6, downHurt: 1.4, downMin: 0.9, downMax: 5.2, mashGetup: 0.13, groundHitsMax: 2,
  getupDur: 0.8, getupInvuln: 0.5,
  // momentum
  momPassive: 0.5, momDrain: 0.2, momHurt: 0.45, // hit while under half health: no drain, the meter FILLS with what it took (the comeback)
  tauntDur: 2.0, tauntMom: 20, tauntMomDown: 30, tauntStam: 20,
  // what a classic player attack does to a kaiju: fraction of its raw damage (they are tuned to one-shot tanks)
  taken: { melee: 0.12, beam: 0.095, atomic: 0.04, roar: 0.064, charge: 0.06, stomp: 0.048, ult: 0.115, military: 0.25, aoe: 0.05 },
  splashMult: 1.7,
  // reversal: the player's window is wider by a reaction allowance; the cue flashes cueLead before it opens
  // (heavies and clotheslines only: a jab is over before anyone could react to a cue). The defender answers
  // a reversal with a counter shot (a reversed heavy / clothesline floors the attacker).
  reversalWindowPlayer: 0.28, cueLead: 0.14, cueMinStartup: 0.4, counterDmg: 8, counterRec: 0.5,
  // comeback ("firing up"): hurt (< cbHp of max), behind on health by cbBehind, beaten (cbBeaten of max taken
  // over the last ~cbMemory s), cbCost momentum in the meter; once a fall, cbPerMatch a match. Taunt fires it.
  cbHp: 0.32, cbBehind: 0.18, cbBeaten: 0.12, cbMemory: 10, cbCost: 35, cbPerMatch: 1, cbRivalGrace: 1,
  cbFire: 1.3, cbFlurry: 3.5, cbNoSell: 0.4, cbHaste: 1.25, cbAtk: 1.15, cbMom: 1, cbAfterStam: 30,
};
const STRIKE_KINDS = { light: 1, heavy: 1, clothesline: 1 };
// The strikes the reversal cue is shown for: slow enough to react to (a heavy), or a run-up (the clothesline)
const cued = (m) => !!STRIKE_KINDS[m.kind] && !m.ground && (m.startup >= TUNE.cueMinStartup || !!m.dash);
// Damage kinds that can take the last of a kaiju's health (everything else stops at 1 HP)
const KO_KINDS = { heavy: 1, clothesline: 1, splash: 1, slam: 1, suplex: 1, toss: 1, swing: 1, building: 1, post: 1, finisher: 1, charge: 1, ult: 1, qa: 1, weapon: 1 };
const POWER_OF = { beam: 'beam', atomic: 'beam', roar: 'roar', charge: 'charge', stomp: 'stomp', ult: 'ult' };
// How long the player's own (classic) powers commit it, s: the rival's punish window
const PLAYER_POWER_COMMIT = { beam: 0.85, roar: 0.7, charge: 0.6, stomp: 0.95, ult: 1.3 };
const PLAYER_POWER_STEER = { beam: 0.25, roar: 0.25, charge: 0, stomp: 1, ult: 0 };
const STRIKE_ARC = 1.0, BLOCK_ARC = 1.35;
const HALF_PI = Math.PI / 2;

const _v = new THREE.Vector3();
const _hurt = { raw: true, x: 0, z: 0, flash: true };
const _dmgOpt = { kind: 'aoe', src: 'rival', aerial: true };
const _animOpt = { fade: 0.1, timeScale: 1, duration: undefined, commit: undefined };
const _onceOpt = { duration: undefined, commit: undefined, hold: false };
const _beam = { t: 1, b: null };
function _beamVisit(b, t) { if (b.h > 6 && t < _beam.t) { _beam.t = t; _beam.b = b; } }
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const animName = (name, fallback) => (ANIMS[name] ? name : fallback);

export class Fighter {
  /** o: { id: 'player'|'rival', key, cfg (MONSTERS entry), glb (kaijuLoader handle) } */
  constructor(ctx, W, o) {
    this.ctx = ctx; this.W = W;
    this.id = o.id;
    this.isPlayer = o.id === 'player';
    this.key = o.key;
    this.cfg = o.cfg;
    this.name = o.cfg.name.toUpperCase();
    this.glb = o.glb;
    this.root = o.glb.root;
    this.head = o.glb.head;
    const bone = (n) => this.root.getObjectByName(n) || null;
    /** Rig sockets (world position via bone.getWorldPosition). Bones are under a 0.18 world scale. */
    this.bones = { hips: bone('Hips'), spine: bone('Spine'), head: bone('Head'), handL: bone('LeftHand'), handR: bone('RightHand'), footL: bone('LeftFoot'), footR: bone('RightFoot') };
    /** Body radius for kaiju-vs-kaiju spacing and hits (u); collideRadius is the smaller building-collision circle. */
    this.radius = ctx.bodyRadius(o.key);
    this.collideRadius = ctx.collideRadius(o.key);
    this.height = 30;
    /** Height of the body's centre over the root when upright (the pivot of setPose), and of the root over the ground when lying on its back. */
    this.hc = 13.5;
    this.lieY = 6;
    this.opponent = null;
    this.intent = createIntent();
    this.vel = new THREE.Vector3();   // knockback velocity (u/s), integrated here with friction
    this.state = 'neutral';
    this.prevState = 'neutral';
    this.stateT = 0;                  // seconds in the current state
    this.stateDur = 0;                // planned length (0 = open-ended)
    this.animName = '';               // wrestling anim playing (anims.js)
    // game.js reads these four on the rival (player attacks, push-out)
    this.targetable = true;           // player attacks / shells can hit it
    this.solid = true;                // takes part in body push-out
    this.pushShare = 0.5;             // share of a body overlap this fighter gives way to (0 = immovable)
    this.aimY = this.height * 0.55;   // height the beam aims at
    this.invuln = false;
    this.speedMult = 1;
    /** Strike damage scale: the kaiju's melee stat (60 = 1) ... */
    this.power = 0.75 + 0.25 * (o.cfg.stats.melee || 60) / 60;
    /** ... times this (the match raises the rival's per fall / defense; the player's damage upgrade is read live). */
    this.atkMult = 1;
    this._hp = 1; this._maxHp = 1;
    this.stamina = 100; this.maxStamina = 100;
    this._momentum = 0;
    this._momShadow = 0;              // the player's momentum as the match counts it (see _tick)
    /** Out of stamina: slow, cannot sprint or reverse a grab, a heavy knocks it down. Clears at 30. */
    this.tired = false;
    /** grapple.js / match.js is driving this body (hold, throw, pin, finisher, entrance): the fighter keeps its timers only. */
    this.held = false;
    /** The move in progress while 'attacking' (a MOVES / POWERS entry), else null. */
    this.move = null;
    /** Seconds until the move in progress becomes active (negative once it has); for the AI's reads. */
    this.moveEta = 0;
    this.moveHit = 0;                 // 0 pending, 1 connected / blocked, 2 whiffed
    this.blockT = 0;                  // seconds the guard has been up
    this.blockStun = 0;
    this.blockLock = 0;               // cannot raise the guard again for this long
    this.reblock = 0;                 // a guard raised while this runs has no reversal window
    this.reversalOk = false;
    this.invulnT = 0;                 // post get-up grace: cannot be hit or grabbed
    this.lockT = 0;                   // continuous seconds without control (stun-lock guard)
    this.lockHits = 0;
    this.grabChain = 0;               // consecutive times grabbed without ~2 s of freedom in between
    this.freeT = 0;
    this.groundHits = 0;              // stomps / splashes taken during this knockdown
    this.falling = 0;                 // > 0: still toppling to the mat
    this.lastImpact = 0;              // size (0..1) of the move that last put it down (pin strength)
    this.kickouts = 0;                // kick-outs this fall (each one costs resilience)
    this.finished = 0;                // seconds left in which a finisher's victim cannot kick out well
    this.reboundCd = 0;               // > 0: came back dizzy off the ropes recently (the next rebound only staggers it)
    /** Seconds left in a comeback (0 = none); comebackPhase: 'fire' (rooted, roaring, no-selling) | 'flurry' | ''. */
    this.comeback = 0; this.comebackPhase = '';
    this._cbFall = false; this._cbMatch = 0;  // fired up this fall / comebacks this match
    this._beat = 0;                   // damage taken from the foe lately (decays over TUNE.cbMemory s)
    this.finKicked = false;           // has kicked out of a finisher this match (it happens once, if ever)
    this._cueMove = null;             // the foe's move the reversal cue went out for
    this.cd = { beam: 0, roar: 0, charge: 0, stomp: 0, ult: 0 };
    this.armor = false;               // light strikes do not interrupt (ultimate wind-up)
    // pose (root-driven): lie 0 upright .. 1 on its back
    this.lie = 0; this._lieP = 0; this.lieTarget = 0; this.lieByClip = false;
    this.lean = 0;                    // extra pitch (rad) a move asks for
    this.sink = 0;                    // wading depth (u)
    this._buf = { strike: 0, heavy: 0, grab: 0, pin: 0, finisher: 0 };
    this._reachPin = false;
    this._regenDelay = 0;
    this._kindLock = { k: '', t: 0 };
    this._cdPrev = { beam: 0, roar: 0, charge: 0, stomp: 0, ult: 0 };
    this._momFull = false; this._critical = false;
    this._pw = { x: 0, z: 0, dx: 0, dz: 1, sx: 0, sz: 0, fired: false, hit: false };
    this._taunt = 0; this._tauntId = 'taunt_a';
    this._flinch = 0; this._flinchDir = 1;
    this._glow = null;                // materials flashed on a hit
    this._koPending = false;
    this._orderWas = this.root.rotation.order;
    this.root.rotation.order = 'YXZ'; // yaw, then pitch about the body's own left-right axis, then roll
  }

  // ---- vitals (the player's live in game.js's state) ----
  get hp() { return this.isPlayer ? this.ctx.player.hp : this._hp; }
  set hp(v) { if (this.isPlayer) this.ctx.player.hp = v; else this._hp = v; }
  get maxHp() { return this.isPlayer ? this.ctx.player.maxHp : this._maxHp; }
  set maxHp(v) { if (this.isPlayer) this.ctx.player.maxHp = v; else this._maxHp = v; }
  /** Momentum 0..100 (the player's is the rage meter). */
  get momentum() { return this.isPlayer ? this.ctx.player.rage : this._momentum; }
  set momentum(v) { v = v < 0 ? 0 : v > 100 ? 100 : v; if (this.isPlayer) { this.ctx.player.rage = v; this._momShadow = v; } else this._momentum = v; }
  /** root.position: THE gameplay position (y = 0 on the ground). */
  get pos() { return this.root.position; }
  /** Facing (rad): forward = (sin yaw, 0, cos yaw). */
  get yaw() { return this.isPlayer ? this.ctx.player.yaw : this.root.rotation.y; }
  set yaw(v) { if (this.isPlayer) this.ctx.player.yaw = v; this.root.rotation.y = v; }
  get alive() { return this.state !== 'ko'; }
  get helpless() { return HELPLESS.has(this.state); }
  /** Damage multiplier of this fighter's own moves right now. */
  get dmgMult() { return TUNE.dmg * this.power * this.atkMult * (this.isPlayer ? (this.ctx.player.upgrades ? this.ctx.player.upgrades.dmgMult || 1 : 1) : 1); }

  // ---- reads for the AI, the HUD and the camera ----
  /** Running flat out this frame (sprint held, moving, not tired). */
  get sprinting() { const it = this.intent; return this.state === 'neutral' && it.sprint && !this.tired && (it.moveX !== 0 || it.moveZ !== 0); }
  /** Free to start an action this frame. */
  get canAct() { return this.state === 'neutral' && !this.held; }
  /** Lying on the mat (downed, pinned, out cold) and not still toppling. */
  get lying() { return (this.state === 'downed' || this.state === 'pinned' || this.state === 'ko') && this.falling <= 0; }
  /** Seconds until this fighter is back in neutral on its own (0 = now, Infinity = someone else decides). */
  get recoverIn() {
    if (this.state === 'neutral') return 0;
    if (this.held || this.stateDur <= 0) return Infinity;
    let t = Math.max(0, this.stateDur - this.stateT);
    if (this.state === 'downed') t += TUNE.getupDur;
    return t;
  }
  /** Can be struck by a standing move right now. */
  get hittable() { return !this.invuln && this.invulnT <= 0 && this.state !== 'ko' && !this.held && this.state !== 'downed'; }
  /** A grab on it right now cannot be reversed or mashed out of. */
  get grabLocked() { return (this.state === 'staggered' || this.state === 'stunned' || this.tired) && this.grabChain < 2; }
  /**
   * Can fire up right now (a taunt press starts the comeback): hurt, behind on health, beaten lately, momentum
   * in the meter, not used this fall. Works standing, guarding, reeling, dizzy or lying on the mat.
   */
  get comebackReady() {
    const foe = this.opponent, T = TUNE;
    if (!foe || this.comebackPhase || foe.comebackPhase || this._cbFall || this._cbMatch >= T.cbPerMatch || this.held) return false;
    if (this.momentum < T.cbCost || this.W.match.state.phase !== 'fight' || foe.state === 'ko') return false;
    const s = this.state;
    if (s !== 'neutral' && s !== 'blocking' && s !== 'staggered' && s !== 'stunned' && !(s === 'downed' && this.falling <= 0)) return false;
    const mine = this.hp / this.maxHp;
    // (the first title match is forgiving: the rival's comeback asks for a deeper hole there)
    const grace = !this.isPlayer && !(this.W.match.state.defense > 0) ? TUNE.cbRivalGrace : 0;
    return mine > 0 && mine < T.cbHp - grace && foe.hp / foe.maxHp - mine >= T.cbBehind + grace && this._beat >= T.cbBeaten * this.maxHp;
  }
  /** 0..1 progress of this fighter's kick-out (pinned) or escape (held); 0 when neither. For the HUD's mash meter. */
  get struggle() {
    const g = this.W.grapple;
    if (g.pin.active && g.pin.V === this) return Math.min(1, g.pin.meter);
    if (g.hold.active && g.hold.V === this) return Math.min(1, g.hold.escape);
    return 0;
  }
  /** Gap between the two bodies (u): 0 = chest to chest. */
  gapTo(o) { return this.distTo(o) - this.radius - o.radius; }
  /**
   * Is `what` legal right now? 'strike' | 'heavy' | 'clothesline' | 'block' |
   * 'grab' | 'stomp' | 'splash' | 'pickup' | 'pin' | 'taunt' | 'finisher' |
   * 'beam' | 'roar' | 'charge' | 'pstomp' | 'ult' (the last five: the rival's powers) | 'comeback' (= comebackReady).
   * Range is part of the answer for the context moves (stomp, splash, pickup, pin, finisher).
   */
  can(what) {
    if (what === 'comeback') return this.comebackReady;
    if (!this.canAct || this.W.match.state.phase !== 'fight') return false;
    const foe = this.opponent;
    const down = foe && foe.state === 'downed' && !foe.held && foe.falling <= 0 && !foe.invuln;
    switch (what) {
      case 'strike': case 'heavy': case 'grab': case 'taunt': return true;
      case 'clothesline': return !this.tired;
      case 'block': return this.blockLock <= 0 && this.stamina > 0;
      case 'stomp': return !!down && this.groundGap(foe) <= MOVES.stomp.reach + 4;
      case 'splash': return !!down && this.groundGap(foe) <= MOVES.splash.reach;
      case 'pickup': case 'pin': return !!down && this.groundGap(foe) <= MOVES.reach.reach + 4;
      case 'finisher': return this.W.grapple.canFinisher(this);
      case 'pstomp': what = 'stomp'; // falls through
      case 'beam': case 'roar': case 'charge': case 'ult': {
        const p = POWERS[what];
        return !this.isPlayer && this.cd[what] <= 0 && this.momentum >= p.cost;
      }
      default: return false;
    }
  }

  /** Body centre in world space (hips bone; root + half height without one). For presentation: one frame stale. */
  center(out) {
    if (this.bones.hips) return this.bones.hips.getWorldPosition(out);
    return out.copy(this.root.position).setY(this.root.position.y + this.height * 0.45);
  }
  /** Analytic body centre for gameplay tests: the root when upright, mid-torso when lying (the body extends behind the root). */
  mid(out) {
    const p = this.root.position, L = this.lying || this.lie > 0.5 ? this.hc : 0, y = this.root.rotation.y;
    return out.set(p.x - Math.sin(y) * L, L ? this.lieY : p.y + this.hc, p.z - Math.cos(y) * L);
  }
  /** Horizontal distance between the two roots. */
  distTo(o) { return Math.hypot(o.root.position.x - this.root.position.x, o.root.position.z - this.root.position.z); }
  /** Gap from this fighter's body to a lying foe's torso (u). */
  groundGap(o) {
    o.mid(_v);
    return Math.hypot(_v.x - this.root.position.x, _v.z - this.root.position.z) - this.radius - 6;
  }
  /** Yaw that faces the other fighter. */
  yawTo(o) { return Math.atan2(o.root.position.x - this.root.position.x, o.root.position.z - this.root.position.z); }
  /** Is the other fighter inside +-halfArc of this one's facing? */
  facing(o, halfArc = 0.9) { return Math.abs(angDiff(this.yawTo(o), this.yaw)) <= halfArc; }

  /** Put the fighter at x, z facing yaw, healthy and neutral (fall start / match start). */
  reset(x, z, yaw, hp) {
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, yaw, 0);
    if (this.isPlayer) this.ctx.player.yaw = yaw;
    if (hp !== undefined) { this.maxHp = hp; this.hp = hp; }
    this.stamina = this.maxStamina; this.tired = false;
    this.vel.set(0, 0, 0);
    this.targetable = true; this.solid = true; this.invuln = false; this.held = false;
    this.move = null; this.moveHit = 0; this.moveEta = 0;
    this.blockT = 0; this.blockStun = 0; this.blockLock = 0; this.reblock = 0;
    this.invulnT = 0; this.lockT = 0; this.lockHits = 0; this.grabChain = 0; this.freeT = 0;
    this.groundHits = 0; this.falling = 0; this.lastImpact = 0; this.kickouts = 0; this.finished = 0; this.reboundCd = 0;
    this.armor = false; this._koPending = false; this._critical = false;
    this.comeback = 0; this.comebackPhase = ''; this._cbFall = false; this._beat = 0; this._cueMove = null;
    this.lie = 0; this._lieP = 0; this.lieTarget = 0; this.lieByClip = false; this.lean = 0; this.sink = 0;
    this._buf.strike = 0; this._buf.heavy = 0; this._buf.grab = 0; this._buf.pin = 0; this._buf.finisher = 0;
    this._flinch = 0; this._taunt = 0;
    this._setGlow(0);
    this.state = 'neutral'; this.prevState = 'neutral'; this.stateT = 0; this.stateDur = 0;
    this._syncGate();
    this.W.anims.stop(this, 0);
  }

  /** Enter a state for dur seconds (0 = until something changes it). Emits fighter:state.
   *  anim: undefined = the state's default, null = leave the animation alone, a name = play that. */
  setState(state, dur = 0, anim) {
    if (!STATES.includes(state)) throw new Error(`[wrestling] unknown fighter state '${state}'`);
    const prev = this.state;
    if (prev === 'blocking' && state !== 'blocking') this._emitWho(EV.BLOCK_END);
    if (prev === 'stunned' && state !== 'stunned') this._emitWho(EV.STUN_END);
    // A guard thrown up on the first free frame after hit-stun is a block, never a reversal (no free reversals inside a string)
    if (prev === 'staggered' || prev === 'stunned') this.reblock = Math.max(this.reblock, TUNE.stunReblock);
    this.prevState = prev;
    this.state = state; this.stateT = 0; this.stateDur = dur;
    if (state !== 'attacking') { this.move = null; this.armor = false; this.lean = 0; }
    if (state === 'ko' || state === 'downed' || state === 'pinned') this.solid = false;
    else if (!this.held) this.solid = true;
    this._syncGate();
    if (anim === undefined) anim = STATE_ANIM[state];
    if (anim) this.W.anims.play(this, anim);
    else if (anim === undefined && state === 'neutral' && prev !== 'attacking') this.W.anims.stop(this);
    const e = this.W.bus.ev(EV.FIGHTER_STATE);
    e.who = this.id; e.state = state; e.prev = prev; e.dur = dur;
    this.W.bus.emit(EV.FIGHTER_STATE);
  }

  /**
   * Place the body by its CENTRE: (cx, cy, cz) is where mid-torso goes, with
   * yaw / pitch / roll applied about it (pitch -PI/2 = flat on its back, head
   * pointing behind its facing). grapple.js moves held and thrown bodies with it.
   */
  setPose(cx, cy, cz, yaw, pitch = 0, roll = 0) {
    const h = this.hc, cr = Math.cos(roll);
    const ox = -h * Math.sin(roll), oy = h * cr * Math.cos(pitch), oz = h * cr * Math.sin(pitch);
    const sy = Math.sin(yaw), cyw = Math.cos(yaw);
    this.root.rotation.set(pitch, yaw, roll);
    this.root.position.set(cx - (ox * cyw + oz * sy), cy - oy, cz - (-ox * sy + oz * cyw));
  }

  // ------------------------------------------------------------------ meters
  spend(n) {
    if (n <= 0) return;
    this.stamina = Math.max(0, this.stamina - n);
    this._regenDelay = TUNE.stamDelay;
    if (this.stamina <= 0 && !this.tired) { this.tired = true; this._emitWho(EV.STAMINA_EMPTY); }
  }
  gainMomentum(n) {
    if (n <= 0) return;
    if (this.isPlayer && this.ctx.player.upgrades) n *= this.ctx.player.upgrades.rageGainMult || 1;
    this.momentum = this.momentum + n;
  }
  /** Use up the whole meter (finisher / ultimate). */
  spendMomentum() {
    this.momentum = 0;
    this._momFull = false;
    this._emitWho(EV.MOMENTUM_SPENT);
  }
  _emitWho(name) {
    const e = this.W.bus.ev(name);
    e.who = this.id;
    this.W.bus.emit(name);
  }

  // ------------------------------------------------------------------ damage intake
  /**
   * A hit from outside the combat core: every classic player attack (game.js
   * routes melee, beam, roar, charge, stomp and ultimate here when this is the
   * rival) and military fire. amount is the attack's raw damage; kind is
   * 'melee' | 'beam' | 'atomic' | 'roar' | 'charge' | 'stomp' | 'ult' |
   * 'military' | 'aoe'; sx, sz is where it came from. Returns HP removed.
   */
  takeHit(amount, kind, sx, sz) {
    const scale = TUNE.taken[kind] !== undefined ? TUNE.taken[kind] : TUNE.taken.aoe;
    if (!scale || !this.targetable || this.held) return 0;
    if (kind === 'military') {
      const dealt = this.applyDamage(amount * scale, kind, 'military', this.pos.x, this.pos.y + this.height * 0.6, this.pos.z, false);
      if (dealt > 0) this.W.grapple.onDamage(this, dealt, kind);
      return dealt;
    }
    const foe = this.opponent, by = foe ? foe.id : '';
    const power = POWER_OF[kind];
    if (power) {
      // One power lands once: the atomic breath's two blast radii, a dash's second sweep, a beam's snap + tube
      const L = this._kindLock;
      if (L.k === power && L.t > 0) return 0;
      L.k = power; L.t = 0.5;
      const mult = foe ? foe.atkMult : 1;
      return this.receivePower(power, amount * scale * mult, sx, sz, by, foe);
    }
    // The classic melee (QA only: the core's own strikes replace it in a match) and stray area damage
    const p = this.root.position;
    let dx = sx - p.x, dz = sz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const cx = p.x + dx * this.radius * 0.6, cy = p.y + this.height * 0.6, cz = p.z + dz * this.radius * 0.6;
    const dealt = this.applyDamage(amount * scale, kind, by, cx, cy, cz, false);
    if (dealt <= 0) return 0;
    if (kind === 'melee') {
      const e = this.W.bus.ev(EV.STRIKE_LANDED);
      e.who = by; e.target = this.id; e.kind = 'light'; e.damage = dealt; e.impact = 0.3; e.x = cx; e.y = cy; e.z = cz;
      this.W.bus.emit(EV.STRIKE_LANDED);
      if (this.state !== 'ko' && this.hittable) this.stagger(0.3, by, -dx, -dz, 10);
    }
    return dealt;
  }

  /**
   * A signature power connects (the player's classic ones through takeHit,
   * the rival's from its own power timeline). Blockable for chip; the
   * reaction depends on the power. Returns HP removed.
   */
  receivePower(power, dmg, sx, sz, by, src) {
    if (this.invuln || this.invulnT > 0 || this.state === 'ko' || this.held) return 0;
    const def = POWERS[power], bus = this.W.bus;
    const p = this.root.position;
    let dx = p.x - sx, dz = p.z - sz;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) { dx /= d; dz /= d; } else { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); }
    const cx = p.x - dx * this.radius * 0.6, cy = p.y + this.height * 0.6, cz = p.z - dz * this.radius * 0.6;
    const blocked = this.state === 'blocking' && Math.abs(angDiff(Math.atan2(-dx, -dz), this.yaw)) <= BLOCK_ARC;
    const down = this.state === 'downed';
    if (down && power === 'stomp') {
      // A jump landing on a downed kaiju is a diving splash
      const dealt = this.applyDamage(dmg * TUNE.splashMult, 'splash', by, cx, this.lieY, cz, false);
      if (dealt <= 0) return 0;
      this._groundHit();
      if (src) { src.gainMomentum(MOVES.splash.mom); if (src.isPlayer) this.ctx.addScore(Math.round(dealt * 12)); }
      const e = bus.ev(EV.STRIKE_LANDED);
      e.who = by; e.target = this.id; e.kind = 'splash'; e.damage = dealt; e.impact = MOVES.splash.impact; e.high = false; e.x = cx; e.y = this.lieY; e.z = cz;
      bus.emit(EV.STRIKE_LANDED);
      this.W.hitStop(MOVES.splash.hs);
      return dealt;
    }
    let dealt;
    if (blocked) {
      dealt = this.applyDamage(Math.max(1, dmg * TUNE.powerChip), power, by, cx, cy, cz, true);
      this.spend(def.chipStam);
      this.blockStun = Math.max(this.blockStun, 0.3);
      this.vel.x += dx * 30; this.vel.z += dz * 30;
    } else {
      dealt = this.applyDamage(dmg * (down ? 0.6 : 1), power, by, cx, cy, cz, false);
    }
    if (dealt <= 0) return 0;
    if (src) { src.gainMomentum(blocked ? 2 : 5); if (src.isPlayer) this.ctx.addScore(Math.round(dealt * 12)); }
    const e = bus.ev(EV.POWER_HIT);
    e.who = by; e.target = this.id; e.power = power; e.damage = dealt; e.blocked = blocked; e.impact = blocked ? def.impact * 0.5 : def.impact;
    e.x = cx; e.y = cy; e.z = cz;
    bus.emit(EV.POWER_HIT);
    this.W.hitStop(blocked ? def.hs * 0.5 : def.hs);
    if (this.state === 'ko') return dealt;
    if (blocked) {
      if (this.stamina <= 0) this._guardBreak(by);
      return dealt;
    }
    if (down) return dealt;
    if (power === 'ult') { this.W.slowMo(0.45, 0.6); this.knockDown(by, 'power', 0.9, dx, dz, 70); }
    else if (power === 'charge') this.knockDown(by, 'power', 0.6, dx, dz, 52);
    else if (power === 'stomp') this.knockDown(by, 'power', 0.5, dx, dz, 34);
    else if (power === 'roar') this.stagger(0.6, by, dx, dz, 46);
    else this.stagger(0.7, by, dx, dz, 22);
    return dealt;
  }

  /**
   * Remove HP (already scaled) and report it: flinch, 'damage', and 'ko' at 0.
   * The combat core's strikes, slams and building impacts all end here.
   * Returns HP actually removed (0 when invulnerable or already out).
   */
  applyDamage(amount, kind, by, x, y, z, blocked) {
    if (this.invuln || this.state === 'ko' || amount <= 0) return 0;
    // Once a kaiju is out, the one standing over it cannot be knocked out as well
    if (this.opponent && this.opponent.state === 'ko') return 0;
    // Only a big move knocks a kaiju out. Jabs, stomps, chip, beams and stray shells leave it on its last legs
    // (1 HP): it has to be put away with a slam, a finisher - or pinned, and it may still kick out at 2.9.
    // Fired up: it takes a share of the foe's offence and sells none of it (the reactions are skipped below)
    const nosell = this.comebackPhase !== '' && !blocked && !!this.opponent && by === this.opponent.id && kind !== 'finisher';
    if (nosell) amount *= TUNE.cbNoSell;
    if (!KO_KINDS[kind] && amount >= this.hp) amount = this.hp - 1;
    if (amount <= 0) return 0;
    let dealt;
    if (this.isPlayer) {
      _hurt.x = x; _hurt.z = z;
      dealt = this.ctx.hurtPlayer(amount, _hurt);
    } else {
      dealt = Math.min(amount, this._hp);
      this._hp -= dealt;
    }
    if (dealt <= 0) return 0;
    this._flinch = nosell ? 0.35 : 1;
    this._flinchDir = -this._flinchDir;
    if (!blocked) {
      if (this.hp < this.maxHp * 0.5) this.gainMomentum(dealt * TUNE.momHurt);
      else this.momentum = this.momentum - dealt * TUNE.momDrain;
      if (this.opponent && by === this.opponent.id) this._beat += dealt;
    }
    const e = this.W.bus.ev(EV.DAMAGE);
    e.who = this.id; e.by = by; e.amount = dealt; e.kind = kind; e.hp = this.hp; e.maxHp = this.maxHp;
    e.blocked = !!blocked; e.x = x; e.y = y; e.z = z;
    this.W.bus.emit(EV.DAMAGE);
    if (nosell && this.hp > 0) {
      const n = this.W.bus.ev(EV.COMEBACK_NOSELL);
      n.who = this.id; n.by = by; n.kind = kind; n.damage = dealt; n.x = x; n.y = y; n.z = z;
      this.W.bus.emit(EV.COMEBACK_NOSELL);
    }
    if (!this._critical && this.hp > 0 && this.hp < this.maxHp * 0.25) { this._critical = true; this._emitWho(EV.HP_CRITICAL); }
    if (this.state === 'taunting' && dealt > 1 && this.comebackPhase !== 'fire') this._tauntInterrupted(by);
    if (this.hp <= 0) this._ko(by, x, y, z);
    return dealt;
  }

  _ko(by, x, y, z) {
    // Out cold in mid-throw: the fall finishes first (grapple.js lands the body, then it is a KO)
    if (this.held) { this._koPending = true; return; }
    this._koPending = false;
    if (this.comebackPhase) this.endComeback('fall');
    this.targetable = false; this.solid = false;
    const wasLying = this.lying;
    this.setState('ko', 0, null);
    this.vel.multiplyScalar(0.4);
    this._layAnim(wasLying ? 'downed' : 'ko', wasLying ? 0.15 : 0.6);
    if (!wasLying) this.falling = TUNE.fallDur;
    const e = this.W.bus.ev(EV.KO);
    e.who = this.id; e.by = by; e.x = x; e.y = y; e.z = z;
    this.W.bus.emit(EV.KO);
    if (!wasLying) this._emitKnockdown(by, 'ko', 0.8);
  }

  // ------------------------------------------------------------------ reactions
  /** Hit-stun for dur seconds, shoved along (dx, dz) at push u/s. */
  stagger(dur, by, dx = 0, dz = 0, push = 0) {
    if (this.held || this.state === 'ko' || this.state === 'downed' || this.invuln || this.comebackPhase) return;
    // No stun-locks: every further stagger in one chain is shorter, and past the cap the next hit floors it (a knockdown resets everything)
    if (this.lockT + dur > TUNE.lockMax) { this.knockDown(by, 'strike', 0.4, dx, dz, push); return; }
    dur *= Math.max(0.55, 1 - 0.15 * this.lockHits);
    this.lockHits++;
    this.vel.x += dx * push; this.vel.z += dz * push;
    this.setState('staggered', dur);
    const e = this.W.bus.ev(EV.STAGGER);
    e.who = this.id; e.by = by; e.dur = dur; e.x = this.pos.x; e.y = this.pos.y + this.height * 0.6; e.z = this.pos.z;
    this.W.bus.emit(EV.STAGGER);
  }
  /** Dizzy (a free grab) for dur seconds. */
  stun(dur, by) {
    if (this.held || this.state === 'ko' || this.state === 'downed' || this.invuln || this.comebackPhase) return;
    this.setState('stunned', dur);
    const e = this.W.bus.ev(EV.STUN);
    e.who = this.id; e.by = by; e.dur = dur;
    this.W.bus.emit(EV.STUN);
  }
  _guardBreak(by) {
    const e = this.W.bus.ev(EV.BLOCK_BROKEN);
    e.who = this.id; e.by = by;
    this.W.bus.emit(EV.BLOCK_BROKEN);
    this.blockLock = 2.5;
    this.stun(TUNE.guardBreakStun, by);
  }
  /** How long a knockdown of this size keeps this fighter on the mat (s). */
  downTime(impact) {
    const hurt = 1 - Math.max(0, this.hp) / Math.max(1, this.maxHp);
    const t = (TUNE.downBase + impact * TUNE.downImpact + hurt * TUNE.downHurt) * (this.tired ? 1.15 : 1);
    return Math.min(TUNE.downMax, t);
  }
  /** Knocked off its feet by a strike or a power: topples backward and slides along (dx, dz). */
  knockDown(by, cause, impact, dx = 0, dz = 0, push = 30) {
    if (this.held || this.state === 'ko' || this.state === 'downed' || this.invuln || this.comebackPhase) return;
    this.vel.x += dx * push; this.vel.z += dz * push;
    this.lastImpact = impact; this.groundHits = 0;
    this.falling = TUNE.fallDur;
    this._downBy = by; this._downCause = cause;
    this.setState('downed', TUNE.fallDur + this.downTime(impact), null);
    this._layAnim('knockdown', TUNE.fallDur + 0.1);
  }
  /**
   * Comes to rest on the mat already lying (the end of a throw; grapple.js put
   * the body down). Emits 'knockdown' unless the throw already did.
   */
  land(by, cause, impact, emit = true, extra = 0) {
    this.held = false;
    this.root.rotation.z = 0;
    this.lastImpact = impact; this.groundHits = 0; this.falling = 0;
    this.lie = 1; this._lieP = 1;
    if (this._koPending || this.hp <= 0) {
      // The landing was the knockout
      const p = this.root.position;
      this.state = 'downed';
      this._ko(by, p.x, this.lieY, p.z);
      return;
    }
    this.setState('downed', this.downTime(impact) + extra, null);
    this._layAnim('downed', 0.12);
    if (emit) this._emitKnockdown(by, cause, impact);
  }
  _emitKnockdown(by, cause, impact) {
    const e = this.W.bus.ev(EV.KNOCKDOWN);
    this.mid(_v);
    e.who = this.id; e.by = by; e.cause = cause; e.impact = impact; e.x = _v.x; e.y = 0; e.z = _v.z;
    this.W.bus.emit(EV.KNOCKDOWN);
  }
  /** A lying pose: by the clip when it lays the body down itself (today's stand-ins), else by tipping the root (ANIMS[name].rootDriven, or no clip). */
  _layAnim(name, dur) {
    _animOpt.fade = 0.12; _animOpt.timeScale = 1; _animOpt.duration = name === 'knockdown' || name === 'ko' ? dur : undefined; _animOpt.commit = undefined;
    const ok = this.W.anims.play(this, name, _animOpt);
    this.lieByClip = ok && !(ANIMS[name] && ANIMS[name].rootDriven);
    this.lieTarget = this.lieByClip ? 0 : 1;
    if (this.lieByClip && this.lie > 0) { this.lie = 0; this._lieP = 0; }
  }
  _groundHit() {
    this.groundHits++;
    // No ground-and-pound loops: after a couple of shots it scrambles up (invulnerable while rising)
    if (this.groundHits >= TUNE.groundHitsMax) this.stateDur = Math.min(this.stateDur, this.stateT + 0.25);
    else this.stateDur += 0.2;
  }
  /** Start rising (invulnerable until back on its feet, and for a moment after). */
  getUp() {
    if (this.state === 'ko') return;
    this.held = false;
    this.invuln = true;
    this.lieTarget = 0;
    this.setState('gettingUp', TUNE.getupDur, null);
    _animOpt.fade = 0.15; _animOpt.timeScale = 1; _animOpt.duration = TUNE.getupDur; _animOpt.commit = undefined;
    if (!this.W.anims.play(this, 'getup', _animOpt)) this.W.anims.stop(this, TUNE.getupDur * 0.7);
    const e = this.W.bus.ev(EV.GETUP);
    e.who = this.id; e.x = this.pos.x; e.z = this.pos.z;
    this.W.bus.emit(EV.GETUP);
  }
  /** Busy for dur seconds, then neutral (the tail of a throw, a whiffed dive...). */
  recover(dur) {
    this.held = false;
    this._buf.strike = 0; this._buf.heavy = 0; this._buf.grab = 0; this._buf.pin = 0; this._buf.finisher = 0;
    this.setState('attacking', dur, null);
    this.move = RECOVERY; this.moveHit = 1; this.moveEta = 0;
    this._syncGate();
  }
  _tauntInterrupted(by) {
    const e = this.W.bus.ev(EV.TAUNT_INTERRUPTED);
    e.who = this.id; e.by = by; e.id = this._tauntId;
    this.W.bus.emit(EV.TAUNT_INTERRUPTED);
    this._taunt = 0;
    if (this.state === 'taunting') this.setState('neutral');
  }

  // ------------------------------------------------------------------ strikes
  _startMove(m) {
    const foe = this.opponent, total = m.startup + m.active + m.recover;
    this.setState('attacking', total, null);
    this.move = m; this.moveHit = 0; this.moveEta = m.startup; this._cueMove = null;
    this._syncGate();
    this.spend(m.stam * (this.tired ? 0.5 : 1));
    // (a fired-up flurry runs its strikes faster: update() advances stateT by the haste, the clip keeps up)
    const haste = this.comebackPhase === 'flurry' && STRIKE_KINDS[m.kind] ? TUNE.cbHaste : 1;
    _animOpt.fade = 0.08; _animOpt.timeScale = 1; _animOpt.duration = total / haste; _animOpt.commit = total / haste;
    this.W.anims.play(this, animName(m.anim, 'heavy'), _animOpt);
    if (m.kind === 'grab' || m.kind === 'reach') {
      if (m.kind === 'grab') {
        const e = this.W.bus.ev(EV.GRAB_ATTEMPT);
        e.who = this.id; e.target = foe ? foe.id : '';
        this.W.bus.emit(EV.GRAB_ATTEMPT);
      }
      return;
    }
    if (m.kind === 'splash' && foe) {
      // The dive is aimed where the foe lies now
      foe.mid(_v);
      const P = this._pw, p = this.root.position;
      P.sx = p.x; P.sz = p.z;
      let dx = _v.x - p.x, dz = _v.z - p.z;
      const d = Math.hypot(dx, dz) || 1, go = Math.max(0, d - 5);
      P.x = p.x + dx / d * go; P.z = p.z + dz / d * go;
      this.yaw = Math.atan2(dx, dz);
    }
    const e = this.W.bus.ev(EV.STRIKE_START);
    e.who = this.id; e.target = foe ? foe.id : ''; e.kind = m.kind; e.combo = m.combo; e.windup = m.startup / haste;
    this.W.bus.emit(EV.STRIKE_START);
  }

  /**
   * The reversal cue: once per big strike (heavy, clothesline), cueLead s before the defender's window opens,
   * tell the bus the defender could turn it around now. Only while the defender could actually raise a
   * reversing guard in time (free, not locked out of its guard).
   */
  /** How long before contact a guard raised by `foe` against move `m` still reverses it (the player gets a reaction allowance on the cued big strikes). */
  _revWindow(m, foe) { return foe.isPlayer && cued(m) ? TUNE.reversalWindowPlayer : TUNE.reversalWindow; }
  _cueReversal(m, t) {
    const foe = this.opponent;
    if (!foe || this._cueMove === m || !cued(m)) return;
    const haste = this.comebackPhase === 'flurry' ? TUNE.cbHaste : 1;
    // Contact: the end of the wind-up, or for a running clothesline when the dash closes the gap
    let eta = (m.startup - t) / haste;
    if (m.dash) eta = Math.max(eta, (m.startup * 0.4 - t) / haste + Math.max(0, this.gapTo(foe) - m.reach) / m.dash);
    const win = this._revWindow(m, foe);
    if (eta > win + TUNE.cueLead) return;
    this._cueMove = m;
    if (foe.state !== 'neutral' || foe.held || foe.blockLock > 0 || foe.reblock > eta - win || foe.stamina <= 0) return;
    if (this.gapTo(foe) > m.reach + (m.lunge || 0) + (m.dash ? 60 : 6) || !this.facing(foe, STRIKE_ARC)) return;
    const e = this.W.bus.ev(EV.REVERSAL_CUE);
    e.who = foe.id; e.target = this.id; e.kind = 'strike'; e.opens = Math.max(0, eta - win); e.dur = Math.min(win, eta);
    this.W.bus.emit(EV.REVERSAL_CUE);
  }

  _attacking(dt) {
    const m = this.move, t = this.stateT, foe = this.opponent, it = this.intent;
    if (!m) { this.setState('neutral'); return; }
    this.moveEta = m.startup - t;
    if (m.kind === 'power') { this._powerTick(dt); return; }
    if (m.kind === 'ppower') { if (t >= this.stateDur) this.setState('neutral'); return; }
    if (m.kind === 'splash') { this._splashTick(dt); return; }
    const p = this.root.position;
    if (!this.moveHit && this._cueMove !== m) this._cueReversal(m, t);
    if (t < m.startup) {
      // Track the foe through the wind-up and step in
      if (foe && !m.dash) {
        if (!this.isPlayer) this._turnTo(this.yawTo(foe), 7, dt);
        else if (this.ctx.player.control.faceYaw === null && this.distTo(foe) < this.radius + foe.radius + 20 && this.facing(foe, 1.2)) {
          this.ctx.player.yaw += angDiff(this.yawTo(foe), this.ctx.player.yaw) * (1 - Math.exp(-8 * dt));
        }
      }
      if (m.lunge && foe && (m.ground ? this.groundGap(foe) : this.gapTo(foe)) > 1) {
        const s = m.lunge / m.startup * dt, y = this.yaw;
        p.x += Math.sin(y) * s; p.z += Math.cos(y) * s;
      }
    }
    if (m.dash && t >= m.startup * 0.4 && t < m.startup + m.active) {
      const s = m.dash * dt, y = this.yaw;
      p.x += Math.sin(y) * s; p.z += Math.cos(y) * s;
    }
    if (!this.moveHit && t >= m.startup) {
      if (t < m.startup + m.active) {
        if (m.kind === 'grab') {
          if (this.W.grapple.connect(this)) return; // the lock-up took both bodies
        } else if (m.kind === 'reach') {
          if (foe && foe.state === 'downed' && !foe.held && foe.falling <= 0 && this.groundGap(foe) <= m.reach + 4) {
            this.moveHit = 1;
            if (this._reachPin || it.grabHeld || it.pin ? this.W.grapple.startPin(this, foe, false) : this.W.grapple.startPickup(this, foe)) return;
          }
        } else if (this._resolveStrike(m)) this.moveHit = 1;
      } else {
        this.moveHit = 2;
        if (m.kind === 'grab') this._emitWho(EV.GRAB_WHIFFED);
        else if (m.kind !== 'reach') {
          const e = this.W.bus.ev(EV.STRIKE_WHIFFED);
          e.who = this.id; e.kind = m.kind; e.combo = m.combo;
          this.W.bus.emit(EV.STRIKE_WHIFFED);
        }
      }
    }
    // The string: the next press during the back half of a hit flows into the next one
    if (m.kind === 'light' && t >= m.startup + m.active && this._buf.heavy > 0 && this.state === 'attacking') {
      // ...and a held button turns the jab into the heavy
      this._buf.heavy = 0; this._buf.strike = 0;
      this._startMove(MOVES.heavy);
      return;
    }
    if (m.next && t >= m.startup + m.active && this._buf.strike > 0 && this.state === 'attacking') {
      this._buf.strike = 0;
      this._startMove(MOVES[m.next]);
      return;
    }
    if (this.state === 'attacking' && t >= this.stateDur) this.setState('neutral');
  }

  /** Test the active strike against the foe; true once it connected, was blocked or was reversed. */
  _resolveStrike(m) {
    const foe = this.opponent, bus = this.W.bus;
    if (!foe || foe.invuln || foe.invulnT > 0 || foe.state === 'ko') return false;
    const flight = foe.held && this.W.grapple.strikable(foe); // a whipped body on the run can be cut down
    if (foe.held && !flight) return false;
    const down = foe.state === 'downed';
    if (!!m.ground !== down) return false;
    if (down && foe.falling > 0) return false;
    const gap = down ? this.groundGap(foe) : this.gapTo(foe);
    if (gap > m.reach || (!down && !this.facing(foe, STRIKE_ARC))) return false;
    // Contact point: the foe's edge on the line between the bodies
    const a = this.root.position, b = foe.root.position;
    let dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    let cx = b.x - dx * foe.radius * 0.6, cz = b.z - dz * foe.radius * 0.6, cy = b.y + foe.height * (m.high ? 0.66 : 0.4);
    if (down) { foe.mid(_v); cx = _v.x; cy = foe.lieY + 3; cz = _v.z; }
    const flurry = this.comebackPhase === 'flurry';
    const base = m.dmg * this.dmgMult * (flurry ? TUNE.cbAtk : 1);
    if (!down && !flight && foe.state === 'blocking' && foe.facing(this, BLOCK_ARC)) {
      if (foe.reversalOk && foe.blockT <= this._revWindow(m, foe)) {
        // Reversal: a guard raised just in time turns the strike around...
        foe.reversalOk = false;
        foe.gainMomentum(TUNE.reversalMom);
        foe.stamina = Math.min(foe.maxStamina, foe.stamina + 8);
        if (foe.isPlayer) this.ctx.addScore(250);
        const e = bus.ev(EV.STRIKE_REVERSED);
        e.who = foe.id; e.target = this.id; e.kind = m.kind; e.x = cx; e.y = cy; e.z = cz;
        bus.emit(EV.STRIKE_REVERSED);
        if (this.comebackPhase) this.endComeback('cut'); // (a reversal cuts a fired-up kaiju off)
        this.lockT = 0; this.lockHits = 0;
        // ...and the defender answers at once: its own heavy shot through the opening (a reversed heavy or
        // clothesline is floored by it)
        const big = m.kind === 'heavy' || m.kind === 'clothesline';
        foe.setState('attacking', TUNE.counterRec, null);
        foe.move = COUNTER; foe.moveHit = 1; foe.moveEta = 0;
        foe._syncGate();
        _animOpt.fade = 0.05; _animOpt.timeScale = 1; _animOpt.duration = TUNE.counterRec + 0.15; _animOpt.commit = TUNE.counterRec;
        this.W.anims.play(foe, 'strike_3', _animOpt);
        const dealt = this.applyDamage(TUNE.counterDmg * foe.dmgMult * (big ? 1.5 : 1), 'heavy', foe.id, a.x + dx * this.radius * 0.6, cy, a.z + dz * this.radius * 0.6, false);
        if (dealt > 0) {
          const c = bus.ev(EV.STRIKE_LANDED);
          c.who = foe.id; c.target = this.id; c.kind = 'heavy'; c.combo = 1; c.damage = dealt; c.impact = big ? 0.9 : 0.7;
          c.high = true; c.counter = true; c.x = a.x + dx * this.radius * 0.6; c.y = cy; c.z = a.z + dz * this.radius * 0.6;
          bus.emit(EV.STRIKE_LANDED);
          if (foe.isPlayer) this.ctx.addScore(Math.round(dealt * 10));
        }
        this.W.hitStop(0.12);
        this.W.slowMo(0.45, 0.4, 1);
        if (this.state !== 'ko') {
          if (big) this.knockDown(foe.id, 'strike', 0.7, -dx, -dz, 40);
          else this.stagger(TUNE.reversalStagger, foe.id, -dx, -dz, 30);
        }
        return true;
      }
      const chip = foe.applyDamage(Math.max(1, base * TUNE.chip), m.kind, this.id, cx, cy, cz, true);
      foe.spend(m.blockStam);
      foe.blockStun = TUNE.blockStun;
      foe.vel.x += dx * m.push * 0.5; foe.vel.z += dz * m.push * 0.5;
      this.vel.x -= dx * m.push * 0.25; this.vel.z -= dz * m.push * 0.25;
      this.gainMomentum(1);
      const e = bus.ev(EV.STRIKE_BLOCKED);
      e.who = this.id; e.target = foe.id; e.kind = m.kind; e.combo = m.combo; e.damage = chip; e.impact = m.impact * 0.5; e.x = cx; e.y = cy; e.z = cz;
      bus.emit(EV.STRIKE_BLOCKED);
      this.W.hitStop(m.hs * 0.5);
      if (foe.state === 'blocking' && foe.stamina <= 0) foe._guardBreak(this.id);
      return true;
    }
    const counter = flight || (foe.state === 'attacking' && foe.moveHit === 0);
    const taunted = foe.state === 'taunting';
    const armored = foe.armor && m.kind === 'light';
    const wasSoft = foe.state === 'staggered' || foe.state === 'stunned' || foe.tired;
    const dealt = foe.applyDamage(base * (flight ? 1.5 : counter ? TUNE.counterMult : taunted ? TUNE.tauntHitMult : 1), m.kind, this.id, cx, cy, cz, false);
    if (dealt <= 0) return false;
    this.gainMomentum((m.mom + (counter ? 3 : 0)) * (flurry ? TUNE.cbMom : 1));
    if (this.isPlayer) this.ctx.addScore(Math.round(dealt * 10));
    const e = bus.ev(EV.STRIKE_LANDED);
    e.who = this.id; e.target = foe.id; e.kind = m.kind; e.combo = m.combo; e.damage = dealt; e.impact = Math.min(1, m.impact * (counter ? 1.3 : 1));
    e.high = !!m.high; e.counter = counter; e.x = cx; e.y = cy; e.z = cz;
    bus.emit(EV.STRIKE_LANDED);
    this.W.hitStop(m.hs * (counter ? 1.3 : 1));
    if (foe.state === 'ko') return true;
    if (flight) { this.W.grapple.cutDown(foe, this, m.impact); return true; }
    if (down) { foe._groundHit(); return true; }
    if (armored) return true;
    // The flurry's big shot (the third of the string, the heavy, the clothesline) puts the foe down: the comeback's payoff
    const flurryEnd = flurry && (m.combo >= 3 || m.kind !== 'light');
    if (flurryEnd || m.kd === 'always' || (m.kd === 'weak' && (wasSoft || counter))) foe.knockDown(this.id, 'strike', flurryEnd ? Math.max(0.7, m.impact) : m.impact, dx, dz, m.push * (flurryEnd ? 1.3 : 1));
    else foe.stagger(m.stagger, this.id, dx, dz, m.push);
    if (flurryEnd && foe.state === 'downed') this.endComeback('done');
    return true;
  }

  // Diving splash onto a downed foe: crouch, an arc onto where it lay, the landing is the hit
  _splashTick(dt) {
    const m = this.move, t = this.stateT, P = this._pw, p = this.root.position, foe = this.opponent;
    if (t < m.startup) { this.lean = -0.25 * smooth(t / m.startup); return; }
    const a = Math.min(1, (t - m.startup) / m.active);
    if (!this.moveHit) {
      p.x = P.sx + (P.x - P.sx) * a; p.z = P.sz + (P.z - P.sz) * a;
      p.y = m.peak * 4 * a * (1 - a);
      this.lean = 0.25 + 1.1 * smooth(a);
      if (a >= 1) {
        p.y = 0;
        this.moveHit = 2;
        const bus = this.W.bus;
        if (foe && foe.state === 'downed' && !foe.held && !foe.invuln && this.groundGap(foe) <= 8) {
          foe.mid(_v);
          const dealt = foe.applyDamage(m.dmg * this.dmgMult, 'splash', this.id, _v.x, foe.lieY + 3, _v.z, false);
          if (dealt > 0) {
            this.moveHit = 1;
            this.gainMomentum(m.mom);
            if (this.isPlayer) this.ctx.addScore(Math.round(dealt * 12));
            const e = bus.ev(EV.STRIKE_LANDED);
            e.who = this.id; e.target = foe.id; e.kind = 'splash'; e.damage = dealt; e.impact = m.impact; e.high = false; e.x = _v.x; e.y = foe.lieY + 3; e.z = _v.z;
            bus.emit(EV.STRIKE_LANDED);
            this.W.hitStop(m.hs);
            if (foe.state !== 'ko') foe._groundHit();
          }
        }
        // Squash whatever else is under the landing (cars, crowd, a tank)
        _dmgOpt.kind = 'splash'; _dmgOpt.src = this.id; _dmgOpt.aerial = false;
        const tw = this.opponent ? this.opponent.targetable : false;
        if (this.opponent) this.opponent.targetable = false;
        this.ctx.damageInRadius(p, 16, 120, _dmgOpt);
        if (this.opponent) this.opponent.targetable = tw;
        if (this.moveHit === 2) {
          // Nobody home: crash and burn
          const e = bus.ev(EV.STRIKE_WHIFFED);
          e.who = this.id; e.kind = 'splash'; e.combo = 1;
          bus.emit(EV.STRIKE_WHIFFED);
          this.lean = 0;
          this.applyDamage(4, 'fall', this.id, p.x, 2, p.z, false);
          if (this.state !== 'ko') this.knockDown(foe ? foe.id : '', 'strike', 0.2, 0, 0, 0);
        }
      }
      return;
    }
    // Back to its feet beside the body
    const r = Math.min(1, (t - m.startup - m.active) / m.recover);
    this.lean = 1.35 * (1 - smooth(r * 1.6));
    if (t >= this.stateDur) this.setState('neutral');
  }

  // ------------------------------------------------------------------ the rival's signature powers
  _startPower(name) {
    const def = POWERS[name], foe = this.opponent;
    if (!def || this.cd[name] > 0 || this.momentum < def.cost) return false;
    this.cd[name] = def.cd;
    if (name === 'ult') this.spendMomentum(); else this.momentum = this.momentum - def.cost;
    this.setState('attacking', def.windup + def.active + def.recover, null);
    this.move = def; this.moveHit = 0; this.moveEta = def.windup; this.armor = !!def.armor;
    this._syncGate();
    const P = this._pw, p = this.root.position;
    P.fired = false; P.hit = false; P.sx = p.x; P.sz = p.z; P.x = p.x; P.z = p.z;
    if (name === 'stomp' && foe) {
      // The jump is aimed where the foe stands now: walk out of the disc
      let dx = foe.pos.x - p.x, dz = foe.pos.z - p.z;
      const d = Math.hypot(dx, dz) || 1, go = Math.min(def.maxJump, Math.max(0, d - 4));
      P.x = p.x + dx / d * go; P.z = p.z + dz / d * go;
    }
    _onceOpt.duration = name === 'stomp' ? def.windup + def.active + 0.3 : undefined; _onceOpt.commit = def.windup + def.active; _onceOpt.hold = false;
    // The anim layer's own power clip (wind-up, fire pose at the `fire` mark = our windup, recovery) when it has one, else the mocap cast
    const pa = 'power_' + name;
    _animOpt.fade = 0.12; _animOpt.timeScale = 1; _animOpt.duration = def.windup + def.active + def.recover; _animOpt.commit = _animOpt.duration;
    if (!(ANIMS[pa] && this.W.anims.play(this, pa, _animOpt))) {
      for (let i = 0; i < def.clips.length; i++) if (this.glb.playOnce(def.clips[i], 0.12, 1.2, _onceOpt)) break;
      this.animName = '';
    }
    const e = this.W.bus.ev(EV.POWER_TELEGRAPH);
    e.who = this.id; e.target = foe ? foe.id : ''; e.power = name; e.name = this._powerName(name); e.dur = name === 'stomp' ? def.windup + def.active : def.windup;
    e.radius = def.radius || 0; e.x = P.x; e.z = P.z;
    this.W.bus.emit(EV.POWER_TELEGRAPH);
    return true;
  }
  _powerName(power) {
    const c = this.cfg;
    return power === 'beam' ? c.beam.name : power === 'roar' ? c.roar.name : power === 'charge' ? c.charge.name : power === 'stomp' ? 'KAIJU STOMP' : 'KAIJU FURY';
  }
  _emitFired(def, x, y, z, dx, dz, range, radius) {
    const e = this.W.bus.ev(EV.POWER_FIRED);
    e.who = this.id; e.power = def.power; e.name = this._powerName(def.power); e.x = x; e.y = y; e.z = z;
    e.dirX = dx; e.dirZ = dz; e.range = range; e.radius = radius;
    this.W.bus.emit(EV.POWER_FIRED);
  }
  // Everything else under a blast: buildings, cars, the crowd (never the foe: that hit is resolved here, blockable)
  _blast(center, radius, amount, kind) {
    const foe = this.opponent, was = foe ? foe.targetable : false;
    if (foe) foe.targetable = false;
    _dmgOpt.kind = kind; _dmgOpt.src = this.id; _dmgOpt.aerial = true;
    this.ctx.damageInRadius(center, radius, amount, _dmgOpt);
    if (foe) foe.targetable = was;
  }

  _powerTick(dt) {
    const def = this.move, t = this.stateT, foe = this.opponent, P = this._pw, p = this.root.position, ctx = this.ctx;
    const name = def.power, dmg = def.dmg * this.dmgMult;
    if (name === 'stomp') {
      if (t < def.windup) { if (foe) this._turnTo(Math.atan2(P.x - p.x, P.z - p.z), 8, dt); this.lean = -0.2 * smooth(t / def.windup); return; }
      if (!P.fired) {
        P.fired = true;
        this._emitFired(def, p.x, p.y, p.z, Math.sin(this.yaw), Math.cos(this.yaw), Math.hypot(P.x - P.sx, P.z - P.sz), def.radius);
      }
      if (!P.hit) {
        const a = Math.min(1, (t - def.windup) / def.active);
        p.x = P.sx + (P.x - P.sx) * a; p.z = P.sz + (P.z - P.sz) * a;
        p.y = def.peak * 4 * a * (1 - a);
        this.lean = 0.5 * smooth(a);
        if (a >= 1) {
          P.hit = true; p.y = 0; this.lean = 0;
          ctx.clampToBounds(p);
          this._blast(p, def.radius, 220, 'stomp');
          if (foe && this.distTo(foe) <= def.radius + foe.radius * 0.5) foe.receivePower('stomp', dmg, p.x, p.z, this.id, this);
        }
        return;
      }
    } else if (name === 'charge') {
      if (t < def.windup) {
        if (foe && t < def.windup - 0.2) this._turnTo(this.yawTo(foe), 3, dt);
        this.lean = -0.18 * smooth(t / def.windup);
        return;
      }
      if (!P.fired) {
        P.fired = true; P.dx = Math.sin(this.yaw); P.dz = Math.cos(this.yaw);
        this._emitFired(def, p.x, p.y + this.hc, p.z, P.dx, P.dz, def.speed * def.active, 0);
      }
      if (t < def.windup + def.active && !P.hit) {
        this.lean = 0.3;
        p.x += P.dx * def.speed * dt; p.z += P.dz * def.speed * dt;
        ctx.resolveBuildingCollisions(p, this.collideRadius, dt, 1400, this.id);
        ctx.clampToBounds(p);
        if (foe && !foe.held && this.gapTo(foe) <= 2 && this.facing(foe, 1.1)) {
          P.hit = true;
          if (foe.receivePower('charge', dmg, p.x - P.dx * 10, p.z - P.dz * 10, this.id, this) <= 0) P.hit = foe.state !== 'downed';
        }
        return;
      }
      this.lean = 0;
    } else {
      // beam, roar, ult: stand and deliver
      if (t < def.windup) {
        // The aim follows the foe until just before it fires: sidestep late
        if (foe && name === 'beam' && t < def.windup - 0.28) this._turnTo(this.yawTo(foe), 2.4, dt);
        return;
      }
      if (!P.fired) {
        P.fired = true;
        const y = this.yaw, dx = Math.sin(y), dz = Math.cos(y);
        if (name === 'beam') {
          const ox = p.x + dx * (this.radius + 2), oz = p.z + dz * (this.radius + 2), oy = p.y + this.height * 0.75;
          // The first building in the way stops it (and takes it)
          _beam.t = 1; _beam.b = null;
          ctx.sweepBuildings(ox, oz, ox + dx * def.range, oz + dz * def.range, def.width, _beamVisit);
          const range = def.range * _beam.t;
          if (_beam.b) ctx.damageBuilding(_beam.b, 260, null, this.id);
          this._emitFired(def, ox, oy, oz, dx, dz, range, 0);
          if (foe && !foe.held) {
            const fx = foe.pos.x - ox, fz = foe.pos.z - oz;
            const along = fx * dx + fz * dz, perp = Math.abs(fx * dz - fz * dx);
            if (along > -foe.radius && along < range + foe.radius && perp < foe.radius * 0.8 + def.width) foe.receivePower('beam', dmg, p.x, p.z, this.id, this);
          }
        } else {
          this._emitFired(def, p.x, p.y + this.hc, p.z, dx, dz, 0, def.radius);
          if (name === 'ult') this.W.slowMo(0.45, 0.5);
          this._blast(p, def.radius, name === 'ult' ? 250 : 170, name);
          if (foe && this.distTo(foe) <= def.radius + foe.radius * 0.5) foe.receivePower(name, dmg, p.x, p.z, this.id, this);
        }
        this.armor = false;
      }
    }
    if (t >= this.stateDur) this.setState('neutral');
  }

  // The player's own powers are fired by game.js: seen here as a cooldown that just started
  _watchPlayerPowers() {
    const cds = this.ctx.player.cooldowns, prev = this._cdPrev;
    if (!cds) return;
    let fired = '';
    for (const k in prev) {
      const v = cds[k] || 0;
      if (v > prev[k] + 0.4) fired = k;
      prev[k] = v;
    }
    if (!fired) return;
    const p = this.root.position, y = this.yaw, c = this.cfg, bus = this.W.bus;
    const e = bus.ev(EV.POWER_FIRED);
    e.who = this.id; e.power = fired; e.name = this._powerName(fired); e.x = p.x; e.y = p.y + this.hc; e.z = p.z;
    e.dirX = Math.sin(y); e.dirZ = Math.cos(y);
    e.range = fired === 'beam' ? 190 : 0; e.radius = fired === 'roar' ? c.roar.radius : fired === 'stomp' ? 36 : fired === 'ult' ? 130 : 0;
    bus.emit(EV.POWER_FIRED);
    if (fired === 'ult') { this._momFull = false; this._emitWho(EV.MOMENTUM_SPENT); }
    if (this.state === 'neutral' || this.state === 'attacking') {
      // Committed for a moment (the rival's opening); the jump stays steerable
      this.setState('attacking', PLAYER_POWER_COMMIT[fired], null);
      this.move = _playerPower[fired]; this.moveHit = 1; this.moveEta = 0;
      this._syncGate();
    }
  }

  // ------------------------------------------------------------------ per-frame
  /** Per-frame update while the simulation runs (dt = sim seconds: 0 during hit-stop, scaled in slow-mo). */
  update(dt) {
    const it = this.intent, B = this._buf;
    this.stateT += dt;
    // The flurry's strikes run fast
    if (this.comebackPhase === 'flurry' && this.state === 'attacking' && this.move && STRIKE_KINDS[this.move.kind]) this.stateT += dt * (TUNE.cbHaste - 1);
    this._tick(dt);
    // One-frame presses are remembered for a moment so a press during recovery still counts
    if (it.strike) B.strike = 0.24; if (it.heavy) B.heavy = 0.24; if (it.grab) B.grab = 0.24; if (it.pin) B.pin = 0.24; if (it.finisher) B.finisher = 0.2;
    // HP can also run out outside applyDamage: the player's, to military fire through game.js
    if (this.state !== 'ko' && this.hp <= 0) {
      const p = this.root.position;
      this._ko('military', p.x, p.y + this.height * 0.6, p.z);
    }
    if (this.isPlayer) this._watchPlayerPowers();
    // The comeback: a taunt press while hurt, behind and beaten fires it up (from the mat, too); the flurry runs out
    if (it.taunt && dt > 0 && this.comebackReady) { it.taunt = false; this._startComeback(); }
    if (this.comebackPhase === 'flurry') {
      this.comeback -= dt;
      if (this.comeback <= 0 || this.held && this.state !== 'grappling') this.endComeback('time');
    }
    if (!this.held) {
      switch (this.state) {
        case 'neutral': this._neutral(dt); break;
        case 'attacking': this._attacking(dt); break;
        case 'blocking': this._blocking(dt); break;
        case 'downed': this._downed(dt); break;
        case 'taunting': this._taunting(dt); break;
        case 'gettingUp':
          if (this.stateT >= this.stateDur) {
            this.invuln = false; this.invulnT = TUNE.getupInvuln;
            this.lockT = 0; this.lockHits = 0;
            this.setState('neutral');
            this._emitWho(EV.GETUP_DONE);
          }
          break;
        case 'ko':
          if (this.falling > 0) this.falling -= dt;
          break;
        default:
          if (this.stateDur > 0 && this.stateT >= this.stateDur) this.setState('neutral');
      }
      this._moveBody(dt);
    }
    if (!this.isPlayer) this.glb.mixer.update(dt); // the player's mixer ticks in updatePlayer
    this._pose(dt);
  }

  _tick(dt) {
    const B = this._buf, s = this.state;
    if (B.strike > 0) B.strike -= dt; if (B.heavy > 0) B.heavy -= dt; if (B.grab > 0) B.grab -= dt; if (B.pin > 0) B.pin -= dt; if (B.finisher > 0) B.finisher -= dt;
    if (this.blockStun > 0) this.blockStun -= dt;
    if (this.blockLock > 0) this.blockLock -= dt;
    if (this.reblock > 0) this.reblock -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.finished > 0) this.finished -= dt;
    if (this.reboundCd > 0) this.reboundCd -= dt;
    if (this._kindLock.t > 0) this._kindLock.t -= dt;
    if (this._beat > 0) this._beat *= Math.exp(-dt / TUNE.cbMemory);
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    // Stun-lock guard: time without control since last free
    if (s === 'staggered' || s === 'stunned') this.lockT += dt;
    else if (s === 'neutral' || s === 'blocking' || s === 'attacking') {
      this.freeT += dt;
      if (this.freeT > 0.35) { this.lockT = 0; this.lockHits = 0; }
      if (this.freeT > 2) this.grabChain = 0;
    }
    if (s !== 'neutral' && s !== 'blocking' && s !== 'attacking') this.freeT = 0;
    // Stamina
    if (this._regenDelay > 0) this._regenDelay -= dt;
    else if (this.stamina < this.maxStamina && s !== 'blocking' && s !== 'attacking' && s !== 'grappling' && s !== 'pinning') {
      const it = this.intent, sprinting = s === 'neutral' && it.sprint && (it.moveX !== 0 || it.moveZ !== 0);
      const rate = sprinting ? 0 : (s === 'neutral' || s === 'taunting' || s === 'cinematic') ? TUNE.stamRegen : TUNE.stamRegenDown;
      this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    }
    if (this.tired && this.stamina >= TUNE.stamRecoverAt) { this.tired = false; this._emitWho(EV.STAMINA_RECOVERED); }
    // Momentum. The classic game feeds the player's meter for everything it wrecks (+6 a building: a finisher's
    // blast would refill itself); in a match only a trickle of that counts.
    if (this.isPlayer) {
      const r = this.ctx.player.rage;
      if (r > this._momShadow + 0.01) this.momentum = this._momShadow + Math.min((r - this._momShadow) * 0.01, 0.1);
      else this._momShadow = r;
    }
    if (this.W.match.state.phase === 'fight' && s !== 'ko') this.gainMomentum(TUNE.momPassive * dt);
    const full = this.momentum >= 100;
    if (full && !this._momFull) { this._momFull = true; this._emitWho(EV.MOMENTUM_FULL); }
    else if (!full && this._momFull && this.momentum < 90) this._momFull = false;
  }

  _neutral(dt) {
    const ctx = this.ctx, it = this.intent, B = this._buf, foe = this.opponent;
    const moving = it.moveX !== 0 || it.moveZ !== 0;
    const sprint = it.sprint && moving && !this.tired;
    if (sprint) this.spend(TUNE.sprintDrain * dt);
    if (!this.isPlayer) {
      // The player's neutral movement is updatePlayer's; the rival walks its intent
      const wet = this.waterSlow || (this.sink > 1 ? 0.8 : 1);
      const speed = this.cfg.stats.speed * (sprint ? 32 : 18) * this.speedMult * (this.tired ? TUNE.tiredMove : 1) * wet;
      const p = this.root.position;
      p.x += it.moveX * speed * dt;
      p.z += it.moveZ * speed * dt;
      if (it.faceYaw !== null) this._turnTo(it.faceYaw, 6, dt);
      this.glb.play(moving ? (sprint ? 'run' : 'walk') : 'idle', moving ? 0.25 : 0.4);
    }
    if (this.W.match.state.phase !== 'fight') return;
    const g = this.W.grapple;
    if (B.finisher > 0 && g.tryFinisher(this)) { B.finisher = 0; return; }
    if (it.power && !this.isPlayer && this._startPower(it.power)) return;
    const down = foe && foe.state === 'downed' && !foe.held && foe.falling <= 0;
    if (B.pin > 0 && down && this.groundGap(foe) <= MOVES.reach.reach + 8) {
      B.pin = 0; B.grab = 0;
      this._reachPin = true;
      this._startMove(MOVES.reach);
      return;
    }
    if (B.grab > 0) {
      B.grab = 0;
      this._reachPin = false;
      this._startMove(down && this.groundGap(foe) <= MOVES.reach.reach + 8 ? MOVES.reach : MOVES.grab);
      return;
    }
    if (B.heavy > 0) {
      B.heavy = 0;
      this._startMove(down && this.groundGap(foe) <= MOVES.splash.reach ? MOVES.splash : MOVES.heavy);
      return;
    }
    if (B.strike > 0) {
      B.strike = 0;
      if (down && this.groundGap(foe) <= MOVES.stomp.reach + 6) this._startMove(MOVES.stomp);
      else if (sprint && foe && this.gapTo(foe) > 8) this._startMove(MOVES.clothesline);
      else this._startMove(MOVES.light1);
      return;
    }
    if (it.taunt) { this._startTaunt(); return; }
    if (it.block && this.blockLock <= 0 && this.stamina > 0) {
      this.blockT = 0;
      this.reversalOk = this.reblock <= 0;
      this.setState('blocking');
      this._emitWho(EV.BLOCK_START);
    }
  }

  _blocking(dt) {
    const it = this.intent, B = this._buf;
    this.blockT += dt;
    this.spend(TUNE.blockDrain * dt);
    if (!this.isPlayer && this.opponent) this._turnTo(this.yawTo(this.opponent), 6, dt);
    if (this.blockStun > 0) return;
    if (this.stamina <= 0) { this.blockLock = 1.0; this.reblock = TUNE.reblockLock; this.setState('neutral'); return; }
    // A press out of the guard drops it and goes
    if (!it.block || B.strike > 0 || B.grab > 0 || B.heavy > 0) {
      this.reblock = TUNE.reblockLock;
      this.setState('neutral');
      if (this.W.match.state.phase === 'fight' && (B.strike > 0 || B.grab > 0 || B.heavy > 0)) this._neutral(0);
    }
  }

  _downed(dt) {
    if (this.falling > 0) {
      this.falling -= dt;
      if (this.falling <= 0) this._emitKnockdown(this._downBy || '', this._downCause || 'strike', this.lastImpact);
      return;
    }
    // Mashing gets a downed kaiju up sooner (never before the minimum: the opening is real)
    const it = this.intent;
    if (it.mash > 0 && this.stateDur - this.stateT > 0) this.stateDur = Math.max(Math.min(this.stateDur, TUNE.fallDur + TUNE.downMin), this.stateDur - it.mash * TUNE.mashGetup);
    if (this.stateT >= this.stateDur) this.getUp();
  }

  _startTaunt() {
    this._tauntId = this._tauntId === 'taunt_a' ? 'taunt_b' : 'taunt_a';
    this._taunt = 1;
    this.setState('taunting', TUNE.tauntDur, null);
    _animOpt.fade = 0.15; _animOpt.timeScale = 1; _animOpt.duration = TUNE.tauntDur; _animOpt.commit = TUNE.tauntDur;
    this.W.anims.play(this, this._tauntId, _animOpt);
    const e = this.W.bus.ev(EV.TAUNT_START);
    e.who = this.id; e.id = this._tauntId; e.dur = TUNE.tauntDur;
    this.W.bus.emit(EV.TAUNT_START);
  }
  _taunting(dt) {
    if (this.comebackPhase === 'fire') { if (this.stateT >= this.stateDur) this._cbFlurry(); return; }
    if (this.stateT < this.stateDur) return;
    const foe = this.opponent;
    const gain = foe && (foe.state === 'downed' || foe.state === 'stunned') ? TUNE.tauntMomDown : TUNE.tauntMom;
    const m0 = this.momentum;
    this.gainMomentum(gain);
    this.stamina = Math.min(this.maxStamina, this.stamina + TUNE.tauntStam);
    if (this.isPlayer) this.ctx.addScore(300);
    this._taunt = 0;
    const e = this.W.bus.ev(EV.TAUNT_COMPLETE);
    e.who = this.id; e.id = this._tauntId; e.momentum = this.momentum - m0;
    this.W.bus.emit(EV.TAUNT_COMPLETE);
    this.setState('neutral');
  }

  // ------------------------------------------------------------------ the comeback ("firing up")
  // Fire-up (TUNE.cbFire s): up off the mat, rooted, roaring at the crowd, shrugging hits off. Then the flurry
  // (cbFlurry s): free again, strikes faster and harder, still no-selling; its big shot floors the foe and
  // ends it. A reversal cuts it off. Costs cbCost momentum; once a fall.
  _startComeback() {
    const T = TUNE;
    this._cbFall = true; this._cbMatch++;
    this.momentum = this.momentum - T.cbCost;
    this.comebackPhase = 'fire'; this.comeback = T.cbFire + T.cbFlurry;
    this.vel.set(0, 0, 0);
    this.falling = 0; this.invuln = false; this.invulnT = 0; this.blockStun = 0;
    this.lockT = 0; this.lockHits = 0; this.grabChain = 0;
    this.lieTarget = 0; // a root-tipped body rises through the fire-up
    this.stamina = Math.max(this.stamina, 60);
    this._buf.strike = 0; this._buf.heavy = 0; this._buf.grab = 0; this._buf.pin = 0;
    this.setState('taunting', T.cbFire, null);
    _animOpt.fade = 0.2; _animOpt.timeScale = 1; _animOpt.duration = T.cbFire; _animOpt.commit = T.cbFire;
    this.W.anims.play(this, 'taunt_a', _animOpt);
    if (this.isPlayer) this.ctx.addScore(500);
    const e = this.W.bus.ev(EV.COMEBACK_START);
    e.who = this.id; e.dur = this.comeback; e.fire = T.cbFire;
    this.W.bus.emit(EV.COMEBACK_START);
  }
  _cbFlurry() {
    this.comebackPhase = 'flurry'; this.comeback = TUNE.cbFlurry;
    this.setState('neutral');
    const e = this.W.bus.ev(EV.COMEBACK_FLURRY);
    e.who = this.id; e.dur = TUNE.cbFlurry;
    this.W.bus.emit(EV.COMEBACK_FLURRY);
  }
  /** The comeback is over. by: 'time' | 'done' (its flurry floored the foe) | 'cut' (reversed, knocked out) | 'fall'. */
  endComeback(by) {
    if (!this.comebackPhase) return;
    const was = this.comebackPhase;
    this.comebackPhase = ''; this.comeback = 0;
    if (by === 'time' || by === 'done') this.spend(TUNE.cbAfterStam); // it emptied the tank
    if (was === 'fire' && this.state === 'taunting' && by !== 'fall') this.setState('neutral');
    const e = this.W.bus.ev(EV.COMEBACK_END);
    e.who = this.id; e.by = by;
    this.W.bus.emit(EV.COMEBACK_END);
  }

  // Knockback, buildings, bounds, the other body, wading
  _moveBody(dt) {
    const v = this.vel, p = this.root.position, ctx = this.ctx;
    const sp = Math.hypot(v.x, v.z);
    const own = !this.isPlayer || ctx.player.control.external;
    if (sp > 0.5) {
      p.x += v.x * dt; p.z += v.z * dt;
      const k = Math.max(0, sp - TUNE.friction * dt) / sp;
      v.x *= k; v.z *= k;
    } else if (sp > 0) v.set(0, 0, 0);
    if (!own) return; // game.js resolves the player's collisions while it drives it
    if (this.state !== 'cinematic') {
      ctx.resolveBuildingCollisions(p, this.collideRadius, dt, sp > 20 ? 300 : 35, this.id);
      ctx.clampToBounds(p);
    }
    // Keep the bodies apart while game.js's push-out is off (it only runs for a player under its own control)
    const o = this.opponent;
    if (o && this.solid && o.solid && !o.held && (this.isPlayer || ctx.player.control.external)) {
      const q = o.root.position;
      let dx = p.x - q.x, dz = p.z - q.z;
      const min = this.radius + o.radius, d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-4) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        dx /= d; dz /= d;
        p.x += dx * push; p.z += dz * push;
        q.x -= dx * push; q.z -= dz * push;
      }
    }
    this._wade(dt);
  }

  // Wading depth: game.js keeps the rival's (waterSink); the player's own wade is off while its root is taken away
  _wade(dt) {
    const p = this.root.position, ctx = this.ctx;
    if (!this.isPlayer && this.waterSink !== undefined) { this.sink = this.waterSink; return; }
    const wet = ctx.waterDepth ? ctx.waterDepth(p.x, p.z) * 3.2 : ctx.isWater(p.x, p.z) ? 3 : 0;
    this.sink += (wet - this.sink) * (1 - Math.exp(-3 * dt));
  }

  // The control gate: what game.js may still do with the player's body this frame
  _syncGate() {
    if (!this.isPlayer) return;
    const c = this.ctx.player.control, s = this.state, m = this.move;
    const fight = this.W.match && this.W.match.state.phase === 'fight';
    c.external = this.held || HELPLESS.has(s) || (s === 'attacking' && !!m && !!m.ext);
    c.melee = false; // strikes are the fighter's (intent.strike)
    c.powers = s === 'neutral' && fight;
    c.move = s === 'neutral' ? (this.tired ? TUNE.tiredMove : 1) : s === 'blocking' ? TUNE.blockMove : s === 'attacking' && m && m.steer ? m.steer : 0;
    c.ult = c.powers && !this.W.grapple.canFinisher(this);
  }

  /** While the simulation is stopped (pause, upgrade picker, game over): keep animating. */
  updateIdle(dtReal) {
    if (!this.isPlayer) this.glb.mixer.update(dtReal); // game.js ticks the player's
    this._pose(dtReal);
  }

  _turnTo(yaw, rate, dt) {
    const d = yaw - this.root.rotation.y;
    this.root.rotation.y += Math.atan2(Math.sin(d), Math.cos(d)) * (1 - Math.exp(-rate * dt));
  }

  // Root-driven pose: the topple to the mat and back, a move's lean, the hit wobble and flash
  _pose(dt) {
    if (this._lieP !== this.lieTarget) {
      const up = this.lieTarget > this._lieP;
      const step = dt / (up ? TUNE.fallDur : TUNE.getupDur * 0.85);
      this._lieP = up ? Math.min(1, this._lieP + step) : Math.max(0, this._lieP - step);
      // Falling accelerates into the mat; rising eases both ends
      this.lie = up ? this._lieP * this._lieP : smooth(this._lieP);
    }
    if (this._flinch > 0) {
      this._flinch = Math.max(0, this._flinch - dt * 4.5);
      this._setGlow(this._flinch * this._flinch * 0.16); // a blink, not a whiteout (the VFX layer owns the real hit flash)
    }
    if (this.held) return;
    const r = this.root.rotation, f = this._flinch;
    r.z = f > 0 && this.lie < 0.2 ? Math.sin(f * 14) * 0.07 * f * this._flinchDir : 0;
    const own = !this.isPlayer || this.ctx.player.control.external;
    if (own) {
      r.x = -this.lie * HALF_PI + this.lean;
      const air = this.state === 'attacking' && this.move && this.move.ext && this.root.position.y > 0;
      if (!air) this.root.position.y = this.lie * this.lieY - this.sink * (1 - this.lie * 0.6);
    } else if (r.x !== 0) r.x = 0;
  }

  _setGlow(v) {
    if (!this._glow) {
      this._glow = [];
      this.root.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) this._glow.push(o.material);
      });
    }
    for (let i = 0; i < this._glow.length; i++) this._glow[i].emissive.setScalar(v);
  }

  /** Undo everything this fighter did to its root / materials (mode dispose). */
  dispose() {
    this._setGlow(0);
    this.held = false;
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    this.root.rotation.order = this._orderWas;
    if (this.root.position.y !== 0 && !this.isPlayer) this.root.position.y = 0;
    if (this.isPlayer) this.ctx.player.control.external = false;
  }
}
const RECOVERY = { id: 'recover', kind: 'ppower', startup: 0, active: 0, recover: 0 };
// The defender's answer to a reversal (the shot itself lands at once; this is its follow-through)
const COUNTER = { id: 'counter', kind: 'ppower', startup: 0, active: 0, recover: 0 };
// What the player's classic powers look like to the state machine (and to the rival's reads)
const _playerPower = {
  beam: { id: 'beam', kind: 'ppower', power: 'beam', steer: PLAYER_POWER_STEER.beam, startup: 0, active: 0, recover: PLAYER_POWER_COMMIT.beam },
  roar: { id: 'roar', kind: 'ppower', power: 'roar', steer: PLAYER_POWER_STEER.roar, startup: 0, active: 0, recover: PLAYER_POWER_COMMIT.roar },
  charge: { id: 'charge', kind: 'ppower', power: 'charge', steer: PLAYER_POWER_STEER.charge, startup: 0, active: 0, recover: PLAYER_POWER_COMMIT.charge },
  stomp: { id: 'pstomp', kind: 'ppower', power: 'stomp', steer: PLAYER_POWER_STEER.stomp, startup: 0, active: 0, recover: PLAYER_POWER_COMMIT.stomp },
  ult: { id: 'ult', kind: 'ppower', power: 'ult', steer: PLAYER_POWER_STEER.ult, startup: 0, active: 0, recover: PLAYER_POWER_COMMIT.ult },
};

export function createFighter(ctx, W, o) { return new Fighter(ctx, W, o); }
