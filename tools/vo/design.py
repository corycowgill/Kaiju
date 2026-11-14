# Designs the two announcers' voices from written descriptions of how they should sound and deliver.
#   python tools/vo/design.py [--n 3]
# Model: Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign (from the Hugging Face Hub): speech in a voice built
# from a natural-language description. For each announcer it makes reference clips at two heats
# ('hot': full cry at a big moment, 'talk': animated banter), several takes each, and keeps the
# take that measures liveliest (pitch movement, level, pace) while still saying its words.
# The descriptions set the standard of a classic two-man wrestling booth: the passionate, righteous,
# full-throated play-by-play man who elevates the drama, and the gleeful, quick-witted heel
# colour man who backs the villains and needles him. Original voices: no real announcer is cloned.
import argparse, json, os, re, sys
import numpy as np, soundfile as sf, torch, librosa
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument('--n', type=int, default=3); ap.add_argument('--only', default=''); args = ap.parse_args()

VOICES = {
  'mike': {
    'band': (95, 240),
    'who': ("Male voice. A veteran American professional wrestling play-by-play announcer, a big man in his late fifties. A very deep, low-pitched, booming "
            "bass-baritone with gravel in it and a warm heartland twang. Commanding and authoritative: the trusted voice of the broadcast, sincere, upright, "
            "righteous, with total conviction. "),
    'hot': ("He is calling the biggest moment of the night over a roaring stadium crowd: a deep, booming, full-throated roar of enormous passion, "
            "awestruck and thrilled, righteous and emphatic, every phrase punched hard and building to a crescendo. Urgent and electric, but always a deep man's voice."),
    'talk': ("He is calling the action with high energy and excitement: loud, lively, confident and emphatic, a storyteller selling every moment, "
             "with warmth and a note of righteous indignation when the villain cheats."),
    'text_hot': "Great Chicago Fire! He did it! He did it! Holy Lake Michigan, what a shot! This crowd is on its feet, and I have never seen anything like it in all my years! He's got him up! This could be it! It's over! It is over!",
    'text_talk': "Welcome to Grant Park, folks, and what a night this is going to be! A hundred thousand people are here to see the heavyweight title decided. He's taking the fight right to him! Now that is despicable. He hit him before he was ready!",
  },
  'vance': {
    'band': (120, 270),
    'who': ("Male voice, a grown man in his fifties with a medium-pitched, raspy, gravelly chest voice. A fast-talking carnival barker and game-show host "
            "turned villainous wrestling colour commentator: slick, smarmy, theatrical and quick-witted, with big swings of inflection. "),
    'hot': ("He is jubilant: bellowing and crowing with triumphant, boisterous excitement, a big raucous belly laugh, gloating at full volume, "
            "selling every word like a showman. Loud, fast and exuberant, in a man's raspy mid-range voice."),
    'talk': ("He is gleefully needling his broadcast partner: lively, loud and animated, dripping with sarcasm and mock outrage, relishing every word "
             "like a salesman closing a deal, with a hearty chuckle. A man's raspy mid-range voice."),
    'text_hot': "Yes! Yes! Did you see that? Tell me you saw that! Beautiful! Hang that one in a museum! I told you! I have been telling you people for years! Brains beats brawn every single time, Brannigan! What a champion!",
    'text_talk': "Oh, please! That's not cheating, Brannigan, that's strategy! I love it! He slipped! The ground is uneven, it's a park! You know what your hero's problem is? No vision. None whatsoever!",
  },
}
norm = lambda s: re.sub(r"[^a-z0-9 ]", '', s.lower()).split()

from transformers import pipeline
_gender = pipeline('audio-classification', model='alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech', device=0)
def male(x, sr):
    """How sure a classifier is that the speaker is a man (0..1)."""
    y = librosa.resample(x, orig_sr=sr, target_sr=16000)[:16000 * 12]
    return next((r['score'] for r in _gender({'raw': y, 'sampling_rate': 16000}) if r['label'].lower().startswith('m')), 0.0)

def lively(x, sr):
    """How worked up a clip sounds, from what can be measured: pitch range (semitones, 10th-90th percentile), level, pace."""
    f0, _, _ = librosa.pyin(x.astype(np.float64), fmin=60, fmax=600, sr=sr, frame_length=2048)
    f0 = f0[~np.isnan(f0)]
    if len(f0) < 20: return 0, {}
    st = 12 * np.log2(f0 / np.median(f0))
    rng = float(np.percentile(st, 90) - np.percentile(st, 10))
    rms = librosa.feature.rms(y=x)[0]; loud = float(np.percentile(rms, 90))
    return rng, dict(pitch_hz=round(float(np.median(f0))), range_st=round(rng, 1), loud=round(loud, 3), secs=round(len(x) / sr, 1))

model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', device_map='cuda:0', dtype=torch.bfloat16)
report = json.load(open(os.path.join(HERE, 'out', 'design.json'))) if os.path.exists(os.path.join(HERE, 'out', 'design.json')) else {}
TAKES = os.path.join(HERE, 'out', 'takes'); os.makedirs(TAKES, exist_ok=True)
takes = [t for t in (json.load(open(os.path.join(TAKES, 'index.json'))) if os.path.exists(os.path.join(TAKES, 'index.json')) else []) if args.only and args.only not in (t['who'], t['who'] + '_' + t['heat'])]
for name, v in VOICES.items():
    for heat in ('hot', 'talk'):
        if args.only and args.only not in (name, f'{name}_{heat}'): continue
        text, instruct = v['text_' + heat], v['who'] + v[heat]
        best = None
        for k in range(args.n):
            wavs, sr = model.generate_voice_design(text=text, language='English', instruct=instruct)
            x = np.asarray(wavs[0], dtype=np.float32)
            words = len(norm(text)); rate = words / max(0.1, len(x) / sr)
            s, info = lively(x, sr)
            mp = male(x, sr); lo, hi = v['band']
            # a take to copy keeps a sane pace, is a man's voice, and sits in the announcer's own register
            ok = 1.5 <= rate <= 5.5 and mp >= 0.75 and lo <= info.get('pitch_hz', 0) <= hi
            info.update(words_per_s=round(rate, 2), take=k, male=round(mp, 2))
            print(name, heat, info, '' if ok else '(rejected)', flush=True)
            # every take is kept for audition (tools/vo/player.html, "Design takes")
            fn = f'{name}_{heat}_{k}.wav'; sf.write(os.path.join(TAKES, fn), x, sr)
            takes.append(dict(info, who=name, heat=heat, file=fn, ok=bool(ok), kept=False))
            json.dump(takes, open(os.path.join(TAKES, 'index.json'), 'w'), indent=1)
            if ok and (best is None or s > best[0]): best = (s, x, sr, info)
        if best is None: print(f'NO usable take for {name} {heat}', flush=True); continue
        for t in takes: t['kept'] = t['kept'] or (t['who'] == name and t['heat'] == heat and t['take'] == best[3]['take'])
        json.dump(takes, open(os.path.join(TAKES, 'index.json'), 'w'), indent=1)
        sf.write(os.path.join(HERE, f'ref_{name}_{heat}.wav'), best[1], best[2])
        open(os.path.join(HERE, f'ref_{name}_{heat}.txt'), 'w', encoding='utf8').write(text)
        report[f'{name}_{heat}'] = dict(best[3], instruct=instruct)
json.dump(report, open(os.path.join(HERE, 'out', 'design.json'), 'w'), indent=1)
print('kept', {k: (v['pitch_hz'], v['range_st'], v['words_per_s']) for k, v in report.items()})
