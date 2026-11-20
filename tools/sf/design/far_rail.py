# far_rail.py - San Francisco cable cars (Powell single-ended, California double-ended) and the
# F-line streetcars (PCC, Milan Peter Witt).  blender -b -P tools/sf/design/far_rail.py -- [names]
# Front +Z, wheels on y 0, metres.  Invented liveries, no lettering.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

CC_PAL = {
    'maroon': (0x7a1e26, .42, 0), 'maroon_d': (0x58151c, .5, 0), 'cream': (0xe4d9bb, .55, 0), 'gold': (0xcfa53c, .35, 0),
    'roof': (0xa7a292, .85, 0), 'wood': (0xa06f3e, .6, 0), 'wood_d': (0x6a4527, .65, 0), 'glass': (0x27353b, .08, 0),
    'glass_t': (0x5d6f66, .15, 0), 'steel': (0x2b2c2f, .6, 0), 'iron': (0x47474a, .5, 0), 'brass': (0xb9953a, .3, 1),
    'floor': (0x5e5446, .9, 0), 'white': (0xe9e5d8, .5, 0), 'lamp': (0xfff0c2, .2, 0, 0xffe9a8), 'tail': (0xb01d18, .3, 0, 0x8a1410),
    'under': (0x1f1f21, .9, 0), 'red': (0xa3231f, .45, 0),
}
FL, EV, W = 0.87, 2.74, 0.98


def cc_truck(b, zc):
    for sx in b.mirx():
        for dz in (-0.62, 0.62):
            b.cyl((0.49, .28, zc + dz), (0.59, .28, zc + dz), .28, n=12, col='steel', capcol='iron', nl=8)
            if b.hi:
                b.box(.66, .18, zc + dz - .13, .73, .40, zc + dz + .13, 'iron')
        b.box(0.60, .2, zc - 1.0, 0.67, .46, zc + 1.0, 'steel')
    b.box(-.5, .3, zc - .18, .5, .55, zc + .18, 'under')
    if b.hi:
        for dz in (-0.62, 0.62):
            b.cyl((-.5, .28, zc + dz), (.5, .28, zc + dz), .05, n=5, col='under', caps=0)


def cc_bumper(b, z):
    """End bumper + pilot + platform apron; z = outermost point (+Z end)."""
    n = 6 if b.hi else 2
    poly = [(-1.0 + 2.0 * i / n, z - 0.15 * (-1.0 + 2.0 * i / n) ** 2) for i in range(n + 1)] + [(1.0, z - .30), (-1.0, z - .30)]
    b.prism(poly, 'y', .56, .72, 'steel')
    b.box(-W, .60, z - .62, W, FL, z - .14, 'maroon_d', u='floor', d='under')
    if b.hi:
        for x in (-.72, -.36, 0, .36, .72):
            b.beam((x, .57, z - .16), (x, .20, z - .30), .24, .03, 'wood_d', up=(0, 0, 1), caps=1)
        b.box(-.9, .18, z - .33, .9, .23, z - .27, 'steel')
    else:
        b.beam((0, .57, z - .16), (0, .20, z - .30), 1.7, .03, 'wood_d', up=(0, 0, 1))


def cc_dash(b, z, full=True, lamp=True):
    """Dash panel facing +Z at z (full: glazed above, else waist-high with corner posts)."""
    y0, yb = FL - .14, 1.72
    b.panel((-W, y0, z + .04), (1, 0, 0), (0, 1, 0), 2 * W, yb - y0, 'maroon', 'gold', inset=.09, lw=.03)
    b.grid((-W, y0, z - .04), (1, 0, 0), (0, 1, 0), [0, 2 * W], [0, yb - y0], lambda u, v: 'maroon_d', flip=True)
    b.box(-W - .02, yb, z - .06, W + .02, yb + .05, z + .06, 'cream')
    if full:
        xs = [-W, -W + .08, -.36, -.30, .30, .36, W - .08, W]
        ys = [yb + .05, yb + .10, 2.46, 2.52, EV]

        def f(x, y):
            win = (-W + .08 < x < -.36) or (-.30 < x < .30) or (.36 < x < W - .08)
            return 'glass' if (win and yb + .10 < y < 2.46) else 'cream'
        b.grid((0, 0, z + .03), (1, 0, 0), (0, 1, 0), xs, ys, f)
        b.grid((0, 0, z - .03), (1, 0, 0), (0, 1, 0), xs, ys, f, flip=True)
    for sx in b.mirx():
        b.box(W - .09, y0, z - .05, W, EV, z + .05, 'cream')
    if lamp:
        b.cyl((0, 1.28, z + .04), (0, 1.28, z + .16), .13, .16, n=10, col='steel', caps=2, capcol='lamp')
    else:
        b.box(-.07, 1.2, z + .04, .07, 1.32, z + .08, 'tail')


