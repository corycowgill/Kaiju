import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { attachViewDetails } from './loneSoldierView.js';
import { LoneKaijuAI } from './loneKaijuAI.js';
import { structureClearance } from './firstPersonLighting.js';
import { chooseSoldierSpawn } from './soldierSpawn.js';
import { StructureRayQuery } from './structureRayQuery.js';

const viewTemplates = new Map();
const sharedViewTextures = new Map();
export async function loadLoneView(role) {
  if (!['infantry','tank','helicopter'].includes(role)) throw new Error(`Unknown soldier view: ${role}`);
  if (!viewTemplates.has(role)) viewTemplates.set(role,(async()=>{
    const {cachedFetch}=await import('./assetCache.js');
    const bytes=await cachedFetch(`./assets/viewmodels/${role}_view.glb`);
    const {scene,parser,animations}=await new GLTFLoader().parseAsync(bytes,'./assets/viewmodels/');
    scene.animations=animations;
    scene.traverse(o=>{if(o.isMesh){
      o.geometry.userData.shared=true;
      for(const slot of ['map','emissiveMap','normalMap','roughnessMap','metalnessMap']) {
        const texture=o.material[slot];if(!texture)continue;
        const index=parser.associations.get(texture)?.textures;
        const source=parser.json.textures[index]?.source;
        const uri=parser.json.images[source]?.uri;if(!uri)continue;
        const key=uri+':'+texture.colorSpace;
        if(sharedViewTextures.has(key)) {
          const shared=sharedViewTextures.get(key);
          if(shared!==texture){o.material[slot]=shared;texture.dispose();}
        } else sharedViewTextures.set(key,texture);
      }
    }});
    return scene;
  })().catch(error=>{viewTemplates.delete(role);throw error;}));
  const view=cloneSkeleton(await viewTemplates.get(role));
  view.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
  return view;
}
export const loadInfantryView = () => loadLoneView('infantry');

export const UNITS = {
  infantry: { name: 'Infantry', hp: 100, speed: 9, eye: 1.8, damage: 18, interval: .12 },
  tank: { name: 'Tank', hp: 300, speed: 13, eye: 3.4, damage: 180, interval: 1.3 },
  helicopter: { name: 'Helicopter', hp: 160, speed: 23, eye: 23, damage: 32, interval: .16 },
};

