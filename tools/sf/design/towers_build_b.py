# San Francisco tier B towers (design-towers). blender -b -P towers_build_b.py -- [ids...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2


@model('millennium_tower', 'B', 197.0, face='northwest', stone=0x8fa3b5,
       desc='33 x 48 m soft-cornered blue-grey glass slab with shallow side bays, faint spandrel bands, tapering glass screen crown')
def millennium(b):
    T = b.facade(Tex('millennium_glass', cols=4, rows=8, bay=1.5, floor=3.4, wall=(.50, .57, .63), glass=(.33, .42, .52), wx=(.05, .95), wy=(.25, .97),
                     frame=(.60, .65, .69), blind=.15, lit=.03, rough=.27, grad=.14, seed=31))
    b.colours(white=(.78, .80, .81, .4), roof=(.43, .45, .46), glass=(.22, .28, .34, .2), steel=(.58, .6, .62, .4), pier=(.66, .68, .69, .5), inner=(.5, .55, .6, .5))
    seg = b.seg(3, 2)
    P = rrect(27.4, 47.4, 4.0, seg, cx=0.0)
    zb, zr = 9.0, 189.0
    b.ring(P, zb, zr, T, smooth=True)
    rb, lb = rect2(13.2, 16.7, -14, 23.7), rect2(-15.7, -13.2, -12, 8)
    b.ring(rb, zb, zr, T, only={0, 1, 2})
    b.cap(rb, zr, 'roof')
    b.ring(lb, zb, 181.0, T, only={0, 2, 3})
    b.cap(lb, 181.0, 'roof')
    P1 = scale(P, 0.94)
    b.ring(P, zr, 197.0, T, poly1=P1, smooth=True)
    b.ring(offset(P, -0.4), zr, 197.0, 'inner', poly1=offset(P1, -0.4), inward=True)
    b.cap(P, zr + 0.5, 'roof')
    b.cbox(0, 2, 14, 24, zr, 194.0, 'steel')
    lobby(b, offset(P, 0.3), zb, edge=0, w=7.0, h=4.6, spacing=5.5, inset=1.0)
    if not b.hi:
        for z in (zb, 60.0, 120.0, 180.0):
            b.band(P, z, 0.4, 0.3, 'white', bottom=False)
    b.ring(offset(rb, 0), 0, zb, 'pier', only={0, 1, 2})
    b.ring(offset(lb, 0), 0, zb, 'pier', only={0, 2, 3})
    if b.hi:
        b.fins(P, zb, 189.0, 'white', spacing=3.4, w=0.25, dep=0.3, minlen=8)
        for bay_, zt in ((rb, zr), (lb, 181.0)):
            b.fins(bay_, zb, zt, 'white', n=1, w=0.3, dep=0.3, ends=True, edges={0, 2})
        for z in [zb + 9.0 * k for k in range(0, 21)]:
            b.band(P, z, 0.4, 0.3, 'white', bottom=False)
            b.band(rb, z, 0.4, 0.3, 'white', bottom=False, edges={0, 1, 2})


@model('montgomery_44', 'B', 172.0, face='east', stone=0xc8c8c4,
       desc='82 x 57 m: the 62 x 24 m slab of white vertical mullions over dark glass along the back of the lot on a recessed glass lobby, eight-storey wing to the street on +Z')
def montgomery44(b):
    T = b.facade(Tex('montgomery44_ribs', cols=4, rows=8, bay=1.5, floor=3.9, wall=(.78, .78, .76), glass=(.20, .23, .26), wx=(.2, .8), wy=(.32, .98),
                     spandrel=(.30, .31, .33), frame_px=0, blind=.2, rough=.4, seed=33))
    b.colours(white=(.78, .78, .76, .45), roof=(.42, .42, .42), glass=(.19, .22, .25, .2), steel=(.55, .56, .57, .4), pier=(.7, .7, .68, .5), louvre=(.6, .6, .59, .6))
    tower = [(-40.6, 7.4), (-8, 7.4), (-8, 2.4), (20.6, 2.4), (20.6, 27.6), (-40.6, 27.6)]
    annex = rect2(20.6, 40.6, -27.6, 27.6)
    zb, zr = 9.0, 165.0
    b.prism(tower, zb, zr, T, top='roof')
    b.prism(offset(tower, -2.0), zr, 172.0, 'louvre', top='roof')
    b.prism(annex, zb, 30.0, T, top='roof', skip={3})
    b.ring(annex, 26.0, 30.0, T, only={3})
    lobby(b, tower, zb, edge=1, w=7.0, h=4.5, inset=1.6, spacing=6.2)
    b.fins(tower, zb, zr + 1.0, 'white', spacing=1.5, w=0.3, dep=0.4, top=True, lo=5)
    b.fins(annex, zb, 30.5, 'white', spacing=1.5, w=0.3, dep=0.4, edges={0, 1, 2}, top=True, lo=5)
    if b.hi:
        pass
        b.band(tower, zr, 1.0, 0.4, 'white')
        b.band(tower, zb - 0.3, 0.9, 0.4, 'white')
        for z in [zb + 11.7 * k for k in range(1, 13)]:
            b.band(tower, z, 0.4, 0.3, 'white', top=False, bottom=False)
        b.cbox(-10, 15, 30, 9, 172.0 - 3.0, 172.0, 'steel')
        b.cbox(31, 0, 9, 20, 30.0, 33.0, 'louvre')
        Ai = offset(annex, -1.0)
        b.ring(Ai, 0, zb, 'glass', skip={3})
        b.fins(Ai, 0, zb, 'pier', spacing=5.0, w=0.8, dep=1.0, ends=True, edges={0, 1, 2})
        b.band(annex, zb - 0.3, 0.9, 0.4, 'white', edges={0, 1, 2})
        b.portal(Ai[0], Ai[1], 0.0, 6.0, 4.4, 'steel', 'glass', dep=0.9, canopy=1.2)
        b.band(offset(tower, -2.0), 167.0, 0.4, 0.2, 'white', top=False, bottom=False)
        b.band(offset(tower, -2.0), 169.5, 0.4, 0.2, 'white', top=False, bottom=False)


