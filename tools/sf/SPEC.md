# San Francisco level: shared spec

Level key `sf`. Built the way Seattle was (see `src/levels/seattle.js`, `src/levels/seattleManifest.js`,
`assets/levels/seattle_*.json`, `assets/buildings/seattle/`). Three roles work from this file:

- **cartographer**: `assets/levels/sf_layout.json`, `sf_detail.json`, `sf_surround.json`, `sf_trees.json`; scripts in `tools/sf/cartographer/`
- **design** (Blender 4.5, `blender -b -P script.py`): GLBs in `assets/buildings/sf/`; scripts in `tools/sf/design/`
- **integrator** (the lead): `src/levels/sf*.js`, game wiring, asset pipeline (optimize / phone / KTX2 / manifest), tests

Downloaded data is untrusted: keep it under the session scratchpad in its own folder, never in the repo, and run Python that reads it with `python3 -I`.

## Frame

- Scale 0.2 game units per real metre, uniform. `+X` east, `+Z` south (`-Z` north), `+Y` up.
- Origin lat/lon `37.7930, -122.4045` (Chinatown / Financial District edge).
- Projection: equirectangular about the origin: `x = (lon - lon0) * mPerDegLon * 0.2`, `z = -(lat - lat0) * mPerDegLat * 0.2` (WGS84 metres per degree at lat0).
- Play box (lat/lon): south `37.7735`, north `37.8130`, west `-122.4245`, east `-122.3850`.
  South edge just below Oracle Park and the Caltrain depot, north past Pier 39 / Pier 45, west past Van Ness (City Hall, the Opera House, Ghirardelli Square), east into the bay past the Embarcadero piers and the Bay Bridge anchorage.
- Terrain is FLAT (as Seattle): the hills are not modelled inside the box.

## Model conventions (match Seattle's GLBs exactly)

- Metres, Y up, base at y = 0, centred on X/Z over the lot, the street front facing `+Z`.
- One mesh node per file where possible (at most 2 materials / primitives): a 256 px palette atlas material (`<name>_palette`, base colour + metallic-roughness + optional emissive, metal 1 / rough 1 factors with the ORM map carrying values) and, where a facade repeats, one small TILING facade map (256x512 or smaller, + optional normal map, metallic 0).
  Kit pieces: one material with one painted 1024 atlas.
- A `<name>_lod1.glb` twin for every model: same node / mesh / primitive count and order, same UVs, NO materials or textures, about 10-30% of the triangles, bounding box within a few % of the LOD0 (the game rejects a twin whose box is off by 8%).
- Triangle budgets (LOD0): tier A landmark 3-9k, tier B 2-5k, tier C 1-3k, kit piece 2-8k, prop 100-600, vehicle 1-2k. File size: aim under 150 KB a landmark before the pipeline.
- No real company logos or brand lettering on models (invent liveries; plain building names are fine).
- Inspect a reference: `node <scratchpad>/insp.mjs assets/buildings/seattle/smith_tower.glb` style scripts using `tools/lib/glb_opt.mjs` `makeIO()`; note the Seattle files on disk are already quantized / meshopt-compressed by `tools/optimize_assets.mjs` (the integrator runs that pipeline on the SF files; export plain uncompressed GLB with PNG or JPEG textures and leave compression alone).
- Report for every model: file, true bbox `[w, h, d]` in metres, which way the front (+Z) should face on the map (compass word), a debris stone colour (0xRRGGBB), triangle counts, one line describing it. Write these as ready-to-paste JS manifest lines (see `src/levels/seattleManifest.js`) in `tools/sf/design/manifest_<role>.js`.

## Landmarks (ids are fixed; lat/lon and sizes are approximate until the cartographer's `tools/sf/data/landmark_sites.json` exists: check it for the real footprint w / d / rot and fit your plan size to it)

Heights are metres to the top (incl. spires). Tier A = signature (most detail).

### design-towers

