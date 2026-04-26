import * as THREE from 'three';

// Procedural Tokyo: districts of buildings on a city grid, with streets, lamps, and props.
// Each building exposes hp, max_hp, height and methods damage()/destroy().

const BUILDING_PALETTE = [
  0xb0b8c4, 0x9aa3ad, 0x7d8694, 0xc8cbd1, 0x6f7a87,
  0xa8b0a8, 0xc0b8a8, 0x8090a0, 0xddc8a0, 0x556677,
];
const NEON_COLORS = [0xff3366, 0x33ddff, 0xffaa22, 0xaa66ff, 0x66ff99, 0xffee44];

// Pool of Japanese sign phrases (food, entertainment, services, kanji+kana mix).
// Used by makeNeonSignTexture to bake a glowing label canvas-texture and
// then attached as both map + emissiveMap on the sign material so the
// glyphs actually emit light through bloom.
const NEON_PHRASES = [
  'カラオケ', 'ラーメン', '寿司', 'バー', 'ホテル', '居酒屋',
  'パチンコ', 'ゲーム', '焼鳥', '銀行', '東京', 'カフェ',
  'コンビニ', '書店', '映画', '怪獣', '電気', '地下鉄',
];
// Cache: one CanvasTexture per (phrase, color) so repeated buildings reuse.
const _signTexCache = new Map();
function makeNeonSignTexture(text, colorHex) {
  const key = text + ':' + colorHex;
  const hit = _signTexCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0006';
  g.fillRect(0, 0, c.width, c.height);
  const colorStr = '#' + colorHex.toString(16).padStart(6, '0');
  // Layered glow then crisp text on top
  g.font = 'bold 56px "Noto Sans JP", "Yuji Mai", sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.shadowColor = colorStr;
  g.shadowBlur = 28;
  g.fillStyle = colorStr;
  g.fillText(text, c.width / 2, c.height / 2);
  g.shadowBlur = 14;
  g.fillText(text, c.width / 2, c.height / 2);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText(text, c.width / 2, c.height / 2);
  // Thin border frame
  g.strokeStyle = colorStr;
  g.lineWidth = 4;
  g.strokeRect(2, 2, c.width - 4, c.height - 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _signTexCache.set(key, tex);
  return tex;
}

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ----------------------- Landmark mesh helpers -----------------------

// Single tree: trunk cylinder + sphere foliage. Positioned at (x, 0, z) inside its parent.
function makeTree(x = 0, z = 0, scale = 1) {
  const tree = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x346a2a, roughness: 0.85 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, 4 * scale, 6), trunkMat);
  trunk.position.y = 2 * scale;
  tree.add(trunk);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(2 * scale, 8, 6), leafMat);
  leaves.position.y = 5 * scale;
  leaves.scale.set(1.2, 1.0, 1.2);
  tree.add(leaves);
  tree.position.set(x, 0, z);
  tree.matrixAutoUpdate = false; tree.updateMatrix();
  return tree;
}

// City park: grass square with a path, scattered trees, optional pond.
function makePark(x, z, size = 32) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x346a2a, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.12;
  ground.receiveShadow = true;
  group.add(ground);
  // Cross-shaped path
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.95 });
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, size * 0.95), pathMat);
  p1.rotation.x = -Math.PI / 2; p1.position.y = 0.16; group.add(p1);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.95, 2.4), pathMat);
  p2.rotation.x = -Math.PI / 2; p2.position.y = 0.16; group.add(p2);
  // Trees scattered (avoiding the cross paths)
  const half = size / 2 - 2;
  for (let i = 0; i < 14; i++) {
    const tx = rand(-half, half), tz = rand(-half, half);
    if (Math.abs(tx) < 1.6 || Math.abs(tz) < 1.6) continue; // skip on path
    const sc = 0.8 + Math.random() * 0.5;
    group.add(makeTree(tx, tz, sc));
  }
  // Optional pond
  if (Math.random() < 0.6) {
    const pondMat = new THREE.MeshStandardMaterial({
      color: 0x336a99, roughness: 0.2, metalness: 0.6,
      emissive: 0x224466, emissiveIntensity: 0.2,
    });
    const pond = new THREE.Mesh(new THREE.CircleGeometry(size * 0.18, 18), pondMat);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(size * 0.22, 0.18, size * 0.15);
    group.add(pond);
  }
  // Park bench (stylized)
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x664433, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.7), benchMat);
    seat.position.y = 0.7;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.12), benchMat);
    back.position.set(0, 1.25, -0.3);
    bench.add(back);
    bench.position.set(rand(-half + 1, half - 1), 0, rand(-half + 1, half - 1));
    bench.rotation.y = Math.random() * Math.PI * 2;
    group.add(bench);
  }
  group.matrixAutoUpdate = false; group.updateMatrix();
  return group;
}

// Tokyo Tower: red/white lattice with observation deck, antenna spire, and beacon.
function makeTokyoTowerMesh(height = 90) {
  const group = new THREE.Group();
  const redMat   = new THREE.MeshStandardMaterial({ color: 0xd72b35, roughness: 0.55, metalness: 0.2 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7  });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9  });

  const baseR = 7.0, midR = 2.6, topR = 0.9;
  // Four legs - tapered along the height. We split into two segments so the
  // colour can split red/white realistically.
  function leg(sx, sz) {
    const segs = 12;
    const path = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = baseR * (1 - t) + topR * t;
      path.push(new THREE.Vector3(sx * r, t * height, sz * r));
    }
    // Use a simple cylinder strip approximated by a thin box per segment.
    for (let i = 0; i < segs; i++) {
      const a = path[i], b = path[i + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len + 0.1, 5), redMat);
      seg.position.copy(mid);
      // orient cylinder Y-axis along (a -> b)
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      seg.quaternion.copy(q);
      group.add(seg);
    }
  }
  leg(-1, -1); leg( 1, -1); leg(-1,  1); leg( 1,  1);

  // Horizontal cross-bracing rings every ~12u
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const y = t * height * 0.85;
    const r = baseR * (1 - t) + topR * t;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.18, 5, 12), redMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
    // X bracing
    for (const ang of [Math.PI / 4, -Math.PI / 4]) {
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, r * 2.2, 4), redMat);
      brace.position.y = y;
      brace.rotation.z = ang;
      group.add(brace);
    }
  }

  // Lower observation deck (small white box with windows)
  const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(midR * 1.2, midR * 1.4, 4.0, 12), whiteMat);
  deck1.position.y = height * 0.55;
  group.add(deck1);
  // Window strip
  const windows = new THREE.Mesh(
    new THREE.CylinderGeometry(midR * 1.21, midR * 1.21, 1.6, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffeeaa, emissiveIntensity: 0.7 })
  );
  windows.position.y = height * 0.55;
  group.add(windows);

  // Upper observation deck (smaller, higher)
  const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(topR * 2.2, topR * 2.8, 2.5, 10), whiteMat);
  deck2.position.y = height * 0.78;
  group.add(deck2);

  // Antenna spire (dark)
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.55, height * 0.22, 6), darkMat);
  spire.position.y = height * 0.91;
  group.add(spire);

  // Red beacon at top
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.5 })
  );
  beacon.position.y = height * 1.02;
  group.add(beacon);

  group.matrixAutoUpdate = false; group.updateMatrix();
  return group;
}

// Industrial factory complex: warehouses, smokestacks with banded
// red/white striping, big storage tanks, and pipes.
function makeFactoryDistrict() {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.95 });
  const wallMat     = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9  });
  const metalMat    = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4, metalness: 0.7 });
  const pipeMat     = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.5 });
  const stackMat    = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
  const stackRedMat = new THREE.MeshStandardMaterial({ color: 0xc23333, roughness: 0.6 });
  const tankMat     = new THREE.MeshStandardMaterial({ color: 0xaaa388, roughness: 0.5, metalness: 0.3 });
  const beaconMat   = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.2 });

  // Concrete pad
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), concreteMat);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.12;
  pad.receiveShadow = true;
  group.add(pad);

  // Two large warehouses (low and wide with sloped corrugated roofs)
  for (const [px, pz, w, d, hh] of [
    [-30, -10, 40, 26, 14],
    [ 30,  10, 40, 26, 12],
  ]) {
    const wh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wallMat);
    wh.position.set(px, hh / 2, pz);
    group.add(wh);
    // Sloped roof: a thin angled box
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.85, metalness: 0.2 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), roofMat);
    roof.position.set(px, hh + 0.3, pz);
    group.add(roof);
    // Vent stacks on top
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.5, 8), pipeMat);
      v.position.set(px - w * 0.3 + i * w * 0.3, hh + 1.85, pz);
      group.add(v);
    }
  }

  // Two banded smokestacks
  for (const [sx, sz] of [[-45, 22], [45, -22]]) {
    const totalH = 38;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, totalH, 14), stackMat);
    stack.position.set(sx, totalH / 2, sz);
    group.add(stack);
    // Red bands (3)
    for (let b = 0; b < 3; b++) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(2.45, 2.85, 2.4, 14, 1, true),
        stackRedMat
      );
      ring.position.set(sx, 6 + b * 10, sz);
      group.add(ring);
    }
    // Beacon at top
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), beaconMat);
    beacon.position.set(sx, totalH + 0.5, sz);
    group.add(beacon);
    // A thin smoke column (drifting puff effect could be added later, but
    // a soft semi-transparent cone is enough for static look)
    const smokeMat = new THREE.MeshStandardMaterial({ color: 0xccc4b8, transparent: true, opacity: 0.45, depthWrite: false });
    const smoke = new THREE.Mesh(new THREE.ConeGeometry(3.2, 9, 10), smokeMat);
    smoke.position.set(sx, totalH + 4, sz);
    smoke.rotation.x = Math.PI;
    group.add(smoke);
  }

  // Three big storage tanks (cylinders) with capped tops
  for (const [tx, tz] of [[-15, 32], [0, 36], [15, 32]]) {
    const r = 5, hh = 9;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 18), tankMat);
    t.position.set(tx, hh / 2, tz);
    group.add(t);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      tankMat
    );
    cap.position.set(tx, hh, tz);
    group.add(cap);
    // Thin pipe between tanks
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8, 6), pipeMat);
    pipe.position.set(tx, hh + 1.5, tz - 4);
    pipe.rotation.x = Math.PI / 2;
    group.add(pipe);
  }
  // Catwalk pipe connecting warehouses to tanks
  const catwalk = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 0.8), pipeMat);
  catwalk.position.set(0, 12, 22);
  group.add(catwalk);

  // Chain-link fence (low gray boxes around perimeter)
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
  for (const [px, pz, w, d] of [
    [0,  44, 116, 0.2],
    [0, -44, 116, 0.2],
    [ 58, 0, 0.2, 88],
    [-58, 0, 0.2, 88],
  ]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.0, d), fenceMat);
    f.position.set(px, 1.0, pz);
    group.add(f);
  }

  group.matrixAutoUpdate = false; group.updateMatrix();
  return group;
}

// Nuclear plant: two cooling towers (hyperboloid via lathe), reactor dome,
// concrete base, perimeter fence, and a static steam puff at each tower.
// Construction site: a half-built skyscraper (concrete shell + visible
// rebar floors) standing next to a tall yellow tower crane with a
// counterweight, hook, and cable. Surrounded by orange-and-white safety
// fencing and a couple of porta-potties / material pallets for flavour.
function makeConstructionSite() {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x554d40, roughness: 0.95 });
  const steelMat   = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.45, metalness: 0.7 });
  const yellowMat  = new THREE.MeshStandardMaterial({ color: 0xffd11a, roughness: 0.55, metalness: 0.3, emissive: 0xff8811, emissiveIntensity: 0.25 });
  const orangeMat  = new THREE.MeshStandardMaterial({ color: 0xff7733, roughness: 0.6 });
  const cableMat   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const fenceMat   = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });

  // Concrete pad / dirt
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.95 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), dirtMat);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.13;
  pad.receiveShadow = true;
  group.add(pad);

  // Half-built skyscraper: concrete frame with 6 visible floors, no
  // facade above the bottom 2.
  const floors = 6;
  const floorH = 4;
  const w = 16, d = 16;
  for (let f = 0; f < floors; f++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), concreteMat);
    slab.position.set(-12, f * floorH + 0.25, 0);
    group.add(slab);
    // Corner columns
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, floorH, 0.7), concreteDark);
      col.position.set(-12 + sx * (w / 2 - 0.4), f * floorH + floorH / 2, sz * (d / 2 - 0.4));
      group.add(col);
    }
    // Edge rebar / safety rail along open floors (top 3)
    if (f >= 3) {
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, d), orangeMat);
        rail.position.set(-12 + sx * (w / 2 - 0.05), f * floorH + 1.0, 0);
        group.add(rail);
      }
    }
    // Bottom 2 floors get a partial facade
    if (f < 2) {
      const facade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, floorH * 0.95, 0.2), concreteMat);
      facade.position.set(-12, f * floorH + floorH / 2, d / 2);
      group.add(facade);
    }
  }
  // Rebar sprouting from the top floor (8 thin rusty cylinders)
  for (let i = 0; i < 8; i++) {
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), orangeMat);
    rebar.position.set(-12 + (Math.random() - 0.5) * 12, floors * floorH + 0.7, (Math.random() - 0.5) * 12);
    group.add(rebar);
  }

  // Tower crane next to the building
  const craneX = 8;
  const mastH = floors * floorH + 12;
  // Square mast (4 vertical struts + horizontal cross-bracing)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.18, mastH, 0.18), yellowMat);
    strut.position.set(craneX + sx * 0.7, mastH / 2, sz * 0.7);
    group.add(strut);
  }
  // Cross-bracing at intervals along the mast
  for (let i = 1; i < 8; i++) {
    const y = (i / 8) * mastH;
    const brace1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), yellowMat);
    brace1.position.set(craneX, y, 0.7); group.add(brace1);
    const brace2 = brace1.clone(); brace2.position.z = -0.7; group.add(brace2);
    const brace3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), yellowMat);
    brace3.position.set(craneX + 0.7, y, 0); group.add(brace3);
    const brace4 = brace3.clone(); brace4.position.x = craneX - 0.7; group.add(brace4);
    // Diagonal X bracing per face
    const xb1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.08), yellowMat);
    xb1.position.set(craneX, y - 0.5, 0.7); xb1.rotation.z = 0.6; group.add(xb1);
    const xb2 = xb1.clone(); xb2.rotation.z = -0.6; group.add(xb2);
  }
  // Operator cab at the top
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.8), yellowMat);
  cab.position.set(craneX, mastH + 1.2, 0);
  group.add(cab);
  const cabWindow = new THREE.Mesh(
    new THREE.BoxGeometry(2.62, 0.9, 1.82),
    new THREE.MeshStandardMaterial({ color: 0x3366aa, emissive: 0x224488, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.5 })
  );
  cabWindow.position.copy(cab.position);
  cabWindow.position.y -= 0.1;
  group.add(cabWindow);
  // Long horizontal jib (working arm)
  const jibLen = 18;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(jibLen, 0.7, 0.7), yellowMat);
  jib.position.set(craneX + jibLen / 2 - 2, mastH + 2.3, 0);
  group.add(jib);
  // Jib tower (small triangle frame on top)
  const apex = new THREE.Mesh(new THREE.ConeGeometry(0.25, 3.5, 4), yellowMat);
  apex.position.set(craneX, mastH + 4.0, 0);
  group.add(apex);
  // Cables from apex to jib tip and to counter-jib
  function cable(fromX, fromY, toX, toY) {
    const dx = toX - fromX, dy = toY - fromY;
    const len = Math.hypot(dx, dy);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 4), cableMat);
    cab.position.set((fromX + toX) / 2, (fromY + toY) / 2, 0);
    cab.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    group.add(cab);
  }
  cable(craneX, mastH + 5.7, craneX + jibLen - 2, mastH + 2.7);
  cable(craneX, mastH + 5.7, craneX - 5, mastH + 2.7);
  // Counter-jib (short arm with counterweight)
  const cjib = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 0.7), yellowMat);
  cjib.position.set(craneX - 4.5, mastH + 2.3, 0);
  group.add(cjib);
  const counterweight = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.6), concreteDark);
  counterweight.position.set(craneX - 7.0, mastH + 1.7, 0);
  group.add(counterweight);
  // Hoist trolley + hook hanging from the jib
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), steelMat);
  trolley.position.set(craneX + jibLen - 4, mastH + 1.95, 0);
  group.add(trolley);
  // Hook cable (long)
  cable(trolley.position.x, mastH + 1.85, trolley.position.x, 6);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.18, 6, 12), steelMat);
  hook.position.set(trolley.position.x, 5.6, 0);
  hook.rotation.x = Math.PI / 2;
  group.add(hook);
  // Suspended construction load (concrete block)
  const load = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.6), concreteMat);
  load.position.set(trolley.position.x, 4.2, 0);
  group.add(load);

  // Orange-and-white safety fence around the perimeter (instanced strips)
  for (const [px, pz, w2, d2] of [
    [0,  26, 56, 0.18],
    [0, -26, 56, 0.18],
    [ 26, 0, 0.18, 52],
    [-26, 0, 0.18, 52],
  ]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w2, 1.6, d2), fenceMat);
    f.position.set(px, 0.8, pz);
    group.add(f);
    // Orange caution ribbon along the top
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(w2 + 0.05, 0.18, d2 + 0.05), orangeMat);
    ribbon.position.set(px, 1.7, pz);
    group.add(ribbon);
  }

  // Material pallets + porta-potty for flavour
  const palletMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.6), palletMat);
    pallet.position.set(-2 - i * 3, 0.3, 16);
    group.add(pallet);
    // Stacked rebar bundles on top
    const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 8), orangeMat);
    bundle.rotation.z = Math.PI / 2;
    bundle.position.set(pallet.position.x, 0.85, 16);
    group.add(bundle);
  }
  // Porta-potty
  const potty = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.4), new THREE.MeshStandardMaterial({ color: 0x66aa55, roughness: 0.7 }));
  potty.position.set(15, 1.3, -18);
  group.add(potty);
  const pottyDoor = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.0, 0.05), concreteDark);
  pottyDoor.position.set(15, 1.0, -17.27);
  group.add(pottyDoor);

  // Big "工事中" (UNDER CONSTRUCTION) sign on the front fence
  const signFace = new THREE.Mesh(
    new THREE.BoxGeometry(8, 2.4, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xffd11a, emissive: 0xffaa11, emissiveIntensity: 0.6 })
  );
  signFace.position.set(0, 3.2, 26.2);
  group.add(signFace);

  return group;
}

