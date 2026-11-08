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
  // Chicago lake / harbour water (OGG + M4A only, see M4A_SFX)
  water_step:      [4, 0.8,  2, 0.08, 0.08],
  water_splash:    [3, 0.9,  3, 0.10, 0.08],
  water_splash_sm: [2, 0.6,  4, 0.05, 0.12],
  boat_sink:       [2, 0.7,  2, 0.30, 0.05],
  loop_lapping:    [1, 1.0,  1, 0,    0],
};

// Exact loop lengths (samples at 44.1 kHz). Decoders that ignore the MP3
// encoder-delay header (older Safari) hand back 1105 samples of LAME priming
// up front plus tail padding, which would click/gap at the loop point; when
// the decoded buffer is longer than this, loop only the real content.
const LOOP_SAMPLES = { loop_heli: 185220, loop_tank: 194040, loop_city: 348390, loop_lapping: 0 };
const MP3_PRIMING = 1105;
const AAC_PRIMING = 1024;
// Newer SFX ship as OGG + AAC (.m4a) instead of OGG + MP3
const M4A_SFX = new Set(['water_step', 'water_splash', 'water_splash_sm', 'boat_sink', 'loop_lapping']);
// Water samples aren't generated yet: until they land in assets/sfx/ (then flip
// this) the water API plays its procedural fallbacks and nothing is fetched.
const WATER_SAMPLES = false;

// Kaijupalooza! stage music (Chicago level). One looping mono track per stage,
// keyed by the chicago_fest.js stage id; positional around the kaiju.
const STAGE_DIR = 'assets/music/stages/';
const STAGE_TRACKS = {
  monster_main: 'stage_monster_main', kaiju_stage: 'stage_kaiju_stage', tremor_tent: 'stage_tremor_tent',
  atomic_stage: 'stage_atomic_stage', stomp_stage: 'stage_stomp_stage', roar_grove: 'stage_roar_grove',
};
// Exact loop lengths (samples at 44.1 kHz), same padding guard as LOOP_SAMPLES.
// AAC (.m4a) priming is 1024 samples; Vorbis needs none.
const STAGE_LOOP_SAMPLES = {
  monster_main: 3051290, kaiju_stage: 2645876, tremor_tent: 2776133,
  atomic_stage: 2965302, stomp_stage: 2721569, roar_grove: 3044854,
};
const STAGE_NEAR = 14;          // full volume inside this (u, beyond the stage's half-size)
const STAGE_FAR = 80;           // silent beyond this (u); the main stage carries further
const STAGE_FAR_MAIN = 95;
const STAGE_GAIN = 0.8;

// Monster variant (monsters.js cfg.variant) -> per-kaiju SFX suffix
const KAIJU_SFX = { gojira: 'gorrak', ghidorah: 'tridon', mecha: 'mechra' };

