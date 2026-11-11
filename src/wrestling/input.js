// Raw input -> the player's intent. The only wrestling module that reads
// ctx.input; everything else reads W.player.intent or W.input.ui.
// OWNER: HUD + input engineer. INTEGRATOR STARTING POINT: a first desktop /
// gamepad binding so the intent struct is live; touch buttons, hold-for-heavy
// timing, remapping and the #help text are yours.
//
// Raw input available (ctx.input, see notes/wrestling_api.md):
//   held(code) / pressed(code) / released(code)   keyboard codes ('KeyE'),
//       'Mouse0' | 'Mouse1' | 'Mouse2', and any code a touch button was bound
//       to with ctx.input.bindTouchButton(el, code)
//   moveX / moveZ   the combined keyboard + stick + touch-joystick vector
//       (x = right, z = forward, length <= 1), sprint, attack (melee held)
//   pad.down(i) / pad.pressed(i) / pad.axis(i) / pad.lt / pad.rt
//   pad.reserve(i)  take a button away from its classic job (6 = LT sprint, 8 = Back pause)
// The classic bindings stay live unless ctx.player.control says otherwise:
// WASD/stick move, Shift/LB sprint, LMB/A melee, 1 2 3 Space Q powers.

// First-pass bindings (free keys: E F R T Tab C V; free pad: d-pad 12-15, L3 10, R3 11)
const KEY = { grab: 'KeyE', block: 'Mouse2', blockAlt: 'KeyC', taunt: 'KeyR', finisher: 'KeyQ', heavy: 'KeyF', lock: 'Tab', lockAlt: 'KeyT', skip: 'Enter' };
// (pad face buttons and RB / RT are the classic powers: X beam, B roar, Y charge, RB stomp, RT ult)
const PAD = { strike: 0, grab: 13, block: 6, taunt: 12, lock: 11, heavy: 15, finisher: 7, skip: 0 };

/** @returns {{ start, update, dispose, ui }} */
export function createInput(ctx, W) {
  const inp = ctx.input;
  /** Non-combat actions other modules poll (edges, true for one frame). */
  const ui = { lockToggle: false, skip: false };
  return {
    ui,
    start() {
      ui.lockToggle = false; ui.skip = false;
      inp.pad.reserve(PAD.block, true); // LT becomes block (LB still sprints)
    },
    /** Fill W.player.intent for this frame. */
    update(dt) {
      const it = W.player.intent, pad = inp.pad;
      // Movement in world space, on the same basis updatePlayer uses
      const c = ctx.player.control;
      const yaw = c.moveYaw !== null ? c.moveYaw : ctx.player.yaw;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      it.moveX = sy * inp.moveZ - cy * inp.moveX;
      it.moveZ = cy * inp.moveZ + sy * inp.moveX;
      it.sprint = inp.sprint;
      it.strike = inp.pressed('Mouse0') || pad.pressed(PAD.strike) || inp.pressed('TouchAttack');
      it.strikeHeld = inp.attack;
      it.heavy = inp.pressed(KEY.heavy) || pad.pressed(PAD.heavy);
      it.block = inp.held(KEY.block) || inp.held(KEY.blockAlt) || pad.lt > 0.4;
      it.grab = inp.pressed(KEY.grab) || pad.pressed(PAD.grab);
      it.grabHeld = inp.held(KEY.grab) || pad.down(PAD.grab);
      it.dirX = inp.moveX; it.dirZ = inp.moveZ;
      it.taunt = inp.pressed(KEY.taunt) || pad.pressed(PAD.taunt);
      it.finisher = inp.pressed(KEY.finisher) || pad.pressed(PAD.finisher);
      it.mash = (it.strike ? 1 : 0) + (it.grab ? 1 : 0) + (inp.pressed('Space') ? 1 : 0);
      ui.lockToggle = inp.pressed(KEY.lock) || inp.pressed(KEY.lockAlt) || pad.pressed(PAD.lock);
      ui.skip = inp.pressed(KEY.skip) || pad.pressed(PAD.skip);
    },
    dispose() { inp.pad.reserve(PAD.block, false); },
  };
}
