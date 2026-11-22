// Tokyo surfaces and facades (called by src/levels/tokyo.js).
// Chicago's shared terrain shader family with the ground maps Seattle introduced (assets/textures/seattle_*) and
// Tokyo's trees (tokyoLandscape.js). No per-material onBeforeCompile variants on building materials.
import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';
import { chicagoGround, tickChicagoMaterials } from './chicagoMaterials.js';
import { createTokyoTrees as createTrees } from './tokyoLandscape.js';

const textures = new Map(), loader = new THREE.TextureLoader();
function texture(file, color = false) {
  const key = file + color; if (textures.has(key)) return textures.get(key);
  const t = loader.load(assetURL('./assets/textures/' + file), undefined, undefined,
    () => reportLoadError('TokyoSurface', file, new Error('texture load failed')));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t); return t;
}
// Map set per kind (assets/textures/seattle_<name>_color.jpg / _normal.png / _roughness.png, shared with Seattle;
// sf-design), on Chicago's shared terrain program (same shader, world-space tiling).
// 'pier' = the timber pier deck, 'beach' = the pebble shore (Alki / the sculpture park beach).
const TOKYO_MAPS = { asphalt: 'asphalt', pavement: 'sidewalk', lawn: 'lawn', grass: 'lawn', plaza: 'plaza', gravel: 'park_path', rock: 'rock', pier: 'pierdeck', beach: 'beach' };
const TINT = { lawn: 0xffffff, grass: 0xe4ecd6, gravel: 0xffffff, pavement: 0xffffff, plaza: 0xffffff, rock: 0xffffff, asphalt: 0xffffff, pier: 0xffffff, beach: 0xffffff };

/** Ground surface: kind 'grass' | 'lawn' | 'pavement' | 'plaza' | 'asphalt' | 'gravel' (park paths) | 'rock' | 'pier' | 'beach'. */
export function tokyoGround(material, kind, wear = 0) {
  const k = kind === 'lawn' ? 'grass' : ['gravel', 'marble', 'plaza', 'rock', 'pier', 'beach'].includes(kind) ? 'pavement' : kind;
  chicagoGround(material, k, wear);
  const own = TOKYO_MAPS[kind];
  if (own) {
    material.map = texture(`seattle_${own}_color.jpg`, true);
    material.normalMap = texture(`seattle_${own}_normal.png`);
    material.roughnessMap = texture(`seattle_${own}_roughness.png`);
    if (material.normalScale) material.normalScale.set(0.3, 0.3);
  }
  if (TINT[kind] !== undefined) material.color.setHex(TINT[kind]);
  material.name = 'Tokyo ' + kind + (wear ? ' worn' : '');
  return material;
}

/** Generic-kit / landmark building material (file: the GLB's file name): PBR response only. */
export function tokyoFacade(material, file) {
  if (!material.isMeshStandardMaterial || material.userData.tokyoFacade) return;
  material.userData.tokyoFacade = true;
  const glass = /glass|curtain|window/i.test(material.name);
  material.roughness = glass ? 0.35 : Math.max(material.roughness, /roof/i.test(material.name) ? 0.8 : 0.7);
  material.metalness = 0;
  // (dusk: a model's own emissive map - lit windows, signboards, lanterns - glows; a flat emissive colour stays low)
  material.emissiveIntensity = material.emissiveMap ? 1.0 : Math.min(material.emissiveIntensity, 0.25);
}
/** Per frame (world time). */
export function tickTokyoMaterials(time) { tickChicagoMaterials(time); }
/** Park / street tree factory: (x, z, scale, kind) => Object3D (tokyoLandscape.js: scale 0.8 = true size). */
export function createTokyoTrees(K, lite = false, glb = true) { return createTrees(K, lite, glb); }
/** Tokyo water colours on the shared water material's uniforms: the bay and the moats at dusk, dark slate blue catching the sky. */
export function tokyoWater(WU) {
  WU.uDeep.value.setHex(0x161e34); WU.uMid.value.setHex(0x20294a);
  WU.uShallow.value.setHex(0x2e3a5c); WU.uShore.value.setHex(0x3e4868);
  WU.uRiver.value.setHex(0x141a2a); WU.uRiverEdge.value.setHex(0x1e2638);
  WU.uSky.value.setHex(0x6a70a8);
  WU.uWaveAmp.value = 0.24;
}
