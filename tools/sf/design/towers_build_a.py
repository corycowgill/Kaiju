# San Francisco tier A towers (design-towers). blender -b -P towers_build_a.py -- [ids...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2


@model('transamerica_pyramid', 'A', 260.0, face='west', stone=0xd8d4c8,
       desc='53 m square at the truss feet, 44 m at the first office floor; quartz precast pyramid, stair wing on the +Z (Montgomery St) face and the taller lift wing behind, both from 118 m, crossed base truss, louvred aluminium spire')
def transamerica(b):
    T = b.facade(Tex('transamerica_precast', cols=4, rows=8, bay=1.62, floor=3.8, wall=(.76, .75, .71), glass=(.21, .25, .30),
                     wx=(.2, .8), wy=(.3, .84), frame=(.5, .5, .48), blind=.3, rough=.6, noise=.025, seed=3))
    b.colours(precast=(.76, .75, .71, .65), precast_d=(.62, .61, .58, .7), alu=(.70, .72, .74, .42, .35), alu_d=(.50, .52, .55, .5, .3),
              glass=(.20, .25, .30, .25), roof=(.42, .42, .41), bronze=(.30, .26, .21, .5), beacon=(.80, .78, .70, .4))
    Z0, ZT, ZS = 15.0, 196.0, 256.0
    hw = lambda z: 22.1 * (260.0 - z) / 245.0
    sq = lambda z: rect(2 * hw(z), 2 * hw(z))
    # office pyramid
    b.ring(sq(Z0), Z0, ZT, T, poly1=sq(ZT), vfloors=48)
    # spire
    b.ring(sq(ZT), ZT, ZS, 'alu', poly1=sq(ZS))
    b.pyramid(sq(ZS), ZS, (0, 0, 260.0), 'beacon')
    b.ring(sq(ZT - 0.01), ZT, ZT + 3.0, 'alu_d', poly1=offset(sq(ZT + 3.0), 0.06))
    if b.hi:
        for k in range(1, 26):
            z = ZT + 3.0 + k * 2.2
            b.band(sq(z), z, 0.5, 0.22, 'alu', bottom=True, top=True)
        # floor ledges and precast ribs on the faces
        for f in range(1, 48):
            z = Z0 + f * (ZT - Z0) / 48
            b.band(sq(z), z - 0.45, 0.5, 0.16, 'precast', bottom=False)
        for i in range(4):
            p0, p1 = sq(Z0)[i], sq(Z0)[(i + 1) % 4]
            for k in range(-6, 7):
                x = k * 3.24
                zend = min(ZT, 260.0 - (abs(x) + 0.6) * 245.0 / 22.1)
                q = sq(zend)
                b.attach(p0, p1, x - 0.22, x + 0.22, Z0, zend, 0.32, 'precast', q[i], q[(i + 1) % 4], top=True, bottom=False)
    # wings: front (-Y) lift shaft, back (+Y) stair / smoke tower, vertical from the 29th floor
    zw = 118.0
    yw = hw(zw) + 0.4
    for sgn, ztop, ww in ((-1, 190.0, 7.6), (1, 203.0, 8.4)):
        y_in = hw(ztop) - 0.5
        ya, yb = (-yw, -y_in) if sgn < 0 else (y_in, yw)
        b.box(-ww / 2, ww / 2, ya, yb, zw - 2.0, ztop, 'precast')
        if b.hi:
            for z in [zw + 7.6 * k for k in range(1, int((ztop - zw) / 7.6) + 1)]:
                b.band(rect2(-ww / 2, ww / 2, ya, yb), z, 0.35, 0.12, 'precast_d', top=False, bottom=False)
            b.band(rect2(-ww / 2, ww / 2, ya, yb), ztop - 1.2, 1.2, 0.2, 'precast')
    # base: transfer girder, recessed glass lobby, the crossed truss leaning out to the 53 m feet
    b.band(sq(Z0), Z0 - 1.6, 1.9, 0.5, 'precast', bottom=True)
    b.cap(offset(sq(Z0), 0.5), Z0 - 1.6, 'precast_d', down=True)
    L = rect(37.0, 37.0)
    b.ring(L, 0, Z0 - 1.6, 'glass')
    n = 5
    for i in range(4):
        c, s = [(1, 0), (0, 1), (-1, 0), (0, -1)][i]
        P = lambda x, y, z: (x * c - y * s, x * s + y * c, z)   # face i: local x along the face, y outward
        hu, hm, hf = 22.3, 24.5, 26.55
        zm = 6.4
        for k in range(n):
            x0, x1 = -hu + 2 * hu * k / n, -hu + 2 * hu * (k + 1) / n
            xm = (x0 + x1) / 2 * hm / hu
            b.beam(P(x0, -hu, Z0 - 0.8), P(xm, -hm, zm), 1.0, 'precast')
            b.beam(P(xm, -hm, zm), P(x1, -hu, Z0 - 0.8), 1.0, 'precast')
            b.beam(P(xm, -hm, zm), P(x0 * hf / hu, -hf, 0), 1.1, 'precast')
            b.beam(P(xm, -hm, zm), P(x1 * hf / hu, -hf, 0), 1.1, 'precast')
        # corner legs
        if b.hi:
            for k in range(1, 12):
                x = -18.5 + 37.0 * k / 12
                b.box(*(sorted((P(x - 0.15, -18.5, 0)[0], P(x + 0.15, -18.9, 0)[0])) + sorted((P(x - 0.15, -18.5, 0)[1], P(x + 0.15, -18.9, 0)[1]))), 0, Z0 - 1.6, 'bronze', top=False)
    if b.hi:
        b.portal(L[0], L[1], 0.0, 7.0, 4.6, 'bronze', 'glass', dep=1.0, canopy=2.6)
        b.band(L, 4.9, 0.4, 0.3, 'bronze')



@model('salesforce_tower', 'A', 326.0, face='northwest', stone=0xc9d2d6,
       desc='54 m rounded-square obelisk tapering to 35 m; white sunshade rings over blue-grey glass, hollow slotted crown 284-326 m')
