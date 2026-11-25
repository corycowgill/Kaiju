import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, CHALLENGE_CITIES, CHALLENGE_SAVE_KEY, challengeMedal, createHavocChallenges, createChallengeAttempt, selectChallengeTargets } from '../src/havocChallenges.js';
import { missionClock } from '../src/havocChallengeMode.js';

const mission = (kind) => CHALLENGES.find((m) => m.kind === kind);
function fixture(initial) {
  let saved = initial;
  const storage = { getItem: () => saved, setItem: (key, value) => { assert.equal(key, CHALLENGE_SAVE_KEY); saved = value; } };
  return { ledger: createHavocChallenges({ storage, now: () => 1795564800000 }), saved: () => saved, reload: () => createHavocChallenges({ storage }) };
}
function recordWin(ledger, m, time = 30, score = 1000) {
  const planned = ledger.prepare(m.id); assert.ok(planned); assert.ok(ledger.start(planned.ticket));
  return ledger.finish(planned.ticket, { won: true, reason: 'OBJECTIVE COMPLETE', time, score });
}
function attempt(kind, callbacks = {}) {
  const m = mission(kind), targets = kind === 'siege' ? [] : Array.from({ length: m.goal }, () => ({ destroyed: false }));
  const protectedBuildings = kind === 'precision' ? Array.from({ length: 3 }, () => ({ destroyed: false })) : [];
  const api = createChallengeAttempt({ mission: m, targets, protected: protectedBuildings, ...callbacks });
  api.start(); return { api, m, targets, protectedBuildings };
}

test('24 missions offer four distinct types in each city and sensible medal thresholds', () => {
  assert.equal(CHALLENGES.length, 24); assert.equal(new Set(CHALLENGES.map((m) => m.id)).size, 24);
  for (const city of CHALLENGE_CITIES) assert.equal(CHALLENGES.filter((m) => m.city === city).length, 4);
  for (const m of CHALLENGES) {
    assert.ok(m.gold < m.silver && m.silver < m.limit);
    assert.equal(challengeMedal(m, m.gold), 3); assert.equal(challengeMedal(m, m.silver), 2);
    assert.equal(challengeMedal(m, m.limit - .01), 1); assert.equal(challengeMedal(m, m.limit), 0);
    assert.equal(challengeMedal(m, NaN), 0); assert.equal(challengeMedal(m, -1), 0);
  }
});

test('complete all four city missions to unlock the next, with 24 golds and 72 points reachable', () => {
  const { ledger, reload } = fixture();
  assert.ok(!ledger.unlocked('tokyo')); assert.equal(ledger.prepare('tokyo-trial'), null);
  for (let rank = 0; rank < 6; rank++) {
    assert.ok(ledger.unlocked(CHALLENGE_CITIES[rank]));
    const missions = CHALLENGES.filter((m) => m.rank === rank);
    missions.forEach((m, i) => { recordWin(ledger, m); if (i < 3 && rank < 5) assert.equal(ledger.unlocked(CHALLENGE_CITIES[rank + 1]), false); });
  }
  assert.deepEqual(ledger.summary(), { completed: 24, gold: 24, medalPoints: 72, siege: 6, precision: 6, trials: 6 });
  assert.deepEqual(reload().summary(), ledger.summary());
});

test('replays cannot downgrade medals or time records, while scores keep their independent best', () => {
  const { ledger, reload } = fixture(), m = mission('demolition');
  assert.ok(recordWin(ledger, m, 30, 1000).personalBest);
  assert.equal(recordWin(ledger, m, m.silver + 1, 5000).personalBest, false);
  const r = ledger.record(m.id); assert.equal(r.medal, 3); assert.equal(r.bestTime, 30); assert.equal(r.bestScore, 5000);
  assert.equal(ledger.summary().completed, 1); assert.equal(ledger.summary().gold, 1);
  assert.deepEqual(reload().record(m.id), r);
});

test('aborted loading, losses, duplicate and stale results never award medals', () => {
  const { ledger } = fixture(), m = mission('demolition');
  const a = ledger.prepare(m.id); ledger.cancel(a.ticket); assert.equal(ledger.start(a.ticket), false);
  assert.equal(ledger.record(m.id).attempts, 0);
  const b = ledger.prepare(m.id); ledger.start(b.ticket); assert.equal(ledger.start(b.ticket), false);
  assert.equal(ledger.finish(a.ticket, { won: true, time: 1, score: 1 }), null);
  assert.equal(ledger.finish(b.ticket, { won: false, time: 5, score: 20 }).medal, 0);
  assert.equal(ledger.finish(b.ticket, { won: true, time: 1, score: 1 }), null);
  assert.equal(ledger.summary().completed, 0); assert.equal(ledger.record(m.id).attempts, 1);
});

test('bad save data cannot unlock cities, and blocked storage retains a playable session', () => {
  for (const data of ['bad json', '{"version":2}', '{"version":1,"city":"tokyo","fighter":"bad","records":{"chicago-demolition":{"medal":3,"bestTime":-1}}}']) {
    const { ledger } = fixture(data); assert.equal(ledger.summary().completed, 0); assert.equal(ledger.city, 'chicago'); assert.equal(ledger.fighter, 'godzilla');
  }
  const ledger = createHavocChallenges({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } } });
  recordWin(ledger, mission('demolition')); assert.equal(ledger.persistent, false); assert.equal(ledger.summary().completed, 1);
});

