import * as THREE from 'three';

// Shared geometries / materials so high-rate effect spawns (sparks, smoke,
// hit pulses, muzzle flashes) don't churn through GC.
const G_SPARK     = new THREE.SphereGeometry(0.12, 4, 4);
const G_FIRE      = new THREE.SphereGeometry(1.0, 12, 12);
const G_CORE      = new THREE.SphereGeometry(0.6, 10, 10);
const G_HITPULSE  = new THREE.SphereGeometry(0.6, 10, 10);
const G_MUZZLE    = new THREE.SphereGeometry(1.0, 8, 8);
const G_SMOKE_S   = new THREE.SphereGeometry(1.0, 8, 8);
const G_SHRAPNEL  = new THREE.SphereGeometry(0.18, 4, 4);

// Global pool of explosion PointLights. Three.js evaluates every light per
// fragment, so an unbounded count tanks fps in heavy combat. We allocate a
// fixed pool and reuse the oldest/dimmest light for new explosions.
const MAX_EXPLOSION_LIGHTS = 5;
const _lightPool = [];
let _lightCursor = 0;
function acquireLight(scene) {
  if (_lightPool.length < MAX_EXPLOSION_LIGHTS) {
    const l = new THREE.PointLight(0xffaa33, 0, 60);
    scene.add(l);
    _lightPool.push(l);
    return l;
  }
  // Round-robin reuse so newest explosion always gets a light
  const l = _lightPool[_lightCursor];
  _lightCursor = (_lightCursor + 1) % _lightPool.length;
  return l;
}

// Particle/effect helpers - explosions, sparks, beams, shockwaves, smoke.
// All effects allocate a tiny mesh, push themselves to the world's effect list,
// and tick down their life.

export class Effect {
  constructor(mesh, life, update) {
    this.mesh = mesh;
    this.life = life;
    this.maxLife = life;
    this.update = update; // (dt, t01) -> void
    this.dead = false;
  }
  tick(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      // Final cleanup tick at t=1. Each effect's callback removes its
      // owned meshes inside an `if (t >= 1)` guard; without invoking it
      // one last time, callbacks that own multiple meshes (explosion,
      // shockwave, beam, smoke column) leak their visuals into the scene.
      // Wrapped in try/catch so a buggy callback can't keep the array
      // entry alive forever.
      if (!this._cleaned) {
        this._cleaned = true;
        try { this.update(0, 1, this); } catch (e) {}
      }
      this.dead = true;
      return;
    }
    const t = 1 - this.life / this.maxLife;
    this.update(dt, t, this);
  }
}

export function makeExplosion(world, pos, scale = 1.0) {
  const group = new THREE.Group();
  group.position.copy(pos);
  world.scene.add(group);

  // Fireball
  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xffaa33, transparent: true, opacity: 1.0,
  });
  const fire = new THREE.Mesh(G_FIRE, fireMat);
  group.add(fire);

  // Inner core
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 1.0 });
  const core = new THREE.Mesh(G_CORE, coreMat);
  group.add(core);

  // Pooled point light -- track which one we're using so we don't fade
  // a light that has been hijacked by a newer explosion.
  const light = acquireLight(world.scene);
  light.position.copy(pos);
  light.intensity = 6 * scale;
  light.distance = 60;
  // Sequence id so we know if this explosion still owns the light
  const seq = (light._seq = (light._seq || 0) + 1);

  // Shrapnel sparks
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
  const sparks = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(G_SHRAPNEL, sparkMat);
    s.userData.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 18,
      Math.random() * 14,
      (Math.random() - 0.5) * 18
    ).multiplyScalar(scale);
    group.add(s);
    sparks.push(s);
  }

  return new Effect(group, 1.2, (dt, t) => {
    const s = (1 + t * 8) * scale;
    fire.scale.setScalar(s);
    core.scale.setScalar(s * 0.5);
    fireMat.opacity = 1 - t;
    coreMat.opacity = 1 - t * 1.5;
    // Only fade *our* light; if a newer explosion hijacked it, leave it alone
    if (light._seq === seq) light.intensity = (1 - t) * 6 * scale;
    for (const sp of sparks) {
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= 30 * dt;
    }
    if (t >= 1) {
      if (light._seq === seq) light.intensity = 0;
      world.scene.remove(group);
    }
  });
}

export function makeSparks(world, pos, count = 8) {
  const group = new THREE.Group();
  group.position.copy(pos);
  world.scene.add(group);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
  const sparks = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Mesh(G_SPARK, sparkMat);
    s.userData.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 6 + 2,
      (Math.random() - 0.5) * 10
    );
    group.add(s);
    sparks.push(s);
  }
  return new Effect(group, 0.6, (dt, t) => {
    sparkMat.opacity = 1 - t; sparkMat.transparent = true;
    for (const sp of sparks) {
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= 18 * dt;
    }
    if (t >= 1) world.scene.remove(group);
  });
}

export function makeShockwave(world, pos, color = 0xffcc44, maxRadius = 60) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.0, 48),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(pos); ring.position.y += 0.3;
  world.scene.add(ring);
  const ring2 = ring.clone();
  ring2.material = ring.material.clone();
  ring2.material.color.setHex(0xffffff);
  world.scene.add(ring2);
  return new Effect(ring, 0.9, (dt, t) => {
    const r = t * maxRadius;
    ring.scale.set(r + 0.001, r + 0.001, 1);
    ring2.scale.set(r * 0.6 + 0.001, r * 0.6 + 0.001, 1);
    ring.material.opacity = 1 - t;
    ring2.material.opacity = (1 - t) * 0.6;
    if (t >= 1) { world.scene.remove(ring); world.scene.remove(ring2); }
  });
}

