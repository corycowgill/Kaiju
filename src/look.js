// The shared stylized look: one shading layer every lit material in the main
// scene passes through, driven by one uniform block.
//
// How it reaches every material without a per-material hook: the code lives in
// patched THREE.ShaderChunk entries (fog, lights, emissive, AO, output), and
// its uniforms are added to the ShaderLib uniform sets three clones for each
// built-in material. The block is one Float32Array shared BY REFERENCE
// (UniformsUtils.clone copies typed arrays by reference), so writing it once a
// frame updates every program: no extra programs, draws or lights. Materials
// that never get the block (custom ShaderMaterials with fog) read zeros,
// which select three's stock behaviour. Which treatment a material gets
// (facade, glass, lamp, kaiju) is a CLASS number carried in a uniform every
// standard material already uploads (see setLookClass), not a define, so the
// layer adds no shader program variants. The world-space parts are compiled
// only into fogged materials (the main scene; the menu previews, the env
// capture and the depth passes have no fog).
//
// What it does (Chicago; Tokyo runs the layer switched off, see setLookLevel):
//  - height fog with a sun-side tint, fading the world into the sky's horizon
//    colour before the ground and water planes end;
//  - grounding: a top-down map of the city (R: sun-shadow height field, one
//    tap gives city-wide soft shadows on every tier; G: occlusion near
//    buildings for contact darkening) plus analytic kaiju shadows on tiers
//    without a shadow map;
//  - palette convergence (saturation and value range) across asset families;
//  - windows that light up as dusk comes on, and a sky glint on glass, in the
//    building materials;
//  - the kaiju family treatment (albedo normalisation, a stepped key, a
//    sun/sky rim, a rival tint, a glow the fight effects drive);
//  - a time of day that slides from golden hour to dusk: lights, sky, fog,
//    exposure, bloom and grade are all uniform writes.
import * as THREE from 'three';

const N = 28;
// Shadow height field range: the map's R channel is height / HS_RANGE
const HS_RANGE = 160;
/** The uniform block (vec4 uLook[N]); see IDX for the layout. */
export const lookData = new Float32Array(N * 4);
const IDX = {
  SUN: 0,     // xyz dir to the sun disc, w: layer on (1) / off (0)
  SUNH: 1,    // xy horizontal dir to the sun, z: tan(light elevation), w: fog height falloff
  HAZE: 2,    // rgb haze away from the sun, w: fog density at ground level
  HAZES: 3,   // rgb haze toward the sun, w: lobe exponent
  ZEN: 4,     // rgb zenith, w: world-edge fade start radius
  MID: 5,     // rgb mid sky, w: world-edge fade end radius
  CTR: 6,     // xy world-edge centre (x, z), z: max fog, w: time
  SHADE: 7,   // x AO strength, y AO height falloff (1/u), z map-shadow strength, w ground variation
  ENV: 8,     // rgb IBL tint, w: azimuth fill strength
  WIN: 9,     // rgb window light, w: intensity
  WIN2: 10,   // x lit fraction, y glass sky reflection, z albedo saturation, w albedo value-range strength
  MAPBOX: 11, // xy map min (x, z), zw 1 / size
  KA: 12,     // player kaiju: rgb sun-side rim, w: rim power
  KB: 13,     // rival kaiju
  KTA: 14,    // player kaiju: rgb albedo tint, w: saturation
  KTB: 15,    // rival kaiju
  BLOB0: 16,  // player kaiju shadow: x, z, radius, height
  BLOB1: 17,  // rival kaiju shadow
  SUNC: 18,   // rgb sun glow, w: disc intensity
  UNLIT: 19,  // rgb multiplier for unlit world meshes (backdrop), w: cloud cover
  FILLW: 20,  // rgb sun-side ambient, w: kaiju key ramp strength
  CLOUD: 21,  // rgb cloud lit colour, w: stars
  CLOUD2: 22, // rgb cloud shade colour, w: kaiju hero fill (share of the key that ignores shadows)
  RIMC: 23,   // rgb sky-side kaiju rim, w: rim strength
  GLOWA: 24,  // player kaiju: rgb glow colour, w: amount (fight effects: setKaijuGlow)
  GLOWB: 25,  // rival kaiju
  ARENA: 26,  // floodlit ring: x, z, radius, strength (kaiju inside it take a cool top key)
  FLOOD: 27,  // rgb floodlight colour
};
// Material classes (setLookClass)
const CLS = { NONE: 0, FACADE: 1, GLASS: 2, LAMP: 3, KAIJU_A: 4, KAIJU_B: 5 };
const set4 = (i, x, y, z, w) => { const o = i * 4; lookData[o] = x; lookData[o + 1] = y; lookData[o + 2] = z; lookData[o + 3] = w; };
const setW = (i, w) => { lookData[i * 4 + 3] = w; };

// ---------------------------------------------------------------- GLSL
const DECL = `
#ifndef LOOK_DECL
#define LOOK_DECL
uniform vec4 uLook[${N}];
float lkCls = 0.0; // this material's look class (set in main)
#endif`;
// Sky model shared by the dome, the fog and the reflections (glass, water)
const SKY_GLSL = `
float lookHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lookNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lookHash(i), lookHash(i + vec2(1.0, 0.0)), f.x), mix(lookHash(i + vec2(0.0, 1.0)), lookHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Horizon haze: a function of the view direction only, so a fogged surface
// and the sky behind it get the same colour. Warm toward the sun's bearing,
// a little deeper below the horizon (the far ground under the haze).
vec3 lookHazeCol(vec3 d) {
  float sd = max(dot(normalize(d.xz + vec2(1e-5)), uLook[1].xy), 0.0);
  vec3 c = mix(uLook[2].rgb, uLook[3].rgb, pow(sd, uLook[3].w));
  return c * (1.0 - 0.22 * smoothstep(0.0, 0.3, -d.y / (length(d) + 1e-5)));
}
vec3 lookSkyCol(vec3 d) {
  float y = max(d.y, 0.0);
  float sd = max(dot(d, uLook[0].xyz), 0.0);
  float sdh = max(dot(normalize(d.xz + vec2(1e-5)), uLook[1].xy), 0.0);
  vec3 mid = uLook[5].rgb + uLook[18].rgb * (0.22 * sdh * sdh * sdh);
  vec3 c = mix(lookHazeCol(d), mid, 1.0 - exp(-y * 6.0));
  c = mix(c, uLook[4].rgb, smoothstep(0.10, 0.85, y));
  c += uLook[18].rgb * (pow(sd, 6.0) * 0.12 + pow(sd, 40.0) * 0.25);
  return c;
}
`;

function fragPars(cfg) {
  return `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying vec3 vLookW;
  ${DECL}
  #define LOOK_Q ${cfg.q}
  ${cfg.blob ? '#define LOOK_BLOB' : ''}
  #if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
    #define LOOK_WORLD
  #endif
  ${SKY_GLSL}
  #if LOOK_Q > 0
    uniform sampler2D uLookMap;
  #endif
  // Lit windows: world-space bays x floors on a wall with normal n
  vec3 lookWin(vec3 wp, vec3 n) {
    float t = dot(wp.xz, vec2(-n.z, n.x));
    vec2 g = vec2(t / 2.1, wp.y / 1.05);
    vec2 c = floor(g), f = fract(g);
    float h = lookHash(c + floor(n.xz * 2.0 + 0.5) * 17.0);
    float zone = lookNoise(vec2(t * 0.07, wp.y * 0.10) + 3.1);
    float thr = 1.0 - uLook[10].x * (0.35 + 1.1 * zone);
    float lit = step(thr, h);
    float edge = smoothstep(0.0, 0.14, f.x) * (1.0 - smoothstep(0.86, 1.0, f.x)) * smoothstep(0.0, 0.18, f.y) * (1.0 - smoothstep(0.82, 1.0, f.y));
    float k = dot(uLook[9].rgb, vec3(0.3333));
    vec3 col = mix(uLook[9].rgb, vec3(0.62, 0.82, 1.0) * k, step(0.84, fract(h * 7.31)));
    float br = fract(h * 3.7);
    vec3 cell = col * (lit * edge * (0.22 + 0.78 * br * br));
    // Past the point where a cell is a pixel: its average, so far towers glow instead of sparkling
    float aa = clamp(1.6 - max(fwidth(g.x), fwidth(g.y)) * 1.4, 0.0, 1.0);
    return mix(uLook[9].rgb * (clamp(1.0 - thr, 0.0, 1.0) * 0.30), cell, aa);
  }
#endif`;
}

