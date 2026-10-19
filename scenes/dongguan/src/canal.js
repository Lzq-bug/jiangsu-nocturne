import * as THREE from 'three';
import { CANAL } from './data.js';
import { MOON_DIR, FOG_COLOR, FOG_DENSITY } from './sky.js';
import { rgb } from './kit.js';
import * as T from './textures.js';

export const WATER_Y = 0;

/* ------------------------------------------------------------ 水面上的灯柱 */

/**
 * 檐灯、船灯在窄河里落不下完整的倒影，落下的是一条条被波扯长的光柱。
 * 每根柱子是一个实例：宽度随灯、深度随水面扰动，顶点着色器里沿视线方向铺开。
 */
export class LightColumns {
  constructor(scene, capacity = 700) {
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
          vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float wob = sin(wp.z*0.11 + uTime*1.5) * 0.55 + sin(wp.x*0.13 - uTime*1.1) * 0.4;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 1.8;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.76 + 0.24*sin(uTime*2.4 + wp.x*0.5 + wp.z*0.6);
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
    this.mat.toneMapped = false;
    this.mesh = new THREE.InstancedMesh(geo, this.mat, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }

  add(pos, color, width = 2.2, depth = 22, intensity = 1) {
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
  setPos(i, pos) {
    if (i < 0 || !this.items[i]) return;
    this.items[i].pos.copy(pos);
    this.matrixDirty = true;
  }
  setOn(i, on) {
    if (i < 0 || !this.items[i] || this.items[i].on === on) return;
    this.items[i].on = on;
    this.matrixDirty = true;
  }
  writeMatrices() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, WATER_Y - 0.25, it.pos.z);
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

/* ------------------------------------------------------------------- 古运河 */

/** 河心 x，用来算"街那边"的暖反射权重 */
const MID_X = (CANAL.x0 + CANAL.x1) / 2;

/**
 * 南北向的一段古运河：水面在街面之下，反射的是天空底面、月亮和街东口那一带暖光。
 * 河宽不到七十米，细波纹到远处会起摩尔纹，所以细节随距离衰减，只留起伏与反光。
 */
export function buildCanal(scene) {
  const geo = new THREE.PlaneGeometry(CANAL.x1 - CANAL.x0, CANAL.halfZ * 2, 40, 60);
  geo.rotateX(-Math.PI / 2);

  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: rgb('#040d16') },
    uShallow: { value: rgb('#0a1b28') },
    uTown: { value: rgb('#4a2c14') },
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
        float h = sin(p.x*0.05 + uTime*0.5)*0.34 + sin(p.z*0.031 - uTime*0.38)*0.5
                + sin((p.x+p.z)*0.09 + uTime*1.05)*0.14;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uTown;
      uniform sampler2D uNoise; uniform vec3 uFog; uniform float uFogDensity;
      uniform float uMidX;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.010,0.020), vec3(0.012,0.018,0.038), smoothstep(0.5, 0.86, up));
        float haze = pow(clamp(1.0 - abs(d.y)*2.4, 0.0, 1.0), 2.2);
        // 街在河西（-X 一侧），灯把反射方向的西半边染暖
        float town = smoothstep(0.25, -0.95, d.x);
        col += uTown * haze * (0.5 + 2.0*town);
        col += vec3(0.012, 0.026, 0.040) * pow(max(0.0, dot(d, uMoon)), 40.0);
        return col;
      }

      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 210.0, 0.0, 1.0);
        float dx = cos(p.x*0.05 + t*0.5)*0.05*0.34 + cos((p.x+p.z)*0.09 + t*1.05)*0.09*0.14;
        float dz = cos(p.z*0.031 - t*0.38)*0.031*0.5 + cos((p.x+p.z)*0.09 + t*1.05)*0.09*0.14;
        float c1 = sin(p.x*0.85 + t*2.0) * sin(p.z*0.72 - t*1.6);
        float c2 = sin(p.x*1.55 - t*2.5 + p.z*1.1) * 0.6;
        dx += (c1*0.85 + c2*1.55) * 0.05 * uRipple * det;
        dz += (cos(p.x*0.66 - t*1.5)*0.66*0.9 + c2*1.1) * 0.05 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.30*fres);
        col = mix(col, skyAt(normalize(r)), 0.10 + 0.42*fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.55, 0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.34,0.42,0.58) * pow(ndh, 300.0) * (0.35 + lane*1.7);
        col += vec3(0.12,0.16,0.26) * pow(ndh, 42.0) * (0.10 + lane*0.5);

        // 灯河在近岸水面上的一层暖闪
        float warm = smoothstep(120.0, 12.0, abs(vW.x - uMidX));
        float sparkle = pow(max(0.0, sin(p.x*3.1 + t*2.3) * sin(p.z*2.4 - t*1.9)), 12.0);
        col += vec3(0.34,0.22,0.11) * sparkle * 0.5 * uRipple * det * det * (0.2 + warm);

        // 渡口那一带的水面整体托一层暖光，街与河才接得上
        float shore = smoothstep(26.0, 2.0, abs(vW.x - uMidX + 30.0));
        float streak = 0.55 + 0.45 * sin(p.z*0.55 + t*0.9 + sin(p.x*0.7 + t*0.3)*1.6);
        col += vec3(0.11,0.062,0.028) * shore * streak * (0.35 + 0.65 * fres);

        float nsh = texture2D(uNoise, p*0.02 + vec2(t*0.012, -t*0.016)).r;
        col *= 0.92 + nsh*0.16;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);
        gl_FragColor = vec4(col, clamp(0.55 + 0.30*(1.0 - fres) + f*0.4, 0.0, 0.98));
      }`,
  });
  uni.uMidX = { value: MID_X };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(MID_X, WATER_Y, 0);
  mesh.renderOrder = 3;
  mesh.name = 'canal';
  scene.add(mesh);

  return {
    mesh,
    uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}