def cc_open(b, z0, z1, nb=3):
    """Open section: outward-facing benches, roof posts, grab poles, running boards."""
    b.box(-W, FL - .14, z0, W, FL, z1, 'maroon', u='floor', d='under')
    zs = [z0 + (z1 - z0) * i / nb for i in range(nb + 1)]
    zc = (z0 + z1) / 2
    for sx in b.mirx():
        if b.hi:
            b.box(W, FL - .095, z0, W + .012, FL - .065, z1, 'gold', skip='l')
        for z in zs:
            zz = min(max(z, z0 + .04), z1 - .04)
            b.box(W - .07, FL, zz - .035, W, EV, zz + .035, 'cream')
        for i in range(nb):
            za, zb = zs[i] + (.06 if i == 0 else .02), zs[i + 1] - (.06 if i == nb - 1 else .02)
            b.panel((.93, FL, za), (0, 0, 1), (0, 1, 0), zb - za, .40, 'maroon', 'gold', inset=.06, flip=True)
            if b.hi:
                zm = (zs[i] + zs[i + 1]) / 2
                b.cyl((W - .02, FL + .40, zm), (W - .02, EV - .2, zm), .022, n=5, col='white', caps=0)
        if b.hi:
            for xa, xb in ((.50, .63), (.65, .78), (.80, .94)):
                b.box(xa, 1.27, z0 + .06, xb, 1.31, z1 - .06, 'wood')
            for ya, yb in ((1.36, 1.48), (1.52, 1.64), (1.68, 1.80)):
                b.box(.44, ya, z0 + .06, .48, yb, z1 - .06, 'wood')
            for z in zs[1:-1]:
                b.box(.42, FL, z - .02, .46, 1.84, z + .02, 'wood_d')
                b.box(.50, 1.31, z - .015, .94, 1.50, z + .015, 'wood_d', skip='d')
            b.box(.42, 1.80, z0 + .04, .50, 1.85, z1 - .04, 'wood_d')
        else:
            b.box(.50, 1.27, z0 + .06, .94, 1.31, z1 - .06, 'wood')
            b.box(.44, 1.31, z0 + .06, .48, 1.82, z1 - .06, 'wood')
        for z in (z0 + .04, z1 - .04):
            b.box(.42, FL, z - .025, .95, 1.54, z + .025, 'maroon')
        # fascia under the eave: cream with a maroon band lined in gold
        b.box(W - .06, EV - .2, z0, W, EV, z1, 'cream', skip='r')
        rows = [0, .05, .075, .125, .15, .2]
        b.grid((W, EV - .2, z0), (0, 0, 1), (0, 1, 0), [0, z1 - z0], rows,
               (lambda u, v: 'cream' if (v < .05 or v > .15) else ('maroon' if .075 < v < .125 else 'gold')) if b.hi else (lambda u, v: 'cream'), flip=True)
        b.box(W, .44, z0 - .05, 1.2, .49, z1 + .05, 'wood_d')
        if b.hi:
            for z in zs:
                b.beam((W - .12, .70, z), (1.16, .45, z), .04, .04, 'steel')
    for sx in b.mirx():  # route boards on the roof edge (blank)
        b.box(1.0, EV + .08, z0 + .3, 1.04, EV + .30, z1 - .3, 'maroon_d', skip='r')
        b.panel((1.04, EV + .08, z0 + .3), (0, 0, 1), (0, 1, 0), z1 - z0 - .6, .22, 'maroon', 'gold', inset=.03, lw=.02, flip=True)
    if b.hi:
        b.beam((0, FL, zc + .15), (0, 1.95, zc + .32), .05, .035, 'steel', caps=1)
        b.box(-.04, 1.93, zc + .27, .04, 2.0, zc + .37, 'wood_d')
        b.beam((.24, FL, zc - .35), (.24, 1.85, zc - .2), .05, .035, 'red', caps=1)
        b.box(-.12, FL, zc - .1, .12, FL + .02, zc + .5, 'steel', skip='d')


