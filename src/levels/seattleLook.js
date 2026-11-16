// Seattle's light, sky and fog (owner: seattle-design). Plain data, read by look.js through setLookLayerKey
// (seattle.js, every Seattle build) and by game.js (_SEATTLE_LOOK, the values that stand until the look layer's
// first write).
//
// key: one time-of-day key in look.js's KEYS shape, held all match (no slide
// to dusk). Any field left out keeps Chicago's golden-hour value. Colours are
// sRGB hex numbers, or [hex, scale] for an intensity-carrying colour; plain
// numbers are numbers. az: the sun's horizontal bearing [x, z] (+X east, +Z south).
// A clear Pacific Northwest late afternoon in summer: the sun low in the south-west over Elliott Bay (bearing ~235 deg,
// 32 deg up), warm, with a cool blue sky and a thin marine haze that softens West Seattle, the Olympics and Rainier
// without hiding them. The player rises from the bay at (-175, 110) looking north-east, so the sun is behind the
// player's left shoulder: the bay-facing (WSW / SW / S) fronts of the downtown core, the waterfront piers' bay ends,
// the Space Needle's south and west sides, Lumen Field's west stands and the stations' west sides take the sun.
// Fronts that end up in shade: everything facing ENE up the hill - Columbia Center's Fifth Ave front, 1201 Third's,
// Rainier Tower's and the Russell Center's entrances, the Pike Place arcade and its PUBLIC MARKET sign (it faces up
// Pike St; the neon carries it), the pier sheds' Alaskan Way street ends, Colman Dock's terminal front - and the
// north faces of Seattle Center (MoPOP's west side is lit, the Pacific Science Center's courtyard is half in shade).
export const SEATTLE_LOOK = {
  key: {
    discElev: 32, lightElev: 32,
    sun: 0xffe6c4, sunI: 3.2, // warm low sun over the Sound
    fill: 0xd8dde4, fillI: 0.62, // cool bounce off the bay and the glass towers: shade reads blue-grey, never black
    hemiSky: 0xc4d6ec, hemiGround: 0x7c7a70, hemiI: 0.62,
    amb: 0x8e949c, ambI: 0.1,
    haze: 0xc6d4e4, hazeSun: 0xf6e2c6, hazeExp: 1.6, fogD: 0.0003, fogK: 0.01, fogMax: 0.5, // thin marine haze: the far shores and the mountains soften, downtown stays crisp from the bay
    zen: 0x2a5eb4, mid: 0x74a2d6, glow: 0xffe4c0, disc: 6,
    env: [0.9, 0.92, 0.95], fillW: 0xffe6c4, fillWI: 0.32,
    win: 0xffe0b0, winI: 0.08, winFrac: 0.03, glass: 0.74,
    sat: 1.0, val: 0.82, ao: 0.62, shadow: 0.9,
    unlit: [0.84, 0.86, 0.88],
    cloud: 0xf8f6f2, cloudShade: 0xa4b0c4, cover: 0.18, stars: 0,
    rimSun: [0xffe6c4, 1.35], rimSky: [0xbcd2f0, 0.62], rimI: 0.95, hero: 0.18, flood: 0.25,
    exposure: 0.98, bloomT: 1.1, bloomS: 0.26,
    gradeMix: 0.3, gradeShadow: [0.97, 0.99, 1.02], gradeHigh: [1.04, 1.01, 0.96],
  },
  az: [-0.819, 0.574], // ~235 deg (SW), late afternoon: bay-facing fronts lit, the uphill (ENE) fronts in shade
  // game.js statics (hex colours; sky arrays are linear 0..1; bloomK scales the pass's strength)
  statics: {
    bg: 0xc4d4e8, fog: 0xc4d4e8, fogDensity: 0.0004,
    hemiSky: 0xd0def0, hemiGround: 0x7c7a70, sun: 0xffe8cc, sunI: 2.35, rim: 0xd8dde4, amb: 0x8e949c,
    sky: { horizon: [0.72, 0.81, 0.92], midCol: [0.42, 0.61, 0.86], zenith: [0.17, 0.36, 0.74], sunRim: [1.0, 0.93, 0.84] },
    sunOffset: [-174, 132, 122],
    grade: { mix: 0.18, shadow: [0.97, 0.99, 1.02], high: [1.03, 1.0, 0.96] },
    bloomThreshold: 1.12, bloomK: 0.6,
  },
};
