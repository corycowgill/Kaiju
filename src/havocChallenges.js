export const CHALLENGE_SAVE_KEY = 'kaiju_city_challenges_v1';
export const CHALLENGE_CITIES = Object.freeze(['chicago', 'dc', 'nyc', 'seattle', 'sf', 'tokyo']);
export const CHALLENGE_NAMES = Object.freeze({ chicago: 'Chicago', dc: 'Washington DC', nyc: 'New York City', seattle: 'Seattle', sf: 'San Francisco', tokyo: 'Tokyo' });
export const CHALLENGE_TYPES = Object.freeze(['demolition', 'siege', 'precision', 'trial']);
const types = {
  demolition: ['Demolition Run', 'Destroy every gold-marked target before time runs out. Marked targets have weakened foundations.'],
  siege: ['Military Siege', 'Clear three military assaults, including the boss in the final assault.'],
  precision: ['Precision Rampage', 'Destroy the gold-marked landmark while keeping all three green-marked buildings standing. The landmark has weakened foundations.'],
  trial: ['Power Trial', 'Destroy every gold-marked target using only melee and the listed power. Marked targets have weakened foundations.'],
};
export const CHALLENGES = Object.freeze(CHALLENGE_CITIES.flatMap((city, rank) => CHALLENGE_TYPES.map((kind) => Object.freeze({
  id: `${city}-${kind}`, city, rank, kind, name: types[kind][0], description: types[kind][1],
  goal: kind === 'precision' ? 1 : kind === 'siege' ? 3 : (kind === 'trial' ? 5 : 6) + rank,
  limit: (kind === 'siege' ? 300 : kind === 'precision' ? 210 : 180) + rank * 10,
  gold: (kind === 'siege' ? 160 : kind === 'precision' ? 85 : 80) + rank * 5,
  silver: (kind === 'siege' ? 230 : kind === 'precision' ? 140 : 125) + rank * 7,
  allowed: kind === 'trial' ? Object.freeze(['melee', ['stomp', 'roar', 'charge', 'beam', 'stomp', 'charge'][rank]]) : null,
}))));
const byId = new Map(CHALLENGES.map((m) => [m.id, m]));
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function challengeMedal(mission, seconds) {
  return !finite(seconds) || seconds >= mission.limit ? 0 : seconds <= mission.gold ? 3 : seconds <= mission.silver ? 2 : 1;
}

export function createHavocChallenges({ storage, now = Date.now, onChange = () => {} } = {}) {
  let city = CHALLENGE_CITIES[0], fighter = 'godzilla', records = {}, active = null, serial = 0, persistent = !!storage;
  const fresh = () => ({ attempts: 0, medal: 0, bestTime: null, bestScore: 0, fighter: '', at: null });
  try {
    const saved = JSON.parse(storage?.getItem(CHALLENGE_SAVE_KEY) || 'null');
    if (saved?.version === 1) {
      if (CHALLENGE_CITIES.includes(saved.city)) city = saved.city;
      if (/^(godzilla|ghidorah|mecha|cindervault|brineveil|rimehorn|vesperax|thornwake|ferrumaw)$/.test(saved.fighter)) fighter = saved.fighter;
      for (const m of CHALLENGES) {
        const r = saved.records?.[m.id]; if (!r) continue;
        const clean = fresh();
        if (Number.isSafeInteger(r.attempts) && r.attempts >= 0) clean.attempts = Math.min(1000000, r.attempts);
        // Recompute medal from the recorded time; malformed records cannot unlock a city.
        if (finite(r.bestTime) && challengeMedal(m, r.bestTime) > 0) {
          clean.bestTime = r.bestTime; clean.medal = challengeMedal(m, r.bestTime);
          clean.bestScore = finite(r.bestScore) ? Math.min(1e12, r.bestScore) : 0;
          clean.fighter = typeof r.fighter === 'string' ? r.fighter : '';
          clean.at = finite(r.at) ? r.at : 0;
        }
        records[m.id] = clean;
      }
    }
  } catch (e) { if (e?.name !== 'SyntaxError') persistent = false; }
  function save() {
    try { if (!storage) throw Error('No storage'); storage.setItem(CHALLENGE_SAVE_KEY, JSON.stringify({ version: 1, city, fighter, records })); persistent = true; }
    catch { persistent = false; }
    onChange();
  }
  const record = (id) => records[id] || (records[id] = fresh());
  const api = {
    get city() { return city; }, get fighter() { return fighter; }, get persistent() { return persistent; },
    record(id) { return byId.has(id) ? { ...record(id) } : null; },
    unlocked(level) {
      const index = CHALLENGE_CITIES.indexOf(level);
      return index === 0 || index > 0 && CHALLENGES.filter((m) => m.rank < index).every((m) => record(m.id).medal > 0);
    },
    selectCity(level) { if (!api.unlocked(level)) return false; city = level; save(); return true; },
    selectFighter(key) { if (!/^(godzilla|ghidorah|mecha|cindervault|brineveil|rimehorn|vesperax|thornwake|ferrumaw)$/.test(key)) return false; fighter = key; save(); return true; },
    summary() {
      const completed = CHALLENGES.filter((m) => record(m.id).medal > 0), gold = CHALLENGES.filter((m) => record(m.id).medal === 3).length;
      return { completed: completed.length, gold, medalPoints: CHALLENGES.reduce((sum, m) => sum + record(m.id).medal, 0),
        siege: completed.filter((m) => m.kind === 'siege').length, precision: completed.filter((m) => m.kind === 'precision').length,
        trials: completed.filter((m) => m.kind === 'trial').length };
    },
    prepare(id) {
      const mission = byId.get(id); if (!mission || !api.unlocked(mission.city)) return null;
      const ticket = Object.freeze({ id, fighter, serial: ++serial }); active = { ticket, started: false };
      return { mission, ticket, fighter };
    },
    start(ticket) { if (active?.ticket !== ticket || active.started) return false; active.started = true; record(ticket.id).attempts++; save(); return true; },
    finish(ticket, result) {
      if (active?.ticket !== ticket || !active.started || !finite(result.time) || !finite(result.score)) return null;
      active = null;
      const mission = byId.get(ticket.id), r = record(ticket.id), medal = result.won ? challengeMedal(mission, result.time) : 0;
      const personalBest = medal > 0 && (r.bestTime === null || result.time < r.bestTime);
      if (medal) {
        if (personalBest) { r.bestTime = result.time; r.medal = medal; r.fighter = ticket.fighter; r.at = now(); }
        r.bestScore = Math.max(r.bestScore, Math.min(1e12, result.score));
      }
      save(); return { ...result, won: medal > 0, medal, personalBest, best: { ...r }, summary: api.summary() };
    },
    cancel(ticket) { if (active?.ticket === ticket) active = null; }, flush: save,
  };
  if (!api.unlocked(city)) city = CHALLENGE_CITIES[0];
  return api;
}

