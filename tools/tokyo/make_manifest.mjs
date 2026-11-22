// Write src/levels/tokyoManifest.js from the models on disk (assets/buildings/tokyo/*.glb): every entry's size comes
// from the file itself, so the manifest never names a model that is not there or a height the file does not have.
// Per-model notes from the modelling scripts (tools/tokyo/design/manifest_*.js: stone colours, face words, options,
// descriptions) are folded in when present.
// usage: node tools/tokyo/make_manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds } from '@gltf-transform/functions';
import { makeIO } from '../lib/glb_opt.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = `${REPO}/assets/buildings/tokyo`;
const io = makeIO();
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.glb') && !f.endsWith('_lod1.glb')).sort();
const hasLod = (f) => fs.existsSync(`${DIR}/${f.replace(/\.glb$/, '_lod1.glb')}`);
const r1 = (v) => Math.round(v * 10) / 10;
const box = {};
for (const f of files) {
  const doc = await io.read(`${DIR}/${f}`);
  const b = getBounds(doc.getRoot().listScenes()[0]);
  box[f] = { w: r1(b.max[0] - b.min[0]), h: r1(b.max[1] - b.min[1]), d: r1(b.max[2] - b.min[2]), y0: r1(b.min[1]) };
}
// Notes from the modellers' manifests: the object literal text per file / id, and its trailing comment
const notes = {};
for (const role of ['towers', 'icons', 'kit', 'far']) {
  const p = `${REPO}/tools/tokyo/design/manifest_${role}.js`;
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const file = line.match(/([a-z0-9_]+\.glb)/)?.[1];
    if (!file) continue;
    const get = (k) => line.match(new RegExp(`\\b${k}:\\s*('[^']*'|\\[[^\\]]*\\]|0x[0-9a-fA-F]+|true|false|[\\d.]+)`))?.[1];
    notes[file] = { style: get('style'), stone: get('stone'), face: get('face'), share: get('share'), maxH: get('maxH'), weight: get('weight'), fit: get('fit'), stretch: get('stretch'),
      onWater: get('onWater'), waterline: get('waterline'), ids: get('ids'), comment: line.includes('//') ? line.slice(line.indexOf('//') + 2).trim() : '' };
  }
}
const N = (f) => notes[f] || {};
const layout = JSON.parse(fs.readFileSync(`${REPO}/assets/levels/tokyo_layout.json`, 'utf8'));
const lmIds = new Set(layout.landmarks.map((l) => l.id));

const KIT_RE = /^tokyo_(house|zakkyo|apartment|lowrise|midrise|warehouse|glassslab|glasstower)_[a-z]\.glb$/;
const VEHICLES = { tokyo_kei_car: 12, tokyo_sedan: 10, tokyo_minivan: 8, tokyo_taxi: 10, tokyo_taxi_classic: 3, tokyo_kei_van: 6, tokyo_kei_truck: 6, tokyo_delivery_truck: 4, tokyo_bus: 3, tokyo_police: 2, tokyo_fire_engine: 1 };
const PROPS = /^tokyo_(streetlamp|streetlamp_ginza|utility_pole|traffic_signal|pedestrian_signal|vending_machine|koban|bus_stop|guard_rail|torii|stone_lantern|mailbox|bicycle_rack|subway_entrance|yatai|bench|pier_pilings|waterfront_rail|park_lamp|billboard_roof)\.glb$/;
// One model, several sites
const MULTI = {
  'gran_tokyo.glb': /^gran_tokyo_/, 'the_tokyo_towers.glb': /^the_tokyo_towers_/, 'river_city_21.glb': /^river_city_21_/,
};
// Style words a lot's style matches on (sf.js STYLE_OK), by the piece's family
const STYLE = { house: 'house', zakkyo: 'zakkyo', apartment: 'apartment', lowrise: 'lowrise', midrise: 'midrise', warehouse: 'warehouse', glassslab: 'glassslab', glasstower: 'glasstower' };
const STONE = { house: '0xb8a890', zakkyo: '0xc0bab0', apartment: '0xc4beb2', lowrise: '0xbcb4a6', midrise: '0xb0aca4', warehouse: '0x9a9690', glassslab: '0x8f9aa4', glasstower: '0x8fa4b4' };

