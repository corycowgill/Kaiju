// Sound definitions for the wrestling pack. Each entry renders one mono clip from a seed
// (deterministic), and carries its mastering target. See make.mjs for the pipeline.
//
// Design rules shared by the whole pack:
//  - Only wr_sub_* and the finisher impact carry energy under ~70 Hz. Every other impact is
//    high-passed so the engine can keep ONE sub voice at a time (no low-end pile-up).
//  - Crowd material is high-passed at 150 Hz: it must never mask the impacts' weight.
//  - Sub layers are saturated so their 2nd / 3rd harmonics (70-150 Hz) read on phone speakers.
import {
  SR, TAU, N, buf, rng, noise, mixInto, gainBuf, normalize, env, adExp, fade, lp, hp, bp, lp4, hp4, peakEq, shelfHi, shelfLo,
  svf, sat, sine, saw, space, clamp, lerp, convolve, peak,
} from './dsp.mjs';

// ---------------------------------------------------------------- building blocks
/** Pitch-dropping sine thump. f0 -> f1 Hz with time constant tp; amplitude decay ta. */
function thump(sec, f0, f1, tp, ta, drive = 1.5, att = 0.003) {
  const x = sine(sec, (t) => f1 + (f0 - f1) * Math.exp(-t / tp));
  env(x, adExp(att, ta));
  return drive > 0 ? sat(x, drive) : x;
}
/** Noise burst through a (possibly sweeping) filter with attack / exp decay. */
function burst(r, sec, { f = 1000, q = 0.8, mode = 'bp', att = 0.001, tau = 0.03 } = {}) {
  const x = svf(noise(sec, r), f, q, mode);
  return env(x, adExp(att, tau));
}
/**
 * Granular debris: Poisson events, each a short damped sine (a pebble / shard / splinter).
 * rate(t) events per second; f in [fLo, fHi] (log-uniform); tau per grain.
 */
function grains(r, sec, { rate, fLo, fHi, tauLo = 0.002, tauHi = 0.012, amp = (t) => 1 }) {
  const o = buf(sec);
  let t = 0;
  for (;;) {
    const rt = Math.max(0.5, rate(t));
    t += -Math.log(1 - r()) / rt;
    if (t >= sec) break;
    const f = fLo * Math.pow(fHi / fLo, r()), tau = r.range(tauLo, tauHi), a = amp(t) * r.range(0.3, 1), ph = r() * TAU;
    const n = Math.min(o.length - N(t), N(tau * 6)), i0 = N(t);
    const w = TAU * f / SR, d = Math.exp(-1 / (tau * SR));
    let e = a;
    // 1 ms raised onset so a grain never starts with a step
    const on = Math.min(n, 44);
    for (let i = 0; i < n; i++) { o[i0 + i] += Math.sin(ph + w * i) * e * (i < on ? i / on : 1); e *= d; }
  }
  return o;
}
/** Modal resonator bank: partials [{ f, a, tau, beat }] as damped sine pairs (beat Hz apart). */
function modal(sec, partials, r, strikeAtt = 0.0008) {
  const o = buf(sec);
  for (const p of partials) {
    const f2 = p.f + (p.beat || 0), ph1 = r() * TAU, ph2 = r() * TAU;
    const w1 = TAU * p.f / SR, w2 = TAU * f2 / SR, d = Math.exp(-1 / (p.tau * SR));
    let e = p.a;
    const on = N(strikeAtt);
    for (let i = 0; i < o.length; i++) {
      const a = i < on ? i / on : 1;
      o[i] += (Math.sin(ph1 + w1 * i) + (p.beat ? 0.7 * Math.sin(ph2 + w2 * i) : 0)) * e * a;
      e *= d;
      if (e < 1e-6) break;
    }
  }
  return o;
}
/** Bell-shaped air whoosh: band-passed noise whose centre sweeps f(t), amplitude peaks at tp. */
function whoosh(r, sec, f, tp, sharp = 2.2, q = 1.4) {
  const x = svf(noise(sec, r), f, q, 'bp');
  return env(x, (t) => {
    const u = t < tp ? t / tp : (sec - t) / (sec - tp);
    return Math.pow(clamp(u, 0, 1), sharp);
  });
}

