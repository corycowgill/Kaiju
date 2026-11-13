// Torn buildings: a kaiju rips a piece out of a building too big to lift, and
// the building keeps the wound.
//   snap   a tower (taller than PROP_TUNE.maxH): a section about the kaiju's
//          own height comes out above a short stump, and everything above it
//          drops onto the stump, leaning a little more each time. The tower
//          gets shorter with every tear; the last section brings it down.
//   bite   a wide building (a stadium, a museum): a kaiju-sized block comes
//          out of the wall nearest the kaiju, all the way up. The third bite
//          brings the rest down.
// How it is drawn: no new models and no new shader programs. The lit and
// depth shaders of three itself carry a small addition (installed below, when
// this module loads, before anything compiles) that can discard what lies
// inside / outside up to three boxes given in a building's ORIGINAL world
// space; it is off (one uniform test) on every ordinary material. A torn
// building leaves the city's shared instanced meshes and is drawn as a few
// one-instance copies of its own meshes with cloned materials (same program,
// their own boxes): the standing parts and the chunk are the same model seen
// through complementary boxes, each with its own rigid transform, so the piece
// in the kaiju's hands is exactly the piece missing from the building. The box
// edges jog by blocks (broken storeys) and the surface chars toward them.
// Driven by props.js (tear) and spots.js (update / onDestroyed / dispose).
// OWNER: spots.
import * as THREE from 'three';

export const CARVE_TUNE = {
  stump: 6,          // u of a snapped tower left under the break
  seg: 30,           // length of the section snapped out (about a kaiju's height)
  minTop: 12,        // less than this left above the section: it is the last one, the tower falls
  bite: 11,          // half-size (x, z) of the block bitten out of a wide building
  bites: 3,          // the wide building falls with this bite
  minBiteH: 4,       // a wide building lower than this is not worth a bite
  dropDelay: 0.34, dropT: 0.62,   // the top hangs, then falls onto the stump
  lean: 0.085, maxLean: 0.2,      // rad more lean per tear / in all
  sink: 1.2,         // u the top settles into the stump each time
  maxWounded: 8,     // more torn buildings than this standing: the oldest gives way
  smoke: 16,         // s a fresh wound smokes
};

