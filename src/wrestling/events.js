// Wrestling event bus + the event catalogue (the contract between the combat
// core and every presentation module: camera, HUD, audio, VFX, crowd, arena).
//
// Rules
//  - Every event the mode can emit is listed in EVENTS below with its payload
//    fields and their defaults. on()/emit() throw on a name that is not listed:
//    add the event here first (integrator-owned file), then use it.
//  - Allocation-free: each event has ONE reusable payload object. Emitters do
//      const e = bus.ev(EV.STRIKE_LANDED);   // fields reset to their defaults
//      e.who = 'player'; e.target = 'rival'; e.damage = 12; ...
//      bus.emit(EV.STRIKE_LANDED);
//    Listeners get that same object: read it during the call, never keep it,
//    never write to it. Copy the numbers you need later.
//  - A listener must not emit the event it is handling (the payload is shared);
//    emitting a different event from a listener is fine (delivered at once).
//  - Fighter ids are 'player' and 'rival'. `who` is the subject named in the
//    event's comment, `target` the other fighter ('' when there is none).
//  - x / y / z are world units at the point of interest (contact point, body
//    centre...). `impact` is a 0..1 weight for scaling camera / VFX / audio.
//  - `by` is who caused it: 'player' | 'rival' | 'military' | 'env' | ''.

const P = (o) => Object.freeze(o);