// ---------------------------------------------------------------- impacts
// Layers are balanced by ENERGY (dB relative to each other), not by amplitude: a 10 ms crack
// and a 300 ms thump at the same amplitude are 15 dB apart in what the ear integrates.
function E(x, dB) {
  let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return gainBuf(x, Math.sqrt(Math.pow(10, dB / 10) * 441 / Math.max(1e-12, e)));
}
function subThump(r, v) {
  // v 0: tight (strikes, counts), 1: slam, 2: long (suplex / splash / tower)
  const P = [[1.0, 92, 40, 0.040, 0.20], [1.4, 84, 34, 0.055, 0.34], [2.0, 78, 29, 0.075, 0.52]][v];
  const [sec, f0, f1, tp, ta] = P;
  // hard-driven so the 2nd / 3rd harmonics (70-150 Hz+) carry the hit on small speakers
  let x = thump(sec, f0 * r.range(0.97, 1.03), f1, tp, ta, 3.6, 0.004);
  // a little chest: one octave up, short
  mixInto(x, thump(sec, f0 * 2.1, f1 * 2, tp * 0.6, ta * 0.4, 1.5), 0, 0.3);
  x = hp(x, 24); x = lp(x, 340);
  return fade(x, 0.002, 0.15);
}
function slam(r) {
  // a hundred thousand tons of animal hitting a park: whump, ground crack, debris tail
  const sec = 1.7, o = buf(sec);
  mixInto(o, burst(r, 0.5, { f: (t) => 420 * Math.exp(-t / 0.05) + 110, q: 0.7, mode: 'lp', att: 0.002, tau: r.range(0.10, 0.14) }), 0, 1.0);
  mixInto(o, thump(0.4, r.range(150, 175), 62, 0.035, 0.11, 1.2), 0, 0.7);
  // crack: one hard transient then splitting cracks thinning out over 150 ms
  mixInto(o, burst(r, 0.06, { f: r.range(1800, 2600), q: 0.9, att: 0.0004, tau: 0.007 }), 0.001, 0.9);
  mixInto(o, grains(r, 0.35, { rate: (t) => 260 * Math.exp(-t / 0.07), fLo: 700, fHi: 3800, tauLo: 0.0015, tauHi: 0.006, amp: (t) => Math.exp(-t / 0.12) }), 0.006, 0.55);
  // debris: earth and rubble raining back down
  const deb = grains(r, 1.5, { rate: (t) => 900 * Math.exp(-t / 0.33) + 15, fLo: 220, fHi: 2600, tauLo: 0.003, tauHi: 0.02, amp: (t) => Math.exp(-t / 0.42) });
  mixInto(o, lp(deb, 3200), 0.05, 0.3);
  mixInto(o, env(svf(noise(1.4, r), (t) => 900 * Math.exp(-t / 0.5) + 250, 0.6, 'bp'), adExp(0.03, 0.34)), 0.03, 0.34);
  return space(hp4(o, 70), { wet: 0.22, tail: 1.1, slap: 0.13, bright: 3200, seed: 11 + Math.floor(r() * 90) });
}
function body(r) {
  // hide on hide: thick low-mid thud with a wet slap on top, no ring
  const sec = 0.5, o = buf(sec);
  mixInto(o, E(thump(0.3, r.range(125, 150), 72, 0.03, 0.075, 1.6), 0), 0);
  mixInto(o, E(burst(r, 0.25, { f: r.range(280, 420), q: 1.1, att: 0.002, tau: 0.06 }), -1.5), 0);
  mixInto(o, E(burst(r, 0.2, { f: r.range(700, 1000), q: 0.9, att: 0.001, tau: 0.03 }), -5), 0);
  mixInto(o, E(burst(r, 0.12, { f: (t) => 3200 * Math.exp(-t / 0.02) + 600, q: 0.6, mode: 'lp', att: 0.0006, tau: 0.022 }), -4), 0.001);
  return fade(hp4(o, 68), 0.001, 0.06);
}
function strikeLight(r, v) {
  const sec = 0.3, o = buf(sec);
  const f = [205, 180, 230, 165][v] * r.range(0.97, 1.03);
  mixInto(o, E(thump(0.18, f, f * 0.5, 0.018, 0.04, 1.8, 0.0015), 0), 0);
  mixInto(o, E(burst(r, 0.2, { f: [420, 520, 360, 600][v], q: 1.3, att: 0.002, tau: 0.035 }), -2), 0);
  mixInto(o, E(burst(r, 0.09, { f: [1900, 2500, 1500, 3000][v], q: 0.8, att: 0.0004, tau: 0.011 }), -4), 0.0005);
  mixInto(o, E(grains(r, 0.2, { rate: (t) => 300 * Math.exp(-t / 0.05), fLo: 600, fHi: 3000, tauLo: 0.001, tauHi: 0.004, amp: (t) => Math.exp(-t / 0.06) }), -9), 0.01);
  return fade(hp4(o, 75), 0.0008, 0.05);
}
function strikeHeavy(r, v) {
  const sec = 0.75, o = buf(sec);
  const f = [150, 135, 165][v];
  mixInto(o, E(thump(0.45, f, 58, 0.03, 0.10, 2.2, 0.002), 0), 0);
  mixInto(o, E(burst(r, 0.4, { f: (t) => 1400 * Math.exp(-t / 0.06) + 260, q: 0.8, mode: 'lp', att: 0.002, tau: 0.075 }), -1), 0);
  mixInto(o, E(burst(r, 0.08, { f: [2300, 1700, 2900][v], q: 0.8, att: 0.0004, tau: 0.009 }), -5), 0.0005);
  mixInto(o, E(grains(r, 0.55, { rate: (t) => 420 * Math.exp(-t / 0.1), fLo: 400, fHi: 3400, tauLo: 0.0015, tauHi: 0.008, amp: (t) => Math.exp(-t / 0.14) }), -7), 0.012);
  return space(hp4(o, 70), { wet: 0.12, tail: 0.5, slap: 0.09, bright: 3500, seed: 31 + v });
}
function block(r, v) {
  // guard: a damped, pitched "thock" - short knocking modes and a dull clack, no crack, no
  // tail. Reads as "stopped" against the strike family's broadband smack.
  const f = [250, 290][v];
  const o = E(modal(0.26, [{ f, a: 1, tau: 0.035 }, { f: f * 1.62, a: 0.8, tau: 0.028 }, { f: f * 2.71, a: 0.6, tau: 0.018 }, { f: f * 4.3, a: 0.45, tau: 0.011 }, { f: f * 6.9, a: 0.3, tau: 0.007 }], r, 0.0012), 0);
  mixInto(o, E(burst(r, 0.05, { f: 1500, q: 1.2, att: 0.0005, tau: 0.006 }), -9), 0);
  mixInto(o, E(thump(0.15, 140, 85, 0.02, 0.035, 1.2), -5), 0);
  return fade(hp4(o, 80), 0.0006, 0.04);
}
function reversal(r, v) {
  // parry: a 170 ms inhale (rising air) into a bright inharmonic "shing" and a zip away.
  // Tonal and high: nothing else in the impact family lives up here.
  const sec = 0.95, o = buf(sec), at = 0.17;
  const up = svf(noise(at + 0.02, r), (t) => 500 * Math.pow(9, t / at), 2.2, 'bp');
  mixInto(o, env(up, (t) => Math.pow(clamp(t / at, 0, 1), 2.6) * (t > at ? Math.exp(-(t - at) / 0.004) : 1)), 0, 0.55);
  const f = [1320, 1480][v];
  const ring = modal(sec - at, [1, 1.47, 2.09, 2.56, 3.39, 4.2, 5.4].map((m, i) => ({ f: f * m, a: 1 / (1 + i * 0.55), tau: 0.24 / (1 + i * 0.35), beat: 3 + i })), r, 0.0005);
  mixInto(o, ring, at, 0.6);
  mixInto(o, burst(r, 0.03, { f: 4200, q: 0.7, att: 0.0003, tau: 0.004 }), at, 0.8);
  mixInto(o, thump(0.2, 210, 110, 0.02, 0.04, 1.2), at, 0.55);
  // zip: a falling whistle of air after the turn
  mixInto(o, env(svf(noise(0.3, r), (t) => 5200 * Math.exp(-t / 0.09) + 700, 3, 'bp'), adExp(0.004, 0.07)), at + 0.02, 0.35);
  return fade(hp4(o, 120), 0.004, 0.08);
}
function whooshBig(r, v) {
  // a building-sized limb moving air: low, wide, peaking late
  const sec = [0.85, 0.7][v];
  const sw = (t) => Math.pow(Math.sin(Math.PI * clamp(t / sec, 0, 1)), 2);
  const x = E(lp4(whoosh(r, sec, (t) => 170 + 620 * sw(t), sec * 0.58, 2.0, 1.0), 1900), 0);
  mixInto(x, E(lp4(whoosh(r, sec, 110, sec * 0.6, 2.4, 0.7), 400), -3), 0);
  return fade(hp(x, 80), 0.01, 0.05);
}
function dive(r) {
  // falling body: rising level and pitch, cut dead at the end (the hit lands on the last sample).
  // 6 ms release so the cut does not click.
  const sec = 1.0;
  const x = E(lp4(svf(noise(sec, r), (t) => 240 + 1700 * Math.pow(t / sec, 2.2), 2.4, 'bp'), 4500), 0);
  mixInto(x, E(lp4(svf(noise(sec, r), (t) => 120 + 420 * Math.pow(t / sec, 2), 1.2, 'bp'), 1200), -1), 0);
  env(x, (t) => Math.pow(t / sec, 2.4));
  return fade(hp(x, 80), 0.01, 0.006);
}
function ropeStretch(r) {
  // cable under load: stick-slip creak, pitch climbing with tension, through two cable resonances
  const sec = 0.7;
  let ph = 0;
  const x = buf(sec);
  let period = 0, next = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if (i >= next) { period = SR / ((58 + 70 * Math.pow(t / sec, 1.5)) * r.range(0.8, 1.25)); next = i + period; ph = 0; }
    x[i] = (1 - ph) * (1 - ph) * 2 - 1; ph = Math.min(1, ph + 1 / period);
  }
  let y = bp(x, 640, 7); mixInto(y, bp(x, 1450, 9), 0, 0.7); mixInto(y, bp(x, 2900, 6), 0, 0.25);
  env(y, (t) => Math.pow(t / sec, 1.3) * (t > sec - 0.03 ? (sec - t) / 0.03 : 1));
  return fade(hp(y, 150), 0.02, 0.01);
}
function ropeTwang(r, v) {
  // three steel cables let go: stiff-string partials, pitch settling as the tension drops
  const sec = 1.7, o = buf(sec);
  const f0s = [[49, 58, 69], [44, 55, 65]][v];
  f0s.forEach((f0, k) => {
    const B = 0.0009 * (k + 1), s = buf(sec - k * 0.018);
    for (let n = 1; n <= 26; n++) {
      const fn = n * f0 * Math.sqrt(1 + B * n * n);
      if (fn > 9000) break;
      const a = (1 / n) * (0.6 + 0.4 * Math.abs(Math.sin(n * 0.37 * Math.PI))) * (n < 2 ? 0.5 : 1), tau = 0.55 / (1 + n * 0.11);
      const ph = r() * TAU;
      let p = ph;
      for (let i = 0; i < s.length; i++) {
        const t = i / SR;
        s[i] += Math.sin(p) * a * Math.exp(-t / tau) * (1 + 0.12 * Math.sin(TAU * (5 + k) * t) * Math.exp(-t / 0.3));
        p += TAU * fn * (1 + 0.07 * Math.exp(-t / 0.05)) / SR;
      }
    }
    mixInto(o, fade(s, 0.0015, 0.2), k * 0.018, 1 / (1 + k * 0.3));
  });
  mixInto(o, burst(r, 0.05, { f: 1900, q: 0.8, att: 0.0005, tau: 0.007 }), 0, 0.5);
  return fade(hp4(o, 85), 0.001, 0.2);
}
function ropeSnap(r) {
  const sec = 1.5, o = buf(sec);
  // the crack
  mixInto(o, burst(r, 0.05, { f: 3800, q: 0.5, att: 0.0002, tau: 0.004 }), 0.0, 1.2);
  mixInto(o, burst(r, 0.12, { f: (t) => 6000 * Math.exp(-t / 0.03) + 900, q: 0.8, att: 0.0005, tau: 0.02 }), 0.001, 0.7);
  // the cable whipping free: partials diving 950 -> 160 Hz with flutter
  const w = buf(0.6);
  for (let n = 1; n <= 7; n++) {
    let p = r() * TAU;
    for (let i = 0; i < w.length; i++) {
      const t = i / SR, f = (160 + 790 * Math.exp(-t / 0.11)) * n * (1 + 0.03 * Math.sin(TAU * 31 * t));
      w[i] += Math.sin(p) / n * Math.exp(-t / 0.16);
      p += TAU * f / SR;
    }
  }
  mixInto(o, fade(w, 0.003, 0.1), 0.012, 0.42);
  // lash: the loose end slapping twice
  mixInto(o, burst(r, 0.06, { f: 2400, q: 0.9, att: 0.0004, tau: 0.008 }), 0.21, 0.5);
  mixInto(o, burst(r, 0.06, { f: 1800, q: 0.9, att: 0.0004, tau: 0.01 }), 0.36, 0.3);
  mixInto(o, modal(1.2, [{ f: 412, a: 0.5, tau: 0.5, beat: 2 }, { f: 1137, a: 0.35, tau: 0.3, beat: 3 }, { f: 2229, a: 0.2, tau: 0.16 }], r), 0.004, 0.35);
  return space(hp4(o, 110), { wet: 0.2, tail: 0.9, slap: 0.12, bright: 5000, seed: 51 });
}
function post(r, v) {
  // a steel lighting mast struck: free-beam modes over a dull hit, with a hard metallic bite
  const f0 = [118, 96][v];
  const ratios = [1, 2.76, 5.40, 8.93, 13.34, 18.64, 24.8, 31.9];
  const o = E(modal(1.9, ratios.map((m, i) => ({ f: f0 * m * r.range(0.995, 1.005), a: [0.7, 1, 1, 0.9, 0.8, 0.6, 0.45, 0.3][i], tau: [0.5, 0.75, 0.6, 0.4, 0.26, 0.17, 0.11, 0.08][i], beat: [0, 1.6, 2.3, 3.1, 4.3, 0, 0, 0][i] })), r, 0.001), 0);
  mixInto(o, E(burst(r, 0.06, { f: 2600, q: 0.6, att: 0.0003, tau: 0.007 }), -9), 0);
  mixInto(o, E(thump(0.25, 170, 85, 0.02, 0.05, 1.4), -6), 0);
  return space(hp4(o, 78), { wet: 0.16, tail: 1.0, slap: 0.14, bright: 4000, seed: 61 + v });
}
function crash(r, v) {
  // a body through a tower: structure crunch, a spray of glass, steel groaning as it goes
  const sec = 1.6, o = buf(sec);
  mixInto(o, E(burst(r, 0.6, { f: (t) => 2400 * Math.exp(-t / 0.12) + 380, q: 0.6, mode: 'lp', att: 0.002, tau: 0.13 }), 0), 0);
  mixInto(o, E(burst(r, 0.5, { f: r.range(170, 230), q: 1.0, att: 0.003, tau: 0.1 }), -2), 0);
  mixInto(o, E(grains(r, 0.9, { rate: (t) => 700 * Math.exp(-t / 0.2) + 20, fLo: 250, fHi: 2200, tauLo: 0.003, tauHi: 0.02, amp: (t) => Math.exp(-t / 0.3) }), -4), 0.01);
  mixInto(o, E(grains(r, 1.3, { rate: (t) => 520 * Math.exp(-t / 0.3) + 12, fLo: 3200, fHi: 9500, tauLo: 0.004, tauHi: 0.03, amp: (t) => Math.exp(-t / 0.45) }), -9), 0.03);
  // steel: a slow sawtooth groan through beam resonances
  const g = saw(0.9, (t) => (v ? 74 : 92) * (1 - 0.25 * t) * (1 + 0.02 * Math.sin(TAU * 7 * t)));
  let gr = bp(g, 310, 5); mixInto(gr, bp(g, 760, 6), 0, 0.8); mixInto(gr, bp(g, 1500, 5), 0, 0.4);
  mixInto(o, E(env(gr, (t) => Math.sin(Math.PI * clamp(t / 0.9, 0, 1)) ** 1.5), -6), 0.08);
  return space(hp4(o, 80), { wet: 0.2, tail: 1.1, slap: 0.12, bright: 6000, seed: 71 + v });
}
function dizzy(r) {
  // seeing stars: six warbling chirps circling, quiet and high
  const sec = 1.6, o = buf(sec);
  for (let k = 0; k < 6; k++) {
    const at = k * 0.25 + r.range(0, 0.03), f = [1750, 2100, 1900, 2350, 1650, 2000][k];
    const c = sine(0.2, (t) => f * (1 + 0.09 * Math.sin(TAU * 22 * t)) * (1 + 0.5 * t));
    mixInto(o, env(c, (t) => Math.sin(Math.PI * clamp(t / 0.2, 0, 1)) ** 2), at, 0.5 + 0.5 * Math.sin(k * 1.1) ** 2);
  }
  return fade(o, 0.01, 0.05);
}

