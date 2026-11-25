import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerProfiles, PROFILE_INDEX_KEY, PROFILE_PREFIX, PROFILE_SAVE_KEYS } from '../src/playerProfiles.js';
import { createPlayerHistory, HISTORY_KEY } from '../src/playerHistory.js';
import { createAchievementTracker } from '../src/achievements.js';
import { createChampionshipTour } from '../src/championshipTour.js';
import { createHavocChallenges, CHALLENGES } from '../src/havocChallenges.js';
function fixture(seed = {}) {
  const values = new Map(Object.entries(seed)); let fail = false, id = 0;
  const storage = { getItem: (key) => values.get(key) ?? null,
    setItem(key, value) { if (fail) throw Error('Quota exceeded'); values.set(key, value); }, removeItem: (key) => values.delete(key) };
  return { values, storage, fail: () => { fail = true; }, manager: () => createPlayerProfiles({ storage, now: () => 1795564800000, makeId: () => `player-${++id + 1}` }) };
}
function trophy(storage) { const t = createAchievementTracker({ storage }); t.beginRun({ mode: 'havoc', monster: 'godzilla', level: 'chicago' }); t.havoc('building'); t.endRun(); return t; }

test('migration snapshots every existing player save once, retaining original keys', () => {
  const old = Object.fromEntries(PROFILE_SAVE_KEYS.map((key) => [key, `old-${key}`]));
  const f = fixture(old), a = f.manager();
  assert.equal(a.current.name, 'Player 1');
  for (const key of PROFILE_SAVE_KEYS) { assert.equal(a.storage.getItem(key), old[key]); assert.equal(f.values.get(key), old[key]); }
  a.storage.setItem('kaiju_highscore', '42000');
  assert.equal(f.manager().storage.getItem('kaiju_highscore'), '42000');
  assert.equal(f.values.get('kaiju_highscore'), old.kaiju_highscore);
});

test('new profiles start clean and delayed old-profile writes never leak across a switch', () => {
  const f = fixture({ kaiju_highscore: '1000' }), a = f.manager(), bId = a.create('Sam');
  const tracker = trophy(a.storage); a.switchTo(bId); const b = f.manager();
  assert.equal(b.storage.getItem('kaiju_achievements_v1'), null); assert.equal(b.storage.getItem('kaiju_highscore'), null);
  a.storage.setItem('kaiju_highscore', '5000'); tracker.flush();
  b.storage.setItem('kaiju_highscore', '40'); b.switchTo(a.id);
  assert.equal(f.manager().storage.getItem('kaiju_highscore'), '5000');
  assert.equal(createAchievementTracker({ storage: f.manager().storage }).summary().unlocked, 1);
  assert.equal(b.storage.getItem('kaiju_highscore'), '40');
});

test('actual achievements, challenge medals, Tour belts and history are isolated and restored', () => {
  const f = fixture(), a = f.manager(); trophy(a.storage);
  const tour = createChampionshipTour({ storage: a.storage }), p = tour.prepare(); tour.start(p.ticket); tour.finish(p.ticket, { winner: 'player', playerFalls: 2, rivalFalls: 0, time: 40 });
  const c = createHavocChallenges({ storage: a.storage }), m = c.prepare(CHALLENGES[0].id); c.start(m.ticket); c.finish(m.ticket, { won: true, time: 20, score: 42 });
  const h = createPlayerHistory({ storage: a.storage }); h.begin({ mode: 'havoc', fighter: 'godzilla', city: 'chicago' }); h.finish('won');
  const bId = a.create('Other'); a.switchTo(bId); const b = f.manager();
  assert.equal(createAchievementTracker({ storage: b.storage }).summary().unlocked, 0);
  assert.equal(createChampionshipTour({ storage: b.storage }).progress().belts, 0);
  assert.equal(createHavocChallenges({ storage: b.storage }).summary().completed, 0);
  assert.equal(createPlayerHistory({ storage: b.storage }).summary().played, 0);
  b.switchTo(a.id); const restored = f.manager().storage;
  assert.equal(createChampionshipTour({ storage: restored }).progress().belts, 1);
  assert.equal(createHavocChallenges({ storage: restored }).summary().gold, 1);
  assert.equal(createPlayerHistory({ storage: restored }).summary().played, 1);
});

test('rename validation, eight-player cap, and inactive-only deletion preserve other careers', () => {
  const f = fixture(), a = f.manager(); a.rename('  🦖 Alex  '); assert.equal(a.current.name, '🦖 Alex');
  assert.throws(() => a.create(' ')); assert.throws(() => a.create('🦖 Alex')); assert.throws(() => a.switchTo('missing'));
  assert.throws(() => a.remove(a.id));
  for (let i = 0; i < 7; i++) a.create(`Player ${i + 2}`);
  assert.equal(a.list().length, 8); assert.throws(() => a.create('Nine'));
  const removed = a.list()[1].id; a.remove(removed); assert.equal(a.list().length, 7); assert.equal(f.values.has(PROFILE_PREFIX + removed), false);
  assert.equal(f.manager().current.name, '🦖 Alex');
});

