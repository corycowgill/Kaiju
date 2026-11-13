# Commentary voice-over

The title match is called by two announcers (src/wrestling/commentary.js):

- **Mike Brannigan** (M): play-by-play, the straight man. Backs the faces.
- **Sterling Vance** (V): colour. Backs the heels, makes their excuses, needles Mike.

Which kaiju is a face or a heel is in `src/wrestling/roster.js`.

## Adding or changing lines

1. Edit `script/*.txt`. `@ topic cond...` opens a block; each paragraph is one entry: one line, or an exchange
   (`M:` / `V:` lines said back to back). Conditions: `a:` / `v:` (who does it / who it is done to: gorrak,
   mechra, tridon), `aa:` / `va:` (their alignment: face, heel), `mu:` (fh, hh, ff), `pair:x+y`, `lm:` (a landmark
   id), `m:` (a signature move id). The topics and what fires them are in `subscribe()` in commentary.js.
2. `node tools/vo/build.mjs` writes `src/wrestling/commentaryLines.js` and `out/utterances.json`.
3. `python tools/vo/tts.py` voices what is new into `assets/vo/` (needs a CUDA GPU; see the header of tts.py),
   then run `build.mjs` again so the game knows the new clips' lengths.

A line that has no clip is shown as a caption only.

## A new kaiju

Add it to `roster.js` with its alignment. Lines that only depend on alignment work at once; to be named on air it
needs its own lines (`a:` / `v:` / `pair:`) and a key in `KEY` in build.mjs.

## Voices

`ref_mike.wav` / `ref_vance.wav` are the two timbres (made by `refs.py` from synthetic Kokoro voices, nobody
real). Change a reference, delete `out/durations.json` and `assets/vo/*.mp3`, and run tts.py to re-voice everything.
