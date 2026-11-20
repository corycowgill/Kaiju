# icons_build_a1.py - tier A: Ferry Building, Coit Tower, City Hall, Grace Cathedral.
# blender -b -P icons_build_a1.py -- [id ...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from icons_lib import *


# ------------------------------------------------------------------ Ferry Building
@model('ferry_building', tier='A', fit=(201.5, 75.0, 56.0), face='west', stone=0xb8b0a0, water=True,
       close=((38, 30, 95), (0, 34, 18), 32),
       desc="Ferry Building: 201 m grey sandstone hall, modelled ground arcade and arched upper windows, pedimented end pavilions, triple-arched centre pavilion under the 75 m clock tower (four faces, tiered arcaded lantern), skylit nave ridge, pier side at -Z")
def ferry_building(b):
    S = 0xb3ab9a
    st = b.c(S); st2 = b.c(mul(S, 0.88)); st3 = b.c(mul(S, 1.08)); dark = b.c(0x30343a); roof = b.c(0x6f7376); copper = b.c(0x7d8f86, 0.6)
    white = b.c(0xcfcabd); flag = b.c(0xa8423a)

    def upper(c):
        c.rect(0, 0, 1, 1, S); c.noise(0.06, 6); c.joints(9, 2, 0.86)
        c.rect(0, 0, 0.09, 1, mul(S, 1.07), 0.75); c.rect(0.91, 0, 1, 1, mul(S, 1.07), 0.75); c.rect(0.09, 0, 0.105, 1, k=0.78); c.rect(0.895, 0, 0.91, 1, k=1.1)
        c.window(0.2, 0.1, 0.8, 0.8, 0x3a444c, mul(S, 0.8), arch=True, mull=(3, 3), surround=mul(S, 1.1), sw=0.035)
        c.rect(0, 0.9, 1, 1, mul(S, 1.05), 0.8); c.rect(0, 0.9, 1, 0.915, k=0.72); c.rect(0, 0, 1, 0.06, mul(S, 0.95), 0.7)
    def store(c):
        c.rect(0, 0, 1, 1, 0x3a4046); c.window(0.06, 0.04, 0.94, 0.95, 0x46525a, 0x6a6258, arch=True, mull=(3, 2), fw=0.02)
        c.rect(0.4, 0.04, 0.6, 0.5, 0x2e3236)
    def shaft(c):
        c.rect(0, 0, 1, 1, S); c.noise(0.06, 6); c.joints(8, 4, 0.86)
        c.rect(0, 0, 0.12, 1, mul(S, 1.05), 0.7); c.rect(0.88, 0, 1, 1, mul(S, 1.05), 0.7); c.joints(8, 0, 0.8, 1.5, reg=(0, 0, 0.12, 1)); c.joints(8, 0, 0.8, 1.5, reg=(0.88, 0, 1, 1))
        for x in (0.36, 0.64): c.window(x - 0.035, 0.25, x + 0.035, 0.75, 0x30363c, mul(S, 0.8), mull=(1, 1))
    def rear(c):
        c.rect(0, 0, 1, 1, mul(S, 0.97)); c.noise(0.06, 6); c.joints(8, 2, 0.88)
        c.window(0.25, 0.2, 0.75, 0.82, 0x3a444c, mul(S, 0.8), arch=True, mull=(2, 3), surround=mul(S, 1.08))
    def sky(c):
        c.rect(0, 0, 1, 1, 0x7f97a4); c.vgrad(1.15, 0.9)
        for i in range(8): c.rect(i / 8, 0, i / 8 + 0.02, 1, 0xa9a89f, 0.8)
        c.rect(0, 0.46, 1, 0.54, 0xa9a89f, 0.8)
    upper_s = b.band('upper', 128, upper, bay=5.0); store_s = b.band('store', 64, store, bay=5.0)
    shaft_s = b.band('shaft', 128, shaft, bay=9.6); rear_s = b.band('rear', 96, rear, bay=5.0); sky_s = b.band('sky', 32, sky, bay=6.0)
    ash_s = b.band('ash', 64, p_ashlar(S, 6, 3), bay=6.0)
    clock = b.decal('clock', 64, 64, p_clock(0xd6d0bc, 0x2a2a2c, 0x5e584c, S))

    X, ZF, ZB = 100.75, 23.0, -23.0
    Y1, Y2, Y3 = 7.2, 15.6, 17.4      # arcade top, upper floor top, parapet
    cw, ew = 19.0, 9.0                # half width of the centre pavilion, width of the end pavilions
    # ---- hall body: sides, back, roof
    b.box(-X, X, 0, Y1, ZB, ZF - 1.6, ash_s, f=None, notop=True)
    b.box(-X, X, Y1, Y2, ZB, ZF, ash_s, f=None, bk=rear_s, notop=True)
    b.box(-X - 0.5, X + 0.5, Y2, Y2 + 0.9, ZB - 0.5, ZF + 0.5, st3, bot=True); b.box(-X, X, Y2 + 0.9, Y3, ZB, ZF, st, top=roof)
    # ---- front wings: modelled ground arcade + textured arched upper floor
    for sx in (-1, 1):
        xa, xb = (cw, X - ew) if sx > 0 else (-X + ew, -cw)
        nb = 14
        b.arcade((xa, ZF), (xb, ZF), 0, 4.2, Y1, nb, st, depth=1.6, back=F(store_s, rep=1), pier=0.3, aseg=6, reveal=st2)
        b.wall((xa, ZF), (xb, ZF), Y1, Y2, F(upper_s, rep=nb))
        if b.hi: b.box(xa, xb, Y1 - 0.35, Y1 + 0.15, ZF, ZF + 0.35, st3, bot=True)
        # end pavilion: projects, three arches, pediment
        xe0, xe1 = (X - ew, X) if sx > 0 else (-X, -X + ew)
        b.arcade((xe0 - 0.0, ZF + 1.2), (xe1, ZF + 1.2), 0, 5.0, Y2, 1, st, depth=1.2, back=dark, pier=0.45, aseg=6, reveal=st2)
        b.wall((xe1, ZF + 1.2), (xe1, ZF), 0, Y2, st) if sx > 0 else b.wall((xe0, ZF), (xe0, ZF + 1.2), 0, Y2, st)
        b.wall((xe0, ZF), (xe0, ZF + 1.2), 0, Y2, st) if sx > 0 else b.wall((xe1, ZF + 1.2), (xe1, ZF), 0, Y2, st)
        b.box(xe0 - 0.4, xe1 + 0.4 * sx if sx > 0 else xe1 + 0.4, Y2, Y2 + 0.9, ZF, ZF + 1.7, st3, bot=True)
        b.gable(xe0 - 0.2, xe1 + 0.2, ZF - 6, ZF + 1.5, Y2 + 0.9, 2.6, roof, st, axis='z')
    # ---- centre pavilion: three tall arches between paired columns, attic
    zc = ZF + 2.5; YC = 20.0
    b.arcade((-cw, zc), (cw, zc), 0, 8.0, 14.6, 3, st, depth=2.2, back=dark, pier=0.42, aseg=8, reveal=st2)
    b.wall((cw, zc), (cw, ZF), 0, YC, st); b.wall((-cw, ZF), (-cw, zc), 0, YC, st)
    b.box(-cw - 0.5, cw + 0.5, 14.6, 15.8, ZF, zc + 0.6, st3, bot=True); b.box(-cw, cw, 15.8, YC, ZF - 8, zc, st, top=roof)
    for i in range(4):   # paired columns between the arches
        x0 = -cw + i * (2 * cw / 3)
        for dx in (-1.1, 1.1):
            if abs(x0 + dx) > cw - 0.3: continue
            b.colonnade((x0 + dx, zc + 0.75), (x0 + dx, zc + 0.75), 1.2, 13.4, 1, 0.62, st3, seg=8)
        b.bx(max(-cw + 1.6, min(cw - 1.6, x0)), zc + 0.75, 3.6, 1.7, 0, 1.2, st2)
    if b.hi:
        for i in range(3): b.bx(-cw + (i + 0.5) * 2 * cw / 3, zc + 0.05, 6.5, 0.12, 16.6, 2.4, st2)   # attic panels
    # ---- skylit nave along the ridge
    b.box(-X + 6, X - 6, Y3, Y3 + 2.4, -7, 7, sky_s, notop=True)
    b.gable(-X + 6, X - 6, -7, 7, Y3 + 2.4, 3.4, F(sky_s, bay=6.0), st2, axis='x')
    for sz in (-1, 1): b.box(-X + 3, X - 3, Y3, Y3 + 1.2, sz * 15 - 3, sz * 15 + 3, st2, top=roof)
    # ---- pier side (-Z): lower arcade of ferry gates with a canopy
    zp = -33.0
    b.box(-X + 4, X - 4, 0, 5.2, zp + 3.5, ZB, st2, top=roof, f=None)
    b.arcade((X - 4, zp + 3.5), (-X + 4, zp + 3.5), 0, 3.0, 5.2, b.d(32, 16), st, depth=1.0, back=dark, pier=0.35, aseg=4)
    b.face([(X - 4, 5.2, zp + 3.5), (-X + 4, 5.2, zp + 3.5), (-X + 4, 4.6, zp), (X - 4, 4.6, zp)], roof, two=True)
    if b.hi:
        for i in range(17): b.bx(-X + 6 + i * (2 * X - 12) / 16, zp + 0.3, 0.3, 0.3, 0, 4.6, dark)
    # ---- clock tower
    T = 4.8; tz = ZF - 3.2
    b.box(-T - 0.5, T + 0.5, YC, YC + 2.2, tz - T - 0.5, tz + T + 0.5, st2)
    y = b.stack(B.rect(-T, T, tz - T, tz + T), YC + 2.2, [(7.4, F(shaft_s, rep=1))] * 3, None)
    b.box(-T - 0.7, T + 0.7, y, y + 1.0, tz - T - 0.7, tz + T + 0.7, st3, bot=True); y += 1.0
    b.box(-T, T, y, y + 9.0, tz - T, tz + T, st)
    for a in range(4):   # four clock faces
        s = b.sub(); s.face([(-3.35, y + 1.1, T + 0.12), (3.35, y + 1.1, T + 0.12), (3.35, y + 7.8, T + 0.12), (-3.35, y + 7.8, T + 0.12)], clock)
        if b.hi: s.bx(0, T + 0.05, 7.4, 0.1, y + 0.7, 7.5, st3)
        b.add(s, t=(0, 0, tz), ry=a * 90)
    y += 9.0
    b.box(-T - 0.9, T + 0.9, y, y + 1.2, tz - T - 0.9, tz + T + 0.9, st3, bot=True); y += 1.2
    # belvedere 1: open square arcade, three arches a side
    T1 = 3.9
    for a in range(4):
        s = b.sub(); s.arcade((-T1, T1), (T1, T1), y, y + 3.6, y + 6.2, 3, st, depth=0.9, back=dark, pier=0.32, aseg=6, reveal=st2); b.add(s, t=(0, 0, tz), ry=a * 90)
    b.box(-T1 - 0.6, T1 + 0.6, y + 6.2, y + 7.0, tz - T1 - 0.6, tz + T1 + 0.6, st3, bot=True); y += 7.0
    # belvedere 2: smaller, two arches a side
    T2 = 2.9
    for a in range(4):
        s = b.sub(); s.arcade((-T2, T2), (T2, T2), y, y + 2.6, y + 4.6, 2, st, depth=0.7, back=dark, pier=0.36, aseg=6, reveal=st2); b.add(s, t=(0, 0, tz), ry=a * 90)
    b.box(-T2 - 0.5, T2 + 0.5, y + 4.6, y + 5.2, tz - T2 - 0.5, tz + T2 + 0.5, st3, bot=True); y += 5.2
    # round lantern, dome, finial and flagpole to 75 m
    sg = b.d(12, 6)
    b.lathe(0, tz, [(2.2, y), (2.2, y + 3.0), (2.5, y + 3.2), (2.5, y + 3.6)], sg, st, smooth=False, capt=st)
    if b.hi:
        for i in range(6):
            a = math.radians(i * 60 + 30); b.bx(2.22 * math.sin(a), tz + 2.22 * math.cos(a), 0.5, 0.5, y + 0.4, 2.2, dark)
    y += 3.6
    b.lathe(0, tz, [(2.3, y), (2.1, y + 1.2), (1.5, y + 2.3), (0.6, y + 3.0), (0.45, y + 3.2)], sg, copper)
    b.lathe(0, tz, [(0.45, y + 3.2), (0.5, y + 4.6), (0.0, y + 5.6)], b.d(8, 4), st3)
    b.tube((0, y + 5.4, tz), (0, 75.0, tz), 0.12, white, seg=4)
    if b.hi: b.face([(0, 73.2, tz), (2.6, 73.2, tz), (2.6, 74.8, tz), (0, 74.8, tz)], flag, two=True)