// Shared materials for smoke puffs -- one for early-dark, one for late-light.
// Each puff still needs its own opacity fade, so we clone the material lazily
// per puff but reuse the geometry.
const G_SMOKE_PUFF = new THREE.SphereGeometry(1.4, 8, 8);
const _smokeMatProto = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });

// Lingering smoke column from a destroyed building. Periodically emits drifting puffs
// for ~8 seconds, keeping the destruction visible from a distance.
export function makeSmokeColumn(world, pos, height = 30) {
  const baseY = pos.y;
  const proxy = new THREE.Object3D();
  proxy.position.copy(pos);
  world.scene.add(proxy);
  const totalLife = 8.0;
  let nextEmit = 0;
  return new Effect(proxy, totalLife, (dt, t) => {
    nextEmit -= dt;
    if (nextEmit <= 0) {
      nextEmit = 0.6 + Math.random() * 0.4;
      const intensity = (1 - t);
      // Per-puff material clone (cheap; just copies properties) so opacity
      // can fade independently. Geometry stays shared.
      const mat = _smokeMatProto.clone();
      mat.color.setHex(t < 0.4 ? 0x333333 : 0x666666);
      mat.opacity = 0.55 * intensity;
      const m = new THREE.Mesh(G_SMOKE_PUFF, mat);
      const sz = 0.85 + Math.random() * 0.55;
      m.scale.setScalar(sz);
      m.position.set(
        pos.x + (Math.random() - 0.5) * 4,
        baseY + 1 + (1 - intensity) * height * 0.4,
        pos.z + (Math.random() - 0.5) * 4,
      );
      world.scene.add(m);
      const vy = 1.6 + Math.random() * 1.2;
      const vx = (Math.random() - 0.5) * 1.5;
      const vz = (Math.random() - 0.5) * 1.5;
      const baseScale = sz;
      world.effects.push(new Effect(m, 4.5, (dt2, t2) => {
        m.position.x += vx * dt2;
        m.position.y += vy * dt2;
        m.position.z += vz * dt2;
        m.scale.setScalar(baseScale * (1 + t2 * 3));
        mat.opacity = 0.55 * intensity * (1 - t2);
        if (t2 >= 1) { world.scene.remove(m); mat.dispose(); }
      }));
    }
    if (t >= 1) world.scene.remove(proxy);
  });
}

// Quick expanding glow at a hit point. Tactile feedback for impact.
export function makeHitPulse(world, pos, color = 0xffffff) {
  const m = new THREE.Mesh(
    G_HITPULSE,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
  );
  m.position.copy(pos);
  world.scene.add(m);
  return new Effect(m, 0.22, (dt, t) => {
    m.scale.setScalar(1 + t * 6);
    m.material.opacity = 0.95 * (1 - t);
    if (t >= 1) world.scene.remove(m);
  });
}

export function makeMuzzleFlash(world, pos, scale = 0.5) {
  const m = new THREE.Mesh(
    G_MUZZLE,
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 })
  );
  m.scale.setScalar(scale);
  m.position.copy(pos);
  world.scene.add(m);
  const baseScale = scale;
  return new Effect(m, 0.12, (dt, t) => {
    m.scale.setScalar(baseScale * (1 + t * 2));
    m.material.opacity = 0.9 * (1 - t);
    if (t >= 1) world.scene.remove(m);
  });
}

export function makeSmokePuff(world, pos, scale = 1.0) {
  const m = new THREE.Mesh(
    G_SMOKE_S,
    new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 })
  );
  m.scale.setScalar(scale);
  m.position.copy(pos);
  world.scene.add(m);
  return new Effect(m, 2.5, (dt, t) => {
    m.position.y += dt * 1.6;
    m.scale.setScalar(scale * (1 + t * 3));
    m.material.opacity = 0.6 * (1 - t);
    if (t >= 1) world.scene.remove(m);
  });
}

// A laser/beam emanating from origin in a direction. Damage handled in world.
export function makeBeam(world, origin, dir, length, color = 0x66ff66, glowColor = 0xaaffaa) {
  const beam = new THREE.Group();
  const len = length;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, len, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
  );
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, len, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  const outer2 = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, len, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  // beam runs along its local Y axis, point from origin -> origin + dir*len
  beam.add(core); beam.add(outer); beam.add(outer2);
  // Position so origin is at start
  const mid = origin.clone().addScaledVector(dir, len / 2);
  beam.position.copy(mid);
  // Orient cylinder (default Y) to dir
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  beam.quaternion.copy(q);

  // Add a point light at origin
  const light = new THREE.PointLight(color, 4, 30);
  light.position.copy(origin);
  world.scene.add(light);

  world.scene.add(beam);

  return new Effect(beam, 0.6, (dt, t) => {
    const pulse = 1 + Math.sin(world.time * 30) * 0.15;
    core.scale.set(pulse, 1, pulse);
    outer.scale.set(pulse * 1.1, 1, pulse * 1.1);
    outer2.scale.set(pulse * 1.2, 1, pulse * 1.2);
    if (t > 0.6) {
      const fade = 1 - (t - 0.6) / 0.4;
      core.material.opacity = 0.95 * fade;
      outer.material.opacity = 0.5 * fade;
      outer2.material.opacity = 0.25 * fade;
      light.intensity = 4 * fade;
    }
    if (t >= 1) {
      world.scene.remove(beam);
      world.scene.remove(light);
    }
  });
}
