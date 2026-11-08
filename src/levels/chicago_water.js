// Chicago water: one shared material for the lake, harbours, river and
// ponds, with depth colour from a baked shore-distance field, a shallow band
// and shore / breakwater foam, layered wave normals, sky fresnel and a sun
// glint. Built on MeshStandardMaterial (onBeforeCompile) so it keeps three's
// lights, shadows and fog: one extra lit program for all water.
import * as THREE from 'three';

const DMAX = 120; // shore distance (u) that maps to the deepest colour

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
  // Two-pass chamfer (3/4) distance to the nearest land texel
  const INF = 1e9, d = new Float32Array(nx * nz);
  for (let k = 0; k < d.length; k++) d[k] = wet[k] ? INF : 0;
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
  return { tex, box: new THREE.Vector4(box.x0, box.z0, 1 / (nx * cell), 1 / (nz * cell)) };
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

/** The shared water material. field: bakeShoreField() result. */
export function makeWaterMaterial(field, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.0 });
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
  };
  mat.userData.water = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    sh.fragmentShader = `varying vec2 vWXZ;
      uniform sampler2D uWave, uField;
      uniform vec4 uFieldBox;
      uniform float uTime, uWaveAmp;
      uniform vec3 uDeep, uMid, uShallow, uShore, uRiver, uRiverEdge, uSky, uSunDir, uSunCol;
      float wShore, wPool, wFoam;
      vec3 wN;
    ` + sh.fragmentShader
      // Depth colour + foam (replaces the plain material colour)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 fld = texture2D(uField, (vWXZ - uFieldBox.xy) * uFieldBox.zw).rg;
          float raw = fld.r * 255.0;
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
          diffuseColor.rgb = mix(c, vec3(0.90, 0.94, 0.95), wFoam * 0.75);
        }`)
      // Wave normal: two scrolling octaves of the tileable map, world space
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 s1 = texture2D(uWave, vWXZ * 0.021 + vec2(uTime * 0.010, uTime * 0.006)).rg * 2.0 - 1.0;
          vec2 s2 = texture2D(uWave, vWXZ * 0.067 + vec2(-uTime * 0.017, uTime * 0.013)).rg * 2.0 - 1.0;
          float calm = mix(1.0, 0.45, wPool) * (1.0 - wFoam * 0.6);
          vec2 sl = (s1 * 0.6 + s2 * 0.4) * uWaveAmp * calm;
          wN = normalize(vec3(-sl.x, 1.0, -sl.y));
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        }`)
      // Sky fresnel + sun glint on top of three's lighting
      .replace('#include <opaque_fragment>', `{
          vec3 V = normalize(cameraPosition - vec3(vWXZ.x, 0.2, vWXZ.y));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(wN, V), 0.0), 5.0);
          outgoingLight = mix(outgoingLight, uSky * 0.85, fres * 0.45 * (1.0 - wFoam));
          vec3 R = reflect(-V, wN);
          float g = pow(max(dot(R, uSunDir), 0.0), 220.0);
          outgoingLight += uSunCol * g * 2.2 * (1.0 - wFoam);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'chi-water';
  return mat;
}
