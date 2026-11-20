# far_props.py - San Francisco street props.  blender -b -P tools/sf/design/far_props.py -- [names]
# Origin at the base centre, metres, front +Z.
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

PP = {
    'iron': (0x33403a, .5, 0), 'iron_d': (0x232b28, .6, 0), 'globe': (0xfff1cf, .3, 0, 0xffe2a0), 'gold': (0xc9a544, .4, 0),
    'grey': (0x8e9396, .5, 0), 'grey_d': (0x5c6164, .6, 0), 'lamp': (0xfff0c8, .3, 0, 0xffe6a8), 'yellow': (0xd9a51c, .5, 0),
    'black': (0x1d1e20, .6, 0), 'sred': (0xc0271e, .3, 0, 0x70120c), 'samb': (0xd8901c, .3, 0, 0x5a3806), 'sgrn': (0x2aa05a, .3, 0, 0x0c4a22),
    'white': (0xe6e4dc, .5, 0), 'blue': (0x2a68a8, .5, 0), 'red': (0xc0352a, .45, 0), 'glass': (0x8fa7ad, .1, 0), 'steel': (0x9a9ea1, .35, 1),
    'green': (0x1f4a35, .5, 0), 'wood': (0x8a6540, .75, 0), 'wood_d': (0x5a422c, .85, 0), 'brown': (0x5b3a24, .6, 0), 'timber': (0x4a3a2c, .95, 0),
    'guano': (0xb9b5a6, .95, 0), 'orange': (0xd9622a, .6, 0), 'ice': (0xd5e2e6, .4, 0), 'seal': (0x6a5038, .7, 0), 'seal_d': (0x4a3828, .7, 0),
    'seal_l': (0x8c7254, .7, 0), 'ad': (0xd8d2bd, .5, 0, 0x4a4840), 'conc': (0xa9a69c, .9, 0),
}


def streetlamp(b):
    """Market Street 'Path of Gold' standard: ornate base, fluted shaft, three globes."""
    b.lathe([(.38, 0), (.38, .25), (.30, .32), (.30, .95), (.34, 1.0), (.24, 1.12), (.20, 1.9), (.24, 1.96), (.15, 2.1), (.11, 7.6), (.19, 7.72),
             (.19, 7.9), (.10, 8.0)], n=8, col='iron', nl=8, caps=1)
    b.cyl((0, 8.0, 0), (0, 9.15, 0), .07, n=6, col='iron', caps=0)
    b.sphere((0, 9.55, 0), (.30, .40, .30), n=8, m=4, col='globe', nl=8)
    b.lathe([(.12, 9.1), (.2, 9.18), (.12, 9.25)], n=6, col='gold', caps=0)
    for sx in b.mirx():
        n = 5 if b.hi else 2
        pts = [(.1 + .68 * sin(pi / 2 * i / n), 8.0 + .55 * (1 - cos(pi / 2 * i / n)), 0) for i in range(n + 1)]
        b.tube(pts, .05, n=4, col='iron', caps=0)
        if b.hi:
            b.tube([(.1, 7.7, 0), (.45, 7.55, 0), (.72, 7.9, 0), (.78, 8.5, 0)], .03, n=3, col='gold', caps=0)
            b.lathe([(.1, 8.5), (.18, 8.58), (.1, 8.66)], n=6, col='gold', caps=0, sx=1, sz=1) if False else None
        b.sphere((.78, 9.0, 0), (.27, .36, .27), n=8, m=4, col='globe', nl=8)
        b.cyl((.78, 8.5, 0), (.78, 8.68, 0), .1, .16, n=6, col='gold', caps=0)
    b.cyl((0, 9.93, 0), (0, 10.0, 0), .05, .01, n=4, col='gold')


def cobra(b):
    b.cyl((0, 0, 0), (0, .5, 0), .2, .16, n=6, col='grey_d', caps=2)
    b.cyl((0, .5, 0), (0, 8.9, 0), .12, .07, n=6, col='grey', caps=0)
    n = 5 if b.hi else 2
    pts = [(0, 8.9, 0)] + [(0, 8.9 + .55 * sin(pi / 2 * i / n), 2.0 * (1 - cos(pi / 2 * i / n))) for i in range(1, n + 1)]
    b.tube(pts, .05, n=4, col='grey', caps=0)
    b.tb(0, 9.33, 2.4, .32, .9, .17, .2, .7, 'grey_d', d='lamp')


