// Persistent, renderer-independent trophy ledger. Only an active Havoc run or
// the wrestling event bus can advance it; rivals, previews and other modes cannot.
export const ACHIEVEMENT_KEY = 'kaiju_achievements_v1';
export const TROPHY_TIERS = Object.freeze({ bronze: 15, silver: 30, gold: 90, platinum: 180 });
export const TROPHY_ROSTER = Object.freeze(['godzilla', 'ghidorah', 'mecha', 'cindervault', 'brineveil', 'rimehorn', 'vesperax', 'thornwake', 'ferrumaw']);
export const TROPHY_CITIES = Object.freeze(['tokyo', 'chicago', 'dc', 'nyc', 'seattle', 'sf']);

// The icon index is a cell in the custom 8 x 6 trophy atlas (row-major).
const trophy = (id, name, description, mode, tier, stat, goal, scope = 'career') =>
  ({ id, name, description, mode, tier, points: TROPHY_TIERS[tier], stat, goal, scope });
export const ACHIEVEMENTS = Object.freeze([
  trophy('first-impact', 'First Impact', 'Destroy your first building in Havoc.', 'havoc', 'bronze', 'h.buildings', 1),
  trophy('block-party', 'Block Party', 'Destroy 25 buildings in one Havoc run.', 'havoc', 'bronze', 'h.buildingsRun', 25, 'best run'),
  trophy('skyline-erased', 'Skyline Erased', 'Destroy 100 buildings in one Havoc run.', 'havoc', 'gold', 'h.buildingsRun', 100, 'best run'),
  trophy('demolition-career', 'Demolition Career', 'Destroy 500 buildings across Havoc runs.', 'havoc', 'silver', 'h.buildings', 500),
  trophy('rush-hour', 'Rush Hour', 'Crush 50 cars across Havoc runs.', 'havoc', 'bronze', 'h.cars', 50),
  trophy('tank-you-next', 'Tank You, Next', 'Destroy 25 tanks in Havoc.', 'havoc', 'bronze', 'h.tanks', 25),
  trophy('no-fly-zone', 'No-Fly Zone', 'Destroy 25 helicopters or jets in Havoc.', 'havoc', 'silver', 'h.aircraft', 25),
  trophy('scrap-metal', 'Scrap Metal', 'Destroy 10 mechs in Havoc.', 'havoc', 'silver', 'h.mechs', 10),
  trophy('boss-breaker', 'Boss Breaker', 'Defeat a boss in Havoc.', 'havoc', 'silver', 'h.bosses', 1),
  trophy('apex-predator', 'Apex Predator', 'Defeat five bosses across Havoc runs.', 'havoc', 'gold', 'h.bosses', 5),
  trophy('army-of-none', 'Army of None', 'Destroy 250 military units in Havoc.', 'havoc', 'silver', 'h.kills', 250),
  trophy('chain-reaction', 'Chain Reaction', 'Reach a 10-hit destruction combo in Havoc.', 'havoc', 'bronze', 'h.combo', 10, 'best combo'),
  trophy('unstoppable', 'Unstoppable', 'Reach a 40-hit combo and the 5x multiplier in Havoc.', 'havoc', 'gold', 'h.combo', 40, 'best combo'),
  trophy('kaiju-carnage', 'Kaiju Carnage', 'Chain six military kills with no gap longer than 1.4 seconds in Havoc.', 'havoc', 'silver', 'h.multikill', 6, 'best streak'),
  trophy('making-headlines', 'Making Headlines', 'Score 10,000 points in one Havoc run.', 'havoc', 'bronze', 'h.score', 10000, 'best run'),
  trophy('front-page-monster', 'Front-Page Monster', 'Score 100,000 points in one Havoc run.', 'havoc', 'gold', 'h.score', 100000, 'best run'),
  trophy('opening-act', 'Opening Act', 'Clear the first wave in Havoc.', 'havoc', 'bronze', 'h.wave', 1, 'best run'),
  trophy('against-the-odds', 'Against the Odds', 'Clear wave five in Havoc.', 'havoc', 'silver', 'h.wave', 5, 'best run'),
  trophy('extinction-event', 'Extinction Event', 'Clear wave twelve in Havoc.', 'havoc', 'gold', 'h.wave', 12, 'best run'),
  trophy('overachiever', 'Overachiever', 'Complete 10 wave objectives in Havoc.', 'havoc', 'silver', 'h.objectives', 10),
  trophy('rubble-rewards', 'Rubble Rewards', 'Collect 25 pickups in Havoc.', 'havoc', 'bronze', 'h.pickups', 25),
  trophy('nuclear-option', 'The Nuclear Option', 'Unleash an ultimate in Havoc.', 'havoc', 'bronze', 'h.ultimates', 1),
  trophy('full-arsenal', 'Full Arsenal', 'Use beam, roar, charge, stomp and ultimate in one Havoc run.', 'havoc', 'silver', 'h.powers', 5, 'best run'),
  trophy('ten-minute-menace', 'Ten-Minute Menace', 'Survive 10 minutes of active play in one Havoc run.', 'havoc', 'gold', 'h.seconds', 600, 'best run'),
  trophy('main-event-debut', 'Main Event Debut', 'Enter your first wrestling title match.', 'wrestling', 'bronze', 'w.matches', 1),
  trophy('and-new', 'And New…', 'Win a wrestling title match.', 'wrestling', 'silver', 'w.wins', 1),
  trophy('belt-collector', 'Belt Collector', 'Win 10 wrestling matches, including title defenses.', 'wrestling', 'gold', 'w.wins', 10),
  trophy('and-still', 'And Still…', 'Successfully defend your wrestling title.', 'wrestling', 'silver', 'w.defense', 1, 'best reign'),
  trophy('dynasty', 'Dynasty', 'Win three consecutive title defenses in one reign.', 'wrestling', 'gold', 'w.defense', 3, 'best reign'),
  trophy('clean-sweep', 'Clean Sweep', 'Win a wrestling match without losing a fall.', 'wrestling', 'silver', 'w.sweeps', 1),
  trophy('never-say-die', 'Never Say Die', 'Lose the opening fall, then win the wrestling match.', 'wrestling', 'gold', 'w.comebacks', 1),
  trophy('one-two-three', 'One. Two. Three.', 'Win a wrestling fall by pin without a forced knockout cover.', 'wrestling', 'bronze', 'w.pins', 1),
  trophy('lights-out', 'Lights Out', 'Knock out your wrestling rival yourself.', 'wrestling', 'bronze', 'w.kos', 1),
  trophy('finishing-touch', 'Finishing Touch', 'Land your wrestling finisher.', 'wrestling', 'silver', 'w.finishers', 1),
  trophy('heavy-hands', 'Heavy Hands', 'Land 100 strikes in wrestling.', 'wrestling', 'silver', 'w.strikes', 100),
  trophy('read-like-a-book', 'Read Like a Book', 'Reverse 10 strikes or grabs in wrestling.', 'wrestling', 'silver', 'w.reversals', 10),
  trophy('suplex-city', 'Suplex City', 'Land 10 suplexes in wrestling.', 'wrestling', 'silver', 'w.suplexes', 10),
  trophy('spin-cycle', 'Spin Cycle', 'Complete three turns in a single wrestling giant swing.', 'wrestling', 'silver', 'w.spins', 3, 'best swing'),
  trophy('signature-style', 'Signature Style', 'Perform both of your kaiju’s signature grapples in one match.', 'wrestling', 'silver', 'w.signatures', 2, 'best match'),
  trophy('not-today', 'Not Today', 'Escape a 2.9-count near-fall in wrestling.', 'wrestling', 'gold', 'w.nearKickouts', 1),
  trophy('urban-renewal', 'Urban Renewal', 'Send your wrestling rival into three buildings in one throw.', 'wrestling', 'gold', 'w.throwBuildings', 3, 'best throw'),
  trophy('hostile-architecture', 'Hostile Architecture', 'Hit your wrestling rival with a lifted building or prop.', 'wrestling', 'bronze', 'w.propHits', 1),
  trophy('foreign-object', 'Foreign Object', 'Break a weapon on your rival in wrestling.', 'wrestling', 'bronze', 'w.weaponBreaks', 1),
  trophy('crowd-favorite', 'Crowd Favorite', 'Complete five uninterrupted taunts in wrestling.', 'wrestling', 'bronze', 'w.taunts', 5),
  trophy('monster-ensemble', 'Monster Ensemble', 'Play all nine kaiju in Havoc or wrestling.', 'legacy', 'gold', 'm.roster', 9),
  trophy('world-tour', 'World Tour', 'Play in all six cities in Havoc or wrestling.', 'legacy', 'silver', 'm.cities', 6),
  trophy('world-champion', 'World Champion', 'Win a wrestling match in each of the six cities.', 'legacy', 'gold', 'm.championCities', 6),
  trophy('kaiju-immortal', 'Kaiju Immortal', 'Earn all 47 original Havoc, wrestling and Legacy trophies.', 'legacy', 'platinum', 'm.trophies', 47),
  ...[
    trophy('challenge-accepted', 'Challenge Accepted', 'Earn a medal in a Havoc City Challenge.', 'havoc', 'bronze', 'c.completed', 1),
    trophy('golden-rampage', 'Golden Rampage', 'Earn your first gold City Challenge medal.', 'havoc', 'silver', 'c.gold', 1),
    trophy('siege-breaker', 'Siege Breaker', 'Complete Military Siege in all six cities.', 'havoc', 'gold', 'c.siege', 6),
    trophy('urban-surgeon', 'Urban Surgeon', 'Complete a Precision Rampage while preserving all three protected buildings.', 'havoc', 'silver', 'c.precision', 1),
    trophy('power-specialist', 'Power Specialist', 'Complete Power Trial in all six cities.', 'havoc', 'gold', 'c.trials', 6),
    trophy('medal-titan', 'Medal Titan', 'Earn gold medals in all 24 City Challenges.', 'havoc', 'gold', 'c.gold', 24),
  ].map((a, artIndex) => ({ ...a, art: 'challenges', artIndex })),
  { ...trophy('america-first', 'America First', 'Destroyed Trump Tower in Havoc mode.', 'havoc', 'gold', 'h.trumpTower', 1), art: 'america-first' },
].map((a, icon) => Object.freeze({ ...a, icon })));

