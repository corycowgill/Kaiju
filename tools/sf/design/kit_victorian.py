# SF kit: the wood Victorians / Edwardians (bucket low). design-kit.
import math
import numpy as np
import kit_lib as K
from kit_lib import *
from kit_parts import *
from kit_block import *

CREAM = C(0xf0e8d6)


def bay_paint(bs, segs, v0, fh, nfl, body, trim, acc, sash, style='stick', frieze=0.55, kind='hung', minw=0.0, mat='siding'):
    """Paint an unrolled bay column: per floor a panelled apron, windows on every face, a header band."""
    u0 = segs[0][0]; u1 = segs[-1][1]; H = nfl * fh + frieze
    if mat == 'siding': bs.siding(u0, v0, u1 - u0, H, body, 0.14 if style == 'stick' else 0.1, 0.16 if style == 'stick' else 0.1)
    else: bs.rect(u0, v0, u1 - u0, H, body)
    for f in range(nfl):
        y = v0 + f * fh
        bs.rect(u0, y, u1 - u0, 0.16, trim); bs.rect(u0, y, u1 - u0, 0.04, mul(trim, 0.75))      # belt
        for (a, b) in segs:
            w = b - a
            # apron panel
            bs.rect(a + 0.14, y + 0.24, w - 0.28, 0.6, trim); bs.rect(a + 0.2, y + 0.3, w - 0.4, 0.48, acc)
            if style == 'stick': bs.rect(a + 0.26, y + 0.36, w - 0.52, 0.36, mul(acc, 1.18))
            # window(s)
            wy = y + 0.98; wh = fh - 0.98 - 0.62
            if w < minw:
                continue
            if w > 1.8:
                ww = (w - 0.5) / 2
                bs.window(a + 0.2, wy, ww, wh, trim=trim, tw=0.07, frame=sash, kind=kind)
                bs.window(a + 0.3 + ww, wy, ww, wh, trim=trim, tw=0.07, frame=sash, kind=kind)
            else:
                bs.window(a + 0.2, wy, w - 0.4, wh, trim=trim, tw=0.07, frame=sash, kind=kind)
            # header: small cornice over the windows
            bs.rect(a + 0.08, y + fh - 0.55, w - 0.16, 0.2, trim); bs.rect(a + 0.08, y + fh - 0.6, w - 0.16, 0.05, mul(trim, 0.72))
            if style == 'stick':
                bs.rect(a + 0.2, y + fh - 0.32, w - 0.4, 0.2, acc, 0.9)
    for (a, b) in segs:      # colonnettes at the angles
        bs.rect(a, v0, 0.09, H, trim); bs.rect(b - 0.09, v0, 0.09, H, trim)
        bs.rect(a + 0.09, v0, 0.025, H, mul(trim, 0.75))
    if frieze > 0:
        y = v0 + nfl * fh
        bs.rect(u0, y, u1 - u0, frieze, trim)
        for (a, b) in segs:
            bs.rect(a + 0.15, y + 0.1, b - a - 0.3, frieze - 0.2, acc)
            paint_brackets(bs, a, b - a, y + 0.04, frieze - 0.04, max(2, int((b - a) / 0.55)), trim, 0.13)
    bs.weather(u0, v0, u1 - u0, H, 0.6, 3, base=False)
    bs.vshade(u0, v0 + H - 0.5, u1 - u0, 0.5, 1.0, 0.82)


def rear_wall(B, houses, g, fh, nfl, seed=0, porch=True, mat='siding'):
    """Rear elevation of a row: plain siding, sash windows, a back door and a stacked rear porch box per house."""
    s = B.s; n = len(houses); HW = B.w / n
    for i, hc in enumerate(houses[::-1]):
        x0 = i * HW; body = mul(mix(hc['body'], 0xb0aca0, 0.25), 0.97)
        wallpaint(s, x0, 0, HW, B.h, mat, body, seed + i)
        s.rect(x0, 0, HW, 0.4, mul(body, 0.7)); s.rect(x0, 0, 0.1, B.h, mul(body, 0.8))
        tr = hc['trim']
        px = x0 + 0.5; pw = 2.8
        if porch:
            ph = g + (nfl - 1) * fh + 2.6
            s.siding(px, 0, pw, ph, mul(body, 1.05), 0.14)
            for f in range(nfl):
                y = g + f * fh
                s.window(px + 0.4, y + 0.9, pw - 0.8, 1.5, trim=tr, tw=0.07, kind='grid', nx=3, ny=2, frame=tr)
            s.door(px + 0.9, 0, 0.9, 2.1, 0x6e6a60, tr, glass=True)
            s.rect(px, ph - 0.12, pw, 0.12, mul(tr, 0.85))
            B.box(px, 0, pw, ph, 1.6, lod=True, ao=0)
        for f in range(nfl):
            y = g + f * fh
            for wx in (x0 + 3.9, x0 + 5.7):
                if wx + 1.0 > x0 + HW - 0.3: continue
                s.window(wx, y + 1.0, 0.95, 1.7, trim=tr, tw=0.09, frame=tr, kind='hung', sill=mul(tr, 0.85))
                B.recess(wx, y + 1.0, 0.95, 1.7, 0.12)
        s.window(x0 + 4.2, 1.0, 1.4, 1.0, trim=tr, tw=0.07, frame=tr, kind='grid', nx=3, ny=1)
        downpipe(s, x0 + HW - 0.35, 0, B.h - 0.3)
    s.vshade(0, B.h - 0.4, B.w, 0.4, 1.0, 0.9)



