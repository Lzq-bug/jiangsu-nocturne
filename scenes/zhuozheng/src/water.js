import * as THREE from 'three';
import { PONDS, ISLANDS, SITE, pondOutline } from './data.js';
import { MOON_DIR } from './environment.js';
import { M, rand, rr, rgb } from './kit.js';
import * as T from './textures.js';

export const WATER_Y = 0;
const RING_MAX = 28;

/** 水面多边形：从塘心扇出一圈环，环上的顶点带 aRadial 供着色器算贴岸变暗 */
function waterGeometry(def) {
  const pts = pondOutline(def);
  const [cx, cz] = def._center;
  const rings = [0, 0.45, 0.76, 1];
  const pos = [], radial = [], idx = [], n = pts.length;
  rings.forEach((rk, ri_) => {
    for (let i = 0; i < n; i++) {
      const [px, pz] = pts[i];
      pos.push(cx + (px - cx) * rk, 0, cz + (pz - cz) * rk);
      radial.push(ri_ / (rings.length - 1));
    }
  });
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i, d = (r + 1) * n + ((i + 1) % n);
      if (r === 0) { idx.push(a, d, b); continue; }
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRadial', new THREE.Float32BufferAttribute(radial, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 塘底：从岸线往下收两级，形成一个能盛水的碗 */
function basinGeometry(def) {
  const pts = pondOutline(def);
  const [cx, cz] = def._center;
  const depth = def.depth;
  const levels = [[1, SITE.groundY - 0.05], [0.9, -depth * 0.34], [0.62, -depth]];
  const pos = [], idx = [], n = pts.length;
  levels.forEach(([k, y]) => {
    for (let i = 0; i < n; i++) {
      const [px, pz] = pts[i];
      pos.push(cx + (px - cx) * k, y, cz + (pz - cz) * k);
    }
  });
  for (let r = 0; r < levels.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i, d = (r + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  // 底面封住
  for (let i = 1; i < n - 1; i++) {
    idx.push((levels.length - 1) * n, (levels.length - 1) * n + i, (levels.length - 1) * n + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------------- ground plane */

export function buildGround(scene) {
  const group = new THREE.Group();
  group.name = 'ground';
  const { minX, maxX, minZ, maxZ } = SITE;
  const shape = new THREE.Shape();
  shape.moveTo(minX, minZ); shape.lineTo(maxX, minZ);
  shape.lineTo(maxX, maxZ); shape.lineTo(minX, maxZ); shape.closePath();
  for (const def of PONDS) {
    const pts = pondOutline(def);
    const hole = new THREE.Path();
    hole.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) hole.lineTo(pts[i][0], pts[i][1]);
    hole.closePath();
    shape.holes.push(hole);
  }
  // ShapeGeometry 铺在 XZ：先按 XY 建，再躺平
  const geo = new THREE.ShapeGeometry(shape, 4);
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: rgb('#4a5340'), map: T.cobble(), roughness: 0.96,
    emissive: rgb('#0d1210'), emissiveIntensity: 0.5,
  }));
  ground.position.y = SITE.groundY;
  ground.receiveShadow = true;
  group.add(ground);

  // 草皮与铺装：几块椭圆草坪抬在路面上，夜里只显出色温差
  const lawns = [
    [72, 56, 11, 7], [52, 46, 9, 6], [8, 40, 14, 7], [-26, 34, 12, 6],
    [-58, 34, 11, 6], [-86, 26, 10, 6], [-96, -18, 12, 8], [40, 8, 8, 10],
    [-10, 36, 10, 5], [-46, -30, 14, 8],
  ];
  const lawnGeo = new THREE.CircleGeometry(1, 22);
  lawnGeo.rotateX(-Math.PI / 2);
  for (const [x, z, rx, rz] of lawns) {
    const m = new THREE.Mesh(lawnGeo, new THREE.MeshStandardMaterial({
      color: rgb('#2f4634'), roughness: 1, emissive: rgb('#0a1410'), emissiveIntensity: 0.45,
    }));
    m.position.set(x, SITE.groundY + 0.02, z);
    m.scale.set(rx, 1, rz);
    m.receiveShadow = true;
    group.add(m);
  }
  // 洲岛：一层卵石堆起的小台地
  for (const il of ISLANDS) {
    const g = new THREE.CylinderGeometry(1, 1.06, il.y + 0.5, 26, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.1 * Math.sin(x * 1.7 + z * 2.1) + 0.06 * Math.cos(z * 3.1);
      p.setXYZ(i, x * (1 + n * 0.4), y, z * (1 + n * 0.4));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.stoneDark);
    m.position.set(il.cx, (il.y + 0.5) / 2 - 0.45, il.cz);
    m.scale.set(il.rx, 1, il.rz);
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.98, 24), new THREE.MeshStandardMaterial({
      color: rgb('#3a4f39'), roughness: 1, map: T.cobble(),
    }));
    cap.rotateX(-Math.PI / 2);
    cap.position.set(il.cx, il.y + 0.06, il.cz);
    cap.scale.set(il.rx * 0.98, 1, il.rz * 0.98);
    cap.receiveShadow = true;
    group.add(cap);
  }
  scene.add(group);

  // 塘底 + 驳岸石
  const basins = [];
  const edge = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), M.stone, 4200);
  edge.castShadow = false; edge.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let e = 0;
  for (const def of PONDS) {
    const basin = new THREE.Mesh(basinGeometry(def), new THREE.MeshStandardMaterial({
      color: rgb('#202838'), roughness: 0.95, side: THREE.DoubleSide,
    }));
    basin.name = `basin-${def.id}`;
    scene.add(basin);
    basins.push(basin);
    const pts = pondOutline(def);
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const count = 2;
      for (let k = 0; k < count; k++) {
        if (e >= edge.count) break;
        const s = rr(0.42, 0.95);
        dummy.position.set(x + rr(-0.3, 0.3), SITE.groundY - 0.24 + k * 0.22 + rr(-0.1, 0.1), z + rr(-0.3, 0.3));
        dummy.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
        dummy.scale.set(s * rr(1.0, 1.6), s * rr(0.5, 0.9), s * rr(1.0, 1.6));
        dummy.updateMatrix();
        edge.setMatrixAt(e++, dummy.matrix);
      }
    }
  }
  edge.count = e;
  edge.instanceMatrix.needsUpdate = true;
  edge.name = 'revetment';
  scene.add(edge);
  return { group, basins, edge };
}

