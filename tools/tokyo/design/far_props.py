# far_props.py - Tokyo street props.  blender -b -P tools/tokyo/design/far_props.py -- [names]
# Origin at the base centre, metres, front +Z.  Lamps, signals, lit fronts and lanterns are emissive (dusk level).
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

PP = {
    'grey': (0x8e9396, .5, .2), 'grey_d': (0x5c6164, .6, 0), 'conc': (0xa9a69c, .9, 0), 'conc_d': (0x8b887f, .9, 0), 'black': (0x1d1e20, .6, 0),
    'led': (0xf2f5ff, .3, 0, 0xeef4ff), 'warm': (0xfff0c8, .3, 0, 0xffdc98), 'lit': (0x8a8f86, .2, 0, 0xf2e2b0), 'gdark': (0x1f3a30, .45, .2), 'gold': (0xc9a544, .4, .6),
    'sred': (0xc0271e, .3, 0, 0xf02818), 'samb': (0xd8901c, .3, 0, 0x7a5206), 'sgrn': (0x18a88a, .3, 0, 0x0a6a56), 'white': (0xe6e4dc, .5, 0),
    'verm': (0xd8391f, .5, 0), 'verm_d': (0xb02c18, .55, 0), 'stone': (0x9c9a90, .9, 0), 'stone_d': (0x7d7b72, .9, 0), 'red': (0xc8261c, .42, 0),
    'glass': (0x8fa7ad, .1, 0), 'steel': (0x9a9ea1, .35, .8), 'wood': (0x8a6540, .75, 0), 'wood_d': (0x5a422c, .85, 0), 'haz': (0xe0b01c, .6, 0),
    'vblue': (0x1f5fa8, .4, 0), 'vlit': (0xe2e8e6, .2, 0, 0xdfe8e4), 'p1': (0xd8452a, .3, 0, 0x8a2a18), 'p2': (0x2a8a4a, .3, 0, 0x185a2c), 'p3': (0xe0b030, .3, 0, 0x8a6a18),
    'p4': (0x3a6ab8, .3, 0, 0x203c70), 'tile': (0xd6d0c0, .7, 0), 'tile_d': (0xb0aa9a, .7, 0), 'kroof': (0x6b6f72, .7, 0), 'lamp_red': (0xd82a1c, .3, 0, 0xff3018),
    'lantern': (0xe0452a, .5, 0, 0xd84a20), 'noren': (0x24386a, .8, 0), 'tyre': (0x232325, .9, 0), 'b1': (0x2f6aa8, .4, 0), 'b2': (0xb0b4b8, .35, .6),
    'b3': (0x8a2a2a, .4, 0), 'sign_lit': (0xe9eef2, .3, 0, 0xdfe8f0), 'sign_blue': (0x1c6fb8, .3, 0, 0x1458a0), 'ad1': (0xe84a6a, .3, 0, 0xe03a5c),
    'ad2': (0x2ab8d8, .3, 0, 0x20a8cc), 'ad3': (0xf2e6c0, .3, 0, 0xf0deb0), 'ad4': (0xf0a020, .3, 0, 0xe89418), 'ad5': (0x283048, .4, 0, 0x101828),
    'insul': (0xe8e6dc, .3, 0), 'trans': (0x9da3a6, .5, .3), 'green': (0x2f7d4f, .5, 0), 'step': (0x77797a, .9, 0), 'pit': (0x2c2e30, .9, 0),
}


def streetlamp(b):
    """Grey tapered pole, twin arms along +-X with flat LED heads, 9 m."""
    b.cyl((0, 0, 0), (0, .9, 0), .17, .14, n=12, col='grey_d', caps=0, nl=4)
    b.cyl((0, .9, 0), (0, 8.75 if b.hi else 9.0, 0), .12, .075, n=12, col='grey', caps=2, nl=4)
    for sx in b.mirx():
        if b.hi:
            n = 6
            pts = [(.05, 8.2, 0)] + [(.05 + 1.5 * sin(pi / 2 * i / n), 8.2 + .68 * (1 - cos(pi / 2 * i / n)), 0) for i in range(1, n + 1)]
            b.tube(pts, .045, n=6, col='grey', caps=0)
            b.box(1.45, 8.84, -.1, 1.6, 8.93, .1, 'grey_d')
            b.cyl((.0, 8.1, 0), (.0, 8.3, 0), .13, n=8, col='grey_d', caps=0)
        else:
            b.beam((.05, 8.2, 0), (1.5, 8.88, 0), .08, .08, 'grey', lx=True)
        b.tb(1.85, 8.82, 0, .9, .34, .18, .7, .24, 'grey', d='led')
    if b.hi:
        b.cyl((0, 8.75, 0), (0, 9.0, 0), .04, .01, n=4, col='grey')
        b.box(-.13, .5, .1, .13, 1.0, .16, 'grey_d')


