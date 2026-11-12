// Build stamp for the on-page console (visible via ?debug in the URL).
console.info('[KAIJU HAVOC] build', 'f7892c5+', new Date().toISOString());
window.__dbg && window.__dbg('DBG · game.js module starting');
import * as THREE from 'three';
window.__dbg && window.__dbg('DBG · three imported OK');
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MONSTERS, buildKaiju, renderMonsterPreviews } from './monsters.js';
import { loadKaijuModel } from './kaijuLoader.js';
import { Building, buildCity, spawnCars, spawnCivilians, flushBodiesIM, loadBuildingTemplates, loadDebrisTemplates, loadTreeTemplates, loadPedestrianTemplates, loadCarTemplates, loadLevelTemplates, loadLevelData, flushPendingGLBBuildings, enableKTX2, cullRubble, stageDestruction } from './city.js';
import { Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech, loadEnemyTemplates } from './enemies.js';
import * as legacyEffects from './effects.js';
import {
  Effect, makeExplosion, makeSparks, makeShockwave,
  makeMuzzleFlash, makeSmokePuff, makeBeam, makeHitPulse, makeSmokeColumn,
  makeChainLightning, makeMissileSwarm, makeAtomicDome, makeAtomicDevastation,
  makeWingSlash, makeTailSweep, makeAfterburnerTrail, makeDustBurst,
  makeSoundWaveRings, makeBreathCone, makeWingFlap, makeWindStreaks,
  makeMissileLaunchFlash,
} from './effects.js';
import { Pickup, rollDrop } from './pickups.js';
import audio from './audio.js';
import { initAssetCache, getCacheStats, disposeInstance, markShared, reportLoadError, warnOnce, onGLBParsed, canonMaterialMaps } from './assetCache.js';
import { QUALITY, Q_HIGH, Q_MED, Q_LOW, isMobile, QUALITY_PROFILE, GLB_CONTENT, setQualityAndReload } from './quality.js';
import { batchCars, batchMovers } from './carBatch.js';
import { fireAtomicBreath, updateAtomicBlasts, resetAtomicBlasts } from './atomicBlast.js';
import { bindWater, wadeSpeedMult, wadeSink, updateWading, footfall as waterFootfall, impact as waterImpact, boatSunk, waterDepth } from './waterPlay.js';
import vfx, { listBuilders, resetPooledLights, flipbookWarmMeshes, effectTextures, flipbooksReady } from './vfx.js';
import { createWrestling } from './wrestling/index.js';
import { prebakeAnims } from './wrestling/anims.js';
import { initLook, bindLook, setLookLevel, updateLook, buildLookMap, tagLookScene, styleKaiju, makeLookSky, resetLookClock, lookSunDir, lookSunUp, withLookEnvSky, setLookDip } from './look.js';
window.__dbg && window.__dbg('DBG · all imports OK');

// ------------------------- High score (localStorage) -------------------------
const HIGH_SCORE_KEY = 'kaiju_highscore';
function getHighScore() {
  try { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10) || 0; } catch { return 0; }
}
function trySetHighScore(s) {
  try {
    const cur = getHighScore();
    if (s > cur) { localStorage.setItem(HIGH_SCORE_KEY, String(s)); return true; }
  } catch {}
  return false;
}

// ------------------------- Level select -------------------------
// ?level= wins (testing), then the saved menu pick, then Tokyo.
const LEVELS = {
  tokyo:   { name: 'TOKYO',   jp: '東京', tag: 'NEON DUSK · SHINJUKU', h2: 'TOKYO DESTRUCTION', h2jp: '東京破壊' },
  chicago: { name: 'CHICAGO', jp: 'シカゴ', tag: 'HIGH NOON · THE LOOP', h2: 'CHICAGO DESTRUCTION', h2jp: 'シカゴ破壊', mode: 'wrestling' },
};
// A level's game mode: 'waves' (the survival loop) unless its LEVELS entry
// names another. ?mode=waves puts such a level back on the classic loop for
// testing; a level without a mode of its own (Tokyo) is always waves.
function _modeId(level) {
  const own = (LEVELS[level] && LEVELS[level].mode) || 'waves';
  if (own === 'waves') return own;
  const m = location.search.match(/[?&]mode=(\w+)/);
  return m && (m[1] === 'waves' || m[1] === own) ? m[1] : own;
}
const LEVEL_KEY = 'kaijuLevel';
function _detectLevel() {
  const m = location.search.match(/[?&]level=(\w+)/);
  if (m && LEVELS[m[1]]) return m[1];
  try {
    const saved = localStorage.getItem(LEVEL_KEY);
    if (saved && LEVELS[saved]) return saved;
  } catch (e) { /* storage blocked: default */ }
  return 'tokyo';
}
let selectedLevel = _detectLevel();
function _setLevel(level) {
  if (!LEVELS[level]) return;
  selectedLevel = level;
  try { localStorage.setItem(LEVEL_KEY, level); } catch (e) { /* not persisted */ }
}

// Mobile + quality flags now live in src/quality.js so the VFX manager and
// any future module can read the same source of truth.
if (isMobile) document.body.classList.add('mobile');
// Touch controls / touch HUD layout: phones, plus any coarse-pointer device
// that isMobile leaves on the desktop quality path (iPadOS reports a Mac UA).
const touchUI = isMobile || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
if (touchUI) document.body.classList.add('touch');
console.info('[KAIJU HAVOC] quality tier =', QUALITY);
// Highlight the active quality pick on the title screen.
{
  const pick = document.querySelector(`#quality-picker a[href="?q=${QUALITY}"]`);
  if (pick) {
    pick.style.color = '#ffe6c8';
    pick.style.borderColor = '#ffcc66';
    pick.style.background = 'rgba(255,200,100,0.12)';
  }
}
// Persist the choice (localStorage) so it sticks across visits. The picker
// is also cloned into the pause sheet so phones (no title screen mid-run)
// can switch tiers; tick() shows the sheet only while paused.
const _pauseMenu = document.getElementById('pause-menu');
(() => {
  const src = document.getElementById('quality-picker');
  const slot = document.getElementById('pause-quality-slot');
  if (!src || !slot) return;
  const el = src.cloneNode(true);
  el.id = 'quality-picker-pause';
  slot.appendChild(el);
})();
document.querySelectorAll('#quality-picker a, #quality-picker-pause a').forEach((a) => {
  const pick = (e) => { e.preventDefault(); setQualityAndReload(a.getAttribute('href').replace('?q=', '')); };
  a.addEventListener('click', pick);
  a.addEventListener('touchend', pick);
});
// The upgrade picker also sets state.paused; the sheet stays out of its way.
let _pauseMenuShown = false;
function _syncPauseMenu() {
  const show = !!(state.paused && state.kaiju && !state.gameOver && !state.upgradePending);
  if (!_pauseMenu || show === _pauseMenuShown) return;
  _pauseMenuShown = show;
  _pauseMenu.classList.toggle('hidden', !show);
}
/** Pause / resume from Esc, the HUD menu button, the sheet or a gamepad's Start. */
function togglePause(on = !state.paused) {
  if (state.upgradePending || state.gameOver) return;
  state.paused = on;
  if (on) document.exitPointerLock?.();
}

function updateOrientationClass() {
  if (!isMobile) return;
  document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
}
updateOrientationClass();
window.addEventListener('orientationchange', updateOrientationClass);
window.addEventListener('resize', updateOrientationClass);

// ------------------------- Setup -------------------------
const game = document.getElementById('game');
// Phase 8: pixel ratio + shadow toggle keyed off the QUALITY tier.
//
// Render profile per platform x tier. Desktop values are unchanged from
// before; mobile MED/HIGH now get post (bloom + vignette/grade, no CA /
// grain / god rays), a single tight kaiju shadow map and a dynamic pixel
// ratio instead of the old "no post, no shadows, PR 0.75" path.
const RP = isMobile ? {
  pr:        Q_HIGH ? 1.5  : (Q_MED ? 1.25 : 0.75),
  prMin:     Q_HIGH ? 1.0  : (Q_MED ? 0.85 : 0.6),   // dynamic-res floor
  post:      !Q_LOW,
  bloomScale: Q_HIGH ? 1.0 : 0.5,                    // of CSS size
  cine:      !Q_LOW,
  cineCA: false, cineGrain: false, godRays: false,
  shadows:   !Q_LOW,
  shadowMap: Q_HIGH ? 1024 : 512,
  shadowHalf: 48,                                    // tight frustum (u)
  shadowType: THREE.PCFShadowMap,
  shadowEvery: 2,                                   // shadow map refresh interval (frames)
  // Phones: only the kaiju and the big enemies (Mech, BossMech) cast: they're
  // marked with this layer and restrictShadowCasters() turns castShadow off
  // on the rest (the shadow pass drew ~88 building tiles per update for
  // shadows inside a +-48u window). Buildings still receive.
  shadowCasterLayer: 5,
  carFar: 180, civFar: 90,                           // movers not drawn past this camera distance (u)
  bloomMips: 3,                                      // UnrealBloomPass levels (desktop: three's 5)
  neon:      Q_HIGH ? 3 : 2,
  dynRes:    true,
} : {
  pr:        Q_HIGH ? 1.5 : (Q_MED ? 1.25 : 1.0),
  prMin:     1.0,                                 // dynamic-res floor
  post:      true,
  bloomScale: 0.5,
  cine:      !Q_LOW,
  cineCA: true, cineGrain: true, godRays: true,
  shadows:   Q_HIGH,
  shadowMap: 1024,
  shadowHalf: 112,
  shadowType: THREE.PCFSoftShadowMap,
  shadowEvery: 2,
  neon:      Q_HIGH ? 3 : (Q_MED ? 3 : 4),   // MED was 5 (+3 pool = 10 lights > HIGH's 8)
  dynRes:    true,
};
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    // Off on every tier: every tier that could afford MSAA renders through
    // the post composer, whose render targets are not multisampled, so
    // the default-framebuffer MSAA only antialiased the final full-screen
    // blit (no visual gain) while costing ~100-150 MB + a resolve/frame.
    antialias: false,
    // Mobile keeps 'default': on iOS 'high-performance' only matters on
    // dual-GPU Macs, and on Android it can pin the big cores / heat up.
    powerPreference: isMobile ? 'default' : 'high-performance',
    preserveDrawingBuffer: false,
  });
} catch (e) {
  document.body.innerHTML = '<div style="color:#fff;text-align:center;padding:20%;font-family:sans-serif;">' +
    '<h2>WebGL Not Available</h2><p>This game requires WebGL support.</p></div>';
  throw e;
}
const QUALITY_PR = RP.pr;
// Current (possibly dynamically lowered) pixel ratio; see _dynResTick.
let _curPR = Math.min(window.devicePixelRatio, QUALITY_PR);
renderer.setPixelRatio(_curPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = RP.shadows;
renderer.shadowMap.type = RP.shadowType;
// The shadow pass (~100 instanced-building depth draws on desktop HIGH, and
// a full scene traversal) re-renders every RP.shadowEvery frames instead of
// every frame (see tick). Its casters are static buildings plus the kaiju;
// the light matrix only changes when the map re-renders, so the map and
// its lookup stay consistent and a moving kaiju's shadow trails by at most
// one frame.
if (RP.shadowEvery > 1) renderer.shadowMap.autoUpdate = false;
let _shadowFrame = 0;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);
// The shared look layer (look.js) patches three's shader chunks: before any
// material compiles. Phone LOW runs it without the city map; tiers without a
// shadow map get the kaiju's shadows analytically.
initLook({
  q: isMobile ? (Q_LOW ? 0 : 1) : (Q_HIGH ? 2 : 1),
  blob: !RP.shadows,
  mapSize: isMobile ? 512 : 1024,
  mapBudget: isMobile ? 16000 : 60000, // map texels re-swept per frame while it updates
});

// Every parsed GLB's textures are queued for upload: drained while START
// loads (behind the loading bar) and, in play, by tick() on a ~4 ms
// per-frame budget; _preuploadTextures flushes what is left before the
// first gameplay frame.
const _TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap'];
const _texQueue = new Set();
onGLBParsed((root) => {
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const k of _TEX_KEYS) { const t = m[k]; if (t && t.isTexture) _texQueue.add(t); }
    }
  });
});

// Any material built after load gets the shared texture slots (see
// canonMaterialMaps) on its first draw: Mesh.onBeforeRender runs before three
// picks the program.
// Also: three draws a transparent DoubleSide material in two passes (back
// faces, then front), flipping material.side with needsUpdate each time, so
// its program is re-resolved twice every frame (the fest beams, the shock
// rings and most effects). Where the passes' order can't change the result
// they draw in one: additive blending without depth writes (the sum
// commutes), or a flat geometry (each pixel sees only one side of it).
const _FLAT = new Set(['PlaneGeometry', 'RingGeometry', 'CircleGeometry']);
function _prepMaterial(m, geometry) {
  canonMaterialMaps(m);
  if (!m || !m.transparent || m.side !== THREE.DoubleSide) return;
  const u = m.userData;
  if (u.onePass === undefined) {
    u.onePass = m.forceSinglePass ? 'own' : (m.blending === THREE.AdditiveBlending && !m.depthWrite) ? 'add'
      : (geometry && _FLAT.has(geometry.type)) ? 'flat' : 'no';
    if (u.onePass === 'add' || u.onePass === 'flat') m.forceSinglePass = true;
  } else if (u.onePass === 'flat' && geometry && !_FLAT.has(geometry.type)) {
    u.onePass = 'no'; m.forceSinglePass = false; // also drawn on a solid shape: back to two passes
  }
}
THREE.Mesh.prototype.onBeforeRender = function (r, s, c, geometry, material) { _prepMaterial(material, geometry); };
function _drainTexQueue(budgetMs) {
  const t0 = performance.now();
  for (const t of _texQueue) {
    _texQueue.delete(t);
    try { renderer.initTexture(t); } catch (e) { /* uploads on first use instead */ }
    if (performance.now() - t0 > budgetMs) break;
  }
}

// iPhone Safari drops the WebGL context under memory pressure (unified
// memory, ~1-1.5 GB per tab). Instead of a frozen black canvas: tell the
// player, then reload -- on phones one tier lower (MED -> LOW = procedural
// city), on desktop at the same tier (a GPU reset, not a budget problem).
// A per-session counter stops a reload loop if it keeps happening.
// Desktop: GPU-compressed (KTX2/Basis) building textures, ~1/4 the VRAM of
// the JPEG copies. Phones keep their 512px JPEG copies (assets/m/).
if (!isMobile) enableKTX2(renderer);

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  let losses = 0;
  try {
    losses = (+sessionStorage.getItem('kaijuCtxLost') || 0) + 1;
    sessionStorage.setItem('kaijuCtxLost', String(losses));
  } catch (err) { /* storage blocked */ }
  if (losses > 2) { toast('GRAPHICS CRASHED · TRY GRAPHICS: LOW', 'bad'); return; }
  const next = isMobile ? (Q_HIGH ? 'med' : 'low') : QUALITY;
  toast(isMobile ? `OUT OF GRAPHICS MEMORY · RELOADING ON ${next.toUpperCase()}` : 'GRAPHICS RESET · RELOADING', 'bad');
  setTimeout(() => setQualityAndReload(next), 1800);
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x281a30);
// Initialize the VFX manager and populate its named-effect registry.
// All current upgrades are pure THREE.ShaderMaterial builders; init/tick
// are no-ops today but the integration is wired up for future per-frame
// VFX state (particle systems, etc).
vfx.init(scene);
vfx.registerAllBuilders(legacyEffects);
// Phase 6: exponential fog matched to the sunset palette. Distance buildings
// fade smoothly into haze instead of popping at a linear cut. Density tuned
// so things ~150u away stay readable but the city horizon dissolves.
// Desaturated dusk purple-blue (was saturated magenta 0x4a1a3a @ 0.0042,
// which tinted every surface pink and flattened the city).
scene.fog = new THREE.FogExp2(0x3a3048, 0.0032);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 2000);

// Postprocessing pipeline:
//   RenderPass -> UnrealBloomPass -> OutputPass (tone-map + sRGB at the end).
// Bloom runs at half-res to keep mobile-class GPUs in the budget.
// Phase 1 of graphics plan: explicit OutputPass + sRGBColorSpace audit so the
// composer chain matches the colour pipeline regardless of pass order.
let composer = null;
let bloomPass = null;

// God rays at reduced resolution: the 12-tap radial blur toward the sun
// used to run per full-res pixel inside the cine pass. This pass renders
// it into a half-res target (it is a soft blur, so the upsample is not
// visible); the cine pass adds it back with one bilinear tap. No swap:
// the colour buffer passes through untouched.
class GodRayPass extends Pass {
  constructor(samples, scale) {
    super();
    this.needsSwap = false;
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.uniforms = {
      tDiffuse: { value: null },
      sunPos:   { value: new THREE.Vector2(0.85, 0.62) },
      godStr:   { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 sunPos;
        uniform float godStr;
        varying vec2 vUv;
        void main() {
          if (godStr <= 0.0) { gl_FragColor = vec4(0.0); return; }
          vec2 toSun = sunPos - vUv;
          vec3 ray = vec3(0.0);
          float decay = 1.0;
          for (int i = 0; i < ${samples}; i++) {
            float t = float(i) / float(${samples});
            vec3 s = texture2D(tDiffuse, vUv + toSun * (t * 0.45)).rgb;
            float lum = dot(s, vec3(0.299, 0.587, 0.114));
            ray += s * smoothstep(0.55, 1.4, lum) * decay;
            decay *= 0.92;
          }
          ray /= float(${samples});
          gl_FragColor = vec4(ray * vec3(1.10, 0.85, 0.55) * godStr, 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)));
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.rt);
    this.fsQuad.render(renderer);
  }
  dispose() { this.rt.dispose(); this.material.dispose(); this.fsQuad.dispose(); }
}
// Post on desktop and on mobile MED/HIGH (mobile LOW renders direct).
if (RP.post) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * RP.bloomScale, window.innerHeight * RP.bloomScale),
    Q_HIGH ? 0.85 : (Q_MED ? 0.65 : 0.45), // strength
    Q_HIGH ? 0.55 : (Q_MED ? 0.50 : 0.40), // radius
    0.85                                    // threshold (0.7 bloomed lit props/flipbook smoke)
  );
  composer.addPass(bloomPass);
  if (RP.bloomMips && RP.bloomMips < bloomPass.nMips) {
    // Phones: fewer blur levels (-2 levels x 2 draws). The composite still
    // reads all five targets, so the dropped levels' weights go to 0
    const bf = bloomPass.compositeMaterial.uniforms.bloomFactors.value;
    for (let i = RP.bloomMips; i < bloomPass.nMips; i++) bf[i] = 0;
    bloomPass.nMips = RP.bloomMips;
  }

  // Cinematic post pass: chromatic aberration, vignette, film grain,
  // god-ray sun shafts, and a synthwave-dusk colour grade. Runs in
  // linear-light space (before OutputPass) so grain blends with bloom
  // rather than being clamped post-tonemap. Strength tuned per quality
  // tier; LOW skips the pass entirely to keep the mobile budget.
  if (RP.cine) {
    const cineUniforms = {
      tDiffuse: { value: null },
      time:     { value: 0 },
      // Toned down from 0.55 / 0.045 / 0.0026: the old values made every
      // frame muddy and noisy and smeared thin geometry with colour fringes.
      vignette: { value: Q_HIGH ? 0.35 : 0.28 },
      grain:    { value: Q_HIGH ? 0.018 : 0.012 },
      ca:       { value: Q_HIGH ? 0.0010 : 0.0006 },
      // Sun screen position is fed each frame from a world-space sun dir.
      sunPos:   { value: new THREE.Vector2(0.85, 0.62) },
      // God-ray strength + sample density. HIGH does 12 samples; MED 6.
      godStr:   { value: RP.godRays ? (Q_HIGH ? 0.55 : 0.30) : 0.0 },
      gradeMix: { value: Q_HIGH ? 0.35 : 0.25 },
      // Grade tints (Tokyo values; applyLevelLook swaps them per level)
      shadowTint: { value: new THREE.Vector3(0.70, 0.60, 0.92) },
      highTint:   { value: new THREE.Vector3(1.05, 0.92, 0.74) },
      tGod:     { value: null },
    };
    const SAMPLES = Q_HIGH ? 12 : 6;
    // Mobile variant compiles CA, god rays and grain out entirely (one
    // texture tap per pixel instead of 3 + SAMPLES).
    const CA_GLSL = RP.cineCA ? `
          col.r = texture2D(tDiffuse, vUv + dir * ca).r;
          col.g = texture2D(tDiffuse, vUv).g;
          col.b = texture2D(tDiffuse, vUv - dir * ca).b;` : `
          col = texture2D(tDiffuse, vUv).rgb;`;
    const GOD_DEFINE = RP.godRays ? '#define USE_GODRAYS' : '';
    const GRAIN_DEFINE = RP.cineGrain ? '#define USE_GRAIN' : '';
    const cinePass = new ShaderPass({
      uniforms: cineUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        ${GOD_DEFINE}
        ${GRAIN_DEFINE}
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float vignette;
        uniform float grain;
        uniform float ca;
        uniform vec2  sunPos;
        uniform float godStr;
        uniform sampler2D tGod;
        uniform float gradeMix;
        uniform vec3 shadowTint, highTint;
        varying vec2 vUv;
        float hash(vec2 p, float t) {
          return fract(sin(dot(p, vec2(127.1, 311.7)) + t * 27.13) * 43758.5453);
        }
        // Synthwave-dusk grade: lift shadows toward magenta, warm
        // highlights toward gold, slight contrast push.
        vec3 grade(vec3 c) {
          // Filmic contrast curve
          c = c * (c * (c * 0.305 + 0.476) + 0.012) /
              (c * (c * 0.295 + 0.477) + 0.0666);
          // Tint shadows + highlights
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float sMix = 1.0 - smoothstep(0.0, 0.45, lum);
          float hMix = smoothstep(0.55, 1.0, lum);
          c = mix(c, c * shadowTint, sMix * 0.25);
          c = mix(c, c * highTint,   hMix * 0.40);
          return c;
        }
        void main() {
          // Chromatic aberration
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);
          vec2 dir = c * (1.0 + r2 * 1.4);
          vec3 col;${CA_GLSL}

          // God rays: radial blur from the sun's screen position. Each
          // sample steps toward the sun and we take a small contribution.
          // Cheap: only the bright pixels (luminance threshold) contribute.
          #ifdef USE_GODRAYS
          col += texture2D(tGod, vUv).rgb; // half-res GodRayPass (pre-scaled by godStr)
          #endif

          // Colour grade
          col = mix(col, grade(col), gradeMix);

          // Vignette
          float vig = smoothstep(0.85, 0.30, length(c) * 1.4);
          col *= mix(1.0, vig, vignette);

          // Film grain
          #ifdef USE_GRAIN
          float n = hash(gl_FragCoord.xy, time) - 0.5;
          col += n * grain;
          #endif

          gl_FragColor = vec4(col, 1.0);
          // Output transform folded in (was a separate OutputPass: one
          // fewer full-screen pass). three injects the tone-mapping +
          // sRGB functions for a ShaderMaterial drawn to the screen, which
          // the cine pass is as the composer's last pass; exposure comes
          // from renderer.toneMappingExposure, as with OutputPass.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    if (RP.godRays) {
      const godPass = new GodRayPass(SAMPLES, 0.5);
      // Share the uniform objects the per-frame sun update writes into.
      godPass.uniforms.sunPos = cinePass.uniforms.sunPos;
      godPass.uniforms.godStr = cinePass.uniforms.godStr;
      godPass.material.uniforms = godPass.uniforms;
      cinePass.uniforms.tGod.value = godPass.rt.texture;
      composer.addPass(godPass);
    }
    composer.addPass(cinePass);
    window.__cinePass = cinePass;
  } else {
    composer.addPass(new OutputPass());
  }
} // end if (RP.post) post-processing

// Lighting: dramatic dusk
// Phase 4 lighting: low-angle synthwave-dusk sun + reduced ambient (IBL
// from Phase 3 handles fill on desktop), plus 6 neon point lights as set
// dressing. Hemisphere kept as a cheap colour fill on mobile (no IBL there).
// Sky colour pulled from hot pink toward warm peach and the ground bounce
// lifted from near-black violet, so shadowed facades keep their colour.
const hemi = new THREE.HemisphereLight(0xffb0a0, 0x2a2440, Q_HIGH ? 0.50 : (Q_MED ? 0.60 : 0.65));
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffa070, 2.0);
sun.position.set(-90, 60, 40); // low-angle sunset rake from the side
if (RP.shadows) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(RP.shadowMap, RP.shadowMap);
  // Tight frustum around the kaiju, retargeted per frame (see
  // updateCamera) so distant buildings never enter the shadow camera.
  // Desktop: +-112 u. Mobile: +-48 u, i.e. essentially the kaiju and
  // its own cast shadow, so the shadow pass draws only a handful of meshes.
  const H = RP.shadowHalf;
  sun.shadow.camera.left = -H; sun.shadow.camera.right = H;
  sun.shadow.camera.top = H;   sun.shadow.camera.bottom = -H;
  sun.shadow.camera.near = 1;   sun.shadow.camera.far = 290;
  sun.shadow.bias = -0.0005;
}
scene.add(sun);
/** Phones: mark root as a shadow caster (RP.shadowCasterLayer on every mesh
 *  under it). The layer is only a marker: three r160's shadow pass tests
 *  object layers against the MAIN camera, not the shadow camera, so the
 *  casters are enforced by restrictShadowCasters() below. No-op on desktop. */
function markShadowCaster(root) {
  if (RP.shadowCasterLayer && root) root.traverse((o) => { if (o.isMesh) o.layers.enable(RP.shadowCasterLayer); });
}
/** Phones: castShadow off for every mesh under root that isn't a marked
 *  caster (the city's building / prop tiles drew ~88 depth draws per
 *  shadow update for shadows inside the +-48u window; they still receive).
 *  Run on the scene at game start and on each wave's spawns. */
function restrictShadowCasters(root) {
  if (!RP.shadowCasterLayer || !root) return;
  const bit = 1 << RP.shadowCasterLayer;
  root.traverse((o) => { if (o.isMesh && o.castShadow && !(o.layers.mask & bit)) { o.castShadow = false; o.userData.phoneNoCast = true; } });
}
// Cool back/rim light opposite the sunset key. No shadows (cheap); it
// separates kaiju and vehicle silhouettes from the warm background.
const rimLight = new THREE.DirectionalLight(0x6fa8ff, Q_LOW ? 0.45 : 0.65);
rimLight.position.set(80, 70, -60);
scene.add(rimLight);
const ambient = new THREE.AmbientLight(0x445566, Q_HIGH ? 0.15 : (Q_MED ? 0.30 : 0.45));
scene.add(ambient);

// Neon point lights scattered through the city as set dressing: 3 (high,
// was 6) / 5 (med) / 4 (low). Every point light costs every lit fragment
// even at intensity 0, and HIGH also carries the 5-light VFX pool, so HIGH
// keeps the three strongest colours, spaced evenly around the ring, with a
// slightly longer reach to cover the gaps. Short distance + decay so they
// only colour the immediate street level.
const NEON_PALETTE = [0xff3388, 0x33ddff, 0xffaa44, 0xff66ff, 0x66ff99, 0xffee44];
const NEON_COUNT = RP.neon; // desktop 3/3/4, mobile 3 (HIGH) / 2
const _neonLights = [];
const _neonPhase = Math.random() * Math.PI * 2;
for (let i = 0; i < NEON_COUNT; i++) {
  const c = NEON_PALETTE[i % NEON_PALETTE.length];
  const a = _neonPhase + (i / NEON_COUNT) * Math.PI * 2; // evenly spread (was i/6 for every tier)
  const r = 110 + Math.random() * 80;
  const pl = new THREE.PointLight(c, 4.5, Q_HIGH ? 46 : 38, 2);
  pl.position.set(Math.cos(a) * r, 6, Math.sin(a) * r);
  scene.add(pl);
  _neonLights.push(pl);
}

// Sky dome with stars
const skyGeom = new THREE.SphereGeometry(1500, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  // Palette uniforms default to the Tokyo dusk; applyLevelLook() swaps them.
  uniforms: {
    time: { value: 0 },
    horizon: { value: new THREE.Vector3(0.95, 0.32, 0.22) },
    midCol:  { value: new THREE.Vector3(0.32, 0.10, 0.32) },
    zenith:  { value: new THREE.Vector3(0.04, 0.02, 0.14) },
    nebula:  { value: 1.0 },   // nebula tint, stars and moon (night sky)
    sunRim:  { value: new THREE.Vector3(1.0, 0.5, 0.25) },
    sunDir:  { value: new THREE.Vector3(-0.55, 0.12, 0.25).normalize() },
  },
  vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    varying vec3 vP;
    uniform float time;
    uniform vec3 horizon, midCol, zenith, sunRim, sunDir;
    uniform float nebula;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vP);
      float h = d.y;
      // Three-tier gradient
      vec3 col = mix(horizon, midCol, smoothstep(-0.05, 0.35, h));
      col = mix(col, zenith, smoothstep(0.25, 0.85, h));
      // Cheap nebula tint -- single sin wave instead of fbm
      col += nebula * vec3(0.12, 0.04, 0.22) * sin(d.x * 3.0 + d.z * 2.5 + time * 0.05) * smoothstep(0.1, 0.6, h) * 0.5;
      // Stars
      vec2 p = d.xz * 1200.0;
      float s = hash(floor(p));
      if (h > 0.18 && s > 0.9965) col += nebula * vec3(0.9, 0.95, 1.0) * (s - 0.9965) * 280.0;
      // Moon halo
      vec3 moonDir = normalize(vec3(0.4, 0.6, -0.5));
      float md = dot(d, moonDir);
      col += nebula * vec3(1.0, 0.95, 0.82) * smoothstep(0.997, 1.0, md);
      col += nebula * vec3(0.6, 0.5, 0.45) * smoothstep(0.985, 0.998, md) * 0.4;
      // Off-screen sun rim
      float sd = max(0.0, dot(d, sunDir));
      col += sunRim * pow(sd, 16.0) * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(skyGeom, skyMat);
// Chicago's dome: look.js's sky model (the fog and the reflections share it)
// plus a sun disc and cloud decks; fewer cloud octaves on phones
const _chiSkyMat = makeLookSky(isMobile ? (Q_LOW ? 2 : 3) : 4);
// Sky dome last among opaques: it is behind everything (r=1500), so drawn
// after the city the depth test skips it wherever buildings/ground cover it.
sky.renderOrder = 2;
scene.add(sky);

// Phase 3 of graphics plan: image-based lighting via PMREMGenerator. Render
// the procedural sky shader once into a CubeRenderTarget, prefilter through
// PMREM, and feed it as scene.environment. All MeshStandardMaterials get
// reflections/ambient automatically. Skipped on mobile to keep the GPU
// budget for bloom + emissive windows.
function _captureEnv() {
  try {
    if (scene.environment) scene.environment.dispose();
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    // Render the sky into a small cube render target by temporarily replacing
    // scene.background with a copy of the sky and using fromScene.
    // Cheaper alternative: use a CubeCamera to capture the sky dome.
    // Chicago's sky is HDR around the sun: a float target keeps that range
    const chi = sky.material === _chiSkyMat;
    const cubeTarget = new THREE.WebGLCubeRenderTarget(256, chi ? { generateMipmaps: false, type: THREE.HalfFloatType } : { generateMipmaps: false });
    const cubeCam = new THREE.CubeCamera(1, 2000, cubeTarget);
    // Update the sky shader once before capture
    skyMat.uniforms.time.value = 0;
    cubeCam.position.set(0, 50, 0);
    if (chi) { sky.position.copy(cubeCam.position); _chiSkyMat.uniforms.uEnv.value = 1; }
    // Sky (and lights) only: a recapture after a level switch must not bake
    // the city into the environment map
    const hidden = scene.children.filter((o) => o.visible && o !== sky && !o.isLight);
    for (const o of hidden) o.visible = false;
    // (Chicago: under a fixed mid-slide sky; the look layer tints it as dusk comes on)
    withLookEnvSky(() => cubeCam.update(renderer, scene));
    for (const o of hidden) o.visible = true;
    _chiSkyMat.uniforms.uEnv.value = 0;
    const env = pmrem.fromCubemap(cubeTarget.texture).texture;
    scene.environment = env;
    // Strength: scene.environmentIntensity does not exist in three r160 (it
    // was a silent no-op here); the look layer scales the IBL in the shader
    // instead (look.js ENV: 1 in Tokyo, which was tuned at full strength)
    cubeTarget.dispose();
    pmrem.dispose();
  } catch (e) { console.warn('PMREM env failed:', e); }
}
if (Q_HIGH) _captureEnv();

// Tokyo's backdrop (skyline ring, mountains, barrier): hidden on levels that
// bring their own (see applyLevelLook).
const _horizon = [];
// Distant horizon scenery: silhouette skyline + far mountains. Without
// this, walking to the edge of the play area shows blank ground meeting
// blank sky. This populates the 480-1300u radius zone with non-interactive
// dark scenery so the boundary reads as "city continues into haze."
{
  // ---- Silhouette skyline ring ----
  // ~120 dark buildings ringed around the play area at radius 480-720.
  // Single InstancedMesh, no shadows, frustum-cull off (it's not worth
  // computing per-instance bounds for a backdrop).
  const RING_COUNT = 120;
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x141022, roughness: 0.95, metalness: 0.0,
    emissive: 0x2a1a3a, emissiveIntensity: 0.15,
  });
  const ringGeom = new THREE.BoxGeometry(1, 1, 1);
  const ringIM = new THREE.InstancedMesh(ringGeom, ringMat, RING_COUNT);
  ringIM.frustumCulled = false;
  _horizon.push(ringIM);
  const ringDummy = new THREE.Object3D();
  for (let i = 0; i < RING_COUNT; i++) {
    const a = (i / RING_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.04;
    const r = 480 + Math.random() * 240;
    const w = 18 + Math.random() * 36;
    const d = 18 + Math.random() * 36;
    const h = 30 + Math.random() * 110;
    ringDummy.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    ringDummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    ringDummy.scale.set(w, h, d);
    ringDummy.updateMatrix();
    ringIM.setMatrixAt(i, ringDummy.matrix);
  }
  ringIM.instanceMatrix.needsUpdate = true;
  scene.add(ringIM);

  // ---- A few "lit" silhouette towers with a faint emissive face ----
  // Just enough scattered glow so the backdrop reads as alive at night.
  const litMat = new THREE.MeshStandardMaterial({
    color: 0x1a1430, roughness: 0.85,
    emissive: 0xff66cc, emissiveIntensity: 0.45,
  });
  const litIM = new THREE.InstancedMesh(ringGeom, litMat, 14);
  litIM.frustumCulled = false;
  _horizon.push(litIM);
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 500 + Math.random() * 200;
    const w = 14 + Math.random() * 18;
    const d = 14 + Math.random() * 18;
    const h = 80 + Math.random() * 100;
    ringDummy.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    ringDummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    ringDummy.scale.set(w, h, d);
    ringDummy.updateMatrix();
    litIM.setMatrixAt(i, ringDummy.matrix);
  }
  litIM.instanceMatrix.needsUpdate = true;
  scene.add(litIM);

  // ---- Distant mountain silhouettes ----
  // 9 low-poly cones at radius ~1000, dark blue-purple matching the
  // horizon haze. Inside the fog falloff so they fade to sky color.
  const mountMat = new THREE.MeshStandardMaterial({
    color: 0x2a1f3a, roughness: 1.0, metalness: 0.0,
    emissive: 0x1a0f2a, emissiveIntensity: 0.2,
  });
  const mountGeom = new THREE.ConeGeometry(1, 1, 6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const r = 950 + Math.random() * 350;
    const baseR = 120 + Math.random() * 180;
    const h = 180 + Math.random() * 220;
    const m = new THREE.Mesh(mountGeom, mountMat);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.set(baseR, h, baseR * (0.8 + Math.random() * 0.5));
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    _horizon.push(m);
  }

  // ---- Soft barrier ring at the play limit ----
  // Faint cyan vertical band at radius 330 to give the player a visible
  // edge they're not meant to push against. Low opacity, no z-write so
  // it doesn't compete with foreground bloom.
  const barrierMat = new THREE.MeshBasicMaterial({
    color: 0x66ddff, transparent: true, opacity: 0.06,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const barrierGeom = new THREE.CylinderGeometry(338, 338, 22, 64, 1, true);
  const barrier = new THREE.Mesh(barrierGeom, barrierMat);
  barrier.position.y = 11;
  scene.add(barrier);
  // Animate barrier opacity each frame so it pulses faintly when the
  // kaiju gets close. Stash refs for the main update loop to read.
  window.__barrier = { mesh: barrier, mat: barrierMat };
  _horizon.push(barrier);
}

// ------------------------- World object -------------------------
// Shared shell geometry + per-type materials so each shot doesn't
// allocate a fresh BufferGeometry / MeshBasicMaterial pair.
const SHARED_SHELL_GEOM = new THREE.SphereGeometry(0.35, 6, 6);
markShared(SHARED_SHELL_GEOM);
const SHELL_PROFILES = {
  tank:  { speed: 80,  damage: 9,  size: 0.35, mat: new THREE.MeshBasicMaterial({ color: 0xffaa44 }) },
  heli:  { speed: 90,  damage: 6,  size: 0.30, mat: new THREE.MeshBasicMaterial({ color: 0xffeeaa }) },
  mech:  { speed: 70,  damage: 20, size: 0.40, mat: new THREE.MeshBasicMaterial({ color: 0xff8844 }) },
  jet:   { speed: 110, damage: 7,  size: 0.32, mat: new THREE.MeshBasicMaterial({ color: 0xff5533 }) }, // was 11 @ 0.4 s strafe cadence
  rifle: { speed: 140, damage: 2,  size: 0.18, mat: new THREE.MeshBasicMaterial({ color: 0xffeecc }) },
  boss:  { speed: 75,  damage: 14, size: 0.85, mat: new THREE.MeshBasicMaterial({ color: 0xff3322 }) }, // was 32 / 0.55: telegraphed now, bigger + readable
};
// Push shell colours into HDR (>1) so they cross the bloom threshold and
// read as glowing tracers; at 1.0 they were near-invisible dots.
for (const p of Object.values(SHELL_PROFILES)) p.mat.color.multiplyScalar(2.6);

// ----- Incoming damage tuning -----
// Early waves were lethal: wave 1 (4 tanks + 1 heli, no line-of-sight
// check) dealt ~14.6 DPS to a stationary kaiju, i.e. death in 12-18 s.
// All damage TO the kaiju now goes through hurtKaiju(), which scales it
// by wave (x0.20 on wave 1, +0.16 per wave, full strength from wave 6)
// and stamps the time for out-of-combat regen. Shells are also stopped
// by buildings (see _shellHitsBuilding), so cover matters.
function incomingDamageMult() {
  return Math.min(1, 0.20 + 0.16 * Math.max(0, (state.wave || 1) - 1));
}
const OOC_REGEN_DELAY = 5.0; // seconds without taking damage
const OOC_REGEN_RATE  = 2.5; // HP per second once out of combat
// Burst cap: damage over a ~3 s leaky window is limited to
// DPS_CAP_FRAC(wave) x maxHp per second; anything above it is cut to 5%
// (was 15%, which let a boss volley stream through: ~12 HP/s sustained).
// Stops stacked jets + helis + artillery (wave 2 "AIR DOMINANCE" took 42%
// HP in 5 s) from deleting the player before they can react.
const DPS_WINDOW = 3.0;
function dpsCapFrac() {
  const w = state.wave || 1;
  const base = w <= 3 ? 0.025 + 0.005 * (w - 1) : Math.min(0.10, 0.035 + 0.008 * (w - 3));
  // Boss waves (every 4th) get 20% headroom off: the boss fight should be
  // a 60-120 s duel, not an escort-fire race (wave 4 killed in 18-33 s).
  return state.boss && !state.boss.dead ? base * 0.8 : base;
}
function hurtKaiju(amount) {
  let dmg = amount * incomingDamageMult() * _pctl.damageMult;
  const limit = dpsCapFrac() * state.maxHp * DPS_WINDOW;
  const room = Math.max(0, limit - (state._dmgWindow || 0));
  if (dmg > room) dmg = room + (dmg - room) * 0.05;
  state._dmgWindow = (state._dmgWindow || 0) + dmg;
  state.hp -= dmg;
  state._lastHurtT = world.time;
  if (state.hp <= 0 && !state.gameOver) {
    // A mode that scores knockouts itself (wrestling: a KO is a fall) ends the run when it decides to
    if (_mode.ownsKO) state.hp = 0; else gameOver(false);
  }
  return dmg;
}
// Boss ground-pound warning: a red disc that grows to the blast radius over
// `delay` seconds (pulsing faster near the end) plus a bright rim ring,
// so the player can read where the slam lands and step out in time.
const _G_TELE_DISC = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const _G_TELE_RING = new THREE.RingGeometry(0.94, 1.0, 64).rotateX(-Math.PI / 2);
markShared(_G_TELE_DISC, _G_TELE_RING);
function _spawnBossTelegraph(pos, radius, delay) {
  const g = new THREE.Group();
  g.position.set(pos.x, 0.2, pos.z);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.0,
    depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8 });
  const disc = new THREE.Mesh(_G_TELE_DISC, discMat);
  const ring = new THREE.Mesh(_G_TELE_RING, ringMat);
  ring.scale.setScalar(radius);
  g.add(disc, ring);
  scene.add(g);
  let t = 0;
  return {
    mesh: g, dead: false,
    tick(dt) {
      t += dt;
      const k = Math.min(1, t / delay);
      disc.scale.setScalar(Math.max(0.01, radius * k));
      const pulse = 0.5 + 0.5 * Math.sin(t * (8 + 14 * k));
      discMat.opacity = 0.12 + 0.22 * k * pulse;
      ringMat.opacity = 0.55 + 0.45 * pulse;
      if (t >= delay) {
        this.dead = true;
        scene.remove(g);
        discMat.dispose(); ringMat.dispose();
      }
    },
  };
}