test('selected fighter and city persist, while an interrupted attempt grants no medal', () => {
  const f = fixture(); for (const m of CHALLENGES.filter((m) => m.city === 'chicago')) recordWin(f.ledger, m);
  f.ledger.selectCity('dc'); f.ledger.selectFighter('ferrumaw');
  const p = f.ledger.prepare('dc-siege'); f.ledger.start(p.ticket);
  const loaded = f.reload(); assert.equal(loaded.city, 'dc'); assert.equal(loaded.fighter, 'ferrumaw');
  assert.equal(loaded.record('dc-siege').attempts, 1); assert.equal(loaded.record('dc-siege').medal, 0);
  assert.equal(loaded.finish(p.ticket, { won: true, time: 1, score: 1 }), null);
});

test('demolition counts only actual marked targets destroyed by the player', () => {
  const { api, targets } = attempt('demolition');
  api.building(targets[0]); assert.equal(api.remaining, targets.length);
  api.building({ destroyed: true }); assert.equal(api.remaining, targets.length);
  for (const b of targets) { b.destroyed = true; api.building(b); }
  assert.equal(api.result, null, 'completion is deferred until the frame is resolved');
  api.step(.05, { hp: 100, score: 123 }); assert.ok(api.result.won); assert.equal(api.result.score, 123);
});

test('a precision blast that destroys its target and a protected building fails regardless of damage order', () => {
  for (const protectFirst of [true, false]) {
    const { api, targets, protectedBuildings } = attempt('precision');
    if (protectFirst) protectedBuildings[0].destroyed = true;
    targets[0].destroyed = true; api.building(targets[0]);
    if (!protectFirst) protectedBuildings[0].destroyed = true;
    api.step(.05, { hp: 100 });
    assert.equal(api.result.won, false); assert.equal(api.result.reason, 'PROTECTED BUILDING LOST');
  }
  const clean = attempt('precision'); clean.targets[0].destroyed = true; clean.api.building(clean.targets[0]); clean.api.step(.05, { hp: 100 }); assert.ok(clean.api.result.won);
});

test('timer advances only when stepped, caps long/background frames and rejects invalid deltas', () => {
  const { api, m } = attempt('demolition');
  assert.equal(api.elapsed, 0); api.step(-1); api.step(NaN); assert.equal(api.elapsed, 0);
  api.step(1000, { hp: 100 }); assert.equal(api.elapsed, .25);
  while (!api.result) api.step(.25, { hp: 100 });
  assert.equal(api.result.won, false); assert.equal(api.result.reason, 'TIME EXPIRED'); assert.equal(api.elapsed, m.limit);
  assert.equal(missionClock(59.9), '1:00'); assert.equal(missionClock(60), '1:00'); assert.equal(missionClock(-1), '0:00');
});

test('death beats mission completion, and a single finish callback cannot reenter or award twice', () => {
  let calls = 0; const { api, targets } = attempt('demolition', { onFinish: () => calls++ });
  for (const b of targets) { b.destroyed = true; api.building(b); }
  api.step(.1, { hp: 0 }); assert.equal(api.result.won, false);
  api.finish(true, 'fake', 99); api.step(.1, { hp: 100 }); assert.equal(calls, 1);
});

test('siege advances exactly three waves and requires the final boss to be defeated', () => {
  const waves = []; const { api } = attempt('siege', { onWave: (n) => waves.push(n) });
  api.kill('boss'); // an unrelated earlier boss cannot satisfy the final assault
  api.step(1 / 60, { hp: 100, armyRemaining: 2 }); assert.deepEqual(waves, [0]);
  api.step(1 / 60, { hp: 100, armyRemaining: 0 }); assert.deepEqual(waves, [0, 1]);
  api.step(1 / 60, { hp: 100, armyRemaining: 0 }); assert.deepEqual(waves, [0, 1, 2]);
  api.step(1 / 60, { hp: 100, armyRemaining: 0 }); assert.equal(api.result, null);
  api.kill('boss', 'env'); api.step(1 / 60, { hp: 100, armyRemaining: 0 }); assert.equal(api.result, null);
  api.kill('boss'); api.step(1 / 60, { hp: 100, armyRemaining: 0 }); assert.ok(api.result.won);
});

test('power trials allow melee plus exactly their listed ability', () => {
  for (const m of CHALLENGES.filter((m) => m.kind === 'trial')) {
    const api = createChallengeAttempt({ mission: m, targets: Array.from({ length: m.goal }, () => ({})) });
    assert.ok(api.allows('melee')); assert.equal(m.allowed.length, 2);
    assert.equal(api.allows('ult'), false);
    for (const power of ['beam', 'roar', 'charge', 'stomp']) assert.equal(api.allows(power), m.allowed.includes(power));
  }
});

test('target selection skips bridges, destroyed structures and the spawn, and protects actual neighbors', () => {
  const buildings = Array.from({ length: 16 }, (_, i) => ({ x: 35 + i * 10, z: 20, hp: 100, h: 15, w: 8, d: 8, landmarkId: i === 5 ? 'test_landmark' : '' }));
  const bridge = { ...buildings[0], x: 29, isBridge: true }, destroyed = { ...buildings[0], destroyed: true }, spawn = { ...buildings[0], x: 0, z: 0 };
  const all = [bridge, destroyed, spawn, ...buildings];
  const selection = selectChallengeTargets(mission('demolition'), all, { x: 0, z: 0 });
  assert.equal(selection.targets.length, mission('demolition').goal); assert.ok(selection.targets.every((b) => buildings.includes(b)));
  const precise = selectChallengeTargets(mission('precision'), all, { x: 0, z: 0 });
  assert.equal(precise.targets[0].landmarkId, 'test_landmark'); assert.equal(precise.protected.length, 3);
  assert.ok(precise.protected.every((b) => b !== precise.targets[0]));
  assert.throws(() => selectChallengeTargets(mission('precision'), [], { x: 0, z: 0 }));
});