const FOG_VERT_PARS = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vLookW;
#endif`;
const FOG_VERT = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vLookW = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
#endif`;
const FOG_FRAG = `
#ifdef USE_FOG
  if ( uLook[0].w > 0.5 ) {
    vec3 lkRel = vLookW - cameraPosition;
    float lkT = uLook[1].w * lkRel.y;
    float lkF = abs( lkT ) > 0.01 ? ( 1.0 - exp( - lkT ) ) / lkT : 1.0 - 0.5 * lkT;
    float lkFog = 1.0 - exp( - uLook[2].w * length( lkRel ) * exp( - uLook[1].w * max( cameraPosition.y, 0.0 ) ) * lkF );
    lkFog = min( lkFog, uLook[6].z );
    lkFog = max( lkFog, smoothstep( uLook[4].w, uLook[5].w, length( vLookW.xz - uLook[6].xy ) ) );
    vec3 lkHaze = lookHazeCol( lkRel );
    #ifdef TONE_MAPPING
      lkHaze = toneMapping( lkHaze );
    #endif
    lkHaze = linearToOutputTexel( vec4( lkHaze, 1.0 ) ).rgb;
    gl_FragColor.rgb = mix( gl_FragColor.rgb, lkHaze, lkFog );
  } else {
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif`;

// After the albedo and the normal are known: palette, ground variation, windows
const ALBEDO = `
#if defined( USE_AOMAP ) && defined( STANDARD )
  // The class rides in the tens of aoMapIntensity (setLookClass)
  lkCls = floor( aoMapIntensity * 0.1 + 0.05 );
#endif
#ifdef LOOK_WORLD
  #define LOOK_HAS_N
  vec3 lkN = inverseTransformDirection( normal, viewMatrix );
  if ( lkCls > 3.5 ) {
    // Kaiju (every level): albedo to the family's common value / saturation range
    vec4 lkTint = lkCls > 4.5 ? uLook[15] : uLook[14];
    float lkLk = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    diffuseColor.rgb = mix( vec3( lkLk ), diffuseColor.rgb, lkTint.w ) * lkTint.rgb;
  } else if ( uLook[0].w > 0.5 ) {
    float lkL = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    {
      float lkGlass = 0.0;
      bool lkFacade = lkCls > 0.5 && lkCls < 2.5;
      if ( lkFacade ) {
        float lkWall = 1.0 - smoothstep( 0.3, 0.6, abs( lkN.y ) );
        if ( lkCls > 1.5 ) {
          lkGlass = lkWall;
        } else {
          // The mask reads the facade two mips down where it can: a whole pane
          // lights evenly instead of tracing the texture's painted reflections
          #if LOOK_Q > 0 && defined( USE_MAP )
            vec3 lkSoft = texture2D( map, vMapUv, 2.0 ).rgb * diffuse;
          #else
            vec3 lkSoft = diffuseColor.rgb;
          #endif
          float lkBlue = smoothstep( 0.03, 0.16, lkSoft.b - lkSoft.r );
          lkGlass = max( 1.0 - smoothstep( 0.015, 0.11, dot( lkSoft, vec3( 0.2126, 0.7152, 0.0722 ) ) ), lkBlue ) * lkWall;
        }
      }
      // One saturation and value range for every asset family (painted-dark
      // AI blocks come up, chalk-white massing comes down); glass keeps its depth
      float lkL2 = 0.035 + 0.60 * lkL / ( lkL * 0.55 + 0.45 );
      float lkK = mix( 1.0, min( lkL2 / max( lkL, 0.004 ), 3.0 ), uLook[10].w * ( 1.0 - 0.8 * lkGlass ) );
      diffuseColor.rgb = mix( vec3( lkL ), diffuseColor.rgb, uLook[10].z ) * lkK;
      #if LOOK_Q > 0
        // Flat ground: break up the tiling with a slow value drift
        float lkUp = smoothstep( 0.6, 0.9, lkN.y ) * ( 1.0 - smoothstep( 1.0, 3.0, vLookW.y ) );
        float lkV = lookNoise( vLookW.xz * 0.031 ) * 0.62 + lookNoise( vLookW.xz * 0.12 + 7.3 ) * 0.38;
        diffuseColor.rgb *= 1.0 + ( lkV - 0.5 ) * uLook[7].w * lkUp;
      #endif
      // Street lamps: the palette's white globe texels glow as the windows do
      if ( lkCls > 2.5 ) totalEmissiveRadiance += uLook[9].rgb * ( smoothstep( 0.5, 0.8, lkL ) * uLook[9].w * 1.6 );
      if ( lkFacade ) {
        totalEmissiveRadiance += lookWin( vLookW, lkN ) * ( lkGlass * uLook[9].w );
        vec3 lkVd = normalize( vLookW - cameraPosition );
        vec3 lkR = reflect( lkVd, lkN );
        float lkFr = 0.05 + 0.95 * pow( 1.0 - clamp( dot( - lkVd, lkN ), 0.0, 1.0 ), 4.0 );
        totalEmissiveRadiance += lookSkyCol( lkR ) * ( lkGlass * lkFr * uLook[10].y );
      }
    }
  }
#endif`;

// Before the lights: sun visibility and occlusion at this fragment
const SHADE = `
#ifdef LOOK_WORLD
  // (a material hook may have replaced the chunk that declares the world normal)
  #ifndef LOOK_HAS_N
    vec3 lkN = inverseTransformDirection( normal, viewMatrix );
  #endif
  float lkSun = 1.0, lkAO = 1.0;
  if ( uLook[0].w > 0.5 ) {
    #if LOOK_Q > 0
      vec2 lkM = texture2D( uLookMap, ( vLookW.xz + lkN.xz * 1.6 - uLook[11].xy ) * uLook[11].zw ).rg;
      lkSun = 1.0 - uLook[7].z * smoothstep( -0.4, 2.4, lkM.r * ${HS_RANGE.toFixed(1)} - vLookW.y - 0.9 );
      if ( lkCls > 3.5 ) lkSun = mix( 1.0, lkSun, 0.6 ); // the stars are never fully in a tower's shadow
      lkAO = 1.0 - uLook[7].x * min( lkM.g * 1.25, 1.0 ) * exp( - max( vLookW.y, 0.0 ) * uLook[7].y );
    #else
      if ( lkCls > 0.5 && lkCls < 2.5 ) lkAO = 1.0 - uLook[7].x * 0.6 * exp( - max( vLookW.y, 0.0 ) * uLook[7].y ) * ( 1.0 - abs( lkN.y ) );
    #endif
    #ifdef LOOK_BLOB
      // No shadow map on this tier: each kaiju's shadow as a soft capsule laid along the ground
      vec2 lkPerp = vec2( - uLook[1].y, uLook[1].x );
      if ( uLook[16].z > 0.0 && lkCls != 4.0 ) {
        vec2 r = vLookW.xz - uLook[16].xy;
        float len = min( uLook[16].w / uLook[1].z, 110.0 ), al = - dot( r, uLook[1].xy ), a = clamp( al, 0.0, len );
        float dd = length( vec2( al - a, dot( r, lkPerp ) ) );
        float top = uLook[16].w * ( 1.0 - a / len );
        lkSun *= 1.0 - 0.8 * ( 1.0 - smoothstep( uLook[16].z * 0.45, uLook[16].z * 1.2, dd ) ) * ( 1.0 - smoothstep( top - 1.0, top + 3.0, vLookW.y ) ) * ( 1.0 - 0.45 * a / len );
      }
      if ( uLook[17].z > 0.0 && lkCls != 5.0 ) {
        vec2 r = vLookW.xz - uLook[17].xy;
        float len = min( uLook[17].w / uLook[1].z, 110.0 ), al = - dot( r, uLook[1].xy ), a = clamp( al, 0.0, len );
        float dd = length( vec2( al - a, dot( r, lkPerp ) ) );
        float top = uLook[17].w * ( 1.0 - a / len );
        lkSun *= 1.0 - 0.8 * ( 1.0 - smoothstep( uLook[17].z * 0.45, uLook[17].z * 1.2, dd ) ) * ( 1.0 - smoothstep( top - 1.0, top + 3.0, vLookW.y ) ) * ( 1.0 - 0.45 * a / len );
      }
    #endif
  }
#endif
`;
const SUN_VIS = `
    #if defined( LOOK_WORLD ) && UNROLLED_LOOP_INDEX == 0
      directLight.color *= lkSun;
    #endif`;
