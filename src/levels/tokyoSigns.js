// Tokyo's commercial-block signage and street clutter (Ginza, Shimbashi, Yurakucho): the vertical blade signs
// (tategata kanban) stacked with one tenant per floor down the street faces of the pencil buildings, rooftop
// billboards on steel legs, a handful of big video screens over the main crossings, and the overhead wires strung
// pole to pole down the side streets.
//
// Everything is drawn from one canvas atlas made here (generic shop words - ramen, izakaya, karaoke, dentist, estate
// agent... - no brand names), merged into one unlit mesh (the signs glow at dusk; no lit program is added), plus one
// mesh for the screens (an animated canvas: abstract ads, a weather card and a KAIJU ALERT news ticker) and one
// LineSegments for the wires. Each building's signs are a vertex range collapsed the moment the building falls; a
// wire span the kaiju walks through snaps.
import * as THREE from 'three';

const ZONES = new Set(['ginza', 'shimbashi', 'yurakucho']);
const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo","Noto Sans JP","Noto Sans CJK JP","WenQuanYi Zen Hei",sans-serif';
// Tenants (generic trades only)
const BLADE_WORDS = ['ラーメン', '居酒屋', 'カラオケ', '焼肉', '寿司', '歯科', '不動産', 'カフェ', '喫茶', '麻雀', 'ホテル', '質', '薬局',
  '整体', '英会話', '学習塾', '眼科', '美容室', 'バー', 'スナック', '焼鳥', 'うどん', 'そば', '天ぷら', '中華', '定食', '酒場', '漫画',
  '金券', '両替', '鍼灸', '写真', '時計', '宝石', '画廊', '書店', '洋食', '鮨', 'もつ鍋', 'おでん', '割烹', '料亭', '内科', '皮膚科',
  '税理士', '司法書士', 'ネイル', 'マッサージ', '珈琲', 'ワイン', 'ビール', 'BAR', 'CAFE', '24H', 'HOTEL'];
const BOARD_WORDS = ['大衆酒場', '焼肉 食べ放題', 'カラオケ 全室禁煙', '24時間営業', 'ビアホール', '歯科医院', '英会話スクール', '賃貸 売買',
  'ホテル 空室あり', '金券 チケット', '中華料理', '回転寿司', '立ち飲み', '居酒屋 2F', 'KARAOKE', 'BAR & GRILL', 'CAFE 喫茶', 'OPEN 11:00',
  'もつ焼き', '天ぷら 割烹', 'パーキング', '貸会議室', 'クリニック', '時計 宝石', '画廊 GALLERY', '純喫茶', 'メガネ', '銀座 一丁目',
  '新橋 駅前', 'ラーメン 横丁'];
// (background, ink) pairs: the lit boxes are mostly white with coloured lettering, then the bold colour blocks
const PANELS = [['#f4f1e8', '#c8202a'], ['#f4f1e8', '#1d3f9a'], ['#f4f1e8', '#111111'], ['#f4f1e8', '#0f7a3a'], ['#d8262e', '#ffffff'],
  ['#f6c21c', '#151515'], ['#1d4fb8', '#ffffff'], ['#151515', '#f6d21c'], ['#0f7a3a', '#ffffff'], ['#e86a12', '#ffffff'],
  ['#e04a8a', '#ffffff'], ['#5a2a8a', '#ffe9a8'], ['#f4f1e8', '#e86a12'], ['#202838', '#7fe0ff'], ['#9a1a1a', '#ffe9a8']];
