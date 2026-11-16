import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoTreeSurface } from './chicagoMaterials.js';

// Seattle trees (owner: seattle-design). Same build as Chicago's / DC's / NYC's
// park trees (one canopy + one wood mesh per tree, alpha-tested leaf cards,
// near / far LOD twins registered with the city kit, the shared tree shader
// family via chicagoTreeSurface: no new onBeforeCompile) with Pacific Northwest
// species:
//  - 'fir': Douglas fir, the tall park conifer: straight trunk bare for the
//    lowest quarter, whorls of near-level branches shortening to a narrow
//    spire, dark blue-green needle sprays (~35 m).
//  - 'cedar': western red cedar: buttressed reddish fibrous trunk, a broad
//    cone down to the ground of drooping branches that turn up at the tips,
//    hanging flat yellow-green sprays, a nodding leader (~25 m).
//  - 'maple': big-leaf maple: short mossy trunk forking into heavy spreading
//    limbs, a broad rounded crown of very large lobed leaves (~20 m).
//  - 'redmaple': red maple street tree, oval crown of small lobed leaves (~11 m).
//  - 'plane': London plane (street / plaza), mottled bark, rounded crown (~12 m).
//  - 'cherry': ornamental cherry, low and spreading, pale pink blossom (~8 m).
// Layout kinds: 'park' (fir, cedar, big-leaf maple with the odd plane / red
// maple), 'street' (red maple / plane / cherry ~8-12 m), 'evergreen' (and its
// alias 'conifer': Douglas fir and red cedar). Unknown kinds fall back to 'park'.
// Sizes: `fit` is computed from each template's real height so that a placement
// scale of 0.8 (seattle.js PS x 1.0) lands on the species' true height at the
// level's 0.2 u/m; pass s ~ 0.9-1.1 x PS for natural variation.
let templates;
const hash = (x, z) => {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const UPM = 0.2, REF_SCALE = 0.8;

function dataTexture(pixels, size) {
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Four sprays per atlas. shape: 'needle' (fir: twigs with dense needles),
// 'frond' (cedar: flat pinnate sprays of scale leaves), 'lobed' (maples, plane),
// 'blossom' (cherry).
const LEAF = {
  fir: { shape: 'needle', bg: [40, 62, 46], twigs: 7, green: [64, 30], tint: [.62, .5] },
  cedar: { shape: 'frond', bg: [70, 92, 44], twigs: 5, green: [92, 40], tint: [.78, .4] },
  maple: { shape: 'lobed', bg: [86, 112, 48], count: 46, len: [8, 5], green: [104, 50] },
  redmaple: { shape: 'lobed', bg: [70, 94, 44], count: 110, len: [3.5, 3], green: [86, 50] },
  plane: { shape: 'lobed', bg: [74, 96, 50], count: 70, len: [6, 6], green: [84, 54] },
  cherry: { shape: 'blossom', bg: [214, 168, 184], count: 150, len: [2.6, 2.2], green: [96, 50] },
};

function paintBlade(pixels, size, tileX, tileY, x, y, heading, length, width, rgb, shapeFn) {
  const c = Math.cos(heading), s = Math.sin(heading), r = Math.max(length, width);
  for (let py = Math.max(3, Math.floor(y - r)); py <= Math.min(124, y + r); py++) {
    for (let px = Math.max(3, Math.floor(x - r)); px <= Math.min(124, x + r); px++) {
      const dx = px - x, dy = py - y;
      const u = (dx * c + dy * s) / length, v = (dy * c - dx * s) / width;
      const edge = shapeFn(u, v);
      if (edge <= 0) continue;
      const shade = .86 + .16 * hash(px, py);
      pixels.set([rgb[0] * shade, rgb[1] * shade, rgb[2] * shade, Math.min(255, 120 + edge * 490)], ((tileY + py) * size + tileX + px) * 4);
    }
  }
}

function leafAtlas(kind) {
  const spec = LEAF[kind], size = 256, tileSize = size / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([...spec.bg, 0], i);
  const green = (i, tile) => {
    const g = spec.green[0] + hash(i, tile + 42) * spec.green[1];
    const t = spec.tint || [.6, .34];
    return [g * (t[0] + hash(i, tile + 48) * .16), g, g * (t[1] + hash(i, tile + 53) * .12)];
  };
  for (let tile = 0; tile < 4; tile++) {
    const tileX = (tile % 2) * tileSize, tileY = Math.floor(tile / 2) * tileSize;
    if (spec.shape === 'needle' || spec.shape === 'frond') {
      // twigs fan out from near the tile's lower centre; needles (fir) or scale-leaf pinnae (cedar) along them
      for (let t = 0; t < spec.twigs; t++) {
        const a0 = -Math.PI / 2 + (t / (spec.twigs - 1) - .5) * 2.4 + (hash(t, tile) - .5) * .3;
        let x = 64 + (hash(t, tile + 5) - .5) * 16, y = 104 - hash(t, tile + 6) * 10, a = a0;
        const steps = 20 + Math.floor(hash(t, tile + 7) * 8);
        for (let k = 0; k < steps; k++) {
          a += (hash(k, t + tile * 9) - .5) * .12;
          x += Math.cos(a) * 3.2; y += Math.sin(a) * 3.2;
          if (x < 8 || x > 120 || y < 8 || y > 120) break;
          const fade = 1 - k / steps;
          const rgb = green(t * 40 + k, tile);
          if (spec.shape === 'needle') {
            for (const side of [-1, 1]) for (const lean of [.9, 1.25]) {
              const h = a + side * lean, len = 4.5 + 3 * fade;
              paintBlade(pixels, size, tileX, tileY, x + Math.cos(h) * len * .55, y + Math.sin(h) * len * .55, h, len * .55, .9,
                rgb.map((v) => v * (lean > 1 ? .86 : 1)), (u, v) => 1 - u * u - v * v);
            }
          } else {
            // cedar: pinnate side sprays of overlapping scale leaves
            const pl = (9 + 6 * fade) * (k % 2 ? 1 : .8);
            for (const side of [-1, 1]) {
              const h = a + side * 1.05;
              for (let q = 0; q < 4; q++) {
                const d = 2 + q * pl / 4;
                paintBlade(pixels, size, tileX, tileY, x + Math.cos(h) * d, y + Math.sin(h) * d, h, 2.4, 1.6,
                  rgb.map((v, ch) => v * (1 + q * .04) * (ch === 0 ? 1.03 : 1)), (u, v) => 1 - u * u - v * v);
              }
            }
            paintBlade(pixels, size, tileX, tileY, x, y, a, 2.6, 1.7, rgb, (u, v) => 1 - u * u - v * v);
          }
        }
      }
      continue;
    }
    for (let i = 0; i < spec.count; i++) {
      const angle = hash(i, tile + 2) * Math.PI * 2;
      const radius = Math.sqrt(hash(i, tile + 9)) * (44 + 8 * Math.sin(angle * 3 + tile));
      const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius * .9;
      const heading = angle + (hash(i, tile + 17) - .5) * 2.5;
      const flower = spec.shape === 'blossom' && hash(i, tile + 71) > .25;
      const length = spec.len[0] + hash(i, tile + 26) * spec.len[1];
      const width = flower ? length : length * .95;
      let rgb;
      if (flower) {
        const w = hash(i, tile + 42);
        rgb = [226 + w * 22, 168 + w * 50, 190 + w * 40];      // pale Yoshino pink to white
      } else {
        rgb = green(i, tile);
        if (kind === 'cherry') rgb = [rgb[0] * 1.1, rgb[1] * 1.04, rgb[2]];
      }
      const shape = flower
        ? (u, v) => { const rr = Math.hypot(u, v), th = Math.atan2(v, u); return 1 - rr / (.72 + .28 * Math.abs(Math.cos(th * 2.5))); }
        : (u, v) => { const rr = Math.hypot(u, v), th = Math.atan2(v, u); return 1 - rr / (.62 + .38 * Math.pow(Math.abs(Math.cos(th * 2.5)), 1.6)); };
      paintBlade(pixels, size, tileX, tileY, x, y, heading, length, width, rgb, shape);
    }
  }
  return dataTexture(pixels, size);
}

// tiling value noise on a size/cell grid (128 px textures), 0..1
function vnoise(x, y, cell, seed, size = 128) {
  const n = size / cell, gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v = (i, j) => hash(((i % n) + n) % n + seed * 31, ((j % n) + n) % n + seed * 17);
  return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
}

function barkTexture(kind) {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let rgb;
    if (kind === 'fir') { // thick corky bark, deep vertical furrows, dark red-brown ridges
      const bend = 2.5 * Math.sin(y * .06 + x * .04) + Math.sin(y * .17);
      const ridge = Math.abs(Math.sin((x + bend) * .32)) ** .45;
      const v = 46 + ridge * 44 + hash(x, y) * 10;
      rgb = [v * 1.12, v * .86, v * .7];
    } else if (kind === 'cedar') { // long fibrous strips, red-brown weathering to grey
      const strip = vnoise(x, y * .12, 4, 7);
      const grey = vnoise(x, y, 32, 3) > .55 ? 1 : 0;
      const v = 78 + strip * 40 + hash(x, y) * 8;
      rgb = grey ? [v * 1.0, v * .95, v * .88] : [v * 1.18, v * .82, v * .66];
    } else if (kind === 'maple') { // grey-brown furrowed, wrapped in green moss in patches
      const ridge = Math.abs(Math.sin(x * .4 + Math.sin(y * .08) * 2)) ** .4;
      const moss = vnoise(x, y, 16, 11) * .7 + vnoise(x, y, 8, 13) * .3;
      const v = 70 + ridge * 30 + hash(x, y) * 10;
      rgb = moss > .55 ? [78 + hash(x, y) * 12, 104 + hash(y, x) * 14, 46] : [v, v * .95, v * .86];
    } else if (kind === 'plane') { // exfoliating jigsaw patches: cream, olive, grey-brown
      const p = vnoise(x, y, 16, 3) * .65 + vnoise(x, y, 8, 5) * .35, q = vnoise(x, y, 11, 9);
      const n = hash(x, y) * 8;
      rgb = p > .62 ? [196, 188, 152] : p < .36 ? [118, 112, 96] : q > .5 ? [146, 144, 112] : [162, 154, 126];
      rgb = rgb.map((v) => v + n - 4);
    } else if (kind === 'cherry') { // dark red-brown with horizontal lenticels
      const band = Math.abs(Math.sin(y * .55 + Math.sin(x * .2))) < .12 ? -16 : 0;
      const v = 70 + hash(x, y) * 10 + band;
      rgb = [v * 1.08, v * .93, v * .78];
    } else { // red maple: smooth pale grey, a few shallow plates
      const plate = vnoise(x, y, 16, 21) > .62 ? -10 : 0;
      const v = 112 + hash(x, y) * 10 + plate;
      rgb = [v, v * .98, v * .94];
    }
    pixels.set([...rgb, 255], (y * size + x) * 4);
  }
  const texture = dataTexture(pixels, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function tint(geometry, color, canopy, h) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const shade = canopy ? .7 + THREE.MathUtils.smoothstep(y, h * .3, h * .9) * .36 : .9 + Math.min(y, 7) * .014;
    colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3);
  }
  geometry.setAttribute('chiTint', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function branch(start, end, baseRadius, tipRadius, sides) {
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, direction.length(), sides, 1, true);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  const center = start.clone().lerp(end, .5);
  geometry.applyQuaternion(rotation).translate(center.x, center.y, center.z);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (start.y + uv.getY(i) * (end.y - start.y)) * .7);
  return geometry;
}

