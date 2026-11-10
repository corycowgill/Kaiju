import * as THREE from 'three';

// Production hardware anchors the bright stage art in a believable event.
// One instanced draw, rebuilt only when a stage is destroyed.
export function dressStageProduction(scene,stages,animators) {
  if(!stages.length)return;
  const geometry=new THREE.BoxGeometry(1,1,1);
  const material=new THREE.MeshStandardMaterial({color:0x20272a,roughness:.9});
  const speakers=new THREE.InstancedMesh(geometry,material,stages.length*6);
  speakers.name='Festival suspended speaker arrays';speakers.count=0;
  speakers.frustumCulled=false;speakers.receiveShadow=true;
  const pose=new THREE.Object3D();let last=-1;
  const animator={update(){
    const destroyed=stages.reduce((n,s)=>n+!!s.b.destroyed,0);if(destroyed===last)return;last=destroyed;speakers.count=0;
    for(const {it,b} of stages)if(!b.destroyed) {
      const c=Math.cos(it.rot),s=Math.sin(it.rot),h=Math.max(1,it.h);
      for(const side of [-1,1])for(let j=0;j<3;j++) {
        const x=side*it.w*.41,z=it.d*.37;
        pose.position.set(it.x+c*x+s*z,h*(.43+j*.16),it.z-s*x+c*z);
        pose.rotation.set(.08*j,it.rot,0);pose.scale.set(Math.max(.45,h*.20),h*.15,Math.max(.35,h*.14));
        pose.updateMatrix();speakers.setMatrixAt(speakers.count++,pose.matrix);
      }
    }
    speakers.visible=speakers.count>0;speakers.instanceMatrix.needsUpdate=true;
  }};
  animator.update();animators.push(animator);scene.add(speakers);
}

// Cheap wind-reactive fabric, batched and attached to destructible stalls.
export function dressFestival(scene, F, buildings, trampled, animators, lite) {
  // Fabric pennants along the concessions and entrance gateways. One draw,
  // no lights or shadow passes; attach each to a live destructible building.
  const flags = [];
  for (const it of F.items) {
    if (!['gate', 'food', 'bar', 'merch', 'water'].includes(it.kind)) continue;
    const n = Math.max(3, Math.min(lite ? 6 : 12, Math.floor(it.w / .8)));
    for (let i = 0; i < n; i++) {
      const u = ((i + .5) / n - .5) * it.w;
      flags.push({ x: it.x + Math.cos(it.rot) * u, z: it.z - Math.sin(it.rot) * u,
        y: Math.max(.9, it.h * .85) - Math.sin((i + .5) / n * Math.PI) * .22,
        yaw: it.rot, phase: i * 1.7, it });
    }
  }
  if (!flags.length) return;
  const g = new THREE.BufferGeometry();
  const vertices=[],indices=[];
  for(let j=0;j<4;j++){const t=j/4;vertices.push(-.22*(1-t),-.48*t,0,.22*(1-t),-.48*t,0);}
  vertices.push(0,-.48,0);
  for(let j=0;j<3;j++){const a=j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  indices.push(6,7,8);
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff });
  const fabricTime={value:0};
  mat.onBeforeCompile=shader=>{
    shader.uniforms.fabricTime=fabricTime;
    shader.vertexShader='uniform float fabricTime;varying float pennantFold;\n'+shader.vertexShader
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        float tip=clamp(-position.y/.48,0.0,1.0);
        float phase=instanceMatrix[3].x*.7+instanceMatrix[3].z*.3;
        pennantFold=sin(fabricTime*2.7+phase+tip*5.0);
        transformed.z+=pennantFold*tip*tip*.065;`);
    shader.fragmentShader='varying float pennantFold;\n'+shader.fragmentShader
      .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=.89+.11*pennantFold;');
  };
  mat.customProgramCacheKey=()=> 'festival-bending-fabric-v1';
  const im = new THREE.InstancedMesh(g, mat, flags.length);
  im.name = 'festival_wind_pennants'; im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const o = new THREE.Object3D(), colour = new THREE.Color();
  const palette = [0xff7247, 0xf1bf42, 0x37beb4, 0xca4a84, 0x6d65bc];
  // Find the closest festival piece at build time; its destruction drops
  // the fabric too, avoiding floating decoration over flattened stalls.
  const pieces = buildings.filter(b => b.fest);
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]; let best = Infinity;
    for (const b of pieces) {
      const d = Math.hypot(b.x - f.x, b.z - f.z);
      if (d < best) { best = d; f.owner = b; }
    }
    im.setColorAt(i, colour.setHex(palette[i % palette.length]));
  }
  scene.add(im);
  const animate = { update(dt, time) {
    fabricTime.value=time%(Math.PI*20);
    flags.forEach((f, i) => {
      o.position.set(f.x, f.y, f.z);
      o.rotation.set(Math.sin(time * 3.2 + f.phase) * .06, f.yaw, Math.sin(time * 2.1 + f.phase) * .04);
      o.scale.setScalar(f.owner?.destroyed ? 0 : 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  } };
  animate.update(0, 0); animators.push(animate);
}

