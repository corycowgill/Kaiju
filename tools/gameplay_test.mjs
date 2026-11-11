import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { resolveStructureContact } from '../src/buildingCollision.js';
import { crowdGeometry, crowdMaterial, animateCrowd } from '../src/levels/festivalCrowd.js';
import { followSoldierShadow, applyEnvironmentStrength, structureClearance, soldierSunExposure } from '../src/firstPersonLighting.js';
import { buildChicagoWear } from '../src/levels/chicagoWear.js';
import { chooseSoldierSpawn } from '../src/soldierSpawn.js';
import { BuildingGrid } from '../src/buildingGrid.js';
import { StructureRayQuery, cameraFollowAlpha } from '../src/structureRayQuery.js';

globalThis.window = { innerWidth: 1440, innerHeight: 900 };
globalThis.location = { search: '?q=high' };
globalThis.localStorage = { getItem: () => null };
const effects = await import('../src/effects.js');
const vfx = await import('../src/vfx.js');
vfx.registerAllBuilders(effects);
const {planParkGroves,festivalCrowdWeight}=await import('../src/levels/chicagoLandscape.js');

test('grid cover queries retain wide resized buildings, destroyed cover and inside-origin rules',()=>{
  const grid=new BuildingGrid(60),small={x:30,z:0,w:8,d:8,h:12},wide={x:80,z:100,w:20,d:20,h:30};
  grid.add(small);grid.add(wide);
  const world={buildings:[small,wide],buildingGrid:grid},query=new StructureRayQuery(),ray=new THREE.Ray(new THREE.Vector3(-20,5,0),new THREE.Vector3(1,0,0));
  assert.equal(query.nearest(world,ray,200).building,small);
  small.destroyed=true;assert.equal(query.nearest(world,ray,200),null);
  wide.d=220;grid.expandBounds(wide);
  assert.equal(query.nearest(world,ray,200).building,wide,'off-ray centre is retained after bounds change');
  ray.origin.set(80,5,0);
  assert.equal(query.nearest(world,ray,30).distance,10,'shots exit cover containing the origin');
  assert.equal(query.nearest(world,ray,30,true),null,'camera ignores containing cover');
  grid.remove(wide);assert.equal(query.nearest(world,ray,200),null);
});

test('grid ray queries match exhaustive hits for diagonal, parallel and vertical rays',()=>{
  const grid=new BuildingGrid(40),buildings=[];
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++) {
    const b={x:x*25,z:z*25,w:5+(x+8)%7,d:8+(z+8)%9,h:6+(x*z+64)%24};grid.add(b);buildings.push(b);
  }
  const indexed=new StructureRayQuery(),reference=new StructureRayQuery();
  for(let i=0;i<180;i++) {
    const origin=new THREE.Vector3(Math.sin(i*3.17)*180,2+i%40,Math.cos(i*1.73)*180);
    const direction=i%9===0?new THREE.Vector3(0,-1,0):i%9===1?new THREE.Vector3(-1,0,0):new THREE.Vector3(Math.sin(i*.37),Math.sin(i*.11)*.3,Math.cos(i*.37)).normalize();
    const ray=new THREE.Ray(origin,direction),a=indexed.nearest({buildings,buildingGrid:grid},ray,250,i%2===0),b=reference.nearest({buildings},ray,250,i%2===0);
    assert.equal(a?.building,b?.building,`ray ${i}`);
    if(a)assert.ok(Math.abs(a.distance-b.distance)<1e-8);
  }
});

test('short camera rays test a local subset of a ten-thousand-building city',()=>{
  const grid=new BuildingGrid(60),buildings=[];
  for(let x=-50;x<50;x++)for(let z=-50;z<50;z++) {
    const b={x:x*20,z:z*20,w:8,d:8,h:20};grid.add(b);buildings.push(b);
  }
  const query=new StructureRayQuery();query.nearest({buildings,buildingGrid:grid},new THREE.Ray(new THREE.Vector3(0,5,0),new THREE.Vector3(.3,0,.95).normalize()),51,true);
  assert.ok(query.candidates>0&&query.candidates<100,`${query.candidates} candidates of ${buildings.length}`);
});

test('camera follow has the same response at 30, 60 and 144 Hz',()=>{
  assert.ok(Math.abs(cameraFollowAlpha(1/60)-.18)<1e-12);
  const positions=[30,60,144].map(fps=>{let p=0;for(let i=0;i<fps;i++)p+=(1-p)*cameraFollowAlpha(1/fps);return p;});
  assert.ok(Math.abs(positions[0]-positions[1])<1e-12&&Math.abs(positions[1]-positions[2])<1e-12);
  assert.equal(cameraFollowAlpha(0),0);
});

