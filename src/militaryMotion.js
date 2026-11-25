// Renderer-independent steering. Work per actor is bounded; no paths, timers or
// per-frame arrays are allocated. City collision uses the existing building grid.
let serial = 0;
export const turnToward = (angle, target, step) => angle + Math.max(-step, Math.min(step, Math.atan2(Math.sin(target - angle), Math.cos(target - angle))));
export function initMilitaryMotion(actor) {
  actor._unitId = serial++; actor._side = actor._unitId % 2 ? -1 : 1;
  actor._phase = actor._unitId * 2.399963; actor._vx = actor._vz = 0;
  actor._stagger = actor._recoil = actor._hitTilt = actor._tacticalTime = 0;
  actor._windup = actor._attackHold = 0;
  actor._targetX = actor._targetZ = null; actor._targetVX = actor._targetVZ = 0;
}
export function observeTarget(actor, target, dt) {
  if (actor._targetX !== null && dt > 0) {
    const a = 1 - Math.exp(-dt * 5);
    actor._targetVX += (Math.max(-35, Math.min(35, (target.x - actor._targetX) / dt)) - actor._targetVX) * a;
    actor._targetVZ += (Math.max(-35, Math.min(35, (target.z - actor._targetZ) / dt)) - actor._targetVZ) * a;
  }
  actor._targetX = target.x; actor._targetZ = target.z;
  actor._tacticalTime += dt; actor._stagger = Math.max(0, actor._stagger - dt);
  actor._recoil = Math.max(0, actor._recoil - dt * 4);
  actor._hitTilt *= Math.exp(-dt * 13);
}
let queryX = 0, queryZ = 0, queryRadius = 0, penetration = 0;
function inspectBuilding(b) {
  if (b.destroyed || b.isBridge || b.h < 1) return;
  const dx = queryX - b.x, dz = queryZ - b.z;
  const lx = b.obb ? dx * b.obb.c - dz * b.obb.s : dx;
  const lz = b.obb ? dx * b.obb.s + dz * b.obb.c : dz;
  const px = (b.obb?.hw ?? b.w / 2) + queryRadius - Math.abs(lx);
  const pz = (b.obb?.hd ?? b.d / 2) + queryRadius - Math.abs(lz);
  if (px > 0 && pz > 0) penetration = Math.max(penetration, Math.min(px, pz));
}
// Index footprint coverage once per city. Centre-indexed city grids can have
// very wide bridges; scanning their maximum extent for every soldier is costly.
function navigationCells(world, radius) {
  const buildings = world.buildings;
  if (!Array.isArray(buildings)) return null;
  let cache = world._militaryNavigation;
  if (cache?.source === buildings && cache.count === buildings.length && cache.padding >= radius && cache.grid === world.buildingGrid) return cache.cells;
  const padding = Math.max(6, radius), cells = new Map();
  for (const b of buildings) {
    if (b.destroyed || b.isBridge || b.h < 1) continue;
    const hw = b.obb ? Math.abs(b.obb.hw * b.obb.c) + Math.abs(b.obb.hd * b.obb.s) : b.w / 2;
    const hd = b.obb ? Math.abs(b.obb.hw * b.obb.s) + Math.abs(b.obb.hd * b.obb.c) : b.d / 2;
    const pad = padding * Math.SQRT2;
    for (let x = Math.floor((b.x - hw - pad) / 32); x <= Math.floor((b.x + hw + pad) / 32); x++) {
      for (let z = Math.floor((b.z - hd - pad) / 32); z <= Math.floor((b.z + hd + pad) / 32); z++) {
        const key = x * 8192 + z;
        let bucket = cells.get(key); if (!bucket) { bucket = []; cells.set(key, bucket); } bucket.push(b);
      }
    }
  }
  world._militaryNavigation = { source: buildings, count: buildings.length, padding, grid: world.buildingGrid, cells };
  return cells;
}
function obstruction(world, x, z, radius) {
  const b = world.bounds;
  if (b && (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius)) return Infinity;
  if (world.isWater?.(x, z)) return Infinity;
  queryX = x; queryZ = z; queryRadius = radius; penetration = 0;
  const cells = navigationCells(world, radius);
  if (cells) {
    const bucket = cells.get(Math.floor(x / 32) * 8192 + Math.floor(z / 32));
    if (bucket) for (const building of bucket) inspectBuilding(building);
    return penetration;
  }
  const grid = world.buildingGrid;
  grid?.forEachNear?.(x, z, Math.hypot((grid.maxHalfX || 0) + radius, (grid.maxHalfZ || 0) + radius), inspectBuilding);
  return penetration;
}
export function moveMilitary(actor, dt, world, dx, dz, speed, radius = 2, airborne = false) {
  if (!(dt > 0)) return 0;
  const pos = actor.root.position, oldX = pos.x, oldZ = pos.z;
  // Local separation, capped at 16 samples even in very large waves.
  const enemies = world.enemies || [], count = Math.min(16, enemies.length);
  if ((dx || dz) && !airborne) for (let i = 0; i < count; i++) {
    const other = enemies[(actor._unitId + i) % enemies.length];
    if (other === actor || other.dead || other.type === 'heli' || other.type === 'jet') continue;
    const x = pos.x - other.root.position.x, z = pos.z - other.root.position.z, d2 = x * x + z * z;
    if (d2 > .01 && d2 < radius * radius * 9) { dx += x / d2 * radius; dz += z / d2 * radius; }
  }
  const length = Math.hypot(dx, dz);
  const a = 1 - Math.exp(-dt * (airborne ? 3 : 7)), stopped = actor._stagger > 0;
  actor._vx += ((length && !stopped ? dx / length * speed : 0) - actor._vx) * a;
  actor._vz += ((length && !stopped ? dz / length * speed : 0) - actor._vz) * a;
  let vx = actor._vx, vz = actor._vz;
  if (!airborne) {
    const before = obstruction(world, pos.x, pos.z, radius);
    let found = false;
    for (let i = 0; i < 5; i++) {
      const angle = i === 0 ? 0 : (i < 3 ? .95 : 1.65) * actor._side * (i % 2 ? 1 : -1);
      const c = Math.cos(angle), s = Math.sin(angle), x = vx * c - vz * s, z = vx * s + vz * c;
      // Look ahead enough to turn before contact, but permit a unit spawned
      // inside a structure to move toward its nearest free edge.
      const look = Math.max(dt, .25), depth = obstruction(world, pos.x + x * look, pos.z + z * look, radius);
      const actual = obstruction(world, pos.x + x * dt, pos.z + z * dt, radius);
      if ((depth === 0 || Number.isFinite(before) && depth < before) && (actual === 0 || Number.isFinite(before) && actual < before)) { vx = x; vz = z; found = true; break; }
    }
    if (!found) vx = vz = 0;
  }
  actor._vx = vx; actor._vz = vz;
  pos.x += vx * dt; pos.z += vz * dt;
  actor._moveSpeed = Math.hypot(pos.x - oldX, pos.z - oldZ) / dt;
  return actor._moveSpeed;
}
export function damageMilitary(actor, amount, world) {
  if (actor.dead || !Number.isFinite(amount) || amount <= 0) return;
  const dealt = Math.min(actor.hp, amount); actor.hp -= amount;
  actor._hitTilt = Math.min(.18, .05 + dealt / actor.maxHp * .2) * actor._side;
  if (actor.hp > 0 && actor.type !== 'boss') {
    actor._stagger = Math.min(.32, .1 + dealt / actor.maxHp * .4);
    actor._windup = actor._attackHold = 0; actor.cooldown = Math.max(actor.cooldown, .6);
  }
  world.onMilitaryHit?.(actor, dealt, actor.hp <= 0);
  if (actor.hp <= 0) actor.die(world);
}
