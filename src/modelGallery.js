import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cachedFetch, withParseSlot } from './assetCache.js';

const exhibits = [
  ['Kaiju', 'Gorrak', 'kaiju_model/godzilla.glb', 'A nuclear reactor with teeth. The city asked him to lower his carbon footprint. He lowered his foot.'],
  ['Kaiju', 'Tridon', 'ghidorah_model/ghidorah.glb', 'Three heads, one body, and no agreement about which way to fly. All three voted to destroy the airport.'],
  ['Kaiju', 'Mechra', 'mecha_model/mecha.glb', 'Built to save the city. The engineers forgot to uncheck “demolish city” in the factory settings.'],
  ['Military', 'Type 10 Tank', 'military/tank_type10.glb', 'Its crew was told to aim for the knees. From down here, everything looks like a knee.'],
  ['Military', 'Attack Helicopter', 'military/attack_helicopter.glb', 'The pilot signed up for aerial surveillance. Nobody mentioned the target could surveil back at eye level.'],
  ['Military', 'Fighter Jet', 'enemies/jet.glb', 'Fast enough to break the sound barrier. Still too slow to escape the third-act budget.'],
  ['Military', 'Self-Propelled Artillery', 'military/artillery_spg.glb', 'Fires from a safe distance, as determined by a committee that has never seen a kaiju take a step.'],
  ['Military', 'Rifle Infantry', 'enemies/soldier/soldier.glb', 'Issued one rifle, two magazines, and a very optimistic briefing about the weak spot.'],
  ['Military', 'Combat Mech', 'enemies/mech/mech.glb', 'Humanity put legs on a tank and called it progress. The tank would like its treads back.'],
  ['Military', 'Mega-Mech ZX', 'enemies/mech/mech.glb', 'The red paint means it is the final boss. The second cannon means someone approved the sequel.'],
  ['Civilians', 'City Pedestrian', 'enemies/pedestrian/pedestrian.glb', 'Walked to work to avoid traffic. Technically, the road is now completely clear.'],
  ['First-person kits', 'Infantry Rifle', 'viewmodels/infantry_view.glb', 'Comfortable grip, crisp sights, and a magazine designed by someone who assumed the target would be smaller.'],
  ['First-person kits', 'Tank Station', 'viewmodels/tank_view.glb', 'Everything you need to fight a monster from inside a steel box. The cup holder was cut for armor.'],
  ['First-person kits', 'Helicopter Cockpit', 'viewmodels/helicopter_view.glb', 'The instruments say pull up. The windshield says there is a dragon. Both are correct.'],
];

const festivalGuests = [
  ['Front Row Regular', 'Wore earplugs for the bass. They work surprisingly well on atomic roars.'],
  ['Festival Photographer', 'Got the shot of a lifetime. Also got a very clear shot of the inside of a kaiju nostril.'],
  ['Merch Table Loyalist', 'Will evacuate as soon as the limited edition tour shirt is in the bag.'],
  ['The Foodie', 'Three blocks from the exit, two bites from finishing the Italian beef. Decisions are hard.'],
  ['Weekend Dancer', 'Mistook the ground tremors for the drop. Kept dancing through the evacuation announcement.'],
  ['The Local', 'Says the monster is much worse for traffic than last year. Knows a shortcut anyway.'],
  ['Festival First-Timer', 'Asked whether the giant reptile was part of the lineup. The organizer said it was unconfirmed.'],
  ['Soundcheck Survivor', 'Has heard louder things during soundcheck. Admittedly, none of them had claws.'],
  ['Encore Enthusiast', 'Stayed to cheer for one more song. Did not expect one more monster.'],
];
for (const [index, [name, description]] of festivalGuests.entries()) {
  const number = String(index + 1).padStart(2, '0');
  exhibits.push(['Festival crowd', name, `enemies/festival/person_${number}_near.glb`, description]);
}

const loader = new GLTFLoader();

function releaseModel(model) {
  if (!model) return;
  model.mixer?.stopAllAction();
  model.mixer?.uncacheRoot(model.animationRoot || model.root);
  model.root.removeFromParent();
  const resources = new Set();
  model.root.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.skeleton) resources.add(object.skeleton);
    for (const material of [].concat(object.material || [])) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