test('Chicago groves are deterministic, bounded and respect exclusion areas',()=>{
  const parks=[{name:'Grant Park',kind:'lawn',polygon:[[0,0],[100,0],[100,100],[0,100]]}];
  const allowed=(x,z)=>x>0&&x<100&&z>0&&z<100&&!(x>40&&x<60);
  const trees=planParkGroves(parks,allowed);
  assert.ok(trees.length>10&&trees.length<=150);
  assert.deepEqual(planParkGroves(parks,allowed),trees);
  for(const p of trees){assert.ok(allowed(p.x,p.z));assert.ok(Math.min(p.x,100-p.x,p.z,100-p.z)<8);}
  assert.ok(planParkGroves(parks,allowed,true).length<=64);
  assert.deepEqual(planParkGroves(parks,()=>false),[]);
});

test('festival crowd density favors stages and retains aisles under rotation',()=>{
  const stage={x:0,z:0,rot:0,w:10};
  assert.ok(festivalCrowdWeight(4,8,stage,100)>festivalCrowdWeight(4,80,stage,100)*4);
  assert.equal(festivalCrowdWeight(0,20,stage,100),0,'central access aisle');
  assert.equal(festivalCrowdWeight(4,-8,stage,100),0,'backstage stays clear');
  assert.ok(Math.abs(festivalCrowdWeight(8,-4,{...stage,rot:Math.PI/2},100)-festivalCrowdWeight(4,8,stage,100))<1e-6);
});

test('soldier deployment avoids water, building footprints and blocked sightlines',()=>{
  const target=new THREE.Vector3(),wall={x:0,z:40,w:80,d:8,h:30};
  const world={scene:new THREE.Scene(),bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},buildings:[wall],isWater:(x,z)=>x>0};
  const spawn=chooseSoldierSpawn(world,target,1.8);
  assert.ok(spawn.x<=0&&!world.isWater(spawn.x,spawn.z));
  const ray=new THREE.Ray(spawn,new THREE.Vector3(0,12,0).sub(spawn).normalize());
  const box=new THREE.Box3(new THREE.Vector3(-40,0,36),new THREE.Vector3(40,30,44));
  assert.equal(ray.intersectBox(box,new THREE.Vector3()),null,'opening target is not behind the wall');
});

test('soldier deployment rejects a clear-ground position hidden behind a tree canopy',()=>{
  const world={scene:new THREE.Scene(),bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},buildings:[]};
  const target=new THREE.Vector3(),before=chooseSoldierSpawn(world,target,1.8);
  assert.equal(before.x,85);assert.equal(before.z,0);
  const geometry=new THREE.SphereGeometry(4,8,6);geometry.userData.soldierOccluder=true;
  const trees=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),1);
  trees.setMatrixAt(0,new THREE.Matrix4().makeTranslation(70,5,0));world.scene.add(trees);
  const after=chooseSoldierSpawn(world,target,1.8);
  assert.ok(Math.abs(after.z)>3,'chooses another sightline instead of spawning behind foliage');
  assert.ok(Math.abs(after.length()-before.length())<.001,'keeps engagement distance');
  geometry.dispose();trees.material.dispose();trees.dispose();
});

const structure = (h, extra = {}) => ({ x: 0, z: 0, w: 4, d: 4, h, hp: 50,
  damage(n) { this.hp -= n; if (this.hp <= 0) this.destroyed = true; }, ...extra });
test('low structures and fences collapse without stealing movement; bridges stay solid', () => {
  for (const b of [structure(.7), structure(6), structure(10, { isFence: true })]) {
    const p = new THREE.Vector3(7, 0, 0);
    resolveStructureContact(p, 8.1, b, 1 / 60, {}, new THREE.Vector3());
    assert.equal(b.destroyed, true); assert.equal(p.x, 7);
  }
  const bridge = structure(1, { isBridge: true }), p = new THREE.Vector3(7, 0, 0);
  resolveStructureContact(p, 8.1, bridge, 1 / 60, {}, new THREE.Vector3());
  assert.ok(p.x > 10); assert.ok(!bridge.destroyed);
});
test('tall buildings block at corners and release on the lethal frame', () => {
  const p = new THREE.Vector3(7, 0, 7), b = structure(30);
  resolveStructureContact(p, 8.1, b, .01, {}, new THREE.Vector3());
  assert.ok(Math.hypot(p.x - 2, p.z - 2) >= 8.1 - 1e-6);
  const dying = structure(30, { hp: .01 }), q = new THREE.Vector3(7, 0, 0);
  resolveStructureContact(q, 8.1, dying, .1, {}, new THREE.Vector3());
  assert.equal(q.x, 7); assert.equal(dying.destroyed, true);
});

