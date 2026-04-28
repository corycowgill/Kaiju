# KAIJU HAVOC

> A 100% browser-based, three.js-powered Tokyo destruction simulator. Pick a giant monster. Stomp the city. Vaporize the army. Repeat until the high score weeps.

**Play it:** open `index.html` in any modern browser. Works on iPhone Safari (landscape) too.

A [Hallucinated Games](https://www.hallucinatedgames.com) joint -- the studio that lets the model cook, then eats whatever comes out of the oven.

---

## The Pitch

You are a building-sized rage problem.

Tokyo has not consented. Their tanks, helicopters, jets, walking war-mechs, twitchy infantry squads, and a particularly grumpy boss kaiju are about to make their feelings known. Your feelings are *primarily* a chest beam. Your secondary feelings are a roar, a tail-sweep dash, and a building-pulverizing stomp. Your *ultimate* feeling is best described as "an apology, but cinematic."

There is no plot. There is a city. There is you. There is gravity and the sound of glass.

Pick your monster:

| | Name | Vibe |
|---|---|---|
| Gorrak | Reptilian tyrant. Big HP, atomic breath. The classic. |
| Tridon | Three-headed dragon. Faster, electric. Loud at parties. |
| Mechra | Cybernetic war machine. Plasma cannon, missile barrage. Doesn't sleep. |

Each one has a unique beam, roar, and charge attack with their own colors, costs, and damage profiles. Mostly the differences will be cosmetic until wave 4, when they will be very, very not.

---

## How to Play

### Desktop
- **WASD** -- move
- **Mouse** -- look (click the canvas to lock the pointer)
- **Shift** -- sprint
- **LMB** -- melee smash
- **1 / 2 / 3** -- beam / roar / charge
- **Space** -- stomp shockwave
- **Q** -- Ultimate (when rage is full)
- **Esc** -- pause

### Xbox controller (or any standard gamepad)
- **Left stick** -- move
- **Right stick** -- look
- **A** -- melee smash
- **X** -- beam
- **B** -- roar
- **Y** -- charge
- **RB** -- stomp / **RT** -- Ultimate
- **LB** -- sprint / **Start** -- pause

Plug it in. The game auto-detects it via the Gamepad API.

### iPhone / touchscreen
- **Left joystick** -- move
- **Drag right side** -- look
- **SMASH button** -- melee
- **Power buttons** at the bottom -- beam / roar / charge / stomp / ult
- **RUN** -- toggle sprint
- **II** -- pause

### The loop
1. Stomp buildings, eat the score.
2. Pop pickups for HP / rage / bonus score (they fall out of the rubble).
3. Survive a wave of military.
4. **Pick an upgrade card** (HP, damage, speed, regen, rage, combo, refill).
5. Wave gets meaner. Boss every 4 waves.
6. Die. Yell. Restart. Beat your high score (yes, it's saved).

Chained kills/destruction ramp a **combo multiplier** up to 5x. Big kills and the Ultimate trigger a **brief slow-mo** because we're not above it.

---

## How It Was Built

This is a single-page web app -- no build step, no bundler, no npm install ritual. Just static files and an `<script type="importmap">` pointing at three.js on a CDN. A web server is the only "infrastructure."

### Stack
- **[three.js](https://threejs.org/) 0.160.0** for the WebGL renderer, scene graph, shaders, and `EffectComposer` postprocessing (bloom, god rays)
- **[Meshy AI](https://www.meshy.ai/)** for all 3D models -- kaiju, buildings, and debris are GLB assets generated with Meshy, loaded via GLTFLoader
- **Web Audio API** -- every sound effect is procedurally synthesized at runtime (oscillators + filtered noise). Zero audio assets besides background music.
- **HTML / CSS** for HUD, menus, and on-screen popups (positioned via 3D-to-2D projection each frame)
- **Vanilla ES modules** -- no framework, no transpiler, no virtual DOM
- **`localStorage`** for the high score so your shame persists across sessions

### Files
```
index.html            # Shell, HUD, mobile controls, CSS, importmap
src/
  game.js             # Main loop, scene/camera, player + powers, waves, upgrades
  monsters.js         # Three selectable kaiju (stat configs + procedural fallback meshes)
  city.js             # Procedural Tokyo layout + GLB building/debris placement
  enemies.js          # Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech
  effects.js          # Legacy particle effects (explosions, sparks, beams)
  vfx.js              # Shader-based VFX manager with quality tiers + flipbook cache
  kaijuLoader.js      # GLB model + animation loading for all three kaiju
  pickups.js          # HP / rage / score pickups
  audio.js            # Procedural Web Audio synthesis
  quality.js          # Device detection + graphics quality tiers (low/med/high)
assets/
  buildings/          # 22 Meshy AI GLB building models (landmarks + generic)
  debris/             # 6 Meshy AI GLB debris/rubble models
  kaiju_model/        # Godzilla GLB animations (18 clips)
  ghidorah_model/     # Ghidorah GLB animations (21 clips)
  mecha_model/        # Mecha GLB animations (20 clips)
  godzilla.jpeg       # Character select portrait
  ghidorah.jpeg       # Character select portrait
  mecha.jpeg          # Character select portrait
  music.mp3           # Background music loop
```

### 3D Models (Meshy AI GLBs)

All 3D models are generated with [Meshy AI](https://www.meshy.ai/) and exported as `.glb` files. The game uses a two-phase template system: all GLB templates are loaded once during the loading screen, then cloned per-instance for buildings and debris.

**Kaiju** -- Each kaiju has 18-21 animation clips (idle, walk, run, sprint, turns, attacks, dance, death, etc.) loaded from separate GLB files. The `kaijuLoader.js` module de-duplicates files, creates an `AnimationMixer`, and exposes `play()` / `playOnce()` for seamless animation blending.

**Buildings** -- 22 unique building models spanning skyscrapers, condos, shopping centers, and Tokyo landmarks (Tokyo Tower, Skytree, Tokyo Dome, Buddhist temple, Shinto shrine, nuclear plant, etc.). Each is auto-scaled to a target height and given an AABB collision hitbox derived from its bounding box.

**Debris** -- 6 unique concrete/twisted debris models replace the old procedural box chunks. When a building collapses, random debris GLBs are cloned, scaled to the building's proportions, and launched with physics (gravity, bounce, angular velocity). Ground rubble also uses GLB models.

### Notable design choices
- **GLB models + procedural layout.** The city layout, streets, and building placement are procedurally generated, but every visible mesh is a Meshy AI GLB model. The loading screen front-loads all assets in parallel.
- **Building destruction is GLB debris + physics.** When a tower's HP hits zero, it pops a fireball cluster, sprays 10-20 GLB debris chunks with gravity/bounce physics, leaves 3-5 ground rubble pieces, drops a 10-second smoke column, and shakes the camera proportionally to its height.
- **Shader-based VFX.** Explosions, beams, shockwaves, chain lightning, and all other effects use custom GLSL shaders registered through a VFX manager, with quality-tiered particle counts and texture resolutions.
- **Three graphics tiers** (low/med/high) auto-detected by device or overridden via `?q=low`. Controls shadows, bloom, particle density, god rays, texture resolution, and anisotropic filtering.
- **Bloom + god ray postprocessing** gated behind quality checks. iPhone gets a lighter render path.
- **Touch controls** use `visualViewport` + `env(safe-area-inset-*)` so the joystick / SMASH button never end up under the notch on landscape iPhone.
- **Camera-vs-building raycast** clamps the third-person camera distance so it never sits inside a tower.
- **Audio is lazily inited** on first user gesture (click / tap) to satisfy iOS autoplay policy, and resumed after tab background.
- **Loading screen** shows combined progress as kaiju animations, building templates, and debris models load in parallel. Building placement happens synchronously after all templates are ready.

### How it was *actually* written
By an AI agent, iteratively, in conversation with a human who kept saying things like "the buildings are too tanky" and "the lighting is too dark" and "the strafe is reversed." That's the Hallucinated Games house style: prompt, ship, refine, ship again. The full commit log on `claude/kaiju-game-threejs-YQ0SP` reads like a director's cut of the design process.

---

## Soundtrack

Drop a music file at one of these paths and it'll loop automatically when
the level starts:

```
assets/music.mp3
assets/music.ogg
assets/music.wav
```

If no file is found, the game falls back to a synthesized ambient drone
generated live by the Web Audio API, so there's always something playing.

The speaker button mutes everything (SFX + music).

## Run It Locally

Any static server will do. Pick whichever doesn't make you sigh:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve

# Or just drag index.html onto a browser tab. (Most browsers will need
# a real server for ES modules + importmap to resolve, but try it.)
```

Then visit `http://localhost:8000` and start stomping.

---

## More Hallucinated Games

This game lives at **[hallucinatedgames.com](https://www.hallucinatedgames.com)** along with whatever else we let the model dream up next week.

Built fast. Built loud. Built by hallucination.