async function loadExhibit(file, name) {
  const url = './assets/' + file;
  const bytes = await cachedFetch(url);
  const gltf = await withParseSlot(() => loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1)));
  const root = gltf.scene;
  if (name === 'Mega-Mech ZX') {
    root.traverse(object => {
      for (const material of [].concat(object.material || [])) {
        material.color?.setHex(0x882222);
        material.emissive?.setHex(0xff2222);
        material.emissiveIntensity = .3;
      }
    });
  }
  const clip = gltf.animations.find(animation => /^(Animation_)?Alert(_withSkin)?$/i.test(animation.name))
    || gltf.animations.find(animation => /idle/i.test(animation.name));
  const mixer = clip ? new THREE.AnimationMixer(root) : null;
  if (mixer) {
    mixer.clipAction(clip).play();
    mixer.update(0);
  }
  return { root, mixer };
}

export function createModelGallery(dialog) {
  const viewport = dialog.querySelector('.gallery-viewport');
  const picker = dialog.querySelector('#gallery-model');
  const status = dialog.querySelector('#gallery-status');
  const name = dialog.querySelector('#gallery-name');
  const description = dialog.querySelector('#gallery-description');
  const rotate = dialog.querySelector('#gallery-spin');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141b24);
  const camera = new THREE.PerspectiveCamera(36, 1, .05, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D model');
  viewport.prepend(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdceeff, 0x675a50, 2.2));
  const key = new THREE.DirectionalLight(0xffecd1, 3.1);
  key.position.set(4, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9cc5ff, 2.3);
  rim.position.set(-4, 4, -6);
  scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.autoRotateSpeed = .75;
  controls.minDistance = 2;
  controls.maxDistance = 18;

  const groups = new Map();
  for (const [index, [category, title]] of exhibits.entries()) {
    if (!groups.has(category)) {
      const group = document.createElement('optgroup');
      group.label = category;
      groups.set(category, group);
      picker.append(group);
    }
    groups.get(category).append(new Option(title, index));
  }

  let model, revision = 0, request = 0, last = 0;
  const resize = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = viewport;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(viewport);

  function frame(time) {
    if (!dialog.open) return;
    const dt = last ? Math.min(.05, (time - last) / 1000) : 0;
    last = time;
    model?.mixer?.update(dt);
    controls.autoRotate = rotate.checked;
    controls.update(dt);
    renderer.render(scene, camera);
    request = requestAnimationFrame(frame);
  }

  async function select() {
    const ticket = ++revision;
    const [, title, file, blurb] = exhibits[Number(picker.value)];
    name.textContent = title;
    description.textContent = blurb;
    status.textContent = 'Loading model…';
    releaseModel(model);
    model = null;
    try {
      const next = await loadExhibit(file, title);
      if (!dialog.open || ticket !== revision) {
        releaseModel(next);
        return;
      }
      next.root.updateMatrixWorld(true);
      next.root.traverse(object => object.skeleton?.update());
      const bounds = new THREE.Box3().setFromObject(next.root, true);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 3.15 / Math.max(size.length(), .01);
      const group = new THREE.Group();
      group.scale.setScalar(scale);
      group.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
      group.add(next.root);
      scene.add(group);
      model = { ...next, root: group, animationRoot: next.root };
      const fit = Math.max(1, 1 / camera.aspect);
      camera.position.set(2.8, 1.35, 4.55).multiplyScalar(fit);
      controls.target.set(0, 0, 0);
      controls.update();
      status.textContent = '';
    } catch (error) {
      if (dialog.open && ticket === revision) status.textContent = 'Model unavailable. Select another exhibit or try again.';
      console.warn('Gallery model load failed', file, error);
    }
  }

  picker.addEventListener('change', select);
  for (const button of dialog.querySelectorAll('[data-gallery-step]')) {
    button.addEventListener('click', () => {
      picker.value = (Number(picker.value) + Number(button.dataset.galleryStep) + exhibits.length) % exhibits.length;
      select();
    });
  }
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    ++revision;
    cancelAnimationFrame(request);
    releaseModel(model);
    model = null;
    last = 0;
  });

  return () => {
    select();
    cancelAnimationFrame(request);
    last = 0;
    request = requestAnimationFrame(frame);
  };
}