@model('one_market_spear_tower', 'B', 172.0, face='northeast', stone=0x5e4f45,
       desc='52 x 35 m dark bronze-brown slab, notched corners, deep modelled precast fins on every bay, flat top; tower footprint only (the brick 1916 block is the layout\'s)')
def spear(b):
    T = b.facade(Tex('spear_bronze', cols=4, rows=8, bay=1.45, floor=4.0, wall=(.39, .33, .29), glass=(.22, .21, .20), wx=(.2, .8), wy=(.3, .98),
                     spandrel=(.28, .25, .23), frame_px=0, blind=.15, blindc=(.5, .45, .4), rough=.4, seed=35))
    b.colours(precast=(.39, .33, .29, .6), precast_d=(.29, .25, .22, .65), glass=(.19, .19, .19, .2), roof=(.34, .33, .32), steel=(.35, .32, .3, .4), pier=(.39, .33, .29, .6))
    X, Y, c = 25.2, 16.7, 3.2
    P = [(-X + c, -Y), (X - c, -Y), (X - c, -Y + c), (X, -Y + c), (X, Y - c), (X - c, Y - c), (X - c, Y), (-X + c, Y), (-X + c, Y - c), (-X, Y - c), (-X, -Y + c), (-X + c, -Y + c)]
    zb, zr = 12.0, 167.0
    b.prism(P, zb, zr, T, top='roof')
    b.prism(offset(P, -3.0), zr, 172.0, 'precast_d', top='roof')
    lobby(b, P, zb, edge=0, w=7.0, h=5.0, inset=1.6, spacing=5.8, pw=1.1)
    b.fins(P, zb, zr + 1.2, 'precast', spacing=1.45, w=0.34, dep=0.8, top=True, ends=True, minlen=2, lo=6)
    if b.hi:
        b.band(P, zb - 0.2, 1.4, 0.8, 'precast')
        b.band(P, zr, 1.2, 0.8, 'precast_d', bottom=False)
        for z in [zb + 6.0 * k for k in range(1, 26)]:
            b.band(P, z, 0.5, 0.3, 'precast_d', top=False, bottom=False)
        b.band(offset(P, -3.0), 169.5, 0.4, 0.2, 'precast', top=False, bottom=False)


@model('fremont_50', 'B', 183.0, face='northwest', stone=0xb8b0a8,
       desc='38 x 52 m pale grey-pink granite tower, notched corners, punched square windows, top stepping back in four tiers to a small square crown')
def fremont50(b):
    T = b.facade(Tex('fremont50_granite', cols=4, rows=8, bay=1.75, floor=3.9, wall=(.70, .67, .64), glass=(.26, .31, .36), wx=(.2, .8), wy=(.3, .8),
                     frame=(.45, .44, .44), blind=.22, rough=.45, course=1, vjoint=1, seed=37))
    b.colours(granite=(.70, .67, .64, .45), granite_d=(.56, .54, .52, .5), glass=(.22, .27, .31, .2), roof=(.43, .42, .41), steel=(.5, .5, .5, .4), pier=(.70, .67, .64, .45))
    X, Y, c = 19.0, 26.0, 2.6
    P = [(-X + c, -Y), (X - c, -Y), (X - c, -Y + c), (X, -Y + c), (X, Y - c), (X - c, Y - c), (X - c, Y), (-X + c, Y), (-X + c, Y - c), (-X, Y - c), (-X, -Y + c), (-X + c, -Y + c)]
    zb = 10.0
    tiers = [(1.0, zb, 146.0), (0.88, 146.0, 158.0), (0.74, 158.0, 168.0), (0.58, 168.0, 175.5), (0.40, 175.5, 180.5)]
    for sc, z0, z1 in tiers:
        q = scale(P, sc)
        b.prism(q, z0, z1, T, top='roof')
        b.fins(q, z0, z1 + 0.8, 'granite', spacing=3.5 * sc, w=0.6, dep=0.3, minlen=8 * sc, ends=True, top=True, lo=8)
        if b.hi:
            b.band(q, z1 - 0.3, 1.1, 0.3, 'granite_d', bottom=False)
    b.prism(scale(rect(38, 38), 0.2), 180.5, 183.0, 'granite_d', top='roof')
    lobby(b, P, zb, edge=0, w=7.0, h=5.0, inset=1.2, spacing=5.4, pw=1.2)
    if b.hi:
        b.band(P, zb - 0.2, 1.0, 0.3, 'granite_d')
        for z in (44.0, 78.0, 112.0):
            b.band(P, z, 0.6, 0.2, 'granite_d', top=False, bottom=False)


