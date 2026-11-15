// New York City asset manifest (owner: nyc-design; read by src/levels/nyc.js).
// Seeded by nyc-integrator with empty tables; same fields as dcManifest.js.
// Set ready: true only once the file (and its <name>_lod1.glb, unless lod1:
// false) is in assets/buildings/nyc/, so missing files never 404; unready
// landmarks are built from procedural massing (nyc.js BUILDERS).
export const NYC_BASE = './assets/buildings/nyc/';

// id: the landmark id in assets/levels/nyc_layout.json (ids: several sites,
// one model). trueHeightM: the model's bbox height incl. spires; the layout
// height is the roof. face: the world direction of the model's +Z front.
// fit 'footprint' (+ maxH, stretch): fill the layout outline instead of the
// true-height uniform scale. exact (+ atOrigin): map scale, no fit.
// shiftM: metres the site moves along the model's front. stone: debris tint.
export const NYC_LANDMARK_GLBS = [
];

// Generic blocks by height bucket (game units: low < 7, short 7-18,
// medium 18-40, tall > 40). Empty: nyc.js borrows Chicago's kit.
// { file, bucket, maxH?, share?, trueM?, stone?, desktopOnly?, ready }
export const NYC_GENERIC_GLBS = [
];

// Street props: { name, file, heightM?, ready } (front +Z, metres)
export const NYC_PROP_GLBS = [
];

// Extra traffic: { url, len, weight, parked?, albedo?, minRoadW?, ready }
export const NYC_VEHICLE_GLBS = [
];

// Kit pieces placed many times or fitted to named footprints:
// { id: { file, ready, layoutIds?, desktopOnly? } }
export const NYC_KIT_GLBS = {
};

// Debris for wrecked NYC buildings (urls), used instead of the shared concrete kit when listed.
export const NYC_DEBRIS_GLBS = [
].map((f) => NYC_BASE + f);
