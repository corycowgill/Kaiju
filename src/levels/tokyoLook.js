// Tokyo's light, sky and fog. Plain data, read by look.js through setLookLayerKey (tokyo.js, every Tokyo build)
// and by game.js (_TOKYO_LOOK, the values that stand until the look layer's first write).
//
// key: one time-of-day key in look.js's KEYS shape, held all match. Any field left out keeps Chicago's golden-hour
// value. Colours are sRGB hex numbers, or [hex, scale] for an intensity-carrying colour. az: the sun's horizontal
// bearing [x, z] (+X east, +Z south).
// NEON DUSK: the blue hour over Tokyo Bay. The sun is just down in the west-south-west behind Mount Fuji (bearing
// ~255 deg); its orange afterglow is the key light, low and warm, against a deep blue-violet sky with the first
// stars. Office windows are lit across the towers, signboards and lanterns glow in the streets, Tokyo Tower and
// the Rainbow Bridge carry their own light. The player rises from the bay in the south-east looking north-west:
// the skyline stands half in silhouette against the glow, its bay-facing fronts picked out by the cool sky fill
// and their own windows. Brighter than Chicago's end-of-match dusk so a whole run reads clearly.
export const TOKYO_LOOK = {
  key: {
    discElev: -2, lightElev: 15,
    sun: 0xff9668, sunI: 1.75, // the afterglow
    fill: 0xb0bce8, fillI: 0.66, // the blue sky dome on everything facing away from the glow
    hemiSky: 0x8894d0, hemiGround: 0x4a4058, hemiI: 0.6,
    amb: 0x525a8c, ambI: 0.14,
    haze: 0x565c8c, hazeSun: 0xf4845a, hazeExp: 1.8, fogD: 0.0006, fogK: 0.011, fogMax: 0.78,
    zen: 0x121a48, mid: 0x44509c, glow: 0xff7444, disc: 0,
    env: [0.46, 0.48, 0.64], fillW: 0xff8658, fillWI: 0.26,
    win: 0xffc070, winI: 1.3, winFrac: 0.4, glass: 0.5, // lit windows across the city
    sat: 0.9, val: 0.84, ao: 0.66, shadow: 0.8,
    unlit: [0.34, 0.31, 0.42],
    cloud: 0xe08870, cloudShade: 0x3a3866, cover: 0.34, stars: 0.6,
    rimSun: [0xff9868, 1.5], rimSky: [0x90acff, 0.95], rimI: 1.15, hero: 0.34, flood: 0.5,
    exposure: 1.16, bloomT: 0.92, bloomS: 0.44,
    gradeMix: 0.46, gradeShadow: [0.9, 0.92, 1.08], gradeHigh: [1.07, 0.99, 0.9],
  },
  az: [-0.966, 0.259], // ~255 deg (WSW): the afterglow behind Fuji
  // game.js statics (hex colours; sky arrays are linear 0..1; bloomK scales the pass's strength)
  statics: {
    bg: 0x565c8c, fog: 0x565c8c, fogDensity: 0.0006,
    hemiSky: 0x8894d0, hemiGround: 0x4a4058, sun: 0xff9668, sunI: 1.6, rim: 0xb0bce8, amb: 0x525a8c,
    sky: { horizon: [0.62, 0.36, 0.3], midCol: [0.2, 0.22, 0.5], zenith: [0.03, 0.04, 0.16], sunRim: [1.0, 0.6, 0.36] },
    sunOffset: [-205, 56, 55],
    grade: { mix: 0.3, shadow: [0.92, 0.94, 1.06], high: [1.06, 0.99, 0.92] },
    bloomThreshold: 0.95, bloomK: 0.9,
  },
};
