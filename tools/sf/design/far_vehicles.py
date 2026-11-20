# far_vehicles.py - San Francisco road traffic: sedan, compact EV hatch, SUV, taxi, delivery van, box truck,
# police SUV, fire engine, trolleybus.  blender -b -P tools/sf/design/far_vehicles.py -- [names]
# Front +Z, wheels on y 0, metres.  Invented liveries, no lettering.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

BASE = {
    'glass': (0x243037, .08, 0), 'trim': (0x2a2b2e, .6, 0), 'under': (0x1c1c1e, .9, 0), 'tire': (0x1d1d1f, .85, 0),
    'hub': (0x9a9da1, .35, 0), 'grille': (0x1f2023, .5, 0), 'head': (0xdedcd0, .15, 0, 0x4a4840), 'tail': (0xa81c18, .3, 0, 0x7a120e),
    'chrome': (0xb9bdc1, .25, 1), 'steel': (0x8b8e92, .45, 0), 'amber': (0xe08a1c, .3, 0, 0x7a4406),
}


def pal(**kw):
    d = dict(BASE)
    d.update(kw)
    return d


def arch(b, w, zc, r):
    n = 8
    b.prism([(zc + (r + .075) * cos(pi * i / n), r + (r + .075) * sin(pi * i / n)) for i in range(n + 1)], 'x', w - .08, w + .012, 'trim')


def car(b, L, W, yd, roof, gh, r=.33, body='body', lower='trim', sidecol=None, roofcol=None, zw=None, tw=.22, mirrors=True, pf=.75, nose=(.45, .38), hood=.13):
    w = W / 2 - .04
    zf, zr = L / 2, -L / 2
    NF = 5 if b.hi else 3
    gzf, gzr, tzf, tzr = gh
    zwf, zwr = zw if zw else (zf - .92, zr + .98)
    lv = [(0.19, w - .07, zf - .03, zr + .03, nose[0] - .03, nose[1] - .02), (0.44, w, zf, zr, nose[0], nose[1]), (0.60, w, zf, zr, nose[0], nose[1]),
          (0.74, w, zf - .01, zr + .01, nose[0], nose[1]), (yd, w - .04, zf - .07, zr + .05, nose[0], nose[1])]
    sc = sidecol or (lambda z, k: body)

    def col(k, sx, part, j, z):
        if k == 0:
            return lower
        if k == 2:
            if part == 'f':
                return 'grille' if j < NF // 2 else 'head'
            if part == 'r':
                return 'tail' if j >= NF // 2 else body
        if part == 's':
            return sc(z, k)
        return body

    def warp(x, y, z):  # hood / boot fall away from the glasshouse
        if y > .5:
            t = (y - .5) / (yd - .5)
            if z > gzf - .2:
                y -= t * t * hood * smooth((z - gzf + .2) / (zf - gzf + .2))
            elif z < gzr + .1:
                y -= t * t * hood * .6 * smooth((gzr + .1 - z) / max(.3, gzr + .1 - zr))
        return (x, y, z)
    plan_body(b, lv, [zwf - .5, zwr + .5], col, nf=NF, nr=NF, top=body, bottom='under', pf=pf, warp=warp)
    wg = w - .05
    lg = [(yd - .14, wg, gzf + .04, gzr - .03, .32, .30), (roof - .07, wg - .13, tzf, tzr, .28, .26), (roof, wg - .32, tzf - .22, tzr + .22, .18, .18)]
    zB = max(min((tzf + tzr) / 2 + .15, tzf - .46), tzr + .52)

    def colg(k, sx, part, j, z):
        if k == 0:
            if part in 'fr':
                return 'glass' if j < NF - 1 else body
            return body if j == 1 else 'glass'
        return roofcol or body
    plan_body(b, lg, [zB + .05, zB - .05], colg, nf=NF, nr=NF, top=roofcol or body, bottom=None, caps=2, pf=.8)
    for sx in b.mirx():
        for zc in (zwf, zwr):
            wheel(b, w + .025, zc, r, tw, n=16)
            if b.hi:
                arch(b, w, zc, r)
                for a in range(5):  # spokes
                    ang = 2 * pi * a / 5
                    b.beam((w + .042, r, zc), (w + .042, r + r * .5 * cos(ang), zc + r * .5 * sin(ang)), .05, .012, 'trim', up=(1, 0, 0))
        if b.hi:  # door handles + sill line
            for zh in (zB + .25, zB - .75):
                b.box(w - .005, yd - .14, zh, w + .012, yd - .11, zh + .16, 'trim', skip='l')
        if mirrors:
            b.box(w - .06, yd + .02, gzf - .42, w + .04, yd + .14, gzf - .34, body, skip='l')
    return w