const BIG = 1e5;
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3();
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ------------------------------------------------------------------ the shader addition
const mkU = () => ({
  uCarveGlow: { value: 0 }, // embers along the break, 0..1
  uCarveMode: { value: 0 }, // 0 off | 1 discard inside the boxes | 2 keep inside box 0 (and still discard inside boxes 1, 2)
  uCarveMin: { value: [new THREE.Vector3(BIG, BIG, BIG), new THREE.Vector3(BIG, BIG, BIG), new THREE.Vector3(BIG, BIG, BIG)] },
  uCarveMax: { value: [new THREE.Vector3(-BIG, -BIG, -BIG), new THREE.Vector3(-BIG, -BIG, -BIG), new THREE.Vector3(-BIG, -BIG, -BIG)] },
});
const VERT_HEAD = 'varying vec3 vCarveW;\n';
const VERT_MAIN = `
	#ifdef USE_INSTANCING
		vCarveW = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
	#else
		vCarveW = position;
	#endif
`;
const FRAG_HEAD = `
uniform float uCarveMode;
uniform float uCarveGlow;
uniform vec3 uCarveMin[ 3 ];
uniform vec3 uCarveMax[ 3 ];
varying vec3 vCarveW;
float carveH( vec2 p ) { return fract( sin( dot( floor( p ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float carveD( vec3 p, vec3 a, vec3 b ) { vec3 d = max( a - p, p - b ); return max( d.x, max( d.y, d.z ) ); }
`;
const FRAG_MAIN = `
	float carveShade = 1.0;
	float carveEmber = 0.0;
	if ( uCarveMode > 0.5 ) {
		// the broken edge: each face of a box jogs by blocks (storeys, bays), the same on both sides of the break
		vec3 cp = vCarveW + ( vec3( carveH( vCarveW.yz * 0.5 + 3.0 ), carveH( vCarveW.xz * 0.45 ), carveH( vCarveW.xy * 0.5 + 9.0 ) ) - 0.5 ) * vec3( 2.2, 2.6, 2.2 );
		float c0 = carveD( cp, uCarveMin[ 0 ], uCarveMax[ 0 ] );
		float c1 = min( carveD( cp, uCarveMin[ 1 ], uCarveMax[ 1 ] ), carveD( cp, uCarveMin[ 2 ], uCarveMax[ 2 ] ) );
		float ce;
		if ( uCarveMode > 1.5 ) { if ( c0 > 0.0 || c1 < 0.0 ) discard; ce = min( - c0, c1 ); }
		else { ce = min( c0, c1 ); if ( ce < 0.0 ) discard; }
		carveShade = 0.16 + 0.84 * smoothstep( 0.0, 5.5, ce + ( carveH( vCarveW.xz * 1.7 + vCarveW.y * 1.3 ) - 0.5 ) * 2.0 );
		// embers in the broken edge
		carveEmber = uCarveGlow * smoothstep( 1.5, 0.0, ce ) * step( 0.55, carveH( vCarveW.xz * 2.3 + vCarveW.y * 3.1 ) );
	}
`;
// Into three's own lit and depth shaders, once, at module load (game.js imports the wrestling modules before the
// renderer links anything). Program keys do not change, so no material variant is added: a material draws carved
// only when its uniforms say so, and only the piece materials below ever do.
const CARVE_LIBS = ['standard', 'physical', 'lambert', 'phong', 'depth'];
let _installed = false;
function installCarveShader() {
  if (_installed) return;
  _installed = true;
  for (const id of CARVE_LIBS) {
    const L = THREE.ShaderLib[id];
    if (!L || L.fragmentShader.includes('uCarveMode') || !L.vertexShader.includes('void main() {') || !L.fragmentShader.includes('void main() {')) continue;
    L.vertexShader = VERT_HEAD + L.vertexShader.replace('void main() {', 'void main() {' + VERT_MAIN);
    L.fragmentShader = FRAG_HEAD + L.fragmentShader.replace('void main() {', 'void main() {' + FRAG_MAIN)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.rgb = gl_FragColor.rgb * carveShade + vec3( 1.0, 0.32, 0.05 ) * carveEmber;');
    Object.assign(L.uniforms, mkU());
  }
}
installCarveShader();
const _defaultKey = THREE.Material.prototype.customProgramCacheKey;
/** A copy of a building material with its own carve uniforms U. Same program as the source: the key is the source's. */
function cloneMat(src, U) {
  const c = src.clone();
  const hook = src.onBeforeCompile;
  c.onBeforeCompile = function (sh, r) { hook.call(src, sh, r); sh.uniforms.uCarveMode = U.uCarveMode; sh.uniforms.uCarveGlow = U.uCarveGlow; sh.uniforms.uCarveMin = U.uCarveMin; sh.uniforms.uCarveMax = U.uCarveMax; };
  c.customProgramCacheKey = () => src.customProgramCacheKey();
  return c;
}
/** The shadow pass of a piece (three's own depth program, with the piece's boxes). */
function depthMat(U) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => { sh.uniforms.uCarveMode = U.uCarveMode; sh.uniforms.uCarveGlow = U.uCarveGlow; sh.uniforms.uCarveMin = U.uCarveMin; sh.uniforms.uCarveMax = U.uCarveMax; };
  d.customProgramCacheKey = () => _defaultKey.call(_plain);
  return d;
}
const _plain = new THREE.Material(); // (what an unhooked material's program key says)

