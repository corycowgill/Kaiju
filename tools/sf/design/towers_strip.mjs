// Strip materials / textures from LOD1 twins (Blender drops the per-material primitive split when it exports without
// materials, so the twins are exported with them and stripped here). node towers_strip.mjs a_lod1.glb ...
import { makeIO } from '../../lib/glb_opt.mjs';
import { prune } from '@gltf-transform/functions';
const io = makeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) p.setMaterial(null);
  for (const m of r.listMaterials()) m.dispose();
  for (const t of r.listTextures()) t.dispose();
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));
  await io.write(f, doc);
}
