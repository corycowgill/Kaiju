import { makeIO } from '../../lib/glb_opt.mjs';
import { getBounds } from '@gltf-transform/functions';
const io = makeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  const b = getBounds(r.listScenes()[0]);
  console.log('==', f, 'bbox', b.min.map(v=>+v.toFixed(2)), b.max.map(v=>+v.toFixed(2)));
  console.log(' nodes', r.listNodes().map(n=>n.getName()+(n.getMesh()?'[mesh]':'')).join(','));
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), uv = p.getAttribute('TEXCOORD_0');
    let umin=[1e9,1e9], umax=[-1e9,-1e9];
    if (uv) for (let i=0;i<uv.getCount();i++){const e=uv.getElement(i,[]);for(let k=0;k<2;k++){umin[k]=Math.min(umin[k],e[k]);umax[k]=Math.max(umax[k],e[k]);}}
    console.log('  prim mat', p.getMaterial()?.getName(), 'verts', pos.getCount(), 'tris', (idx?idx.getCount():pos.getCount())/3, 'attrs', p.listSemantics().join(','), 'uv', umin.map(v=>+v.toFixed(2)), umax.map(v=>+v.toFixed(2)));
  }
  for (const m of r.listMaterials()) console.log('  mat', m.getName(), 'bc', m.getBaseColorFactor(), 'M', m.getMetallicFactor(), 'R', m.getRoughnessFactor(), 'E', m.getEmissiveFactor(), 'ds', m.getDoubleSided(), 'tex', m.getBaseColorTexture()?.getName(), m.getMetallicRoughnessTexture()?.getName(), m.getNormalTexture()?.getName(), m.getEmissiveTexture()?.getName(), 'exts', m.listExtensions().map(e=>e.extensionName));
  for (const t of r.listTextures()) console.log('  tex', t.getName(), t.getMimeType(), t.getSize(), t.getImage()?.byteLength);
}
