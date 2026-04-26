// Build stamp for the on-page console (visible via ?debug in the URL).
console.info('[KAIJU HAVOC] build', 'f7892c5+', new Date().toISOString());
window.__dbg && window.__dbg('DBG · game.js module starting');
import * as THREE from 'three';
window.__dbg && window.__dbg('DBG · three imported OK');
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MONSTERS, buildKaiju, renderMonsterPreviews } from './monsters.js';
import { Building, buildCity, spawnCars, spawnCivilians, flushBodiesIM } from './city.js';
import { Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech } from './enemies.js';
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

// ------------------------- Mobile detect -------------------------
const isMobile = (() => {
  const ua = navigator.userAgent || '';
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  // Treat any touch-only small screen as mobile
  return ios || android || (touch && Math.min(window.innerWidth, window.innerHeight) < 820);
})();
if (isMobile) document.body.classList.add('mobile');

// Phase 8: graphics quality tier. Defaults to auto (low on mobile, high on
// desktop) and can be overridden with ?q=low | ?q=med | ?q=high.
function detectQuality() {
  const m = location.search.match(/[?&]q=(low|med|high)\b/);
  if (m) return m[1];
  return isMobile ? 'low' : 'high';
}
const QUALITY = detectQuality();
const Q_HIGH = QUALITY === 'high';
const Q_MED  = QUALITY === 'med';
const Q_LOW  = QUALITY === 'low';
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

function updateOrientationClass() {
  if (!isMobile) return;
  if (window.innerHeight > window.innerWidth) document.body.classList.add('portrait');
  else document.body.classList.remove('portrait');
}
updateOrientationClass();
window.addEventListener('orientationchange', updateOrientationClass);

// ------------------------- Setup -------------------------
const game = document.getElementById('game');
// Phase 8: pixel ratio + shadow toggle keyed off the QUALITY tier.
const renderer = new THREE.WebGLRenderer({ antialias: Q_HIGH, powerPreference: 'high-performance' });
const QUALITY_PR = Q_HIGH ? 1.5 : (Q_MED ? 1.25 : 1.0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PR));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = Q_HIGH;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x281a30);
// Phase 6: exponential fog matched to the sunset palette. Distance buildings
// fade smoothly into haze instead of popping at a linear cut. Density tuned
// so things ~150u away stay readable but the city horizon dissolves.
scene.fog = new THREE.FogExp2(0x4a1a3a, 0.0042);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 2000);

// Postprocessing pipeline:
//   RenderPass -> UnrealBloomPass -> OutputPass (tone-map + sRGB at the end).
// Bloom runs at half-res to keep mobile-class GPUs in the budget.
// Phase 1 of graphics plan: explicit OutputPass + sRGBColorSpace audit so the
// composer chain matches the colour pipeline regardless of pass order.
let composer = null;
let bloomPass = null;
{
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
    Q_HIGH ? 0.85 : (Q_MED ? 0.65 : 0.45), // strength
    Q_HIGH ? 0.55 : (Q_MED ? 0.50 : 0.40), // radius
    0.7                                     // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// Lighting: dramatic dusk
// Phase 4 lighting: low-angle synthwave-dusk sun + reduced ambient (IBL
// from Phase 3 handles fill on desktop), plus 6 neon point lights as set
// dressing. Hemisphere kept as a cheap colour fill on mobile (no IBL there).
const hemi = new THREE.HemisphereLight(0xff7780, 0x1a0633, Q_HIGH ? 0.30 : (Q_MED ? 0.45 : 0.55));
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff8866, 1.45);
sun.position.set(-90, 60, 40); // low-angle sunset rake from the side
if (Q_HIGH) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  // Tight frustum: kaiju + ~80u radius around it. We retarget per frame
  // (see updateCamera) so distant buildings never enter the shadow camera.
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;   sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1;   sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0005;
}
scene.add(sun);
const ambient = new THREE.AmbientLight(0x334455, Q_HIGH ? 0.10 : (Q_MED ? 0.30 : 0.45));
scene.add(ambient);

// Six (high) / 5 (med) / 4 (low) neon point lights scattered through the
// city as set dressing. Short distance + decay so they only colour the
// immediate street level.
const NEON_PALETTE = [0xff3388, 0x33ddff, 0xffaa44, 0xff66ff, 0x66ff99, 0xffee44];
const NEON_COUNT = Q_HIGH ? 6 : (Q_MED ? 5 : 4);
const _neonLights = [];
for (let i = 0; i < NEON_COUNT; i++) {
  const c = NEON_PALETTE[i % NEON_PALETTE.length];
  const a = (i / 6) * Math.PI * 2;
  const r = 110 + Math.random() * 80;
  const pl = new THREE.PointLight(c, 4.5, 38, 2);
  pl.position.set(Math.cos(a) * r, 6, Math.sin(a) * r);
  scene.add(pl);
  _neonLights.push(pl);
}

// Sky dome with stars
const skyGeom = new THREE.SphereGeometry(1500, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { time: { value: 0 } },
  vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    varying vec3 vP;
    uniform float time;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vP);
      float h = d.y;
      // Three-tier gradient
      vec3 horizon = vec3(0.95, 0.32, 0.22);
      vec3 mid     = vec3(0.32, 0.10, 0.32);
      vec3 zenith  = vec3(0.04, 0.02, 0.14);
      vec3 col = mix(horizon, mid, smoothstep(-0.05, 0.35, h));
      col = mix(col, zenith, smoothstep(0.25, 0.85, h));
      // Cheap nebula tint -- single sin wave instead of fbm
      col += vec3(0.12, 0.04, 0.22) * sin(d.x * 3.0 + d.z * 2.5 + time * 0.05) * smoothstep(0.1, 0.6, h) * 0.5;
      // Stars
      vec2 p = d.xz * 1200.0;
      float s = hash(floor(p));
      if (h > 0.18 && s > 0.9965) col += vec3(0.9, 0.95, 1.0) * (s - 0.9965) * 280.0;
      // Moon halo
      vec3 moonDir = normalize(vec3(0.4, 0.6, -0.5));
      float md = dot(d, moonDir);
      col += vec3(1.0, 0.95, 0.82) * smoothstep(0.997, 1.0, md);
      col += vec3(0.6, 0.5, 0.45) * smoothstep(0.985, 0.998, md) * 0.4;
      // Off-screen sun rim
      vec3 sunDir = normalize(vec3(-0.55, 0.12, 0.25));
      float sd = max(0.0, dot(d, sunDir));
      col += vec3(1.0, 0.5, 0.25) * pow(sd, 16.0) * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(skyGeom, skyMat);
scene.add(sky);

