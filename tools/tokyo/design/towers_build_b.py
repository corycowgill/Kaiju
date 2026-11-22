# Tokyo tier B towers (design-towers). blender -b -P towers_build_b.py -- [ids...] [--norender]
# Plans are drawn to the oriented footprint in tools/tokyo/data/landmark_sites.json (wMetres across the front, dMetres deep).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2


def relief(b, P, z0, z1, mat, fin=3.0, band=8.4, fw=0.3, fd=0.38, bh=0.3, bd=0.42, lo=(5, 4), minlen=6, poly1=None, edges=None):
    """Modelled facade relief: mullion fins and floor ledges."""
    if fin:
        b.fins(P, z0, z1, mat, spacing=fin, w=fw, dep=fd, minlen=minlen, lo=lo[0], poly1=poly1, edges=edges)
    if band:
        floorbands(b, P, z0, z1, band, mat, h=bh, dep=bd, lo=lo[1], edges=edges)


def screen(b, P, z0, z1, mat, inner='steel', t=0.5, rim='white'):
    """Open crown screen: the wall carried up past the roof."""
    Pi = offset(P, -t)
    b.ring(P, z0, z1, mat)
    b.ring(Pi, z0, z1, inner, inward=True)
    for i in range(len(P)):
        j = (i + 1) % len(P)
        b.poly([(*Pi[i], z1), (*P[i], z1), (*P[j], z1), (*Pi[j], z1)], rim)


def bulge(w, d, bx, by, n):
    """Rectangle whose front / back bow out by by and whose sides bow out by bx (n segments a side)."""
    out = []
    for k in range(n):
        t = -1 + 2 * k / n
        out.append((t * w / 2, -d / 2 - by * (1 - t * t)))
    for k in range(n):
        t = -1 + 2 * k / n
        out.append((w / 2 + bx * (1 - t * t), t * d / 2))
    for k in range(n):
        t = -1 + 2 * k / n
        out.append((-t * w / 2, d / 2 + by * (1 - t * t)))
    for k in range(n):
        t = -1 + 2 * k / n
        out.append((-w / 2 - bx * (1 - t * t), -t * d / 2))
    return out


@model('toranomon_hills_station_tower', 'B', 266.0, face='east', stone=0xa7b6bf,
       desc='131 x 84 m glass station podium and the 72 x 58 m rounded tower that swells slightly at mid height, the lit vertical activity band '
            'up the front, projecting sky-lobby box at the crown')
def station_tower(b):
    std(b)
    T = b.facade(curtain('station_tower_glass', (.34, .44, .51), bay=1.6, floor=4.5, seed=51, night=.45, cool=.25))
    b.colours(white=(.80, .82, .84, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), stone=(.70, .70, .68, .7))
    pod = rect(131.5, 84.0)
    b.prism(pod, 0, 28.0, T, top='roof', vfloors=6)
    b.band(pod, 27.4, 1.0, 0.5, 'white', bottom=False)
    b.band(pod, 5.6, 0.6, 1.2, 'white', edges={0})
    cx = -14.0
    seg = b.seg(4, 2)
    prof = [(28, .95), (110, 1.0), (190, .98), (250, .93)]
    P = lambda k: move(rrect(72 * k, 58 * k, 11, seg), cx, 2)
    for (z0, k0), (z1, k1) in zip(prof[:-1], prof[1:]):
        b.ring(P(k0), z0, z1, T, poly1=P(k1), smooth=True)
        b.fins(P(k0), z0, z1, 'white', spacing=3.2, w=0.3, dep=0.4, poly1=P(k1), minlen=9, lo=5)
    floorbands(b, P(1.0), 60, 200, 22.5, 'white', h=0.4, dep=0.6, lo=2)
    b.box(cx - 5.5, cx + 5.5, 2 - 29 - 2.4, 2 - 26, 28, 250.0, 'litc')   # activity band
    if b.hi:
        for sx in (-1, 1):
            b.box(cx + sx * 5.5 - 0.3, cx + sx * 5.5 + 0.3, 2 - 29 - 2.9, 2 - 26, 28, 250.0, 'white')
    top = move(rect(74, 60), cx, 2)
    b.prism(top, 250.0, 262.0, T, top='roof', bottom='white', vfloors=2)
    b.band(top, 261.4, 1.0, 0.5, 'white', bottom=False)
    b.prism(move(rect(40, 30), cx, 2), 262.0, 266.0, 'steel', top='roof')
    beacons(b, [(cx + sx * 36, 2 + sy * 29, 262.4) for sx in (-1, 1) for sy in (-1, 1)])
    if b.hi:
        b.fins(pod, 0, 27.4, 'white', spacing=8.2, w=0.7, dep=0.5, ends=True)
        b.portal(pod[0], pod[1], 20.0, 12.0, 5.2, 'steel', 'lobby', dep=0.8, canopy=3.5)


@model('tokyo_midtown_yaesu', 'B', 240.0, face='west', stone=0xa9bac4,
       desc='77 x 97 m: seven-storey stone-and-glass podium (bus terminal below) and the 77 x 44 m sail-like glass tower with bowed long faces at '
            'the station end, modelled mullions and ledges, glass crown screen')
