import * as THREE from 'three';
import { drawInstrument } from './loneInstruments.js';

/** Live avionics are drawn into the actual recessed Blender screen meshes. */
export function attachViewDetails(model, role, camera) {
  const mixer=role==='infantry'?new THREE.AnimationMixer(model):null;
  const reloadActions={};
  for(const name of ['reload','reload_empty']) {
    const clip=model.animations?.find(c=>c.name===name);
    if(clip&&mixer)reloadActions[name]=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);
  }
  const displays = [], ownedTextures = [], originalMaterials = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || !/^DISPLAY_(FLIGHT|TACTICAL|SIGHT|ANALOG|ENGINE|SYSTEMS)$/.test(mesh.name)) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const context = canvas.getContext?.('2d');
    if (!context) return;
    const texture = new THREE.CanvasTexture(canvas); texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    ownedTextures.push(texture); originalMaterials.push(mesh.material);
    mesh.material = new THREE.MeshBasicMaterial({ map: texture, color: 0xbfc7c7, toneMapped: false });
    mesh.geometry = mesh.geometry.clone(); mesh.geometry.userData.shared = false;
    const uv = mesh.geometry.attributes.uv;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i=0;i<uv.count;i++) { u0=Math.min(u0,uv.getX(i));u1=Math.max(u1,uv.getX(i));v0=Math.min(v0,uv.getY(i));v1=Math.max(v1,uv.getY(i)); }
    for (let i=0;i<uv.count;i++) uv.setXY(i,(uv.getX(i)-u0)/(u1-u0),(uv.getY(i)-v0)/(v1-v0));
    uv.needsUpdate=true;
    displays.push({ context, texture, kind: mesh.name.slice(8) });
  });

  const controls = model.getObjectByName('CREW_CONTROLS');
  const barrel = model.getObjectByName('RECOIL_BARREL');
  const barrelZ = barrel?.position.z || 0;
  const muzzles = [model.getObjectByName('MUZZLE'),model.getObjectByName('MUZZLE_ALT')].filter(Boolean);
  // A directional combustion flash has a hot core and thin turbulent tongues,
  // rather than scaling an explosion fireball in front of the weapon.
  const flashCanvas=document.createElement('canvas');flashCanvas.width=256;flashCanvas.height=256;
  const fc=flashCanvas.getContext('2d');
  const glow=fc.createRadialGradient(128,128,1,128,128,90);
  glow.addColorStop(0,'rgba(255,253,224,1)');glow.addColorStop(.15,'rgba(255,217,132,.9)');
  glow.addColorStop(.4,'rgba(242,130,37,.35)');glow.addColorStop(1,'rgba(160,56,7,0)');
  fc.fillStyle=glow;fc.fillRect(0,0,256,256);
  for(let i=0;i<9;i++) {
    const angle=i*2.4,length=39+(Math.sin(i*17)+1)*35;
    fc.save();fc.translate(128,128);fc.rotate(angle);
    const tongue=fc.createLinearGradient(0,0,length,0);tongue.addColorStop(0,'rgba(255,249,207,.95)');tongue.addColorStop(1,'rgba(255,125,30,0)');
    fc.fillStyle=tongue;fc.beginPath();fc.moveTo(-9,-5);fc.quadraticCurveTo(length*.55,-10,length,0);fc.quadraticCurveTo(length*.4,7,-9,5);fc.fill();fc.restore();
  }
  const fire=new THREE.CanvasTexture(flashCanvas);fire.colorSpace=THREE.SRGBColorSpace;
  ownedTextures.push(fire);
  const flashMaterial = new THREE.SpriteMaterial({map:fire,color:0xffd7a0,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const flash = new THREE.Sprite(flashMaterial);flash.visible=false;model.add(flash);
  const bolt=model.getObjectByName('BOLT'),boltRest=bolt?.position.z||0;
  const eject=model.getObjectByName('EJECT');
  const shellStates=Array.from({length:12},()=>({age:9,origin:new THREE.Vector3()}));
  const shellPose=new THREE.Object3D();let shellCursor=0,shells;
  if(role==='infantry') {
    let environment;model.traverse(o=>{if(o.material?.envMap)environment=o.material.envMap;});
    shells=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0045,.0045,.027,8),
      new THREE.MeshStandardMaterial({color:0xb79a58,metalness:.7,roughness:.35,envMap:environment,envMapIntensity:.5}),12);
    shells.name='rifle_ejected_brass';shells.frustumCulled=false;shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shellPose.scale.setScalar(0);shellPose.updateMatrix();for(let i=0;i<12;i++)shells.setMatrixAt(i,shellPose.matrix);
    model.add(shells);
  }
  // Keep the world camera's near/far planes intact. A separate foreground
  // projection gives the cabin a short near plane and reserves a small front
  // depth range, preserving internal occlusion without clipping into buildings.
  const projection = new THREE.Matrix4();
  const cameraUpdate=()=>{
    projection.copy(camera.projectionMatrix);
    const near=.03,far=camera.far;
    projection.elements[10]=-(far+near)/(far-near);
    projection.elements[14]=-2*far*near/(far-near);
  };
  cameraUpdate();
  const sunExposure={value:1},surfaceLighting=[];
  model.traverse(object=>{
    if(!object.material)return;
    object.renderOrder=1000;
    const material=object.material;material.fog=false;
    if(material.isMeshStandardMaterial)surfaceLighting.push({material,intensity:material.envMapIntensity});
    material.onBeforeCompile=shader=>{
      shader.uniforms.viewProjection={value:projection};
      shader.uniforms.viewSunExposure=sunExposure;
      shader.vertexShader='uniform mat4 viewProjection;\n'+shader.vertexShader
        .replace('#include <project_vertex>',THREE.ShaderChunk.project_vertex)
        .replace(/gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition\s*;/,
          'gl_Position=viewProjection*mvPosition; gl_Position.z=(-.98+.08*clamp(gl_Position.z/gl_Position.w*.5+.5,0.0,1.0))*gl_Position.w;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('vec3 normal = normalize( vNormal );',
          'vec3 normal=dot(vNormal,vNormal)>1e-8?vNormal*inversesqrt(max(dot(vNormal,vNormal),1e-8)):vec3(0.0,0.0,1.0);'));
      shader.fragmentShader='uniform float viewSunExposure;\n'+shader.fragmentShader.replace('#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n#if UNROLLED_LOOP_INDEX == 0\n directLight.color *= mix(.18,1.0,viewSunExposure);\n#endif\n'));
    };
    material.customProgramCacheKey=()=> 'lone-foreground-depth-cover-v2';
  });
  let flashAge=1, shot=0, accumulator=1;
  const local = new THREE.Vector3();
  return {
    cameraUpdate,
    reload(empty){mixer?.stopAllAction();reloadActions[empty?'reload_empty':'reload']?.reset().setEffectiveWeight(1).play();},
    muzzlePosition(target) {
      const muzzle=muzzles[(shot-1+muzzles.length)%muzzles.length];
      if(!muzzle)return false;
      camera.updateMatrixWorld(true);muzzle.getWorldPosition(target);return true;
    },
    fire() {
      flashAge=0;
      const muzzle=muzzles[(shot++)%Math.max(1,muzzles.length)];
      if(muzzle) { model.updateMatrixWorld(true);muzzle.getWorldPosition(local);model.worldToLocal(local);flash.position.copy(local); }
      flash.visible=true;flashMaterial.rotation=Math.random()*Math.PI*2;
      if(shells&&eject) {
        const shell=shellStates[shellCursor++%12];shell.age=0;
        model.updateMatrixWorld(true);eject.getWorldPosition(shell.origin);model.worldToLocal(shell.origin);
      }
    },
    update(s, dt) {
      mixer?.update(dt);
      sunExposure.value=s.lightExposure??1;
      for(const {material,intensity}of surfaceLighting)material.envMapIntensity=intensity*(.5+.5*sunExposure.value);
      const boltOpen=role==='infantry'&&s.ammo===0&&(!s.reloadTime||s.reloadDuration-s.reloadTime<2.05);
      if(bolt)bolt.position.z=boltRest+(boltOpen?1:s.recoil)*.025;
      if(shells) {
        for(let i=0;i<12;i++) {
          const shell=shellStates[i],age=shell.age+=dt;
          shellPose.position.set(shell.origin.x+age*1.4,shell.origin.y+age*.6-2.8*age*age,shell.origin.z+age*.25);
          shellPose.rotation.set(age*17,i+age*23,age*9);shellPose.scale.setScalar(age<.65?Math.min(1,(.65-age)*12):0);
          shellPose.updateMatrix();shells.setMatrixAt(i,shellPose.matrix);
        }
        shells.instanceMatrix.needsUpdate=true;
      }
      flashAge+=dt;
      flash.visible=flashAge < (role==='tank'?.095:.055);
      const size=(role==='tank'?.70:role==='helicopter'?.23:.16)*(1+flashAge*5);
      flash.scale.setScalar(size);flashMaterial.opacity=Math.max(0,1-flashAge*12);
      flashMaterial.rotation+=dt*17;
      if(controls) { controls.rotation.x=s.motion*.025;controls.rotation.z=-(s.steer || 0)*.035; }
      if(barrel)barrel.position.z=barrelZ+s.recoil*.10;
      accumulator+=dt;if(accumulator<.125)return;accumulator=0;
      for(const display of displays) {
        drawInstrument(display.context,display.kind,s,role);
        const texture=display.texture;
        texture.needsUpdate=true;
      }
    },
    dispose() {
      mixer?.stopAllAction();mixer?.uncacheRoot(model);
      for(const texture of ownedTextures)texture.dispose();
      for(const material of originalMaterials)material.dispose();
    },
  };
}
