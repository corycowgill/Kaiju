// Local seats own their input and edge state. A missing assigned controller
// never falls back to the other player's device or to AI.
export const LOCAL_KEYS = Object.freeze([
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', strike: 'KeyV', heavy: 'KeyF', grab: 'KeyE', block: 'KeyC', taunt: 'KeyR', finisher: 'KeyQ', beam: 'Digit1', roar: 'Digit2', charge: 'Digit3', stomp: 'Space', sprint: 'ShiftLeft' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', strike: 'KeyJ', heavy: 'KeyK', grab: 'KeyL', block: 'KeyO', taunt: 'KeyU', finisher: 'KeyP', beam: 'Digit7', roar: 'Digit8', charge: 'Digit9', stomp: 'Digit0', sprint: 'ShiftRight' },
]);
const PAD = { strike: 0, grab: 1, beam: 2, charge: 3, sprint: 4, stomp: 5, block: 6, finisher: 7, taunt: 12, roar: 13, pause: 9 };
const actions = ['strike', 'heavy', 'grab', 'block', 'taunt', 'finisher', 'beam', 'roar', 'charge', 'stomp', 'sprint', 'pause'];
const deadzone = (v) => Math.abs(v || 0) <= .18 ? 0 : Math.sign(v) * (Math.abs(v) - .18) / .82;
export function createLocalMatch({ pads = [], scheme = 'auto', versus = false } = {}) {
  const connected = [...pads].filter((p) => p?.connected);
  if (scheme === 'pads' && connected.length < 2) throw Error('Connect two controllers and press a button on each before starting.');
  if (scheme === 'mixed' && !connected.length) throw Error('Connect a controller and press a button on it before starting.');
  const layout = scheme === 'auto' ? connected.length >= 2 ? 'pads' : connected.length ? 'mixed' : 'keyboard' : scheme;
  if (!['pads', 'mixed', 'keyboard'].includes(layout)) throw Error('Choose a supported local control layout.');
  const seats = [0, 1].map((i) => ({ padIndex: layout === 'pads' ? connected[i].index : layout === 'mixed' && i === 1 ? connected[0].index : null,
    padId: layout === 'pads' ? connected[i].id : layout === 'mixed' && i === 1 ? connected[0].id : '', prev: {}, input: {}, initialized: false, heldAt: null, heavySent: false, lastMash: -Infinity, gate: true }));
  let missing = [];
  return {
    enabled: true, versus, layout, seats,
    get missing() { return [...missing]; },
    get pausePressed() { return seats.some((s) => s.input.pause); },
    suppress() { for (const s of seats) { s.gate = true; s.heldAt = null; s.heavySent = false; } },
    poll(keys, padsNow, now, keyHits = {}) {
      missing = [];
      for (let i = 0; i < 2; i++) {
        const s = seats[i], map = LOCAL_KEYS[i], pad = s.padIndex === null ? null : [...padsNow].find((p) => p?.connected && p.index === s.padIndex && p.id === s.padId);
        if (s.padIndex !== null && !pad) { missing.push(i + 1); s.gate = true; }
        const held = {};
        for (const a of actions) held[a] = s.padIndex !== null ? !!pad?.buttons[PAD[a]]?.pressed || (a === 'block' && (pad?.buttons[6]?.value || 0) > .4) : !!keys[map[a]];
        const raw = s.input; raw.x = s.padIndex !== null ? deadzone(pad?.axes[0]) : +!!keys[map.right] - +!!keys[map.left]; raw.z = s.padIndex !== null ? -deadzone(pad?.axes[1]) : +!!keys[map.up] - +!!keys[map.down];
        const length = Math.hypot(raw.x, raw.z); if (length > 1) { raw.x /= length; raw.z /= length; }
        if (!actions.some((a) => a !== 'pause' && a !== 'sprint' && held[a])) s.gate = false;
        const edge = (a) => held[a] && !s.prev[a] || (s.padIndex === null && !!keyHits[map[a]]);
        for (const a of actions) raw[a] = !s.gate && s.initialized && edge(a);
        raw.pause = s.initialized && held.pause && !s.prev.pause;
        raw.strikeHeld = !s.gate && held.strike; raw.grabHeld = !s.gate && held.grab; raw.block = !s.gate && held.block; raw.sprint = held.sprint;
        if (raw.strike) { s.heldAt = now; s.heavySent = false; }
        if (!held.strike || s.gate) { s.heldAt = null; s.heavySent = false; }
        if (s.heldAt !== null && now - s.heldAt >= 220 && !s.heavySent) { raw.heavy = true; s.heavySent = true; }
        raw.mash = !s.gate && s.initialized && now - s.lastMash >= 1000 / 12 && actions.some((a) => !['pause', 'sprint'].includes(a) && edge(a)) ? 1 : 0;
        if (raw.mash) s.lastMash = now;
        raw.power = ['beam', 'roar', 'charge', 'stomp'].find((a) => raw[a]) || '';
        s.prev = held; s.initialized = true;
      }
    },
    fillFighters(W) {
      for (let i = 0; i < 2; i++) {
        const f = i === 0 ? W.player : W.rival, other = i === 0 ? W.rival : W.player, raw = seats[i].input, it = f.intent;
        const fighting = W.match.state.phase === 'fight';
        it.moveX = fighting ? -(raw.x || 0) : 0; it.moveZ = fighting ? raw.z || 0 : 0; it.sprint = !!raw.sprint;
        it.faceYaw = Math.atan2(other.pos.x - f.pos.x, other.pos.z - f.pos.z);
        for (const a of ['strike', 'strikeHeld', 'heavy', 'grab', 'grabHeld', 'block', 'taunt', 'finisher']) it[a] = !!raw[a];
        it.power = raw.power || (raw.finisher && !f.can('finisher') ? 'ult' : ''); it.mash = raw.mash || 0;
        const forward = (raw.z || 0) * Math.cos(f.yaw) - (raw.x || 0) * Math.sin(f.yaw);
        const right = (raw.z || 0) * Math.sin(f.yaw) + (raw.x || 0) * Math.cos(f.yaw);
        it.dirX = Math.abs(right) > Math.abs(forward) && Math.abs(right) > .3 ? Math.sign(right) : 0;
        it.dirZ = Math.abs(forward) >= Math.abs(right) && Math.abs(forward) > .3 ? Math.sign(forward) : 0;
      }
      W.input.ui.skip = seats.some((s) => s.input.strike || s.input.grab);
    },
    label(i) { const s = seats[i]; return `P${i + 1} · ${s.padIndex === null ? i === 0 ? 'WASD / V F E C' : 'ARROWS / J K L O' : 'CONTROLLER ' + (s.padIndex + 1)}`; },
  };
}
