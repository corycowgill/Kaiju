# far_vehicles.py - Tokyo road traffic: kei car / truck / van, JPN-Taxi-shaped cab, classic sedan cab, sedan, minivan,
# 2-tonne delivery truck, city bus, patrol car, compact pumper.  blender -b -P tools/tokyo/design/far_vehicles.py -- [names]
# Front +Z, wheels on y 0, metres.  Invented liveries, no lettering.  Lamps / lit windows are emissive (the level plays at dusk).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

BASE = {
    'glass': (0x243037, .08, 0), 'trim': (0x2a2b2e, .6, 0), 'under': (0x1c1c1e, .9, 0), 'tire': (0x1d1d1f, .85, 0),
    'hub': (0x9a9da1, .35, 0), 'grille': (0x1f2023, .5, 0), 'head': (0xf2eee0, .15, 0, 0xfff1cc), 'tail': (0xb01c18, .3, 0, 0xd81810),
    'chrome': (0xb9bdc1, .25, 1), 'steel': (0x8b8e92, .45, 0), 'amber': (0xe08a1c, .3, 0, 0xb86a08), 'plate': (0xe8e6dc, .5, 0),
}


def pal(**kw):
    d = dict(BASE)
    d.update(kw)
    return d


def arch(b, w, zc, r):
    n = 8
    b.prism([(zc + (r + .075) * cos(pi * i / n), r + (r + .075) * sin(pi * i / n)) for i in range(n + 1)], 'x', w - .08, w + .012, 'trim')


def wheels(b, w, zs, r, tw, n=14, spokes=True):
    for sx in b.mirx():
        for zc in zs:
            wheel(b, w + .025, zc, r, tw, n=n)
            if b.hi:
                arch(b, w, zc, r)
                if spokes:
                    for a in range(5):
                        ang = 2 * pi * a / 5
                        b.beam((w + .042, r, zc), (w + .042, r + r * .5 * cos(ang), zc + r * .5 * sin(ang)), .05, .012, 'trim', up=(1, 0, 0))


def plates(b, zf, zr, y=.42):
    if b.hi:
        b.box(-.17, y, zf - .01, .17, y + .17, zf + .012, 'plate', skip='b')
        b.box(-.17, y + .12, zr - .012, .17, y + .29, zr + .01, 'plate', skip='f')


def car(b, L, W, yd, roof, gh, r=.33, body='body', lower='trim', sidecol=None, roofcol=None, zw=None, tw=.22, mirrors=True, pf=.75, nose=(.45, .38), hood=.13,
        topcol=None, fender_mirrors=False):
    """Three-box saloon (SF's builder)."""
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
    plan_body(b, lv, [zwf - .5, zwr + .5], col, nf=NF, nr=NF, top=topcol or body, bottom='under', pf=pf, warp=warp)
    wg = w - .05
    lg = [(yd - .14, wg, gzf + .04, gzr - .03, .32, .30), (roof - .07, wg - .13, tzf, tzr, .28, .26), (roof, wg - .32, tzf - .22, tzr + .22, .18, .18)]
    zB = max(min((tzf + tzr) / 2 + .15, tzf - .46), tzr + .52)
    rc = roofcol or body

    def colg(k, sx, part, j, z):
        if k == 0:
            if part in 'fr':
                return 'glass' if j < NF - 1 else rc
            return rc if j == 1 else 'glass'
        return rc
    plan_body(b, lg, [zB + .05, zB - .05], colg, nf=NF, nr=NF, top=rc, bottom=None, caps=2, pf=.8)
    wheels(b, w, (zwf, zwr), r, tw, n=16)
    for sx in b.mirx():
        if b.hi:  # door handles
            for zh in (zB + .25, zB - .75):
                b.box(w - .005, yd - .14, zh, w + .012, yd - .11, zh + .16, 'trim', skip='l')
        if fender_mirrors:
            b.box(w - .2, yd - .03, zf - 1.0, w - .14, yd + .1, zf - .96, 'trim')
            b.box(w - .26, yd + .1, zf - 1.03, w - .08, yd + .2, zf - .95, 'trim')
        elif mirrors:
            b.box(w - .06, yd + .02, gzf - .42, w + .04, yd + .14, gzf - .34, sc(gzf - .4, 3), skip='l')
    plates(b, zf, zr)
    return w