/* --------------------------------------------------------------- ripple rings */

/**
 * 雨点与脚步：一圈圈短命的环形波，写进水面顶点与法线。
 * 听雨轩的那场雨、桥上的一步、起腔时的一拍，都从这里出。
 */
export class RippleRings {
  constructor() {
    this.items = [];
    this.speed = 5.6;
    this.life = 3.4;
  }
  emit(x, z, t, amp = 1) {
    this.items.push({ x, z, t0: t, amp });
    if (this.items.length > RING_MAX) this.items.shift();
  }
  /** 一批雨：围绕 (x,z) 撒 n 点，落在同一口塘里 */
  rain(x, z, r, n, t) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      this.emit(x + Math.cos(a) * d, z + Math.sin(a) * d, t + rand() * 0.4, rr(0.35, 0.9));
    }
  }
  fill(uniforms, t) {
    const arr = uniforms.uWaves.value;
    for (let i = 0; i < RING_MAX; i++) {
      const w = this.items[i];
      if (!w || t - w.t0 > this.life) { arr[i].set(0, 0, 0, 0); continue; }
      arr[i].set(w.x, w.z, w.t0, w.amp);
    }
    uniforms.uWaveSpeed.value = this.speed;
    uniforms.uWaveFade.value = this.life;
  }
}

/* --------------------------------------------------------------- water surface */

