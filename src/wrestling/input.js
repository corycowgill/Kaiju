// Raw input -> the player's intent. The only wrestling module that reads
// ctx.input; everything else reads W.player.intent or W.input.ui.
// OWNER: HUD + input engineer. The bindings are documented for people in
// notes/controls.md; BINDINGS below is the same table as data (the HUD draws
// its prompt glyphs, help card and pause move list from it).
//
// Input feel, all of it decided here so the combat core can treat an intent
// edge as "do it now if the fighter can, otherwise ignore it":
//  - Buffering: strike / heavy / grab / pin / taunt / finisher stay asserted
//    for TUNE.BUFFER seconds after the press, until the core's matching
//    *:start event (who = 'player') says the press was used.
//  - Tap vs hold on the strike button: `strike` goes out on the press (no
//    delay on the tap); still held after TUNE.HEAVY_HOLD -> `heavy`.
//  - Grab button by a downed rival: a short tap is `grab` on release (pick
//    up), a hold of TUNE.PIN_HOLD is `pin`. Anywhere else `grab` is instant.
//  - Lock-up direction: dirX / dirZ are snapped to one cardinal, relative to
//    the player's facing; a flick is remembered for TUNE.FLICK_HOLD, and the
//    stick-to-facing rotation is frozen (in quarter turns) when a lock-up
//    starts, so the HUD's move wheel and the stick agree while the camera
//    swings round the hold.
//  - Mash: presses from any button, debounced to one per TUNE.MASH_GAP, so
//    two fingers, two keys or a turbo pad all top out at the same rate; on
//    touch the whole screen is the mash button while the HUD asks for it.
//
// Raw input available (ctx.input, see notes/wrestling_api.md): held / pressed
// / released(code), moveX / moveZ, sprint, attack, pad.*, bindTouchButton.
// The classic bindings stay live unless ctx.player.control says otherwise:
// WASD / stick move, Shift / LB sprint, LMB / A melee, 1 2 3 Space Q powers.
import { EV } from './events.js';

/** Timing constants (seconds). */
export const TUNE = Object.freeze({
  BUFFER: 0.18,      // an early press still comes out this long after it was made (sim time)
  BUFFER_REAL: 0.45, // ...but never later than this in real time (slow-mo stretches sim time)
  HEAVY_HOLD: 0.22,  // strike button held this long = heavy
  PIN_HOLD: 0.25,    // grab button held this long by a downed rival = pin
  FLICK_HOLD: 0.15,  // a direction flick is remembered this long
  MASH_GAP: 1 / 12,  // minimum time between two counted mash presses
  SKIP_GUARD: 0.6,   // a skip press is ignored this soon after the phase began (the START click, a held A)
});

const KEY = { grab: 'KeyE', block: 'Mouse2', blockAlt: 'KeyC', heavy: 'KeyF', taunt: 'KeyR', finisher: 'KeyQ',
  lock: 'Tab', lockAlt: 'KeyT', lockMouse: 'Mouse1', skip: 'Enter', skipAlt: 'Space', mash: 'Space' };
// Codes the match's touch buttons report as (bound in start(), markup in index.html #wr-touch)
const TOUCH = { grab: 'TouchGrab', block: 'TouchBlock', taunt: 'TouchTaunt', lock: 'TouchLock', skip: 'TouchSkip', strike: 'TouchAttack', ult: 'Power_ult' };
const TOUCH_IDS = [['wr-btn-grab', TOUCH.grab], ['wr-btn-block', TOUCH.block], ['wr-btn-taunt', TOUCH.taunt], ['wr-btn-lock', TOUCH.lock], ['wr-skip', TOUCH.skip]];
// Standard-mapping pad buttons. REMAP needs game.js to release B from the
// classic roar (pad.reserve(1)) and to let us fire it (ctx.player.firePower):
// B = grab like every wrestling game, roar moves to d-pad down. Without those
// seams the fallback keeps the classic face buttons and puts grab on the d-pad.
const PAD_REMAP = { strike: 0, grab: 1, block: 6, taunt: 12, roar: 13, lock: 11, finisher: 7, skip: 0 };
const PAD_BASE = { strike: 0, grab: 13, block: 6, taunt: 12, roar: -1, lock: 11, finisher: 7, skip: 0 };