def streetlamp_ginza(b):
    """Ginza-style ornate dark-green standard with two drooping 'willow' arms and pendant lanterns, 6 m."""
    b.lathe([(.30, 0), (.30, .18), (.22, .26), (.22, .8), (.26, .86), (.16, 1.0), (.13, 1.6), (.16, 1.66), (.105, 1.8), (.08, 5.1), (.14, 5.2), (.14, 5.32), (.07, 5.42),
             (.07, 5.6), (.11, 5.68), (.03, 5.9), (0, 6.0)], n=8, col='gdark', nl=8, caps=1)
    for sx in b.mirx():
        n = 6 if b.hi else 3
        pts = [(.07, 5.0, 0)] + [(.07 + .62 * (1 - cos(pi * i / n)), 5.0 + .52 * sin(pi * i / n) + .04 * i / n, 0) for i in range(1, n + 1)]
        b.tube(pts, .035, n=4, col='gdark', caps=0)
        if b.hi:
            b.tube([(.1, 4.5, 0), (.5, 4.75, 0), (.72, 5.2, 0)], .02, n=3, col='gold', caps=0)
        with b.at(1.31, 4.2, 0):
            b.lathe([(.03, .85), (.16, .78), (.19, .7)], n=6, col='gdark', caps=0)
            b.lathe([(.17, .7), (.2, .4), (.12, .08)], n=6, col='warm', caps=0)
            b.lathe([(.12, .08), (.05, .0), (0, -.06)], n=6, col='gold', caps=0)


def utility_pole(b):
    """Concrete utility pole: crossarms with insulators, transformer can, cable brackets, a small street-lamp arm (+Z), 11 m."""
    b.cyl((0, 0, 0), (0, 11.0, 0), .2, .12, n=8, col='conc', capcol='conc_d', caps=2)
    if b.hi:   # yellow / black hazard wrap
        for i in range(4):
            b.cyl((0, .7 + i * .22, 0), (0, .92 + i * .22, 0), .202 - i * .002, .2 - i * .002, n=8, col='haz' if i % 2 == 0 else 'black', caps=0)
    else:
        b.cyl((0, .7, 0), (0, 1.58, 0), .202, .196, n=8, col='haz', caps=0)
    for y, hw, ni in ((10.3, 1.25, 3), (9.5, .95, 2)):
        b.box(-hw, y, .1, hw, y + .1, .2, 'grey_d')
        for sx in b.mirx():
            for i in range(ni):
                x = hw - .08 - i * (hw - .3) / max(ni - 1, 1) * .8
                b.cyl((x, y + .1, .15), (x, y + .32, .15), .05, .035, n=5, col='insul', nl=4)
    b.cyl((0, 10.6, 0), (0, 10.85, 0), .05, .04, n=5, col='insul', nl=4)
    # transformer can on a bracket, +Z side
    b.cyl((0, 7.5, .52), (0, 8.45, .52), .3, n=10, col='trans', nl=6)
    b.cyl((0, 8.45, .52), (0, 8.52, .52), .31, .22, n=10, col='grey_d', nl=6)
    b.box(-.2, 7.4, .1, .2, 7.5, .7, 'grey_d')
    for sx in b.mirx():
        b.cyl((.14, 8.52, .5), (.14, 8.78, .5), .04, .03, n=5, col='insul', nl=4)
        if b.hi:
            b.beam((.14, 8.78, .5), (.4, 9.5, .16), .02, .02, 'black', lx=True)
    # communication cable brackets + junction box (stubs: no wires)
    for y, hw in ((6.4, .55), (5.9, .4)):
        b.box(-hw, y, -.16, hw, y + .06, -.1, 'grey_d')
        if b.hi:
            for sx in b.mirx():
                b.box(hw - .06, y - .1, -.18, hw, y + .06, -.08, 'black')
    b.box(-.2, 5.2, -.4, .2, 5.7, -.14, 'grey')
    b.cyl((.0, 6.9, -.24), (0, 7.3, -.24), .09, n=6, col='black', nl=4)
    # small street lamp toward +Z
    b.beam((0, 5.0, .12), (0, 5.3, 1.3), .05, .05, 'grey', caps=0)
    b.tb(0, 5.24, 1.5, .22, .6, .1, .16, .5, 'grey', d='led')
    if b.hi:
        for i in range(7):   # climbing pegs
            y = 2.2 + i * .45
            sx = 1 if i % 2 else -1
            b.box(sx * .1, y, -.015, sx * .3, y + .025, .015, 'grey_d')