function leafCard(center, width, height, yaw, pitch, tile) {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(pitch).rotateY(yaw).translate(center.x, center.y, center.z);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (tile % 2) * .5 + .007 + uv.getX(i) * .486, Math.floor(tile / 2) * .5 + .007 + uv.getY(i) * .486);
  }
  return geometry;
}

// Species shapes (template units; true size comes from the layout kind). 'fork' species split at the trunk top into
// limbs (maples, plane, cherry); 'conifer' species carry a stem to the top with whorls of branches: crown base
// `base` (fraction of h), radius `R` at the crown base, `droop` (tip drop per unit of spread), `upturn` (cedar J tips).
const SPECIES = {
  fir: { form: 'conifer', h: 14, trunkR: .42, base: .26, R: 1.9, whorls: 17, per: 6, droop: .14, upturn: 0, cards: 5, card: 1.3, pitch: .5, leaf: [0xccd8c6, 0xc4d2c0], wood: [0xd2c4b8, 0xc8bcb0] },
  cedar: { form: 'conifer', h: 12, trunkR: .5, base: .05, R: 2.6, whorls: 13, per: 6, droop: .45, upturn: .5, cards: 4, card: 1.3, pitch: 1.15, buttress: 1.5, leaf: [0xd8e0c0, 0xd2dcba], wood: [0xd8c8bc, 0xd0c0b2] },
  maple: { form: 'fork', trunkH: 3.2, trunkR: .62, limbs: 6, tipH: [8.4, 11.2], spread: [4.6, 5.8], arch: .3, cards: 20, card: 2.1, h: 11.6, crownFill: 16, leaf: [0xd8e4b4, 0xd4e0ae], wood: [0xd8d4c8, 0xd0ccbe] },
  redmaple: { form: 'fork', trunkH: 2.6, trunkR: .36, limbs: 6, tipH: [8.0, 10.4], spread: [2.4, 3.2], arch: .05, cards: 18, card: 1.4, h: 10.6, crownFill: 14, leaf: [0xc8d8b0, 0xd0dcb4], wood: [0xd8d6d0, 0xd0cec8] },
  plane: { form: 'fork', trunkH: 3.0, trunkR: .62, limbs: 6, tipH: [7.4, 10.6], spread: [4.4, 5.6], arch: .15, cards: 22, card: 2.0, h: 11.6, crownFill: 18, leaf: [0xc4d2a8, 0xccd8ae], wood: [0xe0dccc, 0xd8d2be] },
  cherry: { form: 'fork', trunkH: 1.4, trunkR: .3, limbs: 6, tipH: [3.6, 5.2], spread: [3.0, 4.0], arch: .15, cards: 9, card: 1.5, h: 5.6, leaf: [0xf8f0f2, 0xf4ecee], wood: [0xd0c6b8, 0xc8bcac] },
};
// layout kinds -> [cumulative pick, species, true height (m)] picked by the tree's position hash
const KINDS = {
  fir: [[1, 'fir', 35]],
  cedar: [[1, 'cedar', 25]],
  maple: [[1, 'maple', 20]],
  redmaple: [[1, 'redmaple', 11]],
  plane: [[1, 'plane', 12]],
  cherry: [[1, 'cherry', 8]],
  park: [[.36, 'fir', 34], [.56, 'cedar', 24], [.84, 'maple', 19], [.93, 'plane', 18], [1, 'redmaple', 12]],
  street: [[.45, 'redmaple', 11], [.8, 'plane', 12], [1, 'cherry', 8]],
  evergreen: [[.62, 'fir', 35], [1, 'cedar', 25]],
};
KINDS.conifer = KINDS.evergreen;

