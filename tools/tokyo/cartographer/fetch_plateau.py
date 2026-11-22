#!/usr/bin/env python3
"""Fetch the PLATEAU building tiles (Project PLATEAU 3D city model, Tokyo 23 wards, CityGML 2020 as Mapbox
Vector Tiles by Indigo: measuredHeight per building) covering the Tokyo play box, z16.
usage: python3 -I fetch_plateau.py <out_dir>   (tiles land in <out_dir>/16/<x>/<y>.pbf; already-fetched tiles are kept)
"""
import math, os, sys, time, urllib.request
OUT = sys.argv[1]
S, N, W, E = 35.6240, 35.6885, 139.7370, 139.7860
Z = 16
URL = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf'
def tile(lat, lon):
    n = 2 ** Z
    return int((lon + 180) / 360 * n), int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
x0, y0 = tile(N, W); x1, y1 = tile(S, E)
got = miss = 0
for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
        p = os.path.join(OUT, str(Z), str(x), f'{y}.pbf')
        if os.path.exists(p): got += 1; continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers={'User-Agent': 'level-tools/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r: data = r.read()
            open(p, 'wb').write(data); got += 1
        except Exception as e:
            miss += 1  # (a bay tile with no buildings is a 404)
        time.sleep(0.05)
print(f'tiles x {x0}..{x1}, y {y0}..{y1}: {got} on disk, {miss} missing (open water)')
