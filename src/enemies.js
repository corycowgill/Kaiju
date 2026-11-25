import * as THREE from 'three';
import { initMilitaryMotion, observeTarget, moveMilitary, turnToward, damageMilitary } from './militaryMotion.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skinnedClone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cachedFetch, normalizeGLTFMaterials, disposeInstance, withParseSlot, reportLoadError, isCodeBug } from './assetCache.js';

// Module-level scratch vectors reused by every AI tick to avoid GC churn.
const _aiVA = new THREE.Vector3();
const _aiVB = new THREE.Vector3();
const _aiVC = new THREE.Vector3();
const _aiVD = new THREE.Vector3();
// Skip skinned-mesh mixer ticks for enemies far from the kaiju. Off-screen
// or distant tanks/mechs/soldiers don't need bone-accurate animation; the
// AI logic still ticks every frame so positions/firing stay consistent.
const MIXER_CULL_DIST_SQ = 200 * 200;

// --------------- GLB enemy templates ---------------
const _glbLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // GLBs are meshopt-compressed (tools/optimize_assets.mjs)
const _templates = {
  tank: null, tankAnims: [], helicopter: null, artillery: null,
  soldier: null, soldierAnims: {},
  mech: null, mechAnims: {},
  jet: null,
};

// Enemy meshes used to set frustumCulled = false (skinned parts vanished
// when animated outside their bind-pose bounds), so every enemy was drawn
// in the main and shadow passes even off-screen. Instead each template
// SkinnedMesh gets a bounding sphere that encloses every pose of every clip
// (sampled once at load, some clips carry root motion) plus 30% margin;
// SkeletonUtils.clone copies it to every instance, so culling stays on.
const _bv = new THREE.Vector3();
function _padSkinnedBounds(root, clips = []) {
  const meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return;
  const rest = [];
  root.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const sample = () => {
    root.updateMatrixWorld(true);
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 5) { m.getVertexPosition(i, _bv); m.boundingSphere.expandByPoint(_bv); }
    }
  };
  for (const m of meshes) m.computeBoundingSphere();
  const mixer = new THREE.AnimationMixer(root);
  for (const clip of clips) {
    const a = mixer.clipAction(clip);
    a.play();
    for (let k = 0; k <= 12; k++) { mixer.setTime((clip.duration * k) / 12); sample(); }
    a.stop();
  }
  mixer.uncacheRoot(root);
  for (const [b, p, q, sc] of rest) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(sc); }
  root.updateMatrixWorld(true);
  for (const m of meshes) m.boundingSphere.radius *= 1.3;
}

function _cachedGLB(url) {
  return cachedFetch(url).then((buf) => withParseSlot(() =>
    new Promise((resolve, reject) => _glbLoader.parse(buf, '', resolve, reject))
  )).then((gltf) => { normalizeGLTFMaterials(gltf.scene); return gltf; });
}

// Animated biped model config: each biped is ONE merged GLB (skinned mesh +
// every clip). Clips are named after the original per-animation file minus
// '.glb' (e.g. 'Running'), so these tables map game keys -> clip names.
const SOLDIER_FILE = './assets/enemies/soldier/soldier.glb';
const SOLDIER_ANIMS = {
  run:          'Running.glb',
  walk:         'Walking.glb',
  rifleCharge:  'Rifle_Charge.glb',
  runAndShoot:  'Run_and_Shoot.glb',
};

const MECH_FILE = './assets/enemies/mech/mech.glb';
const MECH_ANIMS = {
  run:       'Running.glb',
  idle:      'Alert.glb',
  walk:      'Walking.glb',
  quickWalk: 'Quick_Walk.glb',
  runFast:   'run_fast_3_inplace.glb',
  attack:    'Skill_01.glb',
};

/**
 * Load a merged biped GLB (skinned mesh + all clips).
 * Returns { scene, animations: { name: AnimationClip } }
 */
async function _loadBipedSet(file, animFiles, label, onProgress, startIdx, total) {
  let scene = null;
  const animations = {};
  try {
    const gltf = await _cachedGLB(file);
    scene = gltf.scene;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    _padSkinnedBounds(scene, gltf.animations);
    const clips = new Map(gltf.animations.map((c) => [c.name, c]));
    for (const [name, animFile] of Object.entries(animFiles)) {
      const clip = clips.get(animFile.replace(/\.glb$/, ''));
      if (clip) animations[name] = clip;
      else reportLoadError('EnemyGLB', file, new Error(`${label} missing clip ${animFile}`));
    }
  } catch (e) {
    reportLoadError('EnemyGLB', file, e);
  }
  const idx = startIdx + Object.keys(animFiles).length;
  if (onProgress) onProgress(idx, total, label);
  return { scene, animations, nextIdx: idx };
}

