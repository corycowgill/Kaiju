import * as THREE from 'three';
import { KaijuPursuit } from './kaijuPursuit.js';
import { resolveStructureContact } from './buildingCollision.js';
import { StructureRayQuery } from './structureRayQuery.js';

const MELEE_REACH = 31;
const BEAM_RANGE = 125;

export function duelHealth(config) {
  return config.stats.hp * 4;
}

// Chicago's north and south Grant Park lawns, and Tokyo's central plaza
// and the park across the river. Search locally for clearance from festival props,
// landmark footprints and quality-dependent buildings.
const SPAWN_AREAS = {
  chicago: [
    {x: -31, z: -169, minX: -50, maxX: -12, minZ: -178, maxZ: -146},
    {x: -38, z: 173, minX: -49, maxX: -29, minZ: 151, maxZ: 181},
  ],
  tokyo: [
    {x: 0, z: 0, minX: -25, maxX: 25, minZ: -25, maxZ: 25},
    {x: 200, z: 200, minX: 180, maxX: 220, minZ: 180, maxZ: 220},
  ],
};

function spawnIsClear(world, x, z) {
  const clearance = 9;
  const bounds = world.bounds;
  if (bounds && (x < bounds.minX + clearance || x > bounds.maxX - clearance ||
      z < bounds.minZ + clearance || z > bounds.maxZ - clearance)) return false;
  if (world.isWater?.(x, z)) return false;

  let occupied = false;
  const check = building => {
    if (occupied || building.destroyed) return;
    const dx = Math.max(0, Math.abs(building.x - x) - building.w / 2);
    const dz = Math.max(0, Math.abs(building.z - z) - building.d / 2);
    occupied = dx * dx + dz * dz < clearance * clearance;
  };
  if (world.buildingGrid) {
    const grid = world.buildingGrid;
    grid.forEachNear(x, z, clearance + Math.max(grid.maxHalfX, grid.maxHalfZ), check);
  } else {
    for (const building of world.buildings || []) check(building);
  }
  return !occupied;
}

function findOpenSpawn(world, area) {
  if (spawnIsClear(world, area.x, area.z)) return new THREE.Vector3(area.x, 0, area.z);
  let best, bestDistance = Infinity;
  for (let x = area.minX; x <= area.maxX; x += 2) {
    for (let z = area.minZ; z <= area.maxZ; z += 2) {
      const distance = (x - area.x) ** 2 + (z - area.z) ** 2;
      if (distance >= bestDistance || !spawnIsClear(world, x, z)) continue;
      best = new THREE.Vector3(x, 0, z);
      bestDistance = distance;
    }
  }
  return best;
}

export function findDuelSpawns(world) {
  const [first, second] = SPAWN_AREAS[world.level] || SPAWN_AREAS.tokyo;
  const player = findOpenSpawn(world, first);
  const rival = findOpenSpawn(world, second);
  if (!player || !rival) throw new Error('No clear duel spawn in the selected arena');
  return {player, rival};
}

export class KaijuDuelRival {
  constructor(glb, config, spawn, { hurtPlayer, onWarning, onDefeat }) {
    this.glb = glb;
    this.root = glb.root;
    this.root.position.copy(spawn);
    this.head = glb.head;
    this.config = config;
    this.type = 'rival';
    this._bodyR = 8.1 * config.stats.scale;
    this.armored = true;
    this.maxHp = this.hp = duelHealth(config);
    this.dead = false;
    this.phase = 'approach';
    this.timer = 1.8;
    this.beamCooldown = 0;
    this.hurtPlayer = hurtPlayer;
    this.onWarning = onWarning;
    this.onDefeat = onDefeat;
    this.pursuit = new KaijuPursuit({ allowWater: true });
    this.cover = new StructureRayQuery();
    this.ray = new THREE.Ray();
    this.target = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.body = new THREE.Vector3();
    this.contact = new THREE.Vector3();
  }

