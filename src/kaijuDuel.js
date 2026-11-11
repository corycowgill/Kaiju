import * as THREE from 'three';
import { KaijuPursuit } from './kaijuPursuit.js';
import { resolveStructureContact } from './buildingCollision.js';
import { StructureRayQuery } from './structureRayQuery.js';

const MELEE_REACH = 31;
const BEAM_RANGE = 125;

export function duelHealth(config) {
  return config.stats.hp * 4;
}

export function findDuelSpawn(world, player, yaw) {
  const query = new StructureRayQuery();
  const origin = player.clone().setY(13);
  const ray = new THREE.Ray(origin);
  const direction = ray.direction;
  let fallback;
  for (const radius of [74, 56, 98, 38]) {
    for (let i = 0; i < 40; i++) {
      const angle = yaw + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 20;
      direction.set(Math.sin(angle), 0, Math.cos(angle));
      const point = player.clone().setY(0).addScaledVector(direction, radius);
      const b = world.bounds;
      if (b && (point.x < b.minX + 10 || point.x > b.maxX - 10 || point.z < b.minZ + 10 || point.z > b.maxZ - 10)) continue;
      if (world.isWater?.(point.x, point.z)) continue;

      let occupied = false;
      const check = building => {
        if (!building.destroyed && Math.abs(building.x - point.x) < building.w / 2 + 10 &&
            Math.abs(building.z - point.z) < building.d / 2 + 10) occupied = true;
      };
      if (world.buildingGrid) world.buildingGrid.forEachNear(point.x, point.z,
        10 + Math.max(world.buildingGrid.maxHalfX, world.buildingGrid.maxHalfZ), check);
      else for (const building of world.buildings || []) check(building);
      if (occupied) continue;
      fallback ??= point;
      if (!query.nearest(world, ray, radius, true)) return point;
    }
  }
  if (fallback) return fallback;
  const [x, z] = world.landPoint?.() || [player.x, player.z + 38];
  return new THREE.Vector3(x, 0, z);
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

  clearShot(world, point, height) {
    this.ray.origin.copy(this.root.position);
    this.ray.origin.y += height;
    this.ray.direction.subVectors(point, this.ray.origin);
    const distance = this.ray.direction.length();
    this.ray.direction.normalize();
    return !this.cover.nearest(world, this.ray, distance, true);
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

    this.body.copy(player);
    this.body.y += 12;
    if (this.timer === 0 && distance <= BEAM_RANGE && this.clearShot(world, this.body, 12)) {
      if (distance <= MELEE_REACH) {
        const kind = distance < 20 ? 'stomp' : 'punch';
        this.windup(world, kind, player);
        return;
      }
      if (this.beamCooldown === 0 && distance > 40) {
        this.windup(world, 'beam', this.body);
        return;
      }
    }

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

  windup(world, kind, target) {
    this.phase = 'windup';
    this.kind = kind;
    this.target.copy(target);
    this.timer = kind === 'beam' ? 1.15 : kind === 'stomp' ? .92 : .72;
    const motion = this.glb.melee?.[kind];
    const duration = motion ? this.timer * motion.duration / motion.contact : this.timer + .4;
    this.followThrough = duration - this.timer;
    const cast = this.glb.actions.cast1 ? 'cast1' : 'skill1';
    this.glb.playOnce(kind === 'beam' ? cast : motion?.name || kind, .12, 1, { duration });

    if (kind === 'beam') {
      this.beamCooldown = 7;
      world.spawnKaijuCharge?.(this.head, this.timer);
      this.onWarning(this.config.beam.name + ' · MOVE SIDEWAYS');
    } else {
      this.point.copy(target).setY(.2);
      world.spawnBossTelegraph?.(this.point, kind === 'stomp' ? 17 : 12, this.timer);
      this.onWarning(kind === 'stomp' ? 'STOMP · BACK AWAY' : 'PUNCH · DODGE');
    }
    world.onBossWindup?.(kind === 'beam' ? 'volley' : 'slam', this, this.timer);
  }

  strike(world, player) {
    this.phase = 'recover';
    this.timer = this.followThrough + (this.kind === 'beam' ? 1.5 : .95);
    this.onWarning('');
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
        cover.building.damage(cfg.damage * .65, this.point, world);
        world.spawnExplosion?.(this.point.clone(), .8);
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
    if (inWarning && inReach && player.y < (stomp ? 8 : 17) && this.clearShot(world, this.body, 8)) {
      this.hurtPlayer(this.config.stats.melee * (stomp ? 1.35 : 1.1), this.root.position);
    }
  }
}