test('multi-mesh powers clean up on natural expiry AND budget retirement', () => {
  for (const legacy of [false, true]) for (const retire of [false, true]) {
    for (const maker of ['makeBeam', 'makeChainLightning', 'makeAtomicDome', 'makeAtomicDevastation',
      'makeSoundWaveRings', 'makeBreathCone', 'makeWindStreaks', 'makeDustBurst', 'makeAfterburnerTrail',
      'makeWingSlash', 'makeTailSweep', 'makeWingFlap', 'makeMissileLaunchFlash', 'makeMissileSwarm']) {
      const scene = new THREE.Scene(), world = { scene, effects: [] };
      const a = new THREE.Vector3(0, 10, 0), b = new THREE.Vector3(20, 2, 0);
      const fn = legacy ? effects['_' + maker + 'Legacy'] || effects[maker] : effects[maker];
      const args = {
        makeBeam: [world, a, b.clone().normalize(), 30, 0x44aaff, 0xffffff],
        makeChainLightning: [world, a, b], makeBreathCone: [world, a, b.clone().normalize()],
        makeWindStreaks: [world, a, b.clone().normalize()], makeAfterburnerTrail: [world, a, b],
        makeWingSlash: [world, a, 0], makeTailSweep: [world, a, 0], makeWingFlap: [world, a, 1],
      }[maker] || [world, a];
      const fx = fn(...args);
      const spawned = fx ? [fx] : world.effects;
      assert.ok(spawned.length, `${maker} spawned no effects`);
      for (const e of spawned) {
        e.tick(.01);
        if (retire) effects.finishEffect(e); else e.tick(100);
      }
      const remaining = scene.children.filter(o => !o.isLight);
      assert.equal(remaining.length, 0, `${maker} legacy=${legacy} retire=${retire}: ${remaining.map(o => o.type)}`);
      for (const e of spawned) effects.finishEffect(e); // idempotent
    }
  }
});

test('festival crowd reacts, moves away, stays on land, and stops animating after a hit', () => {
  const geom = crowdGeometry(), mat = crowdMaterial({ value: 0 });
  const im = new THREE.InstancedMesh(geom, mat, 1), pose = new THREE.Object3D();
  pose.position.set(3, .04, 0); pose.updateMatrix(); im.setMatrixAt(0, pose.matrix);
  const c = { im, pts: [3, 0], alive: new Uint8Array([1]) };
  const animator = animateCrowd(c, { world: { kaijuPos: new THREE.Vector3() }, buildings: [], gates: [],
    isWater: (x) => x > 7, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } });
  for (let i = 0; i < 120; i++) animator.update(1 / 30);
  assert.ok(Math.hypot(...c.pts) > 3); assert.ok(c.pts[0] <= 7);
  c.alive[0] = 0; const before = [...c.pts]; animator.update(1 / 30);
  assert.deepEqual(c.pts, before); assert.equal(geom.getAttribute('crowdMotion').getZ(0), 0);
});

test('power missile volleys launch above ground, impact once and retire without detonating', () => {
  for (const cancel of [false, true]) {
    const scene = new THREE.Scene(), hits = [];
    const world = { scene, effects: [], spawnExplosion: p => hits.push(p) };
    effects.makeMissileSwarm(world, new THREE.Vector3(), 60, 8);
    assert.equal(world.effects.length, 1, 'one managed volley, not an emitter per rocket');
    const volley = world.effects[0];
    const bodies = [];
    scene.traverse(o => { if (o.name === 'power_missile') bodies.push(o); });
    assert.equal(bodies.length, 8);
    assert.ok(bodies.every(o => o.position.y >= 12));
    if (cancel) effects.finishEffect(volley);
    for (let i = 0; i < 180; i++) volley.tick(1 / 60);
    assert.equal(hits.length, cancel ? 0 : 8);
    assert.ok(hits.every(p => Math.abs(p.y - .4) < .001));
    assert.equal(scene.children.length, 0);
  }
});

