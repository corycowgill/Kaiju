import { OnlineClient } from './client.js';
import { FIGHTERS, CITIES } from './protocol.js';
export function createOnlineUI({ monsters, profile, onLoad, onLeave, i18n }) {
  const client = new OnlineClient(),
    dialog = document.createElement('dialog');
  dialog.id = 'online-lobby';
  dialog.className = 'on-dialog';
  dialog.innerHTML = `<form method="dialog" class="on-head"><div><small>ONLINE MULTIPLAYER</small><h2>FIGHT TOGETHER. COMPETE ONLINE.</h2></div><button aria-label="Close">×</button></form>
  <div class="on-scroll"><p>Private arena matches. Wrestling is best of three falls. VS is a one-fall brawl.</p><p class="on-muted">Online fights stay inside the arena. City destruction and carried buildings are available in solo and local play.</p>
  <form id="on-connect"><label>Multiplayer server<input id="on-server" type="url" placeholder="https://your-server.onrender.com" required autocomplete="url"></label>
  <div class="on-grid"><label>Fighter<select id="on-fighter" translate="no"></select></label><label>Mode<select id="on-mode"><option value="title">Wrestling</option><option value="vs">VS</option></select></label><label>City<select id="on-city"></select></label></div>
  <label>Room code<input id="on-code" maxlength="6" pattern="[A-Fa-f0-9]{6}" autocomplete="off" placeholder="ABC123" translate="no"></label><div class="on-actions"><button type="submit" value="create">CREATE ROOM</button><button type="submit" value="join">JOIN ROOM</button></div></form>
  <section id="on-room" hidden><h3><span>ROOM CODE</span> <b id="on-room-code" translate="no"></b></h3><p id="on-rules"></p><div id="on-seats"></div><div class="on-actions"><button id="on-invite">COPY INVITE LINK</button><button id="on-ready">READY</button><button id="on-leave">LEAVE ROOM</button></div></section>
  <p id="on-status" role="status" aria-live="polite"></p></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s),
    status = (text) => {
      $('#on-status').textContent = text;
    };
  for (const key of FIGHTERS) {
    const option = new Option(monsters[key].name, key);
    $('#on-fighter').add(option);
  }
  for (const key of CITIES)
    $('#on-city').add(
      new Option(
        {
          chicago: 'Chicago',
          tokyo: 'Tokyo',
          dc: 'Washington DC',
          nyc: 'New York City',
          seattle: 'Seattle',
          sf: 'San Francisco',
        }[key],
        key,
      ),
    );
  let address = '';
  try {
    address = localStorage.getItem('kaiju_online_server') || '';
  } catch {}
  const configured = document.querySelector('meta[name="kaiju-online-server"]')?.content;
  if (configured) address = configured;
  else if (['localhost', '127.0.0.1'].includes(location.hostname))
    address = `http://${location.hostname}:8787`;
  else if (location.hostname.endsWith('.onrender.com')) address = location.origin;
  const invite = new URLSearchParams(location.search);
  $('#on-server').value = invite.get('server') || address;
  $('#on-code').value = invite.get('room') || '';
  let joining = false,
    pendingAvailable = null,
    padPrev = {},
    padCool = 0;
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('keyup', (e) => e.stopPropagation());
  $('#on-connect').addEventListener('submit', (e) => {
    e.preventDefault();
    const kind = e.submitter?.value || 'create';
    if (kind === 'join' && !/^[A-Fa-f0-9]{6}$/.test($('#on-code').value)) {
      status('Enter a six-character room code.');
      return;
    }
    if (pendingAvailable) client.removeEventListener('available', pendingAvailable);
    joining = true;
    status('Connecting…');
    const payload = {
      type: kind,
      code: $('#on-code').value.toUpperCase(),
      fighter: $('#on-fighter').value,
      mode: $('#on-mode').value,
      city: $('#on-city').value,
      name: profile(),
    };
    const available = () => {
      client.send(payload);
      client.removeEventListener('available', available);
      pendingAvailable = null;
    };
    pendingAvailable = available;
    client.addEventListener('available', available, { once: true });
    try {
      client.connect($('#on-server').value);
      try {
        localStorage.setItem('kaiju_online_server', $('#on-server').value);
      } catch {}
    } catch (error) {
      client.removeEventListener('available', available);
      joining = false;
      status(error.message);
    }
  });
  client.addEventListener('room', ({ detail: r }) => {
    joining = false;
    $('#on-connect').hidden = true;
    $('#on-room').hidden = false;
    $('#on-room-code').textContent = r.code;
    $('#on-rules').textContent =
      i18n.t(r.mode === 'vs' ? 'VS' : 'Wrestling') + ' · ' + r.city.toUpperCase();
    $('#on-seats').replaceChildren(
      ...r.seats.map((s, i) => {
        const row = document.createElement('p');
        const name = document.createElement('b');
        name.translate = false;
        name.textContent = s
          ? `${s.name} · ${monsters[s.fighter].name}`
          : i18n.t('Waiting for opponent…');
        row.append(
          name,
          document.createTextNode(
            ' · ' + i18n.t(s?.ready ? 'Ready' : s ? 'Not ready' : 'Empty seat'),
          ),
        );
        return row;
      }),
    );
    $('#on-ready').hidden = r.phase !== 'lobby';
    $('#on-ready').textContent = r.seats[client.seat]?.ready ? 'NOT READY' : 'READY';
    status(
      r.phase === 'loading'
        ? 'Loading fighters…'
        : r.phase === 'lobby'
          ? 'Both players must be ready.'
          : r.phase === 'over'
            ? 'Match complete.'
            : 'Match in progress.',
    );
  });
  client.addEventListener('error', ({ detail }) => {
    joining = false;
    status(detail);
  });
  client.addEventListener('connection', ({ detail }) => {
    if (!detail)
      status(
        client.token
          ? 'Connection lost. Reconnecting…'
          : 'Could not connect to the multiplayer server.',
      );
  });
  let loadingPromise = null;
  client.addEventListener('load', async ({ detail: m }) => {
    if (!m.fresh) {
      try {
        await loadingPromise;
      } catch {
        return;
      }
      client.send({ type: 'loaded', matchId: client.matchId });
      return;
    }
    dialog.close();
    try {
      loadingPromise = onLoad(client, m.room);
      await loadingPromise;
      client.send({ type: 'loaded', matchId: client.matchId });
    } catch {
      status('Could not load the match. Leave and try again.');
      client.leave();
      $('#on-connect').hidden = false;
      $('#on-room').hidden = true;
      dialog.showModal();
      onLeave();
    }
  });
  $('#on-ready').onclick = () =>
    client.send({ type: 'ready', ready: !client.room?.seats[client.seat]?.ready });
  $('#on-leave').onclick = () => {
    client.leave();
    $('#on-connect').hidden = false;
    $('#on-room').hidden = true;
    status('');
    onLeave();
  };
  $('#on-invite').onclick = async () => {
    const u = new URL(location.href);
    u.searchParams.set('room', client.room.code);
    u.searchParams.set('server', $('#on-server').value);
    try {
      await navigator.clipboard.writeText(u.href);
      status('Invite link copied.');
    } catch {
      status(u.href);
    }
  };
  dialog.addEventListener('close', () => {
    if (client.room?.phase === 'lobby' || joining) {
      client.leave();
      $('#on-connect').hidden = false;
      $('#on-room').hidden = true;
      joining = false;
    }
  });
  return {
    client,
    update(dt) {
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected);
      if (!pad || !dialog.open) return;
      const hit = (i) => pad.buttons[i]?.pressed && !padPrev[i];
      padCool = Math.max(0, padCool - dt);
      const targets = [...dialog.querySelectorAll('button,input,select')].filter(
        (el) => el.getClientRects().length && !el.disabled,
      );
      const focused = document.activeElement,
        index = Math.max(0, targets.indexOf(focused));
      if (hit(1)) dialog.close();
      else if (padCool === 0) {
        const vertical =
          pad.buttons[13]?.pressed || pad.axes[1] > 0.6
            ? 1
            : pad.buttons[12]?.pressed || pad.axes[1] < -0.6
              ? -1
              : 0;
        const horizontal =
          pad.buttons[15]?.pressed || pad.axes[0] > 0.6
            ? 1
            : pad.buttons[14]?.pressed || pad.axes[0] < -0.6
              ? -1
              : 0;
        if (horizontal && focused?.tagName === 'SELECT') {
          focused.selectedIndex = Math.max(
            0,
            Math.min(focused.options.length - 1, focused.selectedIndex + horizontal),
          );
          focused.dispatchEvent(new Event('change'));
          padCool = 0.2;
        } else if (vertical || horizontal) {
          targets[(index + (vertical || horizontal) + targets.length) % targets.length]?.focus();
          padCool = 0.2;
        }
      }
      if (hit(0) && focused?.tagName === 'BUTTON') focused.click();
      for (let i = 0; i < 17; i++) padPrev[i] = !!pad.buttons[i]?.pressed;
    },
    open(mode, city, fighter) {
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected);
      padPrev = {};
      for (let i = 0; i < 17; i++) padPrev[i] = !!pad?.buttons[i]?.pressed;
      padCool = 0.3;
      if (!client.room) {
        $('#on-mode').value = mode === 'vs' ? 'vs' : 'title';
        $('#on-city').value = city;
        $('#on-fighter').value = fighter || FIGHTERS[0];
        $('#on-connect').hidden = false;
        $('#on-room').hidden = true;
      }
      dialog.showModal();
    },
    get isOpen() {
      return dialog.open;
    },
  };
}
