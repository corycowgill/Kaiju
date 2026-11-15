import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoTreeSurface } from './chicagoMaterials.js';

// New York City trees (owner: nyc-design). Same build as Chicago's / DC's park
// trees (one canopy + one wood mesh per tree, alpha-tested leaf cards, near /
// far LOD twins registered with the city kit, the shared tree shader family via
// chicagoTreeSurface: no new onBeforeCompile) with four Central Park species:
//  - 'elm': American elm, the Mall's four rows: short trunk splitting into
//    limbs that arch up and out into a high vase (~23 m).
//  - 'plane': London plane, the avenue / Bryant Park tree: stout trunk with
//    mottled cream-olive-grey bark, broad rounded crown of big lobed leaves (~21 m).
//  - 'oak': pin oak, a central leader with tiers of limbs, the lower ones
//    drooping, a narrow pyramidal crown of small deep-green leaves (~18 m).
//  - 'ornamental': a flowering cherry / crabapple, low and spreading, in
//    deep-pink blossom with young leaves (~8 m).
// Layout kinds are accepted too: 'park' (Central Park woodland: a mix of oak,
// plane, elm and the odd ornamental), 'street' (Midtown street trees ~11-12 m:
// pin oak / plane templates at street size).
// Sizes: `fit` is computed from each template's real height so that a placement
// scale of 0.8 (nyc.js PS x 1.0) lands on the species' true height at the
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