// Phase 3 of graphics plan: image-based lighting via PMREMGenerator. Render
// the procedural sky shader once into a CubeRenderTarget, prefilter through
// PMREM, and feed it as scene.environment. All MeshStandardMaterials get
// reflections/ambient automatically. Skipped on mobile to keep the GPU
// budget for bloom + emissive windows.
if (Q_HIGH) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    // Render the sky into a small cube render target by temporarily replacing
    // scene.background with a copy of the sky and using fromScene.
    // Cheaper alternative: use a CubeCamera to capture the sky dome.
    const cubeTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: false });
    const cubeCam = new THREE.CubeCamera(1, 2000, cubeTarget);
    // Update the sky shader once before capture
    skyMat.uniforms.time.value = 0;
    cubeCam.position.set(0, 50, 0);
    cubeCam.update(renderer, scene);
    const env = pmrem.fromCubemap(cubeTarget.texture).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    cubeTarget.dispose();
    pmrem.dispose();
  } catch (e) { console.warn('PMREM env failed:', e); }
}

// ------------------------- World object -------------------------
// Shared shell geometry + per-type materials so each shot doesn't
// allocate a fresh BufferGeometry / MeshBasicMaterial pair.
const SHARED_SHELL_GEOM = new THREE.SphereGeometry(0.35, 6, 6);
const SHELL_PROFILES = {
  tank:  { speed: 80,  damage: 9,  size: 0.35, mat: new THREE.MeshBasicMaterial({ color: 0xffaa44 }) },
  heli:  { speed: 90,  damage: 6,  size: 0.30, mat: new THREE.MeshBasicMaterial({ color: 0xffeeaa }) },
  mech:  { speed: 70,  damage: 14, size: 0.40, mat: new THREE.MeshBasicMaterial({ color: 0xff8844 }) },
  jet:   { speed: 110, damage: 11, size: 0.32, mat: new THREE.MeshBasicMaterial({ color: 0xff5533 }) },
  rifle: { speed: 140, damage: 2,  size: 0.18, mat: new THREE.MeshBasicMaterial({ color: 0xffeecc }) },
  boss:  { speed: 75,  damage: 22, size: 0.55, mat: new THREE.MeshBasicMaterial({ color: 0xff3322 }) },
};

// Reusable temp vectors so hot loops don't allocate a Vector3 per call.
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _beamOrigin = new THREE.Vector3();
const _beamDir = new THREE.Vector3();
const _beamRay = new THREE.Raycaster();

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
  spawnExplosion: function (pos, scale = 1) {
    this.effects.push(makeExplosion(this, pos, scale));
    audio.explosion(scale);
  },
  spawnSparks: function (pos, n) { this.effects.push(makeSparks(this, pos, n)); },
  spawnShockwave: function (pos, color, r) { this.effects.push(makeShockwave(this, pos, color, r)); },
  spawnMuzzleFlash: function (pos, s) { this.effects.push(makeMuzzleFlash(this, pos, s)); },
  spawnSmoke: function (pos, s) { this.effects.push(makeSmokePuff(this, pos, s)); },
  spawnHitPulse: function (pos, color) { this.effects.push(makeHitPulse(this, pos, color)); },
  spawnSmokeColumn: function (pos, height) { this.effects.push(makeSmokeColumn(this, pos, height)); },
  spawnBeam: function (origin, dir, len, color, glow) {
    this.effects.push(makeBeam(this, origin, dir, len, color, glow));
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

// Build city
window.__dbg && window.__dbg('DBG · buildCity starting…');
{
  const { buildings, grid, bodiesIM } = buildCity(scene, world, { lite: isMobile });
  world.buildings = buildings;
  world.buildingGrid = grid;
  world.bodiesIM = bodiesIM;
}
window.__dbg && window.__dbg('DBG · buildCity OK', '#9f9');

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

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    state.paused = !state.paused;
    showMessage(state.paused ? 'PAUSED' : '', state.paused ? 0 : 0);
    if (state.paused) document.exitPointerLock?.();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('mousedown', (e) => { if (e.button === 0) state.mouseDown = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) state.mouseDown = false; });

renderer.domElement.addEventListener('click', () => {
  if (!state.gameOver && state.kaiju) renderer.domElement.requestPointerLock?.();
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    state.yaw -= e.movementX * 0.0024;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PR));
  renderer.setSize(w, h, true); // updateStyle=true: also sets canvas style.width/height
  if (composer) {
    composer.setSize(w, h);
    if (bloomPass) bloomPass.setSize(w * 0.5, h * 0.5);
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
};

