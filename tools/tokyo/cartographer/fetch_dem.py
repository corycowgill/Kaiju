"""Terrarium elevation tiles -> dem.npy over the surround. Usage: python3 -I fetch_dem.py <outdir>"""
import sys, math, urllib.request, io, os, time
import numpy as np
from PIL import Image
Z = 12; out = sys.argv[1]; os.makedirs(out, exist_ok=True)
def tx(lon): return (lon + 180) / 360 * 2 ** Z
def ty(lat): return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** Z
x0, x1 = int(tx(139.62)), int(tx(139.90)); y0, y1 = int(ty(35.79)), int(ty(35.54))
A = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
        u = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png' % (Z, x, y)
        d = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'level-tools/1.0'}), timeout=60).read()
        im = np.asarray(Image.open(io.BytesIO(d)).convert('RGB')).astype(np.float32)
        A[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768
        time.sleep(0.3)
np.save(os.path.join(out, 'dem.npy'), A); open(os.path.join(out, 'dem.txt'), 'w').write('%d %d %d' % (Z, x0, y0))
print(A.shape, A.min(), A.max())
