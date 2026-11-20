# SF kit: the generic masonry / stucco street block generator (shopfront ground floor, window grid,
# bays, cornice, fire escapes, party + rear walls, flat roof). design-kit.
import math
import numpy as np
from kit_lib import *
from kit_parts import *


def misc_sheet(k, w=8.0, h=3.0, prio=0.8):
    if getattr(k, '_misc', None) is None:
        k._misc = k.sheet(w, h, prio, 'misc'); k._misc_x = 0.0
    return k._misc


def misc_slot(k, w, h=1.2):
    """Reserve a w x h patch on the misc sheet (awnings, signs, tiles). Returns (sheet, x, y)."""
    s = misc_sheet(k)
    row = getattr(k, '_misc_row', 0.0)
    if k._misc_x + w > s.w + 1e-6:
        k._misc_x = 0.0; row += getattr(k, '_misc_rowh', 1.2); k._misc_row = row
    k._misc_rowh = max(h, getattr(k, '_misc_rowh', 0.0)) if k._misc_x > 0 else h
    x = k._misc_x; k._misc_x += w + 0.06
    return s, x, row


def shop_awning(Fc, x, y, w, c1, c2=None, d=1.1, h=0.95, val=0.25, stripe=0.4):
    k = Fc.k
    s, ax, ay = misc_slot(k, min(w, 3.0), 1.2)
    uw = min(w, 3.0)
    s.awning_paint(ax, ay, uw, h, c1, c2, stripe)
    s.rect(ax, ay, uw, val, mul(c1, 0.92)); s.rect(ax, ay + val - 0.03, uw, 0.03, mul(c1, 0.7))
    Fc.awning(x, y, w, h, d, val, uvrect=(ax, ay, uw, h), sh=s)


