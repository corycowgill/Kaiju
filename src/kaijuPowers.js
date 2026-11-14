import * as THREE from 'three';
import { Effect } from './effects.js';
import { QUALITY_PROFILE } from './quality.js';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Distances are in game world units. The particle shapes and trajectories
// identify a power even when the camera or the lighting hides its color.
export const KAIJU_POWERS = Object.freeze({
  cindervault: { range: 205, width: 8, dash: 26, impact: 34, ult: 110, matter: 'basalt', height: 37, spread: 1.3, strands: 4, twist: 1.6 },
  brineveil: { range: 265, width: 6, dash: 38, impact: 22, ult: 124, matter: 'bubble', height: 19, spread: 1.0, strands: 3, twist: 3.1 },
  rimehorn: { range: 295, width: 5, dash: 27, impact: 34, ult: 140, matter: 'ice', height: 18, spread: 0.8, strands: 3, twist: 0.1 },
  vesperax: { range: 230, width: 7, dash: 46, impact: 20, ult: 100, matter: 'prism', height: 24, spread: 1.8, strands: 2, twist: 0.6 },
  thornwake: { range: 220, width: 8, dash: 29, impact: 29, ult: 136, matter: 'root', height: 46, spread: 1.3, strands: 6, twist: 0.9 },
  ferrumaw: { range: 320, width: 4, dash: 34, impact: 25, ult: 120, matter: 'metal', height: 23, spread: 0.7, strands: 4, twist: 4.0 },
});

const SHAPES = {
  basalt: () => new THREE.DodecahedronGeometry(1, 0),
  bubble: () => new THREE.SphereGeometry(1, 8, 6),
  ice: () => new THREE.OctahedronGeometry(1),
  prism: () => new THREE.ConeGeometry(1, 2, 3),
  root: () => new THREE.ConeGeometry(1, 2, 5),
  metal: () => new THREE.BoxGeometry(1.6, 1.6, 1.6),
};

