// Wrestling animation layer: named anims played on either kaiju.
// OWNER: animation engineer (anims.js, animRig.js, animDefs.js, ../kaijuLoader.js).
//
// No kaiju ships a wrestling clip, so every name below is built in code:
//  - animDefs.js describes each anim as a pose function over time, in channels
//    that mean the same thing on all three bodies; animRig.js solves it on a
//    kaiju's bind pose (IK arms and legs) and bakes a THREE.AnimationClip.
//    Clips are baked once per kaiju key and shared across restarts and mixers.
//  - They play on the kaiju's own mixer through kaijuLoader's state machine, so
//    they crossfade with the mocap clips the classic powers still use.
//  - On top of the clips, after both mixers have ticked each frame, this module
//    adds what cannot be baked: locomotion picked from the root's real
//    velocity (stance, walk, back-pedal, strafe, run - time-scaled so feet do
//    not skate), a recoil spring through spine and head on every hit, heads
//    that track the opponent, and hand IK that puts the holder's hands on the
//    other body in lock-ups, lifts, swings and pins whatever the two kaiju's
//    proportions are.
// The combat core moves the ROOTS (position, yaw, and the pitch / roll of a
// lying, held or thrown body: Fighter.setPose / lie / lean); the anims marked
// rootDriven are body-frame poses meant to sit on a root tipped that way.
import * as THREE from 'three';
import { EV } from './events.js';
import { buildRig, bakeClip } from './animRig.js';
import { DEFS } from './animDefs.js';

/** name -> { loop, hold, rootDriven, clips, dur, marks }.
 *  loop:  plays until stop() / the next play();
 *  hold:  one-shot that stays on its last frame (poses: downed, ko);
 *  rootDriven: a body-frame pose; the combat core lays the root down / carries it;
 *  clips: mocap clip keys used only if the procedural clip cannot be built;
 *  dur:   seconds at timeScale 1 (loops: one cycle);
 *  marks: named moments in seconds (contact frames, releases), see animDefs.js. */
const FALLBACK = {
  strike_1: ['punch'], strike_2: ['punch'], strike_3: ['punch'], heavy: ['skill1', 'punch'], clothesline: ['skill3', 'punch'],
  splash: ['jump', 'stomp'], stomp: ['stomp'], block: ['idle2'], block_hit: [], hit_high: [], hit_low: [], stagger: [], stunned: ['idle2'],
  grab_reach: ['punch'], lockup: ['idle2'], lift: ['cast2', 'cast1'], carried: ['idle2'], throw: ['skill1', 'punch'], whip_send: ['punch'],
  whip_run: ['run'], suplex: ['cast3', 'stomp'], swing: ['walk'], knockdown: ['death', 'dead'], downed: ['dead', 'death'], getup: [],
  pin_cover: ['stomp'], pinned: ['dead', 'death'], kickout: ['jump'], taunt_a: ['cheer', 'shrug', 'skill2'], taunt_b: ['cast2', 'skill2'],
  taunt_win: ['dance'], finisher_windup: ['cast3', 'skill2'], finisher_strike: ['stomp'], finisher_victim: ['dead', 'death'],
  ko: ['death', 'dead'], entrance: ['walk'],
};
export const ANIMS = Object.freeze(Object.fromEntries(Object.keys(FALLBACK).map((name) => {
  const d = DEFS[name] || {};
  return [name, Object.freeze({ loop: !!d.loop, hold: !!d.hold, rootDriven: !!d.rootDriven, clips: FALLBACK[name], dur: d.dur || 0, marks: Object.freeze({ ...(d.marks || {}) }) })];
})));
export const ANIM_NAMES = Object.freeze(Object.keys(ANIMS));
/** Timing data for the combat core / camera / VFX: ANIM_INFO[name] = { dur, loop, hold, marks }. */
export const ANIM_INFO = ANIMS;

// Baked clips, shared by every instance of a kaiju: key -> { R, clips: { name -> AnimationClip } }
const RIGS = {};
function rigFor(glb) {
  if (!glb || !glb.rest || !glb.key) return null;
  return RIGS[glb.key] || (RIGS[glb.key] = { R: buildRig(glb.key, glb.rest), clips: {} });
}
const ckey = (name) => 'w_' + name;

