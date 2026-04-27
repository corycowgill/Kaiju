import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_BASE = './assets/kaiju_model/Meshy_AI_I_want_to_create_a_Ka_biped/Meshy_AI_I_want_to_create_a_Ka_biped_';

// Animation file suffixes mapped to logical action names
const ANIM_FILES = {
  idle:       'Animation_Walking_withSkin.glb',   // use walking as idle (slow blend)
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
};

/**
 * Loads the Kaiju GLB model and all animation clips.
 * Returns { root, mixer, animations, head, tail, play }
 */
export async function loadKaijuModel() {
  const loader = new GLTFLoader();

  // Load the base model (use the Running file as it has the full skinned mesh)
  const baseGltf = await loader.loadAsync(MODEL_BASE + 'Animation_Running_withSkin.glb');
  const root = baseGltf.scene;
  root.name = 'kaiju';

  // Scale and orient the model to match the game's coordinate system
  // Meshy models are typically much smaller - scale up to match procedural kaiju (~15 units tall)
  root.scale.setScalar(8);

  // Enable shadows on all meshes
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Create animation mixer
  const mixer = new THREE.AnimationMixer(root);

  // Store all loaded animation clips by name
  const animations = {};
  const actions = {};

  // Load the base animation from the initial file
  if (baseGltf.animations.length > 0) {
    animations.run = baseGltf.animations[0];
    actions.run = mixer.clipAction(animations.run);
  }

  // Load all other animation files
  const loadPromises = Object.entries(ANIM_FILES).map(async ([name, file]) => {
    if (name === 'run') return; // already loaded
    try {
      const gltf = await loader.loadAsync(MODEL_BASE + file);
      if (gltf.animations.length > 0) {
        animations[name] = gltf.animations[0];
        actions[name] = mixer.clipAction(gltf.animations[0]);
      }
    } catch (e) {
      console.warn(`[KaijuLoader] Failed to load animation "${name}":`, e.message);
    }
  });

  await Promise.all(loadPromises);

  // Configure action defaults
  for (const [name, action] of Object.entries(actions)) {
    if (['skill1', 'skill2', 'stomp', 'stomp2', 'jump'].includes(name)) {
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat);
    }
  }

  // Find head bone for beam origin (search common bone names)
  let head = null;
  let tail = null;
  root.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (!head && (n.includes('head') || n.includes('skull'))) head = o;
    if (!tail && (n.includes('tail') || n.includes('hips'))) tail = o;
  });
  // Fallback: create dummy nodes at expected positions if bones not found
  if (!head) {
    head = new THREE.Object3D();
    head.name = 'head';
    head.position.set(0, 1.8, 0.3); // relative to scaled model
    root.add(head);
  }
  if (!tail) {
    tail = new THREE.Object3D();
    tail.name = 'tail';
    tail.position.set(0, 0.8, -0.5);
    root.add(tail);
  }

  // Active animation state
  let currentAction = null;
  let currentName = '';

  /**
   * Crossfade to a named animation.
   * @param {string} name - animation key from ANIM_FILES
   * @param {number} fadeTime - crossfade duration in seconds
   * @param {number} [timeScale=1] - playback speed
   */
  function play(name, fadeTime = 0.25, timeScale = 1) {
    const action = actions[name];
    if (!action) return;
    if (currentName === name && currentAction?.isRunning()) return;

    if (currentAction) {
      currentAction.fadeOut(fadeTime);
    }

    action.reset();
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(fadeTime);
    action.play();

    currentAction = action;
    currentName = name;
  }

  /**
   * Play a one-shot animation (skill/stomp) then return to previous.
   */
  function playOnce(name, fadeTime = 0.15, timeScale = 1) {
    const action = actions[name];
    if (!action) return;
    // Don't re-trigger if this one-shot is already playing
    if (currentName === name && currentAction?.isRunning()) return;

    const prevName = currentName;
    if (currentAction) {
      currentAction.fadeOut(fadeTime);
    }

    action.reset();
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.fadeIn(fadeTime);
    action.play();

    currentAction = action;
    currentName = name;

    // When done, return to previous animation
    const onFinished = (e) => {
      if (e.action === action) {
        mixer.removeEventListener('finished', onFinished);
        play(prevName, 0.3);
      }
    };
    mixer.addEventListener('finished', onFinished);
  }

  // Start with idle
  if (actions.idle) {
    actions.idle.play();
    currentAction = actions.idle;
    currentName = 'idle';
  } else if (actions.walk) {
    actions.walk.setEffectiveTimeScale(0.5);
    actions.walk.play();
    currentAction = actions.walk;
    currentName = 'walk';
  }

  return {
    root,
    mixer,
    animations,
    actions,
    head,
    tail,
    play,
    playOnce,
    get currentName() { return currentName; },
  };
}