// Sun-side ambient: the warm half of the sky as an azimuth term (tiers with
// IBL get it from the environment map and run this at low strength)
const FILL = `
#if defined( RE_IndirectDiffuse ) && defined( LOOK_WORLD ) && NUM_DIR_LIGHTS > 0
  if ( lkCls > 3.5 ) {
    // The stars stay lit: a share of the key that no shadow takes away, wrapped round the form
    irradiance += directionalLights[ 0 ].color * ( uLook[22].w * ( 0.3 + 0.7 * clamp( dot( geometryNormal, directionalLights[ 0 ].direction ) * 0.7 + 0.3, 0.0, 1.0 ) ) );
    // ...and inside the floodlit ring, the towers' cool top light
    if ( uLook[26].w > 0.0 ) {
      float lkFl = 1.0 - smoothstep( uLook[26].z * 0.85, uLook[26].z * 1.7, length( vLookW.xz - uLook[26].xy ) );
      irradiance += uLook[27].rgb * ( uLook[26].w * lkFl * ( 0.3 + 0.7 * clamp( lkN.y * 0.65 + 0.5, 0.0, 1.0 ) ) );
    }
  }
#endif
#if defined( RE_IndirectDiffuse ) && defined( LOOK_WORLD )
  if ( uLook[0].w > 0.5 ) irradiance += uLook[20].rgb * ( uLook[8].w * ( 0.5 + 0.5 * dot( lkN.xz, uLook[1].xy ) ) * ( 0.6 + 0.4 * lkN.y ) );
#endif`;
const AO = `
#ifdef LOOK_WORLD
  reflectedLight.indirectDiffuse *= lkAO;
  reflectedLight.indirectSpecular *= lkAO;
  reflectedLight.directDiffuse *= mix( 1.0, lkAO, 0.7 );
  reflectedLight.directSpecular *= lkAO;
#endif`;
// Just before the colour is written: kaiju rim, unlit world meshes
const OUT = `
#ifdef STANDARD
if ( lkCls > 3.5 ) {
  // Kaiju rim: warm toward the sun, sky-coloured away from it, so the
  // silhouette separates from the city at every angle; plus the fight glow
  vec4 lkRimC = lkCls > 4.5 ? uLook[13] : uLook[12];
  vec4 lkGlow = lkCls > 4.5 ? uLook[25] : uLook[24];
  vec3 lkRn = inverseTransformDirection( normal, viewMatrix );
  float lkNV = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  float lkFres = pow( lkNV, lkRimC.w );
  float lkSide = clamp( dot( lkRn, uLook[0].xyz ) * 0.6 + 0.5, 0.0, 1.0 );
  outgoingLight += mix( uLook[23].rgb, lkRimC.rgb, lkSide ) * ( lkFres * uLook[23].w * ( 0.45 + 0.55 * clamp( lkRn.y + 0.75, 0.0, 1.0 ) ) );
  outgoingLight += lkGlow.rgb * ( lkGlow.w * ( 0.18 + 1.5 * lkNV * lkNV ) );
}
#endif
#if defined( LOOK_UNLIT ) && defined( USE_FOG )
  if ( uLook[0].w > 0.5 ) {
    vec3 lkFn = normalize( cross( dFdx( vLookW ), dFdy( vLookW ) ) );
    outgoingLight *= uLook[19].rgb * ( 0.8 + 0.5 * clamp( dot( lkFn, uLook[0].xyz ), 0.0, 1.0 ) );
    #ifdef LOOK_UNLIT_WIN
      outgoingLight += lookWin( vLookW, lkFn ) * ( ( 1.0 - smoothstep( 0.3, 0.6, abs( lkFn.y ) ) ) * uLook[9].w * 0.55 );
    #endif
  }
#endif
`;

let _cfg = null;
let _mapTex = null;

/** Patch three's shader chunks and uniform sets. Call once, before any
 *  material compiles. cfg: { q: 0|1|2 detail, blob: analytic kaiju shadows
 *  (tiers without a shadow map), mapSize } */
export function initLook(cfg) {
  if (_cfg) return;
  _cfg = cfg;
  const C = THREE.ShaderChunk;
  C.common = DECL + '\n' + C.common;
  C.fog_pars_vertex = FOG_VERT_PARS;
  C.fog_vertex = FOG_VERT;
  C.fog_pars_fragment = fragPars(cfg);
  C.fog_fragment = FOG_FRAG;
  C.envmap_physical_pars_fragment = C.envmap_physical_pars_fragment
    .replace('return PI * envMapColor.rgb * envMapIntensity;', 'return PI * envMapColor.rgb * envMapIntensity * uLook[8].rgb;')
    .replace('return envMapColor.rgb * envMapIntensity;', 'return envMapColor.rgb * envMapIntensity * uLook[8].rgb;');
  C.emissivemap_fragment += ALBEDO;
  C.lights_fragment_begin = SHADE + C.lights_fragment_begin
    .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );' + SUN_VIS) + FILL;
  // (aoMapIntensity also carries the class in its tens: the AO term uses what is left)
  C.aomap_fragment = C.aomap_fragment.replace('* aoMapIntensity + 1.0', '* ( aoMapIntensity - 10.0 * lkCls ) + 1.0') + AO;
  if (!C.aomap_fragment.includes('10.0 * lkCls')) console.warn('[look] aomap_fragment has changed');
  // Kaiju: the key's falloff as a soft two-band ramp, so the form reads in
  // planes of light and shade (it also hides faceting and painted-in shading)
  C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;',
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tif ( lkCls > 3.5 ) dotNL = mix( dotNL, smoothstep( 0.0, 0.34, dotNL ) * ( 0.62 + 0.38 * dotNL ), uLook[20].w );\n\tvec3 irradiance = dotNL * directLight.color;');
  if (!C.lights_physical_pars_fragment.includes('lkCls')) console.warn('[look] kaiju ramp: lights_physical_pars_fragment has changed');
  C.opaque_fragment = OUT + C.opaque_fragment;
  // 1x1 until a level builds its map; clone() returns the texture itself so
  // every material's uniform set points at the one object
  _mapTex = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  _mapTex.magFilter = _mapTex.minFilter = THREE.LinearFilter;
  _mapTex.clone = () => _mapTex;
  _mapTex.needsUpdate = true;
  // ShaderMaterials assembled from UniformsLib.fog (the effect flipbooks) get the block too
  THREE.UniformsLib.fog.uLook = { value: lookData };
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (!u) continue;
    u.uLook = { value: lookData };
    if (u.fogColor) u.uLookMap = { value: _mapTex };
  }
  setLookLevel('tokyo');
}

// ---------------------------------------------------------------- sky dome
/** Chicago's sky: the shared sky model plus a sun disc and two cloud decks.
 *  The dome follows the camera (updateLook). */
