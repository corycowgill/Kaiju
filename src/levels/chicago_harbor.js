// Chicago harbors: Monroe Harbor's mooring field (OSM mooring cans) and
// DuSable Harbor's slips, filled with boats instanced per part (one draw per
// part for the whole harbour), plus a few boats under sail out on the lake.
// Boats in the kaiju's path are smashed: the instance tips over and sinks
// with a splash, like a car. Geometry: assets/levels/chicago_millennium.json
// (cartographer: harbors.monroe.moorings, harbors.dusable.slipFingers).
import * as THREE from 'three';

const SAIL_SCALE = 1.5; // boats at 1.5x true size, like the rest of the street furniture
const WIND_RY = -2.356; // August SW wind: local +X (the bow) points south-west

/** Template parts of a boat GLB, centred, hull bottom at y 0, bow along +X
 *  (bowZ: a model built bow +Z is turned a quarter first). */
function _parts(tpl, scale, bowZ = false) {
  tpl.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(tpl);
  const fix = new THREE.Matrix4().makeRotationY(bowZ ? Math.PI / 2 : 0).multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2));
  const parts = [];
  tpl.traverse((o) => { if (o.isMesh) parts.push({ geom: o.geometry, mat: o.material, m: new THREE.Matrix4().multiplyMatrices(fix, o.matrixWorld) }); });
  return parts;
}

/**
 * Harbour boats. H: geometry.harbors. ctx: { K, world, scene, lite, spawn,
 * animators, kit: { sail, extra: [urls] }, S: units per metre, draft: m }.
 * Placed once the boat templates are parsed (flush hook).
 */
