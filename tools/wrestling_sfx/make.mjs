// Render the wrestling sound pack (synth.mjs) and encode it into assets/sfx/ as OGG + M4A.
// usage: node tools/wrestling_sfx/make.mjs [--only substr] [--wav dir] [--no-encode]
//   --wav: where the 16-bit masters go (default ../devtools/audio/wav, outside the repo)
// Pipeline per clip: render (seeded) -> DC check -> level (momentary-max LUFS, or peak for
// the sub layers) -> lookahead limit to -1.5 dBFS -> WAV -> libvorbis q3 + AAC 96k.
// Loops are written at their exact loop length (no fades); the lengths printed at the end
// go into LOOP_SAMPLES in src/audio.js. Needs ffmpeg on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUNDS } from './synth.mjs';
import { SR, N, rng, peak, db, lin, gainBuf, levelTo, limit, loudness, writeWav, ffmpeg, hp } from './dsp.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const only = opt('only', '');
const wavDir = path.resolve(opt('wav', path.join(REPO, '../devtools/audio/wav')));
const outDir = path.join(REPO, 'assets/sfx');
fs.mkdirSync(wavDir, { recursive: true });

const loops = {};
for (const [name, def] of Object.entries(SOUNDS)) {
  if (only && !only.split(',').some((o) => name.includes(o))) continue;
  for (let v = 0; v < def.n; v++) {
    const base = def.n > 1 ? `${name}_${v + 1}` : name;
    const t0 = Date.now();
    let x = def.make(rng(def.seed + v * 7919), v);
    if (def.loop) {
      if (x.length !== N(def.loop)) throw new Error(`${base}: loop is ${x.length} samples, expected ${N(def.loop)}`);
      loops[name] = x.length;
    } else {
      // drop the inaudible tail (below -66 dB of peak), keep 30 ms and fade it
      const thr = peak(x) * lin(-66);
      let end = x.length - 1;
      while (end > 0 && Math.abs(x[end]) < thr) end--;
      x = x.slice(0, Math.min(x.length, end + N(0.03)));
      const f = Math.min(N(0.03), x.length);
      for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
    }
    let pre = 0;
    if (def.peakDb !== undefined) gainBuf(x, lin(def.peakDb) / peak(x));
    else {
      // Level, then shave what sticks out: a soft clip from -7.5 dBFS up to the ceiling (transparent
      // below the knee) takes the first few dB off a transient the way a clipped drum bus
      // does; the lookahead limiter only catches what is left. Two passes converge on the target.
      for (let pass = 0; pass < 3; pass++) {
        levelTo(x, def.lufs);
        pre = Math.max(pre, peak(x));
        if (def.loop) break;
        const T = lin(-7.5), C = lin(-1.5);
        for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > T) x[i] = Math.sign(x[i]) * (T + (C - T) * Math.tanh((a - T) / (C - T))); }
      }
    }
    x = limit(x, -1.5);
    const L = loudness(x);
    const wav = path.join(wavDir, base + '.wav');
    writeWav(wav, x);
    if (!args.includes('--no-encode')) {
      ffmpeg(['-i', wav, '-c:a', 'libvorbis', '-q:a', '3', '-ac', '1', path.join(outDir, base + '.ogg')]);
      ffmpeg(['-i', wav, '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', path.join(outDir, base + '.m4a')]);
    }
    console.log(`${base.padEnd(22)} ${(x.length / SR).toFixed(2).padStart(5)} s  M ${L.mmax.toFixed(1)} LUFS  peak ${db(peak(x)).toFixed(1)} dBFS` +
      `${pre > lin(-1.5) ? `  (peaks shaved ${(db(pre) + 1.5).toFixed(1)} dB)` : ''}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
if (Object.keys(loops).length) console.log('LOOP_SAMPLES', JSON.stringify(loops));

// Entrance / victory themes: 12 s of each kaiju's existing battle score (assets/music/score_*),
// cut from its action-drop hit, 30 ms fade in, 2 s fade out. Stereo, level untouched (-15.5 LUFS).
const THEMES = { gorrak: 15.55, tridon: 14.95, mechra: 16.45 };
if (!args.includes('--no-encode') && (!only || only.includes('theme'))) {
  for (const [k, ss] of Object.entries(THEMES)) {
    const src = path.join(REPO, `assets/music/score_${k}.ogg`), out = path.join(REPO, `assets/music/wr_theme_${k}`);
    const af = 'afade=t=in:st=0:d=0.03,afade=t=out:st=10:d=2';
    ffmpeg(['-ss', String(ss), '-t', '12', '-i', src, '-af', af, '-c:a', 'libvorbis', '-q:a', '4', out + '.ogg']);
    ffmpeg(['-ss', String(ss), '-t', '12', '-i', src, '-af', af, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out + '.m4a']);
    console.log(`wr_theme_${k}  12.00 s from ${ss} s`);
  }
}
