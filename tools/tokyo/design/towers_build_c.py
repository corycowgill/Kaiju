# Tokyo tier C towers (design-towers). blender -b -P towers_build_c.py -- [ids...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2
from towers_build_b import relief, screen, bulge
MODELS.clear()   # only this file's models


@model('otemachi_tower', 'C', 200.0, face='south', stone=0x6f7a82,
       desc="56 x 102 m: dark glass tower with fine pale vertical lines, low wing behind under the planted 'Otemachi forest' roof")
def otemachi(b):
    std(b)
    T = b.facade(curtain('otemachi_glass', (.22, .28, .33), wall=(.56, .59, .62), bay=1.5, floor=4.3, seed=91, night=.5, cool=.25))
    b.colours(pale=(.70, .72, .74, .4), roof=(.40, .41, .42), steel=(.5, .52, .55, .4, .3), glass=(.16, .2, .24, .2), green=(.20, .36, .18, .9), stone=(.5, .5, .5, .7))
    tw = rect2(-28, 28, -51.25, 14.0)
    zr = 192.0
    b.ring(offset(tw, -1.2), 0, 9.0, 'lobby')
    b.prism(tw, 9.0, zr, T, top='roof', bottom='pale')
    relief(b, tw, 9.0, zr, 'pale', fin=3.0, band=17.2, lo=(6, 3))
    screen(b, tw, zr, 200.0, T, inner='steel', rim='pale')
    b.prism(offset(tw, -8), zr, 197.0, 'steel', top='roof')
    wing = rect2(-28, 28, 14.0, 51.25)
    b.prism(wing, 0, 20.0, 'stone', top='green', skip={0})
    b.attach(wing[1], wing[2], 0.05, 0.95, 2.0, 16.0, 0.15, 'lobby', frac=True, top=False, bottom=False)
    beacons(b, [(sx * 27, y, 198.9) for sx in (-1, 1) for y in (-50.2, 13.0)])
    if b.hi:
        b.fins(offset(tw, -1.2), 0, 9.0, 'pale', spacing=7.0, w=0.8, dep=1.2, ends=True)
        for x, y in ((-18, 24), (-4, 40), (14, 28), (20, 44), (-20, 44)):   # tree clumps
            b.prism(ngon(4.5, 6, x, y), 20.0, 26.0, 'green', top='green', poly1=ngon(2.5, 6, x, y))


@model('shiodome_media_tower', 'C', 172.0, face='west', stone=0x9aa6ad,
       desc='62 x 53 m: slim glass news-agency tower with white ledges, stone-clad core to one side, low podium and a roof mast')
def media_tower(b):
    std(b)
    T = b.facade(curtain('media_tower_glass', (.31, .40, .47), bay=1.6, floor=4.2, seed=93, night=.6, cool=.3))
    b.colours(white=(.80, .82, .83, .4), roof=(.44, .45, .46), steel=(.6, .62, .64, .4, .3), glass=(.2, .26, .31, .2), stone=(.70, .69, .66, .7), mast=(.84, .84, .82, .5))
    pod = rect(62.0, 53.5)
    b.prism(pod, 0, 14.0, T, top='roof', vfloors=3)
    b.band(pod, 13.4, 0.9, 0.4, 'white', bottom=False)
    tw = rect2(-27, 17, -24.0, 12.0)
    zr = 160.0
    b.prism(tw, 14.0, zr, T, top='roof')
    relief(b, tw, 14.0, zr, 'white', fin=3.2, band=8.4, lo=(6, 4))
    core = rect2(17, 27, -20.0, 8.0)
    b.prism(core, 14.0, 166.0, 'stone', top='roof')
    b.prism(offset(tw, -6), zr, 165.0, 'steel', top='roof')
    b.prism(rect(2.2, 2.2, 22, -6), 166.0, 169.0, 'mast', top='mast', poly1=rect(1.0, 1.0, 22, -6))
    b.cyl(22, -6, 0.3, 169.0, 172.0, 5, 'mast')
    beacons(b, [(22, -6, 169.0), (-26, -23, zr), (-26, 11, zr)])
    if b.hi:
        floorbands(b, core, 14.0, 166.0, 12.6, 'white', h=0.3, dep=0.25)
        b.portal(pod[0], pod[1], -6.0, 8.0, 5.0, 'steel', 'lobby', dep=0.6, canopy=3.0)


