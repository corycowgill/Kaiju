import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LoneKaijuAI } from '../src/loneKaijuAI.js';

function scenario(role='infantry',distance=85) {
  const root=new THREE.Group(),head=new THREE.Object3D();head.position.y=18;root.add(head);
  const events={beams:0,slams:0,charges:0,animations:[]};
  const eye=role==='helicopter'?23:role==='tank'?3.4:1.8;
  const s={role,unit:{eye},pos:new THREE.Vector3(0,eye,distance),hp:10000,
    kaijuHP:2400,maxKaijuHP:2400,state:{kaiju:{root,head,glb:{play(){},playOnce(name){events.animations.push(name);}}}},
    world:{buildings:[],spawnBeam(){events.beams++;},spawnExplosion(){},spawnKaijuCharge(){events.charges++;},spawnShockwave(){events.slams++;}}};
  const ai=new LoneKaijuAI();
  const frame=()=>{ai.update(s,1/60);assert.ok(s.warning>=0);};
  return {s,ai,events,frame,step(seconds,move=()=>{}){for(let i=0;i<Math.round(seconds*60);i++){move(s,ai);frame();}},
    until(predicate){for(let i=0;i<1800;i++){if(predicate(ai))return;frame();}assert.fail('phase not reached');}};
}

test('full minute: infantry and tanks receive only melee; helicopters receive only ranged powers',()=>{
  for(const role of ['infantry','tank','helicopter']) {
    const q=scenario(role);q.step(60);
    assert.ok(q.ai.attacks>=8,`${role}: ${q.ai.attacks} attacks`);assert.ok(q.s.hp<10000);
    if(role!=='helicopter') {
      assert.equal(q.events.beams,0);assert.equal(q.events.charges,0);
      assert.ok(q.events.slams>1);
      assert.ok(q.events.animations.includes('punch'));assert.ok(q.events.animations.includes('stomp'));
      assert.ok(!q.events.animations.includes('skill1'));
    } else {
      assert.ok(q.events.beams>12);assert.ok(q.events.charges>1);assert.equal(q.events.slams,0);
      assert.deepEqual([...new Set(q.events.animations)],['skill1']);
    }
  }
});

test('ground kaiju closes to physical reach before warning or dealing damage',()=>{
  const q=scenario();q.step(4);
  assert.equal(q.ai.attacks,0);assert.equal(q.s.hp,10000);assert.equal(q.s.warning,0);
  assert.ok(q.s.state.kaiju.root.position.z>40);
  q.until(ai=>ai.phase==='windup');
  assert.ok(q.s.pos.distanceTo(q.s.state.kaiju.root.position)<19);
});

test('stomp and punch each damage once, with separate infantry and tank damage values',()=>{
  for(const [role,stomp,punch] of [['infantry',32,24],['tank',60,45]]) {
    const q=scenario(role,15);q.until(ai=>ai.phase==='attack');
    assert.equal(q.s.hp,10000-stomp);q.step(.4);assert.equal(q.s.hp,10000-stomp);
    q.until(ai=>ai.phase==='attack'&&ai.kind==='punch');
    assert.equal(q.s.hp,10000-stomp-punch);
    q.ai.strike(q.s);q.step(.4);assert.equal(q.s.hp,10000-stomp-punch);
  }
});

test('locked stomp and punch targets can both be dodged at infantry movement speed',()=>{
  for(const kind of ['stomp','punch']) {
    const q=scenario('infantry',15);if(kind==='punch')q.ai.meleeAttacks=1;
    q.until(ai=>ai.phase==='windup');const locked=q.ai.target.clone();
    q.step(1.5,(s,ai)=>{if(ai.phase==='windup')s.pos.x+=9/60;});
    assert.deepEqual(q.ai.target,locked);assert.equal(q.s.hp,10000);
  }
});

test('timed infantry jump avoids stomp without triggering ranged powers',()=>{
  const q=scenario('infantry',15);q.until(ai=>ai.phase==='windup');
  // Real jump parameters: v=7.5, gravity=24. Begin 0.3 seconds before impact.
  let jumpTime=-1;
  q.step(1.5,(s,ai)=>{
    if(jumpTime<0&&ai.phase==='windup'&&ai.timer<.3)jumpTime=0;
    if(jumpTime>=0){jumpTime+=1/60;s.pos.y=s.unit.eye+Math.max(0,7.5*jumpTime-12*jumpTime*jumpTime);}
  });
  assert.equal(q.s.hp,10000);assert.equal(q.events.beams,0);assert.equal(q.events.charges,0);
});

