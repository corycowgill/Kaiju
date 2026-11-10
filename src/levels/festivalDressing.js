import * as THREE from 'three';

// Shared world-space wear on the lawns: stage-front dust, irregular worn
// patches and maintenance stripes stay continuous across triangulated fields.
export function dressFestival(scene, F, buildings, trampled, animators, lite) {
  // Fabric pennants along the concessions and entrance gateways. Two draws,
  // no lights or shadow passes; attach each to a live destructible building.
  const flags = [];
  for (const it of F.items) {
    if (!['gate', 'food', 'bar', 'merch', 'water'].includes(it.kind)) continue;
    const n = Math.max(3, Math.min(lite ? 6 : 12, Math.floor(it.w / .8)));
    for (let i = 0; i < n; i++) {
      const u = ((i + .5) / n - .5) * it.w;
      flags.push({ x: it.x + Math.cos(it.rot) * u, z: it.z - Math.sin(it.rot) * u,
        y: Math.max(.9, it.h * .85) - Math.sin((i + .5) / n * Math.PI) * .22,
        yaw: it.rot, phase: i * 1.7, it });
    }
  }
  if (!flags.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.22, 0, 0, .22, 0, 0, 0, -.48, 0], 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff });
  const im = new THREE.InstancedMesh(g, mat, flags.length);
  im.name = 'festival_wind_pennants'; im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const o = new THREE.Object3D(), colour = new THREE.Color();
  const palette = [0xff7247, 0xf1bf42, 0x37beb4, 0xca4a84, 0x6d65bc];
  // Find the closest festival piece at build time; its destruction drops
  // the fabric too, avoiding floating decoration over flattened stalls.
  const pieces = buildings.filter(b => b.fest);
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]; let best = Infinity;
    for (const b of pieces) {
      const d = Math.hypot(b.x - f.x, b.z - f.z);
      if (d < best) { best = d; f.owner = b; }
    }
    im.setColorAt(i, colour.setHex(palette[i % palette.length]));
  }
  scene.add(im);
  const animate = { update(dt, time) {
    flags.forEach((f, i) => {
      o.position.set(f.x, f.y, f.z);
      o.rotation.set(Math.sin(time * 3.2 + f.phase) * .24, f.yaw, Math.sin(time * 2.1 + f.phase) * .08);
      o.scale.setScalar(f.owner?.destroyed ? 0 : 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  } };
  animate.update(0, 0); animators.push(animate);
}

