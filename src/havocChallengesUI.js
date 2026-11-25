import { CHALLENGES, CHALLENGE_CITIES, CHALLENGE_NAMES } from './havocChallenges.js';
const labels = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'];
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

// Absolute URLs keep CSS custom properties correct under /Kaiju/ hosting.
const stageArt = (city) => new URL(`../assets/ui/menu/stage_${city}.webp`, import.meta.url).href;

export function createHavocChallengesUI(ledger, monsters, { onOpen, onClose, onLaunch, canLaunch }) {
  const fighters = Object.keys(monsters);
  const dialog = document.createElement('dialog'); dialog.id = 'havoc-challenges'; dialog.className = 'campaign-menu'; dialog.setAttribute('aria-labelledby', 'hc-title');
  dialog.innerHTML = `<div class="tour-backdrop" aria-hidden="true"></div><header class="tour-head"><div class="tour-brand">怪獣 <b>KAIJU HAVOC</b></div><div><p class="tour-kicker">24 MISSIONS · 6 CITIES · 72 MEDAL POINTS</p><h2 id="hc-title">CITY CHALLENGES</h2></div><span class="tour-step-label">01 / KAIJU</span><button type="button" class="tour-close hc-close" aria-label="Close City Challenges">CLOSE</button></header>
    <div class="tour-pages"><section class="tour-contender-page" data-hc-page="fighter"><div class="tour-showcase"><div class="tour-show-portrait"></div><div class="tour-show-copy"><span class="tour-role">YOUR KAIJU</span><h3 class="tour-show-name"></h3><p class="tour-show-epithet"></p><p class="tour-show-description"></p></div></div><div class="tour-roster-side"><div class="tour-section-heading"><h3>CHOOSE YOUR FIGHTER</h3><span>怪獣選択</span></div><div class="tour-roster" role="group" aria-label="Choose your City Challenges kaiju">${fighters.map((key) => `<button type="button" class="tour-fighter-card" data-hc-fighter="${key}" aria-pressed="false"><img src="assets/${monsters[key].portrait}" alt="" loading="lazy"><b>${monsters[key].name}</b><span>${monsters[key].kanji}</span></button>`).join('')}</div><div class="tour-contender-standing hc-standing"></div><p class="tour-career-note">Beat the clock. Earn medals. Unlock all six cities. Your records are shared across kaiju in this player profile.</p></div></section>
    <section class="hc-missions-page" data-hc-page="missions" hidden><div class="hc-board-scroll"><section class="hc-summary"><span class="trophy-art challenge-trophy-art" style="background-position:100% 100%" aria-hidden="true"></span><div><h3>MAKE EVERY SECOND COUNT</h3><p id="hc-summary-copy"></p><progress max="72" value="0" aria-label="City challenge medal points"></progress></div><b class="hc-current-fighter"></b></section><nav class="hc-cities" aria-label="Challenge cities">${CHALLENGE_CITIES.map((city) => `<button type="button" data-hc-city="${city}" style="--hc-city-art:url('${stageArt(city)}')"><span>${CHALLENGE_NAMES[city]}</span><small></small></button>`).join('')}</nav><p class="hc-unlock-note">Earn a medal in all four missions to unlock the next city. Select a mission, then start from the command bar.</p><div id="hc-missions" role="group" aria-label="Choose a mission"></div></div></section></div>
    <footer class="tour-footer"><button class="tour-back hc-back" type="button"><span>ESC</span> BACK</button><div class="tour-footer-copy"><p class="tour-controls">ARROWS / D-PAD SELECT · ENTER / A CONFIRM · ESC / B BACK</p><p id="hc-save-note"></p><p id="hc-error" role="status"></p></div><span class="tour-selection hc-selection"></span><button class="tour-launch hc-launch" type="button"></button></footer>`;
  document.body.appendChild(dialog);
  const grid = dialog.querySelector('#hc-missions'), launch = dialog.querySelector('.hc-launch');
  let returnFocus, launching = false, prev = {}, cooldown = .3, step = 'fighter';
  const selected = new Map();
  function mission() { return CHALLENGES.find((m) => m.id === selected.get(ledger.city)) || CHALLENGES.find((m) => m.city === ledger.city); }
  function refresh() {
    const summary = ledger.summary();
    document.querySelectorAll('[data-hc-progress]').forEach((el) => { el.textContent = `${summary.completed} / 24`; });
    if (!dialog.open) return;
    const monster = monsters[ledger.fighter], allowed = canLaunch(), current = mission();
    dialog.dataset.step = step;
    for (const page of dialog.querySelectorAll('[data-hc-page]')) page.hidden = page.dataset.hcPage !== step;
    dialog.querySelector('.tour-step-label').textContent = step === 'fighter' ? '01 / KAIJU' : '02 / CITY & MISSION';
    for (const card of dialog.querySelectorAll('[data-hc-fighter]')) { card.setAttribute('aria-pressed', String(card.dataset.hcFighter === ledger.fighter)); card.disabled = launching || !allowed; }
    dialog.querySelector('.tour-show-portrait').style.backgroundImage = `url("assets/${monster.portrait}")`;
    dialog.querySelector('.tour-showcase').dataset.kanji = monster.kanji;
    dialog.querySelector('.tour-show-name').textContent = monster.name;
    dialog.querySelector('.tour-show-epithet').textContent = monster.epithet;
    dialog.querySelector('.tour-show-description').textContent = monster.description;
    dialog.querySelector('.hc-standing').textContent = `${summary.completed} / 24 MISSIONS · ${summary.gold} GOLD MEDALS`;
    dialog.querySelector('#hc-summary-copy').textContent = `${summary.completed} / 24 completed · ${summary.gold} gold medals · ${summary.medalPoints} / 72 medal points`;
    dialog.querySelector('progress').value = summary.medalPoints;
    dialog.querySelector('.hc-current-fighter').textContent = monster.name;
    dialog.querySelector('#hc-save-note').textContent = ledger.persistent ? 'Medals and personal bests save to this player profile on this device.' : 'Storage is unavailable. Progress lasts for this session.';
    dialog.querySelector('.hc-selection').textContent = `${monster.name} · ${step === 'fighter' ? 'CITY CHALLENGES' : CHALLENGE_NAMES[ledger.city] + ' · ' + current.name}`;
    launch.disabled = launching;
    const best = ledger.record(current.id);
    launch.textContent = step === 'fighter' ? 'VIEW MISSIONS →' : !allowed ? 'RETURN TO MATCH' : `${best.medal ? 'REPLAY' : best.attempts ? 'RETRY' : 'START'} MISSION`;
    for (const button of dialog.querySelectorAll('[data-hc-city]')) {
      const city = button.dataset.hcCity, unlocked = ledger.unlocked(city);
      button.disabled = !unlocked || launching;
      button.setAttribute('aria-pressed', String(ledger.city === city));
      button.title = unlocked ? CHALLENGE_NAMES[city] : 'Earn all four medals in the previous cities to unlock';
      const medals = CHALLENGES.filter((m) => m.city === city && ledger.record(m.id).medal > 0).length;
      button.querySelector('small').textContent = unlocked ? `${medals} / 4 MEDALS` : 'LOCKED';
    }
    grid.innerHTML = CHALLENGES.filter((m) => m.city === ledger.city).map((m, index) => {
      const best = ledger.record(m.id);
      return `<button type="button" class="hc-mission medal-${best.medal}" data-hc-select="${m.id}" aria-pressed="${m.id === current.id}" ${launching ? 'disabled' : ''}><span class="hc-card-top"><span>0${index + 1} · ${CHALLENGE_NAMES[m.city].toUpperCase()}</span><b>${best.medal ? '★ ' : '◇ '}${labels[best.medal]}</b></span><b class="hc-mission-name">${m.name}</b><span class="hc-description">${m.description}</span>${m.allowed ? `<span class="hc-allowed">ALLOWED: ${m.allowed.join(' + ').toUpperCase()}</span>` : ''}<span class="hc-thresholds"><span class="gold">GOLD <b>≤ ${clock(m.gold)}</b></span><span class="silver">SILVER <b>≤ ${clock(m.silver)}</b></span><span class="bronze">BRONZE <b>&lt; ${clock(m.limit)}</b></span></span><span class="hc-best"><span>PERSONAL BEST <b>${best.bestTime === null ? '—' : clock(best.bestTime)}</b></span><span>BEST SCORE <b>${best.bestScore.toLocaleString()}</b></span><span>ATTEMPTS <b>${best.attempts}</b></span></span><span class="hc-pick-label">${m.id === current.id ? '◆ SELECTED' : 'SELECT MISSION →'}</span></button>`;
    }).join('');
  }
  function focus(selector) { const node = dialog.querySelector(selector); node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: 'nearest' }); }
  function close() { dialog.close(); }
  function showStep(next) {
    step = next; refresh();
    if (step === 'fighter') focus(`[data-hc-fighter="${ledger.fighter}"]`);
    else if (returnFocus?.closest?.('#gameover')) focus(`[data-hc-select="${mission().id}"]`);
    else focus(`[data-hc-city="${ledger.city}"]`);
  }
  function back() { if (step === 'missions' && canLaunch()) showStep('fighter'); else close(); }
  function open(preferredStep) {
    if (dialog.open || launching) return;
    returnFocus = document.activeElement; onOpen(); dialog.showModal(); prev = {}; cooldown = .35;
    dialog.querySelector('#hc-error').textContent = '';
    showStep(preferredStep || (!canLaunch() || returnFocus?.closest?.('#gameover, #pause-menu') ? 'missions' : 'fighter'));
  }
  function selectFighter(key) { if (launching || !canLaunch()) return; ledger.selectFighter(key); refresh(); }
  function selectMission(id) { if (launching) return; selected.set(ledger.city, id); refresh(); focus(`[data-hc-select="${id}"]`); }
  dialog.querySelector('.tour-roster').addEventListener('click', (e) => { const card = e.target.closest('[data-hc-fighter]'); if (card && !card.disabled) selectFighter(card.dataset.hcFighter); });
  dialog.querySelector('.hc-close').addEventListener('click', close);
  dialog.querySelector('.hc-back').addEventListener('click', back);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); back(); });
  dialog.addEventListener('close', () => { onClose(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  dialog.querySelector('.hc-cities').addEventListener('click', (e) => {
    const button = e.target.closest('[data-hc-city]'); if (!button || button.disabled) return;
    ledger.selectCity(button.dataset.hcCity); refresh(); focus(`[data-hc-select="${mission().id}"]`);
  });
  grid.addEventListener('click', (e) => { const button = e.target.closest('[data-hc-select]'); if (button && !button.disabled) selectMission(button.dataset.hcSelect); });
  launch.addEventListener('click', async () => {
    if (launching) return;
    if (!canLaunch()) { close(); return; }
    if (step === 'fighter') { showStep('missions'); return; }
    const id = mission().id; launching = true; refresh(); close();
    try { await onLaunch(id); }
    catch { launching = false; open('missions'); dialog.querySelector('#hc-error').textContent = 'The mission did not start. Your medals are safe. Try again.'; }
    finally { launching = false; refresh(); }
  });
  document.querySelectorAll('[data-open-challenges]').forEach((el) => el.addEventListener('click', () => open()));
  function columns(container) { return getComputedStyle(container).gridTemplateColumns.split(' ').length; }
  function navigate(dx, dy) {
    if (step === 'fighter') {
      const index = fighters.indexOf(ledger.fighter), delta = dx || dy * 3;
      const key = fighters[(index + delta + fighters.length) % fighters.length];
      selectFighter(key); focus(`[data-hc-fighter="${key}"]`); return;
    }
    const cityButton = document.activeElement?.closest?.('[data-hc-city]');
    if (cityButton) {
      const cities = [...dialog.querySelectorAll('[data-hc-city]:not(:disabled)')], index = cities.indexOf(cityButton);
      const next = index + (dx || dy * columns(dialog.querySelector('.hc-cities')));
      if (dy > 0 && next >= cities.length) { focus(`[data-hc-select="${mission().id}"]`); return; }
      const city = cities[Math.max(0, Math.min(cities.length - 1, next))]?.dataset.hcCity;
      if (city) { ledger.selectCity(city); refresh(); focus(`[data-hc-city="${city}"]`); } return;
    }
    const missions = CHALLENGES.filter((m) => m.city === ledger.city), index = missions.indexOf(mission()), next = index + (dx || dy * columns(grid));
    if (dy < 0 && next < 0) { focus(`[data-hc-city="${ledger.city}"]`); return; }
    selectMission(missions[Math.max(0, Math.min(missions.length - 1, next))].id);
  }
  function confirmSelection() {
    const card = document.activeElement?.closest?.('[data-hc-fighter], [data-hc-select]');
    if (card) { if (card.dataset.hcFighter) selectFighter(card.dataset.hcFighter); else selectMission(card.dataset.hcSelect); launch.focus(); return true; }
    return false;
  }
  window.addEventListener('keydown', (e) => {
    if (!dialog.open) return; e.stopImmediatePropagation();
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); navigate(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0); }
    else if ((e.key === 'Enter' || e.key === ' ') && confirmSelection()) e.preventDefault();
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
        else if (press(14) || press(15) || press(12) || press(13) || Math.abs(pad.axes[0]) > .55 || Math.abs(pad.axes[1]) > .55) {
          navigate(press(14) || pad.axes[0] < -.55 ? -1 : press(15) || pad.axes[0] > .55 ? 1 : 0, press(12) || pad.axes[1] < -.55 ? -1 : press(13) || pad.axes[1] > .55 ? 1 : 0); cooldown = .2;
        } else if (press(0) && !confirmSelection()) document.activeElement?.click();
      }
      for (const i of [0, 1, 9, 12, 13, 14, 15]) prev[i] = !!pad.buttons[i]?.pressed;
    },
  };
}
