# San Francisco tier C towers (design-towers). blender -b -P towers_build_c.py -- [ids...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2


def roofkit(b, x0, x1, y0, y1, z, h=3.5, mat='plant', n=2):
    """Roof plant: a louvred penthouse and a few units."""
    w, d = x1 - x0, y1 - y0
    b.box(x0 + w * 0.2, x1 - w * 0.2, y0 + d * 0.25, y1 - d * 0.25, z, z + h, mat)
    if b.hi:
        for k in range(n):
            cx = x0 + w * (0.12 + 0.76 * k / max(1, n - 1))
            b.cbox(cx, y0 + d * 0.14, w * 0.09, d * 0.1, z, z + h * 0.45, mat)
            b.cbox(cx, y1 - d * 0.14, w * 0.09, d * 0.1, z, z + h * 0.45, mat)


@model('park_tower', 'C', 184.0, face='northwest', stone=0xa9bcc8,
       desc='56 x 55 m: clear glass tower with white horizontal fins and three stacked double-height sky-deck notches stepping round its corners, on a five-storey podium that fills the wedge lot')
def park(b):
    T = b.facade(Tex('park_glass', cols=4, rows=8, bay=1.5, floor=4.2, wall=(.80, .81, .80), glass=(.36, .46, .54), wx=(.04, .96), wy=(.14, .99),
                     frame_px=0, blind=.1, lit=.02, rough=.26, grad=.16, glass_var=.06, shadow=.8, seed=61))
    b.colours(white=(.80, .81, .80, .45), roof=(.44, .45, .46), glass=(.22, .28, .33, .2), steel=(.6, .62, .64, .4), pier=(.7, .71, .71, .5), plant=(.55, .57, .58, .6), tree=(.30, .40, .27, .9))
    pod = [(-13, -27), (28, -27), (28, 27), (-28, 28), (-26, 12), (-23, -3)]
    zp = 22.0
    b.prism(pod, 7.0, zp, T, top='roof')
    lobby(b, pod, 7.0, edge=0, w=7.0, h=4.4, inset=1.0, spacing=6.0)
    X0, X1, Y0, Y1 = -9.4, 27.4, -26.4, 20.4
    full = rect2(X0, X1, Y0, Y1)
    nd, nh = 9.0, 8.4
    notch = {58.0: 0, 100.0: 1, 142.0: 2}
    z = zp
    zs = sorted(notch)
    lv = [zp] + [v for q in zs for v in (q, q + nh)] + [178.0]
    for i in range(len(lv) - 1):
        z0, z1 = lv[i], lv[i + 1]
        if z0 in notch:
            k = notch[z0]
            cx = [(X1, Y0), (X1, Y1), (X0, Y1)][k]
            sx, sy = (-1 if cx[0] == X1 else 1), (1 if cx[1] == Y0 else -1)
            cut = [(X0, Y0), (X1, Y0), (X1, Y1), (X0, Y1)]
            L = {0: [(X0, Y0), (X1 - nd, Y0), (X1 - nd, Y0 + nd), (X1, Y0 + nd), (X1, Y1), (X0, Y1)],
                 1: [(X0, Y0), (X1, Y0), (X1, Y1 - nd), (X1 - nd, Y1 - nd), (X1 - nd, Y1), (X0, Y1)],
                 2: [(X0, Y0), (X1, Y0), (X1, Y1), (X0 + nd, Y1), (X0 + nd, Y1 - nd), (X0, Y1 - nd)]}[k]
            b.ring(L, z0, z1, T)
            b.cap(full, z0, 'roof')
            b.cap(full, z1, 'white', down=True)
            tx, ty = cx[0] + sx * nd / 2, cx[1] + sy * nd / 2
            if b.hi:
                b.cyl(tx, ty, 2.0, z0 + 2.5, z0 + 6.0, 6, 'tree')
                b.cyl(tx, ty, 0.25, z0, z0 + 2.5, 4, 'steel', cap=False)
                b.cyl(cx[0] + sx * 0.5, cx[1] + sy * 0.5, 0.45, z0, z1, 6, 'white', cap=False)
        else:
            b.ring(full, z0, z1, T)
    b.cap(full, 178.0, 'roof')
    b.parapet(full, 178.0, 6.0, 0.4, 'white') if b.hi else b.ring(full, 178.0, 184.0, 'white')
    b.cbox((X0 + X1) / 2, (Y0 + Y1) / 2, 20, 26, 178.0, 182.0, 'plant')
    fz = zp + 4.2
    while fz < 177:
        if not any(q - 0.5 < fz < q + nh + 0.5 for q in zs):
            b.band(full, fz, 0.3, 0.6, 'white')
        fz += 4.2 * (2 if b.hi else 8)
    if b.hi:
        b.band(pod, zp - 0.4, 0.9, 0.4, 'white')
        b.band(pod, 7.0, 0.5, 0.5, 'white')
        b.fins(pod, 7.0, zp, 'white', spacing=6.0, w=0.3, dep=0.35, minlen=6)


