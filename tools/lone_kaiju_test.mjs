import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LoneKaijuAI } from '../src/loneKaijuAI.js';

function scenario(role='infantry',distance=85) {
  const root=new THREE.Group(),head=new THREE.Object3D();head.position.y=18;root.add(head);
  const events={beams:0,slams:0};
  const s={role,pos:new THREE.Vector3(0,role==='helicopter'?23:2,distance),hp:10000,
    kaijuHP:2400,maxKaijuHP:2400,state:{kaiju:{root,head}},
    world:{buildings:[],spawnBeam(){events.beams++;},spawnExplosion(){},spawnShockwave(){events.slams++;}}};
  const ai=new LoneKaijuAI();
  return {s,ai,events,step(seconds,move=()=>{}){for(let t=0;t<seconds;t+=1/60){move(s,ai);ai.update(s,1/60);assert.ok(s.warning>=0);}}};
}
test('Kaiju repeatedly attacks infantry, tank and helicopter for a full minute',()=>{
  for(const role of ['infantry','tank','helicopter']) {
    const q=scenario(role);q.step(60);
    assert.ok(q.ai.attacks>=8,`${role}: ${q.ai.attacks} attacks`);
    assert.ok(q.events.beams>12);assert.ok(q.s.hp<10000);
    if(role!=='helicopter')assert.ok(q.events.slams>1);
    else assert.equal(q.events.slams,0);
  }
});
test('locked beam target can be dodged and each burst damages only once',()=>{
  const still=scenario('helicopter',85);still.step(4.7);
  assert.ok(still.events.beams>=4);assert.equal(still.s.hp,9965);
  const dodge=scenario('helicopter',85);
  dodge.step(4.7,(s,ai)=>{if(ai.phase==='windup')s.pos.x+=.7;});
  assert.equal(dodge.s.hp,10000);
});
test('solid cover intercepts the beam; destroyed cover allows later bursts through',()=>{
  const q=scenario('helicopter',85);
  const wall={x:0,z:65,w:40,d:8,h:50,destroyed:false,damage(){}};
  q.s.world.buildings.push(wall);q.step(4.7);assert.equal(q.s.hp,10000);
  wall.destroyed=true;q.step(7);assert.ok(q.s.hp<10000);
});
