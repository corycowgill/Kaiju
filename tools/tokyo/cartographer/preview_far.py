"""Small-scale check of the surround + far set pieces. Usage: python3 preview_far.py <levels dir> <out.png>"""
import sys, json
from PIL import Image, ImageDraw
D = sys.argv[1]; L = json.load(open(D + '/sf_layout.json')); S = json.load(open(D + '/sf_surround.json')); T = json.load(open(D + '/sf_detail.json'))
R = 1950; K = 0.45; W = int(2 * R * K); im = Image.new('RGB', (W, W), (205, 200, 185)); d = ImageDraw.Draw(im)
P = lambda p: ((p[0] + R) * K, (p[1] + R) * K)
for w in S['water']:
    d.polygon([P(p) for p in w['polygon']], fill=(120, 170, 215))
    for h in w['holes']: d.polygon([P(p) for p in h], fill=(205, 200, 185))
for i in S['islands']: d.polygon([P(p) for p in i['polygon']], outline=(200, 0, 0)); d.text(P((i['x'], i['z'])), i['name'], fill=(0, 0, 0))
for b in S['boxes']:
    x, y = P(b); r = max(1, b[2] * K / 2); g = int(min(255, b[7] * 5)); c = (30, 30, 160) if b[6] == 1 else (120 + g // 2, 110, 100 - min(100, g // 3))
    d.rectangle([x - r, y - r, x + r, y + r], fill=c)
B = L['bounds']; d.rectangle([P((B['minX'], B['minZ'])), P((B['maxX'], B['maxZ']))], outline=(255, 0, 0), width=2)
for w in L['water']: d.polygon([P(p) for p in w['polygon']], fill=(100, 150, 200))
for f in T['ferries']: d.line([P(p) for p in f['points']], fill=(255, 255, 255))
bb = T['bayBridge']; d.line([P(p) for p in bb['points']], fill=(60, 60, 60), width=2)
for t in bb['towers']: x, y = P((t['x'], t['z'])); d.rectangle([x - 3, y - 3, x + 3, y + 3], outline=(0, 0, 0))
for k in ('alcatraz', 'goldenGateBridge', 'sutroTower', 'containerShip'):
    x, y = P((T[k]['x'], T[k]['z'])); d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 0, 255), width=2); d.text((x + 6, y), k, fill=(0, 0, 0))
for t in T['goldenGateBridge']['towers']: x, y = P((t['x'], t['z'])); d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=(200, 60, 0))
for c in S['cranes']: x, y = P((c['x'], c['z'])); d.line([(x - 3, y), (x + 3, y)], fill=(255, 0, 0), width=2)
for m in S['masts']: x, y = P((m['x'], m['z'])); d.text((x, y + 8), m['name'], fill=(0, 0, 0))
im.save(sys.argv[2])
