import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cachedFetch, normalizeGLTFMaterials, withParseSlot, reportLoadError } from './assetCache.js';

/** Fetch a GLB via the asset cache, then parse it with GLTFLoader. */
function _cachedGLB(loader, url) {
  return cachedFetch(url).then((buf) => withParseSlot(() =>
    new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject))
  )).then((gltf) => { normalizeGLTFMaterials(gltf.scene); return gltf; });
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
const ONE_SHOT_KEYS = new Set([
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
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // GLBs are meshopt-compressed (tools/optimize_assets.mjs)
  const totalSteps = 1;

  if (onProgress) onProgress(0, totalSteps, 'Loading model');
  const gltf = await _cachedGLB(loader, file);
  const root = gltf.scene;
  root.name = 'kaiju';
  if (onProgress) onProgress(1, totalSteps, 'Model loaded');

  // Scale to match the game (the kaiju stand 29-39 u tall)
  root.scale.setScalar(KAIJU_SCALE);
  // The GLB is in its bind pose here (nothing has animated it yet): put the
  // hips over the root origin, then record the pose for the procedural
  // animation layer (src/wrestling/animRig.js)
  _recentre(root);
  const rest = _captureRest(root);
  _cleanClips(gltf.animations);
  _groundClips(root, gltf.animations, rest);

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
    if (!clip) { reportLoadError('KaijuLoader', file, new Error(`missing clip "${animFile}" for "${name}"`)); continue; }
    animations[name] = clip;
    actions[name] = mixer.clipAction(clip);
  }
  // 'run' always came from the base Running file
  if (!animations.run) {
    const clip = clipsByName.get('Animation_Running_withSkin');
    if (clip) { animations.run = clip; actions.run = mixer.clipAction(clip); }
  }

  // Configure one-shot vs looping
  const ONE_SHOT = new Set(ONE_SHOT_KEYS);   // per instance: addClip() registers more
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
  // Wrestling mode: the animation layer (src/wrestling/anims.js) picks every
  // looping clip itself. While locked, play() from anyone else is ignored and
  // a finished one-shot stays on its last frame until the layer moves on.
  let locoLocked = false;

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
    if (locoLocked) return false;
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
      if (locoLocked && !opts.hold) { _clearOneShot(); return; }
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

  /** Start a looping clip now, whatever is playing (one-shot locks and the
   *  locomotion lock included). For the wrestling animation layer.
   *  phase (0..1): where in the cycle to start; omit to start at 0. */
  function loop(name, fadeTime = 0.25, timeScale = 1, phase) {
    const action = actions[name];
    if (!action) return false;
    _clearOneShot();
    if (currentName === name && currentAction === action && action.isRunning()) {
      if (action.getEffectiveTimeScale() !== timeScale) action.setEffectiveTimeScale(timeScale);
      return true;
    }
    _start(action, name, fadeTime, timeScale);
    if (phase !== undefined) action.time = phase * action.getClip().duration;
    return true;
  }

  /** Register a clip built in code under a game key (same rules as the
   *  tables above: oneShot keys play once and clamp). Returns its action. */
  function addClip(name, clip, isOneShot) {
    const action = mixer.clipAction(clip);
    animations[name] = clip;
    actions[name] = action;
    if (isOneShot) {
      ONE_SHOT.add(name);
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat);
    }
    return action;
  }

  // Return to a clean idle state: used when game.js reuses a cached kaiju
  // for a new run (clears a held death pose / pending one-shot lock).
  function resetAnim() {
    _clearOneShot();
    locoLocked = false;
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
    key: monsterKey, rest, loop, addClip,
    lockLoco(on) { locoLocked = !!on; },
    get currentName() { return currentName; },
    get currentAction() { return currentAction; },
    get oneShotActive() { return !!oneShot; },
  };
}

export const KAIJU_SCALE = 18;

// The Meshy rigs put the scene origin at the mesh's bounding-box centre. For
// Tridon and Mechra that is 8-10 u behind the feet (their tails are long), so
// they turned around a point in their tail and stood off-centre in every
// distance test. Shift the armature so the hips sit over the root origin.
function _recentre(root) {
  const arm = root.getObjectByName('Armature'), hips = root.getObjectByName('Hips');
  if (!arm || !hips) return;
  root.updateMatrixWorld(true);
  const p = hips.getWorldPosition(new THREE.Vector3());
  root.worldToLocal(p);
  arm.position.x -= p.x;
  arm.position.z -= p.z;
  root.updateMatrixWorld(true);
}

/** The bind pose, per skeleton bone, in "rig space" (root-local x KAIJU_SCALE:
 *  world units with the root at the origin facing +Z):
 *  { mesh, bones, names, parent (index, -1 = armature), lp / lq (local rest
 *    position / quaternion), wp / wq (rig-space position / orientation),
 *    index: { name -> i }, unit (rig units per bone-local unit), origin
 *    (rig-space position of the armature origin) }. */
