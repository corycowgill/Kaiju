import * as THREE from 'three';

// Monster archetypes. Each builds its own mesh hierarchy and exposes power configs.
export const MONSTERS = {
  godzilla: {
    name: 'Gojira',
    emoji: '🦖',
    bg: 'linear-gradient(135deg,#1a3d1a,#0a1f0a)',
    description: 'Reptilian tyrant. Massive HP, devastating atomic breath.',
    stats: { hp: 220, speed: 1.0, melee: 30, scale: 1.0 },
    color: 0x2d5a2d,
    bellyColor: 0xb8c98a,
    spineColor: 0xddffaa,
    beam: { color: 0x66ff66, glow: 0xaaffaa, name: 'ATOMIC BREATH', damage: 80, cost: 50 },
    roar: { color: 0xff6644, name: 'PRIMAL ROAR', radius: 60, damage: 25, cost: 30 },
    charge: { color: 0xffee44, name: 'TAIL SWEEP', damage: 60, cost: 40 },
  },
  ghidorah: {
    name: 'Ghidorah',
    emoji: '🐲',
    bg: 'linear-gradient(135deg,#5a4a1a,#2a1a00)',
    description: 'Three-headed dragon. Faster, electric lightning attacks.',
    stats: { hp: 170, speed: 1.25, melee: 22, scale: 0.95 },
    color: 0xd4a533,
    bellyColor: 0xffcc55,
    spineColor: 0xff7733,
    beam: { color: 0xffee66, glow: 0xffff99, name: 'GRAVITY BEAM', damage: 60, cost: 35 },
    roar: { color: 0x66ccff, name: 'STORM CRY', radius: 70, damage: 20, cost: 25 },
    charge: { color: 0xff66ff, name: 'WING SLAM', damage: 50, cost: 35 },
  },
  mecha: {
    name: 'MechaKai',
    emoji: '🤖',
    bg: 'linear-gradient(135deg,#3a3a4a,#1a1a2a)',
    description: 'Cybernetic war machine. Armored, missiles and plasma.',
    stats: { hp: 260, speed: 0.85, melee: 35, scale: 1.05 },
    color: 0x99aabb,
    bellyColor: 0x445566,
    spineColor: 0xff3344,
    beam: { color: 0xff3366, glow: 0xff66aa, name: 'PLASMA CANNON', damage: 90, cost: 55 },
    roar: { color: 0xff8800, name: 'MISSILE BARRAGE', radius: 80, damage: 35, cost: 45 },
    charge: { color: 0x66aaff, name: 'ROCKET DASH', damage: 55, cost: 35 },
  },
};

