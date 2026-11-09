import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadInfantryView() {
  const response = await fetch('./assets/viewmodels/infantry_view.glb');
  if (!response.ok) throw new Error('Infantry viewmodel failed to load');
  const {scene} = await new GLTFLoader().parseAsync(await response.arrayBuffer(), './assets/viewmodels/');
  scene.traverse(o => { if(o.isMesh) {o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;} });
  return scene;
}

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
    this.cooldown = 0; this.attackTimer = 3; this.warning = 0; this.time = 0;
    state.yaw = Math.atan2(kp.x-this.pos.x,kp.z-this.pos.z); state.pitch = 0;
    this.ray = new THREE.Raycaster(); this.box = new THREE.Box3(); this.hit = new THREE.Vector3();
    this.hud = document.createElement('div'); this.hud.id='lone-hud';
    this.hud.innerHTML='<div class="lone-panel" id="lone-status"></div><div class="lone-crosshair" aria-hidden="true"></div><div class="lone-controls lone-panel">WASD move · Mouse aim · Hold fire / RT shoot · Shift sprint<br>Helicopter: E / Space ascend · Q / C descend · Esc pause</div><div class="lone-panel" id="lone-target"></div>';
    document.body.append(this.hud);
    this.view = new THREE.Group(); this.camera.add(this.view); world.scene.add(camera);
    if (role === 'infantry') {
      if (viewModel) this.view.add(viewModel);
    } else {
    const mat = new THREE.MeshStandardMaterial({color:0x344047,metalness:.65,roughness:.55});
    const gun = new THREE.Mesh(new THREE.BoxGeometry(role === 'infantry' ? .09 : .18,.10,role === 'infantry' ? .35 : .85),mat);
    gun.position.set(.25,-.25,-.7); this.view.add(gun);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.018,.022,.55,8),mat);
    barrel.rotation.x=Math.PI/2;barrel.position.set(.25,-.22,-1);this.view.add(barrel);
    if(role !== 'infantry') {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4,.24,.3),mat);
      panel.position.set(0,-.57,-.7); this.view.add(panel);
    }
    if(role === 'helicopter') {
      for(const side of [-1,1]) {
        const strut=new THREE.Mesh(new THREE.BoxGeometry(.055,1.5,.08),mat);
        strut.position.set(side*.65,0,-.9);strut.rotation.z=side*.2;this.view.add(strut);
      }
    }
    }
    this.motion = 0; this.recoil = 0;

  }
  cameraUpdate() {
    const kick = Math.sin(this.recoil * Math.PI / 2);
    this.view.position.set(Math.sin(this.time * 8) * .006 * this.motion,
      Math.cos(this.time * 16) * .004 * this.motion, kick * .025);
    this.view.rotation.set(kick * .025, Math.sin(this.time * 8) * .004 * this.motion, kick * -.009);
    this.camera.position.copy(this.pos);
    const {yaw,pitch}=this.state;
    this.camera.lookAt(this.pos.x+Math.sin(yaw)*Math.cos(pitch),this.pos.y+Math.sin(pitch),this.pos.z+Math.cos(yaw)*Math.cos(pitch));
  }
  shoot() {
    if (this.cooldown>0) return;
    this.cooldown=this.unit.interval; this.recoil=1; this.sound();
    this.cameraUpdate();
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
    this.world.spawnBeam(this.pos.clone().addScaledVector(dir,1),dir,distance,0xffbc67,0xffdfaa);
    if(hitKaiju){this.kaijuHP=Math.max(0,this.kaijuHP-this.unit.damage);this.world.spawnHitPulse(end,0xffca77);this.state.score+=this.unit.damage;}
    else if(distance<450) {
      this.world.spawnSparks(end,5);
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
    const speed=this.unit.speed*(input.sprint?1.45:1), old=pos.clone();
    pos.x+=(Math.sin(state.yaw)*z-Math.cos(state.yaw)*x)*speed*dt;
    pos.z+=(Math.cos(state.yaw)*z+Math.sin(state.yaw)*x)*speed*dt;
    if(this.role==='helicopter')pos.y=THREE.MathUtils.clamp(pos.y+input.vertical*14*dt,8,65);
    const bounds=world.bounds;pos.x=THREE.MathUtils.clamp(pos.x,bounds.minX+2,bounds.maxX-2);pos.z=THREE.MathUtils.clamp(pos.z,bounds.minZ+2,bounds.maxZ-2);
    let blocked=this.role!=='helicopter' && world.isWater?.(pos.x,pos.z);
    world.buildingGrid?.forEachNear(pos.x,pos.z,40,b=>{if(!b.destroyed && pos.y<b.h+1 && Math.abs(pos.x-b.x)<b.w/2+1 && Math.abs(pos.z-b.z)<b.d/2+1)blocked=true;});
    if(blocked)pos.copy(old);
    this.cameraUpdate();if(input.fire)this.shoot();
    const kp=k.root.position, dx=pos.x-kp.x,dz=pos.z-kp.z,d=Math.hypot(dx,dz);
    const moving=d>22;
    if(moving){kp.x+=dx/d*10*dt;kp.z+=dz/d*10*dt;k.root.rotation.y=Math.atan2(dx,dz);}
    k.glb?.play(moving?'walk':'idle');k.mixer?.update(dt);
    world.kaijuPos=kp;
    world.buildingGrid?.forEachNear(kp.x,kp.z,35,b=>{if(!b.destroyed && Math.abs(kp.x-b.x)<b.w/2+10 && Math.abs(kp.z-b.z)<b.d/2+10)b.damage(100*dt,kp,world);});
    this.attackTimer-=dt;
    if(this.attackTimer<=0 && !this.warning){this.warning=1.2;this.target=pos.clone();k.glb?.playOnce('skill1',.1,1);}
    if(this.warning>0){
      this.warning-=dt;
      if(this.warning<=0){
        const mouth=new THREE.Vector3();k.head.getWorldPosition(mouth);
        const aim=this.target.clone().sub(mouth).normalize();
        let reach=mouth.distanceTo(this.target),cover=null;
        this.ray.set(mouth,aim);
        for(const b of world.buildings) {
          if(b.destroyed)continue;
          this.box.min.set(b.x-b.w/2,0,b.z-b.d/2);this.box.max.set(b.x+b.w/2,b.h,b.z+b.d/2);
          if(this.box.containsPoint(mouth))continue;
          if(this.ray.ray.intersectBox(this.box,this.hit)) {
            const dist=this.hit.distanceTo(mouth);if(dist<reach){reach=dist;cover=b;}
          }
        }
        const impact=mouth.clone().addScaledVector(aim,reach);
        world.spawnBeam(mouth,aim,reach,0x75dfff,0xb2f5ff);world.spawnExplosion(impact,1.1);
        if(cover)cover.damage(180,impact,world);
        else if(pos.distanceTo(this.target)<(this.role==='tank'?10:7))this.hp-=this.role==='tank'?65:35;
        this.attackTimer=3.5;
      }
    }
    if(d<16)this.hp-=28*dt;
    document.getElementById('lone-status').textContent=`LONE SOLDIER · ${this.unit.name.toUpperCase()} · HP ${Math.max(0,Math.ceil(this.hp))} / ${this.unit.hp}`;
    document.getElementById('lone-target').innerHTML=`AI KAIJU · ${Math.ceil(this.kaijuHP)} / ${this.maxKaijuHP}<div class="lone-health-track"><div class="lone-health-fill" style="width:${this.kaijuHP/this.maxKaijuHP*100}%"></div></div><div class="lone-warning" role="status">${this.warning>0?'INCOMING BEAM — MOVE!':''}</div>`;
    if(this.hp<=0||this.kaijuHP<=0)this.finish(this.kaijuHP<=0);
  }
  dispose(){
    this.hud.remove();this.view.removeFromParent();
    const materials=new Set();this.view.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});
    const textures=new Set();
    for(const m of materials){for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])if(m[key])textures.add(m[key]);m.dispose();}
    for(const t of textures)t.dispose();
  }
}
