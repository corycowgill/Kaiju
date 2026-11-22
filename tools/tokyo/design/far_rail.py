# far_rail.py - Tokyo trains: Yamanote / Keihin-Tohoku commuter sets, the Shinkansen, the Tokyo Monorail and the
# Yurikamome.  blender -b -P tools/tokyo/design/far_rail.py -- [names]
# Each train is ONE rigid unit, long axis Z (leading end +Z: white head lamps there, red tail lamps at -Z), origin at
# the centre of the train, y 0 = rail top (monorail: beam top; Yurikamome: running surface).  Invented liveries, no lettering.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

TP = {
    'silver': (0xb6bbbf, .36, .5), 'silver_d': (0x90969a, .42, .45), 'roof': (0x9a9d9f, .7, 0), 'roof_d': (0x6c7073, .7, 0),
    'end': (0x35383b, .7, 0), 'under': (0x212224, .9, 0), 'bogie': (0x34373b, .8, 0), 'wheel': (0x55585b, .45, .5),
    'glass': (0x121a20, .08, 0), 'lit': (0x7b8582, .15, 0, 0xefe4ba), 'head': (0xfff6dc, .2, 0, 0xfff2cc), 'tail': (0xc0201a, .3, 0, 0xe01c12),
    'sign': (0x4a3c22, .3, 0, 0xf0a830), 'black': (0x17191c, .4, 0), 'white': (0xeeeeea, .32, 0), 'white_d': (0xcfd1cf, .4, 0),
}


def tp(**kw):
    d = dict(TP)
    d.update(kw)
    return d


def bogie(b, zc, g=.72, r=.43, wb=1.05):
    if not b.hi:
        b.box(-g - .34, .0, zc - wb - .55, g + .34, .66, zc + wb + .55, 'bogie', skip='ud')
        return
    for sx in b.mirx():
        for dz in (-wb, wb):
            b.cyl((g, r, zc + dz), (g + .13, r, zc + dz), r, n=8, col='wheel', caps=2, nl=6)
        b.box(g + .14, .28, zc - wb - .55, g + .34, .66, zc + wb + .55, 'bogie', skip='l')
    b.box(-g, .3, zc - .45, g, .8, zc + .45, 'under', skip='u')


def roofp(b, W, ye, yt, sh, z0, z1, col='roof', capcol='end', flat=.7):
    poly = [(-W, ye), (-W + sh, ye + (yt - ye) * .7), (-flat, yt), (flat, yt), (W - sh, ye + (yt - ye) * .7), (W, ye)]
    b.prism(poly, 'z', z0, z1, [col] * 5 + ['under'], capcol=capcol)


def panto(b, z, y0, y1, hw=.85):
    b.box(-.5, y0, z - .7, .5, y0 + .1, z + .7, 'roof_d', skip='d')
    ym = y0 + (y1 - y0) * .5
    b.beam((0, y0 + .1, z - .5), (0, ym, z + .55), .07, .07, 'end', lx=True)
    b.beam((0, ym, z + .55), (0, y1, z - .1), .06, .06, 'end', lx=True)
    b.box(-hw, y1, z - .22, hw, y1 + .05, z + .02, 'end')


def disc(b, x, y, z, r, n, col):
    """Flat wheel disc facing +x."""
    b.poly([(x, y + r * cos(2 * pi * i / n), z + r * sin(2 * pi * i / n)) for i in range(n)], col)


