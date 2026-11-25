import { createPlayerProfiles } from './playerProfiles.js';
let browserStorage;
try { browserStorage = window.localStorage; } catch { /* session-only play */ }
export const playerProfiles = createPlayerProfiles({ storage: browserStorage });
export const playerStorage = playerProfiles.storage;
