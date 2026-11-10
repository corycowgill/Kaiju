import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachViewDetails } from './loneSoldierView.js';
import { LoneKaijuAI } from './loneKaijuAI.js';

const viewTemplates = new Map();
const sharedViewTextures = new Map();
export async function loadLoneView(role) {
  if (!['infantry','tank','helicopter'].includes(role)) throw new Error(`Unknown soldier view: ${role}`);
  if (!viewTemplates.has(role)) viewTemplates.set(role,(async()=>{
    const {cachedFetch}=await import('./assetCache.js');
    const bytes=await cachedFetch(`./assets/viewmodels/${role}_view.glb`);
    const {scene,parser}=await new GLTFLoader().parseAsync(bytes,'./assets/viewmodels/');
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
  const view=(await viewTemplates.get(role)).clone(true);
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
  constructor({ world, state, camera, role, finish, sound, viewModel }) {
    Object.assign(this, { world, state, camera, finish, sound });
    this.unit = UNITS[role]; this.role = role; this.pos = new THREE.Vector3();
    const kp = state.kaiju.root.position;
    const land = world.landPoint?.() || [kp.x + 70, kp.z];
    this.pos.set(land[0], this.unit.eye, land[1]);
    // Keep the opening engagement at a readable distance on dry land.
    for (let a = 0; a < Math.PI * 2; a += .3) {
      const x = kp.x + Math.cos(a) * 85, z = kp.z + Math.sin(a) * 85, b = world.bounds;
      if (x < b.minX+5 || x > b.maxX-5 || z < b.minZ+5 || z > b.maxZ-5 || world.isWater?.(x,z)) continue;
      let blocked = false;
      world.buildingGrid?.forEachNear(x,z,35,b => { if (!b.destroyed && Math.abs(x-b.x)<b.w/2+2 && Math.abs(z-b.z)<b.d/2+2) blocked=true; });
      if (!blocked) { this.pos.set(x,this.unit.eye,z); break; }
    }
    this.hp = this.unit.hp; this.kaijuHP = this.maxKaijuHP = 2400;
    this.cooldown = 0; this.warning = 0; this.time = 0;
    state.yaw = Math.atan2(kp.x-this.pos.x,kp.z-this.pos.z); state.pitch = 0;
    this.ray = new THREE.Raycaster(); this.box = new THREE.Box3(); this.hit = new THREE.Vector3();
    this.hud = document.createElement('div'); this.hud.id='lone-hud';
    this.hud.innerHTML='<div class="lone-panel" id="lone-status"></div><div class="lone-crosshair" aria-hidden="true"></div><div class="lone-controls lone-panel">WASD move · Mouse aim · Hold fire / RT shoot · Shift sprint<br>Helicopter: E / Space ascend · Q / C descend · Esc pause</div><div class="lone-panel" id="lone-target"></div>';
    document.body.append(this.hud);
    this.view = new THREE.Group(); this.camera.add(this.view); world.scene.add(camera);
    if (viewModel) {
      this.view.add(viewModel);
      this.visuals=attachViewDetails(viewModel,role,camera);
    }
    this.motion = 0; this.recoil = 0;
    this.steer=0;this.ai=new LoneKaijuAI();this.lookSway=new THREE.Vector2();this.sprintBlend=0;

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
    this.camera.position.copy(this.pos);
    const {yaw,pitch}=this.state;
    this.camera.lookAt(this.pos.x+Math.sin(yaw)*Math.cos(pitch),this.pos.y+Math.sin(pitch),this.pos.z+Math.cos(yaw)*Math.cos(pitch));
    this.visuals?.cameraUpdate();
  }
  shoot() {
    if (this.cooldown>0) return;
    this.cooldown=this.unit.interval; this.recoil=1; this.sound();
    this.cameraUpdate();
    this.visuals?.fire();
    const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);
    this.ray.set(this.pos,dir);let distance=450, hitKaiju=false;
    const root=this.state.kaiju.root;root.updateMatrixWorld(true);
    this.box.setFromObject(root);
    if(this.ray.ray.intersectBox(this.box,this.hit)) {distance=this.hit.distanceTo(this.pos);hitKaiju=true;}
    for(const b of this.world.buildings) {
      if(b.destroyed)continue;
      this.box.min.set(b.x-b.w/2,0,b.z-b.d/2);this.box.max.set(b.x+b.w/2,b.h,b.z+b.d/2);
      if(this.ray.ray.intersectBox(this.box,this.hit)) {
        const d=this.hit.distanceTo(this.pos);
        if(d<distance){distance=d;hitKaiju=false;}
      }
    }
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
  update(dt,input) {
    this.recoil=Math.max(0,this.recoil-dt*13);
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
    const {state,world,pos}=this, k=state.kaiju;
    state.hp=this.hp;state.maxHp=this.unit.hp;state.rage=0;
    state.yaw-=input.lookX*.045;state.pitch=THREE.MathUtils.clamp(state.pitch-input.lookY*.03,-1.35,1.35);
    let x=input.x,z=input.z,l=Math.max(1,Math.hypot(x,z));x/=l;z/=l;
    this.motion=THREE.MathUtils.lerp(this.motion,Math.min(1,Math.hypot(x,z)),Math.min(1,dt*10));
    this.lookSway.lerp(new THREE.Vector2(THREE.MathUtils.clamp(input.lookX*.004,-.035,.035),THREE.MathUtils.clamp(input.lookY*.004,-.025,.025)),1-Math.exp(-dt*12));
    this.sprintBlend=THREE.MathUtils.lerp(this.sprintBlend,input.sprint && !input.fire?this.motion:0,1-Math.exp(-dt*8));
    this.steer=THREE.MathUtils.lerp(this.steer,x,Math.min(1,dt*5));
    const speed=this.unit.speed*(input.sprint?1.45:1), old=pos.clone();
    pos.x+=(Math.sin(state.yaw)*z-Math.cos(state.yaw)*x)*speed*dt;
    pos.z+=(Math.cos(state.yaw)*z+Math.sin(state.yaw)*x)*speed*dt;
    if(this.role==='helicopter')pos.y=THREE.MathUtils.clamp(pos.y+input.vertical*14*dt,8,65);
    const bounds=world.bounds;pos.x=THREE.MathUtils.clamp(pos.x,bounds.minX+2,bounds.maxX-2);pos.z=THREE.MathUtils.clamp(pos.z,bounds.minZ+2,bounds.maxZ-2);
    let blocked=this.role!=='helicopter' && world.isWater?.(pos.x,pos.z);
    world.buildingGrid?.forEachNear(pos.x,pos.z,40,b=>{if(!b.destroyed && pos.y<b.h+1 && Math.abs(pos.x-b.x)<b.w/2+1 && Math.abs(pos.z-b.z)<b.d/2+1)blocked=true;});
    if(blocked)pos.copy(old);
    this.groundSpeed=Math.hypot(pos.x-old.x,pos.z-old.z)/Math.max(dt,1e-5);
    this.cameraUpdate();if(input.fire)this.shoot();
    this.ai.update(this,dt);
    this.visuals?.update(this,dt);
    document.getElementById('lone-status').textContent=`LONE SOLDIER · ${this.unit.name.toUpperCase()} · HP ${Math.max(0,Math.ceil(this.hp))} / ${this.unit.hp}`;
    document.getElementById('lone-target').innerHTML=`AI KAIJU · ${Math.ceil(this.kaijuHP)} / ${this.maxKaijuHP}<div class="lone-health-track"><div class="lone-health-fill" style="width:${this.kaijuHP/this.maxKaijuHP*100}%"></div></div><div class="lone-warning" role="status">${this.warning>0?this.attackLabel:''}</div>`;
    if(this.hp<=0||this.kaijuHP<=0)this.finish(this.kaijuHP<=0);
  }
  dispose(){
    this.hud.remove();this.view.removeFromParent();
    this.visuals?.dispose();
    const materials=new Set();this.view.traverse(o=>{if(o.isMesh&&o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)materials.add(o.material);});
    for(const m of materials)m.dispose();
  }
}