def sig_head_h(b, x, y, z, w=1.25):
    """Horizontal three-lens head centred at x, lenses facing +Z: blue-green, yellow, red (red toward +X)."""
    b.box(x - w / 2, y, z - .12, x + w / 2, y + .44, z + .1, 'grey')
    for i, c in enumerate(('sgrn', 'samb', 'sred')):
        cx = x + (i - 1) * .4
        b.cyl((cx, y + .22, z + .1), (cx, y + .22, z + .13), .15, n=8, col='black', caps=2, capcol=c, nl=6)
        if b.hi:
            b.prism([(cx + .17 * cos(pi * k / 4), y + .22 + .17 * sin(pi * k / 4)) for k in range(5)] + [(cx - .15, y + .22), (cx + .15, y + .22)], 'z', z + .1, z + .3, 'grey', caps=0)
    if not b.hi:
        b.box(x - w / 2, y + .41, z + .1, x + w / 2, y + .44, z + .3, 'grey', skip='b')
    b.box(x - w / 2 - .12, y - .1, z - .13, x + w / 2 + .12, y + .54, z - .12, 'white', b='grey_d')   # back plate


def traffic_signal(b):
    """Japanese horizontal signal on a mast arm along +X, 6.5 m."""
    b.cyl((0, 0, 0), (0, .5, 0), .2, .16, n=8, col='grey_d', caps=2)
    b.cyl((0, .5, 0), (0, 6.5, 0), .13, .1, n=8, col='grey', caps=2)
    b.beam((0, 5.75, 0), (5.2, 6.05, 0), .12, .12, 'grey', caps=1)
    b.beam((0, 5.0, 0), (1.6, 5.8, 0), .06, .06, 'grey', lx=True)
    sig_head_h(b, 4.5, 5.5, .2)
    sig_head_h(b, .0, 3.6, .26, w=1.25)
    b.box(-.22, 1.1, -.42, .22, 1.9, -.13, 'grey', f='grey')   # control box
    if b.hi:
        b.box(4.35, 5.94, .08, 4.65, 6.04, .2, 'grey_d')
        b.box(-.05, 3.7, .13, .05, 3.9, .16, 'grey_d')


def pedestrian_signal(b):
    b.cyl((0, 0, 0), (0, 2.1, 0), .06, .05, n=8, col='grey', caps=0, nl=4)
    b.cyl((0, 0, 0), (0, .06, 0), .12, n=8, col='grey_d', nl=4)
    if b.hi:
        b.cyl((0, 1.95, 0), (0, 2.1, 0), .08, n=8, col='grey_d')
        b.box(-.19, 2.08, -.12, .19, 2.1, .12, 'grey_d')
        b.box(-.19, 2.8, -.12, .19, 2.82, .12, 'grey_d')
    b.box(-.19, 2.1, -.1, .19, 2.8 if b.hi else 2.82, .1, 'grey', f='black')
    for y, c in ((2.48, 'sred'), (2.15, 'sgrn')):
        b.box(-.14, y, .1, .14, y + .27, .115, c, skip='b')
        b.box(-.17, y + .27, .1, .17, y + .295, .26, 'grey', skip='b' if b.hi else 'blr')
    if b.hi:
        b.box(-.08, 1.1, .05, .08, 1.3, .12, 'haz')   # push-button box


def vending_machine(b):
    """Two drink machines side by side (2.0 x 1.83 x 0.75 m), lit fronts toward +Z."""
    for x0, body, acc in ((-1.0, 'white', 'vblue'), (.0, 'red', 'white')):
        x1 = x0 + 1.0
        b.box(x0 + .01, .04, -.37, x1 - .01, 1.83, .34, body, skip='f', d='black')
        b.box(x0 + .05, 0, -.3, x1 - .05, .04, .3, 'black', skip='u')
        xs = [x0 + .01, x0 + .07] + [x0 + .07 + (.86 * i / 6) for i in range(1, 6)] + [x1 - .07, x1 - .01]
        ys = [.04, .2, .42, .62, .78, .86, 1.0, 1.14, 1.22, 1.36, 1.5, 1.58, 1.72, 1.83]

        def f(u, v, x0=x0, body=body, acc=acc):
            inx = x0 + .07 < u < x0 + .93
            if not inx or v > 1.72 or v < .2:
                return body
            if v > .78:
                if b.hi and (.86 < v < 1.0 or 1.22 < v < 1.36 or 1.58 < v < 1.72):   # product rows
                    return ('p1', 'p3', 'p2', 'p4', 'p3', 'p1')[int((u - x0 - .07) / .86 * 6 + int(v * 3)) % 6]
                return 'vlit'
            if .2 < v < .42:
                return 'black' if x0 + .2 < u < x0 + .8 else body
            if .62 < v < .78:
                return acc
            return body
        b.grid((0, 0, .34), (1, 0, 0), (0, 1, 0), xs if b.hi else [x0 + .01, x0 + .07, x0 + .93, x1 - .01], ys if b.hi else [.04, .2, .78, 1.72, 1.83], f)
    b.box(-1.0, 1.83, -.37, 1.0, 1.84, .34, 'grey_d', skip='d')


