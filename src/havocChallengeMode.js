import * as THREE from 'three';
import { createChallengeAttempt, selectChallengeTargets } from './havocChallenges.js';

export const missionClock = (seconds) => { const s = Math.ceil(Math.max(0, seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** A run owns its beacons and HUD. No timers or actor references escape dispose. */
export function createHavocChallengeMode({ mission, scene, world, state, onStart, onWave, onFinish }) {
  const selection = selectChallengeTargets(mission, world.buildings, state.kaiju.root.position);
  for (const b of selection.targets) b.hp = Math.min(b.hp, 160 + mission.rank * 25);
  const marked = [...selection.targets.map((b) => ({ b, protected: false })), ...selection.protected.map((b) => ({ b, protected: true }))];
  const group = new THREE.Group(); group.name = 'challenge-beacons';
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  const ringGeometry = new THREE.RingGeometry(.88, 1, 32); ringGeometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const ringsMaterial = material.clone(); ringsMaterial.opacity = .85;
  const beams = new THREE.InstancedMesh(geometry, material, marked.length || 1);
  const rings = new THREE.InstancedMesh(ringGeometry, ringsMaterial, marked.length || 1);
  beams.count = rings.count = marked.length; beams.frustumCulled = rings.frustumCulled = false;
  group.add(beams, rings); scene.add(group);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  function syncBeacons() {
    for (let i = 0; i < marked.length; i++) {
      const { b, protected: ally } = marked[i];
      const radius = Math.max(b.w, b.d) * .6 + 4, height = Math.max(30, b.h + 15);
      const ground = b.group?.position?.y || 0;
      position.set(b.x, ground + height / 2, b.z); scale.set(radius, b.destroyed ? 0 : height, radius);
      matrix.compose(position, quaternion, scale); beams.setMatrixAt(i, matrix);
      position.y = ground + .4; scale.set(b.destroyed ? 0 : radius, 1, radius);
      matrix.compose(position, quaternion, scale); rings.setMatrixAt(i, matrix);
      color.set(ally ? '#62ffc0' : '#ffcb60'); beams.setColorAt(i, color); rings.setColorAt(i, color);
    }
    beams.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = true;
  }
  syncBeacons();
  const hud = document.createElement('section'); hud.id = 'hc-hud'; hud.setAttribute('aria-label', 'City challenge objective');
  hud.innerHTML = `<div class="hc-hud-top"><span>${mission.name.toUpperCase()}</span><b class="hc-clock"></b></div><p class="hc-objective"></p><div class="hc-hud-track"><i></i></div><p class="hc-detail"></p><span class="hc-medal-pace"></span>`;
  document.body.appendChild(hud);
  let refreshTime = 0, disposed = false;
  const attempt = createChallengeAttempt({ mission, ...selection, onStart, onWave,
    onFinish(result, notify) { hud.hidden = true; group.visible = false; onFinish(result, notify); } });
  function refresh() {
    const left = Math.max(0, mission.limit - attempt.elapsed), remaining = attempt.remaining;
    hud.querySelector('.hc-clock').textContent = missionClock(left);
    hud.classList.toggle('hc-urgent', left < 30);
    hud.querySelector('.hc-objective').textContent = mission.kind === 'siege'
      ? `ASSAULT ${attempt.assault + 1} / 3 · ${world.enemies.filter((e) => !e.dead).length} UNITS LEFT`
      : `${mission.goal - remaining} / ${mission.goal} ${mission.kind === 'precision' ? 'LANDMARK' : 'MARKED TARGETS'} DESTROYED`;
    hud.querySelector('.hc-hud-track i').style.transform = `scaleX(${mission.kind === 'siege' ? attempt.assault / 3 : (mission.goal - remaining) / mission.goal})`;
    const nearest = selection.targets.filter((b) => !b.destroyed).reduce((best, b) => Math.min(best, Math.hypot(b.x - state.kaiju.root.position.x, b.z - state.kaiju.root.position.z)), Infinity);
    hud.querySelector('.hc-detail').textContent = mission.kind === 'precision' ? `KEEP ALL ${selection.protected.length} GREEN BUILDINGS STANDING · ${Math.round(nearest)}m TO TARGET`
      : mission.allowed ? `ALLOWED: ${mission.allowed.join(' + ').toUpperCase()}${Number.isFinite(nearest) ? ` · TARGET ${Math.round(nearest)}m` : ''}`
      : mission.kind === 'siege' ? 'DEFEAT THE BOSS IN THE FINAL ASSAULT' : `${Number.isFinite(nearest) ? `NEAREST TARGET ${Math.round(nearest)}m · ` : ''}FOLLOW GOLD BEACONS / MINIMAP DIAMONDS`;
    hud.querySelector('.hc-medal-pace').textContent = attempt.elapsed <= mission.gold ? `GOLD PACE · FINISH BY ${missionClock(mission.gold)}` : attempt.elapsed <= mission.silver ? `SILVER PACE · FINISH BY ${missionClock(mission.silver)}` : 'BRONZE PACE · FINISH BEFORE TIME EXPIRES';
  }
  return {
    mission, selection, attempt,
    start() { attempt.start(); refresh(); },
    building(b, by) { attempt.building(b, by); if (marked.some((item) => item.b === b)) syncBeacons(); },
    kill(kind, by) { attempt.kill(kind, by); },
    allows: (power) => attempt.allows(power),
    pause(on) { hud.hidden = on || !!attempt.result; },
    finishFromGameOver() { return attempt.finish(false, 'DEFEATED', state.score, false); },
    update(dt) {
      if (disposed || attempt.result) return;
      attempt.step(dt, { hp: state.hp, score: state.score, armyRemaining: world.enemies.filter((e) => !e.dead).length });
      refreshTime += dt;
      if (refreshTime >= .1 && !attempt.result) { refreshTime = 0; refresh(); }
    },
    minimap(ctx, w2m, width, height) {
      if (attempt.result) return;
      for (const { b, protected: ally } of marked) {
        if (b.destroyed) continue;
        const [mx, my] = w2m(b.x, b.z), x = Math.max(5, Math.min(width - 5, mx)), y = Math.max(5, Math.min(height - 5, my));
        ctx.strokeStyle = ally ? '#62ffc0' : '#ffcb60'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.stroke();
      }
    },
    dispose() {
      if (disposed) return; disposed = true; hud.remove(); group.removeFromParent();
      geometry.dispose(); ringGeometry.dispose(); material.dispose(); ringsMaterial.dispose(); beams.dispose(); rings.dispose();
    },
  };
}
