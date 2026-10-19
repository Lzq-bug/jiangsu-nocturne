import * as THREE from 'three';
import { POND } from './data.js';
import { MOON_DIR } from './environment.js';
import * as T from './textures.js';

export const WATER_Y = 0;
const RING_MAX = 10;
/** 一响水袖点破池面，波环推出去多久化开 */
const RING_FADE = 3.4;
const OUT_N = POND.outline.length;

/**
 * 波环：每次临水点位起腔、或投壶落水，就在池面上加一圈。
 * 速度按池径与余响推出来，让最外圈刚好在化开前碰到对岸。
 */
export class PondRings {
  constructor() {
    this.items = [];
    this.speed = (POND.rx * 1.5) / RING_FADE;
  }
  emit(x, z, t, amp = 1) {
    this.items.push({ x, z, t0: t, amp });
    if (this.items.length > RING_MAX) this.items.shift();
  }
  fill(uniforms, t) {
    const arr = uniforms.uWaves.value;
    for (let i = 0; i < RING_MAX; i++) {
      const w = this.items[i];
      if (!w || t - w.t0 > RING_FADE * 1.3) { arr[i].set(0, 0, 0, 0); continue; }
      arr[i].set(w.x, w.z, w.t0, w.amp);
    }
    uniforms.uWaveSpeed.value = this.speed;
    uniforms.uWaveFade.value = RING_FADE;
  }
}

/** 岸边轮廓的系数表：水面在像素级按同一条池岸裁边 */
const OUTLINE_GLSL = `
  uniform float uK[${OUT_N}];
  float outlineAt(float a){
    float f = mod(a, 6.2831853) / 6.2831853 * (${(OUT_N - 1).toFixed(1)});
    float k = 0.0;
    for (int i = 0; i < ${OUT_N}; i++) {
      k += uK[i] * max(0.0, 1.0 - abs(f - float(i)));
    }
    return k;
  }`;

function outlineTable() {
  return POND.outline.map(([, k]) => k);
}