// New content never revokes or expands the original Platinum requirement.
const immortalRequirements = ACHIEVEMENTS.slice(0, 47);

const knownStats = new Set(ACHIEVEMENTS.map((a) => a.stat));
const knownIds = new Set(ACHIEVEMENTS.map((a) => a.id));
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function createAchievementTracker({ storage, now = Date.now, onUnlock = () => {}, onChange = () => {} } = {}) {
  let stats = {}, unlocked = {}, run = null, timer = null, dirty = false;
  let persistent = !!storage;
  const sets = { roster: new Set(), cities: new Set(), championCities: new Set() };
  try {
    const saved = JSON.parse(storage?.getItem(ACHIEVEMENT_KEY) || 'null');
    if (saved?.version === 1) {
      for (const [k, v] of Object.entries(saved.stats || {})) if (knownStats.has(k) && finite(v)) stats[k] = Math.min(v, 1e12);
      for (const [k, v] of Object.entries(saved.unlocked || {})) if (knownIds.has(k) && finite(v)) unlocked[k] = v;
      for (const k of Object.keys(sets)) {
        const allowed = k === 'roster' ? TROPHY_ROSTER : TROPHY_CITIES;
        if (Array.isArray(saved.sets?.[k])) for (const v of saved.sets[k]) if (allowed.includes(v)) sets[k].add(v);
      }
    }
  } catch { /* Invalid saves start clean; unavailable storage keeps a session ledger. */ }
  stats['m.roster'] = sets.roster.size;
  stats['m.cities'] = sets.cities.size;
  stats['m.championCities'] = sets.championCities.size;
  stats['m.trophies'] = immortalRequirements.filter((a) => a.id in unlocked).length;

  function flush() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(ACHIEVEMENT_KEY, JSON.stringify({ version: 1, stats, unlocked,
        sets: Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, [...s]])) }));
      dirty = false; persistent = true;
    } catch { persistent = false; }
  }
  function commit() {
    dirty = true;
    const earned = [];
    for (const a of ACHIEVEMENTS) {
      if (a.stat === 'm.trophies') stats[a.stat] = immortalRequirements.filter((t) => t.id in unlocked).length;
      if (!(a.id in unlocked) && (stats[a.stat] || 0) >= a.goal) {
        unlocked[a.id] = now(); earned.push(a);
      }
    }
    // Unlocks are durable before presentation. High-frequency progress coalesces.
    if (earned.length) flush();
    else if (timer === null) timer = setTimeout(flush, 350);
    for (const a of earned) onUnlock(a);
    onChange();
  }
  function inc(stat, amount = 1) { stats[stat] = Math.min(1e12, (stats[stat] || 0) + amount); }
  function max(stat, value) {
    if (!finite(value) || value <= (stats[stat] || 0)) return false;
    stats[stat] = Math.min(1e12, value); return true;
  }

  const api = {
    get persistent() { return persistent; },
    get mode() { return run?.mode || null; },
    progress(a) { return a.id in unlocked ? a.goal : Math.min(a.goal, stats[a.stat] || 0); },
    unlockedAt(id) { return unlocked[id] ?? null; },
    summary() {
      const earned = ACHIEVEMENTS.filter((a) => a.id in unlocked);
      return { unlocked: earned.length, total: ACHIEVEMENTS.length, points: earned.reduce((s, a) => s + a.points, 0),
        totalPoints: ACHIEVEMENTS.reduce((s, a) => s + a.points, 0) };
    },
    beginRun({ mode, monster, level }) {
      api.endRun();
      if (mode !== 'havoc' && mode !== 'wrestling') return;
      run = { mode, level, buildings: 0, powers: new Set(), match: null, seconds: 0 };
      if (TROPHY_ROSTER.includes(monster)) sets.roster.add(monster);
      if (TROPHY_CITIES.includes(level)) sets.cities.add(level);
      stats['m.roster'] = sets.roster.size; stats['m.cities'] = sets.cities.size;
      commit();
    },
    endRun() { run = null; flush(); },
    havoc(event, value = 1) {
      if (run?.mode !== 'havoc') return;
      if (event === 'building') {
        inc('h.buildings'); max('h.buildingsRun', ++run.buildings);
        if (value?.landmarkId === 'trump_tower') max('h.trumpTower', 1);
      }
      else if (event === 'kill') {
        if (!['tank', 'heli', 'jet', 'mech', 'boss', 'soldier', 'artillery'].includes(value)) return;
        inc('h.kills');
        if (value === 'tank') inc('h.tanks');
        if (value === 'heli' || value === 'jet') inc('h.aircraft');
        if (value === 'mech') inc('h.mechs');
        if (value === 'boss') inc('h.bosses');
      } else if (event === 'power') {
        if (!['beam', 'roar', 'charge', 'stomp', 'ult'].includes(value)) return;
        run.powers.add(value); max('h.powers', run.powers.size);
        if (value === 'ult') inc('h.ultimates');
      } else if (['cars', 'objectives', 'pickups'].includes(event)) inc('h.' + event);
      else if (['combo', 'multikill', 'score', 'wave'].includes(event)) {
        if (!max('h.' + event, value)) return;
      } else return;
      commit();
    },
    // Only active gameplay time is supplied here; loading, background tabs,
    // menus, pauses and the other game modes never contribute to survival.
    advance(seconds, score) {
      if (run?.mode !== 'havoc' || !finite(seconds)) return;
      run.seconds += Math.min(seconds, 0.25);
      const changedScore = max('h.score', score);
      if (max('h.seconds', Math.floor(run.seconds)) || changedScore) commit();
    },
    wrestling(event, e = {}) {
      if (run?.mode !== 'wrestling') return;
      if (event === 'match:start') { run.match = { openingLost: false, signatures: new Set(), over: false }; inc('w.matches'); }
      else if (!run.match || run.match.over) return;
      else if (event === 'fall:end') { if (e.fall === 1 && e.winner === 'rival') run.match.openingLost = true; return; }
      else if (event === 'match:won') {
        run.match.over = true; inc('w.wins'); max('w.defense', e.defense);
        if (e.rivalFalls === 0) inc('w.sweeps');
        if (run.match.openingLost) inc('w.comebacks');
        if (TROPHY_CITIES.includes(run.level)) sets.championCities.add(run.level);
        stats['m.championCities'] = sets.championCities.size;
      } else if (event === 'match:lost') { run.match.over = true; return; }
      else if (event === 'ko') { if (e.who !== 'rival' || e.by !== 'player') return; inc('w.kos'); }
      else if (event === 'building:impact') { if (e.by !== 'player' || e.who !== 'rival' || !e.type || !max('w.throwBuildings', e.count)) return; }
      else {
        if (e.who !== 'player') return;
        if (event === 'pin:fall') { if (e.forced) return; inc('w.pins'); }
        else if (event === 'finisher:impact') inc('w.finishers');
        else if (event === 'strike:landed') inc('w.strikes');
        else if (event === 'strike:reversed' || event === 'grab:reversed') inc('w.reversals');
        else if (event === 'throw:land') { if (e.type !== 'suplex') return; inc('w.suplexes'); }
        else if (event === 'swing:spin') { if (!max('w.spins', e.turns)) return; }
        else if (event === 'grab:move') {
          if (e.type !== 'signature' || ![1, 2].includes(e.sig)) return;
          run.match.signatures.add(e.sig); max('w.signatures', run.match.signatures.size);
        } else if (event === 'pin:kickout') { if (!e.near) return; inc('w.nearKickouts'); }
        else if (event === 'prop:hit') { if (e.target !== 'rival') return; inc('w.propHits'); }
        else if (event === 'weapon:break') { if (e.target !== 'rival') return; inc('w.weaponBreaks'); }
        else if (event === 'taunt:complete') inc('w.taunts');
        else return;
      }
      commit();
    },
    flush,
    challenges(summary) {
      let changed = false;
      for (const key of ['completed', 'gold', 'siege', 'precision', 'trials']) if (max('c.' + key, summary[key])) changed = true;
      if (changed) commit();
    },
  };
  return api;
}
