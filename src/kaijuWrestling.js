import * as THREE from 'three';
import { StructureRayQuery } from './structureRayQuery.js';

const GRAB_RANGE = 24;
const HOLD_GAP = 13;
const THROW_DISTANCE = 36;
const smooth = t => t * t * (3 - 2 * t);
const planar = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Pose the existing rigs in world space so each fighter can reach different
// sized opponents. Restore the animation pose before the next mixer update.
class WrestlingPose {
  constructor(root) {
    this.root = root;
    this.saved = new Map();
    this.chains = {};
    this.chest = root.getObjectByName('Spine02') || root.getObjectByName('Spine1');
    for (const side of ['Left', 'Right']) {
      this.chains[side + 'Arm'] = ['Arm', 'ForeArm', 'Hand'].map(name => root.getObjectByName(side + name));
      this.chains[side + 'Leg'] = ['UpLeg', 'Leg', 'Foot'].map(name => root.getObjectByName(side + name));
    }
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.axis = new THREE.Vector3(); this.pole = new THREE.Vector3(); this.elbow = new THREE.Vector3();
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    this.rotation = new THREE.Quaternion(); this.parent = new THREE.Quaternion();
  }

  torso(out) {
    if (this.chest) return this.chest.getWorldPosition(out);
    out.copy(this.root.position);
    out.y += (this.root.userData.wrestleHeight || 23) * .52;
    return out;
  }

  restore() {
    for (const [bone, rotation] of this.saved) bone.quaternion.copy(rotation);
    this.saved.clear();
  }

  aim(bone, from, to) {
    if (!this.saved.has(bone)) this.saved.set(bone, bone.quaternion.clone());
    this.rotation.setFromUnitVectors(from.normalize(), to.normalize());
    bone.parent.getWorldQuaternion(this.parent);
    this.rotation.premultiply(this.parent.clone().invert()).multiply(this.parent);
    bone.quaternion.premultiply(this.rotation);
    bone.updateWorldMatrix(false, true);
  }

  reach(name, target) {
    const [upper, lower, end] = this.chains[name];
    if (!upper || !lower || !end) return;
    upper.getWorldPosition(this.a);
    lower.getWorldPosition(this.b);
    end.getWorldPosition(this.c);
    const first = this.a.distanceTo(this.b), second = this.b.distanceTo(this.c);
    if (first < .01 || second < .01) return;
    this.axis.subVectors(target, this.a);
    const distance = THREE.MathUtils.clamp(this.axis.length(), Math.abs(first - second) + .01, first + second - .01);
    if (!this.axis.lengthSq()) return;
    this.axis.normalize();
    this.pole.subVectors(this.b, this.a);
    this.pole.addScaledVector(this.axis, -this.pole.dot(this.axis));
    if (this.pole.lengthSq() < .001) this.pole.set(0, -1, 0).addScaledVector(this.axis, this.axis.y);
    this.pole.normalize();
    const along = (first * first + distance * distance - second * second) / (2 * distance);
    this.elbow.copy(this.a).addScaledVector(this.axis, along)
      .addScaledVector(this.pole, Math.sqrt(Math.max(0, first * first - along * along)));
    this.aim(upper, this.from.subVectors(this.b, this.a), this.to.subVectors(this.elbow, this.a));
    lower.getWorldPosition(this.b);
    end.getWorldPosition(this.c);
    this.aim(lower, this.from.subVectors(this.c, this.b), this.to.copy(this.a).addScaledVector(this.axis, distance).sub(this.b));
  }
}

export class KaijuWrestling {
  constructor(world, player, rival, { hurtPlayer, feedback, prompt }) {
    this.world = world;
    this.player = { ...player, pose: new WrestlingPose(player.root), stagger: 0 };
    this.rival = { root: rival.root, glb: rival.glb, config: rival.config, pose: new WrestlingPose(rival.root), stagger: 0 };
    this.enemy = rival;
    this.hurtPlayer = hurtPlayer;
    this.feedback = feedback;
    this.prompt = prompt;
    this.query = new StructureRayQuery();
    this.ray = new THREE.Ray();
    this.target = new THREE.Vector3();
    this.hit = new THREE.Vector3();
    this.effectPoint = new THREE.Vector3();
    this.aiCooldown = 4;
    this.cooldown = 0;
  }

