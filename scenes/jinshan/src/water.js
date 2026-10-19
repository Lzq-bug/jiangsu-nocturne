import * as THREE from 'three';
import { CHIME } from './data.js';
import { MOON_DIR } from './environment.js';
import * as T from './textures.js';
import { RIVER, LAKE, POOL } from './layout.js';

export const WATER_Y = 0;
export const POOL_WATER_Y = POOL.y;
const WAVE_MAX = 8;

/**
 * 塔铃波环：一响一圈，从塔檐脚下推出去。
 * 速度按 CHIME.sustain 定，让波前在余响散尽时刚好推到江北岸。
 */
export class WaveRings {
  constructor() {
    this.items = [];
    // 与荻滩、灯串同一档推进速度，三套系统才不会各推各的
    this.speed = 30;
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
    m.customProgramCacheKey = () => 'jinshan-wobble';
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
    const CAP = 1400;
    this.mesh = new THREE.InstancedMesh(geo, this.mat, CAP);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  /** pos.y 允许是崖下塔影潭那样悬在半坡上的水面 */
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
  uniform float uTime; uniform float uRipple; uniform float uFlow;
  varying vec3 vW;
  ${WAVE_GLSL}
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vec2 p = wp.xz;
    // 江水顺流而下：把相位整体朝下游推，浪就成了一条条追人的斜纹
    p.x -= uTime * uFlow;
    float h = sin(p.x*0.13 + uTime*0.85)*0.12 + sin(p.y*0.085 - uTime*0.62)*0.14
            + sin((p.x+p.y)*0.28 + uTime*1.4)*0.05;
    wp.y += h * uRipple;
    vec2 gw;
    wp.y += chimeWave(wp.xz, gw) * 0.44;
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const WATER_FS = `
  uniform float uTime; uniform float uRipple; uniform float uFlow; uniform vec3 uMoon; uniform float uMoonPhase;
  uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
  uniform float uFrost; uniform float uStars;
  varying vec3 vW;
  ${WAVE_GLSL}
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }

  vec3 skyAt(vec3 d){
    float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.005,0.009,0.020), vec3(0.011,0.017,0.038), smoothstep(0.5,0.88,up));
    float axis = dot(normalize(vec3(-0.52,0.44,-0.73)), d);
    col += vec3(0.028,0.032,0.048) * exp(-pow(axis/0.22,2.0)) * smoothstep(0.45,0.9,up);
    float haze = pow(clamp(1.0-abs(d.y)*2.8,0.0,1.0), 2.2);
    // 江北的城市灯与东南的古城灯，倒进水里就是这两条色带
    float north = smoothstep(0.1,-0.9, d.z);
    float town  = smoothstep(-0.2,0.9, d.x) * smoothstep(-0.1,0.8, d.z);
    col += vec3(0.030,0.036,0.050) * haze + vec3(0.026,0.030,0.042) * haze * north
         + vec3(0.055,0.032,0.014) * haze * town;
    col += vec3(0.030,0.036,0.050) * pow(max(0.0, dot(d, uMoon)), 24.0);
    return mix(col, vec3(0.004,0.006,0.012), smoothstep(0.0,-0.06,d.y));
  }
  void main(){
    vec2 p = vW.xz;
    vec2 fp = p; fp.x -= uTime * uFlow;
    float t = uTime;
    float det = clamp(1.0 - length(cameraPosition - vW)/130.0, 0.0, 1.0);
    float dx = cos(fp.x*0.13 + t*0.85)*0.13*0.12 + cos((fp.x+fp.y)*0.28 + t*1.4)*0.28*0.05;
    float dz = cos(fp.y*0.085 - t*0.62)*0.085*0.14 + cos((fp.x+fp.y)*0.28 + t*1.4)*0.28*0.05;
    float c1 = sin(fp.x*1.6 + t*2.5) * sin(fp.y*1.25 - t*2.0);
    float c2 = sin(fp.x*3.0 - t*3.3 + fp.y*2.1) * 0.6;
    dx += (c1*1.6 + c2*3.0) * 0.016 * uRipple * det;
    dz += (cos(fp.x*1.25 - t*1.8)*1.25*0.9 + c2*2.1) * 0.016 * uRipple * det;
    vec2 wg; float wv = chimeWave(p, wg);
    dx += wg.x; dz += wg.y;
    // 顺流的斜纹：江面永远比湖面多一层朝下游拉的细波
    dx += uFlow * (0.55 + 0.35*sin(fp.y*2.4 - t*2.2)) * det;
    vec3 n = normalize(vec3(-dx*uRipple*0.9, 1.0, -dz*uRipple*0.9));

    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    vec3 r = reflect(-V, n);
    vec3 col = mix(uDeep, uShallow, 0.10 + 0.16*fres);
    col = mix(col, skyAt(normalize(r)) * 0.62, 0.12 + 0.42*fres);

    vec2 sc = floor(r.xz*2.2 + t*0.02);
    float st = step(0.9982, hash(sc)) * uStars;
    col += vec3(0.34,0.41,0.56) * st * pow(fres, 2.2) * 1.1;

    vec3 H = normalize(V + uMoon);
    float ndh = max(dot(n, H), 0.0);
    float lane = smoothstep(0.55,0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
    col += vec3(0.42,0.48,0.62) * pow(ndh, 420.0) * (0.5 + lane*1.5) * uMoonPhase;
    col += vec3(0.13,0.17,0.26) * pow(ndh, 120.0) * (0.05 + lane*0.22) * uMoonPhase;

    float nsh = texture2D(uNoise, fp*0.013 + vec2(t*0.02,-t*0.03)).r;
    col *= 0.95 + nsh*0.1;
    col = mix(col, col*0.88 + vec3(0.026,0.038,0.052), uFrost*(0.2 + 0.2*fres));

    col += vec3(0.26,0.33,0.46) * wv * 0.5;
    col += vec3(0.30,0.17,0.08) * wv * wv * 0.4;

    float a = clamp(0.84 + fres*0.14, 0.0, 0.96);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
  }`;

function makeWaterMat({ deep, shallow, flow, key }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uRipple: { value: 1 }, uFlow: { value: flow },
      uMoon: { value: MOON_DIR.clone() }, uMoonPhase: { value: 1 },
      uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) },
      uFrost: { value: 1 }, uStars: { value: 1 }, uNoise: { value: T.noise() },
      uWaves: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
      uWaveSpeed: { value: 30 }, uWaveFade: { value: CHIME.sustain },
    },
    vertexShader: WATER_VS, fragmentShader: WATER_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  m.customProgramCacheKey = () => `jinshan-water-${key}`;
  return m;
}