const LOCO = { idle: 0, walk: 1, back: 1, strafe_l: 1, strafe_r: 1, run: 1 };
const _once = { duration: undefined, commit: undefined, hold: false, restart: true };

/** @returns {{ start, play, stop, current, update, updateIdle, dispose, info, markTime }} */
export function createAnims(ctx, W) {
  // Per-fighter runtime state, rebuilt whenever a fighter's GLB changes (restart, title defense)
  const states = { player: null, rival: null };
  let started = false;

  function makeState(f) {
    const rig = rigFor(f.glb);
    return {
      f, glb: f.glb, rig, R: rig ? rig.R : null,
      anim: '', loop: false, hold: false,      // wrestling anim in force ('' = locomotion)
      gait: '', gaitT: 0, px: f.root.position.x, pz: f.root.position.z, vx: 0, vz: 0, yaw: f.root.rotation.y, yawRate: 0,
    };
  }
  function stateOf(f) {
    let st = states[f.id];
    if (!st || st.glb !== f.glb) {
      st = states[f.id] = makeState(f);
      if (started) f.glb.lockLoco(true);
    }
    return st;
  }
  /** Bake (once per kaiju) and register (once per GLB) the clip for a name; returns its action key or ''. */
  function ensure(st, name) {
    const def = DEFS[name];
    if (!def || !st.rig) return '';
    const key = ckey(name);
    if (!st.glb.actions[key]) {
      const clip = st.rig.clips[name] || (st.rig.clips[name] = bakeClip(st.R, key, def));
      st.glb.addClip(key, clip, !def.loop);
    }
    return key;
  }

  // ---- locomotion from the root's real motion ----
  function locomote(st, dt) {
    const f = st.f, glb = st.glb;
    const sp = Math.hypot(st.vx, st.vz);
    const yaw = f.root.rotation.y, s = Math.sin(yaw), c = Math.cos(yaw);
    const fwd = st.vx * s + st.vz * c, lat = st.vx * c - st.vz * s;
    let want = 'idle';
    if (sp > 2.5) {
      if (Math.abs(fwd) >= Math.abs(lat) * 0.8) want = fwd > 0 ? (sp > DEFS.walk.speed * 1.45 || (st.gait === 'run' && sp > DEFS.walk.speed * 1.2) ? 'run' : 'walk') : 'back';
      else want = lat > 0 ? 'strafe_l' : 'strafe_r';
    }
    st.gaitT += dt;
    if (want !== st.gait && st.gait && st.gaitT < 0.18 && want !== 'idle') want = st.gait;   // do not flicker between gaits
    const key = ensure(st, want);
    if (!key) { glb.loop(want === 'idle' ? 'idle' : want === 'run' ? 'run' : 'walk', 0.3); return; }
    const d = DEFS[want];
    const ts = d.speed ? Math.min(1.7, Math.max(0.55, sp / d.speed)) : 1;
    if (want !== st.gait || glb.currentName !== key) {
      // Carry the stride phase from gait to gait so the feet do not jump
      let phase;
      const cur = glb.currentAction;
      if (LOCO[st.gait] && LOCO[want] && cur && glb.currentName === ckey(st.gait)) phase = (cur.time / cur.getClip().duration) % 1;
      glb.loop(key, want === 'idle' ? 0.35 : st.gait === 'idle' || !st.gait ? 0.22 : 0.3, ts, phase);
      st.gait = want; st.gaitT = 0;
    } else glb.loop(key, 0.3, ts);
  }

  function track(st, dt) {
    const p = st.f.root.position, yaw = st.f.root.rotation.y;
    if (dt > 1e-5) {
      const dx = p.x - st.px, dz = p.z - st.pz, k = 1 - Math.exp(-dt / 0.08);
      if (dx * dx + dz * dz < 900) { st.vx += (dx / dt - st.vx) * k; st.vz += (dz / dt - st.vz) * k; }   // (a teleport is not a velocity)
      let dy = yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yawRate += (dy / dt - st.yawRate) * k;
    }
    st.px = p.x; st.pz = p.z; st.yaw = yaw;
  }

  function tick(dt) {
    for (const id in states) {
      const f = W[id];
      if (!f) continue;
      const st = stateOf(f);
      track(st, dt);
      // A finished one-shot (ours or a mocap power clip) hands back to locomotion
      if (st.anim && !st.loop && !st.hold && !st.glb.oneShotActive) st.anim = '';
      if (!st.anim && !st.glb.oneShotActive) locomote(st, dt);
    }
  }

  return {
    start() {
      started = true;
      // Locomotion clips are ours for the whole match: game.js stops picking idle / walk / run for the player
      ctx.player.control.loco = false;
      for (const id in states) {
        const f = W[id];
        if (!f) continue;
        const st = stateOf(f);
        f.glb.lockLoco(true);
        for (const name in DEFS) ensure(st, name);   // bake now, not on first use mid-fight
      }
    },
    /**
     * Play `name` on a fighter. opts: { fade = 0.15, timeScale = 1, duration (s:
     * stretch the clip), commit (s locomotion cannot interrupt) }.
     * Returns false when the name has nothing to show on this rig.
     */
    play(fighter, name, opts) {
      const def = ANIMS[name];
      if (!def) throw new Error(`[wrestling] unknown anim '${name}' (see ANIMS in anims.js)`);
      const st = stateOf(fighter), glb = fighter.glb;
      const fade = opts && opts.fade !== undefined ? opts.fade : 0.15;
      let ts = opts && opts.timeScale !== undefined ? opts.timeScale : 1;
      const key = ensure(st, name);
      if (key) {
        if (def.loop) {
          if (opts && opts.duration) ts = def.dur / opts.duration;
          glb.loop(key, fade, ts);
        } else {
          _once.duration = opts ? opts.duration : undefined;
          _once.commit = opts ? opts.commit : undefined;
          _once.hold = def.hold;
          glb.playOnce(key, fade, ts, _once);
        }
        st.anim = name; st.loop = def.loop; st.hold = def.hold; st.gait = '';
        fighter.animName = name;
        return true;
      }
      // No procedural clip (a rig the loader could not describe): the mocap stand-ins
      for (let i = 0; i < def.clips.length; i++) {
        const k = def.clips[i];
        if (!glb.actions[k]) continue;
        let ok;
        if (def.loop) ok = glb.loop(k, fade, ts);
        else {
          _once.duration = opts ? opts.duration : undefined;
          _once.commit = opts ? opts.commit : undefined;
          _once.hold = def.hold;
          ok = glb.playOnce(k, fade, ts, _once);
        }
        if (ok) { st.anim = name; st.loop = def.loop; st.hold = def.hold; st.gait = ''; fighter.animName = name; return true; }
      }
      return false;
    },
    /** Back to locomotion on this fighter. */
    stop(fighter, fade = 0.25) {
      fighter.animName = '';
      const st = stateOf(fighter);
      st.anim = ''; st.gait = '';
      if (!started) { fighter.glb.resetAnim(); return; }
      const key = ensure(st, 'idle');
      if (key) { fighter.glb.loop(key, fade); st.gait = 'idle'; st.gaitT = 1; } else fighter.glb.loop('idle', fade);
    },
    /** The wrestling anim last played on the fighter ('' after stop()). */
    current(fighter) { return fighter.animName; },
    /** Timing of an anim: { dur, loop, hold, marks } (seconds at timeScale 1). */
    info(name) { return ANIMS[name]; },
    /** When a mark falls if the anim is played with opts.duration = duration (default: its own length). */
    markTime(name, mark, duration) {
      const d = ANIMS[name];
      if (!d || d.marks[mark] === undefined) return 0;
      return duration && d.dur ? d.marks[mark] * duration / d.dur : d.marks[mark];
    },
    update(dt, dtReal) { tick(dt); },
    updateIdle(dtReal) { tick(dtReal); },
    dispose() {
      started = false;
      for (const id in states) {
        const st = states[id];
        if (st) { st.glb.lockLoco(false); st.glb.resetAnim(); }
        states[id] = null;
      }
      ctx.player.control.loco = true;
    },
  };
}