def yaesu(b):
    std(b)
    T = b.facade(curtain('yaesu_glass', (.36, .47, .55), bay=1.5, floor=4.4, seed=53, night=.45, cool=.2))
    S = b.facade(punched('yaesu_podium', (.72, .71, .68), bay=3.6, floor=5.0, cols=4, rows=8, seed=54, wx=(.1, .9), wy=(.2, .86), mv=2, night=.6))
    b.colours(white=(.80, .82, .84, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), stone=(.72, .71, .68, .7))
    b.glow(screen=(.55, .64, .70, .16, .20, .26, .3))
    pod = rect2(-38.5, 38.5, -40.0, 48.5)
    b.prism(pod, 0, 36.0, S, top='roof', vfloors=7)
    b.band(pod, 35.2, 1.2, 0.5, 'stone', bottom=False)
    n = b.seg(6, 3)
    P = move(bulge(74.0, 36.0, 0.6, 4.0, n), 0, -22.5)
    zr = 226.0
    b.ring(P, 0, zr, T, smooth=True, thr=30)
    b.cap(P, zr, 'roof')
    relief(b, P, 7, zr, 'white', fin=3.0, band=13.2, minlen=4)
    screen(b, P, zr, 240.0, 'screen')
    b.prism(scale(P, 0.6, 0.6, about=(0, -22.5)), zr, 234.0, 'steel', top='roof')
    beacons(b, [(-36, -22.5, 240.0 - 1.1), (36, -22.5, 240.0 - 1.1)])
    if b.hi:
        b.band(P, 6.2, 0.8, 1.0, 'white', edges=set(range(n)))
        b.fins(pod, 0, 35.2, 'stone', spacing=7.2, w=0.9, dep=0.4, ends=True, edges={1, 2, 3})
        b.portal(P[n // 2 - 1], P[n // 2 + 1], 0.0, 10.0, 5.0, 'steel', 'lobby', dep=0.8, canopy=3.2)


@model('tokiwabashi_tower', 'B', 212.0, face='south', stone=0xb9c0c4,
       desc='55 x 78 m glass tower in three stacked volumes nudged past one another, dense white vertical fins modelled, glazed double-height '
            'base and a fin-screened crown')
def tokiwabashi(b):
    std(b)
    T = b.facade(curtain('tokiwabashi_glass', (.33, .42, .49), bay=1.5, floor=4.4, seed=55, night=.5))
    b.colours(white=(.83, .84, .85, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2))
    W, D = 51.5, 74.0
    vols = [(9.0, 74.0, -1.6, 0.0), (74.0, 140.0, 1.6, 0.0), (140.0, 203.0, -1.6, 0.0)]
    for z0, z1, dx, dy in vols:
        P = rect(W, D, dx, dy)
        b.prism(P, z0, z1, T, top='roof', bottom='white')
        b.fins(P, z0, z1 + (5.0 if z1 > 200 else 0.0), 'white', spacing=2.6, w=0.35, dep=0.5, ends=True, lo=6, top=z1 > 200)
        b.band(P, z1 - 0.5, 0.9, 0.55, 'white')
    b.ring(rect(W - 6, D - 6), 0, 9.0, 'lobby')
    b.prism(rect(W - 10, D - 12, -1.6, 0), 203.0, 212.0, 'steel', top='roof')
    beacons(b, [(sx * 25 - 1.6, sy * 36, 208.0) for sx in (-1, 1) for sy in (-1, 1)])
    if b.hi:
        b.fins(rect(W - 6, D - 6), 0, 9.0, 'white', spacing=7.5, w=1.0, dep=2.0, ends=True)
        b.portal(rect(W - 6, D - 6)[0], rect(W - 6, D - 6)[1], 0.0, 9.0, 5.0, 'steel', 'glass', dep=1.0, canopy=3.5)


@model('shin_marunouchi_building', 'B', 198.0, face='east', stone=0xa89f90,
       desc='80 x 99 m: brown-grey stone podium to the old 31 m line with a ground arcade, and the tower in two glass halves of unequal height '
            'either side of a slot, stone ribs modelled, lit glass lanterns on top')
def shin_marunouchi(b):
    std(b)
    S = b.facade(punched('shin_maru_stone', (.62, .57, .50), bay=3.3, floor=4.4, cols=4, rows=8, seed=57, wx=(.18, .82), wy=(.2, .86), mv=1, course=3, rough=.75, night=.55))
    T = b.facade(curtain('shin_maru_glass', (.31, .38, .43), wall=(.66, .63, .58), bay=1.65, floor=4.3, seed=58, pier=(.14, (.68, .65, .60)), night=.5))
    b.colours(stone=(.62, .57, .50, .75), stone_l=(.74, .70, .63, .7), roof=(.45, .45, .44), glass=(.2, .24, .28, .2), dark=(.24, .28, .32, .25), steel=(.6, .61, .62, .4))
    pod = rect(80.0, 99.0)
    zp = 31.0
    b.prism(pod, 6.0, zp, S, top='roof', vfloors=6)
    b.ring(offset(pod, -2.5), 0, 6.0, 'lobby')
    b.cap(pod, 6.0, 'stone', down=True)
    b.band(pod, zp - 0.6, 1.4, 0.8, 'stone_l')
    b.fins(pod, 0, 6.0, 'stone', spacing=6.6, w=1.3, dep=0.0, back=2.5, ends=True, lo=2)
    b.fins(pod, 6.0, zp - 0.6, 'stone', spacing=3.3, w=0.8, dep=0.4, ends=True, lo=8)
    y0, y1 = -36.0, 42.0
    for W, zt in ((rect2(-34, -3.5, y0, y1), 190.0), (rect2(3.5, 34, y0, y1), 178.0)):
        b.prism(W, zp, zt, T, top='roof')
        b.fins(W, zp, zt, 'stone', spacing=2.2, w=0.5, dep=0.5, ends=True, lo=12)
        floorbands(b, W, zp, zt, 12.9, 'stone_l', h=0.4, dep=0.55, lo=3)
        b.band(W, zt, 1.0, 0.6, 'stone_l')
        L = offset(W, -2.5)
        b.prism(L, zt, zt + 8.0, 'litc', top='roof')
        b.band(L, zt + 7.4, 0.6, 0.4, 'steel', bottom=False)
        beacons(b, [(L[0][0] + 1, L[0][1] + 1, zt + 8.0 - (1.1 if zt > 185 else 0)), (L[2][0] - 1, L[2][1] - 1, zt + 8.0 - (1.1 if zt > 185 else 0))])
    b.prism(rect2(-3.5, 3.5, y0 + 5, y1 - 5), zp, 184.0, 'dark', top='roof')


@model('jp_tower_kitte', 'B', 200.0, face='north', stone=0xd8d6cf,
       desc='128 x 88 m: the preserved white 1931 Central Post Office front (five storeys of gridded windows, splayed corner, clock) wrapped round '
            'the podium, and the folded clear-glass tower slab rising behind it')
def jp_tower(b):
    std(b)
    S = b.facade(punched('kitte_white', (.84, .84, .81), glass=(.2, .24, .28), bay=3.4, floor=4.3, cols=4, rows=5, size=(256, 256), seed=59, wx=(.16, .84),
                         wy=(.16, .86), mv=2, mh=2, frame=(.3, .32, .34), rough=.5, night=.6))
    T = b.facade(curtain('jp_tower_glass', (.38, .49, .56), bay=1.5, floor=4.3, seed=60, night=.45, cool=.25))
    b.colours(white=(.86, .86, .83, .5), white_d=(.70, .70, .68, .6), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), dark=(.2, .2, .21, .5))
    b.glow(clock=(.85, .84, .78, .75, .70, .55, .5))
    pod = [(-64, -20.0), (-38, -44.25), (64, -44.25), (64, 44.25), (-64, 44.25)]
    zp = 22.0
    b.prism(pod, 0, zp, S, top='roof', vfloors=5)
    b.band(pod, zp - 0.3, 1.0, 0.5, 'white', bottom=False)
    b.band(pod, 0, 1.0, 0.25, 'white_d', bottom=False)
    b.attach(pod[1], pod[2], -8.0, 8.0, zp, zp + 2.6, 0.0, 'white', back=1.2)
    b.attach(pod[1], pod[2], -2.2, 2.2, zp - 3.6, zp + 0.8, 0.25, 'clock')
    b.fins(pod, 1.0, zp - 0.3, 'white', spacing=3.4, w=0.8, dep=0.3, ends=True, lo=6, edges={0, 1, 2, 4})
    # tower: a slab folded once along the front
    tw = [(-50, -8.0), (4, -13.0), (58, -8.0), (58, 34.0), (-50, 34.0)]
    zr = 190.0
    b.ring(tw, zp, zr, T)
    b.cap(tw, zr, 'roof')
    relief(b, tw, zp, zr, 'white', fin=2.0, band=8.6, lo=(8, 4))
    screen(b, tw, zr, 200.0, T, inner='steel', rim='white')
    beacons(b, [(-49, -7, 198.9), (57, -7, 198.9), (57, 33, 198.9), (-49, 33, 198.9)])
    if b.hi:
        b.portal(pod[1], pod[2], 0.0, 8.0, 5.0, 'dark', 'lobby', dep=0.5, canopy=2.4)
        b.portal(pod[0], pod[1], 0.0, 6.0, 5.0, 'dark', 'lobby', dep=0.5)
        b.prism(rect(40, 20, 4, 12), zr, 195.0, 'steel', top='roof')


@model('gran_tokyo', 'B', 205.0, face='east', stone=0xb5c6cf, ids=['gran_tokyo_north', 'gran_tokyo_south'], fit=False,
       desc='46 x 76 m crisp clear-glass slab (one model for the North and South towers; drawn to the South tower outline, the North site box '
            'includes its department-store podium): fine modelled mullions, glazed lobby, the tall translucent glass crown screen')
def gran_tokyo(b):
    std(b)
    T = b.facade(curtain('gran_tokyo_glass', (.40, .52, .60), wall=(.80, .83, .85), bay=1.5, floor=4.4, seed=61, wy=(.14, .98), night=.5, cool=.3))
    b.colours(white=(.84, .86, .88, .35), roof=(.45, .46, .47), steel=(.62, .64, .66, .4, .3), glass=(.22, .28, .33, .2))
    b.glow(screen=(.62, .72, .78, .22, .28, .34, .25))
    P = rect(45.0, 75.0)
    zr = 190.0
    b.ring(offset(P, -1.5), 0, 12.0, 'lobby')
    b.prism(P, 12.0, zr, T, top='roof', bottom='white')
    relief(b, P, 12.0, zr, 'white', fin=1.5, band=8.8, fw=0.2, fd=0.45, lo=(8, 5))
    screen(b, P, zr, 205.0, 'screen', inner='screen', t=0.35)
    b.prism(rect(30, 56), zr, 198.0, 'steel', top='roof')
    b.fins(P, zr, 205.0, 'white', spacing=4.5, w=0.22, dep=0.45, lo=3)
    b.band(P, 11.2, 0.9, 0.5, 'white')
    beacons(b, [(sx * 22, sy * 37, 203.9) for sx in (-1, 1) for sy in (-1, 1)], s=1.1)
    if b.hi:
        b.fins(offset(P, -1.5), 0, 11.2, 'white', spacing=7.5, w=0.8, dep=1.5, ends=True)
        b.portal(offset(P, -1.5)[0], offset(P, -1.5)[1], 0.0, 9.0, 5.5, 'steel', 'glass', dep=1.2, canopy=3.5)


@model('tokyo_midtown_hibiya', 'B', 192.0, face='west', stone=0xb7b3a8,
       desc="100 x 81 m: stone podium with the rounded park corner, and the 'dancing tower': a glass shaft whose corners soften and whose "
            'parapet rises and falls in a slow curve, modelled mullions')
def hibiya(b):
    std(b)
    S = b.facade(punched('hibiya_podium', (.74, .71, .65), bay=3.4, floor=5.0, cols=4, rows=8, seed=63, wx=(.12, .88), wy=(.2, .86), mv=2, course=2, night=.65))
    T = b.facade(curtain('hibiya_glass', (.35, .45, .52), bay=1.5, floor=4.4, seed=64, night=.45, cool=.2))
    b.colours(white=(.80, .82, .84, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), stone=(.74, .71, .65, .7))
    seg = b.seg(4, 2)
    pod = rrect(100.0, 81.0, 16.0, seg)
    b.prism(pod, 0, 35.0, S, top='roof', vfloors=7, smooth=True)
    b.band(pod, 34.2, 1.2, 0.6, 'stone', bottom=False)
    cx, cy = 6.0, 4.0
    prof = [(35, 5.0, 1.0), (95, 9.0, 1.0), (150, 15.0, .985), (184, 21.0, .96)]
    P = lambda r, k: move(rrect(76 * k, 56 * k, r, seg), cx, cy)
    for (z0, r0, k0), (z1, r1, k1) in zip(prof[:-1], prof[1:]):
        b.ring(P(r0, k0), z0, z1, T, poly1=P(r1, k1), smooth=True)
        b.fins(P(r0, k0), z0, z1, 'white', spacing=3.0, w=0.3, dep=0.4, poly1=P(r1, k1), minlen=8, lo=5)
    top = P(21.0, .96)
    zs = [188.0 + 4.0 * math.sin(math.atan2(p[1] - cy, p[0] - cx) * 2 + 0.6) for p in top]
    zs = [z + 192.0 - max(zs) for z in zs]
    b.ring(top, 184.0, None, T, z1s=zs, smooth=False)
    b.ring(offset(top, -0.5), 180.0, None, 'steel', z1s=zs, inward=True)
    b.cap(offset(top, -0.5), 184.0, 'roof')
    floorbands(b, P(9.0, 1.0), 50, 180, 26.4, 'white', h=0.35, dep=0.5, lo=2)
    b.prism(move(rect(40, 26), cx, cy), 184.0, 189.0, 'steel', top='roof')
    beacons(b, [(cx - 30, cy, 186.5), (cx + 30, cy, 186.5)])
    if b.hi:
        b.fins(pod, 0, 34.2, 'stone', spacing=6.8, w=0.9, dep=0.4, minlen=12, ends=True)
        b.portal(pod[seg], pod[seg + 1], 0.0, 10.0, 6.0, 'steel', 'lobby', dep=0.7, canopy=3.2)
        b.band(pod, 6.4, 0.6, 0.5, 'stone')


@model('nittele_tower', 'B', 193.0, face='northeast', stone=0x8f979d,
       desc='35 x 105 m: the Rogers tower with its exposed mega-frame (outboard steel megacolumns and storey-high X-bracing on both long sides, '
            'belt trusses), glass lift front, roof plant and lattice mast, the low studio wing behind')
def nittele(b):
    std(b)
    T = b.facade(curtain('nittele_glass', (.30, .37, .43), wall=(.62, .64, .66), bay=1.6, floor=4.2, seed=65, wy=(.3, .95), night=.55, cool=.3))
    b.colours(steel=(.56, .58, .61, .4, .5), steel_d=(.40, .42, .45, .45, .4), roof=(.42, .43, .44), glass=(.2, .25, .3, .2), white=(.78, .79, .80, .4), mast=(.82, .82, .82, .5))
    b.glow(mlit=(.78, .40, .30, .42, .12, .08, .5))
    y0, y1 = -52.5, 12.0
    body = rect2(-14.5, 14.5, y0 + 2.5, y1)
    zr = 166.0
    b.prism(body, 0, zr, T, top='roof')
    floorbands(b, body, 0, zr, 4.2, 'steel', h=0.3, dep=0.3, lo=8)
    levels = lin(0, zr, b.seg(6, 3))
    ys = lin(y0 + 4.0, y1 - 1.5, b.seg(3, 2))
    for sx in (-1, 1):
        x = sx * 16.1
        for y in ys:
            b.cbox(x, y, 2.8, 2.8, 0, zr + 3.0, 'steel')
        for z in levels[1:]:
            b.box(x - 0.9, x + 0.9, ys[0], ys[-1], z - 1.2, z + 1.2, 'steel', bottom=True)
        for (za, zb) in zip(levels[:-1], levels[1:]):
            for ya, yb in zip(ys[:-1], ys[1:]):
                b.beam((x, ya + 1.4, za + 1.2), (x, yb - 1.4, zb - 1.2), 1.1, 'steel_d')
                if b.hi:
                    b.beam((x, yb - 1.4, za + 1.2), (x, ya + 1.4, zb - 1.2), 1.1, 'steel_d')
    # glass lifts on the front, roof plant, mast
    for x in ((-8, 0, 8) if b.hi else (0,)):
        b.box(x - 2.4, x + 2.4, y0, y0 + 2.5, 0, zr - 6.0, 'litc' if b.hi else 'dim')
    if b.hi:
        for x in (-12, -4, 4, 12):
            b.box(x - 0.4, x + 0.4, y0 - 0.2, y0 + 2.5, 0, zr, 'steel')
        relief(b, body, 0, zr, 'steel', fin=1.6, band=0, edges={1, 2, 3})
    b.prism(rect2(-12, 12, y0 + 8, y1 - 4), zr, 176.0, 'steel_d', top='roof')
    mz = lin(176, 190, b.seg(3, 1))
    for za, zb in zip(mz[:-1], mz[1:]):
        for k in range(4):
            c, s = [(1, 0), (0, 1), (-1, 0), (0, -1)][k]
            R = lambda x, y, z: (x * c - y * s, x * s + y * c - 20.0, z)
            b.qlat(R(-2.5, -2.5, za), R(2.5, -2.5, za), R(-2.5, -2.5, zb), R(2.5, -2.5, zb), 1, 'mlit', w=0.5)
            b.beam(R(2.5, -2.5, za), R(2.5, -2.5, zb), 0.6, 'mlit')
    b.cyl(0, -20, 0.4, 190, 193.0, 5, 'mast')
    beacons(b, [(0, -20, 189.0), (-16, y0 + 4, zr + 3.0), (16, y0 + 4, zr + 3.0), (-16, y1 - 1.5, zr + 3.0), (16, y1 - 1.5, zr + 3.0)])
    wing = rect2(-17.5, 17.5, y1, 52.5)
    b.prism(wing, 0, 32.0, T, top='roof', skip={0})
    b.band(wing, 31.2, 1.0, 0.0, 'steel', bottom=False, top=False)
    if b.hi:
        b.cbox(0, 34, 18, 16, 32.0, 36.0, 'steel_d')
        b.portal((-14.5, y0), (14.5, y0), 0.0, 7.0, 4.6, 'steel_d', 'lobby', dep=0.6, canopy=3.0)


@model('shiodome_city_center', 'B', 216.0, face='west', stone=0x7fa99a,
       desc='92 x 52 m green-glass sail: one long face a continuous convex curve, flat back, the roof line sloping along its length, '
            'modelled ledges and mullions, recessed glass lobby')
def city_center(b):
    std(b)
    T = b.facade(curtain('city_center_glass', (.28, .47, .43), wall=(.62, .72, .68), bay=1.5, floor=4.3, seed=67, night=.5, cool=.2))
    b.colours(white=(.74, .80, .78, .4), roof=(.42, .45, .44), steel=(.55, .6, .58, .4, .3), glass=(.18, .30, .28, .2))
    n = b.seg(12, 5)
    front = [(-46 + 92 * i / n, -52.5 * (1 - (2 * i / n - 1) ** 2)) for i in range(n + 1)]
    front = [(x, 26.25 + y) for x, y in front]   # arc from the back corners bowing to the front
    P = front + [(46, 26.25), (-46, 26.25)]
    P = dedupe(P)
    zc = 196.0
    b.ring(offset(P, -1.0), 0, 8.0, 'lobby')
    b.ring(P, 8.0, zc, T, smooth=True, thr=35)
    b.cap(P, 8.0, 'white', down=True)
    hf = lambda p: 216.0 - (46 - p[0]) * 0.16
    slope_crown(b, P, zc, hf, T, 'roof')
    floorbands(b, P, 8.0, zc, 8.6, 'white', h=0.3, dep=0.4, lo=6)
    b.fins(P, 8.0, zc, 'white', spacing=3.0, w=0.3, dep=0.35, minlen=20, lo=6)
    if b.hi:
        b.fins(P, 8.0, zc, 'white', n=3, w=0.3, dep=0.35, minlen=1, edges=set(range(n)))
        b.fins(offset(P, -1.0), 0, 8.0, 'white', n=1, w=0.7, dep=0.9, ends=True, edges=set(range(n)))
        b.portal((-10, 26.25 - 1.0), (-30, 26.25 - 1.0), 0.0, 8.0, 5.0, 'steel', 'glass', dep=0.8, canopy=3.0)
    beacons(b, [(45, 25, 216.0 - 1.1 - 0.2), (-45, 25, hf((-45, 0)) - 0.2), (0, -25, hf((0, 0)) - 0.4)])


@model('kasumigaseki_building', 'B', 147.0, face='northeast', stone=0xb8bcc0,
       desc="43 x 83 m gridded slab, Japan's first skyscraper (1968): aluminium mullions on every bay modelled over dark glass and spandrels, "
            'recessed columned lobby, louvred plant crown')
def kasumigaseki(b):
    std(b)
    T = b.facade(curtain('kasumigaseki_grid', (.20, .24, .29), wall=(.66, .68, .70), bay=1.6, floor=3.9, seed=69, wy=(.36, .92), wx=(.1, .9), spandrel=(.36, .39, .43),
                         rough=.4, night=.55, cool=.25))
    b.colours(alu=(.74, .76, .78, .35, .4), alu_d=(.5, .52, .55, .45, .3), roof=(.44, .45, .46), glass=(.2, .24, .28, .2), stone=(.68, .68, .66, .7))
    P = rect(43.0, 83.0)
    zr = 138.0
    b.ring(offset(P, -2.6), 0, 8.5, 'lobby')
    b.prism(P, 8.5, zr, T, top='roof', bottom='alu_d')
    b.fins(P, 8.5, zr, 'alu', spacing=1.6, w=0.3, dep=0.5, ends=True, lo=8)
    floorbands(b, P, 8.5, zr, 11.7, 'alu', h=0.3, dep=0.3, lo=3)
    b.band(P, zr - 0.2, 1.2, 0.6, 'alu')
    C = offset(P, -2.0)
    b.prism(C, zr, 147.0, 'alu_d', top='roof')
    b.fins(C, zr, 147.0, 'alu', spacing=3.2, w=0.5, dep=0.35, ends=True, lo=5)
    b.fins(offset(P, -2.6), 0, 8.5, 'stone', spacing=6.4, w=1.2, dep=2.6, ends=True, lo=3)
    b.band(P, 7.9, 0.9, 0.5, 'alu')
    beacons(b, [(sx * 19, sy * 39, 147.0 - 1.1) for sx in (-1.07, 1.07) for sy in (-1.03, 1.03)])
    if b.hi:
        b.portal(offset(P, -2.6)[0], offset(P, -2.6)[1], 0.0, 8.0, 4.6, 'alu_d', 'glass', dep=1.0, canopy=3.0)


@model('izumi_garden_tower', 'B', 201.0, face='north', stone=0x8fb0a8,
       desc='71 x 100 m: green-glass tower with exposed steel corner megacolumns and outside glass lifts on the front, the top stepping back '
            'in sloped glass terraces, over the terraced garden podium')
def izumi(b):
    std(b)
    T = b.facade(curtain('izumi_glass', (.27, .44, .42), wall=(.60, .70, .68), bay=1.6, floor=4.3, seed=71, night=.5, cool=.25))
    b.colours(steel=(.70, .73, .74, .4, .4), steel_d=(.45, .48, .5, .45, .3), roof=(.42, .45, .44), glass=(.18, .29, .28, .2), green=(.25, .38, .20, .9),
              stone=(.68, .68, .65, .75), white=(.76, .80, .79, .4))
    x0, x1, y0 = -26.0, 26.0, -50.25 + 4.0
    steps = [(0.0, 150.0, 56.0), (150.0, 168.0, 44.0), (168.0, 184.0, 32.0), (184.0, 197.0, 20.0)]
    prev = None
    for z0, z1, dep in steps:
        P = rect2(x0, x1, y0, y0 + dep)
        b.ring(P, z0, z1, T)
        if prev:   # sloped glass over the step
            b.poly([(x0, y0 + dep, z1 - 4), (x1, y0 + dep, z1 - 4), (x1, y0 + prev, z0), (x0, y0 + prev, z0)], T)
            for x in (x0, x1):
                b.poly([(x, y0 + dep, z0), (x, y0 + prev, z0), (x, y0 + dep, z1 - 4)][::(1 if x > 0 else -1)], 'steel_d')
        relief(b, P, max(z0, 9.0), z1, 'white', fin=2.0, band=4.3, lo=(8, 6), edges={0, 1, 3} if z0 else None)
        prev = dep
    b.cap(rect2(x0, x1, y0, y0 + 20.0), 197.0, 'roof')
    b.prism(rect2(x0 + 6, x1 - 6, y0 + 3, y0 + 16), 197.0, 201.0, 'steel_d', top='roof')
    for sx in (-1, 1):   # megacolumns
        for y in (y0 - 0.6, y0 + 56.6):
            b.cbox(sx * 26.8, y, 3.0, 3.0, 0, 150.0 if y > y0 else 199.0, 'steel')
    for x in ((-9, 0, 9) if b.hi else (0,)):   # outside lifts
        b.box(x - 2.6, x + 2.6, y0 - 3.4, y0, 0, 186.0, 'litc' if b.hi else 'dim')
    if b.hi:
        for x in (-13.5, -4.5, 4.5, 13.5):
            b.box(x - 0.35, x + 0.35, y0 - 3.8, y0, 0, 190.0, 'steel')
        b.band(rect2(x0, x1, y0, y0 + 56), 8.4, 0.7, 0.6, 'steel')
    beacons(b, [(x0 + 1, y0 + 1, 197.0), (x1 - 1, y0 + 1, 197.0), (0, y0 + 9, 201.0 - 1.1)])
    # garden podium stepping down behind and beside the tower
    for (bx0, bx1, by0, by1, h) in ((-35.5, 35.5, y0 + 20, 20.0, 22.0), (-35.5, 35.5, 20.0, 36.0, 14.0), (-35.5, 20.0, 36.0, 50.25, 7.0), (-35.5, 35.5, -50.25, y0 + 20, 6.0)):
        b.prism(rect2(bx0, bx1, by0, by1), 0, h, 'stone', top='green')
        if b.hi:
            b.band(rect2(bx0, bx1, by0, by1), h - 0.2, 1.0, 0.3, 'stone', bottom=False)
            b.attach((bx1, by0), (bx1, by1), 0.1, 0.9, 1.0, h - 2.0, 0.12, 'lobby', frac=True, top=False, bottom=False)


@model('atago_green_hills_mori_tower', 'B', 187.0, face='east', stone=0xa8b5ba,
       desc='52 x 46 m Pelli office tower: bowed glass faces between notched corners, modelled mullions and ledges, and the crown where the four '
            'faces run on past the roof as separate curved petals')
def atago(b):
    std(b)
    T = b.facade(curtain('atago_glass', (.33, .43, .49), wall=(.74, .77, .78), bay=1.5, floor=4.2, seed=73, night=.5))
    b.colours(white=(.80, .82, .83, .4), roof=(.44, .45, .46), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .32, .2), inner=(.5, .54, .57, .5), stone=(.72, .71, .68, .7))
    n = b.seg(5, 2)
    W, D, c = 44.0, 37.5, 3.6

    def faces(k=1.0, flare=0.0):
        out = []
        for (a, e, nrm) in (((-W / 2 + c, -D / 2), (W / 2 - c, -D / 2), (0, -1)), ((W / 2, -D / 2 + c), (W / 2, D / 2 - c), (1, 0)),
                            ((W / 2 - c, D / 2), (-W / 2 + c, D / 2), (0, 1)), ((-W / 2, D / 2 - c), (-W / 2, -D / 2 + c), (-1, 0))):
            f = []
            for i in range(n + 1):
                t = i / n
                bow = 3.4 * (1 - (2 * t - 1) ** 2) + flare
                f.append(((a[0] + (e[0] - a[0]) * t) * k + nrm[0] * bow, (a[1] + (e[1] - a[1]) * t) * k + nrm[1] * bow))
            out.append(f)
        return out
    F = faces()
    P = [p for f in F for p in f]
    zr = 172.0
    b.ring(offset(P, -1.0), 0, 9.0, 'lobby')
    b.ring(P, 9.0, zr, T, smooth=True, thr=40)
    b.cap(P, 9.0, 'white', down=True)
    b.cap(P, zr, 'roof')
    floorbands(b, P, 9.0, zr, 12.6, 'white', h=0.3, dep=0.4, lo=4)
    face_edges = {i for i in range(len(P)) if i % (n + 1) != n}
    b.fins(P, 9.0, zr, 'white', n=b.seg(3, 1) + 1, w=0.28, dep=0.38, minlen=1, edges=face_edges, lo=1)
    for f0, f1 in zip(F, faces(1.0, 1.4)):   # petals
        b.ring(f0, zr, 187.0, T, poly1=f1, closed=False, smooth=True, thr=40)
        i0, i1 = [(p[0] * 0.975, p[1] * 0.975) for p in f0], [(p[0] * 0.975, p[1] * 0.975) for p in f1]
        b.ring(i0, zr, 187.0, 'inner', poly1=i1, closed=False, inward=True)
        for i in range(n):
            b.poly([(*i1[i], 187.0), (*f1[i], 187.0), (*f1[i + 1], 187.0), (*i1[i + 1], 187.0)], 'white')
        for e in (0, -1):
            b.poly([(*f0[e], zr), (*i0[e], zr), (*i1[e], 187.0), (*f1[e], 187.0)], 'white')
    b.prism(rect(26, 22), zr, 181.0, 'steel', top='roof')
    beacons(b, [(0, -D / 2 - 3.6, 187.0 - 1.4), (0, D / 2 + 3.6, 187.0 - 1.4), (W / 2 + 3.6, 0, 187.0 - 1.4), (-W / 2 - 3.6, 0, 187.0 - 1.4)], s=1.2)
    if b.hi:
        b.band(P, 8.2, 0.9, 0.8, 'white')
        b.portal(offset(P, -1.0)[n // 2], offset(P, -1.0)[n // 2 + 1], 0.0, 7.0, 5.0, 'steel', 'glass', dep=0.8, canopy=3.0)


@model('world_trade_center_hamamatsucho', 'B', 235.0, face='east', stone=0xaebbc4,
       desc='66 x 34 m glass slab of the new World Trade Center south tower: three stacked office zones between dark plant bands, white framed '
            'edges and modelled mullions, an open framed crown')
def wtc(b):
    std(b)
    T = b.facade(curtain('wtc_glass', (.34, .44, .52), bay=1.5, floor=4.4, seed=75, night=.5, cool=.2))
    b.colours(white=(.82, .83, .84, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), dark=(.26, .28, .31, .5))
    P = rect(65.0, 33.0)
    zr = 222.0
    b.ring(offset(P, -1.2), 0, 10.0, 'lobby')
    zones = [(10.0, 78.0), (83.0, 152.0), (157.0, zr)]
    for z0, z1 in zones:
        b.ring(P, z0, z1, T)
        relief(b, P, z0, z1, 'white', fin=2.5, band=13.2, lo=(6, 3))
        b.band(P, z1 - 0.4, 0.8, 0.6, 'white')
    for z in (78.0, 152.0):
        b.ring(offset(P, -0.6), z, z + 5.0, 'dark')
    b.cap(P, 10.0, 'white', down=True)
    b.cap(P, zr, 'roof')
    b.fins(P, 10.0, 235.0, 'white', n=1, w=1.6, dep=0.7, ends=True, top=True, lo=1)
    screen(b, P, zr, 235.0, T, inner='steel')
    b.prism(rect(48, 20), zr, 229.0, 'steel', top='roof')
    beacons(b, [(sx * 32, sy * 16, 235.0 - 1.1) for sx in (-1.03, 1.03) for sy in (-1.06, 1.06)])
    if b.hi:
        b.fins(offset(P, -1.2), 0, 10.0, 'white', spacing=8.0, w=1.0, dep=1.2, ends=True)
        b.portal(offset(P, -1.2)[0], offset(P, -1.2)[1], 0.0, 9.0, 5.0, 'steel', 'glass', dep=1.0, canopy=3.0)


@model('tokyo_port_city_takeshiba', 'B', 208.0, face='southeast', stone=0xa5b3b6,
       desc='141 x 105 m: glass office tower with white ledges over a broad podium whose corner steps down in planted terraces (the green '
            "'skip terrace'), pedestrian deck canopy on the front")
def port_city(b):
    std(b)
    T = b.facade(curtain('port_city_glass', (.33, .43, .50), bay=1.6, floor=4.3, seed=77, night=.5, cool=.2))
    S = b.facade(punched('port_city_podium', (.74, .74, .71), bay=3.6, floor=4.6, cols=4, rows=8, seed=78, wx=(.08, .92), wy=(.2, .86), mv=2, night=.65))
    b.colours(white=(.82, .83, .83, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), green=(.24, .40, .20, .9), deck=(.62, .58, .50, .8))
    pod = rect2(-70.75, 70.75, -30.0, 52.5)
    b.prism(pod, 0, 30.0, S, top='roof', vfloors=6)
    b.band(pod, 29.4, 1.0, 0.4, 'white', bottom=False)
    tw = rect2(-62.0, 22.0, -10.0, 42.0)
    zr = 198.0
    b.prism(tw, 30.0, zr, T, top='roof')
    relief(b, tw, 30.0, zr, 'white', fin=2.0, band=4.3, bd=0.6, lo=(8, 6))
    screen(b, tw, zr, 208.0, T, inner='steel')
    b.prism(offset(tw, -8), zr, 204.0, 'steel', top='roof')
    beacons(b, [(tw[0][0] + 1, tw[0][1] + 1, 206.9), (tw[2][0] - 1, tw[2][1] - 1, 206.9), (tw[1][0] - 1, tw[1][1] + 1, 206.9), (tw[3][0] + 1, tw[3][1] - 1, 206.9)])
    # the skip terrace: planted steps down the front
    nst = 6
    for i in range(nst):
        ya, yb = -52.5 + 22.5 * i / nst, -52.5 + 22.5 * (i + 1) / nst
        h = 30.0 * (i + 1) / (nst + 0.5)
        b.box(-40.0, 70.75, ya, -30.0, h - 30.0 / (nst + 0.5), h, 'deck', top=False)
        b.poly([(-40.0, ya, h), (70.75, ya, h), (70.75, yb, h), (-40.0, yb, h)], 'green')
        if b.hi:
            b.box(-40.0, 70.75, ya, ya + 0.5, h, h + 1.1, 'white')
    b.box(-70.75, -40.0, -52.5, -30.0, 0, 8.0, 'deck')
    if b.hi:
        b.fins(pod, 0, 29.4, 'white', spacing=3.6, w=0.7, dep=0.4, ends=True, edges={1, 2, 3})
        b.attach((-70.75, -52.5), (-40.0, -52.5), 0.1, 0.9, 1.0, 6.5, 0.15, 'lobby', frac=True, top=False, bottom=False)


@model('st_lukes_tower', 'B', 221.0, face='east', stone=0xc4a999,
       desc="66 x 132 m: St. Luke's Garden twin towers in rose-beige tile: the chamfered 46 m office tower with its stepped lantern and mast, "
            'the lower residence tower, the skybridge between them at mid height, garden podium')
def st_lukes(b):
    std(b)
    T = b.facade(punched('st_lukes_tile', (.72, .60, .54), glass=(.2, .23, .27), bay=1.7, floor=3.9, seed=79, wx=(.12, .88), wy=(.32, .86), spandrel=(.58, .47, .42),
                         frame=(.4, .34, .31), rough=.55, night=.42))
    b.colours(tile=(.72, .60, .54, .6), tile_l=(.80, .70, .64, .55), tile_d=(.55, .45, .41, .65), roof=(.44, .43, .42), glass=(.2, .23, .27, .2), steel=(.62, .62, .62, .4),
              green=(.26, .40, .22, .9), mast=(.84, .84, .82, .5))
    pod = rect(66.5, 132.5)
    b.prism(pod, 0, 12.0, T, top='green', vfloors=3)
    b.band(pod, 11.4, 0.9, 0.4, 'tile_l', bottom=False)
    ya, yb = -40.0, 43.0
    A = lambda k: chamfer(46 * k, 46 * k, 8 * k, 0, ya)
    Bp = chamfer(40, 40, 7, 0, yb)
    b.prism(A(1), 12.0, 186.0, T, top='roof')
    b.fins(A(1), 12.0, 186.0, 'tile', spacing=3.4, w=0.7, dep=0.45, ends=True, minlen=5, lo=8)
    floorbands(b, A(1), 12.0, 186.0, 7.8, 'tile_l', h=0.35, dep=0.4, lo=6)
    for k, z0, z1 in ((0.84, 186.0, 196.0), (0.62, 196.0, 204.0), (0.36, 204.0, 210.0)):
        b.prism(A(k), z0, z1, T if k > 0.5 else 'lit', top='roof')
        b.band(A(k), z1 - 0.4, 0.8, 0.4, 'tile_l')
    b.prism(rect(2.4, 2.4, 0, ya), 210.0, 216.0, 'mast', top='mast', poly1=rect(1.0, 1.0, 0, ya))
    b.cyl(0, ya, 0.3, 216.0, 221.0, 5, 'mast')
    beacons(b, [(0, ya, 216.0)] + [(sx * 22, ya + sy * 22 * 0.6, 186.4) for sx in (-1, 1) for sy in (-1, 1)])
    b.prism(Bp, 12.0, 140.0, T, top='roof')
    b.fins(Bp, 12.0, 140.0, 'tile', spacing=3.4, w=0.7, dep=0.45, ends=True, minlen=5, lo=8)
    floorbands(b, Bp, 12.0, 140.0, 7.8, 'tile_l', h=0.35, dep=0.4, lo=6)
    b.prism(scale(Bp, 0.7, 0.7, about=(0, yb)), 140.0, 146.0, 'tile_d', top='roof')
    br = rect2(-4.0, 4.0, ya + 22, yb - 19)
    b.prism(br, 106.0, 113.0, 'tile_l', top='roof', bottom='tile_d', only={1, 3})
    if b.hi:
        for s in (1, 3):
            a, c = br[s], br[(s + 1) % 4]
            b.attach(a, c, 0.04, 0.96, 108.0, 111.4, 0.12, 'lit', frac=True, top=False, bottom=False)
        b.portal(pod[0], pod[1], 0.0, 8.0, 5.0, 'tile_d', 'lobby', dep=0.6, canopy=3.0)
        b.band(A(1), 185.4, 1.0, 0.5, 'tile_l')
        b.band(Bp, 139.4, 1.0, 0.5, 'tile_l')


@model('the_tokyo_towers', 'B', 194.0, face='southwest', stone=0xb9a995, ids=['the_tokyo_towers_sea', 'the_tokyo_towers_mid'],
       desc='66 x 67 m 58-storey condominium tower (one model for the Sea and Mid towers): chamfered square in warm beige with continuous '
            'balcony ledges modelled on every third floor, glazed corners, and the open ring frame of the crown')
def tokyo_towers(b):
    std(b)
    T = b.facade(punched('tokyo_towers_resi', (.70, .64, .56), glass=(.21, .25, .29), bay=3.0, floor=3.25, seed=81, wx=(.08, .92), wy=(.30, .88), mv=1,
                         blind=.4, blindc=(.74, .70, .62), rough=.6, night=.34, cool=.06, warm=(1.0, .76, .46)))
    b.colours(beige=(.72, .66, .58, .6), beige_l=(.82, .78, .70, .55), beige_d=(.52, .47, .41, .65), roof=(.44, .43, .42), glass=(.2, .24, .28, .2), steel=(.62, .62, .62, .4))
    P = chamfer(64.0, 65.0, 11.0)
    zr = 182.0
    b.prism(P, 0, zr, T, top='roof')
    floorbands(b, P, 6.0, zr, 6.5, 'beige_l', h=0.9, dep=1.1, lo=7)
    b.fins(P, 0, zr, 'beige', spacing=3.0, w=0.7, dep=1.1, ends=True, minlen=20, lo=6)
    for e in (1, 3, 5, 7):   # glazed corners
        b.attach(P[e], P[(e + 1) % 8], 0.08, 0.92, 6.0, zr, 0.5, 'dim', frac=True, top=False, bottom=False)
    posts = offset(P, -1.0)
    for p in posts:
        b.cbox(p[0], p[1], 1.6, 1.6, zr, 194.0 - 2.4, 'beige_l')
    screen(b, P, 194.0 - 2.4, 194.0, 'beige_l', inner='beige_d', t=2.2, rim='beige_l')
    b.cap(offset(P, -2.2), 0, 'beige_d', down=True, zs=[194.0 - 2.4] * 8)
    b.prism(scale(P, 0.55), zr, 188.0, 'beige_d', top='roof')
    beacons(b, [(sx * 31, sy * 20, 194.0 - 1.1) for sx in (-1.02, 1.02) for sy in (-1, 1)])
    if b.hi:
        b.band(P, 5.2, 0.8, 1.3, 'beige_l')
        b.portal(P[0], P[1], 0.0, 8.0, 4.2, 'beige_d', 'lobby', dep=0.8, canopy=3.0)


@model('tokyo_metropolitan_police_hq', 'B', 84.0, face='north', stone=0xa7957f,
       desc='75 x 132 m wedge-plan block in brown-beige tile with long window bands, rounded at the Sakuradamon point, stepped roof, and the '
            'cylindrical antenna tower with its ring platform and mast over the point')
def police(b):
    std(b)
    T = b.facade(punched('police_tile', (.62, .54, .45), glass=(.19, .22, .25), bay=3.2, floor=3.8, seed=83, wx=(.04, .96), wy=(.36, .78), mv=2, rough=.6, night=.6, cool=.35))
    b.colours(tile=(.62, .54, .45, .6), tile_l=(.74, .68, .58, .55), tile_d=(.46, .40, .34, .65), roof=(.42, .41, .40), glass=(.2, .23, .26, .2), conc=(.70, .69, .66, .7),
              mast=(.84, .84, .82, .5), dish=(.86, .86, .84, .4))
    n = b.seg(6, 3)
    ap = arc(0, -66.0 + 13.0, 13.0, 200, 340, n)
    P = dedupe(ap + [(37.5, 30.0), (37.5, 66.0), (-37.5, 66.0), (-37.5, 30.0)])
    zr = 62.0
    b.prism(P, 0, zr, T, top='roof', smooth=True, thr=40)
    floorbands(b, P, 0, zr, 3.8, 'tile_l', h=0.4, dep=0.4, lo=8)
    b.band(P, zr - 0.3, 1.2, 0.5, 'tile_l', bottom=False)
    b.fins(P, 0, zr, 'tile', spacing=3.2, w=0.6, dep=0.4, minlen=14, ends=True, lo=6)
    b.prism(rect2(-26, 26, 8.0, 56.0), zr, 68.0, 'tile_d', top='roof')
    # the antenna tower
    cy = -66.0 + 13.0
    b.lathe([(8.6, zr), (8.6, 71.0), (10.6, 71.4), (10.6, 73.0), (7.4, 73.4), (7.4, 78.0), (3.0, 78.6)], b.seg(14, 7), 'conc', cy=cy)
    b.lathe([(8.7, 66.0), (8.7, 68.4)], b.seg(14, 7), 'litc', cy=cy, cap=False)
    b.prism(rect(2.0, 2.0, 0, cy), 78.6, 81.5, 'mast', top='mast', poly1=rect(0.9, 0.9, 0, cy))
    b.cyl(0, cy, 0.3, 81.5, 84.0, 5, 'mast')
    beacons(b, [(0, cy + 2.0, 78.6), (-36, 65, zr + 1.0), (36, 65, zr + 1.0)])
    if b.hi:
        for a in (30, 150, 270):
            b.cyl(9.6 * math.cos(math.radians(a)), cy + 9.6 * math.sin(math.radians(a)), 1.5, 73.0, 74.0, 8, 'dish')
        b.portal(P[n + 1], P[n + 2], 0.0, 9.0, 5.0, 'tile_d', 'lobby', dep=0.7, canopy=3.0)
        b.cbox(-8, 30, 14, 10, 68.0, 71.0, 'conc')


if __name__ == '__main__':
    run()
