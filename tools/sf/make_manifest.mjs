// Write src/levels/sfManifest.js from the models on disk (assets/buildings/sf/*.glb): every entry's size comes
// from the file itself, so the manifest never names a model that is not there or a height the file does not have.
// Per-model notes from the modelling scripts (tools/sf/design/manifest_*.js: stone colours, face words, options,
// descriptions) are folded in when present.
// usage: node tools/sf/make_manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds } from '@gltf-transform/functions';
import { makeIO } from '../lib/glb_opt.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = `${REPO}/assets/buildings/sf`;
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
  const p = `${REPO}/tools/sf/design/manifest_${role}.js`;
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
const layout = JSON.parse(fs.readFileSync(`${REPO}/assets/levels/sf_layout.json`, 'utf8'));
const lmIds = new Set(layout.landmarks.map((l) => l.id));

const KIT_RE = /^sf_(victorian|brick|warehouse|lowrise|midrise|apartment|glassslab|glasstower)_[a-z]\.glb$/;
const VEHICLES = { sf_sedan: 12, sf_hatch_ev: 10, sf_suv: 10, sf_taxi: 6, sf_delivery_van: 4, sf_box_truck: 3, sf_bus: 3, sf_police: 3, sf_fire_engine: 1 };
const PROPS = /^sf_(streetlamp|streetlamp_cobra|traffic_signal|hydrant|bus_shelter|trash_can|newspaper_box|bench|cable_car_stop_sign|parking_meter|pier_pilings|waterfront_rail|bollard_chain|crab_stand|park_lamp)\.glb$/;
// One model, several sites
const MULTI = {
  'embarcadero_center.glb': /^embarcadero_center_\d$/, 'infinity_towers.glb': /^infinity_tower_\d$/, 'war_memorial.glb': /^war_memorial_/,
  'embarcadero_pier_shed.glb': /^pier_\d+$/,
};
// Style words a lot's style matches on (sf.js STYLE_OK), by the piece's family
const STYLE = { victorian: 'victorian lowrise', brick: 'brick masonry', warehouse: 'warehouse brick', lowrise: 'lowrise', midrise: 'midrise concrete', apartment: 'apartment midrise', glassslab: 'glassslab glass', glasstower: 'glasstower glass' };
const STONE = { victorian: '0xd8cdb8', brick: '0x8a4a3a', warehouse: '0x8a5a48', lowrise: '0xc8c0b0', midrise: '0xb8b2a6', apartment: '0xc4bcae', glassslab: '0x8f9aa4', glasstower: '0x8fa4b4' };

