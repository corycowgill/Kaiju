// Centre-indexed building grid, shared by collision, cover and camera queries.
export class BuildingGrid {
  constructor(cellSize = 60) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.maxHalfX=0;this.maxHalfZ=0;
  }
  _key(cx, cz) { return cx + ':' + cz; }
  add(b) {
    this.expandBounds(b);
    const cs = this.cellSize;
    const k = this._key(Math.floor(b.x / cs), Math.floor(b.z / cs));
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(b);
    b._gridKey = k;
    b._grid = this;
  }
  expandBounds(b) {
    this.maxHalfX=Math.max(this.maxHalfX,b.w/2);
    this.maxHalfZ=Math.max(this.maxHalfZ,b.d/2);
  }
  remove(b) {
    if (!b._gridKey) return;
    const arr = this.cells.get(b._gridKey);
    if (arr) {
      const i = arr.indexOf(b);
      if (i >= 0) arr.splice(i, 1);
    }
    b._gridKey = null;
  }
  // Run cb against every building whose cell footprint overlaps the query AABB.
  forEachNear(x, z, radius, cb) {
    const cs = this.cellSize;
    const minX = Math.floor((x - radius) / cs);
    const maxX = Math.floor((x + radius) / cs);
    const minZ = Math.floor((z - radius) / cs);
    const maxZ = Math.floor((z + radius) / cs);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const arr = this.cells.get(this._key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) cb(arr[i]);
      }
    }
  }
  // The grid stores centres. Expand each tested cell by the largest live
  // footprint so a wide building is retained even when its centre is off-ray.
  // Cell/segment slab tests avoid scanning the square around a diagonal ray.
  forEachRay(ray,distance,cb,padding=0) {
    if(!(distance>=0)||!Number.isFinite(distance))return;
    const cs=this.cellSize,ox=ray.origin.x,oz=ray.origin.z,dx=ray.direction.x,dz=ray.direction.z;
    const ex=ox+dx*distance,ez=oz+dz*distance,hx=this.maxHalfX+padding,hz=this.maxHalfZ+padding;
    const x0=Math.floor((Math.min(ox,ex)-hx)/cs),x1=Math.floor((Math.max(ox,ex)+hx)/cs);
    const z0=Math.floor((Math.min(oz,ez)-hz)/cs),z1=Math.floor((Math.max(oz,ez)+hz)/cs);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++) {
      const items=this.cells.get(this._key(x,z));if(!items)continue;
      let near=0,far=distance;
      const loX=x*cs-hx,hiX=(x+1)*cs+hx,loZ=z*cs-hz,hiZ=(z+1)*cs+hz;
      if(Math.abs(dx)<1e-12){if(ox<loX||ox>hiX)continue;}
      else {const a=(loX-ox)/dx,b=(hiX-ox)/dx;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
      if(Math.abs(dz)<1e-12){if(oz<loZ||oz>hiZ)continue;}
      else {const a=(loZ-oz)/dz,b=(hiZ-oz)/dz;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
      if(near>far)continue;
      for(let i=0;i<items.length;i++)cb(items[i]);
    }
  }
}
