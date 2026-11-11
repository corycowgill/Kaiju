// Wrestling VFX: the impact language (strike bursts, guard flash, parry ring,
// dizzy stars), slams (persistent ground cracks, dust rings, debris, ripples,
// water columns), throws (speed lines, drag dust, building punch-through, rope
// flash / snap), state and meter effects (momentum aura, exhaustion steam,
// grapple grind, telegraphs), the three finishers and the ceremony (entrance
// bursts, post pyro, confetti).
// OWNER: VFX engineer. Driven by bus events plus read-only fighter state; the
// combat core never calls in here.
//
// How it draws: EVERYTHING here is one instanced-sprite program on two meshes.
//  - burst: a ring buffer of sprites whose whole life (ballistics with drag,
//    size and alpha curves, erosion dissolve) is evaluated in the vertex shader
//    from attributes written once at spawn. No per-frame CPU work per particle;
//    the buffer is uploaded only on frames that spawn, and only the dirty range.
//    The first DECALS slots are a separate ring for long-lived ground cracks so
//    bursts never overwrite them.
//  - live: a small batch rewritten every frame for things that follow a bone
//    or a meter (stun stars, telegraph glints, guard, aura ring, reticles).
// Shapes come from one procedural 512x512 atlas (16 tiles: R = mask, G = hot
// core / shading, B = erosion map). Blending is premultiplied, so additive
// glows and normal-blended dust / debris / decals share the draw: 2 draw calls,
// 1 program, 1 texture for the whole mode, nothing allocated at spawn.
// Orientation modes: billboard, stretched along velocity (sparks, speed
// lines), flat on the ground (rings, cracks), beam between two points
// (columns, lightning, rope flashes), plane facing a normal (impact rings).
// The 'wrestlingFx' vfx builder stages the material so the START prewarm links
// it. The only real light is one pooled light (acquirePooledLight) on the
// biggest hits. Tiers scale counts and drop decorative layers; every read that
// matters to play (telegraphs, guard / parry, stun) exists on every tier.
import * as THREE from 'three';
import { EV } from './events.js';
import { registerBuilder, acquirePooledLight } from '../vfx.js';
import { fireAtomicBreath } from '../atomicBlast.js';
import { isMobile, Q_HIGH, Q_LOW } from '../quality.js';

const FULL = !isMobile && !Q_LOW;                 // desktop MED / HIGH: every layer
const PM = !isMobile ? (Q_HIGH ? 1 : Q_LOW ? 0.35 : 0.6) : (Q_LOW ? 0.2 : 0.35); // particle count multiplier
const CAP = !isMobile ? (Q_HIGH ? 1792 : 1024) : (Q_LOW ? 384 : 640);            // burst ring (incl. decals)
const DECALS = !isMobile ? 16 : 8;                // persistent ground cracks
const LIVE_CAP = 72;
const STRIDE = 24;
const MAX_ANG = isMobile ? 0.75 : 1.5;            // sprite size cap as a fraction of view distance (overdraw)
const CRACK_LIFE = 70;                            // s a ground crack stays (fades over the last fifth)

// atlas tiles
const T_GLOW = 0, T_RING = 1, T_GLINT = 2, T_STREAK = 3, T_PUFF = 4, T_CRACK = 5, T_CHIP = 6, T_SHELL = 7,
  T_BURST = 8, T_ARC = 9, T_COL = 10, T_RIPPLE = 11, T_RETICLE = 12, T_BOLT = 13, T_STAR = 14, T_FLAME = 15;
// orientation modes
const M_BILL = 0, M_VEL = 1, M_FLAT = 2, M_BEAM = 3, M_PLANE = 4;

// ---- Atlas (painted once, lazily; no DOM) ----------------------------------

function _atlas() {
  const N = 512, TS = 128, data = new Uint8Array(N * N * 4);
  // deterministic value noise
  let seed = 1337;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const G = 64, lat = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) lat[i] = rand();
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lat[((yi & 63) << 6) | (xi & 63)], b = lat[((yi & 63) << 6) | ((xi + 1) & 63)];
    const c = lat[(((yi + 1) & 63) << 6) | (xi & 63)], d = lat[(((yi + 1) & 63) << 6) | ((xi + 1) & 63)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 9.2, y * 2.1 + 3.7) * 0.3 + vn(x * 4.3 + 1.1, y * 4.3 + 7.9) * 0.15;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const gs = (x, w) => Math.exp(-(x * x) / (w * w));
  const out = [0, 0, 1];
  const paint = (tile, fn) => {
    const ox = (tile % 4) * TS, oy = Math.floor(tile / 4) * TS;
    for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
      const u = (px + 0.5) / TS * 2 - 1, v = (py + 0.5) / TS * 2 - 1;
      out[0] = 0; out[1] = 0; out[2] = 1;
      fn(u, v, Math.hypot(u, v), Math.atan2(v, u));
      // every tile fades out before its border so mips never bleed into a neighbour
      const edge = 1 - ss(0.9, 0.985, Math.max(Math.abs(u), Math.abs(v)));
      const i = ((oy + py) * N + ox + px) * 4;
      data[i] = Math.min(255, Math.max(0, out[0] * edge) * 255);
      data[i + 1] = Math.min(255, Math.max(0, out[1] * edge) * 255);
      data[i + 2] = Math.min(255, Math.max(0, out[2]) * 255);
      data[i + 3] = 255;
    }
  };
  // 0 soft glow
  paint(T_GLOW, (u, v, r) => { out[0] = gs(r, 0.47) * (1 - ss(0.8, 1, r)); out[1] = gs(r, 0.18); });
  // 1 shock ring: a sharp crest with a soft wake inside it
  paint(T_RING, (u, v, r) => {
    const d = r - 0.8;
    out[0] = gs(d, 0.035) + (d < 0 ? 0.4 * gs(d, 0.2) : 0);
    out[1] = gs(d, 0.02);
  });
  // 2 four-point glint
  paint(T_GLINT, (u, v, r) => {
    const au = Math.abs(u), av = Math.abs(v);
    const s = Math.exp(-au * 20 - av * 2.6) + Math.exp(-av * 20 - au * 2.6) + gs(r, 0.16);
    out[0] = s * (1 - ss(0.7, 0.95, r)); out[1] = gs(r, 0.1) + 0.5 * (Math.exp(-au * 34 - av * 4) + Math.exp(-av * 34 - au * 4));
  });
  // 3 streak: bright head (top), tapering tail
  paint(T_STREAK, (u, v) => {
    const s = (v + 1) / 2, head = 1 - ss(0.78, 0.95, s);
    out[0] = gs(u, 0.06 + 0.2 * s) * Math.pow(s, 1.4) * head; out[1] = gs(u, 0.07) * s * s * head;
  });
  // 4 dust / smoke puff: lumpy blob, top-lit, with an erosion map
  paint(T_PUFF, (u, v, r) => {
    const n = fbm(u * 2.4 + 5, v * 2.4 + 11), n2 = fbm(u * 3.6 + 21, v * 3.6 + 2);
    out[0] = 1 - ss(0.3, 0.9, r + (n - 0.5) * 0.55);
    out[1] = Math.min(1, Math.max(0, 0.45 + 0.4 * v + (n - 0.5) * 0.7));
    out[2] = Math.min(1, 0.2 + 0.8 * (n2 * 0.65 + (1 - r) * 0.5));
  });
  // 5 ground crack: jagged radial fractures with branches and two broken crater rings
  {
    const segs = []; // x0, y0, x1, y1, w0, w1
    const crack = (x, y, ang, len, w, steps, branch) => {
      for (let i = 0; i < steps; i++) {
        const a = ang + (rand() - 0.5) * 0.9, l = len / steps * (0.7 + rand() * 0.6);
        const nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l, nw = w * (1 - (i + 1) / (steps + 0.6));
        if (Math.hypot(nx, ny) > 0.9) break;
        segs.push(x, y, nx, ny, w * (1 - i / (steps + 0.6)), nw);
        if (branch && rand() < 0.5) crack(nx, ny, a + (rand() < 0.5 ? 0.8 : -0.8), len * 0.4, nw, 2, false);
        x = nx; y = ny;
      }
    };
    for (let i = 0; i < 9; i++) crack(0, 0, i / 9 * Math.PI * 2 + rand() * 0.4, 0.62 + rand() * 0.3, 0.034, 5, true);
    for (const rr of [0.3, 0.56]) for (let i = 0; i < 14; i++) {
      if (rand() < 0.35) continue;
      const a0 = i / 14 * Math.PI * 2, a1 = a0 + Math.PI * 2 / 14, r0 = rr + (rand() - 0.5) * 0.07, r1 = rr + (rand() - 0.5) * 0.07;
      segs.push(Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0.014, 0.014);
    }
    paint(T_CRACK, (u, v, r) => {
      let line = 0, core = 0;
      for (let i = 0; i < segs.length; i += 6) {
        const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2] - ax, by = segs[i + 3] - ay;
        const h = Math.min(1, Math.max(0, ((u - ax) * bx + (v - ay) * by) / (bx * bx + by * by)));
        const d = Math.hypot(u - ax - bx * h, v - ay - by * h), w = segs[i + 4] + (segs[i + 5] - segs[i + 4]) * h + 0.004;
        line = Math.max(line, gs(d, w) + 0.35 * gs(d, w * 4));
        core = Math.max(core, gs(d, w * 0.7));
      }
      out[0] = Math.min(1, line + 0.55 * gs(r, 0.3)) * (1 - ss(0.8, 0.95, r));
      out[1] = core * (1 - ss(0.7, 0.95, r));
    });
  }
  // 6 chip: an angular shard with two facets (debris, confetti, turnbuckle bits)
  paint(T_CHIP, (u, v) => {
    const pl = [[1, 0.1, 0.55], [-0.8, 0.6, 0.6], [-0.5, -0.86, 0.62], [0.6, -0.8, 0.7], [0.3, 0.95, 0.72]];
    let m = 1;
    for (const p of pl) { const l = Math.hypot(p[0], p[1]); m = Math.min(m, (p[2] - (u * p[0] + v * p[1]) / l) / 0.05); }
    out[0] = Math.min(1, Math.max(0, m)); out[1] = u * 0.5 + v * 0.8 > 0.05 ? 0.95 : 0.3;
  });
  // 7 shell: a sphere seen as a disc (faint centre, bright limb)
  paint(T_SHELL, (u, v, r) => { const m = 1 - ss(0.86, 0.95, r); out[0] = (0.1 + 0.9 * Math.pow(r / 0.9, 5)) * m; out[1] = Math.pow(Math.min(1, r / 0.9), 12) * m; });
  // 8 starburst: uneven radial rays around a hot core
  paint(T_BURST, (u, v, r, a) => {
    const s1 = Math.pow(Math.abs(Math.sin(a * 3.5 + 1.3)), 16), s2 = Math.pow(Math.abs(Math.sin(a * 5.5 + 0.4)), 26) * 0.8;
    out[0] = gs(r, 0.3) + (s1 * (1 - ss(0.25, 0.92, r)) + s2 * (1 - ss(0.15, 0.7, r))) * Math.exp(-r * 1.1);
    out[1] = gs(r, 0.17) + 0.5 * s1 * Math.exp(-r * 5);
  });
  // 9 crescent: a thick arc opening downwards, tapered to points
  paint(T_ARC, (u, v, r) => {
    const da = Math.atan2(u, v), taper = Math.max(0, 1 - (da / 1.3) * (da / 1.3));
    out[0] = gs(r - 0.7, 0.03 + 0.1 * taper) * taper; out[1] = gs(r - 0.72, 0.045 * taper + 0.001) * taper;
  });
  // 10 column: core + halo across, streaky along, flared base, fading top
  paint(T_COL, (u, v) => {
    const s = (v + 1) / 2, n = fbm(u * 5 + 3, v * 1.3 + 8), end = ss(0, 0.06, s) * (1 - ss(0.5, 0.98, s));
    const w = 1 + 0.9 * (1 - ss(0, 0.2, s));
    out[0] = (0.5 * gs(u, 0.5 * w) + gs(u, 0.2 * w)) * end * (0.6 + 0.4 * n);
    out[1] = gs(u, 0.11 * w) * end;
    out[2] = Math.min(1, 0.25 + 0.75 * (n * 0.7 + (1 - s) * 0.45));
  });
  // 11 ripple: three thin concentric rings
  paint(T_RIPPLE, (u, v, r) => { out[0] = 0.9 * gs(r - 0.84, 0.022) + 0.55 * gs(r - 0.68, 0.028) + 0.3 * gs(r - 0.5, 0.034); out[1] = 0.6 * gs(r - 0.84, 0.012); });
  // 12 reticle: a segmented ring, a dashed inner ring and four ticks
  paint(T_RETICLE, (u, v, r, a) => {
    const gap = ss(0.1, 0.16, Math.abs(Math.sin(a * 2 + Math.PI / 2))), dash = ss(0.2, 0.3, Math.abs(Math.sin(a * 8)));
    const tick = Math.max(gs(u, 0.022) * ss(0.56, 0.6, Math.abs(v)), gs(v, 0.022) * ss(0.56, 0.6, Math.abs(u))) * (1 - ss(0.86, 0.9, r));
    out[0] = Math.max(gs(r - 0.76, 0.03) * gap, 0.7 * gs(r - 0.48, 0.018) * dash, tick);
    out[1] = 0.5 * out[0];
  });
  // 13 lightning segment: runs bottom to top, starts and ends on the axis, one fork
  paint(T_BOLT, (u, v) => {
    const s = (v + 1) / 2, env = Math.sin(Math.PI * Math.min(1, Math.max(0, s)));
    const x = ((vn(s * 7 + 3, 1.5) - 0.5) * 0.7 + (vn(s * 19 + 8, 4.5) - 0.5) * 0.25) * env;
    const fx = x + (s - 0.42) * 0.9, fork = s > 0.42 ? (1 - ss(0.42, 0.85, s)) : 0;
    out[0] = gs(u - x, 0.035) + 0.4 * gs(u - x, 0.15) + fork * (0.8 * gs(u - fx, 0.025) + 0.25 * gs(u - fx, 0.1));
    out[1] = gs(u - x, 0.02) + 0.6 * fork * gs(u - fx, 0.014);
  });
  // 14 five-point star (dizzy stars)
  paint(T_STAR, (u, v, r) => {
    const k1x = 0.809016994, k1y = -0.587785252;
    let px = Math.abs(u), py = v;
    let d = Math.max(k1x * px + k1y * py, 0); px -= 2 * d * k1x; py -= 2 * d * k1y;
    d = Math.max(-k1x * px + k1y * py, 0); px -= 2 * d * -k1x; py -= 2 * d * k1y;
    px = Math.abs(px); py -= 0.8;
    const bax = 0.45 * -k1y, bay = 0.45 * k1x - 1, h = Math.min(0.8, Math.max(0, (px * bax + py * bay) / (bax * bax + bay * bay)));
    const sd = Math.hypot(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
    out[0] = 1 - ss(-0.03, 0.03, sd); out[1] = Math.max(0, 1 - r * 1.5);
  });
  // 15 flame wisp: a wobbling teardrop that erodes from the tip down
  paint(T_FLAME, (u, v) => {
    const s = (v + 1) / 2, n = fbm(u * 3 + 14, v * 2 + 6);
    const w = 0.5 * Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, s)), 0.55)) * (1 - 0.6 * s) + 0.001;
    const x = (vn(s * 4 + 2, 9.5) - 0.5) * 0.5 * s;
    out[0] = (1 - ss(w * 0.35, w, Math.abs(u - x))) * ss(0, 0.08, s);
    out[1] = (1 - ss(0, w * 0.6, Math.abs(u - x))) * (1 - s);
    out[2] = Math.min(1, 0.2 + 0.8 * (n * 0.6 + (1 - s) * 0.55));
  });
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