// ---------------------------------------------------------------- ceremony / UI
function bell(r) {
  // ring-side timekeeper's bell: classic bell partial ratios on a ~590 Hz prime, hammer clack,
  // every partial a slightly detuned pair so the tail shimmers instead of sitting dead still
  const prime = 590;
  const P = [[0.5, 0.3, 2.1, 0.5], [1, 0.8, 1.7, 0.7], [1.183, 0.6, 1.3, 0.9], [1.506, 0.5, 1.0, 1.1], [2, 1.0, 1.0, 1.3], [2.514, 0.6, 0.7, 1.7],
    [2.662, 0.55, 0.65, 0], [3.011, 0.75, 0.6, 2.1], [4.166, 0.8, 0.45, 2.9], [5.433, 0.7, 0.32, 0], [6.796, 0.55, 0.22, 0], [8.215, 0.4, 0.15, 0], [9.71, 0.25, 0.1, 0]];
  const o = modal(3.2, P.map(([m, a, tau, beat]) => ({ f: prime * m, a, tau, beat })), r, 0.0006);
  mixInto(o, burst(r, 0.03, { f: 3600, q: 0.6, att: 0.0003, tau: 0.004 }), 0, 1.6);
  mixInto(o, burst(r, 0.05, { f: 900, q: 0.8, att: 0.0005, tau: 0.008 }), 0, 0.9);
  return space(fade(hp(o, 200), 0.0005, 0.5), { wet: 0.14, tail: 1.2, slap: 0.15, bright: 6000, seed: 81 });
}
function uiCallout(r) {
  // move-name sting: 110 ms inhale, tom-like hit, snap
  const sec = 0.5, o = buf(sec), at = 0.11;
  mixInto(o, env(svf(noise(at + 0.01, r), (t) => 700 * Math.pow(6, t / at), 1.8, 'bp'), (t) => Math.pow(clamp(t / at, 0, 1), 2.2) * (t > at ? 0 : 1)), 0, 0.45);
  mixInto(o, E(thump(0.35, 260, 140, 0.03, 0.08, 1.8), 0), at);
  mixInto(o, E(burst(r, 0.2, { f: 620, q: 1.2, att: 0.001, tau: 0.04 }), -3), at);
  mixInto(o, E(burst(r, 0.05, { f: 2800, q: 0.7, att: 0.0003, tau: 0.007 }), -5), at);
  return fade(hp4(o, 100), 0.004, 0.06);
}
function uiBig(r) {
  // landmark / finisher title: anvil-ish metal over a deep drum, short hall
  const sec = 1.2, o = buf(sec), at = 0.14;
  mixInto(o, env(svf(noise(at + 0.01, r), (t) => 400 * Math.pow(10, t / at), 1.5, 'bp'), (t) => Math.pow(clamp(t / at, 0, 1), 2.4) * (t > at ? 0 : 1)), 0, 0.5);
  mixInto(o, thump(0.6, 130, 62, 0.04, 0.16, 2), at, 1);
  mixInto(o, modal(0.9, [{ f: 523, a: 0.5, tau: 0.3, beat: 2 }, { f: 784, a: 0.4, tau: 0.25, beat: 3 }, { f: 1397, a: 0.3, tau: 0.16 }, { f: 2217, a: 0.22, tau: 0.1 }, { f: 3310, a: 0.12, tau: 0.06 }], r), at, 0.5);
  mixInto(o, burst(r, 0.06, { f: 3200, q: 0.6, att: 0.0003, tau: 0.008 }), at, 0.7);
  return space(hp4(o, 75), { wet: 0.2, tail: 0.8, slap: 0.11, bright: 5000, seed: 91 });
}
function uiPrompt(r) {
  const o = buf(0.16);
  mixInto(o, env(sine(0.07, 880), adExp(0.003, 0.02)), 0, 0.8);
  mixInto(o, env(sine(0.1, 1318.5), adExp(0.003, 0.03)), 0.055, 1);
  return fade(o, 0.002, 0.02);
}
function slowIn(r) {
  // time stretching out: everything falls two octaves
  const sec = 0.7;
  const x = sine(sec, (t) => 55 + 230 * Math.exp(-t / 0.13));
  mixInto(x, svf(noise(sec, r), (t) => 180 + 5000 * Math.exp(-t / 0.1), 1.6, 'bp'), 0, 0.5);
  env(x, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.22));
  return fade(hp(sat(x, 1.4), 45), 0.004, 0.1);
}
function slowOut(r) {
  const sec = 0.45;
  const x = svf(noise(sec, r), (t) => 250 * Math.pow(18, t / sec), 2, 'bp');
  mixInto(x, sine(sec, (t) => 90 * Math.pow(4, t / sec)), 0, 0.4);
  env(x, (t) => Math.pow(t / sec, 2.2));
  return fade(hp(x, 80), 0.01, 0.012);
}

