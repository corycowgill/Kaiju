import { CHALLENGES, CHALLENGE_CITIES, CHALLENGE_NAMES } from './havocChallenges.js';
const labels = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'];
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

export function createHavocChallengesUI(ledger, monsters, { onOpen, onClose, onLaunch, canLaunch }) {
  const dialog = document.createElement('dialog'); dialog.id = 'havoc-challenges'; dialog.setAttribute('aria-labelledby', 'hc-title');
  dialog.innerHTML = `<header class="hc-head"><div><p class="hc-eyebrow">24 MISSIONS · 6 CITIES · 72 MEDAL POINTS</p><h2 id="hc-title">CITY CHALLENGES</h2></div><button type="button" class="hc-close" aria-label="Close City Challenges">CLOSE <kbd>ESC</kbd></button></header>
    <div class="hc-board-scroll"><section class="hc-summary"><span class="trophy-art challenge-trophy-art" style="background-position:100% 100%" aria-hidden="true"></span><div><h3>MAKE EVERY SECOND COUNT</h3><p id="hc-summary-copy"></p><progress max="72" value="0" aria-label="City challenge medal points"></progress></div><label>KAIJU<select id="hc-fighter">${Object.entries(monsters).map(([key, m]) => `<option value="${key}">${m.name}</option>`).join('')}</select></label></section>
    <nav class="hc-cities" aria-label="Challenge cities">${CHALLENGE_CITIES.map((city) => `<button type="button" data-hc-city="${city}">${CHALLENGE_NAMES[city]}</button>`).join('')}</nav>
    <p class="hc-unlock-note">Earn a medal in all four missions to unlock the next city. Replay missions to improve your medal and personal best.</p><div id="hc-missions"></div></div>
    <footer class="hc-footer"><div><p id="hc-save-note"></p><p id="hc-error" role="status"></p><small>GOLD: FASTEST · SILVER: FAST · BRONZE: FINISH BEFORE THE DEADLINE</small></div><button class="hc-return" type="button" hidden>RETURN TO MATCH</button></footer>`;
  document.body.appendChild(dialog);
  const fighter = dialog.querySelector('#hc-fighter'), grid = dialog.querySelector('#hc-missions');
  let returnFocus, launching = false, prev = {}, cooldown = .3;
  function refresh() {
    const summary = ledger.summary();
    document.querySelectorAll('[data-hc-progress]').forEach((el) => { el.textContent = `${summary.completed} / 24`; });
    if (!dialog.open) return;
    fighter.value = ledger.fighter; fighter.disabled = launching || !canLaunch();
    dialog.querySelector('#hc-summary-copy').textContent = `${summary.completed} / 24 completed · ${summary.gold} gold medals · ${summary.medalPoints} / 72 medal points`;
    dialog.querySelector('progress').value = summary.medalPoints;
    dialog.querySelector('#hc-save-note').textContent = ledger.persistent ? 'Medals and personal bests save automatically on this device.' : 'Storage is unavailable. Progress lasts for this session.';
    dialog.querySelector('.hc-return').hidden = canLaunch();
    for (const button of dialog.querySelectorAll('[data-hc-city]')) {
      const city = button.dataset.hcCity, unlocked = ledger.unlocked(city);
      button.disabled = !unlocked || launching;
      button.setAttribute('aria-pressed', String(ledger.city === city));
      button.title = unlocked ? CHALLENGE_NAMES[city] : 'Earn all four medals in the previous cities to unlock';
    }
    grid.innerHTML = CHALLENGES.filter((m) => m.city === ledger.city).map((m) => {
      const best = ledger.record(m.id);
      return `<article class="hc-mission medal-${best.medal}" data-hc-mission="${m.id}"><div class="hc-card-top"><span>${CHALLENGE_NAMES[m.city].toUpperCase()}</span><b>${best.medal ? '★ ' : '◇ '}${labels[best.medal]}</b></div><h3>${m.name}</h3><p class="hc-description">${m.description}</p>${m.allowed ? `<p class="hc-allowed">ALLOWED: ${m.allowed.join(' + ').toUpperCase()}</p>` : ''}<div class="hc-thresholds"><span class="gold">GOLD <b>≤ ${clock(m.gold)}</b></span><span class="silver">SILVER <b>≤ ${clock(m.silver)}</b></span><span class="bronze">BRONZE <b>&lt; ${clock(m.limit)}</b></span></div><div class="hc-best"><span>PERSONAL BEST <b>${best.bestTime === null ? '—' : clock(best.bestTime)}</b></span><span>BEST SCORE <b>${best.bestScore.toLocaleString()}</b></span><span>ATTEMPTS <b>${best.attempts}</b></span></div><button type="button" data-hc-play="${m.id}" ${launching || !canLaunch() ? 'disabled' : ''}>${best.medal ? 'REPLAY' : 'START MISSION'} <span>→</span></button></article>`;
    }).join('');
  }
  function close() { dialog.close(); }
  function open() {
    if (dialog.open || launching) return;
    returnFocus = document.activeElement; onOpen(); dialog.showModal(); prev = {}; cooldown = .35;
    dialog.querySelector('#hc-error').textContent = ''; refresh(); dialog.querySelector('.hc-close').focus({ preventScroll: true });
  }
  fighter.addEventListener('change', () => { ledger.selectFighter(fighter.value); refresh(); });
  dialog.querySelector('.hc-close').addEventListener('click', close);
  dialog.querySelector('.hc-return').addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { onClose(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  dialog.querySelector('.hc-cities').addEventListener('click', (e) => {
    const button = e.target.closest('[data-hc-city]'); if (!button || button.disabled) return;
    ledger.selectCity(button.dataset.hcCity); refresh();
  });
  grid.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-hc-play]'); if (!button || button.disabled || launching || !canLaunch()) return;
    launching = true; const id = button.dataset.hcPlay; refresh(); close();
    try { await onLaunch(id); }
    catch { launching = false; open(); dialog.querySelector('#hc-error').textContent = 'The mission did not start. Your medals are safe. Try again.'; }
    finally { launching = false; refresh(); }
  });
  document.querySelectorAll('[data-open-challenges]').forEach((el) => el.addEventListener('click', open));
  window.addEventListener('keydown', (e) => {
    if (!dialog.open) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.target?.tagName !== 'SELECT' && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); dialog.querySelector('.hc-board-scroll').scrollBy({ top: e.key === 'ArrowDown' ? 160 : -160 }); }
  }, true);
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
          const controls = [...dialog.querySelectorAll('button,select')].filter((el) => !el.disabled && !el.hidden);
          const index = controls.indexOf(document.activeElement), direction = press(14) ? -1 : 1;
          controls[(index + direction + controls.length) % controls.length]?.focus();
        } else if (pad.buttons[12]?.pressed || pad.axes[1] < -.55) dialog.querySelector('.hc-board-scroll').scrollBy({ top: -600 * dt });
        else if (pad.buttons[13]?.pressed || pad.axes[1] > .55) dialog.querySelector('.hc-board-scroll').scrollBy({ top: 600 * dt });
        else if (press(0)) { if (document.activeElement === fighter) { fighter.selectedIndex = (fighter.selectedIndex + 1) % fighter.options.length; fighter.dispatchEvent(new Event('change')); } else document.activeElement?.click(); }
      }
      for (const i of [0, 1, 9, 12, 13, 14, 15]) prev[i] = !!pad.buttons[i]?.pressed;
    },
  };
}