const landmarks = [], generic = [], props = [], vehicles = [], kit = [], debris = [], skipped = [];
for (const f of files) {
  const b = box[f], n = N(f), name = f.replace(/\.glb$/, ''), tail = n.comment ? ` // ${n.comment}` : '';
  if (/^debris_tokyo_/.test(f)) { debris.push(f); continue; }
  if (!hasLod(f)) { skipped.push(`${f} (no LOD1 twin)`); continue; }
  if (KIT_RE.test(f)) {
    const fam = f.match(KIT_RE)[1], hu = b.h * 0.2, bucket = hu >= 40 ? 'tall' : hu >= 18 ? 'medium' : hu >= 7 ? 'short' : 'low';
    generic.push(`  { file: '${f}', bucket: '${bucket}', style: ${n.style || `'${STYLE[fam]}'`}, trueM: [${b.w}, ${b.h}, ${b.d}], stone: ${n.stone || STONE[fam]}${n.share ? `, share: ${n.share}` : ''}${n.maxH ? `, maxH: ${n.maxH}` : ''}, ready: true },${tail}`);
    continue;
  }
  if (VEHICLES[name]) {
    const extra = name === 'tokyo_bus' ? ', parked: false, minRoadW: 6.5' : name === 'tokyo_police' ? ', lightBar: true, parked: false' : name === 'tokyo_fire_engine' ? ', parked: false, minRoadW: 6' : '';
    vehicles.push(`  { url: TOKYO_BASE + '${f}', len: ${b.d}, weight: ${VEHICLES[name]}${extra}, ready: true },${tail}`);
    continue;
  }
  if (PROPS.test(f)) { props.push(`  { name: '${name}', file: '${f}', heightM: ${b.h}, ready: true },${tail}`); continue; }
  const multi = MULTI[f];
  const ids = multi ? [...lmIds].filter((id) => multi.test(id)).sort() : null;
  if (multi ? ids.length : lmIds.has(name)) {
    const opt = [];
    if (n.face && !/layout/.test(n.face)) opt.push(`face: ${n.face}`);
    if (n.fit) opt.push(`fit: 'footprint', stretch: ${n.stretch || 1.6}`);
    if (n.onWater === 'true' || /bridge|statue_of_liberty/.test(name)) opt.push('onWater: true');
    if (n.waterline === 'true' || /^$/.test(name)) opt.push('waterline: true');
    if (n.stone) opt.push(`stone: ${n.stone}`);
    landmarks.push(`  { id: '${name}', ${ids ? `ids: [${ids.map((i) => `'${i}'`).join(', ')}], ` : ''}file: '${f}', trueHeightM: ${b.h}, ${opt.length ? opt.join(', ') + ', ' : ''}ready: true }, // ${b.w} x ${b.d} m${n.comment ? '; ' + n.comment : ''}`);
    continue;
  }
  kit.push(`  ${name}: { file: '${f}', heightM: ${b.h}, ready: true }, // ${b.w} x ${b.h} x ${b.d} m${n.comment ? '; ' + n.comment : ''}`);
}
const out = `// GENERATED by tools/tokyo/make_manifest.mjs from the files in assets/buildings/tokyo/ -- re-run it after adding or replacing a model.
// Tokyo asset manifest (read by src/levels/tokyo.js). Same fields as seattleManifest.js.
// Models: Blender builds at true size (tools/tokyo/design/): metres, Y up, base y = 0, centred on the lot, front +Z, a LOD1 twin each.
export const TOKYO_BASE = './assets/buildings/tokyo/';

// id: the landmark id in assets/levels/tokyo_layout.json (ids: several sites, one model). trueHeightM: the model's
// bbox height incl. spires. face: a compass word for the model's +Z front; left out, the front follows the layout's
// own frontDir for the landmark. fit 'footprint' (+ stretch): fill the layout outline. onWater: on a pier or afloat.
// waterline: y 0 is the water surface. stone: debris tint.
export const TOKYO_LANDMARK_GLBS = [
${landmarks.join('\n')}
];

// Generic blocks by height bucket (game units: low < 7, short 7-18, medium 18-40, tall > 40).
// { file, bucket, style, trueM [w, h, d], stone, share?, maxH?, ready }
export const TOKYO_GENERIC_GLBS = [
${generic.join('\n')}
];

// Street props: { name, file, heightM, ready } (front +Z, metres)
export const TOKYO_PROP_GLBS = [
${props.join('\n')}
];

// Extra traffic: { url, len, weight, parked?, minRoadW?, ready }
export const TOKYO_VEHICLE_GLBS = [
${vehicles.join('\n')}
];

// Kit pieces placed by sf.js: the trains (y 0 = the rail top), the water buses and ships
// (y 0 = the waterline, bow +Z), the expressway and viaduct pieces, the container crane.
export const TOKYO_KIT_GLBS = {
${kit.join('\n')}
};

// Debris for wrecked Tokyo buildings (urls), used instead of the shared concrete kit when listed.
export const TOKYO_DEBRIS_GLBS = [
${debris.map((f) => `  '${f}',`).join('\n')}
].map((f) => TOKYO_BASE + f);
`;
fs.writeFileSync(`${REPO}/src/levels/tokyoManifest.js`, out);
const have = new Set(landmarks.flatMap((l) => [...l.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])));
const missing = layout.landmarks.filter((l) => l.kind !== 'district' && l.kind !== 'line' && !have.has(l.id)).map((l) => l.id);
console.log(`${landmarks.length} landmark models, ${generic.length} kit pieces, ${props.length} props, ${vehicles.length} vehicles, ${kit.length} kit objects, ${debris.length} debris`);
if (skipped.length) console.log('skipped:', skipped.join(', '));
console.log(`landmarks without a model (${missing.length}):`, missing.join(', '));