def sig_head(b, x, y, z):
    b.box(x - .19, y, z - .12, x + .19, y + 1.1, z + .12, 'yellow')
    for i, c in enumerate(('sgrn', 'samb', 'sred')):
        b.cyl((x, y + .2 + i * .35, z + .12), (x, y + .2 + i * .35, z + .15), .12, n=8, col='black', caps=2, capcol=c, nl=4)
        b.box(x - .14, y + .32 + i * .35, z + .12, x + .14, y + .345 + i * .35, z + .3, 'yellow', skip='' if b.hi else 'lrb')
    b.box(x - .27, y - .08, z - .13, x + .27, y + 1.18, z - .12, 'black')


def traffic_signal(b):
    """Mast arm 7.5 m along +X, yellow heads facing +Z."""
    b.cyl((0, 0, 0), (0, .6, 0), .25, .18, n=8, col='grey_d', caps=2)
    b.cyl((0, .6, 0), (0, 7.0, 0), .15, .11, n=8, col='grey', caps=2)
    b.beam((0, 6.1, 0), (7.5, 6.55, 0), .14, .14, 'grey', caps=1)
    sig_head(b, 6.9, 5.35, .12)
    sig_head(b, 3.6, 5.2, .12)
    sig_head(b, -.42, 3.0, 0)
    b.box(-.3, 3.3, -.04, 0, 3.4, .04, 'grey')
    b.box(1.0, 6.3, -.03, 2.3, 6.62, .03, 'green', f='green', b='green')
    if b.hi:
        b.box(-.2, 2.3, .16, .2, 2.75, .3, 'black', f='samb')


def hydrant(b):
    b.lathe([(.2, 0), (.2, .06), (.13, .1), (.13, .66), (.16, .68), (.16, .73)], n=8, col='white', caps=1)
    b.lathe([(.16, .73), (.13, .80), (.07, .85), (.04, .86), (.04, .9)], n=8, col='blue', caps=2)
    for sx in b.mirx():
        b.cyl((.1, .46, 0), (.23, .46, 0), .07, n=6, col='white', capcol='blue')
    b.cyl((0, .42, .1), (0, .42, .25), .09, n=6, col='white', capcol='blue')


def bus_shelter(b):
    """Transit shelter with the wavy red roof, 5 m along X, open toward +Z."""
    n = 16 if b.hi else 8
    top = [(-2.5 + 5.0 * i / n, 2.62 + .13 * sin(2 * pi * 2 * i / n)) for i in range(n + 1)]
    b.pid += 1
    for (xa, ya), (xb, yb) in zip(top, top[1:]):
        b.hexa([(xa, ya, -.8), (xb, yb, -.8), (xb, yb, .8), (xa, ya, .8), (xa, ya + .05, -.8), (xb, yb + .05, -.8), (xb, yb + .05, .8), (xa, ya + .05, .8)], 'red',
               skip='' if xa == top[0][0] or xb == top[-1][0] else 'rl')
    for x in (-2.3, 0, 2.3):
        b.beam((x, 0, -.62), (x, 2.55, -.62), .09, .09, 'grey_d')
        b.beam((x, 2.5, -.7), (x, 2.5, .7), .07, .07, 'grey_d')
    b.box(-2.3, .25, -.64, 2.3, 2.2, -.61, 'glass')
    b.box(-2.34, .25, -.6, -2.28, 2.2, .45, 'ad')
    b.box(-1.6, .42, -.5, 1.2, .48, -.1, 'wood')
    for x in (-1.4, 1.0):
        b.box(x - .04, 0, -.4, x + .04, .42, -.2, 'grey_d')
    b.box(1.5, 0, -.56, 2.25, 2.0, -.48, 'grey_d', f='ad')