@model('tokyo_shiodome_building', 'C', 173.0, face='east', stone=0xa4adb2,
       desc='140 x 43 m: long glass slab (offices below, the hotel floors above a recessed sky-lobby band), white ledges, low wing at one end')
def shiodome_building(b):
    std(b)
    T = b.facade(curtain('shiodome_bldg_glass', (.32, .41, .47), bay=1.6, floor=4.1, seed=95, wy=(.3, .95), night=.5, cool=.2))
    b.colours(white=(.80, .82, .83, .4), roof=(.44, .45, .46), steel=(.6, .62, .64, .4, .3), glass=(.2, .26, .31, .2), dark=(.25, .27, .3, .4))
    slab = rect2(-70, 42, -19.5, 19.5)
    b.ring(offset(slab, -1.0), 0, 8.0, 'lobby')
    b.ring(slab, 8.0, 118.0, T)
    b.cap(slab, 8.0, 'white', down=True)
    b.ring(offset(slab, -1.5), 118.0, 126.0, 'litc')
    b.prism(slab, 126.0, 166.0, T, top='roof', bottom='white')
    relief(b, slab, 8.0, 118.0, 'white', fin=4.8, band=8.2, lo=(5, 4))
    relief(b, slab, 126.0, 166.0, 'white', fin=3.2, band=8.2, lo=(8, 4))
    b.band(slab, 117.4, 0.8, 0.5, 'white')
    b.prism(offset(slab, -7), 166.0, 173.0, 'steel', top='roof')
    wing = rect2(42, 70, -21.5, 21.5)
    b.prism(wing, 0, 26.0, T, top='roof', skip={3})
    b.band(wing, 25.4, 0.9, 0.4, 'white', bottom=False, edges={0, 1, 2})
    beacons(b, [(-69, -18.5, 166.0), (41, 18.5, 166.0), (-69, 18.5, 166.0), (41, -18.5, 166.0)])
    if b.hi:
        b.fins(offset(slab, -1.0), 0, 8.0, 'white', spacing=8.0, w=0.9, dep=1.0, ends=True)


@model('kasumigaseki_common_gate', 'C', 176.0, face='south', stone=0xa9b3b8,
       desc='56 x 50 m: government-office glass tower with white vertical ribs modelled on every third bay, stone-framed base, screened crown')
def common_gate(b):
    std(b)
    T = b.facade(curtain('common_gate_glass', (.30, .39, .46), bay=1.6, floor=4.2, seed=97, night=.6, cool=.35))
    b.colours(white=(.82, .83, .84, .4), roof=(.44, .45, .46), steel=(.6, .62, .64, .4, .3), glass=(.2, .26, .31, .2), stone=(.72, .71, .68, .7))
    P = rect(54.0, 48.0)
    zr = 168.0
    b.prism(rect(56.0, 50.0), 0, 12.0, 'stone', top='roof')
    b.prism(P, 12.0, zr, T, top='roof')
    b.fins(P, 12.0, zr, 'white', spacing=4.8, w=0.5, dep=0.6, ends=True, lo=3)
    floorbands(b, P, 12.0, zr, 16.8, 'white', h=0.35, dep=0.6, lo=3)
    screen(b, P, zr, 176.0, T, inner='steel')
    b.prism(offset(P, -7), zr, 173.0, 'steel', top='roof')
    for e in range(4):
        a, c = rect(56.0, 50.0)[e], rect(56.0, 50.0)[(e + 1) % 4]
        b.attach(a, c, 0.06, 0.94, 1.5, 10.0, 0.12, 'lobby', frac=True, top=False, bottom=False)
    beacons(b, [(sx * 26, sy * 23, 174.9) for sx in (-1, 1) for sy in (-1, 1)])
    if b.hi:
        b.band(rect(56.0, 50.0), 11.4, 0.9, 0.3, 'stone', bottom=False)
        b.fins(rect(56.0, 50.0), 0, 11.4, 'stone', spacing=8.0, w=1.2, dep=0.3, ends=True)