export class LoneSoldier {
  constructor({ world, state, camera, role, finish, sound, viewModel, handlingSound=()=>{}, impactSound=()=>{}, pause=()=>{} }) {
    Object.assign(this, { world, state, camera, finish, sound, handlingSound, impactSound });
    this.unit = UNITS[role]; this.role = role; this.pos = new THREE.Vector3();
    const kp = state.kaiju.root.position;
    this.pos.copy(chooseSoldierSpawn(world,kp,this.unit.eye));
    this.hp = this.unit.hp; this.kaijuHP = this.maxKaijuHP = 2400;
    this.cooldown = 0; this.warning = 0; this.time = 0;
    this.verticalSpeed = 0; this.grounded = true; this.jumpHeld = false;
    this.movementBuildings = [];
    state.yaw = Math.atan2(kp.x-this.pos.x,kp.z-this.pos.z);
    state.pitch = Math.atan2(kp.y+12-this.pos.y,Math.hypot(kp.x-this.pos.x,kp.z-this.pos.z));
    this.ray = new THREE.Raycaster(); this.box = new THREE.Box3(); this.hit = new THREE.Vector3();
    state.kaiju.root.updateWorldMatrix(true,true);
    this.kaijuLocalBox=new THREE.Box3().setFromObject(state.kaiju.root)
      .applyMatrix4(new THREE.Matrix4().copy(state.kaiju.root.matrixWorld).invert());
    this.coverQuery=new StructureRayQuery();
    this.swayTarget=new THREE.Vector2();this.previousPosition=new THREE.Vector3();
    this.hud = document.createElement('div'); this.hud.id='lone-hud';
    const roleHelp=role==='infantry'?'Space / A jump · RMB / LT aim · R / X reload':role==='helicopter'?'E / Space ascend · Q / C descend':'Shift move faster · Mouse aim cannon';
    this.hud.innerHTML=`<div class="lone-panel" id="lone-status"><span class="lone-unit">${this.unit.name.toUpperCase()}</span><span class="lone-vital"><small>HP</small><b id="lone-hp">${this.unit.hp}</b></span><button type="button" id="lone-pause" aria-label="Pause game">Ⅱ</button></div>
      <div class="lone-crosshair" aria-hidden="true"></div><div class="lone-controls lone-panel">WASD move · Mouse / RT fire · Shift sprint<br>${roleHelp} · Esc pause</div>
      <div class="lone-panel" id="lone-target"><div class="lone-target-head"><b id="lone-target-name"></b><span id="lone-distance"></span></div><div class="lone-health-track"><div id="lone-target-fill" class="lone-health-fill"></div></div><div id="lone-warning" class="lone-warning" role="status"></div></div>
      <div id="lone-ammo" class="lone-panel"><small>${role==='infantry'?'RIFLE':role==='tank'?'CANNON':'AUTOCANNON'}</small><div><b id="lone-ammo-count"></b><small id="lone-mag-size"></small></div><span id="lone-weapon-state" role="status"></span></div>
      <div id="lone-bearing" hidden></div>`;
    document.body.append(this.hud);
    this.hud.addEventListener?.('mousedown',e=>e.stopPropagation());
    document.body.classList?.add('lone-mode',`lone-${role}`);
    const attack=document.getElementById?.('attack-btn');if(attack){attack.textContent='FIRE';attack.setAttribute?.('aria-label','Fire weapon');}
    this.hud.querySelector?.('#lone-pause')?.addEventListener('click',()=>pause());
    this.hudNodes={};this.hudValues={};
    for(const id of ['lone-hp','lone-ammo-count','lone-mag-size','lone-weapon-state','lone-target-name','lone-distance','lone-target-fill','lone-warning','lone-bearing'])this.hudNodes[id]=document.getElementById?.(id);
    this.hudClock=0;
    this.crosshair=this.hud.querySelector?.('.lone-crosshair');
    if(this.hudNodes['lone-target-name'])this.hudNodes['lone-target-name'].textContent=state.monsterCfg?.name||'KAIJU';
    this.view = new THREE.Group(); this.camera.add(this.view); world.scene.add(camera);
    if (viewModel) {
      world.prepareFirstPerson?.(viewModel);
      this.view.add(viewModel);
      this.visuals=attachViewDetails(viewModel,role,camera);
    }
    this.motion = 0; this.recoil = 0;this.impactShake=0;
    this.steer=0;this.ai=new LoneKaijuAI();this.lookSway=new THREE.Vector2();this.sprintBlend=0;
    this.ammo=30;this.magSize=30;this.reloadTime=0;this.reloadHeld=false;
    this.reloadDuration=2.2;this.emptyReload=false;
    this.aimBlend=0;this.baseFov=camera.fov;this.weaponKick=0;this.kickVelocity=0;
    this.gait=0;this.strideLean=0;this.settle=0;this.clearance=1.6;this.lightExposure=1;this.lightTarget=1;this.lightSampleTimer=0;this.lookDirection=new THREE.Vector3();
    if(role==='infantry') {
      this.hud.insertAdjacentHTML?.('beforeend','<div class="lone-infantry-actions"><button type="button" data-action="jump">JUMP</button><button type="button" data-action="aim">AIM</button><button type="button" data-action="reload">RELOAD</button></div>');
      const aim=this.hud.querySelector?.('[data-action="aim"]'),reload=this.hud.querySelector?.('[data-action="reload"]');
      aim?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();aim.setPointerCapture(e.pointerId);this.touchAim=true;});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])aim?.addEventListener(event,()=>{this.touchAim=false;});
      reload?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.touchReload=true;});
      const jump=this.hud.querySelector?.('[data-action="jump"]');
      jump?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();jump.setPointerCapture(e.pointerId);this.touchJump=true;this.jumpRequested=true;});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])jump?.addEventListener(event,()=>{this.touchJump=false;});
    }
    if(role==='helicopter') {
      this.hud.insertAdjacentHTML?.('beforeend','<div class="lone-vehicle-actions"><button type="button" data-action="ascend">UP</button><button type="button" data-action="descend">DOWN</button></div>');
      for(const [action,key] of [['ascend','touchAscend'],['descend','touchDescend']]) {
        const button=this.hud.querySelector?.(`[data-action="${action}"]`);
        button?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();button.setPointerCapture(e.pointerId);this[key]=true;});
        for(const event of ['pointerup','pointercancel','lostpointercapture'])button?.addEventListener(event,()=>{this[key]=false;});
      }
    }
    this.updateHUD();this.cameraUpdate();
  }
  updateHUD() {
    const write=(id,value)=>{
      if(this.hudValues[id]===value)return;this.hudValues[id]=value;
      const node=this.hudNodes[id];if(node)node.textContent=String(value);
    };
    write('lone-hp',Math.max(0,Math.ceil(this.hp)));
    write('lone-ammo-count',this.role==='infantry'?this.ammo:this.cooldown>0?'…':'✓');
    write('lone-mag-size',this.role==='infantry'?` / ${this.magSize}`:'');
    write('lone-weapon-state',this.reloadTime>0?'RELOADING':this.role==='infantry'&&this.ammo===0?'RELOAD':this.cooldown>0&&this.role!=='infantry'?'CYCLING':'READY');
    const kp=this.state.kaiju.root.position,dx=kp.x-this.pos.x,dz=kp.z-this.pos.z;
    write('lone-distance',`${Math.max(5,Math.round(Math.hypot(dx,dz)/5)*5)} m`);
    const fill=this.hudNodes['lone-target-fill'];
    if(fill?.style)fill.style.transform=`scaleX(${Math.max(0,this.kaijuHP/this.maxKaijuHP)})`;
    write('lone-warning',this.warning>0?this.attackLabel:'');
    const delta=Math.atan2(Math.sin(Math.atan2(dx,dz)-this.state.yaw),Math.cos(Math.atan2(dx,dz)-this.state.yaw));
    const horizontalFov=Math.atan(Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect);
    const bearing=this.hudNodes['lone-bearing'];
    if(bearing){bearing.hidden=Math.abs(delta)<horizontalFov*.9;write('lone-bearing',delta>0?'← KAIJU':'KAIJU →');}
    this.hud.classList?.toggle('critical',this.hp/this.unit.hp<.3);
  }
  meleeImpact(kind,strength) {
    this.impactShake=Math.max(this.impactShake,strength*(kind==='stomp'?.16:.09));
    this.impactSound(kind,strength);
  }
  cameraUpdate() {
    const kick = Math.sin(this.recoil * Math.PI / 2);
    const infantry=this.role==='infantry',heli=this.role==='helicopter';
    const shake=heli ? .0015 : .001*this.motion;
    this.view.position.set(Math.sin(this.time * (infantry?8:29)) * (infantry ? .006 : shake) * (infantry?this.motion:1),
      Math.cos(this.time * (infantry?16:37)) * (infantry ? .004*this.motion : shake)-(infantry?this.sprintBlend*.045:0),kick*(this.role==='tank' ? .055 : .025));
    this.view.rotation.set(kick*(this.role==='tank' ? .035 : .025)+(infantry?this.lookSway.y+this.sprintBlend*.09:0),
      Math.sin(this.time*8)*.004*this.motion+(infantry?this.lookSway.x:0),
      (heli?-this.steer*.025:infantry?this.sprintBlend*-.12:0)+kick*-.009);
    if(infantry) {
      const aim=this.aimBlend,reload=this.reloadTime>0?Math.sin((1-this.reloadTime/this.reloadDuration)*Math.PI):0;
      const wall=1-THREE.MathUtils.smoothstep(this.clearance,.85,1.55),bob=this.motion*(1-aim*.88);
      this.view.position.x=Math.sin(this.gait)*.006*bob-.205*aim+reload*.025;
      this.view.position.y=Math.cos(this.gait*2)*.004*bob-this.sprintBlend*.055-wall*.065;
      this.view.position.z=this.settle+wall*.08+this.sprintBlend*.035;
      this.view.position.y+=.120*aim-reload*.035+Math.sin(this.time*1.8)*.0015*(1-aim);
      this.view.position.z+=.14*aim+this.weaponKick*1.8;
      this.view.rotation.x=this.weaponKick+this.lookSway.y*(1-aim*.65)-this.sprintBlend*.18+reload*.10-wall*.50;
      this.view.rotation.y*=1-aim*.8;this.view.rotation.z+=reload*.22+this.strideLean;
      const fov=this.baseFov-aim*12;
      if(Math.abs(this.camera.fov-fov)>.001){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    }
    this.camera.position.copy(this.pos);
    const impact=this.impactShake||0;
    this.camera.position.x+=Math.sin(this.time*67)*impact;
    this.camera.position.y+=Math.sin(this.time*83)*impact*.65;
    const {yaw,pitch}=this.state;
    this.camera.lookAt(this.camera.position.x+Math.sin(yaw)*Math.cos(pitch),this.camera.position.y+Math.sin(pitch),this.camera.position.z+Math.cos(yaw)*Math.cos(pitch));
    this.visuals?.cameraUpdate();
  }
  shoot() {
    if (this.cooldown>0 || this.reloadTime>0) return;
    if(this.role==='infantry' && this.ammo===0){this.reload();return;}
    if(this.role==='infantry'){this.ammo--;this.kickVelocity+=.85;}
    this.cooldown=this.unit.interval; this.recoil=1; this.sound();
    this.cameraUpdate();
    this.visuals?.fire();
    const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);
    this.ray.set(this.pos,dir);let distance=450, hitKaiju=false;
    const root=this.state.kaiju.root;root.updateWorldMatrix(true,false);
    this.box.copy(this.kaijuLocalBox).applyMatrix4(root.matrixWorld);
    if(this.ray.ray.intersectBox(this.box,this.hit)) {distance=this.hit.distanceTo(this.pos);hitKaiju=true;}
    const cover=this.coverQuery.nearest(this.world,this.ray.ray,distance);
    if(cover){distance=cover.distance;hitKaiju=false;}
    const end=this.pos.clone().addScaledVector(dir,distance);
    const origin=this.pos.clone().addScaledVector(dir,1);
    this.visuals?.muzzlePosition(origin);
    const flight=end.clone().sub(origin),travel=flight.length();flight.normalize();
    this.world.spawnWeaponTracer?.(origin,flight,travel,this.role);
    const normal=dir.clone().negate();
    if(hitKaiju){this.kaijuHP=Math.max(0,this.kaijuHP-this.unit.damage);this.world.spawnBallisticImpact?.(end,normal,this.role,'kaiju');this.state.score+=this.unit.damage;}
    else if(distance<450) {
      this.world.spawnBallisticImpact?.(end,normal,this.role,'concrete');
      if(this.role==='tank') this.world.buildingGrid?.forEachNear(end.x,end.z,30,b=>{
        if(!b.destroyed && Math.abs(end.x-b.x)<b.w/2+3 && Math.abs(end.z-b.z)<b.d/2+3)b.damage(this.unit.damage,end,this.world);
      });
    }
  }
  reload() {
    if(this.role!=='infantry'||this.reloadTime>0||this.ammo===this.magSize)return false;
    this.emptyReload=this.ammo===0;this.reloadDuration=this.emptyReload?2.7:2.2;
    this.reloadTime=this.reloadDuration;this.visuals?.reload(this.emptyReload);this.handlingSound('release');return true;
  }
  moveInfantry(dt, input, vx, vz) {
    const {pos,world}=this, eye=this.unit.eye, radius=.4;
    // Edge-triggering prevents held Space (or touch/controller) from auto-hopping.
    if(input.jump && !this.jumpHeld && this.grounded) {
      this.verticalSpeed=7.5; this.grounded=false;
    }
    this.jumpHeld=!!input.jump;
    const nearby=this.movementBuildings;nearby.length=0;
    if(world.buildingGrid)world.buildingGrid.forEachNear(pos.x,pos.z,40+Math.hypot(vx,vz)*dt,b=>{if(!b.destroyed)nearby.push(b);});
    else for(const b of world.buildings)if(!b.destroyed)nearby.push(b);
    const overlaps=b=>Math.abs(pos.x-b.x)<b.w/2+radius && Math.abs(pos.z-b.z)<b.d/2+radius;
    const blocked=()=>world.isWater?.(pos.x,pos.z) || nearby.some(b=>pos.y-eye<b.h-1e-5 && overlaps(b));
    // Substeps stop a long frame tunnelling through fences; separate axes
    // let the soldier slide along walls rather than cancelling all movement.
    for(let remaining=dt;remaining>1e-8;) {
      const step=Math.min(remaining,1/120);remaining-=step;
      const feet=pos.y-eye;
      const nextFeet=feet+this.verticalSpeed*step-12*step*step;
      this.verticalSpeed-=24*step;
      // Use the higher feet position for horizontal clearance while rising.
      pos.y=eye+Math.max(feet,nextFeet);
      const oldX=pos.x;pos.x=THREE.MathUtils.clamp(pos.x+vx*step,world.bounds.minX+2,world.bounds.maxX-2);
      if(blocked())pos.x=oldX;
      const oldZ=pos.z;pos.z=THREE.MathUtils.clamp(pos.z+vz*step,world.bounds.minZ+2,world.bounds.maxZ-2);
      if(blocked())pos.z=oldZ;
      let floor=0;
      for(const b of nearby)if(b.h<=feet+1e-5 && overlaps(b))floor=Math.max(floor,b.h);
      if(this.verticalSpeed<=0 && nextFeet<=floor) {
        pos.y=eye+floor;this.verticalSpeed=0;this.grounded=true;
      } else {pos.y=eye+nextFeet;this.grounded=false;}
    }
  }
  update(dt,input) {
    this.impactShake=Math.max(0,this.impactShake-dt*.65);
    this.recoil=Math.max(0,this.recoil-dt*13);
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
    if(this.reloadTime>0){
      const before=this.reloadDuration-this.reloadTime;this.reloadTime=Math.max(0,this.reloadTime-dt);
      const after=this.reloadDuration-this.reloadTime;
      if(before<1.5&&after>=1.5)this.handlingSound('seat');
      if(this.emptyReload&&before<2.05&&after>=2.05)this.handlingSound('bolt');
      if(this.reloadTime===0)this.ammo=this.magSize;
    }
    if(input.reload&&!this.reloadHeld)this.reload();this.reloadHeld=!!input.reload;
    const aiming=this.role==='infantry' && input.aim && !this.reloadTime && !input.sprint && this.clearance>1.25;
    this.aimBlend=THREE.MathUtils.lerp(this.aimBlend,aiming?1:0,1-Math.exp(-dt*16));
    // Small fixed substeps keep the damped recoil stable during a long frame.
    for(let remaining=Math.min(dt,.1);remaining>0;) {
      const step=Math.min(remaining,1/120);remaining-=step;
      this.kickVelocity+=(-550*this.weaponKick-32*this.kickVelocity)*step;
      this.weaponKick+=this.kickVelocity*step;
    }
    const {state,world,pos}=this, k=state.kaiju;
    state.hp=this.hp;state.maxHp=this.unit.hp;state.rage=0;
    state.yaw-=input.lookX*.045;state.pitch=THREE.MathUtils.clamp(state.pitch-input.lookY*.03,-1.35,1.35);
    let x=input.x,z=input.z,l=Math.max(1,Math.hypot(x,z));x/=l;z/=l;
    this.lookSway.lerp(this.swayTarget.set(THREE.MathUtils.clamp(input.lookX*.004,-.035,.035),THREE.MathUtils.clamp(input.lookY*.004,-.025,.025)),1-Math.exp(-dt*12));
    this.steer=THREE.MathUtils.lerp(this.steer,x,Math.min(1,dt*5));
    const sprinting=input.sprint&&(this.role!=='infantry'||(!input.aim&&!input.fire&&!this.reloadTime));
    const speed=this.unit.speed*(sprinting?1.45:1)*(1-this.aimBlend*.45), old=this.previousPosition.copy(pos);
    if(this.role==='infantry')this.moveInfantry(dt,input,
      (Math.sin(state.yaw)*z-Math.cos(state.yaw)*x)*speed,
      (Math.cos(state.yaw)*z+Math.sin(state.yaw)*x)*speed);
    else {
      pos.x+=(Math.sin(state.yaw)*z-Math.cos(state.yaw)*x)*speed*dt;
      pos.z+=(Math.cos(state.yaw)*z+Math.sin(state.yaw)*x)*speed*dt;
      if(this.role==='helicopter')pos.y=THREE.MathUtils.clamp(pos.y+input.vertical*14*dt,8,65);
      const bounds=world.bounds;pos.x=THREE.MathUtils.clamp(pos.x,bounds.minX+2,bounds.maxX-2);pos.z=THREE.MathUtils.clamp(pos.z,bounds.minZ+2,bounds.maxZ-2);
      let blocked=this.role!=='helicopter' && world.isWater?.(pos.x,pos.z);
      world.buildingGrid?.forEachNear(pos.x,pos.z,40,b=>{if(!b.destroyed && pos.y<b.h+1 && Math.abs(pos.x-b.x)<b.w/2+1 && Math.abs(pos.z-b.z)<b.d/2+1)blocked=true;});
      if(blocked)pos.copy(old);
    }
    const priorSpeed=this.groundSpeed||0,travel=Math.hypot(pos.x-old.x,pos.z-old.z);
    this.groundSpeed=travel/Math.max(dt,1e-5);this.gait=(this.gait+travel*1.15)%(Math.PI*2);
    this.motion=THREE.MathUtils.lerp(this.motion,Math.min(1,this.groundSpeed/this.unit.speed),1-Math.exp(-dt*12));
    this.sprintBlend=THREE.MathUtils.lerp(this.sprintBlend,input.sprint&&!input.fire&&!input.aim&&!this.reloadTime?this.motion:0,1-Math.exp(-dt*8));
    this.strideLean=THREE.MathUtils.lerp(this.strideLean,-x*this.motion*.018,1-Math.exp(-dt*8));
    this.settle=THREE.MathUtils.lerp(this.settle,THREE.MathUtils.clamp((priorSpeed-this.groundSpeed)*.0015,-.015,.015),1-Math.exp(-dt*16));
    this.lookDirection.set(Math.sin(state.yaw)*Math.cos(state.pitch),Math.sin(state.pitch),Math.cos(state.yaw)*Math.cos(state.pitch));
    this.clearance=THREE.MathUtils.lerp(this.clearance,structureClearance(world,pos,this.lookDirection),1-Math.exp(-dt*12));
    this.lightSampleTimer-=dt;
    if(this.lightSampleTimer<=0){this.lightTarget=world.soldierExposure?.(pos)??1;this.lightSampleTimer=.12;}
    this.lightExposure=THREE.MathUtils.lerp(this.lightExposure,this.lightTarget,1-Math.exp(-dt*6));
    this.cameraUpdate();if(input.fire)this.shoot();
    this.ai.update(this,dt);
    this.visuals?.update(this,dt);
    this.hudClock-=dt;
    if(this.hudClock<=0){this.hudClock=.1;this.updateHUD();}
    if(this.crosshair)this.crosshair.style.opacity=String(1-this.aimBlend);
    if(this.hp<=0||this.kaijuHP<=0)this.finish(this.kaijuHP<=0);
  }
  dispose(){
    document.body.classList?.remove('lone-mode',`lone-${this.role}`);
    const attack=document.getElementById?.('attack-btn');if(attack){attack.innerHTML='SMASH<small>撃</small>';attack.setAttribute?.('aria-label','Smash');}
    this.camera.fov=this.baseFov;this.camera.updateProjectionMatrix();
    this.hud.remove();this.view.removeFromParent();
    this.visuals?.dispose();
    const skeletons=new Set(),materials=new Set();this.view.traverse(o=>{if(o.skeleton)skeletons.add(o.skeleton);if(o.isMesh&&o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)materials.add(o.material);});
    for(const skeleton of skeletons)skeleton.dispose();
    for(const m of materials)m.dispose();
  }
}