@model('mckesson_plaza_one_post', 'B', 161.0, face='south', stone=0x5c4a3a,
       desc='35 x 33 m bronze tower with chamfered corners: bronze glass between dark modelled ribs, the shaft flaring out over the bottom 16 m')
def mckesson(b):
    T = b.facade(Tex('mckesson_bronze', cols=4, rows=8, bay=1.5, floor=3.85, wall=(.32, .26, .21), glass=(.34, .27, .21), wx=(.16, .84), wy=(.28, .98),
                     spandrel=(.26, .21, .17), frame_px=0, blind=.12, blindc=(.55, .47, .38), rough=.28, grad=.16, seed=39))
    b.colours(bronze=(.32, .26, .21, .45), bronze_d=(.24, .20, .17, .5), glass=(.24, .2, .17, .2), roof=(.33, .31, .29), pier=(.32, .26, .21, .45), steel=(.3, .26, .22, .4))
    P = [(-17.4, -12.4), (-13.6, -16.4), (14.6, -16.4), (17.4, -12.4), (17.4, 12.6), (13.8, 16.4), (-13.0, 16.4), (-17.4, 12.2)]
    P = ccw(P)
    Bd = scale(P, 0.94)
    zf, zr = 16.0, 156.0
    b.ring(P, 5.0, zf, T, poly1=Bd)
    b.prism(Bd, zf, zr, T, top='roof')
    b.prism(offset(Bd, -2.2), zr, 161.0, 'bronze_d', top='roof')
    lobby(b, P, 5.0, edge=1, w=6.0, h=3.6, inset=1.4, spacing=4.6, pw=0.8)
    b.fins(Bd, zf, zr + 1.0, 'bronze_d', spacing=1.5, w=0.3, dep=0.42, top=True, minlen=3, ends=True, lo=4)
    if b.hi:
        b.fins(P, 5.0, zf, 'bronze_d', spacing=1.5, w=0.3, dep=0.42, poly1=Bd, minlen=3, ends=True)
        b.band(Bd, zr, 1.0, 0.45, 'bronze_d', bottom=False)
        for z in [zf + 9.6 * k for k in range(1, 15)]:
            b.band(Bd, z, 0.45, 0.3, 'bronze_d', top=False)
        b.band(P, 4.6, 0.6, 0.3, 'bronze_d')


@model('infinity_towers', 'B', 137.0, face='northeast', stone=0x8fb5a8, ids=['infinity_tower_1', 'infinity_tower_2'],
       desc='36 x 35 m clover-leaf plan, every corner a full curve: continuous sea-green glass bands and modelled white slab edges, set-back roof plant')
def infinity(b):
    T = b.facade(Tex('infinity_glass', cols=4, rows=8, bay=1.4, floor=3.1, wall=(.80, .81, .79), glass=(.30, .46, .42), wx=(0, 1), wy=(.17, 1.0),
                     frame_px=0, mv=1, mull=(.42, .54, .50), blind=.18, lit=.03, rough=.26, grad=.14, shadow=.8, seed=41))
    b.colours(white=(.80, .81, .79, .45), roof=(.44, .45, .44), glass=(.22, .32, .30, .2), steel=(.6, .62, .6, .4), pier=(.72, .73, .71, .5))
    n = b.seg(7, 4)
    P = []
    for k in range(4):   # four lobes
        cxy = [(8.3, -8.2), (8.3, 8.2), (-8.3, 8.2), (-8.3, -8.2)][k]
        P += arc(cxy[0], cxy[1], 9.2, -135 + 90 * k + 4, 45 + 90 * k - 4 + 90 - 90, n) if False else arc(cxy[0], cxy[1], 9.2, -128 + 90 * k, 38 + 90 * k, n)
    P = dedupe(P)
    zb, zr = 6.5, 132.0
    b.ring(P, zb, zr, T, smooth=True, thr=50)
    b.cap(P, zr, 'roof')
    b.prism(scale(P, 0.55), zr, 137.0, 'steel', top='roof', smooth=True)
    b.ring(offset(P, -0.6), 0, zb, 'glass', smooth=True)
    b.band(P, zb - 0.4, 0.5, 0.45, 'white')
    b.band(P, zr - 0.3, 1.3, 0.45, 'white', bottom=False)
    if b.hi:
        for z in [zb + 9.3 * k for k in range(1, 14)]:
            b.band(P, z, 0.3, 0.45, 'white')
        b.fins(offset(P, -0.6), 0, zb, 'pier', n=1, w=0.6, dep=0.6, ends=True, minlen=0.5, edges=set(range(0, len(P), 2)))
        b.portal((-3.5, -16.9), (3.5, -16.9), 0.0, 4.0, 3.6, 'steel', 'glass', dep=0.5)


@model('russ_building', 'B', 133.0, face='east', stone=0xc4bfae,
       desc='83 x 46 m neo-Gothic E plan: three wings and two light courts to Montgomery St over a four-storey base, cream-grey terra cotta piers, central tower stepping to pinnacles and a flagpole')
