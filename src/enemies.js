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

    // Brighter olive than before so the tank reads against the dark asphalt
    // streets. Plus a yellow warning stripe and amber running lights.
    const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x788055, roughness: 0.85 });
    const bodyDark  = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.9 });
    const trackMat  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1.0 });
    const metalMat  = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.7 });
    const lightMat  = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffeeaa, emissiveIntensity: 1.8 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffd11a, emissive: 0xffaa11, emissiveIntensity: 0.6 });

    // Lower hull (sloped front for visual interest)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 5.0), bodyMat);
    hull.position.y = 1.0;
    hull.castShadow = true;
    root.add(hull);
    // Glacis plate (sloped front armour)
    const glacis = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 1.1), bodyMat);
    glacis.position.set(0, 1.05, 2.2);
    glacis.rotation.x = -0.4;
    root.add(glacis);
    // Side skirts to break up the silhouette
    const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 4.6), bodyDark);
    skirtL.position.set(-1.8, 0.85, 0);
    root.add(skirtL);
    const skirtR = skirtL.clone(); skirtR.position.x = 1.8; root.add(skirtR);

    // Tracks
    const trL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 5.4), trackMat);
    trL.position.set(-1.7, 0.35, 0); trL.castShadow = true; root.add(trL);
    const trR = trL.clone(); trR.position.x = 1.7; root.add(trR);
    // Visible track-wheel knobs (5 per side) for hand-built feel
    for (const sx of [-1.7, 1.7]) {
      for (let i = 0; i < 5; i++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.84, 8), metalMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.35, -2.0 + i * 1.0);
        root.add(w);
      }
    }

    // Turret (slightly tapered cylinder)
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.9, 10), bodyMat);
    turret.position.y = 1.75;
    turret.castShadow = true;
    root.add(turret);
    this.turret = turret;
    // Commander hatch on top
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.36, 8), bodyDark);
    hatch.position.set(0, 0.55, -0.35);
    turret.add(hatch);
    // Turret-side smoke launcher cluster
    for (const sx of [-0.95, 0.95]) {
      const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.6), metalMat);
      cluster.position.set(sx, 0.15, 0.4);
      turret.add(cluster);
    }
    // Antenna sweeping up from the rear of the turret
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4), metalMat);
    antenna.position.set(0.85, 1.5, -0.55);
    antenna.rotation.z = -0.15;
    turret.add(antenna);

    // Main barrel (with muzzle brake)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.0, 8), bodyMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0.0, 1.5);
    turret.add(barrel);
    this.barrel = barrel;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.4, 8), metalMat);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(0, 0, 1.5);
    barrel.add(muzzle);
    // Coaxial machine gun beside the barrel
    const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), metalMat);
    coax.rotation.z = Math.PI / 2;
    coax.position.set(0.3, -0.1, 0.9);
    turret.add(coax);

    // Front headlights (emissive amber)
    for (const sx of [-1.2, 1.2]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.12), lightMat);
      hl.position.set(sx, 1.05, 2.55);
      root.add(hl);
    }
    // Rear exhaust pipe with a soot-black tip
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6), metalMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(-1.2, 1.35, -2.3);
    root.add(exhaust);
    // Yellow warning stripe down the hull side -- big visibility boost.
    for (const sx of [-1.71, 1.71]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 4.4), stripeMat);
      stripe.position.set(sx, 1.0, 0);
      root.add(stripe);
    }
    // Rear tail lights
    for (const sx of [-1.0, 1.0]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.08), new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2233, emissiveIntensity: 1.6 }));
      tl.position.set(sx, 1.05, -2.55);
      root.add(tl);
    }

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return;
    const myPos = this.root.position;
    _aiVA.subVectors(kaijuPos, myPos); _aiVA.y = 0;
    const dist = _aiVA.length();
    // Walked over by the kaiju -> instant explosion.
    if (dist < 4.5) { this.die(world); return; }
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

    // Brighter olive-gray for visibility against the dusk sky/buildings.
    const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x7a8a66, roughness: 0.55, metalness: 0.3 });
    const bodyDark  = new THREE.MeshStandardMaterial({ color: 0x4f5a40, roughness: 0.7 });
    const dark      = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const glassMat  = new THREE.MeshStandardMaterial({ color: 0x4488aa, roughness: 0.15, metalness: 0.6, emissive: 0x336699, emissiveIntensity: 0.35 });
    const lightMat  = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffeeaa, emissiveIntensity: 1.6 });
    const redMat    = new THREE.MeshStandardMaterial({ color: 0x441111, emissive: 0xff2233, emissiveIntensity: 1.2 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 12), bodyMat);
    body.scale.set(1.0, 0.9, 1.6);
    body.castShadow = true;
    root.add(body);

    // Cockpit canopy (curved glass at the front)
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat);
    canopy.scale.set(1.0, 0.65, 1.4);
    canopy.position.set(0, 0.35, 1.4);
    root.add(canopy);
    // Side windows
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.2), glassMat);
      win.position.set(sx * 1.1, 0.25, 0.2);
      root.add(win);
    }

    // Tail boom (slightly tapered)
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 3.5, 8), bodyMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -2.4;
    root.add(tail);
    // Stabilising horizontal fins
    const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.4), bodyDark);
    hStab.position.set(0, 0.0, -3.6);
    root.add(hStab);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.5), bodyMat);
    fin.position.set(0, 0.4, -3.9);
    root.add(fin);

    // Main rotor mast (visible above the body)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 6), dark);
    mast.position.y = 1.05;
    root.add(mast);
    // Main rotor (4 blades - approximated by 2 perpendicular slabs)
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 0.3), dark);
    rotor.position.y = 1.4;
    root.add(rotor);
    const rotor2 = rotor.clone();
    rotor2.rotation.y = Math.PI / 2;
    rotor.add(rotor2);
    this.rotor = rotor;
    // Rotor hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8), bodyDark);
    hub.position.y = 1.4;
    root.add(hub);

    // Tail rotor + housing
    const tailRotorHub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), bodyDark);
    tailRotorHub.position.set(0.32, 0.4, -3.9);
    root.add(tailRotorHub);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.15), dark);
    tailRotor.position.set(0.3, 0.4, -3.9);
    root.add(tailRotor);
    this.tailRotor = tailRotor;

    // Skids + cross-supports
    const skid1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), dark);
    skid1.rotation.x = Math.PI / 2; skid1.position.set(-0.8, -1.2, 0); root.add(skid1);
    const skid2 = skid1.clone(); skid2.position.x = 0.8; root.add(skid2);
    for (const sz of [-0.7, 0.7]) {
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 6), dark);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, -1.0, sz);
      root.add(cross);
    }

    // Underbelly searchlight
    const search = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lightMat);
    search.position.set(0, -0.95, 0.6);
    root.add(search);
    // Side rocket pods
    for (const sx of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8), bodyDark);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(sx * 1.6, -0.4, 0.4);
      root.add(pod);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), dark);
      tip.position.set(sx * 1.6, -0.4, 1.0);
      tip.rotation.x = Math.PI / 2;
      root.add(tip);
    }
    // Tail anti-collision blink
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), redMat);
    blink.position.set(0, 0.85, -3.95);
    root.add(blink);

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
    if (dist < 5) { this.die(world); return; } // squashed
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

