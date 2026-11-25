import { ACHIEVEMENTS } from './achievements.js';
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parse = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const format = (n) => Math.floor(Number(n) || 0).toLocaleString();
const duration = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
const modeNames = { havoc: 'Havoc', title: 'Title Match', vs: 'VS Duel', lone: 'Lone Soldier', challenge: 'City Challenge', tour: 'Championship Tour' };
const outcomeNames = { won: 'WON', lost: 'LOST', left: 'LEFT', interrupted: 'INTERRUPTED' };

export function createPlayerProfilesUI(profiles, history, monsters, { canSwitch, onOpen, onClose, onSwitch }) {
  const dialog = document.createElement('dialog'); dialog.id = 'player-profiles'; dialog.setAttribute('aria-labelledby', 'pp-title');
  dialog.innerHTML = `<header class="pp-head"><div><p class="pp-eyebrow">YOUR LOCAL KAIJU CAREER</p><h2 id="pp-title">PLAYER PROFILES</h2></div><button type="button" class="pp-close" aria-label="Close Player Profiles">CLOSE <kbd>ESC</kbd></button></header><div class="pp-scroll"><p class="pp-storage"></p><div class="pp-layout"><section><h3>CHOOSE A PLAYER <small>UP TO 8 PROFILES</small></h3><div class="pp-players"></div><form class="pp-create"><label for="pp-new-name">NEW PLAYER NAME</label><div class="pp-form-row"><input id="pp-new-name" name="name" maxlength="48" autocomplete="off" placeholder="Enter a player name" required><button type="submit">CREATE & PLAY</button></div></form></section><section class="pp-career"><div class="pp-current"></div><form class="pp-rename"><label for="pp-rename-name">PLAYER NAME</label><div class="pp-form-row"><input id="pp-rename-name" name="name" maxlength="48" autocomplete="off" required><button type="submit">RENAME</button></div></form><div class="pp-stats"></div><h3>RECENT HISTORY <small>LAST 100 RESULTS</small></h3><p class="pp-history-note">Results recorded from this update onward. Earlier achievements, medals, belts, and high scores are preserved.</p><ol class="pp-history"></ol></section></div></div><footer><p class="pp-error" role="status" aria-live="polite"></p><span>Saved in this browser on this device. No account required.</span></footer>`;
  document.body.appendChild(dialog);
  let returnFocus, prev = {}, cooldown = .35, pendingDelete = null;
  const error = (message) => { dialog.querySelector('.pp-error').textContent = message; };
  function refresh() {
    const name = profiles.current.name || 'Player';
    document.querySelectorAll('[data-player-name]').forEach((el) => { el.textContent = name; });
    if (!dialog.open) return;
    const players = profiles.list();
    const editable = profiles.persistent, switchable = editable && canSwitch();
    dialog.querySelector('.pp-storage').textContent = !editable ? 'Local storage is unavailable. This career lasts for this session; profile changes are disabled.' : canSwitch() ? 'Each player has separate trophies, high scores, City Challenges, Championship Tour progress, and history. Switching players reloads the game.' : 'Finish or quit your current run to switch players. Your career is shown below.';
    dialog.querySelector('.pp-players').innerHTML = players.map((p, index) => {
      const save = parse(profiles.read(p.id, 'kaiju_achievements_v1'));
      const trophies = ACHIEVEMENTS.filter((a) => Number.isFinite(save?.unlocked?.[a.id])).length;
      const active = profiles.id === p.id;
      return `<article class="pp-player ${active ? 'pp-active' : ''}"><span class="pp-avatar pp-color-${index % 4}" aria-hidden="true">${escape(Array.from(p.name)[0].toUpperCase())}</span><div><b>${escape(p.name)}</b><small>${trophies} / ${ACHIEVEMENTS.length} trophies · Best ${format(profiles.read(p.id, 'kaiju_highscore'))}</small></div>${active ? '<span class="pp-playing">PLAYING</span>' : `<button type="button" data-pp-switch="${p.id}" ${switchable ? '' : 'disabled'}>PLAY</button><button type="button" class="pp-delete" data-pp-delete="${p.id}" aria-label="Delete ${escape(p.name)}" ${switchable ? '' : 'disabled'}>${pendingDelete === p.id ? 'CONFIRM DELETE' : 'DELETE'}</button>`}</article>`;
    }).join('');
    dialog.querySelector('.pp-current').textContent = `${name}’s career`;
    dialog.querySelector('#pp-rename-name').value = name;
    for (const input of dialog.querySelectorAll('.pp-rename input,.pp-rename button')) input.disabled = !editable;
    for (const input of dialog.querySelectorAll('.pp-create input,.pp-create button')) input.disabled = !switchable || players.length >= 8;
    const total = history.summary(), trophies = parse(profiles.read(profiles.id, 'kaiju_achievements_v1'));
    const trophyCount = ACHIEVEMENTS.filter((a) => Number.isFinite(trophies?.unlocked?.[a.id])).length;
    const challenge = parse(profiles.read(profiles.id, 'kaiju_city_challenges_v1'));
    const medals = Object.values(challenge?.records || {}).filter((r) => r?.medal > 0).length;
    const tour = parse(profiles.read(profiles.id, 'kaiju_championship_tour_v1'));
    const belts = Object.values(tour?.records || {}).reduce((sum, r) => sum + Math.min(6, r?.wins?.length || 0), 0);
    const stats = [['TROPHIES', `${trophyCount} / ${ACHIEVEMENTS.length}`], ['HIGH SCORE', format(profiles.read(profiles.id, 'kaiju_highscore'))], ['CHALLENGE MEDALS', `${medals} / 24`], ['CITY BELTS', format(belts)], ['RECORDED RUNS', format(total.played)], ['WINS / LOSSES', `${format(total.wins)} / ${format(total.losses)}`], ['ACTIVE PLAY', duration(total.seconds)]];
    dialog.querySelector('.pp-stats').innerHTML = stats.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
    const recent = history.recent();
    dialog.querySelector('.pp-history').innerHTML = recent.length ? recent.map((r) => {
      const date = new Date(r.ended).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const detail = [monsters[r.fighter]?.name || r.fighter, r.city.toUpperCase(), duration(r.seconds), `Score ${format(r.score)}`];
      if (r.mode === 'challenge') detail.push(r.mission, ['No medal', 'Bronze', 'Silver', 'Gold'][r.medal]);
      if (r.mode === 'title' || r.mode === 'tour') detail.push(`Falls ${r.playerFalls}–${r.rivalFalls}`);
      return `<li><div><b>${modeNames[r.mode]}</b><span class="pp-outcome pp-${r.outcome}">${outcomeNames[r.outcome]}</span></div><p>${detail.map(escape).join(' · ')}</p><time datetime="${new Date(r.ended).toISOString()}">${escape(date)}</time></li>`;
    }).join('') : '<li class="pp-empty">Your next run starts your history. Play Havoc, a title match, a challenge, or another mode to begin.</li>';
  }
  function close() { dialog.close(); }
  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement; pendingDelete = null; onOpen(); dialog.showModal(); prev = {}; cooldown = .35; error(''); refresh(); dialog.querySelector('.pp-close').focus({ preventScroll: true });
  }
  function switchTo(id) { if (!canSwitch()) throw Error('Finish or quit this run before switching players.'); onSwitch(id); }
  dialog.querySelector('.pp-close').addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { onClose(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  dialog.querySelector('.pp-create').addEventListener('submit', (e) => {
    e.preventDefault(); error('');
    try { const id = profiles.create(dialog.querySelector('#pp-new-name').value); switchTo(id); } catch (e) { error(e.message); refresh(); }
  });
  dialog.querySelector('.pp-rename').addEventListener('submit', (e) => {
    e.preventDefault(); try { profiles.rename(dialog.querySelector('#pp-rename-name').value); refresh(); error('Player name saved.'); } catch (e) { error(e.message); }
  });
  dialog.querySelector('.pp-players').addEventListener('click', (e) => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    try {
      error('');
      if (button.dataset.ppSwitch) switchTo(button.dataset.ppSwitch);
      if (button.dataset.ppDelete) {
        const id = button.dataset.ppDelete;
        if (pendingDelete === id) { profiles.remove(id); pendingDelete = null; error('Profile and its career deleted.'); }
        else { pendingDelete = id; error('Deleting removes this player’s saved career. Press CONFIRM DELETE to continue.'); }
        refresh();
      }
    } catch (e) { error(e.message); }
  });
  document.querySelectorAll('[data-open-profiles]').forEach((button) => button.addEventListener('click', open));
  window.addEventListener('keydown', (e) => { if (!dialog.open) return; e.stopImmediatePropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } }, true);
  window.addEventListener('keyup', (e) => { if (dialog.open) e.stopImmediatePropagation(); }, true);
  return {
    get isOpen() { return dialog.open; }, open, refresh,
    update(dt) {
      if (!dialog.open) return;
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected); if (!pad) return;
      const press = (i) => pad.buttons[i]?.pressed && !prev[i]; cooldown = Math.max(0, cooldown - Math.min(.1, dt));
      if (!cooldown) {
        if (press(1) || press(9)) close();
        else if (press(14) || press(15)) {
          const controls = [...dialog.querySelectorAll('button,input')].filter((el) => !el.disabled && !el.hidden);
          const index = controls.indexOf(document.activeElement), direction = press(14) ? -1 : 1;
          controls[(index + direction + controls.length) % controls.length]?.focus();
        } else if (pad.buttons[12]?.pressed || pad.axes[1] < -.55) dialog.querySelector('.pp-scroll').scrollBy({ top: -600 * dt });
        else if (pad.buttons[13]?.pressed || pad.axes[1] > .55) dialog.querySelector('.pp-scroll').scrollBy({ top: 600 * dt });
        else if (press(0) && document.activeElement?.tagName === 'BUTTON') document.activeElement.click();
      }
      for (const i of [0, 1, 9, 12, 13, 14, 15]) prev[i] = !!pad.buttons[i]?.pressed;
    },
  };
}
