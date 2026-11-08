// Moving traffic and flying debris drawn as instanced batches: one draw per
// (geometry, material) pair instead of one per part (~135 car draws -> ~20 in
// the Loop; an ult's ~140 debris chunks -> ~12). Each Car keeps its own scene graph (position, LOD swaps, explode,
// gameplay reads), but its part meshes are hidden and their world matrices
// are copied into shared InstancedMeshes every frame, culled per part with
// the same frustum test three applies to a Mesh, so the same parts are
// drawn with the same transforms and materials.
// Transparent and skinned parts stay individual meshes (sort order;
// per-mesh skeletons), and so does any part hidden by other code. Works for
// any list of { root, dead } movers (cars; the phone-LOW box civilians).
import * as THREE from 'three';

const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _batches = new Map(); // `${geometry.id}:${material.id}` -> { im, n }

function _batchFor(part, root) {
  const key = part.geometry.id + ':' + part.material.id;
  let b = _batches.get(key);
  if (!b || b.n >= b.im.instanceMatrix.count) {
    const cap = b ? b.im.instanceMatrix.count * 2 : 32;
    const im = new THREE.InstancedMesh(part.geometry, part.material, cap);
    im.frustumCulled = false; // culled per part below
    im.matrixAutoUpdate = false;
    im.castShadow = part.castShadow;
    im.receiveShadow = part.receiveShadow;
    im.raycast = () => {}; // gameplay raycasts never targeted car parts
    im.userData.carBatch = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // rewritten every frame
    if (b) {
      for (let i = 0; i < b.n; i++) { b.im.getMatrixAt(i, _pm); im.setMatrixAt(i, _pm); }
      if (b.im.parent) b.im.parent.remove(b.im);
      b.im.dispose();
      b.im = im;
    } else {
      b = { im, n: 0 };
      _batches.set(key, b);
    }
  }
  if (b.im.parent !== root) root.add(b.im);
  return b;
}

const _parts = (c, r) => {
  if (!c._batchParts) {
    c._batchParts = [];
    // Template-shared materials only: a mesh that owns its material (the
    // procedural debris boxes) would get a batch of its own
    r.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.material && !Array.isArray(o.material)
        && !o.material.transparent && !o.userData._ownedMat) c._batchParts.push(o);
    });
  }
  return c._batchParts;
};

/** Copy every live mover's visible parts into the batches. Call once per
 *  frame before rendering, after the movers and the camera have moved.
 *  sets: [[items, rootOf, reach], ...] (rootOf(item) -> its root Object3D;
 *  an item is gone once item.dead or its root has no parent; reach: a
 *  radius around the root holding everything it draws).
 *  The movers' world matrices are kept here, not by the renderer (their
 *  roots get matrixWorldAutoUpdate off): updated once, and only for movers
 *  whose reach is in view. Off-screen ones (skinned civilians: ~700 bones)
 *  aren't drawn, so their matrices wait until they're back in view.
 *  cull=false (shader prewarm): batch every part, in view or not. */
export function batchMovers(sets, root, camera, cull = true) {
  for (const b of _batches.values()) b.n = 0;
  if (cull) {
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
  }
  for (const [items, rootOf, reach = 12] of sets) {
    if (!items) continue;
    for (const c of items) {
      const r = rootOf(c);
      if (c.dead || !r.parent || !r.visible) continue;
      if (cull) {
        r.matrixWorldAutoUpdate = false;
        _sphere.center.copy(r.position);
        if (r.parent !== root) _sphere.center.applyMatrix4(r.parent.matrixWorld);
        _sphere.radius = reach;
        if (!_frustum.intersectsSphere(_sphere)) continue;
      }
      r.updateMatrixWorld(true);
      for (const p of _parts(c, r)) {
        if (!p.visible && !p.userData.batched) continue; // hidden by someone else
        if (!p.geometry.boundingSphere) p.geometry.computeBoundingSphere();
        p.visible = false;
        p.userData.batched = true;
        if (cull && p.frustumCulled) {
          _sphere.copy(p.geometry.boundingSphere).applyMatrix4(p.matrixWorld);
          if (!_frustum.intersectsSphere(_sphere)) continue;
        }
        const b = _batchFor(p, root);
        b.im.setMatrixAt(b.n++, p.matrixWorld);
      }
    }
  }
  for (const b of _batches.values()) {
    b.im.count = b.n;
    b.im.visible = b.n > 0 || !cull;
    if (b.n) b.im.instanceMatrix.needsUpdate = true;
  }
}

const _carRoot = (c) => c.root;
/** Cars only (the START shader prewarm's staged traffic). */
export function batchCars(cars, root, camera, cull = true) { batchMovers([[cars, _carRoot]], root, camera, cull); }
