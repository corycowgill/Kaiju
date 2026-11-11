// Wrestling audio layer: ring bell, crowd bed that follows crowd:intensity,
// pops / boos / "ooh" on near-falls, the crowd counting along with pins,
// heavy slam layers, grapple strain, rope twang, entrance stings.
// OWNER: audio engineer. INTEGRATOR STARTING POINT: a synthesized bell and
// the existing hit / stomp samples on three events.
//
// Rules: driven by events only. ctx.audio is the game's audio singleton
// (../audio.js: sample bank, tone(), noise(), _aim() for per-frame gain
// targets). New samples ship as .ogg + .m4a and need a row in its SFX table;
// audio.js is yours to extend (explicit-kaiju roar / beam voices, a duckMusic
// that coexists with updateStages, an SFX bus). 'time:hitstop' / 'time:slowmo'
// tell you when the sim freezes or slows.
import { EV } from './events.js';

/** @returns {{ start, update, updateIdle, dispose }} */
export function createSfx(ctx, W) {
  const offs = [];
  const audio = ctx.audio;
  const ding = (rings) => {
    for (let i = 0; i < rings; i++) {
      setTimeout(() => { audio.tone(1568, 1.1, 'triangle', 0.5); audio.tone(2349, 0.7, 'sine', 0.25); }, i * 260);
    }
  };
  return {
    start() {
      offs.push(W.bus.on(EV.BELL, (e) => ding(e.rings)));
      offs.push(W.bus.on(EV.STRIKE_LANDED, () => audio.hit()));
      offs.push(W.bus.on(EV.KO, () => audio.stomp()));
    },
    update(dt, dtReal) {},
    updateIdle(dtReal) {},
    dispose() { for (const off of offs) off(); offs.length = 0; },
  };
}
