"""Top-down preview of sf_layout.json. Usage: python3 preview.py <layout.json> <out.png> [x0 z0 x1 z1 pxPerU] [trees.json]"""
import sys, json, math
from PIL import Image, ImageDraw, ImageFont
L = json.load(open(sys.argv[1]))
B = L['bounds']
if len(sys.argv) >= 8: x0, z0, x1, z1, S = map(float, sys.argv[3:8])
else: x0, z0, x1, z1, S = B['minX'], B['minZ'], B['maxX'], B['maxZ'], 3.0
W, H = int((x1 - x0) * S), int((z1 - z0) * S)
im = Image.new('RGB', (W, H), (214, 208, 196)); d = ImageDraw.Draw(im)
P = lambda p: ((p[0] - x0) * S, (p[1] - z0) * S)
def vis(pts): return any(x0 - 20 <= p[0] <= x1 + 20 and z0 - 20 <= p[1] <= z1 + 20 for p in pts)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', max(9, int(S * 3.2)))
except Exception: font = ImageFont.load_default()
for w in L['water']:
    if not vis(w['polygon']): continue
    d.polygon([P(p) for p in w['polygon']], fill=(120, 170, 215) if w['kind'] != 'pond' else (90, 190, 230))
    for h in w.get('holes', []): d.polygon([P(p) for p in h], fill=(214, 208, 196))
COL = {'lawn': (150, 200, 130), 'garden': (110, 175, 110), 'beach': (240, 225, 160), 'plaza': (228, 222, 205)}
for p in L['parks']:
    if not vis(p['polygon']): continue
    c = COL.get(p['kind'], (200, 200, 200))
    if p.get('surface') == 'pier': c = (188, 160, 120)
    if p.get('surface') == 'parking': c = (196, 196, 200)
    d.polygon([P(q) for q in p['polygon']], fill=c)
for q in L['paths']:
    if vis(q['points']): d.line([P(p) for p in q['points']], fill=(170, 140, 100), width=1)
for r in L['roads']:
    if not vis(r['points']): continue
    if r.get('expressway'): continue
    d.line([P(p) for p in r['points']], fill=(255, 255, 255) if r['class'] == 'major' else (242, 242, 236), width=max(1, int(r['width'] * S * 0.8)))
STY = {'victorian': (205, 150, 170), 'brick': (190, 110, 80), 'warehouse': (150, 130, 110), 'lowrise': (180, 180, 170), 'midrise': (150, 150, 160), 'apartment': (200, 170, 120), 'glassslab': (90, 130, 170), 'glasstower': (40, 80, 140)}
for b in L['buildings']:
    if not vis(b['footprint']): continue
    c = STY.get(b.get('style'), (230, 90, 90))
    k = 1.0 - min(0.35, b['heightMetres'] / 600)
    c = tuple(int(v * k) for v in c)
    d.polygon([P(p) for p in b['footprint']], fill=c, outline=(60, 60, 60) if not b.get('onPier') else (0, 90, 160))
for r in L['roads']:
    if r.get('expressway') and vis(r['points']): d.line([P(p) for p in r['points']], fill=(240, 150, 60), width=max(1, int(r['width'] * S * 0.6)))
    if r.get('crooked'): d.line([P(p) for p in r['points']], fill=(220, 40, 40), width=2)
if len(sys.argv) >= 9:
    T = json.load(open(sys.argv[8]))['trees']; TC = {'palm': (20, 160, 60), 'plane': (60, 120, 40), 'street': (70, 150, 70), 'evergreen': (10, 80, 50), 'park': (40, 140, 90)}
    for t in T:
        if x0 <= t[0] <= x1 and z0 <= t[1] <= z1:
            x, y = P(t); r = max(1, S * 0.5); d.ellipse([x - r, y - r, x + r, y + r], fill=TC[t[2]])
def rectpts(l):
    c, s = math.cos(l['rot']), math.sin(l['rot']); hw, hd = l['w'] / 2, l['d'] / 2
    return [P((l['x'] + a * c + b * s, l['z'] - a * s + b * c)) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
for l in L['landmarks']:
    if not (x0 <= l['x'] <= x1 and z0 <= l['z'] <= z1): continue
    x, y = P((l['x'], l['z']))
    if l['kind'] == 'district':
        d.text((x, y), l['name'].upper(), fill=(120, 0, 120), font=font, anchor='mm'); continue
    pts = rectpts(l); d.line(pts + [pts[0]], fill=(220, 0, 0), width=2)
    fx, fz = l['frontDir']; d.line([(x, y), (x + fx * max(l['d'], 6) * S * 0.6, y + fz * max(l['d'], 6) * S * 0.6)], fill=(255, 0, 255), width=2)
    d.text((x + 3, y + 3), l['id'], fill=(0, 0, 0), font=font, stroke_width=2, stroke_fill=(255, 255, 255))
def mark(p, c, t):
    x, y = P((p['x'], p['z'])); r = 3 * S
    d.ellipse([x - r, y - r, x + r, y + r], outline=c, width=3); d.text((x + r, y - r), t, fill=c, font=font, stroke_width=2, stroke_fill=(255, 255, 255))
sp = L['spawn']['player']; mark(sp, (255, 0, 0), 'PLAYER')
x, y = P((sp['x'], sp['z'])); d.line([(x, y), (x + sp['facing'][0] * 40 * S, y + sp['facing'][1] * 40 * S)], fill=(255, 0, 0), width=3)
for e in L['spawn']['enemies']: mark(e, (200, 0, 200), e['label'])
for a in L['approaches']: mark(a, (0, 120, 0), 'ap:' + a['label'])
mark(L['duel']['a'], (0, 0, 255), 'DUEL A'); mark(L['duel']['b'], (0, 0, 255), 'DUEL B'); mark(L['soldier'], (255, 120, 0), 'SOLDIER')
R = L['ring']; v = R['venueBox']; d.rectangle([P((v[0], v[1])), P((v[2], v[3]))], outline=(255, 0, 0), width=3); mark(R, (255, 0, 0), 'RING')
d.rectangle([P((R['x'] - 46, R['z'] - 46)), P((R['x'] + 46, R['z'] + 46))], outline=(255, 120, 120), width=1)
import os
dp = sys.argv[1].replace('_layout', '_detail')
if os.path.exists(dp):
    DT = json.load(open(dp))
    for c in DT.get('cableCar', []):
        d.line([P(p) for p in c['points']], fill=(150, 0, 200), width=2)
        for st in c.get('turntables', []): x, y = P((st['x'], st['z'])); d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(150, 0, 200), width=2)
    for c in DT.get('streetcar', []): d.line([P(p) for p in c['points']], fill=(200, 60, 0), width=2)
    for c in DT.get('ferries', []): d.line([P(p) for p in c['points']], fill=(255, 255, 255), width=1)
    for c in DT.get('seawall', []): d.line([P(p) for p in c], fill=(90, 60, 30), width=1)
    bb = DT.get('bayBridge')
    if bb:
        d.line([P(p) for p in bb['points']], fill=(120, 120, 120), width=3)
        for t in bb['towers'] + [bb['anchorage'], bb['centreAnchorage']]: x, y = P((t['x'], t['z'])); d.rectangle([x - 5, y - 5, x + 5, y + 5], outline=(0, 0, 0), width=2)
im.save(sys.argv[2]); print(W, H)