test('independent tabs merge metadata and bound adapters preserve unrelated save keys', () => {
  const f = fixture(), a = f.manager(), otherTab = f.manager();
  const id = a.create('New'); otherTab.rename('Renamed'); assert.ok(otherTab.list().some((p) => p.id === id));
  a.storage.setItem('kaiju_highscore', '100'); otherTab.storage.setItem('kaijuLevel', 'nyc');
  assert.equal(a.storage.getItem('kaiju_highscore'), '100'); assert.equal(a.storage.getItem('kaijuLevel'), 'nyc');
  a.switchTo(id); assert.throws(() => otherTab.remove(id));
});

test('failed storage keeps session progress, forbids switching and leaves old saves untouched', () => {
  const f = fixture({ kaiju_highscore: '12' }), a = f.manager(); f.fail();
  assert.throws(() => a.storage.setItem('kaiju_highscore', '50'));
  assert.equal(a.persistent, false); assert.equal(a.storage.getItem('kaiju_highscore'), '50'); assert.throws(() => a.create('New'));
  assert.equal(f.values.get('kaiju_highscore'), '12');
  const blocked = createPlayerProfiles({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  assert.equal(blocked.persistent, false); assert.equal(trophy(blocked.storage).summary().unlocked, 1);
});

test('corrupt indexes and profile blobs never overwrite the saved original data', () => {
  const f = fixture({ [PROFILE_INDEX_KEY]: '{bad', kaiju_highscore: '88' }); const a = f.manager();
  assert.equal(a.persistent, false); assert.equal(a.storage.getItem('kaiju_highscore'), '88'); assert.equal(f.values.get(PROFILE_INDEX_KEY), '{bad');
  const invalidName = fixture({ [PROFILE_INDEX_KEY]: JSON.stringify({ version: 1, active: 'p', profiles: [{ id: 'p', name: 123, created: 0 }] }) });
  assert.equal(invalidName.manager().persistent, false);
  const ok = fixture(), b = ok.manager(); ok.values.set(PROFILE_PREFIX + b.id, '{bad');
  assert.equal(b.storage.getItem('kaiju_highscore'), null); assert.equal(b.persistent, false); assert.equal(ok.values.get(PROFILE_PREFIX + b.id), '{bad');
});

test('history records complete results once, active time, final falls/medal and real dates', () => {
  const f = fixture(), s = f.manager().storage; let at = 1795564800000;
  const h = createPlayerHistory({ storage: s, now: () => at });
  h.begin({ mode: 'challenge', fighter: 'godzilla', city: 'chicago', mission: 'Demolition Run' });
  h.advance(10, 42, 1); h.advance(-1, 100, 9); at += 20000;
  const r = h.finish('won', { medal: 3, score: 1200 });
  assert.equal(r.seconds, .25); assert.equal(r.medal, 3); assert.equal(r.ended, at); assert.equal(r.started, at - 20000);
  assert.equal(h.finish('lost'), null); assert.equal(h.summary().wins, 1);
  h.begin({ mode: 'title', fighter: 'mecha', city: 'dc' }); h.finish('lost', { playerFalls: 1, rivalFalls: 2, seconds: 99 });
  const restored = createPlayerHistory({ storage: s }); assert.equal(restored.recent()[0].rivalFalls, 2); assert.equal(restored.summary().played, 2);
});

test('quits and reloads are distinct from losses; interrupted runs recover just once', () => {
  const f = fixture(), s = f.manager().storage, h = createPlayerHistory({ storage: s });
  h.begin({ mode: 'vs' }); h.finish('left'); h.begin({ mode: 'havoc' }); h.advance(.1, 50, 3); h.flush();
  const loaded = createPlayerHistory({ storage: s }); assert.equal(loaded.recent()[0].outcome, 'interrupted'); assert.equal(loaded.recent()[0].score, 50);
  assert.deepEqual(loaded.summary(), { played: 2, wins: 0, losses: 0, seconds: .1 });
  assert.equal(createPlayerHistory({ storage: s }).summary().played, 2);
  loaded.begin({ mode: 'havoc' }); loaded.cancel();
  assert.equal(createPlayerHistory({ storage: s }).summary().played, 2, 'failed loading grants no history result');
});

test('history caps recent results at 100 while keeping lifetime totals', () => {
  const f = fixture(), h = createPlayerHistory({ storage: f.manager().storage });
  for (let i = 0; i < 105; i++) { h.begin({ mode: i % 2 ? 'tour' : 'lone' }); h.finish(i % 2 ? 'lost' : 'won'); }
  assert.equal(h.recent().length, 100); assert.equal(h.summary().played, 105); assert.equal(h.summary().wins, 53);
});

test('invalid history is contained and unavailable storage still permits recording', () => {
  const f = fixture({ [HISTORY_KEY]: '{bad' }); const h = createPlayerHistory({ storage: f.manager().storage });
  assert.equal(h.begin({ mode: 'invalid' }), false); h.begin({ mode: 'havoc' }); h.finish('won'); assert.equal(h.summary().wins, 1);
  const blocked = createPlayerHistory(); blocked.begin({ mode: 'havoc' }); blocked.finish('lost'); assert.equal(blocked.persistent, false); assert.equal(blocked.summary().losses, 1);
});