function makeTemplate(kind, variant, far) {
  const sp = SPECIES[kind];
  const leaves = [], wood = [];
  const leafColor = new THREE.Color(sp.leaf[variant]);
  const woodColor = new THREE.Color(sp.wood[variant]);
  const addCards = (from, to, i, n, cardK = 1, droop = 0, pitchK = 1) => {
    for (let j = 0; j < n; j++) {
      const t = .55 + .45 * hash(i * 13 + j, variant + 9);
      const base = from.clone().lerp(to, t);
      const heading = i * 1.7 + j * 2.39996;
      const off = (.3 + hash(i * 11 + j, variant + 20)) * sp.card * .8;
      const center = base.add(new THREE.Vector3(Math.cos(heading) * off, (hash(i + j * 7, variant + 3) - .3 - droop) * sp.card, Math.sin(heading) * off));
      const size = sp.card * cardK * (far ? 1.45 : 1) * (.8 + hash(i, j + variant + 50) * .45);
      const pitch = (hash(i * 5 + j, 5 + variant) - .5) * (kind === 'cherry' ? 2.2 : 1.6) * pitchK;
      leaves.push(leafCard(center, size * 1.2, size, heading, pitch, (i + j) % 4));
    }
  };
  if (sp.form === 'conifer') {
    const lean = new THREE.Vector3(variant ? .08 : -.06, 0, variant ? -.05 : .07);
    const at = (y) => new THREE.Vector3(lean.x * y / sp.h, y, lean.z * y / sp.h);
    const top = at(sp.h);
    if (sp.buttress) { // flared, buttressed base
      wood.push(branch(new THREE.Vector3(0, -.1, 0), at(sp.buttress), sp.trunkR * 1.6, sp.trunkR, far ? 6 : 9));
      wood.push(branch(at(sp.buttress), at(sp.h * .92), sp.trunkR, .05, far ? 5 : 8));
    } else {
      wood.push(branch(new THREE.Vector3(0, -.1, 0), at(sp.h * .96), sp.trunkR, .05, far ? 5 : 8));
    }
    const whorls = far ? Math.ceil(sp.whorls * .6) : sp.whorls;
    for (let w = 0; w < whorls; w++) {
      const f = w / (whorls - 1);                                       // 0 crown base .. 1 top
      const y0 = sp.h * (sp.base + (.97 - sp.base) * f);
      const spread = (sp.R * Math.pow(1 - f, .95) + .35) * (.85 + hash(w, variant + 30) * .3);
      const per = far ? Math.max(3, sp.per - 2) : sp.per;
      for (let k = 0; k < per; k++) {
        const angle = k * (Math.PI * 2 / per) + w * 2.39996 + variant * .7 + (hash(w * 7 + k, variant) - .5) * .5;
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const start = at(y0);
        const drop = sp.droop * spread * (1.2 - f * .6);
        const mid = start.clone().add(dir.clone().multiplyScalar(spread * .6)).add(new THREE.Vector3(0, -drop * .9, 0));
        const tip = start.clone().add(dir.clone().multiplyScalar(spread)).add(new THREE.Vector3(0, -drop + sp.upturn * spread * .5, 0));
        const r = sp.trunkR * (.3 - .2 * f);
        if (far) wood.push(branch(start, tip, r, .03, 3));
        else { wood.push(branch(start, mid, r, r * .6, 3)); wood.push(branch(mid, tip, r * .6, .02, 3)); }
        const n = far ? Math.max(1, Math.ceil(sp.cards / 2)) : sp.cards;
        // sprays along the outer two thirds of the branch; cedar sprays hang (steeper pitch)
        addCards(start.clone().lerp(mid, .5), tip, w * 11 + k, n, .7 + .5 * (1 - f), sp.upturn ? .2 : 0, sp.pitch);
      }
    }
    addCards(at(sp.h * .9), top, 999, far ? 2 : 4, .6);              // the leader
  } else {
    const top = new THREE.Vector3(variant ? .12 : -.1, sp.trunkH, variant ? -.06 : .08);
    wood.push(branch(new THREE.Vector3(0, -.1, 0), top, sp.trunkR, sp.trunkR * .72, far ? 5 : 8));
    for (let i = 0; i < sp.limbs; i++) {
      const angle = i * (Math.PI * 2 / sp.limbs) + variant * .7 + (hash(i, variant + 3) - .5) * .6;
      const tipH = sp.tipH[0] + hash(i, 7 + variant) * (sp.tipH[1] - sp.tipH[0]);
      const spread = sp.spread[0] + hash(i, variant + 1) * (sp.spread[1] - sp.spread[0]);
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const mid = top.clone().add(dir.clone().multiplyScalar(spread * (.45 - sp.arch * .25)))
        .add(new THREE.Vector3(0, (tipH - sp.trunkH) * (.55 + sp.arch * .2), 0));
      const tip = new THREE.Vector3(dir.x * spread, tipH, dir.z * spread);
      if (far) wood.push(branch(top, tip, sp.trunkR * .42, .04, 4));
      else {
        wood.push(branch(top, mid, sp.trunkR * .5, sp.trunkR * .3, 6));
        wood.push(branch(mid, tip, sp.trunkR * .3, .05, 5));
        const twig = tip.clone().add(dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.0).multiplyScalar(spread * .3));
        twig.y -= sp.h * .06;
        wood.push(branch(mid, twig, sp.trunkR * .18, .02, 4));
      }
      addCards(mid, tip, i, far ? Math.ceil(sp.cards / 2.5) : sp.cards);
    }
    if (sp.crownFill) { // fill the dome's crown so it reads round, not as a ring of limb tufts
      const n = far ? Math.ceil(sp.crownFill / 2) : sp.crownFill;
      for (let j = 0; j < n; j++) {
        const a = j * 2.39996 + variant, rr = Math.sqrt((j + .5) / n) * sp.spread[0] * .95;
        const c = new THREE.Vector3(Math.cos(a) * rr, sp.tipH[0] - 1.2 + (sp.tipH[1] - sp.tipH[0]) * (1 - rr / sp.spread[0] * .7) + hash(j, variant) * 1.4, Math.sin(a) * rr);
        const size = sp.card * 1.15 * (far ? 1.4 : 1);
        leaves.push(leafCard(c, size * 1.2, size, a, (hash(j, 4 + variant) - .5) * 1.2 - .6, j % 4));
      }
    }
  }
  const merge = (parts, color, canopy) => {
    const geometry = tint(mergeGeometries(parts), color, canopy, sp.h);
    for (const part of parts) part.dispose();
    geometry.userData.shared = true;
    return geometry;
  };
  const canopy = merge(leaves, leafColor, true);
  canopy.userData.soldierOccluder = true;
  return [canopy, merge(wood, woodColor, false)];
}

