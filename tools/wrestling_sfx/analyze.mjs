// Level / spectrum / envelope report for audio files (any format ffmpeg reads).
// usage: node tools/wrestling_sfx/analyze.mjs [--json] file...
import path from 'node:path';
import { decode, report } from './dsp.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const rows = args.filter((a) => !a.startsWith('--')).map((f) => report(path.basename(f), decode(f)));
if (json) console.log(JSON.stringify(rows, null, 1));
else {
  const cols = ['name', 'dur', 'peakDb', 'mmax', 'integ', 'crest', 'tPeak', 't20', 't40', 'sub', 'bass', 'lowmid', 'mid', 'pres', 'air', 'centroid', 'dc', 'first', 'last', 'env'];
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join(' '));
  for (const r of rows) console.log(cols.map((c, i) => String(r[c]).padEnd(w[i])).join(' '));
}