def flats_row(k, houses, o):
    """A row of wood flats, one house per entry of `houses` (dicts: body, trim, acc, door, sash, mir).
    o: HW, D, g, fh, nfl, bay ('slant' | 'round'), style ('stick' | 'edwardian'), mat."""
    HW = o.get('HW', 7.6); N = len(houses); W = HW * N; D = o.get('D', 19.0)
    g = o.get('g', 3.0); fh = o.get('fh', 3.6); nfl = o.get('nfl', 2); eave = g + nfl * fh
    edw = o.get('style', 'stick') == 'edwardian'
    fr = 0.55; corn = 1.05 if not edw else 1.15
    top = eave + corn + (0.3 if not edw else 0.15); hs = eave + 0.55; roof = eave + 0.1
    mat = o.get('mat', 'siding')
    F, R, B, L = shell(k, W, D, top, hs, hs)
    s = F.s
    for i, hc in enumerate(houses):
        x0 = i * HW; mir = hc.get('mir', False)
        body, trim, acc, sash = hc['body'], hc['trim'], hc['acc'], hc['sash']
        X = (lambda a, w=0.0, x0=x0, mir=mir: x0 + (HW - a - w if mir else a))
        if mat == 'siding': s.siding(x0, 0, HW, top, body, 0.14 if not edw else 0.1, 0.16 if not edw else 0.1)
        else: s.rect(x0, 0, HW, top, body); s.noise(x0, 0, HW, top, 0.03, 0.12, 0.12, i)
        s.weather(x0, 0, HW, top, 0.6, i)
        # rusticated ground floor (flush boards), water table, corner boards, belt at the first floor
        s.rect(x0, 0, HW, g, mul(body, 0.94) if not edw else mul(trim, 0.9)); s.hlines(x0, 0, HW, g, mul(body, 0.78) if not edw else mul(trim, 0.72), 0.3 if not edw else 0.42, 0.03)
        s.rect(x0, 0, HW, 0.3, mul(body, 0.66))
        s.rect(x0, 0, 0.16, top, trim); s.rect(x0 + HW - 0.16, 0, 0.16, top, trim)
        s.rect(x0, g - 0.1, HW, 0.24, trim); s.rect(x0, g - 0.14, HW, 0.05, mul(trim, 0.72))
        F.box(x0 + 0.02, g - 0.1, HW - 0.04, 0.24, 0.07, faces='ftb')
        # entry: deep porch recess with a stair flight, door + transom at the first floor
        ex, ew = 0.55, 1.8
        eh = g + 2.75
        s.rect(X(ex, ew), 0, ew, eh, mul(body, 0.62))
        s.door(X(ex + 0.35, 1.1), g, 1.1, 2.65, hc['door'], trim, glass=True, transom=0.42)
        steps(F, X(ex, ew), ew, 10, g / 10, 0.2, C(0x9a958a), d0=-0.15)
        F.recess(X(ex, ew), 0, ew, eh, 2.25)
        if edw:
            # round columns on plinths carrying an entablature
            ps = k.prop_sheet() if False else s
            for px in (ex - 0.02, ex + ew - 0.2):
                s.hgrad(X(px - 0.03, 0.28), 0, 0.28, eh, mul(trim, 0.82), trim)
                cxp = F.P(X(px, 0.22) + 0.11, 0, 0.2)
                k.cyl(cxp[0], cxp[2], 0.13, g * 0.55, eh, 6, s, (X(px - 0.03, 0.28), g * 0.55, 0.28, eh - g * 0.55))
                F.box(X(px - 0.05, 0.32), 0, 0.32, g * 0.55, 0.38, faces='flrt')
        else:
            for px in (ex - 0.26, ex + ew + 0.02):   # pilasters
                s.grad(X(px, 0.24), 0, 0.24, eh, mul(trim, 0.9), trim); s.rect(X(px, 0.24), eh - 0.25, 0.24, 0.25, mul(trim, 0.85))
                F.box(X(px, 0.24), 0, 0.24, eh, 0.14, faces='flr')
        hx = ex - 0.4; hw = ew + 0.8
        cornice_paint(s, X(hx, hw), eh, hw, 0.5, trim, dentil=0.2)
        F.box(X(hx, hw), eh, hw, 0.5, 0.62 if not edw else 0.5, ao=0.3)
        # window(s) over the entry on the upper floors, each with a hood
        for f in range(1, nfl):
            wx, ww, wy, wh = ex + 0.3, 1.2, g + f * fh + 0.95, fh - 1.5
            s.window(X(wx, ww), wy, ww, wh, trim=trim, tw=0.13, frame=sash, kind='hung', sill=trim)
            F.recess(X(wx, ww), wy, ww, wh, 0.14)
            cornice_paint(s, X(wx - 0.22, ww + 0.44), wy + wh + 0.13, ww + 0.44, 0.3, trim, dentil=0)
            F.box(X(wx - 0.22, ww + 0.44), wy + wh + 0.13, ww + 0.44, 0.3, 0.25, ao=0.25)
            s.rect(X(wx - 0.13, ww + 0.26), wy - 0.75, ww + 0.26, 0.55, trim); s.rect(X(wx - 0.05, ww + 0.1), wy - 0.68, ww + 0.1, 0.41, acc)
            F.box(X(wx - 0.2, ww + 0.4), wy - 0.2, ww + 0.4, 0.1, 0.1, faces='ftblr')
        # garage under the bay
        bx, bw, bd, ch = 3.05, 4.0, 0.95, 0.95
        gx, gw, gh = bx + 0.5, 3.0, 2.3
        s.rect(X(gx - 0.14, gw + 0.28), 0, gw + 0.28, gh + 0.14, trim)
        s.garage(X(gx, gw), 0, gw, gh, hc.get('garage', mix(trim, body, 0.25)))
        F.recess(X(gx, gw), 0, gw, gh, 0.3)
        # the bay: nfl floors + frieze, then its crown
        bh = nfl * fh + fr
        if o.get('bay', 'slant') == 'slant':
            prof = [(0, 0), (ch, bd), (bw - ch, bd), (bw, 0)]
            cw = bw + 0.6
            cprof = [(0, 0), (0.05, 0.3), (ch + 0.15, bd + 0.35), (cw - ch - 0.15, bd + 0.35), (cw - 0.05, 0.3), (cw, 0)]
        else:
            prof = [(0, 0), (0.3, 0.6), (1.05, 1.0), (bw - 1.05, 1.0), (bw - 0.3, 0.6), (bw, 0)]
            cw = bw + 0.6
            cprof = [(0, 0), (0.05, 0.3), (0.45, 0.95), (1.3, 1.35), (cw - 1.3, 1.35), (cw - 0.45, 0.95), (cw - 0.05, 0.3), (cw, 0)]
        bs = k.sheet(6.4, bh + (corn - fr), 1.0, 'bay%d' % i)
        _, segs = F.bay(X(bx, bw), g, bh, prof, bs)
        bay_paint(bs, segs, 0, fh, nfl, body, trim, acc, sash, o.get('style', 'stick'), fr, minw=0.8, mat=mat)
        cornice_paint(bs, 0, bh, 6.4, corn - fr, trim, dentil=0.25 if edw else 0)
        F.bay(X(bx - 0.3, cw), g + bh, corn - fr, cprof, bs, 0, bh, captop=bh + (corn - fr) - 0.03)
        for px in (bx + 0.25, bx + bw - 0.5):    # brackets under the bay
            s.grad(X(px, 0.25), g - 0.75, 0.25, 0.65, mul(trim, 0.8), trim)
            F.box(X(px, 0.25), g - 0.75, 0.25, 0.65, 0.5, faces='flrb')
        # main cornice on the flat wall: frieze with panels, brackets, crown
        s.rect(x0, eave, HW, fr, trim); s.rect(x0 + 0.3, eave + 0.1, HW - 0.6, fr - 0.2, acc if not edw else mul(trim, 0.93))
        cornice_paint(s, x0, eave + fr, HW, corn - fr, trim, dentil=0.25 if edw else 0)
        s.rect(x0, eave + corn, HW, top - eave - corn, mul(trim, 0.95)); s.rect(x0, top - 0.08, HW, 0.08, mul(trim, 0.8))
        F.box(x0, eave + fr, HW, corn - fr, 0.42, ao=0.35, lod=True)
        fx = 0.2; fw = bx - 0.3
        nb = 4 if not edw else 6
        paint_brackets(s, X(fx, fw), fw, eave + 0.03 + (0.25 if edw else 0), fr - 0.03 - (0.25 if edw else 0), nb, trim, 0.16 if not edw else 0.12)
        brackets(F, X(fx, fw), fw, eave + 0.03 + (0.25 if edw else 0), fr - 0.03 - (0.25 if edw else 0), nb, 0.16 if not edw else 0.12, 0.3)
        s.vshade(x0, eave - 0.6, HW, 0.6, 1.0, 0.8)
    F.wall()
    false_front(F, hs, 0.3)
    party_wall(R, mat, mul(mix(houses[-1]['body'], 0xb8b4a8, 0.3), 0.96), nfl, g, fh, 1, wins=4, trim=houses[-1]['trim'])
    party_wall(L, mat, mul(mix(houses[0]['body'], 0xb8b4a8, 0.3), 0.96), nfl, g, fh, 2, wins=4, trim=houses[0]['trim'])
    R.wall(); L.wall()
    rear_wall(B, houses, g, fh, nfl, 5, mat=mat)
    B.wall()
    k.flat_roof(0, -D, W, 0, roof, hs, 0.25, seed=3)
    roof_firewalls(k, [HW * j for j in range(1, N)], -D + 0.25, -0.3, roof)
    for i in range(N):
        x0 = i * HW
        k.skylight(x0 + 2.0, roof, -8.0, 1.6, 1.1); k.skylight(x0 + 4.6, roof, -13.5, 1.2, 1.2)
        k.chimney(x0 + 0.6, roof, -6.0 - i, 0.6, 1.5, 0.6)
        k.vent(x0 + 5.5, roof, -5.0, 0.2, 0.7); k.vent(x0 + 3.2, roof, -15.5, 0.15, 0.5)
        k.box(x0 + 5.2, roof, -11.0, x0 + 6.1, roof + 0.25, -10.1, k.prop_sheet(), (0.1, 3.05, 1.5, 0.2), (3.1, 2.1, 0.5, 0.5))


