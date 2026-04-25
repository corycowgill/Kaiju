import * as THREE from 'three';

// Module-level scratch vectors reused by every AI tick to avoid GC churn.
const _aiVA = new THREE.Vector3();
const _aiVB = new THREE.Vector3();
const _aiVC = new THREE.Vector3();
const _aiVD = new THREE.Vector3();

// Military units. Each has hp, type, mesh, ai().

export class Tank {
  constructor(x, z) {
    this.type = 'tank';
    this.hp = 50;
    this.maxHp = 50;
    this.dead = false;
    this.cooldown = Math.random() * 2;
    this.shootRange = 90;
    this.speed = 6.5;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.85 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1.0 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 5.0), bodyMat);
    hull.position.y = 1.0;
    hull.castShadow = true;
    root.add(hull);

    const trL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 5.4), trackMat);
    trL.position.set(-1.7, 0.35, 0); trL.castShadow = true; root.add(trL);
    const trR = trL.clone(); trR.position.x = 1.7; root.add(trR);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.8, 8), bodyMat);
    turret.position.y = 1.7;
    turret.castShadow = true;
    root.add(turret);
    this.turret = turret;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.0, 8), bodyMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0.0, 1.5);
    turret.add(barrel);
    this.barrel = barrel;

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist < 0.0001) return;
    _aiVA.divideScalar(dist); // normalize without alloc

    // Drive: maintain ~60u distance
    let moveX = 0, moveZ = 0;
    if (dist > 80)      { moveX = _aiVA.x;  moveZ = _aiVA.z;  }
    else if (dist < 50) { moveX = -_aiVA.x; moveZ = -_aiVA.z; }
    if (moveX || moveZ) {
      myPos.x += moveX * this.speed * dt;
      myPos.z += moveZ * this.speed * dt;
      this.root.rotation.y = Math.atan2(moveX, moveZ);
    }

    // Aim turret at kaiju
    const aimAngle = Math.atan2(_aiVA.x, _aiVA.z);
    this.turret.rotation.y = aimAngle - this.root.rotation.y;
    this.barrel.rotation.x = THREE.MathUtils.clamp(-(dist / 200), -0.3, 0);

    // Shoot
    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < this.shootRange) {
      this.cooldown = 2.5 + Math.random() * 1.5;
      this.barrel.getWorldPosition(_aiVB);
      _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 6, kaijuPos.z).sub(_aiVB).normalize();
      world.spawnShell(_aiVB, _aiVC, 'tank');
      world.spawnMuzzleFlash(_aiVB, 0.5);
    }
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(2), 1.0);
    world.shake(0.3, 0.3);
    this.root.parent && this.root.parent.remove(this.root);
    world.onTankKilled?.();
  }
}

