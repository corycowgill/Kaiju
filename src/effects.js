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

// Pre-built shared geometry for the explosion ground-shockwave ring (a flat
// disc that scales out fast then fades).
const G_RING = new THREE.RingGeometry(0.9, 1.0, 36);

export function makeExplosion(world, pos, scale = 1.0) {
  const group = new THREE.Group();
  group.position.copy(pos);
  world.scene.add(group);

  // Inner white-hot core flash (scaled HUGE for the first ~10% of life)
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 1.0, depthWrite: false });
  const flash = new THREE.Mesh(G_FIRE, flashMat);
  group.add(flash);

  // Outer fireball (orange)
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 1.0, depthWrite: false });
  const fire = new THREE.Mesh(G_FIRE, fireMat);
  group.add(fire);

  // Mid yellow-hot ball
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 1.0, depthWrite: false });
  const core = new THREE.Mesh(G_CORE, coreMat);
  group.add(core);

  // Ground shockwave ring (sits flat on the ground, expands outward)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(G_RING, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -pos.y + 0.15; // sit at world y=0.15 regardless of source y
  group.add(ring);

  // Smoke puff lifting off (lingers after the fireball fades)
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.8, depthWrite: false });
  const smoke = new THREE.Mesh(G_FIRE, smokeMat);
  smoke.position.y = 0;
  group.add(smoke);

  // Pooled point light
  const light = acquireLight(world.scene);
  light.position.copy(pos);
  light.intensity = 7 * scale;
  light.distance = 70;
  const seq = (light._seq = (light._seq || 0) + 1);

  // Shrapnel chunks (more, larger, with rotation)
  const sparkMat  = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
  const emberMat  = new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 1.0 });
  const sparks = [];
  for (let i = 0; i < 22; i++) {
    const useEmber = i < 10;
    const s = new THREE.Mesh(G_SHRAPNEL, useEmber ? emberMat : sparkMat);
    const speed = (8 + Math.random() * 16) * scale;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = Math.PI * 0.18 + Math.random() * Math.PI * 0.45;
    s.userData.vel = new THREE.Vector3(
      Math.cos(yaw) * Math.cos(pitch) * speed,
      Math.sin(pitch) * speed * 1.4,
      Math.sin(yaw) * Math.cos(pitch) * speed,
    );
    s.userData.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    );
    s.userData.ember = useEmber;
    group.add(s);
    sparks.push(s);
  }

  return new Effect(group, 1.4, (dt, t) => {
    // Initial hot flash (first 10% of life): super-bright + fast scale
    const flashT = Math.min(1, t / 0.10);
    flash.scale.setScalar((1 + flashT * 5) * scale);
    flashMat.opacity = (1 - flashT) * 1.2;
    // Fireball expansion + colour shift orange -> red
    const s = (1 + t * 9) * scale;
    fire.scale.setScalar(s);
    core.scale.setScalar(s * 0.55);
    fireMat.opacity = (1 - t) * 0.95;
    coreMat.opacity = (1 - t * 1.4) * 0.9;
    fireMat.color.setHSL(0.07 - t * 0.05, 0.95, 0.55 - t * 0.25);
    // Ground ring blasts out then thins
    const ringR = (1 + t * 18) * scale;
    ring.scale.set(ringR, ringR, 1);
    ringMat.opacity = (1 - t) * 0.95;
    // Smoke lifts and grows, fades second half of life
    smoke.scale.setScalar((0.6 + t * 4.5) * scale);
    smoke.position.y = -pos.y + 0.1 + t * 6.0 * scale; // rises in world y
    smokeMat.opacity = t < 0.4 ? 0.0 : Math.min(0.7, (t - 0.4) * 1.4) * (1.4 - t);
    // Light fades
    if (light._seq === seq) light.intensity = (1 - t) * 7 * scale;
    // Sparks: arc + tumble
    for (const sp of sparks) {
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= 32 * dt;
      sp.rotation.x += sp.userData.spin.x * dt;
      sp.rotation.y += sp.userData.spin.y * dt;
      sp.rotation.z += sp.userData.spin.z * dt;
      // Embers fade out as they cool
      if (sp.userData.ember) {
        sp.material.opacity = Math.max(0, 1 - t * 1.6);
      }
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

// ============== Power-tailored VFX helpers ==============

// Chain lightning bolt: jagged poly-line from a -> b in `color`.
// Built once at spawn (LineSegments via BufferGeometry) and faded over `life`.
export function makeChainLightning(world, a, b, color = 0xffee66, life = 0.45, segs = 14) {
  const points = [];
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  // Two perpendicular axes for jitter
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const updir = new THREE.Vector3().crossVectors(right, dir).normalize();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().copy(a).addScaledVector(dir, t);
    if (i > 0 && i < segs) {
      const offsetMag = (Math.random() - 0.5) * len * 0.08;
      const offsetMag2 = (Math.random() - 0.5) * len * 0.08;
      p.addScaledVector(right, offsetMag);
      p.addScaledVector(updir, offsetMag2);
    }
    points.push(p);
  }
  // Build a thick "bolt" via a TubeGeometry along the polyline
  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segs * 2, 0.18, 5, false),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
  );
  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segs * 2, 0.55, 6, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
  );
  world.scene.add(halo);
  world.scene.add(tube);
  return new Effect(tube, life, (dt, t) => {
    tube.material.opacity = 1 - t;
    halo.material.opacity = 0.55 * (1 - t);
    if (t >= 1) {
      world.scene.remove(tube); world.scene.remove(halo);
      tube.geometry.dispose(); halo.geometry.dispose();
    }
  });
}