function matterField(group, profile, cfg, move, extent) {
  const shape = profile.matter;
  const bubble = shape === 'bubble';
  const bright = new THREE.Color(cfg.beam.glow);
  const dark = new THREE.Color(cfg.color).lerp(bright, .22);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: cfg.beam.color, emissiveIntensity: .35,
    roughness: shape === 'metal' || shape === 'ice' ? .28 : .75,
    metalness: shape === 'metal' ? .85 : .08, wireframe: bubble,
    transparent: true, depthWrite: false,
  });
  const n = Math.max(6, Math.round((move === 'ult' ? 66 : 30) * QUALITY_PROFILE.particleMul));
  const mesh = new THREE.InstancedMesh(SHAPES[shape](), mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  group.add(mesh);
  const colors = new THREE.Color(), node = new THREE.Object3D();
  for (let i = 0; i < n; i++) mesh.setColorAt(i, colors.copy(dark).lerp(bright, (i % 4) / 3));
  const radial = move === 'roar' || move === 'ult' || move === 'impact';
  const lifeScale = move === 'ult' ? 1.7 : move === 'impact' ? .55 : 1;
  return t => {
    mat.opacity = (bubble ? .72 : .94) * Math.min(1, (1 - t) * 3.7);
    for (let i = 0; i < n; i++) {
      const u = (i + 1) / n;
      const delay = ((i * 13) % n) / n * .22;
      const p = Math.max(0, (t - delay) / (1 - delay));
      const angle = i * GOLDEN_ANGLE;
      const a = angle + p * (shape === 'metal' ? 5 : bubble ? -2.2 : .35);
      const peak = Math.sin(Math.PI * p);
      if (radial) {
        const progress = bubble ? 1 - p : shape === 'ice' || shape === 'root' ? Math.min(1, p * 6) : p;
        const radius = extent * (.2 + .75 * Math.sqrt(u)) * progress;
        const lift = shape === 'root' || shape === 'ice' ? Math.min(1, p * 5) : peak;
        node.position.set(Math.cos(a) * radius, .8 + lift * profile.height * (.2 + (i % 7) * .12) * lifeScale, Math.sin(a) * radius);
      } else {
        const radius = profile.spread * (.7 + (i % 5) + p * 2);
        node.position.set(Math.cos(a) * radius, Math.sin(a) * radius, Math.min(1, p * 3.5) * u * extent);
      }
      node.rotation.set(i + p * 2.6, a, shape === 'root' ? .38 * Math.sin(i) : i * .56 + 4 * p);
      if (shape === 'root' || shape === 'ice') node.rotation.x = radial ? .26 * Math.cos(i) : Math.PI * .5;
      const size = (.65 + (i % 5) * .31) * lifeScale * Math.min(1, p * 16) * Math.min(1, (1 - p) * 4);
      const ht = shape === 'root' ? 5.2 : shape === 'ice' ? 3 : shape === 'prism' ? 2.2 : 1;
      node.scale.set(size, size * ht, size);
      node.updateMatrix();
      mesh.setMatrixAt(i, node.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function energyTraces(group, profile, color, glow, move, extent) {
  const radial = move === 'roar' || move === 'ult' || move === 'impact';
  const implosion = radial && profile.matter === 'bubble';
  const traces = [];
  for (let i = 0; i < profile.strands; i++) {
    const phase = i * TAU / profile.strands;
    const points = [];
    for (let j = 0; j <= 30; j++) {
      const u = j / 30;
      const angle = phase + u * (profile.twist * TAU + (radial ? Math.PI : 0));
      if (radial) {
        const out = extent * (.14 + u * .86);
        const lift = profile.matter === 'ice' ? (j % 3) * 1.4 : Math.sin(u * Math.PI) * profile.height * .24;
        points.push(new THREE.Vector3(Math.cos(angle) * out, 1 + lift, Math.sin(angle) * out));
      } else {
        const r = Math.sin(u * Math.PI) * profile.spread * (move === 'charge' ? 8 : 2.8);
        const fan = profile.matter === 'prism' ? (i ? -1 : 1) * Math.sin(u * Math.PI) * r : Math.cos(angle) * r;
        points.push(new THREE.Vector3(fan, Math.sin(angle) * r, u * extent));
      }
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, radial ? .3 : i ? .26 : .58, 4, false);
    tube.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 ? color : glow, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true, toneMapped: false,
    });
    const mesh = new THREE.Mesh(tube, mat);
    group.add(mesh);
    traces.push({ tube, mat, mesh });
  }
  return t => {
    const reveal = Math.min(1, t * (radial ? 4 : 10));
    for (const [i, { tube, mat, mesh }] of traces.entries()) {
      if (radial) {
        mesh.rotation.y = (implosion ? -1 : 1) * t * .45;
        const r = implosion ? 1.05 - .88 * t : .24 + .76 * Math.min(1, t * 1.8);
        mesh.scale.set(r, 1, r);
      }
      tube.setDrawRange(0, Math.floor(reveal * 30) * 24);
      mat.opacity = (i ? .65 : .96) * Math.min(1, (1 - t) * 2.1);
    }
  };
}

export function spawnKaijuPower(world, cfg, move, position, { direction, extent } = {}) {
  const profile = KAIJU_POWERS[cfg?.variant];
  if (!profile || !world.scene || !world.effects || !(extent > .01)) return false;
  const color = (move === 'ult' || move === 'impact' ? cfg.beam : cfg[move]).color;
  const group = new THREE.Group();
  group.name = `${cfg.variant}_${move}`;
  group.position.copy(position);
  if (direction) group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
  const trace = energyTraces(group, profile, color, cfg.beam.glow, move, extent);
  const matter = matterField(group, profile, cfg, move, extent);
  const life = move === 'ult' ? 2.2 : move === 'roar' ? 1.25 : move === 'impact' ? .85 : .65;
  const frame = t => { trace(t); matter(t); };
  frame(0);
  world.scene.add(group);
  world.effects.push(new Effect(group, life, (_, t) => {
    if (t < 1) frame(t);
    else group.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      object.material?.dispose();
    });
  }));
  return true;
}
