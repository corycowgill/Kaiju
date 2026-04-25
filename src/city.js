import * as THREE from 'three';

// Procedural Tokyo: districts of buildings on a city grid, with streets, lamps, and props.
// Each building exposes hp, max_hp, height and methods damage()/destroy().

const BUILDING_PALETTE = [
  0xb0b8c4, 0x9aa3ad, 0x7d8694, 0xc8cbd1, 0x6f7a87,
  0xa8b0a8, 0xc0b8a8, 0x8090a0, 0xddc8a0, 0x556677,
];
const NEON_COLORS = [0xff3366, 0x33ddff, 0xffaa22, 0xaa66ff, 0x66ff99, 0xffee44];

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let LITE_MODE = false;
export function setBuildingLite(v) { LITE_MODE = !!v; }

export class Building {
  constructor(x, z, w, d, h, opts = {}) {
    this.x = x; this.z = z; this.w = w; this.d = d; this.h = h;
    this.maxHp = Math.max(40, Math.floor(h * 4 + w * d * 0.4));
    this.hp = this.maxHp;
    this.destroyed = false;
    this.debris = [];
    this.windows = [];
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const baseColor = opts.color || pick(BUILDING_PALETTE);
    const mat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.85, metalness: 0.1 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.body = body;
    this.group.add(body);

    // Roof structure (water tank, antenna, neon)
    if (h > 12 && Math.random() < 0.7) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(w, d) * 0.18, Math.min(w, d) * 0.2, 1.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a8270 })
      );
      tank.position.set(rand(-w*0.2, w*0.2), h + 0.75, rand(-d*0.2, d*0.2));
      tank.castShadow = true;
      this.group.add(tank);
    }
    if (Math.random() < 0.4 && h > 16) {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.1, h * 0.25, 4),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      ant.position.set(0, h + h * 0.125, 0);
      this.group.add(ant);
      const blink = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 1.5 })
      );
      blink.position.set(0, h + h * 0.25, 0);
      this.group.add(blink);
    }

    // Neon side sign
    if (Math.random() < 0.5 && h > 10) {
      const neonColor = pick(NEON_COLORS);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.3, h * 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: neonColor, emissive: neonColor, emissiveIntensity: 1.2 })
      );
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = Math.random() < 0.5;
      if (axis) sign.position.set(side * (w / 2 + 0.16), h * 0.6, 0);
      else { sign.position.set(0, h * 0.6, side * (d / 2 + 0.16)); sign.rotation.y = Math.PI / 2; }
      this.group.add(sign);
    }

    // Windows (instanced grid texture using small emissive boxes -- limited count)
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x223344,
      emissive: 0xffeeaa,
      emissiveIntensity: Math.random() < 0.6 ? 0.7 : 0.0,
    });
    const rows = Math.max(2, Math.floor(h / 3));
    const cols = Math.max(2, Math.floor(Math.max(w, d) / 2.5));
    const winGeom = new THREE.BoxGeometry(0.6, 1.2, 0.15);
    const facesToRender = LITE_MODE ? 2 : 4;
    for (let face = 0; face < facesToRender; face++) {
      const inst = new THREE.InstancedMesh(winGeom, winMat, rows * cols);
      let i = 0;
      const dummy = new THREE.Object3D();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dummy.position.set(0, 0, 0);
          const yy = 1.5 + r * (h - 2) / rows;
          const span = (face % 2 === 0 ? w : d) - 1.0;
          const xx = -span / 2 + c * span / (cols - 1 || 1);
          if (face === 0) dummy.position.set(xx, yy, d / 2 + 0.08);
          else if (face === 1) { dummy.position.set(w / 2 + 0.08, yy, xx); dummy.rotation.y = Math.PI / 2; }
          else if (face === 2) dummy.position.set(xx, yy, -d / 2 - 0.08);
          else { dummy.position.set(-w / 2 - 0.08, yy, xx); dummy.rotation.y = Math.PI / 2; }
          dummy.updateMatrix();
          inst.setMatrixAt(i++, dummy.matrix);
          dummy.rotation.set(0,0,0);
        }
      }
      this.group.add(inst);
      this.windows.push(inst);
    }

    // user-data backlink for hit detection
    body.userData.building = this;
  }

  damage(amount, hitPoint, world) {
    if (this.destroyed) return 0;
    this.hp -= amount;
    // shake a little
    this.body.material.color.offsetHSL(0, 0, -0.005);
    if (hitPoint && world) world.spawnSparks(hitPoint, 6);
    if (this.hp <= 0) {
      this.collapse(world);
      return this.maxHp; // score
    }
    return amount;
  }

  collapse(world) {
    if (this.destroyed) return;
    this.destroyed = true;
    const pos = this.group.position.clone();
    pos.y += this.h / 2;

    // explode body into chunks
    const chunks = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < chunks; i++) {
      const cw = this.w * rand(0.25, 0.55);
      const ch = this.h * rand(0.15, 0.35);
      const cd = this.d * rand(0.25, 0.55);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(cw, ch, cd),
        new THREE.MeshStandardMaterial({ color: this.body.material.color, roughness: 0.95 })
      );
      m.position.copy(this.group.position);
      m.position.y = this.h * 0.4 + rand(-2, 2);
      m.position.x += rand(-this.w / 3, this.w / 3);
      m.position.z += rand(-this.d / 3, this.d / 3);
      m.castShadow = true;
      m.userData.vel = new THREE.Vector3(rand(-8, 8), rand(8, 18), rand(-8, 8));
      m.userData.angVel = new THREE.Vector3(rand(-3,3), rand(-3,3), rand(-3,3));
      m.userData.life = 4.0;
      world.scene.add(m);
      world.debris.push(m);
    }

    // fireball / smoke
    if (world) {
      world.spawnExplosion(pos, 1.4);
      world.shake(0.6, 0.5);
      world.onBuildingDestroyed?.(this);
    }

    // remove building from scene
    this.group.parent && this.group.parent.remove(this.group);
    // dispose materials/geometries lazily
  }
}

