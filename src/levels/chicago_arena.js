// The ring in Grant Park (Chicago, wrestling mode): mat, corner posts, three
// ropes a side, and the ringside crowd. Two halves:
//   buildArena()   static scene content, called from buildChicago when the
//                  level is built for the wrestling mode (so the smoke test's
//                  draw / triangle / program budgets cover it);
//   createArena()  the runtime side composed by src/wrestling/index.js: rope
//                  rebounds and snaps, crowd reactions, floodlights.
// OWNER: arena + crowd engineer. INTEGRATOR STARTING POINT: flat-shaded
// placeholders (3 draws, unlit materials, no new lit program) and a crowd on
// the festival's instanced people; the ring's place and size are the part
// other modules already read (world.arena / W.arena.info).
import * as THREE from 'three';
import { festPersonGeom, festCrowdMaterial, FEST_SHIRTS } from './chicago_fest.js';

/** Ring layout (world units). The ring is the axis-aligned square of half-size
 *  `half` around (cx, cz): Hutchinson Field, between Columbus Dr and Lake
 *  Shore Dr. ropeY are the three cable heights, clearHalf the half-size of the
 *  square kept free of festival stalls (ring + ringside crowd). */
export const ARENA = Object.freeze({ cx: 4, cz: 62, half: 42, postH: 24, ropeY: Object.freeze([8, 13, 18]), clearHalf: 60, crowdIn: 47, crowdOut: 58 });

/** Festival layout items the ring displaces (gates stay: the fence leaves their gaps). */
export function arenaDisplaces(it) {
  if (it.kind === 'gate') return false;
  const r = Math.hypot(it.w || 0, it.d || 0) / 2;
  return Math.abs(it.x - ARENA.cx) < ARENA.clearHalf + r && Math.abs(it.z - ARENA.cz) < ARENA.clearHalf + r;
}

/** The square (ring + ringside) the park's trees keep out of: [[x, z], ...]. */
export function arenaNoTree() {
  const A = ARENA, h = A.clearHalf;
  return [[A.cx - h, A.cz - h], [A.cx + h, A.cz - h], [A.cx + h, A.cz + h], [A.cx - h, A.cz + h]];
}