// Missile swarm: spawn N small projectiles that arc outward from origin
// landing at random positions inside `radius`, each exploding on impact.
export function makeMissileSwarm(world, origin, radius = 60, count = 8) {
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.95 });
  const missileMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4, emissive: 0xff5522, emissiveIntensity: 0.6 });
  const missileGeom = new THREE.CylinderGeometry(0.18, 0.06, 1.0, 8);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = radius * (0.5 + Math.random() * 0.5);
    const target = new THREE.Vector3(origin.x + Math.cos(ang) * r, 0.5, origin.z + Math.sin(ang) * r);
    // Initial velocity: lobbed arc to land at target after T sec
    const T = 0.7 + Math.random() * 0.3;
    const g = 22;
    const vy = (target.y - origin.y) / T + 0.5 * g * T;
    const vx = (target.x - origin.x) / T;
    const vz = (target.z - origin.z) / T;
    const m = new THREE.Mesh(missileGeom, missileMat);
    m.position.copy(origin);
    world.scene.add(m);
    // Trail puffs while flying
    const trail = new THREE.Mesh(G_FIRE, trailMat.clone());
    trail.scale.setScalar(0.5);
    trail.position.copy(origin);
    world.scene.add(trail);
    const vel = new THREE.Vector3(vx, vy, vz);
    let timeLeft = T + 0.05;
    world.effects.push(new Effect(m, T + 0.1, (dt, t) => {
      timeLeft -= dt;
      vel.y -= g * dt;
      m.position.addScaledVector(vel, dt);
      // Orient nose along velocity
      const lookDir = vel.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lookDir);
      m.quaternion.copy(q);
      // Trail follows body, slight delay
      trail.position.lerp(m.position, 0.7);
      trail.material.opacity = 0.9 * (1 - t * 0.6);
      trail.scale.setScalar(0.5 + t * 1.2);
      if (timeLeft <= 0 || m.position.y <= 0.4) {
        world.scene.remove(m); world.scene.remove(trail);
        // Explode where we landed
        world.spawnExplosion?.(m.position.clone().setY(0.5), 0.7);
      }
    }));
  }
}

// Atomic dome: slow-expanding green-glowing hemisphere covering a big radius.
// Used as Gojira's ultimate signature.
export function makeAtomicDome(world, pos, maxRadius = 130, color = 0x66ff66) {
  const geom = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const dome = new THREE.Mesh(geom, mat);
  dome.position.copy(pos); dome.position.y = 0.3;
  world.scene.add(dome);
  // Bright inner core dome
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
  const inner = new THREE.Mesh(geom, innerMat);
  inner.position.copy(dome.position);
  world.scene.add(inner);
  return new Effect(dome, 1.1, (dt, t) => {
    const r = maxRadius * t;
    dome.scale.set(r, r, r);
    inner.scale.set(r * 0.85, r * 0.85, r * 0.85);
    mat.opacity = 0.4 * (1 - t);
    innerMat.opacity = 0.7 * (1 - t * 1.2);
    if (t >= 1) {
      world.scene.remove(dome); world.scene.remove(inner);
    }
  });
}

