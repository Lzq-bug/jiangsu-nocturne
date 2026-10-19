import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEA, RESERVOIR, POOLS, groundAt } from './data.js';
import { pathFrames } from './kit.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x1b2530);
export const FOG_DENSITY = 0.000155;

/* ------------------------------------------------------------------ 水的材质 */

function waterMaterial({ chop = 1, moonGain = 1 } = {}) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uChop: { value: chop },
    uMoonGain: { value: moonGain },
    uDeep: { value: new THREE.Color('#03070b') },
    uShallow: { value: new THREE.Color('#12222b') },
    uNoise: { value: T.noise() },
    uFog: { value: FOG_COLOR.clone() },
    uFogDensity: { value: FOG_DENSITY },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple; uniform float uChop;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float t = uTime;
        float h = sin(p.x * 0.021 + t * 0.32) * 0.55
                + sin(p.y * 0.017 - t * 0.27) * 0.50
                + sin((p.x + p.y) * 0.043 + t * 0.70) * 0.18 * uChop
                + sin(p.x * 0.13 - p.y * 0.11 + t * 1.6) * 0.05 * uChop;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform float uChop; uniform float uMoonGain;
      uniform vec3 uMoon; uniform vec3 uDeep; uniform vec3 uShallow;
      uniform vec3 uFog; uniform float uFogDensity;
      varying vec3 vW;

      // 夜海反的是天：西面街市那一头发热，东面敞海那一头发冷
      vec3 skyAt(vec3 d){
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0034,0.0054,0.0120), vec3(0.0074,0.0110,0.0232), smoothstep(0.5, 0.86, up));
        float haze = pow(clamp(1.0 - abs(d.y) * 2.1, 0.0, 1.0), 2.4);
        float west = smoothstep(0.2, -0.95, d.x);
        float east = smoothstep(0.2, 0.95, d.x);
        col += vec3(0.066,0.034,0.013) * haze * (0.30 + 1.05 * west);
        col += vec3(0.012,0.026,0.038) * haze * (0.30 + 0.80 * east);
        col += vec3(0.010,0.012,0.018) * pow(max(0.0, dot(d, uMoon)), 46.0);
        return mix(col, vec3(0.0020,0.0030,0.0056), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // 细碎的波纹只在近处给，不然从山上一看满屏都是锯齿
        float det = clamp(1.0 - length(cameraPosition - vW) / 900.0, 0.0, 1.0);
        float dx = cos(p.x * 0.021 + t * 0.32) * 0.021 * 0.55
                 + cos((p.x + p.y) * 0.043 + t * 0.70) * 0.043 * 0.18 * uChop;
        float dz = cos(p.y * 0.017 - t * 0.27) * 0.017 * 0.50
                 + cos((p.x + p.y) * 0.043 + t * 0.70) * 0.043 * 0.18 * uChop;
        float c1 = sin(p.x * 0.26 + t * 1.9) * cos(p.y * 0.22 - t * 1.5);
        float c2 = sin(p.x * 0.41 - p.y * 0.33 + t * 2.6);
        dx += (c1 * 0.26 + c2 * 0.41) * 0.05 * uChop * det;
        dz += (cos(p.x * 0.19 - t * 1.3) * 0.19 - c2 * 0.33) * 0.05 * uChop * det;
        vec3 n = normalize(vec3(-dx * uRipple * 6.0, 1.0, -dz * uRipple * 6.0));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.30 * fres);
        col = mix(col, skyAt(normalize(r)) * 2.4, 0.16 + 0.50 * fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        vec2 vd = normalize(vec2(V.x, V.z) + vec2(0.0001, 0.0));
        vec2 md = normalize(vec2(uMoon.x, uMoon.z) + vec2(0.0001, 0.0));
        float lane = smoothstep(0.90, 0.9995, dot(vd, md));
        col += vec3(0.36, 0.42, 0.54) * pow(ndh, 320.0) * (0.22 + lane * 1.15) * uMoonGain;
        col += vec3(0.13, 0.17, 0.25) * pow(ndh, 60.0) * (0.06 + lane * 0.34) * uMoonGain;

        // 远处的水面靠雾收口，天际线才是软的
        float dist = length(cameraPosition - vW);
        float fogK = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
        col = mix(col, uFog, fogK);
        gl_FragColor = vec4(col, 0.92 + 0.08 * fres);
      }`,
  });
  return { mat, uni };
}

/* ------------------------------------------------------------------ 倒影 */

/** shared wobble injected into any mirrored material */
class Wobble {
  constructor({ amp = 0.34, fade = 46 } = {}) {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.amp = amp;
    this.fade = fade;
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.62);
    const showMap = src.emissiveMap || src.map || null;
    if (src.emissiveMap) c.setRGB(1, 1, 1).multiplyScalar(0.7);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: showMap, alphaMap: src.alphaMap || null, alphaTest: src.alphaTest || 0,
      transparent: true,
      opacity: src.emissiveMap ? 0.9 : 0.62,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
      blending: THREE.NormalBlending,
    });
    m.toneMapped = false;
    const wobble = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wobble.time;
      shader.uniforms.uRipple = wobble.ripple;
      shader.uniforms.uAmp = { value: wobble.amp };
      shader.uniforms.uFade = { value: wobble.fade };
      shader.vertexShader = `uniform float uTime; uniform float uRipple; uniform float uAmp;
        varying vec3 vWorldPosition; uniform float uFade;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wt = uTime;
          transformed.x += (sin(transformed.y*0.34 + wt*1.5) + sin(transformed.z*0.42 - wt*0.9)) * uAmp * uRipple;
          transformed.z += (sin(transformed.y*0.28 - wt*1.1) + sin(transformed.x*0.38 + wt*1.7)) * uAmp * 0.8 * uRipple;
        `).replace('#include <worldpos_vertex>', `
          #include <worldpos_vertex>
          vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      // 浅水里的倒影走到水底就该化了
      shader.fragmentShader = `varying vec3 vWorldPosition; uniform float uFade;\n` +
        shader.fragmentShader.replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          gl_FragColor.a *= smoothstep(-uFade, -1.5, vWorldPosition.y) * 0.92 + 0.08;
        `);
    };
    m.customProgramCacheKey = () => `huaguo-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 把一组东西按水平面镜像到水下。镜面高度由 waterY 定：海在 0，水库在 5 米上，
 * 两处不能共用一面镜子。
 */