function makeNuclearPlant() {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xa6a6a4, roughness: 0.92 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.95 });
  const reactorMat  = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, roughness: 0.4, metalness: 0.55 });
  const containmentMat = new THREE.MeshStandardMaterial({ color: 0xb6b6b0, roughness: 0.7 });
  const hazardMat   = new THREE.MeshStandardMaterial({ color: 0xffd11a, emissive: 0xff7700, emissiveIntensity: 0.7, roughness: 0.55 });
  const hazardBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const trefoilMat  = new THREE.MeshStandardMaterial({ color: 0xffd11a, emissive: 0xffaa00, emissiveIntensity: 1.6 });
  const reactorGlow = new THREE.MeshStandardMaterial({ color: 0x66ff99, emissive: 0x33ee88, emissiveIntensity: 1.8 });
  const blueWindow  = new THREE.MeshStandardMaterial({ color: 0x335577, emissive: 0x66bbff, emissiveIntensity: 0.9 });

  // Larger concrete pad
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(140, 120), concreteDark);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.12;
  pad.receiveShadow = true;
  group.add(pad);
  // Ground hazard stripes (yellow + black diagonal at the entry)
  for (let i = 0; i < 8; i++) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 8),
      i % 2 === 0 ? hazardMat : hazardBlack
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-50 + i * 3, 0.16, 50);
    group.add(stripe);
  }

  // ----------- Cooling towers (taller, more pinched waist) -----------
  function makeCoolingTower(x, z, height = 88) {
    const points = [];
    const segs = 22;
    const r0 = 14;       // base radius
    const rWaist = 9;    // pinched waist radius
    const rTop = 11;     // flared top radius
    const waistT = 0.62; // proportional height of the waist
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      let r;
      if (t < waistT) {
        const k = t / waistT;
        r = r0 * (1 - k) + rWaist * k;
      } else {
        const k = (t - waistT) / (1 - waistT);
        r = rWaist * (1 - k) + rTop * k;
      }
      points.push(new THREE.Vector2(r, t * height));
    }
    const lathe = new THREE.Mesh(new THREE.LatheGeometry(points, 28), concreteMat);
    lathe.position.set(x, 0, z);
    group.add(lathe);
    // Yellow hazard band near the base
    const band = new THREE.Mesh(new THREE.CylinderGeometry(14.1, 14.1, 1.4, 28, 1, true), hazardMat);
    band.position.set(x, 4, z);
    group.add(band);
    // Inner shadow ring at top
    const innerRing = new THREE.Mesh(new THREE.CylinderGeometry(rTop * 0.95, rTop * 0.95, 0.4, 24), hazardBlack);
    innerRing.position.set(x, height + 0.2, z);
    group.add(innerRing);
    // Steam plume: stacked white spheres rising tall + wide
    const steamMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa, transparent: true, opacity: 0.7, depthWrite: false,
      emissive: 0xddeeff, emissiveIntensity: 0.15,
    });
    for (let i = 0; i < 8; i++) {
      const r = 6 + i * 1.8 + Math.random() * 2;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), steamMat);
      puff.position.set(
        x + (Math.random() - 0.5) * (8 + i * 2),
        height + 3 + i * 4.5,
        z + (Math.random() - 0.5) * (8 + i * 2),
      );
      puff.scale.y = 0.65 + Math.random() * 0.3;
      group.add(puff);
    }
    // Hot vent at the lip
    const vent = new THREE.Mesh(
      new THREE.TorusGeometry(rTop * 0.85, 0.4, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xff5522, emissiveIntensity: 1.2 })
    );
    vent.rotation.x = Math.PI / 2;
    vent.position.set(x, height + 0.6, z);
    group.add(vent);
  }
  makeCoolingTower(-32,  6, 92);
  makeCoolingTower( 32,  6, 88);

  // ----------- Containment building (big rectangular hall around / behind dome) -----------
  const hall = new THREE.Mesh(new THREE.BoxGeometry(50, 14, 26), containmentMat);
  hall.position.set(0, 7, -36);
  group.add(hall);
  // Big yellow stripe along the hall front
  const hallStripe = new THREE.Mesh(new THREE.BoxGeometry(50.2, 1.4, 26.2), hazardMat);
  hallStripe.position.set(0, 12.8, -36);
  group.add(hallStripe);
  // Window strip on the hall (lit from within)
  const hallWin = new THREE.Mesh(new THREE.BoxGeometry(50.05, 1.6, 26.05), blueWindow);
  hallWin.position.set(0, 8.5, -36);
  group.add(hallWin);
  // Roof vents on the hall
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 10), concreteDark);
    v.position.set(-18 + i * 12, 15.2, -36);
    group.add(v);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 10), hazardBlack);
    cap.position.set(-18 + i * 12, 16.4, -36);
    group.add(cap);
  }

  // ----------- Reactor dome -----------
  const domeR = 14;
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(domeR, domeR, 12, 24), concreteMat);
  domeBase.position.set(0, 6, -10);
  group.add(domeBase);
  // Yellow + black hazard ring at dome-base ground level
  for (let i = 0; i < 24; i++) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.0, 0.6),
      i % 2 === 0 ? hazardMat : hazardBlack
    );
    const a = (i / 24) * Math.PI * 2;
    seg.position.set(Math.cos(a) * domeR * 1.05, 0.6, -10 + Math.sin(a) * domeR * 1.05);
    seg.rotation.y = a + Math.PI / 2;
    group.add(seg);
  }
  // Dome itself
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(domeR, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    reactorMat
  );
  dome.position.set(0, 12, -10);
  group.add(dome);
  // Concrete ring at dome equator
  const equator = new THREE.Mesh(new THREE.TorusGeometry(domeR + 0.2, 0.6, 6, 28), concreteDark);
  equator.rotation.x = Math.PI / 2;
  equator.position.set(0, 12, -10);
  group.add(equator);
  // Glowing reactor windows around the base of the dome (4 sides)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.4), reactorGlow);
    win.position.set(Math.cos(a) * (domeR + 0.05), 8, -10 + Math.sin(a) * (domeR + 0.05));
    win.rotation.y = a + Math.PI / 2;
    group.add(win);
  }
  // Antenna / lightning rod on top
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 4, 6), hazardBlack);
  rod.position.set(0, 12 + domeR + 1.6, -10);
  group.add(rod);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.4 })
  );
  beacon.position.set(0, 12 + domeR + 3.6, -10);
  group.add(beacon);

  // ----------- Radioactive trefoil signs (yellow, glowing) -----------
  function makeTrefoil(cx, cy, cz, ry = 0) {
    const t = new THREE.Group();
    // Yellow circular plate
    const plate = new THREE.Mesh(new THREE.CircleGeometry(2.2, 18), hazardMat);
    t.add(plate);
    // Three black trefoil "blades" (thin pie wedges)
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 12, -Math.PI / 6, Math.PI / 3),
        trefoilMat
      );
      blade.rotation.z = (i / 3) * Math.PI * 2;
      blade.position.z = 0.05;
      t.add(blade);
    }
    // Center black disc
    const center = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), hazardBlack);
    center.position.z = 0.06;
    t.add(center);
    t.position.set(cx, cy, cz);
    t.rotation.y = ry;
    return t;
  }
  // Trefoil on the dome face (visible from the south approach)
  group.add(makeTrefoil(0, 12, 4.05, 0));
  // Trefoils on the containment hall ends
  group.add(makeTrefoil(-25.2, 8, -36, -Math.PI / 2));
  group.add(makeTrefoil( 25.2, 8, -36,  Math.PI / 2));

  // ----------- Pipework -----------
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.4, metalness: 0.65 });
  // Cooling-tower outflow trunk (large diameter pipes from each tower into hall)
  for (const cx of [-32, 32]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 28, 12), pipeMat);
    trunk.position.set(cx * 0.5, 6, -22);
    trunk.rotation.x = Math.PI / 2;
    trunk.rotation.y = Math.atan2(cx * 0.5 - cx, -22 - 6);
    group.add(trunk);
  }
  // Catwalk pipework along the back
  for (let i = 0; i < 5; i++) {
    const sup = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), concreteDark);
    sup.position.set(-30 + i * 15, 3.5, -52);
    group.add(sup);
    if (i < 4) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 8), pipeMat);
      pipe.position.set(-30 + i * 15 + 7.5, 7, -52);
      pipe.rotation.z = Math.PI / 2;
      group.add(pipe);
    }
  }

  // ----------- Perimeter fence (chain-link feel via vertical posts + crossbars) -----------
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
  for (const [px, pz, w, d] of [
    [0,  56, 130, 0.18],
    [0, -56, 130, 0.18],
    [ 64, 0, 0.18, 116],
    [-64, 0, 0.18, 116],
  ]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fenceMat);
    f.position.set(px, 1.2, pz);
    group.add(f);
  }
  // Fence posts every 8u along the front edge
  for (let i = -8; i <= 8; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.0, 0.25), fenceMat);
    post.position.set(i * 8, 1.5, 56);
    group.add(post);
  }

  // ----------- "NUCLEAR" sign on the front fence -----------
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xffd11a, emissive: 0xffaa22, emissiveIntensity: 0.9,
  });
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(28, 5, 0.6), hazardBlack);
  signFrame.position.set(0, 6, 56.1);
  group.add(signFrame);
  const signFace = new THREE.Mesh(new THREE.BoxGeometry(26, 3.4, 0.3), signMat);
  signFace.position.set(0, 6, 56.4);
  group.add(signFace);
  // Trefoil on the sign
  group.add(makeTrefoil(-10, 6, 56.6, 0));

  group.matrixAutoUpdate = false; group.updateMatrix();
  return group;
}

// River: a flat blue-emissive plane spanning E-W across the city, with a
// darker shoreline strip on either side.
function makeRiver(cityRadius, riverZ, riverWidth) {
  const group = new THREE.Group();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x224d6b, roughness: 0.2, metalness: 0.55,
    emissive: 0x102a3c, emissiveIntensity: 0.35,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(cityRadius * 2 + 80, riverWidth), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.18, riverZ);
  water.receiveShadow = true;
  group.add(water);
  // Shoreline strips
  const shoreMat = new THREE.MeshStandardMaterial({ color: 0x6a5840, roughness: 0.95 });
  for (const sz of [-1, 1]) {
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(cityRadius * 2 + 80, 2.5), shoreMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(0, 0.16, riverZ + sz * (riverWidth / 2 + 1.2));
    group.add(shore);
  }
  group.matrixAutoUpdate = false; group.updateMatrix();
  return group;
}

// Bridge crossing the river at a given x. Built as a flat deck + railings + pylons.
function makeBridge(x, riverZ, riverWidth) {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.4 });
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.85 });

  const deckLen = riverWidth + 6;
  const deckW = 9;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.6, deckLen), deckMat);
  deck.position.set(x, 1.0, riverZ);
  g.add(deck);
  // Yellow centre stripe
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, deckLen - 1),
    new THREE.MeshStandardMaterial({ color: 0xffd14a, emissive: 0xffd14a, emissiveIntensity: 0.4 })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(x, 1.34, riverZ);
  g.add(stripe);
  // Railings on both sides
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, deckLen), railMat);
    rail.position.set(x + sx * (deckW / 2 - 0.2), 1.85, riverZ);
    g.add(rail);
    // Rail posts every 4u
    const posts = Math.floor(deckLen / 4);
    for (let p = 0; p <= posts; p++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), railMat);
      post.position.set(x + sx * (deckW / 2 - 0.2), 1.5, riverZ - deckLen / 2 + p * 4);
      g.add(post);
    }
  }
  // Pylons under the deck (water-side supports)
  for (const sz of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 8), pylonMat);
    pylon.position.set(x, 0.5, riverZ + sz * (deckLen / 2 - 1.5));
    g.add(pylon);
  }
  g.matrixAutoUpdate = false; g.updateMatrix();
  return g;
}

// ---------- Real Tokyo landmark mesh helpers ----------

// Tokyo Skytree: triangular base widening then transitioning to a slim
// circular shaft with two observation pods and a long antenna mast.
function makeSkytreeMesh(height = 130) {
  const g = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.3 });
  const blueMat  = new THREE.MeshStandardMaterial({ color: 0xb6cad4, roughness: 0.45, metalness: 0.5, emissive: 0x4488aa, emissiveIntensity: 0.18 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.4 });

  // Tapered triangular base (3-sided cylinder) -> circular waist
  const baseSeg = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 11, height * 0.55, 3), whiteMat);
  baseSeg.position.y = height * 0.275;
  baseSeg.rotation.y = Math.PI / 6;
  g.add(baseSeg);
  // Cross bracing rings on the base
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const r = 11 - (11 - 7.5) * t;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.18, 5, 14), darkMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t * height * 0.55;
    g.add(ring);
  }
  // Mid shaft (circular)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 7.5, height * 0.2, 18), whiteMat);
  shaft.position.y = height * 0.55 + height * 0.1;
  g.add(shaft);
  // Lower observation pod
  const pod1 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 5, 18), blueMat);
  pod1.position.y = height * 0.65;
  g.add(pod1);
  // Upper shaft (slimmer)
  const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 4.5, height * 0.18, 14), whiteMat);
  shaft2.position.y = height * 0.78;
  g.add(shaft2);
  // Upper observation pod
  const pod2 = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 3.5, 14), blueMat);
  pod2.position.y = height * 0.86;
  g.add(pod2);
  // Antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.6, height * 0.18, 8), darkMat);
  mast.position.y = height * 0.96;
  g.add(mast);
  // Beacon
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10), beaconMat);
  beacon.position.y = height * 1.05;
  g.add(beacon);
  return g;
}

// Mode Gakuen Cocoon Tower: bullet/cocoon-shaped tower with a diagonal
// lattice criss-cross pattern over a white inner skin.
function makeCocoonTowerMesh(height = 80) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xeae6dc, roughness: 0.55 });
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x444c55, roughness: 0.4, metalness: 0.6 });
  // Cocoon profile via lathe
  const pts = [];
  const segs = 18;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = 7 * Math.sin(t * Math.PI) ** 0.6 + 0.5;
    pts.push(new THREE.Vector2(Math.max(0.5, r), t * height));
  }
  const inner = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), skinMat);
  g.add(inner);
  // Diagonal lattice via two helical torus-like rings
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const strut = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, height * 1.04, 0.18),
      meshMat
    );
    strut.position.set(Math.cos(a) * 6.5, height / 2, Math.sin(a) * 6.5);
    strut.rotation.y = a;
    strut.rotation.z = 0.3;
    g.add(strut);
  }
  // Horizontal bands every 12u
  for (let i = 1; i < 6; i++) {
    const y = (i / 6) * height;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7 * Math.sin((i / 6) * Math.PI) ** 0.6 + 0.5, 0.22, 6, 22), meshMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  return g;
}

// Asahi Group HQ: black "beer mug" tower with a white "foam" head and the
// adjacent gold "Asahi Flame" sculpture on a low pedestal.
function makeAsahiMesh() {
  const g = new THREE.Group();
  const mugMat   = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 });
  const foamMat  = new THREE.MeshStandardMaterial({ color: 0xf3eee2, roughness: 0.7 });
  const goldMat  = new THREE.MeshStandardMaterial({ color: 0xc99227, roughness: 0.35, metalness: 0.85, emissive: 0x553300, emissiveIntensity: 0.35 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.95 });

  // Concrete base shared between both
  const pad = new THREE.Mesh(new THREE.BoxGeometry(38, 0.5, 24), concreteMat);
  pad.position.set(0, 0.25, 0);
  g.add(pad);

  // Beer-mug tower
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 36, 20), mugMat);
  mug.position.set(-9, 18, 0);
  g.add(mug);
  // Window strip emissive
  const winMat = new THREE.MeshStandardMaterial({ color: 0x113344, emissive: 0xffeeaa, emissiveIntensity: 0.5 });
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(7.05, 7.45, 1.4, 20, 1, true), winMat);
    ring.position.set(-9, 4 + i * 6, 0);
    g.add(ring);
  }
  // Beer foam head (white scalloped top)
  const foamMain = new THREE.Mesh(
    new THREE.SphereGeometry(7.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    foamMat
  );
  foamMain.position.set(-9, 36, 0);
  g.add(foamMain);
  // Foam drip on side
  const drip = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), foamMat);
  drip.position.set(-15, 34, 0);
  drip.scale.set(1, 1.3, 1);
  g.add(drip);

  // Gold flame sculpture (curved horizontal flame)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(3.5, 14, 12),
    goldMat
  );
  flame.position.set(11, 10, 0);
  flame.rotation.z = -Math.PI / 2.5;
  g.add(flame);
  // Flame tip elongation
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.4, 10, 10), goldMat);
  tip.position.set(18, 12, 0);
  tip.rotation.z = -Math.PI / 2;
  g.add(tip);
  // Black flame pedestal
  const ped = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), mugMat);
  ped.position.set(11, 2.5, 0);
  g.add(ped);
  return g;
}

