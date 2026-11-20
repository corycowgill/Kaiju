"""Extract the OSM pbf into a compact pickle. Usage: python3 -I extract_osm.py <in.pbf> <out.pickle>
Keeps tagged ways (with lon/lat geometry), relations and tagged nodes of the whole extract."""
import sys, pickle
import osmium

SRC, OUT = sys.argv[1], sys.argv[2]
KEEP = ('highway', 'building', 'building:part', 'natural', 'leisure', 'landuse', 'man_made', 'railway', 'waterway',
        'amenity', 'tourism', 'bridge', 'route', 'water', 'place', 'historic', 'area:highway', 'barrier', 'aeroway', 'public_transport')

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}; self.rels = {}; self.nodes = {}
    def node(self, n):
        if len(n.tags) and n.location.valid():
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
        ids = [nd.ref for nd in w.nodes]
        self.ways[w.id] = (t, pts, ids)
    def relation(self, r):
        t = {k.k: k.v for k in r.tags}
        self.rels[r.id] = (t, [(m.type, m.ref, m.role) for m in r.members])

h = H()
h.apply_file(SRC, locations=True)
print(len(h.ways), 'ways', len(h.rels), 'rels', len(h.nodes), 'nodes')
pickle.dump({'ways': h.ways, 'rels': h.rels, 'nodes': h.nodes}, open(OUT, 'wb'), protocol=4)