def cc_saloon(b, z0, z1, nw):
    b.box(-W + .02, FL - .14, z0 + .01, W - .02, FL, z1 - .01, 'under')
    L = z1 - z0
    pil = .09
    wz = [(z0 + .12 + i * (L - .24) / nw + pil / 2, z0 + .12 + (i + 1) * (L - .24) / nw - pil / 2) for i in range(nw)]
    zs = sorted(set([z0, z0 + .07, z0 + .10, z1 - .10, z1 - .07, z1] + [e for w in wz for e in w]))
    ys = [FL - .14, FL - .06, FL - .03, 1.50, 1.53, 1.60, 1.68, 2.36, 2.41, 2.55, 2.60, 2.66, 2.70, EV]

    def f(z, y):
        inwin = any(a < z < c for a, c in wz)
        if y < 1.60:
            if b.hi and (FL - .06 < y < 1.53) and (z0 + .07 < z < z1 - .07) and not ((FL - .03 < y < 1.50) and (z0 + .10 < z < z1 - .10)):
                return 'gold'
            return 'maroon'
        if y < 1.68:
            return 'cream'
        if y < 2.36:
            return 'glass' if inwin else 'cream'
        if y < 2.41:
            return 'cream'
        if y < 2.55:
            return 'glass_t' if (inwin and b.hi) else 'cream'
        if 2.66 < y < 2.70 and b.hi:
            return 'maroon'
        return 'cream'
    for sx in b.mirx():
        b.grid((W, 0, 0), (0, 0, 1), (0, 1, 0), zs, ys, f, flip=True)
    xs = [-W, -W + .1, -.42, -.36, -.30, .30, .36, .42, W - .1, W]
    ys2 = [FL - .14, FL + .1, 1.60, 1.68, 2.36, 2.42, EV]

    def g(x, y):
        door, dglass = abs(x) < .36, abs(x) < .30
        if y < FL + .1:
            return 'wood_d' if door else 'maroon_d'
        if y < 1.60:
            return 'wood' if dglass else ('cream' if door else 'maroon')
        if y < 1.68:
            return 'cream'
        if y < 2.36:
            return 'glass' if (dglass or (.42 < abs(x) < W - .1)) else 'cream'
        return 'cream'
    b.grid((0, 0, z1), (1, 0, 0), (0, 1, 0), xs, ys2, g)
    b.grid((0, 0, z0), (1, 0, 0), (0, 1, 0), xs, ys2, g, flip=True)


def cc_roof(b, za, zb, bell_front=True, bell_rear=False):
    def sec(s, z):
        dy = -(1 - s) * .12
        return [(-1.12 * s, EV, z), (-1.12 * s, EV + .07 + dy, z), (-.6 * s, EV + .2 + dy, z), (.6 * s, EV + .2 + dy, z), (1.12 * s, EV + .07 + dy, z), (1.12 * s, EV, z)]
    st = [(za, .62), (za + .07, .82), (za + .22, .95), (za + .5, 1.0), (zb - .5, 1.0), (zb - .22, .95), (zb - .07, .82), (zb, .62)]
    if not b.hi:
        st = [st[0], st[2], st[5], st[7]]
    b.loft([sec(s, z) for z, s in st], ['cream', 'roof', 'roof', 'roof', 'cream', 'cream'], smooth=40, capcol='cream')
    # clerestory (monitor roof) with transom lights
    c0, c1 = za + .75, zb - .95

    def sec2(s, h, z):
        y = EV + .19
        return [(-.58 * s, y, z), (-.58 * s, y + .16 * h, z), (-.3 * s, y + .25 * h, z), (.3 * s, y + .25 * h, z), (.58 * s, y + .16 * h, z), (.58 * s, y, z)]
    nwin = 8 if b.hi else 0
    zz = [c0 + .45 + (c1 - c0 - .9) * i / max(nwin, 1) for i in range(nwin + 1)] if nwin else [c0 + .45, c1 - .45]
    stations = [(c0, .8, .05)]
    win = [False]
    for i, z in enumerate(zz):
        if nwin and i > 0:
            stations.append((z - .06, 1, 1))
            win.append(False)
            stations.append((z, 1, 1))
            win.append(True)
        else:
            stations.append((z, 1, 1))
            win.append(nwin > 0)
    stations.append((c1, .8, .05))
    wk = win

    def cf(k, i):
        if i == 5:
            return None
        if i in (0, 4):
            return 'glass_t' if (b.hi and 0 < k < len(stations) - 2 and wk[k]) else 'cream'
        return 'roof'
    b.loft([sec2(s, h, z) for z, s, h in stations], cf, smooth=40, caps=0)
    ends = ([(zb, 1)] if bell_front else []) + ([(za, -1)] if bell_rear else [])
    for ze, d in ends:
        with b.at(0, EV + .14, ze - d * .64):
            b.box(-.05, 0, -.04, .05, .12, .04, 'steel')
            b.lathe([(.115, .12), (.10, .20), (.06, .28), (.02, .32)], n=8, col='brass', nl=6)
        z0, z1 = sorted((ze - d * .40, ze - d * .34))
        b.box(-.45, EV + .1, z0, .45, EV + .36, z1, 'maroon_d', skip='f' if d > 0 else 'b')
        for sx in b.mirx():
            b.beam((.3, EV + .1, ze - d * .37), (.3, EV + .02, ze - d * .37), .04, .04, 'steel')
        b.panel((-.45, EV + .1, ze - d * .34), (1, 0, 0), (0, 1, 0), .9, .26, 'maroon', 'gold', inset=.03, lw=.02, flip=d < 0)


