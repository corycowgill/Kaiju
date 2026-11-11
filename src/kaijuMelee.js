import * as THREE from 'three';

// Contact markers measured from the bundled foot/hand animation tracks.
// The long dragon/mech stomp clips contain extra gestures after the first landing.
const CONTACTS={
  godzilla:{stomp:[.78,1.8333334],punch:[1.15,2.5]},
  ghidorah:{stomp:[1.08,1.6],punch:[1.0,2.5]},
  mecha:{stomp:[1.08,1.6],punch:[1.25,2.5]},
};
export function prepareMeleeAnimations(animations,key) {
  const profile=CONTACTS[key]||CONTACTS.godzilla,result={};
  for(const kind of ['stomp','punch']) {
    const original=animations[kind];if(!original)continue;
    const [contact,end]=profile[kind],name=kind==='stomp'?'meleeStomp':'meleePunch';
    const clip=THREE.AnimationUtils.subclip(original,name,0,Math.round(Math.min(end,original.duration)*60),60);
    result[kind]={name,clip,contact:Math.min(contact,clip.duration),duration:clip.duration};
  }
  return result;
}
