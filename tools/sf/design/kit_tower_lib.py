# SF kit: mid- and high-rise generator. A tower is a stack of TIERS (plan rect, optional chamfered /
# rounded corners); each tier's sides are built from repeating facade MODULES (a few floors tall)
# that share painted sheets, so a 200 m tower keeps ~10 px/m. design-kit.
import math
import numpy as np
from kit_lib import *
from kit_parts import *


class Style:
    """Skin (paint a module sheet) + relief (geometry on a module / on the whole tier side)."""
    def __init__(self, **o):
        self.o = o; self._sheets = {}

    def sheet(self, k, w, H, var, fh, group=''):
        key = (round(w, 2), round(H, 2), var, group)
        if key not in self._sheets:
            s = k.sheet(w, H, self.o.get('prio', 1.0), 'mod')
            self._sheets[key] = s
            self.skin(s, w, H, var, fh, group)
        return self._sheets[key]

    def bays(self, w):
        nb = max(1, int(round(w / self.o.get('bay', 3.0))))
        return nb, w / nb

    def skin(self, s, w, H, var, fh, group): pass
    def relief(self, F, m, fh, side, j): pass
    def tall(self, F, modH, fh, side): pass


class Curtain(Style):
    """Glass curtain wall: vision band + spandrel per floor, mullions, optional piers / fins / bands / notches."""
    def skin(self, s, w, H, var, fh, group):
        o = self.o; rng = np.random.default_rng(int(w * 13) + var * 7 + int(H))
        g = col(o.get('glass', 0x6f8f9c)); hi = col(o.get('hi', mix(g, 0xc4d4dc, 0.6))); mull = col(o.get('mull', 0x8e969a))
        sp = col(o.get('spandrel', mul(g, 0.8))); sph = o.get('sp', 1.0); mw = o.get('mw', 0.09)
        nb, bw = self.bays(w); m = int(round(H / fh)); sub = o.get('sub', 2)
        s.rect(0, 0, w, H, mull)
        for f in range(m):
            y = f * fh
            for b in range(nb):
                x = b * bw
                for q in range(sub):
                    px = x + q * bw / sub + mw / 2; pw = bw / sub - mw
                    t = 0.86 + 0.26 * rng.random()
                    gg = mul(g, t)
                    s.rect(px, y + mw / 2, pw, sph - mw, mul(sp, 0.94 + 0.12 * rng.random()))
                    s.grad(px, y + sph, pw, fh - sph - mw / 2, mul(gg, 0.86), mix(gg, hi, 0.5))
                    r = rng.random()
                    if r < o.get('blind', 0.16):
                        bh = (fh - sph) * (0.25 + 0.6 * rng.random())
                        s.rect(px, y + fh - mw / 2 - bh, pw, bh, mix(o.get('blindc', 0xcfd0c8), gg, 0.45))
                    elif r < o.get('blind', 0.16) + 0.06:
                        s.rect(px, y + sph, pw, fh - sph - mw / 2, mul(gg, 0.72))
            if o.get('slab') is not None:
                s.rect(0, y, w, o.get('slab_h', 0.3), o['slab'])
        # broad sky / cloud reflection
        s.noise(0, 0, w, H, 0.10, 9.0, 6.0, 3 + var)
        s.noise(0, 0, w, H, 0.04, 0.3, 5.0, 4 + var)
        pe = o.get('pier_every', 0)
        if pe:
            pc = col(o.get('pier', 0xc8c4b8)); pw = o.get('pier_w', 0.6)
            for b in range(0, nb + 1, pe):
                x = min(max(0, b * bw - pw / 2), w - pw)
                s.hgrad(x, 0, pw, H, mul(pc, 0.92), pc); s.noise(x, 0, pw, H, 0.05, 0.5, 2.0, b)
        if o.get('fin_every'):
            fc = col(o.get('finc', mull)); fw = max(o.get('fin_w', 0.16), 0.12)
            for b in range(0, nb + 1, o['fin_every']):
                x = min(max(0, b * bw - fw / 2), w - fw)
                s.rect(x, 0, fw, H, fc)
        for (nx, nw) in self.notches(w):
            # balcony notch: dark recess with slab edges and glass rails
            for f in range(m):
                y = f * fh
                s.rect(nx, y, nw, fh, mul(g, 0.5)); s.rect(nx + 0.2, y + 0.3, nw - 0.4, fh - 0.5, mul(g, 0.62))
                s.rect(nx, y, nw, 0.28, o.get('slab', 0xd8d8d2)); s.rect(nx, y + 0.28, nw, 1.0, mix(g, 0xd0e0e4, 0.45), 0.8)

    def notches(self, w):
        n = self.o.get('notch')
        if not n: return []
        nb, bw = self.bays(w)
        return [(b * bw, bw * n.get('bays', 1)) for b in n['at'] if b < nb]

    def relief(self, F, m, fh, side, j):
        o = self.o
        if o.get('bands'):
            d = o['bands']
            for f in range(m):
                F.box(0, f * fh, F.w, o.get('band_h', o.get('sp', 1.0)), d, faces='ftb')
        for (nx, nw) in self.notches(F.w):
            F.recess(nx, 0, nw, m * fh, self.o['notch'].get('d', 1.4))
            for f in range(m):
                F.box(nx, f * fh, nw, 0.28, -0.02, d0=-self.o['notch'].get('d', 1.4), faces='ft')

    def tall(self, F, modH, fh, side):
        o = self.o; nb, bw = self.bays(F.w)
        if o.get('fin_every'):
            fw = o.get('fin_w', 0.16); d = o.get('fin_d', 0.35)
            for b in range(0, nb + 1, o['fin_every']):
                x = min(max(0, b * bw - fw / 2), F.w - fw)
                F.box(x, 0, fw, F.h, d, faces='flr', uvrect=(x + 0.02, 0, max(0.08, fw - 0.04), modH))
        if o.get('pier_every') and o.get('pier_d'):
            pw = o.get('pier_w', 0.6)
            for b in range(0, nb + 1, o['pier_every']):
                x = min(max(0, b * bw - pw / 2), F.w - pw)
                F.box(x, 0, pw, F.h, o['pier_d'], faces='flr', uvrect=(x + 0.03, 0, pw - 0.06, modH), lod=o.get('pier_d', 0) > 0.8)