@K.piece('sf_victorian_a', style='victorian lowrise', stone=0xd8c8b0, share=2,
         desc='row of three Italianate / Stick 3-storey flats: slanted bays, bracketed cornices, garage + stoop ground floors, blue / butter / rose')
def victorian_a(k):
    flats_row(k, [dict(body=C(0x86adc2), trim=CREAM, acc=C(0x3f5f7c), door=C(0x8a2f2a), sash=C(0xf4efe2)),
                  dict(body=C(0xe6c878), trim=C(0xf5eede), acc=C(0xb4623a), door=C(0x2f5a4a), sash=C(0x7a3528), mir=True),
                  dict(body=C(0xd49a98), trim=C(0xf0e6d8), acc=C(0x7c4650), door=C(0x33405a), sash=C(0xf4efe2))], dict())


@K.piece('sf_victorian_c', style='victorian lowrise apartment', stone=0xd6d0c0, share=2,
         desc='row of three Edwardian 3-storey flats: rounded bays, columned porches, flat dentil cornice, cream / dove grey / sage')
def victorian_c(k):
    flats_row(k, [dict(body=C(0xe9dfc4), trim=C(0xf6f1e4), acc=C(0xcdbf9c), door=C(0x5a3526), sash=C(0x5c4a3a), mir=True),
                  dict(body=C(0xaab2b4), trim=C(0xf2f0ea), acc=C(0x8a9498), door=C(0x7a2a26), sash=C(0xf4efe2)),
                  dict(body=C(0xb4c2a2), trim=C(0xf4f0e0), acc=C(0x8ea07c), door=C(0x3a4a3a), sash=C(0xf4efe2), mir=True)],
              dict(style='edwardian', bay='round', fh=3.4, g=3.1, D=20.0))


def tile_patch(k, w=3.0, h=0.9, c=0xb5573a, pitch=0.16):
    s, ax, ay = misc_slot(k, w, h + 0.1)
    s.tiles(ax, ay, w, h, c, pitch, 0.3, 0.3)
    s.rect(ax, ay, w, 0.1, mul(c, 0.8))
    s.noise(ax, ay, w, h, 0.1, 0.5, 0.5, 4)
    return s, (ax, ay, w, h)


