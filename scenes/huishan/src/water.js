import * as THREE from 'three';
import * as T from './textures.js';
import { CREEK, SPRING, GARDEN, TEMPLE, CANAL } from './data.js';

/** 每一片水都有自己的面高：浜、锦汇漪、三池、金莲池、运河 */
export const BODIES = {
  creek: { y: CREEK.waterY, kind: 'river' },
  pond: { cx: GARDEN.pond.cx, cz: GARDEN.pond.cz, hw: GARDEN.pond.hw, hd: GARDEN.pond.hd, y: GARDEN.pond.y, kind: 'pond' },
  pondArm: { cx: GARDEN.pondArm.cx, cz: GARDEN.pondArm.cz, hw: GARDEN.pondArm.hw, hd: GARDEN.pondArm.hd, y: GARDEN.pondArm.y, kind: 'pond' },
  upper: { cx: SPRING.upper.cx, cz: SPRING.upper.cz, r: SPRING.upper.octagon, y: SPRING.upper.y, octagon: true, kind: 'pool' },
  middle: { cx: SPRING.middle.cx, cz: SPRING.middle.cz, hw: SPRING.middle.hw, hd: SPRING.middle.hd, y: SPRING.middle.y, kind: 'pool' },
  lower: { cx: SPRING.lower.cx, cz: SPRING.lower.cz, hw: SPRING.lower.hw, hd: SPRING.lower.hd, y: SPRING.lower.y, kind: 'pool' },
  lotus: { cx: TEMPLE.axisX, cz: TEMPLE.lotus.z, hw: TEMPLE.lotus.hw, hd: TEMPLE.lotus.hd, y: TEMPLE.lotus.y, kind: 'pool' },
  canal: { ...CANAL.band, kind: 'far' },
};

/* ------------------------------------------------------------------ 倒影 */
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
      depthWrite: false, side: THREE.DoubleSide, fog: true,
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
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-22.0, -0.6, vWorldPosition.y) * 0.92 + 0.08;
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
    m.customProgramCacheKey = () => 'huishan-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/** 一个镜面根：所有倒影都关于某一片水的面高翻下去 */
export class Reflections {
  constructor(scene, waterY) {
    this.waterY = waterY;
    this.root = new THREE.Group();
    this.wobble = new Wobble();
    this.mirror = new THREE.Group();
    this.mirror.scale.set(1, -1, 1);
    this.mirror.position.y = 2 * waterY;
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

/* ------------------------------------------------------------------ 光柱 */
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
        uStrength: { value: 1 },
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
        uniform sampler2D uMap; uniform float uStrength;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.1, vUv.y);
          gl_FragColor = vec4(vCol, m * fade * vFlick * uStrength);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  /** level 让同一片光柱能落在不同高程的水面上 */
  add(pos, color, width = 1.1, depth = 9, intensity = 1, level = 0) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, level, on: true,
    });
    this.dirty = true;
    return this.items.length - 1;
  }
  setOn(i, on) {
    if (i < 0 || !this.items[i] || this.items[i].on === on) return;
    this.items[i].on = on;
    this.dirty = true;
  }
  flush() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, it.level - 0.1, it.pos.z);
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

/* ------------------------------------------------------------------ 水面 */
const waveUniforms = {
  uTime: { value: 0 },
  uRipple: { value: 1 },
  uMoon: { value: new THREE.Vector3(0.42, 0.44, 0.8).normalize() },
  uNoise: { value: T.noise() },
};

function waterMaterial({ deep = '#01040a', shallow = '#061121', lane = 1, sparkle = 1 }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: waveUniforms.uTime,
      uRipple: waveUniforms.uRipple,
      uMoon: waveUniforms.uMoon,
      uNoise: waveUniforms.uNoise,
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uLane: { value: lane },
      uSparkle: { value: sparkle },
    },
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.16 + uTime*0.9)*0.11 + sin(p.y*0.09 - uTime*0.65)*0.13
                + sin((p.x+p.y)*0.31 + uTime*1.5)*0.05;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform float uLane; uniform float uSparkle;
      varying vec3 vW; varying vec2 vUv;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.009,0.020), vec3(0.013,0.018,0.040), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        float warm = smoothstep(-0.3,0.9, d.x*0.55 + d.z*0.75);
        col += vec3(0.030,0.014,0.005) * haze * (0.3 + 1.0*warm);
        col += vec3(0.022,0.026,0.040) * pow(max(0.0,dot(d,uMoon)), 30.0);
        return mix(col, vec3(0.003,0.004,0.008), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // 远距离把高频抖动让给长波，不然鸟瞰时会满屏摩尔
        float det = clamp(1.0 - length(cameraPosition - vW) / 120.0, 0.0, 1.0);
        float dx = cos(p.x*0.16 + t*0.9)*0.16*0.11 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        float dz = cos(p.y*0.09 - t*0.65)*0.09*0.13 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        float c1 = sin(p.x*1.7 + t*2.6) * sin(p.y*1.3 - t*2.1);
        float c2 = sin(p.x*3.1 - t*3.4 + p.y*2.2) * 0.6;
        dx += (c1*1.7 + c2*3.1) * 0.016 * uRipple * det;
        dz += (cos(p.x*1.3 - t*1.9)*1.3*0.9 + c2*2.2) * 0.016 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple*0.9, 1.0, -dz*uRipple*0.9));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.22*fres);
        col = mix(col, skyAt(normalize(r)) * 0.42, 0.12 + 0.34*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        float lane = smoothstep(0.5, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 420.0) * (0.4 + lane*1.6*uLane);
        col += vec3(0.15,0.19,0.29) * pow(ndh, 60.0) * (0.1 + lane*0.5*uLane);

        float sp = pow(max(0.0, sin(p.x*7.3 + t*3.1) * sin(p.y*6.1 - t*2.4)), 12.0);
        col += vec3(0.22,0.24,0.28) * sp * 0.035 * uRipple * det * det * uSparkle;

        float nsh = texture2D(uNoise, p*0.014 + vec2(t*0.02, -t*0.03)).r;
        col *= 0.95 + nsh*0.1;

        // 贴岸一段发暗，水面才像被两岸夹住
        float bank = min(vUv.x, 1.0 - vUv.x);
        col *= 0.82 + 0.18 * smoothstep(0.0, 0.11, bank);

        float a = clamp(0.82 + fres*0.14, 0.0, 0.96);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
}

