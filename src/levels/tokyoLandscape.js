import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoTreeSurface } from './chicagoMaterials.js';

// Tokyo trees. Same build as the other map levels' (one canopy + one wood mesh per tree, alpha-tested leaf
// cards, near / far LOD twins registered with the city kit, the shared tree shader family via chicagoTreeSurface):
//  - 'sakura': Somei-yoshino cherry in bloom, low and spreading, pale pink (~8 m): the moats, Shiba Park, riversides.
//  - 'ginkgo': the avenue tree (Hibiya-dori, Marunouchi): upright, narrow, yellow-green fans (~14 m).
//  - 'zelkova': keyaki, the vase-shaped street tree (~13 m).
//  - 'pine': Japanese black pine, a leaning trunk under flat dark cloud-pruned pads (~9 m): Kokyo Gaien, Hama-rikyu.
//  - 'camphor': kusunoki, the dense evergreen broadleaf of shrine and palace woods (~16 m).
//  - 'cedar': sugi, a straight narrow conifer in shrine precincts (~24 m).
// Layout kinds: those six, 'park' (camphor, zelkova, pine, sakura, the odd cedar), 'street' (zelkova / ginkgo /
// sakura), 'evergreen' ('conifer': pine and camphor). Unknown kinds fall back to 'park'.
// Sizes: a placement scale of 0.8 (tokyo.js PS x 1.0) lands on the species' true height at 0.2 u/m.
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

