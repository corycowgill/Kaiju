// Small offline DSP kit for the wrestling sound generator (tools/wrestling_sfx/make.mjs)
// and its analyser. Plain Node, no dependencies. Everything is mono Float64Array at SR.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const SR = 44100;
export const TAU = Math.PI * 2;
export const N = (sec) => Math.round(sec * SR);
export const buf = (sec) => new Float64Array(N(sec));
export const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
export const lin = (d) => Math.pow(10, d / 20);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic RNG (mulberry32): the same seed always renders the same sound. */
export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.bi = () => r() * 2 - 1;
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  // approx normal(0, 1)
  r.gauss = () => (r() + r() + r() + r() + r() + r() - 3) * Math.SQRT2;
  return r;
}

export function noise(sec, r) {
  const o = buf(sec);
  for (let i = 0; i < o.length; i++) o[i] = r() * 2 - 1;
  return o;
}

// ---- mixing helpers ----
/** dst += src * gain, starting at `at` seconds (grows nothing: clips to dst length). */
export function mixInto(dst, src, at = 0, gain = 1) {
  const o = Math.round(at * SR);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
  return dst;
}
export function gainBuf(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
export function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
export function normalize(x, pk = 1) { const p = peak(x); if (p > 0) gainBuf(x, pk / p); return x; }
export function concatPad(x, sec) { const o = new Float64Array(x.length + N(sec)); o.set(x); return o; }

/** Multiply by an envelope function of time (seconds). */
export function env(x, fn) { for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR); return x; }
/** Attack (linear, s) then exponential decay with time constant tau (s). */
export const adExp = (att, tau) => (t) => (t < att ? t / att : Math.exp(-(t - att) / tau));
/** Raised-cosine fades at both ends (seconds). */
export function fade(x, fin = 0.003, fout = 0.02) {
  const a = N(fin), b = N(fout);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  return x;
}

// ---- filters ----
/** RBJ biquad coefficients, normalised (a0 = 1). */
export function biquad(type, f, q = 0.7071, gainDb = 0) {
  const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case 'hp': b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break; // 0 dB peak
    case 'notch': b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; break;
    case 'loshelf': {
      const k = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * c + k); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - k);
      a0 = (A + 1) + (A - 1) * c + k; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - k; break;
    }
    case 'hishelf': {
      const k = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * c + k); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - k);
      a0 = (A + 1) - (A - 1) * c + k; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - k; break;
    }
    default: throw new Error('biquad type ' + type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/** Run a biquad over x (returns a new array). */
export function filt(x, co) {
  const [b0, b1, b2, a1, a2] = co;
  const o = new Float64Array(x.length);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    o[i] = y;
  }
  return o;
}
export const lp = (x, f, q = 0.7071) => filt(x, biquad('lp', f, q));
export const hp = (x, f, q = 0.7071) => filt(x, biquad('hp', f, q));
export const bp = (x, f, q = 1) => filt(x, biquad('bp', f, q));
export const peakEq = (x, f, q, g) => filt(x, biquad('peak', f, q, g));
export const shelfLo = (x, f, g) => filt(x, biquad('loshelf', f, 0.7071, g));
export const shelfHi = (x, f, g) => filt(x, biquad('hishelf', f, 0.7071, g));
/** 4th-order (two cascaded) versions for steeper band limits. */
export const lp4 = (x, f) => lp(lp(x, f, 0.541), f, 1.307);
export const hp4 = (x, f) => hp(hp(x, f, 0.541), f, 1.307);

/**
 * Zero-delay state-variable filter with a time-varying cutoff.
 * fc: Hz or (tSec) => Hz, q: number or fn, mode: 'lp' | 'bp' | 'hp'. bp is unity gain at fc.
 */
export function svf(x, fc, q = 1, mode = 'lp') {
  const o = new Float64Array(x.length);
  const fcf = typeof fc === 'function' ? fc : () => fc;
  const qf = typeof q === 'function' ? q : () => q;
  let ic1 = 0, ic2 = 0, g = 0, k = 1, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      g = Math.tan(Math.PI * clamp(fcf(t), 10, SR * 0.45) / SR);
      k = 1 / Math.max(0.05, qf(t));
      a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    o[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 * k : x[i] - k * v1 - v2;
  }
  return o;
}

