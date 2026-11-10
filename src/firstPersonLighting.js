import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// One prefiltered probe, shared by every weapon/cabin. It adds broad window
// highlights to metal without adding per-frame lights or reflecting the sky
// through enclosed cockpit surfaces.
let probe;
export function firstPersonEnvironment(renderer) {
  if(probe)return probe.texture;
  const generator=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(renderer);
  try {
    room.traverse(o=>{if(o.material?.color && !o.material.isMeshBasicMaterial)o.material.color.setHex(0x888985);});
    probe=generator.fromScene(room,.05,.1,100);
    return probe.texture;
  } finally {room.dispose();generator.dispose();}
}
export function lightFirstPerson(model,environment) {
  model.traverse(o=>{
    if(!o.isMesh||!o.material.isMeshStandardMaterial)return;
    o.material.envMap=environment;o.material.envMapIntensity=.55;
    if(/leather|glove|sleeve|rubber/i.test(o.material.name))o.material.envMapIntensity=.22;
    o.material.needsUpdate=true;
  });
}
// three r160 reads environment intensity from each material, not Scene.
export function applyEnvironmentStrength(root,strength=.55) {
  root.traverse(o=>{
    for(const material of [].concat(o.material||[]))
      if(material.isMeshStandardMaterial&&!material.envMap)material.envMapIntensity=strength;
  });
}

// Stabilize the shadow camera in the sun's texel grid instead of allowing the
// sun direction/frustum to drift as the AI Kaiju moves independently.
const forward=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3();
const point=new THREE.Vector3();
export function followSoldierShadow(sun,anchor,position,offset) {
  point.copy(position);point.y=Math.min(15,position.y);
  forward.copy(offset).normalize();right.crossVectors(new THREE.Vector3(0,1,0),forward).normalize();up.crossVectors(forward,right);
  const texel=(sun.shadow.camera.right-sun.shadow.camera.left)/sun.shadow.mapSize.x;
  for(const axis of [right,up]){const d=point.dot(axis);point.addScaledVector(axis,Math.round(d/texel)*texel-d);}
  anchor.position.copy(point);anchor.updateMatrixWorld(true);sun.target=anchor;
  sun.position.copy(point).add(offset);
}
