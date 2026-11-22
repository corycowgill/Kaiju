import { makeIO } from '../../lib/glb_opt.mjs';
import { getBounds } from '@gltf-transform/core';
const io = makeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const root = doc.getRoot();
  const sc = root.listScenes()[0]; const b = getBounds(sc);
  let tris = 0, prims = 0; const attrs = new Set();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; p.listSemantics().forEach(s => attrs.add(s)); }
  const mats = root.listMaterials().map(m => `${m.getName()} mf=${m.getMetallicFactor()} rf=${m.getRoughnessFactor()} bc=${!!m.getBaseColorTexture()} mr=${!!m.getMetallicRoughnessTexture()} em=${!!m.getEmissiveTexture()} ef=${m.getEmissiveFactor()} ds=${m.getDoubleSided()} occ=${!!m.getOcclusionTexture()}`);
  const tex = root.listTextures().map(t => `${t.getName()}:${t.getMimeType()}:${t.getSize()}`);
  console.log(f.split('/').pop(), 'nodes', root.listNodes().map(n=>n.getName()).join(','), 'meshes', root.listMeshes().length, 'prims', prims, 'tris', tris, 'min', b.min.map(v => v.toFixed(2)), 'max', b.max.map(v => v.toFixed(2)), [...attrs].join(','), '\n  ', mats.join(' | '), '\n  ', tex.join(' '));
}
