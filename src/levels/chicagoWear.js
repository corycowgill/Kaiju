// Deterministic, localized foot-traffic field. This changes shading only;
// it adds no overlapping decal meshes, collision or per-frame CPU work.
export function buildChicagoWear(festival,paths=[],size=256) {
  const points=festival?.fence||[];
  const bounds=points.length?{
    x0:Math.min(...points.map(p=>p[0]))-10,z0:Math.min(...points.map(p=>p[1]))-10,
    x1:Math.max(...points.map(p=>p[0]))+10,z1:Math.max(...points.map(p=>p[1]))+10,
  }:{x0:0,z0:0,x1:1,z1:1};
  const data=new Uint8Array(size*size*4),sx=(bounds.x1-bounds.x0)/size,sz=(bounds.z1-bounds.z0)/size;
  for(let i=3;i<data.length;i+=4)data[i]=255;
  let sources=0;
  function stroke(a,b,radius,strength) {
    const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-radius-bounds.x0)/sx));
    const x1=Math.min(size-1,Math.ceil((Math.max(a[0],b[0])+radius-bounds.x0)/sx));
    const z0=Math.max(0,Math.floor((Math.min(a[1],b[1])-radius-bounds.z0)/sz));
    const z1=Math.min(size-1,Math.ceil((Math.max(a[1],b[1])+radius-bounds.z0)/sz));
    const dx=b[0]-a[0],dz=b[1]-a[1],length2=Math.max(.001,dx*dx+dz*dz);
    if(x0>x1||z0>z1)return;sources++;
    for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++) {
      const x=bounds.x0+(i+.5)*sx,z=bounds.z0+(j+.5)*sz;
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length2));
      const distance=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
      const u=Math.max(0,1-distance/radius),falloff=u*u*(3-2*u),at=(j*size+i)*4;
      data[at]=Math.max(data[at],Math.round(falloff*strength*255));
      data[at+1]=Math.max(data[at+1],Math.round(falloff*strength*.65*255));
    }
  }
  if(points.length) {
    for(const path of paths)for(let i=1;i<path.points.length;i++)stroke(path.points[i-1],path.points[i],(path.width||1)*.5+1.3,.52);
    for(const item of festival.items||[]) {
      if(!['gate','food','bar','vendor','water','merch','toilets','stage'].includes(item.kind))continue;
      const front=[Math.sin(item.rot||0),Math.cos(item.rot||0)],across=[front[1],-front[0]];
      const depth=item.kind==='stage'?4:2;
      const center=[item.x+front[0]*(item.d*.5+depth*.45),item.z+front[1]*(item.d*.5+depth*.45)];
      if(item.kind==='gate') {
        stroke([item.x-front[0]*3,item.z-front[1]*3],[item.x+front[0]*5,item.z+front[1]*5],Math.max(1.5,item.w*.3),.9);
      }else {
        const half=item.w*.4;
        stroke([center[0]-across[0]*half,center[1]-across[1]*half],[center[0]+across[0]*half,center[1]+across[1]*half],depth,item.kind==='stage'?.95:.8);
      }
    }
  }
  return {data,size,bounds,sources};
}
