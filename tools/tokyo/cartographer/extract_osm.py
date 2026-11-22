"""Extract the OSM pbf into a compact pickle. Usage: python3 -I extract_osm.py <in.pbf> <out.pickle>
Keeps tagged ways (with lon/lat geometry), relations and tagged nodes inside the wide fetch box round central Tokyo."""
import sys, pickle
import osmium

SRC, OUT = sys.argv[1], sys.argv[2]
W, E, S, N = 139.62, 139.90, 35.545, 35.785   # about 12.5 km round the origin
def inb(lo, la): return W <= lo <= E and S <= la <= N
KEEP = ('highway', 'building', 'building:part', 'natural', 'leisure', 'landuse', 'man_made', 'railway', 'waterway',
        'amenity', 'tourism', 'bridge', 'route', 'water', 'place', 'historic', 'area:highway', 'barrier', 'aeroway', 'public_transport')

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}; self.rels = {}; self.nodes = {}
    def node(self, n):
        if len(n.tags) and n.location.valid() and inb(n.location.lon, n.location.lat):
            t = {k.k: k.v for k in n.tags}
            if any(k in t for k in ('natural', 'tourism', 'amenity', 'historic', 'place', 'railway', 'man_made', 'name', 'highway')):
                if t.get('highway') in ('crossing', 'traffic_signals', 'stop', 'street_lamp', 'turning_circle') and 'name' not in t: return
                self.nodes[n.id] = (n.location.lon, n.location.lat, t)
    def way(self, w):
        t = {k.k: k.v for k in w.tags}
        try:
            pts = [(nd.lon, nd.lat) for nd in w.nodes]
        except Exception:
            return
        if not any(inb(lo, la) for lo, la in pts): return   # untagged ways stay: they are multipolygon members
        ids = [nd.ref for nd in w.nodes]
        self.ways[w.id] = (t, pts, ids)
    def relation(self, r):
        t = {k.k: k.v for k in r.tags}
        self.rels[r.id] = (t, [(m.type, m.ref, m.role) for m in r.members])

h = H()
h.apply_file(SRC, locations=True)
print(len(h.ways), 'ways', len(h.rels), 'rels', len(h.nodes), 'nodes')
pickle.dump({'ways': h.ways, 'rels': h.rels, 'nodes': h.nodes}, open(OUT, 'wb'), protocol=4)