const landmarks = [], generic = [], props = [], vehicles = [], kit = [], debris = [], skipped = [];
for (const f of files) {
  const b = box[f], n = N(f), name = f.replace(/\.glb$/, ''), tail = n.comment ? ` // ${n.comment}` : '';
  if (/^debris_sf_/.test(f)) { debris.push(f); continue; }
  if (!hasLod(f)) { skipped.push(`${f} (no LOD1 twin)`); continue; }
  if (KIT_RE.test(f)) {
    const fam = f.match(KIT_RE)[1], hu = b.h * 0.2, bucket = hu >= 40 ? 'tall' : hu >= 18 ? 'medium' : hu >= 7 ? 'short' : 'low';
    generic.push(`  { file: '${f}', bucket: '${bucket}', style: ${n.style || `'${STYLE[fam]}'`}, trueM: [${b.w}, ${b.h}, ${b.d}], stone: ${n.stone || STONE[fam]}${n.share ? `, share: ${n.share}` : ''}${n.maxH ? `, maxH: ${n.maxH}` : ''}, ready: true },${tail}`);
    continue;
  }
  if (VEHICLES[name]) {
    const extra = name === 'sf_bus' ? ', parked: false, minRoadW: 6.5' : name === 'sf_police' ? ', lightBar: true, parked: false' : name === 'sf_fire_engine' ? ', parked: false, minRoadW: 6' : '';
    vehicles.push(`  { url: SF_BASE + '${f}', len: ${b.d}, weight: ${VEHICLES[name]}${extra}, ready: true },${tail}`);
    continue;
  }
  if (PROPS.test(f)) { props.push(`  { name: '${name}', file: '${f}', heightM: ${b.h}, ready: true },${tail}`); continue; }
  const multi = MULTI[f];
  const ids = multi ? [...lmIds].filter((id) => multi.test(id)).sort() : null;
  if (multi ? ids.length : lmIds.has(name)) {
    const opt = [];
    if (n.face && !/layout/.test(n.face)) opt.push(`face: ${n.face}`);
    if (f === 'embarcadero_pier_shed.glb' || n.fit) opt.push(`fit: 'footprint', stretch: ${n.stretch || 1.6}`);
    if (n.onWater === 'true' || /^pier_|balclutha|ships|ferry_building|exploratorium|aquarium|cruise/.test(name)) opt.push('onWater: true');
    if (n.waterline === 'true' || /balclutha|pier_45_ships/.test(name)) opt.push('waterline: true');
    if (n.stone) opt.push(`stone: ${n.stone}`);
    if (f === 'embarcadero_center.glb') {
      // (towers 1 and 4 stand 173 m: the model at true size; 2 and 3 are 126 m on wider lots: fitted to their outlines)
      const tall = ids.filter((i) => /_[14]$/.test(i)), low = ids.filter((i) => /_[23]$/.test(i)), o = opt.length ? opt.join(', ') + ', ' : '';
      landmarks.push(`  { id: 'embarcadero_center', ids: [${tall.map((i) => `'${i}'`).join(', ')}], file: '${f}', trueHeightM: ${b.h}, ${o}ready: true }, // ${b.w} x ${b.d} m${n.comment ? '; ' + n.comment : ''}`);
      landmarks.push(`  { id: 'embarcadero_center_low', ids: [${low.map((i) => `'${i}'`).join(', ')}], file: '${f}', trueHeightM: ${b.h}, ${o}fit: 'footprint', maxH: 1, stretch: 1.4, ready: true },`);
      continue;
    }
    landmarks.push(`  { id: '${name}', ${ids ? `ids: [${ids.map((i) => `'${i}'`).join(', ')}], ` : ''}file: '${f}', trueHeightM: ${b.h}, ${opt.length ? opt.join(', ') + ', ' : ''}ready: true }, // ${b.w} x ${b.d} m${n.comment ? '; ' + n.comment : ''}`);
    continue;
  }
  kit.push(`  ${name}: { file: '${f}', heightM: ${b.h}, ready: true }, // ${b.w} x ${b.h} x ${b.d} m${n.comment ? '; ' + n.comment : ''}`);
}
const out = `// GENERATED by tools/sf/make_manifest.mjs from the files in assets/buildings/sf/ -- re-run it after adding or replacing a model.
// San Francisco asset manifest (read by src/levels/sf.js). Same fields as seattleManifest.js.
// Models: Blender builds at true size (tools/sf/design/): metres, Y up, base y = 0, centred on the lot, front +Z, a LOD1 twin each.
export const SF_BASE = './assets/buildings/sf/';

// id: the landmark id in assets/levels/sf_layout.json (ids: several sites, one model). trueHeightM: the model's
// bbox height incl. spires. face: a compass word for the model's +Z front; left out, the front follows the layout's
// own frontDir for the landmark. fit 'footprint' (+ stretch): fill the layout outline. onWater: on a pier or afloat.
// waterline: y 0 is the water surface. stone: debris tint.
export const SF_LANDMARK_GLBS = [
${landmarks.join('\n')}
];

// Generic blocks by height bucket (game units: low < 7, short 7-18, medium 18-40, tall > 40).
// { file, bucket, style, trueM [w, h, d], stone, share?, maxH?, ready }
export const SF_GENERIC_GLBS = [
${generic.join('\n')}
];

// Street props: { name, file, heightM, ready } (front +Z, metres)
export const SF_PROP_GLBS = [
${props.join('\n')}
];

// Extra traffic: { url, len, weight, parked?, minRoadW?, ready }
export const SF_VEHICLE_GLBS = [
${vehicles.join('\n')}
];

// Kit pieces placed by sf.js: the cable cars and streetcars, the ferries and ships (y 0 = the waterline, bow +Z),
// the Bay Bridge parts, the far set pieces (Alcatraz, Sutro Tower, the Golden Gate Bridge).
export const SF_KIT_GLBS = {
${kit.join('\n')}
};

// Debris for wrecked San Francisco buildings (urls), used instead of the shared concrete kit when listed.
export const SF_DEBRIS_GLBS = [
${debris.map((f) => `  '${f}',`).join('\n')}
].map((f) => SF_BASE + f);
`;
fs.writeFileSync(`${REPO}/src/levels/sfManifest.js`, out);
const have = new Set(landmarks.flatMap((l) => [...l.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])));
const missing = layout.landmarks.filter((l) => l.kind !== 'district' && l.kind !== 'line' && !have.has(l.id)).map((l) => l.id);
console.log(`${landmarks.length} landmark models, ${generic.length} kit pieces, ${props.length} props, ${vehicles.length} vehicles, ${kit.length} kit objects, ${debris.length} debris`);
if (skipped.length) console.log('skipped:', skipped.join(', '));
console.log(`landmarks without a model (${missing.length}):`, missing.join(', '));