def tall(b, L, W, H, hood, hy, ws, wins, r=.28, zw=None, body='body', lower='trim', zr=None, rr=.14, rf=.28, tw=.19, pf=.65, ly=(.56, .76),
         pillar=None, roofcol=None, mirrors=True, big_grille=False, seams=(), rearglass=True, do_wheels=True, tails=True):
    """Tall one-and-a-half-box body (kei wagon, van, minivan, JPN-Taxi shape): short hood of length `hood` at height hy,
    windscreen running back `ws` to the roof.  wins: side glass (z0, z1) ranges."""
    w = W / 2 - .03
    zf = L / 2
    zr = -L / 2 if zr is None else zr
    NF = 3 if b.hi else 2
    zwf, zwr = zw if zw else (zf - .62, -L / 2 + .62)
    top = roofcol or body
    pil = pillar or body
    lv = [(.20, w - .05, zf - .04, zr + .02, rf - .03, rr - .02), (.42, w, zf, zr, rf, rr), (ly[0], w, zf, zr, rf, rr), (ly[1], w, zf, zr, rf, rr),
          (hy - .07, w, zf - .02, zr, rf, rr), (hy, w - .01, zf - max(hood, .08), zr, rf, rr),
          (H - .2, w - .06, zf - hood - ws, zr + .06, rf, rr), (H - .05, w - .1, zf - hood - ws - .1, zr + .09, rf, rr), (H, w - .3, zf - hood - ws - .4, zr + .32, .2, .12)]
    w0, w1 = min(a for a, c in wins), max(c for a, c in wins)

    def col(k, sx, part, j, z):
        if k == 0:
            return lower
        if part == 'f':
            if k == 2:
                return 'grille' if j == 0 else 'head'
            if k in (1, 3) and j == 0 and (big_grille or k == 1):
                return 'grille'
            if k == 5:
                return 'glass' if j < NF - 1 else pil
        elif part == 'r':
            if k in (2, 3) and j == 1 and tails:
                return 'tail'
            if k == 5 and rearglass:
                return 'glass' if j == 0 else pil
        elif k == 5:
            if any(a < z < c for a, c in wins):
                return 'glass'
            return pil if w0 < z < w1 else body
        if k >= 6:
            return top
        return body
    zs = sorted(set(e for a in wins for e in a))
    plan_body(b, lv, zs, col, nf=3, nr=2, top=top, bottom='under', pf=pf)
    if do_wheels:
        wheels(b, w, (zwf, zwr), r, tw, n=14)
    for sx in b.mirx():
        if mirrors:
            b.box(w - .05, hy + .04, zf - hood - .22, w + .1, hy + .19, zf - hood - .14, body, skip='l')
        if b.hi:
            for z in seams:
                b.box(w - .004, .46, z - .008, w + .007, hy - .02, z + .008, 'trim', skip='l')
                b.box(w - .004, hy - .16, z - .22, w + .012, hy - .13, z - .08, 'trim', skip='l')
    plates(b, zf, zr)
    return w


def cabover(b, w, zf, zb, ys, sidewin, body='body', roof=None, rake=.26, rf=.25):
    """Cab-over truck cab from the cab back zb to the nose zf.  ys = (bottom, bumper top, lamp y0, lamp y1, glass y0, glass y1, roof edge, roof)."""
    y0, y1, l0, l1, g0, g1, r1, r2 = ys
    lv = [(y0, w - .05, zf - .05, zb, rf - .03, .05), (y1, w, zf, zb, rf, .05), (l0, w, zf, zb, rf, .05), (l1, w, zf, zb, rf, .05),
          (g0, w, zf - .02, zb, rf, .05), (g1, w - .04, zf - rake, zb, rf, .05), (r1, w - .1, zf - rake - .1, zb, rf - .03, .05), (r2, w - .3, zf - rake - .4, zb + .05, .15, .05)]
    NF = 3 if b.hi else 2

    def col(k, sx, part, j, z):
        if k == 0:
            return 'trim'
        if part == 'f':
            if k == 2:
                return 'grille' if j == 0 else 'head'
            if k == 3 and j == 0:
                return 'grille'
            if k == 4:
                return 'glass' if j < NF - 1 else body
        if k == 4 and part == 's' and any(a < z < c for a, c in sidewin):
            return 'glass'
        if k >= 5:
            return roof or body
        return body
    plan_body(b, lv, sorted(set(e for a in sidewin for e in a)), col, nf=3, nr=2, top=roof or body, bottom='under', pf=.6)


