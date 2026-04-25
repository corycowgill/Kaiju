import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { MONSTERS, buildKaiju } from './monsters.js';
import { Building, buildCity, spawnCars } from './city.js';
import { Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech } from './enemies.js';
import {
  Effect, makeExplosion, makeSparks, makeShockwave,
  makeMuzzleFlash, makeSmokePuff, makeBeam, makeHitPulse, makeSmokeColumn,
} from './effects.js';
import { Pickup, rollDrop } from './pickups.js';
import audio from './audio.js';

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

function updateOrientationClass() {
  if (!isMobile) return;
  if (window.innerHeight > window.innerWidth) document.body.classList.add('portrait');
  else document.body.classList.remove('portrait');
}
updateOrientationClass();
window.addEventListener('orientationchange', updateOrientationClass);

// ------------------------- Setup -------------------------
const game = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.0) : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
// Shadows are off entirely now -- biggest single fps win for a city of this
// size. The brighter lighting + bloom carry the look without them.
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
game.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x281a30);
scene.fog = new THREE.Fog(0x6a4a5a, 240, 1100);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 2000);

// Postprocessing -- bloom only, at half-res, on desktop. Skip on mobile.
let composer = null;
let bloomPass = null;
let fxaaPass = null;
if (!isMobile) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5), // half-res buffer
    0.75,  // strength
    0.55,  // radius
    0.65   // threshold -- a touch higher so only really bright pixels bloom
  );
  composer.addPass(bloomPass);
}

// Lighting: dramatic dusk
// Lighting: warm dusk + strong fill so the city reads clearly
const hemi = new THREE.HemisphereLight(0xffaa88, 0x44334a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdcb0, 1.7);
sun.position.set(120, 180, 60);
sun.castShadow = false;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x88aaff, 0.55);
fill.position.set(-100, 80, -120);
scene.add(fill);
const ambient = new THREE.AmbientLight(0x556677, 0.7);
scene.add(ambient);

// Sky dome with stars
const skyGeom = new THREE.SphereGeometry(1500, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { time: { value: 0 } },
  vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    varying vec3 vP;
    uniform float time;
    // 2D hash + noise for clouds
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
      return v;
    }
    void main() {
      vec3 d = normalize(vP);
      float h = d.y;

      // Layered gradient: horizon glow -> mid -> zenith
      vec3 horizon = vec3(0.95, 0.32, 0.22);   // sunset orange
      vec3 mid     = vec3(0.32, 0.10, 0.32);   // purple
      vec3 zenith  = vec3(0.04, 0.02, 0.14);   // deep blue
      vec3 col = mix(horizon, mid, smoothstep(-0.05, 0.35, h));
      col = mix(col, zenith, smoothstep(0.25, 0.85, h));

      // Subtle nebula bands
      float n = fbm(d.xz * 4.0 + vec2(time * 0.005, 0.0));
      col += vec3(0.18, 0.06, 0.30) * (n - 0.5) * smoothstep(0.1, 0.6, h);

      // Soft clouds drifting near horizon
      float cloud = smoothstep(0.4, 0.9, fbm(vec2(d.x, d.z) * 3.5 + vec2(time * 0.012, 0.0)));
      cloud *= smoothstep(-0.1, 0.4, h) * (1.0 - smoothstep(0.5, 0.9, h));
      col = mix(col, vec3(0.55, 0.32, 0.42), cloud * 0.55);

      // Stars - sharper
      vec2 p = d.xz * 1200.0;
      float s = hash(floor(p));
      if (h > 0.18 && s > 0.9965) col += vec3(0.9, 0.95, 1.0) * (s - 0.9965) * 280.0;
      // Twinkle a few brighter ones
      if (h > 0.3 && s > 0.9991) {
        float tw = 0.5 + 0.5 * sin(time * 3.0 + s * 50.0);
        col += vec3(1.0, 0.9, 0.7) * tw * 1.2;
      }

      // Moon with soft halo
      vec3 moonDir = normalize(vec3(0.4, 0.6, -0.5));
      float md = dot(d, moonDir);
      col += vec3(1.0, 0.95, 0.82) * smoothstep(0.997, 1.0, md);
      col += vec3(0.6, 0.5, 0.45) * smoothstep(0.985, 0.998, md) * 0.4;

      // Sun-glow disc near horizon (off-screen sun for warm rim)
      vec3 sunDir = normalize(vec3(-0.55, 0.12, 0.25));
      float sd = max(0.0, dot(d, sunDir));
      col += vec3(1.0, 0.5, 0.25) * pow(sd, 16.0) * 0.6;

      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(skyGeom, skyMat);
scene.add(sky);

// ------------------------- World object -------------------------
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
    const profile = {
      tank:  { speed: 80,  damage: 9,  color: 0xffaa44, size: 0.35 },
      heli:  { speed: 90,  damage: 6,  color: 0xffeeaa, size: 0.3 },
      mech:  { speed: 70,  damage: 14, color: 0xff8844, size: 0.4 },
      jet:   { speed: 110, damage: 11, color: 0xff5533, size: 0.32 },
      rifle: { speed: 140, damage: 2,  color: 0xffeecc, size: 0.18 },
      boss:  { speed: 75,  damage: 22, color: 0xff3322, size: 0.55 },
    }[type] || { speed: 80, damage: 9, color: 0xffaa44, size: 0.35 };
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(profile.size, 6, 6),
      new THREE.MeshBasicMaterial({ color: profile.color })
    );
    m.position.copy(origin);
    scene.add(m);
    this.shells.push({ mesh: m, vel: dir.clone().multiplyScalar(profile.speed), life: 4.0, damage: profile.damage, type });
    audio.shoot(type);
  },
  showMessage,
};