// Build a stylized kaiju with curved geometry and personality details:
// snout, brow, nostrils, glowing pupils, neck, scales/scutes, claws, horn.
export function buildKaiju(cfg) {
  const root = new THREE.Group();
  root.name = 'kaiju';

  const bodyMat  = new THREE.MeshStandardMaterial({ color: cfg.color,      roughness: 0.7,  metalness: 0.18 });
  const bodyDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.color).multiplyScalar(0.7), roughness: 0.75 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: cfg.bellyColor, roughness: 0.85 });
  const spineMat = new THREE.MeshStandardMaterial({ color: cfg.spineColor, roughness: 0.35, metalness: 0.4, emissive: cfg.spineColor, emissiveIntensity: 0.45 });
  const clawMat  = new THREE.MeshStandardMaterial({ color: 0x111111,       roughness: 0.5,  metalness: 0.3 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfff5d8,       roughness: 0.4 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffee66,       emissive: 0xffaa22, emissiveIntensity: 2.0 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x110000,       roughness: 0.6 });

  // ------------- TORSO -------------
  // Lower torso (hips) -- a barrel using LatheGeometry for a curved profile
  const hipPoints = [];
  for (let i = 0; i <= 8; i++) {
    const ty = i / 8;
    const r = 3.05 - 0.55 * Math.pow(ty - 0.55, 2) * 4; // wider at hips, narrower waist
    hipPoints.push(new THREE.Vector2(Math.max(0.5, r), ty * 5.6));
  }
  const torso = new THREE.Mesh(new THREE.LatheGeometry(hipPoints, 14), bodyMat);
  torso.position.y = 4.1;
  root.add(torso);

  // Belly plate scutes -- tilted cylinders down the front
  const scuteMat = new THREE.MeshStandardMaterial({ color: cfg.bellyColor, roughness: 0.55, metalness: 0.05 });
  for (let i = 0; i < 5; i++) {
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(1.4 - i * 0.12, 1.45 - i * 0.12, 0.9, 14), scuteMat);
    sc.position.set(0, 4.6 + i * 1.0, 1.9 - i * 0.04);
    sc.rotation.x = -Math.PI / 2;
    sc.rotation.z = Math.sin(i) * 0.05;
    sc.scale.set(1.0, 0.5, 1.0); // flatten into a plate
    root.add(sc);
  }

  // Chest -- sphere-ish curved hull (not a box anymore)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 12), bodyMat);
  chest.scale.set(1.15, 1.0, 1.05);
  chest.position.y = 11.0;
  root.add(chest);
  // Pectoral muscle hints
  const pec = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 10), bodyMat);
  pec.scale.set(1.0, 0.9, 0.6); pec.position.set(-1.2, 11.4, 1.7); root.add(pec);
  const pec2 = pec.clone(); pec2.position.x = 1.2; root.add(pec2);

  // Shoulder pads
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), bodyDark);
  shoulderL.position.set(-2.6, 12.7, 0); shoulderL.scale.y = 0.85;
  root.add(shoulderL);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = 2.6; root.add(shoulderR);

  // ------------- NECK -------------
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 1.8, 12), bodyMat);
  neck.position.set(0, 13.4, 0.4); neck.rotation.x = -0.2;
  root.add(neck);

  // ------------- HEAD -------------
  const head = new THREE.Group();
  head.name = 'head';

  // Skull -- elongated sphere
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.55, 16, 12), bodyMat);
  skull.scale.set(1.1, 0.95, 1.4);
  head.add(skull);

  // Snout -- tapered cylinder forward
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.6, 12), bodyMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.15, 1.4);
  head.add(snout);

  // Snout tip / nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), bodyMat);
  nose.scale.set(1.0, 0.85, 0.85);
  nose.position.set(0, -0.1, 2.25);
  head.add(nose);

  // Nostrils -- two dark pits
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
  const nostL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), nostrilMat);
  nostL.position.set(-0.32, 0.15, 2.6); head.add(nostL);
  const nostR = nostL.clone(); nostR.position.x = 0.32; head.add(nostR);

  // Brow ridges -- tilted cubes above eyes
  const browL = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bodyDark);
  browL.scale.set(1.4, 0.4, 1.0);
  browL.position.set(-0.7, 0.55, 0.95);
  browL.rotation.z = -0.25;
  head.add(browL);
  const browR = browL.clone();
  browR.position.x = 0.7; browR.rotation.z = 0.25;
  head.add(browR);

  // Eye sockets (dark backing)
  const socketL = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), nostrilMat);
  socketL.position.set(-0.7, 0.18, 1.05); socketL.scale.set(1, 1, 0.4);
  head.add(socketL);
  const socketR = socketL.clone(); socketR.position.x = 0.7; head.add(socketR);

  // Glowing eyes with pupils
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), eyeMat);
  eyeL.position.set(-0.7, 0.22, 1.18); head.add(eyeL);
  const pupL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), pupilMat);
  pupL.position.set(-0.7, 0.22, 1.42); pupL.scale.x = 0.55; head.add(pupL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.7; head.add(eyeR);
  const pupR = pupL.clone(); pupR.position.x = 0.7; head.add(pupR);

  // Jaw (lower) -- subtle, can rotate for a roar (named so animations can find it)
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), bodyMat);
  jaw.scale.set(1.2, 0.5, 1.5);
  jaw.position.set(0, -0.85, 1.0);
  jaw.name = 'jaw';
  head.add(jaw);

  // Fangs -- 2 big upper canines + small bottom teeth
  const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 6), toothMat);
  fangL.rotation.x = Math.PI; fangL.position.set(-0.55, -0.65, 1.7); head.add(fangL);
  const fangR = fangL.clone(); fangR.position.x = 0.55; head.add(fangR);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 5), toothMat);
    t.position.set(-0.85 + i * 0.42, -0.95, 1.55);
    head.add(t);
  }

  // Horn / crown spike
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 6), spineMat);
  horn.position.set(0, 1.05, -0.1);
  horn.rotation.x = -0.25;
  head.add(horn);
  // Cheek/jaw spikes
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 5), spineMat);
    sp.position.set(sx * 1.15, -0.05, 0.1);
    sp.rotation.z = sx * Math.PI / 2;
    head.add(sp);
  }

  // Position head on top of neck, slight forward lean
  head.position.set(0, 14.55, 0.85);
  head.rotation.x = 0.05;
  root.add(head);

  // ------------- SPINES (curved row down back, larger -> smaller) -------------
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const sz = 1.5 - 0.9 * t;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.55 * sz, 1.6 * sz, 5), spineMat);
    s.position.set(0, 14.0 - t * 8.5, -1.4 - t * 0.2);
    // tilt back slightly
    s.rotation.x = -0.18 + t * 0.1;
    s.name = 'spine';
    root.add(s);
  }

  // Shoulder spikes for menace
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 5), spineMat);
    sp.position.set(sx * 2.6, 13.6, -0.6);
    sp.rotation.z = sx * 0.6;
    sp.rotation.x = -0.4;
    root.add(sp);
  }

  // ------------- ARMS -------------
  function makeArm(side) {
    const arm = new THREE.Group();
    // Upper -- tapered cylinder
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.65, 3.0, 10), bodyMat);
    upper.position.y = -1.5;
    arm.add(upper);
    // Elbow joint as sphere
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), bodyDark);
    elbow.position.y = -3.0;
    arm.add(elbow);
    // Forearm
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 2.8, 10), bodyMat);
    fore.position.y = -4.4;
    arm.add(fore);
    // Wrist
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), bodyDark);
    wrist.position.y = -5.7;
    arm.add(wrist);
    // Hand -- two-knuckle palm
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), bodyMat);
    palm.position.y = -6.2; palm.scale.set(1.1, 0.8, 1.1);
    arm.add(palm);
    // 3 fingers + thumb, each two segments + claw tip
    function finger(offX, offZ, len, curl) {
      const f1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, len, 6), bodyMat);
      f1.position.set(offX, -6.6 - len * 0.5, offZ + 0.3);
      f1.rotation.x = -0.4 + curl;
      arm.add(f1);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 5), clawMat);
      claw.position.set(offX, -6.6 - len - 0.25, offZ + 0.55);
      claw.rotation.x = Math.PI - 0.3 + curl;
      arm.add(claw);
    }
    finger(-0.45, 0.0, 0.7, 0);
    finger( 0.0, 0.0, 0.85, 0);
    finger( 0.45, 0.0, 0.7, 0);
    // Thumb
    finger(side * -0.7, -0.2, 0.55, 0.15);

    arm.position.set(side * 2.7, 12.5, 0);
    arm.rotation.z = side * 0.15;
    arm.rotation.x = 0.05;
    arm.name = side < 0 ? 'armL' : 'armR';
    return arm;
  }
  root.add(makeArm(-1));
  root.add(makeArm(1));

  // ------------- LEGS -------------
  function makeLeg(side) {
    const leg = new THREE.Group();
    // Thigh
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.95, 3.4, 10), bodyMat);
    thigh.position.y = -1.7;
    leg.add(thigh);
    // Knee
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), bodyDark);
    knee.position.y = -3.4;
    leg.add(knee);
    // Shin
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 3.4, 10), bodyMat);
    shin.position.y = -4.95;
    leg.add(shin);
    // Ankle
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), bodyDark);
    ankle.position.y = -6.5;
    leg.add(ankle);
    // Foot pad
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), bodyMat);
    foot.scale.set(1.4, 0.45, 1.6);
    foot.position.set(0, -6.95, 0.4);
    leg.add(foot);
    // 3 toe-claws
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), clawMat);
      c.position.set(-0.55 + i * 0.55, -7.1, 1.5);
      c.rotation.x = Math.PI / 2 + 0.2;
      leg.add(c);
    }
    leg.position.set(side * 1.45, 6.9, 0);
    leg.name = side < 0 ? 'legL' : 'legR';
    return leg;
  }
  root.add(makeLeg(-1));
  root.add(makeLeg(1));

  // ------------- TAIL (curved, tapering segments) -------------
  const tail = new THREE.Group();
  tail.name = 'tail';
  let tailX = 0, tailY = 0, tailZ = 0, tailAngle = 0;
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const r = 1.4 - 1.15 * t;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), bodyMat);
    seg.position.set(tailX, tailY, tailZ);
    tail.add(seg);
    // also add a small belly scute under each segment
    if (i > 0 && i < 8) {
      const sc = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 8, 6), scuteMat);
      sc.position.set(tailX, tailY - r * 0.8, tailZ);
      sc.scale.y = 0.4;
      tail.add(sc);
    }
    // step backward + slightly down + curved
    tailAngle += 0.04;
    tailX += Math.sin(tailAngle * 1.4) * 0.15;
    tailY -= 0.18 + t * 0.15;
    tailZ -= 1.25 * (1 - t * 0.2);
  }
  // Tip spike
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), spineMat);
  tip.position.set(tailX, tailY, tailZ - 0.4);
  tip.rotation.x = -Math.PI / 2 - 0.2;
  tail.add(tip);
  // Tail-top ridges (mini spines)
  for (let i = 1; i < 8; i++) {
    const rg = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), spineMat);
    rg.position.set(0, 0.6, -i * 1.1);
    rg.rotation.x = -0.15;
    tail.add(rg);
  }
  tail.position.set(0, 7.3, -2.4);
  root.add(tail);

  // Apply scale (and a faint forward lean for posture)
  root.scale.setScalar(cfg.stats.scale);
  return { root, head, tail };
}