def cable_car(b):
    """Powell-style single-ended car, 8.4 m."""
    for zc in (-2.45, 2.45):
        cc_truck(b, zc)
    b.box(-.8, .42, -4.0, .8, FL - .14, 4.0, 'under')
    cc_bumper(b, 4.2)
    with b.at(ry=180):
        cc_bumper(b, 4.2)
    cc_dash(b, 3.62)
    cc_open(b, 0.10, 3.56, nb=3)
    cc_saloon(b, -3.10, 0.10, nw=4)
    # rear platform
    b.box(-W, FL - .14, -3.62, W, FL, -3.10, 'maroon', u='floor', d='under')
    with b.at(ry=180):
        cc_dash(b, 3.62, full=False, lamp=False)
    for sx in b.mirx():
        b.box(W, .44, -3.62, 1.2, .49, -3.12, 'wood_d')
        if b.hi:
            b.cyl((W - .03, FL, -3.36), (W - .03, 1.75, -3.36), .022, n=5, col='white', caps=0)
            b.beam((W - .03, 1.75, -3.6), (W - .03, 1.75, -3.12), .04, .04, 'white')
    if b.hi:
        b.cyl((.45, FL, -3.42), (.45, 1.9, -3.42), .025, n=5, col='brass', caps=0)
        b.cyl((.45, 1.88, -3.42), (.45, 1.92, -3.42), .16, n=8, col='brass')
    cc_roof(b, -4.2, 4.2)


def cable_car_california(b):
    """California Street double-ended car, 9.2 m: open sections at both ends, closed saloon between."""
    for zc in (-2.75, 2.75):
        cc_truck(b, zc)
    b.box(-.8, .42, -4.4, .8, FL - .14, 4.4, 'under')
    for ry in (0, 180):
        with b.at(ry=ry):
            cc_bumper(b, 4.6)
            cc_dash(b, 4.02)
            cc_open(b, 1.55, 3.96, nb=2)
    cc_saloon(b, -1.55, 1.55, nw=4)
    cc_roof(b, -4.6, 4.6, bell_rear=True)



# ------------------------------------------------------------------ streetcars
SC_PAL = {
    'green': (0x2f6a50, .4, 0), 'cream': (0xe6dcbc, .45, 0), 'roof': (0xc9c2aa, .6, 0), 'roof_d': (0x9d9886, .7, 0),
    'glass': (0x26343a, .08, 0), 'door': (0x3a4a4e, .2, 0), 'steel': (0x2b2c2f, .6, 0), 'chrome': (0xb5b9bd, .3, 1),
    'under': (0x1e1e20, .9, 0), 'lamp': (0xfff0c2, .2, 0, 0xffe9a8), 'tail': (0xb01d18, .3, 0, 0x8a1410),
    'orange': (0xe2701c, .42, 0), 'orange_d': (0xa94d12, .5, 0), 'sign': (0x17181a, .4, 0), 'iron': (0x47474a, .5, 0),
    'silver': (0x9fa3a6, .4, 0),
}