export class Helicopter {
  constructor(x, z) {
    this.type = 'heli';
    this.hp = 35;
    this.maxHp = 35;
    this.dead = false;
    this.cooldown = 1.5 + Math.random();
    this.speed = 14;
    this.altitude = 18 + Math.random() * 8;

    const root = new THREE.Group();
    root.position.set(x, this.altitude, z);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x556644, roughness: 0.6, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 10), bodyMat);
    body.scale.set(1.0, 0.9, 1.6);
    body.castShadow = true;
    root.add(body);

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 3.5, 6), bodyMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -2.4;
    root.add(tail);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.5), bodyMat);
    fin.position.set(0, 0.4, -3.9);
    root.add(fin);

    // Main rotor
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.3), dark);
    rotor.position.y = 1.4;
    root.add(rotor);
    const rotor2 = rotor.clone();
    rotor2.rotation.y = Math.PI / 2;
    rotor.add(rotor2);
    this.rotor = rotor;

    // Tail rotor
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.15), dark);
    tailRotor.position.set(0.3, 0.4, -3.9);
    root.add(tailRotor);
    this.tailRotor = tailRotor;

    // Skids
    const skid1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), dark);
    skid1.rotation.x = Math.PI / 2; skid1.position.set(-0.8, -1.2, 0); root.add(skid1);
    const skid2 = skid1.clone(); skid2.position.x = 0.8; root.add(skid2);

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.set(kaijuPos.x, this.altitude, kaijuPos.z).sub(myPos);
    const dist = _aiVA.length();

    if (dist > 0.001) {
      _aiVA.divideScalar(dist);
      // tangent = (-z, 0, x)
      const tx = -_aiVA.z, tz = _aiVA.x;
      let dx, dz;
      if (dist > 90)       { dx = _aiVA.x;  dz = _aiVA.z;  }
      else if (dist < 60)  { dx = -_aiVA.x; dz = -_aiVA.z; }
      else                 { dx = 0; dz = 0; }
      dx += tx * 0.6; dz += tz * 0.6;
      const dlen = Math.hypot(dx, dz) || 1;
      dx /= dlen; dz /= dlen;
      myPos.x += dx * this.speed * dt;
      myPos.z += dz * this.speed * dt;
      myPos.y = this.altitude + Math.sin(world.time * 1.5 + myPos.x) * 0.4;
      this.root.rotation.y = Math.atan2(dx, dz);
      this.root.rotation.z = -dx * 0.15;
    }

    this.rotor.rotation.y += dt * 30;
    this.tailRotor.rotation.x += dt * 40;

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 130) {
      this.cooldown = 1.4 + Math.random() * 0.6;
      _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(myPos).normalize();
      _aiVB.copy(myPos);
      world.spawnShell(_aiVB, _aiVC, 'heli');
      world.spawnMuzzleFlash(_aiVB, 0.3);
    }
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone(), 1.2);
    world.shake(0.4, 0.4);
    this.root.parent && this.root.parent.remove(this.root);
    world.onHeliKilled?.();
  }
}

export class Mech {
  // Mini-mech that walks toward kaiju and shoots missiles - tougher
  constructor(x, z) {
    this.type = 'mech';
    this.hp = 110;
    this.maxHp = 110;
    this.dead = false;
    this.cooldown = 2.0 + Math.random();
    this.speed = 5.0;
    this.legPhase = 0;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const armorMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.5, metalness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff2200, emissiveIntensity: 0.4 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.5, 2.4), armorMat);
    torso.position.y = 6.0;
    torso.castShadow = true;
    root.add(torso);
    this.torso = torso;

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), accentMat);
    cockpit.position.set(0, 6.5, 1.4);
    root.add(cockpit);

    // Cannon arms
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 3.0, 8), armorMat);
    armL.rotation.x = Math.PI / 2;
    armL.position.set(-2.0, 6.2, 1.0);
    root.add(armL);
    this.armL = armL;
    const armR = armL.clone(); armR.position.x = 2.0; root.add(armR);
    this.armR = armR;

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.0, 1.2), armorMat);
    legL.position.set(-1.0, 2.0, 0); legL.castShadow = true; root.add(legL);
    const legR = legL.clone(); legR.position.x = 1.0; root.add(legR);
    this.legL = legL; this.legR = legR;

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist > 0.001) {
      _aiVA.divideScalar(dist);
      let dx = 0, dz = 0;
      if (dist > 50)      { dx = _aiVA.x;  dz = _aiVA.z;  }
      else if (dist < 35) { dx = -_aiVA.x; dz = -_aiVA.z; }
      if (dx || dz) {
        myPos.x += dx * this.speed * dt;
        myPos.z += dz * this.speed * dt;
        this.legPhase += dt * 6;
        this.legL.position.y = 2.0 + Math.sin(this.legPhase) * 0.3;
        this.legR.position.y = 2.0 + Math.sin(this.legPhase + Math.PI) * 0.3;
      }
      this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 110) {
      this.cooldown = 1.8 + Math.random() * 0.6;
      const arms = [this.armL, this.armR];
      for (let i = 0; i < arms.length; i++) {
        arms[i].getWorldPosition(_aiVB);
        _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(_aiVB).normalize();
        world.spawnShell(_aiVB, _aiVC, 'mech');
        world.spawnMuzzleFlash(_aiVB, 0.4);
      }
    }
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(4), 1.6);
    world.shake(0.6, 0.4);
    this.root.parent && this.root.parent.remove(this.root);
    world.onMechKilled?.();
  }
}