// ---------------------------------------------------------------- finisher
function finStart(r) {
  // "this is it": reverse swell into a low brass-like cluster on D with a sub drop
  const sec = 2.2, o = buf(sec), at = 0.28;
  mixInto(o, env(svf(noise(at + 0.02, r), (t) => 600 * Math.pow(10, t / at), 1.4, 'bp'), (t) => Math.pow(clamp(t / at, 0, 1), 2.6) * (t > at ? 0 : 1)), 0, 0.5);
  const br = buf(sec - at);
  for (const [f, a] of [[36.71, 1], [73.42, 0.9], [110, 0.6], [146.83, 0.5], [220.0, 0.28], [77.78, 0.3]]) {
    for (const det of [-0.004, 0.004]) mixInto(br, saw(sec - at, f * (1 + det), r()), 0, a * 0.5);
  }
  let b = svf(br, (t) => 520 + 2600 * Math.exp(-t / 0.4), 0.9, 'lp');
  b = sat(gainBuf(b, 0.5), 2.2);
  env(b, (t) => Math.min(1, t / 0.012) * Math.exp(-t / 0.75));
  mixInto(o, E(b, 0), at);
  mixInto(o, E(thump(1.2, 90, 31, 0.07, 0.4, 3), -3), at);
  mixInto(o, E(burst(r, 0.08, { f: 2600, q: 0.6, att: 0.0004, tau: 0.01 }), -12), at);
  return space(hp(o, 26), { wet: 0.16, tail: 1.2, slap: 0.14, bright: 4000, seed: 101 });
}
function finRiser(r) {
  // the lift: 2.4 s of rising pressure that ends on its loudest sample (apex cuts it)
  const sec = 2.4, o = buf(sec);
  for (let k = 0; k < 4; k++) {
    const s = saw(sec, (t) => 55 * Math.pow(2, k * 0.5 + 1.6 * t / sec), r());
    mixInto(o, svf(s, (t) => 300 + 2800 * Math.pow(t / sec, 2), 1.2, 'lp'), 0, 0.25);
  }
  mixInto(o, svf(noise(sec, r), (t) => 350 * Math.pow(14, t / sec), 2.2, 'bp'), 0, 0.7);
  // tremolo that accelerates into the apex
  let ph = 0;
  for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * (4 + 20 * Math.pow(t / sec, 2)) / SR; o[i] *= Math.pow(t / sec, 1.8) * (0.72 + 0.28 * Math.sin(ph)); }
  return fade(hp(o, 70), 0.02, 0.008);
}
function finApex(r) {
  // the held breath at the top: one glassy ping and thin air
  const sec = 1.4;
  const o = modal(sec, [{ f: 2093, a: 1, tau: 0.5, beat: 1.5 }, { f: 3136, a: 0.5, tau: 0.35, beat: 2 }, { f: 4186, a: 0.3, tau: 0.22 }, { f: 6272, a: 0.14, tau: 0.12 }], r, 0.002);
  mixInto(o, env(hp(noise(sec, r), 5000), adExp(0.05, 0.4)), 0, 0.05);
  return fade(o, 0.002, 0.3);
}
function finImpact(r) {
  // the city block goes: crack, the pack's deepest and longest sub, slam, then the shock
  // rolling out through the Loop as three receding rumbles
  const sec = 4.6, o = buf(sec);
  mixInto(o, E(thump(2.6, 82, 25, 0.09, 0.8, 3.2, 0.004), 2.5), 0);
  mixInto(o, E(thump(0.7, 170, 55, 0.04, 0.16, 1.8), -4), 0);
  mixInto(o, E(burst(r, 0.06, { f: 3000, q: 0.5, att: 0.0002, tau: 0.006 }), -9), 0);
  mixInto(o, E(burst(r, 1.0, { f: (t) => 2200 * Math.exp(-t / 0.12) + 200, q: 0.6, mode: 'lp', att: 0.002, tau: 0.22 }), -1), 0);
  mixInto(o, E(grains(r, 0.6, { rate: (t) => 500 * Math.exp(-t / 0.1), fLo: 500, fHi: 4200, tauLo: 0.0015, tauHi: 0.007, amp: (t) => Math.exp(-t / 0.15) }), -7), 0.005);
  mixInto(o, E(lp(grains(r, 3.2, { rate: (t) => 1300 * Math.exp(-t / 0.7) + 20, fLo: 180, fHi: 3000, tauLo: 0.003, tauHi: 0.024, amp: (t) => Math.exp(-t / 0.9) }), 3500), -6), 0.06);
  for (const [at, g, f] of [[0.55, -5, 170], [1.15, -8, 140], [1.95, -11, 110]]) {
    mixInto(o, E(env(svf(noise(1.6, r), f, 0.7, 'lp'), (t) => Math.min(1, t / 0.12) * Math.exp(-t / 0.42)), g), at);
  }
  mixInto(o, E(env(svf(noise(4.2, r), (t) => 700 * Math.exp(-t / 1.2) + 140, 0.5, 'bp'), adExp(0.05, 1.1)), -5), 0.04);
  return space(hp(o, 24), { wet: 0.24, tail: 2.2, slap: 0.17, bright: 3000, seed: 111 });
}