def salesforce(b):
    T = b.facade(Tex('salesforce_glass', cols=4, rows=8, bay=1.5, floor=4.4, wall=(.80, .81, .80), glass=(.33, .43, .50), wx=(.07, .93), wy=(.17, .99),
                     frame_px=0, blind=.08, lit=0, rough=.28, grad=.16, glass_var=.06, shadow=.75, seed=5))
    C = b.facade(Tex('salesforce_crown', cols=4, rows=8, bay=1.5, floor=4.4, wall=(.80, .81, .80), glass=(.60, .65, .68), wx=(.12, .88), wy=(.2, .94),
                     frame_px=0, blind=0, lit=0, glass_var=.03, grad=.04, rough=.5, shadow=.9, seed=6))
    b.colours(white=(.80, .81, .80, .45), roof=(.45, .46, .47), inner=(.52, .55, .58, .6), glass=(.22, .28, .33, .2), steel=(.62, .64, .66, .4))
    prof = [(0, 26.4), (70, 26.4), (130, 25.5), (180, 24.2), (225, 22.4), (262, 20.6), (276, 19.8)]
    seg = b.seg(6, 3)
    P = lambda hw: rrect(2 * hw, 2 * hw, hw * 0.42, seg)

    def hw_at(z):
        for (z0, h0), (z1, h1) in zip(prof[:-1], prof[1:]):
            if z <= z1:
                return h0 + (h1 - h0) * (z - z0) / (z1 - z0)
        return prof[-1][1]
    for (z0, h0), (z1, h1) in zip(prof[:-1], prof[1:]):
        b.ring(P(h0), z0, z1, T, poly1=P(h1), smooth=True)
    z = 18.0
    while z < 274:
        b.band(P(hw_at(z)), z, 0.35, 0.6, 'white')
        z += 13.2 if b.hi else 39.6
    zc0, zc1 = 284.0, 326.0
    b.ring(P(19.8), 276, zc0, C, poly1=P(19.4), smooth=True)
    b.cap(P(19.0), zc0, 'roof')

    def petal(hw, s, k, t=0.0):
        r = hw * 0.42
        pts = [(s, -hw + t)] + [(hw - r + (r - t) * math.cos(math.radians(-90 + 90 * i / seg)), -hw + r + (r - t) * math.sin(math.radians(-90 + 90 * i / seg))) for i in range(seg + 1)] + [(hw - t, -s)]
        return rot(pts, 90 * k)
    for k in range(4):
        o0, o1 = petal(19.4, 1.5, k), petal(17.6, 2.6, k)
        i0, i1 = petal(19.4, 1.5, k, 0.7), petal(17.6, 2.6, k, 0.7)
        b.ring(o0, zc0, zc1, C, poly1=o1, smooth=True, closed=False)
        b.ring(i0, zc0, zc1, 'inner', poly1=i1, closed=False, inward=True)
        for i in range(len(o1) - 1):
            b.poly([(*o1[i], zc1), (*o1[i + 1], zc1), (*i1[i + 1], zc1), (*i1[i], zc1)], 'white')
        for e in (0, -1):
            b.poly([(*o0[e], zc0), (*i0[e], zc0), (*i1[e], zc1), (*o1[e], zc1)], 'white')
    b.cbox(0, 0, 15, 15, zc0, 300.0, 'inner')
    if b.hi:
        for k in range(4):   # slot frames and crown rings
            for z in (296.0, 308.0, 319.0):
                hwz = 19.4 + (17.6 - 19.4) * (z - zc0) / (zc1 - zc0)
                pz = petal(hwz, 1.5 + 1.1 * (z - zc0) / (zc1 - zc0), k)
                for i in range(len(pz) - 1):
                    b.attach(pz[i], pz[i + 1], 0, 1, z, z + 0.5, 0.35, 'white', frac=True)
        p0 = P(26.4)
        b.fins(p0, 0, 17.5, 'white', spacing=7.4, w=1.0, dep=0.55, minlen=10, ends=True)
        b.band(p0, 17.5, 0.8, 0.6, 'white')
        b.band(p0, 5.2, 0.35, 0.6, 'steel', edges={0})
        b.portal((-15.3, -26.4), (15.3, -26.4), 0.0, 9.0, 5.2, 'steel', 'glass', dep=0.55)


@model('bank_of_america_555_california', 'A', 237.0, face='north', stone=0x5a3d35,
       desc='84 x 44.5 m; carnelian granite slab folded into 6 m saw-tooth bays (modelled), top stepping back at the corners in three tiers from 190 m, recessed pier lobby')
def bofa(b):
    T = b.facade(Tex('bofa_granite', cols=2, rows=8, bay=1.84, floor=4.45, size=(128, 512), wall=(.34, .225, .195), glass=(.185, .17, .165), wx=(.1, .9), wy=(.3, .95),
                     frame=(.24, .17, .15), blind=.07, blindc=(.36, .30, .26), lit=.02, rough=.3, noise=.05, grad=.16, seed=7))
    b.colours(granite=(.34, .225, .195, .35), granite_d=(.26, .18, .16, .4), glass=(.19, .17, .16, .2), roof=(.33, .31, .30), bronze=(.28, .22, .17, .4))
    nx, ny = 13, 7
    ux, uy = 80.0 / nx, 40.5 / ny

    def plan(cx, cy):
        X, Y, a, c = 40.0, 20.25, cx * ux, cy * uy
        if cx == 0:
            return rect(80, 40.5)
        return [(-X + a, -Y), (X - a, -Y), (X - a, -Y + c), (X, -Y + c), (X, Y - c), (X - a, Y - c), (X - a, Y), (-X + a, Y), (-X + a, Y - c), (-X, Y - c), (-X, -Y + c), (-X + a, -Y + c)]
    pitch = 6.15 if b.hi else 12.3
    zb = 14.0
    for z0, z1, cx, cy in [(zb, 190, 0, 0), (190, 206, 1, 1), (206, 222, 2, 1), (222, 237, 3, 2)]:
        zp = zigzag(plan(cx, cy), pitch, 2.0)
        b.prism(zp, z0, z1, T, top='roof')
        if z0 == zb:
            b.cap(zp, zb, 'granite_d', down=True)
        if b.hi:
            for i in range(1, len(zp), 2):   # granite nose on every bay apex
                b.beam((zp[i][0], zp[i][1], z0), (zp[i][0], zp[i][1], min(z1 + 1.2, 237.0)), 0.5, 'granite', caps=True)
            if z0 == zb:
                for z in (zb, 98.0, 186.0):
                    b.band(zp, z, 1.6, 0.25, 'granite_d', top=False, bottom=False)
            b.cbox(0, 0, plan(cx, cy)[1][0] * 1.2, 14, z1, z1 + (3.5 if z1 < 237 else 0), 'roof') if z1 < 237 else None
    L = rect(76.5, 37.0)
    b.ring(L, 0, zb, 'glass')
    if b.hi:
        b.fins(L, 0, zb, 'granite', spacing=6.15, w=1.4, dep=1.7, ends=True)
        b.band(L, 5.0, 0.4, 0.35, 'bronze')
        b.portal(L[0], L[1], 0.0, 9.0, 4.8, 'bronze', 'glass', dep=1.2, canopy=3.0)
        b.portal(L[2], L[3], 0.0, 6.0, 4.4, 'bronze', 'glass', dep=1.0)


