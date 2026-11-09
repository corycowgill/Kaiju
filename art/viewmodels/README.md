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
The controls react to movement, the cannon recoils, and textured muzzle flashes use
the existing fire flipbook. A foreground projection retains internal depth while
leaving the world camera's depth precision unchanged.

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