const A = 1024; // atlas size (px)
const STRIPS = 10, STRIP_W = 64; // vertical strips at x 0..639
const BOARD_X = 640, BOARD_W = 192, BOARD_H = 48, BOARD_ROWS = 20, BOARDS = 40; // horizontal boards: 2 columns x 20 rows at x 640..1023
const DARK = [1012 / A, 1 - 1012 / A]; // a dark pixel (frames, backs, edges)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function drawAtlas() {
  const c = makeCanvas(A, A), g = c.getContext('2d');
  const R = rng(20261122);
  g.fillStyle = '#141418'; g.fillRect(0, 0, A, A);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // Vertical strips: tenant panels stacked top to bottom, one word each, the characters set one under another
  for (let s = 0; s < STRIPS; s++) {
    const x0 = s * STRIP_W;
    let y = 3;
    while (y < A - 40) {
      const word = BLADE_WORDS[Math.floor(R() * BLADE_WORDS.length)];
      const chars = /^[A-Z0-9]+$/.test(word) ? [word] : [...word];
      const [bg, ink] = PANELS[Math.floor(R() * PANELS.length)];
      const ch = 46, ph = Math.min(A - 3 - y, Math.max(70, chars.length * ch + 24 + Math.floor(R() * 30)));
      g.fillStyle = bg; g.fillRect(x0 + 3, y, STRIP_W - 6, ph);
      g.fillStyle = ink;
      if (chars.length === 1 && chars[0].length > 1) {
        // (a Latin word: turned on its side, as the blade signs carry them)
        g.save(); g.translate(x0 + STRIP_W / 2, y + ph / 2); g.rotate(Math.PI / 2);
        g.font = `bold 34px ${FONT}`; g.fillText(chars[0], 0, 0, ph - 10); g.restore();
      } else {
        g.font = `bold 40px ${FONT}`;
        const top = y + (ph - chars.length * ch) / 2 + ch / 2;
        chars.forEach((k, i) => g.fillText(k, x0 + STRIP_W / 2, top + i * ch, STRIP_W - 10));
      }
      // (a thin coloured edge band on the white boxes)
      if (bg === '#f4f1e8') { g.fillStyle = ink; g.fillRect(x0 + 3, y, 4, ph); g.fillRect(x0 + STRIP_W - 7, y, 4, ph); }
      y += ph + 5;
    }
  }
  // Horizontal boards (the rooftop billboards and the facade bands)
  const words = BOARD_WORDS.slice().sort(() => R() - 0.5);
  for (let r = 0; r < BOARDS; r++) {
    const [x0, y0] = boardXY(r), [bg, ink] = PANELS[Math.floor(R() * PANELS.length)];
    const grd = g.createLinearGradient(x0, y0, x0, y0 + BOARD_H);
    grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -0.18));
    g.fillStyle = grd; g.fillRect(x0 + 3, y0 + 3, BOARD_W - 6, BOARD_H - 6);
    g.fillStyle = ink; g.font = `bold 29px ${FONT}`;
    g.fillText(words[r % words.length], x0 + BOARD_W / 2, y0 + BOARD_H / 2 + 1, BOARD_W - 16);
    g.fillRect(x0 + 3, y0 + BOARD_H - 7, BOARD_W - 6, 2);
  }
  g.fillStyle = '#1c1d22'; g.fillRect(1000, 1000, 24, 24);
  return c;
}

