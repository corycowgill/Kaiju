import * as THREE from 'three';
import { createCrowdRoutes } from './crowdRoutes.js';

let authoredPerson = null, shirtAtlas = null;
export async function loadCrowdGeometry() {
  if (authoredPerson) return;
  const response = await fetch('./assets/viewmodels/festival_person.json');
  if (!response.ok) throw new Error('Festival person mesh failed to load');
  const data = await response.json();
  const g = new THREE.BufferGeometry();
  for (const [name, size] of [['position',3],['normal',3],['color',3],['limb',2],['joint',2],['surface',2],['shirtUV',2]]) {
    g.setAttribute(name,new THREE.Float32BufferAttribute(data[name],size));
  }
  g.setIndex(data.index);g.computeBoundingSphere();
  shirtAtlas = await new THREE.TextureLoader().loadAsync('./assets/viewmodels/crowd_shirts.png');
  shirtAtlas.colorSpace=THREE.SRGBColorSpace;shirtAtlas.anisotropy=4;
  authoredPerson=g;
}

// One draw for the whole festival. Limbs animate in the vertex shader;
// only steering and instance transforms run on the CPU, at 30 Hz.
export function crowdGeometry() {
  if (authoredPerson) return authoredPerson.clone();
  const parts = [ // width, height, depth, x, y, pivot, limb, colour
    [.13, .50, .16, -.10, .27, .52, -1, [.14, .18, .27]],
    [.13, .50, .16, .10, .27, .52, 1, [.14, .18, .27]],
    [.36, .43, .23, 0, .74, 0, 0, [1, 1, 1]],
    [.12, .42, .14, -.25, .74, .94, 2, [1, 1, 1]],
    [.12, .42, .14, .25, .74, .94, -2, [1, 1, 1]],
    [.22, .23, .21, 0, 1.08, 0, 0, [.79, .57, .40]],
    [.23, .07, .23, 0, 1.22, 0, 0, [.15, .11, .09]],
  ];
  const pos = [], col = [], limb = [];
  for (const [w, h, d, x, y, pivot, id, colour] of parts) {
    const g = new THREE.SphereGeometry(1,8,5).scale(w/2,h/2,d/2).toNonIndexed();
    g.translate(x, y, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(...colour); limb.push(pivot, id);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 2));
  g.setAttribute('shirtUV',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));
  g.setAttribute('joint',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));
  g.setAttribute('surface',new THREE.Float32BufferAttribute(col.flatMap((v,i)=>i%3===0?[col[i]+col[i+1]+col[i+2]>2.99?1:0,0]:[]),2));
  g.computeVertexNormals();
  return g;
}