def sc_trucks(b, zc, half, r=.33, gauge=.72):
    for z0 in zc:
        for sx in b.mirx():
            for dz in (-half, half):
                b.cyl((gauge - .1, r, z0 + dz), (gauge + .04, r, z0 + dz), r, n=12, col='steel', capcol='iron', nl=8)
            b.box(gauge + .04, .22, z0 - half - .25, gauge + .12, .50, z0 + half + .25, 'steel')
        b.box(-.6, .28, z0 - .3, .6, .6, z0 + .3, 'under')


def sc_pole(b, zb, zt, yb, yt, x=0.0):
    b.box(x - .12, yb - .02, zb - .25, x + .12, yb + .1, zb + .25, 'steel')
    b.beam((x, yb + .08, zb), (x, yt, zt), .05, .05, 'steel', caps=1)
    if b.hi:
        b.beam((x, yb + .08, zb + .3), (x, yb + .35, zb - .5), .03, .03, 'iron')
        b.cyl((x - .03, yt, zt), (x + .03, yt, zt), .07, n=6, col='iron')


def streetcar_pcc(b):
    """F-line PCC streetcar, 14 m: streamlined body, cream / green 'wings' livery, trolley pole."""
    lv = [(0.30, 1.24, 6.82, -6.82, 1.75, 1.35), (0.62, 1.30, 6.90, -6.90, 1.8, 1.4), (1.08, 1.30, 6.88, -6.89, 1.8, 1.4),
          (1.24, 1.30, 6.85, -6.88, 1.8, 1.4), (2.00, 1.26, 6.40, -6.78, 1.6, 1.33), (2.08, 1.255, 6.36, -6.77, 1.58, 1.32),
          (2.27, 1.24, 6.26, -6.73, 1.5, 1.28), (2.52, 1.16, 6.08, -6.62, 1.33, 1.17), (2.80, 0.93, 5.75, -6.3, 1.0, .85),
          (2.98, 0.55, 5.3, -5.85, .55, .40), (3.05, 0.2, 4.95, -5.6, .2, .15)]
    p, pil = 0.78, 0.10
    wins = [(3.3 - (i + 1) * p + pil / 2, 3.3 - i * p - pil / 2) for i in range(11)]
    doors = [(3.36, 3.98), (4.04, 4.66), (-1.34, -0.64), (-0.56, 0.14)]  # leaves, right side (-X)
    zs = sorted(set([4.70, 4.01, -5.33] + [e for w in wins for e in w] + [e for d in doors for e in d]))
    NF, NR = (7, 6) if b.hi else (4, 3)

    def col(k, sx, part, j, z):
        ind = any(a < z < c for a, c in doors) and sx < 0
        indz = sx < 0 and (3.3 < z < 4.7 or -1.4 < z < 0.2)
        inw = any(a < z < c for a, c in wins) if b.hi else (-5.2 < z < 3.25)
        if k <= 3 and part == 's' and indz:
            return 'door' if (ind and k < 3) else ('glass' if ind else 'cream')
        if k == 0:
            return 'green'
        if k == 1:
            return 'cream' if (part == 'f' and j < NF - 1) else 'green'
        if k == 2:
            return 'cream'
        if k == 3:
            if part == 'f':
                return 'cream' if (j == NF - 1 or (j == 0 and b.hi and False)) else 'glass'
            if part == 'r':
                return 'cream' if j in (NR - 1, 1 if b.hi else -1) else 'glass'
            return 'glass' if (inw and not indz) else 'cream'
        if k == 4:
            return 'green'
        if k == 5:
            if part == 'f':
                return 'sign' if j < NF - 3 else 'cream'
            if part == 's' and not indz:
                return 'glass' if (any(a + .08 < z < c - .08 for a, c in wins) and b.hi) else 'cream'
            return 'cream'
        return 'roof'
    plan_body(b, lv, zs, col, nf=NF if b.hi else 7, nr=NR if b.hi else 6, top='roof', bottom='under')
    # bumpers (anti-climbers)
    for zf, rf, sgn in ((6.90, 1.8, 1), (-6.90, 1.4, -1)):
        n = 8 if b.hi else 4
        pts = []
        for i in range(n + 1):
            t = radians(-72 + 144 * i / n)
            pts.append((1.31 * sin(t), .50, sgn * (abs(zf) + .035 - rf * (1 - cos(t)))))
        b.tube(pts, .065, n=4, col='chrome', ph=pi / 4)
    b.cyl((0, .98, 6.85), (0, .98, 6.985), .15, .13, n=10, col='chrome', caps=2, capcol='lamp')
    for sx in b.mirx():
        b.box(.70, .80, -6.72, .86, .90, -6.60, 'tail')
        if b.hi:
            b.box(.55, 1.02, 6.60, .67, 1.08, 6.74, 'lamp')
    sc_trucks(b, (-3.6, 3.6), .92)
    # roof ventilation monitor
    b.tb(0, 3.0, -.6, .9, 8.0, .13, .7, 7.6, 'roof_d', skip='d')
    sc_pole(b, -1.8, -6.3, 3.13, 4.3)
    for sx in b.mirx():  # mirrors
        b.box(1.28, 1.65, 4.72, 1.36, 1.83, 4.76, 'steel')