// ---------------------------------------------------------------- crowd
// Shouted vowel formants (F1, F2, F3 Hz), adult average.
const V = {
  a: [800, 1250, 2600], ae: [700, 1800, 2600], e: [480, 2000, 2700], i: [320, 2400, 3100], o: [500, 900, 2550], u: [350, 800, 2400],
  uh: [660, 1250, 2500], w: [320, 650, 2300], n: [280, 1500, 2500], r: [420, 1250, 1650], er: [500, 1400, 1700],
};
/**
 * One shouting person. script: [[tSec, vowel, amp, breath 0..1], ...] (linear between points);
 * f0 Hz with glide(t01) multiplier. Returns the dry voice.
 */
function voice(r, script, { f0 = 220, glide = (u) => 1, tract = 1, rough = 0.25, tilt = 2600 } = {}) {
  const sec = script[script.length - 1][0];
  const n = N(sec), src = new Float64Array(n), br = new Float64Array(n);
  // source: polyBLEP saw with jitter + slow drift, roughened by 60-90 Hz noise AM (a hoarse shout)
  let ph = r(), drift = 0, am = 0;
  const amCo = 1 - Math.exp(-TAU * 75 / SR);
  const at = (t, k) => {
    let j = 0; while (j < script.length - 2 && t >= script[j + 1][0]) j++;
    const a = script[j], b = script[j + 1], u = clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    return k < 3 ? lerp(V[a[1]][k], V[b[1]][k], u) * tract : lerp(a[k - 1], b[k - 1], u); // k 3 = amp, 4 = breath
  };
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    drift += (r() - 0.5) * 0.0006; drift *= 0.9995;
    const f = f0 * glide(t / sec) * (1 + drift + 0.012 * Math.sin(TAU * 5.5 * t + ph));
    const dt = f / SR;
    let v = 2 * ph - 1;
    if (ph < dt) { const q = ph / dt; v -= q + q - q * q - 1; } else if (ph > 1 - dt) { const q = (ph - 1) / dt; v -= q * q + q + q + 1; }
    ph += dt; if (ph >= 1) ph -= 1;
    am += ((r() * 2 - 1) - am) * amCo;
    const amp = at(t, 3), b = at(t, 4);
    src[i] = v * amp * (1 - b) * (1 + rough * am * 14);
    br[i] = (r() * 2 - 1) * amp * (0.12 + 0.88 * b);
  }
  const s = lp(src, tilt, 0.6);
  let o = svf(s, (t) => at(t, 0), 5, 'bp');
  const f2 = svf(s, (t) => at(t, 1), 7, 'bp'), f3 = svf(s, (t) => at(t, 2), 8, 'bp');
  for (let i = 0; i < n; i++) { const t = i / SR; const k2 = at(t, 1) / (1100 * tract), k3 = at(t, 2) / (2500 * tract); o[i] += f2[i] * 0.7 * k2 * k2 + f3[i] * 0.45 * k3 * k3; }
  // aspiration takes the same formants, wider
  mixInto(o, svf(br, (t) => at(t, 0), 2.5, 'bp'), 0, 0.5);
  mixInto(o, svf(br, (t) => at(t, 1), 3, 'bp'), 0, 0.5);
  mixInto(o, svf(br, (t) => at(t, 2), 3, 'bp'), 0, 0.35);
  return o;
}
const person = (r) => {
  const woman = r() < 0.42;
  return { woman, f0: woman ? r.range(300, 470) : r.range(165, 290), tract: woman ? r.range(1.08, 1.2) : r.range(0.94, 1.06) };
};
/** Phoneme scripts; d = duration scale. */
const SCRIPTS = {
  yeah: (d) => [[0, 'i', 0, 0.2], [0.05 * d, 'e', 1, 0.1], [0.22 * d, 'ae', 1, 0.1], [0.8 * d, 'a', 0.8, 0.15], [1.0 * d, 'a', 0, 0.4]],
  woo: (d) => [[0, 'w', 0, 0.2], [0.06 * d, 'u', 1, 0.1], [0.8 * d, 'u', 0.85, 0.1], [1.0 * d, 'u', 0, 0.3]],
  aah: (d) => [[0, 'uh', 0, 0.3], [0.07 * d, 'a', 1, 0.12], [0.75 * d, 'a', 0.8, 0.15], [1.0 * d, 'uh', 0, 0.4]],
  hey: (d) => [[0, 'e', 0, 0.8], [0.04 * d, 'e', 1, 0.15], [0.5 * d, 'e', 0.9, 0.1], [0.85 * d, 'i', 0.5, 0.1], [1.0 * d, 'i', 0, 0.3]],
  ooh: (d) => [[0, 'o', 0, 0.3], [0.1 * d, 'o', 1, 0.12], [0.5 * d, 'u', 0.95, 0.12], [0.85 * d, 'u', 0.5, 0.2], [1.0 * d, 'u', 0, 0.4]],
  boo: (d) => [[0, 'w', 0, 0], [0.05 * d, 'u', 1, 0.06], [0.8 * d, 'u', 0.8, 0.08], [1.0 * d, 'u', 0, 0.2]],
  gasp: (d) => [[0, 'uh', 0, 1], [0.12 * d, 'a', 1, 0.97], [0.45 * d, 'a', 0.8, 0.95], [1.0 * d, 'ae', 0, 1]],
  huh: (d) => [[0, 'uh', 0, 0.9], [0.05 * d, 'a', 1, 0.35], [0.5 * d, 'uh', 0.6, 0.4], [1.0 * d, 'uh', 0, 0.8]],
  one: (d) => [[0, 'w', 0, 0], [0.03 * d, 'w', 0.9, 0.05], [0.10 * d, 'uh', 1, 0.08], [0.26 * d, 'uh', 1, 0.08], [0.33 * d, 'n', 0.5, 0.02], [0.48 * d, 'n', 0.3, 0.02], [0.56 * d, 'n', 0, 0]],
  two: (d) => [[0, 'i', 0, 1], [0.012 * d, 'i', 1.0, 1], [0.045 * d, 'i', 0.5, 0.9], [0.075 * d, 'u', 1, 0.12], [0.36 * d, 'u', 0.9, 0.08], [0.5 * d, 'u', 0, 0.3]],
  three: (d) => [[0, 'i', 0, 1], [0.03 * d, 'i', 0.35, 1], [0.08 * d, 'r', 0.5, 0.5], [0.13 * d, 'r', 0.9, 0.1], [0.2 * d, 'i', 1, 0.06], [0.42 * d, 'i', 0.9, 0.06], [0.55 * d, 'i', 0, 0.3]],
  // murmur syllables
  ba: (d) => [[0, 'uh', 0, 0.3], [0.04 * d, 'a', 1, 0.2], [0.14 * d, 'uh', 0.6, 0.2], [0.2 * d, 'uh', 0, 0.3]],
  bo: (d) => [[0, 'w', 0, 0.3], [0.04 * d, 'o', 1, 0.2], [0.14 * d, 'er', 0.6, 0.2], [0.2 * d, 'er', 0, 0.3]],
  be: (d) => [[0, 'e', 0, 0.4], [0.04 * d, 'e', 1, 0.2], [0.14 * d, 'i', 0.6, 0.2], [0.2 * d, 'i', 0, 0.3]],
};
const arch = (peakAt, up, down) => (u) => (u < peakAt ? 1 + up * (u / peakAt - 1) : 1 - down * (u - peakAt) / (1 - peakAt));