// True if p is inside an intact building's footprint below its roof.
const _shellHitB = { b: null };
function _shellHitsBuilding(p) {
  const grid = world.buildingGrid;
  if (!grid || p.y < 0.5) return null;
  _shellHitB.b = null;
  grid.forEachNear(p.x, p.z, 4, (b) => {
    if (_shellHitB.b || b.destroyed || p.y > b.h) return;
    if (Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2) _shellHitB.b = b;
  });
  return _shellHitB.b;
}

// Reusable temp vectors so hot loops don't allocate a Vector3 per call.
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _tmpSun = new THREE.Vector3();
const _beamOrigin = new THREE.Vector3();
const _beamDir = new THREE.Vector3();
// Per-frame movement scratch (updatePlayer + fireMelee). These are populated
// at the top of the function and consumed before it returns; no consumer
// retains a reference, so reusing the same vector each frame is safe.
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _impact = new THREE.Vector3();
const _beamRay = new THREE.Raycaster();
const _beamImpact = new THREE.Vector3();
const _beamBox = new THREE.Box3();
const _beamBoxHit = new THREE.Vector3();
// GLB buildings (b.customMesh) are not instances in world.bodiesIM, so
// bodiesIM raycasts miss them. Returns the nearest intact GLB building
// whose footprint AABB the ray enters within maxDist as { b, d }, writing
// the entry point into outPoint, or null. Boxes containing the ray origin
// are skipped (kaiju standing in a tower's footprint).
function _rayNearestGLBBuilding(ray, maxDist, outPoint) {
  const grid = world.buildingGrid;
  if (!grid) return null;
  let best = null;
  const mx = ray.origin.x + ray.direction.x * maxDist * 0.5;
  const mz = ray.origin.z + ray.direction.z * maxDist * 0.5;
  grid.forEachNear(mx, mz, maxDist * 0.5 + 30, (b) => {
    if (b.destroyed || !b.customMesh) return;
    _beamBox.min.set(b.x - b.w / 2, 0, b.z - b.d / 2);
    _beamBox.max.set(b.x + b.w / 2, b.h, b.z + b.d / 2);
    if (_beamBox.containsPoint(ray.origin)) return;
    if (ray.intersectBox(_beamBox, _tmpV3)) {
      const d = _tmpV3.distanceTo(ray.origin);
      if (d < maxDist && (!best || d < best.d)) { best = { b, d }; outPoint.copy(_tmpV3); }
    }
  });
  return best;
}
// All intact GLB buildings the ray enters within maxDist, nearest first,
// as [{ b, d, point }]. Used by the piercing ultimate beam.
function _rayGLBBuildingsAll(ray, maxDist) {
  const grid = world.buildingGrid;
  const out = [];
  if (!grid) return out;
  const mx = ray.origin.x + ray.direction.x * maxDist * 0.5;
  const mz = ray.origin.z + ray.direction.z * maxDist * 0.5;
  grid.forEachNear(mx, mz, maxDist * 0.5 + 30, (b) => {
    if (b.destroyed || !b.customMesh) return;
    _beamBox.min.set(b.x - b.w / 2, 0, b.z - b.d / 2);
    _beamBox.max.set(b.x + b.w / 2, b.h, b.z + b.d / 2);
    if (_beamBox.containsPoint(ray.origin)) return;
    const p = new THREE.Vector3();
    if (ray.intersectBox(_beamBox, p)) {
      const d = p.distanceTo(ray.origin);
      if (d < maxDist) out.push({ b, d, point: p });
    }
  });
  out.sort((a, c) => a.d - c.d);
  return out;
}

const world = {
  scene,
  time: 0,
  effects: [],
  shells: [],   // enemy projectiles
  debris: [],   // physics chunks from collapsed buildings
  buildings: [], // populated below
  enemies: [],
  shake: function (mag, dur) {
    this._shakeMag = Math.max(this._shakeMag || 0, mag);
    this._shakeTime = Math.max(this._shakeTime || 0, dur);
  },
  // The generic spawners build at most MAX_EFFECTS per frame: updateWorld
  // keeps only the newest MAX_EFFECTS anyway, and an ult collapsing ~100
  // buildings in one frame built ~1,700 effects only to drop ~1,500 the next
  // (90-180 ms frames on desktop, 0.4-0.7 s at 4x CPU). Power visuals push
  // directly.
  _fxSpawned: 0,
  _fxRoom: function () { return this._fxSpawned++ < MAX_EFFECTS; },
  // Flying debris likewise: Building.collapse asks for its chunk count and
  // gets what's left of this frame's MAX_DEBRIS (an ult cloned ~1,870 chunks
  // to keep 140; a lone collapse still gets all of its own).
  _dbSpawned: 0,
  debrisRoom: function (n) { const k = Math.max(0, Math.min(n, MAX_DEBRIS - this._dbSpawned)); this._dbSpawned += k; return k; },
  spawnExplosion: function (pos, scale = 1) {
    // Missile / shell impacts that land on water also splash
    if (pos.y < 3) waterImpact(this, pos.x, pos.z, 0.4 + 0.5 * scale, 'missile');
    if (this._fxRoom()) this.effects.push(makeExplosion(this, pos, scale));
    audio.explosion(scale);
  },
  spawnSparks: function (pos, n) { if (this._fxRoom()) this.effects.push(makeSparks(this, pos, n)); },
  spawnShockwave: function (pos, color, r) { this.effects.push(makeShockwave(this, pos, color, r)); },
  spawnMuzzleFlash: function (pos, s) { if (this._fxRoom()) this.effects.push(makeMuzzleFlash(this, pos, s)); },
  spawnSmoke: function (pos, s) { if (this._fxRoom()) this.effects.push(makeSmokePuff(this, pos, s)); },
  spawnHitPulse: function (pos, color) { if (this._fxRoom()) this.effects.push(makeHitPulse(this, pos, color)); },
  spawnSmokeColumn: function (pos, height) { if (this._fxRoom()) this.effects.push(makeSmokeColumn(this, pos, height)); },
  spawnBeam: function (origin, dir, len, color, glow) {
    this.effects.push(makeBeam(this, origin, dir, len, color, glow));
  },
  spawnBossTelegraph: function (pos, radius, delay) {
    this.effects.push(_spawnBossTelegraph(pos, radius, delay));
  },
  spawnShell: function (origin, dir, type) {
    const profile = SHELL_PROFILES[type] || SHELL_PROFILES.tank;
    const m = new THREE.Mesh(SHARED_SHELL_GEOM, profile.mat);
    m.position.copy(origin);
    m.scale.setScalar(profile.size / 0.35); // base geom is r=0.35
    scene.add(m);
    this.shells.push({ mesh: m, vel: dir.clone().multiplyScalar(profile.speed), life: 4.0, damage: profile.damage, type });
    audio.shoot(type);
  },
  showMessage,
};

// Level layout data (Chicago's map JSON); a failed fetch falls back to Tokyo
try {
  await loadLevelData(selectedLevel);
} catch (e) {
  reportLoadError('PreLoad', 'level ' + selectedLevel, e);
  selectedLevel = 'tokyo';
}

// Pre-load tree + pedestrian GLB templates so buildCity can use them.
// Skipped only on the procedural-only path (phone on LOW); phones on MED/HIGH
// load the same GLBs as desktop, with reduced textures (assetCache.assetURL).
if (GLB_CONTENT) {
  try {
    window.__dbg && window.__dbg('DBG · loading tree + pedestrian templates…');
    await initAssetCache();
    await Promise.all([loadTreeTemplates(undefined, selectedLevel), loadPedestrianTemplates(), loadCarTemplates(undefined, selectedLevel)]);
    window.__dbg && window.__dbg('DBG · tree + pedestrian templates loaded', '#9f9');
  } catch (e) {
    reportLoadError('PreLoad', 'tree/pedestrian/car templates', e); // procedural fallbacks
  }
} else {
  window.__dbg && window.__dbg('DBG · LOW phone: skipping tree/ped GLB preload');
  // Chicago on phone LOW still gets its GLB vehicles: one mesh a car (the
  // procedural fallback car is ~6 draws, the level's biggest draw cost there)
  if (selectedLevel === 'chicago') {
    try {
      await initAssetCache();
      await loadCarTemplates(undefined, selectedLevel);
    } catch (e) {
      reportLoadError('PreLoad', 'car templates', e); // procedural fallback
    }
  }
}

// Build city
window.__dbg && window.__dbg('DBG · buildCity starting…');
// Everything in the scene before the city is built (lights, sky, barrier)
// survives an in-place restart; everything added after is torn down.
const _sceneBaseline = new Set(scene.children);

// Per-level light / sky / fog. Tokyo's values are whatever boot set up above
// (captured here); other levels override them. All uniform/colour swaps, so
// no new lights or passes on any tier.
const _tokyoBarrier = window.__barrier;
const _TOKYO_LOOK = {
  bg: scene.background.getHex(), fog: scene.fog.color.getHex(), fogDensity: scene.fog.density,
  hemiSky: hemi.color.getHex(), hemiGround: hemi.groundColor.getHex(), hemiI: hemi.intensity,
  sun: sun.color.getHex(), sunI: sun.intensity, rim: rimLight.color.getHex(), rimI: rimLight.intensity,
  amb: ambient.color.getHex(), ambI: ambient.intensity, neonI: _neonLights.map((l) => l.intensity),
  sky: Object.fromEntries(['horizon', 'midCol', 'zenith', 'sunRim'].map((k) => [k, skyMat.uniforms[k].value.toArray()])),
  nebula: skyMat.uniforms.nebula.value, env: scene.environmentIntensity,
  bloom: bloomPass && { threshold: bloomPass.threshold, strength: bloomPass.strength },
  grade: window.__cinePass && {
    mix: window.__cinePass.uniforms.gradeMix.value,
    shadow: window.__cinePass.uniforms.shadowTint.value.toArray(), high: window.__cinePass.uniforms.highTint.value.toArray(),
  },
};
// Chicago: golden hour sliding into dusk, lit like a main event. The light,
// sky, fog, exposure, bloom and grade are written every frame by the look
// layer (look.js: its time-of-day keys are the place to tune them); the
// values here only stand until its first write. What this table still
// decides: no neon, no Tokyo night-sky dressing.
const _CHICAGO_LOOK = {
  bg: 0x9ec3e6, fog: 0xcad8e6, fogDensity: 0.0016,
  hemiSky: 0xdcecff, hemiGround: 0x6b6355, hemiI: Q_HIGH ? 0.55 : (Q_MED ? 0.68 : 0.75),
  sun: 0xfff3e2, sunI: 2.35, rim: 0xb4cdf5, rimI: Q_LOW ? 0.30 : 0.40,
  amb: 0x8a9bb0, ambI: Q_HIGH ? 0.18 : (Q_MED ? 0.30 : 0.42), neonI: _neonLights.map(() => 0),
  sky: { horizon: [0.80, 0.88, 0.96], midCol: [0.50, 0.68, 0.92], zenith: [0.20, 0.42, 0.82], sunRim: [1.0, 0.97, 0.88] },
  // Direction to the sun: elevation ~70 deg, azimuth just south of overhead
  sunOffset: [6, 140, 50],
  nebula: 0.0, env: 0.85,
  grade: { mix: Q_HIGH ? 0.25 : 0.2, shadow: [0.96, 0.98, 1.02], high: [1.04, 1.0, 0.95] },
  // Sunlit white roofs (buses, the Modern Wing) sit near 1.0 at noon: raise
  // the threshold so only real light sources bloom
  bloom: bloomPass && { threshold: 1.05, strength: bloomPass.strength * 0.7 },
};
// Sun position relative to the kaiju (shadow camera follows it). Tokyo's
// low west rake; levels may override (see sunOffset in the looks above)
const _TOKYO_SUN = [-100, 100, 45];
const _sunOffset = new THREE.Vector3(..._TOKYO_SUN);
bindLook({
  renderer, scene, sun, sunOffset: _sunOffset, hemi, ambient, fill: rimLight, sky, hasEnv: Q_HIGH,
  bloom: () => bloomPass, bloomK: bloomPass ? bloomPass.strength / 0.85 : 1, cine: () => window.__cinePass,
});
let _lookLevel = 'tokyo';
function applyLevelLook(level) {
  const changed = level !== _lookLevel;
  if (changed) _applyLevelStatics(level);
  // Every (re)built city: the slide toward dusk starts over, and the look
  // layer gets its top-down map of the new buildings (shadows, contact
  // darkening). The world fades into the horizon inside the ground plane
  // (1600u square centred 200u west of the map)
  resetLookClock();
  setLookLevel(level);
  buildLookMap(world, level === 'chicago' ? { x: world.center.x - 200, z: world.center.z, r0: 520, r1: 775 } : null);
  if (level === 'chicago') sun.position.copy(_sunOffset); // until a kaiju exists to follow
  if (changed && Q_HIGH) _captureEnv();
}
function _applyLevelStatics(level) {
  _lookLevel = level;
  const L = level === 'chicago' ? _CHICAGO_LOOK : _TOKYO_LOOK;
  scene.background.setHex(L.bg);
  scene.fog.color.setHex(L.fog); scene.fog.density = L.fogDensity;
  hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI;
  sun.color.setHex(L.sun); sun.intensity = L.sunI;
  rimLight.color.setHex(L.rim); rimLight.intensity = L.rimI;
  ambient.color.setHex(L.amb); ambient.intensity = L.ambI;
  _neonLights.forEach((l, i) => { l.intensity = L.neonI[i]; });
  // Phones: Chicago's neon is off (intensity 0) but a visible point light
  // still sits in every lit shader (NUM_POINT_LIGHTS) and in per-program
  // light-uniform uploads. Hide them outside Tokyo; the lit programs relink
  // once on a level switch (accepted on phones). A/B, emulated phone MED at
  // 4x CPU: composer CPU p50 17.7 -> 16.9 ms, frame p50 22.5 -> 21.9 ms.
  if (isMobile) _neonLights.forEach((l) => { l.visible = level === 'tokyo'; });
  for (const k of Object.keys(L.sky)) skyMat.uniforms[k].value.fromArray(L.sky[k]);
  skyMat.uniforms.nebula.value = L.nebula;
  _sunOffset.fromArray(L.sunOffset || _TOKYO_SUN);
  // The sky's sun rim sits where the light comes from (Tokyo: its old fixed direction)
  if (L.sunOffset) skyMat.uniforms.sunDir.value.fromArray(L.sunOffset).normalize();
  else skyMat.uniforms.sunDir.value.set(-0.55, 0.12, 0.25).normalize();
  // Until a kaiju exists to follow; Tokyo's boot position otherwise
  if (level !== 'tokyo') sun.position.copy(_sunOffset); else sun.position.set(-90, 60, 40);
  if (bloomPass && L.bloom) { bloomPass.threshold = L.bloom.threshold; bloomPass.strength = L.bloom.strength; }
  const cine = window.__cinePass;
  if (cine && L.grade) {
    cine.uniforms.gradeMix.value = L.grade.mix;
    cine.uniforms.shadowTint.value.fromArray(L.grade.shadow);
    cine.uniforms.highTint.value.fromArray(L.grade.high);
  }
  // The Tokyo backdrop ring/mountains/barrier would stand in Lake Michigan
  for (const o of _horizon) o.visible = level === 'tokyo';
  // Chicago's dome follows the camera (look.js); Tokyo's stays at the origin
  sky.material = level === 'chicago' ? _chiSkyMat : skyMat;
  sky.position.set(0, 0, 0);
  rimLight.position.set(80, 70, -60); // Tokyo's; Chicago's fill sits opposite its sun
  renderer.toneMappingExposure = 1.15; // Tokyo's; Chicago's is written per frame
}

function buildWorldCity() {
  world.crowdHit = null; // a level with festival crowds sets it (Chicago)
  world.festStages = null; // ...and its stages (chicago_fest.js: id, name, x, z, rot, h, group, destroyed)
  world.water = null; // ...and its water surface API (chicago_water.js waterFX)
  world.arena = null; // ...and, built for the wrestling mode, its ring (chicago_arena.js)
  const res = buildCity(scene, world, { lite: isMobile, glb: GLB_CONTENT, level: selectedLevel, mode: _modeId(selectedLevel) });
  const { buildings, grid, bodiesIM, cityAnimators, cityRadius } = res;
  world.buildings = buildings;
  world.buildingGrid = grid;
  world.bodiesIM = bodiesIM;
  world.cityAnimators = cityAnimators || [];
  world.cityRadius = cityRadius;
  world.level = res.level;
  // Play-area rectangle (Tokyo: the old +-330 square clamp) and, for levels
  // with open water, a test ground units must not spawn on.
  world.bounds = res.bounds || { minX: -330, maxX: 330, minZ: -330, maxZ: 330 };
  world.center = res.center || { x: 0, z: 0 };
  world.spawn = res.spawn || { x: 0, z: 0 };
  world.isWater = res.isWater || null;
  bindWater(world);
  world.landPoint = res.landPoint || null;
  world.mapWater = res.mapWater || null;
  window.__barrier = res.barrier || _tokyoBarrier;
  applyLevelLook(res.level);
}
buildWorldCity();
window.__dbg && window.__dbg('DBG · buildCity OK', '#9f9');

/** Building groups with nothing under them once the GLB buildings are placed
 *  (their visuals are per-tile InstancedMeshes; the group only carries the
 *  position gameplay reads) still cost every frame's matrix update and
 *  render traversal: ~4,000 of Chicago's ~9,000 scene objects. Taken out of
 *  the scene graph after each flush; Building.collapse only ever removes its
 *  group from its parent, and nothing adds to one after the flush. */
function _detachEmptyBuildingGroups() {
  const gone = new Set();
  for (const b of world.buildings || []) {
    const g = b.group;
    if (g && g.parent && g.children.length === 0) gone.add(g);
  }
  // One pass per parent (Object3D.remove one by one splices ~4,000 times)
  for (const parent of new Set([...gone].map((g) => g.parent))) {
    parent.children = parent.children.filter((c) => !gone.has(c));
  }
  for (const g of gone) { g.parent = null; g.dispatchEvent({ type: 'removed' }); }
}
// The menu backdrop's first flipbook (once its sheet loads, ~0.3 s into the
// menu) linked on first use: up to a 1 s menu freeze. Its two programs link
// now, before the first backdrop frame, first-use lookups included.
const _flipWarm = new THREE.Group();
for (const m of flipbookWarmMeshes()) _flipWarm.add(m);
_linkAsync(_flipWarm).then(() => _flipWarm.children.forEach((m) => {
  const pr = renderer.properties.get(m.material).currentProgram;
  if (pr) { pr.getUniforms(); pr.getAttributes(); }
}));
// Desktop: about a second after the title menu is up (past its own first
// frames' stall), link the effect set in the background
// (_linkVfxBehindMenu); a START before then skips this.
if (!isMobile) setTimeout(() => { if (!state.kaiju && !_startingGame) _linkVfxBehindMenu(); }, 3700);

// ------------------------- Game state -------------------------
const state = {
  monsterKey: null,
  monsterCfg: null,
  kaiju: null,        // { root, head, tail }
  hp: 100,
  maxHp: 100,
  rage: 0,
  maxRage: 100,
  score: 0,
  wave: 0,
  buildingsDestroyed: 0,
  tanksKilled: 0,
  helisKilled: 0,
  mechsKilled: 0,
  jetsKilled: 0,
  artilleryKilled: 0,
  soldiersKilled: 0,
  bossesKilled: 0,
  carsCrushed: 0,
  elapsedTime: 0,
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.15,
  walkPhase: 0,
  cooldowns: { beam: 0, roar: 0, charge: 0, stomp: 0, melee: 0, ult: 0 },
  mouseDown: false,
  paused: false,
  gameOver: false,
  inWave: false,
  // New mechanics
  combo: 0,
  comboTimer: 0,
  comboMaxTimer: 3.0,
  pickups: [],
  cars: [],
  airstrikes: [],
  artyShells: [],
  boss: null,
  // Improvements
  damageFlash: 0,    // 0..1 fade, > 0 means recently hit
  upgrades: { hpBonus: 0, dmgMult: 1, speedMult: 1, regenRate: 0, comboTimerBonus: 0, rageGainMult: 1 },
  upgradePending: false,
  popups: [],          // floating score numbers
  slowMoUntil: 0,      // performance.now() ms until slow-mo ends
  slowMoScale: 1,
  civilians: [],       // tiny pedestrians fleeing the kaiju
  civiliansStomped: 0,
  // Per-wave destruction objective: smash N buildings during the wave for
  // a bonus. Resets each startWave().
  waveObjective: { goal: 0, current: 0, complete: false },
};
// Pristine copy of the per-run state, used by restartInPlace(). Vector3s
// are reset in place; underscore-prefixed scratch fields that get added
// lazily during play are deleted.
const _STATE_INIT = {};
for (const k of Object.keys(state)) {
  const v = state[k];
  _STATE_INIT[k] = (v && v.isVector3) ? v.clone() : (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
}

// requestPointerLock() returns a Promise in modern browsers and rejects
// (WrongDocumentError, or "user exited lock too recently") when called
// from a non-focused/transitioning document. Swallow those so they don't
// surface as unhandled rejections; older browsers return undefined.
function _requestPointerLock() {
  try {
    const p = renderer.domElement.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* not lockable right now */ }
}

// Player control gate: what updatePlayer and the look handlers may do with
// the kaiju. The defaults are the classic game; a mode that needs the body
// (wrestling: grapples, knockdowns, lock-on, cinematics) writes it through
// ctx.player.control, and _resetSeams() puts the defaults back.
//   external   an outside system owns the root: no input motion, collision,
//              yaw copy, y write, locomotion clips or attacks from here
//   move       input speed multiplier (0 = rooted)
//   melee / powers / ult   input may fire fireMelee / the powers / the ultimate
//   look       mouse, touch and stick look may turn yaw and pitch
//   loco       the per-frame idle / walk / run clip pick runs
//   faceYaw    rad or null: state.yaw eases to it at faceRate (1/s) and look
//              input no longer turns yaw (lock-on)
//   moveYaw    rad or null: basis for the movement input instead of state.yaw
//   damageMult scales wave-scaled damage taken (shells, artillery, air strikes)
const _PCTL_DEFAULTS = { external: false, move: 1, melee: true, powers: true, ult: true, look: true, loco: true, faceYaw: null, faceRate: 10, moveYaw: null, damageMult: 1 };
const _pctl = { ..._PCTL_DEFAULTS };

const keys = {};
// Press / release edges for the frame in progress (cleared at the end of
// tick): keyboard codes, 'Mouse0'..'Mouse2' and codes bound to touch buttons.
const _keyHit = {}, _keyUp = {}, _edgeCodes = [];
function _setKey(code, down) {
  if (down === !!keys[code]) return; // key repeat
  keys[code] = down;
  (down ? _keyHit : _keyUp)[code] = true;
  _edgeCodes.push(code);
}
window.addEventListener('keydown', (e) => {
  _setKey(e.code, true);
  if (e.code === 'Escape') togglePause();
  // Tab is a gameplay key in a run (free for a mode to bind), not focus traversal
  if (e.code === 'Tab' && state.kaiju && !state.gameOver && !state.paused) e.preventDefault();
});
window.addEventListener('keyup', (e) => { _setKey(e.code, false); });

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) state.mouseDown = true;
  if (e.button < 3) _setKey('Mouse' + e.button, true);
  // (middle button: a gameplay button outside the classic mode, not autoscroll)
  if (e.button === 1 && state.kaiju && !state.gameOver && _mode !== MODES.waves) e.preventDefault();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) state.mouseDown = false; if (e.button < 3) _setKey('Mouse' + e.button, false); });
// The right button is a gameplay button outside the classic mode: no browser menu mid-match
window.addEventListener('contextmenu', (e) => { if (state.kaiju && !state.gameOver && _mode !== MODES.waves) e.preventDefault(); });
window.addEventListener('wheel', (e) => { _in.wheel += e.deltaY; }, { passive: true });

renderer.domElement.addEventListener('click', () => {
  if (!state.gameOver && state.kaiju) _requestPointerLock();
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement && _pctl.look) {
    if (_pctl.faceYaw === null) state.yaw -= e.movementX * 0.0024;
    state.pitch -= e.movementY * 0.0018;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.6, 0.4);
  }
});

function fitRenderer() {
  // Prefer visualViewport on iOS Safari -- it tracks the actually-visible area
  // (excludes the dynamic URL bar / keyboard) and updates after rotation.
  const vv = window.visualViewport;
  const w = vv ? vv.width  : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(_curPR);
  renderer.setSize(w, h, true); // updateStyle=true: also sets canvas style.width/height
  if (composer) {
    composer.setPixelRatio(_curPR);
    composer.setSize(w, h);
    if (bloomPass) bloomPass.setSize(w * RP.bloomScale, h * RP.bloomScale);
  }
  updateOrientationClass();
}
fitRenderer();
window.addEventListener('resize', fitRenderer);
window.addEventListener('orientationchange', () => {
  // iOS Safari fires orientationchange before layout settles; re-fit a few times.
  fitRenderer();
  setTimeout(fitRenderer, 120);
  setTimeout(fitRenderer, 400);
  setTimeout(fitRenderer, 900);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitRenderer);
  window.visualViewport.addEventListener('scroll', fitRenderer);
}
// iOS sometimes leaves the page scrolled after rotation -- snap back to top
window.addEventListener('scroll', () => window.scrollTo(0, 0), { passive: true });

// ------------------------- Gamepad (Xbox controller) -------------------------
const padInput = {
  moveX: 0, moveZ: 0,
  lookX: 0, lookY: 0,
  attack: false, sprint: false,
  // edge-trigger latches: button-X-pressed-this-frame
  pressed: { beam: false, roar: false, charge: false, stomp: false, ult: false, pause: false },
  prevDown: {},
  // Raw state of every button for modes with their own bindings (ctx.input.pad):
  // held, pressed-this-frame, and the analog triggers
  connected: false, down: [], hit: [], axes: [0, 0, 0, 0], lt: 0, rt: 0,
};
// Buttons a mode has taken over from their classic job (6 = LT sprint, 8 = Back pause)
const _padReserved = new Set();

function readGamepad() {
  if (!navigator.getGamepads) return false;
  const pads = navigator.getGamepads();
  let pad = null;
  for (const p of pads) { if (p && p.connected) { pad = p; break; } }
  if (!pad) {
    padInput.moveX = padInput.moveZ = padInput.lookX = padInput.lookY = 0;
    padInput.attack = padInput.sprint = false;
    for (const k of Object.keys(padInput.pressed)) padInput.pressed[k] = false;
    if (padInput.connected) {
      padInput.connected = false; padInput.lt = padInput.rt = 0;
      padInput.down.length = 0; padInput.hit.length = 0; padInput.axes.fill(0);
    }
    return false;
  }
  // Standard mapping (Xbox / PS layout):
  //  axes 0,1 = left stick; axes 2,3 = right stick
  //  buttons 0=A,1=B,2=X,3=Y, 4=LB,5=RB, 6=LT,7=RT, 8=Back,9=Start
  const dz = (v) => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / (1 - 0.18);
  padInput.moveX =  dz(pad.axes[0] || 0);
  padInput.moveZ = -dz(pad.axes[1] || 0); // up on stick = forward
  padInput.lookX =  dz(pad.axes[2] || 0);
  padInput.lookY =  dz(pad.axes[3] || 0);

  const isDown = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const press = (i) => isDown(i) && !padInput.prevDown[i];
  // Continuous
  // (a button a mode has reserved - ctx.input.pad.reserve - skips its job here)
  padInput.attack = !_padReserved.has(0) && isDown(0); // A held = melee
  padInput.sprint = isDown(4) || (!_padReserved.has(6) && (pad.buttons[6]?.value || 0) > 0.4); // LB or LT
  // Edge-triggered: only fire once per press
  padInput.pressed.beam   = !_padReserved.has(2) && press(2); // X
  padInput.pressed.roar   = !_padReserved.has(1) && press(1); // B
  padInput.pressed.charge = !_padReserved.has(3) && press(3); // Y
  padInput.pressed.stomp  = !_padReserved.has(5) && press(5); // RB
  padInput.pressed.ult    = !_padReserved.has(7) && (press(7) || ((pad.buttons[7]?.value || 0) > 0.6 && !padInput.prevDown[7])); // RT
  padInput.pressed.pause  = press(9) || (!_padReserved.has(8) && press(8)); // Start / Back

  padInput.connected = true;
  padInput.lt = pad.buttons[6]?.value || 0;
  padInput.rt = pad.buttons[7]?.value || 0;
  for (let i = 0; i < 4; i++) padInput.axes[i] = dz(pad.axes[i] || 0);
  // Cache button-down state for edge-detection next frame
  for (let i = 0; i < pad.buttons.length; i++) {
    const d = isDown(i);
    padInput.hit[i] = d && !padInput.prevDown[i];
    padInput.down[i] = d;
    padInput.prevDown[i] = d;
  }
  return true;
}

window.addEventListener('gamepadconnected', (e) => {
  toastMini('GAMEPAD CONNECTED · ' + (e.gamepad?.id?.slice(0, 24) || ''), 'good');
});
window.addEventListener('gamepaddisconnected', () => {
  toastMini('GAMEPAD DISCONNECTED', 'bad');
});

// ------------------------- Menu navigation (gamepad + keyboard) -------------------------
// pollMenuGamepad() fires whenever the title menu OR the upgrade modal is
// visible. It tracks a focused index (cards + START on the menu, cards
// only on the upgrade modal), navigates with D-pad / left-stick, confirms
// with A, and launches with Start.
const _menuPad = { focused: -1, cool: 0, prevDown: {}, prevAxis: 0 };
function _menuVisible() {
  return !document.getElementById('menu').classList.contains('hidden');
}
function _upgradeVisible() {
  return state.upgradePending === true;
}
function _setFocus(items, idx) {
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('pad-focus', i === idx);
  }
}
// Title menu rows, top to bottom: level cards, monster cards, START.
function _menuRows() {
  return [
    Array.from(document.querySelectorAll('#levelCards .level-card')),
    Array.from(document.querySelectorAll('#monsterCards .monster-card')),
    [document.getElementById('startBtn')],
  ].filter((r) => r.length && r[0]);
}
function _menuTargets() {
  if (_upgradeVisible()) return Array.from(document.querySelectorAll('#upgrade-cards .ucard'));
  if (_menuVisible()) return _menuRows().flat();
  return [];
}
/** Jump the menu focus one row down (+1) or up (-1): first item of that row,
 *  or the selected card if the row has one. */
function navigateMenuRow(dir) {
  const rows = _menuRows();
  const flat = rows.flat();
  let r = 0;
  for (let acc = 0; r < rows.length; r++) {
    if (_menuPad.focused < acc + rows[r].length) break;
    acc += rows[r].length;
  }
  if (_menuPad.focused < 0) r = dir > 0 ? -1 : rows.length;
  const nr = Math.max(0, Math.min(rows.length - 1, r + dir));
  const row = rows[nr];
  const sel = row.find((el) => el.classList.contains('selected'));
  _menuPad.focused = flat.indexOf(sel || row[0]);
  _setFocus(flat, _menuPad.focused);
}
function navigateMenu(dir) {
  const items = _menuTargets();
  if (!items.length) return;
  let f = _menuPad.focused;
  if (f < 0) f = 0;
  else f = Math.max(0, Math.min(items.length - 1, f + dir));
  _menuPad.focused = f;
  _setFocus(items, f);
}
function confirmMenu() {
  const items = _menuTargets();
  if (!items.length) return;
  const f = _menuPad.focused < 0 ? 0 : _menuPad.focused;
  const target = items[f];
  if (!target) return;
  // The startBtn is disabled until a monster is picked; calling click()
  // on a disabled button does nothing, which is the right behaviour.
  if (target.disabled) return;
  target.click();
}
function pollMenuGamepad(dt) {
  if (!_menuVisible() && !_upgradeVisible()) return;
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let pad = null;
  for (const p of pads) { if (p && p.connected) { pad = p; break; } }
  if (!pad) {
    // Still keep visible focus from keyboard navigation
    if (_menuPad.focused >= 0) _setFocus(_menuTargets(), _menuPad.focused);
    return;
  }
  _menuPad.cool = Math.max(0, _menuPad.cool - dt);
  const ax = pad.axes[0] || 0;
  const dpadL = !!(pad.buttons[14] && pad.buttons[14].pressed);
  const dpadR = !!(pad.buttons[15] && pad.buttons[15].pressed);
  const dpadU = !!(pad.buttons[12] && pad.buttons[12].pressed);
  const dpadD = !!(pad.buttons[13] && pad.buttons[13].pressed);
  const aPressed = !!(pad.buttons[0] && pad.buttons[0].pressed) && !_menuPad.prevDown[0];
  const startPressed = !!(pad.buttons[9] && pad.buttons[9].pressed) && !_menuPad.prevDown[9];

  // Horizontal nav (left-stick + D-pad). Cooldown so a held direction
  // doesn't sprint through items.
  const wantLeft  = (ax < -0.55 || dpadL);
  const wantRight = (ax > 0.55 || dpadR);
  if (_menuPad.cool === 0) {
    if (wantLeft)  { navigateMenu(-1); _menuPad.cool = 0.20; }
    else if (wantRight) { navigateMenu(+1); _menuPad.cool = 0.20; }
  }
  // On the title menu only, vertical jump between rows (levels, monsters, start)
  if (_menuVisible() && !_upgradeVisible()) {
    const ay = pad.axes[1] || 0;
    if (_menuPad.cool === 0 && (dpadD || ay > 0.6)) {
      navigateMenuRow(+1); _menuPad.cool = 0.20;
    } else if (_menuPad.cool === 0 && (dpadU || ay < -0.6)) {
      navigateMenuRow(-1); _menuPad.cool = 0.20;
    }
  }
  if (aPressed) confirmMenu();
  if (startPressed) {
    // Start button shortcut: if a monster is picked, jump straight in.
    const start = document.getElementById('startBtn');
    if (start && !start.disabled) start.click();
  }
  // Cache button state for next frame's edge detection
  for (const i of [0, 9, 12, 13, 14, 15]) {
    _menuPad.prevDown[i] = !!(pad.buttons[i] && pad.buttons[i].pressed);
  }
}