/** One-pole DC blocker. */
export function dcBlock(x, f = 20) { return hp(x, f, 0.7071); }

/** tanh saturation with drive; output roughly level-matched for small signals. */
export function sat(x, drive = 2) {
  const o = new Float64Array(x.length), n = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) o[i] = Math.tanh(x[i] * drive) / n;
  return o;
}

// ---- oscillators ----
/** Sine with a frequency function f(t) and optional amplitude function. */
export function sine(sec, f, amp = 1, phase0 = 0) {
  const o = buf(sec);
  const ff = typeof f === 'function' ? f : () => f;
  const af = typeof amp === 'function' ? amp : () => amp;
  let ph = phase0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = Math.sin(ph) * af(t);
    ph += TAU * ff(t) / SR;
  }
  return o;
}
/** Band-limited-ish sawtooth (polyBLEP) with a frequency function. */
export function saw(sec, f, phase0 = 0) {
  const o = buf(sec);
  const ff = typeof f === 'function' ? f : () => f;
  let ph = phase0 % 1;
  for (let i = 0; i < o.length; i++) {
    const dt = ff(i / SR) / SR;
    let v = 2 * ph - 1;
    if (ph < dt) { const t = ph / dt; v -= t + t - t * t - 1; }
    else if (ph > 1 - dt) { const t = (ph - 1) / dt; v -= t * t + t + t + 1; }
    o[i] = v;
    ph += dt; if (ph >= 1) ph -= 1;
  }
  return o;
}

/** Resample x with a time-varying rate(t) (cubic interpolation). outSec: output length. */
export function varispeed(x, rate, outSec) {
  const rf = typeof rate === 'function' ? rate : () => rate;
  const o = buf(outSec);
  let p = 0;
  for (let i = 0; i < o.length; i++) {
    const k = Math.floor(p), f = p - k;
    if (k + 2 >= x.length) break;
    const xm = x[k - 1] || 0, x0 = x[k], x1 = x[k + 1], x2 = x[k + 2];
    o[i] = x0 + 0.5 * f * (x1 - xm + f * (2 * xm - 5 * x0 + 4 * x1 - x2 + f * (3 * (x0 - x1) + x2 - xm)));
    p += rf(i / SR);
  }
  return o;
}

// ---- FFT (iterative radix-2, in place on re/im Float64Arrays) ----
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? TAU : -TAU) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

/** Full convolution of x with impulse response h (FFT). */
export function convolve(x, h) {
  const n = pow2(x.length + h.length);
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  return ar.subarray(0, x.length + h.length - 1);
}

/**
 * Open-air "arena / city" space: a few discrete slap echoes off the skyline plus a
 * short diffuse tail. Returns dry + wet, extended by the tail. Deterministic per seed.
 */
export function space(x, { wet = 0.25, tail = 0.9, slap = 0.11, bright = 5000, seed = 7, pre = 0.012 } = {}) {
  const r = rng(seed);
  const h = buf(tail + slap * 3 + 0.05);
  // diffuse tail: decaying noise, -60 dB at `tail`
  const tau = tail / 6.9;
  for (let i = N(pre); i < h.length; i++) { const t = i / SR - pre; h[i] = r.bi() * Math.exp(-t / tau) * 0.5; }
  // discrete slaps (building faces at different distances)
  for (let k = 1; k <= 3; k++) {
    const at = N(slap * k * r.range(0.85, 1.2));
    if (at < h.length) h[at] += (k % 2 ? 1 : -1) * 0.9 / (k * 1.3);
  }
  let hh = lp(h, bright); hh = hp(hh, 180);
  // unit energy so `wet` means the same thing for every IR
  let e = 0; for (let i = 0; i < hh.length; i++) e += hh[i] * hh[i];
  gainBuf(hh, 1 / Math.sqrt(e));
  const w = convolve(x, hh);
  const o = new Float64Array(w.length);
  o.set(x);
  for (let i = 0; i < w.length; i++) o[i] += w[i] * wet;
  return o;
}