// NTT DOCOMO Yoyogi: tall stepped tower with a clock-tower mast at top.
function makeNTTDocomoMesh(height = 78) {
  const g = new THREE.Group();
  const tanMat   = new THREE.MeshStandardMaterial({ color: 0xa5957a, roughness: 0.7 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6 });
  const winMat   = new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0xffeeaa, emissiveIntensity: 0.6 });

  // Stepped main shaft (3 setbacks)
  const w0 = 12, d0 = 12;
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const w = w0 - i * 1.4;
    const d = d0 - i * 1.4;
    const segH = height * 0.18;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, segH, d), tanMat);
    seg.position.y = i * segH + segH / 2;
    g.add(seg);
    // Window band per segment
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, segH * 0.7, d * 0.95), winMat);
    win.position.y = seg.position.y;
    g.add(win);
  }
  // Setback collar
  const collar = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 8), darkMat);
  collar.position.y = height * 0.74;
  g.add(collar);
  // Clock-tower mast (rectangular shaft)
  const mast = new THREE.Mesh(new THREE.BoxGeometry(4.5, height * 0.18, 4.5), tanMat);
  mast.position.y = height * 0.84;
  g.add(mast);
  // Clock face on each side
  const clockFace = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffeecc, emissiveIntensity: 0.6 });
  const clockHands = new THREE.MeshStandardMaterial({ color: 0x000000 });
  for (const [rotY, x, z] of [[0, 0, 2.31], [Math.PI, 0, -2.31], [Math.PI/2, 2.31, 0], [-Math.PI/2, -2.31, 0]]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), clockFace);
    face.rotation.y = rotY;
    face.position.set(x, height * 0.84, z);
    g.add(face);
    const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.05), clockHands);
    hand1.rotation.y = rotY;
    hand1.position.set(x + 0.001, height * 0.84, z + 0.001);
    g.add(hand1);
  }
  // Spire
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, height * 0.12, 6), darkMat);
  spire.position.y = height * 0.99;
  g.add(spire);
  return g;
}

// Kabukiza Theatre: traditional Japanese building with sweeping curved gable
// roof tiers and red trim. Wide and low.
function makeKabukizaMesh() {
  const g = new THREE.Group();
  const wallMat   = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.7 });
  const roofMat   = new THREE.MeshStandardMaterial({ color: 0x222a30, roughness: 0.55, metalness: 0.3 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xa61f24, roughness: 0.55, emissive: 0x440a0a, emissiveIntensity: 0.2 });

  // Main wide hall
  const hall = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 18), wallMat);
  hall.position.y = 6;
  g.add(hall);
  // Red plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(34.6, 1.2, 18.6), accentMat);
  plinth.position.y = 0.6;
  g.add(plinth);
  // First curved roof (gable across the long axis) -- approximated with a wide flat triangle prism
  function gable(yBase, w, d, h, depthOffset) {
    const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, h, 4), roofMat);
    r.rotation.y = Math.PI / 4;
    r.scale.set(1, 1, d / w);
    r.position.set(0, yBase + h / 2, depthOffset || 0);
    return r;
  }
  g.add(gable(12, 36, 22, 6));
  // Upper smaller roof tier (the central ornamental one)
  g.add(gable(15, 22, 14, 4.5));
  // Roof ridge ornaments (shachihoko-like fish)
  const ornMat = new THREE.MeshStandardMaterial({ color: 0xddc066, roughness: 0.4, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    const orn = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.5, 4), ornMat);
    orn.position.set(sx * 9, 17, 0);
    orn.rotation.x = -0.3;
    g.add(orn);
  }
  // Front entry awning / red lanterns
  const awning = new THREE.Mesh(new THREE.BoxGeometry(20, 0.8, 4), roofMat);
  awning.position.set(0, 7, 11);
  g.add(awning);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xa61f24, emissive: 0xff4422, emissiveIntensity: 0.7 });
  for (let i = 0; i < 5; i++) {
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10), lanternMat);
    lan.position.set(-8 + i * 4, 5, 11.5);
    lan.scale.set(1, 1.3, 1);
    g.add(lan);
  }
  return g;
}

// Azabudai Hills Mori JP Tower: tall sleek dark-glass slab. Just very tall.
function makeMoriJPMesh(height = 110) {
  const g = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2a3540, roughness: 0.18, metalness: 0.85, emissive: 0x1a2530, emissiveIntensity: 0.25,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.4, metalness: 0.7 });
  // Subtle tapered profile
  const lower = new THREE.Mesh(new THREE.BoxGeometry(13, height * 0.55, 13), glassMat);
  lower.position.y = height * 0.275;
  g.add(lower);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(11, height * 0.45, 11), glassMat);
  upper.position.y = height * 0.55 + height * 0.225;
  g.add(upper);
  // Crown
  const crown = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), accentMat);
  crown.position.y = height + 2;
  g.add(crown);
  // Window strips (horizontal bands, very subtle emissive)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x66aacc, emissive: 0x4488bb, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.6 });
  const bandCount = Math.floor(height / 3.5);
  for (let i = 0; i < bandCount; i++) {
    const y = i * 3.5 + 1.5;
    const w = y < height * 0.55 ? 13.05 : 11.05;
    const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, w), winMat);
    band.position.y = y;
    g.add(band);
  }
  return g;
}

// Shibuya Scramble Square: blocky modern skyscraper with a notched crown
// (Shibuya Sky observation deck) and a slight cantilever at the top.
function makeShibuyaScrambleMesh(height = 70) {
  const g = new THREE.Group();
  const facadeMat = new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.4, metalness: 0.55 });
  const glassMat  = new THREE.MeshStandardMaterial({ color: 0x4488aa, emissive: 0x336688, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.7 });
  const darkMat   = new THREE.MeshStandardMaterial({ color: 0x222222 });
  // Main blocky tower
  const main = new THREE.Mesh(new THREE.BoxGeometry(20, height * 0.85, 20), facadeMat);
  main.position.y = height * 0.425;
  g.add(main);
  // Window grids (3 visible faces with slight emissive)
  const win = new THREE.Mesh(new THREE.BoxGeometry(20.05, height * 0.85, 20.05), glassMat);
  win.position.y = main.position.y;
  win.scale.set(1, 0.98, 1);
  g.add(win);
  // Cantilevered observation deck (notched corner overhanging)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 4, 24), facadeMat);
  deck.position.y = height * 0.88;
  g.add(deck);
  // Open-air notch (simulated by a darker inset on top)
  const notch = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 16), darkMat);
  notch.position.y = height * 0.92;
  g.add(notch);
  // Crown spire
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, height * 0.08, 6), darkMat);
  spire.position.y = height * 0.96;
  g.add(spire);
  return g;
}

// Imperial Palace: walled compound with a main pagoda-roofed building, two
// flanking pavilions, garden ground, and trees inside the walls.
function makeImperialPalaceMesh(size = 60) {
  const group = new THREE.Group();
  const wallMat   = new THREE.MeshStandardMaterial({ color: 0xa49888, roughness: 0.85 });
  const palaceMat = new THREE.MeshStandardMaterial({ color: 0xeae3d2, roughness: 0.65 });
  const roofMat   = new THREE.MeshStandardMaterial({ color: 0x223844, roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xa12b2b, roughness: 0.6 });
  const grassMat  = new THREE.MeshStandardMaterial({ color: 0x346a2a, roughness: 0.95 });
  const stoneMat  = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });

  // Garden ground inside the walls
  const garden = new THREE.Mesh(new THREE.PlaneGeometry(size - 2, size - 2), grassMat);
  garden.rotation.x = -Math.PI / 2; garden.position.y = 0.12;
  garden.receiveShadow = true;
  group.add(garden);

  // Stone pathway from "south gate" to main palace
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3, size * 0.45), stoneMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.16, size * 0.25);
  group.add(path);

  // Outer wall (4 sides), short
  const wallH = 4;
  const wallT = 1.2;
  for (const [px, pz, w, d] of [
    [0,  size / 2, size, wallT],
    [0, -size / 2, size, wallT],
    [ size / 2, 0, wallT, size],
    [-size / 2, 0, wallT, size],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.set(px, wallH / 2, pz);
    group.add(wall);
    // Tile cap (slightly wider, dark)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.5, d * 1.5), roofMat);
    cap.position.set(px, wallH + 0.25, pz);
    group.add(cap);
  }

  // Main palace building
  const main = new THREE.Mesh(new THREE.BoxGeometry(28, 12, 18), palaceMat);
  main.position.y = 6;
  group.add(main);
  // Red accent strip below the roof
  const accent = new THREE.Mesh(new THREE.BoxGeometry(28.2, 1.0, 18.2), accentMat);
  accent.position.y = 11.5;
  group.add(accent);
  // Pagoda-style sloped roof: a wide flat box + a 4-sided pyramid (cone with 4 segments)
  const roofBase = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 22), roofMat);
  roofBase.position.y = 12.6;
  group.add(roofBase);
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(20, 7, 4), roofMat);
  pyramid.position.y = 17;
  pyramid.rotation.y = Math.PI / 4;
  group.add(pyramid);
  // Roof finial / ornament
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 1.6, 6), accentMat);
  finial.position.y = 21;
  group.add(finial);

  // Two flanking pavilions
  for (const sx of [-1, 1]) {
    const flank = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), palaceMat);
    flank.position.set(sx * 18, 3, -7);
    group.add(flank);
    const fRoof = new THREE.Mesh(new THREE.ConeGeometry(8, 4, 4), roofMat);
    fRoof.position.set(sx * 18, 8, -7);
    fRoof.rotation.y = Math.PI / 4;
    group.add(fRoof);
    const fAccent = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.6, 8.2), accentMat);
    fAccent.position.set(sx * 18, 5.7, -7);
    group.add(fAccent);
  }

  // South gate (small structure on the wall facing +Z)
  const gate = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 3), palaceMat);
  gate.position.set(0, 2.5, size / 2 - 1);
  group.add(gate);
  const gateRoof = new THREE.Mesh(new THREE.ConeGeometry(6, 3, 4), roofMat);
  gateRoof.position.set(0, 6.5, size / 2 - 1);
  gateRoof.rotation.y = Math.PI / 4;
  group.add(gateRoof);

  // Trees scattered inside the walls (avoiding the path + buildings)
  for (let i = 0; i < 14; i++) {
    const tx = rand(-size / 2 + 4, size / 2 - 4);
    const tz = rand(-size / 2 + 4, size / 2 - 4);
    if (Math.abs(tx) < 16 && Math.abs(tz) < 12) continue; // skip palace + flanks zone
    if (Math.abs(tx) < 2 && tz > 0) continue;             // skip path
    group.add(makeTree(tx, tz, 0.9 + Math.random() * 0.4));
  }

  group.matrixAutoUpdate = false; group.updateMatrix();
  return group;
}

// Flush any pending body-IM color/matrix changes once per frame.
export function flushBodiesIM(im) {
  if (!im) return;
  if (im._colorDirty && im.instanceColor) {
    im.instanceColor.needsUpdate = true;
    im._colorDirty = false;
  }
  if (im._matrixDirty) {
    im.instanceMatrix.needsUpdate = true;
    im._matrixDirty = false;
  }
}

// Build a single InstancedMesh for every building body. Saves ~one draw
// call per building (the body is what the player primarily sees).
function buildGlobalBodies(scene, buildings) {
  if (!buildings.length) return null;
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.85, metalness: 0.1, vertexColors: false,
  });
  // unit cube; scaled per-instance via matrix
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(geom, mat, buildings.length);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(buildings.length * 3), 3);
  // City bodies span the whole map; let the renderer skip the per-instance
  // bounding-sphere test by disabling object-level frustum culling. There's
  // only one mesh.
  im.frustumCulled = false;
  // Buildings receive the kaiju's shadow but don't cast (1024 shadow map is
  // tight enough that distant casters would alias badly).
  im.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const _skipMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b._skipBodyIM) {
      // Landmark with its own custom mesh -- park its IM slot at zero scale
      // but still register the index so collapse() can address it.
      im.setMatrixAt(i, _skipMatrix);
      im.setColorAt(i, b.bodyColor);
    } else {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, b.bodyColor);
    }
    b._bodyIM = im;
    b._bodyIndex = i;
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  scene.add(im);
  return im;
}

// Build the two global window InstancedMeshes from the queue and register
// each entry on its owning Building so collapse can hide them.
// Synthwave window palette. Each emissive bucket gets its own InstancedMesh so
// per-window colour variation is essentially free (no per-instance shader
// patching needed). 'off' is the dim/un-lit bucket.
const WINDOW_BUCKETS = [
  { name: 'off',   color: 0x111822, emissive: 0x000000, intensity: 0.0, weight: 0.30 },
  { name: 'pink',  color: 0x331122, emissive: 0xff3388, intensity: 2.6, weight: 0.16 },
  { name: 'cyan',  color: 0x003344, emissive: 0x33ddff, intensity: 2.4, weight: 0.16 },
  { name: 'amber', color: 0x442211, emissive: 0xffaa44, intensity: 2.2, weight: 0.22 },
  { name: 'white', color: 0x332a22, emissive: 0xffeedd, intensity: 1.8, weight: 0.16 },
];
function pickWindowBucket() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < WINDOW_BUCKETS.length; i++) {
    acc += WINDOW_BUCKETS[i].weight;
    if (r < acc) return i;
  }
  return WINDOW_BUCKETS.length - 1;
}

function buildGlobalWindows(scene) {
  if (_windowQueue.length === 0) return;
  const geom = new THREE.BoxGeometry(0.6, 1.2, 0.15);
  // Bucket every window. Buildings whose owner had `lit:false` (we tag this
  // at queue time) skew heavily to the 'off' bucket; otherwise they pick
  // from the synthwave palette weights.
  const buckets = WINDOW_BUCKETS.map(() => []);
  for (const w of _windowQueue) {
    let bIdx;
    if (!w.lit) {
      // 80% off, 20% any of the lit colours -- gives the unlit buildings a
      // few stray glowing windows so the city never looks completely dead.
      bIdx = Math.random() < 0.8 ? 0 : (1 + Math.floor(Math.random() * 4));
    } else {
      bIdx = pickWindowBucket();
    }
    buckets[bIdx].push(w);
  }
  // Build one IM per bucket
  for (let i = 0; i < WINDOW_BUCKETS.length; i++) {
    const cfg = WINDOW_BUCKETS[i];
    const list = buckets[i];
    if (!list.length) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: cfg.intensity,
      roughness: 0.5,
      metalness: 0.0,
    });
    const im = new THREE.InstancedMesh(geom, mat, list.length);
    im.frustumCulled = false;
    im.matrixAutoUpdate = false; im.updateMatrix();
    for (let j = 0; j < list.length; j++) {
      const w = list[j];
      im.setMatrixAt(j, w.matrix);
      w.b.windowEntries.push({ im, idx: j });
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }
  _windowQueue = [];
}

let LITE_MODE = false;
export function setBuildingLite(v) { LITE_MODE = !!v; }

// Spatial grid keyed by 60u cells. Lets per-frame queries (collisions, AOE
// damage, camera collision raycast) skip the 90% of buildings that aren't
// nearby instead of iterating the whole list.
export class BuildingGrid {
  constructor(cellSize = 60) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  _key(cx, cz) { return cx + ':' + cz; }
  add(b) {
    const cs = this.cellSize;
    const k = this._key(Math.floor(b.x / cs), Math.floor(b.z / cs));
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(b);
    b._gridKey = k;
    b._grid = this;
  }
  remove(b) {
    if (!b._gridKey) return;
    const arr = this.cells.get(b._gridKey);
    if (arr) {
      const i = arr.indexOf(b);
      if (i >= 0) arr.splice(i, 1);
    }
    b._gridKey = null;
  }
  // Run cb against every building whose cell footprint overlaps the query AABB.
  forEachNear(x, z, radius, cb) {
    const cs = this.cellSize;
    const minX = Math.floor((x - radius) / cs);
    const maxX = Math.floor((x + radius) / cs);
    const minZ = Math.floor((z - radius) / cs);
    const maxZ = Math.floor((z + radius) / cs);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const arr = this.cells.get(this._key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) cb(arr[i]);
      }
    }
  }
}