# ------------------------------------------------------------------ Coit Tower
@model('coit_tower', tier='A', fit=(22.5, 64.0, 22.0), face='north', stone=0xd2cec2,
       close=((16, 44, 30), (0, 53, 0), 40),
       desc="Coit Tower: white fluted concrete shaft on its rectangular two-step base, the arched loggia and the set-back open top ring")
def coit_tower(b):
    W = 0xc4c0b4
    w = b.c(W); w2 = b.c(mul(W, 0.9)); w3 = b.c(mul(W, 1.05)); dark = b.c(0x33373c); gl = b.c(0x3d4850, 0.3); pav = b.c(0x8e8a80)

    def basew(c):
        c.rect(0, 0, 1, 1, W); c.noise(0.05, 6); c.joints(5, 0, 0.9)
        c.window(0.3, 0.3, 0.7, 0.8, 0x39434c, mul(W, 0.8), mull=(2, 3)); c.rect(0, 0, 1, 0.1, mul(W, 0.9))
    base_s = b.band('basew', 64, basew, bay=4.0)
    # base: terrace, rectangular block, upper block
    b.box(-11.25, 11.25, 0, 0.8, -11, 11, pav, top=pav)
    b.box(-9.6, 9.6, 0.8, 5.8, -9.2, 9.2, base_s, top=w2)
    b.box(-9.9, 9.9, 5.8, 6.4, -9.5, 9.5, w3, bot=True)
    b.box(-7.2, 7.2, 6.4, 9.2, -7.0, 7.0, w, top=w2)
    # entrance: recessed doorway with steps on the front
    b.arcade((-2.6, 9.25), (2.6, 9.25), 0.8, 3.4, 5.6, 1, w3, depth=0.5, back=dark, pier=0.45, aseg=6)
    b.box(-3.4, 3.4, 0, 0.8, 11, 11.0, pav) if False else None
    # fluted shaft: 24 flutes, slight taper
    nf = b.d(24, 12)
    def ring(y, r, depth):
        pts = []
        for i in range(nf * 2):
            a = 2 * math.pi * i / (nf * 2); rr = r if i % 2 == 0 else r - depth
            pts.append((rr * math.sin(a), y, rr * math.cos(a)))
        return pts
    ys = [(9.2, 5.5), (20.0, 5.25), (33.0, 5.0), (45.5, 4.85)]
    b.loft([ring(y, r, 0.42) for (y, r) in ys], None, skins=[w if i % 2 == 0 else w2 for i in range(nf * 2)])
    b.lathe(0, 0, [(5.9, 9.2), (5.9, 10.0), (5.5, 10.4)], b.d(24, 12), w3)
    # loggia: tall arches all round
    na = 12; y0, y1 = 45.5, 55.2; R = 5.25
    b.lathe(0, 0, [(4.85, y0 - 0.2), (R + 0.25, y0), (R + 0.25, y0 + 0.5)], b.d(24, 12), w3, capt=w3)
    for i in range(na):
        a0 = 2 * math.pi * i / na; a1 = 2 * math.pi * (i + 1) / na
        b.arcade((R * math.sin(a0), R * math.cos(a0)), (R * math.sin(a1), R * math.cos(a1)), y0 + 0.5, y0 + 6.2, y1, 1, w, depth=0.8, back=gl, pier=0.42, aseg=b.d(8, 4), reveal=w2)
    b.lathe(0, 0, [(R + 0.1, y1), (R + 0.45, y1 + 0.3), (R + 0.45, y1 + 0.9)], b.d(24, 12), w3, capt=w2, capb=w2)
    # set-back open ring
    y2, y3 = y1 + 0.9, 62.4; R2 = 4.3
    for i in range(na):
        a0 = 2 * math.pi * (i + 0.5) / na; a1 = 2 * math.pi * (i + 1.5) / na
        b.arcade((R2 * math.sin(a0), R2 * math.cos(a0)), (R2 * math.sin(a1), R2 * math.cos(a1)), y2, y2 + 3.4, y3, 1, w, depth=0.6, back=dark, pier=0.4, aseg=b.d(6, 3), reveal=w2)
    b.lathe(0, 0, [(R2, y3), (R2 + 0.3, y3 + 0.3), (R2 + 0.3, 64.0), (R2 - 0.5, 64.0), (R2 - 0.5, 63.0)], b.d(24, 12), w3)
    b.lathe(0, 0, [(R2 - 0.5, 63.0), (0, 63.0)], b.d(24, 12), w2)