@model('mission_555', 'C', 149.0, face='southeast', stone=0x9fc0b0,
       desc='45 x 47 m pale green glass slab, the side faces leaning out a little toward the top, tall glass-fin crown; low wing on the model left')
def mission555(b):
    T = b.facade(Tex('mission555_glass', cols=4, rows=8, bay=1.5, floor=4.1, wall=(.56, .68, .62), glass=(.40, .55, .50), wx=(.04, .96), wy=(.22, .98),
                     frame=(.66, .74, .70), blind=.1, lit=.02, rough=.26, grad=.15, seed=63))
    b.colours(white=(.78, .82, .80, .4), roof=(.44, .46, .45), glass=(.24, .33, .31, .2), steel=(.6, .64, .62, .4), pier=(.68, .72, .70, .5), plant=(.55, .58, .57, .6), fin=(.58, .72, .66, .25))
    zb, zr = 9.0, 138.0
    P0 = rect2(-12.5, 20.5, -23, 24)
    P1 = rect2(-14.0, 22.0, -23, 24)
    b.ring(P0, zb, zr, T, poly1=P1)
    b.cap(P1, zr, 'roof')
    lobby(b, P0, zb, edge=0, w=7.0, h=4.6, inset=1.0, spacing=5.5)
    b.prism(rect2(-22, -12.5, -10, 24), 0, 20.0, T, top='roof', skip={1})
    # crown: glass screens carried up past the roof
    P2 = rect2(-14.12, 22.12, -23, 24)
    b.ring(P1, zr, 149.0, T, poly1=P2, only={1, 3})
    b.ring(offset(P1, -0.3), zr, 149.0, 'fin', poly1=offset(P2, -0.3), only={1, 3}, inward=True)
    b.ring(P1, zr, 143.0, T, only={0, 2})
    roofkit(b, -12, 20, -20, 21, zr, 5.0)
    b.fins(P0, zb, 149.0, 'white', spacing=1.5, w=0.1, dep=0.3, poly1=P2, edges={1, 3}, ends=True, lo=6)
    if b.hi:
        b.fins(P0, zb, 143.0, 'white', spacing=3.0, w=0.22, dep=0.25, poly1=P1, edges={0, 2})
        for z in [zb + 8.2 * k for k in range(0, 16)]:
            b.band(lerp(P0, P1, (z - zb) / (zr - zb)), z, 0.35, 0.25, 'white', bottom=False)


@model('market_525', 'C', 161.0, face='southeast', stone=0x4e4b48,
       desc='58 x 49 m broad dark 1970s slab: charcoal precast piers (modelled) and bronze glass in a strict vertical grid, flat roof')
def market525(b):
    T = b.facade(Tex('market525_charcoal', cols=4, rows=8, bay=1.6, floor=3.9, wall=(.31, .30, .29), glass=(.24, .22, .20), wx=(.2, .8), wy=(.3, .98),
                     spandrel=(.24, .23, .22), frame_px=0, blind=.14, blindc=(.5, .46, .4), rough=.4, seed=65))
    b.colours(precast=(.31, .30, .29, .6), precast_d=(.24, .23, .23, .65), glass=(.2, .19, .18, .2), roof=(.32, .32, .31), steel=(.36, .35, .34, .4), pier=(.31, .30, .29, .6), plant=(.36, .36, .35, .6))
    P = rect(56.8, 47.8)
    zb, zr = 11.0, 156.0
    b.prism(P, zb, zr, T, top='roof')
    lobby(b, P, zb, edge=0, w=8.0, h=5.0, inset=1.8, spacing=6.4, pw=1.2)
    b.fins(P, zb, zr + 1.5, 'precast', spacing=1.6, w=0.5, dep=0.6, top=True, ends=True, lo=6)
    b.prism(offset(P, -4.0), zr, 161.0, 'precast_d', top='roof')
    if b.hi:
        b.band(P, zb - 0.3, 1.5, 0.6, 'precast')
        b.band(P, zr, 1.5, 0.6, 'precast_d', bottom=False)
        b.band(offset(P, -4.0), 158.5, 0.4, 0.2, 'precast', top=False, bottom=False)


@model('one_sansome', 'C', 168.0, face='east', stone=0xc9c5ba,
       desc='42 x 73 m: pale stone tower with square windows and rounded bay corners behind the 1910 banking hall kept as a glass-roofed conservatory on +Z')
