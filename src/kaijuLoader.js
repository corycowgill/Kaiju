import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cachedFetch, normalizeGLTFMaterials } from './assetCache.js';

/** Fetch a GLB via the asset cache, then parse it with GLTFLoader. */
function _cachedGLB(loader, url) {
  return cachedFetch(url).then((buf) =>
    new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject))
  ).then((gltf) => { normalizeGLTFMaterials(gltf.scene); return gltf; });
}

// ---- Godzilla (reptile kaiju) ----
const GODZILLA_ANIMS = {
  idle:       'Animation_Alert_withSkin.glb',
  idle2:      'Animation_Idle_10_withSkin.glb',
  walk:       'Animation_Walking_withSkin.glb',
  run:        'Animation_Running_withSkin.glb',
  sprint:     'Animation_Run_02_withSkin.glb',
  sprintFast: 'Animation_RunFast_withSkin.glb',
  turnLeft:   'Animation_Run_Turn_Left_withSkin.glb',
  turnRight:  'Animation_Run_Turn_Right_withSkin.glb',
  walkTurnL:  'Animation_Run_Turn_Left_withSkin.glb',   // reuse run turn (no walk-turn in this model)
  walkTurnR:  'Animation_Run_Turn_Right_withSkin.glb',   // reuse run turn (no walk-turn in this model)
  turnSharp:  'Animation_Run_Sharp_Turn_Right_withSkin.glb',
  backRight:  'Animation_BackRight_Run_withSkin.glb',
  skill1:     'Animation_Charged_Slash_withSkin.glb',
  skill2:     'Animation_Charged_Spell_Cast_withSkin.glb',
  stomp:      'Animation_Angry_Ground_Stomp_2_withSkin.glb',
  jump:       'Animation_Basic_Jump_withSkin.glb',
  death:      'Animation_Shot_and_Slow_Fall_Backward_withSkin.glb',
  dead:       'Animation_Dead_withSkin.glb',
  punch:      'Animation_Punch_Combo_withSkin.glb',
  dance:      'Animation_Idle_10_withSkin.glb',           // no dance anim, use idle2 for victory
  cast1:      'Animation_mage_soell_cast_1_withSkin.glb',
  cast2:      'Animation_mage_soell_cast_2_withSkin.glb',
  cast3:      'Animation_mage_soell_cast_withSkin.glb',
};

// ---- Ghidorah (three-headed dragon kaiju) ----
const GHIDORAH_ANIMS = {
  idle:       'Animation_Alert_withSkin.glb',
  idle2:      'Animation_Idle_3_withSkin.glb',
  walk:       'Animation_Walking_withSkin.glb',
  run:        'Animation_Running_withSkin.glb',
  sprint:     'Animation_Run_02_withSkin.glb',
  turnLeft:   'Animation_Run_Turn_Left_withSkin.glb',
  turnRight:  'Animation_Run_Turn_Right_withSkin.glb',
  walkTurnL:  'Animation_Walk_Turn_Left_withSkin.glb',
  walkTurnR:  'Animation_Walk_Turn_Right_withSkin.glb',
  skill1:     'Animation_Skill_01_withSkin.glb',
  skill2:     'Animation_Skill_02_withSkin.glb',
  skill3:     'Animation_Skill_03_withSkin.glb',
  stomp:      'Animation_Angry_Stomp_withSkin.glb',
  jump:       'Animation_Regular_Jump_withSkin.glb',
  punch:      'Animation_Punch_Combo_1_withSkin.glb',
  dance:      'Animation_Victory_Cheer_withSkin.glb',
  cheer:      'Animation_Cheer_with_Both_Hands_withSkin.glb',
  cast1:      'Animation_mage_soell_cast_1_withSkin.glb',
  cast2:      'Animation_mage_soell_cast_2_withSkin.glb',
  cast3:      'Animation_mage_soell_cast_3_withSkin.glb',
};