function readGamepad() {
  if (!navigator.getGamepads) return false;
  const pads = navigator.getGamepads();
  let pad = null;
  for (const p of pads) { if (p && p.connected) { pad = p; break; } }
  if (!pad) {
    padInput.moveX = padInput.moveZ = padInput.lookX = padInput.lookY = 0;
    padInput.attack = padInput.sprint = false;
    for (const k of Object.keys(padInput.pressed)) padInput.pressed[k] = false;
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
  padInput.attack = isDown(0); // A held = melee
  padInput.sprint = isDown(4) || (pad.buttons[6]?.value || 0) > 0.4; // LB or LT
  // Edge-triggered: only fire once per press
  padInput.pressed.beam   = press(2); // X
  padInput.pressed.roar   = press(1); // B
  padInput.pressed.charge = press(3); // Y
  padInput.pressed.stomp  = press(5); // RB
  padInput.pressed.ult    = press(7) || ((pad.buttons[7]?.value || 0) > 0.6 && !padInput.prevDown[7]); // RT
  padInput.pressed.pause  = press(9) || press(8); // Start / Back

  // Cache button-down state for edge-detection next frame
  for (let i = 0; i < pad.buttons.length; i++) padInput.prevDown[i] = isDown(i);
  return true;
}

window.addEventListener('gamepadconnected', (e) => {
  toast('GAMEPAD CONNECTED · ' + (e.gamepad?.id?.slice(0, 24) || ''), 'good');
});
window.addEventListener('gamepaddisconnected', () => {
  toast('GAMEPAD DISCONNECTED', 'bad');
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
function _menuTargets() {
  if (_upgradeVisible()) return Array.from(document.querySelectorAll('#upgrade-cards .ucard'));
  if (_menuVisible()) {
    const cards = Array.from(document.querySelectorAll('#monsterCards .monster-card'));
    cards.push(document.getElementById('startBtn'));
    return cards;
  }
  return [];
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
  // On the title menu only, vertical jump between card row + start btn
  if (_menuVisible() && !_upgradeVisible()) {
    if (_menuPad.cool === 0 && dpadD && _menuPad.focused < 3) {
      _menuPad.focused = 3; _setFocus(_menuTargets(), 3); _menuPad.cool = 0.20;
    } else if (_menuPad.cool === 0 && dpadU && _menuPad.focused === 3) {
      _menuPad.focused = 0; _setFocus(_menuTargets(), 0); _menuPad.cool = 0.20;
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
    _menuPad.focused = 3;
    _setFocus(_menuTargets(), 3);
  } else if (e.key === 'ArrowUp' && _menuVisible() && !_upgradeVisible()) {
    e.preventDefault();
    _menuPad.focused = 0;
    _setFocus(_menuTargets(), 0);
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
}

if (joystickEl) {
  const handleJoyStart = (id, cx, cy) => {
    const r = joystickEl.getBoundingClientRect();
    touchInput.joyCx = r.left + r.width / 2;
    touchInput.joyCy = r.top + r.height / 2;
    touchInput.joyId = id;
    handleJoyMove(cx, cy);
  };
  const handleJoyMove = (cx, cy) => {
    const dx = cx - touchInput.joyCx;
    const dy = cy - touchInput.joyCy;
    const max = 50;
    const len = Math.hypot(dx, dy);
    const nx = len > max ? dx * max / len : dx;
    const ny = len > max ? dy * max / len : dy;
    setKnob(nx, ny);
    touchInput.moveX = nx / max;
    touchInput.moveZ = -ny / max; // up on screen = forward
  };
  joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    handleJoyStart(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  joystickEl.addEventListener('touchmove', (e) => {
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
  joystickEl.addEventListener('touchend', endJoy);
  joystickEl.addEventListener('touchcancel', endJoy);
}

if (attackBtn) {
  attackBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); touchInput.attackHeld = true;
  }, { passive: false });
  const endAtk = (e) => { e.preventDefault(); touchInput.attackHeld = false; };
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

if (pauseBtn) {
  pauseBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.paused = !state.paused;
    showMessage(state.paused ? 'PAUSED' : '', state.paused ? 0 : 0);
  }, { passive: false });
}

// Camera drag: any touch on the right half (not on a button) controls look
function isOnControl(target) {
  if (!target || !target.closest) return false;
  return !!target.closest('#joystick, #attack-btn, #sprint-btn, #pause-btn, #powers, #hud, #menu, #gameover');
}
window.addEventListener('touchstart', (e) => {
  if (!isMobile || state.gameOver || !state.kaiju) return;
  // Compute live joystick gate so landscape (wider screen) still allows look.
  const joyRect = joystickEl ? joystickEl.getBoundingClientRect() : null;
  for (const t of e.changedTouches) {
    if (t.identifier === touchInput.joyId) continue;
    if (isOnControl(t.target)) continue;
    if (joyRect && t.clientX < joyRect.right + 24 && t.clientY > joyRect.top - 40) continue;
    if (touchInput.lookId !== null) continue;
    touchInput.lookId = t.identifier;
    touchInput.lookLastX = t.clientX;
    touchInput.lookLastY = t.clientY;
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!isMobile) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== touchInput.lookId) continue;
    const dx = t.clientX - touchInput.lookLastX;
    const dy = t.clientY - touchInput.lookLastY;
    touchInput.lookLastX = t.clientX;
    touchInput.lookLastY = t.clientY;
    state.yaw -= dx * 0.005;
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
    <div class="stat">⚡ ${m.beam.name}</div>
    <div class="stat">📢 ${m.roar.name}</div>
    <div class="stat">💥 ${m.charge.name}</div>
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
    const exts = ['png', 'jpg', 'jpeg', 'webp'];
    let i = 0;
    const tryNext = () => {
      if (i >= exts.length) return resolve(false);
      const url = `assets/${key}.${exts[i++]}`;
      const img = new Image();
      img.onload = () => { _setCardImage(key, url); _staticCovered.add(key); resolve(true); };
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
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

// ------------------------- Start game -------------------------
function startGame(key) {
  state.monsterKey = key;
  state.monsterCfg = MONSTERS[key];
  state.maxHp = state.monsterCfg.stats.hp;
  state.hp = state.maxHp;
  state.score = 0;
  state.rage = 0;
  state.wave = 0;

  const k = buildKaiju(state.monsterCfg);
  k.root.position.set(0, 0, 0);
  // Phase 4: kaiju is the only object that casts shadows. Traverse its mesh
  // tree once and flip the flags so the shadow pass picks up every limb.
  k.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // Sun targets the kaiju so the tight 180u shadow camera frustum follows it.
  sun.target = k.root;
  scene.add(sun.target);
  scene.add(k.root);
  state.kaiju = k;

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('powers').classList.remove('hidden');
  document.getElementById('minimap').classList.remove('hidden');
  document.getElementById('mute-btn').classList.remove('hidden');
  if (!isMobile) {
    document.getElementById('help').classList.remove('hidden');
  } else {
    // Reveal mobile controls
    document.getElementById('joystick').classList.remove('hidden');
    document.getElementById('attack-btn').classList.remove('hidden');
    document.getElementById('sprint-btn').classList.remove('hidden');
    document.getElementById('pause-btn').classList.remove('hidden');
  }
  buildPowersBar();

  // Spawn initial cars driving around the city
  state.cars = spawnCars(scene, isMobile ? 8 : 16, 380, isMobile ? 48 : 40);
  // Spawn ambient pedestrians who panic + flee when the kaiju approaches
  state.civilians = spawnCivilians(scene, isMobile ? 14 : 24, 350);

  // Kick off looping background music. Tries assets/music.{mp3,ogg,wav};
  // falls back to a procedural ambient drone if no asset is present.
  audio.startMusic();

  startWave(1);
  if (!isMobile) renderer.domElement.requestPointerLock?.();
}

// ------------------------- HUD -------------------------
function buildPowersBar() {
  const cfg = state.monsterCfg;
  const bar = document.getElementById('powers');
  bar.innerHTML = '';
  const items = [
    { key: '1', id: 'beam', name: cfg.beam.name, cost: cfg.beam.cost },
    { key: '2', id: 'roar', name: cfg.roar.name, cost: cfg.roar.cost },
    { key: '3', id: 'charge', name: cfg.charge.name, cost: cfg.charge.cost },
    { key: 'SPC', id: 'stomp', name: 'STOMP', cost: 15 },
    { key: 'Q',   id: 'ult',   name: 'ULTIMATE', cost: 100 },
  ];
  for (const it of items) {
    const w = document.createElement('div');
    w.className = 'power-wrap';
    w.innerHTML = `
      <div class="power" id="pw-${it.id}">
        <div class="key">${it.key}</div>
        <div class="name">${it.name}</div>
      </div>
      <div class="cooldown" id="cd-${it.id}" style="display:none"></div>`;
    bar.appendChild(w);
    const pwEl = w.querySelector('.power');
    const fire = (e) => {
      e.preventDefault();
      if (it.id === 'beam') fireBeam();
      else if (it.id === 'roar') fireRoar();
      else if (it.id === 'charge') fireCharge();
      else if (it.id === 'stomp') fireStomp();
      else if (it.id === 'ult') fireUltimate();
    };
    pwEl.addEventListener('touchstart', fire, { passive: false });
    pwEl.addEventListener('mousedown', fire);
  }
}

// HUD DOM writes are heavy enough that smashing them at 60Hz causes frame
// hitches in dense fights. Throttle the slow stuff to ~10Hz; only the
// damage flash / low-HP overlay (cheap single-element styles) refresh
// every frame for visual smoothness.
let _hudLast = 0;
function updateHUDFast() {
  const flashEl = document.getElementById('damage-flash');
  if (flashEl) flashEl.style.opacity = String(state.damageFlash * 0.85);
  const lowEl = document.getElementById('lowhp-warning');
  if (lowEl) {
    const hpPct = state.hp / state.maxHp;
    if (hpPct < 0.3 && !state.gameOver) lowEl.classList.add('active');
    else lowEl.classList.remove('active');
  }
}
function updateHUD() {
  updateHUDFast();
  const now = performance.now();
  if (now - _hudLast < 100) return; // 10 Hz
  _hudLast = now;
  document.getElementById('hpBar').firstChild.style.width = Math.max(0, state.hp / state.maxHp * 100) + '%';
  document.getElementById('ragBar').firstChild.style.width = (state.rage / state.maxRage * 100) + '%';
  document.getElementById('score').textContent = state.score.toLocaleString();
  document.getElementById('waveText').textContent = `${state.wave} / ${state.buildingsDestroyed} buildings`;

  const cfg = state.monsterCfg;
  if (!cfg) return;
  const updateP = (id, cost) => {
    const el = document.getElementById('pw-' + id);
    const cd = document.getElementById('cd-' + id);
    if (!el) return;
    const t = state.cooldowns[id];
    if (t > 0) {
      cd.style.display = 'flex';
      cd.textContent = t.toFixed(1);
      el.classList.add('disabled');
    } else if (state.rage < cost) {
      cd.style.display = 'none';
      el.classList.add('disabled');
    } else {
      cd.style.display = 'none';
      el.classList.remove('disabled');
    }
  };
  updateP('beam', cfg.beam.cost);
  updateP('roar', cfg.roar.cost);
  updateP('charge', cfg.charge.cost);
  updateP('stomp', 15);
  updateP('ult', 100);

  // Combo HUD
  const comboEl = document.getElementById('combo');
  if (comboEl) {
    if (state.combo > 0) {
      comboEl.style.opacity = '1';
      document.getElementById('combo-mult').textContent = 'x' + comboMult().toFixed(1);
      document.getElementById('combo-bar').style.width = Math.max(0, state.comboTimer / state.comboMaxTimer * 100) + '%';
    } else {
      comboEl.style.opacity = '0';
    }
  }

  // Boss bar
  if (state.boss && !state.boss.dead) {
    document.getElementById('boss-hp').style.width = Math.max(0, state.boss.hp / state.boss.maxHp * 100) + '%';
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

function toast(text, kind = '') {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
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

  // Wave objective: smash a target number of buildings during the wave for
  // a bonus. Goal scales with wave so it stays a stretch but always
  // achievable if the kaiju is being aggressive.
  state.waveObjective.goal = 4 + Math.min(8, Math.floor(n * 1.2));
  state.waveObjective.current = 0;
  state.waveObjective.complete = false;
  const objEl = document.getElementById('wave-objective');
  if (objEl) objEl.style.display = 'block';
  updateWaveObjectiveText();

  const isBossWave = n > 0 && n % 4 === 0;
  if (isBossWave) {
    showWaveBanner(`WAVE ${n}`, 'BOSS APPROACHING');
    toast('⚠ BOSS WAVE ⚠', 'bad');
    audio.bossSpawn();
  } else {
    showWaveBanner(`WAVE ${n}`, 'THE MILITARY STRIKES BACK');
    audio.waveStart();
  }

  const enemies = world.enemies;
  const kpos = state.kaiju.root.position;
  function spawnPos(radius) {
    const a = Math.random() * Math.PI * 2;
    return [kpos.x + Math.cos(a) * radius, kpos.z + Math.sin(a) * radius];
  }

  // Boss replaces big mech spawn on boss waves
  if (isBossWave) {
    const [bx, bz] = spawnPos(170);
    const boss = new BossMech(bx, bz);
    scene.add(boss.root);
    enemies.push(boss);
    state.boss = boss;
    document.getElementById('boss-bar').style.display = 'block';
  }

  // Standard scaling
  const tankCount = 2 + n * 2;
  const heliCount = Math.min(8, Math.floor(n * 1.2));
  const mechCount = (n >= 3 && !isBossWave) ? Math.floor((n - 2) * 1.0) : 0;
  const jetCount = n >= 2 ? Math.min(5, Math.floor(n / 2)) : 0;
  const artyCount = n >= 3 ? Math.min(4, Math.floor((n - 1) / 2)) : 0;
  const soldierSquads = n >= 2 ? Math.floor(n / 2) : 0;

  for (let i = 0; i < tankCount; i++) {
    const [x, z] = spawnPos(160 + Math.random() * 80);
    const t = new Tank(x, z); scene.add(t.root); enemies.push(t);
  }
  for (let i = 0; i < heliCount; i++) {
    const [x, z] = spawnPos(180 + Math.random() * 90);
    const h = new Helicopter(x, z); scene.add(h.root); enemies.push(h);
  }
  for (let i = 0; i < mechCount; i++) {
    const [x, z] = spawnPos(150 + Math.random() * 60);
    const m = new Mech(x, z); scene.add(m.root); enemies.push(m);
  }
  for (let i = 0; i < jetCount; i++) {
    const [x, z] = spawnPos(220 + Math.random() * 60);
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
function slowMo(scale, durSec) {
  state.slowMoScale = scale;
  state.slowMoUntil = performance.now() + durSec * 1000;
}

// ---- Combo + scoring helpers ----
function comboMult() { return Math.min(5, 1 + state.combo * 0.1); }
function bumpCombo() {
  state.combo += 1;
  state.comboTimer = state.comboMaxTimer;
  if (state.combo === 10) toast('COMBO x2!', 'good');
  if (state.combo === 25) toast('UNSTOPPABLE!', 'good');
  if (state.combo === 50) toast('CITY WRECKER!', 'good');
}
function addScore(base) {
  state.score += Math.floor(base * comboMult());
}
function addRage(amount) {
  state.rage = Math.min(state.maxRage, state.rage + amount * (state.upgrades?.rageGainMult || 1));
  if (state.rage >= state.maxRage && !state._announcedUlt) {
    state._announcedUlt = true;
    toast('ULTIMATE READY · Q', 'good');
  }
  if (state.rage < state.maxRage) state._announcedUlt = false;
}

// ---- Drop helper: spawn a pickup at world pos ----
function maybeDropPickup(pos, source = 'building') {
  const t = rollDrop(source);
  if (!t) return;
  const p = new Pickup(t, pos.x, 2.5, pos.z);
  scene.add(p.root);
  state.pickups.push(p);
}

world.onTankKilled = () => {
  state.tanksKilled++;
  addScore(250); addRage(8); bumpCombo();
};
world.onHeliKilled = () => {
  state.helisKilled++;
  addScore(350); addRage(10); bumpCombo();
};
world.onMechKilled = () => {
  state.mechsKilled++;
  addScore(700); addRage(18); bumpCombo();
};
world.onJetKilled = () => {
  state.jetsKilled++;
  addScore(450); addRage(12); bumpCombo();
  toast('JET DOWN!', 'good');
};
world.onArtilleryKilled = () => {
  state.artilleryKilled++;
  addScore(400); addRage(10); bumpCombo();
};
world.onSoldierKilled = () => {
  state.soldiersKilled++;
  addScore(50); addRage(2);
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
};
world.onBossSlam = () => {
  // Damage to player if too close
  state.hp -= 22;
  world.shake(1.0, 0.5);
  if (state.hp <= 0 && !state.gameOver) gameOver(false);
};
world.onCarDestroyed = () => {
  state.carsCrushed++;
  addScore(80); addRage(2);
};
world.onCivilianStomped = () => {
  state.civiliansStomped++;
  addScore(35); addRage(1);
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
function updateWaveObjectiveText() {
  const text = document.getElementById('wave-objective-text');
  if (!text) return;
  const o = state.waveObjective;
  if (o.complete) {
    text.textContent = `OBJECTIVE COMPLETE · ${o.goal} / ${o.goal}`;
    text.style.color = '#66ff99';
    text.style.textShadow = '0 0 10px #33ee88';
  } else {
    text.textContent = `SMASH ${o.goal} BUILDINGS · ${o.current} / ${o.goal}`;
    text.style.color = '#ffe6c8';
    text.style.textShadow = '0 0 8px #ff8866';
  }
}

world.onBuildingDestroyed = (b) => {
  state.buildingsDestroyed++;
  // Wave objective progress
  const obj = state.waveObjective;
  if (!obj.complete) {
    obj.current++;
    if (obj.current >= obj.goal) {
      obj.complete = true;
      const bonus = 1500 + state.wave * 250;
      addScore(bonus);
      addRage(20);
      toast(`OBJECTIVE COMPLETE · +${Math.floor(bonus * comboMult())}`, 'good');
      audio.tone(660, 0.12); audio.tone(880, 0.16); audio.tone(1320, 0.22);
    }
    updateWaveObjectiveText();
  }
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

function gameOver(victory) {
  state.gameOver = true;
  document.exitPointerLock?.();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('powers').classList.add('hidden');
  document.getElementById('help').classList.add('hidden');
  document.getElementById('boss-bar').style.display = 'none';
  const oo = document.getElementById('wave-objective');
  if (oo) oo.style.display = 'none';
  const ce = document.getElementById('combo');
  if (ce) ce.style.opacity = '0';
  document.getElementById('goTitle').textContent = victory ? 'TOKYO FALLS' : 'DEFEATED';
  document.getElementById('goSubtitle').textContent = victory ? 'The kaiju reigns supreme.' : 'The military has prevailed...';
  audio.gameOver();
  audio.stopMusic();
  const isNewHigh = trySetHighScore(state.score);
  const newHighEl = document.getElementById('newHighScore');
  if (newHighEl) newHighEl.style.display = isNewHigh ? 'block' : 'none';
  document.getElementById('goHighScore').textContent = getHighScore().toLocaleString();
  document.getElementById('finalScore').textContent = state.score.toLocaleString();
  document.getElementById('finalWave').textContent = state.wave;
  document.getElementById('finalBuildings').textContent = state.buildingsDestroyed;
  const totalKills = state.tanksKilled + state.helisKilled + state.mechsKilled +
                     state.jetsKilled + state.artilleryKilled + state.soldiersKilled +
                     state.bossesKilled;
  document.getElementById('finalTanks').textContent = totalKills;
  document.getElementById('gameover').classList.remove('hidden');
}

// ------------------------- Powers / damage -------------------------
function damageInRadius(center, radius, amount, isAerialAlso = true) {
  amount = amount * (state.upgrades?.dmgMult || 1);
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
      e.damage(amount, world);
      _tmpV1.set(ep.x, ep.y + 4, ep.z);
      world.spawnHitPulse(_tmpV1, 0xffffff);
      if (e.dead && e.type !== 'soldier') {
        _tmpV2.set(ep.x, ep.y + 8, ep.z);
        spawnPopup(_tmpV2,
          e.type === 'boss' ? '+5000' : (e.type === 'mech' ? '+700' : (e.type === 'jet' ? '+450' : '+250')),
          '#ffee44');
      }
    }
  }
}

function fireBeam() {
  const cfg = state.monsterCfg.beam;
  if (state.rage < cfg.cost || state.cooldowns.beam > 0) return;
  state.rage -= cfg.cost;
  state.cooldowns.beam = 4.0;

  state._beamStanceT = 0.6; // pose: head leans forward, jaw opens
  state.kaiju.head.getWorldPosition(_beamOrigin);
  _beamOrigin.y += 0.5;
  // direction = camera forward, biased horizontally toward enemies
  camera.getWorldDirection(_beamDir);
  _beamDir.y *= 0.4; _beamDir.normalize();
  _beamOrigin.addScaledVector(_beamDir, 3.5);

  const length = 260;
  world.spawnBeam(_beamOrigin, _beamDir, length, cfg.color, cfg.glow);
  world.shake(0.3, 0.4);
  audio.beam();

  // Per-variant beam signature: a few extras spawned alongside the beam.
  const variant = state.monsterCfg.variant;
  if (variant === 'ghidorah') {
    // GRAVITY BEAM = a continuous chain of lightning bolts running the
    // FULL beam length, plus extra branching arcs every 50u for the
    // electrical-storm read. Bolts are thick + last 0.65s so they're
    // dominant, not a subtle fork next to a green tube.
    const SEGS = 6;
    const segLen = length / SEGS;
    for (let i = 0; i < SEGS; i++) {
      const a = _beamOrigin.clone().addScaledVector(_beamDir, i * segLen);
      const b = _beamOrigin.clone().addScaledVector(_beamDir, (i + 1) * segLen);
      // Stagger the segments slightly off-axis so they read as one
      // continuous-but-jagged bolt
      b.x += (Math.random() - 0.5) * 1.2;
      b.y += (Math.random() - 0.5) * 0.6;
      b.z += (Math.random() - 0.5) * 1.2;
      world.effects.push(makeChainLightning(world, a, b, cfg.color, 0.65, 12));
    }
    // Branching forks coming off the main bolt
    for (let f = 0; f < 5; f++) {
      const distAlong = 40 + Math.random() * (length - 80);
      const fromP = _beamOrigin.clone().addScaledVector(_beamDir, distAlong);
      const toP = fromP.clone();
      toP.x += (Math.random() - 0.5) * 18;
      toP.y += (Math.random() - 0.5) * 10;
      toP.z += (Math.random() - 0.5) * 18;
      world.effects.push(makeChainLightning(world, fromP, toP, cfg.color, 0.5, 8));
    }
  } else if (variant === 'gojira') {
    // Atomic breath = pulsing green hit-pulses dotted along the beam path.
    for (let i = 0; i < 4; i++) {
      const p = _beamOrigin.clone().addScaledVector(_beamDir, 30 + i * 40);
      world.spawnHitPulse(p, cfg.color);
    }
  }

  // Hit detection along ray -- single raycast against the global body IM
  _beamRay.set(_beamOrigin, _beamDir);
  _beamRay.near = 0.5; _beamRay.far = length;
  const beamDmg = cfg.damage * (state.upgrades.dmgMult || 1);
  if (world.bodiesIM) {
    const hits = _beamRay.intersectObject(world.bodiesIM, false);
    for (let hi = 0; hi < hits.length; hi++) {
      const h = hits[hi];
      const b = world.buildings[h.instanceId];
      if (!b || b.destroyed) continue;
      b.damage(beamDmg, h.point, world);
      world.spawnExplosion(h.point, 0.8);
      // Variant-specific impact signature at the hit point
      if (variant === 'gojira') {
        world.spawnHitPulse(h.point, cfg.color); // bright green flash
      } else if (variant === 'mecha') {
        // Plasma cannon: secondary explosion ring for double-impact
        world.spawnShockwave(h.point.clone().setY(0.3), cfg.color, 14);
      } else if (variant === 'ghidorah') {
        // Final lightning crack from origin to hit point
        world.effects.push(makeChainLightning(world, _beamOrigin, h.point, cfg.color, 0.3));
      }
      break;
    }
  }
  // Enemy hits along beam (sphere check; uses module-level scratch vectors)
  for (const e of world.enemies) {
    if (e.dead) continue;
    _tmpV1.copy(e.root.position); _tmpV1.y += 4;
    _tmpV2.copy(_tmpV1).sub(_beamOrigin);
    const along = _tmpV2.dot(_beamDir);
    if (along < 0 || along > length) continue;
    _tmpV3.copy(_beamOrigin).addScaledVector(_beamDir, along);
    const distSq = _tmpV3.distanceToSquared(_tmpV1);
    if (distSq < 9) {
      e.damage(beamDmg * 0.7, world);
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

  const variant = state.monsterCfg.variant;
  const center = state.kaiju.root.position.clone();
  world.spawnShockwave(center, cfg.color, cfg.radius);
  world.shake(0.8, 0.5);
  damageInRadius(center, cfg.radius, cfg.damage, true);
  audio.roar();

  // Universal "this is literally a roar" visuals: head-locked breath cone
  // pointing where the camera looks, plus 3 expanding pressure rings so it
  // reads as a sonic blast even from a distance.
  const roarHead = state.kaiju.head;
  const roarHeadPos = new THREE.Vector3();
  roarHead.getWorldPosition(roarHeadPos);
  const roarDir = new THREE.Vector3(Math.sin(state.yaw), 0.05, Math.cos(state.yaw));
  world.effects.push(makeSoundWaveRings(world, roarHeadPos, cfg.color, 3, cfg.radius * 0.95, 1.4));
  world.effects.push(makeBreathCone(world, roarHeadPos, roarDir, 32, cfg.color, 0.8));

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

  const variant = state.monsterCfg.variant;
  const startPos = state.kaiju.root.position.clone();
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));

  // GOJIRA TAIL SWEEP -- doesn't dash. Plants and whips tail in a 180 arc,
  // damaging everything the tail tip passes through. Animation is driven
  // by _tailSwingT in updateKaijuAnim; that function also samples the tail
  // tip's world position each frame and applies damage along its path.
  if (variant === 'gojira') {
    state._tailSwingT     = 0.75;
    state._tailSwingD     = 0.75;
    state._tailSwingDir   = Math.random() < 0.5 ? 1 : -1;
    state._tailSwingArcSpawned = false;
    audio.charge();
    return;
  }

  // Other variants DASH forward.
  const cone = startPos.clone().addScaledVector(forward, 12);
  damageInRadius(cone, 28, cfg.damage, false);
  state.kaiju.root.position.addScaledVector(forward, 28);
  resolveBuildingCollisions(state.kaiju.root.position, 0.5);
  const endPos = state.kaiju.root.position.clone();
  world.spawnShockwave(endPos, cfg.color, 25);
  world.shake(0.7, 0.4);
  damageInRadius(endPos, 24, cfg.damage * 0.5, false);
  audio.charge();

  // Universal motion read: 10 wind streaks fanning forward from the dash
  // start so the player sees the impact direction even from behind.
  const streakOrigin = startPos.clone(); streakOrigin.y += 6;
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
  audio.charge && audio.charge(); // launch whoosh
}

function fireUltimate() {
  if (state.rage < 100 || state.cooldowns.ult > 0) return;
  state.rage = 0;
  state.cooldowns.ult = 1.5;
  state._announcedUlt = false;
  toast('ULTIMATE UNLEASHED!', 'good');
  showMessage('!!! KAIJU FURY !!!', 1.4);
  audio.ult();
  slowMo(0.45, 0.5);

  const cfg = state.monsterCfg;
  const head = state.kaiju.head;
  const origin = new THREE.Vector3();
  head.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y *= 0.4; dir.normalize();
  origin.addScaledVector(dir, 4.0);

  world.shake(2.5, 1.4);
  const center = state.kaiju.root.position.clone();
  // Massive AOE damage in all variants -- the *visual* differs.
  damageInRadius(center, 130, 250, true);

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
    showMessage('☢ ATOMIC DEVASTATION ☢', 1.4);
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
    showMessage('⚡ THUNDERSTORM ⚡', 1.4);
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
    showMessage('☄ MISSILE BARRAGE ☄', 1.4);
  } else {
    // Generic fallback (shouldn't hit, but kept for safety)
    world.spawnBeam(origin, dir, 360, cfg.beam.color, cfg.beam.glow);
    world.spawnShockwave(center, 0xffffff, 100);
  }

  // Beam line damage too -- pierce up to 3 instances along the path
  const ray = new THREE.Raycaster(origin, dir, 0.5, 360);
  if (world.bodiesIM) {
    const hits = ray.intersectObject(world.bodiesIM, false);
    let hit = 0;
    for (let i = 0; i < hits.length && hit < 3; i++) {
      const b = world.buildings[hits[i].instanceId];
      if (!b || b.destroyed) continue;
      b.damage(300, hits[i].point, world);
      world.spawnExplosion(hits[i].point, 1.4);
      hit++;
    }
  }
}

function fireMelee() {
  if (state.cooldowns.melee > 0) return;
  state.cooldowns.melee = 0.6;
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  const center = state.kaiju.root.position.clone().addScaledVector(forward, 10);
  const dmg = state.monsterCfg.stats.melee;
  damageInRadius(center, 14, dmg, false);
  state.rage = Math.min(state.maxRage, state.rage + 4);
  // Animate arm swing
  const armR = state.kaiju.root.getObjectByName('armR');
  if (armR) armR.userData.swing = 0.4;
  audio.hit();
}

// ------------------------- Collision -------------------------
// Resolve kaiju-vs-buildings as a circle-vs-AABB push, while wearing the
// building down. Walking into a building no longer phases through it; you
// have to crush it down (or use beam/charge/melee) to pass.
const KAIJU_BODY_RADIUS = 3.6;
function resolveBuildingCollisions(pos, dt) {
  if (!state.monsterCfg) return;
  const radius = KAIJU_BODY_RADIUS * (state.monsterCfg.stats.scale || 1);
  const grid = world.buildingGrid;
  if (!grid) return;
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
    _tmpV1.set(contactX, b.h * 0.6, contactZ);
    b.damage(35 * dt, _tmpV1, world);
  });
}

function updatePlayer(dt) {
  const k = state.kaiju;
  if (!k) return;
  // Pull live gamepad state once per frame
  readGamepad();
  // Right stick aims the camera
  if (padInput.lookX !== 0 || padInput.lookY !== 0) {
    state.yaw   -= padInput.lookX * 0.045;
    state.pitch -= padInput.lookY * 0.030;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.6, 0.4);
  }
  const sprint = keys.ShiftLeft || keys.ShiftRight || touchInput.sprint || padInput.sprint;
  // Speed multipliers bumped: walk ~16 (was 11), sprint ~28 (was 18). Combined
  // with the per-monster `stats.speed` scalar this is roughly +50% across the
  // board so the kaiju actually feels like a kaiju.
  const speed = state.monsterCfg.stats.speed * (sprint ? 28 : 16) * state.upgrades.speedMult;

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

  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  // Camera-right vector. forward x up in a right-handed system gives
  // (-cos(yaw), 0, sin(yaw)) -- the previous (cos, 0, -sin) was the
  // negation, so D strafed left and A strafed right.
  const right = new THREE.Vector3(-Math.cos(state.yaw), 0, Math.sin(state.yaw));
  const move = new THREE.Vector3();
  move.addScaledVector(forward, mz);
  move.addScaledVector(right, mx);
  if (move.lengthSq() > 0) move.normalize();

  state.vel.x = move.x * speed;
  state.vel.z = move.z * speed;

  k.root.position.x += state.vel.x * dt;
  k.root.position.z += state.vel.z * dt;
  resolveBuildingCollisions(k.root.position, dt);
  // Clamp to map bounds
  const limit = 380;
  k.root.position.x = THREE.MathUtils.clamp(k.root.position.x, -limit, limit);
  k.root.position.z = THREE.MathUtils.clamp(k.root.position.z, -limit, limit);

  // ============== Animation ==============
  // Walk cycle: legs swing in opposition, body bobs UP-DOWN twice per
  // step (heel/toe peaks), torso leans FORWARD when moving (more so when
  // sprinting), and ROLLS side-to-side with the planted foot. Tail follows
  // body yaw with a damped lag so it whips behind the kaiju on turns.
  // Head counter-rolls the body sway and bobs slightly out of phase, so
  // the silhouette reads like a real heavy creature instead of a robot.
  const moving = move.lengthSq() > 0;
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
    const JUMP_PEAK_H = 18;
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
      const impactPos = k.root.position.clone();
      world.spawnShockwave(impactPos, 0xffcc44, 55);
      world.spawnShockwave(impactPos, 0xffaa66, 30);
      world.effects.push(makeDustBurst(world, impactPos, 22, 14));
      world.shake(1.2, 0.55);
      damageInRadius(impactPos, 36, 220, true);
      audio.stomp();
    }
    const bobAmt = moving ? (sprint ? 0.95 : 0.70) : 0.0;
    k.root.position.y = moving
      ? sw2 * bobAmt
      : Math.sin(tIdle * 1.5) * 0.18; // breathing
  }

  // ----- Legs -----
  const legL = k.root.getObjectByName('legL');
  const legR = k.root.getObjectByName('legR');
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
  const tail = k.root.getObjectByName('tail');
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
  const armL = k.root.getObjectByName('armL');
  const armR = k.root.getObjectByName('armR');
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
      const footPos = k.root.position.clone();
      damageInRadius(footPos, 7, 60, false);
      world.shake(0.08, 0.12);
      audio.footstep();
    }
    state._lastPhase = phase;
  }

  // Trigger powers
  if (keys.Digit1 || padInput.pressed.beam) fireBeam();
  if (keys.Digit2 || padInput.pressed.roar) fireRoar();
  if (keys.Digit3 || padInput.pressed.charge) fireCharge();
  if (keys.KeyQ   || padInput.pressed.ult) fireUltimate();
  if (keys.Space  || padInput.pressed.stomp) fireStomp();
  if (state.mouseDown || touchInput.attackHeld || padInput.attack) fireMelee();
  if (padInput.pressed.pause) {
    state.paused = !state.paused;
    showMessage(state.paused ? 'PAUSED' : '', state.paused ? 0 : 0);
  }
}

const _camRay = new THREE.Raycaster();
const _camHead = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camCandidates = []; // reused across frames -- we only mutate length
function updateCamera() {
  const k = state.kaiju;
  if (!k) return;
  // Sun offset stays constant relative to the kaiju so shadows follow it
  // through the city without ever overflowing the 90u shadow camera.
  if (sun && Q_HIGH) {
    sun.position.set(k.root.position.x - 90, 90, k.root.position.z + 40);
  }
  k.head.getWorldPosition(_camHead);
  const desiredDist = 28;
  _camOffset.set(
    -Math.sin(state.yaw),
    (16 - state.pitch * 14) / desiredDist,
    -Math.cos(state.yaw)
  ).normalize();

  let dist = desiredDist;
  _camRay.set(_camHead, _camOffset);
  _camRay.far = desiredDist + 2;
  _camRay.near = 0.1;

  // One raycast against the global building InstancedMesh -- Three.js does
  // the per-instance bounds tests internally, no candidate filtering needed.
  if (world.bodiesIM) {
    const hit = _camRay.intersectObject(world.bodiesIM, false)[0];
    if (hit && hit.distance < dist) dist = Math.max(6, hit.distance - 1.5);
  }

  _camTarget.copy(_camHead).addScaledVector(_camOffset, dist);
  const target = _camTarget;
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
  _camLook.y += state.pitch * 12;
  camera.lookAt(_camLook);
}

// ------------------------- World tick -------------------------
const MAX_EFFECTS = isMobile ? 90 : 180;
const MAX_DEBRIS  = isMobile ? 60 : 140;
const MAX_POPUPS  = 28;

function updateWorld(dt) {
  // Effects
  for (let i = world.effects.length - 1; i >= 0; i--) {
    world.effects[i].tick(dt);
    if (world.effects[i].dead) world.effects.splice(i, 1);
  }
  // Cap effect count -- splice once instead of shifting in a loop (O(n) vs O(n^2))
  if (world.effects.length > MAX_EFFECTS) {
    const drop = world.effects.length - MAX_EFFECTS;
    for (let i = 0; i < drop; i++) {
      const e = world.effects[i];
      if (e && e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
    }
    world.effects.splice(0, drop);
  }

  // Debris physics
  for (let i = world.debris.length - 1; i >= 0; i--) {
    const d = world.debris[i];
    d.userData.vel.y -= 30 * dt;
    d.position.addScaledVector(d.userData.vel, dt);
    d.rotation.x += d.userData.angVel.x * dt;
    d.rotation.y += d.userData.angVel.y * dt;
    d.rotation.z += d.userData.angVel.z * dt;
    if (d.position.y < 0) {
      d.position.y = 0;
      d.userData.vel.multiplyScalar(0.4);
      d.userData.vel.y = Math.abs(d.userData.vel.y) * 0.3;
      d.userData.life -= dt * 2;
    }
    d.userData.life -= dt;
    if (d.userData.life <= 0) {
      scene.remove(d);
      world.debris.splice(i, 1);
    }
  }
  // Cap debris in a single splice (avoids O(n^2) shift cascade)
  if (world.debris.length > MAX_DEBRIS) {
    const drop = world.debris.length - MAX_DEBRIS;
    for (let i = 0; i < drop; i++) {
      const d = world.debris[i];
      if (d && d.parent) d.parent.remove(d);
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
    e.update(dt, world, kpos);
  }

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
        state.hp -= s.damage;
        world.spawnExplosion(s.mesh.position.clone(), 0.5);
        world.shake(0.25, 0.2);
        state.damageFlash = Math.min(1, state.damageFlash + s.damage / 60);
        audio.shellHit();
        scene.remove(s.mesh);
        world.shells.splice(i, 1);
        if (state.hp <= 0 && !state.gameOver) gameOver(false);
        continue;
      }
    }
    if (s.life <= 0 || s.mesh.position.y < 0) {
      world.spawnExplosion(s.mesh.position.clone(), 0.4);
      scene.remove(s.mesh);
      world.shells.splice(i, 1);
    }
  }

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
  }

  // Slowly regenerate small rage when idle (rageGain upgrade)
  state.rage = Math.min(state.maxRage, state.rage + dt * 1.5 * state.upgrades.rageGainMult);
  // Passive HP regen if upgraded
  if (state.upgrades.regenRate > 0) {
    state.hp = Math.min(state.maxHp, state.hp + state.upgrades.regenRate * dt);
  }
  // Decay damage flash
  if (state.damageFlash > 0) state.damageFlash = Math.max(0, state.damageFlash - dt * 1.6);

  // Flush any pending GPU uploads for the building InstancedMesh once per
  // frame instead of once per damage event.
  flushBodiesIM(world.bodiesIM);

  // ----- Combo timer -----
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      if (state.combo >= 8) toast(`COMBO ENDED · x${state.combo}`, '');
      state.combo = 0;
    }
  }

  // ----- Pickups -----
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const collected = state.pickups[i].update(dt, world, kpos);
    if (state.pickups[i].dead) state.pickups.splice(i, 1);
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
  // Trickle-respawn so the streets don't go empty after a rampage
  if (state.civilians.length < (isMobile ? 12 : 20) && Math.random() < dt * 0.8) {
    const news = spawnCivilians(scene, 1, 350);
    state.civilians.push(...news);
  }
  // Re-spawn cars over time (keep ~12 active)
  if (state.cars.length < 12 && Math.random() < dt * 0.6) {
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
      damageInRadius(impact, 18, s.damage * 0.6, false);
      const dx = state.kaiju.root.position.x - impact.x;
      const dz = state.kaiju.root.position.z - impact.z;
      if (dx * dx + dz * dz < 18 * 18) {
        state.hp -= s.damage;
        if (state.hp <= 0 && !state.gameOver) gameOver(false);
      }
      scene.remove(s.mesh);
      if (s.ring) scene.remove(s.ring);
      state.artyShells.splice(i, 1);
    }
  }

  // ----- Air strikes -----
  // After wave 3, occasionally call in air strikes near the kaiju
  if (state.wave >= 3 && state.inWave && Math.random() < dt * 0.07) {
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
      damageInRadius(impact, 22, 40, false);
      const dx = state.kaiju.root.position.x - a.x;
      const dz = state.kaiju.root.position.z - a.z;
      if (dx * dx + dz * dz < 22 * 22) {
        state.hp -= 40;
        if (state.hp <= 0 && !state.gameOver) gameOver(false);
      }
      scene.remove(a.ring);
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
  toast('⚠ AIR STRIKE INCOMING ⚠', 'bad');
}

