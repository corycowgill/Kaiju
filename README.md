# 🦖 KAIJU RAMPAGE

> A 100% browser-based, three.js-powered Tokyo destruction simulator. Pick a giant monster. Stomp the city. Vaporize the army. Repeat until the high score weeps.

**Play it:** open `index.html` in any modern browser. Works on iPhone Safari (landscape) too.

A [Hallucinated Games](https://www.hallucinatedgames.com) joint — the studio that lets the model cook, then eats whatever comes out of the oven.

---

## 🎮 The Pitch

You are a 14-meter-tall rage problem.

Tokyo has not consented. Their tanks, helicopters, jets, walking war-mechs, twitchy infantry squads, and a particularly grumpy boss kaiju are about to make their feelings known. Your feelings are *primarily* a chest beam. Your secondary feelings are a roar, a tail-sweep dash, and a building-pulverizing stomp. Your *ultimate* feeling is best described as "an apology, but cinematic."

There is no plot. There is a city. There is you. There is gravity and the sound of glass.

Pick your monster:

| | Name | Vibe |
|---|---|---|
| 🦖 | **Gojira** | Reptilian tyrant. Big HP, atomic breath. The classic. |
| 🐲 | **Ghidorah** | Three-headed dragon. Faster, electric. Loud at parties. |
| 🤖 | **MechaKai** | Cybernetic war machine. Plasma cannon, missile barrage. Doesn't sleep. |

Each one has a unique beam, roar, and charge attack with their own colors, costs, and damage profiles. Mostly the differences will be cosmetic until wave 4, when they will be very, very not.

---

## 🕹 How to Play

### Desktop
- **WASD** — move
- **Mouse** — look (click the canvas to lock the pointer)
- **Shift** — sprint
- **LMB** — melee smash
- **1 / 2 / 3** — beam · roar · charge
- **Space** — stomp shockwave
- **Q** — Ultimate (when rage is full)
- **Esc** — pause

### iPhone / touchscreen
- **Left joystick** — move
- **Drag right side** — look
- **SMASH button** — melee
- **Power buttons** at the bottom — beam / roar / charge / stomp / ult
- **RUN** — toggle sprint
- **II** — pause

### The loop
1. Stomp buildings, eat the score.
2. Pop pickups for HP / rage / bonus score (they fall out of the rubble).
3. Survive a wave of military.
4. **Pick an upgrade card** (HP, damage, speed, regen, rage, combo, refill).
5. Wave gets meaner. Boss every 4 waves.
6. Die. Yell. Restart. Beat your high score (yes, it's saved).

Chained kills/destruction ramp a **combo multiplier** up to 5×. Big kills and the Ultimate trigger a **brief slow-mo** because we're not above it.

---

## 🛠 How It Was Built

This is a single-page web app — no build step, no bundler, no npm install ritual. Just static files and an `<script type="importmap">` pointing at three.js on a CDN. A web server is the only "infrastructure."

### Stack
- **[three.js](https://threejs.org/) 0.160.0** for the WebGL renderer, scene graph, shaders, and `EffectComposer` postprocessing (bloom)
- **Web Audio API** — every sound effect is procedurally synthesized at runtime (oscillators + filtered noise). Zero audio assets.
- **HTML / CSS** for HUD, menus, and on-screen popups (positioned via 3D → 2D projection each frame)
- **Vanilla ES modules** — no framework, no transpiler, no virtual DOM
- **`localStorage`** for the high score so your shame persists across sessions

### Files
```
index.html          # Shell, HUD, mobile controls, CSS, importmap
src/
  game.js           # Main loop, scene/camera, player + powers, waves, upgrades
  monsters.js       # Three selectable kaiju (mesh + stat config)
  city.js           # Procedural Tokyo: buildings, streets, lamps, cars
  enemies.js        # Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech
  effects.js        # Explosions, sparks, beams, hit pulses, smoke columns
  pickups.js        # HP / rage / score pickups
  audio.js          # Procedural Web Audio synthesis
```

### Notable design choices
- **Procedural everything.** The city, the monsters, the enemies, the sky, the sounds. There are no textures committed to the repo (except whatever the canvas elements bake at runtime).
- **Building destruction is mesh + physics fakery.** When a tower's HP hits zero, it pops a fireball cluster, sprays 14–28 chunks with a tiny verlet integrator, leaves four ground-rubble boxes, drops a 10-second smoke column, and shakes the camera proportionally to its height.
- **Bloom postprocessing** is gated behind the desktop check and runs at half-resolution to keep frame times honest. iPhone gets the direct render path.
- **Touch controls** use `visualViewport` + `env(safe-area-inset-*)` so the joystick / SMASH button never end up under the notch on landscape iPhone.
- **Camera-vs-building raycast** clamps the third-person camera distance so it never sits inside a tower.
- **Audio is lazily inited** on first user gesture (click / tap) to satisfy iOS autoplay policy, and resumed after tab background.
- **High score persists** in `localStorage`. Run it back.

### How it was *actually* written
By an AI agent (👋 hello), iteratively, in conversation with a human who kept saying things like "the buildings are too tanky" and "the lighting is too dark" and "the strafe is reversed." That's the Hallucinated Games house style: prompt, ship, refine, ship again. The full commit log on `claude/kaiju-game-threejs-YQ0SP` reads like a director's cut of the design process.

---

## 🚀 Run It Locally

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

## 🌐 More Hallucinated Games

This game lives at **[hallucinatedgames.com](https://www.hallucinatedgames.com)** along with whatever else we let the model dream up next week.

Built fast. Built loud. Built by hallucination.

🦖 ⚡ 💥 🏙️
