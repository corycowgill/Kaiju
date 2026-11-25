// Campaign state is independent of a run: leaving, losing or reloading never
// erases a belt. Only an actual, completed wrestling match advances the route.
export const TOUR_SAVE_KEY = 'kaiju_championship_tour_v1';
export const TOUR_FIGHTERS = Object.freeze(['godzilla', 'ghidorah', 'mecha', 'cindervault', 'brineveil', 'rimehorn', 'vesperax', 'thornwake', 'ferrumaw']);
export const TOUR_STAGES = Object.freeze([
  { id: 'chicago', level: 'chicago', name: 'Chicago', title: 'WINDY CITY TITLE', tag: 'THE OPENING BELL', hp: 1, attack: 0, difficulty: 0 },
  { id: 'dc', level: 'dc', name: 'Washington DC', title: 'NATIONAL MALL TITLE', tag: 'CAPITAL PUNISHMENT', hp: 1.06, attack: .07, difficulty: .14 },
  { id: 'nyc', level: 'nyc', name: 'New York City', title: 'MIDTOWN TITLE', tag: 'THE BIG LEAGUES', hp: 1.12, attack: .14, difficulty: .28 },
  { id: 'seattle', level: 'seattle', name: 'Seattle', title: 'EMERALD CITY TITLE', tag: 'RISING PRESSURE', hp: 1.18, attack: .21, difficulty: .42 },
  { id: 'sf', level: 'sf', name: 'San Francisco', title: 'GOLDEN GATE TITLE', tag: 'GOLD RUSH', hp: 1.24, attack: .28, difficulty: .56 },
  { id: 'tokyo', level: 'tokyo', name: 'Tokyo', title: 'TOKYO HEAVYWEIGHT TITLE', tag: 'THE LAST CITY BELT', hp: 1.3, attack: .35, difficulty: .7 },
  { id: 'world', level: 'tokyo', name: 'World Championship', title: 'WORLD HEAVYWEIGHT TITLE', tag: 'THE FINAL SHOWDOWN', hp: 1.4, attack: .46, difficulty: .9, final: true },
].map((s, index) => Object.freeze({ ...s, index, bestOf: s.final ? 5 : 3 })));

export function tourEncounter(fighter, index) {
  if (!TOUR_FIGHTERS.includes(fighter) || !Number.isInteger(index) || !TOUR_STAGES[index]) return null;
  const rivals = TOUR_FIGHTERS.filter((key) => key !== fighter);
  return Object.freeze({ ...TOUR_STAGES[index], fighter, rival: rivals[index === 6 ? 7 : index] });
}

const validNumber = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const emptyRecord = () => ({ wins: [], attempts: Array(7).fill(0) });
export function createChampionshipTour({ storage, now = Date.now, onChange = () => {} } = {}) {
  let selected = TOUR_FIGHTERS[0], records = {}, active = null, sequence = 0, persistent = !!storage;
  const record = (key) => records[key] || (records[key] = emptyRecord());
  try {
    const saved = JSON.parse(storage?.getItem(TOUR_SAVE_KEY) || 'null');
    if (saved?.version === 1) {
      if (TOUR_FIGHTERS.includes(saved.selected)) selected = saved.selected;
      for (const key of TOUR_FIGHTERS) {
        const source = saved.records?.[key];
        if (!source || typeof source !== 'object') continue;
        const clean = emptyRecord();
        if (Array.isArray(source.wins)) for (let i = 0; i < Math.min(source.wins.length, 7); i++) {
          const win = source.wins[i], need = Math.floor(TOUR_STAGES[i].bestOf / 2) + 1;
          if (!win || win.id !== TOUR_STAGES[i].id || win.playerFalls !== need || !Number.isInteger(win.rivalFalls) || win.rivalFalls < 0 || win.rivalFalls >= need || !validNumber(win.time) || !validNumber(win.at)) break;
          clean.wins.push({ id: win.id, playerFalls: need, rivalFalls: win.rivalFalls, time: Math.min(win.time, 86400), at: win.at });
        }
        if (Array.isArray(source.attempts)) clean.attempts = clean.attempts.map((_, i) => Number.isSafeInteger(source.attempts[i]) && source.attempts[i] >= 0 ? Math.min(source.attempts[i], 1000000) : 0);
        records[key] = clean;
      }
    }
  } catch (e) { if (e?.name !== 'SyntaxError') persistent = false; }
  function save() {
    try {
      if (!storage) throw new Error('No storage');
      storage.setItem(TOUR_SAVE_KEY, JSON.stringify({ version: 1, selected, records }));
      persistent = true;
    } catch { persistent = false; }
    onChange();
  }
  const api = {
    get selected() { return selected; },
    get persistent() { return persistent; },
    select(key) {
      if (!TOUR_FIGHTERS.includes(key)) return false;
      selected = key; save(); return true;
    },
    progress(key = selected) {
      if (!TOUR_FIGHTERS.includes(key)) return null;
      const r = record(key);
      return { fighter: key, wins: r.wins.map((w) => ({ ...w })), attempts: [...r.attempts],
        belts: Math.min(6, r.wins.length), complete: r.wins.length === 7,
        next: tourEncounter(key, r.wins.length) };
    },
    prepare() {
      const encounter = api.progress().next;
      if (!encounter) return null;
      const ticket = Object.freeze({ fighter: selected, stage: encounter.index, serial: ++sequence });
      active = { ticket, started: false, encounter };
      return { ticket, encounter };
    },
    start(ticket) {
      if (active?.ticket !== ticket || active.started) return false;
      active.started = true;
      record(ticket.fighter).attempts[ticket.stage]++;
      save(); return true;
    },
    finish(ticket, result) {
      if (active?.ticket !== ticket || !active.started) return null;
      const need = Math.floor(active.encounter.bestOf / 2) + 1;
      const { winner, playerFalls, rivalFalls, time } = result;
      if (!['player', 'rival'].includes(winner) || !Number.isInteger(playerFalls) || !Number.isInteger(rivalFalls) || playerFalls < 0 || rivalFalls < 0 || !validNumber(time)) return null;
      if (winner === 'player' ? playerFalls !== need || rivalFalls >= need : rivalFalls !== need || playerFalls >= need) return null;
      const r = record(ticket.fighter);
      if (r.wins.length !== ticket.stage) return null;
      active = null; // a duplicate result or a disposed match cannot award twice
      if (winner === 'player') r.wins.push({ id: TOUR_STAGES[ticket.stage].id, playerFalls, rivalFalls, time: Math.min(time, 86400), at: now() });
      save();
      return { won: winner === 'player', ...api.progress(ticket.fighter) };
    },
    cancel(ticket) { if (active?.ticket === ticket) active = null; },
    flush: save,
  };
  return api;
}

// Listen before the director starts; do not retain the bus's reusable payload.
export function bindTourMatch(bus, tour) {
  if (!tour) return () => {};
  const offs = [bus.on('match:start', () => tour.onStart()),
    bus.on('match:won', (e) => tour.onResult({ winner: 'player', playerFalls: e.playerFalls, rivalFalls: e.rivalFalls, time: e.time })),
    bus.on('match:lost', (e) => tour.onResult({ winner: 'rival', playerFalls: e.playerFalls, rivalFalls: e.rivalFalls, time: e.time }))];
  return () => offs.forEach((off) => off());
}