/** 水面：一片被池岸裁掉的网格 + 一条槃涧窄带，共用同一套着色 */
function waterMaterial(trim) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#04080f') },
    uShallow: { value: new THREE.Color('#0a1622') },
    uNoise: { value: T.noise() },
    uTrim: { value: trim ? 1 : 0 },
    uRx: { value: POND.rx },
    uRz: { value: POND.rz },
    uK: { value: outlineTable() },
    uWaves: { value: Array.from({ length: RING_MAX }, () => new THREE.Vector4()) },
    uWaveSpeed: { value: 6 },
    uWaveFade: { value: RING_FADE },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      uniform vec4 uWaves[${RING_MAX}];
      uniform float uWaveSpeed; uniform float uWaveFade;
      varying vec3 vW; varying float vRing;

      float ringWave(vec2 p, out vec2 grad){
        float sum = 0.0; grad = vec2(0.0);
        for (int i = 0; i < ${RING_MAX}; i++) {
          float amp = uWaves[i].w;
          if (amp <= 0.0) continue;
          vec2 o = uWaves[i].xy;
          float age = uTime - uWaves[i].z;
          if (age < 0.0) continue;
          float d = length(p - o);
          float front = age * uWaveSpeed;
          float band = exp(-pow((d - front)/1.5, 2.0)) * exp(-age/uWaveFade) * exp(-d/26.0);
          float train = exp(-pow((d - front + 2.6)/2.2, 2.0)) * exp(-age/uWaveFade) * exp(-d/26.0) * 0.5;
          sum += (band + train) * amp;
          grad += normalize(p - o + vec2(0.0001)) * (band + train) * amp * 0.8;
        }
        return sum;
      }
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        // 静水：只有两三重长涌与一层细风皱，池小，容不下河的那种流势
        float h = sin(p.x*0.42 + uTime*0.7)*0.045 + sin(p.y*0.55 - uTime*0.5)*0.05
                + sin((p.x*0.7+p.y*0.9)*0.5 + uTime*1.2)*0.02;
        wp.y += h * uRipple;
        vec2 gw;
        float rv = ringWave(p, gw);
        wp.y += rv * 0.22;
        vRing = rv;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform float uTrim; uniform float uRx; uniform float uRz;
      uniform vec4 uWaves[${RING_MAX}];
      uniform float uWaveSpeed; uniform float uWaveFade;
      ${OUTLINE_GLSL}
      varying vec3 vW; varying float vRing;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.010,0.022), vec3(0.014,0.020,0.042), smoothstep(0.5,0.88,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        col += vec3(0.030,0.022,0.014) * haze;
        col += vec3(0.034,0.038,0.052) * pow(max(0.0,dot(d,uMoon)), 24.0);
        return mix(col, vec3(0.004,0.006,0.012), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        if (uTrim > 0.5) {
          float a = atan(p.x/uRx, p.y/uRz);
          float r = length(vec2(p.x/uRx, p.y/uRz));
          if (r > outlineAt(a)) discard;
        }
        float det = clamp(1.0 - length(cameraPosition - vW) / 60.0, 0.0, 1.0);
        float dx = cos(p.x*0.42 + t*0.7)*0.42*0.045 + cos((p.x*0.7+p.y*0.9)*0.5 + t*1.2)*0.35*0.02;
        float dz = cos(p.y*0.55 - t*0.5)*0.55*0.05 + cos((p.x*0.7+p.y*0.9)*0.5 + t*1.2)*0.45*0.02;
        float c1 = sin(p.x*2.4 + t*2.2) * sin(p.y*2.1 - t*1.8);
        float c2 = sin(p.x*4.3 - t*2.8 + p.y*3.1) * 0.6;
        dx += (c1*2.4 + c2*4.3) * 0.008 * uRipple * det;
        dz += (cos(p.y*2.2 - t*1.7)*2.2*0.9 + c2*3.1) * 0.008 * uRipple * det;
        vec2 gw;
        float rv = 0.0;
        for (int i = 0; i < ${RING_MAX}; i++) {
          float amp = uWaves[i].w;
          if (amp <= 0.0) continue;
          vec2 o = uWaves[i].xy;
          float age = uTime - uWaves[i].z;
          if (age < 0.0) continue;
          float d = length(p - o);
          float front = age * uWaveSpeed;
          float band = exp(-pow((d - front)/1.5, 2.0)) * exp(-age/uWaveFade) * exp(-d/26.0);
          rv += band * amp;
          gw += normalize(p - o + vec2(0.0001)) * band * amp * 0.8;
        }
        dx += gw.x; dz += gw.y;
        vec3 n = normalize(vec3(-dx*uRipple*1.6, 1.0, -dz*uRipple*1.6));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.1 + 0.3*fres);
        col = mix(col, skyAt(normalize(r)) * 0.5, 0.16 + 0.46*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        float lane = smoothstep(0.5, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 220.0) * (0.5 + lane*1.05);
        col += vec3(0.14,0.18,0.28) * pow(ndh, 44.0) * (0.16 + lane*0.4);

        float sparkle = pow(max(0.0, sin(p.x*9.1 + t*2.4) * sin(p.y*8.3 - t*1.9)), 14.0);
        col += vec3(0.24,0.26,0.30) * sparkle * 0.03 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.05 + vec2(t*0.012, -t*0.016)).r;
        col *= 0.96 + nsh*0.08;

        // 波环读成一道苍白的水线，扫过灯光时染上暖色
        col += vec3(0.32,0.40,0.52) * rv * 0.8;
        col += vec3(0.34,0.20,0.09) * rv * rv * 0.5;

        // 池小，岸在几米之外：影子压出一圈暗边，水面才不显成一块方玻璃
        float shore = uTrim > 0.5 ? smoothstep(0.58, 1.0, length(vec2(p.x/uRx, p.y/uRz))) : 0.0;
        col *= 1.0 - shore*0.42;

        float a = clamp(0.62 + fres*0.3, 0.0, 0.9);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
  return mat;
}