// ---- The sprite program ------------------------------------------------------

const _VS = `
  uniform float uT; uniform float uMaxAng;
  attribute vec4 aP0;   // xyz spawn position, w spawn time
  attribute vec4 aVel;  // xyz velocity (beam: the full vector; plane: the normal), w life
  attribute vec4 aSz;   // size0, size1, aspect / stretch (negative: flutter), rotation
  attribute vec4 aPh;   // drag (beam: growth rate), gravity, spin, tile + hold
  attribute vec4 aCol;  // rgb, intensity
  attribute vec4 aFx;   // additive, mode, fade-in, erosion
  varying vec2 vUv; varying vec4 vCol; varying vec2 vK;
  void main() {
    float age = uT - aP0.w;
    float k = age / max(aVel.w, 0.0001);
    if (age < 0.0 || k >= 1.0 || aCol.a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float mode = aFx.y;
    float tile = floor(aPh.w + 0.001), hold = fract(aPh.w + 0.001);
    vec2 c = position.xy;
    vec3 p = aP0.xyz, v = aVel.xyz;
    float size = mix(aSz.x, aSz.y, aSz.y >= aSz.x ? 1.0 - (1.0 - k) * (1.0 - k) : k);
    float asp = abs(aSz.z);
    float rot = aSz.w + aPh.z * age;
    float cs = cos(rot), sn = sin(rot);
    vec2 uv = c + 0.5;
    vec4 mv;
    if (mode < 2.5) {
      float dr = aPh.x;
      float td = dr > 0.001 ? (1.0 - exp(-dr * age)) / dr : age;
      p += v * td; p.y -= 0.5 * aPh.y * age * age;
      if (aPh.y > 0.0) p.y = max(p.y, 0.25);
      if (mode < 0.5) {
        mv = viewMatrix * vec4(p, 1.0);
        size = min(size, uMaxAng * -mv.z);
        if (aSz.z < 0.0) asp *= cos(age * 9.0 + aSz.w * 7.0);
        vec2 o = vec2(c.x * asp, c.y) * size;
        mv.xy += vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs);
      } else if (mode < 1.5) {
        vec3 vel = v * exp(-dr * age); vel.y -= aPh.y * age;
        mv = viewMatrix * vec4(p, 1.0);
        vec2 d = (viewMatrix * vec4(vel, 0.0)).xy;
        float l = length(d); d = l > 0.0001 ? d / l : vec2(0.0, 1.0);
        size = min(size, uMaxAng * -mv.z);
        mv.xy += d * (c.y * size * asp) + vec2(-d.y, d.x) * (c.x * size);
      } else {
        vec2 o = vec2(c.x * asp, c.y) * size;
        p.xz += vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs);
        mv = viewMatrix * vec4(p, 1.0);
      }
    } else if (mode < 3.5) {
      float grow = aPh.x > 0.0 ? min(1.0, k * aPh.x) : 1.0;
      vec3 q = p + v * (uv.y * grow);
      q += normalize(cross(v, cameraPosition - q)) * (c.x * size);
      mv = viewMatrix * vec4(q, 1.0);
    } else {
      vec3 n = normalize(v);
      vec3 t = abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), n));
      vec3 b = cross(n, t);
      vec2 o = vec2(c.x * asp, c.y) * size;
      o = vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs);
      mv = viewMatrix * vec4(p + t * o.x + b * o.y, 1.0);
    }
    float a = aCol.a * (aFx.z > 0.0 ? clamp(k / aFx.z, 0.0, 1.0) : 1.0) * (1.0 - smoothstep(hold, 1.0, k));
    a *= smoothstep(4.0, 12.0, -mv.z);   // never a screen-filling sprite when the camera is inside it
    vUv = (vec2(mod(tile, 4.0), floor(tile * 0.25)) + uv) * 0.25;
    vCol = vec4(aCol.rgb, a);
    vK = vec2(aFx.w * k * 1.05, aFx.x);
    gl_Position = projectionMatrix * mv;
  }`;
const _FS = `
  uniform sampler2D uAtlas;
  varying vec2 vUv; varying vec4 vCol; varying vec2 vK;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    float a = t.r * vCol.a * smoothstep(vK.x, vK.x + 0.18, t.b);
    vec3 hot = mix(vCol.rgb, vec3(max(vCol.r, max(vCol.g, vCol.b))), 0.75) * 1.7;
    vec3 col = mix(vCol.rgb * (0.7 + 0.6 * t.g), mix(vCol.rgb, hot, t.g), vK.y);
    gl_FragColor = vec4(col * a, a * (1.0 - vK.y));   // premultiplied: additive sprites write no alpha
    #include <colorspace_fragment>
  }`;

let _S = null; // { mat, burst, live }: built once per page, reused across restarts
function _quad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.userData.shared = g.userData.template = true; // a scene teardown must not dispose it
  return g;
}
function _batch(mat, cap, order) {
  const arr = new Float32Array(cap * STRIDE);
  const ib = new THREE.InstancedInterleavedBuffer(arr, STRIDE, 1);
  ib.setUsage(THREE.DynamicDrawUsage);
  const g = _quad();
  ['aP0', 'aVel', 'aSz', 'aPh', 'aCol', 'aFx'].forEach((n, i) => g.setAttribute(n, new THREE.InterleavedBufferAttribute(ib, 4, i * 4)));
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false; mesh.renderOrder = order; mesh.visible = false;
  // pending: what the GPU copy still lacks (0 nothing, 1 the range, 2 everything); cleared when three uploads
  const Bt = { arr, ib, g, mesh, cap, lo: 1e9, hi: -1, until: 0, cur: 0, dcur: 0, n: 0, pending: 2, range: { start: 0, count: 0 } };
  ib.onUpload(() => { Bt.pending = 0; });
  return Bt;
}
function _sys() {
  if (_S) return _S;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uMaxAng: { value: MAX_ANG }, uAtlas: { value: _atlas() } },
    vertexShader: _VS, fragmentShader: _FS,
    transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  _S = { mat, burst: _batch(mat, CAP, 5), live: _batch(mat, LIVE_CAP, 6) };
  return _S;
}

// Prewarm: game.js stages every builder behind the loading screen and links
// what it finds. One visible sprite on the real material is the whole set.
let _stage = null;
registerBuilder('wrestlingFx', (opts) => {
  if (!_stage) {
    _stage = _batch(_sys().mat, 1, 5);
    _stage.arr.set([0, 2, 0, 0, 0, 1, 0, 1, 4, 4, 1, 0, 0, 0, 0, T_GLOW + 0.9, 1, 1, 1, 0.5, 1, M_BILL, 0, 0]);
    _stage.mesh.visible = true;
  }
  opts.world.scene.add(_stage.mesh);
  return null;
});

// ---- Palette -------------------------------------------------------------------

// [main (the beam colour when the config has one), accent]
const SIG = { godzilla: [0x66ff66, 0xc8ff7a], ghidorah: [0xffee66, 0x66ccff], mecha: [0xff3366, 0xff8800] };
const C = (r, g, b) => new THREE.Color(r, g, b);
const WHITE = C(1, 1, 1), GOLD = C(1, 0.8, 0.28), GUARD = C(0.5, 0.78, 1), STARY = C(1, 0.88, 0.25), DANGER = C(1, 0.22, 0.1);
const DUST = C(0.52, 0.45, 0.37), EARTH = C(0.13, 0.105, 0.08), GRASS = C(0.12, 0.19, 0.07), CONCRETE = C(0.56, 0.54, 0.51);
const STEAM = C(0.82, 0.85, 0.9), WATER = C(0.62, 0.76, 0.9), CHAR = C(0.03, 0.026, 0.022), STEEL = C(0.5, 0.52, 0.58), SPARK = C(1, 0.62, 0.25);

const rnd = Math.random;
const rr = (a, b) => a + rnd() * (b - a);
const cnt = (n) => Math.max(1, Math.round(n * PM));
const TAU = Math.PI * 2;