def streetcar_witt(b):
    """Milan-style Peter Witt tram, 13.5 m, orange."""
    lv = [(0.36, 1.12, 6.60, -6.60, 1.9, 1.9), (0.58, 1.18, 6.68, -6.68, 2.0, 2.0), (1.22, 1.18, 6.68, -6.68, 2.0, 2.0),
          (1.30, 1.18, 6.68, -6.68, 2.0, 2.0), (2.12, 1.17, 6.64, -6.64, 2.0, 2.0), (2.22, 1.17, 6.64, -6.64, 2.0, 2.0),
          (2.46, 1.19, 6.66, -6.66, 2.0, 2.0), (2.52, 1.19, 6.66, -6.66, 2.0, 2.0), (2.80, 1.02, 6.45, -6.45, 1.85, 1.85), (3.02, 0.66, 6.0, -6.0, 1.45, 1.45),
          (3.12, 0.25, 5.2, -5.2, .7, .7)]
    p, pil = 0.80, 0.11
    wins = [(4.4 - (i + 1) * p + pil / 2, 4.4 - i * p - pil / 2) for i in range(11)]
    doors = [(3.26, 3.76), (3.84, 4.34), (-0.36, 0.14), (0.22, 0.72), (0.86, 1.36)]
    zs = sorted(set([4.55, -4.5] + [e for w in wins for e in w] + [e for d in doors for e in d]))
    NF = 5 if b.hi else 3

    def col(k, sx, part, j, z):
        ind = any(a < z < c for a, c in doors) and sx < 0
        indz = sx < 0 and (3.2 < z < 4.4 or -0.4 < z < 1.4)
        inw = any(a < z < c for a, c in wins) if b.hi else (-4.3 < z < 4.3)
        if k <= 3 and part == 's' and indz:
            return ('door' if k < 3 else 'glass') if ind else 'orange_d'
        if k == 0:
            return 'orange_d'
        if k == 2:
            return 'cream' if b.hi else 'orange'
        if k == 3:
            if part in 'fr':
                return 'orange' if j in (NF - 1, 1) else 'glass'
            return 'glass' if (inw and not indz) else 'orange'
        if k == 4:
            return 'orange'
        if k == 5:
            if part in 'fr' and j < 1:
                return 'sign'
            return 'orange'
        if k == 6:
            return 'cream'
        if k >= 7:
            return 'roof_d'
        return 'orange'
    plan_body(b, lv, zs, col, nf=5, nr=5, top='roof_d', bottom='under')
    for sgn in (1, -1):
        b.box(-.75, .42, sgn * 6.62, .75, .56, sgn * 6.75, 'steel')
        b.cyl((0, .92, sgn * 6.62), (0, .92, sgn * 6.75), .17, .15, n=10, col='steel', caps=2, capcol='lamp' if sgn > 0 else 'tail')
        if b.hi:
            b.beam((0, .42, sgn * 6.70), (0, .2, sgn * 6.60), 1.3, .04, 'steel', up=(0, 0, 1))
    sc_trucks(b, (-3.3, 3.3), .85, r=.36)
    sc_pole(b, -1.0, -6.0, 3.11, 4.3)
    if b.hi:
        for z in (-3.5, -1.2, 1.2, 3.5):
            b.box(-.2, 3.1, z - .25, .2, 3.2, z + .25, 'silver')


MODELS = {
    'sf_cable_car': (cable_car, CC_PAL),
    'sf_cable_car_california': (cable_car_california, CC_PAL),
    'sf_streetcar': (streetcar_pcc, SC_PAL),
    'sf_streetcar_orange': (streetcar_witt, SC_PAL),
}

if __name__ == '__main__':
    run(MODELS)