@K.piece('sf_victorian_e', style='victorian lowrise stucco', stone=0xe0d2b8,
         desc='Marina-style row of three 2-storey stucco houses over garages: tunnel entrances, picture-window bays, red tile pent roofs and parapets')
def victorian_e(k):
    HW = 7.6; N = 3; W = HW * N; D = 15.0
    g = 2.75; fh = 3.3; eave = g + fh; top = eave + 0.95; hs = eave + 0.5; roof = eave + 0.1
    F, R, B, L = shell(k, W, D, top, hs, hs)
    s = F.s
    houses = [dict(body=C(0xeadcbc), trim=C(0xf5efe0), acc=C(0x7a4a34), sash=C(0x5a4636), door=C(0x6a4630)),
              dict(body=C(0xe7b592), trim=C(0xf6ecdc), acc=C(0x6e4a3a), sash=C(0xf2ece0), door=C(0x3e4e44)),
              dict(body=C(0xc2d2b6), trim=C(0xf4f0e2), acc=C(0x5c6a50), sash=C(0xf2ece0), door=C(0x70402e))]
    ts, tr = tile_patch(k)
    for i, hc in enumerate(houses):
        x0 = i * HW; body, trim, sash = hc['body'], hc['trim'], hc['sash']
        s.rect(x0, 0, HW, top, body); s.noise(x0, 0, HW, top, 0.035, 0.12, 0.12, i); s.weather(x0, 0, HW, top, 0.7, i)
        s.rect(x0, 0, HW, 0.35, mul(body, 0.7)); s.rect(x0 + HW - 0.04, 0, 0.04, top, mul(body, 0.7))
        mir = (i == 1)
        X = (lambda a, w=0.0, x0=x0, mir=mir: x0 + (HW - a - w if mir else a))
        # garage with a shallow arched head
        gx, gw, gh = 0.75, 2.75, 2.2
        s.garage(X(gx, gw), 0, gw, gh, mix(hc['acc'], 0xb09070, 0.45), panels=4, lites=(i != 1))
        s.poly([(X(gx, gw), gh), (X(gx, gw), gh - 0.3), (X(gx, gw) + 0.5, gh)], body); s.poly([(X(gx, gw) + gw, gh), (X(gx, gw) + gw, gh - 0.3), (X(gx, gw) + gw - 0.5, gh)], body)
        F.recess(X(gx, gw), 0, gw, gh, 0.32)
        # tunnel entrance: arched opening, three steps, a door deep inside
        ax, aw, ah = 4.75, 1.7, 2.55
        s.rect(X(ax, aw), 0, aw, ah, body)
        s.rect(X(ax, aw), 0, aw, ah - aw / 2, mul(body, 0.5)); s.ellipse(X(ax, aw) + aw / 2, ah - aw / 2, aw / 2, aw / 2, mul(body, 0.5), half='top')
        s.door(X(ax + 0.35, 1.0), 0.55, 1.0, 1.85, hc['door'], mul(trim, 0.8), glass=True)
        steps(F, X(ax, aw), aw, 3, 0.18, 0.3, C(0xa8846a), d0=-0.2)
        F.recess(X(ax, aw), 0, aw, ah, 1.5)
        s.rect(X(ax - 0.5, 0.25), 1.5, 0.25, 0.4, 0x3a3a38)   # lantern
        # upper floor
        if i == 1:
            # three arched windows behind an iron balconette
            for j in range(3):
                wx = 1.0 + j * 1.95; ww = 1.5; wy = g + 0.75; wh = 2.15
                s.rect(X(wx - 0.12, ww + 0.24), wy - 0.1, ww + 0.24, wh - ww / 2 + 0.1, trim); s.ellipse(X(wx, ww) + ww / 2, wy + wh - ww / 2, ww / 2 + 0.12, ww / 2 + 0.12, trim, half='top')
                s.window(X(wx, ww), wy, ww, wh, kind='arch', wall=trim, frame=sash)
                F.recess(X(wx, ww), wy, ww, wh, 0.22)
            bx = 0.8; bw = 6.0
            ms = k.metal_sheet(0x2c2e30)
            for hh in (0.0, 0.5, 0.95):
                k.bar(F.P(X(bx, bw), g + 0.45 + hh, 0.55), F.P(X(bx, bw) + bw, g + 0.45 + hh, 0.55), 0.06, ms, (0.1, 0.1, 0.3, 0.3))
            for j in range(9):
                px = X(bx, bw) + j * bw / 8
                k.bar(F.P(px, g + 0.45, 0.55), F.P(px, g + 1.4, 0.55), 0.045, ms, (0.1, 0.1, 0.3, 0.3))
            s.rect(X(bx, bw), g + 0.3, bw, 0.16, mul(body, 0.8))
            F.box(X(bx, bw), g + 0.3, bw, 0.16, 0.6, faces='flrtb', ao=0.25)
            s.ellipse(x0 + HW / 2, eave + 0.05, 0.3, 0.3, mul(body, 0.55))
        else:
            bx, bw, bd = 0.9, 5.8, 0.55
            bh = 2.75
            prof = [(0, 0), (0.5, bd), (bw - 0.5, bd), (bw, 0)] if i == 0 else [(0, 0), (0.35, bd * 0.6), (1.3, bd * 1.25), (bw - 1.3, bd * 1.25), (bw - 0.35, bd * 0.6), (bw, 0)]
            bs, segs = F.bay(X(bx, bw), g + 0.25, bh, prof)
            u1 = segs[-1][1]
            bs.rect(0, 0, u1, bh, body); bs.noise(0, 0, u1, bh, 0.035, 0.12, 0.12, 3)
            bs.rect(0, 0, u1, 0.22, trim); bs.rect(0, bh - 0.2, u1, 0.2, trim)
            for (a, b) in segs:
                w = b - a
                if w < 0.7: continue
                if w > 2.5:
                    # picture window: big centre light, casements with transoms each side
                    cw3 = w - 0.5
                    bs.rect(a + 0.17, 0.5, cw3 + 0.16, bh - 0.9, trim)
                    bs.window(a + 0.25, 0.58, cw3 * 0.22, bh - 1.06, frame=sash, kind='transom', nx=1)
                    bs.window(a + 0.25 + cw3 * 0.24, 0.58, cw3 * 0.52, bh - 1.06, frame=sash, kind='transom', nx=1, blind=0.6)
                    bs.window(a + 0.25 + cw3 * 0.78, 0.58, cw3 * 0.22, bh - 1.06, frame=sash, kind='transom', nx=1)
                else:
                    bs.window(a + 0.14, 0.58, w - 0.28, bh - 1.06, trim=trim, tw=0.07, frame=sash, kind='transom', nx=1)
            bs.vshade(0, bh - 0.6, u1, 0.6, 1.0, 0.8)
            # tile pent roof over the bay
            F.awning(X(bx - 0.25, bw + 0.5), g + 0.25 + bh, bw + 0.5, 0.7, bd * 1.25 + 0.45, 0.1, uvrect=tr, sh=ts, lod=True)
            s.grad(X(bx + 0.3, bw - 0.6), g - 0.25, bw - 0.6, 0.5, mul(body, 0.8), body)
            F.box(X(bx + 0.3, bw - 0.6), g - 0.2, bw - 0.6, 0.45, bd * 0.7, faces='flrb')
        # tile coping along the parapet, stepped centre panel
        F.awning(x0 + 0.08, eave + 0.3, HW - 0.16, 0.6, 0.45, 0.1, uvrect=tr, sh=ts, lod=True, shadow=False)
        s.vshade(x0, eave - 0.2, HW, 0.5, 1.0, 0.82)
        s.rect(x0, top - 0.1, HW, 0.1, mul(body, 0.82))
    F.wall(); false_front(F, hs, 0.3)
    party_wall(R, 'stucco', mul(houses[2]['body'], 0.93), 1, g, fh, 1, wins=3, trim=houses[2]['trim'], first=1)
    party_wall(L, 'stucco', mul(houses[0]['body'], 0.93), 1, g, fh, 2, wins=3, trim=houses[0]['trim'], first=1)
    R.wall(); L.wall()
    rear_wall(B, houses, g, fh, 1, 5, mat='stucco')
    B.wall()
    k.flat_roof(0, -D, W, 0, roof, hs, 0.25, seed=5)
    roof_firewalls(k, [HW, 2 * HW], -D + 0.25, -0.3, roof)
    for i in range(N):
        x0 = i * HW
        k.skylight(x0 + 2.4, roof, -7.0, 1.5, 1.1); k.vent(x0 + 5.5, roof, -4.5, 0.2, 0.6); k.chimney(x0 + 6.4, roof, -10.0, 0.6, 1.2, 0.6)
        k.box(x0 + 1.2, roof, -12.0, x0 + 2.1, roof + 0.25, -11.1, k.prop_sheet(), (0.1, 3.05, 1.5, 0.2), (3.1, 2.1, 0.5, 0.5))


