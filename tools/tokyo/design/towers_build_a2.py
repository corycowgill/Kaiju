# Tokyo tier A towers, part 2 (design-towers): Azabudai Hills, Toranomon Hills Mori Tower, Marunouchi Building, Dentsu, NEC.
# blender -b -P towers_build_a2.py -- [ids...] [--norender]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from towers_lib import *
from towers_lib import _n2


@model('azabudai_hills_mori_jp_tower', 'A', 330.0, face='east', stone=0xb4c4cf,
       desc='68 m rounded-square plan with a gentle bulge at a third height and a long taper to the open rounded crown; pale blue glass, '
            'modelled fine vertical mullions on the faces and round the corners, glass lobby with canopy')
def azabudai(b):
    std(b)
    T = b.facade(curtain('azabudai_glass', (.37, .48, .57), wall=(.80, .82, .84), bay=1.5, floor=4.5, seed=41, night=.45, cool=.2))
    b.colours(white=(.82, .84, .86, .4), roof=(.46, .47, .48), steel=(.62, .64, .66, .4, .3), glass=(.24, .31, .37, .2), inner=(.5, .55, .6, .5))
    prof = [(0, 30.6), (14, 31.4), (60, 33.2), (115, 34.0), (185, 33.3), (245, 30.8), (290, 27.0), (316, 23.6), (330, 21.2)]
    seg = b.seg(6, 3)
    P = lambda hw: rrect(2 * hw, 2 * hw, hw * 0.5, seg)
    arcs = {i for i in range(len(P(30))) if i % (seg + 1) != seg}
    for (z0, h0), (z1, h1) in zip(prof[:-1], prof[1:]):
        if z0 == 0:
            b.ring(offset(P(h0), -1.2), 0, z1, 'lobby')
            b.cap(P(h1), z1, 'white', down=True)
            continue
        b.ring(P(h0), z0, z1, T, poly1=P(h1), smooth=True)
        b.fins(P(h0), z0, z1, 'white', spacing=3.0, w=0.32, dep=0.42, poly1=P(h1), minlen=10, lo=4)
        if b.hi:
            b.fins(P(h0), z0, z1, 'white', n=2, w=0.32, dep=0.42, poly1=P(h1), minlen=1, edges=arcs)
    # crown: the glass skin runs on past the roof
    b.cap(P(23.0), 316.0, 'roof')
    b.ring(offset(P(23.6), -0.8), 316.0, 330.0, 'inner', poly1=offset(P(21.2), -0.8), inward=True)
    top, topi = P(21.2), offset(P(21.2), -0.8)
    for i in range(len(top)):
        j = (i + 1) % len(top)
        b.poly([(*topi[i], 330.0), (*top[i], 330.0), (*top[j], 330.0), (*topi[j], 330.0)], 'white')
    b.prism(rect(22, 22), 316.0, 324.0, 'steel', top='roof')
    beacons(b, [(sx * 15.5, sy * 15.5, 328.9) for sx in (-1, 1) for sy in (-1, 1)])
    b.band(P(31.4), 13.2, 0.9, 1.4, 'white')
    if b.hi:
        b.fins(offset(P(30.6), -1.2), 0, 13.2, 'white', spacing=7.5, w=0.9, dep=1.2, minlen=10, ends=True)
        p0 = offset(P(30.6), -1.2)
        b.portal(p0[seg], p0[seg + 1], 0.0, 10.0, 6.0, 'steel', 'glass', dep=1.0, canopy=4.0)
        for z in (115.0, 245.0):
            b.band(P(interp(prof, z)), z, 0.5, 0.45, 'white')


@model('toranomon_hills_mori_tower', 'A', 247.0, face='east', stone=0xa9bcc6,
       desc='80 x 54 m chamfered glass tower: facade splaying out over the base, fine louvre bands and mullions modelled, the crown cut by two '
            'sloping planes meeting at an off-centre ridge (247 m), steel ridge fin, low glass podium')