def russ(b):
    T = b.facade(Tex('russ_terra', cols=4, rows=8, bay=1.9, floor=3.85, wall=(.72, .70, .64), glass=(.23, .26, .28), wx=(.2, .8), wy=(.28, .84),
                     spandrel=(.60, .58, .53), frame=(.4, .39, .36), pier=(.24, (.75, .73, .67)), blind=.3, rough=.65, noise=.04, seed=43))
    b.colours(terra=(.74, .72, .66, .7), terra_d=(.60, .58, .53, .75), roof=(.41, .40, .38), glass=(.2, .22, .24, .25), bronze=(.28, .23, .17, .45), copper=(.42, .52, .46, .6), pier=(.74, .72, .66, .7))
    zb = 16.0
    parts = [(rect2(-41.5, 41.5, -23, 23), 0, zb), (rect2(-41.5, 41.5, 2, 23), zb, 88.0), (rect2(-41.5, -22, -23, 2), zb, 80.0), (rect2(22, 41.5, -23, 2), zb, 80.0),
             (rect2(-12.5, 12.5, -23, 2), zb, 100.0), (rect2(-11, 11, -21.5, 6), 100.0, 114.0), (rect2(-8.5, 8.5, -19, 3.5), 114.0, 123.0), (rect2(-5.5, 5.5, -16, 0.5), 123.0, 127.5)]
    for k, (r, z0, z1) in enumerate(parts):
        b.prism(r, z0, z1, T, top='roof')
        if b.hi:
            b.fins(r, max(z0, 0), z1 + (1.6 if k else 0.6), 'terra', spacing=3.8, w=0.7, dep=0.4, ends=True, top=True, minlen=5)
            b.band(r, z1 - 0.4, 1.0, 0.3, 'terra_d', bottom=False)
        else:
            b.ring(r, z1, z1 + 1.6, 'terra')
    for (cx, cy, s, z) in [(-9.5, -20, 1.6, 115.6), (9.5, -20, 1.6, 115.6), (-9.5, 4.5, 1.6, 115.6), (9.5, 4.5, 1.6, 115.6), (-7, -17.5, 1.3, 124.6), (7, -17.5, 1.3, 124.6), (-7, 2, 1.3, 124.6), (7, 2, 1.3, 124.6)]:
        b.cbox(cx, cy, s, s, z - 1.6, z + 1.2, 'terra')
        b.pyramid(rect(s, s, cx, cy), z + 1.2, (cx, cy, z + 4.0), 'terra_d')
    b.hip(-5.5, 5.5, -16, 0.5, 127.5, 2.5, 'copper')
    b.beam((0, -7.75, 129.5), (0, -7.75, 133.0), 0.22, 'terra_d', caps=True)
    if b.hi:
        b.band(parts[0][0], zb - 0.5, 1.1, 0.4, 'terra_d')
        b.portal((-12.5, -23), (12.5, -23), 0.0, 5.0, 8.0, 'terra', 'glass', dep=1.0, t=1.0)
        b.attach((-12.5, -23), (12.5, -23), -4, 4, 8.8, 13.5, 0.5, 'terra_d')


@model('hilton_union_square', 'B', 150.0, face='north', stone=0xc4c0b6,
       desc='21 x 41 m pale concrete hotel slab (the 1971 tower only): windows between slim modelled ribs, glazed round-cornered sky lounge under the roof slab')
def hilton(b):
    T = b.facade(Tex('hilton_concrete', cols=4, rows=8, bay=1.4, floor=3.0, wall=(.74, .72, .68), glass=(.24, .28, .32), wx=(.2, .8), wy=(.26, .82),
                     frame=(.45, .45, .44), blind=.4, lit=.05, rough=.65, noise=.03, seed=45))
    b.colours(conc=(.74, .72, .68, .7), conc_d=(.60, .59, .56, .75), glass=(.27, .34, .40, .2), roof=(.43, .42, .41), white=(.8, .8, .78, .5), pier=(.74, .72, .68, .7), steel=(.5, .5, .5, .4))
    P = rect(20.2, 40.2)
    zb, zr = 8.0, 139.0
    b.prism(P, zb, zr, T, top='roof')
    sk = rrect(21.0, 41.0, 3.5, b.seg(4, 2))
    b.prism(sk, 139.8, 145.6, 'glass', top='roof', bottom='conc_d', smooth=True)
    b.prism(rrect(21.0, 41.0, 3.5, b.seg(4, 2)), 145.6, 146.8, 'conc', top='roof', bottom='conc_d')
    b.prism(rect(13, 30), 146.8, 150.0, 'conc_d', top='roof')
    b.prism(rect(18, 38), zr, 139.8, 'conc_d', top=None)
    lobby(b, offset(P, 0.4), zb, edge=0, w=6.0, h=4.0, inset=1.2, spacing=4.9, pw=0.9)
    if not b.hi:
        b.fins(P, zb, zr, 'conc', spacing=1.4, w=0.32, dep=0.4, ends=True, lo=6)
    if b.hi:
        b.fins(P, zb, zr, 'conc', spacing=1.4, w=0.32, dep=0.4, ends=True, top=True)
        for z in [zb + 4.5 * k for k in range(1, 29)]:
            b.band(P, z, 0.4, 0.2, 'conc_d')
        b.fins(sk, 139.8, 145.6, 'white', spacing=2.6, w=0.2, dep=0.12, minlen=1.0)
        b.band(P, zb - 0.3, 1.0, 0.4, 'conc')
        b.band(P, zr - 0.6, 0.8, 0.4, 'conc_d', bottom=False)
        for z in (47.0, 93.0):
            b.band(P, z, 0.5, 0.25, 'conc_d', top=False, bottom=False)