export function crowdMaterial(uTime) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  mat.name = 'festival_animated_crowd';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uShirtAtlas={value:shirtAtlas};
    sh.uniforms.uHasShirts={value:shirtAtlas?1:0};
    sh.vertexShader = `uniform float uTime;
      attribute vec2 limb;
      attribute vec2 joint;
      attribute vec2 surface;
      attribute vec2 shirtUV;
      varying vec2 vShirtUV;
      varying float vShirtMask;
      varying float vShirtStyle;
      attribute vec3 crowdMotion;
      float swing() {
        float phase = uTime * mix(7.5, 14.0, crowdMotion.y) + crowdMotion.x;
        float side = sign(limb.y);
        return sin(phase) * side * mix(.12, .95, crowdMotion.y) * crowdMotion.z;
      }
      ` + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor = mix(color, color * instanceColor.rgb, surface.x);
          float complexion = fract(crowdMotion.x * 1.79);
          vColor = mix(vColor, mix(vec3(.30,.16,.095),vec3(.86,.64,.46),complexion),surface.y);
        #endif`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float flex = abs(joint.y) > .5 ? (abs(joint.y) < 1.5 ? max(0.0,swing()) * .65 : .25 + crowdMotion.y * .55) * crowdMotion.z : 0.0;
        objectNormal.yz = mat2(cos(flex),sin(flex),-sin(flex),cos(flex)) * objectNormal.yz;
        float aN = abs(limb.y) > .5 ? swing() : 0.0;
        objectNormal.yz = mat2(cos(aN), sin(aN), -sin(aN), cos(aN)) * objectNormal.yz;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vShirtUV=shirtUV;vShirtMask=surface.x;vShirtStyle=floor(fract(crowdMotion.x*.837)*16.0);
        if (abs(joint.y) > .5) {
          float flexV = (abs(joint.y) < 1.5 ? max(0.0,swing()) * .65 : .25 + crowdMotion.y * .55) * crowdMotion.z;
          vec2 relative = transformed.yz - vec2(joint.x,0.0);
          transformed.yz = mat2(cos(flexV),sin(flexV),-sin(flexV),cos(flexV))*relative+vec2(joint.x,0.0);
        }
        if (abs(limb.y) > .5) {
          float a = swing();
          vec2 yz = transformed.yz - vec2(limb.x, 0.0);
          transformed.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * yz + vec2(limb.x, 0.0);
        }
        float beat = sin(uTime * mix(7.5, 28.0, crowdMotion.y) + crowdMotion.x);
        transformed.y += max(0.0, beat) * mix(.12, .045, crowdMotion.y) * crowdMotion.z;`);
    sh.fragmentShader = `uniform sampler2D uShirtAtlas;
      uniform float uHasShirts;
      varying vec2 vShirtUV; varying float vShirtMask; varying float vShirtStyle;
      ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if(uHasShirts>.5 && vShirtMask>.5) {
          float styleIndex=floor(vShirtStyle+.5);
          vec2 tile=vec2(mod(styleIndex,4.0),3.0-floor(styleIndex/4.0));
          vec2 sampleUV=(tile+clamp(vShirtUV,vec2(.012),vec2(.988)))/4.0;
          vec3 cotton=texture2D(uShirtAtlas,sampleUV).rgb;
          float printInk=smoothstep(.72,.89,cotton.r);
          diffuseColor.rgb=mix(diffuseColor.rgb*cotton*1.65,vec3(.78,.75,.66),printInk*.85);
        }
      `);
  };
  mat.customProgramCacheKey = () => 'festival-blender-shirts-v3';
  return mat;
}

export function animateCrowd(c, { world, buildings, gates, isWater, bounds }) {
  const n = c.alive.length, pose = new THREE.Object3D();
  const motion = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  motion.setUsage(THREE.DynamicDrawUsage);
  c.im.geometry.setAttribute('crowdMotion', motion);
  c.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Moving crowds leave their initial lawns: a static bounding sphere would
  // cull runners. One small draw is cheaper than per-frame bounds recompute.
  c.im.frustumCulled = false;
  c.panic = new Float32Array(n);
  c.heading = new Float32Array(n);
  const sizes = new Float32Array(n), speeds = new Float32Array(n), delay = new Float32Array(n);
  const target = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    c.im.getMatrixAt(i, pose.matrix); pose.matrix.decompose(pose.position, pose.quaternion, pose.scale);
    sizes[i] = pose.scale.x; c.heading[i] = pose.rotation.y;
    speeds[i] = 2.7 + Math.random() * 1.6; delay[i] = .45 + Math.random() * 2.7;
    motion.setXYZ(i, Math.random() * Math.PI * 2, 0, 1);
  }
  // Static obstacle bins retain live building references, so destroyed fences
  // and tents immediately open escape routes without rebuilding a navmesh.
  const cells = new Map(), cell = 8;
  for (const b of buildings) {
    if (b.isBridge) continue;
    for (let x = Math.floor((b.x - b.w / 2 - .45) / cell); x <= Math.floor((b.x + b.w / 2 + .45) / cell); x++) {
      for (let z = Math.floor((b.z - b.d / 2 - .45) / cell); z <= Math.floor((b.z + b.d / 2 + .45) / cell); z++) {
        const key = `${x}:${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(b);
      }
    }
  }
  const blocked = (x, z) => {
    if (bounds && (x < bounds.minX + 1 || x > bounds.maxX - 1 || z < bounds.minZ + 1 || z > bounds.maxZ - 1)) return true;
    if (isWater?.(x, z)) return true;
    const bs = cells.get(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`);
    return bs?.some(b => !b.destroyed && Math.abs(x - b.x) < b.w / 2 + .3 && Math.abs(z - b.z) < b.d / 2 + .3);
  };
  const routes=createCrowdRoutes(c.pts,gates,blocked,bounds);
  const reconsider=new Float32Array(n),loads=new Uint16Array(gates.length);
  const neighbors=new Map(),next=new Int32Array(n),neighborPositions=new Float32Array(n*2),spacing=.75;
  let acc = 0, clock=0, obstacleClock=0;
  let destroyed=buildings.reduce((sum,b)=>sum+!!b.destroyed,0);
  return {
    update(dt) {
      acc += dt;
      if (acc < 1 / 30) return;
      const step = Math.min(acc, .1); acc = 0;
      clock+=step;obstacleClock+=step;
      if(obstacleClock>1){
        obstacleClock=0;
        const changed=buildings.reduce((sum,b)=>sum+!!b.destroyed,0);
        if(changed!==destroyed){destroyed=changed;routes.rebuild();reconsider.fill(0);}
      }
      // Snapshot neighbors once per tick; steering remains independent of update order.
      neighbors.clear();loads.fill(0);neighborPositions.set(c.pts);
      for(let i=0;i<n;i++)if(c.alive[i]){
        const key=`${Math.floor(c.pts[i*2]/spacing)}:${Math.floor(c.pts[i*2+1]/spacing)}`;
        next[i]=neighbors.get(key)??-1;neighbors.set(key,i);
        if(target[i]>=0)loads[target[i]]++;
      }
      const kp = world?.kaijuPos;
      let dirty = false;
      for (let i = 0; i < n; i++) {
        if (!c.alive[i]) {
          if (motion.getZ(i)) { motion.setXYZ(i, motion.getX(i), 0, 0); dirty = true; }
          continue;
        }
        const x = c.pts[i * 2], z = c.pts[i * 2 + 1];
        const dx = kp ? x - kp.x : 1e4, dz = kp ? z - kp.z : 1e4;
        const d = Math.hypot(dx, dz);
        if (d < 62) c.panic[i] = Math.min(12, c.panic[i] + step * 3);
        else c.panic[i] = Math.max(0, c.panic[i] - step);
        if (c.panic[i] <= delay[i]) {
          if (motion.getY(i)) { motion.setY(i, 0); dirty = true; }
          continue;
        }
        if ((target[i] < 0 || clock>=reconsider[i]) && gates.length) {
          let best = Infinity,choice=target[i];
          gates.forEach((g, j) => {
            const safety = kp ? Math.hypot(g.x - kp.x, g.z - kp.z) : 100;
            const route=routes.distance(j,x,z);
            const score = (Number.isFinite(route)?route:Math.hypot(g.x-x,g.z-z)+200)
              + Math.max(0,70-safety)*3 + loads[j]*.035 + (target[i]===j?-6:0);
            if (score < best) { best = score; choice = j; }
          });
          if(target[i]>=0)loads[target[i]]--;
          target[i]=choice;if(choice>=0)loads[choice]++;
          reconsider[i]=clock+1.4+(i%11)*.13;
        }
        const gate = gates[target[i]];
        // Immediate radial flight blends into an exit route once clear.
        const urgency = Math.max(0, 1 - d / 42);
        // Offset exit lanes instead of funneling everyone onto one coordinate.
        const lane=gate?Math.sin(i*2.399)*Math.min(1.2,(gate.w||4)*.22):0;
        const exitX=gate?gate.x+lane:0,exitZ=gate?gate.z:0;
        const route=gate&&Math.hypot(exitX-x,exitZ-z)>3?routes.direction(target[i],x,z):null;
        let gx = route?route.x:gate?exitX-x:dx, gz = route?route.z:gate?exitZ-z:dz;
        const gl = Math.hypot(gx, gz) || 1;
        gx = gx / gl * (1 - urgency) + dx / (d || 1) * urgency * 2;
        gz = gz / gl * (1 - urgency) + dz / (d || 1) * urgency * 2;
        let sx=0,sz=0,checked=0;
        const cx=Math.floor(x/spacing),cz=Math.floor(z/spacing);
        for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
          let j=neighbors.get(`${cx+ox}:${cz+oz}`)??-1;
          while(j>=0&&checked<36){
            if(j!==i){checked++;let ax=x-neighborPositions[j*2],az=z-neighborPositions[j*2+1];const distance=Math.hypot(ax,az);
              if(distance<.68){if(distance<.001){ax=Math.sin(i*2.399);az=Math.cos(i*2.399);}
                const strength=(.68-distance)/.68;
                sx+=ax/(distance||1)*strength;sz+=az/(distance||1)*strength;
              }
            }j=next[j];
          }
        }
        const separation=Math.hypot(sx,sz)||1;
        gx+=sx/Math.max(1,separation)*1.25;gz+=sz/Math.max(1,separation)*1.25;
        const yaw = Math.atan2(gx, gz) + Math.sin(i * 2.4) * .06;
        const travel = speeds[i] * step;
        let moved = false;
        // Probe around obstacles with a consistent passing side per person.
        const side = i % 2 ? 1 : -1;
        for (const turn of [0, .6 * side, -.6 * side, 1.2 * side, -1.2 * side, 2.1 * side]) {
          const a = yaw + turn, vx = Math.sin(a), vz = Math.cos(a);
          if (blocked(x + vx * .85, z + vz * .85) || blocked(x + vx * travel, z + vz * travel)) continue;
          c.pts[i * 2] = x + vx * travel; c.pts[i * 2 + 1] = z + vz * travel;
          c.heading[i] += Math.atan2(Math.sin(a - c.heading[i]), Math.cos(a - c.heading[i])) * Math.min(1, step * 12);
          moved = true; break;
        }
        pose.position.set(c.pts[i * 2], .04, c.pts[i * 2 + 1]);
        pose.rotation.set(moved ? .14 : 0, c.heading[i], 0); pose.scale.setScalar(sizes[i]);
        pose.updateMatrix(); c.im.setMatrixAt(i, pose.matrix);
        motion.setY(i, motion.getY(i) + ((moved ? 1 : .2) - motion.getY(i)) * Math.min(1, step * 8)); dirty = true;
        // Reaching an exit retires the person instead of piling bodies on it.
        if (gate && Math.hypot(exitX - pose.position.x, exitZ - pose.position.z) < 1.8 && d > 26) {
          c.alive[i] = 0; c.im.setMatrixAt(i, pose.matrix.makeScale(0, 0, 0));
        }
      }
      if (dirty) { c.im.instanceMatrix.needsUpdate = true; motion.needsUpdate = true; }
      c.im.sync?.(world?.crowdViewPosition || world?.kaijuPos);
    },
  };
}