// Global window pipeline. Buildings push their window matrices here;
// after all buildings exist, buildCity merges them into 2 InstancedMesh
// (one lit, one dim) so the entire skyline's windows cost 2 draw calls.
let _windowQueue = [];
const _zeroMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);

export class Building {
  constructor(x, z, w, d, h, opts = {}) {
    this.x = x; this.z = z; this.w = w; this.d = d; this.h = h;
    this.maxHp = Math.max(20, Math.floor(h * 1.4 + w * d * 0.18));
    this.hp = this.maxHp;
    this.destroyed = false;
    this.debris = [];
    this.windows = [];
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const baseColor = opts.color || pick(BUILDING_PALETTE);
    // Body is no longer a per-building Mesh -- it's an instance in the global
    // InstancedMesh built by buildGlobalBodies(). Record the data for later.
    this.bodyColor = new THREE.Color(baseColor);
    this._bodyIndex = -1;
    // Lightweight stand-in so existing code paths (b.body.material.color
    // mutations) don't crash. Replaced by the IM at scene level.
    this.body = { material: { color: this.bodyColor }, userData: { building: this } };

    // Bail early for landmarks with custom meshes -- they don't want the
    // generic procedural water tanks / AC vents / billboards / neon signs /
    // awnings / roof variants painted on top.
    if (opts.skipWindows) {
      this.windowEntries = [];
      return;
    }

    // Rooftop details (probabilities tuned down to keep mesh count manageable)
    if (h > 14 && Math.random() < 0.4) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(w, d) * 0.18, Math.min(w, d) * 0.2, 1.6, 10),
        new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.85 })
      );
      tank.position.set(rand(-w*0.25, w*0.25), h + 0.8, rand(-d*0.25, d*0.25));
      tank.castShadow = true;
      this.group.add(tank);
      // tank ladder
      const lad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      lad.position.copy(tank.position);
      lad.position.y = h + 0.8;
      lad.position.x += Math.min(w, d) * 0.21;
      this.group.add(lad);
    }
    // AC units / vents (only on tall buildings, fewer per building)
    if (h > 18 && Math.random() < 0.5) {
      const ventCount = 1;
      for (let i = 0; i < ventCount; i++) {
        const vw = rand(1.0, 2.4), vd = rand(1.0, 2.4);
        const v = new THREE.Mesh(
          new THREE.BoxGeometry(vw, 1.0, vd),
          new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7 })
        );
        v.position.set(rand(-w * 0.35, w * 0.35), h + 0.5, rand(-d * 0.35, d * 0.35));
        v.castShadow = true;
        this.group.add(v);
      }
    }
    // Antenna with blinking light (rare; only tall buildings)
    if (Math.random() < 0.3 && h > 30) {
      const antH = h * (0.25 + Math.random() * 0.25);
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.12, antH, 4),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      ant.position.set(rand(-1.5, 1.5), h + antH / 2, rand(-1.5, 1.5));
      this.group.add(ant);
      const blink = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.4 })
      );
      blink.position.copy(ant.position);
      blink.position.y = h + antH;
      this.group.add(blink);
    }
    // Rooftop billboard / neon panel (sparser)
    if (h > 28 && Math.random() < 0.25) {
      const c = pick(NEON_COLORS);
      const billW = Math.min(w, d) * 0.7;
      const billH = Math.min(8, h * 0.18);
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, billH * 0.6, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      stand.position.set(-billW * 0.4, h + billH * 0.3, 0);
      this.group.add(stand);
      const stand2 = stand.clone();
      stand2.position.x = billW * 0.4;
      this.group.add(stand2);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(billW, billH, 0.4),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.6, roughness: 0.4 })
      );
      panel.position.set(0, h + billH * 0.65, 0);
      panel.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      this.group.add(panel);
    }

    // Roof variant for visual variety: pagoda / dome / stepped tile.
    // Layered on top of the existing IM cube body so it doesn't add to
    // building-grid complexity. Probability gated to keep mesh count sane.
    if (Math.random() < 0.18) {
      const variant = Math.random();
      if (variant < 0.4) {
        // Pagoda: 4-sided pyramid roof, dark blue tiles, red ridge spine
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.62, Math.max(3, h * 0.18), 4),
          new THREE.MeshStandardMaterial({ color: 0x223844, roughness: 0.5, metalness: 0.35 })
        );
        roof.position.y = h + Math.max(3, h * 0.18) / 2;
        roof.rotation.y = Math.PI / 4;
        this.group.add(roof);
        // Red accent strip just under the roof
        const accent = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.4, 0.7, d + 0.4),
          new THREE.MeshStandardMaterial({ color: 0xa12b2b, roughness: 0.6 })
        );
        accent.position.y = h - 0.4;
        this.group.add(accent);
      } else if (variant < 0.7) {
        // Dome roof for office tower: copper hemisphere
        const r = Math.min(w, d) * 0.55;
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x4a6677, roughness: 0.4, metalness: 0.6 })
        );
        dome.position.y = h;
        this.group.add(dome);
        // Spire tip
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(0.25, 4, 6),
          new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        spire.position.y = h + r + 2;
        this.group.add(spire);
      } else {
        // Stepped / setback roof: 2 smaller stacked boxes
        for (let s = 0; s < 2; s++) {
          const sz = 1 - (s + 1) * 0.25;
          const stepH = Math.max(2, h * 0.08);
          const setback = new THREE.Mesh(
            new THREE.BoxGeometry(w * sz, stepH, d * sz),
            new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.85 })
          );
          setback.position.y = h + stepH / 2 + s * stepH;
          this.group.add(setback);
        }
      }
    }

    // Side neon sign(s) -- usually 0 or 1, rare 2. Each sign now bakes a
    // Japanese-text canvas as both map + emissiveMap so the glyphs actually
    // glow (and pump bloom) instead of being a featureless coloured slab.
    const sideSignCount = h > 12 ? (Math.random() < 0.45 ? 1 : 0) : 0;
    for (let i = 0; i < sideSignCount; i++) {
      const c = pick(NEON_COLORS);
      const phrase = pick(NEON_PHRASES);
      const tex = makeNeonSignTexture(phrase, c);
      // Sign uses fixed real-world dimensions (a Tokyo neon is roughly
      // 4-7m wide at the building scale we're rendering at), not relative
      // to building height -- otherwise tall towers got billboards bigger
      // than the building itself. Width is also clamped so the sign never
      // exceeds 70% of the smaller building face dimension.
      const SIGN_W_MIN = 4.0, SIGN_W_MAX = 7.5;
      const maxFaceW = Math.min(w, d) * 0.7;
      const sw = Math.min(SIGN_W_MIN + Math.random() * (SIGN_W_MAX - SIGN_W_MIN), maxFaceW);
      const sh = sw * (96 / 256); // preserve texture aspect (8:3)
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, 0.4),
        new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex,
          emissive: 0xffffff, emissiveIntensity: 1.6,
          roughness: 0.4, metalness: 0.1,
        })
      );
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = Math.random() < 0.5;
      const yPos = h * (0.35 + Math.random() * 0.4);
      if (axis) {
        // Sign on +X or -X wall: rotate 90° so face points outward.
        sign.position.set(side * (w / 2 + 0.25), yPos, rand(-d * 0.2, d * 0.2));
        sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        // Sign on +Z or -Z wall: 0 or 180°.
        sign.position.set(rand(-w * 0.2, w * 0.2), yPos, side * (d / 2 + 0.25));
        sign.rotation.y = side > 0 ? 0 : Math.PI;
      }
      this.group.add(sign);
      // Frame outline (slightly darker box around)
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(sw + 0.4, sh + 0.4, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      frame.position.copy(sign.position);
      frame.rotation.copy(sign.rotation);
      // Push the frame slightly inboard
      const inset = 0.1;
      if (axis) frame.position.x -= side * inset;
      else frame.position.z -= side * inset;
      this.group.add(frame);
    }

    // Storefront awning at base (low buildings only, sparser)
    if (h < 25 && Math.random() < 0.25) {
      const c = pick(NEON_COLORS);
      const aw = w * 0.85, ad = 1.6;
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(aw, 0.4, ad),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 })
      );
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = Math.random() < 0.5;
      if (axis) awning.position.set(0, 3.0, side * (d / 2 + ad * 0.4));
      else { awning.position.set(side * (w / 2 + ad * 0.4), 3.0, 0); awning.rotation.y = Math.PI / 2; }
      this.group.add(awning);
    }

    // Windows -- pushed to the global queue, instanced once after all buildings.
    // Records local matrices (relative to the building's footprint), translated
    // by (x,z) at queue time so the global IM lives in world space.
    // skipWindows opt: landmarks render their own custom mesh and don't
    // want generic procedural window dots painted onto them.
    if (h >= 6 && !opts.skipWindows) {
      const lit = Math.random() < 0.6;
      const facesToRender = h < 16 ? 1 : 2;
      const faceOffset = Math.floor(Math.random() * 4);
      const rows = Math.max(2, Math.floor(h / 4));
      const cols = Math.max(2, Math.floor(Math.max(w, d) / 3.5));
      const dummy = new THREE.Object3D();
      for (let f = 0; f < facesToRender; f++) {
        const face = (f + faceOffset) % 4;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            dummy.position.set(0, 0, 0);
            dummy.rotation.set(0, 0, 0);
            const yy = 1.5 + r * (h - 2) / rows;
            const span = (face % 2 === 0 ? w : d) - 1.0;
            const xx = -span / 2 + c * span / (cols - 1 || 1);
            if (face === 0)      dummy.position.set(xx, yy, d / 2 + 0.08);
            else if (face === 1) { dummy.position.set(w / 2 + 0.08, yy, xx); dummy.rotation.y = Math.PI / 2; }
            else if (face === 2) dummy.position.set(xx, yy, -d / 2 - 0.08);
            else                 { dummy.position.set(-w / 2 - 0.08, yy, xx); dummy.rotation.y = Math.PI / 2; }
            // bake building world position
            dummy.position.x += this.x;
            dummy.position.z += this.z;
            dummy.updateMatrix();
            _windowQueue.push({ b: this, matrix: dummy.matrix.clone(), lit });
          }
        }
      }
    }
    // Records of window slots in the global IM, filled by buildGlobalWindows.
    this.windowEntries = [];
    // (body.userData.building backlink is set on the stub at line ~167;
    //  raycasts use the global body InstancedMesh + instanceId now.)
  }

  damage(amount, hitPoint, world) {
    if (this.destroyed) return 0;
    const before = this.hp;
    this.hp -= amount;
    // Tint darker as it weakens -- write into the IM but DEFER the
    // needsUpdate flag so a single multi-hit frame triggers one GPU sync
    // instead of N. flushBodiesIM() is called once per frame from updateWorld.
    this.bodyColor.offsetHSL(0, 0, -0.005);
    if (this._bodyIM && this._bodyIndex >= 0 && this._bodyIM.instanceColor) {
      this._bodyIM.setColorAt(this._bodyIndex, this.bodyColor);
      this._bodyIM._colorDirty = true;
    }
    if (hitPoint && world) {
      world.spawnSparks(hitPoint, 6);
      world.spawnHitPulse?.(hitPoint, 0xffaa44);
    }
    // emit smoke when crossing damage thresholds (50% / 25%)
    const halfPct = before / this.maxHp;
    const nowPct = this.hp / this.maxHp;
    if (world && halfPct > 0.5 && nowPct <= 0.5) {
      world.spawnSmoke(this.group.position.clone().setY(this.h * 0.85), 1.4);
    }
    if (world && halfPct > 0.25 && nowPct <= 0.25) {
      world.spawnSmoke(this.group.position.clone().setY(this.h * 0.7), 1.8);
      world.spawnSparks(this.group.position.clone().setY(this.h * 0.6), 8);
    }
    if (this.hp <= 0) {
      this.collapse(world);
      return this.maxHp; // score
    }
    return amount;
  }

  collapse(world) {
    if (this.destroyed) return;
    this.destroyed = true;
    // Drop out of the spatial grid so future queries skip us
    if (this._grid) this._grid.remove(this);
    // Hide our slot in the global body InstancedMesh (deferred flush)
    if (this._bodyIM && this._bodyIndex >= 0) {
      this._bodyIM.setMatrixAt(this._bodyIndex, _zeroMatrix);
      this._bodyIM._matrixDirty = true;
    }
    // Custom landmark mesh -- remove it on destruction.
    if (this.customMesh && this.customMesh.parent) {
      this.customMesh.parent.remove(this.customMesh);
    }
    // Hide our slots in the global window InstancedMesh(es)
    if (this.windowEntries && this.windowEntries.length) {
      for (const e of this.windowEntries) e.im.setMatrixAt(e.idx, _zeroMatrix);
      // Mark each unique IM dirty
      const seen = new Set();
      for (const e of this.windowEntries) {
        if (!seen.has(e.im)) { e.im.instanceMatrix.needsUpdate = true; seen.add(e.im); }
      }
    }
    const pos = this.group.position.clone();
    pos.y += this.h / 2;

    // Big initial fireball + a couple of staggered smaller explosions
    if (world) {
      world.spawnExplosion(pos.clone(), 1.6 + Math.min(2.0, this.h / 30));
      const w2 = world;
      setTimeout(() => { if (w2.scene) w2.spawnExplosion(pos.clone().setY(this.h * 0.5).add(new THREE.Vector3(rand(-3,3), 0, rand(-3,3))), 1.0); }, 90);
      setTimeout(() => { if (w2.scene) w2.spawnExplosion(this.group.position.clone().setY(this.h * 0.2), 1.2); }, 200);
    }

    // Lots of chunks for satisfying spray
    const chunks = 14 + Math.floor(Math.random() * 6) + Math.min(8, Math.floor(this.h / 12));
    for (let i = 0; i < chunks; i++) {
      const cw = this.w * rand(0.18, 0.55);
      const ch = this.h * rand(0.08, 0.32);
      const cd = this.d * rand(0.18, 0.55);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(cw, ch, cd),
        new THREE.MeshStandardMaterial({ color: this.body.material.color, roughness: 0.95 })
      );
      m.position.copy(this.group.position);
      m.position.y = this.h * rand(0.2, 0.7);
      m.position.x += rand(-this.w / 3, this.w / 3);
      m.position.z += rand(-this.d / 3, this.d / 3);
      m.castShadow = true;
      m.userData.vel = new THREE.Vector3(rand(-12, 12), rand(10, 22), rand(-12, 12));
      m.userData.angVel = new THREE.Vector3(rand(-5, 5), rand(-5, 5), rand(-5, 5));
      m.userData.life = 6.5; // longer-lived debris
      world.scene.add(m);
      world.debris.push(m);
    }

    // Ground rubble (low boxes that stay)
    for (let i = 0; i < 4; i++) {
      const rw = this.w * rand(0.3, 0.7);
      const rd = this.d * rand(0.3, 0.7);
      const rh = rand(1.2, 2.6);
      const rub = new THREE.Mesh(
        new THREE.BoxGeometry(rw, rh, rd),
        new THREE.MeshStandardMaterial({ color: this.body.material.color, roughness: 1.0 })
      );
      rub.position.set(
        this.group.position.x + rand(-this.w / 4, this.w / 4),
        rh / 2,
        this.group.position.z + rand(-this.d / 4, this.d / 4),
      );
      rub.rotation.y = Math.random() * Math.PI;
      rub.castShadow = true; rub.receiveShadow = true;
      world.scene.add(rub);
    }

    // Dust plume: many smoke puffs spreading from base
    if (world) {
      const base = this.group.position.clone().setY(0);
      for (let i = 0; i < 8; i++) {
        const dust = base.clone().add(new THREE.Vector3(rand(-this.w * 0.6, this.w * 0.6), rand(0, 4), rand(-this.d * 0.6, this.d * 0.6)));
        world.spawnSmoke(dust, 1.4 + Math.random() * 1.2);
      }
      // Ground dust ring
      world.spawnShockwave(base, 0xaa8866, Math.max(this.w, this.d) * 1.4);
      world.shake(0.9 + Math.min(0.7, this.h / 40), 0.7);
      // Lingering smoke column visible from afar
      world.spawnSmokeColumn?.(base, this.h);
    }

    if (world) world.onBuildingDestroyed?.(this);

    // remove building from scene
    this.group.parent && this.group.parent.remove(this.group);
  }
}