def street(Fc, o, cols, seed=0, shops=None, bays=None, fes=None, entry=None, lodbay=True):
    """Dress one street facade. Returns the cell width."""
    k = Fc.k; s = Fc.s; W = Fc.w
    g = o.get('g', 4.2); fh = o.get('fh', 3.3); nfl = o['nfl']; eave = g + nfl * fh; top = Fc.h
    mat = o.get('mat', 'brick'); c = col(o['c']); trim = col(o.get('trim', 0xd8d0c0)); base = col(o.get('base', trim))
    wn = dict(w=1.1, h=1.9, kind='hung', sill=0.85, d=0.2, pair=False, arch=False, frame=0xe2ddd0, hood=False, lintel=True)
    wn.update(o.get('win', {}))
    rng = np.random.default_rng(seed + 77)
    cw = W / cols
    wallpaint(s, 0, 0, W, top, mat, c, seed)
    tb = o.get('top_band')
    if tb:
        ty = g + (nfl - tb['n']) * fh
        wallpaint(s, 0, ty, W, top - ty, tb.get('mat', 'terracotta'), tb['c'], seed + 5, 0.6)
        s.rect(0, ty - 0.1, W, 0.3, mul(tb['c'], 1.05)); s.rect(0, ty - 0.14, W, 0.05, mul(tb['c'], 0.7))
        Fc.box(0, ty - 0.1, W, 0.3, 0.14, faces='ftb', ao=0.2)
    # ---- ground floor
    gr = dict(kind='shop', pier=0.55, sign_h=0.75, bmat=None)
    gr.update(o.get('ground', {}))
    pier = gr['pier']
    s.rect(0, 0, W, g, base)
    if gr.get('bmat') == 'brick': s.bricks(0, 0, W, g, base)
    elif gr.get('rustic', True): s.hlines(0, 0, W, g, mul(base, 0.8), 0.45, 0.035)
    s.weather(0, 0, W, g, 0.8, seed + 3)
    s.rect(0, 0, W, 0.25, mul(base, 0.6))
    shops = shops if shops is not None else o.get('shops', [dict()])
    for ci in range(cols):
        x = ci * cw + pier / 2; w = cw - pier
        sp = shops[ci % len(shops)] if shops else {}
        kind = sp.get('kind', gr['kind'])
        if entry is not None and ci == entry: kind = 'entry'
        if kind == 'shop':
            ho = g - gr['sign_h'] - 0.2
            s.storefront(x, 0, w, ho, frame=sp.get('frame', 0x35383a), bulk=sp.get('bulk', mul(base, 0.6)), door=sp.get('door'), transom=sp.get('transom', 0.6))
            Fc.recess(x, 0, w, ho, 0.3)
            if sp.get('sign') is not None:
                s.signband(x + 0.1, ho + 0.14, w - 0.2, gr['sign_h'] - 0.12, sp['sign'])
            else:
                s.rect(x, ho + 0.1, w, gr['sign_h'] - 0.05, mul(base, 0.92))
            if sp.get('awning') is not None:
                a = sp['awning']
                shop_awning(Fc, x - 0.1, ho - 0.85, w + 0.2, a[0], a[1] if len(a) > 1 else None)
        elif kind == 'entry':
            ew = min(1.9, w); ex = x + (w - ew) / 2; eh = min(g - 0.5, 3.1)
            s.rect(ex - 0.2, 0, ew + 0.4, eh + 0.25, trim)
            s.rect(ex, 0, ew, eh, mul(base, 0.55))
            s.door(ex + (ew - 1.1) / 2, 0.12, 1.1, eh - 0.12, sp.get('doorc', 0x4a3426), trim, glass=True, transom=0.5)
            s.rect(ex, 0, ew, 0.12, 0x8c8880)
            Fc.recess(ex, 0, ew, eh, 0.9)
            cornice_paint(s, ex - 0.35, eh + 0.25, ew + 0.7, 0.35, trim, dentil=0)
            Fc.box(ex - 0.35, eh + 0.25, ew + 0.7, 0.35, 0.4, ao=0.3)
        elif kind == 'garage':
            gw = min(w, 3.0); gx = x + (w - gw) / 2; gh = min(g - 0.6, 2.4)
            s.rect(gx - 0.12, 0, gw + 0.24, gh + 0.12, trim)
            s.garage(gx, 0, gw, gh, sp.get('gc', mul(trim, 0.95)))
            Fc.recess(gx, 0, gw, gh, 0.3)
        elif kind == 'rollup':
            gh = g - 0.9
            s.rollup(x, 0, w, gh, sp.get('gc', 0x8e9290))
            Fc.recess(x, 0, w, gh, 0.35)
        elif kind == 'arch':
            aw = min(w, sp.get('aw', 2.2)); ax = x + (w - aw) / 2; ah = g - 0.7
            s.window(ax, 0, aw, ah, kind='arch', wall=base, frame=sp.get('frame', 0x2f3a36), glass=mul(GLASS, 0.8), blind=0)
            if sp.get('shutters') is not None:
                sc = col(sp['shutters'])
                s.rect(ax - 0.5, 0.1, 0.5, ah - aw / 2, sc); s.rect(ax + aw, 0.1, 0.5, ah - aw / 2, sc)
                s.hlines(ax - 0.5, 0.1, 0.5, ah - aw / 2, mul(sc, 0.75), 0.6, 0.04); s.hlines(ax + aw, 0.1, 0.5, ah - aw / 2, mul(sc, 0.75), 0.6, 0.04)
            Fc.recess(ax, 0, aw, ah, 0.4)
        elif kind == 'window':
            s.window(x + 0.3, 1.0, w - 0.6, g - 2.0, trim=trim, kind='grid', nx=3, ny=2, frame=wn['frame'])
            Fc.recess(x + 0.3, 1.0, w - 0.6, g - 2.0, 0.2)
        # blank: nothing
    # belt over the ground floor
    s.rect(0, g - 0.2, W, 0.3, trim); s.rect(0, g - 0.24, W, 0.05, mul(trim, 0.7)); s.rect(0, g + 0.06, W, 0.04, mul(trim, 1.08))
    Fc.box(0, g - 0.2, W, 0.3, 0.12, faces='ftb', ao=0.2)
    # ---- upper floors
    bays = bays or {}
    bcols = set(bays.get('cols', []))
    bw = bays.get('w', min(cw - 0.5, 3.2)); bd = bays.get('d', 0.8)
    bsheet = None
    for ci in range(cols):
        cx = ci * cw
        if ci in bcols:
            bh = nfl * fh - bays.get('drop', 0.0)
            by = g + bays.get('lift', 0.0)
            if bays.get('kind', 'slant') == 'slant':
                ch = bays.get('ch', min(0.8, bw * 0.25))
                prof = [(0, 0), (ch, bd), (bw - ch, bd), (bw, 0)]
            elif bays['kind'] == 'box':
                prof = [(0, 0), (0, bd), (bw, bd), (bw, 0)]
            else:
                prof = [(0, 0), (bw * 0.09, bd * 0.6), (bw * 0.28, bd), (bw * 0.72, bd), (bw * 0.91, bd * 0.6), (bw, 0)]
            if bsheet is None:
                L = sum(math.hypot(prof[i + 1][0] - prof[i][0], prof[i + 1][1] - prof[i][1]) for i in range(len(prof) - 1))
                key = '_baysheet_%s' % bays.get('key', 'a')
                if getattr(k, key, None) is None:
                    bsheet = k.sheet(L, bh, 1.0, 'bay')
                    setattr(k, key, bsheet); fresh = True
                else:
                    bsheet = getattr(k, key); fresh = False
            sh, segs = Fc.bay(cx + (cw - bw) / 2, by, bh - 0.0, prof, bsheet, lod=lodbay)
            if fresh:
                bc = col(bays.get('c', c)); bt = col(bays.get('trim', trim))
                paint_bay_block(bsheet, segs, fh, nfl, bh, bc, bt, wn, bays, mat if bays.get('mat') is None else bays['mat'])
                fresh = False
            # corbel under the bay
            s.grad(cx + (cw - bw) / 2 + 0.2, by - 0.5, bw - 0.4, 0.5, mul(trim, 0.75), trim)
            Fc.box(cx + (cw - bw) / 2 + 0.2, by - 0.5, bw - 0.4, 0.5, bd * 0.6, faces='flrb')
            continue
        for f in range(nfl):
            y = g + f * fh + wn['sill']
            n = 2 if wn['pair'] else 1
            ww = wn['w']; gap = 0.35
            tot = n * ww + (n - 1) * gap
            if o.get('skip') and (ci, f) in o['skip']: continue
            for j in range(n):
                x = cx + (cw - tot) / 2 + j * (ww + gap)
                kind = wn['kind']; hh = wn['h']
                arch = wn['arch'] if wn['arch'] != 'top' else (f == nfl - 1)
                wt = col(wn.get('trim', trim))
                if arch:
                    s.window(x, y, ww, hh, kind='arch', wall=mul(c, 0.9), frame=wn['frame'])
                    s.ellipse(x + ww / 2, y + hh - ww / 2, ww / 2 + 0.14, ww / 2 + 0.14, wt, 0.0)
                else:
                    s.window(x, y, ww, hh, kind=kind, frame=wn['frame'], trim=wt if wn.get('cased') else None, tw=0.1, nx=wn.get('nx', 2), ny=wn.get('ny', 2))
                    if wn['lintel']:
                        s.rect(x - 0.12, y + hh, ww + 0.24, 0.26, wt); s.rect(x - 0.12, y + hh, ww + 0.24, 0.04, mul(wt, 0.7))
                s.rect(x - 0.1, y - 0.14, ww + 0.2, 0.14, wt); s.vshade(x - 0.1, y - 0.6, ww + 0.2, 0.46, 1.0, 0.85)
                Fc.recess(x, y, ww, hh, wn['d'])
                if wn['hood']:
                    cornice_paint(s, x - 0.2, y + hh + 0.02, ww + 0.4, 0.3, wt, dentil=0)
                    Fc.box(x - 0.2, y + hh + 0.02, ww + 0.4, 0.3, 0.22, ao=0.25)
                if wn.get('sillbox', True):
                    Fc.box(x - 0.1, y - 0.14, ww + 0.2, 0.14, 0.1, faces='ftblr')
    for f in o.get('belts', []):
        y = g + f * fh - 0.12
        s.rect(0, y, W, 0.22, trim); s.rect(0, y - 0.04, W, 0.04, mul(trim, 0.7))
        Fc.box(0, y, W, 0.22, 0.08, faces='ftb')
    if o.get('pilasters'):
        pw = o['pilasters'] if not isinstance(o['pilasters'], bool) else 0.5
        for ci in range(cols + 1):
            x = min(max(0, ci * cw - pw / 2), W - pw)
            s.hgrad(x, g + 0.1, pw, eave - g - 0.1, mul(trim, 0.92), trim); s.rect(x, eave - 0.5, pw, 0.5, mul(trim, 0.85))
            s.rect(x + pw, g + 0.1, 0.06, eave - g - 0.1, mul(c, 0.75), 0.6)
            Fc.box(x, g + 0.1, pw, eave - g - 0.3, 0.12, faces='flr')
    # ---- cornice
    cn = dict(h=1.0, d=0.5, c=trim, dentil=0.3, brackets=0, y=eave - 0.15)
    cn.update(o.get('cornice', {}))
    if cn['h'] > 0:
        cy = cn['y']
        cornice_paint(s, 0, cy, W, cn['h'], cn['c'], dentil=cn['dentil'])
        Fc.box(-(cn['d'] if o.get('corner_l') else 0), cy + cn['h'] * 0.35, W + (cn['d'] if o.get('corner_r') else 0) + (cn['d'] if o.get('corner_l') else 0), cn['h'] * 0.65, cn['d'], ao=0.4, lod=True,
               uvrect=(0, cy + cn['h'] * 0.35, W, cn['h'] * 0.65))
        if cn['brackets']:
            nb = cn['brackets'] * cols
            paint_brackets(s, 0, W, cy + 0.02, cn['h'] * 0.35, nb, cn['c'], 0.18)
            brackets(Fc, 0, W, cy + 0.02, cn['h'] * 0.35, nb, 0.18, cn['d'] * 0.7)
        # parapet above
        if top > cy + cn['h'] + 0.02:
            s.rect(0, cy + cn['h'], W, top - cy - cn['h'], mul(cn['c'], 0.94)); s.rect(0, top - 0.1, W, 0.1, mul(cn['c'], 0.8))
    else:
        s.rect(0, top - 0.18, W, 0.18, mul(trim, 0.9))
    # ---- fire escapes
    for ci in (fes or []):
        fx = ci * cw + 0.35; fw = cw - 0.7
        Fc.fire_escape(fx, fw, [g + f * fh + 0.25 for f in range(nfl)], d=1.0, c=o.get('iron'))
        for f in range(nfl):
            s.vshade(fx, g + f * fh - 0.9, fw, 1.1, 1.0, 0.85)
    return cw