# ------------------------------------------------------------------ cars
def kei_car(b):
    """3.4 m tall-wagon kei car."""
    tall(b, 3.4, 1.48, 1.78, .42, 1.0, .46, [(.08, 1.7), (-.72, -.02), (-1.5, -.82)], r=.28, zw=(1.16, -1.22), pillar='trim', roofcol='roofw', seams=(.03, -.77))


def kei_van(b):
    tall(b, 3.4, 1.475, 1.89, .2, 1.04, .36, [(.36, 1.7), (-.55, .26), (-1.5, -.65)], r=.27, zw=(1.2, -1.2), ly=(.6, .78), seams=(.31, -.6), rf=.2)


def kei_truck(b):
    """3.4 m kei truck: cab-over cab, drop-side bed."""
    w = tall(b, 3.4, 1.475, 1.78, .18, 1.02, .34, [(.72, 1.7)], r=.27, zw=(1.22, -1.0), zr=.5, rr=.05, ly=(.58, .76), rf=.2, seams=(.68,), tails=False)
    b.box(-.5, .3, -1.6, .5, .6, .5, 'under')
    b.box(-.72, .6, -1.7, .72, .68, .46, 'bed', d='under')
    for sx in b.mirx():
        b.box(.69, .68, -1.7, .72, .96, .46, 'body', l='bed')
        b.box(.56, .5, -1.71, .68, .6, -1.67, 'tail')
        if b.hi:
            for z in (-1.0, -.3):
                b.box(.72, .66, z - .02, .735, .94, z + .02, 'trim', skip='l')
            b.box(.6, .96, .36, .66, 1.7, .42, 'trim')
    b.box(-.72, .68, -1.7, .72, .96, -1.67, 'body', f='bed')
    b.box(-.72, .68, .43, .72, .96, .46, 'body', b='bed')
    if b.hi:
        b.box(-.66, 1.64, .36, .66, 1.7, .42, 'trim')


def jpn_taxi(b):
    """Tall 'JPN Taxi' shape, deep indigo, lit roof lamp."""
    tall(b, 4.4, 1.695, 1.74, .98, 1.03, .58, [(.22, 2.2), (-.78, .12), (-1.62, -.88)], r=.31, zw=(1.38, -1.37), pillar='trim', big_grille=True, seams=(.17, -.83),
         ly=(.6, .78), tw=.2)
    b.bb(0, 1.74, .25, .30, .05, .2, 'trim', skip='d')
    b.bb(0, 1.79, .25, .26, .13, .14, 'sign', skip='d')
    if b.hi:
        for sx in b.mirx():
            b.box(.3, .6, 2.185, .78, .66, 2.21, 'chrome', skip='b')


def minivan(b):
    """4.9 m boxy people-mover, dark."""
    w = tall(b, 4.9, 1.85, 1.9, .82, 1.13, .78, [(.42, 2.45), (-.72, .32), (-2.02, -.82)], r=.34, zw=(1.52, -1.48), pillar='trim', big_grille=True, seams=(.37, -.77),
             ly=(.62, .86), tw=.22, rf=.3)
    if b.hi:
        b.box(-.62, .5, 2.44, .62, .56, 2.465, 'chrome', skip='b')
        b.box(-.62, .92, 2.42, .62, .98, 2.455, 'chrome', skip='b')
        b.box(-.7, .98, -2.462, .7, 1.04, -2.44, 'chrome', skip='f')


def sedan(b):
    car(b, 4.7, 1.76, .92, 1.44, (0.9, -1.5, 0.28, -1.02), nose=(.42, .36))


def taxi_classic(b):
    """Boxy sedan cab: yellow with an orange band, fender mirrors, roof lamp."""
    def sc(z, k):
        return 'orange' if k == 2 else 'body'
    car(b, 4.7, 1.7, .96, 1.5, (0.82, -1.42, 0.42, -1.12), nose=(.26, .24), hood=.07, pf=.6, sidecol=sc, fender_mirrors=True, r=.31)
    b.bb(0, 1.5, -.3, .40, .04, .2, 'trim', skip='d')
    b.bb(0, 1.54, -.3, .34, .13, .14, 'sign', skip='d')


