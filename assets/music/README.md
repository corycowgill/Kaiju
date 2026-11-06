# KAIJU HAVOC video score

Cinematic cues for the promo videos: the Hallucinated Games intro and one battle video per kaiju. They aren't used by
the game itself; the in-game loop is `assets/music.mp3`.

Generated with **Stable Audio 3 small music** (`stable_audio_3_small_music`, Stability AI) and the `t5gemma_b_b_ul2`
text encoder: 8 steps, cfg 1.0, `lcm` sampler, `simple` schedule, run on CPU through ComfyUI's comfy package.
The Stable Audio 3 license applies (https://stability.ai/license).

Each battle score is a single 40 s generation, so there are no internal seams and tempo and key stay consistent. It is
then shaped into the arc and a separately generated impact hit is layered on top:

| Section | Time | Treatment |
|---|---|---|
| Eerie calm | 0–6 s | bed at -6 dB, low-passed at 1.4 kHz |
| Rising tension | 6–15 s | filter opens and gain ramps up to 0 dB |
| Full action | 15–35 s | unprocessed |
| Final hit and tail | 35–40 s | bed ducks 12 dB in the 0.4 s before the hit and is gone 0.6 s after; the hit transient lands exactly at 35.00 s; 1 s fade to 40 s |

The intro is a glitch-synth riser with the impact transient placed at 6.00 s and its reverb tail running to 12 s.

Mastering: integrated loudness -14 LUFS (BS.1770 / ffmpeg ebur128), stereo-linked lookahead limiter, peaks at or
below -1.3 dBFS. Files are stereo, 44.1 kHz, as OGG Vorbis q5 and MP3 LAME V2.

| File | Length | Prompted tempo / key | Hits (s) | Sources (prompt summary) |
|---|---|---|---|---|
| `intro_sting` | 12.0 s | 90 BPM, D minor | riser peaks into the title hit at **6.03** | "ethereal glitch synth riser, granular stutter, airy pads, reversed shimmer" + "massive taiko, low brass chord, cymbal crash, long reverb" |
| `score_gorrak` | 40.0 s | 100 BPM, D minor | 6.1 (tension), 10.9, **15.7 (action drop)**, 20.6, **35.03 (final hit)** | "primal orchestral kaiju battle theme, ominous low horns, staccato strings, massive brass, taiko, epic choir" + D-minor taiko/brass hit |
| `score_tridon` | 40.0 s | 128 BPM, E minor | 9.4, 13.2, **15.0 (action drop)**, **35.03 (final hit)** | "hybrid trailer music, electric synth arpeggios, buzzing bass, staccato strings, taiko, brass stabs, choir, electric guitars" + E-minor taiko/brass/synth-stab hit |
| `score_mechra` | 40.0 s | 120 BPM, C minor | 4.6, 8.6, **15–16 (action rise)**, **35.02 (final hit)** | "epic industrial battle score, mechanical ambience, metallic percussion ostinato, anvil hits, taiko, distorted brass, choir" + C-minor taiko/anvil/brass hit |

The tempo and key in the table are what the prompts asked for. Autocorrelation found no reliable beat grid, so cut to
the hit timestamps rather than to bars.

## trailer_score (44.2 s)

A monster-movie trailer cue cut to the trailer edit, with transients placed within 5 ms of each timestamp.
Ships as `trailer_score.mp3`, `.ogg`, and a 16-bit stereo WAV master. Loudness is -14.0 LUFS integrated, with peaks at
-1.9 dBFS.

It is assembled entirely from material generated earlier with the same model; no new generation was used. It is
original and quotes no film themes.

| Time | Content |
|---|---|
| 0–3.2 s | near-silent glitch shimmer (intro riser source at -20 dB) and a tiny chime at **0.60** |
| 3.2–9.2 s | cold open: Gorrak score's eerie opening, low-passed at 900 Hz, plus a distant air-raid siren (SFX model, low-passed); soft taiko title hits at **5.20** and **7.90**; the Gorrak score's string build, ramped up 10 dB, rises into 9.2 |
| **9.20** | big hit (D-minor taiko/brass) → Gorrak action (score_gorrak 16–26 s) |
| **19.20** | big hit (E-minor taiko/brass/synth) → Tridon action (score_tridon 18–28 s) |
| **29.20** | big hit (C-minor taiko/anvil/brass) → Mechra action (score_mechra 17–26.6 s) |
| 38.80–39.20 | digital silence |
| **39.20** | final slam (D-minor taiko/brass layered with the C-minor anvil hit), reverb tail, fade to silence by 44.2 |

Section boundaries are hard cuts hidden under the hits. Tempo is free: each section keeps its source score's tempo.