def koban(b):
    """Two-storey police box, 6 x 5 x 7 m: tiled walls, lit windows, entrance canopy, red lamp over the door."""
    W, D, H = 3.0, 2.5, 6.3
    xs = [-W, -2.6, -1.3, -.9, .9, 1.3, 2.6, W]
    ys = [0, .3, .9, 2.5, 2.75, 3.3, 3.9, 5.2, 5.9, H]

    def front(u, v):
        if v < .3:
            return 'tile_d'
        if v < 2.5:
            if abs(u) < .9:
                return 'lit' if v > .0 else 'tile_d'      # glazed double door
            if 1.3 < abs(u) < 2.6 and v > .9:
                return 'lit'
            return 'tile'
        if 3.9 < v < 5.2 and (abs(u) < .9 or 1.3 < abs(u) < 2.6):
            return 'lit' if abs(u) > 1.0 else 'glass'
        if 2.75 < v < 3.3:
            return 'tile_d'
        return 'tile'
    b.grid((0, 0, D), (1, 0, 0), (0, 1, 0), xs, ys, front)
    zs = [-D, -1.6, -.4, .4, 1.6, D]

    def sidef(u, v):
        if v < .3 or 2.75 < v < 3.3:
            return 'tile_d'
        if (.9 < v < 2.5 or 3.9 < v < 5.2) and (.4 < abs(u) < 1.6):
            return 'lit' if v < 2.5 else 'glass'
        return 'tile'
    for sx in b.mirx():
        b.grid((W, 0, 0), (0, 0, 1), (0, 1, 0), zs, ys, sidef, flip=True)
    b.grid((0, 0, -D), (1, 0, 0), (0, 1, 0), [-W, W], [0, .3, 2.75, 3.3, H], lambda u, v: 'tile_d' if (v < .3 or 2.75 < v < 3.3) else 'tile', flip=True)
    b.box(-W - .08, H, -D - .08, W + .08, H + .3, D + .08, 'tile_d', u='kroof', skip='d')
    b.box(-1.0, H + .3, -1.9, .8, 7.0, -.4, 'tile', u='kroof', skip='d')      # stair head
    b.box(-1.9, 2.6, D, 1.9, 2.78, D + 1.0, 'kroof', d='white')               # entrance canopy
    for sx in b.mirx():
        b.cyl((1.75, 0, D + .85), (1.75, 2.6, D + .85), .06, n=6, col='grey', caps=0, nl=4)
    b.sphere((0, 3.02, D + .98), (.17, .2, .17), n=8, m=4, col='lamp_red', nl=6)
    b.box(-.06, 2.78, D + .92, .06, 2.84, D + 1.04, 'grey_d')
    b.cyl((0, 3.6, D), (0, 3.6, D + .05), .28, n=10, col='gold', caps=2, nl=6)     # emblem disc (blank)
    if b.hi:
        b.box(-.03, .3, D, .03, 2.5, D + .03, 'grey_d', skip='b')
        b.cyl((2.3, H + .3, -1.6), (2.3, 7.0, -1.6), .03, n=4, col='grey', caps=0)


def bus_stop(b):
    """Pole sign with a round blank head beside a small roofed bench shelter (3 m long)."""
    # sign pole at -X
    b.cyl((-1.85, 0, .5), (-1.85, .1, .5), .22, n=8, col='conc', nl=6)
    b.cyl((-1.85, .1, .5), (-1.85, 2.5, .5), .04, n=6, col='grey', caps=0, nl=4)
    b.cyl((-1.85, 2.72, .47), (-1.85, 2.72, .53), .28, n=12, col='green', capcol='white', nl=8)
    b.box(-2.08, 1.2, .47, -1.62, 2.3, .53, 'white', l='grey', r='grey')
    if b.hi:
        b.box(-2.03, 1.9, .53, -1.67, 2.24, .535, 'green', skip='b')
        b.box(-2.03, 1.26, .53, -1.67, 1.84, .535, 'sign_lit', skip='b')
    # shelter
    b.box(-1.5, 2.4, -.7, 1.5, 2.5, .75, 'grey_d', u='kroof', d='white')
    for x in (-1.42, 1.42):
        for z in (-.6, .6):
            b.beam((x, 0, z), (x, 2.4, z), .07, .07, 'grey')
    b.box(-1.42, .3, -.63, 1.42, 2.1, -.6, 'glass')
    b.box(-1.1, .42, -.45, 1.1, .48, -.05, 'wood')
    for x in (-.9, .9):
        b.box(x - .04, 0, -.4, x + .04, .42, -.1, 'grey_d')


def guard_rail(b):
    """3 m white pedestrian guard-pipe segment along X, 0.9 m (posts on the ends: tile every 3 m)."""
    for sx in b.mirx():
        b.cyl((1.5, 0, 0), (1.5, .9, 0), .045, n=8, col='white', nl=4)
    for y in (.82, .52, .22):
        b.cyl((-1.5, y, 0), (1.5, y, 0), .03, n=6, col='white', caps=0, nl=3)
    if b.hi:
        b.cyl((0, 0, 0), (0, .82, 0), .03, n=6, col='white', caps=0)
        for sx in b.mirx():
            b.cyl((1.5, .9, 0), (1.5, .93, 0), .05, .02, n=8, col='white', caps=0)
            b.cyl((1.5, 0, 0), (1.5, .03, 0), .07, n=8, col='grey_d', caps=2)
    else:
        for sx in b.mirx():
            b.cyl((1.5, .9, 0), (1.5, .93, 0), .045, .02, n=4, col='white', caps=0)
            b.cyl((1.5, 0, 0), (1.5, .03, 0), .07, n=4, col='grey_d', caps=2)