class Grid(Style):
    """Solid wall (precast / concrete / stone / brick) with a window per bay; relief = recesses, or projecting piers + spandrels."""
    def layout(self, w, fh):
        o = self.o; nb, bw = self.bays(w)
        ww = o.get('ww', bw * 0.62); wh = o.get('wh', fh * 0.55); sill = o.get('sill', 0.9)
        return nb, bw, ww, wh, sill

    def skin(self, s, w, H, var, fh, group):
        o = self.o; rng = np.random.default_rng(int(w * 11) + var * 5)
        c = col(o.get('c', 0xd0c8b8)); m = int(round(H / fh))
        nb, bw, ww, wh, sill = self.layout(w, fh)
        wallpaint(s, 0, 0, w, H, o.get('mat', 'concrete'), c, var, 0.7)
        g = col(o.get('glass', GLASS)); fr = col(o.get('frame', 0x4a4e50))
        for f in range(m):
            y = f * fh
            if o.get('spandrel') is not None:
                s.rect(0, y, w, sill - 0.05, o['spandrel']); s.noise(0, y, w, sill - 0.05, 0.05, 1.0, 0.4, f)
            for b in range(nb):
                x = b * bw + (bw - ww) / 2
                s.rect(x, y + sill, ww, wh, fr)
                n = o.get('lites', 2)
                for q in range(n):
                    px = x + 0.05 + q * (ww - 0.05) / n; pw = (ww - 0.05) / n - 0.05
                    t = 0.85 + 0.3 * rng.random(); gg = mul(g, t)
                    s.grad(px, y + sill + 0.05, pw, wh - 0.1, mul(gg, 0.85), mix(gg, GLASS_HI, 0.45))
                    r = rng.random()
                    if r < o.get('blind', 0.3):
                        bh = wh * (0.2 + 0.6 * rng.random()); s.rect(px, y + sill + wh - 0.05 - bh, pw, bh, mix(o.get('blindc', BLIND), gg, 0.4))
                s.vshade(x, y + sill + wh - 0.25, ww, 0.25, 1.0, 0.65)
                if o.get('sillc') is not None: s.rect(x - 0.08, y + sill - 0.12, ww + 0.16, 0.12, o['sillc'])
                if o.get('ac') and rng.random() < o['ac']: s.rect(x + ww * 0.3, y + sill, ww * 0.4, 0.35, 0x9a9c98)
            if o.get('floorline') is not None: s.rect(0, y, w, 0.18, o['floorline'])
        pe = o.get('pier_every', 0)
        if pe:
            pc = col(o.get('pier', mul(c, 1.06))); pw = o.get('pier_w', 0.7)
            for b in range(0, nb + 1, pe):
                x = min(max(0, b * bw - pw / 2), w - pw)
                s.hgrad(x, 0, pw, H, mul(pc, 0.93), pc); s.noise(x, 0, pw, H, 0.05, 0.5, 2.0, b)
                s.rect(x + pw, 0, 0.12, H, mul(c, 0.8), 0.5)

    def relief(self, F, m, fh, side, j):
        o = self.o; nb, bw, ww, wh, sill = self.layout(F.w, fh)
        if o.get('punch'):
            for f in range(m):
                if o.get('ribbon'):
                    F.recess(bw * 0.19, f * fh + sill, F.w - bw * 0.38, wh, o['punch'])
                else:
                    for b in range(nb):
                        F.recess(b * bw + (bw - ww) / 2, f * fh + sill, ww, wh, o['punch'])
        if o.get('bands'):
            for f in range(m):
                F.box(0, f * fh, F.w, o.get('band_h', sill - 0.05), o['bands'], faces='ftb')

    def tall(self, F, modH, fh, side):
        o = self.o; nb, bw = self.bays(F.w)
        if o.get('pier_every') and o.get('pier_d'):
            pw = o.get('pier_w', 0.7)
            for b in range(0, nb + 1, o['pier_every']):
                x = min(max(0, b * bw - pw / 2), F.w - pw)
                F.box(x, 0, pw, F.h, o['pier_d'], faces='flr', uvrect=(x + 0.03, 0, pw - 0.06, modH))