export function makeLookSky(octaves = 4) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uLook: { value: lookData }, uEnv: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `
      ${DECL}
      uniform float uEnv;
      varying vec3 vP;
      ${SKY_GLSL}
      float fbm(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < ${octaves}; i++) { s += a * lookNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vP);
        vec3 col = lookSkyCol(d);
        float sd = max(dot(d, uLook[0].xyz), 0.0);
        float t = uLook[6].w * 0.004;
        // Cloud decks: streaks stretched across the sun's bearing, lit from below on the sun side
        if (d.y > 0.0 && uLook[19].w > 0.0) {
          vec2 across = uLook[1].xy, along = vec2(-uLook[1].y, uLook[1].x);
          vec2 q = d.xz / (d.y + 0.24);
          vec2 uv = vec2(dot(q, along) * 0.75, dot(q, across) * 1.35);
          float w = fbm(uv * 0.8 + vec2(t, t * 0.3));
          float n = fbm(uv * 1.7 + vec2(w * 1.3 - t * 1.4, 4.0 - w * 0.9));
          float lo = 1.0 - uLook[19].w;
          float c1 = smoothstep(lo, lo + 0.20, n);
          float core = smoothstep(lo + 0.08, lo + 0.40, n);
          float sdh = max(dot(normalize(d.xz + vec2(1e-5)), uLook[1].xy), 0.0);
          float low = 1.0 - smoothstep(0.05, 0.6, d.y);
          // Edges catch the low sun (brightest toward it), cores go to the shade colour
          vec3 lit = uLook[21].rgb * (0.62 + 0.75 * sdh * sdh * low + 0.9 * pow(sd, 12.0));
          // (low sun: only the decks near its bearing still catch it)
          float lost = (1.0 - smoothstep(-0.05, 0.22, uLook[0].y)) * (1.0 - sdh * sdh * (0.4 + 0.6 * low));
          vec3 cc = mix(lit, uLook[22].rgb, max(core * 0.85, lost * 0.9));
          col = mix(col, cc, c1 * smoothstep(0.02, 0.2, d.y) * 0.9);
        }
        // Stars as dusk deepens
        if (uLook[21].w > 0.0 && d.y > 0.25) {
          float s = lookHash(floor(d.xz / (d.y + 0.3) * 260.0));
          col += vec3(0.8, 0.86, 1.0) * (step(0.9975, s) * uLook[21].w * smoothstep(0.25, 0.6, d.y));
        }
        // Sun disc (not in the environment capture: a point that hot blotches the PMREM)
        col += uLook[18].rgb * (smoothstep(0.99955, 0.99985, sd) * uLook[18].w * (1.0 - uEnv));
        // Below the horizon: the haze the fog fades to; the capture gets a darker ground instead
        if (d.y < 0.0) col = lookHazeCol(d) * mix(1.0, mix(1.0, 0.4, uEnv), 1.0 - smoothstep(-0.35, 0.0, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- time of day
// Keys the look slides between. Colours are sRGB hex (converted to linear
// here); [hex, scale] where the value is an intensity-carrying colour.
const _c = new THREE.Color();
const lin = (hex, k = 1) => { _c.setHex(hex); return [_c.r * k, _c.g * k, _c.b * k]; };
const KEYS = [
  { // golden hour
    discElev: 16, lightElev: 23,
    sun: lin(0xffd0a0), sunI: 3.3,
    fill: lin(0xc2d2ee), fillI: 0.55,
    hemiSky: lin(0xb4c6e6), hemiGround: lin(0x6e5c4c), hemiI: 0.46,
    amb: lin(0x5c7090), ambI: 0.06,
    haze: lin(0xa8b6c8), hazeSun: lin(0xffc48a), hazeExp: 2.2, fogD: 0.00125, fogK: 0.011, fogMax: 0.93,
    zen: lin(0x3f6fb2), mid: lin(0x86abd6), glow: lin(0xffb066), disc: 9,
    env: [0.72, 0.72, 0.74], fillW: lin(0xffb47a), fillWI: 0.28,
    win: lin(0xffc37a), winI: 0.45, winFrac: 0.13, glass: 0.55,
    sat: 0.86, val: 0.8, ao: 0.62, shadow: 0.9, groundVar: 0.34,
    unlit: [0.62, 0.56, 0.52],
    cloud: lin(0xfff0dc), cloudShade: lin(0x9a98b4), cover: 0.50, stars: 0,
    rimSun: lin(0xffc890, 1.5), rimSky: lin(0x9dc4ff, 0.75), rimI: 1.0, hero: 0.22, flood: 0.35,
    exposure: 1.02, bloomT: 0.95, bloomS: 0.38,
    gradeMix: 0.5, gradeShadow: [0.88, 0.94, 1.08], gradeHigh: [1.07, 1.0, 0.90],
  },
  { // sunset
    discElev: 6, lightElev: 17,
    sun: lin(0xffa066), sunI: 2.7,
    fill: lin(0xb6c4ea), fillI: 0.5,
    hemiSky: lin(0xa0aedc), hemiGround: lin(0x5c4a52), hemiI: 0.40,
    amb: lin(0x54608f), ambI: 0.09,
    haze: lin(0x7f88ad), hazeSun: lin(0xff9d62), hazeExp: 2.0, fogD: 0.00135, fogK: 0.011, fogMax: 0.93,
    zen: lin(0x2f4f96), mid: lin(0x7489c8), glow: lin(0xff8c4a), disc: 8,
    env: [0.64, 0.64, 0.70], fillW: lin(0xff9860), fillWI: 0.30,
    win: lin(0xffbf74), winI: 0.85, winFrac: 0.26, glass: 0.6,
    sat: 0.86, val: 0.8, ao: 0.64, shadow: 0.88, groundVar: 0.34,
    unlit: [0.50, 0.42, 0.44],
    cloud: lin(0xffb087), cloudShade: lin(0x6f6590), cover: 0.52, stars: 0,
    rimSun: lin(0xffa870, 1.6), rimSky: lin(0x94b4ff, 0.8), rimI: 1.05, hero: 0.26, flood: 0.42,
    exposure: 1.06, bloomT: 0.95, bloomS: 0.40,
    gradeMix: 0.52, gradeShadow: [0.86, 0.90, 1.10], gradeHigh: [1.08, 0.99, 0.88],
  },
  { // dusk: the sun is down, its afterglow is the key
    discElev: -3, lightElev: 13,
    sun: lin(0xff8a5e), sunI: 1.45,
    fill: lin(0xaab4e0), fillI: 0.55,
    hemiSky: lin(0x7d88c4), hemiGround: lin(0x44394e), hemiI: 0.54,
    amb: lin(0x4b5280), ambI: 0.12,
    haze: lin(0x4d527e), hazeSun: lin(0xf0794e), hazeExp: 1.8, fogD: 0.0014, fogK: 0.011, fogMax: 0.92,
    zen: lin(0x10173f), mid: lin(0x3d4690), glow: lin(0xff6a3c), disc: 0,
    env: [0.42, 0.44, 0.60], fillW: lin(0xff7c50), fillWI: 0.26,
    win: lin(0xffb866), winI: 1.35, winFrac: 0.38, glass: 0.5,
    sat: 0.84, val: 0.8, ao: 0.66, shadow: 0.8, groundVar: 0.34,
    unlit: [0.30, 0.27, 0.36],
    cloud: lin(0xd97a66), cloudShade: lin(0x34325c), cover: 0.54, stars: 0.7,
    rimSun: lin(0xff9060, 1.5), rimSky: lin(0x8aa6ff, 0.95), rimI: 1.15, hero: 0.34, flood: 0.5,
    exposure: 1.14, bloomT: 0.95, bloomS: 0.42,
    gradeMix: 0.5, gradeShadow: [0.90, 0.91, 1.08], gradeHigh: [1.07, 0.99, 0.90],
  },
];
const KEY_T = [0, 0.5, 1];
// Bearing of the sun (x, z): west-south-west, about 57 degrees left of the
// lakefront camera's westward view, so towers and kaiju are side-lit
const SUN_AZ = [-0.545, 0.838];
const _cur = {};
for (const k of Object.keys(KEYS[0])) _cur[k] = Array.isArray(KEYS[0][k]) ? [0, 0, 0] : 0;
function _blend(t) {
  let i = 0;
  while (i < KEY_T.length - 2 && t > KEY_T[i + 1]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let f = (t - KEY_T[i]) / (KEY_T[i + 1] - KEY_T[i]);
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  for (const k in _cur) {
    const va = a[k], vb = b[k];
    if (typeof va === 'number') _cur[k] = va + (vb - va) * f;
    else { const o = _cur[k]; o[0] = va[0] + (vb[0] - va[0]) * f; o[1] = va[1] + (vb[1] - va[1]) * f; o[2] = va[2] + (vb[2] - va[2]) * f; }
  }
}

// ---------------------------------------------------------------- state
const L = {
  level: 'tokyo', refs: null, tod: 0, clock: 0, todFixed: null,
  duration: 330,        // seconds of play from golden hour to dusk
  lightDir: new THREE.Vector3(0, 1, 0),
  discDir: new THREE.Vector3(0, 1, 0),
  dipA: 0, dipB: 0,
  dip: 0,               // exposure dip (0..1) for full-screen flashes
  hasEnv: false,
};
{
  const m = typeof location !== 'undefined' && location.search.match(/[?&]tod=([\d.]+)/);
  if (m) L.todFixed = Math.max(0, Math.min(1, +m[1]));
}

/** refs: { renderer, scene, sun, sunOffset (Vector3 the shadow rig adds to
 *  the kaiju position), hemi, ambient, fill (the second directional), sky,
 *  bloom: () => bloomPass, cine: () => cine pass, hasEnv } */
export function bindLook(refs) { L.refs = refs; L.hasEnv = !!refs.hasEnv; }

/** Restart the slide toward dusk (a new run). */
export function resetLookClock() { L.clock = 0; }
/** 0 golden hour .. 1 dusk; null hands it back to the clock. */
export function setLookTime(t) { L.todFixed = t; }
export function lookTime() { return L.tod; }
/** Direction to the sun disc (world), for screen-space sun effects. */
export function lookSunDir() { return L.discDir; }
/** 1 while the sun is up, falling to 0 as it sets (god rays have nothing to streak from after). */
export function lookSunUp() { const y = L.discDir.y; return y > 0.12 ? 1 : y < 0.02 ? 0 : (y - 0.02) / 0.1; }
/** Run fn (the environment capture) under a fixed mid-slide sky, then restore. */
export function withLookEnvSky(fn) {
  if (L.level !== 'chicago') { fn(); return; }
  _applyTime(0.3);
  try { fn(); } finally { _applyTime(L.todFixed != null ? L.todFixed : _todFromClock()); }
}
/** Brief exposure dip so a full-screen flash reads as light instead of clipping (0..1). */
export function setLookDip(v) { L.dipA = v; L.dip = Math.max(L.dipA, L.dipB); }
/** The same dip for other callers (fight effects: a finisher flash); the larger of the two applies. */
export function setLookFxDip(v) { L.dipB = v; L.dip = Math.max(L.dipA, L.dipB); }

/** Switch the layer for a level. Tokyo keeps its own look: the layer is off
 *  there except for the kaiju rim. */
export function setLookLevel(level) {
  L.level = level;
  if (level !== 'chicago') {
    lookData.fill(0, 0, IDX.GLOWA * 4);
    lookData.fill(0, IDX.ARENA * 4);
    // Tokyo's low west sun and cool back light, as the kaiju rim's two sides
    const d = new THREE.Vector3(-100, 100, 45).normalize();
    set4(IDX.SUN, d.x, d.y, d.z, 0);
    set4(IDX.ENV, 1, 1, 1, 0);
    set4(IDX.KA, ...lin(0xffa070, 1.0), 2.6);
    set4(IDX.KB, ...lin(0xff5a7a, 1.1), 2.6);
    set4(IDX.KTA, 1, 1, 1, 1); set4(IDX.KTB, 1, 1, 1, 1);
    set4(IDX.RIMC, ...lin(0x6fa8ff, 0.7), 0.8);
    setW(IDX.FILLW, KAIJU_RAMP);
    return;
  }
  set4(IDX.KTA, 1, 1, 1, 1); set4(IDX.KTB, 1, 1, 1, 1);
  _applyTime(L.todFixed != null ? L.todFixed : _todFromClock());
}
const _todFromClock = () => { const x = Math.min(1, L.clock / L.duration); return x * x * (3 - 2 * x); };

function _applyTime(t) {
  L.tod = t;
  _blend(t);
  const c = _cur, R = L.refs;
  const de = c.discElev * Math.PI / 180, le = c.lightElev * Math.PI / 180;
  L.discDir.set(SUN_AZ[0] * Math.cos(de), Math.sin(de), SUN_AZ[1] * Math.cos(de));
  set4(IDX.SUN, L.discDir.x, L.discDir.y, L.discDir.z, 1);
  set4(IDX.SUNH, SUN_AZ[0], SUN_AZ[1], Math.tan(le), c.fogK);
  set4(IDX.HAZE, c.haze[0], c.haze[1], c.haze[2], c.fogD);
  set4(IDX.HAZES, c.hazeSun[0], c.hazeSun[1], c.hazeSun[2], c.hazeExp);
  set4(IDX.ZEN, c.zen[0], c.zen[1], c.zen[2], _edge[2]);
  set4(IDX.MID, c.mid[0], c.mid[1], c.mid[2], _edge[3]);
  lookData[IDX.CTR * 4] = _edge[0]; lookData[IDX.CTR * 4 + 1] = _edge[1]; lookData[IDX.CTR * 4 + 2] = c.fogMax;
  set4(IDX.SHADE, c.ao, 1 / 9, c.shadow, c.groundVar);
  const ek = L.hasEnv ? 1 : 0;
  set4(IDX.ENV, c.env[0] * ek, c.env[1] * ek, c.env[2] * ek, c.fillWI * (L.hasEnv ? 0.35 : 1));
  set4(IDX.WIN, c.win[0], c.win[1], c.win[2], c.winI);
  set4(IDX.WIN2, c.winFrac, c.glass, c.sat, c.val);
  set4(IDX.SUNC, c.glow[0], c.glow[1], c.glow[2], c.disc);
  set4(IDX.UNLIT, c.unlit[0], c.unlit[1], c.unlit[2], c.cover);
  set4(IDX.FILLW, c.fillW[0], c.fillW[1], c.fillW[2], KAIJU_RAMP);
  set4(IDX.CLOUD, c.cloud[0], c.cloud[1], c.cloud[2], c.stars);
  set4(IDX.CLOUD2, c.cloudShade[0], c.cloudShade[1], c.cloudShade[2], c.hero);
  const ka = _kaiju[0], kb = _kaiju[1];
  set4(IDX.KA, c.rimSun[0] * ka.rim[0], c.rimSun[1] * ka.rim[1], c.rimSun[2] * ka.rim[2], ka.power);
  set4(IDX.KB, c.rimSun[0] * kb.rim[0], c.rimSun[1] * kb.rim[1], c.rimSun[2] * kb.rim[2], kb.power);
  set4(IDX.KTA, ka.tint[0], ka.tint[1], ka.tint[2], ka.sat);
  set4(IDX.KTB, kb.tint[0], kb.tint[1], kb.tint[2], kb.sat);
  set4(IDX.RIMC, c.rimSky[0], c.rimSky[1], c.rimSky[2], c.rimI);
  // Floodlights come up as the daylight goes (the arena scales its lamps the same way: 0.55 -> 1)
  set4(IDX.ARENA, _arena[0], _arena[1], _arena[2], _arena[2] > 0 ? c.flood * (0.55 + 0.45 * t) : 0);
  set4(IDX.FLOOD, 0.80, 0.90, 1.0, 0);
  L.lightDir.set(SUN_AZ[0] * Math.cos(le), Math.sin(le), SUN_AZ[1] * Math.cos(le));
  if (!R) return;
  R.sun.color.setRGB(c.sun[0], c.sun[1], c.sun[2]); R.sun.intensity = c.sunI;
  R.sunOffset.copy(L.lightDir).multiplyScalar(190);
  R.fill.color.setRGB(c.fill[0], c.fill[1], c.fill[2]); R.fill.intensity = c.fillI;
  R.fill.position.set(-SUN_AZ[0] * 70, 80, -SUN_AZ[1] * 70);
  // Without IBL the hemisphere carries the sky fill alone
  const hk = L.hasEnv ? 1 : 2.3;
  R.hemi.color.setRGB(c.hemiSky[0], c.hemiSky[1], c.hemiSky[2]); R.hemi.groundColor.setRGB(c.hemiGround[0], c.hemiGround[1], c.hemiGround[2]); R.hemi.intensity = c.hemiI * hk;
  R.ambient.color.setRGB(c.amb[0], c.amb[1], c.amb[2]); R.ambient.intensity = c.ambI * hk;
  // Stock-fog materials (effects that never get the block) fade to the plain haze
  R.scene.fog.color.setRGB(c.haze[0], c.haze[1], c.haze[2]); R.scene.fog.density = c.fogD * 0.9;
  R.scene.background.setRGB(c.haze[0], c.haze[1], c.haze[2]);
  R.renderer.toneMappingExposure = c.exposure * (1 - 0.3 * L.dip);
  const bloom = R.bloom && R.bloom();
  if (bloom) { bloom.threshold = c.bloomT; bloom.strength = c.bloomS * (R.bloomK || 1) * (1 - 0.35 * L.dip); }
  const cine = R.cine && R.cine();
  if (cine) {
    cine.uniforms.gradeMix.value = c.gradeMix;
    cine.uniforms.shadowTint.value.fromArray(c.gradeShadow);
    cine.uniforms.highTint.value.fromArray(c.gradeHigh);
  }
}

/** Per frame. dt: seconds of play (0 while paused); time: world time;
 *  p0 / p1: the kaiju roots (or null) for the analytic shadows. */
export function updateLook(dt, time, camera, p0, p1) {
  lookData[IDX.CTR * 4 + 3] = time;
  if (L.level !== 'chicago') return;
  L.clock += dt;
  _applyTime(L.todFixed != null ? L.todFixed : _todFromClock());
  if (L.refs && L.refs.sky) L.refs.sky.position.copy(camera.position);
  _blob(IDX.BLOB0, p0, 0); _blob(IDX.BLOB1, p1, 1);
  if (_map) _mapTick();
}
function _blob(i, root, slot) {
  if (!root || !root.parent || !root.visible) { setW(i, 0); lookData[i * 4 + 2] = 0; return; }
  const k = _kaiju[slot];
  set4(i, root.position.x, root.position.z, k.radius, k.height + root.position.y);
}

// ---------------------------------------------------------------- kaiju
// Per-slot treatment (0 player, 1 rival). rim multiplies the sun-side rim
// colour; tint / sat normalise the albedo so the three read as one family.
const _kaiju = [
  { rim: [1, 1, 1], power: 2.4, tint: [1, 1, 1], sat: 1, radius: 9, height: 30, root: null },
  { rim: [1, 1, 1], power: 2.4, tint: [1, 1, 1], sat: 1, radius: 9, height: 30, root: null },
];
const KAIJU_RAMP = 0.75;
// Albedo normalisation per model: value gain and saturation toward a common
// range (measured on the files' base colour), specular kept under control
const KAIJU_STYLE = {
  godzilla: { gain: 1.2, sat: 1.6, rough: 0.72, radius: 9, height: 30 },
  ghidorah: { gain: 0.9, sat: 1.0, rough: 0.66, radius: 11, height: 36 },
  mecha:    { gain: 1.15, sat: 1.4, rough: 0.5, radius: 8.5, height: 28 },
};
/** Tag a kaiju's materials for the family treatment. slot 0: the player,
 *  1: the rival (its own rim colour, so a mirror match stays readable;
 *  opts.tint multiplies its albedo on top). Idempotent. */
export function styleKaiju(root, slot, key, opts = {}) {
  if (!root) return;
  const st = KAIJU_STYLE[key] || { gain: 1, sat: 1, rough: 0.7, radius: 9, height: 30 };
  const k = _kaiju[slot];
  const t = opts.tint || (slot === 1 ? [1.0, 0.93, 0.93] : [1, 1, 1]);
  k.tint[0] = st.gain * t[0]; k.tint[1] = st.gain * t[1]; k.tint[2] = st.gain * t[2];
  k.sat = st.sat * (opts.sat || 1);
  k.radius = st.radius; k.height = st.height;
  // The rival's sun-side rim leans magenta-red, the player's stays gold
  k.rim = opts.rim || (slot === 1 ? [1.25, 0.42, 0.55] : [1, 1, 1]);
  k.root = root;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      let m = mats[i];
      if (!m || !m.isMeshStandardMaterial) continue;
      if (m.userData.lookSlot === slot) continue;
      // A material the other slot holds right now (a mirror match): its own copy
      if (m.userData.lookSlot !== undefined && _kaiju[1 - slot].root && _kaiju[1 - slot].root !== root && _uses(_kaiju[1 - slot].root, m)) {
        m = m.clone();
        if (Array.isArray(o.material)) o.material[i] = m; else o.material = m;
      }
      m.userData.lookSlot = slot;
      setLookClass(m, slot ? CLS.KAIJU_B : CLS.KAIJU_A);
      m.roughness = st.rough;
      // glTF specular colour factors over 1 (these files carry [2,2,2]) blow the highlights out
      if (m.specularColor) m.specularColor.setRGB(1, 1, 1);
      if (m.specularIntensity !== undefined) m.specularIntensity = 0.6;
      m.envMapIntensity = 0.8;
    }
  });
}
function _uses(root, mat) {
  let hit = false;
  root.traverse((o) => { if (o.material === mat || (Array.isArray(o.material) && o.material.includes(mat))) hit = true; });
  return hit;
}
const _gc = new THREE.Color();
/** Fight effects: a glow on a styled kaiju's body (rim-weighted emissive) in
 *  colorHex, k 0..1+ (0 turns it off). root: the kaiju's root object. */
export function setKaijuGlow(root, colorHex, k) {
  const slot = _kaiju[1].root === root ? 1 : (_kaiju[0].root === root ? 0 : -1);
  if (slot < 0) return;
  _gc.setHex(colorHex);
  set4(slot ? IDX.GLOWB : IDX.GLOWA, _gc.r, _gc.g, _gc.b, k);
}

/** Give a standard material a look class. The class is stored in the tens of
 *  aoMapIntensity: every GLB material carries an AO map slot (the shared
 *  white one where the file has none, see canonMaterialMaps), so that uniform
 *  is always uploaded, and the shader strips the class back out before the
 *  AO term uses it. A uniform, not a define: no extra shader programs. */
export function setLookClass(m, cls) {
  if (!m || !m.isMeshStandardMaterial) return;
  m.aoMapIntensity = (m.aoMapIntensity % 10) + cls * 10;
}

// ---------------------------------------------------------------- scene tagging
const NOT_FACADE = /^(kp_|fest_)|fence|tent|scrim|sign|banner|flag|stage/i;
function _class(m) { return Math.floor(m.aoMapIntensity / 10 + 0.05); }
function _define(m, name, value = '') {
  if (!m || (m.defines && m.defines[name] !== undefined)) return;
  m.defines = Object.assign({}, m.defines, { [name]: value });
  m.needsUpdate = true;
}
/** Classify the level's materials for the layer: building facades, glass,
 *  street lamps (classes: uniforms) and the two unlit backdrop meshes
 *  (defines, so before the prewarm links them). Idempotent. */
export function tagLookScene(scene, world) {
  if (world.level !== 'chicago') return;
  // Facades: the GLB buildings' materials, minus the festival kit and other
  // things the level places as "buildings" (fences, tents, signs)
  for (const b of world.buildings || []) {
    if (!b._glbSlots || b.h < 4.5) continue;
    for (const s of b._glbSlots) {
      const m = s.im.material;
      if (!m || !m.isMeshStandardMaterial || NOT_FACADE.test(m.name)) continue;
      if (_class(m) === CLS.NONE) setLookClass(m, /glass/i.test(m.name) ? CLS.GLASS : CLS.FACADE);
    }
  }
  for (const o of scene.children) {
    const m = o.material;
    if (!m || Array.isArray(m)) continue;
    if (o.userData.backdrop) { _define(m, 'LOOK_UNLIT'); _define(m, 'LOOK_UNLIT_WIN'); }
    else if (o.userData.outerGround) _define(m, 'LOOK_UNLIT');
    else if (o.isInstancedMesh && /streetlamp/i.test(m.name)) setLookClass(m, CLS.LAMP);
  }
  _stampTrees(scene);
}

// ---------------------------------------------------------------- city map
// World-edge fade: centre x, z and start / end radius (set with the map)
const _edge = [0, 0, 1e6, 2e6];
// The floodlit ring (world.arena): x, z, half-size; 0 when the level has none
const _arena = [0, 0, 0];
let _map = null;

/** Build the level's top-down map from its buildings: G = occlusion near
 *  footprints (contact darkening), R = sun-shadow height field. Chicago
 *  only; other levels get the 1x1 empty map. edge: { x, z, r0, r1 } */
export function buildLookMap(world, edge) {
  _map = null;
  if (edge) { _edge[0] = edge.x; _edge[1] = edge.z; _edge[2] = edge.r0; _edge[3] = edge.r1; }
  const ar = world.level === 'chicago' ? world.arena : null;
  _arena[0] = ar ? ar.cx : 0; _arena[1] = ar ? ar.cz : 0; _arena[2] = ar ? ar.half : 0;
  if (!_cfg || _cfg.q < 1 || world.level !== 'chicago' || !world.buildings) {
    set4(IDX.MAPBOX, 0, 0, 0, 0);
    return;
  }
  const S = _cfg.mapSize, B = world.bounds, PAD = 90;
  const x0 = B.minX - PAD, z0 = B.minZ - PAD, w = B.maxX - B.minX + PAD * 2, d = B.maxZ - B.minZ + PAD * 2;
  const M = _map = {
    S, x0, z0, sx: w / S, sz: d / S,
    H: new Float32Array(S * S), Sh: new Float32Array(S * S), A: new Float32Array(S * S),
    bytes: new Uint8Array(S * S * 2),
    list: world.buildings, alive: new Uint8Array(world.buildings.length), scan: 0,
    jobs: [], job: null, tanE: 0, dirty: false, lastUpload: 0,
  };
  set4(IDX.MAPBOX, x0, z0, 1 / w, 1 / d);
  for (let i = 0; i < M.list.length; i++) {
    const b = M.list[i];
    if (b.destroyed || !(b.h > 0)) continue;
    M.alive[i] = 1;
    _rasterH(M, b, b.h);
    _splatA(M, b, 1);
  }
  // The ring's posts, stands and gateway cast too (chicago_arena.js lists them)
  for (const c of (world.arena && world.arena.casters) || []) { _rasterH(M, c, c.h); _splatA(M, c, 1); }
  M.tanE = lookData[IDX.SUNH * 4 + 2];
  _sweep(M, 1, 1, S - 2, S - 2, Infinity);
  _toBytes(M, 0, 0, S - 1, S - 1);
  _mapTex.image = { data: M.bytes, width: S, height: S };
  _mapTex.needsUpdate = true;
}
const _tx = (M, x) => (x - M.x0) / M.sx, _tz = (M, z) => (z - M.z0) / M.sz;
function _rect(M, b, pad) {
  const S = M.S;
  return [
    Math.max(1, Math.floor(_tx(M, b.x - b.w / 2 - pad))), Math.max(1, Math.floor(_tz(M, b.z - b.d / 2 - pad))),
    Math.min(S - 2, Math.ceil(_tx(M, b.x + b.w / 2 + pad)) - 1), Math.min(S - 2, Math.ceil(_tz(M, b.z + b.d / 2 + pad)) - 1),
  ];
}
function _rasterH(M, b, h) {
  // Texels whose centre is inside the footprint
  const S = M.S;
  const xa = Math.max(1, Math.ceil(_tx(M, b.x - b.w / 2) - 0.5)), xb = Math.min(S - 2, Math.floor(_tx(M, b.x + b.w / 2) - 0.5));
  const za = Math.max(1, Math.ceil(_tz(M, b.z - b.d / 2) - 0.5)), zb = Math.min(S - 2, Math.floor(_tz(M, b.z + b.d / 2) - 0.5));
  for (let z = za; z <= zb; z++) for (let x = xa, o = z * S + xa; x <= xb; x++, o++) M.H[o] = h > 0 ? Math.max(M.H[o], h) : 0;
}
function _splatA(M, b, sign) {
  // Occlusion falls off over R from the footprint; taller buildings reach further and weigh more
  if (b.h < 1.2) return;
  const R = Math.min(13, Math.max(2.5, b.h * 0.45)), k = sign * Math.min(1, 0.22 + b.h / 26);
  const [xa, za, xb, zb] = _rect(M, b, R);
  const hw = b.w / 2, hd = b.d / 2, S = M.S;
  for (let z = za; z <= zb; z++) {
    const dz = Math.max(0, Math.abs(M.z0 + (z + 0.5) * M.sz - b.z) - hd);
    for (let x = xa, o = z * S + xa; x <= xb; x++, o++) {
      const dx = Math.max(0, Math.abs(M.x0 + (x + 0.5) * M.sx - b.x) - hw);
      const f = 1 - Math.sqrt(dx * dx + dz * dz) / R;
      if (f > 0) M.A[o] += k * f * f;
    }
  }
}
/** Trees are instanced props, not buildings: their long shadows go into the
 *  occlusion channel as soft capsules laid away from the sun (once per map). */
const _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3();
function _stampTrees(scene) {
  const M = _map;
  if (!M || M.trees) return;
  M.trees = true;
  const seen = new Set(), S = M.S;
  const ax = -SUN_AZ[0], az = -SUN_AZ[1]; // away from the sun
  let xa = S, za = S, xb = 0, zb = 0;
  for (const o of scene.children) {
    if (!o.isInstancedMesh || !o.material || !/^tree_/i.test(o.material.name || '')) continue;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, _m4);
      _v3.setFromMatrixPosition(_m4);
      const key = Math.round(_v3.x * 2) + ':' + Math.round(_v3.z * 2);
      if (seen.has(key)) continue; // the LOD twin of the same tree
      seen.add(key);
      const sc = Math.hypot(_m4.elements[4], _m4.elements[5], _m4.elements[6]);
      const h = Math.max(2, (bb.max.y - bb.min.y) * sc), r = Math.max(1.2, h * 0.3), len = Math.min(22, h * 2.4);
      const x0 = _v3.x, z0 = _v3.z, x1 = x0 + ax * len, z1 = z0 + az * len;
      const ta = Math.max(1, Math.floor(_tx(M, Math.min(x0, x1) - r * 1.5))), tb = Math.min(S - 2, Math.ceil(_tx(M, Math.max(x0, x1) + r * 1.5)));
      const tc = Math.max(1, Math.floor(_tz(M, Math.min(z0, z1) - r * 1.5))), td = Math.min(S - 2, Math.ceil(_tz(M, Math.max(z0, z1) + r * 1.5)));
      for (let z = tc; z <= td; z++) {
        for (let x = ta, oo = z * S + ta; x <= tb; x++, oo++) {
          const px = M.x0 + (x + 0.5) * M.sx - x0, pz = M.z0 + (z + 0.5) * M.sz - z0;
          const al = Math.max(0, Math.min(len, px * ax + pz * az));
          const dd = Math.hypot(px - ax * al, pz - az * al), rr = r * (1 + 0.5 * al / len);
          const f = 1 - dd / rr;
          if (f > 0) M.A[oo] += 0.62 * f * (2 - f) * (1 - 0.55 * al / len);
        }
      }
      xa = Math.min(xa, ta); xb = Math.max(xb, tb); za = Math.min(za, tc); zb = Math.max(zb, td);
    }
  }
  if (xb >= xa) _toBytes(M, xa, za, xb, zb);
}
/** Shadow height field over a texel rect: Sh = max(H, Sh one step toward the
 *  sun minus the height the ray gains over that step). Walks away from the
 *  sun so each texel reads finished neighbours; at most `budget` lines a
 *  call. Returns the next line to resume from, or -1 when done. */
function _sweep(M, xa, za, xb, zb, budget, resume) {
  const S = M.S, H = M.H, Sh = M.Sh;
  const lx = lookData[IDX.SUNH * 4] / M.sx, lz = lookData[IDX.SUNH * 4 + 1] / M.sz; // toward the sun, in texels
  const majorX = Math.abs(lx) >= Math.abs(lz);
  const k = 1 / Math.max(Math.abs(lx), Math.abs(lz));
  const dx = lx * k, dz = lz * k;
  const drop = Math.hypot(dx * M.sx, dz * M.sz) * M.tanE;
  if (majorX) {
    const step = dx > 0 ? -1 : 1, x1 = dx > 0 ? xa : xb;
    let x = resume !== undefined ? resume : (dx > 0 ? xb : xa);
    const fz = dz - Math.floor(dz), iz = Math.floor(dz), nx = dx > 0 ? 1 : -1;
    for (let n = 0; ; x += step, n++) {
      if (n >= budget) return x;
      for (let z = za; z <= zb; z++) {
        const o = (z + iz) * S + x + nx;
        const s = Sh[o] * (1 - fz) + Sh[o + S] * fz - drop;
        const h = H[z * S + x];
        Sh[z * S + x] = h > s ? h : s;
      }
      if (x === x1) return -1;
    }
  } else {
    const step = dz > 0 ? -1 : 1, z1 = dz > 0 ? za : zb;
    let z = resume !== undefined ? resume : (dz > 0 ? zb : za);
    const fx = dx - Math.floor(dx), ix = Math.floor(dx), nz = dz > 0 ? 1 : -1;
    for (let n = 0; ; z += step, n++) {
      if (n >= budget) return z;
      const row = (z + nz) * S, out = z * S;
      for (let x = xa; x <= xb; x++) {
        const o = row + x + ix;
        const s = Sh[o] * (1 - fx) + Sh[o + 1] * fx - drop;
        const h = H[out + x];
        Sh[out + x] = h > s ? h : s;
      }
      if (z === z1) return -1;
    }
  }
}
function _toBytes(M, xa, za, xb, zb) {
  const S = M.S, by = M.bytes, k = 255 / HS_RANGE;
  for (let z = za; z <= zb; z++) {
    for (let x = xa, o = z * S + xa; x <= xb; x++, o++) {
      const s = M.Sh[o] * k, a = M.A[o] * 204;
      by[o * 2] = s > 255 ? 255 : s;
      by[o * 2 + 1] = a > 255 ? 255 : a < 0 ? 0 : a;
    }
  }
  M.dirty = true;
}
function _mapTick() {
  const M = _map, S = M.S;
  // Buildings brought down since the last pass (a slice of the list per frame)
  const n = M.list.length, end = Math.min(n, M.scan + 500);
  for (let i = M.scan; i < end; i++) {
    if (!M.alive[i] || !M.list[i].destroyed) continue;
    M.alive[i] = 0;
    const b = M.list[i];
    _rasterH(M, b, 0);
    _splatA(M, b, -1);
    const r = _rect(M, b, 14);
    _toBytes(M, r[0], r[1], r[2], r[3]);
    // Its shadow: the footprint swept away from the sun by the shadow's length
    const len = Math.min(260, b.h / Math.max(M.tanE, 0.05)) + 8;
    const ex = -lookData[IDX.SUNH * 4] * len / M.sx, ez = -lookData[IDX.SUNH * 4 + 1] * len / M.sz;
    const job = [Math.max(1, Math.floor(Math.min(r[0], r[0] + ex))), Math.max(1, Math.floor(Math.min(r[1], r[1] + ez))),
      Math.min(S - 2, Math.ceil(Math.max(r[2], r[2] + ex))), Math.min(S - 2, Math.ceil(Math.max(r[3], r[3] + ez)))];
    if (b.h >= 1.2) _queue(M, job);
  }
  M.scan = end >= n ? 0 : end;
  // The sun has moved enough to matter: the whole field again
  const tanE = lookData[IDX.SUNH * 4 + 2];
  if (!M.job && !M.jobs.length && Math.abs(tanE - M.tanE) > 0.012) { M.tanE = tanE; _queue(M, [1, 1, S - 2, S - 2]); }
  // One job at a time, a bounded number of lines per frame
  if (!M.job && M.jobs.length) M.job = { r: M.jobs.shift(), at: undefined };
  if (M.job) {
    const r = M.job.r;
    const lines = Math.max(4, Math.floor(_cfg.mapBudget / Math.max(8, Math.max(r[2] - r[0], r[3] - r[1]) + 1)));
    const at = _sweep(M, r[0], r[1], r[2], r[3], lines, M.job.at);
    if (at === -1) { _toBytes(M, r[0], r[1], r[2], r[3]); M.job = null; } else M.job.at = at;
  }
  const now = performance.now();
  if (M.dirty && now - M.lastUpload > 120) { M.dirty = false; M.lastUpload = now; _mapTex.needsUpdate = true; }
}
function _queue(M, r) {
  // Many at once (an ultimate razes a district): one job over their union
  if (M.jobs.length >= 6) {
    const u = M.jobs[0];
    for (const j of M.jobs) { u[0] = Math.min(u[0], j[0]); u[1] = Math.min(u[1], j[1]); u[2] = Math.max(u[2], j[2]); u[3] = Math.max(u[3], j[3]); }
    u[0] = Math.min(u[0], r[0]); u[1] = Math.min(u[1], r[1]); u[2] = Math.max(u[2], r[2]); u[3] = Math.max(u[3], r[3]);
    M.jobs.length = 1;
    return;
  }
  M.jobs.push(r);
}
/** A level's own tall static object (ring posts, masts) as a shadow caster in
 *  the map: an axis-aligned box footprint, h units tall. After buildLookMap. */
export function lookStampBox(x, z, w, d, h) {
  const M = _map;
  if (!M) return;
  const b = { x, z, w, d, h };
  _rasterH(M, b, h);
  _splatA(M, b, 1);
  const r = _rect(M, b, 14), S = M.S;
  _toBytes(M, r[0], r[1], r[2], r[3]);
  const len = Math.min(260, h / Math.max(M.tanE, 0.05)) + 8;
  const ex = -lookData[IDX.SUNH * 4] * len / M.sx, ez = -lookData[IDX.SUNH * 4 + 1] * len / M.sz;
  _queue(M, [Math.max(1, Math.floor(Math.min(r[0], r[0] + ex))), Math.max(1, Math.floor(Math.min(r[1], r[1] + ez))),
    Math.min(S - 2, Math.ceil(Math.max(r[2], r[2] + ex))), Math.min(S - 2, Math.ceil(Math.max(r[3], r[3] + ez)))]);
}
/** Free the level map (level switch / teardown). */
export function disposeLookMap() { _map = null; set4(IDX.MAPBOX, 0, 0, 0, 0); }
