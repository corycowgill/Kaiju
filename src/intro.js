// Cinematic video layer: the KAIJU HAVOC trailer (which opens on the
// Hallucinated Games studio card) on first load,
// muted battle-clip previews on the monster-select cards, and the WATCH
// TRAILER modal. Everything here is optional sugar: any video failure falls
// straight through to the normal menu, and nothing loads until it is needed
// (intro excepted). Videos live in assets/video/ (see its README.md).
//
// ?intro=0 / ?nointro skip the intro (automated browsers skip it by default).

import { isMobile } from './quality.js';

const VID = 'assets/video/';
const SUFFIX = isMobile ? '_480p' : '';       // 854x480 baseline encodes for phones
const SEEN_KEY = 'kh_intro_seen';

function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }

function makeVideo(src, { muted = true, loop = false, preload = 'auto', controls = false } = {}) {
  const v = document.createElement('video');
  v.muted = muted; v.defaultMuted = muted;
  v.loop = loop; v.controls = controls; v.preload = preload;
  v.playsInline = true;
  v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
  if (muted) v.setAttribute('muted', '');
  if (src) v.src = src;
  return v;
}

// ------------------------------------------------------------------ intro
// Same delivery and fallback pattern as the studio's Iron Strait cutscenes:
// H.264 MP4 first, VP9 WebM fallback; try with sound and fall back to muted
// autoplay if the browser refuses; if every source fails or nothing has
// played after 10 s, go straight to the menu. Any key, click, tap or gamepad
// button skips. ?intro=0 (or ?nointro, or a webdriver) skips it entirely;
// ?intro=1 forces it.
function addSources(v, base, webm = true) {
  const list = [[SUFFIX + '.mp4', 'video/mp4']];
  if (webm) list.push(['.webm', 'video/webm']);       // only the trailer (= intro) ships a WebM fallback (keeps the repo small)
  for (const [ext, type] of list) {
    const s = document.createElement('source');
    s.src = VID + base + ext; s.type = type;
    v.appendChild(s);
  }
  return v.lastElementChild;
}
function playIntro() {
  const q = new URLSearchParams(location.search).get('intro');
  if (q !== '1' && (q === '0' || /[?&]nointro\b/.test(location.search) || navigator.webdriver || sessionGet(SEEN_KEY))) return;
  sessionSet(SEEN_KEY, '1');

  const wrap = document.createElement('div');
  wrap.id = 'intro-video';
  const v = makeVideo('', { muted: false });
  // The trailer opens on the studio card, so it doubles as the intro.
  const lastSource = addSources(v, 'kaiju_havoc_trailer');
  const skip = document.createElement('div');
  skip.className = 'iv-skip'; skip.textContent = 'SKIP ▸';
  const snd = document.createElement('button');
  snd.className = 'iv-sound'; snd.type = 'button'; snd.textContent = '🔇 TAP FOR SOUND';
  snd.style.display = 'none';
  wrap.append(v, skip, snd);
  document.body.appendChild(wrap);

  let done = false, raf = 0;
  const close = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(stallTimer);
    window.removeEventListener('keydown', onKey, true);
    wrap.classList.add('iv-out');
    try { v.pause(); } catch (e) { /* ignore */ }
    setTimeout(() => { v.textContent = ''; v.load(); wrap.remove(); }, 450);
  };
  // Keys skip the intro and are swallowed so they don't also drive the menu.
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) close();
  };
  window.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', close);
  snd.addEventListener('click', (e) => {
    e.stopPropagation();
    v.muted = false;
    v.play().catch(() => {});
    snd.remove();
  });
  v.addEventListener('ended', close);
  lastSource.addEventListener('error', close);          // every source failed
  // A gamepad press (on any button) skips too. Wait for every button to be
  // released first so a held button doesn't skip it straight away.
  let armed = false;
  const poll = () => {
    if (done) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let any = false;
    for (const p of pads) if (p) for (const b of p.buttons) if (b.pressed) any = true;
    if (!any) armed = true;
    else if (armed) { close(); return; }
    raf = requestAnimationFrame(poll);
  };
  raf = requestAnimationFrame(poll);
  // Never block the game: a stalled download or a refused autoplay
  // (e.g. iOS Low Power Mode) drops straight to the menu.
  const stallTimer = setTimeout(() => { if (v.currentTime < 0.1) close(); }, 10000);
  v.addEventListener('playing', () => clearTimeout(stallTimer), { once: true });
  v.play().catch((err) => {
    if (!err || err.name !== 'NotAllowedError') return close();
    v.muted = true;                                       // autoplay with sound refused: play muted + offer sound
    snd.style.display = '';
    v.play().catch(close);
  });
}

