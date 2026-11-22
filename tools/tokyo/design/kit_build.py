# Tokyo generic kit: build + export every piece (design-kit).
#   blender -b -P tools/tokyo/design/kit_build.py -- [name-or-prefix ...]     (no names: everything)
# Writes assets/buildings/tokyo/<name>.glb + <name>_lod1.glb and per-piece stats / atlas PNGs to the
# scratch folder (KIT_SCRATCH env). kit_manifest.py turns the stats into manifest_kit.js.
import sys, os, json, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import kit_lib
from kit_lib import Kit, export_kit

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'buildings', 'tokyo')
SCRATCH = os.environ.get('KIT_SCRATCH', '/tmp/tokyo_kit')
MODULES = ['kit_zakkyo', 'kit_house', 'kit_lowrise', 'kit_apartment', 'kit_warehouse', 'kit_towers', 'kit_midrise', 'kit_debris', 'kit_extras']

REG = {}
def piece(name, **meta):
    def deco(fn):
        REG[name] = (fn, meta); return fn
    return deco
kit_lib.piece = piece

def main():
    for m in MODULES:
        if os.path.exists(os.path.join(HERE, m + '.py')):
            importlib.import_module(m)
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = [n for n in REG if not argv or any(n == a or n.startswith(a) for a in argv)]
    os.makedirs(OUT, exist_ok=True); os.makedirs(SCRATCH, exist_ok=True)
    for n in names:
        fn, meta = REG[n]
        t = time.time()
        try:
            k = Kit(n, seed=sum(map(ord, n)) + meta.get('seed', 0))
            kit_lib.ATLAS = meta.get('atlas', 1024)
            k.em_size = meta.get('em', kit_lib.ATLAS)
            if meta.get('debris'): k.max_ppm = 160.0
            fn(k)
            # two tiny LOD1-only triangles at the LOD0 box corners, so the twin's box is exactly the LOD0's
            mn, mx = k.bbox(0); s0 = k.faces[0][0][1]; import numpy as np
            for c, d in ((mn, 1), (mx, -1)):
                k.emit([c, c + np.array([0.03 * d, 0, 0]), c + np.array([0, 0.03 * d, 0.03 * d])], s0, [(0, 0), (0.01, 0), (0, 0.01)], None, 2)
            st = export_kit(k, OUT, os.path.join(SCRATCH, 'stats'), mat_name=meta.get('mat'), jpeg_quality=meta.get('q', 80))
            st.update({kk: v for kk, v in meta.items() if kk != 'mat'})
            with open(os.path.join(SCRATCH, 'stats', n + '.json'), 'w') as f: json.dump(st, f)
            print('BUILT %s size %s tris %d/%d kb %.0f/%.1f ppm %.1f fill %.2f lodfit %.3f (%.1fs)' % (n, st['size'], st['tris0'], st['tris1'], st['kb0'], st['kb1'], st['ppm'], st['fill'], st['lod_fit'], time.time() - t))
        except Exception:
            print('FAILED', n); traceback.print_exc()

main()
