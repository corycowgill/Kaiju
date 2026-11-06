// Single source of truth for the graphics quality tier. Hoisted out of
// game.js so the new VFX manager (src/vfx.js) and any future modules can
// read the same flags without introducing a circular dependency on the
// main game module.
//
// Tier defaults: med on mobile, high on desktop. Override with ?q=low|med|high
// or the in-game Graphics toggle (saved in localStorage).
//
// Each tier carries a profile object that downstream systems can read to
// scale particle counts, flipbook resolutions, etc. without having to
// branch on Q_HIGH/Q_MED/Q_LOW directly.

const ua = navigator.userAgent || '';
const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const isIOS = /iPhone|iPad|iPod/i.test(ua);
const isAndroid = /Android/i.test(ua);
export const isMobile = isIOS || isAndroid ||
  (touch && Math.min(window.innerWidth, window.innerHeight) < 820);

// Tier: ?q= wins, then the player's saved choice, then the default
// (MED on mobile = the GLB city with mobile textures; HIGH on desktop).
const QUALITY_KEY = 'kaijuQuality';
function detect() {
  const m = location.search.match(/[?&]q=(low|med|high)\b/);
  if (m) return m[1];
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (saved === 'low' || saved === 'med' || saved === 'high') return saved;
  } catch (e) { /* storage blocked (private mode): fall through */ }
  return isMobile ? 'med' : 'high';
}

/** Persist a tier and reload with ?q=<tier> so every module re-reads it. */
export function setQualityAndReload(tier) {
  try { localStorage.setItem(QUALITY_KEY, tier); } catch (e) { /* not persisted */ }
  const params = new URLSearchParams(location.search);
  params.set('q', tier);
  location.search = params.toString();
}

export const QUALITY = detect();
export const Q_HIGH = QUALITY === 'high';
export const Q_MED  = QUALITY === 'med';
export const Q_LOW  = QUALITY === 'low';

// GLB city/props/enemies/vehicles. Only a phone on LOW keeps the old
// procedural-only path (for old devices); desktop LOW still loads GLBs.
export const GLB_CONTENT = !(isMobile && Q_LOW);

// Rollback escape hatch for the VFX upgrade. With ?vfx=legacy the new
// shader/quark builders are skipped and every effect falls back to the
// original procedural implementation in src/effects.js. Lets us ship
// upgrades branch-by-branch without code changes if a regression appears.
export const LEGACY_VFX = /[?&]vfx=legacy\b/.test(location.search);

// VFX-facing tuning knobs. Particle counts and texture resolutions scale
// with the tier; soft particles (depth-aware) only kick in on high.
export const QUALITY_PROFILE = {
  low: {
    particleMul: 0.25,
    flipbookRes: 512,
    softParticles: false,
    maxEmitters: 8,
    anisotropy: 4,
  },
  med: {
    particleMul: 0.50,
    flipbookRes: 1024,
    softParticles: false,
    maxEmitters: 16,
    anisotropy: 8,
  },
  high: {
    particleMul: 1.00,
    // @1k sheets (128px frames): 5 sheets ~28 MB VRAM vs ~110 MB at @2k; the
    // difference is negligible on fast, additive, bloomed effects.
    flipbookRes: 1024,
    softParticles: true,
    maxEmitters: 32,
    anisotropy: 16,
  },
}[QUALITY];
