# Voices the commentary: tools/vo/out/utterances.json -> assets/vo/<id>.mp3 + tools/vo/out/durations.json.
#   python tools/vo/tts.py [--limit N] [--redo id,id] [--refs DIR]
# Models (both open, downloaded from the Hugging Face Hub, run on this machine's GPU):
#   ResembleAI/chatterbox  the voice: expressive speech in the timbre of a short reference clip
#   hexgrad/Kokoro-82M     the two reference clips (refs.py): synthetic voices, nobody real
#   openai/whisper-base.en the check: every clip is transcribed and compared with its text; a clip
#                          that drifted (dropped or invented words) is generated again, best of 3 kept
# Needs: torch (CUDA), chatterbox-tts, transformers, soundfile, ffmpeg on the PATH.
# Already voiced lines are skipped, so after editing the script only the changed lines are generated.
import argparse, difflib, json, os, re, subprocess, sys, time
import numpy as np, torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'vo')
ap = argparse.ArgumentParser()
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--redo', default='')
ap.add_argument('--refs', default=HERE)
args = ap.parse_args()

utts = json.load(open(os.path.join(HERE, 'out', 'utterances.json'), encoding='utf8'))
dur_path = os.path.join(HERE, 'out', 'durations.json')
durs = json.load(open(dur_path)) if os.path.exists(dur_path) else {}
redo = set(x for x in args.redo.split(',') if x)
os.makedirs(OUT, exist_ok=True)
todo = [u for u in utts if u['id'] in redo or not (durs.get(u['id'], 0) > 0 and os.path.exists(os.path.join(OUT, u['id'] + '.mp3')))]
if args.limit: todo = todo[:args.limit]
print(f'{len(utts)} utterances, {len(todo)} to voice', flush=True)
if not todo: sys.exit(0)

from chatterbox.tts import ChatterboxTTS
from transformers import pipeline
tts = ChatterboxTTS.from_pretrained(device='cuda')
asr = pipeline('automatic-speech-recognition', model='openai/whisper-base.en', device=0)

# How each announcer is played. exaggeration: how worked up; cfg: lower = looser and quicker.
VOICE = {
    'mike':  dict(ref='ref_mike.wav',  ex=0.68, ex_shout=0.9, cfg=0.38, cfg_shout=0.3),
    'vance': dict(ref='ref_vance.wav', ex=0.58, ex_shout=0.78, cfg=0.42, cfg_shout=0.35),
}
norm = lambda s: re.sub(r"[^a-z0-9 ]", '', s.lower().replace('-', ' ')).split()

def score(text, wav16):
    heard = asr({'raw': wav16, 'sampling_rate': 16000})['text']
    return difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio(), heard

def trim(x, sr, thr=0.012, pad=0.06):
    a = np.abs(x); idx = np.where(a > thr * max(1e-6, a.max()) * 4)[0]
    if not len(idx): return x
    return x[max(0, idx[0] - int(pad * sr)): min(len(x), idx[-1] + int(pad * 2 * sr))]

t0 = time.time(); bad = []
for n, u in enumerate(todo):
    v = VOICE[u['speaker']]
    shout = sum(1 for w in re.findall(r"[A-Z']{3,}", u['caption'])) > 0 or u['caption'].count('!') >= 2
    best = None
    for attempt in range(3):
        wav = tts.generate(u['text'], audio_prompt_path=os.path.join(args.refs, v['ref']),
                           exaggeration=v['ex_shout'] if shout else v['ex'], cfg_weight=v['cfg_shout'] if shout else v['cfg'],
                           temperature=0.8 if attempt == 0 else 0.7)
        x = wav.squeeze(0).cpu().numpy().astype(np.float32)
        x16 = torch.nn.functional.interpolate(torch.from_numpy(x)[None, None], scale_factor=16000 / tts.sr, mode='linear')[0, 0].numpy()
        s, heard = score(u['text'], x16)
        # (a clip far longer than its words need has rambled on after them)
        words = max(1, len(norm(u['text'])))
        if len(x) / tts.sr > 1.2 + words * 0.75: s -= 0.3
        if best is None or s > best[0]: best = (s, x, heard)
        if s >= 0.86: break
    s, x, heard = best
    x = trim(x, tts.sr)
    tmp = os.path.join(OUT, u['id'] + '.wav')
    import soundfile as sf
    sf.write(tmp, x, tts.sr)
    mp3 = os.path.join(OUT, u['id'] + '.mp3')
    # level to broadcast loudness, a touch of presence, mono mp3
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', 'highpass=f=70,loudnorm=I=-17:TP=-1.5:LRA=9,equalizer=f=3200:t=q:w=1.2:g=2',
                    '-ar', '24000', '-ac', '1', '-b:a', '40k', mp3], check=True)
    os.remove(tmp)
    durs[u['id']] = round(len(x) / tts.sr, 2)
    if s < 0.7: bad.append((u['id'], round(s, 2), u['text'], heard))
    if n % 10 == 0 or s < 0.7:
        json.dump(durs, open(dur_path, 'w'))
        el = time.time() - t0
        print(f"[{n + 1}/{len(todo)}] {u['id']} {durs[u['id']]}s score {s:.2f} | {el / (n + 1):.1f} s/line, {(len(todo) - n - 1) * el / (n + 1) / 60:.0f} min left{' | HEARD: ' + heard if s < 0.7 else ''}", flush=True)
json.dump(durs, open(dur_path, 'w'))
json.dump(bad, open(os.path.join(HERE, 'out', 'suspect.json'), 'w'), indent=1)
print(f'done: {len(todo)} voiced in {(time.time() - t0) / 60:.1f} min, {len(bad)} suspect (tools/vo/out/suspect.json)', flush=True)