/** Thousands of people as weather: noise through slowly breathing vowel-region bands. */
function wash(r, sec, { bright = 0.5, motion = 1 } = {}) {
  const o = buf(sec);
  const bands = [[560, 1.3, 1], [1150, 1.5, 0.8], [1900, 1.6, 0.3 + 0.3 * bright], [2900, 2.0, 0.12 + 0.3 * bright], [4300, 1.6, 0.02 + 0.12 * bright]];
  for (const [f, q, a] of bands) {
    const x = bp(noise(sec, r), f * r.range(0.95, 1.05), q);
    // each band swells on its own (sum of three slow sines, random phase)
    const p = [r() * TAU, r() * TAU, r() * TAU], w = [r.range(0.15, 0.4), r.range(0.5, 1.1), r.range(1.3, 2.6)];
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      o[i] += x[i] * a * (1 + motion * (0.22 * Math.sin(p[0] + TAU * w[0] * t) + 0.16 * Math.sin(p[1] + TAU * w[1] * t) + 0.1 * Math.sin(p[2] + TAU * w[2] * t)));
    }
  }
  return o;
}
/** Applause as a Poisson process of hand claps (short band-passed bursts). dst += */
function claps(r, dst, { rate, amp = () => 1, fold = 0 }) {
  const K = [];
  for (let k = 0; k < 10; k++) K.push(burst(r, 0.02, { f: r.range(1100, 2600), q: r.range(1.2, 2.5), att: 0.0005, tau: r.range(0.002, 0.005) }));
  const sec = dst.length / SR;
  let t = 0;
  for (;;) {
    t += -Math.log(1 - r()) / Math.max(1, rate(t));
    if (t >= sec) break;
    const k = K[Math.floor(r() * K.length)], g = amp(t) * r.range(0.25, 1), i0 = N(t);
    for (let i = 0; i < k.length; i++) { let j = i0 + i; if (j >= dst.length) { if (!fold) break; j -= dst.length; } dst[j] += k[i] * g; }
  }
}
/** Add a rendered voice at `at` s; with fold the overflow wraps (seamless loops). */
function place(dst, x, at, g, fold) {
  const i0 = N(at);
  for (let i = 0; i < x.length; i++) { let j = i0 + i; if (j >= dst.length) { if (!fold) break; j %= dst.length; } dst[j] += x[i] * g; }
}
function whistle(r) {
  const d = r.range(0.25, 0.6), f = r.range(1900, 3100);
  const x = sine(d, (t) => f * (1 + 0.25 * Math.pow(t / d, 0.6)) * (1 + 0.012 * Math.sin(TAU * 9 * t)));
  return env(x, (t) => Math.sin(Math.PI * clamp(t / d, 0, 1)) ** 1.2);
}
/** Reverb for loops: the tail folds back onto the start so the loop stays seamless. */
function spaceFold(x, o) {
  const y = space(x, o), out = new Float64Array(x.length);
  for (let i = 0; i < y.length; i++) out[i % x.length] += y[i];
  return out;
}
/** Equal-power loop of a stationary texture: needs x of length L + xf. */
function xfadeLoop(x, L, xf) {
  const n = N(L), m = N(xf), o = x.slice(0, n);
  for (let i = 0; i < m; i++) { const u = i / m; o[i] = x[i] * Math.sin(u * Math.PI / 2) + x[n + i] * Math.cos(u * Math.PI / 2); }
  return o;
}
const crowdTone = (x) => hp4(x, 150);
/** Filter a loop in its periodic steady state (run it twice, keep the second pass). */
function loopFilter(x, fn) {
  const xx = new Float64Array(x.length * 2);
  xx.set(x); xx.set(x, x.length);
  return fn(xx).slice(x.length);
}