class BayTower(Grid):
    """White precast tower with stacked slanted bay windows on every bay (SF's 1980s 'bay window' code)."""
    def skin(self, s, w, H, var, fh, group):
        o = self.o; c = col(o.get('c', 0xe2dccd)); m = int(round(H / fh))
        wallpaint(s, 0, 0, w, H, 'concrete', c, var, 0.6)
        for f in range(m): s.rect(0, f * fh, w, 0.16, mul(c, 0.86))
        nb, bw = self.bays(w)
        for b in range(nb + 1):
            x = min(max(0, b * bw - 0.35), w - 0.7)
            s.hgrad(x, 0, 0.7, H, mul(c, 0.95), mul(c, 1.04))

    def baysheet(self, k, H, fh):
        key = ('bay', round(H, 2))
        if key not in self._sheets:
            o = self.o; bw = o.get('bayw', 2.6); bd = o.get('bayd', 0.8); ch = bd
            L = 2 * math.hypot(ch, bd) + bw - 2 * ch
            s = k.sheet(L, H, 1.0, 'tbay'); self._sheets[key] = s
            c = col(o.get('c', 0xe2dccd)); g = col(o.get('glass', 0x5f7f8c)); m = int(round(H / fh))
            rng = np.random.default_rng(5)
            s.rect(0, 0, L, H, c)
            a = math.hypot(ch, bd)
            for f in range(m):
                y = f * fh
                s.rect(0, y, L, 0.95, c); s.rect(0, y + 0.9, L, 0.06, mul(c, 0.8)); s.rect(0, y, L, 0.14, mul(c, 0.84))
                for (u0, u1) in ((0, a), (a, L - a), (L - a, L)):
                    gg = mul(g, 0.85 + 0.3 * rng.random())
                    s.rect(u0 + 0.06, y + 0.96, u1 - u0 - 0.12, fh - 0.96 - 0.12, 0x5a6266)
                    s.grad(u0 + 0.12, y + 1.02, u1 - u0 - 0.24, fh - 1.02 - 0.2, mul(gg, 0.85), mix(gg, GLASS_HI, 0.5))
                    if rng.random() < 0.3: s.rect(u0 + 0.12, y + fh - 1.0, u1 - u0 - 0.24, 0.8, mix(BLIND, gg, 0.4))
            s.noise(0, 0, L, H, 0.06, 2.0, 3.0, 2)
        return self._sheets[key]

    def relief(self, F, m, fh, side, j):
        o = self.o; nb, bw = self.bays(F.w)
        w = o.get('bayw', 2.6); bd = o.get('bayd', 0.8)
        bs = self.baysheet(F.k, o['_modH'], fh)
        for b in range(nb):
            x = b * bw + (bw - w) / 2
            F.bay(x, 0, m * fh, [(0, 0), (bd, bd), (w - bd, bd), (w, 0)], bs, caps='', lod=False)
        # one LOD stand-in per module: nothing (the flat wall carries the pier / spandrel paint)

    def tall(self, F, modH, fh, side): pass


