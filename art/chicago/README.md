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

## Local wear and wind — build 1.11.127

`chicagoWear.js` bakes foot traffic from the actual gate, concession, stage and
path positions. Grass gains broken soil transitions near busy edges; paving
receives subtler dust. The field is deterministic, rebuilt on level creation,
and cleared when the festival is disabled. It uses 256 KB desktop / 64 KB phone
memory and requires no downloaded images, decal meshes or per-frame CPU baking.

The existing material family adds gentle height-masked canopy motion with trunks
anchored. Pennants use seven triangles each and bend along their length instead
of swinging as rigid cards. Their existing draw batch and destruction attachment
remain. Both wind clocks wrap on complete cycles to prevent long-session jumps.
The 17-program Chicago cap and existing draw/triangle budgets remain unchanged.

## Crowd skinning and escape routes — build 1.11.128

`tools/refine_crowd_skins.py` repairs all nine downloaded bodies at all three
detail levels. It fits each chest width, blends sleeves into the torso, keeps
lateral shirt collars attached to the chest, smooths hip/knee transitions and
attaches low-poly hands to wrist bones. The simplified meshes cannot support
the original individual finger weights. Person 05 has a broader pelvis blend
for its longer shirt hem. Geometry, UVs, textures, inverse binds and the single
animation library stay intact; all 27 GLB byte sizes are unchanged.

Run the tool with `--person 1` for a reference-body review or without that flag
for all nine. Original files are backed up outside the game in
`../crowd_build/skin_before`. Regenerate `src/assetManifest.js` afterward so
existing IndexedDB downloads refresh the modified models.

`node tools/audit_crowd_deformation.mjs --all-lods` samples the actual GPU bone
atlas over walking, running, sprinting, two dances and falling. The recorded
audit in `crowd-deformation.json` drops close-up large edge-stretch events from
1,405 to 16 across the sampled poses. This is a comparative diagnostic, not a
claim of perfect deformation: sparse scan topology still has some garment
pinching. Infantry-height Chrome captures check the reference body in walking,
running, dancing and mid-fall, plus all nine variants and the full festival.

The closest attendees now receive the limited high-detail slots regardless of
spawn order. Crowd steering uses shared gate flood fields around live fences,
tents and water, refreshed after destruction. Gate choice considers route
length, Kaiju danger and crowd load, and is reconsidered periodically. Local
neighbor separation, staggered reactions and offset exit lanes reduce overlap
and synchronized movement. Route searches are shared; neighbor work is capped.
Tests exercise long fence detours, newly destroyed obstacles, separation and
exit retirement. The shared animation atlas remains 5.81 MB in GPU memory;
the existing shader guards against invalid HDR values remain in place.