function crowdLoop(r, hi) {
  // lo: an arena waiting - walla, scattered shouts, a little clapping.
  // hi: the same arena on its feet - dense cheering, whistles, sheets of applause.
  const L = 10, xf = 1.5;
  const w = xfadeLoop(wash(r, L + xf, { bright: hi ? 0.8 : 0.1, motion: hi ? 0.9 : 0.6 }), L, xf);
  const o = buf(L), c = buf(L);
  if (!hi) {
    // walla: 46 people talking over each other (formant babble at speaking pitch)
    for (let p = 0; p < 46; p++) {
      const P = person(r), f0 = P.f0 * 0.55;
      let t = r() * 0.4;
      while (t < L) {
        const d = r.range(0.75, 1.3);
        const x = voice(r, SCRIPTS[r.pick(['ba', 'bo', 'be', 'ba'])](d), { f0, tract: P.tract, glide: arch(0.3, 0.1, 0.12), rough: 0.1, tilt: 1700 });
        place(o, x, t, r.range(0.3, 1) * 0.5, true);
        t += 0.2 * d + (r() < 0.22 ? r.range(0.3, 1.4) : r.range(0.0, 0.08));
      }
    }
  }
  const shouts = hi ? 74 : 12;
  for (let k = 0; k < shouts; k++) {
    const P = person(r), d = r.range(0.6, 1.5);
    const x = voice(r, SCRIPTS[r.pick(hi ? ['yeah', 'woo', 'aah', 'woo', 'yeah', 'hey'] : ['hey', 'woo', 'yeah'])](d),
      { f0: P.f0 * r.range(1.0, 1.25), tract: P.tract, glide: arch(0.3, 0.12, 0.2), rough: 0.3 });
    place(o, x, r() * L, r.range(0.35, 1) * (hi ? 0.75 : 0.5), true);
  }
  for (let k = 0; k < (hi ? 9 : 1); k++) place(o, whistle(r), r() * L, r.range(0.05, 0.14), true);
  claps(r, c, { rate: () => (hi ? 520 : 26), amp: () => 1, fold: 1 });
  E(o, 0); mixInto(o, E(c, hi ? -8 : -15), 0);
  const out = spaceFold(o, { wet: 0.7, tail: 1.3, slap: 0.12, bright: 4500, seed: hi ? 131 : 121 });
  E(out, 0);
  mixInto(out, E(w, hi ? 0.5 : -5), 0);
  return loopFilter(out, hi ? (x) => shelfHi(crowdTone(x), 3200, -3) : crowdTone);
}
/** A crowd reaction: `count` voices from a script picker, onset spread, on top of a wash swell. */
function crowdShot(r, { sec, count, pick, spread = 0.1, f0mul = 1, washAmp = 0.5, washEnv, bright = 0.5, clapRate = null, tail = 1.1, wet = 0.6, seed = 141, whistles = 0, onsetBias = 0 }) {
  const o = buf(sec);
  for (let k = 0; k < count; k++) {
    const P = person(r), s = pick(r, P);
    const x = voice(r, s.script, { f0: (s.f0 || P.f0) * f0mul, tract: P.tract, glide: s.glide, rough: s.rough ?? 0.28, tilt: s.tilt ?? 2600 });
    place(o, x, Math.max(0, onsetBias + Math.abs(r.gauss()) * spread + (s.at || 0)), r.range(0.4, 1) * (s.g || 1), false);
  }
  for (let k = 0; k < whistles; k++) place(o, whistle(r), r.range(0.1, sec * 0.6), r.range(0.05, 0.12), false);
  const out = buf(sec);
  mixInto(out, E(o, 0), 0);
  if (clapRate) { const c = buf(sec); claps(r, c, clapRate); mixInto(out, E(c, clapRate.dB), 0); }
  mixInto(out, E(env(wash(r, sec, { bright, motion: 0.5 }), washEnv), washAmp), 0);
  return fade(space(crowdTone(out), { wet, tail, slap: 0.12, bright: 4800, seed }), 0.004, 0.25);
}
function crowdPop(r, v) {
  const sec = [2.3, 2.0, 2.6][v];
  return crowdShot(r, {
    sec, count: 64, spread: 0.11, f0mul: 1.15, bright: 0.8, washAmp: -3, seed: 141 + v, whistles: 3,
    washEnv: (t) => Math.min(1, t / 0.12) * Math.exp(-Math.max(0, t - 0.5) / 0.55),
    pick: (rr) => { const d = rr.range(0.8, sec * 0.62); return { script: SCRIPTS[rr.pick(['yeah', 'woo', 'aah', 'yeah'])](d), glide: arch(0.25, 0.16, 0.2), rough: 0.32 }; },
    clapRate: { rate: (t) => 700 * Math.exp(-Math.max(0, t - 0.4) / 0.7), amp: (t) => Math.min(1, t / 0.3), dB: -9 },
  });
}
function crowdOoh(r, v) {
  // sympathetic "OOOOH": everyone on /o/ sliding to /u/, pitch sagging - it hurt
  return crowdShot(r, {
    sec: 1.5, count: 60, spread: 0.07, f0mul: 0.85, bright: 0.1, washAmp: -8, seed: 151 + v,
    washEnv: (t) => Math.min(1, t / 0.08) * Math.exp(-Math.max(0, t - 0.25) / 0.35),
    pick: (rr) => { const d = rr.range(0.75, 1.15) * (v ? 0.9 : 1); return { script: SCRIPTS.ooh(d), glide: arch(0.15, 0.08, v ? 0.3 : 0.22), rough: 0.18, tilt: 2000 }; },
  });
}
function crowdGasp(r, v) {
  // a sharp collective inhale - mostly breath - and a few startled "huh!"s
  return crowdShot(r, {
    sec: 1.0, count: 46, spread: 0.035, bright: 0.9, washAmp: -3, seed: 161 + v, tail: 0.7, wet: 0.45,
    washEnv: (t) => Math.pow(clamp(t / 0.16, 0, 1), 1.6) * Math.exp(-Math.max(0, t - 0.2) / 0.11),
    pick: (rr, P) => (rr() < 0.72
      ? { script: SCRIPTS.gasp(rr.range(0.3, 0.42)), glide: arch(0.6, 0.2, 0.05), rough: 0.1 }
      : { script: SCRIPTS.huh(rr.range(0.2, 0.3)), f0: P.f0 * 1.3, glide: arch(0.2, 0.2, 0.1), g: 0.8, at: 0.05 }),
  });
}
function crowdBoo(r, v) {
  // long, low, falling /u/ - men dominate, no highs, no applause
  return crowdShot(r, {
    sec: 2.8, count: 64, spread: 0.22, bright: 0, washAmp: -10, seed: 171 + v, tail: 1.3,
    washEnv: (t) => Math.min(1, t / 0.3) * Math.exp(-Math.max(0, t - 1.2) / 0.6),
    pick: (rr, P) => { const d = rr.range(1.3, 2.3); return { script: SCRIPTS.boo(d), f0: (P.woman ? rr.range(205, 250) : rr.range(105, 165)), glide: arch(0.12, 0.05, 0.2), rough: 0.2, tilt: 1300 }; },
  });
}
function crowdCount(r, n) {
  // ONE! TWO! THREE! - tight onset (people shouting on a beat), shouted pitch falling
  const word = ['one', 'two', 'three'][n - 1];
  return crowdShot(r, {
    sec: 1.1, count: 72, spread: 0.028, f0mul: 1.12 + 0.05 * n, bright: 0.5, washAmp: -13, seed: 181 + n, tail: 0.8, wet: 0.4,
    washEnv: (t) => Math.min(1, t / 0.03) * Math.exp(-Math.max(0, t - 0.12) / 0.14),
    pick: (rr) => ({ script: SCRIPTS[word](rr.range(0.92, 1.1)), glide: arch(0.12, 0.06, 0.16), rough: 0.3, tilt: 3000 }),
  });
}
function crowdRoar(r) {
  // the three-count lands: everything they have, held, then slowly breaking into applause
  const sec = 6.0;
  return crowdShot(r, {
    sec, count: 150, spread: 0.5, f0mul: 1.2, bright: 0.9, washAmp: -0.5, seed: 191, whistles: 9, tail: 1.6, wet: 0.7,
    washEnv: (t) => Math.min(1, t / 0.18) * Math.exp(-Math.max(0, t - 2.6) / 1.3),
    pick: (rr) => { const d = rr.range(1.0, 2.6); return { script: SCRIPTS[rr.pick(['yeah', 'woo', 'aah', 'yeah', 'woo'])](d), glide: arch(0.3, 0.18, 0.2), rough: 0.34, at: rr() < 0.55 ? rr.range(0, 3.0) : 0 }; },
    clapRate: { rate: (t) => 1100 * Math.min(1, t / 0.6) * Math.exp(-Math.max(0, t - 3.2) / 1.5), amp: () => 1, dB: -8 },
  });
}
function chantLoop(r) {
  // stadium rhythm, 2 bars at 120 BPM: clap . clap . clap clap clap .  with a shouted "HEY" on the last clap
  const L = 4.0, beat = 0.25, cl = buf(L), st = buf(L), vo = buf(L);
  const hits = [0, 2, 4, 5, 6, 8, 10, 12, 13, 14];
  const K = [];
  for (let k = 0; k < 10; k++) K.push(burst(r, 0.03, { f: r.range(1000, 2400), q: r.range(1.2, 2.4), att: 0.0005, tau: r.range(0.003, 0.006) }));
  for (const h of hits) {
    // a few hundred people on the beat: +-22 ms of human spread
    for (let c = 0; c < 130; c++) place(cl, K[Math.floor(r() * K.length)], (h * beat + 0.08 + r.gauss() * 0.022 + L) % L, r.range(0.3, 1), true);
    // feet on the bleachers under every clap
    for (let c = 0; c < 24; c++) place(st, burst(r, 0.08, { f: r.range(170, 260), q: 1.5, att: 0.002, tau: 0.02 }), (h * beat + 0.08 + r.gauss() * 0.028 + L) % L, 1, true);
  }
  for (const h of [6, 14]) {
    for (let c = 0; c < 56; c++) {
      const P = person(r);
      const x = voice(r, SCRIPTS.hey(r.range(0.3, 0.4)), { f0: P.f0 * 1.15, tract: P.tract, glide: arch(0.2, 0.1, 0.18), rough: 0.3 });
      place(vo, x, (h * beat + 0.07 + Math.abs(r.gauss()) * 0.03 + L) % L, r.range(0.4, 1), true);
    }
  }
  const o = E(cl, 0); mixInto(o, E(st, -5), 0); mixInto(o, E(vo, -4), 0);
  const out = E(spaceFold(o, { wet: 0.45, tail: 0.9, slap: 0.12, bright: 4500, seed: 201 }), 0);
  mixInto(out, E(xfadeLoop(wash(r, L + 1, { bright: 0.4, motion: 0.5 }), L, 1), -13), 0);
  return loopFilter(out, crowdTone);
}

