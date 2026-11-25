import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingGrid } from '../src/buildingGrid.js';
import { turnToward, initMilitaryMotion, moveMilitary } from '../src/militaryMotion.js';
globalThis.window = { innerWidth: 1440, innerHeight: 900 };
globalThis.location = { search: '?q=low' };
globalThis.localStorage = { getItem: () => null };
const { Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech } = await import('../src/enemies.js');
function arena() {
  const shots = [], hits = [], arty = [];
  const world = { time: 0, enemies: [], bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, buildingGrid: new BuildingGrid(),
    spawnShell: (p, d, type) => shots.push({ p: p.clone(), d: d.clone(), type }),
    spawnArtilleryShell: (p, t) => arty.push(t.clone()), onMilitaryHit: (...args) => hits.push(args),
    spawnMuzzleFlash() {}, spawnHitPulse() {}, spawnExplosion() {}, spawnSparks() {}, spawnShockwave() {}, spawnBossTelegraph() {}, shake() {} };
  return { world, shots, hits, arty };
}
function run(e, w, seconds, target = new THREE.Vector3(0, 0, 60), hz = 60) {
  for (let i = 0; i < seconds * hz; i++) { w.time += 1 / hz; e.update(1 / hz, w, target); }
}

test('steering turns along the short arc with a bounded angular speed', () => {
  const angle = turnToward(Math.PI - .01, -Math.PI + .1, .03);
  assert.ok(Math.abs(angle - (Math.PI + .02)) < 1e-9);
  assert.equal(turnToward(0, 2, .04), .04);
});

test('ground units avoid buildings, rotated footprints, water and boundaries without teleporting', () => {
  for (const rotated of [false, true]) {
    const { world } = arena(), e = { root: new THREE.Group() }; initMilitaryMotion(e);
    const b = { x: 0, z: 15, w: 10, d: 10, h: 20 };
    if (rotated) b.obb = { hw: 5, hd: 5, c: Math.cos(.5), s: Math.sin(.5) };
    world.buildingGrid.add(b); world.buildings = [b];
    for (let i = 0; i < 360; i++) {
      const before = e.root.position.clone(); moveMilitary(e, 1 / 60, world, 0, 1, 8, 2);
      assert.ok(before.distanceTo(e.root.position) <= 8 / 60 + 1e-6);
      const dx = e.root.position.x, dz = e.root.position.z - 15;
      const x = rotated ? dx * b.obb.c - dz * b.obb.s : dx, z = rotated ? dx * b.obb.s + dz * b.obb.c : dz;
      assert.ok(Math.abs(x) >= 7 || Math.abs(z) >= 7, 'does not enter the inflated building footprint');
    }
  }
  const { world } = arena(), e = { root: new THREE.Group() }; initMilitaryMotion(e); world.isWater = (x) => x > 15;
  for (let i = 0; i < 600; i++) moveMilitary(e, 1 / 60, world, 1, 0, 10, 1);
  assert.ok(e.root.position.x <= 15); assert.ok(e.root.position.x > 5);
});

test('tanks visibly brace and align before firing rather than firing while snapping to the target', () => {
  const { world, shots } = arena(), e = new Tank(0, 0); world.enemies.push(e); e.cooldown = 0;
  const target = new THREE.Vector3(60, 0, 0); run(e, world, .5, target);
  assert.equal(shots.length, 0); assert.equal(e.tactic, 'brace'); assert.ok(e.root.rotation.y < Math.PI / 2);
  run(e, world, 1, target); assert.equal(shots.length, 1); assert.equal(shots[0].type, 'tank');
});

test('infantry moves while using run-and-shoot, fires bounded two-round bursts, and pursues an escaping target', () => {
  const { world, shots } = arena(), e = new Soldier(0, 0); world.enemies.push(e); e.cooldown = 0;
  run(e, world, .4, new THREE.Vector3(0, 0, 30)); assert.equal(shots.length, 2);
  assert.ok(e.root.position.length() > 0); assert.equal(e._burst, 0);
  e._burst = 1; run(e, world, 1, new THREE.Vector3(0, 0, 140)); assert.equal(e._burst, 0); assert.ok(e._moveSpeed > 7);
});

