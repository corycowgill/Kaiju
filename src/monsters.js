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
    // Two additional flanking heads on curved necks coming out of the shoulders.
    function makeSideHead(side) {
      const g = new THREE.Group();
      // Neck: 5 spheres curving outward and forward
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.7 - t * 0.2, 10, 8), bodyMat);
        seg.position.set(nx, ny, nz);
        g.add(seg);
        nx += side * 0.45;
        ny += 0.55 - t * 0.1;
        nz += 0.4;
      }
      // Mini head at tip of neck
      const hg = new THREE.Group();
      const sk = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), bodyMat);
      sk.scale.set(1.1, 0.9, 1.4);
      hg.add(sk);
      const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 1.2, 10), bodyMat);
      sn.rotation.x = Math.PI / 2;
      sn.position.set(0, -0.1, 1.0);
      hg.add(sn);
      // Eyes
      const eL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), eyeMat);
      eL.position.set(-0.45, 0.18, 0.85);
      hg.add(eL);
      const eR = eL.clone(); eR.position.x = 0.45; hg.add(eR);
      // Forehead horn
      const fh = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 5), spineMat);
      fh.position.set(0, 0.85, -0.05);
      fh.rotation.x = -0.3;
      hg.add(fh);
      hg.position.set(nx, ny, nz);
      g.add(hg);
      g.position.set(side * 2.2, 12.4, 0.4);
      return g;
    }
    root.add(makeSideHead(-1));
    root.add(makeSideHead( 1));

    // Wing membranes: two angled fan-like meshes off the upper back
    const wingMat = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, side: THREE.DoubleSide,
      roughness: 0.6, metalness: 0.2,
      emissive: cfg.spineColor, emissiveIntensity: 0.3,
    });
    function makeWing(side) {
      // Use a stretched plane with skew via geometry
      const w = 7.0, h = 5.5;
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), wingMat);
      wing.position.set(side * 3.5, 13.0, -2.0);
      wing.rotation.y = side * -0.35;
      wing.rotation.z = side * -0.6;
      wing.rotation.x = -0.25;
      return wing;
    }
    root.add(makeWing(-1));
    root.add(makeWing(1));

  } else if (variant === 'mecha') {
    // Glowing chest core
    const coreMat = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, emissive: cfg.spineColor, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.7,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.6, 16), coreMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 11.2, 2.4);
    root.add(core);
    // Outer ring around core
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.18, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 })
    );
    ring.position.copy(core.position);
    root.add(ring);

    // Antenna / sensor on the head
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7 })
    );
    ant.position.set(0, 16.5, -0.1);
    root.add(ant);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff3322, emissiveIntensity: 2.5 })
    );
    tip.position.set(0, 17.4, -0.1);
    root.add(tip);

    // Shoulder pistons (small cylinders sticking out)
    const pistonMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9, roughness: 0.2 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 8), pistonMat);
      p.position.set(sx * 2.7, 13.1, 1.2);
      p.rotation.z = sx * 0.3;
      root.add(p);
    }

    // Rivet ring around the torso (small spheres along the seam)
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rv = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
      );
      rv.position.set(Math.cos(ang) * 2.95, 9.0, Math.sin(ang) * 2.95);
      root.add(rv);
    }
    // Vent slits on chest
    const vent = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0x661100, emissiveIntensity: 0.6 });
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), vent);
      v.position.set(0, 12.5 - i * 0.4, 1.95);
      root.add(v);
    }

  } else { // gojira
    // Iconic maple-leaf-shaped dorsal fins via custom shape geometry along the back.
    // We replace nothing -- the standard cones already exist; we just LAYER bigger
    // angular plates around them so the silhouette reads as classic-G.
    const finMat = new THREE.MeshStandardMaterial({
      color: cfg.spineColor, emissive: cfg.spineColor, emissiveIntensity: 0.7,
      roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide,
    });
    // Build a "maple leaf" shape (5 lobes)
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
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const sz = 1.6 - 1.0 * t;
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(makeMapleShape(sz)), finMat);
      fin.rotation.y = Math.PI / 2; // face sideways
      fin.position.set(0, 14.0 - t * 8.5, -1.35 - t * 0.2);
      root.add(fin);
    }
    // Extra cheek scales / chest scars
    const scarMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), scarMat);
      s.position.set(-1.4 + i * 0.9, 11.5 - i * 0.4, 2.4);
      s.scale.set(1.0, 0.3, 0.4);
      root.add(s);
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
