import test from 'node:test';
import assert from 'node:assert/strict';
import { createChampionshipTour, TOUR_STAGES, TOUR_FIGHTERS, TOUR_SAVE_KEY, tourEncounter, bindTourMatch } from '../src/championshipTour.js';
import { createBus } from '../src/wrestling/events.js';
import { placeText } from '../src/wrestling/venue.js';
import { fitsMatchFormat } from '../src/wrestling/commentary.js';
import { VO_LINES } from '../src/wrestling/commentaryLines.js';

function fixture(initial) {
  let saved = initial;
  const storage = { getItem: () => saved, setItem: (key, value) => { assert.equal(key, TOUR_SAVE_KEY); saved = value; } };
  const tour = createChampionshipTour({ storage, now: () => 1795564800000 });
  return { tour, saved: () => saved, reload: () => createChampionshipTour({ storage }) };
}
function winNext(tour) {
  const planned = tour.prepare(); assert.ok(planned);
  assert.ok(tour.start(planned.ticket));
  return tour.finish(planned.ticket, { winner: 'player', playerFalls: planned.encounter.final ? 3 : 2, rivalFalls: 0, time: 100 });
}

test('all nine fighters have seven deterministic distinct non-mirror opponents and rising pressure', () => {
  assert.equal(TOUR_STAGES.length, 7);
  assert.equal(new Set(TOUR_STAGES.slice(0, 6).map((s) => s.level)).size, 6);
  for (const fighter of TOUR_FIGHTERS) {
    const route = TOUR_STAGES.map((_, i) => tourEncounter(fighter, i));
    assert.equal(new Set(route.map((e) => e.rival)).size, 7);
    assert.ok(route.every((e) => e.rival !== fighter && TOUR_FIGHTERS.includes(e.rival)));
    assert.deepEqual(tourEncounter(fighter, 6), route[6]);
    assert.ok(route.every((e, i) => !i || e.hp > route[i - 1].hp && e.attack > route[i - 1].attack && e.difficulty > route[i - 1].difficulty));
    assert.equal(route[6].bestOf, 5); assert.ok(route.slice(0, 6).every((e) => e.bestOf === 3));
  }
  assert.equal(tourEncounter('made-up', 0), null); assert.equal(tourEncounter('godzilla', 7), null);
});

test('six city wins unlock the world final; only three falls earn the final crown', () => {
  const { tour, reload } = fixture();
  for (let i = 0; i < 6; i++) {
    assert.equal(tour.progress().next.index, i);
    assert.equal(winNext(tour).belts, i + 1);
    assert.equal(reload().progress().wins.length, i + 1);
  }
  const planned = tour.prepare(); tour.start(planned.ticket);
  assert.ok(planned.encounter.final); assert.equal(tour.progress().complete, false);
  assert.equal(tour.finish(planned.ticket, { winner: 'player', playerFalls: 2, rivalFalls: 0, time: 10 }), null);
  const result = tour.finish(planned.ticket, { winner: 'player', playerFalls: 3, rivalFalls: 2, time: 125 });
  assert.ok(result.complete); assert.equal(result.belts, 6); assert.equal(result.wins.length, 7);
  assert.equal(tour.prepare(), null); assert.equal(reload().progress().complete, true);
});

test('losses and cancelled loads preserve all belts; attempts count actual starts only', () => {
  const { tour, reload } = fixture(); winNext(tour);
  const cancelled = tour.prepare(); tour.cancel(cancelled.ticket);
  assert.equal(tour.progress().attempts[1], 0);
  assert.equal(tour.start(cancelled.ticket), false);
  const lost = tour.prepare(); assert.ok(tour.start(lost.ticket)); assert.equal(tour.start(lost.ticket), false);
  const result = tour.finish(lost.ticket, { winner: 'rival', playerFalls: 1, rivalFalls: 2, time: 60 });
  assert.equal(result.belts, 1); assert.equal(result.next.index, 1); assert.equal(result.attempts[1], 1);
  assert.deepEqual(reload().progress(), tour.progress());
  winNext(tour); assert.equal(tour.progress().attempts[1], 2); assert.equal(tour.progress().belts, 2);
});

test('each fighter keeps a separate career, including selection on reload', () => {
  const { tour, reload } = fixture(); winNext(tour); winNext(tour);
  tour.select('ferrumaw'); assert.equal(tour.progress().belts, 0); winNext(tour);
  assert.equal(reload().selected, 'ferrumaw');
  tour.select('godzilla'); assert.equal(tour.progress().belts, 2);
  assert.equal(tour.select('fake'), false); assert.equal(tour.selected, 'godzilla');
});

