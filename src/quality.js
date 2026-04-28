// Single source of truth for the graphics quality tier. Hoisted out of
// game.js so the new VFX manager (src/vfx.js) and any future modules can
// read the same flags without introducing a circular dependency on the
// main game module.
//
// Tier defaults: low on mobile, high on desktop. Override with ?q=low|med|high.
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

function detect() {
  const m = location.search.match(/[?&]q=(low|med|high)\b/);
  if (m) return m[1];
  return isMobile ? 'low' : 'high';
}

export const QUALITY = detect();
export const Q_HIGH = QUALITY === 'high';
export const Q_MED  = QUALITY === 'med';
export const Q_LOW  = QUALITY === 'low';

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
    godRaySamples: 0,
    anisotropy: 4,
  },
  med: {
    particleMul: 0.50,
    flipbookRes: 1024,
    softParticles: false,
    maxEmitters: 16,
    godRaySamples: 30,
    anisotropy: 8,
  },
  high: {
    particleMul: 1.00,
    flipbookRes: 2048,
    softParticles: true,
    maxEmitters: 32,
    godRaySamples: 60,
    anisotropy: 16,
  },
}[QUALITY];