// Crescent wing-slash arc: a curved ring segment that flashes through.
// Used for Ghidorah's Wing Slam charge.
export function makeWingSlash(world, pos, yawRad, color = 0xff66ff) {
  const inner = 6, outer = 16;
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 24, 1, -Math.PI * 0.6, Math.PI * 1.2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
  );
  arc.rotation.x = -Math.PI / 2;
  arc.rotation.z = -yawRad;
  arc.position.copy(pos); arc.position.y = 1.2;
  world.scene.add(arc);
  // White inner highlight
  const arc2 = new THREE.Mesh(
    new THREE.RingGeometry(inner * 0.9, inner * 1.05, 24, 1, -Math.PI * 0.6, Math.PI * 1.2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false })
  );
  arc2.rotation.copy(arc.rotation);
  arc2.position.copy(arc.position);
  world.scene.add(arc2);
  return new Effect(arc, 0.45, (dt, t) => {
    const s = 1 + t * 0.6;
    arc.scale.set(s, s, 1);
    arc2.scale.set(s, s, 1);
    arc.material.opacity = 0.95 * (1 - t);
    arc2.material.opacity = (1 - t * 1.4);
    if (t >= 1) { world.scene.remove(arc); world.scene.remove(arc2); }
  });
}

// Tail-sweep arc: dust + emissive arc trail. Used for Gojira's Tail Sweep.
export function makeTailSweep(world, pos, yawRad, color = 0xffee44) {
  const inner = 4, outer = 18;
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 24, 1, -Math.PI * 0.4, Math.PI * 0.8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  arc.rotation.x = -Math.PI / 2;
  arc.rotation.z = -yawRad - Math.PI / 6;
  arc.position.copy(pos); arc.position.y = 0.6;
  world.scene.add(arc);
  return new Effect(arc, 0.4, (dt, t) => {
    arc.material.opacity = 0.9 * (1 - t);
    arc.scale.set(1 + t * 0.4, 1 + t * 0.4, 1);
    if (t >= 1) world.scene.remove(arc);
  });
}

// Afterburner trail: a stretched cyan/blue cone behind the kaiju on dash.
export function makeAfterburnerTrail(world, fromPos, toPos, color = 0x66aaff) {
  const dir = new THREE.Vector3().subVectors(toPos, fromPos);
  const len = dir.length();
  if (len < 0.01) return null;
  const mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 0.4, len, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  cone.position.copy(mid); cone.position.y += 4;
  // Orient along (fromPos -> toPos)
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  cone.quaternion.copy(q);
  world.scene.add(cone);
  // Bright inner streak
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.15, len, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
  );
  inner.quaternion.copy(q);
  inner.position.copy(cone.position);
  world.scene.add(inner);
  return new Effect(cone, 0.55, (dt, t) => {
    cone.material.opacity = 0.7 * (1 - t);
    inner.material.opacity = 0.95 * (1 - t * 1.2);
    if (t >= 1) { world.scene.remove(cone); world.scene.remove(inner); }
  });
}

// Dust burst: kicked-up brown dust ring from the ground around `pos`.
// Used to flesh out Gojira's roar / stomp / charge.
export function makeDustBurst(world, pos, radius = 14, count = 8) {
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xa68864, transparent: true, opacity: 0.65, depthWrite: false });
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const r = radius * (0.6 + Math.random() * 0.4);
    const m = new THREE.Mesh(G_FIRE, dustMat.clone());
    m.scale.setScalar(2 + Math.random() * 1.5);
    m.position.set(pos.x + Math.cos(a) * r, 0.4, pos.z + Math.sin(a) * r);
    m.userData.outVel = new THREE.Vector3(Math.cos(a) * 6, 1.2 + Math.random() * 1.0, Math.sin(a) * 6);
    world.scene.add(m);
    puffs.push(m);
  }
  // Use the first puff as the Effect's mesh; tick all in one update.
  return new Effect(puffs[0], 1.1, (dt, t) => {
    for (const m of puffs) {
      m.position.addScaledVector(m.userData.outVel, dt);
      m.userData.outVel.y -= 4 * dt;
      m.scale.setScalar((2 + t * 4));
      m.material.opacity = 0.65 * (1 - t);
    }
    if (t >= 1) for (const m of puffs) world.scene.remove(m);
  });
}
