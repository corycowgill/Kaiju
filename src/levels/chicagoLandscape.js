import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chicagoTreeSurface } from './chicagoMaterials.js';

// Shared, opaque geometry: no leaf transparency/overdraw and no per-tree mixer.
// Close trees have branching trunks and an irregular, overlapping crown;
// distant tiles use a much simpler silhouette through the city LOD system.
let templates;
const hash=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
function colored(geometry,color,foliage=false) {
  const p=geometry.attributes.position,colors=new Float32Array(p.count*3),c=new THREE.Color();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const shade=foliage ? .52+THREE.MathUtils.smoothstep(y,3,8)*.44+hash(x*2,z*2)*.12 : .83+hash(y*9,x+z)*.22;
    c.copy(color).multiplyScalar(shade);c.toArray(colors,i*3);
  }
  geometry.setAttribute('chiTint',new THREE.BufferAttribute(colors,3));
  return geometry;
}
function makeTemplate(variant,far) {
  const leaves=[],wood=[],leaf=new THREE.Color(variant?0x4b713b:0x416b39),bark=new THREE.Color(0x675441);
  const trunk=new THREE.CylinderGeometry(.16,.32,4.8,far?5:9,far?1:3).translate(0,2.4,0);
  wood.push(colored(trunk,bark));
  const n=far?4:9;
  for(let i=0;i<n;i++) {
    const a=i*2.39996+variant*.7,rad=i===0?0:.8+hash(i,variant)*1.35;
    const cx=Math.cos(a)*rad*(variant?1.18:.92),cz=Math.sin(a)*rad,cy=4.8+hash(i+8,variant)*1.8;
    const sx=1.2+hash(i,4+variant)*.8,sy=.85+hash(i,7+variant)*.9,sz=1.15+hash(i,9+variant)*.65;
    const g=new THREE.SphereGeometry(1,far?6:10,far?4:7);
    const p=g.attributes.position;
    for(let v=0;v<p.count;v++) {
      const x=p.getX(v),y=p.getY(v),z=p.getZ(v);
      // Continuous deformation avoids cracks at duplicated UV seam vertices.
      const r=1+.13*Math.sin(x*7+z*5+variant)+.09*Math.cos(y*9-z*4);
      p.setXYZ(v,cx+x*r*sx,cy+y*r*sy,cz+z*r*sz);
    }
    g.computeVertexNormals();leaves.push(colored(g,leaf,true));
    if(!far && i>0 && i<6) {
      const start=new THREE.Vector3(0,2.8,0),end=new THREE.Vector3(cx,cy-.7,cz),delta=end.clone().sub(start);
      const branch=new THREE.CylinderGeometry(.055,.13,delta.length(),6);
      branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
      branch.translate(...start.add(end).multiplyScalar(.5).toArray());wood.push(colored(branch,bark));
    }
  }
  const merge=parts=>{const g=mergeGeometries(parts);for(const p of parts)p.dispose();g.userData.shared=true;return g;};
  const canopy=merge(leaves);canopy.userData.soldierOccluder=true;
  return [canopy,merge(wood)];
}
export function createChicagoTrees(K,lite=false,glb=true) {
  if(!templates) {
    const materials=[new THREE.MeshStandardMaterial({name:'Chicago summer canopy',roughness:.96}),
      new THREE.MeshStandardMaterial({name:'Chicago branching bark',roughness:1})];
    for(const m of materials){m.side=THREE.DoubleSide;m.userData.shared=true;chicagoTreeSurface(m);}
    templates=[0,1].map(v=>({near:makeTemplate(v,false),far:makeTemplate(v,true),materials}));
  }
  for(const t of templates)for(let i=0;i<2;i++)K.registerLod1(t.near[i],t.far[i]);
  return (x=0,z=0,scale=1)=>{
    const seed=hash(x,z),t=templates[seed>.5?1:0],root=new THREE.Group();
    for(let i=0;i<2;i++) {
      const mesh=new THREE.Mesh((glb?t.near:t.far)[i],t.materials[i]);mesh.receiveShadow=true;root.add(mesh);
    }
    root.position.set(x,0,z);root.rotation.y=seed*Math.PI*2;
    root.scale.set(scale*(.94+seed*.14),scale*(.91+hash(z,x)*.16),scale);
    root.userData.instance=true;root.userData.instanceTile=!glb?4000:lite?480:240;
    root.userData.instanceLodDistance=lite?360:240;
    root.name='Chicago mature park tree';return root;
  };
}

// Deterministic edge groves leave the centre of each lawn and all festival,
// road, landmark and path exclusions open. Generation runs only at city build.
export function planParkGroves(parks,allowed,lite=false) {
  const points=[],occupied=new Set(),cap=lite?64:150;
  for(const park of parks) {
    if(!/grant park|museum campus/i.test(park.name||'') || park.kind==='plaza' || park.kind==='beach')continue;
    const poly=park.polygon;if(poly.length<3)continue;
    const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
    for(let x=x0+3;x<x1-2;x+=5.6)for(let z=z0+3;z<z1-2;z+=5.6) {
      if(points.length>=cap)return points;
      if(Math.min(x-x0,x1-x,z-z0,z1-z)>6.5)continue;
      if(hash(Math.floor(x/12),Math.floor(z/12))<.28)continue;
      const px=x+(hash(x,z)-.5)*1.5,pz=z+(hash(z,x)-.5)*1.5;
      const key=Math.round(px/4)+':'+Math.round(pz/4);
      if(occupied.has(key)||!allowed(px,pz,park))continue;
      occupied.add(key);points.push({x:px,z:pz,scale:.82+hash(px,pz)*.23});
    }
  }
  return points;
}

// Directional crowd density with two clear access aisles. Works for rotated
// stages using their local front (+Z), without extra attendees or draws.
export function festivalCrowdWeight(x,z,stage,far) {
  const dx=x-stage.x,dz=z-stage.z,c=Math.cos(stage.rot||0),s=Math.sin(stage.rot||0);
  const across=dx*c-dz*s,front=dx*s+dz*c;
  const depth=Math.max(8,far),t=THREE.MathUtils.clamp(front/depth,0,1);
  const aisle=Math.max(1.0,Math.min(1.55,(stage.w||10)*.07));
  if(front<0 || (front>3 && Math.abs(across)<aisle*.5))return 0;
  const sideLane=(stage.w||10)*.62;
  if(front>6 && Math.abs(Math.abs(across)-sideLane)<aisle*.4)return .03;
  return .10+.9*Math.pow(1-t,3.2);
}