export function buildCity(scene, world, opts = {}) {
  const buildings = [];
  const grid = new BuildingGrid(60);
  const lite = !!opts.lite;
  setBuildingLite(lite);
  const CITY_RADIUS = lite ? 250 : 320;
  const BLOCK = lite ? 48 : 40; // block size including streets
  const STREET = 8;

  // Ground: now a sidewalk-grey concrete colour so the dark asphalt streets
  // sit on top of it and the area between blocks reads as pavement instead
  // of just "the void". Beyond CITY_RADIUS we keep it the same colour --
  // works as a continuous urban floor even at the periphery.
  const groundGeom = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x6e6864, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false; ground.updateMatrix();
  scene.add(ground);

  // Street grid (asphalt) + glowing center lines + flanking sidewalks.
  const streetMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.92 });
  const lineMat   = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffd14a, emissiveIntensity: 0.45, roughness: 0.6 });
  const curbMat   = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 1.0 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.95 });
  const SIDEWALK_W = 3.0; // width of each sidewalk strip flanking a street
  for (let i = -CITY_RADIUS; i <= CITY_RADIUS; i += BLOCK) {
    const sx = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, STREET), streetMat);
    sx.rotation.x = -Math.PI / 2; sx.position.set(0, 0.05, i);
    sx.receiveShadow = true; sx.matrixAutoUpdate = false; sx.updateMatrix(); scene.add(sx);
    const sz = new THREE.Mesh(new THREE.PlaneGeometry(STREET, CITY_RADIUS * 2), streetMat);
    sz.rotation.x = -Math.PI / 2; sz.position.set(i, 0.05, 0);
    sz.receiveShadow = true; sz.matrixAutoUpdate = false; sz.updateMatrix(); scene.add(sz);

    // Sidewalks flanking each street -- light grey strips just past the curb.
    for (const off of [STREET / 2 + SIDEWALK_W / 2, -(STREET / 2 + SIDEWALK_W / 2)]) {
      const swx = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, SIDEWALK_W), sidewalkMat);
      swx.rotation.x = -Math.PI / 2;
      swx.position.set(0, 0.06, i + off);
      swx.receiveShadow = true; swx.matrixAutoUpdate = false; swx.updateMatrix();
      scene.add(swx);
      const swz = new THREE.Mesh(new THREE.PlaneGeometry(SIDEWALK_W, CITY_RADIUS * 2), sidewalkMat);
      swz.rotation.x = -Math.PI / 2;
      swz.position.set(i + off, 0.06, 0);
      swz.receiveShadow = true; swz.matrixAutoUpdate = false; swz.updateMatrix();
      scene.add(swz);
    }

    // Center yellow line per street
    const lx = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, 0.35), lineMat);
    lx.rotation.x = -Math.PI / 2; lx.position.set(0, 0.07, i);
    scene.add(lx);
    const lz = new THREE.Mesh(new THREE.PlaneGeometry(0.35, CITY_RADIUS * 2), lineMat);
    lz.rotation.x = -Math.PI / 2; lz.position.set(i, 0.07, 0);
    scene.add(lz);

    // Curbs along street edges
    const curbX1 = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, 0.4), curbMat);
    curbX1.rotation.x = -Math.PI / 2; curbX1.position.set(0, 0.06, i + STREET / 2 - 0.2); scene.add(curbX1);
    const curbX2 = curbX1.clone(); curbX2.position.z = i - STREET / 2 + 0.2; scene.add(curbX2);
    const curbZ1 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, CITY_RADIUS * 2), curbMat);
    curbZ1.rotation.x = -Math.PI / 2; curbZ1.position.set(i + STREET / 2 - 0.2, 0.06, 0); scene.add(curbZ1);
    const curbZ2 = curbZ1.clone(); curbZ2.position.x = i - STREET / 2 + 0.2; scene.add(curbZ2);
  }

  // Reserved zones where landmarks / parks / districts live. Procedural
  // buildings skip any block whose centre lands inside one.
  // Each entry is either a circle { kind:'c', x, z, r } (default) or a
  // rect { kind:'r', x1, z1, x2, z2 }.
  const RIVER_Z = lite ? 60 : 80;
  const RIVER_WIDTH = 26;
  const RESERVED = [
    { kind: 'c', x: 160, z: -160, r: 28 },     // Tokyo Tower
    { kind: 'c', x: -180, z: 140, r: 50 },     // Imperial Palace compound
    { kind: 'c', x: 200, z: 200, r: 28 },      // Park 1
    { kind: 'c', x: -200, z: -200, r: 28 },    // Park 2
    { kind: 'c', x: 220, z: 60, r: 22 },       // Park 3
    { kind: 'c', x: 240, z: -200, r: 64 },     // Factory district
    { kind: 'c', x: -240, z: -200, r: 60 },    // Nuclear plant
    // Real-Tokyo landmark towers
    { kind: 'c', x:  220, z: -40,  r: 22 },    // Tokyo Skytree
    { kind: 'c', x:  120, z:  160, r: 18 },    // Cocoon Tower
    { kind: 'c', x: -100, z: -180, r: 26 },    // Asahi HQ
    { kind: 'c', x:  -60, z:  220, r: 22 },    // NTT DOCOMO
    { kind: 'c', x:   60, z:  220, r: 22 },    // Kabukiza
    { kind: 'c', x:  -60, z: -100, r: 18 },    // Mori JP Tower
    { kind: 'c', x: -120, z:   60, r: 22 },    // Shibuya Scramble Square
    { kind: 'c', x:  120, z: -100, r: 28 },    // Construction site
    // Small street-level landmarks (koban / yatai cluster)
    { kind: 'c', x:   40, z:   50, r: 8 },     // Police koban
    { kind: 'c', x: -150, z:  -10, r: 10 },    // Ramen yatai cluster
    // River: a horizontal strip across the whole map at z = RIVER_Z
    { kind: 'r',
      x1: -CITY_RADIUS - 50, z1: RIVER_Z - RIVER_WIDTH / 2 - 4,
      x2:  CITY_RADIUS + 50, z2: RIVER_Z + RIVER_WIDTH / 2 + 4 },
  ];
  function isReserved(bx, bz) {
    for (let i = 0; i < RESERVED.length; i++) {
      const r = RESERVED[i];
      if (r.kind === 'r') {
        if (bx > r.x1 && bx < r.x2 && bz > r.z1 && bz < r.z2) return true;
      } else {
        const dx = bx - r.x, dz = bz - r.z;
        if (dx * dx + dz * dz < r.r * r.r) return true;
      }
    }
    return false;
  }

  // Buildings on each block (skipping center for spawn)
  for (let bx = -CITY_RADIUS + BLOCK / 2; bx <= CITY_RADIUS - BLOCK / 2; bx += BLOCK) {
    for (let bz = -CITY_RADIUS + BLOCK / 2; bz <= CITY_RADIUS - BLOCK / 2; bz += BLOCK) {
      // leave central plaza open
      if (Math.abs(bx) < BLOCK && Math.abs(bz) < BLOCK) continue;
      // skip blocks inside a landmark / park reservation
      if (isReserved(bx, bz)) continue;
      const distFromCenter = Math.sqrt(bx*bx + bz*bz);

      // skip some blocks entirely on lite mode (lower than before for fuller city)
      if (lite && Math.random() < 0.18) continue;
      // 1-3 buildings per block on desktop, 1-2 on lite
      const n = lite
        ? (Math.random() < 0.4 ? 2 : 1)
        : (Math.random() < 0.4 ? 3 : (Math.random() < 0.7 ? 2 : 1));
      for (let i = 0; i < n; i++) {
        const w = rand(8, BLOCK - STREET - 4) * (n === 1 ? 1.0 : 0.5);
        const d = rand(8, BLOCK - STREET - 4) * (n === 1 ? 1.0 : 0.5);
        const tallness = THREE.MathUtils.clamp(1.0 - distFromCenter / (CITY_RADIUS * 1.2), 0.2, 1.0);
        const h = rand(8, 60) * (0.4 + tallness);
        const offX = n === 2 ? (i === 0 ? -BLOCK/4 : BLOCK/4) : rand(-2, 2);
        const offZ = rand(-2, 2);
        const b = new Building(bx + offX, bz + offZ, w, d, h);
        // Buildings never move until destroyed -- skip per-frame matrix
        // multiplication and only refresh when collapse mutates them.
        b.group.matrixAutoUpdate = false;
        b.group.updateMatrix();
        scene.add(b.group);
        buildings.push(b);
        grid.add(b);
      }
    }
  }

  // Add some landmark buildings (regular skyscrapers)
  const landmarks = [
    { x: 80, z: 60, w: 18, d: 18, h: 110, color: 0xddccaa },
    { x: -90, z: -40, w: 22, d: 22, h: 130, color: 0x99aabb },
  ];
  for (const lm of landmarks) {
    const b = new Building(lm.x, lm.z, lm.w, lm.d, lm.h, { color: lm.color });
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group);
    buildings.push(b);
    grid.add(b);
  }

  // ---------- Iconic Tokyo landmarks ----------
  // Tokyo Tower: tall, destructible, custom lattice mesh.
  {
    const tx = 160, tz = -160, th = 90;
    const tower = new Building(tx, tz, 14, 14, th, { color: 0xd72b35, skipWindows: true });
    tower.group.matrixAutoUpdate = false; tower.group.updateMatrix();
    // Hide the InstancedMesh body slot for the tower; we render the lattice instead.
    tower._skipBodyIM = true;
    tower.customMesh = makeTokyoTowerMesh(th);
    tower.customMesh.position.set(tx, 0, tz);
    tower.customMesh.matrixAutoUpdate = false; tower.customMesh.updateMatrix();
    // Bonus HP so it takes a couple of beam shots to bring down.
    tower.maxHp = Math.max(tower.maxHp, 220);
    tower.hp = tower.maxHp;
    scene.add(tower.group);
    scene.add(tower.customMesh);
    buildings.push(tower);
    grid.add(tower);
  }

  // Imperial Palace: large walled compound with sloped pagoda-style roof.
  {
    const px = -180, pz = 140, ps = 60;
    const palace = new Building(px, pz, 28, 28, 22, { color: 0xeae3d2, skipWindows: true });
    palace.group.matrixAutoUpdate = false; palace.group.updateMatrix();
    palace._skipBodyIM = true;
    palace.customMesh = makeImperialPalaceMesh(ps);
    palace.customMesh.position.set(px, 0, pz);
    palace.customMesh.matrixAutoUpdate = false; palace.customMesh.updateMatrix();
    palace.maxHp = Math.max(palace.maxHp, 280);
    palace.hp = palace.maxHp;
    scene.add(palace.group);
    scene.add(palace.customMesh);
    buildings.push(palace);
    grid.add(palace);
  }

  // Parks: indestructible decoration, no collision.
  for (const p of [
    { x: 200, z: 200, size: 36 },
    { x: -200, z: -200, size: 36 },
    { x: 220, z: 60, size: 28 },
  ]) {
    scene.add(makePark(p.x, p.z, p.size));
  }

  // ---------- Industrial / power districts ----------
  // Both register as Buildings so they collide / take damage / collapse with
  // the standard VFX. The actual visuals come from custom mesh groups
  // (skipBodyIM = true).
  {
    const fac = new Building(240, -200, 110, 90, 16, { color: 0x6a6a68, skipWindows: true });
    fac.group.matrixAutoUpdate = false; fac.group.updateMatrix();
    fac._skipBodyIM = true;
    fac.customMesh = makeFactoryDistrict();
    fac.customMesh.position.set(240, 0, -200);
    fac.customMesh.matrixAutoUpdate = false; fac.customMesh.updateMatrix();
    fac.maxHp = 700; fac.hp = fac.maxHp; // beefy industrial complex
    scene.add(fac.group);
    scene.add(fac.customMesh);
    buildings.push(fac);
    grid.add(fac);
  }
  {
    const np = new Building(-240, -200, 130, 110, 22, { color: 0xa6a6a4, skipWindows: true });
    np.group.matrixAutoUpdate = false; np.group.updateMatrix();
    np._skipBodyIM = true;
    np.customMesh = makeNuclearPlant();
    np.customMesh.position.set(-240, 0, -200);
    np.customMesh.matrixAutoUpdate = false; np.customMesh.updateMatrix();
    np.maxHp = 900; np.hp = np.maxHp; // even tougher than factory
    scene.add(np.group);
    scene.add(np.customMesh);
    buildings.push(np);
    grid.add(np);
  }

  // ---------- River + bridges ----------
  scene.add(makeRiver(CITY_RADIUS, RIVER_Z, RIVER_WIDTH));
  // Drop a bridge wherever a major street crosses the river (~every 2 blocks)
  for (let bx = -CITY_RADIUS + BLOCK; bx <= CITY_RADIUS - BLOCK; bx += BLOCK * 2) {
    scene.add(makeBridge(bx, RIVER_Z, RIVER_WIDTH));
  }

  // ---------- Real Tokyo landmark towers (custom destructible meshes) ----------
  function addLandmark(spec) {
    const b = new Building(spec.x, spec.z, spec.w, spec.d, spec.h, { color: spec.color || 0xb0b8c4, skipWindows: true });
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    b._skipBodyIM = true;
    b.customMesh = spec.mesh;
    b.customMesh.position.set(spec.x, 0, spec.z);
    if (spec.rotY) b.customMesh.rotation.y = spec.rotY;
    b.customMesh.matrixAutoUpdate = false; b.customMesh.updateMatrix();
    if (spec.hp) { b.maxHp = spec.hp; b.hp = spec.hp; }
    scene.add(b.group);
    scene.add(b.customMesh);
    buildings.push(b);
    grid.add(b);
    return b;
  }
  addLandmark({ x:  220, z: -40,  w: 18, d: 18, h: 130, hp: 320, mesh: makeSkytreeMesh(130) });           // Tokyo Skytree
  addLandmark({ x:  120, z: 160,  w: 14, d: 14, h:  80, hp: 220, mesh: makeCocoonTowerMesh(80) });        // Mode Gakuen Cocoon
  addLandmark({ x: -100, z: -180, w: 18, d: 26, h:  46, hp: 180, mesh: makeAsahiMesh() });                // Asahi HQ + Flame
  addLandmark({ x:  -60, z:  220, w: 16, d: 16, h:  78, hp: 220, mesh: makeNTTDocomoMesh(78) });          // NTT DOCOMO clock tower
  addLandmark({ x:   60, z:  220, w: 26, d: 16, h:  18, hp: 140, mesh: makeKabukizaMesh() });             // Kabukiza Theatre
  addLandmark({ x:  -60, z: -100, w: 14, d: 14, h: 110, hp: 280, mesh: makeMoriJPMesh(110) });            // Azabudai Hills Mori JP Tower
  addLandmark({ x: -120, z:   60, w: 22, d: 22, h:  70, hp: 220, mesh: makeShibuyaScrambleMesh(70) });    // Shibuya Scramble Square

  // Build the global body + window InstancedMeshes now that all buildings exist.
  const bodiesIM = buildGlobalBodies(scene, buildings);
  buildGlobalWindows(scene);

  // Lamp posts -- one InstancedMesh for posts and one for bulbs (was 2
  // draw calls per lamp; ~30 lamps → 60 draws → 2 draws total).
  {
    const lampStep = BLOCK * 4;
    const positions = [];
    for (let i = -CITY_RADIUS + BLOCK; i < CITY_RADIUS; i += lampStep) {
      for (let j = -CITY_RADIUS + BLOCK; j < CITY_RADIUS; j += lampStep) {
        positions.push([i + BLOCK / 2 - 1, j + BLOCK / 2 - 1]);
      }
    }
    if (positions.length) {
      const postGeom = new THREE.CylinderGeometry(0.15, 0.18, 5, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const bulbGeom = new THREE.SphereGeometry(0.3, 6, 6);
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffeeaa, emissiveIntensity: 1.4 });
      const postIM = new THREE.InstancedMesh(postGeom, postMat, positions.length);
      const bulbIM = new THREE.InstancedMesh(bulbGeom, bulbMat, positions.length);
      postIM.frustumCulled = false; bulbIM.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let k = 0; k < positions.length; k++) {
        const [x, z] = positions[k];
        dummy.position.set(x, 2.5, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postIM.setMatrixAt(k, dummy.matrix);
        dummy.position.y = 5.0;
        dummy.updateMatrix();
        bulbIM.setMatrixAt(k, dummy.matrix);
      }
      postIM.instanceMatrix.needsUpdate = true;
      bulbIM.instanceMatrix.needsUpdate = true;
      scene.add(postIM);
      scene.add(bulbIM);
    }
  }

  // ---- Stoplights at major intersections ----
  // 4 InstancedMeshes per stoplight component (pole, head box, red, yellow,
  // green) shared by every intersection. Placed every 3rd block so we don't
  // light up every single corner.
  {
    const intersections = [];
    const stoplightStep = BLOCK;
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += stoplightStep) {
      for (let j = -CITY_RADIUS + BLOCK; j <= CITY_RADIUS - BLOCK; j += stoplightStep) {
        // Skip near central plaza + reserved zones
        if (Math.abs(i) < BLOCK && Math.abs(j) < BLOCK) continue;
        if (isReserved(i, j)) continue;
        intersections.push([i, j]);
      }
    }
    if (intersections.length) {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85, metalness: 0.4 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.5 });
      const redMat   = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff2200, emissiveIntensity: 0.0 });
      const yelMat   = new THREE.MeshStandardMaterial({ color: 0x443300, emissive: 0xffaa11, emissiveIntensity: 0.0 });
      const grnMat   = new THREE.MeshStandardMaterial({ color: 0x004411, emissive: 0x33ff66, emissiveIntensity: 0.0 });
      // We want one of {red, yellow, green} on per stoplight, so we'll
      // create three separate IMs sized to whatever subset of intersections
      // gets that colour and bake the live colour by setting its emissive
      // intensity at construction time. Per-instance emissive intensity
      // isn't directly supported, so we colour the bucket and skip per-
      // instance variation.
      const poleGeom = new THREE.CylinderGeometry(0.18, 0.22, 5.5, 6);
      const headGeom = new THREE.BoxGeometry(0.7, 1.6, 0.5);
      const lightGeom = new THREE.SphereGeometry(0.18, 8, 8);
      const N = intersections.length;
      const poleIM = new THREE.InstancedMesh(poleGeom, poleMat, N);
      const headIM = new THREE.InstancedMesh(headGeom, headMat, N);
      const redIM  = new THREE.InstancedMesh(lightGeom, redMat, N);
      const yelIM  = new THREE.InstancedMesh(lightGeom, yelMat, N);
      const grnIM  = new THREE.InstancedMesh(lightGeom, grnMat, N);
      poleIM.frustumCulled = headIM.frustumCulled = redIM.frustumCulled = yelIM.frustumCulled = grnIM.frustumCulled = false;
      const dummy = new THREE.Object3D();
      // Use instance color attr on the light IMs to selectively light one
      // bulb per stoplight. Off bulbs get a near-black colour modulator
      // (with the IM's MeshStandardMaterial having low base emissiveIntensity
      // already, this kills the glow). Since per-instance EMISSIVE isn't
      // supported, we instead use 3 different base materials with full
      // emissive intensity and use a SEPARATE OFF-stack of small black
      // capper boxes drawn over the inactive bulbs. Simpler: just keep
      // all 3 bulbs always lit but dimmed -- works fine visually given
      // bloom is doing the heavy lifting.
      for (let k = 0; k < N; k++) {
        const [ix, iz] = intersections[k];
        // Place on the SE corner of the intersection so it doesn't sit in
        // the road. The pole centre is offset diagonally outward by one
        // sidewalk + half-block.
        const cornerX = ix + STREET / 2 + SIDEWALK_W * 0.6;
        const cornerZ = iz + STREET / 2 + SIDEWALK_W * 0.6;
        // Pole
        dummy.position.set(cornerX, 2.75, cornerZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleIM.setMatrixAt(k, dummy.matrix);
        // Head (signal box on top of pole)
        dummy.position.set(cornerX, 5.6, cornerZ);
        dummy.updateMatrix();
        headIM.setMatrixAt(k, dummy.matrix);
        // Three lights stacked vertically (red top, yellow mid, green bottom)
        for (const [im, yOff] of [[redIM, 6.15], [yelIM, 5.6], [grnIM, 5.05]]) {
          dummy.position.set(cornerX, yOff, cornerZ + 0.27);
          dummy.updateMatrix();
          im.setMatrixAt(k, dummy.matrix);
        }
      }
      poleIM.instanceMatrix.needsUpdate = true;
      headIM.instanceMatrix.needsUpdate = true;
      // Set the active emissive intensity. We dim 2 of 3 lights heavily so
      // it reads as one colour active + two dim, like a real signal.
      redMat.emissiveIntensity = 1.8;
      yelMat.emissiveIntensity = 0.3;
      grnMat.emissiveIntensity = 0.3;
      redIM.instanceMatrix.needsUpdate = true;
      yelIM.instanceMatrix.needsUpdate = true;
      grnIM.instanceMatrix.needsUpdate = true;
      scene.add(poleIM); scene.add(headIM);
      scene.add(redIM); scene.add(yelIM); scene.add(grnIM);
    }
  }

  // ---- Street name signs ----
  // Cross-arm signs at every other intersection on the NW corner (so
  // they don't pile up with the stoplights on the SE corner). One pole
  // + horizontal cross-arm + two white sign plates per intersection.
  // Five IMs total drive the entire grid.
  {
    const signStep = BLOCK * 2;
    const corners = [];
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += signStep) {
      for (let j = -CITY_RADIUS + BLOCK; j <= CITY_RADIUS - BLOCK; j += signStep) {
        if (Math.abs(i) < BLOCK && Math.abs(j) < BLOCK) continue;
        if (isReserved(i, j)) continue;
        corners.push([i, j]);
      }
    }
    if (corners.length) {
      const N = corners.length;
      const poleMat  = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.85, metalness: 0.4 });
      const armMat   = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
      const plateMat = new THREE.MeshStandardMaterial({
        color: 0xeeeeee, roughness: 0.5,
        emissive: 0xeeeeee, emissiveIntensity: 0.3,
      });
      const textMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
      const poleGeom  = new THREE.CylinderGeometry(0.13, 0.16, 4.5, 6);
      const armGeom   = new THREE.BoxGeometry(2.6, 0.12, 0.12);
      const plateGeom = new THREE.BoxGeometry(2.0, 0.55, 0.06);
      // "Text" stripe: tiny darker box on top of the plate that reads as
      // a placeholder for the street name without requiring a canvas.
      const textGeom  = new THREE.BoxGeometry(1.6, 0.18, 0.02);
      const poleIM  = new THREE.InstancedMesh(poleGeom, poleMat, N);
      const armIM   = new THREE.InstancedMesh(armGeom, armMat, N);
      // Two plates per intersection (one per cross street, perpendicular)
      const plateIM = new THREE.InstancedMesh(plateGeom, plateMat, N * 2);
      const textIM  = new THREE.InstancedMesh(textGeom, textMat, N * 2);
      [poleIM, armIM, plateIM, textIM].forEach(im => { im.frustumCulled = false; });
      const dummy = new THREE.Object3D();
      for (let k = 0; k < N; k++) {
        const [ix, iz] = corners[k];
        // NW corner of the intersection
        const cx = ix - STREET / 2 - SIDEWALK_W * 0.6;
        const cz = iz - STREET / 2 - SIDEWALK_W * 0.6;
        // Pole
        dummy.position.set(cx, 2.25, cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        poleIM.setMatrixAt(k, dummy.matrix);
        // Cross-arm (single horizontal arm; signs hang off both sides)
        dummy.position.set(cx, 4.2, cz);
        dummy.rotation.set(0, Math.PI / 4, 0); // diagonal so two perpendicular signs read clearly
        dummy.updateMatrix();
        armIM.setMatrixAt(k, dummy.matrix);
        // Sign plate 1 -- N/S street, on +X end of the arm
        const arm1 = { dx: Math.cos(Math.PI / 4) * 0.95, dz: Math.sin(Math.PI / 4) * 0.95 };
        dummy.position.set(cx + arm1.dx, 4.0, cz + arm1.dz);
        dummy.rotation.set(0, 0, 0); // facing +Z
        dummy.updateMatrix();
        plateIM.setMatrixAt(k * 2, dummy.matrix);
        // Text band on plate 1
        dummy.position.set(cx + arm1.dx, 4.05, cz + arm1.dz + 0.04);
        dummy.updateMatrix();
        textIM.setMatrixAt(k * 2, dummy.matrix);
        // Sign plate 2 -- E/W street, on -X end of the arm, perpendicular
        const arm2 = { dx: -arm1.dx, dz: -arm1.dz };
        dummy.position.set(cx + arm2.dx, 4.0, cz + arm2.dz);
        dummy.rotation.set(0, Math.PI / 2, 0); // facing +X
        dummy.updateMatrix();
        plateIM.setMatrixAt(k * 2 + 1, dummy.matrix);
        // Text band on plate 2
        dummy.position.set(cx + arm2.dx + 0.04, 4.05, cz + arm2.dz);
        dummy.updateMatrix();
        textIM.setMatrixAt(k * 2 + 1, dummy.matrix);
      }
      [poleIM, armIM, plateIM, textIM].forEach(im => {
        im.instanceMatrix.needsUpdate = true; scene.add(im);
      });
    }
  }

  // ---- Crosswalks at major (every-3rd-block) intersections ----
  // Each crossing is 5 white stripes; we lay them on the four approach
  // sides per intersection. Instanced once for the whole city.
  {
    const stoplightStep = BLOCK;
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8, emissive: 0x333333, emissiveIntensity: 0.05 });
    const stripeGeom = new THREE.PlaneGeometry(0.7, STREET - 1.6);
    const positions = [];
    const dummy = new THREE.Object3D();
    const STRIPES = 5;
    const STRIPE_SPACING = 0.95;
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += stoplightStep) {
      for (let j = -CITY_RADIUS + BLOCK; j <= CITY_RADIUS - BLOCK; j += stoplightStep) {
        if (Math.abs(i) < BLOCK && Math.abs(j) < BLOCK) continue;
        if (isReserved(i, j)) continue;
        // Four crossings per intersection: N, S, E, W of the intersection centre
        const crossings = [
          { x: i, z: j + STREET / 2 + 1.2, axis: 'x' }, // north crossing (perpendicular to z-street)
          { x: i, z: j - STREET / 2 - 1.2, axis: 'x' },
          { x: i + STREET / 2 + 1.2, z: j, axis: 'z' },
          { x: i - STREET / 2 - 1.2, z: j, axis: 'z' },
        ];
        for (const c of crossings) {
          for (let s = 0; s < STRIPES; s++) {
            const offset = (s - (STRIPES - 1) / 2) * STRIPE_SPACING;
            if (c.axis === 'x') {
              positions.push({ x: c.x + offset, y: 0.075, z: c.z, rotY: 0 });
            } else {
              positions.push({ x: c.x, y: 0.075, z: c.z + offset, rotY: Math.PI / 2 });
            }
          }
        }
      }
    }
    if (positions.length) {
      const im = new THREE.InstancedMesh(stripeGeom, stripeMat, positions.length);
      im.frustumCulled = false;
      im.receiveShadow = true;
      for (let k = 0; k < positions.length; k++) {
        const p = positions[k];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(-Math.PI / 2, 0, p.rotY);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
  }

  // ---- Street trees scattered on sidewalks ----
  // Trunk shared, leaves split into 3 colour buckets (oak green / sakura
  // pink / autumn orange) for visual variety. Each tree is randomly
  // assigned a bucket on placement.
  {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.95 });
    const trunkGeom = new THREE.CylinderGeometry(0.32, 0.42, 3.4, 6);
    const leafGeom  = new THREE.SphereGeometry(1.7, 8, 6);
    const LEAF_BUCKETS = [
      { name: 'green',  mat: new THREE.MeshStandardMaterial({ color: 0x346a2a, roughness: 0.85 }), weight: 0.62 },
      { name: 'sakura', mat: new THREE.MeshStandardMaterial({ color: 0xff9bbf, roughness: 0.75, emissive: 0xff5588, emissiveIntensity: 0.15 }), weight: 0.22 },
      { name: 'autumn', mat: new THREE.MeshStandardMaterial({ color: 0xd96a22, roughness: 0.85 }), weight: 0.16 },
    ];
    const treePositions = [];
    const STREET_OFFSET = STREET / 2 + 2.4;
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += BLOCK) {
      for (let along = -CITY_RADIUS + 12; along < CITY_RADIUS; along += 18) {
        if (isReserved(along, i + STREET_OFFSET) || Math.abs(along) < BLOCK / 2) continue;
        if (Math.random() < 0.55) {
          treePositions.push({ x: along, z: i + STREET_OFFSET, scale: 0.8 + Math.random() * 0.5 });
        }
        if (Math.random() < 0.55) {
          treePositions.push({ x: along, z: i - STREET_OFFSET, scale: 0.8 + Math.random() * 0.5 });
        }
      }
    }
    if (treePositions.length) {
      // Bucket every tree
      const buckets = LEAF_BUCKETS.map(() => []);
      for (const t of treePositions) {
        const r = Math.random();
        let acc = 0; let bIdx = 0;
        for (let i = 0; i < LEAF_BUCKETS.length; i++) {
          acc += LEAF_BUCKETS[i].weight;
          if (r < acc) { bIdx = i; break; }
        }
        buckets[bIdx].push(t);
      }
      // Trunks share one IM (all trees regardless of leaf colour)
      const trunkIM = new THREE.InstancedMesh(trunkGeom, trunkMat, treePositions.length);
      trunkIM.frustumCulled = false;
      const dummy = new THREE.Object3D();
      let trunkIdx = 0;
      for (const list of buckets) {
        for (const t of list) {
          dummy.position.set(t.x, 1.7 * t.scale, t.z);
          dummy.scale.set(t.scale, t.scale, t.scale);
          dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
          dummy.updateMatrix();
          trunkIM.setMatrixAt(trunkIdx++, dummy.matrix);
        }
      }
      trunkIM.instanceMatrix.needsUpdate = true;
      scene.add(trunkIM);
      // Three leaf IMs, one per colour bucket
      for (let i = 0; i < LEAF_BUCKETS.length; i++) {
        const list = buckets[i];
        if (!list.length) continue;
        const leafIM = new THREE.InstancedMesh(leafGeom, LEAF_BUCKETS[i].mat, list.length);
        leafIM.frustumCulled = false;
        for (let k = 0; k < list.length; k++) {
          const t = list[k];
          dummy.position.set(t.x, 4.2 * t.scale, t.z);
          dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
          dummy.scale.set(1.2 * t.scale, 1.0 * t.scale, 1.2 * t.scale);
          dummy.updateMatrix();
          leafIM.setMatrixAt(k, dummy.matrix);
        }
        leafIM.instanceMatrix.needsUpdate = true;
        scene.add(leafIM);
      }
    }
  }

  // ---- Vending machines at street corners ----
  // 3 instanced meshes, one per colour. Iconic Tokyo street furniture --
  // cheap, glowing, and a great bloom contributor.
  {
    const VENDING_COLORS = [
      { color: 0xc12030, name: 'red'  },
      { color: 0x2266aa, name: 'blue' },
      { color: 0x33aa55, name: 'green'},
    ];
    const buckets = VENDING_COLORS.map(() => []);
    const vGeom = new THREE.BoxGeometry(1.1, 2.4, 0.7);
    // Place at every 5th intersection corner (spacing dense enough to feel
    // urban but not blanket-cover the entire city)
    const step = BLOCK * 2;
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += step) {
      for (let j = -CITY_RADIUS + BLOCK; j <= CITY_RADIUS - BLOCK; j += step) {
        if (Math.abs(i) < BLOCK && Math.abs(j) < BLOCK) continue;
        if (isReserved(i, j)) continue;
        const cornerX = i + STREET / 2 + 2.0;
        const cornerZ = j + STREET / 2 + 2.0;
        const bIdx = Math.floor(Math.random() * VENDING_COLORS.length);
        buckets[bIdx].push({ x: cornerX, z: cornerZ });
        // Sometimes add a 2nd machine adjacent to make a bank-of-vendors
        if (Math.random() < 0.4) {
          const bIdx2 = Math.floor(Math.random() * VENDING_COLORS.length);
          buckets[bIdx2].push({ x: cornerX + 1.3, z: cornerZ });
        }
      }
    }
    const dummy = new THREE.Object3D();
    for (let i = 0; i < VENDING_COLORS.length; i++) {
      const list = buckets[i];
      if (!list.length) continue;
      const c = VENDING_COLORS[i].color;
      const mat = new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.3,
      });
      const im = new THREE.InstancedMesh(vGeom, mat, list.length);
      im.frustumCulled = false;
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        dummy.position.set(p.x, 1.2, p.z);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
  }

  // ---- Lamp-post ground glow patches ----
  // A small amber glow disc under every lamp so the lighting reads even
  // when the actual point lights are off (which they always are -- the
  // lamps were always emissive bulbs without dynamic light, but the glow
  // patches sell the illusion of dropped light).
  {
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffd180, transparent: true, opacity: 0.25, depthWrite: false,
    });
    const glowGeom = new THREE.CircleGeometry(3.6, 16);
    const lampStep = BLOCK * 4;
    const positions = [];
    for (let i = -CITY_RADIUS + BLOCK; i < CITY_RADIUS; i += lampStep) {
      for (let j = -CITY_RADIUS + BLOCK; j < CITY_RADIUS; j += lampStep) {
        positions.push([i + BLOCK / 2 - 1, j + BLOCK / 2 - 1]);
      }
    }
    if (positions.length) {
      const im = new THREE.InstancedMesh(glowGeom, glowMat, positions.length);
      im.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let k = 0; k < positions.length; k++) {
        const [x, z] = positions[k];
        dummy.position.set(x, 0.18, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
  }

  // ---- Construction site landmark (with tower crane) ----
  {
    const cs = makeConstructionSite();
    cs.position.set(120, 0, -100);
    cs.matrixAutoUpdate = false; cs.updateMatrix();
    scene.add(cs);
  }

  // ---- Telephone poles + sagging power lines ----
  // Poles run along every other E-W street, alternating sides. Each
  // pole is a wooden cylinder + horizontal cross-arm + 3 ceramic
  // insulators + 3 power lines sagging to the next pole.
  {
    const poleMat   = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 });
    const armMat    = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 });
    const insMat    = new THREE.MeshStandardMaterial({ color: 0xeae3d0, roughness: 0.5 });
    const cableMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const POLE_H = 7.0;
    const ARM_W = 2.4;
    const SPAN = BLOCK;            // distance between consecutive poles
    const STREET_OFFSET_P = STREET / 2 + 1.6;
    const poles = []; // {x, z}
    for (let i = -CITY_RADIUS + BLOCK * 2; i <= CITY_RADIUS - BLOCK * 2; i += BLOCK * 2) {
      // Alternate side per row so the sky doesn't get a uniform grid
      const side = (Math.floor((i + CITY_RADIUS) / BLOCK) % 2 === 0) ? 1 : -1;
      const z = i + side * STREET_OFFSET_P;
      for (let x = -CITY_RADIUS + BLOCK; x <= CITY_RADIUS - BLOCK; x += SPAN) {
        if (isReserved(x, z) || Math.abs(x) < BLOCK) continue;
        poles.push({ x, z });
      }
    }
    if (poles.length) {
      // Pole InstancedMesh
      const poleGeom = new THREE.CylinderGeometry(0.18, 0.22, POLE_H, 6);
      const poleIM = new THREE.InstancedMesh(poleGeom, poleMat, poles.length);
      poleIM.frustumCulled = false;
      // Cross-arm IM (one per pole)
      const armGeom = new THREE.BoxGeometry(ARM_W, 0.18, 0.18);
      const armIM = new THREE.InstancedMesh(armGeom, armMat, poles.length);
      armIM.frustumCulled = false;
      // Insulator IM (3 per pole)
      const insGeom = new THREE.CylinderGeometry(0.13, 0.13, 0.4, 6);
      const insIM = new THREE.InstancedMesh(insGeom, insMat, poles.length * 3);
      insIM.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let k = 0; k < poles.length; k++) {
        const p = poles[k];
        dummy.position.set(p.x, POLE_H / 2, p.z); dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix();
        poleIM.setMatrixAt(k, dummy.matrix);
        dummy.position.set(p.x, POLE_H - 0.4, p.z); dummy.updateMatrix();
        armIM.setMatrixAt(k, dummy.matrix);
        for (let i = -1; i <= 1; i++) {
          dummy.position.set(p.x + i * (ARM_W / 2 - 0.2), POLE_H - 0.2, p.z);
          dummy.updateMatrix();
          insIM.setMatrixAt(k * 3 + (i + 1), dummy.matrix);
        }
      }
      poleIM.instanceMatrix.needsUpdate = true;
      armIM.instanceMatrix.needsUpdate = true;
      insIM.instanceMatrix.needsUpdate = true;
      scene.add(poleIM); scene.add(armIM); scene.add(insIM);

      // Sagging cables between consecutive poles in each row
      // Group poles by z (same row) and sort by x
      const rows = new Map();
      for (const p of poles) {
        const key = Math.round(p.z);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(p);
      }
      for (const arr of rows.values()) {
        arr.sort((a, b) => a.x - b.x);
        for (let n = 0; n + 1 < arr.length; n++) {
          const a = arr[n], b = arr[n + 1];
          if (b.x - a.x > SPAN * 1.5) continue; // skip across reserved gaps
          for (let line = 0; line < 3; line++) {
            const offset = (line - 1) * (ARM_W / 2 - 0.2);
            const start = new THREE.Vector3(a.x + offset, POLE_H - 0.2, a.z);
            const sag   = new THREE.Vector3((a.x + b.x) / 2 + offset, POLE_H - 0.7, (a.z + b.z) / 2);
            const end   = new THREE.Vector3(b.x + offset, POLE_H - 0.2, b.z);
            const curve = new THREE.QuadraticBezierCurve3(start, sag, end);
            const tube = new THREE.Mesh(
              new THREE.TubeGeometry(curve, 8, 0.04, 4, false),
              cableMat
            );
            tube.matrixAutoUpdate = false; tube.updateMatrix();
            scene.add(tube);
          }
        }
      }
    }
  }

  // ---- Manhole covers on streets ----
  {
    const manholeMat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.8, metalness: 0.4 });
    const manholeGeom = new THREE.CylinderGeometry(1.05, 1.05, 0.06, 18);
    const manholes = [];
    // Drop a manhole every BLOCK along each street, slight offset variation
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += BLOCK) {
      for (let j = -CITY_RADIUS + BLOCK; j <= CITY_RADIUS - BLOCK; j += BLOCK) {
        // E-W street at z=i, manhole somewhere along x mid-block
        const x1 = j + (Math.random() - 0.5) * (BLOCK * 0.6);
        if (Math.abs(x1) > 8 && !isReserved(x1, i)) {
          manholes.push({ x: x1, z: i + (Math.random() - 0.5) * 1.5 });
        }
      }
    }
    if (manholes.length) {
      const im = new THREE.InstancedMesh(manholeGeom, manholeMat, manholes.length);
      im.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let k = 0; k < manholes.length; k++) {
        const m = manholes[k];
        dummy.position.set(m.x, 0.085, m.z);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
  }

  // ---- Parked cars along sidewalks ----
  // Static instanced meshes that don't move. Body + cabin + 4 wheels in
  // 4 IMs. We pick a fixed colour palette so the parked rows have variety
  // without needing per-instance colour.
  {
    const PARKED_COLORS = [0xc23030, 0x2266aa, 0x33aa55, 0xeeeeee, 0x222222, 0xeeaa33, 0x995577];
    const buckets = PARKED_COLORS.map(() => []);
    const STREET_OFFSET_P = STREET / 2 + 4.8;
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += BLOCK) {
      for (let along = -CITY_RADIUS + 14; along < CITY_RADIUS; along += 6) {
        if (isReserved(along, i + STREET_OFFSET_P) || Math.abs(along) < BLOCK / 2) continue;
        if (Math.random() < 0.18) {
          const cIdx = Math.floor(Math.random() * PARKED_COLORS.length);
          buckets[cIdx].push({ x: along, z: i + STREET_OFFSET_P, axis: 'x', dir: 1 });
        }
        if (Math.random() < 0.18) {
          const cIdx = Math.floor(Math.random() * PARKED_COLORS.length);
          buckets[cIdx].push({ x: along, z: i - STREET_OFFSET_P, axis: 'x', dir: -1 });
        }
      }
    }
    const bodyGeom = new THREE.BoxGeometry(1.6, 0.8, 3.4);
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.7, 1.6);
    const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.6 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARKED_COLORS.length; i++) {
      const list = buckets[i];
      if (!list.length) continue;
      const bodyMat = new THREE.MeshStandardMaterial({ color: PARKED_COLORS[i], roughness: 0.5, metalness: 0.3 });
      const bodyIM = new THREE.InstancedMesh(bodyGeom, bodyMat, list.length);
      bodyIM.frustumCulled = false;
      const cabinIM = new THREE.InstancedMesh(cabinGeom, cabinMat, list.length);
      cabinIM.frustumCulled = false;
      const wheelIM = new THREE.InstancedMesh(wheelGeom, wheelMat, list.length * 4);
      wheelIM.frustumCulled = false;
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        const yaw = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        // Body
        dummy.position.set(p.x, 0.6, p.z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1,1,1); dummy.updateMatrix();
        bodyIM.setMatrixAt(k, dummy.matrix);
        // Cabin (slightly back of centre)
        dummy.position.set(p.x - Math.cos(yaw) * -0.1, 1.25, p.z - Math.sin(yaw) * -0.1);
        dummy.updateMatrix();
        cabinIM.setMatrixAt(k, dummy.matrix);
        // Wheels (4 corners)
        for (let w = 0; w < 4; w++) {
          const fx = (w & 1) ? 1 : -1;
          const fz = (w & 2) ? 1 : -1;
          const lx = fx * 0.7, lz = fz * 1.1;
          const wx = p.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
          const wz = p.z + Math.sin(yaw) * -lx + Math.cos(yaw) * lz;
          dummy.position.set(wx, 0.25, wz);
          dummy.rotation.set(0, yaw, Math.PI / 2);
          dummy.updateMatrix();
          wheelIM.setMatrixAt(k * 4 + w, dummy.matrix);
        }
      }
      bodyIM.instanceMatrix.needsUpdate = true;
      cabinIM.instanceMatrix.needsUpdate = true;
      wheelIM.instanceMatrix.needsUpdate = true;
      scene.add(bodyIM); scene.add(cabinIM); scene.add(wheelIM);
    }
  }

  // ---- Bicycles parked at sidewalks ----
  // Iconic Tokyo street-side cycle parking. We use 3 IMs (frame, front
  // wheel, back wheel) so the whole population renders in 3 draw calls.
  // Wheels are vertical (rotated to align with the bike's travel axis).
  {
    const bikePoses = [];
    const STREET_OFF_BIKE = STREET / 2 + SIDEWALK_W * 0.55;
    for (let i = -CITY_RADIUS + BLOCK; i <= CITY_RADIUS - BLOCK; i += BLOCK) {
      for (let along = -CITY_RADIUS + 8; along < CITY_RADIUS; along += 4.5) {
        if (Math.abs(along) < BLOCK / 2) continue;
        // North side of E-W street
        if (Math.random() < 0.10) {
          const z = i + STREET_OFF_BIKE + (Math.random() - 0.5) * 0.5;
          if (!isReserved(along, z)) bikePoses.push({ x: along, z, yaw: Math.PI / 2 + (Math.random() - 0.5) * 0.4 });
        }
        // South side of E-W street
        if (Math.random() < 0.10) {
          const z = i - STREET_OFF_BIKE + (Math.random() - 0.5) * 0.5;
          if (!isReserved(along, z)) bikePoses.push({ x: along, z, yaw: Math.PI / 2 + (Math.random() - 0.5) * 0.4 });
        }
      }
    }
    if (bikePoses.length) {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.55, metalness: 0.6 });
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
      // Frame approximated as a thin box (1.6u long, 0.7u tall, 0.06u wide)
      const frameGeom = new THREE.BoxGeometry(1.6, 0.7, 0.06);
      const wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10);
      const seatGeom  = new THREE.BoxGeometry(0.22, 0.08, 0.08);
      const handleGeom = new THREE.BoxGeometry(0.45, 0.06, 0.06);
      const frameIM = new THREE.InstancedMesh(frameGeom, frameMat, bikePoses.length);
      const fwIM    = new THREE.InstancedMesh(wheelGeom, wheelMat, bikePoses.length);
      const bwIM    = new THREE.InstancedMesh(wheelGeom, wheelMat, bikePoses.length);
      const seatIM  = new THREE.InstancedMesh(seatGeom, frameMat, bikePoses.length);
      const handleIM = new THREE.InstancedMesh(handleGeom, frameMat, bikePoses.length);
      [frameIM, fwIM, bwIM, seatIM, handleIM].forEach(im => { im.frustumCulled = false; });
      const dummy = new THREE.Object3D();
      for (let k = 0; k < bikePoses.length; k++) {
        const b = bikePoses[k];
        // Frame: tilted ~12° "leaning on a kickstand" lean for realism
        const lean = (Math.random() < 0.5 ? 1 : -1) * 0.18;
        // Travel direction is along the street (axis depends on placement),
        // approximated by the yaw stored above. Frame box's long axis is X
        // so we rotate Y by yaw to align with the street.
        dummy.position.set(b.x, 0.5, b.z);
        dummy.rotation.set(0, b.yaw, lean);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        frameIM.setMatrixAt(k, dummy.matrix);
        // Wheels: vertical (rot.x = π/2), positioned at frame ends along yaw
        const fwd = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
        dummy.position.set(b.x + fwd.x * 0.7, 0.32, b.z + fwd.z * 0.7);
        dummy.rotation.set(Math.PI / 2, 0, b.yaw);
        dummy.updateMatrix(); fwIM.setMatrixAt(k, dummy.matrix);
        dummy.position.set(b.x - fwd.x * 0.7, 0.32, b.z - fwd.z * 0.7);
        dummy.rotation.set(Math.PI / 2, 0, b.yaw);
        dummy.updateMatrix(); bwIM.setMatrixAt(k, dummy.matrix);
        // Seat
        dummy.position.set(b.x - fwd.x * 0.2, 0.95, b.z - fwd.z * 0.2);
        dummy.rotation.set(0, b.yaw, lean);
        dummy.updateMatrix(); seatIM.setMatrixAt(k, dummy.matrix);
        // Handlebar
        dummy.position.set(b.x + fwd.x * 0.55, 0.9, b.z + fwd.z * 0.55);
        dummy.rotation.set(0, b.yaw + Math.PI / 2, lean);
        dummy.updateMatrix(); handleIM.setMatrixAt(k, dummy.matrix);
      }
      [frameIM, fwIM, bwIM, seatIM, handleIM].forEach(im => {
        im.instanceMatrix.needsUpdate = true; scene.add(im);
      });
    }
  }

  // ---- Police koban (交番) ----
  // Small two-story police box. Iconic blue uniformed officer would stand
  // outside, but at this scale the box itself reads as one. Single Group.
  {
    const koban = makePoliceKoban();
    const kx = 40, kz = 50;
    if (!isReserved(kx, kz)) {
      koban.position.set(kx, 0, kz);
      scene.add(koban);
    }
  }

  // ---- Ramen yatai cluster (ramen food carts) ----
  // 2 carts side-by-side with red chochin lanterns + steam rising. Placed
  // at a corner near the park.
  {
    const yatai = makeRamenYatai();
    const yx = -150, yz = -10;
    if (!isReserved(yx, yz)) {
      yatai.position.set(yx, 0, yz);
      scene.add(yatai);
    }
  }

  // ---- Torii gate (神社の鳥居) ----
  // Big red Japanese gate at the entrance to Park 1. Two pillars, kasagi
  // (top beam), nuki (lower cross-beam). Pure visual landmark.
  {
    const torii = makeToriiGate();
    torii.position.set(200, 0, 175); // just south of Park 1 (200, 200)
    torii.rotation.y = 0;
    scene.add(torii);
  }

  // ---- Pigeon flock (animated) ----
  // 14 small bird silhouettes flying in a slow circular pattern overhead.
  // Wings flap on a cosine curve. Returns an animator pushed onto
  // cityAnimators that the main game loop will tick each frame.
  const flock = makePigeonFlock(scene);

  // ---- Subway entrance kiosks ----
  // Small 4u-tall kiosk with a roof, dark stairwell descending into it,
  // yellow safety railings, and a "地下鉄" sign. Dropped at a few major
  // intersections.
  {
    const subwayPositions = [
      { x:  60, z:  60 }, { x: -100, z: 100 }, { x:  60, z: -200 },
      { x: -60, z: -60 }, { x: 200, z: 100 }, { x: -200, z:  40 },
    ];
    for (const p of subwayPositions) {
      if (isReserved(p.x, p.z)) continue;
      const sub = makeSubwayEntrance();
      sub.position.set(p.x, 0, p.z);
      sub.matrixAutoUpdate = false; sub.updateMatrix();
      scene.add(sub);
    }
  }

  return { buildings, grid, bodiesIM, cityAnimators: [flock] };
}

