# Game Assets

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
