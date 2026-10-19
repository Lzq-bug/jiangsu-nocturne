import * as THREE from 'three';
import { LAKE } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0c141a);
export const FOG_DENSITY = 0.00055;

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
      opacity: src.emissiveMap ? 0.86 : 0.56,
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
    m.customProgramCacheKey = () => `yunlong-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 镜像到水面以下的一份拷贝。加性的光斑与点云不参与——它们在镜像里会变成
 * 湖面上的一片白斑。
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
  add(source) {
    const clone = source.clone(true);
    clone.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      if (o.isPoints || /^(media|beam|lantern-halos|lattice-spill|niche-glows|niche-rake|crane-halos)/.test(o.name || '')) {
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
    const skip = /^(media|beam|lantern-halos|lattice-spill|niche-glows|niche-rake|crane-halos)/;
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

/* ------------------------------------------------------------------ light columns */

/** 湖面上每盏灯往下拖的一道加性光柱 */
export class LightColumns {
  constructor(scene, capacity = 220) {
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
          float wob = sin(wp.z*0.09 + uTime*1.1) * 0.9 + sin(wp.x*0.13 - uTime*0.8) * 0.6;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.6;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.76 + 0.24*sin(uTime*1.7 + wp.x*0.16 + wp.z*0.21);
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
  add(pos, color, width = 1.2, depth = 9, intensity = 1) {
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

/* ------------------------------------------------------------------ 湖 */

function lakeMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#03080c') },
    uShallow: { value: new THREE.Color('#14252c') },
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
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        // 长波在低机位的湖面上会糊成一条一条的带子，所以只用短波
        float h = sin(p.x*0.13 + uTime*0.5)*0.1 + sin(p.y*0.11 - uTime*0.42)*0.12
                + sin((p.x+p.y)*0.27 + uTime*0.9)*0.06;
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
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0030,0.0048,0.0104), vec3(0.0062,0.0104,0.0200), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.6);
        // 城在山之东与北，灯气从那一侧压过来；湖面宽，这份暖必须收着才不像泥
        float east = smoothstep(0.15, 0.95, d.x);
        float north = smoothstep(0.25, -0.95, d.z);
        col += vec3(0.030,0.017,0.010) * haze * (0.35 + 0.7*east + 0.4*north);
        col += vec3(0.006,0.013,0.020) * pow(max(0.0, dot(d, uMoon)), 32.0);
        return mix(col, vec3(0.0016,0.0024,0.0046), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 260.0, 0.0, 1.0);
        float dx = cos(p.x*0.13 + t*0.5)*0.13*0.10 + cos((p.x+p.y)*0.27 + t*0.9)*0.27*0.06;
        float dz = cos(p.y*0.11 - t*0.42)*0.11*0.12 + cos((p.x+p.y)*0.27 + t*0.9)*0.27*0.06;
        float c1 = sin(p.x*0.34 + t*1.1) * sin(p.y*0.29 - t*0.9);
        float c2 = sin(p.x*0.58 - t*1.5 + p.y*0.41) * 0.6;
        dx += (c1*0.34 + c2*0.58) * 0.10 * uRipple * det;
        dz += (cos(p.x*0.27 - t*0.95)*0.27*0.9 + c2*0.41) * 0.10 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.10 + 0.28*fres);
        // 掠射角上湖是一面镜子，但镜子里的天本来就很暗，别把它调亮
        col = mix(col, skyAt(normalize(r)) * 1.45, 0.10 + 0.44*fres);

        // 月下有一条亮路：湖面宽，得让它一路铺到山脚
        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.55, 0.995, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.30,0.36,0.48) * pow(ndh, 160.0) * (0.25 + lane*1.3);
        col += vec3(0.10,0.14,0.22) * pow(ndh, 28.0) * (0.08 + lane*0.42);

        float sparkle = pow(max(0.0, sin(p.x*1.15 + t*1.6) * sin(p.y*0.94 - t*1.3)), 14.0);
        col += vec3(0.16,0.19,0.23) * sparkle * 0.05 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.006 + vec2(t*0.006, -t*0.008)).r;
        col *= 0.94 + nsh*0.12;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(0.42 + 0.24 * (1.0 - fres) + f * 0.46, 0.0, 0.96);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/**
 * 一片湖，东岸随山脚退让。Shape 的 y 是 -z（旋转后对齐世界）。
 */
export function buildLake(scene) {
  const { mat, uni } = lakeMaterial();
  const shape = new THREE.Shape();
  const S = LAKE.shore;
  shape.moveTo(S[0][0], -S[0][1]);
  for (let i = 1; i < S.length; i++) shape.lineTo(S[i][0], -S[i][1]);
  shape.lineTo(LAKE.xWest, -LAKE.zTo);
  shape.lineTo(LAKE.xWest, -LAKE.zFrom);
  shape.closePath();

  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = WATER_Y;
  m.renderOrder = 3;
  m.name = 'lake';
  scene.add(m);

  return {
    mesh: m, uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** 湖底：水面 transparency 之下得有个东西接着，不然看见天 */
export function buildLakeBed(scene, material) {
  const g = new THREE.PlaneGeometry(2400, 3200).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.set(-1180, -3.4, 0);
  m.name = 'lake-bed';
  scene.add(m);
  return m;
}

/** 旧名沿用：与 buildLake 同一份实现 */
export function buildWaters(scene) {
  const lake = buildLake(scene);
  return { meshes: [lake.mesh], uniforms: lake.uniforms, update: lake.update, lake };
}
