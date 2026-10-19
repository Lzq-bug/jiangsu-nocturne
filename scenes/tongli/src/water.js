import * as THREE from 'three';
import { TOWN, LAKES } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0b1319);
export const FOG_DENSITY = 0.00062;

/* ------------------------------------------------------------------ reflections */

/** 水中镜像共用的晃动 */
class Wobble {
  constructor({ amp = 0.3, fade = 30 } = {}) {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.amp = amp;
    this.fade = fade;
    this.cache = new Map();
  }
  /** 每一层水面一份材质缓存：镜面高度不同，淡出的基准也不同 */
  materialFor(src, plane) {
    const key = `${src.uuid}@${plane.toFixed(2)}`;
    if (!this.cache.has(key)) this.cache.set(key, this.material(src, plane));
    return this.cache.get(key);
  }
  material(src, plane = WATER_Y) {
    const key = `${src.uuid}@${plane.toFixed(2)}`;
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
      shader.uniforms.uPlane = { value: plane };
      shader.vertexShader = `uniform float uTime; uniform float uRipple; uniform float uAmp;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wt = uTime;
          transformed.x += (sin(transformed.y*0.16 + wt*1.1) + sin(transformed.z*0.24 - wt*0.7)) * uAmp * uRipple;
          transformed.z += (sin(transformed.y*0.13 - wt*0.9) + sin(transformed.x*0.21 + wt*1.3)) * uAmp * 0.8 * uRipple;
        `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-uFade, -1.2, vWorldPosition.y - uPlane) * 0.9 + 0.1;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        varying vec3 vWorldPosition; uniform float uFade; uniform float uPlane;
        #include <common>`);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        varying vec3 vWorldPosition; uniform float uFade; uniform float uPlane;
        #include <common>`);
    };
    m.customProgramCacheKey = () => `tongli-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 镜像到水面以下的一份拷贝。加性的光斑与点云不参与——它们在水里会变成
 * 河面的一片白斑。倒影的可见深度按河宽给：镇内河只有几米宽，
 * 对岸的灯必须落在这一小条水里，不能像湖那样拖到远处。
 */
export class Reflections {
  constructor(scene, opts) {
    this.scene = scene;
    this.opts = opts;
    this.wobble = new Wobble(opts);
    this.planes = new Map();
    this.pairs = [];
  }
  /** 一层水一个镜面：镇河在 y=0，退思园的池在岸顶之下一点 */
  mirrorAt(y) {
    if (!this.planes.has(y)) {
      const root = new THREE.Group();
      root.name = 'reflections';
      const mirror = new THREE.Group();
      mirror.scale.set(1, -1, 1);
      mirror.position.y = 2 * y;
      root.add(mirror);
      this.scene.add(root);
      this.planes.set(y, { root, mirror });
    }
    return this.planes.get(y).mirror;
  }
  add(source, y = WATER_Y) {
    const clone = source.clone(true);
    clone.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      if (o.isPoints || /^(media|beam|halos|spill|glows|rake)/.test(o.name || '')) {
        o.visible = false;
        return;
      }
      o.castShadow = o.receiveShadow = false;
      if (o.isMesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => this.wobble.materialFor(m, y))
          : this.wobble.materialFor(o.material, y);
      }
    });
    this.mirrorAt(y).add(clone);
    this.pairs.push([source, clone]);
    return clone;
  }
  sync() {
    const skip = /^(media|beam|halos|spill|glows|rake)/;
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
  set enabled(v) { for (const { root } of this.planes.values()) root.visible = v; }
  get enabled() { const f = [...this.planes.values()][0]; return f ? f.root.visible : true; }
  update(t, ripple) {
    this.wobble.time.value = t;
    this.wobble.ripple.value = ripple;
    this.sync();
  }
}

/* ------------------------------------------------------------------ light columns */

/** 水面上每盏灯往下拖的一道加性光柱 */
export class LightColumns {
  constructor(scene, capacity = 420) {
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
          float wob = sin(wp.z*0.11 + uTime*1.2) * 0.8 + sin(wp.x*0.15 - uTime*0.9) * 0.5;
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
  add(pos, color, width = 1.1, depth = 7, intensity = 1, y = WATER_Y) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(),
      color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, on: true, y,
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
      d.position.set(it.pos.x, it.y - 0.08, it.pos.z);
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

function waterMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#03080c') },
    uShallow: { value: new THREE.Color('#13242b') },
    uTown: { value: new THREE.Vector3(TOWN.center.x, 0, TOWN.center.z) },
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
        // 镇内河只有几米宽，长波会在河面上糊成横带，所以只用短波
        float h = sin(p.x*0.15 + uTime*0.5)*0.09 + sin(p.y*0.13 - uTime*0.44)*0.11
                + sin((p.x+p.y)*0.31 + uTime*0.95)*0.055;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform vec3 uFog; uniform float uFogDensity; uniform vec3 uTown;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0030,0.0050,0.0108), vec3(0.0064,0.0108,0.0206), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.6);
        // 灯气从镇子那一边压过来：离镇心越近的方位越暖，湖对岸留冷
        vec2 tow = normalize(uTown.xz + 0.001);
        float townSide = smoothstep(-0.1, 0.9, dot(normalize(d.xz + 0.0001), tow));
        col += vec3(0.034,0.019,0.011) * haze * (0.30 + 0.85*townSide);
        col += vec3(0.006,0.013,0.020) * pow(max(0.0, dot(d, uMoon)), 32.0);
        return mix(col, vec3(0.0016,0.0024,0.0046), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // 水离得越近越要动：河窄，岸又全是灯
        float det = clamp(1.0 - length(cameraPosition - vW) / 150.0, 0.0, 1.0);
        float dx = cos(p.x*0.15 + t*0.5)*0.15*0.09 + cos((p.x+p.y)*0.31 + t*0.95)*0.31*0.055;
        float dz = cos(p.y*0.13 - t*0.44)*0.13*0.11 + cos((p.x+p.y)*0.31 + t*0.95)*0.31*0.055;
        float c1 = sin(p.x*0.39 + t*1.15) * sin(p.y*0.33 - t*0.95);
        float c2 = sin(p.x*0.65 - t*1.6 + p.y*0.47) * 0.6;
        dx += (c1*0.39 + c2*0.65) * 0.11 * uRipple * det;
        dz += (cos(p.x*0.31 - t*1.0)*0.31*0.9 + c2*0.47) * 0.11 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.10 + 0.28*fres);
        col = mix(col, skyAt(normalize(r)) * 1.42, 0.10 + 0.44*fres);

        // 月下的一条亮路：斜着穿过湖与河
        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.55, 0.995, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.30,0.36,0.48) * pow(ndh, 160.0) * (0.22 + lane*1.25);
        col += vec3(0.10,0.14,0.22) * pow(ndh, 28.0) * (0.07 + lane*0.40);

        float sparkle = pow(max(0.0, sin(p.x*1.35 + t*1.7) * sin(p.y*1.10 - t*1.4)), 14.0);
        col += vec3(0.16,0.19,0.23) * sparkle * 0.055 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.006 + vec2(t*0.006, -t*0.008)).r;
        col *= 0.94 + nsh*0.12;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(0.44 + 0.22 * (1.0 - fres) + f * 0.46, 0.0, 0.96);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/** 一条折线（[x,z]）按宽度 offset 成闭合多边形：沿河建筑与驳岸用它撑出带子 */
export function ribbonPolygon(pts, width) {
  const n = pts.length;
  const half = width / 2;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const L = Math.hypot(tx, tz) || 1;
    tx /= L; tz /= L;
    // 法向：+x 方向旋转 -90°
    const nx = tz, nz = -tx;
    left.push([pts[i][0] + nx * half, pts[i][1] + nz * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - nz * half]);
  }
  return left.concat(right.reverse());
}

function polyToShape(target, poly) {
  target.moveTo(poly[0][0], -poly[0][1]);
  for (let i = 1; i < poly.length; i++) target.lineTo(poly[i][0], -poly[i][1]);
  target.closePath();
}

/**
 * 一片连在一起的水：外圈是湖界，镇子泡在中间。
 * 河不 separately 挖——七块地（land.js 的岛）压在水面之上，块与块的缝
 * 天然就是河道，于是"川字河"与湖是同一张水面，桥洞、灯影与船都只对着一个 shader。
 */
export function buildWaters(scene) {
  const { mat, uni } = waterMaterial();
  const shape = new THREE.Shape();
  polyToShape(shape, LAKES.extent);

  const g = new THREE.ShapeGeometry(shape, 8);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = WATER_Y;
  m.renderOrder = 3;
  m.name = 'waters';
  scene.add(m);

  return {
    mesh: m, uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/**
 * 园子里的池：与镇河同一份 shader，只是镜面高度在岸顶之下。
 * 返回的东西交 main.js 每帧推一次。
 */
export function buildPond(scene, poly, y) {
  const { mat, uni } = waterMaterial();
  const shape = new THREE.Shape();
  polyToShape(shape, poly);
  const g = new THREE.ShapeGeometry(shape, 8);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.renderOrder = 3;
  m.name = 'pond';
  scene.add(m);
  return { mesh: m, uniforms: uni, y, update(t, ripple) { uni.uTime.value = t; uni.uRipple.value = ripple * 0.55; } };
}

/** 水底：水面半透明之下得有个东西接着，不然看见天 */
export function buildWaterBed(scene, material) {
  const e = LAKES.bed;
  const g = new THREE.PlaneGeometry(e.w, e.d).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.set(e.x, -3.2, e.z);
  m.name = 'water-bed';
  scene.add(m);
  return m;
}
