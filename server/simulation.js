// Runs the shipped combat rules without DOM, GPU, assets or animation mixers.
import * as THREE from 'three';
import { MONSTERS } from '../src/monsters.js';
import { createFighter, clearIntentEdges } from '../src/wrestling/fighter.js';
import { createMatch } from '../src/wrestling/match.js';
import { createGrapple } from '../src/wrestling/grapple.js';
import { createBus, EV } from '../src/wrestling/events.js';
import { sanitizeInput, writeIntent, EDGES, TICK_RATE } from '../src/online/protocol.js';
const noop = () => {},
  never = () => false;
function body() {
  const root = new THREE.Group();
  return {
    root,
    head: root,
    actions: {},
    mixer: { update: noop },
    resetAnim: noop,
    lockLoco: noop,
    playOnce: never,
    play: noop,
    loop: noop,
  };
}
export function createSimulation({
  fighters,
  mode = 'title',
  arena = { cx: 4, cz: 62, half: 42 },
}) {
  const bus = createBus(),
    events = [];
  let tick = 0,
    eventId = 0,
    freeze = 0,
    slow = 0,
    slowScale = 1,
    result = null;
  const W = { bus, EV, input: { ui: {} }, arena: { info: arena }, spots: null };
  const roots = fighters.map(body),
    player = {
      root: roots[0].root,
      glb: roots[0],
      hp: 1,
      maxHp: 1,
      rage: 0,
      yaw: 0,
      upgrades: { dmgMult: 1, rageGainMult: 1 },
      control: { external: false },
      cooldowns: {},
      vel: new THREE.Vector3(),
    };
  const ctx = {
    local: { enabled: true, versus: mode === 'vs' },
    player,
    rules: {},
    world: {
      time: 0,
      bounds: {
        minX: arena.cx - 42,
        maxX: arena.cx + 42,
        minZ: arena.cz - 42,
        maxZ: arena.cz + 42,
      },
    },
    MONSTERS,
    bodyRadius: (key) => MONSTERS[key].fightRadius || 12,
    collideRadius: (key) => 8.1 * MONSTERS[key].stats.scale,
    hurtPlayer(amount) {
      const dealt = Math.min(player.hp, amount);
      player.hp = Math.max(0, player.hp - amount);
      return dealt;
    },
    clampToBounds(p) {
      p.x = THREE.MathUtils.clamp(p.x, arena.cx - 42, arena.cx + 42);
      p.z = THREE.MathUtils.clamp(p.z, arena.cz - 42, arena.cz + 42);
    },
    resolveBuildingCollisions: noop,
    damageInRadius: noop,
    sweepBuildings: noop,
    forEachBuildingNear: noop,
    buildingAt: () => null,
    collapseBuilding: noop,
    damageBuilding: noop,
    landmarkName: () => '',
    isWater: never,
    waterDepth: () => 0,
    addScore: noop,
    addRage: noop,
    shake: noop,
    fx: { dustBurst: noop, waterImpact: never },
    military: { clear: noop, count: 0 },
    gameOver: () => {
      result = { winner: W.match.state.winner, reason: 'match' };
    },
    offerUpgrades: (cb) => cb?.({}),
  };
  W.anims = {
    play(f, name) {
      f.animName = name;
      return true;
    },
    stop(f) {
      f.animName = '';
    },
    carryY: (a) => a.height + 8,
  };
  W.hitStop = (seconds) => {
    freeze = Math.max(freeze, seconds);
  };
  W.slowMo = (scale, seconds) => {
    slowScale = scale;
    slow = Math.max(slow, seconds);
  };
  W.player = createFighter(ctx, W, {
    id: 'player',
    key: fighters[0],
    cfg: MONSTERS[fighters[0]],
    glb: roots[0],
  });
  W.rival = createFighter(ctx, W, {
    id: 'rival',
    key: fighters[1],
    cfg: MONSTERS[fighters[1]],
    glb: roots[1],
  });
  W.player.opponent = W.rival;
  W.rival.opponent = W.player;
  W.grapple = createGrapple(ctx, W);
  W.match = createMatch(ctx, W);
  bus.tap = (name, payload) => {
    // Bus payloads are reused; never retain a reference across ticks.
    const data = {};
    for (const [key, v] of Object.entries(payload))
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) data[key] = v;
    events.push({ id: ++eventId, tick, name, data });
    if (events.length > 128) events.shift();
  };
  W.grapple.start();
  W.match.start();
  W.match.skipEntrance();
  const inputs = [sanitizeInput(), sanitizeInput()],
    lastSeen = [0, 0],
    lastMash = [-100, -100];
  return {
    W,
    get result() {
      return result;
    },
    get tick() {
      return tick;
    },
    input(seat, raw) {
      const next = sanitizeInput(raw),
        previous = inputs[seat];
      for (const key of EDGES) next[key] ||= previous[key];
      next.power ||= previous.power;
      next.mash = Math.max(next.mash, previous.mash);
      inputs[seat] = next;
      lastSeen[seat] = tick;
    },
    step() {
      if (result) return;
      tick++;
      const real = 1 / TICK_RATE;
      let dt = real;
      if (freeze > 0) {
        freeze = Math.max(0, freeze - real);
        dt = 0;
      } else if (slow > 0) {
        slow = Math.max(0, slow - real);
        dt *= slowScale;
      }
      ctx.world.time += dt;
      if (dt === 0) {
        W.match.update(0, real);
        return;
      }
      for (let seat = 0; seat < 2; seat++) {
        if (tick - lastSeen[seat] > 15) inputs[seat] = sanitizeInput();
        const raw = inputs[seat];
        if (raw.mash && tick - lastMash[seat] < 5) raw.mash = 0;
        else if (raw.mash) lastMash[seat] = tick;
        writeIntent(
          seat ? W.rival : W.player,
          seat ? W.player : W.rival,
          raw,
          ['fight', 'pin', 'finisher'].includes(W.match.state.phase),
        );
        for (const key of EDGES) raw[key] = false;
        raw.power = '';
        raw.mash = 0;
      }
      W.grapple.update(dt);
      W.player.update(dt);
      W.rival.update(dt);
      W.match.update(dt, real);
      clearIntentEdges(W.player.intent);
      clearIntentEdges(W.rival.intent);
    },
    forfeit(seat) {
      if (!result) result = { winner: seat === 0 ? 'rival' : 'player', reason: 'disconnect' };
    },
    snapshot() {
      const fighter = (f) => ({
        key: f.key,
        pos: f.pos.toArray(),
        rot: [f.root.rotation.x, f.yaw, f.root.rotation.z],
        hp: f.hp,
        maxHp: f.maxHp,
        stamina: f.stamina,
        momentum: f.momentum,
        state: f.state,
        stateT: f.stateT,
        held: f.held,
        anim: f.animName,
        move: f.move?.id || '',
        moveT: f.stateT,
        cd: { ...f.cd },
        lie: f.lie,
        comeback: f.comeback,
        finished: f.finished,
      });
      const short = (v) => ({
        active: v.active,
        who: v.who,
        target: v.target,
        phase: v.phase || '',
        t: v.t || 0,
        count: v.count || 0,
        meter: v.meter || v.escape || 0,
      });
      return {
        tick,
        serverTime: tick / TICK_RATE,
        timeScale: freeze > 0 ? 0 : slow > 0 ? slowScale : 1,
        match: { ...W.match.state },
        fighters: [fighter(W.player), fighter(W.rival)],
        hold: short(W.grapple.hold),
        pin: short(W.grapple.pin),
        fin: short(W.grapple.fin),
        events: [...events],
        result,
      };
    },
    dispose() {
      W.match.dispose();
      W.grapple.dispose();
      W.player.dispose();
      W.rival.dispose();
      bus.clear();
    },
  };
}