@model('sanno_park_tower', 'C', 194.0, face='northwest', stone=0xa3aab0,
       desc='104 x 55 m: silver-grey tower with stone-and-glass bands, chamfered corners, the stepped crown and tall antenna mast, low wing')
def sanno(b):
    std(b)
    T = b.facade(curtain('sanno_band', (.25, .31, .37), wall=(.70, .71, .72), bay=1.6, floor=4.2, seed=99, wy=(.36, .9), rough=.4, night=.5, cool=.25))
    b.colours(silver=(.72, .73, .75, .4, .3), silver_d=(.52, .54, .57, .45, .3), roof=(.44, .45, .46), glass=(.2, .25, .3, .2), mast=(.84, .84, .82, .5))
    P = chamfer(62.0, 55.0, 6.0, -21.25, 0)
    zr = 158.0
    b.prism(P, 0, zr, T, top='roof')
    relief(b, P, 9.0, zr, 'silver', fin=3.2, band=8.4, lo=(6, 4), minlen=10)
    for k, z0, z1 in ((0.86, zr, 164.0), (0.66, 164.0, 170.0), (0.4, 170.0, 176.0)):
        b.prism(scale(P, k, k, about=(-21.25, 0)), z0, z1, 'silver', top='roof')
    b.prism(rect(3.0, 3.0, -21.25, 0), 176.0, 188.0, 'mast', top='mast', poly1=rect(1.4, 1.4, -21.25, 0))
    b.cyl(-21.25, 0, 0.4, 188.0, 194.0, 5, 'mast')
    beacons(b, [(-21.25, 0, 188.0)] + [(-21.25 + sx * 28, sy * 24, zr) for sx in (-1, 1) for sy in (-1, 1)])
    wing = rect2(9.75, 52.25, -22.0, 22.0)
    b.prism(wing, 0, 24.0, T, top='roof', skip={3})
    b.band(wing, 23.4, 0.9, 0.4, 'silver', bottom=False, edges={0, 1, 2})
    if b.hi:
        b.band(P, 8.2, 0.8, 0.5, 'silver')
        b.portal(P[0], P[1], 0.0, 8.0, 5.0, 'silver_d', 'lobby', dep=0.7, canopy=3.0)
        for z in (180.0, 184.0):
            b.band(rect(2.4, 2.4, -21.25, 0), z, 0.5, 1.2, 'mast')


@model('ark_mori_building', 'C', 153.0, face='northeast', stone=0x7d6d5c,
       desc='53 x 86 m: the 1986 ARK Hills slab in bronze-tinted glass with brown spandrel bands, chamfered corners, roof plant and helipad')