// Tokyo "koban" -- small two-story police box. Sky-blue trim, white wall,
// red rooflight, "交番" sign over the door.
function makePoliceKoban() {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd0d8d0, roughness: 0.7 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.5, metalness: 0.3 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 2.5 });
  const doorMat  = new THREE.MeshStandardMaterial({ color: 0x88aacc, emissive: 0x445577, emissiveIntensity: 0.4, roughness: 0.2 });
  // Body (two-story)
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 5.5), wallMat);
  body.position.y = 3.5; g.add(body);
  // Blue trim band
  const trim = new THREE.Mesh(new THREE.BoxGeometry(6.05, 0.5, 5.55), trimMat);
  trim.position.y = 4.0; g.add(trim);
  // Pitched roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), roofMat);
  roof.position.y = 7 + 0.8;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // Roof "police" red light
  const lightStand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), trimMat);
  lightStand.position.set(0, 7.7 + 0.4, 0); g.add(lightStand);
  const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), lightMat);
  redLight.position.set(0, 7.7 + 1.0, 0); g.add(redLight);
  // Glass door (front)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.0, 0.1), doorMat);
  door.position.set(0, 1.5, 5.5 / 2 + 0.06); g.add(door);
  // 交番 sign band over the door
  const signMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeeeeee, emissiveIntensity: 0.6 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 0.1), signMat);
  sign.position.set(0, 4.4, 5.5 / 2 + 0.06); g.add(sign);
  // Side small windows
  const winMat = new THREE.MeshStandardMaterial({ color: 0x224466, emissive: 0x336688, emissiveIntensity: 0.5, roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.6), winMat);
    w1.position.set(sx * 3.05, 5.0, 0); g.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.1), winMat);
    w2.position.set(sx * 1.6, 5.0, 5.5 / 2 + 0.05); g.add(w2);
  }
  g.matrixAutoUpdate = false;
  return g;
}