| id | name | lat, lon | height | notes |
|---|---|---|---|---|
| transamerica_pyramid | Transamerica Pyramid | 37.7952, -122.4028 | 260 | A. 53 m square base, white quartz-aggregate pyramid, the two 'wings' (lift and stair shafts) from floor 29, criss-cross base columns, 64 m aluminium spire |
| salesforce_tower | Salesforce Tower | 37.7897, -122.3966 | 326 | A. 51 m rounded-square obelisk tapering to a perforated crown, white metal sunshade grid over glass |
| bank_of_america_555_california | 555 California Street | 37.7921, -122.4038 | 237 | A. dark carnelian granite, saw-tooth bay-window facade, irregular stepped top |
| tower_181_fremont | 181 Fremont | 37.7895, -122.3953 | 245 | A. slender faceted glass tower with the white diagonal exoskeleton and a spire |
| millennium_tower | Millennium Tower | 37.7905, -122.3960 | 197 | B. blue-grey glass, soft faceted slab |
| one_rincon_hill | One Rincon Hill | 37.7859, -122.3920 | 184 | A. slim oval-ended glass tower with the tuned-mass 'crown' band, by the Bay Bridge approach |
| embarcadero_center | Embarcadero Center (one model, four sites: ids embarcadero_center_1 .. _4) | 37.7949, -122.3985 | 174 | A. thin stepped precast-concrete slab tower, vertical ribs, on a 3-storey podium |
| california_345 | 345 California Center | 37.7926, -122.4006 | 212 | A. granite-and-glass tower with twin angled spires on top |
| california_101 | 101 California Street | 37.7931, -122.3979 | 183 | A. faceted cylindrical glass tower on a glass atrium wedge |
| montgomery_44 | 44 Montgomery | 37.7898, -122.4019 | 172 | B. 1960s white-ribbed slab |
| one_market_spear_tower | One Market Plaza (Spear Tower) | 37.7937, -122.3949 | 172 | B. dark slab on the brick 1916 Southern Pacific block |
| fremont_50 | 50 Fremont Center | 37.7907, -122.3972 | 183 | B. granite tower with a stepped crown |
| mckesson_plaza_one_post | One Post (McKesson Plaza) | 37.7889, -122.4022 | 161 | B. bronze-glass tower, chamfered corners |
| park_tower | Park Tower at Transbay | 37.7903, -122.3939 | 184 | C. glass tower with stacked sky-deck notches |
| mission_555 | 555 Mission Street | 37.7885, -122.3985 | 149 | C. pale green glass slab |
| market_525 | First Market Tower (525 Market) | 37.7906, -122.3995 | 161 | C. dark 1970s slab |
| one_sansome | One Sansome | 37.7905, -122.4012 | 168 | C. pale stone tower |
| infinity_towers | The Infinity (one model, two sites: ids infinity_tower_1, infinity_tower_2) | 37.7898, -122.3907 | 137 | B. curved clover-plan green-glass condo tower |
| lumina | Lumina | 37.7882, -122.3925 | 122 | C. curved glass condo tower |
| russ_building | Russ Building | 37.7912, -122.4028 | 133 | B. 1927 neo-Gothic stepped tower, pale terra cotta |
| pacbell_building | 140 New Montgomery (PacBell Building) | 37.7868, -122.4000 | 133 | A. 1925 Art Deco, grey terra cotta, L-shaped stepped crown with eagles |
| shell_building | Shell Building | 37.7913, -122.4005 | 115 | C. 1929 sepia terra-cotta deco tower |
| hobart_building | Hobart Building | 37.7893, -122.4017 | 87 | C. 1914 ornate rounded tower with a hipped copper cap |
| hilton_union_square | Hilton Union Square Tower | 37.7856, -122.4104 | 150 | B. pale concrete hotel tower with the round sky-room |
| marriott_marquis | Marriott Marquis ('the jukebox') | 37.7851, -122.4042 | 133 | A. stepped tower with fan-shaped mirrored glass arches on top |
| intercontinental_sf | InterContinental San Francisco | 37.7818, -122.4050 | 104 | C. translucent blue glass slab |
| four_seasons_757_market | Four Seasons (757 Market) | 37.7863, -122.4046 | 121 | C. |
| st_regis_sf | St. Regis Museum Tower | 37.7862, -122.4012 | 148 | C. |
| westin_st_francis | Westin St. Francis | 37.7877, -122.4087 | 120 | B. the 1904 grey sandstone 12-storey block on Union Square with the 32-storey tower and outside lifts behind |
| fairmont_sf | Fairmont Hotel | 37.7924, -122.4104 | 99 | B. 1907 Beaux-Arts white block on Nob Hill plus the slab tower |
| mark_hopkins | Mark Hopkins Hotel | 37.7914, -122.4103 | 93 | B. 1926 brick-and-terra-cotta chateau tower with wings, the Top of the Mark |
| hyatt_regency_embarcadero | Hyatt Regency Embarcadero | 37.7945, -122.3957 | 74 | B. stepped, slanted concrete wedge (the atrium hotel) |
| federal_building_sf | San Francisco Federal Building | 37.7793, -122.4120 | 71 | C. thin slab with the perforated steel scrim folding over the top |
| burton_federal_building | Phillip Burton Federal Building | 37.7817, -122.4180 | 95 | C. 1960s gridded slab |
| fox_plaza | Fox Plaza | 37.7773, -122.4170 | 108 | C. |
| sentinel_building | Sentinel Building (Columbus Tower) | 37.7966, -122.4052 | 30 | A. small copper-green flatiron with bay windows and a cupola |