def sedan(b):
    car(b, 4.8, 1.86, .93, 1.45, (0.95, -1.55, 0.30, -1.05))


def taxi(b):
    car(b, 4.8, 1.86, .93, 1.45, (0.95, -1.55, 0.30, -1.05))
    b.bb(0, 1.45, -.35, .42, .04, .2, 'trim', skip='d')
    b.bb(0, 1.49, -.35, .36, .13, .14, 'sign', skip='d')


def hatch_ev(b):
    car(b, 4.4, 1.80, 1.02, 1.58, (1.30, -2.02, 0.62, -1.78), r=.32, zw=(1.38, -1.32), nose=(.5, .3))
    b.box(-.5, .50, 2.17, .5, .58, 2.205, 'trim')  # closed EV nose: thin intake line


def suv(b):
    w = car(b, 4.8, 1.92, 1.08, 1.74, (1.05, -2.22, 0.50, -2.02), r=.37, tw=.25)
    for sx in b.mirx():  # roof rails
        b.box(w - .42, 1.74, -1.7, w - .36, 1.78, .1, 'trim', skip='d')


def police(b):
    """Black-and-white patrol SUV with a roof light bar (lightbar_red / lightbar_blue lens materials)."""
    def sc(z, k):
        return 'white' if -1.15 < z < 1.2 else 'body'
    w = car(b, 5.1, 1.96, 1.10, 1.78, (1.15, -2.36, 0.58, -2.15), r=.38, tw=.26, sidecol=sc, roofcol='white')
    b.box(-.62, 1.78, -.02, .62, 1.83, .30, 'trim', skip='d')
    b.box(-.60, 1.83, 0, -.04, 1.93, .28, 'LB_RED', skip='d')
    b.box(.04, 1.83, 0, .60, 1.93, .28, 'LB_BLUE', skip='d')
    b.box(-.04, 1.83, .02, .04, 1.92, .26, 'trim', skip='d')
    b.box(-.75, .40, 2.52, .75, .62, 2.60, 'trim')  # push bumper
    if b.hi:
        for sx in b.mirx():
            b.box(.28, .40, 2.60, .36, .95, 2.66, 'trim')
        b.box(-.36, .86, 2.60, .36, .95, 2.66, 'trim')


def van(b):
    """White delivery van, 6.0 m, high roof."""
    L, w = 6.0, 1.02
    zf, zr = L / 2, -L / 2
    lv = [(.24, w - .06, zf - .05, zr + .02, .30, .12), (.50, w, zf, zr, .34, .14), (.66, w, zf, zr, .34, .14), (.80, w, zf, zr, .34, .14),
          (1.18, w, zf - .08, zr, .34, .14), (1.30, w, zf - .30, zr, .34, .14), (1.95, w - .03, zf - .78, zr + .02, .32, .14),
          (2.42, w - .08, zf - .95, zr + .04, .30, .14), (2.60, w - .32, zf - 1.3, zr + .2, .2, .12)]
    NF = 3

    def col(k, sx, part, j, z):
        if k == 0:
            return 'trim'
        if k == 2:
            if part == 'f':
                return 'grille' if j == 0 else 'head'
            if part == 'r':
                return 'tail' if j >= 1 else 'body'
        if k == 3 and part == 'f' and j == 0:
            return 'grille'
        if k == 5:
            if part == 'f':
                return 'glass' if j < NF - 1 else 'body'
            if part == 's' and 1.10 < z < 2.05:
                return 'glass'
        if k == 1 and part == 's':
            return 'stripe'
        return 'body'
    plan_body(b, lv, [2.08, 1.07, 0.95, -.4], col, nf=NF, nr=2, top='body', bottom='under', pf=.7)
    for sx in b.mirx():
        for zc in (zf - 1.0, zr + 1.35):
            wheel(b, w + .025, zc, .36, .24)
            if b.hi:
                arch(b, w, zc, .36)
        b.box(w - .02, 1.30, 2.06, w + .14, 1.52, 2.14, 'trim', skip='l')
    if b.hi:
        b.box(-.02, .7, zr - .012, .02, 2.3, zr + .02, 'trim')