test('textured power layers stay batched and all instance values stay finite', () => {
  for (const name of ['beam', 'shockwave', 'soundRings', 'tailSweep', 'afterburner', 'atomicDevastation']) {
    const scene = new THREE.Scene(), world = { scene, effects: [], time: 0 };
    const fx = vfx.spawn(name, { world, origin: new THREE.Vector3(0, 20, 0), dir: new THREE.Vector3(0, 0, -1),
      pos: new THREE.Vector3(), args: [0, 60, 60, 1.4], length: 90,
      fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(20, 0, 0) });
    let meshes = 0;
    fx.mesh.traverse(o => { if (o.isMesh) meshes++; });
    assert.ok(meshes <= 4, `${name}: ${meshes} draw calls`);
    for (let f = 0; f < 20; f++) {
      fx.tick(1 / 60);
      fx.mesh.traverse(o => {
        for (const a of Object.values(o.geometry?.attributes || {})) assert.ok(a.array.every(Number.isFinite), `${name} non-finite vertex/instance data`);
      });
    }
    effects.finishEffect(fx); assert.equal(scene.children.length, 0);
  }
});

test('combat VFX remain bounded and clean up their geometry on expiry or retirement',()=>{
  for(const name of ['explosion','dustBurst','ballisticImpact','weaponTracer','kaijuCharge']) {
    for(const retire of [false,true]) {
      const scene=new THREE.Scene(),source=new THREE.Object3D();source.position.set(3,20,0);scene.add(source);
      const world={scene,effects:[],time:0};
      const fx=vfx.spawn(name,{world,pos:new THREE.Vector3(),origin:new THREE.Vector3(0,2,0),
        dir:new THREE.Vector3(0,0,-1),normal:new THREE.Vector3(0,0,1),length:300,source,args:[2,8]});
      assert.ok(fx,`${name} exists`);let draws=0,disposed=0;
      fx.mesh.traverse(o=>{if(o.isMesh){draws++;o.geometry.addEventListener('dispose',()=>disposed++);}});
      assert.ok(draws<=5,`${name}: ${draws} draws`);
      for(let i=0;i<12;i++) {
        source.position.x+=.1;fx.tick(1/60);
        fx.mesh.traverse(o=>{for(const a of Object.values(o.geometry?.attributes||{}))assert.ok(a.array.every(Number.isFinite),name);});
      }
      if(name==='kaijuCharge')assert.ok(Math.abs(fx.mesh.position.x-source.position.x)<.001,'charge follows animated source');
      if(retire)effects.finishEffect(fx);else fx.tick(20);
      assert.equal(fx.dead,true);assert.equal(fx.mesh.parent,null);assert.equal(disposed,draws,`${name}: geometry released`);
      effects.finishEffect(fx);assert.equal(disposed,draws,'retirement is idempotent');
      assert.equal(scene.children.filter(o=>o!==source&&!o.isLight).length,0);
    }
  }
});