def train(b, n, pitch, gap, W, ys, layout, colf, nose, roof, under, noselen=0.0, gang=(.62, 1.15, 2.95), endcol='end', lod_gang=True):
    """Generic box-bodied multiple unit.  layout(ci, zc, z0, z1, cab) -> (stations, data); colf(data) -> f(z, y);
    nose(b, lamp) is drawn in a frame whose z 0 is the cab end of the body and +z points out of the train."""
    L = n * pitch
    for ci in range(n):
        zc = (ci - (n - 1) / 2) * pitch
        cab = -1 if ci == 0 else (1 if ci == n - 1 else 0)
        z0 = zc - pitch / 2 + (noselen if ci == 0 else gap / 2)
        z1 = zc + pitch / 2 - (noselen if ci == n - 1 else gap / 2)
        st, data = layout(ci, zc, z0, z1, cab)
        zs = sorted(set([z0, z1] + [round(z, 4) for z in st if z0 + .02 < z < z1 - .02]))
        f = colf(data)
        for sx in b.mirx():
            b.grid((W, 0, 0), (0, 0, 1), (0, 1, 0), zs, ys, f, flip=True)
        if ci > 0:
            b.grid((-W, 0, z0), (1, 0, 0), (0, 1, 0), [0, 2 * W], [ys[0], ys[-1]], lambda u, v: endcol, flip=True)
        if ci < n - 1:
            b.grid((-W, 0, z1), (1, 0, 0), (0, 1, 0), [0, 2 * W], [ys[0], ys[-1]], lambda u, v: endcol)
            if b.hi or lod_gang:
                b.box(-gang[0], gang[1], z1, gang[0], gang[2], z1 + gap, 'black', skip='fb')
        roof(b, ci, zc, z0, z1, cab)
        under(b, ci, zc, z0, z1, cab)
    with b.at(z=L / 2 - noselen):
        nose(b, 'head')
    with b.at(z=-(L / 2 - noselen), ry=180):
        nose(b, 'tail')