def trash_can(b):
    b.lathe([(.26, 0), (.33, .08), (.36, .8), (.38, .82), (.38, .88), (.3, .92), (.3, 1.02), (.2, 1.1)], n=8, col='green', nl=8)
    if b.hi:
        for a in range(8):
            ang = 2 * pi * (a + .5) / 8
            b.beam((.31 * cos(ang), .12, .31 * sin(ang)), (.335 * cos(ang), .78, .335 * sin(ang)), .05, .02, 'iron_d', up=(cos(ang), 0, sin(ang)))
        b.box(-.16, .93, .27, .16, 1.0, .30, 'black')


def newspaper_box(b):
    """Pedestal newsrack: a row of compartments on two posts."""
    for x in (-.7, .7):
        b.box(x - .08, 0, -.08, x + .08, .5, .08, 'green')
        b.box(x - .2, 0, -.15, x + .2, .04, .15, 'green')
    b.box(-1.1, .5, -.22, 1.1, 1.25, .22, 'green', skip='f')
    xs = [-1.1]
    for i in range(4):
        a = -1.1 + i * .55
        xs += [a + .05, a + .5, a + .55]
    b.grid((0, 0, .22), (1, 0, 0), (0, 1, 0), xs, [.5, .58, .82, .9, 1.2, 1.25],
           lambda u, v: ('glass' if .9 < v < 1.2 else 'iron_d') if (b.hi and (u + 1.1) % .55 > .05 and (u + 1.1) % .55 < .5 and (.58 < v < .82 or .9 < v < 1.2)) else 'green')


def bench(b):
    for sx in b.mirx():
        b.box(.78, 0, -.25, .84, .42, -.2, 'iron_d')
        b.box(.78, 0, .2, .84, .42, .25, 'iron_d')
        b.box(.78, .38, -.25, .84, .44, .25, 'iron_d')
        b.beam((.81, .42, -.22), (.81, .86, -.32), .06, .05, 'iron_d')
        b.box(.76, .60, -.26, .86, .64, .22, 'iron_d')
    if b.hi:
        for z in (-.18, -.06, .06, .18):
            b.box(-.9, .44, z - .05, .9, .47, z + .05, 'wood')
        for y, z in ((.56, -.255), (.68, -.283), (.80, -.31)):
            b.box(-.9, y - .045, z - .015, .9, y + .045, z + .015, 'wood')
    else:
        b.box(-.9, .44, -.23, .9, .47, .23, 'wood')
        b.beam((0, .5, -.24), (0, .85, -.32), 1.8, .03, 'wood', up=(0, 0, 1))


CAR = ["............", ".##########.", ".#........#.", "############", "#.#.#.#.####", "#.#.#.#.####", "############", "############", ".##......##.", ".##......##."]


def stop_sign(b):
    """Cable car stop: brown sign with a white border and a cable car pictogram (no lettering)."""
    b.cyl((0, 0, 0), (0, 2.6, 0), .035, n=6, col='grey', caps=2, nl=4)
    w, h, y0 = .56, .64, 1.9
    us = [-w / 2, -w / 2 + .03, -w / 2 + .06] + [-w / 2 + .08 + .4 * i / 12 for i in range(13)][1:] + [w / 2 - .06, w / 2 - .03, w / 2]
    us = sorted(set([-w / 2, -w / 2 + .03, -w / 2 + .06, w / 2 - .06, w / 2 - .03, w / 2] + [-.2 + .4 * i / 12 for i in range(13)]))
    vs = sorted(set([0, .03, .06, h - .06, h - .03, h] + [.16 + .32 * i / 10 for i in range(11)]))

    def f(u, v):
        if min(u + w / 2, w / 2 - u, v, h - v) < .03:
            return 'brown'
        if min(u + w / 2, w / 2 - u, v, h - v) < .06:
            return 'white'
        if b.hi and -.2 < u < .2 and .16 < v < .48:
            ci, ri = int((u + .2) / .4 * 12), 9 - int((v - .16) / .32 * 10)
            return 'white' if CAR[ri][ci] == '#' else 'brown'
        return 'brown'
    for z, fl in ((.045, False), (-.045, True)):
        b.grid((0, y0, z), (1, 0, 0), (0, 1, 0), us, vs, f, flip=fl)
    b.box(-w / 2, y0, -.045, w / 2, y0 + h, .045, 'brown', skip='fb')