// The new mode is independent of the normal kaiju wave loop.
import { LoneSoldier, UNITS } from '../src/loneSoldier.js';
test('Lone Soldier roles move, fire at the AI Kaiju, and respect cover', () => {
  const oldDocument=globalThis.document;
  const labels=new Map();
  globalThis.document={body:{append(){}},createElement:()=>({style:{},remove(){},innerHTML:''}),
    getElementById:id=>{if(!labels.has(id))labels.set(id,{textContent:'',innerHTML:''});return labels.get(id);}};
  try {
    for(const role of Object.keys(UNITS)) {
      const scene=new THREE.Scene(),root=new THREE.Mesh(new THREE.BoxGeometry(10,30,10),new THREE.MeshBasicMaterial());root.position.y=15;scene.add(root);
      const camera=new THREE.PerspectiveCamera();
      const state={kaiju:{root,head:root},yaw:0,pitch:0,score:0};
      const world={scene,bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},buildings:[],
        buildingGrid:{forEachNear(){}},isWater:()=>false,spawnBeam(){},spawnHitPulse(){},spawnSparks(){},spawnExplosion(){}};
      let result;const shots=[];
      world.spawnWeaponTracer=(origin,dir,length,unit)=>shots.push({origin,dir,length,unit});
      world.spawnBallisticImpact=(pos,normal,unit,kind)=>{world.lastImpact={pos,normal,unit,kind};};
      const mode=new LoneSoldier({world,state,camera,role,sound(){},finish:v=>result=v});
      state.pitch=Math.atan2(15-mode.pos.y,85);
      mode.shoot();assert.equal(mode.kaijuHP,2400-UNITS[role].damage,role+' should hit');
      assert.equal(shots.length,1);assert.equal(shots[0].unit,role);
      assert.ok(shots[0].length>0);assert.ok(Math.abs(shots[0].dir.length()-1)<1e-6);
      assert.equal(world.lastImpact.kind,'kaiju');
      mode.cooldown=0;world.buildings=[{x:40,z:0,w:10,d:10,h:100}];
      mode.shoot();assert.equal(mode.kaijuHP,2400-UNITS[role].damage,role+' cover blocks shot');
      assert.equal(world.lastImpact.kind,'concrete');
      const before=mode.pos.clone();
      mode.update(.1,{x:1,z:0,lookX:0,lookY:0,vertical:1,fire:false,sprint:false});
      assert.ok(mode.pos.distanceTo(before)>0);
      if(role==='helicopter')assert.ok(mode.pos.y>UNITS[role].eye);
      assert.ok(root.position.x>0,'AI pursues the player');
      world.buildings=[];
      const idle={x:0,z:0,lookX:0,lookY:0,vertical:0};
      const hp=mode.hp;let warned=false;
      for(let frame=0;frame<(role==='helicopter'?300:900);frame++){mode.update(1/60,idle);warned ||= mode.warning>0;}
      assert.ok(warned,'attack is telegraphed');
      assert.ok(mode.hp<hp,'stationary unit takes attack damage');
      mode.kaijuHP=0;mode.update(.01,{x:0,z:0,lookX:0,lookY:0,vertical:0});assert.equal(result,true);
      mode.dispose();assert.equal(camera.children.length,0);
    }
  } finally {globalThis.document=oldDocument;}
});

test('soldier target bounds follow translated and rotated kaiju between shots',()=>{
  const previous=globalThis.document,nodes=new Map();
  globalThis.document={body:{append(){}},createElement:()=>({remove(){},innerHTML:''}),
    getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
  try {
    const root=new THREE.Mesh(new THREE.BoxGeometry(4,20,12),new THREE.MeshBasicMaterial());root.position.y=10;
    const scene=new THREE.Scene();scene.add(root);
    const state={kaiju:{root,head:root},yaw:0,pitch:0,score:0},lengths=[];
    const world={scene,bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},buildings:[],spawnWeaponTracer:(o,d,length)=>lengths.push(length)};
    const c=new LoneSoldier({world,state,camera:new THREE.PerspectiveCamera(),role:'infantry',sound(){},finish(){}});
    state.pitch=0;c.shoot();assert.equal(c.kaijuHP,2382);assert.ok(Math.abs(lengths[0]-82)<1e-6);
    root.position.x=10;root.rotation.y=Math.PI/2;c.cooldown=0;c.shoot();
    assert.equal(c.kaijuHP,2364);assert.ok(Math.abs(lengths[1]-68)<1e-6,'rotated and moved cover distance is current');
    c.dispose();root.geometry.dispose();root.material.dispose();
  } finally {globalThis.document=previous;}
});

test('infantry jumps consistently, lands, and requires a new press for another jump',()=>{
  const previous=globalThis.document,labels=new Map();
  globalThis.document={body:{append(){}},createElement:()=>({remove(){},innerHTML:''}),
    getElementById:id=>{if(!labels.has(id))labels.set(id,{});return labels.get(id);}};
  try {
    for(const fps of [30,60,144]) {
      const root=new THREE.Group(),camera=new THREE.PerspectiveCamera();
      const state={kaiju:{root,head:root},yaw:0,pitch:0,score:0};
      const world={scene:new THREE.Scene(),bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},buildings:[]};
      const c=new LoneSoldier({world,state,camera,role:'infantry',sound(){},finish(){}});c.ai.update=()=>{};
      const idle={x:0,z:0,lookX:0,lookY:0,vertical:0};
      c.update(1/fps,{...idle,jump:true,z:1,sprint:true});
      assert.ok(c.pos.y>c.unit.eye);assert.equal(c.grounded,false);
      assert.equal(camera.position.y,c.pos.y,'camera follows jump height');
      let apex=c.pos.y;
      for(let i=0;i<fps*2;i++){c.update(1/fps,{...idle,jump:true});apex=Math.max(apex,c.pos.y);}
      assert.ok(Math.abs(apex-c.unit.eye-1.171875)<.015,`${fps} FPS jump apex`);
      assert.equal(c.pos.y,c.unit.eye,'held jump stays landed');assert.equal(c.verticalSpeed,0);
      c.update(1/fps,idle);c.update(1/fps,{...idle,jump:true});assert.ok(c.verticalSpeed>0);
      c.update(1/fps,idle);const velocity=c.verticalSpeed;
      c.update(1/fps,{...idle,jump:true});assert.ok(c.verticalSpeed<velocity,'airborne press cannot double jump');
      c.dispose();
    }
  } finally {globalThis.document=previous;}
});