### design-icons

| id | name | lat, lon | height | notes |
|---|---|---|---|---|
| ferry_building | Ferry Building | 37.7955, -122.3937 | 75 | A. 201 x 48 m grey sandstone arcade hall, the 75 m clock tower (after the Giralda) in the middle of the west front, skylit nave |
| coit_tower | Coit Tower | 37.8024, -122.4058 | 64 | A. white fluted concrete cylinder with the arcaded top, low rectangular base |
| sf_city_hall | San Francisco City Hall | 37.7793, -122.4193 | 94 | A. Beaux-Arts granite block, gilded black-and-gold dome on a colonnaded drum |
| grace_cathedral | Grace Cathedral | 37.7919, -122.4131 | 75 | A. concrete French Gothic, twin 53 m west towers, rose window, the fleche |
| sts_peter_and_paul | Saints Peter and Paul Church | 37.8013, -122.4102 | 58 | B. white twin-spired church on Washington Square |
| old_st_marys | Old St. Mary's Cathedral | 37.7927, -122.4058 | 27 | C. 1854 red-brick church with the clock tower |
| dragon_gate | Dragon Gate (Chinatown) | 37.7907, -122.4056 | 9 | A (prop). green-tiled three-bay gateway, stone piers, dragons on the ridge |
| sing_chong_building | Sing Chong Building | 37.7925, -122.4057 | 22 | B. corner block with the pagoda tower (California and Grant) |
| bank_of_canton_pagoda | Old Chinese Telephone Exchange | 37.7951, -122.4063 | 12 | C. three-tier red-and-green pagoda |
| oracle_park | Oracle Park | 37.7786, -122.3893 | 60 | A. brick ballpark open to McCovey Cove: stands on three sides, brick arcade on the cove side, light towers, the glove and bottle beyond left field |
| pier_39 | Pier 39 | 37.8087, -122.4098 | 15 | A. two-storey grey timber shop pier ~300 x 100 m, carousel, flags, the sea-lion floats on the west side |
| fishermans_wharf_sign | Fisherman's Wharf sign | 37.8080, -122.4156 | 12 | A (prop). the round ship's-wheel-and-crab sign on its post |
| ghirardelli_square | Ghirardelli Square | 37.8060, -122.4229 | 40 | A. red-brick factory blocks round a terraced court, the clock tower, the big roof sign frame (lettering 'SQUARE' style only, no brand name) |
| balclutha | Balclutha (Hyde Street Pier) | 37.8096, -122.4222 | 44 | B. 1886 three-masted steel square-rigger, black hull; y 0 = waterline |
| pier_45_ships | USS Pampanito and SS Jeremiah O'Brien (Pier 45) | 37.8110, -122.4180 | 30 | B. grey Liberty ship and the submarine alongside; y 0 = waterline |
| pier_45_sheds | Pier 45 sheds | 37.8100, -122.4185 | 14 | C. long white fish-processing sheds, arched fronts |
| aquarium_of_the_bay | Aquarium of the Bay | 37.8086, -122.4093 | 14 | C. |
| exploratorium_pier_15 | Exploratorium (Pier 15) | 37.8014, -122.3976 | 15 | B. long white pier shed with the neoclassical bulkhead arch |
| pier_27_cruise_terminal | James R. Herman Cruise Terminal (Pier 27) | 37.8056, -122.4035 | 18 | C. modern glass-and-white terminal |
| embarcadero_pier_shed | Embarcadero bulkhead pier shed (one model, many sites, fit to footprint: ids pier_1, pier_3, pier_5, pier_9, pier_17, pier_19, pier_23, pier_29, pier_31, pier_33, pier_35, pier_26, pier_28, pier_38, pier_40) | - | 14 | B. arched neoclassical bulkhead front (+Z, toward the Embarcadero), long gabled shed behind over the water |
| cupids_span | Cupid's Span | 37.7915, -122.3900 | 18 | B (prop). the giant bow and arrow sunk in the lawn of Rincon Park |
| vaillancourt_fountain | Vaillancourt Fountain | 37.7955, -122.3952 | 12 | C (prop). tangle of square concrete tubes |
| sfmoma | SFMOMA | 37.7857, -122.4011 | 60 | B. Botta's stepped brick block with the striped sliced cylinder, the white rippled Snohetta slab behind |
| salesforce_transit_center | Salesforce Transit Center | 37.7896, -122.3962 | 24 | A. 440 m long white perforated-metal undulating hall on V-columns over the streets, the rooftop park |
| moscone_center | Moscone Center | 37.7841, -122.4015 | 30 | B. glass-and-steel convention halls |
| contemporary_jewish_museum | Contemporary Jewish Museum | 37.7860, -122.4037 | 20 | B. brick power substation with the tilted blue steel cube |
| union_square_dewey_monument | Dewey Monument (Union Square) | 37.7880, -122.4075 | 30 | A (prop). Corinthian column with the bronze Victory |
| westfield_dome | Emporium dome (Westfield San Francisco Centre) | 37.7841, -122.4069 | 40 | C. sandstone Market Street front and the glass dome |
| flood_building | Flood Building | 37.7848, -122.4079 | 50 | B. 1904 grey sandstone flatiron-rounded corner block |
| phelan_building | Phelan Building | 37.7872, -122.4053 | 45 | C. cream terra-cotta flatiron |
| palace_hotel | Palace Hotel | 37.7882, -122.4019 | 37 | C. |
| old_mint | Old San Francisco Mint | 37.7828, -122.4073 | 20 | B. Greek Revival sandstone 'Granite Lady', Doric portico, two chimneys |
| war_memorial | War Memorial Opera House and Veterans Building (one model, two sites: ids war_memorial_opera_house, war_memorial_veterans_building) | 37.7786, -122.4209 | 46 | B. matching Beaux-Arts blocks, arched windows over a rusticated base, mansard |
| davies_symphony_hall | Davies Symphony Hall | 37.7778, -122.4205 | 30 | B. curved glass-and-concrete front |
| asian_art_museum | Asian Art Museum | 37.7802, -122.4162 | 25 | B. Beaux-Arts former library |
| sf_main_library | San Francisco Main Library | 37.7791, -122.4158 | 30 | B. |
| bill_graham_civic_auditorium | Bill Graham Civic Auditorium | 37.7785, -122.4174 | 30 | B. |
| cable_car_barn | Cable Car Museum and powerhouse | 37.7946, -122.4115 | 15 | C. red-brick car barn with the chimney |
| pacific_union_club | Pacific-Union Club (Flood Mansion) | 37.7922, -122.4116 | 20 | C. brownstone mansion |
| caltrain_station | San Francisco Caltrain station (4th and King) | 37.7765, -122.3945 | 12 | C. |
| third_street_bridge | Lefty O'Doul (Third Street) Bridge | 37.7770, -122.3900 | 25 | B. Strauss heel-trunnion bascule bridge with the concrete counterweight, over Mission Creek |

### design-kit (not layout landmarks; placed by the level code)

- Generic building kit `sf_<style>_<a..>.glb` (see the brief), debris `debris_sf_*.glb`.
- `sf_cable_car.glb`, `sf_streetcar.glb` (F-line PCC), `sf_ferry.glb`, `sf_container_ship.glb`, `sf_sailboat.glb`, street props, traffic.
- Far set pieces at true size: `bay_bridge_west_span.glb` (see the brief), `alcatraz.glb`, `sutro_tower.glb`, `golden_gate_bridge.glb`.