def box_truck(b):
    """Box truck, 7.6 m: white cab-over cab, pale cargo box with a teal band (invented livery)."""
    w = 1.04
    lv = [(.42, w - .05, 3.75, 1.75, .25, .05), (.62, w, 3.80, 1.75, .28, .05), (.78, w, 3.80, 1.75, .28, .05), (.92, w, 3.80, 1.75, .28, .05),
          (1.42, w, 3.78, 1.75, .28, .05), (2.20, w - .04, 3.52, 1.75, .26, .05), (2.42, w - .12, 3.40, 1.75, .22, .05), (2.50, w - .3, 3.1, 1.80, .15, .05)]
    NF = 3

    def col(k, sx, part, j, z):
        if k == 0:
            return 'trim'
        if k == 2 and part == 'f':
            return 'grille' if j == 0 else 'head'
        if k == 3 and part == 'f' and j == 0:
            return 'grille'
        if k == 4:
            if part == 'f':
                return 'glass' if j < NF - 1 else 'body'
            if part == 's' and z > 2.45:
                return 'glass'
        return 'body'
    plan_body(b, lv, [3.4, 2.45], col, nf=NF, nr=2, top='body', bottom='under', pf=.6)
    # chassis + cargo box
    b.box(-.45, .55, -3.6, .45, .95, 1.8, 'under')
    W2 = 1.25
    us = [-3.8, 1.6]
    ys = [.98, 1.12, 2.35, 2.75, 3.4]

    def side(u, v):
        return 'box_d' if v < 1.12 else ('teal' if 2.35 < v < 2.75 and b.hi else 'box')
    for sx in b.mirx():
        b.grid((W2, 0, 0), (0, 0, 1), (0, 1, 0), us, ys, side, flip=True)
    b.grid((-W2, 0, 1.6), (1, 0, 0), (0, 1, 0), [0, 2 * W2], ys, side)
    b.grid((-W2, 0, -3.8), (1, 0, 0), (0, 1, 0), [0, .12, 2 * W2 - .12, 2 * W2], [.98, 1.12, 3.28, 3.4],
           lambda u, v: 'door' if (.12 < u < 2 * W2 - .12 and 1.12 < v < 3.28) else 'box_d', flip=True)
    b.quad((-W2, 3.4, 1.6), (W2, 3.4, 1.6), (W2, 3.4, -3.8), (-W2, 3.4, -3.8), 'box')
    b.quad((-W2, .98, -3.8), (W2, .98, -3.8), (W2, .98, 1.6), (-W2, .98, 1.6), 'under')
    b.box(-1.1, .45, -3.78, 1.1, .56, -3.70, 'trim')
    for sx in b.mirx():
        wheel(b, w + .03, 2.75, .42, .26)
        wheel(b, W2 - .02, -2.3, .42, .5)
        b.box(w - .02, 1.5, 3.3, w + .16, 1.9, 3.38, 'trim', skip='l')
        b.box(.75, .50, -3.82, 1.0, .62, -3.78, 'tail')
        if b.hi:
            b.box(.5, .4, -1.2, 1.15, .85, .6, 'trim')  # fuel tank / battery box
            b.box(W2 - .05, .55, -3.0, W2, .98, -2.95, 'trim')


