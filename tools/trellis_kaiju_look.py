"""Material pass for the rigged TRELLIS kaiju GLBs: surface factors and a glow map.

python tools/trellis_kaiju_look.py <id> [--bake ../devtools/trellis/bake/<id>.npz] [--preview out.png]

Run after tools/rig_trellis_kaiju.py (which exports the GLB) and
tools/trellis_kaiju_bake.py (which writes the per-texel rest position and
normal). Rewrites assets/kaiju_model/<id>.glb in place:
  - metallicFactor / roughnessFactor: TRELLIS bakes a metallic channel of
    0.5-0.9 into most of these skins, which renders them near black under the
    game's dim sky light. The factor scales that channel down to what the
    creature is made of.
  - an emissive map (1024 px WebP) and KHR_materials_emissive_strength. The
    glowing parts are painted from the front-view T-pose art (art/kaiju/<id>.png)
    projected onto the rest-pose surface (front and, where the design glows all
    round, mirrored onto the back), and/or picked from the skin's own colours.
    Every kaiju material already carries an emissive map slot
    (assetCache.canonMaterialMaps), so this costs no shader program.
Idempotent: a second run replaces the glow map it added.
"""

import argparse
import colorsys  # noqa: F401  (documenting the HSV convention used below)
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageFilter

REPO = Path(__file__).resolve().parent.parent
GLOW_NAME = 'kaiju glow'
SIZE = 1024

# metal / rough: factors over the TRELLIS channels. glow: emissive colour
# (linear-ish RGB, strength applied on top). rules: where it glows.
#   art: hue range (degrees), min saturation, min value in the T-pose art;
#        front_only: no mirrored back projection; zmin: lowest height (0..1 of
#        the body) the art may light, to keep a bright body colour from
#        counting as eyes
#   skin: same test on the GLB's own base colour, with a gain (0..1)
CONFIG = {
    'cindervault': dict(metal=0.0, rough=1.0, glow=(1.0, 0.3, 0.03), strength=4.5, rules=[
        dict(art=(8, 48, 0.65, 0.55), soft=0.2, grow=2, gain=1.0),
        dict(skin=(10, 45, 0.6, 0.55), gain=1.0, grow=1),
    ]),
    'brineveil': dict(metal=0.0, rough=0.85, glow=(0.3, 1.0, 0.92), strength=4.0, rules=[
        dict(art=(165, 200, 0.35, 0.72), front_only=True, zmin=0.78, soft=0.2, grow=4, gain=1.0),
    ]),
    'rimehorn': dict(metal=0.0, rough=1.0, glow=(0.55, 0.82, 1.0), strength=1.4, rules=[
        dict(skin=(185, 230, 0.12, 0.5), gain=0.35, grow=0),
    ]),
    'vesperax': dict(metal=0.12, rough=0.9, glow=(1.0, 0.35, 1.0), strength=3.0, rules=[
        dict(art=(280, 335, 0.25, 0.86), front_only=True, zmin=0.86, soft=0.1, grow=3, gain=1.0),
    ]),
    'thornwake': dict(metal=0.0, rough=1.0, glow=(1.0, 0.62, 0.12), strength=3.5, rules=[
        dict(art=(22, 42, 0.56, 0.65), front_only=True, zmin=0.87, soft=0.1, grow=4, gain=1.0),
    ]),
    'ferrumaw': dict(metal=0.45, rough=0.9, glow=(1.0, 0.12, 0.08), strength=3.5, rules=[
        dict(art=(-20, 15, 0.5, 0.45), front_only=True, zmin=0.8, soft=0.15, grow=4, gain=1.0),
        dict(skin=(-5, 15, 0.75, 0.6), gain=0.8, grow=1),
    ]),
}


# ---------------------------------------------------------------- GLB io
def read_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    bin_start = 20 + length + 8
    bin_length = struct.unpack_from('<I', data, 20 + length)[0]
    return doc, bytearray(data[bin_start:bin_start + bin_length])


def write_glb(path, doc, blob):
    while len(blob) % 4:
        blob.append(0)
    doc['buffers'][0]['byteLength'] = len(blob)
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(blob)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(text), 0x4E4F534A) + text
    out += struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    path.write_bytes(out)


def image_bytes(doc, blob, index):
    view = doc['bufferViews'][doc['images'][index]['bufferView']]
    start = view.get('byteOffset', 0)
    return bytes(blob[start:start + view['byteLength']])


