// icons_validate.mjs - validates the design-icons GLBs (node tools/sf/design/icons_validate.mjs <stats dir>)
import fs from 'fs';
import { makeIO } from '../../lib/glb_opt.mjs';
import { getBounds } from '@gltf-transform/core';
const dir = process.argv[2]; const OUT = new URL('../../../assets/buildings/sf/', import.meta.url).pathname;
const io = makeIO(); let bad = 0; const rows = [];
const BUD = { A: [3000, 12000], B: [2000, 5000], C: [1000, 3000] };
for (const f of fs.readdirSync(dir).filter((f) => /^stats_.*\.json$/.test(f)).sort()) {
  const st = JSON.parse(fs.readFileSync(dir + '/' + f)); const id = st.id; const err = [];
  const d0 = await io.read(OUT + id + '.glb'), d1 = await io.read(OUT + id + '_lod1.glb');
  const info = (d) => { const r = d.getRoot(); const b = getBounds(r.listScenes()[0]); const prims = r.listMeshes().flatMap((m) => m.listPrimitives());
    return { b, nodes: r.listNodes().length, meshes: r.listMeshes().length, prims: prims.length, tris: prims.reduce((a, p) => a + p.getIndices().getCount() / 3, 0), mats: r.listMaterials().length, tex: r.listTextures().map((t) => t.getSize()), cams: r.listCameras().length,
      uv: prims.map((p) => !!p.getAttribute('TEXCOORD_0')), metal: r.listMaterials().filter((m) => !/_palette$/.test(m.getName())).map((m) => m.getMetallicFactor()) }; };
  const a = info(d0), l = info(d1); const sz = a.b.max.map((v, i) => v - a.b.min[i]);
  st.bbox.forEach((v, i) => { if (Math.abs(sz[i] - v) > 0.02) err.push('bbox ' + sz.map((x) => x.toFixed(2))); });
  if (Math.abs(a.b.min[1]) > 0.01) err.push('base y ' + a.b.min[1]);
  if (Math.abs(a.b.min[0] + a.b.max[0]) > 0.02 || Math.abs(a.b.min[2] + a.b.max[2]) > 0.02) err.push('not centred');
  if (a.nodes !== 1 || a.meshes !== 1 || a.cams) err.push('nodes/meshes/cameras');
  if (l.prims !== a.prims || l.nodes !== 1) err.push('lod1 prim count ' + l.prims + ' vs ' + a.prims);
  if (l.mats || l.tex.length) err.push('lod1 has materials');
  if (!a.uv.every(Boolean) || !l.uv.every(Boolean)) err.push('uv missing');
  const dev = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(l.b.min[i] - a.b.min[i]), Math.abs(l.b.max[i] - a.b.max[i])])) / Math.max(...sz);
  if (dev > 0.03) err.push('lod1 box ' + dev.toFixed(3));
  if (a.tex.some((t) => t[0] > 256 || t[1] > 512)) err.push('texture size');
  if (a.metal.some((m) => m !== 0)) err.push('facade metal');
  const [lo, hi] = BUD[st.tier]; const prop = sz[0] * sz[2] < 2500 && st.tier !== 'B' || ['cupids_span'].includes(id);
  const note = []; if (a.tris > hi) err.push('tris over budget'); if (a.tris < lo && !prop) note.push('under tier tris'); if (l.tris / a.tris > 0.3) note.push('lod1 ' + Math.round(100 * l.tris / a.tris) + '%');
  if (err.length) bad++;
  rows.push([id, st.tier, sz.map((v) => v.toFixed(1)).join(' x '), a.tris + ' / ' + l.tris, Math.round(fs.statSync(OUT + id + '.glb').size / 1024) + ' KB', a.tex.map((t) => t.join('x')).join(' '), err.length ? 'FAIL ' + err.join('; ') : 'ok', note.join(', ')].join(' | '));
}
console.log(rows.join('\n')); console.log(rows.length + ' models, ' + bad + ' failing');