// ------------------------- Minimap -------------------------
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
const MINIMAP_RANGE = 380; // world units shown half-extent

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

  // Buildings (simple dots, sampled)
  ctx.fillStyle = 'rgba(180, 180, 200, 0.35)';
  for (let i = 0; i < world.buildings.length; i += 3) {
    const b = world.buildings[i];
    if (b.destroyed) continue;
    const [x, y] = w2m(b.group.position.x, b.group.position.z);
    if (x < 0 || y < 0 || x > cw || y > ch) continue;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

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

  // Kaiju arrow at center
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(state.yaw + Math.PI);
  ctx.fillStyle = '#66ff99';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// ------------------------- Upgrade choice modal -------------------------
const UPGRADE_POOL = [
  { id: 'hp',    icon: '❤️', name: 'TITAN HEART',    desc: '+30 max HP and full heal', apply: () => { state.maxHp += 30; state.hp = state.maxHp; } },
  { id: 'dmg',   icon: '💥', name: 'CRUSHING BLOWS', desc: '+20% damage to everything', apply: () => { state.upgrades.dmgMult *= 1.2; } },
  { id: 'speed', icon: '🌪️', name: 'KAIJU FURY',     desc: '+15% movement speed',      apply: () => { state.upgrades.speedMult *= 1.15; } },
  { id: 'regen', icon: '🩸', name: 'REGEN SCALES',   desc: 'Heal 2 HP / sec passively', apply: () => { state.upgrades.regenRate += 2; } },
  { id: 'rage',  icon: '🔥', name: 'WRATH OVERFLOW', desc: '+50% rage gain',           apply: () => { state.upgrades.rageGainMult *= 1.5; } },
  { id: 'combo', icon: '⏱️', name: 'BLOOD FRENZY',   desc: '+1.5s combo timer',        apply: () => { state.comboMaxTimer += 1.5; } },
  { id: 'hpkit', icon: '✨', name: 'BATTLE READY',   desc: 'Restore 60 HP and 60 rage', apply: () => { state.hp = Math.min(state.maxHp, state.hp + 60); state.rage = Math.min(state.maxRage, state.rage + 60); } },
];

function offerUpgrades() {
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
    card.className = 'ucard';
    card.innerHTML = `<div class="icon">${u.icon}</div><h3>${u.name}</h3><p>${u.desc}</p>`;
    const choose = () => {
      u.apply();
      audio.tone(660, 0.1); audio.tone(880, 0.15);
      toast(`${u.name}!`, 'good');
      document.getElementById('upgrade-modal').style.display = 'none';
      state.upgradePending = false;
      state.paused = false;
      _menuPad.focused = -1;
      if (!isMobile) renderer.domElement.requestPointerLock?.();
      // Now actually advance the wave
      if (!state.gameOver) startWave(state.wave + 1);
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
    muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  });
}

// ------------------------- Main loop -------------------------
let last = performance.now();
function tick(now) {
  const dtRaw = (now - last) / 1000;
  last = now;
  const slowActive = now < state.slowMoUntil;
  const dt = Math.min(0.05, dtRaw) * (slowActive ? state.slowMoScale : 1);
  if (!state.paused && !state.gameOver) {
    world.time += dt;
    skyMat.uniforms.time.value = world.time;
    if (state.kaiju) {
      updatePlayer(dt);
      updateWorld(dt);
    }
    updateCamera();
    updateHUD();
    // Minimap is a full canvas redraw; ~15Hz is plenty
    if (now - (state._lastMini || 0) > 66) { drawMinimap(); state._lastMini = now; }
    updatePopups(dt);
  } else if (state.kaiju) {
    updateCamera();
    updatePopups(dt);
  }
  // Menu navigation (gamepad) -- runs whenever the menu or upgrade modal
  // is on screen, regardless of paused/gameOver state.
  pollMenuGamepad(dtRaw);
  if (composer) composer.render();
  else renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
