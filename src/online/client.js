import { PROTOCOL, sanitizeInput, EDGES } from './protocol.js';
export function serverURL(value) {
  const u = new URL(value, globalThis.location?.href || 'http://localhost');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol === 'https:') u.protocol = 'wss:';
  else if (u.protocol === 'http:' && local) u.protocol = 'ws:';
  if (u.protocol !== 'wss:' && !(u.protocol === 'ws:' && local))
    throw Error('Use a secure multiplayer server address.');
  if (u.username || u.password || u.search || u.hash)
    throw Error('Use a secure multiplayer server address.');
  u.pathname = '/online';
  return u.href;
}
export class OnlineClient extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.room = null;
    this.seat = 0;
    this.token = '';
    this.matchId = '';
    this.snapshot = null;
    this.connected = false;
    this.seq = 0;
    this.pending = sanitizeInput();
    this.lastSend = 0;
    this.retry = null;
    this.closed = true;
    this.generation = 0;
    this.ping = 0;
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  connect(address) {
    this.close();
    this.url = serverURL(address);
    this.closed = false;
    this.openSocket();
  }
  openSocket() {
    const gen = ++this.generation,
      ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (gen !== this.generation) return;
      this.connected = true;
      this.emit('connection', true);
      if (this.token && this.room)
        this.send({ type: 'resume', code: this.room.code, token: this.token });
      else this.emit('available');
    };
    ws.onmessage = ({ data }) => {
      if (gen !== this.generation) return;
      let m;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (m.type === 'hello' && m.protocol !== PROTOCOL) {
        this.emit('error', 'Game versions differ. Reload both games.');
        this.close();
        return;
      }
      if (m.type === 'joined') {
        this.room = m.room;
        this.seat = m.seat;
        this.token = m.token;
        this.seq = 0;
        this.emit('room', this.room);
      }
      if (m.type === 'room') {
        this.room = m.room;
        this.emit('room', this.room);
      }
      if (m.type === 'load') {
        const fresh = this.matchId !== m.matchId;
        this.matchId = m.matchId;
        if (fresh) {
          this.snapshot = null;
          this.seq = 0;
        }
        this.emit('load', { ...m, fresh });
      }
      if (m.type === 'snapshot' && m.matchId === this.matchId) {
        this.snapshot = m.state;
        this.receivedAt = performance.now();
        this.emit('snapshot', m.state);
      }
      if (m.type === 'pong') {
        this.ping = Math.round(performance.now() - m.sent);
        this.emit('latency', this.ping);
      }
      if (m.type === 'error') {
        this.emit('error', m.message);
        if (
          [
            'This room is no longer available.',
            'The reconnect window has ended.',
            'Loading timed out. Create a new room.',
            'Match interrupted. No result recorded.',
          ].includes(m.message)
        ) {
          this.token = '';
          this.room = null;
        }
      }
    };
    ws.onclose = () => {
      if (gen !== this.generation) return;
      this.connected = false;
      this.emit('connection', false);
      if (!this.closed && this.token) this.retry = setTimeout(() => this.openSocket(), 1500);
    };
    ws.onerror = () => {
      if (!this.token) this.emit('error', 'Could not connect to the multiplayer server.');
    };
  }
  send(data) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ protocol: PROTOCOL, ...data }));
  }
  input(raw) {
    const input = sanitizeInput(raw),
      old = this.pending;
    for (const key of EDGES) input[key] ||= old[key];
    input.power ||= old.power;
    input.mash = Math.max(input.mash, old.mash);
    this.pending = input;
    const now = performance.now();
    if (now - this.lastSend < 1000 / 30) return;
    this.send({ type: 'input', matchId: this.matchId, seq: ++this.seq, input });
    this.pending = sanitizeInput({
      ...input,
      ...Object.fromEntries(EDGES.map((k) => [k, false])),
      power: '',
      mash: 0,
    });
    this.lastSend = now;
    if (!this.lastPing || now - this.lastPing > 3000) {
      this.send({ type: 'ping', sent: now });
      this.lastPing = now;
    }
  }
  leave() {
    this.send({ type: 'leave' });
    this.close();
  }
  close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.generation++;
    this.ws?.close();
    this.ws = null;
    this.room = null;
    this.token = '';
    this.matchId = '';
    this.snapshot = null;
    this.connected = false;
    this.pending = sanitizeInput();
  }
}
