// Each game instance holds a storage adapter bound to one profile. Switching
// reloads the game; delayed writes/pagehide from the old instance stay with it.
export const PROFILE_INDEX_KEY = 'kaiju_profiles_v1';
export const PROFILE_PREFIX = 'kaiju_profile_v1:';
export const PROFILE_SAVE_KEYS = Object.freeze(['kaiju_achievements_v1', 'kaiju_championship_tour_v1', 'kaiju_city_challenges_v1', 'kaiju_highscore', 'kaijuLevel', 'kaijuMenuPick', 'kaijuWrTut', 'kaiju_history_v1']);
export const localPlayerId = () => globalThis.crypto?.randomUUID?.() || `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id);
export const profileName = (name) => Array.from(String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join('');

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
    create(name) {
      name = profileName(name); if (!name) throw Error('Enter a player name.');
      const value = latest(); if (value.profiles.length >= 8) throw Error('Up to eight local profiles can be saved.');
      if (value.profiles.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('Choose a different player name.');
      const id = makeId(); if (!validId(id) || value.profiles.some((p) => p.id === id)) throw Error('Could not create a unique player.');
      storage.setItem(PROFILE_PREFIX + id, '{}');
      writeIndex({ ...value, profiles: [...value.profiles, { id, name, created: now() }] });
      memory.set(id, {}); return id;
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
