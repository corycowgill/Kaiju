# far_sets.py - Tokyo set pieces: the Shuto Expressway T-pier and deck segment, the red-brick Yamanote viaduct segment.
#   blender -b -P tools/tokyo/design/far_sets.py -- [names]
# True size, metres; origin on the centreline at GROUND level, long axis Z for the two segments (they tile every 30 m).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from far_lib import *

SP = {
    'conc': (0xa9a79e, .9, 0), 'conc_d': (0x8a887f, .9, 0), 'conc_l': (0xbcbab0, .85, 0), 'stain': (0x77766e, .95, 0), 'steel': (0x8fa3a8, .5, .3),
    'steel_d': (0x6f8388, .55, .3), 'road': (0x3a3b3e, .9, 0), 'wall': (0xb9c2c0, .5, .1), 'wall_d': (0x8d9896, .55, .1), 'grey': (0x8e9396, .5, .2),
    'led': (0xf2f5ff, .3, 0, 0xeef4ff), 'line': (0xd8d6cc, .7, 0), 'haz': (0xe0b01c, .6, 0), 'black': (0x1d1e20, .7, 0),
    'brick': (0x8f4a38, .9, 0), 'brick_d': (0x733a2c, .9, 0), 'brick_l': (0xa25a44, .9, 0), 'stone': (0xb5ad9a, .85, 0), 'ballast': (0x6b665e, .95, 0),
    'track': (0x4a4640, .9, 0), 'shop': (0xc9b98a, .3, 0, 0xf2d79a), 'shop_d': (0x5a4a34, .6, 0, 0x6a4a20), 'aw1': (0xb8382a, .6, 0, 0x8a2418),
    'aw2': (0x2a5a8a, .6, 0, 0x183c66), 'aw3': (0xd8b040, .6, 0, 0xa88020), 'iron': (0x3f4a48, .6, .2),
}


def expressway_pier(b):
    """Shuto Expressway T-pier: chamfered column, 12 m hammerhead (along X) with its top face at y 14."""
    c = .35
    oc = [(-1.3 + c, -1.1), (1.3 - c, -1.1), (1.3, -1.1 + c), (1.3, 1.1 - c), (1.3 - c, 1.1), (-1.3 + c, 1.1), (-1.3, 1.1 - c), (-1.3, -1.1 + c)] if b.hi else \
        [(-1.3, -1.1), (1.3, -1.1), (1.3, 1.1), (-1.3, 1.1)]
    b.prism(oc, 'y', 0, 10.6, 'conc', caps=0)
    b.box(-1.5, 0, -1.3, 1.5, .5, 1.3, 'conc_d', skip='d')
    head = [(-1.3, 10.2), (1.3, 10.2), (6.0, 12.5), (6.0, 14.0), (-6.0, 14.0), (-6.0, 12.5)]
    b.prism(head, 'z', -1.2, 1.2, ['conc_d', 'conc', 'conc', 'conc_l', 'conc', 'conc'], capcol='conc')
    if b.hi:
        for y in (2.9, 4.8, 6.7, 8.6):       # pour joints
            b.box(-1.31, y, -1.11, 1.31, y + .06, 1.11, 'stain', skip='ud')
        b.box(-1.31, .5, -1.11, 1.31, 1.7, 1.11, 'haz', skip='ud')      # painted collision band
        b.box(-1.32, .8, -1.12, 1.32, 1.1, 1.12, 'black', skip='ud')
        for sx in b.mirx():
            b.cyl((1.42, .5, .7), (1.42, 11.0, .7), .08, n=4, col='grey', caps=0)   # drain pipes
            b.box(5.6, 12.9, -1.22, 6.02, 14.0, 1.22, 'conc_d', skip='lu')            # end plates


def expressway_deck_segment(b):
    """30 m of elevated expressway along Z, 18 m wide: steel box girders (soffit y 14), road at y 15.5, noise-wall parapets."""
    Z = 15.0
    gx = (-6.2, -2.1, 2.1, 6.2) if b.hi else (-6.2, 0, 6.2)
    for x in gx:
        hw = 1.0 if b.hi else (1.0 if x else 3.0)
        b.box(x - hw, 14.0, -Z, x + hw, 15.1, Z, 'steel', skip='ufb', d='steel_d')
    b.box(-9.0, 15.1, -Z, 9.0, 15.5, Z, 'conc', skip='fb', u='road', d='conc_d')
    for sx in b.mirx():
        b.prism([(8.55, 15.5), (9.0, 15.5), (9.0, 16.5), (8.75, 16.5)], 'z', -Z, Z, ['conc', 'conc_l', 'conc', 'conc_l'], caps=0)
        # noise wall: upright panels, the top leaning in over the road
        b.box(8.82, 16.5, -Z, 8.94, 17.9, Z, 'wall', skip='fbd' if b.hi else 'fbdu', l='wall_d')
        b.hexa([(8.82, 17.9, -Z), (8.94, 17.9, -Z), (8.94, 17.9, Z), (8.82, 17.9, Z), (8.3, 18.5, -Z), (8.42, 18.5, -Z), (8.42, 18.5, Z), (8.3, 18.5, Z)], 'wall',
               skip='dbf', l='wall_d')
        if b.hi:
            b.quad((1.0, 15.51, -Z), (1.15, 15.51, -Z), (1.15, 15.51, Z), (1.0, 15.51, Z), 'line')      # lane lines
            b.quad((8.2, 15.51, -Z), (8.35, 15.51, -Z), (8.35, 15.51, Z), (8.2, 15.51, Z), 'line')
            for z in (-7.5, 7.5):
                b.box(8.78, 16.5, z - .1, 8.98, 18.0, z + .1, 'grey', skip='du')            # wall posts
    b.box(-.3, 15.5, -Z, .3, 16.3, Z, 'conc_l', skip='fbd')                                   # median barrier
    if b.hi:
        for z in (-10, 0, 10):                                                                  # cross frames between the girders
            for x0, x1 in ((-5.2, -3.1), (-1.1, 1.1), (3.1, 5.2)):
                b.box(x0, 14.25, z - .1, x1, 14.9, z + .1, 'steel_d', skip='udlr')
        for sx in b.mirx():
            b.box(9.0, 15.2, -Z, 9.12, 15.4, Z, 'grey', skip='fbl')                           # drain / cable duct


