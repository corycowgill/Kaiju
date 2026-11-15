// New York City's light, sky and fog (owner: nyc-design; seeded by nyc-integrator with DC values). Plain data, read by
// look.js through setLookLayerKey (nyc.js, every NYC build) and by game.js
// (_NYC_LOOK, the values that stand until the look layer's first write).
//
// key: one time-of-day key in look.js's KEYS shape, held all match (no slide
// to dusk). Any field left out keeps Chicago's golden-hour value. Colours are
// sRGB hex numbers, or [hex, scale] for an intensity-carrying colour; plain
// numbers are numbers. az: the sun's horizontal bearing [x, z] (+X east, +Z south).
// Clear late-spring afternoon over Midtown (nyc-design): the sun in the west-south-west at 40 deg, behind the player
// spawn on the Hudson, so the west and south faces of the skyline the kaiju wades toward are sunlit and the avenues
// run as alternating bright / shaded canyons. Fronts that end up in shade: the Empire State's Fifth Ave entrance (east),
// 30 Rock's plaza front (east), the Library's Fifth Ave front (east), One Vanderbilt's Grand Central side (east),
// MetLife's north face. Lit: Grand Central's 42nd St front, the Chrysler's Lexington front, the Times building's Eighth
// Ave front, St Patrick's west front, the Plaza's west front, Central Park South seen from the park (south faces are
// back-lit only in the morning: here they take the sun on their west halves).
export const NYC_LOOK = {
  key: {
    discElev: 40, lightElev: 40,
    sun: 0xfff0dc, sunI: 3.1,
    fill: 0xe8dccb, fillI: 0.58, // bounce off pale stone and glass: canyon shade reads cool-warm grey, never black
    hemiSky: 0xcadaee, hemiGround: 0x8c8274, hemiI: 0.6,
    amb: 0x969490, ambI: 0.09,
    haze: 0xc2d2e4, hazeSun: 0xf4e4cc, hazeExp: 1.5, fogD: 0.00036, fogK: 0.01, fogMax: 0.55, // light summer haze: the Queens / New Jersey shores soften, the Empire State stays crisp from the Hudson
    zen: 0x2a62bc, mid: 0x76a4da, glow: 0xffeccc, disc: 6,
    env: [0.92, 0.9, 0.86], fillW: 0xfff0dc, fillWI: 0.3,
    win: 0xffe0b0, winI: 0.08, winFrac: 0.03, glass: 0.7,
    sat: 0.97, val: 0.82, ao: 0.62, shadow: 0.9,
    unlit: [0.84, 0.85, 0.86],
    cloud: 0xf6f6f2, cloudShade: 0xa6b0c2, cover: 0.24, stars: 0,
    rimSun: [0xfff0dc, 1.3], rimSky: [0xc4d6f0, 0.6], rimI: 0.95, hero: 0.18, flood: 0.25,
    exposure: 0.98, bloomT: 1.1, bloomS: 0.26,
    gradeMix: 0.3, gradeShadow: [0.98, 0.98, 1.0], gradeHigh: [1.03, 1.01, 0.97],
  },
  az: [-0.866, 0.5], // ~240 deg (WSW), mid-afternoon: west and south-west faces lit, avenue-side east fronts in shade
  // game.js statics (hex colours; sky arrays are linear 0..1; bloomK scales the pass's strength)
  statics: {
    bg: 0xc6d6ea, fog: 0xc6d6ea, fogDensity: 0.00045,
    hemiSky: 0xd4e0f0, hemiGround: 0x8c8274, sun: 0xfff2e2, sunI: 2.3, rim: 0xe8dccb, amb: 0x969490,
    sky: { horizon: [0.73, 0.82, 0.93], midCol: [0.43, 0.63, 0.88], zenith: [0.18, 0.38, 0.77], sunRim: [1.0, 0.96, 0.9] },
    sunOffset: [-166, 161, 96],
    grade: { mix: 0.18, shadow: [0.98, 0.98, 1.0], high: [1.02, 1.0, 0.97] },
    bloomThreshold: 1.12, bloomK: 0.6,
  },
};