/**
 * 三段水：北面与西面的大江（顺流）、南面的金山湖（静水）、崖下的塔影潭。
 * 大江原绕山而行，金山旧在江心，清代涨沙才连南岸——所以山北的水是活的，山南的是静的。
 */
export function buildWater(scene, rings = new WaveRings()) {
  const riverMat = makeWaterMat({ deep: RIVER.deep, shallow: '#0e2130', flow: 2.6, key: 'river' });
  const lakeMat = makeWaterMat({ deep: LAKE.deep, shallow: '#0b1c2b', flow: 0.25, key: 'lake' });
  const poolMat = makeWaterMat({ deep: '#050b12', shallow: '#0c1d2a', flow: 0.0, key: 'pool' });

  const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.halfW * 2, RIVER.halfD * 2, 70, 230), riverMat);
  river.geometry.rotateX(-Math.PI / 2);
  river.position.set(RIVER.x, WATER_Y, RIVER.z);
  river.renderOrder = 3;
  river.name = 'yangtze';
  scene.add(river);

  const lake = new THREE.Mesh(new THREE.PlaneGeometry(LAKE.halfW * 2, LAKE.halfD * 2, 46, 120), lakeMat);
  lake.geometry.rotateX(-Math.PI / 2);
  lake.position.set(LAKE.x, WATER_Y, LAKE.z);
  lake.renderOrder = 3;
  lake.name = 'jinshan-lake';
  scene.add(lake);

  const pondGeo = new THREE.CircleGeometry(1, 40);
  pondGeo.rotateX(-Math.PI / 2);
  pondGeo.scale(POOL.rx, POOL.rz, 1);
  const pond = new THREE.Mesh(pondGeo, poolMat);
  pond.position.set(POOL.x, POOL_WATER_Y, POOL.z);
  pond.renderOrder = 3;
  pond.name = 'pagoda-shadow-pool';
  scene.add(pond);

  const mats = [riverMat, lakeMat, poolMat];
  return {
    mesh: river, lake, pond, rings,
    uniforms: riverMat.uniforms,
    setFrost(v) { for (const m of mats) m.uniforms.uFrost.value = v ? 1 : 0; },
    update(t, ripple) {
      for (const m of mats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uRipple.value = ripple;
        rings.fill(m.uniforms, t);
      }
    },
  };
}
