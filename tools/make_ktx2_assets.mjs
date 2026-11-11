// Build KTX2 copies of the Chicago level's GLBs into assets/ktx2/<same path>, and write
// src/ktx2Assets.js listing them. Desktop loads these through KTX2Loader (city.enableKTX2):
// the colour / roughness / AO / emissive maps become GPU-compressed textures (BC7 on
// desktop: 1 byte per texel instead of 4, mips included, no decode + mip generation on
// the main thread), with the WebP originals as the fallback. Phones keep assets/m/.
//
// Basis ETC1S for those maps: measured on this set it is the same download as the WebP
// (tribune_tower 1024 albedo: WebP 217K, ETC1S 254K at 32.8 dB) where UASTC is 5-6x
// (1.2 MB, 41 dB) - UASTC is what doubled the download when this tool covered Tokyo.
// Normal maps stay as they are: ETC1S wrecks them (24 dB) and UASTC costs 1.3 MB per 1024.
// Tokyo's buildings are not converted: ETC1S measured ~29 dB on their window grids.
// Every encoded texture is decoded again with three's own transcoder (the one the game
// runs) and kept only if it is close enough to its source (MIN_PSNR).
// usage: node tools/make_ktx2_assets.mjs [path-regex]   (needs: npm install)
import { Logger } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIO, textureUsage, compressGeometry } from './lib/glb_opt.mjs';

const REPO = process.env.KAIJU_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = `${REPO}/assets`;
const OUT = `${A}/ktx2`;
// Only folders whose GLBs are parsed by city.js's loader (the one with the KTX2Loader)
const DIRS = ['buildings/chicago', 'trees', 'props', 'vehicles'];
const MIN_SIDE = 16, MIN_PSNR = 30;
const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
const io = makeIO();

const imageDecoder = async (buf) => {
  const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
};
// three's Basis transcoder, as KTX2Loader's workers run it
let _basis = null;
async function transcoder() {
  if (_basis) return _basis;
  const dir = path.join(REPO, 'node_modules/three/examples/jsm/libs/basis');
  const src = fs.readFileSync(path.join(dir, 'basis_transcoder.js'), 'utf8');
  const BASIS = new Function('require', 'module', '__dirname', `${src}; return BASIS;`)(() => ({}), {}, dir);
  _basis = await BASIS({ wasmBinary: fs.readFileSync(path.join(dir, 'basis_transcoder.wasm')) });
  _basis.initializeBasis();
  return _basis;
}
async function psnrOf(ktx, srcBuf) {
  const B = await transcoder();
  const f = new B.KTX2File(new Uint8Array(ktx));
  try {
    if (!f.isValid() || !f.startTranscoding()) return 0;
    const w = f.getWidth(), h = f.getHeight(), RGBA32 = 13;
    const dst = new Uint8Array(f.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32));
    if (!f.transcodeImage(dst, 0, 0, 0, RGBA32, 0, -1, -1)) return 0;
    const o = await sharp(Buffer.from(srcBuf)).ensureAlpha().raw().toBuffer();
    let se = 0, n = 0;
    for (let i = 0; i < o.length; i += 4) for (let c = 0; c < 3; c++) { const e = o[i + c] - dst[i + c]; se += e * e; n++; }
    return 10 * Math.log10(255 * 255 / Math.max(1e-9, se / n));
  } finally { f.close(); f.delete(); }
}
// The Basis encoder prints its progress to stdout
const quiet = async (fn) => { const w = process.stdout.write; process.stdout.write = () => true; try { return await fn(); } finally { process.stdout.write = w; } };

const done = [];
let srcBytes = 0, outBytes = 0, nTex = 0, nSkip = 0;
for (const dir of DIRS) {
  for (const f of fs.readdirSync(`${A}/${dir}`).filter((n) => n.endsWith('.glb')).sort()) {
    const rel = `${dir}/${f}`;
    const out = `${OUT}/${rel}`;
    if (filter && !filter.test(rel)) { if (fs.existsSync(out)) done.push(rel); continue; }
    const doc = await io.read(`${A}/${rel}`);
    doc.setLogger(new Logger(Logger.Verbosity.WARN));
    const usage = textureUsage(doc);
    let converted = 0;
    for (const t of doc.getRoot().listTextures()) {
      const u = usage.get(t); const size = t.getSize(); const src = t.getImage();
      if (!u || !size || !src || u.slots.has('normal') || u.alpha) continue;
      const [w, h] = size;
      if (Math.min(w, h) < MIN_SIDE || w % 4 || h % 4) continue; // BC7 blocks are 4x4
      if ((await sharp(Buffer.from(src)).stats()).channels[3]?.min < 255) continue; // real alpha: leave
      const srgb = u.slots.has('map') || u.slots.has('em');
      const ktx = await quiet(() => encodeToKTX2(new Uint8Array(src), { imageDecoder, isUASTC: false, qualityLevel: 255, compressionLevel: 2,
        generateMipmap: true, isPerceptual: srgb, isSetKTX2SRGBTransferFunc: srgb }));
      const q = await psnrOf(ktx, src);
      if (q < MIN_PSNR) { nSkip++; console.log(`  ${rel} ${t.getName()} ${w}x${h}: ${q.toFixed(1)} dB, kept as ${t.getMimeType()}`); continue; }
      t.setImage(ktx).setMimeType('image/ktx2');
      converted++; nTex++;
    }
    if (!converted) { fs.rmSync(out, { force: true }); continue; }
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    await compressGeometry(doc, rel);
    const bin = await io.writeBinary(doc);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bin);
    srcBytes += fs.statSync(`${A}/${rel}`).size; outBytes += bin.byteLength;
    done.push(rel);
  }
}
// Copies of files that no longer exist in the source tree
if (!filter && fs.existsSync(OUT)) {
  const keep = new Set(done);
  const walk = (d, r = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`, r ? `${r}/${e.name}` : e.name) : [r ? `${r}/${e.name}` : e.name]));
  for (const rel of walk(OUT)) if (!keep.has(rel)) fs.rmSync(`${OUT}/${rel}`);
}
done.sort();
fs.writeFileSync(`${REPO}/src/ktx2Assets.js`, `// GENERATED by tools/make_ktx2_assets.mjs -- do not edit by hand.
// Asset paths (relative to assets/) with a KTX2 (Basis ETC1S) copy under assets/ktx2/.
// assetCache.assetURL() swaps these in on desktop once KTX2Loader is ready.
// Re-run the script after adding or replacing a Chicago / tree / prop / vehicle GLB.
export const KTX2_VARIANTS = new Set(${JSON.stringify(done, null, 2)});
`);
console.log(`${done.length} KTX2 variants (${nTex} textures, ${nSkip} kept as images): ${(srcBytes / 1e6).toFixed(1)} MB -> ${(outBytes / 1e6).toFixed(1)} MB`);