// board r's top-left (px): column-major, so boards r and r + 1 stack (the tall rooftop boards use two)
function boardXY(r) { return [BOARD_X + Math.floor(r / BOARD_ROWS) * BOARD_W, (r % BOARD_ROWS) * BOARD_H]; }
// board r's uv rect (rows: how many boards down it spans)
function boardUV(r, rows = 1) {
  const [x, y] = boardXY(r);
  return [(x + 4) / A, 1 - (y + rows * BOARD_H - 4) / A, (x + BOARD_W - 4) / A, 1 - (y + 4) / A];
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Geometry builder: boxes with a texture rect on chosen faces, dark elsewhere; per-owner vertex ranges
class Merge {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.ranges = []; this._open = null; }
  begin(owner) { this._open = { owner, start: this.pos.length / 3 }; }
  end() { const o = this._open; if (!o) return; o.count = this.pos.length / 3 - o.start; if (o.count) this.ranges.push(o); this._open = null; }
  // a quad centred at c with normal N, half extents along R (viewer's right) and Y (up); uv rect [u0, v0, u1, v1]
  quad(c, N, R, hr, U, hu, uv) {
    const b = this.pos.length / 3;
    const p = (sr, su) => this.pos.push(c[0] + R[0] * hr * sr + U[0] * hu * su, c[1] + R[1] * hr * sr + U[1] * hu * su, c[2] + R[2] * hr * sr + U[2] * hu * su);
    p(-1, -1); p(1, -1); p(1, 1); p(-1, 1);
    const [u0, v0, u1, v1] = uv || [DARK[0], DARK[1], DARK[0], DARK[1]];
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    // (wound counter-clockwise seen from N)
    const cr = [R[1] * U[2] - R[2] * U[1], R[2] * U[0] - R[0] * U[2], R[0] * U[1] - R[1] * U[0]];
    if (cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2] >= 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  // a box: centre c, unit axes a (x), up y, n (z) with half sizes; faces[+-a/+-n] uv rects (null: dark)
  box(c, ax, hx, hy, nz, hz, uvs = {}) {
    const Y = [0, 1, 0], neg = (v) => [-v[0], -v[1], -v[2]], add = (v, k) => [c[0] + v[0] * k, c[1] + v[1] * k, c[2] + v[2] * k];
    // viewer's right for a face with normal N (y up): (-N) x Y
    const right = (N) => [N[2], 0, -N[0]];
    this.quad(add(nz, hz), nz, right(nz), hx, Y, hy, uvs.pz);
    this.quad(add(neg(nz), hz), neg(nz), right(neg(nz)), hx, Y, hy, uvs.nz);
    this.quad(add(ax, hx), ax, right(ax), hz, Y, hy, uvs.px);
    this.quad(add(neg(ax), hx), neg(ax), right(neg(ax)), hz, Y, hy, uvs.nx);
    this.quad([c[0], c[1] + hy, c[2]], Y, ax, hx, nz, hz, null);
    this.quad([c[0], c[1] - hy, c[2]], neg(Y), ax, hx, nz, hz, null);
  }
  mesh(mat) {
    if (!this.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.userData.signs = true;
    return m;
  }
}

// lots: [{ b (Building), x, z, w, d, rotY, h, style, zone, id }]; onRoad(x, z, pad), onMajor(x, z, pad);
// spans: the utility-pole wire spans [{ a: [x, z], b: [x, z], across: [ux, uz] }]
export function buildTokyoSigns(scene, { lots, onRoad, onMajor, spans = [], lite = false, world = null, stats = {} }) {
  const animators = [];
  const R = rng(1122);
  const atlasCanvas = drawAtlas();
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const signMat = new THREE.MeshBasicMaterial({ map: atlas, color: 0xe6e6e6, fog: true });
  const M = new Merge();
  const caps = { blade: lite ? 260 : 950, board: lite ? 50 : 170, screen: lite ? 4 : 8 };
  const n = { blade: 0, board: 0, screen: 0 };

  // The street faces of each lot: the sides whose outward probe lands on a street
  const faces = (o) => {
    const r = o.rotY || 0, ax = [Math.cos(r), -Math.sin(r)], az = [Math.sin(r), Math.cos(r)];
    const all = [
      { n: ax, half: o.w / 2, len: o.d, t: az }, { n: [-ax[0], -ax[1]], half: o.w / 2, len: o.d, t: az },
      { n: az, half: o.d / 2, len: o.w, t: ax }, { n: [-az[0], -az[1]], half: o.d / 2, len: o.w, t: ax },
    ];
    for (const f of all) {
      const px = o.x + f.n[0] * (f.half + 1.6), pz = o.z + f.n[1] * (f.half + 1.6);
      f.road = onRoad(px, pz, 0);
      f.major = f.road && onMajor(px, pz, 0);
    }
    return all.filter((f) => f.road && f.len >= 1.6);
  };
  const sel = lots.filter((o) => ZONES.has(o.zone) && o.b && o.h >= 2.2);
  for (const o of sel) o.faces = faces(o);

  // ---- big screens: tall corner blocks over the main crossings, spaced out ----
  const screens = [];
  {
    const cand = sel.filter((o) => o.h >= 7 && o.h <= 45 && o.faces.some((f) => f.major) && o.faces.length >= 2)
      .map((o) => ({ o, score: Math.min(o.h, 25) + o.faces.filter((f) => f.major).length * 8 + R() * 6 }))
      .sort((a, b) => b.score - a.score);
    for (const { o } of cand) {
      if (screens.length >= caps.screen) break;
      if (screens.some((s) => Math.hypot(s.o.x - o.x, s.o.z - o.z) < 45)) continue;
      const f = o.faces.filter((q) => q.major).sort((a, b) => b.len - a.len)[0];
      const W = Math.min(f.len * 0.72, 7.5);
      if (W < 2.4) continue;
      const H = W * 0.5, yc = Math.max(3 + H / 2, Math.min(o.h * 0.62, o.h - H / 2 - 0.6));
      screens.push({ o, f, W, H, yc });
      o.hasScreen = true;
    }
  }

  // ---- blade signs and rooftop boards (one vertex range per building) ----
  const order = sel.slice().sort(() => R() - 0.5);
  for (const o of order) {
    const isSmall = /zakkyo|lowrise|house/.test(o.style || '');
    const isMid = /midrise|apartment/.test(o.style || '');
    const isGlass = /glass/.test(o.style || '');
    M.begin(o.b);
    for (const f of o.faces) {
      const c = [o.x + f.n[0] * (f.half + 0.04), o.z + f.n[1] * (f.half + 0.04)];
      // Blade signs near the face's ends (zakkyo: often both ends and the middle; glass towers: seldom)
      const want = isSmall ? (f.len > 5 ? 2 + (R() < 0.4 ? 1 : 0) : 1) : isMid ? (R() < 0.75 ? 1 + (R() < 0.35 ? 1 : 0) : 0) : isGlass ? (R() < 0.18 ? 1 : 0) : (R() < 0.4 ? 1 : 0);
      const slots = want >= 3 ? [-0.42, 0.42, 0] : want === 2 ? [-0.42, 0.42] : want === 1 ? [R() < 0.5 ? -0.42 : 0.42] : [];
      for (const k of slots) {
        if (n.blade >= caps.blade) break;
        const p = 0.42 + R() * 0.22; // projection off the wall (2-3 m)
        const y0 = 0.9 + R() * 0.5;
        const top = Math.min(o.h * (isSmall ? 0.92 : 0.6), y0 + (isSmall ? 3 + R() * 6 : 2 + R() * 4));
        if (top - y0 < 1.2) continue;
        const along = k * Math.max(0, f.len - 0.9);
        const base = [c[0] + f.t[0] * along, c[1] + f.t[1] * along];
        const ce = [base[0] + f.n[0] * (0.05 + p / 2), (y0 + top) / 2, base[1] + f.n[1] * (0.05 + p / 2)];
        // the texture run: one strip, as many pixels down it as the sign's height needs (no stretching)
        const s = Math.floor(R() * STRIPS), need = Math.min(A - 8, ((top - y0) / p) * (STRIP_W - 8));
        const py = 4 + Math.floor(R() * (A - 8 - need));
        const uv = [(s * STRIP_W + 4) / A, 1 - (py + need) / A, (s * STRIP_W + STRIP_W - 4) / A, 1 - py / A];
        // (box axes: x = out from the wall, z = along the wall: its two big faces carry the strip, read from each side)
        const ax = [f.n[0], 0, f.n[1]], nz = [f.t[0], 0, f.t[1]];
        M.box(ce, ax, p / 2, (top - y0) / 2, nz, 0.035, { pz: uv, nz: uv });
        n.blade++;
      }
      // A lit band over the shopfront (the ground-floor fascia) on the small blocks
      if (isSmall && R() < 0.55) {
        const W = Math.min(f.len * 0.8, 3.2), Hh = W / 4 * 0.55;
        const uv = boardUV(Math.floor(R() * BOARDS));
        const ce = [c[0] + f.n[0] * 0.06, 0.82, c[1] + f.n[1] * 0.06];
        M.box(ce, [f.t[0], 0, f.t[1]], W / 2, Hh / 2, [f.n[0], 0, f.n[1]], 0.05, { pz: uv });
      }
    }
    // Rooftop billboard on the street side (zakkyo and the mid-rises, up to ~60 m)
    const f0 = o.faces.slice().sort((a, b) => (b.major - a.major) || (b.len - a.len))[0];
    if (f0 && !o.hasScreen && n.board < caps.board && (isSmall || isMid) && o.h <= 12 && R() < (isSmall ? 0.55 : 0.35)) {
      const W = Math.min(f0.len * 0.75, 5.5);
      if (W >= 1.6) {
        const tall = R() < 0.35, Hh = tall ? W / 2 : W / 4;
        const col = Math.floor(R() * 2), r = col * BOARD_ROWS + Math.floor(R() * (BOARD_ROWS - 1));
        const uv = boardUV(r, tall ? 2 : 1);
        const inset = Math.min(0.5, (o.faces.length ? f0.half : 1) * 0.3);
        const along = (R() - 0.5) * Math.max(0, f0.len - W - 0.4);
        const bx = o.x + f0.n[0] * (f0.half - inset) + f0.t[0] * along, bz = o.z + f0.n[1] * (f0.half - inset) + f0.t[1] * along;
        const leg = 0.35 + R() * 0.3, y0 = o.h + leg;
        const tA = [f0.t[0], 0, f0.t[1]], nA = [f0.n[0], 0, f0.n[1]];
        M.box([bx, y0 + Hh / 2, bz], tA, W / 2, Hh / 2, nA, 0.06, { pz: uv });
        // steel legs and a back strut
        for (const s of [-0.38, 0.38]) {
          M.box([bx + f0.t[0] * W * s - f0.n[0] * 0.12, o.h + (leg + Hh * 0.6) / 2, bz + f0.t[1] * W * s - f0.n[1] * 0.12], tA, 0.05, (leg + Hh * 0.6) / 2, nA, 0.05, {});
        }
        n.board++;
      }
    }
    // The screen's frame
    const sc = screens.find((s) => s.o === o);
    if (sc) {
      const { f, W, H, yc } = sc;
      const c = [o.x + f.n[0] * (f.half + 0.12), yc, o.z + f.n[1] * (f.half + 0.12)];
      M.box(c, [f.t[0], 0, f.t[1]], W / 2 + 0.12, H / 2 + 0.12, [f.n[0], 0, f.n[1]], 0.1, {});
    }
    M.end();
  }
  const signMesh = M.mesh(signMat);
  if (signMesh) scene.add(signMesh);

  // ---- the screens: one animated canvas, a 256 x 128 tile each (2 x 4) ----
  let screenMesh = null;
  const SM = new Merge();
  if (screens.length) {
    const sc = makeCanvas(512, 512), g = sc.getContext('2d');
    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xf2f2f2, fog: true });
    screens.forEach((s, i) => {
      const { o, f, W, H, yc } = s, col = i % 2, row = Math.floor(i / 2) % 4;
      const uv = [(col * 256 + 2) / 512, 1 - (row * 128 + 126) / 512, (col * 256 + 254) / 512, 1 - (row * 128 + 2) / 512];
      SM.begin(o.b);
      SM.quad([o.x + f.n[0] * (f.half + 0.23), yc, o.z + f.n[1] * (f.half + 0.23)], [f.n[0], 0, f.n[1]], [f.n[1], 0, -f.n[0]], W / 2, [0, 1, 0], H / 2, uv);
      SM.end();
    });
    screenMesh = SM.mesh(mat);
    if (screenMesh) scene.add(screenMesh);
    const ADS = [['新発売', '#ff3a6e', '#2a0a3a'], ['SUMMER SALE', '#ffd23a', '#0a2a5a'], ['銀座の夜', '#7fe0ff', '#101830'], ['ビール', '#ffb31a', '#3a1a00'],
      ['NEW MODEL', '#ffffff', '#c8202a'], ['ライブ', '#c6ff3a', '#1a1a1a']];
    const TICK = '怪獣警報 KAIJU ALERT ・ 東京湾から上陸 ・ 銀座・新橋・有楽町方面の方は直ちに避難してください ・ EVACUATE NOW ・ ';
    const draw = (time) => {
      for (let i = 0; i < Math.min(8, screens.length); i++) {
        const x = (i % 2) * 256, y = Math.floor(i / 2) * 128, prog = Math.floor(time / 6 + i * 1.7) % 4;
        g.save(); g.beginPath(); g.rect(x, y, 256, 128); g.clip();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (prog === 3) {
          // the news: a red alert banner over a map-ish ground and the ticker
          g.fillStyle = '#0a1830'; g.fillRect(x, y, 256, 128);
          g.fillStyle = (Math.floor(time * 2) % 2) ? '#e0141e' : '#a00a12'; g.fillRect(x, y + 8, 256, 40);
          g.fillStyle = '#ffffff'; g.font = `bold 28px ${FONT}`; g.fillText('怪獣警報', x + 78, y + 29); g.font = `bold 17px ${FONT}`; g.fillText('KAIJU ALERT', x + 190, y + 29);
          g.fillStyle = '#ffd23a'; g.font = `bold 16px ${FONT}`; g.fillText('LIVE  東京湾岸', x + 128, y + 68);
          g.fillStyle = '#111'; g.fillRect(x, y + 92, 256, 30);
          g.fillStyle = '#ffffff'; g.font = `bold 19px ${FONT}`; g.textAlign = 'left';
          const tw = 1400, off = (time * 70 + i * 300) % tw;
          g.fillText(TICK + TICK, x + 4 - off, y + 108);
        } else if (prog === 2) {
          // weather card
          const grd = g.createLinearGradient(x, y, x, y + 128); grd.addColorStop(0, '#1a6ad8'); grd.addColorStop(1, '#0a2a6a');
          g.fillStyle = grd; g.fillRect(x, y, 256, 128);
          g.fillStyle = '#ffffff'; g.font = `bold 22px ${FONT}`; g.fillText('東京  今夜', x + 128, y + 30);
          g.font = `bold 46px ${FONT}`; g.fillText('18°C', x + 100, y + 80);
          g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(x + 200, y + 78, 18 + Math.sin(time * 3) * 2, 0, Math.PI * 2); g.fill();
        } else {
          // an ad: colour field, a moving light sweep, one big word
          const [word, ink, bg] = ADS[(i + Math.floor(time / 6)) % ADS.length];
          g.fillStyle = bg; g.fillRect(x, y, 256, 128);
          const sx = x + ((time * 90 + i * 70) % 380) - 60;
          const grd = g.createLinearGradient(sx - 50, y, sx + 50, y);
          grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd; g.fillRect(x, y, 256, 128);
          for (let k = 0; k < 5; k++) {
            g.fillStyle = ink; g.globalAlpha = 0.25;
            g.beginPath(); g.arc(x + 30 + k * 50, y + 64 + Math.sin(time * 2 + k + i) * 34, 10 + k * 2, 0, Math.PI * 2); g.fill();
          }
          g.globalAlpha = 1; g.fillStyle = ink; g.font = `bold ${word.length > 6 ? 34 : 48}px ${FONT}`;
          g.fillText(word, x + 128, y + 64, 240);
        }
        g.restore();
      }
      tex.needsUpdate = true;
    };
    draw(0);
    const every = lite ? 0.5 : 0.25;
    let acc = 0, t = 0;
    animators.push({ update(dt) { t += dt; acc += dt; if (acc < every) return; acc = 0; draw(t); } });
  }

  // ---- overhead wires: sagging strands pole to pole, a service drop across now and then ----
  let wireMesh = null;
  const wireSpans = [];
  if (spans.length) {
    const pos = [], SUB = 6;
    // strands: [offset across the road (u), height (u), sag (u)]: the two crossarm ends, the low telecom cable
    const STR = [[-0.2, 1.98, 0.14], [0.2, 1.98, 0.14], [0, 1.76, 0.12], [0.05, 1.2, 0.08]];
    const strand = (ax, ay, az, bx, by, bz, sag) => {
      for (let k = 0; k < SUB; k++) {
        const t0 = k / SUB, t1 = (k + 1) / SUB;
        const y = (t) => ay + (by - ay) * t - sag * 4 * t * (1 - t);
        pos.push(ax + (bx - ax) * t0, y(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, y(t1), az + (bz - az) * t1);
      }
    };
    for (const s of spans) {
      const start = pos.length / 3;
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), sagK = Math.min(1.6, len / 12);
      for (const [off, h, sag] of STR) {
        strand(s.a[0] + s.across[0] * off, h, s.a[1] + s.across[1] * off, s.b[0] + s.across[0] * off, h, s.b[1] + s.across[1] * off, sag * sagK);
      }
      // a service drop from the pole across the street to the facing building (every third pole or so)
      if (s.drop) strand(s.a[0], 1.76, s.a[1], s.a[0] - s.across[0] * s.drop, 1.05, s.a[1] - s.across[1] * s.drop, 0.06);
      wireSpans.push({ x: (s.a[0] + s.b[0]) / 2, z: (s.a[1] + s.b[1]) / 2, r: len / 2 + 0.8, start, count: pos.length / 3 - start, cut: false });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeBoundingSphere();
    wireMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x14151a, fog: true }));
    wireMesh.matrixAutoUpdate = false; wireMesh.updateMatrix();
    scene.add(wireMesh);
  }

  // ---- falls: a fallen building's signs go with it; a span the kaiju walks into snaps ----
  const collapse = (geo, start, count) => {
    const a = geo.attributes.position;
    for (let v = start; v < start + count; v++) a.setXYZ(v, 0, -50, 0);
    a.needsUpdate = true;
  };
  const watched = [...(signMesh ? M.ranges.map((r) => ({ ...r, geo: signMesh.geometry })) : []), ...(screenMesh ? SM.ranges.map((r) => ({ ...r, geo: screenMesh.geometry })) : [])];
  let acc = 0;
  animators.push({
    update(dt) {
      acc += dt;
      if (acc < 0.2) return;
      acc = 0;
      for (let i = watched.length - 1; i >= 0; i--) {
        const w = watched[i];
        if (!w.owner.destroyed) continue;
        collapse(w.geo, w.start, w.count);
        watched[i] = watched[watched.length - 1]; watched.pop();
      }
      const kp = world && world.kaijuPos;
      if (wireMesh && kp) {
        for (const s of wireSpans) {
          if (s.cut || Math.abs(s.x - kp.x) > s.r + 4 || Math.abs(s.z - kp.z) > s.r + 4) continue;
          if (Math.hypot(s.x - kp.x, s.z - kp.z) < s.r + 2.5) { s.cut = true; collapse(wireMesh.geometry, s.start, s.count); }
        }
      }
    },
  });
  stats.signBlades = n.blade; stats.signBoards = n.board; stats.signScreens = screens.length; stats.wireSpans = wireSpans.length;
  stats.signLots = sel.length;
  return { animators, meshes: [signMesh, screenMesh, wireMesh].filter(Boolean) };
}