// Build city
world.buildings = buildCity(scene, world, { lite: isMobile });

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
  renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.0) : Math.min(window.devicePixelRatio, 1.5));
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
const cardsDiv = document.getElementById('monsterCards');
for (const key of Object.keys(MONSTERS)) {
  const m = MONSTERS[key];
  const card = document.createElement('div');
  card.className = 'monster-card';
  card.dataset.key = key;
  card.innerHTML = `
    <div class="preview" style="background:${m.bg}">${m.emoji}</div>
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
}
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
  state.cars = spawnCars(scene, isMobile ? 8 : 16, 380, 36);

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

function updateHUD() {
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

  // Damage flash + low HP vignette
  const flashEl = document.getElementById('damage-flash');
  if (flashEl) flashEl.style.opacity = String(state.damageFlash * 0.85);
  const lowEl = document.getElementById('lowhp-warning');
  if (lowEl) {
    const hpPct = state.hp / state.maxHp;
    if (hpPct < 0.3 && !state.gameOver) lowEl.classList.add('active');
    else lowEl.classList.remove('active');
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
function updatePopups(dt) {
  for (let i = state.popups.length - 1; i >= 0; i--) {
    const p = state.popups[i];
    p.life -= dt;
    if (p.life <= 0) { p.el.remove(); state.popups.splice(i, 1); continue; }
    const t = 1 - p.life / p.maxLife;
    const v = p.worldPos.clone();
    v.y += t * 7;
    v.project(camera);
    if (v.z > 1 || v.z < -1) { p.el.style.opacity = '0'; continue; }
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
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
world.onBuildingDestroyed = (b) => {
  state.buildingsDestroyed++;
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
  const ce = document.getElementById('combo');
  if (ce) ce.style.opacity = '0';
  document.getElementById('goTitle').textContent = victory ? 'TOKYO FALLS' : 'DEFEATED';
  document.getElementById('goSubtitle').textContent = victory ? 'The kaiju reigns supreme.' : 'The military has prevailed...';
  audio.gameOver();
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
  // (hit pulses are spawned on each enemy hit below)
  // Damage buildings
  for (const b of world.buildings) {
    if (b.destroyed) continue;
    const dx = b.group.position.x - center.x;
    const dz = b.group.position.z - center.z;
    const r = Math.max(b.w, b.d) * 0.5;
    if (dx * dx + dz * dz < (radius + r) ** 2) {
      b.damage(amount, b.group.position.clone().setY(b.h * 0.6), world);
    }
  }
  // Damage enemies
  for (const e of world.enemies) {
    if (e.dead) continue;
    if (!isAerialAlso && e.type === 'heli') continue;
    const dx = e.root.position.x - center.x;
    const dz = e.root.position.z - center.z;
    if (dx * dx + dz * dz < radius * radius) {
      const wasDead = e.dead;
      e.damage(amount, world);
      world.spawnHitPulse(e.root.position.clone().setY(4), 0xffffff);
      if (!wasDead && e.dead && e.type !== 'soldier') {
        spawnPopup(e.root.position.clone().setY(8),
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

  const head = state.kaiju.head;
  const origin = new THREE.Vector3();
  head.getWorldPosition(origin);
  origin.y += 0.5;
  // direction = camera forward, biased horizontally toward enemies
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y *= 0.4; dir.normalize();
  origin.addScaledVector(dir, 3.5);

  const length = 260;
  world.spawnBeam(origin, dir, length, cfg.color, cfg.glow);
  world.shake(0.3, 0.4);
  audio.beam();

  // Hit detection along ray
  const ray = new THREE.Raycaster(origin, dir, 0.5, length);
  // Building hits
  const buildingMeshes = world.buildings.filter(b => !b.destroyed).map(b => b.body);
  const hits = ray.intersectObjects(buildingMeshes, false);
  const beamDmg = cfg.damage * (state.upgrades.dmgMult || 1);
  if (hits.length) {
    for (const h of hits) {
      h.object.userData.building.damage(beamDmg, h.point, world);
      world.spawnExplosion(h.point, 0.8);
      break; // pierce just first; tweak as desired
    }
  }
  // Enemy hits along beam (sphere check)
  for (const e of world.enemies) {
    if (e.dead) continue;
    const ep = e.root.position.clone(); ep.y += 4;
    const v = ep.clone().sub(origin);
    const along = v.dot(dir);
    if (along < 0 || along > length) continue;
    const closest = origin.clone().addScaledVector(dir, along);
    const distSq = closest.distanceToSquared(ep);
    if (distSq < 9) {
      e.damage(beamDmg * 0.7, world);
      world.spawnExplosion(ep, 0.7);
    }
  }
}

function fireRoar() {
  const cfg = state.monsterCfg.roar;
  if (state.rage < cfg.cost || state.cooldowns.roar > 0) return;
  state.rage -= cfg.cost;
  state.cooldowns.roar = 5.0;

  const center = state.kaiju.root.position.clone();
  world.spawnShockwave(center, cfg.color, cfg.radius);
  world.shake(0.8, 0.5);
  damageInRadius(center, cfg.radius, cfg.damage, true);
  audio.roar();
}

function fireCharge() {
  const cfg = state.monsterCfg.charge;
  if (state.rage < cfg.cost || state.cooldowns.charge > 0) return;
  state.rage -= cfg.cost;
  state.cooldowns.charge = 6.0;
  // Dash forward and damage anything in front
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  // Damage in a cone first so anything we plow through gets demolished
  const cone = state.kaiju.root.position.clone().addScaledVector(forward, 12);
  damageInRadius(cone, 28, cfg.damage, false);
  state.kaiju.root.position.addScaledVector(forward, 28);
  // Push out of any building that survived the cone
  resolveBuildingCollisions(state.kaiju.root.position, 0.5);
  world.spawnShockwave(state.kaiju.root.position.clone(), cfg.color, 25);
  world.shake(0.7, 0.4);
  // Final cleanup AOE at landing point
  damageInRadius(state.kaiju.root.position, 24, cfg.damage * 0.5, false);
  audio.charge();
}

function fireStomp() {
  if (state.rage < 15 || state.cooldowns.stomp > 0) return;
  state.rage -= 15;
  state.cooldowns.stomp = 1.5;
  const center = state.kaiju.root.position.clone();
  world.spawnShockwave(center, 0xffcc44, 35);
  world.shake(0.6, 0.4);
  damageInRadius(center, 24, 22, false);
  audio.stomp();
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

  // Mega-beam: extra wide, very long
  world.spawnBeam(origin, dir, 360, cfg.beam.color, cfg.beam.glow);
  world.shake(2.5, 1.4);

  // Triple expanding shockwave
  const center = state.kaiju.root.position.clone();
  world.spawnShockwave(center, 0xffffff, 100);
  setTimeout(() => world.spawnShockwave(center.clone(), cfg.beam.color, 140), 120);
  setTimeout(() => world.spawnShockwave(center.clone(), cfg.beam.glow, 180), 260);

  // Massive AOE damage everywhere within 130
  damageInRadius(center, 130, 250, true);

  // Beam line damage too
  const ray = new THREE.Raycaster(origin, dir, 0.5, 360);
  const buildingMeshes = world.buildings.filter(b => !b.destroyed).map(b => b.body);
  const hits = ray.intersectObjects(buildingMeshes, false);
  for (let i = 0; i < Math.min(hits.length, 3); i++) {
    hits[i].object.userData.building.damage(300, hits[i].point, world);
    world.spawnExplosion(hits[i].point, 1.4);
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
  for (const b of world.buildings) {
    if (b.destroyed) continue;
    const bx = b.group.position.x;
    const bz = b.group.position.z;
    const halfW = b.w / 2;
    const halfD = b.d / 2;

    // Quick reject (single-distance test against bounding circle of building)
    const ddx = pos.x - bx;
    const ddz = pos.z - bz;
    const maxR = Math.max(halfW, halfD) + radius;
    if (ddx * ddx + ddz * ddz > maxR * maxR) continue;

    // Closest point on the AABB footprint
    const cx = THREE.MathUtils.clamp(pos.x, bx - halfW, bx + halfW);
    const cz = THREE.MathUtils.clamp(pos.z, bz - halfD, bz + halfD);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dist2 = dx * dx + dz * dz;
    if (dist2 >= radius * radius) continue;

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
    b.damage(35 * dt, new THREE.Vector3(contactX, b.h * 0.6, contactZ), world);
  }
}
function updatePlayer(dt) {
  const k = state.kaiju;
  if (!k) return;
  const sprint = keys.ShiftLeft || keys.ShiftRight || touchInput.sprint;
  const speed = state.monsterCfg.stats.speed * (sprint ? 18 : 11) * state.upgrades.speedMult;

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

  // Face direction of yaw
  k.root.rotation.y = state.yaw;

  // Walking animation
  const moving = move.lengthSq() > 0;
  if (moving) state.walkPhase += dt * 4.5;
  const sw = Math.sin(state.walkPhase);
  const legL = k.root.getObjectByName('legL');
  const legR = k.root.getObjectByName('legR');
  if (legL && legR) {
    legL.rotation.x = moving ? sw * 0.5 : 0;
    legR.rotation.x = moving ? -sw * 0.5 : 0;
  }
  // Body bob
  k.root.position.y = moving ? Math.abs(sw) * 0.4 : 0;

  // Tail sway
  const tail = k.root.getObjectByName('tail');
  if (tail) tail.rotation.y = Math.sin(world.time * 1.5) * 0.2 + (moving ? sw * 0.3 : 0);

  // Arm swing animation (and melee swing)
  const armL = k.root.getObjectByName('armL');
  const armR = k.root.getObjectByName('armR');
  if (armL) armL.rotation.x = moving ? -sw * 0.3 : 0;
  if (armR) {
    const swing = armR.userData.swing || 0;
    if (swing > 0) {
      armR.rotation.x = -1.3 * Math.sin(swing * Math.PI / 0.4);
      armR.userData.swing = Math.max(0, swing - dt);
    } else {
      armR.rotation.x = moving ? sw * 0.3 : 0;
    }
  }

  // Cooldowns tick
  for (const k2 of Object.keys(state.cooldowns)) {
    state.cooldowns[k2] = Math.max(0, state.cooldowns[k2] - dt);
  }

  // Foot stomp on each step (very light damage)
  if (moving) {
    const phase = state.walkPhase % (Math.PI * 2);
    if (!state._lastPhase) state._lastPhase = phase;
    if ((state._lastPhase < Math.PI && phase >= Math.PI) || (state._lastPhase > phase)) {
      // crossed step
      const footPos = k.root.position.clone();
      damageInRadius(footPos, 5, 4, false);
      world.shake(0.05, 0.1);
      audio.footstep();
    }
    state._lastPhase = phase;
  }

  // Trigger powers
  if (keys.Digit1) fireBeam();
  if (keys.Digit2) fireRoar();
  if (keys.Digit3) fireCharge();
  if (keys.KeyQ) fireUltimate();
  if (keys.Space) fireStomp();
  if (state.mouseDown || touchInput.attackHeld) fireMelee();
}

const _camRay = new THREE.Raycaster();
function updateCamera() {
  const k = state.kaiju;
  if (!k) return;
  // Third-person camera behind kaiju, above
  const headPos = new THREE.Vector3();
  k.head.getWorldPosition(headPos);
  const desiredDist = 28;
  const offsetDir = new THREE.Vector3(
    -Math.sin(state.yaw),
    (16 - state.pitch * 14) / desiredDist, // approx vertical normalized
    -Math.cos(state.yaw)
  ).normalize();

  // Ray from headPos outward; clamp camera distance if it would clip a building
  let dist = desiredDist;
  _camRay.set(headPos, offsetDir);
  _camRay.far = desiredDist + 2;
  _camRay.near = 0.1;
  // Only test buildings near the camera path
  const candidates = [];
  for (const b of world.buildings) {
    if (b.destroyed) continue;
    const dx = b.group.position.x - headPos.x;
    const dz = b.group.position.z - headPos.z;
    if (dx * dx + dz * dz > 60 * 60) continue;
    candidates.push(b.body);
  }
  if (candidates.length) {
    const hit = _camRay.intersectObjects(candidates, false)[0];
    if (hit && hit.distance < dist) dist = Math.max(6, hit.distance - 1.5);
  }

  const target = headPos.clone().addScaledVector(offsetDir, dist);
  // Camera shake
  if (world._shakeTime > 0) {
    target.x += (Math.random() - 0.5) * world._shakeMag * 2;
    target.y += (Math.random() - 0.5) * world._shakeMag * 2;
    target.z += (Math.random() - 0.5) * world._shakeMag * 2;
    world._shakeTime -= 1 / 60;
    if (world._shakeTime <= 0) world._shakeMag = 0;
  }
  camera.position.lerp(target, 0.18);
  const look = headPos.clone();
  look.y += state.pitch * 12;
  camera.lookAt(look);
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
  // Cap effect count -- drop the oldest if we're flooded so older smoke
  // doesn't choke the GPU during boss waves.
  while (world.effects.length > MAX_EFFECTS) {
    const e = world.effects.shift();
    if (e && e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
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
  // Cap debris so a chain of building demolitions can't pile up.
  while (world.debris.length > MAX_DEBRIS) {
    const d = world.debris.shift();
    if (d && d.parent) d.parent.remove(d);
  }
  // Cap popups too
  while (state.popups.length > MAX_POPUPS) {
    const p = state.popups.shift();
    if (p && p.el) p.el.remove();
  }

  // Enemies
  const kpos = state.kaiju ? state.kaiju.root.position : new THREE.Vector3();
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.dead) { world.enemies.splice(i, 1); continue; }
    e.update(dt, world, kpos);
  }

  // Shells
  for (let i = world.shells.length - 1; i >= 0; i--) {
    const s = world.shells[i];
    s.mesh.position.addScaledVector(s.vel, dt);
    s.life -= dt;
    // Hit kaiju?
    if (state.kaiju) {
      const kCenter = state.kaiju.root.position.clone(); kCenter.y += 8;
      if (s.mesh.position.distanceTo(kCenter) < 5) {
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
    c.update(dt, world, kpos, 380);
  }
  // Re-spawn cars over time (keep ~12 active)
  if (state.cars.length < 12 && Math.random() < dt * 0.6) {
    const news = spawnCars(scene, 1, 380, 36);
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
    drawMinimap();
    updatePopups(dt);
  } else if (state.kaiju) {
    updateCamera();
    updatePopups(dt);
  }
  if (composer) composer.render();
  else renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
