import * as THREE from 'three';

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
    const toKaiju = new THREE.Vector3().subVectors(kaijuPos, myPos);
    toKaiju.y = 0;
    const dist = toKaiju.length();
    if (dist < 0.0001) return;
    toKaiju.normalize();

    // Drive: maintain ~60u distance
    let moveDir = new THREE.Vector3();
    if (dist > 80) moveDir.copy(toKaiju);
    else if (dist < 50) moveDir.copy(toKaiju).multiplyScalar(-1);
    if (moveDir.lengthSq() > 0) {
      myPos.x += moveDir.x * this.speed * dt;
      myPos.z += moveDir.z * this.speed * dt;
      this.root.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    }

    // Aim turret at kaiju
    const aimAngle = Math.atan2(toKaiju.x, toKaiju.z);
    this.turret.rotation.y = aimAngle - this.root.rotation.y;
    // Slight elevation for distance
    this.barrel.rotation.x = THREE.MathUtils.clamp(-(dist / 200), -0.3, 0);

    // Shoot
    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < this.shootRange) {
      this.cooldown = 2.5 + Math.random() * 1.5;
      const muzzleWorld = new THREE.Vector3();
      this.barrel.getWorldPosition(muzzleWorld);
      const dir = new THREE.Vector3().subVectors(kaijuPos.clone().setY(kaijuPos.y * 0.5 + 6), muzzleWorld).normalize();
      world.spawnShell(muzzleWorld, dir, 'tank');
      world.spawnMuzzleFlash(muzzleWorld, 0.5);
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
    const toKaiju = new THREE.Vector3().subVectors(kaijuPos.clone().setY(this.altitude), myPos);
    const dist = toKaiju.length();

    // Orbit at ~70 distance
    if (dist > 0.001) {
      toKaiju.normalize();
      const tangent = new THREE.Vector3(-toKaiju.z, 0, toKaiju.x);
      const desired = new THREE.Vector3();
      if (dist > 90) desired.copy(toKaiju);
      else if (dist < 60) desired.copy(toKaiju).multiplyScalar(-1);
      desired.add(tangent.multiplyScalar(0.6));
      desired.normalize();
      myPos.x += desired.x * this.speed * dt;
      myPos.z += desired.z * this.speed * dt;
      myPos.y = this.altitude + Math.sin(world.time * 1.5 + myPos.x) * 0.4;
      this.root.rotation.y = Math.atan2(desired.x, desired.z);
      this.root.rotation.z = -desired.x * 0.15;
    }

    this.rotor.rotation.y += dt * 30;
    this.tailRotor.rotation.x += dt * 40;

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 130) {
      this.cooldown = 1.4 + Math.random() * 0.6;
      const dir = new THREE.Vector3().subVectors(kaijuPos.clone().setY(kaijuPos.y * 0.5 + 8), myPos).normalize();
      world.spawnShell(myPos.clone(), dir, 'heli');
      world.spawnMuzzleFlash(myPos.clone(), 0.3);
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
    const toKaiju = new THREE.Vector3().subVectors(kaijuPos, myPos); toKaiju.y = 0;
    const dist = toKaiju.length();
    if (dist > 0.001) {
      toKaiju.normalize();
      let moveDir = new THREE.Vector3();
      if (dist > 50) moveDir.copy(toKaiju);
      else if (dist < 35) moveDir.copy(toKaiju).multiplyScalar(-1);
      if (moveDir.lengthSq() > 0) {
        myPos.x += moveDir.x * this.speed * dt;
        myPos.z += moveDir.z * this.speed * dt;
        this.legPhase += dt * 6;
        this.legL.position.y = 2.0 + Math.sin(this.legPhase) * 0.3;
        this.legR.position.y = 2.0 + Math.sin(this.legPhase + Math.PI) * 0.3;
      }
      this.root.rotation.y = Math.atan2(toKaiju.x, toKaiju.z);
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 110) {
      this.cooldown = 1.8 + Math.random() * 0.6;
      // Fire from both arms
      [this.armL, this.armR].forEach((arm) => {
        const wp = new THREE.Vector3();
        arm.getWorldPosition(wp);
        const dir = new THREE.Vector3().subVectors(kaijuPos.clone().setY(kaijuPos.y * 0.5 + 8), wp).normalize();
        world.spawnShell(wp, dir, 'mech');
        world.spawnMuzzleFlash(wp, 0.4);
      });
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