# ------------------------------------------------------------------ City Hall
@model('sf_city_hall', tier='A', fit=(127.0, 94.0, 98.0), face='east', stone=0xbdb9ae,
       close=((34, 52, 100), (0, 56, 0), 34),
       desc="City Hall: grey granite Beaux-Arts block, rusticated base, giant Doric colonnades on all four fronts, pedimented centre pavilions on both long fronts, drum with free-standing columns, ribbed dark dome with gilded ribs, lantern and spire")
def sf_city_hall(b):
    G = 0xb4b0a6
    g = b.c(G); g2 = b.c(mul(G, 0.88)); g3 = b.c(mul(G, 1.07)); dark = b.c(0x33373c); roof = b.c(0x74787a); gold = b.c(0xc9a640, 0.4, 0.5)
    lead = b.c(0x3e4a52, 0.5, 0.2); door = b.c(0x6e5a34, 0.5, 0.3)

    def base(c):
        c.rect(0, 0, 1, 1, G); c.noise(0.06, 6); c.joints(7, 2, 0.7, 2.0)
        c.window(0.3, 0.12, 0.7, 0.78, 0x343c44, mul(G, 0.8), arch=True, mull=(2, 2), surround=mul(G, 1.06), sw=0.03)
        c.rect(0, 0.93, 1, 1, mul(G, 1.08), 0.8); c.rect(0, 0.93, 1, 0.945, k=0.75)
    def colw(c):   # recessed wall behind the colonnade: two floors
        c.rect(0, 0, 1, 1, mul(G, 0.93)); c.noise(0.05, 6); c.joints(12, 2, 0.9)
        c.window(0.24, 0.07, 0.76, 0.52, 0x343c44, mul(G, 0.8), arch=True, mull=(2, 3), surround=mul(G, 1.05), sw=0.03)
        c.window(0.28, 0.64, 0.72, 0.92, 0x343c44, mul(G, 0.8), mull=(2, 2), surround=mul(G, 1.05), sw=0.025)
        c.vgrad(0.8, 1.0)
    def pilw(c):   # pavilion wall: pilasters + two floors
        c.rect(0, 0, 1, 1, G); c.noise(0.05, 6); c.joints(12, 2, 0.9)
        c.rect(0, 0, 0.1, 1, mul(G, 1.07), 0.75); c.rect(0.9, 0, 1, 1, mul(G, 1.07), 0.75); c.rect(0.1, 0, 0.115, 1, k=0.78)
        c.window(0.28, 0.07, 0.72, 0.52, 0x343c44, mul(G, 0.8), arch=True, mull=(2, 3), surround=mul(G, 1.06), sw=0.03)
        c.window(0.3, 0.64, 0.7, 0.92, 0x343c44, mul(G, 0.8), mull=(2, 2), surround=mul(G, 1.06), sw=0.025)
    def attic(c):
        c.rect(0, 0, 1, 1, G); c.noise(0.05, 6); c.window(0.3, 0.2, 0.7, 0.8, 0x343c44, mul(G, 0.8), mull=(2, 1))
        c.rect(0, 0.88, 1, 1, mul(G, 1.08), 0.8)
    def dome(c):   # dark lead with gilded ribs and ornament
        c.rect(0, 0, 1, 1, 0x3e4a52); c.noise(0.1, 5)
        c.rect(0, 0, 0.09, 1, 0xc9a640, 0.8); c.rect(0.91, 0, 1, 1, 0xc9a640, 0.8)
        for (y0_, y1_) in ((0.08, 0.3), (0.38, 0.6), (0.68, 0.86)):
            c.ell(0.5, (y0_ + y1_) / 2, 0.2, (y1_ - y0_) / 2, 0xb8963a); c.ell(0.5, (y0_ + y1_) / 2, 0.13, (y1_ - y0_) / 2 * 0.7, 0x3e4a52)
        c.rect(0, 0, 1, 0.05, 0xc9a640, 0.8); c.rect(0, 0.93, 1, 1, 0xc9a640, 0.8)
    def drumw(c):
        c.rect(0, 0, 1, 1, mul(G, 0.95)); c.noise(0.05, 6); c.window(0.25, 0.1, 0.75, 0.86, 0x343c44, mul(G, 0.8), arch=True, mull=(2, 4), surround=mul(G, 1.06))
    base_s = b.band('base', 96, base, bay=5.2); colw_s = b.band('colw', 128, colw, bay=5.2); pil_s = b.band('pilw', 128, pilw, bay=5.2)
    att_s = b.band('attic', 32, attic, bay=5.2); dome_s = b.band('dome', 64, dome); drum_s = b.band('drumw', 64, drumw)

    X, Z = 63.5, 42.0
    Y1, Y2, Y3, Y4 = 7.4, 19.4, 22.0, 25.6     # base top, column top, entablature top, attic top
    pw = 13.0      # corner pavilion width
    cw = 18.0      # half width of the centre pavilions
    # base storey all round
    b.box(-X, X, 0, Y1, -Z, Z, base_s, notop=True)
    b.box(-X - 0.4, X + 0.4, Y1 - 0.3, Y1, -Z - 0.4, Z + 0.4, g3, bot=True)
    # recessed wall behind the colonnades and the corner pavilions
    b.box(-X + 2.6, X - 2.6, Y1, Y2, -Z + 2.6, Z - 2.6, colw_s, notop=True)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box(min(sx * X, sx * (X - pw)), max(sx * X, sx * (X - pw)), Y1, Y2, min(sz * Z, sz * (Z - pw)), max(sz * Z, sz * (Z - pw)), pil_s, notop=True)
    # entablature + attic + roof
    b.box(-X - 0.6, X + 0.6, Y2, Y3, -Z - 0.6, Z + 0.6, g3, bot=True)
    if b.hi: b.box(-X - 0.9, X + 0.9, Y3 - 0.5, Y3 + 0.12, -Z - 0.9, Z + 0.9, g, bot=True)
    b.box(-X + 2.0, X - 2.0, Y3, Y4, -Z + 2.0, Z - 2.0, att_s, top=roof)
    # light courts (dark wells in the roof) either side of the centre
    for sx in (-1, 1): b.box(sx * 38 - 12, sx * 38 + 12, Y4 - 0.1, Y4 + 0.05, -16, 16, dark)
    # colonnades: long fronts between the centre and the corner pavilions; the short ends
    r = 0.85
    for sz in (-1, 1):
        for sx in (-1, 1):
            xa, xb = sx * (cw + 2.2), sx * (X - pw - 2.2)
            b.colonnade((xa, sz * (Z - 1.1)), (xb, sz * (Z - 1.1)), Y1, Y2 - Y1, 7, r, g3, seg=8)
    for sx in (-1, 1):
        b.colonnade((sx * (X - 1.1), -(Z - pw - 2.4)), (sx * (X - 1.1), Z - pw - 2.4), Y1, Y2 - Y1, 11, r, g3, seg=8)
    # centre pavilions on both long fronts: projecting temple front, six columns, pediment, steps
    for sz in (-1, 1):
        s = b.sub(); zf = Z + 5.0
        s.box(-cw, cw, 0, Y1, Z, zf, base_s, bk=None, notop=True)
        s.box(-cw, cw, Y1, Y2, Z - 2.6, zf - 3.2, pil_s, bk=None, notop=True)
        for i in range(3): s.bx(-7.0 + i * 7.0, zf + 0.03, 3.0, 0.1, 0.6, 5.4, door)     # the three doors
        s.colonnade((-cw + 1.6, zf - 1.3), (cw - 1.6, zf - 1.3), Y1, Y2 - Y1, 8, 1.0, g3, seg=10)
        s.box(-cw - 0.6, cw + 0.6, Y2, Y3, Z - 1, zf + 0.6, g3, bot=True)
        s.gable(-cw - 0.6, cw + 0.6, Z - 14, zf + 0.6, Y3, 5.6, roof, g, axis='z')
        if s.hi:
            s.face([(-cw + 3, Y3 + 0.5, zf + 0.66), (cw - 3, Y3 + 0.5, zf + 0.66), (0, Y3 + 4.4, zf + 0.66)], g2)      # tympanum relief
            s.box(-cw, cw, Y1, Y1 + 1.0, zf - 0.2, zf + 0.1, g3)     # balustrade
        for k in range(4): s.box(-cw + 2, cw - 2, 0, 1.2 - k * 0.3, zf, zf + 0.5 * (k + 1), g2)   # steps
        b.add(s, sc=(1, 1, sz))
    # block under the dome
    b.box(-20, 20, Y4, 32.0, -20, 20, pil_s if False else g, top=roof)
    if b.hi:
        for a in range(4):
            s = b.sub(); s.wall((-20, 20.02), (20, 20.02), Y4 + 0.6, 31.2, F(att_s, rep=8)); b.add(s, ry=a * 90)
    sg = b.d(32, 16)
    b.lathe(0, 0, [(19.0, 32.0), (19.0, 35.0), (18.2, 36.0)], sg, g3, capt=g2)
    # drum: wall with tall arched windows, ring of free-standing columns
    b.lathe(0, 0, [(14.6, 36.0), (14.6, 50.5)], b.d(24, 12), drum_s, ub=1)
    nc = 24
    for i in range(nc):
        a = 2 * math.pi * (i + 0.5) / nc
        b.colonnade((17.0 * math.sin(a), 17.0 * math.cos(a)), (0, 0), 36.0, 14.0, 1, 0.8, g3, seg=8, base=False)
    b.lathe(0, 0, [(15.0, 50.0), (18.2, 50.0), (18.2, 52.4), (17.4, 52.4)], sg, g3)
    b.lathe(0, 0, [(17.4, 52.4), (15.0, 52.4)], sg, g2)
    # attic drum with gilded panels, then the dome
    b.lathe(0, 0, [(15.0, 52.4), (15.0, 57.0), (15.5, 57.3), (15.5, 58.0), (14.4, 58.0)], sg, g)
    if b.hi:
        for i in range(16):
            a = 2 * math.pi * i / 16; b.bx(15.05 * math.sin(a), 15.05 * math.cos(a), 1.3, 1.3, 53.6, 2.2, gold)
    R = 14.4; prof = [(R * math.cos(t), 58.0 + 17.0 * math.sin(t)) for t in [math.radians(x) for x in (0, 14, 28, 42, 56, 68, 77)]]
    if not b.hi: prof = prof[::2]
    b.lathe(0, 0, prof, b.d(24, 12), dome_s, ub=1 if b.hi else 2)
    yt = prof[-1][1]; rt = prof[-1][0]
    b.lathe(0, 0, [(rt, yt), (rt + 0.5, yt + 0.3), (rt + 0.5, yt + 1.0), (2.9, yt + 1.0)], b.d(16, 8), gold)
    # lantern: colonnaded drum, cupola, spire to 94 m
    yl = yt + 1.0
    b.lathe(0, 0, [(2.4, yl), (2.4, yl + 6.0)], b.d(12, 6), dark)
    for i in range(b.d(10, 5)):
        a = 2 * math.pi * i / b.d(10, 5); b.tube((3.0 * math.sin(a), yl, 3.0 * math.cos(a)), (3.0 * math.sin(a), yl + 6.0, 3.0 * math.cos(a)), 0.3, g3, seg=4)
    b.lathe(0, 0, [(3.5, yl + 6.0), (3.5, yl + 6.8), (2.6, yl + 7.6), (1.5, yl + 9.4), (0.7, yl + 10.2), (0.5, yl + 11.6), (0.9, yl + 12.0), (0.25, yl + 13.2)], b.d(12, 6), gold, capb=g2)
    b.tube((0, yl + 13.0, 0), (0, 94.0, 0), 0.25, gold, seg=4, r1=0.05)