def drop_glow(doc, blob):
    """Remove a glow image this tool added before (the last image, by name)."""
    images = doc.get('images', [])
    if not images or images[-1].get('name') != GLOW_NAME:
        return blob
    view_index = images[-1]['bufferView']
    view = doc['bufferViews'][view_index]
    if view_index != len(doc['bufferViews']) - 1:
        raise ValueError('glow image is not the last buffer view')
    blob = blob[:view.get('byteOffset', 0)]
    doc['bufferViews'].pop()
    images.pop()
    texture_index = next(i for i, t in enumerate(doc['textures']) if t.get('extensions', {}).get('EXT_texture_webp', {}).get('source', t.get('source')) == len(images))
    doc['textures'].pop(texture_index)
    for material in doc['materials']:
        material.pop('emissiveTexture', None)
        material.pop('emissiveFactor', None)
        material.get('extensions', {}).pop('KHR_materials_emissive_strength', None)
        if material.get('extensions') == {}:
            material.pop('extensions')
    return blob


# ---------------------------------------------------------------- masks
def hsv(rgb):
    """rgb float (...,3) 0..1 -> hue degrees, saturation, value."""
    mx, mn = rgb.max(-1), rgb.min(-1)
    delta = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe = np.where(delta > 1e-6, delta, 1)
    hue = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    hue = np.where(delta > 1e-6, hue, 0)
    return hue, np.where(mx > 1e-6, delta / np.maximum(mx, 1e-6), 0), mx


def colour_mask(rgb, h0, h1, s_min, v_min, soft=0.15):
    hue, sat, val = hsv(rgb)
    hue = np.where(hue > 180 + (h0 + h1) / 2, hue - 360, hue)  # wrap so a range like -20..15 works
    in_hue = (hue >= h0) & (hue <= h1)
    ramp = np.clip((val - v_min) / max(soft, 1e-3), 0, 1) * np.clip((sat - s_min) / 0.1 + 0.5, 0, 1)
    return np.where(in_hue, ramp, 0).astype(np.float32)


def grow(mask, pixels):
    if pixels <= 0:
        return mask
    image = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8))
    image = image.filter(ImageFilter.MaxFilter(pixels * 2 + 1)).filter(ImageFilter.GaussianBlur(pixels * 0.6))
    return np.asarray(image, dtype=np.float32) / 255


