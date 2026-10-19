import * as THREE from 'three';
import { RIVER, TIDE, SEA } from './data.js';
import { MOON_DIR } from './environment.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const SEA_Y = -0.62;
const WAVE_MAX = 12;

/**
 * 潮汛波环：一汛一条，从入潮点向外扩。
 * 海面上是横推的潮头（见 uFront），河面靠这几个环把潮意传进来。
 */
export class WaveRings {
  constructor() {
    this.items = [];
    this.speed = TIDE.canalSpeed;
  }
  emit(x, z, t, amp = 1) {
    this.items.push({ x, z, t0: t, amp });
    if (this.items.length > WAVE_MAX) this.items.shift();
  }
  fill(uniforms, t) {
    const arr = uniforms.uWaves.value;
    for (let i = 0; i < WAVE_MAX; i++) {
      const w = this.items[i];
      if (!w || t - w.t0 > TIDE.sustain * 1.35) { arr[i].set(0, 0, 0, 0); continue; }
      arr[i].set(w.x, w.z, w.t0, w.amp);
    }
    uniforms.uWaveSpeed.value = this.speed;
    uniforms.uWaveFade.value = TIDE.sustain;
  }
  clear() { this.items.length = 0; }
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
      shader.vertexShader = `uniform float uTime; uniform float uRipple;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wt = uTime;
          transformed.x += (sin(transformed.y*0.32 + wt*1.7) + sin(transformed.z*0.51 - wt*1.1)) * 0.19 * uRipple;
          transformed.z += (sin(transformed.y*0.27 - wt*1.3) + sin(transformed.x*0.44 + wt*1.9)) * 0.15 * uRipple;
        `);
      // fade the mirror out as it sinks below the surface
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-30.0, -1.0, vWorldPosition.y) * 0.92 + 0.08;
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
    m.customProgramCacheKey = () => 'anfeng-wobble';
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
      // clone(true) walks the tree in the same order, so visibility can be mirrored
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
  constructor(scene, capacity = 1400) {
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
          float wob = sin(wp.z*0.42 + uTime*1.9) * 0.6 + sin(wp.x*0.63 - uTime*1.35) * 0.4;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 0.9*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.85;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.72 + 0.28*sin(uTime*2.7 + wp.x*1.7 + wp.z*2.3);
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
    this.mesh = new THREE.InstancedMesh(geo, this.mat, capacity);
    // the shader reads instanceColor, so it must exist before the program is compiled
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.waterY = WATER_Y;
  }
  /** returns an index you can later move with setPos() */
  add(pos, color, width = 1.1, depth = 9, intensity = 1) {
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
      d.position.set(it.pos.x, this.waterY - 0.12, it.pos.z);
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

/** 汛波与长涌共用的法线扰动：环状波前 + 方向潮头 */
const WAVE_GLSL = `
  uniform vec4 uWaves[${WAVE_MAX}];
  uniform float uWaveSpeed; uniform float uWaveFade;
  uniform float uFrontX;      // 潮头的 x 位置；< -9000 表示无潮
  uniform float uFrontAmp;    // 0..1，潮头强度
  float ringWave(vec2 p, out vec2 grad){
    float sum = 0.0; grad = vec2(0.0);
    for (int i = 0; i < ${WAVE_MAX}; i++) {
      float amp = uWaves[i].w;
      if (amp <= 0.0) continue;
      vec2 o = uWaves[i].xy;
      float age = uTime - uWaves[i].z;
      if (age < 0.0) continue;
      float d = length(p - o);
      float front = age * uWaveSpeed;
      float band = exp(-pow((d - front)/4.6, 2.0)) * exp(-age/uWaveFade) * exp(-d/210.0);
      float train = exp(-pow((d - front + 8.5)/8.5, 2.0)) * exp(-age/uWaveFade) * exp(-d/210.0) * 0.45;
      sum += (band + train) * amp;
      grad += normalize(p - o + vec2(0.0001)) * (band + train) * amp * 0.9;
    }
    return sum;
  }
  float frontWave(vec2 p, out vec2 grad){
    if (uFrontAmp <= 0.001 || uFrontX < -9000.0) return 0.0;
    float d = p.x - uFrontX;                       // 潮头以西为已涨
    float crest = exp(-pow(d/7.0, 2.0));           // 一道横贯南北的脊
    float bore = smoothstep(6.0, -22.0, d) * (1.0 - smoothstep(-22.0, -160.0, d));
    float s = (crest * 1.0 + bore * 0.42) * uFrontAmp * exp(-abs(p.y)*0.0016);
    grad += vec2(-1.0, 0.0) * (crest*0.05 + bore*0.012) * uFrontAmp;
    return s;
  }`;

function waterMaterial({ sea = false }) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color(sea ? '#03080f' : '#010509') },
    uShallow: { value: new THREE.Color(sea ? '#0b1a2a' : '#061120') },
    uMist: { value: 1 },
    uNoise: { value: T.noise() },
    uWaves: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
    uWaveSpeed: { value: TIDE.canalSpeed },
    uWaveFade: { value: TIDE.sustain },
    uFrontX: { value: -99999 },
    uFrontAmp: { value: 0 },
    uFogColor: { value: new THREE.Color('#0a1420') },
    uFogDensity: { value: sea ? 0.00165 : 0.0026 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW; varying float vFoam;
      ${WAVE_GLSL}
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float swell = sin(p.x*0.042 + uTime*0.55)*0.34 + sin(p.y*0.031 - uTime*0.4)*0.30;
        float chop  = sin(p.x*0.16 + uTime*0.9)*0.11 + sin(p.y*0.09 - uTime*0.65)*0.13
                    + sin((p.x+p.y)*0.31 + uTime*1.5)*0.05;
        ${sea ? 'wp.y += (swell + chop*0.5) * uRipple;' : 'wp.y += chop * uRipple;'}
        vec2 gw;
        float rings = ringWave(p, gw);
        vec2 gf; float fr = frontWave(p, gf);
        wp.y += rings * 0.42 + fr * 1.25;
        vFoam = clamp(fr*1.4 + rings*0.7, 0.0, 1.6);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform float uMist; uniform vec3 uFogColor; uniform float uFogDensity;
      varying vec3 vW; varying float vFoam;
      ${WAVE_GLSL}

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.005,0.008,0.018), vec3(0.011,0.016,0.036), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        // 东边海气冷青，西边镇与灶的火气只压在地平一线
        col += vec3(0.024,0.032,0.046) * haze * (0.4 + 0.9*smoothstep(-0.2,0.9, d.x));
        col += vec3(0.030,0.016,0.010) * haze * (0.2 + 0.8*smoothstep(-0.1,-0.9, d.x));
        col += vec3(0.032,0.036,0.050) * pow(max(0.0,dot(d,uMoon)), 24.0);
        return mix(col, vec3(0.003,0.004,0.009), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // high-frequency chop aliases into moiré seen from far up-river, so it
        // hands over to the long swells with distance
        float dist = length(cameraPosition - vW);
        float det = clamp(1.0 - dist / ${sea ? '420' : '110'}.0, 0.0, 1.0);
        float dx = ${sea ? 'cos(p.x*0.042 + t*0.55)*0.042*0.34' : 'cos(p.x*0.16 + t*0.9)*0.16*0.11'}
                 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        float dz = ${sea ? 'cos(p.y*0.031 - t*0.4)*0.031*0.30' : 'cos(p.y*0.09 - t*0.65)*0.09*0.13'}
                 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        float c1 = sin(p.x*1.7 + t*2.6) * sin(p.y*1.3 - t*2.1);
        float c2 = sin(p.x*3.1 - t*3.4 + p.y*2.2) * 0.6;
        dx += (c1*1.7 + c2*3.1) * 0.016 * uRipple * det;
        dz += (cos(p.x*1.3 - t*1.9)*1.3*0.9 + c2*2.2) * 0.016 * uRipple * det;
        vec2 wg; float wv = ringWave(p, wg);
        vec2 gf; float fr = frontWave(p, gf);
        dx += wg.x + gf.x; dz += wg.y + gf.y;
        vec3 n = normalize(vec3(-dx*uRipple*0.9, 1.0, -dz*uRipple*0.9));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.22*fres);
        col = mix(col, skyAt(normalize(r)) * 0.44, 0.12 + 0.34*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        // 月出海面：粼道又宽又长，是这一景的骨架
        float lane = smoothstep(0.45, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 260.0) * (0.7 + lane*2.1);
        col += vec3(0.15,0.19,0.29) * pow(ndh, 48.0) * (0.18 + lane*0.7);

        float sparkle = pow(max(0.0, sin(p.x*7.3 + t*3.1) * sin(p.y*6.1 - t*2.4)), 12.0);
        col += vec3(0.22,0.24,0.28) * sparkle * 0.035 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.014 + vec2(t*0.02, -t*0.03)).r;
        col *= 0.95 + nsh*0.1;

        // 夜气：一层冷膜接走最后的月光
        col = mix(col, col*0.88 + vec3(0.028,0.042,0.056), uMist * (0.2 + 0.2*fres));

        // 潮头与波环：白沫加一道被灶火扫过的暖边
        col += vec3(0.30,0.38,0.50) * wv * 0.7;
        col += vec3(0.34,0.19,0.08) * wv * wv * 0.45;
        float foam = clamp(vFoam, 0.0, 1.2);
        col = mix(col, vec3(0.72,0.80,0.88), foam * 0.55 * det);
        col += vec3(0.30,0.14,0.05) * foam * foam * 0.4;

        ${sea ? '' : `// 两岸驳岸很近，岸影压在水面上是必要的
        float edge = smoothstep(${(RIVER.halfWidth + 1).toFixed(1)}, ${(RIVER.halfWidth - 2.6).toFixed(1)}, abs(p.x));
        col *= 1.0 - edge*0.34;`}


        float fogK = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist);
        col = mix(col, uFogColor, clamp(fogK, 0.0, 0.98));

        float a = clamp(0.82 + fres*0.16, 0.0, 0.98);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
  return { mat, uni };
}

