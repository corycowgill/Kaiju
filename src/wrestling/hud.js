// Match HUD: both health bars with portraits and names, stamina, momentum,
// fall pips, clock, move callouts, context prompts, commentary ticker.
// OWNER: HUD + input engineer. INTEGRATOR STARTING POINT: the slice borrows
// the classic boss bar for the rival's health and shows nothing else. Your
// markup and CSS go in index.html (HUD block only, not the import map); add
// new layers to the body.hud-prewarm selector list so their raster programs
// compile behind the loading screen, and keep to the HUD rules there (bars
// move with transform: scaleX, no animated blur / box-shadow).
//
// Read-only sources: W.player / W.rival (hp, maxHp, stamina, momentum, name,
// key, state), W.match.state (phase, fall, playerFalls, rivalFalls, time),
// events 'callout', 'prompt', 'commentary', 'pin:count', 'fall:end'...
// Lifecycle: start() shows, onGameOver()/dispose() hide. update() runs every
// frame: touch the DOM only when a quantised value changed.
import { EV } from './events.js';

/** @returns {{ start, update, updateIdle, onGameOver, dispose }} */
export function createHud(ctx, W) {
  const doc = typeof document !== 'undefined' && document.getElementById ? document : null;
  let bar = null, nameEl = null, fill = null, nameWas = '', last = -1, lastT = 0;
  return {
    start() {
      if (!doc) return;
      bar = doc.getElementById('boss-bar'); nameEl = doc.getElementById('boss-name'); fill = doc.getElementById('boss-hp');
      if (!bar || !nameEl || !fill) { bar = null; return; }
      nameWas = nameEl.innerHTML;
      nameEl.textContent = W.rival.name;
      bar.style.display = 'block';
      last = -1;
    },
    update(dt, dtReal) {
      if (!bar) return;
      const now = performance.now();
      if (now - lastT < 100) return; // 10 Hz like the classic HUD
      lastT = now;
      const v = Math.round(Math.max(0, W.rival.hp / W.rival.maxHp) * 200);
      if (v !== last) { last = v; fill.style.transform = `scaleX(${v / 200})`; }
    },
    updateIdle(dtReal) {},
    /** The run ended (result screen up): game.js has hidden the classic HUD. */
    onGameOver(victory) {},
    dispose() {
      if (!bar) return;
      bar.style.display = 'none';
      nameEl.innerHTML = nameWas; // the boss wave's own label
      fill.style.transform = '';
      bar = null;
    },
  };
}