@model('tower_181_fremont', 'A', 245.0, face='northeast', stone=0x9fb2c0,
       desc='35.5 x 40.5 m at the street, faces creasing inward to a 28 x 32 m roof at 214 m; white diagonal mega-brace exoskeleton, slanted screen crown and corner spire')
def fremont181(b):
    T = b.facade(Tex('fremont181_glass', cols=4, rows=8, bay=1.5, floor=4.0, wall=(.50, .57, .62), glass=(.36, .45, .53), wx=(.04, .96), wy=(.2, .97),
                     frame=(.62, .66, .69), blind=.1, lit=.02, rough=.25, grad=.14, seed=9))
    b.colours(white=(.82, .83, .82, .4), roof=(.42, .44, .46), glass=(.21, .27, .32, .2), inner=(.55, .60, .64, .5), steel=(.6, .62, .64, .4))
    A0 = rect(33.3, 38.4)
    A1 = [(-13.0, -17.0), (15.0, -14.0), (13.0, 17.0), (-15.0, 14.0)]
    ZR = 214.0
    C = lambda i, z: Vector((A0[i][0] + (A1[i][0] - A0[i][0]) * z / ZR, A0[i][1] + (A1[i][1] - A0[i][1]) * z / ZR, z))
    lv = [0.0, 22.0, 70.0, 118.0, 166.0, 214.0]
    ZT = [232.0, 223.0, 216.5, 226.0]
    for i in range(4):
        j = (i + 1) % 4
        o = Vector((*_n2(A0[i], A0[j]), 0))
        for k in range(5):
            za, zb = lv[k], lv[k + 1]
            a, bb, c, d = C(i, za), C(j, za), C(j, zb), C(i, zb)
            if (k + i) % 2 == 0:
                b.poly([a, bb, c], T)
                b.poly([a, c, d], T)
                b.beam(a + o * 0.45, c + o * 0.45, 1.3, 'white', d=0.7)
            else:
                b.poly([a, bb, d], T)
                b.poly([bb, c, d], T)
                b.beam(bb + o * 0.45, d + o * 0.45, 1.3, 'white', d=0.7)
            if b.hi:
                b.beam(d + o * 0.4, c + o * 0.4, 0.8, 'white', d=0.6)
                for q in range(1, 6):
                    s = q / 6
                    b.beam(a.lerp(bb, s) + o * 0.25, d.lerp(c, s) + o * 0.25, 0.22, 'steel', d=0.4)
        if b.hi:
            z = 30.0
            while z < 212:
                if min(abs(z - l) for l in lv) > 3:
                    b.beam(C(i, z) + o * 0.2, C(j, z) + o * 0.2, 0.3, 'steel', d=0.45)
                z += 3.4
        # crown screen
        ti, tj = C(i, ZT[i]), C(j, ZT[j])
        b.poly([C(i, ZR), C(j, ZR), tj, ti], T)
        b.poly([C(j, ZR) - o * 0.35, C(i, ZR) - o * 0.35, ti - o * 0.35, tj - o * 0.35], 'inner')
        b.beam(ti + o * 0.3, tj + o * 0.3, 0.7, 'white')
        if b.hi:
            for q in range(1, 6):
                s_ = q / 6
                b.beam(C(i, ZR).lerp(C(j, ZR), s_) + o * 0.25, ti.lerp(tj, s_) + o * 0.25, 0.22, 'steel', d=0.4)
            b.beam(C(i, ZR + 4.5) + o * 0.2, C(j, ZR + 4.5) + o * 0.2, 0.3, 'steel', d=0.45)
        b.beam(Vector((A0[i][0], A0[i][1], 0)) + (o + Vector((*_n2(A0[i - 1], A0[i]), 0))) * 0.3, C(i, ZT[i]) + (o + Vector((*_n2(A0[i - 1], A0[i]), 0))) * 0.3, 1.0, 'white')
    b.cap([(p[0], p[1]) for p in A1], ZR, 'roof')
    b.cbox(0, 0, 14, 16, ZR, ZR + 4.0, 'steel')
    tip = C(0, ZT[0])
    b.beam(tip, (tip.x + 0.4, tip.y + 0.5, 240.0), 0.7, 'white')
    b.beam((tip.x + 0.4, tip.y + 0.5, 240.0), (tip.x + 0.5, tip.y + 0.6, 245.0), 0.3, 'white', caps=True)
    if b.hi:
        b.band(A0, 6.0, 0.5, 1.5, 'white', edges={0})
        b.portal(A0[0], A0[1], 0.0, 8.0, 5.4, 'steel', 'glass', dep=0.9)
        b.attach(A0[0], A0[1], -15, 15, 0, 6.0, 0.25, 'glass', top=False)


@model('one_rincon_hill', 'A', 184.0, face='northeast', stone=0x8fb0b0,
       desc='32 x 22 m: one long curved (oval) glass side with white fins, panelled flat back; canted white crown band 166-184 m')
