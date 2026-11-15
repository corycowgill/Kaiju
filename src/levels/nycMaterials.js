// New York City surfaces and facades (owner: nyc-design; called by src/levels/nyc.js).
// Seeded by nyc-integrator: Chicago's shared terrain shader family and DC's
// tree factory until nyc-design's own maps land. No per-material
// onBeforeCompile variants on building materials (they split shader
// programs past the smoke test's budget).
import { chicagoGround, tickChicagoMaterials } from './chicagoMaterials.js';
import { createDcTrees } from './dcLandscape.js';

const TINT = { lawn: 0xd0e0b8, grass: 0xd0e0b8, gravel: 0xe8e2d6, pavement: 0xeeebe4, asphalt: 0x8e8e8c };

/** Ground surface: kind 'grass' | 'lawn' | 'pavement' | 'asphalt' | 'gravel'. */
export function nycGround(material, kind, wear = 0) {
  const k = kind === 'lawn' ? 'grass' : kind === 'gravel' || kind === 'marble' ? 'pavement' : kind;
  chicagoGround(material, k, wear);
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
/** Park / street tree factory: (x, z, scale, kind) => Object3D (DC's elms until NYC's own). */
export function createNycTrees(K, lite = false, glb = true) { return createDcTrees(K, lite, glb); }
/** NYC water colours on the shared water material's uniforms: the Hudson and the East River, grey-green tidal water. */
export function nycWater(WU) {
  WU.uDeep.value.setHex(0x26403f); WU.uMid.value.setHex(0x34504c);
  WU.uShallow.value.setHex(0x46605a); WU.uShore.value.setHex(0x5c7268);
  WU.uRiver.value.setHex(0x1f2a2a); WU.uRiverEdge.value.setHex(0x2b3836);
  WU.uSky.value.setHex(0xc4d6ea);
  WU.uWaveAmp.value = 0.2;
}