@model('westin_st_francis', 'B', 120.0, face='east', stone=0x9a9a94,
       desc='84 x 92 m: the grey sandstone 1904 block on +Z (four wings and three light courts over a two-storey base, heavy cornice, flags) and the 1972 slab tower behind with five outside capsule lifts')
def westin(b):
    T = b.facade(Tex('westin_sandstone', cols=4, rows=8, bay=2.3, floor=4.2, wall=(.60, .60, .57), glass=(.22, .25, .27), wx=(.26, .74), wy=(.22, .78),
                     frame=(.4, .4, .38), sill=(.68, .68, .65), blind=.35, rough=.7, course=3, vjoint=2, noise=.04, seed=47))
    b.colours(stone=(.60, .60, .57, .7), stone_d=(.48, .48, .46, .75), stone_l=(.68, .68, .65, .7), roof=(.4, .4, .39), glass=(.22, .27, .31, .2), conc=(.72, .71, .68, .65),
              awn=(.45, .2, .18, .7), brass=(.6, .5, .3, .4), pier=(.60, .60, .57, .7))
    zo = 54.0
    b.prism(rect2(-42, 42, -44.5, -10), 0, 9.5, T, top='roof')
    b.prism(rect2(-42, 42, -27, -10), 9.5, zo, T, top='roof')
    for x0, x1 in ((-42, -25), (-18.5, -3.5), (3.5, 18.5), (25, 42)):
        w = rect2(x0 + (0.9 if x0 < -40 else 0), x1 - (0.9 if x1 > 40 else 0), -44.9, -27)
        b.prism(w, 9.5, zo, T, top='roof', skip={2})
        if b.hi:
            b.band(w, zo - 2.2, 1.6, 1.1, 'stone_l', edges={0, 1, 3})
            b.band(w, zo - 0.6, 1.6, 0.3, 'stone', edges={0, 1, 3}, bottom=False)
            b.band(w, 38.0, 0.6, 0.35, 'stone_l', edges={0, 1, 3})
            b.fins(w, 0, 9.5, 'stone', n=3, w=1.0, dep=0.35, edges={0}, ends=True)
            b.fins(w, 9.5, zo - 2.2, 'stone', spacing=4.6, w=0.7, dep=0.25, edges={0, 1, 3}, ends=True)
            b.fins(w, zo - 3.2, zo - 2.2, 'stone_d', spacing=1.15, w=0.4, dep=0.8, edges={0}, ends=True)
            b.band(w, 23.0, 0.5, 0.3, 'stone_l', edges={0, 1, 3})
    b.prism(rect2(-42, 42, -10, 38), 0, 20.0, T, top='roof')
    b.prism(rect2(0, 42, 38, 46), 0, 20.0, T, top='roof', skip={0})
    b.prism(rect2(-42, 42, -46, -44.5), 0, 0.6, 'stone_d', top='stone_d')
    tw = rect2(-25, 27, 15, 38)
    b.prism(tw, 20.0, 114.0, T, top='roof')
    b.prism(offset(tw, -2.5), 114.0, 117.5, 'conc', top='roof')
    b.cbox(1, 26.5, 30, 12, 117.5, 120.0, 'stone_d')
    if not b.hi:
        b.fins(tw, 20.0, 114.0, 'conc', spacing=2.3, w=0.4, dep=0.3, edges={1, 2, 3}, ends=True, lo=6)
    for k in range(5):   # outside lifts on the tower's Union Square face
        x = -11 + 6.0 * k
        b.box(x - 1.3, x + 1.3, 12.6, 15.0, 20.0, 116.0, 'glass')
        if b.hi:
            b.box(x - 1.5, x + 1.5, 12.2, 15.0, 30.0 + 15 * k, 34.0 + 15 * k, 'conc', bottom=True)
            b.box(x - 1.5, x - 1.3, 12.5, 15.0, 20.0, 116.5, 'conc')
            b.box(x + 1.3, x + 1.5, 12.5, 15.0, 20.0, 116.5, 'conc')
    if b.hi:
        b.band(rect2(-41.6, 41.6, -44.5, -10), 9.0, 0.8, 0.4, 'stone_l', edges={0, 1, 3})
        b.band(rect2(-42, 42, -27, -10), zo - 0.6, 1.6, 0.3, 'stone', bottom=False)
        b.portal((-3.5, -27), (3.5, -27), 0.0, 5.0, 5.0, 'stone_l', 'glass', dep=0.6)
        b.attach((-42, -44.5), (42, -44.5), -9, 9, 4.6, 5.1, 1.5, 'awn')
        b.portal((-42, -44.5), (42, -44.5), 0.0, 6.0, 4.4, 'brass', 'glass', dep=0.5)
        for k in range(7):
            x = -9 + 3 * k
            b.beam((x, -44.8, 9.8), (x, -45.9, 15.0), 0.14, 'brass')
            b.poly([(x, -45.4, 12.6), (x, -45.9, 15.0), (x + 1.6, -45.9, 14.4), (x + 1.6, -45.45, 12.4)], 'awn')
        b.band(tw, 113.0, 1.0, 0.3, 'conc', bottom=False)
        for z in [20.0 + 7.8 * k for k in range(1, 12)]:
            b.band(tw, z, 0.45, 0.25, 'conc', edges={1, 2, 3})
        b.fins(tw, 20.0, 114.0, 'conc', spacing=2.3, w=0.4, dep=0.3, edges={1, 2, 3}, ends=True)


