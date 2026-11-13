// The ring in Grant Park (Chicago, wrestling mode): a kaiju-scale venue built
// over Hutchinson Field. Two halves:
//   buildArena()   static scene content, called from buildChicago when the
//                  level is built for the wrestling mode (so the smoke test's
//                  draw / triangle / program budgets cover it);
//   createArena()  the runtime side composed by src/wrestling/index.js: rope
//                  stretch / rebound / snap, posts that bend and topple,
//                  crowd reactions, floodlights, the big screens, wreckage.
// OWNER: arena + crowd engineer.
//
// What stands where (world units, +X east = the lake, -Z north):
//   ring      the square cx +- half, cz +- half (ropes); the mat reaches 3.5 u
//             further (MAT). Four light towers at the corners carry the ropes.
//   stands    two raked grandstands, north and south, 52..78 u from centre,
//             10 u tall at the back. No collision: they crush under bodies
//             (world.crowdHit) together with the people on them.
//   west      barricade + standing crowd, two big screens either side of the
//             rival's way in from the Loop (Balbo Dr gate).
//   east      the player's entrance: a runway from the mat across Lake Shore
//             Drive to the seawall, under a gateway arch.
// Lighting is faked: emissive lamp faces, additive beam cones, and one
// overlay quad that multiplies the ground under the four towers (with a soft
// shadow per kaiju per tower). No real lights, no new lit shader programs:
// everything lit is a plain MeshStandardMaterial with a map.
import * as THREE from 'three';
import { festCrowdMaterial, festCrowdUniforms, FEST_RING_GAPS } from './chicago_fest.js';
import { EV } from '../wrestling/events.js';
import * as LOOK from '../look.js';

/** Ring layout (world units). The ring is the axis-aligned square of half-size
 *  `half` around (cx, cz): Hutchinson Field, between Columbus Dr and Lake
 *  Shore Dr. ropeY are the three cable heights, postH the top turnbuckle
 *  (the towers themselves go on up to their floodlights at towerH),
 *  clearHalf the half-size of the square other systems treat as ringside. */
export const ARENA = Object.freeze({
  cx: 4, cz: 62, half: 42, postH: 24, ropeY: Object.freeze([8, 13, 18]), clearHalf: 60,
  matHalf: 45.5, towerH: 55, ropeGive: 9, ropeHits: 3,
});
const A0 = ARENA, MAT = A0.matHalf;
// The venue rectangle (ring, stands, standing areas): inside the festival fence
const VEN = Object.freeze({ x0: -54, x1: 52, z0: -16, z1: 140 });
// Grandstands: zf = front (ring side), zb = back; rows rise from H0 to ~10 u
const STANDS = Object.freeze([
  Object.freeze({ id: 'n', x0: -38, x1: 18, zf: 12, zb: -14, colour: 14 }),
  Object.freeze({ id: 's', x0: -38, x1: 46, zf: 112, zb: 138, colour: 15 }),
]);
const ROW_D = 2, ROW_H = 0.63, STAND_H0 = 2.4, ROWS = 13;
const RAMP = Object.freeze({ x0: MAT + A0.cx + 0.1, x1: 73.5, z: A0.cz, hw: 12 });
const GATE = Object.freeze({ x: 67, z: A0.cz, hw: 19, h: 44, top: 50 });
const SCREENS_W = Object.freeze([{ x: -50, z: 30 }, { x: -50, z: 94 }]); // west screens, facing the ring
const SCREEN = Object.freeze({ w: 28, h: 15.75, y0: 15 });
const FOUNTAIN = Object.freeze({ x: 29.5, z: 4.4, r: 11 });
const SIDES = ['n', 'e', 's', 'w'];

/** Festival layout items the venue displaces (gates stay: the fence leaves their gaps). */
export function arenaDisplaces(it) {
  if (it.kind === 'gate') return false;
  const r = Math.hypot(it.w || 0, it.d || 0) / 2;
  return it.x + r > VEN.x0 && it.x - r < VEN.x1 && it.z + r > VEN.z0 && it.z - r < VEN.z1;
}

/** The venue's footprint (ring, stands, the runway to the lake) as one simple
 *  polygon the park's trees keep out of: [[x, z], ...]. */
export function arenaNoTree() {
  const V = VEN, x2 = 77, za = RAMP.z - 17, zb = RAMP.z + 17;
  return [[V.x0, V.z0], [V.x1, V.z0], [V.x1, za], [x2, za], [x2, zb], [V.x1, zb], [V.x1, V.z1], [V.x0, V.z1]];
}

/** True where street furniture, lamps and trees should not be placed. */
export function arenaClears(x, z) {
  if (x > VEN.x0 && x < VEN.x1 && z > VEN.z0 && z < VEN.z1) return true;
  return x >= VEN.x1 && x < 77 && Math.abs(z - RAMP.z) < 17;
}

// ------------------------------------------------------------ tiers
// 0: phone LOW (no post, procedural tier), 1: phones, 2: desktop
const TIERS = [
  { seg: 14, rad: 4, bays: 5, braces: 1, dx: 2.6, ranks: 1, rowStep: 2, scale: 1.8, fill: 1, floor: 50, flashes: 24, movers: 0, shadows: 0, atlas: 512, matPx: 1024, led: 256, ledHz: 5, standDx: 7 },
  { seg: 20, rad: 5, bays: 7, braces: 1, dx: 1.3, ranks: 1, rowStep: 1, scale: 1.35, fill: 1, floor: 200, flashes: 48, movers: 4, shadows: 1, atlas: 512, matPx: 1024, led: 256, ledHz: 6, standDx: 4.7 },
  { seg: 40, rad: 8, bays: 9, braces: 2, dx: 0.75, ranks: 2, rowStep: 1, scale: 1, fill: 0.86, floor: 1000, flashes: 96, movers: 6, shadows: 1, atlas: 1024, matPx: 2048, led: 512, ledHz: 10, standDx: 2.8 },
];