export function buildHarbor(H, ctx) {
  const { K, scene, lite, spawn, animators, S } = ctx;
  const rnd = Math.random;
  const spots = [];
  // Monroe: the mooring cans, ~95% taken, none within 12u of the kaiju spawn
  // (it starts in open water and wades west through the field, smashing boats)
  const cap = lite ? 150 : 420;
  for (const [x, z] of H.monroe?.moorings?.points || []) {
    if (rnd() > 0.95) continue;
    if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 12) continue;
    spots.push({ x, z, ry: WIND_RY + (rnd() - 0.5) * 0.87, kind: rnd() < 0.75 ? 'sail' : 'power' });
  }
  // DuSable: a boat bow-in beside each slip finger (toward its dock)
  const docks = (H.dusable?.docks || []).map((d) => d.points);
  const distToDocks = (x, z) => Math.min(...docks.map((p) => _distLine(x, z, p)));
  for (const f of H.dusable?.slipFingers || []) {
    if (rnd() > 0.95 || f.points.length < 2) continue;
    const [a, b] = [f.points[0], f.points[f.points.length - 1]];
    const [dockEnd, outEnd] = distToDocks(a[0], a[1]) < distToDocks(b[0], b[1]) ? [a, b] : [b, a];
    const dx = dockEnd[0] - outEnd[0], dz = dockEnd[1] - outEnd[1], l = Math.hypot(dx, dz) || 1;
    // Beside the finger (half a slip), middle of its length, bow toward the dock
    const side = 0.55;
    spots.push({ x: (a[0] + b[0]) / 2 - dz / l * side, z: (a[1] + b[1]) / 2 + dx / l * side, ry: Math.atan2(-dz, dx), kind: rnd() < 0.35 ? 'sail' : 'power', slip: true });
  }
  // Keep the cap: drop at random, slips last
  while (spots.length > cap) spots.splice(Math.floor(rnd() * spots.length), 1);

  K.onTemplatesReady((sc, get) => {
    // kinds: parts + how far the keel sits below the lake surface (y 0.2)
    const kinds = {}, sinkOf = {};
    const sail = ctx.kit.sail && get(ctx.kit.sail);
    if (sail) { kinds.sail = _parts(sail, S * SAIL_SCALE); sinkOf.sail = 0.2 - 0.6 * S * SAIL_SCALE; }
    for (const [k, url, len, sinkM] of ctx.kit.extra || []) {
      const t = get(url);
      if (!t) continue;
      t.updateMatrixWorld(true);
      const sz = new THREE.Box3().setFromObject(t).getSize(new THREE.Vector3());
      const sc = S * SAIL_SCALE * len / Math.max(sz.x, sz.z); // true LOA x 1.5 (sizes in m)
      kinds[k] = _parts(t, sc, true);
      // White power-boat hulls sat over the noon bloom threshold: scale their
      // base colour so pure white lands near sRGB 0xd8 (as the CTA bus)
      if (!/sail/.test(k)) for (const p of kinds[k]) if (!p.mat.userData.harborToned) { p.mat.userData.harborToned = true; p.mat.color.multiplyScalar(0.69); }
      sinkOf[k] = 0.2 - (sinkM || 0) * sc;
    }
    if (!kinds.sail) return;
    // Boat kind per spot: sail = the classic moored sloop or the cruiser,
    // power = mostly motor yachts plus centre consoles (sail stands in for any
    // kind not delivered). One InstancedMesh per part per kind.
    const pick = (sp) => {
      const r = rnd();
      const k = sp.kind === 'sail' ? (r < 0.5 ? 'boat_cruiser_sail' : 'sail') : (r < 0.7 ? 'boat_motor_yacht' : 'boat_center_console');
      return kinds[k] ? k : 'sail';
    };
    const byKind = new Map();
    for (const sp of spots) {
      const k = pick(sp);
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k).push(sp);
    }
    const sink = sinkOf.sail;
    const all = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    // Near / far: every boat kind has a full-detail InstancedMesh set and an
    // LOD1 set (the ~300-tri twins). Boats within NEAR_R of the camera are
    // packed into the near set's first slots and the rest into the far set
    // (each set's count trimmed to its boats, so nothing is drawn twice).
    // +1 draw per part per kind, not per tile
    const NEAR_R = lite ? 45 : 70, groups = [];
    const lod1Of = ctx.K.lod1Of || (() => null);
    for (const [k, list] of byKind) {
      const ims = kinds[k].map((p) => {
        const mk = (geom) => {
          const im = new THREE.InstancedMesh(geom, p.mat, list.length);
          im.castShadow = false; im.receiveShadow = true;
          im.frustumCulled = false; // zero-matrix slots would stretch its bounds to the origin
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          scene.add(im);
          return im;
        };
        const g1 = lod1Of(p.geom);
        return { near: mk(p.geom), far: g1 ? mk(g1) : null, p };
      });
      const group = [];
      list.forEach((sp) => {
        q.setFromAxisAngle(up, sp.ry);
        const base = new THREE.Matrix4().compose(new THREE.Vector3(sp.x, sinkOf[k], sp.z), q, one);
        const b = { sp, ims, base, cur: base.clone(), alive: true, sinkT: -1, near: false, slot: 0 };
        all.push(b); group.push(b);
      });
      groups.push({ ims, boats: group });
    }
    // Write one boat's current pose into its slot of the set it's drawn from
    const put = (b) => {
      for (const { near, far, p } of b.ims) ((b.near || !far) ? near : far).setMatrixAt(b.slot, m.multiplyMatrices(b.cur, p.m));
    };
    const camPos = new THREE.Vector3(1e9, 0, 1e9), lastBand = new THREE.Vector3(1e9, 0, 1e9);
    // Re-pack every kind's near / far sets around the camera
    const band = () => {
      for (const { ims, boats } of groups) {
        const hasFar = ims.some((x) => x.far);
        let nn = 0, nf = 0;
        for (const b of boats) {
          b.near = !hasFar || Math.hypot(b.sp.x - camPos.x, b.sp.z - camPos.z) < NEAR_R;
          b.slot = b.near ? nn++ : nf++;
          put(b);
        }
        for (const { near, far } of ims) {
          near.count = nn; near.instanceMatrix.needsUpdate = true;
          if (far) { far.count = nf; far.instanceMatrix.needsUpdate = true; }
        }
      }
    };
    band();
    // The camera, read where three hands it over (like city.js's LOD controller)
    const probe = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    probe.frustumCulled = false;
    probe.onBeforeRender = (r, s, cam) => {
      cam.getWorldPosition(camPos);
      // Re-band when the camera has moved a few units (the next frame shows it)
      if (Math.hypot(camPos.x - lastBand.x, camPos.z - lastBand.z) > 6) { lastBand.copy(camPos); band(); }
    };
    scene.add(probe);
    // Smash: a boat within the kaiju's reach rolls over on its side (1.2 s),
    // then goes down (2 s), with a white splash burst and a foam ring. The
    // spray is pooled: one InstancedMesh of droplets and one of rings for the
    // whole harbour, so a smash adds no draws
    const world = ctx.world;
    const tilt = new THREE.Matrix4(), drop = new THREE.Matrix4();
    const ROLL_T = 1.2, SINK_T = 2.0;
    const fx = _splashPool(scene, lite ? 200 : 600, lite ? 12 : 32);
    animators.push(fx);
    let acc = 0;
    animators.push({
      update(dt) {
        const kp = world.kaijuPos;
        acc += dt;
        let dirty = null;
        for (const b of all) {
          if (b.alive && kp && acc > 0.1 && Math.abs(kp.x - b.sp.x) < 8 && Math.abs(kp.z - b.sp.z) < 8) {
            b.alive = false; b.sinkT = 0;
            fx.burst(b.sp.x, b.sp.z, lite ? 12 : 28);
            world.onCarDestroyed?.();
          }
          if (b.sinkT >= 0 && b.sinkT < ROLL_T + SINK_T) {
            b.sinkT += dt;
            const r = Math.min(1, b.sinkT / ROLL_T), k = Math.max(0, (b.sinkT - ROLL_T) / SINK_T);
            // Ease the roll in, then the hull slides under still heeled over
            tilt.makeRotationX((1 - (1 - r) * (1 - r)) * 1.35);
            drop.makeTranslation(0, -(Math.min(1, k) ** 1.5) * 3.6, 0);
            b.cur.multiplyMatrices(drop, b.base).multiply(tilt);
            put(b);
            dirty = dirty || new Set();
            for (const { near, far } of b.ims) { dirty.add(near); if (far) dirty.add(far); }
            // A second, smaller splash as it goes under
            if (b.sinkT - dt < ROLL_T && b.sinkT >= ROLL_T) fx.burst(b.sp.x, b.sp.z, lite ? 5 : 10, 0.6, false);
          }
        }
        if (acc > 0.1) acc = 0;
        if (dirty) for (const im of dirty) im.instanceMatrix.needsUpdate = true;
      },
    });

    // A few boats under sail out on the lake, east of the breakwaters
    const n = lite ? 2 : 5, parts = kinds.sail;
    const sailing = parts.map((p) => { const im = new THREE.InstancedMesh(p.geom, p.mat, n); im.castShadow = false; im.frustumCulled = false; scene.add(im); return { im, p }; });
    const paths = Array.from({ length: n }, (_, i) => ({ cx: 230 + i * 28, cz: -220 + i * 95, r: 24 + rnd() * 30, w: (0.025 + rnd() * 0.02) * (i % 2 ? 1 : -1), a: rnd() * 6.28 }));
    animators.push({
      update(dt) {
        paths.forEach((pa, i) => {
          pa.a += pa.w * dt * 3;
          const x = pa.cx + Math.cos(pa.a) * pa.r, z = pa.cz + Math.sin(pa.a) * pa.r;
          // Bow (+X) along the direction of travel, heeled a little to leeward
          q.setFromAxisAngle(up, Math.atan2(-Math.cos(pa.a) * Math.sign(pa.w), -Math.sin(pa.a) * Math.sign(pa.w)));
          const base = new THREE.Matrix4().compose(new THREE.Vector3(x, sink, z), q, one).multiply(tilt.makeRotationX(0.12));
          for (const { im, p } of sailing) im.setMatrixAt(i, m.multiplyMatrices(base, p.m));
        });
        for (const { im } of sailing) im.instanceMatrix.needsUpdate = true;
      },
    });
  });
  return spots.length;
}