def rincon(b):
    T = b.facade(Tex('rincon_glass', cols=4, rows=8, bay=1.45, floor=3.05, wall=(.78, .80, .79), glass=(.31, .45, .47), wx=(.05, .95), wy=(.2, .98),
                     frame_px=0, blind=.15, lit=.03, rough=.27, grad=.14, seed=11))
    Pn = b.facade(Tex('rincon_panel', cols=4, rows=8, bay=1.6, floor=3.05, wall=(.74, .75, .74), glass=(.25, .33, .36), wx=(.25, .75), wy=(.3, .82),
                      frame=(.5, .52, .52), blind=.25, rough=.5, vjoint=0, course=1, seed=12))
    b.colours(white=(.80, .81, .80, .45), roof=(.44, .45, .45), glass=(.22, .30, .32, .2), conc=(.66, .65, .62, .7), inner=(.5, .52, .53, .6))
    front = [(-16, -7), (-12, -8.9), (-8, -10.1), (-4, -10.8), (0, -11), (4, -10.6), (8, -9.5), (11, -8), (13.6, -6.2), (15.4, -3.6), (16, -0.8), (15.6, 2.2), (14, 4.8), (11.5, 6.8), (8, 8.3)]
    if not b.hi:
        front = front[::2] if len(front) % 2 else front[::2] + [front[-1]]
    P = scale(front + [(9, 11), (-9, 11), (-16, 8)], 0.968, 0.955)
    nf = len(front) - 1
    curved, flat = set(range(nf)), set(range(nf, len(P)))
    zb, zc = 12.0, 163.0
    b.ring(P, zb, zc, T, only=curved, smooth=True)
    b.ring(P, zb, zc, Pn, only=flat)
    b.ring(P, 0, zb, 'glass', only=curved)
    b.ring(P, 0, zb, 'conc', only=flat)
    b.ring(offset(P, -0.5), zc, 166.5, 'glass')
    cr = offset(P, 0.0)
    ztop = lambda p: 173.0 + 11.0 * min(1.0, (10.505 - p[1]) / 21.01)
    b.ring(cr, 166.5, 0, 'white', z1s=[ztop(p) for p in cr])
    cin = offset(P, -0.9)
    b.ring(cin, 166.5, 0, 'inner', z1s=[ztop(p) for p in cin], inward=True)
    for i in range(len(P)):
        j = (i + 1) % len(P)
        b.poly([(*cr[i], ztop(cr[i])), (*cr[j], ztop(cr[j])), (*cin[j], ztop(cin[j])), (*cin[i], ztop(cin[i]))], 'white')
    b.cap(cin, 170.0, 'roof')
    b.cbox(1, 0, 12, 8, 170.0, 176.0, 'inner')
    if not b.hi:
        for z in (zb, 62.0, 112.0):
            b.band(P, z, 0.35, 0.4, 'white', edges=curved)
        b.fins(P, zb, zc, 'white', spacing=1.45, w=0.3, dep=0.5, edges=curved, minlen=1.0, lo=2)
    if b.hi:
        b.fins(P, zb, zc, 'white', spacing=1.45, w=0.3, dep=0.5, edges=curved, minlen=1.0, ends=False)
        for z in [zb + 6.1 * k for k in range(0, 25)]:
            b.band(P, z, 0.35, 0.4, 'white', edges=curved)
        for z in (167.0, 168.2, 169.3, 170.4, 172.0):
            b.band(cr, z, 0.3, 0.25, 'white', top=False, bottom=False)
        b.fins(P, 0, zb, 'conc', spacing=5.5, w=0.8, dep=0.5, minlen=1.0, ends=True)
        b.fins(P, zb, zc, 'white', n=3, w=0.35, dep=0.3, edges={nf + 1})
        b.portal(P[3], P[4], 0.0, 3.4, 3.6, 'white', 'glass', dep=0.4)
        b.fins(P, zb, zc, 'white', spacing=1.6, w=0.3, dep=0.25, edges=flat, minlen=4)


@model('embarcadero_center', 'A', 174.0, face='north', stone=0xb8b2a6, ids=['embarcadero_center_1', 'embarcadero_center_2', 'embarcadero_center_3', 'embarcadero_center_4'],
       desc='75 x 34 m: thin precast slab in seven staggered slices stepping down at both ends (120-174 m), modelled vertical ribs, three open podium levels with terrace edges')
def embarcadero(b):
    T = b.facade(Tex('embarcadero_ribs', cols=4, rows=8, bay=1.55, floor=3.8, wall=(.73, .71, .67), glass=(.23, .27, .31), wx=(.3, .7), wy=(.26, .94),
                     spandrel=(.50, .49, .47), frame_px=0, blind=.22, rough=.62, noise=.03, seed=13))
    b.colours(conc=(.73, .71, .67, .7), conc_d=(.58, .57, .54, .75), glass=(.20, .24, .28, .22), roof=(.42, .42, .41), tile=(.45, .36, .30, .7))
    S = [(-36.5, -30.5, 1.5, 10.5, 120.0), (-30.5, -24, -5.5, 10.5, 140.0), (-24, -16, -11.5, 12.5, 158.0), (-16, 19, -16, 16, 174.0),
         (19, 26, -13.5, 9.5, 158.0), (26, 32, -11.5, 4.5, 140.0), (32, 36.5, -10.5, -1.5, 120.0)]
    zb = 14.0
    for k, (x0, x1, y0, y1, h) in enumerate(S):
        r = rect2(x0, x1, y0, y1)
        b.prism(r, zb, h - 2.2, T, top='roof')
        b.parapet(r, h - 2.2, 2.2 if k == 3 else 1.0, 0.6, 'conc') if b.hi else b.ring(r, h - 2.2, h - (0 if k == 3 else 1.2), 'conc')
        if not b.hi and k == 3:
            b.cap(r, h, 'roof')
        if b.hi:
            hl = S[k - 1][4] if k > 0 else 0
            hr = S[k + 1][4] if k < len(S) - 1 else 0
            b.fins(r, zb, h - 2.2, 'conc', spacing=1.55, w=0.42, dep=0.42, edges={0, 2}, ends=True, top=True)
            if hr < h:
                b.fins(r, max(zb, hr), h - 2.2, 'conc', spacing=1.55, w=0.42, dep=0.42, edges={1}, top=True)
            if hl < h:
                b.fins(r, max(zb, hl), h - 2.2, 'conc', spacing=1.55, w=0.42, dep=0.42, edges={3}, top=True)
            for z in (h - 6.0, h - 33.0, h - 60.0, h - 100.0):
                if z > zb + 10:
                    b.band(r, z, 1.2, 0.45, 'conc', top=False, bottom=False)
        # podium: glass shopfronts behind concrete terrace edges
        rp = rect2(x0 - (1 if k == 0 else 0), x1 + (1 if k == 6 else 0), y0 - 1, y1 + 1)
        b.ring(offset(r, -0.6), 0, zb, 'glass')
        for z in (4.2, 8.8, 13.2):
            b.prism(rp, z, z + 0.9, 'conc', top='tile' if z > 13 else 'conc', bottom='conc_d')
        if b.hi:
            b.fins(r, 0, zb, 'conc', spacing=6.2, w=0.8, dep=0.75, ends=True, minlen=4)
    b.cbox(1.5, 0, 20, 12, 171.8, 174.0, 'conc_d')
    if b.hi:
        b.portal((-16, -16), (19, -16), 0.0, 8.0, 3.6, 'conc', 'glass', dep=0.9)


