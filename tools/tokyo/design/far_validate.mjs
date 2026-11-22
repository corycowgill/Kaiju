// far_validate.mjs - node tools/tokyo/design/far_validate.mjs : loads every far GLB with makeIO() and checks conventions
import { makeIO } from '../../lib/glb_opt.mjs';
import { getBounds } from '@gltf-transform/core';
import fs from 'fs';
const DIR = new URL('../../../assets/buildings/tokyo/', import.meta.url).pathname;
const SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/tk_far/stats/';
const io = makeIO();
const info = async (f) => {
  const doc = await io.read(f); const root = doc.getRoot(); const b = getBounds(root.listScenes()[0]);
  let tris = 0, prims = 0, uv = true;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += p.getIndices().getCount() / 3; uv = uv && !!p.getAttribute('TEXCOORD_0') && !!p.getAttribute('NORMAL'); }
  return { b, tris, prims, uv, nodes: root.listNodes().length, meshes: root.listMeshes().length, mats: root.listMaterials(), tex: root.listTextures() };
};
let bad = 0; const rows = [];
for (const s of fs.readdirSync(SCR).filter((f) => f.endsWith('.json')).sort()) {
  const n = s.replace('.json', ''); const errs = [];
  const a = await info(DIR + n + '.glb'), l = await info(DIR + n + '_lod1.glb');
  const sz = (x) => x.b.max.map((v, i) => v - x.b.min[i]);
  const A = sz(a), L = sz(l);
  if (a.nodes !== 1 || a.meshes !== 1) errs.push('nodes/meshes');
  const pal = a.mats.find((m) => m.getName() === n + '_palette');
  if (!pal) errs.push('no palette material');
  else {
    if (pal.getMetallicFactor() !== 1 || pal.getRoughnessFactor() !== 1) errs.push('mr factors');
    if (!pal.getBaseColorTexture() || !pal.getMetallicRoughnessTexture()) errs.push('textures');
    for (const t of a.tex) { const [w, h] = t.getSize(); if (w !== 256 || h !== 256 || t.getMimeType() !== 'image/png') errs.push('tex ' + t.getName()); }
  }
  if (a.mats.length !== a.prims) errs.push('mats ' + a.mats.length + ' prims ' + a.prims);
  if (l.mats.length !== 0 || l.tex.length !== 0) errs.push('lod1 has materials');
  if (l.prims !== a.prims) errs.push('lod1 prims ' + l.prims + ' vs ' + a.prims);
  if (!a.uv || !l.uv) errs.push('uv/normal missing');
  A.forEach((v, i) => { if (Math.abs(v - L[i]) > 0.03 * v) errs.push('lod1 bbox axis ' + i + ' ' + v.toFixed(3) + ' vs ' + L[i].toFixed(3)); });
  const r = l.tris / a.tris; if (r > 0.36 || r < 0.14) errs.push('lod ratio ' + (r * 100).toFixed(0) + '%');
  if (!/monorail_train/.test(n) && a.b.min[1] < -0.011) errs.push('below y 0: ' + a.b.min[1].toFixed(3));
  const ground = !/deck_segment|monorail_train/.test(n);
  if (ground && a.b.min[1] > 0.02) errs.push('not on y 0: ' + a.b.min[1].toFixed(3));
  if (!/container_crane|traffic_signal|bus_stop/.test(n)) { if (Math.abs(a.b.min[0] + a.b.max[0]) > 0.05 * A[0] + 0.02) errs.push('x not centred'); }
  if (errs.length) bad++;
  rows.push(`${errs.length ? 'FAIL' : 'ok  '} ${n.padEnd(26)} [${A.map((v) => v.toFixed(2)).join(', ')}] y ${a.b.min[1].toFixed(2)}..${a.b.max[1].toFixed(2)} tris ${a.tris}/${l.tris} prims ${a.prims} ${errs.join('; ')}`);
}
console.log(rows.join('\n')); console.log(bad ? bad + ' FAILED' : 'ALL OK (' + rows.length + ' models)');