// Four sprays per atlas. leaf: 'serrate' (elm), 'lobed' (plane), 'oak' (deeply
// cut, small), 'blossom' (ornamental, with a few leaves).
const LEAF = {
  elm: { shape: 'serrate', bg: [86, 108, 58], count: 130, len: [3.5, 6], green: [92, 58] },
  plane: { shape: 'lobed', bg: [74, 96, 50], count: 70, len: [6, 6], green: [84, 54] },
  oak: { shape: 'oak', bg: [52, 78, 40], count: 120, len: [4, 4], green: [70, 46] },
  ornamental: { shape: 'blossom', bg: [196, 120, 150], count: 150, len: [2.6, 2.2], green: [90, 50] },
};
function leafAtlas(kind) {
  const spec = LEAF[kind], size = 256, tileSize = size / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([...spec.bg, 0], i);
  for (let tile = 0; tile < 4; tile++) {
    const tileX = (tile % 2) * tileSize, tileY = Math.floor(tile / 2) * tileSize;
    for (let i = 0; i < spec.count; i++) {
      const angle = hash(i, tile + 2) * Math.PI * 2;
      const radius = Math.sqrt(hash(i, tile + 9)) * (44 + 8 * Math.sin(angle * 3 + tile));
      const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius * .9;
      const heading = angle + (hash(i, tile + 17) - .5) * 2.5;
      const c = Math.cos(heading), s = Math.sin(heading);
      const flower = spec.shape === 'blossom' && hash(i, tile + 71) > .18;
      const length = spec.len[0] + hash(i, tile + 26) * spec.len[1];
      const width = flower ? length : spec.shape === 'oak' ? length * .55 : spec.shape === 'lobed' ? length * .95 : length * (.36 + hash(i, tile + 37) * .18);
      let r, g, b;
      if (flower) {
        const w = hash(i, tile + 42);
        r = 214 + w * 30; g = 108 + w * 60; b = 150 + w * 50;     // deep pink to pale pink
      } else {
        g = spec.green[0] + hash(i, tile + 42) * spec.green[1];
        r = g * (.6 + hash(i, tile + 48) * .2); b = g * (.34 + hash(i, tile + 53) * .14);
        if (kind === 'ornamental') { r *= 1.12; g *= 1.05; }      // young bronze-green leaves
      }
      for (let py = Math.max(3, Math.floor(y - length)); py <= Math.min(124, y + length); py++) {
        for (let px = Math.max(3, Math.floor(x - length)); px <= Math.min(124, x + length); px++) {
          const dx = px - x, dy = py - y;
          const u = (dx * c + dy * s) / length, v = (dy * c - dx * s) / width;
          let edge;
          if (flower) {
            const rr = Math.hypot(dx, dy) / length, th = Math.atan2(dy, dx) + heading;
            edge = 1 - rr / (.72 + .28 * Math.abs(Math.cos(th * 2.5)));
          } else if (spec.shape === 'lobed') { // palmate: five pointed lobes
            const rr = Math.hypot(u, v), th = Math.atan2(v, u);
            edge = 1 - rr / (.62 + .38 * Math.pow(Math.abs(Math.cos(th * 2.5)), 1.6));
          } else if (spec.shape === 'oak') { // deep sinuses along the blade
            edge = 1 - Math.pow(Math.abs(u), 1.6) - v * v / (.25 + .75 * Math.pow(Math.abs(Math.sin(u * 7.5)), 2));
          } else {
            edge = 1 - Math.pow(Math.abs(u), 1.4) - v * v;
          }
          if (edge <= 0) continue;
          const centre = flower && edge > .78 ? .8 : 1;
          const vein = !flower && Math.abs(v) < .06 ? .9 : 1;
          const shade = centre * vein * (.86 + .16 * hash(px, py));
          const index = ((tileY + py) * size + tileX + px) * 4;
          pixels.set([r * shade, g * shade, b * shade, Math.min(255, 120 + edge * 490)], index);
        }
      }
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
    if (kind === 'plane') { // exfoliating jigsaw patches: cream, olive, grey-brown (tiling value noise)
      const p = vnoise(x, y, 16, 3) * .65 + vnoise(x, y, 8, 5) * .35, q = vnoise(x, y, 11, 9);
      const n = hash(x, y) * 8;
      rgb = p > .62 ? [196, 188, 152] : p < .36 ? [118, 112, 96] : q > .5 ? [146, 144, 112] : [162, 154, 126];
      rgb = rgb.map((v) => v + n - 4);
    } else if (kind === 'oak') { // smooth grey with shallow vertical ridges
      const ridge = Math.abs(Math.sin(x * .3 + Math.sin(y * .05) * 1.5)) ** .5;
      const v = 92 + ridge * 22 + hash(x, y) * 10;
      rgb = [v, v * .97, v * .9];
    } else if (kind === 'ornamental') { // cherry: dark red-brown with horizontal lenticels
      const band = Math.abs(Math.sin(y * .55 + Math.sin(x * .2))) < .12 ? -16 : 0;
      const v = 70 + hash(x, y) * 10 + band;
      rgb = [v * 1.08, v * .93, v * .78];
    } else { // elm: deep interlacing furrows, grey-brown
      const bend = 2.2 * Math.sin(y * .07 + x * .05) + 1.1 * Math.sin(y * .19);
      const ridge = Math.abs(Math.sin((x + bend) * .45)) ** .3;
      const cross = Math.abs(Math.sin((x - bend * 1.3) * .31 + y * .06)) < .12 ? -14 : 0;
      const v = 66 + ridge * 40 + hash(x, y) * 10 + cross;
      rgb = [v, v * .93, v * .82];
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
    const shade = canopy ? .7 + THREE.MathUtils.smoothstep(y, h * .35, h * .9) * .36 : .9 + Math.min(y, 7) * .014;
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

// Species shapes (template units; true size comes from trueM). 'fork' species
// split at the trunk top into arching limbs (elm, plane, ornamental); 'leader'
// species (oak) carry a central stem with tiers of limbs.
const SPECIES = {
  elm: { form: 'fork', trunkH: 3.6, trunkR: .5, limbs: 5, tipH: [9.6, 12.4], spread: [3.8, 4.9], arch: .55, cards: 22, card: 1.35, h: 12.6, trueM: 23, leaf: [0xcfdcb8, 0xdde8bc], wood: [0xd0cdc1, 0xc8bba6] },
  plane: { form: 'fork', trunkH: 3.0, trunkR: .62, limbs: 6, tipH: [7.4, 10.6], spread: [4.4, 5.6], arch: .15, cards: 22, card: 2.0, h: 11.6, trueM: 21, crownFill: 18, leaf: [0xc4d2a8, 0xccd8ae], wood: [0xe0dccc, 0xd8d2be] },
  oak: { form: 'leader', trunkH: 11.5, trunkR: .45, limbs: 14, spread: [1.4, 4.2], cards: 16, card: 1.5, h: 12.2, trueM: 18, leaf: [0xb8c8a0, 0xc2d0a6], wood: [0xd4d2cc, 0xccc8c0] },
  ornamental: { form: 'fork', trunkH: 1.4, trunkR: .3, limbs: 6, tipH: [3.6, 5.2], spread: [3.0, 4.0], arch: .15, cards: 9, card: 1.5, h: 5.6, trueM: 8, leaf: [0xf4e8ec, 0xf0e0e6], wood: [0xd0c6b8, 0xc8bcac] },
};
// layout kinds -> [species, true height (m)] picked by the tree's position hash
const KINDS = {
  elm: [[1, 'elm', 23]],
  plane: [[1, 'plane', 21]],
  oak: [[1, 'oak', 18]],
  ornamental: [[1, 'ornamental', 8]],
  park: [[.42, 'oak', 18], [.78, 'plane', 20], [.92, 'elm', 21], [1, 'ornamental', 8]],
  street: [[.5, 'oak', 11], [1, 'plane', 12]],
};

function makeTemplate(kind, variant, far) {
  const sp = SPECIES[kind];
  const leaves = [], wood = [];
  const leafColor = new THREE.Color(sp.leaf[variant]);
  const woodColor = new THREE.Color(sp.wood[variant]);
  const addCards = (from, to, i, n, cardK = 1, droop = 0) => {
    for (let j = 0; j < n; j++) {
      const t = .55 + .45 * hash(i * 13 + j, variant + 9);
      const base = from.clone().lerp(to, t);
      const heading = i * 1.7 + j * 2.39996;
      const off = (.3 + hash(i * 11 + j, variant + 20)) * sp.card * .8;
      const center = base.add(new THREE.Vector3(Math.cos(heading) * off, (hash(i + j * 7, variant + 3) - .3 - droop) * sp.card, Math.sin(heading) * off));
      const size = sp.card * cardK * (far ? 1.45 : 1) * (.8 + hash(i, j + variant + 50) * .45);
      const pitch = (hash(i * 5 + j, 5 + variant) - .5) * (kind === 'ornamental' ? 2.2 : 1.6);
      leaves.push(leafCard(center, size * 1.2, size, heading, pitch, (i + j) % 4));
    }
  };
  if (sp.form === 'leader') {
    // pin oak: stem to the top, tiers of limbs; low limbs droop, high ones climb, spread shrinks upward
    const top = new THREE.Vector3(variant ? .1 : -.08, sp.trunkH, variant ? -.05 : .06);
    wood.push(branch(new THREE.Vector3(0, -.1, 0), top, sp.trunkR, .06, far ? 5 : 8));
    for (let i = 0; i < sp.limbs; i++) {
      const f = i / (sp.limbs - 1);                                    // 0 low .. 1 high
      const y0 = sp.trunkH * (.28 + .62 * f);
      const angle = i * 2.39996 + variant * .9;
      const spread = sp.spread[1] - (sp.spread[1] - sp.spread[0]) * f * f + (hash(i, variant) - .5) * .5;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const start = new THREE.Vector3(top.x * y0 / sp.trunkH, y0, top.z * y0 / sp.trunkH);
      const tip = start.clone().add(dir.clone().multiplyScalar(spread)).add(new THREE.Vector3(0, (f - .45) * 2.6, 0));
      const r = sp.trunkR * (.38 - .2 * f);
      wood.push(branch(start, tip, r, .04, far ? 4 : 5));
      addCards(start, tip, i, far ? Math.ceil(sp.cards / 2.5) : sp.cards, 1, f < .35 ? .35 : 0);
    }
    addCards(top.clone().multiplyScalar(.85), top, 99, far ? 2 : 5, .9);   // the spire
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
    if (sp.crownFill) { // plane: fill the dome's crown so it reads round, not as a ring of limb tufts
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

/** NYC tree factory: (x, z, scale, kind) => Object3D, like createDcTrees.
 *  kind: 'elm' | 'plane' | 'oak' | 'ornamental' | layout kinds 'park' | 'street'.
 *  scale: nyc.js passes s * PS (PS 0.8); s = 1 lands on the true height. */
export function createNycTrees(K, lite = false, glb = true) {
  if (!templates) {
    templates = {};
    for (const kind of Object.keys(SPECIES)) {
      const materials = [
        new THREE.MeshStandardMaterial({ name: `NYC ${kind} canopy`, map: leafAtlas(kind), side: THREE.DoubleSide, roughness: .95 }),
        new THREE.MeshStandardMaterial({ name: `NYC ${kind} bark`, map: barkTexture(kind), side: THREE.DoubleSide, roughness: 1 }),
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
  return (x = 0, z = 0, scale = 1, kind = 'elm') => {
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
    // fit: template height -> true metres at 0.2 u/m when scale = 0.8 (nyc.js PS)
    const k = scale * trueM * UPM / (template.h * REF_SCALE);
    root.scale.set(k * (.94 + seed * .14), k * (.91 + hash(z, x) * .16), k);
    root.userData.instance = true;
    root.userData.instanceTile = !glb ? 4000 : lite ? 480 : 240;
    root.userData.instanceLodDistance = lite ? 360 : 240;
    root.name = 'NYC ' + species;
    return root;
  };
}
