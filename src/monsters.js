import * as THREE from 'three';

// Monster archetypes. Each builds its own mesh hierarchy and exposes power configs.
export const MONSTERS = {
  godzilla: {
    name: 'Gojira',
    emoji: '🦖',
    variant: 'gojira',
    bg: 'linear-gradient(135deg,#1a3d1a,#0a1f0a)',
    description: 'Reptilian tyrant. Massive HP, devastating atomic breath.',
    stats: { hp: 220, speed: 1.45, melee: 60, scale: 1.0 },
    color: 0x2d5a2d,
    bellyColor: 0xb8c98a,
    spineColor: 0xddffaa,
    beam: { color: 0x66ff66, glow: 0xaaffaa, name: 'ATOMIC BREATH', damage: 240, cost: 50 },
    roar: { color: 0xff6644, name: 'PRIMAL ROAR', radius: 70, damage: 180, cost: 30 },
    charge: { color: 0xffee44, name: 'TAIL SWEEP', damage: 240, cost: 40 },
  },
  ghidorah: {
    name: 'Ghidorah',
    emoji: '🐲',
    variant: 'ghidorah',
    bg: 'linear-gradient(135deg,#5a4a1a,#2a1a00)',
    description: 'Three-headed dragon. Faster, electric lightning attacks.',
    stats: { hp: 170, speed: 1.7, melee: 50, scale: 0.95 },
    color: 0xd4a533,
    bellyColor: 0xffcc55,
    spineColor: 0xff7733,
    beam: { color: 0xffee66, glow: 0xffff99, name: 'GRAVITY BEAM', damage: 200, cost: 35 },
    roar: { color: 0x66ccff, name: 'STORM CRY', radius: 80, damage: 160, cost: 25 },
    charge: { color: 0xff66ff, name: 'WING SLAM', damage: 220, cost: 35 },
  },
  mecha: {
    name: 'MechaKai',
    emoji: '🤖',
    variant: 'mecha',
    bg: 'linear-gradient(135deg,#3a3a4a,#1a1a2a)',
    description: 'Cybernetic war machine. Armored, missiles and plasma.',
    stats: { hp: 260, speed: 1.25, melee: 70, scale: 1.05 },
    color: 0x99aabb,
    bellyColor: 0x445566,
    spineColor: 0xff3344,
    beam: { color: 0xff3366, glow: 0xff66aa, name: 'PLASMA CANNON', damage: 280, cost: 55 },
    roar: { color: 0xff8800, name: 'MISSILE BARRAGE', radius: 90, damage: 220, cost: 45 },
    charge: { color: 0x66aaff, name: 'ROCKET DASH', damage: 240, cost: 35 },
  },
};

// Build a stylized kaiju with curved geometry and personality details:
// snout, brow, nostrils, glowing pupils, neck, scales/scutes, claws, horn.
// Phase 7: Fresnel rim-light injection via onBeforeCompile. Adds a neon-coloured
// edge term to MeshStandardMaterial based on view-facing normal so the kaiju
// silhouette pops against dim backgrounds.
function addRimLight(material, hex, strength = 1.6, power = 2.5) {
  const rim = new THREE.Color(hex);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor    = { value: rim };
    shader.uniforms.uRimStrength = { value: strength };
    shader.uniforms.uRimPower    = { value: power };
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform vec3 uRimColor;
       uniform float uRimStrength;
       uniform float uRimPower;
       void main() {`
    );
    // Inject right before the colour gets written so we add to the final
    // outgoingLight after all PBR + tone-mapping prep happens.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `// rim light additive (graphics plan Phase 7)
      {
        float fr = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition)));
        fr = pow(fr, uRimPower);
        outgoingLight += uRimColor * fr * uRimStrength;
      }
      #include <opaque_fragment>`
    );
  };
  // Each material gets a unique cache key so Three.js doesn't dedup the
  // shader programs across rim-lit materials.
  material.customProgramCacheKey = () => 'rim_' + hex;
  return material;
}

