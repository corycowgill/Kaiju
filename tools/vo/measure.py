# How lively a set of clips measures: median pitch, pitch range (semitones, 10th-90th percentile), words per second.
#   python tools/vo/measure.py file_or_glob ...
import glob, os, sys, numpy as np, librosa
rows = []
for pat in sys.argv[1:]:
    for f in sorted(glob.glob(pat)):
        x, sr = librosa.load(f, sr=None, mono=True)
        f0, _, _ = librosa.pyin(x.astype(np.float64), fmin=60, fmax=600, sr=sr, frame_length=2048)
        f0 = f0[~np.isnan(f0)]
        if len(f0) < 10: continue
        st = 12 * np.log2(f0 / np.median(f0))
        rows.append((os.path.basename(f), float(np.median(f0)), float(np.percentile(st, 90) - np.percentile(st, 10)), len(x) / sr))
for r in rows[:12]: print(f'{r[0]:32s} pitch {r[1]:5.0f} Hz  range {r[2]:4.1f} st  {r[3]:4.1f} s')
if rows: print(f'MEAN of {len(rows)}: pitch {np.mean([r[1] for r in rows]):.0f} Hz, range {np.mean([r[2] for r in rows]):.1f} st')
