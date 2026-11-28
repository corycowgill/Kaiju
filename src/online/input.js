import { createLocalMatch, LOCAL_KEYS } from '../localMultiplayer.js';
export function createOnlineInput(client, { touch = false, paused = () => false } = {}) {
  const pads = [...(navigator.getGamepads?.() || [])].filter((p) => p?.connected),
    pad = pads[0];
  const capture = createLocalMatch({
    scheme: pad ? 'pads' : 'keyboard',
    pads: pad ? [pad, pad] : [],
  });
  const pressed = {},
    touchKeys = {},
    overlay = document.createElement('div');
  overlay.id = 'online-touch';
  const buttons = [
    ['up', '↑'],
    ['left', '←'],
    ['down', '↓'],
    ['right', '→'],
    ['strike', 'Strike'],
    ['heavy', 'Heavy'],
    ['grab', 'Grab'],
    ['block', 'Block'],
    ['finisher', 'Finisher'],
    ['taunt', 'Taunt'],
    ['beam', 'Beam'],
    ['roar', 'Roar'],
    ['charge', 'Charge'],
    ['stomp', 'Stomp'],
    ['sprint', 'Sprint'],
  ];
  for (const [action, label] of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    const key = LOCAL_KEYS[0][action];
    button.onpointerdown = (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      touchKeys[key] = true;
      pressed[key] = true;
    };
    const release = (e) => {
      e.preventDefault();
      delete touchKeys[key];
    };
    button.onpointerup = release;
    button.onpointercancel = release;
    button.onlostpointercapture = release;
    overlay.append(button);
  }
  if (touch) document.body.append(overlay);
  return {
    enabled: true,
    online: true,
    versus: client.room.mode === 'vs',
    missing: [],
    seats: capture.seats,
    pausePressed: false,
    label: (i) => client.room.seats[i === 0 ? client.seat : 1 - client.seat]?.name || '',
    suppress() {
      capture.suppress();
      for (const k in touchKeys) delete touchKeys[k];
    },
    poll(keys, padsNow, now, keyHits) {
      capture.poll({ ...keys, ...touchKeys }, padsNow, now, { ...keyHits, ...pressed });
      for (const k in pressed) delete pressed[k];
      const raw = capture.seats[0].input;
      this.pausePressed = capture.pausePressed;
      if (paused() || document.hidden || capture.missing.length) client.input({});
      else client.input(raw);
    },
    dispose() {
      overlay.remove();
    },
  };
}