/**
 * Load all enemy GLB templates. Call once at startup before spawning enemies.
 * @param {Function} [onProgress] - (loaded, total, label) callback
 */
export async function loadEnemyTemplates(onProgress) {
  // Static models (tank, heli, artillery, jet)
  const staticFiles = [
    { key: 'tank',       url: './assets/military/tank_type10.glb', fallback: './assets/enemies/tank.glb' },
    { key: 'tank_a1',    url: './assets/enemies/tank_anim_1.glb' },
    { key: 'tank_a2',    url: './assets/enemies/tank_anim_2.glb' },
    { key: 'tank_a3',    url: './assets/enemies/tank_anim_3.glb' },
    // v2 military GLBs (front faces +Z, bottom-centre origin, real-world metres);
    // the old models stay as fallbacks if a v2 file fails to load.
    { key: 'helicopter', url: './assets/military/attack_helicopter.glb', fallback: './assets/enemies/helicopter.glb' },
    { key: 'artillery',  url: './assets/military/artillery_spg.glb', fallback: './assets/enemies/tank.glb' },
    { key: 'jet',        url: './assets/enemies/jet.glb' },
  ];
  const soldierAnimCount = Object.keys(SOLDIER_ANIMS).length;
  const mechAnimCount = Object.keys(MECH_ANIMS).length;
  const total = staticFiles.length + soldierAnimCount + mechAnimCount;
  let loaded = 0;

  // Load static models
  for (const { key, url, fallback } of staticFiles) {
    try {
      let gltf, v2 = !!fallback;
      try {
        gltf = await _cachedGLB(url);
      } catch (e) {
        if (!fallback || isCodeBug(e)) throw e;
        reportLoadError('EnemyGLB', url, e); // recorded, then the old model stands in
        console.warn(`[EnemyGLB] ${key}: using fallback ${fallback}`);
        gltf = await _cachedGLB(fallback);
        v2 = false;
      }
      const s = gltf.scene;
      s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      _padSkinnedBounds(s, gltf.animations);
      if (key === 'tank') {
        _templates.tank = { scene: s, animations: gltf.animations, v2 };
      } else if (key.startsWith('tank_a')) {
        _templates.tankAnims.push(gltf.animations);
      } else if (key === 'helicopter') {
        _templates.helicopter = { scene: s, animations: gltf.animations, v2 };
      } else if (key === 'artillery') {
        _templates.artillery = { scene: s, animations: gltf.animations, v2 };
      } else if (key === 'jet') {
        _templates.jet = { scene: s, animations: gltf.animations };
      }
    } catch (e) {
      reportLoadError('EnemyGLB', url, e);
    }
    loaded++;
    if (onProgress) onProgress(loaded, total, key);
  }

  // Load soldier biped
  const soldierResult = await _loadBipedSet(SOLDIER_FILE, SOLDIER_ANIMS, 'soldier', onProgress, loaded, total);
  if (soldierResult.scene) {
    _templates.soldier = { scene: soldierResult.scene, animations: soldierResult.animations };
  }
  loaded = soldierResult.nextIdx;

  // Load mech biped
  const mechResult = await _loadBipedSet(MECH_FILE, MECH_ANIMS, 'mech', onProgress, loaded, total);
  if (mechResult.scene) {
    _templates.mech = { scene: mechResult.scene, animations: mechResult.animations };
  }
  loaded = mechResult.nextIdx;
}

function _cloneTemplate(tpl) {
  if (!tpl) return null;
  return tpl.scene.clone(true);
}

/** Clone a biped template and set up an AnimationMixer with all its clips.
 *  Uses SkeletonUtils.clone so each instance shares geometry while still
 *  getting its own bones/skeleton wired up correctly. */
function _cloneBiped(tpl) {
  if (!tpl) return null;
  const clone = skinnedClone(tpl.scene);
  // A cloned Skeleton starts with all-zero bone matrices, so measuring it
  // (Box3.setFromObject -> computeBoundingBox) collapsed the mesh to ~0 height
  // and the spawn code scaled soldiers ~100x and mechs ~500x into the sky.
  // Pose the bones and drop any stale cached box before anyone measures it.
  clone.updateMatrixWorld(true);
  clone.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.boundingBox = null; } });
  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const [name, clip] of Object.entries(tpl.animations)) {
    actions[name] = mixer.clipAction(clip);
  }
  return { root: clone, mixer, actions };
}

