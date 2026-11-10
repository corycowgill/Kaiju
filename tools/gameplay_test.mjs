import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { resolveStructureContact } from '../src/buildingCollision.js';
import { crowdGeometry, crowdMaterial, animateCrowd } from '../src/levels/festivalCrowd.js';
import { followSoldierShadow, applyEnvironmentStrength, structureClearance, soldierSunExposure } from '../src/firstPersonLighting.js';
import { buildChicagoWear } from '../src/levels/chicagoWear.js';

globalThis.window = { innerWidth: 1440, innerHeight: 900 };
globalThis.location = { search: '?q=high' };
globalThis.localStorage = { getItem: () => null };
const effects = await import('../src/effects.js');
const vfx = await import('../src/vfx.js');
vfx.registerAllBuilders(effects);

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
      for(let frame=0;frame<300;frame++){mode.update(1/60,idle);warned ||= mode.warning>0;}
      assert.ok(warned,'attack is telegraphed');
      assert.ok(mode.hp<hp,'stationary unit takes attack damage');
      mode.kaijuHP=0;mode.update(.01,{x:0,z:0,lookX:0,lookY:0,vertical:0});assert.equal(result,true);
      mode.dispose();assert.equal(camera.children.length,0);
    }
  } finally {globalThis.document=oldDocument;}
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