def police(b):
    """Black-and-white patrol sedan with the red roof bar (lightbar_red / lightbar_blue lens materials, both red)."""
    def sc(z, k):
        return 'white' if (k == 3 and -1.28 < z < 1.1) else 'body'
    car(b, 4.9, 1.8, .93, 1.46, (0.95, -1.56, 0.32, -1.06), sidecol=sc, roofcol='white')
    # raised boomerang bar on a pedestal
    b.box(-.2, 1.46, -.34, .2, 1.56, -.1, 'trim', skip='d')
    b.box(-.62, 1.56, -.36, .62, 1.6, -.08, 'trim')
    b.box(-.6, 1.6, -.34, -.03, 1.72, -.1, 'LB_RED', skip='d')
    b.box(.03, 1.6, -.34, .6, 1.72, -.1, 'LB_BLUE', skip='d')
    b.box(-.03, 1.6, -.32, .03, 1.71, -.12, 'trim', skip='d')
    if b.hi:
        for sx in b.mirx():   # front red flashers in the grille
            b.box(.3, .5, 2.44, .42, .56, 2.47, 'tail', skip='b')


# ------------------------------------------------------------------ trucks and the bus
def delivery_truck(b):
    """6.2 m 2-tonne box truck: cream cab, green box with a cream band and a lighter roof (invented livery)."""
    w = .86
    cabover(b, w, 3.1, 1.42, (.36, .56, .68, .84, 1.26, 2.02, 2.2, 2.27), [(2.05, 3.1)])
    b.box(-.42, .45, -3.0, .42, .88, 1.45, 'under')
    W2 = 1.0
    ys = [.9, 1.02, 1.5, 1.8, 2.95] if b.hi else [.9, 2.95]

    def side(u, v):
        if not b.hi:
            return 'box'
        return 'box_d' if v < 1.02 else ('band' if 1.5 < v < 1.8 else 'box')
    for sx in b.mirx():
        b.grid((W2, 0, 0), (0, 0, 1), (0, 1, 0), [-3.1, 1.32], ys, side, flip=True)
    b.grid((-W2, 0, 1.32), (1, 0, 0), (0, 1, 0), [0, 2 * W2], [.9, 2.95], lambda u, v: 'box')
    b.grid((-W2, 0, -3.1), (1, 0, 0), (0, 1, 0), [0, .1, W2 - .01, W2 + .01, 2 * W2 - .1, 2 * W2] if b.hi else [0, 2 * W2], [.9, 1.02, 2.85, 2.95] if b.hi else [.9, 2.95],
           lambda u, v: ('door' if (.1 < u < 2 * W2 - .1 and 1.02 < v < 2.85 and abs(u - W2) > .01) else 'box_d') if b.hi else 'door', flip=True)
    b.quad((-W2, 2.95, 1.32), (W2, 2.95, 1.32), (W2, 2.95, -3.1), (-W2, 2.95, -3.1), 'boxtop')
    b.quad((-W2, .9, -3.1), (W2, .9, -3.1), (W2, .9, 1.32), (-W2, .9, 1.32), 'under')
    b.box(-.9, .42, -3.09, .9, .52, -3.02, 'trim')
    for sx in b.mirx():
        wheel(b, w + .03, 2.32, .36, .22)
        wheel(b, W2 - .04, -1.65, .36, .42)
        b.box(w - .02, 1.4, 2.72, w + .16, 1.78, 2.8, 'trim', skip='l')
        b.box(.62, .56, -3.12, .86, .68, -3.08, 'tail')
        if b.hi:
            arch(b, w, 2.32, .36)
            b.box(.45, .4, -.7, 1.0, .8, .5, 'trim')
            b.box(W2 - .03, .5, -2.4, W2, .9, -2.34, 'trim')
    plates(b, 3.1, -3.1, y=.4)


