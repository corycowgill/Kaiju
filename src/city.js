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
  const dummy = new THREE.Object3D();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    im.setColorAt(i, b.bodyColor);
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
function buildGlobalWindows(scene) {
  if (_windowQueue.length === 0) return;
  const lits = _windowQueue.filter(w => w.lit);
  const dims = _windowQueue.filter(w => !w.lit);
  const geom = new THREE.BoxGeometry(0.6, 1.2, 0.15);
  const litMat = new THREE.MeshStandardMaterial({
    color: 0x223344, emissive: 0xffeeaa, emissiveIntensity: 0.85, roughness: 0.5,
  });
  const dimMat = new THREE.MeshStandardMaterial({
    color: 0x1a2230, roughness: 0.7,
  });
  const litIM = new THREE.InstancedMesh(geom, litMat, lits.length || 1);
  const dimIM = new THREE.InstancedMesh(geom, dimMat, dims.length || 1);
  // The IMs span the whole city -- frustum-cull as a single object would
  // miss most of them, so just always render. There are only 2 of them.
  litIM.frustumCulled = false;
  dimIM.frustumCulled = false;
  litIM.matrixAutoUpdate = false; litIM.updateMatrix();
  dimIM.matrixAutoUpdate = false; dimIM.updateMatrix();
  lits.forEach((w, i) => {
    litIM.setMatrixAt(i, w.matrix);
    w.b.windowEntries.push({ im: litIM, idx: i });
  });
  dims.forEach((w, i) => {
    dimIM.setMatrixAt(i, w.matrix);
    w.b.windowEntries.push({ im: dimIM, idx: i });
  });
  litIM.instanceMatrix.needsUpdate = true;
  dimIM.instanceMatrix.needsUpdate = true;
  if (lits.length) scene.add(litIM);
  if (dims.length) scene.add(dimIM);
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

    // Side neon sign(s) -- usually 0 or 1, rare 2
    const sideSignCount = h > 12 ? (Math.random() < 0.45 ? 1 : 0) : 0;
    for (let i = 0; i < sideSignCount; i++) {
      const c = pick(NEON_COLORS);
      const sw = w * (0.25 + Math.random() * 0.2);
      const sh = h * (0.25 + Math.random() * 0.25);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, 0.45),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, roughness: 0.4 })
      );
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = Math.random() < 0.5;
      const yPos = h * (0.35 + Math.random() * 0.4);
      if (axis) sign.position.set(side * (w / 2 + 0.25), yPos, rand(-d * 0.2, d * 0.2));
      else { sign.position.set(rand(-w * 0.2, w * 0.2), yPos, side * (d / 2 + 0.25)); sign.rotation.y = Math.PI / 2; }
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
    if (h >= 6) {
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

    // user-data backlink for hit detection
    body.userData.building = this;
  }

  damage(amount, hitPoint, world) {
    if (this.destroyed) return 0;
    const before = this.hp;
    this.hp -= amount;
    // Tint darker as it weakens -- write back to the global InstancedMesh
    this.bodyColor.offsetHSL(0, 0, -0.005);
    if (this._bodyIM && this._bodyIndex >= 0 && this._bodyIM.instanceColor) {
      this._bodyIM.setColorAt(this._bodyIndex, this.bodyColor);
      this._bodyIM.instanceColor.needsUpdate = true;
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
    // Hide our slot in the global body InstancedMesh
    if (this._bodyIM && this._bodyIndex >= 0) {
      this._bodyIM.setMatrixAt(this._bodyIndex, _zeroMatrix);
      this._bodyIM.instanceMatrix.needsUpdate = true;
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

  // Ground (asphalt)
  const groundGeom = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false; ground.updateMatrix();
  scene.add(ground);

  // Street grid (asphalt) + glowing center lines (continuous, very cheap).
  const streetMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.92 });
  const lineMat   = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffd14a, emissiveIntensity: 0.45, roughness: 0.6 });
  const curbMat   = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 1.0 });
  for (let i = -CITY_RADIUS; i <= CITY_RADIUS; i += BLOCK) {
    const sx = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, STREET), streetMat);
    sx.rotation.x = -Math.PI / 2; sx.position.set(0, 0.05, i);
    sx.receiveShadow = true; sx.matrixAutoUpdate = false; sx.updateMatrix(); scene.add(sx);
    const sz = new THREE.Mesh(new THREE.PlaneGeometry(STREET, CITY_RADIUS * 2), streetMat);
    sz.rotation.x = -Math.PI / 2; sz.position.set(i, 0.05, 0);
    sz.receiveShadow = true; sz.matrixAutoUpdate = false; sz.updateMatrix(); scene.add(sz);

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

  // Add some landmark buildings
  const landmarks = [
    { x: 80, z: 60, w: 18, d: 18, h: 110, color: 0xddccaa }, // skyscraper A
    { x: -90, z: -40, w: 22, d: 22, h: 130, color: 0x99aabb }, // skyscraper B
    { x: 140, z: -120, w: 14, d: 14, h: 150, color: 0xff8866 }, // tower (Tokyo Tower-ish)
    { x: -160, z: 140, w: 30, d: 16, h: 80, color: 0xc0d0e0 },
  ];
  for (const lm of landmarks) {
    const b = new Building(lm.x, lm.z, lm.w, lm.d, lm.h, { color: lm.color });
    b.group.matrixAutoUpdate = false; b.group.updateMatrix();
    scene.add(b.group);
    buildings.push(b);
    grid.add(b);
  }

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

  return { buildings, grid, bodiesIM };
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