// Ramen yatai (food cart) cluster. 2 carts joined by a chochin lantern
// row, with a steam wisp rising from each kettle.
function makeRamenYatai() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85 });
  const cartTopMat = new THREE.MeshStandardMaterial({ color: 0xd64030, roughness: 0.7 });
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.85 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff4422, emissiveIntensity: 2.2, roughness: 0.5 });
  const lanternFrameMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const kettleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const steamMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.4, depthWrite: false });
  for (let i = 0; i < 2; i++) {
    const cart = new THREE.Group();
    cart.position.set(i * 5.5, 0, 0);
    // Counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.6), counterMat);
    counter.position.y = 1.0; cart.add(counter);
    // Roof posts (4)
    const postGeom = new THREE.BoxGeometry(0.15, 2.4, 0.15);
    for (const dx of [-1.9, 1.9]) {
      for (const dz of [-0.7, 0.7]) {
        const p = new THREE.Mesh(postGeom, woodMat);
        p.position.set(dx, 1.5 + 1.2, dz); cart.add(p);
      }
    }
    // Red roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 1.9), cartTopMat);
    roof.position.y = 3.7; cart.add(roof);
    // Kettle on counter
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.7, 12), kettleMat);
    kettle.position.set(-0.8, 1.85, 0); cart.add(kettle);
    // Steam wisp
    const steam = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), steamMat);
    steam.position.set(-0.8, 2.7, 0); steam.scale.y = 1.4; cart.add(steam);
    const steam2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), steamMat);
    steam2.position.set(-0.7, 3.5, 0.1); cart.add(steam2);
    // Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 10);
    for (const dx of [-1.6, 1.6]) {
      for (const dz of [-0.65, 0.65]) {
        const w = new THREE.Mesh(wheelGeom, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(dx, 0.4, dz); cart.add(w);
      }
    }
    g.add(cart);
  }
  // 4 chochin lanterns hanging on the connecting beam between carts
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 0.12), lanternFrameMat);
  beam.position.set(2.75, 4.0, 0); g.add(beam);
  for (let i = 0; i < 4; i++) {
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.85, 10), lanternMat);
    lan.position.set(0.5 + i * 1.6, 3.4, 0); g.add(lan);
    // Black string
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.04), lanternFrameMat);
    str.position.set(0.5 + i * 1.6, 3.78, 0); g.add(str);
  }
  g.matrixAutoUpdate = false;
  return g;
}