def bus(b):
    """10.5 m city bus: cream with green bands, lit windows and destination blank; doors on +X (left-hand traffic)."""
    L, w = 10.5, 1.215
    zf, zr = L / 2, -L / 2
    lv = [(.30, w - .05, zf - .05, zr + .04, .26, .16), (.52, w, zf, zr, .28, .18), (.74, w, zf, zr, .28, .18), (.88, w, zf, zr, .28, .18),
          (1.02, w, zf, zr, .28, .18), (1.22, w, zf - .01, zr, .28, .18), (2.24, w - .02, zf - .12, zr + .02, .28, .18),
          (2.62, w - .04, zf - .16, zr + .03, .28, .18), (2.94, w - .10, zf - .2, zr + .06, .28, .18), (3.02, w - .4, zf - .7, zr + .3, .2, .15)]
    NF = 4
    wins = [(4.6 - (i + 1) * 1.3 + .06, 4.6 - i * 1.3 - .06) for i in range(7)]
    doors = [(3.72, 4.19), (4.25, 4.72), (-.78, -.17), (-.11, .5)]
    zs = sorted(set([4.78, 3.66, -.84, .56, -4.62] + [e for a in wins for e in a] + [e for a in doors for e in a]))

    def col(k, sx, part, j, z):
        ind = sx > 0 and any(a < z < c for a, c in doors)
        indz = sx > 0 and (3.66 < z < 4.78 or -.84 < z < .56)
        inw = any(a < z < c for a, c in wins) if b.hi else (-4.4 < z < 4.5)
        if k == 0:
            return 'trim'
        if part == 's' and indz and 1 <= k <= 5:
            return ('lit' if k == 5 else 'door') if ind else 'trim'
        if k == 2:
            if part == 'f':
                return 'grille' if j == 0 else 'head'
            if part == 'r':
                return 'tail' if j >= 1 else 'cream'
            return 'cream'
        if k == 1:
            return 'green'
        if k == 3:
            return 'cream'
        if k == 4:
            return 'green' if part != 'f' else 'cream'
        if k == 5:
            if part == 'f':
                return 'glass' if j < NF - 1 else 'cream'
            if part == 'r':
                return 'lit' if j == 0 else 'cream'
            if z < -4.62:
                return 'cream'
            return 'lit' if inw else 'trim'
        if k == 6:
            if part == 'f':
                return 'sign' if j < NF - 1 else 'cream'
            return 'green_l' if b.hi and part == 's' else 'cream'
        return 'cream'
    plan_body(b, lv, zs, col, nf=NF, nr=2, top='roofw', bottom='under', pf=.5)
    for sx in b.mirx():
        for zc, tw in ((zf - 2.35, .28), (zr + 2.85, .5)):
            wheel(b, w + .025, zc, .48, tw, hubr=.5)
            if b.hi:
                arch(b, w, zc, .48)
        b.box(w - .02, 2.0, zf - .2, w + .22, 2.4, zf - .12, 'trim', skip='l')
    b.tb(0, 3.0, -1.2, 1.8, 3.4, .2, 1.6, 3.1, 'roofw', skip='d')
    if b.hi:
        b.box(-.55, 3.0, 3.0, .55, 3.08, 4.0, 'roofw', skip='d')
        b.box(w - .01, 2.3, -3.4, w + .01, 2.56, -2.3, 'sign', skip='l')     # side destination blank (kerb side)
    plates(b, zf, zr, y=.56)


