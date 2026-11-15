// Washington DC surfaces and facades (owner: dc-design; called by src/levels/dc.js).
// Ground uses Chicago's shared terrain shader family (chicagoGround: same
// program, wear field and world-space tiling) with DC's own maps swapped in:
// crushed-stone Mall walks, granite plaza paving, white marble terraces and a
// fresher spring lawn. No per-material onBeforeCompile variants on building
// materials (they split shader programs past the smoke test's budget).
import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';
import { chicagoGround, tickChicagoMaterials } from './chicagoMaterials.js';
import { createDcTrees as createTrees } from './dcLandscape.js';

const textures = new Map(), loader = new THREE.TextureLoader();
function texture(file, color = false) {
  const key = file + color; if (textures.has(key)) return textures.get(key);
  const t = loader.load(assetURL('./assets/textures/' + file), undefined, undefined,
    () => reportLoadError('DcSurface', file, new Error('texture load failed')));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t); return t;
}
// DC map set per kind (dc_<name>_color.jpg / _normal.png / _roughness.png,
// devtools/dc/design/tools/dc_ground_tex.py); grass and asphalt keep Chicago's
const DC_MAPS = { gravel: 'gravel', pavement: 'paving', marble: 'marble' };
const TINT = { lawn: 0xd0e0b8, grass: 0xd0e0b8, gravel: 0xffffff, pavement: 0xf2f0ea, marble: 0xffffff, asphalt: 0x9c9c9a };

/** Ground surface: kind 'grass' | 'lawn' | 'pavement' | 'asphalt' | 'gravel' | 'marble'. */
export function dcGround(material, kind, wear = 0) {
  const k = kind === 'lawn' ? 'grass' : kind === 'gravel' || kind === 'marble' ? 'pavement' : kind;
  chicagoGround(material, k, wear);
  const own = DC_MAPS[kind];
  if (own) {
    material.map = texture(`dc_${own}_color.jpg`, true);
    material.normalMap = texture(`dc_${own}_normal.png`);
    material.roughnessMap = texture(`dc_${own}_roughness.png`);
    material.normalScale.set(kind === 'gravel' ? .3 : .2, kind === 'gravel' ? .3 : .2);
  }
  if (TINT[kind] !== undefined) material.color.setHex(TINT[kind]);
  material.name = 'DC ' + kind + (wear ? ' worn' : '');
  return material;
}

/** Generic-kit / landmark building material (file: the GLB's file name). The
 *  painted textures already carry the stone colour: only the PBR response is
 *  set here (stone matte, glass a little glossier, never metallic). */
export function dcFacade(material, file) {
  if (!material.isMeshStandardMaterial || material.userData.dcFacade) return;
  material.userData.dcFacade = true;
  const glass = /glass|shop_glass|drum_window/i.test(material.name) || /office_glass/.test(file) && /office_glass/.test(material.name);
  material.roughness = glass ? .4 : Math.max(material.roughness, /roof/i.test(material.name) ? .8 : .7);
  material.metalness = 0;
  material.emissiveIntensity = Math.min(material.emissiveIntensity, .25);
}
/** Per frame (world time). */
export function tickDcMaterials(time) { tickChicagoMaterials(time); }
/** Park / street tree factory: (x, z, scale, kind = 'elm' | 'cherry') => Object3D (dcLandscape.js). */
export function createDcTrees(K, lite = false, glb = true) { return createTrees(K, lite, glb); }
/** DC water colours on the shared water material's uniforms (waterUniforms(mat)): the Potomac and the Tidal
 *  Basin are grey-green river water under a pale sky, not Lake Michigan teal; narrow channels (the field's
 *  river band: the reflecting pools) dark and glassy so they mirror the sky and the Monument. */
export function dcWater(WU) {
  WU.uDeep.value.setHex(0x2c4544); WU.uMid.value.setHex(0x3a5752);
  WU.uShallow.value.setHex(0x4c665d); WU.uShore.value.setHex(0x627a6e);
  WU.uRiver.value.setHex(0x1f2a2a); WU.uRiverEdge.value.setHex(0x2b3836);
  WU.uSky.value.setHex(0xc4d6ea);
  WU.uWaveAmp.value = 0.16;
}