class Balcony(Grid):
    """Residential slab: window wall per bay + continuous or per-bay balconies with solid / glass rails."""
    def skin(self, s, w, H, var, fh, group):
        o = self.o
        Grid.skin(self, s, w, H, var, fh, group)
        m = int(round(H / fh)); nb, bw = self.bays(w)
        pan = o.get('panels')
        if pan:
            rng = np.random.default_rng(int(w) + var)
            for b in range(nb):
                if rng.random() < o.get('panel_p', 0.5):
                    pc = col(pan[int(rng.integers(len(pan)))])
                    f0 = int(rng.integers(0, max(1, m - 1))); n = int(rng.integers(1, 3))
                    for f in range(f0, min(m, f0 + n)):
                        s.rect(b * bw + 0.1, f * fh + 0.15, (bw - o.get('ww', bw * 0.62)) / 2 - 0.1, fh - 0.15, pc)
                        s.rect(b * bw + bw - (bw - o.get('ww', bw * 0.62)) / 2, f * fh + 0.15, (bw - o.get('ww', bw * 0.62)) / 2 - 0.1, fh - 0.15, pc)
                        s.rect(b * bw + 0.1, f * fh + 0.15, bw - 0.2, o.get('sill', 0.9) - 0.2, pc)
        # rail strip painted low on each floor (the balcony boxes sample it)
        rc = col(o.get('rail', 0xcfd3d0))
        for f in range(m):
            if o.get('balc_all', True) or True:
                pass
        self._rail = rc

    def balcs(self, w):
        o = self.o; nb, bw = self.bays(w)
        at = o.get('balc_at')
        return [(b * bw + 0.12, bw - 0.24) for b in (range(nb) if at is None else [a for a in at if a < nb])] if not o.get('balc_run') else [(0.3, w - 0.6)]

    def railsheet(self, k):
        if 'rail' not in self._sheets:
            o = self.o; s = k.sheet(3.0, 1.3, 0.8, 'rail'); self._sheets['rail'] = s
            rc = col(o.get('rail', 0xcfd3d0)); slab = col(o.get('slabc', 0xd6d2c8))
            s.rect(0, 0, 3.0, 0.22, slab); s.rect(0, 0, 3.0, 0.04, mul(slab, 0.7))
            if o.get('rail_glass', False):
                s.grad(0, 0.22, 3.0, 1.08, mix(rc, 0x5f8088, 0.5), mix(rc, 0xcfe0e4, 0.5)); s.vlines(0, 0.22, 3.0, 1.08, 0x8a9094, 1.0, 0.04); s.rect(0, 1.25, 3.0, 0.05, 0x9aa0a2)
            else:
                s.rect(0, 0.22, 3.0, 1.08, rc); s.vlines(0, 0.22, 3.0, 1.08, mul(rc, 0.85), 0.5, 0.03); s.rect(0, 1.22, 3.0, 0.08, mul(rc, 1.1)); s.noise(0, 0.22, 3.0, 1.08, 0.08, 0.3, 1.0, 2)
        return self._sheets['rail']

    def relief(self, F, m, fh, side, j):
        o = self.o
        if side not in o.get('balc_sides', 'fb'):
            if o.get('punch'): Grid.relief(self, F, m, fh, side, j)
            return
        rs = self.railsheet(F.k); d = o.get('balc_d', 1.3)
        for f in range(m):
            for (x, w) in self.balcs(F.w):
                y = f * fh
                # slab + rail as one box front (uv: slab edge then rail), open top shows the slab
                F.box(x, y - 0.0, w, 0.22, d, faces='flrb', uvrect=(0, 0, 3.0, 0.22), sh=rs)
                F.box(x, y + 0.22, w, 1.05, d, d0=d - 0.07, faces='flr', uvrect=(0, 0.22, 3.0, 1.08), sh=rs)
                F.face([F.P(x, y + 0.22, 0), F.P(x + w, y + 0.22, 0), F.P(x + w, y + 0.22, d), F.P(x, y + 0.22, d)], [(0.1, 0.05), (2.9, 0.05), (2.9, 0.18), (0.1, 0.18)], UP, 1, rs)
                F.face([F.P(x, y + 0.22, d - 0.07), F.P(x + w, y + 0.22, d - 0.07), F.P(x + w, y + 1.27, d - 0.07), F.P(x, y + 1.27, d - 0.07)], [(0, 0.3), (3.0, 0.3), (3.0, 1.2), (0, 1.2)], -F.n, 1, rs)
                F.s.vshade(F.su + x, F.sv + y - 0.8, w, 0.8, 1.0, 0.75)

    def tall(self, F, modH, fh, side):
        o = self.o
        if o.get('fin_walls') and side in o.get('balc_sides', 'fb'):
            nb, bw = self.bays(F.w); d = o.get('balc_d', 1.3)
            for b in range(0, nb + 1, o['fin_walls']):
                x = min(max(0, b * bw - 0.12), F.w - 0.24)
                F.box(x, 0, 0.24, F.h, d + 0.05, faces='flr', uvrect=(0.02, 0.02, 0.1, 0.1), lod=True)
        else:
            Grid.tall(self, F, modH, fh, side)


