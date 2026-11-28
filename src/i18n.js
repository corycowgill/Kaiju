import menu from './locales/menu.js';
import online from './locales/online.js';
import play from './locales/play.js';
import details from './locales/details.js';
import templates from './locales/templates.js';
import trophies from './locales/trophies.js';
import { ACHIEVEMENTS } from './achievements.js';

export const LANGUAGE_KEY = 'kaiju_language_v1';
export const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English' }, { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' }, { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' },
]);
const codes = LANGUAGES.map((l) => l.code);
export const normalizeLanguage = (value) => codes.includes(value) ? value : 'en';
const key = (s) => String(s).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const messages = new Map(), reverse = new Map();
function add(source, values) {
  if (!source || values.length !== 4 || values.some((v) => !v)) throw Error(`Incomplete translation: ${source}`);
  messages.set(key(source), { source, values: Object.fromEntries(codes.slice(1).map((code, i) => [code, values[i]])) });
  for (const value of values) if (!reverse.has(key(value))) reverse.set(key(value), source);
}
for (const file of [menu, play, details, templates, online]) for (const row of file.trim().split('\n').filter((row) => row.trim())) {
  const [source, ...values] = row.split('|'); add(source, values);
}
for (const row of trophies.trim().split('\n').filter((row) => row.trim())) {
  const [id, ...values] = row.split('|'), a = ACHIEVEMENTS.find((a) => a.id === id);
  if (!a || values.length !== 8) throw Error(`Invalid trophy translations: ${id}`);
  add(a.name, values.slice(0, 4)); add(a.description, values.slice(4));
}
export const TRANSLATION_MESSAGES = Object.freeze([...messages.values()]);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = TRANSLATION_MESSAGES.filter((m) => /\{\w+\}/.test(m.source)).map((m) => {
  const slots = [...m.source.matchAll(/\{(\w+)\}/g)].map((v) => v[1]);
  const numeric = new Set(['count', 'done', 'total', 'goal', 'time', 'distance']);
  const regex = m.source.split(/(\{\w+\})/).map((part) => {
    const token = /^\{(\w+)\}$/.exec(part);
    return token ? numeric.has(token[1]) ? '([0-9][0-9\\s.,:%/–—+\\-]*)' : '([^·•]+?)' : escapeRegex(part);
  }).join('');
  return { ...m, slots, regex: new RegExp('^' + regex + '$', 'i') };
});

export function createLocalization({ storage } = {}) {
  let language = 'en', persistent = !!storage, boundStorage = storage;
  const listeners = new Set(), translatedSources = new Map();
  function load() {
    try { language = normalizeLanguage(boundStorage?.getItem(LANGUAGE_KEY)); }
    catch { language = 'en'; persistent = false; }
  }
  load();
  function translate(source, depth = 0) {
    if (source === null || source === undefined) return '';
    const original = String(source);
    if (!original.trim() || depth > 8) return original;
    const text = original.trim().replace(/\s+/g, ' ');
    const canonical = translatedSources.get(text) || (messages.has(key(text)) ? text : reverse.get(key(text))) || text;
    const direct = messages.get(key(canonical));
    let result = language === 'en' ? canonical : direct?.values[language];
    if (language !== 'en' && result === undefined) {
      for (const pattern of patterns) {
        const match = pattern.regex.exec(canonical);
        if (!match) continue;
        const vars = Object.fromEntries(pattern.slots.map((slot, i) => [slot, ['city', 'mode', 'power', 'medal', 'status', 'label'].includes(slot) ? translate(match[i + 1], depth + 1) : match[i + 1]]));
        result = pattern.values[language].replace(/\{(\w+)\}/g, (_, slot) => vars[slot]); break;
      }
      if (result === undefined) {
        // Separators are structural, not sentence word-by-word translation.
        const parts = canonical.split(/(\s*[·•]\s*|\s+\/\s+|\s+\+\s+)/);
        if (parts.length > 1) result = parts.map((part, i) => i % 2 ? part : translate(part, depth + 1)).join('');
        else {
          const wrapper = /^([★✓◆◇⚠︎▶＋+\d\s/.:!–—-]*)([A-Za-z][\s\S]*?)([!→…:.,\s]*)$/.exec(canonical);
          if (wrapper && (wrapper[1] || wrapper[3]) && wrapper[2] !== canonical) result = wrapper[1] + translate(wrapper[2], depth + 1) + wrapper[3];
          else result = canonical;
        }
      }
    }
    if (language !== 'en' && /[A-Z]/.test(canonical) && canonical === canonical.toUpperCase()) result = result.toLocaleUpperCase(language);
    if (result !== text && language !== 'en') {
      if (translatedSources.size >= 2000) translatedSources.delete(translatedSources.keys().next().value);
      translatedSources.set(result, canonical);
    }
    if (result === text) return original;
    return original.slice(0, original.indexOf(original.trim())) + result + original.slice(original.indexOf(original.trim()) + original.trim().length);
  }
  return {
    getLanguage: () => language, get persistent() { return persistent; }, translate,
    t(source, values = {}) { return translate(source).replace(/\{(\w+)\}/g, (m, slot) => Object.hasOwn(values, slot) ? String(values[slot]) : m); },
    bindStorage(next) { boundStorage = next; persistent = !!next; load(); for (const listener of listeners) listener(language); },
    setLanguage(next) {
      if (!codes.includes(next)) throw Error('Choose a supported language.');
      try { if (!boundStorage) throw Error('No storage'); boundStorage.setItem(LANGUAGE_KEY, next); persistent = true; } catch { persistent = false; }
      language = next; for (const listener of listeners) listener(language); return persistent;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    formatNumber(value, options) { return Number(value).toLocaleString(language, options); },
  };
}
export const i18n = createLocalization();