/** 池面：矩形或八角；细分够密才让顶点波动看得出来 */
export function buildWaterPlane(scene, body, opts = {}) {
  let geo;
  if (body.octagon) {
    // 上池是八角泉源：CircleGeometry 的 8 段正好是八角形，UV 从中心放射
    geo = new THREE.CircleGeometry(body.r, 8, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
  } else if (body.kind === 'pond' || body.kind === 'pool') {
    // 池岸的湖石是沿椭圆撒的，水面也做成椭圆才对得拢；矩形会在四角露出来
    geo = new THREE.CircleGeometry(1, 44);
    geo.rotateX(-Math.PI / 2);
    geo.scale(body.hw, 1, body.hd);
  } else {
    const segX = Math.max(6, Math.round(body.hw / 2.2));
    const segZ = Math.max(10, Math.round(body.hd / 2.6));
    geo = new THREE.PlaneGeometry(body.hw * 2, body.hd * 2, segX, segZ);
    geo.rotateX(-Math.PI / 2);
  }
  const mesh = new THREE.Mesh(geo, waterMaterial(opts));
  mesh.position.set(body.cx, body.y, body.cz);
  mesh.renderOrder = 3;
  scene.add(mesh);
  return mesh;
}

/** 浜面沿 xAt(z) 弯，所以单独用一张条带网格，不用矩形 */
function buildCreekMesh(scene) {
  const zs = [], xs = [];
  const N = 132;
  for (let i = 0; i <= N; i++) {
    const z = CREEK.zFrom + ((CREEK.zTo - CREEK.zFrom) * i) / N;
    zs.push(z);
    xs.push({ c: CREEK.xAt(z), w: CREEK.halfAt(z) + 0.9 });
  }
  const pos = [], uv = [], idx = [];
  const rows = 3; // 浜只有五六米宽，三条线就够弯了
  for (let i = 0; i <= N; i++) {
    const { c, w } = xs[i];
    for (let k = 0; k < rows; k++) {
      const t = -1 + (2 * k) / (rows - 1);
      pos.push(c + t * w, CREEK.waterY, zs[i]);
      uv.push(k / (rows - 1), i / N);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < rows - 1; k++) {
      const a = i * rows + k, b = a + 1, c2 = a + rows, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, waterMaterial({ lane: 1.15 }));
  mesh.renderOrder = 3;
  mesh.name = 'creek-water';
  scene.add(mesh);
  return mesh;
}

export function buildWater(scene) {
  const meshes = [
    buildCreekMesh(scene),
    buildWaterPlane(scene, BODIES.pond, { deep: '#02060c', shallow: '#08172a', lane: 0.6 }),
    buildWaterPlane(scene, BODIES.pondArm, { deep: '#02060c', shallow: '#08172a', lane: 0.6 }),
    buildWaterPlane(scene, BODIES.upper, { deep: '#020810', shallow: '#0a1a2c', lane: 0.85 }),
    buildWaterPlane(scene, BODIES.middle, { deep: '#01060c', shallow: '#0b1c30', lane: 0.7 }),
    buildWaterPlane(scene, BODIES.lower, { deep: '#01060c', shallow: '#0b1c30', lane: 0.75 }),
    buildWaterPlane(scene, BODIES.lotus, { deep: '#02070d', shallow: '#0a1626', lane: 0.5 }),
    buildWaterPlane(scene, BODIES.canal, { deep: '#01040a', shallow: '#050f1c', lane: 0.9 }),
  ];
  return {
    meshes,
    bodies: BODIES,
    update(t, ripple) {
      waveUniforms.uTime.value = t;
      waveUniforms.uRipple.value = ripple;
    },
  };
}
