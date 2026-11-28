// Read-only presentation of authoritative state. Never runs damage or match rules.
import { createFighter } from '../wrestling/fighter.js';
import { createAnims, ANIMS } from '../wrestling/anims.js';
import { createBus, EV } from '../wrestling/events.js';
import { createSfx } from '../wrestling/sfx.js';
import { createVfx } from '../wrestling/vfx.js';
import { createArena } from '../levels/chicago_arena.js';
export function createOnlinePresentation(ctx, client, { onResult, i18n }) {
  const bus = createBus(),
    W = {
      bus,
      EV,
      running: false,
      player: null,
      rival: null,
      match: { state: {} },
      grapple: { hold: {}, pin: {}, fin: {} },
      input: { ui: {} },
      hitStop: () => {},
      slowMo: () => {},
    };
  let queue = [],
    lastEvent = 0,
    lastTick = -1,
    reported = false;
  const hud = document.createElement('section');
  hud.id = 'online-match-hud';
  hud.innerHTML = `<div class="on-fighter" data-seat="0"><b></b><label>Health<meter min="0" max="1" value="1"></meter></label><label>Stamina<meter min="0" max="100" value="100"></meter></label><label>Momentum<meter min="0" max="100" value="0"></meter></label><span></span></div><div class="on-clock"><b></b><small></small><p role="status"></p></div><div class="on-fighter" data-seat="1"><b></b><label>Health<meter min="0" max="1" value="1"></meter></label><label>Stamina<meter min="0" max="100" value="100"></meter></label><label>Momentum<meter min="0" max="100" value="0"></meter></label><span></span></div>`;
  const rows = [...hud.querySelectorAll('.on-fighter')],
    clock = hud.querySelector('.on-clock');
  const mapId = (id) =>
    client.seat === 1 ? (id === 'player' ? 'rival' : id === 'rival' ? 'player' : id) : id;
  const receive = ({ detail: s }) => {
    queue.push({ state: s, at: performance.now() });
    if (queue.length > 8) queue.shift();
  };
  const fields = (data) => {
    const d = { ...data };
    for (const key of ['who', 'target', 'by', 'winner', 'loser', 'src'])
      if (typeof d[key] === 'string') d[key] = mapId(d[key]);
    return d;
  };
  const render = (dt) => {
    if (!queue.length) return;
    // Both bodies use the same clock; holds and throws must stay paired.
    const target = performance.now() - 75;
    while (queue.length > 2 && queue[1].at <= target) queue.shift();
    const a = queue[0],
      b = queue[1] || a,
      t = a === b ? 1 : Math.max(0, Math.min(1, (target - a.at) / Math.max(1, b.at - a.at)));
    const s = b.state,
      order = client.seat === 0 ? [0, 1] : [1, 0];
    const m = { ...s.match };
    if (client.seat === 1) {
      [m.playerFalls, m.rivalFalls] = [m.rivalFalls, m.playerFalls];
      m.winner = mapId(m.winner);
    }
    Object.assign(W.match.state, m);
    for (const key of ['hold', 'pin', 'fin']) {
      const value = fields(s[key]);
      Object.assign(W.grapple[key], value, { A: W[value.who] || null, V: W[value.target] || null });
    }
    for (let i = 0; i < 2; i++) {
      const f = i ? W.rival : W.player,
        index = order[i],
        v = s.fighters[index],
        from = a.state.fighters[index];
      f.pos.set(...v.pos.map((n, k) => from.pos[k] + (n - from.pos[k]) * t));
      f.root.rotation.set(
        ...v.rot.map(
          (n, k) =>
            from.rot[k] + Math.atan2(Math.sin(n - from.rot[k]), Math.cos(n - from.rot[k])) * t,
        ),
        'YXZ',
      );
      f.yaw = f.root.rotation.y;
      f.hp = v.hp;
      f.maxHp = v.maxHp;
      f.stamina = v.stamina;
      f.momentum = v.momentum;
      f.state = v.state;
      f.stateT = v.stateT;
      f.held = v.held;
      f.lie = v.lie;
      f.cd = { ...v.cd };
      if (v.anim !== f._netAnim || v.stateT < (f._netT || 0) - 0.05) {
        if (v.anim && ANIMS[v.anim]) W.anims.play(f, v.anim);
        else W.anims.stop(f);
        f._netAnim = v.anim;
      }
      f._netT = v.stateT;
      f.root.visible = true;
      f.glb.mixer.update(dt * (s.timeScale ?? 1));
      const row = rows[i];
      row.querySelector('b').textContent = f.name;
      const bars = row.querySelectorAll('meter');
      bars[0].value = v.hp / Math.max(1, v.maxHp);
      bars[1].value = v.stamina;
      bars[2].value = v.momentum;
      row.querySelector('span').textContent =
        i18n.t('Falls') + ': ' + (i ? m.rivalFalls : m.playerFalls);
    }
    W.anims.update(dt * (s.timeScale ?? 1), dt);
    W.vfx.update(dt * (s.timeScale ?? 1), dt);
    W.sfx.update(dt, dt);
    W.arena.update(dt, dt);
    const elapsed = Math.floor(m.time || 0);
    clock.querySelector('b').textContent =
      `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    clock.querySelector('small').textContent =
      i18n.t(client.room?.mode === 'vs' ? 'VS' : 'Wrestling') + ' · ' + client.ping + ' ms';
    const stale = performance.now() - client.receivedAt > 1500,
      waiting = !client.connected || stale;
    const own = client.seat === 0 ? 'player' : 'rival';
    clock.querySelector('p').textContent = s.result
      ? i18n.t('Match complete.')
      : waiting
        ? i18n.t('Connection lost. Reconnecting…')
        : s.pin.active
          ? (s.pin.target === own ? i18n.t('Mash to escape!') : i18n.t('Pin count')) +
            ' ' +
            s.pin.count
          : s.hold.active && s.hold.target === own
            ? i18n.t('Mash to escape!')
            : m.phase === 'between'
              ? i18n.t('Next fall…')
              : i18n.t('Arena match');
    if (s.tick !== lastTick) {
      lastTick = s.tick;
      for (const event of s.events) {
        if (event.id <= lastEvent) continue;
        lastEvent = event.id;
        const payload = bus.ev(event.name);
        Object.assign(payload, fields(event.data));
        bus.emit(event.name);
      }
    }
    if (s.result && !reported) {
      reported = true;
      onResult({
        won: s.result.winner === own,
        reason: s.result.reason,
        match: m,
        matchId: client.matchId,
      });
    }
  };
  return {
    W,
    start({ rival }) {
      const P = ctx.player;
      W.player = createFighter(ctx, W, { id: 'player', key: P.key, cfg: P.cfg, glb: P.glb });
      W.rival = createFighter(ctx, W, { id: 'rival', ...rival });
      W.player.opponent = W.rival;
      W.rival.opponent = W.player;
      ctx.scene.add(W.rival.root);
      ctx.setRivalBody(W.rival);
      W.anims = createAnims(ctx, W);
      W.vfx = createVfx(ctx, W);
      W.sfx = createSfx(ctx, W);
      W.arena = createArena(ctx, W);
      W.anims.start();
      W.vfx.start();
      W.sfx.start();
      W.arena.start();
      W.running = true;
      document.body.append(hud);
      client.addEventListener('snapshot', receive);
      if (client.snapshot) receive({ detail: client.snapshot });
    },
    update: render,
    updateIdle: render,
    onGameOver() {},
    onBuildingDestroyed() {},
    gameOverText() {
      return { keepPose: true };
    },
    dispose() {
      client.removeEventListener('snapshot', receive);
      W.running = false;
      for (const module of [W.anims, W.vfx, W.sfx, W.arena]) module?.dispose();
      ctx.setRivalBody(null);
      W.player?.dispose();
      W.rival?.dispose();
      W.rival?.root.removeFromParent();
      hud.remove();
      bus.clear();
    },
  };
}