@K.piece('sf_victorian_b', style='victorian lowrise house', stone=0xcdbfd0,
         desc="Queen Anne 'painted lady' pair: front gables with fish-scale shingles and sunbursts, slanted bay, round corner turret with a witch-hat roof")
def victorian_b(k):
    HW = 7.6; W = 2 * HW; D = 17.0
    g = 2.9; fh = 3.4; eave = g + 2 * fh; rise = 3.9; apex = eave + rise
    fs = k.sheet(W, apex, 1.0, 'front'); bsh = k.sheet(W, apex, 0.6, 'back')
    houses = [dict(body=C(0xa79cc6), trim=C(0xf3ecdf), acc=C(0x5c4f86), sash=C(0xf4efe2), door=C(0x7c2c34), gable=C(0xd9c070)),
              dict(body=C(0x8fc0b0), trim=C(0xf5efdf), acc=C(0x3e7468), sash=C(0x7a3a30), door=C(0x2c4860), gable=C(0xd88f78))]
    ov = 0.45
    slope = math.hypot(HW / 2, rise); rsh = k.sheet(slope * (1 + 0.35 / (HW / 2)), D + 2 * ov, 0.5, 'roof')
    rsh.shingles(0, 0, rsh.w, rsh.h, C(0x60646a), 0.35, 0.2); rsh.noise(0, 0, rsh.w, rsh.h, 0.12, 2.0, 2.0, 3); rsh.noise(0, 0, rsh.w, rsh.h, 0.08, 0.3, 3.0, 5)
    rsh.rect(0, 0, 0.12, rsh.h, C(0x4a4c50))
    s = fs
    for i, hc in enumerate(houses):
        x0 = i * HW; body, trim, acc, sash = hc['body'], hc['trim'], hc['acc'], hc['sash']
        Fh = k.facade((x0, 0, 0), (1, 0, 0), HW, eave, sheet=fs, su=x0)
        Bh = k.facade((W - x0, 0, -D), (-1, 0, 0), HW, eave, sheet=bsh, su=x0)
        s.siding(x0, 0, HW, eave, body, 0.13); s.weather(x0, 0, HW, eave, 0.6, i)
        s.rect(x0, 0, HW, g, mul(body, 0.92)); s.hlines(x0, 0, HW, g, mul(body, 0.78), 0.3, 0.03); s.rect(x0, 0, HW, 0.3, mul(body, 0.66))
        s.rect(x0, 0, 0.16, eave, trim); s.rect(x0 + HW - 0.16, 0, 0.16, eave, trim)
        # belt between the floors: a band of fish-scale shingles
        s.scales(x0 + 0.16, g + fh - 0.75, HW - 0.32, 0.75, hc['gable'], 0.2); s.rect(x0, g + fh - 0.85, HW, 0.12, trim); s.rect(x0, g + fh, HW, 0.1, trim)
        s.rect(x0, g - 0.1, HW, 0.24, trim); Fh.box(0.02, g - 0.1, HW - 0.04, 0.24, 0.07, faces='ftb')
        # gable: fish-scales, attic window, sunburst, bargeboards
        s.scales(x0, eave, HW, rise, hc['gable'], 0.24)
        s.rect(x0, eave - 0.15, HW, 0.4, trim); s.rect(x0, eave - 0.2, HW, 0.06, mul(trim, 0.7))
        cx = x0 + HW / 2
        s.window(cx - 0.55, eave + 0.75, 1.1, 1.35, trim=trim, tw=0.14, frame=sash, kind='pair')
        for a in range(-3, 4):
            s.poly([(cx, apex - 1.75), (cx + math.sin(a * 0.27 - 0.1) * 1.3, apex - 1.75 + math.cos(a * 0.27 - 0.1) * 1.3 * 0.9), (cx + math.sin(a * 0.27 + 0.1) * 1.3, apex - 1.75 + math.cos(a * 0.27 + 0.1) * 1.3 * 0.9)], acc if a % 2 else trim)
        s.poly([(cx - 1.75, apex - 1.75), (cx + 1.75, apex - 1.75), (cx + 1.75, apex - 1.9), (cx - 1.75, apex - 1.9)], trim)
        Fh.box(0, eave - 0.15, HW if i == 0 else HW - 3.0, 0.4, 0.3, ao=0.3, lod=False, faces='ftbr')
        mir = (i == 1)
        X = (lambda a, w=0.0, mir=mir: (HW - a - w if mir else a))
        # entry porch + stairs
        ex, ew = 5.3, 1.75; eh = g + 2.7
        s.rect(x0 + X(ex, ew), 0, ew, eh, mul(body, 0.6))
        s.door(x0 + X(ex + 0.33, 1.1), g, 1.1, 2.6, hc['door'], trim, glass=True, transom=0.4)
        Fh.s.rect(0, 0, 0, 0, trim)
        s.rect(x0 + X(ex, ew), 0, ew, g, C(0x9a958a))
        for j in range(10):
            s.rect(x0 + X(ex, ew), j * g / 10 + g / 10 - 0.05, ew, 0.05, C(0xb0aa9c)); s.rect(x0 + X(ex, ew), j * g / 10, ew, 0.04, C(0x746f66))
            Fh.box(X(ex, ew), j * g / 10, ew, g / 10, -0.15 - j * 0.2, -0.15 - (j + 1) * 0.2, faces='ft')
        Fh.recess(X(ex, ew), 0, ew, eh, 2.25)
        # porch hood: little gabled roof on turned posts
        cornice_paint(s, x0 + X(ex - 0.35, ew + 0.7), eh, ew + 0.7, 0.45, trim, dentil=0.18)
        Fh.box(X(ex - 0.35, ew + 0.7), eh, ew + 0.7, 0.45, 0.9, ao=0.3)
        s.scales(x0 + X(ex - 0.35, ew + 0.7), eh + 0.45, ew + 0.7, 0.8, hc['gable'], 0.16)
        px0 = X(ex - 0.35, ew + 0.7)
        Fh.face([Fh.P(px0, eh + 0.45, 0.9), Fh.P(px0 + ew + 0.7, eh + 0.45, 0.9), Fh.P(px0 + (ew + 0.7) / 2, eh + 1.25, 0.9)], [(px0, eh + 0.45), (px0 + ew + 0.7, eh + 0.45), (px0 + (ew + 0.7) / 2, eh + 1.25)], Fh.n)
        for sgn in (0, 1):
            a = Fh.P(px0 + sgn * (ew + 0.7), eh + 0.45, 0.9); b = Fh.P(px0 + (ew + 0.7) / 2, eh + 1.25, 0.9)
            a2 = Fh.P(px0 + sgn * (ew + 0.7), eh + 0.45, 0); b2 = Fh.P(px0 + (ew + 0.7) / 2, eh + 1.25, 0)
            k.emit([a, b, b2, a2], rsh, [(0.2, 0.2), (1.2, 0.2), (1.2, 1.1), (0.2, 1.1)], np.array([(-1 if sgn == 0 else 1), 1.0, 0]))
        for px in (ex - 0.25, ex + ew + 0.13):
            p = Fh.P(X(px, 0.12) + 0.06, g * 0.35, 0.8)
            k.cyl(p[0], p[2], 0.07, g * 0.35, eh, 5, fs, (x0 + 0.02, 0.5, 0.12, 2.0))
        # window over the entry, top floor
        wx, ww, wy, wh = ex + 0.28, 1.2, g + fh + 0.95, 1.95
        s.window(x0 + X(wx, ww), wy, ww, wh, trim=trim, tw=0.13, frame=sash, kind='hung', sill=trim)
        Fh.recess(X(wx, ww), wy, ww, wh, 0.14)
        cornice_paint(s, x0 + X(wx - 0.22, ww + 0.44), wy + wh + 0.13, ww + 0.44, 0.28, trim, dentil=0)
        Fh.box(X(wx - 0.22, ww + 0.44), wy + wh + 0.13, ww + 0.44, 0.28, 0.22, ao=0.25)
        # garage
        gx, gw, gh = 1.2, 2.9, 2.25
        s.rect(x0 + X(gx - 0.14, gw + 0.28), 0, gw + 0.28, gh + 0.14, trim); s.garage(x0 + X(gx, gw), 0, gw, gh, mix(trim, body, 0.3))
        Fh.recess(X(gx, gw), 0, gw, gh, 0.3)
        if i == 0:
            bx, bw, bd, ch = 0.65, 4.0, 0.95, 0.95
            bh = 2 * fh - 0.15
            bs = k.sheet(4.9, bh, 1.0, 'bay')
            _, segs = Fh.bay(X(bx, bw), g, bh, [(0, 0), (ch, bd), (bw - ch, bd), (bw, 0)], bs)
            bay_paint(bs, segs, 0, fh, 2, body, trim, acc, sash, 'stick', 0.0)
            bs.scales(0, fh - 0.75, 4.9, 0.62, hc['gable'], 0.2)
            for px in (bx + 0.25, bx + bw - 0.5):
                s.grad(x0 + X(px, 0.25), g - 0.75, 0.25, 0.65, mul(trim, 0.8), trim)
                Fh.box(X(px, 0.25), g - 0.75, 0.25, 0.65, 0.5, faces='flrb')
        else:
            # flat wall windows beside the turret + the round corner turret
            for f in range(2):
                wx2, ww2, wy2, wh2 = 2.75, 1.25, g + f * fh + 0.95, 1.95
                s.window(x0 + X(wx2, ww2), wy2, ww2, wh2, trim=trim, tw=0.13, frame=sash, kind='hung', sill=trim)
                Fh.recess(X(wx2, ww2), wy2, ww2, wh2, 0.14)
            tr_ = 2.0; tcx = W - 1.25; tcz = -1.25; ty0 = g; ty1 = eave + 1.3
            circ = 2 * math.pi * tr_
            tsh = k.sheet(circ, ty1 - ty0 + 0.8, 0.9, 'turret')
            th = ty1 - ty0
            tsh.siding(0, 0, circ, th, body, 0.13)
            tsh.scales(0, fh - 0.8, circ, 0.7, hc['gable'], 0.2); tsh.rect(0, fh - 0.9, circ, 0.12, trim); tsh.rect(0, fh - 0.1, circ, 0.12, trim)
            tsh.scales(0, 2 * fh - 0.5, circ, th - 2 * fh + 0.5 - 0.5, hc['gable'], 0.2)
            cornice_paint(tsh, 0, th - 0.5, circ, 0.5, trim, dentil=0.25)
            tsh.rect(0, 0, circ, 0.2, trim)
            nseg = 12
            for j in range(nseg):
                u = circ * j / nseg; sw = circ / nseg
                for f in range(2):
                    tsh.window(u + 0.16, f * fh + 0.95, sw - 0.32, 1.9, trim=trim, tw=0.08, frame=sash, kind='hung')
            tsh.weather(0, 0, circ, th, 0.5, 9, base=False)
            # corbel (y: th..th+0.8 on the sheet = trim gradient)
            tsh.grad(0, th, circ, 0.8, mul(trim, 0.7), trim)
            k.cyl(tcx, tcz, tr_, ty0, ty1, nseg, tsh, (0, 0, circ, th), lod=1)
            k.cyl(tcx, tcz, 0.9, ty0 - 1.0, ty0, nseg, tsh, (0, th, circ, 0.8), r1=tr_)
            k.cyl(tcx, tcz, tr_ + 0.35, ty1, ty1 + 4.4, nseg, rsh, (0.3, 0.3, slope - 0.4, 4.4), r1=0.0, lod=1)
            k.cyl(tcx, tcz, tr_ + 0.35, ty1 - 0.02, ty1, nseg, tsh, (0, th - 0.1, circ, 0.08), r1=tr_ + 0.35, cap=None)
            k.bar([tcx, ty1 + 4.3, tcz], [tcx, ty1 + 5.4, tcz], 0.08, k.metal_sheet(), (0.1, 0.1, 0.3, 0.3))
        Fh.wall(top=[(HW / 2, apex)])
        # rear of this house
        b = bsh; rb = mul(mix(body, 0xb0aca0, 0.3), 0.96); bx0 = x0
        b.siding(bx0, 0, HW, apex, rb, 0.14); b.weather(bx0, 0, HW, apex, 1.0, 7 + i)
        b.rect(bx0, 0, HW, 0.35, mul(rb, 0.7)); b.rect(bx0, 0, 0.12, eave, mul(rb, 0.8))
        for f in range(2):
            for wx in (1.2, 4.6):
                b.window(bx0 + wx, g + f * fh + 1.0, 1.0, 1.7, trim=trim, tw=0.09, frame=trim, kind='hung', sill=mul(trim, 0.85))
                Bh.recess(wx, g + f * fh + 1.0, 1.0, 1.7, 0.12)
        b.window(bx0 + HW / 2 - 0.45, eave + 0.8, 0.9, 1.1, trim=trim, tw=0.1, frame=trim, kind='pair')
        b.door(bx0 + 3.0, 0, 0.9, 2.1, 0x6e6a60, trim)
        b.window(bx0 + 5.0, 1.0, 1.3, 0.9, trim=trim, tw=0.07, frame=trim, kind='grid', nx=3, ny=1)
        Bh.wall(top=[(HW / 2, apex)])
        # roof: two slopes with front / rear overhang, bargeboards, soffits
        xr = x0 + HW / 2
        for sgn in (-1, 1):
            xe = xr + sgn * (HW / 2 + (0.35 if (i == 0 and sgn < 0) or (i == 1 and sgn > 0) else 0.0))
            ye = apex - rise * abs(xe - xr) / (HW / 2)
            ul = math.hypot(xe - xr, apex - ye)
            pts = [np.array([xe, ye, ov]), np.array([xr, apex, ov]), np.array([xr, apex, -D - ov]), np.array([xe, ye, -D - ov])]
            k.emit(pts, rsh, [(ul, 0), (0, 0), (0, D + 2 * ov), (ul, D + 2 * ov)], np.array([sgn * 0.7, 0.7, 0]), 3)
            for zz, zn in ((ov, 1.0), (-D - ov, -1.0)):
                # bargeboard + soffit
                zi = 0.0 if zn > 0 else -D
                k.emit([np.array([xe, ye, zz]), np.array([xr, apex, zz]), np.array([xr, apex - 0.42, zz]), np.array([xe, ye - 0.42, zz])], fs, [(x0 + 0.03, 0.4), (x0 + 0.03, 3.0), (x0 + 0.13, 3.0), (x0 + 0.13, 0.4)], np.array([0, 0, zn]))
                k.emit([np.array([xe, ye - 0.05, zz]), np.array([xr, apex - 0.05, zz]), np.array([xr, apex - 0.05, zi]), np.array([xe, ye - 0.05, zi])], fs, [(x0 + 0.03, 0.4), (x0 + 0.03, 3.0), (x0 + 0.13, 3.0), (x0 + 0.13, 0.4)], np.array([sgn * -0.7, -0.7, 0]))
        k.chimney(x0 + (1.2 if i == 0 else 5.6), eave + 0.6, -9.0, 0.75, 4.2, 0.75)
    R = k.facade((W, 0, 0), (0, 0, -1), D, eave, prio=0.6); L = k.facade((0, 0, -D), (0, 0, 1), D, eave, prio=0.6)
    party_wall(R, 'siding', mul(mix(houses[1]['body'], 0xb8b4a8, 0.25), 0.96), 2, g, fh, 1, wins=4, trim=houses[1]['trim'], recess=0.1)
    party_wall(L, 'siding', mul(mix(houses[0]['body'], 0xb8b4a8, 0.25), 0.96), 2, g, fh, 2, wins=4, trim=houses[0]['trim'], recess=0.1)
    R.wall(); L.wall()