@model('california_345', 'A', 212.0, face='north', stone=0xa8a09c,
       desc='85 x 42 m base: grey-pink granite 42 m tower with chamfered bay corners between low masonry wings, twin 45-degree hotel towers 150-190 m joined by skybridges, angled flagpole spires')
def cal345(b):
    T = b.facade(Tex('cal345_granite', cols=4, rows=8, bay=1.6, floor=4.05, wall=(.66, .62, .60), glass=(.30, .37, .43), wx=(.1, .9), wy=(.3, .9),
                     frame=(.42, .42, .44), blind=.18, rough=.42, course=1, seed=15))
    W = b.facade(Tex('cal345_wing', cols=4, rows=8, bay=2.6, floor=4.3, wall=(.68, .66, .61), glass=(.25, .29, .33), wx=(.24, .76), wy=(.2, .84),
                     frame=(.44, .43, .40), blind=.3, rough=.6, course=3, vjoint=2, sill=(.74, .72, .67), seed=16))
    b.colours(granite=(.66, .62, .60, .45), granite_d=(.52, .49, .48, .5), glass=(.27, .34, .40, .22), roof=(.43, .43, .43), steel=(.70, .71, .72, .4), stone=(.68, .66, .61, .7), bronze=(.3, .25, .2, .5))
    body = chamfer(41, 41, 5.5)
    b.prism(body, 0, 150, T, top='roof')
    for sx in (-1, 1):
        wr = rect2(20.5 if sx > 0 else -42.0, 42.0 if sx > 0 else -20.5, -20.2, 20.2)
        b.prism(wr, 0, 26.0, W, top='roof', skip={3} if sx > 0 else {1})
        if b.hi:
            b.band(wr, 23.6, 1.0, 0.5, 'stone', edges={0, 2, 1 if sx > 0 else 3})
            b.band(wr, 24.6, 1.4, 0.15, 'stone', edges={0, 2, 1 if sx > 0 else 3}, bottom=False)
            b.band(wr, 8.6, 0.6, 0.3, 'stone', edges={0, 2, 1 if sx > 0 else 3})
            b.fins(wr, 0, 8.6, 'stone', spacing=5.2, w=1.0, dep=0.25, edges={0, 2}, ends=True)
            b.fins(wr, 9.2, 23.6, 'stone', spacing=2.6, w=0.6, dep=0.2, edges={0, 2, 1 if sx > 0 else 3}, ends=True)
            b.cbox(31.5 * sx, 0, 10, 16, 26.0, 29.0, 'granite_d')
            b.parapet(offset(wr, -0.3), 26.0, 0.9, 0.4, 'stone')
    D = [ngon(10.5, 4, cx=10.5 * sx) for sx in (-1, 1)]
    for sx, d in zip((-1, 1), D):
        b.prism(d, 150, 190, T, top='roof')
        b.prism(scale(d, 0.74, about=(10.5 * sx, 0)), 190, 195, 'granite', top='roof')
        b.prism(scale(d, 0.46, about=(10.5 * sx, 0)), 195, 199.5, 'granite_d', top='roof')
        b.beam((10.5 * sx, 0, 199.5), (11.9 * sx, 0, 206.0), 0.55, 'steel')
        b.beam((11.9 * sx, 0, 206.0), (13.2 * sx, 0, 212.0), 0.28, 'steel', caps=True)
        if b.hi:
            b.fins(d, 150, 190, 'granite', spacing=1.6, w=0.45, dep=0.35, top=True)
            for z in (160, 170, 180, 189):
                b.band(d, z, 0.5, 0.25, 'granite_d', bottom=False)
    for z in (156, 166, 176):
        b.cbox(0, 0, 6, 5, z, z + 3.4, 'glass', bottom=True)
    b.cbox(0, 12, 14, 10, 150, 154.5, 'granite_d')
    b.cbox(0, -12, 14, 10, 150, 153.0, 'granite_d')
    if b.hi:
        b.fins(body, 9, 150, 'granite', spacing=1.6, w=0.5, dep=0.4, minlen=10, top=True)
        for z in [9 + 10.125 * k for k in range(0, 14)] + [148.8]:
            b.band(body, z, 0.7, 0.3, 'granite_d', bottom=False)
        for i in (1, 3, 5, 7):   # faceted glass bays on the chamfered corners
            a, c = body[i], body[(i + 1) % 8]
            for s in (-2.0, 2.0):
                b.attach(a, c, s - 1.5, s + 1.5, 9, 148, 0.7, 'glass')
            b.attach(a, c, -0.3, 0.3, 9, 150, 0.9, 'granite')
        b.parapet(body, 150, 1.2, 0.5, 'granite')
        b.portal(body[0], body[1], 0.0, 7.0, 6.5, 'bronze', 'glass', dep=0.45)
        b.parapet(D[0], 190, 0.8, 0.3, 'granite_d')
        b.parapet(D[1], 190, 0.8, 0.3, 'granite_d')
        b.attach(body[0], body[1], -13, 13, 0, 8.6, 0.2, 'glass', top=False)
        b.fins(body, 0, 9, 'granite', spacing=5.3, w=1.1, dep=0.45, minlen=10, ends=True)
    else:
        b.fins(body, 9, 150, 'granite', spacing=1.6, w=0.5, dep=0.4, minlen=10, lo=3)
        b.fins(body, 0, 9, 'granite', spacing=5.3, w=1.1, dep=0.45, minlen=10, ends=True, lo=1)


@model('california_101', 'A', 183.0, face='east', stone=0x9aa6a4,
       desc='83 x 83 m site: 55 m serrated glass-and-granite cylinder (48 modelled teeth), sloping glass atrium on its plaza side, seven-storey stepped wedge annex along the back and the corner pavilion')
