# Combat VFX, build 1.11.123

The pass reuses the existing fire, smoke and dust flipbooks; no new download is
needed. `src/powerVfx.js` owns the new effects and their complete lifetime.

- Explosions: staggered combustion, expanding ground dust, rising smoke,
  ballistic fragments, cooling embers, brief pooled lighting and timed scorch.
  Five draws maximum, 3.2 seconds, with quality-scaled particle counts.
- Collapse dust: two instanced layers, spreading at the base and lifting clear
  of the terrain. Fine grit settles before the larger dust disperses.
- Guns: short moving tracers leave the authored muzzle and converge on the
  gameplay hit point. Infantry/helicopter bullets and tank shells have distinct
  widths and speeds. Damage remains in the existing gameplay code.
- Impacts: directional ejecta and dust, tinted for concrete or Kaiju armor.
  Energy impacts use a brief hot core, cool sparks and dust instead of fireballs.
- Kaiju: motes gather at the animated head during the warning. Beam lifetime
  and width are reduced to prevent successive pulses washing out the scene.
- Festival lighting: fewer, narrower, softly faded cones with gentle color
  changes; the rapid strobe and opaque-looking daytime shafts are removed.

All new particle layers fade near the camera and preserve world depth testing.
Each effect owns its geometry and materials, while atlas textures remain shared.
Forced retirement runs the same disposal path as natural expiry. Explosion light
leases cannot turn off a light that has since been reassigned to another effect.

Validation covers finite instance data, five-draw budgets, moving charge sources,
idempotent cleanup, and weapon hit routing. Chrome renders validate shader programs
with the game's bloom pipeline and in the Chicago scene during repeated AI attacks.