// ------------------------------------------------------------------ the carver
/** @param ctx game ctx (scene, world, fx, collapseBuilding, landmarkName, quality) @param W wrestling state */
export function createCarver(ctx, W) {
  const T = CARVE_TUNE, scene = ctx.scene;
  const wounded = [];        // wounds, oldest first
  const chunks = new Set();  // chunks in hands / in the air
  const vaos = new Map();    // a building mesh's geometry -> our copy of it (its own vertex array object, the same GPU buffers)
  const shadows = !!(ctx.quality && ctx.quality.shadows && ctx.quality.full);
  let capGeo = null, capMat = null;

  function vaoOf(geom) {
    let g = vaos.get(geom);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.index = geom.index;
      for (const k in geom.attributes) g.attributes[k] = geom.attributes[k];
      g.groups = geom.groups; g.drawRange = geom.drawRange;
      if (!geom.boundingSphere) geom.computeBoundingSphere();
      if (!geom.boundingBox) geom.computeBoundingBox();
      g.boundingSphere = geom.boundingSphere; g.boundingBox = geom.boundingBox;
      vaos.set(geom, g);
    }
    return g;
  }
  function capMesh() {
    if (!capGeo) { capGeo = new THREE.BoxGeometry(1, 1, 1); capMat = new THREE.MeshStandardMaterial({ color: 0x191715, roughness: 1, metalness: 0 }); }
    const m = new THREE.Mesh(capGeo, capMat);
    m.matrixAutoUpdate = false; m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ---- a building's own meshes, read once when it is first torn ----
  /** The near-LOD instance slots of b: [{ im, m0 (its instance matrix), wp (world positions, lazily) }]. */
  function readSlots(b) {
    const out = [];
    for (const s of b._glbSlots) {
      if (s.im.userData.lodFar) continue; // the far twin of a slot already taken
      const m0 = new THREE.Matrix4(); s.im.getMatrixAt(s.idx, m0);
      out.push({ im: s.im, m0, wp: null });
    }
    return out;
  }
  function worldPos(s) {
    if (s.wp) return s.wp;
    const p = s.im.geometry.attributes.position, n = p.count, wp = new Float32Array(n * 3), e = s.m0.elements;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      wp[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      wp[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      wp[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    return (s.wp = wp);
  }
  /** Walk the building's section at height y: fn(x0, z0, x1, z1) for every triangle edge pair crossing it. */
  function slice(wd, y, fn) {
    for (const s of wd.slots) {
      const wp = worldPos(s), idx = s.im.geometry.index, n = idx ? idx.count : wp.length / 3;
      for (let t = 0; t + 2 < n; t += 3) {
        const a = (idx ? idx.getX(t) : t) * 3, b = (idx ? idx.getX(t + 1) : t + 1) * 3, c = (idx ? idx.getX(t + 2) : t + 2) * 3;
        const ya = wp[a + 1] - y, yb = wp[b + 1] - y, yc = wp[c + 1] - y;
        if ((ya > 0) === (yb > 0) && (yb > 0) === (yc > 0)) continue;
        // the two edges that cross
        let px = 0, pz = 0, got = 0;
        for (let k = 0; k < 3; k++) {
          const i = k === 0 ? a : k === 1 ? b : c, j = k === 0 ? b : k === 1 ? c : a;
          const yi = wp[i + 1] - y, yj = wp[j + 1] - y;
          if ((yi > 0) === (yj > 0)) continue;
          const u = yi / (yi - yj), x = wp[i] + (wp[j] - wp[i]) * u, z = wp[i + 2] + (wp[j + 2] - wp[i + 2]) * u;
          if (got++) fn(px, pz, x, z); else { px = x; pz = z; }
        }
      }
    }
  }
  const rect = { x0: 0, x1: 0, z0: 0, z1: 0, ok: false };
  function rectVisit(x0, z0, x1, z1) {
    rect.ok = true;
    rect.x0 = Math.min(rect.x0, x0, x1); rect.x1 = Math.max(rect.x1, x0, x1);
    rect.z0 = Math.min(rect.z0, z0, z1); rect.z1 = Math.max(rect.z1, z0, z1);
  }
  /** The plan bounds of the building's section at height y (the footprint when nothing crosses there). */
  function sectionRect(wd, y) {
    rect.ok = false; rect.x0 = rect.z0 = BIG; rect.x1 = rect.z1 = -BIG;
    slice(wd, y, rectVisit);
    if (!rect.ok) { const b = wd.b; rect.x0 = b.x - b.w / 2; rect.x1 = b.x + b.w / 2; rect.z0 = b.z - b.d / 2; rect.z1 = b.z + b.d / 2; }
    return rect;
  }

  // ---- pieces: one-instance copies of the building's meshes seen through carve boxes ----
  function mkPiece(wd, mode, cast) {
    const U = mkU();
    U.uCarveMode.value = mode; U.uCarveGlow.value = 0.8;
    const P = { U, meshes: [], caps: [], M: new THREE.Matrix4(), depth: null };
    for (const s of wd.slots) {
      const im = new THREE.InstancedMesh(vaoOf(s.im.geometry), cloneMat(s.im.material, U), 1);
      im.setMatrixAt(0, s.m0);
      im.matrixAutoUpdate = false;
      im.receiveShadow = s.im.receiveShadow;
      im.castShadow = !!(cast && shadows && s.im.castShadow);
      if (im.castShadow) im.customDepthMaterial = P.depth || (P.depth = depthMat(U));
      im.frustumCulled = false; // (a handful of draws; its sphere is the whole building's, not the piece's)
      scene.add(im);
      P.meshes.push(im);
    }
    return P;
  }
  /** A dark slab closing a piece's open end: centre (x, y, z) and size in the building's original space. */
  function addCap(P, x, y, z, w, h, d) {
    const c = capMesh();
    c.userData.local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.identity(), new THREE.Vector3(Math.max(0.5, w), h, Math.max(0.5, d)));
    P.caps.push(c);
    c.matrix.multiplyMatrices(P.M, c.userData.local); c.matrixWorld.copy(c.matrix);
    return c;
  }
  function setCap(c, x, y, z, w, h, d) { c.userData.local.compose(_v.set(x, y, z), _q.identity(), _s.set(Math.max(0.5, w), h, Math.max(0.5, d))); }
  function capAt(wd, P, y, slot) {
    const r = sectionRect(wd, y), w = (r.x1 - r.x0) * 0.9, d = (r.z1 - r.z0) * 0.9, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
    if (P.caps[slot]) setCap(P.caps[slot], x, y, z, w, 0.5, d); else addCap(P, x, y, z, w, 0.5, d);
  }
  function setPiece(P, M) {
    if (M !== P.M) P.M.copy(M);
    for (const im of P.meshes) { im.matrix.copy(P.M); im.matrixWorld.copy(P.M); }
    for (const c of P.caps) { c.matrix.multiplyMatrices(P.M, c.userData.local); c.matrixWorld.copy(c.matrix); }
  }
  function freePiece(P) {
    if (!P) return;
    for (const im of P.meshes) { scene.remove(im); im.material.dispose(); im.dispose(); }
    for (const c of P.caps) scene.remove(c);
    if (P.depth) P.depth.dispose();
    P.meshes.length = 0; P.caps.length = 0;
  }
  const setBox = (U, i, x0, y0, z0, x1, y1, z1) => { U.uCarveMin.value[i].set(x0, y0, z0); U.uCarveMax.value[i].set(x1, y1, z1); };

  // ---- wounds ----
  function open(b, kind, by) {
    const wd = { b, kind, by, slots: readSlots(b), H: b.h, removed: 0, tears: 0,
      stump: null, upper: null, rest: null,
      ax: 0, az: 1, lean: 0, lean0: 0, lean1: 0, drop: 0, drop0: 0, drop1: 0, offX: 0, offZ: 0, dropU: 1, landed: true,
      smoke: 0, smokeT: 0, sx: b.x, sy: T.stump, sz: b.z, bitesAt: [] };
    if (!wd.slots.length) return null;
    // out of the city's shared instanced meshes (near and far twins): from here on it is drawn as its own pieces
    for (const s of b._glbSlots) { s.im.setMatrixAt(s.idx, _zero); s.im.instanceMatrix.needsUpdate = true; }
    b._wound = wd;
    wounded.push(wd);
    return wd;
  }
  function close(wd) {
    freePiece(wd.stump); freePiece(wd.upper); freePiece(wd.rest);
    wd.stump = wd.upper = wd.rest = null;
    for (const s of wd.slots) s.wp = null;
    if (wd.b._wound === wd) wd.b._wound = null;
    const i = wounded.indexOf(wd);
    if (i >= 0) wounded.splice(i, 1);
  }
  /** The top of a snapped tower: where it sits on the stump (drop u, lean rad about the break). */
  function upperMatrix(wd, out) {
    const b = wd.b;
    _q.setFromAxisAngle(_ax.set(wd.ax, 0, wd.az), wd.lean);
    out.makeTranslation(b.x, T.stump, b.z);
    out.multiply(_m2.makeRotationFromQuaternion(_q));
    out.multiply(_m2.makeTranslation(-b.x + wd.offX, -T.stump - wd.drop, -b.z + wd.offZ));
    return out;
  }
  function mkChunk(wd, P, x, y, z, w, d, h, home) {
    const b = wd.b;
    const ch = { isChunk: true, kind: wd.kind, b, name: ctx.landmarkName ? ctx.landmarkName(b) : '', landmark: !!b.landmarkId,
      x, y, z, w, d, h, home: home.clone(), piece: P,
      /** C: the frame of the chunk's base centre in the world. */
      set(C) { _m.multiplyMatrices(C, _m2.makeTranslation(-x, -y, -z)); setPiece(P, _m); },
      remove() { freePiece(P); chunks.delete(ch); } };
    chunks.add(ch);
    setPiece(P, home);
    return ch;
  }
  function wreckFx(x, y, z, r) {
    const w = ctx.world, lite = !!(ctx.quality && !ctx.quality.full);
    if (ctx.fx && ctx.fx.dustBurst) ctx.fx.dustBurst(_v.set(x, Math.max(0, y - 2), z).clone(), r, lite ? 6 : 12);
    if (w && w.spawnSparks) w.spawnSparks(new THREE.Vector3(x, y, z), lite ? 8 : 16);
    if (w && w.spawnSmoke) w.spawnSmoke(new THREE.Vector3(x, y + 2, z), 1.6);
  }

  function snap(b, f) {
    let wd = b._wound;
    const first = !wd;
    if (first && !(wd = open(b, 'snap', f.id))) return null;
    const from = T.stump + wd.removed, room = wd.H - from;
    let seg = Math.min(T.seg, room);
    const last = room - seg < T.minTop;
    if (last) seg = Math.min(room, T.seg * 1.3);
    const home = first ? _m.identity().clone() : upperMatrix(wd, new THREE.Matrix4());
    // the section in the hands
    const C = mkPiece(wd, 2, false);
    setBox(C.U, 0, -BIG, from, -BIG, BIG, from + seg, BIG);
    capAt(wd, C, from + 1.7, 0); capAt(wd, C, from + seg - 1.7, 1);
    const r = sectionRect(wd, from + seg / 2);
    const w = Math.max(4, r.x1 - r.x0), d = Math.max(4, r.z1 - r.z0), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const ch = mkChunk(wd, C, cx, from, cz, w, d, seg, home);
    if (first) {
      wd.stump = mkPiece(wd, 2, true);
      setBox(wd.stump.U, 0, -BIG, -BIG, -BIG, BIG, T.stump, BIG);
      capAt(wd, wd.stump, T.stump - 1.7, 0);
      setPiece(wd.stump, _m.identity());
      // it leans away from whoever tore it
      const dx = b.x - f.pos.x, dz = b.z - f.pos.z, l = Math.hypot(dx, dz) || 1;
      const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.2;
      wd.ax = Math.cos(a); wd.az = -Math.sin(a); // axis across the lean direction (sin a, cos a)
      void l;
    }
    wd.removed += seg; wd.tears++;
    if (!last) {
      if (!wd.upper) { wd.upper = mkPiece(wd, 2, true); setPiece(wd.upper, home); }
      setBox(wd.upper.U, 0, -BIG, from + seg, -BIG, BIG, BIG, BIG);
      capAt(wd, wd.upper, from + seg + 1.7, 0);
      setPiece(wd.upper, wd.upper.M);
      wd.drop0 = wd.drop; wd.drop1 = wd.removed + T.sink * wd.tears;
      wd.lean0 = wd.lean; wd.lean1 = Math.min(T.maxLean, wd.lean + T.lean * (0.7 + Math.random() * 0.6));
      wd.dropU = -T.dropDelay / T.dropT; wd.landed = false;
      wd.offX += (Math.random() - 0.5) * 1.2; wd.offZ += (Math.random() - 0.5) * 1.2;
      b.h = Math.max(T.stump + 4, wd.H - wd.removed);
      b.hp = Math.max(1, b.maxHp * (1 - wd.removed / Math.max(1, wd.H - T.stump)));
    }
    wd.smoke = T.smoke; wd.smokeT = 0; wd.sx = b.x; wd.sy = T.stump + 1; wd.sz = b.z;
    wreckFx(b.x, from + 2, b.z, Math.max(b.w, b.d) * 0.8 + 8);
    ch.last = last;
    if (last) fell(wd, f.id); // (the chunk stays in the hands)
    else evict(wd);
    return ch;
  }

  let np = { x: 0, z: 0, d: 0, fx: 0, fz: 0, wd: null };
  function inBites(wd, x, z) { for (const q of wd.bitesAt) if (Math.abs(x - q.x) < T.bite * 0.9 && Math.abs(z - q.z) < T.bite * 0.9) return true; return false; }
  function nearVisit(x0, z0, x1, z1) {
    for (let k = 0; k < 3; k++) {
      const u = k / 2, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u, d = Math.hypot(x - np.fx, z - np.fz);
      if (d < np.d && !inBites(np.wd, x, z)) { np.d = d; np.x = x; np.z = z; }
    }
  }
  function bite(b, f) {
    let wd = b._wound;
    const first = !wd;
    if (first && !(wd = open(b, 'bite', f.id))) return null;
    // where: the wall nearest the kaiju (the model's own outline a little above the ground, not its bounding box)
    np.fx = f.pos.x; np.fz = f.pos.z; np.d = BIG; np.wd = wd;
    slice(wd, Math.min(Math.max(2, b.h * 0.45), 8), nearVisit);
    if (np.d >= BIG) { np.x = THREE.MathUtils.clamp(f.pos.x, b.x - b.w / 2, b.x + b.w / 2); np.z = THREE.MathUtils.clamp(f.pos.z, b.z - b.d / 2, b.z + b.d / 2); }
    // the block: centred a little inside that wall
    const dx = b.x - np.x, dz = b.z - np.z, l = Math.hypot(dx, dz) || 1;
    const cx = np.x + dx / l * T.bite * 0.4, cz = np.z + dz / l * T.bite * 0.4, hs = T.bite;
    // what the block actually holds (its vertices): the size and centre of the piece in the hands
    let x0 = BIG, x1 = -BIG, z0 = BIG, z1 = -BIG, y1 = 0, n = 0;
    for (const s of wd.slots) {
      const wp = worldPos(s);
      for (let i = 0; i < wp.length; i += 3) {
        const x = wp[i], z = wp[i + 2];
        if (Math.abs(x - cx) > hs || Math.abs(z - cz) > hs) continue;
        n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y1 = Math.max(y1, wp[i + 1]);
      }
    }
    if (n < 3) { x0 = cx - hs; x1 = cx + hs; z0 = cz - hs; z1 = cz + hs; y1 = b.h; }
    const idx = wd.bitesAt.length;
    wd.bitesAt.push({ x: cx, z: cz });
    const C = mkPiece(wd, 2, false);
    setBox(C.U, 0, cx - hs, -BIG, cz - hs, cx + hs, 46, cz + hs); // (what stood above that is lost)
    for (let i = 0; i < idx && i < 2; i++) { const q = wd.bitesAt[i]; setBox(C.U, i + 1, q.x - hs, -BIG, q.z - hs, q.x + hs, BIG, q.z + hs); }
    const ch = mkChunk(wd, C, (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.max(6, x1 - x0), Math.max(6, z1 - z0), Math.max(4, Math.min(y1, 44)), _m.identity());
    ch.flat = ch.h < Math.max(ch.w, ch.d) * 0.9;
    const last = idx + 1 >= T.bites;
    if (!last) {
      if (!wd.rest) { wd.rest = mkPiece(wd, 1, true); setPiece(wd.rest, _m.identity()); }
      setBox(wd.rest.U, idx, cx - hs, -BIG, cz - hs, cx + hs, BIG, cz + hs);
      b.hp = Math.max(1, b.maxHp * (1 - (idx + 1) / T.bites));
    }
    wd.tears++;
    wd.smoke = T.smoke; wd.smokeT = 0; wd.sx = cx; wd.sy = Math.min(b.h, 8); wd.sz = cz;
    wreckFx(cx, 3, cz, hs + 8);
    ch.last = last;
    if (last) fell(wd, f.id);
    else evict(wd);
    return ch;
  }
  /** Too many torn buildings standing: the oldest one (not `keep`) finally gives way. */
  function evict(keep) {
    while (wounded.length > T.maxWounded) {
      const wd = wounded[0] === keep ? wounded[1] : wounded[0];
      if (!wd) break;
      fell(wd, wd.by);
    }
  }
  /** The torn building comes down the city's own way (rubble, dust, the crash); its pieces go with it. */
  function fell(wd, by) {
    ctx.collapseBuilding(wd.b, by);
    if (wd.b._wound === wd) close(wd); // (no building:destroyed reached onDestroyed: do it here)
  }

  return {
    TUNE: T,
    /** How b would come away for a kaiju: '' (it would not), 'snap' or 'bite'. limits: props' { maxH, maxSide }. */
    kind(b, limits) {
      if (!b || b.destroyed || !b._glbSlots || !b._glbSlots.length) return '';
      if (b._wound) return b._wound.kind;
      if (Math.max(b.w, b.d) > limits.maxSide) return b.h >= T.minBiteH ? 'bite' : '';
      return b.h > limits.maxH ? 'snap' : '';
    },
    /** f tears a piece out of b (limits: props' { maxH, maxSide }): the chunk { w, d, h, x, y, z, home, set(C), remove(), name, landmark, kind, last, flat } or null. */
    tear(b, f, limits) {
      const k = this.kind(b, limits);
      return k === 'bite' ? bite(b, f) : k === 'snap' ? snap(b, f) : null;
    },
    /** The building came down (any cause): its standing pieces go with it. */
    onDestroyed(b) { if (b && b._wound) close(b._wound); },
    update(dt) {
      if (dt <= 0) return;
      for (let i = 0; i < wounded.length; i++) {
        const wd = wounded[i];
        if (wd.upper && wd.dropU < 1) {
          wd.dropU = Math.min(1, wd.dropU + dt / T.dropT);
          const u = Math.max(0, wd.dropU), g = u * u; // falling: it gathers speed
          wd.drop = wd.drop0 + (wd.drop1 - wd.drop0) * g;
          wd.lean = wd.lean0 + (wd.lean1 - wd.lean0) * smooth(u);
          setPiece(wd.upper, upperMatrix(wd, _m));
          if (wd.dropU >= 1 && !wd.landed) {
            wd.landed = true;
            const b = wd.b;
            wreckFx(b.x, T.stump, b.z, Math.max(b.w, b.d) + 10);
            if (ctx.shake) ctx.shake(0.9, 0.45);
            const w = ctx.world;
            if (w && w.spawnSmokeColumn) w.spawnSmokeColumn(new THREE.Vector3(b.x, T.stump, b.z), 22);
          }
        }
        // the break glows while it is fresh, then smoulders
        const glow = 0.22 + 0.78 * Math.max(0, wd.smoke / T.smoke) + 0.08 * Math.sin((wd.smoke + i) * 9);
        if (wd.stump) wd.stump.U.uCarveGlow.value = glow;
        if (wd.upper) wd.upper.U.uCarveGlow.value = glow;
        if (wd.rest) wd.rest.U.uCarveGlow.value = glow;
        if (wd.smoke > 0) {
          wd.smoke -= dt; wd.smokeT -= dt;
          if (wd.smokeT <= 0) {
            wd.smokeT = 0.55 + Math.random() * 0.5;
            const w = ctx.world;
            if (w && w.spawnSmoke) w.spawnSmoke(new THREE.Vector3(wd.sx + (Math.random() - 0.5) * 6, wd.sy + Math.random() * 3, wd.sz + (Math.random() - 0.5) * 6), 1.1 + Math.random() * 0.7);
          }
        }
      }
    },
    /** Torn buildings standing: [{ b, kind, tears }] (QA / AI). */
    wounds() { return wounded.map((wd) => ({ b: wd.b, kind: wd.kind, tears: wd.tears, removed: wd.removed })); },
    dispose() {
      for (const ch of [...chunks]) ch.remove();
      for (const wd of [...wounded]) close(wd);
      // our geometry copies share the city's GPU buffers: drop the references first, so disposing frees only the vertex array objects
      for (const g of vaos.values()) { g.index = null; g.attributes = {}; g.dispose(); }
      vaos.clear();
      if (capGeo) { capGeo.dispose(); capMat.dispose(); capGeo = capMat = null; }
    },
  };
}