def torii(b):
    """Vermilion myojin torii, 6 m across x 6.5 m: leaning pillars on black feet, nuki tie beam, curved shimagi + black kasagi."""
    for sx in b.mirx():
        b.cyl((2.2, 0, 0), (2.17, .7, 0), .34, .31, n=12, col='black', caps=0, nl=8)
        b.cyl((2.17, .7, 0), (1.99, 5.45, 0), .28, .235, n=12, col='verm', caps=0, nl=8)
        b.box(1.7, 5.4, -.3, 2.3, 5.54, .3, 'verm_d') if b.hi else None
    b.box(-2.75, 4.1, -.12, 2.75, 4.48, .12, 'verm')                      # nuki
    b.box(-.2, 4.48, -.1, .2, 5.54, .1, 'verm_d')                         # gakuzuka
    if b.hi:
        for sx in b.mirx():
            b.box(2.32, 4.14, -.16, 2.4, 4.44, .16, 'verm_d')            # wedges
    n = 10 if b.hi else 4
    cv = lambda x: .42 * (abs(x) / 3.0) ** 2.2
    xs = [-3.0 + 6.0 * i / n for i in range(n + 1)]
    for y0, y1, hz, col, ext in ((5.54, 5.8, .2, 'verm', -.12), (5.8, 5.996, .26, 'black', 0)):
        poly = [(x * (1 + ext / 3), y0 + cv(x)) for x in xs] + [(x * (1 + ext / 3), y1 + cv(x) * 1.2) for x in reversed(xs)]
        b.prism(poly, 'z', -hz, hz, col)


def stone_lantern(b):
    """Granite kasuga lantern, 2.2 m, warm fire box."""
    def hexr(r, y, ph=0.0):
        return [(r * cos(ph + pi / 3 * i), y, r * sin(ph + pi / 3 * i)) for i in range(6)]
    prof = [(.36, 0), (.36, .12), (.28, .2), (.3, .3)]
    b.loft([hexr(r, y) for r, y in prof], 'stone_d', caps=1)
    b.cyl((0, .3, 0), (0, 1.12, 0), .11, .1, n=8, col='stone', caps=0, nl=6)
    b.loft([hexr(r, y) for r, y in ((.14, 1.12), (.3, 1.24), (.3, 1.32))], 'stone', caps=3)
    b.loft([hexr(.21, 1.32), hexr(.21, 1.66)], lambda k, i: 'warm' if i % 2 == 0 else 'stone_d', caps=0)
    roof = [(.25, 1.66), (.46, 1.7), (.44, 1.76), (.2, 1.92), (.08, 1.98)]
    b.loft([hexr(r, y) for r, y in roof], 'stone', caps=1, smooth=None)
    b.lathe([(.08, 1.98), (.11, 2.06), (.07, 2.14), (0, 2.2)], n=6, col='stone_d', caps=0)


def mailbox(b):
    """Red post box on a pedestal, 1.3 m: two slots toward +Z, blank white plate."""
    b.box(-.2, 0, -.16, .2, .05, .16, 'grey_d')
    b.box(-.07, .05, -.07, .07, .55, .07, 'red')
    b.box(-.3, .55, -.24, .3, 1.24, .24, 'red', skip='f')
    b.prism([(-.24, 1.24), (.24, 1.24), (.26, 1.27), (0, 1.3), (-.26, 1.27)], 'x', -.31, .31, 'red')
    xs = [-.3, -.25, -.03, .03, .25, .3]
    ys = [.55, .66, .86, .96, 1.02, 1.1, 1.24]

    def f(u, v):
        if 1.02 < v < 1.1 and (.03 < abs(u) < .25):
            return 'black'
        if .66 < v < .86 and abs(u) < .25:
            return 'white'
        return 'red'
    b.grid((0, 0, .24), (1, 0, 0), (0, 1, 0), xs, ys, f)
    for sx in b.mirx():
        b.box(.03, 1.1, .24, .25, 1.13, .3, 'red', skip='b' if b.hi else 'bud')
    if b.hi:
        b.box(-.31, 1.2, -.25, .31, 1.24, .25, 'red', skip='ud')
        b.box(-.09, .5, -.09, .09, .55, .09, 'red', skip='u')


