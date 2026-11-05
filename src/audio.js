// Sound effects via the Web Audio API.
// Sampled SFX (assets/sfx/, generated with Stable Audio 3 small-sfx) are
// preloaded on init() and played with random variation picks, slight pitch
// jitter and per-sound voice/cooldown limits. Until a sample has decoded (or if
// it fails to load) every sound falls back to the original procedural synth.

import { cachedFetch } from './assetCache.js';

const SFX_DIR = 'assets/sfx/';

// name: [variations, gain, maxVoices, cooldown (s), rate jitter (+/-)]
// variations > 1 load as name_1..name_N, otherwise just name.
const SFX = {
  explosion_small: [3, 0.85, 5, 0.04, 0.10],
  explosion_big:   [3, 1.0,  3, 0.08, 0.08],
  hit:             [3, 0.9,  3, 0.05, 0.08],
  shell_hit:       [3, 0.7,  4, 0.05, 0.10],
  beam_gorrak:     [2, 1.0,  1, 0.30, 0.03],
  beam_tridon:     [2, 1.0,  1, 0.30, 0.03],
  beam_mechra:     [2, 1.0,  1, 0.30, 0.03],
  roar_gorrak:     [2, 1.0,  1, 0.40, 0.04],
  roar_tridon:     [2, 1.0,  1, 0.40, 0.04],
  roar_mechra:     [2, 1.0,  1, 0.40, 0.04],
  charge_gorrak:   [2, 0.9,  2, 0.10, 0.06],
  charge_tridon:   [2, 0.9,  2, 0.10, 0.06],
  charge_mechra:   [2, 0.9,  2, 0.10, 0.06],
  stomp:           [3, 1.0,  2, 0.10, 0.06],
  footstep:        [4, 0.75, 2, 0.08, 0.10],
  ult:             [2, 1.0,  1, 0.50, 0.03],
  shoot_tank:      [3, 0.6,  3, 0.06, 0.08],
  shoot_rifle:     [4, 0.45, 4, 0.03, 0.12],
  shoot_heli:      [2, 0.55, 3, 0.06, 0.08],
  shoot_jet:       [2, 0.6,  2, 0.10, 0.08],
  shoot_mech:      [2, 0.6,  3, 0.06, 0.08],
  shoot_boss:      [2, 0.8,  2, 0.10, 0.06],
  pickup_hp:       [1, 0.8,  2, 0.05, 0.02],
  pickup_rage:     [1, 0.8,  2, 0.05, 0.02],
  pickup_score:    [1, 0.8,  2, 0.05, 0.02],
  alarm:           [1, 0.7,  1, 0.50, 0.0],
  wave_start:      [1, 0.8,  1, 0.50, 0.0],
  wave_clear:      [1, 0.8,  1, 0.50, 0.0],
  game_over:       [1, 0.9,  1, 1.00, 0.0],
  boss_spawn:      [1, 1.0,  1, 1.00, 0.0],
  collapse:        [3, 0.85, 3, 0.15, 0.08],
  glass:           [2, 0.6,  3, 0.10, 0.10],
  car_crush:       [3, 0.7,  3, 0.08, 0.10],
  scream:          [3, 0.5,  2, 0.90, 0.08],
  jet_flyby:       [2, 0.7,  1, 4.00, 0.06],
  kill_tank:       [2, 0.8,  2, 0.08, 0.06],
  kill_heli:       [2, 0.8,  2, 0.08, 0.05],
  kill_jet:        [2, 0.8,  2, 0.08, 0.06],
  boss_windup:     [2, 0.9,  2, 0.30, 0],     // no rate jitter: length is timed to the cannon shot
  boss_slam_warn:  [2, 1.0,  1, 0.80, 0],     // likewise timed to the ground-pound impact
  loop_heli:       [1, 1.0,  1, 0,    0],
  loop_tank:       [1, 1.0,  1, 0,    0],
  loop_city:       [1, 1.0,  1, 0,    0],
};

// Exact loop lengths (samples at 44.1 kHz). Decoders that ignore the MP3
// encoder-delay header (older Safari) hand back 1105 samples of LAME priming
// up front plus tail padding, which would click/gap at the loop point; when
// the decoded buffer is longer than this, loop only the real content.
const LOOP_SAMPLES = { loop_heli: 185220, loop_tank: 194040, loop_city: 348390 };
const MP3_PRIMING = 1105;