def fire_engine(b):
    """Red pumper, 9.5 m: white-roofed crew cab, pump panel, compartment body with hose bed and ladder."""
    w = 1.2
    lv = [(.45, w - .05, 4.62, 1.3, .22, .05), (.72, w, 4.66, 1.3, .25, .05), (.86, w, 4.66, 1.3, .25, .05), (1.04, w, 4.66, 1.3, .25, .05),
          (1.50, w, 4.66, 1.3, .25, .05), (2.28, w - .03, 4.50, 1.3, .25, .05), (2.62, w - .08, 4.40, 1.3, .22, .05), (2.72, w - .3, 4.2, 1.35, .15, .05)]
    NF = 3

    def col(k, sx, part, j, z):
        if k == 0:
            return 'trim'
        if k == 2 and part == 'f':
            return 'grille' if j == 0 else 'head'
        if k == 3 and part == 'f' and j == 0:
            return 'grille'
        if k == 4:
            if part == 'f':
                return 'glass' if j < NF - 1 else 'body'
            if part == 's' and (3.35 < z < 4.3 or 1.55 < z < 2.45 or 2.6 < z < 3.2):
                return 'glass'
        if k >= 5:
            return 'white'
        return 'body'
    plan_body(b, lv, [4.3, 3.35, 3.2, 2.6, 2.45, 1.55], col, nf=NF, nr=2, top='white', bottom='under', pf=.55)
    # front bumper + chassis
    b.box(-1.22, .45, 4.62, 1.22, .75, 4.75, 'chrome')
    b.box(-.5, .55, -4.6, .5, 1.0, 1.4, 'under')
    # pump panel
    us = [.3, 1.3]
    for sx in b.mirx():
        b.grid((1.22, 0, 0), (0, 0, 1), (0, 1, 0), [.3, .42, 1.18, 1.3], [.6, .8, 1.9, 2.5],
               lambda u, v: 'steel' if (.42 < u < 1.18 and .8 < v < 1.9) else 'body', flip=True)
        if b.hi:
            for z, y in ((.6, 1.1), (.9, 1.1), (.6, 1.5), (.9, 1.5)):
                b.cyl((1.22, y, z), (1.30, y, z), .07, n=6, col='chrome')
    b.quad((-1.22, 2.5, 1.3), (1.22, 2.5, 1.3), (1.22, 2.5, .3), (-1.22, 2.5, .3), 'steel')
    # rear body: compartments with roll-up doors, hose bed
    cz = [-4.6, -4.5, -3.55, -3.45, -1.75, -1.65, -.75, -.65, .2, .3]

    def side(u, v):
        if v > 2.35:
            return 'body'
        if 1.04 < v < 1.1:
            return 'gold' if b.hi else 'body'
        door = (-4.5 < u < -3.55) or (-.65 < u < .2) or (-1.65 < u < -.75 and v > 1.1) or (-3.45 < u < -1.75 and v > 1.55)
        return 'door' if (door and .7 < v < 2.25) else 'body'
    for sx in b.mirx():
        b.grid((1.22, 0, 0), (0, 0, 1), (0, 1, 0), cz, [.55, .7, 1.04, 1.1, 1.55, 2.25, 2.35, 2.6], side, flip=True)
        wheel(b, w + .03, 3.55, .52, .3)
        wheel(b, w + .03, -2.6, .52, .55)
        b.box(1.0, 2.6, -4.4, 1.22, 2.72, .3, 'body', skip='d')
        b.box(w - .02, 1.7, 4.3, w + .2, 2.2, 4.4, 'trim', skip='l')
        b.box(.8, .78, -4.80, 1.1, 1.0, -4.74, 'tail')
        b.box(.95, 2.72, 3.6, 1.12, 2.86, 3.9, 'siren')
    b.grid((-1.22, 0, -4.6), (1, 0, 0), (0, 1, 0), [0, .3, 2.14, 2.44], [.55, .8, 2.3, 2.6],
           lambda u, v: 'door' if (.3 < u < 2.14 and .8 < v < 2.3) else 'body', flip=True)
    b.quad((-1.22, .55, -4.6), (1.22, .55, -4.6), (1.22, .55, .3), (-1.22, .55, .3), 'under')
    b.quad((-1.0, 2.6, .3), (1.0, 2.6, .3), (1.0, 2.6, -4.4), (-1.0, 2.6, -4.4), 'hose')
    b.box(-1.22, .5, -4.82, 1.22, .62, -4.6, 'chrome')
    # light bar on the cab roof, ladder on the right side, deck gun
    b.box(-.8, 2.72, 3.1, .8, 2.78, 3.42, 'trim', skip='d')
    b.box(-.78, 2.78, 3.12, -.04, 2.92, 3.4, 'siren', skip='d')
    b.box(.04, 2.78, 3.12, .78, 2.92, 3.4, 'siren', skip='d')
    if b.hi:
        for y in (2.78, 3.12):
            b.box(-1.26, y, -4.3, -1.20, y + .05, -.6, 'steel')
        for i in range(8):
            z = -4.2 + i * .5
            b.box(-1.26, 2.8, z, -1.21, 3.13, z + .04, 'steel')
        b.cyl((0, 2.6, -.2), (0, 2.95, -.2), .08, n=6, col='steel')
        b.cyl((0, 2.95, -.4), (0, 3.02, .35), .06, n=6, col='chrome')
    else:
        b.box(-1.26, 2.78, -4.3, -1.20, 3.17, -.6, 'steel')


