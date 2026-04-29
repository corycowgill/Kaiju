import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cachedFetch } from './assetCache.js';

// Module-level scratch vectors reused by every AI tick to avoid GC churn.
const _aiVA = new THREE.Vector3();
const _aiVB = new THREE.Vector3();
const _aiVC = new THREE.Vector3();
const _aiVD = new THREE.Vector3();

// --------------- GLB enemy templates ---------------
const _glbLoader = new GLTFLoader();
const _templates = { tank: null, tankAnims: [], helicopter: null, artillery: null };

function _cachedGLB(url) {
  return cachedFetch(url).then((buf) =>
    new Promise((resolve, reject) => _glbLoader.parse(buf, '', resolve, reject))
  );
}

/**
 * Load all enemy GLB templates. Call once at startup before spawning enemies.
 * @param {Function} [onProgress] - (loaded, total, label) callback
 */
export async function loadEnemyTemplates(onProgress) {
  const files = [
    { key: 'tank',       url: './assets/enemies/tank.glb' },
    { key: 'tank_a1',    url: './assets/enemies/tank_anim_1.glb' },
    { key: 'tank_a2',    url: './assets/enemies/tank_anim_2.glb' },
    { key: 'tank_a3',    url: './assets/enemies/tank_anim_3.glb' },
    { key: 'helicopter', url: './assets/enemies/helicopter.glb' },
    { key: 'artillery',  url: './assets/enemies/tank.glb' },  // reuse tank model for artillery
  ];
  let loaded = 0;
  const total = files.length;
  for (const { key, url } of files) {
    try {
      const gltf = await _cachedGLB(url);
      const s = gltf.scene;
      s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (key === 'tank') {
        _templates.tank = { scene: s, animations: gltf.animations };
      } else if (key.startsWith('tank_a')) {
        _templates.tankAnims.push(gltf.animations);
      } else if (key === 'helicopter') {
        _templates.helicopter = { scene: s, animations: gltf.animations };
      } else if (key === 'artillery') {
        _templates.artillery = { scene: s, animations: gltf.animations };
      }
    } catch (e) {
      console.warn(`[EnemyGLB] Failed to load ${key}:`, e.message);
    }
    loaded++;
    if (onProgress) onProgress(loaded, total, key);
  }
}