/** Pooled water spray: n droplets (soft round sprites, one Points draw,
 *  fading as they fall) and r foam rings (one InstancedMesh); burst() takes
 *  the oldest. */
function _splashPool(scene, n, r) {
  const dpos = new Float32Array(n * 3).fill(-1000), dcol = new Float32Array(n * 3);
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3).setUsage(THREE.DynamicDrawUsage));
  dgeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3).setUsage(THREE.DynamicDrawUsage));
  // Additive, so a droplet fades by its colour; camera-facing by nature
  const dmat = new THREE.PointsMaterial({ size: 0.5, map: _dropTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const drops = new THREE.Points(dgeo, dmat);
  drops.frustumCulled = false;
  scene.add(drops);
  // Foam: one soft, broken ring per smash (a feathered radial band with
  // noise in a small canvas texture), additive so it fades by colour
  const ringMat = new THREE.MeshBasicMaterial({ map: _foamTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const ringGeom = new THREE.PlaneGeometry(2, 2);
  ringGeom.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeom, ringMat, r);
  rings.frustumCulled = false; rings.castShadow = false; rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(rings);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < r; i++) rings.setMatrixAt(i, zero);
  const D = Array.from({ length: n }, () => ({ t: -1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  const R = Array.from({ length: r }, () => ({ t: -1, x: 0, z: 0, s: 1, ry: 0 }));
  const col = new THREE.Color();
  for (let i = 0; i < r; i++) rings.setColorAt(i, col.setRGB(0, 0, 0));
  const RING_T = 1.2, up = new THREE.Vector3(0, 1, 0);
  let di = 0, ri = 0, live = 0;
  const m = new THREE.Matrix4(), rq = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  return {
    burst(x, z, count, size = 1, ring = true) {
      for (let k = 0; k < count; k++) {
        const d = D[di]; di = (di + 1) % n;
        const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.8) * size;
        d.t = 0; d.s = (0.6 + Math.random() * 0.5) * size;
        d.p.set(x + Math.cos(a) * 0.6, 0.3, z + Math.sin(a) * 0.6);
        d.v.set(Math.cos(a) * sp, (3 + Math.random() * 3) * size, Math.sin(a) * sp);
      }
      if (ring) {
        const g = R[ri]; ri = (ri + 1) % r;
        g.t = 0; g.x = x; g.z = z; g.s = size; g.ry = Math.random() * Math.PI * 2;
      }
      live = 2.2;
    },
    update(dt) {
      if (live <= 0) return;
      live -= dt;
      D.forEach((d, i) => {
        if (d.t < 0) return;
        d.t += dt;
        d.v.y -= 9 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0.15 || d.t > 1.6) { d.t = -1; dpos[i * 3 + 1] = -1000; return; }
        dpos[i * 3] = d.p.x; dpos[i * 3 + 1] = d.p.y; dpos[i * 3 + 2] = d.p.z;
        // Bright at the burst, fading as it falls back
        const f = d.s * 0.9 * Math.max(0, 1 - d.t / 1.4) * (d.v.y > 0 ? 1 : 0.7);
        dcol[i * 3] = dcol[i * 3 + 1] = f * 0.95; dcol[i * 3 + 2] = f;
      });
      R.forEach((g, i) => {
        if (g.t < 0) return;
        g.t += dt;
        if (g.t > RING_T) { g.t = -1; rings.setMatrixAt(i, zero); rings.setColorAt(i, col.setRGB(0, 0, 0)); return; }
        // Spreads from ~1.5u to ~4u, fading out (ease-out) as it goes
        const k = g.t / RING_T, rad = (1.5 + 2.6 * (1 - (1 - k) * (1 - k))) * g.s, a = 0.5 * (1 - k) * (1 - k * 0.3);
        sc.set(rad, 1, rad);
        pos.set(g.x, 0.24, g.z);
        rings.setMatrixAt(i, m.compose(pos, rq.setFromAxisAngle(up, g.ry), sc));
        rings.setColorAt(i, col.setRGB(a, a, a));
      });
      dgeo.attributes.position.needsUpdate = true;
      dgeo.attributes.color.needsUpdate = true;
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    },
  };
}

/** 32px round droplet sprite: soft white disc, feathered edge */
function _dropTex() {
  const N = 32, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 128px foam ring: a radial band feathered on both edges (peak at r 0.72),
 *  broken up by angular and fine noise; black outside (additive) */
function _foamTex() {
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(N, N), d = img.data;
  const lobes = Array.from({ length: 7 }, () => [Math.random() * 6.28, 0.3 + Math.random() * 0.5]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
    const band = Math.exp(-(((r - 0.72) / 0.12) ** 2));
    let broken = 0.55;
    for (const [ph, w] of lobes) broken += 0.12 * w * Math.sin(a * 3 + ph * 2 + Math.sin(a * 5 + ph));
    const grain = 0.75 + 0.25 * Math.random();
    const val = Math.max(0, Math.min(1, band * broken * grain * 1.6)) * 255;
    const i = (y * N + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = val; d[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function _distLine(x, z, pts) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}