// Keyboard fallback: arrow keys + Enter while the menu / upgrade modal are open.
window.addEventListener('keydown', (e) => {
  if (!_menuVisible() && !_upgradeVisible()) return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateMenu(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); navigateMenu(+1); }
  else if (e.key === 'ArrowDown' && _menuVisible() && !_upgradeVisible()) {
    e.preventDefault();
    navigateMenuRow(+1);
  } else if (e.key === 'ArrowUp' && _menuVisible() && !_upgradeVisible()) {
    e.preventDefault();
    navigateMenuRow(-1);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    confirmMenu();
  }
});

// ------------------------- Touch / mobile input -------------------------
const touchInput = {
  moveX: 0, moveZ: 0,    // -1..1 from joystick
  attackHeld: false,
  sprint: false,
  // active pointer ids for joystick / camera
  joyId: null, joyStartX: 0, joyStartY: 0, joyCx: 0, joyCy: 0,
  lookId: null, lookLastX: 0, lookLastY: 0,
};

const joystickEl = document.getElementById('joystick');
const joyZone = document.getElementById('joy-zone');
const knobEl = joystickEl ? joystickEl.querySelector('.knob') : null;
const attackBtn = document.getElementById('attack-btn');
const sprintBtn = document.getElementById('sprint-btn');
const pauseBtn = document.getElementById('pause-btn');

function setKnob(dx, dy) {
  if (!knobEl) return;
  knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
function resetJoystick() {
  touchInput.moveX = 0; touchInput.moveZ = 0;
  touchInput.joyId = null;
  setKnob(0, 0);
  if (joystickEl) { joystickEl.style.transform = ''; joystickEl.classList.remove('active'); }
}

// Floating joystick: a touch anywhere in the lower-left zone moves the base
// under the thumb (kept fully on screen); it returns to its rest spot on release.
if (joystickEl && joyZone) {
  let joyMax = 50;
  const handleJoyStart = (id, cx, cy) => {
    joystickEl.style.transform = '';
    const r = joystickEl.getBoundingClientRect();
    const rad = r.width / 2;
    joyMax = rad * 0.6;
    const x = Math.max(rad + 8, Math.min(window.innerWidth / 2, cx));
    const y = Math.max(rad + 8, Math.min(window.innerHeight - rad - 8, cy));
    joystickEl.style.transform = `translate(${x - (r.left + rad)}px, ${y - (r.top + rad)}px)`;
    joystickEl.classList.add('active');
    touchInput.joyCx = x;
    touchInput.joyCy = y;
    touchInput.joyId = id;
    handleJoyMove(cx, cy);
  };
  const handleJoyMove = (cx, cy) => {
    const dx = cx - touchInput.joyCx;
    const dy = cy - touchInput.joyCy;
    const max = joyMax;
    const len = Math.hypot(dx, dy);
    const nx = len > max ? dx * max / len : dx;
    const ny = len > max ? dy * max / len : dy;
    setKnob(nx, ny);
    touchInput.moveX = nx / max;
    touchInput.moveZ = -ny / max; // up on screen = forward
  };
  joyZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (touchInput.joyId !== null) return;
    const t = e.changedTouches[0];
    handleJoyStart(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  joyZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touchInput.joyId) {
        handleJoyMove(t.clientX, t.clientY);
      }
    }
  }, { passive: false });
  const endJoy = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchInput.joyId) resetJoystick();
    }
  };
  joyZone.addEventListener('touchend', endJoy);
  joyZone.addEventListener('touchcancel', endJoy);
}

if (attackBtn) {
  attackBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); touchInput.attackHeld = true; _setKey('TouchAttack', true);
  }, { passive: false });
  const endAtk = (e) => { e.preventDefault(); touchInput.attackHeld = false; _setKey('TouchAttack', false); };
  attackBtn.addEventListener('touchend', endAtk);
  attackBtn.addEventListener('touchcancel', endAtk);
}

if (sprintBtn) {
  sprintBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchInput.sprint = !touchInput.sprint;
    sprintBtn.classList.toggle('on', touchInput.sprint);
  }, { passive: false });
}

// HUD menu button (touch and mouse) + the pause sheet's buttons
if (pauseBtn) {
  pauseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); }, { passive: false });
  pauseBtn.addEventListener('click', () => togglePause());
}
document.getElementById('resume-btn')?.addEventListener('click', () => {
  togglePause(false);
  if (!touchUI && state.kaiju) _requestPointerLock();
});
document.getElementById('quit-btn')?.addEventListener('click', () => {
  if (!state.kaiju || state.gameOver) return;
  state.paused = false;
  audio.stopMusic();
  _hideRunHUD();
  restartInPlace();
});

// Camera drag: any touch outside the controls (and the joystick zone) looks
const _touchControls = []; // extra control elements a mode registered (ctx.input.registerTouchControl)
function isOnControl(target) {
  if (!target || !target.closest) return false;
  for (let i = 0; i < _touchControls.length; i++) if (_touchControls[i].contains(target)) return true;
  return !!target.closest('#joy-zone, #attack-btn, #sprint-btn, #pause-btn, #powers, #menu, #gameover, #pause-menu, #upgrade-modal');
}
window.addEventListener('touchstart', (e) => {
  if (!touchUI || state.gameOver || !state.kaiju) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touchInput.joyId) continue;
    if (isOnControl(t.target)) continue;
    if (touchInput.lookId !== null) continue;
    touchInput.lookId = t.identifier;
    touchInput.lookLastX = t.clientX;
    touchInput.lookLastY = t.clientY;
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!touchUI) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== touchInput.lookId) continue;
    const dx = t.clientX - touchInput.lookLastX;
    const dy = t.clientY - touchInput.lookLastY;
    touchInput.lookLastX = t.clientX;
    touchInput.lookLastY = t.clientY;
    if (!_pctl.look) continue;
    if (_pctl.faceYaw === null) state.yaw -= dx * 0.005;
    state.pitch -= dy * 0.004;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.6, 0.4);
  }
}, { passive: true });
const endLook = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touchInput.lookId) touchInput.lookId = null;
  }
};
window.addEventListener('touchend', endLook);
window.addEventListener('touchcancel', endLook);

// ------------------------- Level select UI -------------------------
// Two cards above the monsters. Picking one only records the choice; the
// city is swapped when the run starts (_startGameInner -> _switchLevel),
// behind the loading screen.
{
  const levelDiv = document.getElementById('levelCards');
  const title = document.getElementById('levelTitle');
  const showLevel = (lv) => {
    if (levelDiv) levelDiv.querySelectorAll('.level-card').forEach((c) => c.classList.toggle('selected', c.dataset.level === lv));
    if (title) title.innerHTML = `<span class="jp-line">${LEVELS[lv].h2jp}</span>${LEVELS[lv].h2}`;
  };
  if (levelDiv) {
    for (const lv of Object.keys(LEVELS)) {
      const L = LEVELS[lv];
      const card = document.createElement('div');
      card.className = 'level-card';
      card.dataset.level = lv;
      card.innerHTML = `<b><span class="jp">${L.jp}</span>${L.name}</b><span>${L.tag}</span>`;
      card.addEventListener('click', () => { _setLevel(lv); showLevel(lv); });
      levelDiv.appendChild(card);
    }
  }
  showLevel(selectedLevel);
}

// Slot icons: 32x32 filled glyphs, drawn for a distinct silhouette at
// ~40 px. Names differ per monster, the slot meaning doesn't: snout blast,
// fanged roar, horned charge, clawed stomp, atomic ultimate. Shapes fill
// with the slot's accent (currentColor) and a thin dark outline; .d = dark
// detail, .t = teeth, .s = bold accent stroke, .z / .o = dark strokes over the fill.
const POWER_ICONS = {
  beam: '<path d="M19.5 14.4 L31.5 8.6 L31.5 23.4 L19.5 17.6 Z"/>'
    + '<path class="z" d="M20.4 16 L22.6 14.4 L24.4 17.6 L26.6 13.8 L28.6 17.4 L31 14.8"/>'
    + '<path d="M0.6 12.5 L3.6 7.8 L8.5 5.4 L10.5 3.6 L13 5.6 L20.5 7.8 L23 10.2 L9.5 15.3 L21 21.2 L19.8 23.6 L9 23.6 L3.5 22.6 L0.6 19 Z"/>'
    + '<path class="t" d="M11.2 14.3 L12.2 12.2 L13.4 13.4 Z M14.2 12.9 L15.2 10.8 L16.4 12 Z M17.2 11.6 L18.2 9.7 L19.2 10.8 Z M19.9 10.6 L20.8 8.9 L21.7 9.8 Z M11.4 16.2 L12.6 18.3 L13.4 16.9 Z M14.4 17.8 L15.6 19.8 L16.4 18.5 Z M17.4 19.3 L18.6 21.3 L19.4 20 Z"/>'
    + '<path class="d" d="M8.6 7.4 L12.6 7.2 L11 8.8 Z"/><circle class="d" cx="20.4" cy="8.8" r="0.7"/>'
    + '<path d="M2.6 7.4 L2.2 3.6 L5 5.6 Z M5.8 5.6 L6.2 1.6 L8.4 4.6 Z"/>',
  roar: '<path class="s" d="M4.5 10 Q1.2 16 4.5 22 M27.5 10 Q30.8 16 27.5 22"/>'
    + '<path d="M7.5 9.5 Q16 2.5 24.5 9.5 Q27 16 24.5 22.5 Q16 29.5 7.5 22.5 Q5 16 7.5 9.5 Z"/>'
    + '<path class="d" d="M10 11.5 Q16 7.5 22 11.5 Q23.6 16 22 20.5 Q16 24.5 10 20.5 Q8.4 16 10 11.5 Z"/>'
    + '<path d="M10.6 11.2 L12.4 16.4 L14.2 10.2 Z M17.8 10.2 L19.6 16.4 L21.4 11.2 Z M11 20.8 L13 16.8 L14.8 21.6 Z M17.2 21.6 L19 16.8 L21 20.8 Z"/>',
  charge: '<path class="s" d="M1.5 13.5 H7.5 M1 18 H7 M2.5 22.5 H8.5"/>'
    + '<path d="M10 13 Q16 9.5 23 12 Q28.5 14 29.5 19.5 Q26 23.5 19 23.5 Q12 23.5 10 19.5 Z"/>'
    + '<path d="M24 13.8 Q27.5 6 31.2 3.5 Q31 10.5 27.6 16 Z"/>'
    + '<path d="M18.5 11.6 Q20 7 23 5.8 Q22.8 9.5 21.8 12.2 Z"/>'
    + '<path d="M11.6 12 L12.4 7.6 L15.4 10.6 Z"/>'
    + '<circle class="d" cx="18.8" cy="16" r="1.6"/><circle class="d" cx="27.2" cy="20" r="0.9"/>',
  stomp: '<ellipse class="s" cx="16" cy="26.5" rx="13.5" ry="3.2"/>'
    + '<path class="s" d="M3.5 22.5 L6 24 L5 26 M28.5 22.5 L26 24 L27 26"/>'
    + '<path d="M9.5 18.5 Q16 13.5 22.5 18.5 Q24 24.5 16 25.5 Q8 24.5 9.5 18.5 Z"/>'
    + '<ellipse cx="9" cy="12.8" rx="2.6" ry="3.2"/><ellipse cx="16" cy="10.2" rx="2.7" ry="3.4"/><ellipse cx="23" cy="12.8" rx="2.6" ry="3.2"/>'
    + '<path d="M7.4 10 L8.6 5.6 L10.4 9.8 Z M14.4 7.2 L16 2.4 L17.6 7.2 Z M21.6 9.8 L23.4 5.6 L24.6 10 Z"/>',
  ult: '<path d="M16 0.8 L18.6 9 L25.8 4.4 L22.4 12.2 L31 13.2 L23.8 17.6 L29.6 24.4 L21.4 22.6 L21 31 L16 24.4 L11 31 L10.6 22.6 L2.4 24.4 L8.2 17.6 L1 13.2 L9.6 12.2 L6.2 4.4 L13.4 9 Z"/>'
    + '<ellipse class="o" cx="16" cy="16" rx="9" ry="3.3"/><ellipse class="o" cx="16" cy="16" rx="9" ry="3.3" transform="rotate(60 16 16)"/><ellipse class="o" cx="16" cy="16" rx="9" ry="3.3" transform="rotate(-60 16 16)"/>'
    + '<circle class="d" cx="16" cy="16" r="2.6"/>',
};

// ------------------------- Monster select UI -------------------------
// Build cards immediately with the emoji visible, THEN swap in rendered 3D
// portraits async so the title screen never appears blank if the preview
// renderer is slow (e.g. iPhone) or fails.
const cardsDiv = document.getElementById('monsterCards');
const _cardEls = {};
for (const key of Object.keys(MONSTERS)) {
  const m = MONSTERS[key];
  const card = document.createElement('div');
  card.className = 'monster-card';
  card.dataset.key = key;
  card.innerHTML = `
    <div class="preview" style="background:${m.bg}"><span class="preview-emoji">${m.emoji}</span></div>
    <h3>${m.name}</h3>
    <p>${m.description}</p>
    <div class="stat">HP ${m.stats.hp} · SPD ${m.stats.speed} · MELEE ${m.stats.melee}</div>
    <div class="stat pw-stat beam"><svg viewBox="0 0 32 32" aria-hidden="true">${POWER_ICONS.beam}</svg>${m.beam.name}</div>
    <div class="stat pw-stat roar"><svg viewBox="0 0 32 32" aria-hidden="true">${POWER_ICONS.roar}</svg>${m.roar.name}</div>
    <div class="stat pw-stat charge"><svg viewBox="0 0 32 32" aria-hidden="true">${POWER_ICONS.charge}</svg>${m.charge.name}</div>
  `;
  card.addEventListener('click', () => {
    document.querySelectorAll('.monster-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    state.monsterKey = key;
    document.getElementById('startBtn').disabled = false;
  });
  cardsDiv.appendChild(card);
  _cardEls[key] = card;
}
console.info('[KAIJU HAVOC] menu cards built:', cardsDiv.children.length, 'isMobile:', isMobile);
window.__dbg && window.__dbg('DBG · cards built: ' + cardsDiv.children.length + ' · isMobile=' + isMobile, '#9f9');
// Portrait priority chain:
//   1. Static image at assets/<key>.{png,jpg,jpeg,webp}  (artist-supplied; wins)
//   2. 3D-rendered preview from buildKaiju()             (procedural fallback)
//   3. Emoji shown in the .preview slot                  (always present)
const _staticCovered = new Set();
function _setCardImage(key, url) {
  const card = _cardEls[key];
  if (!card) return;
  const m = MONSTERS[key];
  const prev = card.querySelector('.preview');
  if (!prev) return;
  prev.style.background = `url(${url}) center/contain no-repeat, ${m.bg}`;
  const emo = prev.querySelector('.preview-emoji');
  if (emo) emo.style.display = 'none';
}
function _tryStaticImage(key) {
  return new Promise((resolve) => {
    // One file per monster, one format (rendered by tools/portraits.html): a
    // single request, no probing of other extensions (each miss was a 404)
    const url = `assets/${key}.webp`;
    const img = new Image();
    img.onload = () => { _setCardImage(key, url); _staticCovered.add(key); resolve(true); };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
const _renderPreviewsLazy = () => {
  try {
    const previews = renderMonsterPreviews(isMobile ? 160 : 220);
    for (const key of Object.keys(previews)) {
      if (_staticCovered.has(key)) continue; // artist asset already loaded
      if (previews[key]) _setCardImage(key, previews[key]);
    }
  } catch (e) { console.warn('preview render failed; keeping emoji fallback', e); }
};
// Kick off both. Static images are probed in parallel; 3D fallback runs once
// the menu has painted (idleCallback / setTimeout). Whichever finishes first
// wins per monster, with static taking precedence if both complete.
Promise.all(Object.keys(MONSTERS).map(_tryStaticImage)).then((results) => {
  // If every monster got a static image, skip the 3D render entirely.
  if (results.every(Boolean)) return;
  if (typeof requestIdleCallback === 'function') requestIdleCallback(_renderPreviewsLazy, { timeout: 500 });
  else setTimeout(_renderPreviewsLazy, 50);
});
document.getElementById('startBtn').addEventListener('click', () => {
  if (!state.monsterKey) return;
  audio.init();
  audio.resume();
  startGame(state.monsterKey);
});

// Render existing high score on the menu
{
  const hs = getHighScore();
  const el = document.getElementById('highscore-display');
  if (el) el.textContent = hs > 0 ? `BEST · ${hs.toLocaleString()}` : 'NEW CITY · NO RECORDS YET';
}

// Resume audio after iOS suspends it on tab background
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.resume(); });
window.addEventListener('touchstart', () => audio.resume(), { passive: true, once: false });
window.addEventListener('mousedown', () => audio.resume());

// ------------------------- Mobile data warning -------------------------
let _mobileDataAccepted = false;
function _showMobileDataWarning() {
  return new Promise((resolve) => {
    const warn = document.getElementById('mobile-data-warn');
    if (!warn) { resolve(true); return; }
    // Check if cache is already warm (assets previously downloaded)
    const cs = getCacheStats();
    if (cs.enabled && cs.hits > 0) { resolve(true); return; }
    // Show the download size for this device/tier
    const sizeEl = document.getElementById('data-warn-size');
    // Measured first-run downloads per tier, cold cache in Chrome (everything
    // the page fetches up to the first minute of play, served uncompressed; the
    // trailer video only streams if played). Re-measure when assets change.
    // 2026-11, after tools/optimize_assets.mjs: desktop Chicago 64.7 / Tokyo 73.9,
    // phone MED 37.0 / 28.5, phone LOW 31.7 / 10.3 MB.
    const chi = selectedLevel === 'chicago';
    if (sizeEl) sizeEl.textContent = isMobile ? (GLB_CONTENT ? (chi ? '~37 MB' : '~29 MB') : (chi ? '~32 MB' : '~10 MB')) : (chi ? '~65 MB' : '~74 MB');
    warn.classList.remove('hidden');
    warn.style.display = 'flex';
    const okBtn = document.getElementById('data-warn-ok');
    const cancelBtn = document.getElementById('data-warn-cancel');
    function cleanup() {
      warn.classList.add('hidden');
      warn.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }
    function onOk() { cleanup(); _mobileDataAccepted = true; resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ------------------------- Start game -------------------------
let _startingGame = false; // guard against double-start during async load
let _worldTemplatesLoaded = false; // building/debris/enemy GLBs parsed (desktop)
const _bldgLevelsLoaded = new Set(); // levels whose building GLB templates are parsed

// The parsed kaiju GLB for the current/last run, keyed by monster. Picking
// the same kaiju again after "UNLEASH AGAIN" reuses it (no re-parse, no
// re-upload); picking a different one disposes this one first. Each
// loadKaijuModel() call parses its own copy, so this run is the sole
// owner of these resources: nothing else shares them, which is why it's
// correct to dispose them here even though normalizeGLTFMaterials tags
// the geometry userData.template.
let _kaijuCache = null; // { key, glb }
// The rival kaiju of a mode that fields one (wrestling), under the same
// policy: its own parsed copy (never the player's instance), kept across
// restarts while the same rival is drawn, disposed when another is.
let _rivalCache = null; // { key, cfg, glb }
function _disposeKaijuGLB(glb) {
  if (!glb) return;
  glb.mixer.stopAllAction();
  glb.mixer.uncacheRoot(glb.root);
  if (glb.root.parent) glb.root.parent.remove(glb.root);
  const texKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'];
  const seen = new Set();
  glb.root.traverse((n) => {
    if (n.geometry && !seen.has(n.geometry)) { seen.add(n.geometry); n.geometry.dispose(); }
    if (n.skeleton && !seen.has(n.skeleton)) { seen.add(n.skeleton); n.skeleton.dispose(); }
    const mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of texKeys) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      m.dispose();
    }
  });
}

// Shader prewarm. A program links on its first draw (~110-200 ms each on
// ANGLE/D3D11, effectively serial in the GPU process even with
// KHR_parallel_shader_compile), and while compileAsync batches are pending,
// any synchronous first-use link (and every readiness poll) waits behind
// them. So the links happen where a wait is acceptable, against the target
// they're really drawn into:
//  - START, behind the loading screen: the kaiju, one of each enemy and the
//    whole scene (GLB buildings just flushed in), awaited in full, then one
//    warm frame links the shadow-depth variants with nothing else queued;
//  - the effects: desktop, behind the idle title menu, two programs in
//    flight at a time (_linkVfxBehindMenu); phones all at once from the
//    first gameplay frame, never waited on (_queueVfxLinks); whatever a
//    desktop START leaves unlinked, one builder at a time after the first
//    frames (_linkVfxInSlices).
// Staged throwaways are dropped without disposing their materials, which
// would release the programs again.

/** renderer.compileAsync(root) against the live scene's lights, with the
 *  render target the scene is drawn into bound (with the post composer: its
 *  linear, untonemapped read buffer; tone mapping and output colour space are
 *  part of a program's key). Resolves when every program is linked. */
function _linkAsync(root, target = composer ? composer.readBuffer : null, wait = true) {
  const lightsFrom = root === scene ? null : scene;
  // The programs these will draw with (compile() skips Mesh.onBeforeRender)
  root.traverse((o) => { for (const m of [].concat(o.material || [])) _prepMaterial(m, o.geometry); });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  let p;
  try {
    // wait=false: compile() only; the links finish in the GPU process, unpolled
    p = wait && renderer.compileAsync ? renderer.compileAsync(root, camera, lightsFrom)
      : Promise.resolve(renderer.compile(root, camera, lightsFrom));
  } catch (e) {
    p = Promise.reject(e);
  } finally {
    renderer.setRenderTarget(prev);
  }
  return p.catch((e) => warnOnce('prewarm|link', '[prewarm] shader compile failed:', e && e.message));
}

/** Shadow-depth stand-ins: the shadow pass draws every caster with a shared
 *  MeshDepthMaterial carrying the caster's side (flipped), map/alphaTest and
 *  its instancing/skinning, and compile() never builds those programs. One
 *  proxy per distinct combination under roots, so _linkAsync (with a render
 *  target bound, as the shadow map is) links them ahead of the shadow pass. */
const _SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
function _depthStandIns(roots) {
  const g = new THREE.Group(), seen = new Set();
  for (const r of roots) {
    r.traverse((o) => {
      const m = o.material;
      if (!o.isMesh || !o.castShadow || !m || Array.isArray(m)) return;
      const side = m.shadowSide != null ? m.shadowSide : _SHADOW_SIDE[m.side];
      const key = [o.isInstancedMesh, o.isSkinnedMesh, !!o.morphTargetInfluences, side, !!m.map, m.alphaTest > 0, !!m.alphaMap,
        !!(m.displacementMap && m.displacementScale), o.receiveShadow, o.geometry.attributes.uv ? 1 : 0].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      d.side = side; d.map = m.map; d.alphaTest = m.alphaTest; d.alphaMap = m.alphaMap;
      d.displacementMap = m.displacementMap; d.displacementScale = m.displacementScale; d.displacementBias = m.displacementBias;
      let px;
      if (o.isInstancedMesh) px = new THREE.InstancedMesh(o.geometry, d, 1);
      else if (o.isSkinnedMesh) { px = new THREE.SkinnedMesh(o.geometry, d); px.bind(o.skeleton, o.bindMatrix); }
      else px = new THREE.Mesh(o.geometry, d);
      px.morphTargetInfluences = o.morphTargetInfluences;
      px.receiveShadow = o.receiveShadow;
      px.frustumCulled = false;
      g.add(px);
    });
  }
  return g;
}

// Effects the powers and smashing fire first, linked first
const _VFX_FIRST = ['explosion', 'sparks', 'dustBurst', 'smokePuff', 'hitPulse', 'beam', 'beamImpact', 'soundRings',
  'shockwave', 'atomicDome', 'breathCone', 'smokeColumn', 'muzzleFlash', 'tailSweep', 'wingSlash', 'chainLightning'];
/** One Group per VFX builder (most used first), staged with a stub world. */
function _stageVfx() {
  const groups = [];
  const P = new THREE.Vector3(0, 2, 0), D = new THREE.Vector3(0, 0, 1), B = new THREE.Vector3(0, 2, 10);
  const all = listBuilders();
  for (const name of [..._VFX_FIRST.filter((n) => all.includes(n)), ...all.filter((n) => !_VFX_FIRST.includes(n))]) {
    const stage = new THREE.Group();
    const stubWorld = Object.create(world);
    stubWorld.scene = stage; stubWorld.effects = []; stubWorld.shells = []; stubWorld.debris = [];
    try {
      vfx.spawn(name, { world: stubWorld, pos: P.clone(), origin: P.clone(), dir: D.clone(), length: 20,
        color: 0xffaa33, glowColor: 0xffffff, a: P.clone(), b: B.clone(), life: 0.5, segs: 6, radius: 10,
        count: 2, fromPos: P.clone(), toPos: B.clone(), args: [] });
    } catch (e) {
      // Builder needs a fuller world: its shaders compile on first use instead
      warnOnce('prewarm|' + name, `[prewarm] vfx '${name}' not prewarmed (compiles on first use):`, e.message);
    }
    groups.push(stage);
  }
  resetPooledLights();
  return groups;
}
let _vfxLinked = null, _vfxStaged = null;
let _vfxWarmLevel = null; // level whose START prewarm linked and drew the whole effect set (_prewarmShaders)
/** Every effect program in one compile() call, not waited on or polled (a
 *  readiness poll is a sync round trip to the busy GPU process): the links
 *  run on the GPU process's workers while the menu or the game goes on. The
 *  staged effects are kept, so their programs stay acquired. */
function _queueVfxLinks() {
  if (_vfxLinked) return;
  const t0 = performance.now();
  _vfxStaged = new THREE.Group();
  for (const g of _stageVfx()) _vfxStaged.add(g);
  _vfxLinked = _linkAsync(_vfxStaged, undefined, false);
  console.log(`[prewarm:vfx] effect set queued in ${(performance.now() - t0).toFixed(0)} ms (${renderer.info.programs.length} programs)`);
}
/** Behind the idle menu: at most two programs in flight (one staged mesh's
 *  material each, compile() only), topped up every 100 ms as they finish
 *  linking; materials whose program already exists go straight through.
 *  The whole set in flight at once held up the GPU process's other work for
 *  ~1.6 s and froze the menu's frames; two at a time they don't (~7 s for
 *  the set, cold). Stops when START is pressed: what's left is linked after
 *  the first frames (_linkVfxInSlices). */
function _linkVfxBehindMenu() {
  if (_vfxLinked) return;
  const t0 = performance.now();
  _vfxStaged = new THREE.Group();
  const items = [], seen = new Set();
  for (const g of _stageVfx()) {
    _vfxStaged.add(g);
    g.traverse((o) => {
      if (!o.material || Array.isArray(o.material) || seen.has(o.material)) return;
      seen.add(o.material);
      items.push(o.clone(false)); // that one material, without the children
    });
  }
  // Once linked, the program's first-use work too (error log and uniform
  // and attribute lookups, each a sync round trip to the GPU process; on a
  // first draw in play they waited 2 s behind a busy GPU process)
  const pending = (o) => {
    const pr = renderer.properties.get(o.material).currentProgram;
    if (!pr) return false;
    if (!pr.isReady()) return true;
    pr.getUniforms(); pr.getAttributes();
    return false;
  };
  const CAP = 2;
  let i = 0;
  const inFlight = [];
  const next = () => {
    if (state.kaiju || _startingGame) { _vfxLinked = null; return; }
    for (let k = inFlight.length - 1; k >= 0; k--) if (!pending(inFlight[k])) inFlight.splice(k, 1);
    while (i < items.length && inFlight.length < CAP) {
      const o = items[i++];
      _linkAsync(o, undefined, false);
      if (pending(o)) inFlight.push(o);
    }
    if (inFlight.length) { setTimeout(next, 100); return; }
    console.log(`[prewarm:vfx] ${items.length} effect materials linked behind the menu in ${(performance.now() - t0).toFixed(0)} ms (${renderer.info.programs.length} programs)`);
  };
  _vfxLinked = Promise.resolve();
  next();
}
function _linkVfxInSlices() {
  if (_vfxLinked) return _vfxLinked;
  const t0 = performance.now();
  const groups = _stageVfx();
  _vfxLinked = groups.reduce((p, g) => p.then(() => _linkAsync(g)).then(() => {
    g.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) n.skeleton.dispose(); });
  }), Promise.resolve()).then(() => {
    console.log(`[prewarm:vfx] ${groups.length} sets linked in ${(performance.now() - t0).toFixed(0)} ms (${renderer.info.programs.length} programs)`);
  });
  return _vfxLinked;
}

async function _prewarmShaders(kaijuRoot, onProgress, rivalRoot = null) {
  const t0 = performance.now();
  // Look layer: tag the level's facade / backdrop materials and the two
  // kaiju for their shader variants before anything links (look.js)
  tagLookScene(scene, world);
  styleKaiju(kaijuRoot, 0, state.monsterKey);
  styleKaiju(rivalRoot, 1, _rivalCache ? _rivalCache.key : null);
  const stage = new THREE.Group();
  if (kaijuRoot) stage.add(kaijuRoot);
  if (rivalRoot) stage.add(rivalRoot); // a second kaiju staged like the first
  for (const C of [Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech]) {
    try { stage.add(new C(0, 0).root); } catch (e) {
      warnOnce('prewarm|' + C.name, `[prewarm] ${C.name} not prewarmed (template missing?):`, e.message);
    }
  }
  // Traffic and pedestrians spawn right after this, in the first frames
  // (drawn batched: the batches' instanced programs are what links)
  // ...and one of everything a collapse builds lazily: a flying chunk of each
  // debris template (batched with the cars, in one call: each call rebuilds
  // every batch) and the rubble pools (city.js stageDestruction). The first
  // collapse of a run linked their instanced variants and made their buffers.
  let destr = null;
  try { destr = stageDestruction(stage); } catch (e) { warnOnce('prewarm|debris', '[prewarm] debris not prewarmed:', e); }
  for (const t of ['hp', 'rage', 'score']) stage.add(new Pickup(t, 0, 0, 0).root); // the first building's drop
  try { batchMovers([[spawnCars(stage, 16, 10, 40).concat(destr ? destr.cars : []), (c) => c.root], [destr ? destr.debris : null, (d) => d]], stage, camera, false); } catch (e) { warnOnce('prewarm|cars', '[prewarm] car spawn failed:', e); }
  try { spawnCivilians(stage, 2, 10); } catch (e) { warnOnce('prewarm|civs', '[prewarm] civilian spawn failed:', e); }
  // Gameplay set first: kaiju + enemies, and the whole scene (the GLB
  // buildings were just flushed in; after a level switch nothing of the new
  // city is linked yet). Awaited in full, with linked/total on the bar.
  const run = _linkAsync(stage);
  if (kaijuRoot) stage.remove(kaijuRoot); // compile() already ran synchronously
  if (rivalRoot) stage.remove(rivalRoot);
  const city = _linkAsync(scene);
  // The effect set too, on every platform, once per level (the level's light
  // count is in every program's key). On phones, queued at the first frame, it
  // hadn't drained when the first powers fired (0.4-1 s blocks at +4 s); on
  // desktop a START before the menu had linked it left the rest to link
  // during the first seconds of play, and each effect's first draw then
  // waited on those links (70 ms alone, 0.4-1.5 s with the GPU shared).
  // Staged after the flipbook sheets are in: a builder staged without its
  // sheet takes the procedural fallback, not the variant it plays with.
  let fxLink = null;
  if (_vfxWarmLevel !== world.level) {
    await Promise.race([flipbooksReady(), new Promise((r) => setTimeout(r, 4000))]);
    _vfxStaged = new THREE.Group();
    for (const g of _stageVfx()) _vfxStaged.add(g);
    _vfxLinked = fxLink = _linkAsync(_vfxStaged);
  }
  // ...and the shadow pass's depth variants of all of it. That pass draws
  // with the scene's lights but a null scene, so no fog in their keys.
  const fog = scene.fog;
  scene.fog = null;
  const depth = _linkAsync(_depthStandIns([scene, stage, kaijuRoot, rivalRoot].filter(Boolean)));
  scene.fog = fog;
  let finished = false;
  const all = Promise.all([run, city, fxLink, depth]).then(() => { finished = true; });
  while (!finished && performance.now() - t0 < 60000) {
    if (onProgress) {
      const progs = renderer.info.programs;
      onProgress(progs.filter((p) => p.isReady()).length, progs.length);
    }
    _drainTexQueue(8);
    await Promise.race([all, new Promise((r) => setTimeout(r, 50))]);
  }
  // Their first-use lookups too (a sync round trip each), while nothing waits
  if (fxLink) _vfxStaged.traverse((o) => {
    const pr = o.material && !Array.isArray(o.material) && renderer.properties.get(o.material).currentProgram;
    if (pr && pr.isReady()) { pr.getUniforms(); pr.getAttributes(); }
  });
  // The effect sheets aren't in the scene: their first upload (and mipmaps)
  // stalled the GPU 0.9-3.8 s when the first powers fired
  for (const t of effectTextures()) _texQueue.add(t);
  await _preuploadTextures([scene, stage, kaijuRoot, rivalRoot]);
  // One warm frame behind the opaque loading screen, shadow pass back on and
  // the staged kaiju/enemies in the scene unculled: links the shadow-depth
  // variants (compile() can't build them) with nothing else queued.
  if (kaijuRoot) stage.add(kaijuRoot);
  if (rivalRoot) stage.add(rivalRoot);
  stage.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  // The staged effects are drawn in it too (and the collapse pieces, already
  // on the stage): linking is not the whole first-use cost. A program's first
  // draw with its real vertex layout into this target is where the driver
  // builds the pipeline it will use, and the effect's buffers are created.
  // Their hidden parts are shown for this one frame, then put back.
  const fxShown = [], fxCulled = [];
  if (fxLink) {
    _vfxStaged.traverse((o) => {
      if (!o.visible) { o.visible = true; fxShown.push(o); }
      if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; fxCulled.push(o); }
    });
    stage.add(_vfxStaged);
  }
  // ...and the whole level, in view or not, shown or not (far tiles, the LOD
  // twins the camera hooks keep hidden, batched parts): what first came into
  // view during play paid its first draw there. With the quantized GLBs that
  // is a real cost: ANGLE/D3D11 builds a vertex shader per program x attribute
  // format set on the first draw that uses the pair (0.4-0.7 s stalls walking
  // into the Loop on a cold shader cache). Lights are left alone: their count
  // is in every program's key.
  const wasHidden = [], wasCulled = [];
  scene.traverse((o) => {
    if (o.isLight) return;
    if (!o.visible) { o.visible = true; wasHidden.push(o); }
    if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; wasCulled.push(o); }
  });
  scene.add(stage); // (after the sweep: the stage's hidden parts are the batched ones, drawn through their batches)
  const camHook = scene.onBeforeRender;
  scene.onBeforeRender = () => {}; // the LOD and band switches would hide half of it again
  try { if (composer) composer.render(); else renderer.render(scene, camera); } catch (e) {
    warnOnce('prewarm|frame', '[prewarm] warm frame failed:', e && e.message);
  }
  scene.onBeforeRender = camHook;
  for (const o of wasHidden) o.visible = false;
  for (const o of wasCulled) o.frustumCulled = true;
  scene.remove(stage);
  if (fxLink) {
    stage.remove(_vfxStaged);
    for (const o of fxShown) o.visible = false;
    for (const o of fxCulled) o.frustumCulled = true;
    _vfxWarmLevel = world.level;
  }
  if (destr) destr.release();
  if (kaijuRoot) stage.remove(kaijuRoot);
  if (rivalRoot) stage.remove(rivalRoot);
  stage.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) n.skeleton.dispose(); });
  if (onProgress) onProgress(renderer.info.programs.length, renderer.info.programs.length);
  console.log(`[prewarm:start] gameplay set linked + uploaded in ${(performance.now() - t0).toFixed(0)} ms (${renderer.info.programs.length} programs)`);
}

