import * as THREE from 'three';

// One draw for the whole festival. Limbs animate in the vertex shader;
// only steering and instance transforms run on the CPU, at 30 Hz.
export function crowdGeometry() {
  const parts = [ // width, height, depth, x, y, pivot, limb, colour
    [.13, .50, .16, -.10, .27, .52, -1, [.14, .18, .27]],
    [.13, .50, .16, .10, .27, .52, 1, [.14, .18, .27]],
    [.36, .43, .23, 0, .74, 0, 0, [1, 1, 1]],
    [.12, .42, .14, -.25, .74, .94, 2, [1, 1, 1]],
    [.12, .42, .14, .25, .74, .94, -2, [1, 1, 1]],
    [.22, .23, .21, 0, 1.08, 0, 0, [.79, .57, .40]],
    [.23, .07, .23, 0, 1.22, 0, 0, [.15, .11, .09]],
  ];
  const pos = [], col = [], limb = [];
  for (const [w, h, d, x, y, pivot, id, colour] of parts) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(...colour); limb.push(pivot, id);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 2));
  g.computeVertexNormals();
  return g;
}

export function crowdMaterial(uTime) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  mat.name = 'festival_animated_crowd';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = `uniform float uTime;
      attribute vec2 limb;
      attribute vec3 crowdMotion;
      float swing() {
        float phase = uTime * mix(7.5, 14.0, crowdMotion.y) + crowdMotion.x;
        float side = sign(limb.y);
        return sin(phase) * side * mix(.12, .95, crowdMotion.y) * crowdMotion.z;
      }
      ` + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor = color.r + color.g + color.b > 2.99 ? instanceColor.rgb : color;
        #endif`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float aN = abs(limb.y) > .5 ? swing() : 0.0;
        objectNormal.yz = mat2(cos(aN), sin(aN), -sin(aN), cos(aN)) * objectNormal.yz;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (abs(limb.y) > .5) {
          float a = swing();
          vec2 yz = transformed.yz - vec2(limb.x, 0.0);
          transformed.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * yz + vec2(limb.x, 0.0);
        }
        float beat = sin(uTime * mix(7.5, 28.0, crowdMotion.y) + crowdMotion.x);
        transformed.y += max(0.0, beat) * mix(.12, .045, crowdMotion.y) * crowdMotion.z;`);
  };
  mat.customProgramCacheKey = () => 'festival-articulated-v1';
  return mat;
}

export function animateCrowd(c, { world, buildings, gates, isWater, bounds }) {
  const n = c.alive.length, pose = new THREE.Object3D();
  const motion = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  motion.setUsage(THREE.DynamicDrawUsage);
  c.im.geometry.setAttribute('crowdMotion', motion);
  c.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Moving crowds leave their initial lawns: a static bounding sphere would
  // cull runners. One small draw is cheaper than per-frame bounds recompute.
  c.im.frustumCulled = false;
  c.panic = new Float32Array(n);
  c.heading = new Float32Array(n);
  const sizes = new Float32Array(n), speeds = new Float32Array(n), delay = new Float32Array(n);
  const target = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    c.im.getMatrixAt(i, pose.matrix); pose.matrix.decompose(pose.position, pose.quaternion, pose.scale);
    sizes[i] = pose.scale.x; c.heading[i] = pose.rotation.y;
    speeds[i] = 2.7 + Math.random() * 1.6; delay[i] = .12 + Math.random() * .65;
    motion.setXYZ(i, Math.random() * Math.PI * 2, 0, 1);
  }
  // Static obstacle bins retain live building references, so destroyed fences
  // and tents immediately open escape routes without rebuilding a navmesh.
  const cells = new Map(), cell = 8;
  for (const b of buildings) {
    if (b.isBridge) continue;
    for (let x = Math.floor((b.x - b.w / 2 - .45) / cell); x <= Math.floor((b.x + b.w / 2 + .45) / cell); x++) {
      for (let z = Math.floor((b.z - b.d / 2 - .45) / cell); z <= Math.floor((b.z + b.d / 2 + .45) / cell); z++) {
        const key = `${x}:${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(b);
      }
    }
  }
  const blocked = (x, z) => {
    if (bounds && (x < bounds.minX + 1 || x > bounds.maxX - 1 || z < bounds.minZ + 1 || z > bounds.maxZ - 1)) return true;
    if (isWater?.(x, z)) return true;
    const bs = cells.get(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`);
    return bs?.some(b => !b.destroyed && Math.abs(x - b.x) < b.w / 2 + .3 && Math.abs(z - b.z) < b.d / 2 + .3);
  };
  let acc = 0;
  return {
    update(dt) {
      acc += dt;
      if (acc < 1 / 30) return;
      const step = Math.min(acc, .1); acc = 0;
      const kp = world?.kaijuPos;
      let dirty = false;
      for (let i = 0; i < n; i++) {
        if (!c.alive[i]) {
          if (motion.getZ(i)) { motion.setXYZ(i, motion.getX(i), 0, 0); dirty = true; }
          continue;
        }
        const x = c.pts[i * 2], z = c.pts[i * 2 + 1];
        const dx = kp ? x - kp.x : 1e4, dz = kp ? z - kp.z : 1e4;
        const d = Math.hypot(dx, dz);
        if (d < 62) c.panic[i] = Math.min(12, c.panic[i] + step * 3);
        else c.panic[i] = Math.max(0, c.panic[i] - step);
        if (c.panic[i] <= delay[i]) {
          if (motion.getY(i)) { motion.setY(i, 0); dirty = true; }
          continue;
        }
        if (target[i] < 0 && gates.length) {
          let best = Infinity;
          gates.forEach((g, j) => {
            const safety = kp ? Math.hypot(g.x - kp.x, g.z - kp.z) : 100;
            const score = Math.hypot(g.x - x, g.z - z) + Math.max(0, 70 - safety) * 3;
            if (score < best) { best = score; target[i] = j; }
          });
        }
        const gate = gates[target[i]];
        // Immediate radial flight blends into an exit route once clear.
        const urgency = Math.max(0, 1 - d / 42);
        let gx = gate ? gate.x - x : dx, gz = gate ? gate.z - z : dz;
        const gl = Math.hypot(gx, gz) || 1;
        gx = gx / gl * (1 - urgency) + dx / (d || 1) * urgency * 2;
        gz = gz / gl * (1 - urgency) + dz / (d || 1) * urgency * 2;
        const yaw = Math.atan2(gx, gz) + Math.sin(i * 2.4) * .16;
        const travel = speeds[i] * step;
        let moved = false;
        // Probe around obstacles with a consistent passing side per person.
        const side = i % 2 ? 1 : -1;
        for (const turn of [0, .6 * side, -.6 * side, 1.2 * side, -1.2 * side, 2.1 * side]) {
          const a = yaw + turn, vx = Math.sin(a), vz = Math.cos(a);
          if (blocked(x + vx * .85, z + vz * .85) || blocked(x + vx * travel, z + vz * travel)) continue;
          c.pts[i * 2] = x + vx * travel; c.pts[i * 2 + 1] = z + vz * travel;
          c.heading[i] += Math.atan2(Math.sin(a - c.heading[i]), Math.cos(a - c.heading[i])) * Math.min(1, step * 12);
          moved = true; break;
        }
        pose.position.set(c.pts[i * 2], .04, c.pts[i * 2 + 1]);
        pose.rotation.set(moved ? .14 : 0, c.heading[i], 0); pose.scale.setScalar(sizes[i]);
        pose.updateMatrix(); c.im.setMatrixAt(i, pose.matrix);
        motion.setY(i, moved ? 1 : .2); dirty = true;
        // Reaching an exit retires the person instead of piling bodies on it.
        if (gate && Math.hypot(gate.x - pose.position.x, gate.z - pose.position.z) < 1.8 && d > 26) {
          c.alive[i] = 0; c.im.setMatrixAt(i, pose.matrix.makeScale(0, 0, 0));
        }
      }
      if (dirty) { c.im.instanceMatrix.needsUpdate = true; motion.needsUpdate = true; }
    },
  };
}
