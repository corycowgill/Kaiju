// San Francisco's light, sky and fog. Plain data, read by look.js through setLookLayerKey
// (sf.js, every San Francisco build) and by game.js (_SF_LOOK, the values that stand until the look layer's
// first write).
//
// key: one time-of-day key in look.js's KEYS shape, held all match (no slide
// to dusk). Any field left out keeps Chicago's golden-hour value. Colours are
// sRGB hex numbers, or [hex, scale] for an intensity-carrying colour; plain
// numbers are numbers. az: the sun's horizontal bearing [x, z] (+X east, +Z south).
// A clear morning on the Bay after the fog has burned back to the Golden Gate: the sun in the east-south-east
// over the East Bay hills (bearing ~115 deg, 34 deg up), clean and slightly warm, a pale blue sky and a bright
// marine haze that whitens the far shores, the Bay Bridge's far towers and the hills without hiding them.
// The player rises from the Bay off the Embarcadero looking south-west at the Ferry Building and the Financial
// District, so the sun is behind the player's left shoulder: the bay-facing (E / SE / S) fronts take it - the
// Ferry Building's pier side and clock tower, the Embarcadero Center slabs' east ends, the Pyramid's east and
// south faces, Salesforce Tower, the pier sheds' bay ends, Coit Tower's east side, Oracle Park's cove arcade.
// In shade: the west and north fronts (the Ferry Building's Market Street front, City Hall's Polk Street front,
// the Fisherman's Wharf fronts that face north to the water).
export const SF_LOOK = {
  key: {
    discElev: 34, lightElev: 34,
    sun: 0xfff0d8, sunI: 3.25, // a clean morning sun over the Bay
    fill: 0xdfe4ea, fillI: 0.66, // bright bounce off the water and the pale towers: shade reads blue-grey, never black
    hemiSky: 0xcadaee, hemiGround: 0x84827a, hemiI: 0.64,
    amb: 0x949aa2, ambI: 0.1,
    haze: 0xd2dce8, hazeSun: 0xf8ead4, hazeExp: 1.5, fogD: 0.00034, fogK: 0.011, fogMax: 0.55, // marine haze: Alcatraz, the far bridge towers and the East Bay soften
    zen: 0x2c62b6, mid: 0x7eaada, glow: 0xffecd0, disc: 6,
    env: [0.92, 0.94, 0.96], fillW: 0xfff0d8, fillWI: 0.32,
    win: 0xffe4b8, winI: 0.06, winFrac: 0.02, glass: 0.76,
    sat: 1.0, val: 0.84, ao: 0.62, shadow: 0.9,
    unlit: [0.86, 0.88, 0.9],
    cloud: 0xfaf8f4, cloudShade: 0xaab6c8, cover: 0.14, stars: 0,
    rimSun: [0xfff0d8, 1.3], rimSky: [0xc0d6f2, 0.62], rimI: 0.95, hero: 0.18, flood: 0.25,
    exposure: 0.98, bloomT: 1.1, bloomS: 0.26,
    gradeMix: 0.28, gradeShadow: [0.97, 0.99, 1.02], gradeHigh: [1.03, 1.01, 0.97],
  },
  az: [0.906, 0.423], // ~115 deg (ESE), morning: the bay-facing fronts lit, the west fronts in shade
  // game.js statics (hex colours; sky arrays are linear 0..1; bloomK scales the pass's strength)
  statics: {
    bg: 0xccd8e8, fog: 0xccd8e8, fogDensity: 0.0004,
    hemiSky: 0xd4e0f0, hemiGround: 0x84827a, sun: 0xfff0d8, sunI: 2.4, rim: 0xdfe4ea, amb: 0x949aa2,
    sky: { horizon: [0.76, 0.83, 0.92], midCol: [0.45, 0.63, 0.86], zenith: [0.18, 0.37, 0.74], sunRim: [1.0, 0.95, 0.86] },
    sunOffset: [190, 135, 89],
    grade: { mix: 0.18, shadow: [0.97, 0.99, 1.02], high: [1.03, 1.0, 0.97] },
    bloomThreshold: 1.12, bloomK: 0.6,
  },
};
