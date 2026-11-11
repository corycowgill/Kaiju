// Fighter: one abstraction over either kaiju in a match. The player's Fighter
// wraps game.js's player (HP = state.hp, momentum = state.rage, facing =
// state.yaw, neutral movement and the classic powers stay in updatePlayer);
// the rival's owns its root outright. Both are driven by an INTENT struct:
// input.js fills the player's from raw input, rivalAI.js fills the rival's.
// OWNER: combat core (fighter.js + match.js + grapple.js).
// INTEGRATOR STARTING POINT: the public surface below is the contract other
// modules read (see notes/wrestling_api.md); the behaviour is only the
// vertical slice - rival locomotion, one telegraphed basic strike, damage
// intake from every player attack with a flinch, timed states for QA, KO.
import * as THREE from 'three';
import { EV } from './events.js';

/** Every state a fighter can be in (design section 3). */
export const STATES = Object.freeze(['neutral', 'attacking', 'blocking', 'staggered', 'grappling', 'grappled',
  'airborne', 'downed', 'gettingUp', 'stunned', 'pinning', 'pinned', 'taunting', 'ko', 'cinematic']);
// The anim a state shows when nothing more specific is playing
const STATE_ANIM = { blocking: 'block', staggered: 'stagger', grappling: 'lockup', grappled: 'lockup', airborne: 'carried',
  downed: 'downed', gettingUp: 'getup', stunned: 'stunned', pinning: 'pin_cover', pinned: 'pinned', taunting: 'taunt_a', ko: 'ko' };
// States in which the fighter does not drive itself: for the player these
// take the root away from updatePlayer (ctx.player.control.external)
const HELPLESS = new Set(['staggered', 'grappling', 'grappled', 'airborne', 'downed', 'gettingUp', 'stunned', 'pinning', 'pinned', 'taunting', 'ko', 'cinematic']);

/** What a fighter wants to do this frame. Edges (strike, heavy, grab, taunt,
 *  finisher, mash, power) are true/non-zero for ONE update and cleared by the
 *  composer; held fields persist while held. */
export function createIntent() {
  return {
    moveX: 0, moveZ: 0,   // desired movement, WORLD space, length 0..1
    sprint: false,        // held
    faceYaw: null,        // rad: turn to face this (rival only; the player's facing is ctx.player.yaw); null = leave
    strike: false,        // pressed: light strike / next hit of the string
    strikeHeld: false,    // held
    heavy: false,         // pressed: heavy strike (input.js decides hold-vs-tap; sprint + strike = clothesline is the core's call)
    block: false,         // held
    grab: false,          // pressed: grab / pick up a downed foe
    grabHeld: false,      // held: pin a downed foe
    dirX: 0, dirZ: 0,     // move choice in a lock-up, relative to own facing: z +1 forward (whip), -1 back (suplex); x +-1 sideways (swing); 0,0 = slam
    taunt: false,         // pressed
    finisher: false,      // pressed (the ultimate button)
    mash: 0,              // mash presses this frame (escape a hold / kick out)
    power: '',            // rival AI only: 'beam' | 'roar' | 'charge' | 'stomp' | 'ult' requested this frame
  };
}
/** Clear the one-frame edges (the composer calls this after every update). */
export function clearIntentEdges(it) {
  it.strike = false; it.heavy = false; it.grab = false; it.taunt = false; it.finisher = false;
  it.mash = 0; it.power = '';
}

// Fraction of a classic player attack's raw damage that lands on a kaiju
// (they are tuned to one-shot tanks). Slice numbers; the combat core retunes.
const TAKEN = { melee: 0.35, beam: 0.30, atomic: 0.22, roar: 0.25, charge: 0.30, stomp: 0.25, ult: 0.6, military: 1.0, aoe: 0.3 };
const POWER_OF = { beam: 'beam', atomic: 'beam', roar: 'roar', charge: 'charge', stomp: 'stomp', ult: 'ult' };
const STRIKE_WINDUP = 0.42, STRIKE_TOTAL = 1.0, STRIKE_REACH = 7, STRIKE_ARC = 0.9;

