import * as THREE from 'three';
import { CHIME } from './data.js';
import { MOON_DIR } from './environment.js';
import * as T from './textures.js';
import { LAKE, SWAN } from './layout.js';

export const WATER_Y = 0;
export const SWAN_WATER_Y = SWAN.y;
const WAVE_MAX = 8;

/**
 * 花信波环：一响一圈，从铃架脚下推出去。
 * 速度按 CHIME.sustain 定，让波前在余响散尽时刚好到湖边。
 */
export class WaveRings {
  constructor() {
    this.items = [];
    this.speed = (LAKE.halfW * 1.1) / CHIME.sustain;
  }
  emit(x, z, t, amp = 1) {
    this.items.push({ x, z, t0: t, amp });
    if (this.items.length > WAVE_MAX) this.items.shift();
  }
  fill(uniforms, t) {
    const arr = uniforms.uWaves.value;
    for (let i = 0; i < WAVE_MAX; i++) {
      const w = this.items[i];
      if (!w || t - w.t0 > CHIME.sustain * 1.35) { arr[i].set(0, 0, 0, 0); continue; }
      arr[i].set(w.x, w.z, w.t0, w.amp);
    }
    uniforms.uWaveSpeed.value = this.speed;
    uniforms.uWaveFade.value = CHIME.sustain;
  }
}

/** 镜像材质共用的抖动 */
class Wobble {
  constructor() {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.3);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: src.map || null, transparent: true, opacity: 0.3,
      depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.NormalBlending,
    });
    m.toneMapped = false;
    const wobble = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wobble.time;
      shader.uniforms.uRipple = wobble.ripple;
      shader.vertexShader = 'uniform float uTime; uniform float uRipple;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.x += (sin(transformed.y*0.32 + uTime*1.7) + sin(transformed.z*0.51 - uTime*1.1)) * 0.19 * uRipple;
          transformed.z += (sin(transformed.y*0.27 - uTime*1.3) + sin(transformed.x*0.44 + uTime*1.9)) * 0.15 * uRipple;
        `)
          .replace('#include <common>', 'varying vec3 vWorldPosition;\n#include <common>')
          .replace('#include <worldpos_vertex>', `
            #include <worldpos_vertex>
            vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying vec3 vWorldPosition;\n#include <common>')
        .replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          gl_FragColor.a *= smoothstep(-30.0, -1.0, vWorldPosition.y) * 0.92 + 0.08;
        `);
    };
    m.customProgramCacheKey = () => 'santai-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/** 把一整组构筑物倒扣到水面下，当成倒影 */
export class Reflections {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'reflections';
    this.wobble = new Wobble();
    this.mirror = new THREE.Group();
    this.mirror.scale.set(1, -1, 1);
    this.mirror.position.y = 2 * WATER_Y;
    this.root.add(this.mirror);
    scene.add(this.root);
    this.pairs = [];
  }
  add(source) {
    const clone = source.clone(true);
    clone.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      o.castShadow = o.receiveShadow = false;
      if (o.isMesh) o.material = this.wobble.material(o.material);
    });
    this.mirror.add(clone);
    this.pairs.push([source, clone]);
    return clone;
  }
  sync() {
    for (const [src, clone] of this.pairs) {
      clone.position.copy(src.position);
      clone.rotation.copy(src.rotation);
      clone.scale.copy(src.scale);
      if (src.children.length) {
        const a = []; const b = [];
        src.traverse((o) => a.push(o));
        clone.traverse((o) => b.push(o));
        for (let i = 0; i < Math.min(a.length, b.length); i++) b[i].visible = a[i].visible;
      } else clone.visible = src.visible;
    }
  }
  set enabled(v) { this.root.visible = v; }
  get enabled() { return this.root.visible; }
  update(t, ripple) {
    this.wobble.time.value = t;
    this.wobble.ripple.value = ripple;
    this.sync();
  }
}

/** 灯在水面上拖下来的一道光柱 */
export class LightColumns {
  constructor(scene) {
    this.items = [];
    this.dirty = true;
    const geo = new THREE.PlaneGeometry(1, 1);
    const map = T.columnFade();
    map.flipY = false;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uRipple: { value: 1 }, uMap: { value: map },
        uStrength: { value: 1 }, uDepth: { value: 1 },
      },
      vertexShader: `
        uniform float uTime; uniform float uRipple;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float wob = sin(wp.z*0.42 + uTime*1.9)*0.6 + sin(wp.x*0.63 - uTime*1.35)*0.4;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right*((uv.x-0.5)*sx*(0.42 + 0.9*t))
                             + vec3(0.0,1.0,0.0)*(-uv.y*sy)
                             + right*wob*uRipple*t*0.85;
          vUv = uv; vCol = instanceColor;
          vFlick = 0.72 + 0.28*sin(uTime*2.7 + wp.x*1.7 + wp.z*2.3);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          gl_FragColor = vec4(vCol*uDepth, m*smoothstep(1.0,0.1,vUv.y)*vFlick*uStrength);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 1400);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  /** pos.y 允许是天鹅湖那样悬在坡上的水面 */
  add(pos, color, width = 1.1, depth = 9, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(), y: pos.y, color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, on: true,
    });
    this.dirty = true;
    return i;
  }
  setPos(i, pos) {
    if (i < 0 || !this.items[i]) return;
    this.items[i].pos.copy(pos);
    this.items[i].y = pos.y;
    this.dirty = true;
  }
  setOn(i, on) {
    if (i < 0 || !this.items[i] || this.items[i].on === on) return;
    this.items[i].on = on;
    this.dirty = true;
  }
  flush() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, it.y - 0.12, it.pos.z);
      d.scale.set(it.on ? it.width : 0, it.on ? it.depth : 0, 1);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, it.color);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
  update(t, ripple, strength) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uRipple.value = ripple;
    this.mat.uniforms.uStrength.value = strength;
    if (this.dirty) this.flush();
  }
}