// Monster variant (monsters.js cfg.variant) -> per-kaiju SFX suffix
const KAIJU_SFX = { gojira: 'gorrak', ghidorah: 'tridon', mecha: 'mechra' };

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicGain = null;
    this.sfx = {};          // name -> [AudioBuffer]
    this._voices = {};      // name -> [{ src, end }]
    this._lastPlay = {};    // name -> ctx time
    this._lastPick = {};    // name -> last variation index
    this._kaiju = 'gorrak';
    this._amb = null;       // ambience loops (created once buffers decode)
    this._ambT = 0;
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
    this.loadSfx();
    // Fade ambience loops out when updateAmbience() stops being called (pause, menus).
    setInterval(() => {
      if (this._amb && this.ctx && this._now() - this._ambT > 0.5) this._setAmbience(0, 0, 0);
    }, 250);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  // Resume on backgrounded tabs (iOS suspends the AudioContext)
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _now() { return this.ctx.currentTime; }

  // Pick per-kaiju beam/roar/charge samples. Takes the monsters.js variant key.
  setMonster(variant) { this._kaiju = KAIJU_SFX[variant] || 'gorrak'; }

  // ============ Sampled SFX ============
  // Fetch + decode every sample in the bank (a few at a time). OGG Vorbis
  // first where supported, MP3 otherwise (older Safari/iOS can't decode OGG).
  async loadSfx() {
    if (!this.ctx || this._sfxLoading) return;
    this._sfxLoading = true;
    const probe = document.createElement('audio');
    const exts = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
    const jobs = [];
    for (const name of Object.keys(SFX)) {
      const n = SFX[name][0];
      for (let i = 0; i < n; i++) jobs.push([name, i, n > 1 ? `${name}_${i + 1}` : name]);
    }
    const worker = async () => {
      while (jobs.length) {
        const [name, i, base] = jobs.shift();
        for (const ext of exts) {
          try {
            const arr = await cachedFetch(SFX_DIR + base + '.' + ext);
            const buf = await new Promise((resolve, reject) => {
              this.ctx.decodeAudioData(arr, resolve, reject);
            });
            (this.sfx[name] || (this.sfx[name] = []))[i] = buf;
            break;
          } catch (e) { /* try next format */ }
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  }

  // Play a sample from the bank. Returns false only when the sample isn't
  // loaded, so callers can fall back to the procedural version; rate-limited
  // or muted calls still return true (handled, intentionally silent).
  _play(name, gain = 1, rate = 1, when = 0) {
    const bank = this.sfx[name];
    if (!this.ctx || !bank) return false;
    const bufs = bank.filter(Boolean);
    if (!bufs.length) return false;
    if (this.muted) return true;
    const [, baseGain, maxVoices, cooldown, jitter] = SFX[name];
    const t = this._now();
    const at = t + when;  // cooldown is measured between scheduled start times
    if (Math.abs(at - (this._lastPlay[name] ?? -1e9)) < cooldown) return true;
    const voices = (this._voices[name] || []).filter(v => v.end > t);
    this._voices[name] = voices;
    if (voices.length >= maxVoices) return true;

    // Random variation, avoiding an immediate repeat when there's a choice
    let k = Math.floor(Math.random() * bufs.length);
    if (bufs.length > 1 && k === this._lastPick[name]) k = (k + 1) % bufs.length;
    this._lastPick[name] = k;

    const src = this.ctx.createBufferSource();
    src.buffer = bufs[k];
    const r = rate * (1 + (Math.random() * 2 - 1) * jitter);
    src.playbackRate.value = r;
    const g = this.ctx.createGain();
    g.gain.value = baseGain * gain;
    src.connect(g); g.connect(this.master);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    src.start(at);
    this._lastPlay[name] = at;
    voices.push({ src, end: at + src.buffer.duration / r });
    return true;
  }

  // Kaiju-specific sample name, e.g. beam -> beam_tridon
  _k(kind) { return kind + '_' + this._kaiju; }

  // ============ Ambience loops ============
  // Call once per frame with the live enemy list and the kaiju position:
  // helicopter rotor / tank engine loops follow how many are nearby, and a
  // quiet city-in-chaos bed runs underneath while the game is updating.
  updateAmbience(enemies, kpos) {
    if (!this.ctx || this._ambOff || !this.sfx.loop_heli || !this.sfx.loop_tank || !this.sfx.loop_city) return;
    if (!this._amb) {
      this._amb = {};
      for (const name of ['loop_heli', 'loop_tank', 'loop_city']) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.sfx[name][0];
        src.loop = true;
        const len = LOOP_SAMPLES[name] / 44100;
        if (src.buffer.duration - len > 0.02) {
          src.loopStart = MP3_PRIMING / 44100;
          src.loopEnd = src.loopStart + len;
        }
        const g = this.ctx.createGain();
        g.gain.value = 0;
        src.connect(g); g.connect(this.master);
        src.start(0, src.loopStart);
        this._amb[name] = { src, g };
      }
    }
    let heli = 0, tank = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || !e.root) continue;
      if (e.type !== 'heli' && e.type !== 'tank') continue;
      const p = e.root.position;
      const d = kpos ? Math.hypot(p.x - kpos.x, p.z - kpos.z) : 60;
      const w = 1 / (1 + d / 50);
      if (e.type === 'heli') heli += w; else tank += w;
    }
    this._ambT = this._now();
    this._setAmbience(Math.min(1, heli * 1.2) * 0.9, Math.min(1, tank * 0.9) * 0.7, 0.5);
  }

  _setAmbience(heli, tank, city) {
    const t = this._now();
    const a = this._amb;
    a.loop_heli.g.gain.setTargetAtTime(heli, t, 0.35);
    a.loop_tank.g.gain.setTargetAtTime(tank, t, 0.35);
    a.loop_city.g.gain.setTargetAtTime(city, t, 0.8);
  }

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
    const big = scale >= 1.3;
    const gain = Math.min(1.2, 0.55 + scale * 0.35);
    const rate = Math.max(0.8, Math.min(1.15, 1.15 - (scale - 0.5) * 0.12));
    if (this._play(big ? 'explosion_big' : 'explosion_small', gain, rate)) return;
    this.noise(0.55 * scale, 900 * scale, 0.7);
    this.tone(70 * scale, 0.5 * scale, 'sawtooth', 0.5, -40);
  }

  hit() {
    if (this._play('hit')) return;
    this.tone(180, 0.08, 'square', 0.35, -90);
  }

  shellHit() {
    if (this._play('shell_hit')) return;
    this.tone(140, 0.12, 'square', 0.4, -80); this.noise(0.08, 400, 0.4);
  }

  beam() {
    if (this._play(this._k('beam'))) return;
    this.tone(220, 0.55, 'sawtooth', 0.4);
    this.tone(110, 0.55, 'square', 0.3);
    this.tone(440, 0.55, 'sine', 0.2, 220);
  }

  roar() {
    if (this._play(this._k('roar'))) return;
    this.tone(60, 0.7, 'sawtooth', 0.6, 60);
    this.tone(110, 0.7, 'square', 0.4, 30);
    this.noise(0.5, 700, 0.45);
  }

  charge() {
    if (this._play(this._k('charge'))) return;
    this.tone(180, 0.35, 'sawtooth', 0.55, 180);
    this.noise(0.3, 500, 0.4);
  }

  stomp() {
    if (this._play('stomp')) return;
    this.tone(50, 0.3, 'sine', 0.6, -20);
    this.noise(0.18, 250, 0.35);
  }

  footstep() {
    if (this._play('footstep')) return;
    this.noise(0.1, 220, 0.18);
  }

  ult() {
    if (this._play('ult')) {
      this._play(this._k('roar'), 0.6, 0.9, 0.15); // monster cry layered on the blast
      return;
    }
    this.tone(80, 1.2, 'sawtooth', 0.6, 40);
    this.tone(160, 1.2, 'square', 0.4, -60);
    this.tone(320, 1.0, 'sine', 0.35, 200);
    this.noise(1.2, 900, 0.55);
  }

  shoot(type = 'tank') {
    if (type === 'rifle') {
      if (this._play('shoot_rifle')) return;
      this.tone(1100, 0.04, 'square', 0.18); return;
    }
    if (type === 'jet' || type === 'mech') {
      if (this._play(type === 'jet' ? 'shoot_jet' : 'shoot_mech')) {
        if (type === 'jet') this._play('jet_flyby'); // long cooldown: an occasional pass-by roar
        return;
      }
      this.tone(300, 0.08, 'square', 0.3, -120); this.noise(0.06, 1200, 0.2); return;
    }
    if (type === 'boss') {
      if (this._play('shoot_boss')) return;
      this.tone(120, 0.18, 'sawtooth', 0.4, -60); this.noise(0.12, 700, 0.3); return;
    }
    // tank / heli default
    if (this._play(type === 'heli' ? 'shoot_heli' : 'shoot_tank')) return;
    this.tone(160, 0.09, 'square', 0.3, -60);
    this.noise(0.08, 700, 0.3);
  }

  pickup(type) {
    if (type === 'hp')      { if (this._play('pickup_hp')) return; this.tone(523, 0.08); this.tone(784, 0.12); }
    else if (type === 'rage') { if (this._play('pickup_rage')) return; this.tone(330, 0.07, 'square', 0.4); this.tone(523, 0.12, 'square', 0.3); }
    else                     { if (this._play('pickup_score')) return; this.tone(880, 0.06); this.tone(1320, 0.1); this.tone(1760, 0.1); }
  }

  alarm() {
    if (this._play('alarm')) return;
    this.tone(880, 0.18, 'square', 0.4); this.tone(660, 0.18, 'square', 0.4);
  }

  waveStart() {
    if (this._play('wave_start')) return;
    this.tone(220, 0.18, 'square', 0.45); this.tone(330, 0.18, 'square', 0.45); this.tone(440, 0.22, 'sawtooth', 0.45);
  }

  waveClear() {
    if (this._play('wave_clear')) return;
    this.tone(523, 0.15); this.tone(659, 0.15); this.tone(784, 0.2); this.tone(1046, 0.25);
  }

  gameOver() {
    if (this._play('game_over')) return;
    this.tone(220, 0.3, 'sawtooth', 0.5, -120); this.tone(110, 0.5, 'sawtooth', 0.5, -60);
  }

  bossSpawn() {
    if (this._play('boss_spawn')) { this.alarm(); return; }
    this.tone(60, 0.25, 'sawtooth', 0.6); this.tone(110, 0.4, 'sawtooth', 0.5, 30); this.alarm();
  }

  // Boss telegraphs. Each sample ends on its loudest point, so call these
  // 0.9 s before the cannons fire / 1.5 s before the ground pound lands.
  bossWindup() {
    if (this._play('boss_windup')) return;
    this.tone(220, 0.9, 'sawtooth', 0.3, 1100);
    this.tone(110, 0.9, 'square', 0.15, 330);
  }

  bossSlamWarn() {
    if (this._play('boss_slam_warn')) return;
    this.tone(40, 1.5, 'sawtooth', 0.45, 30);
    this.noise(1.5, 300, 0.25);
  }

  // Building destroyed: concrete collapse, sometimes with a glass shatter on top
  collapse() {
    if (this._play('collapse')) {
      if (Math.random() < 0.6) this._play('glass', 1, 1, 0.05 + Math.random() * 0.2);
      return;
    }
    this.noise(0.9, 500, 0.5);
    this.tone(45, 0.8, 'sawtooth', 0.35, -15);
  }

  carCrush() {
    if (this._play('car_crush')) return;
    this.tone(220, 0.1, 'square', 0.25, -120); this.noise(0.12, 1500, 0.3);
  }

  // Civilians stomped / fleeing. Long cooldown so a rampage doesn't turn into a wall of screams.
  scream() {
    this._play('scream');
  }

  // Vehicle kill, layered on the generic explosion() the enemy already fires:
  // tank = armor crunch + delayed ammo cook-off, heli = rotor wind-down + crash,
  // jet = mid-air blast with falling wreckage.
  vehicleDestroyed(type) {
    if (type === 'tank') {
      if (this._play('kill_tank')) { this._play('explosion_small', 0.7, 0.9, 0.3 + Math.random() * 0.25); return; }
      this.tone(90, 0.25, 'square', 0.35, -50); this.noise(0.3, 1200, 0.35);
    } else if (type === 'heli') {
      if (this._play('kill_heli')) return;
      this.tone(420, 0.9, 'sawtooth', 0.25, -360); this.noise(0.4, 600, 0.4);
    } else if (type === 'jet') {
      if (this._play('kill_jet')) return;
      this.noise(0.6, 1500, 0.45); this.tone(600, 0.6, 'sawtooth', 0.2, -480);
    }
  }

  // ============ Music (looping background track) ============
  // Tries the candidate paths in order. First one that loads is decoded into
  // an AudioBuffer and stored. Subsequent calls reuse the buffer.
  async loadMusic(paths = ['assets/music.mp3', 'assets/music.ogg', 'assets/music.wav']) {
    if (!this.ctx || this.musicBuffer) return !!this.musicBuffer;
    for (const url of paths) {
      try {
        const arr = await cachedFetch(url);
        this.musicBuffer = await new Promise((resolve, reject) => {
          this.ctx.decodeAudioData(arr, resolve, reject);
        });
        this._musicPath = url;
        return true;
      } catch (e) { /* try next */ }
    }
    return false;
  }

  // Start looping the background track. If no file was found, falls back to
  // a procedural ambient drone so there's always something playing.
  async startMusic(volume = 0.3) {
    if (!this.ctx) return;
    this._ambOff = false;
    if (this.musicSource || this._procRunning) return;
    if (!this.musicBuffer) await this.loadMusic();
    if (this.musicBuffer) {
      const t = this._now();
      const src = this.ctx.createBufferSource();
      src.buffer = this.musicBuffer;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(volume, t + 1.0);
      src.connect(g); g.connect(this.master);
      src.start(t);
      this.musicSource = src;
      this.musicGain = g;
    } else {
      this._startProceduralMusic(volume);
    }
  }

  stopMusic() {
    const t = this._now ? this._now() : 0;
    this._ambOff = true;
    if (this._amb && this.ctx) this._setAmbience(0, 0, 0);
    if (this.musicGain && this.ctx) {
      try {
        this.musicGain.gain.cancelScheduledValues(t);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
      } catch (e) {}
    }
    if (this.musicSource) {
      const src = this.musicSource;
      this.musicSource = null;
      setTimeout(() => { try { src.stop(); src.disconnect(); } catch (e) {} }, 600);
    }
    if (this._procStop) { this._procStop(); this._procStop = null; this._procRunning = false; }
  }

  // ====== Procedural fallback: layered drone + slow chord progression ======
  // Three sine voices building a slow Dm chord with an LFO-modulated low pad.
  _startProceduralMusic(volume = 0.18) {
    if (!this.ctx) return;
    const t = this._now();
    const masterG = this.ctx.createGain();
    masterG.gain.setValueAtTime(0.0001, t);
    masterG.gain.linearRampToValueAtTime(volume, t + 2.0);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    masterG.connect(this.master);
    lp.connect(masterG);

    // Bass drone with subtle pitch-LFO
    const bass = this.ctx.createOscillator();
    bass.type = 'sine'; bass.frequency.value = 73.42;            // D2
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.18;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain).connect(bass.frequency);
    bass.connect(lp);

    // Mid pad
    const pad = this.ctx.createOscillator();
    pad.type = 'triangle'; pad.frequency.value = 110;            // A2
    const padG = this.ctx.createGain(); padG.gain.value = 0.4;
    pad.connect(padG).connect(lp);

    // High shimmer (very quiet)
    const shimmer = this.ctx.createOscillator();
    shimmer.type = 'sine'; shimmer.frequency.value = 587.33;     // D5
    const shG = this.ctx.createGain(); shG.gain.value = 0.06;
    shimmer.connect(shG).connect(lp);

    bass.start(t); lfo.start(t); pad.start(t); shimmer.start(t);

    this.musicGain = masterG;
    this._procRunning = true;
    this._procStop = () => {
      const tt = this._now();
      try {
        masterG.gain.cancelScheduledValues(tt);
        masterG.gain.linearRampToValueAtTime(0.0001, tt + 0.6);
      } catch (e) {}
      setTimeout(() => {
        try { bass.stop(); pad.stop(); shimmer.stop(); lfo.stop(); } catch (e) {}
        try { masterG.disconnect(); lp.disconnect(); } catch (e) {}
      }, 700);
    };
  }
}

export default new Audio();