test('stale, duplicate, unstarted and invalid match results cannot award belts', () => {
  const { tour } = fixture(); const stale = tour.prepare(), current = tour.prepare();
  const result = { winner: 'player', playerFalls: 2, rivalFalls: 0, time: 60 };
  assert.equal(tour.start(stale.ticket), false);
  assert.equal(tour.finish(current.ticket, result), null);
  tour.start(current.ticket);
  for (const bad of [{ ...result, time: NaN }, { ...result, playerFalls: 1 }, { ...result, rivalFalls: 2 }, { ...result, winner: 'env' }]) assert.equal(tour.finish(current.ticket, bad), null);
  assert.ok(tour.finish(current.ticket, result)?.won);
  assert.equal(tour.finish(current.ticket, result), null);
  assert.equal(tour.progress().belts, 1);
  const copy = tour.progress(); copy.wins.length = 0; copy.attempts[0] = 999;
  assert.equal(tour.progress().belts, 1); assert.equal(tour.progress().attempts[0], 1);
});

test('reload abandons an unfinished match but retains completed cities and attempts', () => {
  const { tour, reload } = fixture(); winNext(tour);
  const inFlight = tour.prepare(); tour.start(inFlight.ticket);
  const restored = reload();
  assert.equal(restored.progress().belts, 1); assert.equal(restored.progress().attempts[1], 1);
  assert.equal(restored.finish(inFlight.ticket, { winner: 'player', playerFalls: 2, rivalFalls: 0, time: 1 }), null);
});

test('malformed saves validate the route prefix rather than unlocking later cities', () => {
  for (const initial of ['bad json', '{"version":3}', '{"version":1,"selected":"fake","records":{"godzilla":{"wins":[{"id":"world","playerFalls":3,"rivalFalls":0,"time":2,"at":1}],"attempts":[-1,"bad"]}}}']) {
    const { tour } = fixture(initial); assert.equal(tour.selected, 'godzilla'); assert.equal(tour.progress().belts, 0);
  }
  const f = fixture(); winNext(f.tour);
  const saved = JSON.parse(f.saved()); saved.records.godzilla.wins.push({ id: 'dc', playerFalls: 2, rivalFalls: -1, at: 1, time: 1 });
  assert.equal(fixture(JSON.stringify(saved)).tour.progress().belts, 1);
});

test('blocked storage keeps a playable session and reports that saving is unavailable', () => {
  const tour = createChampionshipTour({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } } });
  assert.equal(tour.persistent, false); winNext(tour); assert.equal(tour.progress().belts, 1); assert.equal(tour.persistent, false);
});

test('wrestling event adapter captures only match results and releases listeners', () => {
  const bus = createBus(), { tour } = fixture(), planned = tour.prepare();
  const release = bindTourMatch(bus, { onStart: () => tour.start(planned.ticket), onResult: (r) => tour.finish(planned.ticket, r) });
  bus.emit('match:start');
  Object.assign(bus.ev('fall:end'), { winner: 'player', playerFalls: 1 }); bus.emit('fall:end');
  assert.equal(tour.progress().belts, 0);
  Object.assign(bus.ev('match:won'), { playerFalls: 2, rivalFalls: 1, time: 123 }); bus.emit('match:won');
  assert.equal(tour.progress().belts, 1); release();
  const next = tour.prepare(); bus.emit('match:start'); assert.ok(tour.start(next.ticket));
});

test('world final text names the world title while preserving Tokyo venue references', () => {
  const ctx = { world: { level: 'tokyo' }, tour: tourEncounter('godzilla', 6) };
  assert.equal(placeText(ctx, 'CHICAGO HEAVYWEIGHT CHAMPION'), 'WORLD HEAVYWEIGHT CHAMPION');
  assert.equal(placeText(ctx, 'Chicago Heavyweight title'), 'World Heavyweight title');
  assert.equal(placeText(ctx, 'Chicago'), 'Tokyo');
});

test('best-of-five commentary omits recordings that announce best two out of three', () => {
  const formatRow = VO_LINES.find((row) => row[2].some((u) => u[1].includes('Best two out of three')));
  assert.ok(formatRow);
  assert.equal(fitsMatchFormat(formatRow, 3), true);
  assert.equal(fitsMatchFormat(formatRow, 5), false);
  assert.ok(VO_LINES.filter((row) => fitsMatchFormat(row, 5)).length > VO_LINES.length - 10);
});