export class Reflections {
  constructor(scene, { waterY = 0, amp = 0.3, fade = 40 } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'reflections';
    this.wobble = new Wobble({ amp, fade });
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
      if (o.isPoints || /^(media|beam|halos|spill|spray|glints)/.test(o.name || '')) {
        o.visible = false;
        return;
      }
      o.castShadow = o.receiveShadow = false;
      if (o.isMesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => this.wobble.material(m))
          : this.wobble.material(o.material);
      }
    });
    this.mirror.add(clone);
    this.pairs.push([source, clone]);
    return clone;
  }
  sync() {
    const skip = /^(media|beam|halos|spill|spray|glints)/;
    for (const [src, clone] of this.pairs) {
      clone.position.copy(src.position);
      clone.rotation.copy(src.rotation);
      clone.scale.copy(src.scale);
      if (src.children.length) {
        const a = []; const b = [];
        src.traverse((o) => a.push(o));
        clone.traverse((o) => b.push(o));
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (!b[i].isPoints && !skip.test(b[i].name || '')) b[i].visible = a[i].visible;
        }
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

/* ------------------------------------------------------------------ 灯柱 */

/** additive light columns dragged down the water under every lamp */
export class LightColumns {
  constructor(scene, capacity = 320) {
    this.items = [];
    this.matrixDirty = true;
    this.colorDirty = true;
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
          float wob = sin(wp.z*0.042 + uTime*1.15) * 0.7 + sin(wp.x*0.051 - uTime*0.85) * 0.5;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.5;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.74 + 0.26*sin(uTime*1.9 + wp.x*0.04 + wp.z*0.055);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.08, vUv.y);
          float a = m * fade * vFlick * uStrength;
          gl_FragColor = vec4(vCol * uDepth, a);
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
  /** pos.y 就是那片水的液面：海、潭、水库各有各的柱子 */
  add(pos, color, width = 1.2, depth = 9, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    const p = pos.isVector3 ? pos : new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.items.push({
      pos: p.clone(),
      color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, on: true,
    });
    this.matrixDirty = true;
    this.colorDirty = true;
    return i;
  }
  setOn(i, on) {
    if (i < 0 || !this.items[i] || this.items[i].on === on) return;
    this.items[i].on = on;
    this.matrixDirty = true;
  }
  writeMatrices() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, it.pos.y - 0.06, it.pos.z);
      d.scale.set(it.on ? it.width : 0, it.on ? it.depth : 0, 1);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.matrixDirty = false;
  }
  writeColors() {
    this.items.forEach((it, i) => this.mesh.setColorAt(i, it.color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.colorDirty = false;
  }
  update(t, ripple, strength) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uRipple.value = ripple;
    this.mat.uniforms.uStrength.value = strength;
    if (this.matrixDirty) this.writeMatrices();
    if (this.colorDirty) this.writeColors();
  }
}

/* ------------------------------------------------------------------ 几片水 */

const sheet = (x0, x1, z0, z1, y, segX, segZ) => {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
};

function ellipse(cx, cz, rx, rz, y, seg = 40) {
  const pos = [cx, y, cz];
  const uv = [0.5, 0.5];
  const idx = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
    uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 1; i <= seg; i++) idx.push(0, (i % seg) + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 沿一条线铺在水面上的窄溪面，跟着地形走 */
function creekRibbon(points, width, lift) {
  const f = pathFrames(points, { steps: 5 });
  const nu = f.pts.length - 1, nv = 3;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = f.pts[i], r = f.right[i];
      const off = (v - 0.5) * width;
      const x = p.x + r.x * off, z = p.z + r.z * off;
      pos.push(x, groundAt(x, z) + lift, z);
      uv.push((u * f.length) / 8, (v * width) / 8);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildWaters(scene) {
  const { mat, uni } = waterMaterial({ chop: 1, moonGain: 1 });
  const meshes = [];

  // 海：两片水其实是一张面，山从它里面顶出来
  const sea = new THREE.Mesh(sheet(SEA.x0, SEA.x1, SEA.z0, SEA.z1, WATER_Y, 88, 88), mat);
  sea.name = 'sea';
  sea.renderOrder = 3;
  scene.add(sea);
  meshes.push(sea);

  // 洞前的潭与桥下的渊：液面就按挖出来的盆取
  for (const p of POOLS) {
    const y = groundAt(p.x, p.z) + p.depth * 0.46;
    const m = new THREE.Mesh(ellipse(p.x, p.z, p.rx * 0.95, p.rz * 0.95, y, 34), mat);
    m.name = 'pool';
    m.renderOrder = 3;
    scene.add(m);
    meshes.push(m);
  }

  // 大村水库：1958 年把寺换成的那一片静水
  const res = new THREE.Mesh(
    ellipse(RESERVOIR.x, RESERVOIR.z, RESERVOIR.rx * 0.86, RESERVOIR.rz * 0.86, RESERVOIR.y, 52), mat);
  res.name = 'reservoir';
  res.renderOrder = 3;
  scene.add(res);
  meshes.push(res);

  // 涧：从潭口一路到今日的水边，九龙桥跨的就是它
  const creek = new THREE.Mesh(creekRibbon([
    [-436, 164], [-520, 158], [-620, 152], [-690, 150],
    [-840, 146], [-1020, 152], [-1200, 158], [-1380, 162],
  ].map(([x, z]) => [x, groundAt(x, z), z]), 13, 0.5), mat);
  creek.name = 'creek';
  creek.renderOrder = 3;
  scene.add(creek);
  meshes.push(creek);

  return {
    meshes, uniforms: uni, material: mat,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** 水底：让浅处的水有一个可以看的底，别让潭变成黑洞 */
export function buildBeds(scene, material) {
  const parts = [sheet(SEA.x0, SEA.x1, SEA.z0, SEA.z1, -34, 1, 1)];
  for (const p of POOLS) parts.push(ellipse(p.x, p.z, p.rx * 1.12, p.rz * 1.12, groundAt(p.x, p.z) - 1.4, 30));
  parts.push(ellipse(RESERVOIR.x, RESERVOIR.z, RESERVOIR.rx * 1.02, RESERVOIR.rz * 1.02, RESERVOIR.y - 4.6, 44));
  const m = new THREE.Mesh(mergeGeometries(parts), material);
  m.name = 'water-beds';
  scene.add(m);
  return m;
}