// Upload every texture the run samples (city, kaiju, staged enemies, and
// ShaderMaterial uniforms) during the loading screen; otherwise the first
// gameplay frame uploads them all at once (a 200-600 ms stall). Chunked with
// yields so the loading screen keeps painting; idempotent across restarts
// (initTexture skips textures that are already on the GPU).
async function _preuploadTextures(roots) {
  const t0 = performance.now();
  const texs = new Set(_texQueue);
  _texQueue.clear();
  const add = (t) => { if (t && t.isTexture) texs.add(t); };
  for (const r of roots) {
    if (!r) continue;
    r.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        for (const k of _TEX_KEYS) add(m[k]);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u && u.value);
      }
    });
  }
  let i = 0;
  for (const t of texs) {
    try { renderer.initTexture(t); } catch (e) { /* uploads on first use instead */ }
    if (++i % 6 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  console.log(`[prewarm:textures] ${texs.size} textures uploaded in ${(performance.now() - t0).toFixed(0)} ms`);
}

// "UNLEASH AGAIN": reset the run without reloading the page, so the parsed
// GLB templates (15-20 s of parsing) are reused. Tears down every object
// added since boot (kaiju, enemies, effects, debris, cars, civilians and
// the city itself), rebuilds a fresh city from the cached templates,
// resets per-run state and returns to the monster-select menu.
function restartInPlace() {
  _mode.dispose(); // the mode's own objects, DOM and listeners (before the scene goes)
  _resetSeams();
  _teardownScene();
  resetAtomicBlasts();
  if (state.kaiju && state.kaiju.mixer && !state.kaiju.glb) state.kaiju.mixer.stopAllAction();
  world.effects.length = 0;
  world.shells.length = 0;
  world.debris.length = 0;
  world.enemies.length = 0;
  world._shakeMag = 0; world._shakeTime = 0;
  for (const k of Object.keys(state)) {
    if (!(k in _STATE_INIT)) { if (k[0] === '_') delete state[k]; continue; }
    const v = _STATE_INIT[k];
    if (v && v.isVector3) state[k].copy(v);
    else state[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  }
  state.kaiju = null;
  _hudLastScore = -1;
  _hudKey = {};
  buildWorldCity();
  if (_bldgLevelsLoaded.has(world.level)) { flushPendingGLBBuildings(scene); _detachEmptyBuildingGroups(); }
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('minimap').classList.add('hidden');
  document.getElementById('boss-bar').style.display = 'none';
  document.getElementById('menu').classList.remove('hidden');
}

/** Remove (and dispose) everything added to the scene since boot: the
 *  city, and after a run the kaiju, enemies, effects, debris and traffic. */
function _teardownScene() {
  // The kaiju GLB stays alive in _kaijuCache: reused if the same monster
  // is picked again, disposed by _startGameInner if a different one is.
  const keepRoot = state.kaiju && state.kaiju.glb ? state.kaiju.root : null;
  if (keepRoot) state.kaiju.glb.mixer.stopAllAction();
  const keepRival = _rivalCache ? _rivalCache.glb.root : null; // likewise cached
  for (const o of [...scene.children]) {
    // Pooled point lights (effects.js / vfx.js) are added lazily and are
    // reused forever, so they stay.
    if (_sceneBaseline.has(o) || o.isLight) continue;
    scene.remove(o);
    if (o === keepRoot || o === keepRival) continue; // cached kaiju: detach only
    o.traverse((n) => {
      // Template-owned GLB geometry (userData.template, set in assetCache.js)
      // is shared by every clone and reused by the next city, and markShared
      // module geometry is reused by every later spawn; keep both.
      if (n.geometry && !n.geometry.userData.template && !n.geometry.userData.shared) n.geometry.dispose();
      // (not the pooled spark mesh, which vfx.js puts back in the scene as it
      // is: its kept geometry's vertex-array state still points at these
      // buffers, and freeing them left every spark after a restart undrawn
      // behind a WebGL INVALID_OPERATION)
      if (n.isInstancedMesh && !n.userData.vfxPool) n.dispose();
      // Each skinned clone (civilians, soldiers, mechs) owns a GPU bone texture.
      if (n.isSkinnedMesh && n.skeleton) n.skeleton.dispose();
    });
  }
}

/** The menu picked a different level than the one built: swap the city
 *  (its boot-time props/vehicles and layout load first, only what's missing). */
async function _switchLevel(loadingStatus) {
  if (loadingStatus) loadingStatus.textContent = 'TRAVELLING TO ' + LEVELS[selectedLevel].name;
  await loadLevelData(selectedLevel);
  if (GLB_CONTENT) await loadLevelTemplates(selectedLevel);
  _teardownScene();
  buildWorldCity();
}
window.__restartInPlace = restartInPlace;
// ?debug test hooks (QA scripts): inspect state and trigger abilities
if (/[?&]debug\b/.test(location.search)) {
  // composer(): the post chain (bloom, grade) for in-game-look screenshots
  window.__qa = { state, world, camera, renderer, composer: () => composer, ult: () => { state.rage = 100; state.cooldowns.ult = 0; fireUltimate(); }, wave: (n) => startWave(n), objective: (kind) => progressObjective(kind), pause: (on) => togglePause(on), gameOver: (v) => gameOver(!!v), upgrades: () => offerUpgrades() };
}
async function startGame(key) {
  if (_startingGame) return;

  // On mobile, warn about data usage before downloading (first play only)
  if (isMobile && !_mobileDataAccepted) {
    const proceed = await _showMobileDataWarning();
    if (!proceed) return;
  }

  _startingGame = true;
  try {
    await _startGameInner(key);
  } catch (e) {
    reportLoadError('startGame', key, e);
    document.getElementById('loading-screen')?.classList.remove('visible');
    if (_hudPrewarm) { _hudPrewarm.restore(); _hudPrewarm = null; }
    toast('LOADING FAILED · TAP START TO RETRY', 'bad');
  } finally {
    _startingGame = false;
  }
}

async function _startGameInner(key) {
  // Clean up any previous kaiju from scene (restart / retry)
  if (state.kaiju && state.kaiju.root) {
    scene.remove(state.kaiju.root);
    if (state.kaiju.mixer) state.kaiju.mixer.stopAllAction();
    state.kaiju = null;
  }

  state.monsterKey = key;
  state.monsterCfg = MONSTERS[key];
  audio.setMonster(state.monsterCfg.variant);
  state.maxHp = state.monsterCfg.stats.hp;
  state.hp = state.maxHp;
  state.score = 0;
  state.rage = 0;
  state.wave = 0;
  state.elapsedTime = 0;

  // Loading screen elements
  const loadingScreen = document.getElementById('loading-screen');
  const loadingBar    = document.getElementById('loading-bar');
  const loadingPct    = document.getElementById('loading-percent');
  const loadingStatus = document.getElementById('loading-status');

  let k;
  const hasGLB = key === 'godzilla' || key === 'ghidorah' || key === 'mecha';
  const needSwitch = world.level !== selectedLevel;
  if (!hasGLB && needSwitch) await _switchLevel(null);
  if (hasGLB) {
    // Show loading screen
    loadingScreen.classList.add('visible');
    loadingBar.style.width = '0%';
    loadingPct.textContent = '0%';
    loadingStatus.textContent = 'INITIALIZING';
    _hudPrewarmBegin(); // drawn under the downloads; settled by _hudPrewarmEnd

    // Initialize asset cache (IndexedDB) before any loads
    const cacheWarm = await initAssetCache();
    loadingStatus.textContent = cacheWarm ? 'LOADING FROM CACHE' : 'DOWNLOADING ASSETS';
    if (needSwitch) await _switchLevel(loadingStatus);

    // The mode this level plays and, for one that fields a rival kaiju
    // (wrestling), which of the other two it is. A cached rival that isn't
    // wanted is freed first (phones also drop it for a run without one).
    _mode = MODES[_modeId(world.level)];
    const rivalKey = _mode.needsRival ? _pickRivalKey(key) : null;
    if (_rivalCache && _rivalCache.key !== rivalKey && (rivalKey || isMobile)) {
      _disposeKaijuGLB(_rivalCache.glb);
      _rivalCache = null;
    }

    // Track combined progress
    const progress = { kaijuLoaded: 0, kaijuTotal: 1, bldgLoaded: 0, bldgTotal: 1,
                       enemyLoaded: 0, enemyTotal: 1, rivalLoaded: 0, rivalTotal: 0 };
    const onBldgProgress = (loaded, total, label) => {
      progress.bldgLoaded = loaded;
      progress.bldgTotal = total;
      loadingStatus.textContent = 'BUILDING: ' + label.toUpperCase();
      updateLoadingUI();
    };
    function updateLoadingUI() {
      const totalItems = progress.kaijuTotal + progress.bldgTotal + progress.enemyTotal + progress.rivalTotal;
      const loadedItems = progress.kaijuLoaded + progress.bldgLoaded + progress.enemyLoaded + progress.rivalLoaded;
      const pct = Math.round((loadedItems / totalItems) * 100);
      loadingBar.style.width = pct + '%';
      loadingPct.textContent = pct + '%';
    }
    // The rival's model loads alongside the player's and the world templates
    // (awaited once those are in; a failure surfaces there, not as an
    // unhandled rejection meanwhile).
    let rivalLoad = null;
    if (rivalKey && !_rivalCache) {
      progress.rivalTotal = 1;
      rivalLoad = loadKaijuModel(rivalKey, (loaded, total) => {
        progress.rivalLoaded = loaded;
        progress.rivalTotal = total;
        updateLoadingUI();
      });
      rivalLoad.catch(() => {});
    }

    // On mobile: only load the kaiju model to stay under iOS memory limits (~1.5GB).
    // Buildings, enemies, debris, trees all use procedural fallbacks.
    // On desktop: load everything in parallel.
    let glb;
    if (_kaijuCache && _kaijuCache.key !== key) {
      _disposeKaijuGLB(_kaijuCache.glb);
      _kaijuCache = null;
    }
    if (_kaijuCache) {
      // Same kaiju as last run: reuse the parsed model, reset its anims.
      glb = _kaijuCache.glb;
      glb.resetAnim();
      progress.kaijuLoaded = progress.kaijuTotal = 1;
      progress.bldgTotal = 0; progress.enemyTotal = 0;
      updateLoadingUI();
    } else if (!GLB_CONTENT || _worldTemplatesLoaded) {
      // The procedural-only path never loads world templates; on restarts the
      // building / debris / enemy templates are already parsed and only
      // the (possibly different) kaiju has to load.
      glb = await loadKaijuModel(key, (loaded, total, label) => {
        progress.kaijuLoaded = loaded;
        progress.kaijuTotal = total;
        progress.bldgTotal = 0; progress.enemyTotal = 0;
        loadingStatus.textContent = label.toUpperCase();
        updateLoadingUI();
      });
    } else {
      [glb] = await Promise.all([
        loadKaijuModel(key, (loaded, total, label) => {
          progress.kaijuLoaded = loaded;
          progress.kaijuTotal = total;
          loadingStatus.textContent = label.toUpperCase();
          updateLoadingUI();
        }),
        loadBuildingTemplates(onBldgProgress, world.level),
        loadDebrisTemplates(),
        loadEnemyTemplates((loaded, total, label) => {
          progress.enemyLoaded = loaded;
          progress.enemyTotal = total;
          loadingStatus.textContent = 'ENEMY: ' + label.toUpperCase();
          updateLoadingUI();
        }),
      ]);
      _worldTemplatesLoaded = true;
      _bldgLevelsLoaded.add(world.level);
    }
    // Chicago's buildings are GLB on every tier (phone LOW included)
    const bldgGLB = GLB_CONTENT || world.level === 'chicago';
    if (bldgGLB && !_bldgLevelsLoaded.has(world.level)) {
      // First run on this level (another level's templates are already parsed)
      await loadBuildingTemplates(onBldgProgress, world.level);
      _bldgLevelsLoaded.add(world.level);
    }
    _kaijuCache = { key, glb };
    if (rivalLoad) _rivalCache = { key: rivalKey, cfg: MONSTERS[rivalKey], glb: await rivalLoad };
    else if (rivalKey) _rivalCache.glb.resetAnim(); // same rival as last run: reused like the player's

    // Clone + place every queued building now that templates are loaded
    if (bldgGLB) {
      loadingStatus.textContent = 'BUILDING ' + LEVELS[world.level].name;
      flushPendingGLBBuildings(scene);
      _detachEmptyBuildingGroups();
    }

    // Brief pause at 100% so it feels complete
    loadingBar.style.width = '100%';
    loadingPct.textContent = '100%';
    const cs = getCacheStats();
    loadingStatus.textContent = cs.hits > 0
      ? `KAIJU READY \u2022 ${cs.hits} cached / ${cs.misses} downloaded`
      : 'KAIJU READY';
    await new Promise(r => setTimeout(r, cs.hits > 0 ? 600 : 400));
    loadingStatus.textContent = 'WARMING UP SHADERS';
    await _prewarmShaders(glb.root, (ready, total) => {
      const pct = total ? Math.round((ready / total) * 100) : 100;
      loadingBar.style.width = pct + '%';
      loadingPct.textContent = pct + '%';
      loadingStatus.textContent = `WARMING UP SHADERS \u2022 ${ready}/${total}`;
    }, rivalKey ? _rivalCache.glb.root : null);
    // The match's procedural clips, both kaiju (once per model: see prebakeAnims)
    if (_mode.id === 'wrestling') {
      loadingStatus.textContent = 'REHEARSING THE MATCH';
      try { await prebakeAnims(glb); if (rivalKey) await prebakeAnims(_rivalCache.glb); } catch (e) { warnOnce('prewarm|anims', '[prewarm] anim bake failed (bakes at the bell instead):', e && e.message); }
    }
    await _hudPrewarmEnd();
    loadingScreen.classList.remove('visible');

    k = { root: glb.root, head: glb.head, tail: glb.tail, mixer: glb.mixer, glb };
  } else {
    k = buildKaiju(state.monsterCfg);
  }
  k.root.position.set(world.spawn.x, 0, world.spawn.z); // Tokyo: the open plaza at the origin
  if (world.spawn.rot !== undefined) state.yaw = world.spawn.rot; // face the level's skyline
  k.root.rotation.set(0, 0, 0); // clear a previous run's death topple (cached GLB)
  // Yaw-invariant body bounds for the camera: a vertical cylinder of radius
  // camR (max horizontal half-extent, wings included) and height camH.
  {
    k.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(k.root);
    const sz = bb.getSize(new THREE.Vector3());
    k._camR = Math.max(sz.x, sz.z) * 0.5;
    k._camH = sz.y;
  }
  // Phase 4: kaiju is the only object that casts shadows. Traverse its mesh
  // tree once and flip the flags so the shadow pass picks up every limb.
  k.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  markShadowCaster(k.root);
  restrictShadowCasters(scene); // the city is placed by now (GLB flush above)
  // Cache named limb refs so per-frame animation skips getObjectByName tree
  // walks. GLB rigs may not expose these names; nulls are fine, the call
  // sites already null-check.
  k.bones = {
    legL: k.root.getObjectByName('legL') || null,
    legR: k.root.getObjectByName('legR') || null,
    tail: k.tail || k.root.getObjectByName('tail') || null,
    armL: k.root.getObjectByName('armL') || null,
    armR: k.root.getObjectByName('armR') || null,
  };
  // Sun targets the kaiju so the tight 180u shadow camera frustum follows it.
  sun.target = k.root;
  scene.add(sun.target);
  scene.add(k.root);
  state.kaiju = k;
  // _startingGame reset is handled by the outer try/finally in startGame().

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('powers').classList.remove('hidden');
  document.getElementById('minimap').classList.remove('hidden');
  if (!touchUI) {
    const help = document.getElementById('help');
    help.classList.remove('hidden', 'dim');
    // The help card fades back once the player has had time to read it
    clearTimeout(_helpDimTimer);
    _helpDimTimer = setTimeout(() => help.classList.add('dim'), 20000);
  } else {
    // Reveal touch controls
    document.getElementById('joy-zone').classList.remove('hidden');
    document.getElementById('joystick').classList.remove('hidden');
    document.getElementById('attack-btn').classList.remove('hidden');
    document.getElementById('sprint-btn').classList.remove('hidden');
  }
  buildPowersBar();

  // Spawn initial cars driving around the city. Desktop runs ~200 cars
  // and ~100 civilians for a properly populated Tokyo. Mobile gets a
  // smaller cap (60 cars, 50 civilians) so the per-frame AI loop stays
  // under budget on weaker GPUs.
  state.cars = spawnCars(scene, isMobile ? 40 : 200, 380, isMobile ? 48 : 40);
  // Spawn ambient pedestrians who panic + flee when the kaiju approaches
  state.civilians = spawnCivilians(scene, isMobile ? 30 : 100, 350);

  // Kick off looping background music. Tries assets/music.{mp3,ogg,wav};
  // falls back to a procedural ambient drone if no asset is present.
  audio.startMusic();

  _mode.start(); // waves: startWave(1); wrestling: the match
  // Effects not linked behind the menu: phones queue them all now, desktop
  // links them one at a time after the first frames
  // (only a run that skipped the START prewarm: the procedural kaiju)
  if (_vfxWarmLevel === world.level) { /* linked and drawn behind the loading screen */ }
  else if (isMobile) _queueVfxLinks();
  else setTimeout(_linkVfxInSlices, 500);
  _preloadUpgradeArt();
  if (!touchUI) _requestPointerLock();
}
let _helpDimTimer = 0;
/** Hide the in-run HUD (game over, quit to menu). */
function _hideRunHUD() {
  document.exitPointerLock?.();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('powers').classList.add('hidden');
  document.getElementById('help').classList.add('hidden');
  document.getElementById('boss-bar').style.display = 'none';
  const oo = document.getElementById('wave-objective');
  if (oo) oo.style.display = 'none';
  const ce = document.getElementById('combo');
  if (ce) ce.style.opacity = '0';
  _hudComboOn = false;
  for (const id of ['joy-zone', 'joystick', 'attack-btn', 'sprint-btn']) document.getElementById(id)?.classList.add('hidden');
  resetJoystick();
  touchInput.attackHeld = false;
}

// ------------------------- HUD -------------------------
// Cached HUD element refs. getElementById() inside the HUD update path
// (10 Hz, plus the per-frame fast pass) cost real time on weak devices,
// so resolve once and reuse. pw/cd are repopulated each time the powers
// bar is rebuilt (per monster pick).
const hudRefs = {
  damageFlash: null,
  lowHp: null,
  hud: null,
  vitals: null,
  hpInner: null,
  ragInner: null,
  hpNum: null,
  ragNum: null,
  score: null,
  waveText: null,
  bldText: null,
  combo: null,
  comboMult: null,
  comboBar: null,
  bossHp: null,
  hudToasts: null,
  pw: {},
  cd: {},
};
function _initStaticHUDRefs() {
  hudRefs.damageFlash = document.getElementById('damage-flash');
  hudRefs.lowHp = document.getElementById('lowhp-warning');
  hudRefs.hud = document.getElementById('hud');
  hudRefs.vitals = document.getElementById('vitals');
  const hp = document.getElementById('hpBar'); if (hp) hudRefs.hpInner = hp.firstElementChild;
  const rag = document.getElementById('ragBar'); if (rag) hudRefs.ragInner = rag.firstElementChild;
  hudRefs.hpNum = document.getElementById('hpNum');
  hudRefs.ragNum = document.getElementById('ragNum');
  hudRefs.score = document.getElementById('score');
  hudRefs.waveText = document.getElementById('waveText');
  hudRefs.bldText = document.getElementById('bldText');
  hudRefs.combo = document.getElementById('combo');
  hudRefs.comboMult = document.getElementById('combo-mult');
  hudRefs.comboBar = document.getElementById('combo-bar');
  hudRefs.bossHp = document.getElementById('boss-hp');
  hudRefs.hudToasts = document.getElementById('hud-toasts');
}
_initStaticHUDRefs();

function buildPowersBar() {
  const cfg = state.monsterCfg;
  const bar = document.getElementById('powers');
  bar.innerHTML = '';
  hudRefs.pw = {};
  hudRefs.cd = {};
  _pwState = {};
  delete _hudKey.ultR;
  const items = [
    { key: '1', id: 'beam', name: cfg.beam.name, cost: cfg.beam.cost },
    { key: '2', id: 'roar', name: cfg.roar.name, cost: cfg.roar.cost },
    { key: '3', id: 'charge', name: cfg.charge.name, cost: cfg.charge.cost },
    { key: 'SPC', id: 'stomp', name: 'STOMP', cost: 15 },
    { key: 'Q',   id: 'ult',   name: 'ULTIMATE', cost: 100 },
  ];
  for (const it of items) {
    it.short = it.id === 'ult' ? 'ULT' : it.name.trim().split(/\s+/).pop();
    const w = document.createElement('div');
    w.className = 'power-wrap ' + it.id;
    w.innerHTML = `${it.id === 'ult' ? '<div class="u-ring"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path/></svg></div>' : ''}
      <div class="power" id="pw-${it.id}" role="button" aria-label="${it.name}${touchUI ? '' : ' (' + it.key + ')'}">
        <svg viewBox="0 0 32 32" aria-hidden="true">${POWER_ICONS[it.id]}</svg>
        <span class="name">${it.name}</span>
        <span class="key">${it.key}</span>
        <svg class="cooldown" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path/></svg>
      </div>
      <span class="cd-num" id="cd-${it.id}"></span>
      <span class="lbl">${it.short}</span>`;
    bar.appendChild(w);
    const pwEl = w.querySelector('.power');
    hudRefs.pw[it.id] = w;
    hudRefs.cd[it.id] = w.querySelector('.cd-num');
    const fire = (e) => {
      e.preventDefault();
      _setKey('Power_' + it.id, true); // also a raw button for a mode's own bindings (ctx.input)
      if (_pctl.external || !_pctl.powers || (it.id === 'ult' && !_pctl.ult)) return; // the body is spoken for
      if (it.id === 'beam') fireBeam();
      else if (it.id === 'roar') fireRoar();
      else if (it.id === 'charge') fireCharge();
      else if (it.id === 'stomp') fireStomp();
      else if (it.id === 'ult') fireUltimate();
    };
    pwEl.addEventListener('touchstart', fire, { passive: false });
    pwEl.addEventListener('mousedown', fire);
    const fireEnd = () => _setKey('Power_' + it.id, false);
    for (const t of ['touchend', 'touchcancel', 'mouseup', 'mouseleave']) pwEl.addEventListener(t, fireEnd);
  }
}

// Pie of fraction f (0..1) clockwise from 12 o'clock, radius 71 so it
// reaches the corners of the 100x100 box (the cooldown sweep, the ult ring)
function _piePath(f) {
  if (f <= 0) return '';
  if (f >= 0.999) return 'M50 -21A71 71 0 1 1 49.99 -21Z';
  const a = f * Math.PI * 2;
  return `M50 50L50 -21A71 71 0 ${f > 0.5 ? 1 : 0} 1 ${(50 + 71 * Math.sin(a)).toFixed(2)} ${(50 - 71 * Math.cos(a)).toFixed(2)}Z`;
}
function _sweep(wrap, f) { const p = wrap && wrap.querySelector('.cooldown path'); if (p) p.setAttribute('d', _piePath(f)); }
function _ring(wrap, f) { const p = wrap && wrap.querySelector('.u-ring path'); if (p) p.setAttribute('d', _piePath(f)); }

// HUD DOM writes are heavy enough that smashing them at 60Hz causes frame
// hitches in dense fights. Throttle the slow stuff to ~10Hz and write a
// node only when its value changed; bars move with transform (no layout).
// Only the damage flash / low-HP overlay (cheap single-element styles)
// refresh every frame for visual smoothness.
let _hudLast = 0;
let _hudLastScore = -1;
let _hudKey = {};      // last written value per HUD field
let _pwState = {};     // per power: { s: 'ready'|'low'|'cd', max, txt, q }
let _hudComboOn = false;
let _hudLowHp = false;
function _hudSet(k, v, write) {
  if (_hudKey[k] === v) return;
  _hudKey[k] = v;
  write(v);
}
function updateHUDFast() {
  if (hudRefs.damageFlash) hudRefs.damageFlash.style.opacity = String(state.damageFlash * 0.85);
  if (hudRefs.lowHp) {
    const low = state.hp / state.maxHp < 0.3 && !state.gameOver;
    if (low !== _hudLowHp) {
      _hudLowHp = low;
      hudRefs.lowHp.classList.toggle('active', low);
      if (hudRefs.vitals) hudRefs.vitals.classList.toggle('low', low);
    }
  }
}
function updateHUD() {
  updateHUDFast();
  const now = performance.now();
  if (now - _hudLast < 100) return; // 10 Hz
  _hudLast = now;
  const hpF = Math.max(0, state.hp / state.maxHp);
  _hudSet('hp', Math.round(hpF * 200), (v) => { if (hudRefs.hpInner) hudRefs.hpInner.style.transform = `scaleX(${v / 200})`; });
  _hudSet('hpN', Math.max(0, Math.ceil(state.hp)), (v) => { if (hudRefs.hpNum) hudRefs.hpNum.textContent = v; });
  _hudSet('rag', Math.round(state.rage / state.maxRage * 200), (v) => { if (hudRefs.ragInner) hudRefs.ragInner.style.transform = `scaleX(${v / 200})`; });
  _hudSet('ragN', Math.floor(state.rage), (v) => { if (hudRefs.ragNum) hudRefs.ragNum.textContent = v; });
  if (hudRefs.score && state.score !== _hudLastScore) {
    hudRefs.score.textContent = state.score.toLocaleString();
    _hudLastScore = state.score;
  }
  _hudSet('wave', state.wave, (v) => { if (hudRefs.waveText) hudRefs.waveText.textContent = v; });
  _hudSet('bld', state.buildingsDestroyed, (v) => { if (hudRefs.bldText) hudRefs.bldText.textContent = v; });

  const cfg = state.monsterCfg;
  if (!cfg) return;
  // Power states: cooling (dark sweep + seconds), short of rage (dashed,
  // dimmed), ready (gold ring). Class flips only on a state change.
  const updateP = (id, cost) => {
    const w = hudRefs.pw[id];
    const cd = hudRefs.cd[id];
    if (!w) return;
    const ps = _pwState[id] || (_pwState[id] = { s: '', max: 0, txt: '', q: -1 });
    const t = state.cooldowns[id];
    const s = t > 0 ? 'cd' : state.rage < cost ? 'low' : 'ready';
    if (s !== ps.s) {
      w.classList.remove('is-' + ps.s);
      w.classList.add('is-' + s);
      if (s === 'cd') ps.max = t;
      ps.s = s;
    }
    if (s === 'cd') {
      if (t > ps.max) ps.max = t;
      const txt = t.toFixed(1);
      if (txt !== ps.txt) { ps.txt = txt; cd.textContent = txt; }
      const q = Math.ceil(t / ps.max * 40) / 40;
      if (q !== ps.q) { ps.q = q; _sweep(w, q); }
    }
  };
  updateP('beam', cfg.beam.cost);
  updateP('roar', cfg.roar.cost);
  updateP('charge', cfg.charge.cost);
  updateP('stomp', 15);
  updateP('ult', 100);
  // Ultimate charge ring fills with rage
  _hudSet('ultR', Math.round(Math.min(1, state.rage / 100) * 40), (v) => _ring(hudRefs.pw.ult, v / 40));

  // Combo HUD (stats column)
  if (hudRefs.combo) {
    const on = state.combo > 0;
    if (on !== _hudComboOn) { _hudComboOn = on; hudRefs.combo.style.opacity = on ? '1' : '0'; }
    if (on) {
      _hudSet('cm', comboMult().toFixed(1), (v) => { if (hudRefs.comboMult) hudRefs.comboMult.textContent = 'x' + v; });
      _hudSet('cb', Math.round(Math.max(0, state.comboTimer / state.comboMaxTimer) * 50), (v) => { if (hudRefs.comboBar) hudRefs.comboBar.style.transform = `scaleX(${v / 50})`; });
    }
  }

  // Boss bar
  if (state.boss && !state.boss.dead && hudRefs.bossHp) {
    _hudSet('boss', Math.round(Math.max(0, state.boss.hp / state.boss.maxHp) * 200), (v) => { hudRefs.bossHp.style.transform = `scaleX(${v / 200})`; });
  }
}

// ------------------------- Messages / waves -------------------------
let messageTimeout = null;
function showMessage(text, duration = 1.8) {
  const el = document.getElementById('message');
  if (!text) { el.classList.remove('show'); el.textContent = ''; return; }
  el.textContent = text;
  el.classList.add('show');
  if (messageTimeout) clearTimeout(messageTimeout);
  if (duration > 0) {
    messageTimeout = setTimeout(() => el.classList.remove('show'), duration * 1000);
  }
}

// In a run toasts stack under the objective chip (HUD centre column, so
// they can't overlap it or the boss bar); on the menus they use #toasts.
function toast(text, kind = '') {
  const inRun = hudRefs.hudToasts && hudRefs.hud && !hudRefs.hud.classList.contains('hidden');
  const wrap = inRun ? hudRefs.hudToasts : document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
// Smaller left-rail toast for high-frequency / low-priority events
// (combo milestones, destruction tier feedback, jet kills, gamepad
// connect/disconnect). Same kind suffix ('good' / 'bad') applies.
// Reserve toast() for big game events that genuinely warrant a center
// banner.
function toastMini(text, kind = '') {
  const wrap = document.getElementById('mini-toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'mini-toast' + (kind ? ' ' + kind : '');
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function showWaveBanner(text, sub) {
  const el = document.getElementById('wave-banner');
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

function startWave(n) {
  state.wave = n;
  state.inWave = true;

  // Wave objective: pick a random kind so each wave gives the player a
  // different stretch goal. Each kind has its own goal scaling tuned to
  // be tough-but-achievable if the kaiju plays aggressively.
  const OBJ_KINDS = [
    { kind: 'buildings', label: 'SMASH',   noun: 'BUILDINGS', goal: 4 + Math.min(8, Math.floor(n * 1.2)) },
    { kind: 'civilians', label: 'STOMP',   noun: 'CIVILIANS', goal: 8 + Math.min(20, n * 3) },
    { kind: 'tanks',     label: 'DESTROY', noun: 'TANKS',     goal: Math.max(2, Math.min(8, 2 + Math.floor(n * 0.8))) },
    { kind: 'cars',      label: 'CRUSH',   noun: 'CARS',      goal: 3 + Math.min(6, Math.floor(n * 0.7)) },
  ];
  const oc = OBJ_KINDS[Math.floor(Math.random() * OBJ_KINDS.length)];
  state.waveObjective.kind = oc.kind;
  state.waveObjective.label = oc.label;
  state.waveObjective.noun  = oc.noun;
  state.waveObjective.goal  = oc.goal;
  state.waveObjective.current = 0;
  state.waveObjective.complete = false;
  const objEl = document.getElementById('wave-objective');
  if (objEl) {
    clearTimeout(_objHideTimer);
    objEl.classList.remove('complete', 'fade');
    objEl.style.display = 'flex';
  }
  updateWaveObjectiveText();

  const isBossWave = n > 0 && n % 4 === 0;
  // Wave themes pick a flavour for non-boss waves so each wave feels
  // distinct rather than "more of the same". Each theme tweaks the
  // baseline counts plus shows a unique sub-banner.
  const THEMES = [
    { id: 'standard', name: 'THE MILITARY STRIKES BACK', mods: { tank: 1.0, heli: 1.0, mech: 1.0, jet: 1.0, arty: 1.0, soldier: 1.0 } },
    { id: 'swarm',    name: 'INFANTRY SWARM',            mods: { tank: 0.5, heli: 0.5, mech: 0.0, jet: 0.0, arty: 0.0, soldier: 4.0 } },
    { id: 'armor',    name: 'ARMORED COLUMN',            mods: { tank: 2.0, heli: 0.5, mech: 1.5, jet: 0.0, arty: 0.5, soldier: 0.0 } },
    { id: 'air',      name: 'AIR DOMINANCE',             mods: { tank: 0.5, heli: 2.5, mech: 0.0, jet: 2.5, arty: 0.0, soldier: 0.0 } },
    { id: 'siege',    name: 'ARTILLERY SIEGE',           mods: { tank: 0.5, heli: 0.5, mech: 1.2, jet: 0.5, arty: 3.0, soldier: 0.5 } },
  ];
  // Waves 2-3 only roll the gentle themes (standard / infantry swarm); the
  // spiky ones (armor x2 tanks, air x2.5 helis+jets, siege x3 artillery)
  // unlock from wave 4 so pressure ramps instead of spiking at wave 2.
  const themePool = n <= 3 ? THEMES.slice(0, 2) : THEMES;
  const theme = isBossWave ? null : (n <= 1 ? THEMES[0] : themePool[Math.floor(Math.random() * themePool.length)]);
  if (isBossWave) {
    showWaveBanner(`WAVE ${n}`, 'BOSS APPROACHING');
    toast('⚠\uFE0E BOSS WAVE ⚠\uFE0E', 'bad');
    audio.bossSpawn();
  } else {
    showWaveBanner(`WAVE ${n}`, theme.name);
    audio.waveStart();
  }
  state._waveTheme = theme;

  const enemies = world.enemies;
  const kpos = state.kaiju.root.position;
  // Keep all spawns inside the city. The naive ring-spawn around the
  // kaiju used to fling artillery 320u "outward" from a kaiju already
  // near the edge, dropping enemies in the void beyond CITY_RADIUS
  // where the player can see nothing and can't reach them.
  const cityRadius = world.cityRadius || 320;
  const spawnMargin = 25;
  const maxSpawnR = cityRadius - spawnMargin;
  // Levels with explicit bounds (Chicago) spawn inside the play rectangle and
  // off the water; ground units retry until both hold.
  const bd = world.level !== 'tokyo' ? world.bounds : null;
  const spawnOK = (x, z, air) => (bd
    ? x > bd.minX + spawnMargin && x < bd.maxX - spawnMargin && z > bd.minZ + spawnMargin && z < bd.maxZ - spawnMargin
      && (air || !world.isWater || !world.isWater(x, z))
    : x * x + z * z <= maxSpawnR * maxSpawnR);
  function spawnPos(radius, air) {
    for (let attempt = 0; attempt < (bd ? 24 : 8); attempt++) {
      const a = Math.random() * Math.PI * 2;
      const x = kpos.x + Math.cos(a) * radius * (bd && attempt >= 8 ? 0.5 + Math.random() * 0.5 : 1);
      const z = kpos.z + Math.sin(a) * radius * (bd && attempt >= 8 ? 0.5 + Math.random() * 0.5 : 1);
      if (spawnOK(x, z, air)) return [x, z];
    }
    if (bd) {
      // Kaiju out on the lake or hugging an edge: drop it at a random land
      // spawn point of the level instead
      const p = world.landPoint ? world.landPoint() : [world.center.x, world.center.z];
      return p;
    }
    // Every angle landed outside (kaiju is hugging the edge). Drop the
    // enemy on a ring of radius `radius` biased back toward the city
    // center so it stays inside and the player can still close on it.
    const toCenter = Math.atan2(-kpos.z, -kpos.x);
    const jitter = (Math.random() - 0.5) * Math.PI * 0.6;
    const a = toCenter + jitter;
    const r = Math.min(radius, Math.max(40, maxSpawnR - Math.hypot(kpos.x, kpos.z) * 0.3));
    let x = kpos.x + Math.cos(a) * r;
    let z = kpos.z + Math.sin(a) * r;
    const d = Math.hypot(x, z);
    if (d > maxSpawnR) { const k = maxSpawnR / d; x *= k; z *= k; }
    return [x, z];
  }

  // Boss replaces big mech spawn on boss waves
  if (isBossWave) {
    const [bx, bz] = spawnPos(170);
    const boss = new BossMech(bx, bz);
    markShadowCaster(boss.root);
    scene.add(boss.root);
    enemies.push(boss);
    state.boss = boss;
    document.getElementById('boss-bar').style.display = 'block';
  }

  // Baseline scaling, then theme-modulated
  // Boss waves: the boss is the fight, so the escort is halved (wave 4 was
  // 7-9 tanks + 2-3 helis + artillery on top of the boss).
  const m = theme ? theme.mods : { tank: 0.5, heli: 0.5, mech: 1.0, jet: 0.5, arty: 0.5, soldier: 0.5 };
  const tankCount   = Math.round((2 + n * 2) * m.tank);
  const heliCount   = Math.min(12, Math.round(Math.floor(n * 1.2) * m.heli));
  const mechCount   = (n >= 3 && !isBossWave) ? Math.max(0, Math.round((n - 2) * m.mech)) : 0;
  const jetCount    = n >= 2 ? Math.min(8, Math.round(Math.floor(n / 2) * m.jet)) : 0;
  const artyCount   = n >= 3 ? Math.min(8, Math.round(Math.floor((n - 1) / 2) * m.arty)) : 0;
  const soldierSquads = Math.max(0, Math.round((n >= 2 ? Math.floor(n / 2) : 0) * m.soldier));

  for (let i = 0; i < tankCount; i++) {
    const [x, z] = spawnPos(160 + Math.random() * 80);
    const t = new Tank(x, z); scene.add(t.root); enemies.push(t);
  }
  for (let i = 0; i < heliCount; i++) {
    const [x, z] = spawnPos(180 + Math.random() * 90, true);
    const h = new Helicopter(x, z); scene.add(h.root); enemies.push(h);
  }
  for (let i = 0; i < mechCount; i++) {
    const [x, z] = spawnPos(150 + Math.random() * 60);
    const m = new Mech(x, z); markShadowCaster(m.root); scene.add(m.root); enemies.push(m);
  }
  for (let i = 0; i < jetCount; i++) {
    const [x, z] = spawnPos(220 + Math.random() * 60, true);
    const j = new Jet(x, z); scene.add(j.root); enemies.push(j);
  }
  for (let i = 0; i < artyCount; i++) {
    const [x, z] = spawnPos(240 + Math.random() * 80);
    const a = new Artillery(x, z); scene.add(a.root); enemies.push(a);
  }
  // Soldier squads of 5 each
  for (let s = 0; s < soldierSquads; s++) {
    const [cx, cz] = spawnPos(120 + Math.random() * 50);
    for (let i = 0; i < 5; i++) {
      const sx = cx + (Math.random() - 0.5) * 8;
      const sz = cz + (Math.random() - 0.5) * 8;
      const sol = new Soldier(sx, sz); scene.add(sol.root); enemies.push(sol);
    }
  }
  // Phones: of this wave's spawns only the marked big enemies cast
  for (const e of enemies) restrictShadowCasters(e.root);
}

// ---- Floating score popups (HTML overlay) ----
const popupContainer = document.getElementById('popups');
function spawnPopup(worldPos, text, color = '#ffee66') {
  if (!popupContainer) return;
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = text;
  el.style.color = color;
  popupContainer.appendChild(el);
  state.popups.push({ el, worldPos: worldPos.clone(), life: 1.1, maxLife: 1.1 });
}
// Reused projection vector so we don't clone Vector3 28x per frame
const _popV = new THREE.Vector3();
function updatePopups(dt) {
  for (let i = state.popups.length - 1; i >= 0; i--) {
    const p = state.popups[i];
    p.life -= dt;
    if (p.life <= 0) { p.el.remove(); state.popups.splice(i, 1); continue; }
    const t = 1 - p.life / p.maxLife;
    _popV.copy(p.worldPos);
    _popV.y += t * 7;
    _popV.project(camera);
    if (_popV.z > 1 || _popV.z < -1) { p.el.style.opacity = '0'; continue; }
    const x = (_popV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_popV.y * 0.5 + 0.5) * window.innerHeight;
    p.el.style.transform = `translate(${x}px, ${y}px) scale(${1 + t * 0.4})`;
    p.el.style.opacity = String(Math.max(0, 1 - t * 1.2));
  }
}

// ---- Slow-motion on big moments ----
// prio: a request below the priority of the slow-mo still running is dropped;
// equal or higher replaces it (the classic callers are all 0: last one wins).
function slowMo(scale, durSec, prio = 0) {
  const now = performance.now();
  if (now < state.slowMoUntil && prio < _slowPrio) return;
  _slowPrio = prio;
  state.slowMoScale = scale;
  state.slowMoUntil = now + durSec * 1000;
}

// ---- Combo + scoring helpers ----
// (_dmgSrc is set while damage dealt by someone other than the player is
// being applied, e.g. the rival kaiju: none of that scores for the player)
function comboMult() { return Math.min(5, 1 + state.combo * 0.1); }
function bumpCombo() {
  if (_dmgSrc) return;
  state.combo += 1;
  state.comboTimer = state.comboMaxTimer;
  if (state.combo === 10) toastMini('COMBO x2!', 'good');
  if (state.combo === 25) toastMini('UNSTOPPABLE!', 'good');
  if (state.combo === 50) toastMini('CITY WRECKER!', 'good');
}
// Multikill detection: each registered kill within MULTIKILL_WINDOW of the
// last one increments the streak. Crossing 2/3/4/5/6+ triggers escalating
// callouts plus a tiny freeze-frame so the player feels each tier.
const MULTIKILL_WINDOW = 1.4;
const MULTIKILL_TIERS = [
  null, null,
  { label: 'DOUBLE KILL',   color: 'good', score: 200,  slow: 0.55, slowDur: 0.18 },
  { label: 'TRIPLE KILL',   color: 'good', score: 500,  slow: 0.45, slowDur: 0.22 },
  { label: 'MEGA KILL',     color: 'good', score: 1000, slow: 0.35, slowDur: 0.28 },
  { label: 'ULTRA KILL',    color: 'good', score: 2000, slow: 0.30, slowDur: 0.32 },
  { label: 'KAIJU CARNAGE', color: 'good', score: 4000, slow: 0.25, slowDur: 0.40 },
];
function registerKill() {
  if (_dmgSrc) return;
  const now = world.time;
  if (now - (state._lastKillT || 0) <= MULTIKILL_WINDOW) {
    state._multikill = (state._multikill || 1) + 1;
  } else {
    state._multikill = 1;
  }
  state._lastKillT = now;
  const tier = MULTIKILL_TIERS[Math.min(state._multikill, MULTIKILL_TIERS.length - 1)];
  if (tier) {
    toastMini(`${tier.label} +${tier.score}`, tier.color);
    state.score += tier.score;
    if (tier.slow && typeof slowMo === 'function') slowMo(tier.slow, tier.slowDur);
    if (state.kaiju) {
      _tmpV1.copy(state.kaiju.root.position); _tmpV1.y += 18;
      spawnPopup(_tmpV1, tier.label + '!', '#ffaa66');
    }
  }
}
function addScore(base) {
  if (_dmgSrc) return;
  state.score += Math.floor(base * comboMult());
}
function addRage(amount) {
  if (_dmgSrc) return;
  state.rage = Math.min(state.maxRage, state.rage + amount * (state.upgrades?.rageGainMult || 1));
  if (state.rage >= state.maxRage && !state._announcedUlt) {
    state._announcedUlt = true;
    toastMini('ULTIMATE READY · Q', 'good');
  }
  if (state.rage < state.maxRage) state._announcedUlt = false;
}

// ---- Drop helper: spawn a pickup at world pos ----
// A burst (an ultimate, a finisher, a body through a block) rolled a drop per
// building: ~130 pickups in one frame, 4-6 draws each for 14 s (two thirds of
// the frame's draw calls). At most MAX_PICKUPS lie around and two drop per
// frame. A heart the player needs (under half health) still drops: one more
// that frame, and over the cap it takes the place of the oldest non-heart.
const MAX_PICKUPS = isMobile ? 10 : 24;
let _dropT = -1, _dropN = 0;
function maybeDropPickup(pos, source = 'building') {
  const t = rollDrop(source);
  if (!t) return;
  const heart = t === 'hp' && state.hp < state.maxHp * 0.5;
  if (_dropT !== world.time) { _dropT = world.time; _dropN = 0; }
  if (_dropN >= (heart ? 3 : 2)) return;
  let live = 0;
  for (const q of state.pickups) if (!q.dead) live++;
  if (live >= MAX_PICKUPS) {
    const old = heart && state.pickups.find((q) => !q.dead && q.type !== 'hp');
    if (!old) return;
    old.destroy(); // spliced by updateWorld's pickup loop
  }
  _dropN++;
  const p = new Pickup(t, pos.x, 2.5, pos.z);
  scene.add(p.root);
  state.pickups.push(p);
}

world.onTankKilled = () => {
  if (!_dmgSrc) state.tanksKilled++;
  audio.vehicleDestroyed('tank');
  addScore(250); addRage(8); bumpCombo(); registerKill();
  progressObjective('tanks');
};
world.onHeliKilled = () => {
  if (!_dmgSrc) state.helisKilled++;
  audio.vehicleDestroyed('heli');
  addScore(350); addRage(10); bumpCombo(); registerKill();
};
world.onMechKilled = () => {
  if (!_dmgSrc) state.mechsKilled++;
  addScore(700); addRage(18); bumpCombo(); registerKill();
};
world.onJetKilled = () => {
  if (!_dmgSrc) state.jetsKilled++;
  audio.vehicleDestroyed('jet');
  addScore(450); addRage(12); bumpCombo(); registerKill();
  toastMini('JET DOWN!', 'good');
};
world.onArtilleryKilled = () => {
  if (!_dmgSrc) state.artilleryKilled++;
  addScore(400); addRage(10); bumpCombo(); registerKill();
};
world.onSoldierKilled = () => {
  if (!_dmgSrc) state.soldiersKilled++;
  addScore(50); addRage(2); registerKill();
};
world.onBossKilled = () => {
  state.bossesKilled++;
  addScore(5000); addRage(40);
  toast('BOSS DESTROYED · +5000', 'good');
  document.getElementById('boss-bar').style.display = 'none';
  if (state.boss) spawnPopup(state.boss.root.position.clone().setY(14), '+5000', '#ff66aa');
  state.boss = null;
  slowMo(0.25, 0.7);
  world.shake(2.0, 1.0);
  // Flex after boss kill
  if (state.kaiju && state.kaiju.glb) {
    const v = state.monsterCfg.variant;
    const anim = v === 'ghidorah' ? 'cheer' : v === 'mecha' ? 'shrug' : 'flex';
    kaijuOneShot([anim, 'skill2'], 0.2, 1, { commit: 0.5 });
  }
};
world.onBossSlam = () => {
  // Damage to player if too close
  hurtKaiju(22);
  world.shake(1.0, 0.5);
};
world.onBoatSunk = (x, z) => boatSunk(world, x, z);
world.onCarDestroyed = () => {
  audio.carCrush();
  if (_dmgSrc) return; // not the player's doing
  state.carsCrushed++;
  addScore(80); addRage(2);
  progressObjective('cars');
};
world.onCivilianStomped = () => {
  audio.scream();
  if (_dmgSrc) return; // not the player's doing
  state.civiliansStomped++;
  addScore(35); addRage(1);
  progressObjective('civilians');
  // Tiny popup so the player gets feedback on every flatten
  if (state.kaiju) {
    _tmpV1.copy(state.kaiju.root.position); _tmpV1.y += 6;
    spawnPopup(_tmpV1, '+35', '#ffaaaa');
  }
};
world.onPickup = (type, pos) => {
  audio.pickup(type);
  if (pos) world.spawnSparks(pos.clone().setY(2.5), 12);
  if (type === 'hp') {
    state.hp = Math.min(state.maxHp, state.hp + 25);
    if (pos) spawnPopup(pos.clone().setY(4), '+25 HP', '#66ff99');
  } else if (type === 'rage') {
    addRage(30);
    if (pos) spawnPopup(pos.clone().setY(4), '+30 RAGE', '#88ccff');
  } else if (type === 'score') {
    addScore(500);
    if (pos) spawnPopup(pos.clone().setY(4), '+500', '#ffcc44');
  }
};
// One objective channel: the chip at the top of the HUD. Completion turns
// it green with a check and the bonus for a few seconds, then it fades and
// collapses until the next wave (no second centre toast).
let _objHideTimer = 0;
function updateWaveObjectiveText(bonus) {
  const text = document.getElementById('wave-objective-text');
  const count = document.getElementById('wave-objective-count');
  const bar = document.getElementById('wave-objective-bar');
  if (!text) return;
  const o = state.waveObjective;
  if (o.complete) {
    text.textContent = 'OBJECTIVE COMPLETE';
    if (count) count.textContent = bonus ? `+${bonus.toLocaleString()}` : `${o.goal} / ${o.goal}`;
    if (bar) bar.style.transform = 'scaleX(1)';
  } else {
    const lbl = o.label || 'SMASH';
    const noun = o.noun || 'BUILDINGS';
    text.textContent = `${lbl} ${o.goal} ${noun}`;
    if (count) count.textContent = `${o.current} / ${o.goal}`;
    if (bar) bar.style.transform = `scaleX(${o.goal ? Math.min(1, o.current / o.goal) : 0})`;
  }
}
function progressObjective(kind) {
  const obj = state.waveObjective;
  if (!obj || obj.complete || obj.kind !== kind || _dmgSrc) return;
  obj.current++;
  let shown = 0;
  if (obj.current >= obj.goal) {
    obj.complete = true;
    const bonus = 1500 + state.wave * 250;
    addScore(bonus);
    shown = Math.floor(bonus * comboMult());
    const el = document.getElementById('wave-objective');
    if (el) {
      el.classList.add('complete');
      clearTimeout(_objHideTimer);
      _objHideTimer = setTimeout(() => {
        el.classList.add('fade');
        _objHideTimer = setTimeout(() => { if (state.waveObjective.complete) el.style.display = 'none'; }, 600);
      }, 3200);
    }
  }
  updateWaveObjectiveText(shown);
}

world.onBuildingDestroyed = (b) => {
  _miniDirty = true; // its minimap dot goes
  if (_mode.onBuildingDestroyed) _mode.onBuildingDestroyed(b, _dmgSrc || 'player');
  // Brought down by someone else (the rival kaiju): no score, rage, combo, objective or pickup
  if (_dmgSrc) { audio.collapse(); return; }
  state.buildingsDestroyed++;
  audio.collapse();
  progressObjective('buildings');
  const base = Math.floor(b.maxHp * 1.5);
  addScore(base);
  addRage(6);
  bumpCombo();
  // Drop a pickup at the rubble
  maybeDropPickup(b.group.position.clone(), 'building');
  // Floating "+N" with combo multiplier shown
  const shown = Math.floor(base * comboMult());
  spawnPopup(b.group.position.clone().setY(b.h * 0.6), `+${shown}`,
    state.combo >= 5 ? '#ff66aa' : '#ffee66');
};

// ---- Artillery shell support (parabolic) ----
world.spawnArtilleryShell = (origin, target) => {
  // Compute initial velocity to hit target after T seconds
  const T = 2.4;
  const g = 30;
  const vx = (target.x - origin.x) / T;
  const vz = (target.z - origin.z) / T;
  const vy = (target.y - origin.y) / T + 0.5 * g * T;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffaa44 })
  );
  m.position.copy(origin);
  scene.add(m);

  // Ground marker at predicted impact
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xff3344, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(target.x, 0.3, target.z);
  scene.add(ring);

  state.artyShells.push({
    mesh: m, ring, vel: new THREE.Vector3(vx, vy, vz),
    target, life: T + 1.0, damage: 25, gravity: g,
  });
};

// text (optional; else the mode's own, else the classic strings):
// { title, subtitle, waveLabel, waveValue (the "Waves Survived" row),
//   keepPose (the mode has posed the kaiju: no death / dance clip from here) }
function gameOver(victory, text) {
  state.gameOver = true;
  text = text || _mode.gameOverText(victory) || null;
  // Play death or dance animation on GLB model
  if (state.kaiju && state.kaiju.glb && !(text && text.keepPose)) {
    const glb = state.kaiju.glb;
    if (victory) {
      // As a one-shot so per-frame locomotion 'idle' can't override it.
      kaijuOneShot(['dance'], 0.3);
    } else {
      // Godzilla/Mechra have a death anim (hold: stay on the final frame).
      // Rigs without one (Tridon) get a procedural topple instead of
      // standing upright on a stomp end-frame.
      if (!kaijuOneShot(['death', 'dead'], 0.2, 1, { hold: true })) {
        kaijuOneShot(['stomp'], 0.2, 1.6, { hold: true });
        state._topple = { t: 0, side: Math.random() < 0.5 ? 1 : -1, landed: false };
      }
    }
  }
  _hideRunHUD();
  _mode.onGameOver(victory);
  const goEl = document.getElementById('gameover');
  document.getElementById('goTitle').textContent = (text && text.title)
    || (victory ? `${LEVELS[world.level || 'tokyo'].name} FALLS` : 'DEFEATED');
  document.getElementById('goSubtitle').textContent = (text && text.subtitle) || (victory
    ? 'The kaiju reigns supreme.'
    : 'The military has prevailed...');
  if (victory) goEl.classList.add('victory');
  else goEl.classList.remove('victory');
  audio.gameOver();
  audio.stopMusic();
  const isNewHigh = trySetHighScore(state.score);
  const newHighEl = document.getElementById('newHighScore');
  if (newHighEl) newHighEl.style.display = isNewHigh ? 'block' : 'none';
  document.getElementById('goHighScore').textContent = getHighScore().toLocaleString();
  document.getElementById('finalScore').textContent = state.score.toLocaleString();
  const fw = document.getElementById('finalWave');
  fw.textContent = text && text.waveValue !== undefined ? text.waveValue : state.wave;
  if (fw.previousElementSibling) fw.previousElementSibling.textContent = (text && text.waveLabel) || 'Waves Survived';
  document.getElementById('finalBuildings').textContent = state.buildingsDestroyed;
  const totalKills = state.tanksKilled + state.helisKilled + state.mechsKilled +
                     state.jetsKilled + state.artilleryKilled + state.soldiersKilled +
                     state.bossesKilled;
  document.getElementById('finalTanks').textContent = totalKills;
  document.getElementById('finalCivs').textContent = state.civiliansStomped || 0;
  const mins = Math.floor(state.elapsedTime / 60);
  const secs = Math.floor(state.elapsedTime % 60);
  document.getElementById('finalTime').textContent = mins + ':' + String(secs).padStart(2, '0');
  goEl.classList.remove('hidden');
}

// ------------------------- Powers / damage -------------------------
// isTrample = true means the damage source is a footstep stomp. Armoured
// enemies (mech, boss) shrug most of it off - the player has to commit
// to a real attack to kill them rather than just jogging through.
// kind names the attack for whoever is hit ('melee' | 'roar' | 'charge' |
// 'stomp' | 'ult' | 'atomic' | 'military' | 'aoe'). src: who dealt it - null
// or 'player' = the player (upgrade bonus, score, rage, combo); anything else
// ('rival', 'env') gets no bonus and credits nobody, and 'rival' cannot hit
// the rival itself. The player is never damaged here.
function damageInRadius(center, radius, amount, isAerialAlso = true, isTrample = false, kind = 'aoe', src = null) {
  const other = src && src !== 'player' ? src : null;
  if (!other) amount = amount * (state.upgrades?.dmgMult || 1);
  const srcWas = _dmgSrc;
  _dmgSrc = other;
  const radiusSq = radius * radius;
  // Spatial-grid query so we only touch buildings in nearby cells
  const grid = world.buildingGrid;
  if (grid) {
    grid.forEachNear(center.x, center.z, radius + 30, (b) => {
      if (b.destroyed) return;
      const dx = b.group.position.x - center.x;
      const dz = b.group.position.z - center.z;
      const r = Math.max(b.w, b.d) * 0.5;
      const reach = radius + r;
      if (dx * dx + dz * dz < reach * reach) {
        _tmpV1.set(b.group.position.x, b.h * 0.6, b.group.position.z);
        b.damage(amount, _tmpV1, world);
      }
    });
  }
  // Damage enemies
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (e.dead) continue;
    if (!isAerialAlso && e.type === 'heli') continue;
    const ep = e.root.position;
    const dx = ep.x - center.x;
    const dz = ep.z - center.z;
    if (dx * dx + dz * dz < radiusSq) {
      const dealt = (isTrample && e.armored) ? amount * 0.15 : amount;
      e.damage(dealt, world);
      _tmpV1.set(ep.x, ep.y + 4, ep.z);
      world.spawnHitPulse(_tmpV1, 0xffffff);
      if (e.dead && e.type !== 'soldier' && !other) {
        _tmpV2.set(ep.x, ep.y + 8, ep.z);
        spawnPopup(_tmpV2,
          e.type === 'boss' ? '+5000' : (e.type === 'mech' ? '+700' : (e.type === 'jet' ? '+450' : '+250')),
          '#ffee44');
      }
    }
  }
  // The rival kaiju (wrestling): a body-sized target, so its radius counts.
  // Footstep trample is not an attack on it.
  if (_rival && _rival.targetable && !isTrample && other !== 'rival') {
    const rp = _rival.root.position;
    const dx = rp.x - center.x, dz = rp.z - center.z, reach = radius + _rival.radius;
    if (dx * dx + dz * dz < reach * reach) _rival.takeHit(amount, kind, center.x, center.z);
  }
  // Catch cars + civilians too -- any attack in their radius should
  // wreck them outright, not just stomping. Both are 1-shot squishy.
  if (state.cars) {
    for (let i = 0; i < state.cars.length; i++) {
      const c = state.cars[i];
      if (c.dead) continue;
      const cp = c.root.position;
      const dx = cp.x - center.x;
      const dz = cp.z - center.z;
      if (dx * dx + dz * dz < radiusSq) c.explode(world);
    }
  }
  if (state.civilians) {
    for (let i = 0; i < state.civilians.length; i++) {
      const cv = state.civilians[i];
      if (cv.dead) continue;
      const cp = cv.root.position;
      const dx = cp.x - center.x;
      const dz = cp.z - center.z;
      if (dx * dx + dz * dz < radiusSq) cv.die(world);
    }
  }
  // Festival crowds (Chicago's Kaijupalooza!): flattened in the radius;
  // the first few each hit count as stomped civilians
  if (world.crowdHit) {
    const n = world.crowdHit(center.x, center.z, radiusSq);
    for (let i = 0; i < Math.min(n, 3); i++) world.onCivilianStomped();
  }
  _dmgSrc = srcWas;
}

// Aim assist: the live enemy closest to the ray (origin, dir) within
// maxAngle radians (horizontal) and maxDist, weighted toward nearer ones.
// Military units are ~4-7 u next to a 32 u kaiju, so unassisted beams and
// punches almost never connected ("military destroyed 0").
// Angles are horizontal (yaw) only, so pitch never shrinks the cone.
// maxAngleGround (optional) widens the cone for ground units.
function _assistTarget(origin, dir, maxAngle, maxDist, groundOnly, maxAngleGround = maxAngle) {
  let best = null, bestScore = Infinity;
  const fl = Math.hypot(dir.x, dir.z) || 1;
  const fx = dir.x / fl, fz = dir.z / fl;
  const cosAir = Math.cos(maxAngle), cosGround = Math.cos(maxAngleGround);
  // (the rival kaiju, when there is one, is a ground candidate like any other)
  const list = world.enemies, n = list.length;
  for (let i = 0; i <= n; i++) {
    const e = i < n ? list[i] : (_rival ? _rivalView : null);
    if (!e || e.dead) continue;
    const air = e.type === 'heli' || e.type === 'jet';
    if (groundOnly && air) continue;
    const cosMax = air ? cosAir : cosGround;
    const p = e.root.position;
    const dx = p.x - origin.x, dz = p.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d < 1 || d > maxDist) continue;
    const c = (dx * fx + dz * fz) / d;
    if (c < cosMax) continue;
    const score = (1 - c) * 400 + d; // angle dominates, distance breaks ties
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
// Kaiju vs large walkers (BossMech, Mech): cylinder-cylinder push-out of
// the kaiju so it can't stand inside them. Enemy radius comes from its
// bounds once (lazily cached; 0.35x the max horizontal extent so arms and
// cannons don't hold the kaiju off), kaiju radius matches the building
// collision. Small units are crushed instead (crushUnderfoot).
const _SOLID_TYPES = new Set(['boss', 'mech']);
const _solidBox = new THREE.Box3();
const _solidSize = new THREE.Vector3();
function resolveBigEnemyCollisions(pos) {
  const kr = KAIJU_BODY_RADIUS * (state.monsterCfg.stats.scale || 1);
  for (const e of world.enemies) {
    if (e.dead || !_SOLID_TYPES.has(e.type)) continue;
    if (e._bodyR === undefined) {
      _solidBox.setFromObject(e.root).getSize(_solidSize);
      e._bodyR = Math.max(2, Math.max(_solidSize.x, _solidSize.z) * 0.35);
    }
    const ep = e.root.position;
    let dx = pos.x - ep.x, dz = pos.z - ep.z;
    const minD = kr + e._bodyR;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) continue;
    let d = Math.sqrt(d2);
    if (d < 1e-3) { dx = Math.sin(state.yaw); dz = Math.cos(state.yaw); d = 1; dx = -dx; dz = -dz; }
    pos.x = ep.x + (dx / d) * minD;
    pos.z = ep.z + (dz / d) * minD;
  }
}

// Ground units the kaiju walks into are crushed outright (tanks only died
// inside 4.5 u of the kaiju's centre, which its 8 u body rarely reached).
const _CRUSH_TYPES = new Set(['tank', 'artillery', 'soldier']);
function crushUnderfoot() {
  const k = state.kaiju;
  if (!k) return;
  const r = KAIJU_BODY_RADIUS * (state.monsterCfg.stats.scale || 1) + 2.5;
  const p = k.root.position;
  for (const e of world.enemies) {
    if (e.dead || !_CRUSH_TYPES.has(e.type)) continue;
    const ep = e.root.position;
    const dx = ep.x - p.x, dz = ep.z - p.z;
    if (dx * dx + dz * dz < r * r) {
      e.damage(999, world);
      if (e.dead && e.type !== 'soldier') {
        _tmpV2.set(ep.x, ep.y + 6, ep.z);
        spawnPopup(_tmpV2, 'CRUSHED!', '#ffee44');
      }
    }
  }
}

// Procedural death topple for rigs with no death clip: tip the root over
// sideways about its feet with a gravity ease (~1.1 s), then a dust burst
// and camera shake on impact, and freeze the mixer so it lies still.
// rotation.z is applied in the root's local frame (Euler XYZ, after the
// yaw), so it always falls to the kaiju's own left or right.
function _updateTopple(dt) {
  const tp = state._topple, k = state.kaiju;
  if (!tp || !k) return;
  // The world tick is stopped on game over, so the impact dust is ticked here.
  if (tp.fx && !tp.fx.dead) tp.fx.tick(dt);
  tp.t = Math.min(1, tp.t + dt / 1.1);
  const e = tp.t * tp.t; // accelerate like a falling body
  k.root.rotation.z = tp.side * e * Math.PI * 0.47;
  k.root.position.y = -e * 1.5;
  if (tp.t >= 1 && !tp.landed) {
    tp.landed = true;
    world.shake(1.2, 0.5);
    _tmpV1.copy(k.root.position).setY(0);
    tp.fx = makeDustBurst(world, _tmpV1, 26, 10);
    audio.collapse && audio.collapse();
    if (k.glb) k.glb.mixer.timeScale = 0;
  }
}

// Play the first one-shot clip this kaiju actually has (rigs differ: e.g.
// Gorrak has no 'tantrum'/'flex'/'stomp2', Mechra has no 'jump').
function kaijuOneShot(names, fade = 0.15, timeScale = 1, opts) {
  const glb = state.kaiju && state.kaiju.glb;
  if (!glb) return false;
  for (const n of names) if (glb.playOnce(n, fade, timeScale, opts)) return true;
  return false;
}

// Gorrak's atomic breath detonation (atomicBlast.js calls this at the
// detonation instant, a beat after the bolt arrives). Radial damage with
// falloff: the core flattens what it touches, the outer ring softens.
const ATOMIC_RANGE = 190;
const ATOMIC_CORE_R = 30, ATOMIC_OUTER_R = 60;
function _atomicDetonate(pos) {
  if (state.gameOver || !state.kaiju) return;
  const cfg = state.monsterCfg.beam;
  const ground = _tmpV2.set(pos.x, 0.3, pos.z);
  world.spawnShockwave(ground.clone(), cfg.color, ATOMIC_OUTER_R);
  world.spawnShockwave(ground.clone(), 0xeef6ff, ATOMIC_CORE_R * 1.3);
  world.spawnSmokeColumn(_tmpV2.set(pos.x, 0, pos.z).clone(), isMobile ? 28 : 55);
  if (!isMobile) world.spawnExplosion(_tmpV2.set(pos.x, Math.max(pos.y, 6), pos.z).clone(), 3); // fireball + pooled light
  world.shake(1.5, 0.9);
  damageInRadius(pos, ATOMIC_CORE_R, cfg.damage * 2.2, true, false, 'atomic');
  damageInRadius(pos, ATOMIC_OUTER_R, cfg.damage * 0.5, true, false, 'atomic');
  waterImpact(world, pos.x, pos.z, 3, 'ult');
  if (typeof audio.atomicBlast === 'function') audio.atomicBlast(isMobile ? 0.8 : 1);
  else audio.explosion(3);
}

function fireBeam() {
  const cfg = state.monsterCfg.beam;
  if (state.rage < cfg.cost || state.cooldowns.beam > 0) return;
  state.rage -= cfg.cost;
  const variant = state.monsterCfg.variant;
  // Gorrak's breath ends in an atomic detonation: a longer recharge
  const atomic = variant === 'gojira';
  state.cooldowns.beam = atomic ? 6.0 : 4.0;

  state._beamStanceT = 0.6; // pose: head leans forward, jaw opens
  if (state.kaiju.glb) {
    const v = state.monsterCfg.variant;
    const anim = v === 'ghidorah' ? 'cast1' : v === 'mecha' ? 'cast1' : 'skill1';
    kaijuOneShot([anim, 'skill1'], 0.15, 1.3, { commit: 0.6 });
  }
  state.kaiju.head.getWorldPosition(_beamOrigin);
  _beamOrigin.y += 1;
  // direction = camera forward, biased horizontally toward enemies
  _aimDir(_beamDir);
  _beamOrigin.addScaledVector(_beamDir, 5.5);

  const length = atomic ? ATOMIC_RANGE : 260;
  // Snap onto an enemy near the aim (horizontal angle only): ground units
  // within ~20 deg (they sit far below the beam's pitch and are small),
  // air units within ~14 deg. The snapped target is hit directly below,
  // not via the tube test, so a snap can't visually connect yet miss.
  const tgt = _assistTarget(_beamOrigin, _beamDir, 0.25, length, false, 0.35);
  if (tgt) {
    _tmpV1.copy(tgt.root.position); _tmpV1.y += tgt.aimY || 3; // (a kaiju-sized target: its chest)
    _beamDir.subVectors(_tmpV1, _beamOrigin).normalize();
  }
  // The atomic breath travels as a bolt instead (fired below, once the
  // detonation point is known)
  if (!atomic) world.spawnBeam(_beamOrigin, _beamDir, length, cfg.color, cfg.glow);
  world.shake(0.3, 0.4);
  audio.beam();
  if (atomic && typeof audio.atomicCharge === 'function') audio.atomicCharge();

  // Per-variant beam signature: a few extras spawned alongside the beam.
  if (variant === 'ghidorah') {
    // GRAVITY BEAM = a continuous chain of lightning bolts running the
    // FULL beam length, plus extra branching arcs every 50u for the
    // electrical-storm read. Bolts are thick + last 0.65s so they're
    // dominant, not a subtle fork next to a green tube.
    //
    // Visibility from the chase cam: the camera looks straight down the
    // beam from behind Tridon, so bolts ON the beam axis were end-on and
    // hidden by its wings/body. The main bolt now starts 10 u ahead of the
    // head and coils around the axis (helix, radius ~3.5 u), and two
    // extra bolts leap from the wing tips (beside the body, in view) and
    // converge onto the beam ~50 u out.
    const right = _tmpV1.crossVectors(_beamDir, THREE.Object3D.DEFAULT_UP).normalize().clone();
    const up2 = new THREE.Vector3().crossVectors(right, _beamDir).normalize();
    const SEGS = 6;
    const START = 10;
    const segLen = (length - START) / SEGS;
    const ph0 = Math.random() * Math.PI * 2;
    const helix = (i) => {
      const p = _beamOrigin.clone().addScaledVector(_beamDir, START + i * segLen);
      const a = ph0 + i * 1.4;
      const r = i === 0 ? 1.0 : 3.5;
      return p.addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r);
    };
    let prev = helix(0);
    for (let i = 0; i < SEGS; i++) {
      const next = helix(i + 1);
      world.effects.push(makeChainLightning(world, prev, next, cfg.color, 1.3, 12));
      prev = next;
    }
    for (const side of [-1, 1]) {
      const wing = _beamOrigin.clone()
        .addScaledVector(right, side * 11).addScaledVector(up2, 4).addScaledVector(_beamDir, -2);
      const meet = _beamOrigin.clone().addScaledVector(_beamDir, 45 + Math.random() * 15);
      world.effects.push(makeChainLightning(world, wing, meet, cfg.color, 1.2, 10));
    }
    // Branching forks coming off the main bolt
    for (let f = 0; f < 5; f++) {
      const distAlong = 40 + Math.random() * (length - 80);
      const fromP = _beamOrigin.clone().addScaledVector(_beamDir, distAlong);
      const toP = fromP.clone();
      toP.x += (Math.random() - 0.5) * 18;
      toP.y += (Math.random() - 0.5) * 10;
      toP.z += (Math.random() - 0.5) * 18;
      world.effects.push(makeChainLightning(world, fromP, toP, cfg.color, 1.0, 8));
    }
  }

  // Hit detection along ray -- single raycast against the global body IM
  _beamRay.set(_beamOrigin, _beamDir);
  _beamRay.near = 0.5; _beamRay.far = length;
  const beamDmg = cfg.damage * (state.upgrades.dmgMult || 1);
  // The beam stops at the NEAREST building, whether it's an instance in
  // bodiesIM (procedural) or a GLB tower (customMesh, not in bodiesIM, so
  // tested via its footprint AABB). Exactly one building takes the hit,
  // so nothing can be damaged twice by one shot.
  let impactDist = length;
  let hitB = null;
  if (world.bodiesIM) {
    const hits = _beamRay.intersectObject(world.bodiesIM, false);
    for (let hi = 0; hi < hits.length; hi++) {
      const h = hits[hi];
      const b = world.buildings[h.instanceId];
      if (!b || b.destroyed) continue;
      impactDist = h.distance; hitB = b; _beamImpact.copy(h.point);
      break;
    }
  }
  const nearestGLB = _rayNearestGLBBuilding(_beamRay.ray, impactDist, _beamBoxHit);
  if (nearestGLB) { hitB = nearestGLB.b; impactDist = nearestGLB.d; _beamImpact.copy(_beamBoxHit); }
  if (hitB) {
    const hp = _beamImpact.clone();
    hitB.damage(beamDmg, hp, world);
    // (the atomic breath's impact visuals are its detonation)
    if (!atomic) world.spawnExplosion(hp, 0.8);
    // Variant-specific impact signature at the hit point
    if (variant === 'mecha') {
      // Plasma cannon: secondary explosion ring for double-impact
      world.spawnShockwave(hp.clone().setY(0.3), cfg.color, 14);
    } else if (variant === 'ghidorah') {
      // Final lightning crack from origin to hit point
      world.effects.push(makeChainLightning(world, _beamOrigin, hp, cfg.color, 0.3));
    }
  }
  if (_beamDir.y < -1e-3) {
    const tg = -_beamOrigin.y / _beamDir.y;
    if (tg > 0 && tg < impactDist) { impactDist = tg; _beamImpact.copy(_beamOrigin).addScaledVector(_beamDir, tg).setY(0); }
  }
  if (atomic) {
    // Detonate at the first building / ground hit, the snapped target, or
    // max range, whichever comes first
    let det = impactDist;
    if (tgt) {
      const td = _tmpV1.copy(tgt.root.position).sub(_beamOrigin).dot(_beamDir);
      if (td > 0 && td < det) det = td;
    }
    fireAtomicBreath(scene, _beamOrigin, _beamDir, det, cfg.color, _atomicDetonate, { kaijuRoot: state.kaiju.root, world });
  } else if (impactDist < length) {
    if (_beamImpact.y < 1.5) waterImpact(world, _beamImpact.x, _beamImpact.z, 2, 'beam');
    const fx = vfx.spawn('beamImpact', { world, pos: _beamImpact.clone(), color: cfg.color });
    if (fx) world.effects.push(fx);
    else world.spawnHitPulse(_beamImpact.clone(), cfg.color);
  }
  if (tgt && !tgt.dead) {
    _tmpV1.copy(tgt.root.position); _tmpV1.y += tgt.aimY || 4;
    tgt.damage(beamDmg * 0.7, world);
    world.spawnExplosion(_tmpV1, 0.7);
  }
  // Enemy hits along beam (sphere check; uses module-level scratch vectors)
  for (const e of world.enemies) {
    if (e.dead || e === tgt) continue;
    _tmpV1.copy(e.root.position); _tmpV1.y += 4;
    _tmpV2.copy(_tmpV1).sub(_beamOrigin);
    const along = _tmpV2.dot(_beamDir);
    if (along < 0 || along > length) continue;
    _tmpV3.copy(_beamOrigin).addScaledVector(_beamDir, along);
    const distSq = _tmpV3.distanceToSquared(_tmpV1);
    if (distSq < 36) { // 6 u hit tube (was 3 u)
      e.damage(beamDmg * 0.7, world);
      world.spawnExplosion(_tmpV1, 0.7);
    }
  }
  // The rival kaiju, when the aim didn't snap to it: the same tube around its chest, grown by its body
  if (_rival && tgt !== _rivalView && !_rivalView.dead) {
    _tmpV1.copy(_rival.root.position); _tmpV1.y += _rivalView.aimY;
    const along = _tmpV2.copy(_tmpV1).sub(_beamOrigin).dot(_beamDir);
    const tube = 6 + _rival.radius;
    if (along > 0 && along < length && _tmpV3.copy(_beamOrigin).addScaledVector(_beamDir, along).distanceToSquared(_tmpV1) < tube * tube) {
      _rivalView.damage(beamDmg * 0.7, world);
      world.spawnExplosion(_tmpV1, 0.7);
    }
  }
}

function fireRoar() {
  const cfg = state.monsterCfg.roar;
  if (state.rage < cfg.cost || state.cooldowns.roar > 0) return;
  state.rage -= cfg.cost;
  state.cooldowns.roar = 5.0;
  state._roarStanceT = 0.7; // pose: head tilts BACK, jaw wide open
  if (state.kaiju.glb) {
    const v = state.monsterCfg.variant;
    const anim = v === 'ghidorah' ? 'cast2' : v === 'mecha' ? 'cast2' : 'tantrum';
    kaijuOneShot([anim, 'skill2'], 0.15, 1.2, { commit: 0.7 });
  }

  const variant = state.monsterCfg.variant;
  const center = state.kaiju.root.position.clone();
  world.spawnShockwave(center, cfg.color, cfg.radius);
  world.shake(0.8, 0.5);
  damageInRadius(center, cfg.radius, cfg.damage, true, false, 'roar');
  audio.roar();

  // Universal "this is literally a roar" visuals: head-locked breath cone
  // pointing where the camera looks, plus 3 expanding pressure rings so it
  // reads as a sonic blast even from a distance.
  const roarHead = state.kaiju.head;
  const roarHeadPos = new THREE.Vector3();
  roarHead.getWorldPosition(roarHeadPos);
  const roarDir = new THREE.Vector3(Math.sin(state.yaw), 0.05, Math.cos(state.yaw));
  world.effects.push(makeSoundWaveRings(world, roarHeadPos, cfg.color, 3, cfg.radius * 0.95, 1.4));
  world.effects.push(makeBreathCone(world, roarHeadPos, roarDir, 45, cfg.color, 0.8));

  // Per-variant signature VFX layered on top of the shared shockwave.
  if (variant === 'gojira') {
    // PRIMAL ROAR: thick brown dust burst kicked up around the kaiju
    world.effects.push(makeDustBurst(world, center, cfg.radius * 0.4, 14));
  } else if (variant === 'ghidorah') {
    // STORM CRY: chain lightning to every enemy in the radius. Plus a few
    // stray bolts striking the ground for atmosphere.
    const head = state.kaiju.head;
    const headPos = new THREE.Vector3();
    head.getWorldPosition(headPos);
    let arcs = 0;
    for (const e of world.enemies) {
      if (e.dead || arcs > 10) continue;
      const ep = e.root.position.clone();
      const dx = ep.x - center.x, dz = ep.z - center.z;
      if (dx * dx + dz * dz > cfg.radius * cfg.radius) continue;
      ep.y += 4;
      world.effects.push(makeChainLightning(world, headPos, ep, cfg.color, 0.4));
      arcs++;
    }
    // Random ground strikes within radius
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = cfg.radius * (0.4 + Math.random() * 0.55);
      const target = new THREE.Vector3(center.x + Math.cos(a) * r, 0.5, center.z + Math.sin(a) * r);
      world.effects.push(makeChainLightning(world, headPos, target, cfg.color, 0.45));
    }
  } else if (variant === 'mecha') {
    // MISSILE BARRAGE: 8 missiles arcing outward, each exploding on impact.
    makeMissileSwarm(world, center, cfg.radius, 8);
    // Visible launch flash at the kaiju so the player sees the source
    world.effects.push(makeMissileLaunchFlash(world, roarHeadPos));
  }
}

