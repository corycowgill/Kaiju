#!/usr/bin/env python3
"""Refine tokyo_layout.json's building heights and styles from PLATEAU (run after gen_layout2.py; safe to re-run).

PLATEAU (Project PLATEAU, the national 3D city model; Tokyo 23 wards, CityGML 2020, as Indigo's vector tiles) gives a
measured height for every building. Each PLATEAU building part is assigned to the layout lot its centroid falls in;
a lot then takes:
  height: the height the top 35% of its parts' roof area reaches (as the other levels' layouts), when the parts
          cover at least 30% of the lot. A lot whose height came from its own OSM height / storey tag keeps it when
          PLATEAU differs by more than 1.6x (a tower finished after 2020, or a building PLATEAU split differently).
  style:  from what stands there: small low parts -> 'house'; narrow 4-12 storey parts on small plots -> 'zakkyo';
          wide mid-rise -> 'midrise' (or 'apartment' where the cartographer had a residential block); 60-120 m
          'glassslab', 120 m+ 'glasstower'; 'warehouse' lots stay warehouses; landmark footprints are untouched.
usage: python3 -I refine_heights.py <plateau_tile_dir> [layout.json]
"""
import json, math, os, sys
import mapbox_vector_tile as mvt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tkgeo import xz, SCALE  # noqa: E402

TILES = sys.argv[1]
LAYOUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../assets/levels/tokyo_layout.json')
Z = 16


def tile_lonlat(tx, ty, px, py, ext):
    """A vector-tile point (y up, as mapbox_vector_tile decodes by default) to lon / lat."""
    n = 2 ** Z
    fx, fy = tx + px / ext, ty + 1 - py / ext
    lon = fx / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n))))
    return lon, lat


def area_centroid(ring):
    a = cx = cz = 0.0
    for i in range(len(ring)):
        x0, z0 = ring[i]; x1, z1 = ring[(i + 1) % len(ring)]
        c = x0 * z1 - x1 * z0
        a += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c
    if abs(a) < 1e-9:
        return 0.0, ring[0][0], ring[0][1]
    return abs(a) / 2, cx / (3 * a), cz / (3 * a)


def inside(x, z, poly):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            c = not c
        j = i
    return c


# ---- PLATEAU parts: [(x, z, areaM2, heightM)] in the layout's frame ----
parts = []
for xd in sorted(os.listdir(os.path.join(TILES, str(Z)))):
    for f in sorted(os.listdir(os.path.join(TILES, str(Z), xd))):
        tx, ty = int(xd), int(f.split('.')[0])
        layer = mvt.decode(open(os.path.join(TILES, str(Z), xd, f), 'rb').read()).get('bldg')
        if not layer:
            continue
        ext = layer.get('extent', 4096)
        for ft in layer['features']:
            h = ft['properties'].get('measuredHeight')
            if not isinstance(h, (int, float)) or h < 2 or h > 400:
                continue
            g = ft['geometry']
            polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'] if g['type'] == 'MultiPolygon' else []
            for poly in polys:
                ring = [xz(*tile_lonlat(tx, ty, px, py, ext)) for px, py in poly[0]]
                a, cx, cz = area_centroid(ring)
                am2 = a / (SCALE * SCALE)
                if am2 >= 8:
                    parts.append((cx, cz, am2, float(h)))
print(f'{len(parts)} PLATEAU building parts')

L = json.load(open(LAYOUT))
lots = [b for b in L['buildings'] if not b.get('landmark') and b.get('footprint')]
# grid of lots by bounding box (24u cells)
C = 24.0
grid = {}
for i, b in enumerate(lots):
    xs = [p[0] for p in b['footprint']]; zs = [p[1] for p in b['footprint']]
    for gx in range(int(math.floor(min(xs) / C)), int(math.floor(max(xs) / C)) + 1):
        for gz in range(int(math.floor(min(zs) / C)), int(math.floor(max(zs) / C)) + 1):
            grid.setdefault((gx, gz), []).append(i)