def sansome(b):
    T = b.facade(Tex('sansome_stone', cols=4, rows=8, bay=1.7, floor=3.9, wall=(.75, .74, .70), glass=(.25, .30, .34), wx=(.2, .8), wy=(.28, .82),
                     frame=(.5, .5, .48), blind=.22, rough=.5, course=1, vjoint=1, seed=67))
    b.colours(stone=(.75, .74, .70, .5), stone_d=(.60, .59, .56, .6), marble=(.78, .76, .71, .5), glass=(.27, .34, .38, .18), roof=(.43, .43, .42), pier=(.75, .74, .70, .5), steel=(.5, .5, .5, .4), plant=(.55, .55, .53, .6))
    tw = rrect(31.4, 46.4, 4.0, b.seg(3, 2), cx=-4.0, cy=13.5)
    zb = 10.0
    for sc, z0, z1 in ((1.0, zb, 148.0), (0.86, 148.0, 158.0), (0.68, 158.0, 164.5)):
        q = scale(tw, sc, about=(-4.0, 13.5))
        b.prism(q, z0, z1, T, top='roof', smooth=True)
        if b.hi:
            b.band(q, z1 - 0.3, 1.0, 0.3, 'stone_d', bottom=False)
    b.prism(scale(tw, 0.4, about=(-4.0, 13.5)), 164.5, 168.0, 'stone_d', top='roof')
    lobby(b, offset(tw, 0.3), zb, edge=0, w=5.0, h=4.4, inset=1.0, spacing=5.0)
    # the banking hall: marble walls, columns, glass roof
    hall = rect2(-21, 21, -36.5, -10)
    b.ring(hall, 0, 17.0, 'marble')
    b.hip(-18, 18, -34, -12, 17.0, 3.5, 'glass', inset=9)
    b.cap(hall, 17.0, 'stone_d')
    b.fins(hall, 0, 15.0, 'stone_d', spacing=5.2, w=1.3, dep=0.5, ends=True, edges={0, 1, 3}, lo=2)
    if b.hi:
        b.band(hall, 15.0, 2.0, 0.6, 'marble')
        b.band(hall, 0, 1.4, 0.3, 'stone_d', bottom=False)
        for i, e in enumerate((0, 1, 3)):
            a, c = hall[e], hall[(e + 1) % 4]
            L = math.hypot(c[0] - a[0], c[1] - a[1])
            for k in range(round(L / 5.2)):
                s = -L / 2 + (k + 0.5) * L / round(L / 5.2)
                b.attach(a, c, s - 1.4, s + 1.4, 2.5, 12.5, 0.08, 'glass', top=False, bottom=False)
        b.fins(tw, zb, 148.0, 'stone', spacing=6.8, w=0.5, dep=0.25, minlen=8)
        b.portal(hall[0], hall[1], 0.0, 4.0, 6.0, 'stone_d', 'glass', dep=0.7)


@model('lumina', 'C', 122.0, face='northeast', stone=0x93b8b4,
       desc='38 x 38 m curving lozenge-plan condominium tower: pale blue-green glass, rounded ends, modelled white slab bands, set-back roof plant')
def lumina(b):
    T = b.facade(Tex('lumina_glass', cols=4, rows=8, bay=1.4, floor=3.1, wall=(.80, .81, .80), glass=(.33, .48, .48), wx=(0, 1), wy=(.17, 1.0),
                     frame_px=0, mv=1, mull=(.46, .58, .57), blind=.18, lit=.03, rough=.26, grad=.14, shadow=.8, seed=69))
    b.colours(white=(.80, .81, .80, .45), roof=(.44, .45, .45), glass=(.22, .32, .32, .2), steel=(.6, .62, .62, .4), pier=(.72, .73, .72, .5))
    P = site_poly('lumina', tol=0.5 if b.hi else 1.6)
    P = offset(P, -0.45)
    zb, zr = 6.5, 117.0
    b.ring(P, zb, zr, T, smooth=True, thr=48)
    b.cap(P, zr, 'roof')
    b.prism(scale(P, 0.5), zr, 122.0, 'steel', top='roof')
    b.ring(offset(P, -0.5), 0, zb, 'glass')
    b.band(P, zb - 0.4, 0.5, 0.45, 'white')
    b.band(P, zr - 0.3, 1.3, 0.45, 'white', bottom=False)
    if not b.hi:
        for z in (40.0, 80.0):
            b.band(P, z, 0.3, 0.45, 'white', bottom=False)
    if b.hi:
        for z in [zb + 9.3 * k for k in range(1, 12)]:
            b.band(P, z, 0.3, 0.45, 'white')
        b.fins(offset(P, -0.5), 0, zb, 'pier', n=1, w=0.6, dep=0.5, ends=True, minlen=2.5)