// -------------------------- Jet fighter --------------------------
// Fast, high altitude, makes strafing passes with rockets, then banks away.
export class Jet {
  constructor(x, z) {
    this.type = 'jet';
    this.hp = 55;
    this.maxHp = 55;
    this.dead = false;
    this.altitude = 38 + Math.random() * 8;
    this.speed = 65;
    this.cooldown = 1.0 + Math.random();
    this.passDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    this.state = 'approach'; // approach -> strafe -> egress
    this.egressTimer = 0;

    const root = new THREE.Group();
    root.position.set(x, this.altitude, z);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7080, roughness: 0.3, metalness: 0.6 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 6.0, 8), bodyMat);
    fuselage.rotation.x = Math.PI / 2;
    root.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 3.5;
    root.add(nose);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.18, 1.6), bodyMat);
    wings.position.z = 0.0;
    root.add(wings);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.9), bodyMat);
    tail.position.set(0, 0.0, -2.6);
    root.add(tail);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.9), bodyMat);
    fin.position.set(0, 0.5, -2.6);
    root.add(fin);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), accentMat);
    cockpit.position.set(0, 0.4, 1.2);
    cockpit.scale.set(1, 0.6, 1.4);
    root.add(cockpit);

    // Afterburner glow
    const burner = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), glowMat);
    burner.rotation.x = -Math.PI / 2;
    burner.position.z = -3.4;
    root.add(burner);
    this.burner = burner;

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.set(kaijuPos.x, this.altitude, kaijuPos.z).sub(myPos);
    const dist2D = Math.hypot(_aiVA.x, _aiVA.z);

    if (this.state === 'approach') {
      const len = _aiVA.length() || 1;
      this.passDir.copy(_aiVA).divideScalar(len);
      myPos.addScaledVector(this.passDir, this.speed * dt);
      if (dist2D < 70) this.state = 'strafe';
    } else if (this.state === 'strafe') {
      myPos.addScaledVector(this.passDir, this.speed * dt);
      this.cooldown -= dt;
      if (this.cooldown <= 0 && dist2D < 100) {
        this.cooldown = 0.4;
        _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(myPos).normalize();
        _aiVB.copy(myPos);
        world.spawnShell(_aiVB, _aiVC, 'jet');
        world.spawnMuzzleFlash(_aiVB, 0.4);
      }
      if (dist2D > 90) { this.state = 'egress'; this.egressTimer = 2.5; }
    } else {
      myPos.addScaledVector(this.passDir, this.speed * dt);
      this.egressTimer -= dt;
      if (this.egressTimer <= 0) {
        this.state = 'approach';
        const a = Math.random() * Math.PI * 2;
        myPos.set(kaijuPos.x + Math.cos(a) * 220, this.altitude, kaijuPos.z + Math.sin(a) * 220);
      }
    }

    // Orient: in approach we'd want re-normalized toward target, otherwise passDir
    let fx = this.passDir.x, fz = this.passDir.z;
    if (this.state === 'approach') {
      const len = Math.hypot(_aiVA.x, _aiVA.z) || 1;
      fx = _aiVA.x / len; fz = _aiVA.z / len;
    }
    this.root.rotation.y = Math.atan2(fx, fz);
    this.root.rotation.z = Math.sin(world.time * 4 + myPos.x) * 0.15;
    this.burner.scale.set(1, 1 + Math.random() * 0.4, 1);
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone(), 1.4);
    world.shake(0.5, 0.4);
    this.root.parent && this.root.parent.remove(this.root);
    world.onJetKilled?.();
  }
}