def toranomon_mori(b):
    std(b)
    T = b.facade(curtain('toranomon_mori_glass', (.33, .44, .52), wall=(.76, .78, .80), bay=1.6, floor=4.4, seed=43, night=.5))
    b.colours(white=(.80, .82, .84, .4), roof=(.45, .46, .47), steel=(.6, .62, .64, .4, .3), glass=(.22, .28, .33, .2), stone=(.70, .69, .66, .7))
    P = chamfer(78.0, 52.0, 10.0)
    P0 = scale(P, 1.06, 1.16)
    zs, zc = 38.0, 206.0
    b.ring(P0, 6.0, zs, T, poly1=P)
    b.ring(P, zs, zc, T)
    b.ring(offset(P0, -1.0), 0, 6.0, 'lobby')
    b.band(P0, 5.4, 0.8, 0.9, 'white')
    xr = 12.0
    hf = lambda p: 247.0 - (p[0] - xr) * 0.42 if p[0] >= xr else 247.0 - (xr - p[0]) * 0.72
    slope_crown(b, P, zc, hf, T, T, xs=xr)
    b.box(xr - 0.5, xr + 0.5, -27.0, 27.0, 240.0, 245.9, 'steel')   # ridge fin
    b.fins(P0, 6.0, zs, 'white', spacing=2.0, w=0.3, dep=0.4, poly1=P, minlen=8, lo=6)
    b.fins(P, zs, zc, 'white', spacing=2.0, w=0.3, dep=0.4, minlen=8, lo=6)
    floorbands(b, P, zs, zc + 4, 6.6, 'white', h=0.3, dep=0.5, lo=5)
    b.band(P, zs - 0.3, 0.6, 0.6, 'white')
    beacons(b, [(xr, -25.5, 245.9), (xr, 25.5, 245.9), (xr, 0, 245.9)])
    if b.hi:
        b.fins(offset(P0, -1.0), 0, 5.4, 'white', spacing=8.0, w=0.8, dep=0.9, minlen=8, ends=True)
        b.portal(offset(P0, -1.0)[0], offset(P0, -1.0)[1], 0.0, 9.0, 4.6, 'steel', 'glass', dep=0.9, canopy=3.5)


@model('marunouchi_building', 'A', 180.0, face='east', stone=0xb9ae9a,
       desc='The 31 m stone podium re-creating the 1923 block (gridded windows, piers, cornice, the triple-arched entrance) on a 80 x 95 m lot, '
            'and the set-back glass tower in two wings either side of a dark slot, stone piers modelled, recessed crown')
def marunouchi(b):
    std(b)
    S = b.facade(punched('marunouchi_stone', (.74, .70, .62), bay=3.4, floor=4.4, cols=4, rows=8, seed=45, wx=(.2, .8), wy=(.22, .84), mv=1, mh=1,
                         course=3, sill=(.80, .77, .70), rough=.75, night=.55))
    T = b.facade(curtain('marunouchi_glass', (.30, .38, .44), wall=(.72, .70, .64), bay=1.7, floor=4.25, seed=46, pier=(.16, (.74, .71, .64)), night=.5))
    b.colours(stone=(.74, .70, .62, .75), stone_l=(.82, .79, .72, .7), stone_d=(.58, .55, .49, .8), roof=(.45, .45, .44), glass=(.2, .24, .28, .2),
              dark=(.24, .28, .32, .25), steel=(.6, .61, .62, .4), bronze=(.33, .27, .2, .45))
    pod = rect(80.0, 95.0)
    zp = 31.0
    b.prism(pod, 0, zp, S, top='roof', vfloors=7)
    b.band(pod, zp - 0.6, 1.6, 0.9, 'stone_l')
    b.band(pod, 0, 1.4, 0.35, 'stone_d', bottom=False)
    b.fins(pod, 1.4, zp - 0.6, 'stone', spacing=3.4, w=0.9, dep=0.45, ends=True, lo=6)
    if b.hi:
        b.band(pod, 8.6, 0.7, 0.55, 'stone_l')
        b.band(pod, 26.2, 0.5, 0.5, 'stone_l')
        for s in (-10.2, 0.0, 10.2):   # the triple entrance
            b.attach(pod[0], pod[1], s - 3.4, s + 3.4, 0.0, 12.5, 0.2, 'lobby', top=False)
            b.attach(pod[0], pod[1], s - 2.6, s + 2.6, 12.5, 14.2, 0.2, 'lobby', top=False)
            b.attach(pod[0], pod[1], s - 5.1, s - 3.4, 0.0, 16.0, 1.0, 'stone_l')
            b.attach(pod[0], pod[1], s + 3.4, s + 5.1, 0.0, 16.0, 1.0, 'stone_l')
        b.attach(pod[0], pod[1], -17.0, 17.0, 16.0, 17.6, 1.3, 'stone_l')
        b.attach(pod[0], pod[1], -15.3, 15.3, 5.2, 5.7, 3.2, 'bronze')
    # tower: two wings and the slot
    y0, y1 = -34.0, 40.0
    wings = [rect2(-34, -4, y0, y1), rect2(4, 34, y0, y1)]
    zt = 168.0
    for W in wings:
        b.prism(W, zp, zt, T, top='roof')
        b.fins(W, zp, zt + 4.0, 'stone', spacing=3.4, w=0.7, dep=0.55, ends=True, top=True, lo=6)
        floorbands(b, W, zp, zt, 6.4, 'stone_l', h=0.45, dep=0.6, lo=5)
        b.band(W, zt, 1.2, 0.7, 'stone_l')
        b.prism(offset(W, -3.0), zt, 176.0, 'dark', top='roof')
        b.band(offset(W, -3.0), 175.2, 0.8, 0.5, 'stone_l', bottom=False)
    b.prism(rect2(-4, 4, y0 + 5, y1 - 5), zp, 172.0, 'dark', top='roof')
    b.prism(rect2(-14, 14, -18, 24), 172.0, 178.9, 'steel', top='roof')
    beacons(b, [(-33, y0 + 1, 169.2), (33, y0 + 1, 169.2), (-33, y1 - 1, 169.2), (33, y1 - 1, 169.2), (0, 0, 178.9)])