export function buildCity(scene, world, opts = {}) {
  const buildings = [];
  const lite = !!opts.lite;
  setBuildingLite(lite);
  const CITY_RADIUS = lite ? 280 : 380;
  const BLOCK = lite ? 44 : 36; // block size including streets
  const STREET = 8;

  // Ground (asphalt)
  const groundGeom = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Street grid lines (subtle)
  const streetMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 1.0 });
  for (let i = -CITY_RADIUS; i <= CITY_RADIUS; i += BLOCK) {
    const sx = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, STREET), streetMat);
    sx.rotation.x = -Math.PI / 2; sx.position.set(0, 0.05, i);
    sx.receiveShadow = true; scene.add(sx);
    const sz = new THREE.Mesh(new THREE.PlaneGeometry(STREET, CITY_RADIUS * 2), streetMat);
    sz.rotation.x = -Math.PI / 2; sz.position.set(i, 0.05, 0);
    sz.receiveShadow = true; scene.add(sz);
  }

  // Buildings on each block (skipping center for spawn)
  for (let bx = -CITY_RADIUS + BLOCK / 2; bx <= CITY_RADIUS - BLOCK / 2; bx += BLOCK) {
    for (let bz = -CITY_RADIUS + BLOCK / 2; bz <= CITY_RADIUS - BLOCK / 2; bz += BLOCK) {
      // leave central plaza open
      if (Math.abs(bx) < BLOCK && Math.abs(bz) < BLOCK) continue;
      const distFromCenter = Math.sqrt(bx*bx + bz*bz);

      // skip some blocks entirely on lite mode
      if (lite && Math.random() < 0.35) continue;
      // 1-2 buildings per block
      const n = lite ? 1 : (Math.random() < 0.55 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const w = rand(8, BLOCK - STREET - 4) * (n === 1 ? 1.0 : 0.5);
        const d = rand(8, BLOCK - STREET - 4) * (n === 1 ? 1.0 : 0.5);
        const tallness = THREE.MathUtils.clamp(1.0 - distFromCenter / (CITY_RADIUS * 1.2), 0.2, 1.0);
        const h = rand(8, 60) * (0.4 + tallness);
        const offX = n === 2 ? (i === 0 ? -BLOCK/4 : BLOCK/4) : rand(-2, 2);
        const offZ = rand(-2, 2);
        const b = new Building(bx + offX, bz + offZ, w, d, h);
        scene.add(b.group);
        buildings.push(b);
      }
    }
  }

  // Add some landmark buildings
  const landmarks = [
    { x: 80, z: 60, w: 18, d: 18, h: 110, color: 0xddccaa }, // skyscraper A
    { x: -90, z: -40, w: 22, d: 22, h: 130, color: 0x99aabb }, // skyscraper B
    { x: 140, z: -120, w: 14, d: 14, h: 150, color: 0xff8866 }, // tower (Tokyo Tower-ish)
    { x: -160, z: 140, w: 30, d: 16, h: 80, color: 0xc0d0e0 },
  ];
  for (const lm of landmarks) {
    const b = new Building(lm.x, lm.z, lm.w, lm.d, lm.h, { color: lm.color });
    scene.add(b.group);
    buildings.push(b);
  }

  // Lamp posts at intersections (sparse)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffeeaa, emissiveIntensity: 0.9 });
  for (let i = -CITY_RADIUS + BLOCK; i < CITY_RADIUS; i += BLOCK * 2) {
    for (let j = -CITY_RADIUS + BLOCK; j < CITY_RADIUS; j += BLOCK * 2) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 5, 6), lampMat);
      post.position.set(i + BLOCK/2 - 1, 2.5, j + BLOCK/2 - 1);
      scene.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), bulbMat);
      bulb.position.set(post.position.x, 5.0, post.position.z);
      scene.add(bulb);
    }
  }

  return buildings;
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

  update(dt, world, kaijuPos, cityRadius) {
    if (this.dead) return;
    if (this.axis === 'x') this.root.position.x += this.speed * this.dir * dt;
    else this.root.position.z += this.speed * this.dir * dt;

    // Wrap around city bounds
    const lim = cityRadius + 30;
    if (this.root.position.x > lim) this.root.position.x = -lim;
    if (this.root.position.x < -lim) this.root.position.x = lim;
    if (this.root.position.z > lim) this.root.position.z = -lim;
    if (this.root.position.z < -lim) this.root.position.z = lim;

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