def paint_bay_block(bs, segs, fh, nfl, bh, c, trim, wn, bays, mat):
    u0 = segs[0][0]; u1 = segs[-1][1]
    wallpaint(bs, u0, 0, u1 - u0, bh, mat, c, 5, 0.5)
    for f in range(nfl):
        y = f * fh
        if y + fh > bh + 0.01: break
        bs.rect(u0, y, u1 - u0, 0.2, trim); bs.rect(u0, y, u1 - u0, 0.04, mul(trim, 0.72))
        for (a, b) in segs:
            w = b - a
            if w < 0.75: continue
            if bays.get('panel', True):
                bs.rect(a + 0.15, y + 0.3, w - 0.3, wn['sill'] - 0.45, mul(trim, 0.97)); bs.rect(a + 0.22, y + 0.37, w - 0.44, wn['sill'] - 0.59, mul(c, 0.93))
            wy = y + wn['sill']; hh = min(wn['h'], fh - wn['sill'] - 0.35)
            if w > 2.0:
                ww = (w - 0.55) / 2
                bs.window(a + 0.2, wy, ww, hh, trim=trim, tw=0.07, frame=wn['frame'], kind=wn['kind'])
                bs.window(a + 0.35 + ww, wy, ww, hh, trim=trim, tw=0.07, frame=wn['frame'], kind=wn['kind'])
            else:
                bs.window(a + 0.18, wy, w - 0.36, hh, trim=trim, tw=0.07, frame=wn['frame'], kind=wn['kind'])
    for (a, b) in segs:
        bs.rect(a, 0, 0.07, bh, trim); bs.rect(b - 0.07, 0, 0.07, bh, trim)
    cornice_paint(bs, u0, bh - 0.4, u1 - u0, 0.4, trim, dentil=0)
    bs.vshade(u0, 0, u1 - u0, 0.3, 0.85, 1.0)