// ---- Mecha (robot kaiju) ----
const MECHA_ANIMS = {
  idle:       'Animation_Alert_withSkin.glb',
  idle2:      'Animation_Idle_4_withSkin.glb',
  walk:       'Animation_Walking_withSkin.glb',
  run:        'Animation_Running_withSkin.glb',
  sprint:     'Animation_Run_02_withSkin.glb',
  walkTurnL:  'Animation_Walk_Turn_Left_withSkin.glb',
  walkTurnR:  'Animation_Walk_Turn_Right_withSkin.glb',
  skill1:     'Animation_Skill_01_withSkin.glb',
  skill2:     'Animation_Skill_02_withSkin.glb',
  skill3:     'Animation_Skill_03_withSkin.glb',
  stomp:      'Animation_Angry_Stomp_withSkin.glb',
  punch:      'Animation_Punch_Combo_withSkin.glb',
  death:      'Animation_Dead_withSkin.glb',
  dance:      'Animation_victory_withSkin.glb',
  shrug:      'Animation_Shrug_withSkin.glb',
  cast1:      'Animation_mage_soell_cast_1_withSkin.glb',
  cast2:      'Animation_mage_soell_cast_withSkin.glb',
  cast3:      'Animation_mage_soell_cast_3_withSkin.glb',
  walkBack:   'Animation_Walk_Backward_withSkin.glb',
  walkBackIP: 'Animation_Walk_Backward_inplace_withSkin.glb',
};

// One-shot animations (play once then return to previous)
const ONE_SHOT = new Set([
  'skill1', 'skill2', 'skill3', 'stomp', 'stomp2', 'jump',
  'death', 'dead', 'punch', 'tantrum', 'flex', 'agree', 'cheer',
  'cast1', 'cast2', 'cast3', 'shrug', 'turnSharp', 'backRight',
]);

// Model configs by monster key
// Each model ships as ONE merged GLB (mesh/skin/texture once + every clip).
// Clips are named after the original per-animation file, minus the Meshy
// prefix and '.glb' (e.g. 'Animation_Walking_withSkin'), so the ANIMS
// tables above still describe which clip each game key uses.
const MODEL_CONFIGS = {
  godzilla: { file: './assets/kaiju_model/godzilla.glb',    anims: GODZILLA_ANIMS },
  ghidorah: { file: './assets/ghidorah_model/ghidorah.glb', anims: GHIDORAH_ANIMS },
  mecha:    { file: './assets/mecha_model/mecha.glb',       anims: MECHA_ANIMS },
};

/**
 * @callback ProgressCallback
 * @param {number} loaded - files loaded so far
 * @param {number} total - total files to load
 * @param {string} label - human-readable description of current step
 */

/**
 * Loads a Kaiju GLB model and all animation clips.
 * @param {string} monsterKey - 'godzilla' or 'ghidorah'
 * @param {ProgressCallback} [onProgress] - optional progress callback
 * @returns {Promise<Object>} { root, mixer, animations, head, tail, play, playOnce }
 */