@model('shell_building', 'C', 115.0, face='south', stone=0x8a715a,
       desc='37 x 42 m Art Deco tower of sepia terra cotta: modelled piers, upper floors stepping back in three tiers to the shell-crown')
def shell(b):
    T = b.facade(Tex('shell_terra', cols=4, rows=8, bay=1.85, floor=3.9, wall=(.52, .43, .33), glass=(.21, .22, .22), wx=(.22, .78), wy=(.28, .84),
                     spandrel=(.42, .35, .27), frame=(.3, .26, .21), pier=(.24, (.56, .47, .36)), blind=.3, blindc=(.66, .6, .5), rough=.65, noise=.05, seed=71))
    b.colours(terra=(.56, .47, .36, .7), terra_d=(.43, .36, .28, .75), terra_l=(.64, .56, .44, .65), roof=(.38, .36, .33), glass=(.2, .21, .21, .25), pier=(.56, .47, .36, .7), bronze=(.3, .25, .18, .45))
    P = rect(36.2, 41.2)
    tiers = [(1.0, 0.0, 76.0), (0.84, 76.0, 90.0), (0.66, 90.0, 101.0), (0.50, 101.0, 108.5)]
    for sc, z0, z1 in tiers:
        q = scale(P, sc)
        b.prism(q, z0, z1, T, top='roof')
        b.fins(q, max(z0, 8.5), z1 + 1.8, 'terra', spacing=3.7, w=0.75, dep=0.4, ends=True, top=True, minlen=5, lo=5)
        if b.hi:
            b.band(q, z1 - 0.3, 0.9, 0.25, 'terra_l', bottom=False)
    q = scale(P, 0.36)
    b.prism(q, 108.5, 112.5, 'terra_l', top='roof')
    b.pyramid(scale(P, 0.3), 112.5, (0, 0, 115.0), 'terra_d')
    if b.hi:
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.cbox(sx * 18.1 * 0.5, sy * 20.6 * 0.5, 1.6, 1.6, 108.5, 111.5, 'terra_l')
        b.band(P, 8.0, 0.7, 0.4, 'terra_l')
        b.fins(P, 0, 8.0, 'terra', spacing=3.7, w=1.2, dep=0.4, ends=True)
        b.portal(P[0], P[1], 0.0, 4.4, 6.4, 'bronze', 'glass', dep=0.4, t=0.6)


@model('hobart_building', 'C', 87.0, face='south', stone=0xcfc7b2,
       desc='23 x 49 m irregular lot: narrow cream terra cotta tower, sculpted cornices, the oval-ended top storeys and hipped green-copper cap')
def hobart(b):
    T = b.facade(Tex('hobart_terra', cols=4, rows=8, bay=1.8, floor=3.7, wall=(.76, .73, .65), glass=(.22, .24, .25), wx=(.22, .78), wy=(.26, .82),
                     frame=(.5, .48, .42), sill=(.8, .77, .69), blind=.3, rough=.6, course=2, noise=.035, seed=73))
    b.colours(terra=(.76, .73, .65, .6), terra_d=(.62, .59, .52, .65), terra_l=(.81, .78, .70, .6), roof=(.42, .41, .38), copper=(.40, .54, .48, .55), glass=(.2, .22, .23, .25), pier=(.76, .73, .65, .6), bronze=(.3, .25, .18, .45))
    P = ccw([(11, 24), (11, -8), (-12, -25), (-12, -5), (3, 6), (3, 10), (-4, 10), (-4, 24)])
    b.prism(P, 0, 58.0, T, top='roof')
    top = [(-11.4, -24.0), (10.4, -8.0), (10.4, 9.0), (2.0, 9.0), (2.0, 5.0), (-11.4, -4.6)]
    top = ccw(top)
    cx, cy = -0.6, -9.6
    n = b.seg(5, 3)
    a0 = math.degrees(math.atan2(16, 22))
    L, R = 7.4, 5.4
    oval = [(-L + R * math.cos(math.radians(a)), R * math.sin(math.radians(a))) for a in [90 + 180 * i / n for i in range(n + 1)]] + \
           [(L + R * math.cos(math.radians(a)), R * math.sin(math.radians(a))) for a in [-90 + 180 * i / n for i in range(n + 1)]]
    # stadium turned along the lot's diagonal front
    ov = move(rot(oval, a0 + 0.0), cx, cy)
    b.prism(ov, 58.0, 74.0, T, top='roof', smooth=True)
    b.ring(ov, 74.0, 76.0, 'terra_l', poly1=offset(ov, 0.5))
    b.cap(offset(ov, 0.5), 76.0, 'terra_l')
    ridge = [(cx + (p[0] - cx) * 0.25, cy + (p[1] - cy) * 0.25) for p in ov]
    ov2 = offset(ov, 0.3)
    b.ring(ov2, 76.0, 84.0, 'copper', poly1=ridge, smooth=True)
    b.cap(ridge, 84.0, 'copper')
    b.beam((cx, cy, 84.0), (cx, cy, 87.0), 0.3, 'copper', caps=True)
    b.band(P, 56.6, 1.4, 0.5, 'terra_l')
    if b.hi:
        b.band(P, 8.2, 0.7, 0.35, 'terra_l')
        b.band(P, 46.0, 0.6, 0.3, 'terra_l', top=False, bottom=False)
        b.fins(P, 0, 8.2, 'terra', spacing=3.6, w=1.0, dep=0.3, ends=True, minlen=5)
        b.fins(P, 8.9, 56.6, 'terra', spacing=3.6, w=0.55, dep=0.25, ends=True, minlen=5)
        b.band(P, 22.0, 0.5, 0.25, 'terra_l', top=False, bottom=False)
        b.fins(ov, 58.0, 74.0, 'terra_l', spacing=3.2, w=0.45, dep=0.3, minlen=1.5)
        b.band(ov, 66.0, 0.5, 0.3, 'terra_l', top=False, bottom=False)
        b.fins(offset(ov, 0.0), 74.6, 76.0, 'terra_d', spacing=1.5, w=0.4, dep=0.5, minlen=1.0)
        b.portal(P[2], P[3], 0.0, 3.4, 5.0, 'bronze', 'glass', dep=0.4)


