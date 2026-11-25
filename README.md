# KAIJU HAVOC

> A 100% browser-based, three.js-powered Tokyo destruction simulator. Pick a giant monster. Stomp the city. Vaporize the army. Repeat until the high score weeps.

**GitHub Pages URL (once enabled):** [corycowgill.github.io/Kaiju](https://corycowgill.github.io/Kaiju/). Works on iPhone Safari (landscape) too.

A [Hallucinated Games](https://www.hallucinatedgames.com) joint -- the studio that lets the model cook, then eats whatever comes out of the oven.

---

## The Pitch

You are a building-sized rage problem.

Tokyo has not consented. Their tanks, helicopters, jets, walking war-mechs, twitchy infantry squads, and a particularly grumpy boss kaiju are about to make their feelings known. Your feelings are *primarily* a chest beam. Your secondary feelings are a roar, a tail-sweep dash, and a building-pulverizing stomp. Your *ultimate* feeling is best described as "an apology, but cinematic."

There is no plot. There is a city. There is you. There is gravity and the sound of glass.

Pick your monster:

| Name | Vibe |
|---|---|
| Gorrak | Reptilian tyrant. Big HP, atomic breath. The classic. |
| Tridon | Three-headed dragon. Faster, electric. Loud at parties. |
| Mechra | Cybernetic war machine. Plasma cannon, missile barrage. Doesn't sleep. |
| Cindervault | A basalt gorilla with molten seams and fists that crack the ground. |
| Brineveil | A deep-sea angler with a luminous lure and a pressure wave that scatters enemies. |
| Rimehorn | A glacier-armored musk ox that takes heavy punishment and charges through the line. |
| Vesperax | A quick amethyst mantis with scythe-like forearms. |
| Thornwake | A walking siege engine of ancient bark and living roots. |
| Ferrumaw | A bio-metal pangolin that fires scrap from its magnetic scales. |

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

### Military combat and hit feedback

Military units now accelerate and turn smoothly instead of snapping to face the
kaiju. Ground units steer around intact building footprints, including rotated
city blocks, avoid water and play-area edges, and spread out locally. Destroying
a blocker opens the route immediately. A cached footprint index keeps collision
queries local even when a city contains very wide bridges.

- **Tanks** split into opposing flank lanes, reverse when crowded, then brace,
  align their hull, and show a muzzle charge before firing a leading shot.
- **Infantry** advances and skirmishes laterally, falls back at close range, and
  fires short two-round bursts. Run-and-shoot clips now accompany real movement.
- **Helicopters** make burst-firing passes, bank with their lateral movement,
  and break away between passes, with smoothly changing altitude and rotor motion.
- **Mechs** advance or backstep, plant for telegraphed dual-cannon volleys, and
  retain their attack clip through the firing sequence. Faster movement uses the
  authored in-place running clip; walk playback follows speed and direction.
- **Jets** bank into continuous return passes instead of teleporting to a new
  approach position. Afterburner movement is smooth rather than random each frame.
- **Artillery** relocates if approached, pauses to aim, and fires at a fixed,
  slightly leading target. The warning ring shows the actual 18-unit blast radius,
  with a shrinking countdown ring. Environmental blasts do not award player credit.

Confirmed hits produce impact sparks, a brief hit marker (gold on a kill), and
local flinch/recoil without changing shared model materials. Surviving ordinary
units briefly stagger and interrupt cannon windups; boss telegraphs remain intact.
Melee, stomp, and charge contacts add a rate-limited impact sound, light camera
kick, and a short hit pause. Continuous beams do not repeatedly freeze combat.
Reduced-motion preferences disable that extra camera kick and hit pause. Ground
melee and trample damage no longer hit jets overhead.

`src/militaryMotion.js` owns steering, collision and hit reactions;
`src/enemies.js` owns tactics and model animation. `npm test` covers the actual
enemy classes, movement bounds, obstacle avoidance, attack cadence, interrupts,
freeze behavior, and continuous jet passes. Asset smoke checks also verify that
the loaded mech attack and infantry locomotion clips stay active correctly.

### Local player profiles

Open **Player Profile** in the top-right of the menu, from pause, or from results.
Create up to eight named players, rename the current player, and switch players
between runs. Deleting an inactive profile requires a second confirmation and
removes only that player's career. Each profile owns its trophies and unlock dates,
high score, Championship Tour belts, City Challenge medals and personal bests,
menu choices, wrestling tutorial progress, and game history. Graphics, audio,
and downloaded assets remain shared device settings.

Existing saves migrate automatically to **Player 1** on the first visit. Original
save keys remain untouched as a backup; new players start fresh. The selected
player persists between visits. Switching reloads the game after flushing the
current player's saves; delayed writes remain bound to the original player.
Switching and creating players are disabled during a run and when browser
storage is unavailable, while gameplay remains available for the session.

History records the latest 100 results across all game modes, including dates,
fighter, city, active play time, score, challenge medals, and wrestling fall
scores. Wins, losses, quits, and interrupted runs are distinguished, with lifetime
run/win/loss/play-time totals retained beyond the recent-history limit. History
starts with this update; earlier achievements and records are preserved without
inventing earlier match results. An unfinished run is marked interrupted on the
next visit. This is local browser storage, so profiles are specific to this
browser and device and are removed if its site data is cleared.

`src/playerProfiles.js` owns migration and profile-bound storage adapters;
`src/playerHistory.js` records results; `src/playerProfilesUI.js` presents careers.
`npm test` checks real ledger isolation, migration, late writes after switching,
storage failures, profile management, history retention, and interrupted runs.

### Achievements and trophies

Open **Trophy Room** from the mode menu, pause menu, or results screen to browse
54 achievements: 30 for Havoc, 20 for wrestling, and four Legacy milestones.
Each has a custom illustrated badge, a Bronze / Silver / Gold / Platinum tier,
trophy points, and visible progress. Search by name or requirement and filter
by mode or unlock status. The original Platinum still requires the same 47
original trophies; the six City Challenge trophies are additional rewards.

Havoc trophies cover destruction, military kills, combos, score, cleared waves,
objectives, pickups, powers, and active survival time. Wrestling trophies track
pins, knockouts, reversals, suplexes, signatures, finishers, near-fall escapes,
environmental throws, match wins, and title defenses. Legacy trophies reward
playing all nine kaiju, visiting all six cities, and winning all six city titles.
VS Duel and Lone Soldier do not advance these trophies.

Unlocks display a queued in-game toast with the badge and a short chime that
respects the sound setting. Progress and unlock dates save automatically in
this browser on this device, across restarts and visits. Run and match targets
must be completed together; their progress shows your previous best. Loading,
pausing, and background time do not count toward survival. With browser storage
disabled or full, trophies still work for the current session.

Trophy Room supports mouse, touch, keyboard (Tab / Shift+Tab; Esc to close), and
gamepad (left/right to filter, up/down to scroll, A to activate, B/Start to close).
Opening it during a paused run preserves the pause when you close it.

The ledger lives in `src/achievements.js`, its collection and toasts in
`src/achievementUI.js` and `src/achievements.css`, and wrestling event subscriptions
in `src/wrestling/achievements.js`. Run `npm test` for progression and save tests;
`npm run smoke` also checks trophy unlocks through the real wrestling director.

### Championship Tour

Select **Championship Tour** on the mode screen to start or resume a saved
wrestling campaign. Choose any of the nine kaiju; each fighter keeps a separate
career and faces seven distinct rivals, with no mirror matches.

Win city belts in **Chicago → Washington DC → New York City → Seattle →
San Francisco → Tokyo**. Each city is best of three falls. Rivals gain health,
damage, and stronger AI pressure as the route advances. Winning all six city
belts unlocks the **World Heavyweight Championship** in Tokyo: the toughest
rival and a best-of-five match, requiring three winning falls. The final victory
awards the saved world crown and a championship trophy celebration.

Losses never remove earned belts: retry the current match from its results
screen or resume from the tour board later. An interrupted match restarts at
the same city. Wins save as soon as the match is decided. The board shows your
belts, opponents, match scores, times, attempts, and the next unlocked stop.
Progress is saved in this browser on this device; if browser storage is blocked
or full, the board identifies that progress will only last for the session.

Open the board during a paused match to inspect progress; close it to return to
the pause menu. Tour matches advance existing wrestling trophies. Ordinary
Title Match, including its title defenses, remains available separately.

The campaign model is `src/championshipTour.js`; the board and responsive styles
are `src/championshipTourUI.js` and `src/championshipTour.css`. `npm test` checks
campaign progression and saves. The asset smoke test also exercises the real
best-of-five final, its difficulty, and its result callback.

The tour uses the main menu’s full-screen poster style, portrait roster,
red-and-gold command bar, and keyboard/controller navigation. Choose a contender,
continue to the title route, then fight or retry the next unlocked stop. Back
returns from the route to contender selection before closing; opening the tour
from match results goes straight to the next title on the route. During a paused
match the route is read-only and closing it preserves the pause.

### Havoc City Challenges

Open **City Challenges** from the mode screen for 24 replayable missions:
four in each city along **Chicago → Washington DC → New York City → Seattle →
San Francisco → Tokyo**. Earn a medal in all four missions to unlock the next
city. Any of the nine kaiju can play; medals and personal bests are shared across
fighters, with the fastest run's fighter recorded in the save.

City Challenges uses the same full-screen campaign menu as Championship Tour:
choose a kaiju from the portrait roster, continue to city/mission selection, then
start the selected mission from the fixed command bar. Scenic city cards show
locks and medal counts; mission cards show medal targets and saved records.
Arrow keys and D-pad navigate the cards, Enter/A confirms, and Escape/B steps
back before closing. The mission board opens directly from results or pause;
during a live run it is read-only, and closing it preserves the pause.

- **Demolition Run:** destroy every gold-marked building before the deadline.
- **Military Siege:** clear three assaults, including the boss in the final one.
- **Precision Rampage:** destroy the marked landmark while preserving all three
  green-marked neighboring buildings. Losing any protected building fails the mission.
- **Power Trial:** destroy the marked buildings using only melee and the city's
  listed ability. Restricted abilities are disabled for all input devices.

Gold beacons and minimap diamonds identify targets; green markers identify
protected buildings. Marked targets have weakened foundations. Every mission
shows its bronze deadline and faster silver/gold thresholds, active countdown,
objective progress, and medal pace. Loading, pauses, and background tabs do not
consume mission time. The ordinary wave/upgrade loop is suspended during missions.

Mission results save medals, fastest completion time, best score, attempts, and
personal-best dates locally on this device. Slower replays and failures never
remove an earned medal. The mission board reports unavailable browser storage;
progress then remains available for the current session. Six new custom badge
trophies reward mission completion, gold medals, precision, siege and power
mastery, and all 24 gold medals. The original Platinum requirement is unchanged.

`src/havocChallenges.js` owns mission definitions, saves and rules;
`src/havocChallengeMode.js` owns in-world markers and the objective HUD;
`src/havocChallengesUI.js` owns the mission menu, with shared campaign shell and
roster styles in `src/championshipTour.css` and mission-specific styles in
`src/havocChallenges.css`. `npm test` covers progression,
medal boundaries, power restrictions, timing, and same-frame collateral. Asset
smoke checks validate actual mission targets and protected structures in every city.

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
  monsters.js         # Selectable kaiju, stats, powers, and procedural fallback meshes
  city.js             # Procedural Tokyo layout + GLB building/debris placement
  enemies.js          # Tank, Helicopter, Mech, Jet, Artillery, Soldier, BossMech
  effects.js          # Legacy particle effects (explosions, sparks, beams)
  vfx.js              # Shader-based VFX manager with quality tiers + flipbook cache
  kaijuLoader.js      # GLB model and animation loading for the kaiju roster
  pickups.js          # HP / rage / score pickups
  audio.js            # Procedural Web Audio synthesis
  quality.js          # Device detection + graphics quality tiers (low/med/high)
assets/
  buildings/          # 22 Meshy AI GLB building models (landmarks + generic)
  debris/             # 6 Meshy AI GLB debris/rubble models
  kaiju_model/        # Gorrak and the six new kaiju, each in one animated GLB
  ghidorah_model/     # Ghidorah GLB animations (21 clips)
  mecha_model/        # Mecha GLB animations (20 clips)
  godzilla.webp       # Character select portrait
  ghidorah.webp       # Character select portrait
  mecha.webp          # Character select portrait
  music.mp3           # Background music loop
```

### 3D Models

The original models were generated with [Meshy AI](https://www.meshy.ai/) and exported as `.glb` files. The game loads building and debris templates once during the loading screen and clones them as needed.

**Kaiju** share a GLB format that packs each model, skin, textures, and animation clips into one file. The `kaijuLoader.js` module creates an `AnimationMixer` and exposes `play()` and `playOnce()` for animation blending.

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

To enable hosting, open the repository's **Settings → Pages**, choose
**Deploy from a branch**, select **main** and **/ (root)**, then save.
Once enabled, pushing changes to `main` automatically updates the site.
`.nojekyll` keeps the HTML, ES modules, and game assets served as static files
without Jekyll processing.

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


## Chicago graphics and gameplay pass

Grant Park festival crowds now have articulated limbs and individual reaction
speeds. Nearby guests flee toward safer entrances, steer around live structures
and water, and escape when they reach a gate. Crowd movement uses one instanced
draw with GPU limb animation and a 30 Hz steering update.

Festival lawns have varied wear, concession and entrance pennants move in the
wind, and lakefront foam advances toward the shore with subtle offshore whitecaps.
Tents, fences, and buildings below the kaiju's lower-body clearance crush on
contact without pushing it back. Bridges and taller buildings remain solid.
Festival destruction uses small panels, dust, and sparks, with lighter camera
shake; masonry retains heavier debris and smoke.

Power effects now run their complete expiry callback when removed by the effect
budget or a scene reset. Missile trails also clean up on expiry and retirement.

Run `npm install`, `npm test`, and `npm run smoke` for the regression and asset
checks. To play locally, run `python -m http.server 8765` from the repository,
then open `http://localhost:8765/?level=chicago`.


### Power effects

Power VFX combine the shipped animated fire/smoke/dust sprite sheets with
camera-facing energy ribbons, instanced debris and short impact flashes.
Roars use broken condensation fronts; tail and wing attacks leave directional
vapor and dust; the plasma cannon reveals narrow moving strands; electrical
attacks use thin branching arcs. Missile volleys launch in sequence above the
ground with ballistic flight and textured exhaust. Atomic detonations combine
a short flame eruption, flying embers, and an irregular rising smoke column.
The former luminous domes and large spherical hit flashes are removed from
the upgraded path. Bloom is narrower, and sun shafts no longer smear every
bright effect across the scene. Existing impact scorch decals remain bounded
and fade out.

The textured particles share one instanced draw per layer, with fewer particles
on lower quality tiers. The shader fallback also works before the sheets load.
`npm test` checks cleanup, finite instance data, draw counts, and missile
impacts/cancellation. `?vfx=legacy` retains the original effects for comparison.


## Lone Soldier

Choose **Lone Soldier · First Person** in the main menu, select Infantry,
Tank, or Helicopter, then choose the opposing Kaiju and deploy. Each role
has its own health, movement speed, weapon damage and firing cadence.
The AI Kaiju pursues you, crushes buildings and telegraphs aimed beam attacks.
Move out of its firing solution or use buildings as cover. Defeat its health
bar to win; losing your unit ends the sortie.

WASD moves, mouse aims, hold left mouse / controller attack fires, Shift
sprints, and Escape pauses. Helicopter altitude uses E/Space to ascend and
Q/C to descend. A first-person weapon/cockpit view, crosshair, unit health and
Kaiju health replace the monster powers HUD. The regular Havoc mode remains
available from the mode selector.


### Blender art sources

The infantry first-person rifle, camouflage sleeves and posed gloves are
loaded from `assets/viewmodels/infantry_view.glb`; its editable `.blend` and
rebuild script `tools/build_infantry_view.py` are included. The model uses seven
material batches, embedded camouflage texture, beveled rifle details, recoil
and movement sway.

Festival guests use a Blender-authored 756-triangle human mesh, with shaped
faces, hair, separate shoes, rounded limbs and muted clothing colours.
`tools/build_festival_person.py` rebuilds its editable `.blend` and runtime
`festival_person.json`, including shader articulation metadata. Knee and
elbow bends and varied complexions remain in the single instanced crowd draw.
The deployment selectors and Lone Soldier HUD share the main HUD's colour,
font, panel and spacing tokens.


The crowd's shared 16-style cotton atlas adds weave, fabric folds, stripes,
plaid, seam wear and original Chicago/lakefront/festival prints. It uses one
texture sampler within the existing crowd material, with per-person atlas
selection; it does not add a draw call per person. Rebuild the atlas with
`python tools/build_crowd_shirts.py`.
