// Match HUD and presentation UI: the fighting-game top band (portraits,
// health with a ghost chunk, stamina, momentum, fall pips, clock), move and
// landmark callouts, the pin count, the kick-out / escape mash meter, context
// prompts with the active device's glyphs, the lock-up move wheel, the
// commentary ticker, entrance name cards, fall result band, the champion /
// defeat result screen and the first-match tutorial tips.
// OWNER: HUD + input engineer. Markup and CSS: index.html, "TITLE MATCH HUD".
//
// Rules this file keeps (same as the classic HUD in game.js):
//  - Read-only: W.player / W.rival, W.match.state, W.grapple.hold / pin,
//    W.input.ui, bus events. It never calls into the core.
//  - The DOM is written only when a quantised value changed; bars move with
//    transform; one-shot motion is the Web Animations API on transform /
//    opacity (no reflow to restart an animation, nothing animates a blur).
//  - Timers run on dtReal from update() / updateIdle(), never setTimeout.
//  - No DOM at import or in the factory (the smoke test runs in Node).
import { EV } from './events.js';
import { BINDINGS, wheelLayout } from './input.js';
import { FINISHERS } from './grapple.js';
import { PERSONAS } from './rivalAI.js';
import { SIGNATURES } from './signatures.js';

// Face crop of assets/<key>.webp (640x360 in-engine renders) for the band portrait
const PORTRAIT = {
  godzilla: { pos: '54% 16%', size: '250%' },
  ghidorah: { pos: '58% 38%', size: '230%' },
  mecha: { pos: '60% 6%', size: '250%' },
};
const EPITHET = { godzilla: 'THE ATOMIC TYRANT', ghidorah: 'THE THREE-HEADED STORM', mecha: 'THE IRON EXECUTIONER' };
const HOME = { player: 'FROM THE DEPTHS OF LAKE MICHIGAN', rival: 'FROM THE WRECKAGE OF THE LOOP' };
const FALL_JP = ['', '一本目', '二本目', '三本目', '四本目', '五本目'];
const COUNT_WORD = ['', 'ONE!', 'TWO!', 'THREE!'];
const WHEEL_LABEL = { whip: 'WHIP', suplex: 'SUPLEX', swing: 'SWING' };
const BAR_SHOTS = { entrance: true, finisher: true, ko: true, win: true, lose: true };
const CALL_DUR = { move: 1.25, defend: 1.25, landmark: 1.9, finisher: 2.3, result: 2.4 };
const PRE_RE = /^(THROUGH THE|INTO THE|OFF THE|ONTO THE|DOWN GOES|AND NEW\.\.\.|AND STILL\.\.\.)\s+(.+)$/;
const TUT_KEY = 'kaijuWrTut';
const TUT_NEED = { strike: 2, block: 1, grab: 1, ground: 1, taunt: 1, finisher: 1 };

// ---- glyphs -----------------------------------------------------------------
const MOUSE = { M0: 'M8 1.5A6.5 6.5 0 0 0 1.5 8V9.5H8Z', M2: 'M8 1.5A6.5 6.5 0 0 1 14.5 8V9.5H8Z' };
const DPAD = { DU: 'M8 1h6v7H8z', DD: 'M8 14h6v7H8z', DL: 'M1 8h7v6H1z', DR: 'M14 8h7v6h-7z' };
const TOUCH_CLASS = { GRAB: 'grab', BLOCK: 'block', ULT: 'ult', SMASH: '' };
/** HTML for one binding token (see BINDINGS in input.js). */
function glyph(tok) {
  if (!tok) return '';
  if (MOUSE[tok]) return `<svg class="wr-g" viewBox="0 0 16 22" aria-label="${tok === 'M0' ? 'left' : 'right'} mouse button"><rect x="1.5" y="1.5" width="13" height="19" rx="6.5"/><path class="on" d="${MOUSE[tok]}"/></svg>`;
  if (tok === 'M1') return '<svg class="wr-g" viewBox="0 0 16 22" aria-label="middle mouse button"><rect x="1.5" y="1.5" width="13" height="19" rx="6.5"/><rect class="on" x="6.5" y="4" width="3" height="6" rx="1.5"/></svg>';
  if (DPAD[tok]) return `<svg class="wr-g" viewBox="0 0 22 22" aria-label="d-pad"><path d="M8 1h6v7h7v6h-7v7H8v-7H1V8h7z"/><path class="on" d="${DPAD[tok]}"/></svg>`;
  if (tok.length === 2 && tok[0] === 'P') return `<i class="wr-k pb ${tok[1].toLowerCase()}">${tok[1]}</i>`;
  if (tok === 'LS') return '<i class="wr-k pb">L</i>';
  if (tok === 'L3' || tok === 'R3') return `<i class="wr-k pb">${tok}</i>`;
  if (tok === 'LT' || tok === 'RT' || tok === 'LB' || tok === 'RB' || tok === 'START') return `<i class="wr-k sh">${tok}</i>`;
  if (tok.startsWith('T:')) { const n = tok.slice(2); return `<i class="wr-k tk ${TOUCH_CLASS[n] !== undefined ? TOUCH_CLASS[n] : 'plain'}">${n}</i>`; }
  return `<i class="wr-k">${tok}</i>`;
}
const pill = (tok, label, mod, cls) => `<div class="wr-pill${cls ? ' ' + cls : ''}">${mod ? `<em>${mod}</em>` : ''}${glyph(tok)}${label}</div>`;
const note = (text) => `<div class="wr-pill note">${text}</div>`;