function fireCharge() {
  const cfg = state.monsterCfg.charge;
  if (state.rage < cfg.cost || state.cooldowns.charge > 0) return;
  state.rage -= cfg.cost;
  state.cooldowns.charge = 6.0;
  state._chargeStanceT = 0.45; // pose: deep forward lean, head down
  if (state.kaiju.glb) {
    const v = state.monsterCfg.variant;
    const anim = v === 'ghidorah' ? 'skill3' : v === 'mecha' ? 'skill3' : 'stomp';
    kaijuOneShot([anim, 'stomp'], 0.15, 1.2, { commit: 0.45 });
  }

  const variant = state.monsterCfg.variant;
  const startPos = state.kaiju.root.position.clone();
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));

  // GOJIRA TAIL SWEEP -- doesn't dash. Plants and whips tail in a 180 arc,
  // damaging everything the tail tip passes through. Animation is driven
  // by _tailSwingT in updateKaijuAnim; that function also samples the tail
  // tip's world position each frame and applies damage along its path.
  if (variant === 'gojira') {
    if (state.kaiju.glb) {
      // GLB model: apply tail sweep damage directly (animation handles visuals)
      const sweepCenter = state.kaiju.root.position.clone().addScaledVector(forward, -11);
      damageInRadius(sweepCenter, 25, cfg.damage, false, false, 'charge');
      world.spawnShockwave(sweepCenter, cfg.color, 28);
      world.shake(0.8, 0.4);
      world.effects.push(makeTailSweep(world, state.kaiju.root.position, state.yaw, cfg.color));
    } else {
      state._tailSwingT     = 0.75;
      state._tailSwingD     = 0.75;
      state._tailSwingDir   = Math.random() < 0.5 ? 1 : -1;
      state._tailSwingArcSpawned = false;
    }
    audio.charge();
    return;
  }

  // Other variants DASH forward.
  const cone = startPos.clone().addScaledVector(forward, 17);
  damageInRadius(cone, 28, cfg.damage, false, false, 'charge');
  state.kaiju.root.position.addScaledVector(forward, 32);
  resolveBuildingCollisions(state.kaiju.root.position, 0.5);
  const endPos = state.kaiju.root.position.clone();
  world.spawnShockwave(endPos, cfg.color, 32);
  world.shake(0.7, 0.4);
  damageInRadius(endPos, 25, cfg.damage * 0.5, false, false, 'charge');
  audio.charge();

  // Universal motion read: 10 wind streaks fanning forward from the dash
  // start so the player sees the impact direction even from behind.
  const streakOrigin = startPos.clone(); streakOrigin.y += 11;
  world.effects.push(makeWindStreaks(world, streakOrigin, forward, 0xffffff, 10));

  // Per-variant signature trail
  if (variant === 'ghidorah') {
    // WING SLAM: magenta crescent slash arc at the end of the dash plus
    // big visible wing-flap fans from each side so the wing-attack reads.
    world.effects.push(makeWingSlash(world, endPos, state.yaw, cfg.color));
    world.effects.push(makeWingFlap(world, endPos, -1, cfg.color));
    world.effects.push(makeWingFlap(world, endPos,  1, cfg.color));
  } else if (variant === 'mecha') {
    // ROCKET DASH: blue afterburner cone behind the dash path
    const trail = makeAfterburnerTrail(world, startPos, endPos, cfg.color);
    if (trail) world.effects.push(trail);
  }
}