/** @returns {{ start, update, updateIdle, dispose, stats }} */
export function createVfx(ctx, W) {
  const offs = [];
  let S = null, B = null, L = null;
  let T = 0;             // effect clock: simulation seconds (frozen by hit-stop, stretched by slow-mo)
  let spawned = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const _col = new THREE.Color(), _col2 = new THREE.Color();
  const _bz = { origin: new THREE.Vector3(), dir: new THREE.Vector3() };

  // ---- writers ----
  function _write(Bt, i, tile, mode, x, y, z, vx, vy, vz, life, s0, s1, col, a, add, drag, grav, rot, spin, asp, fin, hold, erode, t0) {
    const A = Bt.arr, o = i * STRIDE;
    A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = t0;
    A[o + 4] = vx; A[o + 5] = vy; A[o + 6] = vz; A[o + 7] = life;
    A[o + 8] = s0; A[o + 9] = s1; A[o + 10] = asp; A[o + 11] = rot;
    A[o + 12] = drag; A[o + 13] = grav; A[o + 14] = spin; A[o + 15] = tile + Math.min(0.98, hold);
    A[o + 16] = col.r; A[o + 17] = col.g; A[o + 18] = col.b; A[o + 19] = a;
    A[o + 20] = add; A[o + 21] = mode; A[o + 22] = fin; A[o + 23] = erode;
    if (i < Bt.lo) Bt.lo = i;
    if (i > Bt.hi) Bt.hi = i;
  }
  /** One burst sprite. a: intensity (additive may exceed 1). delay: seconds until it appears. */
  function P(tile, mode, x, y, z, vx, vy, vz, life, s0, s1, col, a, add, drag = 0, grav = 0, rot = 0, spin = 0, asp = 1, fin = 0, hold = 0, erode = 0, delay = 0) {
    if (!B) return;
    const i = DECALS + B.cur;
    B.cur = (B.cur + 1) % (CAP - DECALS);
    _write(B, i, tile, mode, x, y, z, vx, vy, vz, life, s0, s1, col, a, add, drag, grav, rot, spin, asp, fin, hold, erode, T + delay);
    if (T + delay + life > B.until) B.until = T + delay + life;
    spawned++;
  }
  /** A long-lived ground decal (its own ring: bursts never overwrite it). */
  function D(tile, x, z, size, col, a, life, rot) {
    if (!B) return;
    const i = B.dcur;
    B.dcur = (B.dcur + 1) % DECALS;
    _write(B, i, tile, M_FLAT, x, 0.14, z, 0, 0, 0, life, size, size, col, a, 0, 0, 0, rot, 0, 1, 0.004, 0.8, 0, T);
    if (T + life > B.until) B.until = T + life;
  }
  /** One live sprite, valid for this frame only. (ax, ay, az): beam vector / plane normal. */
  function LV(tile, mode, x, y, z, size, col, a, add, rot = 0, asp = 1, ax = 0, ay = 1, az = 0) {
    if (!L || L.n >= LIVE_CAP) return;
    _write(L, L.n++, tile, mode, x, y, z, ax, ay, az, 1, size, size, col, a, add, 0, 0, rot, 0, asp, 0, 0.97, 0, T);
  }
  /** Hand the rows written since the last flush to three (one reused range object: no allocation). */
  function _flush(Bt, whole) {
    const ib = Bt.ib, r = Bt.range;
    if (whole || Bt.pending === 2) {
      if (!whole && Bt.hi < 0) return;
      ib.updateRanges.length = 0; Bt.pending = 2; ib.needsUpdate = true;
    } else if (Bt.hi >= 0) {
      let lo = Bt.lo * STRIDE, hi = (Bt.hi + 1) * STRIDE;
      if (Bt.pending === 1) { lo = Math.min(lo, r.start); hi = Math.max(hi, r.start + r.count); } // not drawn since: widen
      r.start = lo; r.count = hi - lo;
      ib.updateRanges.length = 0; ib.updateRanges.push(r);
      Bt.pending = 1; ib.needsUpdate = true;
    }
    Bt.lo = 1e9; Bt.hi = -1;
  }

  // ---- building blocks ----
  /** Sparks in a cone around (dx, dy, dz). */
  function sparks(x, y, z, dx, dy, dz, n, sp0, sp1, spread, col, size, life, grav, a = 1.6) {
    for (let i = 0; i < n; i++) {
      let vx = dx + (rnd() - 0.5) * 2 * spread, vy = dy + (rnd() - 0.5) * 2 * spread, vz = dz + (rnd() - 0.5) * 2 * spread;
      const l = Math.hypot(vx, vy, vz) || 1, sp = rr(sp0, sp1) / l;
      vx *= sp; vy *= sp; vz *= sp;
      P(T_STREAK, M_VEL, x, y, z, vx, vy, vz, life * rr(0.6, 1.3), size * rr(0.7, 1.3), size * 0.3, col, a, 1, 1.6, grav, 0, 0, rr(4, 7));
    }
  }
  /** Debris chips thrown up and out (normal-blended, tumbling, they land and fade). */
  function chips(x, y, z, dx, dz, n, out0, out1, up0, up1, col, s0, s1, life = 1.5) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, o = rr(out0, out1);
      const vx = Math.cos(a) * o + dx * out1, vz = Math.sin(a) * o + dz * out1, sz = rr(s0, s1), k = rr(0.7, 1.15);
      _col.copy(col).multiplyScalar(k);
      P(T_CHIP, M_BILL, x + Math.cos(a) * 2, y, z + Math.sin(a) * 2, vx, rr(up0, up1), vz, life * rr(0.8, 1.2), sz, sz, _col, 1, 0, 0.5, 70, rnd() * TAU, rr(-9, 9), rr(0.6, 1.4), 0, 0.7);
    }
  }
  /** A ring of dust puffs rolling outward along the ground. */
  function dustRing(x, z, n, r0, sp0, sp1, s0, s1, life, col, a) {
    const ph = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const an = ph + i / n * TAU + rr(-0.15, 0.15), cs = Math.cos(an), sn = Math.sin(an), sp = rr(sp0, sp1);
      P(T_PUFF, M_BILL, x + cs * r0, rr(1.5, 3.5), z + sn * r0, cs * sp, rr(1, 5), sn * sp, life * rr(0.8, 1.25), s0 * rr(0.8, 1.2), s1 * rr(0.8, 1.25), col, a, 0, 2.6, -1.5, rnd() * TAU, rr(-0.6, 0.6), 1, 0.08, 0.25, 1);
    }
  }
  /** Flat expanding ground ring. */
  function gring(x, z, r0, r1, life, col, a, tile = T_RING, delay = 0, y = 0.35) {
    P(tile, M_FLAT, x, y, z, 0, 0, 0, life, r0 * 2.5, r1 * 2.5, col, a, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0.2, 0, delay);
  }
  /** Jagged bolt from a to b: a chain of beam segments, with a re-strike. */
  function bolt(x0, y0, z0, x1, y1, z1, segs, jit, width, col, a, life, delay = 0) {
    let px = x0, py = y0, pz = z0;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs, j = i < segs ? jit : 0;
      const nx = x0 + (x1 - x0) * t + rr(-j, j), ny = y0 + (y1 - y0) * t + rr(-j, j) * 0.4, nz = z0 + (z1 - z0) * t + rr(-j, j);
      const ex = (nx - px) * 1.06, ey = (ny - py) * 1.06, ez = (nz - pz) * 1.06;
      P(T_BOLT, M_BEAM, px, py, pz, ex, ey, ez, life, width, width * 0.5, col, a, 1, 0, 0, 0, 0, 1, 0, 0.3, 0, delay);
      if (FULL) P(T_BOLT, M_BEAM, px, py, pz, ex, ey, ez, life * 0.6, width * 1.5, width, WHITE, a * 0.7, 1, 0, 0, 0, 0, 1, 0, 0.2, 0, delay + life * 0.75);
      px = nx; py = ny; pz = nz;
    }
  }
  /** Column rising from the ground (water, pyro, sky beams). */
  function column(x, y, z, h, w0, w1, life, col, a, add, grow = 5, erode = 1, delay = 0) {
    P(T_COL, M_BEAM, x, y, z, 0, h, 0, life, w0, w1, col, a, add, grow, 0, 0, 0, 1, 0, 0.3, erode, delay);
  }
  // The one pooled light: a short pulse on the heaviest moments
  const light = { l: null, seq: 0, t: 0, dur: 0, I: 0 };
  function flashLight(x, y, z, col, intensity, dur) {
    if (!ctx.scene) return;
    const l = acquirePooledLight(ctx.scene);
    if (!l) return;
    light.l = l; light.seq = (l._seq = (l._seq || 0) + 1);
    light.t = 0; light.dur = dur; light.I = intensity;
    l.position.set(x, y, z); l.color.copy(col); l.intensity = intensity; l.distance = 150;
  }
  function tickLight(dt) {
    const l = light.l;
    if (!l) return;
    light.t += dt;
    const mine = l._seq === light.seq;
    if (light.t >= light.dur || !mine) { if (mine) { l.intensity = 0; l.distance = 60; l.color.setHex(0xffaa33); } light.l = null; return; }
    const k = 1 - light.t / light.dur;
    l.intensity = light.I * k * k;
  }

  // ---- fighters ----
  const pal = { player: { main: C(1, 1, 1), alt: C(1, 1, 1), hot: C(1, 1, 1) }, rival: { main: C(1, 1, 1), alt: C(1, 1, 1), hot: C(1, 1, 1) } };
  const mkSt = () => ({
    auraAcc: 0, full: false, exhausted: false, steamAcc: 0, blockK: 0, stunT: 0,
    trail: { on: false, type: '', dx: 0, dz: 1, t: 0, acc: 0, dacc: 0, by: 'player', px: 0, py: 0, pz: 0 },
    tele: { on: false, t: 0, dur: 0, heavy: false, both: false },
  });
  const st = { player: mkSt(), rival: mkSt() };
  const fighter = (id) => (id === 'player' || id === 'rival' ? W[id] : null);
  const colOf = (id) => (pal[id] || pal.player).main;
  function chest(f, out) {
    f.center(out);
    if (!(out.y > f.pos.y + 6)) out.y = f.pos.y + f.height * 0.55; // lying down / no hips bone: keep effects off the floor
    return out;
  }
  function headPos(f, out) {
    const h = (f.bones && f.bones.head) || f.head;
    if (h) return h.getWorldPosition(out);
    return out.copy(f.pos).setY(f.pos.y + f.height * 0.9);
  }
  function bonePos(f, name, out) {
    const b = f.bones && f.bones[name];
    if (b) return b.getWorldPosition(out);
    return chest(f, out);
  }
  /** Unit horizontal direction a -> b into (_dirX, _dirZ). */
  let _dx = 0, _dz = 1;
  function dir2(ax, az, bx, bz) {
    const x = bx - ax, z = bz - az, l = Math.hypot(x, z);
    if (l < 0.001) { _dx = 0; _dz = 1; } else { _dx = x / l; _dz = z / l; }
  }

  // ---- impact language ----
  function fxStrike(e, wMul = 1) {
    const A = fighter(e.who), V = fighter(e.target);
    const col = colOf(e.who), heavy = e.kind && e.kind !== 'light';
    const w = Math.min(1.3, Math.max(0.15, (e.impact || (heavy ? 0.7 : 0.3)) * wMul + (heavy ? 0.15 : 0)));
    if (A && V) dir2(A.pos.x, A.pos.z, V.pos.x, V.pos.z); else { _dx = 0; _dz = 1; }
    const x = e.x, y = e.y, z = e.z, dx = _dx, dz = _dz;
    // starburst + a hot centre, held through the hit-stop
    P(T_BURST, M_BILL, x, y, z, 0, 0, 0, 0.13 + 0.12 * w, 9 + 10 * w, 16 + 26 * w, col, 1.5, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0.1);
    P(T_GLOW, M_BILL, x, y, z, 0, 0, 0, 0.1 + 0.08 * w, 6 + 8 * w, 3, WHITE, 1.3, 1);
    // the shock arc: a ring in the plane the blow travels through
    P(T_RING, M_PLANE, x, y, z, dx, 0.12, dz, 0.2 + 0.14 * w, 5, 20 + 30 * w, col, 1.1, 1, 0, 0, 0, 0, 1, 0, 0.15);
    if (heavy) P(T_ARC, M_PLANE, x - dx * 2, y, z - dz * 2, dx, 0.1, dz, 0.3, 14, 36 + 20 * w, WHITE, 0.9, 1, 0, 0, rnd() * TAU, 3, 1, 0, 0.2);
    sparks(x, y, z, dx, 0.35, dz, cnt(7 + 22 * w), 40, 80 + 60 * w, 0.75, col, 1.1 + 0.5 * w, 0.4, 60);
    if (w > 0.5) {
      sparks(x, y, z, dx, 0.5, dz, cnt(8 * w), 30, 70, 1, WHITE, 0.9, 0.5, 70, 1.2);
      if (FULL) chips(x, y, z, dx * 0.6, dz * 0.6, cnt(6 * w), 6, 26, 10, 34, EARTH, 0.7, 1.5, 1.1);
      flashLight(x, y, z, col, 5 + 5 * w, 0.25);
    }
    if (e.counter) P(T_GLINT, M_BILL, x, y, z, 0, 0, 0, 0.28, 34, 10, WHITE, 1.4, 1, 0, 0, 0.4, 2, 1, 0, 0.2);
  }
  function fxBlock(e) {
    const A = fighter(e.who), V = fighter(e.target), x = e.x, y = e.y, z = e.z;
    if (A && V) dir2(V.pos.x, V.pos.z, A.pos.x, A.pos.z); else { _dx = 0; _dz = 1; } // out of the guard, at the attacker
    const dx = _dx, dz = _dz;
    _col.copy(GUARD).lerp(colOf(e.target), 0.25);
    // a flat cool disc on the guard: nothing like the warm starburst of a clean hit
    P(T_SHELL, M_PLANE, x, y, z, dx, 0, dz, 0.3, 15, 22, _col, 1.3, 1, 0, 0, 0, 0, 1, 0, 0.2);
    P(T_RING, M_PLANE, x, y, z, dx, 0, dz, 0.26, 8, 30, _col, 1.2, 1, 0, 0, 0, 0, 1, 0, 0.2);
    P(T_RETICLE, M_PLANE, x, y, z, dx, 0, dz, 0.3, 20, 24, WHITE, 0.6, 1, 0, 0, rnd() * TAU, 1.5, 1, 0, 0.3);
    // sparks skid sideways off it instead of going through
    sparks(x, y, z, dz, 0.2, -dx, cnt(6), 30, 60, 0.4, _col, 0.9, 0.3, 40, 1.3);
    sparks(x, y, z, -dz, 0.2, dx, cnt(6), 30, 60, 0.4, _col, 0.9, 0.3, 40, 1.3);
    if (V) st[V.id].blockK = 1;
  }
  function fxReversal(e) {
    const x = e.x, y = e.y, z = e.z, D0 = fighter(e.who), A = fighter(e.target);
    if (D0 && A) dir2(D0.pos.x, D0.pos.z, A.pos.x, A.pos.z); else { _dx = 0; _dz = 1; }
    const dx = _dx, dz = _dz;
    // gold parry rings + a big four-point flash: the loudest read in the set
    P(T_RING, M_PLANE, x, y, z, dx, 0.05, dz, 0.4, 6, 62, GOLD, 1.8, 1, 0, 0, 0, 0, 1, 0, 0.15);
    P(T_RING, M_PLANE, x, y, z, dx, 0.05, dz, 0.4, 4, 44, WHITE, 1.2, 1, 0, 0, 0, 0, 1, 0, 0.15, 0, 0.07);
    P(T_GLINT, M_BILL, x, y, z, 0, 0, 0, 0.38, 60, 14, GOLD, 1.8, 1, 0, 0, 0.6, -1.4, 1, 0, 0.25);
    P(T_GLOW, M_BILL, x, y, z, 0, 0, 0, 0.16, 16, 6, WHITE, 1.5, 1);
    for (let i = 0; i < cnt(18); i++) {
      const a = rnd() * TAU, el = rr(-0.4, 0.9), sp = rr(50, 110);
      P(T_STREAK, M_VEL, x, y, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp, rr(0.3, 0.55), 1.3, 0.4, GOLD, 1.8, 1, 2.2, 50, 0, 0, 6);
    }
    flashLight(x, y, z, GOLD, 9, 0.3);
  }
  function fxStagger(e) {
    const f = fighter(e.who);
    if (!f) return;
    headPos(f, _a);
    for (let i = 0; i < 3; i++) {
      const a = rnd() * TAU;
      P(T_STAR, M_BILL, _a.x, _a.y + 3, _a.z, Math.cos(a) * rr(8, 16), rr(16, 28), Math.sin(a) * rr(8, 16), rr(0.5, 0.75), 3.4, 1.6, STARY, 1.3, 1, 0.6, 50, rnd() * TAU, rr(-8, 8));
    }
  }
  function fxStunStart(e) {
    const f = fighter(e.who);
    if (!f) return;
    headPos(f, _a);
    P(T_RING, M_FLAT, _a.x, _a.y + 5, _a.z, 0, 0, 0, 0.4, 4, 30, STARY, 1.2, 1, 0, 0, 0, 0, 1, 0, 0.2);
    P(T_BURST, M_BILL, _a.x, _a.y + 4, _a.z, 0, 0, 0, 0.22, 10, 26, STARY, 1.1, 1, 0, 0, rnd() * TAU);
    st[f.id].stunT = 0;
  }
  function fxGuardBreak(e) {
    const f = fighter(e.who);
    if (!f) return;
    chest(f, _a);
    P(T_RING, M_BILL, _a.x, _a.y, _a.z, 0, 0, 0, 0.4, 10, 54, DANGER, 1.4, 1, 0, 0, 0, 0, 1, 0, 0.2);
    for (let i = 0; i < cnt(16); i++) {
      const a = rnd() * TAU, sp = rr(30, 70);
      P(T_CHIP, M_BILL, _a.x, _a.y, _a.z, Math.cos(a) * sp, rr(5, 45), Math.sin(a) * sp, rr(0.5, 0.9), rr(1.6, 3.2), 0.6, GUARD, 1.5, 1, 1.5, 60, rnd() * TAU, rr(-10, 10), rr(0.5, 1.3));
    }
  }

  // ---- slams and landings ----
  let lastSlamT = -9, lastSlamX = 0, lastSlamZ = 0;
  function waterBurst(x, z, w) {
    ctx.fx.waterImpact(x, z, Math.min(3, 1 + Math.round(w * 2)), 'stomp'); // the level's own splash, ripple and sound
    const n = FULL ? 5 : 3;
    column(x, 0.3, z, 42 + 46 * w, 9 + 6 * w, 20 + 12 * w, 1.5, WATER, 0.85, 0, 4, 1);
    column(x, 0.3, z, 30 + 30 * w, 5, 9, 0.9, WHITE, 0.5, 1, 5, 1);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd(), r = rr(9, 16) * (0.7 + w * 0.5);
      column(x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r, rr(18, 34) * (0.7 + w * 0.6), 4, 11, rr(1, 1.4), WATER, 0.75, 0, 4, 1, rr(0.04, 0.16));
    }
    gring(x, z, 6, 40 + 40 * w, 0.9, WATER, 0.8, T_RIPPLE);
    gring(x, z, 4, 26 + 26 * w, 0.6, WHITE, 0.7, T_RING);
    for (let i = 0; i < cnt(26 + 20 * w); i++) {
      const a = rnd() * TAU, sp = rr(12, 44);
      P(T_GLOW, M_BILL, x, 1, z, Math.cos(a) * sp, rr(30, 75) * (0.7 + 0.4 * w), Math.sin(a) * sp, rr(1, 1.7), rr(1, 2.4), 0.5, WATER, 0.9, 0, 0.3, 75);
    }
    dustRing(x, z, cnt(10), 6, 16, 34, 6, 15, 1.4, STEAM, 0.4);
  }
  /** A body hits the ground at (x, z). w: 0.2 (stumble) .. 1 (press slam) .. 1.6 (finisher). */
  function fxSlam(x, z, w, col, opts = 0) {
    if (T - lastSlamT < 0.15 && Math.hypot(x - lastSlamX, z - lastSlamZ) < 16) return; // knockdown + throw:land of one fall
    lastSlamT = T; lastSlamX = x; lastSlamZ = z;
    if (ctx.isWater(x, z)) { waterBurst(x, z, Math.min(1.3, w)); return; }
    const R = 12 + 18 * w;
    // the crater: a crack decal that stays, with its fractures glowing for a moment
    if (w > 0.35) {
      const rot = rnd() * TAU;
      D(T_CRACK, x, z, R * 2.3, CHAR, 0.88, CRACK_LIFE, rot);
      P(T_CRACK, M_FLAT, x, 0.2, z, 0, 0, 0, 1.4 + w, R * 2.0, R * 2.3, col, 0.9, 1, 0, 0, rot, 0, 1, 0, 0.1);
    }
    gring(x, z, 4, R * 1.9, 0.38 + 0.12 * w, WHITE, 0.55 + 0.3 * w);
    gring(x, z, 3, R * 1.3, 0.3, col, 0.8);
    // the ripple through the lawn: thin rings racing out past the dust
    P(T_RIPPLE, M_FLAT, x, 0.3, z, 0, 0, 0, 0.75 + 0.3 * w, R, R * 6, DUST, 0.5, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0.1, 0, 0.05);
    if (FULL && w > 0.7) P(T_RIPPLE, M_FLAT, x, 0.3, z, 0, 0, 0, 1.0, R, R * 8, DUST, 0.3, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0.1, 0, 0.22);
    dustRing(x, z, cnt(9 + 16 * w), R * 0.5, 26 + 22 * w, 44 + 40 * w, 5 + 2 * w, 13 + 7 * w, 1.3 + 0.5 * w, DUST, 0.62);
    if (w > 0.6) dustRing(x, z, cnt(8 * w), 2, 6, 16, 7, 18 + 6 * w, 2 + 0.5 * w, DUST, 0.5);
    chips(x, 0.6, z, 0, 0, cnt(8 + 20 * w), 8, 26 + 14 * w, 28, 54 + 30 * w, EARTH, 0.9, 2.2 + 0.6 * w);
    if (FULL) chips(x, 0.6, z, 0, 0, cnt(8 * w), 6, 22, 20, 60, GRASS, 0.7, 1.5);
    sparks(x, 1.5, z, 0, 1, 0, cnt(6 + 10 * w), 30, 70, 1.2, col, 1, 0.45, 60, 1.2);
    P(T_BURST, M_BILL, x, 3, z, 0, 0, 0, 0.14, 12, 24 + 26 * w, WHITE, 0.9, 1, 0, 0, rnd() * TAU);
    if (w > 0.6) flashLight(x, 8, z, col, 6 + 5 * w, 0.3);
    if (opts === 1) { // diving splash: a second, wider, lazier ring
      dustRing(x, z, cnt(18), R, 50, 70, 6, 16, 1.6, DUST, 0.5);
      gring(x, z, R, R * 3, 0.6, col, 0.6, T_RING, 0.08);
    }
  }

  // ---- throws, whips, buildings, ropes ----
  function fxLaunch(e) {
    const V = fighter(e.target);
    if (!V) return;
    const tr = st[V.id].trail;
    tr.on = true; tr.type = e.type; tr.dx = e.dirX; tr.dz = e.dirZ; tr.t = 0; tr.acc = 0; tr.dacc = 0; tr.by = e.who || 'player';
    tr.px = V.pos.x; tr.py = V.pos.y; tr.pz = V.pos.z;
    const col = colOf(e.who);
    if (Math.hypot(e.dirX, e.dirZ) > 0.1) P(T_RING, M_PLANE, e.x, e.y, e.z, e.dirX, 0.05, e.dirZ, 0.32, 8, 46, col, 1.1, 1, 0, 0, 0, 0, 1, 0, 0.15);
    else gring(e.x, e.z, 4, 22, 0.3, col, 0.9, T_RING, 0, Math.max(0.35, e.y));
    P(T_BURST, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.16, 10, 30, WHITE, 0.9, 1, 0, 0, rnd() * TAU);
    sparks(e.x, e.y, e.z, e.dirX, 0.2, e.dirZ, cnt(10), 40, 90, 0.5, col, 1, 0.35, 30);
  }
  function tickTrail(f, s, dt) {
    const tr = s.trail;
    if (!tr.on || dt <= 0) return;
    tr.t += dt;
    const p = f.pos;
    let vx = (p.x - tr.px) / dt, vy = (p.y - tr.py) / dt, vz = (p.z - tr.pz) / dt;
    tr.px = p.x; tr.py = p.y; tr.pz = p.z;
    const sp = Math.hypot(vx, vy, vz);
    if (tr.t > 6 || (tr.t > 0.3 && f.state !== 'airborne' && sp < 4)) { tr.on = false; return; }
    if (sp < 12) return;
    const inv = 1 / sp, col = colOf(tr.by);
    vx *= inv; vy *= inv; vz *= inv;
    // speed lines shed from the silhouette, lying along the flight path
    tr.acc += dt * (FULL ? 70 : 34) * Math.min(1.5, sp / 60);
    while (tr.acc >= 1) {
      tr.acc -= 1;
      const a = rnd() * TAU, r = rr(4, f.radius), h = rr(4, f.height * 0.9);
      const white = rnd() < 0.5;
      P(T_STREAK, M_VEL, p.x + Math.cos(a) * r - vx * 6, p.y + h - vy * 6, p.z + Math.sin(a) * r - vz * 6, vx * sp * 0.3, vy * sp * 0.3, vz * sp * 0.3,
        rr(0.2, 0.34), white ? 0.9 : 1.5, 0.3, white ? WHITE : col, white ? 0.9 : 1.1, 1, 1, 0, 0, 0, rr(12, 22), 0.2);
    }
    // on the ground (an Irish whip, a skid): dust rooster-tail and grinding sparks at the feet
    if (p.y < 3) {
      tr.dacc += dt * (FULL ? 26 : 12);
      while (tr.dacc >= 1) {
        tr.dacc -= 1;
        const ox = rr(-6, 6), oz = rr(-6, 6);
        if (ctx.isWater(p.x, p.z)) P(T_GLOW, M_BILL, p.x + ox, 1, p.z + oz, -vx * 10 + rr(-8, 8), rr(14, 30), -vz * 10 + rr(-8, 8), 0.8, 1.6, 0.6, WATER, 0.8, 0, 0.4, 60);
        else {
          P(T_PUFF, M_BILL, p.x + ox, 2, p.z + oz, -vx * 8 + rr(-5, 5), rr(4, 10), -vz * 8 + rr(-5, 5), rr(0.8, 1.3), 4, rr(9, 14), DUST, 0.5, 0, 2, -2, rnd() * TAU, rr(-1, 1), 1, 0.1, 0.2, 1);
          sparks(p.x + ox, 0.8, p.z + oz, -vx, 0.5, -vz, 2, 20, 55, 0.6, SPARK, 0.8, 0.3, 60, 1.3);
        }
      }
    }
  }
  function fxBuilding(e) {
    const V = fighter(e.who);
    let dx = 0, dz = 0;
    if (V && st[V.id].trail.on) { dx = st[V.id].trail.dx; dz = st[V.id].trail.dz; }
    if (Math.hypot(dx, dz) < 0.1) { dx = 0; dz = 0; }
    const x = e.x, y = Math.max(6, e.y), z = e.z, col = colOf(e.by || e.who), big = e.destroyed ? 1 : 0.6;
    // the exit wound: a ring of pulverised concrete in the wall's plane, glass and rebar shot out ahead
    if (dx || dz) {
      P(T_RING, M_PLANE, x, y, z, dx, 0, dz, 0.45, 10, 60 * big, CONCRETE, 0.9, 1, 0, 0, 0, 0, 1, 0, 0.15);
      P(T_RING, M_PLANE, x + dx * 5, y, z + dz * 5, dx, 0, dz, 0.35, 6, 34 * big, col, 1, 1, 0, 0, 0, 0, 1, 0, 0.15, 0, 0.05);
    }
    P(T_BURST, M_BILL, x, y, z, 0, 0, 0, 0.16, 14, 40 * big, WHITE, 0.9, 1, 0, 0, rnd() * TAU);
    for (let i = 0; i < cnt(22 * big); i++) {
      const sp = rr(40, 110), sx = dx + rr(-0.6, 0.6), sz = dz + rr(-0.6, 0.6), sz0 = rr(1, 2.8);
      _col.copy(CONCRETE).multiplyScalar(rr(0.6, 1.1));
      P(T_CHIP, M_BILL, x + rr(-5, 5), y + rr(-5, 8), z + rr(-5, 5), sx * sp, rr(-5, 40), sz * sp, rr(1, 1.6), sz0, sz0, _col, 1, 0, 0.8, 60, rnd() * TAU, rr(-10, 10), rr(0.6, 1.4), 0, 0.7);
    }
    for (let i = 0; i < cnt(14 * big); i++) { // glass
      const sp = rr(50, 130);
      P(T_GLINT, M_BILL, x + rr(-6, 6), y + rr(-6, 10), z + rr(-6, 6), (dx + rr(-0.7, 0.7)) * sp, rr(0, 45), (dz + rr(-0.7, 0.7)) * sp, rr(0.5, 0.9), rr(1.5, 3), 0.5, GUARD, 1.4, 1, 1, 55, rnd() * TAU, rr(-12, 12));
    }
    for (let i = 0; i < cnt(8 * big); i++) {
      P(T_PUFF, M_BILL, x + rr(-6, 6), y + rr(-6, 6), z + rr(-6, 6), dx * rr(20, 50) + rr(-8, 8), rr(2, 10), dz * rr(20, 50) + rr(-8, 8), rr(1.1, 1.7), 6, rr(14, 22), CONCRETE, 0.55, 0, 2.2, -1, rnd() * TAU, rr(-0.8, 0.8), 1, 0.08, 0.2, 1);
    }
    sparks(x, y, z, dx, 0.2, dz, cnt(10), 50, 110, 0.6, SPARK, 1, 0.4, 50);
  }
  /** Rope side -> (x0, z0, x1, z1) along it. */
  let _rx0 = 0, _rz0 = 0, _rx1 = 0, _rz1 = 0;
  function ropeLine(side) {
    const A = W.arena && W.arena.info;
    if (!A) return false;
    const h = A.half;
    if (side === 'n') { _rx0 = A.cx - h; _rx1 = A.cx + h; _rz0 = _rz1 = A.cz - h; }
    else if (side === 's') { _rx0 = A.cx - h; _rx1 = A.cx + h; _rz0 = _rz1 = A.cz + h; }
    else if (side === 'w') { _rz0 = A.cz - h; _rz1 = A.cz + h; _rx0 = _rx1 = A.cx - h; }
    else { _rz0 = A.cz - h; _rz1 = A.cz + h; _rx0 = _rx1 = A.cx + h; }
    return true;
  }
  function fxRope(e) {
    const A = W.arena && W.arena.info;
    if (!A || !ropeLine(e.side)) return;
    dir2(_rx0, _rz0, _rx1, _rz1);
    const ax = _dx, az = _dz, k = Math.min(1, (e.speed || 60) / 90);
    for (let i = 0; i < A.ropeY.length; i++) {
      // the cable flashes white-hot where the body loads it, fading along its length
      const y = A.ropeY[i], len = 26 + 20 * k;
      P(T_COL, M_BEAM, e.x, y, e.z, ax * len, 0, az * len, 0.3, 2.2, 0.8, WHITE, 1.2, 1, 0, 0, 0, 0, 1, 0, 0.2);
      P(T_COL, M_BEAM, e.x, y, e.z, -ax * len, 0, -az * len, 0.3, 2.2, 0.8, WHITE, 1.2, 1, 0, 0, 0, 0, 1, 0, 0.2);
      P(T_GLOW, M_BILL, e.x, y, e.z, 0, 0, 0, 0.22, 8, 3, WHITE, 1.2, 1);
      sparks(e.x, y, e.z, 0, 0.6, 0, cnt(4), 20, 50, 1, SPARK, 0.8, 0.35, 50, 1.3);
    }
    P(T_RING, M_PLANE, e.x, A.ropeY[1], e.z, -az, 0, ax, 0.3, 6, 40, colOf(e.who), 0.8, 1, 0, 0, 0, 0, 1, 0, 0.2);
  }
  function fxRopeSnap(e) {
    const A = W.arena && W.arena.info;
    if (!A || !ropeLine(e.side)) return;
    const x0 = _rx0, z0 = _rz0, x1 = _rx1, z1 = _rz1;
    for (let i = 0; i < A.ropeY.length; i++) {
      const y = A.ropeY[i];
      // the whip crack: each cable lashes back from the break toward its posts
      bolt(e.x, y, e.z, x0, y + rr(-3, 6), z0, 4, 5, 3, WHITE, 1.4, 0.22, i * 0.03);
      bolt(e.x, y, e.z, x1, y + rr(-3, 6), z1, 4, 5, 3, WHITE, 1.4, 0.22, i * 0.03);
    }
    P(T_GLINT, M_BILL, e.x, A.ropeY[1], e.z, 0, 0, 0, 0.3, 50, 12, WHITE, 1.6, 1, 0, 0, 0.3, 2, 1, 0, 0.2);
    P(T_RING, M_BILL, e.x, A.ropeY[1], e.z, 0, 0, 0, 0.35, 8, 60, WHITE, 1, 1, 0, 0, 0, 0, 1, 0, 0.2);
    // turnbuckles let go at both posts
    for (let k = 0; k < 2; k++) {
      const px = k ? x1 : x0, pz = k ? z1 : z0;
      dir2(px, pz, A.cx, A.cz);
      for (let i = 0; i < A.ropeY.length; i++) {
        const y = A.ropeY[i];
        P(T_BURST, M_BILL, px, y, pz, 0, 0, 0, 0.18, 8, 22, SPARK, 1.2, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0, 0, 0.12);
        sparks(px, y, pz, _dx, 0.5, _dz, cnt(8), 30, 80, 0.9, SPARK, 1, 0.5, 60);
        for (let j = 0; j < cnt(5); j++) {
          const sz = rr(1.2, 2.6);
          P(T_CHIP, M_BILL, px, y, pz, _dx * rr(10, 50) + rr(-20, 20), rr(10, 50), _dz * rr(10, 50) + rr(-20, 20), rr(1.2, 1.8), sz, sz, STEEL, 1, 0, 0.4, 65, rnd() * TAU, rr(-12, 12), rr(0.6, 1.5), 0, 0.7);
        }
      }
    }
    flashLight(e.x, A.ropeY[1], e.z, WHITE, 8, 0.25);
  }

  // ---- state and meter effects (per frame) ----
  function igniteAura(f) {
    const p = f.pos, col = colOf(f.id);
    gring(p.x, p.z, 6, 46, 0.5, col, 1.3);
    gring(p.x, p.z, 4, 30, 0.4, WHITE, 0.8, T_RING, 0.06);
    column(p.x, 0.3, p.z, 70, 16, 30, 0.6, col, 0.7, 1, 6, 1);
    for (let i = 0; i < cnt(22); i++) {
      const a = rnd() * TAU, r = rr(6, 14);
      P(T_FLAME, M_BILL, p.x + Math.cos(a) * r, rr(1, 14), p.z + Math.sin(a) * r, 0, rr(26, 50), 0, rr(0.5, 0.9), rr(6, 10), 3, col, 1, 1, 1, 0, 0, 0, 0.6, 0.1, 0.2, 1);
    }
    chest(f, _a);
    P(T_BURST, M_BILL, _a.x, _a.y, _a.z, 0, 0, 0, 0.25, 20, 60, col, 0.9, 1, 0, 0, rnd() * TAU);
    flashLight(_a.x, _a.y, _a.z, col, 8, 0.4);
  }
  function tickFighter(f, s, dt) {
    const p = f.pos, col = colOf(f.id);
    // -- momentum aura: a ground ring that fills in, wisps licking up the body, a blaze when full
    const m = Math.min(1, Math.max(0, f.momentum / 100));
    const full = m >= 0.995;
    if (full && !s.full && dt > 0) igniteAura(f);
    s.full = full;
    if ((m > 0.4 || full) && f.state !== 'ko') {
      const k = full ? 1 : (m - 0.4) / 0.6, pulse = full ? 0.75 + 0.25 * Math.sin(T * 9) : 1;
      LV(T_RING, M_FLAT, p.x, 0.4, p.z, (f.radius + 5) * 2.5, col, (full ? 1.1 : 0.2 + 0.5 * k) * pulse, 1, T * (full ? 1.5 : 0.5));
      if (full) {
        LV(T_GLOW, M_FLAT, p.x, 0.35, p.z, 62, col, 0.3 * pulse, 1);
        LV(T_RETICLE, M_FLAT, p.x, 0.45, p.z, (f.radius + 9) * 2.5, col, 0.7, 1, -T * 0.8);
      }
      s.auraAcc += dt * (full ? 30 : 12 * k) * (FULL ? 1 : 0.4);
      while (s.auraAcc >= 1) {
        s.auraAcc -= 1;
        const a = rnd() * TAU, r = rr(f.radius * 0.6, f.radius * 1.05);
        P(T_FLAME, M_BILL, p.x + Math.cos(a) * r, p.y + rr(1, full ? 22 : 12), p.z + Math.sin(a) * r, 0, rr(12, 22) * (full ? 1.4 : 1), 0, rr(0.5, 0.85),
          rr(4, 7) * (full ? 1.3 : 1), 2, col, full ? 0.85 : 0.55, 1, 0.5, 0, 0, 0, 0.55, 0.15, 0.2, 1);
      }
    }
    // -- exhaustion: steam off the head and shoulders, sweat falling
    if (f.stamina <= 0.5) s.exhausted = true; else if (f.stamina > f.maxStamina * 0.3) s.exhausted = false;
    if (s.exhausted && f.state !== 'ko') {
      s.steamAcc += dt * (FULL ? 9 : 4);
      while (s.steamAcc >= 1) {
        s.steamAcc -= 1;
        headPos(f, _a);
        P(T_PUFF, M_BILL, _a.x + rr(-5, 5), _a.y + rr(-4, 3), _a.z + rr(-5, 5), rr(-2, 2), rr(7, 13), rr(-2, 2), rr(1.1, 1.7), 3, rr(8, 12), STEAM, 0.36, 0, 0.4, -2, rnd() * TAU, rr(-0.8, 0.8), 1, 0.2, 0.2, 1);
        P(T_STREAK, M_VEL, _a.x + rr(-6, 6), _a.y - 1, _a.z + rr(-6, 6), rr(-3, 3), -4, rr(-3, 3), 0.7, 0.8, 0.4, GUARD, 0.8, 1, 0, 45, 0, 0, 5);
      }
    }
    // -- dizzy: stars circling the head for as long as the state lasts
    if (f.state === 'stunned') {
      s.stunT += dt;
      headPos(f, _a);
      const cy = _a.y + 5.5, n = 5;
      LV(T_RIPPLE, M_FLAT, _a.x, cy, _a.z, 19, STARY, 0.5, 1, -T * 2);
      for (let i = 0; i < n; i++) {
        const a = T * 3.6 + i / n * TAU;
        LV(T_STAR, M_BILL, _a.x + Math.cos(a) * 7, cy + Math.sin(a * 2 + i) * 0.9, _a.z + Math.sin(a) * 7, 4.4, STARY, 1.25, 1, a * 1.7);
      }
    }
    // -- guard up: a cool shell in front of the body, flaring when it soaks a hit
    s.blockK = Math.max(0, s.blockK - dt * 3.5);
    if (f.state === 'blocking') {
      const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
      _col.copy(GUARD).lerp(col, 0.25);
      LV(T_SHELL, M_PLANE, p.x + fx * f.radius * 0.85, p.y + f.height * 0.55, p.z + fz * f.radius * 0.85, 27, _col, 0.3 + 0.08 * Math.sin(T * 12) + 0.8 * s.blockK, 1, 0, 1, fx, 0, fz);
    }
    // -- strike telegraph: a glint on the striking hand that tightens until contact
    const te = s.tele;
    if (te.on) {
      te.t += dt;
      const k = te.t / te.dur;
      if (k >= 1 || (f.state !== 'attacking' && te.t > 0.08)) te.on = false;
      else {
        const late = k > 0.7, c1 = late ? WHITE : col, sz = te.heavy ? 1 : 0.5;
        for (let h = 0; h < (te.both ? 2 : 1); h++) {
          bonePos(f, h ? 'handL' : 'handR', _a);
          LV(T_GLINT, M_BILL, _a.x, _a.y, _a.z, (9 + 16 * k) * sz, c1, 0.9 + 0.7 * k, 1, T * 5);
          LV(T_GLOW, M_BILL, _a.x, _a.y, _a.z, (7 + 6 * k) * sz, late ? DANGER : col, 0.8, 1);
          if (te.heavy) LV(T_RING, M_BILL, _a.x, _a.y, _a.z, 30 - 24 * k, late ? DANGER : col, 0.5 + 0.6 * k, 1);
        }
      }
    }
    tickTrail(f, s, dt);
  }
  // Lock-up: sparks grinding out from between the two bodies
  let lock = false, lockAcc = 0;
  function tickLock(dt) {
    const a = W.player, b = W.rival;
    if (!lock || !a || !b) return;
    const g = (f) => f.state === 'grappling' || f.state === 'grappled';
    if (!((W.grapple && W.grapple.active) || (g(a) && g(b)))) { lock = false; return; }
    chest(a, _a); chest(b, _b);
    const x = (_a.x + _b.x) / 2, y = (_a.y + _b.y) / 2 + 3, z = (_a.z + _b.z) / 2;
    LV(T_GLINT, M_BILL, x, y, z, rr(6, 11), WHITE, rr(0.7, 1.3), 1, rnd() * TAU);
    LV(T_GLOW, M_BILL, x, y, z, rr(8, 11), SPARK, 0.7, 1);
    lockAcc += dt * (FULL ? 46 : 20);
    dir2(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
    while (lockAcc >= 1) {
      lockAcc -= 1;
      const side = rnd() < 0.5 ? 1 : -1; // sprays out sideways from the clinch, never into either body
      sparks(x, y, z, -_dz * side, 0.5, _dx * side, 1, 25, 70, 0.7, rnd() < 0.3 ? WHITE : SPARK, 0.9, 0.4, 70, 1.5);
    }
  }
  // Power telegraphs: the threatened ground, drawn so the timing reads (an inner ring closes on the rim)
  const teles = [0, 1, 2].map(() => ({ on: false, t: 0, dur: 0, r: 0, x: 0, z: 0, who: 'rival', target: '' }));
  function tickTeles(dt) {
    for (let i = 0; i < teles.length; i++) {
      const t = teles[i];
      if (!t.on) continue;
      t.t += dt;
      const k = t.t / t.dur, f = fighter(t.who);
      if (k >= 1 || !f) { t.on = false; continue; }
      const col = colOf(t.who), urgent = k > 0.7 ? 0.6 + 0.4 * Math.sin(T * 40) : 1;
      _col.copy(col).lerp(DANGER, 0.45);
      if (t.r > 0) {
        LV(T_RING, M_FLAT, t.x, 0.5, t.z, t.r * 2.5, _col, 1.1 * urgent, 1);
        LV(T_RING, M_FLAT, t.x, 0.5, t.z, t.r * 2.5 * (0.15 + 0.85 * k), WHITE, 0.7, 1);
        LV(T_GLOW, M_FLAT, t.x, 0.45, t.z, t.r * 2.2, _col, 0.16 + 0.2 * k, 1);
        LV(T_RETICLE, M_FLAT, t.x, 0.55, t.z, t.r * 2.2, _col, 0.5, 1, T * 0.7);
      } else {
        // a line: from the attacker's head toward its target, thin, tightening
        const V = fighter(t.target) || f.opponent;
        headPos(f, _a);
        if (V) {
          chest(V, _b);
          LV(T_COL, M_BEAM, _a.x, _a.y, _a.z, (5 - 3.5 * k), _col, 0.5 + 0.5 * k * urgent, 1, 0, 1, (_b.x - _a.x) * 1.9, (_b.y - _a.y) * 1.9, (_b.z - _a.z) * 1.9);
        }
      }
      // and the tell on the attacker itself: its head lights up in its own colour
      headPos(f, _a);
      LV(T_GLINT, M_BILL, _a.x, _a.y, _a.z, 12 + 22 * k, k > 0.7 ? WHITE : col, 1 + 0.6 * k, 1, T * 4);
      LV(T_GLOW, M_BILL, _a.x, _a.y, _a.z, 14 + 8 * k, col, 0.7, 1);
    }
  }

  // ---- emitters (pyro, confetti, aftermath) ----
  const E_PYRO = 1, E_CONFETTI = 2, E_EMBERS = 3, E_SMOLDER = 4, E_ARCS = 5, E_STORM = 6;
  const ems = [];
  for (let i = 0; i < 20; i++) ems.push({ on: false, kind: 0, t: 0, dur: 0, x: 0, y: 0, z: 0, r: 0, acc: 0, col: C(1, 1, 1), started: false });
  function emitter(kind, x, y, z, dur, col, r = 0, delay = 0) {
    let e = null;
    for (let i = 0; i < ems.length; i++) if (!ems[i].on) { e = ems[i]; break; }
    if (!e) return;
    e.on = true; e.kind = kind; e.t = -delay; e.dur = dur; e.x = x; e.y = y; e.z = z; e.r = r; e.acc = 0; e.col.copy(col); e.started = false;
  }
  function tickEmitters(dt) {
    for (let i = 0; i < ems.length; i++) {
      const e = ems[i];
      if (!e.on) continue;
      e.t += dt;
      if (e.t < 0) continue;
      if (e.t >= e.dur) { e.on = false; continue; }
      const k = e.t / e.dur;
      if (e.kind === E_PYRO) {
        if (!e.started) {
          e.started = true;
          // the gerb lights: a flash, a flame column, a shock of smoke
          P(T_GLINT, M_BILL, e.x, e.y + 2, e.z, 0, 0, 0, 0.25, 30, 8, WHITE, 1.4, 1, 0, 0, 0.3, 2);
          column(e.x, e.y, e.z, 52, 5, 9, e.dur * 0.9, e.col, 0.9, 1, 7, 1);
          column(e.x, e.y, e.z, 34, 2.5, 4, e.dur * 0.8, WHITE, 0.8, 1, 8, 1);
        }
        e.acc += dt * (FULL ? 90 : 36) * (1 - k * 0.6);
        while (e.acc >= 1) {
          e.acc -= 1;
          const white = rnd() < 0.35;
          P(T_STREAK, M_VEL, e.x, e.y + 1, e.z, rr(-9, 9), rr(55, 95), rr(-9, 9), rr(0.7, 1.2), white ? 0.9 : 1.3, 0.3, white ? WHITE : e.col, 1.5, 1, 0.5, 60, 0, 0, rr(5, 8));
        }
        if (FULL && rnd() < dt * 8) P(T_PUFF, M_BILL, e.x + rr(-2, 2), e.y + rr(8, 30), e.z + rr(-2, 2), rr(-3, 3), rr(6, 12), rr(-3, 3), 1.8, 4, 12, STEAM, 0.25, 0, 0.5, 0, rnd() * TAU, 0, 1, 0.2, 0.2, 1);
      } else if (e.kind === E_CONFETTI) {
        e.acc += dt * (FULL ? 110 : 40) * (k < 0.75 ? 1 : (1 - k) * 4);
        while (e.acc >= 1) {
          e.acc -= 1;
          const pick = rnd(), c = pick < 0.45 ? e.col : pick < 0.75 ? WHITE : GOLD;
          const sz = rr(1.3, 2.3);
          P(T_CHIP, M_BILL, e.x + rr(-e.r, e.r), e.y + rr(-8, 8), e.z + rr(-e.r, e.r), rr(-5, 5), rr(-13, -7), rr(-5, 5), rr(4.5, 6), sz, sz, c, 1, 0, 0, 0, rnd() * TAU, rr(-3, 3), -rr(0.5, 0.9), 0.05, 0.85);
        }
      } else if (e.kind === E_EMBERS) {
        e.acc += dt * (FULL ? 46 : 16) * (1 - k);
        while (e.acc >= 1) {
          e.acc -= 1;
          const a = rnd() * TAU, r = Math.sqrt(rnd()) * e.r;
          P(T_GLOW, M_BILL, e.x + Math.cos(a) * r, rr(1, 6), e.z + Math.sin(a) * r, rr(-3, 3), rr(8, 24), rr(-3, 3), rr(1.4, 2.6), rr(1.2, 2.2), 0.4, e.col, 1.2, 1, 0.4, -3, 0, 0, 1, 0.1, 0.3);
        }
      } else if (e.kind === E_SMOLDER) {
        e.acc += dt * (FULL ? 9 : 4) * (1 - k * 0.7);
        while (e.acc >= 1) {
          e.acc -= 1;
          const a = rnd() * TAU, r = Math.sqrt(rnd()) * e.r;
          _col.copy(CHAR).lerp(DUST, rr(0.2, 0.6));
          P(T_PUFF, M_BILL, e.x + Math.cos(a) * r, 2, e.z + Math.sin(a) * r, rr(-2, 2), rr(7, 14), rr(-2, 2), rr(2.2, 3.4), 5, rr(14, 22), _col, 0.42, 0, 0.3, -1, rnd() * TAU, rr(-0.5, 0.5), 1, 0.15, 0.2, 1);
        }
      } else if (e.kind === E_ARCS) {
        // residual charge crawling over the crater
        e.acc += dt * (FULL ? 12 : 5) * (1 - k);
        while (e.acc >= 1) {
          e.acc -= 1;
          const a = rnd() * TAU, r = Math.sqrt(rnd()) * e.r, a2 = a + rr(-1.2, 1.2), l = rr(8, 20);
          const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
          bolt(x, 0.8, z, x + Math.cos(a2) * l, rr(0.8, 5), z + Math.sin(a2) * l, 2, 2.5, 2.2, e.col, 1.2, 0.14);
        }
      } else if (e.kind === E_STORM) {
        // charge: the sky finds the ground around the caster
        e.acc += dt * (FULL ? 5 : 2.5);
        while (e.acc >= 1) {
          e.acc -= 1;
          const a = rnd() * TAU, r = rr(18, e.r), x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
          skyBolt(x, z, e.col, 0.8, 0);
        }
      }
    }
  }
  function skyBolt(x, z, col, k, delay) {
    bolt(x + rr(-30, 30), 190, z + rr(-30, 30), x, 0.5, z, FULL ? 6 : 4, 9, 4.5 * k + 1.5, col, 1.5, 0.2, delay);
    P(T_BURST, M_BILL, x, 3, z, 0, 0, 0, 0.2, 10, 34 * k, WHITE, 1.1, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0, 0, delay);
    gring(x, z, 2, 22 * k, 0.35, col, 1, T_RING, delay);
    if (FULL) for (let i = 0; i < 4; i++) {
      const a = rnd() * TAU;
      P(T_STREAK, M_VEL, x, 1.5, z, Math.cos(a) * rr(20, 50), rr(20, 50), Math.sin(a) * rr(20, 50), 0.4, 1, 0.3, col, 1.4, 1, 1.5, 60, 0, 0, 5, 0, 0, 0, delay);
    }
  }
  function pyro(col, delay = 0, dur = 1.5) {
    const A = W.arena && W.arena.info;
    if (!A) return;
    const pts = A.pyro || A.posts;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      emitter(E_PYRO, p.x, p.y !== undefined ? p.y : A.postH + 2.6, p.z, dur, col, 0, delay + (i % 2) * 0.08);
    }
  }

  // ---- finishers ----
  const fin = { on: false, who: 'player', target: 'rival', key: '', t: 0, hit: false, acc: 0, acc2: 0 };
  // deferred calls into the world's own spawners (staggered shockwaves): a tiny fixed queue on the effect clock
  const later = [];
  for (let i = 0; i < 8; i++) later.push({ t: -1, x: 0, z: 0, r: 0, col: 0 });
  function shockLater(delay, x, z, r, colHex) {
    for (let i = 0; i < later.length; i++) if (later[i].t < 0) { const q = later[i]; q.t = T + delay; q.x = x; q.z = z; q.r = r; q.col = colHex; return; }
  }
  function tickLater() {
    for (let i = 0; i < later.length; i++) {
      const q = later[i];
      if (q.t < 0 || T < q.t) continue;
      q.t = -1;
      if (ctx.world.spawnShockwave) ctx.world.spawnShockwave(new THREE.Vector3(q.x, 0.4, q.z), q.col, q.r);
    }
  }
  function fxFinStart(e) {
    const A = fighter(e.who);
    if (!A) return;
    fin.on = true; fin.who = e.who; fin.target = e.target; fin.key = A.key; fin.t = 0; fin.hit = false; fin.acc = 0; fin.acc2 = 0;
    igniteAura(A);
    if (A.key === 'ghidorah') emitter(E_STORM, A.pos.x, 0, A.pos.z, 2.2, pal[e.who].alt, 55);
  }
  function tickFinisher(dt) {
    if (!fin.on) return;
    const A = fighter(fin.who), V = fighter(fin.target);
    if (!A || !V) { fin.on = false; return; }
    fin.t += dt;
    if (fin.hit || fin.t > 12) return;
    const col = pal[fin.who].main, alt = pal[fin.who].alt, p = A.pos;
    chest(A, _a);
    // charge: power drawn in to the chest from all around, the ground ring spinning up
    fin.acc += dt * (FULL ? 60 : 22);
    while (fin.acc >= 1) {
      fin.acc -= 1;
      const a = rnd() * TAU, el = rr(-0.2, 1.1), R = rr(26, 44), life = rr(0.35, 0.55);
      const ox = Math.cos(a) * Math.cos(el) * R, oy = Math.sin(el) * R, oz = Math.sin(a) * Math.cos(el) * R;
      P(T_STREAK, M_VEL, _a.x + ox, _a.y + oy, _a.z + oz, -ox / life, -oy / life, -oz / life, life, 1.4, 0.5, rnd() < 0.3 ? WHITE : col, 1.4, 1, 0, 0, 0, 0, 7, 0.3);
    }
    const pulse = 0.7 + 0.3 * Math.sin(T * 14);
    LV(T_RETICLE, M_FLAT, p.x, 0.5, p.z, 70, col, 0.9 * pulse, 1, T * 2.2);
    LV(T_RING, M_FLAT, p.x, 0.5, p.z, 82, alt, 0.8, 1, -T);
    LV(T_GLOW, M_BILL, _a.x, _a.y, _a.z, 26 + 5 * pulse, col, 0.55, 1);
    fin.acc2 += dt * (FULL ? 16 : 7);
    while (fin.acc2 >= 1) {
      fin.acc2 -= 1;
      const a = rnd() * TAU, r = rr(8, 34);
      if (fin.key === 'mecha') {
        // thrusters: exhaust hammering down around the feet
        P(T_FLAME, M_BILL, p.x + Math.cos(a) * 8, p.y + rr(4, 10), p.z + Math.sin(a) * 8, Math.cos(a) * 14, -26, Math.sin(a) * 14, 0.4, rr(5, 8), 2, alt, 1.1, 1, 0, 0, Math.PI, 0, 0.6, 0, 0.2, 1);
        P(T_PUFF, M_BILL, p.x + Math.cos(a) * 12, 2, p.z + Math.sin(a) * 12, Math.cos(a) * 30, 4, Math.sin(a) * 30, 1, 4, 13, DUST, 0.45, 0, 2.5, -1, rnd() * TAU, 0, 1, 0.1, 0.2, 1);
      } else if (fin.key === 'ghidorah') {
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        bolt(x, 0.8, z, _a.x + rr(-6, 6), _a.y + rr(-4, 10), _a.z + rr(-6, 6), 3, 4, 2.4, alt, 1.3, 0.14);
      } else {
        // atomic: embers lifting off the ground into the glow
        P(T_GLOW, M_BILL, p.x + Math.cos(a) * r, 0.5, p.z + Math.sin(a) * r, 0, rr(18, 36), 0, rr(0.8, 1.4), rr(1.4, 2.6), 0.4, col, 1.3, 1, 0, -6, 0, 0, 1, 0.1, 0.3);
      }
    }
    // the victim is marked
    if (fin.key === 'mecha') { const q = V.pos; LV(T_RETICLE, M_FLAT, q.x, q.y + 0.6, q.z, 44 - 8 * pulse, DANGER, 1.1, 1, -T * 3); }
  }
  function fxFinBeat(e) {
    const A = fighter(e.who), V = fighter(e.target);
    if (!A || !V) return;
    const col = pal[e.who].main, alt = pal[e.who].alt, p = A.pos;
    chest(V, _b);
    if (e.beat === 'grab') {
      chest(A, _a);
      const x = (_a.x + _b.x) / 2, y = (_a.y + _b.y) / 2, z = (_a.z + _b.z) / 2;
      P(T_GLINT, M_BILL, x, y, z, 0, 0, 0, 0.3, 44, 10, col, 1.5, 1, 0, 0, 0.4, 2);
      P(T_RING, M_BILL, x, y, z, 0, 0, 0, 0.3, 6, 44, col, 1, 1, 0, 0, 0, 0, 1, 0, 0.2);
      lock = false;
      return;
    }
    if (e.beat === 'drop' || e.beat === 'slam' || e.beat === 'dive') {
      const tr = st[V.id].trail;
      tr.on = true; tr.type = 'finisher'; tr.t = 0; tr.acc = 0; tr.dacc = 0; tr.by = e.who; tr.px = V.pos.x; tr.py = V.pos.y; tr.pz = V.pos.z; tr.dx = 0; tr.dz = 0;
      P(T_RING, M_FLAT, _b.x, _b.y, _b.z, 0, 0, 0, 0.3, 10, 50, WHITE, 0.9, 1, 0, 0, 0, 0, 1, 0, 0.2);
      return;
    }
    // lift / apex / anything else: the pose beat. A column of the kaiju's power through both bodies.
    gring(p.x, p.z, 6, 40, 0.45, col, 1.1);
    dustRing(p.x, p.z, cnt(12), 10, 24, 40, 5, 13, 1.2, DUST, 0.5);
    if (A.key === 'ghidorah') {
      skyBolt(_b.x, _b.z, alt, 1.2, 0);
      bolt(_b.x + rr(-20, 20), 190, _b.z + rr(-20, 20), _b.x, _b.y, _b.z, 6, 8, 6, col, 1.6, 0.25, 0.05);
      P(T_BURST, M_BILL, _b.x, _b.y, _b.z, 0, 0, 0, 0.22, 16, 50, alt, 1.1, 1, 0, 0, rnd() * TAU);
    } else if (A.key === 'mecha') {
      for (let i = 0; i < cnt(14); i++) {
        const a = rnd() * TAU;
        P(T_FLAME, M_BILL, p.x + Math.cos(a) * 7, p.y + 6, p.z + Math.sin(a) * 7, Math.cos(a) * 24, -34, Math.sin(a) * 24, 0.5, rr(8, 12), 3, alt, 1.2, 1, 0, 0, Math.PI, 0, 0.6, 0, 0.2, 1);
      }
      gring(p.x, p.z, 4, 52, 0.5, alt, 1.1, T_RING, 0.05);
      P(T_RETICLE, M_BILL, _b.x, _b.y, _b.z, 0, 0, 0, 0.5, 60, 30, DANGER, 1.2, 1, 0, 0, 0, 3, 1, 0, 0.4);
    } else {
      column(p.x, 0.3, p.z, 120, 12, 22, 0.7, col, 0.75, 1, 6, 1);
      P(T_BURST, M_BILL, _b.x, _b.y, _b.z, 0, 0, 0, 0.22, 16, 50, col, 1.0, 1, 0, 0, rnd() * TAU);
    }
    for (let i = 0; i < cnt(16); i++) {
      const a = rnd() * TAU, r = rr(8, 16);
      P(T_STREAK, M_VEL, p.x + Math.cos(a) * r, rr(2, 12), p.z + Math.sin(a) * r, 0, rr(60, 110), 0, rr(0.3, 0.5), 1.2, 0.4, col, 1.3, 1, 1, 0, 0, 0, 9);
    }
  }
  function fxFinImpact(e) {
    const A = fighter(e.who);
    const key = A ? A.key : fin.key, id = e.who || fin.who;
    const col = (pal[id] || pal.player).main, alt = (pal[id] || pal.player).alt;
    const x = e.x, z = e.z, R = e.radius > 10 ? e.radius : 75;
    fin.hit = true;
    const V = fighter(e.target);
    if (V) st[V.id].trail.on = false;
    lastSlamT = -9;
    fxSlam(x, z, 1.6, col);
    if (ctx.isWater(x, z)) return;
    // -- shared: a second, city-block crater; a dome in the kaiju's colour (never white: it must not eat the frame);
    //    three ground rings racing to the radius; the world's own shockwave underneath
    D(T_CRACK, x, z, R * 1.5, CHAR, 0.8, CRACK_LIFE, rnd() * TAU);
    P(T_CRACK, M_FLAT, x, 0.22, z, 0, 0, 0, 5, R * 1.3, R * 1.5, col, 1.0, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0.1);
    P(T_SHELL, M_BILL, x, 2, z, 0, 0, 0, 0.75, R * 0.3, R * 1.5, col, 0.6, 1, 0, 0, 0, 0, 1, 0, 0.25);
    P(T_SHELL, M_BILL, x, 2, z, 0, 0, 0, 0.5, R * 0.2, R * 0.9, WHITE, 0.35, 1, 0, 0, 0, 0, 1, 0, 0.2);
    P(T_BURST, M_BILL, x, 6, z, 0, 0, 0, 0.2, 30, R * 1.2, WHITE, 0.8, 1, 0, 0, rnd() * TAU);
    for (let i = 0; i < 3; i++) gring(x, z, 6, R * (0.7 + 0.25 * i), 0.55 + 0.15 * i, i === 1 ? WHITE : col, 1.1 - 0.25 * i, T_RING, i * 0.11);
    P(T_RIPPLE, M_FLAT, x, 0.3, z, 0, 0, 0, 1.4, R * 0.6, R * 4.4, alt, 0.5, 1, 0, 0, 0, 0, 1, 0, 0.1, 0, 0.1);
    dustRing(x, z, cnt(26), R * 0.3, 60, 95, 8, 22, 2.2, DUST, 0.6);
    chips(x, 1, z, 0, 0, cnt(30), 14, 60, 50, 120, EARTH, 1.2, 3.4, 2.2);
    shockLater(0, x, z, R, col.getHex());
    shockLater(0.18, x, z, R * 0.6, alt.getHex());
    flashLight(x, 14, z, col, 16, 0.7);
    emitter(E_SMOLDER, x, 0, z, 9, col, R * 0.35, 0.6);
    emitter(E_EMBERS, x, 0, z, 6, col, R * 0.5, 0.2);
    if (key === 'ghidorah') {
      // STORM: the sky empties onto the crater, then the charge crawls around in it
      const n = FULL ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rnd(), r = i === 0 ? 0 : rr(0.2, 0.75) * R;
        skyBolt(x + Math.cos(a) * r, z + Math.sin(a) * r, i % 2 ? alt : col, i === 0 ? 2 : 1, i === 0 ? 0 : rr(0.06, 0.7));
      }
      column(x, 0.3, z, 190, 10, 26, 0.5, alt, 0.6, 1, 9, 1);
      emitter(E_ARCS, x, 0, z, 3.2, alt, R * 0.5, 0.25);
      if (A && ctx.vfx && ctx.vfx.spawn) { // the Volt Beam's own arc from the heads into the crater
        headPos(A, _a);
        const fx = ctx.vfx.spawn('chainLightning', { world: ctx.world, a: _a.clone(), b: new THREE.Vector3(x, 3, z), color: col.getHex(), life: 0.5, segs: 14 });
        if (fx && fx.tick) ctx.fx.add(fx);
      }
    } else if (key === 'mecha') {
      // ORDNANCE: a rocket salvo walks in across the block, then the plasma core goes
      const n = FULL ? 12 : 6;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * R * 0.8, tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        const d = 0.1 + i / n * 0.75, fall = 0.34, vx = rr(-40, 40), vz = rr(-40, 40), vy = -230;
        P(T_STREAK, M_VEL, tx - vx * fall, -vy * fall, tz - vz * fall, vx, vy, vz, fall, 3, 2.2, alt, 1.6, 1, 0, 0, 0, 0, 9, 0.1, 0.9, 0, d);
        P(T_BURST, M_BILL, tx, 3, tz, 0, 0, 0, 0.22, 10, 34, alt, 1.2, 1, 0, 0, rnd() * TAU, 0, 1, 0, 0, 0, d + fall);
        gring(tx, tz, 2, 20, 0.35, alt, 1, T_RING, d + fall);
        P(T_PUFF, M_BILL, tx, 3, tz, 0, 10, 0, 1.4, 6, 18, CHAR, 0.5, 0, 0.5, -1, rnd() * TAU, 0, 1, 0.1, 0.2, 1, d + fall);
        for (let j = 0; j < (FULL ? 4 : 2); j++) {
          const b = rnd() * TAU;
          P(T_STREAK, M_VEL, tx, 2, tz, Math.cos(b) * rr(20, 60), rr(30, 70), Math.sin(b) * rr(20, 60), 0.5, 1.2, 0.3, alt, 1.4, 1, 1.5, 70, 0, 0, 5, 0, 0, 0, d + fall);
        }
      }
      P(T_RETICLE, M_FLAT, x, 0.5, z, 0, 0, 0, 0.9, R * 2.2, R * 0.8, col, 1.2, 1, 0, 0, 0, 2.5, 1, 0, 0.5);
      P(T_SHELL, M_BILL, x, 2, z, 0, 0, 0, 0.6, 10, R * 1.1, col, 0.7, 1, 0, 0, 0, 0, 1, 0, 0.3, 0, 0.9);
      column(x, 0.3, z, 110, 14, 34, 0.7, col, 0.7, 1, 8, 1, 0.9);
      gring(x, z, 6, R * 0.9, 0.5, alt, 1.1, T_RING, 0.9);
      if (A && ctx.world.spawnBeam) { // the Plasma Cannon itself, point blank
        chest(A, _a);
        _b.set(x - _a.x, 2 - _a.y, z - _a.z);
        const len = _b.length();
        if (len > 6) ctx.world.spawnBeam(_a.clone(), _b.clone().multiplyScalar(1 / len), len, col.getHex(), alt.getHex());
      }
    } else {
      // ATOMIC: a pillar of fire into the sky, a heat cap rolling up it, and then Gorrak breathes on what is left
      column(x, 0.3, z, 230, 16, 44, 1.1, col, 0.75, 1, 7, 1);
      column(x, 0.3, z, 170, 7, 16, 0.9, WHITE, 0.6, 1, 8, 1);
      for (let i = 0; i < cnt(16); i++) {
        const a = i / 16 * TAU + rnd() * 0.3;
        _col.copy(CHAR).lerp(col, 0.25);
        P(T_PUFF, M_BILL, x + Math.cos(a) * 14, 12, z + Math.sin(a) * 14, Math.cos(a) * 22, rr(34, 52), Math.sin(a) * 22, rr(2.2, 3), 12, rr(26, 36), _col, 0.55, 0, 0.9, 0, rnd() * TAU, rr(-0.4, 0.4), 1, 0.1, 0.3, 1, 0.15);
      }
      for (let i = 0; i < cnt(40); i++) {
        const a = rnd() * TAU, el = rr(0.1, 1.2), sp = rr(60, 130);
        P(T_STREAK, M_VEL, x, 4, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp, rr(0.7, 1.3), 1.6, 0.4, rnd() < 0.3 ? WHITE : col, 1.5, 1, 1.2, 40, 0, 0, 6);
      }
      if (A && ctx.scene) {
        headPos(A, _a);
        _bz.origin.copy(_a);
        _bz.dir.set(x - _a.x, 3 - _a.y, z - _a.z);
        const dist = _bz.dir.length();
        if (dist > 8) fireAtomicBreath(ctx.scene, _bz.origin, _bz.dir, dist, col.getHex(), atomicAfter, { world: ctx.world });
      }
    }
  }
  // Gorrak's follow-up breath lands in the crater: one more ring and a longer burn
  const atomicAfter = (pos) => {
    if (!W.running || !B) return;
    const col = pal[fin.who].main;
    gring(pos.x, pos.z, 6, 70, 0.7, col, 1.1);
    emitter(E_EMBERS, pos.x, 0, pos.z, 5, col, 40);
  };

  // ---- ceremony ----
  function fxEntrance(e) {
    const f = fighter(e.who), col = colOf(e.who);
    const x = e.x || (f ? f.pos.x : 0), z = e.z || (f ? f.pos.z : 0);
    if (e.beat === 'rise') {
      lastSlamT = -9;
      if (ctx.isWater(x, z)) {
        waterBurst(x, z, 1.3);
        for (let i = 0; i < (FULL ? 6 : 3); i++) { const a = i / 6 * TAU; column(x + Math.cos(a) * 24, 0.3, z + Math.sin(a) * 24, rr(40, 70), 5, 13, 1.6, WATER, 0.7, 0, 4, 1, 0.1 + i * 0.05); }
        gring(x, z, 10, 110, 1.4, WATER, 0.7, T_RIPPLE, 0.1);
        gring(x, z, 8, 60, 0.7, col, 0.9, T_RING, 0.05);
      } else fxSlam(x, z, 1.2, col);
    } else if (e.beat === 'roar') {
      if (!f) return;
      headPos(f, _a);
      const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
      for (let i = 0; i < 3; i++) P(T_RING, M_PLANE, _a.x + fx * 4, _a.y, _a.z + fz * 4, fx, 0.1, fz, 0.6, 6, 70 + 16 * i, i === 1 ? WHITE : col, 1 - 0.2 * i, 1, 0, 0, 0, 0, 1, 0, 0.2, 0, i * 0.13);
      igniteAura(f);
    } else if (e.beat === 'crash') {
      // the challenger comes through the Loop: the same exit wound as a thrown body, bigger
      const A = W.arena && W.arena.info;
      dir2(x, z, A ? A.cx : x + 1, A ? A.cz : z);
      const y = Math.max(8, e.y || 14), dx = _dx, dz = _dz;
      P(T_RING, M_PLANE, x, y, z, dx, 0, dz, 0.5, 12, 80, CONCRETE, 0.9, 1, 0, 0, 0, 0, 1, 0, 0.15);
      P(T_BURST, M_BILL, x, y, z, 0, 0, 0, 0.2, 16, 60, col, 1, 1, 0, 0, rnd() * TAU);
      for (let i = 0; i < cnt(30); i++) {
        const sp = rr(40, 120), sz0 = rr(1.2, 3.2);
        _col.copy(CONCRETE).multiplyScalar(rr(0.6, 1.1));
        P(T_CHIP, M_BILL, x + rr(-6, 6), y + rr(-6, 10), z + rr(-6, 6), (dx + rr(-0.6, 0.6)) * sp, rr(0, 50), (dz + rr(-0.6, 0.6)) * sp, rr(1.2, 1.8), sz0, sz0, _col, 1, 0, 0.7, 60, rnd() * TAU, rr(-10, 10), rr(0.6, 1.4), 0, 0.7);
      }
      for (let i = 0; i < cnt(12); i++) P(T_PUFF, M_BILL, x + rr(-8, 8), y + rr(-8, 8), z + rr(-8, 8), dx * rr(20, 60) + rr(-10, 10), rr(2, 12), dz * rr(20, 60) + rr(-10, 10), rr(1.4, 2.2), 8, rr(18, 28), CONCRETE, 0.55, 0, 2, -1, rnd() * TAU, 0, 1, 0.08, 0.2, 1);
      sparks(x, y, z, dx, 0.3, dz, cnt(16), 50, 120, 0.6, col, 1.2, 0.5, 50);
    } else if (e.beat === 'arrive') {
      lastSlamT = -9;
      fxSlam(x, z, 0.9, col);
      pyro(col, 0.1);
    } else if (e.beat === 'pose') {
      if (f) igniteAura(f);
      pyro(col, 0.1);
    }
  }
  function fxWin(winner) {
    const A = W.arena && W.arena.info, col = colOf(winner), f = fighter(winner);
    for (let i = 0; i < 3; i++) pyro(i === 1 ? GOLD : col, 0.2 + i * 1.1, 1.6);
    if (A) {
      emitter(E_CONFETTI, A.cx, 78, A.cz, 11, col, A.half * 0.95, 0.3);
      // streamers: ribbons thrown from every post across the ring
      const pts = A.posts;
      for (let i = 0; i < pts.length; i++) {
        dir2(pts[i].x, pts[i].z, A.cx, A.cz);
        for (let j = 0; j < cnt(10); j++) {
          const c = j % 3 === 0 ? WHITE : j % 3 === 1 ? col : GOLD, sp = rr(26, 52), d = 0.3 + rnd() * 2.4;
          P(T_STREAK, M_VEL, pts[i].x, A.postH + 2, pts[i].z, _dx * sp + rr(-12, 12), rr(30, 52), _dz * sp + rr(-12, 12), rr(2.6, 3.4), 1.1, 0.9, c, 1, 0, 0.25, 22, 0, 0, rr(14, 22), 0.05, 0.8, 0, d);
        }
      }
    }
    if (f) igniteAura(f);
  }
  function fxKo(e) {
    const col = colOf(e.by === 'player' || e.by === 'rival' ? e.by : (e.who === 'player' ? 'rival' : 'player'));
    P(T_GLINT, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.5, 80, 16, WHITE, 1.5, 1, 0, 0, 0.5, 1.2, 1, 0, 0.3);
    P(T_RING, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.5, 8, 90, col, 1.1, 1, 0, 0, 0, 0, 1, 0, 0.2);
    P(T_BURST, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.22, 20, 70, col, 1, 1, 0, 0, rnd() * TAU);
    flashLight(e.x, e.y, e.z, col, 10, 0.5);
  }
  function fxPinCount(e) {
    const V = fighter(e.target);
    if (!V) return;
    const p = V.pos, k = e.count, col = k >= 3 ? GOLD : WHITE;
    gring(p.x, p.z, 6, 30 + 14 * k, 0.4, col, 0.8 + 0.2 * k);
    dustRing(p.x, p.z, cnt(6 + 3 * k), 14, 16, 30, 4, 10, 0.9, DUST, 0.45);
    if (k >= 3) { P(T_GLINT, M_BILL, p.x, 16, p.z, 0, 0, 0, 0.4, 60, 14, GOLD, 1.5, 1, 0, 0, 0.4, 1.5); pyro(GOLD, 0, 0.8); }
  }
  function fxPower(e) {
    const f = fighter(e.who);
    if (!f) return;
    // a clean hit of a signature power: the kaiju's colour, rings rather than the warm strike starburst
    const col = colOf(e.who), w = Math.min(1.2, e.impact || 0.6);
    if (e.blocked) { fxBlock(e); return; }
    P(T_BURST, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.2, 12, 30 + 30 * w, col, 1.3, 1, 0, 0, rnd() * TAU);
    P(T_RING, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.32, 6, 36 + 34 * w, col, 1.1, 1, 0, 0, 0, 0, 1, 0, 0.2);
    P(T_RING, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.3, 4, 24 + 20 * w, WHITE, 0.8, 1, 0, 0, 0, 0, 1, 0, 0.2, 0, 0.06);
    for (let i = 0; i < cnt(10 + 16 * w); i++) {
      const a = rnd() * TAU, el = rr(-0.5, 1), sp = rr(40, 100);
      P(T_STREAK, M_VEL, e.x, e.y, e.z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp, rr(0.3, 0.6), 1.3, 0.4, col, 1.5, 1, 1.8, 50, 0, 0, 6);
    }
    if (w > 0.8) flashLight(e.x, e.y, e.z, col, 8, 0.3);
  }

  // ---- lifecycle ----
  const on = (name, fn) => offs.push(W.bus.on(name, fn));
  function setPal(id, f) {
    const sig = SIG[f.key] || SIG.godzilla, cfg = f.cfg || {};
    pal[id].main.setHex(cfg.beam && cfg.beam.color !== undefined ? cfg.beam.color : sig[0]);
    pal[id].alt.setHex(sig[1]);
    pal[id].hot.copy(pal[id].main).lerp(WHITE, 0.6);
  }
  function resetState() {
    for (const id of ['player', 'rival']) {
      const s = st[id];
      s.auraAcc = 0; s.full = false; s.exhausted = false; s.steamAcc = 0; s.blockK = 0; s.stunT = 0; s.trail.on = false; s.tele.on = false;
    }
    for (const t of teles) t.on = false;
    for (const e of ems) e.on = false;
    for (const q of later) q.t = -1;
    fin.on = false; lock = false; lockAcc = 0; lastSlamT = -9;
    if (light.l && light.l._seq === light.seq) { light.l.intensity = 0; light.l.distance = 60; light.l.color.setHex(0xffaa33); }
    light.l = null;
  }
  function frame(dt) {
    L.n = 0;
    T += dt;
    const a = W.player, b = W.rival;
    if (a && b) {
      if (dt > 0) {
        tickEmitters(dt); tickLater();
      }
      tickFighter(a, st.player, dt); tickFighter(b, st.rival, dt);
      tickLock(dt); tickTeles(dt); tickFinisher(dt);
    }
    tickLight(dt);
    S.mat.uniforms.uT.value = T;
    _flush(B, false);
    B.mesh.visible = T < B.until;
    L.g.instanceCount = L.n;
    L.mesh.visible = L.n > 0;
    if (L.n > 0) { L.lo = 0; L.hi = L.n - 1; _flush(L, false); } else { L.lo = 1e9; L.hi = -1; }
  }

  return {
    start() {
      S = _sys(); B = S.burst; L = S.live;
      T = 0; spawned = 0;
      B.arr.fill(0); B.cur = 0; B.dcur = 0; B.until = 0; B.lo = 1e9; B.hi = -1; _flush(B, true);
      L.n = 0; L.g.instanceCount = 0;
      S.mat.uniforms.uT.value = 0;
      B.mesh.visible = false; L.mesh.visible = false;
      if (ctx.scene) { ctx.scene.add(B.mesh); ctx.scene.add(L.mesh); }
      resetState();
      setPal('player', W.player); setPal('rival', W.rival);

      on(EV.STRIKE_START, (e) => {
        const f = fighter(e.who);
        if (!f) return;
        const te = st[f.id].tele;
        te.on = true; te.t = 0; te.dur = Math.max(0.12, e.windup || 0.3);
        te.heavy = e.kind !== 'light'; te.both = e.kind === 'clothesline' || e.kind === 'splash';
      });
      on(EV.STRIKE_LANDED, (e) => {
        const f = fighter(e.who);
        if (f) st[f.id].tele.on = false;
        if (e.kind === 'splash' || e.kind === 'stomp') { fxSlam(e.x, e.z, 0.7 + 0.5 * e.impact, colOf(e.who), e.kind === 'splash' ? 1 : 0); return; }
        fxStrike(e);
      });
      on(EV.STRIKE_BLOCKED, fxBlock);
      on(EV.STRIKE_REVERSED, fxReversal);
      on(EV.STRIKE_WHIFFED, (e) => { const f = fighter(e.who); if (f) st[f.id].tele.on = false; });
      on(EV.POWER_TELEGRAPH, (e) => {
        let t = teles[0];
        for (let i = 0; i < teles.length; i++) if (!teles[i].on) { t = teles[i]; break; }
        t.on = true; t.t = 0; t.dur = Math.max(0.15, e.dur); t.r = e.radius; t.x = e.x; t.z = e.z; t.who = e.who; t.target = e.target;
      });
      on(EV.POWER_HIT, fxPower);
      on(EV.STAGGER, fxStagger);
      on(EV.STUN, fxStunStart);
      on(EV.BLOCK_START, (e) => { const f = fighter(e.who); if (f) st[f.id].blockK = 0.6; });
      on(EV.BLOCK_BROKEN, fxGuardBreak);
      on(EV.GRAB_START, (e) => {
        lock = true;
        P(T_GLINT, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.25, 30, 8, WHITE, 1.3, 1, 0, 0, 0.4, 2);
        P(T_RING, M_BILL, e.x, e.y, e.z, 0, 0, 0, 0.28, 5, 34, colOf(e.who), 0.9, 1, 0, 0, 0, 0, 1, 0, 0.2);
        sparks(e.x, e.y, e.z, 0, 1, 0, cnt(12), 30, 80, 1.3, SPARK, 1, 0.4, 70);
      });
      on(EV.PICKUP, () => { lock = true; });
      on(EV.GRAB_REVERSED, (e) => {
        lock = true;
        const a = fighter(e.who), b = fighter(e.target);
        if (!a || !b) return;
        chest(a, _a); chest(b, _b);
        const x = (_a.x + _b.x) / 2, y = (_a.y + _b.y) / 2, z = (_a.z + _b.z) / 2;
        P(T_RING, M_BILL, x, y, z, 0, 0, 0, 0.4, 6, 56, GOLD, 1.6, 1, 0, 0, 0, 0, 1, 0, 0.15);
        P(T_GLINT, M_BILL, x, y, z, 0, 0, 0, 0.36, 54, 12, GOLD, 1.7, 1, 0, 0, 0.6, -1.4, 1, 0, 0.25);
        sparks(x, y, z, 0, 1, 0, cnt(14), 40, 100, 1.4, GOLD, 1.2, 0.45, 50, 1.7);
      });
      on(EV.GRAB_ESCAPED, (e) => {
        lock = false;
        const a = fighter(e.who);
        if (!a) return;
        chest(a, _a);
        P(T_RING, M_BILL, _a.x, _a.y, _a.z, 0, 0, 0, 0.3, 8, 46, colOf(e.who), 1, 1, 0, 0, 0, 0, 1, 0, 0.2);
        sparks(_a.x, _a.y, _a.z, 0, 0.6, 0, cnt(10), 40, 90, 1.3, colOf(e.who), 1, 0.4, 50);
      });
      on(EV.LIFT_START, (e) => {
        lock = false;
        const a = fighter(e.who);
        if (!a) return;
        gring(a.pos.x, a.pos.z, 6, 30, 0.4, colOf(e.who), 0.9);
        dustRing(a.pos.x, a.pos.z, cnt(8), 10, 14, 26, 4, 10, 1, DUST, 0.45);
      });
      on(EV.SWING_SPIN, (e) => {
        const a = fighter(e.who);
        if (!a) return;
        gring(a.pos.x, a.pos.z, 10, 36 + 6 * e.turns, 0.4, colOf(e.who), 0.6 + 0.12 * e.turns, T_RIPPLE, 0, 3);
        dustRing(a.pos.x, a.pos.z, cnt(6 + 2 * e.turns), 14, 20, 40, 4, 11, 0.9, DUST, 0.4);
      });
      on(EV.THROW_LAUNCH, (e) => { lock = false; fxLaunch(e); });
      on(EV.THROW_LAND, (e) => {
        const V = fighter(e.target);
        if (V) st[V.id].trail.on = false;
        if (e.surface === 'building' || e.surface === 'ropes') return; // building:impact / rope:rebound draw those
        const w = Math.min(1.25, 0.45 + (e.impact || 0.5) * 0.8);
        if (e.surface === 'water') { lastSlamT = T; lastSlamX = e.x; lastSlamZ = e.z; waterBurst(e.x, e.z, w); }
        else fxSlam(e.x, e.z, w, colOf(e.who));
      });
      on(EV.BUILDING_IMPACT, fxBuilding);
      on(EV.ROPE_REBOUND, fxRope);
      on(EV.ROPE_SNAP, fxRopeSnap);
      on(EV.POST_IMPACT, (e) => {
        const A = W.arena && W.arena.info, V = fighter(e.who);
        if (!A) return;
        const w = Math.min(1.2, (e.impact || 0.5) + (e.toppled ? 0.4 : 0)), y = A.postH * 0.6;
        if (V) dir2(V.pos.x, V.pos.z, e.x, e.z); else { _dx = 0; _dz = 1; }
        // steel on kaiju: a hard white-orange burst, the floodlight head throwing sparks
        P(T_BURST, M_BILL, e.x, y, e.z, 0, 0, 0, 0.18, 12, 30 + 26 * w, SPARK, 1.4, 1, 0, 0, rnd() * TAU);
        P(T_RING, M_PLANE, e.x, y, e.z, _dx, 0.1, _dz, 0.3, 6, 30 + 26 * w, WHITE, 1, 1, 0, 0, 0, 0, 1, 0, 0.2);
        sparks(e.x, y, e.z, _dx, 0.6, _dz, cnt(14 + 16 * w), 40, 110, 0.9, SPARK, 1.1, 0.5, 60);
        sparks(e.x, A.postH + 2, e.z, 0, 1, 0, cnt(10), 20, 60, 1.2, WHITE, 0.9, 0.6, 50, 1.3);
        for (let j = 0; j < cnt(6 + 10 * w); j++) {
          const sz = rr(1.2, 2.8);
          P(T_CHIP, M_BILL, e.x, rr(4, A.postH), e.z, _dx * rr(10, 50) + rr(-20, 20), rr(10, 50), _dz * rr(10, 50) + rr(-20, 20), rr(1.2, 1.8), sz, sz, STEEL, 1, 0, 0.4, 65, rnd() * TAU, rr(-12, 12), rr(0.6, 1.5), 0, 0.7);
        }
        if (e.toppled) { dustRing(e.x, e.z, cnt(12), 4, 16, 34, 5, 13, 1.3, DUST, 0.55); flashLight(e.x, y, e.z, SPARK, 8, 0.3); }
      });
      on(EV.GRAB_MOVE, (e) => {
        // the holder commits: a quick tightening ring so the move out of the lock-up has a beat to read
        const a = fighter(e.who);
        if (!a) return;
        chest(a, _a);
        P(T_RING, M_BILL, _a.x, _a.y + 4, _a.z, 0, 0, 0, Math.max(0.15, Math.min(0.5, e.dur || 0.3)), 34, 6, colOf(e.who), 0.9, 1, 0, 0, 0, 0, 1, 0.3, 0.6);
      });
      on(EV.WATER_IMPACT, (e) => {
        if (T - lastSlamT < 0.15 && Math.hypot(e.x - lastSlamX, e.z - lastSlamZ) < 16) return;
        lastSlamT = T; lastSlamX = e.x; lastSlamZ = e.z;
        waterBurst(e.x, e.z, Math.min(1.3, 0.3 + 0.33 * e.size));
      });
      on(EV.KNOCKDOWN, (e) => {
        if (e.cause === 'finisher') return;
        fxSlam(e.x, e.z, Math.min(1.1, 0.35 + (e.impact || 0.4) * 0.7), colOf(e.by === 'player' || e.by === 'rival' ? e.by : e.who));
      });
      on(EV.GETUP, (e) => { dustRing(e.x, e.z, cnt(6), 8, 10, 20, 4, 9, 0.9, DUST, 0.4); });
      on(EV.PIN_COUNT, fxPinCount);
      on(EV.PIN_KICKOUT, (e) => {
        const f = fighter(e.who);
        if (!f) return;
        chest(f, _a);
        P(T_BURST, M_BILL, _a.x, _a.y, _a.z, 0, 0, 0, 0.22, 14, e.near ? 70 : 44, colOf(e.who), 1.2, 1, 0, 0, rnd() * TAU);
        P(T_RING, M_BILL, _a.x, _a.y, _a.z, 0, 0, 0, 0.35, 8, e.near ? 80 : 50, e.near ? GOLD : colOf(e.who), 1.1, 1, 0, 0, 0, 0, 1, 0, 0.2);
      });
      on(EV.MOMENTUM_SPENT, (e) => {
        const f = fighter(e.who);
        if (!f) return;
        st[f.id].full = false;
        gring(f.pos.x, f.pos.z, 40, 6, 0.35, colOf(e.who), 1);
      });
      on(EV.STAMINA_EMPTY, (e) => {
        const f = fighter(e.who);
        if (!f) return;
        st[f.id].exhausted = true;
        headPos(f, _a);
        for (let i = 0; i < cnt(8); i++) P(T_PUFF, M_BILL, _a.x + rr(-4, 4), _a.y, _a.z + rr(-4, 4), rr(-6, 6), rr(8, 18), rr(-6, 6), 1.3, 4, 12, STEAM, 0.45, 0, 1, -2, rnd() * TAU, 0, 1, 0.1, 0.2, 1);
      });
      on(EV.STAMINA_RECOVERED, (e) => { const f = fighter(e.who); if (f) st[f.id].exhausted = false; });
      on(EV.TAUNT_COMPLETE, (e) => {
        const f = fighter(e.who);
        if (!f) return;
        gring(f.pos.x, f.pos.z, 6, 44, 0.5, colOf(e.who), 1);
        for (let i = 0; i < cnt(14); i++) {
          const a = rnd() * TAU, r = rr(6, 14);
          P(T_STREAK, M_VEL, f.pos.x + Math.cos(a) * r, rr(2, 10), f.pos.z + Math.sin(a) * r, 0, rr(40, 80), 0, rr(0.35, 0.6), 1.1, 0.4, colOf(e.who), 1.2, 1, 1, 0, 0, 0, 8);
        }
      });
      on(EV.FINISHER_START, fxFinStart);
      on(EV.FINISHER_BEAT, fxFinBeat);
      on(EV.FINISHER_IMPACT, fxFinImpact);
      on(EV.FINISHER_END, () => { fin.on = false; });
      on(EV.KO, fxKo);
      on(EV.ENTRANCE_BEAT, fxEntrance);
      on(EV.BELL, (e) => {
        const A = W.arena && W.arena.info;
        if (!A || e.kind !== 'start') return;
        for (const p of A.posts) P(T_GLINT, M_BILL, p.x, A.postH + 3, p.z, 0, 0, 0, 0.45, 34, 8, WHITE, 1.3, 1, 0, 0, 0.3, 2);
      });
      on(EV.MATCH_OVER, (e) => {
        if (e.winner === 'player') fxWin('player');
        else if (e.winner === 'rival') pyro(colOf('rival'), 0.4, 1.4);
      });
    },
    update(dt, dtReal) { if (B) frame(dt); },
    // The simulation is stopped: only the result screen keeps the show running (confetti over the champion)
    updateIdle(dtReal) { if (B) frame(W.match && W.match.state && W.match.state.phase === 'over' ? dtReal : 0); },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      resetState();
      if (B) {
        // every pooled sprite back (decals included) and both meshes out of the scene
        B.arr.fill(0); B.until = 0; B.cur = 0; B.dcur = 0; _flush(B, true);
        L.n = 0; L.g.instanceCount = 0;
        B.mesh.visible = false; L.mesh.visible = false;
        if (B.mesh.parent) B.mesh.parent.remove(B.mesh);
        if (L.mesh.parent) L.mesh.parent.remove(L.mesh);
      }
      B = null; L = null; S = null;
    },
    /** QA: { spawned, cap, liveNow, clock }. */
    get stats() { return { spawned, cap: CAP, decals: DECALS, liveNow: L ? L.n : 0, clock: T, pm: PM }; },
  };
}