// Called every frame by the stage mix and the water beds: an AudioParam only gets a new target
// when it moved by more than eps (each setTargetAtTime queues an automation
// event; an exponential approach to the same target is the same curve). Every
// writer of those params goes through here (eps 0 always writes), so the
// cached target is never stale.
function _aim(param, v, t, tc, eps) {
  if (eps > 0 && param._aim !== undefined && Math.abs(param._aim - v) <= eps) return;
  param._aim = v;
  param.setTargetAtTime(v, t, tc);
}

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
    this._stages = null;    // festStages array the stage voices belong to
    this._stageV = {};      // stage id -> { src, g, lp, pan } or { dead: true }
    this._stageBuf = {};    // stage id -> AudioBuffer | Promise | 'failed' (lazy)
    this._stageT = 0;
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
    // Background music goes through its own duck stage so festival stages can pull it down
    this.musicDuck = this.ctx.createGain();
    this.musicDuck.connect(this.master);
    this.stageBus = this.ctx.createGain();
    this.stageBus.connect(this.master);
    this.loadSfx();
    // Fade ambience loops out when updateAmbience() stops being called (pause, menus).
    setInterval(() => {
      if (this._amb && this.ctx && this._now() - this._ambT > 0.5) this._setAmbience(0, 0, 0);
      if (this.stageBus && this.ctx && this._now() - this._stageT > 0.5) this._fadeStages();
      if (this._shore && this.ctx && this._now() - this._shoreT > 0.5) _aim(this._shore.g.gain, 0, this._now(), 0.4, 0);
      if (this._wade && this.ctx && this._now() - this._wadeT > 0.5) _aim(this._wade.g.gain, 0, this._now(), 0.3, 0);
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
    const ogg = !!(probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"'));
    const exts = ogg ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
    const extsM4a = ogg ? ['ogg', 'm4a'] : ['m4a', 'ogg'];
    const jobs = [];
    for (const name of Object.keys(SFX)) {
      if (M4A_SFX.has(name) && !WATER_SAMPLES) continue;
      const n = SFX[name][0];
      for (let i = 0; i < n; i++) jobs.push([name, i, n > 1 ? `${name}_${i + 1}` : name]);
    }
    const worker = async () => {
      while (jobs.length) {
        const [name, i, base] = jobs.shift();
        for (const ext of M4A_SFX.has(name) ? extsM4a : exts) {
          try {
            const arr = await cachedFetch(SFX_DIR + base + '.' + ext);
            const buf = await new Promise((resolve, reject) => {
              this.ctx.decodeAudioData(arr, resolve, reject);
            });
            buf._ext = ext;
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

  // Called every frame: a gain only gets a new target when it moved by more
  // than 0.005 (each setTargetAtTime queues an automation event; an
  // exponential approach to the same target is the same curve anyway)
  _setAmbience(heli, tank, city) {
    const t = this._now();
    const a = this._amb;
    const set = (loop, v, tc) => {
      if (loop._target !== undefined && Math.abs(loop._target - v) <= 0.005) return;
      loop._target = v;
      loop.g.gain.setTargetAtTime(v, t, tc);
    };
    set(a.loop_heli, heli, 0.35);
    set(a.loop_tank, tank, 0.35);
    set(a.loop_city, city, 0.8);
  }

  // ============ Water (Chicago lake / harbour) ============
  // Wading step in place of footstep(); depth01 0..1 scales weight and pitch
  waterStep(depth01 = 1, sprint = false) {
    const d = Math.max(0, Math.min(1, depth01));
    if (this._play('water_step', (0.55 + 0.45 * d) * (sprint ? 1.15 : 1), (1.08 - 0.12 * d) * (sprint ? 1.05 : 1))) return;
    this.noise(0.35, 900, 0.25 + 0.2 * d);
    this.tone(70, 0.25, 'sine', 0.3 * d, -25);
  }

  // Debris / impact / body into water. size 0..1: small plop .. heavy crash
  splash(size = 1) {
    const s = Math.max(0, Math.min(1, size));
    if (s < 0.45) { if (this._play('water_splash_sm', 0.6 + s, 1.1 - s * 0.2)) return; }
    else if (this._play('water_splash', 0.6 + 0.4 * s, 1.15 - 0.25 * s)) return;
    this.noise(0.25 + 0.6 * s, 1400, 0.25 + 0.3 * s);
  }

  // Gameplay impact hook. size 0.5..3 (beam/missile/stomp/ult/debris/collapse/boat)
  waterSplash(size = 1, kind = '') {
    if (kind === 'boat') { this.boatSink(); this.splash(0.3); return; }
    const big = kind === 'ult' || kind === 'collapse' || kind === 'stomp' || size >= 1.2;
    this.splash(big ? Math.min(1, 0.55 + (size - 1) * 0.25) : Math.min(0.44, size * 0.4));
  }

  // A boat swamped / going under
  boatSink() {
    if (this._play('boat_sink')) return;
    this.noise(1.0, 500, 0.3);
    this.tone(160, 0.8, 'sine', 0.15, -110);
  }

  // Quiet wash around the legs while the kaiju stands / wades in water.
  // Called every frame: just sets a gain target (lapping loop, slowed and darkened).
  waterWade(on, depth01 = 1) {
    if (!this.ctx) return;
    const t = this._now();
    const target = on && !this._ambOff ? 0.25 + 0.35 * Math.max(0, Math.min(1, depth01)) : 0;
    if (!this._wade) {
      const bank = this.sfx.loop_lapping;
      if (!target || !bank || !bank[0]) return;
      const src = this.ctx.createBufferSource();
      src.buffer = bank[0];
      src.loop = true;
      src.playbackRate.value = 0.8;
      this._setLoopPoints(src, LOOP_SAMPLES.loop_lapping);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(0, src.loopStart + (t % 5));
      this._wade = { src, g };
    }
    this._wadeT = t;
    _aim(this._wade.g.gain, target, t, 0.3, 0.002);
  }

  // Shore lapping bed. Call once per frame with the kaiju's distance to the
  // shoreline (world units), or null away from water / on levels without it.
  updateShore(dist) {
    if (!this.ctx) return;
    const t = this._now();
    let target = 0;
    if (dist != null && !this._ambOff) target = 0.55 * Math.max(0, Math.min(1, (45 - dist) / 30));
    if (!this._shore) {
      if (!target || !this.sfx.loop_lapping || !this.sfx.loop_lapping[0]) return;
      const buf = this.sfx.loop_lapping[0];
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      this._setLoopPoints(src, LOOP_SAMPLES.loop_lapping);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g); g.connect(this.master);
      src.start(0, src.loopStart);
      this._shore = { src, g };
    }
    this._shoreT = t;
    _aim(this._shore.g.gain, target, t, 0.6, 0.002);
  }

  // Trim codec padding at a loop point: any extra decoded length is padding;
  // decoders that ignore the encoder-delay info also keep the priming up front.
  _setLoopPoints(src, samples) {
    const len = samples / 44100, extra = src.buffer.duration - len;
    if (!samples || extra <= 0.0005) return;
    const prime = src.buffer._ext === 'm4a' ? AAC_PRIMING : src.buffer._ext === 'mp3' ? MP3_PRIMING : 0;
    src.loopStart = prime && extra >= (prime - 8) / 44100 ? prime / 44100 : 0;
    src.loopEnd = src.loopStart + len;
  }

  // ============ Kaijupalooza! stage music ============
  // Call once per frame with world.festStages (null outside the festival),
  // the kaiju position (the listener) and the camera (for left/right pan).
  // Tracks load lazily the first time a stage is in earshot, and only after a
  // user gesture (there's no AudioContext before init()). Volume falls off
  // with distance and highs roll off far away; phones run the 3 nearest stages.
  updateStages(stages, kpos, camera) {
    if (!this.ctx) return;
    if (stages !== this._stages) { this._stopStages(); this._stages = stages; }
    if (!stages || !kpos || this._ambOff) return;
    const t = this._now();
    this._stageT = t;
    const phone = this._isPhone();
    const maxVoices = phone ? 3 : 6;
    // camera right vector on the ground plane, for panning
    let rx = 1, rz = 0;
    if (camera) {
      const e = camera.matrixWorld.elements;
      const l = Math.hypot(e[0], e[2]) || 1;
      rx = e[0] / l; rz = e[2] / l;
    }

    const ranked = [];
    for (const st of stages) {
      if (!STAGE_TRACKS[st.id]) continue;
      const d = Math.hypot(st.x - kpos.x, st.z - kpos.z);
      const near = STAGE_NEAR + Math.max(st.w || 0, st.d || 0) / 2;
      const far = st.tier === 'main' ? STAGE_FAR_MAIN : STAGE_FAR;
      const k = Math.max(0, Math.min(1, (far - d) / (far - near)));
      ranked.push({ st, d, k });
    }
    ranked.sort((a, b) => a.d - b.d);
    let loudest = 0, live = 0;
    for (let j = 0; j < ranked.length; j++) {
      const { st, d, k } = ranked[j];
      const id = st.id;
      const v = this._stageV[id];
      if (st.destroyed) { if (!v || !v.dead) this._killStage(id); continue; }
      if (v && v.dead) continue;  // stage fell: stays silent
      const i = live++;           // rank among standing stages
      if (i >= maxVoices || k <= 0) {
        if (v) this._dropStage(id);
        if (phone && i >= maxVoices && this._stageBuf[id] instanceof AudioBuffer) delete this._stageBuf[id]; // free decoded RAM
        continue;
      }
      const buf = this._stageBuf[id];
      if (!buf) { this._loadStage(id); continue; }
      if (!(buf instanceof AudioBuffer)) continue;   // decoding, or failed
      const voice = v || this._startStage(id, buf);
      // PA faces the crowd (stage front = local +Z): about -4 dB behind the stage
      const front = d > 1 ? ((kpos.x - st.x) * Math.sin(st.rot || 0) + (kpos.z - st.z) * Math.cos(st.rot || 0)) / d : 1;
      const g = k * k * (0.8 + 0.2 * front);
      _aim(voice.g.gain, g * STAGE_GAIN, t, 0.25, 0.002);
      _aim(voice.lp.frequency, 1200 + 17000 * g, t, 0.25, 20);
      if (voice.pan) {
        const dx = (st.x - kpos.x) / (d || 1), dz = (st.z - kpos.z) / (d || 1);
        _aim(voice.pan.pan, (dx * rx + dz * rz) * 0.8 * Math.min(1, d / 20), t, 0.15, 0.005);
      }
      loudest = Math.max(loudest, g);
    }
    _aim(this.stageBus.gain, 1, t, 0.3, 0.002);
    // standing in front of a stage pulls the background score down
    _aim(this.musicDuck.gain, 1 - 0.75 * loudest, t, 0.5, 0.002);
  }

  _isPhone() {
    if (this._phone === undefined) {
      this._phone = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0);
    }
    return this._phone;
  }

  // OGG Vorbis where supported, AAC (.m4a) otherwise (iOS Safari)
  _loadStage(id) {
    if (this._stageBuf[id]) return;
    const probe = document.createElement('audio');
    const exts = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'm4a'] : ['m4a', 'ogg'];
    this._stageBuf[id] = (async () => {
      for (const ext of exts) {
        try {
          const arr = await cachedFetch(STAGE_DIR + STAGE_TRACKS[id] + '.' + ext);
          const buf = await new Promise((resolve, reject) => { this.ctx.decodeAudioData(arr, resolve, reject); });
          buf._ext = ext;
          if (this._stageBuf[id] instanceof Promise) this._stageBuf[id] = buf; // not evicted / destroyed meanwhile
          return;
        } catch (e) { /* try next format */ }
      }
      this._stageBuf[id] = 'failed';
    })();
  }

  _startStage(id, buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const len = (STAGE_LOOP_SAMPLES[id] || 0) / 44100;
    // Any extra length is codec padding: AAC decoders that ignore the edit list
    // add 1024 priming samples up front; every AAC decoder may add <1024 at the end.
    const extra = buf.duration - len;
    if (len && extra > 0.0005) {
      src.loopStart = buf._ext === 'm4a' && extra >= (AAC_PRIMING - 8) / 44100 ? AAC_PRIMING / 44100 : 0;
      src.loopEnd = src.loopStart + len;
    }
    const loopLen = (src.loopEnd || buf.duration) - src.loopStart;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    src.connect(lp); lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.stageBus); } else g.connect(this.stageBus);
    // the show keeps going while you're away: resume at the "live" position
    src.start(0, src.loopStart + (this._now() % loopLen));
    return (this._stageV[id] = { src, g, lp, pan });
  }

  _dropStage(id) {
    const v = this._stageV[id];
    delete this._stageV[id];
    if (!v || !v.src) return;
    const t = this._now();
    v.g.gain.setTargetAtTime(0, t, 0.2);
    v.src.onended = () => { try { v.src.disconnect(); v.lp.disconnect(); v.g.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) {} };
    try { v.src.stop(t + 1.0); } catch (e) {}
  }

  // Stage destroyed: the PA dies (tape-stop pitch drop + fade), then silence for good
  _killStage(id) {
    const v = this._stageV[id];
    if (v && v.src) {
      const t = this._now();
      v.src.playbackRate.setValueAtTime(1, t);
      v.src.playbackRate.linearRampToValueAtTime(0.25, t + 0.9);
      v.g.gain.setTargetAtTime(0, t + 0.3, 0.25);
      v.src.onended = () => { try { v.src.disconnect(); v.lp.disconnect(); v.g.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) {} };
      try { v.src.stop(t + 1.6); } catch (e) {}
    }
    this._stageV[id] = { dead: true };
    delete this._stageBuf[id];
  }

  _fadeStages() {
    const t = this._now();
    _aim(this.stageBus.gain, 0, t, 0.25, 0);
    _aim(this.musicDuck.gain, 1, t, 0.5, 0);
  }

  _stopStages() {
    for (const id of Object.keys(this._stageV)) this._dropStage(id);
    this._stageV = {};
    if (this.musicDuck) _aim(this.musicDuck.gain, 1, this._now(), 0.5, 0);
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

  // inWater (optional, 0..1 or true): the step lands in water -> wading splash
  footstep(inWater) {
    if (inWater) { this.waterStep(inWater === true ? 1 : inWater); return; }
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
      src.connect(g); g.connect(this.musicDuck);
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
    if (this.ctx) this._fadeStages();
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
    masterG.connect(this.musicDuck);
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
