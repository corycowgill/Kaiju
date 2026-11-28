import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createSimulation } from './simulation.js';
import { PROTOCOL, CITIES, FIGHTERS, TICK_RATE } from '../src/online/protocol.js';
const token = () => randomBytes(24).toString('base64url');
const cleanName = (v) =>
  Array.from(
    String(v || 'Player')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim(),
  )
    .slice(0, 24)
    .join('') || 'Player';
const code = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
};
export function createOnlineServer({
  allowedOrigins = [],
  serveGame = false,
  maxRooms = 100,
  reconnectMs = 20000,
  now = Date.now,
} = {}) {
  const rooms = new Map(),
    peers = new Set();
  let closing = false;
  const send = (ws, data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 256 * 1024) {
        ws.close(1013, 'Connection too slow');
        return;
      }
      ws.send(JSON.stringify(data));
    }
  };
  const broadcast = (room, data) => room.seats.forEach((s) => send(s?.ws, data));
  function publicRoom(r) {
    return {
      code: r.code,
      mode: r.mode,
      city: r.city,
      phase: r.phase,
      seats: r.seats.map((s) =>
        s
          ? {
              name: s.name,
              fighter: s.fighter,
              ready: s.ready,
              loaded: s.loaded,
              connected: !!s.ws,
              rematch: s.rematch,
            }
          : null,
      ),
    };
  }
  const roomUpdate = (r) => broadcast(r, { type: 'room', room: publicRoom(r) });
  function detach(ws, explicit = false) {
    const r = rooms.get(ws.roomCode),
      seat = ws.seat;
    if (!r || r.seats[seat]?.ws !== ws) return;
    const s = r.seats[seat];
    s.ws = null;
    s.lostAt = now();
    s.ready = false;
    if (explicit && r.sim) r.sim.forfeit(seat);
    if (r.phase === 'lobby' || (explicit && !r.sim)) r.seats[seat] = null;
    ws.roomCode = null;
    roomUpdate(r);
  }
  function beginLoading(r) {
    r.sim?.dispose();
    r.sim = null;
    r.phase = 'loading';
    r.started = now();
    r.matchId = token();
    r.seats.forEach((s) => {
      s.loaded = false;
      s.rematch = false;
      s.seq = -1;
    });
    roomUpdate(r);
    broadcast(r, { type: 'load', matchId: r.matchId, room: publicRoom(r) });
  }
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, rooms: rooms.size }));
      return;
    }
    if (serveGame && ['GET', 'HEAD'].includes(req.method))
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
          rel = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (
          rel.split('/').some((p) => p.startsWith('.')) ||
          (!['index.html', 'node_modules/three/build/three.module.js'].includes(rel) &&
            !['src/', 'assets/'].some((p) => rel.startsWith(p)))
        )
          throw Error();
        const file = path.resolve(ROOT, rel),
          safe = path.relative(ROOT, file);
        if (
          !file.startsWith(ROOT) ||
          (!['index.html', 'node_modules/three/build/three.module.js'].includes(safe) &&
            !['src/', 'assets/'].some((p) => safe.startsWith(p)))
        )
          throw Error();
        const bytes = await readFile(file);
        res.writeHead(200, {
          'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(req.method === 'HEAD' ? undefined : bytes);
        return;
      } catch {
        /* fall through */
      }
    res.writeHead(404);
    res.end('Not found');
  });
  const wss = new WebSocketServer({
    server,
    maxPayload: 4096,
    path: '/online',
    perMessageDeflate: false,
    verifyClient: ({ origin }, done) =>
      done(!allowedOrigins.length || allowedOrigins.includes(origin), 403, 'Origin not allowed'),
  });
  wss.on('connection', (ws) => {
    if (peers.size >= 500) {
      ws.close(1013, 'Server full');
      return;
    }
    peers.add(ws);
    ws.alive = true;
    ws.lastRate = now();
    ws.rate = 0;
    ws.on('pong', () => {
      ws.alive = true;
    });
    send(ws, { type: 'hello', protocol: PROTOCOL });
    ws.on('message', (bytes) => {
      try {
        const time = now();
        if (time - ws.lastRate >= 1000) {
          ws.lastRate = time;
          ws.rate = 0;
        }
        if (++ws.rate > 100) {
          ws.close(1008, 'Too many messages');
          return;
        }
        const m = JSON.parse(bytes);
        if (!m || typeof m !== 'object') throw Error('Invalid message.');
        if (m.protocol !== PROTOCOL) throw Error('Game versions differ. Reload both games.');
        let r = rooms.get(ws.roomCode),
          s = r?.seats[ws.seat];
        if (m.type === 'ping') {
          send(ws, { type: 'pong', sent: m.sent });
          return;
        }
        if (m.type === 'leave') {
          detach(ws, true);
          send(ws, { type: 'left' });
          return;
        }
        if (m.type === 'resume') {
          if (r) throw Error('Leave the current room first.');
          r = rooms.get(String(m.code).toUpperCase());
          const seat = r?.seats.findIndex((v) => v?.token === m.token);
          if (seat === undefined || seat < 0) throw Error('This room is no longer available.');
          s = r.seats[seat];
          if (!s.ws && time - s.lostAt > reconnectMs)
            throw Error('The reconnect window has ended.');
          s.ws?.close(4001, 'Session resumed elsewhere');
          s.ws = ws;
          s.lostAt = 0;
          s.seq = -1;
          ws.roomCode = r.code;
          ws.seat = seat;
          send(ws, { type: 'joined', seat, token: s.token, room: publicRoom(r) });
          roomUpdate(r);
          if (r.matchId && ['loading', 'playing', 'over'].includes(r.phase))
            send(ws, { type: 'load', matchId: r.matchId, room: publicRoom(r) });
          return;
        }
        if (m.type === 'create' || m.type === 'join') {
          if (!FIGHTERS.includes(m.fighter)) throw Error('Choose a fighter.');
          if (r) throw Error('Leave the current room first.');
          if (m.type === 'create') {
            if (rooms.size >= maxRooms) throw Error('Server full. Try again later.');
            if (!CITIES.includes(m.city) || !['title', 'vs'].includes(m.mode))
              throw Error('Choose a supported match.');
            let id;
            do {
              id = code();
            } while (rooms.has(id));
            r = {
              code: id,
              mode: m.mode,
              city: m.city,
              phase: 'lobby',
              seats: [null, null],
              created: time,
              started: time,
              sim: null,
            };
            rooms.set(id, r);
          } else {
            r = rooms.get(String(m.code).toUpperCase());
            if (!r || r.phase !== 'lobby') throw Error('This room is no longer available.');
          }
          const seat = r.seats.findIndex((v) => !v);
          if (seat < 0) throw Error('This room is full.');
          if (!FIGHTERS.includes(m.fighter)) throw Error('Choose a fighter.');
          s = {
            name: cleanName(m.name),
            fighter: m.fighter,
            token: token(),
            ws,
            ready: false,
            loaded: false,
            rematch: false,
            seq: -1,
            lostAt: 0,
          };
          r.seats[seat] = s;
          ws.roomCode = r.code;
          ws.seat = seat;
          send(ws, { type: 'joined', seat, token: s.token, room: publicRoom(r) });
          roomUpdate(r);
          return;
        }
        if (!r || s?.ws !== ws) throw Error('Join a room first.');
        if (m.type === 'ready') {
          if (r.phase !== 'lobby') return;
          s.ready = !!m.ready;
          if (r.seats.every((v) => v?.ready && v.ws)) beginLoading(r);
          else roomUpdate(r);
        } else if (m.type === 'loaded') {
          if (m.matchId !== r.matchId || !['loading', 'playing', 'over'].includes(r.phase)) return;
          s.loaded = true;
          if (r.phase === 'loading' && r.seats.every((v) => v?.loaded && v.ws)) {
            r.sim = createSimulation({
              fighters: r.seats.map((v) => v.fighter),
              mode: r.mode,
              arena: arenas[r.city],
            });
            r.phase = 'playing';
            r.started = time;
            roomUpdate(r);
          }
          if (r.sim) send(ws, { type: 'snapshot', matchId: r.matchId, state: r.sim.snapshot() });
        } else if (m.type === 'input') {
          if (r.phase !== 'playing' || !s.loaded || m.matchId !== r.matchId) return;
          if (!Number.isSafeInteger(m.seq) || m.seq <= s.seq) return;
          s.seq = m.seq;
          r.sim.input(ws.seat, m.input);
        } else if (m.type === 'rematch') {
          if (r.phase !== 'over') return;
          s.rematch = true;
          roomUpdate(r);
          if (r.seats.every((v) => v?.ws && v.rematch)) beginLoading(r);
        } else throw Error('Unsupported message.');
      } catch (e) {
        send(ws, { type: 'error', message: e.message || 'Invalid message.' });
      }
    });
    ws.on('close', () => {
      peers.delete(ws);
      if (!closing) detach(ws);
    });
    ws.on('error', () => {});
  });
  const arenas = {};
  async function listen(port = process.env.PORT || 8787, host = '0.0.0.0') {
    for (const city of CITIES) {
      const d = JSON.parse(
        await readFile(path.join(ROOT, 'assets/levels', `${city}_layout.json`), 'utf8'),
      );
      arenas[city] = { cx: d.ring?.x ?? 4, cz: d.ring?.z ?? 62, half: 42 };
    }
    await new Promise((resolve) => server.listen(port, host, resolve));
    return server.address();
  }
  let last = performance.now(),
    accumulator = 0,
    frames = 0;
  const timer = setInterval(() => {
    const current = performance.now();
    accumulator += Math.min(0.25, (current - last) / 1000);
    last = current;
    while (accumulator >= 1 / TICK_RATE) {
      accumulator -= 1 / TICK_RATE;
      frames++;
      for (const r of rooms.values())
        if (r.sim && r.phase === 'playing') {
          try {
            r.sim.step();
          } catch (error) {
            console.error('Online match interrupted:', error);
            broadcast(r, { type: 'error', message: 'Match interrupted. No result recorded.' });
            r.seats.forEach((s) => {
              if (s?.ws) s.ws.roomCode = null;
            });
            r.sim.dispose();
            rooms.delete(r.code);
            continue;
          }
          if (r.seats.some((s) => !s?.ws))
            for (let i = 0; i < 2; i++)
              if (!r.seats[i]?.ws && now() - (r.seats[i]?.lostAt || r.started) > reconnectMs)
                r.sim.forfeit(i);
          if (r.sim.result) {
            r.phase = 'over';
            r.started = now();
            roomUpdate(r);
          }
          if (frames % 3 === 0 || r.sim.result)
            broadcast(r, {
              type: 'snapshot',
              matchId: r.matchId,
              ack: r.seats.map((s) => s?.seq ?? -1),
              state: r.sim.snapshot(),
            });
        }
    }
    for (const [id, r] of rooms) {
      if (r.phase === 'loading' && now() - r.started > 120000) {
        broadcast(r, { type: 'error', message: 'Loading timed out. Create a new room.' });
        r.seats.forEach((s) => {
          if (s?.ws) s.ws.roomCode = null;
        });
        r.sim?.dispose();
        rooms.delete(id);
      } else if (
        (!r.seats.some((s) => s?.ws) &&
          now() - Math.max(r.created, ...r.seats.map((s) => s?.lostAt || 0)) > reconnectMs) ||
        (r.phase === 'lobby' && now() - r.created > 1800000) ||
        (r.phase === 'over' && now() - r.started > 600000)
      ) {
        broadcast(r, { type: 'error', message: 'This room is no longer available.' });
        r.seats.forEach((s) => {
          if (s?.ws) s.ws.roomCode = null;
        });
        r.sim?.dispose();
        rooms.delete(id);
      }
    }
  }, 1000 / TICK_RATE);
  const heartbeat = setInterval(() => {
    for (const ws of peers) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 10000);
  return {
    server,
    rooms,
    listen,
    async close() {
      closing = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const ws of peers) ws.terminate();
      for (const r of rooms.values()) r.sim?.dispose();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = createOnlineServer({
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    serveGame: process.env.SERVE_GAME === '1',
  });
  service
    .listen()
    .then((address) => console.log(`Kaiju online server listening on ${address.port}`));
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, async () => {
      await service.close();
      process.exit(0);
    });
}
