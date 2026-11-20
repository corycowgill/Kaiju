// Cinematic video layer: the KAIJU HAVOC trailer (which opens on the
// Hallucinated Games studio card) on first load,
// muted battle-clip previews on the monster-select cards, and the WATCH
// TRAILER modal. Everything here is optional sugar: any video failure falls
// straight through to the normal menu. Videos live in assets/video/ (see its
// README.md).
//
// It also does the menu's share of the boot screen (window.__boot, index.html):
// every webfont glyph the game can show, and every image / video the title menu
// can show, are in memory before the menu is revealed (bootFonts, bootMedia).
// The trailer (intro and WATCH TRAILER) is the one thing that still streams:
// 14 MB, played only on a first visit or when asked for.
//
// ?intro=0 / ?nointro skip the intro (automated browsers skip it by default).

import { isMobile } from './quality.js';
import { MONSTERS } from './monsters.js';

const VID = 'assets/video/';
const SUFFIX = isMobile ? '_480p' : '';       // 854x480 baseline encodes for phones
const SEEN_KEY = 'kh_intro_seen';

// ------------------------------------------------------------- boot: fonts
// index.html's Google Fonts are split into unicode-range subsets that the
// browser fetches the first time a glyph from one is drawn (a CJK face is
// ~120 subsets): mid-match and on the result screen, until now. At boot every
// face loads every glyph the game can show: printable ASCII plus BOOT_GLYPHS.
// BOOT_GLYPHS = every non-ASCII character in src/**/*.js and index.html
// (commentary captions included: hud.js shows commentaryLines.js text), emoji
// left out (no webfont draws them). Generated, do not edit by hand; after
// adding text with new characters, regenerate it with
//   node C:/Users/coryc/kaiju3/devtools/upfront/menu/gen_glyphs.mjs [repoRoot]
// and paste its output here. A character missed here still draws: its subset
// is fetched on first use, as before.
const BOOT_GLYPHS = "°·éπϟ—“”•…Ⅱ←↑→↓≈⏱▲▶▸▼◀◆☄★☢⚠✓✕✥✨❤いきくさしだてのれをイェォオカクケゲコゴシジズタチッテトドニネハバパビフホボムメモュヨラリルワンヴー一三下中乱事二五交京人体作停兵出利力勝化北卒参古召台司向君喚四地壊大定対寿居屋山工店座強得怒怪戦手択押掴撃操敗映時暴書本東械標横樹機止気氷決河波海深演火点焼獣王画番目相破磁社神竜者舞螂蟷行質選部酒鉄銀闘防隊電頭鳥";
// The faces index.html requests (family, weight)
const FONT_FACES = [['Bebas Neue', 400], ['Noto Sans JP', 400], ['Noto Sans JP', 700], ['Noto Sans JP', 900],
  ['Stick', 400], ['Yuji Mai', 400], ['Yuji Boku', 400], ['Reggae One', 400]];
const boot = window.__boot || { set() {}, until: () => Promise.resolve() };
const timeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
async function bootFonts() {
  try {
    if (!document.fonts || !document.fonts.load) return;
    // The faces exist once the Google Fonts stylesheet has loaded
    const link = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    if (link && !link.sheet) {
      await timeout(new Promise((r) => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); }), 15000);
    }
    let ascii = '';
    for (let c = 32; c < 127; c++) ascii += String.fromCharCode(c);
    const text = ascii + BOOT_GLYPHS;
    let n = 0;
    // (offline / blocked fonts: a failed or stalled face counts as done, the fallback font draws)
    await Promise.all(FONT_FACES.map(([family, w]) => timeout(document.fonts.load(`${w} 32px "${family}"`, text), 25000)
      .catch(() => {}).then(() => boot.set('fonts', ++n / FONT_FACES.length))));
  } finally {
    boot.set('fonts', 1);
  }
}

// ------------------------------------------------------------- boot: media
// Every image the title menu shows (CSS backgrounds in index.html, the
// portraits game.js puts on the cards and the showcase) decoded and held, so
// the CSS reuses the in-memory copy; every menu video fetched whole into a
// blob: URL (bootVideoURL), so nothing streams when a card is hovered. The
// card videos are then played once under the boot screen, so their decoders
// and first frames are up before the first hover.
const MENU_IMAGES = ['assets/ui/menu/bg_still.webp', 'assets/ui/menu/mode_havoc.webp', 'assets/ui/menu/mode_title.webp',
  'assets/ui/menu/mode_lone.webp', 'assets/ui/menu/stage_tokyo.webp', 'assets/ui/menu/stage_chicago.webp',
  'assets/ui/menu/stage_dc.webp', 'assets/ui/menu/stage_nyc.webp', 'assets/ui/menu/stage_sf.webp',
  ...Object.values(MONSTERS).map((m) => `assets/${m.portrait}`)];
