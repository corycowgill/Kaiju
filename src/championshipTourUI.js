import { TOUR_FIGHTERS, TOUR_STAGES, tourEncounter } from './championshipTour.js';

const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const belt = (stage, earned) => `<div class="tour-belt ${earned ? 'won' : ''}" aria-hidden="true"><svg viewBox="0 0 280 100"><path d="M12 32H268L278 50 268 68H12L2 50Z" fill="#280c15" stroke="#a57735" stroke-width="2"/><g fill="#b68b40" stroke="#5e391b"><rect x="22" y="28" width="35" height="44" rx="6"/><rect x="223" y="28" width="35" height="44" rx="6"/></g><path d="M140 4 197 22 203 50 197 78 140 96 83 78 77 50 83 22Z" fill="#edbd61" stroke="#fff0bd" stroke-width="2"/><path d="M140 14 186 29 190 50 186 71 140 85 94 71 90 50 94 29Z" fill="#b27a2c" stroke="#76440e"/><text x="140" y="37" text-anchor="middle" fill="#ffefc0" font-size="9" font-weight="bold" letter-spacing="1">${stage.final ? 'WORLD' : stage.level.toUpperCase()}</text><text x="140" y="65" text-anchor="middle" fill="#fff0bd" font-size="25">${stage.final ? '♛' : '★'}</text><text x="140" y="78" text-anchor="middle" fill="#ffefc0" font-size="6" letter-spacing="2">HEAVYWEIGHT</text></svg></div>`;

