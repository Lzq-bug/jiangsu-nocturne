import * as THREE from 'three';
import { RIVER, GIRDER, FOG_COLOR, FOG_DENSITY } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;

/* ------------------------------------------------------------------ reflections */

/** 水中镜像共用的晃动 */
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
      opacity: src.emissiveMap ? 0.82 : 0.5,
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
      shader.vertexShader = `uniform float uTime; uniform float uRipple; uniform float uAmp;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wt = uTime;
          transformed.x += (sin(transformed.y*0.14 + wt*1.1) + sin(transformed.z*0.22 - wt*0.7)) * uAmp * uRipple;
          transformed.z += (sin(transformed.y*0.12 - wt*0.9) + sin(transformed.x*0.19 + wt*1.3)) * uAmp * 0.8 * uRipple;
        `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-uFade, -1.5, vWorldPosition.y) * 0.9 + 0.1;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        varying vec3 vWorldPosition; uniform float uFade;
        #include <common>`);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        varying vec3 vWorldPosition; uniform float uFade;
        #include <common>`);
    };
    m.customProgramCacheKey = () => `njbridge-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 镜像到水面以下的一份拷贝。发光面（加性材质、sprite）不参与——
 * 它们在镜像里会变成江面上的一片白斑，江面的光本来就有 LightColumns 负责。
 */
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
  static skip(o) {
    if (o.isSprite || o.isPoints) return true;
    const m = o.material;
    const add = (x) => !!x && (x.blending === THREE.AdditiveBlending || x.transparent === true && x.fog === false);
    if (Array.isArray(m)) return m.some(add);
    return add(m);
  }
  add(source) {
    const clone = source.clone(true);
    clone.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      if (Reflections.skip(o)) { o.visible = false; return; }
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
    for (const [src, clone] of this.pairs) {
      clone.position.copy(src.position);
      clone.rotation.copy(src.rotation);
      clone.scale.copy(src.scale);
      if (src.children.length) {
        const a = []; const b = [];
        src.traverse((o) => a.push(o));
        clone.traverse((o) => b.push(o));
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (!Reflections.skip(a[i])) b[i].visible = a[i].visible;
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

/* ------------------------------------------------------------------ light columns */

/** 江面上每盏灯往下拖的一道加性光柱 */
export class LightColumns {
  constructor(scene, capacity = 520) {
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
          float wob = sin(wp.z*0.045 + uTime*0.9) * 1.6 + sin(wp.x*0.06 - uTime*0.7) * 1.1;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.7;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.78 + 0.22*sin(uTime*1.5 + wp.x*0.05 + wp.z*0.13);
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
    this.mesh.name = 'light-columns';
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  add(pos, color, width = 1.2, depth = 9, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(),
      color: new THREE.Color(color).multiplyScalar(intensity),
      base: new THREE.Color(color),
      width, depth, on: true, scale: 1,
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
  /** 0—1 的亮度，给"次第齐明"用 */
  setScale(i, k) {
    const it = this.items[i];
    if (!it || it.scale === k) return;
    it.scale = k;
    it.color.copy(it.base).multiplyScalar(k);
    this.colorDirty = true;
  }
  /** 会动的灯（船、列车）要能拖着自己的光柱走 */
  setPos(i, pos) {
    const it = this.items[i];
    if (!it) return;
    if (it.pos.x === pos.x && it.pos.z === pos.z) return;
    it.pos.copy(pos);
    this.matrixDirty = true;
  }
  writeMatrices() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      const k = it.on ? 1 : 0;
      d.position.set(it.pos.x, WATER_Y - 0.12, it.pos.z);
      d.scale.set(it.width * k, it.depth * k, 1);
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

function riverMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#03080c') },
    uShallow: { value: new THREE.Color('#101f27') },
    uNoise: { value: T.noise() },
    uFog: { value: new THREE.Color(FOG_COLOR) },
    uFogDensity: { value: FOG_DENSITY },
    uBridge: { value: GIRDER.bottomY },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        // 只用短波：长波在 2 公里宽的江面上会糊成一条一条的带子
        float h = sin(p.x*0.11 + uTime*0.6)*0.09 + sin(p.y*0.09 - uTime*0.4)*0.11
                + sin((p.x+p.y)*0.23 + uTime*0.85)*0.055;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform vec3 uFog; uniform float uFogDensity; uniform float uBridge;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0030,0.0046,0.0098), vec3(0.0060,0.0100,0.0190), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.6);
        // 城在两岸（±z），江心两侧（±x）是开阔水面，那一份暖必须收着
        float bank = abs(d.z);
        col += vec3(0.040,0.023,0.013) * haze * (0.12 + 1.0*bank*bank);
        col += vec3(0.006,0.013,0.020) * pow(max(0.0, dot(d, uMoon)), 32.0);
        return mix(col, vec3(0.0016,0.0024,0.0046), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 420.0, 0.0, 1.0);
        float dx = cos(p.x*0.11 + t*0.6)*0.11*0.09 + cos((p.x+p.y)*0.23 + t*0.85)*0.23*0.055;
        float dz = cos(p.y*0.09 - t*0.4)*0.09*0.11 + cos((p.x+p.y)*0.23 + t*0.85)*0.23*0.055;
        float c1 = sin(p.x*0.28 + t*1.0) * sin(p.y*0.24 - t*0.8);
        float c2 = sin(p.x*0.52 - t*1.4 + p.y*0.37) * 0.6;
        dx += (c1*0.34 + c2*0.52) * 0.09 * uRipple * det;
        dz += (cos(p.x*0.23 - t*0.9)*0.23*0.9 + c2*0.37) * 0.09 * uRipple * det;
        // 江有下游的流：把纹样整体朝 +x 拖一点
        dx += 0.018 * sin(p.y*0.06 + t*0.35);
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.10 + 0.28*fres);
        col = mix(col, skyAt(normalize(r)) * 1.4, 0.10 + 0.44*fres);

        // 月路：桥下这一段要一路铺到堡那边
        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.30, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        // 高频镜面项在远处会整片混成横条纹，所以随距离抖掉
        float far = clamp(1.0 - length(cameraPosition - vW) / 900.0, 0.12, 1.0);
        col += vec3(0.22,0.27,0.36) * pow(ndh, 42.0) * (0.10 + lane*0.42) * far;
        col += vec3(0.07,0.10,0.16) * pow(ndh, 9.0) * (0.05 + lane*0.16) * far;

        float sparkle = pow(max(0.0, sin(p.x*0.62 + t*1.1) * sin(p.y*0.53 - t*0.9)), 16.0);
        col += vec3(0.16,0.19,0.23) * sparkle * 0.05 * uRipple * det * det;

        // 桥的影子：正桥之下那一条压暗的带子
        float under = 1.0 - smoothstep(6.0, 30.0, abs(vW.x)) * 0.0;
        float shade = 1.0 - 0.42 * (1.0 - smoothstep(4.0, 22.0, abs(vW.x))) * step(abs(vW.z), 800.0);
        col *= mix(1.0, shade, under*0.0 + 1.0);

        float nsh = texture2D(uNoise, p*0.0045 + vec2(t*0.010, -t*0.006)).r;
        col *= 0.94 + nsh*0.12;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(0.46 + 0.22 * (1.0 - fres) + f * 0.46, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/**
 * 江面：沿 x 铺到场景尽头，z 向覆盖到护坡里侧，接缝藏在水下。
 */
export function buildRiver(scene) {
  const { mat, uni } = riverMaterial();
  const zHalf = RIVER.waterHalf + 74;
  const g = new THREE.PlaneGeometry(2 * RIVER.xTo, 2 * zHalf, 8, 8).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = WATER_Y;
  m.renderOrder = 3;
  m.name = 'river';
  scene.add(m);

  return {
    mesh: m, uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** 河床：水面半透之下得有个东西接着，不然看见天 */
export function buildRiverBed(scene, material) {
  const g = new THREE.PlaneGeometry(2 * RIVER.xTo + 400, 2 * (RIVER.waterHalf + 260), 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = -2.2;
  m.name = 'river-bed';
  scene.add(m);
  return m;
}
