// Circle/AABB contact shared by normal walking and charge. Low structures
// collapse before displacement so tents cannot steal a frame of movement.
export function resolveStructureContact(pos, radius, b, dt, world, hit) {
  if (b.destroyed) return;
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