# ------------------------------------------------------------------ JR commuter sets (E235 / E233 style), 5 cars, 100 m
def commuter(style):
    W = 1.475
    YB, YS0, YS1, YW1, YD1, YT0, YT1, YR = .95, 1.76, 1.95, 2.88, 3.0, 3.1, 3.25, 3.62
    DW, DN = .65, .45
    doorcol = 'line' if style == 'yam' else 'silver_d'

    def fn(b):
        ys = [YB, YS0, YS1, YW1, YD1, YT0, YT1] if b.hi else ([YB, YS1, YW1, YT1] if style == 'yam' else [YB, YS0, YS1, YW1, YT1])

        def layout(ci, zc, z0, z1, cab):
            doors = [zc + d for d in (-7.23, -2.41, 2.41, 7.23)]
            wins = [(doors[i] + DW + .38, doors[i + 1] - DW - .38) for i in range(3)]
            wins += [(z0 + (2.1 if cab < 0 else .5), doors[0] - DW - .38), (doors[3] + DW + .38, z1 - (2.1 if cab > 0 else .5))]
            wins = [w for w in wins if w[1] - w[0] > .5]
            cabw = [(z1 - 1.55, z1 - .45)] if cab > 0 else ([(z0 + .45, z0 + 1.55)] if cab < 0 else [])
            if not b.hi:
                lo = (min(w[0] for w in wins), max(w[1] for w in wins))
                return ([d + s * DW for d in doors for s in (-1, 1)] if style == 'yam' else []) + list(lo), (doors, [lo], [])
            st = [d + s * DW for d in doors for s in (-1, 1)] + [e for w in wins + cabw for e in w]
            st += [d + s * DN for d in doors for s in (-1, 1)]
            return st, (doors, wins, cabw)

        def colf(data):
            doors, wins, cabw = data

            def f(z, y):
                if not b.hi:
                    if YS1 < y < YW1:
                        return 'lit' if wins[0][0] < z < wins[0][1] else 'silver'
                    if style == 'yam':
                        return 'line' if (y < YS1 and any(abs(z - d) < DW for d in doors)) else 'silver'
                    return 'line' if YS0 < y < YS1 else 'silver'
                if any(abs(z - d) < DW for d in doors):
                    if YS1 < y < YW1:
                        return 'lit' if (not b.hi or any(abs(z - d) < DN for d in doors)) else doorcol
                    return doorcol if y < YD1 else 'silver'
                if y < YS0:
                    return 'silver'
                if y < YS1:
                    return 'line' if style == 'kei' else 'silver'
                if y < YW1:
                    if any(a < z < c for a, c in cabw):
                        return 'glass'
                    return 'lit' if any(a < z < c for a, c in wins) else 'silver'
                if YD1 < y < YT0:
                    return 'line'
                return 'silver'
            return f

        def roof(b, ci, zc, z0, z1, cab):
            roofp(b, W, YT1, YR, .2, z0, z1, capcol=('black' if cab < 0 else 'end', 'black' if cab > 0 else 'end'))
            b.tb(0, YR - .02, zc, 1.9, 4.4, .32, 1.7, 4.0, 'roof_d', skip='d')
            if ci in (1, 3):
                panto(b, zc + 6.6, YR, 4.85)

        def under(b, ci, zc, z0, z1, cab):
            b.quad((-W, YB, z0), (W, YB, z0), (W, YB, z1), (-W, YB, z1), 'under')
            if b.hi:
                b.box(-1.25, .36, zc - 4.6, 1.25, YB, zc + 4.6, 'under', skip='u')
            for dz in (-6.9, 6.9):
                bogie(b, zc + dz)

        def nose(b, lamp):
            # flat 'tablet' face: coloured lower half, black glass above, lamps and the lit destination strip along the top
            xs = [-W, -W + .1, -1.0, -.42, .42, 1.0, W - .1, W] if b.hi else [-W, -1.0, 1.0, W]
            ysf = [YB, 1.25, 1.62, 1.92, 2.92, 3.08, YT1] if (b.hi or style == 'kei') else [YB, 1.92, 2.92, 3.08, YT1]

            def f(x, y):
                if abs(x) > W - .1 and b.hi:
                    return 'silver_d'
                if y < 1.92:
                    if style == 'kei':
                        return 'line' if 1.25 < y < 1.62 else 'silver'
                    return 'line'
                if y < 2.92:
                    return 'glass'
                if y < 3.08:
                    return lamp if abs(x) > 1.0 else ('sign' if abs(x) < .42 else 'black')
                return 'black'
            b.grid((0, 0, 0), (1, 0, 0), (0, 1, 0), xs, ysf, f)
            b.tb(0, .28, -.55, 2.5, 1.1, YB - .28, 2.7, 1.2, 'silver_d', skip='u', dz=.02)   # skirt
            b.box(-.2, .62, .0, .2, .86, .3, 'end', skip='b')                                 # coupler
            if b.hi:
                b.box(-.9, 1.92, 0, .9, 1.96, .03, 'black', skip='b')
        train(b, 5, 20.0, .5, W, ys, layout, colf, nose, roof, under, noselen=.3)
    return fn


# ------------------------------------------------------------------ Shinkansen (N700 style), 8 cars shortened to 200 m
SX = [1.30, 1.63, 1.69, 1.69, 1.68, 1.64, 1.45, 0.95, 0.40]
SY = [0.30, 0.78, 1.55, 1.80, 2.02, 2.52, 3.08, 3.45, 3.62]
NOSE = 10.5


def pl(knots, t):
    for (a, va), (c, vc) in zip(knots, knots[1:]):
        if t <= c:
            return lerp(va, vc, (t - a) / (c - a))
    return knots[-1][1]


