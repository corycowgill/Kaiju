import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowdRoutes } from '../src/levels/crowdRoutes.js';
import { animateCrowd } from '../src/levels/festivalCrowd.js';

test('exit fields route around a long wall and shorten after it is destroyed',()=>{
  let destroyed=false;
  const blocked=(x,z)=>!destroyed&&Math.abs(x)<1&&Math.abs(z)<12;
  const routes=createCrowdRoutes([-8,0],[{x:15,z:0}],blocked);
  const before=routes.distance(0,-8,0);
  assert.ok(before>35&&before<65,'route goes around wall ends');
  let x=-8,z=0;
  for(let t=0;t<600&&Math.hypot(x-15,z)>2;t++){
    const v=routes.direction(0,x,z);assert.ok(v,'connected route');
    const d=Math.hypot(v.x,v.z);x+=v.x/d*.12;z+=v.z/d*.12;
    assert.ok(!blocked(x,z),'never crosses wall');
  }
  assert.ok(Math.hypot(x-15,z)<2,'reaches exit');
  destroyed=true;routes.rebuild();
  assert.ok(routes.distance(0,-8,0)<before-15,'destroyed structures open shorter routes');
});

function crowd(points,world,buildings=[],gates=[]){
  const count=points.length/2,geometry=new THREE.BoxGeometry(.3,1,.2);
  const im=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),count),pose=new THREE.Object3D();
  for(let i=0;i<count;i++){pose.position.set(points[i*2],.04,points[i*2+1]);pose.updateMatrix();im.setMatrixAt(i,pose.matrix);}
  const c={im,pts:points.slice(),alive:new Uint8Array(count).fill(1)};
  const animator=animateCrowd(c,{world,buildings,gates,bounds:{minX:-80,maxX:80,minZ:-60,maxZ:60},isWater:()=>false});
  return {c,animator};
}

test('fleeing attendees separate and react at different times',()=>{
  const points=[];for(let i=0;i<20;i++)points.push(5+(i%5)*.18,Math.floor(i/5)*.18);
  const {c,animator}=crowd(points,{kaijuPos:new THREE.Vector3()});
  let staggered=false;
  for(let tick=0;tick<90;tick++){
    animator.update(1/30);
    const moved=c.alive.reduce((sum,_,i)=>sum+(Math.hypot(c.pts[i*2]-points[i*2],c.pts[i*2+1]-points[i*2+1])>.08),0);
    if(moved>0&&moved<20)staggered=true;
  }
  const closePairs=pts=>{let n=0;for(let i=0;i<20;i++)for(let j=i+1;j<20;j++)if(Math.hypot(pts[i*2]-pts[j*2],pts[i*2+1]-pts[j*2+1])<.4)n++;return n;};
  assert.ok(staggered,'reactions are staggered rather than synchronized');
  assert.ok(closePairs(c.pts)<closePairs(points)/2,'dense overlaps disperse');
});

test('crowd movement uses the route around fences and retires at exits',()=>{
  const wall={x:0,z:0,w:1,d:20};
  const {c,animator}=crowd([-8,0],{kaijuPos:new THREE.Vector3(-35,0,0)},[wall],[{x:18,z:0,w:4}]);
  for(let i=0;i<900&&c.alive[0];i++){
    animator.update(1/30);
    assert.ok(!(Math.abs(c.pts[0])<.8&&Math.abs(c.pts[1])<10.3),'stays outside fence collider');
  }
  assert.equal(c.alive[0],0,'escapes through exit instead of endlessly running into a fence');
});