@model('dentsu_building', 'A', 213.0, face='southeast', stone=0x9aa7b0,
       desc='Thin boomerang blade: 118 m long, 26 m thick at the middle and knife-edged at the tips, convex front; grey fritted glass with fine '
            'louvre lines modelled, glass lift shafts on the concave back, steel tip fins, the low Caretta block behind')
def dentsu(b):
    std(b)
    T = b.facade(curtain('dentsu_glass', (.40, .46, .50), wall=(.78, .80, .81), bay=1.5, floor=4.3, seed=47, wy=(.26, .97), glass_var=.05, night=.5, cool=.3))
    C = b.facade(punched('dentsu_caretta', (.70, .70, .68), bay=4.0, floor=4.6, cols=4, rows=4, size=(256, 256), seed=48, wx=(.08, .92), wy=(.25, .85), night=.7))
    b.colours(white=(.80, .82, .83, .4), roof=(.46, .47, .48), steel=(.64, .66, .68, .35, .4), glass=(.22, .27, .31, .2))
    n = b.seg(14, 6)
    ts = [-0.975 + 1.95 * i / n for i in range(n + 1)]
    Lh = 60.0
    outer = [(t * Lh, -27.0 * (1 - t * t)) for t in ts]
    inner = [(t * Lh, -6.0 * (1 - t * t) + 1.3) for t in ts[::-1]]
    P = move(outer + inner, 0, 15.0)
    zr = 207.0
    b.ring(P, 7.0, zr, T, smooth=True, thr=30)
    b.ring(offset(P, -0.9), 0, 7.0, 'lobby')
    b.cap(P, 7.0, 'white', down=True)
    b.cap(P, zr, 'roof')
    b.ring(P, zr, 211.9, T, smooth=True, thr=30, vfloors=1)
    b.ring(offset(P, -0.5), zr, 211.9, 'steel', inward=True)
    floorbands(b, P, 7.0, zr, 12.9, 'white', h=0.28, dep=0.35, lo=4, edges=set(range(n)))
    floorbands(b, P, 7.0, zr, 12.9, 'white', h=0.28, dep=0.3, edges=set(range(n + 1, 2 * n + 1)))
    for e in (n, 2 * n + 1):   # tip fins
        a, c = P[e], P[(e + 1) % len(P)]
        b.attach(a, c, 0, 1, 0.0, 211.9, 1.6, 'steel', frac=True)
    for x in ((-21, -7, 7, 21) if b.hi else (-14, 14)):   # glass lifts on the back
        t = x / Lh
        yb = -6.0 * (1 - t * t) + 1.3 + 15.0
        b.box(x - 2.2, x + 2.2, yb - 0.5, yb + 3.2, 0, 200.0, 'litc' if b.hi else 'dim')
        if b.hi:
            b.box(x - 2.5, x - 2.2, yb - 0.5, yb + 3.5, 0, 203.0, 'steel')
            b.box(x + 2.2, x + 2.5, yb - 0.5, yb + 3.5, 0, 203.0, 'steel')
    beacons(b, [(-59.3, 14.3, 211.9), (59.3, 14.3, 211.9), (0, -11.6, 211.9), (0, 10.0, 211.9)])
    # Caretta Shiodome block behind
    car = rect2(-34, 34, 24, 50)
    b.prism(car, 0, 20.0, C, top='roof')
    if b.hi:
        b.band(car, 19.4, 0.9, 0.4, 'white', bottom=False)
        b.cbox(-10, 37, 16, 12, 20.0, 23.0, 'steel')
        b.portal(offset(P, -0.9)[n // 2 - 1], offset(P, -0.9)[n // 2 + 1], 0.0, 9.0, 5.0, 'steel', 'glass', dep=0.8, canopy=3.2)
        b.fins(offset(P, -0.9), 0, 7.0, 'white', n=1, w=0.6, dep=0.8, ends=True, edges=set(range(n)))


@model('nec_supertower', 'A', 180.0, face='east', stone=0xa9aeb4,
       desc="The 'rocket': three stepped tiers (95, 66 and 42 m wide) with sloping glass shoulders, the open wind hole through the block above "
            'the atrium, silver panel-and-glass bands with modelled ledges and corner piers, roof mast')
def nec(b):
    std(b)
    T = b.facade(curtain('nec_panel', (.25, .31, .37), wall=(.70, .72, .75), bay=1.6, floor=4.1, seed=49, wy=(.40, .88), rough=.35, night=.55, cool=.3))
    b.colours(alu=(.72, .74, .77, .35, .4), alu_d=(.52, .54, .58, .4, .3), roof=(.44, .45, .46), glass=(.2, .25, .3, .2), soff=(.55, .57, .6, .6),
              sglass=(.30, .38, .45, .2), mast=(.8, .8, .8, .5))
    R = lambda w, d: rect(w, d)
    D1, D2, D3 = 58.0, 50.0, 42.0
    zh0, zh1 = 44.0, 57.0
    hx = 21.0
    b.prism(R(95, D1), 0, zh0, T, top=None)
    for sx in (-1, 1):   # blocks either side of the wind hole
        blk = rect2(hx, 47.5, -D1 / 2, D1 / 2) if sx > 0 else rect2(-47.5, -hx, -D1 / 2, D1 / 2)
        b.ring(blk, zh0, zh1, T)
    b.poly([(-hx, -D1 / 2, zh0), (hx, -D1 / 2, zh0), (hx, D1 / 2, zh0), (-hx, D1 / 2, zh0)], 'soff')
    b.poly([(-hx, D1 / 2, zh1), (hx, D1 / 2, zh1), (hx, -D1 / 2, zh1), (-hx, -D1 / 2, zh1)], 'soff')
    # shoulders and tiers
    b.ring(R(95, D1), zh1, 66.0, T, poly1=R(66, D2), vfloors=2)
    b.ring(R(66, D2), 66.0, 116.0, T)
    b.ring(R(66, D2), 116.0, 126.0, T, poly1=R(42, D3), vfloors=2)
    b.ring(R(42, D3), 126.0, 170.0, T)
    b.ring(R(42, D3), 170.0, 176.0, 'sglass', poly1=R(32, 32))
    b.cap(R(32, 32), 176.0, 'roof')
    b.prism(R(14, 14), 176.0, 178.2, 'alu_d', top='roof')
    b.cyl(0, 0, 0.6, 178.2, 180.0, 6, 'mast')
    beacons(b, [(15, 15, 176.0), (-15, -15, 176.0), (15, -15, 176.0), (-15, 15, 176.0)])
    ann = rect2(-47.5, 47.5, D1 / 2, D1 / 2 + 31.0)   # low rear wing
    b.prism(ann, 0, 22.0, T, top='roof', skip={0})
    b.band(ann, 21.4, 0.9, 0.4, 'alu', bottom=False, edges={1, 2, 3})
    for (w, d, z0, z1) in ((95, D1, 0, zh0), (66, D2, 66, 116), (42, D3, 126, 170)):
        Q = R(w, d)
        floorbands(b, Q, z0, z1, 4.1, 'alu', h=0.4, dep=0.4, lo=5)
        b.fins(Q, z0, z1, 'alu', n=1, w=2.2, dep=0.5, ends=True, lo=1)
        if b.hi:
            b.fins(Q, z0, z1, 'alu', spacing=2.4, w=0.4, dep=0.45, minlen=20)
            b.fins(Q, z0, z1, 'alu', spacing=4.8, w=0.4, dep=0.45, minlen=0, edges={1, 3}) if w < 90 else None
    b.band(R(95, D1), zh1 - 0.2, 0.8, 0.5, 'alu')
    b.band(R(66, D2), 65.6, 0.8, 0.5, 'alu')
    b.band(R(42, D3), 125.6, 0.8, 0.5, 'alu')
    if b.hi:
        for sx in (-1, 1):   # hole frame
            b.box(sx * hx - 0.6, sx * hx + 0.6, -D1 / 2 - 0.5, D1 / 2 + 0.5, zh0, zh1, 'alu')
        b.band(R(95, D1), zh0 - 0.4, 0.8, 0.5, 'alu')
        # atrium front and entrance
        P = R(95, D1)
        b.attach(P[0], P[1], -hx, hx, 0.0, 30.0, 2.5, 'lobby', top=False)
        b.attach(P[0], P[1], -hx - 0.8, hx + 0.8, 30.0, 31.0, 3.0, 'alu')
        for s in (-14, -7, 0, 7, 14):
            b.attach(P[0], P[1], s - 0.3, s + 0.3, 0.0, 30.0, 2.9, 'alu')
        b.portal((P[0][0], P[0][1] - 2.5), (P[1][0], P[1][1] - 2.5), 0.0, 8.0, 4.6, 'alu_d', 'glass', dep=0.8, canopy=3.0)


if __name__ == '__main__':
    run()
