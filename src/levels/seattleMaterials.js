// Seattle surfaces and facades (owner: seattle-design; called by src/levels/seattle.js).
// Seeded by seattle-integrator: Chicago's shared terrain shader family and a
// copy of NYC's tree factory until seattle-design's own maps land. No
// per-material onBeforeCompile variants on building materials (they split
// shader programs past the smoke test's budget).
import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';
import { chicagoGround, tickChicagoMaterials } from './chicagoMaterials.js';
import { createSeattleTrees as createTrees } from './seattleLandscape.js';

const textures = new Map(), loader = new THREE.TextureLoader();
function texture(file, color = false) {
  const key = file + color; if (textures.has(key)) return textures.get(key);
  const t = loader.load(assetURL('./assets/textures/' + file), undefined, undefined,
    () => reportLoadError('SeattleSurface', file, new Error('texture load failed')));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t); return t;
}
// Seattle map set per kind (assets/textures/seattle_<name>_color.jpg / _normal.png / _roughness.png,
// seattle-design), on Chicago's shared terrain program (same shader, world-space tiling).
// Empty until the files exist: Chicago's ground maps stand in.
const SEATTLE_MAPS = {};
const TINT = { lawn: 0xffffff, grass: 0xe4ecd6, gravel: 0xffffff, pavement: 0xffffff, plaza: 0xffffff, rock: 0xffffff, asphalt: 0xffffff };

/** Ground surface: kind 'grass' | 'lawn' | 'pavement' | 'plaza' | 'asphalt' | 'gravel' (park paths) | 'rock'. */
export function seattleGround(material, kind, wear = 0) {
  const k = kind === 'lawn' ? 'grass' : kind === 'gravel' || kind === 'marble' || kind === 'plaza' || kind === 'rock' ? 'pavement' : kind;
  chicagoGround(material, k, wear);
  const own = SEATTLE_MAPS[kind];
  if (own) {
    material.map = texture(`seattle_${own}_color.jpg`, true);
    material.normalMap = texture(`seattle_${own}_normal.png`);
    material.roughnessMap = texture(`seattle_${own}_roughness.png`);
    if (material.normalScale) material.normalScale.set(0.3, 0.3);
  }
  if (TINT[kind] !== undefined) material.color.setHex(TINT[kind]);
  material.name = 'Seattle ' + kind + (wear ? ' worn' : '');
  return material;
}

/** Generic-kit / landmark building material (file: the GLB's file name): PBR response only. */
export function seattleFacade(material, file) {
  if (!material.isMeshStandardMaterial || material.userData.seattleFacade) return;
  material.userData.seattleFacade = true;
  const glass = /glass|curtain|window/i.test(material.name);
  material.roughness = glass ? 0.35 : Math.max(material.roughness, /roof/i.test(material.name) ? 0.8 : 0.7);
  material.metalness = 0;
  material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.25);
}
/** Per frame (world time). */
export function tickSeattleMaterials(time) { tickChicagoMaterials(time); }
/** Park / street tree factory: (x, z, scale, kind) => Object3D (seattleLandscape.js: scale 0.8 = true size). */
export function createSeattleTrees(K, lite = false, glb = true) { return createTrees(K, lite, glb); }
/** Seattle water colours on the shared water material's uniforms: Elliott Bay and Lake Union, cool blue-green Sound water. */
export function seattleWater(WU) {
  WU.uDeep.value.setHex(0x1c3a4a); WU.uMid.value.setHex(0x284c5c);
  WU.uShallow.value.setHex(0x3a6070); WU.uShore.value.setHex(0x50727c);
  WU.uRiver.value.setHex(0x1a2c34); WU.uRiverEdge.value.setHex(0x26383e);
  WU.uSky.value.setHex(0xbcd2e8);
  WU.uWaveAmp.value = 0.24;
}