test('solid cover intercepts physical attacks; destroyed cover allows a later hit',()=>{
  const q=scenario('infantry',18);let damaged=0;
  const wall={x:0,z:15,w:10,d:1,h:20,destroyed:false,damage(amount){damaged+=amount;}};
  q.s.world.buildings.push(wall);q.until(ai=>ai.phase==='attack');
  assert.equal(q.s.hp,10000);assert.equal(damaged,180);
  wall.destroyed=true;q.until(ai=>ai.phase==='attack'&&ai.kind==='punch');assert.equal(q.s.hp,9976);
});

test('locked beam target can be dodged and each burst damages only once',()=>{
  const still=scenario('helicopter',85);still.step(4.7);
  assert.ok(still.events.beams>=4);assert.equal(still.s.hp,9965);
  const dodge=scenario('helicopter',85);
  dodge.step(4.7,(s,ai)=>{if(ai.phase==='windup')s.pos.x+=9/60;});
  assert.equal(dodge.s.hp,10000);
});

test('solid cover intercepts beam; destroyed cover allows later bursts through',()=>{
  const q=scenario('helicopter',85);
  const wall={x:0,z:65,w:40,d:8,h:50,destroyed:false,damage(){}};
  q.s.world.buildings.push(wall);q.step(4.7);assert.equal(q.s.hp,10000);
  wall.destroyed=true;q.step(7);assert.ok(q.s.hp<10000);
});

test('low helicopter still draws ranged power and switching to infantry cancels a charged beam',()=>{
  const low=scenario('helicopter');low.s.pos.y=8;low.step(4.7);
  assert.ok(low.events.beams>0);assert.equal(low.events.slams,0);
  const q=scenario('helicopter');q.until(ai=>ai.phase==='windup');
  q.s.role='infantry';q.s.unit.eye=1.8;q.s.pos.y=1.8;q.step(8);
  assert.equal(q.events.beams,0);assert.ok(q.events.animations.includes('stomp'));
  const hp=q.s.hp;q.ai.beam(q.s);assert.equal(q.s.hp,hp);assert.equal(q.events.beams,0);
});

test('a thin wall immediately ahead of the helicopter still blocks beam damage',()=>{
  const q=scenario('helicopter',85);
  q.s.world.buildings.push({x:0,z:84.5,w:20,d:.4,h:40,destroyed:false,damage(){}});
  q.step(4.7);assert.ok(q.events.beams>0);assert.equal(q.s.hp,10000);
});

import { KaijuPursuit } from '../src/kaijuPursuit.js';
import { prepareMeleeAnimations } from '../src/kaijuMelee.js';

test('pursuit routes around a standing building without crossing its footprint',()=>{
  const wall={x:0,z:36,w:30,d:8,h:20,destroyed:false},world={buildings:[wall]};
  const pos=new THREE.Vector3(),target=new THREE.Vector3(0,1.8,85),nav=new KaijuPursuit();
  let widest=0;
  for(let i=0;i<1200&&pos.distanceTo(target)>17;i++){
    const old=pos.clone();nav.move(world,pos,target,1/60);
    assert.ok(pos.distanceTo(old)<=11/60+1e-6);
    assert.ok(!(Math.abs(pos.x)<wall.w/2+4&&Math.abs(pos.z-wall.z)<wall.d/2+4));
    widest=Math.max(widest,Math.abs(pos.x));
  }
  assert.ok(widest>=19);assert.ok(pos.distanceTo(target)<17);assert.ok(nav.plans<25,'routes are cached');
});

test('pursuit takes dry route around inlet and stays inside map bounds',()=>{
  const world={buildings:[],bounds:{minX:-70,maxX:70,minZ:-40,maxZ:120},isWater:(x,z)=>Math.abs(x)<20&&z>30&&z<45};
  const pos=new THREE.Vector3(),target=new THREE.Vector3(0,2,85),nav=new KaijuPursuit();
  for(let i=0;i<1200&&pos.distanceTo(target)>17;i++){
    nav.move(world,pos,target,1/60);assert.ok(!world.isWater(pos.x,pos.z));assert.ok(Math.abs(pos.x)<=66);
  }
  assert.ok(pos.distanceTo(target)<17);
});

