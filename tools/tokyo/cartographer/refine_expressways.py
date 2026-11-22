#!/usr/bin/env python3
"""Rebuild tokyo_detail.json's `expressways` from the layout's own Shuto Expressway pieces (safe to re-run).

Only the pieces OSM tags as bridges get an elevated deck: tunnels (the C1 loop under the palace moats and Yaesu) and
untagged pieces (the sunken trench along the old canals at Shiodome and Tsukiji, at-grade stretches) do not. Both
carriageways are kept (each its own narrower deck, as the Shuto's paired viaducts are), chained piece to piece, and
each run carries its deck height from its OSM layer: layer 1 ~9 m, 2 ~15.5 m, 3 ~21 m, 4 ~26.5 m (the stacked
junctions at Hamazakibashi and Shiodome). Runs shorter than 30 m are dropped (stray ramp ends).
usage: python3 -I refine_expressways.py [assets/levels dir]
"""
import json, math, os, sys
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../assets/levels')
L = json.load(open(os.path.join(D, 'tokyo_layout.json')))
DET = json.load(open(os.path.join(D, 'tokyo_detail.json')))
DECK = {1: 9.0, 2: 15.5, 3: 21.0, 4: 26.5}
pieces = [r for r in L['roads'] if r.get('expressway') and r.get('bridge') and not r.get('tunnel') and len(r['points']) >= 2]
key = lambda p: (round(p[0] * 2), round(p[1] * 2))  # (0.5 u snap)
runs = []
for layer in sorted({r.get('layer') or 2 for r in pieces}):
    group = [list(map(list, r['points'])) for r in pieces if (r.get('layer') or 2) == layer]
    names = {}
    for r in pieces:
        if (r.get('layer') or 2) == layer:
            names[id(r)] = r.get('name') or ''
    # chain pieces end to start (OSM ways run in the traffic direction, so a carriageway chains head to tail)
    used = [False] * len(group)
    starts = {}
    for i, g in enumerate(group):
        starts.setdefault(key(g[0]), []).append(i)
    ends = {key(g[-1]) for g in group}
    order = sorted(range(len(group)), key=lambda i: key(group[i][0]) in ends)  # chain heads first
    for i in order:
        if used[i]:
            continue
        used[i] = True
        line = group[i][:]
        while True:
            nxt = [j for j in starts.get(key(line[-1]), []) if not used[j]]
            if not nxt:
                break
            used[nxt[0]] = True
            line += group[nxt[0]][1:]
        length = sum(math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]) for k in range(1, len(line)))
        if length >= 6:  # 30 m
            runs.append({'layer': layer, 'deckMetres': DECK.get(layer, 15.5), 'points': [[round(x, 1), round(z, 1)] for x, z in line], 'lengthU': round(length, 1)})
old = len(DET.get('expressways', []))
DET['expressways'] = runs
DET.setdefault('meta', {})['expresswayNote'] = ('expressways: the Shuto Expressway pieces OSM tags as bridges (no tunnels, no sunken or at-grade '
                                                'pieces), both carriageways, chained, each {layer, deckMetres, points, lengthU}; deckMetres from the '
                                                'OSM layer. tools/tokyo/cartographer/refine_expressways.py')
json.dump(DET, open(os.path.join(D, 'tokyo_detail.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(pieces)} bridge pieces -> {len(runs)} runs (was {old}); by layer:',
      {l: sum(1 for r in runs if r['layer'] == l) for l in sorted({r['layer'] for r in runs})},
      'total length m', round(sum(r['lengthU'] for r in runs) / 0.2))
