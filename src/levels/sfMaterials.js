// San Francisco surfaces and facades (called by src/levels/sf.js).
// Chicago's shared terrain shader family with the West Coast ground maps Seattle introduced
// (assets/textures/seattle_*: asphalt, sidewalk, lawn, plaza, park path, rock, timber pier deck, beach)
// and San Francisco's trees (sfLandscape.js). No per-material onBeforeCompile variants on building
// materials (they split shader programs past the smoke test's budget).
import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';
import { chicagoGround, tickChicagoMaterials } from './chicagoMaterials.js';
import { createSfTrees as createTrees } from './sfLandscape.js';

const textures = new Map(), loader = new THREE.TextureLoader();
function texture(file, color = false) {
  const key = file + color; if (textures.has(key)) return textures.get(key);
  const t = loader.load(assetURL('./assets/textures/' + file), undefined, undefined,
    () => reportLoadError('SfSurface', file, new Error('texture load failed')));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t); return t;
}
// Map set per kind (assets/textures/seattle_<name>_color.jpg / _normal.png / _roughness.png, shared with Seattle;
// sf-design), on Chicago's shared terrain program (same shader, world-space tiling).
// 'pier' = the timber pier deck, 'beach' = the pebble shore (Alki / the sculpture park beach).
const SF_MAPS = { asphalt: 'asphalt', pavement: 'sidewalk', lawn: 'lawn', grass: 'lawn', plaza: 'plaza', gravel: 'park_path', rock: 'rock', pier: 'pierdeck', beach: 'beach' };
const TINT = { lawn: 0xffffff, grass: 0xe4ecd6, gravel: 0xffffff, pavement: 0xffffff, plaza: 0xffffff, rock: 0xffffff, asphalt: 0xffffff, pier: 0xffffff, beach: 0xffffff };

/** Ground surface: kind 'grass' | 'lawn' | 'pavement' | 'plaza' | 'asphalt' | 'gravel' (park paths) | 'rock' | 'pier' | 'beach'. */
export function sfGround(material, kind, wear = 0) {
  const k = kind === 'lawn' ? 'grass' : ['gravel', 'marble', 'plaza', 'rock', 'pier', 'beach'].includes(kind) ? 'pavement' : kind;
  chicagoGround(material, k, wear);
  const own = SF_MAPS[kind];
  if (own) {
    material.map = texture(`seattle_${own}_color.jpg`, true);
    material.normalMap = texture(`seattle_${own}_normal.png`);
    material.roughnessMap = texture(`seattle_${own}_roughness.png`);
    if (material.normalScale) material.normalScale.set(0.3, 0.3);
  }
  if (TINT[kind] !== undefined) material.color.setHex(TINT[kind]);
  material.name = 'SF ' + kind + (wear ? ' worn' : '');
  return material;
}

/** Generic-kit / landmark building material (file: the GLB's file name): PBR response only. */
export function sfFacade(material, file) {
  if (!material.isMeshStandardMaterial || material.userData.sfFacade) return;
  material.userData.sfFacade = true;
  const glass = /glass|curtain|window/i.test(material.name);
  material.roughness = glass ? 0.35 : Math.max(material.roughness, /roof/i.test(material.name) ? 0.8 : 0.7);
  material.metalness = 0;
  material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.25);
}
/** Per frame (world time). */
export function tickSfMaterials(time) { tickChicagoMaterials(time); }
/** Park / street tree factory: (x, z, scale, kind) => Object3D (sfLandscape.js: scale 0.8 = true size). */
export function createSfTrees(K, lite = false, glb = true) { return createTrees(K, lite, glb); }
/** San Francisco water colours on the shared water material's uniforms: the Bay: grey-green tidal water, paler and siltier toward the shore. */
export function sfWater(WU) {
  WU.uDeep.value.setHex(0x23424a); WU.uMid.value.setHex(0x30545a);
  WU.uShallow.value.setHex(0x44686c); WU.uShore.value.setHex(0x5c7a78);
  WU.uRiver.value.setHex(0x1a2c34); WU.uRiverEdge.value.setHex(0x26383e);
  WU.uSky.value.setHex(0xc4d6ea);
  WU.uWaveAmp.value = 0.24;
}