// ---------------------------------------------------------------- catalogue
// name: { make(r, v), n (variations), lufs (momentary-max target) | peakDb (level by peak instead),
//         loop (seconds; exact loop length), seed }
export const SOUNDS = {
  wr_sub:        { n: 3, make: subThump, peakDb: -2.5, seed: 1000 },
  wr_slam:       { n: 3, make: slam, lufs: -15, seed: 1100 },
  wr_body:       { n: 3, make: body, lufs: -17, seed: 1200 },
  wr_strike_l:   { n: 4, make: strikeLight, lufs: -19, seed: 1300 },
  wr_strike_h:   { n: 3, make: strikeHeavy, lufs: -16.5, seed: 1400 },
  wr_block:      { n: 2, make: block, lufs: -19, seed: 1500 },
  wr_reversal:   { n: 2, make: reversal, lufs: -16, seed: 1600 },
  wr_whoosh:     { n: 2, make: whooshBig, lufs: -20, seed: 1700 },
  wr_dive:       { n: 1, make: dive, lufs: -18, seed: 1800 },
  wr_rope_stretch: { n: 1, make: ropeStretch, lufs: -20, seed: 1900 },
  wr_rope_twang: { n: 2, make: ropeTwang, lufs: -16.5, seed: 2000 },
  wr_rope_snap:  { n: 1, make: ropeSnap, lufs: -15, seed: 2100 },
  wr_post:       { n: 2, make: post, lufs: -16, seed: 2200 },
  wr_crash:      { n: 2, make: crash, lufs: -15, seed: 2300 },
  wr_dizzy:      { n: 1, make: dizzy, lufs: -24, seed: 2400 },
  wr_bell:       { n: 1, make: bell, lufs: -15, seed: 2500 },
  wr_ui_callout: { n: 1, make: uiCallout, lufs: -18, seed: 2600 },
  wr_ui_big:     { n: 1, make: uiBig, lufs: -15.5, seed: 2700 },
  wr_ui_prompt:  { n: 1, make: uiPrompt, lufs: -23, seed: 2800 },
  wr_slow_in:    { n: 1, make: slowIn, lufs: -19, seed: 2900 },
  wr_slow_out:   { n: 1, make: slowOut, lufs: -20, seed: 3000 },
  wr_fin_start:  { n: 1, make: finStart, lufs: -13.5, seed: 3100 },
  wr_fin_riser:  { n: 1, make: finRiser, lufs: -16, seed: 3200 },
  wr_fin_apex:   { n: 1, make: finApex, lufs: -20, seed: 3300 },
  wr_fin_impact: { n: 1, make: finImpact, lufs: -12.5, seed: 3400 },
  wr_loop_crowd_lo: { n: 1, make: (r) => crowdLoop(r, false), lufs: -24, loop: 10, seed: 4000 },
  wr_loop_crowd_hi: { n: 1, make: (r) => crowdLoop(r, true), lufs: -20, loop: 10, seed: 4100 },
  wr_loop_chant: { n: 1, make: chantLoop, lufs: -19, loop: 4, seed: 4200 },
  wr_crowd_pop:  { n: 3, make: crowdPop, lufs: -16, seed: 4300 },
  wr_crowd_ooh:  { n: 2, make: crowdOoh, lufs: -17, seed: 4400 },
  wr_crowd_gasp: { n: 2, make: crowdGasp, lufs: -18.5, seed: 4500 },
  wr_crowd_boo:  { n: 2, make: crowdBoo, lufs: -17, seed: 4600 },
  wr_crowd_count: { n: 3, make: (r, v) => crowdCount(r, v + 1), lufs: -15.5, seed: 4700 },
  wr_crowd_roar: { n: 1, make: crowdRoar, lufs: -14, seed: 4800 },
};
export { V as VOWELS };