def fit_art(alpha, points):
    """Scale and offset taking body X/Z (metres, X model-left) to art pixels,
    from the silhouettes' bounding boxes, then refined for overlap."""
    ys, xs = np.nonzero(alpha > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    X, Z = points[:, 0], points[:, 2]
    zlo, zhi = np.quantile(Z, [0.0005, 0.9995])
    xlo, xhi = np.quantile(X, [0.0005, 0.9995])
    best = None
    small = alpha[::4, ::4] > 0.5
    pick = points[np.random.default_rng(0).choice(len(points), min(len(points), 60000), replace=False)]
    for sx in np.linspace(0.96, 1.04, 9):
        for sz in np.linspace(0.96, 1.04, 9):
            scale_x = (x1 - x0) / (xhi - xlo) * sx
            scale_z = (y1 - y0) / (zhi - zlo) * sz
            for dx in np.linspace(-0.02, 0.02, 5) * (x1 - x0):
                u = ((pick[:, 0] - xlo) * scale_x + x0 + dx + (x1 - x0) * (1 - sx) / 2) / 4
                v = (y1 - (pick[:, 2] - zlo) * scale_z) / 4
                ui, vi = u.astype(int), v.astype(int)
                ok = (ui >= 0) & (vi >= 0) & (ui < small.shape[1]) & (vi < small.shape[0])
                score = small[vi[ok], ui[ok]].sum() - (~ok).sum() * 2
                if best is None or score > best[0]:
                    best = (score, scale_x, scale_z, xlo, x0 + dx + (x1 - x0) * (1 - sx) / 2, zlo, y1)
    _, scale_x, scale_z, xlo, ox, zlo, oy = best
    hit = best[0] / len(pick)
    return (lambda p: (((p[..., 0] - xlo) * scale_x + ox), (oy - (p[..., 2] - zlo) * scale_z))), hit


def depth_buffers(u, v, depth, shape, step=3):
    """Nearest (front, min Y) and farthest (back, max Y) surface per art cell."""
    h, w = shape[0] // step + 1, shape[1] // step + 1
    cu = np.clip((u / step).astype(int), 0, w - 1)
    cv = np.clip((v / step).astype(int), 0, h - 1)
    front = np.full((h, w), np.inf, np.float32)
    back = np.full((h, w), -np.inf, np.float32)
    np.minimum.at(front, (cv, cu), depth)
    np.maximum.at(back, (cv, cu), depth)
    return front[cv, cu], back[cv, cu]


def sample(image, u, v):
    h, w = image.shape[:2]
    return image[np.clip(v.astype(int), 0, h - 1), np.clip(u.astype(int), 0, w - 1)]


def paint(kaiju, bake, base):
    cfg = CONFIG[kaiju]
    position, normal, covered = bake['position'], bake['normal'], bake['covered']
    covered = covered & (np.abs(position).sum(-1) > 0)
    art = np.asarray(Image.open(REPO / 'art' / 'kaiju' / f'{kaiju}.png').convert('RGBA'), dtype=np.float32) / 255
    rgb, alpha = art[..., :3], art[..., 3]
    points = position[covered]
    height = np.quantile(points[:, 2], 0.998)
    to_art, hit = fit_art(alpha, points)
    print(f'{kaiju}: art fit, {hit:.0%} of surface samples inside the silhouette')
    u, v = to_art(position)
    # A texel takes the art only where it is the visible surface from that side
    front, back = depth_buffers(u[covered], v[covered], position[covered][:, 1], alpha.shape)
    front_full = np.full(covered.shape, np.inf, np.float32); front_full[covered] = front
    back_full = np.full(covered.shape, -np.inf, np.float32); back_full[covered] = back
    tolerance = 0.035
    seen_front = covered & (position[..., 1] <= front_full + tolerance) & (normal[..., 1] < 0.15)
    seen_back = covered & (position[..., 1] >= back_full - tolerance) & (normal[..., 1] > -0.15)
    total = np.zeros(covered.shape, np.float32)
    for rule in cfg['rules']:
        if 'art' in rule:
            mask_art = grow(colour_mask(rgb, *rule['art'], soft=rule.get('soft', 0.15)) * (alpha > 0.5), rule.get('grow', 0))
            lit = sample(mask_art, u, v)
            where = seen_front if rule.get('front_only') else (seen_front | seen_back)
            where = where & (position[..., 2] >= rule.get('zmin', 0) * height)
            layer = np.where(where, lit, 0)
        else:
            # (atlas islands are small: only a pixel or so of growth before it bleeds across seams)
            layer = grow(np.where(covered, colour_mask(base, *rule['skin'], soft=0.12), 0), rule.get('grow', 0))
        total = np.maximum(total, layer * rule['gain'])
    glow = np.clip(total, 0, 1)[..., None] * np.asarray(cfg['glow'], np.float32)
    return np.clip(glow, 0, 1)


# ---------------------------------------------------------------- main
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kaiju', choices=CONFIG)
    parser.add_argument('--glb', type=Path)
    parser.add_argument('--bake', type=Path)
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args()
    cfg = CONFIG[args.kaiju]
    glb = args.glb or REPO / 'assets' / 'kaiju_model' / f'{args.kaiju}.glb'
    bake_path = args.bake or REPO.parent / 'devtools' / 'trellis' / 'bake' / f'{args.kaiju}.npz'
    doc, blob = read_glb(glb)
    blob = drop_glow(doc, blob)
    material = doc['materials'][0]
    pbr = material.setdefault('pbrMetallicRoughness', {})
    pbr['metallicFactor'] = cfg['metal']
    pbr['roughnessFactor'] = cfg['rough']
    texture = doc['textures'][pbr['baseColorTexture']['index']]
    source = texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source', texture.get('source'))
    base = Image.open(io.BytesIO(image_bytes(doc, blob, source))).convert('RGB').resize((SIZE, SIZE), Image.BILINEAR)
    base = np.asarray(base, dtype=np.float32) / 255
    bake = np.load(bake_path)
    if bake['position'].shape[0] != SIZE:
        raise ValueError(f'bake is {bake["position"].shape[0]} px, expected {SIZE}')
    glow = paint(args.kaiju, bake, base)
    image = Image.fromarray((glow * 255 + 0.5).astype(np.uint8))
    if args.preview:
        image.save(args.preview)
    encoded = io.BytesIO()
    image.save(encoded, 'WEBP', quality=88, method=6)
    data = encoded.getvalue()
    while len(blob) % 4:
        blob.append(0)
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
    blob += data
    doc['images'].append({'name': GLOW_NAME, 'mimeType': 'image/webp', 'bufferView': len(doc['bufferViews']) - 1})
    doc['textures'].append({'sampler': texture.get('sampler', 0), 'extensions': {'EXT_texture_webp': {'source': len(doc['images']) - 1}}})
    material['emissiveTexture'] = {'index': len(doc['textures']) - 1}
    material['emissiveFactor'] = [1, 1, 1]
    material.setdefault('extensions', {})['KHR_materials_emissive_strength'] = {'emissiveStrength': cfg['strength']}
    used = doc.setdefault('extensionsUsed', [])
    if 'KHR_materials_emissive_strength' not in used:
        used.append('KHR_materials_emissive_strength')
    write_glb(glb, doc, blob)
    lit = float((glow.max(-1) > 0.1).mean())
    print(f'{args.kaiju}: metal {cfg["metal"]}, rough {cfg["rough"]}, glow on {lit:.1%} of the atlas, {len(data) // 1024} KB -> {glb}')


if __name__ == '__main__':
    main()