function fireStomp() {
  if (state.rage < 15 || state.cooldowns.stomp > 0) return;
  state.rage -= 15;
  state.cooldowns.stomp = 1.5;
  // Begin a JUMP. The actual ground impact (shockwave + AOE damage) fires
  // at the apex's down-leg in updateKaijuAnim when the jump phase lands.
  // _stompJumpT is total airtime, _stompJumpD is total airtime (constant
  // for normalizing) and _stompImpacted prevents double-impact.
  state._stompJumpT = 0.55;
  state._stompJumpD = 0.55;
  state._stompImpacted = false;
  // Jump clip squashed to the 0.55 s airtime + ~0.45 s landing (Gorrak's
  // Basic_Jump is 5.9 s). Mechra has no jump: Angry_Stomp at 2.2x.
  if (!kaijuOneShot(['jump'], 0.1, 1, { duration: 1.0 })) {
    kaijuOneShot(['stomp'], 0.1, 2.2, { commit: 0.9 });
  }
  audio.charge && audio.charge(); // launch whoosh
}

function fireUltimate() {
  if (state.rage < 100 || state.cooldowns.ult > 0) return;
  state.rage = 0;
  // Long cooldown to keep ultimates as a real moment of power instead
  // of a spammable spell. The HUD power bar already shows the countdown
  // generically from state.cooldowns[id].
  state.cooldowns.ult = 20.0;
  state._announcedUlt = false;
  toast('ULTIMATE UNLEASHED!', 'good');
  showMessage('!!! KAIJU FURY !!!', 1.4);
  audio.ult();
  if (state.kaiju.glb) {
    const v = state.monsterCfg.variant;
    const anim = v === 'ghidorah' ? 'cast3' : v === 'mecha' ? 'cast3' : 'stomp2';
    kaijuOneShot([anim, 'stomp', 'skill2'], 0.1, 1.2, { commit: 1.0 });
  }
  slowMo(0.45, 0.5);

  const cfg = state.monsterCfg;
  const head = state.kaiju.head;
  const origin = new THREE.Vector3();
  head.getWorldPosition(origin);
  const dir = _aimDir(new THREE.Vector3());
  origin.addScaledVector(dir, 7.0);

  world.shake(2.5, 1.4);
  const center = state.kaiju.root.position.clone();
  // Massive AOE damage in all variants -- the *visual* differs.
  damageInRadius(center, 130, 250, true, false, 'ult');
  waterImpact(world, center.x, center.z, 3, 'ult');

  if (cfg.variant === 'gojira') {
    // GOJIRA -- ATOMIC DEVASTATION
    // Mushroom-cloud nuke. Mega beam + radial blast + radioactive green
    // dome + full mushroom cloud (stem, cap, debris, wisps) + a cascade of
    // staggered shockwaves so the "fallout" keeps radiating for a full
    // second after impact.
    world.spawnBeam(origin, dir, 360, cfg.beam.color, cfg.beam.glow);
    // Initial green hemispherical blast
    world.effects.push(makeAtomicDome(world, center, 160, cfg.beam.color));
    // Mushroom cloud + flash + debris + rising wisps (the showpiece)
    world.effects.push(makeAtomicDevastation(world, center, cfg.beam.color));
    // Big rolling dust ring at ground zero
    world.effects.push(makeDustBurst(world, center, 110, 22));
    // Cascading shockwaves so the blast keeps "radiating" outward
    setTimeout(() => world.spawnShockwave(center.clone(), cfg.beam.color, 200), 180);
    setTimeout(() => world.spawnShockwave(center.clone(), cfg.beam.glow,  260), 380);
    setTimeout(() => world.spawnShockwave(center.clone(), 0xeeffaa,       320), 620);
    setTimeout(() => world.shake(2.0, 0.9), 200);
    showMessage('☢\uFE0E ATOMIC DEVASTATION ☢\uFE0E', 1.4);
  } else if (cfg.variant === 'ghidorah') {
    // GHIDORAH -- LIGHTNING STORM
    // Chain lightning from each of the kaiju's heads to every enemy in
    // range, plus a flurry of ground strikes for atmosphere.
    const heads = [state.kaiju.head];
    // Find side-head groups (added in monsters.js) heuristically
    state.kaiju.root.traverse((o) => { if (o.userData && o.userData.isSideHead) heads.push(o); });
    let arcs = 0;
    for (const e of world.enemies) {
      if (e.dead || arcs > 16) continue;
      const ep = e.root.position.clone();
      const dx = ep.x - center.x, dz = ep.z - center.z;
      if (dx * dx + dz * dz > 130 * 130) continue;
      ep.y += 4;
      const fromH = heads[arcs % heads.length];
      const fromP = new THREE.Vector3();
      fromH.getWorldPosition(fromP);
      world.effects.push(makeChainLightning(world, fromP, ep, cfg.beam.color, 0.55));
      arcs++;
    }
    // Random sky-to-ground strikes
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 130 * (0.4 + Math.random() * 0.55);
      const skyP = new THREE.Vector3(center.x + Math.cos(a) * r, 80, center.z + Math.sin(a) * r);
      const groundP = new THREE.Vector3(skyP.x, 0.6, skyP.z);
      world.effects.push(makeChainLightning(world, skyP, groundP, cfg.beam.color, 0.5, 12));
      // Each strike kicks a small explosion at impact
      setTimeout(() => world.spawnExplosion?.(groundP, 0.8), 250);
    }
    setTimeout(() => world.spawnShockwave(center.clone(), cfg.beam.glow, 160), 200);
    showMessage('ϟ THUNDERSTORM ϟ', 1.4);
  } else if (cfg.variant === 'mecha') {
    // MECHAKAI -- MISSILE BARRAGE + PLASMA BEAM
    // 16 missiles ringing outward in two staggered waves + a giant plasma
    // beam covering the front arc + secondary shockwaves.
    world.spawnBeam(origin, dir, 360, cfg.beam.color, cfg.beam.glow);
    makeMissileSwarm(world, center, 120, 10);
    world.effects.push(makeMissileLaunchFlash(world, origin));
    setTimeout(() => {
      makeMissileSwarm(world, center, 130, 8);
      world.effects.push(makeMissileLaunchFlash(world, origin));
    }, 280);
    setTimeout(() => world.spawnShockwave(center.clone(), cfg.beam.color, 170), 180);
    showMessage('☄\uFE0E MISSILE BARRAGE ☄\uFE0E', 1.4);
  } else {
    // Generic fallback (shouldn't hit, but kept for safety)
    world.spawnBeam(origin, dir, 360, cfg.beam.color, cfg.beam.glow);
    world.spawnShockwave(center, 0xffffff, 100);
  }

  // Beam line damage too -- pierce up to 3 buildings along the path.
  // Procedural instances (bodiesIM) and GLB towers (AABB test) are merged
  // and sorted by distance; a Set guards against hitting one twice.
  const ray = new THREE.Raycaster(origin, dir, 0.5, 360);
  const cands = _rayGLBBuildingsAll(ray.ray, 360);
  if (world.bodiesIM) {
    for (const h of ray.intersectObject(world.bodiesIM, false)) {
      const b = world.buildings[h.instanceId];
      if (b && !b.destroyed) cands.push({ b, d: h.distance, point: h.point });
    }
  }
  cands.sort((a, c) => a.d - c.d);
  const pierced = new Set();
  for (let i = 0; i < cands.length && pierced.size < 3; i++) {
    const { b, point } = cands[i];
    if (b.destroyed || pierced.has(b)) continue;
    pierced.add(b);
    b.damage(300, point, world);
    world.spawnExplosion(point, 1.4);
  }
}

function fireMelee() {
  if (state.cooldowns.melee > 0) return;
  state.cooldowns.melee = 0.6;
  const forward = _fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  // _impact is safe here -- damageInRadius internally writes to _tmpV1/_tmpV2
  // but never touches _impact, so the center vector survives the loop.
  const center = _impact.copy(state.kaiju.root.position).addScaledVector(forward, 14);
  // Assist: a ground unit within 36 u and ~70 deg of facing pulls the
  // swing centre onto it (capped at 30 u from the kaiju).
  const mt = _assistTarget(state.kaiju.root.position, forward, 1.2, 36, true);
  if (mt) {
    center.copy(mt.root.position).setY(0);
    _tmpV3.subVectors(center, state.kaiju.root.position).setY(0);
    if (_tmpV3.length() > 30) center.copy(state.kaiju.root.position).addScaledVector(_tmpV3.normalize(), 30);
  }
  const dmg = state.monsterCfg.stats.melee;
  damageInRadius(center, 17, dmg, false, false, 'melee');
  state.rage = Math.min(state.maxRage, state.rage + 4);
  // Animate arm swing (GLB uses punch combo, procedural uses armR swing)
  if (state.kaiju.glb) {
    // Full combo when standing; walking may cut in after 0.6 s.
    state.kaiju.glb.playOnce('punch', 0.1, 1.4, { commit: 0.6 });
  } else {
    const armR = state.kaiju.bones?.armR;
    if (armR) armR.userData.swing = 0.4;
  }
  audio.hit();
}

// ------------------------- Collision -------------------------
// Resolve kaiju-vs-buildings as a circle-vs-AABB push, while wearing the
// building down. Walking into a building no longer phases through it; you
// have to crush it down (or use beam/charge/melee) to pass.
const KAIJU_BODY_RADIUS = 8.1;
// radius / wearDps default to the player's body and the classic 35 dps; a
// mode passes its own for another body (the rival kaiju). Returns the last
// building pushed against this call, or null.
let _bumped = null;
function resolveBuildingCollisions(pos, dt, radius = 0, wearDps = 35) {
  if (!radius) {
    if (!state.monsterCfg) return null;
    radius = KAIJU_BODY_RADIUS * (state.monsterCfg.stats.scale || 1);
  }
  const grid = world.buildingGrid;
  if (!grid) return null;
  _bumped = null;
  // Only query the cells the kaiju overlaps -- typically 1-4 buildings.
  grid.forEachNear(pos.x, pos.z, radius + 30, (b) => {
    if (b.destroyed) return;
    const bx = b.group.position.x;
    const bz = b.group.position.z;
    const halfW = b.w / 2;
    const halfD = b.d / 2;

    // Quick reject (single-distance test against bounding circle of building)
    const ddx = pos.x - bx;
    const ddz = pos.z - bz;
    const maxR = Math.max(halfW, halfD) + radius;
    if (ddx * ddx + ddz * ddz > maxR * maxR) return;

    // Closest point on the AABB footprint
    const cx = THREE.MathUtils.clamp(pos.x, bx - halfW, bx + halfW);
    const cz = THREE.MathUtils.clamp(pos.z, bz - halfD, bz + halfD);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dist2 = dx * dx + dz * dz;
    if (dist2 >= radius * radius) return;

    let contactX, contactZ;
    if (dist2 < 1e-4) {
      // Center is inside the box -- pop out the nearest edge
      const exitL = pos.x - (bx - halfW);
      const exitR = (bx + halfW) - pos.x;
      const exitN = pos.z - (bz - halfD);
      const exitS = (bz + halfD) - pos.z;
      const m = Math.min(exitL, exitR, exitN, exitS);
      if (m === exitL)      { pos.x = bx - halfW - radius; contactX = bx - halfW; contactZ = pos.z; }
      else if (m === exitR) { pos.x = bx + halfW + radius; contactX = bx + halfW; contactZ = pos.z; }
      else if (m === exitN) { pos.z = bz - halfD - radius; contactZ = bz - halfD; contactX = pos.x; }
      else                  { pos.z = bz + halfD + radius; contactZ = bz + halfD; contactX = pos.x; }
    } else {
      const dist = Math.sqrt(dist2);
      const nx = dx / dist, nz = dz / dist;
      pos.x = cx + nx * radius;
      pos.z = cz + nz * radius;
      contactX = cx; contactZ = cz;
    }

    // Continuous wear-down: ~35 dps to the building you push into
    _bumped = b;
    _tmpV1.set(contactX, b.h * 0.6, contactZ);
    if (wearDps) b.damage(wearDps * dt, _tmpV1, world);
  });
  return _bumped;
}

function updatePlayer(dt) {
  const k = state.kaiju;
  if (!k) return;
  // Pull live gamepad state once per frame
  readGamepad();
  // The control gate (_pctl): all defaults in the classic mode
  const C = _pctl;
  // Right stick aims the camera
  if (C.look && (padInput.lookX !== 0 || padInput.lookY !== 0)) {
    if (C.faceYaw === null) state.yaw -= padInput.lookX * 0.045;
    state.pitch -= padInput.lookY * 0.030;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.6, 0.4);
  }
  // Lock-on: the facing (and with it the chase cam and the aim) is steered for the player
  if (C.faceYaw !== null) {
    const d = C.faceYaw - state.yaw;
    state.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * (1 - Math.exp(-C.faceRate * dt));
  }
  const sprint = keys.ShiftLeft || keys.ShiftRight || touchInput.sprint || padInput.sprint;
  // Speed multipliers bumped: walk ~16 (was 11), sprint ~28 (was 18). Combined
  // with the per-monster `stats.speed` scalar this is roughly +50% across the
  // board so the kaiju actually feels like a kaiju.
  const speed = state.monsterCfg.stats.speed * (sprint ? 32 : 18) * state.upgrades.speedMult * wadeSpeedMult() * C.move;

  let mx = 0, mz = 0;
  if (keys.KeyW) mz += 1;
  if (keys.KeyS) mz -= 1;
  if (keys.KeyA) mx -= 1;
  if (keys.KeyD) mx += 1;
  // Add touch joystick input (overrides if pressed)
  if (touchInput.moveX !== 0 || touchInput.moveZ !== 0) {
    mx += touchInput.moveX;
    mz += touchInput.moveZ;
  }
  // Gamepad left stick
  if (padInput.moveX !== 0 || padInput.moveZ !== 0) {
    mx += padInput.moveX;
    mz += padInput.moveZ;
  }
  // This frame's raw input for modes with their own actions (ctx.input)
  {
    const l = Math.hypot(mx, mz), s = l > 1 ? 1 / l : 1;
    _in.moveX = mx * s; _in.moveZ = mz * s;
    _in.sprint = !!sprint;
    _in.attack = !!(state.mouseDown || touchInput.attackHeld || padInput.attack);
  }

  // Movement basis: the facing, unless a mode's camera supplies its own
  const basis = C.moveYaw !== null ? C.moveYaw : state.yaw;
  const sy = Math.sin(basis), cy = Math.cos(basis);
  const forward = _fwd.set(sy, 0, cy);
  // Camera-right vector. forward x up in a right-handed system gives
  // (-cos(yaw), 0, sin(yaw)) -- the previous (cos, 0, -sin) was the
  // negation, so D strafed left and A strafed right.
  const right = _right.set(-cy, 0, sy);
  const move = _move.set(0, 0, 0);
  move.addScaledVector(forward, mz);
  move.addScaledVector(right, mx);
  if (move.lengthSq() > 0) move.normalize();

  state.vel.x = move.x * speed;
  state.vel.z = move.z * speed;

  // ext: an outside system (a grapple, a knockdown, a cinematic) owns the
  // root for now, so nothing below moves, turns or poses it from input
  const ext = C.external;
  if (ext) {
    state.vel.x = 0; state.vel.z = 0;
  } else {
  k.root.position.x += state.vel.x * dt;
  k.root.position.z += state.vel.z * dt;
  resolveBuildingCollisions(k.root.position, dt);
  resolveBigEnemyCollisions(k.root.position);
  resolveRivalCollision(k.root.position);
  crushUnderfoot();
  // Clamp to play area. The visible distant scenery (silhouette skyline +
  // mountains) starts beyond ~480u so the boundary always reads as
  // "city extends into the distance" instead of "edge of the world".
  // world.bounds: Tokyo's +-330 square, or the level's play rectangle.
  const bd = world.bounds;
  k.root.position.x = THREE.MathUtils.clamp(k.root.position.x, bd.minX, bd.maxX);
  k.root.position.z = THREE.MathUtils.clamp(k.root.position.z, bd.minZ, bd.maxZ);
  }

  // ============== Animation ==============
  const moving = !ext && speed > 0 && move.lengthSq() > 0;

  // --- GLB model animation (Godzilla with loaded model) ---
  if (k.glb) {
    const glb = k.glb;
    // Update the animation mixer
    glb.mixer.update(dt);

    // Turn detection on a SMOOTHED yaw rate (rad/s). The raw per-frame
    // delta is 0 on frames without a mousemove, which made the turn test
    // flicker and restart Walk_Turn <-> Walking ~60x/s. EMA (~0.15 s) +
    // hysteresis (enter 1.1 rad/s, leave 0.55 rad/s) + a 0.3 s minimum
    // hold on each locomotion clip.
    const yawDelta = (state._prevYaw != null) ? (state.yaw - state._prevYaw) : 0;
    state._prevYaw = state.yaw;
    const rawRate = dt > 0 ? yawDelta / dt : 0;
    const ema = 1 - Math.exp(-dt / 0.15);
    state._yawRate = (state._yawRate || 0) + (rawRate - (state._yawRate || 0)) * ema;
    const yr = state._yawRate;
    if (!state._turnDir) {
      if (Math.abs(yr) > 1.1) state._turnDir = Math.sign(yr);
    } else if (Math.abs(yr) < 0.55 || Math.sign(yr) !== state._turnDir) {
      state._turnDir = 0;
    }
    state._locoHoldT = Math.max(0, (state._locoHoldT || 0) - dt);

    // One-shots (attacks, jump, death) are started by the fire*()
    // functions and locked inside glb.playOnce; locomotion requests made
    // meanwhile are deferred by glb.play until the clip's commit window
    // passes (moving) or it finishes (idle), then crossfade back.
    let loco, fade;
    if (moving) {
      const sprint = keys.ShiftLeft || keys.ShiftRight || touchInput.sprint || padInput.sprint;
      if (state._turnDir) {
        // Turning while moving — fall back to walk turns if run turns unavailable
        const left = state._turnDir > 0;
        if (sprint && glb.actions.turnLeft) loco = left ? 'turnLeft' : 'turnRight';
        else loco = left ? 'walkTurnL' : 'walkTurnR';
        fade = 0.2;
      } else {
        loco = sprint ? 'run' : 'walk';
        fade = 0.25;
      }
      if (!glb.actions[loco]) loco = 'walk';
    } else {
      loco = 'idle'; fade = 0.4;
    }
    if (C.loco && !ext && loco !== glb.currentName && (state._locoHoldT <= 0 || glb.oneShotActive)) {
      if (glb.play(loco, fade)) state._locoHoldT = 0.3;
    }

    // Keep yaw rotation driven by player input
    if (!ext) k.root.rotation.y = state.yaw;

    // Vertical bob for stomp jump (parabolic arc)
    state._stompJumpT = Math.max(0, (state._stompJumpT || 0) - dt);
    if (ext) {
      // Taken over mid-jump: the jump is over, its landing blast with it
      state._stompJumpT = 0; state._stompJumpD = 0;
    } else if (state._stompJumpT > 0) {
      const dur = state._stompJumpD || 0.55;
      const t = 1 - state._stompJumpT / dur;
      const JUMP_PEAK_H = 28;
      k.root.position.y = JUMP_PEAK_H * 4 * t * (1 - t);
    } else {
      if (!state._stompImpacted && state._stompJumpD) {
        state._stompImpacted = true;
        state._stompJumpD = 0;
        const impactPos = _impact.copy(k.root.position);
        world.spawnShockwave(impactPos, 0xffcc44, 55);
        world.spawnShockwave(impactPos, 0xffaa66, 30);
        // In water the splash replaces the dust (dust read as dirt on the lake)
        if (!waterImpact(world, impactPos.x, impactPos.z, 2, 'stomp')) world.effects.push(makeDustBurst(world, impactPos, 22, 14));
        world.shake(1.2, 0.55);
        damageInRadius(impactPos, 36, 220, true, false, 'stomp');
        audio.stomp();
      }
      k.root.position.y = 0;
    }

    // Stance timers tick down
    state._beamStanceT   = Math.max(0, (state._beamStanceT   || 0) - dt);
    state._roarStanceT   = Math.max(0, (state._roarStanceT   || 0) - dt);
    state._chargeStanceT = Math.max(0, (state._chargeStanceT || 0) - dt);

    // Walk phase for footstep damage (keep it ticking for game logic)
    if (moving) {
      const sprint = keys.ShiftLeft || keys.ShiftRight || touchInput.sprint || padInput.sprint;
      state.walkPhase += dt * (sprint ? 6.5 : 4.5);
      const phase = state.walkPhase % (Math.PI * 2);
      if (!state._lastPhase) state._lastPhase = phase;
      if ((state._lastPhase < Math.PI && phase >= Math.PI) || (state._lastPhase > phase)) {
        damageInRadius(k.root.position, 11, 60, false, true);
        world.shake(0.10, 0.12);
        if (!waterFootfall(world, k.root.position, sprint)) audio.footstep();
      }
      state._lastPhase = phase;
    }

    // Cooldowns tick
    for (const k2 of Object.keys(state.cooldowns)) {
      state.cooldowns[k2] = Math.max(0, state.cooldowns[k2] - dt);
    }

  } else {
  // --- Procedural animation (Ghidorah, Mecha, fallback) ---
  // Walk cycle: legs swing in opposition, body bobs UP-DOWN twice per
  // step (heel/toe peaks), torso leans FORWARD when moving (more so when
  // sprinting), and ROLLS side-to-side with the planted foot. Tail follows
  // body yaw with a damped lag so it whips behind the kaiju on turns.
  // Head counter-rolls the body sway and bobs slightly out of phase, so
  // the silhouette reads like a real heavy creature instead of a robot.
  if (moving) state.walkPhase += dt * (sprint ? 6.5 : 4.5);
  const sw  = Math.sin(state.walkPhase);
  const sw2 = Math.abs(Math.sin(state.walkPhase * 1.0)); // 0..1, peaks twice per cycle
  const tIdle = world.time;

  // Stance timers tick down -- set externally by fireBeam / fireRoar /
  // fireCharge so the kaiju visibly reacts to firing each power.
  state._beamStanceT   = Math.max(0, (state._beamStanceT   || 0) - dt);
  state._roarStanceT   = Math.max(0, (state._roarStanceT   || 0) - dt);
  state._chargeStanceT = Math.max(0, (state._chargeStanceT || 0) - dt);

  // ----- Body lean / sway / yaw -----
  // Forward lean when moving, big lean when sprinting, plus a small roar-
  // recoil that pushes the body BACK when roaring.
  let leanTarget = moving ? (sprint ? 0.20 : 0.11) : 0.04;
  if (state._beamStanceT > 0)   leanTarget += 0.10 * (state._beamStanceT / 0.6);
  if (state._roarStanceT > 0)   leanTarget -= 0.12 * (state._roarStanceT / 0.6);
  if (state._chargeStanceT > 0) leanTarget += 0.18 * (state._chargeStanceT / 0.45);
  k.root.rotation.x = THREE.MathUtils.damp(k.root.rotation.x || 0, leanTarget, 7, dt);
  // Side roll synced to walk cycle (waddle), tiny when idle
  k.root.rotation.z = moving ? sw * 0.08 : Math.sin(tIdle * 0.7) * 0.012;
  // Yaw stays driven by player input
  k.root.rotation.y = state.yaw;

  // ----- Vertical bob -----
  // Vertical lift peaks twice per leg cycle (foot strikes), heavier when
  // sprinting. Idle: gentle breathing oscillation. JUMP-STOMP overrides
  // both -- a parabolic arc up to ~JUMP_PEAK_H then slamming back down.
  state._stompJumpT = Math.max(0, (state._stompJumpT || 0) - dt);
  if (state._stompJumpT > 0) {
    const dur = state._stompJumpD || 0.55;
    const t = 1 - state._stompJumpT / dur; // 0..1
    // Parabolic arc: peaks at t=0.5, lands at t=1
    const JUMP_PEAK_H = 28;
    k.root.position.y = JUMP_PEAK_H * 4 * t * (1 - t);
    // Heavy forward pitch during the slam-down half (looks like a body slam)
    if (t > 0.55) {
      const slamT = (t - 0.55) / 0.45;
      k.root.rotation.x = (k.root.rotation.x || 0) + slamT * 0.35;
    } else {
      // Slight tuck on the way up
      k.root.rotation.x = (k.root.rotation.x || 0) - (1 - Math.abs(t - 0.5) * 2) * 0.15;
    }
  } else {
    if (!state._stompImpacted && state._stompJumpD) {
      // Just landed -- fire the actual stomp shockwave + AOE here so the
      // visuals/damage line up with the slam frame.
      state._stompImpacted = true;
      state._stompJumpD = 0;
      const impactPos = _impact.copy(k.root.position);
      world.spawnShockwave(impactPos, 0xffcc44, 56);
      world.spawnShockwave(impactPos, 0xffaa66, 34);
      if (!waterImpact(world, impactPos.x, impactPos.z, 2, 'stomp')) world.effects.push(makeDustBurst(world, impactPos, 28, 14));
      world.shake(1.1, 0.5);
      damageInRadius(impactPos, 38, 220, true);
      audio.stomp();
    }
    const bobAmt = moving ? (sprint ? 1.6 : 1.1) : 0.0;
    k.root.position.y = moving
      ? sw2 * bobAmt
      : Math.sin(tIdle * 1.5) * 0.34; // breathing
  }

  // ----- Legs -----
  const legL = k.bones?.legL;
  const legR = k.bones?.legR;
  if (legL && legR) {
    if (moving) {
      legL.rotation.x =  sw * 0.85;
      legR.rotation.x = -sw * 0.85;
      // Lift the swinging leg higher during the forward swing half of cycle
      legL.position.y = (legL.userData._baseY ?? (legL.userData._baseY = legL.position.y)) + Math.max(0, sw) * 0.35;
      legR.position.y = (legR.userData._baseY ?? (legR.userData._baseY = legR.position.y)) + Math.max(0, -sw) * 0.35;
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      // Snap legs back to base height so they don't drift after stop
      if (legL.userData._baseY != null) legL.position.y = legL.userData._baseY;
      if (legR.userData._baseY != null) legR.position.y = legR.userData._baseY;
    }
  }

  // ----- Tail (with yaw lag + walk sway + lift on charge/sprint) -----
  const tail = k.bones?.tail;
  if (tail) {
    state._tailYaw = state._tailYaw == null ? state.yaw : state._tailYaw;
    state._tailYaw = THREE.MathUtils.damp(state._tailYaw, state.yaw, 4, dt);
    const yawLag = state._tailYaw - state.yaw;
    tail.rotation.y = yawLag * 0.7 + Math.sin(tIdle * 1.3) * 0.18 + (moving ? sw * 0.45 : 0);
    // Tail lifts during sprint and during charge stance, droops at rest
    let tailX = moving ? (sprint ? -0.22 : -0.12) : 0.05;
    if (state._chargeStanceT > 0) tailX -= 0.25 * (state._chargeStanceT / 0.45);
    tail.rotation.x = THREE.MathUtils.damp(tail.rotation.x || 0, tailX, 5, dt);
    // Subtle vertical whip
    tail.position.y = (tail.userData._baseY ?? (tail.userData._baseY = tail.position.y)) + (moving ? sw2 * 0.25 : 0);
  }

  // ----- TAIL SWEEP ATTACK (gojira charge) -----
  // Three-phase animation: WINDUP (cock to one side) -> WHIP (180-deg
  // sweep through 0) -> RECOVERY (ease back). During WHIP, sample the
  // tail tip's world position each frame and damage everything in radius.
  state._tailSwingT = Math.max(0, (state._tailSwingT || 0) - dt);
  if (state._tailSwingT > 0 && tail) {
    const dur = state._tailSwingD || 0.75;
    const tt = 1 - state._tailSwingT / dur; // 0..1 progress
    const dir = state._tailSwingDir || 1;
    const chargeCfg = state.monsterCfg && state.monsterCfg.charge;
    let swingY = 0;
    if (tt < 0.22) {
      // WINDUP: ease into cocked-back pose
      const u = tt / 0.22;
      swingY = dir * 1.65 * (u * u);
    } else if (tt < 0.62) {
      // WHIP: fast sweep across through 0 to opposite side (smoothstep)
      const u = (tt - 0.22) / 0.40;
      const eased = u * u * (3 - 2 * u);
      swingY = dir * (1.65 - 3.30 * eased);
      // Tail-tip world position (approx local space: 0, -3, -10)
      _tmpV1.set(0, -3, -10);
      tail.localToWorld(_tmpV1);
      const dmg = chargeCfg ? chargeCfg.damage * 0.07 : 8;
      damageInRadius(_tmpV1, 14, dmg, false);
      // Sparks + dust along the tip path for readability
      if (Math.random() < 0.55) world.effects.push(makeSparks(world, _tmpV1, 5));
      if (Math.random() < 0.30) world.effects.push(makeDustBurst(world, _tmpV1, 8, 4));
      // Spawn the ground-arc visual exactly when the swing crosses the body
      if (!state._tailSwingArcSpawned && eased > 0.45) {
        state._tailSwingArcSpawned = true;
        const arcColor = chargeCfg ? chargeCfg.color : 0xffee44;
        world.effects.push(makeTailSweep(world, k.root.position, state.yaw - dir * 0.3, arcColor));
        world.shake(0.8, 0.4);
      }
    } else {
      // RECOVERY: ease tail back toward neutral
      const u = (tt - 0.62) / 0.38;
      swingY = -dir * 1.65 * (1 - u);
    }
    // Override tail rotation/lift driven by the standard logic above
    tail.rotation.y = swingY;
    tail.rotation.x = -0.22 - 0.20 * Math.abs(Math.sin(tt * Math.PI));
    tail.position.y = (tail.userData._baseY ?? tail.position.y) + 0.7 * Math.abs(Math.sin(tt * Math.PI));
    // Body counter-twist + slight crouch so the swing has visible effort
    k.root.rotation.y = state.yaw + (-dir * 0.32 * Math.sin(tt * Math.PI));
    k.root.rotation.x = (k.root.rotation.x || 0) + 0.10 * Math.sin(tt * Math.PI);
  }

  // ----- Head (counter-sway, idle scan, attack stances) -----
  if (k.head) {
    const head = k.head;
    if (head.userData._baseY == null) head.userData._baseY = head.position.y;
    // Pitch: tiny down-tilt when moving, with bob; idle has slow scanning;
    // beam stance leans head forward; roar stance tilts head BACK (looking up
    // and roaring); charge stance leans head forward + slightly down.
    let pitch = moving ? -0.04 + sw * 0.07 : Math.sin(tIdle * 1.0) * 0.05;
    if (state._beamStanceT > 0)   pitch -= 0.32 * (state._beamStanceT / 0.6);
    if (state._roarStanceT > 0)   pitch += 0.55 * (state._roarStanceT / 0.6);
    if (state._chargeStanceT > 0) pitch -= 0.18 * (state._chargeStanceT / 0.45);
    head.rotation.x = THREE.MathUtils.damp(head.rotation.x || 0, pitch, 9, dt);
    // Yaw scan when idle (creature surveying); counter-roll when moving
    const headYaw = moving ? -sw * 0.06 : Math.sin(tIdle * 0.4) * 0.18;
    head.rotation.y = THREE.MathUtils.damp(head.rotation.y || 0, headYaw, 8, dt);
    // Counter-roll the body sway so the head stays more stable
    head.rotation.z = moving ? -sw * 0.08 : Math.sin(tIdle * 0.6) * 0.025;
    // Head bobs slightly out of phase with the body
    head.position.y = head.userData._baseY - (moving ? sw2 * 0.15 : 0);

    // Jaw opens during beam / roar
    const jaw = head.getObjectByName('jaw');
    if (jaw) {
      let openAmt = 0;
      if (state._beamStanceT > 0) openAmt = 0.5 * (state._beamStanceT / 0.6);
      if (state._roarStanceT > 0) openAmt = Math.max(openAmt, 0.7 * (state._roarStanceT / 0.6));
      jaw.rotation.x = THREE.MathUtils.damp(jaw.rotation.x || 0, openAmt, 12, dt);
    }
  }

  // ----- Arms (opposite swing, melee retains its own animation) -----
  const armL = k.bones?.armL;
  const armR = k.bones?.armR;
  if (armL) armL.rotation.x = THREE.MathUtils.damp(
    armL.rotation.x || 0,
    moving ? -sw * 0.55 : Math.sin(tIdle * 0.8) * 0.05,
    8, dt,
  );
  if (armR) {
    const swing = armR.userData.swing || 0;
    if (swing > 0) {
      armR.rotation.x = -1.5 * Math.sin(swing * Math.PI / 0.4);
      armR.userData.swing = Math.max(0, swing - dt);
    } else {
      armR.rotation.x = THREE.MathUtils.damp(
        armR.rotation.x || 0,
        moving ? sw * 0.55 : -Math.sin(tIdle * 0.8) * 0.05,
        8, dt,
      );
    }
  }
  // Arm side-roll on the swing for an organic shoulder feel
  if (armL) armL.rotation.z = THREE.MathUtils.damp(armL.rotation.z || 0, moving ? -0.15 + sw * 0.08 : -0.12, 6, dt);
  if (armR) armR.rotation.z = THREE.MathUtils.damp(armR.rotation.z || 0, moving ?  0.15 - sw * 0.08 :  0.12, 6, dt);

  // Cooldowns tick
  for (const k2 of Object.keys(state.cooldowns)) {
    state.cooldowns[k2] = Math.max(0, state.cooldowns[k2] - dt);
  }

  // Foot stomp on each step (very light damage)
  if (moving) {
    const phase = state.walkPhase % (Math.PI * 2);
    if (!state._lastPhase) state._lastPhase = phase;
    if ((state._lastPhase < Math.PI && phase >= Math.PI) || (state._lastPhase > phase)) {
      // crossed step -- foot impact hits a small radius hard enough to
      // demolish vehicles / soldiers walked over and chip nearby buildings
      damageInRadius(k.root.position, 7, 60, false, true);
      world.shake(0.08, 0.12);
      if (!waterFootfall(world, k.root.position, sprint)) audio.footstep();
    }
    state._lastPhase = phase;
  }
  } // end else (procedural animation)

  // Wading: depth under the kaiju eases the body down into the water and
  // feeds the wake. The GLB path leaves root y alone outside a stomp jump,
  // the procedural path rewrites it every frame (bob), so set vs. offset.
  const airborne = (state._stompJumpT || 0) > 0;
  if (!ext) {
    updateWading(world, k.root.position, state.vel.x * (moving ? 1 : 0), state.vel.z * (moving ? 1 : 0), dt, airborne);
    if (!airborne) {
      if (k.glb) k.root.position.y = -wadeSink();
      else k.root.position.y -= wadeSink();
    }
  }

  // Trigger powers (each group only while the control gate leaves it to the input)
  if (!ext && C.powers) {
    if (keys.Digit1 || padInput.pressed.beam) fireBeam();
    if (keys.Digit2 || padInput.pressed.roar) fireRoar();
    if (keys.Digit3 || padInput.pressed.charge) fireCharge();
    if (C.ult && (keys.KeyQ || padInput.pressed.ult)) fireUltimate();
    if (keys.Space  || padInput.pressed.stomp) fireStomp();
  }
  if (!ext && C.melee && (state.mouseDown || touchInput.attackHeld || padInput.attack)) fireMelee();
  if (padInput.pressed.pause) togglePause();
}

