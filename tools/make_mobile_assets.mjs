// Build mobile texture variants of every GLB (and the ground JPEGs) into assets/m/<same path>,
// and write src/mobileAssets.js listing the paths that have a variant.
// Caps: hero kaiju + mech (BossMech is kaiju-sized) 1024; everything else 512. Never upscales.
// Static models (QUANT_DIRS: no skins, animation or morphs) are also mesh-quantized
// (KHR_mesh_quantization: positions 14 bits, normals 10, UVs 12; the dequantize
// transform goes on the mesh node), so every one of them gets a variant; other
// files whose textures are already within the cap are skipped (served as-is).
// usage: node tools/make_mobile_assets.mjs   (needs: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PropertyType } from '@gltf-transform/core';
import { prune, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = `${REPO}/assets`;
const OUT = `${A}/m`;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// Hand-authored phone models (an artist's lighter mesh, not just smaller
// textures) live in assets/m/ already: never regenerate them, only list them
const PINNED = new Set([
  'buildings/chicago/soldier_field.glb',      // = artist's soldier_field_mobile.glb (9.8k tris)
  'buildings/chicago/soldier_field_lod1.glb', // its matching LOD1
]);
const capFor = (rel) => (/^(kaiju_model|ghidorah_model|mecha_model|enemies\/mech)\//.test(rel) ? 1024 : 512);
// Quantized: static buildings, props, vehicles, trees. Not the Navy Pier wheel
// (its rotor node animates: the dequantize transform would sit on it)
const QUANT_DIRS = /^(buildings|props|vehicles|trees)\//;
const QUANT_SKIP = /navy_pier_wheel/;
const quantizable = (rel, doc) => {
  const root = doc.getRoot();
  return QUANT_DIRS.test(rel) && !QUANT_SKIP.test(rel) && !root.listSkins().length && !root.listAnimations().length
    && !root.listMeshes().some((m) => m.listPrimitives().some((p) => p.listTargets().length));
};

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (r !== 'm' && r !== 'ktx2') out.push(...walk(`${dir}/${e.name}`, r)); }
    else out.push(r);
  }
  return out;
}

const variants = [];
let before = 0, after = 0;
for (const rel of walk(A).filter((r) => r.endsWith('.glb'))) {
  if (PINNED.has(rel)) {
    if (fs.existsSync(`${OUT}/${rel}`)) variants.push(rel);
    continue;
  }
  const cap = capFor(rel);
  const doc = await io.read(`${A}/${rel}`);
  const texs = doc.getRoot().listTextures();
  const bigTex = texs.some((t) => Math.max(...(t.getSize() || [0, 0])) > cap), quant = quantizable(rel, doc);
  if (!bigTex && !quant) continue;
  const alphaTex = new Set(doc.getRoot().listMaterials()
    .filter((m) => m.getAlphaMode() !== 'OPAQUE').map((m) => m.getBaseColorTexture()).filter(Boolean));
  for (const t of texs) {
    const size = t.getSize();
    if (!size || Math.max(...size) <= cap) continue;
    let img = sharp(Buffer.from(t.getImage())).resize(cap, cap, { fit: 'inside', kernel: 'lanczos3' });
    if (alphaTex.has(t) || t.getMimeType() === 'image/png') {
      t.setImage(new Uint8Array(await img.png({ compressionLevel: 9 }).toBuffer())).setMimeType('image/png');
    } else {
      t.setImage(new Uint8Array(await img.jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer())).setMimeType('image/jpeg');
    }
  }
  if (quant) {
    // UVs only where they stay in [0, 1] (no KHR_texture_transform: the level
    // swaps some maps at runtime and would drop a transform)
    const uvs = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).flatMap((p) => p.listSemantics().filter((x) => /^TEXCOORD/.test(x)).map((x) => p.getAttribute(x)));
    const uvOK = uvs.every((a) => Math.min(...a.getMin([])) >= 0 && Math.max(...a.getMax([])) <= 1);
    await doc.transform(quantize({ pattern: uvOK ? /^(POSITION|NORMAL|TEXCOORD_\d+)$/ : /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, cleanup: false }),
      // drop only the replaced float accessors (no dedup: materials keep their names)
      prune({ propertyTypes: [PropertyType.ACCESSOR], keepAttributes: true, keepLeaves: true }));
  }
  fs.mkdirSync(path.dirname(`${OUT}/${rel}`), { recursive: true });
  await io.write(`${OUT}/${rel}`, doc);
  // Quantizing alone didn't pay (tiny files): serve the original
  if (!bigTex && fs.statSync(`${OUT}/${rel}`).size >= fs.statSync(`${A}/${rel}`).size) { fs.unlinkSync(`${OUT}/${rel}`); continue; }
  before += fs.statSync(`${A}/${rel}`).size; after += fs.statSync(`${OUT}/${rel}`).size;
  variants.push(rel);
}
// Ground tile textures (loaded by TextureLoader in city.js)
for (const rel of walk(`${A}/textures`, 'textures').filter((r) => r.endsWith('.jpg'))) {
  const src = `${A}/${rel}`;
  const meta = await sharp(src).metadata();
  if (Math.max(meta.width, meta.height) <= 512) continue;
  fs.mkdirSync(path.dirname(`${OUT}/${rel}`), { recursive: true });
  await sharp(src).resize(512, 512, { fit: 'inside', kernel: 'lanczos3' })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(`${OUT}/${rel}`);
  before += fs.statSync(src).size; after += fs.statSync(`${OUT}/${rel}`).size;
  variants.push(rel);
}
variants.sort();
fs.writeFileSync(`${REPO}/src/mobileAssets.js`, `// GENERATED by tools/make_mobile_assets.mjs -- do not edit by hand.
// Asset paths (relative to assets/) that have a reduced-texture mobile variant
// under assets/m/ (512px textures; 1024px for the kaiju and mech).
// assetCache.assetURL() swaps these in on mobile. Re-run the script after
// adding or replacing a GLB or ground texture.
export const MOBILE_VARIANTS = new Set(${JSON.stringify(variants, null, 2)});
`);
console.log(`${variants.length} variants, ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
