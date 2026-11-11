// Wrestling VFX: impact bursts scaled to move weight, slam dust rings and
// ground cracks, whip trails, rope snaps, finisher signatures, win confetti.
// OWNER: VFX engineer. INTEGRATOR STARTING POINT: the slice answers three
// events with existing effects so hits read at all.
//
// Rules: effects are driven by events only (never called by the combat core).
// Pool anything that repeats; no real lights (acquirePooledLight in ../vfx.js
// is the only source); every new ShaderMaterial must be reachable from a
// builder registered with registerBuilder() in ../vfx.js AT IMPORT TIME, so
// game.js's prewarm stages and links it before first use (atomicBlast.js is
// the model). Scale particle counts by ctx.quality.particleMul.
// Spawners: ctx.world.spawnExplosion / spawnSparks / spawnShockwave /
// spawnHitPulse / spawnSmoke / spawnSmokeColumn / spawnBossTelegraph (budgeted
// per frame, positions are copied by the caller: pass a fresh / cloned
// Vector3), ctx.fx.dustBurst, ctx.fx.waterImpact, ctx.fx.add(effect) for your
// own { mesh, dead, tick(dt) } objects, emitParticles() from ../vfx.js.
import * as THREE from 'three';
import { EV } from './events.js';

/** @returns {{ start, update, updateIdle, dispose }} */
export function createVfx(ctx, W) {
  const offs = [];
  const world = ctx.world;
  const hit = (e) => {
    world.spawnHitPulse(new THREE.Vector3(e.x, e.y, e.z), 0xffffff);
    world.spawnSparks(new THREE.Vector3(e.x, e.y, e.z), 6 + Math.round(e.impact * 10));
  };
  return {
    start() {
      offs.push(W.bus.on(EV.STRIKE_LANDED, hit));
      offs.push(W.bus.on(EV.POWER_HIT, hit));
      offs.push(W.bus.on(EV.KO, (e) => {
        const ground = new THREE.Vector3(e.x, 0.3, e.z);
        world.spawnShockwave(ground, 0xffcc88, 40);
        if (!ctx.fx.waterImpact(e.x, e.z, 3)) ctx.fx.dustBurst(ground.clone(), 26, 12);
        ctx.shake(1.2, 0.6);
      }));
    },
    update(dt, dtReal) {},
    updateIdle(dtReal) {},
    dispose() { for (const off of offs) off(); offs.length = 0; },
  };
}