@model('fairmont_sf', 'B', 99.0, face='east', stone=0xcfcabb,
       desc='84 x 118 m: the 1907 white terra cotta palace on +Z (rusticated base, columned porte-cochere, flags, bracketed cornice and balustrade) and the plain 1961 slab tower with its outside lift at the back')
def fairmont(b):
    T = b.facade(Tex('fairmont_terra', cols=4, rows=8, bay=2.6, floor=4.6, wall=(.76, .74, .69), glass=(.22, .25, .27), wx=(.28, .72), wy=(.2, .76),
                     frame=(.5, .49, .46), sill=(.8, .78, .73), blind=.35, rough=.6, course=3, vjoint=2, noise=.025, seed=49))
    b.colours(terra=(.76, .74, .69, .6), terra_d=(.62, .60, .56, .65), terra_l=(.81, .79, .74, .6), roof=(.42, .42, .40), glass=(.22, .27, .31, .2), garden=(.36, .43, .30, .9),
              awn=(.5, .22, .2, .7), brass=(.6, .5, .3, .4), conc=(.74, .73, .70, .65))
    zo = 33.0
    main = rect2(-40.8, 40.8, -56.8, 25)
    b.prism(main, 0, zo, T, top='roof')
    for x0, x1 in ((-42, -26), (26, 42)):   # corner pavilions
        b.prism(rect2(x0 + (1.2 if x0 < -40 else 0), x1 - (1.2 if x1 > 40 else 0), -57.8, -56.8), 0, zo, T, top='roof', skip={2})
    b.cap(rect2(-30, 30, -40, 15), zo + 0.05, 'garden')
    b.prism(rect2(-42, 42, 25, 51), 0, 18.0, T, top='roof')
    tw = rect2(-13, 15, 27, 59)
    b.prism(tw, 0, 92.0, T, top='roof')
    b.prism(offset(tw, 0.0), 92.0, 96.5, 'glass', top='roof')
    b.prism(offset(tw, -3.0), 96.5, 99.0, 'conc', top='roof')
    b.box(-0.5, 3.5, 24.0, 27.0, 18.0, 97.5, 'glass')
    if not b.hi:
        b.band(main, zo - 1.6, 1.3, 1.2, 'terra_l')
        b.fins(main, 9.6, zo - 2.4, 'terra_l', spacing=5.2, w=0.9, dep=0.3, ends=True, lo=4)
    if b.hi:
        b.band(tw, 96.0, 0.6, 0.2, 'conc', bottom=False)
        b.band(main, zo - 1.6, 1.3, 1.2, 'terra_l')
        b.fins(main, zo - 2.4, zo - 1.6, 'terra_d', spacing=2.6, w=0.5, dep=0.8, ends=True)
        b.parapet(main, zo - 0.3, 1.5, 0.5, 'terra')
        b.fins(main, 9.6, zo - 2.4, 'terra_l', spacing=5.2, w=0.9, dep=0.3, ends=True)
        b.band(main, 21.0, 0.5, 0.3, 'terra_l')
        b.band(main, 15.0, 0.4, 0.2, 'terra_l')
        b.band(main, 9.6, 0.7, 0.45, 'terra_l')
        b.fins(main, 0, 9.6, 'terra_d', spacing=5.2, w=1.6, dep=0.3, edges={0}, ends=True)
        # porte-cochere: six columns, entablature, awning, flags
        for k in range(6):
            x = -16.5 + 6.6 * k
            b.cyl(x, -58.2, 0.75, 0.6, 10.6, 8, 'terra_l', cap=False)
            b.cbox(x, -58.2, 2.0, 2.0, 0, 0.6, 'terra_d')
        b.box(-19, 19, -59.0, -56.8, 10.6, 13.0, 'terra_l', bottom=True)
        b.box(-19.5, 19.5, -59.0, -56.8, 13.0, 13.6, 'terra')
        b.portal((-26, -56.8), (26, -56.8), 0.0, 6.0, 5.0, 'brass', 'glass', dep=0.5)
        for k in range(9):
            x = -20 + 5 * k
            b.beam((x, -58.4, 13.6), (x, -58.4, 20.5), 0.14, 'brass')
            b.poly([(x, -58.4, 20.3), (x, -58.4, 18.6), (x + 2.2, -58.4, 18.8), (x + 2.2, -58.4, 20.1)], 'awn')
        b.fins(tw, 18.0, 92.0, 'conc', spacing=2.8, w=0.4, dep=0.3, ends=True, edges={1, 2, 3})
        b.box(-1.0, 4.0, 23.6, 27.0, 92.0, 98.0, 'conc')


