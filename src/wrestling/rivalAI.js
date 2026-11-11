// Rival AI: reads both fighters, writes the rival's intent. It never moves
// the rival or deals damage itself - the Fighter acts on the intent, exactly
// as it does for the player's.
// OWNER: AI engineer. INTEGRATOR STARTING POINT: the slice brain only walks
// up to the player, faces it and throws the basic strike on a timer.

const ENGAGE_RANGE = 170;   // further than this the rival waits in the ring
const APPROACH_SPEED = 0.55; // of its walk speed ("slowly approaches")

/** @returns {{ start, update, dispose, enabled }} */
export function createRivalAI(ctx, W) {
  let nextStrike = 0;
  const ai = {
    /** QA: false freezes the rival's decisions (it stands and takes it). */
    enabled: true,
    start() { nextStrike = 1.5; ai.enabled = true; },
    /** Fill W.rival.intent for this frame. */
    update(dt) {
      const me = W.rival, foe = W.player, it = me.intent;
      it.moveX = 0; it.moveZ = 0; it.sprint = false; it.faceYaw = null;
      if (!ai.enabled || !me.alive || me.state !== 'neutral') return;
      if (!foe.alive) return; // nothing left to fight: stand over it
      const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      it.faceYaw = Math.atan2(dx, dz);
      const standOff = me.radius + foe.radius + 3;
      if (dist > standOff && dist < ENGAGE_RANGE) {
        // Stay on dry land: the lake's wading state is the player's alone
        const nx = dx / dist, nz = dz / dist;
        if (!ctx.isWater(me.pos.x + nx * 10, me.pos.z + nz * 10)) { it.moveX = nx * APPROACH_SPEED; it.moveZ = nz * APPROACH_SPEED; }
      }
      nextStrike -= dt;
      if (dist <= standOff + 4 && nextStrike <= 0 && me.facing(foe, 0.6)) {
        it.strike = true;
        nextStrike = 1.6 + Math.random() * 1.2;
      }
    },
    dispose() {},
  };
  return ai;
}
