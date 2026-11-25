import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, LANGUAGE_KEY, TRANSLATION_MESSAGES, createLocalization } from '../src/i18n.js';
import { createPlayerProfiles } from '../src/playerProfiles.js';
import { ACHIEVEMENTS } from '../src/achievements.js';
const storage = () => { const values = new Map(); return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; };
test('five bundled locales have complete catalogs and every trophy title and requirement',()=>{
 assert.deepEqual(LANGUAGES.map(l=>l.code),['en','es','fr','ja','zh-CN']);assert.ok(TRANSLATION_MESSAGES.length>=700);
 const l=createLocalization();
 for(const {code} of LANGUAGES){l.setLanguage(code);for(const m of TRANSLATION_MESSAGES)if(code!=='en'){assert.ok(m.values[code]);const vars=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();assert.deepEqual(vars(m.source),vars(m.values[code]),m.source);}
 for(const a of ACHIEVEMENTS){assert.ok(l.t(a.name));if(code!=='en')assert.notEqual(l.t(a.description),a.description);}}
});
test('legacy and corrupt preferences default to English; unknown text falls back safely',()=>{
 const s=storage();s.setItem(LANGUAGE_KEY,'invented');const l=createLocalization({storage:s});assert.equal(l.getLanguage(),'en');assert.equal(l.t('Something not translated yet'),'Something not translated yet');l.setLanguage('es');assert.equal(l.t('Something not translated yet'),'Something not translated yet');assert.throws(()=>l.setLanguage('<script>'));assert.equal(l.getLanguage(),'es');
});
test('profile-bound languages persist and old-profile writes stay isolated after a switch',()=>{
 const s=storage();let id=1;const a=createPlayerProfiles({storage:s,makeId:()=>`player-${++id}`});
 const en=createLocalization({storage:a.storage});assert.equal(en.getLanguage(),'en');en.setLanguage('ja');
 const other=a.create('BACK',{language:'fr'});a.switchTo(other);const b=createPlayerProfiles({storage:s});const fr=createLocalization({storage:b.storage});assert.equal(fr.getLanguage(),'fr');
 en.setLanguage('zh-CN');assert.equal(fr.getLanguage(),'fr');assert.equal(b.storage.getItem(LANGUAGE_KEY),'fr');b.switchTo(a.id);assert.equal(createLocalization({storage:createPlayerProfiles({storage:s}).storage}).getLanguage(),'zh-CN');assert.equal(b.current.name,'BACK');
});
test('live switching keeps English source, placeholders, names and key bindings intact',()=>{
 const l=createLocalization({storage:storage()});let calls=0;const off=l.subscribe(()=>calls++);
 l.setLanguage('es');const title=l.t('PLAYER PROFILES');assert.equal(title,'PERFILES DE JUGADOR');assert.equal(l.t('WASD MOVE · SPACE STOMP'),'WASD MOVER · SPACE PISOTÓN');assert.equal(l.t('SMASH 5 BUILDINGS'),'APLASTA 5 EDIFICIOS');
 assert.equal(l.t('{player}’s career',{player:'Gold 🦖'}),'Carrera de Gold 🦖');assert.equal(l.t('P2 · CONTROLLER 3'),'P2 · MANDO 3');
 l.setLanguage('ja');assert.equal(l.t(title),'プレイヤープロフィール');assert.equal(l.t('WAVE 3'),'ウェーブ 3');l.setLanguage('en');assert.equal(l.t(title),'PLAYER PROFILES');assert.equal(calls,3);off();
});
test('storage failures still allow a session language without touching other settings',()=>{
 const l=createLocalization({storage:{getItem(){throw Error('blocked')},setItem(){throw Error('quota')}}});assert.equal(l.getLanguage(),'en');assert.equal(l.setLanguage('zh-CN'),false);assert.equal(l.getLanguage(),'zh-CN');assert.equal(l.t('RESUME'),'继续');assert.equal(l.persistent,false);
 const s=storage();s.setItem('unrelated','keep');const good=createLocalization({storage:s});good.setLanguage('fr');assert.equal(s.getItem('unrelated'),'keep');assert.equal(s.getItem(LANGUAGE_KEY),'fr');
});
