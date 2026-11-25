import { TROPHY_ROSTER, TROPHY_CITIES } from './achievements.js';
import { LANGUAGE_KEY, normalizeLanguage } from './i18n.js';
// Each game instance holds a storage adapter bound to one profile. Switching
// reloads the game; delayed writes/pagehide from the old instance stay with it.
export const PROFILE_INDEX_KEY = 'kaiju_profiles_v1';
export const PROFILE_PREFIX = 'kaiju_profile_v1:';
export const PROFILE_SAVE_KEYS = Object.freeze(['kaiju_achievements_v1', 'kaiju_championship_tour_v1', 'kaiju_city_challenges_v1', 'kaiju_highscore', 'kaijuLevel', 'kaijuMenuPick', 'kaijuWrTut', 'kaiju_history_v1', LANGUAGE_KEY]);
export const localPlayerId = () => globalThis.crypto?.randomUUID?.() || `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id);
export const profileName = (name) => Array.from(String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join('');


export const PROFILE_BACKUP_FORMAT = 'kaiju-havoc-profile';
export const MAX_PROFILE_BACKUP_BYTES = 2 * 1024 * 1024;
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const date = (v) => Number.isFinite(v) && v >= 0 && v <= 8640000000000000;
const backupError = () => Error('This is not a valid Kaiju Havoc profile backup.');
function checkTree(value, depth = 0, budget = { left: 20000 }) {
  if (--budget.left < 0 || depth > 16) throw backupError();
  if (typeof value === 'number' && !Number.isFinite(value)) throw backupError();
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw backupError();
    checkTree(child, depth + 1, budget);
  }
}
function validateSave(key, text) {
  if (typeof text !== 'string') throw backupError();
  if (key === LANGUAGE_KEY) { if (normalizeLanguage(text) !== text) throw backupError(); return; }
  if (key === 'kaiju_highscore') { if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw backupError(); return; }
  if (key === 'kaijuLevel') { if (!['tokyo', 'chicago', 'dc', 'nyc', 'seattle', 'sf'].includes(text)) throw backupError(); return; }
  let value;
  try { value = JSON.parse(text); } catch { throw backupError(); }
  if (!record(value)) throw backupError();
  checkTree(value);
  if (key === 'kaijuMenuPick') {
    const allowed = { mode: ['havoc', 'title', 'vs', 'lone'], monster: TROPHY_ROSTER, rival: ['', ...TROPHY_ROSTER], role: ['infantry', 'tank', 'helicopter'], players: ['solo', 'local'], devices: ['auto', 'keyboard', 'mixed', 'pads'] };
    for (const [field, options] of Object.entries(allowed)) if (Object.hasOwn(value, field) && !options.includes(value[field])) throw backupError();
  }
  if (key === 'kaijuWrTut' && Object.values(value).some((n) => !Number.isFinite(n) || n < 0)) throw backupError();
  if (['kaiju_achievements_v1', 'kaiju_championship_tour_v1', 'kaiju_city_challenges_v1', 'kaiju_history_v1'].includes(key)) {
    if (value.version !== 1) throw Error('This backup uses a save version this game cannot restore.');
    if (key === 'kaiju_achievements_v1') {
      if (!record(value.stats) || !record(value.unlocked) || !record(value.sets)) throw backupError();
      if (Object.values(value.stats).some((n) => !Number.isFinite(n) || n < 0) || Object.values(value.unlocked).some((n) => !date(n))) throw backupError();
      for (const [set, items] of Object.entries(value.sets)) {
        const allowed = set === 'roster' ? TROPHY_ROSTER : TROPHY_CITIES;
        if (!['roster', 'cities', 'championCities'].includes(set) || !Array.isArray(items) || items.some((item) => !allowed.includes(item))) throw backupError();
      }
    }
    if (['kaiju_championship_tour_v1', 'kaiju_city_challenges_v1'].includes(key) && !record(value.records)) throw backupError();
    if (key === 'kaiju_history_v1' && (!record(value.totals) || !Array.isArray(value.recent) || value.recent.length > 100 || value.active !== null && !record(value.active))) throw backupError();
  }
}
export function parseProfileBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_PROFILE_BACKUP_BYTES) throw Error('Backup files must be 2 MB or smaller.');
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw backupError(); }
  if (!record(value) || value.format !== PROFILE_BACKUP_FORMAT) throw backupError();
  if (value.version !== 1) throw Error('This backup version is not supported by this game.');
  checkTree(value);
  if (!record(value.profile) || typeof value.profile.name !== 'string' || !profileName(value.profile.name) || !date(value.profile.created) || !date(value.exportedAt) || !record(value.data)) throw backupError();
  const data = {};
  for (const [key, saved] of Object.entries(value.data)) {
    if (!PROFILE_SAVE_KEYS.includes(key)) throw backupError();
    validateSave(key, saved); data[key] = saved;
  }
  return { format: PROFILE_BACKUP_FORMAT, version: 1, exportedAt: value.exportedAt,
    profile: { name: profileName(value.profile.name), created: value.profile.created }, data };
}

export function createPlayerProfiles({ storage, now = Date.now, makeId = localPlayerId } = {}) {
  let persistent = !!storage, index, memory = new Map();
  function readIndex() {
    const source = storage?.getItem(PROFILE_INDEX_KEY);
    if (!source) return null;
    const value = JSON.parse(source);
    if (value.version !== 1 || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 8 || !value.profiles.every((p) => validId(p.id) && typeof p.name === 'string' && profileName(p.name) && Number.isFinite(p.created)) || new Set(value.profiles.map((p) => p.id)).size !== value.profiles.length || !value.profiles.some((p) => p.id === value.active)) throw Error('Invalid profile index');
    return value;
  }
  try { index = readIndex(); } catch { persistent = false; }
  if (!index) {
    const data = {};
    for (const key of PROFILE_SAVE_KEYS) { try { const value = storage?.getItem(key); if (typeof value === 'string') data[key] = value; } catch { persistent = false; } }
    index = { version: 1, active: 'player-1', profiles: [{ id: 'player-1', name: 'Player 1', created: now() }] };
    memory.set('player-1', data);
    // Snapshot first, then publish the migration marker. Legacy saves remain
    // untouched as a backup and are never imported into a second profile.
    if (persistent) try {
      if (!storage.getItem(PROFILE_PREFIX + 'player-1')) storage.setItem(PROFILE_PREFIX + 'player-1', JSON.stringify(data));
      else memory.set('player-1', JSON.parse(storage.getItem(PROFILE_PREFIX + 'player-1')));
      storage.setItem(PROFILE_INDEX_KEY, JSON.stringify(index));
    } catch { persistent = false; }
  }
  const boundId = index.active;
  function dataFor(id) {
    if (persistent) try {
      const raw = storage.getItem(PROFILE_PREFIX + id), value = raw ? JSON.parse(raw) : {};
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid profile save');
      memory.set(id, value);
    } catch { persistent = false; }
    return memory.get(id) || {};
  }
  dataFor(boundId);
  function latest() { if (!persistent) throw Error('Local storage is unavailable. Profile changes require working storage.'); const value = readIndex(); if (!value) throw Error('Profile list is unavailable. Reload to recover.'); return value; }
  function writeIndex(value) { storage.setItem(PROFILE_INDEX_KEY, JSON.stringify(value)); index = value; }
  const adapter = {
    getItem(key) { if (!PROFILE_SAVE_KEYS.includes(key)) return null; return dataFor(boundId)[key] ?? null; },
    setItem(key, value) {
      if (!PROFILE_SAVE_KEYS.includes(key)) throw Error('Unknown player save');
      const data = { ...dataFor(boundId), [key]: String(value) }; memory.set(boundId, data);
      try {
        if (!latest().profiles.some((p) => p.id === boundId)) throw Error('This profile was removed in another tab');
        storage.setItem(PROFILE_PREFIX + boundId, JSON.stringify(data));
      } catch (error) { persistent = false; throw error; }
    },
  };
  return {
    storage: adapter, get id() { return boundId; }, get persistent() { return persistent; },
    get current() { return { ...index.profiles.find((p) => p.id === boundId) }; },
    list() { try { if (persistent) index = readIndex() || index; } catch { persistent = false; } return index.profiles.map((p) => ({ ...p })); },
    read(id, key) { return index.profiles.some((p) => p.id === id) ? dataFor(id)[key] ?? null : null; },
    create(name, { language = 'en' } = {}) {
      name = profileName(name); if (!name) throw Error('Enter a player name.');
      const value = latest(); if (value.profiles.length >= 8) throw Error('Up to eight local profiles can be saved.');
      if (value.profiles.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('Choose a different player name.');
      const id = makeId(); if (!validId(id) || value.profiles.some((p) => p.id === id)) throw Error('Could not create a unique player.');
      const fresh = { [LANGUAGE_KEY]: normalizeLanguage(language) };
      storage.setItem(PROFILE_PREFIX + id, JSON.stringify(fresh));
      writeIndex({ ...value, profiles: [...value.profiles, { id, name, created: now() }] });
      memory.set(id, fresh); return id;
    },
    backup(id = boundId) {
      try { if (persistent) index = readIndex() || index; } catch { persistent = false; }
      const player = index.profiles.find((p) => p.id === id);
      if (!player) throw Error('Player no longer exists.');
      const source = dataFor(id), data = {};
      for (const key of PROFILE_SAVE_KEYS) if (source[key] !== undefined && source[key] !== null) data[key] = source[key];
      const text = JSON.stringify({ format: PROFILE_BACKUP_FORMAT, version: 1, exportedAt: now(), profile: { name: player.name, created: player.created }, data }, null, 2);
      parseProfileBackup(text); // Never download a file this version cannot restore.
      return text;
    },
    restoreBackup(text, name) {
      const backup = parseProfileBackup(text);
      name = profileName(name ?? backup.profile.name);
      if (!name) throw Error('Enter a player name.');
      const value = latest();
      if (value.profiles.length >= 8) throw Error('Up to eight local profiles can be saved.');
      if (value.profiles.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('Choose a different player name.');
      const id = makeId();
      if (!validId(id) || value.profiles.some((p) => p.id === id)) throw Error('Could not create a unique player.');
      const key = PROFILE_PREFIX + id;
      try {
        storage.setItem(key, JSON.stringify(backup.data));
        writeIndex({ ...value, profiles: [...value.profiles, { id, name, created: backup.profile.created }] });
      } catch {
        try { storage.removeItem(key); } catch { /* Unpublished data is inert. */ }
        throw Error('Could not save the restored profile. Free browser storage and try again.');
      }
      memory.set(id, backup.data); return id;
    },
    rename(name) {
      name = profileName(name); if (!name) throw Error('Enter a player name.');
      const value = latest();
      if (value.profiles.some((p) => p.id !== boundId && p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('Choose a different player name.');
      writeIndex({ ...value, profiles: value.profiles.map((p) => p.id === boundId ? { ...p, name } : p) });
    },
    switchTo(id) { const value = latest(); if (!value.profiles.some((p) => p.id === id)) throw Error('Player no longer exists.'); writeIndex({ ...value, active: id }); },
    remove(id) {
      const value = latest(); if (id === boundId || id === value.active) throw Error('Switch to another player before deleting this profile.');
      if (!value.profiles.some((p) => p.id === id)) throw Error('Player no longer exists.');
      writeIndex({ ...value, profiles: value.profiles.filter((p) => p.id !== id) });
      // The index is authoritative: an interrupted cleanup cannot resurrect it.
      try { storage.removeItem(PROFILE_PREFIX + id); } catch { /* orphan is inert */ }
      memory.delete(id);
    },
  };
}