def annulus(b, x, y, z, r0, r1, n, col):
    """Flat ring in the YZ plane (a bicycle wheel)."""
    b.pid += 1
    for i in range(n):
        a0, a1 = 2 * pi * i / n, 2 * pi * (i + 1) / n
        b.face([(x, y + r0 * cos(a0), z + r0 * sin(a0)), (x, y + r1 * cos(a0), z + r1 * sin(a0)), (x, y + r1 * cos(a1), z + r1 * sin(a1)), (x, y + r0 * cos(a1), z + r0 * sin(a1))], col)


def bicycle(b, col, basket=True):
    r = .33
    for z in (-.53, .53):
        if b.hi:
            annulus(b, 0, r, z, r - .05, r, 8, 'tyre')
        else:
            annulus(b, 0, r, z, r - .07, r, 4, 'tyre')
    bb, st, hd, sd = (0, .3, -.08), (0, .82, -.2), (0, .86, .34), (0, .33, -.53)
    k = dict(lx=True) if not b.hi else {}
    b.beam(bb, st, .035, .035, col, **k)                       # seat tube
    b.beam(bb, hd, .04, .04, col, **k)                         # down tube
    if b.hi:
        b.beam((0, .62, -.16), hd, .03, .03, col)              # step-through top tube
        b.beam(bb, sd, .03, .03, col)
        b.beam((0, .7, -.17), sd, .025, .025, col)
        b.beam((0, .33, .53), (0, 1.02, .3), .03, .03, 'steel')  # fork + steerer
    b.box(-.07, .86, -.34, .07, .92, -.1, 'black')             # saddle
    b.box(-.26, 1.0, .27, .26, 1.03, .31, 'steel')             # bars
    if basket:
        b.box(-.17, .72, .36, .17, .98, .7, 'steel' if col != 'b2' else 'black', skip='u')
    if b.hi:
        b.box(-.06, .64, -.86, .06, .67, -.42, 'steel')        # rear carrier


def bicycle_rack(b):
    """Row of five parked bicycles along X (3.2 m), front wheels in a low rail."""
    cols = ['b1', 'b2', 'b3', 'b2', 'b1']
    for i in range(5):
        with b.at((i - 2) * .64, 0, 0, ry=(0, 5, -4, 3, -2)[i]):
            bicycle(b, cols[i], basket=i != 3)
    b.box(-1.6, 0, .78, 1.6, .05, .86, 'grey')
    b.box(-1.6, 0, .2, 1.6, .05, .28, 'grey')
    if b.hi:
        for i in range(6):
            x = -1.6 + i * .64
            b.box(x - .015, .05, .2, x + .015, .3, .86, 'grey', skip='d')


def subway_entrance(b):
    """Subway stair canopy, 4 x 2.5 x 3 m: glass side walls, lit sign blank across the front (+Z), steps fading down toward -Z."""
    b.box(-2.0, 2.62, -1.25, 2.0, 3.0, 1.25, 'grey', u='kroof', d='white', f='sign_lit')
    xs = [-2.0, -1.2, -.5, .5, 1.2, 2.0]
    b.grid((0, 2.62, 1.251), (1, 0, 0), (0, 1, 0), xs, [0, .05, .33, .38], lambda u, v: ('sign_blue' if abs(u) > 1.2 else 'sign_lit') if .05 < v < .33 else 'grey_d')
    for sx in b.mirx():
        b.box(1.9, 0, -1.25, 2.0, .9, 1.2, 'conc')
        b.box(1.93, .9, -1.2, 1.97, 2.62, 1.15, 'glass')
        for z in (-1.2, 1.15):
            b.beam((1.95, .9, z), (1.95, 2.62, z), .08, .08, 'grey')
        if b.hi:
            b.cyl((1.82, .95, -1.2), (1.82, .95, 1.1), .025, n=4, col='steel', caps=0)
    b.box(-2.0, 0, -1.25, 2.0, 2.62, -1.15, 'conc', f='tile')
    # the stair well is not cut: steps drawn as darkening treads toward the back
    for i, c in enumerate(('step', 'grey_d', 'pit', 'black')):
        z1 = 1.2 - i * .55
        b.quad((-1.9, .012 + .0 * i, z1), (1.9, .012, z1), (1.9, .012, z1 - (.55 if i < 3 else .7)), (-1.9, .012, z1 - (.55 if i < 3 else .7)), c)
    if b.hi:
        b.box(-.03, 0, -1.1, .03, .95, 1.0, 'steel', skip='d')     # centre handrail
        b.box(-1.9, 2.0, -1.15, 1.9, 2.4, -1.12, 'sign_lit', skip='b')