hits = [[] for _ in lots]
for x, z, a, h in parts:
    for i in grid.get((int(math.floor(x / C)), int(math.floor(z / C))), []):
        if inside(x, z, lots[i]['footprint']):
            hits[i].append((a, h))
            break

stats = {'plateau': 0, 'kept_osm_taller': 0, 'kept_low_cover': 0, 'no_parts': 0}
before = {}
for b, hs in zip(lots, hits):
    before[b.get('style')] = before.get(b.get('style'), 0) + 1
    lot_m2 = area_centroid(b['footprint'])[0] / (SCALE * SCALE)
    if not hs:
        stats['no_parts'] += 1
        continue
    cover = sum(a for a, _ in hs) / max(1.0, lot_m2)
    # the height the top 35% of the roof area reaches
    tot = sum(a for a, _ in hs)
    acc, hq = 0.0, hs[0][1]
    for a, h in sorted(hs, key=lambda p: -p[1]):
        acc += a; hq = h
        if acc >= 0.35 * tot:
            break
    src = b.get('heightSource') or ''
    # a building's own OSM tag (height or storey count, not a merged estimate) that disagrees with PLATEAU by more
    # than 1.6x either way is about a building PLATEAU's 2020 survey caught mid-construction or split differently
    # (Blue Front Shibaura, the JT Building): the tag stands
    osm_own = src.startswith('osm:') and 'merged' not in src
    old_h = b.get('heightMetres', 0)
    if cover < 0.3:
        stats['kept_low_cover'] += 1
    elif osm_own and (old_h > hq * 1.6 or hq > old_h * 1.6):
        stats['kept_osm_taller'] += 1
    else:
        b['heightMetres'] = round(hq, 1)
        b['height'] = round(hq * SCALE, 1)
        b['heightSource'] = f'plateau:measuredHeight ({len(hs)} part{"s" if len(hs) > 1 else ""}, {round(cover * 100)}% cover)'
        stats['plateau'] += 1
    # style from what stands on the lot (the parts' own sizes, not the merged lot's)
    H = b['heightMetres']
    med_a = sorted(a for a, _ in hs)[len(hs) // 2]
    old = b.get('style')
    if old == 'warehouse' and H < 30:
        continue
    if H >= 120:
        b['style'] = 'glasstower'
    elif H >= 60:
        b['style'] = 'glassslab'
    elif H < 12 and med_a < 220:
        b['style'] = 'house'
    elif H < 15:
        b['style'] = 'lowrise'
    elif med_a < 450 and H <= 42:
        b['style'] = 'zakkyo'
    elif old == 'apartment':
        b['style'] = 'apartment'
    else:
        b['style'] = 'midrise'
after = {}
for b in lots:
    after[b.get('style')] = after.get(b.get('style'), 0) + 1
m = L['meta']
m['heightNote'] = ('height / heightMetres: game units / metres. Buildings: PLATEAU measuredHeight (Project PLATEAU, Tokyo 23 wards, '
                   'CityGML 2020) - the height the top 35% of the lot\'s roof area reaches, where PLATEAU covers 30% of the lot or more; '
                   'a building\'s own OSM height / storey tag that differs from PLATEAU by more than 1.6x is kept; else OSM levels / zone-typical '
                   'estimates (heightSource says which). Landmarks: their own heights. tools/tokyo/cartographer/refine_heights.py')
src = m.get('source', '')
if 'PLATEAU' not in src:
    m['source'] = src + ('; ' if src else '') + 'Project PLATEAU 3D city model (MLIT; Tokyo 23 wards 2020; via the plateau-tokyo23ku-building-mvt-2020 tiles) for building heights'
json.dump(L, open(LAYOUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('lots', len(lots), stats)
print('styles before', dict(sorted(before.items(), key=lambda kv: -kv[1])))
print('styles after ', dict(sorted(after.items(), key=lambda kv: -kv[1])))