def parking_meter(b):
    b.cyl((0, 0, 0), (0, 1.05, 0), .03, n=6, col='grey_d', caps=0, nl=4)
    b.box(-.09, 1.05, -.07, .09, 1.32, .07, 'grey', f='black')
    b.cyl((-.09, 1.32, 0), (.09, 1.32, 0), .08, n=8, col='grey', nl=8)
    b.box(-.06, 1.36, .0, .06, 1.395, .081, 'lamp') if b.hi else None
    b.cyl((0, 0, 0), (0, .03, 0), .08, n=6, col='grey_d')


def pier_pilings(b):
    """Timber dolphin: a cluster of leaning piles bound together; base at the waterline."""
    rnd = random.Random(2)
    b.cyl((0, 0, 0), (0, 5.0, 0), .2, .17, n=7, col='timber', capcol='guano', nl=5)
    for i in range(6):
        a = 2 * pi * i / 6 + .2
        h = rnd.uniform(4.0, 4.8)
        b.cyl((.72 * cos(a), 0, .72 * sin(a)), (.26 * cos(a), h, .26 * sin(a)), .19, .16, n=7, col='timber' if i % 2 else 'wood_d', capcol='guano', nl=4)
    b.cyl((0, 3.3, 0), (0, 3.6, 0), .50, .47, n=8, col='iron_d', caps=0, nl=8)
    b.cyl((0, 0, 0), (0, .6, 0), .95, .9, n=8, col='iron_d', caps=0) if False else None


def waterfront_rail(b):
    """3.1 m Embarcadero railing segment along X (half posts at both ends so segments tile)."""
    for sx in b.mirx():
        b.box(1.47, 0, -.07, 1.55, 1.06, .07, 'iron')
        b.box(1.44, 1.06, -.09, 1.55, 1.1, .09, 'iron_d')
        b.box(1.42, 0, -.1, 1.55, .08, .1, 'iron_d')
    b.box(-1.47, .98, -.045, 1.47, 1.04, .045, 'iron')
    b.box(-1.47, .14, -.03, 1.47, .19, .03, 'iron')
    if b.hi:
        b.box(-1.47, .56, -.02, 1.47, .6, .02, 'iron')
        for i in range(1, 12):
            x = -1.47 + 2.94 * i / 12
            b.box(x - .012, .19, -.012, x + .012, .98, .012, 'iron', skip='ud')
    else:
        b.box(-1.47, .19, 0, 1.47, .98, 0.001, 'iron', skip='udlr')


def bollard_chain(b):
    for sx in b.mirx():
        with b.at(1.05):
            b.lathe([(.15, 0), (.15, .08), (.1, .14), (.085, .7), (.12, .74), (.12, .8), (.06, .88), (0, .9)], n=8, col='iron_d', nl=8, caps=1)
    n = 8 if b.hi else 3
    b.tube([(-1.05 + 2.1 * i / n, .72 - .32 * 4 * (i / n) * (1 - i / n), 0) for i in range(n + 1)], .022, n=4 if b.hi else 3, col='grey_d', caps=0)
    for sx in b.mirx():
        b.box(1.1, 0, -.1, 1.2, .01, .1, 'iron_d')


