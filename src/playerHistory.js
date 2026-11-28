import { localPlayerId } from './playerProfiles.js';
export const HISTORY_KEY = 'kaiju_history_v1';
const modes = ['havoc', 'title', 'vs', 'lone', 'challenge', 'tour', 'local-title', 'local-vs', 'online-title', 'online-vs'];
const outcomes = ['won', 'lost', 'left', 'interrupted'];
const number = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(n, 1e12) : 0;
const timestamp = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(n, 8640000000000000) : 0;
const text = (s) => typeof s === 'string' ? s.slice(0, 100) : '';
function cleanRun(r) {
  if (!r || !modes.includes(r.mode)) return null;
  return { id: text(r.id), mode: r.mode, fighter: text(r.fighter), city: text(r.city), mission: text(r.mission), opponent: text(r.opponent),
    started: timestamp(r.started), seconds: number(r.seconds), score: number(r.score), wave: number(r.wave),
    medal: Math.min(3, number(r.medal)), playerFalls: number(r.playerFalls), rivalFalls: number(r.rivalFalls),
    outcome: outcomes.includes(r.outcome) ? r.outcome : null, ended: timestamp(r.ended) };
}
export function createPlayerHistory({ storage, now = Date.now, makeId = localPlayerId } = {}) {
  let recent = [], totals = { played: 0, wins: 0, losses: 0, seconds: 0 }, active = null, sinceSave = 0, persistent = !!storage;
  try {
    const saved = JSON.parse(storage?.getItem(HISTORY_KEY) || 'null');
    if (saved?.version === 1) {
      recent = (Array.isArray(saved.recent) ? saved.recent : []).map(cleanRun).filter((r) => r?.outcome).slice(0, 100);
      for (const key of Object.keys(totals)) totals[key] = number(saved.totals?.[key]);
      active = cleanRun(saved.active);
    }
  } catch { /* damaged history cannot affect achievements/campaigns */ }
  function flush() {
    sinceSave = 0;
    try { if (!storage) throw Error('No storage'); storage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, recent, totals, active })); persistent = true; }
    catch { persistent = false; }
  }
  function finish(outcome, result = {}) {
    if (!active || !outcomes.includes(outcome)) return null;
    const record = cleanRun({ ...active, ...result, id: active.id, mode: active.mode, fighter: active.fighter, city: active.city, mission: active.mission, started: active.started, outcome, ended: now() });
    active = null; recent.unshift(record); recent.length = Math.min(100, recent.length);
    totals.played++; totals.seconds += record.seconds;
    if (outcome === 'won') totals.wins++; else if (outcome === 'lost') totals.losses++;
    flush(); return { ...record };
  }
  if (active) finish('interrupted');
  return {
    get persistent() { return persistent; }, get active() { return active ? { ...active } : null; },
    cancel() { active = null; flush(); },
    summary: () => ({ ...totals }), recent: () => recent.map((r) => ({ ...r })), flush, finish,
    begin(run) {
      if (!modes.includes(run.mode)) return false;
      if (active) finish('left');
      active = cleanRun({ ...run, id: makeId(), started: now(), seconds: 0 }); flush(); return true;
    },
    advance(dt, score, wave) {
      if (!active || !Number.isFinite(dt) || dt < 0) return;
      const seconds = Math.min(.25, dt); active.seconds += seconds; active.score = number(score); active.wave = number(wave);
      sinceSave += seconds; if (sinceSave >= 15) flush();
    },
  };
}