// ------------------------------------------------------ card video previews
// Cards are built by game.js; we hook them by delegation so load order
// doesn't matter. The <video> is only created (preload="none" until then)
// when a card is hovered, focused by keyboard/gamepad, or selected.
function cardKey(card) {
  const h = card.querySelector('h3');
  return h ? h.textContent.trim().toLowerCase() : '';
}
function ensurePreview(card) {
  let v = card.querySelector('video.card-video');
  if (v || card.dataset.noVideo) return v;
  const prev = card.querySelector('.preview');
  const key = cardKey(card);
  if (!prev || !key) return null;
  v = makeVideo('', { loop: true, preload: 'none' });
  v.className = 'card-video';
  v.addEventListener('error', () => { card.dataset.noVideo = '1'; v.remove(); });
  v.addEventListener('playing', () => v.classList.add('on'));
  v.src = VID + 'preview_' + key + '.mp4';
  prev.appendChild(v);
  return v;
}
function updateCard(card, hovered) {
  const active = hovered || card.classList.contains('selected') || card.classList.contains('pad-focus');
  if (active) {
    const v = ensurePreview(card);
    if (v && v.paused) v.play().catch(() => {});
  } else {
    const v = card.querySelector('video.card-video');
    if (v && !v.paused) v.pause();
  }
}
function hookCards() {
  const root = document.getElementById('monsterCards');
  if (!root) return;
  root.addEventListener('pointerover', (e) => {
    const c = e.target.closest('.monster-card');
    if (c && !c.contains(e.relatedTarget)) updateCard(c, true);
  });
  root.addEventListener('pointerout', (e) => {
    const c = e.target.closest('.monster-card');
    if (c && !c.contains(e.relatedTarget)) updateCard(c, false);
  });
  // .selected / .pad-focus are toggled by game.js
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.target.classList && m.target.classList.contains('monster-card')) updateCard(m.target, m.target.matches(':hover'));
    }
  }).observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

// ------------------------------------------------------------ trailer modal
const REELS = [
  ['TRAILER', 'kaiju_havoc_trailer'],
  ['GORRAK', 'battle_gorrak'],
  ['TRIDON', 'battle_tridon'],
  ['MECHRA', 'battle_mechra'],
];
function hookTrailer() {
  const btn = document.getElementById('trailerBtn');
  if (!btn) return;
  let modal = null, v = null, idx = 0;
  const tabs = [];
  // play with sound; if the browser refuses (no user activation), play muted with the controls showing
  const play = () => v.play().catch((err) => { if (err && err.name === 'NotAllowedError') { v.muted = true; v.play().catch(() => {}); } });
  const load = (i, autoplay) => {
    idx = i;
    tabs.forEach((t, j) => t.classList.toggle('on', j === i));
    v.textContent = '';
    // if every source of a reel fails, move on to the next one
    addSources(v, REELS[i][1], false).addEventListener('error', () => { if (idx === i && i < REELS.length - 1) load(i + 1, true); });
    v.load();
    if (autoplay) play();
  };
  const onKey = (e) => {
    if (!modal || modal.classList.contains('hidden')) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === ' ') { e.preventDefault(); v.paused ? play() : v.pause(); }
  };
  const close = () => {
    modal.classList.add('hidden');
    v.pause();
    window.removeEventListener('keydown', onKey, true);
  };
  const open = () => {
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'trailer-modal';
      modal.innerHTML = '<div class="tm-box"><button type="button" class="tm-close" aria-label="Close">✕</button>' +
        '<div class="tm-tabs"></div></div>';
      const box = modal.querySelector('.tm-box');
      v = makeVideo('', { muted: false, controls: true, preload: 'metadata' });
      box.insertBefore(v, box.querySelector('.tm-tabs'));
      REELS.forEach(([label], i) => {
        const t = document.createElement('button');
        t.type = 'button'; t.textContent = label;
        t.addEventListener('click', () => load(i, true));
        modal.querySelector('.tm-tabs').appendChild(t); tabs.push(t);
      });
      // Play the reels back to back.
      v.addEventListener('ended', () => { if (idx < REELS.length - 1) load(idx + 1, true); });
      modal.querySelector('.tm-close').addEventListener('click', close);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
      document.body.appendChild(modal);
      load(0, false);
    }
    modal.classList.remove('hidden');
    window.addEventListener('keydown', onKey, true);
    play();
  };
  btn.addEventListener('click', open);
}

playIntro();
hookCards();
hookTrailer();