@model('intercontinental_sf', 'C', 104.0, face='northwest', stone=0x9cc4cc,
       desc='83 x 41 m: flat slab of translucent pale turquoise glass along the +Z street on a six-storey podium with a saw-tooth rear wall')
def intercontinental(b):
    T = b.facade(Tex('intercontinental_glass', cols=4, rows=8, bay=1.5, floor=3.3, wall=(.50, .66, .70), glass=(.42, .60, .66), wx=(.03, .97), wy=(.2, .98),
                     frame=(.62, .74, .77), blind=.25, blindc=(.7, .76, .76), lit=.02, rough=.3, grad=.12, glass_var=.07, seed=75))
    b.colours(white=(.78, .82, .83, .4), roof=(.44, .46, .47), glass=(.25, .34, .38, .2), steel=(.6, .64, .66, .4), pier=(.68, .70, .70, .5), plant=(.56, .6, .62, .6), conc=(.68, .68, .66, .65))
    pod = ccw([(41, 21), (42, -9), (32, -9), (32, -20), (-41, -20), (-42, 19), (-18, 20), (-18, 21), (7, 21)])
    zp = 22.0
    b.prism(pod, 6.0, zp, T, top='roof')
    lobby(b, pod, 6.0, edge=[i for i, p in enumerate(pod) if p == (-41, -20)][0], w=8.0, h=4.0, inset=1.0, spacing=6.0)
    slab = rect2(-37, 20, -19.4, 1.6)
    b.prism(slab, zp, 100.0, T, top='roof')
    roofkit(b, -34, 17, -18, 0, 100.0, 4.0)
    if not b.hi:
        b.fins(slab, zp, 100.6, 'white', spacing=3.0, w=0.2, dep=0.25, ends=True, lo=4)
    if b.hi:
        b.fins(slab, zp, 100.6, 'white', spacing=3.0, w=0.2, dep=0.25, ends=True, top=True)
        for z in [zp + 13.2 * k for k in range(1, 6)]:
            b.band(slab, z, 0.3, 0.2, 'white', top=False, bottom=False)
        b.fins(pod, 6.0, zp, 'white', spacing=6.0, w=0.25, dep=0.25, minlen=8)
        b.band(slab, 99.4, 1.2, 0.2, 'white', bottom=False)
        b.band(pod, zp - 0.5, 0.9, 0.3, 'white')
        for k in range(11):
            x = -40 + 2.0 * k
            b.poly([(x, 19.6, 6.0), (x + 1, 20.6, 6.0), (x + 1, 20.6, zp - 0.5), (x, 19.6, zp - 0.5)][::-1], 'conc')
            b.poly([(x + 1, 20.6, 6.0), (x + 2, 19.6, 6.0), (x + 2, 19.6, zp - 0.5), (x + 1, 20.6, zp - 0.5)][::-1], 'conc')


@model('four_seasons_757_market', 'C', 121.0, face='southeast', stone=0xa9a9a4,
       desc='61 x 46 m: calm grey stone-and-glass tower with rounded glass corner bays, set back behind the lower shop block on +Z')
