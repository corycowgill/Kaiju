import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoTreeSurface } from './chicagoMaterials.js';

// Washington DC trees (owner: dc-design). Same build as Chicago's park trees
// (one canopy + one wood mesh per tree, alpha-tested leaf cards, near / far
// LOD twins registered with the city kit, the shared tree shader family) with
// two DC species:
//  - 'elm': American elm, the Mall's double rows: a short trunk splitting into
//    four or five limbs that arch up and out into a high vase-shaped crown.
//  - 'cherry': Yoshino cherry round the Tidal Basin, low and spreading, in
//    pale pink blossom (early April, the same morning as the fresh elms).
// Template units match Chicago's park tree (about 9 units tall before the
// placement scale): the elm is ~1.35x that, the cherry ~0.6x.
let templates;
const hash = (x, z) => {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function dataTexture(pixels, size) {
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Four sprays per atlas. elm: small serrated leaves, fresh spring green;
// cherry: five-petal blossom clusters, white-pink with a few young leaves.
function leafAtlas(kind) {
  const size = 256, tileSize = size / 2;
  const pixels = new Uint8Array(size * size * 4);
  const bg = kind === 'cherry' ? [214, 170, 178, 0] : [86, 108, 58, 0];
  for (let i = 0; i < pixels.length; i += 4) pixels.set(bg, i);
  const count = kind === 'cherry' ? 150 : 130;
  for (let tile = 0; tile < 4; tile++) {
    const tileX = (tile % 2) * tileSize, tileY = Math.floor(tile / 2) * tileSize;
    for (let i = 0; i < count; i++) {
      const angle = hash(i, tile + 2) * Math.PI * 2;
      const radius = Math.sqrt(hash(i, tile + 9)) * (44 + 8 * Math.sin(angle * 3 + tile));
      const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius * .9;
      const heading = angle + (hash(i, tile + 17) - .5) * 2.5;
      const c = Math.cos(heading), s = Math.sin(heading);
      const leaf = kind !== 'cherry' || hash(i, tile + 71) < .14;
      const length = leaf ? 3.5 + hash(i, tile + 26) * 6 : 2.6 + hash(i, tile + 26) * 2.2;
      const width = leaf ? length * (.36 + hash(i, tile + 37) * .18) : length;
      let r, g, b;
      if (leaf) {
        g = 92 + hash(i, tile + 42) * 58;
        r = g * (.62 + hash(i, tile + 48) * .2); b = g * (.36 + hash(i, tile + 53) * .14);
      } else {
        const w = hash(i, tile + 42);
        r = 214 + w * 22; g = 168 + w * 46; b = 178 + w * 38;
      }
      for (let py = Math.max(3, Math.floor(y - length)); py <= Math.min(124, y + length); py++) {
        for (let px = Math.max(3, Math.floor(x - length)); px <= Math.min(124, x + length); px++) {
          const dx = px - x, dy = py - y;
          let edge;
          if (leaf) {
            const u = (dx * c + dy * s) / length, v = (dy * c - dx * s) / width;
            edge = 1 - Math.pow(Math.abs(u), 1.4) - v * v;
          } else { // blossom: five lobes round a darker centre
            const rr = Math.hypot(dx, dy) / length, th = Math.atan2(dy, dx) + heading;
            edge = 1 - rr / (.72 + .28 * Math.abs(Math.cos(th * 2.5)));
          }
          if (edge <= 0) continue;
          const centre = !leaf && edge > .78 ? .8 : 1;
          const shade = centre * (.88 + .14 * hash(px, py));
          const index = ((tileY + py) * size + tileX + px) * 4;
          pixels.set([r * shade, g * shade, b * shade, Math.min(255, 120 + edge * 490)], index);
        }
      }
    }
  }
  return dataTexture(pixels, size);
}

function barkTexture(kind) {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value, tintR = 1, tintB = .82;
    if (kind === 'cherry') { // smooth dark red-brown bark with horizontal lenticels
      const band = Math.abs(Math.sin(y * .55 + Math.sin(x * .2))) < .12 ? -16 : 0;
      value = 70 + hash(x, y) * 10 + band; tintR = 1.08; tintB = .78;
    } else { // elm: deep interlacing furrows, grey-brown
      const bend = 2.2 * Math.sin(y * .07 + x * .05) + 1.1 * Math.sin(y * .19);
      const ridge = Math.abs(Math.sin((x + bend) * .45)) ** .3;
      const cross = Math.abs(Math.sin((x - bend * 1.3) * .31 + y * .06)) < .12 ? -14 : 0;
      value = 66 + ridge * 40 + hash(x, y) * 10 + cross;
    }
    pixels.set([value * tintR, value * .93, value * tintB, 255], (y * size + x) * 4);
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

// Species shapes: limbs fork from the trunk top (fork height), arch out to
// their tips; leaf cards cluster round each tip and along the limb's outer half.
const SPECIES = {
  elm: { trunkH: 3.6, trunkR: .5, limbs: 5, tipH: [9.6, 12.4], spread: [3.8, 4.9], arch: .55, cards: 22, card: 1.35, h: 12.6, fit: .42 },
  cherry: { trunkH: 1.3, trunkR: .32, limbs: 6, tipH: [3.4, 5.0], spread: [2.8, 3.9], arch: .15, cards: 8, card: 1.5, h: 5.4, fit: .6 },
};

function makeTemplate(kind, variant, far) {
  const sp = SPECIES[kind];
  const leaves = [], wood = [];
  const leafColor = new THREE.Color(kind === 'cherry' ? 0xf2e6ea : (variant ? 0xdde8bc : 0xcfdcb8));
  const woodColor = new THREE.Color(variant ? 0xc8bba6 : 0xd0cdc1);
  const top = new THREE.Vector3(variant ? .12 : -.1, sp.trunkH, variant ? -.06 : .08);
  wood.push(branch(new THREE.Vector3(0, -.1, 0), top, sp.trunkR, sp.trunkR * .72, far ? 5 : 8));
  for (let i = 0; i < sp.limbs; i++) {
    const angle = i * (Math.PI * 2 / sp.limbs) + variant * .7 + (hash(i, variant + 3) - .5) * .6;
    const tipH = sp.tipH[0] + hash(i, 7 + variant) * (sp.tipH[1] - sp.tipH[0]);
    const spread = sp.spread[0] + hash(i, variant + 1) * (sp.spread[1] - sp.spread[0]);
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    // the limb rises steeply first (elm vase), then leans out to the tip
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
    const cards = far ? Math.ceil(sp.cards / 2.5) : sp.cards;
    for (let j = 0; j < cards; j++) {
      const t = .55 + .45 * hash(i * 13 + j, variant + 9);       // along the limb's outer part
      const base = mid.clone().lerp(tip, t);
      const heading = angle + j * 2.39996;
      const off = (.3 + hash(i * 11 + j, variant + 20)) * sp.card * .8;
      const center = base.add(new THREE.Vector3(Math.cos(heading) * off, (hash(i + j * 7, variant + 3) - .3) * sp.card,
        Math.sin(heading) * off));
      const size = sp.card * (far ? 1.45 : 1) * (.8 + hash(i, j + variant + 50) * .45);
      const pitch = (hash(i * 5 + j, 5 + variant) - .5) * (kind === 'elm' ? 1.6 : 2.2);
      leaves.push(leafCard(center, size * 1.2, size, heading, pitch, (i + j) % 4));
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

/** DC tree factory: (x, z, scale, kind = 'elm' | 'cherry') => Object3D, like createChicagoTrees. */
export function createDcTrees(K, lite = false, glb = true) {
  if (!templates) {
    templates = {};
    for (const kind of ['elm', 'cherry']) {
      const materials = [
        new THREE.MeshStandardMaterial({ name: `DC ${kind} canopy`, map: leafAtlas(kind), side: THREE.DoubleSide, roughness: .95 }),
        new THREE.MeshStandardMaterial({ name: `DC ${kind} bark`, map: barkTexture(kind), side: THREE.DoubleSide, roughness: 1 }),
      ];
      for (const material of materials) { material.userData.shared = true; chicagoTreeSurface(material); }
      templates[kind] = [0, 1].map((variant) => ({
        near: makeTemplate(kind, variant, false), far: makeTemplate(kind, variant, true), materials,
      }));
    }
  }
  for (const kind in templates) for (const template of templates[kind]) for (let i = 0; i < 2; i++) {
    K.registerLod1(template.near[i], template.far[i]);
  }
  return (x = 0, z = 0, scale = 1, kind = 'elm') => {
    const set = templates[kind] || templates.elm;
    const seed = hash(x, z), template = set[seed > .5 ? 1 : 0], root = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh((glb ? template.near : template.far)[i], template.materials[i]);
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    root.position.set(x, 0, z);
    root.rotation.y = seed * Math.PI * 2;
    // fit: template units -> true size at the level's 0.2 u/m (Mall elms ~22 m tall with an ~20 m crown,
    // Yoshino cherries ~8 m): the placement scale (about 0.8-0.95 for elms) lands on real dimensions
    const k = scale * (SPECIES[kind] || SPECIES.elm).fit;
    root.scale.set(k * (.94 + seed * .14), k * (.91 + hash(z, x) * .16), k);
    root.userData.instance = true;
    root.userData.instanceTile = !glb ? 4000 : lite ? 480 : 240;
    root.userData.instanceLodDistance = lite ? 360 : 240;
    root.name = kind === 'cherry' ? 'DC Yoshino cherry' : 'DC American elm';
    return root;
  };
}