// A separate presentation pivot leaves skeleton clips and actor ground position intact.
function setupMilitary(actor) {
  initMilitaryMotion(actor);
  const visual = new THREE.Group();
  while (actor.root.children.length) visual.add(actor.root.children[0]);
  actor.root.add(visual); actor._visual = visual;
}
function faceMilitary(actor, x, z, dt, rate = 2.4) {
  if (x || z) actor.root.rotation.y = turnToward(actor.root.rotation.y, Math.atan2(x, z), rate * dt);
}
function animateMilitary(actor, dt, bank = 0, pitch = 0) {
  const v = actor._visual, speed = actor._moveSpeed || 0;
  const gait = actor.type === 'soldier' ? 11 : 5;
  const moving = Math.min(1.5, speed / (actor.speed || 1));
  const a = 1 - Math.exp(-dt * 10);
  v.rotation.z += (bank + actor._hitTilt - v.rotation.z) * a;
  v.rotation.x += (pitch - actor._recoil * .055 - v.rotation.x) * a;
  v.position.z = -actor._recoil * (actor.type === 'soldier' ? .12 : .45);
  v.position.y = (actor.type === 'soldier' || actor.type === 'mech') ? Math.sin(actor._tacticalTime * gait + actor._phase) * .045 * moving : 0;
  actor._driveAction?.setEffectiveTimeScale(moving * (actor.tactic === 'reverse' ? -1 : 1));
  const action = actor._actions?.[actor._currentAnim];
  if (action && ['run', 'walk', 'quickWalk', 'runFast', 'runAndShoot'].includes(actor._currentAnim)) action.setEffectiveTimeScale(moving < .02 ? 0 : Math.max(.45, moving * (actor._currentAnim === 'walk' ? 1.2 : 1)) * (actor._reverse ? -1 : 1));
  if (actor._actions && actor._currentAnim === 'attack') action?.setEffectiveTimeScale(1);
  if (actor.mixer && (actor.root.position.x - actor._targetX) ** 2 + (actor.root.position.z - actor._targetZ) ** 2 < MIXER_CULL_DIST_SQ) actor.mixer.update(dt);
}
function muzzleShot(actor, world, target, type, lead = .2, size = .4) {
  actor._muzzle?.getWorldPosition(_aiVB);
  if (!actor._muzzle) _aiVB.copy(actor.root.position);
  _aiVC.set(target.x + actor._targetVX * lead, target.y * .5 + 8, target.z + actor._targetVZ * lead).sub(_aiVB).normalize();
  world.spawnShell(_aiVB, _aiVC, type); world.spawnMuzzleFlash(_aiVB, size); actor._recoil = 1;
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
    let muzzleY = 1.5, muzzleZ = 3.0;
    if (tpl) {
      const v2 = _templates.tank.v2;
      // Old GLB: ~5 units like the old procedural tank. v2 (9.4m Type-10 style):
      // ~9.5u so it reads at kaiju scale.
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      const targetLen = v2 ? 9.5 : 5.0;
      const s = targetLen / Math.max(size.x, size.y, size.z);
      tpl.scale.setScalar(s);
      // Center on the ground
      box.setFromObject(tpl);
      tpl.position.y = -box.min.y;
      // Old model faces -Z; the v2 model already faces +Z
      if (!v2) tpl.rotation.y = Math.PI;
      if (v2) { muzzleY = size.y * s * 0.55; muzzleZ = size.z * s * 0.55; }
      root.add(tpl);
      this._glbModel = tpl;

      // Set up animation mixer if the template has animations
      if (_templates.tank.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(tpl);
        const clip = _templates.tank.animations[0];
        const action = this.mixer.clipAction(clip);
        this._driveAction = action; action.play();
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
    this._muzzle.position.set(0, muzzleY, muzzleZ);
    root.add(this._muzzle);

    this.root = root;
    setupMilitary(this);
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    const p = this.root.position, dx = kaijuPos.x - p.x, dz = kaijuPos.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 4.5) { this.die(world); return; }
    const nx = dx / dist, nz = dz / dist;
    this.cooldown -= dt;
    if (this._windup <= 0 && this._stagger <= 0 && this.cooldown <= 0 && dist < this.shootRange) {
      this._windup = .7; this.cooldown = 2.8 + this._unitId % 3 * .3;
      this._muzzle.getWorldPosition(_aiVB); world.spawnHitPulse?.(_aiVB, 0xffbb55);
    }
    const brace = this._windup > 0;
    this.tactic = brace ? 'brace' : dist < 48 ? 'reverse' : 'flank';
    const radial = dist > 78 ? 1 : dist < 48 ? -1 : .15;
    const flank = dist < 110 && dist > 48 ? this._side * .65 : 0;
    moveMilitary(this, dt, world, brace ? 0 : nx * radial - nz * flank, brace ? 0 : nz * radial + nx * flank, this.speed, 3.2);
    if (brace || radial < 0) faceMilitary(this, nx, nz, dt, 1.9);
    else faceMilitary(this, this._vx, this._vz, dt, 1.9);
    if (brace) {
      this._windup = Math.max(.001, this._windup - dt);
      const error = Math.abs(Math.atan2(Math.sin(Math.atan2(nx, nz) - this.root.rotation.y), Math.cos(Math.atan2(nx, nz) - this.root.rotation.y)));
      if (this._windup <= .001 && error < .22) { this._windup = 0; if (dist < this.shootRange + 8) muzzleShot(this, world, kaijuPos, 'tank', .25, .5); }
      if (dist > this.shootRange + 20) this._windup = 0;
    }
    animateMilitary(this, dt, -this._vx * Math.cos(this.root.rotation.y) * .006 + this._vz * Math.sin(this.root.rotation.y) * .006);
  }


  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(2), 1.0);
    world.shake(0.3, 0.3);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
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
      const v2 = _templates.helicopter.v2;
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      // v2 model is 15m nose-to-tail; scale up so it reads next to a 32u kaiju
      const targetLen = v2 ? 12.0 : 6.0;
      const s = targetLen / Math.max(size.x, size.y, size.z);
      tpl.scale.setScalar(s);
      box.setFromObject(tpl);
      tpl.position.y = -box.min.y;
      // Old model faces -Z; the v2 model already faces +Z
      if (!v2) tpl.rotation.y = Math.PI;
      root.add(tpl);
      this._glbModel = tpl;
      // v2 rotors are separate nodes pivoted at their hubs (main spins about Y, tail about X)
      this.rotor = tpl.getObjectByName('rotor_main') || null;
      this.tailRotor = tpl.getObjectByName('rotor_tail') || null;
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
    setupMilitary(this);
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    const p = this.root.position, dx = kaijuPos.x - p.x, dz = kaijuPos.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    this._passT = Math.max(0, (this._passT || 0) - dt); this.cooldown -= dt;
    if (!this._passT && this.cooldown <= 0 && dist < 125 && this._stagger <= 0) { this._passT = 1.05; this._burstCD = 0; this.cooldown = 4.8; }
    const pass = this._passT > 0, breaking = !pass && this.cooldown > 1.2;
    this.tactic = pass ? 'strafe' : breaking ? 'break' : 'ingress';
    const radial = breaking ? (dist < 125 ? -1 : 0) : dist > 82 ? 1 : dist < 58 ? -1 : 0;
    moveMilitary(this, dt, world, nx * radial - nz * this._side * .8, nz * radial + nx * this._side * .8, this.speed * (breaking ? 1.2 : 1), 0, true);
    faceMilitary(this, nx, nz, dt, 2.3);
    p.y += (this.altitude + Math.sin(this._tacticalTime * 1.5 + this._phase) * .45 - p.y) * (1 - Math.exp(-dt * 3));
    const lateral = this._vx * nz - this._vz * nx, forward = this._vx * nx + this._vz * nz;
    animateMilitary(this, dt, -lateral / this.speed * .22, forward / this.speed * .1);
    if (this.rotor) this.rotor.rotation.y += dt * 30;
    if (this.tailRotor) this.tailRotor.rotation.x += dt * 40;
    if (pass && this._stagger <= 0) {
      this._burstCD -= dt;
      if (this._burstCD <= 0 && dist < 140) { this._burstCD = .34; muzzleShot(this, world, kaijuPos, 'heli', .18, .3); }
    }
  }


  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone(), 1.2);
    world.shake(0.4, 0.4);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
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

    // The authored mech faces +Z, the same axis as the actor and muzzle.
    const biped = _cloneBiped(_templates.mech);
    if (biped) {
      const box = new THREE.Box3().setFromObject(biped.root);
      const size = box.getSize(new THREE.Vector3());
      const targetH = 9.0; // tall mech
      const s = targetH / size.y;
      biped.root.scale.setScalar(s);
      box.setFromObject(biped.root);
      biped.root.position.y = -box.min.y;
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
    setupMilitary(this);
  }

  _playAnim(name, reverse = false) {
    const action = this._actions?.[name];
    if (!action) return;
    this._reverse = reverse;
    const rate = reverse ? -1 : 1;
    if (this._currentAnim === name) {
      action.setEffectiveTimeScale(rate);
      return;
    }
    this._actions[this._currentAnim]?.fadeOut(.2);
    action.reset().setEffectiveTimeScale(rate);
    if (reverse) action.time = action.getClip().duration;
    action.fadeIn(.2).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    const p = this.root.position, dx = kaijuPos.x - p.x, dz = kaijuPos.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 5) { this.die(world); return; }
    const nx = dx / dist, nz = dz / dist;
    this.cooldown -= dt; this._attackHold = Math.max(0, this._attackHold - dt);
    if (this.cooldown <= 0 && this._stagger <= 0 && dist < 110 && this._windup <= 0) {
      this._windup = .65; this._attackHold = 1.2; this.cooldown = 3 + this._unitId % 3 * .2;
      this._playAnim('attack'); this._muzzle.getWorldPosition(_aiVB); world.spawnHitPulse?.(_aiVB, 0xffaa55);
    }
    const attack = this._attackHold > 0, radial = dist > 52 ? 1 : dist < 32 ? -1 : 0;
    this.tactic = attack ? 'volley' : radial < 0 ? 'backstep' : 'advance';
    moveMilitary(this, dt, world, attack ? 0 : nx * radial, attack ? 0 : nz * radial, this.speed * (dist > 85 ? 1.35 : 1), 3);
    faceMilitary(this, nx, nz, dt, 2);
    if (!attack) this._playAnim(this._moveSpeed < .2 ? 'idle' : dist > 85 ? (this._actions?.runFast ? 'runFast' : 'run') : 'walk', radial < 0);
    if (this._windup > 0) {
      this._windup -= dt;
      if (this._windup <= 0 && this._stagger <= 0 && dist < 125) {
        this._muzzle.position.x = -1.4; muzzleShot(this, world, kaijuPos, 'mech', .25);
        this._muzzle.position.x = 1.4; muzzleShot(this, world, kaijuPos, 'mech', .25); this._muzzle.position.x = 0;
      }
    }
    if (this.legL) { const gait = Math.sin(this._tacticalTime * 6) * Math.min(1, this._moveSpeed / this.speed) * .35; this.legL.rotation.x = gait; this.legR.rotation.x = -gait; }
    animateMilitary(this, dt);
  }


  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(4), 1.6);
    world.shake(0.6, 0.4);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
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

    const glb = _cloneTemplate(_templates.jet);
    if (glb) {
      const box = new THREE.Box3().setFromObject(glb);
      const size = box.getSize(new THREE.Vector3());
      const targetLen = 7.0; // ~7 units long
      const s = targetLen / Math.max(size.x, size.y, size.z);
      glb.scale.setScalar(s);
      glb.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(glb);
      glb.position.y = -(scaled.min.y + scaled.max.y) / 2; // center vertically
      glb.rotation.y = Math.PI; // face +Z forward
      root.add(glb);
    } else {
      // Procedural fallback
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7080, roughness: 0.3, metalness: 0.6 });
      const accentMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

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
    }

    // Afterburner glow (always procedural - visible on GLB too)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const burner = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), glowMat);
    burner.rotation.x = -Math.PI / 2;
    burner.position.z = -3.4;
    root.add(burner);
    this.burner = burner;

    this.root = root;
    setupMilitary(this);
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    const p = this.root.position, dx = kaijuPos.x - p.x, dz = kaijuPos.z - p.z, dist = Math.hypot(dx, dz);
    const oldYaw = this.root.rotation.y;
    if (this.state === 'approach') {
      const heading = turnToward(Math.atan2(this.passDir.x, this.passDir.z), Math.atan2(dx, dz), dt * 1.15);
      this.passDir.set(Math.sin(heading), 0, Math.cos(heading));
      if (dist < 75) this.state = 'strafe';
    } else if (this.state === 'strafe') {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && dist < 105 && this._stagger <= 0) { this.cooldown = .45; muzzleShot(this, world, kaijuPos, 'jet', .15); }
      if (dist > 100) { this.state = 'egress'; this.egressTimer = 1.8; }
    } else {
      this.egressTimer -= dt;
      if (this.egressTimer <= 0) this.state = 'approach';
    }
    this.tactic = this.state;
    moveMilitary(this, dt, world, this.passDir.x, this.passDir.z, this.speed, 0, true);
    faceMilitary(this, this._vx, this._vz, dt, 2.2);
    const turn = Math.atan2(Math.sin(this.root.rotation.y - oldYaw), Math.cos(this.root.rotation.y - oldYaw)) / dt;
    p.y += (this.altitude + (this.state === 'egress' ? 5 : 0) - p.y) * (1 - Math.exp(-dt * 2));
    animateMilitary(this, dt, Math.max(-.65, Math.min(.65, -turn * .4)), this.state === 'egress' ? -.06 : .02);
    this.burner.scale.y = 1.15 + Math.sin(this._tacticalTime * 30 + this._phase) * .12;
  }


  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone(), 1.4);
    world.shake(0.5, 0.4);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
    world.onJetKilled?.();
  }
}