def cal101(b):
    T = b.facade(Tex('cal101_glass', cols=2, rows=8, bay=1.9, floor=3.8, size=(128, 512), wall=(.64, .65, .62), glass=(.33, .41, .43), wx=(.07, .93), wy=(.4, .98),
                     frame=(.5, .52, .5), blind=.12, lit=.03, rough=.3, grad=.13, seed=17))
    b.colours(granite=(.64, .65, .62, .45), granite_d=(.5, .51, .49, .5), glass=(.24, .31, .33, .2), roof=(.42, .43, .42), white=(.78, .79, .78, .4))
    cx, cy, R = -10.1, -13.0, 26.5
    N = b.seg(48, 24)
    body = zigzag(ngon(R, N, cx, cy), 100, 0.95 if b.hi else 0.5)
    zl = 27.0
    b.prism(body, zl, 171.5, T, top='roof')
    b.prism(zigzag(ngon(R - 3.2, N, cx, cy), 100, 0.9 if b.hi else 0.5), 171.5, 183.0, T, top='roof')
    b.cap(body, zl, 'granite_d', down=True)
    b.ring(ngon(R - 1.6, b.seg(32, 16), cx, cy), 0, zl, T, smooth=True)
    # sloping glass atrium on the plaza (north-east) side
    na = math.atan2(-0.42, 0.9)
    M = b.seg(10, 5)
    top, bot = [], []
    for i in range(M + 1):
        f = -1 + 2 * i / M
        a = na + math.radians(58) * f
        ro = R + 0.6 + 13.5 * math.cos(f * math.pi / 2)
        top.append(Vector((cx + (R + 0.4) * math.cos(a), cy + (R + 0.4) * math.sin(a), zl + 0.5)))
        bot.append(Vector((cx + ro * math.cos(a), cy + ro * math.sin(a), 0.0)))
    for i in range(M):
        b.poly([bot[i], bot[i + 1], top[i + 1], top[i]], T)
        if b.hi:
            b.beam(bot[i] + Vector((0, 0, 0.2)), top[i] + Vector((0, 0, 0.2)), 0.35, 'white')
    if b.hi:
        for i in range(24):
            a = 2 * math.pi * i / 24
            b.cyl(cx + (R - 0.5) * math.cos(a), cy + (R - 0.5) * math.sin(a), 0.85, 0, zl, 6, 'granite', cap=False)
        for z in [zl - 1.2, 170.3] + [zl + 22.8 * k for k in range(1, 6)]:
            b.band(body, z, 1.2, 0.2, 'granite', top=False, bottom=False)
    # annex wedge and corner pavilion
    A = [(42, 42), (-42, 41), (-42, 11), (-25, 11), (4, 2.7)]
    piv = (-42, 41)
    for z0, z1, sc in ((0, 10, 1.0), (10, 19, 0.86), (19, 27, 0.72)):
        q = scale(A, sc, about=piv)
        b.prism(q, z0, z1, T, top='roof')
        if b.hi:
            b.band(q, z1 - 0.6, 0.9, 0.3, 'granite', bottom=False)
            b.fins(q, z0, z1 - 0.6, 'granite', spacing=3.8, w=0.6, dep=0.3, ends=True)
    b.prism(ccw([(-41, -18), (-32, -32), (-41, -41)]), 0, 6.5, T, top='roof')
    if b.hi:
        b.portal((cx - 6, cy - R + 1.0), (cx + 6, cy - R + 1.0), 0.0, 5.0, 5.0, 'granite', 'glass', dep=0.8)


@model('pacbell_building', 'A', 133.0, face='northeast', stone=0xbdbab0, swap=True,
       desc='49 x 45 m L / F plan (New Montgomery St front on +Z): speckled grey terra cotta, unbroken modelled piers, stepped crown with pinnacles and the eight eagles at 122 m')
def pacbell(b):
    T = b.facade(Tex('pacbell_terra', cols=4, rows=8, bay=1.95, floor=4.1, wall=(.64, .64, .61), glass=(.22, .25, .27), wx=(.2, .8), wy=(.3, .86),
                     spandrel=(.42, .42, .41), frame=(.36, .36, .35), pier=(.26, (.68, .68, .65)), blind=.3, rough=.65, noise=.06, seed=19))
    b.colours(terra=(.67, .67, .64, .7), terra_d=(.54, .54, .52, .75), roof=(.4, .4, .39), glass=(.2, .22, .24, .25), bronze=(.26, .22, .16, .45), gold=(.62, .52, .30, .45), eagle=(.72, .71, .67, .7))
    bar = rect2(-24.0, 24.0, -21.6, -5.0)
    wing = rect2(10.0, 24.0, -5.0, 21.9)
    stub = rect2(-24.0, -8.0, -5.0, 4.0)
    L = [(-24.0, -21.6), (24.0, -21.6), (24.0, 21.9), (10.0, 21.9), (10.0, 4.0), (-8.0, 4.0), (-8.0, -5.0) if False else (-8.0, 4.0)]
    L = [(-24.0, -21.6), (24.0, -21.6), (24.0, 21.9), (10.0, 21.9), (10.0, -5.0), (-8.0, -5.0), (-8.0, 4.0), (-24.0, 4.0)]
    tiers = [(L, 0.0, 96.0), (rect2(-16.0, 16.0, -21.6, -5.0), 96.0, 109.0), ([(10.0, -5.0), (24.0, -5.0), (24.0, 12.0), (10.0, 12.0)], 96.0, 103.0),
             (rect2(-11.5, 11.5, -21.5, -6.0), 109.0, 122.0), (rect2(-8.0, 8.0, -19.5, -8.0), 122.0, 128.5)]
    for poly, z0, z1 in tiers:
        b.prism(poly, z0, z1, T, top='roof')
        if b.hi:
            b.band(poly, z1 - 0.2, 0.9, 0.25, 'terra_d', bottom=False)
            b.fins(poly, max(z0, 9.5), z1 - 0.2, 'terra_d', spacing=1.95, w=0.35, dep=0.22, minlen=6)
        else:
            b.ring(poly, z1, z1 + 1.9, 'terra')
        b.fins(poly, max(z0, 9.5), z1 + 1.9, 'terra', spacing=1.95 if z0 > 90 else 3.9, w=0.85 if z0 < 90 else 0.6, dep=0.5, minlen=6, ends=True, top=True, lo=3 if z0 < 90 else 4)
    # crown pinnacles
    for sx in (-1, 1):
        for sy in (-17.9, -9.6):
            b.cbox(6.4 * sx, sy, 2.0, 2.0, 128.5, 131.6, 'terra')
            b.pyramid(rect(2.0, 2.0, 6.4 * sx, sy), 131.6, (6.4 * sx, sy, 133.0), 'terra_d')
    b.cbox(0, -13.75, 8.0, 6.0, 128.5, 131.0, 'terra_d')
    if b.hi:
        for sx in (-1, 1):   # the eagles on the tower corners (two per corner: front and side)
            for sy in (-21.5, -6.0):
                for dx, dy in ((0, 0.9 if sy > -10 else -0.9), (0.9 * sx, 0)):
                    ex, ey = 11.0 * sx + dx * 0.4, sy + dy * 0.4 * (1 if dy else 0)
                    b.cbox(ex, ey, 1.3, 1.3, 122.0, 125.0, 'eagle')
                    b.cbox(ex, ey, 2.6 if dy else 0.7, 0.7 if dy else 2.6, 123.3, 124.6, 'eagle')
                    b.cbox(ex + dx * 0.8, ey + dy * 0.8, 0.7, 0.7, 124.6, 125.7, 'eagle')
        b.band(L, 9.0, 0.7, 0.45, 'terra_d')
        b.fins(L, 0, 9.0, 'terra', spacing=3.9, w=1.3, dep=0.6, minlen=6, ends=True)
        b.attach(L[0], L[1], -4.2, 4.2, 0, 11.5, 0.55, 'terra')
        b.portal(L[0], L[1], 0.0, 4.6, 7.6, 'gold', 'glass', dep=0.8, t=0.45)
        b.attach(L[0], L[1], -3.4, 3.4, 5.0, 5.4, 0.9, 'bronze')


