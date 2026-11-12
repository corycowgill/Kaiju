// Sound effects via the Web Audio API.
// Sampled SFX (assets/sfx/) are
// preloaded on init() and played with random variation picks, slight pitch
// jitter and per-sound voice/cooldown limits. Until a sample has decoded (or if
// it fails to load) every sound falls back to the original procedural synth.

import { cachedFetch } from './assetCache.js';

const SFX_DIR = 'assets/sfx/';

// name: [variations, gain, maxVoices, cooldown (s), rate jitter (+/-)]
// variations > 1 load as name_1..name_N, otherwise just name.
const SFX = {
  explosion_small: [2, 0.83, 4, 0.06, 0.06],
  explosion_big:   [2, 1.0,  3, 0.10, 0.05],
  hit:             [2, 0.60, 3, 0.05, 0.05],
  shell_hit:       [2, 0.77, 3, 0.06, 0.06],
  beam_gorrak:     [2, 1.0,  1, 0.30, 0.03],
  beam_tridon:     [2, 1.0,  1, 0.30, 0.03],
  beam_mechra:     [2, 1.0,  1, 0.30, 0.03],
  roar_gorrak:     [2, 1.0,  1, 0.40, 0.04],
  roar_tridon:     [2, 1.0,  1, 0.40, 0.04],
  roar_mechra:     [2, 1.0,  1, 0.40, 0.04],
  charge_gorrak:   [2, 0.9,  2, 0.10, 0.06],
  charge_tridon:   [2, 0.9,  2, 0.10, 0.06],
  charge_mechra:   [2, 0.9,  2, 0.10, 0.06],
  stomp:           [2, 0.96, 2, 0.12, 0.05],
  melee_punch:     [2, 0.88, 2, 0.08, 0.06],
  melee_dropkick:  [2, 1.0,  2, 0.12, 0.05],
  melee_slam:      [2, 1.1,  2, 0.16, 0.04],
  energy_impact:   [2, 0.95, 2, 0.12, 0.05],
  footstep:        [4, 0.75, 2, 0.08, 0.10],
  ult:             [2, 1.0,  1, 0.50, 0.03],
  shoot_tank:      [3, 0.9,  3, 0.08, 0.05],
  shoot_rifle:     [3, 0.66, 4, 0.05, 0.06],
  shoot_heli:      [3, 0.72, 3, 0.07, 0.05],
  shoot_jet:       [3, 0.76, 3, 0.08, 0.05],
  shoot_mech:      [3, 0.83, 3, 0.08, 0.05],
  shoot_boss:      [3, 1.0,  2, 0.10, 0.04],
  pickup_hp:       [1, 0.8,  2, 0.05, 0.02],
  pickup_rage:     [1, 0.8,  2, 0.05, 0.02],
  pickup_score:    [1, 0.8,  2, 0.05, 0.02],
  alarm:           [1, 0.7,  1, 0.50, 0.0],
  wave_start:      [1, 0.8,  1, 0.50, 0.0],
  wave_clear:      [1, 0.8,  1, 0.50, 0.0],
  game_over:       [1, 0.9,  1, 1.00, 0.0],
  boss_spawn:      [1, 1.0,  1, 1.00, 0.0],
  collapse:        [2, 0.96, 3, 0.18, 0.05],
  glass:           [2, 0.6,  3, 0.10, 0.10],
  car_crush:       [2, 0.78, 3, 0.10, 0.06],
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
  atomic_blast:    [2, 1.07, 1, 1.00, 0.03],
  atomic_charge:   [2, 0.80, 1, 0.30, 0],
};

// New paths also bypass stale IndexedDB copies of the old samples.
const COMBAT_SFX = new Set([
  'shoot_rifle', 'shoot_heli', 'shoot_jet', 'shoot_tank', 'shoot_mech', 'shoot_boss',
  'hit', 'shell_hit', 'melee_punch', 'melee_dropkick', 'melee_slam', 'stomp',
  'beam_gorrak', 'beam_tridon', 'beam_mechra', 'energy_impact', 'atomic_charge',
  'explosion_small', 'explosion_big', 'atomic_blast', 'collapse', 'car_crush',
]);

// Exact loop lengths (samples at 44.1 kHz). Decoders that ignore the MP3
// encoder-delay header (older Safari) hand back 1105 samples of LAME priming
// up front plus tail padding, which would click/gap at the loop point; when
// the decoded buffer is longer than this, loop only the real content.
const LOOP_SAMPLES = { loop_heli: 185220, loop_tank: 194040, loop_city: 348390, loop_lapping: 392490 };
const MP3_PRIMING = 1105;
const AAC_PRIMING = 1024;
// Newer SFX ship as OGG + AAC (.m4a) instead of OGG + MP3
const M4A_SFX = new Set(['water_step', 'water_splash', 'water_splash_sm', 'boat_sink', 'loop_lapping']);
// Water samples (assets/sfx/water_*, boat_sink_*, loop_lapping). With this off
// the water API plays its procedural fallbacks and nothing is fetched.
const WATER_SAMPLES = true;

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

