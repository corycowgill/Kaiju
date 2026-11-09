import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const base = new URL('../assets/enemies/festival/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base)));
function read(file) {
  const b = fs.readFileSync(new URL(file, base));
  const length = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + length)), bin: b.subarray(28 + length), bytes: b };
}
function floats(glb, index) {
  const a = glb.json.accessors[index], view = glb.json.bufferViews[a.bufferView];
  const bytes = glb.bin.subarray((view.byteOffset || 0) + (a.byteOffset || 0));
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + view.byteLength));
}

test('nine distinct crowd models have normalized reference skins, shared textures and bounded LODs', () => {
  assert.equal(manifest.models.length, 9);
  const library = read('animations.glb');
  assert.equal(library.json.animations.length, 9);
  const referenceSkin = library.json.skins[0];
  let shippedBytes = fs.statSync(new URL('animations.glb', base)).size;
  for (const model of manifest.models) {
    assert.equal(model.lods.length, 3);
    for (const lod of model.lods) {
      const glb = read(lod.file), g = glb.json;
      shippedBytes += glb.bytes.length;
      assert.equal(g.animations, undefined, `${lod.file} must not duplicate animation tracks`);
      assert.ok(lod.triangles <= ({ near: 3700, far: 1000, distant: 310 }[lod.lod]), `${lod.file}: ${lod.triangles} triangles`);
      assert.deepEqual(g.skins[0].joints, referenceSkin.joints);
      assert.deepEqual(floats(glb, g.skins[0].inverseBindMatrices), floats(library, referenceSkin.inverseBindMatrices));
      const primitive = g.meshes[0].primitives[0];
      const jointAccessor = g.accessors[primitive.attributes.JOINTS_0];
      const jointView = g.bufferViews[jointAccessor.bufferView];
      const jointBytes = glb.bin.subarray(jointView.byteOffset || 0, (jointView.byteOffset || 0) + jointView.byteLength);
      const joints = new Uint16Array(jointBytes.buffer.slice(jointBytes.byteOffset,jointBytes.byteOffset+jointBytes.byteLength));
      assert.ok(joints.every(j => j < manifest.boneCount), `${lod.file}: out-of-range bone index`);
      const normals = floats(glb, primitive.attributes.NORMAL);
      for (let i = 0; i < normals.length; i += 3) {
        const length = Math.hypot(normals[i],normals[i+1],normals[i+2]);
        assert.ok(Number.isFinite(length) && length > .9 && length < 1.1,
          `${lod.file}: invalid normal can poison the HDR bloom buffer`);
      }
      const weights = floats(glb, primitive.attributes.WEIGHTS_0);
      for (let i = 0; i < weights.length; i += 4) {
        const sum = weights[i] + weights[i+1] + weights[i+2] + weights[i+3];
        assert.ok(Math.abs(sum - 1) < 1e-5, `${lod.file}: unnormalized skin weights`);
      }
      const image = g.images[0];
      assert.equal(image.uri.split('?')[0], `${model.id}.jpg`);
      assert.match(image.uri, /\?v=[a-f0-9]{10}$/);
      assert.ok(fs.statSync(new URL(image.uri.split('?')[0], base)).size < 400_000);
      assert.equal(g.materials[0].pbrMetallicRoughness.metallicFactor, 0);
    }
    shippedBytes += fs.statSync(new URL(`${model.id}.jpg`, base)).size;
  }
  assert.ok(shippedBytes < 10_000_000, `Crowd download grew to ${shippedBytes} bytes`);
});

test('one GPU animation library bakes all clips with finite, moving bones and no planar root drift', async () => {
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  globalThis.location = { search: '' };
  globalThis.localStorage = { getItem: () => null };
  const { bakeCrowdAnimations } = await import('../src/levels/festivalPeople.js');
  const raw = read('animations.glb').bytes;
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '', resolve, reject));
  const baked = bakeCrowdAnimations(gltf), data = baked.texture.image.data;
  assert.equal(baked.bones, 66);
  assert.equal(Object.keys(baked.clips).length, 9);
  assert.ok(data.every(Number.isFinite));
  assert.ok(data.byteLength < 7_000_000);
  for (const name of ['Running', 'Walking', 'All_Night_Dance', 'You_Groove', 'Dead']) {
    const c = baked.clips[name], stride = 66 * 16;
    const first = data.subarray(c.start*stride, (c.start+1)*stride);
    const middle = data.subarray((c.start+Math.floor(c.frames/2))*stride, (c.start+Math.floor(c.frames/2)+1)*stride);
    assert.ok(first.some((value, i) => Math.abs(value-middle[i]) > .01), `${name} frozen`);
  }
  baked.texture.dispose();
});
