// Moving traffic drawn as instanced batches: one draw per (geometry,
// material) pair instead of one per car part (~135 draws -> ~20 in the
// Loop). Each Car keeps its own scene graph (position, LOD swaps, explode,
// gameplay reads), but its part meshes are hidden and their world matrices
// are copied into shared InstancedMeshes every frame, culled per part with
// the same frustum test three applies to a Mesh, so the same parts are
// drawn with the same transforms and materials.
// Transparent parts stay individual meshes (their sort order matters), and
// so does any part hidden by other code.
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

/** Copy every live car's visible parts into the batches. Call once per
 *  frame before rendering, after the cars and the camera have moved.
 *  cull=false (shader prewarm): batch every part, in view or not. */
export function batchCars(cars, root, camera, cull = true) {
  for (const b of _batches.values()) b.n = 0;
  if (cull) {
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
  }
  for (const c of cars) {
    const r = c.root;
    if (c.dead || !r.parent || !r.visible) continue;
    if (!c._batchParts) {
      c._batchParts = [];
      r.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.material && !Array.isArray(o.material) && !o.material.transparent) c._batchParts.push(o); });
    }
    r.updateMatrixWorld(true);
    for (const p of c._batchParts) {
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
  for (const b of _batches.values()) {
    b.im.count = b.n;
    b.im.visible = b.n > 0 || !cull;
    if (b.n) b.im.instanceMatrix.needsUpdate = true;
  }
}