test('destroyed building immediately reopens a direct route; long frames cannot tunnel',()=>{
  const wall={x:0,z:20,w:25,d:1,h:20,destroyed:false},world={buildings:[wall]};
  const pos=new THREE.Vector3(),target=new THREE.Vector3(0,2,80),nav=new KaijuPursuit();
  nav.move(world,pos,target,4);assert.ok(!(Math.abs(pos.x)<16.5&&Math.abs(pos.z-20)<4.5));
  wall.destroyed=true;pos.set(0,0,0);nav.move(world,pos,target,1);
  assert.equal(pos.x,0);assert.equal(pos.z,11);
});

test('unreachable shore target never pulls kaiju into water',()=>{
  const world={buildings:[],isWater:(x,z)=>z>20},pos=new THREE.Vector3(),target=new THREE.Vector3(0,23,100),nav=new KaijuPursuit();
  for(let i=0;i<600;i++){nav.move(world,pos,target,1/60,65);assert.ok(pos.z<=20);}
  assert.ok(nav.plans<=14);
});

test('kaiju backs away from a close player without moving a committed attack',()=>{
  const q=scenario('infantry',5);q.ai.timer=10;q.step(.5);
  assert.ok(q.s.pos.distanceTo(q.s.state.kaiju.root.position)>7.5);
  q.ai.timer=0;q.until(ai=>ai.phase==='windup');
  const root=q.s.state.kaiju.root.position.clone();q.s.pos.copy(root).add(new THREE.Vector3(0,1.8,1));
  q.step(.5);assert.deepEqual(q.s.state.kaiju.root.position,root);
});

test('animation contact marker controls impact time and follow-through',()=>{
  const q=scenario('infantry',15);let elapsed=0,played,impacts=0;
  q.s.state.kaiju.glb.melee={stomp:{name:'meleeStomp',contact:.8,duration:1.8}};
  q.s.state.kaiju.glb.playOnce=(name,fade,speed,options)=>{played={name,...options};};
  q.s.state.kaiju.mixer={update(dt){if(played)elapsed+=dt;}};
  q.s.meleeImpact=()=>impacts++;
  q.until(ai=>ai.phase==='windup');q.until(ai=>ai.phase==='attack');
  assert.equal(played.name,'meleeStomp');
  assert.ok(Math.abs(elapsed/played.duration-.8/1.8)<.015);
  assert.ok(q.ai.timer>1);assert.equal(impacts,1);
  q.step(.4);assert.equal(impacts,1);assert.equal(q.ai.phase,'attack');
});

test('all monster melee clips retain a valid contact marker within the shortened animation',()=>{
  const track=new THREE.NumberKeyframeTrack('.position[x]',[0,.5,1,1.5,2,2.5,4,8],[0,1,0,1,0,1,0,0]);
  for(const key of ['godzilla','ghidorah','mecha']){
    const original={stomp:new THREE.AnimationClip('stomp',key==='godzilla'?1.833333:8.033333,[track]),punch:new THREE.AnimationClip('punch',2.5,[track])};
    const motions=prepareMeleeAnimations(original,key);
    for(const motion of Object.values(motions)){assert.ok(motion.contact>0);assert.ok(motion.contact<motion.duration);}
    if(key!=='godzilla')assert.ok(motions.stomp.duration<2,'extra stomp gestures are trimmed');
    assert.equal(original.stomp.name,'stomp','rampage clips stay intact');
  }
});

test('a kaiju spawned in the harbor can wade ashore before dry-land routing takes over',()=>{
  const world={buildings:[],isWater:(x,z)=>z<0},pos=new THREE.Vector3(0,0,-30),target=new THREE.Vector3(0,1.8,40),nav=new KaijuPursuit();
  for(let i=0;i<600;i++)nav.move(world,pos,target,1/60);
  assert.ok(pos.z>0);assert.ok(pos.distanceTo(target)<17);
  const shore=pos.z;nav.move(world,pos,new THREE.Vector3(0,0,-50),10,0);
  assert.ok(pos.z>=0);assert.ok(pos.z<shore);
});
