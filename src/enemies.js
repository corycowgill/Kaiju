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
const _templates = {
  tank: null, tankAnims: [], helicopter: null, artillery: null,
  soldier: null, soldierAnims: {},
  mech: null, mechAnims: {},
};

function _cachedGLB(url) {
  return cachedFetch(url).then((buf) =>
    new Promise((resolve, reject) => _glbLoader.parse(buf, '', resolve, reject))
  );
}

// Animated biped model config: base file is Running.glb (contains skinned mesh),
// additional files provide extra animation clips.
const SOLDIER_BASE = './assets/enemies/soldier/';
const SOLDIER_ANIMS = {
  run:          'Running.glb',
  walk:         'Walking.glb',
  rifleCharge:  'Rifle_Charge.glb',
  runAndShoot:  'Run_and_Shoot.glb',
};

const MECH_BASE = './assets/enemies/mech/';
const MECH_ANIMS = {
  run:       'Running.glb',
  idle:      'Alert.glb',
  walk:      'Walking.glb',
  quickWalk: 'Quick_Walk.glb',
  runFast:   'run_fast_3_inplace.glb',
  attack:    'Skill_01.glb',
};

/**
 * Load a biped GLB set: base model (Running) + additional animation files.
 * Returns { scene, animations: { name: AnimationClip } }
 */
async function _loadBipedSet(basePath, animFiles, label, onProgress, startIdx, total) {
  const animNames = Object.keys(animFiles);
  let scene = null;
  const animations = {};
  let idx = startIdx;

  // Load base model first (Running.glb — contains the skinned mesh)
  try {
    const gltf = await _cachedGLB(basePath + animFiles.run);
    scene = gltf.scene;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (gltf.animations.length > 0) animations.run = gltf.animations[0];
  } catch (e) {
    console.warn(`[EnemyGLB] Failed to load ${label} base:`, e.message);
  }
  idx++;
  if (onProgress) onProgress(idx, total, label + ' base');

  // Load remaining animation files
  for (const name of animNames) {
    if (name === 'run') continue; // already loaded
    try {
      const gltf = await _cachedGLB(basePath + animFiles[name]);
      if (gltf.animations.length > 0) animations[name] = gltf.animations[0];
    } catch (e) {
      console.warn(`[EnemyGLB] Failed to load ${label} ${name}:`, e.message);
    }
    idx++;
    if (onProgress) onProgress(idx, total, label + ' ' + name);
  }

  return { scene, animations, nextIdx: idx };
}

/**
 * Load all enemy GLB templates. Call once at startup before spawning enemies.
 * @param {Function} [onProgress] - (loaded, total, label) callback
 */