test('infantry slides along walls, clears low obstacles and falls from destroyed platforms',()=>{
  const previous=globalThis.document;
  globalThis.document={body:{append(){}},createElement:()=>({remove(){},innerHTML:''})};
  try {
    const root=new THREE.Group(),state={kaiju:{root,head:root},yaw:0,pitch:0,score:0};
    const world={scene:new THREE.Scene(),bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},buildings:[]};
    const c=new LoneSoldier({world,state,camera:new THREE.PerspectiveCamera(),role:'infantry',sound(){},finish(){}});
    const wall={x:2,z:0,w:1,d:20,h:10};world.buildings=[wall];c.pos.set(0,c.unit.eye,0);
    c.moveInfantry(.3,{},9,9);
    assert.ok(c.pos.x<1.11,'solid wall blocks horizontal movement');assert.ok(c.pos.z>2,'movement slides along wall');
    const platform={x:2,z:0,w:1,d:4,h:.6};world.buildings=[platform];c.pos.set(0,c.unit.eye,0);
    c.grounded=true;c.verticalSpeed=0;c.jumpHeld=false;
    c.moveInfantry(.1,{},9,0);assert.ok(c.pos.x<1.11);
    c.pos.set(0,c.unit.eye,0);
    for(let i=0;i<30;i++)c.moveInfantry(1/60,{jump:true},i<14?9:0,0);
    assert.ok(c.pos.x>1.5,'jump clears obstacle edge');
    for(let i=0;i<60;i++)c.moveInfantry(1/60,{},0,0);
    assert.ok(Math.abs(c.pos.y-c.unit.eye-platform.h)<1e-6,'lands on platform');
    platform.destroyed=true;
    for(let i=0;i<60;i++)c.moveInfantry(1/60,{},0,0);
    assert.equal(c.pos.y,c.unit.eye,'destroyed support releases the soldier');
    world.buildings=[];world.isWater=()=>true;
    const x=c.pos.x;c.moveInfantry(.2,{jump:true},9,0);assert.equal(c.pos.x,x,'jump does not bypass water boundary');
    c.dispose();
  } finally {globalThis.document=previous;}
});

test('infantry magazines, reload lock, aim transition, recoil and camera restoration',()=>{
  const previous=globalThis.document,labels=new Map();
  globalThis.document={body:{append(){}},createElement:()=>({remove(){},innerHTML:''}),
    getElementById:id=>{if(!labels.has(id))labels.set(id,{});return labels.get(id);}};
  try {
    const root=new THREE.Group(),camera=new THREE.PerspectiveCamera(60,1,.5,1000);
    const state={kaiju:{root,head:root},yaw:0,pitch:0,score:0};
    const world={scene:new THREE.Scene(),bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},buildings:[],spawnBeam(){}};
    const phases=[];
    const c=new LoneSoldier({world,state,camera,role:'infantry',sound(){},handlingSound:p=>phases.push(p),finish(){}});c.ai.update=()=>{};
    const idle={x:0,z:0,lookX:0,lookY:0,vertical:0};
    for(let i=0;i<30;i++){c.cooldown=0;c.shoot();}
    assert.equal(c.ammo,0);c.cooldown=0;c.shoot();assert.ok(c.reloadTime>2);
    const score=state.score;c.shoot();assert.equal(state.score,score,'reload blocks fire');
    c.update(1,idle);assert.equal(c.ammo,0,'ammo is not restored before seating magazine');
    c.update(1.8,{...idle,aim:true});assert.equal(c.ammo,30);assert.ok(camera.fov<50);
    assert.deepEqual(phases,['release','seat','bolt']);phases.length=0;
    c.cooldown=0;c.shoot();assert.equal(c.ammo,29);c.reload();assert.equal(c.reloadDuration,2.2,'partial magazine skips bolt release');
    c.update(2.3,idle);assert.equal(c.ammo,30);
    assert.deepEqual(phases,['release','seat'],'partial reload does not release the bolt');
    const p=c.pos.clone();c.update(.5,{...idle,x:1,aim:true});
    assert.ok(c.pos.distanceTo(p)<3,'aiming reduces movement speed');
    assert.ok(Number.isFinite(c.weaponKick));
    world.isWater=()=>true;
    for(let i=0;i<60;i++)c.update(1/60,{...idle,x:1,sprint:true});
    const gait=c.gait;c.update(.5,{...idle,x:1,sprint:true});
    assert.equal(c.gait,gait,'blocked movement cannot advance footsteps');assert.ok(c.sprintBlend<.001);
    c.dispose();assert.equal(camera.fov,60);assert.equal(camera.children.length,0);
  } finally {globalThis.document=previous;}
});

