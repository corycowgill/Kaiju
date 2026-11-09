import * as THREE from 'three';

/** Live avionics are drawn into the actual recessed Blender screen meshes. */
export function attachViewDetails(model, role, camera) {
  const displays = [], ownedTextures = [], originalMaterials = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || !/^DISPLAY_(FLIGHT|TACTICAL|SIGHT)$/.test(mesh.name)) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const context = canvas.getContext?.('2d');
    if (!context) return;
    const source = mesh.material.map?.image;
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
    displays.push({ canvas, context, source, texture, flight: mesh.name==='DISPLAY_FLIGHT' });
  });

  const controls = model.getObjectByName('CREW_CONTROLS');
  const barrel = model.getObjectByName('RECOIL_BARREL');
  const barrelZ = barrel?.position.z || 0;
  const muzzles = [model.getObjectByName('MUZZLE'),model.getObjectByName('MUZZLE_ALT')].filter(Boolean);
  // Reuse the existing textured fire flipbook; a short-lived local flash is
  // anchored at the authored muzzle, rather than a screen-centered bloom.
  const fire = new THREE.TextureLoader().load('./assets/vfx/explosion_fireball_8x8@512.webp');
  fire.colorSpace=THREE.SRGBColorSpace;fire.repeat.set(1/8,1/8);fire.offset.set(0,7/8);
  ownedTextures.push(fire);
  const flashMaterial = new THREE.SpriteMaterial({map:fire,color:0xffd7a0,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const flash = new THREE.Sprite(flashMaterial);flash.visible=false;model.add(flash);
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
  model.traverse(object=>{
    if(!object.material)return;
    object.renderOrder=1000;
    const material=object.material;material.fog=false;
    material.onBeforeCompile=shader=>{
      shader.uniforms.viewProjection={value:projection};
      shader.vertexShader='uniform mat4 viewProjection;\n'+shader.vertexShader
        .replace('#include <project_vertex>',THREE.ShaderChunk.project_vertex)
        .replace(/gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition\s*;/,
          'gl_Position=viewProjection*mvPosition; gl_Position.z=(-.98+.08*clamp(gl_Position.z/gl_Position.w*.5+.5,0.0,1.0))*gl_Position.w;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('vec3 normal = normalize( vNormal );',
          'vec3 normal=dot(vNormal,vNormal)>1e-8?vNormal*inversesqrt(max(dot(vNormal,vNormal),1e-8)):vec3(0.0,0.0,1.0);'));
    };
    material.customProgramCacheKey=()=> 'lone-foreground-depth-v1';
  });
  let flashAge=1, shot=0, accumulator=1;
  const local = new THREE.Vector3();
  return {
    cameraUpdate,
    fire() {
      flashAge=0;
      const muzzle=muzzles[(shot++)%Math.max(1,muzzles.length)];
      if(muzzle) { model.updateMatrixWorld(true);muzzle.getWorldPosition(local);model.worldToLocal(local);flash.position.copy(local); }
      flash.visible=true;flashMaterial.rotation=Math.random()*Math.PI*2;
    },
    update(s, dt) {
      flashAge+=dt;
      flash.visible=flashAge < (role==='tank'?.095:.055);
      const size=(role==='tank'?.70:role==='helicopter'?.23:.16)*(1+flashAge*5);
      flash.scale.setScalar(size);flashMaterial.opacity=Math.max(0,1-flashAge*12);
      const frame=Math.min(7,Math.floor(flashAge*75));fire.offset.set(frame/8,7/8);
      if(controls) { controls.rotation.x=s.motion*.025;controls.rotation.z=-(s.steer || 0)*.035; }
      if(barrel)barrel.position.z=barrelZ+s.recoil*.10;
      accumulator+=dt;if(accumulator<.125)return;accumulator=0;
      const range=Math.round(s.pos.distanceTo(s.state.kaiju.root.position));
      for(const display of displays) {
        const {context:c,source,flight,texture}=display;
        c.fillStyle='#071116';c.fillRect(0,0,512,320);
        if(source) {
          const w=source.width/2,h=source.height/2;
          c.drawImage(source,flight?0:w,0,w,h*.68,0,0,512,320);
        }
        if(flight) {
          c.save();c.beginPath();c.arc(256,168,100,0,Math.PI*2);c.clip();
          c.translate(256,168);c.rotate((s.steer||0)*.08);c.translate(0,s.state.pitch*75);
          c.fillStyle='#11527d';c.fillRect(-180,-230,360,230);
          c.fillStyle='#654b2e';c.fillRect(-180,0,360,230);
          c.strokeStyle='#b7d4d9';c.lineWidth=2;c.beginPath();c.moveTo(-180,0);c.lineTo(180,0);c.stroke();
          for(let y=-90;y<=90;y+=22){c.fillStyle='#c4e1e8';c.fillRect(-20,y,40,1);}
          c.restore();c.strokeStyle='#ffd883';c.lineWidth=3;c.beginPath();c.moveTo(222,168);c.lineTo(247,168);c.lineTo(256,175);c.lineTo(265,168);c.lineTo(290,168);c.stroke();
        } else {
          c.strokeStyle='#b0e99b';c.lineWidth=1.5;
          c.strokeRect(221,91,70,75);c.beginPath();c.moveTo(206,129);c.lineTo(306,129);c.moveTo(256,78);c.lineTo(256,179);c.stroke();
        }
        c.fillStyle='#071116';c.fillRect(0,277,512,43);
        c.font='bold 19px monospace';c.fillStyle=flight?'#a8e7f3':'#b1e899';
        const heading=((s.state.yaw*180/Math.PI)%360+360)%360;
        const speed=s.groundSpeed || 0;
        c.fillText(flight?`ALT ${Math.round(s.pos.y)} M   SPD ${Math.round(speed)} M/S`:`RNG ${range} M   AZ ${Math.round(heading)} DEG`,12,299);
        if(flight) {
          c.font='bold 21px monospace';
          for(const [x,value] of [[12,Math.round(speed*1.944)],[417,Math.round(s.pos.y*3.281)]]) {
            c.fillStyle='#071116';c.fillRect(x,136,83,30);c.strokeStyle='#90c8a8';c.strokeRect(x,136,83,30);
            c.fillStyle='#b7e1d4';c.fillText(String(value),x+8,158);
          }
        }
        c.font='12px monospace';c.fillStyle=s.warning>0?'#ffb56d':'#83bdc4';
        c.fillText(s.warning>0?'INCOMING / EVADE':s.cooldown>.1?'WEAPON CYCLING':'SYSTEM READY',12,316);
        texture.needsUpdate=true;
      }
    },
    dispose() {
      for(const texture of ownedTextures)texture.dispose();
      for(const material of originalMaterials)material.dispose();
    },
  };
}