def fourseasons(b):
    T = b.facade(Tex('fourseasons_stone', cols=4, rows=8, bay=1.7, floor=3.5, wall=(.66, .66, .63), glass=(.27, .33, .38), wx=(.14, .86), wy=(.26, .86),
                     frame=(.45, .46, .46), blind=.25, rough=.45, course=1, seed=77))
    b.colours(stone=(.66, .66, .63, .5), stone_d=(.53, .53, .51, .6), glass=(.28, .36, .42, .18), roof=(.43, .43, .42), pier=(.66, .66, .63, .5), steel=(.5, .5, .5, .4), plant=(.52, .52, .5, .6), white=(.76, .77, .76, .4))
    low = ccw([(7, -5), (-30, -1), (-31, 19), (-19, 23), (28, 23), (30, -14), (22, -14), (22, -22), (10, -23)])
    b.prism(low, 6.0, 38.0, T, top='roof')
    lobby(b, low, 6.0, edge=[i for i, p in enumerate(low) if p == (10, -23)][0], w=5.0, h=4.0, inset=0.8, spacing=5.0)
    tw = rect2(-2, 27.2, -11.5, 20.4)
    b.prism(tw, 38.0, 114.0, T, top='roof')
    r = 3.9
    for (cx, cy) in ((-0.5, -10.0), (25.7, -10.0), (25.7, 18.9), (-0.5, 18.9)):   # rounded glass corner bays
        b.lathe([(r, 38.0), (r, 112.0)], b.seg(10, 6), 'glass', cx, cy)
        if b.hi:
            for z in [38.0 + 7.0 * k for k in range(1, 11)]:
                b.lathe([(r + 0.12, z), (r + 0.12, z + 0.4)], 10, 'white', cx, cy, cap=False)
    b.prism(offset(tw, -3.0), 114.0, 121.0, 'stone_d', top='roof')
    if not b.hi:
        b.fins(tw, 38.0, 114.0, 'stone', spacing=6.8, w=0.5, dep=0.25, minlen=8, lo=1)
        b.band(tw, 113.2, 1.0, 0.3, 'stone_d', bottom=False)
    if b.hi:
        b.band(tw, 113.2, 1.0, 0.3, 'stone_d', bottom=False)
        b.band(low, 37.2, 1.0, 0.3, 'stone_d', bottom=False)
        b.fins(tw, 38.0, 114.0, 'stone', spacing=6.8, w=0.5, dep=0.25, minlen=8)
        b.band(offset(tw, -3.0), 117.5, 0.4, 0.2, 'stone', top=False, bottom=False)


@model('st_regis_sf', 'C', 148.0, face='northwest', stone=0xc4c0b4,
       desc='24 x 33 m slender tower of pale precast and glass, grid of square windows, fully glazed street corner, set-back top')
def stregis(b):
    T = b.facade(Tex('stregis_precast', cols=4, rows=8, bay=1.6, floor=3.5, wall=(.74, .72, .67), glass=(.26, .32, .37), wx=(.16, .84), wy=(.24, .86),
                     frame=(.48, .48, .47), blind=.25, rough=.55, course=1, vjoint=1, seed=79))
    b.colours(precast=(.74, .72, .67, .6), precast_d=(.6, .58, .55, .65), glass=(.29, .37, .43, .18), roof=(.43, .43, .42), pier=(.74, .72, .67, .6), steel=(.5, .5, .5, .4), white=(.78, .78, .76, .4), brick=(.52, .36, .28, .8))
    P = rect(23.6, 32.6)
    zb, zr = 8.0, 136.0
    b.prism(P, zb, zr, T, top='roof')
    g = 6.5   # glazed corner, front right
    b.box(11.8 - g, 12.05, -16.55, -16.3 + g, 24.0, zr, 'glass')
    b.prism(offset(P, -2.0), zr, 144.0, T, top='roof')
    b.prism(offset(P, -5.0), 144.0, 148.0, 'precast_d', top='roof')
    lobby(b, offset(P, 0.2), zb, edge=0, w=5.0, h=4.2, inset=0.8, spacing=4.6)
    if not b.hi:
        b.fins(P, zb, zr + 0.8, 'precast', spacing=3.2, w=0.5, dep=0.2, ends=True, lo=3)
    if b.hi:
        for z in [24.0 + 7.0 * k for k in range(0, 17)]:
            b.band(rect2(11.8 - g, 12.05, -16.55, -16.3 + g), z, 0.35, 0.12, 'white', edges={0, 1}, bottom=False)
        b.fins(P, zb, zr + 0.8, 'precast', spacing=3.2, w=0.5, dep=0.2, ends=True, top=True)
        for z in [zb + 14.0 * k for k in range(1, 9)]:
            b.band(P, z, 0.4, 0.15, 'precast_d', top=False, bottom=False)
        b.fins(offset(P, -2.0), zr, 144.0, 'precast', spacing=3.2, w=0.5, dep=0.2, ends=True)
        b.band(P, zr - 0.2, 1.0, 0.2, 'precast_d', bottom=False)
        b.band(P, 23.0, 0.8, 0.2, 'precast_d')
        b.band(offset(P, -2.0), 143.4, 0.8, 0.2, 'precast_d', bottom=False)