/** Seattle tree factory: (x, z, scale, kind) => Object3D, like createNycTrees.
 *  kind: 'fir' | 'cedar' | 'maple' | 'redmaple' | 'plane' | 'cherry' | layout kinds 'park' | 'street' | 'evergreen'
 *  ('conifer' = 'evergreen'). scale: seattle.js passes s * PS (PS 0.8); s = 1 lands on the true height. */
export function createSeattleTrees(K, lite = false, glb = true) {
  if (!templates) {
    templates = {};
    for (const kind of Object.keys(SPECIES)) {
      const materials = [
        new THREE.MeshStandardMaterial({ name: `Seattle ${kind} canopy`, map: leafAtlas(kind), side: THREE.DoubleSide, roughness: .95 }),
        new THREE.MeshStandardMaterial({ name: `Seattle ${kind} bark`, map: barkTexture(kind), side: THREE.DoubleSide, roughness: 1 }),
      ];
      for (const material of materials) { material.userData.shared = true; chicagoTreeSurface(material); }
      // phones: one shape per species (fewer instanced batches)
      templates[kind] = (lite ? [0] : [0, 1]).map((variant) => {
        const near = makeTemplate(kind, variant, false), far = makeTemplate(kind, variant, true);
        near[0].computeBoundingBox(); near[1].computeBoundingBox();
        const h = Math.max(near[0].boundingBox.max.y, near[1].boundingBox.max.y);
        return { near, far, materials, h };
      });
    }
  }
  for (const kind in templates) for (const template of templates[kind]) for (let i = 0; i < 2; i++) {
    K.registerLod1(template.near[i], template.far[i]);
  }
  return (x = 0, z = 0, scale = 1, kind = 'park') => {
    const seed = hash(x, z), pick = hash(z * 1.7, x * .3);
    const mix = KINDS[kind] || KINDS.park;
    const [, species, trueM] = mix.find(([p]) => pick <= p) || mix[mix.length - 1];
    const set = templates[species];
    const template = set[seed > .5 ? set.length - 1 : 0], root = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh((glb ? template.near : template.far)[i], template.materials[i]);
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    root.position.set(x, 0, z);
    root.rotation.y = seed * Math.PI * 2;
    // fit: template height -> true metres at 0.2 u/m when scale = 0.8 (seattle.js PS)
    const k = scale * trueM * UPM / (template.h * REF_SCALE);
    root.scale.set(k * (.94 + seed * .14), k * (.91 + hash(z, x) * .16), k);
    root.userData.instance = true;
    root.userData.instanceTile = !glb ? 4000 : lite ? 480 : 240;
    root.userData.instanceLodDistance = lite ? 360 : 240;
    root.name = 'Seattle ' + species;
    return root;
  };
}