  locked(actor) {
    const action = this.action;
    return !!action && (action.attacker === actor || (action.defender === actor && action.paired));
  }

  markPlayerStagger() { this.player.stagger = 2.55; }

  rivalWantsGrab() {
    return !this.action && this.aiCooldown === 0 && this.player.stagger > 0;
  }

  reset() {
    for (const actor of [this.player, this.rival]) {
      actor.pose.restore();
      if (this.locked(actor)) {
        actor.root.rotation.set(0, actor.root.rotation.y, 0, 'XYZ');
        actor.root.position.y = Math.min(0, actor.root.position.y);
      }
    }
    this.action = null;
    this.prompt('');
  }

  direction(attacker, defender) {
    return new THREE.Vector3().subVectors(defender.root.position, attacker.root.position).setY(0).normalize();
  }

  cover(from, direction, distance, padding = 0) {
    this.ray.origin.copy(from);
    this.ray.origin.y += padding ? 5 : 9;
    this.ray.direction.copy(direction);
    return this.query.nearest(this.world, this.ray, distance, !padding, 0, padding);
  }

  facing(attacker, direction, yaw = attacker.root.rotation.y) {
    return direction.x * Math.sin(yaw) + direction.z * Math.cos(yaw) > .58;
  }

  canGrab(attacker, defender, yaw) {
    const distance = planar(attacker.root.position, defender.root.position);
    if (distance < .1 || distance > GRAB_RANGE ||
        Math.abs(attacker.root.position.y - defender.root.position.y) > 5 ||
        this.world.isWater?.(attacker.root.position.x, attacker.root.position.z) ||
        this.world.isWater?.(defender.root.position.x, defender.root.position.z)) return false;
    const direction = this.direction(attacker, defender);
    return this.facing(attacker, direction, yaw) && !this.cover(attacker.root.position, direction, distance, 4);
  }

  grabInput(yaw) {
    const action = this.action;
    if (action) {
      if (action.phase !== 'hold') return;
      if (action.attacker === this.player) this.slam(yaw);
      else if (action.time >= .15) this.escape();
      return;
    }
    if (this.cooldown > 0 || this.enemy.dead) return;
    if (this.canGrab(this.player, this.rival, yaw)) this.grab(this.player, this.rival);
    else this.whiff(this.player, 'GET CLOSE AND FACE THE RIVAL', .35);
  }

  punch(yaw) {
    if (this.action || this.cooldown > 0 || this.enemy.dead) return;
    const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const motion = this.player.glb.melee.punch;
    const duration = .9;
    this.player.glb.playOnce(motion.name, .09, 1, { duration });
    this.player.glb.play('idle');
    this.player.root.rotation.y = yaw;
    this.action = {phase: 'punch', attacker: this.player, defender: this.rival, direction,
      time: 0, duration, contact: duration * motion.contact / motion.duration};
  }

  kick(yaw, attacker = this.player, defender = this.rival) {
    if (this.action || (attacker === this.player && this.cooldown > 0) || this.enemy.dead) return false;
    if (Math.abs(attacker.root.position.y) > 4 || this.world.isWater?.(attacker.root.position.x, attacker.root.position.z)) return false;
    attacker.glb.resetAnim();
    const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    attacker.root.rotation.set(0, yaw, 0, 'YXZ');
    this.action = {phase: 'kick', attacker, defender, direction, time: 0, duration: .94,
      start: attacker.root.position.clone(), travelled: 0};
    this.prompt(attacker === this.player ? 'DROPKICK' : 'RIVAL DROPKICK · DODGE SIDEWAYS');
    return true;
  }

  tryRival() {
    if (this.action || this.aiCooldown > 0) return false;
    const distance = planar(this.rival.root.position, this.player.root.position);
    if (this.player.stagger > 0 && this.canGrab(this.rival, this.player)) {
      this.grab(this.rival, this.player);
      return true;
    }
    const direction = this.direction(this.rival, this.player);
    if (distance >= 29 && distance <= 45 && this.facing(this.rival, direction) &&
        !this.cover(this.rival.root.position, direction, distance, 4) &&
        this.kick(Math.atan2(direction.x, direction.z), this.rival, this.player)) {
      this.aiCooldown = 7;
      return true;
    }
    return false;
  }