@K.piece('sf_victorian_d', style='victorian lowrise apartment', stone=0xdcd2ba,
         desc='corner 4-storey Edwardian apartment block: corner shop, round corner bay with a domed cap, slanted bay stacks, dentil cornice')
def victorian_d(k):
    green = (C(0x2f5a44), C(0xe8e2d0))
    o = dict(W=15.0, D=22.0, g=4.3, fh=3.2, nfl=3, par=1.1, mat='stucco', c=0xe6dabc, trim=0xf4eee0, base=0x9c9a92, corner=True,
             cols=3, side_cols=4, win=dict(w=1.15, h=1.95, kind='hung', cased=True, d=0.18, frame=0x5e5648, hood=True),
             bays=dict(cols=[0, 1], w=3.5, d=0.85, c=0xe6dabc), side_bay_cols=[1, 2],
             cornice=dict(h=1.15, d=0.6, dentil=0.3, brackets=3),
             shops=[dict(awning=green, sign=C(0x2f5a44)), dict(awning=green, sign=C(0x2f5a44), door=1), dict(awning=green, door=0)],
             side_shops=[dict(awning=green), dict(kind='window'), dict(kind='entry', doorc=0x5a3024), dict(kind='garage')],
             skip={(2, 0), (2, 1), (2, 2)}, tank=False)
    def deco(c):
        F, R = c['F'], c['R']; W = c['W']
        r = 2.1; y0 = c['g']; y1 = c['top'] + 0.2; h = y1 - y0
        arc = 1.5 * math.pi * r
        ts = k.sheet(arc, h + 0.7, 1.0, 'cornerbay')
        body = C(0xe6dabc); trim = C(0xf4eee0)
        ts.rect(0, 0, arc, h, body); ts.noise(0, 0, arc, h, 0.035, 0.12, 0.12, 2); ts.weather(0, 0, arc, h, 0.6, 4, base=False)
        n = 9
        for f in range(3):
            y = f * 3.2
            ts.rect(0, y, arc, 0.22, trim); ts.rect(0, y, arc, 0.04, mul(trim, 0.7))
            for j in range(1, n - 1):
                u = arc * j / n; sw = arc / n
                ts.rect(u + 0.12, y + 0.32, sw - 0.24, 0.5, mul(trim, 0.96))
                ts.window(u + 0.15, y + 0.95, sw - 0.3, 1.95, trim=trim, tw=0.08, frame=0x5e5648, kind='hung')
        cornice_paint(ts, 0, h - 1.15, arc, 1.15, trim, dentil=0.3)
        ts.grad(0, h, arc, 0.7, mul(trim, 0.7), trim)
        k.cyl(W, 0, r, y0, y1, n, ts, (0, 0, arc, h), lod=1, a0=-math.pi / 2, a1=math.pi)
        k.cyl(W, 0, 0.9, y0 - 0.9, y0, n, ts, (0, h, arc, 0.7), r1=r, a0=-math.pi / 2, a1=math.pi)
        k.cyl(W, 0, r + 0.4, y1 - 0.75, y1, n, ts, (0, h - 0.4, arc, 0.38), a0=-math.pi / 2, a1=math.pi, cap=(0.2, h - 0.2, 0.3, 0.1), capb=True)
        ds = k.sheet(arc, 2.4, 0.6, 'dome')
        ds.scales(0, 0, arc, 2.4, C(0x6f8f84), 0.3); ds.noise(0, 0, arc, 2.4, 0.12, 0.8, 0.8, 3); ds.vshade(0, 0, arc, 2.4, 0.9, 1.1)
        k.cyl(W, 0, r + 0.15, y1, y1 + 1.2, n + 3, ds, (0, 0, arc, 1.2), r1=r * 0.62, lod=1)
        k.cyl(W, 0, r * 0.62, y1 + 1.2, y1 + 2.1, n + 3, ds, (0, 1.2, arc, 1.2), r1=0.0, lod=1)
        k.bar([W, y1 + 2.0, 0], [W, y1 + 3.2, 0], 0.08, k.metal_sheet(), (0.1, 0.1, 0.3, 0.3))
    block(k, o, deco)