export function buildWater(scene, rings = new WaveRings()) {
  // 串场河主槽
  const canalGeo = new THREE.PlaneGeometry(RIVER.halfWidth * 2 + 6, RIVER.z1 - RIVER.z0, 52, 210);
  canalGeo.rotateX(-Math.PI / 2);
  const canal = waterMaterial({ sea: false });
  const canalMesh = new THREE.Mesh(canalGeo, canal.mat);
  canalMesh.position.set(0, WATER_Y, (RIVER.z0 + RIVER.z1) / 2);
  canalMesh.renderOrder = 3;
  canalMesh.name = 'chuanchang-water';
  scene.add(canalMesh);

  // 堤外之海：一片够大的浅水，潮头在上面横推
  const seaGeo = new THREE.PlaneGeometry(SEA.width, SEA.depth, 150, 90);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = waterMaterial({ sea: true });
  const seaMesh = new THREE.Mesh(seaGeo, sea.mat);
  seaMesh.position.set(SEA.x0 + SEA.width / 2, SEA_Y, 0);
  seaMesh.renderOrder = 2;
  seaMesh.name = 'sea';
  scene.add(seaMesh);

  let tide = { frontX: -99999, amp: 0, level: 0 };

  return {
    canal: canalMesh,
    sea: seaMesh,
    rings,
    uniforms: canal.uni,
    seaUniforms: sea.uni,
    setMist(v) { canal.uni.uMist.value = v ? 1 : 0; sea.uni.uMist.value = v ? 1 : 0; },
    setTide(state) { tide = state; },
    update(t, ripple) {
      for (const u of [canal.uni, sea.uni]) {
        u.uTime.value = t;
        u.uRipple.value = ripple;
        u.uFrontX.value = tide.frontX;
        u.uFrontAmp.value = tide.amp;
      }
      rings.fill(canal.uni, t);
      rings.fill(sea.uni, t);
      // 潮位：堤外的水随潮头爬升，漫上堤脚
      seaMesh.position.y = SEA_Y + tide.level * 1.35;
    },
  };
}
