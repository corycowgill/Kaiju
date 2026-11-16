// Seattle asset manifest (owner: seattle-design; read by src/levels/seattle.js).
// Seeded by seattle-integrator with empty tables; same fields as nycManifest.js.
// Set ready: true only once the file (and its <name>_lod1.glb, unless lod1:
// false) is in assets/buildings/seattle/, so missing files never 404; unready
// landmarks are built from procedural massing (seattle.js BUILDERS).
export const SEATTLE_BASE = './assets/buildings/seattle/';

// id: the landmark id in assets/levels/seattle_layout.json (ids: several sites,
// one model). trueHeightM: the model's bbox height incl. spires; the layout
// height is the roof. face: the world direction of the model's +Z front.
// fit 'footprint' (+ maxH, stretch): fill the layout outline instead of the
// true-height uniform scale. exact (+ atOrigin): map scale, no fit.
// shiftM: metres the site moves along the model's front. offsetM: [east, south] metres in map directions
// (added to the site, combines with shiftM). y0: metres the base sits above grade (negative: below).
// stone: debris tint.
export const SEATTLE_LANDMARK_GLBS = [
];

// Generic blocks by height bucket (game units: low < 7, short 7-18,
// medium 18-40, tall > 40). Empty: seattle.js borrows Chicago's kit.
// { file, bucket, style?, maxH?, share?, trueM?, stone?, desktopOnly?, ready }
export const SEATTLE_GENERIC_GLBS = [
];

// Street props: { name, file, heightM?, ready } (front +Z, metres)
export const SEATTLE_PROP_GLBS = [
];

// Extra traffic: { url, len, weight, parked?, albedo?, minRoadW?, ready }
export const SEATTLE_VEHICLE_GLBS = [
];

// Kit pieces placed many times or fitted to named footprints:
// { id: { file, heightM?, ready, layoutIds?, desktopOnly? } }
// Placed by seattle.js when ready: seattle_ferry (Washington State ferry, front +Z, waterline y = 0),
// seattle_monorail_train (front +Z, base on the beam top), seattle_monorail_pylon, seattle_container_ship,
// seattle_harbor_crane, seattle_seaplane, seattle_houseboat.
export const SEATTLE_KIT_GLBS = {
};

// Debris for wrecked Seattle buildings (urls), used instead of the shared concrete kit when listed.
export const SEATTLE_DEBRIS_GLBS = [
].map((f) => SEATTLE_BASE + f);
