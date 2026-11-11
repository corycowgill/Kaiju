// Match director: entrances, bell, best-of-three falls, pin / KO resolution,
// between-fall corner advice, win / loss, title defenses, and the crowd-heat
// and callout cues the presentation modules listen for.
// OWNER: combat core. INTEGRATOR STARTING POINT: the slice is one fall with
// no entrance - bell, fight, first KO ends the match - so the win and loss
// screens and the restart path are real.
//
// Flow hooks waiting in ctx: ctx.offerUpgrades(continuation) for corner
// advice (pauses the sim; W.updateIdle keeps running), ctx.loadRival(key) for
// a title defense against the third kaiju, ctx.military.spawn(...) for
// interference, ctx.rules (regen / passive momentum switches), ctx.gameOver.
import { EV } from './events.js';

const KO_HOLD = 1.8; // real seconds between the deciding KO and the result screen

/** @returns {{ state, start, update, updateIdle, gameOverText, end, dispose }} */
export function createMatch(ctx, W) {
  /** Live match state (read-only for other modules; HUD polls it). */
  const s = { phase: 'idle', fall: 0, playerFalls: 0, rivalFalls: 0, bestOf: 1, time: 0, defense: 0, winner: '', by: '' };
  let overT = -1, reported = false;
  const bus = W.bus;

  function setPhase(phase) {
    if (phase === s.phase) return;
    const e = bus.ev(EV.MATCH_PHASE);
    e.phase = phase; e.prev = s.phase;
    s.phase = phase;
    bus.emit(EV.MATCH_PHASE);
  }
  function bell(kind, rings) {
    const e = bus.ev(EV.BELL);
    e.kind = kind; e.rings = rings;
    bus.emit(EV.BELL);
  }

  function decide(winner, by) {
    const loser = winner === 'player' ? 'rival' : 'player';
    if (winner === 'player') s.playerFalls++; else s.rivalFalls++;
    s.winner = winner; s.by = by;
    let e = bus.ev(EV.FALL_END);
    e.fall = s.fall; e.winner = winner; e.loser = loser; e.by = by; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls;
    bus.emit(EV.FALL_END);
    setPhase('over');
    bell('end', 3);
    e = bus.ev(EV.MATCH_OVER);
    e.winner = winner; e.loser = loser; e.by = by; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls; e.time = s.time; e.defense = s.defense;
    bus.emit(EV.MATCH_OVER);
    const name = winner === 'player' ? EV.MATCH_WON : EV.MATCH_LOST;
    e = bus.ev(name);
    e.by = by; e.playerFalls = s.playerFalls; e.rivalFalls = s.rivalFalls; e.time = s.time; e.defense = s.defense;
    bus.emit(name);
    e = bus.ev(EV.CAM_CUE);
    e.shot = winner === 'player' ? 'win' : 'lose'; e.who = winner; e.dur = 0;
    bus.emit(EV.CAM_CUE);
    // The winner celebrates over the body ('cinematic': nothing else drives it)
    W[winner].setState('cinematic');
    W.anims.play(W[winner], 'taunt_win');
    W.slowMo(0.3, 0.9);
    if (winner === 'player') ctx.addScore(5000);
    overT = 0;
  }

  return {
    state: s,
    start() {
      s.phase = 'idle'; s.fall = 1; s.playerFalls = 0; s.rivalFalls = 0; s.time = 0; s.winner = ''; s.by = '';
      overT = -1; reported = false;
      let e = bus.ev(EV.MATCH_START);
      e.playerKey = W.player.key; e.rivalKey = W.rival.key; e.playerName = W.player.name; e.rivalName = W.rival.name;
      e.bestOf = s.bestOf; e.defense = s.defense;
      bus.emit(EV.MATCH_START);
      setPhase('fight');
      e = bus.ev(EV.FALL_START);
      e.fall = s.fall;
      bus.emit(EV.FALL_START);
      bell('start', 1);
      ctx.ui.banner(`${W.player.name} VS ${W.rival.name}`, 'CHICAGO HEAVYWEIGHT TITLE · GRANT PARK');
    },
    update(dt, dtReal) {
      if (s.phase === 'fight') {
        s.time += dt;
        if (!W.rival.alive) decide('player', 'ko');
        else if (!W.player.alive) decide('rival', 'ko');
      } else if (s.phase === 'over' && overT >= 0 && !reported) {
        overT += dtReal;
        if (overT >= KO_HOLD) {
          reported = true;
          ctx.gameOver(s.winner === 'player', this.gameOverText(s.winner === 'player'));
        }
      }
    },
    updateIdle(dtReal) {},
    /** Result-screen strings (game.js asks for these if the run ends some other way, e.g. __qa.gameOver). */
    gameOverText(victory) {
      return victory
        ? { title: 'AND NEW...', subtitle: `${W.player.name} · CHICAGO HEAVYWEIGHT CHAMPION`, waveLabel: 'Falls Won', waveValue: `${s.playerFalls} - ${s.rivalFalls}`, keepPose: true }
        : { title: `${W.rival.name} WINS`, subtitle: 'Counted out cold in Grant Park...', waveLabel: 'Falls Won', waveValue: `${s.playerFalls} - ${s.rivalFalls}`, keepPose: true };
    },
    /** QA: end the match now as a win for 'player' or 'rival'. */
    end(winner) { if (s.phase === 'fight') decide(winner, 'ko'); },
    dispose() { s.phase = 'idle'; overT = -1; },
  };
}