@model('mark_hopkins', 'B', 93.0, face='south', stone=0xb8a07c,
       desc='59 x 63 m: buff brick and cream terra cotta tower (steep hipped roof, finials, the glazed Top of the Mark) at the junction of two wings round the corner forecourt at model back-left (California and Mason), low block behind')
def markhopkins(b):
    T = b.facade(Tex('markhopkins_brick', cols=4, rows=8, bay=2.2, floor=3.6, wall=(.66, .56, .43), glass=(.22, .25, .27), wx=(.28, .72), wy=(.22, .8),
                     frame=(.78, .74, .66), frame_px=2, sill=(.78, .74, .66), blind=.35, rough=.75, course=7, noise=.05, seed=51))
    b.colours(brick=(.66, .56, .43, .75), cream=(.78, .74, .66, .6), cream_d=(.64, .60, .53, .65), roof=(.42, .40, .37), tile=(.40, .30, .24, .7), glass=(.25, .31, .36, .18),
              copper=(.42, .53, .47, .6), brass=(.6, .5, .3, .4), awn=(.3, .34, .28, .7), pier=(.78, .74, .66, .6))
    low = [(-14, -32), (30, -32), (30, 12), (-9, 12), (-9, -31), (-14, -31)]
    b.prism(rect2(-9, 30, -32, 12), 0, 14.0, T, top='roof')
    wa = rect2(8, 28.6, 12, 30.6)       # wing along the back street
    wb = rect2(-28.1, -9, -30.3, -8)   # wing down the side street
    for w, h in ((wa, 50.0), (wb, 50.0)):
        b.prism(w, 0, h, T, top=None)
        x0, x1, y0, y1 = bbox2(w)
        b.hip(x0 - 0.6, x1 + 0.6, y0 - 0.6, y1 + 0.6, h, 6.5, 'tile')
        if b.hi:
            b.band(w, h - 1.0, 1.0, 0.6, 'cream')
            b.band(w, 9.0, 0.6, 0.3, 'cream')
            b.band(w, h - 8.2, 0.5, 0.25, 'cream', top=False, bottom=False)
            b.band(w, 23.0, 0.5, 0.25, 'cream', top=False, bottom=False)
            b.fins(w, 9.0, h - 1.0, 'cream', spacing=2.2, w=0.45, dep=0.2, ends=True)
            for z in (16.2, 30.2, 37.4):
                b.band(w, z, 0.4, 0.2, 'cream')
            for t in (0.25, 0.5, 0.75):   # dormers and chimneys on the hipped roof
                if x1 - x0 > y1 - y0:
                    dx_, dy_ = x0 + (x1 - x0) * t, y0 + 1.2
                    b.cbox(dx_, dy_, 2.0, 2.4, h, h + 3.0, 'cream')
                    b.cbox(dx_, y1 - 1.2, 2.0, 2.4, h, h + 3.0, 'cream')
                else:
                    b.cbox(x0 + 1.2, y0 + (y1 - y0) * t, 2.4, 2.0, h, h + 3.0, 'cream')
                    b.cbox(x1 - 1.2, y0 + (y1 - y0) * t, 2.4, 2.0, h, h + 3.0, 'cream')
            b.cbox((x0 + x1) / 2, (y0 + y1) / 2, 1.6, 1.6, h + 5.0, h + 9.0, 'brick')
    # central tower turned to the forecourt
    tw = [(-12, -8), (8, -8), (8, 32), (-8, 32), (-8, 26), (-20, 14), (-24, 9), (-29.5, 9), (-29.5, -8)]
    tw = [(-14, -10), (10, -10), (10, 30), (-6, 30), (-22, 14), (-22, -10)] if False else [(-13, -9), (9, -9), (9, 28.5), (-5, 28.5), (-24.5, 9), (-24.5, -9)]
    tw = ccw(tw)
    zt = 70.0
    b.prism(tw, 0, zt, T, top='roof')
    top = offset(tw, -1.2)
    b.prism(top, zt, 75.5, 'glass', top='roof')
    c = (-4.0, 6.0)
    b.band(top, 75.5, 0.8, 1.5, 'cream')
    x0, x1, y0, y1 = bbox2(top)
    hipb = [(p[0], p[1]) for p in offset(top, 0.6)]
    for i in range(len(hipb)):
        a, d = hipb[i], hipb[(i + 1) % len(hipb)]
        b.poly([(a[0], a[1], 76.3), (d[0], d[1], 76.3), (c[0] + (d[0] - c[0]) * 0.22, c[1] + (d[1] - c[1]) * 0.22, 87.0), (c[0] + (a[0] - c[0]) * 0.22, c[1] + (a[1] - c[1]) * 0.22, 87.0)], 'tile')
    b.cap([(c[0] + (p[0] - c[0]) * 0.22, c[1] + (p[1] - c[1]) * 0.22) for p in hipb], 87.0, 'copper')
    b.beam((c[0], c[1], 87.0), (c[0], c[1], 93.0), 0.25, 'brass', caps=True)
    b.fins(tw, 0, zt - 1.2, 'cream', spacing=4.4, w=0.6, dep=0.25, ends=True, minlen=6, lo=2)
    if b.hi:
        b.fins(top, zt, 75.5, 'cream', spacing=2.4, w=0.3, dep=0.2, minlen=2, ends=True)
        b.band(tw, zt - 1.2, 1.2, 0.7, 'cream')
        b.band(tw, 9.0, 0.6, 0.3, 'cream')
        b.band(tw, 56.0, 0.6, 0.35, 'cream', top=False, bottom=False)
        for z in (16.2, 23.0, 30.2, 37.4, 45.0, 62.0):
            b.band(tw, z, 0.5, 0.25, 'cream')
        for p in offset(top, 0.3):
            b.cbox(p[0], p[1], 1.0, 1.0, 76.3, 79.5, 'cream')
            b.pyramid(rect(1.0, 1.0, p[0], p[1]), 79.5, (p[0], p[1], 82.0), 'copper')
        a, d = tw[3], tw[4]
        b.portal(a, d, 0.0, 6.0, 4.5, 'cream', 'glass', dep=0.8)
        b.attach(a, d, -6, 6, 4.8, 5.3, 4.0, 'awn')
        b.band(rect2(-9, 30, -32, 12), 13.2, 0.8, 0.3, 'cream', edges={0, 1})
        b.portal((-9, -32), (30, -32), 0.0, 5.0, 4.0, 'cream', 'glass', dep=0.5)