/** shared wobble injected into any mirrored material */
class Wobble {
  constructor() {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.62);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: src.map || null, transparent: true, opacity: 0.52,
      depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.NormalBlending,
    });
    m.toneMapped = false;
    const wobble = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wobble.time;
      shader.uniforms.uRipple = wobble.ripple;
      shader.vertexShader = `uniform float uTime; uniform float uRipple;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wt = uTime;
          transformed.x += (sin(transformed.y*0.55 + wt*1.4) + sin(transformed.z*0.82 - wt*1.0)) * 0.075 * uRipple;
          transformed.z += (sin(transformed.y*0.48 - wt*1.1) + sin(transformed.x*0.74 + wt*1.6)) * 0.06 * uRipple;
        `);
      // 倒影越往下越化开
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-19.0, -0.6, vWorldPosition.y) * 0.9 + 0.1;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        varying vec3 vWorldPosition;
        #include <common>`);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        varying vec3 vWorldPosition;
        #include <common>`);
    };
    m.customProgramCacheKey = () => 'wangshi-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/** mirrored copy of a source group, sitting under the water plane */
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
      } else {
        clone.visible = src.visible;
      }
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

/** additive light columns dragged down the water under every lamp */
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
          float wob = sin(wp.z*0.85 + uTime*1.7) * 0.5 + sin(wp.x*1.2 - uTime*1.2) * 0.35;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 0.9*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.5;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.74 + 0.26*sin(uTime*2.4 + wp.x*2.7 + wp.z*3.1);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.1, vUv.y);
          float a = m * fade * vFlick * uStrength;
          gl_FragColor = vec4(vCol * uDepth, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 700);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  /** returns an index you can later move with setPos() */
  add(pos, color, width = 0.8, depth = 5, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, baseWidth: width, baseDepth: depth, on: true,
    });
    this.dirty = true;
    return i;
  }
  setPos(i, pos) {
    if (i < 0 || !this.items[i]) return;
    this.items[i].pos.copy(pos);
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
      d.position.set(it.pos.x, WATER_Y - 0.06, it.pos.z);
      d.scale.set(it.on ? it.width : 0, it.on ? it.depth : 0, 1);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, it.color);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
  update(t, ripple, strength) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uRipple.value = ripple;
    this.mat.uniforms.uStrength.value = strength;
    if (this.dirty) this.flush();
  }
}

/** 槃涧：池东南引出的一条窄水带，引静桥就跨在它上面 */
function creekGeometry() {
  const pts = POND.creek;
  const pos = [], uv = [], idx = [];
  const wHalf = [0.85, 0.62, 0.44, 0.3];
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    const px = -dz / l, pz = dx / l;
    const hw = wHalf[i];
    pos.push(x + px * hw, WATER_Y, z + pz * hw, x - px * hw, WATER_Y, z - pz * hw);
    uv.push(0, i / (pts.length - 1), 1, i / (pts.length - 1));
    n += 2;
  }
  // 涧要有一点起伏才不像一条贴纸
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < pts.length - 1; j++) {
      const a = i * 2 + j * 2, b = a + 2, c = a + 1, d = c + 2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  void n;
  return g;
}

export function buildWater(scene, rings = new PondRings()) {
  const pondGeo = new THREE.PlaneGeometry(POND.rx * 2.3, POND.rz * 2.3, 76, 58);
  pondGeo.rotateX(-Math.PI / 2);
  const pondMat = waterMaterial(true);
  const pond = new THREE.Mesh(pondGeo, pondMat);
  pond.position.y = WATER_Y;
  pond.renderOrder = 3;
  pond.name = 'caixia-pond';
  scene.add(pond);

  const creek = new THREE.Mesh(creekGeometry(), waterMaterial(false));
  creek.renderOrder = 3;
  creek.name = 'pan-jian';
  scene.add(creek);

  const uni = pondMat.uniforms;
  const cuni = creek.material.uniforms;
  // 两处各留一份 uWaves 数组，环要同时在两边起
  cuni.uWaves = uni.uWaves;
  cuni.uWaveSpeed = uni.uWaveSpeed;
  cuni.uWaveFade = uni.uWaveFade;
  cuni.uTime = uni.uTime;
  cuni.uRipple = uni.uRipple;

  return {
    mesh: pond,
    creek,
    rings,
    uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
      rings.fill(uni, t);
    },
  };
}