def s_ring(z, t, idx):
    """Body section through the stations idx; t 0 = full section .. 1 = nose tip."""
    yt = pl([(0, 3.62), (.14, 3.46), (.29, 3.02), (.43, 2.46), (.62, 1.88), (.81, 1.38), (.93, 1.10), (1, .90)], t)
    wf = pl([(0, 1), (.43, .985), (.62, .94), (.81, .82), (.93, .58), (1, .22)], t)
    yb = lerp(.30, .46, t)
    yc = max(yb + .08, min(1.80, yt - .42))
    pts = []
    for i, (x, y) in enumerate(zip(SX, SY)):
        if i == 0:
            y = yb
        elif y > yc:
            y = yc + (y - yc) * (yt - yc) / (3.62 - yc)
        y = max(y, yb + .02 * i)
        if t > 0 and i >= 6:  # flatten the bill: the shoulders spread as the roof comes down
            x = lerp(x, SX[5] * (1.0 - .16 * (i - 5)), min(1, t * 1.6))
        pts.append((x * wf, y, z))
    if len(idx) < 9:
        pts[7] = (pts[7][0], pts[8][1], z)
    pts = [pts[i] for i in idx]
    return pts + [(-x, y, z_) for x, y, z_ in reversed(pts)]


def shinkansen(b):
    N, P, G = 8, 25.0, .5
    idx = list(range(9)) if b.hi else [0, 2, 3, 4, 5, 7]
    m = len(idx)
    wy0, wy1 = SY[4], SY[5]
    dv = Vector((SX[5] - SX[4], wy1 - wy0, 0))
    wl = dv.length
    dv.normalize()

    def key(i):  # ring segment -> lower station of the equivalent right-side segment ('top' / 'bot')
        if i == m - 1:
            return 'top'
        if i == 2 * m - 1:
            return 'bot'
        return idx[i] if i < m - 1 else idx[2 * m - 2 - i]
    base = {0: 'white_d' if b.hi else 'white', 2: 'blue', 7: 'roofw', 'top': 'roofw', 'bot': 'under'}

    def bodycol(k, i):
        r = key(i)
        return None if r == 4 else base.get(r, 'white')

    for ci in range(N):
        zc = (ci - (N - 1) / 2) * P
        cab = -1 if ci == 0 else (1 if ci == N - 1 else 0)
        z0 = zc - P / 2 + (NOSE if cab < 0 else G / 2)
        z1 = zc + P / 2 - (NOSE if cab > 0 else G / 2)
        caps = ((0 if cab < 0 else 1) | (0 if cab > 0 else 2)) if b.hi else 0
        b.loft([s_ring(z0, 0, idx), s_ring(z1, 0, idx)], bodycol, caps=caps, capcol='end')
        # window band: small lit windows, a door light near each vestibule
        a, c = z0 + (.6 if cab < 0 else 2.3), z1 - (.6 if cab > 0 else 2.3)
        nw = int((c - a) / 1.3)
        p = (c - a) / nw
        wins = [(a + i * p + p * .5 - .3, a + i * p + p * .5 + .3) for i in range(nw)]
        lo = (wins[0][0], wins[-1][1])
        dws = [z for z in ((z0 + 1.15) if cab >= 0 else None, (z1 - 1.15) if cab <= 0 else None) if z]
        wins += [(z - .22, z + .22) for z in dws]
        zs = sorted(set([z0, z1] + [e for w in wins for e in w])) if b.hi else [z0, lo[0], lo[1], z1]

        def f(z, y, wins=wins, lo=lo):
            if b.hi:
                return 'lit' if any(u < z < v for u, v in wins) else 'white'
            return 'lit' if lo[0] < z < lo[1] else 'white'
        for sx in b.mirx():
            b.grid((SX[4], wy0, 0), (0, 0, 1), dv, zs, [0, wl], f, flip=True)
        if ci < N - 1:
            b.box(-1.52, .5, z1, 1.52, 3.36, z1 + G, 'white_d', skip='fb')
        if b.hi or cab:
            for dz in (-8.7, 8.7):
                if cab * dz > 0:
                    dz = cab * 3.2
                b.box(-1.22, .0, zc + dz - 1.7, 1.22, .5, zc + dz + 1.7, 'bogie', skip='u')
        if ci in (2, 5):
            zp = zc + 7.0
            b.tb(0, 3.6, zp, 1.5, 4.6, .42, 1.1, 3.4, 'white_d', skip='d')
            b.beam((0, 4.0, zp - .5), (0, 4.55, zp + .5), .08, .08, 'end', lx=True)
            b.box(-.95, 4.55, zp + .38, .95, 4.6, zp + .62, 'end')
    # noses
    ts = [0, .14, .22, .32, .43, .55, .68, .81, .9, .96, 1.0] if b.hi else [0, .14, .32, .55, .81, 1.0]
    for sgn, lamp in ((1, 'head'), (-1, 'tail')):
        zb = sgn * (N * P / 2 - NOSE)

        def nosecol(k, i, lamp=lamp):
            r = key(i)
            tm = (ts[k] + ts[k + 1]) / 2
            if r == 'bot':
                return 'under'
            if r in (7, 'top') and .14 < tm < .32:
                return 'glass'
            if r == (6 if b.hi else 5) and .43 < tm < .56:
                return lamp
            if r == 2 and tm < .86:
                return 'blue'
            if r == 0 and b.hi:
                return 'white_d'
            return 'white'
        rings = [s_ring(zb + sgn * t * NOSE, t, idx) for t in ts]
        b.loft(rings, nosecol, caps=2, capcol='white', smooth=38)