def ark_mori(b):
    std(b)
    T = b.facade(curtain('ark_mori_bronze', (.30, .25, .20), wall=(.46, .40, .34), bay=1.6, floor=3.9, seed=101, wy=(.38, .92), rough=.35, night=.5, warm=(1.0, .78, .5)))
    b.colours(bronze=(.46, .40, .34, .45), bronze_d=(.32, .27, .23, .5), roof=(.42, .41, .40), glass=(.22, .19, .16, .2), pad=(.36, .40, .36, .8))
    P = chamfer(53.0, 86.5, 7.0)
    zr = 144.0
    b.ring(offset(P, -1.2), 0, 8.0, 'lobby')
    b.prism(P, 8.0, zr, T, top='roof', bottom='bronze')
    relief(b, P, 8.0, zr, 'bronze', fin=3.2, band=7.8, lo=(6, 4), minlen=9)
    b.band(P, zr - 0.2, 1.0, 0.5, 'bronze')
    b.prism(offset(P, -6), zr, 150.0, 'bronze_d', top='roof')
    b.cyl(0, 14, 10.0, 150.0, 151.9, b.seg(14, 7), 'pad')
    beacons(b, [(sx * 9, 14 + sy * 9, 151.9) for sx in (-1, 1) for sy in (-1, 1)])
    if b.hi:
        b.fins(offset(P, -1.2), 0, 8.0, 'bronze', spacing=7.0, w=0.9, dep=1.2, ends=True, minlen=9)
        b.cbox(0, -22, 16, 12, 150.0, 152.5, 'bronze')


@model('harumi_triton', 'C', 195.0, face='northwest', stone=0xa9b0b4,
       desc='115 x 175 m: the three office towers of Triton Square stepping down in height (195, 175, 155 m), each with a sloped glass crown, '
            'joined by the shopping podium and linking bridges')
def triton(b):
    std(b)
    T = b.facade(curtain('triton_glass', (.30, .38, .45), wall=(.72, .73, .74), bay=1.6, floor=4.2, seed=103, wy=(.32, .94), night=.5, cool=.25))
    b.colours(white=(.80, .81, .82, .4), roof=(.44, .45, .46), steel=(.6, .62, .64, .4, .3), glass=(.2, .26, .31, .2), stone=(.70, .69, .66, .7), green=(.24, .38, .2, .9))
    pod = rect(115.5, 175.5)
    b.prism(pod, 0, 16.0, 'stone', top='roof')
    for e in range(4):
        b.attach(pod[e], pod[(e + 1) % 4], 0.03, 0.97, 2.0, 13.0, 0.12, 'lobby', frac=True, top=False, bottom=False)
    for (cx, cy, h) in ((14.0, -60.0, 195.0), (-10.0, 0.0, 175.0), (14.0, 60.0, 155.0)):
        P = chamfer(48.0, 48.0, 5.0, cx, cy)
        zc = h - 16.0
        b.ring(P, 16.0, zc, T)
        relief(b, P, 16.0, zc, 'white', fin=4.8, band=12.6, lo=(4, 3), minlen=10)
        hf = lambda p, cx=cx, h=h: h - (p[0] - cx + 24.0) * 0.30 - (1.1 if p[0] - cx < -20 else 0)
        slope_crown(b, P, zc, hf, T, 'roof')
        beacons(b, [(cx - 23.0, cy - 18, h - 1.1), (cx - 23.0, cy + 18, h - 1.1)])
    for cy, x0, x1 in ((-30.0, -10.0, 14.0), (30.0, -10.0, 14.0)):   # bridges
        b.box(min(x0, x1) - 4, max(x0, x1) + 4, cy - 6.5, cy + 6.5, 16.0, 30.0, 'lobby' if b.hi else 'stone')
    if b.hi:
        b.band(pod, 15.4, 0.9, 0.4, 'white', bottom=False)
        b.fins(pod, 0, 15.4, 'stone', spacing=9.6, w=1.0, dep=0.4, ends=True)
        b.prism(rect(30, 40, -38, 50), 16.0, 16.6, 'green', top='green')


@model('river_city_21', 'C', 180.0, face='north', stone=0xb7aa98, ids=['river_city_21_a', 'river_city_21_b'],
       desc='43 x 57 m 54-storey riverside condominium tower (one model for the tall River City 21 towers): beige tile with balcony ledges, '
            'chamfered corners, the stepped crown and lit lantern')
