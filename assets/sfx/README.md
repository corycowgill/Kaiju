# KAIJU HAVOC sound effects

AI-generated with **Stable Audio 3 small** (Stability AI), `stable_audio_3_small_sfx` unless the Model column says
`music` (`stable_audio_3_small_music`, used for the wave/game-over stingers). Text encoder `t5gemma_b_b_ul2`,
8 steps, cfg 1.0, `lcm` sampler, `simple` schedule, run through ComfyUI's comfy package on CPU. The Stable Audio 3
license applies (https://stability.ai/license).

Post-processing: mono downmix, leading silence trimmed, a 3 ms fade-in and a squared fade-out, single-impact sounds
cut before a second transient, and K-weighted loudness levelling by momentary max (big one-shots about -13 to -14 LUFS,
mid one-shots -16 to -19, frequent sounds -20 to -23, loops -22 to -24) with a lookahead limiter at -1 dBFS.
Loops are crossfaded end-to-start with an equal-power crossfade; if a browser's MP3 decoder keeps the LAME priming/padding, `audio.js` sets loopStart/loopEnd to skip it. Each clip ships as OGG Vorbis (q3) and MP3 (LAME V5).
`src/audio.js` loads OGG where the browser supports it, otherwise MP3.

Files named `name_N` are variations; the game picks one at random and adds slight pitch jitter.
Total size: 2.45 MB (84 clips x 2 formats).

| File | Duration | Model | Prompt |
|---|---|---|---|
| `explosion_small_1` | 1.60s | sfx | Close explosion, sharp punchy blast with crackling debris and short rumbling tail, outdoor city, cinematic. Length: 2 seconds |
| `explosion_small_2` | 1.60s | sfx | Grenade explosion on a city street, sharp crack and boom with shrapnel and glass debris, short tail. Length: 2 seconds |
| `explosion_small_3` | 1.56s | sfx | Car bomb exploding, punchy blast with metal debris clatter and crackling fire, outdoor. Length: 2 seconds |
| `explosion_big_1` | 2.64s | sfx | Huge fuel tanker explosion, enormous fireball whoosh and deep boom with long rolling thunder echo through skyscrapers. Length: 4 seconds |
| `explosion_big_2` | 3.00s | sfx | Massive bomb detonation, earth-shaking low boom, shockwave rumble and falling concrete debris, cinematic. Length: 4 seconds |
| `explosion_big_3` | 3.00s | sfx | Giant building explosion, crackling blast followed by heavy rumble and metal debris crashing down, cinematic. Length: 4 seconds |
| `hit_1` | 0.29s | sfx | Giant monster fist smashing into concrete and steel, heavy crunchy punch impact with debris crumble, close. Length: 1 seconds |
| `hit_2` | 0.52s | sfx | Heavy body punch impact with deep thump and concrete crunch, cinematic fight hit. Length: 1 seconds |
| `hit_3` | 0.36s | sfx | Huge fist smashing a steel wall, metallic bang and crumbling debris, close. Length: 1 seconds |
| `shell_hit_1` | 0.60s | sfx | Tank shell striking thick armored monster hide, dull metallic thud with small sharp explosion pop, close. Length: 1 seconds |
| `shell_hit_2` | 0.60s | sfx | Shell impact on armored hide, heavy thud with small explosion pop and sizzle. Length: 1 seconds |
| `shell_hit_3` | 0.60s | sfx | Cannon round smacking into a steel plate, loud clang with short crackling burst. Length: 1 seconds |
| `beam_gorrak_1` | 1.73s | sfx | Monster atomic breath beam, roaring searing energy blast with crackling radioactive hiss and deep throaty rumble, sci-fi, cinematic. Length: 3 seconds |
| `beam_gorrak_2` | 1.81s | sfx | Giant flamethrower blast of glowing energy, intense roaring fire jet with electric crackle, sci-fi. Length: 3 seconds |
| `beam_tridon_1` | 1.64s | sfx | Powerful electric lightning beam, crackling high voltage arcs and buzzing zaps with thunder crack, sci-fi energy weapon. Length: 3 seconds |
| `beam_tridon_2` | 1.08s | sfx | Powerful electric lightning beam, crackling high voltage arcs and buzzing zaps with thunder crack, sci-fi energy weapon. Length: 3 seconds |
| `beam_mechra_1` | 1.71s | sfx | Giant robot plasma cannon firing, rising electronic charge whine then heavy pulsing laser blast, sci-fi weapon, cinematic. Length: 3 seconds |
| `beam_mechra_2` | 1.45s | sfx | Sci-fi laser cannon beam firing continuously, bright humming energy ray with electronic warble and bass throb. Length: 3 seconds |
| `roar_gorrak_1` | 2.41s | sfx | Massive kaiju roar, deep guttural reptilian bellow with screeching overtones and rumbling reverb echoing through a city, cinematic monster. Length: 3 seconds |
| `roar_gorrak_2` | 2.38s | sfx | Gigantic dinosaur roar, loud ferocious growling bellow, deep and powerful, cinematic. Length: 3 seconds |
| `roar_tridon_1` | 2.29s | sfx | Giant three-headed dragon shrieking, piercing layered avian screech with crackling thunder rumble, cinematic monster. Length: 3 seconds |
| `roar_tridon_2` | 2.73s | sfx | Huge dragon screech, high piercing reptilian cry with electric crackle and storm thunder. Length: 3 seconds |
| `roar_mechra_1` | 2.60s | sfx | Salvo of rockets launching rapidly from a giant robot, multiple missile whooshes and ignition bursts with distant explosions, sci-fi military. Length: 3 seconds |
| `roar_mechra_2` | 2.60s | sfx | Salvo of rockets launching rapidly from a giant robot, multiple missile whooshes and ignition bursts with distant explosions, sci-fi military. Length: 3 seconds |
| `charge_gorrak_1` | 1.00s | sfx | Huge monster tail swinging through the air, heavy deep whoosh with wind rush, close. Length: 1 seconds |
| `charge_gorrak_2` | 1.00s | sfx | Huge monster tail swinging through the air, heavy deep whoosh with wind rush, close. Length: 1 seconds |
| `charge_tridon_1` | 1.00s | sfx | Giant leathery dragon wings flapping once, powerful deep whoosh with gust of wind. Length: 1 seconds |
| `charge_tridon_2` | 1.00s | sfx | Large bird wings flapping hard, heavy feathered whoosh and wind gust. Length: 1 seconds |
| `charge_mechra_1` | 1.50s | sfx | Robot rocket thruster boost ignition, roaring jet blast whoosh with mechanical servo whine, sci-fi. Length: 2 seconds |
| `charge_mechra_2` | 1.33s | sfx | Jetpack thruster ignition burst, loud roaring flame whoosh. Length: 2 seconds |
| `stomp_1` | 2.00s | sfx | Colossal monster foot slamming the ground, earth shaking deep boom with cracking pavement and rumbling debris, cinematic. Length: 2 seconds |
| `stomp_2` | 2.00s | sfx | Giant hammer slamming the earth, massive low impact boom with ground cracking and rocks scattering. Length: 2 seconds |
| `stomp_3` | 2.00s | sfx | Huge heavy impact on concrete, deep cinematic boom with shockwave rumble and debris. Length: 2 seconds |
| `footstep_1` | 0.24s | sfx | Single heavy giant footstep on asphalt, deep low thud with slight crunch of gravel. Length: 1 seconds |
| `footstep_2` | 0.70s | sfx | One huge heavy footstep on concrete, low thump with debris crunch. Length: 1 seconds |
| `footstep_3` | 0.70s | sfx | Elephant stomping once on dirt ground, heavy low thud. Length: 1 seconds |
| `footstep_4` | 0.23s | sfx | Heavy boulder dropped on the ground, single deep thud. Length: 1 seconds |
| `ult_1` | 3.20s | sfx | Enormous energy power-up surge rising to a gigantic shockwave explosion, deep sub bass boom, electric crackle and debris, epic cinematic. Length: 4 seconds |
| `ult_2` | 3.20s | sfx | Nuclear blast shockwave, rising whoosh into a huge thunderous explosion with rumbling aftermath, epic. Length: 4 seconds |
| `shoot_tank_1` | 1.20s | sfx | Tank main cannon firing, loud sharp boom with deep low end and short echo, outdoor. Length: 2 seconds |
| `shoot_tank_2` | 1.20s | sfx | Howitzer artillery gun firing, huge muzzle blast boom echoing across a city. Length: 2 seconds |
| `shoot_tank_3` | 1.20s | sfx | Large cannon shot, punchy explosive boom with metallic breech clank. Length: 2 seconds |
| `shoot_rifle_1` | 0.50s | sfx | Single assault rifle gunshot, sharp crack, medium distance outdoor. Length: 1 seconds |
| `shoot_rifle_2` | 0.50s | sfx | Single assault rifle gunshot, sharp crack, medium distance outdoor. Length: 1 seconds |
| `shoot_rifle_3` | 0.50s | sfx | One gunshot, sharp loud crack with slight city echo. Length: 1 seconds |
| `shoot_rifle_4` | 0.50s | sfx | Short burst of three rifle shots, rapid cracks, distant outdoor. Length: 1 seconds |
| `shoot_heli_1` | 0.80s | sfx | Helicopter chain gun short burst, rapid heavy machine gun fire, outdoor. Length: 1 seconds |
| `shoot_heli_2` | 0.69s | sfx | Minigun firing a short buzzing burst, very rapid gunfire. Length: 1 seconds |
| `shoot_jet_1` | 1.40s | sfx | Missile launching from fighter jet, ignition burst and fast rocket whoosh moving away. Length: 2 seconds |
| `shoot_jet_2` | 0.99s | sfx | Rocket launch, loud ignition hiss and roaring whoosh passing by. Length: 2 seconds |
| `shoot_mech_1` | 0.70s | sfx | Heavy mech autocannon shot, punchy mechanical blast with metallic clank, military sci-fi. Length: 1 seconds |
| `shoot_mech_2` | 0.67s | sfx | Sci-fi heavy blaster shot, punchy electric zap blast with deep thump. Length: 1 seconds |
| `shoot_boss_1` | 1.40s | sfx | Huge railgun cannon firing, heavy electric thump with deep boom and metallic ring, sci-fi military. Length: 2 seconds |
| `shoot_boss_2` | 1.40s | sfx | Battleship main gun firing, gigantic deep boom with long rolling echo. Length: 2 seconds |
| `pickup_hp` | 0.90s | sfx | Bright magical healing chime, rising sparkling bell tones, video game power-up. Length: 1 seconds |
| `pickup_rage` | 0.61s | sfx | Aggressive energy power-up, rising electric synth zap with deep growl, video game pickup. Length: 1 seconds |
| `pickup_score` | 0.35s | sfx | Coins jingling collect sound, shiny metallic coin pickup chime, video game. Length: 1 seconds |
| `alarm` | 1.86s | sfx | Air raid siren starting to wail over a city, rising warning tone, distant echo. Length: 3 seconds |
| `wave_start` | 1.80s | music | Epic taiko drum ensemble hit with brass stab, dramatic Japanese battle intro. BPM: 120. Length: 3 seconds |
| `wave_clear` | 2.40s | music | Short triumphant orchestral brass fanfare stinger with timpani roll and cymbal crash, heroic victory. BPM: 120. Length: 3 seconds |
| `game_over` | 3.20s | music | Sad dramatic orchestral ending, falling strings and low horn swell fading out, minor key. BPM: 60. Length: 4 seconds |
| `boss_spawn` | 2.80s | sfx | Giant robot powering up, deep mechanical groan, hydraulic hiss and heavy metal stomp, cinematic. Length: 4 seconds |
| `collapse_1` | 2.80s | sfx | Skyscraper collapsing, concrete crumbling and steel beams groaning, glass shattering, heavy rubble avalanche rumble, cinematic. Length: 4 seconds |
| `collapse_2` | 2.80s | sfx | Skyscraper collapsing, concrete crumbling and steel beams groaning, glass shattering, heavy rubble avalanche rumble, cinematic. Length: 4 seconds |
| `collapse_3` | 2.80s | sfx | Building demolition, concrete walls crashing down, massive rubble rumble and dust. Length: 4 seconds |
| `glass_1` | 0.90s | sfx | Large window glass shattering, sharp crash with tinkling shards falling. Length: 1 seconds |
| `glass_2` | 0.83s | sfx | Glass pane smashed, bright crash with scattering broken glass. Length: 1 seconds |
| `car_crush_1` | 0.90s | sfx | Car being crushed flat, metal crunch and twisting sheet metal with breaking glass, close. Length: 1 seconds |
| `car_crush_2` | 0.76s | sfx | Car crash impact, heavy metal crunch and bang with shattering windows. Length: 1 seconds |
| `car_crush_3` | 0.64s | sfx | Heavy weight crushing a metal car roof, deep crunch and creak. Length: 1 seconds |
| `scream_1` | 1.80s | sfx | Crowd of people screaming in panic, terrified shouts, outdoor city street. Length: 2 seconds |
| `scream_2` | 1.80s | sfx | Group of people shrieking and running away, panicked yells and footsteps. Length: 2 seconds |
| `scream_3` | 1.80s | sfx | Terrified crowd gasping and screaming, chaotic city panic. Length: 2 seconds |
| `jet_flyby_1` | 2.54s | sfx | Fighter jet flyby, loud roaring engine passing overhead fast with doppler shift. Length: 3 seconds |
| `jet_flyby_2` | 2.60s | sfx | Military jet screaming past low overhead, roaring whoosh fading away. Length: 3 seconds |
| `kill_tank_1` | 1.78s | sfx | Armored tank destroyed, heavy metal crunch and tearing steel followed by a secondary ammunition explosion, cinematic. Length: 3 seconds |
| `kill_tank_2` | 1.41s | sfx | Military vehicle blown apart, crushing metal impact and turret ammo cooking off in a big boom. Length: 3 seconds |
| `kill_heli_1` | 2.60s | sfx | Helicopter shot down, rotor blades winding down and sputtering engine, then crashing into the ground with a metal impact explosion. Length: 3 seconds |
| `kill_heli_2` | 2.49s | sfx | Helicopter rotor slowing down with grinding metal, falling and smashing into the street, explosion. Length: 3 seconds |
| `kill_jet_1` | 1.80s | sfx | Fighter jet hit in mid air, loud explosion with engine screaming and debris whoosh falling away, cinematic. Length: 3 seconds |
| `kill_jet_2` | 1.28s | sfx | Air explosion of a fighter plane, booming fireball and crackling fragments, distant crash rumble. Length: 3 seconds |
| `loop_heli` | 4.20s | sfx | Military helicopter hovering, steady thumping rotor blades and turbine whine, constant, outdoor. Length: 7 seconds |
| `loop_tank` | 4.40s | sfx | Tank engine rumbling while driving, steady diesel growl and clanking metal treads, constant. Length: 7 seconds |
| `loop_city` | 7.90s | sfx | Distant city in chaos, wailing police sirens, faint crowd screaming and car alarms, burning ambience. Length: 10 seconds |
