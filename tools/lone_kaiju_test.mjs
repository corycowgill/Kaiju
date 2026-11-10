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
