// Optimise the source GLBs under assets/ IN PLACE (git keeps the originals):
//  - textures sized to their on-screen texel density (tools/lib/glb_opt.mjs: 20 texels per
//    world unit for colour, half for normal / roughness / AO; kaiju untouched), near-constant
//    maps -> 8x8, colour maps re-encoded as WebP (EXT_texture_webp), albedo outliers toned
//    (TONE below)
//  - geometry welded, quantized (KHR_mesh_quantization) and meshopt-compressed
//    (EXT_meshopt_compression: the game's GLTFLoaders call setMeshoptDecoder)
//  - doubleSided turned off on materials whose back faces are never visible
// Safe to re-run: every step skips what is already done. Then regenerate the derived trees:
//   node tools/make_mobile_assets.mjs && node tools/make_ktx2_assets.mjs && node tools/make_asset_manifest.mjs
// usage: node tools/optimize_assets.mjs [path-regex] [--out <dir>] [--dry]
//   --out: write to <dir>/<same path> instead of in place (review before replacing)
import { Logger } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIO, optimizeTextures, optimizeGeometry, compressGeometry, fixSidedness, docStats } from './lib/glb_opt.mjs';

const REPO = process.env.KAIJU_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = `${REPO}/assets`;
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const OUT = flag('--out');
const dry = args.includes('--dry');
const filter = args.find((a) => !a.startsWith('--')) ? new RegExp(args.find((a) => !a.startsWith('--'))) : null;

// Albedo outliers pulled toward the level's palette (asset audit 2.2: landmarks average
// saturation 0.17, luminance 0.53). sat / lum are multipliers applied once to the base
// colour textures; the texture is tagged in its extras so a re-run doesn't stack them.
const TONE = [
  [/^ghidorah_model\/ghidorah\.glb$/,{ sat: 0.7, lum: 0.62 }],  // Tridon: luminance 0.63 / saturation 0.71 beside Gorrak 0.27 / 0.18
  [/^trees\/tree_zelkova/, { sat: 0.62, lum: 0.92 }],          // lime canopy at saturation 0.82
  [/^buildings\/chicago\/cna_center_333_s_wabash/, { sat: 0.72 }], // facade at saturation 0.71
  [/^buildings\/chicago\/gen_low2_/, { lum: 1.22 }],           // AI-baked blocks: luminance 0.33 beside 0.72 procedural ones
  [/^buildings\/chicago\/(harold_washington_library|pontiac_building|chicago_theatre|thompson_center)/, { lum: 1.3 }], // luminance 0.07-0.14
];
// Hand-authored phone models live only in assets/m/ (see make_mobile_assets PINNED):
// they get the same geometry / format treatment, at phone texture density
const PINNED_MOBILE = /^m\/buildings\/chicago\/soldier_field(_lod1)?\.glb$/;

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (r !== 'ktx2') out.push(...walk(`${dir}/${e.name}`, r)); } else out.push(r);
  }
  return out;
}

const io = makeIO();
const tot = { files: 0, before: 0, after: 0, tex0: 0, tex1: 0, vram0: 0, vram1: 0, ds0: 0, ds1: 0, mats: 0 };
for (const rel of walk(A).filter((r) => r.endsWith('.glb') && (!r.startsWith('m/') || PINNED_MOBILE.test(r))).sort()) {
  if (filter && !filter.test(rel)) continue;
  const src = `${A}/${rel}`;
  const logical = rel.replace(/^m\//, ''); // the path the placement / tone rules know
  const doc = await io.read(src);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const s0 = docStats(doc);
  const log = [];
  const tone = TONE.find(([re]) => re.test(logical));
  log.push(...await optimizeTextures(doc, logical, rel.startsWith('m/') ? { texelsPerUnit: 10, cap: 512, heroCap: 1024, tone: tone && tone[1] } : { tone: tone && tone[1] }));
  await optimizeGeometry(doc, logical);
  log.push(...fixSidedness(doc, logical));
  await compressGeometry(doc, logical);
  const s1 = docStats(doc);
  const bin = await io.writeBinary(doc);
  const before = fs.statSync(src).size;
  // Nothing to gain (already optimised, or a tiny file): leave the file alone
  const changed = log.some((l) => !l.startsWith('note:')) || bin.byteLength < before * 0.97;
  if (!changed) continue;
  tot.files++; tot.before += before; tot.after += bin.byteLength; tot.tex0 += s0.texBytes; tot.tex1 += s1.texBytes;
  tot.vram0 += s0.vram; tot.vram1 += s1.vram; tot.ds0 += s0.doubleSided; tot.ds1 += s1.doubleSided; tot.mats += s1.materials;
  console.log(`${rel}: ${(before / 1024).toFixed(0)}K -> ${(bin.byteLength / 1024).toFixed(0)}K (geometry ${((before - s0.texBytes) / 1024).toFixed(0)}K -> ${((bin.byteLength - s1.texBytes) / 1024).toFixed(0)}K, verts ${s0.verts} -> ${s1.verts})`);
  for (const l of log) console.log('    ' + l);
  if (dry) continue;
  const dst = OUT ? `${OUT}/${rel}` : src;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, bin);
}
const mb = (b) => (b / 1048576).toFixed(1);
console.log(`${tot.files} files changed: ${mb(tot.before)} -> ${mb(tot.after)} MB (textures ${mb(tot.tex0)} -> ${mb(tot.tex1)} MB; `
  + `as RGBA8 + mips ${mb(tot.vram0)} -> ${mb(tot.vram1)} MB); double-sided materials ${tot.ds0} -> ${tot.ds1} of ${tot.mats}`);

// Ground tile JPEGs (TextureLoader in city.js): the ambientCG exports are near-lossless
// (up to 21 bits per pixel). Re-encode in place; skipped once a pass no longer pays.
{
  const sharp = (await import('sharp')).default;
  let b0 = 0, b1 = 0;
  for (const f of fs.readdirSync(`${A}/textures`).filter((n) => n.endsWith('.jpg'))) {
    const rel = `textures/${f}`;
    if (filter && !filter.test(rel)) continue;
    const src = fs.readFileSync(`${A}/${rel}`);
    const normal = /_normal\./.test(f);
    const out = await sharp(src).jpeg({ quality: normal ? 90 : 88, chromaSubsampling: normal ? '4:4:4' : '4:2:0', mozjpeg: true }).toBuffer();
    if (out.length > src.length * 0.7) continue;
    b0 += src.length; b1 += out.length;
    console.log(`${rel}: ${(src.length / 1024).toFixed(0)}K -> ${(out.length / 1024).toFixed(0)}K`);
    if (dry) continue;
    const dst = OUT ? `${OUT}/${rel}` : `${A}/${rel}`;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, out);
  }
  if (b0) console.log(`ground textures: ${mb(b0)} -> ${mb(b1)} MB`);
}