def rear(Bc, o, cols=None, seed=0, mat=None, c=None, stairs=True):
    """Rear elevation: common brick / plain stucco, a window grid, service doors, pipes."""
    s = Bc.s; W = Bc.w; H = Bc.h
    g = o.get('g', 4.2); fh = o.get('fh', 3.3); nfl = o['nfl']
    mat = mat or o.get('rear_mat', o.get('mat', 'brick'))
    c = col(c if c is not None else o.get('rear_c', mul(mix(o['c'], 0x9a948a, 0.35), 0.95)))
    wallpaint(s, 0, 0, W, H, mat, c, seed + 20, 1.3)
    s.rect(0, 0, W, 0.4, mul(c, 0.7))
    cols = cols or max(2, int(W / 3.6))
    cw = W / cols
    rng = np.random.default_rng(seed + 9)
    for ci in range(cols):
        for f in range(nfl):
            if rng.random() < 0.12: continue
            x = ci * cw + (cw - 1.0) / 2; y = g + f * fh + 0.95
            if y + 1.6 > H - 0.3: continue
            s.window(x, y, 1.0, 1.6, frame=0xcfcbbf, kind='hung')
            s.rect(x - 0.08, y - 0.12, 1.16, 0.12, mul(c, 1.25)); s.rect(x - 0.08, y + 1.6, 1.16, 0.2, mul(c, 0.85))
            s.vshade(x, y - 0.6, 1.0, 0.48, 1.0, 0.88)
            if f < 12: Bc.recess(x, y, 1.0, 1.6, 0.12)
        if ci % 2 == 0:
            x = ci * cw + (cw - 1.0) / 2
            s.door(x, 0, 1.0, 2.15, 0x5e625e, 0x8a8a84, glass=False)
            Bc.recess(x, 0, 1.0, 2.15, 0.15)
        else:
            x = ci * cw + (cw - 1.2) / 2
            if g > 3.0:
                s.window(x, 1.4, 1.2, 1.1, frame=0x6e726e, kind='grid', nx=3, ny=2, blind=0)
    downpipe(s, 0.5, 0, H - 0.3); downpipe(s, W - 0.7, 0, H - 0.3)
    s.vshade(0, H - 0.5, W, 0.5, 1.0, 0.9)
    s.rect(0, H - 0.14, W, 0.14, mul(c, 1.15))
    if stairs and nfl <= 5:
        # timber back stairs / landings (painted relief box)
        px = W * 0.5 - 1.4; pw = 2.8; ph = g + (nfl - 1) * fh + 1.1
        wood = C(0x8f8474)
        s.rect(px, 0, pw, ph, mul(c, 0.8))
        for f in range(nfl + 1):
            y = (g + (f - 1) * fh) if f > 0 else 0
            if f > 0: s.rect(px, y - 0.1, pw, 0.2, wood); s.rect(px, y + 0.95, pw, 0.08, wood)
            if f > 0: s.vlines(px, y + 0.1, pw, 0.9, wood, 0.25, 0.05)
            if f < nfl:
                y2 = g + f * fh
                s.poly([(px + 0.2, y + 0.1), (px + 0.5, y + 0.1), (px + pw - 0.2, y2 - 0.1), (px + pw - 0.5, y2 - 0.1)], mul(wood, 0.85))
        s.rect(px, 0, 0.12, ph, wood); s.rect(px + pw - 0.12, 0, 0.12, ph, wood)
        Bc.box(px, 0, pw, ph, 1.3, lod=True, faces='flrt')