export function buildKaiju(cfg) {
  const root = new THREE.Group();
  root.name = 'kaiju';

  // Per-variant rim colour: cyan for organic kaiju, magenta for the mecha.
  // Strength tuned WAY down so the rim is a subtle silhouette accent, not
  // a glowing halo. (Previous values 1.6 / 1.4 were producing an "odd glow"
  // around the kaiju per user feedback.)
  const rimColor = cfg.variant === 'mecha' ? 0xff3388 : 0x33ddff;
  const bodyMat  = addRimLight(new THREE.MeshStandardMaterial({ color: cfg.color,      roughness: 0.7,  metalness: 0.18 }), rimColor, 0.35, 3.5);
  const bodyDark = addRimLight(new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.color).multiplyScalar(0.7), roughness: 0.75 }), rimColor, 0.30, 3.5);
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

  // ------------- VARIANT-SPECIFIC ACCENTS -------------
  // Each kaiju gets a distinct silhouette so the three monsters read as
  // different creatures even before you see them attack.
  const variant = cfg.variant || 'gojira';

  // Helper: shared facial-detail builder. Adds per-variant face flourishes
  // to a head group (eyes/lids/lips/teeth/etc).
  function addFaceDetails(headGroup, mode) {
    // Inner mouth (dark cavity behind teeth)
    const mouthCavity = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x110000, roughness: 1.0, side: THREE.BackSide })
    );
    mouthCavity.scale.set(1.2, 0.5, 1.0);
    mouthCavity.position.set(0, -0.55, 1.4);
    headGroup.add(mouthCavity);

    // Tongue (small pink curved cylinder)
    const tongue = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.32, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xaa3344, roughness: 0.7 })
    );
    tongue.rotation.x = Math.PI / 2;
    tongue.position.set(0, -0.78, 1.65);
    headGroup.add(tongue);

    // Lower lip ridge along the snout
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 16, Math.PI), lipMat);
    lip.rotation.set(Math.PI / 2, 0, Math.PI);
    lip.position.set(0, -0.75, 1.45);
    lip.scale.set(1.1, 0.9, 1);
    headGroup.add(lip);

    // Mouth-corner crease wrinkles
    for (const sx of [-1, 1]) {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.15), lipMat);
      cr.position.set(sx * 1.05, -0.55, 0.85);
      cr.rotation.y = sx * 0.4;
      headGroup.add(cr);
    }

    if (mode === 'gojira') {
      // Heavy reptilian brow scales -- 3 bumps per side
      const browBumpMat = new THREE.MeshStandardMaterial({ color: 0x1a3318, roughness: 0.95 });
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), browBumpMat);
          b.position.set(sx * (0.5 + i * 0.22), 0.85, 0.95 - i * 0.2);
          b.scale.set(1, 0.7, 1);
          headGroup.add(b);
        }
      }
      // Vertical-slit pupils -- thin black boxes over the existing yellow eyes
      const slitMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 });
      for (const sx of [-1, 1]) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.04), slitMat);
        slit.position.set(sx * 0.7, 0.22, 1.45);
        headGroup.add(slit);
      }
      // Snout scars (3 diagonal scratch marks)
      for (let i = 0; i < 3; i++) {
        const sc = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), slitMat);
        sc.position.set(-0.1 + i * 0.3, -0.15 + i * 0.08, 1.95);
        sc.rotation.z = -0.4;
        headGroup.add(sc);
      }
      // Extra teeth row (smaller incisors between fangs)
      const toothS = new THREE.MeshStandardMaterial({ color: 0xfff5d8, roughness: 0.4 });
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), toothS);
        t.position.set(-0.4 + i * 0.27, -0.5, 1.85);
        t.rotation.x = Math.PI;
        headGroup.add(t);
      }
      // Throat sack ridge
      const throat = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 10, 6),
        new THREE.MeshStandardMaterial({ color: 0xa8b864, roughness: 0.7 })
      );
      throat.scale.set(1.2, 0.4, 0.9);
      throat.position.set(0, -1.5, 0.4);
      headGroup.add(throat);
    } else if (mode === 'ghidorah') {
      // Slimmer dragon snout + golden slit eyes + pair of forehead horns above each eye
      // Override existing eyes/pupils with smaller, golden, slit eyes.
      const goldEyeMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffaa00, emissiveIntensity: 2.4 });
      const slitMat = new THREE.MeshStandardMaterial({ color: 0x110000 });
      // (we still want to overlay -- existing eyes will be hidden by these on top)
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 10), goldEyeMat);
        e.position.set(sx * 0.7, 0.22, 1.30);
        headGroup.add(e);
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.04), slitMat);
        slit.position.set(sx * 0.7, 0.22, 1.45);
        headGroup.add(slit);
      }
      // Pair of long curved horns above each eye
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.6, 6), spineMat);
        horn.position.set(sx * 0.6, 1.0, 0.0);
        horn.rotation.x = -0.5;
        horn.rotation.z = sx * 0.25;
        headGroup.add(horn);
      }
      // Long thin lip line (sharper teeth, no fat fangs)
      const sharpMat = new THREE.MeshStandardMaterial({ color: 0xfff5d8, roughness: 0.3 });
      for (let i = 0; i < 8; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 4), sharpMat);
        t.position.set(-1.05 + i * 0.3, -0.55, 1.7);
        t.rotation.x = Math.PI;
        headGroup.add(t);
      }
      // Whisker barbels (two thin curved cylinders below the chin)
      for (const sx of [-1, 1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 1.4, 4), bodyMat);
        wh.position.set(sx * 0.4, -1.1, 1.4);
        wh.rotation.x = -0.6;
        wh.rotation.z = sx * 0.4;
        headGroup.add(wh);
      }
    } else if (mode === 'mecha') {
      // Mecha doesn't have organic features -- replace with a single visor
      // band of glowing red plus mechanical jaw plating.
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0xff2233, emissive: 0xff2233, emissiveIntensity: 2.8, roughness: 0.2, metalness: 0.6,
      });
      const visor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.18), visorMat);
      visor.position.set(0, 0.22, 1.45);
      headGroup.add(visor);
      // Visor frame (dark)
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.1), frameMat);
      frame.position.set(0, 0.22, 1.55);
      headGroup.add(frame);
      // Cheek vent slits (3 per side)
      const slot = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0x660000, emissiveIntensity: 0.8 });
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.08), slot);
          s.position.set(sx * 0.95, -0.05 - i * 0.18, 1.0);
          headGroup.add(s);
        }
      }
      // Jaw piston / hinge
      for (const sx of [-1, 1]) {
        const hinge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8),
          new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9, roughness: 0.2 })
        );
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(sx * 1.0, -0.85, 0.7);
        headGroup.add(hinge);
      }
      // Antenna nubs on temples
      for (const sx of [-1, 1]) {
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 })
        );
        ant.position.set(sx * 1.05, 0.85, 0.0);
        ant.rotation.z = sx * 0.2;
        headGroup.add(ant);
      }
      // Add a chin spike
      const chin = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.55, 4),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })
      );
      chin.rotation.x = Math.PI / 2 + 0.3;
      chin.position.set(0, -1.25, 0.95);
      headGroup.add(chin);
    }
  }
  addFaceDetails(head, variant);

  if (variant === 'ghidorah') {
    // ---------- Two flanking heads on richly detailed necks ----------
    function makeSideHead(side) {
      const g = new THREE.Group();
      // Neck: 6 spheres curving outward and forward, with bony spine
      // ridge spikes along each segment.
      let nx = 0, ny = 0, nz = 0;
      const neckSpheres = [];
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const r = 0.85 - t * 0.3;
        const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bodyMat);
        seg.position.set(nx, ny, nz);
        g.add(seg);
        // Belly scute under the segment (lighter colour)
        const sc = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 8, 6), bellyMat);
        sc.scale.y = 0.4;
        sc.position.set(nx, ny - r * 0.7, nz);
        g.add(sc);
        // Spine ridge spike on top of each segment
        if (i < 6) {
          const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), spineMat);
          ridge.position.set(nx, ny + r * 0.85, nz - 0.05);
          ridge.rotation.x = -0.2;
          g.add(ridge);
        }
        neckSpheres.push({ x: nx, y: ny, z: nz });
        nx += side * 0.42;
        ny += 0.5 - t * 0.08;
        nz += 0.42;
      }
      // Head -- much more detailed than before
      const hg = new THREE.Group();
      const sk = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 12), bodyMat);
      sk.scale.set(1.1, 0.9, 1.4);
      hg.add(sk);
      // Snout (tapered cylinder with a bulb tip)
      const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.55, 1.3, 10), bodyMat);
      sn.rotation.x = Math.PI / 2;
      sn.position.set(0, -0.1, 1.0);
      hg.add(sn);
      const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), bodyMat);
      noseTip.position.set(0, -0.05, 1.65);
      hg.add(noseTip);
      // Nostrils
      const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
      for (const sx of [-1, 1]) {
        const nostr = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), nostrilMat);
        nostr.position.set(sx * 0.22, 0.05, 1.95);
        hg.add(nostr);
      }
      // Eyes (golden slit) + dark eye socket backing
      const goldEye = new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffaa00, emissiveIntensity: 2.2 });
      for (const sx of [-1, 1]) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), nostrilMat);
        socket.position.set(sx * 0.45, 0.18, 0.9);
        socket.scale.set(1, 1, 0.5);
        hg.add(socket);
        const ey = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), goldEye);
        ey.position.set(sx * 0.45, 0.18, 0.95);
        hg.add(ey);
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), nostrilMat);
        slit.position.set(sx * 0.45, 0.18, 1.05);
        hg.add(slit);
      }
      // Brow ridges + paired horn over each eye
      for (const sx of [-1, 1]) {
        const brow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bodyDark);
        brow.scale.set(1.6, 0.45, 1.0);
        brow.position.set(sx * 0.45, 0.55, 0.7);
        brow.rotation.z = sx * -0.2;
        hg.add(brow);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 6), spineMat);
        horn.position.set(sx * 0.5, 0.95, -0.05);
        horn.rotation.x = -0.4;
        horn.rotation.z = sx * 0.2;
        hg.add(horn);
      }
      // Center forehead horn (slightly larger)
      const fh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 6), spineMat);
      fh.position.set(0, 0.95, -0.1);
      fh.rotation.x = -0.3;
      hg.add(fh);
      // Lower jaw + teeth
      const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), bodyMat);
      jaw.scale.set(1.1, 0.4, 1.4);
      jaw.position.set(0, -0.65, 1.0);
      hg.add(jaw);
      const sharpMat = new THREE.MeshStandardMaterial({ color: 0xfff5d8, roughness: 0.3 });
      for (let i = 0; i < 6; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4), sharpMat);
        t.position.set(-0.65 + i * 0.26, -0.5, 1.6);
        t.rotation.x = Math.PI;
        hg.add(t);
      }
      // Whisker barbels under chin
      for (const sx of [-1, 1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 1.2, 4), bodyMat);
        wh.position.set(sx * 0.3, -0.95, 1.3);
        wh.rotation.x = -0.6;
        wh.rotation.z = sx * 0.4;
        hg.add(wh);
      }
      hg.position.set(nx, ny, nz);
      g.add(hg);
      g.position.set(side * 2.2, 12.4, 0.4);
      return g;
    }
    root.add(makeSideHead(-1));
    root.add(makeSideHead( 1));

    // ---------- Detailed wings ----------
    // Each wing is a multi-mesh assembly: a curved membrane with serrated
    // trailing edge, a leading-edge wing-arm, four wing-finger bones
    // dividing the membrane into sections, hooked claws at finger tips,
    // a shoulder muscle blob where the wing meets the body, and small
    // emissive glow patches between the fingers.
    const wingSkin = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, side: THREE.DoubleSide,
      roughness: 0.55, metalness: 0.18,
      emissive: cfg.spineColor, emissiveIntensity: 0.22,
    });
    const wingDark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.spineColor).multiplyScalar(0.45),
      side: THREE.DoubleSide, roughness: 0.7,
    });
    const wingBoneMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.55, metalness: 0.3 });
    const wingClawMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.4 });
    const wingGlowMat = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, emissive: cfg.spineColor, emissiveIntensity: 0.9,
      roughness: 0.4, side: THREE.DoubleSide,
    });

    function makeWing(side) {
      const wing = new THREE.Group();
      // Shoulder muscle blob
      const muscle = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), bodyMat);
      muscle.scale.set(1.0, 0.9, 1.2);
      wing.add(muscle);
      // Leading-edge wing-arm (3 segments: humerus, forearm, hand)
      const humerus = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.2, 8), wingBoneMat);
      humerus.rotation.z = side * -Math.PI / 2 - side * 0.5;
      humerus.position.set(side * 1.0, -0.2, -0.2);
      wing.add(humerus);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), wingBoneMat);
      elbow.position.set(side * 2.0, -0.45, -0.45);
      wing.add(elbow);
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 2.6, 8), wingBoneMat);
      forearm.rotation.z = side * -Math.PI / 2 - side * 0.2;
      forearm.position.set(side * 3.4, -0.7, -0.55);
      wing.add(forearm);
      const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), wingBoneMat);
      wrist.position.set(side * 4.7, -0.92, -0.65);
      wing.add(wrist);
      // Wing membrane shape: a Shape with 4 "fingers" giving it the
      // classic dragon look (tail of membrane between each pair of bones).
      const memShape = new THREE.Shape();
      memShape.moveTo(0, 0);
      memShape.bezierCurveTo(2.0, -0.3, 4.5, -1.0, 6.0, -1.5);     // leading edge to wing tip
      // Trailing edge with 4 dragon-finger scallops
      const fingers = [
        { x: 5.6, y: -3.0 },
        { x: 4.4, y: -3.6 },
        { x: 3.0, y: -3.8 },
        { x: 1.6, y: -3.7 },
      ];
      let prev = { x: 6.0, y: -1.5 };
      for (const f of fingers) {
        memShape.bezierCurveTo(prev.x - 0.3, prev.y - 0.5, f.x + 0.3, f.y - 0.4, f.x, f.y);
        prev = f;
      }
      memShape.bezierCurveTo(0.7, -3.5, 0.3, -2.0, 0, 0);
      const memGeom = new THREE.ShapeGeometry(memShape, 16);
      const membrane = new THREE.Mesh(memGeom, wingSkin);
      // Apply a side-flip via scale.x for the right wing
      membrane.scale.set(side, 1, 1);
      wing.add(membrane);
      // Inset darker membrane for ribbed shading
      const innerShape = new THREE.Shape();
      innerShape.moveTo(0.3, -0.2);
      innerShape.bezierCurveTo(2.0, -0.5, 4.5, -1.2, 5.7, -1.6);
      for (const f of fingers) {
        innerShape.lineTo(f.x - 0.3, f.y - 0.15);
      }
      innerShape.lineTo(0.5, -1.5);
      innerShape.lineTo(0.3, -0.2);
      const innerMem = new THREE.Mesh(new THREE.ShapeGeometry(innerShape, 12), wingDark);
      innerMem.position.z = 0.02;
      innerMem.scale.set(side, 1, 1);
      wing.add(innerMem);
      // Wing-finger bones (4 bones radiating from wrist to each finger tip)
      for (let i = 0; i < 4; i++) {
        const f = fingers[i];
        const dx = f.x, dy = f.y;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, len, 6), wingBoneMat);
        bone.position.set(side * (dx * 0.5), dy * 0.5, -0.6);
        bone.rotation.z = side * (ang + Math.PI / 2);
        wing.add(bone);
        // Hooked claw at the wing-finger tip
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 6), wingClawMat);
        claw.position.set(side * dx, dy, -0.65);
        claw.rotation.z = side * (ang - Math.PI / 2);
        wing.add(claw);
        // Small emissive glow patch in the middle of each membrane section
        if (i < 3) {
          const next = fingers[i + 1];
          const gx = (dx + next.x) / 2;
          const gy = (dy + next.y) / 2;
          const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), wingGlowMat);
          glow.position.set(side * gx, gy, 0.05);
          wing.add(glow);
        }
      }
      // Leading-edge spikes / claws along the top of the wing
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        const lx = 6.0 * t;
        const ly = -1.5 * t;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 5), spineMat);
        sp.position.set(side * lx, ly + 0.25, -0.15);
        sp.rotation.z = side * 0.15;
        wing.add(sp);
      }
      wing.position.set(side * 3.0, 13.4, -2.2);
      wing.rotation.y = side * -0.45;
      wing.rotation.z = side * -0.4;
      wing.rotation.x = -0.18;
      return wing;
    }
    root.add(makeWing(-1));
    root.add(makeWing(1));

    // Tail crest: extra serrated dorsal blades for ghidorah's serpentine vibe
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.45 - t * 0.25, 1.6 - t * 0.6, 4), spineMat);
      blade.position.set(0, 0.6, -i * 1.1);
      blade.rotation.x = -0.1;
      tail.add(blade);
    }

  } else if (variant === 'mecha') {
    // ---------- Shared mecha materials ----------
    const coreMat = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, emissive: cfg.spineColor, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.7,
    });
    const panelMat   = new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.4, metalness: 0.7 });
    const panelDark  = new THREE.MeshStandardMaterial({ color: 0x222a32, roughness: 0.5, metalness: 0.7 });
    const seamMat    = new THREE.MeshStandardMaterial({ color: cfg.spineColor, emissive: cfg.spineColor, emissiveIntensity: 1.4, roughness: 0.4 });
    const pistonMat  = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.95, roughness: 0.18 });
    const cableMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85 });
    const rivetMat   = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const ventMat    = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff5522, emissiveIntensity: 1.4 });

    // ---------- Chest core (large) + secondary core ----------
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.6, 16), coreMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 11.2, 2.4);
    root.add(core);
    // Inner glow disc behind the core (gives more bloom depth)
    const coreInner = new THREE.Mesh(new THREE.CircleGeometry(0.65, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    coreInner.position.copy(core.position);
    coreInner.position.z += 0.32;
    root.add(coreInner);
    // Outer ring around core
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.18, 8, 24),
      panelDark
    );
    ring.position.copy(core.position);
    root.add(ring);
    // 8 rivets around the ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rv = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), rivetMat);
      rv.position.set(Math.cos(a) * 1.1, 11.2 + Math.sin(a) * 1.1, 2.4);
      root.add(rv);
    }
    // Sub-cores: two smaller emissive ports flanking the main core
    for (const sx of [-1, 1]) {
      const sub = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), coreMat);
      sub.position.set(sx * 1.7, 12.5, 2.05);
      root.add(sub);
      const subRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 14), panelDark);
      subRing.position.copy(sub.position);
      subRing.rotation.x = Math.PI / 2;
      root.add(subRing);
    }

    // ---------- Layered chest plating ----------
    // Thin armor slabs over the existing torso for visible "bolted on" feel
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.0, 0.2), panelMat);
    chestPlate.position.set(0, 11.5, 2.7);
    root.add(chestPlate);
    // Diagonal accent stripe across the chest plate (emissive)
    const accentStripe = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.18, 0.05), seamMat);
    accentStripe.position.set(0, 11.7, 2.82);
    accentStripe.rotation.z = -0.18;
    root.add(accentStripe);
    // Side chest plates angled outward
    for (const sx of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 0.18), panelDark);
      sp.position.set(sx * 2.6, 11.4, 2.0);
      sp.rotation.y = sx * -0.35;
      root.add(sp);
    }
    // Hexagonal panel array on the upper torso
    for (let i = -1; i <= 1; i++) {
      for (let j = 0; j <= 1; j++) {
        const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 6), panelDark);
        hex.rotation.x = Math.PI / 2;
        hex.position.set(i * 0.55, 13.0 + j * 0.5, 2.85);
        root.add(hex);
      }
    }

    // ---------- Antenna + secondary sensors ----------
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5), pistonMat);
    ant.position.set(0, 16.5, -0.1);
    root.add(ant);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff3322, emissiveIntensity: 2.5 })
    );
    tip.position.set(0, 17.4, -0.1);
    root.add(tip);
    // Side sensors / dish-radar units
    for (const sx of [-1, 1]) {
      const dishStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), pistonMat);
      dishStem.position.set(sx * 0.85, 16.3, -0.1);
      root.add(dishStem);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        panelMat
      );
      dish.position.set(sx * 0.85, 16.6, -0.1);
      dish.rotation.x = Math.PI;
      root.add(dish);
      const dishCore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), seamMat);
      dishCore.position.set(sx * 0.85, 16.5, -0.1);
      root.add(dishCore);
    }

    // ---------- Multi-lens visor on the head ----------
    const visorBacking = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.2), panelDark);
    visorBacking.position.set(0, 14.3, 1.55);
    root.add(visorBacking);
    // 3 sub-lenses across the visor
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 2.6, roughness: 0.2, metalness: 0.6 });
    for (let i = -1; i <= 1; i++) {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), lensMat);
      lens.position.set(i * 0.85, 14.3, 1.66);
      root.add(lens);
      // Lens housing rim
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 14), panelDark);
      rim.position.copy(lens.position);
      rim.position.z -= 0.01;
      root.add(rim);
    }

    // ---------- Layered shoulder pauldrons ----------
    for (const sx of [-1, 1]) {
      // Outer pauldron
      const pauld = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), panelMat);
      pauld.scale.set(1.0, 0.85, 1.1);
      pauld.position.set(sx * 2.85, 13.4, 0);
      root.add(pauld);
      // Inner accent ring
      const pauldRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 18), seamMat);
      pauldRing.position.copy(pauld.position);
      pauldRing.position.x -= sx * 0.55;
      pauldRing.rotation.y = sx * Math.PI / 2;
      root.add(pauldRing);
      // Twin pistons sticking out the back of the pauldron
      for (let i = 0; i < 2; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), pistonMat);
        p.position.set(sx * 2.7, 13.2 + i * 0.5, -0.6);
        p.rotation.z = sx * 0.3;
        p.rotation.x = -0.2;
        root.add(p);
        // Hydraulic seal ring on each piston
        const seal = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 5, 10), rivetMat);
        seal.position.copy(p.position);
        seal.rotation.copy(p.rotation);
        seal.rotateX(Math.PI / 2);
        root.add(seal);
      }
      // Rivet cluster on the pauldron front
      for (let r = 0; r < 4; r++) {
        const a = r * (Math.PI / 6) - Math.PI / 6;
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 6), rivetMat);
        rivet.position.set(sx * 2.85 + Math.cos(a) * 0.55, 13.4 + Math.sin(a) * 0.55, 0.95);
        root.add(rivet);
      }
    }

    // ---------- Cable bundles at neck + waist (thick black tubes) ----------
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.3, 6), cableMat);
      cable.position.set(Math.cos(a) * 1.1, 13.7, Math.sin(a) * 1.1);
      cable.rotation.z = 0.05;
      root.add(cable);
    }
    // Waist cables wrapping the seam
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.9, 6), cableMat);
      cable.position.set(Math.cos(a) * 2.7, 8.5, Math.sin(a) * 2.7);
      cable.rotation.x = Math.PI / 2;
      cable.rotation.z = a;
      root.add(cable);
    }

    // ---------- Rivet seam around the torso ----------
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const rv = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 6), rivetMat);
      rv.position.set(Math.cos(ang) * 2.95, 9.0, Math.sin(ang) * 2.95);
      root.add(rv);
    }

    // ---------- Vent slits + grills ----------
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), ventMat);
      v.position.set(0, 12.5 - i * 0.4, 2.95);
      root.add(v);
    }
    // Side grills (perpendicular vent strips along the ribs)
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.1), panelDark);
        v.position.set(sx * 2.7, 11.5 - i * 0.4, 1.4);
        root.add(v);
      }
    }
    // Backpack heat-sink fins (visible from behind)
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.18), panelDark);
      fin.position.set(0, 12.5 - i * 0.6, -1.85);
      fin.rotation.x = -0.18;
      root.add(fin);
    }
    // Rear glow strip between the heat sinks (engine glow)
    const rearGlow = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 0.1), seamMat);
    rearGlow.position.set(0, 11.4, -1.95);
    root.add(rearGlow);

    // ---------- Mech hand / knuckle detail ----------
    // Find the existing arm groups (named 'armL' / 'armR' in the base build)
    const armL = root.getObjectByName('armL');
    const armR = root.getObjectByName('armR');
    function addKnuckles(arm) {
      if (!arm) return;
      // 4 small knuckle-rivets on the palm (palm is at relative y -6.2)
      for (let i = 0; i < 4; i++) {
        const k = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), rivetMat);
        k.position.set(-0.45 + i * 0.3, -6.0, 0.6);
        arm.add(k);
      }
      // Wrist cuff rim
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 14), seamMat);
      cuff.position.set(0, -5.7, 0);
      cuff.rotation.x = Math.PI / 2;
      arm.add(cuff);
      // Forearm panel-line glow strip
      const arf = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.06), seamMat);
      arf.position.set(0, -4.4, 0.45);
      arm.add(arf);
    }
    addKnuckles(armL);
    addKnuckles(armR);

    // ---------- Knee armour pads + hydraulic pistons on legs ----------
    const legL = root.getObjectByName('legL');
    const legR = root.getObjectByName('legR');
    function addLegDetails(leg) {
      if (!leg) return;
      // Knee armour pad (around the existing knee sphere at y -3.4)
      const kneePad = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), panelMat);
      kneePad.position.set(0, -3.4, 0.2);
      leg.add(kneePad);
      // Hydraulic piston on outer side of thigh
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), pistonMat);
      piston.position.set(0.6, -2.4, -0.4);
      leg.add(piston);
      // Shin glow stripe
      const shinGlow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.08), seamMat);
      shinGlow.position.set(0, -5.0, 0.36);
      leg.add(shinGlow);
    }
    addLegDetails(legL);
    addLegDetails(legR);

  } else { // gojira
    // ---------- Iconic maple-leaf dorsal fins with atomic glow ----------
    const finMat = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, emissive: cfg.spineColor, emissiveIntensity: 0.7,
      roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide,
    });
    const finGlowMat = new THREE.MeshStandardMaterial({
      color: 0xeeffcc, emissive: 0xaaff77, emissiveIntensity: 2.6,
      roughness: 0.2, side: THREE.DoubleSide,
    });
    const scarMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
    const scaleMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color).multiplyScalar(1.2),
      roughness: 0.85,
    });
    // Maple leaf shape (5 lobes)
    function makeMapleShape(s) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      const lobes = 5;
      for (let i = 0; i < lobes; i++) {
        const t = i / (lobes - 1);
        const ang = -Math.PI * 0.15 + t * Math.PI * 1.3;
        const r = s * (0.7 + 0.3 * Math.sin(t * Math.PI));
        sh.lineTo(Math.cos(ang) * r, Math.abs(Math.sin(ang)) * r);
      }
      sh.lineTo(0, 0);
      return sh;
    }
    // Inner-glow shape (smaller, runs down the centre of each fin)
    function makeGlowShape(s) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(s * 0.35, s * 0.4);
      sh.lineTo(s * 0.55, s * 0.85);
      sh.lineTo(s * 0.40, s * 1.0);
      sh.lineTo(s * 0.15, s * 0.7);
      sh.lineTo(0, 0);
      return sh;
    }
    // 11 dorsal fin pairs (the original 9 plus 2 more for fuller plate row)
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const sz = 1.7 - 1.05 * t;
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(makeMapleShape(sz)), finMat);
      fin.rotation.y = Math.PI / 2;
      fin.position.set(0, 14.4 - t * 9.0, -1.35 - t * 0.18);
      root.add(fin);
      // Atomic-glow inner plate (slightly in front of the fin so it shines through)
      const glow = new THREE.Mesh(new THREE.ShapeGeometry(makeGlowShape(sz)), finGlowMat);
      glow.rotation.y = Math.PI / 2;
      glow.position.set(0.05, 14.4 - t * 9.0 + sz * 0.05, -1.35 - t * 0.18);
      root.add(glow);
      // Backing dark ridge plate so the fin reads against the body in silhouette
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, sz * 0.9, 0.12), scarMat);
      ridge.position.set(0, 14.4 - t * 9.0 + sz * 0.4, -1.4 - t * 0.18);
      root.add(ridge);
    }
    // Lateral fin row -- smaller offset fins on each side
    for (let i = 1; i < 7; i++) {
      const t = i / 6;
      const sz = 0.9 - 0.5 * t;
      for (const sx of [-0.55, 0.55]) {
        const lat = new THREE.Mesh(new THREE.ShapeGeometry(makeMapleShape(sz)), finMat);
        lat.rotation.y = Math.PI / 2;
        lat.position.set(sx, 13.0 - t * 7.0, -1.55 - t * 0.18);
        lat.scale.set(0.7, 0.7, 0.7);
        root.add(lat);
      }
    }

    // ---------- DENSE REPTILIAN BACK ----------
    // What the camera sees most often is the kaiju's back, so it gets the
    // heaviest detail pass: a hex-grid scale pattern, overlapping
    // crocodile-style backplates between every fin pair, vertebral spine
    // bumps, lateral flank scales, and dense tail scales.
    const scaleHigh = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color).multiplyScalar(1.2),
      roughness: 0.85,
    });
    const scaleLow = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color).multiplyScalar(0.65),
      roughness: 0.95,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color).multiplyScalar(0.8),
      roughness: 0.85, metalness: 0.08,
    });

    // 1) Dense back scale field (hex-offset grid) -- one InstancedMesh.
    const scaleGeom = new THREE.SphereGeometry(0.16, 6, 5);
    const dummy = new THREE.Object3D();
    {
      const positions = [];
      for (let row = 0; row < 11; row++) {
        const cols = row < 2 ? 5 : (row < 8 ? 4 : 3);
        const hexOff = (row % 2) * 0.28;
        for (let i = 0; i < cols; i++) {
          const cx = (i - (cols - 1) / 2) * 0.6 + hexOff;
          const sy = 14.6 - row * 0.85 + (Math.random() - 0.5) * 0.18;
          const sz = -1.55 - Math.abs(cx) * 0.04 + (Math.random() - 0.5) * 0.1;
          positions.push({
            x: cx, y: sy, z: sz,
            sx: 0.85 + Math.random() * 0.45,
            ry: Math.random() * Math.PI * 2,
          });
        }
      }
      const im = new THREE.InstancedMesh(scaleGeom, scaleHigh, positions.length);
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.sx, 0.42 * p.sx, p.sx);
        dummy.rotation.set(0.1, p.ry, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      root.add(im);
    }

    // 2) Crocodile-style overlapping backplates running between each
    //    dorsal fin pair (8 plates, getting smaller toward the tail).
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const w = 1.6 - 0.8 * t;
      const h = 0.45;
      const d = 1.2 - 0.5 * t;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plateMat);
      plate.position.set(0, 13.2 - t * 7.5, -0.75 - t * 0.2);
      plate.rotation.x = -0.12 - t * 0.04;
      // Slight z-tilt for organic look
      plate.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.02;
      root.add(plate);
      // Beveled edge plate underneath each backplate (darker, slightly larger)
      const bevel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.18, d + 0.18), scaleLow);
      bevel.position.set(0, 13.2 - t * 7.5 - 0.2, -0.75 - t * 0.2);
      bevel.rotation.x = -0.12 - t * 0.04;
      root.add(bevel);
    }

    // 3) Vertebral spine bumps -- 14 osteoderm bumps along the dorsal
    //    midline (between the dorsal fin row and the backplates).
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const r = 0.28 - t * 0.08;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), plateMat);
      bump.position.set(0, 14.5 - t * 8.4, -1.42 - t * 0.18);
      bump.scale.set(1, 0.55, 1);
      root.add(bump);
    }

    // 4) Lateral flank scales (smaller, denser) -- one InstancedMesh
    //    covering both flanks from shoulders to hips.
    {
      const positions = [];
      for (let row = 0; row < 9; row++) {
        for (const side of [-1, 1]) {
          for (let col = 0; col < 4; col++) {
            const yOff = (col % 2) * 0.18;
            positions.push({
              x: side * (1.45 + col * 0.42),
              y: 13.5 - row * 0.85 + yOff,
              z: -0.4 - col * 0.18,
              sx: 0.7 + Math.random() * 0.3,
              ry: side * Math.PI / 2,
            });
          }
        }
      }
      const im = new THREE.InstancedMesh(scaleGeom, scaleHigh, positions.length);
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.sx, 0.32 * p.sx, p.sx);
        dummy.rotation.set(0, p.ry, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      root.add(im);
    }

    // 5) Shoulder + upper-arm scale clumps (chunkier than back scales).
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const sc = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.08, 8, 6), scaleHigh);
        sc.position.set(sx * (2.4 + (Math.random() - 0.5) * 0.5),
                        12.6 + (Math.random() - 0.5) * 1.0,
                        -0.4 + (Math.random() - 0.5) * 0.6);
        sc.scale.set(1, 0.55, 1);
        root.add(sc);
      }
    }

    // 6) Neck spikes (small dorsal spines on the neck connecting torso to head)
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16 - t * 0.05, 0.55 - t * 0.15, 5), spineMat);
      sp.position.set(0, 13.2 + t * 1.4, -0.7 + t * 0.2);
      sp.rotation.x = -0.4 + t * 0.2;
      root.add(sp);
    }

    // 7) Tail dense back-scales (instanced) running down the tail's top
    {
      const positions = [];
      for (let row = 0; row < 9; row++) {
        const t = row / 8;
        const cols = 3 - Math.floor(t * 2);
        const w = 0.3 - t * 0.15;
        for (let c = 0; c < cols; c++) {
          positions.push({
            x: (c - (cols - 1) / 2) * w * 1.6,
            y: 0.45 - t * 0.35,
            z: -0.4 - row * 0.95,
            sx: w / 0.18,
          });
        }
      }
      const im = new THREE.InstancedMesh(scaleGeom, scaleHigh, positions.length);
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.sx, 0.4 * p.sx, p.sx);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      tail.add(im);
    }

    // 8) Tail underside scutes (lighter, broader plates running under the tail)
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const sw = 1.0 - t * 0.5;
      const sc = new THREE.Mesh(
        new THREE.BoxGeometry(sw, 0.18, 0.7),
        new THREE.MeshStandardMaterial({ color: cfg.bellyColor, roughness: 0.7 })
      );
      sc.position.set(0, -0.55 + t * 0.2, -0.6 - i * 1.05);
      sc.rotation.x = 0.05 + t * 0.05;
      tail.add(sc);
    }
    // ---------- Chest scars (existing) -- now beefier ----------
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), scarMat);
      s.position.set(-1.6 + i * 0.8, 11.5 - i * 0.3, 2.45);
      s.scale.set(1.0, 0.3, 0.4);
      root.add(s);
    }
    // Old battle scar across the chest (long diagonal slash)
    const slash = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.1), scarMat);
    slash.position.set(0.6, 11.6, 2.55);
    slash.rotation.z = -0.5;
    root.add(slash);

    // ---------- Knee + elbow + shoulder spikes ----------
    // Shoulder spike clusters (3 small spikes per shoulder)
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), spineMat);
        sp.position.set(sx * 2.7, 12.6 + i * 0.45, -0.4 - i * 0.08);
        sp.rotation.x = -0.3;
        sp.rotation.z = sx * 0.4;
        root.add(sp);
      }
    }
    // Elbow spurs (find the existing arm groups)
    {
      const armL = root.getObjectByName('armL');
      const armR = root.getObjectByName('armR');
      function addElbowSpike(arm, sign) {
        if (!arm) return;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 5), spineMat);
        spike.position.set(sign * 0.6, -3.0, -0.2);
        spike.rotation.z = sign * Math.PI / 2;
        arm.add(spike);
      }
      addElbowSpike(armL, -1);
      addElbowSpike(armR,  1);
    }
    // Knee spurs
    {
      const legL = root.getObjectByName('legL');
      const legR = root.getObjectByName('legR');
      function addKneeSpike(leg) {
        if (!leg) return;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), spineMat);
        spike.position.set(0, -3.4, 0.7);
        spike.rotation.x = -Math.PI / 2;
        leg.add(spike);
      }
      addKneeSpike(legL); addKneeSpike(legR);
    }

    // ---------- Tail crest (extra row of plates running down the tail) ----------
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const sz = 0.9 - 0.5 * t;
      const plate = new THREE.Mesh(new THREE.ShapeGeometry(makeMapleShape(sz)), finMat);
      plate.rotation.y = Math.PI / 2;
      plate.position.set(0, 0.5 - t * 0.2, -i * 1.05);
      tail.add(plate);
      // Glow strip inside each tail plate too
      const tailGlow = new THREE.Mesh(new THREE.ShapeGeometry(makeGlowShape(sz)), finGlowMat);
      tailGlow.rotation.y = Math.PI / 2;
      tailGlow.position.set(0.05, 0.5 - t * 0.2 + sz * 0.05, -i * 1.05);
      tail.add(tailGlow);
    }
    // Two big spikes along the tail's underside
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 5), scarMat);
      sp.position.set(0, -0.6, -1.5 - i * 1.5);
      sp.rotation.x = Math.PI;
      tail.add(sp);
    }
  }

  // Apply scale (and a faint forward lean for posture)
  root.scale.setScalar(cfg.stats.scale);
  return { root, head, tail };
}