def fire_engine(b):
    """Compact red pumper, 7 m: double cab, silver roll shutters, roof ladder, red beacons."""
    w = 1.04
    cabover(b, w, 3.5, 1.25, (.4, .62, .76, .94, 1.36, 2.1, 2.36, 2.44), [(2.5, 3.5), (1.4, 2.35)], roof='white')
    b.box(-1.08, .42, 3.45, 1.08, .66, 3.58, 'chrome')
    b.box(-.45, .5, -3.4, .45, .95, 1.3, 'under')
    W2 = 1.08
    cz = [-3.42, -3.34, -2.3, -2.22, -1.0, -.92, -.1, -.02, .6, .68, 1.25]

    def side(u, v):
        if v > 2.12:
            return 'body'
        if .68 < u:
            return 'steel' if .78 < v < 1.95 and u < 1.17 and u > .76 else 'body'   # pump panel
        if 1.0 < v < 1.06:
            return 'gold' if b.hi else 'body'
        door = (-3.34 < u < -2.3) or (-.92 < u < -.1) or (-.02 < u < .6 and v > 1.06) or (-2.22 < u < -1.0 and v > 1.5)
        return 'door' if (door and .66 < v < 2.04) else 'body'
    for sx in b.mirx():
        b.grid((W2, 0, 0), (0, 0, 1), (0, 1, 0), cz[:-1] + [.76, 1.17, 1.25], [.52, .66, .78, 1.0, 1.06, 1.5, 1.95, 2.04, 2.12, 2.3], side, flip=True)
        wheel(b, w + .03, 2.55, .42, .26)
        wheel(b, w + .03, -1.75, .42, .48)
        b.box(.86, 2.3, -3.3, W2, 2.4, 1.2, 'body', skip='d')
        b.box(w - .02, 1.5, 3.1, w + .18, 1.95, 3.2, 'trim', skip='l')
        b.box(.7, .72, -3.48, .98, .92, -3.42, 'tail')
        b.box(.8, 2.44, 2.5, .98, 2.58, 2.8, 'siren')
        if b.hi:
            arch(b, w, 2.55, .42)
            for z, y in ((.88, 1.1), (1.06, 1.1), (.88, 1.5), (1.06, 1.5)):
                b.cyl((W2, y, z), (W2 + .07, y, z), .06, n=6, col='chrome')
    b.grid((-W2, 0, -3.42), (1, 0, 0), (0, 1, 0), [0, .26, 2 * W2 - .26, 2 * W2], [.52, .76, 2.04, 2.3],
           lambda u, v: 'door' if (.26 < u < 2 * W2 - .26 and .76 < v < 2.04) else 'body', flip=True)
    b.grid((-W2, 0, 1.25), (1, 0, 0), (0, 1, 0), [0, 2 * W2], [2.1, 2.3], lambda u, v: 'body')
    b.quad((-W2, .52, -3.42), (W2, .52, -3.42), (W2, .52, 1.25), (-W2, .52, 1.25), 'under')
    b.quad((-.86, 2.3, 1.25), (.86, 2.3, 1.25), (.86, 2.3, -3.3), (-.86, 2.3, -3.3), 'hose')
    b.box(-W2, .46, -3.5, W2, .58, -3.42, 'chrome')
    # roof light bar, ladder on brackets, suction hoses
    b.box(-.72, 2.44, 2.9, .72, 2.5, 3.14, 'trim', skip='d')
    b.box(-.7, 2.5, 2.92, .7, 2.64, 3.12, 'siren', skip='d')
    if b.hi:
        for x in (-.3, .3):
            b.box(x - .03, 2.62, -3.2, x + .03, 2.68, 1.0, 'steel')
        for i in range(9):
            z = -3.1 + i * .5
            b.box(-.3, 2.63, z, .3, 2.67, z + .04, 'steel')
        for z in (-2.8, .6):
            b.box(-.34, 2.3, z, .34, 2.62, z + .06, 'trim')
        for sx in b.mirx():
            b.cyl((.62, 2.42, -3.0), (.62, 2.42, .2), .09, n=6, col='trim')
    else:
        b.box(-.33, 2.3, -3.2, .33, 2.68, 1.0, 'steel', skip='d')
    plates(b, 3.58, -3.5, y=.72)


MODELS = {
    'tokyo_kei_car': (kei_car, pal(body=(0xa9d4c4, .32, 0), roofw=(0xe9e8e2, .35, 0))),
    'tokyo_kei_van': (kei_van, pal(body=(0xe4e3dd, .4, 0))),
    'tokyo_kei_truck': (kei_truck, pal(body=(0xe6e5df, .42, 0), bed=(0xb9bbb8, .6, 0))),
    'tokyo_taxi': (jpn_taxi, pal(body=(0x1b2440, .28, 0), sign=(0xf2ecc8, .3, 0, 0xe8dc90))),
    'tokyo_taxi_classic': (taxi_classic, pal(body=(0xe3b41c, .36, 0), orange=(0xd9641c, .38, 0), sign=(0xf4f0d8, .3, 0, 0xd8e8a0))),
    'tokyo_sedan': (sedan, pal(body=(0xe9e8e3, .3, 0))),
    'tokyo_minivan': (minivan, pal(body=(0x383b46, .24, .3))),
    'tokyo_delivery_truck': (delivery_truck, pal(body=(0xe6e2d2, .4, 0), box=(0x2f8a58, .5, 0), box_d=(0x24573c, .55, 0), band=(0xe9e2c6, .5, 0), door=(0x3a9566, .5, 0),
                                                 boxtop=(0xc9cdc6, .6, 0))),
    'tokyo_bus': (bus, pal(cream=(0xe9e2c8, .42, 0), green=(0x2f7d4f, .42, 0), green_l=(0x8cc267, .42, 0), roofw=(0xdcdad0, .5, 0), door=(0x33434a, .15, 0),
                           lit=(0x7b8582, .15, 0, 0xefe4ba), sign=(0x4a3c22, .3, 0, 0xf0a830))),
    'tokyo_police': (police, pal(body=(0x1a1b1e, .3, 0), white=(0xe6e5df, .33, 0))),
    'tokyo_fire_engine': (fire_engine, pal(body=(0xb81f1c, .3, 0), white=(0xb81f1c, .3, 0), gold=(0xd4aa3a, .35, 0), door=(0xb4b8ba, .35, .4),
                                           hose=(0x6a6658, .9, 0), siren=(0xc2241c, .2, 0, 0xe02a18))),
}

if __name__ == '__main__':
    run(MODELS)