def crab_stand(b):
    """Fisherman's Wharf sidewalk crab stand: steaming pots, crab display on ice, striped awning. Counter faces +Z."""
    b.box(-1.5, 0, -.3, 1.5, .95, .55, 'white', u='steel')
    b.box(-1.5, .0, .55, 1.5, .12, .57, 'red', skip='b')
    b.box(-1.5, .83, .55, 1.5, .95, .57, 'red', skip='b')
    b.box(-1.5, 0, -1.0, 1.5, 2.3, -.9, 'white', f='white')
    for sx in b.mirx():
        b.box(1.42, 0, -.9, 1.5, 2.3, -.3, 'white')
        b.beam((1.45, .95, .5), (1.45, 2.05, .5), .06, .06, 'steel')
    for x in (-.95, -.25):
        b.cyl((x, .95, .05), (x, 1.5, .05), .3, n=10, col='steel', nl=8)
        b.cyl((x, 1.5, .05), (x, 1.56, .05), .32, .2, n=10, col='steel', nl=8)
    b.box(.3, .95, -.2, 1.35, 1.08, .45, 'steel', u='ice')
    if b.hi:
        for x, z in ((.5, 0), (.85, .2), (1.15, -.05), (.6, .3), (1.05, .28)):
            b.sphere((x, 1.1, z), (.13, .06, .1), n=6, m=2, col='orange')
    # striped awning sloping down toward the street
    xs = [-1.6 + 3.2 * i / 8 for i in range(9)]
    b.grid((0, 2.8, -1.0), (1, 0, 0), Vector((0, -.6, 1.9)).normalized(), xs, [0, Vector((0, -.6, 1.9)).length],
           (lambda u, v: 'red' if int((u + 1.6) / .4) % 2 == 0 else 'white') if b.hi else (lambda u, v: 'red'))
    b.grid((0, 2.2, .9), (1, 0, 0), (0, -1, 0), xs, [0, .22], (lambda u, v: 'red' if int((u + 1.6) / .4) % 2 == 0 else 'white') if b.hi else (lambda u, v: 'red'), flip=True)
    b.box(-1.6, 2.3, -1.0, 1.6, 2.8, -.94, 'white', f='red')
    b.box(-1.0, 2.4, -.94, 1.0, 2.7, -.92, 'white')


def sea_lion_float(b):
    """6 x 4 m timber float with sea lions hauled out; y 0 = the waterline."""
    b.box(-3, 0, -2, 3, .32, 2, 'timber', u='wood')
    if b.hi:
        for i in range(1, 8):
            x = -3 + 6 * i / 8
            b.box(x - .02, .32, -2, x + .02, .33, 2, 'wood_d', skip='d')
        for sx in b.mirx():
            b.box(2.9, .1, -2.04, 3.04, .4, 2.04, 'wood_d')
    lions = [(-1.9, -.9, 20, 0, 'seal'), (-.4, -1.1, -15, 1, 'seal_d'), (1.4, -.7, 60, 0, 'seal_l'), (-1.5, .9, 100, 1, 'seal_d'), (.3, .7, -40, 0, 'seal'), (1.9, 1.0, 170, 1, 'seal_l')]
    for x, z, ry, up, c in lions:
        with b.at(x, .33, z, ry=ry):
            hy = .75 if up else .32
            pts = [(0, .12, -1.0), (0, .2, -.55), (0, .26, 0), (0, .3 + .25 * up, .45), (0, hy, .72), (0, hy + .04, .95)]
            b.tube(pts, [.05, .2, .3, .26, .15, .07], n=6 if b.hi else 4, col=c, smooth=70, up=(1, 0, 0))
            if b.hi:
                for sx in b.mirx():
                    b.beam((.2, .08, .35), (.5, .03, .15), .2, .05, c)


MODELS = {
    'sf_streetlamp': (streetlamp, PP), 'sf_streetlamp_cobra': (cobra, PP), 'sf_traffic_signal': (traffic_signal, PP),
    'sf_hydrant': (hydrant, PP), 'sf_bus_shelter': (bus_shelter, PP, {'pin': False}), 'sf_trash_can': (trash_can, PP),
    'sf_newspaper_box': (newspaper_box, PP), 'sf_bench': (bench, PP, {'pin': False}), 'sf_cable_car_stop_sign': (stop_sign, PP),
    'sf_parking_meter': (parking_meter, PP, {'pin': False}), 'sf_pier_pilings': (pier_pilings, PP, {'settle': {'cx': False, 'cz': False, 'y0': True}}), 'sf_waterfront_rail': (waterfront_rail, PP),
    'sf_bollard_chain': (bollard_chain, PP), 'sf_crab_stand': (crab_stand, PP), 'sf_sea_lion_float': (sea_lion_float, PP),
}

if __name__ == '__main__':
    run(MODELS)
