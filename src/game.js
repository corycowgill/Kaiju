import * as THREE from 'three';
import { MONSTERS, buildKaiju } from './monsters.js';
import { Building, buildCity } from './city.js';
import { Tank, Helicopter, Mech } from './enemies.js';
import {
  Effect, makeExplosion, makeSparks, makeShockwave,
  makeMuzzleFlash, makeSmokePuff, makeBeam,
} from './effects.js';

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
renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
game.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x281a30);
scene.fog = new THREE.Fog(0x331a2a, 100, 700);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 2000);

// Lighting: dramatic dusk
const hemi = new THREE.HemisphereLight(0xff7755, 0x221122, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffaa66, 0.9);
sun.position.set(120, 180, 60);
sun.castShadow = !isMobile;
if (!isMobile) {
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -250; sun.shadow.camera.right = 250;
  sun.shadow.camera.top = 250; sun.shadow.camera.bottom = -250;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0005;
}
scene.add(sun);
const fill = new THREE.DirectionalLight(0x4466ff, 0.25);
fill.position.set(-100, 80, -120);
scene.add(fill);
const ambient = new THREE.AmbientLight(0x223344, 0.35);
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
    void main() {
      float h = normalize(vP).y;
      vec3 horizon = vec3(0.55, 0.18, 0.18);
      vec3 zenith = vec3(0.05, 0.02, 0.12);
      vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.7, h));
      // stars
      vec2 p = normalize(vP).xz * 800.0;
      float s = fract(sin(dot(floor(p), vec2(12.9898,78.233))) * 43758.5453);
      if (h > 0.2 && s > 0.997) col += vec3(1.0) * (s - 0.997) * 200.0;
      // moon
      vec3 moonDir = normalize(vec3(0.4, 0.6, -0.5));
      float md = dot(normalize(vP), moonDir);
      col += vec3(1.0, 0.95, 0.85) * smoothstep(0.998, 1.0, md);
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
  spawnExplosion: function (pos, scale = 1) { this.effects.push(makeExplosion(this, pos, scale)); },
  spawnSparks: function (pos, n) { this.effects.push(makeSparks(this, pos, n)); },
  spawnShockwave: function (pos, color, r) { this.effects.push(makeShockwave(this, pos, color, r)); },
  spawnMuzzleFlash: function (pos, s) { this.effects.push(makeMuzzleFlash(this, pos, s)); },
  spawnSmoke: function (pos, s) { this.effects.push(makeSmokePuff(this, pos, s)); },
  spawnBeam: function (origin, dir, len, color, glow) {
    this.effects.push(makeBeam(this, origin, dir, len, color, glow));
  },
  spawnShell: function (origin, dir, type) {
    const speed = type === 'mech' ? 70 : (type === 'heli' ? 90 : 80);
    const damage = type === 'mech' ? 14 : (type === 'heli' ? 6 : 9);
    const color = type === 'mech' ? 0xff8844 : (type === 'heli' ? 0xffeeaa : 0xffaa44);
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.copy(origin);
    scene.add(m);
    this.shells.push({ mesh: m, vel: dir.clone().multiplyScalar(speed), life: 4.0, damage, type });
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
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.15,
  walkPhase: 0,
  cooldowns: { beam: 0, roar: 0, charge: 0, stomp: 0, melee: 0 },
  mouseDown: false,
  paused: false,
  gameOver: false,
  inWave: false,
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateOrientationClass();
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
  for (const t of e.changedTouches) {
    if (t.identifier === touchInput.joyId) continue;
    if (isOnControl(t.target)) continue;
    if (t.clientX < window.innerWidth * 0.4) continue; // left side reserved for joystick area
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
  startGame(state.monsterKey);
});

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
function showWaveBanner(text, sub) {
  const el = document.getElementById('wave-banner');
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

function startWave(n) {
  state.wave = n;
  state.inWave = true;
  showWaveBanner(`WAVE ${n}`, 'THE MILITARY STRIKES BACK');

  const enemies = world.enemies;
  // Spawn enemies in a ring around the kaiju
  const kpos = state.kaiju.root.position;
  const tankCount = 3 + n * 2;
  const heliCount = Math.min(8, Math.floor(n * 1.2));
  const mechCount = n >= 3 ? Math.floor((n - 2) * 1.0) : 0;

  function spawnPos(radius) {
    const a = Math.random() * Math.PI * 2;
    return [kpos.x + Math.cos(a) * radius, kpos.z + Math.sin(a) * radius];
  }
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
}

world.onTankKilled = () => { state.tanksKilled++; state.score += 250; state.rage = Math.min(state.maxRage, state.rage + 8); };
world.onHeliKilled = () => { state.helisKilled++; state.score += 350; state.rage = Math.min(state.maxRage, state.rage + 10); };
world.onMechKilled = () => { state.mechsKilled++; state.score += 700; state.rage = Math.min(state.maxRage, state.rage + 18); };
world.onBuildingDestroyed = (b) => {
  state.buildingsDestroyed++;
  state.score += Math.floor(b.maxHp * 1.5);
  state.rage = Math.min(state.maxRage, state.rage + 6);
};

function gameOver(victory) {
  state.gameOver = true;
  document.exitPointerLock?.();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('powers').classList.add('hidden');
  document.getElementById('help').classList.add('hidden');
  document.getElementById('goTitle').textContent = victory ? 'TOKYO FALLS' : 'DEFEATED';
  document.getElementById('goSubtitle').textContent = victory ? 'The kaiju reigns supreme.' : 'The military has prevailed...';
  document.getElementById('finalScore').textContent = state.score.toLocaleString();
  document.getElementById('finalWave').textContent = state.wave;
  document.getElementById('finalBuildings').textContent = state.buildingsDestroyed;
  document.getElementById('finalTanks').textContent = state.tanksKilled + state.helisKilled + state.mechsKilled;
  document.getElementById('gameover').classList.remove('hidden');
}

// ------------------------- Powers / damage -------------------------
function damageInRadius(center, radius, amount, isAerialAlso = true) {
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
      e.damage(amount, world);
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

  // Hit detection along ray
  const ray = new THREE.Raycaster(origin, dir, 0.5, length);
  // Building hits
  const buildingMeshes = world.buildings.filter(b => !b.destroyed).map(b => b.body);
  const hits = ray.intersectObjects(buildingMeshes, false);
  if (hits.length) {
    for (const h of hits) {
      h.object.userData.building.damage(cfg.damage, h.point, world);
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
      e.damage(cfg.damage * 0.7, world);
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
}

function fireCharge() {
  const cfg = state.monsterCfg.charge;
  if (state.rage < cfg.cost || state.cooldowns.charge > 0) return;
  state.rage -= cfg.cost;
  state.cooldowns.charge = 6.0;
  // Dash forward and damage anything in front
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  state.kaiju.root.position.addScaledVector(forward, 28);
  world.spawnShockwave(state.kaiju.root.position.clone(), cfg.color, 25);
  world.shake(0.7, 0.4);
  // damage cone in front
  const center = state.kaiju.root.position.clone().addScaledVector(forward, 12);
  damageInRadius(center, 28, cfg.damage, false);
}

function fireStomp() {
  if (state.rage < 15 || state.cooldowns.stomp > 0) return;
  state.rage -= 15;
  state.cooldowns.stomp = 1.5;
  const center = state.kaiju.root.position.clone();
  world.spawnShockwave(center, 0xffcc44, 35);
  world.shake(0.6, 0.4);
  damageInRadius(center, 24, 22, false);
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
}

// ------------------------- Player update -------------------------
function updatePlayer(dt) {
  const k = state.kaiju;
  if (!k) return;
  const sprint = keys.ShiftLeft || keys.ShiftRight || touchInput.sprint;
  const speed = state.monsterCfg.stats.speed * (sprint ? 18 : 11);

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
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  const move = new THREE.Vector3();
  move.addScaledVector(forward, mz);
  move.addScaledVector(right, mx);
  if (move.lengthSq() > 0) move.normalize();

  state.vel.x = move.x * speed;
  state.vel.z = move.z * speed;

  k.root.position.x += state.vel.x * dt;
  k.root.position.z += state.vel.z * dt;
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
    }
    state._lastPhase = phase;
  }

  // Trigger powers
  if (keys.Digit1) fireBeam();
  if (keys.Digit2) fireRoar();
  if (keys.Digit3) fireCharge();
  if (keys.Space) fireStomp();
  if (state.mouseDown || touchInput.attackHeld) fireMelee();
}

function updateCamera() {
  const k = state.kaiju;
  if (!k) return;
  // Third-person camera behind kaiju, above
  const headPos = new THREE.Vector3();
  k.head.getWorldPosition(headPos);
  const offset = new THREE.Vector3(
    -Math.sin(state.yaw) * 28,
    16 - state.pitch * 14,
    -Math.cos(state.yaw) * 28
  );
  const target = headPos.clone().add(offset);
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
function updateWorld(dt) {
  // Effects
  for (let i = world.effects.length - 1; i >= 0; i--) {
    world.effects[i].tick(dt);
    if (world.effects[i].dead) world.effects.splice(i, 1);
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
      startWave(state.wave + 1);
    }, 2200);
    showMessage('WAVE CLEARED · +1000', 2.0);
  }

  // Slowly regenerate small rage when idle
  state.rage = Math.min(state.maxRage, state.rage + dt * 1.5);
}

// ------------------------- Main loop -------------------------
let last = performance.now();
function tick(now) {
  const dtRaw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, dtRaw);
  if (!state.paused && !state.gameOver) {
    world.time += dt;
    skyMat.uniforms.time.value = world.time;
    if (state.kaiju) {
      updatePlayer(dt);
      updateWorld(dt);
    }
    updateCamera();
    updateHUD();
  } else if (state.kaiju) {
    updateCamera();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
