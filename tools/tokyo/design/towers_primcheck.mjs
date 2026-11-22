// Per-primitive LOD0 / LOD1 bbox comparison (the game rejects a twin whose primitive boxes differ by > 8% of the model diagonal).
import fs from 'node:fs';
import { makeIO } from '../../lib/glb_opt.mjs';
const io = makeIO();
const boxes = async (f) => { const d = await io.read(f); return d.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).map((p) => { const a = p.getAttribute('POSITION'); return [a.getMin([]), a.getMax([])]; }); };
const dir = 'assets/buildings/tokyo/'; let bad = 0;
for (const id of process.argv.slice(2)) {
  const a = await boxes(dir + id + '.glb'), l = await boxes(dir + id + '_lod1.glb');
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const [mn, mx] of a) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mn[k]); hi[k] = Math.max(hi[k], mx[k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let worst = 0, where = '';
  for (let i = 0; i < a.length; i++) for (let s = 0; s < 2; s++) for (let k = 0; k < 3; k++) { const e = Math.abs(a[i][s][k] - l[i][s][k]) / diag; if (e > worst) { worst = e; where = `prim ${i} ${s ? 'max' : 'min'} ${'xyz'[k]} ${a[i][s][k].toFixed(1)} vs ${l[i][s][k].toFixed(1)}`; } }
  if (worst > 0.04) { bad++; console.log('FAIL', id, (worst * 100).toFixed(1) + '%', where); }
}
console.log('prim check done,', bad, 'failing (> 4% of diagonal)');