  damage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp > 0) return;
    this.dead = true;
    this.onWarning('');
    if (!this.glb.playOnce('death', .2, 1, { hold: true })) {
      this.glb.playOnce('stomp', .2, 1, { hold: true });
      this.topple = 0;
    }
    this.onDefeat();
  }

  updateResult(dt) {
    this.glb.mixer.update(dt);
    if (this.topple !== undefined) {
      this.topple = Math.min(1, this.topple + dt);
      this.root.rotation.z = this.topple ** 2 * 1.48;
    }
  }

  shotBlocker(world, point, height, range = Infinity, padding = 0) {
    this.ray.origin.copy(this.root.position);
    this.ray.origin.y += height;
    this.ray.direction.subVectors(point, this.ray.origin);
    const distance = this.ray.direction.length();
    this.ray.direction.normalize();
    return this.cover.nearest(world, this.ray, Math.min(distance, range), padding === 0, 0, padding);
  }

  update(dt, world, player) {
    if (this.dead) return;
    const position = this.root.position;
    const distance = Math.hypot(player.x - position.x, player.z - position.z);
    this.timer = Math.max(0, this.timer - dt);
    this.beamCooldown = Math.max(0, this.beamCooldown - dt);
    const facing = this.phase === 'windup' ? this.target : player;
    const yaw = Math.atan2(facing.x - position.x, facing.z - position.z);
    const turn = yaw - this.root.rotation.y;
    this.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 5);
    this.glb.mixer.update(dt);

    if (this.phase === 'windup') {
      if (this.timer === 0) this.strike(world, player);
      return;
    }
    if (this.phase === 'recover') {
      if (this.timer === 0) {
        this.phase = 'approach';
        this.glb.play('idle');
      }
      return;
    }

    if (this.timer === 0 && (this.tryWrestle?.() || this.chooseAttack(world, player, distance))) return;

    const beforeX = position.x, beforeZ = position.z;
    const speed = this.config.stats.speed * (world.isWater?.(position.x, position.z) ? 10 : 17);
    const moving = this.pursuit.move(world, position, player, dt, 23, speed);
    if (distance > 23) world.buildingGrid?.forEachNear(position.x, position.z, 40, building => {
      resolveStructureContact(position, this._bodyR, building, dt, world, this.contact);
    });
    if (moving) {
      const heading = Math.atan2(position.x - beforeX, position.z - beforeZ);
      const delta = heading - this.root.rotation.y;
      this.root.rotation.y += Math.atan2(Math.sin(delta), Math.cos(delta)) * Math.min(1, dt * 5);
    }
    this.glb.play(moving ? 'walk' : 'idle');
  }

  chooseAttack(world, player, distance) {
    this.body.copy(player);
    this.body.y += 12;
    const shot = this.shotBlocker(world, this.body, 12, BEAM_RANGE);
    const shotBuilding = shot?.building;
    const shotDistance = shot?.distance ?? Infinity;
    if (!shotBuilding && distance <= MELEE_REACH && !(distance > 23 && this.wantsGrab?.())) {
      this.windup(world, distance < 20 ? 'stomp' : 'punch', player);
      return true;
    }

    // Low obstacles and corners can stop movement even when the rival
    // can see over them. Search the short, body-width approach corridor.
    this.body.copy(player).setY(3);
    const pathBuilding = this.shotBlocker(world, this.body, 3, MELEE_REACH, this._bodyR)?.building;
    const nearby = pathBuilding || (shotDistance <= MELEE_REACH ? shotBuilding : null);
    if (nearby) {
      this.aimAtBuilding(nearby);
      this.windup(world, 'punch', this.point, nearby);
      return true;
    }
    if (this.beamCooldown === 0 && shotBuilding) {
      this.aimAtBuilding(shotBuilding);
      this.windup(world, 'beam', this.point, shotBuilding);
      return true;
    }
    if (this.beamCooldown === 0 && distance > 40 && distance <= BEAM_RANGE) {
      this.body.copy(player);
      this.body.y += 12;
      this.windup(world, 'beam', this.body);
      return true;
    }
    return false;
  }

  aimAtBuilding(building) {
    this.point.set(building.x, Math.min(12, building.h * .6), building.z);
  }

  damageBlocker(building, world, baseDamage, fraction) {
    building.damage(Math.max(baseDamage, (building.maxHp || 0) * fraction), this.point, world);
  }

  windup(world, kind, target, building = null) {
    this.phase = 'windup';
    this.kind = kind;
    this.attackBuilding = building;
    this.target.copy(target);
    this.timer = kind === 'beam' ? 1.15 : kind === 'stomp' ? .92 : .72;
    const motion = this.glb.melee?.[kind];
    const duration = motion ? this.timer * motion.duration / motion.contact : this.timer + .4;
    this.followThrough = duration - this.timer;
    const cast = this.glb.actions.cast1 ? 'cast1' : 'skill1';
    this.glb.playOnce(kind === 'beam' ? cast : motion?.name || kind, .12, 1, { duration });

    if (kind === 'beam') {
      this.beamCooldown = 7;
      this.telegraph = world.spawnKaijuCharge?.(this.head, this.timer);
      this.onWarning(building ? 'RIVAL TARGETING COVER' : this.config.beam.name + ' · MOVE SIDEWAYS');
    } else {
      this.point.copy(target).setY(.2);
      this.telegraph = world.spawnBossTelegraph?.(this.point, kind === 'stomp' ? 17 : 12, this.timer);
      this.onWarning(building ? 'RIVAL BREAKING THROUGH' : kind === 'stomp' ? 'STOMP · BACK AWAY' : 'PUNCH · DODGE');
    }
    world.onBossWindup?.(kind === 'beam' ? 'volley' : 'slam', this, this.timer);
  }

  strike(world, player) {
    this.phase = 'recover';
    this.timer = this.followThrough + (this.kind === 'beam' ? 1.5 : .95);
    this.onWarning('');
    const building = this.attackBuilding;
    this.attackBuilding = null;
    if (building?.destroyed) return;
    if (this.kind === 'beam') {
      this.head.getWorldPosition(this.ray.origin);
      this.ray.direction.subVectors(this.target, this.ray.origin).normalize();
      const cover = this.cover.nearest(world, this.ray, BEAM_RANGE, true, .5);
      const length = cover?.distance ?? BEAM_RANGE;
      const cfg = this.config.beam;
      world.spawnBeam(this.ray.origin, this.ray.direction, length, cfg.color, cfg.glow);
      this.body.copy(player);
      this.body.y += 12;
      const along = this.point.subVectors(this.body, this.ray.origin).dot(this.ray.direction);
      if (along > 0 && along < length && this.ray.distanceSqToPoint(this.body) < 81) {
        this.hurtPlayer(cfg.damage * .45, this.root.position);
      }
      if (cover) {
        this.ray.at(length, this.point);
        this.damageBlocker(cover.building, world, cfg.damage * 1.1, .45);
        world.spawnExplosion?.(this.point.clone(), .8);
      }
      return;
    }

    if (building) {
      const position = this.root.position;
      // Use the near face, even for a long building whose centre is far away.
      this.point.set(
        THREE.MathUtils.clamp(position.x, building.x - building.w / 2, building.x + building.w / 2),
        Math.min(8, building.h * .6),
        THREE.MathUtils.clamp(position.z, building.z - building.d / 2, building.z + building.d / 2)
      );
      if (Math.hypot(position.x - this.point.x, position.z - this.point.z) <= MELEE_REACH + this._bodyR) {
        world.spawnDustBurst?.(this.point, 10, 10);
        this.damageBlocker(building, world, this.config.stats.melee * 3, .32);
      }
      return;
    }

    const stomp = this.kind === 'stomp';
    const radius = stomp ? 17 : 12;
    this.point.copy(this.target).setY(.3);
    if (stomp) world.spawnShockwave?.(this.point, 0xffb777, radius);
    world.spawnDustBurst?.(this.point, radius, stomp ? 12 : 8);
    const inWarning = Math.hypot(player.x - this.target.x, player.z - this.target.z) < radius;
    const position = this.root.position;
    const inReach = Math.hypot(player.x - position.x, player.z - position.z) < MELEE_REACH + 5;
    this.body.copy(player);
    this.body.y += 8;
    if (inWarning && inReach && player.y < (stomp ? 8 : 17) && !this.shotBlocker(world, this.body, 8)) {
      this.hurtPlayer(this.config.stats.melee * (stomp ? 1.35 : 1.1), this.root.position);
    }
  }
}