// Four sprays per atlas. shape: 'needle' (cedar: twigs with dense needles),
// 'frond' (pine: flat pinnate sprays of scale leaves), 'lobed' (zelkova, camphor), 'pinnate' (one palm frond a tile),
// 'blossom' (sakura).
const LEAF = {
  cedar: { shape: 'needle', bg: [40, 60, 44], twigs: 7, green: [62, 30], tint: [.62, .5] },
  pine: { shape: 'needle', bg: [36, 56, 40], twigs: 8, green: [58, 28], tint: [.6, .52] },
  zelkova: { shape: 'lobed', bg: [70, 96, 50], count: 110, len: [4, 3.4], green: [84, 50] },
  ginkgo: { shape: 'lobed', bg: [120, 124, 50], count: 90, len: [4.6, 4], green: [118, 44], tint: [.92, .3] },
  camphor: { shape: 'lobed', bg: [48, 76, 42], count: 150, len: [3.4, 2.6], green: [68, 42] },
  sakura: { shape: 'blossom', bg: [214, 168, 184], count: 150, len: [2.6, 2.2], green: [96, 50] },
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
    if (spec.shape === 'pinnate') {
      // one palm frond a tile: the rachis up the middle (base at the tile's bottom row = v 1), stiff leaflets
      // either side angled toward the tip, longest a third of the way up, short at both ends
      const bend = (hash(tile, 3) - .5) * 10;
      for (let k = 0; k < 54; k++) {
        const f = k / 53, y = 118 - f * 108, x = 64 + bend * f * f;
        const len = (10 + 44 * Math.sin(Math.PI * Math.pow(f, .7)) * (1 - .35 * f)) * (.9 + hash(k, tile) * .2);
        for (const side of [-1, 1]) {
          const h = -Math.PI / 2 + side * (1.25 - .55 * f) + (hash(k, tile + side) - .5) * .12;
          paintBlade(pixels, size, tileX, tileY, x + Math.cos(h) * len * .5, y + Math.sin(h) * len * .5, h, len * .5, 1.5,
            green(k * 2 + side, tile), (u, v) => 1 - u * u * u * u - v * v);
        }
        paintBlade(pixels, size, tileX, tileY, x, y, -Math.PI / 2, 1.6, 1.3, [120, 118, 62], (u, v) => 1 - u * u - v * v);
      }
      continue;
    }
    if (spec.shape === 'needle' || spec.shape === 'frond') {
      // twigs fan out from near the tile's lower centre; needles (cedar) or scale-leaf pinnae (pine) along them
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
            // pine: pinnate side sprays of overlapping scale leaves
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
        if (kind === 'sakura') rgb = [rgb[0] * 1.1, rgb[1] * 1.04, rgb[2]];
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
    if (kind === 'cedar') { // thick fibrous bark, deep vertical furrows, red-brown ridges
      const bend = 2.5 * Math.sin(y * .06 + x * .04) + Math.sin(y * .17);
      const ridge = Math.abs(Math.sin((x + bend) * .32)) ** .45;
      const v = 52 + ridge * 46 + hash(x, y) * 10;
      rgb = [v * 1.22, v * .8, v * .62];
    } else if (kind === 'pine') { // long fibrous strips weathered silver-grey
      const strip = vnoise(x, y * .12, 4, 7);
      const v = 84 + strip * 40 + hash(x, y) * 8;
      rgb = [v * 1.02, v * .97, v * .9];
    } else if (kind === 'palm') { // rows of diamond leaf-base scars, grey-brown
      const row = y / 9, col = (x + (Math.floor(row) % 2) * 6) / 12;
      const fx = col - Math.floor(col) - .5, fy = row - Math.floor(row) - .5;
      const edge = Math.abs(fx) * 1.6 + Math.abs(fy) * 1.9;
      const v = 96 + (edge > .78 ? -34 : 14 * (1 - edge)) + hash(x, y) * 10;
      rgb = [v * 1.05, v * .96, v * .82];
    } else if (kind === 'zelkova') { // exfoliating jigsaw patches: cream, olive, grey-brown
      const p = vnoise(x, y, 16, 3) * .65 + vnoise(x, y, 8, 5) * .35, q = vnoise(x, y, 11, 9);
      const n = hash(x, y) * 8;
      rgb = p > .62 ? [196, 188, 152] : p < .36 ? [118, 112, 96] : q > .5 ? [146, 144, 112] : [162, 154, 126];
      rgb = rgb.map((v) => v + n - 4);
    } else if (kind === 'sakura') { // dark red-brown with horizontal lenticels
      const band = Math.abs(Math.sin(y * .55 + Math.sin(x * .2))) < .12 ? -16 : 0;
      const v = 70 + hash(x, y) * 10 + band;
      rgb = [v * 1.08, v * .93, v * .78];
    } else { // camphor: smooth pale grey, a few shallow plates
      const plate = vnoise(x, y, 16, 21) > .62 ? -10 : 0;
      const v = 118 + hash(x, y) * 10 + plate;
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
// limbs (pine, zelkova, camphor, sakura); 'conifer' species carry a stem to the top with whorls of branches: crown base
// `base` (fraction of h), radius `R` at the crown base, `droop` (tip drop per unit of spread); 'palm': a bare trunk
// and one crown of `fronds` arching strips `frondL` long.
const SPECIES = {
  cedar: { form: 'conifer', h: 14, trunkR: .5, base: .3, R: 1.5, whorls: 17, per: 6, droop: .3, upturn: 0, cards: 5, card: 1.2, pitch: .6, buttress: 1.2, leaf: [0xc8d6c0, 0xc0d0ba], wood: [0xdcc0ae, 0xd2b6a4] },
  pine: { form: 'fork', trunkH: 3.4, trunkR: .66, limbs: 7, tipH: [7.0, 8.4], spread: [5.4, 7.0], arch: .5, cards: 18, card: 2.1, h: 9.2, crownFill: 22, leaf: [0xc4d2bc, 0xbccab4], wood: [0xd8d4cc, 0xd0ccc2] },
  zelkova: { form: 'fork', trunkH: 3.0, trunkR: .62, limbs: 6, tipH: [7.4, 10.6], spread: [4.4, 5.6], arch: .15, cards: 22, card: 2.0, h: 11.6, crownFill: 18, leaf: [0xc4d2a8, 0xccd8ae], wood: [0xe0dccc, 0xd8d2be] },
  ginkgo: { form: 'fork', trunkH: 3.0, trunkR: .62, limbs: 6, tipH: [9.0, 12.6], spread: [2.2, 2.9], arch: .15, cards: 22, card: 2.0, h: 13.2, crownFill: 18, leaf: [0xc4d2a8, 0xccd8ae], wood: [0xe0dccc, 0xd8d2be] },
  camphor: { form: 'fork', trunkH: 2.8, trunkR: .4, limbs: 6, tipH: [6.6, 8.6], spread: [3.0, 3.8], arch: .1, cards: 20, card: 1.6, h: 9.0, crownFill: 20, leaf: [0xc0d0b0, 0xc8d6b4], wood: [0xdcdad4, 0xd4d2cc] },
  sakura: { form: 'fork', trunkH: 1.4, trunkR: .3, limbs: 6, tipH: [3.6, 5.2], spread: [3.0, 4.0], arch: .15, cards: 9, card: 1.5, h: 5.6, leaf: [0xf8f0f2, 0xf4ecee], wood: [0xd0c6b8, 0xc8bcac] },
};
// layout kinds -> [cumulative pick, species, true height (m)] picked by the tree's position hash
const KINDS = {
  sakura: [[1, 'sakura', 8]],
  ginkgo: [[1, 'ginkgo', 14]],
  zelkova: [[1, 'zelkova', 13]],
  pine: [[1, 'pine', 9]],
  camphor: [[1, 'camphor', 16]],
  cedar: [[1, 'cedar', 24]],
  park: [[.38, 'camphor', 16], [.62, 'zelkova', 15], [.8, 'pine', 10], [.93, 'sakura', 8], [1, 'cedar', 22]],
  street: [[.46, 'zelkova', 12], [.82, 'ginkgo', 13], [1, 'sakura', 7]],
  evergreen: [[.6, 'pine', 10], [1, 'camphor', 15]],
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
      const pitch = (hash(i * 5 + j, 5 + variant) - .5) * (kind === 'sakura' ? 2.2 : 1.6) * pitchK;
      leaves.push(leafCard(center, size * 1.2, size, heading, pitch, (i + j) % 4));
    }
  };
  if (sp.form === 'palm') {
    const lean = new THREE.Vector3(variant ? .22 : -.16, 0, variant ? -.12 : .2);
    const head = new THREE.Vector3(lean.x, sp.trunkH, lean.z);
    wood.push(branch(new THREE.Vector3(0, -.1, 0), head, sp.trunkR * 1.12, sp.trunkR * .86, far ? 6 : 9));
    // the 'pineapple' of old frond bases under the crown
    const nut = head.clone().add(new THREE.Vector3(0, .9, 0));
    wood.push(branch(head, nut, sp.trunkR * .9, sp.trunkR * 1.35, far ? 6 : 9));
    const n = far ? Math.ceil(sp.fronds / 2) : sp.fronds, segs = far ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + variant, f = (i + .5) / n;                // f 0: the upright centre fronds .. 1: the hanging skirt
      const elev = 1.25 - f * 1.75 + (hash(i, variant + 4) - .5) * .2;
      const L = sp.frondL * (.82 + .3 * Math.sin(Math.PI * Math.min(1, f * 1.15))) * (.92 + hash(i, variant + 8) * .16);
      const droop = .55 + .35 * f, w = sp.frondW * (far ? 1.35 : 1);
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x);
      const g = new THREE.PlaneGeometry(w, 1, 1, segs), p = g.attributes.position, uv = g.attributes.uv, tile = i % 4;
      for (let r = 0; r <= segs; r++) {
        const t = r / segs, out = Math.cos(elev) * L * t, up = Math.sin(elev) * L * t - droop * L * t * t * (.5 + .5 * Math.cos(elev));
        for (let c = 0; c < 2; c++) {
          const j = r * 2 + c, sx = (c ? .5 : -.5) * w * (.35 + .65 * Math.sin(Math.PI * Math.min(1, .15 + t * .85)));
          p.setXYZ(j, nut.x + dir.x * (out + .3) + side.x * sx, nut.y + up - .1, nut.z + dir.z * (out + .3) + side.z * sx);
          uv.setXY(j, (tile % 2) * .5 + .007 + c * .486, Math.floor(tile / 2) * .5 + .007 + (1 - t) * .486);
        }
      }
      g.computeVertexNormals();
      leaves.push(g);
    }
  } else if (sp.form === 'conifer') {
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
        // sprays along the outer two thirds of the branch; drooping sprays hang (steeper pitch)
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

/** Tokyo tree factory: (x, z, scale, kind) => Object3D, like createNycTrees.
 *  kind: 'palm' | 'pine' | 'cedar' | 'zelkova' | 'camphor' | 'sakura' | layout kinds 'park' | 'street' | 'evergreen'
 *  ('conifer' = 'evergreen'). scale: tokyo.js passes s * PS (PS 0.8); s = 1 lands on the true height. */
export function createTokyoTrees(K, lite = false, glb = true) {
  if (!templates) {
    templates = {};
    for (const kind of Object.keys(SPECIES)) {
      const materials = [
        new THREE.MeshStandardMaterial({ name: `Tokyo ${kind} canopy`, map: leafAtlas(kind), side: THREE.DoubleSide, roughness: .95 }),
        new THREE.MeshStandardMaterial({ name: `Tokyo ${kind} bark`, map: barkTexture(kind), side: THREE.DoubleSide, roughness: 1 }),
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
    // fit: template height -> true metres at 0.2 u/m when scale = 0.8 (tokyo.js PS)
    const k = scale * trueM * UPM / (template.h * REF_SCALE);
    root.scale.set(k * (.94 + seed * .14), k * (.91 + hash(z, x) * .16), k);
    root.userData.instance = true;
    root.userData.instanceTile = !glb ? 4000 : lite ? 720 : 720; // (a long map: wide tiles)
    root.userData.instanceLodDistance = lite ? 360 : 240;
    root.name = 'Tokyo ' + species;
    return root;
  };
}

// ---- the high ground past the play box ----
// The game ground is flat. Past the box the Yamanote uplands rise a little to the west (Roppongi, Azabu, Akasaka:
// about 30 m); the bay side is reclaimed flat. HILLS: [name, x, z, rx, rz, rot, height] in game units.
const HILLS = [
  ['Yamanote uplands', -700, 0, 300, 800, 0.0, 7],
];
const FADE = 70;
/** Hill height (u) at (x, z) for a play box B ({ minX, maxX, minZ, maxZ }): 0 inside the box, rising past it. */
export function tokyoHillHeight(x, z, B) {
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

// Hill ground texture: one tile = 48u (240 m) of a hillside neighbourhood seen from far off: dense dark tree canopy
// with lighter crowns, a street grid (2 x 3 blocks) as thin grey lines, and rows of small roofs (8-14 m) in muted
// greys, whites, browns and dark slate along the block edges, half hidden under street trees. Generated once (no
// canvas: runs in the headless tests too).
let _hillTex = null;
function hillTexture() {
  if (_hillTex) return _hillTex;
  const N = 256, px = new Uint8Array(N * N * 4);
  const put = (x, y, r, g, b) => { const i = (((y % N) + N) % N * N + ((x % N) + N) % N) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  // canopy: dark green with soft lighter / darker lumps (tiling value noise)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = vnoise(x, y, 16, 3, N) * 0.6 + vnoise(x, y, 8, 7, N) * 0.4, f = 0.78 + 0.42 * n + (hash(x, y) - 0.5) * 0.12;
    put(x, y, 124 * f, 122 * f, 108 * f); // (built up to the ridge: pale roofs and yards, few trees)
  }
  const SX = [0, 128], SY = [0, 85, 170];                              // street lines (3 px ~ 3 m)
  const ROOF = [[150, 148, 142], [176, 172, 164], [196, 192, 184], [118, 104, 92], [92, 92, 96], [138, 120, 104], [164, 150, 132], [72, 74, 80]];
  let k = 0;
  for (let bx = 0; bx < 2; bx++) for (let by = 0; by < 3; by++) {
    const x0 = SX[bx] + 3, x1 = (bx ? N : SX[1]) - 1, y0 = SY[by] + 3, y1 = (by < 2 ? SY[by + 1] : N) - 1;
    // two rows of houses facing the long streets, with back yards (canopy) between them; an alley strip in the middle
    for (const [ya, yb] of [[y0 + 3, y0 + 3 + 14], [y1 - 3 - 14, y1 - 3]]) {
      for (let x = x0 + 2; x < x1 - 8;) {
        const w = 8 + Math.floor(hash(x, ya) * 7), d = 9 + Math.floor(hash(ya, x) * 5);
        if (hash(x * 0.7, ya * 1.3) > 0.12) {
          const c = ROOF[Math.floor(hash(k, x) * ROOF.length) % ROOF.length], ridge = hash(x, k) > 0.5;
          const yt = ya + Math.floor((yb - ya - d) * hash(k, ya));
          for (let yy = yt; yy < yt + d; yy++) for (let xx = x; xx < x + w; xx++) {
            const sh = ridge && (yy - yt) < d / 2 ? 0.86 : 1;              // the two pitches of a gable roof
            put(xx, yy, c[0] * sh, c[1] * sh, c[2] * sh);
          }
        }
        x += w + 2 + Math.floor(hash(k, x) * 5); k++;
      }
    }
  }
  for (const x of SX) for (let y = 0; y < N; y++) for (let w = 0; w < 3; w++) put(x + w, y, 118, 116, 110);
  for (const y of SY) for (let x = 0; x < N; x++) for (let w = 0; w < 3; w++) put(x, y + w, 118, 116, 110);
  // street trees over the kerbs and scattered crowns in the yards (round dark-green blobs)
  for (let i = 0; i < 230; i++) {
    const cx = Math.floor(hash(i, 1.7) * N), cy = Math.floor(hash(2.3, i) * N), r = 2 + Math.floor(hash(i, i) * 4);
    const g = 0.8 + hash(i, 9) * 0.45;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) {
      const l = 1 - 0.25 * (x + y) / (2 * r);                        // lit on the upper-left (sun side)
      put(cx + x, cy + y, 54 * g * l, 82 * g * l, 50 * g * l);
    }
  }
  const t = new THREE.DataTexture(px, N, N);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
  t.needsUpdate = true;
  _hillTex = t;
  return t;
}
const HILL_TILE = 48;

/** The hill masses as one unlit mesh (one draw, fogged like the surround boxes): the hillTexture neighbourhood tiled
 *  in world space, tinted per vertex - wooded (near-black evergreen) on the steep flanks and in the ravines, open
 *  neighbourhood on the gentler tops and lower slopes - with baked sun shading. water: [{ polygon }] (the surround
 *  file's water; the hills stop at the shore). Lift anything standing on the hills with tokyoHillHeight(x, z, B).
 *  opts.lite: coarser grid. */
export function createTokyoHills(B, water = [], opts = {}) {
  const cell = opts.lite ? 18 : 10;
  const sun = new THREE.Vector3(-0.55, 0.9, 0.62).normalize();
  const polys = water.map((w) => ({ p: w.polygon || w, holes: w.holes || [] })).map(({ p, holes }) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { p, holes, x0, x1, z0, z1 };
  });
  // (an island is a hole in the Bay: dry)
  const wet = (x, z) => polys.some((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && pointInPoly(x, z, w.p) && !w.holes.some((h) => pointInPoly(x, z, h)));
  const woodsAt = (x, z) => {                                          // smooth 0..1: parks and greenbelts
    const v = Math.sin(x * 0.031 + Math.sin(z * 0.023) * 2.1) * Math.cos(z * 0.029 - Math.sin(x * 0.019) * 1.7);
    return v * 0.5 + 0.5;
  };
  const C_WOOD = new THREE.Color(0xa6a67e), C_HOOD = new THREE.Color(0xffffff); // (wood: the open tops, dry grass and scrub)
  const pos = [], col = [], uv = [], idx = [];
  const cc = new THREE.Color(), n = new THREE.Vector3();
  for (const [, cx, cz, rx, rz] of HILLS) {
    const R = Math.max(rx, rz) * 1.05, nx = Math.ceil(2 * R / cell), base = pos.length / 3, H = [];
    for (let j = 0; j <= nx; j++) for (let i = 0; i <= nx; i++) {
      const x = cx - R + i * cell, z = cz - R + j * cell, h = tokyoHillHeight(x, z, B);
      H.push(h > 0.05 && wet(x, z) ? 0 : h);
    }
    for (let j = 0; j <= nx; j++) for (let i = 0; i <= nx; i++) {
      const x = cx - R + i * cell, z = cz - R + j * cell, h = H[j * (nx + 1) + i];
      const hx = H[j * (nx + 1) + Math.min(nx, i + 1)] - H[j * (nx + 1) + Math.max(0, i - 1)];
      const hz = H[Math.min(nx, j + 1) * (nx + 1) + i] - H[Math.max(0, j - 1) * (nx + 1) + i];
      n.set(-hx / (2 * cell), 1, -hz / (2 * cell)).normalize();
      const shade = 0.66 + 0.44 * Math.max(0, n.dot(sun));
      // steep flanks and the greenbelt noise go to woods (the texture's roofs darken into canopy)
      const steep = 1 - n.y, w = Math.min(1, Math.max(0, (woodsAt(x, z) - 0.62) * 4 + steep * 9));
      cc.copy(C_HOOD).lerp(C_WOOD, w).multiplyScalar(shade * (1 - 0.18 * w));
      pos.push(x, h + 0.08, z); col.push(cc.r, cc.g, cc.b); uv.push(x / HILL_TILE, z / HILL_TILE);
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
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: hillTexture(), vertexColors: true, fog: true }));
  mesh.name = 'tokyo_hills';
  mesh.frustumCulled = false;
  mesh.userData.backdrop = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return mesh;
}
