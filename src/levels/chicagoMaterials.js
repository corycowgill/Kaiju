import * as THREE from 'three';
import { assetURL, reportLoadError } from '../assetCache.js';
import { buildChicagoWear } from './chicagoWear.js';

const textures=new Map(),loader=new THREE.TextureLoader();
const blankWear=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);blankWear.needsUpdate=true;
const shared={chiTime:{value:0},chiWearField:{value:blankWear},chiWearBounds:{value:new THREE.Vector4(0,0,1,1)}};
let wearTexture;
export function configureChicagoWear(festival,paths,lite=false) {
  const field=buildChicagoWear(festival,paths,lite?128:256),b=field.bounds;
  wearTexture?.dispose();wearTexture=new THREE.DataTexture(field.data,field.size,field.size);
  wearTexture.minFilter=wearTexture.magFilter=THREE.LinearFilter;wearTexture.needsUpdate=true;
  shared.chiWearField.value=wearTexture;shared.chiWearBounds.value.set(b.x0,b.z0,b.x1-b.x0,b.z1-b.z0);
  return {resolution:field.size,sources:field.sources,bytes:field.data.byteLength};
}
export function tickChicagoMaterials(time){shared.chiTime.value=time%(Math.PI*40);}
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
  const uniforms={chiKind:{value:kind},chiWear:{value:wear},chiTile:{value:tile},chiTreeColors:{value:material.userData.treeColors?1:0},chiStructure:{value:material.userData.neutralStage?1:0},chiFabric:{value:texture('chi_canvas_color.jpg',true)}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms,shared);
    shader.vertexShader='uniform float chiKind;uniform float chiTile;uniform float chiTime;attribute vec3 chiTint;varying vec3 chiTreeTint;varying vec3 chiWorld;varying float chiSeed;\n'+shader.vertexShader
      .replace('#include <uv_vertex>',`#include <uv_vertex>
        vec4 chiPosition=vec4(position,1.0);vec4 chiOrigin=vec4(0,0,0,1);
        #ifdef USE_INSTANCING
          chiPosition=instanceMatrix*chiPosition;chiOrigin=instanceMatrix*chiOrigin;
        #endif
        chiTreeTint=chiTint;
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
        }`)
      .replace('#include <project_vertex>',THREE.ShaderChunk.project_vertex+`
        if(chiKind>4.5){
          float crown=smoothstep(2.0,5.0,chiWorld.y-chiOrigin.y);
          float breeze=sin(chiTime*.75+chiSeed*6.283)*.032+sin(chiTime*1.7+chiWorld.x*.6)*.009;
          mvPosition.xyz+=mat3(viewMatrix)*vec3(breeze*crown,0.0,breeze*crown*.4);
          gl_Position=projectionMatrix*mvPosition;
        }`);
    shader.fragmentShader='uniform float chiKind;uniform float chiWear;uniform float chiTreeColors;uniform float chiStructure;uniform sampler2D chiFabric;uniform sampler2D chiWearField;uniform vec4 chiWearBounds;varying vec3 chiTreeTint;varying vec3 chiWorld;varying float chiSeed;\n'+noise+shader.fragmentShader
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        if (chiTreeColors > .5 && diffuseColor.a < .42) discard;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        float macro=chiNoise(chiWorld.xz*.075),grain=chiNoise(chiWorld.xz*1.7);
        vec2 wearUv=(chiWorld.xz-chiWearBounds.xy)/chiWearBounds.zw;
        vec2 footTraffic=vec2(0.0);
        if(chiKind<2.5 && min(wearUv.x,wearUv.y)>=0.0 && max(wearUv.x,wearUv.y)<=1.0)footTraffic=texture2D(chiWearField,wearUv).rg;
        if(chiKind<.5){
          diffuseColor.rgb*=mix(.83,1.12,macro);
          float dry=smoothstep(.48,.82,chiNoise(chiWorld.xz*.22+17.0))*chiWear;
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.30,1.03,.70),dry*.72);
          float soil=smoothstep(.64,.83,chiNoise(chiWorld.xz*.38+5.0))*chiWear;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.115,.086,.052),soil*.55);
          float footSoil=footTraffic.r*(.35+.65*smoothstep(.10,.75,grain));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.11,.077,.043),footSoil*.72);
        }else if(chiKind<1.5){
          vec2 slab=chiWorld.xz/vec2(2.0,1.65),edge=min(fract(slab),1.0-fract(slab));
          float joint=1.0-smoothstep(.002,.010,min(edge.x,edge.y));
          float panel=chiHash(floor(slab));
          diffuseColor.rgb*=mix(.94,1.04,panel)*(1.0-joint*.23*(1.0-chiWear))*( .94+macro*.08);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.77,.72,.62),footTraffic.g*(.10+grain*.12));
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
            float fabricLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
            diffuseColor.rgb=mix(vec3(fabricLuma)*vec3(1.04,1.01,.95),diffuseColor.rgb,.38+step(.65,chiSeed)*.42);
          }else diffuseColor.rgb*=.96+grain*.06;
          if(chiStructure>.5){
            float structureValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
            diffuseColor.rgb=vec3(.035,.044,.052)+structureValue*vec3(.07,.075,.08);
          }
        }else if(chiTreeColors>.5){
          diffuseColor.rgb*=chiTreeTint*mix(.87,1.10,chiSeed)*(.94+macro*.10);
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
  material.customProgramCacheKey=()=> 'chicago-materials-lakefront-v3';material.needsUpdate=true;return material;
}

export function chicagoTreeSurface(material) {
  material.userData.treeColors=true;
  material.normalMap=texture('chi_canvas_normal.png');
  material.normalScale=new THREE.Vector2(.08,.08);
  return chicagoWeather(material,5);
}

export function chicagoFacade(material,file) {
  if(!material.isMeshStandardMaterial||material.userData.chicagoFacade)return;
  material.userData.chicagoFacade=true;
  const glass=/glass|mies|modern/.test(file),stone=/limestone|granite|deco|chicago_school|bank/.test(file);
  material.color.multiply(new THREE.Color(glass?0xcadce5:stone?0xf7ead5:0xe8d8ca));
  material.roughness=glass?.38:stone?.82:.92;
  material.metalness=glass?.16:0;
  material.emissiveIntensity=Math.min(material.emissiveIntensity,.25);
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
  material.userData.neutralStage=/kp_scrim_stripes|(?:main|side)_stage_palette/.test(material.name);
  const fabric=/vendor_tent|tent_stage/.test(file)&&!/truss|lattice/i.test(material.name);
  material.roughness=Math.max(material.roughness,fabric?.86:.65);
  material.metalness=Math.min(material.metalness,/truss|lattice/i.test(material.name)?.65:.18);
  // Cutout truss/net silhouettes keep the existing alpha-test shader. Solid
  // props share the tree/foliage variant, including a fine coating normal.
  if(material.alphaTest>0)return;
  if(!material.normalMap){material.normalMap=texture('chi_canvas_normal.png');material.normalScale=new THREE.Vector2(.15,.15);}
  chicagoWeather(material,fabric?3:4,.4);
}
