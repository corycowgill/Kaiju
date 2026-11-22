// icons_validate.mjs - validates the Tokyo design-icons GLBs (node tools/tokyo/design/icons_validate.mjs <stats dir>)
import fs from 'fs';
import { makeIO } from '../../lib/glb_opt.mjs';
import { getBounds } from '@gltf-transform/core';
const dir = process.argv[2]; const OUT = new URL('../../../assets/buildings/tokyo/', import.meta.url).pathname;
const io = makeIO(); let bad = 0; const rows = [];
const BUD = { A: [3000, 12000], B: [1500, 5000], C: [800, 3000] };
const FREE = ['rainbow_bridge'];   // origin mid-span at water level
for (const f of fs.readdirSync(dir).filter((f) => /^stats_.*\.json$/.test(f)).sort()) {
  const st = JSON.parse(fs.readFileSync(dir + '/' + f)); const id = st.id; const err = [];
  const d0 = await io.read(OUT + id + '.glb'), d1 = await io.read(OUT + id + '_lod1.glb');
  const info = (d) => { const r = d.getRoot(); const b = getBounds(r.listScenes()[0]); const prims = r.listMeshes().flatMap((m) => m.listPrimitives());
    return { b, nodes: r.listNodes().length, meshes: r.listMeshes().length, prims: prims.length, tris: prims.reduce((a, p) => a + p.getIndices().getCount() / 3, 0), mats: r.listMaterials().length, tex: r.listTextures().map((t) => t.getSize()), cams: r.listCameras().length,
      pb: prims.map((p) => { const a = p.getAttribute('POSITION'); return [a.getMin([]), a.getMax([])]; }),
      emis: r.listMaterials().map((m) => !!m.getEmissiveTexture()), names: r.listMaterials().map((m) => m.getName()),
      uv: prims.map((p) => !!p.getAttribute('TEXCOORD_0')), metal: r.listMaterials().filter((m) => !/_palette$/.test(m.getName())).map((m) => m.getMetallicFactor()) }; };
  const a = info(d0), l = info(d1); const sz = a.b.max.map((v, i) => v - a.b.min[i]);
  st.bbox.forEach((v, i) => { if (Math.abs(sz[i] - v) > 0.02) err.push('bbox ' + sz.map((x) => x.toFixed(2))); });
  if (Math.abs(a.b.min[1]) > 0.01) err.push('base y ' + a.b.min[1]);
  if (Math.abs(a.b.min[0] + a.b.max[0]) > 0.02 || Math.abs(a.b.min[2] + a.b.max[2]) > 0.02) err.push('not centred');
  if (a.nodes !== 1 || a.meshes !== 1 || a.cams) err.push('nodes/meshes/cameras');
  if (l.prims !== a.prims || l.nodes !== 1) err.push('lod1 prim count ' + l.prims + ' vs ' + a.prims);
  if (l.mats || l.tex.length) err.push('lod1 has materials');
  if (!a.uv.every(Boolean) || !l.uv.every(Boolean)) err.push('uv missing');
  if (!a.emis.every(Boolean)) err.push('material without emissive map');
  if (!a.names.some((n) => /_palette$/.test(n))) err.push('no palette material');
  const dev = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(l.b.min[i] - a.b.min[i]), Math.abs(l.b.max[i] - a.b.max[i])])) / Math.max(...sz);
  if (dev > 0.03) err.push('lod1 box ' + dev.toFixed(3));
  // every LOD1 primitive box against its LOD0 primitive (the game rejects 8%)
  let pdev = 0;
  if (l.prims === a.prims) a.pb.forEach((p, k) => { const q = l.pb[k]; const ps = Math.max(...p[1].map((v, i) => v - p[0][i])); pdev = Math.max(pdev, Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(q[0][i] - p[0][i]), Math.abs(q[1][i] - p[1][i])])) / ps); });
  if (pdev > 0.05) err.push('lod1 primitive box ' + pdev.toFixed(3));
  if (a.tex.some((t) => t[0] > 256 || t[1] > 512)) err.push('texture size');
  if (a.metal.some((m) => m !== 0)) err.push('facade metal');
  const [lo, hi] = BUD[st.tier];
  const note = []; if (a.tris > hi) err.push('tris over budget'); if (a.tris < lo) note.push('under tier tris'); const lr = l.tris / a.tris; if (lr > 0.35 || lr < 0.10) note.push('lod1 ' + Math.round(100 * lr) + '%');
  if (err.length) bad++;
  rows.push([id, st.tier, sz.map((v) => v.toFixed(1)).join(' x '), a.tris + ' / ' + l.tris, Math.round(fs.statSync(OUT + id + '.glb').size / 1024) + ' KB', a.tex.map((t) => t.join('x')).join(' '), 'pdev ' + pdev.toFixed(3), err.length ? 'FAIL ' + err.join('; ') : 'ok', note.join(', ')].join(' | '));
}
console.log(rows.join('\n')); console.log(rows.length + ' models, ' + bad + ' failing');
