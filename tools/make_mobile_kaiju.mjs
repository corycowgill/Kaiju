// Phone copies (assets/m/kaiju_model/<id>.glb) of just the TRELLIS kaiju, the same way
// tools/make_mobile_assets.mjs builds every phone copy (1024 px textures for the kaiju),
// without regenerating the rest of assets/m. Adds them to src/mobileAssets.js if missing.
// usage: node tools/make_mobile_kaiju.mjs [id ...]   then node tools/make_asset_manifest.mjs
import { Logger } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIO, optimizeTextures, compressGeometry } from './lib/glb_opt.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['cindervault', 'brineveil', 'rimehorn', 'vesperax', 'thornwake', 'ferrumaw'];
const PHONE = { texelsPerUnit: 10, floor: 128, heroCap: 1024, cap: 512 };
const io = makeIO();
const listFile = path.join(REPO, 'src/mobileAssets.js');
let list = fs.readFileSync(listFile, 'utf8');
for (const id of IDS) {
  const rel = `kaiju_model/${id}.glb`;
  const doc = await io.read(path.join(REPO, 'assets', rel));
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const log = await optimizeTextures(doc, rel, PHONE);
  await compressGeometry(doc, rel);
  const bin = await io.writeBinary(doc);
  const out = path.join(REPO, 'assets/m', rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bin);
  console.log(`${rel}: ${(fs.statSync(path.join(REPO, 'assets', rel)).size / 1e6).toFixed(2)} MB -> ${(bin.byteLength / 1e6).toFixed(2)} MB\n  ${log.join('\n  ')}`);
  if (!list.includes(`"${rel}"`)) {
    // keep the generated list sorted
    const entries = [...list.matchAll(/^  "([^"]+)",$/gm)].map((m) => m[1]);
    const next = entries.find((e) => e > rel);
    list = next ? list.replace(`  "${next}",`, `  "${rel}",\n  "${next}",`) : list.replace(/\n\]\);/, `\n  "${rel}",\n]);`);
  }
}
fs.writeFileSync(listFile, list);
