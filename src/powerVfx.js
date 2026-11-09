// Power art direction: thin directional energy, textured matter, short hot
// flashes and long cool aftermath. No full-screen additive shells or domes.
import * as THREE from 'three';
import { isMobile, QUALITY_PROFILE } from './quality.js';

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const count = n => Math.max(4, Math.round(n * Math.max(.3, QUALITY_PROFILE.particleMul)));

class PowerEffect {
  constructor(world, group, life, animate) {
    this.mesh = group; this.life = this.maxLife = life; this.dead = false;
    this.animate = animate; world.scene.add(group); animate(0, 0);
  }
  tick(dt) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true; this.mesh.removeFromParent();
      const geometries = new Set(), materials = new Set();
      this.mesh.traverse(o => {
        if (o.geometry) geometries.add(o.geometry);
        for (const m of [].concat(o.material || [])) materials.add(m);
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose(); // atlas textures belong to the cache
      return;
    }
    this.animate(this.maxLife - this.life, dt);
  }
}

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
float fbm(vec2 p) { return noise(p)*.57 + noise(p*2.07+3.1)*.28 + noise(p*4.13)*.15; }
`;
const PUFF_VS = `
attribute vec3 center; attribute vec4 shape; attribute vec2 state;
attribute vec3 tint;
varying vec2 vUv; varying vec2 vState; varying vec3 vTint; varying float vNear;
#include <fog_pars_vertex>
void main() {
 vUv=uv; vState=state; vTint=tint;
 vec4 mvPosition=modelViewMatrix*vec4(center,1.0);
 float c=cos(shape.z), s=sin(shape.z);
 vec2 p=position.xy*shape.xy*length(modelMatrix[0].xyz);
 // Fade cards near the chase camera and cap their angular size.
 float lim=min(1.0,max(0.0,-mvPosition.z)*.65/max(shape.x,shape.y));
 mvPosition.xy+=mat2(c,s,-s,c)*p*lim;
 vNear=smoothstep(2.0,9.0,-mvPosition.z)*shape.w;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const PUFF_FS = `
uniform sampler2D sheet; uniform float hasSheet; uniform float hot;
varying vec2 vUv; varying vec2 vState; varying vec3 vTint; varying float vNear;
#include <fog_pars_fragment>
${NOISE}
vec4 frame(float f) {
 return texture2D(sheet,(vec2(mod(f,8.0),floor(f/8.0))+vec2(vUv.x,1.0-vUv.y))/8.0);
}
void main() {
 vec2 p=vUv*2.0-1.0;
 float n=fbm(p*3.2+vec2(vState.y,vState.x*.025));
 float soft=1.0-smoothstep(.24,.98,length(p)+(.5-n)*.55);
 vec3 rgb=vTint*(.62+.55*n+.22*vUv.y);
 float alpha=soft*(.45+.55*n);
 if(hasSheet>.5) {
   float f=min(62.9,vState.x);
   vec4 tex=mix(frame(floor(f)),frame(min(63.0,floor(f)+1.0)),fract(f));
   rgb=tex.rgb*vTint; alpha=tex.a*soft;
 }
 if(hot>.5) {
   alpha=pow(max(0.0,1.0-dot(p,p)),2.0);
   rgb=mix(vTint,vec3(1.7,1.5,1.1),pow(alpha,4.0));
 }
 gl_FragColor=vec4(rgb,alpha*vNear);
 if(gl_FragColor.a<.004) discard;
 #include <fog_fragment>
}`;

// Every puff in a layer is one instanced draw, with per-puff atlas frame,
// rotation and opacity. A procedural wispy mask also works before load ends.
function puffs(group, n, getTexture, { sheet = 'smoke_plume_8x8', hot = false, color = 0xffffff } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry().copy(base); base.dispose();
  const attr = (name, size) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a;
  };
  const center = attr('center', 3), shape = attr('shape', 4), state = attr('state', 2), tint = attr('tint', 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) tint.setXYZ(i, c.r, c.g, c.b);
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      sheet: { value: getTexture(sheet) || null }, hasSheet: { value: getTexture(sheet) ? 1 : 0 }, hot: { value: +hot },
    }]), vertexShader: PUFF_VS, fragmentShader: PUFF_FS,
    transparent: true, depthWrite: false, fog: true,
    blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = hot ? 'power_embers' : 'power_textured_matter'; group.add(mesh);
  return {
    n, mesh,
    set(i, x, y, z, w, h, rotation, opacity, frame = 0) {
      center.setXYZ(i, x, y, z); shape.setXYZW(i, w, h, rotation, clamp(opacity)); state.setXY(i, frame, i * 2.31);
    },
    flush() {
      const tex = getTexture(sheet);
      mat.uniforms.sheet.value = tex || null; mat.uniforms.hasSheet.value = tex ? 1 : 0;
      center.needsUpdate = shape.needsUpdate = state.needsUpdate = true;
    },
  };
}

