# KAIJU HAVOC videos

Studio intro, one battle video per kaiju, a trailer, and muted card previews. Played by `src/intro.js`
(the intro on first load each session, card previews on the monster-select screen, and the WATCH TRAILER modal).

| File | Length | Use |
|---|---|---|
| `intro_hallucinated_games.mp4` / `_480p.mp4` / `.webm` | 15.2 s | Studio card, then the KAIJU HAVOC title slam (first load) |
| `battle_gorrak.mp4` / `_480p.mp4` | 40.0 s | Gorrak battle (trailer modal) |
| `battle_tridon.mp4` / `_480p.mp4` | 40.0 s | Tridon battle |
| `battle_mechra.mp4` / `_480p.mp4` | 40.0 s | Mechra battle |
| `kaiju_havoc_trailer.mp4` / `_480p.mp4` | 34.2 s | Intro plus highlights of all three |
| `preview_<kaiju>.mp4` | 6 s, muted | Looping monster-card hover/selected preview (`preload="none"`) |
| `shots.json` | | Every cloud prompt, its model, its cost and Kimi's review score |

Encodes: 1280x720 H.264 main profile plus 854x480 H.264 baseline for phones (picked when `isMobile`), 30 fps, AAC,
`+faststart`, -14 LUFS integrated. The intro also has a 720p VP9/Opus WebM fallback. The delivery and fallback
pattern matches the studio's Iron Strait cutscenes: MP4 then WebM sources; try with sound, then fall back to muted
autoplay with a TAP FOR SOUND hint; skip on any key, click, tap or gamepad button; go to the menu if every source
fails or nothing plays within 10 s. `?intro=0` or `?nointro` skips it, and automated browsers (`navigator.webdriver`)
skip it unless `?intro=1`.

## How they were made

- **Start frames**: Blender Cycles (CPU) renders of the game's own GLBs: the three kaiju models posed from their
  animation clips, `assets/buildings/*`, `assets/military/*`, and crowds of `assets/enemies/pedestrian` clones baked
  from its Running clips, on a dusk or neon street.
- **Cutaway keyframes** (train platform, scramble crosswalk, elevated highway): FLUX.2 [dev] edit
  (`fal-ai/flux-2/edit`), with the kaiju render as the reference image.
- **Clips**:
  - Wan 2.2 I2V A14B (`Wan-AI/Wan2.2-I2V-A14B`, fal-ai, 720p, 81 frames): 16 clips (stomp, roar, beam, military,
    collapse per kaiju, plus the neon city).
  - MiniMax H3 (`minimax/h3/image-to-video`, fal-ai, 768P, 5 s, native audio): 10 drama and crowd shots. Their
    screams, rumbles and explosions are mixed under the score.
  - All through Hugging Face Inference Providers.
- **Director / reviewer**: Kimi K3 (`moonshotai/Kimi-K3` via deepinfra; K3.1 Pro is only served by `together`, which
  returned 402 because pay-as-you-go isn't enabled there). Kimi wrote the camera, lighting, atmosphere and sound
  prompts for the drama and crowd shots and scored every clip from a 6-frame contact sheet. Nothing scored low
  enough to re-roll. Its one reroll flag (`intro_crowd`, with an unstable silhouette late in the clip) is only used
  for its first 2.6 s.
- **Score**: `assets/music/score_*.mp3` and `intro_sting.mp3` by the audio director (see `assets/music/README.md`).
  Cuts land on the action drop at about 15 s and on the final hit at 35.0 s, where the title slams in.
  SFX come from `assets/sfx/`.
- **Edit** (ffmpeg): 2.39:1 letterbox, teal-orange grade, slow-mo on the beam and collapse, whooshes on cuts, a
  beat of silence before the hero roar. Arc: calm street, first footstep, fleeing crowds, cutaway, military, beam,
  street-level devastation, collapse, roar, title.
- **Studio card**: the official Hallucinated Games card (`brand/card.png` from the Iron Strait pipeline) with a slow push.
- **Titles and name cards**: PIL with Impact, Bahnschrift and Yu Gothic.

## Cost (estimated from the providers' published prices)

| Item | Calls | Price | Est. |
|---|---|---|---|
| Wan 2.2 I2V A14B, 720p | 16 | $0.08 per video-second (5.06 s at 16 fps) | $6.48 |
| MiniMax H3, 768P, 5 s | 10 | $0.06/s | $3.00 |
| FLUX.2 [dev] edit, 1280x720 | 3 | $0.012/MP in+out | $0.12 |
| Kimi K3 (deepinfra) | 52 | $2.85 / $14.25 per M tokens in/out | $0.97 |
| **Total** | | | **$10.57** (cap $15) |

The AI-generated video is the studio's own content for KAIJU HAVOC. It shows only the game's original kaiju
(Gorrak, Tridon, Mechra).
