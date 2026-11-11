// Cached local routes for the lone kaiju. A bounded flood search runs only
// when the direct route is blocked; movement still checks every short segment.
export class KaijuPursuit {
  constructor(){this.path=[];this.next=0;this.cooldown=0;this.goalX=NaN;this.goalZ=NaN;this.plans=0;this.obstacles=[];this.cornerDelay=0;}
  collect(world,x,z,r) {
    this.obstacles.length=0;
    const visit=b=>{if(!b.destroyed&&b.h>0&&!(!b.isBridge&&(b.isFence||b.crushOnContact||b.h<3.4)))this.obstacles.push(b);};
    if(world.buildingGrid)world.buildingGrid.forEachNear(x,z,r+Math.max(world.buildingGrid.maxHalfX||0,world.buildingGrid.maxHalfZ||0),visit);
    else for(const b of world.buildings||[])visit(b);
  }
  blocked(world,x,z,from=null) {
    const b=world.bounds,r=4;
    if(b&&(x<b.minX+r||x>b.maxX-r||z<b.minZ+r||z>b.maxZ-r))return true;
    if(world.isWater?.(x,z)&&!(from&&world.isWater?.(from.x,from.z)))return true;
    for(const o of this.obstacles) {
      if(o.destroyed)continue;
      const hx=o.w/2+r,hz=o.d/2+r;
      // A kaiju deployed inside a footprint may leave it, without teleporting.
      if(Math.abs(x-o.x)<hx&&Math.abs(z-o.z)<hz&&!(from&&Math.abs(from.x-o.x)<hx&&Math.abs(from.z-o.z)<hz))return true;
    }
    return false;
  }
  clear(world,x,z,nx,nz,from=null) {
    // Exact segment/expanded-box test prevents grazing a corner between samples.
    for(const o of this.obstacles) {
      if(o.destroyed)continue;
      const hx=o.w/2+4,hz=o.d/2+4;
      if(from&&Math.abs(from.x-o.x)<hx&&Math.abs(from.z-o.z)<hz)continue;
      let near=0,far=1;
      const dx=nx-x,dz=nz-z;
      if(Math.abs(dx)<1e-10){if(x<=o.x-hx||x>=o.x+hx)continue;}
      else {const a=(o.x-hx-x)/dx,b=(o.x+hx-x)/dx;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
      if(Math.abs(dz)<1e-10){if(z<=o.z-hz||z>=o.z+hz)continue;}
      else {const a=(o.z-hz-z)/dz,b=(o.z+hz-z)/dz;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
      if(near<far&&far>0&&near<1)return false;
    }
    const steps=Math.max(1,Math.ceil(Math.hypot(nx-x,nz-z)));
    const bounds=world.bounds,wading=from&&world.isWater?.(from.x,from.z);
    for(let i=1;i<=steps;i++) {
      const px=x+(nx-x)*i/steps,pz=z+(nz-z)*i/steps;
      if(bounds&&(px<bounds.minX+4||px>bounds.maxX-4||pz<bounds.minZ+4||pz>bounds.maxZ-4))return false;
      if(!wading&&world.isWater?.(px,pz))return false;
    }
    return true;
  }
  plan(world,pos,target,stop) {
    this.plans++;this.path.length=0;this.next=0;
    const margin=36,lowX=Math.min(pos.x,target.x)-margin,lowZ=Math.min(pos.z,target.z)-margin;
    const spanX=Math.abs(pos.x-target.x)+margin*2,spanZ=Math.abs(pos.z-target.z)+margin*2;
    const cell=Math.max(4,spanX/80,spanZ/80),width=Math.ceil(spanX/cell)+2,height=Math.ceil(spanZ/cell)+2;
    const minX=pos.x-Math.ceil((pos.x-lowX)/cell)*cell,minZ=pos.z-Math.ceil((pos.z-lowZ)/cell)*cell;
    const count=width*height,parents=new Int32Array(count).fill(-2),queue=new Int32Array(count),open=new Int8Array(count);
    const index=(x,z)=>Math.round((z-minZ)/cell)*width+Math.round((x-minX)/cell);
    const start=index(pos.x,pos.z);parents[start]=-1;queue[0]=start;let head=0,tail=1,end=-1;
    const free=i=>{if(!open[i])open[i]=this.blocked(world,minX+(i%width)*cell,minZ+Math.floor(i/width)*cell,pos)?-1:1;return open[i]>0;};
    while(head<tail) {
      const i=queue[head++],x=minX+(i%width)*cell,z=minZ+Math.floor(i/width)*cell;
      if(Math.hypot(x-target.x,z-target.z)<=stop&&this.clear(world,x,z,target.x,target.z,pos)){end=i;break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const cx=i%width+dx,cz=Math.floor(i/width)+dz,j=cz*width+cx;
        if(cx<0||cx>=width||cz<0||cz>=height||parents[j]!==-2||!free(j))continue;
        const nx=minX+cx*cell,nz=minZ+cz*cell;
        if(!this.clear(world,x,z,nx,nz,pos))continue;
        parents[j]=i;queue[tail++]=j;
      }
    }
    if(end<0)return;
    while(end!==start&&end>=0){this.path.push({x:minX+(end%width)*cell,z:minZ+Math.floor(end/width)*cell});end=parents[end];}
    this.path.reverse();
  }
  move(world,pos,target,dt,stop=16,speed=11) {
    this.cooldown=Math.max(0,this.cooldown-dt);this.cornerDelay=Math.max(0,this.cornerDelay-dt);
    const distance=Math.hypot(target.x-pos.x,target.z-pos.z);if(distance<=stop)return false;
    this.collect(world,(pos.x+target.x)/2,(pos.z+target.z)/2,distance/2+40);
    let goal=target;
    if(!this.clear(world,pos.x,pos.z,target.x,target.z,pos)) {
      if(this.cooldown===0||Math.hypot(target.x-this.goalX,target.z-this.goalZ)>8) {
        this.plan(world,pos,target,stop);this.goalX=target.x;this.goalZ=target.z;this.cooldown=.8;
      }
      while(this.next<this.path.length&&Math.hypot(this.path[this.next].x-pos.x,this.path[this.next].z-pos.z)<.001)this.next++;
      // Skip visible corners, but never cut through a wall or water.
      for(let i=this.cornerDelay>0?this.next:this.path.length-1;i>this.next;i--)if(this.clear(world,pos.x,pos.z,this.path[i].x,this.path[i].z,pos)){this.next=i;break;}
      goal=this.path[this.next]||target;
    } else {this.path.length=0;this.next=0;}
    const dx=goal.x-pos.x,dz=goal.z-pos.z,length=Math.hypot(dx,dz);
    let remaining=Math.min(length,speed*dt,Math.max(0,distance-stop)),moved=false;
    while(remaining>1e-6) {
      const step=Math.min(remaining,1),x=pos.x+dx/length*step,z=pos.z+dz/length*step;
      if(!this.clear(world,pos.x,pos.z,x,z,pos)){if(this.path.length)this.cooldown=0;this.cornerDelay=1;break;}
      pos.x=x;pos.z=z;remaining-=step;moved=true;
    }
    return moved;
  }
}