  whiff(attacker, label, duration) {
    this.action = {phase: 'recover', attacker, time: 0, duration};
    this.prompt(label);
  }

  grab(attacker, defender) {
    this.enemy.cancelTelegraph?.();
    const direction = this.direction(attacker, defender);
    const yaw = Math.atan2(direction.x, direction.z);
    for (const actor of [attacker, defender]) actor.glb.resetAnim();
    attacker.root.rotation.set(0, yaw, 0, 'YXZ');
    defender.root.rotation.set(0, yaw + Math.PI, 0, 'YXZ');
    const gap = planar(attacker.root.position, defender.root.position);
    const chestGap = defender.pose.torso(this.target).sub(attacker.pose.torso(this.hit)).dot(direction);
    const closeBy = THREE.MathUtils.clamp(chestGap - HOLD_GAP, 0, Math.max(0, gap - HOLD_GAP));
    this.action = {phase: 'grab', attacker, defender, direction, time: 0, duration: .28, paired: true,
      start: defender.root.position.clone(), closeBy,
      stunned: defender.stagger > 0 || (defender === this.rival && this.enemy.phase === 'recover')};
    this.prompt(attacker === this.player ? 'GRABBING RIVAL' : 'RIVAL GRAB · GET READY TO BREAK');
  }

  slam(yaw) {
    const action = this.action;
    if (yaw !== undefined) {
      const facing = Math.atan2(action.direction.x, action.direction.z);
      const delta = yaw - facing;
      const aim = facing + THREE.MathUtils.clamp(Math.atan2(Math.sin(delta), Math.cos(delta)), -.8, .8);
      action.direction.set(Math.sin(aim), 0, Math.cos(aim));
      action.attacker.root.rotation.y = aim;
      action.defender.root.rotation.y = aim + Math.PI;
    }
    action.phase = 'slam';
    action.time = 0;
    action.duration = .88;
    action.start.copy(action.defender.root.position);
    action.travelled = 0;
    this.prompt('BODY SLAM');
  }

  escape() {
    const action = this.action;
    action.phase = 'recover';
    action.time = 0;
    action.duration = .48;
    this.prompt(action.defender === this.player ? 'GRAB BROKEN' : 'RIVAL BROKE FREE');
  }

  damage(defender, amount, source) {
    if (defender === this.rival) this.enemy.damage(amount);
    else this.hurtPlayer(amount, source.root.position);
  }

  impact(position, kind) {
    this.effectPoint.copy(position).setY(.3);
    this.world.spawnDustBurst?.(this.effectPoint, kind === 'slam' ? 16 : 9, 12);
    if (kind === 'slam') this.world.spawnShockwave?.(this.effectPoint, 0xffae71, 24);
    this.feedback(kind);
  }

  breakBuilding(building, point) {
    building.damage(Math.max((building.hp || 0) + 1, 220), point, this.world);
  }

  framePosition(position, start, direction, distance) {
    position.copy(start).addScaledVector(direction, distance);
    const bounds = this.world.bounds;
    if (bounds) {
      position.x = THREE.MathUtils.clamp(position.x, bounds.minX + 5, bounds.maxX - 5);
      position.z = THREE.MathUtils.clamp(position.z, bounds.minZ + 5, bounds.maxZ - 5);
    }
  }

