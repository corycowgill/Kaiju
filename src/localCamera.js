import * as THREE from 'three';
const point = new THREE.Vector3(), centre = new THREE.Vector3();
/** Fixed screen basis: up = +Z, screen-right = -X for both seats. */
export function frameLocalPlayers(camera, player, rival) {
  centre.copy(player.pos).add(rival.pos).multiplyScalar(.5); centre.y = Math.max(player.pos.y, rival.pos.y) + 14;
  let distance = Math.max(65, player.pos.distanceTo(rival.pos) * .65);
  camera.fov = 60; camera.updateProjectionMatrix();
  for (let pass = 0; pass < 5; pass++) {
    camera.position.set(centre.x, centre.y + distance * .8, centre.z - distance); camera.lookAt(centre); camera.updateMatrixWorld(true);
    let scale = 1;
    for (const f of [player, rival]) for (const x of [-f.radius, f.radius]) for (const y of [0, f.height]) {
      point.set(f.pos.x + x, f.pos.y + y, f.pos.z).project(camera);
      scale = Math.max(scale, Math.abs(point.x) / .82, Math.abs(point.y) / .68);
    }
    if (scale <= 1.001) break; distance *= scale * 1.03;
  }
  return true;
}
export function constrainLocalPosition(position, opponent, max = 260) {
  const dx = position.x - opponent.x, dz = position.z - opponent.z, distance = Math.hypot(dx, dz);
  if (distance > max) { position.x = opponent.x + dx / distance * max; position.z = opponent.z + dz / distance * max; }
}
