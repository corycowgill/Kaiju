import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLocalMatch } from '../src/localMultiplayer.js';
import { frameLocalPlayers, constrainLocalPosition } from '../src/localCamera.js';
import { createPlayerHistory } from '../src/playerHistory.js';
const pad = (index, id = `Pad ${index}`) => ({ index, id, connected: true, axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({pressed:false,value:0})) });
const ready = (opts) => { const m = createLocalMatch(opts); m.poll({}, opts?.pads || [], 0); return m; };
test('shared keyboard isolates movement, strikes, powers and block for both humans', () => {
 const m=ready({scheme:'keyboard'});
 m.poll({KeyD:true,KeyV:true,ArrowUp:true,KeyO:true,Digit8:true},[],100);
 assert.equal(m.seats[0].input.x,1);assert.equal(m.seats[0].input.z,0);assert.equal(m.seats[0].input.strike,true);assert.equal(m.seats[0].input.power,'');
 assert.equal(m.seats[1].input.x,0);assert.equal(m.seats[1].input.z,1);assert.equal(m.seats[1].input.strike,false);assert.equal(m.seats[1].input.block,true);assert.equal(m.seats[1].input.power,'roar');
 m.poll({KeyV:true},[],330);assert.equal(m.seats[0].input.heavy,true);m.poll({KeyV:true},[],400);assert.equal(m.seats[0].input.heavy,false);
});
test('auto seats support keyboard, mixed devices and two controllers with stable assignments',()=>{
 assert.equal(ready().layout,'keyboard');const a=pad(2),b=pad(5);
 const mixed=ready({pads:[null,null,a]});assert.equal(mixed.layout,'mixed');assert.equal(mixed.seats[0].padIndex,null);assert.equal(mixed.seats[1].padIndex,2);
 const m=ready({pads:[a,b]});a.buttons[0].pressed=true;b.buttons[1].pressed=true;a.axes[0]=1;b.axes[1]=-1;
 m.poll({KeyJ:true},[a,b],100);assert.equal(m.seats[0].input.strike,true);assert.equal(m.seats[1].input.grab,true);assert.equal(m.seats[1].input.strike,false);assert.equal(m.seats[0].input.x,1);assert.equal(m.seats[1].input.z,1);
 m.poll({},[b],200);assert.deepEqual(m.missing,[1]);assert.equal(m.seats[0].input.x,0);assert.equal(m.seats[0].input.strikeHeld,false);assert.equal(m.seats[1].padIndex,5);
 m.poll({},[pad(2,'Other pad'),b],300);assert.deepEqual(m.missing,[1]);
 a.buttons[0].pressed=false;m.poll({},[a,b],400);assert.deepEqual(m.missing,[]);
});
test('launch and resume gates held actions; button edges and mash rate are bounded',()=>{
 const a=pad(0),b=pad(1);a.buttons[0].pressed=true;const m=createLocalMatch({pads:[a,b]});
 m.poll({},[a,b],0);assert.equal(m.seats[0].input.strike,false);m.poll({},[a,b],100);assert.equal(m.seats[0].input.strikeHeld,false);
 a.buttons[0].pressed=false;m.poll({},[a,b],120);a.buttons[0].pressed=true;m.poll({},[a,b],200);assert.equal(m.seats[0].input.strike,true);assert.equal(m.seats[0].input.mash,1);
 a.buttons[1].pressed=true;m.poll({},[a,b],220);assert.equal(m.seats[0].input.mash,0);
 m.suppress();m.poll({},[a,b],300);assert.equal(m.seats[0].input.strikeHeld,false);
 b.buttons[9].pressed=true;m.poll({},[a,b],400);assert.equal(m.pausePressed,true);m.poll({},[a,b],450);assert.equal(m.pausePressed,false);
});
test('explicit layouts reject missing devices; diagonals cannot move faster',()=>{
 assert.throws(()=>createLocalMatch({scheme:'pads',pads:[pad(0)]}),/two controllers/);assert.throws(()=>createLocalMatch({scheme:'mixed'}),/controller/);
 const m=ready({scheme:'keyboard'});m.poll({KeyD:true,KeyW:true},[],100);assert.ok(Math.abs(Math.hypot(m.seats[0].input.x,m.seats[0].input.z)-1)<1e-8);
});
test('shared camera frames both fighters in portrait and landscape at close and far ranges',()=>{
 for(const aspect of [390/844,844/390,16/9])for(const separation of [0,40,130,260])for(const z of [0,150]){
 const camera=new THREE.PerspectiveCamera(60,aspect,.1,2000);
 const a={pos:new THREE.Vector3(-separation/2,0,0),radius:13,height:40},b={pos:new THREE.Vector3(separation/2,4,z),radius:22,height:65};
 frameLocalPlayers(camera,a,b);
 for(const f of [a,b])for(const x of [-f.radius,f.radius])for(const y of [0,f.height]){
 const p=new THREE.Vector3(f.pos.x+x,f.pos.y+y,f.pos.z).project(camera);assert.ok(Math.abs(p.x)<=.83 && Math.abs(p.y)<=.69 && p.z<1,`off screen ${p.toArray()}`);
 }
 }
 const p=new THREE.Vector3(500,0,0);constrainLocalPosition(p,new THREE.Vector3());assert.equal(p.x,260);
});
test('local results persist separately with guest opponent and host outcome',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const h=createPlayerHistory({storage});assert.equal(h.begin({mode:'local-vs',fighter:'godzilla',opponent:'mecha',city:'chicago'}),true);h.finish('lost',{playerFalls:0,rivalFalls:1});
 const saved=createPlayerHistory({storage}).recent()[0];assert.equal(saved.mode,'local-vs');assert.equal(saved.opponent,'mecha');assert.equal(saved.outcome,'lost');assert.equal(saved.rivalFalls,1);
});

test('keyboard taps between animation frames are delivered once through captured edges',()=>{
 const m=ready({scheme:'keyboard'});m.poll({},[],100,{KeyJ:true,Digit1:true});
 assert.equal(m.seats[1].input.strike,true);assert.equal(m.seats[1].input.strikeHeld,false);assert.equal(m.seats[0].input.power,'beam');
 m.poll({},[],120);assert.equal(m.seats[1].input.strike,false);assert.equal(m.seats[0].input.power,'');
});