@model('hyatt_regency_embarcadero', 'B', 74.0, face='east', stone=0xbab4a8,
       desc='81 x 120 m triangular wedge of ribbed concrete: the long north face (model +X) steps back floor by floor in balconies, vertical ribbed walls to the other streets, the revolving-restaurant drum on the roof')
def hyatt(b):
    T = b.facade(Tex('hyatt_concrete', cols=4, rows=8, bay=1.9, floor=3.7, wall=(.72, .70, .66), glass=(.22, .26, .30), wx=(.3, .7), wy=(.2, .86),
                     spandrel=(.60, .58, .55), frame_px=0, pier=(.2, (.75, .73, .69)), blind=.3, rough=.7, noise=.035, seed=53))
    b.colours(conc=(.72, .70, .66, .7), conc_d=(.58, .57, .54, .75), conc_l=(.77, .75, .71, .7), roof=(.42, .42, .41), glass=(.21, .26, .30, .2), steel=(.45, .46, .47, .4), plant=(.33, .42, .28, .9), pier=(.72, .70, .66, .7))
    P = [(-40.5, 18), (-34, 18), (21, -59.5), (40, -46), (40, 56), (-40.5, 56)]
    zb, fh, nfl, dx = 8.0, 3.7, 17, 2.25
    b.prism(P, 0, zb, T, top='conc')
    for k in range(nfl):
        z0, z1 = zb + k * fh, zb + (k + 1) * fh
        q = clip(P, 1, 0, 40 - dx * (k + 1))
        if len(q) < 3:
            break
        m = len(q)
        # the clipped edge is the one lying on x = const
        ce = [i for i in range(m) if abs(q[i][0] - (40 - dx * (k + 1))) < 1e-6 and abs(q[(i + 1) % m][0] - (40 - dx * (k + 1))) < 1e-6]
        b.ring(q, z0, z1, T, skip=set(ce))
        for i in ce:
            b.wall(q[i], q[(i + 1) % m], z0, z1, 'glass')
            if b.hi:
                a, c = q[i], q[(i + 1) % m]
                b.attach(a, c, 0, 1, z0 - 0.2, z0 + 1.1, dx - 0.2, 'conc_l', frac=True, back=0.0)
                b.fins([a, c], z0 + 1.1, z1, 'conc', spacing=7.5, w=0.3, dep=dx - 0.4, edges={0}, ends=True)
            else:
                a, c = q[i], q[(i + 1) % m]
                b.attach(a, c, 0, 1, z0 - 0.2, z0 + 1.1, dx - 0.2, 'conc_l', frac=True, top=True, bottom=False)
        if k == nfl - 1:
            b.cap(q, z1, 'roof')
            ztop = z1
            qt = q
    b.box(20, 30, 56, 60, 0, 34.0, 'conc')
    xs = [p[0] for p in qt]
    b.cyl(-22, 40, 10.5, ztop, 74.0, b.seg(20, 10), 'glass')
    b.cyl(-22, 40, 11.0, 73.2, 74.0, b.seg(20, 10), 'conc_l') if b.hi else None
    b.cbox(-30, 28, 9, 7, ztop, ztop + 2.4, 'conc_d')
    if b.hi:
        b.fins(P, 0, zb, 'conc', spacing=7.6, w=1.0, dep=0.4, ends=True)
        b.band(P, zb - 0.6, 0.9, 0.4, 'conc_l')
        b.portal((-34, 18), (21, -59.5), 0.0, 8.0, 4.4, 'conc_l', 'glass', dep=0.8)
        b.attach((-34, 18), (21, -59.5), -8, 8, 4.7, 5.2, 3.0, 'conc_d')
        b.portal((21, -59.5), (40, -46), 0.0, 6.0, 4.4, 'conc_l', 'glass', dep=0.8)


if __name__ == '__main__':
    run()