def _fan(b, tf, cx, z0, r, a0, a1, yf, yb, n, glass='mirror', roof='vault', rim='white'):
    pf = [Vector(tf((cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), yf, z0 + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))))) for i in range(n + 1)]
    pb = [Vector(tf((cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), yb, z0 + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))))) for i in range(n + 1)]
    cf, cb = Vector(tf((cx, yf, z0))), Vector(tf((cx, yb, z0)))
    for i in range(n):
        b.poly([cf, pf[i], pf[i + 1]], glass)
        b.poly([cb, pb[i + 1], pb[i]], glass)
        b.poly([pf[i], pb[i], pb[i + 1], pf[i + 1]], roof)
    if not b.hi:
        of = (pf[0] - pb[0]).normalized() * 0.25
        for i in range(n):
            b.beam(pf[i] + of, pf[i + 1] + of, 0.6, rim)
            b.beam(pb[i] - of, pb[i + 1] - of, 0.6, rim)
    if b.hi:
        of = (pf[0] - pb[0]).normalized() * 0.25
        for i in range(n + 1):
            b.beam(cf + of, pf[i] + of, 0.32, rim)
            b.beam(cb - of, pb[i] - of, 0.32, rim)
        for i in range(n):
            b.beam(pf[i] + of, pf[i + 1] + of, 0.6, rim)
            b.beam(pb[i] - of, pb[i + 1] - of, 0.6, rim)
            m0, m1 = (cf + pf[i]) / 2, (cf + pf[i + 1]) / 2
            b.beam(m0 + of, m1 + of, 0.25, rim)


def _stepped(b, T, hws, tops, hd, z0, ang, n_fan):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    tf = lambda p: (p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2])
    r2 = lambda poly: [tf((p[0], p[1], 0))[:2] for p in poly]
    hc = hws[-1]
    b.ring(r2(rect2(-hc, hc, -hd, hd)), z0, tops[-1], T, only={0, 2})
    b.ring(r2(rect2(-hc, hc, -hd, hd)), tops[-2], tops[-1], T, only={1, 3})
    _fan(b, tf, 0.0, tops[-1], hc - 0.8, 0, 180, -hd, hd, n_fan * 2)
    for k in range(len(hws) - 1):
        for sx in (-1, 1):
            x0, x1 = (hws[k + 1], hws[k]) if sx > 0 else (-hws[k], -hws[k + 1])
            r = r2(rect2(x0, x1, -hd, hd))
            zlow = tops[k - 1] if k > 0 else z0
            b.ring(r, z0, tops[k], T, only={0, 2})
            b.ring(r, zlow, tops[k], T, only={1} if sx > 0 else {3})
            b.cap(r, tops[k], 'roof')
            rq = min(hws[k] - hws[k + 1], tops[k + 1] - tops[k]) - 0.6
            _fan(b, tf, x0 if sx > 0 else x1, tops[k], rq, 0 if sx > 0 else 90, 90 if sx > 0 else 180, -hd, hd, n_fan)
            if b.hi:
                b.fins(r, zlow, tops[k], 'precast', spacing=8.0, w=0.6, dep=0.35, edges={1} if sx > 0 else {3}, ends=True)
                b.fins(r, z0, tops[k], 'precast', n=1, w=0.6, dep=0.35, edges={0, 2}, ends=True)


@model('marriott_marquis', 'A', 133.0, face='northwest', stone=0xc9b5a8,
       desc="75 x 110 m cross plan: pink-beige precast wings stepping up in four tiers each way, every shoulder a mirrored quarter-fan, the great half-round fan arches on the 133 m centre (the 'jukebox'); five-storey base")
def marriott(b):
    T = b.facade(Tex('marriott_precast', cols=4, rows=8, bay=2.0, floor=3.25, wall=(.71, .655, .615), glass=(.36, .43, .49), wx=(.12, .88), wy=(.3, .86),
                     frame=(.5, .46, .44), blind=.2, rough=.5, mv=1, seed=21))
    b.colours(precast=(.71, .655, .615, .6), precast_d=(.58, .53, .50, .65), mirror=(.45, .54, .60, .16), vault=(.52, .58, .62, .25), white=(.80, .79, .77, .4), roof=(.44, .43, .42),
              glass=(.24, .30, .35, .2), brass=(.55, .47, .30, .4))
    nf = b.seg(5, 3)
    zb = 20.0
    _stepped(b, T, [54.7, 44.0, 33.0, 22.0, 12.5], [48.0, 66.0, 84.0, 102.0, 112.0], 12.0, zb, 90, nf)
    _stepped(b, T, [37.5, 29.5, 21.5, 13.5], [66.0, 85.0, 104.0, 120.0], 14.0, zb, 0, nf)
    base = [(-37.5, -40), (37.5, -40), (37.5, 40), (-37.5, 40)]
    b.prism(base, 0, zb, T, top='roof')
    arm = rect2(-12.0, 12.0, -54.7, 54.7)
    b.ring(arm, 0, zb, T, only={0, 2})
    b.ring(rect2(-12.0, 12.0, -54.7, -40.0), 0, zb, T, only={1, 3})
    b.ring(rect2(-12.0, 12.0, 40.0, 54.7), 0, zb, T, only={1, 3})
    if b.hi:
        b.band(base, zb - 0.9, 1.2, 0.4, 'precast_d', bottom=False)
        b.band(base, 5.0, 0.5, 0.5, 'precast_d')
        b.attach((-12, -54.7), (12, -54.7), -9, 9, 0, 16.0, 0.15, 'mirror')
        b.fins([(-9, -54.85), (9, -54.85), (9, 0), (-9, 0)], 0, 16.0, 'white', n=6, w=0.3, dep=0.3, edges={0})
        b.attach((-12, -54.7), (12, -54.7), -11, 11, 5.2, 5.8, 0.5, 'brass')
        b.portal((-12, -54.7), (12, -54.7), 0.0, 7.0, 4.2, 'brass', 'glass', dep=0.45)
        b.fins(base, 0, zb, 'precast', spacing=8.0, w=0.9, dep=0.4, ends=True, minlen=20)


