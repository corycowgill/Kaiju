"""Shared frame for the Tokyo cartographer scripts (tools/tokyo/SPEC.md)."""
import math, pickle
LAT0, LON0, SCALE = 35.6660, 139.7600, 0.2
_p = math.radians(LAT0)
M_LAT = 111132.92 - 559.82 * math.cos(2 * _p) + 1.175 * math.cos(4 * _p) - 0.0023 * math.cos(6 * _p)
M_LON = 111412.84 * math.cos(_p) - 93.5 * math.cos(3 * _p) + 0.118 * math.cos(5 * _p)
BOX = dict(south=35.6240, north=35.6885, west=139.7370, east=139.7860)
def xz(lon, lat): return ((lon - LON0) * M_LON * SCALE, -(lat - LAT0) * M_LAT * SCALE)
def ll(x, z): return (LAT0 - z / (M_LAT * SCALE), LON0 + x / (M_LON * SCALE))
MINX, MAXZ = xz(BOX['west'], BOX['south']); MAXX, MINZ = xz(BOX['east'], BOX['north'])
MINX, MAXX, MINZ, MAXZ = round(MINX, 1), round(MAXX, 1), round(MINZ, 1), round(MAXZ, 1)
BOUNDS = dict(minX=MINX, maxX=MAXX, minZ=MINZ, maxZ=MAXZ)
def load(path): return pickle.load(open(path, 'rb'))
def r1(v): return round(float(v), 1) + 0.0
def ring1(pts):
    out = []
    for x, z in pts:
        p = [r1(x), r1(z)]
        if not out or out[-1] != p: out.append(p)
    if len(out) > 1 and out[0] == out[-1]: out.pop()
    return out
def obb(poly):
    """Minimum-area oriented rectangle of a shapely polygon: (cx, cz, w, d, rot) with rot = three.js rotation.y,
    local +X along (cos rot, -sin rot); rot folded into (-pi/4, pi/4] so w/d stay near the axes it started on."""
    r = poly.minimum_rotated_rectangle
    c = list(r.exterior.coords)[:4]
    ex = (c[1][0] - c[0][0], c[1][1] - c[0][1]); ey = (c[3][0] - c[0][0], c[3][1] - c[0][1])
    w = math.hypot(*ex); d = math.hypot(*ey)
    cx = sum(p[0] for p in c) / 4; cz = sum(p[1] for p in c) / 4
    rot = math.atan2(-ex[1], ex[0])  # local X along (cos, -sin)
    while rot > math.pi / 4 + 1e-9: rot -= math.pi / 2; w, d = d, w
    while rot <= -math.pi / 4 + 1e-9: rot += math.pi / 2; w, d = d, w
    return cx, cz, w, d, rot
if __name__ == '__main__':
    print(M_LAT, M_LON, BOUNDS)