export function createChampionshipTourUI(tour, monsters, { onOpen, onClose, onLaunch, canLaunch = () => true } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'championship-tour';
  dialog.setAttribute('aria-labelledby', 'tour-title');
  dialog.innerHTML = `<header class="tour-head"><div><p class="tour-kicker">SEVEN MATCHES. ONE UNDISPUTED CHAMPION.</p><h2 id="tour-title">CHAMPIONSHIP TOUR</h2></div><button type="button" class="tour-close" aria-label="Close Championship Tour">CLOSE <kbd>ESC</kbd></button></header>
    <div class="tour-scroll"><section class="tour-hero"><div class="tour-portrait"></div><div class="tour-fighter-copy"><p class="tour-kicker">YOUR CONTENDER</p><label for="tour-fighter">Choose your kaiju</label><select id="tour-fighter">${TOUR_FIGHTERS.map((key) => `<option value="${key}">${monsters[key].name}</option>`).join('')}</select><p id="tour-fighter-note">Each kaiju has its own saved tour.</p></div><div class="tour-progress"><b id="tour-belts">0 <small>/ 6</small></b><span>CITY BELTS</span><progress max="7" value="0" aria-label="Championship Tour progress"></progress><span id="tour-standing">CHALLENGER</span></div></section>
    <div class="tour-route-heading"><h3>THE ROAD TO THE WORLD TITLE</h3><span>BEST OF THREE · FALLS COUNT ANYWHERE</span></div><div id="tour-route"></div><section id="tour-finale"></section></div>
    <footer class="tour-footer"><div><p id="tour-save-state"></p><p class="tour-controls">TAB / D-PAD SELECT · ENTER / A CONFIRM · ESC / B BACK</p><p id="tour-error" role="status"></p></div><button class="tour-launch" type="button"></button></footer>`;
  document.body.appendChild(dialog);
  const fighter = dialog.querySelector('#tour-fighter'), launch = dialog.querySelector('.tour-launch');
  let returnFocus, launching = false, previousButtons = {}, cooldown = .3;
  function refresh() {
    const p = tour.progress();
    document.querySelectorAll('[data-tour-progress]').forEach((el) => { el.textContent = p.complete ? 'WORLD CHAMPION' : `${p.belts} / 6 BELTS`; });
    if (!dialog.open) return;
    const allowed = canLaunch();
    fighter.value = tour.selected; fighter.disabled = !allowed || launching;
    dialog.querySelector('.tour-portrait').style.backgroundImage = `url("assets/${monsters[tour.selected].portrait}")`;
    dialog.querySelector('#tour-belts').innerHTML = `${p.belts} <small>/ 6</small>`;
    dialog.querySelector('progress').value = p.wins.length;
    dialog.querySelector('#tour-standing').textContent = p.complete ? 'WORLD CHAMPION' : p.belts === 6 ? 'WORLD TITLE CONTENDER' : 'CHALLENGER';
    dialog.querySelector('#tour-save-state').textContent = tour.persistent ? 'Tour saved on this device. Switch kaiju to continue another career.' : 'Browser storage is unavailable. Keep this page open to retain your tour.';
    dialog.querySelector('#tour-fighter-note').textContent = allowed ? 'Each kaiju has its own saved tour. Belts survive losses and restarts.' : 'Your match is in progress. Close the tour board to return to it.';
    dialog.querySelector('#tour-route').innerHTML = TOUR_STAGES.slice(0, 6).map((stage, i) => {
      const win = p.wins[i], current = p.next?.index === i, opponent = monsters[tourEncounter(tour.selected, i).rival];
      return `<article class="tour-stop ${win ? 'conquered' : current ? 'current' : 'locked'}" data-tour-stage="${stage.id}" aria-label="${stage.name}: ${win ? 'belt won' : current ? 'next match' : 'locked'}"><div class="tour-stop-top"><span>0${i + 1} · ${stage.tag}</span><b>${win ? '✓ BELT WON' : current ? 'UP NEXT' : 'LOCKED'}</b></div>${belt(stage, !!win)}<h4>${stage.name}</h4><p class="tour-city-title">${stage.title}</p><p class="tour-opponent">VS <strong>${opponent.name}</strong></p><p class="tour-stop-note">${win ? `${win.playerFalls}–${win.rivalFalls} · ${time(win.time)} · ${new Date(win.at).toLocaleDateString()}` : current ? `${p.attempts[i] ? 'ATTEMPT ' + (p.attempts[i] + 1) + ' · ' : ''}WIN TWO FALLS TO EARN THE BELT` : 'WIN THE PREVIOUS CITY TITLE TO UNLOCK'}</p><div class="tour-pressure" aria-label="Opponent pressure level ${i + 1} of 7">${Array.from({ length: 7 }, (_, n) => `<i class="${n <= i ? 'lit' : ''}"></i>`).join('')}<span>RIVAL PRESSURE</span></div></article>`;
    }).join('');
    const final = TOUR_STAGES[6], finalRival = monsters[tourEncounter(tour.selected, 6).rival];
    dialog.querySelector('#tour-finale').className = p.complete ? 'champion' : p.belts === 6 ? 'unlocked' : 'locked';
    dialog.querySelector('#tour-finale').innerHTML = `${belt(final, p.complete)}<div><p class="tour-kicker">${p.complete ? 'THE TOUR IS YOURS' : 'THE FINAL SHOWDOWN · TOKYO'}</p><h3>${p.complete ? 'UNDISPUTED WORLD CHAMPION' : 'WORLD HEAVYWEIGHT TITLE'}</h3><p>${p.complete ? `${monsters[tour.selected].name} conquered six cities and won the World Championship.` : `Face ${finalRival.name} in the toughest match of the tour. Best of five. First to three falls wins the crown.`}</p><b>${p.complete ? `★ SEVEN VICTORIES · ${time(p.wins.reduce((sum, w) => sum + w.time, 0))} TOTAL MATCH TIME` : p.belts === 6 ? 'UNLOCKED · YOUR WORLD TITLE SHOT IS READY' : `${6 - p.belts} CITY BELTS STILL TO WIN`}</b></div>`;
    launch.disabled = launching;
    launch.textContent = !allowed ? 'RETURN TO MATCH' : p.complete ? 'BACK' : `${p.attempts[p.next.index] ? 'RETRY' : 'FIGHT'} · ${p.next.final ? 'WORLD CHAMPIONSHIP' : p.next.name.toUpperCase()}`;
    dialog.classList.toggle('tour-complete', p.complete);
  }
  function close() { dialog.close(); }
  function open() {
    if (dialog.open || launching) return;
    returnFocus = document.activeElement; onOpen?.();
    dialog.showModal(); previousButtons = {}; cooldown = .35;
    dialog.querySelector('#tour-error').textContent = '';
    refresh();
    if (tour.progress().belts === 6) {
      const scroll = dialog.querySelector('.tour-scroll');
      scroll.scrollTop = scroll.scrollHeight;
    }
    launch.focus({ preventScroll: true });
  }
  fighter.addEventListener('change', () => { tour.select(fighter.value); refresh(); });
  dialog.querySelector('.tour-close').addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { onClose?.(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  launch.addEventListener('click', async () => {
    if (launching) return;
    if (!canLaunch() || tour.progress().complete) { close(); return; }
    launching = true; refresh(); close();
    try { await onLaunch(); } catch { openAfterFailure(); }
    finally { launching = false; refresh(); }
  });
  function openAfterFailure() {
    launching = false; open();
    dialog.querySelector('#tour-error').textContent = 'The match did not start. Your belts are safe. Try again.';
  }
  document.querySelectorAll('[data-open-tour]').forEach((el) => el.addEventListener('click', open));
  window.addEventListener('keydown', (e) => {
    if (!dialog.open) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.target?.tagName !== 'SELECT' && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault(); dialog.querySelector('.tour-scroll').scrollBy({ top: /Up/.test(e.key) ? -180 : 180 });
    }
  }, true);
  window.addEventListener('keyup', (e) => { if (dialog.open) e.stopImmediatePropagation(); }, true);
  return {
    get isOpen() { return dialog.open; }, open, close, refresh,
    update(dt) {
      if (!dialog.open) return;
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected);
      if (!pad) return;
      const press = (i) => pad.buttons[i]?.pressed && !previousButtons[i];
      cooldown = Math.max(0, cooldown - Math.min(.1, dt));
      if (!cooldown) {
        if (press(1) || press(9)) close();
        else if (press(14) || press(15)) {
          const controls = [...dialog.querySelectorAll('select,button')].filter((el) => !el.disabled);
          const i = controls.indexOf(document.activeElement), d = press(14) ? -1 : 1;
          controls[(i + d + controls.length) % controls.length]?.focus({ preventScroll: true });
        } else if (pad.buttons[12]?.pressed || pad.axes[1] < -.55) {
          if (document.activeElement === fighter && !fighter.disabled && press(12)) { fighter.selectedIndex = (fighter.selectedIndex + 8) % 9; fighter.dispatchEvent(new Event('change')); }
          else dialog.querySelector('.tour-scroll').scrollBy({ top: -600 * dt });
        } else if (pad.buttons[13]?.pressed || pad.axes[1] > .55) {
          if (document.activeElement === fighter && !fighter.disabled && press(13)) { fighter.selectedIndex = (fighter.selectedIndex + 1) % 9; fighter.dispatchEvent(new Event('change')); }
          else dialog.querySelector('.tour-scroll').scrollBy({ top: 600 * dt });
        } else if (press(0)) { if (document.activeElement === fighter) launch.focus(); else document.activeElement?.click(); }
      }
      for (const i of [0, 1, 9, 12, 13, 14, 15]) previousButtons[i] = !!pad.buttons[i]?.pressed;
    },
  };
}
