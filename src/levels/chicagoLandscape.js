import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoTreeSurface } from './chicagoMaterials.js';

// Two shared canopy and trunk meshes per tile, with fewer cards and branches at distance.
let templates;
const hash = (x, z) => {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function treeTexture(pixels, size) {
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Four sprays of overlapping leaf blades, shared by every tree and LOD.
// Alpha testing gives the foliage gaps without transparent draw sorting.
function leafAtlas() {
  const size = 256, tileSize = size / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([82, 102, 56, 0], i);
  for (let tile = 0; tile < 4; tile++) {
    const tileX = (tile % 2) * tileSize, tileY = Math.floor(tile / 2) * tileSize;
    for (let i = 0; i < 115; i++) {
      const angle = hash(i, tile + 2) * Math.PI * 2;
      const radius = Math.sqrt(hash(i, tile + 9)) * (42 + 9 * Math.sin(angle * 3 + tile));
      const x = 64 + Math.cos(angle) * radius;
      const y = 64 + Math.sin(angle) * radius * .91;
      const heading = angle + (hash(i, tile + 17) - .5) * 2.5;
      const c = Math.cos(heading), s = Math.sin(heading);
      const length = 4 + hash(i, tile + 26) * 8;
      const width = length * (.27 + hash(i, tile + 37) * .21);
      const green = 69 + hash(i, tile + 42) * 61;
      const red = green * (.61 + hash(i, tile + 48) * .27);
      const blue = green * (.39 + hash(i, tile + 53) * .18);
      for (let py = Math.max(3, Math.floor(y - length)); py <= Math.min(124, y + length); py++) {
        for (let px = Math.max(3, Math.floor(x - length)); px <= Math.min(124, x + length); px++) {
          const u = ((px - x) * c + (py - y) * s) / length;
          const v = ((py - y) * c - (px - x) * s) / width;
          const edge = 1 - Math.pow(Math.abs(u), 1.35) - v * v;
          if (edge <= 0) continue;
          const vein = Math.abs(v) < .16 ? 1.12 : 1;
          const shade = vein * (.89 + .13 * u + .12 * hash(px, py));
          const index = ((tileY + py) * size + tileX + px) * 4;
          pixels.set([red * shade, green * shade, blue * shade, Math.min(255, 120 + edge * 490)], index);
        }
      }
    }
  }
  return treeTexture(pixels, size);
}

function barkTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bend = 1.5 * Math.sin(y * .09 + x * .07) + .8 * Math.sin(y * .23);
    const grain = Math.abs(Math.sin((x + bend) * .51)) ** .35;
    const cracks = Math.abs(Math.sin((x + bend * .7) * .24)) < .15 ? 18 : 0;
    const value = 63 + grain * 37 + hash(x, y) * 12 - cracks;
    pixels.set([value, value * .93, value * .81, 255], (y * size + x) * 4);
  }
  const texture = treeTexture(pixels, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function tint(geometry, color, canopy = false) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const shade = canopy ? .69 + THREE.MathUtils.smoothstep(y, 3, 8) * .37 : .9 + Math.min(y, 7) * .014;
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
    uv.setXY(i, (tile % 2) * .5 + .007 + uv.getX(i) * .486,
      Math.floor(tile / 2) * .5 + .007 + uv.getY(i) * .486);
  }
  return geometry;
}