def river_city(b):
    std(b)
    T = b.facade(punched('river_city_resi', (.72, .67, .60), glass=(.21, .25, .29), bay=3.0, floor=3.2, seed=105, wx=(.1, .9), wy=(.30, .86), mv=1,
                         blind=.4, blindc=(.74, .70, .62), rough=.6, night=.33, cool=.06, warm=(1.0, .76, .46)))
    b.colours(beige=(.72, .67, .60, .6), beige_l=(.82, .78, .71, .55), beige_d=(.54, .49, .43, .65), roof=(.44, .43, .42), glass=(.2, .24, .28, .2))
    P = chamfer(43.0, 57.0, 9.0)
    zr = 158.0
    b.prism(P, 0, zr, T, top='roof')
    floorbands(b, P, 6.0, zr, 6.4, 'beige_l', h=0.8, dep=0.9, lo=6)
    b.fins(P, 0, zr, 'beige', spacing=6.0, w=0.9, dep=0.9, ends=True, minlen=12, lo=3)
    for k, z0, z1 in ((0.82, zr, 166.0), (0.62, 166.0, 172.0)):
        b.prism(scale(P, k), z0, z1, T, top='roof')
        b.band(scale(P, k), z1 - 0.4, 0.8, 0.5, 'beige_l')
    b.prism(scale(P, 0.36), 172.0, 176.5, 'lit', top='beige_d')
    b.pyramid(scale(P, 0.40), 176.5, (0, 0, 180.0), 'beige_d')
    beacons(b, [(sx * 12, sy * 16, 172.0) for sx in (-1, 1) for sy in (-1, 1)])
    if b.hi:
        b.band(P, 5.2, 0.8, 1.1, 'beige_l')
        b.portal(P[0], P[1], 0.0, 7.0, 4.2, 'beige_d', 'lobby', dep=0.8, canopy=3.0)


@model('prince_park_tower', 'C', 104.0, face='east', stone=0xb9b0a2,
       desc='53 x 46 m: the oval hotel tower by Shiba Park in pale stone with close-set warm windows, glazed base, sky-lounge band and '
            'a ringed crown')
def prince_park(b):
    std(b)
    T = b.facade(punched('prince_park_hotel', (.74, .70, .64), glass=(.2, .23, .27), bay=2.2, floor=3.3, seed=107, wx=(.18, .82), wy=(.26, .84), blind=.45,
                         blindc=(.78, .72, .60), rough=.6, night=.4, cool=.04, warm=(1.0, .78, .48)))
    b.colours(stone=(.74, .70, .64, .6), stone_l=(.84, .81, .75, .55), stone_d=(.55, .52, .47, .65), roof=(.44, .43, .42), glass=(.2, .24, .28, .2))
    n = b.seg(20, 10)
    P = ngon(26.5, n, ry=23.25, rot=math.pi / n)
    zr = 90.0
    b.ring(scale(P, 0.96), 0, 8.0, 'lobby', smooth=True, thr=40)
    b.ring(P, 8.0, zr, T, smooth=True, thr=40)
    b.cap(P, 8.0, 'stone_l', down=True)
    floorbands(b, P, 8.0, zr, 9.9, 'stone_l', h=0.35, dep=0.4, lo=3)
    b.ring(scale(P, 0.97), zr, 95.0, 'lit', smooth=True, thr=40)
    b.band(P, 95.0, 1.2, 0.8, 'stone_l')
    b.cap(P, 96.2, 'roof')
    b.prism(scale(P, 0.55), 96.2, 101.0, 'stone_d', top='roof')
    b.prism(scale(P, 0.2), 101.0, 104.0, 'stone_l', top='roof')
    beacons(b, [(25, 0, 96.2), (-25, 0, 96.2), (0, 0, 104.0 - 1.1)])
    if b.hi:
        b.band(P, 7.4, 0.7, 0.7, 'stone_l')
        b.band(P, zr - 0.4, 0.6, 0.5, 'stone_l')
        b.fins(P, 8.0, zr, 'stone', n=2, w=0.5, dep=0.3, minlen=1)


if __name__ == '__main__':
    run()