@model('sentinel_building', 'A', 30.0, face='south', stone=0x7fa392,
       desc='16 x 17.5 m flatiron: white tile walls, copper-green bay windows up the Kearny and Columbus sides and round the prow (model back-left corner), bracketed cornice, domed cupola')
def sentinel(b):
    Tl = b.facade(Tex('sentinel_tile', cols=4, rows=8, bay=1.2, floor=2.9, size=(128, 256), wall=(.74, .73, .68), glass=(.2, .2, .2), pattern=lambda i, j: False, course=6, vjoint=2,
                      rough=.45, noise=.02, seed=23))
    Cu = b.facade(Tex('sentinel_copper', cols=2, rows=8, bay=1.3, floor=2.9, size=(128, 512), wall=(.42, .55, .50), glass=(.22, .27, .28), wx=(.14, .86), wy=(.3, .88),
                      frame=(.72, .72, .66), frame_px=2, mh=1, blind=.35, rough=.55, noise=.06, seed=24))
    b.colours(copper=(.42, .55, .50, .55), copper_d=(.33, .45, .41, .6), copper_l=(.51, .63, .58, .55), tile=(.74, .73, .68, .45), glass=(.2, .24, .25, .22), roof=(.4, .41, .4),
              wood=(.32, .22, .16, .6), gold=(.62, .54, .32, .4))
    ins = 0.9
    pc = (-5.2, 6.0)
    pr = 2.8
    prow = arc(pc[0], pc[1], pr, 38, 180, b.seg(6, 3))
    P = [(-8.0, -8.0), (8.0, -8.0)] + prow
    Pi = [(-8.0 + ins, -8.0 + ins), (8.0 - ins * 2.2, -8.0 + ins)] + arc(pc[0], pc[1], pr - ins, 38, 180, b.seg(6, 3))
    npr = len(prow) - 1
    e_front, e_col, e_west = 0, 1, len(Pi) - 1
    e_prow = set(range(2, 2 + npr))
    z1, z2, z3 = 4.7, 22.1, 25.6
    b.ring(Pi, 0, z1, 'glass')
    b.ring(Pi, z1, z2, Tl, skip=e_prow)
    b.ring(P, z1 + 0.3, z2, Cu, only=e_prow, smooth=True)
    b.ring(Pi, z2, z3, Cu)
    b.cap(Pi, z3, 'roof')
    # bays
    for e, nb in ((e_front, 4), (e_col, 4), (e_west, 4)):
        a, c = Pi[e], Pi[(e + 1) % len(Pi)]
        Lr = math.hypot(c[0] - a[0], c[1] - a[1])
        o = _n2(a, c)
        d = ((c[0] - a[0]) / Lr, (c[1] - a[1]) / Lr)
        for k in range(nb):
            s = (k + 0.5) / nb * Lr
            pt = lambda t, q: (a[0] + d[0] * (s + t) + o[0] * q, a[1] + d[1] * (s + t) + o[1] * q)
            bay = [pt(-1.75, 0), pt(-1.15, ins - 0.05), pt(1.15, ins - 0.05), pt(1.75, 0)]
            b.ring(bay, z1 + 0.5, z2 - 0.2, Cu, closed=False)
            b.cap(bay, z1 + 0.5, 'copper_d', down=True)
            b.cap(bay, z2 - 0.2, 'copper')
            if b.hi:
                for f in range(1, 6):
                    zf = z1 + 0.5 + f * 2.9
                    for i in range(3):
                        b.attach(bay[i], bay[i + 1], 0, 1, zf - 0.2, zf + 0.25, 0.1, 'copper_l', frac=True)
    # cornices
    b.band(Pi, z2 - 0.2, 0.75, ins, 'copper')
    b.band(Pi, z1 - 0.2, 0.5, ins * 0.6, 'copper')
    b.band(Pi, z3 - 0.3, 0.5, 0.45, 'copper_l')
    if b.hi:
        b.fins(Pi, z2 - 0.85, z2 - 0.2, 'copper_d', spacing=0.95, w=0.3, dep=0.6, minlen=0.5, ends=True)
        b.fins(Pi, 0, z1 - 0.2, 'tile', spacing=3.6, w=0.55, dep=0.3, minlen=3, ends=True)
        b.band(Pi, 0, 0.7, 0.2, 'wood', top=True, bottom=False)
        b.portal(Pi[0], Pi[1], 0.0, 2.4, 3.2, 'wood', 'glass', dep=0.5, t=0.3)
        b.parapet(Pi, z3, 0.7, 0.3, 'copper_l')
    # cupola over the prow
    ccx, ccy = pc[0] + 0.3, pc[1] - 0.4
    n = b.seg(12, 8)
    b.lathe([(2.3, z3), (2.3, 27.2), (2.55, 27.2), (2.55, 27.5), (2.25, 27.5)], n, 'tile', ccx, ccy, cap=False)
    b.lathe([(2.25, 27.5), (2.0, 28.3), (1.4, 28.95), (0.6, 29.3), (0.35, 29.35), (0.35, 29.7), (0.0, 30.0)], n, 'copper', ccx, ccy)
    if b.hi:
        for i in range(8):
            a = 2 * math.pi * (i + 0.5) / 8
            b.cbox(ccx + 2.32 * math.cos(a), ccy + 2.32 * math.sin(a), 0.5, 0.5, z3 + 0.4, 27.0, 'glass')


if __name__ == '__main__':
    run()