test('weapon cover probes ignore destroyed structures and distinguish sunlight from shade',()=>{
  const pos=new THREE.Vector3(0,1.8,0),forward=new THREE.Vector3(0,0,1);
  const wall={x:0,z:1.5,w:8,d:1,h:8,destroyed:false},world={buildings:[wall]};
  assert.equal(structureClearance(world,pos,forward),1);
  assert.equal(soldierSunExposure(world,pos,new THREE.Vector3(0,2,1)),0);
  wall.destroyed=true;assert.equal(structureClearance(world,pos,forward),1.6);
  assert.equal(soldierSunExposure(world,pos,new THREE.Vector3(0,2,1)),1);
});

test('soldier shadow tracking keeps sun direction fixed and environment strength reaches materials',()=>{
  const sun=new THREE.DirectionalLight(),anchor=new THREE.Object3D(),offset=new THREE.Vector3(6,140,50);
  followSoldierShadow(sun,anchor,new THREE.Vector3(50,2,-40),offset);
  assert.ok(sun.position.clone().sub(anchor.position).distanceTo(offset)<1e-8);
  assert.equal(sun.target,anchor);
  const before=anchor.position.clone();followSoldierShadow(sun,anchor,new THREE.Vector3(50.000001,2,-40),offset);
  assert.ok(before.distanceTo(anchor.position)<.00001,'sub-texel motion does not shift the map');
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial(),explicit=material.clone();
  explicit.envMap=new THREE.Texture();explicit.envMapIntensity=.22;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material),new THREE.Mesh(new THREE.BoxGeometry(),explicit));
  applyEnvironmentStrength(scene,.85);assert.equal(material.envMapIntensity,.85);assert.equal(explicit.envMapIntensity,.22);
});

test('festival ground wear follows entrances and paths, stays deterministic and clears when disabled',()=>{
  const festival={fence:[[-10,-10],[10,-10],[10,10],[-10,10]],items:[{kind:'gate',x:0,z:0,w:4,d:1,rot:0}]};
  const a=buildChicagoWear(festival,[],128),b=buildChicagoWear(festival,[],128);
  assert.deepEqual(a.data,b.data);assert.ok(a.sources>0);assert.equal(a.data.length,128*128*4);
  const sample=(field,x,z)=>{
    const {bounds:b,size}=field,i=Math.floor((x-b.x0)/(b.x1-b.x0)*size),j=Math.floor((z-b.z0)/(b.z1-b.z0)*size);
    return field.data[(j*size+i)*4];
  };
  assert.ok(sample(a,0,2)>180,'entrance is worn');assert.equal(sample(a,8,8),0,'distant lawn stays intact');
  const path=buildChicagoWear({...festival,items:[]},[{points:[[-8,5],[8,5]],width:1}],128);
  assert.ok(sample(path,0,5)>90);assert.equal(sample(path,0,-5),0);
  const off=buildChicagoWear(null,[],128);assert.equal(off.sources,0);
  assert.ok(off.data.every((v,i)=>i%4===3?v===255:v===0));
});

