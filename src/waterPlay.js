// Kaiju <-> water gameplay: the wading feel (slow-down, sink, surge audio)
// and the water events gameplay raises: footfalls, the per-frame wake, shore
// surges, and splashes where impacts, debris and sinking boats land on water.
// Rendering and the depth field are the water system's (world.water, set by
// the level: ripple / wake / splash / surge / depthAt, chicago_water.js);
// every call is optional so a level or tier without it costs nothing.
// No per-frame allocations.
import audio from './audio.js';

let _world = null;

/** Bind the level's water (call once per city build). */
export function bindWater(world) { _world = world; }

/** 0 on land, 0..1 in water (the render's baked shore-distance field). */
export function waterDepth(x, z) {
  const w = _world;
  if (!w || !w.isWater) return 0;
  const d = w.water?.depthAt?.(x, z);
  if (d !== undefined) return d;
  return w.isWater(x, z) ? 1 : 0; // no field (yet): binary
}

export function isWater(x, z) { return !!_world?.isWater?.(x, z); }

// ---- Wading -------------------------------------------------------------

const WADE = {
  depth: 0,     // smoothed depth under the kaiju (0..1)
  sink: 0,      // how far the body has settled below y 0 (world units)
  inWater: false,
  idleT: 0,     // idle ripple timer
  surgeT: 0,    // shore surge cooldown
};
const SLOW_DEEP = 0.22; // speed lost in fully deep water
const SINK_DEEP = 3.2;  // body settles this far at full depth (kaiju ~32u tall)
const SHALLOW = 0.15;   // depth under which a moving kaiju pushes a surge at the shore

/** Movement speed multiplier for the kaiju at its current depth. */
export function wadeSpeedMult() { return 1 - SLOW_DEEP * WADE.depth; }

/** How far to lower the kaiju root this frame (0 on land). */
export function wadeSink() { return WADE.sink; }

export function isWading() { return WADE.inWater; }

/**
 * Per frame: smooth the depth under the kaiju, settle the body, feed the
 * wake and shore surges (scalar args only) and the wading ambience.
 * vx/vz: ground velocity.
 */
export function updateWading(world, pos, vx, vz, dt, airborne) {
  const raw = airborne ? 0 : waterDepth(pos.x, pos.z);
  // Depth eases in over ~0.4 s so the shoreline doesn't snap the body
  const k = 1 - Math.exp(-dt / 0.4);
  WADE.depth += (raw - WADE.depth) * k;
  WADE.inWater = raw > 0;
  WADE.sink = SINK_DEEP * WADE.depth;
  const w = world.water;
  if (w && WADE.inWater) {
    const sp = Math.hypot(vx, vz);
    if (sp > 0.5) {
      w.wake?.(pos.x, pos.z, vx / sp, vz / sp, sp);
      // Wading through the shallows pushes water at the shore
      if (raw < SHALLOW && (WADE.surgeT -= dt) <= 0) {
        WADE.surgeT = 0.6;
        w.surge?.(pos.x, pos.z, Math.min(1, sp / 30));
      }
    } else if ((WADE.idleT -= dt) <= 0) {
      // Standing in the lake: a slow, soft ring around the legs
      WADE.idleT = 1.6;
      w.ripple?.(pos.x, pos.z, 0.15 + 0.15 * WADE.depth);
    }
  }
  if (typeof audio.waterWade === 'function') audio.waterWade(WADE.inWater, WADE.depth);
  // Lake lapping near the shoreline (either side); null where there's no water
  if (typeof audio.updateShore === 'function') {
    const sd = world.water?.shoreDist?.(pos.x, pos.z);
    audio.updateShore(sd === undefined ? null : sd);
  }
}

/**
 * A kaiju footfall. In water: ripple + spray at the foot and the surge SFX;
 * returns true so the caller skips the dry footstep sound.
 */
export function footfall(world, pos, sprint) {
  if (!WADE.inWater) return false;
  const d = WADE.depth, w = world.water;
  w?.ripple?.(pos.x, pos.z, (sprint ? 0.7 : 0.4) * (0.5 + 0.5 * d));
  w?.splash?.(pos.x, pos.z, (sprint ? 0.7 : 0.5) * (0.6 + 0.6 * d), 'foot');
  if (typeof audio.waterStep === 'function') { audio.waterStep(d, !!sprint); return true; }
  return false; // no wading sound: keep the dry step so it isn't silent
}

/**
 * Something landed at (x, z): a splash + ripple and the splash SFX if that's
 * water. size ~0.5 (a chunk), 1 (a shell), 2 (beam / stomp), 3 (ult,
 * collapse). Returns true on water.
 */
export function impact(world, x, z, size, kind) {
  if (!world.isWater || !world.isWater(x, z)) return false;
  const w = world.water;
  w?.splash?.(x, z, size, kind);
  w?.ripple?.(x, z, Math.min(1, 0.3 + size * 0.25));
  if (typeof audio.waterSplash === 'function') audio.waterSplash(size, kind);
  return true;
}

/**
 * A boat was smashed at (x, z). The harbour already bursts its own pooled
 * spray there, so this adds only the ripple and the splash SFX.
 */
export function boatSunk(world, x, z) {
  world.water?.ripple?.(x, z, 0.8);
  if (typeof audio.waterSplash === 'function') audio.waterSplash(1.4, 'boat');
}