function _box(pos, col, x, y, z, w, h, d, c) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); col.push(c[0], c[1], c[2]); }
  g.dispose();
}
function _geom(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Build the ring. o: { lite, glb, animators, grid, inside(x, z) (optional:
 * true where the crowd may stand, e.g. inside the festival fence) }.
 * Sets world.arena and returns it.
 */
export function buildArena(scene, world, o) {
  const A = ARENA, H = A.half;
  // ---- mat: a dark apron with a pale border and centre ring, just over the lawn ----
  {
    const pos = [], col = [];
    _box(pos, col, A.cx, 0.06, A.cz, H * 2, 0.04, H * 2, [0.10, 0.13, 0.24]);
    const edge = [0.85, 0.82, 0.70];
    for (const s of [-1, 1]) {
      _box(pos, col, A.cx, 0.09, A.cz + s * (H - 1), H * 2, 0.04, 2, edge);
      _box(pos, col, A.cx + s * (H - 1), 0.09, A.cz, 2, 0.04, H * 2 - 4, edge);
    }
    _box(pos, col, A.cx, 0.09, A.cz, 16, 0.04, 16, [0.62, 0.12, 0.16]);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const m = new THREE.Mesh(_geom(pos, col), mat);
    m.matrixAutoUpdate = false; m.renderOrder = 1;
    scene.add(m);
  }
  // ---- posts + ropes: one unlit mesh; the ropes' colours sit above 1.0 so they bloom ----
  const posts = [];
  {
    const pos = [], col = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = A.cx + sx * H, z = A.cz + sz * H;
      posts.push({ x, z });
      _box(pos, col, x, A.postH / 2, z, 3.2, A.postH, 3.2, [0.16, 0.17, 0.2]);
      _box(pos, col, x, A.postH + 1.2, z, 5, 2.4, 5, [1.5, 1.4, 1.1]); // floodlight head
    }
    const rope = [[1.5, 0.3, 0.25], [1.25, 1.25, 1.25], [0.3, 0.55, 1.5]];
    A.ropeY.forEach((y, i) => {
      for (const s of [-1, 1]) {
        _box(pos, col, A.cx, y, A.cz + s * H, H * 2, 0.7, 0.7, rope[i]);
        _box(pos, col, A.cx + s * H, y, A.cz, 0.7, 0.7, H * 2, rope[i]);
      }
    });
    const m = new THREE.Mesh(_geom(pos, col), new THREE.MeshBasicMaterial({ vertexColors: true }));
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
  // ---- ringside crowd: a band outside the ropes, everyone facing the ring ----
  let crowd = null;
  {
    const want = !o.glb ? 160 : o.lite ? 500 : 1400;
    const pts = [], yaw = [];
    const blocked = (x, z) => {
      let hit = false;
      if (o.grid) o.grid.forEachNear(x, z, 34, (b) => { if (!b.destroyed && Math.abs(x - b.x) < b.w / 2 + 0.6 && Math.abs(z - b.z) < b.d / 2 + 0.6) hit = true; });
      return hit;
    };
    for (let tries = 0; pts.length / 2 < want && tries < want * 14; tries++) {
      const x = A.cx + (Math.random() * 2 - 1) * A.crowdOut, z = A.cz + (Math.random() * 2 - 1) * A.crowdOut;
      if (Math.max(Math.abs(x - A.cx), Math.abs(z - A.cz)) < A.crowdIn) continue;
      if ((o.inside && !o.inside(x, z)) || blocked(x, z)) continue;
      pts.push(x, z); yaw.push(Math.atan2(A.cx - x, A.cz - z));
    }
    const count = pts.length / 2;
    if (count) {
      const uTime = { value: 0 };
      const im = new THREE.InstancedMesh(festPersonGeom(), festCrowdMaterial(uTime), count);
      const d = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        d.position.set(pts[i * 2], 0.04, pts[i * 2 + 1]);
        d.rotation.set(0, yaw[i] + (Math.random() - 0.5) * 0.5, 0);
        d.scale.setScalar(0.9 + Math.random() * 0.25);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, c.setHex(FEST_SHIRTS[Math.floor(Math.random() * FEST_SHIRTS.length)]));
      }
      im.computeBoundingSphere();
      im.castShadow = false; im.receiveShadow = false;
      scene.add(im);
      crowd = { im, pts, alive: new Uint8Array(count).fill(1), uTime };
      if (o.animators) o.animators.push({ update(dt, time) { uTime.value = time; } });
      // Stomped / slammed spectators flatten like the festival's (game.js damageInRadius -> world.crowdHit)
      const prev = world.crowdHit;
      const flat = new THREE.Matrix4(), squash = new THREE.Vector3(1.6, 0.04, 1.6);
      world.crowdHit = (x, z, r2) => {
        let n = prev ? prev(x, z, r2) : 0, dirty = false;
        for (let i = 0; i < count; i++) {
          if (!crowd.alive[i]) continue;
          const dx = pts[i * 2] - x, dz = pts[i * 2 + 1] - z;
          if (dx * dx + dz * dz > r2) continue;
          crowd.alive[i] = 0; n++; dirty = true;
          im.getMatrixAt(i, flat);
          flat.scale(squash);
          im.setMatrixAt(i, flat);
        }
        if (dirty) im.instanceMatrix.needsUpdate = true;
        return n;
      };
    }
  }
  world.arena = { cx: A.cx, cz: A.cz, half: H, postH: A.postH, ropeY: A.ropeY, clearHalf: A.clearHalf, posts, crowd };
  return world.arena;
}

/** Runtime side. @returns {{ start, update, updateIdle, dispose, info }} */
export function createArena(ctx, W) {
  return {
    /** world.arena for the level in play: { cx, cz, half, postH, ropeY, clearHalf, posts: [{x, z}], crowd } (null outside the wrestling build). */
    get info() { return ctx.world.arena || null; },
    start() {},
    update(dt, dtReal) {},
    updateIdle(dtReal) {},
    dispose() {},
  };
}