function _cloneTemplate(tpl) {
  if (!tpl) return null;
  return tpl.scene.clone(true);
}

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

    // Use GLB model if loaded, else fall back to simple placeholder
    const tpl = _cloneTemplate(_templates.tank);
    if (tpl) {
      // Scale the GLB to roughly match the old procedural tank (~5 units long)
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      const targetLen = 5.0;
      const s = targetLen / Math.max(size.x, size.y, size.z);
      tpl.scale.setScalar(s);
      // Center on the ground
      box.setFromObject(tpl);
      tpl.position.y = -box.min.y;
      root.add(tpl);
      this._glbModel = tpl;

      // Set up animation mixer if the template has animations
      if (_templates.tank.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(tpl);
        const clip = _templates.tank.animations[0];
        const action = this.mixer.clipAction(clip);
        action.play();
      }
    } else {
      // Minimal fallback box
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 5.0),
        new THREE.MeshStandardMaterial({ color: 0x788055, roughness: 0.85 }));
      body.position.y = 0.6; body.castShadow = true;
      root.add(body);
    }

    // Muzzle point for shooting (front of the tank, barrel height)
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0, 1.5, 3.0);
    root.add(this._muzzle);

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    if (this.mixer) this.mixer.update(dt);
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist < 4.5) { this.die(world); return; }
    if (dist < 0.0001) return;
    _aiVA.divideScalar(dist);

    // Drive: maintain ~60u distance, face movement direction
    let moveX = 0, moveZ = 0;
    if (dist > 80)      { moveX = _aiVA.x;  moveZ = _aiVA.z;  }
    else if (dist < 50) { moveX = -_aiVA.x; moveZ = -_aiVA.z; }
    if (moveX || moveZ) {
      myPos.x += moveX * this.speed * dt;
      myPos.z += moveZ * this.speed * dt;
      this.root.rotation.y = Math.atan2(moveX, moveZ);
    }

    // Always face toward kaiju (turret aim = whole body for GLB)
    this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);

    // Shoot
    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < this.shootRange) {
      this.cooldown = 2.5 + Math.random() * 1.5;
      this._muzzle.getWorldPosition(_aiVB);
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

    const tpl = _cloneTemplate(_templates.helicopter);
    if (tpl) {
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      const targetLen = 6.0;
      const s = targetLen / Math.max(size.x, size.y, size.z);
      tpl.scale.setScalar(s);
      box.setFromObject(tpl);
      tpl.position.y = -box.min.y;
      root.add(tpl);
      this._glbModel = tpl;
    } else {
      // Minimal fallback
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x7a8a66, roughness: 0.55, metalness: 0.3 }));
      body.scale.set(1.0, 0.9, 1.6); body.castShadow = true;
      root.add(body);
      const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.3), dark);
      rotor.position.y = 1.4; root.add(rotor);
      const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2; rotor.add(rotor2);
      this.rotor = rotor;
      this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.15), dark);
      this.tailRotor.position.set(0.3, 0.4, -3.9); root.add(this.tailRotor);
    }

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.set(kaijuPos.x, this.altitude, kaijuPos.z).sub(myPos);
    const dist = _aiVA.length();

    if (dist > 0.001) {
      _aiVA.divideScalar(dist);
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

    // Spin rotors (fallback only — GLB model is static)
    if (this.rotor) this.rotor.rotation.y += dt * 30;
    if (this.tailRotor) this.tailRotor.rotation.x += dt * 40;

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
    this.hp = 220;
    this.maxHp = 220;
    this.dead = false;
    // Heavy armour - footstep trample only chips them. Forces the player
    // to actually aim a beam / roar / charge instead of jogging through.
    this.armored = true;
    this.cooldown = 2.0 + Math.random();
    this.speed = 5.0;
    this.legPhase = 0;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    // Brighter steel-blue armour + strong red accent so the mech is
    // unmissable against the dusk-Tokyo backdrop.
    const armorMat  = new THREE.MeshStandardMaterial({ color: 0x6b7e94, roughness: 0.45, metalness: 0.55 });
    const armorDark = new THREE.MeshStandardMaterial({ color: 0x3a4856, roughness: 0.65, metalness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff2200, emissiveIntensity: 1.4 });
    const eyeMat    = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 2.4 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffd11a, emissive: 0xffaa11, emissiveIntensity: 0.6 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.5, 2.4), armorMat);
    torso.position.y = 6.0;
    torso.castShadow = true;
    root.add(torso);
    this.torso = torso;
    // Chest beacon (glowing core)
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14), accentMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 6.0, 1.25);
    root.add(core);
    // Yellow hazard stripes wrapping the torso
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.32, 2.45), stripeMat);
    stripe.position.set(0, 4.6, 0);
    root.add(stripe);

    // Head/sensor block above the torso (more menacing than a sphere)
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), armorMat);
    head.position.set(0, 8.0, 0);
    root.add(head);
    // Glowing eye visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.08), eyeMat);
    visor.position.set(0, 8.05, 0.62);
    root.add(visor);

    // Pauldron / shoulder spikes for menace
    for (const sx of [-1, 1]) {
      const pauld = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), armorDark);
      pauld.position.set(sx * 1.85, 7.4, 0);
      pauld.scale.set(1, 0.9, 1);
      root.add(pauld);
      // Single small spike on the pauldron
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 5), armorDark);
      spike.position.set(sx * 1.85, 8.05, 0);
      spike.rotation.z = sx * 0.25;
      root.add(spike);
    }

    // Cannon arms (now with shoulder elbow + barrel detail)
    function makeArm(sx) {
      const arm = new THREE.Group();
      // Upper arm cylinder
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.6, 10), armorMat);
      upper.position.y = -0.8;
      arm.add(upper);
      // Elbow joint sphere
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), armorDark);
      elbow.position.y = -1.6;
      arm.add(elbow);
      // Forearm cannon
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2.4, 10), armorMat);
      fore.position.y = -2.8;
      arm.add(fore);
      // Cannon barrel sticking out the front
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.6, 10), armorDark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, -3.0, 1.1);
      arm.add(barrel);
      // Muzzle brake
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 10), armorDark);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, -3.0, 2.0);
      arm.add(muzzle);
      // Mini emissive port on the muzzle
      const port = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), accentMat);
      port.position.set(0, -3.0, 2.18);
      arm.add(port);
      arm.position.set(sx * 2.0, 7.4, 0);
      return arm;
    }
    const armL = makeArm(-1); root.add(armL); this.armL = armL;
    const armR = makeArm( 1); root.add(armR); this.armR = armR;

    // Legs (now with knee joint + foot)
    function makeLeg(sx) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 1.2), armorMat);
      thigh.position.y = -1.0;
      leg.add(thigh);
      // Knee armour pad
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), armorDark);
      knee.position.y = -2.0;
      knee.scale.set(1.1, 0.7, 1.0);
      leg.add(knee);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.8, 1.1), armorMat);
      shin.position.y = -2.95;
      leg.add(shin);
      // Foot pad
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.8), armorDark);
      foot.position.y = -3.95;
      foot.position.z = 0.2;
      leg.add(foot);
      // Toe spike
      const toe = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), armorDark);
      toe.rotation.x = Math.PI / 2;
      toe.position.set(0, -3.95, 1.2);
      leg.add(toe);
      leg.position.set(sx * 1.0, 4.2, 0);
      return leg;
    }
    const legL = makeLeg(-1); root.add(legL); this.legL = legL;
    const legR = makeLeg( 1); root.add(legR); this.legR = legR;
    // Make sure castShadow flag propagates
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist < 5) { this.die(world); return; } // crushed under kaiju foot
    if (dist > 0.001) {
      _aiVA.divideScalar(dist);
      let dx = 0, dz = 0;
      if (dist > 50)      { dx = _aiVA.x;  dz = _aiVA.z;  }
      else if (dist < 35) { dx = -_aiVA.x; dz = -_aiVA.z; }
      if (dx || dz) {
        myPos.x += dx * this.speed * dt;
        myPos.z += dz * this.speed * dt;
        this.legPhase += dt * 6;
        this.legL.position.y = 4.2 + Math.sin(this.legPhase) * 0.4;
        this.legR.position.y = 4.2 + Math.sin(this.legPhase + Math.PI) * 0.4;
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

    // Use the artillery GLB template (larger, darker tank variant)
    const tpl = _cloneTemplate(_templates.artillery);
    if (tpl) {
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      const targetLen = 6.5; // larger than the regular tank
      const s = targetLen / Math.max(size.x, size.y, size.z);
      tpl.scale.setScalar(s);
      // Darken materials to distinguish from regular tanks
      tpl.traverse((o) => {
        if (o.isMesh && o.material) {
          const m = o.material.clone();
          m.color.multiplyScalar(0.6);
          o.material = m;
        }
      });
      box.setFromObject(tpl);
      tpl.position.y = -box.min.y;
      root.add(tpl);
    } else {
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x383830, roughness: 0.85 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 4.4), baseMat);
      base.position.y = 0.6; base.castShadow = true;
      root.add(base);
    }

    // Muzzle point for firing (front of vehicle, raised)
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0, 2.5, 3.5);
    root.add(this._muzzle);

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    const dx = kaijuPos.x - myPos.x;
    const dz = kaijuPos.z - myPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) { this.die(world); return; }
    // Face toward kaiju
    this.root.rotation.y = Math.atan2(dx, dz);

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 320) {
      this.cooldown = 4.5 + Math.random() * 1.5;
      const tx = kaijuPos.x + (Math.random() - 0.5) * 14;
      const tz = kaijuPos.z + (Math.random() - 0.5) * 14;
      this._muzzle.getWorldPosition(_aiVB);
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

    const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x6a7a40, roughness: 0.95 }); // brighter olive
    const skinMat   = new THREE.MeshStandardMaterial({ color: 0xeac199 });
    const dark      = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const vestMat   = new THREE.MeshStandardMaterial({ color: 0xffd11a, emissive: 0xffaa11, emissiveIntensity: 0.55 });
    const beltMat   = new THREE.MeshStandardMaterial({ color: 0x3a3320, roughness: 0.9 });
    const muzzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.6 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), bodyMat);
    torso.position.y = 1.4;
    root.add(torso);
    // Hi-vis tactical vest -- big visibility win
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.65, 0.55), vestMat);
    vest.position.y = 1.45;
    root.add(vest);
    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.55), beltMat);
    belt.position.y = 1.05;
    root.add(belt);
    // Backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), beltMat);
    pack.position.set(0, 1.5, -0.36);
    root.add(pack);
    // Pack reflective stripe
    const reflect = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.05), vestMat);
    reflect.position.set(0, 1.45, -0.52);
    root.add(reflect);

    // Head + helmet (slightly larger helmet, with chinstrap line)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), skinMat);
    head.position.y = 2.1;
    root.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10, 0, Math.PI*2, 0, Math.PI/2), bodyMat);
    helmet.position.y = 2.16;
    root.add(helmet);
    // Helmet front strip (NV mount stub)
    const nvm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.06), beltMat);
    nvm.position.set(0, 2.34, 0.32);
    root.add(nvm);

    // Arms (simple cylinders)
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.85, 6), bodyMat);
      arm.position.set(sx * 0.45, 1.4, 0);
      arm.rotation.z = sx * -0.05;
      root.add(arm);
    }

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.3), bodyMat);
    legL.position.set(-0.18, 0.5, 0); root.add(legL);
    const legR = legL.clone(); legR.position.x = 0.18; root.add(legR);
    this.legL = legL; this.legR = legR;
    // Boots
    for (const sx of [-0.18, 0.18]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.4), dark);
      boot.position.set(sx, 0.04, 0.05);
      root.add(boot);
    }

    // Rifle: barrel + body + stock + sight (much more recognisable)
    const rifle = new THREE.Group();
    const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), dark);
    rifleBody.position.z = 0.05;
    rifle.add(rifleBody);
    const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 6), muzzleMat);
    rifleBarrel.rotation.x = Math.PI / 2;
    rifleBarrel.position.z = 0.55;
    rifle.add(rifleBarrel);
    const rifleStock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.3), beltMat);
    rifleStock.position.z = -0.25;
    rifle.add(rifleStock);
    const rifleSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.18), dark);
    rifleSight.position.set(0, 0.12, 0.02);
    rifle.add(rifleSight);
    rifle.position.set(0.3, 1.4, 0.2);
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
    this.hp = 1500;
    this.maxHp = 1500;
    this.dead = false;
    // Boss is heavily armoured - trample stomps barely scratch the
    // paint. Player has to use proper attacks to kill it.
    this.armored = true;
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

