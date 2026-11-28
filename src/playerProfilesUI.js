import { parseProfileBackup, MAX_PROFILE_BACKUP_BYTES, profileName } from './playerProfiles.js';
import { i18n, LANGUAGES, LANGUAGE_KEY, normalizeLanguage } from './i18n.js';
import { ACHIEVEMENTS } from './achievements.js';
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parse = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const number = (n) => Number.isFinite(Number(n)) ? Math.max(0, Math.min(1e12, Number(n))) : 0;
const format = (n) => i18n.formatNumber(Math.floor(number(n)));
const duration = (s) => `${Math.floor(number(s) / 60)}:${String(Math.floor(number(s) % 60)).padStart(2, '0')}`;
const modeNames = { havoc: 'Havoc', title: 'Title Match', vs: 'VS Duel', lone: 'Lone Soldier', challenge: 'City Challenge', tour: 'Championship Tour', 'local-title': 'Local 2P Wrestling', 'local-vs': 'Local 2P Brawl', 'online-title': 'Online Wrestling', 'online-vs': 'Online VS' };
const outcomeNames = { won: 'WON', lost: 'LOST', left: 'LEFT', interrupted: 'INTERRUPTED' };

export function createPlayerProfilesUI(profiles, history, monsters, { canSwitch, onOpen, onClose, onSwitch, onBackup = () => {} }) {
  const dialog = document.createElement('dialog'); dialog.id = 'player-profiles'; dialog.className = 'campaign-menu'; dialog.setAttribute('aria-labelledby', 'pp-title');
  const languageOptions = LANGUAGES.map((l) => `<option value="${l.code}" lang="${l.code}" translate="no">${l.name}</option>`).join('');
  const backupActions = '<div class="pp-backup-actions"><button type="button" class="pp-backup-download">DOWNLOAD BACKUP</button><button type="button" class="pp-restore-open">RESTORE BACKUP</button></div>';
  dialog.innerHTML = `<div class="tour-backdrop" aria-hidden="true"></div><header class="tour-head"><div class="tour-brand">怪獣 <b>KAIJU HAVOC</b></div><div><p class="tour-kicker">YOUR PLAYERS. YOUR KAIJU LEGACY.</p><h2 id="pp-title">PLAYER PROFILES</h2></div><div class="pp-language-picker"><label for="pp-language"><span aria-hidden="true">🌐</span> Text language</label><select id="pp-language" aria-label="Text language">${languageOptions}</select></div><span class="tour-step-label">01 / PLAYER</span><button type="button" class="tour-close pp-close" aria-label="Close Player Profiles">CLOSE</button></header>
    <div class="tour-pages"><section class="tour-contender-page" data-pp-page="players"><div class="tour-showcase"><div class="tour-show-portrait"></div><div class="tour-show-copy"><span class="tour-role pp-role"></span><h3 class="tour-show-name pp-show-name"></h3><p class="tour-show-epithet pp-show-standing"></p><p class="tour-show-description">Your trophies, medals, city belts, and records. A separate career for every player on this device.</p></div></div><div class="tour-roster-side"><div class="tour-section-heading"><h3>CHOOSE YOUR PLAYER</h3><span>プレイヤー</span></div><div class="pp-players" role="group" aria-label="Choose a local player"></div><p class="tour-career-note pp-storage"></p>${backupActions}</div></section>
    <section class="pp-career-page" data-pp-page="career" hidden><div class="pp-scroll"><div class="pp-career-head"><div><p class="tour-kicker pp-career-status"></p><h3 class="pp-current"></h3><p class="pp-career-note"></p></div><button type="button" class="pp-choose">CHOOSE PLAYER</button></div><div class="pp-career-grid"><section><h3 class="pp-section-title">CAREER RECORD <span>記録</span></h3><div class="pp-stats"></div><p class="pp-audio-note">Audio remains in English.</p><section class="pp-backup-panel"><h3 class="pp-section-title">PROFILE BACKUP</h3><p>Download this player’s progress, or restore a backup as a new profile.</p>${backupActions}</section><form class="pp-rename"><label for="pp-rename-name">PLAYER NAME</label><div class="pp-form-row"><input id="pp-rename-name" name="name" maxlength="48" autocomplete="off" required><button type="submit">SAVE NAME</button></div></form><div class="pp-manage"><p>Deleting this profile removes its saved career from this browser.</p><button type="button" class="pp-delete">DELETE PROFILE</button></div></section><section><h3 class="pp-section-title">RECENT HISTORY <span>LAST 100 RESULTS</span></h3><p class="pp-history-note">Results recorded since profiles were introduced. Earlier achievements, medals, belts, and high scores are preserved.</p><ol class="pp-history"></ol></section></div></div></section>
    <section class="pp-create-page" data-pp-page="create" hidden><div class="pp-create-art" aria-hidden="true"></div><div class="pp-create-copy"><span class="tour-role">A NEW KAIJU CAREER</span><h3>MAKE YOUR MARK</h3><p>Start fresh with your own achievements, history, high score, challenge medals, and championship belts.</p><form class="pp-create"><label for="pp-new-name">NEW PLAYER NAME</label><input id="pp-new-name" name="name" maxlength="48" autocomplete="off" placeholder="Enter a player name" required><label for="pp-new-language">Text language</label><select id="pp-new-language" aria-label="New player text language">${languageOptions}</select><p>Audio remains in English.</p><small>Up to 24 characters · Saved locally · Up to 8 players</small></form></div></section><section class="pp-restore-page" data-pp-page="restore" hidden><div class="pp-scroll"><span class="tour-role">RESTORE PROFILE</span><h3 class="pp-section-title">REVIEW YOUR BACKUP</h3><p>Restoring creates a new profile. Existing players and their progress stay unchanged.</p><p class="pp-restore-file" translate="no"></p><div class="pp-restore-summary"></div><form class="pp-restore-form"><label for="pp-restore-name">RESTORED PLAYER NAME</label><input id="pp-restore-name" maxlength="48" autocomplete="off" required><p>You can choose Play as player after restoring to continue this career.</p></form></div></section></div>
    <input type="file" id="pp-backup-file" accept=".json,application/json" aria-label="Choose a profile backup" hidden>
    <footer class="tour-footer"><button type="button" class="tour-back pp-back"><span>ESC</span> BACK</button><div class="tour-footer-copy"><p class="tour-controls">ARROWS / D-PAD SELECT · ENTER / A CONFIRM · ESC / B BACK</p><p class="pp-save-note">Saved in this browser on this device. No account required.</p><p class="pp-error" role="status" aria-live="polite"></p></div><span class="tour-selection pp-selection"></span><button type="button" class="tour-launch pp-launch"></button></footer>`;
  document.body.appendChild(dialog);
  const launch = dialog.querySelector('.pp-launch');
  let returnFocus, prev = {}, cooldown = .35, pendingDelete = null, step = 'players', entryStep = 'players', selectedId = profiles.id, transitioning = false, backupText = null, backupPreview = null, backupFileName = '', backupSerial = 0;
  // Opening pauses gameplay and flushes the career; reuse that snapshot while
  // navigating so a long history is not parsed for every D-pad movement.
  const careerCache = new Map();
  const error = (message) => { dialog.querySelector('.pp-error').textContent = message; };
  function career(id) {
    if (careerCache.has(id)) return careerCache.get(id);
    const saved = parse(profiles.read(id, 'kaiju_history_v1'));
    const recent = id === profiles.id ? history.recent() : (Array.isArray(saved?.recent) ? saved.recent : []).filter((r) => r && Object.hasOwn(modeNames, r.mode) && Object.hasOwn(outcomeNames, r.outcome) && Number.isFinite(r.ended) && r.ended >= 0 && r.ended <= 8640000000000000).slice(0, 100);
    const totals = id === profiles.id ? history.summary() : saved?.totals || {};
    const trophies = parse(profiles.read(id, 'kaiju_achievements_v1'));
    const trophyCount = ACHIEVEMENTS.filter((a) => Number.isFinite(trophies?.unlocked?.[a.id])).length;
    const challenges = parse(profiles.read(id, 'kaiju_city_challenges_v1'));
    const tour = parse(profiles.read(id, 'kaiju_championship_tour_v1'));
    const medals = Object.values(challenges?.records || {}).filter((r) => r?.medal > 0).length;
    const belts = Object.values(tour?.records || {}).reduce((sum, r) => sum + Math.min(6, Array.isArray(r?.wins) ? r.wins.length : 0), 0);
    const pick = recent[0]?.fighter || parse(profiles.read(id, 'kaijuMenuPick'))?.monster || tour?.selected || challenges?.fighter || 'godzilla';
    const monster = monsters[pick] || monsters.godzilla;
    const snapshot = { recent, totals, trophyCount, medals, belts, high: format(profiles.read(id, 'kaiju_highscore')), art: new URL(`../assets/${monster.portrait}`, import.meta.url).href };
    careerCache.set(id, snapshot); return snapshot;
  }
  function refresh() {
    document.querySelectorAll('[data-player-name]').forEach((el) => { el.textContent = profiles.current.name || 'Player'; });
    if (!dialog.open) return;
    const players = profiles.list();
    if (!players.some((p) => p.id === selectedId)) selectedId = profiles.id;
    const player = players.find((p) => p.id === selectedId) || { name: 'Player' }, active = selectedId === profiles.id;
    const c = career(selectedId), editable = profiles.persistent && !transitioning, switchable = editable && canSwitch();
    dialog.dataset.step = step;
    for (const page of dialog.querySelectorAll('[data-pp-page]')) page.hidden = page.dataset.ppPage !== step;
    dialog.querySelector('.tour-step-label').textContent = step === 'players' ? '01 / PLAYER' : step === 'career' ? '02 / CAREER' : step === 'restore' ? 'RESTORE PROFILE' : 'NEW PLAYER';
    dialog.querySelector('.tour-show-portrait').style.backgroundImage = `url("${c.art}")`;
    dialog.querySelector('.pp-show-name').textContent = player.name;
    dialog.querySelector('.pp-role').textContent = active ? 'ACTIVE PLAYER' : 'YOUR NEXT LEGEND';
    dialog.querySelector('.pp-show-standing').textContent = `${c.trophyCount} / ${ACHIEVEMENTS.length} TROPHIES · BEST ${c.high}`;
    dialog.querySelector('.pp-selection').textContent = step === 'restore' ? i18n.t('RESTORE AS NEW PROFILE') : step === 'create' ? i18n.t('NEW PLAYER · FRESH CAREER') : `${player.name} · ${i18n.t(active ? 'ACTIVE PLAYER' : 'LOCAL PLAYER')}`;
    const note = !editable ? 'Local storage is unavailable. This career lasts for this session; profile changes are disabled.' : canSwitch() ? 'Each player keeps a separate career. Switching players reloads the game.' : 'Finish or quit your current run to switch players. You can still browse careers.';
    dialog.querySelector('.pp-storage').textContent = note;
    dialog.querySelector('.pp-career-note').textContent = note;
    dialog.querySelector('.pp-players').innerHTML = players.map((p) => {
      const data = p.id === selectedId ? c : career(p.id);
      return `<button type="button" class="pp-player" data-pp-select="${p.id}" aria-pressed="${p.id === selectedId}" style="--pp-art:url('${data.art}')" ${transitioning ? 'disabled' : ''}><span class="pp-avatar" aria-hidden="true">${escape(Array.from(p.name)[0].toUpperCase())}</span><span class="pp-playing">${p.id === profiles.id ? 'PLAYING' : 'LOCAL PLAYER'}</span><b>${escape(p.name)}</b><small>${data.trophyCount} / ${ACHIEVEMENTS.length} TROPHIES · BEST ${data.high}</small></button>`;
    }).join('') + `<button type="button" class="pp-new-player" ${switchable && players.length < 8 ? '' : 'disabled'}><b>＋</b><span>NEW PLAYER</span><small>${players.length} / 8 PROFILES</small></button>`;
    dialog.querySelector('.pp-current').textContent = i18n.t('{player}’s career', { player: player.name });
    const language = dialog.querySelector('#pp-language');
    language.value = active ? i18n.getLanguage() : normalizeLanguage(profiles.read(selectedId, LANGUAGE_KEY));
    language.disabled = !active || transitioning;
    dialog.querySelector('#pp-new-language').disabled = !switchable;
    dialog.querySelector('.pp-career-status').textContent = active ? 'ACTIVE PLAYER · YOUR LOCAL LEGACY' : 'LOCAL PLAYER · CAREER PREVIEW';
    dialog.querySelector('.pp-rename').hidden = !active;
    const rename = dialog.querySelector('#pp-rename-name'); rename.value = player.name;
    rename.disabled = !editable; dialog.querySelector('.pp-rename button').disabled = !editable;
    dialog.querySelector('.pp-manage').hidden = active;
    const remove = dialog.querySelector('.pp-delete'); remove.disabled = !switchable; remove.textContent = pendingDelete === selectedId ? 'CONFIRM DELETE PROFILE' : 'DELETE PROFILE';
    dialog.querySelector('#pp-new-name').disabled = !switchable || players.length >= 8;
    for (const button of dialog.querySelectorAll('.pp-backup-download')) button.disabled = transitioning;
    for (const button of dialog.querySelectorAll('.pp-restore-open')) {
      button.disabled = !switchable || players.length >= 8;
      button.title = players.length >= 8 ? 'Up to eight local profiles can be saved.' : !canSwitch() ? 'Finish your run before restoring a profile.' : 'Choose a profile backup';
    }
    if (step === 'restore' && backupPreview) {
      const data = backupPreview.data, stats = parse(data.kaiju_history_v1)?.totals || {};
      const trophies = parse(data.kaiju_achievements_v1), tour = parse(data.kaiju_championship_tour_v1), challenges = parse(data.kaiju_city_challenges_v1);
      const summary = [['ORIGINAL PLAYER', backupPreview.profile.name], ['BACKUP DATE', new Date(backupPreview.exportedAt).toLocaleString(i18n.getLanguage())],
        ['Text language', LANGUAGES.find((l) => l.code === normalizeLanguage(data[LANGUAGE_KEY])).name],
        ['TROPHIES', ACHIEVEMENTS.filter((a) => Number.isFinite(trophies?.unlocked?.[a.id])).length],
        ['HIGH SCORE', format(data.kaiju_highscore)], ['RECORDED RUNS', format(stats.played)],
        ['CITY BELTS', Object.values(tour?.records || {}).reduce((sum, r) => sum + Math.min(6, Array.isArray(r?.wins) ? r.wins.length : 0), 0)],
        ['CHALLENGE MEDALS', Object.values(challenges?.records || {}).filter((r) => r?.medal > 0).length]];
      dialog.querySelector('.pp-restore-file').textContent = backupFileName;
      dialog.querySelector('.pp-restore-summary').innerHTML = summary.map(([label, value], i) => `<div><span>${label}</span><b ${i < 3 ? 'translate="no"' : ''}>${escape(value)}</b></div>`).join('');
    }
    const total = c.totals;
    const stats = [['TROPHIES', `${c.trophyCount} / ${ACHIEVEMENTS.length}`], ['HIGH SCORE', c.high], ['CHALLENGE MEDALS', `${c.medals} / 24`], ['CITY BELTS', format(c.belts)], ['RECORDED RUNS', format(total.played)], ['WINS / LOSSES', `${format(total.wins)} / ${format(total.losses)}`], ['ACTIVE PLAY', duration(total.seconds)]];
    dialog.querySelector('.pp-stats').innerHTML = stats.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
    if (step === 'career') dialog.querySelector('.pp-history').innerHTML = c.recent.length ? c.recent.map((r) => {
      const date = new Date(r.ended).toLocaleString(i18n.getLanguage(), { dateStyle: 'medium', timeStyle: 'short' });
      const detail = [monsters[r.fighter]?.name || r.fighter || '', String(r.city || '').toUpperCase(), duration(r.seconds), `Score ${format(r.score)}`];
      if (r.mode === 'challenge') detail.push(r.mission || '', ['No medal', 'Bronze', 'Silver', 'Gold'][r.medal] || 'No medal');
      if (r.mode.startsWith('local-')) detail.push(`P2: ${monsters[r.opponent]?.name || r.opponent || 'Guest'}`);
      if (r.mode === 'title' || r.mode === 'tour' || r.mode.startsWith('local-')) detail.push(`Falls ${format(r.playerFalls)}–${format(r.rivalFalls)}`);
      return `<li><div><b>${modeNames[r.mode]}</b><span class="pp-outcome pp-${r.outcome}">${outcomeNames[r.outcome]}</span></div><p>${detail.map(escape).join(' · ')}</p><time datetime="${new Date(r.ended).toISOString()}">${escape(date)}</time></li>`;
    }).join('') : '<li class="pp-empty">No recorded results yet. Play Havoc, a title match, a challenge, or another mode to start this player’s history.</li>';
    launch.disabled = transitioning || (step === 'restore' ? !switchable || players.length >= 8 || !backupPreview : step === 'create' ? !switchable || players.length >= 8 : step === 'career' && !active ? !switchable : false);
    launch.textContent = step === 'players' ? 'VIEW CAREER →' : step === 'restore' ? 'RESTORE AS NEW PROFILE' : step === 'create' ? 'CREATE & PLAY' : active ? 'CONTINUE AS PLAYER' : 'PLAY AS PLAYER';
  }
  function focus(selector) { const node = dialog.querySelector(selector); node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: 'nearest' }); }
  function close() { if (!transitioning) dialog.close(); }
  function showStep(next) {
    step = next; pendingDelete = null; error(''); refresh();
    if (next === 'create') dialog.querySelector('#pp-new-language').value = i18n.getLanguage();
    if (next === 'players') focus(`[data-pp-select="${selectedId}"]`);
    else if (next === 'create') focus('#pp-new-name');
    else if (next === 'restore') { dialog.querySelector('.pp-restore-page .pp-scroll').scrollTop = 0; launch.focus({ preventScroll: true }); }
    else { dialog.querySelector('.pp-scroll').scrollTop = 0; launch.focus({ preventScroll: true }); }
  }
  function back() { if (transitioning) return; if (step === 'players' || step === entryStep && step === 'career') close(); else showStep('players'); }
  function open() {
    if (dialog.open || transitioning) return;
    returnFocus = document.activeElement; selectedId = profiles.id; onOpen(); careerCache.clear(); dialog.showModal(); prev = {}; cooldown = .35;
    entryStep = returnFocus?.closest?.('#gameover, #pause-menu') ? 'career' : 'players'; showStep(entryStep);
  }
  async function switchTo(id) {
    if (!canSwitch() || !profiles.persistent) throw Error('Finish your run and ensure local storage is available before switching players.');
    transitioning = true; refresh();
    try { await onSwitch(id); } catch (e) { transitioning = false; refresh(); throw e; }
  }
  dialog.querySelector('.pp-close').addEventListener('click', close);
  dialog.querySelector('.pp-back').addEventListener('click', back);
  dialog.querySelector('.pp-choose').addEventListener('click', () => { entryStep = 'players'; showStep('players'); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); back(); });
  dialog.addEventListener('close', () => { backupSerial++; onClose(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  function uniqueRestoreName(name) {
    const names = new Set(profiles.list().map((p) => p.name.toLocaleLowerCase()));
    if (!names.has(name.toLocaleLowerCase())) return name;
    for (let n = 2; n < 100; n++) {
      const suffix = ` (${n})`, candidate = Array.from(name).slice(0, 24 - suffix.length).join('') + suffix;
      if (!names.has(candidate.toLocaleLowerCase())) return candidate;
    }
    return profileName(name);
  }
  for (const button of dialog.querySelectorAll('.pp-backup-download')) button.addEventListener('click', () => {
    if (transitioning) return;
    try {
      onBackup();
      const text = profiles.backup(selectedId), preview = parseProfileBackup(text);
      const slug = preview.profile.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 50) || 'player';
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `kaiju-${slug}-${new Date(preview.exportedAt).toISOString().slice(0, 10)}.json`;
      dialog.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      error('Backup download started. Keep this file to restore your progress.');
    } catch (e) { error(e.message); }
  });
  const backupInput = dialog.querySelector('#pp-backup-file');
  for (const button of dialog.querySelectorAll('.pp-restore-open')) button.addEventListener('click', () => {
    if (!canSwitch() || !profiles.persistent || transitioning || profiles.list().length >= 8) return;
    backupInput.value = ''; backupInput.click();
  });
  backupInput.addEventListener('change', async () => {
    const file = backupInput.files?.[0]; if (!file) return;
    const serial = ++backupSerial; backupPreview = null; backupText = null;
    try {
      if (file.size > MAX_PROFILE_BACKUP_BYTES) throw Error('Backup files must be 2 MB or smaller.');
      const text = await file.text(), preview = parseProfileBackup(text);
      if (serial !== backupSerial || !dialog.open) return;
      backupText = text; backupPreview = preview; backupFileName = file.name;
      dialog.querySelector('#pp-restore-name').value = uniqueRestoreName(preview.profile.name);
      showStep('restore');
    } catch (e) { if (serial === backupSerial && dialog.open) { error(e.message); refresh(); } }
  });
  dialog.querySelector('.pp-restore-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!backupText || transitioning || !canSwitch()) return;
    try {
      const id = profiles.restoreBackup(backupText, dialog.querySelector('#pp-restore-name').value);
      selectedId = id; backupText = null; backupPreview = null; careerCache.clear(); entryStep = 'players';
      showStep('career'); error('Profile restored. Choose Play as player to switch.');
    } catch (e) { error(e.message); refresh(); }
  });
  dialog.querySelector('.pp-create').addEventListener('submit', async (e) => {
    e.preventDefault(); if (transitioning) return;
    try {
      if (!canSwitch() || !profiles.persistent) throw Error('Finish your run before creating a player.');
      const id = profiles.create(dialog.querySelector('#pp-new-name').value, { language: dialog.querySelector('#pp-new-language').value }); selectedId = id; showStep('career'); await switchTo(id);
    } catch (e) { error(e.message); refresh(); }
  });
  dialog.querySelector('#pp-language').addEventListener('change', (e) => {
    if (selectedId !== profiles.id || transitioning) return;
    const saved = i18n.setLanguage(e.target.value);
    error(saved ? 'Language saved to this player profile.' : 'Language changed for this session. Browser storage is unavailable.');
  });
  i18n.subscribe(() => { careerCache.clear(); refresh(); });
  dialog.querySelector('.pp-rename').addEventListener('submit', (e) => {
    e.preventDefault(); if (transitioning || selectedId !== profiles.id) return;
    try { profiles.rename(dialog.querySelector('#pp-rename-name').value); refresh(); error('Player name saved.'); } catch (e) { error(e.message); }
  });
  dialog.querySelector('.pp-players').addEventListener('click', (e) => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    if (button.classList.contains('pp-new-player')) { showStep('create'); return; }
    selectedId = button.dataset.ppSelect; pendingDelete = null; error(''); refresh(); focus(`[data-pp-select="${selectedId}"]`);
  });
  dialog.querySelector('.pp-delete').addEventListener('click', () => {
    if (!canSwitch() || !profiles.persistent || transitioning || selectedId === profiles.id) return;
    try {
      if (pendingDelete === selectedId) { profiles.remove(selectedId); selectedId = profiles.id; entryStep = 'players'; showStep('players'); error('Profile and its career deleted.'); }
      else { pendingDelete = selectedId; refresh(); error('Deleting removes this player’s saved career. Press CONFIRM DELETE PROFILE to continue.'); dialog.querySelector('.pp-delete').focus(); }
    } catch (e) { error(e.message); }
  });
  launch.addEventListener('click', async () => {
    if (transitioning) return;
    if (step === 'players') { showStep('career'); return; }
    if (step === 'restore') { dialog.querySelector('.pp-restore-form').requestSubmit(); return; }
    if (step === 'create') { dialog.querySelector('.pp-create').requestSubmit(); return; }
    if (selectedId === profiles.id) { close(); return; }
    try { await switchTo(selectedId); } catch (e) { error(e.message); }
  });
  document.querySelectorAll('[data-open-profiles]').forEach((button) => button.addEventListener('click', open));
  function navigate(dx, dy) {
    if (step === 'players') {
      const buttons = [...dialog.querySelectorAll('.pp-players button:not(:disabled)')], current = buttons.indexOf(document.activeElement);
      const next = Math.max(0, Math.min(buttons.length - 1, (current < 0 ? buttons.findIndex((b) => b.dataset.ppSelect === selectedId) : current) + (dx || dy * 2)));
      const button = buttons[next];
      if (button?.dataset.ppSelect) { selectedId = button.dataset.ppSelect; refresh(); focus(`[data-pp-select="${selectedId}"]`); }
      else button?.focus();
    } else if (dy && step === 'career') dialog.querySelector('.pp-scroll').scrollBy({ top: dy * 180 });
    else {
      const controls = [...dialog.querySelectorAll('button,input,select')].filter((el) => !el.disabled && el.getClientRects().length);
      const index = controls.indexOf(document.activeElement), direction = dx || dy;
      controls[(index + direction + controls.length) % controls.length]?.focus();
    }
  }
  function confirm() {
    const card = document.activeElement?.closest?.('[data-pp-select]');
    if (card) { selectedId = card.dataset.ppSelect; refresh(); launch.focus(); return true; }
    return false;
  }
  window.addEventListener('keydown', (e) => {
    if (!dialog.open) return; e.stopImmediatePropagation();
    const input = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName);
    if (e.key === 'Escape' || e.key === 'Backspace' && !input) { e.preventDefault(); back(); }
    else if (!input && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); navigate(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0); }
    else if (!input && (e.key === 'Enter' || e.key === ' ') && confirm()) e.preventDefault();
  }, true);
  window.addEventListener('keyup', (e) => { if (dialog.open) e.stopImmediatePropagation(); }, true);
  return {
    get isOpen() { return dialog.open; }, open, refresh,
    update(dt) {
      if (!dialog.open) return;
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected); if (!pad) return;
      const press = (i) => pad.buttons[i]?.pressed && !prev[i]; cooldown = Math.max(0, cooldown - Math.min(.1, dt));
      if (!cooldown) {
        if (press(1)) back();
        else if (press(9)) launch.click();
        else if (press(14) || press(15) || press(12) || press(13) || Math.abs(pad.axes[0]) > .55 || Math.abs(pad.axes[1]) > .55) { navigate(press(14) || pad.axes[0] < -.55 ? -1 : press(15) || pad.axes[0] > .55 ? 1 : 0, press(12) || pad.axes[1] < -.55 ? -1 : press(13) || pad.axes[1] > .55 ? 1 : 0); cooldown = .2; }
        else if (press(0) && !confirm()) {
          const el = document.activeElement;
          if (el?.tagName === 'SELECT' && !el.disabled) { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
          else el?.click();
        }
      }
      for (const i of [0, 1, 9, 12, 13, 14, 15]) prev[i] = !!pad.buttons[i]?.pressed;
    },
  };
}