// Monster variant (monsters.js cfg.variant) or monster key -> per-kaiju SFX suffix
// Takes the compressor node's built-in make-up gain back out (see _buildMatchMix)
const LIMIT_TRIM = 0.7807; // -2.15 dB, measured in Chrome (devtools/audio limiter render) for the settings below
const KAIJU_SFX = { gojira: 'gorrak', ghidorah: 'tridon', mecha: 'mechra', godzilla: 'gorrak', gorrak: 'gorrak', tridon: 'tridon', mechra: 'mechra' };

// ---- Wrestling pack (Chicago title match). Synthesized offline by tools/wrestling_sfx/
// (OGG + M4A), fetched only when a match starts, played through the match mix below.
// name: [variations, gain, maxVoices, cooldown (s), rate jitter (+/-)]
const WR = {
  wr_sub:           [3, 1.0,  1, 0.09, 0.03],   // the ONLY low end of an impact; one voice, newest wins (WR_CHOKE)
  wr_slam:          [3, 1.0,  2, 0.12, 0.06],
  wr_body:          [3, 0.9,  3, 0.06, 0.08],
  wr_strike_l:      [4, 0.85, 3, 0.05, 0.09],
  wr_strike_h:      [3, 1.0,  2, 0.08, 0.07],
  wr_block:         [2, 0.9,  2, 0.06, 0.06],
  wr_reversal:      [2, 1.0,  1, 0.25, 0.03],
  wr_whoosh:        [2, 0.8,  2, 0.10, 0.10],
  wr_dive:          [1, 0.9,  1, 0.30, 0],      // ends on the hit: no jitter
  wr_rope_stretch:  [1, 0.8,  1, 0.20, 0.08],
  wr_rope_twang:    [2, 1.0,  2, 0.15, 0.05],
  wr_rope_snap:     [1, 1.0,  1, 0.40, 0.04],
  wr_post:          [2, 0.9,  2, 0.12, 0.04],
  wr_crash:         [2, 1.0,  2, 0.12, 0.07],
  wr_dizzy:         [1, 0.7,  1, 0.80, 0.04],
  wr_bell:          [1, 0.9,  4, 0.12, 0],
  wr_ui_callout:    [1, 0.8,  1, 0.15, 0.03],
  wr_ui_big:        [1, 0.9,  1, 0.30, 0.02],
  wr_ui_prompt:     [1, 0.8,  1, 0.12, 0],
  wr_slow_in:       [1, 0.8,  1, 0.40, 0],
  wr_slow_out:      [1, 0.7,  1, 0.40, 0],
  wr_fin_start:     [1, 1.0,  1, 1.00, 0],
  wr_fin_riser:     [1, 0.9,  1, 1.00, 0],
  wr_fin_apex:      [1, 0.9,  1, 0.50, 0],
  wr_fin_impact:    [1, 1.0,  1, 1.00, 0],
  wr_loop_crowd_lo: [1, 1.0,  1, 0,    0],
  wr_loop_crowd_hi: [1, 1.0,  1, 0,    0],
  wr_loop_chant:    [1, 1.0,  1, 0,    0],
  wr_crowd_pop:     [3, 0.9,  2, 0.45, 0.04],
  wr_crowd_ooh:     [2, 0.9,  1, 0.50, 0.04],
  wr_crowd_gasp:    [2, 0.9,  1, 0.50, 0.03],
  wr_crowd_boo:     [2, 0.85, 1, 1.20, 0.04],
  wr_crowd_count:   [3, 1.0,  2, 0.20, 0],      // variation = the number: played by index, never at random
  wr_crowd_roar:    [1, 1.0,  1, 3.00, 0],
};
// Decode order: what the opening bell and the first exchange need comes first
const WR_FIRST = ['wr_bell', 'wr_loop_crowd_lo', 'wr_loop_crowd_hi', 'wr_strike_l', 'wr_sub', 'wr_slam', 'wr_body', 'wr_crowd_pop', 'wr_strike_h', 'wr_block'];
const WR_LOOP_SAMPLES = { wr_loop_crowd_lo: 441000, wr_loop_crowd_hi: 441000, wr_loop_chant: 176400 };
// A new voice of these fades out the one already playing instead of being dropped
const WR_CHOKE = { wr_sub: 1, wr_dizzy: 1, wr_fin_riser: 1 };
// While one of these speaks, everything under it gives up its low end (sub side-chain): [dip dB, hold s]
const WR_SUB_DUCK = { wr_sub: [-9, 0.22], wr_fin_impact: [-12, 0.9], wr_fin_start: [-8, 0.5] };
const WR_THEME_DIR = 'assets/music/';
// Kaiju vocal efforts, cut from samples the bank already has (the roars for the two
// animals, the boss power-up for the machine): kind -> [sample, variation, offset s,
// length s of sample, rate at start, rate at end, gain]. A falling rate is a yelp or a
// moan; a low steady one is a strain.
const VOX = {
  gorrak: {
    effort: [['roar_gorrak', 0, 0.38, 0.32, 0.92, 0.84, 0.75], ['roar_gorrak', 1, 0.45, 0.35, 0.9, 0.82, 0.75]],
    pain:   [['roar_gorrak', 1, 0.70, 0.42, 1.24, 0.96, 0.8], ['roar_gorrak', 0, 0.55, 0.36, 1.2, 0.95, 0.8]],
    strain: [['roar_gorrak', 0, 0.10, 0.80, 0.72, 0.76, 0.55], ['roar_gorrak', 1, 0.20, 0.85, 0.7, 0.75, 0.55]],
    ko:     [['roar_gorrak', 1, 0.50, 1.40, 1.0, 0.58, 0.9]],
  },
  tridon: {
    effort: [['roar_tridon', 0, 0.15, 0.30, 0.9, 0.82, 0.75], ['roar_tridon', 0, 0.42, 0.30, 0.88, 0.8, 0.75]],
    pain:   [['roar_tridon', 1, 0.35, 0.38, 1.18, 0.92, 0.75], ['roar_tridon', 1, 0.70, 0.36, 1.22, 0.95, 0.75]],
    strain: [['roar_tridon', 0, 0.10, 0.80, 0.74, 0.78, 0.55], ['roar_tridon', 1, 0.95, 0.80, 0.7, 0.74, 0.5]],
    ko:     [['roar_tridon', 1, 0.90, 1.30, 1.0, 0.6, 0.9]],
  },
  mechra: {
    effort: [['boss_spawn', 0, 0.38, 0.36, 1.15, 1.05, 0.7], ['boss_spawn', 0, 0.60, 0.32, 1.2, 1.08, 0.7]],
    pain:   [['boss_windup', 0, 0.50, 0.36, 1.35, 0.9, 0.9], ['boss_windup', 1, 0.48, 0.36, 1.3, 0.85, 0.9]],
    strain: [['boss_spawn', 0, 0.10, 0.85, 0.85, 0.95, 0.5]],
    ko:     [['boss_spawn', 0, 0.90, 1.50, 1.0, 0.52, 0.8]],
  },
};

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
    this.sfxOut = null;     // where one-shots go: master, or the match mix's classic bus during a match
    this.wrSfx = {};        // wrestling pack: name -> [AudioBuffer]
    this._wrTheme = {};     // kaiju -> AudioBuffer | Promise | 'failed'
    this._mm = null;        // match mix nodes + state (built on the first match)
    this._wrV = [];         // wrestling voice pool (fixed slots, see _wrSlot)
    for (let i = 0; i < 28; i++) this._wrV.push({ src: null, g: null, end: 0, prio: 9, name: '' });
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
    this.sfxOut = this.master;
    // Keep coincident cannon reports, debris and slam tails from overloading the mix.
    this.combatBus = this.ctx.createDynamicsCompressor();
    this.combatBus.threshold.value = -10;
    this.combatBus.knee.value = 8;
    this.combatBus.ratio.value = 6;
    this.combatBus.attack.value = 0.002;
    this.combatBus.release.value = 0.13;
    this.combatBus.connect(this.master);
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
      if (this._mm && this._mm.beds && this._now() - this._mm.bedT > 0.5) this._wrBedSilence();
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
    for (const name of [...COMBAT_SFX, ...Object.keys(SFX).filter(key => !COMBAT_SFX.has(key))]) {
      if (M4A_SFX.has(name) && !WATER_SAMPLES) continue;
      const n = SFX[name][0];
      for (let i = 0; i < n; i++) jobs.push([name, i, n > 1 ? `${name}_${i + 1}` : name]);
    }
    const worker = async () => {
      while (jobs.length) {
        const [name, i, base] = jobs.shift();
        for (const ext of M4A_SFX.has(name) ? extsM4a : exts) {
          try {
            const dir = COMBAT_SFX.has(name) ? SFX_DIR + 'combat-v1/' : SFX_DIR;
            const arr = await cachedFetch(dir + base + '.' + ext);
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
  _play(name, gain = 1, rate = 1, when = 0, remote = false) {
    const bank = this.sfx[name];
    if (!this.ctx || !bank) return false;
    const bufs = bank.filter(Boolean);
    if (!bufs.length) return false;
    if (this.muted) return true;
    const [, baseGain, maxVoices, cooldown, jitter] = SFX[name];
    // Enemy gunfire cannot take a slot or reset the cooldown of the player's own weapon.
    const key = remote ? name + ':remote' : name;
    const t = this._now();
    const at = t + when;  // cooldown is measured between scheduled start times
    if (Math.abs(at - (this._lastPlay[key] ?? -1e9)) < cooldown) return true;
    const voices = (this._voices[key] || []).filter(v => v.end > t);
    this._voices[key] = voices;
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
    // (combat samples go through the compressor; the rest to wherever one-shots go: master, or the match mix)
    src.connect(g); g.connect(COMBAT_SFX.has(name) ? this.combatBus : this.sfxOut);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    src.start(at);
    this._lastPlay[key] = at;
    voices.push({ src, end: at + src.buffer.duration / r });
    return true;
  }

  // A short noise-only report if a combat sample hasn't decoded yet.
  _combatFallback(name, dur, cutoff, gain, remote = false) {
    if (!this.ctx || this.muted) return;
    const key = remote ? name + ':remote' : name;
    const now = this._now();
    if (now - (this._lastPlay[key] ?? -Infinity) < SFX[name][3]) return;
    this._lastPlay[key] = now;
    this.noise(dur, cutoff, gain, this.combatBus);
  }

  // Kaiju-specific sample name, e.g. beam -> beam_tridon. who (optional): a monster key
  // or variant ('godzilla' / 'gojira', 'ghidorah', 'mecha'); omitted = the player's kaiju.
  _k(kind, who) { return kind + '_' + (who ? KAIJU_SFX[who] || this._kaiju : this._kaiju); }

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
    this._setAmbience(Math.min(1, heli * 1.2) * 0.9, Math.min(1, tank * 0.9) * 0.7, this._mm && this._mm.on ? 0.2 : 0.5);
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
    osc.connect(g); g.connect(this.sfxOut);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // White noise burst with low-pass colour
  noise(dur, filterFreq = 600, vol = 0.6, bus = null) {
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
    src.connect(filter); filter.connect(g); g.connect(bus || this.sfxOut);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ----- Game sounds -----
  explosion(scale = 1.0) {
    const big = scale >= 1.3;
    const gain = Math.min(1.2, 0.55 + scale * 0.35);
    const rate = Math.max(0.8, Math.min(1.15, 1.15 - (scale - 0.5) * 0.12));
    const name = big ? 'explosion_big' : 'explosion_small';
    if (this._play(name, gain, rate)) return;
    this._combatFallback(name, big ? .55 : .30, big ? 430 : 850, gain * .65);
  }

  hit() {
    if (this._play('hit')) return;
    this._combatFallback('hit', .09, 1600, .37);
  }

  shellHit() {
    if (this._play('shell_hit')) return;
    this._combatFallback('shell_hit', .16, 1800, .55);
  }

  // beam / roar / charge / ult take the kaiju explicitly (who: monster key or variant) so
  // two kaiju can each have their own voice; without it they are the player's, as before.
  beam(who) {
    if (this._play(this._k('beam', who))) return;
    this._combatFallback(this._k('beam', who), .45, 950, .66);
  }

  energyImpact() {
    if (this._play('energy_impact')) return;
    this._combatFallback('energy_impact', .35, 620, .64);
  }

  roar(who) {
    if (this._play(this._k('roar', who))) return;
    this.tone(60, 0.7, 'sawtooth', 0.6, 60);
    this.tone(110, 0.7, 'square', 0.4, 30);
    this.noise(0.5, 700, 0.45);
  }

  charge(who) {
    if (this._play(this._k('charge', who))) return;
    this.tone(180, 0.35, 'sawtooth', 0.55, 180);
    this.noise(0.3, 500, 0.4);
  }

  meleeImpact(kind, strength = 1) {
    if (kind === 'stomp') { this.stomp(strength); return; }
    const name = kind === 'slam' ? 'melee_slam' : kind === 'kick' ? 'melee_dropkick' : 'melee_punch';
    const gain = Math.min(1.2, Math.max(.12, strength));
    if (this._play(name, gain)) return;
    this._combatFallback(name, kind === 'slam' ? .40 : .18, 550, .62 * gain);
  }

  stomp(strength = 1) {
    const gain = Math.min(1.2, Math.max(.12, strength));
    if (this._play('stomp', gain)) return;
    this._combatFallback('stomp', .30, 440, .62 * gain);
  }

  // inWater (optional, 0..1 or true): the step lands in water -> wading splash
  footstep(inWater) {
    if (inWater) { this.waterStep(inWater === true ? 1 : inWater); return; }
    if (this._play('footstep')) return;
    this.noise(0.1, 220, 0.18);
  }

  ult(who) {
    if (this._play('ult')) {
      this._play(this._k('roar', who), 0.6, 0.9, 0.15); // monster cry layered on the blast
      return;
    }
    this.tone(80, 1.2, 'sawtooth', 0.6, 40);
    this.tone(160, 1.2, 'square', 0.4, -60);
    this.tone(320, 1.0, 'sine', 0.35, 200);
    this.noise(1.2, 900, 0.55);
  }

  shoot(type = 'tank', distance) {
    const remote = distance !== undefined;
    const offset = remote ? Math.max(0, distance - 12) / 48 : 0;
    const gain = remote ? .83 / (1 + offset * offset) : 1;
    if (gain < .035) return;
    const cue = 'shoot_' + type;
    const name = COMBAT_SFX.has(cue) ? cue : 'shoot_tank';
    if (this._play(name, gain, 1, 0, remote)) {
      if (type === 'jet' && gain > .15) this._play('jet_flyby', gain);
      return;
    }
    const light = type === 'rifle' || type === 'heli';
    this._combatFallback(name, light ? .095 : .23, light ? 2900 : 760, gain * .65, remote);
  }

  reloadPhase(phase) {
    // Short mechanism sounds are driven by animation time, not timeout jobs.
    if(phase==='release'){this.noise(.045,1600,.045);this.tone(260,.025,'triangle',.035);}
    if(phase==='seat'){this.noise(.06,1100,.07);this.tone(180,.04,'triangle',.045);}
    if(phase==='bolt'){this.noise(.085,2400,.065);this.tone(390,.035,'triangle',.035,-130);}
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
    if (this._mm && this._mm.on && this._mm.won) return; // a won title match ends on its own fanfare
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

  // Gorrak atomic breath: quiet buildup, then the separate release and impact cues.
  atomicCharge() {
    if (this._play('atomic_charge')) return;
    this._combatFallback('atomic_charge', .38, 280, .22);
  }

  atomicBlast(size = 1) {
    const s = Math.max(0.3, Math.min(1.5, size));
    if (this._play('atomic_blast', 0.7 + 0.3 * s, 1.06 - 0.06 * s)) return;
    this._combatFallback('atomic_blast', .70, 550, .76);
  }

  // Building destroyed: concrete collapse, sometimes with a glass shatter on top
  collapse() {
    if (this._play('collapse')) {
      if (Math.random() < 0.6) this._play('glass', 1, 1, 0.05 + Math.random() * 0.2);
      return;
    }
    this._combatFallback('collapse', .82, 490, .61);
  }

  carCrush() {
    if (this._play('car_crush')) return;
    this._combatFallback('car_crush', .19, 1700, .51);
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


  // ============ Wrestling match mix (Chicago title match) ============
  // Nothing here exists until matchBegin(); matchEnd() puts the graph back exactly as
  // init() built it, so the classic game is untouched outside a match.
  //
  //   classic one-shots (sfxOut) -+
  //   music (musicDuck) -> music -+-> shelf (sub side-chain) -> lp (slow-mo) -> bedDuck -+
  //   crowd beds / reactions -----+                                                      +-> master
  //   wrestling impacts, kaiju voices (fx) ----------------------------------------------+     |
  //   bell, stings, themes (ui) ---------------------------------------------------------+     |
  //   master -> limiter (compressor -> make-up trim -> soft clip) -> destination <-------------+
  _buildMatchMix() {
    const c = this.ctx, mm = { on: false, won: null, maxVoices: 24, wide: true, vars: 9, beds: null, bedT: 0, chant: null, theme: null, loading: false };
    const gain = () => c.createGain();
    mm.pre = gain(); mm.fx = gain(); mm.ui = gain(); mm.crowd = gain(); mm.classic = gain(); mm.music = gain(); mm.bedDuck = gain();
    mm.shelf = c.createBiquadFilter(); mm.shelf.type = 'lowshelf'; mm.shelf.frequency.value = 140; mm.shelf.gain.value = 0;
    mm.lp = c.createBiquadFilter(); mm.lp.type = 'lowpass'; mm.lp.frequency.value = 20000; mm.lp.Q.value = 0.5;
    mm.crowdLp = c.createBiquadFilter(); mm.crowdLp.type = 'lowpass'; mm.crowdLp.frequency.value = 16000; mm.crowdLp.Q.value = 0.5;
    mm.crowd.connect(mm.crowdLp); mm.crowdLp.connect(mm.shelf);
    mm.classic.connect(mm.shelf); mm.music.connect(mm.shelf);
    mm.shelf.connect(mm.lp); mm.lp.connect(mm.bedDuck); mm.bedDuck.connect(mm.pre);
    mm.fx.connect(mm.pre); mm.ui.connect(mm.pre); mm.pre.connect(this.master);
    // Limiter for the worst pile-up (finisher + collapses + crowd roar): a fast compressor
    // does the work, a soft clip guarantees the ceiling. The compressor node adds its own
    // make-up gain (0 dBFS in -> its curve's output, to the power 0.6); `trim` takes that
    // back out so anything under the threshold leaves at exactly the level it came in.
    mm.comp = c.createDynamicsCompressor();
    mm.comp.threshold.value = -5; mm.comp.knee.value = 4; mm.comp.ratio.value = 20; mm.comp.attack.value = 0.003; mm.comp.release.value = 0.18;
    mm.trim = gain(); mm.trim.gain.value = LIMIT_TRIM;
    mm.clip = c.createWaveShaper();
    const n = 2049, curve = new Float32Array(n), T = 0.8, C = 0.98;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      curve[i] = a <= T ? x : Math.sign(x) * (T + (C - T) * Math.tanh((a - T) / (C - T)));
    }
    mm.clip.curve = curve;
    mm.comp.connect(mm.trim); mm.trim.connect(mm.clip); mm.clip.connect(c.destination);
    return mm;
  }

  // A match starts. o: { player, rival (monster keys), phone, low (phone LOW tier) }.
  // Safe to call again for the next match / a new rival (title defense).
  matchBegin(o) {
    if (!this.ctx) return;
    const mm = this._mm || (this._mm = this._buildMatchMix());
    const phone = !!(o && o.phone), low = !!(o && o.low);
    mm.maxVoices = low ? 10 : phone ? 14 : 24;
    mm.wide = !phone;
    mm.vars = phone ? 2 : 9;
    mm.won = null;
    const t = this._now();
    if (!mm.on) {
      mm.on = true;
      this.sfxOut = mm.classic;
      try { this.musicDuck.disconnect(); } catch (e) {}
      this.musicDuck.connect(mm.music);
      try { this.master.disconnect(); } catch (e) {}
      this.master.connect(mm.comp);
    }
    _aim(mm.music.gain, 1, t, 0.05, 0); _aim(mm.bedDuck.gain, 1, t, 0.05, 0);
    _aim(mm.lp.frequency, 20000, t, 0.05, 0); _aim(mm.crowdLp.frequency, 16000, t, 0.05, 0);
    mm.shelf.gain.cancelScheduledValues(t); mm.shelf.gain.setTargetAtTime(0, t, 0.05);
    this._loadWr();
    if (!low && o) { this._loadTheme(KAIJU_SFX[o.player]); this._loadTheme(KAIJU_SFX[o.rival]); }
  }

  // The match is over / torn down: stop everything the match owns, restore the classic graph.
  matchEnd() {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return;
    const t = this._now();
    for (let i = 0; i < this._wrV.length; i++) if (this._wrV[i].src) this._wrKill(this._wrV[i], t, 0.15);
    this._wrStopLoops(0.3);
    this.themeStop(0.3);
    mm.on = false; mm.won = null;
    this.sfxOut = this.master;
    try { this.musicDuck.disconnect(); } catch (e) {}
    this.musicDuck.connect(this.master);
    try { this.master.disconnect(); } catch (e) {}
    this.master.connect(this.ctx.destination);
    _aim(mm.music.gain, 1, t, 0.05, 0); _aim(mm.bedDuck.gain, 1, t, 0.05, 0); _aim(mm.lp.frequency, 20000, t, 0.05, 0);
  }

  // The result is in (true = the player won): decides whether game.js's gameOver() sting plays.
  matchResult(won) { if (this._mm) this._mm.won = !!won; }

  // Fetch + decode the wrestling pack (first match only; later calls top up missing clips).
  async _loadWr() {
    const mm = this._mm;
    if (!this.ctx || !mm || mm.loading) return;
    mm.loading = true;
    const probe = document.createElement('audio');
    const exts = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'm4a'] : ['m4a', 'ogg'];
    const names = WR_FIRST.concat(Object.keys(WR).filter((n) => !WR_FIRST.includes(n)));
    const jobs = [];
    // phones keep two takes of each sound (decoded RAM); the count shouts are never trimmed
    for (let pass = 0; pass < 2; pass++) for (const name of names) {
      const n = WR[name][0], keep = name === 'wr_crowd_count' ? n : Math.min(n, mm.vars);
      for (let i = pass ? 1 : 0; i < (pass ? keep : 1); i++) {
        if (!(this.wrSfx[name] && this.wrSfx[name][i])) jobs.push([name, i, n > 1 ? `${name}_${i + 1}` : name]);
      }
    }
    const worker = async () => {
      while (jobs.length) {
        const [name, i, base] = jobs.shift();
        for (const ext of exts) {
          try {
            const arr = await cachedFetch(SFX_DIR + base + '.' + ext);
            const buf = await new Promise((resolve, reject) => { this.ctx.decodeAudioData(arr, resolve, reject); });
            buf._ext = ext;
            (this.wrSfx[name] || (this.wrSfx[name] = []))[i] = buf;
            break;
          } catch (e) { /* try next format */ }
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    mm.loading = false;
  }

  _loadTheme(k) {
    if (!k || this._wrTheme[k]) return;
    const probe = document.createElement('audio');
    const exts = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'm4a'] : ['m4a', 'ogg'];
    this._wrTheme[k] = (async () => {
      for (const ext of exts) {
        try {
          const arr = await cachedFetch(WR_THEME_DIR + 'wr_theme_' + k + '.' + ext);
          this._wrTheme[k] = await new Promise((resolve, reject) => { this.ctx.decodeAudioData(arr, resolve, reject); });
          return;
        } catch (e) { /* try next format */ }
      }
      this._wrTheme[k] = 'failed';
    })();
  }

  // ---- voice pool: a fixed number of slots per tier (24 desktop / 14 phone / 10 phone LOW).
  // prio 0 = must play (bell, count, finisher), 1 = big impacts, 2 = crowd reactions,
  // 3 = strikes and voices, 4 = detail. A full pool gives a new sound the slot of the
  // least important voice below its own priority (30 ms fade); if there is none, the new
  // sound is the one that is dropped.
  _wrSlot(prio, t) {
    const V = this._wrV, n = this._mm.maxVoices;
    let worst = null;
    for (let i = 0; i < n; i++) {
      const v = V[i];
      if (!v.src || v.end <= t) return v;
      if (!worst || v.prio > worst.prio || (v.prio === worst.prio && v.end < worst.end)) worst = v;
    }
    if (!worst || worst.prio <= prio) return null;
    this._wrKill(worst, t, 0.03);
    return worst;
  }

  _wrKill(v, t, fade) {
    if (!v.src) return;
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setTargetAtTime(0, t, fade / 3);
      v.src.stop(t + fade + 0.02);
    } catch (e) {}
    v.src = null; v.end = 0;
  }

  // Start a buffer on a pool slot. bus 0 impacts / voices, 1 crowd, 2 ceremony + UI.
  // dur > 0 plays that much of the buffer from offset under a short envelope (vocal cuts);
  // rate1 glides the pitch over the clip.
  _wrStart(buf, name, gain, rate, at, pan, prio, offset, dur, bus, rate1) {
    const mm = this._mm, t = this._now(), c = this.ctx;
    const v = this._wrSlot(prio, t);
    if (!v) return true;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    const out = bus === 1 ? mm.crowd : bus === 2 ? mm.ui : mm.fx;
    let last = g;
    src.connect(g);
    if (pan && c.createStereoPanner) { last = c.createStereoPanner(); last.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(last); }
    last.connect(out);
    let len = (buf.duration - offset) / rate;
    if (dur > 0) {
      // vocal cut: 12 ms in, hold, ease out over the last third; the pitch glides rate -> rate1
      len = dur / ((rate + rate1) / 2);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.012);
      g.gain.setTargetAtTime(0, at + len * 0.62, len * 0.11);
      src.playbackRate.setValueAtTime(rate, at);
      src.playbackRate.linearRampToValueAtTime(rate1, at + len);
      src.start(at, offset, dur * 1.1);
      src.stop(at + len + 0.02);
    } else {
      g.gain.value = gain;
      src.start(at, offset);
    }
    src.onended = () => { try { src.disconnect(); g.disconnect(); if (last !== g) last.disconnect(); } catch (e) {} if (v.src === src) { v.src = null; v.end = 0; } };
    v.src = src; v.g = g; v.end = at + len; v.prio = prio; v.name = name;
    return true;
  }

  // Play a wrestling-pack sound. Returns false only when it is not decoded yet (the caller
  // falls back to a classic sound); dropped / rate-limited / muted calls return true.
  // pan -1..1, prio as in _wrSlot, bus 0 impacts, 1 crowd, 2 ceremony / UI, vari >= 0
  // forces a variation (the count shouts), offset starts that far into the clip.
  wr(name, gain = 1, rate = 1, when = 0, pan = 0, prio = 3, bus = 0, vari = -1, offset = 0) {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return false;
    const bank = this.wrSfx[name];
    if (!bank || !bank[0]) return false;
    if (this.muted) return true;
    const row = WR[name], t = this._now(), at = t + when;
    if (Math.abs(at - (this._lastPlay[name] ?? -1e9)) < row[3]) return true;
    const V = this._wrV;
    let live = 0;
    for (let i = 0; i < V.length; i++) if (V[i].src && V[i].name === name && V[i].end > t) live++;
    if (live >= row[2]) {
      if (!WR_CHOKE[name]) return true;
      for (let i = 0; i < V.length; i++) if (V[i].src && V[i].name === name) this._wrKill(V[i], Math.max(t, at - 0.01), 0.04);
    }
    let k = vari;
    if (k < 0 || !bank[k]) {
      k = Math.floor(Math.random() * bank.length);
      if (bank.length > 1 && (k === this._lastPick[name] || !bank[k])) k = (k + 1) % bank.length;
      if (!bank[k]) k = 0;
      this._lastPick[name] = k;
    }
    const r = rate * (1 + (Math.random() * 2 - 1) * row[4]);
    this._lastPlay[name] = at;
    const duck = WR_SUB_DUCK[name];
    if (duck) {
      // the sub owns the low end while it speaks: classic SFX, music and crowd dip under 140 Hz
      const sh = mm.shelf.gain;
      sh.cancelScheduledValues(at);
      sh.setTargetAtTime(duck[0] * Math.min(1, gain), at, 0.008);
      sh.setTargetAtTime(0, at + duck[1], 0.14);
    }
    return this._wrStart(bank[k], name, row[1] * gain, r, at, pan, prio, offset, 0, bus, r);
  }

  // Fade out whatever is playing of one pack sound (the finisher riser at the apex, the dizzy birds)
  wrStop(name, fade = 0.06) {
    if (!this.ctx || !this._mm) return;
    const V = this._wrV, t = this._now();
    for (let i = 0; i < V.length; i++) if (V[i].src && V[i].name === name) this._wrKill(V[i], t, fade);
  }

  // A kaiju's vocal effort. who: monster key / variant. kind: 'effort' (strike, throw,
  // getting up), 'pain', 'strain' (lock-up, lift), 'ko'. Returns false if the source
  // sample is not loaded.
  vox(who, kind, gain = 1, pan = 0, when = 0, prio = 3) {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return false;
    const set = VOX[KAIJU_SFX[who] || this._kaiju], cuts = set && set[kind];
    if (!cuts) return false;
    const key = 'vox_' + kind + (KAIJU_SFX[who] || this._kaiju);
    let k = Math.floor(Math.random() * cuts.length);
    if (cuts.length > 1 && k === this._lastPick[key]) k = (k + 1) % cuts.length;
    this._lastPick[key] = k;
    const cut = cuts[k], bank = this.sfx[cut[0]], buf = bank && (bank[cut[1]] || bank[0]);
    if (!buf) return false;
    if (this.muted) return true;
    const t = this._now(), at = t + when;
    if (Math.abs(at - (this._lastPlay[key] ?? -1e9)) < 0.18) return true;
    this._lastPlay[key] = at;
    const j = 1 + (Math.random() * 2 - 1) * 0.05;
    return this._wrStart(buf, key, cut[6] * gain, cut[4] * j, at, pan, prio, Math.min(cut[2], Math.max(0, buf.duration - cut[3] - 0.05)), cut[3], 0, cut[5] * j);
  }

  // ---- crowd beds. Call every frame of a match with the two layer gains (0..1 each;
  // lo = the arena waiting, hi = on its feet), a playback rate (slow-mo) and a low-pass
  // (distance from the ring). Desktop runs each layer twice, half a loop apart, panned
  // left / right for width; phones run one centred copy.
  crowdBed(lo, hi, rate = 1, lpHz = 16000) {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return;
    const t = this._now();
    if (!mm.beds) {
      const a = this.wrSfx.wr_loop_crowd_lo, b = this.wrSfx.wr_loop_crowd_hi;
      if (!a || !a[0] || !b || !b[0]) return;
      mm.beds = { lo: this._wrLoop('wr_loop_crowd_lo', mm.wide), hi: this._wrLoop('wr_loop_crowd_hi', mm.wide) };
    }
    mm.bedT = t;
    const B = mm.beds;
    _aim(B.lo.g.gain, lo, t, 0.3, 0.004);
    _aim(B.hi.g.gain, hi, t, 0.3, 0.004);
    for (let i = 0; i < B.lo.src.length; i++) { _aim(B.lo.src[i].playbackRate, rate, t, 0.12, 0.01); _aim(B.hi.src[i].playbackRate, rate, t, 0.12, 0.01); }
    _aim(mm.crowdLp.frequency, lpHz, t, 0.3, 150);
  }

  // The stadium clap-chant loop (momentum full, between falls). level 0..1, called every frame.
  crowdChant(level) {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return;
    if (!mm.chant) {
      const a = this.wrSfx.wr_loop_chant;
      if (level <= 0 || !a || !a[0]) return;
      mm.chant = this._wrLoop('wr_loop_chant', false);
    }
    _aim(mm.chant.g.gain, level, this._now(), 0.5, 0.004);
  }

  _wrLoop(name, wide) {
    const c = this.ctx, g = c.createGain(), buf = this.wrSfx[name][0], src = [], nodes = [];
    g.gain.value = 0;
    g.connect(this._mm.crowd);
    const copies = wide && c.createStereoPanner ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      const s = c.createBufferSource();
      s.buffer = buf; s.loop = true;
      this._setLoopPoints(s, WR_LOOP_SAMPLES[name]);
      const len = WR_LOOP_SAMPLES[name] / 44100;
      if (copies > 1) {
        // two decorrelated copies at -3 dB each, hard-ish left / right
        const p = c.createStereoPanner(), h = c.createGain();
        p.pan.value = i ? 0.75 : -0.75; h.gain.value = 0.7071;
        s.connect(h); h.connect(p); p.connect(g); nodes.push(h, p);
      } else s.connect(g);
      s.start(0, s.loopStart + (i ? len * 0.47 : 0));
      src.push(s);
    }
    return { src, g, nodes };
  }

  _wrBedSilence() {
    const mm = this._mm, t = this._now();
    if (mm.beds) { _aim(mm.beds.lo.g.gain, 0, t, 0.3, 0); _aim(mm.beds.hi.g.gain, 0, t, 0.3, 0); }
    if (mm.chant) _aim(mm.chant.g.gain, 0, t, 0.3, 0);
  }

  _wrStopLoops(fade) {
    const mm = this._mm, t = this._now();
    for (const L of [mm.beds && mm.beds.lo, mm.beds && mm.beds.hi, mm.chant]) {
      if (!L) continue;
      L.g.gain.cancelScheduledValues(t);
      L.g.gain.setTargetAtTime(0, t, fade / 3);
      const done = () => { try { for (const s of L.src) s.disconnect(); for (const n of L.nodes) n.disconnect(); L.g.disconnect(); } catch (e) {} };
      L.src[0].onended = done;
      for (const s of L.src) { try { s.stop(t + fade + 0.05); } catch (e) {} }
    }
    mm.beds = null; mm.chant = null;
  }

  // ---- entrance / victory theme (12 s of the kaiju's battle score). Returns false if not loaded.
  theme(who, gain = 0.6) {
    const mm = this._mm, k = KAIJU_SFX[who];
    if (!this.ctx || !mm || !mm.on) return false;
    const buf = this._wrTheme[k];
    if (!(buf instanceof AudioBuffer)) return false;
    this.themeStop(0.4);
    const t = this._now(), src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = this.muted ? 0 : gain;
    src.connect(g); g.connect(mm.ui);
    const th = { src, g };
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} if (mm.theme === th) mm.theme = null; };
    src.start(t);
    mm.theme = th;
    return true;
  }

  themeStop(fade = 1.2) {
    const mm = this._mm, th = mm && mm.theme;
    if (!th) return;
    const t = this._now();
    mm.theme = null;
    try {
      th.g.gain.cancelScheduledValues(t);
      th.g.gain.setTargetAtTime(0, t, fade / 3);
      th.src.stop(t + fade + 0.05);
    } catch (e) {}
  }

  // ---- mix moves, all safe to call every frame (they only write when the target moved).
  // music 0..1: the score under the match (ducks for the pin count, the finisher, a theme).
  // bed 0..1: everything that is not a wrestling impact (hit-stop pulls it down so the hit stands alone).
  matchDuck(music, bed) {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return;
    const t = this._now();
    _aim(mm.music.gain, music, t, 0.12, 0.01);
    _aim(mm.bedDuck.gain, bed, t, 0.03, 0.01);
  }

  // Slow motion: the world's top end closes (lpHz, 20000 = open).
  matchLowpass(lpHz) {
    const mm = this._mm;
    if (!this.ctx || !mm || !mm.on) return;
    _aim(mm.lp.frequency, lpHz, this._now(), 0.06, lpHz * 0.03);
  }

  // Bell for the opening seconds before the pack has decoded (the integrator's stand-in)
  bellFallback(when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this._now() + when;
    for (const [f, type, vol, dur] of [[1180, 'triangle', 0.4, 1.1], [1777, 'sine', 0.2, 0.7], [590, 'sine', 0.2, 1.3]]) {
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.sfxOut);
      osc.start(t); osc.stop(t + dur + 0.05);
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
