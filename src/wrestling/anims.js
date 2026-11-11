// Wrestling animation layer: named clips played on either kaiju.
// OWNER: animation engineer. INTEGRATOR STARTING POINT: the name list below
// is the contract (camera / combat / AI call these names); the playback here
// only maps each name onto an EXISTING clip of the shared 24-bone rig so the
// vertical slice has something to show. Replace the fallbacks one by one with
// procedural clips (bone tracks built in code, bound to the fighter's mixer or
// posed directly) - callers do not change.
//
// Rig facts (see notes/gameplay_architecture.md section 2): 24 bones, same
// names on all three kaiju (Hips, Spine02/01/Spine, neck, Head, Left/Right
// Shoulder/Arm/ForeArm/Hand, Left/Right UpLeg/Leg/Foot/ToeBase). No rig has a
// grab, lift, throw, hit-react, block, get-up or pin clip; Tridon has no
// knockdown clip at all.

/** name -> { loop, hold, clips }.
 *  loop:  plays until stop() / the next play();
 *  hold:  one-shot that stays on its last frame (poses: downed, ko);
 *  clips: existing kaijuLoader clip keys tried in order until this name has a
 *         real implementation ([] = nothing to show yet: play() returns false
 *         and the caller's procedural root motion has to carry the moment). */
export const ANIMS = Object.freeze({
  // strikes
  strike_1:        { clips: ['punch'] },                 // light string, hits 1-3
  strike_2:        { clips: ['punch'] },
  strike_3:        { clips: ['punch'] },
  heavy:           { clips: ['skill1', 'punch'] },       // heavy strike wind-up + swing
  clothesline:     { clips: ['skill3', 'punch'] },       // running strike
  splash:          { clips: ['jump', 'stomp'] },         // diving splash / elbow onto a downed foe
  // defence / reactions
  block:           { loop: true, clips: ['idle2'] },     // guard up (held)
  block_hit:       { clips: [] },                        // a strike lands on the guard
  hit_high:        { clips: [] },                        // head / chest hit react
  hit_low:         { clips: [] },                        // body / leg hit react
  stagger:         { clips: [] },                        // reeling back (brief hit-stun)
  stunned:         { loop: true, clips: ['idle2'] },     // dizzy: swaying on the spot
  // grapple
  grab_reach:      { clips: ['punch'] },                 // lunge for the lock-up
  lockup:          { loop: true, clips: ['idle2'] },     // collar-and-elbow tie-up (both fighters)
  lift:            { clips: ['cast2', 'cast1'] },        // hoisting the foe overhead
  carried:         { loop: true, clips: ['idle2'] },     // limp while held / lifted (the victim)
  throw:           { clips: ['skill1', 'punch'] },       // press-slam / swing release (the thrower)
  whip_send:       { clips: ['punch'] },                 // Irish whip release (the thrower)
  whip_run:        { loop: true, clips: ['run'] },       // whipped: running / sliding out of control (the victim)
  suplex:          { clips: ['cast3', 'stomp'] },        // the thrower bridges back
  swing:           { loop: true, clips: ['walk'] },      // giant swing: turning on the spot (the thrower)
  // ground game
  knockdown:       { hold: true, clips: ['death', 'dead'] },  // falling to the mat
  downed:          { hold: true, clips: ['dead', 'death'] },  // lying on the mat
  getup:           { clips: [] },                        // rising to its feet
  pin_cover:       { hold: true, clips: ['stomp'] },     // lying across the foe, hooking the leg
  pinned:          { hold: true, clips: ['dead', 'death'] },  // shoulders down under the cover
  kickout:         { clips: ['jump'] },                  // throwing the pinner off
  // taunts / finisher / results
  taunt_a:         { clips: ['cheer', 'shrug', 'skill2'] },
  taunt_b:         { clips: ['cast2', 'skill2'] },
  taunt_win:       { loop: true, clips: ['dance'] },     // victory celebration (loops)
  finisher_windup: { clips: ['cast3', 'skill2'] },       // the attacker's signature pose
  finisher_strike: { clips: ['stomp'] },                 // the attacker's impact
  finisher_victim: { hold: true, clips: ['dead', 'death'] },
  ko:              { hold: true, clips: ['death', 'dead'] },  // out cold
  entrance:        { loop: true, clips: ['walk'] },      // the walk to the ring
});
export const ANIM_NAMES = Object.freeze(Object.keys(ANIMS));

/** @returns {{ start, play, stop, current, update, updateIdle, dispose }} */
export function createAnims(ctx, W) {
  return {
    start() {},
    /**
     * Play `name` on a fighter. opts: { fade = 0.15, timeScale = 1, duration (s:
     * stretch the clip), commit (s locomotion cannot interrupt) }.
     * Returns false when the name has nothing to show on this rig yet.
     */
    play(fighter, name, opts) {
      const def = ANIMS[name];
      if (!def) throw new Error(`[wrestling] unknown anim '${name}' (see ANIMS in anims.js)`);
      const glb = fighter.glb;
      const fade = opts && opts.fade !== undefined ? opts.fade : 0.15;
      const ts = opts && opts.timeScale !== undefined ? opts.timeScale : 1;
      for (let i = 0; i < def.clips.length; i++) {
        const key = def.clips[i];
        if (!glb.actions[key]) continue;
        let ok;
        if (def.loop) {
          // The player's per-frame idle/walk/run pick would replace a looping clip at once
          if (fighter.isPlayer) ctx.player.control.loco = false;
          ok = glb.play(key, fade, ts);
        } else {
          _once.duration = opts ? opts.duration : undefined;
          _once.commit = opts ? opts.commit : undefined;
          _once.hold = !!def.hold;
          ok = glb.playOnce(key, fade, ts, _once);
        }
        if (ok) { fighter.animName = name; return true; }
      }
      return false;
    },
    /** Back to locomotion (idle) on this fighter. */
    stop(fighter, fade = 0.25) {
      fighter.animName = '';
      if (fighter.isPlayer) ctx.player.control.loco = true;
      // A held pose locks the loader's one-shot slot; resetAnim clears it
      if (fighter.glb.oneShotActive) fighter.glb.resetAnim();
      fighter.glb.play('idle', fade);
    },
    /** The wrestling anim last played on the fighter ('' after stop()). */
    current(fighter) { return fighter.animName; },
    update(dt, dtReal) {},
    updateIdle(dtReal) {},
    dispose() {},
  };
}
const _once = { duration: undefined, commit: undefined, hold: false };