test('melee camera feedback fades without moving the soldier or changing aim',()=>{
  const previous=globalThis.document,nodes=new Map();
  globalThis.document={body:{append(){}},createElement:()=>({remove(){},innerHTML:''}),getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
  try {
    const root=new THREE.Group(),camera=new THREE.PerspectiveCamera(),state={kaiju:{root,head:root},yaw:0,pitch:0,score:0};
    const world={scene:new THREE.Scene(),bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},buildings:[]},sounds=[];
    const c=new LoneSoldier({world,state,camera,role:'infantry',sound(){},finish(){},impactSound:(...args)=>sounds.push(args)});
    c.ai.update=()=>{};c.time=.1;const pos=c.pos.clone(),direction=new THREE.Vector3();
    c.cameraUpdate();camera.getWorldDirection(direction);c.meleeImpact('stomp',1);c.cameraUpdate();
    assert.ok(camera.position.distanceTo(pos)>.01);assert.deepEqual(c.pos,pos);
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction)<1e-6);assert.equal(sounds.length,1);
    const idle={x:0,z:0,lookX:0,lookY:0,vertical:0};
    for(let i=0;i<30;i++)c.update(1/60,idle);
    assert.equal(c.impactShake,0);assert.ok(camera.position.distanceTo(c.pos)<1e-8);c.dispose();
  } finally {globalThis.document=previous;}
});

test('atomic breath resolves once at the released bolt endpoint and resets pending hits', async () => {
  const {fireAtomicBreath, updateAtomicBlasts, resetAtomicBlasts} = await import('../src/atomicBlast.js');
  const scene = new THREE.Scene();
  const origin = new THREE.Vector3(0, 8, 0);
  const direction = new THREE.Vector3(0, 0, 1);
  const hits = [];
  let releases = 0;
  const fire = () => fireAtomicBreath(scene, origin, direction, 190, 0x66ff66,
    point => hits.push(point.clone()), {
      world: {scene, isWater: () => true, effects: []},
      onRelease() {
        releases++;
        return {origin: origin.clone().setX(7), dir: direction, distance: 55};
      },
    });

  try {
    fire();
    updateAtomicBlasts(.3);
    assert.equal(releases, 0);
    assert.equal(hits.length, 0);
    updateAtomicBlasts(.2);
    assert.equal(releases, 1);
    assert.equal(hits.length, 0);
    updateAtomicBlasts(.21);
    assert.deepEqual(hits.map(point => point.toArray()), [[7, 8, 55]]);
    updateAtomicBlasts(.6);
    assert.equal(hits.length, 1);
    fire();
    resetAtomicBlasts();
    updateAtomicBlasts(1);
    assert.equal(releases, 1);
    assert.equal(hits.length, 1);
  } finally {
    resetAtomicBlasts();
  }
});

test('VS rival telegraphs a beam and only applies damage on release', async () => {
  const {KaijuDuelRival, duelHealth} = await import('../src/kaijuDuel.js');
  const {MONSTERS} = await import('../src/monsters.js');
  const root = new THREE.Group(), head = new THREE.Object3D();
  head.position.y = 12;
  root.add(head);
  const warnings = [], hits = [];
  let beams = 0, results = 0;
  const config = MONSTERS.mecha;
  const rival = new KaijuDuelRival({
    root, head, actions: {}, mixer: {update() {}}, play() {}, playOnce() { return true; },
  }, config, new THREE.Vector3(), {
    hurtPlayer: amount => hits.push(amount),
    onWarning: label => warnings.push(label),
    onDefeat: () => results++,
  });


  const player = new THREE.Vector3(0, 0, 60);
  const world = {buildings: [], spawnBeam() { beams++; }};
  rival.windup(world, 'beam', player.clone().setY(12));
  rival.update(.6, world, player);
  assert.equal(beams, 0);
  assert.deepEqual(hits, []);
  assert.match(warnings[0], /PLASMA CANNON/);
  rival.update(.56, world, player);
  assert.equal(beams, 1);
  assert.deepEqual(hits, [config.beam.damage * .45]);
  assert.equal(warnings.at(-1), '');
  rival.damage(duelHealth(config));
  rival.damage(500);
  rival.update(5, world, player);
  assert.equal(results, 1);
  assert.equal(rival.hp, 0);
  assert.equal(beams, 1);
});

test('VS rival spawn selects a clear dry position inside the map', async () => {
  const {findDuelSpawn} = await import('../src/kaijuDuel.js');
  const player = new THREE.Vector3();
  const world = {
    bounds: {minX: -110, maxX: 110, minZ: -110, maxZ: 110},
    isWater: (x, z) => z > 45,
    buildings: [{x: 0, z: 28, w: 12, d: 14, h: 25}],
  };
  const spawn = findDuelSpawn(world, player, 0);
  assert.ok(!world.isWater(spawn.x, spawn.z));
  assert.ok(Math.abs(spawn.x) <= 100 && Math.abs(spawn.z) <= 100);
  assert.ok(spawn.distanceTo(player) >= 38);
});