export async function loadEnemyTemplates(onProgress) {
  // Static models (tank, heli, artillery)
  const staticFiles = [
    { key: 'tank',       url: './assets/enemies/tank.glb' },
    { key: 'tank_a1',    url: './assets/enemies/tank_anim_1.glb' },
    { key: 'tank_a2',    url: './assets/enemies/tank_anim_2.glb' },
    { key: 'tank_a3',    url: './assets/enemies/tank_anim_3.glb' },
    { key: 'helicopter', url: './assets/enemies/helicopter.glb' },
    { key: 'artillery',  url: './assets/enemies/tank.glb' },
  ];
  const soldierAnimCount = Object.keys(SOLDIER_ANIMS).length;
  const mechAnimCount = Object.keys(MECH_ANIMS).length;
  const total = staticFiles.length + soldierAnimCount + mechAnimCount;
  let loaded = 0;

  // Load static models
  for (const { key, url } of staticFiles) {
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

  // Load soldier biped
  const soldierResult = await _loadBipedSet(SOLDIER_BASE, SOLDIER_ANIMS, 'soldier', onProgress, loaded, total);
  if (soldierResult.scene) {
    _templates.soldier = { scene: soldierResult.scene, animations: soldierResult.animations };
  }
  loaded = soldierResult.nextIdx;

  // Load mech biped
  const mechResult = await _loadBipedSet(MECH_BASE, MECH_ANIMS, 'mech', onProgress, loaded, total);
  if (mechResult.scene) {
    _templates.mech = { scene: mechResult.scene, animations: mechResult.animations };
  }
  loaded = mechResult.nextIdx;
}

function _cloneTemplate(tpl) {
  if (!tpl) return null;
  return tpl.scene.clone(true);
}

/** Clone a biped template and set up an AnimationMixer with all its clips. */
function _cloneBiped(tpl) {
  if (!tpl) return null;
  const clone = tpl.scene.clone(true);
  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const [name, clip] of Object.entries(tpl.animations)) {
    actions[name] = mixer.clipAction(clip);
  }
  return { root: clone, mixer, actions };
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
      // Rotate inner model so its visual front aligns with +Z
      tpl.rotation.y = Math.PI;
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

    // Drive: maintain ~60u distance
    let moveX = 0, moveZ = 0;
    if (dist > 80)      { moveX = _aiVA.x;  moveZ = _aiVA.z;  }
    else if (dist < 50) { moveX = -_aiVA.x; moveZ = -_aiVA.z; }
    if (moveX || moveZ) {
      myPos.x += moveX * this.speed * dt;
      myPos.z += moveZ * this.speed * dt;
    }

    // Always face toward kaiju
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
      // Align visual front with +Z
      tpl.rotation.y = Math.PI;
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
    this.armored = true;
    this.cooldown = 2.0 + Math.random();
    this.speed = 5.0;
    this._currentAnim = '';

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const biped = _cloneBiped(_templates.mech);
    if (biped) {
      const box = new THREE.Box3().setFromObject(biped.root);
      const size = box.getSize(new THREE.Vector3());
      const targetH = 9.0; // tall mech
      const s = targetH / size.y;
      biped.root.scale.setScalar(s);
      box.setFromObject(biped.root);
      biped.root.position.y = -box.min.y;
      biped.root.rotation.y = Math.PI; // align front with +Z
      root.add(biped.root);
      this.mixer = biped.mixer;
      this._actions = biped.actions;
      // Start with walk
      if (biped.actions.walk) { biped.actions.walk.play(); this._currentAnim = 'walk'; }
      else if (biped.actions.run) { biped.actions.run.play(); this._currentAnim = 'run'; }
    } else {
      // Minimal fallback
      const armor = new THREE.MeshStandardMaterial({ color: 0x6b7e94, roughness: 0.45, metalness: 0.55 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.5, 2.4), armor);
      torso.position.y = 6.0; torso.castShadow = true; root.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), armor);
      head.position.set(0, 8.0, 0); root.add(head);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.0, 1.2), armor);
      legL.position.set(-1.0, 2.0, 0); root.add(legL);
      const legR = legL.clone(); legR.position.x = 1.0; root.add(legR);
      this.legL = legL; this.legR = legR;
      this.legPhase = 0;
    }

    // Muzzle point for shooting
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0, 5.0, 2.0);
    root.add(this._muzzle);

    this.root = root;
  }

  _playAnim(name) {
    if (!this._actions || this._currentAnim === name || !this._actions[name]) return;
    if (this._actions[this._currentAnim]) this._actions[this._currentAnim].fadeOut(0.2);
    this._actions[name].reset().fadeIn(0.2).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    if (this.mixer) this.mixer.update(dt);
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist < 5) { this.die(world); return; }
    if (dist > 0.001) {
      _aiVA.divideScalar(dist);
      let dx = 0, dz = 0;
      if (dist > 50)      { dx = _aiVA.x;  dz = _aiVA.z;  }
      else if (dist < 35) { dx = -_aiVA.x; dz = -_aiVA.z; }
      if (dx || dz) {
        myPos.x += dx * this.speed * dt;
        myPos.z += dz * this.speed * dt;
        // Animate walk vs run based on distance
        if (this._actions) {
          this._playAnim(dist > 70 ? 'run' : 'walk');
        } else if (this.legL) {
          this.legPhase = (this.legPhase || 0) + dt * 6;
          this.legL.position.y = 2.0 + Math.sin(this.legPhase) * 0.4;
          this.legR.position.y = 2.0 + Math.sin(this.legPhase + Math.PI) * 0.4;
        }
      } else {
        if (this._actions) this._playAnim('idle');
      }
      this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 110) {
      this.cooldown = 1.8 + Math.random() * 0.6;
      if (this._actions) this._playAnim('attack');
      this._muzzle.getWorldPosition(_aiVB);
      _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(_aiVB).normalize();
      world.spawnShell(_aiVB, _aiVC, 'mech');
      world.spawnMuzzleFlash(_aiVB, 0.4);
      // Fire from both sides
      _aiVB.x += 2; // offset for second shot
      world.spawnShell(_aiVB, _aiVC, 'mech');
      world.spawnMuzzleFlash(_aiVB, 0.4);
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
      // Align visual front with +Z
      tpl.rotation.y = Math.PI;
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
    this._currentAnim = '';

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const biped = _cloneBiped(_templates.soldier);
    if (biped) {
      const box = new THREE.Box3().setFromObject(biped.root);
      const size = box.getSize(new THREE.Vector3());
      const targetH = 2.0; // human-sized soldier
      const s = targetH / size.y;
      biped.root.scale.setScalar(s);
      box.setFromObject(biped.root);
      biped.root.position.y = -box.min.y;
      biped.root.rotation.y = Math.PI; // align front with +Z
      root.add(biped.root);
      this.mixer = biped.mixer;
      this._actions = biped.actions;
      // Start running
      if (biped.actions.run) { biped.actions.run.play(); this._currentAnim = 'run'; }
    } else {
      // Minimal fallback
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7a40, roughness: 0.95 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), bodyMat);
      torso.position.y = 1.4; root.add(torso);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.3), bodyMat);
      legL.position.set(-0.18, 0.5, 0); root.add(legL);
      const legR = legL.clone(); legR.position.x = 0.18; root.add(legR);
      this.legL = legL; this.legR = legR;
      this.walkPhase = Math.random() * Math.PI * 2;
    }

    // Muzzle point for shooting
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0.3, 1.4, 0.8);
    root.add(this._muzzle);

    this.root = root;
  }

  _playAnim(name) {
    if (!this._actions || this._currentAnim === name || !this._actions[name]) return;
    if (this._actions[this._currentAnim]) this._actions[this._currentAnim].fadeOut(0.15);
    this._actions[name].reset().fadeIn(0.15).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    if (this.mixer) this.mixer.update(dt);
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist > 0.001) _aiVA.divideScalar(dist);

    if (dist > 30) {
      myPos.x += _aiVA.x * this.speed * dt;
      myPos.z += _aiVA.z * this.speed * dt;
      if (this._actions) {
        this._playAnim('run');
      } else if (this.legL) {
        this.walkPhase += dt * 10;
        this.legL.rotation.x = Math.sin(this.walkPhase) * 0.6;
        this.legR.rotation.x = -Math.sin(this.walkPhase) * 0.6;
      }
    } else {
      // In range — run-and-shoot or stand and fire
      if (this._actions) {
        this._playAnim(this._actions.runAndShoot ? 'runAndShoot' : 'rifleCharge');
      } else if (this.legL) {
        this.legL.rotation.x = 0; this.legR.rotation.x = 0;
      }
    }
    this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 60) {
      this.cooldown = 0.7 + Math.random() * 0.4;
      this._muzzle.getWorldPosition(_aiVB);
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
    this.armored = true;
    this.cooldown = 3.0;
    this.specialCooldown = 8.0;
    this.speed = 4.5;
    this._currentAnim = '';

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    // Use the same mech GLB but scaled up massively for the boss
    const biped = _cloneBiped(_templates.mech);
    if (biped) {
      const box = new THREE.Box3().setFromObject(biped.root);
      const size = box.getSize(new THREE.Vector3());
      const targetH = 16.0; // massive boss
      const s = targetH / size.y;
      biped.root.scale.setScalar(s);
      // Tint red/dark to distinguish from normal mechs
      biped.root.traverse((o) => {
        if (o.isMesh && o.material) {
          const m = o.material.clone();
          m.color.set(0x882222);
          m.emissive = new THREE.Color(0xff2222);
          m.emissiveIntensity = 0.3;
          o.material = m;
        }
      });
      box.setFromObject(biped.root);
      biped.root.position.y = -box.min.y;
      biped.root.rotation.y = Math.PI;
      root.add(biped.root);
      this.mixer = biped.mixer;
      this._actions = biped.actions;
      if (biped.actions.walk) { biped.actions.walk.play(); this._currentAnim = 'walk'; }
      else if (biped.actions.run) { biped.actions.run.play(); this._currentAnim = 'run'; }
    } else {
      // Minimal fallback
      const armor = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.4, metalness: 0.6 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(6.0, 6.0, 4.0), armor);
      torso.position.y = 11.0; torso.castShadow = true; root.add(torso);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7.0, 2.2), armor);
      legL.position.set(-1.6, 4.0, 0); root.add(legL);
      const legR = legL.clone(); legR.position.x = 1.6; root.add(legR);
      this.legL = legL; this.legR = legR;
      this.legPhase = 0;
    }

    // Muzzle points for dual-cannon fire
    this._muzzleL = new THREE.Object3D();
    this._muzzleL.position.set(-4.0, 12.5, 2.0);
    root.add(this._muzzleL);
    this._muzzleR = new THREE.Object3D();
    this._muzzleR.position.set(4.0, 12.5, 2.0);
    root.add(this._muzzleR);

    this.root = root;
  }

  _playAnim(name) {
    if (!this._actions || this._currentAnim === name || !this._actions[name]) return;
    if (this._actions[this._currentAnim]) this._actions[this._currentAnim].fadeOut(0.25);
    this._actions[name].reset().fadeIn(0.25).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    if (this.mixer) this.mixer.update(dt);
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist > 0.001) _aiVA.divideScalar(dist);

    if (dist > 30) {
      myPos.x += _aiVA.x * this.speed * dt;
      myPos.z += _aiVA.z * this.speed * dt;
      if (this._actions) {
        this._playAnim(dist > 60 ? 'run' : 'walk');
      } else if (this.legL) {
        this.legPhase = (this.legPhase || 0) + dt * 4;
        this.legL.position.y = 4.0 + Math.sin(this.legPhase) * 0.5;
        this.legR.position.y = 4.0 + Math.sin(this.legPhase + Math.PI) * 0.5;
      }
    } else {
      if (this._actions) this._playAnim('idle');
      else if (this.legL) { this.legL.position.y = 4.0; this.legR.position.y = 4.0; }
    }
    this.root.rotation.y = Math.atan2(_aiVA.x, _aiVA.z);

    this.cooldown -= dt;
    if (this.cooldown <= 0 && dist < 160) {
      this.cooldown = 1.2;
      if (this._actions) this._playAnim('attack');
      for (const muzzle of [this._muzzleL, this._muzzleR]) {
        muzzle.getWorldPosition(_aiVB);
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