# ------------------------------------------------------------------ Tokyo Monorail (straddle beam), 6 cars, 90 m
def monorail(b):
    W = 1.5
    YK, YH, Y0, Y1, Y1b, Y2, Y3, Y4, YR = -1.2, -.95, .30, 1.02, 1.18, 1.40, 2.42, 2.85, 3.1
    ys = [YK, YH, Y0, Y1, Y1b, Y2, Y3, Y4] if b.hi else [YK, Y0, Y1, Y2, Y3, Y4]
    NL = 1.7

    def layout(ci, zc, z0, z1, cab):
        doors = [zc - 3.9, zc + 3.9]
        wins = [(zc - 3.0 + i * 1.0 + .04, zc - 3.0 + (i + 1) * 1.0 - .04) for i in range(6)]
        wins += [(max(z0 + .5, zc - 6.7), zc - 4.8), (zc + 4.8, min(z1 - .5, zc + 6.7))]
        lo = (min(w[0] for w in wins), max(w[1] for w in wins))
        if not b.hi:
            return list(lo), (doors, wins, lo, cab, [])
        hat = [(zc + d - 1.3, zc + d + 1.3) for d in (-4.6, 4.6)]
        st = [d + s * .6 for d in doors for s in (-1, 1)] + [e for w in wins + hat for e in w] + [d + s * .42 for d in doors for s in (-1, 1)]
        return st, (doors, wins, lo, cab, hat)

    def colf(data):
        doors, wins, lo, cab, hat = data

        def f(z, y):
            if not b.hi:
                if y < Y0:
                    return 'navy'
                if Y2 < y < Y3:
                    return 'lit' if lo[0] < z < lo[1] else 'white'
                return 'mblue' if Y1 < y < Y2 else 'white'
            ind = any(abs(z - d) < .6 for d in doors)
            if y < Y0:
                return 'navy_d' if (y > YH and any(a < z < c for a, c in hat)) else 'navy'
            if Y2 < y < Y3:
                if ind:
                    return 'lit' if any(abs(z - d) < .42 for d in doors) else 'white'
                if any(a < z < c for a, c in wins):
                    return 'lit'
                return 'black' if (lo[0] < z < lo[1] or (cab > 0 and z > lo[1]) or (cab < 0 and z < lo[0])) else 'white'
            if ind:
                return 'white'
            if Y1 < y < Y1b:
                return 'mgreen'
            if Y1b < y < Y2:
                return 'mblue'
            return 'white'
        return f

    def roof(b, ci, zc, z0, z1, cab):
        roofp(b, W, Y4, YR, .3, z0, z1, col='white_d', capcol='end', flat=.8)
        if b.hi:
            for dz in (-3.4, 3.4):
                b.tb(0, YR - .02, zc + dz, 1.8, 3.6, .27, 1.6, 3.3, 'roof', skip='d')
        else:
            b.tb(0, YR - .02, zc, 1.8, 10.4, .27, 1.6, 10.1, 'roof', skip='d')

    def under(b, ci, zc, z0, z1, cab):
        b.quad((-W, Y0, z0), (W, Y0, z0), (W, Y0, z1), (-W, Y0, z1), 'under')
        for sx in b.mirx():   # inner faces of the skirts either side of the beam slot
            if b.hi:
                b.box(.55, YK, z0, W - .01, Y0, z1, 'under', skip='ur')
                for dz in (-4.6, 4.6):   # running-wheel housings seen in the slot
                    b.box(.42, -.9, zc + dz - .9, .55, .1, zc + dz + .9, 'end', skip='r')
            else:
                b.quad((.55, YK, z0), (.55, YK, z1), (.55, Y0, z1), (.55, Y0, z0), 'under')

    def nose(b, lamp):
        a, c = W, W - .22
        # skirt, waist and the raked windscreen
        b.hexa([(-a, YK, 0), (a, YK, 0), (c, YK, NL - .15), (-c, YK, NL - .15), (-a, Y0, 0), (a, Y0, 0), (c, Y0, NL - .05), (-c, Y0, NL - .05)], 'navy', skip='bu')
        b.hexa([(-a, Y0, 0), (a, Y0, 0), (c, Y0, NL - .05), (-c, Y0, NL - .05), (-a, Y2, 0), (a, Y2, 0), (c, Y2, NL), (-c, Y2, NL)], 'white', skip='bdu', f='mblue')
        b.hexa([(-a, Y2, 0), (a, Y2, 0), (c, Y2, NL), (-c, Y2, NL), (-a, Y4 + .2, 0), (a, Y4 + .2, 0), (c - .1, Y4 + .12, NL - 1.15), (-c + .1, Y4 + .12, NL - 1.15)],
               'black', skip='bd', f='glass', u='white_d')
        for sx in b.mirx():
            b.box(.62, .66, NL - .03, 1.15, .84, NL + .03, lamp, skip='b')
        if b.hi:
            b.box(-c, Y1 - .34, NL - .04, c, Y1 - .22, NL + .015, 'mgreen', skip='b')
            b.box(-.5, Y2 + .1, NL - .12, .5, Y2 + .26, NL - .06, 'sign', skip='b')
    train(b, 6, 15.0, .4, W, ys, layout, colf, nose, roof, under, noselen=NL, gang=(.6, .5, 2.6), lod_gang=False)