// ---- loudness (ITU-R BS.1770 K-weighting) ----
const K_SHELF = (() => {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan(Math.PI * f0 / SR), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
})();
const K_HP = (() => {
  const f0 = 38.13547087602444, Q = 0.5003270373238773;
  const K = Math.tan(Math.PI * f0 / SR), a0 = 1 + K / Q + K * K;
  return [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
})();
export function kWeight(x) { return filt(filt(x, K_SHELF), K_HP); }
/** { mmax: momentary max (400 ms window, 100 ms hop), integ: ungated whole-clip, smax: short-term (3 s) max } in LUFS. */
export function loudness(x) {
  const k = kWeight(x);
  const sq = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) sq[i + 1] = sq[i] + k[i] * k[i];
  const win = (len) => {
    const w = N(len), hop = N(0.1);
    let best = 0;
    if (k.length <= w) best = sq[k.length] / w; // a clip shorter than the window is measured zero-padded
    else for (let a = 0; a + w <= k.length; a += hop) best = Math.max(best, (sq[a + w] - sq[a]) / w);
    return -0.691 + 10 * Math.log10(Math.max(1e-12, best));
  };
  return { mmax: win(0.4), smax: win(3), integ: -0.691 + 10 * Math.log10(Math.max(1e-12, sq[k.length] / k.length)) };
}
/** Scale x so its momentary-max loudness is `lufs`. */
export function levelTo(x, lufs) { return gainBuf(x, lin(lufs - loudness(x).mmax)); }

/** Lookahead peak limiter (5 ms lookahead, release s). Keeps |x| <= ceil. */
export function limit(x, ceilDb = -1, release = 0.08) {
  const ceil = lin(ceilDb), la = N(0.005), n = x.length, o = new Float64Array(n);
  const rel = Math.exp(-1 / (release * SR));
  // gain needed at each sample -> minimum over the next `la` samples -> moving average of
  // that over the last `la` (a smooth attack that is still <= the needed gain at every sample)
  const mn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let j = i; j < Math.min(n, i + la); j++) { const a = Math.abs(x[j]); if (a > ceil && ceil / a < m) m = ceil / a; }
    mn[i] = m;
  }
  let acc = 0, g = 1;
  for (let i = 0; i < n; i++) {
    acc += mn[i]; if (i >= la) acc -= mn[i - la];
    const avg = acc / Math.min(i + 1, la);
    g = Math.min(avg, 1 - (1 - g) * rel);
    o[i] = x[i] * g;
  }
  return o;
}

