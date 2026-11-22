// Tokyo kit validator (design-kit): node tools/tokyo/design/kit_validate.mjs [out.json]
// Every tokyo_<style>_<x>.glb / tokyo_rooftop_mech.glb / debris_tokyo_*.glb in assets/buildings/tokyo: one mesh, one primitive,
// one material tokyo_kit_<piece> with a 1024 base-colour atlas + an emissive map (512 / 1024, factor [1,1,1]) on the same UVs,
// base y 0, centred, triangle budget (kit 1.5k-8k), LOD1 twin (no material, same UV set, bbox within 3%).
import { makeIO } from '../../lib/glb_opt.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/buildings/tokyo');
const io = await makeIO();
const info = async (f) => {
  const doc = await io.read(path.join(DIR, f)); const r = doc.getRoot();
  const prims = r.listMeshes().flatMap((m) => m.listPrimitives()); const p = prims[0];
  const pos = p.getAttribute('POSITION'); const mn = pos.getMin([]), mx = pos.getMax([]);
  const n = r.listNodes().find((x) => x.getMesh()); const t = n.getTranslation(), s = n.getScale();
  for (let i = 0; i < 3; i++) { mn[i] = mn[i] * s[i] + t[i]; mx[i] = mx[i] * s[i] + t[i]; }
  return { meshes: r.listMeshes().length, prims: prims.length, mats: r.listMaterials().map((m) => m.getName()), rough: r.listMaterials()[0]?.getRoughnessFactor(),
    metal: r.listMaterials()[0]?.getMetallicFactor(), tex: r.listTextures().map((x) => x.getSize()), base: r.listMaterials()[0]?.getBaseColorTexture()?.getSize(), em: r.listMaterials()[0]?.getEmissiveTexture()?.getSize(), emf: r.listMaterials()[0]?.getEmissiveFactor(), tris: (p.getIndices() ? p.getIndices().getCount() : pos.getCount()) / 3,
    mn, mx, uv: !!p.getAttribute('TEXCOORD_0'), cams: r.listCameras().length, node: n.getName(), kb: fs.statSync(path.join(DIR, f)).size / 1024 };
};
const files = fs.readdirSync(DIR).filter((f) => /^(tokyo_[a-z]+_[a-z]|tokyo_rooftop_mech|debris_tokyo_[a-z_]+)\.glb$/.test(f) && !f.endsWith('_lod1.glb')).sort();
const out = {}; let bad = 0;
for (const f of files) {
  const a = await info(f); const errs = [];
  const kit = /^tokyo_[a-z]+_[a-z]\.glb$/.test(f), debris = f.startsWith('debris');
  const size = a.mx.map((v, i) => v - a.mn[i]);
  if (a.meshes !== 1 || a.prims !== 1) errs.push('mesh/prim count');
  if (a.mats.length !== 1) errs.push('materials ' + a.mats.length);
  if (a.tex.length !== (debris ? 1 : 2)) errs.push('textures ' + a.tex.length);
  if (kit && (!a.base || a.base[0] !== 1024 || a.base[1] !== 1024)) errs.push('atlas ' + a.base);
  if (!debris && (!a.em || ![512, 1024].includes(a.em[0]) || a.em[0] !== a.em[1])) errs.push('emissive map ' + a.em);
  if (!debris && a.emf.some((v) => Math.abs(v - 1) > 1e-3)) errs.push('emissive factor ' + a.emf);
  if (kit && a.mats[0] !== 'tokyo_kit_' + f.slice(6, -4)) errs.push('material name ' + a.mats[0]);
  if (Math.abs(a.mn[1]) > 0.01) errs.push('base y ' + a.mn[1]);
  if (Math.abs(a.mn[0] + a.mx[0]) > 0.02 || Math.abs(a.mn[2] + a.mx[2]) > 0.02) errs.push('not centred');
  const [lo, hi] = debris ? [60, 400] : kit ? [1500, 8000] : [100, 600];
  if (a.tris < lo || a.tris > hi) errs.push('tris ' + a.tris);
  if (a.cams) errs.push('camera');
  let b = null;
  if (!fs.existsSync(path.join(DIR, f.replace('.glb', '_lod1.glb')))) errs.push('no lod1');
  else {
    b = await info(f.replace('.glb', '_lod1.glb'));
    if (b.meshes !== 1 || b.prims !== 1 || b.mats.length || b.tex.length || !b.uv) errs.push('lod1 structure');
    if (b.node !== a.node) errs.push('lod1 node name');
    b.mx.forEach((v, i) => { if (Math.abs((v - b.mn[i]) / size[i] - 1) > 0.03) errs.push('lod1 bbox axis ' + i); });
    if (b.tris > (kit ? 480 : 100)) errs.push('lod1 tris ' + b.tris);
  }
  out[f] = { size: size.map((v) => +v.toFixed(2)), tris0: a.tris, tris1: b?.tris, kb0: +a.kb.toFixed(0), kb1: b ? +b.kb.toFixed(1) : 0, errs };
  if (errs.length) bad++;
  console.log((errs.length ? 'FAIL ' : 'ok   ') + f.padEnd(36), out[f].size.join(' x ').padEnd(24), `${a.tris}/${b?.tris}`.padEnd(10), `${out[f].kb0} KB`, errs.join('; '));
}
console.log(`${files.length} files, ${bad} failing`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
