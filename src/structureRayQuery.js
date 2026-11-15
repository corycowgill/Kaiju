import * as THREE from 'three';

// Reusable nearest-hit result and scratch storage. A caller owns one query;
// the returned hit remains valid until that caller's next nearest() call.
export class StructureRayQuery {
  constructor() {
    this.box=new THREE.Box3();this.point=new THREE.Vector3();
    this.result={building:null,distance:0,point:new THREE.Vector3()};
    this.local=new THREE.Ray();
    this.visit=b=>{
      this.candidates++;
      if(b.destroyed||b.h<=0)return;
      if(b.obb){this.visitTurned(b);return;}
      const x = b.w / 2 + this.padding, z = b.d / 2 + this.padding;
      this.box.min.set(b.x - x, 0, b.z - z);
      this.box.max.set(b.x + x, b.h, b.z + z);
      if (this.box.containsPoint(this.ray.origin)) {
        if (this.skipContaining) return;
        if (this.padding > 0) this.point.copy(this.ray.origin);
        else if (!this.ray.intersectBox(this.box, this.point)) return;
      } else if (!this.ray.intersectBox(this.box, this.point)) return;
      const d2=this.point.distanceToSquared(this.ray.origin);
      if(d2<this.minDistance*this.minDistance||d2>=this.result.distance*this.result.distance)return;
      this.result.building=b;this.result.distance=Math.sqrt(d2);this.result.point.copy(this.point);
    };
  }
  // A turned lot (b.obb { hw, hd, c, s }, the Manhattan grid): the ray in the lot's own frame
  visitTurned(b) {
    const {hw,hd,c,s}=b.obb,p=this.padding,o=this.ray.origin,d=this.ray.direction,L=this.local;
    const rx=o.x-b.x,rz=o.z-b.z;
    L.origin.set(rx*c-rz*s,o.y,rx*s+rz*c);L.direction.set(d.x*c-d.z*s,d.y,d.x*s+d.z*c);
    this.box.min.set(-hw-p,0,-hd-p);this.box.max.set(hw+p,b.h,hd+p);
    if(this.box.containsPoint(L.origin)){
      if(this.skipContaining)return;
      if(p>0)this.point.copy(L.origin);
      else if(!L.intersectBox(this.box,this.point))return;
    }else if(!L.intersectBox(this.box,this.point))return;
    const lx=this.point.x,lz=this.point.z;
    this.point.set(b.x+lx*c+lz*s,this.point.y,b.z-lx*s+lz*c);
    const d2=this.point.distanceToSquared(o);
    if(d2<this.minDistance*this.minDistance||d2>=this.result.distance*this.result.distance)return;
    this.result.building=b;this.result.distance=Math.sqrt(d2);this.result.point.copy(this.point);
  }
  nearest(world,ray,maxDistance,skipContaining=false,minDistance=0,padding=0) {
    this.ray=ray;this.skipContaining=skipContaining;this.minDistance=minDistance;this.padding=padding;this.candidates=0;
    this.result.building=null;this.result.distance=maxDistance;
    if(world.buildingGrid?.forEachRay)world.buildingGrid.forEachRay(ray,maxDistance,this.visit,padding);
    else for(const b of world.buildings||[])this.visit(b);
    return this.result.building?this.result:null;
  }
}

// Match the original 18% camera follow at 60 Hz, independent of refresh rate.
export function cameraFollowAlpha(dt) {return 1-Math.pow(.82,Math.max(0,dt)*60);}