function _captureRest(root) {
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  root.updateMatrixWorld(true);
  const bones = mesh.skeleton.bones;
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4(), s = new THREE.Vector3();
  const rest = { mesh, bones, names: [], parent: [], lp: [], lq: [], wp: [], wq: [], index: {}, unit: 1, origin: new THREE.Vector3() };
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    rest.names.push(b.name);
    rest.index[b.name] = i;
    rest.parent.push(bones.indexOf(b.parent));
    rest.lp.push(b.position.clone());
    rest.lq.push(b.quaternion.clone());
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    m.multiplyMatrices(inv, b.matrixWorld).decompose(wp, wq, s);
    rest.wp.push(wp.multiplyScalar(KAIJU_SCALE));
    rest.wq.push(wq);
  }
  const arm = bones[0].parent;
  if (arm) {
    m.multiplyMatrices(inv, arm.matrixWorld).decompose(rest.origin, new THREE.Quaternion(), s);
    rest.origin.multiplyScalar(KAIJU_SCALE);
    rest.unit = s.y * KAIJU_SCALE;
  }
  return rest;
}

// Every clip ships 24 position and 24 scale tracks next to the rotations. All
// the scales are 1 and every position but the hips' is the bind value
// (measured on the three rigs), so two thirds of each action's interpolants
// did nothing. Keep the rotations and the hips translation.
function _cleanClips(clips) {
  for (const clip of clips) {
    clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'Hips.position');
  }
}

// The retargeted clips push the feet through the ground on Tridon and Mechra
// (up to 0.15 body heights in the runs). Sample each clip once and raise the
// hips, key by key, by however far the lower foot is under its bind height.
// Never lowers anything, so jumps and steps keep their air.
const SOLE_BONES = ['LeftFoot', 'LeftToeBase', 'LeftLeg', 'RightFoot', 'RightToeBase', 'RightLeg'];
function _groundClips(root, clips, rest) {
  if (!rest) return;
  // Probes: the sole vertices of each foot (the lowest 0.6 u of whichever leg
  // bones reach the ground), in the local space of the bone that carries them
  const probes = [];
  {
    const g = rest.mesh.geometry, P = g.attributes.position, J = g.attributes.skinIndex, Wt = g.attributes.skinWeight;
    const per = new Map();
    for (let i = 0; i < P.count; i++) {
      let k = 0;
      for (let c = 1; c < 4; c++) if (Wt.getComponent(i, c) > Wt.getComponent(i, k)) k = c;
      const bi = J.getComponent(i, k);
      if (!SOLE_BONES.includes(rest.names[bi])) continue;
      if (!per.has(bi)) per.set(bi, { min: Infinity, list: [] });
      const e = per.get(bi), y = P.getY(i) * KAIJU_SCALE;
      e.min = Math.min(e.min, y);
      e.list.push(i);
    }
    const v = new THREE.Vector3();
    for (const [bi, e] of per) {
      if (e.min > 3) continue;
      const low = e.list.filter((i) => P.getY(i) * KAIJU_SCALE < e.min + 0.6);
      const step = Math.max(1, Math.floor(low.length / 12));
      for (let n = 0; n < low.length; n += step) {
        rest.mesh.getVertexPosition(low[n], v).applyMatrix4(rest.mesh.matrixWorld);   // skinned (bind) world position
        const y0 = v.y;
        probes.push({ bone: rest.bones[bi], p: rest.bones[bi].worldToLocal(v.clone()), y0 });
      }
    }
  }
  const hips = rest.bones[rest.index.Hips];
  if (!probes.length || !hips) return;
  const mixer = new THREE.AnimationMixer(root);
  const v = new THREE.Vector3();
  for (const clip of clips) {
    const track = clip.tracks.find((t) => t.name === 'Hips.position');
    if (!track) continue;
    const action = mixer.clipAction(clip);
    action.play();
    const n = track.times.length, lift = new Float32Array(n);
    let any = false;
    for (let k = 0; k < n; k++) {
      mixer.setTime(Math.min(track.times[k], clip.duration - 1e-4));
      hips.updateWorldMatrix(true, true);
      let low = 0;
      for (const p of probes) low = Math.min(low, v.copy(p.p).applyMatrix4(p.bone.matrixWorld).y - p.y0);
      lift[k] = -low;
      if (low < -0.05) any = true;
    }
    action.stop();
    mixer.uncacheAction(clip);
    if (!any) continue;
    // Soften the correction (a per-key clamp alone makes the hips judder)
    const out = track.values;
    for (let k = 0; k < n; k++) {
      const a = lift[Math.max(0, k - 1)], b = lift[k], c = lift[Math.min(n - 1, k + 1)];
      out[k * 3 + 1] += Math.max(b, (a + 2 * b + c) / 4) / rest.unit;
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  // Back to the bind pose the caller captured
  for (let i = 0; i < rest.bones.length; i++) { rest.bones[i].position.copy(rest.lp[i]); rest.bones[i].quaternion.copy(rest.lq[i]); }
  root.updateMatrixWorld(true);
}