def yatai(b):
    """Festival food stall, 2.7 x 1.8 x 2.6 m: striped awning, noren along the front (+Z), red lanterns."""
    for x in (-1.25, 1.25):
        for z in (-.8, .8):
            b.beam((x, 0, z), (x, 2.1, z), .06, .06, 'wood_d')
    b.box(-1.3, .82, .35, 1.3, .92, .85, 'wood', f='wood_d')          # counter
    b.box(-1.3, 0, .78, 1.3, .82, .82, 'red')                         # front skirt cloth
    for sx in b.mirx():
        b.box(1.26, 0, -.8, 1.3, .82, .8, 'red')
    b.box(-1.25, 0, -.84, 1.25, 2.1, -.8, 'white', f='red' if not b.hi else 'white')
    b.box(-.9, .92, .42, -.1, 1.0, .8, 'black', u='grey_d')           # griddle
    b.box(.2, .92, .45, .9, 1.12, .78, 'steel')
    # awning: gable along X, red / white stripes
    n = 9 if b.hi else 3
    xs = [-1.35 + 2.7 * i / n for i in range(n + 1)]
    st = lambda u, v: 'red' if int((u + 1.35) / 2.7 * n) % 2 == 0 else 'white'
    for sz in (1, -1):
        d = Vector((0, -.5, sz * .9))
        L = d.length
        b.grid((0, 2.6, 0), (1, 0, 0), d.normalized(), xs, [0, L], st, flip=sz < 0)
    for sx in b.mirx():
        b.poly([(1.35, 2.1, -.9), (1.35, 2.1, .9), (1.35, 2.6, 0)], 'white')
    # noren strips and lanterns on the front eave
    m = 6 if b.hi else 1
    for i in range(m):
        x0, x1 = -1.25 + 2.5 * i / m, -1.25 + 2.5 * (i + 1) / m
        b.quad((x0 + .02, 1.62, .88), (x1 - .02, 1.62, .88), (x1 - .02, 2.08, .88), (x0 + .02, 2.08, .88), 'noren')
    for x in (-1.2, -.4, .4, 1.2):
        b.sphere((x, 1.48 if abs(x) > 1 else 2.25, .95 if abs(x) > 1 else .98), (.13, .17, .13), n=6, m=3, col='lantern', nl=5)
        if b.hi:
            y = 1.48 if abs(x) > 1 else 2.25
            b.box(x - .06, y + .15, .9, x + .06, y + .19, 1.02, 'black')
            b.box(x - .06, y - .19, .9, x + .06, y - .15, 1.02, 'black')


def bench(b):
    for sx in b.mirx():
        b.box(.78, 0, -.25, .84, .42, -.2, 'grey_d')
        b.box(.78, 0, .2, .84, .42, .25, 'grey_d')
        b.box(.78, .38, -.25, .84, .44, .25, 'grey_d')
        b.beam((.81, .42, -.22), (.81, .86, -.32), .06, .05, 'grey_d')
    if b.hi:
        for z in (-.18, -.06, .06, .18):
            b.box(-.9, .44, z - .05, .9, .47, z + .05, 'wood')
        for y, z in ((.56, -.255), (.68, -.283), (.80, -.31)):
            b.box(-.9, y - .045, z - .015, .9, y + .045, z + .015, 'wood')
        b.box(-.02, .2, -.22, .02, .44, .22, 'grey_d')
    else:
        b.box(-.9, .44, -.23, .9, .47, .23, 'wood')
        b.beam((0, .5, -.24), (0, .85, -.32), 1.8, .03, 'wood', up=(0, 0, 1))


def pier_pilings(b):
    """Mooring dolphin: three steel pipe piles under a concrete cap with a tyre fender; base at the waterline, 5 m."""
    for i in range(3):
        a = 2 * pi * i / 3 + .5
        b.cyl((.6 * cos(a), 0, .6 * sin(a)), (.42 * cos(a), 4.0, .42 * sin(a)), .26, n=12, col='grey_d', caps=0, nl=4)
        if b.hi:
            b.cyl((.6 * cos(a), 0, .6 * sin(a)), (.585 * cos(a), .5, .585 * sin(a)), .275, n=12, col='conc_d', caps=0)
    b.cyl((0, 4.0, 0), (0, 4.6, 0), .95, n=12, col='conc', nl=8)
    b.cyl((0, 4.6, 0), (0, 5.0, 0), .16, .13, n=8, col='haz', nl=4)
    b.cyl((0, 4.25, .95), (0, 4.25, 1.15), .34, n=12, col='tyre', nl=4)


def waterfront_rail(b):
    """3.1 m promenade railing segment along X (half posts at both ends so segments tile), 1.1 m."""
    for sx in b.mirx():
        b.box(1.5, 0, -.05, 1.55, 1.04, .05, 'grey', skip='' if b.hi else 'udr')
        b.box(1.46, 0, -.08, 1.55, .04, .08, 'grey_d', skip='' if b.hi else 'dr')
    b.cyl((-1.55, 1.06, 0), (1.55, 1.06, 0), .04, n=8, col='steel', nl=4, caps=0)
    if b.hi:
        for y in (.14, .9):
            b.box(-1.5, y - .015, -.015, 1.5, y + .015, .015, 'grey', skip='lr')
        for i in range(1, 16):
            if i != 8:
                x = -1.5 + 3.0 * i / 16
                b.box(x - .01, .155, -.01, x + .01, .885, .01, 'grey', skip='ud')
        b.box(-.025, 0, -.04, .025, 1.03, .04, 'grey')
    else:
        b.box(-1.5, .14, 0, 1.5, .9, .001, 'grey', skip='udlr')
        b.box(-.025, 0, -.04, .025, 1.03, .04, 'grey', skip='ud')