const _v = new THREE.Vector3();
const _hurt = { raw: true, x: 0, z: 0, flash: true };

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
    this.opponent = null;
    this.intent = createIntent();
    this.vel = new THREE.Vector3();   // knockback / throw velocity (u/s), integrated by the core
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
    this._hp = 1; this._maxHp = 1;
    this.stamina = 100; this.maxStamina = 100;
    this._momentum = 0;
    this.strikeCd = 0;
    this._struck = false;
    this._flinch = 0; this._flinchDir = 1;
    this._glow = null;                // materials flashed on a hit
    this._topple = -1;                // procedural fall for a rig with no knockdown clip (0..1, -1 = off)
  }

  // ---- vitals (the player's live in game.js's state) ----
  get hp() { return this.isPlayer ? this.ctx.player.hp : this._hp; }
  set hp(v) { if (this.isPlayer) this.ctx.player.hp = v; else this._hp = v; }
  get maxHp() { return this.isPlayer ? this.ctx.player.maxHp : this._maxHp; }
  set maxHp(v) { if (this.isPlayer) this.ctx.player.maxHp = v; else this._maxHp = v; }
  /** Momentum 0..100 (the player's is the rage meter). */
  get momentum() { return this.isPlayer ? this.ctx.player.rage : this._momentum; }
  set momentum(v) { if (this.isPlayer) this.ctx.player.rage = v; else this._momentum = v; }
  /** root.position: THE gameplay position (y = 0 on the ground). */
  get pos() { return this.root.position; }
  /** Facing (rad): forward = (sin yaw, 0, cos yaw). */
  get yaw() { return this.isPlayer ? this.ctx.player.yaw : this.root.rotation.y; }
  set yaw(v) { if (this.isPlayer) this.ctx.player.yaw = v; this.root.rotation.y = v; }
  get alive() { return this.state !== 'ko'; }
  get helpless() { return HELPLESS.has(this.state); }

  /** Body centre in world space (hips bone; root + half height without one). */
  center(out) {
    if (this.bones.hips) return this.bones.hips.getWorldPosition(out);
    return out.copy(this.root.position).setY(this.root.position.y + this.height * 0.45);
  }
  /** Horizontal distance between the two roots. */
  distTo(o) { return Math.hypot(o.root.position.x - this.root.position.x, o.root.position.z - this.root.position.z); }
  /** Yaw that faces the other fighter. */
  yawTo(o) { return Math.atan2(o.root.position.x - this.root.position.x, o.root.position.z - this.root.position.z); }
  /** Is the other fighter inside +-halfArc of this one's facing? */
  facing(o, halfArc = STRIKE_ARC) {
    const d = this.yawTo(o) - this.yaw;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= halfArc;
  }

  /** Put the fighter at x, z facing yaw, healthy and neutral (fall start / match start). */
  reset(x, z, yaw, hp) {
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, yaw, 0);
    if (this.isPlayer) this.ctx.player.yaw = yaw;
    if (hp !== undefined) { this.maxHp = hp; this.hp = hp; }
    this.stamina = this.maxStamina;
    this.vel.set(0, 0, 0);
    this.targetable = true; this.solid = true; this.invuln = false;
    this.strikeCd = 0; this._flinch = 0; this._topple = -1;
    this._setGlow(0);
    this.state = 'neutral'; this.prevState = 'neutral'; this.stateT = 0; this.stateDur = 0;
    if (this.isPlayer) this.ctx.player.control.external = false;
    this.W.anims.stop(this, 0);
  }

  /** Enter a state for dur seconds (0 = until something changes it). Emits fighter:state. */
  setState(state, dur = 0) {
    if (!STATES.includes(state)) throw new Error(`[wrestling] unknown fighter state '${state}'`);
    const prev = this.state;
    this.prevState = prev;
    this.state = state; this.stateT = 0; this.stateDur = dur;
    if (this.isPlayer) this.ctx.player.control.external = HELPLESS.has(state);
    const anim = STATE_ANIM[state];
    if (anim) this.W.anims.play(this, anim);
    else if (state === 'neutral' && prev !== 'attacking') this.W.anims.stop(this);
    const e = this.W.bus.ev(EV.FIGHTER_STATE);
    e.who = this.id; e.state = state; e.prev = prev; e.dur = dur;
    this.W.bus.emit(EV.FIGHTER_STATE);
  }

  /**
   * A hit from outside the combat core: every classic player attack (game.js
   * routes melee, beam, roar, charge, stomp and ultimate here when this is the
   * rival) and military fire. amount is the attack's raw damage; kind is
   * 'melee' | 'beam' | 'atomic' | 'roar' | 'charge' | 'stomp' | 'ult' |
   * 'military' | 'aoe'; sx, sz is where it came from. Returns HP removed.
   */
  takeHit(amount, kind, sx, sz) {
    const scale = TAKEN[kind] !== undefined ? TAKEN[kind] : TAKEN.aoe;
    if (!scale || !this.targetable) return 0;
    const by = kind === 'military' ? 'military' : this.opponent ? this.opponent.id : '';
    // Contact point: on the body's edge toward the source, chest height
    const p = this.root.position;
    let dx = sx - p.x, dz = sz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const cx = p.x + dx * this.radius * 0.6, cy = p.y + this.height * 0.6, cz = p.z + dz * this.radius * 0.6;
    const dealt = this.applyDamage(amount * scale, kind, by, cx, cy, cz, false);
    if (dealt <= 0) return 0;
    const bus = this.W.bus;
    if (kind === 'melee') {
      const e = bus.ev(EV.STRIKE_LANDED);
      e.who = by; e.target = this.id; e.kind = 'light'; e.damage = dealt; e.impact = 0.3; e.x = cx; e.y = cy; e.z = cz;
      bus.emit(EV.STRIKE_LANDED);
    } else if (POWER_OF[kind]) {
      const e = bus.ev(EV.POWER_HIT);
      e.who = by; e.target = this.id; e.power = POWER_OF[kind]; e.damage = dealt;
      e.impact = kind === 'ult' ? 1 : 0.6; e.x = cx; e.y = cy; e.z = cz;
      bus.emit(EV.POWER_HIT);
    }
    return dealt;
  }

  /**
   * Remove HP (already scaled) and report it: flinch, 'damage', and 'ko' at 0.
   * The combat core's strikes, slams and building impacts all end here.
   * Returns HP actually removed (0 when invulnerable or already out).
   */
  applyDamage(amount, kind, by, x, y, z, blocked) {
    if (this.invuln || this.state === 'ko' || amount <= 0) return 0;
    let dealt;
    if (this.isPlayer) {
      _hurt.x = x; _hurt.z = z;
      dealt = this.ctx.hurtPlayer(amount, _hurt);
    } else {
      dealt = Math.min(amount, this._hp);
      this._hp -= dealt;
    }
    this._flinch = 1;
    this._flinchDir = -this._flinchDir;
    const e = this.W.bus.ev(EV.DAMAGE);
    e.who = this.id; e.by = by; e.amount = dealt; e.kind = kind; e.hp = this.hp; e.maxHp = this.maxHp;
    e.blocked = !!blocked; e.x = x; e.y = y; e.z = z;
    this.W.bus.emit(EV.DAMAGE);
    if (this.hp <= 0) this._ko(by, x, y, z);
    return dealt;
  }

  _ko(by, x, y, z) {
    this.targetable = false; this.solid = false;
    this.setState('ko');
    // No knockdown clip on this rig (Tridon): tip the root over instead
    if (this.animName !== 'ko') this._topple = 0;
    const e = this.W.bus.ev(EV.KO);
    e.who = this.id; e.by = by; e.x = x; e.y = y; e.z = z;
    this.W.bus.emit(EV.KO);
  }

  _startStrike() {
    const foe = this.opponent;
    this.setState('attacking', STRIKE_TOTAL);
    this._struck = false;
    this.W.anims.play(this, 'strike_1', _strikeAnim);
    const e = this.W.bus.ev(EV.STRIKE_START);
    e.who = this.id; e.target = foe ? foe.id : ''; e.kind = 'light'; e.windup = STRIKE_WINDUP;
    this.W.bus.emit(EV.STRIKE_START);
  }

  _resolveStrike() {
    const foe = this.opponent, bus = this.W.bus;
    this._struck = true;
    const inReach = foe && foe.targetable && this.distTo(foe) <= this.radius + foe.radius + STRIKE_REACH && this.facing(foe);
    if (!inReach) {
      const e = bus.ev(EV.STRIKE_WHIFFED);
      e.who = this.id; e.kind = 'light';
      bus.emit(EV.STRIKE_WHIFFED);
      return;
    }
    // Contact point: the foe's edge on the line between the bodies, chest height
    const a = this.root.position, b = foe.root.position;
    const d = this.distTo(foe) || 1;
    const cx = b.x + (a.x - b.x) / d * foe.radius * 0.6, cz = b.z + (a.z - b.z) / d * foe.radius * 0.6, cy = b.y + foe.height * 0.6;
    const dealt = foe.applyDamage(this.cfg.stats.melee * 0.3, 'light', this.id, cx, cy, cz, false);
    if (dealt <= 0) return;
    const e = bus.ev(EV.STRIKE_LANDED);
    e.who = this.id; e.target = foe.id; e.kind = 'light'; e.damage = dealt; e.impact = 0.3; e.x = cx; e.y = cy; e.z = cz;
    bus.emit(EV.STRIKE_LANDED);
  }

  /** Per-frame update while the simulation runs (dt = sim seconds: 0 during hit-stop, scaled in slow-mo). */
  update(dt) {
    const ctx = this.ctx, it = this.intent;
    this.stateT += dt;
    this.strikeCd = Math.max(0, this.strikeCd - dt);
    // HP can also run out outside applyDamage: the player's, to military fire through game.js
    if (this.state !== 'ko' && this.hp <= 0) {
      const p = this.root.position;
      this._ko('military', p.x, p.y + this.height * 0.6, p.z);
    }
    if (this.state === 'neutral') {
      if (!this.isPlayer) {
        // The player's neutral movement is updatePlayer's; the rival walks its intent
        const speed = this.cfg.stats.speed * (it.sprint ? 32 : 18) * this.speedMult;
        const p = this.root.position;
        p.x += it.moveX * speed * dt;
        p.z += it.moveZ * speed * dt;
        ctx.resolveBuildingCollisions(p, this.collideRadius, dt, 35, 'rival');
        ctx.clampToBounds(p);
        if (it.faceYaw !== null) this._turnTo(it.faceYaw, 6, dt);
        const moving = it.moveX !== 0 || it.moveZ !== 0;
        this.glb.play(moving ? (it.sprint ? 'run' : 'walk') : 'idle', moving ? 0.25 : 0.4);
      }
      // (the player's strikes still come from game.js's fireMelee while control.melee is on)
      if (it.strike && this.strikeCd <= 0 && (!this.isPlayer || !ctx.player.control.melee)) this._startStrike();
    } else if (this.state === 'attacking') {
      if (!this.isPlayer && this.opponent) this._turnTo(this.yawTo(this.opponent), 4, dt);
      if (!this._struck && this.stateT >= STRIKE_WINDUP) this._resolveStrike();
      if (this.stateT >= this.stateDur) { this.strikeCd = 0.9; this.setState('neutral'); }
    } else if (this.state !== 'ko' && this.stateDur > 0 && this.stateT >= this.stateDur) {
      this.setState('neutral');
    }
    if (!this.isPlayer) this.glb.mixer.update(dt); // the player's mixer ticks in updatePlayer
    this._pose(dt);
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

  // Slice hit reaction: a quick roll wobble + a white flash on the body, and
  // the clip-less KO fall. The animation / VFX owners replace both.
  _pose(dt) {
    if (this._flinch > 0) {
      this._flinch = Math.max(0, this._flinch - dt * 3.2);
      const f = this._flinch;
      if (this._topple < 0) this.root.rotation.z = Math.sin(f * 14) * 0.07 * f * this._flinchDir;
      this._setGlow(f * f * 0.55);
    }
    if (this._topple >= 0 && this._topple < 1) {
      this._topple = Math.min(1, this._topple + dt / 1.1);
      const e = this._topple * this._topple;
      this.root.rotation.z = e * Math.PI * 0.47;
      this.root.position.y = -e * 1.5;
    }
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
    this.root.rotation.z = 0;
    if (this.isPlayer) this.ctx.player.control.external = false;
  }
}
const _strikeAnim = { timeScale: 1.4, commit: 0.6 };

export function createFighter(ctx, W, o) { return new Fighter(ctx, W, o); }
