# KAIJU HAVOC videos

A classic giant-monster movie trailer homage for KAIJU HAVOC, plus a 10 s battle clip per kaiju and muted card
previews. Played by `src/intro.js`: the trailer on first load each session (it opens on the studio card, so it is
also the intro), card previews on the monster-select screen, and the WATCH TRAILER modal (trailer, then the three
battle clips).

| File | Length | Use |
|---|---|---|
| `kaiju_havoc_trailer.mp4` / `_480p.mp4` / `.webm` | 44.2 s | On-load intro + trailer modal |
| `battle_gorrak.mp4` / `_480p.mp4` | 10.0 s | Gorrak: evacuation, military, ATOMIC BREATH to mushroom cloud |
| `battle_tridon.mp4` / `_480p.mp4` | 10.0 s | Tridon: station evacuation, helicopters and tanks, VOLT BEAM and lightning over Tokyo Tower |
| `battle_mechra.mp4` / `_480p.mp4` | 10.0 s | Mechra: police-directed evacuation, tanks and jets, MISSILE BARRAGE into PLASMA CANNON |
| `preview_<kaiju>.mp4` | 6 s, muted | Looping monster-card hover/selected preview (`preload="none"`) |
| `menu_loop.mp4` | 20.1 s, muted | Title-screen backdrop (desktop only, game.js `_menuReel`): the military + signature-attack shots of the three battle clips (2.9-10 s each, past the title cards), letterbox cropped to 1280x536, 0.6 s crossfades, faded in/out at the loop point; H.264 main CRF 29, no audio, `+faststart`, 2.7 MB |
| `shots.json` | | Every cloud generation: prompt, model, cost, Kimi review (rejected and test clips included) |

Trailer structure:

| Time | Section |
|---|---|
| 0–3.2 s | Hallucinated Games studio card |
| 3.2–9.2 s | Cold open: storm sirens and searchlights, "THIS SUMMER...", the crosswalk crowd looking up, "TOKYO WILL FALL" |
| 9.2–19.2 s | Gorrak |
| 19.2–29.2 s | Tridon |
| 29.2–39.2 s | Mechra |
| 39.2 s | Beat of silence, then the KAIJU HAVOC title slam |

Each kaiju block runs civilians evacuating (2.8 s), military attacking (2.7 s), then the signature attack
(4.5 s, slow-mo).

**Encodes**
- 1280x720 H.264 main profile, plus an 854x480 H.264 baseline encode for phones (picked when `isMobile`).
- 30 fps, AAC, `+faststart`, about -14 LUFS.
- The trailer also has a 720p VP9/Opus WebM fallback.

**Playback** (the same pattern as the studio's Iron Strait cutscenes)
- Sources are MP4, then WebM.
- It tries to play with sound, then falls back to muted autoplay with a TAP FOR SOUND hint.
- Any key, click, tap or gamepad button skips it.
- It goes straight to the menu if every source fails or nothing has played after 10 s.
- `?intro=0` or `?nointro` skips it. Automated browsers skip it unless `?intro=1`.

## How they were made

- **Model choice.** I compared the image-to-video models live on Hugging Face Inference Providers: MiniMax H3,
  LTX-2 19B, Wan 2.2/2.1, HunyuanVideo-I2V, SkyReels, Ovi, and the wavespeed variants. The top two by quality, MiniMax
  H3 and LTX-2 19B (distilled), were tested head-to-head on the same Gorrak keyframe and prompt. H3 won clearly on
  coherent motion, scale and the physics of destruction. LTX-2 lost the subject and the beam. All 11 shots are
  **MiniMax H3** (`minimax/h3/image-to-video`, fal-ai via HF, 768P native, 5–6 s, native audio). The 768P output is
  downscaled to 720p.
- **Keyframes.** Made with **FLUX.2 [dev] edit** (`fal-ai/flux-2/edit`), using the game's own Blender renders of
  the kaiju GLBs as the reference so each kaiju stays on-model. A "design lock" sentence in every keyframe and video
  prompt pins the silhouette: Gorrak is a horned, gorilla-shouldered brute, not a dinosaur. Two shots that drifted
  off-model (three rejected takes in total) were re-rolled with H3's `end_image_url`, so the clip is pinned between on-model frames:
  - Gorrak's attack, pinned to a start and a mushroom-cloud end keyframe.
  - Mechra's military shot, pinned to its own keyframe.
- **Director / reviewer.** **Kimi K3** (`moonshotai/Kimi-K3` via deepinfra) wrote the keyframe and video prompts
  (camera, lighting, atmosphere, motion beats and diegetic sound) and scored every clip from contact sheets. Its one
  reroll flag (Mechra military, an identity shift) was regenerated.
- **Edit** (ffmpeg):
  - 2.39:1 letterbox, a light teal-orange grade, film grain, slow-mo on the attacks.
  - H3's native audio (sirens, screams, cannon fire, roars) mixed under the score, plus SFX from `assets/sfx`.
  - Title cards in Impact (PIL).
  - The score is `assets/music/trailer_score.mp3` by the audio director, with hits locked to the cuts at 5.2, 7.9,
    9.2, 19.2, 29.2 and 39.2 s. The battle clips use `score_*.mp3`, with the action drop on the attack cut.
- **Studio card.** The official Hallucinated Games card (`brand/card.png` from the Iron Strait pipeline) with a slow
  push.
- **IP.** This is a genre homage only. No real film, studio, monster name, theme or likeness appears in any prompt,
  title or audio; the kaiju are the game's Gorrak, Tridon and Mechra.

## Cost (this job, estimated from providers' published prices; cap $15)

| Item | Calls | Price | Est. |
|---|---|---|---|
| MiniMax H3, 768P (11 shipped shots + 3 rejected takes) | 14 | $0.06/s | $4.56 |
| LTX-2 19B distilled test shot | 1 | $0.0008/MP | $0.11 |
| FLUX.2 [dev] edit keyframes | 16 ok (+3 rejected by the content checker, not billed) | $0.012/MP in+out | $0.38 |
| Kimi K3 (deepinfra) | 33 | $2.85 / $14.25 per M tokens | $0.53 |
| **Total** | | | **$5.59** |

The previous round of videos (Wan 2.2 + H3, $10.57) has been replaced by these.