/** name -> payload defaults (the payload shape). */
export const EVENTS = Object.freeze({
  // ---- match flow ----
  // A match begins (before the entrances). defense: 0 = title match, n = nth title defense.
  'match:start':        P({ playerKey: '', rivalKey: '', playerName: '', rivalName: '', bestOf: 3, defense: 0 }),
  // Match phase changed: 'idle' | 'entrance' | 'fight' | 'pin' | 'finisher' | 'between' | 'over'.
  'match:phase':        P({ phase: '', prev: '' }),
  // who's entrance starts / ends (who: 'player' | 'rival').
  'entrance:start':     P({ who: '', key: '', name: '' }),
  // A beat inside an entrance: 'rise' | 'walk' | 'roar' | 'crash' | 'pose' | 'namecard' | 'arrive'. t = seconds into the entrance.
  'entrance:beat':      P({ who: '', beat: '', t: 0, x: 0, y: 0, z: 0 }),
  'entrance:end':       P({ who: '' }),
  // The player skipped the entrances.
  'entrance:skip':      P({}),
  // Ring bell. kind: 'start' (match / fall begins) | 'fall' (a fall was scored) | 'end' (match over). rings = number of strikes.
  'bell':               P({ kind: '', rings: 1 }),
  // Fall n (1-based) begins / ends. winner / loser are fighter ids, by: 'pin' | 'ko'.
  'fall:start':         P({ fall: 1, playerFalls: 0, rivalFalls: 0 }),
  'fall:end':           P({ fall: 1, winner: '', loser: '', by: '', playerFalls: 0, rivalFalls: 0 }),
  // Match result. match:over always fires; match:won / match:lost fire with it from the player's side. time = match seconds.
  'match:over':         P({ winner: '', loser: '', by: '', playerFalls: 0, rivalFalls: 0, time: 0, defense: 0 }),
  'match:won':          P({ by: '', playerFalls: 0, rivalFalls: 0, time: 0, defense: 0 }),
  'match:lost':         P({ by: '', playerFalls: 0, rivalFalls: 0, time: 0, defense: 0 }),

  // ---- fighter generic ----
  // who changed state (see STATES in fighter.js). dur = planned seconds in the new state, 0 = open-ended.
  'fighter:state':      P({ who: '', state: '', prev: '', dur: 0 }),
  // who lost `amount` HP. kind: the attack kind ('light', 'heavy', 'melee', 'beam', 'slam', 'building', ...). blocked = chip damage through a block.
  'damage':             P({ who: '', by: '', amount: 0, kind: '', hp: 0, maxHp: 0, blocked: false, x: 0, y: 0, z: 0 }),
  // who dropped under 25% HP (once per fall).
  'hp:critical':        P({ who: '' }),
  'stamina:empty':      P({ who: '' }),
  'stamina:recovered':  P({ who: '' }),
  // who's momentum meter filled (finisher available) / was spent.
  'momentum:full':      P({ who: '' }),
  'momentum:spent':     P({ who: '' }),

  // ---- strikes ----
  // kind: 'light' | 'heavy' | 'clothesline' | 'splash' | 'stomp'. combo: 1..3 for the light string, else 1.
  // who winds up a strike (the tell). windup = seconds until contact.
  'strike:start':       P({ who: '', target: '', kind: '', combo: 1, windup: 0 }),
  // who's strike connected. high: true = head/chest (hit_high react), false = body/legs (hit_low). counter: landed on an attacking target.
  'strike:landed':      P({ who: '', target: '', kind: '', combo: 1, damage: 0, impact: 0, high: true, counter: false, x: 0, y: 0, z: 0 }),
  // who's strike was blocked by target (damage = chip).
  'strike:blocked':     P({ who: '', target: '', kind: '', combo: 1, damage: 0, impact: 0, x: 0, y: 0, z: 0 }),
  // who REVERSED target's strike with a just-in-time block (target is the attacker, now staggered).
  'strike:reversed':    P({ who: '', target: '', kind: '', x: 0, y: 0, z: 0 }),
  // who's strike hit nothing.
  'strike:whiffed':     P({ who: '', kind: '', combo: 1 }),

  // ---- signature powers (beam / roar / charge / stomp / ult) ----
  // power: 'beam' | 'roar' | 'charge' | 'stomp' | 'ult'. name: the kaiju's own name for it ('ATOMIC BREATH').
  // who telegraphs a power: dur seconds until it fires, radius/x/z = the threatened area (radius 0 = a line toward target).
  'power:telegraph':    P({ who: '', target: '', power: '', name: '', dur: 0, radius: 0, x: 0, z: 0 }),
  // fired from x/y/z. dirX/dirZ (unit, world) + range: the line of a beam / charge; radius: the area of a roar / stomp / ult (0 = n/a).
  'power:fired':        P({ who: '', power: '', name: '', x: 0, y: 0, z: 0, dirX: 0, dirZ: 0, range: 0, radius: 0 }),
  'power:hit':          P({ who: '', target: '', power: '', damage: 0, blocked: false, impact: 0, x: 0, y: 0, z: 0 }),

  // ---- stagger / stun / block ----
  // who is staggered (brief hit-stun) by `by` for dur seconds.
  'stagger':            P({ who: '', by: '', dur: 0, x: 0, y: 0, z: 0 }),
  // who is stunned (dizzy: a free grab) for dur seconds / recovered.
  'stun':               P({ who: '', by: '', dur: 0 }),
  'stun:end':           P({ who: '' }),
  'block:start':        P({ who: '' }),
  'block:end':          P({ who: '' }),
  // who's guard broke (blocked with no stamina left).
  'block:broken':       P({ who: '', by: '' }),

  // ---- grapple ----
  // who reaches for a grab (the tell) / missed.
  'grab:attempt':       P({ who: '', target: '' }),
  'grab:whiffed':       P({ who: '' }),
  // Lock-up established: who holds target. x/y/z = between the two bodies.
  'grab:start':         P({ who: '', target: '', x: 0, y: 0, z: 0 }),
  // who (the one being grabbed) turned target's grab around; who now holds target.
  'grab:reversed':      P({ who: '', target: '' }),
  // who broke free of target's hold. by: 'mash' | 'timeout' | 'hit' (a third party hit the holder).
  'grab:escaped':       P({ who: '', target: '', by: '' }),
  // who (the holder) commits to a move out of the lock-up. type: 'whip' | 'suplex' | 'slam' | 'swing' | 'pickup';
  // dur = seconds until its throw:launch / lift:start.
  'grab:move':          P({ who: '', target: '', type: '', dur: 0 }),
  // who hoists target overhead (gorilla press); who may now walk a few steps.
  'lift:start':         P({ who: '', target: '' }),
  // One full turn of a giant swing (turns = count so far).
  'swing:spin':         P({ who: '', target: '', turns: 0 }),
  // Throws. type: 'whip' (Irish whip) | 'suplex' | 'slam' (press slam) | 'swing' (giant swing release) | 'toss' (any other release).
  // launch: target leaves who's hands at x/y/z heading dirX/dirZ (unit, world) at speed u/s.
  'throw:launch':       P({ who: '', target: '', type: '', x: 0, y: 0, z: 0, dirX: 0, dirZ: 0, speed: 0 }),
  // land: target (thrown by who) comes to rest / hits the ground. surface: 'ground' | 'water' | 'building' | 'ropes' | 'crowd'.
  'throw:land':         P({ who: '', target: '', type: '', damage: 0, impact: 0, surface: '', x: 0, y: 0, z: 0 }),

  // ---- environment ----
  // who (a thrown / whipped / charging body) went into a building. by: who sent it. type: the throw type ('' when not thrown).
  // building: the city.js Building; landmarkId / name are '' for ordinary blocks ('willis_tower' / 'Willis Tower').
  // destroyed: it collapsed. count: nth building hit by this same throw (1-based). h: building height (u).
  'building:impact':    P({ who: '', by: '', type: '', building: null, landmarkId: '', name: '', destroyed: false, count: 1, damage: 0, h: 0, x: 0, y: 0, z: 0 }),
  // Any building collapsed during the match (from game.js). by: 'player' unless a module attributed the damage to someone else.
  'building:destroyed': P({ by: '', building: null, landmarkId: '', name: '', h: 0, x: 0, z: 0 }),
  // who bounced off the ring ropes on `side` ('n' | 'e' | 's' | 'w'); ropeHp = hits that side has left. speed = rebound speed u/s.
  'rope:rebound':       P({ who: '', side: '', speed: 0, ropeHp: 0, x: 0, z: 0 }),
  // That side's ropes snapped (who = the body that broke them).
  'rope:snap':          P({ who: '', side: '', x: 0, z: 0 }),
  // who (thrown / whipped) hit corner post `post` (index into W.arena.info.posts, 0..3) at speed u/s. toppled: the post goes down.
  'post:impact':        P({ who: '', post: 0, speed: 0, impact: 0, toppled: false, x: 0, z: 0 }),
  // who left / re-entered the ring square.
  'ring:out':           P({ who: '', side: '', x: 0, z: 0 }),
  'ring:in':            P({ who: '' }),
  // who landed in the lake / river. size: 1 small .. 3 huge.
  'water:impact':       P({ who: '', size: 1, x: 0, z: 0 }),
  // A body came down on the ringside crowd (count flattened).
  'crowd:crushed':      P({ who: '', count: 0, x: 0, z: 0 }),

  // ---- ground game ----
  // who hits the mat. cause: 'strike' | 'throw' | 'power' | 'finisher' | 'ko'.
  'knockdown':          P({ who: '', by: '', cause: '', impact: 0, x: 0, y: 0, z: 0 }),
  // who starts to rise / is back on its feet (invulnerable in between).
  'getup':              P({ who: '', x: 0, z: 0 }),
  'getup:done':         P({ who: '' }),
  // who drags the downed target up into a lock-up.
  'pickup':             P({ who: '', target: '' }),
  // who covers target. forced: a KO pin that cannot be kicked out of.
  'pin:start':          P({ who: '', target: '', forced: false }),
  // The count reached `count` (1, 2, 3). Fires on the slap of the mat.
  'pin:count':          P({ who: '', target: '', count: 0, forced: false }),
  // who (the pinned one) kicked out of target's pin after `count` counts, `at` seconds into the 3-count. near: a 2.9 near-fall.
  'pin:kickout':        P({ who: '', target: '', count: 0, at: 0, near: false }),
  // Three count: who pinned target.
  'pin:fall':           P({ who: '', target: '', forced: false }),
  // The pin was broken up by something else. reason: 'hit' | 'ringout' | 'interference'.
  'pin:broken':         P({ who: '', target: '', reason: '' }),

  // ---- taunt / finisher / KO ----
  // id: the anim name ('taunt_a' | 'taunt_b' | 'taunt_win').
  'taunt:start':        P({ who: '', id: '', dur: 0 }),
  'taunt:complete':     P({ who: '', id: '', momentum: 0 }),
  'taunt:interrupted':  P({ who: '', by: '', id: '' }),
  // who starts its finisher on target. name: the move's display name.
  'finisher:start':     P({ who: '', target: '', name: '' }),
  // A beat inside the finisher: 'grab' | 'lift' | 'apex' | 'drop' ... t = seconds since finisher:start.
  'finisher:beat':      P({ who: '', target: '', beat: '', t: 0 }),
  // The finisher lands: city-block shockwave of `radius` at x/y/z.
  'finisher:impact':    P({ who: '', target: '', name: '', damage: 0, radius: 0, x: 0, y: 0, z: 0 }),
  'finisher:end':       P({ who: '', target: '' }),
  // who's HP reached 0.
  'ko':                 P({ who: '', by: '', x: 0, y: 0, z: 0 }),

  // ---- interference (military run-ins) ----
  // kind: 'tanks' | 'helis' | 'mixed'. warn fires eta seconds before arrive.
  'interference:warn':  P({ kind: '', eta: 0 }),
  'interference:arrive': P({ kind: '', count: 0, x: 0, z: 0 }),
  'interference:end':   P({}),

  // ---- crowd / presentation cues (emitted by the match director) ----
  // Crowd heat, ~4x a second: level 0..1 (smoothed), trend -1..1 (falling / rising).
  'crowd:intensity':    P({ level: 0, trend: 0 }),
  // A discrete crowd reaction. kind: 'pop' | 'boo' | 'ooh' | 'gasp' | 'chant' | 'count'. x/z: where the crowd is looking.
  'crowd:pop':          P({ kind: '', impact: 0, x: 0, z: 0 }),
  // Big on-screen move name. tier: 'move' | 'landmark' | 'finisher' | 'result'. sub: small second line ('' = none).
  'callout':            P({ text: '', sub: '', tier: 'move', who: '' }),
  // Context prompt for the player: id 'grab' | 'pickup' | 'pin' | 'kickout' | 'escape' | 'getup' (downed: mash) | 'finisher' | 'skip' |
  // 'defend' (after a win: confirm to start a title defense); show false hides it.
  'prompt':             P({ id: '', show: true }),
  // One commentary-ticker line. tone: 'neutral' | 'hype' | 'shock'.
  'commentary':         P({ text: '', tone: 'neutral' }),
  // The match asks for a named camera shot: 'entrance' | 'bell' | 'pin' | 'finisher' | 'ko' | 'win' | 'lose' | 'between' | '' (back to the fight cam).
  'cam:cue':            P({ shot: '', who: '', dur: 0 }),
  // Lock-on toggled (fight cam framing both kaiju vs free chase cam).
  'lockon':             P({ on: false }),
  // Time effects requested through W.hitStop / W.slowMo (so audio and camera can follow them).
  'time:hitstop':       P({ dur: 0 }),
  'time:slowmo':        P({ scale: 1, dur: 0 }),
});