// Big red Japanese torii gate. Two pillars, top beam (kasagi) with curved
// uplifted ends, and a horizontal cross-beam (nuki) below it.
function makeToriiGate() {
  const g = new THREE.Group();
  const redMat = new THREE.MeshStandardMaterial({ color: 0xc8302a, roughness: 0.55, metalness: 0.05 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const PILLAR_H = 11, PILLAR_R = 0.65, SPAN = 9;
  // Two pillars (slight inward taper at the top, matched by classical gates)
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.1, PILLAR_H, 14),
      redMat,
    );
    pillar.position.set(sx * SPAN / 2, PILLAR_H / 2, 0);
    g.add(pillar);
    // Pillar base (small black plinth)
    const base = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_R * 2.6, 0.35, PILLAR_R * 2.6), blackMat);
    base.position.set(sx * SPAN / 2, 0.18, 0);
    g.add(base);
  }
  // Nuki -- lower cross-beam (passes through the pillars)
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(SPAN + 1.6, 0.85, 0.85), redMat);
  nuki.position.set(0, PILLAR_H * 0.78, 0);
  g.add(nuki);
  // Kasagi -- top beam with curved uplifted ends. We approximate by stacking
  // a long thin beam plus two angled "horns" at each end.
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(SPAN + 4, 0.95, 1.4), redMat);
  kasagi.position.set(0, PILLAR_H + 0.85, 0); g.add(kasagi);
  // Shimaki (a black thin layer just under the kasagi)
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(SPAN + 3.2, 0.35, 1.2), blackMat);
  shimaki.position.set(0, PILLAR_H + 0.35, 0); g.add(shimaki);
  // Upturned ends (crown horns)
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 1.4), redMat);
    horn.position.set(sx * (SPAN / 2 + 1.8), PILLAR_H + 1.15, 0);
    horn.rotation.z = sx * 0.18;
    g.add(horn);
  }
  // Center plaque (white "鳥居" tag-ish, just a white box)
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0xeeeeec, emissive: 0xeeeeec, emissiveIntensity: 0.4 }));
  plaque.position.set(0, PILLAR_H * 0.92, 0.6);
  g.add(plaque);
  g.matrixAutoUpdate = false;
  return g;
}

// Pigeon flock: 14 birds drifting in slow lazy circles overhead. Wings
// flap via a sine curve in the animator. Three IMs (body, wing-L, wing-R)
// plus an animator object that the main loop ticks.
function makePigeonFlock(scene) {
  const COUNT = 14;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.85 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.8, side: THREE.DoubleSide });
  const bodyGeom = new THREE.BoxGeometry(0.45, 0.35, 1.0);
  const wingGeom = new THREE.BoxGeometry(1.4, 0.05, 0.45);
  const bodyIM = new THREE.InstancedMesh(bodyGeom, bodyMat, COUNT);
  const wingLIM = new THREE.InstancedMesh(wingGeom, wingMat, COUNT);
  const wingRIM = new THREE.InstancedMesh(wingGeom, wingMat, COUNT);
  bodyIM.frustumCulled = false; wingLIM.frustumCulled = false; wingRIM.frustumCulled = false;
  scene.add(bodyIM); scene.add(wingLIM); scene.add(wingRIM);
  // Each pigeon has its own circle: random center, radius, height,
  // angular speed, phase, and wing-flap phase offset.
  const birds = [];
  for (let i = 0; i < COUNT; i++) {
    birds.push({
      cx: (Math.random() - 0.5) * 600,
      cz: (Math.random() - 0.5) * 600,
      r:  20 + Math.random() * 80,
      y:  35 + Math.random() * 45,
      omega: 0.18 + Math.random() * 0.25, // rad/s
      phase: Math.random() * Math.PI * 2,
      flapPhase: Math.random() * Math.PI * 2,
      flapHz: 6 + Math.random() * 3,
    });
  }
  const dummy = new THREE.Object3D();
  // Update writes new matrices each frame.
  function update(dt, time) {
    for (let i = 0; i < COUNT; i++) {
      const b = birds[i];
      const a = b.phase + time * b.omega;
      const x = b.cx + Math.cos(a) * b.r;
      const z = b.cz + Math.sin(a) * b.r;
      // Tangent direction for the bird's heading
      const yaw = a + Math.PI / 2;
      const flap = Math.sin(b.flapPhase + time * b.flapHz);
      // Body
      dummy.position.set(x, b.y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      bodyIM.setMatrixAt(i, dummy.matrix);
      // Wings flap up/down with the sine curve
      const wingTilt = flap * 0.8;
      // Left wing
      dummy.position.set(x, b.y + 0.05, z);
      dummy.rotation.set(0, yaw, wingTilt);
      dummy.updateMatrix(); wingLIM.setMatrixAt(i, dummy.matrix);
      // Right wing -- mirror
      dummy.rotation.set(0, yaw + Math.PI, wingTilt);
      dummy.updateMatrix(); wingRIM.setMatrixAt(i, dummy.matrix);
    }
    bodyIM.instanceMatrix.needsUpdate = true;
    wingLIM.instanceMatrix.needsUpdate = true;
    wingRIM.instanceMatrix.needsUpdate = true;
  }
  return { update };
}

function makeSubwayEntrance() {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.9 });
  const railMat  = new THREE.MeshStandardMaterial({ color: 0xffd11a, roughness: 0.6, emissive: 0xff8811, emissiveIntensity: 0.3 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
  const signMat  = new THREE.MeshStandardMaterial({ color: 0x223a66, emissive: 0x4477aa, emissiveIntensity: 1.2, roughness: 0.4 });
  const stepMat  = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });

  // Concrete pad rim around the stairwell opening
  const rim = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 4.4), stoneMat);
  rim.position.y = 0.25; g.add(rim);
  // Dark stairwell hole
  const hole = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.6, 3.0), darkMat);
  hole.position.set(0, 0.3, 0.4); g.add(hole);
  // Visible stairs descending into the dark
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 0.6), stepMat);
    step.position.set(0, 0.5 - i * 0.15, -0.6 + i * 0.6);
    g.add(step);
  }
  // Yellow safety railings on three sides
  for (const [px, pz, w, d] of [
    [-2.6, 0, 0.18, 4.4],
    [ 2.6, 0, 0.18, 4.4],
    [0, -2.1, 5.4, 0.18],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), railMat);
    rail.position.set(px, 1.05, pz);
    g.add(rail);
    // Railing posts at corners
    if (w > 1) {
      for (const ox of [-w/2 + 0.3, 0, w/2 - 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18), railMat);
        post.position.set(px + ox, 0.9, pz);
        g.add(post);
      }
    } else {
      for (const oz of [-d/2 + 0.3, 0, d/2 - 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18), railMat);
        post.position.set(px, 0.9, pz + oz);
        g.add(post);
      }
    }
  }
  // 地下鉄 sign panel on a small post above the entrance
  const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), darkMat);
  signPost.position.set(0, 2.1, 2.2); g.add(signPost);
  const signPanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.18), signMat);
  signPanel.position.set(0, 3.5, 2.3); g.add(signPanel);
  // White "M" symbol on the sign (simulating the metro mark)
  const mark = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.4, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 })
  );
  mark.position.set(0, 3.5, 2.42);
  g.add(mark);

  return g;
}

// -------------------- Cars --------------------
const CAR_COLORS = [0xff3344, 0x33aaff, 0xffcc33, 0xffffff, 0x222222, 0x44aa66, 0xaa44ff];

export class Car {
  constructor(x, z, axis /* 'x' or 'z' */, dir /* +1/-1 */) {
    this.dead = false;
    this.axis = axis; this.dir = dir;
    this.speed = 12 + Math.random() * 8;
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const root = new THREE.Group();
    root.position.set(x, 0.6, z);

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.6 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffee99, emissiveIntensity: 1.2 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 3.4), bodyMat);
    body.castShadow = true;
    root.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.6), glassMat);
    cabin.position.set(0, 0.65, -0.1);
    root.add(cabin);
    // Wheels
    for (const sx of [-0.7, 0.7]) {
      for (const sz of [-1.1, 1.1]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8), dark);
        w.rotation.z = Math.PI / 2; w.position.set(sx, -0.35, sz);
        root.add(w);
      }
    }
    // Headlights
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
    hl.position.set(-0.45, 0.0, 1.7); root.add(hl);
    const hr = hl.clone(); hr.position.x = 0.45; root.add(hr);

    if (axis === 'x') root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    else if (dir < 0) root.rotation.y = Math.PI;

    this.root = root;
  }

  update(dt, world, kaijuPos, cityRadius, blockSize) {
    if (this.dead) return;
    const BLOCK = blockSize || 40;
    const root = this.root;
    // Move along the current axis
    if (this.axis === 'x') root.position.x += this.speed * this.dir * dt;
    else                   root.position.z += this.speed * this.dir * dt;

    // Decide whether we're crossing an intersection. Intersections sit at every
    // multiple of BLOCK along the perpendicular axis. We compute distance from
    // the nearest intersection on the axis we're DRIVING along.
    const along = this.axis === 'x' ? root.position.x : root.position.z;
    const phase = ((along + BLOCK / 2) % BLOCK + BLOCK) % BLOCK; // 0..BLOCK
    const distToCenter = Math.abs(phase - BLOCK / 2);
    const stepLen = Math.abs(this.speed * dt);
    if (distToCenter <= stepLen && (this._lastCrossDist || 1e9) > distToCenter) {
      // Just crossed an intersection -- 25% chance to turn 90°.
      if (Math.random() < 0.25) {
        // Snap to the intersection so the turn looks clean
        const snap = Math.round(along / BLOCK) * BLOCK;
        if (this.axis === 'x') root.position.x = snap;
        else                   root.position.z = snap;
        // Switch axis and pick a new direction (left or right turn).
        this.axis = this.axis === 'x' ? 'z' : 'x';
        this.dir = Math.random() < 0.5 ? 1 : -1;
        // Set lane offset so we drive on the correct side of the road
        if (this.axis === 'x') {
          root.position.z = Math.round(root.position.z / BLOCK) * BLOCK + (this.dir > 0 ? -2 : 2);
          root.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          root.position.x = Math.round(root.position.x / BLOCK) * BLOCK + (this.dir > 0 ? 2 : -2);
          root.rotation.y = this.dir > 0 ? 0 : Math.PI;
        }
      }
    }
    this._lastCrossDist = distToCenter;

    // Wrap around city bounds
    const lim = cityRadius + 30;
    if (root.position.x > lim) root.position.x = -lim;
    if (root.position.x < -lim) root.position.x = lim;
    if (root.position.z > lim) root.position.z = -lim;
    if (root.position.z < -lim) root.position.z = lim;

    // Stomped by kaiju
    const dx = kaijuPos.x - this.root.position.x;
    const dz = kaijuPos.z - this.root.position.z;
    if (dx * dx + dz * dz < 5 * 5) {
      this.explode(world);
    }
  }

  explode(world) {
    if (this.dead) return;
    this.dead = true;
    world.spawnExplosion(this.root.position.clone().setY(1), 0.7);
    world.shake(0.15, 0.15);
    this.root.parent && this.root.parent.remove(this.root);
    world.onCarDestroyed?.();
  }
}

export function spawnCars(scene, count, cityRadius = 380, blockSize = 36) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const dir = Math.random() < 0.5 ? 1 : -1;
    // Pick a street line (multiple of blockSize), with random position along it
    const lane = (Math.floor(Math.random() * (cityRadius * 2 / blockSize)) - cityRadius / blockSize) * blockSize;
    const along = (Math.random() - 0.5) * cityRadius * 2;
    const x = axis === 'x' ? along : lane + (dir > 0 ? -2 : 2);
    const z = axis === 'z' ? along : lane + (dir > 0 ? 2 : -2);
    const c = new Car(x, z, axis, dir);
    scene.add(c.root);
    cars.push(c);
  }
  return cars;
}

// -------------------- Civilians --------------------
// Tiny 2u-tall pedestrians who wander the city. They panic and sprint away
// when the kaiju is within 30u, and instantly die if the kaiju is within
// 3u. Each squashed civilian fires world.onCivilianStomped() (small score
// + rage bonus). Pure ambient flavour -- not registered with the spatial
// grid, no collision against buildings (they're tiny enough to clip OK).
const CIVILIAN_TORSO_COLORS = [0xff5577, 0x55aaff, 0x88dd66, 0xffcc44, 0xaa66dd, 0xeebb99, 0xff9933, 0x66ccaa];
const CIVILIAN_LEG_COLORS   = [0x223344, 0x441122, 0x113322, 0x223300, 0x332244];

export class Civilian {
  constructor(x, z) {
    this.dead = false;
    this.speed = 4 + Math.random() * 2;
    this.heading = Math.random() * Math.PI * 2;
    this.headingChangeT = 1 + Math.random() * 2;
    this.walkPhase = Math.random() * Math.PI * 2;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    const torsoColor = CIVILIAN_TORSO_COLORS[Math.floor(Math.random() * CIVILIAN_TORSO_COLORS.length)];
    const legColor   = CIVILIAN_LEG_COLORS[Math.floor(Math.random() * CIVILIAN_LEG_COLORS.length)];
    const skinMat  = new THREE.MeshStandardMaterial({ color: 0xeac199, roughness: 0.85 });
    const torsoMat = new THREE.MeshStandardMaterial({ color: torsoColor, roughness: 0.85 });
    const legMat   = new THREE.MeshStandardMaterial({ color: legColor, roughness: 0.95 });
    const hairMat  = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // Legs (animated via swing in update)
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), legMat);
    legL.position.set(-0.12, 0.35, 0); root.add(legL);
    const legR = legL.clone(); legR.position.x = 0.12; root.add(legR);
    this.legL = legL; this.legR = legR;
    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), torsoMat);
    torso.position.y = 1.05;
    root.add(torso);
    // Arms
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6), torsoMat);
      arm.position.set(sx * 0.32, 1.05, 0);
      root.add(arm);
    }
    // Head + hair
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
    head.position.y = 1.55;
    root.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    hair.position.y = 1.6;
    root.add(hair);

    this.root = root;
  }

  update(dt, world, kaijuPos, cityRadius) {
    if (this.dead) return;
    const myPos = this.root.position;
    const dx = kaijuPos.x - myPos.x;
    const dz = kaijuPos.z - myPos.z;
    const distSq = dx * dx + dz * dz;

    // Squashed
    if (distSq < 9) { this.die(world); return; }

    let speed = this.speed;
    let panicking = false;
    if (distSq < 900) { // 30u panic radius
      const d = Math.sqrt(distSq) || 1;
      this.heading = Math.atan2(-dx / d, -dz / d);
      speed *= 2.6;
      panicking = true;
    } else {
      this.headingChangeT -= dt;
      if (this.headingChangeT <= 0) {
        this.heading += (Math.random() - 0.5) * Math.PI;
        this.headingChangeT = 1.5 + Math.random() * 2;
      }
    }

    myPos.x += Math.sin(this.heading) * speed * dt;
    myPos.z += Math.cos(this.heading) * speed * dt;
    // Wrap to keep them in the city
    const lim = cityRadius;
    if (myPos.x > lim)  myPos.x = -lim;
    if (myPos.x < -lim) myPos.x =  lim;
    if (myPos.z > lim)  myPos.z = -lim;
    if (myPos.z < -lim) myPos.z =  lim;

    this.root.rotation.y = this.heading;
    // Walk cycle (legs swing). Faster when panicking.
    this.walkPhase += dt * (panicking ? 18 : 8);
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.legL.rotation.x =  sw;
    this.legR.rotation.x = -sw;
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    if (this.root.parent) this.root.parent.remove(this.root);
    world.onCivilianStomped?.();
  }
}

export function spawnCivilians(scene, count, cityRadius) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 50 + Math.random() * (cityRadius - 80);
    const c = new Civilian(Math.cos(a) * r, Math.sin(a) * r);
    scene.add(c.root);
    arr.push(c);
  }
  return arr;
}