@model('federal_building_sf', 'C', 71.0, face='southeast', stone=0xa8adb0,
       desc='114 x 28 m: very thin 18-storey slab, the +Z face draped in a folded perforated-steel scrim that rides over the roof and stops in mid-air, green glass fins behind, three-storey sky-garden void, low annex')
def federal(b):
    T = b.facade(Tex('federal_glass', cols=4, rows=8, bay=1.6, floor=3.7, wall=(.60, .62, .62), glass=(.30, .40, .40), wx=(.06, .94), wy=(.22, .96),
                     frame=(.68, .70, .70), blind=.2, rough=.32, grad=.12, seed=81))
    b.colours(scrim=(.64, .66, .68, .42, .25), scrim_d=(.52, .54, .56, .45, .25), conc=(.66, .66, .64, .7), glass=(.27, .37, .37, .2), fin=(.42, .58, .52, .25), roof=(.43, .44, .44), pier=(.66, .66, .64, .7), steel=(.5, .52, .53, .4), tree=(.3, .4, .27, .9), plant=(.55, .56, .57, .6))
    x0, x1, y0, y1 = -52.0, 57.0, -8.0, 12.0
    zr = 66.0
    vx0, vx1, vz0, vz1 = 8.0, 34.0, 38.0, 49.0
    # slab round the void
    b.prism(rect2(x0, x1, y0, y1), 9.0, vz0, T, top='conc')
    b.prism(rect2(x0, vx0, y0, y1), vz0, vz1, T, top=None)
    b.prism(rect2(vx1, x1, y0, y1), vz0, vz1, T, top=None)
    b.prism(rect2(x0, x1, y0, y1), vz1, zr, T, top='roof', bottom='conc')
    lobby(b, rect2(x0, x1, y0, y1), 9.0, edge=0, w=8.0, h=4.6, inset=1.2, spacing=7.0)
    b.prism(rect2(-57, -41, -13.8, 6), 0, 14.0, 'conc', top='roof')
    # scrim: folded sheet 1.8 m in front of the +Z face, over the roof, stopping short
    n = b.seg(18, 6)
    ys = -10.6
    for k in range(n):
        xa, xb = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
        fa, fb = (0.0 if k % 2 == 0 else -0.9), (0.0 if (k + 1) % 2 == 0 else -0.9)
        if vx0 - 3 < (xa + xb) / 2 < vx1 + 3:
            segs = [(11.0, vz0 - 1.0), (vz1 + 1.0, 67.5)]
        else:
            segs = [(11.0, 67.5)]
        col = 'scrim' if k % 2 == 0 else 'scrim_d'
        for za, zb_ in segs:
            b.poly([(xa, ys + fa, za), (xb, ys + fb, za), (xb, ys + fb, zb_), (xa, ys + fa, zb_)], col)
        b.poly([(xa, ys + fa, 67.5), (xb, ys + fb, 67.5), (xb, 2.0 + fb, 71.0 - 0.3 * (k % 3)), (xa, 2.0 + fa, 71.0 - 0.3 * ((k + 2) % 3))], col)
    b.poly([(x0, ys, 70.7), (x0, 2.0, 71.0), (x0 + 0.01, 2.0, 71.0)], 'scrim')
    if b.hi:
        for k in range(0, n + 1, 2):
            xa = x0 + (x1 - x0) * k / n
            b.beam((xa, ys + 0.2, 20.0), (xa, y0, 20.0), 0.25, 'steel')
            b.beam((xa, ys + 0.2, 60.0), (xa, y0, 60.0), 0.25, 'steel')
            b.beam((xa, 1.8, 70.6), (xa, 1.8, zr), 0.25, 'steel')
        b.fins(rect2(x0, x1, y0, y1), 9.0, zr, 'fin', spacing=3.2, w=0.12, dep=0.9, edges={2})
        for x in (14.0, 21.0, 28.0):
            b.cyl(x, 2.0, 1.6, vz0 + 3.0, vz0 + 6.5, 6, 'tree')
            b.cyl(x, 2.0, 0.2, vz0, vz0 + 3.0, 4, 'steel', cap=False)
        b.band(rect2(-57, -41, -13.8, 6), 13.2, 0.8, 0.2, 'steel', bottom=False)
    roofkit(b, x0 + 10, x1 - 10, 4, 11, zr, 2.5)
    b.box(54.0, 57.0, 12.0, 14.0, 0, 30.0, 'conc')