/** @returns {{ start, update, updateIdle, onGameOver, dispose }} */
export function createHud(ctx, W) {
  const doc = typeof document !== 'undefined' && document.getElementById ? document : null;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let el = null;          // element refs, resolved on the first start()
  let live = false;       // layers up (between match:start and the result screen)
  let offs = [];
  let slowT = 0;          // 10 Hz pass accumulator
  let device = '';
  // per fighter id: band elements + the last values written
  const side = { player: null, rival: null };
  let lastClock = -1, lastFallTxt = '';
  let phase = 'idle', shot = '';
  let callI = 0;
  let pinT = -1;                         // > 0: seconds until the pin numerals go
  let mashKind = '', mashQ = -1, mashOwn = 0;
  let promptKey = '', wheelKey = '', wheelSelT = 0, wheelSel = '';
  const evPrompt = { grab: false, pickup: false, pin: false, kickout: false, escape: false, getup: false, finisher: false, skip: false, defend: false, comeback: false };
  let tipId = '', tipT = 0;
  let tickT = 0, tickGap = 0;
  let cardT = [0, 0], cardWait = { player: -1, rival: -1 };
  let interT = -1;
  let hitsTaken = 0;
  let tut = null, tutOn = false;
  let prev = null;                       // strings swapped in start(), restored in dispose()
  let lockSeen = false;
  let stallT = 0;                        // seconds the player has kept away (the director boos at 6)

  const $ = (id) => doc.getElementById(id);
  const cls = (id) => (id === 'rival' ? 'p2' : 'p1');
  const nameOf = (id) => (W[id] ? W[id].name : '');

  function resolve() {
    const root = $('wr-hud');
    if (!root) return null;
    const mk = (r) => ({
      root: r, port: r.querySelector('.wr-port i'), portFlash: r.querySelector('.wr-port u'), meters: r.querySelector('.wr-meters'),
      name: r.querySelector('.wr-name b'), role: r.querySelector('.wr-name .role'), chip: r.querySelector('.wr-name .chip'),
      ghost: r.querySelector('.wr-hp .ghost'), fill: r.querySelector('.wr-hp .fill'), flash: r.querySelector('.wr-hp .flash'),
      sta: r.querySelector('.wr-sta i'), mom: r.querySelector('.wr-mom .track i'), momLbl: r.querySelector('.wr-mom span'),
      hp: -1, st: -1, mo: -1, chipTxt: '', crit: false, gassed: false, full: false, out: false, key: '',
    });
    const cards = root.querySelectorAll('.wr-card');
    return {
      root, top: $('wr-top'), p1: mk($('wr-p1')), p2: mk($('wr-p2')),
      clock: $('wr-clock'), fall: $('wr-fall'), pips: { player: root.querySelector('.wr-pips.p1'), rival: root.querySelector('.wr-pips.p2') },
      calls: Array.from(root.querySelectorAll('.wr-call')),
      pin: $('wr-pin'), pinB: $('wr-pin').firstElementChild, count: root.querySelector('.wr-count'),
      mash: $('wr-mash'), mashT: root.querySelector('#wr-mash .t'), mashG: root.querySelector('#wr-mash .g'), mashFill: root.querySelector('#wr-mash .track i'),
      prompt: $('wr-prompt'), wheel: $('wr-wheel'), ticker: $('wr-ticker'), tickerLine: root.querySelector('#wr-ticker .line'),
      cards: { player: cards[0], rival: cards[1] }, inter: $('wr-inter'),
      skip: $('wr-skip'), touch: $('wr-touch'), mashZone: $('wr-mash-zone'),
      btnGrab: $('wr-btn-grab'), btnBlock: $('wr-btn-block'), btnTaunt: $('wr-btn-taunt'), btnLock: $('wr-btn-lock'),
      help: $('wr-help'), moves: $('wr-moves'), upTitle: $('upgrade-title'), corner: $('wr-corner'),
      go: $('gameover'), defend: $('wr-defend-btn'), again: $('goAgainBtn'),
    };
  }

  // ---- small helpers ----------------------------------------------------------
  /** One-shot Web Animation on an element, replacing the one before it. */
  function play(node, frames, ms, fill = 'forwards') {
    if (!node || !node.animate) return;
    if (node._wa) node._wa.cancel();
    node._wa = node.animate(frames, { duration: ms, fill, easing: 'linear' });
  }
  function stopAnim(node) { if (node && node._wa) { node._wa.cancel(); node._wa = null; } }
  const title = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

  // ---- top band ---------------------------------------------------------------
  function setupSide(id) {
    const f = W[id], s = side[id];
    s.key = f.key;
    s.name.textContent = f.name;
    const defense = W.match.state.defense > 0;
    s.role.textContent = (id === 'player') === defense ? 'CHAMPION' : 'CHALLENGER';
    const p = PORTRAIT[f.key] || PORTRAIT.godzilla;
    s.port.style.backgroundImage = `url(assets/${f.key}.webp)`;
    s.port.style.backgroundPosition = p.pos;
    s.port.style.backgroundSize = p.size;
    s.hp = s.st = s.mo = -1; s.chipTxt = ''; s.chip.textContent = ''; s.chip.className = 'chip';
    s.crit = s.gassed = s.full = s.out = false;
    s.root.classList.remove('crit', 'gassed', 'full', 'out');
    // No drain animation for the opening fill
    s.ghost.style.transition = 'none'; s.ghost.style.transform = 'scaleX(1)';
    s.momLbl.textContent = 'MOMENTUM';
  }
  function writeHp(id) {
    const f = W[id], s = side[id];
    const v = Math.round(Math.max(0, Math.min(1, f.hp / f.maxHp)) * 400);
    if (v === s.hp) return;
    if (s.hp >= 0 && v < s.hp) s.ghost.style.transition = '';   // a hit: the ghost drains after its hold
    else s.ghost.style.transition = 'none';                     // heal / reset: snap
    s.hp = v;
    const t = `scaleX(${v / 400})`;
    s.fill.style.transform = t; s.ghost.style.transform = t;
  }
  function writeSide(id) {
    const f = W[id], s = side[id];
    writeHp(id);
    let v = Math.round(Math.max(0, Math.min(1, f.stamina / f.maxStamina)) * 100);
    if (v !== s.st) { s.st = v; s.sta.style.transform = `scaleX(${v / 100})`; }
    v = Math.round(Math.max(0, Math.min(1, f.momentum / 100)) * 100);
    if (v !== s.mo) { s.mo = v; s.mom.style.transform = `scaleX(${v / 100})`; }
    const full = v >= 100, crit = f.hp > 0 && f.hp / f.maxHp < 0.25, gassed = f.stamina <= 1, out = f.state === 'ko';
    if (full !== s.full) { s.full = full; s.root.classList.toggle('full', full); s.momLbl.textContent = full ? 'FINISHER' : 'MOMENTUM'; }
    if (crit !== s.crit) { s.crit = crit; s.root.classList.toggle('crit', crit); }
    if (gassed !== s.gassed) { s.gassed = gassed; s.root.classList.toggle('gassed', gassed); }
    if (out !== s.out) { s.out = out; s.root.classList.toggle('out', out); }
    // One status word: an opening for the other fighter reads gold, own trouble red
    const st = f.state;
    const chip = out ? 'K.O.' : st === 'stunned' ? 'STUNNED' : st === 'downed' || st === 'pinned' ? 'DOWN' : gassed ? 'GASSED' : crit ? 'DANGER' : '';
    if (chip !== s.chipTxt) {
      s.chipTxt = chip;
      if (chip) s.chip.textContent = chip;
      s.chip.className = 'chip' + (chip ? ' on' : '') + (chip === 'STUNNED' || chip === 'DOWN' || chip === 'GASSED' ? ' open' : '');
    }
  }
  function writePips() {
    const ms = W.match.state, need = Math.max(1, Math.ceil(ms.bestOf / 2));
    for (const id of ['player', 'rival']) {
      const box = el.pips[id], won = id === 'player' ? ms.playerFalls : ms.rivalFalls;
      while (box.children.length < need) box.appendChild(doc.createElement('i'));
      while (box.children.length > need) box.lastElementChild.remove();
      for (let i = 0; i < need; i++) box.children[i].classList.toggle('on', i < won);
    }
    const txt = ms.defense > 0 ? `DEFENSE ${ms.defense} · FALL ${ms.fall}` : `FALL ${ms.fall}`;
    if (txt !== lastFallTxt) { lastFallTxt = txt; el.fall.innerHTML = `${txt} <span class="jp-sub">${FALL_JP[ms.fall] || ''}</span>`; }
  }
  function writeClock() {
    const t = Math.floor(W.match.state.time);
    if (t === lastClock) return;
    lastClock = t;
    const s = t % 60;
    el.clock.textContent = `${Math.floor(t / 60)}:${s < 10 ? '0' : ''}${s}`;
  }
  function onDamage(e) {
    const s = side[e.who];
    if (!s || !live) return;
    writeHp(e.who);
    const frac = e.maxHp > 0 ? e.amount / e.maxHp : 0;
    if (frac < 0.012 || reduced) return;
    const a = Math.min(0.95, 0.3 + frac * 6);
    play(s.flash, [{ opacity: a }, { opacity: 0 }], 240);
    if (frac >= 0.07) {
      play(s.portFlash, [{ opacity: 0.8 }, { opacity: 0 }], 300);
      const d = e.who === 'player' ? -1 : 1, m = Math.min(10, 3 + frac * 50);
      play(s.meters, [{ transform: 'translate(0,0)' }, { transform: `translate(${d * m}px,${m * 0.4}px)` }, { transform: `translate(${-d * m * 0.5}px,${-m * 0.3}px)` },
        { transform: `translate(${d * m * 0.25}px,0)` }, { transform: 'translate(0,0)' }], 300, 'none');
    }
  }

  // ---- callouts ---------------------------------------------------------------
  function callout(text, sub, tier, who, pre, sec) {
    if (!live || !text) return;
    tier = CALL_DUR[tier] ? tier : 'move';
    // A landmark set piece owns the screen while it is up: a move name under it would be drawn over it
    if (tier === 'move') for (const c of el.calls) if (c._on > 0.25 && c._tier === 'landmark') return;
    const m = !pre && PRE_RE.exec(text);
    if (m) { pre = m[1]; text = m[2]; }
    const centre = tier !== 'move' && tier !== 'defend' || (who !== 'player' && who !== 'rival');
    const pos = centre ? '' : cls(who);
    // Pooled nodes: a new call replaces whatever stands in its spot, else takes a free one
    let node = null;
    for (const c of el.calls) if (c._pos === pos && c._on > 0) { node = c; break; }
    if (!node) for (const c of el.calls) if (!(c._on > 0)) { node = c; break; }
    if (!node) node = el.calls[callI = (callI + 1) % el.calls.length];
    const dur = sec || CALL_DUR[tier];
    node._pos = pos; node._on = dur; node._tier = tier;
    node.className = `wr-call t-${tier}${pos ? ' ' + pos : ''}`;
    node.children[0].textContent = pre || '';
    node.children[1].textContent = text;
    node.children[2].textContent = sub || '';
    const ms = dur * 1000, dir = pos === 'p1' ? -1 : pos === 'p2' ? 1 : 0, big = tier === 'result' || tier === 'finisher';
    play(node, reduced ? [{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }] : [
      { opacity: 0, transform: `translateX(${dir * 70}px) scale(${big ? 2.3 : 1.8})` },
      { opacity: 1, transform: 'translateX(0) scale(0.95)', offset: 110 / ms },
      { opacity: 1, transform: 'translateX(0) scale(1.03)', offset: 190 / ms },
      { opacity: 1, transform: 'translateX(0) scale(1)', offset: 260 / ms },
      { opacity: 1, transform: 'translateX(0) scale(1.02)', offset: 1 - 220 / ms },
      { opacity: 0, transform: `translateX(${dir * -24}px) translateY(-10px) scale(1.02)` },
    ], ms);
  }

  // ---- pin count --------------------------------------------------------------
  function pinCount(n) {
    el.pinB.textContent = COUNT_WORD[n] || String(n);
    el.pin.className = 'c' + n;
    el.count.classList.add('on');
    for (let i = 0; i < 3; i++) el.count.children[i].classList.toggle('on', i < n);
    pinT = n >= 3 ? 1.3 : 1.6;
    play(el.pin, reduced ? [{ opacity: 1 }, { opacity: 0.6 }] : [
      { opacity: 0, transform: 'scale(2.6)' }, { opacity: 1, transform: 'scale(0.94)', offset: 0.1 }, { opacity: 1, transform: 'scale(1.04)', offset: 0.16 },
      { opacity: 1, transform: 'scale(1)', offset: 0.22 }, { opacity: 0.55, transform: 'scale(1)' },
    ], 1000);
  }
  function pinEnd(burst) {
    el.root.classList.remove('pinning');
    if (pinT < 0 && !el.count.classList.contains('on')) return;
    pinT = -1;
    el.count.classList.remove('on');
    play(el.pin, burst && !reduced ? [{ opacity: 0.8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.7) rotate(-6deg)' }] : [{ opacity: 0.6 }, { opacity: 0 }], burst ? 220 : 300);
  }

  // ---- mash meter -------------------------------------------------------------
  function setMash(kind) {
    if (kind === mashKind) return;
    mashKind = kind; mashQ = -1; mashOwn = 0;
    el.mash.classList.toggle('on', !!kind);
    if (el.mashZone) el.mashZone.classList.toggle('on', !!kind && device === 'touch');
    if (kind) {
      el.mashT.textContent = kind === 'kickout' ? 'KICK OUT!' : 'BREAK FREE!';
      el.mashG.innerHTML = device === 'touch' ? '<em>TAP ANYWHERE</em>' : `MASH ${glyph(BINDINGS[device].mash)}`;
    }
  }
  function writeMash(dtReal) {
    const g = W.grapple;
    let v;
    if (typeof W.player.struggle === 'number' && W.player.struggle > 0) v = W.player.struggle;
    else if (mashKind === 'kickout' && g.pin && g.pin.active) v = g.pin.meter;
    else if (mashKind === 'escape' && g.hold && g.hold.active) v = g.hold.escape;
    else { mashOwn = Math.max(0, Math.min(1, mashOwn + W.player.intent.mash * 0.1 - dtReal * 0.3)); v = mashOwn; }
    const q = Math.round(Math.max(0, Math.min(1, v)) * 100);
    if (q !== mashQ) { mashQ = q; el.mashFill.style.transform = `scaleX(${q / 100})`; }
  }

  // ---- prompts, wheel, tutorial ----------------------------------------------
  function loadTut() {
    tut = { strike: 0, block: 0, grab: 0, ground: 0, taunt: 0, finisher: 0 };
    try { Object.assign(tut, JSON.parse(localStorage.getItem(TUT_KEY) || '{}')); } catch (e) { /* private mode: teach every time */ }
    tutOn = false;
    for (const k in TUT_NEED) if (!(tut[k] >= TUT_NEED[k])) tutOn = true;
  }
  function learned(k) {
    if (!tut || tut[k] >= TUT_NEED[k]) return;
    tut[k]++;
    if (tut[k] >= TUT_NEED[k]) { try { localStorage.setItem(TUT_KEY, JSON.stringify(tut)); } catch (e) { /* ignore */ } if (tipId === k) tipT = 0; }
  }
  const needs = (k) => tutOn && tut[k] < TUT_NEED[k];
  function tip(id, sec) { if (needs(id) && tipId !== id) { tipId = id; tipT = sec; } else if (tipId === id) tipT = Math.max(tipT, sec); }

  /** What the prompt slot should say right now: derived from the fighters, OR'd with the director's prompt events. */
  function writePrompts() {
    const P = W.player, R = W.rival, B = BINDINGS[device], g = W.grapple, ui = W.input.ui;
    const fight = phase === 'fight';
    const can = (w) => fight && typeof P.can === 'function' && P.can(w);
    // Mash meter owns the screen when the player is pinned or held
    const pinned = fight && g.pin && g.pin.active && g.pin.target === 'player' && !g.pin.forced;
    const held = fight && g.hold && g.hold.active && g.hold.target === 'player' && !g.hold.locked && (g.hold.phase === 'lockup' || g.hold.phase === 'carry' || g.hold.phase === 'hoist' || g.hold.phase === 'swing');
    setMash(pinned || evPrompt.kickout ? 'kickout' : held || evPrompt.escape ? 'escape' : '');

    // Lock-up: the move wheel takes the slot
    const wheelOn = fight && ui.inLockup;
    // RUN held in the lock-up: toward / away become the kaiju's two signature moves (signatures.js)
    const sigs = wheelOn && P.intent && P.intent.sprint ? SIGNATURES[P.key] : null;
    let wk = '';
    if (wheelOn) wk = device + ui.wheelRot + wheelSel + (sigs ? 'S' : '');
    if (wk !== wheelKey) {
      wheelKey = wk;
      el.wheel.classList.toggle('on', wheelOn);
      if (wheelOn) {
        const lay = wheelLayout(ui.wheelRot), ar = ['▲', '▶', '▼', '◀'], slot = ['u', 'r', 'd', 'l'];
        for (let i = 0; i < 4; i++) {
          const n = el.wheel.querySelector('.' + slot[i]);
          n.className = slot[i] + (wheelSel === lay[i] ? ' sel' : '');
          const lab = sigs && lay[i] === 'whip' ? sigs[0].name : sigs && lay[i] === 'suplex' ? sigs[1].name : WHEEL_LABEL[lay[i]];
          n.innerHTML = device === 'kbm' ? `${glyph(B.dir[i])}${lab}` : `<span class="ar">${ar[i]}</span>${lab}`;
        }
        const c = el.wheel.querySelector('.c');
        c.className = 'c' + (wheelSel === 'slam' ? ' sel' : '');
        c.innerHTML = `${glyph(B.grab)}SLAM`;
      }
    }

    let html = '', key = '';
    if (mashKind || wheelOn || !live) key = '';
    else if (fight && P.comebackReady || evPrompt.comeback) { key = 'fire'; html = pill(B.taunt, 'FIRE UP!', '', 'hot') + note('THE CROWD IS BEHIND YOU'); }
    else if (fight && P.state === 'downed' || evPrompt.getup) { key = 'getup'; html = pill(B.mash, 'GET UP', 'MASH'); }
    else if (can('finisher') || evPrompt.finisher) {
      key = 'fin'; html = pill(B.finisher, (FINISHERS[P.key] && FINISHERS[P.key].name) || 'FINISHER', '', 'hot');
    } else if (can('pin') || evPrompt.pin || evPrompt.pickup) {
      key = 'ground'; html = pill(B.grab, 'PIN', 'HOLD', 'hot') + pill(B.grab, 'PICK UP', 'TAP');
      if (needs('taunt')) { key += 't'; html += pill(B.taunt, 'TAUNT'); }
    } else if (fight && R.state === 'stunned' && P.canAct !== false || evPrompt.grab) { key = 'grab'; html = pill(B.grab, 'GRAB'); }
    else if (fight && W.spots && W.spots.flying && W.spots.flying(P)) { key = 'incoming'; html = '<div class="wr-pill hot">INCOMING BUILDING!</div>' + note('MOVE OR BLOCK'); }
    else if (fight && W.spots && W.spots.carrying && W.spots.carrying(P)) { const c = W.spots.carrying(P), it = c.chunk ? (c.name ? `PIECE OF ${c.name.toUpperCase()}` : 'CHUNK') : (c.name ? c.name.toUpperCase() : 'BUILDING'); key = 'carry' + c.phase + (c.smash ? 's' : '') + it; html = c.phase !== 'carry' ? `<div class="wr-pill hot">${c.smash ? 'SMASH!' : 'HEAVE!'}</div>` : c.smash ? pill(B.strike, 'SMASH IT OVER THEIR HEAD', '', 'hot') + note(it) : pill(B.strike, `THROW ${c.chunk || c.name ? 'IT' : 'BUILDING'}`, '', 'hot') + note(c.chunk || c.name ? it : 'OR SMASH IT UP CLOSE'); }
    else if (fight && W.spots && W.spots.armed(P)) { const h = W.spots.armed(P).hits; key = 'armed' + h; html = pill(B.strike, 'SWING GIRDER', '', 'hot') + note(`${h} HIT${h > 1 ? 'S' : ''} LEFT`); }
    else if (fight && W.spots && P.canAct && W.spots.nearestWeapon(P, 12) && !(P.gapTo(R) <= 9 && P.facing(R, 1.0))) { key = 'girder'; html = pill(B.grab, 'RIP UP GIRDER', '', 'hot'); }
    else if (fight && W.spots && W.spots.buildingNear && P.canAct && !(P.gapTo(R) <= 9 && P.facing(R, 1.0)) && W.spots.buildingCooldown(P) <= 0 && W.spots.buildingNear(P, tipId && tipT > 0 ? 12 : 40)) {
      // in reach: the verb; close by: point it out so the player knows the building can be thrown
      const bn = W.spots.buildingNear(P, 40);
      const what = bn.kind === 'semi' ? 'TOUR SEMI' : bn.kind === 'tower' ? 'LIGHTING TOWER' : bn.name ? bn.name.toUpperCase() : 'BUILDING';
      // a building too big to lift gives up a piece (props.js / carve.js: mode 'snap' | 'bite')
      const torn = bn.mode === 'snap' || bn.mode === 'bite';
      if (bn.dist <= 12) { key = 'bldg' + what + bn.mode; html = pill(B.grab, torn ? (bn.name ? `TEAR A PIECE OFF ${what}` : 'TEAR OFF A CHUNK') : bn.kind === 'building' ? (bn.name ? `RIP UP ${what}` : 'RIP UP BUILDING') : `PICK UP ${what}`, '', 'hot'); }
      else { key = 'bldgnear' + what + bn.mode; html = note(`${what} NEARBY`) + pill(B.grab, torn ? 'WALK UP AND TEAR A PIECE OFF' : 'WALK UP AND THROW IT'); }
    }
    else if (fight && stallT >= 5) {
      key = stallT >= 6 ? 'stall2' : 'stall1';
      html = `<div class="wr-pill hot">${stallT >= 6 ? 'STALLING!' : 'GET BACK IN THERE'}</div>` + note(stallT >= 6 ? `${R.name} IS GAINING MOMENTUM` : 'THE CROWD IS TURNING');
    } else if (tipId && tipT > 0 && fight) {
      key = 'tip' + tipId;
      if (tipId === 'strike') html = pill(B.strike, 'STRIKE') + pill(B.strike, 'HEAVY', 'HOLD');
      else if (tipId === 'block') html = pill(B.block, 'BLOCK', 'HOLD') + note('ON THE GOLD FLASH = REVERSAL');
      else if (tipId === 'grab') html = pill(B.grab, 'GRAB') + note('THEN PUSH A DIRECTION');
      else if (tipId === 'ground') html = pill(B.grab, 'PIN', 'HOLD') + pill(B.taunt, 'TAUNT');
      else if (tipId === 'taunt') html = pill(B.taunt, 'TAUNT') + note('BUILDS MOMENTUM WHILE THEY ARE DOWN');
      else if (tipId === 'finisher') html = pill(B.finisher, 'FINISHER', '', 'hot') + note('WHEN THEY ARE STUNNED, HELD OR DOWN');
    }
    key = key ? device + key : '';
    if (key !== promptKey) {
      promptKey = key;
      if (html) el.prompt.innerHTML = html;
      el.prompt.classList.toggle('off', !html);
      // The touch button the prompt is asking for pulses
      if (el.btnGrab) {
        el.btnGrab.classList.toggle('cue', /ground|grab/.test(key));
        el.btnBlock.classList.toggle('cue', key.endsWith('tipblock'));
        el.btnTaunt.classList.toggle('cue', /groundt|tiptaunt|tipground|fire$/.test(key));
      }
    }

    const skipOn = live && (phase === 'entrance' || evPrompt.skip);
    if (skipOn !== !el.skip.classList.contains('hidden') || (skipOn && el.skip._dev !== device)) {
      el.skip.classList.toggle('hidden', !skipOn);
      el.skip._dev = device;
      el.skip.firstElementChild.innerHTML = device === 'touch' ? '' : glyph(BINDINGS[device].skip);
    }
  }
  /** First-match teaching: raise a tip at the moment the action becomes useful. */
  function tutorial() {
    const P = W.player, R = W.rival;
    if (phase !== 'fight' || typeof P.gapTo !== 'function') { stallT = 0; return; }
    // Keeping away: the same test match.js runs (stallDist 48 u, penalties from 6 s); warn a second early
    const apart = R.state === 'neutral' && (P.state === 'neutral' || P.state === 'blocking') && P.distTo(R) > 48;
    stallT = apart ? stallT + 0.1 : 0;
    if (!tutOn) return;
    const gap = P.gapTo(R), up = R.state !== 'downed' && R.state !== 'ko';
    if (needs('strike')) { if (gap < 30 && up) tip('strike', 1); }
    else if (needs('block') && hitsTaken >= 2) tip('block', 1);
    else if (needs('grab') && gap < 10 && up && P.state === 'neutral') tip('grab', 1);
    else if (needs('taunt') && R.state === 'downed' && gap > 14) tip('taunt', 1);
  }

  // ---- ticker -----------------------------------------------------------------
  function say(text, tone = 'neutral', force = false) {
    if (!live || !text || (!force && tickGap > 0)) return;
    el.tickerLine.textContent = text;
    el.ticker.className = 'on' + (tone !== 'neutral' ? ' ' + tone : '');
    tickT = 4.2; tickGap = 2.2;
  }

  // ---- name cards, fall band, cinematic bars ----------------------------------
  function showCard(id) {
    const f = W[id], c = el.cards[id];
    if (!f || !live) return;
    cardWait[id] = -1;
    const defense = W.match.state.defense > 0;
    c.querySelector('.role').textContent = ((id === 'player') === defense ? 'THE CHAMPION' : 'THE CHALLENGER');
    c.querySelector('.nm').textContent = f.name;
    c.querySelector('.ep').textContent = EPITHET[f.key] || '';
    c.querySelector('.st').textContent = HOME[id];
    c.querySelector('.pic i').style.backgroundImage = `url(assets/${f.key}.webp)`;
    const d = id === 'player' ? -1 : 1, ms = 3400;
    cardT[id === 'player' ? 0 : 1] = ms / 1000;
    play(c, reduced ? [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }] : [
      { opacity: 0, transform: `translateX(${d * 120}px)` }, { opacity: 1, transform: `translateX(${d * -8}px)`, offset: 0.09 },
      { opacity: 1, transform: 'translateX(0)', offset: 0.14 }, { opacity: 1, transform: `translateX(${d * -10}px)`, offset: 0.9 }, { opacity: 0, transform: `translateX(${d * 60}px)` },
    ], ms);
  }
  function hideCards() { for (const id of ['player', 'rival']) { stopAnim(el.cards[id]); cardWait[id] = -1; } }
  function fallBand(e) {
    const ms = W.match.state;
    el.inter.children[0].textContent = `FALL ${e.fall} · ${e.by === 'ko' ? 'KNOCKOUT' : 'PINFALL'}`;
    el.inter.children[1].textContent = nameOf(e.winner);
    el.inter.children[2].innerHTML = `<span>${nameOf('player')}</span><b>${ms.playerFalls} - ${ms.rivalFalls}</b><span>${nameOf('rival')}</span>`;
    interT = 2.6;
    play(el.inter, reduced ? [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }] : [
      { opacity: 0, transform: 'scaleY(0.2)' }, { opacity: 1, transform: 'scaleY(1)', offset: 0.07 }, { opacity: 1, transform: 'scaleY(1)', offset: 0.9 }, { opacity: 0, transform: 'scaleY(0.4)' },
    ], 2600);
    if (el.corner) {
      // Corner advice: the score, and one line of the scouting report on this rival
      const tells = PERSONAS[W.rival.key] && PERSONAS[W.rival.key].tells ? PERSONAS[W.rival.key].tells.split(';') : [];
      const t = tells.length ? tells[(e.fall - 1) % tells.length].trim() : '';
      el.corner.innerHTML = `${nameOf('player')} ${ms.playerFalls} - ${ms.rivalFalls} ${nameOf('rival')} · FALL ${e.fall + 1} NEXT`
        + (t ? `<small>SCOUTING ${nameOf('rival')}: ${t}</small>` : '');
    }
  }
  function syncCine() {
    const bars = live && (phase === 'entrance' || phase === 'finisher' || !!BAR_SHOTS[shot]);
    el.root.classList.toggle('lbox', bars);
    el.root.classList.toggle('cine', bars);
    doc.body.classList.toggle('wr-cine', bars);
  }

  // ---- device-dependent static panels -----------------------------------------
  function writeDevice() {
    const d = W.input.ui.device;
    if (d === device) return;
    device = d;
    promptKey = wheelKey = '\u0000'; // force a redraw with the new glyphs
    const P = W.player;
    panels(d, (P && FINISHERS[P.key] && FINISHERS[P.key].name) || 'FINISHER');
    if (mashKind) { const k = mashKind; mashKind = ''; setMash(k); }
  }
  /** The pause sheet's move list and the help card for device d. */
  function panels(d, fin) {
    const B = BINDINGS[d];
    const mv = (label, html) => `<div class="mv">${label}<span>${html}</span></div>`;
    const or = (a, b) => glyph(a) + (b ? `<em>OR</em>${glyph(b)}` : '');
    const dirs = d === 'kbm' ? null : '<em>PUSH</em>';
    const sg = W.player ? SIGNATURES[W.player.key] : null;
    if (el.moves) {
      el.moves.innerHTML = `<h4>STRIKES</h4>${mv('STRIKE (3-HIT STRING)', glyph(B.strike))}${mv('HEAVY', `<em>HOLD</em>${or(B.strike, B.heavyAlt)}`)}`
        + mv('CLOTHESLINE', `${glyph(B.sprint)}<em>+</em>${glyph(B.strike)}`)
        + `<h4>DEFENSE</h4>${mv('BLOCK', `<em>HOLD</em>${or(B.block, B.blockAlt)}`)}${mv('REVERSAL', '<em>BLOCK ON THE GOLD FLASH</em>')}${mv('REVERSE A GRAB', `<em>ON THE FLASH</em>${glyph(B.grab)}`)}${mv('ESCAPE A HOLD · KICK OUT', `<em>MASH</em>${glyph(B.mash)}`)}`
        + `<h4>GRAPPLE</h4>${mv('GRAB', glyph(B.grab))}${mv('IRISH WHIP', `<em>THEN</em>${dirs ? dirs + '<em>TOWARD</em>' : '<em>TOWARD</em>'}`)}${mv('SUPLEX', '<em>THEN AWAY</em>')}${mv('GIANT SWING', '<em>THEN SIDEWAYS</em>')}${mv('GORILLA PRESS', `<em>THEN</em>${glyph(B.grab)}<em>OR WAIT</em>`)}`
        + mv(sg ? `${sg[0].name} · ${sg[1].name}` : 'SIGNATURE MOVES', `<em>THEN HOLD</em>${glyph(B.sprint)}<em>+ TOWARD · AWAY</em>`)
        + `<h4>ON A DOWNED RIVAL</h4>${mv('PIN', `<em>HOLD</em>${glyph(B.grab)}`)}${mv('PICK UP', `<em>TAP</em>${glyph(B.grab)}`)}${mv('STOMP · SPLASH', `${glyph(B.strike)}<em>· HOLD</em>${glyph(B.strike)}`)}`
        + `<h4>SHOWMANSHIP</h4>${mv('TAUNT (BUILDS MOMENTUM)', glyph(B.taunt))}${mv('FIRE UP (HURT AND BEHIND)', `<em>WHEN PROMPTED</em>${glyph(B.taunt)}`)}${mv(fin, `<em>FULL MOMENTUM</em>${glyph(B.finisher)}`)}${mv('LOCK-ON / FREE CAMERA', glyph(B.lock))}`
        + `<h4>FIGHTING INTO CHICAGO</h4>${mv('THROW A BUILDING', `<em>NEXT TO ONE</em>${glyph(B.grab)}<em>· THROW</em>${glyph(B.strike)}`)}${mv('TEAR A PIECE OFF A TOWER', `<em>NEXT TO A BIG ONE</em>${glyph(B.grab)}`)}${mv('SMASH IT OVER THEIR HEAD', `<em>CARRYING, UP CLOSE</em>${glyph(B.strike)}`)}${mv('FOREIGN OBJECT (GIRDER)', `<em>NEXT TO ONE</em>${glyph(B.grab)}<em>· SWING</em>${glyph(B.strike)}<em>· 3 HITS</em>`)}${mv('LANDMARKS', '<em>THROW THEM INTO THE FOUNTAIN, THE LAKE, THE L</em>')}${mv('NO RULES', '<em>NO COUNT-OUTS, NO DQ: FALLS COUNT ANYWHERE</em>')}`
        + (d === 'touch' ? '' : `<h4>POWERS</h4>${mv('BEAM · ROAR · CHARGE · STOMP', glyph(B.beam) + glyph(B.roar) + glyph(B.charge) + glyph(B.stomp))}`);
    }
    if (el.help && d !== 'touch') {
      el.help.innerHTML = `${glyph(B.move)} Move · ${glyph(B.sprint)} Sprint<br>${glyph(B.strike)} Strike · hold: Heavy<br>${glyph(B.block)} Block · timed: Reversal<br>`
        + `${glyph(B.grab)} Grab, then a direction<br>${glyph(B.grab)} hold: Pin a downed rival<br>${glyph(B.taunt)} Taunt · ${glyph(B.finisher)} ${title(fin)}<br>`
        + `${glyph(B.beam)}${glyph(B.roar)}${glyph(B.charge)}${glyph(B.stomp)} Powers<br>${glyph(B.lock)} Lock-on · ${glyph(B.pause)} Pause + moves`;
    }
  }

  // ---- lifecycle ----------------------------------------------------------------
  /** A match (or a title defense) begins: fresh fighters, every layer up. */
  function begin() {
    side.player = el.p1; side.rival = el.p2;
    live = true;
    phase = W.match.state.phase; shot = '';
    setupSide('player'); setupSide('rival');
    lastClock = -1; lastFallTxt = ''; slowT = 1;
    pinT = -1; mashKind = ''; mashQ = -1; promptKey = '\u0000'; wheelKey = '\u0000'; wheelSel = ''; wheelSelT = 0;
    for (const k in evPrompt) evPrompt[k] = false;
    tipId = ''; tipT = 0; tickT = 0; tickGap = 0; interT = -1; hitsTaken = 0; stallT = 0;
    for (const c of el.calls) { stopAnim(c); c._on = 0; c._pos = ''; }
    stopAnim(el.pin); stopAnim(el.inter); hideCards();
    el.count.classList.remove('on'); el.mash.classList.remove('on'); el.wheel.classList.remove('on'); el.ticker.className = '';
    el.prompt.classList.add('off'); el.prompt.innerHTML = '';
    if (el.mashZone) el.mashZone.classList.remove('on');
    el.go.classList.remove('wr', 'wr-win', 'wr-loss');
    doc.body.classList.add('wr-mode');
    el.root.classList.remove('hidden');
    el.touch.classList.remove('hidden');
    device = ''; writeDevice();
    writePips(); writeClock(); writeSide('player'); writeSide('rival');
    loadTut();
    if (W.match.state.defense > 0) tutOn = false;
    syncCine();
  }
  function hideLayers() {
    live = false;
    el.root.classList.add('hidden'); el.touch.classList.add('hidden'); el.skip.classList.add('hidden');
    el.root.classList.remove('lbox', 'cine', 'pinning');
    doc.body.classList.remove('wr-cine');
    if (el.mashZone) el.mashZone.classList.remove('on');
  }
  function tick(dtReal) {
    if (!el) return;
    const ui = W.input.ui;
    if (ui.defend) ui.defend = false; // match.js polled it earlier this frame
    if (!live) return;
    // The fight cam's cinematic shot ('' = fight / free cam) decides the letterbox
    const sh = (W.cam && W.cam.shot) || '';
    if (sh !== shot) { shot = sh; syncCine(); }
    if (mashKind) writeMash(dtReal);
    for (const c of el.calls) if (c._on > 0) c._on -= dtReal;
    if (pinT > 0) { pinT -= dtReal; if (pinT <= 0) pinEnd(false); }
    if (tickT > 0) { tickT -= dtReal; if (tickT <= 0) el.ticker.className = ''; }
    if (tickGap > 0) tickGap -= dtReal;
    if (tipT > 0) { tipT -= dtReal; if (tipT <= 0) tipId = ''; }
    if (wheelSelT > 0) { wheelSelT -= dtReal; if (wheelSelT <= 0) wheelSel = ''; }
    for (const id of ['player', 'rival']) if (cardWait[id] > 0) { cardWait[id] -= dtReal; if (cardWait[id] <= 0) showCard(id); }
    slowT += dtReal;
    if (slowT < 0.1) return;
    slowT = 0;
    writeDevice();
    writeSide('player'); writeSide('rival');
    writeClock();
    tutorial();
    writePrompts();
  }

  function subscribe() {
    const bus = W.bus, on = (n, f) => offs.push(bus.on(n, f));
    on(EV.MATCH_START, begin);
    on(EV.MATCH_PHASE, (e) => {
      phase = e.phase;
      if (e.phase !== 'entrance') hideCards();
      syncCine();
    });
    on(EV.ENTRANCE_START, (e) => { cardWait[e.who] = 1.2; }); // unless its 'namecard' beat comes first
    on(EV.ENTRANCE_BEAT, (e) => { if (e.beat === 'namecard') showCard(e.who); });
    on(EV.ENTRANCE_SKIP, hideCards);
    on(EV.BELL, (e) => {
      if (e.kind === 'start') callout('FIGHT!', '', 'result', '', W.match.state.bestOf > 1 ? `FALL ${W.match.state.fall}` : 'CHICAGO HEAVYWEIGHT TITLE', 1.3);
    });
    on(EV.FALL_START, () => { writePips(); for (const id of ['player', 'rival']) { side[id].hp = -1; writeSide(id); } });
    on(EV.FALL_END, (e) => {
      writePips();
      pinEnd(false); setMash('');
      const ms = W.match.state, need = Math.ceil(ms.bestOf / 2);
      if (ms.playerFalls < need && ms.rivalFalls < need) fallBand(e);
    });
    on(EV.DAMAGE, (e) => { onDamage(e); if (e.who === 'player' && e.by === 'rival' && !e.blocked) hitsTaken++; });
    on(EV.MOMENTUM_FULL, (e) => { if (e.who === 'player') tip('finisher', 4.5); });
    // The moves the tutorial is waiting to see the player do
    on(EV.STRIKE_LANDED, (e) => { if (e.who === 'player') learned('strike'); });
    on(EV.STRIKE_BLOCKED, (e) => { if (e.target === 'player') learned('block'); });
    on(EV.BLOCK_START, (e) => { if (e.who === 'player') learned('block'); });
    on(EV.GRAB_START, (e) => { if (e.who === 'player') learned('grab'); });
    on(EV.TAUNT_START, (e) => { if (e.who === 'player') learned('taunt'); });
    on(EV.FINISHER_START, (e) => { if (e.who === 'player') learned('finisher'); });
    on(EV.GRAB_MOVE, (e) => { if (e.who === 'player') { wheelSel = e.type === 'signature' ? (e.sig === 1 ? 'whip' : 'suplex') : e.type; wheelSelT = 0.5; wheelKey = '\u0000'; slowT = 1; } });
    on(EV.PIN_START, (e) => {
      if (e.who === 'player') learned('ground');
      el.pinB.textContent = ''; el.pin.className = '';
      for (let i = 0; i < 3; i++) el.count.children[i].classList.remove('on');
      el.count.classList.add('on');
      el.root.classList.add('pinning');
      pinT = 4;
      slowT = 1;
    });
    on(EV.PIN_COUNT, (e) => pinCount(e.count));
    on(EV.PIN_KICKOUT, (e) => {
      pinEnd(true); setMash('');
      if (!e.near) callout(e.count > 0 ? `KICKOUT AT ${e.count}!` : 'KICKOUT!', '', 'defend', e.who); // the director calls the near falls
    });
    on(EV.PIN_BROKEN, () => { pinEnd(false); setMash(''); });
    // (drama) the reversal window: the touch button that takes it throbs with the gold flash in the world
    on(EV.REVERSAL_CUE, (e) => {
      const b = e.who === 'player' && device === 'touch' && !reduced ? (e.kind === 'grab' ? el.btnGrab : el.btnBlock) : null;
      if (b) play(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.3 }, { transform: 'scale(1)' }], Math.max(250, (e.opens + e.dur) * 1000), 'none');
    });
    on(EV.KO, () => { pinEnd(false); setMash(''); callout('K.O.!', '', 'result', ''); });
    // The match director's words
    on(EV.CALLOUT, (e) => callout(e.text, e.sub, e.tier, e.who));
    on(EV.COMMENTARY, (e) => say(e.text, e.tone, e.tone !== 'neutral'));
    on(EV.PROMPT, (e) => { if (e.id in evPrompt) { evPrompt[e.id] = !!e.show; slowT = 1; } });
    on(EV.LOCKON, (e) => {
      if (el.btnLock) el.btnLock.classList.toggle('on', !!e.on);
      if (lockSeen && live) ctx.ui.toastMini(e.on ? 'LOCK-ON' : 'FREE CAMERA', '');
      lockSeen = true;
    });
  }
  const onDefend = (e) => { if (e) e.preventDefault(); W.input.ui.defend = true; };
  /** Resolve the DOM once per page. False without the match markup (or without a DOM). */
  function ensure() {
    if (el) return true;
    if (!doc) return false;
    el = resolve();
    if (!el) return false;
    if (el.defend) { el.defend.addEventListener('click', onDefend); el.defend.addEventListener('touchstart', onDefend, { passive: false }); }
    for (const k of ['godzilla', 'ghidorah', 'mecha']) { const im = new Image(); im.src = `assets/${k}.webp`; } // decoded before the first card
    return true;
  }

  /**
   * START prewarm: put every match layer into every visual state it can take,
   * with real text and its one-shot animations looping, so Chrome compiles the
   * raster / compositor programs behind the loading screen instead of at the
   * first callout. Works before any match exists. The layers are forced
   * near-invisible by body.wr-warming (and by game.js's body.hud-prewarm).
   * Call restore() (the return value) a few frames later; start() also calls it.
   */
  let unwarm = null;
  function prewarm() {
    if (unwarm) return unwarm;
    if (!ensure() || live) return () => {};
    const body = doc.body, temps = [], anims = [];
    const loop = (node, frames, ms = 700) => { if (node && node.animate) anims.push(node.animate(frames, { duration: ms, iterations: Infinity, direction: 'alternate' })); };
    const FADE = [{ opacity: 0.9 }, { opacity: 0 }];
    const SLAM = [{ opacity: 0, transform: 'translateX(-70px) scale(2.3)' }, { opacity: 1, transform: 'translateX(0) scale(1)', offset: 0.4 },
      { opacity: 1, transform: 'translateX(0) scale(1.02)', offset: 0.6 }, { opacity: 0, transform: 'translateX(24px) translateY(-10px) scale(1.02)' }];
    body.classList.add('wr-warming');
    // top band: both sides, every state class, bars part-filled, hit flashes running
    [el.p1, el.p2].forEach((s, i) => {
      const key = i ? 'mecha' : 'godzilla', p = PORTRAIT[key];
      s.port.style.backgroundImage = `url(assets/${key}.webp)`; s.port.style.backgroundPosition = p.pos; s.port.style.backgroundSize = p.size;
      s.root.classList.add(i ? 'gassed' : 'crit', i ? 'out' : 'full');
      s.chip.textContent = i ? 'STUNNED' : 'DANGER'; s.chip.className = 'chip on' + (i ? ' open' : '');
      s.ghost.style.transition = 'none';
      s.fill.style.transform = 'scaleX(0.6)'; s.ghost.style.transform = 'scaleX(0.8)'; s.sta.style.transform = 'scaleX(0.5)'; s.mom.style.transform = 'scaleX(1)';
      loop(s.flash, FADE); loop(s.portFlash, FADE);
      loop(s.meters, [{ transform: 'translate(0,0)' }, { transform: 'translate(8px,3px)' }]);
    });
    for (const n of el.pips.player.children) n.classList.add('on');
    // callouts: one node per tier
    const tiers = [['move', 'p1'], ['landmark', ''], ['result', ''], ['finisher', ''], ['defend', 'p2']];
    el.calls.forEach((c, i) => {
      const t = tiers[i % tiers.length];
      c.className = `wr-call t-${t[0]}${t[1] ? ' ' + t[1] : ''}`;
      c.children[0].textContent = 'THROUGH THE'; c.children[1].textContent = 'WILLIS TOWER!'; c.children[2].textContent = 'GORRAK';
      loop(c, SLAM);
    });
    // pin count: the three colours side by side
    for (let n = 1; n <= 3; n++) {
      let node = el.pin;
      if (n < 3) { node = doc.createElement('div'); node.innerHTML = `<b>${COUNT_WORD[n]}</b>`; el.root.appendChild(node); temps.push(node); }
      else el.pinB.textContent = COUNT_WORD[3];
      node.className = (n < 3 ? 'wr-pin-warm ' : '') + 'c' + n;
      loop(node, [{ opacity: 0, transform: 'scale(2.6)' }, { opacity: 1, transform: 'scale(1)' }]);
    }
    el.count.classList.add('on');
    for (const n of el.count.children) n.classList.add('on');
    // mash meter, every glyph kind, prompt pills, move wheel
    const ALL = ['E', 'SPACE', 'M0', 'M2', 'M1', 'DU', 'DD', 'PA', 'PB', 'PX', 'PY', 'LS', 'R3', 'LT', 'START', 'T:GRAB', 'T:BLOCK', 'T:ULT', 'T:SMASH', 'T:TAUNT'];
    el.mash.classList.add('on');
    el.mashT.textContent = 'KICK OUT!'; el.mashG.innerHTML = `MASH ${glyph('M0')}<em>TAP ANYWHERE</em>`; el.mashFill.style.transform = 'scaleX(0.5)';
    el.prompt.classList.remove('off');
    el.prompt.innerHTML = pill('E', 'PIN', 'HOLD', 'hot') + pill('PB', 'PICK UP', 'TAP') + note('JUST BEFORE THE HIT = REVERSAL') + `<div class="wr-pill">${ALL.map(glyph).join('')}</div>`;
    el.wheel.classList.add('on');
    ['u', 'r', 'd', 'l'].forEach((sl, i) => { const n = el.wheel.querySelector('.' + sl); n.className = sl + (i ? '' : ' sel'); n.innerHTML = `${glyph('W')}<span class="ar">▲</span>WHIP`; });
    el.wheel.querySelector('.c').innerHTML = `${glyph('E')}SLAM`;
    el.ticker.className = 'on hype'; el.tickerLine.textContent = 'There is the bell! We are under way in Chicago!';
    // cards, fall band, letterbox, skip, touch cues
    for (const id of ['player', 'rival']) {
      const c = el.cards[id];
      c.querySelector('.pic i').style.backgroundImage = `url(assets/${id === 'player' ? 'godzilla' : 'mecha'}.webp)`;
      loop(c, [{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'translateX(0)' }]);
    }
    loop(el.inter, [{ opacity: 0, transform: 'scaleY(0.2)' }, { opacity: 1, transform: 'scaleY(1)' }]);
    el.root.classList.add('lbox');
    el.skip.firstElementChild.innerHTML = glyph('ENTER');
    if (el.btnGrab) { el.btnGrab.classList.add('cue'); el.btnTaunt.classList.add('cue'); el.btnLock.classList.add('on'); }
    // pause move list, corner advice, champion screen (belt, shine, title type)
    panels('kbm', 'ATOMIC DRIVER');
    if (el.corner) el.corner.innerHTML = 'GORRAK 1 - 0 MECHRA · FALL 2 NEXT<small>SCOUTING MECHRA: guards strings, so grab it</small>';
    el.go.classList.add('wr', 'wr-win', 'wr-warm');
    // Everything that fades or slides by a CSS transition in play: run it through its part-way states too.
    // Not the prompt pills: a layer under a running opacity animation is drawn into its own surface, and the
    // pills pop in plainly in play (measured: looping them here left a 2 s build at the first prompt of a match).
    const HALF = [{ opacity: 0.15 }, { opacity: 1 }];
    for (const n of [el.mash, el.wheel, el.count, el.p1.chip, el.p2.chip, el.btnGrab, el.btnBlock, el.btnTaunt, el.btnLock]) loop(n, HALF, 500);
    loop(el.ticker, [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'translateX(0)' }], 500);
    loop(el.top, [{ opacity: 0, transform: 'translateY(-130%)' }, { opacity: 1, transform: 'translateY(0)' }], 900);
    for (const lb of el.root.querySelectorAll('.wr-lb')) loop(lb, [{ transform: `translateY(${lb.classList.contains('t') ? -101 : 101}%)` }, { transform: 'translateY(0)' }], 900);
    for (const sd of [el.p1, el.p2]) {
      // (fill and stamina to full too: a full bar meets both rounded ends, the bell's first raster: 0.5-2.2 s build)
      loop(sd.fill, [{ transform: 'scaleX(0.25)' }, { transform: 'scaleX(1)' }], 900);
      // (to full: the first hit's ghost sliver runs into the bar's rounded end, a clip the 0.9 never drew: 0.4-4.4 s build at the first hit)
      loop(sd.ghost, [{ transform: 'scaleX(0.5)' }, { transform: 'scaleX(1)' }], 1300);
      loop(sd.sta, [{ transform: 'scaleX(0.1)' }, { transform: 'scaleX(1)' }], 900);
      loop(sd.mom, [{ transform: 'scaleX(0.2)' }, { transform: 'scaleX(1)' }], 900);
    }
    loop(el.mashFill, [{ transform: 'scaleX(0.1)' }, { transform: 'scaleX(1)' }], 600);
    // (perf) ...and each health / stamina bar standing full, a copy beside it: a bar at rest is rastered inside its
    // rounded, clipped track (the animated ones above are composited instead), the bell's first raster (0.5-2.2 s)
    for (const s of [el.p1, el.p2]) for (const bar of [s.fill, s.sta]) {
      const track = bar && bar.parentElement;
      if (!track || !track.parentElement) continue;
      const c = track.cloneNode(true);
      for (const n of c.children) { n.style.transform = 'scaleX(1)'; n.style.transition = 'none'; }
      track.parentElement.appendChild(c); temps.push(c);
    }
    unwarm = () => {
      unwarm = null;
      for (const a of anims) a.cancel();
      for (const n of temps) n.remove();
      body.classList.remove('wr-warming');
      for (const s of [el.p1, el.p2]) { s.root.classList.remove('crit', 'gassed', 'full', 'out'); s.chip.className = 'chip'; s.chipTxt = ''; s.hp = s.st = s.mo = -1; s.crit = s.gassed = s.full = s.out = false; }
      for (const n of el.pips.player.children) n.classList.remove('on');
      el.pin.className = ''; el.count.classList.remove('on');
      el.mash.classList.remove('on'); el.wheel.classList.remove('on'); el.ticker.className = '';
      el.prompt.classList.add('off'); el.prompt.innerHTML = '';
      el.root.classList.remove('lbox');
      if (el.btnGrab) { el.btnGrab.classList.remove('cue'); el.btnTaunt.classList.remove('cue'); }
      if (el.corner) el.corner.textContent = '';
      el.go.classList.remove('wr', 'wr-win', 'wr-warm');
      device = ''; promptKey = wheelKey = '\u0000';
    };
    return unwarm;
  }

  return {
    start() {
      if (!ensure()) return;
      if (unwarm) unwarm();
      for (const off of offs) off();
      offs = [];
      lockSeen = false;
      if (!prev) prev = { upTitle: el.upTitle ? el.upTitle.innerHTML : '', again: el.again ? el.again.textContent : '' };
      if (el.upTitle) el.upTitle.innerHTML = 'CORNER ADVICE <span class="jp-sub">作戦</span>';
      if (el.corner) el.corner.textContent = '';
      subscribe();
      begin(); // match.js starts after us: its match:start runs begin() again with the final state
    },
    prewarm,
    update(dt, dtReal) { tick(dtReal); },
    updateIdle(dtReal) { tick(dtReal); },
    /** The run ended (result screen up): game.js has hidden the classic HUD. */
    onGameOver(victory) {
      if (!el) return;
      hideLayers();
      const P = W.player, R = W.rival;
      el.go.classList.add('wr', victory ? 'wr-win' : 'wr-loss');
      if (victory && el.defend && P && R) {
        const next = Object.keys(ctx.MONSTERS).find((k) => k !== P.key && k !== R.key);
        const sm = el.defend.querySelector('small');
        if (sm) sm.textContent = next ? `NEXT CHALLENGER · ${ctx.MONSTERS[next].name.toUpperCase()}` : '';
      }
      if (el.again) el.again.textContent = victory ? 'RETIRE CHAMPION' : 'BACK TO THE LOCKER ROOM';
    },
    dispose() {
      if (!el) return;
      if (unwarm) unwarm();
      for (const off of offs) off();
      offs = [];
      hideLayers();
      for (const c of el.calls) stopAnim(c);
      stopAnim(el.pin); stopAnim(el.inter); hideCards();
      doc.body.classList.remove('wr-mode');
      el.go.classList.remove('wr', 'wr-win', 'wr-loss');
      if (prev) {
        if (el.upTitle) el.upTitle.innerHTML = prev.upTitle;
        if (el.again) el.again.textContent = prev.again;
        prev = null;
      }
      W.input.ui.defend = false;
    },
  };
}
