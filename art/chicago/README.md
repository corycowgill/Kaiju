# Chicago material pass — build 1.11.126

`surface_atlas.png` is an original albedo reference generated with the built-in
image_gen tool. `prompt.json` stores the exact prompt and provenance. Quadrants
are summer turf, poured paving concrete, worn asphalt and ivory tent canvas.

Run `blender -b --python tools/build_chicago_surfaces.py` to derive the runtime
`assets/textures/chi_*` files: four 512px albedos and 128px micro-normal/roughness
maps. Periodic edge blending softens tile boundaries. Luminance-derived normals
describe fine grain only; they do not claim scanned physical relief. Runtime
maps total about 550 KB and share one decode/upload per file on every tier.

`src/levels/chicagoMaterials.js` supplies a shared material family:

- World-sized turf blades with larger dry/soil variation on concert lawns.
- Concrete mineral detail, subtle slab joints, curbs and seawall grain.
- Darker asphalt aggregate and restrained repair/oil variation.
- Fabric weave, light sun fading and ground-level dirt on festival props.
- Muted summer canopy color and per-tree variation while retaining bark color.

Existing signs, LED screens, festival colors and cutout truss silhouettes are
preserved. The pass changes no geometry, collision or crowd behavior. Solid
props and foliage share a shader variant; terrain uses the other. Replacing
the old lawn shader makes the net change one additional lit program (17 maximum
for Chicago), with the previous draw and triangle budgets unchanged.

The smoke test validates terrain PBR maps, texture scale, all five quality/level
configurations and shader/geometry budgets. Chrome captures check ground detail,
festival overview and lakefront foliage at player and elevated camera heights.
