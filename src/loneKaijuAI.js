import * as THREE from 'three';

// Explicit phases keep expired warning timers from permanently disabling attacks.
// Targets lock during the wind-up so sprinting away is a useful counterplay.
export class LoneKaijuAI {
  constructor() {
    this.phase='approach';this.timer=2.2;this.attacks=0;this.pulse=0;
    this.target=new THREE.Vector3();this.lastPlayer=new THREE.Vector3();
    this.velocity=new THREE.Vector3();this.origin=new THREE.Vector3();
    this.direction=new THREE.Vector3();this.impact=new THREE.Vector3();
    this.box=new THREE.Box3();this.ray=new THREE.Ray();this.hit=new THREE.Vector3();
    this.initialized=false;this.hitPlayer=false;this.kind='beam';
  }
  update(s,dt) {
    const {world,pos,state}=s,k=state.kaiju,kp=k.root.position;
    if(!this.initialized){this.lastPlayer.copy(pos);this.initialized=true;}
    this.velocity.copy(pos).sub(this.lastPlayer).divideScalar(Math.max(dt,.001)).clampLength(0,28);
    this.lastPlayer.copy(pos);
    const distance=Math.hypot(pos.x-kp.x,pos.z-kp.z);
    const yaw=Math.atan2(pos.x-kp.x,pos.z-kp.z);
    k.root.rotation.y+=Math.atan2(Math.sin(yaw-k.root.rotation.y),Math.cos(yaw-k.root.rotation.y))*Math.min(1,dt*3);
    const moving=this.phase==='approach' && distance>26;
    if(moving){const step=Math.min(distance-26,dt*11);kp.x+=Math.sin(yaw)*step;kp.z+=Math.cos(yaw)*step;}
    if(this.phase==='approach'||this.phase==='recover') k.glb?.play(moving?'walk':'idle');
    k.mixer?.update(dt);world.kaijuPos=kp;
    world.buildingGrid?.forEachNear(kp.x,kp.z,35,b=>{
      if(!b.destroyed && Math.abs(kp.x-b.x)<b.w/2+10 && Math.abs(kp.z-b.z)<b.d/2+10)b.damage(100*dt,kp,world);
    });
    this.timer=Math.max(0,this.timer-dt);
    if(this.phase==='approach' && this.timer===0) {
      this.kind=distance<35 && pos.y<10 && this.attacks%2===0?'stomp':'beam';
      this.phase='windup';this.timer=this.kind==='stomp'?1.05:1.3;
      this.target.copy(pos).addScaledVector(this.velocity,.25);
      this.hitPlayer=false;this.impactShown=false;this.pulse=0;this.attacks++;
      k.glb?.playOnce(this.kind==='stomp'?'stomp':'skill1',.12,1,{duration:this.timer+(this.kind==='stomp'?.35:1.05)});
      if(this.kind==='beam')world.spawnKaijuCharge?.(k.head,this.timer);
      const warning=this.kind==='stomp'?kp.clone().setY(.2):this.target.clone().setY(.2);
      world.spawnBossTelegraph?.(warning,this.kind==='stomp'?33:9,this.timer);
    } else if(this.phase==='windup' && this.timer===0) {
      this.phase='attack';this.timer=this.kind==='stomp'?.35:1.05;
      if(this.kind==='stomp') {
        const ground=kp.clone().setY(.3);
        world.spawnShockwave?.(ground,0xe4b47c,34);world.spawnDustBurst?.(ground,30,16);
        if(distance<34 && pos.y<10) s.hp-=s.role==='tank'?50:30;
        world.buildingGrid?.forEachNear(kp.x,kp.z,38,b=>{
          if(!b.destroyed && Math.hypot(b.x-kp.x,b.z-kp.z)<34)b.damage(180,ground,world);
        });
      }
    } else if(this.phase==='attack') {
      this.pulse-=dt;
      if(this.kind==='beam' && this.pulse<=0){this.beam(s);this.pulse=.18;}
      if(this.timer===0){this.phase='recover';this.timer=1.15;}
    } else if(this.phase==='recover' && this.timer===0) {
      this.phase='approach';this.timer=s.kaijuHP<s.maxKaijuHP*.4?1.35:2.1;
    }
    s.warning=this.phase==='windup'?this.timer:0;
    s.attackLabel=this.kind==='stomp'?'GROUND SLAM — BACK AWAY':'BEAM CHARGING — MOVE';
  }
  beam(s) {
    const {world,state,pos}=s;
    state.kaiju.root.updateMatrixWorld(true);
    state.kaiju.head.getWorldPosition(this.origin);
    this.direction.copy(this.target).sub(this.origin).normalize();
    this.ray.set(this.origin,this.direction);
    let reach=Math.min(500,this.origin.distanceTo(this.target)+18),cover=null;
    for(const b of world.buildings) {
      if(b.destroyed)continue;
      this.box.min.set(b.x-b.w/2,0,b.z-b.d/2);this.box.max.set(b.x+b.w/2,b.h,b.z+b.d/2);
      if(this.box.containsPoint(this.origin))continue;
      if(this.ray.intersectBox(this.box,this.hit)) {
        const d=this.hit.distanceTo(this.origin);if(d<reach){reach=d;cover=b;}
      }
    }
    this.impact.copy(this.origin).addScaledVector(this.direction,reach);
    world.spawnBeam(this.origin.clone(),this.direction.clone(),reach,0x75dfff,0xb2f5ff);
    // A single burst has one damage budget; visual pulses cannot multiply damage.
    const along=this.hit.copy(pos).sub(this.origin).dot(this.direction);
    if(!this.hitPlayer && along>=0 && along<reach+2 && this.ray.distanceSqToPoint(pos)<(s.role==='tank'?6:4)**2) {
      s.hp-=s.role==='tank'?65:35;this.hitPlayer=true;
    }
    if(cover)cover.damage(35,this.impact,world);
    if(!this.impactShown){
      if(world.spawnEnergyImpact)world.spawnEnergyImpact(this.impact.clone(),this.direction.clone().negate());
      else world.spawnExplosion(this.impact.clone(),.8);
      this.impactShown=true;
    }
  }
}
