// Synthesized sound effects via the Web Audio API (no asset downloads).
// All sounds are short and procedurally generated.

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicGain = null;
  }

  // Must be called from a user gesture (click / touchstart) to satisfy autoplay policies.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  // Resume on backgrounded tabs (iOS suspends the AudioContext)
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _now() { return this.ctx.currentTime; }

  // Single tone with envelope and optional pitch slide
  tone(freq, dur, type = 'sine', vol = 1, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // White noise burst with low-pass colour
  noise(dur, filterFreq = 600, vol = 0.6) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreq * 0.4), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ----- Game sounds -----
  explosion(scale = 1.0) {
    this.noise(0.55 * scale, 900 * scale, 0.7);
    this.tone(70 * scale, 0.5 * scale, 'sawtooth', 0.5, -40);
  }

  hit() { this.tone(180, 0.08, 'square', 0.35, -90); }

  shellHit() { this.tone(140, 0.12, 'square', 0.4, -80); this.noise(0.08, 400, 0.4); }

  beam() {
    this.tone(220, 0.55, 'sawtooth', 0.4);
    this.tone(110, 0.55, 'square', 0.3);
    this.tone(440, 0.55, 'sine', 0.2, 220);
  }

  roar() {
    this.tone(60, 0.7, 'sawtooth', 0.6, 60);
    this.tone(110, 0.7, 'square', 0.4, 30);
    this.noise(0.5, 700, 0.45);
  }

  charge() {
    this.tone(180, 0.35, 'sawtooth', 0.55, 180);
    this.noise(0.3, 500, 0.4);
  }

  stomp() {
    this.tone(50, 0.3, 'sine', 0.6, -20);
    this.noise(0.18, 250, 0.35);
  }

  footstep() { this.noise(0.1, 220, 0.18); }

  ult() {
    this.tone(80, 1.2, 'sawtooth', 0.6, 40);
    this.tone(160, 1.2, 'square', 0.4, -60);
    this.tone(320, 1.0, 'sine', 0.35, 200);
    this.noise(1.2, 900, 0.55);
  }

  shoot(type = 'tank') {
    if (type === 'rifle') { this.tone(1100, 0.04, 'square', 0.18); return; }
    if (type === 'jet' || type === 'mech') { this.tone(300, 0.08, 'square', 0.3, -120); this.noise(0.06, 1200, 0.2); return; }
    if (type === 'boss') { this.tone(120, 0.18, 'sawtooth', 0.4, -60); this.noise(0.12, 700, 0.3); return; }
    // tank / heli default
    this.tone(160, 0.09, 'square', 0.3, -60);
    this.noise(0.08, 700, 0.3);
  }

  pickup(type) {
    if (type === 'hp')      { this.tone(523, 0.08); this.tone(784, 0.12); }
    else if (type === 'rage') { this.tone(330, 0.07, 'square', 0.4); this.tone(523, 0.12, 'square', 0.3); }
    else                     { this.tone(880, 0.06); this.tone(1320, 0.1); this.tone(1760, 0.1); }
  }

  alarm() { this.tone(880, 0.18, 'square', 0.4); this.tone(660, 0.18, 'square', 0.4); }

  waveStart() { this.tone(220, 0.18, 'square', 0.45); this.tone(330, 0.18, 'square', 0.45); this.tone(440, 0.22, 'sawtooth', 0.45); }

  waveClear() { this.tone(523, 0.15); this.tone(659, 0.15); this.tone(784, 0.2); this.tone(1046, 0.25); }

  gameOver() { this.tone(220, 0.3, 'sawtooth', 0.5, -120); this.tone(110, 0.5, 'sawtooth', 0.5, -60); }

  bossSpawn() { this.tone(60, 0.25, 'sawtooth', 0.6); this.tone(110, 0.4, 'sawtooth', 0.5, 30); this.alarm(); }
}

export default new Audio();
