import { ACHIEVEMENTS } from './achievements.js';

const number = (n) => Math.floor(n).toLocaleString();
const icon = (a, extra = '') => `<span class="trophy-art ${a.art === 'challenges' ? 'challenge-trophy-art' : ''} ${extra}" aria-hidden="true" style="background-position:${a.art === 'challenges' ? a.artIndex % 3 * 50 : a.icon % 8 * 100 / 7}% ${a.art === 'challenges' ? Math.floor(a.artIndex / 3) * 100 : Math.floor(a.icon / 8) * 20}%"></span>`;

/** Native modal for focus containment; toasts never take focus or block play. */
export function createAchievementUI(tracker, { onOpen = () => {}, onClose = () => {}, chime = () => {} } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'trophy-room';
  dialog.setAttribute('aria-labelledby', 'trophy-heading');
  dialog.innerHTML = `
    <header class="trophy-header">
      ${icon(ACHIEVEMENTS[47], 'trophy-hero')}
      <div><p class="trophy-eyebrow">THE KAIJU ARCHIVE <span>· 実績</span></p><h2 id="trophy-heading">TROPHY ROOM</h2><p class="trophy-intro">Leave a mark. Build your legend.</p></div>
      <button type="button" class="trophy-close" aria-label="Close Trophy Room">CLOSE <kbd>ESC</kbd></button>
    </header>
    <section class="trophy-summary" aria-label="Collection progress">
      <div><b id="trophy-total">0 <small>/ ${ACHIEVEMENTS.length}</small></b><span>TROPHIES UNLOCKED</span></div>
      <div><b id="trophy-points">0</b><span>TROPHY POINTS</span></div>
      <div class="trophy-completion"><b id="trophy-percent">0%</b><span>COLLECTION COMPLETE</span><progress id="trophy-overall" max="${ACHIEVEMENTS.length}" value="0" aria-label="Trophy collection completion"></progress></div>
    </section>
    <div class="trophy-tools">
      <div class="trophy-filters" role="group" aria-label="Filter trophies by mode">
        <button type="button" data-trophy-mode="all" aria-pressed="true">ALL <span>${ACHIEVEMENTS.length}</span></button>
        <button type="button" data-trophy-mode="havoc" aria-pressed="false">HAVOC <span>${ACHIEVEMENTS.filter((a) => a.mode === 'havoc').length}</span></button>
        <button type="button" data-trophy-mode="wrestling" aria-pressed="false">WRESTLING <span>20</span></button>
        <button type="button" data-trophy-mode="legacy" aria-pressed="false">LEGACY <span>4</span></button>
      </div>
      <div class="trophy-search-tools"><input type="search" id="trophy-search" aria-label="Search trophies" placeholder="Find a trophy…" maxlength="80"><select id="trophy-status" aria-label="Filter trophies by unlock status"><option value="all">All trophies</option><option value="unlocked">Unlocked</option><option value="locked">Locked</option></select></div>
    </div>
    <p id="trophy-results" class="trophy-results" role="status"></p>
    <div class="trophy-grid" id="trophy-grid"></div>
    <footer class="trophy-footer"><span id="trophy-save-note">Progress saves automatically on this device.</span><span>BRONZE · SILVER · GOLD · PLATINUM</span></footer>`;
  document.body.appendChild(dialog);

  const toast = document.createElement('div');
  toast.id = 'achievement-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toast);
  const grid = dialog.querySelector('#trophy-grid');
  const search = dialog.querySelector('#trophy-search');
  const status = dialog.querySelector('#trophy-status');
  const results = dialog.querySelector('#trophy-results');
  const filters = [...dialog.querySelectorAll('[data-trophy-mode]')];
  let mode = 'all', returnFocus = null, queue = [], active = null, toastTime = 0, gap = 0;
  let previousButtons = {}, padCooldown = 0;

  function refresh() {
    const s = tracker.summary();
    document.querySelectorAll('[data-trophy-count]').forEach((el) => { el.textContent = `${s.unlocked} / ${s.total}`; });
    if (!dialog.open) return;
    dialog.querySelector('#trophy-total').innerHTML = `${s.unlocked} <small>/ ${s.total}</small>`;
    dialog.querySelector('#trophy-points').textContent = number(s.points);
    dialog.querySelector('#trophy-percent').textContent = `${Math.floor(s.unlocked / s.total * 100)}%`;
    dialog.querySelector('#trophy-overall').value = s.unlocked;
    dialog.querySelector('#trophy-save-note').textContent = tracker.persistent
      ? 'Progress saves automatically on this device.' : 'Browser storage is unavailable. Progress lasts for this session.';
    const query = search.value.trim().toLocaleLowerCase();
    const visible = ACHIEVEMENTS.filter((a) => {
      const earned = tracker.unlockedAt(a.id) !== null;
      return (mode === 'all' || a.mode === mode) && (status.value === 'all' || earned === (status.value === 'unlocked'))
        && (!query || `${a.name} ${a.description}`.toLocaleLowerCase().includes(query));
    });
    results.textContent = `${visible.length} ${visible.length === 1 ? 'trophy' : 'trophies'} · ${mode === 'all' ? 'All modes' : mode === 'legacy' ? 'Legacy milestones' : mode === 'havoc' ? 'Kaiju Havoc' : 'Title Match'}`;
    grid.innerHTML = visible.length ? visible.map((a) => {
      const at = tracker.unlockedAt(a.id), earned = at !== null, progress = tracker.progress(a);
      const percent = Math.floor(progress / a.goal * 100);
      const date = earned ? new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return `<article class="trophy-card ${earned ? 'earned' : 'locked'} tier-${a.tier}" data-trophy-id="${a.id}">
        <div class="trophy-card-top">${icon(a)}<div><span class="trophy-category">${a.mode === 'legacy' ? 'LEGACY' : a.mode === 'havoc' ? 'HAVOC' : 'WRESTLING'}</span><h3>${a.name}</h3><span class="trophy-tier">${a.tier} <i>·</i> ${a.points} TP</span></div><span class="trophy-state" aria-label="${earned ? 'Unlocked' : 'Locked'}">${earned ? '✓' : '◇'}</span></div>
        <p class="trophy-description">${a.description}</p>
        <div class="trophy-progress-label"><span>${earned ? 'UNLOCKED · ' + date : a.scope.toUpperCase()}</span><b>${earned ? 'COMPLETE' : number(progress) + ' / ' + number(a.goal)}</b></div>
        <progress max="${a.goal}" value="${progress}" aria-label="${a.name}: ${percent}% complete"></progress>
      </article>`;
    }).join('') : '<div class="trophy-empty"><b>No trophies found.</b><p>Try another search or filter.</p></div>';
  }
  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    onOpen();
    dialog.showModal();
    previousButtons = {}; padCooldown = 0.35;
    refresh();
    dialog.querySelector('.trophy-close').focus({ preventScroll: true });
  }
  function close() { dialog.close(); }
  dialog.querySelector('.trophy-close').addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    onClose();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  filters.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.trophyMode;
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    refresh(); grid.scrollTop = 0;
  }));
  search.addEventListener('input', refresh);
  status.addEventListener('change', refresh);
  document.querySelectorAll('[data-open-trophies]').forEach((button) => button.addEventListener('click', open));

  // Stop the game's keyboard handlers while retaining native text input,
  // select behavior and the modal's Tab focus trap.
  window.addEventListener('keydown', (e) => {
    if (!dialog.open) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.target === dialog || e.target?.tagName === 'BUTTON') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); grid.scrollBy({ top: e.key === 'ArrowDown' ? 180 : -180 }); }
    }
  }, true);
  window.addEventListener('keyup', (e) => { if (dialog.open) e.stopImmediatePropagation(); }, true);

  function pollGamepad(dt) {
    const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected);
    if (!pad) return;
    const pressed = (i) => !!pad.buttons[i]?.pressed && !previousButtons[i];
    padCooldown = Math.max(0, padCooldown - dt);
    if (padCooldown === 0) {
      if (pressed(1) || pressed(9)) close();
      else if (pressed(14) || pressed(15)) {
        const next = (filters.findIndex((b) => b.dataset.trophyMode === mode) + (pressed(14) ? -1 : 1) + filters.length) % filters.length;
        filters[next].click(); filters[next].focus({ preventScroll: true }); padCooldown = 0.18;
      } else if (pad.buttons[12]?.pressed || pad.axes[1] < -0.55) grid.scrollBy({ top: -500 * dt });
      else if (pad.buttons[13]?.pressed || pad.axes[1] > 0.55) grid.scrollBy({ top: 500 * dt });
      else if (pressed(0)) document.activeElement?.click();
    }
    for (const i of [0, 1, 9, 12, 13, 14, 15]) previousButtons[i] = !!pad.buttons[i]?.pressed;
  }
  return {
    get isOpen() { return dialog.open; },
    open, close, refresh,
    enqueue(a) { queue.push(a); },
    update(dt, notificationsAllowed = true) {
      if (dialog.open) pollGamepad(Math.min(dt, 0.05));
      if (document.hidden || !notificationsAllowed) return;
      dt = Math.max(0, Math.min(dt, 0.1));
      if (active) {
        toastTime += dt;
        if (toastTime >= 4.8) { toast.classList.remove('visible'); active = null; gap = 0.4; }
      } else if (gap > 0) { gap -= dt; }
      else if (queue.length) {
        active = queue.shift(); toastTime = 0;
        toast.className = `tier-${active.tier}`;
        toast.innerHTML = `${icon(active)}<div class="achievement-toast-copy"><span class="achievement-toast-eyebrow">${active.tier === 'platinum' ? 'PLATINUM TROPHY EARNED' : 'ACHIEVEMENT UNLOCKED'} <b>+${active.points} TP</b></span><strong>${active.name}</strong><span class="achievement-toast-description">${active.description}</span></div><span class="achievement-toast-check" aria-hidden="true">✓</span><span class="achievement-toast-timer" aria-hidden="true"></span>`;
        // Separate the enter transition from content insertion, including back-to-back unlocks.
        void toast.offsetWidth;
        toast.classList.add('visible');
        chime(active.tier);
      }
    },
  };
}