// -------------------------- Artillery --------------------------
// Stationary far-range. Lobs shells in arcs with a ground marker.
export class Artillery {
  constructor(x, z) {
    this.type = 'artillery';
    this.hp = 70;
    this.maxHp = 70;
    this.dead = false;
    this.cooldown = 2.5 + Math.random() * 2;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x383830, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 4.4), baseMat);
    base.position.y = 0.6;
    base.castShadow = true;
    root.add(base);

    const tracksL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 5.2), dark);
    tracksL.position.set(-2.0, 0.35, 0); root.add(tracksL);
    const tracksR = tracksL.clone(); tracksR.position.x = 2.0; root.add(tracksR);

    const turret = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 3.0), baseMat);
    turret.position.y = 1.8;
    turret.castShadow = true;
    root.add(turret);
    this.turret = turret;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5.0, 8), baseMat);
    barrel.position.set(0, 1.0, 2.2);
    barrel.rotation.x = -0.5; // raised
    turret.add(barrel);
    this.barrel = barrel;

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    const dx = kaijuPos.x - myPos.x;
    const dz = kaijuPos.z - myPos.z;
    const dist = Math.hypot(dx, dz);
    this.turret.rotation.y = Math.atan2(dx, dz);

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 320) {
      this.cooldown = 4.5 + Math.random() * 1.5;
      const tx = kaijuPos.x + (Math.random() - 0.5) * 14;
      const tz = kaijuPos.z + (Math.random() - 0.5) * 14;
      this.barrel.getWorldPosition(_aiVB);
      _aiVC.set(tx, 0, tz);
      world.spawnArtilleryShell?.(_aiVB, _aiVC);
      world.spawnMuzzleFlash(_aiVB, 0.8);
      world.shake(0.2, 0.2);
    }
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(2), 1.3);
    world.shake(0.4, 0.3);
    this.root.parent && this.root.parent.remove(this.root);
    world.onArtilleryKilled?.();
  }
}

// -------------------------- Infantry / Soldier --------------------------
// Tiny, fragile, swarming ground unit. Spawned in groups of 4-6.
export class Soldier {
  constructor(x, z) {
    this.type = 'soldier';
    this.hp = 8;
    this.maxHp = 8;
    this.dead = false;
    this.cooldown = 0.5 + Math.random();
    this.speed = 9.0;
    this.walkPhase = Math.random() * Math.PI * 2;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x556633, roughness: 0.95 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xddbb99 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), bodyMat);
    torso.position.y = 1.4;
    root.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), skinMat);
    head.position.y = 2.1;
    root.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8, 0, Math.PI*2, 0, Math.PI/2), bodyMat);
    helmet.position.y = 2.18;
    root.add(helmet);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.3), bodyMat);
    legL.position.set(-0.18, 0.5, 0); root.add(legL);
    const legR = legL.clone(); legR.position.x = 0.18; root.add(legR);
    this.legL = legL; this.legR = legR;

    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), dark);
    rifle.position.set(0.3, 1.4, 0.4);
    root.add(rifle);
    this.rifle = rifle;

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist > 0.001) _aiVA.divideScalar(dist);

    if (dist > 30) {
      myPos.x += _aiVA.x * this.speed * dt;
      myPos.z += _aiVA.z * this.speed * dt;
      this.walkPhase += dt * 10;
      this.legL.rotation.x = Math.sin(this.walkPhase) * 0.6;
      this.legR.rotation.x = -Math.sin(this.walkPhase) * 0.6;
    } else {
      this.legL.rotation.x = 0; this.legR.rotation.x = 0;
    }
    this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 60) {
      this.cooldown = 0.7 + Math.random() * 0.4;
      this.rifle.getWorldPosition(_aiVB);
      _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(_aiVB).normalize();
      world.spawnShell(_aiVB, _aiVC, 'rifle');
      world.spawnMuzzleFlash(_aiVB, 0.2);
    }

    if (dist < 4) {
      this.damage(999, world);
      world.shake(0.05, 0.1);
    }
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnSparks(this.root.position.clone().setY(1), 4);
    this.root.parent && this.root.parent.remove(this.root);
    world.onSoldierKilled?.();
  }
}