// The desktop backdrop reel (game.js _menuReel; phones and reduced motion keep the still)
const REEL_OK = !isMobile && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const MENU_VIDEOS = [...new Set(Object.values(MONSTERS).map((m) => m.previewVideo).filter(Boolean))].map((f) => VID + f);
if (REEL_OK) MENU_VIDEOS.push(VID + 'menu_loop.mp4');
const _bootImgs = [];                         // (held: the decoded copies stay in the memory cache)
const _bootVideos = new Map();                // 'assets/video/x.mp4' -> blob: URL
window.__bootMedia = _bootVideos;             // (game.js reads the reel's)
/** The blob: URL of a menu video loaded at boot, else its own URL (streams). */
function bootVideoURL(path) { return _bootVideos.get(path) || path; }
async function fetchWhole(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const type = res.headers.get('content-type') || 'video/mp4';
  if (!res.body || !res.body.getReader) { const b = await res.blob(); onBytes(b.size, b.size); return b; }
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.byteLength;
    onBytes(got, total);
  }
  return new Blob(chunks, { type });
}
function cardsBuilt() {
  return new Promise((resolve) => {
    const has = () => document.querySelector('#monsterCards .monster-card');
    if (has()) { resolve(); return; }
    const mo = new MutationObserver(() => { if (has()) { mo.disconnect(); resolve(); } });
    mo.observe(document.getElementById('monsterCards') || document.body, { childList: true, subtree: true });
  });
}
async function bootMedia() {
  try {
    // progress: bytes of the videos (guessed at 250 KB until their headers say), plus 30 KB an image
    const IMG = 30e3, prog = new Map();
    for (const p of MENU_VIDEOS) prog.set(p, [0, 250e3]);
    for (const p of MENU_IMAGES) prog.set(p, [0, IMG]);
    const report = () => {
      let a = 0, b = 0;
      for (const [got, tot] of prog.values()) { a += Math.min(got, tot); b += tot; }
      boot.set('media', 0.9 * a / b);
    };
    await Promise.all([
      ...MENU_IMAGES.map((p) => {
        const im = new Image();
        im.src = p;
        _bootImgs.push(im);
        return timeout(im.decode(), 30000).catch(() => {}).then(() => { prog.set(p, [IMG, IMG]); report(); });
      }),
      ...MENU_VIDEOS.map((p) => timeout(fetchWhole(p, (got, tot) => { prog.set(p, [got, Math.max(tot, got)]); report(); })
        .then((blob) => { if (blob) _bootVideos.set(p, URL.createObjectURL(blob)); }), 60000)
        .catch(() => { /* streams on demand instead, as before */ })
        .then(() => { const v = prog.get(p); prog.set(p, [v[1], v[1]]); report(); })),
    ]);
    // The card videos' decoders and first frames, under the boot screen
    await timeout(cardsBuilt(), 90000);
    await timeout(warmCardVideos(), 5000);
  } finally {
    boot.set('media', 1);
  }
}
/** Plays each card's preview once (muted, under the boot screen) and parks it on its first frame. */
function warmCardVideos() {
  const cards = [...document.querySelectorAll('#monsterCards .monster-card')].filter((c) => c.dataset.previewVideo);
  return Promise.all(cards.map((card) => new Promise((resolve) => {
    const v = ensurePreview(card);
    if (!v) { resolve(); return; }
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      if (!(menuShown() && (card.classList.contains('selected') || card.classList.contains('pad-focus') || card.matches(':hover')))) {
        v.pause(); v.classList.remove('on');
        try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
      }
      resolve();
    };
    v.addEventListener('playing', () => setTimeout(end, 250), { once: true });
    v.addEventListener('error', end, { once: true });
    v.play().catch(end);
  })));
}

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
// doesn't matter. The <video> is made at boot (warmCardVideos) from the
// blob: URL bootMedia fetched, and plays when a card is hovered, focused by
// keyboard/gamepad, or selected, and only while the title menu is up: a run
// hides #menu, which stops every preview and drops its decoder (the selected
// card used to keep looping behind the game); back at the menu it reloads
// from the same blob: URL, no network.
const menuEl = document.getElementById('menu');
const menuShown = () => !!menuEl && !menuEl.classList.contains('hidden');
function ensurePreview(card) {
  let v = card.querySelector('video.card-video');
  if (v || card.dataset.noVideo) return v;
  const prev = card.querySelector('.preview');
  const file = card.dataset.previewVideo;
  if (!prev || !file) return null;
  v = makeVideo('', { loop: true, preload: 'auto' });
  v.className = 'card-video';
  v.addEventListener('error', () => { if (!v.getAttribute('src')) return; card.dataset.noVideo = '1'; v.remove(); });
  v.addEventListener('playing', () => v.classList.add('on'));
  v.src = bootVideoURL(VID + file);
  prev.appendChild(v);
  return v;
}
function updateCard(card, hovered) {
  const active = menuShown() && (hovered || card.classList.contains('selected') || card.classList.contains('pad-focus'));
  if (active) {
    const v = ensurePreview(card);
    if (v && !v.getAttribute('src')) v.src = bootVideoURL(VID + card.dataset.previewVideo);
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
  // Run start / back to the menu
  if (menuEl) new MutationObserver(() => {
    if (menuShown()) { for (const c of root.querySelectorAll('.monster-card')) updateCard(c, c.matches(':hover')); return; }
    for (const v of document.querySelectorAll('video.card-video')) {
      v.pause(); v.classList.remove('on');
      v.removeAttribute('src'); v.load(); // releases the decoder and any buffered frames
    }
    const tv = document.querySelector('#trailer-modal video');
    if (tv && !tv.paused) tv.pause();
  }).observe(menuEl, { attributes: true, attributeFilter: ['class'] });
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
bootFonts();
bootMedia();
