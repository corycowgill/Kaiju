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
    for (const [k, list] of byKind) {
      const ims = kinds[k].map((p) => {
        const im = new THREE.InstancedMesh(p.geom, p.mat, list.length);
        im.castShadow = false; im.receiveShadow = true;
        scene.add(im);
        return { im, p };
      });
      list.forEach((sp, i) => {
        q.setFromAxisAngle(up, sp.ry);
        const base = new THREE.Matrix4().compose(new THREE.Vector3(sp.x, sinkOf[k], sp.z), q, one);
        for (const { im, p } of ims) im.setMatrixAt(i, m.multiplyMatrices(base, p.m));
        all.push({ sp, i, ims, base, alive: true, sinkT: -1 });
      });
      for (const { im } of ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    }
    // Smash: a boat within the kaiju's reach tips over and goes down
    const world = ctx.world;
    const tilt = new THREE.Matrix4(), drop = new THREE.Matrix4();
    let acc = 0;
    animators.push({
      update(dt) {
        const kp = world.kaijuPos;
        acc += dt;
        let dirty = null;
        for (const b of all) {
          if (b.alive && kp && acc > 0.1 && Math.abs(kp.x - b.sp.x) < 6 && Math.abs(kp.z - b.sp.z) < 6) {
            b.alive = false; b.sinkT = 0;
            const p = new THREE.Vector3(b.sp.x, 0.4, b.sp.z);
            world.spawnShockwave?.(p, 0xcfeeff, 4);
            world.spawnSmoke?.(p, 0.8);
            world.onCarDestroyed?.();
          }
          if (b.sinkT >= 0 && b.sinkT < 2.5) {
            b.sinkT += dt;
            const k = Math.min(1, b.sinkT / 2.5);
            tilt.makeRotationX(k * 1.1);
            drop.makeTranslation(0, -k * 3 * S * SAIL_SCALE * 4, 0);
            const mm = new THREE.Matrix4().multiplyMatrices(drop, b.base).multiply(tilt);
            for (const { im, p } of b.ims) im.setMatrixAt(b.i, m.multiplyMatrices(mm, p.m));
            dirty = dirty || new Set();
            for (const { im } of b.ims) dirty.add(im);
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
