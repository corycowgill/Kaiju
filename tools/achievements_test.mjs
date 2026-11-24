import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ACHIEVEMENTS, ACHIEVEMENT_KEY, TROPHY_ROSTER, TROPHY_CITIES, createAchievementTracker } from '../src/achievements.js';
import { createBus } from '../src/wrestling/events.js';
import { bindWrestlingAchievements } from '../src/wrestling/achievements.js';

function fixture(t, initial) {
  let saved = initial;
  const earned = [];
  const storage = { getItem: () => saved, setItem: (key, value) => { assert.equal(key, ACHIEVEMENT_KEY); saved = value; } };
  const tracker = createAchievementTracker({ storage, now: () => 1795536000000, onUnlock: (a) => earned.push(a.id) });
  t.after(() => tracker.endRun());
  const begin = (mode = 'havoc', monster = 'godzilla', level = 'tokyo') => tracker.beginRun({ mode, monster, level });
  const has = (id) => tracker.unlockedAt(id) !== null;
  const progress = (id) => tracker.progress(ACHIEVEMENTS.find((a) => a.id === id));
  return { tracker, earned, storage, begin, has, progress, saved: () => saved };
}

test('catalogue has 48 unique illustrated trophies with mode, tier and valid targets', () => {
  assert.equal(ACHIEVEMENTS.length, 48);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 48);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.icon)).size, 48);
  assert.deepEqual(['havoc', 'wrestling', 'legacy'].map((mode) => ACHIEVEMENTS.filter((a) => a.mode === mode).length), [24, 20, 4]);
  for (const a of ACHIEVEMENTS) { assert.ok(a.goal > 0); assert.ok(a.points > 0); assert.ok(a.description); }
  const atlas = fs.readFileSync(new URL('../assets/ui/achievements/trophies.webp', import.meta.url));
  assert.equal(atlas.toString('ascii', 8, 12), 'WEBP');
});

test('unlocks are saved before the callback, delivered once and never replayed on reload', (t) => {
  const f = fixture(t); f.begin();
  f.tracker.havoc('building');
  assert.ok(JSON.parse(f.saved()).unlocked['first-impact']);
  f.tracker.havoc('building');
  assert.deepEqual(f.earned, ['first-impact']);
  const reload = fixture(t, f.saved());
  assert.ok(reload.has('first-impact')); assert.equal(reload.progress('demolition-career'), 1);
  assert.equal(reload.earned.length, 0);
  f.tracker.flush();
  assert.equal(JSON.parse(f.saved()).stats['h.buildings'], 2);
});

test('run targets cannot be accumulated over multiple runs; career totals can', (t) => {
  const f = fixture(t);
  for (let run = 0; run < 2; run++) { f.begin(); for (let i = 0; i < 13; i++) f.tracker.havoc('building'); }
  assert.equal(f.progress('block-party'), 13); assert.ok(!f.has('block-party'));
  assert.equal(f.progress('demolition-career'), 26);
  f.tracker.havoc('score', 9000); f.begin(); f.tracker.havoc('score', 9000);
  assert.ok(!f.has('making-headlines'));
  for (const p of ['beam', 'roar', 'charge']) f.tracker.havoc('power', p);
  f.begin(); for (const p of ['stomp', 'ult']) f.tracker.havoc('power', p);
  assert.equal(f.progress('full-arsenal'), 3); assert.ok(!f.has('full-arsenal'));
});

test('mode boundaries ignore previews, inactive runs, duels and Lone Soldier', (t) => {
  const f = fixture(t);
  for (const mode of [null, 'lone', 'vs']) {
    f.begin(mode); f.tracker.havoc('building'); f.tracker.havoc('kill', 'boss');
    f.tracker.wrestling('match:start'); f.tracker.wrestling('match:won', { rivalFalls: 0, defense: 3 });
  }
  assert.equal(f.tracker.summary().unlocked, 0);
  assert.equal(f.progress('world-tour'), 0);
  f.begin('wrestling'); f.tracker.havoc('kill', 'boss'); assert.ok(!f.has('boss-breaker'));
  f.begin(); f.tracker.wrestling('match:start'); assert.ok(!f.has('main-event-debut'));
  f.tracker.endRun(); f.tracker.havoc('building'); assert.ok(!f.has('first-impact'));
});

test('survival tracks active time only, rejects invalid values and resets between runs', (t) => {
  const f = fixture(t); f.begin();
  for (let i = 0; i < 40; i++) f.tracker.advance(0.25, 1);
  assert.equal(f.progress('ten-minute-menace'), 10);
  f.tracker.advance(600, NaN); // a suspended tab or a huge frame is capped
  assert.equal(f.progress('ten-minute-menace'), 10);
  f.begin(); f.tracker.advance(-1, 100000); f.tracker.advance(NaN, 100000);
  assert.ok(!f.has('front-page-monster'));
  for (let i = 0; i < 20; i++) f.tracker.advance(.25, 2);
  assert.equal(f.progress('ten-minute-menace'), 10);
});

