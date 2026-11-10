// Shared reverse flood fields: route thousands of attendees around the same
// fences without a separate path search per person. Rebuild only after damage.
export function createCrowdRoutes(points, gates, blocked, bounds) {
  if(!gates.length) return { distance:()=>Infinity, direction:()=>null, rebuild(){} };
  const xs=gates.map(g=>g.x),zs=gates.map(g=>g.z);
  for(let i=0;i<points.length;i+=2){xs.push(points[i]);zs.push(points[i+1]);}
  if(!xs.length) return { distance:()=>Infinity, direction:()=>null, rebuild(){} };
  const minX=Math.max(bounds?.minX??-Infinity,Math.min(...xs)-24);
  const minZ=Math.max(bounds?.minZ??-Infinity,Math.min(...zs)-24);
  const maxX=Math.min(bounds?.maxX??Infinity,Math.max(...xs)+24);
  const maxZ=Math.min(bounds?.maxZ??Infinity,Math.max(...zs)+24);
  const cell=Math.max(1.5,(maxX-minX)/240,(maxZ-minZ)/240);
  const width=Math.ceil((maxX-minX)/cell)+1,height=Math.ceil((maxZ-minZ)/cell)+1;
  const count=width*height,edges=new Uint8Array(count),queue=new Int32Array(count);
  const fields=[];
  const xy=i=>[minX+(i%width)*cell,minZ+Math.floor(i/width)*cell];
  const index=(x,z)=>Math.max(0,Math.min(height-1,Math.round((z-minZ)/cell)))*width+Math.max(0,Math.min(width-1,Math.round((x-minX)/cell)));
  const offsets=[1,-1,width,-width];
  function rebuild(){
    const open=new Uint8Array(count);
    for(let i=0;i<count;i++){const [x,z]=xy(i);open[i]=blocked(x,z)?0:1;}
    edges.fill(0);
    for(let i=0;i<count;i++)if(open[i])for(let k=0;k<4;k++){
      const j=i+offsets[k];
      if(j<0||j>=count||!open[j]||(k<2&&Math.floor(i/width)!==Math.floor(j/width)))continue;
      const [x,z]=xy(i),[nx,nz]=xy(j);
      // Thin fences between cell centers must also block the graph edge.
      if(!blocked((x+nx)/2,(z+nz)/2))edges[i]|=1<<k;
    }
    fields.length=0;
    for(const gate of gates){
      const distances=new Int32Array(count).fill(-1);
      let seed=-1,best=Infinity;
      const center=index(gate.x,gate.z);
      for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
        const i=center+dz*width+dx;
        if(i<0||i>=count||!open[i])continue;
        const [x,z]=xy(i),d=Math.hypot(x-gate.x,z-gate.z);
        if(d<best){best=d;seed=i;}
      }
      if(seed>=0){let head=0,tail=1;queue[0]=seed;distances[seed]=0;
        while(head<tail){const i=queue[head++];for(let k=0;k<4;k++)if(edges[i]&(1<<k)){
          const j=i+offsets[k];if(distances[j]>=0)continue;
          distances[j]=distances[i]+1;queue[tail++]=j;
        }}
      }
      fields.push(distances);
    }
  }
  rebuild();
  return {rebuild,
    distance(g,x,z){const d=fields[g]?.[index(x,z)];return d>=0?d*cell:Infinity;},
    direction(g,x,z){
      const field=fields[g],i=index(x,z);if(!field||field[i]<0)return null;
      let next=i;
      for(let k=0;k<4;k++)if(edges[i]&(1<<k)){
        const j=i+offsets[k];if(field[j]>=0&&field[j]<field[next])next=j;
      }
      if(next===i)return null;
      let [nx,nz]=xy(next);
      const steps=Math.ceil(Math.hypot(nx-x,nz-z)/.3);
      for(let s=1;s<=steps;s++)if(blocked(x+(nx-x)*s/steps,z+(nz-z)*s/steps)){
        // Off-center runners must first clear the corner of their current
        // cell; aiming straight at the next center can cut through a fence.
        [nx,nz]=xy(i);break;
      }
      return {x:nx-x,z:nz-z};
    },
  };
}
