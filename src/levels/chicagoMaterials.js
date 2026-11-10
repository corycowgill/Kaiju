import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';

const textures=new Map(),loader=new THREE.TextureLoader();
function texture(file,color=false) {
  const key=file+color;if(textures.has(key))return textures.get(key);
  const t=loader.load(assetURL('./assets/textures/'+file),undefined,undefined,()=>reportLoadError('ChicagoSurface',file,new Error('texture load failed')));
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
  if(color)t.colorSpace=THREE.SRGBColorSpace;textures.set(key,t);return t;
}
const noise=`
float chiHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float chiNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(chiHash(i),chiHash(i+vec2(1,0)),f.x),mix(chiHash(i+vec2(0,1)),chiHash(i+1.0),f.x),f.y);}
`;
// A single shader family covers world-sized terrain and restrained prop wear.
// Surface kind is a uniform, keeping per-material program variants bounded.
export function chicagoWeather(material,kind,wear=0,tile=2.4) {
  if(material.userData.chicagoWeather)return material;
  material.userData.chicagoWeather=true;
  material.userData.chicagoSurface={kind,wear,tile};
  const uniforms={chiKind:{value:kind},chiWear:{value:wear},chiTile:{value:tile},chiFabric:{value:texture('chi_canvas_color.jpg',true)}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='uniform float chiKind;uniform float chiTile;varying vec3 chiWorld;varying float chiSeed;\n'+shader.vertexShader
      .replace('#include <uv_vertex>',`#include <uv_vertex>
        vec4 chiPosition=vec4(position,1.0);vec4 chiOrigin=vec4(0,0,0,1);
        #ifdef USE_INSTANCING
          chiPosition=instanceMatrix*chiPosition;chiOrigin=instanceMatrix*chiOrigin;
        #endif
        chiWorld=(modelMatrix*chiPosition).xyz;chiOrigin=modelMatrix*chiOrigin;
        chiSeed=fract(sin(dot(chiOrigin.xz,vec2(12.9898,78.233)))*43758.5453);
        if(chiKind<2.5){
          vec2 chiUv=abs(normal.y)>.5?chiWorld.xz:vec2(chiWorld.x+chiWorld.z,chiWorld.y);
          #ifdef USE_MAP
            vMapUv=chiUv/chiTile;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv=chiUv/chiTile;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv=chiUv/chiTile;
          #endif
          #ifdef USE_AOMAP
            vAoMapUv=chiUv/chiTile;
          #endif
        }`);
    shader.fragmentShader='uniform float chiKind;uniform float chiWear;uniform sampler2D chiFabric;varying vec3 chiWorld;varying float chiSeed;\n'+noise+shader.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
        float macro=chiNoise(chiWorld.xz*.075),grain=chiNoise(chiWorld.xz*1.7);
        if(chiKind<.5){
          diffuseColor.rgb*=mix(.83,1.12,macro);
          float dry=smoothstep(.48,.82,chiNoise(chiWorld.xz*.22+17.0))*chiWear;
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.30,1.03,.70),dry*.72);
          float soil=smoothstep(.64,.83,chiNoise(chiWorld.xz*.38+5.0))*chiWear;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.115,.086,.052),soil*.55);
        }else if(chiKind<1.5){
          vec2 slab=chiWorld.xz/vec2(2.0,1.65),edge=min(fract(slab),1.0-fract(slab));
          float joint=1.0-smoothstep(.002,.010,min(edge.x,edge.y));
          float panel=chiHash(floor(slab));
          diffuseColor.rgb*=mix(.94,1.04,panel)*(1.0-joint*.23*(1.0-chiWear))*( .94+macro*.08);
        }else if(chiKind<2.5){
          float oilPatch=smoothstep(.65,.86,chiNoise(chiWorld.xz*.32));
          diffuseColor.rgb*=.90+macro*.16-oilPatch*.12;
        }else if(chiKind<4.5){
          float foot=1.0-smoothstep(.05,1.5,chiWorld.y);
          float stains=smoothstep(.35,.82,chiNoise(chiWorld.xz*2.1+chiWorld.y*.5));
          diffuseColor.rgb*=1.0-foot*stains*.20;
          if(chiKind<3.5){
            vec3 fabric=texture2D(chiFabric,vec2(chiWorld.x+chiWorld.z,chiWorld.y)*2.0).rgb;
            float weave=dot(fabric,vec3(.333));
            diffuseColor.rgb*=.90+weave*.18;
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.45,.43,.37),smoothstep(1.5,6.0,chiWorld.y)*.08);
          }else diffuseColor.rgb*=.96+grain*.06;
        }else{
          float leaf=smoothstep(.012,.07,diffuseColor.g-max(diffuseColor.r,diffuseColor.b));
          float yellowLeaf=smoothstep(.20,.35,(diffuseColor.r+diffuseColor.g)*.5)*smoothstep(.02,.15,diffuseColor.g-diffuseColor.b)*smoothstep(-.03,.10,diffuseColor.g-diffuseColor.r*.65);
          float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb=mix(diffuseColor.rgb,luminance*vec3(.65,1.0,.40),yellowLeaf*.75);
          leaf=max(leaf,yellowLeaf);
          vec3 summer=vec3(.42,.46,.40)*mix(.87,1.06,chiSeed)*(.94+macro*.10);
          diffuseColor.rgb*=mix(vec3(.96,.94,.91),summer,leaf);
        }`);
  };
  material.customProgramCacheKey=()=> 'chicago-materials-v1';material.needsUpdate=true;return material;
}

export function chicagoGround(material,surface,wear=0) {
  const kind={grass:0,pavement:1,asphalt:2}[surface];
  material.map=texture(`chi_${surface}_color.jpg`,true);
  material.normalMap=texture(`chi_${surface}_normal.png`);
  material.roughnessMap=texture(`chi_${surface}_roughness.png`);
  material.normalScale=new THREE.Vector2(surface==='grass'?.38:.22,surface==='grass'?.38:.22);
  material.roughness=1;material.metalness=0;
  material.color.setHex(surface==='grass'?0xd5dcc4:surface==='asphalt'?0xa3a3a0:0xb6b3aa);
  material.name='Chicago '+surface+(wear?' worn':'');
  return chicagoWeather(material,kind,wear,surface==='grass'?1.25:surface==='pavement'?1.5:3.0);
}

export function chicagoFestivalSurface(material,file) {
  if(!material.isMeshStandardMaterial||/sign|led_screen/i.test(material.name))return;
  const fabric=/vendor_tent|tent_stage/.test(file)&&!/truss|lattice/i.test(material.name);
  material.roughness=Math.max(material.roughness,fabric?.86:.65);
  material.metalness=Math.min(material.metalness,/truss|lattice/i.test(material.name)?.65:.18);
  // Cutout truss/net silhouettes keep the existing alpha-test shader. Solid
  // props share the tree/foliage variant, including a fine coating normal.
  if(material.alphaTest>0)return;
  if(!material.normalMap){material.normalMap=texture('chi_canvas_normal.png');material.normalScale=new THREE.Vector2(.15,.15);}
  chicagoWeather(material,fabric?3:4,.4);
}
