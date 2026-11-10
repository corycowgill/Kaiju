import * as THREE from 'three';

// Reusable nearest-hit result and scratch storage. A caller owns one query;
// the returned hit remains valid until that caller's next nearest() call.
export class StructureRayQuery {
  constructor() {
    this.box=new THREE.Box3();this.point=new THREE.Vector3();
    this.result={building:null,distance:0,point:new THREE.Vector3()};
    this.visit=b=>{
      this.candidates++;
      if(b.destroyed||b.h<=0)return;
      this.box.min.set(b.x-b.w/2,0,b.z-b.d/2);this.box.max.set(b.x+b.w/2,b.h,b.z+b.d/2);
      if(this.skipContaining&&this.box.containsPoint(this.ray.origin))return;
      if(!this.ray.intersectBox(this.box,this.point))return;
      const d2=this.point.distanceToSquared(this.ray.origin);
      if(d2<this.minDistance*this.minDistance||d2>=this.result.distance*this.result.distance)return;
      this.result.building=b;this.result.distance=Math.sqrt(d2);this.result.point.copy(this.point);
    };
  }
  nearest(world,ray,maxDistance,skipContaining=false,minDistance=0) {
    this.ray=ray;this.skipContaining=skipContaining;this.minDistance=minDistance;this.candidates=0;
    this.result.building=null;this.result.distance=maxDistance;
    if(world.buildingGrid?.forEachRay)world.buildingGrid.forEachRay(ray,maxDistance,this.visit);
    else for(const b of world.buildings||[])this.visit(b);
    return this.result.building?this.result:null;
  }
}

// Match the original 18% camera follow at 60 Hz, independent of refresh rate.
export function cameraFollowAlpha(dt) {return 1-Math.pow(.82,Math.max(0,dt)*60);}