// ---- spectrum / envelope analysis ----
export const BANDS = [['sub', 20, 60], ['bass', 60, 150], ['lowmid', 150, 400], ['mid', 400, 2000], ['pres', 2000, 6000], ['air', 6000, 20000]];
/** Welch power spectrum summary: band energy shares (dB re total), centroid Hz, 85 % rolloff Hz, DC. */
export function spectrum(x) {
  const n = 4096, hop = 2048, pw = new Float64Array(n / 2);
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(TAU * i / n);
  const re = new Float64Array(n), im = new Float64Array(n);
  let frames = 0;
  for (let a = 0; a < Math.max(1, x.length - n + hop); a += hop) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < n && a + i < x.length; i++) re[i] = x[a + i] * win[i];
    fft(re, im);
    for (let i = 0; i < n / 2; i++) pw[i] += re[i] * re[i] + im[i] * im[i];
    frames++;
  }
  let tot = 0, cen = 0;
  for (let i = 1; i < n / 2; i++) { tot += pw[i]; cen += pw[i] * i * SR / n; }
  const bands = {};
  for (const [name, lo, hi] of BANDS) {
    let s = 0;
    for (let i = Math.max(1, Math.ceil(lo * n / SR)); i < Math.min(n / 2, Math.ceil(hi * n / SR)); i++) s += pw[i];
    bands[name] = +(10 * Math.log10(Math.max(1e-12, s / (tot || 1)))).toFixed(1);
  }
  let acc = 0, roll = 0;
  for (let i = 1; i < n / 2; i++) { acc += pw[i]; if (acc >= 0.85 * tot) { roll = i * SR / n; break; } }
  let dc = 0; for (let i = 0; i < x.length; i++) dc += x[i];
  // strongest spectral peaks (for tonal sounds)
  const peaks = [];
  for (let i = 2; i < n / 2 - 2; i++) if (pw[i] > pw[i - 1] && pw[i] > pw[i + 1] && pw[i] > pw[i - 2] && pw[i] > pw[i + 2]) peaks.push([pw[i], i * SR / n]);
  peaks.sort((a, b) => b[0] - a[0]);
  return { bands, centroid: Math.round(cen / (tot || 1)), rolloff85: Math.round(roll), dc: dc / Math.max(1, x.length), frames,
    peaks: peaks.slice(0, 6).map((p) => Math.round(p[1])) };
}
/** RMS envelope in `ms` blocks (dBFS array). */
export function envelope(x, ms = 10) {
  const w = N(ms / 1000), o = [];
  for (let a = 0; a < x.length; a += w) o.push(db(rms(x, a, Math.min(x.length, a + w))));
  return o;
}
/** Envelope facts: time to peak block, time from the peak until it stays 20 / 40 dB down, crest factor. */
export function shape(x) {
  const e = envelope(x, 5), pk = Math.max(...e), ip = e.indexOf(pk);
  const lastAbove = (d) => { for (let i = e.length - 1; i >= ip; i--) if (e[i] > pk - d) return (i - ip + 1) * 0.005; return 0; };
  const p = peak(x), r = rms(x);
  return { dur: +(x.length / SR).toFixed(3), tPeak: +(ip * 0.005).toFixed(3), t20: +lastAbove(20).toFixed(3), t40: +lastAbove(40).toFixed(3),
    peakDb: +db(p).toFixed(2), rmsDb: +db(r).toFixed(1), crest: +(db(p) - db(r)).toFixed(1) };
}
/** Click risk: first / last sample level and the largest sample-to-sample step relative to peak. */
export function edges(x) {
  let step = 0, at = 0;
  for (let i = 1; i < x.length; i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > step) { step = d; at = i; } }
  return { first: +db(Math.abs(x[0])).toFixed(1), last: +db(Math.abs(x[x.length - 1])).toFixed(1), maxStep: +step.toFixed(4), maxStepAt: +(at / SR).toFixed(4) };
}
/** Text sparkline of the envelope (dB range floor..0 relative to its own peak). */
export function spark(x, cols = 48, floor = -48) {
  const chars = ' .:-=+*#%@';
  const w = Math.max(1, Math.floor(x.length / cols)), pk = db(peak(x));
  let s = '';
  for (let c = 0; c < cols; c++) {
    const a = c * w; if (a >= x.length) break;
    let m = 0; for (let i = a; i < Math.min(x.length, a + w); i++) m = Math.max(m, Math.abs(x[i]));
    const d = db(m) - pk;
    s += chars[clamp(Math.round((1 - d / floor) * (chars.length - 1)), 0, chars.length - 1)];
  }
  return s;
}

// ---- files ----
export function writeWav(path, chans, sr = SR) {
  const ch = Array.isArray(chans) ? chans : [chans];
  const n = ch[0].length, b = Buffer.alloc(44 + n * ch.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch.length, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * ch.length * 2, 28); b.writeUInt16LE(ch.length * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * ch.length * 2, 40);
  // TPDF dither: 16-bit truncation noise instead of distortion on long quiet tails
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) {
    const v = clamp(ch[c][i], -1, 1) * 32767 + (rnd() - rnd());
    b.writeInt16LE(clamp(Math.round(v), -32768, 32767), 44 + (i * ch.length + c) * 2);
  }
  fs.writeFileSync(path, b);
}
/** Decode any audio file to mono (or per-channel) Float64Array at SR through ffmpeg. */
export function decode(path, channels = 1) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', String(channels), '-ar', String(SR), '-'], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error('ffmpeg decode failed: ' + path + ' ' + r.stderr);
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 2);
  if (channels === 1) return Float64Array.from(f);
  const out = [];
  for (let c = 0; c < channels; c++) { const o = new Float64Array(f.length / channels); for (let i = 0; i < o.length; i++) o[i] = f[i * channels + c]; out.push(o); }
  return out;
}
export function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('ffmpeg ' + args.join(' ') + '\n' + r.stderr);
}

/** One-line report for a sound. */
export function report(name, x) {
  const L = loudness(x), S = spectrum(x), E = shape(x), G = edges(x);
  return { name, ...E, mmax: +L.mmax.toFixed(1), integ: +L.integ.toFixed(1), ...S.bands, centroid: S.centroid, roll85: S.rolloff85,
    dc: +S.dc.toExponential(1), first: G.first, last: G.last, maxStep: G.maxStep, peaks: S.peaks.join('/'), env: spark(x) };
}