export async function loadKaijuModel(monsterKey, onProgress) {
  const config = MODEL_CONFIGS[monsterKey];
  if (!config) throw new Error(`No GLB model config for "${monsterKey}"`);

  const { file, anims } = config;
  const loader = new GLTFLoader();
  const totalSteps = 1;

  if (onProgress) onProgress(0, totalSteps, 'Loading model');
  const gltf = await _cachedGLB(loader, file);
  const root = gltf.scene;
  root.name = 'kaiju';
  if (onProgress) onProgress(1, totalSteps, 'Model loaded');

  // Scale to match the game (~15 units tall)
  root.scale.setScalar(18);

  // Enable shadows + disable frustum culling so animated parts never vanish
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });

  // Animation mixer
  const mixer = new THREE.AnimationMixer(root);
  const animations = {};
  const actions = {};

  // Map game keys -> clips by clip name (shared clips reuse one action set per key,
  // exactly like the old one-file-per-animation loader)
  const clipsByName = new Map(gltf.animations.map((c) => [c.name, c]));
  for (const [name, animFile] of Object.entries(anims)) {
    const clip = clipsByName.get(animFile.replace(/\.glb$/, ''));
    if (!clip) { console.warn(`[KaijuLoader] Missing clip "${animFile}" for "${name}"`); continue; }
    animations[name] = clip;
    actions[name] = mixer.clipAction(clip);
  }
  // 'run' always came from the base Running file
  if (!animations.run) {
    const clip = clipsByName.get('Animation_Running_withSkin');
    if (clip) { animations.run = clip; actions.run = mixer.clipAction(clip); }
  }

  // Configure one-shot vs looping
  for (const [name, action] of Object.entries(actions)) {
    if (ONE_SHOT.has(name)) {
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat);
    }
  }

  // Find head/tail bones for beam origin + camera
  let head = null;
  let tail = null;
  root.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (!head && (n.includes('head') || n.includes('skull'))) head = o;
    if (!tail && (n.includes('tail') || n.includes('hips'))) tail = o;
  });
  if (!head) {
    head = new THREE.Object3D();
    head.name = 'head';
    head.position.set(0, 1.8, 0.3);
    root.add(head);
  }
  if (!tail) {
    tail = new THREE.Object3D();
    tail.name = 'tail';
    tail.position.set(0, 0.8, -0.5);
    root.add(tail);
  }

  // Animation state
  let currentAction = null;
  let currentName = '';
  // Active one-shot lock. While set, locomotion play() calls are deferred
  // (remembered in `wanted`) so attacks aren't cut off by the per-frame
  // walk/idle request. After `commit` seconds a *moving* clip may
  // interrupt (so the kaiju doesn't skate while finishing a long combo);
  // 'idle' never interrupts, it just waits for the clip to finish.
  let oneShot = null;   // { action, name, start, commit, onFinished }
  let wanted = 'idle';  // last locomotion clip requested during a one-shot

  function _clearOneShot() {
    if (!oneShot) return;
    mixer.removeEventListener('finished', oneShot.onFinished);
    oneShot = null;
  }

  function _start(action, name, fadeTime, timeScale) {
    if (currentAction && currentAction !== action) currentAction.fadeOut(fadeTime);
    action.reset();
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(fadeTime);
    action.play();
    currentAction = action;
    currentName = name;
  }

  function play(name, fadeTime = 0.25, timeScale = 1) {
    const action = actions[name];
    if (!action) return false;
    if (oneShot) {
      const elapsed = mixer.time - oneShot.start;
      if (name === 'idle' || elapsed < oneShot.commit) { wanted = name; return false; }
      _clearOneShot();
    }
    // Already the active target: never restart it (restarting every frame
    // was the source of the walk-turn stutter).
    if (currentName === name && currentAction === action) {
      if (action.getEffectiveTimeScale() !== timeScale) action.setEffectiveTimeScale(timeScale);
      return true;
    }
    _start(action, name, fadeTime, timeScale);
    return true;
  }

  // opts.duration: stretch/squash the clip to last this many seconds
  //   (overrides timeScale) so e.g. a 5.9 s jump matches 0.55 s of airtime.
  // opts.commit: seconds during which locomotion can't interrupt
  //   (default: the whole clip).
  // opts.hold: stay on the final frame afterwards (death).
  function playOnce(name, fadeTime = 0.15, timeScale = 1, opts = {}) {
    const action = actions[name];
    if (!action) return false;
    if (oneShot && oneShot.name === name && action.isRunning()) return true;
    const clipDur = action.getClip().duration || 1;
    if (opts.duration) timeScale = clipDur / opts.duration;
    const realDur = clipDur / Math.max(1e-3, timeScale);

    if (!oneShot) wanted = (currentName && !ONE_SHOT.has(currentName)) ? currentName : 'idle';
    _clearOneShot();
    _start(action, name, fadeTime, timeScale);

    const onFinished = (e) => {
      if (e.action !== action) return;
      if (opts.hold) {
        // Stay on the clamped last frame (death pose) and keep blocking
        // locomotion until something explicitly plays a new one-shot.
        mixer.removeEventListener('finished', onFinished);
        if (oneShot) oneShot.commit = Infinity;
        return;
      }
      _clearOneShot();
      play(wanted || 'idle', 0.3);
    };
    oneShot = {
      action, name, start: mixer.time,
      commit: Math.min(realDur, opts.commit !== undefined ? opts.commit : realDur),
      onFinished,
    };
    mixer.addEventListener('finished', onFinished);
    return true;
  }

  // Return to a clean idle state: used when game.js reuses a cached kaiju
  // for a new run (clears a held death pose / pending one-shot lock).
  function resetAnim() {
    _clearOneShot();
    wanted = 'idle';
    mixer.stopAllAction();
    mixer.timeScale = 1; // a death topple freezes the mixer
    currentAction = null;
    currentName = '';
    if (actions.idle) {
      actions.idle.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      currentAction = actions.idle;
      currentName = 'idle';
    }
  }

  // Start idle
  if (actions.idle) {
    actions.idle.play();
    currentAction = actions.idle;
    currentName = 'idle';
  }

  return {
    root, mixer, animations, actions, head, tail,
    play, playOnce, resetAnim,
    get currentName() { return currentName; },
    get oneShotActive() { return !!oneShot; },
  };
}