// ------------------------- Damage direction indicator -------------------------
// Red chevrons around the screen centre pointing at whatever just shot the
// kaiju, so off-screen tanks/helis aren't invisible damage. Pooled DOM
// nodes; the angle is recomputed every frame against the camera so the
// chevron keeps tracking the source while the player turns.
const _dmgInd = [];
const DMG_IND_LIFE = 1.6;
function addDamageIndicator(srcX, srcZ) {
  const root = document.getElementById('dmg-indicators');
  if (!root) return;
  let ind = _dmgInd.find((d) => d.t <= 0);
  if (!ind) {
    if (_dmgInd.length >= 6) ind = _dmgInd.reduce((a, b) => (a.t < b.t ? a : b));
    else {
      const el = document.createElement('div');
      el.className = 'dmg-ind';
      root.appendChild(el);
      ind = { el, x: 0, z: 0, t: 0 };
      _dmgInd.push(ind);
    }
  }
  ind.x = srcX; ind.z = srcZ; ind.t = DMG_IND_LIFE;
}
// Boss wind-up cue: one dedicated pulsing orange chevron that tracks the
// boss's LIVE position for the wind-up duration (it is often beside or
// behind the chase cam when it starts charging).
let _warnInd = null; // { el, src, t }
function addWarnIndicator(src, dur) {
  const root = document.getElementById('dmg-indicators');
  if (!root || !src) return;
  if (!_warnInd) {
    const el = document.createElement('div');
    el.className = 'dmg-ind warn';
    root.appendChild(el);
    _warnInd = { el, src: null, t: 0 };
  }
  _warnInd.src = src; _warnInd.t = dur;
}
function updateWarnIndicator(dt) {
  const w = _warnInd;
  if (!w || w.t <= 0 || !state.kaiju) return;
  w.t -= dt;
  if (w.t <= 0 || state.gameOver || !w.src.root || w.src.dead) {
    w.t = 0; w.el.style.opacity = '0'; return;
  }
  const kp = state.kaiju.root.position, sp = w.src.root.position;
  camera.getWorldDirection(_tmpV1);
  const fx = _tmpV1.x, fz = _tmpV1.z;
  const dx = sp.x - kp.x, dz = sp.z - kp.z;
  const ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
  w.el.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
  w.el.style.opacity = '1';
}
world.onBossWindup = (kind, boss, dur) => {
  addWarnIndicator(boss, dur);
  if (kind === 'volley') { if (typeof audio.bossWindup === 'function') audio.bossWindup(); }
  else if (typeof audio.bossSlamWarn === 'function') audio.bossSlamWarn();
};
function updateDamageIndicators(dt) {
  updateWarnIndicator(dt);
  if (!_dmgInd.length || !state.kaiju) return;
  const kp = state.kaiju.root.position;
  // Camera forward projected on the ground plane.
  camera.getWorldDirection(_tmpV1);
  const fx = _tmpV1.x, fz = _tmpV1.z;
  for (const d of _dmgInd) {
    if (d.t <= 0) continue;
    d.t -= dt;
    if (d.t <= 0 || state.gameOver) { d.t = 0; d.el.style.opacity = '0'; continue; }
    const dx = d.x - kp.x, dz = d.z - kp.z;
    // Screen-space angle (0 = up/ahead, positive = clockwise/right).
    const ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
    d.el.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
    d.el.style.opacity = String(Math.min(1, d.t / (DMG_IND_LIFE * 0.5)));
  }
}

const _camRay = new THREE.Raycaster();
const _camHead = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camCandidates = []; // reused across frames -- we only mutate length
const _camBox = new THREE.Box3();
const _camHit = new THREE.Vector3();
/** Camera boom length from origin along dir (unit) that stays out of the
 *  buildings: desiredDist, pulled in to 1.5u short of the first wall (never
 *  under minDist). Also the occlusion test for a mode's own camera. */
function _camClearDist(origin, dir, desiredDist, minDist = 11) {
  let dist = desiredDist;
  _camRay.set(origin, dir);
  _camRay.far = desiredDist + 2;
  _camRay.near = 0.1;

  // One raycast against the global building InstancedMesh -- Three.js does
  // the per-instance bounds tests internally, no candidate filtering needed.
  if (world.bodiesIM) {
    const hit = _camRay.intersectObject(world.bodiesIM, false)[0];
    if (hit && hit.distance < dist) dist = Math.max(minDist, hit.distance - 1.5);
  }
  // GLB towers and landmarks are separate customMesh roots, not instances
  // in bodiesIM, so the raycast above misses them and the camera dives
  // inside. Test the ray against each nearby building's footprint AABB
  // (w/d/h are rewritten to the GLB's scaled bounds on placement). Boxes
  // that already contain the head are skipped so smashing through a
  // building doesn't yank the camera in.
  if (world.buildingGrid) {
    const midX = origin.x + dir.x * desiredDist * 0.5;
    const midZ = origin.z + dir.z * desiredDist * 0.5;
    world.buildingGrid.forEachNear(midX, midZ, desiredDist * 0.5 + 30, (b) => {
      if (b.destroyed || !b.customMesh) return;
      _camBox.min.set(b.x - b.w / 2, 0, b.z - b.d / 2);
      _camBox.max.set(b.x + b.w / 2, b.h, b.z + b.d / 2);
      if (_camBox.containsPoint(origin)) return;
      if (_camRay.ray.intersectBox(_camBox, _camHit)) {
        const d = _camHit.distanceTo(origin);
        if (d < dist) dist = Math.max(minDist, d - 1.5);
      }
    });
  }
  return dist;
}
// dtReal: real seconds since the last frame (clamped), for a mode's camera
function updateCamera(dtReal = 1 / 60) {
  const k = state.kaiju;
  if (!k) return;
  // Sun offset stays constant relative to the kaiju so shadows follow it
  // through the city without ever overflowing the 90u shadow camera.
  if (sun && (sun.castShadow || _lookLevel !== 'tokyo')) {
    sun.position.copy(k.root.position).add(_sunOffset);
  }
  // A mode's camera (wrestling: fight cam, entrances, finishers) takes the
  // frame when it returns true; the chase cam below is the fallback.
  if (_camOverride && _camOverride(camera, dtReal)) { _camOverridden = true; return; }
  if (_camOverridden) {
    _camOverridden = false;
    if (camera.fov !== CAM_FOV) { camera.fov = CAM_FOV; camera.updateProjectionMatrix(); }
  }
  k.head.getWorldPosition(_camHead);
  const desiredDist = 51;
  _camOffset.set(
    -Math.sin(state.yaw),
    (28 - state.pitch * 25) / desiredDist,
    -Math.cos(state.yaw)
  ).normalize();

  const dist = _camClearDist(_camHead, _camOffset, desiredDist);

  _camTarget.copy(_camHead).addScaledVector(_camOffset, dist);
  const target = _camTarget;
  // Don't let the occlusion pull-in park the camera inside the kaiju's own
  // body (Tridon's wings filled the screen in melee against the boss).
  // If the target lands within the body cylinder, lift it over the
  // shoulders instead, easing so the move isn't a snap.
  if (k._camR) {
    const rp = k.root.position;
    const hx = target.x - rp.x, hz = target.z - rp.z;
    const r = k._camR + 3;
    const top = rp.y + k._camH + 4;
    if (hx * hx + hz * hz < r * r && target.y < top) {
      const inside = 1 - Math.sqrt(hx * hx + hz * hz) / r; // 0 at edge, 1 at axis
      target.y = Math.max(target.y, target.y + (top - target.y) * Math.min(1, 0.6 + inside));
    }
  }
  // Camera shake
  if (world._shakeTime > 0) {
    target.x += (Math.random() - 0.5) * world._shakeMag * 2;
    target.y += (Math.random() - 0.5) * world._shakeMag * 2;
    target.z += (Math.random() - 0.5) * world._shakeMag * 2;
    world._shakeTime -= 1 / 60;
    if (world._shakeTime <= 0) world._shakeMag = 0;
  }
  camera.position.lerp(target, 0.18);
  _camLook.copy(_camHead);
  _camLook.y += state.pitch * 27;
  camera.lookAt(_camLook);
}

// ------------------------- World tick -------------------------
const MAX_EFFECTS = isMobile ? 90 : 180;
const MAX_DEBRIS  = isMobile ? 60 : 140;
const MAX_POPUPS  = 28;

// Debris cleanup: only dispose geometries / materials that the mesh owns.
// GLB-cloned debris shares geom + material with the template (Three.js
// Mesh.copy is shallow), so disposing them would thrash GPU buffers and
// risk freeing resources still in use by living siblings.
function _disposeDebris(d) {
  d?.traverse?.((o) => {
    if (!o.userData?._ownedMat) return;
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose?.();
    }
  });
}

function updateWorld(dt, dtReal = dt) {
  world._fxSpawned = 0;
  world._dbSpawned = 0;
  // Shared instanced sparks/shrapnel/embers (one draw for all of them).
  vfx.tickParticles(dt);
  // Effects
  for (let i = world.effects.length - 1; i >= 0; i--) {
    world.effects[i].tick(dt);
    if (world.effects[i].dead) world.effects.splice(i, 1);
  }
  updateAtomicBlasts(dt); // pooled breath bolts + detonations (not in world.effects: never trimmed)
  // Cap effect count -- splice once instead of shifting in a loop (O(n) vs O(n^2))
  if (world.effects.length > MAX_EFFECTS) {
    const drop = world.effects.length - MAX_EFFECTS;
    for (let i = 0; i < drop; i++) {
      const e = world.effects[i];
      // End it through its own cleanup: an effect owns more than e.mesh (sprites
      // and layers it added to the scene, pooled materials and lights);
      // dropping only the mesh left the rest frozen in the scene for good
      if (e && e.maxLife !== undefined && !e.dead) { e.life = 0; e.tick(0); }
      if (e && e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
      if (e && e.mesh) disposeInstance(e.mesh);
    }
    world.effects.splice(0, drop);
  }

  // Debris physics
  for (let i = world.debris.length - 1; i >= 0; i--) {
    const d = world.debris[i];
    // A chunk that fell into water sinks slowly instead of bouncing
    if (d.userData.sunk) d.userData.vel.y = -2.5;
    else d.userData.vel.y -= 30 * dt;
    d.position.addScaledVector(d.userData.vel, dt);
    d.rotation.x += d.userData.angVel.x * dt;
    d.rotation.y += d.userData.angVel.y * dt;
    d.rotation.z += d.userData.angVel.z * dt;
    if (d.userData.sunk) {
      if (d.position.y < -5) d.userData.life = 0;
    } else if (d.position.y < 0 && !d.userData.landed && (d.userData.landed = true)
      && waterImpact(world, d.position.x, d.position.z, 0.6, 'debris')) {
      d.userData.sunk = true;
      d.userData.vel.x *= 0.2; d.userData.vel.z *= 0.2;
    } else if (d.position.y < 0) {
      d.position.y = 0;
      d.userData.vel.multiplyScalar(0.4);
      d.userData.vel.y = Math.abs(d.userData.vel.y) * 0.3;
      d.userData.life -= dt * 2;
    }
    d.userData.life -= dt;
    if (d.userData.life <= 0) {
      scene.remove(d);
      _disposeDebris(d);
      world.debris.splice(i, 1);
    }
  }
  // Cap debris in a single splice (avoids O(n^2) shift cascade)
  if (world.debris.length > MAX_DEBRIS) {
    const drop = world.debris.length - MAX_DEBRIS;
    for (let i = 0; i < drop; i++) {
      const d = world.debris[i];
      if (d && d.parent) d.parent.remove(d);
      _disposeDebris(d);
    }
    world.debris.splice(0, drop);
  }
  if (state.popups.length > MAX_POPUPS) {
    const drop = state.popups.length - MAX_POPUPS;
    for (let i = 0; i < drop; i++) {
      const p = state.popups[i];
      if (p && p.el) p.el.remove();
    }
    state.popups.splice(0, drop);
  }

  // Enemies
  const kpos = state.kaiju ? state.kaiju.root.position : new THREE.Vector3();
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.dead) { world.enemies.splice(i, 1); continue; }
    // (a run-in sent after the rival kaiju hunts it instead: spawnRunIn)
    e.update(dt, world, e._tgtRival && _rival ? _rival.root.position : kpos);
  }
  audio.updateAmbience(world.enemies, kpos);
  audio.updateStages(world.festStages, kpos, camera);

  // Shells -- compute kaiju centre once per frame, not per shell
  if (state.kaiju) {
    _tmpV3.copy(state.kaiju.root.position); _tmpV3.y += 8;
  }
  for (let i = world.shells.length - 1; i >= 0; i--) {
    const s = world.shells[i];
    s.mesh.position.addScaledVector(s.vel, dt);
    s.life -= dt;
    // Hit kaiju?
    if (state.kaiju) {
      if (s.mesh.position.distanceTo(_tmpV3) < 5) {
        const dealt = hurtKaiju(s.damage);
        world.spawnExplosion(s.mesh.position.clone(), 0.5);
        world.shake(0.25, 0.2);
        state.damageFlash = Math.min(1, state.damageFlash + dealt / 60);
        // Point the damage indicator back along the shell's flight path.
        addDamageIndicator(s.mesh.position.x - s.vel.x, s.mesh.position.z - s.vel.z);
        audio.shellHit();
        scene.remove(s.mesh);
        world.shells.splice(i, 1);
        continue;
      }
    }
    // The rival kaiju stops shells too (its body as an upright cylinder)
    if (_rival && _rival.targetable) {
      const rp = _rival.root.position, sp = s.mesh.position;
      const dx = sp.x - rp.x, dz = sp.z - rp.z, hitR = _rival.radius * 0.6;
      if (dx * dx + dz * dz < hitR * hitR && sp.y > rp.y && sp.y < rp.y + _rival.height) {
        _rival.takeHit(s.damage, 'military', sp.x - s.vel.x, sp.z - s.vel.z);
        world.spawnExplosion(sp.clone(), 0.5);
        scene.remove(s.mesh);
        world.shells.splice(i, 1);
        continue;
      }
    }
    // Buildings block fire: a shell entering a footprint bursts on it.
    if (_shellHitsBuilding(s.mesh.position)) {
      world.spawnExplosion(s.mesh.position.clone(), 0.35);
      scene.remove(s.mesh);
      world.shells.splice(i, 1);
      continue;
    }
    if (s.life <= 0 || s.mesh.position.y < 0) {
      world.spawnExplosion(s.mesh.position.clone(), 0.4);
      scene.remove(s.mesh);
      world.shells.splice(i, 1);
    }
  }

  // The game mode's turn: the wave check (waves), or the match (wrestling)
  _mode.update(dt, dtReal);
  if (_rival) _rivalWorldTick(dt); // the rival kaiju wades and crushes what it stands on, as the player does

  // Slowly regenerate small rage when idle (rageGain upgrade)
  if (_rules.passiveRage) state.rage = Math.min(state.maxRage, state.rage + dt * 1.5 * state.upgrades.rageGainMult);
  // Passive HP regen if upgraded
  if (state.upgrades.regenRate > 0) {
    state.hp = Math.min(state.maxHp, state.hp + state.upgrades.regenRate * dt);
  }
  if (state._dmgWindow) state._dmgWindow *= Math.exp(-dt / DPS_WINDOW);
  // Out-of-combat regen: after OOC_REGEN_DELAY s without taking damage.
  if (_rules.oocRegen && !state.gameOver && state.hp > 0 && world.time - (state._lastHurtT || 0) > OOC_REGEN_DELAY) {
    state.hp = Math.min(state.maxHp, state.hp + OOC_REGEN_RATE * dt);
  }
  // Decay damage flash
  if (state.damageFlash > 0) state.damageFlash = Math.max(0, state.damageFlash - dt * 1.6);
  updateDamageIndicators(dt);

  // Flush any pending GPU uploads for the building InstancedMesh once per
  // frame instead of once per damage event.
  flushBodiesIM(world.bodiesIM);

  // ----- Combo timer -----
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      if (state.combo >= 8) toastMini(`COMBO ENDED · x${state.combo}`, '');
      state.combo = 0;
    }
  }

  // ----- Pickups -----
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const collected = state.pickups[i].update(dt, world, kpos);
    if (state.pickups[i].dead) state.pickups.splice(i, 1);
  }

  // ----- City animators (pigeon flocks etc.) -----
  if (world.cityAnimators) {
    world.kaijuPos = state.kaiju ? state.kaiju.root.position : null; // L train stomp test
    // The level's boats and trains know one kaiju position: with a rival
    // kaiju on the ground, the two take quarter-second turns being it (and
    // what the rival wrecks is not the player's score)
    const rivalTurn = _rival && _rival.root.position.y < 8 && (world.time % 0.5) < 0.25;
    if (rivalTurn) { world.kaijuPos = _rival.root.position; _dmgSrc = 'rival'; }
    for (let i = 0; i < world.cityAnimators.length; i++) {
      world.cityAnimators[i].update(dt, world.time);
    }
    if (rivalTurn) _dmgSrc = null;
  }

  // ----- Boundary barrier pulse -----
  // The cyan ring at the play-area edge fades in only when the kaiju is
  // within 60u of the boundary, so it stays invisible during normal play
  // but gives clear visual feedback the moment the player tries to wander
  // past the city limits.
  if (window.__barrier && state.kaiju) {
    const kx = state.kaiju.root.position.x;
    const kz = state.kaiju.root.position.z;
    const bd = world.bounds;
    const edgeDist = Math.min(kx - bd.minX, bd.maxX - kx, kz - bd.minZ, bd.maxZ - kz);
    const closeness = Math.max(0, (60 - edgeDist) / 60); // 0 beyond 60u from the edge, 1 at limit
    const pulse = 0.5 + 0.5 * Math.sin(world.time * 6);
    window.__barrier.mat.opacity = closeness * (0.18 + 0.20 * pulse);
  }

  // ----- Cars -----
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const c = state.cars[i];
    if (c.dead) { state.cars.splice(i, 1); continue; }
    c.update(dt, world, kpos, 380, isMobile ? 48 : 40);
  }

  // ----- Civilians -----
  for (let i = state.civilians.length - 1; i >= 0; i--) {
    const cv = state.civilians[i];
    if (cv.dead) { state.civilians.splice(i, 1); continue; }
    cv.update(dt, world, kpos, 350);
  }
  // Trickle-respawn -- target population caps. Spawn rate scales with
  // the deficit so a big rampage triggers a flood of fresh civilians/
  // cars rather than a slow trickle.
  const civCap = isMobile ? 28 : 90;
  const civDeficit = Math.max(0, civCap - state.civilians.length);
  if (civDeficit > 0 && Math.random() < dt * Math.min(8, civDeficit * 0.35)) {
    const news = spawnCivilians(scene, 1, 350);
    state.civilians.push(...news);
  }
  const carCap = isMobile ? 38 : 180;
  const carDeficit = Math.max(0, carCap - state.cars.length);
  if (carDeficit > 0 && Math.random() < dt * Math.min(10, carDeficit * 0.3)) {
    const news = spawnCars(scene, 1, 380, isMobile ? 48 : 40);
    state.cars.push(...news);
  }

  // ----- Artillery shells (parabolic) -----
  for (let i = state.artyShells.length - 1; i >= 0; i--) {
    const s = state.artyShells[i];
    s.life -= dt;
    s.vel.y -= s.gravity * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    // Pulse the marker
    if (s.ring) {
      const t01 = 1 - Math.max(0, s.life - 1.0) / 2.4;
      s.ring.material.opacity = 0.3 + Math.sin(world.time * 8) * 0.3;
      s.ring.scale.setScalar(1 + t01 * 0.4);
    }
    if (s.mesh.position.y <= 0 || s.life <= 0) {
      const impact = s.mesh.position.clone().setY(0);
      world.spawnExplosion(impact, 1.5);
      world.shake(0.4, 0.4);
      // AOE damage to player and buildings
      damageInRadius(impact, 18, s.damage * 0.6, false, false, 'military');
      const dx = state.kaiju.root.position.x - impact.x;
      const dz = state.kaiju.root.position.z - impact.z;
      if (dx * dx + dz * dz < 18 * 18) {
        hurtKaiju(s.damage);
        addDamageIndicator(impact.x, impact.z);
      }
      scene.remove(s.mesh);
      if (s.ring) scene.remove(s.ring);
      disposeInstance(s.mesh); if (s.ring) disposeInstance(s.ring);
      state.artyShells.splice(i, 1);
    }
  }

  // ----- Air strikes -----
  // After wave 3, occasionally call in air strikes near the kaiju.
  // Never while a boss is alive: the duel's damage is telegraphed, and a
  // random strike finishing the player mid-fight felt unfair.
  const bossAlive = state.boss && !state.boss.dead;
  if (state.wave >= 3 && state.inWave && !bossAlive && Math.random() < dt * 0.07) {
    spawnAirStrike();
  }
  for (let i = state.airstrikes.length - 1; i >= 0; i--) {
    const a = state.airstrikes[i];
    a.timer -= dt;
    a.ring.material.opacity = 0.4 + Math.sin(world.time * 10) * 0.4;
    if (a.timer <= 0) {
      // Drop bombs in sequence
      const impact = new THREE.Vector3(a.x, 0, a.z);
      world.spawnExplosion(impact, 2.0);
      world.shake(1.0, 0.7);
      damageInRadius(impact, 22, 40, false, false, 'military');
      const dx = state.kaiju.root.position.x - a.x;
      const dz = state.kaiju.root.position.z - a.z;
      if (dx * dx + dz * dz < 22 * 22) {
        hurtKaiju(40);
      }
      scene.remove(a.ring);
      disposeInstance(a.ring);
      state.airstrikes.splice(i, 1);
    }
  }
}

