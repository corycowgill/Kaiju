# Game Assets

## Character-select portraits (optional)

Drop a portrait image for any kaiju at one of these paths and it'll be used
on the title screen instead of the auto-generated 3D preview:

```
assets/godzilla.png    # or .jpg / .jpeg / .webp
assets/ghidorah.png
assets/mecha.png
```

Recommended: square aspect (e.g. 512×512), PNG with transparency. The image
is `background-size: contain`, centered, with the monster's gradient
background still visible behind it.

If a file is missing, the game falls back to:
1. The 3D-rendered portrait of the kaiju mesh, then
2. The original emoji glyph.

---

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

The 🔊 button mutes everything (SFX + music).