class Lobby(Style):
    """Ground floor: glazed shopfront / lobby recessed between piers, fascia band on top."""
    def skin(self, s, w, H, var, fh, group):
        o = self.o; pc = col(o.get('pier', 0x8a8680)); nb, bw = self.bays(w); pw = o.get('pier_w', 0.9); fas = o.get('fascia_h', 0.9)
        wallpaint(s, 0, 0, w, H, o.get('mat', 'concrete'), pc, var, 0.6)
        rng = np.random.default_rng(int(w * 3) + var)
        for b in range(nb):
            x = b * bw + pw / 2; ww = bw - pw
            kind = 'door' if b == nb // 2 else ('shop' if rng.random() < o.get('shops', 0.5) else 'glass')
            if kind == 'shop':
                s.storefront(x, 0, ww, H - fas, frame=o.get('frame', 0x3a3e42), bulk=mul(pc, 0.7), bulk_h=0.4, transom=min(1.4, (H - fas) * 0.25),
                             sign=[C(0x2c4a5a), C(0x7a2a28), C(0x3a3a3c), C(0xd8cfb0), C(0x3a5a44)][int(rng.integers(5))], sign_h=0.7)
            else:
                s.rect(x, 0, ww, H - fas, o.get('frame', 0x3a3e42))
                n = max(1, int(ww / 1.5))
                for q in range(n):
                    px = x + 0.06 + q * (ww - 0.06) / n; pww = (ww - 0.06) / n - 0.06
                    s.glass(px, 0.12, pww, H - fas - 0.2, o.get('glass', mul(GLASS, 1.1)), blind=0)
                    if kind == 'door': s.rect(px, 2.5, pww, 0.08, o.get('frame', 0x3a3e42)); s.rect(px + pww - 0.12, 1.0, 0.05, 0.5, 0xc8c8c0)
                s.rect(x, 0.0, ww, 0.12, mul(pc, 0.6))
                s.rect(x + 0.1, 0.2, ww - 0.2, 1.2, mix(o.get('glass', GLASS), [0.6, 0.55, 0.45], 0.25), 0.5)
            s.vshade(x, H - fas - 1.0, ww, 1.0, 1.0, 0.7)
        fc = col(o.get('fascia', mul(pc, 1.08)))
        s.rect(0, H - fas, w, fas, fc); s.rect(0, H - fas, w, 0.06, mul(fc, 0.7)); s.noise(0, H - fas, w, fas, 0.05, 1.0, 0.3, 4)
        s.rect(0, 0, w, 0.2, mul(pc, 0.6))

    def relief(self, F, m, fh, side, j):
        o = self.o; nb, bw = self.bays(F.w); pw = o.get('pier_w', 0.9); fas = o.get('fascia_h', 0.9)
        for b in range(nb):
            F.recess(b * bw + pw / 2, 0, bw - pw, F.h - fas, o.get('d', 0.7))
        if o.get('canopy') and side == 'f':
            cw = min(F.w * 0.4, 9.0); cx = (F.w - cw) / 2
            F.box(cx, F.h - fas - 0.5, cw, 0.4, o['canopy'], faces='flrtb', lod=True, uvrect=(cx, F.h - fas + 0.2, cw, 0.4), ao=0.4)