const WAVE_GLSL = `
  uniform vec4 uWaves[${RING_MAX}];
  uniform float uWaveSpeed; uniform float uWaveFade;
  float rippleWave(vec2 p, out vec2 grad){
    float sum = 0.0; grad = vec2(0.0);
    for (int i = 0; i < ${RING_MAX}; i++) {
      float amp = uWaves[i].w;
      if (amp <= 0.0) continue;
      vec2 o = uWaves[i].xy;
      float age = uTime - uWaves[i].z;
      if (age < 0.0 || age > uWaveFade) continue;
      float d = length(p - o);
      float front = age * uWaveSpeed;
      float band = exp(-pow((d - front) / 0.85, 2.0)) * (1.0 - age / uWaveFade) * exp(-d / 26.0);
      float train = exp(-pow((d - front + 1.9) / 1.3, 2.0)) * (1.0 - age / uWaveFade) * exp(-d / 22.0) * 0.5;
      sum += (band + train) * amp;
      grad += normalize(p - o + vec2(0.0001)) * (band + train) * amp * 0.55;
    }
    return sum;
  }`;

export function buildWater(scene, rings = new RippleRings()) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#03080f') },
    uShallow: { value: new THREE.Color('#0a1626') },
    uNoise: { value: T.noise() },
    uGlow: { value: 1 },
    uWaves: { value: Array.from({ length: RING_MAX }, () => new THREE.Vector4()) },
    uWaveSpeed: { value: 5.6 },
    uWaveFade: { value: 3.4 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      attribute float aRadial;
      varying vec3 vW; varying float vRad;
      ${WAVE_GLSL}
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float h = sin(p.x * 0.42 + uTime * 0.72) * 0.035 + sin(p.y * 0.36 - uTime * 0.55) * 0.04
                + sin((p.x + p.y) * 0.9 + uTime * 1.3) * 0.014;
        wp.y += h * uRipple;
        vec2 gw;
        wp.y += rippleWave(p, gw) * 0.075 * uRipple;
        vRad = aRadial;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform float uGlow;
      varying vec3 vW; varying float vRad;
      ${WAVE_GLSL}

      vec3 skyAt(vec3 d){
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.004, 0.006, 0.014), vec3(0.010, 0.015, 0.034), smoothstep(0.5, 0.88, up));
        float haze = pow(clamp(1.0 - abs(d.y) * 2.8, 0.0, 1.0), 2.4);
        // 园墙外的城市暖雾压在东南，西北留给塔影的冷
        col += vec3(0.026, 0.019, 0.011) * haze * (0.35 + 0.7 * smoothstep(-0.4, 0.9, d.x * 0.6 - d.z * 0.5));
        col += vec3(0.032, 0.038, 0.052) * pow(max(0.0, dot(d, uMoon)), 22.0);
        return mix(col, vec3(0.002, 0.003, 0.007), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 70.0, 0.0, 1.0);
        float dx = cos(p.x * 0.42 + t * 0.72) * 0.42 * 0.035 + cos((p.x + p.y) * 0.9 + t * 1.3) * 0.9 * 0.014;
        float dz = cos(p.y * 0.36 - t * 0.55) * 0.36 * 0.04 + cos((p.x + p.y) * 0.9 + t * 1.3) * 0.9 * 0.014;
        float c1 = sin(p.x * 2.4 + t * 2.1) * sin(p.y * 1.9 - t * 1.7);
        float c2 = sin(p.x * 4.6 - t * 2.9 + p.y * 3.1) * 0.6;
        dx += (c1 * 2.4 + c2 * 4.6) * 0.006 * uRipple * det;
        dz += (cos(p.x * 1.7 - t * 1.5) * 1.7 * 0.9 + c2 * 3.1) * 0.006 * uRipple * det;
        vec2 wg; float wv = rippleWave(p, wg);
        dx += wg.x; dz += wg.y;
        vec3 n = normalize(vec3(-dx * uRipple * 1.6, 1.0, -dz * uRipple * 1.6));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.2);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.14 + 0.24 * fres);
        col = mix(col, skyAt(normalize(r)) * 0.5, 0.16 + 0.36 * fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        float lane = smoothstep(0.5, 0.99, dot(normalize(vec3(V.x, 0.0, V.z)), normalize(vec3(uMoon.x, 0.0, uMoon.z))));
        col += vec3(0.42, 0.48, 0.62) * pow(ndh, 220.0) * (0.6 + lane * 2.0) * uGlow;
        col += vec3(0.14, 0.18, 0.28) * pow(ndh, 42.0) * (0.2 + lane * 0.7) * uGlow;
        // 俯视时视线背对月亮也应有一个月下的水面反光
        col += vec3(0.055, 0.068, 0.095) * pow(max(0.0, dot(n, uMoon)), 6.0) * uGlow;

        float sparkle = pow(max(0.0, sin(p.x * 9.1 + t * 2.4) * sin(p.y * 7.7 - t * 1.9)), 14.0);
        col += vec3(0.24, 0.26, 0.30) * sparkle * 0.05 * uRipple * det * det * uGlow;

        float nsh = texture2D(uNoise, p * 0.03 + vec2(t * 0.016, -t * 0.022)).r;
        col *= 0.94 + nsh * 0.12;

        // 涟漪的脊：冷白一条，叠上暖色才是灯影
        col += vec3(0.26, 0.34, 0.46) * wv * 0.9;
        col += vec3(0.30, 0.18, 0.08) * wv * wv * 0.7;

        // 贴岸变暗 + 一圈草亭绿的回色
        float edge = smoothstep(0.78, 1.0, vRad);
        col *= 1.0 - edge * 0.42;
        col += vec3(0.012, 0.026, 0.018) * edge;

        float a = clamp(0.86 + fres * 0.12, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
      }`,
  });

  const group = new THREE.Group();
  group.name = 'water';
  const meshes = [];
  for (const def of PONDS) {
    const m = new THREE.Mesh(waterGeometry(def), mat);
    m.position.y = WATER_Y;
    m.renderOrder = 3;
    m.name = `water-${def.id}`;
    group.add(m);
    meshes.push(m);
  }
  scene.add(group);
  return {
    group, meshes, rings, uniforms: uni, material: mat,
    update(t, ripple, glow = 1) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
      uni.uGlow.value = glow;
      rings.fill(uni, t);
    },
  };
}

/* --------------------------------------------------------------- reflections */

/** 共用抖动，注入任何镜像材质 */
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
      color: c, map: src.map || null, transparent: true, opacity: 0.28,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    m.toneMapped = false;
    const wobble = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wobble.time;
      shader.uniforms.uRipple = wobble.ripple;
      shader.vertexShader = 'uniform float uTime; uniform float uRipple;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.x += (sin(transformed.y * 0.3 + uTime * 1.4) + sin(transformed.z * 0.5 - uTime)) * 0.14 * uRipple;
          transformed.z += (sin(transformed.y * 0.26 - uTime * 1.1) + sin(transformed.x * 0.42 + uTime * 1.6)) * 0.11 * uRipple;
        `);
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        'varying vec3 vMirrorPos;\n#include <common>');
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvMirrorPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        'varying vec3 vMirrorPos;\n#include <common>');
      // 越往水底沉越淡
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-20.0, -0.5, vMirrorPos.y) * 0.9 + 0.1;
      `);
    };
    m.customProgramCacheKey = () => 'zhuozheng-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/** 镜像副本坐在水面之下，靠半透明水面透出来 */
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
        const a = [], b = [];
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
        uStrength: { value: 1 },
      },
      vertexShader: `
        uniform float uTime; uniform float uRipple;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float wob = sin(wp.z * 0.5 + uTime * 1.7) * 0.5 + sin(wp.x * 0.7 - uTime * 1.2) * 0.35;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x - 0.5) * sx * (0.42 + 0.9 * t))
                             + vec3(0.0, 1.0, 0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.7;
          vUv = uv; vCol = instanceColor;
          vFlick = 0.74 + 0.26 * sin(uTime * 2.3 + wp.x * 1.9 + wp.z * 2.1);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.08, vUv.y);
          gl_FragColor = vec4(vCol, m * fade * vFlick * uStrength);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 900);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  add(pos, color, width = 0.9, depth = 6, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, on: true,
    });
    this.dirty = true;
    return i;
  }
  setOn(i, on) {
    if (i < 0 || !this.items[i] || this.items[i].on === on) return;
    this.items[i].on = on;
    this.dirty = true;
  }
  flush() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, WATER_Y - 0.1, it.pos.z);
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