const WAVE_GLSL = `
  uniform vec4 uWaves[${WAVE_MAX}];
  uniform float uWaveSpeed; uniform float uWaveFade;
  float chimeWave(vec2 p, out vec2 grad){
    float sum = 0.0; grad = vec2(0.0);
    for (int i = 0; i < ${WAVE_MAX}; i++) {
      float amp = uWaves[i].w;
      if (amp <= 0.0) continue;
      vec2 o = uWaves[i].xy;
      float age = uTime - uWaves[i].z;
      if (age < 0.0) continue;
      float d = length(p - o);
      float front = age * uWaveSpeed;
      float band = exp(-pow((d - front)/4.4, 2.0)) * exp(-age/uWaveFade) * exp(-d/260.0);
      float train = exp(-pow((d - front + 8.0)/8.0, 2.0)) * exp(-age/uWaveFade) * exp(-d/260.0) * 0.42;
      sum += (band + train) * amp;
      if (sum > 1.6) break;
      grad += normalize(p - o + vec2(0.0001)) * (band + train) * amp * 0.9;
    }
    return sum;
  }`;

const WATER_VS = `
  uniform float uTime; uniform float uRipple;
  varying vec3 vW;
  ${WAVE_GLSL}
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vec2 p = wp.xz;
    float h = sin(p.x*0.13 + uTime*0.85)*0.12 + sin(p.y*0.085 - uTime*0.62)*0.14
            + sin((p.x+p.y)*0.28 + uTime*1.4)*0.05;
    wp.y += h * uRipple;
    vec2 gw;
    wp.y += chimeWave(p, gw) * 0.44;
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const WATER_FS = `
  uniform float uTime; uniform float uRipple; uniform vec3 uMoon; uniform float uMoonPhase;
  uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
  uniform float uFrost; uniform float uStars;
  varying vec3 vW;
  ${WAVE_GLSL}
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }

  vec3 skyAt(vec3 d){
    float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.006,0.010,0.022), vec3(0.012,0.018,0.040), smoothstep(0.5,0.88,up));
    // 银河倒过来也在水面上留一条灰带
    float axis = dot(normalize(vec3(0.58,0.40,-0.71)), d);
    col += vec3(0.030,0.034,0.050) * exp(-pow(axis/0.22,2.0)) * smoothstep(0.45,0.9,up);
    float haze = pow(clamp(1.0-abs(d.y)*2.8,0.0,1.0), 2.2);
    col += vec3(0.040,0.034,0.026) * haze;
    col += vec3(0.030,0.036,0.050) * pow(max(0.0, dot(d, uMoon)), 24.0);
    return mix(col, vec3(0.004,0.006,0.012), smoothstep(0.0,-0.06,d.y));
  }
  void main(){
    vec2 p = vW.xz;
    float t = uTime;
    float det = clamp(1.0 - length(cameraPosition - vW)/130.0, 0.0, 1.0);
    float dx = cos(p.x*0.13 + t*0.85)*0.13*0.12 + cos((p.x+p.y)*0.28 + t*1.4)*0.28*0.05;
    float dz = cos(p.y*0.085 - t*0.62)*0.085*0.14 + cos((p.x+p.y)*0.28 + t*1.4)*0.28*0.05;
    float c1 = sin(p.x*1.6 + t*2.5) * sin(p.y*1.25 - t*2.0);
    float c2 = sin(p.x*3.0 - t*3.3 + p.y*2.1) * 0.6;
    dx += (c1*1.6 + c2*3.0) * 0.016 * uRipple * det;
    dz += (cos(p.x*1.25 - t*1.8)*1.25*0.9 + c2*2.1) * 0.016 * uRipple * det;
    vec2 wg; float wv = chimeWave(p, wg);
    dx += wg.x; dz += wg.y;
    vec3 n = normalize(vec3(-dx*uRipple*0.9, 1.0, -dz*uRipple*0.9));

    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    vec3 r = reflect(-V, n);
    vec3 col = mix(uDeep, uShallow, 0.10 + 0.16*fres);
    col = mix(col, skyAt(normalize(r)) * 0.62, 0.12 + 0.42*fres);

    // 星子落在水面上：只在掠射角、且密度很低
    vec2 sc = floor(r.xz*2.2 + t*0.02);
    float st = step(0.9982, hash(sc)) * uStars;
    col += vec3(0.34,0.41,0.56) * st * pow(fres, 2.2) * 1.1;

    vec3 H = normalize(V + uMoon);
    float ndh = max(dot(n, H), 0.0);
    float lane = smoothstep(0.55,0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
    col += vec3(0.42,0.48,0.62) * pow(ndh, 420.0) * (0.5 + lane*1.5) * uMoonPhase;
    col += vec3(0.13,0.17,0.26) * pow(ndh, 120.0) * (0.05 + lane*0.22) * uMoonPhase;

    float nsh = texture2D(uNoise, p*0.013 + vec2(t*0.02,-t*0.03)).r;
    col *= 0.95 + nsh*0.1;
    col = mix(col, col*0.88 + vec3(0.026,0.038,0.052), uFrost*(0.2 + 0.2*fres));

    // 波环过处：冷色浪脊加一道暖边
    col += vec3(0.26,0.33,0.46) * wv * 0.5;
    col += vec3(0.30,0.17,0.08) * wv * wv * 0.4;

    float a = clamp(0.84 + fres*0.14, 0.0, 0.96);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
  }`;

const mat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uRipple: { value: 1 }, uMoon: { value: MOON_DIR.clone() },
    uMoonPhase: { value: 1 },
    uDeep: { value: new THREE.Color(LAKE.deep) }, uShallow: { value: new THREE.Color('#0b1c31') },
    uFrost: { value: 1 }, uStars: { value: 1 }, uNoise: { value: T.noise() },
    uWaves: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
    uWaveSpeed: { value: 30 }, uWaveFade: { value: CHIME.sustain },
  },
  vertexShader: WATER_VS, fragmentShader: WATER_FS,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
mat.customProgramCacheKey = () => 'santai-water';

/** 镜湖与骆马湖连成一片，天鹅湖另用同一套 uniform 做一方小水面 */
export function buildWater(scene, rings = new WaveRings()) {
  const geo = new THREE.PlaneGeometry(LAKE.halfW * 2, LAKE.halfD * 2, 60, 200);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, WATER_Y, LAKE.z);
  mesh.renderOrder = 3;
  mesh.name = 'luoma-lake';
  scene.add(mesh);

  const pondGeo = new THREE.CircleGeometry(1, 40);
  pondGeo.rotateX(-Math.PI / 2);
  pondGeo.scale(SWAN.rx, SWAN.rz, 1);
  const pond = new THREE.Mesh(pondGeo, mat);
  pond.position.set(SWAN.x, SWAN_WATER_Y, SWAN.z);
  pond.renderOrder = 3;
  pond.name = 'swan-pond';
  scene.add(pond);

  return {
    mesh, pond, rings, uniforms: mat.uniforms,
    setFrost(v) { mat.uniforms.uFrost.value = v ? 1 : 0; },
    update(t, ripple) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uRipple.value = ripple;
      rings.fill(mat.uniforms, t);
    },
  };
}
