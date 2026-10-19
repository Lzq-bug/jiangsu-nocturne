import * as THREE from 'three';
import { MOON_DIR, FOG } from './environment.js';
import { elev, depthTexture, MAP_HALF } from './terrain.js';
import * as T from './textures.js';

export const WATER_Y = 0;

/* ------------------------------------------------------------------ mirrored lights */

/** shared wobble injected into any mirrored material */
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
      color: c, map: src.map || null, transparent: true, opacity: 0.3,
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
          transformed.x += (sin(transformed.y*0.16 + wt*1.1) + sin(transformed.z*0.19 - wt*0.8)) * 0.5 * uRipple;
          transformed.z += (sin(transformed.y*0.14 - wt*0.9) + sin(transformed.x*0.21 + wt*1.3)) * 0.4 * uRipple;
        `);
      // fade the mirror out as it sinks below the surface
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-60.0, -1.0, vWorldPosition.y) * 0.92 + 0.08;
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
    m.customProgramCacheKey = () => 'taihu-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/** mirrored copy of a source group, sitting under the water plane */
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
      // clone(true) walks the tree in the same order, so visibility can be mirrored
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

/** additive light columns dragged down the water under every lamp */
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
          float wob = sin(wp.z*0.19 + uTime*1.5) * 0.7 + sin(wp.x*0.27 - uTime*1.05) * 0.5;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 0.9*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 1.7;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.72 + 0.28*sin(uTime*2.2 + wp.x*0.9 + wp.z*1.1);
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
    // the shader reads instanceColor, so it must exist before the program is compiled
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  /** returns an index you can later move with setPos() */
  add(pos, color, width = 1.1, depth = 9, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, on: true,
    });
    this.dirty = true;
    return i;
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
      d.position.set(it.pos.x, WATER_Y - 0.12, it.pos.z);
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

/* ------------------------------------------------------------------ lake surface */

/** polar grid: dense over the spit, ~4.4 km out — far enough that the fog hides the rim */
function lakeGeometry() {
  const rings = 30, seg = 120;
  const pos = [], uv = [], idx = [];
  const cx = 0, cz = 150;
  for (let r = 0; r <= rings; r++) {
    const rad = 7 * Math.pow(1.24, r) - 5;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      pos.push(x, 0, z);
      uv.push((x + MAP_HALF) / (2 * MAP_HALF), (z + MAP_HALF) / (2 * MAP_HALF));
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1;
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

export function buildWater(scene) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#01050c') },
    uShallow: { value: new THREE.Color('#0b2026') },
    uFog: { value: FOG.color.clone() },
    uFogK: { value: FOG.density },
    uNoise: { value: T.noise() },
    uDepthMap: { value: depthTexture() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW; varying vec2 vUvw;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.021 + uTime*0.55)*0.42 + sin(p.y*0.017 - uTime*0.42)*0.36
                + sin((p.x*0.6+p.y)*0.05 + uTime*1.1)*0.12;
        wp.y += h * uRipple;
        vW = wp.xyz;
        vUvw = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFog; uniform float uFogK;
      uniform sampler2D uNoise; uniform sampler2D uDepthMap;
      varying vec3 vW; varying vec2 vUvw;

      // 与天穹 shader 同一套配色，水面才接得上地平线
      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0032,0.0050,0.0145), vec3(0.0085,0.013,0.032), smoothstep(0.5,0.82,up));
        col = mix(col, vec3(0.017,0.020,0.031), smoothstep(0.52,0.30,up));
        float low = pow(clamp(1.0-abs(d.y)*2.2,0.0,1.0), 2.4) * smoothstep(-0.04,0.10,d.y);
        vec3 city = normalize(vec3(0.62,0.0,-0.78));
        col += vec3(0.040,0.021,0.010) * low * pow(max(0.0,dot(d,city)), 2.2) * 1.2;
        col += vec3(0.062,0.076,0.11) * pow(max(0.0,dot(d,uMoon)), 30.0) * 1.1;
        return mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0,-0.05,d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float dist = length(cameraPosition - vW);
        // 高频碎浪在远处会摩尔纹，逐级交给中浪与长涌
        float det = clamp(1.0 - dist / 190.0, 0.0, 1.0);
        float mid = clamp(1.0 - dist / 900.0, 0.0, 1.0);

        float dx = cos(p.x*0.021 + t*0.55)*0.021*0.42 + cos((p.x*0.6+p.y)*0.05 + t*1.1)*0.03*0.12;
        float dz = cos(p.y*0.017 - t*0.42)*0.017*0.36 + cos((p.x*0.6+p.y)*0.05 + t*1.1)*0.05*0.12;
        float m1 = sin(p.x*0.13 + t*0.9) * sin(p.y*0.11 - t*0.7);
        dx += m1*0.13*0.30*uRipple*mid;
        dz += cos(p.y*0.11 - t*0.7)*0.11*0.30*uRipple*mid;
        float c1 = sin(p.x*1.05 + t*2.3) * sin(p.y*0.92 - t*1.9);
        float c2 = sin(p.x*2.0 - t*3.1 + p.y*1.5) * 0.6;
        dx += (c1*1.05 + c2*2.0) * 0.030 * uRipple * det;
        dz += (cos(p.x*0.88 - t*1.7)*0.88*0.9 + c2*1.5) * 0.030 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        // 烘进纹理的地形高度，解回米
        float e = texture2D(uDepthMap, vUvw).r * 32.0 - 24.0;
        float shallow = smoothstep(-9.0, -0.6, e);

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.2);
        vec3 r = reflect(-V, n);
        r.y = abs(r.y);
        vec3 col = mix(uDeep, uShallow, shallow*0.72 + fres*0.28);
        col = mix(col, skyAt(r) * 0.55, 0.14 + 0.40*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        // 落月：银带只铺在朝着月亮的那条水道上，不是整面湖泛白
        float lane = smoothstep(0.30, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.55,0.60,0.74) * pow(ndh, 300.0) * (0.30 + lane*2.3);
        col += vec3(0.16,0.20,0.30) * pow(ndh, 44.0) * (0.10 + lane*0.70);

        // 碎浪只有几十米内才看得见：再远就是亚像素，混叠成一片雪花
        float close = clamp(1.0 - dist / 70.0, 0.0, 1.0);
        float sparkle = pow(max(0.0, sin(p.x*4.1 + t*2.6) * sin(p.y*3.7 - t*2.1)), 24.0);
        col += vec3(0.24,0.26,0.30) * sparkle * 0.05 * uRipple * close * close;

        // 贴岸的泡沫随涌起落
        float foamDet = clamp(1.0 - dist / 700.0, 0.12, 1.0);
        float near = smoothstep(-3.0, -0.4, e);
        float sw = sin((p.x+p.y)*0.09 - t*0.7);
        float fmask = smoothstep(0.60, 0.95, texture2D(uNoise, p*0.02 + vec2(t*0.05, -t*0.04)).r);
        col += vec3(0.44,0.50,0.60) * near * fmask * (0.30 + 0.70*max(0.0, sw)) * foamDet;

        float nsh = texture2D(uNoise, p*0.0035 + vec2(t*0.012, -t*0.016)).r;
        col *= 0.95 + nsh*0.1;

        // 远处的水由自己的雾接管，与 scene.fog 同密度同色
        col = mix(col, uFog, clamp(1.0 - exp(-pow(dist*uFogK, 2.0)), 0.0, 1.0));

        gl_FragColor = vec4(col, clamp(0.88 + fres*0.10, 0.0, 0.99));
        #include <tonemapping_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(lakeGeometry(), mat);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 3;
  mesh.name = 'taihu-water';
  mesh.frustumCulled = false;
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

/* ------------------------------------------------------------------ surf against the rock */

/**
 * 鼋渚春涛：沿岸线铺一圈泡沫面片，涌上来的时候才亮。
 * 朝太湖（南、西）的一侧浪大，内湖那一侧几乎只是轻拍。
 */
export class Surf {
  constructor(scene, { count = 220 } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uRipple: { value: 1 }, uMap: { value: T.foam() } },
      vertexShader: `
        attribute float aPhase; attribute float aPower;
        uniform float uTime; uniform float uRipple;
        varying vec2 vUv; varying float vOn;
        void main(){
          float beat = sin(uTime*0.8 + aPhase*6.283);
          vOn = smoothstep(0.10, 0.92, beat) * aPower * (0.35 + 0.65*uRipple);
          vec3 lp = position;
          lp.xz *= 0.7 + 0.55*max(0.0, beat);
          vec4 wp = instanceMatrix * vec4(lp, 1.0);
          wp.y += 0.18 + beat*0.4;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec2 vUv; varying float vOn;
        void main(){
          // 贴图本身横向是碎的泡沫、纵向是渐隐，所以两个方向都要用
          float m = texture2D(uMap, vUv).a;
          float along = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          gl_FragColor = vec4(vec3(0.74,0.82,0.94), m * along * vOn * 0.24);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, this.mat, count);
    mesh.name = 'surf';
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.count = 0;
    const phase = new Float32Array(count);
    const power = new Float32Array(count);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aPower', new THREE.InstancedBufferAttribute(power, 1));
    scene.add(mesh);

    // 1) 找出所有贴岸的候选点  2) 等步长抽稀，让泡沫沿整条岸线均匀分布而不是挤在起点
    const cands = [];
    const step = 4.5;
    for (let x = -300; x <= 460; x += step) {
      for (let z = -260; z <= 360; z += step) {
        const e = elev(x, z);
        if (Math.abs(e) > 0.8) continue;
        const gx = elev(x + 2, z) - elev(x - 2, z);
        const gz = elev(x, z + 2) - elev(x, z - 2);
        if (Math.hypot(gx, gz) / 4 < 0.12) continue;   // 只有陡岸才配得上浪
        const nx = -gz, nz = gx;
        const nl = Math.hypot(nx, nz) || 1;
        const intoLake = Math.max(0, ((nx / nl) * -0.42 + (nz / nl) * 0.9));
        cands.push({
          x, z, angle: Math.atan2(nz, nx) + Math.PI / 2,
          w: 4 + Math.random() * 6, d: 2.5 + Math.random() * 3,
          power: Math.min(1, (0.22 + 0.9 * intoLake) * (0.6 + Math.random() * 0.7)),
          phase: Math.random(),
        });
      }
    }
    const stride = Math.max(1, Math.ceil(cands.length / count));
    const d = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < cands.length && k < count; i += stride) {
      const c = cands[i];
      d.position.set(c.x, 0.1, c.z);
      d.rotation.set(0, c.angle, 0);
      d.scale.set(c.w, 1, c.d);
      d.updateMatrix();
      mesh.setMatrixAt(k, d.matrix);
      phase[k] = c.phase;
      power[k] = c.power;
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    this.mesh = mesh;
    this.uni = this.mat.uniforms;
  }
  update(t, ripple) {
    this.uni.uTime.value = t;
    this.uni.uRipple.value = ripple;
  }
}
