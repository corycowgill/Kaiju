// Circle/AABB contact shared by normal walking and charge. Low structures
// collapse before displacement so tents cannot steal a frame of movement.
export function resolveStructureContact(pos, radius, b, dt, world, hit) {
  if (b.destroyed) return;
  // A turned lot (b.obb, the Manhattan grid): the same contact in its own frame
  // (one bitten into keeps its axis box: the bites are axis squares)
  if (b.obb && !(b._wound && b._wound.bitesAt && b._wound.bitesAt.length)) {
    const t = obbTouch(pos, radius, b);
    if (!t) return;
    hit.set(t.x, Math.min(b.h * 0.6, radius), t.z);
    if (!b.isBridge && (b.crushOnContact || b.isFence || b.h <= radius * 0.85)) { b.damage(b.hp + 1, hit, world); return; }
    b.damage(35 * dt, hit, world);
    if (!b.destroyed) obbPush(pos, radius, b, t);
    return;
  }
  const bx = b.x, bz = b.z, hw = b.w / 2, hd = b.d / 2;
  const cx = Math.max(bx - hw, Math.min(bx + hw, pos.x));
  const cz = Math.max(bz - hd, Math.min(bz + hd, pos.z));
  const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;
  // A block bitten out of it (wrestling/carve.js): that part of the footprint is open ground now
  const wd = b._wound;
  if (wd && wd.bitesAt && wd.bitesAt.length) {
    const hs = wd.biteHalf || 11;
    let best = null, bd = 1e9;
    for (const q of wd.bitesAt) {
      if (Math.abs(cx - q.x) <= hs && Math.abs(cz - q.z) <= hs) return; // the nearest part of it is the hole
      const ex = Math.max(q.x - hs, Math.min(q.x + hs, pos.x)) - pos.x, ez = Math.max(q.z - hs, Math.min(q.z + hs, pos.z)) - pos.z, e = ex * ex + ez * ez;
      if (e < bd) { bd = e; best = q; }
    }
    // inside the footprint beside a hole: the hole's own wall stops it (not a jump to the outer wall)
    if (d2 <= 1e-6 && best && bd < radius * radius) {
      hit.set(pos.x, Math.min(b.h * 0.6, radius), pos.z);
      b.damage(35 * dt, hit, world);
      if (b.destroyed) return;
      pos.x = Math.max(best.x - hs, Math.min(best.x + hs, pos.x));
      pos.z = Math.max(best.z - hs, Math.min(best.z + hs, pos.z));
      return;
    }
  }
  hit.set(cx, Math.min(b.h * 0.6, radius), cz);
  // Bridges carry roads; their shallow deck is never a crushable kiosk.
  if (!b.isBridge && (b.crushOnContact || b.isFence || b.h <= radius * 0.85)) {
    b.damage(b.hp + 1, hit, world);
    return;
  }
  // Damage first: a building that falls this frame must not push us back.
  b.damage(35 * dt, hit, world);
  if (b.destroyed) return;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    pos.x = cx + dx / d * radius;
    pos.z = cz + dz / d * radius;
  } else {
    const exits = [pos.x - bx + hw, bx + hw - pos.x, pos.z - bz + hd, bz + hd - pos.z];
    const edge = exits.indexOf(Math.min(...exits));
    if (edge === 0) pos.x = bx - hw - radius;
    else if (edge === 1) pos.x = bx + hw + radius;
    else if (edge === 2) pos.z = bz - hd - radius;
    else pos.z = bz + hd + radius;
  }
}

// ---- oriented footprints ----
// b.obb = { hw, hd, c, s }: half sizes along the lot's own axes and the cos /
// sin of its turn (three.js rotation.y: local X lies along world (c, -s)).
// b.w / b.d stay the axis box round it (broad phase, everything approximate).
const _t = { x: 0, z: 0, lx: 0, lz: 0, cx: 0, cz: 0, d2: 0 };
/** Contact of a circle at pos with b's oriented footprint: the nearest
 *  footprint point (x, z) and the local frame values, or null when clear.
 *  (Scratch result, valid until the next call.) */
export function obbTouch(pos, radius, b) {
  const { hw, hd, c, s } = b.obb;
  const rx = pos.x - b.x, rz = pos.z - b.z;
  const lx = rx * c - rz * s, lz = rx * s + rz * c;
  const cx = Math.max(-hw, Math.min(hw, lx)), cz = Math.max(-hd, Math.min(hd, lz));
  const dx = lx - cx, dz = lz - cz, d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  _t.lx = lx; _t.lz = lz; _t.cx = cx; _t.cz = cz; _t.d2 = d2;
  _t.x = b.x + cx * c + cz * s; _t.z = b.z - cx * s + cz * c;
  return _t;
}
/** Push pos out of b's oriented footprint to radius (t from obbTouch). */
export function obbPush(pos, radius, b, t) {
  const { hw, hd, c, s } = b.obb;
  let nx = t.lx, nz = t.lz;
  if (t.d2 > 1e-6) {
    const d = Math.sqrt(t.d2);
    nx = t.cx + (t.lx - t.cx) / d * radius; nz = t.cz + (t.lz - t.cz) / d * radius;
  } else {
    const exits = [t.lx + hw, hw - t.lx, t.lz + hd, hd - t.lz];
    const edge = exits.indexOf(Math.min(...exits));
    if (edge === 0) nx = -hw - radius; else if (edge === 1) nx = hw + radius;
    else if (edge === 2) nz = -hd - radius; else nz = hd + radius;
  }
  pos.x = b.x + nx * c + nz * s; pos.z = b.z - nx * s + nz * c;
}
