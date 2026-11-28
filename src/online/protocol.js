// Shared wire contract. No client can submit positions, damage or match results.
export const PROTOCOL = 1;
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const FIGHTERS = Object.freeze([
  'godzilla',
  'ghidorah',
  'mecha',
  'cindervault',
  'brineveil',
  'rimehorn',
  'vesperax',
  'thornwake',
  'ferrumaw',
]);
export const CITIES = Object.freeze(['chicago', 'tokyo', 'dc', 'nyc', 'seattle', 'sf']);
export const EDGES = Object.freeze(['strike', 'heavy', 'grab', 'pin', 'taunt', 'finisher']);
export function sanitizeInput(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const axis = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  let x = axis(value.x),
    z = axis(value.z);
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  const input = {
    x,
    z,
    sprint: value.sprint === true,
    block: value.block === true,
    strikeHeld: value.strikeHeld === true,
    grabHeld: value.grabHeld === true,
    mash: value.mash === 1 ? 1 : 0,
    power: ['beam', 'roar', 'charge', 'stomp', 'ult'].includes(value.power) ? value.power : '',
  };
  for (const key of EDGES) input[key] = value[key] === true;
  return input;
}
export function writeIntent(f, other, raw, fighting = true) {
  const it = f.intent;
  it.moveX = fighting ? -raw.x : 0;
  it.moveZ = fighting ? raw.z : 0;
  it.faceYaw = Math.atan2(other.pos.x - f.pos.x, other.pos.z - f.pos.z);
  for (const key of [...EDGES, 'sprint', 'block', 'strikeHeld', 'grabHeld'])
    it[key] = fighting && !!raw[key];
  it.power = fighting ? raw.power || (raw.finisher && !f.can('finisher') ? 'ult' : '') : '';
  it.mash = fighting ? raw.mash : 0;
  const forward = raw.z * Math.cos(f.yaw) - raw.x * Math.sin(f.yaw),
    right = raw.z * Math.sin(f.yaw) + raw.x * Math.cos(f.yaw);
  it.dirX = Math.abs(right) > Math.abs(forward) && Math.abs(right) > 0.3 ? Math.sign(right) : 0;
  it.dirZ =
    Math.abs(forward) >= Math.abs(right) && Math.abs(forward) > 0.3 ? Math.sign(forward) : 0;
}