/** Constant names: EV.STRIKE_LANDED === 'strike:landed'. */
export const EV = Object.freeze(Object.fromEntries(
  Object.keys(EVENTS).map((n) => [n.replace(/[:\-]/g, '_').toUpperCase(), n]),
));

export function createBus() {
  const subs = {};      // name -> listener array (null holes while emitting)
  const payloads = {};  // name -> the reusable payload
  const depth = {};     // name -> emits of it in progress
  for (const name of Object.keys(EVENTS)) {
    subs[name] = [];
    payloads[name] = { ...EVENTS[name], type: name };
    depth[name] = 0;
  }
  const check = (name) => { if (!subs[name]) throw new Error(`[wrestling] unknown event '${name}' (add it to EVENTS in events.js)`); };
  const bus = {
    /** Debug tap: fn(name, payload) called for every emit (QA event log). */
    tap: null,
    /** Subscribe; returns an unsubscribe function. */
    on(name, fn) {
      check(name);
      subs[name].push(fn);
      return () => bus.off(name, fn);
    },
    off(name, fn) {
      check(name);
      const a = subs[name];
      const i = a.indexOf(fn);
      if (i < 0) return;
      if (depth[name]) a[i] = null; // compacted when the emit unwinds
      else a.splice(i, 1);
    },
    /** The event's reusable payload, fields reset to their defaults. */
    ev(name) {
      check(name);
      const p = payloads[name], d = EVENTS[name];
      for (const k in d) p[k] = d[k];
      return p;
    },
    /** Deliver the event with its payload as last filled through ev(). */
    emit(name) {
      check(name);
      const a = subs[name], p = payloads[name];
      if (bus.tap) bus.tap(name, p);
      depth[name]++;
      const n = a.length; // listeners added during the emit wait for the next one
      for (let i = 0; i < n; i++) { const fn = a[i]; if (fn) fn(p); }
      if (--depth[name] === 0) {
        for (let i = a.length - 1; i >= 0; i--) if (a[i] === null) a.splice(i, 1);
      }
    },
    /** Drop every listener (mode dispose). */
    clear() {
      for (const name of Object.keys(subs)) subs[name].length = 0;
      bus.tap = null;
    },
  };
  return bus;
}
