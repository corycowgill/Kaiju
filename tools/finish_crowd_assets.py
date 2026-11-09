"""Compress Blender's baked atlases and version their shared external texture URLs.

Run after build_downloaded_crowd.py, then node tools/make_asset_manifest.mjs.
Requires Pillow. Original source files stay in Downloads.
"""
from pathlib import Path
from PIL import Image
import hashlib,json,struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'assets/enemies/festival'
for number in range(1,10):
    stem = f'person_{number:02d}'
    texture = OUT/f'{stem}.jpg'
    Image.open(ROOT.parent/'crowd_build'/f'{stem}_baked.png').convert('RGB').save(
        texture,quality=88,optimize=True)
    tag = hashlib.sha1(texture.read_bytes()).hexdigest()[:10]
    for lod in ['near','far','distant']:
        path = OUT/f'{stem}_{lod}.glb'
        raw = path.read_bytes(); length = struct.unpack_from('<I',raw,12)[0]
        document = json.loads(raw[20:20+length])
        document['images'][0]['uri'] = f'{stem}.jpg?v={tag}'
        j = json.dumps(document,separators=(',',':')).encode(); j += b' '*(-len(j)%4)
        tail = bytearray(raw[20+length:])
        # Collapsed scan triangles can leave zero vertex normals. normalize(0)
        # is undefined on GPUs, poisoning HDR/bloom with full-screen black flashes.
        normal_index = document['meshes'][0]['primitives'][0]['attributes']['NORMAL']
        accessor = document['accessors'][normal_index]
        view = document['bufferViews'][accessor['bufferView']]
        normals = np.frombuffer(tail,dtype='<f4',count=accessor['count']*3,
            offset=8+view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape(-1,3)
        lengths = np.linalg.norm(normals,axis=1)
        bad = (~np.isfinite(lengths)) | (lengths < 1e-6)
        normals[bad] = [0,1,0]
        good = ~bad
        normals[good] /= lengths[good,None]
        accessor['min'] = normals.min(axis=0).tolist(); accessor['max'] = normals.max(axis=0).tolist()
        j = json.dumps(document,separators=(',',':')).encode(); j += b' '*(-len(j)%4)
        path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(j)+len(tail))+
                         struct.pack('<II',len(j),0x4e4f534a)+j+tail)
manifest_path = OUT/'manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['shippedBytes'] = sum(p.stat().st_size for p in OUT.iterdir() if p.suffix in ('.glb','.jpg'))
manifest['sourceBytes'] = sum(m['sourceBytes'] for m in manifest['models'])
manifest['textureSize'] = 1024
manifest['textureSharing'] = 'One baked atlas per person, shared by three LODs'
manifest_path.write_text(json.dumps(manifest,indent=2))
print(json.dumps({k:manifest[k] for k in ['shippedBytes','sourceBytes','textureSize']}))
