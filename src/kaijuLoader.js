import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- Godzilla (lizard kaiju) ----
const GODZILLA_BASE = './assets/kaiju_model/Meshy_AI_I_want_to_create_a_Ka_biped/Meshy_AI_I_want_to_create_a_Ka_biped_';
const GODZILLA_ANIMS = {
  idle:       'Animation_Alert_withSkin.glb',
  walk:       'Animation_Walking_withSkin.glb',
  run:        'Animation_Running_withSkin.glb',
  sprint:     'Animation_Run_02_withSkin.glb',
  turnLeft:   'Animation_Run_Turn_Left_withSkin.glb',
  turnRight:  'Animation_Run_Turn_Right_withSkin.glb',
  walkTurnL:  'Animation_Walk_Turn_Left_withSkin.glb',
  walkTurnR:  'Animation_Walk_Turn_Right_withSkin.glb',
  skill1:     'Animation_Skill_01_withSkin.glb',
  skill2:     'Animation_Skill_02_withSkin.glb',
  stomp:      'Animation_Angry_Ground_Stomp_withSkin.glb',
  stomp2:     'Animation_Angry_Ground_Stomp_2_withSkin.glb',
  jump:       'Animation_Basic_Jump_withSkin.glb',
  death:      'Animation_Shot_and_Blown_Back_withSkin.glb',
  dance:      'Animation_You_Groove_withSkin.glb',
  punch:      'Animation_Punch_Combo_1_withSkin.glb',
  tantrum:    'Animation_Angry_To_Tantrum_Sit_withSkin.glb',
  flex:       'Animation_Show_Both_Arm_Muscles_withSkin.glb',
  agree:      'Animation_Agree_Gesture_withSkin.glb',
};

// ---- Ghidorah (three-headed dragon kaiju) ----
const GHIDORAH_BASE = './assets/ghidorah_model/Meshy_AI_I_want_to_create_a_Ka_biped/Meshy_AI_I_want_to_create_a_Ka_biped_';
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
const MECHA_BASE = './assets/mecha_model/Meshy_AI_I_want_to_create_a_Ro_biped/Meshy_AI_I_want_to_create_a_Ro_biped_';
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
  'death', 'punch', 'tantrum', 'flex', 'agree', 'cheer',
  'cast1', 'cast2', 'cast3', 'shrug',
]);

// Model configs by monster key
const MODEL_CONFIGS = {
  godzilla: { base: GODZILLA_BASE, anims: GODZILLA_ANIMS },
  ghidorah: { base: GHIDORAH_BASE, anims: GHIDORAH_ANIMS },
  mecha:    { base: MECHA_BASE,    anims: MECHA_ANIMS },
};

// De-duplicate files so we don't load the same GLB twice
function getUniqueFiles(animFiles) {
  const seen = new Map();
  for (const [name, file] of Object.entries(animFiles)) {
    if (seen.has(file)) seen.get(file).push(name);
    else seen.set(file, [name]);
  }
  return seen;
}

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

  const { base, anims } = config;
  const loader = new GLTFLoader();
  const uniqueFiles = getUniqueFiles(anims);
  const totalSteps = uniqueFiles.size + 1;
  let loaded = 0;

  function report(label) {
    loaded++;
    if (onProgress) onProgress(loaded, totalSteps, label);
  }

  // Load the base model (use the Running file — full skinned mesh)
  if (onProgress) onProgress(0, totalSteps, 'Loading base model');
  const baseGltf = await loader.loadAsync(base + 'Animation_Running_withSkin.glb');
  const root = baseGltf.scene;
  root.name = 'kaiju';
  report('Base model loaded');

  // Scale to match the game (~15 units tall)
  root.scale.setScalar(32);

  // Enable shadows
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Animation mixer
  const mixer = new THREE.AnimationMixer(root);
  const animations = {};
  const actions = {};

  // The base file already has the 'run' animation baked in
  if (baseGltf.animations.length > 0) {
    animations.run = baseGltf.animations[0];
    actions.run = mixer.clipAction(animations.run);
  }

  // Load remaining animation files (de-duplicated)
  for (const [file, names] of uniqueFiles) {
    if (file === 'Animation_Running_withSkin.glb') {
      report('Running animation');
      continue;
    }
    try {
      const gltf = await loader.loadAsync(base + file);
      if (gltf.animations.length > 0) {
        const clip = gltf.animations[0];
        for (const name of names) {
          animations[name] = clip;
          actions[name] = mixer.clipAction(clip);
        }
      }
    } catch (e) {
      console.warn(`[KaijuLoader] Failed to load "${file}":`, e.message);
    }
    report(names[0] + ' animation');
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

  function play(name, fadeTime = 0.25, timeScale = 1) {
    const action = actions[name];
    if (!action) return;
    if (currentName === name && currentAction?.isRunning()) return;

    if (currentAction) currentAction.fadeOut(fadeTime);

    action.reset();
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(fadeTime);
    action.play();

    currentAction = action;
    currentName = name;
  }

  function playOnce(name, fadeTime = 0.15, timeScale = 1) {
    const action = actions[name];
    if (!action) return;
    if (currentName === name && currentAction?.isRunning()) return;

    const prevName = currentName;
    if (currentAction) currentAction.fadeOut(fadeTime);

    action.reset();
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(fadeTime);
    action.play();

    currentAction = action;
    currentName = name;

    const onFinished = (e) => {
      if (e.action === action) {
        mixer.removeEventListener('finished', onFinished);
        play(prevName, 0.3);
      }
    };
    mixer.addEventListener('finished', onFinished);
  }

  // Start idle
  if (actions.idle) {
    actions.idle.play();
    currentAction = actions.idle;
    currentName = 'idle';
  }

  return {
    root, mixer, animations, actions, head, tail,
    play, playOnce,
    get currentName() { return currentName; },
  };
}