class Louvre(Style):
    def skin(self, s, w, H, var, fh, group):
        c = col(self.o.get('c', 0x9aa0a2))
        s.rect(0, 0, w, H, c); s.hlines(0, 0.15, w, H - 0.3, mul(c, 0.72), 0.22, 0.08)
        s.vlines(0, 0, w, H, mul(c, 1.12), 2.4, 0.12); s.rect(0, H - 0.2, w, 0.2, mul(c, 1.1)); s.rect(0, 0, w, 0.15, mul(c, 0.8))
        s.noise(0, 0, w, H, 0.08, 1.5, 1.5, 3)


def plan_poly(x0, x1, z0, z1, corner=None):
    """Plan outline (list of (x, z)) going front-left -> front-right -> back, with corner cuts."""
    if not corner: return [(x0, z1), (x1, z1), (x1, z0), (x0, z0)], 0.0, 1
    kind, c, n = corner if len(corner) == 3 else (corner[0], corner[1], 1)
    if kind == 'chamfer': n = 1
    pts = []
    for (cx, cz, a0) in ((x1 - c, z1 - c, 0.0), (x1 - c, z0 + c, math.pi / 2), (x0 + c, z0 + c, math.pi), (x0 + c, z1 - c, 1.5 * math.pi)):
        for i in range(n + 1):
            a = a0 + (math.pi / 2) * i / n
            pts.append((cx + c * math.sin(a), cz + c * math.cos(a)))
    return pts, c, n


