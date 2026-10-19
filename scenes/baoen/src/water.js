/**
 * 两处水：香水河（横贯中轴）与放生池（塔院西南）。
 * 两者共用一块水面 shader，只是把"岸距"约束从单向改成 x、z 双向——池是方的，
 * 河是长条，池的四面都要收口。
 */
import * as THREE from 'three';
import { RIVER, POOL, WATER_Y } from './data.js';
import { MOON_DIR } from './environment.js';
import * as T from '../../src/textures.js';

class Wobble {
  constructor() {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(1.05);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: src.map || null, transparent: true, opacity: 0.82,
      depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.NormalBlending,
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
        gl_FragColor.a *= smoothstep(-52.0, -1.0, vWorldPosition.y) * 0.9 + 0.1;
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
    m.customProgramCacheKey = () => 'baoen-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 镜像源。大地面（地坪、街市、窑场）一律不 add，否则倒影里多出一张巨大染色平面。
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

/** 灯在水面上的加色光柱 */
export class LightColumns {
  constructor(scene, capacity = 900) {
    this.items = [];
    this.dirty = true;
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
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.1, vUv.y);
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
  add(pos, color, width = 1.1, depth = 9, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, on: true,
    });
    this.dirty = true;
    return this.items.length - 1;
  }
  setPos(i, pos) {
    if (i < 0 || !this.items[i]) return;
    this.items[i].pos.copy(pos);
    this.dirty = true;
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

/**
 * 一块水面。chan = [中心, 半宽]，两轴各一组；离岸越近越油黑。
 */
export function buildWater(scene, { x, z, wx, wz, chanX, chanZ, name, moonDir = MOON_DIR }) {
  const geo = new THREE.PlaneGeometry(wx, wz, 110, 40);
  geo.rotateX(-Math.PI / 2);
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: moonDir.clone() },
    uChanX: { value: new THREE.Vector2(chanX[0], chanX[1]) },
    uChanZ: { value: new THREE.Vector2(chanZ[0], chanZ[1]) },
    uDeep: { value: new THREE.Color('#01050c') },
    uShallow: { value: new THREE.Color('#061120') },
    uNoise: { value: T.noise() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.16 + uTime*0.9)*0.10 + sin(p.y*0.11 - uTime*0.65)*0.12
                + sin((p.x+p.y)*0.31 + uTime*1.5)*0.05;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec2 uChanX; uniform vec2 uChanZ; uniform vec3 uDeep; uniform vec3 uShallow;
      uniform sampler2D uNoise;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.009,0.020), vec3(0.013,0.018,0.042), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        float warm = smoothstep(-0.3,0.9, d.z*0.7 + d.x*0.3);
        col += vec3(0.011,0.005,0.002) * haze * (0.3 + 0.8*warm);
        col += vec3(0.022,0.026,0.040) * pow(max(0.0,dot(d,uMoon)), 30.0);
        return mix(col, vec3(0.003,0.004,0.008), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 130.0, 0.0, 1.0);
        float dx = cos(p.x*0.16 + t*0.9)*0.16*0.10 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        float dz = cos(p.y*0.11 - t*0.65)*0.11*0.12 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
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
        float lane = smoothstep(0.55, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.42,0.48,0.62) * pow(ndh, 420.0) * (0.5 + lane*1.6);
        col += vec3(0.16,0.20,0.30) * pow(ndh, 60.0) * (0.12 + lane*0.5);

        float sparkle = pow(max(0.0, sin(p.x*7.3 + t*3.1) * sin(p.y*6.1 - t*2.4)), 12.0);
        col += vec3(0.22,0.24,0.28) * sparkle * 0.03 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.014 + vec2(t*0.02, -t*0.03)).r;
        col *= 0.95 + nsh*0.1;

        // 贴岸的一圈收暗、带上岸上灯火的暖回照；水心保持冷黑
        float ex = 1.0 - smoothstep(uChanX.y - 2.0, uChanX.y + 0.5, abs(p.x - uChanX.x));
        float ez = 1.0 - smoothstep(uChanZ.y - 2.0, uChanZ.y + 0.5, abs(p.y - uChanZ.x));
        float bank = 1.0 - min(ex, ez);
        col *= 1.0 - 0.22 * bank;
        col += vec3(0.022, 0.011, 0.004) * bank * 0.3;

        float a = clamp(0.55 + fres * 0.2, 0.0, 0.8);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, WATER_Y, z);
  mesh.renderOrder = 3;
  mesh.name = name;
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

export function buildWaters(scene) {
  const river = buildWater(scene, {
    x: 0, z: RIVER.at, wx: RIVER.length, wz: RIVER.halfWidth * 2 + 3,
    chanX: [0, RIVER.length / 2 - 6], chanZ: [RIVER.at, RIVER.halfWidth],
    name: 'xiangshui-river',
  });
  const pool = buildWater(scene, {
    x: (POOL.x0 + POOL.x1) / 2, z: (POOL.z0 + POOL.z1) / 2,
    wx: POOL.x1 - POOL.x0, wz: POOL.z1 - POOL.z0,
    chanX: [(POOL.x0 + POOL.x1) / 2, (POOL.x1 - POOL.x0) / 2],
    chanZ: [(POOL.z0 + POOL.z1) / 2, (POOL.z1 - POOL.z0) / 2],
    name: 'fangsheng-pool',
  });
  return {
    meshes: [river, pool],
    update(t, ripple) {
      river.update(t, ripple);
      pool.update(t, ripple);
    },
  };
}