function makeTemplate(variant, far) {
  const leaves = [], wood = [];
  const leafColor = new THREE.Color(variant ? 0xdce6bc : 0xcbd8bb);
  const woodColor = new THREE.Color(variant ? 0xc8bba6 : 0xd0cdc1);
  const trunk = [[0, -.08, 0], [.035, .5, .02], [-.14, 2.7, .04], [.19, 4.7, -.13], [.38, 6.8, -.08]]
    .map(([x, y, z]) => new THREE.Vector3(x * (variant ? 1 : -1), y, z));
  const radii = [.42, .25, .18, .115, .035];
  const sides = far ? 5 : 8;
  const positions = [], uvs = [], indices = [];
  for (let ring = 0; ring < trunk.length; ring++) {
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2;
      const radius = radii[ring] * (1 + .13 * Math.cos(angle * 3 + variant));
      positions.push(trunk[ring].x + Math.sin(angle) * radius, trunk[ring].y,
        trunk[ring].z + Math.cos(angle) * radius);
      uvs.push(i / sides, trunk[ring].y * .7);
      if (ring && i < sides) {
        const a = (ring - 1) * (sides + 1) + i, b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const trunkGeometry = new THREE.BufferGeometry();
  trunkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  trunkGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  trunkGeometry.setIndex(indices);
  trunkGeometry.computeVertexNormals();
  wood.push(trunkGeometry);

  const groups = 9;
  for (let i = 0; i < groups; i++) {
    const angle = i * 2.39996 + variant * 1.1;
    const height = 3.7 + i * .39 + hash(i, 7 + variant) * .83;
    const spread = (1.35 + hash(i, variant) * 1.4) * (1 - i * .055) * (variant ? 1.13 : .94);
    const tip = new THREE.Vector3(Math.cos(angle) * spread, height, Math.sin(angle) * spread);
    const start = trunk[i > 5 ? 3 : 2];
    const fork = start.clone().lerp(tip, .48);
    fork.y -= .2 + hash(i, 31) * .3;
    if (far) wood.push(branch(start, tip, .1, .02, 4));
    else {
      wood.push(branch(start, fork, .115 - i * .005, .059, 6));
      wood.push(branch(fork, tip, .059, .014, 5));
      const twig = tip.clone().add(new THREE.Vector3(Math.cos(angle + 1.1) * .62, .45, Math.sin(angle + 1.1) * .62));
      wood.push(branch(fork, twig, .043, .009, 4));
    }

    const cards = far ? 3 : 7;
    for (let j = 0; j < cards; j++) {
      const heading = angle + j * 2.39996;
      const offset = .28 + hash(i * 11 + j, variant + 20) * .81;
      const center = tip.clone().add(new THREE.Vector3(
        Math.cos(heading) * offset,
        (hash(i + j * 7, variant + 3) - .36) * 1.5,
        Math.sin(heading) * offset
      ));
      const size = (far ? 2.25 : 1.55) + hash(i, j + variant + 50) * .75;
      const pitch = (hash(i * 5 + j, 5 + variant) - .5) * 2.15;
      leaves.push(leafCard(center, size * 1.18, size, heading, pitch, (i + j) % 4));
    }
  }

  const merge = (parts, color, canopy) => {
    const geometry = tint(mergeGeometries(parts), color, canopy);
    for (const part of parts) part.dispose();
    geometry.userData.shared = true;
    return geometry;
  };
  const canopy = merge(leaves, leafColor, true);
  canopy.userData.soldierOccluder = true;
  return [canopy, merge(wood, woodColor, false)];
}

export function createChicagoTrees(K, lite = false, glb = true) {
  if (!templates) {
    const materials = [
      new THREE.MeshStandardMaterial({
        name: 'Chicago summer canopy', map: leafAtlas(),
        side: THREE.DoubleSide, roughness: .96,
      }),
      new THREE.MeshStandardMaterial({
        name: 'Chicago branching bark', map: barkTexture(), side: THREE.DoubleSide, roughness: 1,
      }),
    ];
    for (const material of materials) {
      material.userData.shared = true;
      chicagoTreeSurface(material);
    }
    templates = [0, 1].map(variant => ({
      near: makeTemplate(variant, false), far: makeTemplate(variant, true), materials,
    }));
  }
  for (const template of templates) for (let i = 0; i < 2; i++) {
    K.registerLod1(template.near[i], template.far[i]);
  }
  return (x = 0, z = 0, scale = 1) => {
    const seed = hash(x, z), template = templates[seed > .5 ? 1 : 0], root = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh((glb ? template.near : template.far)[i], template.materials[i]);
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    root.position.set(x, 0, z);
    root.rotation.y = seed * Math.PI * 2;
    root.scale.set(scale * (.94 + seed * .14), scale * (.91 + hash(z, x) * .16), scale);
    root.userData.instance = true;
    root.userData.instanceTile = !glb ? 4000 : lite ? 480 : 240;
    root.userData.instanceLodDistance = lite ? 360 : 240;
    root.name = 'Chicago mature park tree';
    return root;
  };
}

// Deterministic edge groves leave the centre of each lawn and all festival,
// road, landmark and path exclusions open. Generation runs only at city build.
export function planParkGroves(parks,allowed,lite=false) {
  const points=[],occupied=new Set(),cap=lite?64:150;
  for(const park of parks) {
    if(!/grant park|museum campus/i.test(park.name||'') || park.kind==='plaza' || park.kind==='beach')continue;
    const poly=park.polygon;if(poly.length<3)continue;
    const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
    for(let x=x0+3;x<x1-2;x+=5.6)for(let z=z0+3;z<z1-2;z+=5.6) {
      if(points.length>=cap)return points;
      if(Math.min(x-x0,x1-x,z-z0,z1-z)>6.5)continue;
      if(hash(Math.floor(x/12),Math.floor(z/12))<.28)continue;
      const px=x+(hash(x,z)-.5)*1.5,pz=z+(hash(z,x)-.5)*1.5;
      const key=Math.round(px/4)+':'+Math.round(pz/4);
      if(occupied.has(key)||!allowed(px,pz,park))continue;
      occupied.add(key);points.push({x:px,z:pz,scale:.82+hash(px,pz)*.23});
    }
  }
  return points;
}

// Directional crowd density with two clear access aisles. Works for rotated
// stages using their local front (+Z), without extra attendees or draws.
export function festivalCrowdWeight(x,z,stage,far) {
  const dx=x-stage.x,dz=z-stage.z,c=Math.cos(stage.rot||0),s=Math.sin(stage.rot||0);
  const across=dx*c-dz*s,front=dx*s+dz*c;
  const depth=Math.max(8,far),t=THREE.MathUtils.clamp(front/depth,0,1);
  const aisle=Math.max(1.0,Math.min(1.55,(stage.w||10)*.07));
  if(front<0 || (front>3 && Math.abs(across)<aisle*.5))return 0;
  const sideLane=(stage.w||10)*.62;
  if(front>6 && Math.abs(Math.abs(across)-sideLane)<aisle*.4)return .03;
  return .10+.9*Math.pow(1-t,3.2);
}