@K.piece('sf_victorian_f', style='victorian lowrise apartment', stone=0xe0d6bc,
         desc='North Beach 3-storey flats over a ground-floor cafe and deli: striped awnings, shallow slanted bays, iron fire escape, bracketed cornice')
def victorian_f(k):
    o = dict(W=15.2, D=20.0, g=4.2, fh=3.3, nfl=2, par=1.0, mat='stucco', c=0xe9dcbc, trim=0xf5f0e0, base=0x3f5a48, cols=4,
             win=dict(w=1.05, h=1.9, kind='hung', cased=True, d=0.16, frame=0x3f5a48, hood=True, pair=True),
             bays=dict(cols=[0, 2], w=3.3, d=0.75, c=0xe9dcbc), fes=[1],
             cornice=dict(h=1.05, d=0.5, dentil=0.0, brackets=3, c=0xf5f0e0),
             ground=dict(kind='shop', pier=0.45, sign_h=0.8, rustic=False),
             shops=[dict(awning=(C(0x2f6a48), C(0xf0ead8)), sign=C(0x7a2a24)), dict(awning=(C(0x2f6a48), C(0xf0ead8)), sign=C(0x7a2a24), door=0),
                    dict(kind='entry', doorc=0x6a2a24), dict(awning=(C(0xb03a30), C(0xf0ead8)), sign=C(0xe8dcb0), door=1)],
             party_mat='siding', iron=0x2a3a32)
    block(k, o)