  animateGrip(action, progress) {
    const {attacker, defender, direction} = action;
    for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
      defender.pose.torso(this.target);
      this.target.y += .65 + progress * 1.2;
      this.target.addScaledVector(direction, -3);
      this.target.x += direction.z * sign * 3.2;
      this.target.z -= direction.x * sign * 3.2;
      const hand = attacker.pose.chains[side + 'Arm'][2];
      if (hand && action.phase === 'grab') this.target.lerp(hand.getWorldPosition(this.hit), 1 - smooth(progress));
      attacker.pose.reach(side + 'Arm', this.target);
      if (action.phase !== 'slam') {
        attacker.pose.torso(this.target).addScaledVector(direction, 3);
        this.target.x -= direction.z * sign * 3;
        this.target.z += direction.x * sign * 3;
        const guardingHand = defender.pose.chains[side + 'Arm'][2];
        if (guardingHand && action.phase === 'grab') this.target.lerp(guardingHand.getWorldPosition(this.hit), 1 - smooth(progress));
        defender.pose.reach(side + 'Arm', this.target);
      }
    }
  }

  finish() {
    const action = this.action;
    for (const actor of [action.attacker, action.paired ? action.defender : null]) {
      if (!actor) continue;
      actor.pose.restore();
      actor.root.rotation.set(0, actor.root.rotation.y, 0, 'XYZ');
      actor.root.position.y = Math.min(0, actor.root.position.y);
    }
    if (action.paired || action.attacker === this.rival) {
      this.enemy.phase = 'recover';
      this.enemy.timer = action.phase === 'recover' ? .85 : .35;
    }
    this.cooldown = .23;
    this.aiCooldown = Math.max(3, this.aiCooldown);
    this.action = null;
    this.prompt(this.rival.stagger > 0 ? 'RIVAL STAGGERED · GRAB' : '');
  }

  step(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.aiCooldown = Math.max(0, this.aiCooldown - dt);
    this.player.stagger = Math.max(0, this.player.stagger - dt);
    const wasStaggered = this.rival.stagger > 0;
    this.rival.stagger = Math.max(0, this.rival.stagger - dt);
    const a = this.action;
    if (!a) {
      if (wasStaggered && this.rival.stagger === 0) this.prompt('');
      return;
    }
    const {attacker, defender, direction} = a;
    a.time += dt;
    attacker.pose.restore();
    attacker.glb.mixer.update(dt);
    if (a.paired) {
      defender.pose.restore();
      defender.glb.mixer.update(dt);
    }
    const p = Math.min(1, a.time / a.duration);
    if (a.phase === 'punch' && !a.hit && a.time >= a.contact) {
      a.hit = true;
      const distance = planar(attacker.root.position, defender.root.position);
      const toward = this.direction(attacker, defender);
      const wall = this.cover(attacker.root.position, direction, Math.min(26, distance));
      if (wall) {
        wall.building.damage(attacker.config.stats.melee, wall.point, this.world);
        this.impact(wall.point, 'punch');
      } else if (distance <= 26 && toward.dot(direction) > .62 && Math.abs(defender.root.position.y - attacker.root.position.y) < 10) {
        defender.stagger = 1.45;
        this.enemy.phase = 'recover';
        this.enemy.timer = .68;
        if (this.enemy.cancelTelegraph) this.enemy.cancelTelegraph();
        else this.enemy.onWarning('');
        this.impact(defender.root.position, 'punch');
        this.damage(defender, attacker.config.stats.melee, attacker);
        if (!this.enemy.dead) this.prompt('RIVAL STAGGERED · GRAB');
      }
    } else if (a.phase === 'grab') {
      this.framePosition(defender.root.position, a.start, direction, -a.closeBy * smooth(p));
      this.animateGrip(a, p);
      if (p === 1) {
        a.phase = 'hold';
        a.time = 0;
        a.duration = attacker === this.player ? (a.stunned ? 1.65 : 1.05) : .92;
        this.prompt(attacker === this.player ? 'HOLDING RIVAL · PRESS GRAB TO SLAM' : 'HELD · PRESS GRAB TO BREAK');
      }
      return;
    } else if (a.phase === 'hold') {
      this.animateGrip(a, 1);
      if (p === 1) {
        if (attacker === this.rival) this.slam();
        else this.escape();
      }
      return;
    } else if (a.phase === 'slam') {
      this.stepSlam(a, p);
      return;
    } else if (a.phase === 'kick') {
      this.stepKick(a, p);
      return;
    } else if (a.phase === 'recover' && a.knockdown) {
      a.knockdown.rotation.x = -1.38 * (1 - smooth(p));
    }
    if (p === 1 && this.action === a) this.finish();
  }

  stepSlam(action, progress) {
    const {attacker, defender, direction, start} = action;
    const flight = Math.max(0, (progress - .34) / .66);
    const travelled = flight * THROW_DISTANCE;
    const position = defender.root.position;
    const height = progress < .34 ? smooth(progress / .34) * 7 : 7 * (1 - flight * flight);
    position.y = height;
    const wall = travelled > action.travelled
      ? this.cover(position, direction, travelled - action.travelled, 6) : null;
    const stop = wall ? action.travelled + wall.distance : travelled;
    this.framePosition(position, start, direction, stop);
    position.y = height;
    defender.root.rotation.x = -1.38 * smooth(Math.min(1, flight * 2.1));
    attacker.root.rotation.x = .18 * Math.sin(progress * Math.PI);
    if (progress < .47) this.animateGrip(action, progress);
    else {
      for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        this.target.copy(attacker.root.position).addScaledVector(direction, 10 - flight * 5);
        this.target.y += 11 - flight * 4;
        this.target.x += direction.z * sign * 4;
        this.target.z -= direction.x * sign * 4;
        attacker.pose.reach(side + 'Arm', this.target);
      }
    }
    action.travelled = stop;
    if (!wall && progress < 1) return;

    position.y = 0;
    if (wall) {
      this.hit.copy(wall.point);
      this.hit.x = THREE.MathUtils.clamp(this.hit.x, wall.building.x - wall.building.w / 2, wall.building.x + wall.building.w / 2);
      this.hit.z = THREE.MathUtils.clamp(this.hit.z, wall.building.z - wall.building.d / 2, wall.building.z + wall.building.d / 2);
      this.breakBuilding(wall.building, this.hit);
    }
    this.impact(position, 'slam');
    action.phase = 'recover';
    action.knockdown = defender.root;
    action.time = 0;
    action.duration = 1.05;
    attacker.root.rotation.x = 0;
    defender.root.rotation.x = -1.38;
    this.prompt(wall ? 'BUILDING SLAM' : 'BODY SLAM LANDED');
    this.damage(defender, attacker.config.stats.melee * (wall ? 3.2 : 2.3), attacker);
  }

  stepKick(action, progress) {
    const {attacker, defender, direction, start} = action;
    const flight = Math.max(0, (progress - .3) / .7);
    const distance = 32 * flight;
    const position = attacker.root.position;
    const wall = distance > action.travelled ? this.cover(position, direction, distance - action.travelled, 5) : null;
    const stop = wall ? action.travelled + wall.distance : distance;
    this.framePosition(position, start, direction, stop);
    position.y = 8 * Math.sin(flight * Math.PI);
    attacker.root.rotation.x = -.88 * Math.sin(flight * Math.PI);
    action.travelled = stop;
    if (flight > 0) {
      for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        this.target.copy(position).addScaledVector(direction, 9);
        this.target.y += 6;
        this.target.x += direction.z * sign * 2;
        this.target.z -= direction.x * sign * 2;
        attacker.pose.reach(side + 'Leg', this.target);
      }
    }
    const toward = this.direction(attacker, defender);
    const hit = flight > 0 && !wall && planar(position, defender.root.position) < 15 && toward.dot(direction) > .2 &&
      Math.abs(position.y - defender.root.position.y) < 10;
    if (!wall && !hit && progress < 1) return;
    if (wall) wall.building.damage(attacker.config.stats.melee * 2, wall.point, this.world);
    position.y = 0;
    this.impact(hit ? defender.root.position : position, 'kick');
    action.phase = 'recover';
    action.time = 0;
    action.duration = hit ? .72 : 1.08;
    action.knockdown = hit ? defender.root : attacker.root;
    action.paired = hit;
    action.knockdown.rotation.set(-1.38, action.knockdown.rotation.y, 0, 'YXZ');
    if (hit) {
      defender.glb.resetAnim();
      this.damage(defender, attacker.config.stats.melee * 1.7, attacker);
    }
    this.prompt(hit ? 'DROPKICK LANDED' : 'DROPKICK RECOVERY');
  }
}