const TRAIL_VS = `
attribute vec3 tangent; attribute float side;
uniform float width; varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
 vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
 vec3 tv=normalize((modelViewMatrix*vec4(tangent,0.0)).xyz);
 vec3 eye=normalize(-mvPosition.xyz);
 vec3 across=cross(tv,eye); float d=length(across);
 across=d>.001?across/d:vec3(1,0,0);
 mvPosition.xyz+=across*side*width*.5;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const TRAIL_FS = `
uniform vec3 color; uniform float time; uniform float opacity;
uniform float reveal; uniform float energy;
varying vec2 vUv;
#include <fog_pars_fragment>
${NOISE}
void main() {
 float edge=pow(max(0.0,1.0-abs(vUv.y*2.0-1.0)),2.5);
 float n=fbm(vec2(vUv.x*37.0-time*22.0,vUv.y*4.0));
 float grit=smoothstep(.22,.65,n);
 float head=1.0-smoothstep(reveal-.025,reveal,vUv.x);
 float ends=smoothstep(0.0,.04,vUv.x)*(1.0-smoothstep(.94,1.0,vUv.x));
 float pulse=.7+.3*sin(vUv.x*65.0-time*38.0);
 vec3 rgb=mix(color,color+vec3(.65),pow(edge,5.0)*energy);
 gl_FragColor=vec4(rgb,edge*grit*head*ends*opacity*mix(1.0,pulse,energy));
 if(gl_FragColor.a<.003) discard;
 #include <fog_fragment>
}`;
function trail(group, points, color, width, energy = 1) {
  const pos = [], tangents = [], uv = [], sides = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    for (let k = 0; k < 2; k++) {
      pos.push(...p); tangents.push(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      uv.push(i / (points.length - 1), k); sides.push(k ? 1 : -1);
    }
    if (i < points.length - 1) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const g = new THREE.BufferGeometry();
  for (const [name, values, size] of [['position', pos, 3], ['tangent', tangents, 3], ['uv', uv, 2], ['side', sides, 1]]) g.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  g.setIndex(idx);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    color: { value: new THREE.Color(color) }, width: { value: width }, time: { value: 0 },
    opacity: { value: 1 }, reveal: { value: 1.03 }, energy: { value: energy },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    blending: energy ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'power_directional_trail'; mesh.frustumCulled = false; group.add(mesh);
  return { mesh, uniforms };
}

function oriented(pos, dir) {
  const g = new THREE.Group(); g.position.copy(pos);
  if (dir) g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  return g;
}

export function powerBuilders(getTexture, placeScorch = () => {}) {
  function beam({ world, origin, dir, length = 100, color = 0x66aaff }) {
    const group = oriented(origin, dir), life = .85;
    const traces = [];
    for (let j = 0; j < 3; j++) {
      const pts = Array.from({ length: 65 }, (_, i) => {
        const z = i / 64 * length, r = j ? .65 : 0, a = i * .55 + j * 2.8;
        return [Math.sin(a) * r, Math.cos(a) * r, z];
      });
      traces.push(trail(group, pts, j ? color : 0xd2eeff, j ? 1.15 : .85));
    }
    const sparks = puffs(group, count(48), getTexture, { hot: true, color });
    return new PowerEffect(world, group, life, T => {
      const fade = Math.min(1, T / .08) * clamp((life - T) / .25);
      for (const [j, tr] of traces.entries()) {
        tr.uniforms.time.value = T + j; tr.uniforms.opacity.value = fade * (j ? .55 : .9);
        tr.uniforms.reveal.value = clamp((T - .035) / .14) * 1.06;
      }
      for (let i = 0; i < sparks.n; i++) {
        const phase = (T * 2.3 + i * .618) % 1, a = i * 2.4;
        sparks.set(i, Math.cos(a) * (1 + phase * 2), Math.sin(a) * (1 + phase * 2), phase * length,
          .12, randStable(i, .6, 1.5), a, fade * .75);
      }
      sparks.flush();
    });
  }

  function pressure({ world, pos, args = [] }, ultimate = false) {
    const radius = args[1] ?? 60, life = ultimate ? 1.4 : 1.05;
    const group = oriented(pos); group.position.y = .12;
    const dust = puffs(group, count(ultimate ? 70 : 36), getTexture, { sheet: 'dust_burst_8x8', color: 0xc5b69c });
    const grit = puffs(group, count(24), getTexture, { color: 0x514c42 });
    const phase = Array.from({ length: dust.n }, () => rand(0, TAU));
    return new PowerEffect(world, group, life, T => {
      const t = T / life, front = radius * (1 - Math.pow(1 - t, 2.6));
      for (let i = 0; i < dust.n; i++) {
        const a = phase[i], wobble = .86 + .14 * Math.sin(i * 7.3);
        const r = front * wobble;
        const size = Math.min(14, 1.2 + radius * .11) * (.45 + t);
        dust.set(i, Math.cos(a) * r, .7 + Math.sin(t * Math.PI) * (ultimate ? 4 : 1.7), Math.sin(a) * r,
          size * 1.5, size, a * .25, (1 - t) * .65 * Math.min(1, t * 12), t * 61);
      }
      for (let i = 0; i < grit.n; i++) {
        const a = i * 2.399, v = randStable(i, 6, Math.min(radius, 25));
        grit.set(i, Math.cos(a) * v * T, Math.max(.05, 5 * T - 8 * T * T), Math.sin(a) * v * T,
          .12, .2, a, (1 - t) * .75);
      }
      dust.flush(); grit.flush();
    });
  }

  function breath({ world, origin, dir, length = 28, life = .7 }) {
    const group = oriented(origin, dir);
    const vapor = puffs(group, count(24), getTexture, { sheet: '__vapor', color: 0xbbc6c8 });
    return new PowerEffect(world, group, life, T => {
      for (let i = 0; i < vapor.n; i++) {
        const birth = i / vapor.n * .28, age = Math.max(0, T - birth), a = i * 2.399;
        const z = age / life * length, spread = z * .12;
        vapor.set(i, Math.sin(a) * spread, Math.cos(a) * spread, z, 1 + age * 7, .6 + age * 4,
          a, T < birth ? 0 : clamp((life - T) / .3) * .14, 8 + age / life * 50);
      }
      vapor.flush();
    });
  }

  function sound({ world, pos, args = [] }) {
    const radius = args[2] ?? 80, life = args[3] ?? 1.4;
    const group = oriented(pos), vapor = puffs(group, count(36), getTexture, { sheet: '__vapor', color: 0xced4cf });
    return new PowerEffect(world, group, life, T => {
      for (let i = 0; i < vapor.n; i++) {
        const band = i % 3, a = i * 2.399, age = T - band * .13, p = clamp(age / (life - .26));
        const r = Math.max(.01, p * radius);
        vapor.set(i, Math.sin(a) * r, Math.sin(a * 3.1) * r * .15, Math.cos(a) * r,
          1 + r * .16, .5 + r * .045, a, age < 0 ? 0 : .36 * Math.sin(p * Math.PI), p * 62);
      }
      vapor.flush();
    });
  }

  function slash({ world, pos, args = [] }, wing = false) {
    const yaw = args[0] || 0, life = wing ? .6 : .7, radius = wing ? 17 : 23;
    const group = oriented(pos); group.rotation.y = yaw;
    const traces = [];
    for (let j = 0; j < 3; j++) {
      const pts = Array.from({ length: 49 }, (_, i) => {
        const a = (i / 48 * 1.35 - .68) * Math.PI, r = radius - j * 1.4;
        return [Math.sin(a) * r, (wing ? 5 : 1.2) + Math.sin(a * 2) * .5, -Math.cos(a) * r];
      });
      traces.push(trail(group, pts, wing ? 0xbfcbd3 : 0xc4bba6, j ? .28 : .7, 0));
    }
    const dust = puffs(group, count(20), getTexture, { sheet: 'dust_burst_8x8', color: 0xb4a991 });
    return new PowerEffect(world, group, life, T => {
      const t = T / life;
      for (const tr of traces) {
        tr.uniforms.time.value = T; tr.uniforms.reveal.value = Math.min(1.05, t * 2);
        tr.uniforms.opacity.value = Math.sin(t * Math.PI) * .6;
      }
      for (let i = 0; i < dust.n; i++) {
        const birth = i / dust.n * life * .5, age = Math.max(0, T - birth), a = (i / dust.n * 1.35 - .68) * Math.PI;
        const r = radius + age * 9, sz = 1 + age * 7;
        dust.set(i, Math.sin(a) * r, .5 + age * 1.8, -Math.cos(a) * r, sz * 1.7, sz, a,
          T < birth ? 0 : clamp(1 - age / .5) * .55, age * 80);
      }
      dust.flush();
    });
  }

  function afterburner({ world, fromPos, toPos, color = 0x66aaff }) {
    const dir = toPos.clone().sub(fromPos), len = dir.length();
    if (len < .01) return null;
    const group = oriented(fromPos, dir), smoke = puffs(group, count(28), getTexture, { color: 0x989fa6 });
    const fire = puffs(group, count(22), getTexture, { hot: true, color });
    return new PowerEffect(world, group, .95, T => {
      for (let i = 0; i < smoke.n; i++) {
        const u = i / smoke.n, size = .6 + T * 4;
        smoke.set(i, Math.sin(i * 2.3) * T, 3 + T * 2, u * len, size, size, i, clamp(1 - T) * .4, 8 + T * 45);
      }
      for (let i = 0; i < fire.n; i++) {
        const u = i / fire.n;
        fire.set(i, Math.sin(i * 4.1) * .5, 3, u * len, .25, 1.7, i, clamp(1 - T / .3) * .8);
      }
      smoke.flush(); fire.flush();
    });
  }

  function impact({ world, pos, color = 0x72baff }) {
    const group = oriented(pos), dust = puffs(group, count(18), getTexture, { sheet: 'dust_burst_8x8', color: 0xb0a697 });
    const sparks = puffs(group, count(32), getTexture, { hot: true, color });
    if (pos.y < 4) placeScorch(world, pos, 5);
    return new PowerEffect(world, group, 1.25, T => {
      for (let i = 0; i < dust.n; i++) {
        const a = i * 2.399, r = Math.sqrt(T) * randStable(i, 2, 9), sz = 1 + T * 5;
        dust.set(i, Math.sin(a) * r, T * 3, Math.cos(a) * r, sz, sz * .8, a,
          Math.min(1, T * 20) * clamp((1.25 - T) / .6) * .5, Math.min(62, T * 48));
      }
      for (let i = 0; i < sparks.n; i++) {
        const a = i * 2.399, speed = randStable(i, 8, 22);
        sparks.set(i, Math.sin(a) * speed * T, Math.max(0, T * randStable(i, 4, 20) - 12 * T * T), Math.cos(a) * speed * T,
          i ? .12 : 3, i ? .7 : 3, a, i ? clamp(1 - T / .65) : clamp(1 - T / .075));
      }
      dust.flush(); sparks.flush();
    });
  }

  function devastation({ world, pos, scale = 1 }) {
    const group = oriented(pos); group.position.y = Math.max(.1, pos.y);
    group.scale.setScalar(scale);
    const smoke = puffs(group, count(isMobile ? 40 : 95), getTexture, { color: 0xa29c91 });
    const fire = puffs(group, count(55), getTexture, { hot: true, color: 0xff9b38 });
    const combustion = puffs(group, count(10), getTexture, { sheet: 'explosion_fireball_8x8', color: 0xffffff });
    const seeds = Array.from({ length: smoke.n }, (_, i) => ({ a: i * 2.399, r: rand(2, 14), delay: rand(0, .4), spin: rand(-.4, .4) }));
    return new PowerEffect(world, group, 4, T => {
      for (let i = 0; i < smoke.n; i++) {
        const s = seeds[i], age = Math.max(0, T - s.delay), t = age / 4;
        // Rising central column and outward-rolling crown, with irregular
        // silhouette and smoke occlusion rather than a luminous mushroom mesh.
        const crown = i % 3 !== 0, r = crown ? s.r + age * 6 : s.r * .35;
        const a = s.a + age * s.spin, sz = (crown ? 9 : 5) + age * (crown ? 6 : 3);
        const y = crown ? 4 + age * 14 + Math.sin(a + age) * 5 : 2 + i / smoke.n * age * 35;
        smoke.set(i, Math.cos(a) * r + age * 1.5, y, Math.sin(a) * r, sz, sz * .9, s.a + age * .08,
          T < s.delay ? 0 : Math.min(1, age * 3) * clamp((4 - T) / 1.4) * .78, Math.min(62, 6 + t * 53));
      }
      for (let i = 0; i < fire.n; i++) {
        const a = i * 2.399, age = T, speed = randStable(i, 10, 38);
        fire.set(i, Math.cos(a) * speed * age, Math.max(.2, 3 + randStable(i, 12, 40) * age - 14 * age * age), Math.sin(a) * speed * age,
          .3, 1.6, a, clamp(1 - T / 1.3), 0);
      }
      for (let i = 0; i < combustion.n; i++) {
        const delay = i * .023, age = Math.max(0, T - delay), a = i * 2.399, r = 2 + age * 8;
        const size = 7 + age * 23;
        combustion.set(i, Math.cos(a) * r, 3 + age * 12, Math.sin(a) * r, size, size, a,
          T < delay ? 0 : clamp(1 - age / .9) * .95, Math.min(63, age * 72));
      }
      smoke.flush(); fire.flush(); combustion.flush();
    });
  }

  function missiles({ world, origin, radius = 60, count: requested = 8 }) {
    const group = new THREE.Group(), n = Math.min(requested, isMobile ? 10 : 18);
    const smoke = puffs(group, n * 7, getTexture, { color: 0xb9b5ae });
    const jets = puffs(group, n, getTexture, { hot: true, color: 0xffb052 });
    const geom = new THREE.ConeGeometry(.22, 1.6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x48535e, roughness: .55, metalness: .65 });
    const start = origin.clone(); start.y = Math.max(12, start.y);
    const bodies = Array.from({ length: n }, (_, i) => {
      const a = i / n * TAU + rand(-.15, .15), r = radius * rand(.5, .95), flight = rand(.8, 1.15);
      const target = start.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); target.y = .4;
      const body = new THREE.Mesh(geom, mat); body.name = 'power_missile'; group.add(body);
      return { body, target, flight, delay: i * .045, landed: false };
    });
    const point = (m, t, out) => {
      const u = clamp(t / m.flight);
      out.lerpVectors(start, m.target, u); out.y += Math.sin(u * Math.PI) * (18 + radius * .1);
      return out;
    };
    const p = new THREE.Vector3(), q = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const fx = new PowerEffect(world, group, 2.25, T => {
      for (let i = 0; i < n; i++) {
        const m = bodies[i], age = T - m.delay;
        m.body.visible = age >= 0 && age < m.flight;
        point(m, age, p); m.body.position.copy(p);
        point(m, age + .01, q); q.sub(p);
        if (q.lengthSq() > .00001) m.body.quaternion.setFromUnitVectors(up, q.normalize());
        if (age >= m.flight && !m.landed) {
          m.landed = true; world.spawnExplosion?.(m.target.clone(), .55);
        }
        jets.set(i, p.x, p.y, p.z, .5, 1.7, i, m.body.visible ? .8 : 0);
        for (let j = 0; j < 7; j++) {
          const sample = Math.min(age, m.flight) - j * .028, old = Math.max(0, age - m.flight) + j * .028;
          point(m, sample, p);
          smoke.set(i * 7 + j, p.x, p.y + old * 2, p.z, 1.5 + old * 5.5, 1.5 + old * 5.5, i * 1.7,
            age < 0 || sample < 0 ? 0 : clamp(1 - old / .65) * .4, 7 + old * 55);
        }
      }
      smoke.flush(); jets.flush();
    });
    // The missileSwarm maker's contract is self-registering.
    world.effects.push(fx);
  }

  function wind({ world, origin, dir, count: n = 10 }) {
    const group = oriented(origin, dir), traces = [];
    for (let i = 0; i < Math.min(n, isMobile ? 6 : 12); i++) {
      const a = i * 2.399, r = rand(3, 9);
      const pts = Array.from({ length: 17 }, (_, j) => {
        const t = j / 16;
        return [Math.sin(a) * r * (1 + t * .3), Math.cos(a) * r * .4, t * 32];
      });
      traces.push(trail(group, pts, 0xb4c5cb, .18 + i % 3 * .08, 0));
    }
    return new PowerEffect(world, group, .45, T => {
      group.position.copy(origin).addScaledVector(dir, T * 28);
      for (const tr of traces) {
        tr.uniforms.time.value = T; tr.uniforms.reveal.value = clamp(T / .08) * 1.05;
        tr.uniforms.opacity.value = Math.sin(T / .45 * Math.PI) * .65;
      }
    });
  }

  function contact({ world, pos, args = [], color = 0xffd79b }, launch = false) {
    const group = oriented(pos), sparks = puffs(group, count(launch ? 16 : 8), getTexture,
      { hot: true, color: args[0] ?? color });
    const life = launch ? .32 : .24;
    return new PowerEffect(world, group, life, T => {
      const t = T / life;
      for (let i = 0; i < sparks.n; i++) {
        const a = i * 2.399, r = t * (launch ? 4 : 1.8);
        sparks.set(i, Math.sin(a) * r, Math.sin(a * 1.7) * r, Math.cos(a) * r,
          .10, .35 + (launch ? .7 : .2), a, (1 - t) * .65);
      }
      sparks.flush();
    });
  }

  return {
    beam, shockwave: pressure, soundRings: sound, breathCone: breath,
    tailSweep: o => slash(o), wingSlash: o => slash(o, true),
    wingFlap: o => slash({ ...o, args: [(o.args?.[0] || 1) * 1.2] }, true),
    afterburner, windStreaks: wind, atomicDome: o => pressure({ ...o, args: [0, o.args?.[0] || 130] }, true),
    atomicDevastation: devastation, beamImpact: impact, missileSwarm: missiles,
    atomicDetonation: o => devastation({ ...o, scale: .45 }),
    hitPulse: contact, missileLaunchFlash: o => contact(o, true),
  };
}

function randStable(i, a, b) { return a + (Math.sin(i * 12.9898 + 78.233) * 43758.5453 % 1 + 1) % 1 * (b - a); }