test('wrestling bus awards player actions only and distinguishes forced pins and near kickouts', (t) => {
  const f = fixture(t), bus = createBus(); f.begin('wrestling');
  const unbind = bindWrestlingAchievements(bus, f.tracker);
  const emit = (name, data = {}) => { Object.assign(bus.ev(name), data); bus.emit(name); };
  emit('match:start');
  emit('finisher:impact', { who: 'rival' }); emit('ko', { who: 'rival', by: 'military' });
  emit('pin:fall', { who: 'player', forced: true }); emit('pin:kickout', { who: 'player', count: 2, near: false });
  emit('building:impact', { who: 'player', by: 'rival', type: 'whip', count: 3 });
  for (const id of ['finishing-touch', 'lights-out', 'one-two-three', 'not-today', 'urban-renewal']) assert.ok(!f.has(id));
  emit('pin:fall', { who: 'player', forced: false }); emit('ko', { who: 'rival', by: 'player' });
  emit('pin:kickout', { who: 'player', near: true });
  emit('building:impact', { who: 'rival', by: 'player', type: 'whip', count: 3 });
  for (const id of ['lights-out', 'one-two-three', 'not-today', 'urban-renewal']) assert.ok(f.has(id));
  unbind(); emit('finisher:impact', { who: 'player' }); assert.ok(!f.has('finishing-touch'));
});

test('title defenses, comeback and signature targets respect match boundaries and duplicate results', (t) => {
  const f = fixture(t); f.begin('wrestling');
  const wr = (name, data = {}) => f.tracker.wrestling(name, data);
  wr('match:start'); wr('grab:move', { who: 'player', type: 'signature', sig: 1 });
  wr('fall:end', { fall: 1, winner: 'rival' });
  wr('match:won', { rivalFalls: 1, defense: 0 });
  wr('match:won', { rivalFalls: 1, defense: 0 });
  assert.ok(f.has('never-say-die')); assert.ok(!f.has('clean-sweep')); assert.equal(f.progress('belt-collector'), 1);
  wr('match:start'); wr('grab:move', { who: 'player', type: 'signature', sig: 2 });
  assert.ok(!f.has('signature-style'));
  wr('grab:move', { who: 'player', type: 'signature', sig: 1 }); assert.ok(f.has('signature-style'));
  wr('match:won', { rivalFalls: 0, defense: 3 });
  assert.ok(f.has('dynasty')); assert.ok(f.has('and-still')); assert.ok(f.has('clean-sweep'));
});

test('corrupt saves and unavailable storage never break gameplay or repeat unlocks', (t) => {
  for (const initial of ['{bad json', '{"version":2}', '{"version":1,"stats":{"h.buildings":-1,"h.score":"Infinity"},"unlocked":{"not-a-trophy":42},"sets":{"cities":["invented"]}}']) {
    const f = fixture(t, initial); f.begin(); assert.equal(f.tracker.summary().unlocked, 0);
    assert.equal(f.progress('demolition-career'), 0); assert.equal(f.progress('world-tour'), 1);
  }
  const earned = [], broken = createAchievementTracker({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } }, onUnlock: (a) => earned.push(a.id) });
  t.after(() => broken.endRun());
  broken.beginRun({ mode: 'havoc' }); broken.havoc('building'); broken.havoc('building'); broken.flush();
  assert.equal(broken.persistent, false); assert.deepEqual(earned, ['first-impact']);
});

test('all 48 trophies are reachable through gameplay events, including the final platinum', (t) => {
  const f = fixture(t); f.begin();
  for (let i = 0; i < 500; i++) f.tracker.havoc('building');
  for (let i = 0; i < 50; i++) f.tracker.havoc('cars');
  for (const [kind, n] of [['tank', 25], ['heli', 25], ['mech', 10], ['boss', 5], ['soldier', 185]]) for (let i = 0; i < n; i++) f.tracker.havoc('kill', kind);
  for (const [event, value] of [['combo', 40], ['multikill', 6], ['score', 100000], ['wave', 12]]) f.tracker.havoc(event, value);
  for (let i = 0; i < 10; i++) f.tracker.havoc('objectives');
  for (let i = 0; i < 25; i++) f.tracker.havoc('pickups');
  for (const power of ['beam', 'roar', 'charge', 'stomp', 'ult']) f.tracker.havoc('power', power);
  for (let i = 0; i < 2400; i++) f.tracker.advance(.25, 100000);
  for (const monster of TROPHY_ROSTER) f.begin('havoc', monster);
  for (let match = 0; match < 10; match++) {
    f.begin('wrestling', 'godzilla', TROPHY_CITIES[match % TROPHY_CITIES.length]);
    const wr = (name, data = {}) => f.tracker.wrestling(name, data);
    wr('match:start');
    if (match === 0) wr('fall:end', { fall: 1, winner: 'rival' });
    for (let i = 0; i < 10; i++) wr('strike:landed', { who: 'player' });
    wr('strike:reversed', { who: 'player' }); wr('throw:land', { who: 'player', type: 'suplex' });
    wr('swing:spin', { who: 'player', turns: 3 }); wr('ko', { who: 'rival', by: 'player' });
    wr('finisher:impact', { who: 'player' }); wr('pin:fall', { who: 'player' });
    for (const sig of [1, 2]) wr('grab:move', { who: 'player', type: 'signature', sig });
    wr('pin:kickout', { who: 'player', near: true });
    wr('building:impact', { who: 'rival', by: 'player', type: 'whip', count: 3 });
    wr('prop:hit', { who: 'player', target: 'rival' }); wr('weapon:break', { who: 'player', target: 'rival' }); wr('taunt:complete', { who: 'player' });
    wr('match:won', { rivalFalls: match === 0 ? 1 : 0, defense: match });
  }
  const missing = ACHIEVEMENTS.filter((a) => !f.has(a.id)).map((a) => a.id);
  assert.deepEqual(missing, []);
  assert.equal(f.earned.length, 48); assert.equal(f.earned.at(-1), 'kaiju-immortal');
  assert.equal(JSON.parse(f.saved()).stats['m.trophies'], 47);
});
