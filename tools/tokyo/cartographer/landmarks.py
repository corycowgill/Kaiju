"""Landmark entries from prep.pickle. Standalone: python3 -I landmarks.py <prep.pickle> <scriptdir> <out landmark_sites.json>"""
import sys, math, json, re
if __name__ == '__main__': sys.path.insert(0, sys.argv[2])
from tkgeo import *
from lm_table import LM
from lm_info import I, EXTRA, DISTRICTS, SKYTREE_SITE, SKYTREE_TRUE
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union, linemerge
from shapely import affinity

COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
def compass(b): return COMPASS[int(((b % 360) + 11.25) // 22.5) % 16]
def parse_h(v):
    if v is None: return None
    m = re.match(r'\s*([0-9.]+)', str(v))
    if not m: return None
    h = float(m.group(1))
    if "'" in str(v) or 'ft' in str(v): h *= 0.3048
    return h
def rect(cx, cz, w, d, rot):
    p = sbox(-w / 2, -d / 2, w / 2, d / 2)
    return affinity.translate(affinity.rotate(p, -math.degrees(rot), origin=(0, 0)), cx, cz)   # (x, z) plane: rot.y turns +X toward -Z

def geom_index(prep):
    G = {}
    for ref, t, p in prep['areas']: G[ref] = (t, p)
    for ref, t, g in prep['piers']:
        if isinstance(g, list):
            if len(g) >= 4 and g[0] == g[-1]:
                p = Polygon(g); p = p if p.is_valid else p.buffer(0)
                G.setdefault(ref, (t, p))
        else: G.setdefault(ref, (t, g))
    for ref, t, g in prep['misc'] + [(r, t, g) for r, t, g in prep['rail']]:
        if len(g) >= 4 and g[0] == g[-1]:
            try: G.setdefault(ref, (t, Polygon(g).buffer(0)))
            except Exception: pass
    for ref, t, p in prep['parts']: G[ref] = (t, p)
    for ref, t, p in prep['bld']: G[ref] = (t, p)
    N = {ref: (t, xy) for ref, t, xy in prep['nodes']}
    return G, N

def rainbow(prep):
    """Rainbow Bridge from the OSM expressway deck (way/316305908 + /316305907, 'Tokyo-ko Renrakukyo'): mid-span, axis, towers and anchorages by the published spans (570 m main span, 798 m anchorage to anchorage)."""
    R = {ref: g for ref, t, g, ids in prep['roads']}
    a = LineString(R['way/316305908']); b = LineString(R['way/316305907'])
    pa, pb = a.interpolate(0.5, normalized=True), b.interpolate(0.5, normalized=True)
    mx, mz = (pa.x + pb.x) / 2, (pa.y + pb.y) / 2
    c0, c1 = a.coords[0], a.coords[-1]
    dx, dz = c1[0] - c0[0], c1[1] - c0[1]; n = math.hypot(dx, dz); dx, dz = dx / n, dz / n     # Shibaura -> Odaiba
    at = lambda m: (mx + dx * m * SCALE, mz + dz * m * SCALE)
    # full deck centreline with the approaches: Shibaura viaduct - loop side - main bridge - Odaiba viaduct
    west = [((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) for p, q in zip(R['way/4847506'], R['way/316305910'][::-1])] if len(R['way/4847506']) == len(R['way/316305910']) else list(R['way/4847506'])
    east = list(R['way/316305909'])
    return dict(mid=(mx, mz), dir=(dx, dz), rot=math.atan2(-dz, dx), length=(a.length + b.length) / 2, at=at, west=west, east=east, deckA=list(a.coords), deckB=list(b.coords)[::-1])

def build(prep, log=print):
    G, N = geom_index(prep)
    out = []; dropped = []
    for id_, name, alat, alon, hm, tier, kind, rx in LM:
        refs, want, eave, desc = I[id_]
        polys = []; osm = []; data_h = None; fixed = None
        for r in refs:
            if isinstance(r, tuple):
                src, wm, dm = r
                if src in G: c = G[src][1].centroid; x, z = c.x, c.y; osm.append(src)
                elif src in N: t, (x, z) = N[src]; osm.append(src)
                else: log('MISSING', id_, src); continue
                polys.append(('pt', x, z, wm * SCALE, dm * SCALE))
            elif r == '@tokyo_tower':
                t, deck = G['way/313815246']; t2, foot = G['relation/4247312']
                _, _, _, _, rot = obb(deck)
                c = deck.centroid
                fixed = (c.x, c.y, 95 * SCALE, 95 * SCALE, rot); polys.append(rect(*fixed)); osm += ['relation/4247312 (FootTown)', 'way/313815246 (main deck; the leg spread of 95 m is the box)']
            elif r == '@skytree':
                x, z = xz(SKYTREE_SITE[1], SKYTREE_SITE[0])
                fixed = (x, z, 70 * SCALE, 70 * SCALE, 0.0); polys.append(rect(*fixed)); osm.append('way/288269147 (true site at Oshiage; moved to Harumi Futo Park)')
            elif r == '@rainbow':
                rb = rainbow(prep)
                fixed = (rb['mid'][0], rb['mid'][1], rb['length'], 29 * SCALE, rb['rot']); polys.append(rect(*fixed)); osm.append('relation/18497742 + way/316305908 + way/316305907')
            else:
                if r not in G: log('MISSING', id_, r); continue
                t, p = G[r]; polys.append(p); osm.append(r)
                h = parse_h(t.get('height'))
                if h and 'm' not in str(t.get('height'))[-2:] or h and h > 12: data_h = max(data_h or 0, h)
        if not polys: dropped.append((id_, 'not found')); continue
        if isinstance(polys[0], tuple):
            _, x, z, w, d = polys[0]
            rot = -math.radians(want - 180)
            while rot > math.pi / 4: rot -= math.pi / 2; w, d = d, w
            while rot <= -math.pi / 4: rot += math.pi / 2; w, d = d, w
            poly = rect(x, z, w, d, rot); cx, cz = x, z
        elif fixed:
            cx, cz, w, d, rot = fixed; poly = polys[0]
            if kind != 'bridge':
                while rot > math.pi / 4 + 1e-9: rot -= math.pi / 2; w, d = d, w
                while rot <= -math.pi / 4 + 1e-9: rot += math.pi / 2; w, d = d, w
        else:
            if id_ == 'toranomon_hills_mori_tower': poly = polys[0]
            else: poly = unary_union(polys)
            cx, cz, w, d, rot = obb(poly if poly.geom_type == 'Polygon' else poly.convex_hull)
            if kind == 'bridge' and id_ != 'imperial_palace_nijubashi' and d > w: rot += math.pi / 2 if rot <= 0 else -math.pi / 2; w, d = d, w   # bridges: w along the deck
        best = None
        for k in range(4):
            a = rot + k * math.pi / 2
            fx, fz = math.sin(a), math.cos(a)
            b = math.degrees(math.atan2(fx, -fz)) % 360
            dd = abs((b - want + 180) % 360 - 180)
            if best is None or dd < best[0]: best = (dd, b, fx, fz)
        fb = round(best[1]) % 360
        lat, lon = ll(cx, cz)
        e = dict(id=id_, name=name, x=r1(cx), z=r1(cz), rot=round(rot, 3), w=r1(w), d=r1(d), height=r1(hm * SCALE), heightMetres=hm,
                 eaveHeight=r1((eave or hm) * SCALE), eaveMetres=eave or hm, tier=tier, kind=kind, front=compass(fb), frontBearing=fb,
                 frontDir=[round(best[2], 3), round(best[3], 3)], desc=desc, latLon=[round(lat, 6), round(lon, 6)], osm=' + '.join(osm))
        if data_h: e['dataRoofMetres'] = round(data_h, 1)
        if id_ == 'tokyo_skytree': e['moved'] = True; e['trueLatLon'] = list(SKYTREE_TRUE)
        ex = {}
        for key, nm, ref, h in EXTRA.get(id_, []):
            if ref not in G: log('MISSING extra', id_, ref); continue
            ecx, ecz, ew, ed, erot = obb(G[ref][1] if G[ref][1].geom_type == 'Polygon' else G[ref][1].convex_hull)
            ex[key] = dict(name=nm, x=r1(ecx), z=r1(ecz), rot=round(erot, 3), w=r1(ew), d=r1(ed), heightMetres=h, osm=ref)
            e.setdefault('_extraPolys', []).append(G[ref][1])
        if ex: e['extra'] = ex
        e['_poly'] = poly
        if alat is not None:
            ax, az = xz(alon, alat); e['_moved'] = round(math.hypot(ax - cx, az - cz) / SCALE)
        out.append(e)
    return out, dropped

def sites_json(lms, dropped):
    sites = [dict(id=e['id'], name=e['name'], latLon=e['latLon'], x=e['x'], z=e['z'], rot=e['rot'], wMetres=round(e['w'] / SCALE, 1), dMetres=round(e['d'] / SCALE, 1), heightMetres=e['heightMetres'], eaveMetres=e['eaveMetres'],
                  dataRoofMetres=e.get('dataRoofMetres'), frontBearing=e['frontBearing'], front=e['front'], tier=e['tier'], kind=e['kind'], onPier=bool(e.get('onPier')), onWater=bool(e.get('onWater')), osm=e['osm'],
                  **({'moved': True, 'trueLatLon': e['trueLatLon']} if e.get('moved') else {}), **({'extra': {k: dict(v, wMetres=round(v['w'] / SCALE, 1), dMetres=round(v['d'] / SCALE, 1)) for k, v in e['extra'].items()}} if e.get('extra') else {})) for e in lms]
    return dict(note='rot = three.js rotation.y of the oriented rectangle (wMetres along local X = (cos rot, -sin rot) in world (x, z), dMetres along local Z), folded into (-45, 45] deg, except kind bridge (kachidoki_bridge, nihonbashi_bridge, rainbow_bridge): wMetres = the deck length, rot along the deck; the model front (+Z) faces frontBearing (deg clockwise from north). x / z in game units (0.2 u per m). extra = further pieces of the same landmark at their own real sites (zojoji.gate = Sangedatsumon, kabukiza.tower, imperial_palace_nijubashi.keep = Fushimi-yagura). tokyo_skytree is MOVED from Oshiage (trueLatLon) to Harumi Futo Park. dropped = SPEC ids not on the map.',
                sites=sites, dropped=[dict(id=a, reason=b) for a, b in dropped])

if __name__ == '__main__':
    prep = load(sys.argv[1])
    lms, dropped = build(prep)
    for e in lms:
        print('%-30s x %7.1f z %7.1f  %4.0f x %4.0f m rot %6.1f  front %-3s %3d  h %s data %s moved %s m  %s' % (e['id'], e['x'], e['z'], e['w'] / SCALE, e['d'] / SCALE, math.degrees(e['rot']), e['front'], e['frontBearing'], e['heightMetres'], e.get('dataRoofMetres'), e.get('_moved'), e['osm'][:34]))
    print('dropped', dropped)
    if len(sys.argv) > 3: json.dump(sites_json(lms, dropped), open(sys.argv[3], 'w'), indent=1, ensure_ascii=False)
