import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
globalThis.window??={innerWidth:1440,innerHeight:900};
globalThis.location??={search:''};globalThis.localStorage??={getItem:()=>null};
const {bakeCrowdAnimations}=await import('../src/levels/festivalPeople.js');
const base=new URL('../assets/enemies/festival/',import.meta.url);
function read(name){const raw=fs.readFileSync(new URL(name,base)),n=raw.readUInt32LE(12);return {g:JSON.parse(raw.subarray(20,20+n)),bin:raw.subarray(28+n),raw};}
function array(file,index,width){const a=file.g.accessors[index],v=file.g.bufferViews[a.bufferView],raw=file.bin.subarray((v.byteOffset||0)+(a.byteOffset||0));
  const Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new Type(raw.buffer.slice(raw.byteOffset,raw.byteOffset+a.count*width*Type.BYTES_PER_ELEMENT));}
const library=read('animations.glb');
const gltf=await new GLTFLoader().parseAsync(library.raw.buffer.slice(library.raw.byteOffset,library.raw.byteOffset+library.raw.length),'');
const baked=bakeCrowdAnimations(gltf),atlas=baked.texture.image.data,stride=baked.bones*16;
const names=['Walking','Running','RunFast','All_Night_Dance','You_Groove','Dead'];
const report=[];
const person=process.argv.includes('--person')?Number(process.argv[process.argv.indexOf('--person')+1]):0;
for(let model=1;model<=9;model++) {
  if(person&&model!==person)continue;
  for(const lod of (process.argv.includes('--all-lods')?['near','far','distant']:['near'])) {
  const file=read(`person_${String(model).padStart(2,'0')}_${lod}.glb`),p=file.g.meshes[0].primitives[0];
  const pos=array(file,p.attributes.POSITION,3),joints=array(file,p.attributes.JOINTS_0,4),weights=array(file,p.attributes.WEIGHTS_0,4),indices=array(file,p.indices,1);
  const edges=[],seen=new Set();
  for(let i=0;i<indices.length;i+=3)for(const [a,b]of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){
    const key=Math.min(a,b)+':'+Math.max(a,b);if(seen.has(key))continue;seen.add(key);
    const d=Math.hypot(pos[a*3]-pos[b*3],pos[a*3+1]-pos[b*3+1],pos[a*3+2]-pos[b*3+2]);
    if(d>.012)edges.push([a,b,d]);
  }
  const posed=new Float32Array(pos.length),ratios=[];let spikes=0,max=0,examples=[];
  for(const name of names){const clip=baked.clips[name];
    for(let frame=0;frame<9;frame++){
      const row=clip.start+Math.round((clip.frames-1)*frame/8),start=row*stride;
      for(let i=0;i<pos.length/3;i++){
        const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];let px=0,py=0,pz=0;
        for(let k=0;k<4;k++){const w=weights[i*4+k];if(!w)continue;const b=start+joints[i*4+k]*16;
          px+=(atlas[b]*x+atlas[b+4]*y+atlas[b+8]*z+atlas[b+12])*w;
          py+=(atlas[b+1]*x+atlas[b+5]*y+atlas[b+9]*z+atlas[b+13])*w;
          pz+=(atlas[b+2]*x+atlas[b+6]*y+atlas[b+10]*z+atlas[b+14])*w;
        }posed.set([px,py,pz],i*3);
      }
      for(const [a,b,d]of edges){const length=Math.hypot(posed[a*3]-posed[b*3],posed[a*3+1]-posed[b*3+1],posed[a*3+2]-posed[b*3+2]),r=length/d;ratios.push(r);max=Math.max(max,r);
        if(r>2.5&&length>.16){spikes++;if(examples.length<4)examples.push({clip:name,a:Array.from(pos.subarray(a*3,a*3+3)),b:Array.from(pos.subarray(b*3,b*3+3)),ratio:r});}
      }
    }
  }
  ratios.sort((a,b)=>a-b);report.push({id:`person_${String(model).padStart(2,'0')}`,lod,samples:ratios.length,spikes,maxStretch:max,p99:ratios[Math.floor(ratios.length*.99)],examples});
  }
}
const output=process.argv.indexOf('--out');if(output>=0)fs.writeFileSync(process.argv[output+1],JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(({examples,...item})=>item),null,2));
baked.texture.dispose();
