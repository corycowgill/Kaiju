// New York City surfaces and facades (owner: nyc-design; called by src/levels/nyc.js).
// Seeded by nyc-integrator: Chicago's shared terrain shader family and DC's
// tree factory until nyc-design's own maps land. No per-material
// onBeforeCompile variants on building materials (they split shader
// programs past the smoke test's budget).
import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';
import { chicagoGround, tickChicagoMaterials } from './chicagoMaterials.js';
import { createNycTrees as createTrees } from './nycLandscape.js';

const textures = new Map(), loader = new THREE.TextureLoader();
function texture(file, color = false) {
  const key = file + color; if (textures.has(key)) return textures.get(key);
  const t = loader.load(assetURL('./assets/textures/' + file), undefined, undefined,
    () => reportLoadError('NycSurface', file, new Error('texture load failed')));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t); return t;
}
// NYC map set per kind (assets/textures/nyc_<name>_color.jpg / _normal.png / _roughness.png, nyc-design),
// on Chicago's shared terrain program (same shader, world-space tiling)
const NYC_MAPS = { asphalt: 'asphalt', pavement: 'sidewalk', lawn: 'lawn', grass: 'lawn', plaza: 'plaza', gravel: 'park_path', rock: 'rock' };
const TINT = { lawn: 0xffffff, grass: 0xe4ecd6, gravel: 0xffffff, pavement: 0xffffff, plaza: 0xffffff, rock: 0xffffff, asphalt: 0xffffff };

/** Ground surface: kind 'grass' | 'lawn' | 'pavement' | 'plaza' | 'asphalt' | 'gravel' (park paths) | 'rock'. */
export function nycGround(material, kind, wear = 0) {
  const k = kind === 'lawn' ? 'grass' : kind === 'gravel' || kind === 'marble' || kind === 'plaza' || kind === 'rock' ? 'pavement' : kind;
  chicagoGround(material, k, wear);
  const own = NYC_MAPS[kind];
  if (own) {
    material.map = texture(`nyc_${own}_color.jpg`, true);
    material.normalMap = texture(`nyc_${own}_normal.png`);
    material.roughnessMap = texture(`nyc_${own}_roughness.png`);
    if (material.normalScale) material.normalScale.set(0.3, 0.3);
  }
  if (TINT[kind] !== undefined) material.color.setHex(TINT[kind]);
  material.name = 'NYC ' + kind + (wear ? ' worn' : '');
  return material;
}

/** Generic-kit / landmark building material (file: the GLB's file name): PBR response only. */
export function nycFacade(material, file) {
  if (!material.isMeshStandardMaterial || material.userData.nycFacade) return;
  material.userData.nycFacade = true;
  const glass = /glass|curtain|window/i.test(material.name);
  material.roughness = glass ? 0.35 : Math.max(material.roughness, /roof/i.test(material.name) ? 0.8 : 0.7);
  material.metalness = 0;
  material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.25);
}
/** Per frame (world time). */
export function tickNycMaterials(time) { tickChicagoMaterials(time); }
/** Park / street tree factory: (x, z, scale, kind) => Object3D (nycLandscape.js: scale 0.8 = true size). */
export function createNycTrees(K, lite = false, glb = true) { return createTrees(K, lite, glb); }
/** NYC water colours on the shared water material's uniforms: the Hudson and the East River, grey-green tidal water. */
export function nycWater(WU) {
  WU.uDeep.value.setHex(0x26403f); WU.uMid.value.setHex(0x34504c);
  WU.uShallow.value.setHex(0x46605a); WU.uShore.value.setHex(0x5c7268);
  WU.uRiver.value.setHex(0x1f2a2a); WU.uRiverEdge.value.setHex(0x2b3836);
  WU.uSky.value.setHex(0xc4d6ea);
  WU.uWaveAmp.value = 0.2;
}
