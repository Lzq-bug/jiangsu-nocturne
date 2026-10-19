import * as THREE from 'three';
import { southBank, northBank, RIVER } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0b1218);
export const FOG_DENSITY = 0.00042;

/* ------------------------------------------------------------------ 灯柱 */

/**
 * 水面上每盏灯往下拖的一道加性光柱。江比湖宽，灯影不能一律拉到底：
 * uDepth 按灯离机的远近给强度，主泓上的船灯拖得长，滩地的短。
 */
export class LightColumns {
  constructor(scene, capacity = 260) {
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
          // 江里的抖动顺着东西向的流，比湖多一个长周期的摆
          float wob = sin(wp.z*0.075 + uTime*0.9 + wp.x*0.02) * 1.15 + sin(wp.x*0.11 - uTime*0.7) * 0.5;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.62;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.74 + 0.26*sin(uTime*1.5 + wp.x*0.13 + wp.z*0.19);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.06, vUv.y);
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
  add(pos, color, width = 1.3, depth = 11, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(),
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
      d.position.set(it.pos.x, WATER_Y - 0.1, it.pos.z);
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

/* ------------------------------------------------------------------ 江水 */

function riverMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#02070b') },
    uShallow: { value: new THREE.Color('#132229') },
    uNoise: { value: T.noise() },
    uFog: { value: FOG_COLOR.clone() },
    uFogDensity: { value: FOG_DENSITY },
    uChannel: { value: RIVER.channel },
    uBand: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        // 潮与流：顺 +x 走的一组长短波，叠加横江的涌
        float h = sin(p.x*0.055 - uTime*0.42)*0.22 + sin(p.x*0.13 + p.y*0.05 - uTime*0.8)*0.14
                + sin(p.y*0.10 - uTime*0.36)*0.11 + sin((p.x*0.31+p.y*0.22) + uTime*1.4)*0.035;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform vec3 uFog; uniform float uFogDensity; uniform float uChannel; uniform float uBand;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0028,0.0046,0.0100), vec3(0.0060,0.0100,0.0195), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.6);
        // 江南岸是城与山，江北岸是扬州：两侧都有灯气，北岸那一条更冷更远
        float south = smoothstep(0.2, -0.98, d.z);
        float north = smoothstep(-0.2, 0.98, d.z);
        col += vec3(0.034,0.019,0.011) * haze * (0.30 + 0.75*south);
        col += vec3(0.020,0.024,0.032) * haze * (0.10 + 0.60*north) * (0.35 + 0.65*uBand);
        col += vec3(0.006,0.012,0.019) * pow(max(0.0, dot(d, uMoon)), 30.0);
        return mix(col, vec3(0.0014,0.0022,0.0044), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 420.0, 0.0, 1.0);
        float dx = cos(p.x*0.055 - t*0.42)*0.055*0.22 + cos(p.x*0.13 + p.y*0.05 - t*0.8)*0.13*0.14
                 + cos(p.x*0.31 + p.y*0.22 + t*1.4)*0.31*0.035;
        float dz = cos(p.x*0.13 + p.y*0.05 - t*0.8)*0.05*0.14 + cos(p.y*0.10 - t*0.36)*0.10*0.11
                 + cos(p.x*0.31 + p.y*0.22 + t*1.4)*0.22*0.035;
        float c1 = sin(p.x*0.28 + t*1.05) * sin(p.y*0.24 - t*0.82);
        float c2 = sin(p.x*0.46 - t*1.3 + p.y*0.33) * 0.55;
        dx += (c1*0.28 + c2*0.46) * 0.09 * uRipple * det;
        dz += (cos(p.x*0.23 - t*0.9)*0.23*0.9 + c2*0.33) * 0.09 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.08 + 0.26*fres);
        col = mix(col, skyAt(normalize(r)) * 1.4, 0.10 + 0.46*fres);

        // 月下亮路：江面宽，一路从北铺到南岸的山脚
        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.5, 0.995, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.28,0.34,0.46) * pow(ndh, 150.0) * (0.22 + lane*1.25);
        col += vec3(0.09,0.13,0.21) * pow(ndh, 26.0) * (0.07 + lane*0.40);

        // 主泓上那一条"船灯带"（北望神州点到它时才起来）
        float band = smoothstep(520.0, 90.0, abs(p.y - uChannel)) * uBand;
        col += vec3(0.10,0.13,0.17) * band * (0.4 + 0.6*det);

        float sparkle = pow(max(0.0, sin(p.x*1.05 + t*1.5) * sin(p.y*0.86 - t*1.2)), 12.0);
        col += vec3(0.15,0.18,0.22) * sparkle * 0.05 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.004 + vec2(t*0.012, -t*0.005)).r;
        col *= 0.93 + nsh*0.13;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(0.5 + 0.22 * (1.0 - fres) + f * 0.44, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/**
 * 江面：南边随岸线退让，北边到扬州那一岸。
 * Shape 的 y 是世界 -z，所以这里直接用 quadGrid 铺，岸线走函数。
 */
export function buildRiver(scene) {
  const { mat, uni } = riverMaterial();
  const g = quadGridTo(RIVER.xWest, RIVER.xEast, -1, 1, 150, 64, (u, v) => {
    const x = RIVER.xWest + (RIVER.xEast - RIVER.xWest) * u;
    const z0 = southBank(x), z1 = northBank(x);
    return [x, WATER_Y, z0 + (z1 - z0) * (1 - v)];
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  m.name = 'river';
  scene.add(m);

  return {
    mesh: m, uniforms: uni,
    setBand(v) { uni.uBand.value = Math.min(1.4, Math.max(0, v)); },
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** 贴岸的一圈浅水与湿滩：把山脚与水面之间那道缝压住 */
export function buildRiverBed(scene) {
  const g = quadGridTo(RIVER.xWest, RIVER.xEast, -1, 1, 60, 24, (u, v) => {
    const x = RIVER.xWest + (RIVER.xEast - RIVER.xWest) * u;
    const z0 = southBank(x) + 40, z1 = northBank(x) - 40;
    return [x, -6.5 - (1 - v) * 2.5, z0 + (z1 - z0) * (1 - v)];
  });
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: new THREE.Color('#05090d'), roughness: 0.98, metalness: 0,
  }));
  m.name = 'river-bed';
  scene.add(m);
  return m;
}

function quadGridTo(x0, x1, v0, v1, nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = v0 + (v1 - v0) * (j / nv);
      const [x, y, z] = fn(u, v);
      pos.push(x, y, z);
      uv.push(x / 60, z / 60);
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
