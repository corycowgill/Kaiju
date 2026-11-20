// Validate the design-towers GLBs. node tools/sf/design/towers_validate.mjs [summary.json] -> table + validated.json beside the summary
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIO } from '../../lib/glb_opt.mjs';
import { getBounds } from '@gltf-transform/functions';
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../assets/buildings/sf');
const summPath = process.argv[2];
const summ = JSON.parse(fs.readFileSync(summPath, 'utf8'));
const sites = JSON.parse(fs.readFileSync(path.join(here, 'towers_sites.json'), 'utf8'));
const BUDGET = { A: [3000, 9000], B: [2000, 5000], C: [1000, 3000] };
const io = makeIO();
const stats = async (f) => {
  const doc = await io.read(f); const r = doc.getRoot();
  const b = getBounds(r.listScenes()[0]);
  const prims = r.listMeshes().flatMap((m) => m.listPrimitives());
  const tris = prims.map((p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3);
  const usedMats = new Set(prims.map((p) => p.getMaterial()).filter(Boolean));
  const usedTex = new Set(); for (const m of usedMats) for (const t of [m.getBaseColorTexture(), m.getMetallicRoughnessTexture(), m.getNormalTexture(), m.getEmissiveTexture(), m.getOcclusionTexture()]) if (t) usedTex.add(t);
  const usedAcc = new Set(); for (const p of prims) { if (p.getIndices()) usedAcc.add(p.getIndices()); for (const a of p.listAttributes()) usedAcc.add(a); }
  return { b, prims, tris, nodes: r.listNodes().length, meshes: r.listMeshes().length, mats: r.listMaterials(), tex: r.listTextures(), cams: r.listCameras().length,
    unused: r.listMaterials().filter((m) => !usedMats.has(m)).length + r.listTextures().filter((t) => !usedTex.has(t)).length + r.listAccessors().filter((a) => !usedAcc.has(a)).length,
    sem: prims.map((p) => p.listSemantics().sort().join('+')), kb: fs.statSync(f).size / 1024,
    metalFacade: r.listMaterials().filter((m) => !/_palette$/.test(m.getName()) && m.getMetallicFactor() !== 0).length,
    uv: prims.map((p) => { const uv = p.getAttribute('TEXCOORD_0'); let lo = [1e9, 1e9], hi = [-1e9, -1e9]; for (let i = 0; i < uv.getCount(); i++) { const e = uv.getElement(i, []); for (let k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], e[k]); hi[k] = Math.max(hi[k], e[k]); } } return [...lo, ...hi]; }) };
};
const out = {}; let bad = 0;
const rows = [];
for (const [id, s] of Object.entries(summ)) {
  const f0 = path.join(OUT, id + '.glb'), f1 = path.join(OUT, id + '_lod1.glb');
  const errs = [];
  if (!fs.existsSync(f0) || !fs.existsSync(f1)) { rows.push([id, 'MISSING']); bad++; continue; }
  const a = await stats(f0), l = await stats(f1);
  const sz = (x) => [x.b.max[0] - x.b.min[0], x.b.max[1] - x.b.min[1], x.b.max[2] - x.b.min[2]];
  const A = sz(a), L = sz(l);
  if (Math.abs(a.b.min[1]) > 0.01) errs.push('base y ' + a.b.min[1].toFixed(3));
  if (Math.abs(a.b.min[0] + a.b.max[0]) > 0.1 || Math.abs(a.b.min[2] + a.b.max[2]) > 0.1) errs.push('not centred');
  if (Math.abs(A[1] - s.height) > 0.05) errs.push(`height ${A[1].toFixed(2)} != ${s.height}`);
  for (let k = 0; k < 3; k++) if (Math.abs(A[k] - s.size0[k]) > 0.05) errs.push('bbox != intended');
  const T0 = a.tris.reduce((x, y) => x + y, 0), T1 = l.tris.reduce((x, y) => x + y, 0);
  const [lo, hi] = BUDGET[s.tier];
  if (T0 < lo || T0 > hi) errs.push(`tris ${T0} outside ${lo}-${hi}`);
  const ratio = T1 / T0;
  if (ratio < 0.10 || ratio > 0.30) errs.push(`lod1 ratio ${(ratio * 100).toFixed(0)}%`);
  if (a.prims.length !== l.prims.length || a.meshes !== 1 || l.meshes !== 1 || a.nodes !== 1 || l.nodes !== 1) errs.push(`prims ${a.prims.length}/${l.prims.length} meshes ${a.meshes}/${l.meshes} nodes ${a.nodes}/${l.nodes}`);
  if (l.mats.length || l.tex.length) errs.push('lod1 has materials / textures');
  for (let k = 0; k < 3; k++) if (Math.abs(L[k] - A[k]) / A[k] > 0.03) errs.push(`lod1 bbox axis ${k} off ${(100 * (L[k] - A[k]) / A[k]).toFixed(1)}%`);
  for (let k = 0; k < a.prims.length && k < l.prims.length; k++) {
    if (a.sem[k] !== l.sem[k]) errs.push('lod1 attributes differ');
    const u0 = a.uv[k], u1 = l.uv[k], pal = k === a.prims.length - 1;
    if (pal && (u1[0] < u0[0] - 1e-3 || u1[2] > u0[2] + 1e-3 || u1[1] < u0[1] - 1e-3 || u1[3] > u0[3] + 1e-3)) errs.push('lod1 palette uv outside lod0 range');
  }
  if (a.unused || l.unused) errs.push('unused data');
  if (a.cams) errs.push('camera');
  if (a.sem.some((x) => /COLOR/.test(x))) errs.push('vertex colours');
  if (a.metalFacade) errs.push('facade metallic != 0');
  if (a.prims.length > 3) errs.push('too many primitives');
  const last = a.prims[a.prims.length - 1].getMaterial();
  if (!last || last.getName() !== id + '_palette') errs.push('last primitive is not the palette');
  for (const t of a.tex) {
    const [w, h] = t.getSize(); const n = t.getName();
    if (/_pal$|_orm$/.test(n)) { if (w !== 256 || h !== 256) errs.push(`palette ${w}x${h}`); } else if (w > 256 || h > 512) errs.push(`texture ${n} ${w}x${h}`);
  }
  if (!(A[1] > 0)) errs.push('no height on Y');
  // real footprint
  const key = s.ids ? s.ids[0] : id; let fp = '';
  if (sites[key]) {
    const xs = sites[key].polys.flat().map((p) => p[0]), ys = sites[key].polys.flat().map((p) => p[1]);
    let W = Math.max(...xs) - Math.min(...xs), D = Math.max(...ys) - Math.min(...ys);
    if (s.swap) [W, D] = [D, W];
    const ew = (A[0] - W) / W, ed = (A[2] - D) / D; fp = `${W.toFixed(1)}x${D.toFixed(1)} (${(ew * 100).toFixed(1)}%, ${(ed * 100).toFixed(1)}%)`;
    if (Math.abs(ew) > 0.05 || Math.abs(ed) > 0.05) errs.push('footprint off > 5%');
  }
  out[id] = { size: A.map((v) => +v.toFixed(2)), tris0: T0, tris1: T1, kb0: +a.kb.toFixed(1), kb1: +l.kb.toFixed(1), prims: a.prims.length, errs };
  if (errs.length) bad++;
  rows.push([id, s.tier, A.map((v) => v.toFixed(1)).join(' x '), `${T0} / ${T1} (${(ratio * 100).toFixed(0)}%)`, `${a.kb.toFixed(0)} / ${l.kb.toFixed(0)} KB`, 'site ' + fp, errs.length ? 'FAIL: ' + errs.join('; ') : 'ok']);
}
for (const r of rows) console.log(r.join(' | '));
console.log(`${rows.length} models, ${bad} with problems`);
fs.writeFileSync(path.join(path.dirname(summPath), 'validated.json'), JSON.stringify(out, null, 1));