def tier(k, st, x0, x1, z0, z1, y0, nfl, fh, mod=None, nv=2, corner=None, sides='frbl', cst=None):
    """Build one tier's walls. Returns its top y."""
    mod = min(mod or nfl, nfl); H = nfl * fh; modH = mod * fh
    st.o['_modH'] = modH
    pts, c, n = plan_poly(x0, x1, z0, z1, corner)
    W = x1 - x0; D = z1 - z0
    S = {'f': ((x0 + c, z1), (1, 0, 0), W - 2 * c), 'r': ((x1, z1 - c), (0, 0, -1), D - 2 * c), 'b': ((x1 - c, z0), (-1, 0, 0), W - 2 * c), 'l': ((x0, z0 + c), (0, 0, 1), D - 2 * c)}
    for si, (key, (p, r, w)) in enumerate(S.items()):
        if key not in sides or w < 0.5: continue
        f0 = 0; j = 0
        while f0 < nfl:
            m = min(mod, nfl - f0); var = (j + si) % nv
            sh = st.sheet(k, w, modH, var, fh)
            Fm = k.facade((p[0], y0 + f0 * fh, p[1]), r, w, m * fh, sheet=sh)
            st.relief(Fm, m, fh, key, j)
            Fm.wall()
            f0 += m; j += 1
        Ft = k.facade((p[0], y0, p[1]), r, w, H, sheet=st.sheet(k, w, modH, 0, fh))
        st.tall(Ft, modH, fh, key)
    if c > 0:
        cst = cst or st
        ch = math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
        save = cst.o.get('bay'); cst.o['bay'] = ch
        sh = cst.sheet(k, ch * n, modH, 0, fh, 'corner')
        cst.o['bay'] = save
        for q in range(4):
            for i in range(n):
                a = pts[q * (n + 1) + i]; b = pts[q * (n + 1) + i + 1]
                d = np.array([b[0] - a[0], 0, b[1] - a[1]]) / ch
                f0 = 0
                while f0 < nfl:
                    m = min(mod, nfl - f0)
                    Fm = k.facade((a[0], y0 + f0 * fh, a[1]), d, ch, m * fh, sheet=sh, su=i * ch)
                    Fm.wall(); f0 += m
    return y0 + H


def roof_sheet(k, W, D, prio=0.4, seed=0, c=None):
    s = k.sheet(W, D, prio, 'roof'); s.roofing(0, 0, W, D, seed=seed, c=c)
    return s


def tier_roof(k, rs, x0, x1, z0, z1, y, corner=None, X0=None, Z1=None, cop=0.35, cc=0xb8b6ae):
    """Close a tier's top; rs is plan-mapped from (X0, Z1) (the tower's front-left corner)."""
    pts, c, n = plan_poly(x0, x1, z0, z1, corner)
    X0 = x0 if X0 is None else X0; Z1 = z1 if Z1 is None else Z1
    k.roof_poly(pts, y, rs, X0, Z1)
    if cop > 0 and not corner:
        u0 = x0 - X0; v0 = Z1 - z1; w = x1 - x0; d = z1 - z0
        for (rx, ry, rw, rh) in ((u0, v0, w, cop), (u0, v0 + d - cop, w, cop), (u0, v0, cop, d), (u0 + w - cop, v0, cop, d)):
            rs.rect(rx, ry, rw, rh, cc)


def mech(k, x0, x1, z0, z1, y, h, c=0x9aa0a2, rs=None, lod=1):
    """Louvred mechanical penthouse box."""
    st = getattr(k, '_louvre', None)
    if st is None or hexof(st.o['c']) != hexof(c):
        st = Louvre(c=c, prio=0.6); k._louvre = st
    w = max(x1 - x0, z1 - z0)
    sh = st.sheet(k, min(w, 12.0), h, 0, h)
    r = (0, 0, sh.w, h)
    k.box(x0, y, z0, x1, y + h, z1, sh, r, (0.2, h - 0.15, 1.0, 0.1), lod=lod)
    return y + h