# ------------------------------------------------------------------ Grace Cathedral
@model('grace_cathedral', tier='A', fit=(43.5, 75.0, 96.0), face='east', stone=0xb9b2a2,
       close=((30, 22, 92), (0, 30, 40), 30),
       desc="Grace Cathedral: concrete French Gothic, twin 53 m west towers with louvred lancets and pinnacles, rose window over the gilded doors, buttressed aisles and clerestory nave, transept, polygonal apse, the gilded copper fleche")
def grace_cathedral(b):
    C = 0xb4ad9e
    cc = b.c(C); c2 = b.c(mul(C, 0.88)); c3 = b.c(mul(C, 1.07)); dark = b.c(0x34383e); slate = b.c(0x6a7078); gold = b.c(0xc4a040, 0.4, 0.5); verd = b.c(0x6f9a88, 0.6)
    glassc = 0x3a4660

    def lancet(c, x0, y0, x1, y1, col=glassc, frame=None):
        h = (x1 - x0) * c.w / c.h * 0.9
        if frame is not None:
            e = 0.025; c.poly([(x0 - e, y0 - e), (x1 + e, y0 - e), (x1 + e, y1 - h), ((x0 + x1) / 2, y1 + e * 2), (x0 - e, y1 - h)], frame, 0.7)
        c.poly([(x0, y0), (x1, y0), (x1, y1 - h), ((x0 + x1) / 2, y1), (x0, y1 - h)], col, 0.25)
    def belfry(c):
        c.rect(0, 0, 1, 1, C); c.noise(0.06, 6); c.rect(0, 0, 0.1, 1, mul(C, 1.06), 0.75); c.rect(0.9, 0, 1, 1, mul(C, 1.06), 0.75)
        for x in (0.2, 0.55):
            lancet(c, x, 0.06, x + 0.25, 0.9, 0x40444a, mul(C, 0.85))
            for j in range(12): c.rect(x, 0.08 + j * 0.06, x + 0.25, 0.1 + j * 0.06, None, k=1.5)
        c.rect(0, 0.94, 1, 1, mul(C, 1.08), 0.8)
    def tmid(c):
        c.rect(0, 0, 1, 1, C); c.noise(0.06, 6); c.joints(8, 3, 0.9); c.rect(0, 0, 0.1, 1, mul(C, 1.06), 0.75); c.rect(0.9, 0, 1, 1, mul(C, 1.06), 0.75)
        for x in (0.3, 0.56): lancet(c, x, 0.2, x + 0.14, 0.8, glassc, mul(C, 0.85))
        c.rect(0, 0.95, 1, 1, mul(C, 0.85))
    def clere(c):
        c.rect(0, 0, 1, 1, C); c.noise(0.06, 6); c.rect(0, 0, 0.08, 1, mul(C, 1.07), 0.75); c.rect(0.92, 0, 1, 1, mul(C, 1.07), 0.75)
        for x in (0.18, 0.44, 0.7): lancet(c, x, 0.12, x + 0.14, 0.86, glassc, mul(C, 0.85))
        c.rect(0, 0.94, 1, 1, mul(C, 1.08), 0.8)
    def aisle(c):
        c.rect(0, 0, 1, 1, C); c.noise(0.06, 6); c.joints(6, 2, 0.9)
        for x in (0.3, 0.56): lancet(c, x, 0.2, x + 0.16, 0.85, glassc, mul(C, 0.85))
    def rose(c):
        c.rect(0, 0, 1, 1, C); c.ell(0.5, 0.5, 0.48, None, mul(C, 0.8)); c.ell(0.5, 0.5, 0.43, None, 0x34406a)
        for i in range(12):
            a = 2 * math.pi * i / 12; c.ell(0.5 + 0.3 * math.sin(a), 0.5 + 0.3 * math.cos(a), 0.075, None, [0x8a3a4a, 0x3a6a9a, 0xb08a3a][i % 3])
            c.line(0.5, 0.5, 0.5 + 0.43 * math.sin(a + 0.26), 0.5 + 0.43 * math.cos(a + 0.26), 1.6, mul(C, 0.85))
        c.ell(0.5, 0.5, 0.13, None, mul(C, 0.85)); c.ell(0.5, 0.5, 0.09, None, 0x9a4a4a)
    def portal(c):
        c.rect(0, 0, 1, 1, C)
        lancet(c, 0.08, 0.0, 0.92, 0.97, mul(C, 0.8)); lancet(c, 0.16, 0.0, 0.84, 0.86, mul(C, 0.65)); lancet(c, 0.25, 0.0, 0.75, 0.72, 0x9a8040)
        c.rect(0.49, 0, 0.51, 0.6, 0x5a4a2a)
        for j in range(5): c.rect(0.25, 0.1 * j + 0.02, 0.75, 0.1 * j + 0.03, 0x6a5a30)
    bel_s = b.band('belfry', 128, belfry, bay=10.5); tmid_s = b.band('tmid', 96, tmid, bay=10.5); cl_s = b.band('clere', 96, clere, bay=6.0)
    ai_s = b.band('aisle', 64, aisle, bay=6.0); sl_s = b.band('slate', 32, p_tiles(0x66707a, 12, 3, 0.85), bay=5.0)
    rose_d = b.decal('rose', 64, 64, rose); portal_d = b.decal('portal', 64, 96, portal)

    ZF = 48.0; TW = 10.4; tx = 12.6       # towers 10.4 m square at x = +-12.6
    NW, NH, NR = 7.6, 25.0, 33.0           # nave half width, wall height, ridge
    AW, AH = 16.0, 11.5                    # aisle outer half width, wall height
    zt = ZF - TW                           # back of the towers
    ztr0, ztr1 = -20.0, -6.0               # transept
    zap = -36.0                            # start of the apse
    # ---- nave + aisles
    b.box(-NW, NW, 0, AH + 3.0, zap, zt, cc, notop=True)
    b.box(-NW, NW, AH + 3.0, NH, zap, zt, cl_s, f=None, bk=None, notop=True)
    b.gable(-NW - 0.4, NW + 0.4, zap, zt, NH, NR - NH, sl_s, cc, axis='z')
    for sx in (-1, 1):
        x0, x1 = (NW, AW) if sx > 0 else (-AW, -NW)
        b.box(x0, x1, 0, AH, ztr1, zt, ai_s, notop=True, f=None, **({'l': None} if sx > 0 else {'r': None}))
        b.box(x0, x1, 0, AH, zap, ztr0, ai_s, notop=True, **({'l': None} if sx > 0 else {'r': None}))
        for (za, zb) in ((ztr1, zt), (zap, ztr0)):   # lean-to aisle roofs
            q = [(sx * AW, AH, zb), (sx * AW, AH, za), (sx * NW, AH + 2.8, za), (sx * NW, AH + 2.8, zb)]
            b.face(q if sx > 0 else q[::-1], sl_s if False else slate)
        # buttresses with pinnacles, flying up to the clerestory
        zs = [zt - 3 - i * 6.0 for i in range(7)] + [ztr0 - 2.5 - i * 6.0 for i in range(3)]
        for z in zs:
            if ztr0 - 1 < z < ztr1 + 1: continue
            b.bx(sx * (AW + 0.9), z, 1.8, 1.3, 0, AH + 2.0, c3)
            if b.hi:
                b.frust((sx * (AW + 0.9) - 0.6, sx * (AW + 0.9) + 0.6, z - 0.6, z + 0.6), (sx * (AW + 0.9), sx * (AW + 0.9), z, z), AH + 2.0, AH + 5.2, c2)
                b.beam((sx * (AW + 0.4), AH + 2.0, z), (sx * NW, NH - 4.0, z), 0.6, 0.9, c3)
    # ---- transept
    b.box(-21.75, 21.75, 0, NH, ztr0, ztr1, cc, notop=True)
    for sx in (-1, 1):
        b.gable(min(sx * NW, sx * 21.75), max(sx * NW, sx * 21.75), ztr0 - 0.3, ztr1 + 0.3, NH, NR - NH, sl_s, cc, axis='x')
        s = b.sub(); s.face([(-5.0, 9.0, 0), (5.0, 9.0, 0), (5.0, 19.0, 0), (-5.0, 19.0, 0)], rose_d)
        b.add(s, t=(sx * 21.8, 0, (ztr0 + ztr1) / 2), ry=90 * sx)
        for dz in (ztr0 + 0.5, ztr1 - 0.5): b.bx(sx * 21.5, dz, 1.6, 1.8, 0, NH + 3.0, c3)
    # ---- apse: five-sided chevet with tall lancets
    ap = [(-NW, zap), (-NW, zap - 5.5), (-4.0, -48.0), (4.0, -48.0), (NW, zap - 5.5), (NW, zap)]
    b.prism(ap, 0, AH + 3.0, cc, notop=True, skins={5: None})
    b.prism(ap, AH + 3.0, NH, F(cl_s, rep=1), notop=True, skins={5: None})
    apx = (0, zap - 3.0)
    o = b._orient(ap)
    for i in range(len(o)):
        p, q = o[i], o[(i + 1) % len(o)]
        if abs(p[1] - zap) < 1e-6 and abs(q[1] - zap) < 1e-6: continue
        b.face([(p[0], NH, p[1]), (q[0], NH, q[1]), (apx[0], NR, apx[1])], slate)
    b.face([(-NW, NH, zap), (NW, NH, zap), (0, NR, zap)][::-1], slate) if False else None
    b.face([(NW, NH, zap), (0, NR, zap), (0, NR, zap - 3.0)], slate); b.face([(0, NR, zap), (-NW, NH, zap), (0, NR, zap - 3.0)], slate)
    # low ambulatory / chapels round the apse
    amb = [(-AW, zap), (-AW, zap - 6.0), (-7.0, -48.0), (-4.0, -48.0), (-NW, zap - 5.5), (-NW, zap)]
    for sx in (-1, 1):
        pl = [(sx * x, z) for (x, z) in amb]
        b.prism(pl, 0, AH - 1.5, ai_s if False else cc, top=slate)
    # ---- west front between the towers: portal, rose, gable
    b.box(-tx + TW / 2, tx - TW / 2, 0, NH + 1.0, zt, ZF - 1.2, cc, bk=None, l=None, r=None, notop=True)
    zf = ZF - 1.2
    b.face([(-tx + TW / 2, NH + 1.0, zf), (tx - TW / 2, NH + 1.0, zf), (0, NR + 2.5, zf)], cc)
    b.face([(tx - TW / 2, NH + 1.0, zf - 0.6), (-tx + TW / 2, NH + 1.0, zf - 0.6), (0, NR + 2.5, zf - 0.6)], cc)
    b.face([(-4.2, 13.6, zf + 0.06), (4.2, 13.6, zf + 0.06), (4.2, 22.0, zf + 0.06), (-4.2, 22.0, zf + 0.06)], rose_d)
    b.face([(-3.3, 0, zf + 0.5), (3.3, 0, zf + 0.5), (3.3, 10.2, zf + 0.5), (-3.3, 10.2, zf + 0.5)], portal_d)
    b.box(-3.6, 3.6, 0, 10.6, zf, zf + 0.45, c3, f=None)
    b.face([(-3.6, 10.6, zf + 0.5), (3.6, 10.6, zf + 0.5), (0, 13.0, zf + 0.5)], c3)
    if b.hi:
        b.box(-tx + TW / 2, tx - TW / 2, 22.6, 23.4, zf, zf + 0.4, c3)
        b.tube((0, NR + 2.3, zf - 0.3), (0, NR + 5.0, zf - 0.3), 0.14, gold, seg=4); b.beam((-0.8, NR + 4.1, zf - 0.3), (0.8, NR + 4.1, zf - 0.3), 0.2, 0.2, gold)
    # ---- twin towers
    for sx in (-1, 1):
        s = b.sub(); h = TW / 2
        y = s.stack(B.rect(-h, h, -h, h), 0, [(11.5, F(tmid_s, rep=1)), (10.5, F(tmid_s, rep=1)), (9.0, F(tmid_s, rep=1)), (17.0, F(bel_s, rep=1))], None)
        s.face([(-1.9, 0, h + 0.04), (1.9, 0, h + 0.04), (1.9, 6.4, h + 0.04), (-1.9, 6.4, h + 0.04)], portal_d)   # side portals
        s.box(-h - 0.3, h + 0.3, y, y + 1.6, -h - 0.3, h + 0.3, c3, top=c2, bot=True)
        for cx in (-1, 1):
            for cz in (-1, 1):
                s.bx(cx * (h + 0.1), cz * (h + 0.1), 1.9, 1.9, 0, y + 1.2, c3)   # corner buttresses
                s.frust((cx * (h + 0.1) - 0.95, cx * (h + 0.1) + 0.95, cz * (h + 0.1) - 0.95, cz * (h + 0.1) + 0.95), (cx * (h + 0.1), cx * (h + 0.1), cz * (h + 0.1), cz * (h + 0.1)), y + 1.2, 53.0, c2)
        if s.hi:
            for a in range(4):
                t = s.sub(); t.frust((-0.5, 0.5, h - 0.3, h + 0.5), (0, 0, h + 0.1, h + 0.1), y + 1.6, y + 4.2, c2); s.add(t, ry=a * 90)
        b.add(s, t=(sx * tx, 0, ZF - h))
    # ---- fleche at the crossing
    zc = (ztr0 + ztr1) / 2; sg = b.d(8, 4)
    b.lathe(0, zc, [(2.6, NR - 1.5), (2.4, NR + 2.0), (1.9, NR + 2.4), (1.7, NR + 6.5), (2.0, NR + 6.9)], sg, verd, smooth=False)
    b.lathe(0, zc, [(2.0, NR + 6.9), (1.3, NR + 9.0), (0.75, NR + 20.0), (0.12, 73.2)], sg, verd, smooth=False)
    if b.hi:
        for i in range(8):
            a = 2 * math.pi * (i + 0.5) / 8; b.tube((2.1 * math.sin(a), NR + 6.9, zc + 2.1 * math.cos(a)), (2.1 * math.sin(a), NR + 10.5, zc + 2.1 * math.cos(a)), 0.16, gold, seg=4, r1=0.02)
    b.tube((0, 72.8, zc), (0, 75.0, zc), 0.09, gold, seg=4); b.beam((-0.55, 74.2, zc), (0.55, 74.2, zc), 0.14, 0.14, gold)


run()