# ------------------------------------------------------------------ Yurikamome (rubber-tyred AGT), 6 cars, 54 m
RAINBOW = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']


def yurikamome(b):
    W = 1.235
    YB, Y1, Y2, Y3, Y4, Y5, YR = .42, 1.22, 1.50, 1.62, 2.58, 2.95, 3.2
    ys = [YB, Y1, Y2, Y3, Y4, Y5] if b.hi else [YB, Y1, Y3, Y4, Y5]
    NL = 1.3

    def layout(ci, zc, z0, z1, cab):
        doors = [zc - 2.25, zc + 2.25]
        wins = [(zc - 1.4, zc - .04), (zc + .04, zc + 1.4), (max(z0 + .3, zc - 4.0), zc - 3.1), (zc + 3.1, min(z1 - .3, zc + 4.0))]
        lo = (min(w[0] for w in wins), max(w[1] for w in wins))
        if not b.hi:
            return list(lo), (ci, zc, doors, wins, lo)
        st = [d + s * .58 for d in doors for s in (-1, 1)] + [e for w in wins for e in w] + [d + s * .4 for d in doors for s in (-1, 1)]
        return st, (ci, zc, doors, wins, lo)

    def colf(data):
        ci, zc, doors, wins, lo = data

        def f(z, y):
            if not b.hi:
                if Y3 < y < Y4:
                    return 'lit' if lo[0] < z < lo[1] else 'black'
                return RAINBOW[ci] if Y1 < y < Y3 else 'white'
            ind = any(abs(z - d) < .58 for d in doors)
            if Y3 < y < Y4:
                if ind:
                    return 'lit' if any(abs(z - d) < .4 for d in doors) else 'silver'
                return 'lit' if any(a < z < c for a, c in wins) else 'black'
            if ind:
                return 'silver'
            if Y1 < y < Y2:
                return RAINBOW[ci]
            return 'white'
        return f

    def roof(b, ci, zc, z0, z1, cab):
        roofp(b, W, Y5, YR, .22, z0, z1, col='white_d', capcol='end', flat=.6)
        b.tb(0, YR - .02, zc, 1.5, 3.4, .16, 1.3, 3.1, 'roof', skip='d')

    def under(b, ci, zc, z0, z1, cab):
        b.quad((-W, YB, z0), (W, YB, z0), (W, YB, z1), (-W, YB, z1), 'under')
        if b.hi:
            b.box(-W + .08, .16, z0 + .3, W - .08, YB, z1 - .3, 'under', skip='u')
        for sx in b.mirx():
            for dz in (-2.7, 2.7):
                if b.hi:
                    b.cyl((W - .34, .46, zc + dz), (W - .06, .46, zc + dz), .46, n=10, col='end', capcol='wheel', caps=2)
                else:
                    disc(b, W - .06, .46, zc + dz, .46, 6, 'end')

    def nose(b, lamp):
        a, c = W, W - .2
        b.hexa([(-a, YB, 0), (a, YB, 0), (c, YB, NL), (-c, YB, NL), (-a, Y3, 0), (a, Y3, 0), (c, Y3, NL), (-c, Y3, NL)], 'white', skip='bu', f='black', d='under')
        b.hexa([(-a, Y3, 0), (a, Y3, 0), (c, Y3, NL), (-c, Y3, NL), (-a, Y5 + .2, 0), (a, Y5 + .2, 0), (c - .08, Y5 + .1, NL - .85), (-c + .08, Y5 + .1, NL - .85)],
               'black', skip='bd', f='glass', u='white_d')
        for sx in b.mirx():
            b.box(.55, 1.2, NL - .03, 1.0, 1.36, NL + .03, lamp, skip='b')
        b.box(-c, YB - .2, NL - .5, c, YB + .14, NL + .06, 'c4' if lamp == 'head' else 'c0', skip='b')
    train(b, 6, 9.0, .3, W, ys, layout, colf, nose, roof, under, noselen=NL, gang=(.55, .6, 2.7), lod_gang=False)


MODELS = {
    'tokyo_yamanote_train': (commuter('yam'), tp(line=(0x9acd32, .4, 0))),
    'tokyo_keihin_train': (commuter('kei'), tp(line=(0x1aa7e0, .4, 0))),
    'tokyo_shinkansen': (shinkansen, tp(blue=(0x1b3f96, .35, 0), roofw=(0xdcdedc, .45, 0))),
    'tokyo_monorail_train': (monorail, tp(navy=(0x1d3f6e, .45, 0), navy_d=(0x16305a, .5, 0), mblue=(0x2f9fd6, .4, 0), mgreen=(0x63b84e, .4, 0)), {'settle': None}),
    'tokyo_yurikamome_train': (yurikamome, tp(c0=(0xd63a36, .4, 0), c1=(0xe8862a, .4, 0), c2=(0xe8c832, .4, 0), c3=(0x4fae4a, .4, 0), c4=(0x2f8fd0, .4, 0), c5=(0x7a55b0, .4, 0))),
}

if __name__ == '__main__':
    run(MODELS)