def rail_viaduct_segment(b):
    """30 m of the red-brick arched Yamanote viaduct along Z, 22 m wide, deck top y 7: three arches per side with lit shopfront infill."""
    X, YT, R, YS = 11.0, 6.55, 3.7, 2.1
    n = 6 if b.hi else 3
    aw = ('aw1', 'aw2', 'aw3')
    for sx in b.mirx():
        for bi, zc in enumerate((-10.0, 0.0, 10.0)):
            pts = [(zc - R * cos(pi * i / n), YS + R * sin(pi * i / n)) for i in range(n + 1)]
            F = lambda z, y, x=X: (x, y, z)
            b.pid += 1
            # brick face: piers + spandrel round the arch
            b.face([F(zc - 5, 0), F(zc - R, 0), F(zc - R, YS), F(zc - 5, YT)][::-1], 'brick')
            b.face([F(zc - 5, YT), F(zc - R, YS), F(pts[1][0], pts[1][1]), F(pts[1][0], YT)][::-1], 'brick') if False else None
            b.face([F(zc + R, 0), F(zc + 5, 0), F(zc + 5, YT), F(zc + R, YS)][::-1], 'brick')
            for i in range(n):
                (z0, y0), (z1, y1) = pts[i], pts[i + 1]
                za = zc - 5 if i == 0 else z0
                zb = zc + 5 if i == n - 1 else z1
                b.face([F(z0, y0), F(z1, y1), F(zb, YT), F(za, YT)][::-1], 'brick')
            # recessed infill: lit shopfront below the springing, dim lunette above, awning band
            xi = X - (.6 if b.hi else .03)
            G = lambda z, y: (xi, y, z)
            b.face([G(zc - R, 0), G(zc + R, 0), G(zc + R, YS), G(zc - R, YS)][::-1], 'shop')
            b.face([G(z, y) for z, y in pts][::-1], 'shop_d')
            if b.hi:
                b.box(xi, YS - .1, zc - R + .2, xi + .45, YS + .6, zc + R - .2, aw[(bi + (0 if sx > 0 else 1)) % 3], skip='l')
            if b.hi:
                for i in range(n):   # arch ring soffit
                    (z0, y0), (z1, y1) = pts[i], pts[i + 1]
                    b.face([F(z0, y0), F(z1, y1), G(z1, y1), G(z0, y0)], 'brick_d')
                for z in (zc - R, zc + R):
                    b.face([F(z, 0), F(z, YS), G(z, YS), G(z, 0)] if z < zc else [F(z, 0), G(z, 0), G(z, YS), F(z, YS)], 'brick_d')
                for z in (zc - 1.3, zc + 1.3):   # shopfront mullions
                    b.box(xi, 0, z - .08, xi + .03, YS - .1, z + .08, 'iron', skip='ludfb')
        b.box(X - .1, YT, -15, X + .2, 7.0, 15, 'stone', skip='fbl')                # cornice
        b.box(X - .25, 7.0, -15, X + .05, 8.0, 15, 'brick_d', skip='fbd', u='stone')   # parapet
        b.beam((X - .7, 7.0, 0), (X - .7, 13.0, 0), .3, .3, 'iron', lx=True)       # catenary portal leg
    b.quad((-X, 7.0, 15), (X, 7.0, 15), (X, 7.0, -15), (-X, 7.0, -15), 'ballast')
    b.quad((-X, 0, 15), (X, 0, 15), (X, 7.0, 15), (-X, 7.0, 15), 'brick_d')      # end walls (hidden where segments abut)
    b.quad((X, 0, -15), (-X, 0, -15), (-X, 7.0, -15), (X, 7.0, -15), 'brick_d')
    for x in ((-7.5, -3.0, 3.0, 7.5) if b.hi else ()):
        b.quad((x - 1.3, 7.02, 15), (x + 1.3, 7.02, 15), (x + 1.3, 7.02, -15), (x - 1.3, 7.02, -15), 'track')
    b.beam((-X + .7, 13.0, 0), (X - .7, 13.0, 0), .3, .8, 'iron', lx=True)
    if b.hi:
        b.beam((-X + .7, 13.4, 0), (X - .7, 13.4, 0), .12, .12, 'iron')
        for x in (-7.5, -3.0, 3.0, 7.5):
            b.box(x - .06, 12.2, -.06, x + .06, 12.6, .06, 'iron', skip='ud')
    else:
        b.box(-.1, 13.3, -.1, .1, 13.46, .1, 'iron')


MODELS = {
    'expressway_pier': (expressway_pier, SP),
    'expressway_deck_segment': (expressway_deck_segment, SP, {'settle': None}),
    'rail_viaduct_segment': (rail_viaduct_segment, SP),
}

if __name__ == '__main__':
    run(MODELS)
