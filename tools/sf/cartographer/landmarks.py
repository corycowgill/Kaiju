"""Landmark entries from prep.pickle. Standalone: python3 -I landmarks.py <prep.pickle> <scriptdir> <out landmark_sites.json>"""
import sys, math, json, re
if __name__ == '__main__': sys.path.insert(0, sys.argv[2])
from sfgeo import *
from lm_table import LM, PIER_SHEDS
from lm_info import I, SHED_DESC, DISTRICTS
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
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

PIER_REFS = {1: 'way/25489482', 5: 'way/91913148', 9: 'way/25478417', 17: 'way/25489458', 33: 'way/91913158', 35: 'way/91913150',
             26: 'way/104599978', 28: 'way/104599994', 38: 'way/104599982', 40: 'way/104599990'}
PIER_FRONT = {26: 240, 28: 240, 38: 270, 40: 270}

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
    for ref, t, g in prep['far']:
        if ref not in G and len(g) >= 4 and g[0] == g[-1]: G[ref] = (t, Polygon(g).buffer(0))
    N = {ref: (t, xy) for ref, t, xy in prep['nodes']}
    return G, N

def build(prep, extra_pier=None, log=print):
    G, N = geom_index(prep)
    roads = prep['roads']
    def road_line(name):
        return unary_union([LineString(g) for ref, t, g, ids in roads if t.get('name') == name and t.get('highway') not in ('footway', 'service')])
    out = []; dropped = []
    items = [(l[0], l[1], l[2], l[3], l[4], l[5], l[6]) for l in LM]
    for n in PIER_SHEDS: items.append(('pier_%d' % n, 'Pier %d' % n if n != 9 else 'Pier 9', None, None, 14, 'B', 'building'))
    PIER = dict(PIER_REFS); PIER.update(extra_pier or {})
    for id_, name, alat, alon, hm, tier, kind in items:
        if id_.startswith('pier_') and id_[5:].isdigit() and id_ != 'pier_39':
            n = int(id_[5:])
            if n not in PIER: dropped.append((id_, 'no separate shed footprint in the data')); continue
            refs, want, eave, desc = [PIER[n]] if isinstance(PIER[n], str) else PIER[n], PIER_FRONT.get(n, 240 if n < 25 else 190), 10, SHED_DESC
        else:
            refs, want, eave, desc = I[id_]
        polys = []; osm = []; data_h = None
        for r in refs:
            if isinstance(r, tuple):
                src, wm, dm = r
                if isinstance(src, str): t, (x, z) = N[src]; osm.append(src)
                else: x, z = xz(src[1], src[0])
                polys.append(('pt', x, z, wm * SCALE, dm * SCALE))
            elif r == '@sing_chong':
                ip = road_line('California Street').intersection(road_line('Grant Avenue'))
                ix, iz = ip.centroid.x, ip.centroid.y
                best = None
                for ref, t, p in prep['bld']:
                    c = p.centroid
                    if c.x < ix - 0.5 and c.y < iz - 0.5 and abs(c.x - ix) < 8 and abs(c.y - iz) < 8:
                        d = p.distance(Point(ix, iz))
                        if best is None or d < best[0]: best = (d, ref, t, p)
                polys.append(best[3]); osm.append(best[1]); data_h = parse_h(best[2].get('height'))
            elif r == '@balclutha':
                t, pier = G['way/456528981']
                x, z = xz(-122.42245, 37.80975)
                c = pier.minimum_rotated_rectangle.exterior.coords
                e = max(((c[i], c[i + 1]) for i in range(4)), key=lambda s: math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]))
                rot = math.atan2(-(e[1][1] - e[0][1]), e[1][0] - e[0][0])
                polys.append(rect(x, z, 92 * SCALE, 12 * SCALE, rot))
                osm.append('way/456528981 (Hyde Street Pier; the ship itself is not mapped)')
            elif r == '@pier45ships':
                t, sub = G['way/165601339']
                cx, cz, w, d, rot = obb(sub)
                if d > w: rot += math.pi / 2; w, d = d, w
                ux, uz = math.cos(rot), -math.sin(rot)
                if uz > 0: ux, uz = -ux, -uz          # toward the north (outer end of the pier)
                L = (w / 2 + 4 + 135 * SCALE / 2)
                polys.append(sub.buffer(0.3)); polys.append(rect(cx + ux * L, cz + uz * L, 135 * SCALE, 17.4 * SCALE, rot))
                osm.append('way/165601339 (USS Pampanito; SS Jeremiah O\'Brien placed ahead of her)')
            else:
                if r not in G: log('MISSING', id_, r); continue
                t, p = G[r]; polys.append(p); osm.append(r)
                h = parse_h(t.get('height'))
                if h: data_h = max(data_h or 0, h)
        if not polys: dropped.append((id_, 'not found')); continue
        if isinstance(polys[0], tuple):
            _, x, z, w, d = polys[0]
            # props: aligned to the nearest street grid (rot chosen from the wanted front)
            fb = want; rot = -math.radians(fb - 180)   # +Z (front) toward the bearing
            while rot > math.pi / 4: rot -= math.pi / 2; w, d = d, w
            while rot <= -math.pi / 4: rot += math.pi / 2; w, d = d, w
            poly = rect(x, z, w, d, rot); cx, cz = x, z
        else:
            poly = unary_union(polys)
            if id_ == 'montgomery_44':
                q = poly.buffer(-2.6).buffer(2.6)
                if not q.is_empty: poly = max(q.geoms, key=lambda g: g.area) if q.geom_type == 'MultiPolygon' else q
            if id_ == 'pier_39':
                # the shop pier proper: outboard of the Aquarium of the Bay, without the marina docks
                aq = G['way/288396169'][1]; acx, acz, aw, ad, arot = obb(aq)
                q = poly.buffer(-3).buffer(3)
                q = max(q.geoms, key=lambda g: g.area) if q.geom_type == 'MultiPolygon' else q
                pcx, pcz, pw, pd, prot = obb(q)
                if pd < pw: prot += math.pi / 2; pw, pd = pd, pw
                ax, az = math.sin(prot), math.cos(prot)          # the pier's long axis
                if (acx - pcx) * ax + (acz - pcz) * az < 0: ax, az = -ax, -az   # pointing at the aquarium (landward)
                far = max((c[0] - pcx) * ax + (c[1] - pcz) * az for c in aq.exterior.coords) * -1
                lim = min((c[0] - pcx) * ax + (c[1] - pcz) * az for c in aq.exterior.coords) - 0.6
                cut = rect(pcx + ax * (lim + 400), pcz + az * (lim + 400), 800, 800, prot)
                q = q.difference(cut)
                poly = max(q.geoms, key=lambda g: g.area) if q.geom_type == 'MultiPolygon' else q
            cx, cz, w, d, rot = obb(poly if len(polys) == 1 else poly.convex_hull)
        # front: the rectangle normal nearest the wanted bearing
        best = None
        for k in range(4):
            a = rot + k * math.pi / 2
            fx, fz = math.sin(a), math.cos(a)            # where local +Z points after rotation.y = a
            b = math.degrees(math.atan2(fx, -fz)) % 360
            dd = abs((b - want + 180) % 360 - 180)
            if best is None or dd < best[0]: best = (dd, b, fx, fz)
        fb = round(best[1]) % 360
        lat, lon = ll(cx, cz)
        e = dict(id=id_, name=name, x=r1(cx), z=r1(cz), rot=round(rot, 3), w=r1(w), d=r1(d), height=r1(min(hm, eave or hm) * SCALE), heightMetres=hm,
                 eaveHeight=r1((eave or hm) * SCALE), eaveMetres=eave or hm, tier=tier, kind=kind, front=compass(fb), frontBearing=fb,
                 frontDir=[round(best[2], 3), round(best[3], 3)], desc=desc, latLon=[round(lat, 6), round(lon, 6)], osm=' + '.join(osm))
        if data_h: e['dataRoofMetres'] = round(data_h, 1)
        e['_poly'] = poly
        if alat is not None:
            ax, az = xz(alon, alat); e['_moved'] = round(math.hypot(ax - cx, az - cz) / SCALE)
        out.append(e)
    return out, dropped

if __name__ == '__main__':
    prep = load(sys.argv[1])
    lms, dropped = build(prep)
    sites = []
    for e in lms:
        print('%-32s x %7.1f z %7.1f  %5.0f x %5.0f m rot %6.1f deg  front %-3s %3d  h %s data %s moved %s m   %s' % (e['id'], e['x'], e['z'], e['w'] / SCALE, e['d'] / SCALE, math.degrees(e['rot']), e['front'], e['frontBearing'], e['heightMetres'], e.get('dataRoofMetres'), e.get('_moved'), e['osm'][:40]))
        sites.append(dict(id=e['id'], name=e['name'], latLon=e['latLon'], x=e['x'], z=e['z'], rot=e['rot'], wMetres=round(e['w'] / SCALE, 1), dMetres=round(e['d'] / SCALE, 1),
                          heightMetres=e['heightMetres'], dataRoofMetres=e.get('dataRoofMetres'), frontBearing=e['frontBearing'], front=e['front'], osm=e['osm']))
    print('dropped', dropped)
    if len(sys.argv) > 3: json.dump(sites, open(sys.argv[3], 'w'), indent=1)
