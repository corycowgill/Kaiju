import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cachedFetch } from '../assetCache.js';

const BASE = './assets/enemies/festival/';
let templates, atlas, clips, loading;
const FPS = 30;

async function loadGLB(file) {
  const bytes = await cachedFetch(BASE + file);
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes, BASE, resolve, reject));
}

/** Bake once, not once per person: all variants use the same canonical rig. */
export function bakeCrowdAnimations(gltf) {
  let mesh;
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) throw new Error('Festival animation library has no skeleton');
  const skeleton = mesh.skeleton, mixer = new THREE.AnimationMixer(gltf.scene);
  const metadata = {};
  let rows = 0;
  for (const clip of gltf.animations) {
    const frames = Math.max(2, Math.ceil(clip.duration * FPS) + 1);
    metadata[clip.name] = { start: rows, frames, duration: clip.duration };
    rows += frames;
  }
  const data = new Float32Array(rows * skeleton.bones.length * 16);
  const root = skeleton.bones.find(b => /Hips$/.test(b.name));
  // Bind-space hip position. Strip planar root motion; navigation owns travel.
  const rootIndex = skeleton.bones.indexOf(root);
  const rest = skeleton.boneInverses[rootIndex].clone().invert();
  const restPosition = new THREE.Vector3().setFromMatrixPosition(rest);
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    const info = metadata[clip.name];
    for (let frame = 0; frame < info.frames; frame++) {
      mixer.setTime(frame / (info.frames - 1) * clip.duration);
      root.position.x = restPosition.x; root.position.z = restPosition.z;
      gltf.scene.updateMatrixWorld(true); skeleton.update();
      data.set(skeleton.boneMatrices, (info.start + frame) * skeleton.bones.length * 16);
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  const texture = new THREE.DataTexture(data, skeleton.bones.length * 4, rows,
    THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return { texture, clips: metadata, bones: skeleton.bones.length };
}

export async function loadFestivalPeople() {
  if (templates) return;
  if (!loading) loading = (async () => {
    const library = await loadGLB('animations.glb');
    const baked = bakeCrowdAnimations(library);
    atlas = baked.texture; clips = baked.clips;
    const loaded = await Promise.all(Array.from({ length: 9 }, async (_, i) => {
      const id = `person_${String(i + 1).padStart(2, '0')}`;
      const pair = await Promise.all(['near', 'far', 'distant'].map(lod => loadGLB(`${id}_${lod}.glb`)));
      const result = pair.map(gltf => {
        let mesh; gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
        if (!mesh || mesh.skeleton.bones.length !== baked.bones) throw new Error(`Invalid festival rig: ${id}`);
        mesh.geometry.userData.shared = true;
        mesh.material.map.anisotropy = 4;
        mesh.skeleton.dispose();
        return { geometry: mesh.geometry, material: mesh.material };
      });
      for (let lod = 1; lod < result.length; lod++) {
        result[lod].material.map.dispose();
        result[lod].material.map = result[0].material.map;
      }
      return result;
    }));
    templates = loaded;
    library.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.skeleton) o.skeleton.dispose(); });
  })().catch(error => { loading = null; throw error; });
  return loading;
}