def park_lamp(b):
    """Park globe lamp, 4 m."""
    b.lathe([(.16, 0), (.16, .12), (.09, .2), (.07, .9), (.055, 3.3), (.1, 3.36), (.12, 3.44)], n=8, col='gdark', nl=4, caps=1)
    b.sphere((0, 3.72, 0), .28, n=8, m=4, col='warm', nl=4)
    if b.hi:
        b.lathe([(.14, 3.42), (.1, 3.46)], n=8, col='gold', caps=0)


def billboard_roof(b):
    """Rooftop sign: steel frame, 8 x 5 m abstract lit panel facing +Z (colour blocks, no lettering)."""
    xs = [-4, -3.8, -2.2, -1.0, .4, 1.6, 3.0, 3.8, 4]
    ys = [1.2, 1.4, 2.3, 3.2, 4.1, 4.8, 5.0]

    def f(u, v):
        if abs(u) > 3.8 or v < 1.4 or v > 4.8:
            return 'grey_d'
        if not b.hi:
            return 'ad1' if u < -1.0 else ('ad3' if u < 1.6 else 'ad2')
        if u < -2.2:
            return 'ad1'
        if u < -1.0:
            return 'ad1' if v > 2.3 else 'ad4'
        if u < 1.6:
            return 'ad3' if 2.3 < v < 4.1 else ('ad4' if v < 2.3 else 'ad1')
        if u < 3.0:
            return 'ad2' if v > 2.3 else 'ad5'
        return 'ad2' if v < 4.1 else 'ad4'
    b.grid((0, 0, .15), (1, 0, 0), (0, 1, 0), xs if b.hi else [-4, -3.8, -1.0, 1.6, 3.8, 4], ys if b.hi else [1.2, 1.4, 4.8, 5.0], f)
    b.box(-4, 1.2, -.05, 4, 5.0, .15, 'grey_d', skip='f', b='black')
    for x in (-3.2, 0, 3.2):
        b.beam((x, 0, -.2), (x, 4.6, -.2), .14, .14, 'grey')
        b.beam((x, 0, -1.5), (x, 3.9, -.25), .1, .1, 'grey', lx=True)
        b.box(x - .25, 0, -1.7, x + .25, .08, 0, 'grey_d')
    b.beam((-3.2, .9, -.2), (3.2, .9, -.2), .1, .1, 'grey', lx=True)
    if b.hi:
        b.beam((-3.2, .9, -.2), (0, 0, -.2), .07, .07, 'grey')
        b.beam((3.2, .9, -.2), (0, 0, -.2), .07, .07, 'grey')
    for x in (-2.6, 0, 2.6):   # lamps washing the panel
        b.beam((x, 5.0, .1), (x, 5.25, .7), .04, .04, 'grey', lx=True)
        b.box(x - .2, 5.2, .62, x + .2, 5.304, .8, 'grey_d', d='led', skip='' if b.hi else 'lr')


MODELS = {
    'tokyo_streetlamp': (streetlamp, PP), 'tokyo_streetlamp_ginza': (streetlamp_ginza, PP), 'tokyo_utility_pole': (utility_pole, PP),
    'tokyo_traffic_signal': (traffic_signal, PP, {'settle': None}), 'tokyo_pedestrian_signal': (pedestrian_signal, PP, {'pin': False}),
    'tokyo_vending_machine': (vending_machine, PP), 'tokyo_koban': (koban, PP), 'tokyo_bus_stop': (bus_stop, PP, {'lod_ratio': .3, 'pin': False}),
    'tokyo_guard_rail': (guard_rail, PP), 'tokyo_torii': (torii, PP, {'settle': {'cx': False, 'cz': False, 'y0': True}}), 'tokyo_stone_lantern': (stone_lantern, PP), 'tokyo_mailbox': (mailbox, PP),
    'tokyo_bicycle_rack': (bicycle_rack, PP), 'tokyo_subway_entrance': (subway_entrance, PP, {'pin': False, 'lod_ratio': .3}), 'tokyo_yatai': (yatai, PP), 'tokyo_bench': (bench, PP, {'pin': False}),
    'tokyo_pier_pilings': (pier_pilings, PP, {'settle': {'cx': False, 'cz': False, 'y0': True}, 'lod_ratio': .34}), 'tokyo_waterfront_rail': (waterfront_rail, PP), 'tokyo_park_lamp': (park_lamp, PP),
    'tokyo_billboard_roof': (billboard_roof, PP, {'settle': {'cx': False, 'cz': False, 'y0': True}}),
}

if __name__ == '__main__':
    run(MODELS)