@model('burton_federal_building', 'C', 95.0, face='south', stone=0xc2beb4,
       desc='123 x 47 m: broad 21-storey International Style slab, uniform modelled grid of pale precast over dark glass, on a low plaza base')
def burton(b):
    T = b.facade(Tex('burton_precast', cols=4, rows=8, bay=1.55, floor=4.1, wall=(.74, .72, .68), glass=(.21, .24, .27), wx=(.18, .82), wy=(.3, .9),
                     frame=(.42, .42, .42), blind=.25, rough=.6, seed=83))
    b.colours(precast=(.74, .72, .68, .6), precast_d=(.6, .59, .56, .65), glass=(.2, .23, .26, .2), roof=(.43, .43, .42), pier=(.74, .72, .68, .6), steel=(.5, .5, .5, .4), plant=(.56, .56, .54, .6))
    base = rect(122.7, 46.7)
    b.prism(base, 0, 7.0, 'precast_d', top='roof')
    slab = rect(120.0, 27.0)
    zb, zr = 14.0, 90.0
    b.prism(slab, zb, zr, T, top='roof')
    b.ring(offset(slab, -1.5), 7.0, zb, 'glass')
    b.fins(offset(slab, -1.5), 7.0, zb, 'precast', spacing=6.2, w=1.0, dep=1.5, ends=True, lo=2)
    b.fins(slab, zb, zr + 1.0, 'precast', spacing=3.1, w=0.4, dep=0.45, ends=True, top=True, lo=4)
    b.prism(rect(96, 16), zr, 95.0, 'precast_d', top='roof')
    if b.hi:
        for z in [zb + 4.1 * 3 * k for k in range(0, 7)]:
            b.band(slab, z - 0.4, 0.6, 0.45, 'precast', top=False, bottom=False)
        b.band(slab, zr, 1.0, 0.45, 'precast', bottom=False)
        b.band(base, 6.2, 0.8, 0.12, 'precast')
        b.portal(offset(base, -0.5)[0], offset(base, -0.5)[1], 0.0, 9.0, 4.6, 'precast', 'glass', dep=0.6)
        b.fins(offset(base, -0.5), 0, 6.2, 'precast', spacing=12.0, w=1.2, dep=0.6, ends=True)


@model('fox_plaza', 'C', 108.0, face='north', stone=0xbcb09c,
       desc='24 x 78 m plain 29-storey slab, beige precast: ribbon-window office floors below, apartment floors with modelled balconies above, stair towers on both ends')
def foxplaza(b):
    T = b.facade(Tex('foxplaza_precast', cols=4, rows=8, bay=1.8, floor=3.6, wall=(.72, .67, .58), glass=(.23, .26, .28), wx=(.04, .96), wy=(.34, .84),
                     frame=(.46, .44, .4), blind=.4, rough=.65, noise=.03, seed=85))
    b.colours(precast=(.72, .67, .58, .65), precast_d=(.58, .54, .47, .7), glass=(.21, .24, .26, .22), roof=(.42, .41, .39), pier=(.72, .67, .58, .65), steel=(.5, .5, .48, .4), plant=(.55, .53, .49, .6), rail=(.36, .36, .35, .5))
    P = rect(22.6, 69.0)
    zb, zm, zr = 8.0, 51.2, 104.0
    b.prism(P, zb, zr, T, top='roof')
    for sy in (-1, 1):
        b.box(-4.6, 4.6, sy * 39.0 if sy < 0 else 34.5, -34.5 if sy < 0 else 39.0, 0, zr + 2.0, 'precast')
    lobby(b, offset(P, 0.3), zb, edge=1, w=6.0, h=4.2, inset=1.0, spacing=6.2)
    roofkit(b, -9, 9, -26, 26, zr, 4.0, n=3)
    if b.hi:
        z = zm
        while z < zr - 1:
            b.band(P, z, 1.1, 0.7, 'precast', edges={1, 3})
            z += 3.6
        b.fins(P, zm, zr, 'precast_d', spacing=3.6, w=0.25, dep=0.7, edges={1, 3}, ends=True)
        b.band(P, zm - 1.2, 1.0, 0.35, 'precast_d')
        b.band(P, zb - 0.3, 0.9, 0.35, 'precast_d')
        b.band(P, zr - 0.2, 1.0, 0.3, 'precast_d', bottom=False)
        b.fins(P, zb, zm - 1.2, 'precast', spacing=7.2, w=0.5, dep=0.3, ends=True)
    else:
        for z in (zm, zm + 18, zm + 36):
            b.band(P, z, 1.1, 0.7, 'precast', edges={1, 3})
        b.fins(P, zb, zm - 1.2, 'precast', spacing=7.2, w=0.5, dep=0.3, ends=True, lo=2)


if __name__ == '__main__':
    run()