// -------------------------- Artillery --------------------------
// Long-range battery: relocates under pressure, then aims and lobs marked shells.
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
    let muzzleY = 2.5, muzzleZ = 3.5;
    if (tpl) {
      const v2 = _templates.artillery.v2;
      const box = new THREE.Box3().setFromObject(tpl);
      const size = box.getSize(new THREE.Vector3());
      // v2 is its own armoured gun truck (11m body + 3.4m barrel overhang, 14.4m overall,
      // so 13u keeps the body ~10u); the fallback is the tank GLB, larger and darkened
      const targetLen = v2 ? 13.0 : 6.5;
      const s = targetLen / Math.max(size.x, size.y, size.z);
      tpl.scale.setScalar(s);
      if (!v2) {
        // Darken materials to distinguish from regular tanks
        tpl.traverse((o) => {
          if (o.isMesh && o.material) {
            const m = o.material.clone();
            m.color.multiplyScalar(0.6);
            o.material = m;
          }
        });
      }
      box.setFromObject(tpl);
      tpl.position.y = -box.min.y;
      // Old model faces -Z; the v2 model already faces +Z
      if (!v2) tpl.rotation.y = Math.PI;
      root.add(tpl);
      // v2 muzzle brake is the front-most point (+Z), at ~80% of the model height
      if (v2) { muzzleY = (box.max.y - box.min.y) * 0.8; muzzleZ = box.max.z * 0.97; }
    } else {
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x383830, roughness: 0.85 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 4.4), baseMat);
      base.position.y = 0.6; base.castShadow = true;
      root.add(base);
    }

    // Muzzle point for firing (front of vehicle, raised)
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0, muzzleY, muzzleZ);
    root.add(this._muzzle);

    this.root = root;
    setupMilitary(this);
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    const p = this.root.position, dx = kaijuPos.x - p.x, dz = kaijuPos.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 5) { this.die(world); return; }
    const nx = dx / dist, nz = dz / dist;
    const retreat = dist < 95;
    this.tactic = retreat ? 'relocate' : this._windup > 0 ? 'aim' : 'battery';
    moveMilitary(this, dt, world, retreat ? -nx - nz * this._side * .3 : 0, retreat ? -nz + nx * this._side * .3 : 0, 4, 4);
    faceMilitary(this, nx, nz, dt, 1.2);
    this.cooldown -= dt;
    if (retreat || this._stagger > 0) this._windup = 0;
    else if (this._windup > 0) {
      this._windup -= dt;
      if (this._windup <= 0 && dist < 320) {
        this._muzzle.getWorldPosition(_aiVB);
        _aiVC.set(kaijuPos.x + this._targetVX * .55, 0, kaijuPos.z + this._targetVZ * .55);
        world.spawnArtilleryShell?.(_aiVB, _aiVC); world.spawnMuzzleFlash(_aiVB, .8); this._recoil = 1;
      }
    } else if (this.cooldown <= 0 && dist < 300) {
      this._windup = 1; this.cooldown = 5.5 + this._unitId % 3 * .4;
      this._muzzle.getWorldPosition(_aiVB); world.spawnHitPulse?.(_aiVB, 0xffbb55);
    }
    animateMilitary(this, dt);
  }


  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(2), 1.3);
    world.shake(0.4, 0.3);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
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
    setupMilitary(this);
  }

  _playAnim(name) {
    if (!this._actions || this._currentAnim === name || !this._actions[name]) return;
    if (this._actions[this._currentAnim]) this._actions[this._currentAnim].fadeOut(0.15);
    this._actions[name].reset().fadeIn(0.15).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    const p = this.root.position, dx = kaijuPos.x - p.x, dz = kaijuPos.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 4) { this.damage(999, world); return; }
    const nx = dx / dist, nz = dz / dist;
    this.cooldown -= dt;
    if (dist > 64) this._burst = 0;
    const brace = (this._burst || 0) > 0, radial = dist > 38 ? 1 : dist < 20 ? -1 : 0;
    const flank = dist < 80 ? this._side * .55 : this._side * .22;
    this.tactic = brace ? 'fire' : radial < 0 ? 'fall-back' : 'skirmish';
    moveMilitary(this, dt, world, brace ? 0 : nx * radial - nz * flank, brace ? 0 : nz * radial + nx * flank, this.speed * (dist < 40 ? .55 : 1), .8);
    faceMilitary(this, this._moveSpeed > .5 && dist > 65 ? this._vx : nx, this._moveSpeed > .5 && dist > 65 ? this._vz : nz, dt, 5);
    if (this.cooldown <= 0 && dist < 60 && this._stagger <= 0) {
      if (!this._burst) this._burst = 2;
      muzzleShot(this, world, kaijuPos, 'rifle', .08, .2); this._burst--;
      this.cooldown = this._burst ? .18 : 1.5 + this._unitId % 4 * .12;
    }
    this._playAnim(this._moveSpeed < .6 ? 'rifleCharge' : dist < 60 ? 'runAndShoot' : 'run');
    if (this.legL) { const gait = Math.sin(this._tacticalTime * 11 + this._phase) * Math.min(1, this._moveSpeed / this.speed) * .6; this.legL.rotation.x = gait; this.legR.rotation.x = -gait; }
    animateMilitary(this, dt);
  }


  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnSparks(this.root.position.clone().setY(1), 4);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
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
    // Telegraphed attacks (see update): cannon volleys charge for
    // VOLLEY_WINDUP s with glowing muzzles before firing at where the
    // kaiju IS at release (dodge by moving); the ground pound shows a
    // growing red warning disc for SLAM_WINDUP s and only hits if the
    // kaiju is still inside SLAM_RADIUS when it lands.
    this._volleyT = 0;   // >0 while charging a volley
    this._slamT = 0;     // >0 while winding up a ground pound
    this._chargePulseT = 0;

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
      // Tint red/dark to distinguish from normal mechs. Memoize per source
      // material so meshes sharing a base material share the tinted clone
      // (was: 1 cloned material per mesh = ~20 unique materials per boss).
      const tintCache = new Map();
      biped.root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const src = o.material;
        let tinted = tintCache.get(src);
        if (!tinted) {
          tinted = src.clone();
          tinted.color.set(0x882222);
          tinted.emissive = new THREE.Color(0xff2222);
          tinted.emissiveIntensity = 0.3;
          tintCache.set(src, tinted);
        }
        o.material = tinted;
      });
      box.setFromObject(biped.root);
      biped.root.position.y = -box.min.y;
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
    setupMilitary(this);
  }

  _playAnim(name) {
    if (!this._actions || this._currentAnim === name || !this._actions[name]) return;
    if (this._actions[this._currentAnim]) this._actions[this._currentAnim].fadeOut(0.25);
    this._actions[name].reset().fadeIn(0.25).play();
    this._currentAnim = name;
  }

  update(dt, world, kaijuPos) {
    if (this.dead || !(dt > 0)) return;
    observeTarget(this, kaijuPos, dt);
    this._attackHold = Math.max(0, this._attackHold - dt);
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    if (dist > 0.001) _aiVA.divideScalar(dist);

    if (dist > 30 && this._volleyT <= 0 && this._slamT <= 0 && this._attackHold <= 0) {
      moveMilitary(this, dt, world, _aiVA.x, _aiVA.z, this.speed, 6);
      if (this._actions) {
        this._playAnim(dist > 60 ? (this._actions.runFast ? 'runFast' : 'run') : 'walk');
      } else if (this.legL) {
        this.legPhase = (this.legPhase || 0) + dt * 4;
        this.legL.position.y = 4.0 + Math.sin(this.legPhase) * 0.5;
        this.legR.position.y = 4.0 + Math.sin(this.legPhase + Math.PI) * 0.5;
      }
    } else {
      moveMilitary(this, dt, world, 0, 0, this.speed, 6);
      if (this._actions && this._volleyT <= 0 && this._slamT <= 0 && this._attackHold <= 0) this._playAnim('idle');
      else if (this.legL) { this.legL.position.y = 4.0; this.legR.position.y = 4.0; }
    }
    faceMilitary(this, _aiVA.x, _aiVA.z, dt, 1.5);
    animateMilitary(this, dt);

    const VOLLEY_WINDUP = 0.9, SLAM_WINDUP = 1.5, SLAM_RADIUS = 45;

    // Cannon volley: charge (glowing muzzles) -> fire 2 shells.
    this.cooldown -= dt;
    if (this._volleyT > 0) {
      this._volleyT -= dt;
      this._chargePulseT -= dt;
      if (this._chargePulseT <= 0) {
        this._chargePulseT = 0.18;
        for (const muzzle of [this._muzzleL, this._muzzleR]) {
          muzzle.getWorldPosition(_aiVB);
          world.spawnHitPulse(_aiVB.clone(), 0xff3322);
        }
      }
      if (this._volleyT <= 0) {
        this._attackHold = .8;
        if (this._actions) this._playAnim('attack');
        for (const muzzle of [this._muzzleL, this._muzzleR]) {
          muzzle.getWorldPosition(_aiVB);
          _aiVC.set(kaijuPos.x, kaijuPos.y * 0.5 + 8, kaijuPos.z).sub(_aiVB).normalize();
          world.spawnShell(_aiVB, _aiVC, 'boss');
          world.spawnMuzzleFlash(_aiVB, 0.6);
        }
      }
    } else if (this.cooldown <= 0 && dist < 160 && this._slamT <= 0) {
      this.cooldown = 2.8 + Math.random() * 0.8; // was a 1.2 s volley cadence
      this._volleyT = VOLLEY_WINDUP;
      this._chargePulseT = 0;
      world.onBossWindup?.('volley', this, VOLLEY_WINDUP);
    }

    // Special: telegraphed ground pound at close range.
    this.specialCooldown -= dt;
    if (this._slamT > 0) {
      this._slamT -= dt;
      if (this._slamT <= 0) {
        world.spawnShockwave(myPos.clone(), 0xff3333, SLAM_RADIUS);
        world.shake(1.0, 0.6);
        const dx = kaijuPos.x - myPos.x;
        const dz = kaijuPos.z - myPos.z;
        if (dx * dx + dz * dz < SLAM_RADIUS * SLAM_RADIUS) world.onBossSlam?.();
      }
    } else if (this.specialCooldown <= 0 && dist < 55 && this._volleyT <= 0) {
      this.specialCooldown = 9 + Math.random() * 3;
      this._slamT = SLAM_WINDUP; this._attackHold = SLAM_WINDUP + .35;
      world.spawnBossTelegraph?.(myPos.clone(), SLAM_RADIUS, SLAM_WINDUP);
      world.onBossWindup?.('slam', this, SLAM_WINDUP);
      if (this._actions) this._playAnim('attack');
    }
  }

  damage(amount, world) {
    damageMilitary(this, amount, world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    // Multi-stage death
    world.spawnExplosion(this.root.position.clone().setY(8), 2.5);
    world.spawnExplosion(this.root.position.clone().setY(12), 2.0);
    world.shake(1.5, 1.0);
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
    world.onBossKilled?.();
  }
}


/** Loaded enemy templates, for tools/smoke_test.mjs (read-only). */
export function getTemplateStats() {
  const anims = (t) => (t ? Object.keys(t.animations) : []);
  return {
    tank: !!_templates.tank && _templates.tank.v2, tankAnims: _templates.tankAnims.length,
    helicopter: !!_templates.helicopter && _templates.helicopter.v2,
    artillery: !!_templates.artillery && _templates.artillery.v2,
    jet: !!_templates.jet,
    soldier: { loaded: anims(_templates.soldier), expected: Object.keys(SOLDIER_ANIMS) },
    mech: { loaded: anims(_templates.mech), expected: Object.keys(MECH_ANIMS) },
  };
}