// ------------- TITLE-SCREEN PREVIEW RENDER -------------
// Renders each MONSTERS entry into a small data-URL image using a one-off
// WebGLRenderer, so the menu shows actual 3D portraits instead of emojis.
export function renderMonsterPreviews(size = 220) {
  // preserveDrawingBuffer is REQUIRED for toDataURL() to capture the rendered
  // pixels on Safari/iOS -- without it the WebGL backbuffer is cleared after
  // present and we'd hand back a blank PNG.
  const r = new THREE.WebGLRenderer({
    antialias: true, alpha: true, powerPreference: 'low-power',
    preserveDrawingBuffer: true,
  });
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.5;
  r.outputColorSpace = THREE.SRGBColorSpace;

  const out = {};
  for (const key of Object.keys(MONSTERS)) {
    const cfg = MONSTERS[key];
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffaa88, 0x44334a, 1.2));
    const sun = new THREE.DirectionalLight(0xffdcb0, 1.7);
    sun.position.set(6, 14, 6);
    sc.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
    fill.position.set(-6, 5, -8);
    sc.add(fill);
    sc.add(new THREE.AmbientLight(0x556677, 0.6));

    const k = buildKaiju(cfg);
    k.root.position.set(0, -7, 0);
    k.root.rotation.y = Math.PI / 7;
    sc.add(k.root);

    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(0, 5, 36);
    cam.lookAt(0, 6, 0);

    r.render(sc, cam);
    out[key] = r.domElement.toDataURL('image/png');

    // Dispose temp meshes' geometry/materials we created here
    sc.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }
  r.dispose();
  return out;
}
