// Wrestling mode composer: builds the event bus and every module, owns the
// order they update in, and is the single object game.js talks to (its
// 'wrestling' game mode forwards the lifecycle here).
// OWNER: integrator. The modules it composes each have their own owner; see
// notes/wrestling_api.md for the contract (ctx, W, events, intent, anims).
//
// Per frame, while the simulation runs (game.js updateWorld):
//   input -> rival AI -> grapple -> both fighters -> match -> anims ->
//   camera, HUD, VFX, audio, arena -> intent edges cleared.
// While it is stopped (pause, upgrade picker, result screen): updateIdle on
// everything, so mixers, the camera and the HUD keep going.
import { createBus, EV, EVENTS } from './events.js';
import { createFighter, clearIntentEdges } from './fighter.js';
import { createAnims, ANIM_NAMES } from './anims.js';
import { createMatch } from './match.js';
import { createGrapple } from './grapple.js';
import { createRivalAI } from './rivalAI.js';
import { createInput } from './input.js';
import { createFightCam } from './fightCam.js';
import { createHud } from './hud.js';
import { createVfx } from './vfx.js';
import { createSfx } from './sfx.js';
import { createArena } from '../levels/chicago_arena.js';
import { createSpots } from './spots.js';

/**
 * @param ctx  the context game.js builds (see notes/wrestling_api.md)
 * @returns the mode lifecycle: { start, update, updateIdle, dispose,
 *   onGameOver, onBuildingDestroyed, gameOverText, W, qa }
 */