def trolleybus(b):
    """12.2 m low-floor trolleybus, twin poles: white over grey with a red band that sweeps up at the rear."""
    L, w = 12.2, 1.27
    zf, zr = L / 2, -L / 2
    lv = [(.30, w - .05, zf - .06, zr + .04, .30, .16), (.52, w, zf, zr, .34, .18), (.74, w, zf, zr, .34, .18), (.88, w, zf, zr, .34, .18),
          (1.02, w, zf, zr, .34, .18), (1.22, w, zf - .02, zr, .34, .18), (2.24, w - .02, zf - .22, zr + .02, .34, .18),
          (2.62, w - .04, zf - .30, zr + .03, .34, .18), (2.92, w - .10, zf - .34, zr + .06, .32, .18), (3.02, w - .4, zf - .8, zr + .3, .2, .15)]
    NF = 4
    wins = [(4.35 - (i + 1) * 1.32 + .06, 4.35 - i * 1.32 - .06) for i in range(7)]
    doors = [(4.50, 4.98), (5.04, 5.50), (-1.75, -1.18), (-1.12, -.55)]
    zs = sorted(set([5.58, 4.42, -5.5] + [e for a in wins for e in a] + [e for a in doors for e in a]))

    def col(k, sx, part, j, z):
        ind = sx < 0 and any(a < z < c for a, c in doors)
        indz = sx < 0 and (4.42 < z < 5.58 or -1.8 < z < -.5)
        inw = any(a < z < c for a, c in wins) if b.hi else (-4.8 < z < 4.3)
        if k == 0:
            return 'trim'
        if part == 's' and indz and 1 <= k <= 5:
            return 'door' if ind else 'trim'
        if k == 2:
            if part == 'f':
                return 'grille' if j == 0 else 'head'
            if part == 'r':
                return 'tail' if j >= 1 else 'grey'
            return 'grey'
        if k == 1 or k == 3:
            return 'grey'
        if k == 4:
            return 'red'
        if k == 5:
            if part == 'f':
                return 'glass' if j < NF - 1 else 'white'
            if part == 'r':
                return 'red' if True else 'white'
            if z < -4.9:
                return 'red'
            return 'glass' if inw else 'trim'
        if k == 6:
            if part == 'f':
                return 'sign' if j < NF - 1 else 'white'
            return 'red' if (z < -4.9 or part == 'r') else 'white'
        return 'white'
    plan_body(b, lv, zs, col, nf=NF, nr=2, top='white', bottom='under', pf=.55)
    for sx in b.mirx():
        for zc, tw in ((zf - 2.75, .3), (zr + 3.3, .5)):
            wheel(b, w + .025, zc, .5, tw, hubr=.5)
            if b.hi:
                arch(b, w, zc, .5)
        b.box(w - .02, 1.9, zf - .28, w + .2, 2.3, zf - .2, 'trim', skip='l')
    # roof equipment and the trolley poles
    b.tb(0, 3.0, 2.2, 1.9, 3.2, .22, 1.7, 2.9, 'grey', skip='d')
    b.tb(0, 3.0, -2.6, 1.6, 2.2, .20, 1.4, 2.0, 'grey', skip='d')
    for sx in b.mirx():
        b.box(.22, 3.0, -1.6, .42, 3.14, -1.2, 'trim', skip='d')
        b.beam((.32, 3.12, -1.4), (.32, 3.85, -6.0), .06, .06, 'trim', caps=1)
        if b.hi:
            b.box(.26, 3.80, -6.1, .38, 3.9, -5.95, 'trim')
    if b.hi:
        b.box(-.55, 3.0, -5.9, .55, 3.1, -5.6, 'trim', skip='d')


MODELS = {
    'sf_sedan': (sedan, pal(body=(0xa9adb0, .32, .0))),
    'sf_hatch_ev': (hatch_ev, pal(body=(0xdcdcd6, .3, 0))),
    'sf_suv': (suv, pal(body=(0x24375a, .3, 0))),
    'sf_taxi': (taxi, pal(body=(0xe0aa1e, .35, 0), sign=(0xf6e7a8, .3, 0, 0x8a7a3a))),
    'sf_police': (police, pal(body=(0x1b1c1f, .3, 0), white=(0xdedcd4, .35, 0))),
    'sf_delivery_van': (van, pal(body=(0xdddbd3, .4, 0), stripe=(0xdddbd3, .4, 0))),
    'sf_box_truck': (box_truck, pal(body=(0xd9d7cf, .4, 0), box=(0xd5d2c6, .55, 0), box_d=(0x8f9296, .5, 0), teal=(0x2b7f86, .45, 0), door=(0xb7b9b6, .5, 0))),
    'sf_fire_engine': (fire_engine, pal(body=(0xb3201c, .3, 0), white=(0xe2dfd6, .35, 0), gold=(0xd4aa3a, .35, 0), door=(0xa9acae, .4, 0),
                                        hose=(0x6a6658, .9, 0), siren=(0xc2241c, .2, 0, 0xd02a18))),
    'sf_bus': (trolleybus, pal(white=(0xe3e2dc, .4, 0), grey=(0x9a9da0, .45, 0), red=(0xc22a26, .4, 0), door=(0x33434a, .15, 0), sign=(0x141517, .4, 0))),
}

if __name__ == '__main__':
    run(MODELS)
