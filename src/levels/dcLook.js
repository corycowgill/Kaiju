// Washington DC's light, sky and fog (owner: dc-design). Plain data, read by
// look.js through setLookLayerKey (dc.js, every DC build) and by game.js
// (_DC_LOOK, the values that stand until the look layer's first write).
//
// key: one time-of-day key in look.js's KEYS shape, held all match (no slide
// to dusk). Any field left out keeps Chicago's golden-hour value. Colours are
// sRGB hex numbers, or [hex, scale] for an intensity-carrying colour; plain
// numbers are numbers. az: the sun's horizontal bearing [x, z] (+X east, +Z south).
export const DC_LOOK = {
  key: {
    // Early afternoon: the sun ~33 deg west of south at 52 deg, so the Capitol's west front,
    // the White House south front and the Mall's north-side museum fronts get light or grazing light
    discElev: 52, lightElev: 52,
    sun: 0xfff3e0, sunI: 3.0,
    fill: 0xf0e2cc, fillI: 0.62, // warm bounce off the stone and lawns: shadowed marble reads warm grey, not blue
    hemiSky: 0xd0dcea, hemiGround: 0xa08c6a, hemiI: 0.58,
    amb: 0x9a948a, ambI: 0.08,
    haze: 0xc4d6ea, hazeSun: 0xf2e6d2, hazeExp: 1.4, fogD: 0.00042, fogK: 0.011, fogMax: 0.6, // thin enough that the Capitol dome reads from the Lincoln end of the Mall
    zen: 0x2c66be, mid: 0x7ca8dc, glow: 0xfff0d4, disc: 6,
    env: [0.9, 0.87, 0.82], fillW: 0xfff0dc, fillWI: 0.32,
    win: 0xffe0b0, winI: 0.1, winFrac: 0.04, glass: 0.6,
    sat: 0.95, val: 0.82, ao: 0.6, shadow: 0.92,
    unlit: [0.84, 0.84, 0.82],
    cloud: 0xf6f6f2, cloudShade: 0xa8b2c4, cover: 0.28, stars: 0,
    rimSun: [0xfff0dc, 1.3], rimSky: [0xc4d6f0, 0.6], rimI: 0.95, hero: 0.18, flood: 0.25,
    exposure: 0.98, bloomT: 1.1, bloomS: 0.28,
    gradeMix: 0.3, gradeShadow: [0.99, 0.98, 0.99], gradeHigh: [1.03, 1.01, 0.97],
  },
  az: [-0.55, 0.835], // ~213 deg, early afternoon: the Capitol's west (Mall) front and the south fronts lit; Lincoln's east front in soft shade
  // game.js statics (hex colours; sky arrays are linear 0..1; bloomK scales the pass's strength)
  statics: {
    bg: 0xc9d8e8, fog: 0xc9d8e8, fogDensity: 0.0005,
    hemiSky: 0xd6e2f0, hemiGround: 0xa08c6a, sun: 0xfff6ea, sunI: 2.25, rim: 0xf0e2cc, amb: 0x9a948a,
    sky: { horizon: [0.74, 0.83, 0.93], midCol: [0.44, 0.64, 0.89], zenith: [0.19, 0.40, 0.78], sunRim: [1.0, 0.97, 0.92] },
    sunOffset: [-82, 192, 125],
    grade: { mix: 0.18, shadow: [0.99, 0.98, 0.99], high: [1.02, 1.0, 0.97] },
    bloomThreshold: 1.12, bloomK: 0.6,
  },
};