// ---- the hills past the play box (owner: seattle-design) ----
// The game ground is flat, but Seattle's downtown sits in a bowl of hills: Queen
// Anne to the north, Capitol Hill / First Hill east across I-5, Beacon Hill to the
// south-east, Magnolia to the north-west and the West Seattle ridge across the bay.
// HILLS: [name, x, z, rx, rz, rot (rad), height] in game units (0.2 u/m, +X east,
// +Z south, origin First Ave / Union St), real summit positions and heights.
// The height fades to 0 within FADE of the play box so nothing in play is lifted.
const HILLS = [
  ['Queen Anne', -217, -640, 260, 220, 0.2, 28],
  ['Capitol Hill', 430, -330, 190, 330, 0.0, 27],
  ['First Hill', 380, 40, 130, 170, 0.0, 21],
  ['Beacon Hill', 500, 700, 170, 400, 0.15, 22],
  ['Magnolia', -870, -800, 260, 170, -0.3, 22],
  ['West Seattle', -760, 820, 230, 520, 0.1, 30],
  ['Yesler Terrace', 330, 230, 110, 110, 0.0, 13],
];
const FADE = 70;
/** Hill height (u) at (x, z) for a play box B ({ minX, maxX, minZ, maxZ }): 0 inside the box, rising past it. */
export function seattleHillHeight(x, z, B) {
  let h = 0;
  for (const [, cx, cz, rx, rz, rot, hh] of HILLS) {
    const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dz = z - cz;
    const u = (dx * c - dz * s) / rx, v = (dx * s + dz * c) / rz, r2 = u * u + v * v;
    if (r2 < 1) h = Math.max(h, hh * Math.pow(1 - r2, 1.6) * (1 + 0.06 * Math.sin(x * 0.05) * Math.cos(z * 0.043)));
  }
  if (!h || !B) return h;
  const d = Math.max(B.minX - x, x - B.maxX, B.minZ - z, z - B.maxZ);   // distance outside the box (< 0 inside)
  if (d <= 0) return 0;
  return d >= FADE ? h : h * (d / FADE) * (d / FADE) * (3 - 2 * d / FADE);
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The hill masses as one unlit, vertex-coloured mesh with baked sun shading (one draw, fogged like the surround
 *  boxes): wooded slopes (dark evergreen stands mottled with lighter maples) and neighbourhoods (grey-green
 *  speckle of roofs and street trees), greener and darker on the crests. water: [{ polygon }] (the surround file's
 *  water; the hills stop at the shore). Lift anything standing on the hills with seattleHillHeight(x, z, B).
 *  opts.lite: coarser grid. */
export function createSeattleHills(B, water = [], opts = {}) {
  const cell = opts.lite ? 18 : 10;
  const sun = new THREE.Vector3(-0.55, 0.9, 0.62).normalize();
  const polys = water.map((w) => w.polygon || w).map((p) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { p, x0, x1, z0, z1 };
  });
  const wet = (x, z) => polys.some((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && pointInPoly(x, z, w.p));
  const noise = (x, z) => {
    const v = Math.sin(x * 0.071 + Math.sin(z * 0.053) * 2.1) * Math.cos(z * 0.067 - Math.sin(x * 0.041) * 1.7);
    return v * 0.5 + 0.5;
  };
  const speck = (x, z) => hash(Math.floor(x / 3), Math.floor(z / 3));
  const C_TREE = new THREE.Color(0x34503a), C_MAPLE = new THREE.Color(0x5e7646), C_HOOD = new THREE.Color(0x7f857a),
    C_ROOF = new THREE.Color(0xa29c90), C_ROOF2 = new THREE.Color(0x6a6460);
  const pos = [], col = [], idx = [];
  const cc = new THREE.Color(), n = new THREE.Vector3();
  for (const [, cx, cz, rx, rz] of HILLS) {
    const R = Math.max(rx, rz) * 1.05, nx = Math.ceil(2 * R / cell), base = pos.length / 3, H = [];
    for (let j = 0; j <= nx; j++) for (let i = 0; i <= nx; i++) {
      const x = cx - R + i * cell, z = cz - R + j * cell, h = seattleHillHeight(x, z, B);
      H.push(h > 0.05 && wet(x, z) ? 0 : h);
    }
    for (let j = 0; j <= nx; j++) for (let i = 0; i <= nx; i++) {
      const x = cx - R + i * cell, z = cz - R + j * cell, h = H[j * (nx + 1) + i];
      const hx = H[j * (nx + 1) + Math.min(nx, i + 1)] - H[j * (nx + 1) + Math.max(0, i - 1)];
      const hz = H[Math.min(nx, j + 1) * (nx + 1) + i] - H[Math.max(0, j - 1) * (nx + 1) + i];
      n.set(-hx / (2 * cell), 1, -hz / (2 * cell)).normalize();
      const shade = 0.62 + 0.48 * Math.max(0, n.dot(sun));
      // wooded where the noise is high and on the steep flanks, neighbourhoods on the gentle tops and lower slopes
      const steep = 1 - n.y, wood = noise(x, z) * 0.8 + steep * 3.5;
      if (wood > 0.62) cc.copy(C_TREE).lerp(C_MAPLE, speck(x, z) * 0.45);
      else cc.copy(C_HOOD).lerp(speck(x, z) > 0.55 ? C_ROOF : C_ROOF2, speck(z, x) * 0.6);
      cc.multiplyScalar(shade * 0.92);
      pos.push(x, h + 0.08, z); col.push(cc.r, cc.g, cc.b);
    }
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (Math.max(H[a], H[b], H[c], H[d]) < 0.6) continue;   // the flat rim is the outer ground's
      idx.push(base + a, base + c, base + b, base + b, base + c, base + d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  mesh.name = 'seattle_hills';
  mesh.frustumCulled = false;
  mesh.userData.backdrop = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return mesh;
}
