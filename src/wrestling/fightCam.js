// Fight camera: lock-on framing of both kaiju, impact zooms and FOV kicks,
// entrance / pin / finisher / KO shots.
// OWNER: camera engineer. INTEGRATOR STARTING POINT: lock-on only steers the
// player's facing at the rival (the classic chase cam, which sits behind
// state.yaw, then frames both), and the result shot is a slow orbit installed
// through the camera override - enough to prove both hooks.
//
// Hooks (ctx, see notes/wrestling_api.md):
//   ctx.setCameraOverride(fn)  fn(camera, dtReal) -> true when it placed the
//       camera this frame (false = let the chase cam run). Called every
//       rendered frame, also while paused / game over. FOV: set camera.fov +
//       updateProjectionMatrix(); game.js restores 70 when no override holds.
//   ctx.camClearDist(origin, dir, maxDist, minDist)  boom length that stays out of buildings
//   ctx.shakeOffset(out)  this frame's world.shake offset (an override applies it itself)
//   ctx.player.control.faceYaw / faceRate  lock the player's facing (and with it the chase cam and aim)
//   ctx.player.control.moveYaw  basis for the movement input (set it to your camera's yaw)
//   ctx.player.control.look     false = mouse / stick / touch look ignored
// This module owns faceYaw, moveYaw and look; nobody else writes them.
import * as THREE from 'three';
import { EV } from './events.js';

const LOCK_RANGE = 190;  // further apart than this the lock lets go (sightseeing)
const _mid = new THREE.Vector3(), _off = new THREE.Vector3(), _shake = new THREE.Vector3();

/** @returns {{ start, update, updateIdle, dispose, locked, setLock }} */
export function createFightCam(ctx, W) {
  let lockWanted = true, orbit = false, orbitA = 0, orbitR = 60;
  const offs = [];
  const cam = {
    /** Lock-on currently steering the player. */
    locked: false,
    setLock(on) {
      if (on === lockWanted) return;
      lockWanted = on;
      const e = W.bus.ev(EV.LOCKON);
      e.on = on;
      W.bus.emit(EV.LOCKON);
      ctx.ui.toastMini(on ? 'LOCK-ON' : 'FREE CAMERA', '');
    },
    start() {
      lockWanted = true; orbit = false; cam.locked = false;
      offs.push(W.bus.on(EV.CAM_CUE, (e) => {
        if (e.shot !== 'win' && e.shot !== 'lose') return;
        // Result shot: circle the two bodies
        const a = W.player.pos, b = W.rival.pos;
        orbitR = Math.max(55, Math.hypot(a.x - b.x, a.z - b.z) * 0.5 + 45);
        orbitA = Math.atan2(ctx.camera.position.x - (a.x + b.x) / 2, ctx.camera.position.z - (a.z + b.z) / 2);
        orbit = true;
        ctx.setCameraOverride(orbitCam);
      }));
    },
    update(dt, dtReal) {
      if (W.input.ui.lockToggle) cam.setLock(!lockWanted);
      const c = ctx.player.control, p = W.player, r = W.rival;
      cam.locked = lockWanted && !orbit && r.alive && p.alive && p.distTo(r) < LOCK_RANGE;
      c.faceYaw = cam.locked ? p.yawTo(r) : null;
    },
    updateIdle(dtReal) {},
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      orbit = false; cam.locked = false;
      ctx.setCameraOverride(null);
      const c = ctx.player.control;
      c.faceYaw = null; c.moveYaw = null; c.look = true;
    },
  };
  function orbitCam(camera, dtReal) {
    if (!orbit) return false;
    const a = W.player.pos, b = W.rival.pos;
    _mid.set((a.x + b.x) / 2, 16, (a.z + b.z) / 2);
    orbitA += dtReal * 0.22;
    _off.set(Math.sin(orbitA), 0.42, Math.cos(orbitA)).normalize();
    const dist = ctx.camClearDist(_mid, _off, orbitR, 25);
    _off.multiplyScalar(dist).add(_mid).add(ctx.shakeOffset(_shake));
    camera.position.lerp(_off, 1 - Math.exp(-dtReal * 3));
    camera.lookAt(_mid);
    return true;
  }
  return cam;
}
