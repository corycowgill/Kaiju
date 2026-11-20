# San Francisco generic kit: build + export every piece (design-kit).
#   blender -b -P tools/sf/design/kit_build.py -- [name-or-prefix ...]     (no names: everything)
# Writes assets/buildings/sf/<name>.glb + <name>_lod1.glb and per-piece stats / atlas PNGs to the
# scratch folder (KIT_SCRATCH env, default /tmp/sf_kit). kit_manifest.py turns the stats into manifest_kit.js.
import sys, os, json, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import kit_lib
importlib.reload(kit_lib)
from kit_lib import Kit, export_kit

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'buildings', 'sf')
SCRATCH = os.environ.get('KIT_SCRATCH', '/tmp/sf_kit')
MODULES = ['kit_victorian', 'kit_brick', 'kit_lowrise', 'kit_towers', 'kit_debris']

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
            k = Kit(n, seed=abs(hash(n)) % 9973 if False else sum(map(ord, n)))
            kit_lib.ATLAS = meta.get('atlas', 1024)
            fn(k)
            st = export_kit(k, OUT, os.path.join(SCRATCH, 'stats'), mat_name=meta.get('mat'))
            st.update({kk: v for kk, v in meta.items() if kk != 'mat'})
            with open(os.path.join(SCRATCH, 'stats', n + '.json'), 'w') as f: json.dump(st, f)
            print('BUILT %s size %s tris %d/%d kb %.0f/%.1f ppm %.1f fill %.2f lodfit %.3f (%.1fs)' % (n, st['size'], st['tris0'], st['tris1'], st['kb0'], st['kb1'], st['ppm'], st['fill'], st['lod_fit'], time.time() - t))
        except Exception:
            print('FAILED', n); traceback.print_exc()

main()
