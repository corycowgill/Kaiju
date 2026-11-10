# Lone Soldier cockpit and weapon art

Original art and Blender builders for the infantry weapon, tank gunner station,
and helicopter pilot cabin. No third-party model packs are used.

## Texture sources

- `cockpit_atlas.png`: generated flight/navigation displays and analog gauges.
- `cabin_surfaces.png`: generated worn paint, leather, woven fabric, maintenance
  placards, serial labels and warning markings.
- `prompt.json` and `surfaces_prompt.json`: exact successful prompts and generation
  provenance. Both raster sources were made with the built-in image_gen tool.

Blender derives repeatable material tiles and small lossless normal/roughness maps.
Texture coordinates use physical material scale, so surface grain does not stretch
across the cabin. A BVH bake adds crevice occlusion to vertex colors. Exported
texture files are content-addressed and shared by the three GLBs.

## Geometry and interaction

Vehicle interiors include a connected floor/sidewall/roof shell, front bulkhead,
sealed glazing, window longerons and gaskets, attached latch/grab-rail hardware,
avionics looms, hydraulic lines, recessed displays, decals, crew controls and gloves.
The aircraft weapon pods have mounting spars connected to the airframe.

The infantry model has a chamfered handguard, curved stamped magazine, barrel/brake,
receiver controls, reflex sight, exposed bolt, rail teeth, woven sleeves and gloves.

Live screens display altitude, speed, heading, target range and weapon readiness.
The controls react to movement, the cannon recoils, and directional combustion
sprites replace the explosion flipbook at the muzzle. A foreground projection retains internal depth while
leaving the world camera's depth precision unchanged.

The follow-up material pass separates graphite steel, satin hardware, khaki
polymer, dark leather and woven sleeves using glTF factors with shared textures.
The receiver has a forged stepped silhouette, forward assist, optic adjustment
dial and laser markings. Look inertia and a blended sprint pose add weapon weight.
All six screen types now draw live vector instruments; generated fixed readings
are no longer visible. Radar uses relative target bearing and a 200 m scale.

## Reference review

Visual benchmarks: [Call of Duty weapon presentation](https://www.callofduty.com/blog/2024/10/call-of-duty-black-ops-6-launch-comms-weapons-attachments-intel),
[Battlefield vehicle roles](https://www.ea.com/games/battlefield/battlefield-6/news/vehicles),
and [DCS cockpit reference imagery](https://www.digitalcombatsimulator.com/it/files/3328167/).
These are review references, not texture or model sources.

The review identified identical-looking material finishes, a slab-like receiver,
and fixed instrument readings as the most immediate weaknesses. This pass targets
those issues while retaining the connected cabin and existing geometry budgets.
Remaining differences from a AAA production include hand anatomy, bespoke baked
wear masks, environment lighting and authored skeletal handling animations.

## AI behavior

`loneKaijuAI.js` owns approach, wind-up, attack and recovery phases. The Kaiju
alternates close ground slams with ranged beam bursts, locks a slightly predicted
target during the warning, respects beam cover, and attacks faster below 40% HP.
Attack damage occurs once per burst; visual pulses cannot multiply damage.
Regression tests run a full minute per role and verify evasion and cover.

## Rebuild

From the repository root with Blender 5.2.2 and Python/numpy installed:

```powershell
blender -b -t 4 --python-exit-code 1 --python tools/build_infantry_view.py
blender -b -t 4 --python-exit-code 1 --python tools/build_vehicle_views.py
python tools/finish_viewmodels.py
node tools/make_asset_manifest.mjs
npm test
npm run smoke
```

Editable `.blend` sources and the final GLBs are in `assets/viewmodels/`.
`lone_view_manifest.json` records geometry budgets and texture references.
The finishing step removes obsolete generated textures and repairs zero normals.
The smoke test loads every role, checks the PBR maps and normal validity, and casts
roof/floor/side/window rays to catch missing cabin surfaces.
