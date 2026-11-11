// Round-trip check of the encoded pack against its WAV masters: length, peak (codec overshoot),
// loudness drift, DC, and for loops the step across the loop point relative to ordinary steps.
// usage: node tools/wrestling_sfx/verify.mjs [--wav dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUNDS } from './synth.mjs';
import { SR, decode, peak, db, loudness, rms } from './dsp.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const i = process.argv.indexOf('--wav');
const wavDir = path.resolve(i >= 0 ? process.argv[i + 1] : path.join(REPO, '../devtools/audio/wav'));
let bad = 0, worstPeak = -99, worstDrift = 0;
const flag = (m) => { bad++; console.log('  !! ' + m); };
for (const [name, def] of Object.entries(SOUNDS)) for (let v = 0; v < def.n; v++) {
  const base = def.n > 1 ? `${name}_${v + 1}` : name;
  const w = decode(path.join(wavDir, base + '.wav')), Lw = loudness(w).mmax;
  for (const ext of ['ogg', 'm4a']) {
    const f = path.join(REPO, 'assets/sfx', base + '.' + ext);
    if (!fs.existsSync(f)) { flag(`${base}.${ext} missing`); continue; }
    const x = decode(f), pk = db(peak(x)), drift = loudness(x).mmax - Lw, extra = x.length - w.length;
    let dc = 0; for (let k = 0; k < x.length; k++) dc += x[k]; dc /= x.length;
    worstPeak = Math.max(worstPeak, pk); worstDrift = Math.max(worstDrift, Math.abs(drift));
    let line = `${(base + '.' + ext).padEnd(26)} ${(fs.statSync(f).size / 1024).toFixed(0).padStart(4)} KB  len ${extra >= 0 ? '+' : ''}${extra} smp  peak ${pk.toFixed(1)}  dM ${drift.toFixed(2)} LU`;
    if (pk > -0.3) flag(`${base}.${ext} peaks at ${pk.toFixed(2)} dBFS`);
    if (Math.abs(drift) > 0.6) flag(`${base}.${ext} loudness drift ${drift.toFixed(2)} LU`);
    if (Math.abs(dc) > 0.004) flag(`${base}.${ext} DC ${dc}`);
    if (def.loop) {
      // the engine loops [start, start + L) where start skips codec priming when the decoder kept it
      const L = Math.round(def.loop * SR), start = x.length - L >= 1016 ? 1024 : 0;
      if (x.length < L) flag(`${base}.${ext} shorter than its loop`);
      let s = 0; for (let k = start + 1; k < start + L; k++) s += (x[k] - x[k - 1]) ** 2;
      const typ = Math.sqrt(s / L), seam = Math.abs(x[start] - x[start + L - 1]);
      // level either side of the seam (50 ms)
      const a = db(rms(x, start + L - 2205, start + L)), b = db(rms(x, start, start + 2205));
      line += `  loop seam step ${(seam / typ).toFixed(1)}x typical, level ${a.toFixed(1)} -> ${b.toFixed(1)} dB`;
      if (seam / typ > 6) flag(`${base}.${ext} loop seam step ${(seam / typ).toFixed(1)}x`);
    }
    if (def.loop || process.argv.includes('--all')) console.log(line);
  }
}
console.log(`worst decoded peak ${worstPeak.toFixed(2)} dBFS, worst loudness drift ${worstDrift.toFixed(2)} LU, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
