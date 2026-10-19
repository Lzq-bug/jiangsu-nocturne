/**
 * 濠河水面 + 荷池水面 + 水中光柱 + 倒影镜像。
 * 河是一条百米宽的护城河，不是湖：波纹频率比金鸡湖高、振幅小，
 * 沿街灯的光柱更短更密，风一过就散。
 */
import * as THREE from 'three';
import { RIVER, YUAN, MOON, FOG } from './data.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(FOG.color);
export const FOG_DENSITY = FOG.density;

/* ------------------------------------------------------------------ 倒影 */

/** 注入到镜像材质里的水波扰动 */
class Wobble {
  constructor() {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    // 夜里水里真正读得出来的是灯：MeshBasicMaterial 不吃 emissive，
    // 所以自发光材质要把 emissive 搬进 color，否则亮窗在倒影里是黑的。
    // 但带 emissiveMap 的（背景楼群那张灯窗图）必须留着贴图，不然整栋塔糊成一块白。
    const hasEmMap = !!src.emissiveMap;
    const em = !hasEmMap && src.emissive && src.emissiveIntensity > 0 && src.emissive.getHex() !== 0
      ? src.emissive.clone().multiplyScalar(Math.min(2.4, Math.max(0.4, src.emissiveIntensity)))
      : null;
    const c = em || (hasEmMap ? new THREE.Color(0xbfd4ea) : (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.8));
    const showMap = hasEmMap ? src.emissiveMap : (src.map || null);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: showMap, transparent: true,
      opacity: em ? 0.86 : (hasEmMap ? 0.8 : 0.6),
      depthWrite: false, side: THREE.DoubleSide, fog: true,
      blending: THREE.NormalBlending,
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
          // 护城河尺度：扰动物要沿着河道方向拉长，竖向切得比湖细
          transformed.x += (sin(transformed.y*0.15 + wt*1.3) + sin(transformed.z*0.2 - wt*0.8)) * 0.85 * uRipple;
          transformed.z += (sin(transformed.y*0.11 - wt*1.0) + sin(transformed.x*0.17 + wt*1.5)) * 0.7 * uRipple;
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
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-70.0, -1.0, vWorldPosition.y) * 0.92 + 0.08;
      `);
    };
    m.customProgramCacheKey = () => `haohe-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 绕 y=0 翻一份源组到水下。名字以 media- / beam- 开头的着色器面片跳过：
 * 它们被重建成 basic 材质后会塌成一块纯色。
 */
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
      if (/^(media|beam)/.test(o.name || '')) { o.visible = false; return; }
      o.castShadow = o.receiveShadow = false;
      if (o.isMesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((mm) => this.wobble.material(mm))
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
        const a = [], b = [];
        src.traverse((o) => a.push(o));
        clone.traverse((o) => b.push(o));
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (!/^media|^beam/.test(b[i].name || '')) b[i].visible = a[i].visible;
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

/* ------------------------------------------------------------------ 光柱 */

/** 每一盏临水的灯在水上拖下来的一条加法光柱 */
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
          float wob = sin(wp.z*0.12 + uTime*1.7) * 0.55 + sin(wp.x*0.1 - uTime*1.2) * 0.4;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 1.5;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.76 + 0.24*sin(uTime*2.1 + wp.x*0.5 + wp.z*0.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.08, vUv.y);
          gl_FragColor = vec4(vCol * uDepth, m * fade * vFlick * uStrength);
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
  add(pos, color, width = 2.4, depth = 20, intensity = 1) {
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
  setDepth(i, depth) {
    if (i < 0 || !this.items[i]) return;
    this.items[i].depth = depth;
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
      d.position.set(it.pos.x, WATER_Y - 0.3, it.pos.z);
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

/* ------------------------------------------------------------------ 水面 */

/**
 * 一条河的表皮：沿程长波 + 细碎浪，月光的亮带只在朝着月亮那面出现，
 * 远处交给 fog。alpha 随入射角走，俯视看见黑水、平视才让倒影透上来。
 */
function waterMaterial({ chop = 1, deep = '#040c16', shallow = '#0a1a2a', sparkle = 0.1, alpha = 0.30 } = {}) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: new THREE.Vector3(...MOON).normalize() },
    uChop: { value: chop },
    uDeep: { value: new THREE.Color(deep) },
    uShallow: { value: new THREE.Color(shallow) },
    uSparkle: { value: sparkle },
    uAlpha: { value: alpha },
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
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.052*uChop + uTime*0.5)*0.34
                + sin(p.y*0.085*uChop - uTime*0.42)*0.3
                + sin((p.x*0.7+p.y)*0.13*uChop + uTime*1.0)*0.12;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform float uChop; uniform float uSparkle;
      uniform float uAlpha;
      uniform vec3 uMoon; uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform vec3 uFog; uniform float uFogDensity;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.010,0.016,0.032), vec3(0.018,0.026,0.052), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2);
        // 城在河的对岸（-Z），暖钠灯压在那边的地平线上
        float city = smoothstep(0.30, -0.95, d.z);
        col += vec3(0.085,0.046,0.020) * haze * (0.5 + 1.7*city);
        col += vec3(0.016,0.030,0.044) * pow(max(0.0, dot(d, uMoon)), 26.0);
        return mix(col, vec3(0.004,0.006,0.011), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // 细碎浪在远处会闪成莫尔纹，随距离压掉
        float det = clamp(1.0 - length(cameraPosition - vW) / 130.0, 0.0, 1.0);
        float k = 0.052*uChop;
        float dx = cos(p.x*k + t*0.5)*k*0.34 + cos((p.x*0.7+p.y)*0.13*uChop + t)*0.13*uChop*0.7*0.12;
        float dz = cos(p.y*0.085*uChop - t*0.42)*0.085*uChop*0.3 + cos((p.x*0.7+p.y)*0.13*uChop + t)*0.13*uChop*0.12;
        float c1 = sin(p.x*1.15 + t*2.1) * sin(p.y*0.95 - t*1.7);
        float c2 = sin(p.x*2.05 - t*2.6 + p.y*1.4) * 0.6;
        dx += (c1*1.15 + c2*2.05) * 0.020 * uRipple * det;
        dz += (cos(p.x*0.92 - t*1.5)*0.92*0.9 + c2*1.4) * 0.020 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.16 + 0.34*fres);
        // 水面主要靠这层天空/镜像的镜面反射被读出来，压太低就成了一块黑板
        col = mix(col, skyAt(normalize(r)) * 0.95, 0.14 + 0.55*fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        vec3 mflat = normalize(vec3(uMoon.x, 0.0, uMoon.z));
        vec3 vflat = normalize(vec3(V.x, 0.0, V.z));
        float lane = smoothstep(0.66, 0.99, dot(vflat, mflat));
        col += vec3(0.38,0.44,0.58) * pow(ndh, 260.0) * (0.35 + lane*1.5);
        col += vec3(0.13,0.17,0.26) * pow(ndh, 42.0) * (0.10 + lane*0.5);

        float nsh = texture2D(uNoise, p*0.0075 + vec2(t*0.012, -t*0.016)).r;
        // 波光先乘噪声再点亮：两个正弦直接相乘会在河面上打出一张整齐的点子网格
        float spk = pow(max(0.0, sin(p.x*3.1 + t*2.6) * sin(p.y*2.7 - t*1.9)), 15.0) * smoothstep(0.42, 0.86, nsh);
        col += vec3(0.22,0.24,0.28) * spk * uSparkle * uRipple * det * det;

        col *= 0.97 + nsh*0.06;   // 噪声对比一高，128px 的平铺就在河面上打出格子

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(uAlpha + 0.24 * (1.0 - fres) + f * 0.30, 0.0, 0.94);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/** 濠河主水面：沿 X 铺开的河道带 */
export function buildRiver(scene) {
  const { southZ, northZ, halfWidth } = RIVER;
  const w = halfWidth * 2, d = southZ - northZ;
  const geo = new THREE.PlaneGeometry(w, d, 40, 30);
  geo.rotateX(-Math.PI / 2);
  const { mat, uni } = waterMaterial({ chop: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_Y, (southZ + northZ) / 2);
  mesh.renderOrder = 3;
  mesh.name = 'haohe-river';
  scene.add(mesh);

  // 两端收头：河在雾里断掉，用几块近黑的岸板压住边
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(60, d).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x060a12, transparent: true, opacity: 0.85, fog: true }));
    cap.position.set(sx * (halfWidth + 26), WATER_Y - 0.05, (southZ + northZ) / 2);
    cap.renderOrder = 2;
    scene.add(cap);
  }

  return {
    mesh,
    uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** 荷池：静水，波纹只有河的三分之一，颜色更闷 */
export function buildPool(scene) {
  const { cx, cz, hx, hz } = YUAN.pool;
  const geo = new THREE.PlaneGeometry(hx * 2, hz * 2, 16, 12);
  geo.rotateX(-Math.PI / 2);
  const { mat, uni } = waterMaterial({ chop: 0.55, deep: '#06100f', shallow: '#0d1c1a', sparkle: 0.05, alpha: 0.22 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, 0.14, cz);
  mesh.renderOrder = 3;
  mesh.name = 'haohe-pool';
  scene.add(mesh);
  // 池底故意留空：倒影像素要能一路看穿到水下的镜像，铺一层底就把它切断了
  return {
    mesh,
    uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple * 0.45;
    },
  };
}

/** 把 anchors（{pos,color,width,depth,intensity}）灌进光柱系统 */
export function columnsFrom(columns, anchors) {
  const out = [];
  for (const a of anchors) {
    const p = Array.isArray(a.pos) ? new THREE.Vector3(...a.pos) : a.pos.clone();
    out.push(columns.add(new THREE.Vector3(p.x, 0, p.z), a.color, a.width || 2.4, a.depth || 18, a.intensity ?? 1));
  }
  return out;
}