test('mechs hold their volley pose and their two muzzles follow actor orientation', () => {
  const { world, shots } = arena(), e = new Mech(0, 0); world.enemies.push(e); e.cooldown = 0;
  run(e, world, .5); assert.equal(shots.length, 0); assert.ok(e._attackHold > 0);
  run(e, world, .25); assert.equal(shots.length, 2); assert.ok(e._attackHold > 0);
  assert.ok(shots[0].p.distanceTo(shots[1].p) > 2);
});

test('helicopters make a burst pass then break off, with banking and continuous rotor movement', () => {
  const { world, shots } = arena(), e = new Helicopter(0, 0); e.cooldown = 0; world.enemies.push(e);
  run(e, world, 1.3, new THREE.Vector3(0, 0, 80)); assert.ok(shots.length >= 2 && shots.length <= 4);
  assert.equal(e.tactic, 'break'); assert.ok(e.rotor.rotation.y > 20); assert.ok(Math.abs(e._visual.rotation.z) > .01);
  const n = shots.length; run(e, world, 1); assert.equal(shots.length, n);
});

test('jets return through a banked turn without the old repositioning teleport', () => {
  const { world } = arena(), e = new Jet(0, 0); world.enemies.push(e); e.state = 'egress'; e.egressTimer = .01;
  let turned = false;
  for (let i = 0; i < 600; i++) {
    const before = e.root.position.clone(); world.time += 1 / 60; e.update(1 / 60, world, new THREE.Vector3(50, 0, 0));
    assert.ok(before.distanceTo(e.root.position) < 1.3); turned ||= Math.abs(e._visual.rotation.z) > .05;
  }
  assert.ok(turned); assert.ok(Number.isFinite(e.root.rotation.y));
});

test('artillery relocates at close range, winds up at range, then fires at a fixed predicted target', () => {
  const { world, arty } = arena(), e = new Artillery(0, 0); world.enemies.push(e); e.cooldown = 0;
  run(e, world, 1, new THREE.Vector3(0, 0, 50)); assert.equal(arty.length, 0); assert.equal(e.tactic, 'relocate'); assert.ok(e.root.position.z < 0);
  run(e, world, .5, new THREE.Vector3(0, 0, 160)); assert.equal(arty.length, 0);
  run(e, world, 1, new THREE.Vector3(0, 0, 160)); assert.equal(arty.length, 1);
});

test('a surviving hit interrupts a normal volley, reacts locally, and cannot mutate another unit or award twice', () => {
  const { world, shots, hits } = arena(), e = new Mech(0, 0), other = new Mech(10, 0); world.enemies.push(e, other); e.cooldown = 0;
  run(e, world, .2); e.damage(20, world); assert.ok(e._stagger > 0); assert.equal(e._windup, 0); assert.equal(other._stagger, 0);
  run(e, world, .4); assert.equal(shots.length, 0); assert.ok(Math.abs(e._visual.rotation.z) > 0);
  e.damage(9999, world); e.damage(9999, world); assert.equal(hits.length, 2); assert.ok(e.dead); assert.equal(other.hp, other.maxHp);
});

test('boss warnings survive light hits and paused/frozen frames never move, shoot or animate enemies', () => {
  const { world, shots } = arena(), boss = new BossMech(0, 0); boss.cooldown = 0; world.enemies.push(boss);
  run(boss, world, .1); assert.ok(boss._volleyT > 0); boss.damage(10, world); assert.ok(boss._volleyT > 0); assert.equal(boss._stagger, 0);
  for (const C of [Tank, Soldier, Mech, Helicopter, Jet, Artillery, BossMech]) {
    const e = new C(10, 10), before = e.root.position.clone(), time = e._tacticalTime; e.cooldown = 0;
    e.update(0, world, new THREE.Vector3()); assert.ok(e.root.position.equals(before)); assert.equal(e._tacticalTime, time);
  }
  assert.equal(shots.length, 0);
});