def block(k, o, deco=None):
    """A whole street block building from options `o` (see street()). Returns ctx dict."""
    W, D = o['W'], o['D']
    g = o.get('g', 4.2); fh = o.get('fh', 3.3); nfl = o['nfl']
    eave = g + nfl * fh; par = o.get('par', 1.0); top = eave + par
    corner = o.get('corner', False)
    hs = top if corner else eave + min(par, 0.7)
    F, R, B, L = shell(k, W, D, top, top if corner else hs, hs, prio_side=1.0 if corner else o.get('prio_side', 0.6), prio_back=o.get('prio_back', 0.6))
    oo = dict(o); oo['corner_r'] = corner
    street(F, oo, o['cols'], seed=1, bays=o.get('bays'), fes=o.get('fes'), entry=o.get('entry'))
    if corner:
        o2 = dict(o); o2['corner_l'] = False; o2['corner_r'] = False
        street(R, o2, o['side_cols'], seed=2, shops=o.get('side_shops', o.get('shops')), bays=o.get('side_bays', o.get('bays') and dict(o['bays'], cols=o.get('side_bay_cols', []))), fes=o.get('side_fes'), entry=o.get('side_entry'))
    else:
        party_wall(R, o.get('party_mat', o.get('mat', 'brick')), o.get('party_c', mul(mix(o['c'], 0xa09a90, 0.3), 0.95)), nfl, g, fh, 1, wins=max(2, int(D / 6)), wc=0xcfcbbf)
    party_wall(L, o.get('party_mat', o.get('mat', 'brick')), o.get('party_c', mul(mix(o['c'], 0xa09a90, 0.3), 0.95)), nfl, g, fh, 2, wins=max(2, int(D / 6)), wc=0xcfcbbf)
    rear(B, o, seed=3, stairs=o.get('rear_stairs', True))
    ctx = dict(F=F, R=R, B=B, L=L, W=W, D=D, g=g, fh=fh, nfl=nfl, eave=eave, top=top, hs=hs, roof=eave + 0.15)
    if deco: deco(ctx)
    F.wall(); R.wall(); B.wall(); L.wall()
    if top > hs + 0.01: false_front(F, hs, 0.3)
    roof = eave + 0.15
    rs = k.flat_roof(0, -D, W, 0, roof, hs, 0.3, seed=7, c=o.get('roof_c'))
    ctx['rs'] = rs
    if o.get('clutter', True):
        k.roof_clutter(0.6, -D + 0.6, W - 0.6, -1.0, roof, seed=int(W * 10 + D), bulk=o.get('bulk', True))
    if o.get('tank'):
        tx, tz = o['tank'] if isinstance(o['tank'], tuple) else (W * 0.7, -D * 0.6)
        k.tank(tx, roof, tz, 1.5, 2.6, 1.4)
    return ctx