function spawnAirStrike() {
  const kpos = state.kaiju.root.position;
  // Lead the player slightly
  const leadX = kpos.x + state.vel.x * 0.6 + (Math.random() - 0.5) * 30;
  const leadZ = kpos.z + state.vel.z * 0.6 + (Math.random() - 0.5) * 30;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(18, 22, 32),
    new THREE.MeshBasicMaterial({ color: 0xff5544, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(leadX, 0.3, leadZ);
  scene.add(ring);
  state.airstrikes.push({ x: leadX, z: leadZ, ring, timer: 2.2 });
  toast('⚠\uFE0E AIR STRIKE INCOMING ⚠\uFE0E', 'bad');
}

// ------------------------- Minimap -------------------------
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
const MINIMAP_RANGE = 380; // world units shown half-extent

let _mini = null, _miniDirty = true;
function _miniLayer(scale) {
  if (_mini && !_miniDirty && _mini.buildings === world.buildings && _mini.water === world.mapWater && _mini.scale === scale) return _mini;
  _miniDirty = false;
  // Cover every point the minimap can show: the play area (and the city)
  // plus the view's half-extent, at the minimap's own scale
  const bd = world.bounds || { minX: -330, maxX: 330, minZ: -330, maxZ: 330 };
  let x0 = bd.minX, x1 = bd.maxX, z0 = bd.minZ, z1 = bd.maxZ;
  for (const b of world.buildings) { const p = b.group.position; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const pad = MINIMAP_RANGE * 1.5;
  x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
  const canvas = (_mini && _mini.canvas) || document.createElement('canvas');
  canvas.width = Math.ceil((x1 - x0) * scale); canvas.height = Math.ceil((z1 - z0) * scale);
  const c = canvas.getContext('2d');
  // Water (levels that carry outlines): lake, river, ponds; holes cut out
  if (world.mapWater) {
    c.fillStyle = 'rgba(40, 110, 170, 0.55)';
    // One path per body so overlaps (river mouth into the lake) don't cancel
    for (const w of world.mapWater) {
      c.beginPath();
      for (const ring of [w.polygon, ...(w.holes || [])]) {
        for (let i = 0; i < ring.length; i++) {
          const x = (ring[i][0] - x0) * scale, y = (ring[i][1] - z0) * scale;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath();
      }
      c.fill('evenodd');
    }
  }
  // Buildings (simple dots, sampled)
  c.fillStyle = 'rgba(180, 180, 200, 0.35)';
  for (let i = 0; i < world.buildings.length; i += 3) {
    const b = world.buildings[i];
    if (b.destroyed) continue;
    c.fillRect((b.group.position.x - x0) * scale - 1, (b.group.position.z - z0) * scale - 1, 2, 2);
  }
  _mini = { canvas, x0, z0, scale, buildings: world.buildings, water: world.mapWater };
  return _mini;
}
function drawMinimap() {
  if (!minimapCtx || !state.kaiju) return;
  const cw = minimapCanvas.width, ch = minimapCanvas.height;
  const ctx = minimapCtx;
  ctx.clearRect(0, 0, cw, ch);
  // Background grid
  ctx.fillStyle = 'rgba(20, 0, 30, 0.6)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = 'rgba(255, 80, 100, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const v = i * cw / 4;
    ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(cw, v); ctx.stroke();
  }

  const kx = state.kaiju.root.position.x;
  const kz = state.kaiju.root.position.z;
  const scale = (cw / 2) / MINIMAP_RANGE;
  function w2m(x, z) { return [cw / 2 + (x - kx) * scale, ch / 2 + (z - kz) * scale]; }

  // Water and building dots: one cached world-space layer at the minimap's
  // scale, blitted around the kaiju (redrawn only when a building falls or
  // the city changes; drawing them every refresh was ~11 ms at 4x CPU)
  const L = _miniLayer(scale);
  ctx.drawImage(L.canvas, cw / 2 - (kx - L.x0) * scale, ch / 2 - (kz - L.z0) * scale);

  // Pickups (gold)
  ctx.fillStyle = '#ffcc44';
  for (const p of state.pickups) {
    if (p.dead) continue;
    const [x, y] = w2m(p.root.position.x, p.root.position.z);
    if (x < 0 || y < 0 || x > cw || y > ch) continue;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  // Air strikes (red ring)
  ctx.strokeStyle = '#ff3344';
  ctx.lineWidth = 1.5;
  for (const a of state.airstrikes) {
    const [x, y] = w2m(a.x, a.z);
    if (x < 0 || y < 0 || x > cw || y > ch) continue;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
  }

  // Enemies
  for (const e of world.enemies) {
    if (e.dead) continue;
    const [x, y] = w2m(e.root.position.x, e.root.position.z);
    if (x < 0 || y < 0 || x > cw || y > ch) continue;
    if (e.type === 'boss') { ctx.fillStyle = '#ff44aa'; ctx.fillRect(x - 4, y - 4, 8, 8); }
    else if (e.type === 'jet' || e.type === 'heli') { ctx.fillStyle = '#88ccff'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    else if (e.type === 'soldier') { ctx.fillStyle = '#ffaa66'; ctx.fillRect(x - 1, y - 1, 2, 2); }
    else { ctx.fillStyle = '#ff5544'; ctx.fillRect(x - 2, y - 2, 4, 4); }
  }
  // The rival kaiju: a large marker, pinned to the map's edge when it is off it
  if (_rival) {
    const [rx, ry] = w2m(_rival.root.position.x, _rival.root.position.z);
    const x = Math.max(5, Math.min(cw - 5, rx)), y = Math.max(5, Math.min(ch - 5, ry));
    ctx.fillStyle = '#ff44aa'; ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 5, y - 5, 10, 10);
  }

  // Kaiju arrow at center.
  // Forward in world is (sin(yaw), 0, cos(yaw)). The minimap maps world
  // (+X, +Z) to screen (+X, +Y), so the arrow tip should aim at screen
  // (sin(yaw), cos(yaw)) from center. The triangle is drawn pointing
  // canvas-up; after ctx.rotate(R) the tip lands at (sin(R), -cos(R)).
  // Equating the two gives R = PI - yaw.
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(Math.PI - state.yaw);
  ctx.fillStyle = '#66ff99';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// ------------------------- Upgrade choice modal -------------------------
// img = painted card art (emoji icon is the fallback if it fails to load),
// ac = the card's accent glow.
const UPGRADE_POOL = [
  { id: 'hp',    icon: '❤️', img: './assets/ui/upgrades/hp.webp', ac: '#ff4466', name: 'TITAN HEART',    desc: '+30 max HP and full heal', apply: () => { state.maxHp += 30; state.hp = state.maxHp; } },
  { id: 'dmg',   icon: '💥', img: './assets/ui/upgrades/dmg.webp', ac: '#ff8a3c', name: 'CRUSHING BLOWS', desc: '+20% damage to everything', apply: () => { state.upgrades.dmgMult *= 1.2; } },
  { id: 'speed', icon: '🌪️', img: './assets/ui/upgrades/speed.webp', ac: '#7fe0ff', name: 'KAIJU FURY',     desc: '+15% movement speed',      apply: () => { state.upgrades.speedMult *= 1.15; } },
  { id: 'regen', icon: '🩸', img: './assets/ui/upgrades/regen.webp', ac: '#66ff99', name: 'REGEN SCALES',   desc: 'Heal 2 HP / sec passively', apply: () => { state.upgrades.regenRate += 2; } },
  { id: 'rage',  icon: '🔥', img: './assets/ui/upgrades/rage.webp', ac: '#ff7a2a', name: 'WRATH OVERFLOW', desc: '+50% rage gain',           apply: () => { state.upgrades.rageGainMult *= 1.5; } },
  { id: 'combo', icon: '⏱️', img: './assets/ui/upgrades/combo.webp', ac: '#ff3355', name: 'BLOOD FRENZY',   desc: '+1.5s combo timer',        apply: () => { state.comboMaxTimer += 1.5; } },
  { id: 'hpkit', icon: '✨', img: './assets/ui/upgrades/hpkit.webp', ac: '#ffe066', name: 'BATTLE READY',   desc: 'Restore 60 HP and 60 rage', apply: () => { state.hp = Math.min(state.maxHp, state.hp + 60); state.rage = Math.min(state.maxRage, state.rage + 60); } },
];

// Decode the card art when a run starts so the picker never pops in empty.
let _upgradeArtLoaded = false;
function _preloadUpgradeArt() {
  if (_upgradeArtLoaded) return;
  _upgradeArtLoaded = true;
  for (const u of UPGRADE_POOL) { const im = new Image(); im.decoding = 'async'; im.src = u.img; }
}

function _fillUpgradeCard(card, u) {
  card.className = 'ucard';
  card.style.setProperty('--ac', u.ac);
  card.innerHTML = `<div class="u-art"><img class="icon" src="${u.img}" alt="" width="256" height="256" decoding="async"><span class="u-emoji" aria-hidden="true">${u.icon}</span></div><h3>${u.name}</h3><p>${u.desc}</p>`;
  const img = card.querySelector('img');
  img.addEventListener('error', () => img.parentElement.classList.add('noimg'), { once: true });
  return img;
}

// START prewarm for the DOM HUD. Chrome compiles a GPU raster program the
// first time each kind of HUD content is drawn (text shadows, gradients,
// conic sweeps, rounded clips, blended art...); on a cold GPU cache each
// link takes 0.1-2.5 s, and during play that froze the frame the first time
// a popup, toast or cooldown showed up. One of each is drawn, near-invisible
// (opacity 0.01) above the opaque loading screen, from the start of the
// loading screen (so the compiles overlap the downloads) until the end.
// Raster is asynchronous, so the end waits for frames to come back to a
// steady rate (the compositor can't commit while tiles are still compiling).
let _hudPrewarm = null;
function _hudPrewarmBegin() {
  if (_hudPrewarm) return;
  const $ = (id) => document.getElementById(id);
  const hud = $('hud'), powers = $('powers'), obj = $('wave-objective'), boss = $('boss-bar');
  const modal = $('upgrade-modal'), cards = $('upgrade-cards'), msg = $('message'), banner = $('wave-banner');
  const extra = [];
  const touchIds = ['joy-zone', 'joystick', 'attack-btn', 'sprint-btn'];
  _hudPrewarm = { imgs: [], anim: 0, wr: null, restore: () => {
    clearInterval(_hudPrewarm && _hudPrewarm.anim);
    try { if (_hudPrewarm && _hudPrewarm.wr) _hudPrewarm.wr(); } catch (e) { /* hud.start() restores it too */ }
    for (const el of extra) el.remove();
    for (const id of ['hud-toasts', 'mini-toasts']) { const w = $(id); if (w) w.innerHTML = ''; }
    hud.classList.add('hidden');
    powers.classList.add('hidden');
    for (const id of touchIds) $(id)?.classList.add('hidden');
    obj.classList.remove('complete'); obj.style.display = 'none';
    boss.style.display = 'none';
    if (hudRefs.combo) hudRefs.combo.style.opacity = '0';
    $('vitals')?.classList.remove('low');
    hudRefs.lowHp?.classList.remove('active');
    if (hudRefs.damageFlash) hudRefs.damageFlash.style.opacity = '0';
    msg.classList.remove('show'); msg.textContent = '';
    banner.classList.remove('show'); banner.innerHTML = '';
    modal.style.display = 'none'; cards.innerHTML = '';
    _pauseMenu?.classList.add('hidden');
    if (!state.kaiju) minimapCanvas?.classList.add('hidden');
    _hudComboOn = false; _hudLowHp = false; _hudKey = {};
    document.body.classList.remove('hud-prewarm');
  } };
  // The match HUD too (wrestling runs): every state of it, drawn the same
  // way by its own module. Its first appearances were 0.3-0.6 s raster
  // program builds each, in the middle of a match.
  try {
    if (_modeId(selectedLevel) === 'wrestling') {
      if (!_wr) _wr = createWrestling(ctx);
      _hudPrewarm.wr = _wr.W.hud.prewarm();
    }
  } catch (e) {
    warnOnce('prewarm|wrhud', '[prewarm] match HUD prewarm failed:', e && e.message);
  }
  try {
    document.body.classList.add('hud-prewarm');
    hud.classList.remove('hidden');
    powers.classList.remove('hidden');
    if (touchUI) for (const id of touchIds) $(id)?.classList.remove('hidden');
    // Every power state: ready, cooling (sweep + badge), short of rage, ult charging / ready
    buildPowersBar();
    const st = { beam: 'is-ready', roar: 'is-cd', charge: 'is-low', stomp: 'is-ready', ult: 'is-ready' };
    for (const id of Object.keys(st)) {
      const w = hudRefs.pw[id];
      if (!w) continue;
      w.classList.add(st[id]);
      _sweep(w, 0.5);
      _ring(w, 0.6);
      if (hudRefs.cd[id]) hudRefs.cd[id].textContent = '2.5';
    }
    // The sweeps' end points (an empty / full conic is a different gradient
    // program from a partial one), and the ult ring short of rage
    const pwBar = hudRefs.pw.beam?.parentElement;
    const variant = (src, cls, set, v) => {
      if (!src || !pwBar) return;
      const c = src.cloneNode(true);
      c.className = src.className.replace(/is-\w+/g, '') + ' ' + cls;
      set(c, v);
      pwBar.appendChild(c); extra.push(c);
    };
    for (const v of [0, 1]) variant(hudRefs.pw.roar, 'is-cd', _sweep, v);
    // One power cycles ready -> cooling (sweep running down) -> short of rage
    // and the ult ring fills, so the state transitions and every sweep angle
    // are drawn too
    let tick = 0;
    _hudPrewarm.anim = setInterval(() => {
      tick++;
      const w = hudRefs.pw.beam, u = hudRefs.pw.ult;
      if (w) {
        const s = ['is-ready', 'is-cd', 'is-low'][Math.floor(tick / 8) % 3];
        if (!w.classList.contains(s)) { w.classList.remove('is-ready', 'is-cd', 'is-low'); w.classList.add(s); }
        _sweep(w, 1 - (tick % 8) / 8);
      }
      if (u) _ring(u, (tick % 20) / 20);
      // the callouts' fade transitions (ultimate / wave banner)
      if (tick % 16 === 0) { msg.classList.toggle('show'); banner.classList.toggle('show'); }
    }, 50);
    for (const v of [0, 0.25, 0.75, 1]) variant(hudRefs.pw.ult, 'is-low', _ring, v);
    _prewarmMinimap();
    // Bars part-filled (the rage fill starts at scaleX(0): nothing to raster)
    if (hudRefs.hpInner) hudRefs.hpInner.style.transform = 'scaleX(0.6)';
    if (hudRefs.ragInner) hudRefs.ragInner.style.transform = 'scaleX(0.6)';
    obj.style.display = 'flex';
    obj.classList.add('complete');
    boss.style.display = 'block';
    if (hudRefs.combo) hudRefs.combo.style.opacity = '1';
    $('vitals')?.classList.add('low');
    hudRefs.lowHp?.classList.add('active');
    if (hudRefs.damageFlash) hudRefs.damageFlash.style.opacity = '0.85';
    // Toasts keep their real entrance animations (looped), so they raster as
    // the animated layers they are in play
    for (const kind of ['good', 'bad', '']) {
      const t = document.createElement('div'); t.className = 'toast' + (kind ? ' ' + kind : ''); t.textContent = 'WARM UP';
      t.style.animation = 'toastIn 0.6s ease-out infinite alternate'; $('hud-toasts')?.appendChild(t);
      const m = document.createElement('div'); m.className = 'mini-toast' + (kind ? ' ' + kind : ''); m.textContent = 'WARM UP';
      m.style.animation = 'miniToastIn 0.6s ease-out infinite alternate'; $('mini-toasts')?.appendChild(m);
    }
    msg.textContent = '☢︎ WARM UP'; msg.classList.add('show');
    banner.innerHTML = 'WAVE 1<small>WARM UP</small>'; banner.classList.add('show');
    for (const color of ['#ffee66', '#ff66aa']) {
      const pop = document.createElement('div');
      pop.className = 'popup'; pop.textContent = '+1500'; pop.style.color = color;
      pop.style.transform = 'translate(50vw, 50vh) scale(1.2)'; pop.style.opacity = '0.6';
      popupContainer?.appendChild(pop); extra.push(pop);
    }
    const di = $('dmg-indicators');
    for (const cls of ['dmg-ind', 'dmg-ind warn']) {
      const d = document.createElement('div');
      d.className = cls; d.style.opacity = '1';
      di?.appendChild(d); extra.push(d);
    }
    // Upgrade picker (with its art) and the pause sheet
    cards.innerHTML = '';
    _hudPrewarm.imgs = UPGRADE_POOL.slice(0, 3).map((u) => { const c = document.createElement('div'); cards.appendChild(c); return _fillUpgradeCard(c, u); });
    modal.style.display = 'flex';
    _pauseMenu?.classList.remove('hidden');
  } catch (e) {
    warnOnce('prewarm|hud', '[prewarm] HUD prewarm failed:', e && e.message);
  }
}
// One of each minimap draw (grid, even-odd water fill, dots, air-strike
// ring, rotated arrow) so the 2D canvas' raster programs exist before play
function _prewarmMinimap() {
  if (!minimapCtx) return;
  minimapCanvas.classList.remove('hidden');
  const ctx = minimapCtx, cw = minimapCanvas.width;
  ctx.clearRect(0, 0, cw, cw);
  ctx.fillStyle = 'rgba(20, 0, 30, 0.6)'; ctx.fillRect(0, 0, cw, cw);
  ctx.strokeStyle = 'rgba(255, 80, 100, 0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cw / 2, 0); ctx.lineTo(cw / 2, cw); ctx.stroke();
  ctx.fillStyle = 'rgba(40, 110, 170, 0.55)';
  ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(90, 20); ctx.lineTo(60, 90); ctx.closePath();
  ctx.moveTo(40, 30); ctx.lineTo(60, 35); ctx.lineTo(50, 55); ctx.closePath(); ctx.fill('evenodd');
  ctx.fillStyle = '#ffcc44'; ctx.fillRect(100, 100, 4, 4);
  ctx.strokeStyle = '#ff3344'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(150, 150, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(cw / 2, cw / 2); ctx.rotate(0.7);
  ctx.fillStyle = '#66ff99'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
async function _hudPrewarmEnd() {
  const pw = _hudPrewarm;
  if (!pw) return;
  try {
    await Promise.race([Promise.all(pw.imgs.map((im) => im.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]);
    // Wait for 6 frames in a row under 50 ms (raster caught up), 4 s at most
    await new Promise((resolve) => {
      const t0 = performance.now(); let last = t0, ok = 0;
      const step = (now) => {
        ok = now - last < 50 ? ok + 1 : 0; last = now;
        if (ok >= 6 || now - t0 > 4000) resolve(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  } finally {
    pw.restore();
    _hudPrewarm = null;
  }
}

// onChosen: what happens once a card is picked (default: the next wave). A
// mode passes its own continuation (wrestling: back to the bell).
function offerUpgrades(onChosen) {
  state.upgradePending = true;
  state.paused = true;
  document.exitPointerLock?.();
  // Reset menu focus so the first upgrade card is highlighted by default
  _menuPad.focused = 0;
  // Pick 3 random unique upgrades
  const pool = [...UPGRADE_POOL];
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  const wrap = document.getElementById('upgrade-cards');
  wrap.innerHTML = '';
  for (const u of picks) {
    const card = document.createElement('div');
    _fillUpgradeCard(card, u);
    const choose = () => {
      u.apply();
      audio.tone(660, 0.1); audio.tone(880, 0.15);
      toast(`${u.name}!`, 'good');
      document.getElementById('upgrade-modal').style.display = 'none';
      state.upgradePending = false;
      state.paused = false;
      _menuPad.focused = -1;
      if (!touchUI) _requestPointerLock();
      // Now actually advance the wave
      if (state.gameOver) return;
      if (onChosen) onChosen(u); else startWave(state.wave + 1);
    };
    card.addEventListener('click', choose);
    card.addEventListener('touchstart', (e) => { e.preventDefault(); choose(); }, { passive: false });
    wrap.appendChild(card);
  }
  document.getElementById('upgrade-modal').style.display = 'flex';
}

// Mute toggle
const muteBtn = document.getElementById('mute-btn');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    muteBtn.textContent = audio.muted ? 'SOUND · OFF' : 'SOUND · ON';
  });
  muteBtn.textContent = audio.muted ? 'SOUND · OFF' : 'SOUND · ON';
}

// ------------------------- Game modes + the wrestling seam -------------------------
// A level plays one game mode (see _modeId): 'waves', the classic survival
// loop, or 'wrestling', Chicago's title match, which lives in src/wrestling/
// and never imports this file. Everything those modules may do here goes
// through the ctx object below (the contract: notes/wrestling_api.md).

// ---- time ----
let _hitStopUntil = 0; // performance.now() ms: the simulation is frozen (dt = 0) until then
let _slowPrio = 0;     // priority of the slow-mo in force (the classic callers use 0)
let _lastDt = 0;       // last frame's simulation dt (QA)
/** Freeze the simulation for sec real seconds (0.5 at most). Overlapping
 *  calls keep the later end; see tick for how it sits over slow-mo. */
function hitStop(sec) {
  _hitStopUntil = Math.max(_hitStopUntil, performance.now() + Math.min(0.5, sec) * 1000);
}

// ---- damage attribution (see damageInRadius) ----
let _dmgSrc = null;
// ---- this frame's raw input (written by updatePlayer and the listeners) ----
const _in = { moveX: 0, moveZ: 0, sprint: false, attack: false, wheel: 0 };
// ---- mode rules read by updateWorld ----
const _rules = { oocRegen: true, passiveRage: true };

// ---- camera ----
const CAM_FOV = 70; // the chase cam's; an override that changes it gets it put back
let _camOverride = null, _camOverridden = false;
function setCameraOverride(fn) { _camOverride = fn || null; }
/** This frame's world.shake offset for a camera that replaces the chase cam
 *  (which applies it itself); spends the shake timer the same way. */
function shakeOffset(out) {
  if (!(world._shakeTime > 0)) return out.set(0, 0, 0);
  out.set((Math.random() - 0.5) * world._shakeMag * 2, (Math.random() - 0.5) * world._shakeMag * 2, (Math.random() - 0.5) * world._shakeMag * 2);
  world._shakeTime -= 1 / 60;
  if (world._shakeTime <= 0) world._shakeMag = 0;
  return out;
}
/** Aim of the beam and the ultimate: the camera's forward, flattened. Under a
 *  camera override (a fight cam is not behind the kaiju) the kaiju's facing. */
function _aimDir(out) {
  if (_camOverridden) return out.set(Math.sin(state.yaw), -0.12, Math.cos(state.yaw)).normalize();
  camera.getWorldDirection(out);
  out.y *= 0.4;
  return out.normalize();
}

// ---- the rival kaiju as this file sees it ----
// Registered by the mode (ctx.setRivalBody) for as long as it is in play:
// { root, radius, height, aimY, targetable, solid, pushShare,
//   takeHit(amount, kind, srcX, srcZ) }. Every player attack reaches it through
// takeHit: damageInRadius, the beam (snap + tube), shells.
let _rival = null;
// What _assistTarget and the beam's snapped-target path expect of an enemy
const _rivalView = {
  type: 'rival', root: null, aimY: 16,
  get dead() { return !_rival || !_rival.targetable; },
  damage(amount) {
    const p = state.kaiju.root.position;
    if (_rival) _rival.takeHit(amount, 'beam', p.x, p.z);
  },
};
function setRivalBody(body) {
  _rival = body || null;
  _rivalView.root = body ? body.root : null;
  if (body) _rivalView.aimY = body.aimY || 16;
}
// Kaiju-vs-kaiju spacing: the models' real girth (torso, not wings or tail),
// against which KAIJU_BODY_RADIUS (8.1, building collision) lets two of them
// stand inside each other.
const KAIJU_FIGHT_RADIUS = { godzilla: 12, ghidorah: 14, mecha: 12.5 };
function fightRadius(key) { return KAIJU_FIGHT_RADIUS[key] || 12; }
function collideRadius(key) { return KAIJU_BODY_RADIUS * ((MONSTERS[key] && MONSTERS[key].stats.scale) || 1); }
/** Player and rival push each other apart (pos: the player's root position);
 *  the rival gives way by its pushShare of the overlap. */
function resolveRivalCollision(pos) {
  const r = _rival;
  if (!r || !r.solid) return;
  const rp = r.root.position;
  let dx = pos.x - rp.x, dz = pos.z - rp.z;
  const minD = fightRadius(state.monsterKey) + r.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minD * minD) return;
  let d = Math.sqrt(d2);
  if (d < 1e-3) { dx = -Math.sin(state.yaw); dz = -Math.cos(state.yaw); d = 1; }
  const push = minD - d, give = r.pushShare === undefined ? 0.5 : r.pushShare;
  pos.x += dx / d * push * (1 - give); pos.z += dz / d * push * (1 - give);
  rp.x -= dx / d * push * give; rp.z -= dz / d * push * give;
}
// The rival's share of what updatePlayer does for the player's body, every
// frame it is registered: its own wading state, written onto the body for
// its owner to apply (waterDepth 0..1, waterSink = how far to lower the root,
// waterSlow = speed multiplier), ripples and splashes as it moves through
// water, and whatever it stands on crushed (cars, civilians, crowd, small
// military) with nobody scoring. Skipped while it is in the air (root above
// 8 u) or has body.crushes === false.
const _rw = { depth: 0, x: 0, z: 0, rippleT: 0, wasIn: false };
function _rivalWorldTick(dt) {
  const b = _rival, p = b.root.position;
  const grounded = p.y < 8;
  // wading
  const raw = grounded ? waterDepth(p.x, p.z) : 0;
  _rw.depth += (raw - _rw.depth) * (1 - Math.exp(-dt / 0.4));
  b.waterDepth = _rw.depth;
  b.waterSink = 3.2 * _rw.depth;
  b.waterSlow = 1 - 0.22 * _rw.depth;
  const moved = Math.hypot(p.x - _rw.x, p.z - _rw.z);
  _rw.x = p.x; _rw.z = p.z;
  if (raw > 0 && world.water) {
    // (the lake's wake trail is a single uniform, the player's: rings and spray instead)
    if (!_rw.wasIn) waterImpact(world, p.x, p.z, 2, 'stomp');
    _rw.rippleT -= dt * (moved > 0.02 ? 3 : 1);
    if (_rw.rippleT <= 0) {
      _rw.rippleT = 1.6;
      world.water.ripple?.(p.x, p.z, moved > 0.02 ? 0.5 : 0.2);
      if (moved > 0.02) world.water.splash?.(p.x, p.z, 0.5 + 0.5 * _rw.depth, 'foot');
    }
  }
  _rw.wasIn = raw > 0;
  if (!grounded || b.crushes === false || dt <= 0) return;
  // underfoot
  const r = KAIJU_BODY_RADIUS + 1, r2 = r * r;
  _dmgSrc = 'rival';
  for (let i = 0; i < state.cars.length; i++) {
    const c = state.cars[i];
    if (c.dead) continue;
    const dx = c.root.position.x - p.x, dz = c.root.position.z - p.z;
    if (dx * dx + dz * dz < r2) c.explode(world);
  }
  for (let i = 0; i < state.civilians.length; i++) {
    const cv = state.civilians[i];
    if (cv.dead) continue;
    const dx = cv.root.position.x - p.x, dz = cv.root.position.z - p.z;
    if (dx * dx + dz * dz < r2) cv.die(world);
  }
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (e.dead || !_CRUSH_TYPES.has(e.type)) continue;
    const dx = e.root.position.x - p.x, dz = e.root.position.z - p.z;
    if (dx * dx + dz * dz < r2) e.damage(999, world);
  }
  if (world.crowdHit && moved > 0.02) world.crowdHit(p.x, p.z, r2);
  _dmgSrc = null;
}
function _pickRivalKey(playerKey) {
  const others = Object.keys(MONSTERS).filter((k) => k !== playerKey);
  const m = location.search.match(/[?&]rival=(\w+)/); // QA: force the opponent
  return m && others.includes(m[1]) ? m[1] : others[Math.floor(Math.random() * others.length)];
}
/** Swap the rival for another kaiju mid-run (a title defense). The caller has
 *  let go of the old one's root; resolves to the new { key, cfg, glb }. */
async function loadRival(key) {
  if (_rivalCache && _rivalCache.key === key) return _rivalCache;
  if (!MONSTERS[key] || key === state.monsterKey) throw new Error(`loadRival: '${key}' is not a possible rival`);
  const glb = await loadKaijuModel(key);
  if (_rivalCache) _disposeKaijuGLB(_rivalCache.glb);
  _rivalCache = { key, cfg: MONSTERS[key], glb };
  markShadowCaster(glb.root);
  await _preuploadTextures([glb.root]);
  return _rivalCache;
}

// ---- damage and buildings for a body that is not the player ----
/** Hurt the player. o: { raw = true, x, z, flash = true }. raw skips the
 *  wave-keyed scaling and burst cap (a kaiju's blow lands in full) and never
 *  ends the run: HP stops at 0 and the mode decides. raw: false is the classic
 *  path (hurtKaiju). x, z: where it came from, for the damage chevron. */
function hurtPlayer(amount, o) {
  if (!state.kaiju || state.gameOver || !(amount > 0)) return 0;
  let dealt;
  if (o && o.raw === false) dealt = hurtKaiju(amount);
  else {
    dealt = Math.min(amount, Math.max(0, state.hp));
    state.hp -= dealt;
    state._lastHurtT = world.time;
  }
  if (!o || o.flash !== false) state.damageFlash = Math.min(1, state.damageFlash + dealt / 60);
  if (o && o.x !== undefined) addDamageIndicator(o.x, o.z);
  return dealt;
}
const _otherSrc = (src) => (src && src !== 'player' ? src : null);
/** resolveBuildingCollisions for any body; src other than 'player' keeps the wear from scoring. */
function resolveBodyVsBuildings(pos, radius, dt, wearDps = 35, src = 'player') {
  const was = _dmgSrc;
  _dmgSrc = _otherSrc(src);
  const hit = resolveBuildingCollisions(pos, dt, radius, wearDps);
  _dmgSrc = was;
  return hit;
}
function damageBuilding(b, amount, point, src = 'player') {
  const was = _dmgSrc;
  _dmgSrc = _otherSrc(src);
  const r = b.damage(amount, point || null, world);
  _dmgSrc = was;
  return r;
}
function collapseBuilding(b, src = 'player') {
  if (b.destroyed) return;
  const was = _dmgSrc;
  _dmgSrc = _otherSrc(src);
  b.collapse(world);
  _dmgSrc = was;
}
// Building queries (module-level visitors: no closure per call)
const _bq = { x: 0, z: 0, r: 0, dx: 0, dz: 0, cb: null, hit: null };
function _bqNear(b) {
  if (b.destroyed) return;
  const cx = THREE.MathUtils.clamp(_bq.x, b.x - b.w / 2, b.x + b.w / 2), cz = THREE.MathUtils.clamp(_bq.z, b.z - b.d / 2, b.z + b.d / 2);
  const dx = _bq.x - cx, dz = _bq.z - cz;
  if (dx * dx + dz * dz <= _bq.r * _bq.r) _bq.cb(b);
}
/** cb(b) for every standing building whose footprint is within r of (x, z). */
function forEachBuildingNear(x, z, r, cb) {
  const grid = world.buildingGrid;
  if (!grid) return;
  _bq.x = x; _bq.z = z; _bq.r = r; _bq.cb = cb;
  grid.forEachNear(x, z, r + 30, _bqNear);
}
function _bqAt(b) {
  if (!_bq.hit && !b.destroyed && Math.abs(_bq.x - b.x) < b.w / 2 && Math.abs(_bq.z - b.z) < b.d / 2) _bq.hit = b;
}
/** The standing building whose footprint contains (x, z), or null. */
function buildingAt(x, z) {
  const grid = world.buildingGrid;
  if (!grid) return null;
  _bq.x = x; _bq.z = z; _bq.hit = null;
  grid.forEachNear(x, z, 34, _bqAt);
  return _bq.hit;
}
function _bqSweep(b) {
  if (b.destroyed) return;
  // The segment against the footprint grown by the body's radius (slab test)
  const hw = b.w / 2 + _bq.r, hd = b.d / 2 + _bq.r, ox = _bq.x - b.x, oz = _bq.z - b.z;
  let t0 = 0, t1 = 1;
  if (Math.abs(_bq.dx) < 1e-6) { if (Math.abs(ox) > hw) return; } else {
    const a = (-hw - ox) / _bq.dx, c = (hw - ox) / _bq.dx;
    t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
    if (t0 > t1) return;
  }
  if (Math.abs(_bq.dz) < 1e-6) { if (Math.abs(oz) > hd) return; } else {
    const a = (-hd - oz) / _bq.dz, c = (hd - oz) / _bq.dz;
    t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
    if (t0 > t1) return;
  }
  _bq.cb(b, t0);
}
/** cb(b, t) for every standing building a body of `radius` crosses moving
 *  from (x0, z0) to (x1, z1); t = 0..1 where along the move it first touches.
 *  Not sorted: order by t if the order matters. */
function sweepBuildings(x0, z0, x1, z1, radius, cb) {
  const grid = world.buildingGrid;
  if (!grid) return;
  _bq.x = x0; _bq.z = z0; _bq.dx = x1 - x0; _bq.dz = z1 - z0; _bq.r = radius; _bq.cb = cb;
  grid.forEachNear((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(_bq.dx, _bq.dz) / 2 + radius + 30, _bqSweep);
}
/** A landmark's display name ('Willis Tower'), '' for an ordinary building. */
function landmarkName(b) {
  if (!b || !b.landmarkId) return '';
  if (b._lmName === undefined) {
    b._lmName = b.landmarkName ? b.landmarkName.replace(/\s*\(.*\)\s*$/, '')
      : b.landmarkId.replace(/_(rear|twin)$/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return b._lmName;
}

// ---- military run-ins (wrestling interference) ----
const _RUN_IN = { tank: Tank, heli: Helicopter, mech: Mech, jet: Jet, artillery: Artillery, soldier: Soldier };
/** Spawn `count` units of kind ('tank' | 'heli' | 'mech' | 'jet' | 'artillery'
 *  | 'soldier') on a ring around a point, outside any wave bookkeeping.
 *  o: { x, z (centre; default the player), rMin = 150, rMax = 220,
 *  target: 'player' (default) | 'rival' }. Returns how many spawned. */
function spawnRunIn(kind, count = 1, o) {
  const C = _RUN_IN[kind];
  if (!C || !state.kaiju) return 0;
  const air = kind === 'heli' || kind === 'jet';
  const kp = state.kaiju.root.position;
  const cx = o && o.x !== undefined ? o.x : kp.x, cz = o && o.z !== undefined ? o.z : kp.z;
  const rMin = (o && o.rMin) || 150, rMax = (o && o.rMax) || 220;
  const bd = world.bounds, m = 25;
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0, ok = false;
    for (let a = 0; a < 20 && !ok; a++) {
      const ang = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      x = cx + Math.cos(ang) * r; z = cz + Math.sin(ang) * r;
      ok = x > bd.minX + m && x < bd.maxX - m && z > bd.minZ + m && z < bd.maxZ - m && (air || !world.isWater || !world.isWater(x, z));
    }
    if (!ok) { const p = world.landPoint ? world.landPoint() : [world.center.x, world.center.z]; x = p[0]; z = p[1]; }
    const e = new C(x, z);
    if (kind === 'mech') markShadowCaster(e.root);
    e._tgtRival = !!(o && o.target === 'rival');
    scene.add(e.root);
    world.enemies.push(e);
    restrictShadowCasters(e.root);
  }
  return count;
}

// The powers by id (function declarations: hoisted)
const _POWER_FN = { beam: fireBeam, roar: fireRoar, charge: fireCharge, stomp: fireStomp, ult: fireUltimate };
/** Take the result screen back down and carry on with the same run (a title
 *  defense after a win): the simulation runs again, the run HUD and music
 *  return. The mode resets its own actors. False if no result screen is up. */
function continueRun() {
  if (!state.gameOver || !state.kaiju) return false;
  state.gameOver = false;
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('powers').classList.remove('hidden');
  if (!touchUI) document.getElementById('help').classList.remove('hidden');
  else for (const id of ['joy-zone', 'joystick', 'attack-btn', 'sprint-btn']) document.getElementById(id)?.classList.remove('hidden');
  audio.startMusic();
  if (!touchUI) _requestPointerLock();
  return true;
}

// ---- the player as a mode sees it ----
const _playerView = {
  get root() { return state.kaiju ? state.kaiju.root : null; },
  get glb() { return state.kaiju ? state.kaiju.glb : null; },
  get head() { return state.kaiju ? state.kaiju.head : null; },
  get key() { return state.monsterKey; },
  get cfg() { return state.monsterCfg; },
  get hp() { return state.hp; }, set hp(v) { state.hp = v; },
  get maxHp() { return state.maxHp; }, set maxHp(v) { state.maxHp = v; },
  get rage() { return state.rage; }, set rage(v) { state.rage = Math.max(0, Math.min(state.maxRage, v)); },
  get maxRage() { return state.maxRage; },
  get yaw() { return state.yaw; }, set yaw(v) { state.yaw = v; },
  get pitch() { return state.pitch; }, set pitch(v) { state.pitch = THREE.MathUtils.clamp(v, -0.6, 0.4); },
  get vel() { return state.vel; },
  get cooldowns() { return state.cooldowns; },
  get upgrades() { return state.upgrades; },
  get airborne() { return (state._stompJumpT || 0) > 0; },
  get bodyRadius() { return fightRadius(state.monsterKey); },
  get collideRadius() { return collideRadius(state.monsterKey); },
  control: _pctl,
  releaseControl() { Object.assign(_pctl, _PCTL_DEFAULTS); },
  playOnce: kaijuOneShot,
  /** Fire 'beam' | 'roar' | 'charge' | 'stomp' | 'ult' as its key would (same gate, rage and cooldown checks); true if it fired. */
  firePower(id) {
    const fn = _POWER_FN[id];
    if (!fn || !state.kaiju || state.gameOver || _pctl.external || !_pctl.powers || (id === 'ult' && !_pctl.ult)) return false;
    const cd = state.cooldowns[id];
    fn();
    return state.cooldowns[id] > cd;
  },
};

// ---- ctx: the one object the wrestling modules get ----
const ctx = {
  scene, camera, renderer, world, audio, vfx, MONSTERS,
  debug: /[?&]debug\b/.test(location.search),
  quality: Object.freeze({ tier: QUALITY, high: Q_HIGH, med: Q_MED, low: Q_LOW, isMobile, touchUI, glbContent: GLB_CONTENT,
    full: !isMobile && !Q_LOW, shadows: RP.shadows, post: RP.post, particleMul: QUALITY_PROFILE.particleMul }),
  events: null, // the wrestling event bus (createWrestling sets it)
  // time and feel
  slowMo, hitStop,
  get frozen() { return performance.now() < _hitStopUntil; },
  shake(mag, dur) { world.shake(mag, dur); },
  shakeOffset,
  // camera
  setCameraOverride, camClearDist: _camClearDist,
  // the two kaiju
  player: _playerView,
  get rival() { return _rivalCache; },
  loadRival, setRivalBody,
  bodyRadius: fightRadius, collideRadius,
  // damage
  hurtPlayer,
  /** o: { kind = 'aoe', src = 'player', aerial = true } (see damageInRadius). */
  damageInRadius(center, radius, amount, o) {
    damageInRadius(center, radius, amount, !o || o.aerial !== false, false, (o && o.kind) || 'aoe', (o && o.src) || 'player');
  },
  // buildings and the map
  resolveBuildingCollisions: resolveBodyVsBuildings,
  forEachBuildingNear, sweepBuildings, buildingAt, damageBuilding, collapseBuilding, landmarkName,
  clampToBounds(pos) {
    const bd = world.bounds;
    pos.x = THREE.MathUtils.clamp(pos.x, bd.minX, bd.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, bd.minZ, bd.maxZ);
  },
  isWater(x, z) { return !!world.isWater && world.isWater(x, z); },
  /** 0 on land, 0..1 with the depth of the water at (x, z). */
  waterDepth,
  // effects (the budgeted world.spawn* family is on ctx.world)
  fx: {
    dustBurst(pos, radius = 14, count = 8) { const e = makeDustBurst(world, pos, radius, count); if (e) world.effects.push(e); },
    add(effect) { world.effects.push(effect); },
    /** Splash + ripple + sound if (x, z) is water; returns whether it was. */
    waterImpact(x, z, size = 2, kind = 'stomp') { return waterImpact(world, x, z, size, kind); },
  },
  /** Phones: only marked casters keep their shadow. Mark a root you add mid-run. */
  markShadowCaster(root) { markShadowCaster(root); restrictShadowCasters(root); },
  // screen feedback
  ui: {
    popup: spawnPopup, message: showMessage, banner: showWaveBanner, toast, toastMini,
    warnIndicator: addWarnIndicator, damageIndicator: addDamageIndicator,
  },
  // raw input (edges last one frame; see _setKey / readGamepad)
  input: {
    keys,
    held(code) { return !!keys[code]; },
    pressed(code) { return !!_keyHit[code]; },
    released(code) { return !!_keyUp[code]; },
    get moveX() { return _in.moveX; },
    get moveZ() { return _in.moveZ; },
    get sprint() { return _in.sprint; },
    get attack() { return _in.attack; },
    get wheel() { return _in.wheel; },
    get lookX() { return padInput.lookX; },
    get lookY() { return padInput.lookY; },
    get pointerLocked() { return document.pointerLockElement === renderer.domElement; },
    pad: {
      get connected() { return padInput.connected; },
      down(i) { return !!padInput.down[i]; },
      pressed(i) { return !!padInput.hit[i]; },
      axis(i) { return padInput.axes[i] || 0; },
      get lt() { return padInput.lt; },
      get rt() { return padInput.rt; },
      /** Take button i off its classic job (0 A melee, 1 B roar, 2 X beam, 3 Y charge, 5 RB stomp, 6 LT sprint, 7 RT ult, 8 Back pause) or give it back. */
      reserve(i, on = true) { if (on) _padReserved.add(i); else _padReserved.delete(i); },
    },
    /** A new on-screen control: touches on it no longer start a camera drag. */
    registerTouchControl(el) { if (el && !_touchControls.includes(el)) _touchControls.push(el); },
    /** Make el a held button reporting as `code` through held / pressed / released (touch, and mouse for desktop testing). */
    bindTouchButton(el, code) {
      ctx.input.registerTouchControl(el);
      const down = (e) => { e.preventDefault(); _setKey(code, true); };
      const up = (e) => { e.preventDefault(); _setKey(code, false); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
      el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
    },
  },
  // flow
  rules: _rules,
  addScore, addRage,
  gameOver, offerUpgrades, continueRun,
  military: {
    spawn: spawnRunIn,
    get count() { return world.enemies.length; },
    /** Remove every unit on the field (nobody scores). */
    clear() {
      const was = _dmgSrc;
      _dmgSrc = 'env';
      for (const e of world.enemies) if (!e.dead) e.damage(1e6, world);
      _dmgSrc = was;
    },
  },
};

// ---- the modes ----
// waves: the classic loop, exactly as it was (startWave, the wave-clear
// check, upgrades between waves).
function _wavesUpdate() {
  // Wave check
  if (state.inWave && world.enemies.length === 0) {
    state.inWave = false;
    setTimeout(() => {
      if (state.gameOver) return;
      state.score += 1000;
      state.hp = Math.min(state.maxHp, state.hp + 30);
      audio.waveClear();
      offerUpgrades();
    }, 1800);
    showMessage('WAVE CLEARED · +1000', 2.0);
    // Victory dance on wave clear
    // (one-shot lock, commit 0: dances while standing, moving cuts it off)
    kaijuOneShot(['dance'], 0.3, 1, { commit: 0 });
  }
}
let _wr = null; // the wrestling composer, built on first use
const MODES = {
  // needsRival: a second kaiju is loaded for the run. ownsKO: the mode ends
  // the run itself (the player's HP reaching 0 is a fall, not game over).
  waves: {
    id: 'waves', needsRival: false, ownsKO: false, onBuildingDestroyed: null,
    start() { startWave(1); },
    update() { _wavesUpdate(); },
    updateIdle() {},
    onGameOver() {},
    gameOverText() { return null; },
    dispose() {},
  },
  wrestling: {
    id: 'wrestling', needsRival: true, ownsKO: true,
    start() {
      if (!_wr) _wr = createWrestling(ctx);
      _wr.start({ rival: _rivalCache });
    },
    update(dt, dtReal) { if (_wr) _wr.update(dt, dtReal); },
    updateIdle(dtReal) { if (_wr) _wr.updateIdle(dtReal); },
    onGameOver(victory) { if (_wr) _wr.onGameOver(victory); },
    onBuildingDestroyed(b, by) { if (_wr) _wr.onBuildingDestroyed(b, by); },
    gameOverText(victory) { return _wr ? _wr.gameOverText(victory) : null; },
    dispose() { if (_wr) _wr.dispose(); },
  },
};
let _mode = MODES.waves;
/** Everything a mode may have changed in this file, back to the classic defaults (restart-in-place). */
function _resetSeams() {
  Object.assign(_pctl, _PCTL_DEFAULTS);
  _camOverride = null;
  _hitStopUntil = 0; _slowPrio = 0; _dmgSrc = null;
  _rules.oocRegen = true; _rules.passiveRage = true;
  _padReserved.clear();
  setRivalBody(null);
  if (camera.fov !== CAM_FOV) { camera.fov = CAM_FOV; camera.updateProjectionMatrix(); }
}
// QA (?debug): the seams, drivable from scripts
if (window.__qa) {
  Object.assign(window.__qa, {
    ctx,
    mode: () => _mode.id,
    rivalKey: () => (_rivalCache ? _rivalCache.key : null),
    control: _pctl,
    hitStop: (sec) => hitStop(sec),
    slowMo: (scale, sec, prio) => slowMo(scale, sec, prio),
    time: () => ({ now: world.time, dt: _lastDt, frozen: performance.now() < _hitStopUntil, slow: performance.now() < state.slowMoUntil ? state.slowMoScale : 1, slowPrio: _slowPrio }),
    camOverride: (fn) => setCameraOverride(fn),
    hurt: (amount, raw = true) => hurtPlayer(amount, { raw }),
    runIn: (kind, n, o) => spawnRunIn(kind, n, o),
    // fire('melee' | 'beam' | 'roar' | 'charge' | 'stomp' | 'ult'): rage and cooldown topped up first
    fire: (what) => {
      state.rage = state.maxRage;
      state.cooldowns[what] = 0;
      ({ melee: fireMelee, beam: fireBeam, roar: fireRoar, charge: fireCharge, stomp: fireStomp, ult: fireUltimate })[what]();
    },
  });
  // __qa.wr: the wrestling composer's hooks (rival, player, match, events, force, ko...), null before the first match
  Object.defineProperty(window.__qa, 'wr', { get: () => (_wr ? _wr.qa : null) });
}

// ------------------------- Main loop -------------------------
let last = performance.now();
// Dynamic resolution (desktop floor 1.0, mobile RP.prMin): if the
// smoothed frame time stays over 20 ms for 2 s, drop the pixel ratio by 0.1.
// Raise by 0.05 after 5 s at <= 17.5 ms, i.e. holding vsync: on a 60 Hz
// display the frame time never goes below 16.7 ms, so the old "< 14 ms"
// rule could never recover a lowered PR. A PR that proved too slow becomes
// a ceiling for 30 s so it doesn't oscillate. Only measured during
// gameplay frames (menus are throttled to ~15 fps).
const _dyn = { ema: 16.7, slowT: 0, fastT: 0, ceil: Infinity, ceilUntil: 0 };
function _dynResTick(dtRaw) {
  if (!RP.dynRes || dtRaw <= 0 || dtRaw > 0.25) return;
  const ms = dtRaw * 1000;
  _dyn.ema += (ms - _dyn.ema) * 0.1;
  const now = performance.now();
  if (now > _dyn.ceilUntil) _dyn.ceil = Infinity;
  const maxPR = Math.min(window.devicePixelRatio, QUALITY_PR, _dyn.ceil);
  const minPR = Math.min(Math.min(window.devicePixelRatio, QUALITY_PR), RP.prMin);
  if (_dyn.ema > 20) { _dyn.slowT += dtRaw; _dyn.fastT = 0; }
  else if (_dyn.ema <= 17.5) { _dyn.fastT += dtRaw; _dyn.slowT = 0; }
  else { _dyn.slowT = 0; _dyn.fastT = 0; }
  let next = _curPR;
  if (_dyn.slowT > 2 && _curPR > minPR + 1e-3) {
    _dyn.ceil = _curPR - 0.01; _dyn.ceilUntil = now + 30000;
    next = Math.max(minPR, _curPR - 0.1);
  } else if (_dyn.fastT > 5 && _curPR < maxPR - 1e-3) {
    next = Math.min(maxPR, _curPR + 0.05);
  }
  if (next !== _curPR) {
    _curPR = next;
    _dyn.slowT = 0; _dyn.fastT = 0;
    fitRenderer();
  }
}
window.__dynRes = () => ({ pr: _curPR, emaMs: +_dyn.ema.toFixed(1) });

function tick(now) {
  const dtRaw = (now - last) / 1000;
  last = now;
  const slowActive = now < state.slowMoUntil;
  // Hit-stop outranks slow-mo: the simulation holds still (dt = 0) while the
  // camera, HUD and audio keep running on real time, and a slow-mo in force
  // is put on hold for the freeze rather than burning down under it.
  const frozen = now < _hitStopUntil;
  if (frozen && slowActive) state.slowMoUntil += dtRaw * 1000;
  const dtReal = Math.min(0.05, dtRaw);
  const dt = frozen ? 0 : dtReal * (slowActive ? state.slowMoScale : 1);
  _lastDt = dt;
  if (!state.paused && !state.gameOver) {
    state.elapsedTime += dtRaw;
    world.time += dt;
    skyMat.uniforms.time.value = world.time;
    if (state.kaiju) {
      updatePlayer(dt);
      updateWorld(dt, dtReal);
      _dynResTick(dtRaw);
    }
    updateCamera(dtReal);
    updateHUD();
    // Minimap is a full canvas redraw; ~15Hz is plenty
    if (now - (state._lastMini || 0) > 66) { drawMinimap(); state._lastMini = now; }
    updatePopups(dt);
  } else if (state.kaiju) {
    // Keep GLB animation mixer running during pause/gameOver so
    // death, dance, and idle animations continue playing
    if (state.kaiju.mixer) {
      state.kaiju.mixer.update(Math.min(0.05, dtRaw));
      if (state._topple) _updateTopple(Math.min(0.05, dtRaw));
    }
    _mode.updateIdle(dtReal); // the mode's own actors (the rival kaiju's mixer, its camera and HUD)
    updateCamera(dtReal);
    updatePopups(dt);
  }
  // This frame's key / button edges have been seen by everything that ran
  if (_edgeCodes.length) {
    for (let i = 0; i < _edgeCodes.length; i++) { _keyHit[_edgeCodes[i]] = false; _keyUp[_edgeCodes[i]] = false; }
    _edgeCodes.length = 0;
  }
  _in.wheel = 0;
  // Menu navigation (gamepad) -- runs whenever the menu or upgrade modal
  // is on screen, regardless of paused/gameOver state.
  pollMenuGamepad(dtRaw);
  // Look layer (look.js): the slide toward dusk advances with play time; the
  // kaiju positions feed the analytic shadows. The ultimate's additive domes
  // fill the frame for ~2 s after it fires (its 20 s cooldown is the clock):
  // exposure dips under them so they read as light instead of clipping.
  {
    const k = state.kaiju, playing = k && !state.paused && !state.gameOver;
    const ultT = k && state.cooldowns.ult > 0 ? 20 - state.cooldowns.ult : 9;
    setLookDip(ultT < 2.6 ? Math.min(1, ultT / 0.12) * Math.min(1, (2.6 - ultT) / 1.3) : 0);
    updateLook(playing ? dt : 0, world.time, camera, k ? k.root : null, _rival ? _rival.root : null);
  }
  if (window.__cinePass) {
    window.__cinePass.uniforms.time.value = world.time;
    // Project the sun's world position into screen space so god rays
    // streak from wherever the sun actually is in the camera's view.
    // When the sun is behind the camera the screen-pos is off-screen
    // and the god-ray contribution naturally fades to zero.
    // (Chicago: the sun disc's direction, a far point along it)
    if (_lookLevel === 'chicago') _tmpSun.copy(lookSunDir()).multiplyScalar(1200).add(camera.position).project(camera);
    else _tmpSun.copy(sun.position).project(camera);
    window.__cinePass.uniforms.sunPos.value.set(
      (_tmpSun.x + 1) * 0.5,
      (_tmpSun.y + 1) * 0.5,
    );
    // Cull god rays when sun is well off-screen (clip space outside +/-1.4)
    const off = Math.max(Math.abs(_tmpSun.x), Math.abs(_tmpSun.y)) > 1.4 || _tmpSun.z > 1;
    // (Chicago: fading out as its sun sets; lit windows would streak instead)
    window.__cinePass.uniforms.godStr.value = off ? 0.0 : (Q_HIGH ? 0.55 : 0.30) * (_lookLevel === 'chicago' ? lookSunUp() * 0.8 : 1);
  }
  vfx.tick(dt);
  // Behind the title/monster menu, loading screen and pause overlay the
  // city only needs ~15 fps (it cost ~6 ms GPU per frame at full rate).
  // Input, gamepad and menu logic above still run every frame.
  const idleScreen = !state.kaiju || state.paused;
  _syncPauseMenu();
  // Not at the menu: one upload there can block for 0.2-0.4 s while the GPU
  // process is still busy with boot (a budget can't split a single call);
  // START uploads what's queued behind the loading bar instead.
  if (_texQueue.size && state.kaiju) _drainTexQueue(4);
  // No draws behind the (opaque) loading screen: a draw there would link the
  // just-flushed GLB buildings' programs on first use, behind the
  // compileAsync queue (_prewarmShaders).
  const loadingUp = _loadingScreenEl && _loadingScreenEl.classList.contains('visible');
  if (!loadingUp && (!idleScreen || now - _lastIdleRender >= IDLE_RENDER_MS)) {
    _lastIdleRender = now;
    if (RP.shadows && RP.shadowEvery > 1 && ++_shadowFrame >= RP.shadowEvery) {
      _shadowFrame = 0;
      renderer.shadowMap.needsUpdate = true;
    }
    _batchSets[0][0] = state.cars; _batchSets[1][0] = world.debris; _batchSets[2][0] = state.civilians;
    batchMovers(_batchSets, scene, camera);
    cullRubble(camera);
    // This frame's view, for next frame's off-screen skips (civilian mixers)
    _viewPM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _viewFrustum.setFromProjectionMatrix(_viewPM);
    world.viewFrustum = _viewFrustum;
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}
const IDLE_RENDER_MS = 66;
// Traffic, flying debris and civilians (the phone-LOW box crowd; skinned
// pedestrians stay individual), drawn batched (carBatch.js); items set per frame
const _batchSets = [[null, (c) => c.root, 12, RP.carFar || 0], [null, (d) => d, 8], [null, (c) => c.root, 8, RP.civFar || 0]];
const _viewFrustum = new THREE.Frustum(), _viewPM = new THREE.Matrix4();
const _loadingScreenEl = document.getElementById('loading-screen');
let _lastIdleRender = -Infinity;
requestAnimationFrame(tick);