function animatedMaterial(source, time) {
  const material = source.clone();
  material.name = 'festival_shared_rig';
  material.onBeforeCompile = shader => {
    shader.uniforms.crowdTime = time;
    shader.uniforms.crowdBones = { value: atlas };
    shader.uniforms.crowdAtlasSize = { value: new THREE.Vector2(atlas.image.width, atlas.image.height) };
    const clipUniform = (uniform, name) => {
      const c = clips[name]; shader.uniforms[uniform] = { value: new THREE.Vector3(c.start, c.frames, c.duration) };
    };
    clipUniform('danceA', 'All_Night_Dance'); clipUniform('danceB', 'You_Groove');
    clipUniform('walkClip', 'Walking'); clipUniform('runClip', 'Running');
    clipUniform('sprintClip', 'RunFast'); clipUniform('deathClip', 'Dead');
    shader.vertexShader = `
      uniform float crowdTime;
      uniform highp sampler2D crowdBones;
      uniform vec2 crowdAtlasSize;
      uniform vec3 danceA, danceB, walkClip, runClip, sprintClip, deathClip;
      attribute vec4 skinIndex, skinWeight;
      attribute vec3 crowdMotion;
      attribute float crowdDeath;
      mat4 boneAt(float bone, float row) {
        float x = bone * 4.0;
        vec2 p = vec2(x+.5,row+.5);
        return mat4(texture2D(crowdBones,p/crowdAtlasSize),texture2D(crowdBones,(p+vec2(1,0))/crowdAtlasSize),
          texture2D(crowdBones,(p+vec2(2,0))/crowdAtlasSize),texture2D(crowdBones,(p+vec2(3,0))/crowdAtlasSize));
      }
      mat4 skinAt(float row) {
        return boneAt(skinIndex.x,row)*skinWeight.x + boneAt(skinIndex.y,row)*skinWeight.y +
          boneAt(skinIndex.z,row)*skinWeight.z + boneAt(skinIndex.w,row)*skinWeight.w;
      }
      mat4 clipPose(vec3 clip, float t, bool looped) {
        float progress = looped ? fract(t/clip.z) : clamp(t/clip.z,0.0,1.0);
        float frame = progress*(clip.y-1.0);
        return skinAt(clip.x+floor(frame))*(1.0-fract(frame)) + skinAt(clip.x+min(ceil(frame),clip.y-1.0))*fract(frame);
      }
      mat4 personPose() {
        if(crowdDeath >= 0.0) return clipPose(deathClip,max(0.0,crowdTime-crowdDeath),false);
        float t = crowdTime + crowdMotion.x;
        vec3 dance = fract(crowdMotion.x*.73)>.5 ? danceA : danceB;
        vec3 run = fract(crowdMotion.x*.47)>.6 ? sprintClip : runClip;
        mat4 rest = clipPose(dance,t,true);
        mat4 walk = clipPose(walkClip,t,true);
        float runBlend = smoothstep(.2,1.0,crowdMotion.y);
        mat4 travel = walk*(1.0-runBlend) + clipPose(run,t,true)*runBlend;
        float blend = smoothstep(0.0,.2,crowdMotion.y);
        return rest*(1.0-blend) + travel*blend;
      }
    ` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        mat4 festivalPose = personPose();
        vec3 skinnedNormal = mat3(festivalPose)*objectNormal;
        float normalLength2 = dot(skinnedNormal,skinnedNormal);
        objectNormal = normalLength2 > 1e-8 ? skinnedNormal*inversesqrt(max(normalLength2,1e-8)) : vec3(0.0,1.0,0.0);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = (festivalPose * vec4(position,1.0)).xyz;');
    // Zero/interpolated opposing normals must not introduce NaNs into the HDR
    // buffer: bloom spreads one invalid lighting pixel over the entire screen.
    const normalChunk = THREE.ShaderChunk.normal_fragment_begin.replace('vec3 normal = normalize( vNormal );',
      'vec3 normal = dot(vNormal,vNormal)>1e-8 ? vNormal*inversesqrt(max(dot(vNormal,vNormal),1e-8)) : vec3(0.0,0.0,1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', normalChunk)
      .replace('#include <opaque_fragment>', `
        #if __VERSION__ >= 300
          if(any(isnan(outgoingLight)) || any(isinf(outgoingLight))) outgoingLight = diffuseColor.rgb*.5;
        #else
          outgoingLight.r = outgoingLight.r>=0.0 && outgoingLight.r<65504.0 ? outgoingLight.r : 0.0;
          outgoingLight.g = outgoingLight.g>=0.0 && outgoingLight.g<65504.0 ? outgoingLight.g : 0.0;
          outgoingLight.b = outgoingLight.b>=0.0 && outgoingLight.b<65504.0 ? outgoingLight.b : 0.0;
        #endif
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'festival-shared-skeleton-safe-normals-v2';
  return material;
}

/** Logical instances retain stable IDs for steering/hits. Visible instances are
 * compacted into 27 model/LOD batches, with no per-attendee Object3D or mixer. */
export function createFestivalPeople(count, time) {
  if (!templates) return null;
  const group = new THREE.Group(); group.name = 'Chicago rigged festival crowd';
  const transforms = new Float32Array(count * 16);
  group.geometry = new THREE.BufferGeometry();
  group.instanceMatrix = new THREE.InstancedBufferAttribute(transforms, 16);
  group.setMatrixAt = (i, matrix) => matrix.toArray(transforms, i * 16);
  group.getMatrixAt = (i, matrix) => matrix.fromArray(transforms, i * 16);
  group.setColorAt = () => {}; // Authored clothing/skin textures keep their colors.
  group.computeBoundingSphere = () => {};
  const deaths = new Float32Array(count).fill(-1);
  const lodState = new Uint8Array(count).fill(2);
  group.kill = i => { deaths[i] = time.value; };
  const capacity = Math.ceil(count / templates.length), buckets = [];
  for (const pair of templates) {
    buckets.push(pair.map(template => {
      const geometry = template.geometry.clone();
      geometry.userData = {}; // Per-run clone: teardown must free its instance attributes.
      const motion = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      const death = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(-1), 1);
      motion.setUsage(THREE.DynamicDrawUsage); death.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('crowdMotion', motion); geometry.setAttribute('crowdDeath', death);
      const mesh = new THREE.InstancedMesh(geometry, animatedMaterial(template.material, time), capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.name = 'festival_GLB';
      group.add(mesh); return mesh;
    }));
  }
  const matrix = new THREE.Matrix4();
  group.sync = viewpoint => {
    const motion = group.geometry.getAttribute('crowdMotion');
    if (!motion) return;
    for (const pair of buckets) for (const mesh of pair) mesh.count = 0;
    let closeCount = 0;
    for (let i = 0; i < count; i++) {
      const at = i * 16;
      if (transforms[at] === 0 && transforms[at+5] === 0) continue; // escaped
      const dx = transforms[at+12] - (viewpoint?.x || 0), dz = transforms[at+14] - (viewpoint?.z || 0);
      const d2 = dx*dx + dz*dz;
      if (viewpoint && d2 > 230*230) continue;
      // Hysteresis prevents detail/texture popping as camera bob crosses a boundary.
      const nearRadius = lodState[i] === 0 ? 27 : 22;
      const near = d2 < nearRadius*nearRadius && closeCount < (count > 2000 ? 144 : 64);
      if (near) closeCount++;
      const midRadius = lodState[i] === 1 ? 72 : 60;
      const lod = near ? 0 : d2 < midRadius*midRadius ? 1 : 2;
      lodState[i] = lod;
      const mesh = buckets[i % buckets.length][lod], slot = mesh.count++;
      matrix.fromArray(transforms, at); mesh.setMatrixAt(slot,matrix);
      mesh.geometry.attributes.crowdMotion.setXYZ(slot,motion.getX(i),motion.getY(i),motion.getZ(i));
      mesh.geometry.attributes.crowdDeath.setX(slot,deaths[i]);
    }
    for (const pair of buckets) for (const mesh of pair) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.crowdMotion.needsUpdate = true;
      mesh.geometry.attributes.crowdDeath.needsUpdate = true;
    }
  };
  group.userData.festivalPeople = true;
  group.addEventListener('removed', () => {
    for (const pair of buckets) for (const mesh of pair) mesh.material.dispose();
  });
  return group;
}

export function festivalPeopleStats() {
  return { variants: templates?.length || 0, clips: Object.keys(clips || {}),
    atlasBytes: atlas?.image.data.byteLength || 0 };
}
