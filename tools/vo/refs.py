# Reference voices for the two announcers: synthetic Kokoro voices (hexgrad/Kokoro-82M from the Hub), no real person.
import soundfile as sf, numpy as np, sys
from kokoro import KPipeline
REFS = {
  'mike':  ('a', 'am_fenrir', 1.0, "Welcome to Grant Park, Chicago! What a night this is going to be, folks. A hundred thousand people are on their feet, and I have never seen anything like it in thirty years of calling fights!"),
  'vance': ('b', 'bm_lewis', 1.05, "Oh, please. I have managed champions, I have dined with royalty, and I am telling you, that overgrown hedgehog does not belong in the same ring. It is simply a matter of class."),
}
for name, (lang, voice, speed, text) in REFS.items():
    pipe = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M')
    audio = np.concatenate([a for _, _, a in pipe(text, voice=voice, speed=speed)])
    sf.write(f'ref_{name}.wav', audio, 24000)
    print(name, voice, round(len(audio) / 24000, 1), 's')