/**
 * What each action is bound to per device, as glyph tokens: 'M0' / 'M1' / 'M2'
 * mouse buttons, 'PA' 'PB' 'PX' 'PY' pad faces, 'LB' 'RB' 'LT' 'RT' 'L3' 'R3'
 * 'LS', 'DU' 'DD' 'DL' 'DR' d-pad, 'T:NAME' a touch button, anything else a
 * keycap. dir = the four lock-up directions in screen order [up, right, down, left].
 */
export const BINDINGS = {
  kbm: { move: 'WASD', sprint: 'SHIFT', strike: 'M0', heavy: 'M0', heavyAlt: 'F', block: 'M2', blockAlt: 'C', grab: 'E', pin: 'E',
    taunt: 'R', finisher: 'Q', lock: 'TAB', skip: 'ENTER', mash: 'M0', pause: 'ESC', beam: '1', roar: '2', charge: '3', stomp: 'SPACE', dir: ['W', 'D', 'S', 'A'] },
  pad: { move: 'LS', sprint: 'LB', strike: 'PA', heavy: 'PA', heavyAlt: '', block: 'LT', blockAlt: '', grab: 'PB', pin: 'PB',
    taunt: 'DU', finisher: 'RT', lock: 'R3', skip: 'PA', mash: 'PA', pause: 'START', beam: 'PX', roar: 'DD', charge: 'PY', stomp: 'RB', dir: ['LS', 'LS', 'LS', 'LS'] },
  touch: { move: 'T:STICK', sprint: 'T:RUN', strike: 'T:SMASH', heavy: 'T:SMASH', heavyAlt: '', block: 'T:BLOCK', blockAlt: '', grab: 'T:GRAB', pin: 'T:GRAB',
    taunt: 'T:TAUNT', finisher: 'T:ULT', lock: 'T:LOCK', skip: 'T:SKIP', mash: 'T:ANYWHERE', pause: 'T:II', beam: '', roar: '', charge: '', stomp: '', dir: ['T:STICK', 'T:STICK', 'T:STICK', 'T:STICK'] },
};

/** The lock-up moves in screen order [up, right, down, left] for a stick-to-facing rotation of q quarter turns (W.input.ui.wheelRot). */
export function wheelLayout(q) {
  // Screen-up input is (fwd, right) = (cos d, sin d); screen-right is (-sin d, cos d); d = q * 90 deg
  const q4 = ((q % 4) + 4) % 4;
  return WHEEL[q4];
}
const WHEEL = [
  ['whip', 'swing', 'suplex', 'swing'],   // facing up the screen
  ['swing', 'suplex', 'swing', 'whip'],   // facing left
  ['suplex', 'swing', 'whip', 'swing'],   // facing down
  ['swing', 'whip', 'swing', 'suplex'],   // facing right
];

const KBM_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Mouse0', 'Mouse2', 'KeyE', 'KeyF', 'KeyR', 'KeyQ', 'KeyC', 'Space', 'ShiftLeft', 'Tab', 'KeyT', 'Enter', 'Digit1', 'Digit2', 'Digit3'];
const TOUCH_CODES = [TOUCH.strike, TOUCH.grab, TOUCH.block, TOUCH.taunt, TOUCH.lock, TOUCH.skip, TOUCH.ult];
const BUFFERED = ['strike', 'heavy', 'grab', 'pin', 'taunt', 'finisher'];
const SKIPPABLE = { entrance: true, between: true, over: true };
const HALF_PI = Math.PI / 2;
const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

