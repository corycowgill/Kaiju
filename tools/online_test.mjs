import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createOnlineServer } from '../server/index.js';
import { createSimulation } from '../server/simulation.js';
import { sanitizeInput, PROTOCOL } from '../src/online/protocol.js';
import { serverURL } from '../src/online/client.js';
const advance = (s, n) => {
  for (let i = 0; i < n; i++) s.step();
};
const setup = (mode = 'title') => createSimulation({ fighters: ['godzilla', 'mecha'], mode });
test('wire input rejects client state, invalid axes and invented powers; diagonals stay bounded', () => {
  const input = sanitizeInput({
    x: Infinity,
    z: 2,
    hp: 999,
    power: 'kill',
    strike: 1,
    heavy: true,
  });
  assert.equal(input.x, 0);
  assert.equal(input.z, 1);
  assert.equal(input.power, '');
  assert.equal(input.strike, false);
  assert.equal(input.heavy, true);
  assert.ok(!('hp' in input));
  assert.equal(Math.hypot(...['x', 'z'].map((k) => sanitizeInput({ x: 1, z: 1 })[k])), 1);
  assert.equal(serverURL('https://game.example.com'), 'wss://game.example.com/online');
  assert.equal(serverURL('http://localhost:8787'), 'ws://localhost:8787/online');
  assert.throws(() => serverURL('ws://untrusted.example.com'));
  assert.throws(() => serverURL('javascript:alert(1)'));
});
test('headless simulation runs shipped wrestling rules and caps stale input and mash', () => {
  const s = setup();
  assert.equal(s.snapshot().match.bestOf, 3);
  assert.equal(s.snapshot().match.phase, 'fight');
  const initial = s.W.player.pos.clone();
  s.input(0, { x: 1 });
  advance(s, 90);
  const stopped = s.W.player.pos.clone();
  advance(s, 60);
  assert.ok(stopped.distanceTo(s.W.player.pos) < 0.1);
  assert.ok(initial.distanceTo(stopped) > 0);
  assert.ok(s.snapshot().events.every((e) => typeof e.id === 'number'));
  s.dispose();
});
test('server resolves real strikes, grapple reversals, pins, fall transitions and match result', () => {
  const s = setup();
  const { player: p, rival: r } = s.W;
  function near() {
    p.reset(15, 62, -Math.PI / 2);
    r.reset(-10, 62, Math.PI / 2);
    p.invuln = false;
    r.invuln = false;
    p.hp = p.maxHp;
    r.hp = r.maxHp;
  }
  near();
  const hp = r.hp;
  s.input(0, { heavy: true });
  advance(s, 90);
  assert.ok(r.hp < hp, 'heavy lands through original fighter rules');
  near();
  s.input(0, { grab: true, grabHeld: true });
  advance(s, 22);
  assert.ok(s.W.grapple.hold.active, 'grab connects');
  s.input(1, { grab: true });
  advance(s, 1);
  assert.ok(s.snapshot().events.some((e) => e.name === 'grab:reversed'));
  s.W.grapple.clear();
  near();
  r.setState('downed', 20);
  r.lie = 1;
  r.lieTarget = 1;
  r.falling = 0;
  r.finished = 10;
  r.hp = 1;
  p.pos.copy(r.pos).add({ x: 5, y: 0, z: 0 });
  s.input(0, { grab: true, grabHeld: true });
  for (let i = 0; i < 360; i++) {
    if (i % 5 === 0) s.input(0, { grabHeld: true });
    s.step();
  }
  assert.ok(
    s.snapshot().events.some((e) => e.name === 'pin:fall'),
    'pin completed',
  );
  advance(s, 600);
  assert.ok(s.snapshot().match.playerFalls >= 1);
  s.W.match.end('player');
  advance(s, 600);
  assert.equal(s.result?.winner, 'player');
  assert.equal(s.snapshot().match.playerFalls, 2);
  s.dispose();
});
test('one-fall VS and forfeits use authoritative results', () => {
  const s = setup('vs');
  assert.equal(s.snapshot().match.bestOf, 1);
  s.W.match.end('rival');
  advance(s, 600);
  assert.equal(s.result.winner, 'rival');
  s.dispose();
  const f = setup();
  f.forfeit(1);
  assert.equal(f.result.winner, 'player');
  assert.equal(f.result.reason, 'disconnect');
  f.dispose();
});
function peer(url) {
  const ws = new WebSocket(url),
    messages = [],
    waiters = [];
  ws.on('message', (bytes) => {
    const value = JSON.parse(bytes);
    messages.push(value);
    for (const w of [...waiters])
      if (w.p(value)) {
        waiters.splice(waiters.indexOf(w), 1);
        clearTimeout(w.timer);
        w.resolve(value);
      }
  });
  const wait = (p, timeout = 6000) => {
    const existing = messages.find(p);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const w = {
        p,
        resolve,
        timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(Error('Timed out: ' + messages.map((m) => m.type).join(',')));
        }, timeout),
      };
      waiters.push(w);
    });
  };
  return {
    ws,
    messages,
    wait,
    send: (m) => ws.send(JSON.stringify({ protocol: PROTOCOL, ...m })),
    ready: new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    }),
  };
}
test(
  'two real WebSocket clients create, join, ready, load, play, reconnect and mutually rematch',
  { timeout: 20000 },
  async () => {
    const service = createOnlineServer({ reconnectMs: 200 });
    const address = await service.listen(0, '127.0.0.1'),
      url = `ws://127.0.0.1:${address.port}/online`;
    let a, b, c;
    try {
      a = peer(url);
      b = peer(url);
      await Promise.all([a.ready, b.ready]);
      a.send({ type: 'create', city: 'chicago', mode: 'vs', fighter: 'godzilla', name: 'Alice' });
      const joined = await a.wait((m) => m.type === 'joined'),
        id = joined.room.code;
      b.send({ type: 'join', code: id, fighter: 'mecha', name: 'Bob' });
      const bj = await b.wait((m) => m.type === 'joined');
      assert.equal(bj.seat, 1);
      a.send({ type: 'ready', ready: true });
      b.send({ type: 'ready', ready: true });
      const load = await a.wait((m) => m.type === 'load');
      a.send({ type: 'loaded', matchId: load.matchId });
      assert.equal(service.rooms.get(id).phase, 'loading');
      b.send({ type: 'loaded', matchId: load.matchId });
      const snapshot = await a.wait((m) => m.type === 'snapshot');
      assert.equal(snapshot.state.match.bestOf, 1);
      const start = snapshot.state.fighters[0].pos;
      a.send({ type: 'input', matchId: load.matchId, seq: 1, input: { x: 1 } });
      const moved = await b.wait((m) => m.type === 'snapshot' && m.state.tick > 6);
      assert.notEqual(moved.state.fighters[0].pos[0], start[0]);
      b.ws.close();
      await new Promise((resolve) => b.ws.once('close', resolve));
      c = peer(url);
      await c.ready;
      c.send({ type: 'resume', code: id, token: bj.token });
      const resumed = await c.wait((m) => m.type === 'joined');
      assert.equal(resumed.seat, 1);
      c.send({ type: 'loaded', matchId: load.matchId });
      await c.wait((m) => m.type === 'snapshot');
      service.rooms.get(id).sim.forfeit(1);
      const over = await a.wait((m) => m.type === 'snapshot' && m.state.result);
      assert.equal(over.state.result.winner, 'player');
      a.send({ type: 'rematch' });
      assert.equal(service.rooms.get(id).phase, 'over');
      c.send({ type: 'rematch' });
      const next = await a.wait((m) => m.type === 'load' && m.matchId !== load.matchId);
      assert.notEqual(next.matchId, load.matchId);
    } finally {
      a?.ws.terminate();
      b?.ws.terminate();
      c?.ws.terminate();
      await service.close();
    }
  },
);
test(
  'room admission rejects invalid versions, full rooms and foreign reconnect tokens',
  { timeout: 15000 },
  async () => {
    const service = createOnlineServer();
    const address = await service.listen(0, '127.0.0.1');
    const url = `ws://127.0.0.1:${address.port}/online`,
      a = peer(url),
      b = peer(url),
      c = peer(url);
    try {
      await Promise.all([a.ready, b.ready, c.ready]);
      a.send({ type: 'create', city: 'chicago', mode: 'title', fighter: 'godzilla' });
      const joined = await a.wait((m) => m.type === 'joined');
      b.send({ type: 'join', code: joined.room.code, fighter: 'godzilla' });
      await b.wait((m) => m.type === 'joined');
      c.send({ type: 'join', code: joined.room.code, fighter: 'mecha' });
      assert.match((await c.wait((m) => m.type === 'error')).message, /full/);
      c.send({ type: 'resume', code: joined.room.code, token: 'fake' });
      assert.match(
        (await c.wait((m) => m.type === 'error' && m.message.includes('available'))).message,
        /available/,
      );
      c.ws.send(JSON.stringify({ type: 'ping', protocol: 999 }));
      assert.match(
        (await c.wait((m) => m.type === 'error' && m.message.includes('versions'))).message,
        /versions/,
      );
    } finally {
      a.ws.terminate();
      b.ws.terminate();
      c.ws.terminate();
      await service.close();
    }
  },
);
test(
  'disconnect timeout awards a forfeit and keeps the surviving seat authoritative',
  { timeout: 10000 },
  async () => {
    const service = createOnlineServer({ reconnectMs: 80 }),
      address = await service.listen(0, '127.0.0.1'),
      url = `ws://127.0.0.1:${address.port}/online`,
      a = peer(url),
      b = peer(url);
    try {
      await Promise.all([a.ready, b.ready]);
      a.send({ type: 'create', city: 'tokyo', mode: 'title', fighter: 'godzilla' });
      const joined = await a.wait((m) => m.type === 'joined');
      b.send({ type: 'join', code: joined.room.code, fighter: 'godzilla' });
      await b.wait((m) => m.type === 'joined');
      a.send({ type: 'ready', ready: true });
      b.send({ type: 'ready', ready: true });
      const load = await a.wait((m) => m.type === 'load');
      a.send({ type: 'loaded', matchId: load.matchId });
      b.send({ type: 'loaded', matchId: load.matchId });
      await a.wait((m) => m.type === 'snapshot');
      b.ws.close();
      const result = await a.wait((m) => m.type === 'snapshot' && m.state.result);
      assert.equal(result.state.result.reason, 'disconnect');
      assert.equal(result.state.result.winner, 'player');
      assert.equal(result.state.fighters[0].key, result.state.fighters[1].key);
    } finally {
      a.ws.terminate();
      b.ws.terminate();
      await service.close();
    }
  },
);
test(
  'production origin policy and static file boundaries reject unrelated access',
  { timeout: 10000 },
  async () => {
    const service = createOnlineServer({
        allowedOrigins: ['https://game.example.com'],
        serveGame: true,
      }),
      address = await service.listen(0, '127.0.0.1'),
      base = `http://127.0.0.1:${address.port}`;
    try {
      assert.equal((await fetch(base + '/health')).status, 200);
      assert.equal((await fetch(base + '/src/online/protocol.js')).status, 200);
      assert.equal((await fetch(base + '/server/index.js')).status, 404);
      assert.equal((await fetch(base + '/assets/%2e%2e%2fserver/index.js')).status, 404);
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(base.replace('http:', 'ws:') + '/online', {
          origin: 'https://wrong.example.com',
        });
        ws.on('unexpected-response', (_req, res) => {
          assert.equal(res.statusCode, 403);
          res.resume();
          resolve();
        });
        ws.on('open', () => {
          ws.terminate();
          reject(Error('wrong origin connected'));
        });
        ws.on('error', () => {});
      });
    } finally {
      await service.close();
    }
  },
);
test('all nine fighters simulate powers with finite authoritative state', () => {
  for (const key of [
    'godzilla',
    'ghidorah',
    'mecha',
    'cindervault',
    'brineveil',
    'rimehorn',
    'vesperax',
    'thornwake',
    'ferrumaw',
  ]) {
    const s = createSimulation({ fighters: [key, key] });
    for (let tick = 0; tick < 900; tick++) {
      if (tick % 120 === 0) {
        s.W.grapple.clear();
        for (const [i, f] of [s.W.player, s.W.rival].entries()) {
          f.reset(i ? -10 : 15, 62, i ? Math.PI / 2 : -Math.PI / 2);
          f.momentum = 100;
          f.hp = f.maxHp;
        }
        s.input(0, {
          power: ['beam', 'roar', 'charge', 'stomp', 'ult'][Math.floor(tick / 120) % 5],
        });
      }
      s.step();
      for (const f of s.snapshot().fighters)
        assert.ok([...f.pos, ...f.rot, f.hp, f.momentum].every(Number.isFinite), key);
    }
    s.dispose();
  }
});
test(
  'reconnecting during loading reissues the same load barrier instead of stranding the room',
  { timeout: 12000 },
  async () => {
    const service = createOnlineServer(),
      address = await service.listen(0, '127.0.0.1'),
      url = `ws://127.0.0.1:${address.port}/online`,
      a = peer(url),
      b = peer(url);
    let c;
    try {
      await Promise.all([a.ready, b.ready]);
      a.send({ type: 'create', city: 'chicago', mode: 'title', fighter: 'godzilla' });
      const joined = await a.wait((m) => m.type === 'joined');
      b.send({ type: 'join', code: joined.room.code, fighter: 'mecha' });
      const bj = await b.wait((m) => m.type === 'joined');
      a.send({ type: 'ready', ready: true });
      b.send({ type: 'ready', ready: true });
      const load = await a.wait((m) => m.type === 'load');
      a.send({ type: 'loaded', matchId: load.matchId });
      b.ws.close();
      await new Promise((resolve) => b.ws.once('close', resolve));
      c = peer(url);
      await c.ready;
      c.send({ type: 'resume', code: joined.room.code, token: bj.token });
      const reissued = await c.wait((m) => m.type === 'load');
      assert.equal(reissued.matchId, load.matchId);
      assert.equal(service.rooms.get(joined.room.code).phase, 'loading');
      c.send({ type: 'loaded', matchId: load.matchId });
      await a.wait((m) => m.type === 'snapshot');
      assert.equal(service.rooms.get(joined.room.code).phase, 'playing');
    } finally {
      a.ws.terminate();
      b.ws.terminate();
      c?.ws.terminate();
      await service.close();
    }
  },
);
