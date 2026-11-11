import * as THREE from 'three';
import { disposeInstance, markShared } from './assetCache.js';

// Pickups dropped from destroyed buildings / kills.
// types: 'hp' (red cross), 'rage' (blue orb), 'score' (gold star)

const TYPE_INFO = {
  hp:    { color: 0xff3344, glow: 0xff6688, name: 'HEAL +25' },
  rage:  { color: 0x44aaff, glow: 0x99ccff, name: 'RAGE +30' },
  score: { color: 0xffcc44, glow: 0xffeeaa, name: 'BONUS +500' },
};

// One set of geometry and one set of materials per type, shared by every
// pickup. Each `new Pickup` used to build 4-5 geometries and 3 materials of
// its own: an ultimate that levelled 200 buildings dropped ~130 at once, i.e.
// ~600 geometry uploads and ~390 program lookups in one frame.
const _G = {
  hp:    [new THREE.BoxGeometry(2.0, 0.6, 0.6), new THREE.BoxGeometry(0.6, 2.0, 0.6)],
  rage:  [new THREE.SphereGeometry(0.9, 14, 14)],
  score: [new THREE.BoxGeometry(1.8, 0.4, 0.4), new THREE.BoxGeometry(0.4, 1.8, 0.4), new THREE.BoxGeometry(0.4, 0.4, 1.8)],
  halo:  new THREE.SphereGeometry(1.6, 12, 12),
  beam:  new THREE.CylinderGeometry(0.2, 0.6, 6, 8, 1, true),
};
markShared(..._G.hp, ..._G.rage, ..._G.score, _G.halo, _G.beam);
const _M = {};
function _mats(type) {
  if (_M[type]) return _M[type];
  const info = TYPE_INFO[type];
  return (_M[type] = {
    // Emissive kept below the bloom threshold's blow-out range: at 0.9 the
    // blue rage orb (plus halo + beam stacking additively in bloom) read as
    // a white-blue flare next to the kaiju when wave-end kills dropped several.
    body: new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.2 }),
    halo: new THREE.MeshBasicMaterial({ color: info.glow, transparent: true, opacity: 0.14, depthWrite: false }),
    beam: new THREE.MeshBasicMaterial({ color: info.glow, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  });
}

export class Pickup {
  constructor(type, x, y, z) {
    this.type = type;
    this.dead = false;
    this.life = 14.0; // expires after 14 seconds
    this.bobPhase = Math.random() * Math.PI * 2;

    const M = _mats(type);
    const root = new THREE.Group();
    root.position.set(x, y, z);

    // hp: red cross; rage: orb; score: 4-point star (stretched cubes)
    const parts = _G[type];
    let body;
    if (parts.length === 1) body = new THREE.Mesh(parts[0], M.body);
    else { body = new THREE.Group(); for (const g of parts) body.add(new THREE.Mesh(g, M.body)); }
    root.add(body);
    this.body = body;

    // Glow halo (sprite-like billboard)
    const halo = new THREE.Mesh(_G.halo, M.halo);
    root.add(halo);
    this.halo = halo;

    // Beam of light connecting to ground
    const beam = new THREE.Mesh(_G.beam, M.beam);
    beam.position.y = -3;
    root.add(beam);

    this.root = root;
  }

  update(dt, world, kaijuPos) {
    if (this.dead) return false;
    this.life -= dt;
    if (this.life <= 0) { this.destroy(); return false; }

    this.bobPhase += dt * 2.5;
    this.body.position.y = Math.sin(this.bobPhase) * 0.3;
    this.body.rotation.y += dt * 1.8;
    // Pulse halo
    const p = 1.0 + Math.sin(this.bobPhase * 2) * 0.15;
    this.halo.scale.setScalar(p);

    // Magnet toward kaiju when close
    const dx = kaijuPos.x - this.root.position.x;
    const dz = kaijuPos.z - this.root.position.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < 25 * 25) {
      const f = 0.06;
      this.root.position.x += dx * f;
      this.root.position.z += dz * f;
    }

    // Pickup
    if (dist2 < 8 * 8) {
      world.onPickup?.(this.type, this.root.position.clone());
      this.destroy();
      return true;
    }
    return false;
  }

  destroy() {
    this.dead = true;
    this.root.parent && this.root.parent.remove(this.root);
    disposeInstance(this.root);
  }
}

// Roll a random pickup type. Building drops favor HP/Rage; enemy drops favor Rage/Score.
export function rollDrop(source = 'building') {
  const r = Math.random();
  if (source === 'building') {
    if (r < 0.35) return null;       // 65% chance to drop
    if (r < 0.55) return 'hp';
    if (r < 0.85) return 'rage';
    return 'score';
  } else {
    if (r < 0.55) return null;       // 45% chance to drop
    if (r < 0.65) return 'hp';
    if (r < 0.85) return 'rage';
    return 'score';
  }
}