/** @returns {{ start, update, dispose, ui }} */
export function createInput(ctx, W) {
  const inp = ctx.input;
  /** Non-combat input state other modules may poll. lockToggle / skip are one-frame edges. */
  const ui = {
    lockToggle: false, skip: false,
    device: 'kbm',     // 'kbm' | 'pad' | 'touch': the device used last (prompt glyphs follow it)
    wheelRot: 0,       // quarter turns between the stick and the player's facing (see wheelLayout)
    inLockup: false,   // the player holds the rival: dirX / dirZ are being read as the move choice
    mashRate: 0,       // counted mash presses per second, smoothed (HUD feedback)
    padRemap: false,   // B = grab / d-pad down = roar is in force
    bindings: BINDINGS,
  };
  const buf = { strike: 0, heavy: 0, grab: 0, pin: 0, taunt: 0, finisher: 0 };   // sim seconds left
  const bufT = { strike: 0, heavy: 0, grab: 0, pin: 0, taunt: 0, finisher: 0 };  // real time of the press
  let PAD = PAD_BASE;
  let offs = [];
  let strikeT0 = 0, heavyArmed = false;
  let grabT0 = 0, grabGround = false, pinArmed = false, grabTap = false, padGrabWas = false;
  let flickX = 0, flickZ = 0, flickT = -1;
  let lastMash = -1, touchTaps = 0;
  let phaseT = 0;
  let touchBound = false, mashZone = null;

  function press(name, now) { buf[name] = TUNE.BUFFER; bufT[name] = now; }
  const onMashTouch = (e) => {
    if (e.cancelable) e.preventDefault();
    touchTaps += e.changedTouches ? e.changedTouches.length : 1;
  };
  function bindTouch() {
    if (touchBound) return;
    const doc = typeof document !== 'undefined' && document.getElementById ? document : null;
    if (!doc || !inp.bindTouchButton) return;
    touchBound = true; // bindTouchButton has no undo: once per page
    for (const [id, code] of TOUCH_IDS) { const el = doc.getElementById(id); if (el) inp.bindTouchButton(el, code); }
    mashZone = doc.getElementById('wr-mash-zone');
    if (mashZone) {
      inp.registerTouchControl(mashZone);
      mashZone.addEventListener('touchstart', onMashTouch, { passive: false });
      mashZone.addEventListener('mousedown', onMashTouch);
    }
  }
  function detectDevice() {
    const pad = inp.pad;
    for (let i = 0; i < TOUCH_CODES.length; i++) if (inp.pressed(TOUCH_CODES[i])) { ui.device = 'touch'; return; }
    if (touchTaps > 0) { ui.device = 'touch'; return; }
    for (let i = 0; i < KBM_CODES.length; i++) if (inp.pressed(KBM_CODES[i])) { ui.device = 'kbm'; return; }
    if (!pad.connected) { if (ui.device === 'pad') ui.device = ctx.quality && ctx.quality.touchUI ? 'touch' : 'kbm'; return; }
    for (let i = 0; i < 16; i++) if (pad.pressed(i)) { ui.device = 'pad'; return; }
    if (Math.abs(pad.axis(0)) > 0.5 || Math.abs(pad.axis(1)) > 0.5 || pad.lt > 0.4) ui.device = 'pad';
  }

  return {
    ui,
    start() {
      ui.lockToggle = false; ui.skip = false; ui.inLockup = false; ui.wheelRot = 0; ui.mashRate = 0;
      ui.device = ctx.quality && ctx.quality.touchUI ? 'touch' : inp.pad.connected ? 'pad' : 'kbm';
      for (const k of BUFFERED) { buf[k] = 0; bufT[k] = 0; }
      heavyArmed = false; pinArmed = false; grabTap = false; grabGround = false; padGrabWas = false;
      flickT = -1; lastMash = -1; touchTaps = 0; phaseT = nowSec();
      // Pad: LT becomes block (LB still sprints); B becomes grab when game.js lets roar move
      ui.padRemap = typeof ctx.player.firePower === 'function';
      PAD = ui.padRemap ? PAD_REMAP : PAD_BASE;
      BINDINGS.pad.grab = BINDINGS.pad.pin = ui.padRemap ? 'PB' : 'DD';
      BINDINGS.pad.roar = ui.padRemap ? 'DD' : 'PB';
      inp.pad.reserve(PAD.block, true);
      if (ui.padRemap) inp.pad.reserve(PAD.grab, true);
      bindTouch();
      // The core used the press: drop it from the buffer
      const bus = W.bus;
      offs = [
        bus.on(EV.STRIKE_START, (e) => { if (e.who !== 'player') return; if (e.kind === 'light') buf.strike = 0; else { buf.heavy = 0; buf.strike = 0; } }),
        bus.on(EV.GRAB_ATTEMPT, (e) => { if (e.who === 'player') buf.grab = 0; }),
        bus.on(EV.GRAB_START, (e) => { if (e.who === 'player') buf.grab = 0; }),
        bus.on(EV.PICKUP, (e) => { if (e.who === 'player') buf.grab = 0; }),
        bus.on(EV.PIN_START, (e) => { if (e.who === 'player') { buf.pin = 0; buf.grab = 0; } }),
        bus.on(EV.TAUNT_START, (e) => { if (e.who === 'player') buf.taunt = 0; }),
        bus.on(EV.FINISHER_START, (e) => { if (e.who === 'player') buf.finisher = 0; }),
        bus.on(EV.MATCH_PHASE, () => { phaseT = nowSec(); }),
      ];
    },
    /** Fill W.player.intent for this frame. dt: simulation seconds (0 during hit-stop). */
    update(dt) {
      const P = W.player, foe = W.rival, it = P.intent, pad = inp.pad, c = ctx.player.control;
      const now = nowSec();
      detectDevice();

      // Movement in world space, on the same basis updatePlayer uses
      const mYaw = c.moveYaw !== null ? c.moveYaw : ctx.player.yaw;
      const sy = Math.sin(mYaw), cy = Math.cos(mYaw);
      const ix = inp.moveX, iz = inp.moveZ;
      it.moveX = sy * iz - cy * ix;
      it.moveZ = cy * iz + sy * ix;
      it.sprint = inp.sprint;

      // Lock-up direction, relative to the player's own facing. In a lock-up
      // the stick-to-facing rotation is frozen in quarter turns (the wheel
      // the HUD shows); outside one it follows the camera continuously.
      const grappling = P.state === 'grappling';
      if (grappling && !ui.inLockup) ui.wheelRot = ((Math.round((ctx.player.yaw - mYaw) / HALF_PI) % 4) + 4) % 4;
      ui.inLockup = grappling;
      const d = grappling ? ui.wheelRot * HALF_PI : ctx.player.yaw - mYaw;
      const cd = Math.cos(d), sd = Math.sin(d);
      const fwd = iz * cd - ix * sd, right = iz * sd + ix * cd;
      let dx = 0, dz = 0;
      if (Math.abs(fwd) >= Math.abs(right)) { if (Math.abs(fwd) > 0.5) dz = fwd > 0 ? 1 : -1; }
      else if (Math.abs(right) > 0.5) dx = right > 0 ? 1 : -1;
      if (dx !== 0 || dz !== 0) { flickX = dx; flickZ = dz; flickT = now; }
      else if (flickT >= 0 && now - flickT <= TUNE.FLICK_HOLD) { dx = flickX; dz = flickZ; }
      it.dirX = dx; it.dirZ = dz;

      // Strike: out on the press; a hold becomes a heavy
      const sPress = inp.pressed('Mouse0') || pad.pressed(PAD.strike) || inp.pressed(TOUCH.strike);
      if (sPress) { press('strike', now); strikeT0 = now; heavyArmed = true; }
      it.strikeHeld = inp.attack;
      if (!inp.attack) heavyArmed = false;
      else if (heavyArmed && now - strikeT0 >= TUNE.HEAVY_HOLD) { press('heavy', now); heavyArmed = false; }
      if (inp.pressed(KEY.heavy)) press('heavy', now);

      // Grab: instant on its feet; by a downed rival a tap picks it up (on release) and a hold pins
      const padGrab = pad.down(PAD.grab);
      const gPress = inp.pressed(KEY.grab) || pad.pressed(PAD.grab) || inp.pressed(TOUCH.grab);
      const gRel = inp.released(KEY.grab) || inp.released(TOUCH.grab) || (padGrabWas && !padGrab);
      const gHeld = inp.held(KEY.grab) || padGrab || inp.held(TOUCH.grab);
      const foeDown = foe.state === 'downed';
      padGrabWas = padGrab;
      if (gPress) {
        grabT0 = now; grabGround = foeDown; grabTap = foeDown; pinArmed = true;
        if (!foeDown) press('grab', now);
      }
      if (gHeld && pinArmed && foeDown) {
        if (!grabGround) { grabGround = true; grabT0 = now; } // it went down while the button was held
        else if (now - grabT0 >= TUNE.PIN_HOLD) { press('pin', now); pinArmed = false; grabTap = false; }
      }
      if (gRel) {
        if (grabTap && pinArmed) press('grab', now);
        grabTap = false; pinArmed = false; grabGround = false;
      }
      it.grabHeld = gHeld;

      it.block = inp.held(KEY.block) || inp.held(KEY.blockAlt) || pad.lt > 0.4 || inp.held(TOUCH.block);
      if (inp.pressed(KEY.taunt) || pad.pressed(PAD.taunt) || inp.pressed(TOUCH.taunt)) press('taunt', now);
      if (inp.pressed(KEY.finisher) || pad.pressed(PAD.finisher) || inp.pressed(TOUCH.ult)) press('finisher', now);
      // Roar lost its pad button to grab: fire it from the d-pad through game.js
      if (PAD.roar >= 0 && pad.pressed(PAD.roar)) ctx.player.firePower('roar');

      // Buffered edges: asserted until used (the bus listeners in start() zero them) or timed out
      const ds = dt > 0 ? dt : 0;
      for (let i = 0; i < BUFFERED.length; i++) {
        const k = BUFFERED[i];
        const on = buf[k] > 0 && now - bufT[k] <= TUNE.BUFFER_REAL;
        it[k] = on;
        buf[k] = on ? buf[k] - ds : 0;
      }

      // Mash: any button, one counted press per MASH_GAP
      let m = touchTaps;
      touchTaps = 0;
      if (sPress || gPress || inp.pressed(KEY.mash) || inp.pressed(TOUCH.block) || pad.pressed(2) || pad.pressed(3) || pad.pressed(PAD_REMAP.grab)) m++;
      if (m > 0 && now - lastMash >= TUNE.MASH_GAP) {
        it.mash = 1;
        const inst = lastMash < 0 ? 4 : Math.min(12, 1 / (now - lastMash));
        ui.mashRate += (inst - ui.mashRate) * 0.5;
        lastMash = now;
      } else {
        it.mash = 0;
        if (lastMash >= 0 && now - lastMash > 0.25) ui.mashRate = Math.min(ui.mashRate, 1 / (now - lastMash));
      }

      ui.lockToggle = inp.pressed(KEY.lock) || inp.pressed(KEY.lockAlt) || inp.pressed(KEY.lockMouse) || pad.pressed(PAD.lock) || inp.pressed(TOUCH.lock);
      ui.skip = !!SKIPPABLE[W.match.state.phase] && now - phaseT > TUNE.SKIP_GUARD
        && (inp.pressed(KEY.skip) || inp.pressed(KEY.skipAlt) || pad.pressed(PAD.skip) || inp.pressed(TOUCH.skip));
    },
    dispose() {
      for (const off of offs) off();
      offs = [];
      inp.pad.reserve(PAD.block, false);
      if (ui.padRemap) inp.pad.reserve(PAD.grab, false);
      ui.lockToggle = false; ui.skip = false; ui.inLockup = false;
    },
  };
}
