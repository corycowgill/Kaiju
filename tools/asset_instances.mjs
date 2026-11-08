// Per-GLB instance / draw / triangle table for Chicago asset audits.
// Runs tools/smoke_test.mjs for the Chicago configs with SMOKE_ASSETS set,
// then folds its per-material rows onto the GLB files that own each material
// name (assets/buildings/chicago/*.glb). Names several files share
// (sign_panel, led_screen, window_glass...) are listed under "shared".
//   node tools/asset_instances.mjs [out.txt]   (THREE_DIR as for smoke_test)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(REPO, 'asset_instances.txt');
const tmp = path.join(os.tmpdir(), `smoke_assets_${process.pid}.jsonl`);
fs.rmSync(tmp, { force: true });
for (const cfg of [['desktop', 'high', 'chicago'], ['iphone', 'med', 'chicago'], ['iphone', 'low', 'chicago']]) {
  spawnSync(process.execPath, [path.join(REPO, 'tools/smoke_test.mjs'), '--run', ...cfg], { stdio: 'ignore', env: { ...process.env, SMOKE_ASSETS: tmp } });
}
const runs = fs.readFileSync(tmp, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// Material name -> GLB ids that contain it
const dir = path.join(REPO, 'assets/buildings/chicago');
const owners = new Map();
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.glb') || f.endsWith('_lod1.glb')) continue;
  const b = fs.readFileSync(path.join(dir, f));
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  for (const m of j.materials || []) {
    if (!owners.has(m.name)) owners.set(m.name, new Set());
    owners.get(m.name).add(f.replace('.glb', ''));
  }
}
const lines = [];
for (const r of runs) {
  const per = new Map(), shared = [];
  for (const row of r.rows) {
    const o = owners.get(row.material);
    if (!o) continue;
    if (o.size > 1) { shared.push(`${row.material} [${[...o].join(', ')}]: ${row.instancesVisible} vis / ${row.instancesHiddenLodTwin} lod-twin, ${row.draws} draws, ${(row.tris / 1e3).toFixed(1)}k tris`); continue; }
    const id = [...o][0];
    const e = per.get(id) || { inst: 0, hid: 0, draws: 0, tris: 0, mats: 0 };
    e.inst = Math.max(e.inst, row.instancesVisible); e.hid = Math.max(e.hid, row.instancesHiddenLodTwin);
    e.draws += row.draws; e.tris += row.tris; e.mats++;
    per.set(id, e);
  }
  lines.push(`== ${r.config}`, 'asset | instances visible | lod-twin copies (hidden) | draws | tris', ...[...per]
    .sort((a, b) => b[1].tris - a[1].tris)
    .map(([id, e]) => `${id} | ${e.inst} | ${e.hid} | ${e.draws} | ${(e.tris / 1e3).toFixed(1)}k`), '-- shared material names', ...shared, '');
}
fs.writeFileSync(out, lines.join('\n'));
fs.rmSync(tmp, { force: true });
console.log(`wrote ${out} (${runs.length} configs)`);
