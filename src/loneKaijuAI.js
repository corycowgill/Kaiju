import * as THREE from 'three';
import { StructureRayQuery } from './structureRayQuery.js';

const MELEE_REACH=18, STOMP_RADIUS=5.5, PUNCH_RADIUS=3.8;

// Role selects attacks: jumping infantry remains a ground target.
export class LoneKaijuAI {
  constructor() {
    this.phase='approach';this.timer=2.2;this.attacks=0;this.pulse=0;
    this.target=new THREE.Vector3();this.lastPlayer=new THREE.Vector3();
    this.velocity=new THREE.Vector3();this.origin=new THREE.Vector3();
    this.direction=new THREE.Vector3();this.impact=new THREE.Vector3();
    this.ray=new THREE.Ray();this.hit=new THREE.Vector3();this.coverQuery=new StructureRayQuery();
    this.initialized=false;this.hitPlayer=false;this.kind='stomp';this.meleeAttacks=0;
  }
  update(s,dt) {
    const {world,pos,state}=s,k=state.kaiju,kp=k.root.position,flying=s.role==='helicopter';
    if(!flying&&this.kind==='beam'&&this.phase!=='approach') {
      this.phase='approach';this.timer=0;this.kind='stomp';
    }
    if(!this.initialized){this.lastPlayer.copy(pos);this.initialized=true;}
    this.velocity.copy(pos).sub(this.lastPlayer).divideScalar(Math.max(dt,.001)).clampLength(0,28);
    this.lastPlayer.copy(pos);
    let distance=Math.hypot(pos.x-kp.x,pos.z-kp.z);
    const facing=this.phase==='windup'||this.phase==='attack'?this.target:pos;
    const yaw=Math.atan2(facing.x-kp.x,facing.z-kp.z);
    k.root.rotation.y+=Math.atan2(Math.sin(yaw-k.root.rotation.y),Math.cos(yaw-k.root.rotation.y))*Math.min(1,dt*3);
    const stopDistance=flying?65:12;
    const moving=this.phase==='approach'&&distance>stopDistance;
    if(moving){const step=Math.min(distance-stopDistance,dt*11);kp.x+=Math.sin(yaw)*step;kp.z+=Math.cos(yaw)*step;distance-=step;}
    if(this.phase==='approach'||this.phase==='recover')k.glb?.play(moving?'walk':'idle');
    k.mixer?.update(dt);world.kaijuPos=kp;
    world.buildingGrid?.forEachNear(kp.x,kp.z,35,b=>{
      if(!b.destroyed&&Math.abs(kp.x-b.x)<b.w/2+10&&Math.abs(kp.z-b.z)<b.d/2+10)b.damage(100*dt,kp,world);
    });
    this.timer=Math.max(0,this.timer-dt);
    if(this.phase==='approach'&&this.timer===0&&(flying||distance<=MELEE_REACH)) {
      this.kind=flying?'beam':this.meleeAttacks++%2===0?'stomp':'punch';
      this.phase='windup';this.timer=flying?1.3:this.kind==='stomp'?1.05:.75;
      this.target.copy(pos);if(flying)this.target.addScaledVector(this.velocity,.25);
      this.hitPlayer=false;this.strikeResolved=false;this.impactShown=false;this.pulse=0;this.attacks++;
      k.glb?.playOnce(flying?'skill1':this.kind,.12,1,{duration:this.timer+(flying?1.05:.35)});
      if(flying)world.spawnKaijuCharge?.(k.head,this.timer);
      world.spawnBossTelegraph?.(this.target.clone().setY(.2),flying?9:this.kind==='stomp'?STOMP_RADIUS:PUNCH_RADIUS,this.timer);
    } else if(this.phase==='windup'&&this.timer===0) {
      this.phase='attack';this.timer=this.kind==='beam'?1.05:.35;
      if(this.kind!=='beam')this.strike(s);
    } else if(this.phase==='attack') {
      this.pulse-=dt;
      if(this.kind==='beam'&&this.pulse<=0){this.beam(s);this.pulse=.18;}
      if(this.timer===0){this.phase='recover';this.timer=1.15;}
    } else if(this.phase==='recover'&&this.timer===0) {
      this.phase='approach';this.timer=s.kaijuHP<s.maxKaijuHP*.4?1:1.5;
    }
    s.warning=this.phase==='windup'?this.timer:0;
    s.attackLabel=this.kind==='stomp'?'STOMP — MOVE OR JUMP':this.kind==='punch'?'PUNCH — DODGE SIDEWAYS':'AIMED BEAM — KEEP MOVING';
  }
  strike(s) {
    if(s.role==='helicopter'||this.strikeResolved)return;
    this.strikeResolved=true;
    const {world,pos,state}=s,kp=state.kaiju.root.position,stomp=this.kind==='stomp';
    const radius=stomp?STOMP_RADIUS:PUNCH_RADIUS;
    this.impact.copy(this.target).setY(.25);
    this.origin.copy(kp);this.origin.y+=stomp?2:7;
    this.direction.copy(stomp?this.impact:this.target).sub(this.origin);
    const reach=this.direction.length();this.direction.normalize();this.ray.set(this.origin,this.direction);
    const cover=this.coverQuery.nearest(world,this.ray,reach,true)?.building;
    if(cover)cover.damage(stomp?180:140,this.impact,world);
    if(stomp)world.spawnShockwave?.(this.impact.clone(),0xe4b47c,radius);
    world.spawnDustBurst?.(this.impact.clone(),radius,stomp?12:8);
    const feet=pos.y-(s.unit?.eye??(s.role==='tank'?3.4:1.8));
    const inHeight=stomp?feet<=.65:Math.abs(pos.y-this.target.y)<3.2;
    if(!cover&&inHeight&&Math.hypot(pos.x-kp.x,pos.z-kp.z)<=MELEE_REACH+2&&Math.hypot(pos.x-this.target.x,pos.z-this.target.z)<radius) {
      s.hp-=s.role==='tank'?(stomp?60:45):(stomp?32:24);this.hitPlayer=true;
    }
    world.buildingGrid?.forEachNear(this.impact.x,this.impact.z,radius+20,b=>{
      if(b.destroyed||b===cover)return;
      const dx=Math.max(0,Math.abs(b.x-this.impact.x)-b.w/2),dz=Math.max(0,Math.abs(b.z-this.impact.z)-b.d/2);
      if(dx*dx+dz*dz<radius*radius)b.damage(stomp?180:140,this.impact,world);
    });
  }
  beam(s) {
    if(s.role!=='helicopter')return;
    const {world,state,pos}=s;
    state.kaiju.root.updateMatrixWorld(true);state.kaiju.head.getWorldPosition(this.origin);
    this.direction.copy(this.target).sub(this.origin).normalize();this.ray.set(this.origin,this.direction);
    let reach=Math.min(500,this.origin.distanceTo(this.target)+18);
    const cover=this.coverQuery.nearest(world,this.ray,reach,true)?.building;
    if(cover)reach=this.coverQuery.result.distance;
    this.impact.copy(this.origin).addScaledVector(this.direction,reach);
    world.spawnBeam(this.origin.clone(),this.direction.clone(),reach,0x75dfff,0xb2f5ff);
    const along=this.hit.copy(pos).sub(this.origin).dot(this.direction);
    if(!this.hitPlayer&&along>=0&&along<reach+(cover?0:2)&&this.ray.distanceSqToPoint(pos)<16) {
      s.hp-=35;this.hitPlayer=true;
    }
    if(cover)cover.damage(35,this.impact,world);
    if(!this.impactShown){
      if(world.spawnEnergyImpact)world.spawnEnergyImpact(this.impact.clone(),this.direction.clone().negate());
      else world.spawnExplosion(this.impact.clone(),.8);
      this.impactShown=true;
    }
  }
}