/** Select actual destructible structures; references never survive a world rebuild. */
export function selectChallengeTargets(mission, buildings, spawn) {
  if (mission.kind === 'siege') return { targets: [], protected: [] };
  const distance = (b, p) => Math.hypot(b.x - p.x, b.z - p.z);
  const eligible = buildings.filter((b) => !b.destroyed && !b.isBridge && !b.indestructible && finite(b.hp) && b.hp > 0 && b.h >= 8 && distance(b, spawn) >= 28);
  eligible.sort((a, b) => distance(a, spawn) - distance(b, spawn));
  let targets = eligible.slice(0, mission.goal), protectedBuildings = [];
  if (mission.kind === 'precision') {
    const landmark = eligible.find((b) => b.landmarkId);
    if (!landmark) throw Error('No destructible landmark available');
    targets = [landmark];
    protectedBuildings = eligible.filter((b) => b !== landmark).sort((a, b) => distance(a, landmark) - distance(b, landmark)).slice(0, 3);
    if (protectedBuildings.length !== 3) throw Error('Not enough structures to protect');
  }
  if (targets.length !== mission.goal) throw Error('Not enough mission targets');
  return { targets, protected: protectedBuildings };
}

export function createChallengeAttempt({ mission, targets = [], protected: protectedBuildings = [], onWave = () => {}, onStart = () => {}, onFinish = () => {} }) {
  if (mission.kind !== 'siege' && targets.length !== mission.goal) throw Error('Mission targets do not match its objective');
  if (mission.kind === 'precision' && protectedBuildings.length !== 3) throw Error('Precision mission needs three protected buildings');
  let started = false, result = null, elapsed = 0, assault = 0, bossKilled = false;
  const destroyed = new Set();
  const api = {
    get result() { return result; },
    get elapsed() { return elapsed; },
    get assault() { return assault; },
    get remaining() { return targets.filter((b) => !destroyed.has(b)).length; },
    allows(power) { return !mission.allowed || mission.allowed.includes(power); },
    start() {
      if (started) return; started = true; onStart();
      onWave(0, mission.kind === 'siege');
    },
    building(b, by = 'player') { if (started && !result && by === 'player' && b.destroyed && targets.includes(b)) destroyed.add(b); },
    kill(kind, by = 'player') { if (started && !result && assault === 2 && kind === 'boss' && by === 'player') bossKilled = true; },
    finish(won, reason, score = 0, notify = true) {
      if (result) return result;
      result = { won, reason, time: elapsed, score: finite(score) ? score : 0 };
      onFinish(result, notify); return result;
    },
    step(seconds, { hp, score = 0, armyRemaining = 0 } = {}) {
      if (!started || result || !finite(seconds)) return;
      elapsed += Math.min(.25, seconds);
      // Resolve after all damage in this frame. A blast that takes down both
      // the landmark and a protected building must never count as a success.
      if (protectedBuildings.some((b) => b.destroyed)) return api.finish(false, 'PROTECTED BUILDING LOST', score);
      if (targets.some((b) => b.destroyed && !destroyed.has(b))) return api.finish(false, 'TARGET LOST TO ANOTHER FORCE', score);
      if (hp <= 0) return api.finish(false, 'DEFEATED', score);
      if (elapsed >= mission.limit) return api.finish(false, 'TIME EXPIRED', score);
      if (mission.kind === 'siege') {
        if (armyRemaining === 0) {
          if (assault < 2) { assault++; onWave(assault, true); }
          else if (bossKilled) api.finish(true, 'SIEGE BROKEN', score);
        }
      } else if (destroyed.size === targets.length) api.finish(true, 'OBJECTIVE COMPLETE', score);
    },
  };
  return api;
}
