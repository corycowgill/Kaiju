// Chicago water: one shared material for the lake, harbours, river and
// ponds, with depth colour from a baked shore-distance field, a shallow band
// and shore / breakwater foam, layered wave normals, sky fresnel and a sun
// glint. Built on MeshStandardMaterial (onBeforeCompile) so it keeps three's
// lights, shadows and fog: one extra lit program for all water.
import * as THREE from 'three';

const DMAX = 120; // shore distance (u) that maps to the deepest colour
const NRING = 12;  // ripple / surge sources (analytic rings, no render target)
const NTRAIL = 6;  // wake trail points

/** Shore-distance texture over a box. polys: [{ polygon, holes, kind }]
 *  filled as water (holes cut back to land); rects: [[x0, z0, x1, z1]] extra
 *  open water (the planes out to the horizon). R: land 0, water 1..255 =
 *  distance to the nearest land, 0..DMAX u. G: 255 on river / pond water
 *  (its own palette), 0 on the lake and harbours. */
export function bakeShoreField(polys, rects, box, cell = 2) {
  const nx = Math.ceil((box.x1 - box.x0) / cell), nz = Math.ceil((box.z1 - box.z0) / cell);
  const wet = new Uint8Array(nx * nz);
  const fill = (poly, v, arr = wet) => {
    for (let j = 0; j < nz; j++) {
      const z = box.z0 + (j + 0.5) * cell;
      const xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, za] = poly[a], [xb, zb] = poly[b];
        if ((za > z) !== (zb > z)) xs.push(xa + (z - za) * (xb - xa) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.round((xs[k] - box.x0) / cell)), i1 = Math.min(nx - 1, Math.round((xs[k + 1] - box.x0) / cell) - 1);
        for (let i = i0; i <= i1; i++) arr[j * nx + i] = v;
      }
    }
  };
  for (const [x0, z0, x1, z1] of rects) fill([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 1);
  for (const p of polys) fill(p.polygon, 1);
  for (const p of polys) for (const h of p.holes || []) fill(h, 0);
  const river = new Uint8Array(nx * nz);
  for (const p of polys) if (p.kind === 'river' || p.kind === 'pond') fill(p.polygon, 255, river);
  // Two-pass chamfer (3/4) distance to the nearest texel of the other kind:
  // water texels -> nearest land (depth colour, foam, depthAt), land texels
  // -> nearest water (CPU only: shoreDist on the land side, for audio)
  const INF = 1e9;
  const chamfer = (seedIsZero) => {
    const d = new Float32Array(nx * nz);
    for (let k = 0; k < d.length; k++) d[k] = seedIsZero(k) ? 0 : INF;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!d[k]) continue;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 3);
      if (j > 0) { v = Math.min(v, d[k - nx] + 3); if (i > 0) v = Math.min(v, d[k - nx - 1] + 4); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + 4); }
      d[k] = v;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i; if (!d[k]) continue;
      let v = d[k];
      if (i < nx - 1) v = Math.min(v, d[k + 1] + 3);
      if (j < nz - 1) { v = Math.min(v, d[k + nx] + 3); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + 4); if (i > 0) v = Math.min(v, d[k + nx - 1] + 4); }
      d[k] = v;
    }
    return d;
  };
  const d = chamfer((k) => !wet[k]);
  const dLand = chamfer((k) => !!wet[k]);
  const data = new Uint8Array(nx * nz * 2);
  for (let k = 0; k < nx * nz; k++) {
    data[k * 2 + 1] = river[k];
    if (!wet[k]) continue;
    const du = (d[k] / 3) * cell; // chamfer units -> world units
    data[k * 2] = 1 + Math.round(254 * Math.min(1, du / DMAX));
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  /** World units from (x, z) to the shoreline, on either side (>= 0); off
   *  the box: DMAX. inWater(x, z) says which side. */
  const idx = (x, z) => {
    const i = Math.floor((x - box.x0) / cell), j = Math.floor((z - box.z0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const shoreDist = (x, z) => {
    const k = idx(x, z);
    if (k < 0) return DMAX;
    return Math.min(DMAX, ((wet[k] ? d[k] : dLand[k]) / 3) * cell);
  };
  const inWater = (x, z) => { const k = idx(x, z); return k >= 0 && !!wet[k]; };
  return { tex, box: new THREE.Vector4(box.x0, box.z0, 1 / (nx * cell), 1 / (nz * cell)), shoreDist, inWater };
}

/** Tileable wave normal map (RG = slope x/z, B unused) with height in A,
 *  from a sum of integer-frequency directional sine waves (so it tiles). */
function _waveTexture(size = 256) {
  const waves = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const k = 2 + Math.floor(rnd() * 14); // cycles per tile
    const a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), kz = Math.round(Math.sin(a) * k);
    if (!kx && !kz) continue;
    waves.push([kx, kz, 1 / Math.hypot(kx, kz), rnd() * Math.PI * 2]);
  }
  const data = new Uint8Array(size * size * 4);
  let hmin = Infinity, hmax = -Infinity;
  const H = new Float32Array(size * size), SX = new Float32Array(size * size), SZ = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = (i / size) * Math.PI * 2, v = (j / size) * Math.PI * 2;
    let h = 0, sx = 0, sz = 0;
    for (const [kx, kz, amp, ph] of waves) {
      const p = kx * u + kz * v + ph;
      h += Math.sin(p) * amp;
      const c = Math.cos(p) * amp;
      sx += c * kx; sz += c * kz;
    }
    const k = j * size + i;
    H[k] = h; SX[k] = sx; SZ[k] = sz;
    hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  let smax = 0;
  for (let k = 0; k < H.length; k++) smax = Math.max(smax, Math.abs(SX[k]), Math.abs(SZ[k]));
  for (let k = 0; k < H.length; k++) {
    data[k * 4] = Math.round(127.5 + 127.5 * SX[k] / smax);
    data[k * 4 + 1] = Math.round(127.5 + 127.5 * SZ[k] / smax);
    data[k * 4 + 2] = 255;
    data[k * 4 + 3] = Math.round(255 * (H[k] - hmin) / (hmax - hmin));
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const _uniforms = new WeakMap(); // water material -> its shared uniforms
const _SWELL_OFF = { value: 0 };
/** The shared uniforms of a water material (uTime etc.). */
export const waterUniforms = (mat) => _uniforms.get(mat);

// Open-lake swell (desktop HIGH): a few long, world-anchored directional
// waves, masked to deep open water by the shore field (nothing in the
// harbours behind the breakwaters, on the river or near a wall) and faded
// to zero at the edge of the camera-following swell grid. The same mask
// splits the flat water from the grid per fragment, so they never overlap.
const SWELL_GLSL = `
  uniform sampler2D uField;
  uniform vec4 uFieldBox;
  uniform vec3 uGrid; // centre x, z, half size (0: no grid)
  float swellMask(vec2 p) {
    if (uGrid.z <= 0.0) return 0.0;
    vec2 e = abs(p - uGrid.xy) / uGrid.z;
    float edge = 1.0 - smoothstep(0.7, 0.98, max(e.x, e.y));
    vec2 f = texture(uField, (p - uFieldBox.xy) * uFieldBox.zw).rg;
    float d = max(0.0, f.r * 255.0 - 1.0) / 254.0 * ${DMAX.toFixed(1)};
    return edge * smoothstep(24.0, 60.0, d) * (1.0 - f.g);
  }
  // height (y) and slope (xz) of the swell at p
  vec3 swell(vec2 p, float t) {
    vec3 r = vec3(0.0);
    vec4 W[4];
    W[0] = vec4(normalize(vec2(-0.9, 0.35)), 0.18, 0.80); // dir, amp, rad/u... (k)
    W[1] = vec4(normalize(vec2(-0.6, -0.7)), 0.10, 0.13);
    W[2] = vec4(normalize(vec2(-1.0, 0.1)), 0.07, 0.27);
    W[3] = vec4(normalize(vec2(-0.3, 0.9)), 0.05, 0.41);
    for (int i = 0; i < 4; i++) {
      float k = W[i].w * 0.25, a = W[i].z;
      float ph = dot(W[i].xy, p) * k - t * sqrt(9.8 * k) * 0.55;
      r.x += a * sin(ph);
      r.yz += W[i].xy * (a * k * cos(ph));
    }
    return r;
  }
`;

/** The shared water material. field: bakeShoreField() result. */
export function makeWaterMaterial(field, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.0 });
  const uniforms = {
    uWave: { value: _waveTexture() },
    uField: { value: field.tex },
    uFieldBox: { value: field.box },
    uTime: { value: 0 },
    // Lake Michigan at noon: navy offshore, steel blue-teal over the
    // shelf, a narrow lighter band at the walls
    uDeep: { value: new THREE.Color(0x0b2b49) },
    uMid: { value: new THREE.Color(0x15465f) },
    uShallow: { value: new THREE.Color(0x225a66) },
    uShore: { value: new THREE.Color(0x3b7a7e) },
    // Chicago River: opaque green-teal, slightly lighter at the walls
    uRiver: { value: new THREE.Color(0x1d443c) },
    uRiverEdge: { value: new THREE.Color(0x2a5a4e) },
    uSky: { value: new THREE.Color(opts.sky ?? 0xbcd6ee) },
    uSunDir: { value: new THREE.Vector3(6, 140, 50).normalize() },
    uSunCol: { value: new THREE.Color(0xfff3e2) },
    uWaveAmp: { value: 0.55 },
    uGrid: { value: new THREE.Vector3(0, 0, 0) },
    // Kaiju interaction (waterFX): ripple / surge sources, the wake, its trail
    uRings: { value: Array.from({ length: NRING }, () => new THREE.Vector4(0, 0, -1e4, 0)) },
    uWake: { value: new THREE.Vector4(0, 0, 1, 0) },
    uWakeAmt: { value: 0 },
    uTrail: { value: Array.from({ length: NTRAIL }, () => new THREE.Vector4(0, 0, -1e4, 0)) },
  };
  // Kept off userData: Material.clone() JSON-copies userData, which would
  // serialise the textures' pixel arrays
  _uniforms.set(mat, uniforms);
  mat.onBeforeCompile = function (sh) {
    Object.assign(sh.uniforms, uniforms);
    // Per material, not shared: 1 only on the swell grid's clone
    sh.uniforms.uSwellOn = this._swellOn || _SWELL_OFF;
    sh.vertexShader = 'varying vec2 vWXZ;\nvarying float vSwellH;\nuniform float uTime, uSwellOn;\n' + SWELL_GLSL + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vSwellH = 0.0;
      if (uSwellOn > 0.5) {
        vec2 wp = (modelMatrix * vec4(transformed, 1.0)).xz;
        float m = swellMask(wp);
        vec3 sw = swell(wp, uTime) * m;
        transformed.y += sw.x;
        vSwellH = sw.x;
      }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    sh.fragmentShader = `varying vec2 vWXZ;
      varying float vSwellH;
      uniform sampler2D uWave;
      uniform float uTime, uWaveAmp, uSwellOn;
      ${SWELL_GLSL}
      uniform vec3 uDeep, uMid, uShallow, uShore, uRiver, uRiverEdge, uSky, uSunDir, uSunCol;
      float wShore, wPool, wFoam, wRiver;
      vec3 wN;
      vec2 wFxSlope;
      uniform vec4 uRings[${NRING}];
      uniform vec4 uWake;
      uniform float uWakeAmt;
      uniform vec4 uTrail[${NTRAIL}];
      // Kaiju interaction: returns foam; writes the ripple slope to wFxSlope.
      // Rings: (x, z, start time, strength); strength < 0 is a shore surge
      // (a foam pulse where the water meets a wall, no ring).
      float waterFx(vec2 p, float shore) {
        float foam = 0.0;
        wFxSlope = vec2(0.0);
        for (int i = 0; i < ${NRING}; i++) {
          vec4 R = uRings[i];
          float age = uTime - R.z;
          if (age < 0.0 || age > 3.5) continue;
          vec2 dv = p - R.xy;
          float r = length(dv);
          if (R.w < 0.0) {
            // surge: 1.2 s pulse within ~22u along the shore
            if (age > 1.2 || r > 30.0) continue;
            foam += -R.w * exp(-r * r / 300.0) * (1.0 - age / 1.2) * (1.0 - smoothstep(1.0, 9.0, shore));
            continue;
          }
          float front = age * 9.0;
          float dr = r - front, w = 1.2 + age * 1.3;
          if (abs(dr) > 3.0 * w) continue;
          float env = exp(-dr * dr / (w * w)) * pow(1.0 - age / 3.5, 1.5) * R.w;
          float k = 6.2832 / 3.5;
          wFxSlope += (dv / max(r, 0.01)) * (0.9 * env * cos(dr * k) * k * 0.45);
          foam += env * smoothstep(0.3, 1.0, sin(dr * k)) * 0.28 * smoothstep(0.0, 0.35, age);
        }
        // V-wake: two arms at ~19.5 deg behind the wading kaiju, plus a
        // foam collar around its legs
        if (uWakeAmt > 0.01) {
          vec2 rel = p - uWake.xy, dir = uWake.zw;
          float sBack = -dot(rel, dir), l = dot(rel, vec2(-dir.y, dir.x));
          if (sBack > -6.0 && sBack < 48.0) {
            float arm = abs(abs(l) - max(sBack, 0.0) * 0.36), aw = 0.9 + 0.05 * max(sBack, 0.0);
            foam += uWakeAmt * exp(-arm * arm / (aw * aw)) * (1.0 - clamp(sBack / 48.0, 0.0, 1.0)) * step(0.0, sBack) * 0.7;
            float rr = length(rel);
            foam += uWakeAmt * exp(-(rr - 5.0) * (rr - 5.0) / 3.0) * 0.5;
            wFxSlope += normalize(rel + 1e-4) * uWakeAmt * exp(-(rr - 6.0) * (rr - 6.0) / 8.0) * 0.25;
          }
        }
        // Trail: fading, widening foam along the recent path
        for (int i = 0; i < ${NTRAIL} - 1; i++) {
          vec4 A = uTrail[i], B = uTrail[i + 1];
          float ageA = uTime - A.z;
          if (ageA > 4.0 || B.z < -1e3) continue;
          vec2 ab = B.xy - A.xy;
          float t = clamp(dot(p - A.xy, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
          vec2 q = A.xy + ab * t;
          float age = mix(ageA, uTime - B.z, t), tw = 1.5 + age * 1.6;
          vec2 dq = p - q;
          float dd = dot(dq, dq);
          if (dd > 9.0 * tw * tw) continue;
          foam += mix(A.w, B.w, t) * exp(-dd / (tw * tw)) * (1.0 - age / 4.0) * (1.0 - age / 4.0) * 0.32;
        }
        return clamp(foam, 0.0, 1.0);
      }
    ` + sh.fragmentShader
      // Depth colour + foam (replaces the plain material colour)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // Flat water and the swell grid split the surface by the swell mask
          float sm = swellMask(vWXZ);
          if (uSwellOn > 0.5 ? sm < 0.01 : sm >= 0.01) discard;
          vec2 fld = texture2D(uField, (vWXZ - uFieldBox.xy) * uFieldBox.zw).rg;
          float raw = fld.r * 255.0;
          wRiver = fld.g;
          wPool = 1.0 - smoothstep(0.15, 0.45, raw);         // outside every water polygon (fountain pools)
          float d = max(0.0, raw - 1.0) / 254.0 * ${DMAX.toFixed(1)}; // world units to the shore
          wShore = d;
          float t = clamp(d / ${DMAX.toFixed(1)}, 0.0, 1.0);
          vec3 c = mix(uShore, uShallow, smoothstep(0.0, 3.0, d));
          c = mix(c, uMid, smoothstep(3.0, 22.0, d));
          c = mix(c, uDeep, smoothstep(22.0, 90.0, d));
          c = mix(c, mix(uRiverEdge, uRiver, smoothstep(0.0, 4.0, d)), fld.g);
          c = mix(c, uShallow, wPool);
          // Foam: a broken band at the shore / breakwaters
          float fn = texture2D(uWave, vWXZ * 0.045 + vec2(uTime * 0.012, -uTime * 0.009)).a;
          float fn2 = texture2D(uWave, vWXZ * 0.11 - vec2(uTime * 0.02, uTime * 0.015)).a;
          float band = 1.0 - smoothstep(0.3, 2.4, d + (fn - 0.5) * 2.0);
          // Calmer river / pond edges: a thin lapping line only
          band *= mix(1.0, 0.45, fld.g);
          wFoam = clamp(band * smoothstep(0.38, 0.68, fn2 * 0.6 + fn * 0.5), 0.0, 1.0) * (1.0 - wPool);
          // Kaiju ripples, wake and shore surges: foam broken up by the same noise
          float fx = waterFx(vWXZ, d) * (1.0 - wPool);
          wFoam = clamp(wFoam + fx * smoothstep(0.25, 0.6, fn2 * 0.7 + 0.3), 0.0, 1.0);
          diffuseColor.rgb = mix(c, vec3(0.90, 0.94, 0.95), wFoam * 0.75);
        }`)
      // Wave normal: two scrolling octaves of the tileable map, world space
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 s1 = texture2D(uWave, vWXZ * 0.021 + vec2(uTime * 0.010, uTime * 0.006)).rg * 2.0 - 1.0;
          vec2 s2 = texture2D(uWave, vWXZ * 0.067 + vec2(-uTime * 0.017, uTime * 0.013)).rg * 2.0 - 1.0;
          // Calmer near walls (harbours sit behind breakwaters) and on the river
          float calm = mix(1.0, 0.45, wPool) * (1.0 - wFoam * 0.6) * mix(0.55, 1.0, smoothstep(8.0, 60.0, wShore)) * mix(1.0, 0.55, wRiver);
          vec2 sl = (s1 * 0.6 + s2 * 0.4) * uWaveAmp * calm + wFxSlope;
          if (uSwellOn > 0.5) sl += swell(vWXZ, uTime).yz * swellMask(vWXZ);
          wN = normalize(vec3(-sl.x, 1.0, -sl.y));
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        }`)
      // Sky fresnel + sun glint on top of three's lighting
      .replace('#include <opaque_fragment>', `{
          vec3 V = normalize(cameraPosition - vec3(vWXZ.x, 0.2, vWXZ.y));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(wN, V), 0.0), 5.0);
          outgoingLight = mix(outgoingLight, uSky * 0.85, fres * 0.45 * (1.0 - wFoam));
          vec3 R = reflect(-V, wN);
          float g = pow(max(dot(R, uSunDir), 0.0), 380.0);
          outgoingLight += uSunCol * g * 1.0 * (1.0 - wFoam);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'chi-water';
  return mat;
}

/**
 * world.water: the kaiju interaction API (gameplay calls it, waterPlay.js).
 * ripple(x, z, strength 0..1), wake(x, z, dirX, dirZ, speed) per frame while
 * wading, surge(x, z, strength) at the shore, splash(x, z, size, kind)
 * through the shared splash pool, depthAt(x, z) 0..1. No allocations; the
 * rings and the wake are analytic in the water shader (no render target),
 * so every tier gets them. update(dt) runs as a city animator.
 */
export function waterFX(mat, field, splash, lite = false) {
  const U = _uniforms.get(mat);
  let ring = 0, wakeSeen = -1e4, trailT = -1e4;
  const now = () => U.uTime.value;
  const add = (x, z, s) => { U.uRings.value[ring].set(x, z, now(), s); ring = (ring + 1) % NRING; };
  return {
    surfaceY: 0.2,
    // 0 on land, rising to 1 ('full', the wade feel) 24u out from the shore
    depthAt(x, z) { return field.inWater(x, z) ? Math.min(1, field.shoreDist(x, z) / 24) : 0; },
    // World units to the shoreline, either side (audio's updateShore);
    // isWater / depthAt > 0 tells the side
    shoreDist(x, z) { return field.shoreDist(x, z); },
    ripple(x, z, strength = 1) { add(x, z, Math.max(0.05, Math.min(1.2, strength))); },
    surge(x, z, strength = 1) { add(x, z, -Math.max(0.1, Math.min(1, strength))); },
    wake(x, z, dx, dz, speed) {
      wakeSeen = now();
      U.uWake.value.set(x, z, dx, dz);
      const target = Math.min(1, speed / 28);
      U.uWakeAmt.value += (target - U.uWakeAmt.value) * 0.15;
      // Trail point every 0.3 s: shift older points down (newest first)
      if (now() - trailT > 0.3) {
        trailT = now();
        const T = U.uTrail.value;
        for (let i = T.length - 1; i > 0; i--) T[i].copy(T[i - 1]);
        T[0].set(x, z, now(), U.uWakeAmt.value);
      }
    },
    splash(x, z, size = 1, kind = '') {
      if (!splash) return;
      const big = Math.min(3, Math.max(0.3, size));
      const n = Math.round((kind === 'foot' ? 8 : 10 + 12 * big) * (lite ? 0.5 : 1));
      splash.burst(x, z, n, 0.6 + 0.45 * big, true);
    },
    update(dt) {
      // The wake fades out when nobody is wading (no wake() this frame)
      if (now() - wakeSeen > 0.2) U.uWakeAmt.value *= Math.exp(-dt / 0.5);
    },
  };
}

/** Desktop HIGH: the camera-following swell grid (one draw). Uses a clone
 *  of the water material that shares its program (same hook and cache key)
 *  with uSwellOn = 1. Returns an animator: update(dt, time, camera). */
export function swellGrid(scene, mat, half = 130, seg = 128) {
  const gm = mat.clone();
  gm._swellOn = { value: 1 };
  gm.onBeforeCompile = mat.onBeforeCompile;
  gm.customProgramCacheKey = mat.customProgramCacheKey;
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg).rotateX(-Math.PI / 2);
  geo.translate(0, 0.2, 0);
  const mesh = new THREE.Mesh(geo, gm);
  mesh.frustumCulled = false; // follows the camera; displaced in the shader
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  const U = _uniforms.get(mat), step = (half * 2) / seg;
  U.uGrid.value.set(0, 0, half);
  return {
    mesh,
    update(dt, time, camera) {
      if (!camera) return;
      // Snapped to the vertex spacing so the mesh never swims
      const x = Math.round(camera.position.x / step) * step, z = Math.round(camera.position.z / step) * step;
      if (x !== mesh.position.x || z !== mesh.position.z) {
        // This runs in Scene.onBeforeRender, after three's world-matrix
        // update: write matrixWorld directly (parent is the scene) so the
        // mesh and uGrid (the flat water's cut-out) move in the same frame
        mesh.position.set(x, 0, z); mesh.updateMatrix(); mesh.matrixWorld.copy(mesh.matrix);
        U.uGrid.value.set(x, z, mesh.visible ? half : 0);
      }
    },
  };
}
