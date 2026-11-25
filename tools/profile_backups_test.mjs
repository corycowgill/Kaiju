import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerProfiles, parseProfileBackup, MAX_PROFILE_BACKUP_BYTES, PROFILE_PREFIX, PROFILE_INDEX_KEY, PROFILE_SAVE_KEYS } from '../src/playerProfiles.js';
import { createAchievementTracker } from '../src/achievements.js';
import { createChampionshipTour } from '../src/championshipTour.js';
import { createHavocChallenges, CHALLENGES } from '../src/havocChallenges.js';
import { createPlayerHistory } from '../src/playerHistory.js';
import { LANGUAGE_KEY, createLocalization } from '../src/i18n.js';
const now = () => 1795564800000;
function fixture() {
 const values = new Map();let serial=1,failKey=null;
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(k===failKey)throw Error('quota');values.set(k,v)},removeItem:k=>values.delete(k)};
 const manager=()=>createPlayerProfiles({storage,now,makeId:()=>`player-${++serial}`});
 return {values,storage,manager,fail:k=>{failKey=k}};
}
function populated() {
 const f=fixture(),p=f.manager();p.rename('🦖 Alex');
 const a=createAchievementTracker({storage:p.storage,now});a.beginRun({mode:'havoc',monster:'godzilla',level:'chicago'});a.havoc('building',{landmarkId:'tower_401_n_wabash'});a.endRun();
 const tour=createChampionshipTour({storage:p.storage,now}),t=tour.prepare();tour.start(t.ticket);tour.finish(t.ticket,{winner:'player',playerFalls:2,rivalFalls:0,time:40});
 const c=createHavocChallenges({storage:p.storage,now}),m=c.prepare(CHALLENGES[0].id);c.start(m.ticket);c.finish(m.ticket,{won:true,time:20,score:900});
 const h=createPlayerHistory({storage:p.storage,now});h.begin({mode:'local-title',fighter:'godzilla',opponent:'mecha',city:'chicago'});h.finish('won',{playerFalls:2,rivalFalls:1,seconds:90,score:12345});
 p.storage.setItem('kaiju_highscore','12345');p.storage.setItem('kaijuLevel','chicago');p.storage.setItem('kaijuMenuPick',JSON.stringify({mode:'title',monster:'godzilla',rival:'mecha',role:'infantry',players:'local',devices:'keyboard'}));p.storage.setItem('kaijuWrTut',JSON.stringify({strike:3,block:1}));p.storage.setItem(LANGUAGE_KEY,'zh-CN');
 return {f,p};
}
test('portable backup round-trips all real career ledgers, preferences and language without changing the active player',()=>{
 const {p}=populated(),text=p.backup(),b=parseProfileBackup(text);assert.equal(b.profile.name,'🦖 Alex');assert.equal(b.exportedAt,now());assert.deepEqual(Object.keys(b.data).sort(),[...PROFILE_SAVE_KEYS].sort());
 const dest=fixture(),host=dest.manager();host.storage.setItem('kaiju_highscore','50');const id=host.restoreBackup(text);assert.notEqual(id,p.id);assert.equal(host.id,'player-1');assert.equal(host.current.name,'Player 1');assert.equal(host.storage.getItem('kaiju_highscore'),'50');
 for(const k of PROFILE_SAVE_KEYS)assert.equal(host.read(id,k),p.storage.getItem(k));
 host.switchTo(id);const restored=dest.manager();assert.equal(createLocalization({storage:restored.storage}).getLanguage(),'zh-CN');assert.ok(createAchievementTracker({storage:restored.storage}).unlockedAt('america-first'));assert.equal(createChampionshipTour({storage:restored.storage}).progress().belts,1);assert.equal(createHavocChallenges({storage:restored.storage}).summary().gold,1);assert.equal(createPlayerHistory({storage:restored.storage}).recent()[0].opponent,'mecha');
 host.storage.setItem('kaiju_highscore','80');assert.equal(restored.storage.getItem('kaiju_highscore'),'12345');assert.equal(restored.current.created,b.profile.created);
});
test('preview is read-only and duplicate names require a new name instead of overwriting',()=>{
 const {f,p}=populated(),text=p.backup(),before=[...f.values];parseProfileBackup(text);assert.deepEqual([...f.values],before);assert.throws(()=>p.restoreBackup(text),/different player name/);assert.deepEqual([...f.values],before);
 const id=p.restoreBackup(text,'Alex restored');assert.equal(p.list().find(v=>v.id===id).name,'Alex restored');assert.equal(p.current.name,'🦖 Alex');assert.deepEqual(JSON.parse(p.backup(id)).data,JSON.parse(text).data);
});
test('corrupt, foreign, unsupported, oversized and unsafe backups cannot write any saves',()=>{
 const {p}=populated(),valid=JSON.parse(p.backup());const dest=fixture(),host=dest.manager(),before=[...dest.values];
 const bad=['bad JSON','{}',JSON.stringify({...valid,format:'other-game'}),JSON.stringify({...valid,version:2}),' '.repeat(MAX_PROFILE_BACKUP_BYTES+1),JSON.stringify({...valid,profile:{name:'',created:0}}),JSON.stringify({...valid,data:{[PROFILE_INDEX_KEY]:'{}'}}),JSON.stringify({...valid,data:{kaijuMenuPick:'{"monster":"__proto__"}'}}),JSON.stringify({...valid,data:{kaiju_achievements_v1:'{"version":1,"stats":{},"unlocked":{},"sets":{},"__proto__":{}}'}}),JSON.stringify({...valid,data:{kaiju_highscore:'Infinity'}}),JSON.stringify({...valid,data:{kaiju_history_v1:'{"version":1,"recent":[],"totals":1,"active":null}'}}),JSON.stringify({...valid,data:{kaiju_city_challenges_v1:'{"version":9,"records":{}}'}})];
 for(const text of bad){assert.throws(()=>host.restoreBackup(text));assert.deepEqual([...dest.values],before);}
});
test('storage failure rolls back unpublished restoration and retains every existing career',()=>{
 const {p}=populated(),dest=fixture(),host=dest.manager(),before=[...dest.values];dest.fail(PROFILE_INDEX_KEY);assert.throws(()=>host.restoreBackup(p.backup()),/Could not save/);assert.deepEqual([...dest.values],before);assert.equal(host.list().length,1);assert.equal(host.current.name,'Player 1');
});
test('profile cap is enforced and exporting a selected inactive profile keeps it separate',()=>{
 const {p}=populated(),copy=p.restoreBackup(p.backup(),'Second');const second=p.backup(copy);for(let i=0;i<6;i++)p.create(`Other ${i}`);assert.equal(p.list().length,8);assert.throws(()=>p.restoreBackup(second,'Ninth'),/eight/);assert.equal(parseProfileBackup(second).profile.name,'Second');assert.equal(p.current.name,'🦖 Alex');
});
test('backups contain career data only, and session memory can still be exported after storage fails',()=>{
 const {f,p}=populated();f.storage.setItem('kh_vo','false');assert.ok(!p.backup().includes('kh_vo'));f.fail(PROFILE_PREFIX+p.id);assert.throws(()=>p.storage.setItem('kaiju_highscore','999'));assert.equal(p.persistent,false);assert.equal(parseProfileBackup(p.backup()).data.kaiju_highscore,'999');
});
