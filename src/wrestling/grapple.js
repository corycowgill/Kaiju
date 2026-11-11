// Grapple system: grabs, the lock-up and its four moves (Irish whip, suplex,
// press slam, giant swing), throws through buildings, rope rebounds, pick-ups.
// It drives BOTH roots while a hold or throw is in progress (the player's
// through ctx.player.control.external, set by Fighter.setState).
// OWNER: combat core. INTEGRATOR STARTING POINT: nothing is implemented; the
// factory exists so the composer's order and the events are settled.
//
// Building blocks waiting in ctx (see notes/wrestling_api.md):
//   ctx.sweepBuildings(x0, z0, x1, z1, radius, cb)   bodies travelling fast
//   ctx.collapseBuilding(b, src) / ctx.damageBuilding(b, amount, point, src)
//   ctx.damageInRadius(center, radius, amount, { kind, src })   slam shockwaves
//   ctx.landmarkName(b)   'Willis Tower' for the callout, '' for ordinary blocks
//   ctx.isWater(x, z), ctx.fx.waterImpact(x, z, size)   lake slams
//   W.arena.info   ring centre / half-size / rope heights
// Events to emit: grab:attempt, grab:whiffed, grab:start, grab:reversed,
// grab:escaped, lift:start, swing:spin, throw:launch, throw:land,
// building:impact, rope:rebound, rope:snap, ring:out, ring:in, water:impact,
// crowd:crushed, pickup.

/** @returns {{ start, update, dispose, active }} */
export function createGrapple(ctx, W) {
  return {
    /** True while a hold or a throw owns the two bodies. */
    active: false,
    start() { this.active = false; },
    update(dt) {},
    dispose() { this.active = false; },
  };
}
