import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIVER, WATER_Y } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export { WATER_Y };
export const FOG_COLOR = new THREE.Color(0x0b151b);
export const FOG_DENSITY = 0.0011;

/* ------------------------------------------------------------------ 倒影 */

/** 共用的摆动：任何被映进江里的材质都注一次 */
class Wobble {
  constructor({ amp = 0.5, fade = 90 } = {}) {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.amp = amp;
    this.fade = fade;
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.6);
    const showMap = src.emissiveMap || src.map || null;
    if (src.emissiveMap) c.setRGB(1, 1, 1).multiplyScalar(0.72);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: showMap, alphaMap: src.alphaMap || null, alphaTest: src.alphaTest || 0,
      transparent: true, opacity: src.emissiveMap ? 0.9 : 0.58,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    m.toneMapped = false;
    const wobble = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wobble.time;
      shader.uniforms.uRipple = wobble.ripple;
      shader.uniforms.uAmp = { value: wobble.amp };
      shader.uniforms.uFade = { value: wobble.fade };
      shader.vertexShader = `uniform float uTime; uniform float uRipple; uniform float uAmp;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wt = uTime;
          transformed.x += (sin(transformed.y * 0.09 + wt * 1.3) + sin(transformed.z * 0.11 - wt * 0.8)) * uAmp * uRipple;
          transformed.z += (sin(transformed.y * 0.08 - wt * 1.0) + sin(transformed.x * 0.1 + wt * 1.5)) * uAmp * 0.85 * uRipple;
        `);
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        `varying vec3 vWorldPosition; uniform float uFade;\n#include <common>`);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        `varying vec3 vWorldPosition; uniform float uFade;\n#include <common>`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
        `#include <dithering_fragment>
         gl_FragColor.a *= smoothstep(-uFade, -2.0, vWorldPosition.y) * 0.9 + 0.1;`);
    };
    m.customProgramCacheKey = () => `langshan-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/** 把源对象映到水面以下 */
export class Reflections {
  constructor(scene, opts) {
    this.root = new THREE.Group();
    this.root.name = 'reflections';
    this.wobble = new Wobble(opts);
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
      if (o.isPoints || /^(media|beam|halo|spill|fireflies|city-lights|far-bank)/.test(o.name || '')) {
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
    const skip = /^(media|beam|halo|spill|fireflies|city-lights|far-bank)/;
    for (const [src, clone] of this.pairs) {
      clone.position.copy(src.position);
      clone.rotation.copy(src.rotation);
      clone.scale.copy(src.scale);
      if (src.children.length) {
        const a = [], b = [];
        src.traverse((o) => a.push(o));
        clone.traverse((o) => b.push(o));
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (!b[i].isPoints && !skip.test(b[i].name || '')) b[i].visible = a[i].visible;
        }
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

/* ------------------------------------------------------------------ 光柱 */

/** 每一盏临水的灯在江里拖下来的一根加法光柱 */
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
          float wob = sin(wp.z * 0.07 + uTime * 1.1) * 0.9 + sin(wp.x * 0.09 - uTime * 0.8) * 0.6;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x - 0.5) * sx * (0.42 + 1.15 * t))
                             + vec3(0.0, 1.0, 0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.7;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.74 + 0.26 * sin(uTime * 1.7 + wp.x * 0.2 + wp.z * 0.3);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.06, vUv.y);
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
  add(pos, color, width = 1.4, depth = 12, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({ pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity), width, depth, on: true });
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
      d.position.set(it.pos.x, WATER_Y - 0.08, it.pos.z);
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

/* ------------------------------------------------------------------ 江 */

function waterMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#03080c') },
    uShallow: { value: new THREE.Color('#15262e') },
    uNoise: { value: T.noise() },
    uFog: { value: FOG_COLOR.clone() },
    uFogDensity: { value: FOG_DENSITY },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float h = sin(p.x * 0.045 + uTime * 0.36) * 0.55
                + sin(p.y * 0.037 - uTime * 0.3) * 0.7
                + sin((p.x + p.y) * 0.11 + uTime * 0.85) * 0.16;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform vec3 uFog; uniform float uFogDensity;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0035, 0.0058, 0.013), vec3(0.008, 0.013, 0.026), smoothstep(0.5, 0.84, up));
        float haze = pow(clamp(1.0 - abs(d.y) * 2.1, 0.0, 1.0), 2.1);
        // 江北岸的城在西南压出一片钠黄，对岸则是一条冷灯
        float bank = smoothstep(0.1, -0.9, d.x);
        col += vec3(0.052, 0.03, 0.014) * haze * (0.4 + 0.9 * (1.0 - bank));
        col += vec3(0.02, 0.03, 0.045) * haze * bank * 0.6;
        col += vec3(0.008, 0.018, 0.028) * pow(max(0.0, dot(d, uMoon)), 40.0);
        return mix(col, vec3(0.002, 0.003, 0.006), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 220.0, 0.0, 1.0);
        float dx = cos(p.x * 0.045 + t * 0.36) * 0.045 * 0.55 + cos((p.x + p.y) * 0.11 + t * 0.85) * 0.11 * 0.16;
        float dz = cos(p.y * 0.037 - t * 0.3) * 0.037 * 0.7 + cos((p.x + p.y) * 0.11 + t * 0.85) * 0.11 * 0.16;
        float c1 = sin(p.x * 0.42 + t * 1.3) * sin(p.y * 0.36 - t * 1.1);
        float c2 = sin(p.x * 0.72 - t * 1.6 + p.y * 0.5) * 0.6;
        dx += (c1 * 0.42 + c2 * 0.72) * 0.09 * uRipple * det;
        dz += (cos(p.x * 0.34 - t * 1.0) * 0.34 * 0.85 + c2 * 0.5) * 0.09 * uRipple * det;
        vec3 n = normalize(vec3(-dx * uRipple, 1.0, -dz * uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.32 * fres);
        col = mix(col, skyAt(normalize(r)) * 2.2, 0.16 + 0.5 * fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.55, 0.99, dot(normalize(vec3(V.x, 0.0, V.z)), normalize(vec3(uMoon.x, 0.0, uMoon.z))));
        col += vec3(0.36, 0.42, 0.54) * pow(ndh, 200.0) * (0.3 + lane * 1.7);
        col += vec3(0.12, 0.16, 0.24) * pow(ndh, 36.0) * (0.1 + lane * 0.6);

        float sparkle = pow(max(0.0, sin(p.x * 1.6 + t * 1.6) * sin(p.y * 1.3 - t * 1.4)), 14.0);
        col += vec3(0.18, 0.2, 0.24) * sparkle * 0.1 * uRipple * det * det;

        float nsh = texture2D(uNoise, p * 0.012 + vec2(t * 0.008, -t * 0.011)).r;
        col *= 0.92 + nsh * 0.16;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(0.42 + 0.24 * (1.0 - fres) + f * 0.4, 0.0, 0.96);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

export function buildWaters(scene) {
  const { mat, uni } = waterMaterial();
  const g = new THREE.PlaneGeometry(
    RIVER.xTo < RIVER.shoreX ? RIVER.shoreX - RIVER.xTo : RIVER.xTo - RIVER.shoreX,
    RIVER.zTo - RIVER.zFrom, 108, 96,
  );
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set((RIVER.shoreX + RIVER.xTo) / 2, WATER_Y, (RIVER.zFrom + RIVER.zTo) / 2);
  m.renderOrder = 3;
  m.name = 'yangzi';
  scene.add(m);
  return {
    meshes: [m], uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** 江底：水面是半透明的，得有个可看的东西在下面 */
export function buildBed(scene, material) {
  const g = new THREE.BoxGeometry(RIVER.shoreX - RIVER.xTo + 60, 1.2, RIVER.zTo - RIVER.zFrom);
  g.translate((RIVER.shoreX + RIVER.xTo) / 2, -9.5, 0);
  const m = new THREE.Mesh(g, material);
  m.name = 'river-bed';
  scene.add(m);
  return m;
}