// -------------------------- Boss Mech --------------------------
// Massive boss enemy that appears every few waves.
export class BossMech {
  constructor(x, z) {
    this.type = 'boss';
    this.hp = 600;
    this.maxHp = 600;
    this.dead = false;
    this.cooldown = 3.0;
    this.specialCooldown = 8.0;
    this.speed = 4.5;
    this.legPhase = 0;
    this.scale = 1.6;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const armor = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.4, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(6.0, 6.0, 4.0), armor);
    torso.position.y = 11.0;
    torso.castShadow = true;
    root.add(torso);
    this.torso = torso;

    const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 2.4), armor);
    head.position.y = 15.5;
    root.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.3), accent);
    eye.position.set(0, 15.6, 1.3);
    root.add(eye);
    this.eye = eye;

    // Cannons (shoulder-mounted)
    function makeCannon(side) {
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 4.0, 10), armor);
      c.rotation.x = Math.PI / 2;
      c.position.z = 1.2;
      g.add(c);
      g.position.set(side * 4.0, 12.5, 0);
      return g;
    }
    this.cannonL = makeCannon(-1); root.add(this.cannonL);
    this.cannonR = makeCannon(1); root.add(this.cannonR);

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.0, 1.4), armor);
    armL.position.set(-4.2, 9.5, 0); armL.castShadow = true; root.add(armL);
    const armR = armL.clone(); armR.position.x = 4.2; root.add(armR);
    this.armL = armL; this.armR = armR;

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7.0, 2.2), armor);
    legL.position.set(-1.6, 4.0, 0); legL.castShadow = true; root.add(legL);
    const legR = legL.clone(); legR.position.x = 1.6; root.add(legR);
    this.legL = legL; this.legR = legR;

    // Glowing core
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 12), accent);
    core.position.set(0, 11.5, 2.0);
    root.add(core);

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist > 0.001) _aiVA.divideScalar(dist);

    if (dist > 30) {
      myPos.x += _aiVA.x * this.speed * dt;
      myPos.z += _aiVA.z * this.speed * dt;
      this.legPhase += dt * 4;
      this.legL.position.y = 4.0 + Math.sin(this.legPhase) * 0.5;
      this.legR.position.y = 4.0 + Math.sin(this.legPhase + Math.PI) * 0.5;
    } else {
      this.legL.position.y = 4.0; this.legR.position.y = 4.0;
    }
    this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);

    this.eye.material.emissiveIntensity = 0.5 + Math.sin(world.time * 4) * 0.3;

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 160) {
      this.cooldown = 1.2;
      const cannons = [this.cannonL, this.cannonR];
      for (let i = 0; i < cannons.length; i++) {
        cannons[i].getWorldPosition(_aiVB);
        _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(_aiVB).normalize();
        world.spawnShell(_aiVB, _aiVC, 'boss');
        world.spawnMuzzleFlash(_aiVB, 0.6);
      }
    }

    // Special: ground-pound shockwave (radial AOE) at close range
    this.specialCooldown -= dt;
    if (this.specialCooldown <= 0 && dist < 70) {
      this.specialCooldown = 9 + Math.random() * 3;
      world.spawnShockwave(myPos.clone(), 0xff3333, 60);
      world.shake(1.0, 0.6);
      // Telegraph: immediate damage circle (player should kite)
      const dx = kaijuPos.x - myPos.x;
      const dz = kaijuPos.z - myPos.z;
      if (dx * dx + dz * dz < 60 * 60) world.onBossSlam?.();
    }
  }

  damage(amount, world) {
    this.hp -= amount;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    // Multi-stage death
    world.spawnExplosion(this.root.position.clone().setY(8), 2.5);
    world.spawnExplosion(this.root.position.clone().setY(12), 2.0);
    world.shake(1.5, 1.0);
    this.root.parent && this.root.parent.remove(this.root);
    world.onBossKilled?.();
  }
}

