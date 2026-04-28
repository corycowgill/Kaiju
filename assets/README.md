# Game Assets

All 3D models are generated with [Meshy AI](https://www.meshy.ai/) and exported as `.glb` files.

## Kaiju Models

Each kaiju has its own directory with 18-21 separate animation GLB files (~7-9 MB each).
The game loads these via `kaijuLoader.js` which de-duplicates files and creates an AnimationMixer.

```
kaiju_model/    # Gorrak (Godzilla) - 18 animations
ghidorah_model/ # Tridon (Ghidorah) - 21 animations
mecha_model/    # Mechra (Mecha)    - 20 animations
```

Animations include: idle, walk, run, sprint, turn left/right, skill attacks,
stomp, jump, death, dance, punch combo, and variant-specific moves (tantrum,
flex, agree, spell casts, shrug, walk backward, cheer, etc.).

## Building Models

22 GLB models in `buildings/`, loaded once as templates during the loading
screen, then cloned per-instance across the procedurally generated city.

**Landmarks** (one each):
- `tokyo_tower.glb`, `tokyo_skytree.glb`, `tokyo_dome.glb`
- `cocoon_tower.glb`, `twin_towers.glb`, `roppongi_hills.glb`
- `nuclear_plant.glb`, `pagoda.glb`
- `buddhist_temple.glb`, `shinto_shrine.glb`

**Generic buildings** (randomly placed, multiple instances):
- Tall: `skyscraper_large_1.glb`, `skyscraper_large_2.glb`, `narrow_tall_1.glb`, `narrow_tall_2.glb`
- Medium: `skyscraper_medium_1.glb`, `skyscraper_medium_2.glb`, `condo_1.glb`, `condo_2.glb`
- Short: `shopping_1.glb`, `shopping_2.glb`, `shopping_3.glb`

Each model is auto-scaled to a target height and given an AABB collision
hitbox derived from its bounding box.

## Debris Models

6 GLB models in `debris/`, used for building destruction effects. When a
building collapses, random debris models are cloned, scaled to the building's
proportions, and launched with physics (gravity, bounce, angular velocity).
Ground rubble also uses these models.

```
debris_slab_1.glb      # Torn-off building section
debris_twisted_1.glb   # Buckled and twisted metal/concrete
debris_concrete_1.glb  # Jagged broken concrete chunk
debris_concrete_2.glb  # Jagged broken concrete variant
debris_concrete_3.glb  # Jagged broken concrete variant
debris_chunk_1.glb     # Massive irregular concrete chunk
```

## Character-select Portraits

Portrait images used on the title screen monster selection cards:

```
godzilla.jpeg
ghidorah.jpeg
mecha.jpeg
```

If a file is missing, the game falls back to the monster's emoji glyph.

## Music

Drop your in-game audio file here as **`music.mp3`** (or `.ogg` / `.wav`).

The game tries the following paths in order at level start and uses the first
one that loads:

```
assets/music.mp3
assets/music.ogg
assets/music.wav
```

If none of them load, the game falls back to a procedurally synthesized
ambient drone so there's always something playing.

The track is looped seamlessly via the Web Audio API (`AudioBufferSourceNode`
with `loop = true`). It fades in over 1s on level start and fades out over 0.5s
on game over.

The speaker button mutes everything (SFX + music).
