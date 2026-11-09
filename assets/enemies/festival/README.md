# Chicago festival pedestrians

Nine distinct downloaded Meshy characters replace the procedural festival lawn
crowd. The unrigged pedestrian1 is the same person as the animated reference and
is included once. The two recent `sample_2026-11-09...` downloads are variants 08–09.
The source filenames and resulting triangle counts are recorded in manifest.json.
Original files in Downloads are not modified or shipped.

## Runtime assets

- `animations.glb`: the reference's 66-joint skeleton and all nine clips, stored once.
- `person_01` through `person_09`: skinned GLBs without duplicated animation tracks.
  Near / far / distant versions contain 3,600 / 900 / 300 triangles respectively.
- One 1024px JPEG per person, shared by the three LODs. Each LOD has a separate
  region in the same baked atlas. The texture URL includes a content hash.

The complete model, texture and animation payload is approximately 7.24 MB versus
98.22 MB for the nine unrigged downloads. The 19.17 MB reference stays out of the
shipping payload. GLSL uses a shared 30 Hz bone-matrix atlas (5.8 MB GPU memory),
interpolates poses, removes planar root motion, and batches instances by variant
and LOD. There is no AnimationMixer or skeleton texture per attendee.

Calm crowds alternate dance clips. Panic blends through walking into running or
sprinting, and navigation keeps people on land and routes them toward gates.
Hits play the non-looping death clip. LOD hysteresis avoids rapid detail switching.
Nearby high-detail characters are capped; distant characters use 300 triangles.

## Rebuild

With the original nine downloads and `pedestrian1withFullAnimationAndRig.glb` in
Downloads, run from the repository root:

```powershell
python -m pip install -r tools/requirements-crowd.txt
python tools/prepare_crowd_surfaces.py
blender -b -t 4 --python tools/build_downloaded_crowd.py
python tools/finish_crowd_assets.py
node tools/make_asset_manifest.mjs
npm test
npm run smoke
```

Preparation closes scan holes and reduces clean surfaces before Blender transfers
the reference skin weights and bakes the original color textures. Intermediates
remain in `../crowd_build`, outside the game assets. The finishing step compresses
textures and repairs zero-length normals. The crowd shader additionally guards
normalization and non-finite HDR lighting, so a bad pixel cannot poison bloom.

Blender 5.2.2 was used for this batch. Requirements pin the local preparation tools.