// ------------------------------------------------------------ textures (built once per page, reused by every rebuild)
const FONT = (px, w = 900) => `${w} ${px}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
function _canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function _fit(cx, text, px, maxW) {
  cx.font = FONT(px);
  const w = cx.measureText(text).width || 1;
  if (w > maxW) cx.font = FONT(Math.floor(px * maxW / w));
}
/** Chicago's six-pointed star. */
function _star(cx, x, y, R, col) {
  cx.fillStyle = col;
  cx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 6, r = i % 2 ? R * 0.42 : R;
    if (i) cx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else cx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  cx.closePath(); cx.fill();
}

// Atlas (1024 space): two rows of 64 px colour cells, then the banner art
const AT = {
  LOGO: { x: 0, y: 136, w: 1024, h: 200 },   // KAIJU HAVOC
  TITLE: { x: 0, y: 344, w: 1024, h: 96 },   // CHICAGO HEAVYWEIGHT CHAMPIONSHIP
  STRIP: { x: 0, y: 448, w: 1024, h: 64 },   // apron / barricade ribbon
  HAZ: { x: 0, y: 520, w: 512, h: 40 },      // chevrons
  FLAG: { x: 0, y: 568, w: 512, h: 256 },    // the city flag
  MAIN: { x: 512, y: 568, w: 512, h: 256 },  // MAIN EVENT
};
// Colour cells: [albedo, emissive]
const CELLS = [
  ['#2a2f38', 0], ['#4a515c', 0], ['#8c8a84', 0], ['#b8262b', 0], ['#2b62c0', 0], ['#cfcfc8', 0], ['#16181c', 0], ['#d8a81e', 0],
  ['#30343a', 0], ['#e9e4d2', '#fff6e0'], ['#7a1418', '#ff2a22'], ['#16307a', '#2a7cff'], ['#c9c9c2', 0], ['#5d6168', 0], ['#23508f', 0], ['#8f2a2a', 0],
  ['#7d7460', '#ffd9a0'], ['#5a1010', '#ff1a10'], ['#16213f', 0], ['#6a2a24', 0], ['#3a3f48', 0], ['#101216', 0], ['#9a9fa6', 0], ['#44706a', 0],
];
const C = { STEEL: 0, STEEL2: 1, CONC: 2, RED: 3, BLUE: 4, WHITE: 5, BLACK: 6, YELLOW: 7, HOUSING: 8, LAMP: 9, LEDR: 10, LEDB: 11, TRIM: 12, TREAD: 13, SEATB: 14, SEATR: 15, STUD: 16, AVRED: 17, NAVY: 18, OXIDE: 19, STEEL3: 20, DARK: 21, ALU: 22, TEAL: 23 };
const cellUV = (i) => [((i % 16) * 64 + 32) / 1024, 1 - (Math.floor(i / 16) * 64 + 32) / 1024];
const rectUV = (r, inset = 2) => ({ u0: (r.x + inset) / 1024, u1: (r.x + r.w - inset) / 1024, v0: 1 - (r.y + r.h - inset) / 1024, v1: 1 - (r.y + inset) / 1024 });

function _paintAtlas(cx, px, emissive) {
  const k = px / 1024;
  cx.save(); cx.scale(k, k);
  cx.fillStyle = '#000'; cx.fillRect(0, 0, 1024, 1024);
  CELLS.forEach(([col, em], i) => { cx.fillStyle = emissive ? (em || '#000') : col; cx.fillRect((i % 16) * 64, Math.floor(i / 16) * 64, 64, 64); });
  const dim = emissive ? 0.42 : 1; // signage is backlit: the emissive copy is the same art, dimmer
  cx.globalAlpha = dim;
  cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
  // LOGO
  {
    const r = AT.LOGO, g = cx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, '#0d1430'); g.addColorStop(1, '#1a2a66');
    cx.fillStyle = g; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.fillStyle = '#58b7e6'; cx.fillRect(r.x, r.y + 10, r.w, 8); cx.fillRect(r.x, r.y + r.h - 18, r.w, 8);
    _star(cx, 78, r.y + r.h / 2, 52, '#d21c34'); _star(cx, 946, r.y + r.h / 2, 52, '#d21c34');
    _fit(cx, 'KAIJU HAVOC', 150, 740);
    cx.lineWidth = 14; cx.strokeStyle = '#06091c'; cx.strokeText('KAIJU HAVOC', 512, r.y + r.h / 2 + 6);
    cx.fillStyle = '#ffe9b8'; cx.fillText('KAIJU HAVOC', 512, r.y + r.h / 2 + 6);
  }
  // TITLE
  {
    const r = AT.TITLE;
    cx.fillStyle = '#b8202a'; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.fillStyle = '#0d1430'; cx.fillRect(r.x, r.y + 8, r.w, r.h - 16);
    _fit(cx, 'CHICAGO HEAVYWEIGHT CHAMPIONSHIP', 62, 980);
    cx.fillStyle = '#f2f0e6'; cx.fillText('CHICAGO HEAVYWEIGHT CHAMPIONSHIP', 512, r.y + r.h / 2 + 3);
  }
  // STRIP
  {
    const r = AT.STRIP;
    cx.fillStyle = '#10162e'; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.fillStyle = '#58b7e6'; cx.fillRect(r.x, r.y, r.w, 5); cx.fillRect(r.x, r.y + r.h - 5, r.w, 5);
    cx.font = FONT(38);
    for (let i = 0; i < 2; i++) {
      const x = 256 + i * 512;
      cx.fillStyle = '#f2f0e6'; cx.fillText('TITLE MATCH', x - 40, r.y + r.h / 2 + 2);
      _star(cx, x + 150, r.y + r.h / 2, 20, '#d21c34'); _star(cx, x - 226, r.y + r.h / 2, 20, '#d21c34');
    }
  }
  // HAZ
  {
    const r = AT.HAZ;
    cx.fillStyle = '#d8a81e'; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.fillStyle = '#16181c';
    for (let x = -40; x < r.w + 40; x += 64) { cx.beginPath(); cx.moveTo(x, r.y + r.h); cx.lineTo(x + 32, r.y + r.h); cx.lineTo(x + 72, r.y); cx.lineTo(x + 40, r.y); cx.closePath(); cx.fill(); }
    cx.fillStyle = '#000'; cx.fillRect(r.x + r.w, r.y, 1024 - r.w, r.h);
  }
  // FLAG
  {
    const r = AT.FLAG;
    cx.fillStyle = '#e9e7df'; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.fillStyle = '#58b7e6'; cx.fillRect(r.x, r.y + 38, r.w, 44); cx.fillRect(r.x, r.y + r.h - 82, r.w, 44);
    for (let i = 0; i < 4; i++) _star(cx, r.x + 100 + i * 104, r.y + r.h / 2, 36, '#d21c34');
  }
  // MAIN EVENT
  {
    const r = AT.MAIN;
    cx.fillStyle = '#b8202a'; cx.fillRect(r.x, r.y, r.w, r.h);
    cx.fillStyle = '#0d1430'; cx.fillRect(r.x + 12, r.y + 12, r.w - 24, r.h - 24);
    _fit(cx, 'MAIN EVENT', 110, 440);
    cx.fillStyle = '#ffe9b8'; cx.fillText('MAIN EVENT', r.x + r.w / 2, r.y + 96);
    _fit(cx, 'KAIJU vs KAIJU', 58, 420);
    cx.fillStyle = '#58b7e6'; cx.fillText('KAIJU vs KAIJU', r.x + r.w / 2, r.y + 186);
  }
  cx.restore();
}

/** The mat: the city flag as a ring canvas. Canvas x runs south -> north and
 *  y west -> east, so it reads the right way up from the lake side. */
function _paintMat(cx, px) {
  const U = px / (MAT * 2); // pixels per world unit
  cx.save(); cx.scale(U, U);
  const S = MAT * 2;
  // canvas
  cx.fillStyle = '#3d4b6b'; cx.fillRect(0, 0, S, S);
  // weave + wear
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S, y = Math.random() * S, l = 0.6 + Math.random() * 2.4;
    cx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(10,14,24,0.05)';
    if (i & 1) cx.fillRect(x, y, l, 0.09); else cx.fillRect(x, y, 0.09, l);
  }
  // the flag's two bars
  cx.fillStyle = '#2a77b3';
  cx.fillRect(0, S * 0.235, S, S * 0.105); cx.fillRect(0, S * 0.66, S, S * 0.105);
  cx.fillStyle = 'rgba(230,236,244,0.75)';
  for (const y of [0.235, 0.34, 0.66, 0.765]) cx.fillRect(0, S * y - 0.12, S, 0.24);
  // four stars
  for (let i = 0; i < 4; i++) {
    const x = S / 2 + (i - 1.5) * 16.5;
    _star(cx, x + 0.25, S / 2 + 0.3, 7.2, 'rgba(10,14,30,0.35)');
    _star(cx, x, S / 2, 7.2, '#e6e4da');
    _star(cx, x, S / 2, 6.3, '#c4162c');
  }
  // lettering
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  _fit(cx, 'KAIJU HAVOC', 13.5, 70);
  cx.fillStyle = '#e6e4da'; cx.fillText('KAIJU HAVOC', S / 2, S * 0.137);
  _fit(cx, 'CHICAGO HEAVYWEIGHT CHAMPIONSHIP', 6.2, 74);
  cx.fillStyle = '#e6e4da'; cx.fillText('CHICAGO HEAVYWEIGHT CHAMPIONSHIP', S / 2, S * 0.862);
  // corners: the player's (north-east: top right from the lake) and the rival's (south-west)
  const cs = 13;
  cx.fillStyle = 'rgba(43,98,192,0.55)'; cx.fillRect(S - 3.5 - cs, S - 3.5 - cs, cs, cs);
  cx.fillStyle = 'rgba(184,38,43,0.55)'; cx.fillRect(3.5, 3.5, cs, cs);
  cx.fillStyle = 'rgba(240,240,232,0.4)'; cx.fillRect(S - 3.5 - cs, 3.5, cs, cs); cx.fillRect(3.5, S - 3.5 - cs, cs, cs);
  // scuffs
  for (let i = 0; i < 70; i++) {
    const x = 6 + Math.random() * (S - 12), y = 6 + Math.random() * (S - 12), r = 1.5 + Math.random() * 5;
    const g = cx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,22,30,0.10)'); g.addColorStop(1, 'rgba(20,22,30,0)');
    cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // apron: navy border, inner white line where the ropes hang
  cx.fillStyle = '#0d1226';
  cx.fillRect(0, 0, S, 3.5); cx.fillRect(0, S - 3.5, S, 3.5); cx.fillRect(0, 0, 3.5, S); cx.fillRect(S - 3.5, 0, 3.5, S);
  cx.strokeStyle = '#e6e4da'; cx.lineWidth = 0.45; cx.strokeRect(3.5, 3.5, S - 7, S - 7);
  cx.strokeStyle = '#58b7e6'; cx.lineWidth = 0.3; cx.strokeRect(1.6, 1.6, S - 3.2, S - 3.2);
  cx.restore();
}

// The big screens' canvas (512 x 320 space): the main picture 512 x 256, a
// ticker strip 448 x 64 under it, and a dead panel for smashed screens.
const LED_MAIN = { x: 0, y: 0, w: 512, h: 256 }, LED_TICK = { x: 0, y: 256, w: 448, h: 64 }, LED_DEAD = { x: 452, y: 260, w: 56, h: 56 };
const ledUV = (r) => ({ u0: (r.x + 1) / 512, u1: (r.x + r.w - 1) / 512, v0: 1 - (r.y + r.h - 1) / 320, v1: 1 - (r.y + 1) / 320 });

function _makeLed(T) {
  const W = T.led, H = Math.round(T.led * 320 / 512), k = W / 512;
  const cv = _canvas(W, H), cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const S = {
    mode: 'idle', text: '', sub: '', until: 0, flash: 0, a: 'KAIJU', b: 'KAIJU', pips: [0, 0], heat: 0,
    ticker: 'KAIJU HAVOC  ★  CHICAGO HEAVYWEIGHT CHAMPIONSHIP  ★  LIVE FROM GRANT PARK  ★  ',
    acc: 1, dirty: true, tickW: 0,
  };
  const big = (text, y, px, maxW, fill, stroke) => {
    _fit(cx, text, px, maxW);
    if (stroke) { cx.lineWidth = px * 0.12; cx.strokeStyle = stroke; cx.strokeText(text, 256, y); }
    cx.fillStyle = fill; cx.fillText(text, 256, y);
  };
  const draw = (t) => {
    cx.save(); cx.scale(k, k);
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    // ---- main picture ----
    const fl = S.flash;
    cx.fillStyle = S.mode === 'count' ? '#2a0508' : S.mode === 'winner' ? '#1b1503' : '#060a1c';
    cx.fillRect(0, 0, 512, 256);
    // moving bars behind everything
    cx.fillStyle = S.mode === 'count' ? 'rgba(210,28,52,0.35)' : 'rgba(88,183,230,0.16)';
    for (let i = -1; i < 9; i++) {
      const x = ((i * 72 + t * 46) % 648) - 72;
      cx.beginPath(); cx.moveTo(x, 256); cx.lineTo(x + 30, 256); cx.lineTo(x + 110, 0); cx.lineTo(x + 80, 0); cx.closePath(); cx.fill();
    }
    if (S.mode === 'count') {
      big(S.text, 132, 250, 300, '#fff4d8', '#d21c34');
    } else if (S.mode === 'name') {
      big(S.sub, 52, 34, 470, '#58b7e6');
      big(S.text, 150, 120, 480, '#ffe9b8', '#0a0d20');
    } else if (S.mode === 'callout') {
      big(S.text, S.sub ? 112 : 128, 92, 480, '#ffe9b8', '#7a0f1c');
      if (S.sub) big(S.sub, 200, 40, 470, '#f2f0e6');
    } else if (S.mode === 'winner') {
      big(S.sub || 'WINNER', 58, 44, 470, '#f2f0e6');
      big(S.text, 156, 120, 480, '#ffd34a', '#3a2a00');
      for (let i = 0; i < 26; i++) {
        cx.fillStyle = ['#d21c34', '#58b7e6', '#ffd34a', '#f2f0e6'][i & 3];
        cx.fillRect((i * 97 + t * (30 + i * 3)) % 512, (i * 53 + t * (60 + i * 7)) % 256, 7, 4);
      }
    } else {
      // idle / versus: the card
      big('KAIJU HAVOC', 38, 44, 400, '#ffe9b8');
      cx.fillStyle = '#d21c34'; cx.fillRect(40, 64, 432, 4);
      big(S.a, 108, 62, 440, '#f2f0e6', '#0a0d20');
      big('VS', 152, 30, 80, '#58b7e6');
      big(S.b, 196, 62, 440, '#f2f0e6', '#0a0d20');
      // fall pips
      for (let s = 0; s < 2; s++) for (let i = 0; i < 2; i++) {
        cx.fillStyle = i < S.pips[s] ? '#ffd34a' : 'rgba(255,255,255,0.18)';
        cx.fillRect(s ? 440 + i * 22 : 36 + i * 22, s ? 188 : 100, 16, 16);
      }
    }
    // LIVE bug + crowd meter
    cx.fillStyle = Math.floor(t * 1.6) % 2 ? '#d21c34' : '#7a0f1c'; cx.fillRect(12, 228, 46, 18);
    cx.font = FONT(13); cx.fillStyle = '#fff'; cx.fillText('LIVE', 35, 238);
    for (let i = 0; i < 12; i++) {
      cx.fillStyle = i / 12 < S.heat ? (i > 8 ? '#d21c34' : '#58b7e6') : 'rgba(255,255,255,0.12)';
      cx.fillRect(412 + i * 7.6, 246 - 4 - i * 1.6, 5, 4 + i * 1.6);
    }
    if (fl > 0.02) { cx.fillStyle = `rgba(255,255,255,${Math.min(0.85, fl).toFixed(3)})`; cx.fillRect(0, 0, 512, 256); }
    // ---- ticker ----
    cx.fillStyle = '#0a0f26'; cx.fillRect(0, 256, 512, 64);
    cx.fillStyle = '#d21c34'; cx.fillRect(0, 256, 448, 5); cx.fillRect(0, 315, 448, 5);
    cx.save();
    cx.beginPath(); cx.rect(0, 261, 448, 54); cx.clip();
    cx.font = FONT(40); cx.textAlign = 'left';
    if (!S.tickW) S.tickW = Math.max(200, cx.measureText(S.ticker).width || 900);
    const off = (t * 70) % S.tickW;
    cx.fillStyle = fl > 0.3 ? '#fff' : '#ffe9b8';
    for (let x = -off; x < 448; x += S.tickW) cx.fillText(S.ticker, x, 290);
    cx.restore();
    // dead panel
    cx.fillStyle = '#020304'; cx.fillRect(448, 256, 64, 64);
    cx.fillStyle = '#1b2a3a'; cx.fillRect(470, 282, 3, 3); cx.fillStyle = '#3a0c10'; cx.fillRect(492, 300, 2, 6);
    cx.restore();
    tex.needsUpdate = true;
  };
  // (perf) Every mode drawn once while the level builds behind the loading
  // screen, each snapshotted so its drawing reaches the GPU: the first count
  // (250 px stroked text) and callout each cost a canvas raster program
  // build in play, 0.5-6.6 s with a cold driver cache, mid-match.
  if (typeof createImageBitmap === 'function') {
    for (const [mode, text, sub] of [['count', '3', ''], ['callout', 'FIGHT!', 'CHICAGO'], ['name', 'GORRAK', 'CHAMPION'], ['winner', 'GORRAK', '']]) {
      S.mode = mode; S.text = text; S.sub = sub; S.flash = 0.5; S.heat = 0.7;
      draw(1.3);
      createImageBitmap(cv).then((b) => b.close(), () => {});
    }
    S.mode = 'idle'; S.text = S.sub = ''; S.flash = 0; S.heat = 0;
  }
  draw(0);
  return {
    tex, state: S,
    /** Show something on the main screen for dur seconds (0 = until changed). */
    show(mode, text, sub, dur, time) { S.mode = mode; S.text = text || ''; S.sub = sub || ''; S.until = dur ? time + dur : 0; S.flash = 1; S.dirty = true; },
    setTicker(text) { if (S.ticker !== text) { S.ticker = text; S.tickW = 0; } },
    update(dtReal, time) {
      if (S.until && time > S.until) { S.until = 0; S.mode = 'idle'; S.dirty = true; }
      S.flash *= Math.exp(-dtReal * 5);
      S.acc += dtReal;
      if (S.acc < 1 / T.ledHz) return;
      S.acc = 0;
      draw(time);
    },
  };
}

let _assets = null;
/** Textures and materials, made once and kept across city rebuilds (the
 *  teardown frees geometry, never materials: their programs stay linked). */
function _getAssets(tier) {
  if (_assets && _assets.tier === tier) return _assets;
  const T = TIERS[tier];
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = tier === 2 ? 8 : 2; return t; };
  const atlasCv = _canvas(T.atlas, T.atlas), atlasECv = _canvas(T.atlas, T.atlas);
  _paintAtlas(atlasCv.getContext('2d'), T.atlas, false);
  _paintAtlas(atlasECv.getContext('2d'), T.atlas, true);
  const atlas = tex(atlasCv), atlasE = tex(atlasECv);
  const matCv = _canvas(T.matPx, T.matPx);
  _paintMat(matCv.getContext('2d'), T.matPx);
  const matTex = tex(matCv);
  const led = _makeLed(T);
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.78, metalness: 0 }, o));
  const struct = () => std({ map: atlas, emissiveMap: atlasE, emissive: 0xffffff, emissiveIntensity: 1 });
  // flash sprite
  const dot = _canvas(32, 32);
  {
    const cx = dot.getContext('2d'), g = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 32, 32);
  }
  const A = {
    tier, T, atlas, atlasE, matTex, led,
    mStruct: struct(),                                   // static steel, stands, signage
    mPost: [struct(), struct(), struct(), struct()],     // one per tower: its lamps flicker / die on their own
    mMat: std({ map: matTex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    mScreen: std({ map: led.tex, emissiveMap: led.tex, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.5 }),
    mBeam: _beamMaterial(),
    mFlash: new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: true, map: new THREE.CanvasTexture(dot), color: new THREE.Color(3.2, 3.2, 3.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    mRope: _ropeMaterial(), mPool: _poolMaterial(T),
    crowdU: festCrowdUniforms(),
  };
  A.mStruct.name = 'arena_struct'; A.mMat.name = 'arena_mat'; A.mScreen.name = 'arena_screen';
  A.mPost.forEach((m, i) => { m.name = 'arena_post' + i; });
  A.mCrowd = festCrowdMaterial(A.crowdU);
  return (_assets = A);
}

// ------------------------------------------------------------ shaders
/** The cables: one unlit mesh whose vertices are placed by the shader from
 *  the rope state (stretch round a body, twang, sag, snap and whip, ends
 *  riding the towers as they lean). */
function _ropeMaterial() {
  const v4s = (n) => Array.from({ length: n }, () => new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uRadius: { value: 0.21 }, uBright: { value: 1 },
      uOccA: { value: v4s(2) },  // per fighter: capsule end a xyz, radius (0 = none)
      uOccB: { value: v4s(2) },  // per fighter: capsule end b xyz
      uPush: { value: v4s(4) },  // per side: body centre u (0..1), half width, displacement (+ out), vibration
      uSnap: { value: v4s(4) },  // per side: snap time (< 0 = whole), break u, sag, glow
      uPost: { value: v4s(4) },  // per tower: lean dir x, z, sin, cos
      uEnds: { value: v4s(4) },  // per side: end towers ax, az, bx, bz
      // under the bloom threshold at rest: only a hit / snap flash blooms
      uCol: { value: [new THREE.Vector3(0.12, 0.42, 1.2), new THREE.Vector3(0.86, 0.84, 0.8), new THREE.Vector3(1.25, 0.17, 0.14)] },
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aFrame;  // outward normal x, z; t along the side; t of the segment's middle
      attribute vec3 aRing;   // cross-section cos, sin; side * 4 + rope
      uniform float uTime, uRadius;
      uniform vec4 uPush[4], uSnap[4], uPost[4], uEnds[4], uOccA[2], uOccB[2];
      uniform vec3 uCol[3];
      varying vec3 vCol;
      varying vec3 vTF;       // t, camera fade, glow
      varying float vA;       // opacity
      vec3 postOff(vec4 p, float y) { return vec3(p.x * y * p.z, y * (p.w - 1.0), p.y * y * p.z); }
      void main() {
        int id = int(aRing.z + 0.5);
        int side = id / 4;
        int rope = id - side * 4;
        float fr = float(rope);
        float t = aFrame.z, y0 = position.y;
        vec4 E = uEnds[side], S = uSnap[side], Pu = uPush[side];
        vec4 pa = uPost[side], pb = uPost[side == 3 ? 0 : side + 1];
        vec3 A = vec3(E.x, y0, E.y) + postOff(pa, y0);
        vec3 B = vec3(E.z, y0, E.w) + postOff(pb, y0);
        vec2 o2 = aFrame.xy;
        vec3 p;
        float bright = 1.0;
        if (S.x < 0.0) {
          p = mix(A, B, t);
          p.y -= S.z * 4.0 * t * (1.0 - t);
          // a body in the ropes: flat across its width, straight runs back to the towers
          float sh = clamp(min(t / max(Pu.x - Pu.y, 0.03), (1.0 - t) / max(1.0 - Pu.x - Pu.y, 0.03)), 0.0, 1.0);
          sh = mix(sh, sh * sh * (3.0 - 2.0 * sh), 0.4);
          float mid = rope == 1 ? 1.0 : 0.84;
          p.xz += o2 * (Pu.z * sh * mid + Pu.w * sin(t * 9.42478) * (rope == 1 ? 1.0 : -0.7));
          p.y += Pu.w * 0.35 * sin(t * 6.28318 + fr * 2.1);
        } else {
          // snapped: each half recoils to its own tower, drops and whips
          float tau = max(uTime - S.x - fr * 0.07, 0.0);
          float pb2 = step(S.y, aFrame.w);
          vec3 anchor = mix(A, B, pb2);
          vec3 run = mix(B - A, A - B, pb2);
          float len = length(run);
          run /= max(len, 0.001);
          float s = mix(t, 1.0 - t, pb2) * len;
          float q = s / max(mix(S.y, 1.0 - S.y, pb2) * len, 0.001);
          float k = 1.0 - exp(-tau * 2.6);
          float sr = s * (1.0 - 0.2 * k);
          float drop = max(anchor.y - 0.45 - fr * 0.14, 0.0);
          float hang = drop * smoothstep(0.0, max(drop * 0.95, 1.0), sr);
          float e = 1.0 - exp(-tau * 3.2) * cos(tau * 6.5);
          p = anchor + run * sr;
          p.y = anchor.y - hang * e + q * 5.0 * exp(-tau * 4.0) * sin(tau * 11.0 + q * 3.0);
          p.xz += o2 * (q * 8.5 * exp(-tau * 1.7) * sin(q * 7.0 - tau * 13.0) + Pu.z * (1.0 - q) * exp(-tau * 6.0));
          p.y = max(p.y, 0.45 + fr * 0.14);
          bright = 0.3 + 0.7 * exp(-tau * 1.5) + 0.35 * step(0.92, fract(sin(floor(uTime * 22.0) * 12.9898 + fr * 7.1) * 43758.5453)) * exp(-tau * 0.5);
        }
        // close to the lens a cable thins to a thread and is gone inside ~16 u; far across the ring it dims
        float cd = length(cameraPosition - p);
        float nearK = smoothstep(16.0, 50.0, cd);
        float farK = smoothstep(50.0, 115.0, cd);
        // a cable passing in front of a kaiju on screen gives way to it (the far side is hidden by depth anyway)
        float occ = 0.0;
        vec4 vp = viewMatrix * vec4(p, 1.0);
        if (vp.z < -0.5) {
          vec2 sp = vp.xy / -vp.z;
          for (int k = 0; k < 2; k++) {
            vec4 Oa = uOccA[k];
            if (Oa.w <= 0.0) continue;
            vec4 a = viewMatrix * vec4(Oa.xyz, 1.0), b = viewMatrix * vec4(uOccB[k].xyz, 1.0);
            float za = -a.z, zb = -b.z;
            if (max(za, zb) < 1.0) continue;
            vec2 sa = a.xy / max(za, 1.0), sb = b.xy / max(zb, 1.0), ab = sb - sa;
            float h = clamp(dot(sp - sa, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
            float zk = max(mix(za, zb, h), 1.0);
            if (-vp.z > zk - Oa.w * 0.25) continue;     // level with or behind the body
            float R = Oa.w / zk, d = length(sp - sa - ab * h);
            occ = max(occ, 1.0 - smoothstep(R * 0.75, R * 1.5, d));
          }
        }
        // never thicker on screen than ~0.35% of the frame height (a long lens would make the far side bars)
        float rw = min(uRadius * mix(0.3, 1.0, nearK) * (1.0 - 0.3 * farK), 0.0035 * max(-vp.z, 1.0) / projectionMatrix[1][1]);
        p += (vec3(o2.x, 0.0, o2.y) * aRing.x + vec3(0.0, aRing.y, 0.0)) * (rw * (1.0 - 0.35 * occ));
        vCol = uCol[rope] * bright * (1.0 - 0.45 * farK);
        vTF = vec3(t, nearK, S.w);
        vA = nearK * nearK * (1.0 - 0.45 * farK) * (1.0 - 0.82 * occ);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uBright;
      varying vec3 vCol;
      varying vec3 vTF;
      varying float vA;
      void main() {
        // chase lights running along the cable; a hit floods it white for a moment
        float band = 0.8 + 0.2 * sin(vTF.x * 160.0 - uTime * 5.0);
        vec3 c = vCol * band * uBright;
        float gl = clamp(vTF.z, 0.0, 1.0);
        c = mix(c, vec3(3.0), gl * 0.8) * (0.55 + 0.45 * vTF.y);
        gl_FragColor = vec4(c, clamp(vA + gl * 0.5 * vTF.y, 0.0, 1.0));
        if (gl_FragColor.a < 0.02) discard;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true, transparent: true, depthWrite: false,
  });
  mat.name = 'arena_ropes';
  return mat;
}

/** Light shafts: additive cones that are brightest seen through their middle,
 *  die away along their length and thin out close to the camera (a camera
 *  inside one must not see a veil). Per-instance colour carries the level. */
function _beamMaterial() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vC, vN, vV;
      varying float vL;
      void main() {
        vL = -position.y;
        mat4 im = modelMatrix * instanceMatrix;
        vec4 wp = im * vec4(position, 1.0);
        mat3 m3 = mat3(im);
        vec3 inv = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
        vN = m3 * (normal / inv);
        vV = cameraPosition - wp.xyz;
        vC = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vC, vN, vV;
      varying float vL;
      void main() {
        float d = length(vV);
        float f = abs(dot(normalize(vN), vV / d));
        float a = f * f * f * pow(1.0 - vL, 1.3) * smoothstep(0.0, 0.06, vL) * smoothstep(14.0, 70.0, d);
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  mat.name = 'arena_beams';
  return mat;
}

/** The pool of light: an overlay quad that multiplies the ground under the
 *  four towers' floods (dst * (1 + light)), minus a soft shadow per kaiju per
 *  tower. */
function _poolMaterial(T) {
  const v4s = (n) => Array.from({ length: n }, () => new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLamp: { value: v4s(4) },   // x, y, z of the bank; w: output (0 = dark)
      uBody: { value: v4s(2) },   // x, z, radius, height (0 = nobody)
      uAim: { value: new THREE.Vector2(A0.cx, A0.cz) },
      uTint: { value: new THREE.Vector3(1.0, 0.96, 0.86) },
      uGain: { value: 1 },
    },
    defines: { POOL_SHADOWS: T.shadows },
    vertexShader: `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec4 uLamp[4];
      uniform vec4 uBody[2];
      uniform vec2 uAim;
      uniform vec3 uTint;
      uniform float uGain;
      varying vec3 vW;
      void main() {
        vec3 g = vec3(vW.x, 0.0, vW.z);
        float sum = 0.0;
        for (int i = 0; i < 4; i++) {
          vec4 Lp = uLamp[i];
          vec3 L = Lp.xyz - g;
          float inv = inversesqrt(dot(L, L));
          vec3 dir = L * inv;
          vec3 aim = normalize(Lp.xyz - vec3(uAim.x, 0.0, uAim.y));
          float spot = smoothstep(0.78, 0.975, dot(dir, aim));
          float I = Lp.w * spot * dir.y * 2300.0 * inv * inv;
          #if POOL_SHADOWS > 0
          for (int k = 0; k < 2; k++) {
            vec4 Bd = uBody[k];
            if (Bd.w > 0.0) {
              vec2 away = Bd.xy - Lp.xz;
              float dh = length(away);
              away /= max(dh, 0.001);
              float len = min(Bd.w * dh / max(Lp.y - Bd.w, 7.0), 130.0);
              vec2 r = g.xz - Bd.xy;
              float al = clamp(dot(r, away), 0.0, len);
              float dd = length(r - away * al);
              float s = 1.0 - smoothstep(Bd.z * 0.5, Bd.z * 1.05 + al * 0.2, dd);
              I *= 1.0 - 0.88 * s * (1.0 - 0.55 * al / max(len, 1.0));
            }
          }
          #endif
          sum += I;
        }
        gl_FragColor = vec4(uTint * (sum * uGain), 1.0);
      }`,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  mat.name = 'arena_pool';
  return mat;
}

// ------------------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _s = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0);
const FACES = [ // unit cube faces: normal axis, then four corners (CCW from outside)
  [[1, 0, 0], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
  [[-1, 0, 0], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
  [[0, 1, 0], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
  [[0, -1, 0], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
  [[0, 0, 1], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
  [[0, 0, -1], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
];
/** Merged-mesh builder: boxes, bars and textured quads into one indexed geometry. */
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.idx = []; this.base = new THREE.Matrix4(); }
  /** Everything emitted after this is placed at (x, y, z), turned yaw about Y. */
  at(x = 0, y = 0, z = 0, yaw = 0) { this.base.makeRotationY(yaw).setPosition(x, y, z); return this; }
  _cube(M, cell, noBottom) {
    const [u, v] = cellUV(cell);
    _m2.multiplyMatrices(this.base, M);
    for (const f of FACES) {
      if (noBottom && f[0][1] === -1) continue;
      const b = this.p.length / 3;
      _v2.set(f[0][0], f[0][1], f[0][2]).transformDirection(_m2);
      for (let i = 1; i < 5; i++) {
        _v.set(f[i][0], f[i][1], f[i][2]).applyMatrix4(_m2);
        this.p.push(_v.x, _v.y, _v.z); this.n.push(_v2.x, _v2.y, _v2.z); this.uv.push(u, v);
      }
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  /** Axis-aligned box (in the current frame) centred at x, y, z; optional quaternion. */
  box(x, y, z, w, h, d, cell, quat = null, noBottom = false) {
    _m.compose(_v3.set(x, y, z), quat || _q.identity(), _s.set(w, h, d));
    this._cube(_m, cell, noBottom);
  }
  /** Square bar from a to b, t thick. */
  bar(ax, ay, az, bx, by, bz, t, cell) {
    _v.set(bx - ax, by - ay, bz - az);
    const len = _v.length();
    _q2.setFromUnitVectors(_Y, _v.divideScalar(len || 1));
    _m.compose(_v3.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q2, _s.set(t, len, t));
    this._cube(_m, cell);
  }
  /** Textured quad a (bottom left), b (bottom right), c (top right), d (top left) as seen from its front. */
  quad(a, b, c, d, r) {
    const base = this.p.length / 3, B = this.base;
    const P = [a, b, c, d].map((q) => new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(B));
    const nrm = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[3], P[0])).normalize();
    const uvs = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
    for (let i = 0; i < 4; i++) { this.p.push(P[i].x, P[i].y, P[i].z); this.n.push(nrm.x, nrm.y, nrm.z); this.uv.push(uvs[i][0], uvs[i][1]); }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return base;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const _mesh = (g, mat, cast = false) => {
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false; m.castShadow = cast; m.receiveShadow = true;
  return m;
};

/** One corner tower in its own frame: +Z looks at the ring centre. */
function _towerGeom(T, padCell) {
  const B = new Builder(), H = A0.towerH - 9, y0 = 2.6;
  // plinth
  B.box(0, 1.3, 0, 7.6, 2.6, 7.6, C.CONC, null, true);
  B.box(0, 2.35, 0, 7.8, 0.5, 7.8, C.YELLOW);
  // mast: four legs tapering in, rings and X-bracing
  const hw = (y) => 2.3 - 1.0 * (y - y0) / (H - y0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.bar(sx * hw(y0), y0, sz * hw(y0), sx * hw(H), H, sz * hw(H), 0.8, C.STEEL);
  for (let i = 0; i < T.bays; i++) {
    const ya = y0 + (H - y0) * i / T.bays, yb = y0 + (H - y0) * (i + 1) / T.bays, a = hw(ya), b = hw(yb);
    for (let f = 0; f < 4; f++) {
      // face f: corners (c0 -> c1) going round the mast
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], c0 = cs[f], c1 = cs[(f + 1) % 4];
      B.bar(c0[0] * b, yb, c0[1] * b, c1[0] * b, yb, c1[1] * b, 0.42, C.STEEL2);
      if (T.braces > 1 || (i + f) % 2 === 0) B.bar(c0[0] * a, ya, c0[1] * a, c1[0] * b, yb, c1[1] * b, 0.32, C.STEEL2);
      if (T.braces > 1 || (i + f) % 2 === 1) B.bar(c1[0] * a, ya, c1[1] * a, c0[0] * b, yb, c0[1] * b, 0.32, C.STEEL2);
    }
  }
  // turnbuckle pads on the ring side, a strap between them
  B.box(0, (A0.ropeY[0] + A0.ropeY[2]) / 2, 2.2, 1.6, A0.ropeY[2] - A0.ropeY[0] + 2, 1.0, C.BLACK);
  for (const y of A0.ropeY) {
    B.box(0, y, 3.0, 5.0, 3.7, 2.4, padCell);
    B.box(0, y, 4.25, 3.4, 2.5, 0.3, C.WHITE === padCell ? C.TRIM : C.WHITE);
    B.box(0, y, 1.9, 5.6, 0.7, 4.0, C.DARK); // the turnbuckle collar the ropes run into
  }
  // head: platform, the floodlight bank tilted down at the ring, a warning lamp
  B.box(0, H + 0.3, 0, 6.2, 0.6, 6.2, C.STEEL);
  const tilt = new THREE.Quaternion().setFromAxisAngle(_X, 0.5);
  const bc = new THREE.Vector3(0, H + 5.2, 1.4);
  B.box(bc.x, bc.y, bc.z, 13.5, 8.4, 1.5, C.HOUSING, tilt);
  B.box(0, H + 2.4, -0.6, 1.2, 4.6, 1.2, C.STEEL);
  const nx = T.rad >= 8 ? 6 : 4, ny = T.rad >= 8 ? 4 : 3;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const lx = (i - (nx - 1) / 2) * (12.4 / nx), ly = (j - (ny - 1) / 2) * (7.4 / ny);
    _v.set(lx, ly, 0.82).applyQuaternion(tilt).add(bc);
    B.box(_v.x, _v.y, _v.z, 12.4 / nx - 0.35, 7.4 / ny - 0.35, 0.22, C.LAMP, tilt);
  }
  B.box(0, H + 10.2, 0, 0.5, 2.4, 0.5, C.STEEL);
  B.box(0, H + 11.6, 0, 1.0, 1.0, 1.0, C.AVRED);
  return B.build();
}

// Spectators' shirts: the two corners' colours and a darker neutral mix (kept under the bloom threshold)
const FANS_BLUE = [0x2b62c0, 0x58b7e6, 0x1d3f8a, 0x2b62c0, 0xd8d8d0];
const FANS_RED = [0xc4162c, 0x8f1a20, 0xd8a81e, 0xc4162c, 0x1e2128];
const FANS_MIX = [0x1e2128, 0x2c3340, 0x6b7078, 0xd8d8d0, 0x3d4b6b, 0x8a5a2b, 0x4a6b3a, 0xb8492a];

/** One ringside spectator (~1.25 u, feet at the origin, facing +Z) as an indexed mesh. Vertex colours
 *  tell the crowd shader (chicago_fest.js) what each part is: white = shirt, (1, 2, 1) = an arm (shirt;
 *  swings up about the shoulder at x +-0.25, y 0.93), (0, 0, 2) = hair, (2, 0, 0) = the sign board and its
 *  pole (shown by a few); skin and trousers are varied per person. */
function _fanGeom() {
  const LEGS = [0.18, 0.2, 0.3], SHIRT = [1, 1, 1], ARM = [1, 2, 1], SKIN = [0.86, 0.68, 0.55], HAIR = [0, 0, 2], SIGN = [2, 0, 0];
  const parts = [ // w, h, d, x, y, z, colour
    [0.15, 0.5, 0.17, -0.085, 0.25, 0, LEGS], [0.15, 0.5, 0.17, 0.085, 0.25, 0, LEGS],
    [0.4, 0.46, 0.22, 0, 0.73, 0, SHIRT],
    [0.1, 0.44, 0.12, -0.25, 0.72, 0, ARM], [0.1, 0.44, 0.12, 0.25, 0.72, 0, ARM],
    [0.22, 0.22, 0.21, 0, 1.08, 0, SKIN], [0.25, 0.08, 0.24, 0, 1.2, -0.01, HAIR],
    [0.62, 0.42, 0.04, 0, 1.62, 0.08, SIGN], [0.04, 0.4, 0.04, 0, 1.3, 0.08, SIGN],
  ];
  const P = [], N = [], Cc = [], I = [];
  for (const [w, h, d, x, y, z, c] of parts) {
    const b = new THREE.BoxGeometry(w, h, d), p = b.attributes.position, n = b.attributes.normal, o = P.length / 3;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); N.push(n.getX(i), n.getY(i), n.getZ(i)); Cc.push(c[0], c[1], c[2]); }
    for (const k of b.index.array) I.push(k + o);
    b.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setIndex(I);
  return g;
}

/** Stand height (top of the tread) d units behind its front edge. */
const standH = (d) => STAND_H0 + Math.min(ROWS - 1, Math.max(0, Math.floor(d / ROW_D))) * ROW_H;

// ------------------------------------------------------------ builder
/**
 * Build the venue. o: { lite, glb, animators, grid, inside(x, z) (optional:
 * true inside the festival fence) }. Sets world.arena and returns it.
 */
export function buildArena(scene, world, o) {
  const tier = !o.glb ? 0 : o.lite ? 1 : 2;
  const AS = _getAssets(tier), T = AS.T;
  const cx = A0.cx, cz = A0.cz, H = A0.half;
  const rt = { tier, T, AS, scene };

  // ---- the mat ----
  {
    const g = new THREE.BufferGeometry();
    const y = 0.10, x0 = cx - MAT, x1 = cx + MAT, z0 = cz - MAT, z1 = cz + MAT;
    // canvas x: south -> north, canvas y: west -> east (see _paintMat)
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeBoundingSphere();
    const m = _mesh(g, AS.mMat);
    m.name = 'arena_mat';
    scene.add(m);
  }

  // ---- corner towers (nw, ne, se, sw: side i runs from tower i to tower i + 1) ----
  const posts = [];
  {
    const def = [['nw', -1, -1, 'neutral', C.WHITE], ['ne', 1, -1, 'player', C.BLUE], ['se', 1, 1, 'neutral', C.WHITE], ['sw', -1, 1, 'rival', C.RED]];
    const geoms = {};
    rt.postMesh = [];
    // phone LOW: the four towers are one instanced draw (same pads, lamps as one)
    const pim = tier ? null : new THREE.InstancedMesh(_towerGeom(T, C.WHITE), AS.mPost[0], 4);
    if (pim) { pim.name = 'arena_posts'; pim.frustumCulled = false; pim.castShadow = true; pim.receiveShadow = true; scene.add(pim); }
    /** A tower's transform changed (its quaternion was written): push it to the scene. */
    rt.postSync = (i) => { const m = rt.postMesh[i]; m.updateMatrix(); if (pim) { pim.setMatrixAt(i, m.matrix); pim.instanceMatrix.needsUpdate = true; } };
    def.forEach(([corner, sx, sz, role, pad], i) => {
      const x = cx + sx * H, z = cz + sz * H;
      let m;
      if (pim) m = new THREE.Object3D();
      else {
        const g = geoms[pad] || (geoms[pad] = _towerGeom(T, pad));
        m = _mesh(g, AS.mPost[i], true);
        m.name = 'arena_post_' + corner;
        m.frustumCulled = false; // it leans and falls
        scene.add(m);
      }
      m.matrixAutoUpdate = false;
      m.userData.yaw = Math.atan2(cx - x, cz - z);
      m.position.set(x, 0, z); m.rotation.y = m.userData.yaw;
      rt.postMesh.push(m);
      rt.postSync(i);
      posts.push({ i, x, z, r: 3.2, corner, role, up: true, hits: 0 });
    });
  }

  // ---- ropes ----
  const ropes = {};
  {
    const pos = [], frame = [], ring = [], idx = [];
    const ends = AS.mRope.uniforms.uEnds.value;
    SIDES.forEach((side, s) => {
      const a = posts[s], b = posts[(s + 1) % 4];
      const ax = (b.x - a.x) / (2 * H), az = (b.z - a.z) / (2 * H);
      // outward normal: away from the centre
      const mx = (a.x + b.x) / 2 - cx, mz = (a.z + b.z) / 2 - cz, ml = Math.hypot(mx, mz);
      const nx = mx / ml, nz = mz / ml;
      ends[s].set(a.x, a.z, b.x, b.z);
      ropes[side] = { side, up: true, hp: A0.ropeHits, maxHp: A0.ropeHits, nx, nz, ax, az, x0: a.x, z0: a.z, x1: b.x, z1: b.z, posts: [s, (s + 1) % 4] };
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < T.seg; i++) {
          const t0 = i / T.seg, t1 = (i + 1) / T.seg, tm = (t0 + t1) / 2;
          const base = pos.length / 3;
          for (const t of [t0, t1]) for (let k = 0; k < T.rad; k++) {
            const an = k / T.rad * Math.PI * 2;
            pos.push(a.x + (b.x - a.x) * t, A0.ropeY[r], a.z + (b.z - a.z) * t);
            frame.push(nx, nz, t, tm);
            ring.push(Math.cos(an), Math.sin(an), s * 4 + r);
          }
          for (let k = 0; k < T.rad; k++) {
            const k1 = (k + 1) % T.rad;
            idx.push(base + k, base + T.rad + k, base + T.rad + k1, base + k, base + T.rad + k1, base + k1);
          }
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFrame', new THREE.Float32BufferAttribute(frame, 4));
    g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 12, cz), 130);
    const m = new THREE.Mesh(g, AS.mRope);
    m.name = 'arena_ropes';
    m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 1;
    scene.add(m);
    rt.ropeMesh = m;
  }

  // ---- static structure: apron kerb, barricade, screen frames, gateway, runway ----
  const pyro = [], screens = [];
  const SB = new Builder();     // steel + signage (atlas)
  const LB = new Builder();     // LED faces (the screens' canvas); uv set per quad
  rt.ledQuads = [];             // { base (first of 4 verts), uv rect, x, y, z, r, dead }
  const ledQuad = (a, b, c, d, r, at) => {
    const base = LB.quad(a, b, c, d, ledUV(r));
    rt.ledQuads.push({ base, rect: r, x: at[0], y: at[1], z: at[2], r: at[3], dead: false });
  };
  {
    // kerb round the mat with the apron ribbon on its outer faces
    const k0 = MAT, kw = 1.9, kh = 1.15, strip = rectUV(AT.STRIP);
    for (let s = 0; s < 4; s++) {
      SB.at(cx, 0, cz, s * Math.PI / 2);
      // (frame: +Z out of the ring on this side)
      SB.box(0, kh / 2, k0 + kw / 2, 2 * (k0 + kw), kh, kw, C.NAVY, null, true);
      SB.box(0, kh + 0.04, k0 + kw / 2, 2 * (k0 + kw), 0.1, kw * 0.55, C.TRIM);
      const n = 4, w = 2 * k0 / n;
      for (let i = 0; i < n; i++) {
        const xa = -k0 + i * w + 0.4, xb = xa + w - 0.8;
        SB.quad([xa, 0.12, k0 + kw + 0.02], [xb, 0.12, k0 + kw + 0.02], [xb, kh - 0.05, k0 + kw + 0.02], [xa, kh - 0.05, k0 + kw + 0.02], strip);
      }
    }
    SB.at();
    // west barricade (gap for the rival's way in) with the ribbon on the ring side
    const bx = cx - 48;
    for (const [za, zb] of [[cz - MAT, cz - 8], [cz + 8, cz + MAT]]) {
      SB.box(bx, 0.75, (za + zb) / 2, 0.5, 1.5, zb - za, C.BLACK, null, true);
      const n = Math.max(1, Math.round((zb - za) / 12.5)), w = (zb - za) / n;
      for (let i = 0; i < n; i++) {
        const z0 = za + i * w + 0.2, z1 = z0 + w - 0.4;
        // facing +X (east): bottom-left is the south end
        SB.quad([bx + 0.27, 0.15, z1], [bx + 0.27, 0.15, z0], [bx + 0.27, 1.45, z0], [bx + 0.27, 1.45, z1], strip);
      }
    }
    // west screens: truss legs, a dark housing, the picture facing the ring, the logo on the back
    for (const sc of SCREENS_W) {
      const hw = SCREEN.w / 2, y0 = SCREEN.y0, y1 = y0 + SCREEN.h, xs = sc.x + 0.9;
      SB.box(sc.x, (y0 + y1) / 2, sc.z, 1.6, SCREEN.h + 1.6, SCREEN.w + 1.6, C.DARK);
      for (const s of [-1, 1]) {
        const lz = sc.z + s * (hw - 3);
        SB.box(sc.x - 0.2, y0 / 2, lz, 1.5, y0, 1.5, C.STEEL, null, true);
        SB.bar(sc.x - 0.2, 0.3, lz, sc.x - 5.5, 0.3, lz, 0.9, C.STEEL);
        SB.bar(sc.x - 5.2, 0.3, lz, sc.x - 0.2, y0 * 0.85, lz, 0.6, C.STEEL2);
        SB.box(sc.x - 5.5, 0.6, lz, 2.2, 1.2, 2.6, C.CONC, null, true);
      }
      SB.bar(sc.x - 0.2, y0 * 0.25, sc.z - hw + 3, sc.x - 0.2, y0 * 0.9, sc.z + hw - 3, 0.5, C.STEEL2);
      SB.bar(sc.x - 0.2, y0 * 0.9, sc.z - hw + 3, sc.x - 0.2, y0 * 0.25, sc.z + hw - 3, 0.5, C.STEEL2);
      // line of show lamps along the top
      for (let i = 0; i < 6; i++) SB.box(sc.x + 0.6, y1 + 1.2, sc.z - hw + 2.4 + i * (SCREEN.w - 4.8) / 5, 1.2, 1.0, 1.6, i % 2 ? C.LEDB : C.LAMP);
      ledQuad([xs, y0, sc.z + hw], [xs, y0, sc.z - hw], [xs, y1, sc.z - hw], [xs, y1, sc.z + hw], LED_MAIN, [sc.x, (y0 + y1) / 2, sc.z, 17]);
      // back (seen from Michigan Ave): logo over the flag
      const xb = sc.x - 0.82, lh = SCREEN.w * AT.LOGO.h / AT.LOGO.w;
      SB.quad([xb, y1 - lh - 0.4, sc.z - hw], [xb, y1 - lh - 0.4, sc.z + hw], [xb, y1 - 0.4, sc.z + hw], [xb, y1 - 0.4, sc.z - hw], rectUV(AT.LOGO));
      SB.quad([xb, y0 + 0.6, sc.z - 9], [xb, y0 + 0.6, sc.z + 9], [xb, y0 + 9.6, sc.z + 9], [xb, y0 + 9.6, sc.z - 9], rectUV(AT.FLAG));
      screens.push({ x: xs, y: (y0 + y1) / 2, z: sc.z, nx: 1, nz: 0, w: SCREEN.w, h: SCREEN.h });
      pyro.push({ x: sc.x, y: y1 + 2, z: sc.z - hw, kind: 'screen' }, { x: sc.x, y: y1 + 2, z: sc.z + hw, kind: 'screen' });
    }
    // gateway on the lake side: two pylons and a truss the kaiju walks under
    {
      const G = GATE;
      for (const s of [-1, 1]) {
        const pz = G.z + s * G.hw;
        SB.box(G.x, 1.5, pz, 8, 3, 8, C.CONC, null, true);
        SB.box(G.x, 2.7, pz, 8.2, 0.6, 8.2, C.YELLOW);
        SB.box(G.x, 3 + (G.top - 3) / 2, pz, 5, G.top - 3, 5, C.OXIDE);
        for (const [dx, dz] of [[2.55, 0], [-2.55, 0], [0, 2.55], [0, -2.55]]) SB.box(G.x + dx, 3 + (G.h - 6) / 2 + 1, pz + dz, dx ? 0.25 : 0.9, G.h - 6, dz ? 0.25 : 0.9, s > 0 ? C.LEDR : C.LEDB);
        SB.box(G.x, G.top + 0.5, pz, 6.4, 1, 6.4, C.STEEL);
        SB.box(G.x, G.top + 1.6, pz, 2.4, 1.2, 2.4, C.DARK);
        pyro.push({ x: G.x, y: G.top + 2.4, z: pz, kind: 'gate' });
      }
      // truss: chords, posts and diagonals on both faces
      const z0 = G.z - G.hw + 2.5, z1 = G.z + G.hw - 2.5, ya = G.h, yb = G.top - 0.4, n = 6;
      for (const dx of [-2.2, 2.2]) {
        SB.bar(G.x + dx, ya, z0, G.x + dx, ya, z1, 0.9, C.STEEL);
        SB.bar(G.x + dx, yb, z0, G.x + dx, yb, z1, 0.9, C.STEEL);
        for (let i = 0; i <= n; i++) {
          const z = z0 + (z1 - z0) * i / n;
          SB.bar(G.x + dx, ya, z, G.x + dx, yb, z, 0.5, C.STEEL2);
          if (i < n) { const zn = z0 + (z1 - z0) * (i + 1) / n; SB.bar(G.x + dx, i % 2 ? ya : yb, z, G.x + dx, i % 2 ? yb : ya, zn, 0.4, C.STEEL2); }
        }
      }
      SB.box(G.x, (ya + yb) / 2, G.z, 3.6, yb - ya - 1.2, z1 - z0 - 1, C.DARK);
      // marquee ticker facing the ring (west), the logo facing the lake (east)
      const xw = G.x - 2.75, xe = G.x + 2.75, mh = 5.2, my = (ya + yb) / 2, n2 = 2, mw = (z1 - z0) / n2;
      for (let i = 0; i < n2; i++) {
        const za = z0 + i * mw, zb = za + mw;
        // facing -X: bottom-left is the north end
        ledQuad([xw, my - mh / 2, za], [xw, my - mh / 2, zb], [xw, my + mh / 2, zb], [xw, my + mh / 2, za], LED_TICK, [G.x, my, (za + zb) / 2, 12]);
      }
      const lw = z1 - z0, lh = lw * AT.LOGO.h / AT.LOGO.w;
      SB.quad([xe, my - lh / 2, z1], [xe, my - lh / 2, z0], [xe, my + lh / 2, z0], [xe, my + lh / 2, z1], rectUV(AT.LOGO));
      screens.push({ x: xw, y: my, z: G.z, nx: -1, nz: 0, w: z1 - z0, h: mh });
    }
    // runway: deck, edge lines, stud lights, chevrons pointing at the ring
    {
      const R = RAMP, len = R.x1 - R.x0, xm = (R.x0 + R.x1) / 2;
      SB.box(xm, 0.11, R.z, len, 0.22, R.hw * 2, C.NAVY, null, true);
      for (const s of [-1, 1]) {
        SB.box(xm, 0.25, R.z + s * (R.hw - 0.5), len, 0.06, 0.7, C.TRIM, null, true);
        const n = tier ? 12 : 6;
        for (let i = 0; i < n; i++) {
          const x = R.x0 + 1 + (len - 2) * i / (n - 1);
          SB.box(x, 0.5, R.z + s * (R.hw + 0.5), 0.7, 0.8, 0.7, C.STUD, null, true);
          if (i % 4 === 1) pyro.push({ x, y: 1, z: R.z + s * (R.hw + 0.5), kind: 'ramp' });
        }
      }
      const hz = rectUV(AT.HAZ);
      for (let i = 0; i < 3; i++) {
        const xa = R.x0 + 2 + i * 7.4, xb = xa + 5.4;
        // lying flat, read from the lake end: left = south
        SB.quad([xb, 0.24, R.z + 4], [xb, 0.24, R.z - 4], [xa, 0.24, R.z - 4], [xa, 0.24, R.z + 4], { u0: hz.u0, u1: hz.u0 + (hz.u1 - hz.u0) * 0.5, v0: hz.v0, v1: hz.v1 });
      }
    }
    // stands' ribbon boards (the ticker) on posts behind the top row
    for (const st of STANDS) {
      const dir = st.zb > st.zf ? 1 : -1, zr = st.zb + dir * 0.4, ya = standH(100) + 1.5, yb = ya + 2.6;
      const n = Math.round((st.x1 - st.x0) / 14), w = (st.x1 - st.x0) / n;
      for (let i = 0; i <= n; i++) SB.box(st.x0 + i * w, yb / 2, zr + dir * 0.5, 0.7, yb, 0.7, C.STEEL, null, true);
      SB.box((st.x0 + st.x1) / 2, (ya + yb) / 2, zr + dir * 0.35, st.x1 - st.x0, yb - ya + 0.5, 0.5, C.DARK);
      for (let i = 0; i < n; i++) {
        const xa = st.x0 + i * w, xb = xa + w;
        // faces the ring: for the north stand that is +Z (left = west), for the south -Z (left = east)
        if (dir < 0) ledQuad([xa, ya, zr], [xb, ya, zr], [xb, yb, zr], [xa, yb, zr], LED_TICK, [(xa + xb) / 2, (ya + yb) / 2, zr, 8]);
        else ledQuad([xb, ya, zr], [xa, ya, zr], [xa, yb, zr], [xb, yb, zr], LED_TICK, [(xa + xb) / 2, (ya + yb) / 2, zr, 8]);
      }
      pyro.push({ x: st.x0, y: yb + 0.5, z: zr, kind: 'stand' }, { x: st.x1, y: yb + 0.5, z: zr, kind: 'stand' });
    }
    const sm = _mesh(SB.build(), AS.mStruct, true);
    sm.name = 'arena_structure';
    rt.structMesh = sm;
    scene.add(sm);
    const lg = LB.build();
    rt.ledGeom = lg;
    rt.ledUV0 = new Float32Array(lg.attributes.uv.array);
    rt.ledPos0 = new Float32Array(lg.attributes.position.array);
    const lm = _mesh(lg, AS.mScreen);
    lm.name = 'arena_screens';
    scene.add(lm);
  }
  for (const p of posts) pyro.push({ x: p.x, y: A0.towerH - 8, z: p.z, kind: 'post' });

  // ---- grandstands: one mesh, crushed on the CPU where bodies land ----
  // Crush field: 2 u cells over the venue, 0 = standing .. 0.93 = flat
  const CR = { x0: VEN.x0 - 4, z0: VEN.z0 - 4, cell: 2, nx: 0, nz: 0, data: null };
  CR.nx = Math.ceil((VEN.x1 + 4 - CR.x0) / CR.cell) + 1; CR.nz = Math.ceil((VEN.z1 + 4 - CR.z0) / CR.cell) + 1;
  CR.data = new Float32Array(CR.nx * CR.nz);
  const crushAt = (x, z) => {
    const fx = (x - CR.x0) / CR.cell, fz = (z - CR.z0) / CR.cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= CR.nx - 1 || iz >= CR.nz - 1) return 0;
    const tx = fx - ix, tz = fz - iz, d = CR.data, i = iz * CR.nx + ix;
    return (d[i] * (1 - tx) + d[i + 1] * tx) * (1 - tz) + (d[i + CR.nx] * (1 - tx) + d[i + CR.nx + 1] * tx) * tz;
  };
  /** Height of whatever people stand on at (x, z): a stand's tread, else the lawn. */
  const seatY = (x, z) => {
    for (const st of STANDS) {
      if (x < st.x0 || x > st.x1) continue;
      const d = st.zb > st.zf ? z - st.zf : st.zf - z;
      if (d >= 0 && d <= ROWS * ROW_D) return standH(d);
    }
    return 0;
  };
  {
    const B = new Builder();
    for (const st of STANDS) {
      const dir = st.zb > st.zf ? 1 : -1, n = Math.max(2, Math.round((st.x1 - st.x0) / T.standDx)), w = (st.x1 - st.x0) / n;
      const [tu, tv] = cellUV(C.TREAD), [ru, rv] = cellUV(st.colour), [wu, wv] = cellUV(C.STEEL3);
      const flat = (u, v) => ({ u0: u, u1: u, v0: v, v1: v });
      const strip = rectUV(AT.STRIP);
      for (let i = 0; i < n; i++) {
        const xa = st.x0 + i * w, xb = xa + w;
        // (xl, xr): left / right as seen from the ring, so every face winds toward it
        const xl = dir < 0 ? xa : xb, xr = dir < 0 ? xb : xa;
        // front wall with the ribbon
        B.quad([xl, 0, st.zf], [xr, 0, st.zf], [xr, STAND_H0, st.zf], [xl, STAND_H0, st.zf], i % 2 ? strip : flat(wu, wv));
        for (let r = 0; r < ROWS; r++) {
          const y = STAND_H0 + r * ROW_H, za = st.zf + dir * r * ROW_D, zb = st.zf + dir * (r + 1) * ROW_D;
          if (r) B.quad([xl, y - ROW_H, za], [xr, y - ROW_H, za], [xr, y, za], [xl, y, za], flat(ru, rv));
          B.quad([xl, y, za], [xr, y, za], [xr, y, zb], [xl, y, zb], flat(tu, tv));
        }
        // back wall
        const yt = standH(100);
        B.quad([xr, 0, st.zb], [xl, 0, st.zb], [xl, yt, st.zb], [xr, yt, st.zb], flat(wu, wv));
      }
      // end walls (stepped): one quad per row
      for (const [x, s] of [[st.x0, -1], [st.x1, 1]]) {
        for (let r = 0; r < ROWS; r++) {
          const y = STAND_H0 + r * ROW_H, za = st.zf + dir * r * ROW_D, zb = st.zf + dir * (r + 1) * ROW_D;
          if (s * dir < 0) B.quad([x, 0, za], [x, 0, zb], [x, y, zb], [x, y, za], flat(wu, wv));
          else B.quad([x, 0, zb], [x, 0, za], [x, y, za], [x, y, zb], flat(wu, wv));
        }
      }
    }
    rt.standPos0 = new Float32Array(B.p);
    if (tier) {
      const g = B.build();
      g.attributes.position.setUsage(THREE.DynamicDrawUsage);
      rt.standGeom = g;
      const m = _mesh(g, AS.mStruct, true);
      m.name = 'arena_stands';
      scene.add(m);
    } else {
      // phone LOW: the stands ride in the structure's draw (their vertices first, so the crush still finds them)
      const off = B.p.length / 3, sg = rt.structMesh.geometry;
      B.p.push(...sg.attributes.position.array); B.n.push(...sg.attributes.normal.array); B.uv.push(...sg.attributes.uv.array);
      for (const i of sg.index.array) B.idx.push(i + off);
      sg.dispose();
      const g = B.build();
      g.attributes.position.setUsage(THREE.DynamicDrawUsage);
      rt.standGeom = rt.structMesh.geometry = g;
    }
  }

  // ---- the audience: every seat faces the ring ----
  let crowd = null;
  {
    const seats = []; // x, z, y, scale
    const blocked = (x, z) => {
      let hit = false;
      if (o.grid) o.grid.forEachNear(x, z, 34, (b) => { if (!b.destroyed && Math.abs(x - b.x) < b.w / 2 + 0.6 && Math.abs(z - b.z) < b.d / 2 + 0.6) hit = true; });
      return hit;
    };
    for (const st of STANDS) {
      const dir = st.zb > st.zf ? 1 : -1;
      for (let r = 0; r < ROWS; r += T.rowStep) {
        for (let k = 0; k < T.ranks; k++) {
          const z = st.zf + dir * (r * ROW_D + (T.ranks > 1 ? 0.5 + k * 0.95 : 0.9));
          for (let x = st.x0 + 0.5 + Math.random() * T.dx * 0.5; x < st.x1 - 0.4; x += T.dx * (0.82 + Math.random() * 0.36)) {
            if (Math.random() > T.fill) continue;
            seats.push(x, z + (Math.random() - 0.5) * 0.3, STAND_H0 + r * ROW_H, T.scale);
          }
        }
      }
    }
    // standing room: west behind the barricade, the corners, the fountain plaza
    const zones = [
      [cx - 52.5, cz - MAT - 1, cx - 48.6, cz + MAT + 1, 0.42],
      [VEN.x0 + 1.5, STANDS[0].zb, STANDS[0].x0 - 1, cz - MAT - 1, 0.14],
      [VEN.x0 + 1.5, cz + MAT + 1, STANDS[1].x0 - 1, STANDS[1].zb, 0.14],
      [STANDS[0].x1 + 1.5, STANDS[0].zb + 2, MAT + cx + 3, cz - MAT - 3.5, 0.30],
    ];
    const wsum = zones.reduce((s, zn) => s + zn[4], 0);
    for (const zn of zones) {
      const want = Math.round(T.floor * zn[4] / wsum);
      for (let got = 0, tries = 0; got < want && tries < want * 12; tries++) {
        const x = zn[0] + Math.random() * (zn[2] - zn[0]), z = zn[1] + Math.random() * (zn[3] - zn[1]);
        if (x < cx - 47 && Math.abs(z - cz) < 8) continue;                      // the rival's aisle
        if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r) continue;
        if ((o.inside && !o.inside(x, z)) || blocked(x, z)) continue;
        seats.push(x, z, 0, T.scale); got++;
      }
    }
    const count = seats.length / 4;
    if (count) {
      const im = new THREE.InstancedMesh(_fanGeom(), AS.mCrowd, count);
      im.name = 'arena_crowd';
      const pts = new Float32Array(count * 2), by = new Float32Array(count), yaw = new Float32Array(count), sc = new Float32Array(count);
      const col = new THREE.Color();
      for (let i = 0; i < count; i++) {
        pts[i * 2] = seats[i * 4]; pts[i * 2 + 1] = seats[i * 4 + 1]; by[i] = seats[i * 4 + 2];
        yaw[i] = Math.atan2(cx - pts[i * 2], cz - pts[i * 2 + 1]) + (Math.random() - 0.5) * 0.5;
        // seated rows look straight across; the corners turn to the centre
        if (by[i] > 0) yaw[i] = (pts[i * 2 + 1] < cz ? 0 : Math.PI) + (Math.random() - 0.5) * 0.5 + Math.max(-0.5, Math.min(0.5, (cx - pts[i * 2]) / 90)) * (pts[i * 2 + 1] < cz ? 1 : -1);
        sc[i] = seats[i * 4 + 3] * (0.9 + Math.random() * 0.25);
        // half wear their corner's colours (blue toward the player's north-east post, red toward the rival's south-west)
        const blue = (pts[i * 2] - cx) - (pts[i * 2 + 1] - cz) + (Math.random() - 0.5) * 70 > 0;
        const pal = Math.random() < 0.5 ? (blue ? FANS_BLUE : FANS_RED) : FANS_MIX;
        im.setColorAt(i, col.setHex(pal[Math.floor(Math.random() * pal.length)]));
      }
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = false; // people are moved by the shader (fear, the wave)
      scene.add(im);
      crowd = { im, pts, alive: new Uint8Array(count).fill(1), uTime: AS.crowdU.uTime, by, yaw, sc, count };
      const arr = im.instanceMatrix.array;
      /** Write spectator i's matrix: standing, or flattened where it stood. */
      const place = (i) => {
        const o16 = i * 16, s = sc[i], c = Math.cos(yaw[i]) * s, sn = Math.sin(yaw[i]) * s, x = pts[i * 2], z = pts[i * 2 + 1];
        const flat = !crowd.alive[i], k = flat ? 1.6 : 1;
        const y = by[i] * (1 - crushAt(x, z)) + 0.04;
        arr[o16] = c * k; arr[o16 + 1] = 0; arr[o16 + 2] = -sn * k; arr[o16 + 3] = 0;
        arr[o16 + 4] = 0; arr[o16 + 5] = flat ? s * 0.04 : s; arr[o16 + 6] = 0; arr[o16 + 7] = 0;
        arr[o16 + 8] = sn * k; arr[o16 + 9] = 0; arr[o16 + 10] = c * k; arr[o16 + 11] = 0;
        arr[o16 + 12] = x; arr[o16 + 13] = y; arr[o16 + 14] = z; arr[o16 + 15] = 1;
      };
      crowd.place = place;
      for (let i = 0; i < count; i++) place(i);
      im.instanceMatrix.needsUpdate = true;
      // Stomped / slammed spectators flatten like the festival's (game.js damageInRadius -> world.crowdHit);
      // a hit on a grandstand also caves it in under them
      const prev = world.crowdHit;
      world.crowdHit = (x, z, r2) => {
        let n = prev ? prev(x, z, r2) : 0;
        if (x < VEN.x0 - 30 || x > VEN.x1 + 30 || z < VEN.z0 - 30 || z > VEN.z1 + 30) return n;
        const r = Math.sqrt(r2);
        const caved = seatY(x, z) > 0 || seatY(x + r * 0.6, z) > 0 || seatY(x - r * 0.6, z) > 0 || seatY(x, z + r * 0.6) > 0 || seatY(x, z - r * 0.6) > 0;
        if (caved) rt.crush(x, z, r);
        const ro = caved ? (r * 1.3 + 3) * (r * 1.3 + 3) : r2;
        let dirty = false;
        for (let i = 0; i < count; i++) {
          const dx = pts[i * 2] - x, dz = pts[i * 2 + 1] - z, d2 = dx * dx + dz * dz;
          if (d2 > ro) continue;
          if (d2 <= r2 && crowd.alive[i]) { crowd.alive[i] = 0; n++; }
          else if (!caved) continue;
          place(i); dirty = true;
        }
        if (dirty) im.instanceMatrix.needsUpdate = true;
        if (n) rt.crushed += n;
        return n;
      };
    }
  }
  rt.crushed = 0;
  rt.crushField = CR;
  /** Cave the stands in around (x, z): raises the crush field and re-seats the stand mesh. */
  rt.crush = (x, z, r) => {
    const d = CR.data, R = r * 1.25 + 1;
    const ix0 = Math.max(0, Math.floor((x - R - CR.x0) / CR.cell)), ix1 = Math.min(CR.nx - 1, Math.ceil((x + R - CR.x0) / CR.cell));
    const iz0 = Math.max(0, Math.floor((z - R - CR.z0) / CR.cell)), iz1 = Math.min(CR.nz - 1, Math.ceil((z + R - CR.z0) / CR.cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const dx = CR.x0 + ix * CR.cell - x, dz = CR.z0 + iz * CR.cell - z, dd = Math.sqrt(dx * dx + dz * dz);
      let k = 1 - (dd - r * 0.55) / (R - r * 0.55);
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      const v = 0.93 * k * k * (3 - 2 * k), i = iz * CR.nx + ix;
      if (v > d[i]) d[i] = v;
    }
    rt.reseat(x - R - 2, z - R - 2, x + R + 2, z + R + 2);
  };
  /** Re-place the stand vertices (and ribbon boards) inside a rectangle from the crush field. */
  rt.reseat = (x0, z0, x1, z1) => {
    const g = rt.standGeom, p = g.attributes.position.array, p0 = rt.standPos0;
    for (let i = 0; i < p0.length; i += 3) {
      const x = p0[i], z = p0[i + 2];
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const c = crushAt(x, z);
      // broken, not just lower: a little shear that grows with the damage
      const j = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, h = j - Math.floor(j);
      p[i] = x + (h - 0.5) * 1.6 * c; p[i + 1] = p0[i + 1] * (1 - c * (0.86 + 0.14 * h)); p[i + 2] = z + (0.5 - h) * 1.6 * c;
    }
    g.attributes.position.needsUpdate = true;
    for (const q of rt.ledQuads) {
      if (q.dead || q.rect !== LED_TICK || q.x < x0 || q.x > x1 || q.z < z0 - 2 || q.z > z1 + 2) continue;
      if (crushAt(q.x, q.z + (q.z < cz ? 1.5 : -1.5)) > 0.4) rt.smashScreen(q, true);
    }
  };
  /** Kill one LED face: dead-panel UVs, and (ribbon boards) drop it to the ground. */
  rt.smashScreen = (q, drop) => {
    if (q.dead) return false;
    q.dead = true;
    const g = rt.ledGeom, uv = g.attributes.uv.array, r = ledUV(LED_DEAD), b = q.base * 2;
    uv[b] = r.u0; uv[b + 1] = r.v0; uv[b + 2] = r.u1; uv[b + 3] = r.v0; uv[b + 4] = r.u1; uv[b + 5] = r.v1; uv[b + 6] = r.u0; uv[b + 7] = r.v1;
    g.attributes.uv.needsUpdate = true;
    if (drop) {
      const p = g.attributes.position.array, o3 = q.base * 3, y0 = rt.ledPos0[o3 + 1];
      for (let k = 0; k < 4; k++) p[o3 + k * 3 + 1] = rt.ledPos0[o3 + k * 3 + 1] - y0 + 0.4;
      g.attributes.position.needsUpdate = true;
    }
    return true;
  };
  /** Everything wrecked goes back up (a new match in the same city). */
  rt.restore = () => {
    CR.data.fill(0);
    rt.standGeom.attributes.position.array.set(rt.standPos0); rt.standGeom.attributes.position.needsUpdate = true;
    rt.ledGeom.attributes.uv.array.set(rt.ledUV0); rt.ledGeom.attributes.uv.needsUpdate = true;
    rt.ledGeom.attributes.position.array.set(rt.ledPos0); rt.ledGeom.attributes.position.needsUpdate = true;
    for (const q of rt.ledQuads) q.dead = false;
    if (crowd) { crowd.alive.fill(1); for (let i = 0; i < crowd.count; i++) crowd.place(i); crowd.im.instanceMatrix.needsUpdate = true; }
    rt.crushed = 0;
  };

  // ---- pool of light ----
  {
    const g = new THREE.PlaneGeometry(210, 210);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, AS.mPool);
    m.name = 'arena_pool';
    m.position.set(cx, 0.13, cz); m.matrixAutoUpdate = false; m.updateMatrix();
    m.renderOrder = -0.5; m.frustumCulled = false;
    scene.add(m);
    rt.pool = m;
  }
  // lamp banks (world): where the floods shine from
  rt.lamps = posts.map((p) => {
    const yaw = Math.atan2(cx - p.x, cz - p.z);
    return { x: p.x + Math.sin(yaw) * 1.6, y: A0.towerH - 3.6, z: p.z + Math.cos(yaw) * 1.6, on: 1 };
  });

  // ---- beams: a soft cone from every bank, plus movers that sweep the crowd (not on phone LOW) ----
  if (tier) {
    const g = new THREE.CylinderGeometry(0.03, 0.55, 1, tier ? 14 : 8, 1, true);
    g.translate(0, -0.5, 0); // apex at the origin, opening down -Y
    const movers = [];
    const mv = (x, y, z, hue) => movers.push({ x, y, z, hue, ph: Math.random() * 6.28 });
    if (T.movers >= 4) {
      mv(GATE.x, GATE.top + 2, GATE.z - GATE.hw, 0.58); mv(GATE.x, GATE.top + 2, GATE.z + GATE.hw, 0.0);
      mv(SCREENS_W[0].x, SCREEN.y0 + SCREEN.h + 2, SCREENS_W[0].z, 0.0); mv(SCREENS_W[1].x, SCREEN.y0 + SCREEN.h + 2, SCREENS_W[1].z, 0.58);
    }
    if (T.movers >= 6) { mv(STANDS[0].x0, 13, STANDS[0].zb, 0.12); mv(STANDS[1].x1, 13, STANDS[1].zb, 0.12); }
    const n = 4 + movers.length;
    const im = new THREE.InstancedMesh(g, AS.mBeam, n);
    im.name = 'arena_beams';
    im.frustumCulled = false; im.castShadow = false; im.renderOrder = 2;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, _m.makeScale(0, 0, 0)); im.setColorAt(i, new THREE.Color(0, 0, 0)); }
    scene.add(im);
    rt.beams = im; rt.movers = movers;
  }

  // ---- phone flashes in the crowd ----
  {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(T.flashes * 3);
    for (let i = 0; i < T.flashes; i++) p[i * 3 + 1] = -50;
    g.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 5, cz), 140);
    const pm = new THREE.Points(g, AS.mFlash);
    pm.name = 'arena_flashes';
    pm.frustumCulled = false; pm.renderOrder = 3;
    scene.add(pm);
    rt.flash = { pts: pm, pos: p, ttl: new Uint8Array(T.flashes), live: 0, cursor: 0 };
  }

  // casters for the look layer's shadow map, shot positions for the camera, launch points for pyro
  const casters = posts.map((p) => ({ x: p.x, z: p.z, w: 5, d: 5, h: A0.towerH - 9 }));
  for (const st of STANDS) casters.push({ x: (st.x0 + st.x1) / 2, z: (st.zf + st.zb) / 2, w: st.x1 - st.x0, d: Math.abs(st.zb - st.zf), h: 7 });
  for (const s of [-1, 1]) casters.push({ x: GATE.x, z: GATE.z + s * GATE.hw, w: 5, d: 5, h: GATE.top });
  for (const sc of SCREENS_W) casters.push({ x: sc.x, z: sc.z, w: 1.6, d: SCREEN.w, h: SCREEN.y0 + SCREEN.h });

  // ---- foreign objects: steel girders (one instanced draw for all of them; spots.js places them, held or lying) ----
  let weapons = null;
  {
    // an I-beam in construction yellow (it has to read in a kaiju's fist against sky, mat and crowd), riveted plates, a torn end
    const B = new Builder(), L = 28;
    B.box(0, 1.35, 0, L, 0.45, 3.0, C.YELLOW); B.box(0, -1.35, 0, L, 0.45, 3.0, C.YELLOW); B.box(0, 0, 0, L, 2.3, 0.5, C.YELLOW);
    for (let i = 0; i < 5; i++) B.box(-L / 2 + 1.5 + i * (L - 3) / 4, 0, 0, 0.4, 2.3, 2.7, C.STEEL3); // stiffeners
    B.box(L / 2 - 0.5, 0, 0, 1.0, 3.3, 3.3, C.DARK); // the torn end
    B.box(-L / 2 + 0.3, 0, 0, 0.6, 3.1, 3.1, C.STEEL3); // the grip end's plate
    const im = new THREE.InstancedMesh(B.build(), AS.mStruct, 4);
    im.name = 'arena_weapons';
    im.frustumCulled = false; im.castShadow = !!tier; im.receiveShadow = true;
    const z0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 4; i++) im.setMatrixAt(i, z0);
    scene.add(im);
    weapons = { mesh: im, length: L };
  }

  _resetUniforms(rt, posts);
  world.arena = {
    cx, cz, half: H, postH: A0.postH, ropeY: A0.ropeY, clearHalf: A0.clearHalf,
    matHalf: MAT, matY: 0.10, towerH: A0.towerH, ropeGive: A0.ropeGive, ropeHits: A0.ropeHits,
    posts, ropes, crowd,
    stands: STANDS.map((st) => ({ id: st.id, x0: st.x0, x1: st.x1, z0: Math.min(st.zf, st.zb), z1: Math.max(st.zf, st.zb), h: standH(100) })),
    ramp: { x0: RAMP.x0, x1: RAMP.x1, z: RAMP.z, halfWidth: RAMP.hw },
    gate: { x: GATE.x, z: GATE.z, halfWidth: GATE.hw - 2.5, clearance: GATE.h, top: GATE.top },
    gaps: FEST_RING_GAPS,
    screens, pyro, casters, weapons,
    /** True where spectators stand or sit (for throw:land surface 'crowd'). */
    crowdAt(x, z) {
      if (seatY(x, z) > 0) return true;
      if (x > cx - 53 && x < cx - 48 && Math.abs(z - cz) < MAT && Math.abs(z - cz) > 8) return true;
      return false;
    },
    /** Top of the grandstand under (x, z) as it stands now (0 off the stands). */
    standHeight(x, z) { return seatY(x, z) * (1 - crushAt(x, z)); },
    _rt: rt,
  };
  return world.arena;
}

/** Rope / tower / lamp uniforms back to an intact ring. */
function _resetUniforms(rt, posts) {
  const R = rt.AS.mRope.uniforms;
  for (let s = 0; s < 4; s++) {
    R.uPush.value[s].set(0.5, 0.1, 0, 0);
    R.uSnap.value[s].set(-1, 0.5, 0, 0);
    R.uPost.value[s].set(0, 0, 0, 1);
  }
  const P = rt.AS.mPool.uniforms;
  rt.lamps.forEach((l, i) => { l.on = 1; P.uLamp.value[i].set(l.x, l.y, l.z, 1); });
  P.uBody.value[0].set(0, 0, 0, 0); P.uBody.value[1].set(0, 0, 0, 0);
  if (rt.postMesh) rt.postMesh.forEach((m, i) => { m.quaternion.setFromAxisAngle(_Y, m.userData.yaw); rt.postSync(i); if (posts) { posts[i].up = true; posts[i].hits = 0; } });
}

// ------------------------------------------------------------ runtime
/** Runtime side. @returns {{ start, update, updateIdle, dispose, info, qa }} */
export function createArena(ctx, W) {
  const offs = [];
  const info = () => ctx.world.arena || null;
  // per side: rope spring; per fighter per side: how the body sits in the ropes
  const rope = SIDES.map(() => ({ d: 0, v: 0, u: 0.5, w: 0.1, vib: 0, vibPh: 0, glow: 0, snapT: -1, snapU: 0.5, sag: 0, held: false }));
  const hold = [0, 1].map(() => SIDES.map(() => ({ st: 0, from: 1 })));
  const post = [0, 1, 2, 3].map(() => ({ dx: 0, dz: 0, ang: 0, vel: 0, rest: 0, fallen: false, landed: false, flick: 0 }));
  const cr = { defense: 0, hype: 0.25, heat: 0.2, dir: -1, pop: 0, flash: 0, waveAmp: 0, waveAng: 0, waveCd: 6, celebrate: 0, shockS: 0, land: { x: 0, z: 0, s: 0 } };
  const col = new THREE.Color(), dirV = new THREE.Vector3(), posV = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), qB = new THREE.Quaternion(), sclV = new THREE.Vector3(), mB = new THREE.Matrix4();
  const occA = new THREE.Vector3(), occB = new THREE.Vector3(), occD = new THREE.Vector3(), camF = new THREE.Vector3();
  let showT = 0, lastCrushed = 0;

  const fighters = () => [W.player, W.rival];
  const now = () => ctx.world.time || 0;

  // ---- crowd cues ----
  /** Everybody up: k 0..1. */
  const pop = (k, flash = k) => { cr.pop = Math.max(cr.pop, Math.min(1, k)); cr.heat = Math.min(1, cr.heat + 0.25 * k); cr.flash = Math.max(cr.flash, Math.min(1, flash)); };
  /** A flinch spreading out from (x, z). */
  const shock = (x, z, k) => {
    const A = info();
    if (!A || !A._rt) return;
    A._rt.AS.crowdU.uShock.value.set(x, z, now(), Math.min(1.2, k));
  };
  /** Something heavy came down at (x, z): the people nearest scatter from it. */
  const scare = (x, z, k) => { cr.land.x = x; cr.land.z = z; cr.land.s = Math.min(1, k); };
  const led = () => { const A = info(); return A && A._rt ? A._rt.AS.led : null; };
  const show = (mode, text, sub, dur) => { const l = led(); if (l) l.show(mode, text, sub, dur, showT); };

  // ---- venue damage ----
  /** Smash any big screen within reach of (x, z). */
  const hitScreens = (x, z, reach) => {
    const A = info();
    if (!A || !A._rt) return;
    for (const q of A._rt.ledQuads) {
      if (q.dead || q.rect === LED_TICK) continue;
      if (Math.hypot(q.x - x, q.z - z) > q.r + reach) continue;
      if (A._rt.smashScreen(q, false)) {
        for (let i = 0; i < 3; i++) ctx.world.spawnSparks(new THREE.Vector3(q.x + 1, q.y + (i - 1) * 4, q.z + (Math.random() - 0.5) * 20), 10);
        ctx.world.spawnSmoke(new THREE.Vector3(q.x, q.y, q.z), 3);
      }
    }
  };
  const snapSide = (s, x, z) => {
    const A = info(), r = rope[s];
    if (!A || r.snapT >= 0) return;
    const R = A.ropes[SIDES[s]];
    R.up = false; R.hp = 0;
    const u = ((x - R.x0) * R.ax + (z - R.z0) * R.az) / (2 * A.half);
    r.snapT = now(); r.snapU = Math.max(0.12, Math.min(0.88, isFinite(u) ? u : 0.5)); r.glow = 1.2; r.held = false;
    for (const yy of A.ropeY) ctx.world.spawnSparks(new THREE.Vector3(R.x0 + (R.x1 - R.x0) * r.snapU, yy, R.z0 + (R.z1 - R.z0) * r.snapU), 8);
  };
  const postImpact = (i, impact, toppled, x, z) => {
    const A = info(), p = post[i];
    if (!A || !A.posts[i] || p.fallen) return;
    const P = A.posts[i];
    // away from the blow; a blow from nowhere pushes it out of the ring
    let dx = P.x - x, dz = P.z - z;
    if (!isFinite(dx) || !isFinite(dz) || Math.hypot(dx, dz) < 0.5 || Math.hypot(dx, dz) > 40) { dx = P.x - A.cx; dz = P.z - A.cz; }
    const l = Math.hypot(dx, dz) || 1;
    // blend the new direction into the lean it already has
    const k = p.rest > 0.01 ? 0.5 : 1;
    p.dx += (dx / l - p.dx) * k; p.dz += (dz / l - p.dz) * k;
    const n = Math.hypot(p.dx, p.dz) || 1; p.dx /= n; p.dz /= n;
    P.hits++;
    p.rest = Math.min(0.34, p.rest + 0.07 + 0.11 * impact);
    p.vel += 0.9 + 1.6 * impact;
    p.flick = 1.2 + impact;
    if (toppled) {
      p.fallen = true; P.up = false;
      // its two sides of rope go down with it
      for (const s of [(i + 3) % 4, i]) { const R = A.ropes[SIDES[s]]; R.up = false; R.hp = 0; rope[s].sag = Math.max(rope[s].sag, 3.5); rope[s].glow = 1; rope[s].held = false; }
      ctx.world.spawnSparks(new THREE.Vector3(P.x, 20, P.z), 16);
    }
  };

  // ---- events ----
  const on = (name, fn) => { if (name) offs.push(W.bus.on(name, fn)); };
  const bind = () => {
    on(EV.ROPE_REBOUND, (e) => {
      const s = SIDES.indexOf(e.side), A = info();
      if (s < 0 || !A) return;
      const R = A.ropes[e.side], r = rope[s];
      R.hp = e.ropeHp;
      const k = Math.min(1, (e.speed || 30) / 60);
      r.v += 22 * k; r.vib = Math.max(r.vib, 0.5 + 1.1 * k); r.glow = Math.max(r.glow, 0.5 + 0.6 * k);
      r.sag = (R.maxHp - Math.max(0, R.hp)) * 0.55;
      pop(0.25 + 0.3 * k, 0.3);
    });
    on(EV.ROPE_SNAP, (e) => {
      const s = SIDES.indexOf(e.side);
      if (s < 0) return;
      snapSide(s, e.x, e.z);
      shock(e.x, e.z, 0.7); pop(0.6, 1);
    });
    on(EV.POST_IMPACT, (e) => { postImpact(e.post | 0, e.impact || 0.5, !!e.toppled, e.x, e.z); shock(e.x, e.z, 0.6 + (e.toppled ? 0.5 : 0)); pop(e.toppled ? 0.9 : 0.4, 1); });
    on(EV.CROWD_INTENSITY, (e) => { cr.dir = e.level; });
    on(EV.CROWD_POP, (e) => {
      const k = 0.35 + 0.65 * (e.impact || 0.5);
      if (e.kind === 'boo') { cr.heat = Math.min(1, cr.heat + 0.1); cr.pop = Math.max(cr.pop, 0.15); }
      else if (e.kind === 'ooh' || e.kind === 'gasp') { shock(e.x || info().cx, e.z || info().cz, 0.5 + 0.5 * k); cr.flash = Math.max(cr.flash, 0.5 * k); }
      else pop(k);
    });
    on(EV.MATCH_START, (e) => {
      const l = led();
      if (l) { l.state.a = e.playerName || 'PLAYER'; l.state.b = e.rivalName || 'RIVAL'; l.state.pips[0] = 0; l.state.pips[1] = 0; l.state.dirty = true; }
      cr.defense = e.defense | 0;
      show('idle', '', '', 0);
    });
    on(EV.ENTRANCE_START, (e) => {
      // billing as the HUD's name cards have it: the first match is for the rival's belt, a defense for the player's
      const ms = W.match && W.match.state, defense = ms ? ms.defense > 0 : cr.defense > 0;
      show('name', e.name || '', (e.who === 'player') === defense ? 'THE CHAMPION' : 'THE CHALLENGER', 6); pop(0.7, 1); cr.waveCd = 0.5;
    });
    on(EV.ENTRANCE_BEAT, (e) => { cr.flash = Math.max(cr.flash, 0.8); if (e.beat === 'roar' || e.beat === 'pose' || e.beat === 'crash') pop(0.6, 1); });
    on(EV.BELL, (e) => { pop(e.kind === 'start' ? 0.8 : 0.6, 0.6); });
    on(EV.FALL_START, (e) => { show('callout', 'FALL ' + e.fall, 'RING THE BELL', 2.5); });
    on(EV.FALL_END, (e) => { const l = led(); if (l) { l.state.pips[0] = e.playerFalls; l.state.pips[1] = e.rivalFalls; } pop(1, 1); });
    on(EV.STRIKE_LANDED, (e) => { cr.heat = Math.min(1, cr.heat + 0.04 + 0.1 * e.impact); if (e.impact > 0.55 || e.counter) pop(0.25 + 0.4 * e.impact, 0.2); });
    on(EV.STRIKE_REVERSED, () => pop(0.5, 0.5));
    on(EV.POWER_HIT, (e) => { cr.heat = Math.min(1, cr.heat + 0.1); if (e.impact > 0.5) shock(e.x, e.z, 0.4 + 0.4 * e.impact); });
    on(EV.GRAB_START, () => { cr.heat = Math.min(1, cr.heat + 0.08); });
    on(EV.LIFT_START, () => pop(0.45, 0.7));
    on(EV.THROW_LAUNCH, () => { cr.flash = Math.max(cr.flash, 0.6); });
    on(EV.THROW_LAND, (e) => {
      const k = 0.4 + 0.6 * (e.impact || 0.5);
      shock(e.x, e.z, k); pop(0.5 + 0.5 * k, 0.8); scare(e.x, e.z, k);
      hitScreens(e.x, e.z, 6);
    });
    on(EV.KNOCKDOWN, (e) => { const k = 0.35 + 0.65 * (e.impact || 0.4); shock(e.x, e.z, k); pop(0.3 + 0.5 * k, 0.5); scare(e.x, e.z, k * 0.8); hitScreens(e.x, e.z, 2); });
    on(EV.BUILDING_IMPACT, (e) => { shock(e.x, e.z, 0.7); pop(0.6, 0.6); });
    on(EV.BUILDING_DESTROYED, (e) => { if (e.h > 18) shock(e.x, e.z, 0.35); });
    on(EV.PIN_START, () => { cr.heat = Math.min(1, cr.heat + 0.2); });
    on(EV.PIN_COUNT, (e) => { show('count', String(e.count), '', 1.1); pop(0.35 + 0.2 * e.count, 0.6 + 0.2 * e.count); });
    on(EV.PIN_KICKOUT, (e) => { show('callout', e.near ? '2.9!' : 'KICK OUT!', '', 1.6); shock(info().cx, info().cz, e.near ? 0.9 : 0.4); pop(e.near ? 1 : 0.5, 1); });
    on(EV.PIN_FALL, () => { pop(1, 1); cr.celebrate = Math.max(cr.celebrate, 4); });
    on(EV.SPOT_HIT, (e) => { shock(e.x, e.z, 0.8); pop(1, 1); });
    on(EV.TAUNT_START, () => { cr.flash = Math.max(cr.flash, 0.7); });
    on(EV.TAUNT_COMPLETE, () => { pop(0.8, 1); cr.waveCd = 0; });
    on(EV.FINISHER_START, (e) => { show('callout', e.name || 'FINISHER', '', 4); pop(0.7, 1); });
    on(EV.FINISHER_IMPACT, (e) => { shock(e.x, e.z, 1.2); pop(1, 1); scare(e.x, e.z, 1); hitScreens(e.x, e.z, (e.radius || 20) * 0.5); });
    on(EV.CALLOUT, (e) => { if (e.tier !== 'result') show('callout', e.text, e.sub, e.tier === 'finisher' ? 3.5 : 2.2); });
    on(EV.KO, (e) => { shock(e.x, e.z, 1); pop(1, 1); });
    on(EV.MATCH_OVER, (e) => {
      const f = e.winner && W[e.winner];
      const dfn = (e.defense | 0) > 0;
      show('winner', f ? f.name : 'WINNER', e.winner === 'player' ? (dfn ? 'AND STILL... CHAMPION' : 'AND NEW... CHAMPION') : dfn ? 'AND NEW... CHAMPION' : 'AND STILL... CHAMPION', 0);
      cr.celebrate = 30; pop(1, 1);
    });
    on(EV.INTERFERENCE_ARRIVE, () => { shock(info().cx, info().cz, 0.5); });
  };

  // ---- per frame ----
  const simRopes = (A, dt) => {
    const rt = A._rt, U = rt.AS.mRope.uniforms, F = fighters();
    for (let s = 0; s < 4; s++) {
      const R = A.ropes[SIDES[s]], r = rope[s];
      let target = 0, held = false;
      if (R.up && r.snapT < 0) {
        for (let f = 0; f < 2; f++) {
          const body = F[f], h = hold[f][s];
          if (!body || !body.root || !body.root.parent) { h.st = 0; continue; }
          const p = body.pos, rad = (body.radius || 12) * 0.8;
          const c = (p.x - A.cx) * R.nx + (p.z - A.cz) * R.nz;      // out from the centre across this side
          const t = ((p.x - R.x0) * R.ax + (p.z - R.z0) * R.az) / (2 * A.half);
          const near = Math.abs(c - A.half) < rad && t > -0.04 && t < 1.04 && p.y < A.ropeY[2] + 1.5;
          if (!near) { h.st = 0; h.from = c < A.half ? 1 : -1; continue; }
          if (h.st === 2) continue; // it has gone through: the ropes have slipped over it
          h.st = 1;
          const d = h.from > 0 ? Math.max(0, c + rad - A.half) : Math.min(0, c - rad - A.half);
          if (Math.abs(d) > A.ropeGive + 3.5) { h.st = 2; r.v += Math.sign(d) * -30; r.vib = Math.max(r.vib, 1.2); r.glow = Math.max(r.glow, 0.5); continue; }
          if (Math.abs(d) >= Math.abs(target)) { target = d; r.u = Math.max(0.06, Math.min(0.94, t)); r.w = Math.min(0.2, rad * 0.8 / (2 * A.half)); held = true; }
        }
      }
      if (dt > 0) {
        if (held) {
          const nd = r.d + (target - r.d) * Math.min(1, dt * 28);
          r.v = (nd - r.d) / dt; r.d = nd;
          r.glow = Math.max(r.glow, Math.min(0.6, Math.abs(r.d) / A.ropeGive * 0.5));
        } else {
          // free: a damped spring (the twang)
          if (r.held) r.vib = Math.max(r.vib, Math.min(1.5, Math.abs(r.d) * 0.16));
          const acc = -230 * r.d - 4.2 * r.v;
          r.v += acc * dt; r.d += r.v * dt;
        }
        r.held = held;
        r.vib *= Math.exp(-dt * 2.6); r.vibPh += dt * 34;
        r.glow *= Math.exp(-dt * 2.2);
      }
      U.uPush.value[s].set(r.u, r.w, r.d, r.vib * Math.sin(r.vibPh));
      U.uSnap.value[s].set(r.snapT, r.snapU, r.sag, r.glow);
    }
  };

  const simPosts = (A, dt, tod) => {
    const rt = A._rt, U = rt.AS.mRope.uniforms, PU = rt.AS.mPool.uniforms;
    const lampBase = 1.2 + 2.6 * tod;
    for (let i = 0; i < 4; i++) {
      const p = post[i], P = A.posts[i], m = rt.postMesh[i];
      if (dt > 0 && (p.fallen ? !p.landed : (Math.abs(p.ang - p.rest) > 1e-4 || Math.abs(p.vel) > 1e-4))) {
        if (p.fallen) {
          p.vel += (0.5 + 2.6 * Math.sin(p.ang)) * dt; p.ang += p.vel * dt;
          if (p.ang > 1.5) {
            p.ang = 1.5;
            if (p.vel > 0.5) {
              // it lands: dust, a shake, and whoever stood under it
              p.vel *= -0.22;
              const L = A0.towerH - 9;
              for (let k = 1; k <= 4; k++) {
                const x = P.x + p.dx * L * k / 4, z = P.z + p.dz * L * k / 4;
                ctx.fx.dustBurst(new THREE.Vector3(x, 0.3, z), 12, 6);
                if (ctx.world.crowdHit) ctx.world.crowdHit(x, z, 49);
              }
              ctx.shake(1.3, 0.6);
              shock(P.x + p.dx * L * 0.6, P.z + p.dz * L * 0.6, 1);
              hitScreens(P.x + p.dx * L * 0.8, P.z + p.dz * L * 0.8, 10);
            } else { p.vel = 0; p.landed = true; }
          }
        } else {
          const acc = -42 * (p.ang - p.rest) - 3.4 * p.vel;
          p.vel += acc * dt; p.ang += p.vel * dt;
          if (p.ang < 0) { p.ang = 0; p.vel = Math.abs(p.vel) * 0.3; }
        }
        // lean: about the horizontal axis square to the fall direction, then the tower's own yaw
        _q.setFromAxisAngle(_v.set(p.dz, 0, -p.dx), p.ang);
        m.quaternion.setFromAxisAngle(_Y, m.userData.yaw).premultiply(_q);
        rt.postSync(i);
        U.uPost.value[i].set(p.dx, p.dz, Math.sin(p.ang), Math.cos(p.ang));
      }
      // lamps: steady, flickering after a blow, dead once it is down
      if (p.flick > 0) p.flick = Math.max(0, p.flick - dt);
      let on = p.fallen ? 0 : 1;
      if (on && (p.flick > 0 || P.hits > 1) && Math.random() < (p.flick > 0 ? 0.45 : 0.04)) on = 0.25;
      const lamp = rt.lamps[i];
      lamp.on += (on - lamp.on) * (on < lamp.on ? 1 : 0.35);
      if (rt.tier) rt.AS.mPost[i].emissiveIntensity = lampBase * lamp.on;
      else if (i === 3) rt.AS.mPost[0].emissiveIntensity = lampBase * (rt.lamps[0].on + rt.lamps[1].on + rt.lamps[2].on + lamp.on) / 4;
      // the bank rides the mast as it leans
      const y = lamp.y, s = Math.sin(p.ang), c = Math.cos(p.ang);
      PU.uLamp.value[i].set(lamp.x + p.dx * y * s, Math.max(4, y * c), lamp.z + p.dz * y * s, lamp.on * (0.35 + 0.65 * tod));
    }
    rt.AS.mStruct.emissiveIntensity = 0.7 + 1.5 * tod;
  };

  const simCrowd = (A, dt, dtReal) => {
    const rt = A._rt, U = rt.AS.crowdU, F = fighters();
    // heat: our own reading of the action, overridden upward by the match director's level
    cr.heat = Math.max(0.12, cr.heat - dtReal * 0.05);
    cr.celebrate = Math.max(0, cr.celebrate - dtReal);
    const want = Math.max(cr.heat, cr.dir >= 0 ? cr.dir : 0, cr.celebrate > 0 ? 0.95 : 0);
    cr.hype += (want - cr.hype) * Math.min(1, dtReal * 2.5);
    cr.pop = cr.celebrate > 0 ? Math.max(cr.pop * Math.exp(-dtReal * 1.6), 0.45) : cr.pop * Math.exp(-dtReal * 1.6);
    cr.flash = cr.celebrate > 0 ? Math.max(cr.flash * Math.exp(-dtReal * 1.4), 0.5) : cr.flash * Math.exp(-dtReal * 1.4);
    U.uTime.value = now();
    U.uBounce.value.set(0.82 - 0.7 * cr.hype, 0.12 + 0.3 * cr.hype, 5 + 3.5 * cr.hype, cr.pop);
    U.uSigns.value = 0.035 + 0.05 * cr.hype;
    // the wave: now and then when things are calm enough to start one
    cr.waveCd -= dtReal;
    if (cr.waveAmp <= 0 && cr.waveCd <= 0 && cr.hype > 0.3) { cr.waveAmp = 1; cr.waveAng = Math.random() * 6.283; cr.waveTurn = 0; cr.waveCd = 14 + Math.random() * 12; }
    if (cr.waveAmp > 0) {
      const step = dtReal * 1.25;
      cr.waveAng += step; cr.waveTurn += step;
      if (cr.waveTurn > 6.283 * 1.5) cr.waveAmp = Math.max(0, cr.waveAmp - dtReal * 1.5);
    }
    U.uWave.value.set(A.cx, A.cz, cr.waveAng, cr.waveAmp);
    // fear: both kaiju, and the last heavy landing
    for (let f = 0; f < 2; f++) {
      const b = F[f], u = U.uFear.value[f];
      if (b && b.root && b.root.parent) u.set(b.pos.x, b.pos.z, 17 + (b.radius || 12) * 0.6, b.pos.y < 14 ? 1 : 0.35);
      else u.set(0, 0, 1, 0);
    }
    cr.land.s *= Math.exp(-dtReal * 0.55);
    U.uFear.value[2].set(cr.land.x, cr.land.z, 26, cr.land.s);
    const tod = _tod();
    U.uRing.value.set(A.cx, A.cz, 108, 0.16 + 0.5 * tod);
    // a body on the people: tell the bus once per burst
    if (rt.crushed !== lastCrushed) lastCrushed = rt.crushed;
  };

  const simBeams = (A, dtReal, tod) => {
    const rt = A._rt, im = rt.beams, t = showT;
    if (!im) return;
    // a lens looking up into the shafts (lift / win shots) would see them stack into a veil: they give way
    const cam = ctx.camera;
    let lookUp = 0;
    if (cam) { cam.getWorldDirection(camF); lookUp = Math.min(1, Math.max(0, (camF.y - 0.08) / 0.4)); lookUp *= lookUp * (3 - 2 * lookUp); }
    const veil = 1 - 0.85 * lookUp;
    for (let i = 0; i < 4; i++) {
      const l = rt.lamps[i], p = post[i];
      const y = l.y, s = Math.sin(p.ang), c = Math.cos(p.ang);
      posV.set(l.x + p.dx * y * s, Math.max(3, y * c), l.z + p.dz * y * s);
      // aimed at the middle of the ring (a leaning tower throws its beam wide)
      dirV.set(A.cx + p.dx * 60 * s - posV.x, -posV.y, A.cz + p.dz * 60 * s - posV.z);
      const len = dirV.length() * 1.06;
      qB.setFromUnitVectors(down, dirV.normalize());
      const rad = 21;
      sclV.set(rad / 0.55, len, rad / 0.55);
      im.setMatrixAt(i, mB.compose(posV, qB, sclV));
      // standing inside the cone: it fades rather than filling the frame
      let inside = 0;
      if (cam) {
        occD.subVectors(cam.position, posV);
        const along = occD.dot(dirV);
        if (along > 0 && along < len) {
          const radial = Math.sqrt(Math.max(0, occD.lengthSq() - along * along)), q = radial / (rad * along / len + 1e-3);
          inside = q < 0.6 ? 1 : q > 1.3 ? 0 : 1 - (q - 0.6) / 0.7;
        }
      }
      const k = l.on * (0.04 + 0.15 * tod) * (0.9 + 0.1 * Math.sin(t * 1.3 + i)) * veil * (1 - 0.7 * inside);
      im.setColorAt(i, col.setRGB(1.0 * k, 0.95 * k, 0.82 * k));
    }
    // movers: parked dim over the crowd, sweeping hard on a pop
    const live = Math.min(1, 0.14 + cr.pop * 1.4 + (cr.celebrate > 0 ? 0.6 : 0)) * (0.35 + 0.65 * tod) * veil;
    for (let j = 0; j < rt.movers.length; j++) {
      const mv = rt.movers[j];
      posV.set(mv.x, mv.y, mv.z);
      const sp = 0.45 + 0.9 * cr.hype, a = t * sp + mv.ph;
      // target wanders over the ring and the stands
      dirV.set(A.cx + Math.sin(a * 0.9) * 55 - mv.x, 6 + 26 * (0.5 + 0.5 * Math.sin(a * 0.63 + 1.7)) - mv.y + (cr.pop > 0.4 ? 40 : 0), A.cz + Math.cos(a * 0.7 + mv.ph) * 60 - mv.z);
      const len = Math.min(140, dirV.length() * 1.15);
      qB.setFromUnitVectors(down, dirV.normalize());
      sclV.set(7, len, 7);
      im.setMatrixAt(4 + j, mB.compose(posV, qB, sclV));
      col.setHSL(mv.hue, mv.hue === 0.12 ? 0.25 : 0.85, 0.5).multiplyScalar(0.55 * live);
      im.setColorAt(4 + j, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };

  const simFlashes = (A, dtReal) => {
    const rt = A._rt, fl = rt.flash, C2 = A.crowd;
    if (!C2 || (!fl.live && cr.flash < 0.03 && cr.hype < 0.5)) return;
    const n = fl.ttl.length;
    let dirty = false;
    for (let i = 0; i < n; i++) if (fl.ttl[i] && --fl.ttl[i] === 0) { fl.pos[i * 3 + 1] = -50; fl.live--; dirty = true; }
    // phones go off in proportion to the moment (a trickle whenever the crowd is hot)
    const rate = (cr.flash * 0.5 + Math.max(0, cr.hype - 0.5) * 0.08) * n * 60 * dtReal / 3;
    let spawn = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    while (spawn-- > 0) {
      const i = fl.cursor; fl.cursor = (fl.cursor + 1) % n;
      const k = Math.floor(Math.random() * C2.count);
      if (!C2.alive[k]) continue;
      if (!fl.ttl[i]) fl.live++;
      fl.ttl[i] = 2 + (Math.random() < 0.3 ? 1 : 0);
      fl.pos[i * 3] = C2.pts[k * 2]; fl.pos[i * 3 + 1] = C2.by[k] * (1 - 0) + 1.5 * C2.sc[k]; fl.pos[i * 3 + 2] = C2.pts[k * 2 + 1];
      dirty = true;
    }
    if (dirty) fl.pts.geometry.attributes.position.needsUpdate = true;
  };

  const _tod = () => {
    const t = LOOK.lookTime ? LOOK.lookTime() : 1;
    // floods are already on at golden hour and take over as the sun goes
    return 0.45 + 0.55 * Math.max(0, Math.min(1, t));
  };

  const frame = (dt, dtReal) => {
    const A = info();
    if (!A || !A._rt) return;
    const rt = A._rt, tod = _tod();
    showT += dtReal;
    simRopes(A, dt);
    simPosts(A, dt, tod);
    simCrowd(A, dt, dtReal);
    simBeams(A, dtReal, tod);
    simFlashes(A, dtReal);
    const RU = rt.AS.mRope.uniforms;
    RU.uTime.value = now();
    RU.uBright.value = 0.7 + 0.3 * tod;
    // each kaiju as a capsule (legs to head along its spine) the cables give way to on screen
    {
      const F = fighters();
      for (let f = 0; f < 2; f++) {
        const b = F[f], ua = RU.uOccA.value[f], ub = RU.uOccB.value[f];
        if (!b || !b.root || !b.root.parent || !b.root.visible) { ua.w = 0; continue; }
        const hips = b.bones && b.bones.hips, head = b.bones && b.bones.head, r = (b.radius || 12) * 0.95;
        if (hips && head) {
          hips.getWorldPosition(occA); head.getWorldPosition(occB);
          occD.subVectors(occB, occA);
          occA.addScaledVector(occD, -0.7); occB.addScaledVector(occD, 0.2);
        } else { occA.set(b.pos.x, b.pos.y + r * 0.5, b.pos.z); occB.set(b.pos.x, b.pos.y + (b.height || 30) * 1.2, b.pos.z); }
        ua.set(occA.x, occA.y, occA.z, r); ub.set(occB.x, occB.y, occB.z, 0);
      }
    }
    // the pool: shadows of whoever is standing in it
    const PU = rt.AS.mPool.uniforms, F = fighters();
    PU.uGain.value = (rt.tier ? 1.9 : 0.7) * (0.4 + 0.6 * tod);
    for (let f = 0; f < 2; f++) {
      const b = F[f], u = PU.uBody.value[f];
      if (b && b.root && b.root.parent && b.root.visible) u.set(b.pos.x, b.pos.z, (b.radius || 12) * 0.62, Math.max(6, (b.height || 30) * 0.92 * (b.state === 'downed' || b.state === 'pinned' || b.state === 'ko' ? 0.35 : 1) + b.pos.y));
      else u.set(0, 0, 0, 0);
    }
    const l = rt.AS.led;
    l.state.heat = cr.hype;
    l.update(dtReal, showT);
  };

  return {
    /** world.arena for the level in play (null outside the wrestling build). See notes/wrestling_api.md section 12. */
    get info() { return info(); },
    start() {
      const A = info();
      for (const r of rope) Object.assign(r, { d: 0, v: 0, u: 0.5, w: 0.1, vib: 0, vibPh: 0, glow: 0, snapT: -1, snapU: 0.5, sag: 0, held: false });
      for (const hs of hold) for (const h of hs) { h.st = 0; h.from = 1; }
      for (const p of post) Object.assign(p, { dx: 0, dz: 0, ang: 0, vel: 0, rest: 0, fallen: false, landed: false, flick: 0 });
      Object.assign(cr, { hype: 0.25, heat: 0.25, dir: -1, pop: 0, flash: 0, waveAmp: 0, waveAng: 0, waveTurn: 0, waveCd: 5, celebrate: 0 });
      cr.land.s = 0; lastCrushed = 0;
      if (A && A._rt) {
        for (const k of SIDES) { const R = A.ropes[k]; R.up = true; R.hp = R.maxHp; }
        A._rt.restore();
        _resetUniforms(A._rt, A.posts);
        A._rt.AS.crowdU.uShock.value.set(0, 0, -100, 0);
        const l = A._rt.AS.led;
        l.state.mode = 'idle'; l.state.until = 0; l.state.pips[0] = 0; l.state.pips[1] = 0;
      }
      bind();
    },
    update(dt, dtReal) { frame(dt, dtReal); },
    updateIdle(dtReal) { frame(0, dtReal); },
    dispose() { for (const off of offs) off(); offs.length = 0; },
    /** Test hooks (also the stand-ins until the combat core emits the events). */
    qa: {
      snap(side, u = 0.5) { const A = info(), s = SIDES.indexOf(side); if (A && s >= 0) { const R = A.ropes[side]; snapSide(s, R.x0 + (R.x1 - R.x0) * u, R.z0 + (R.z1 - R.z0) * u); } },
      postImpact(i, impact = 0.6, toppled = false, x = NaN, z = NaN) { postImpact(i, impact, toppled, x, z); },
      pop(k = 1) { pop(k); }, shock(x, z, k = 1) { shock(x, z, k); }, scare(x, z, k = 1) { scare(x, z, k); },
      wave() { cr.waveCd = 0; cr.waveAmp = 0; },
      show(mode, text, sub, dur = 3) { show(mode, text, sub, dur); },
      get state() { return { rope, post, crowd: cr }; },
    },
  };
}