export function createWrestling(ctx) {
  const bus = createBus();
  ctx.events = bus;
  /** The wrestling runtime every module factory receives next to ctx. */
  const W = {
    ctx, bus, EV,
    running: false,
    player: null, rival: null,   // Fighters, valid between start() and dispose()
    anims: null, match: null, grapple: null, ai: null, input: null, cam: null, hud: null, vfx: null, sfx: null, arena: null, spots: null,
    /** Freeze the simulation for sec real seconds (ctx.hitStop) and tell the bus. */
    hitStop(sec) {
      ctx.hitStop(sec);
      const e = bus.ev(EV.TIME_HITSTOP);
      e.dur = sec;
      bus.emit(EV.TIME_HITSTOP);
    },
    /** Slow the simulation to scale for sec real seconds (ctx.slowMo, priority 1 unless given) and tell the bus. */
    slowMo(scale, sec, prio = 1) {
      ctx.slowMo(scale, sec, prio);
      const e = bus.ev(EV.TIME_SLOWMO);
      e.scale = scale; e.dur = sec;
      bus.emit(EV.TIME_SLOWMO);
    },
    /**
     * Swap the rival for another kaiju between matches (a title defense):
     * loads it (ctx.loadRival), replaces W.rival with a new Fighter at the
     * old one's spot and re-registers it with game.js. Resolves to the new
     * Fighter (null if the run was restarted meanwhile). Nobody may keep a
     * reference to W.rival across 'match:start'.
     */
    async swapRival(key) {
      const old = W.rival;
      const x = old.pos.x, z = old.pos.z, yaw = old.yaw;
      ctx.setRivalBody(null);
      old.dispose();
      if (old.root.parent) old.root.parent.remove(old.root);
      const r = await ctx.loadRival(key); // frees the old model
      if (!W.running || W.rival !== old) return null;
      W.rival = createFighter(ctx, W, { id: 'rival', key: r.key, cfg: r.cfg, glb: r.glb });
      W.player.opponent = W.rival; W.rival.opponent = W.player;
      r.glb.resetAnim();
      ctx.scene.add(W.rival.root);
      W.rival.reset(x, z, yaw, r.cfg.stats.hp * 2);
      ctx.markShadowCaster(W.rival.root);
      ctx.setRivalBody(W.rival);
      return W.rival;
    },
  };
  W.anims = createAnims(ctx, W);
  W.match = createMatch(ctx, W);
  W.grapple = createGrapple(ctx, W);
  W.ai = createRivalAI(ctx, W);
  W.input = createInput(ctx, W);
  W.cam = createFightCam(ctx, W);
  W.hud = createHud(ctx, W);
  W.vfx = createVfx(ctx, W);
  W.sfx = createSfx(ctx, W);
  W.arena = createArena(ctx, W);
  W.spots = createSpots(ctx, W); // landmark set pieces, foreign objects (spots)
  // Update order. Presentation modules come after the core so they see this frame's events.
  const core = [W.anims, W.match];
  const show = [W.cam, W.hud, W.vfx, W.sfx, W.arena, W.spots];

  // ---- QA: event log + state forcing (window.__qa.wr under ?debug) ----
  const log = { on: false, events: [], counts: {}, max: 4000 };
  const tap = (name, p) => {
    log.counts[name] = (log.counts[name] || 0) + 1;
    if (!log.on || log.events.length >= log.max) return;
    const copy = { t: +ctx.world.time.toFixed(3), ev: name }; // ev: the event name (a throw's own `type` field is its throw type)
    for (const k in p) { const v = p[k]; copy[k] = v && typeof v === 'object' ? (v.landmarkId || v.name || '[object]') : v; }
    log.events.push(copy);
  };

  const mode = {
    W,
    /**
     * Start a match. o.rival = { key, cfg, glb }: the loaded rival kaiju
     * (game.js owns loading and disposal). The player is ctx.player.
     */
    start(o) {
      if (W.running) mode.dispose();
      const scene = ctx.scene, P = ctx.player, A = W.arena.info;
      if (ctx.debug) bus.tap = tap;
      W.player = createFighter(ctx, W, { id: 'player', key: P.key, cfg: P.cfg, glb: P.glb });
      W.rival = createFighter(ctx, W, { id: 'rival', key: o.rival.key, cfg: o.rival.cfg, glb: o.rival.glb });
      W.player.opponent = W.rival; W.rival.opponent = W.player;
      // The rival waits in the ring, on the far side from the lake, facing the player's spawn
      const rx = A ? A.cx - A.half * 0.45 : P.root.position.x - 80, rz = A ? A.cz : P.root.position.z;
      o.rival.glb.resetAnim();
      scene.add(W.rival.root);
      W.rival.reset(rx, rz, Math.atan2(P.root.position.x - rx, P.root.position.z - rz), o.rival.cfg.stats.hp * 2);
      ctx.markShadowCaster(W.rival.root);
      ctx.setRivalBody(W.rival);
      // A match is decided by the two fighters: no out-of-combat healing
      ctx.rules.oocRegen = false;
      W.running = true;
      W.input.start(); W.ai.start(); W.grapple.start(); W.anims.start();
      for (const m of show) m.start();
      W.match.start(); // last: its opening events reach every listener
    },
    /** dt: simulation seconds (0 during hit-stop, scaled in slow-mo). dtReal: real seconds, clamped to 0.05. */
    update(dt, dtReal) {
      if (!W.running) return;
      W.input.update(dt);
      W.ai.update(dt);
      W.spots.pre(dt);   // pick-ups and weapon swings read the intents before the fighters do
      W.grapple.update(dt);
      W.player.update(dt);
      W.rival.update(dt);
      for (let i = 0; i < core.length; i++) core[i].update(dt, dtReal);
      for (let i = 0; i < show.length; i++) show[i].update(dt, dtReal);
      clearIntentEdges(W.player.intent);
      clearIntentEdges(W.rival.intent);
    },
    /** The simulation is stopped (pause, corner advice, result screen). dtReal: real seconds, clamped. */
    updateIdle(dtReal) {
      if (!W.running) return;
      W.player.updateIdle(dtReal);
      W.rival.updateIdle(dtReal);
      for (let i = 0; i < core.length; i++) core[i].updateIdle(dtReal);
      for (let i = 0; i < show.length; i++) show[i].updateIdle(dtReal);
    },
    /** game.js: the result screen is going up. */
    onGameOver(victory) { if (W.running) W.hud.onGameOver(victory); },
    /** game.js: a building collapsed. by: 'player' unless the damage was attributed to someone else. */
    onBuildingDestroyed(b, by) {
      if (!W.running) return;
      const e = bus.ev(EV.BUILDING_DESTROYED);
      e.by = by; e.building = b; e.landmarkId = b.landmarkId || ''; e.name = ctx.landmarkName(b);
      e.h = b.h; e.x = b.x; e.z = b.z;
      bus.emit(EV.BUILDING_DESTROYED);
    },
    /** Result-screen strings for game.js when it ends the run itself. */
    gameOverText(victory) { return W.running ? W.match.gameOverText(victory) : null; },
    /** Restart-in-place / quit: undo everything, leave the rival's GLB to game.js. */
    dispose() {
      if (!W.running) return;
      W.running = false;
      for (const m of show) m.dispose();
      W.match.dispose(); W.anims.dispose(); W.input.dispose(); W.ai.dispose(); W.grapple.dispose();
      ctx.setRivalBody(null);
      W.player.dispose(); W.rival.dispose();
      if (W.rival.root.parent) W.rival.root.parent.remove(W.rival.root);
      W.player = null; W.rival = null;
      bus.clear();
      log.events.length = 0; log.counts = {};
    },
    /** Test hooks (window.__qa.wr). */
    qa: {
      get W() { return W; },
      get player() { return W.player; },
      get rival() { return W.rival; },
      get match() { return W.match.state; },
      EVENTS, ANIM_NAMES,
      /** events.start() / stop() / clear(); events.list = captured payload copies (+ t = sim time, ev = event name); events.counts = emits per name since start(). */
      events: {
        start() { log.on = true; }, stop() { log.on = false; },
        clear() { log.events.length = 0; log.counts = {}; },
        get list() { return log.events; }, get counts() { return log.counts; },
        names(prefix = '') { return log.events.filter((e) => e.ev.startsWith(prefix)).map((e) => e.ev); },
      },
      /** Put 'player' | 'rival' into a fighter state for dur seconds. */
      force(who, state, dur = 2) { W[who].setState(state, dur); },
      /** Play a named anim on a fighter; returns whether the rig showed it. */
      anim(who, name) { return W.anims.play(W[who], name); },
      setHp(who, hp) { W[who].hp = hp; },
      /** Knock out 'player' | 'rival' through the normal damage path. */
      ko(who) { const f = W[who]; f.invuln = false; return f.applyDamage(f.hp + 1, 'qa', f.opponent.id, f.pos.x, 15, f.pos.z, false); },
      /** End the match now ('player' | 'rival' wins). */
      end(winner) { W.match.end(winner); },
      ai(on) { W.ai.enabled = !!on; },
      lock(on) { W.cam.setLock(!!on); },
      /** Teleport a fighter (x, z) keeping its facing. */
      place(who, x, z) { W[who].pos.set(x, 0, z); },
    },
  };
  return mode;
}
