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

// Build a stylized humanoid kaiju mesh with the given palette
export function buildKaiju(cfg) {
  const root = new THREE.Group();
  root.name = 'kaiju';

  const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7, metalness: 0.15 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: cfg.bellyColor, roughness: 0.85 });
  const spineMat = new THREE.MeshStandardMaterial({ color: cfg.spineColor, roughness: 0.4, metalness: 0.3, emissive: cfg.spineColor, emissiveIntensity: 0.25 });

  // Torso (lower body)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 5.5, 12), bodyMat);
  torso.position.y = 6.5;
  torso.castShadow = true;
  root.add(torso);

  const belly = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 5.3, 12), bellyMat);
  belly.position.set(0, 6.5, 1.5);
  belly.scale.z = 0.4;
  root.add(belly);

  // Chest
  const chest = new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.0, 3.6), bodyMat);
  chest.position.y = 11.0;
  chest.castShadow = true;
  root.add(chest);

  // Head
  const head = new THREE.Group();
  head.name = 'head';
  const skull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 3.6), bodyMat);
  skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.6), bodyMat);
  jaw.position.set(0, -1.2, 0.6);
  jaw.name = 'jaw';
  head.add(jaw);

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffff66, emissive: 0xffaa22, emissiveIntensity: 1.4 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.7, 0.3, 1.7); eyeR.position.set(0.7, 0.3, 1.7);
  head.add(eyeL); head.add(eyeR);

  // Teeth
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfffff0 });
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), toothMat);
    t.position.set(-1.0 + i * 0.4, -0.8, 1.9);
    t.rotation.x = Math.PI;
    head.add(t);
  }

  head.position.set(0, 14.2, 0.5);
  root.add(head);

  // Spines along back
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.5 + Math.random()*0.2, 1.4 - i*0.1, 4), spineMat);
    s.position.set(0, 12.5 - i * 1.4, -1.6 - i*0.1);
    s.name = 'spine';
    root.add(s);
  }

  // Arms
  function makeArm(side) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 3.2, 8), bodyMat);
    upper.position.y = -1.6; upper.castShadow = true;
    arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 3.0, 8), bodyMat);
    fore.position.y = -4.4; fore.castShadow = true;
    arm.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), bodyMat);
    hand.position.y = -6.0;
    arm.add(hand);
    // claws
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 4), toothMat);
      c.position.set(-0.4 + i * 0.4, -6.7, 0.4);
      arm.add(c);
    }
    arm.position.set(side * 2.6, 12.5, 0);
    arm.rotation.z = side * 0.15;
    arm.name = side < 0 ? 'armL' : 'armR';
    return arm;
  }
  root.add(makeArm(-1));
  root.add(makeArm(1));

  // Legs
  function makeLeg(side) {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 3.5, 8), bodyMat);
    thigh.position.y = -1.75; thigh.castShadow = true;
    leg.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 3.5, 8), bodyMat);
    shin.position.y = -5.0; shin.castShadow = true;
    leg.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.6), bodyMat);
    foot.position.set(0, -6.9, 0.4); foot.castShadow = true;
    leg.add(foot);
    leg.position.set(side * 1.4, 6.9, 0);
    leg.name = side < 0 ? 'legL' : 'legR';
    return leg;
  }
  root.add(makeLeg(-1));
  root.add(makeLeg(1));

  // Tail (segments)
  const tail = new THREE.Group();
  tail.name = 'tail';
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(1.4 - i*0.13, 8, 8), bodyMat);
    seg.position.set(0, -i * 0.2, -1.0 - i * 1.3);
    seg.castShadow = true;
    tail.add(seg);
  }
  tail.position.set(0, 7.2, -2.2);
  root.add(tail);

  // Apply scale
  root.scale.setScalar(cfg.stats.scale);
  return { root, head, tail };
}
