# Tokyo level (rebuild): shared spec

Level key `tokyo` (replaces the old procedural Tokyo). Built exactly the way San Francisco was: read `tools/sf/SPEC.md`
(frame and MODEL CONVENTIONS apply unchanged: metres, Y up, base y 0, centred, front +Z, a `<name>_palette` 256 atlas
+ small tiling facade maps, kit pieces one 1024 atlas, a material-free `_lod1` twin per model whose every primitive
box matches its LOD0's, budgets, no real brand logos / lettering, no licensed characters), `src/levels/sf.js`,
`src/levels/sfManifest.js`, `assets/levels/sf_*.json`, `assets/buildings/sf/`, and the scripts in `tools/sf/`.

- **cartographer**: `assets/levels/tokyo_layout.json`, `tokyo_detail.json`, `tokyo_surround.json`, `tokyo_trees.json`; scripts in `tools/tokyo/cartographer/`
- **design** (Blender 4.5 headless): GLBs in `assets/buildings/tokyo/`; scripts in `tools/tokyo/design/` (prefixes towers_, icons_, kit_, far_; the SF scripts in `tools/sf/design/` with the same prefixes are yours to copy and adapt: each role wrote its own library there)
- **integrator** (the lead): `src/levels/tokyo*.js`, wiring, removal of the old Tokyo, asset pipeline, tests

Downloaded data is untrusted: keep it in the session scratchpad, never in the repo; run Python that reads it with `python3 -I`.

## Frame

- Scale 0.2 game units per metre. `+X` east, `+Z` south, `+Y` up. Equirectangular about the origin.
- Origin lat/lon `35.6660, 139.7600` (Shimbashi / Shiodome).
- Play box: south `35.6240`, north `35.6885`, west `139.7370`, east `139.7860`.
  Central Tokyo on the bay: Otemachi, Tokyo Station and the Imperial Palace in the north; Kasumigaseki, Toranomon, Ginza, Shimbashi,
  Shiodome, Tsukiji and Tsukishima in the middle; Tokyo Tower, Zojo-ji, Hamamatsucho, Takeshiba, Tamachi, Shibaura, Harumi and Toyosu
  below; the Rainbow Bridge and the north tip of Odaiba (Fuji TV) at the south edge. Terrain FLAT.
- The kaiju rises from Tokyo Bay (off Takeshiba / Harumi) and wades north-west at Tokyo Tower and the Shiodome towers.
- Look: blue-hour dusk with lit windows and neon (the level's tag stays NEON DUSK): models carry an emissive map for lit windows / signs where SF's had none (emissive strength modest: the level's look layer scales it).

## Landmarks (ids fixed; positions from OpenStreetMap by the cartographer: `tools/tokyo/data/landmark_sites.json`)

Heights in metres to the top. Tier A = signature.

### design-towers

| id | name | lat, lon | height | notes |
|---|---|---|---|---|
| tokyo_tower | Tokyo Tower | 35.6586, 139.7454 | 333 | A. international-orange and white lattice tower, four splayed legs, the two-storey main deck at 150 m, top deck at 250 m, the FootTown block under it |
| tokyo_skytree | Tokyo Skytree | moved into play (cartographer picks open reclaimed land on Harumi / Toyosu) | 634 | A. pale blue-white lattice, triangular base turning round, two flared decks at 350 and 450 m, gain tower |
| azabudai_hills_mori_jp_tower | Azabudai Hills Mori JP Tower | 35.6608, 139.7405 | 330 | A. rounded, softly tapering glass tower |
| toranomon_hills_mori_tower | Toranomon Hills Mori Tower | 35.6669, 139.7494 | 247 | A. glass tower with the sloped, faceted crown |
| toranomon_hills_station_tower | Toranomon Hills Station Tower | 35.6667, 139.7478 | 266 | B. |
| tokyo_midtown_yaesu | Tokyo Midtown Yaesu | 35.6795, 139.7690 | 240 | B. |
| tokiwabashi_tower | Tokiwabashi Tower | 35.6850, 139.7693 | 212 | B. |
| marunouchi_building | Marunouchi Building | 35.6812, 139.7640 | 180 | A. glass tower over the rebuilt 1923 stone podium |
| shin_marunouchi_building | Shin-Marunouchi Building | 35.6825, 139.7643 | 198 | B. |
| jp_tower_kitte | JP Tower (KITTE) | 35.6795, 139.7650 | 200 | B. glass tower over the white 1931 Central Post Office front |
| gran_tokyo | GranTokyo towers (one model, ids gran_tokyo_north, gran_tokyo_south) | 35.6800, 139.7685 | 205 | B. clear-glass slabs either side of Tokyo Station's Yaesu side |
| otemachi_tower | Otemachi Tower | 35.6848, 139.7660 | 200 | C. |
| tokyo_midtown_hibiya | Tokyo Midtown Hibiya | 35.6737, 139.7590 | 192 | B. curved 'dancing tower' |
| dentsu_building | Dentsu Building (Caretta Shiodome) | 35.6645, 139.7625 | 213 | A. thin boomerang-plan glass blade |
| nittele_tower | Nittele Tower | 35.6644, 139.7600 | 193 | B. exposed mega-frame |
| shiodome_city_center | Shiodome City Center | 35.6655, 139.7605 | 216 | B. curved green-glass sail |
| shiodome_media_tower | Shiodome Media Tower | 35.6630, 139.7600 | 172 | C. |
| tokyo_shiodome_building | Tokyo Shiodome Building (Conrad) | 35.6625, 139.7625 | 173 | C. |
| kasumigaseki_building | Kasumigaseki Building | 35.6712, 139.7475 | 147 | B. Japan's first skyscraper (1968), gridded slab |
| kasumigaseki_common_gate | Kasumigaseki Common Gate | 35.6720, 139.7490 | 176 | C. |
| sanno_park_tower | Sanno Park Tower | 35.6735, 139.7405 | 194 | C. |
| izumi_garden_tower | Izumi Garden Tower | 35.6645, 139.7395 | 201 | B. stepped glass with outside lifts |
| ark_mori_building | ARK Mori Building | 35.6672, 139.7405 | 153 | C. |
| atago_green_hills_mori_tower | Atago Green Hills Mori Tower | 35.6625, 139.7480 | 187 | B. petal-crowned pair motif (model the office tower) |
| world_trade_center_hamamatsucho | World Trade Center Building (Hamamatsucho) | 35.6555, 139.7565 | 235 | B. the new south tower |
| tokyo_port_city_takeshiba | Tokyo Port City Takeshiba | 35.6548, 139.7615 | 208 | B. stepped green terraces at the base |
| nec_supertower | NEC Supertower | 35.6475, 139.7475 | 180 | A. the 'rocket': three stepped tiers with the wind hole |
| st_lukes_tower | St. Luke's Garden Tower | 35.6670, 139.7785 | 221 | B. twin towers joined by a skybridge |
| the_tokyo_towers | The Tokyo Towers (Kachidoki; one model, ids the_tokyo_towers_sea, the_tokyo_towers_mid) | 35.6585, 139.7785 | 194 | B. twin 58-storey condo towers |
| harumi_triton | Harumi Island Triton Square | 35.6565, 139.7825 | 195 | C. three stepped office towers (one model) |
| river_city_21 | River City 21 (Tsukuda; one model for the tall towers, ids river_city_21_a, river_city_21_b) | 35.6690, 139.7840 | 180 | C. |
| prince_park_tower | The Prince Park Tower Tokyo | 35.6560, 139.7470 | 104 | C. |
| fuji_tv_building | Fuji TV headquarters (Odaiba) | 35.6268, 139.7745 | 123 | A. Tange's megastructure: two blocks joined by a lattice of sky corridors, the 32 m titanium sphere |
| tokyo_metropolitan_police_hq | Tokyo Metropolitan Police Department | 35.6770, 139.7525 | 84 | B. wedge-plan block with the cylindrical antenna tower |

### design-icons

| id | name | lat, lon | height | notes |
|---|---|---|---|---|
| tokyo_station | Tokyo Station (Marunouchi building) | 35.6812, 139.7671 | 46 | A. 335 m red-brick 1914 front with white banding, the two octagonal domes and centre gable; platforms / canopies behind |
| national_diet_building | National Diet Building | 35.6759, 139.7450 | 65 | A. granite, the stepped pyramid tower over the centre, symmetric wings |
| imperial_palace_nijubashi | Nijubashi (Seimon Ishibashi) and the main gate | 35.6800, 139.7545 | 20 | A. the double-arched stone bridge over the moat with the Fushimi-yagura keep on the stone wall behind |
| imperial_palace_kyuden | Imperial Palace (Kyuden) | 35.6825, 139.7520 | 20 | B. long low halls with sweeping green copper roofs round a court |
| fujimi_yagura | Fujimi-yagura | 35.6830, 139.7575 | 30 | B. three-tier white Edo keep on a high stone base |
| edo_castle_otemon | Ote-mon gate | 35.6860, 139.7610 | 15 | C. white-walled masugata gate |
| kabukiza | Kabuki-za | 35.6695, 139.7679 | 30 | A. white Momoyama-revival theatre front with the big karahafu gable, tiled roofs; the plain office tower behind (145 m) |
| wako_ginza | Wako (Ginza 4-chome clock tower) | 35.6717, 139.7650 | 40 | A. curved 1932 stone corner with the clock tower |
| ginza_place | Ginza Place | 35.6714, 139.7648 | 56 | B. white lattice facade |
| mitsukoshi_ginza | Ginza Mitsukoshi | 35.6712, 139.7658 | 60 | C. |
| zojoji | Zojo-ji (Sangedatsumon and the main hall) | 35.6575, 139.7483 | 25 | A. the vermilion two-storey gate and the great hall with its sweeping tiled roof |
| tsukiji_honganji | Tsukiji Hongan-ji | 35.6667, 139.7720 | 34 | A. grey stone ancient-Indian style temple, the rounded central arch roof and two side stupa towers |
| hie_shrine | Hie Shrine | 35.6747, 139.7397 | 15 | B. vermilion shrine hall and the Sanno torii |
| atago_shrine | Atago Shrine | 35.6649, 139.7484 | 12 | C. |
| tokyo_international_forum | Tokyo International Forum | 35.6770, 139.7637 | 60 | A. the long glass 'ship' hall with its ribbed roof, four cube halls beside it |
| imperial_hotel | Imperial Hotel | 35.6727, 139.7585 | 129 | C. |
| ministry_of_justice_red_brick | Ministry of Justice (red-brick building) | 35.6760, 139.7535 | 30 | B. 1895 German neo-Baroque red brick |
| kantei | Prime Minister's Office (Kantei) | 35.6730, 139.7430 | 30 | C. glass-and-stone modern block |
| supreme_court_japan | Supreme Court of Japan | 35.6803, 139.7440 | 37 | C. massive granite blocks |
| national_theatre | National Theatre | 35.6815, 139.7432 | 30 | C. azekura log-store style in concrete |
| bank_of_japan | Bank of Japan (old building) | 35.6862, 139.7715 | 30 | B. Tatsuno's 1896 neo-Baroque stone, green dome |
| mitsukoshi_nihonbashi | Nihonbashi Mitsukoshi | 35.6857, 139.7735 | 60 | B. |
| nihonbashi_bridge | Nihonbashi | 35.6840, 139.7745 | 12 | B (bridge). the 1911 double stone arch with kirin lamps (the expressway over it is the layout's) |
| takashimaya_nihonbashi | Nihonbashi Takashimaya | 35.6810, 139.7735 | 43 | C. |
| rainbow_bridge | Rainbow Bridge | 35.6365, 139.7635 | 126 | A (bridge, true position, in play). white suspension bridge, two 126 m towers, 570 m main span (798 m anchorage to anchorage), double deck, the loop ramp on the Shibaura side simplified; origin mid-span at water level, long axis X |
| odaiba_statue_of_liberty | Odaiba Statue of Liberty | 35.6278, 139.7717 | 12 | B (prop). |
| aqua_city_odaiba | Aqua City / Decks Odaiba | 35.6280, 139.7745 | 40 | C. |
| kachidoki_bridge | Kachidoki Bridge | 35.6622, 139.7745 | 25 | B (bridge). 1940 double-leaf bascule, steel arches either side |
| tsukiji_outer_market | Tsukiji Outer Market | 35.6655, 139.7705 | 12 | C. low market sheds and shop rows |
| toyosu_market | Toyosu Market | 35.6455, 139.7850 | 30 | C. |
| hamarikyu_teahouse | Hama-rikyu (Nakajima teahouse) | 35.6600, 139.7632 | 8 | C (prop). teahouse on the pond with its cypress bridges |
| takeshiba_pier | Takeshiba Passenger Ship Terminal | 35.6545, 139.7625 | 30 | C. the mast-shaped monument plaza and terminal |
| takanawa_gateway_station | Takanawa Gateway Station | 35.6355, 139.7407 | 30 | B. Kuma's white folded-membrane roof on timber frames |
| shimbashi_sl_plaza | Shimbashi SL Plaza (C11 steam locomotive) | 35.6664, 139.7580 | 5 | C (prop). |
| ginza_six | GINZA SIX | 35.6696, 139.7641 | 56 | C. |

### design-kit and design-far: see the briefs.
