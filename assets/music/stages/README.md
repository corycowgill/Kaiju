# Kaijupalooza! stage music

These are original instrumental loops, one per festival stage on the Chicago level. They contain no lyrics and do not
imitate any artist or song. `src/audio.js` (`updateStages`) plays each one as positional audio from its stage, and a
stage's track stops when that stage is destroyed.

The tracks were generated with **Stable Audio 3 small music** (`stable_audio_3_small_music`, Stability AI) and the
`t5gemma_b_b_ul2` text encoder: 8 steps, cfg 1.0, `lcm` sampler, `simple` schedule. Generation ran locally through
ComfyUI's comfy package, with two candidates per stage of 80–96 s each. Use is governed by the Stability AI Community
License (https://stability.ai/license), the same licence as Stable Audio Open.

Processing:
- The take was picked on steady loudness, bass presence and loop match. One main-stage take that was quiet and lacked
  bass was rejected.
- The loop start (2–10 s) and length (60–70 s) were found by matching 8 s of band-energy and onset features against
  the take itself, then refined to the sample by waveform cross-correlation.
- The end of the loop flows back into its start through a 0.3 s equal-power crossfade.
- Each loop is mono, mastered to -14 LUFS integrated with a lookahead limiter (true peak ≤ -0.8 dBFS), and encoded as
  OGG Vorbis and AAC `.m4a` (for iOS), both at 112 kbps.
- `STAGE_LOOP_SAMPLES` in `audio.js` holds each loop's exact length, which trims AAC priming and padding at the loop
  point.

| Stage | File | Loop | OGG / M4A | Prompt |
|---|---|---|---|---|
| Monster Main | `stage_monster_main` | 69.2 s | 853 / 984 KB | Big euphoric festival pop anthem, bright synth chords and plucks, punchy four-on-the-floor drums, claps, soaring wordless 'oh-oh-oh' vocal chant, stadium energy, uplifting major key, instrumental. BPM: 124. |
| Kaiju Stage | `stage_kaiju_stage` | 60.0 s | 719 / 842 KB | Big room EDM festival track, massive supersaw lead drop, pounding kick drum, snare roll build ups and risers, huge crowd energy, instrumental. BPM: 128. |
| Tremor Tent | `stage_tremor_tent` | 63.0 s | 732 / 906 KB | Deep house dance track, groovy rolling bassline, shuffled hi-hats, warm piano chords, soulful wordless vocal chops, sweaty club tent vibe, instrumental. BPM: 122. |
| Atomic Stage | `stage_atomic_stage` | 67.2 s | 762 / 940 KB | Energetic indie alt-rock instrumental, driving live drums, jangly and fuzzy electric guitars, melodic bass, wordless 'whoa-oh' gang vocals, festival live band. BPM: 140. |
| Stomp Stage | `stage_stomp_stage` | 61.7 s | 782 / 886 KB | Hard trap hip-hop beat instrumental, booming 808 bass, rapid hi-hat rolls, heavy snare, dark bell synth melody, festival bass. BPM: 140. |
| Roar Grove | `stage_roar_grove` | 69.0 s | 783 / 977 KB | Chill synth-pop electronic track, dreamy retro analog synths, soft drum machine groove, warm bass, airy wordless vocal pads, sunset festival vibe, instrumental. BPM: 100. |

Total: 9.9 MB.
