import * as THREE from 'three';

/** Pick a dry, unoccupied opening with a clear view of the kaiju's torso.
 * Uses building boxes and cached canopy spheres, never a skinned-mesh raycast.
 * Runs once during deployment, while the loading screen is still visible. */
export function chooseSoldierSpawn(world,kaijuPosition,eye) {
  const target=kaijuPosition.clone();target.y+=12;
  const fallback=world.landPoint?.()||[kaijuPosition.x+70,kaijuPosition.z];
  let best=new THREE.Vector3(fallback[0],eye,fallback[1]);
  let foundDry=false;
  const spheres=[],matrix=new THREE.Matrix4();
  world.scene?.updateMatrixWorld(true);
  world.scene?.traverseVisible(o=>{
    if(!o.isInstancedMesh||!o.geometry.userData.soldierOccluder)return;
    if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
    for(let i=0;i<o.count;i++) {
      o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);
      spheres.push(o.geometry.boundingSphere.clone().applyMatrix4(matrix));
    }
  });
  const ray=new THREE.Ray(),box=new THREE.Box3(),hit=new THREE.Vector3(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
  const nearby=(x,z,r,visit)=>{
    if(world.buildingGrid)world.buildingGrid.forEachNear(x,z,r,visit);
    else for(const b of world.buildings||[])visit(b);
  };
  for(const radius of [85,65,105])for(let i=0;i<64;i++) {
    const a=i/64*Math.PI*2,x=kaijuPosition.x+Math.cos(a)*radius,z=kaijuPosition.z+Math.sin(a)*radius,bounds=world.bounds;
    if(x<bounds.minX+5||x>bounds.maxX-5||z<bounds.minZ+5||z>bounds.maxZ-5||world.isWater?.(x,z))continue;
    let blocked=false;
    nearby(x,z,35,b=>{if(!b.destroyed&&eye<b.h+1&&Math.abs(x-b.x)<b.w/2+2&&Math.abs(z-b.z)<b.d/2+2)blocked=true;});
    if(blocked)continue;
    origin.set(x,eye,z);direction.copy(target).sub(origin);const reach=direction.length();ray.set(origin,direction.normalize());
    if(!foundDry){best.copy(origin);foundDry=true;}
    nearby((x+target.x)/2,(z+target.z)/2,radius/2+24,b=>{
      if(blocked||b.destroyed)return;
      box.min.set(b.x-b.w/2,0,b.z-b.d/2);box.max.set(b.x+b.w/2,b.h,b.z+b.d/2);
      if(ray.intersectBox(box,hit)&&hit.distanceToSquared(origin)<reach*reach)blocked=true;
    });
    if(blocked)continue;
    for(const sphere of spheres)if(ray.intersectSphere(sphere,hit)&&hit.distanceToSquared(origin)<reach*reach){blocked=true;break;}
    if(!blocked)return origin.clone();
  }
  return best;
}
